/**
 * Netlify + Railway provisioner.
 *
 * Uses each platform's own CLI rather than Terraform, so nothing has to be
 * clicked in a dashboard first: the frontends are built locally and their
 * dist/ folders are pushed straight up to Netlify. The API is deployed via
 * GitHub: the installer commits and pushes the code, then links the Railway
 * service to the repo so Railway builds and runs it automatically.
 *
 * Every step is idempotent and recorded in .deploy-state.json, so re-running
 * after a failure resumes instead of starting over.
 *
 * Order matters, because each step feeds the next:
 *   Railway project → Postgres → migrations → GitHub push → API service (linked)
 *   → API URL → build the frontends with that URL → Netlify sites → CORS → done
 *
 * Verified against railway 5.x and netlify-cli 27.x. Where an older CLI used a
 * different spelling, the modern form is tried first and the legacy one is the
 * fallback.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import {
  ask, c, capture, cmdEcho, confirm, fail, note, ok, run, say, step, warn,
} from './cli.mjs'

const STATE_FILE = '.deploy-state.json'

const loadState = (root) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8'))
  } catch {
    return {}
  }
}

const saveState = (root, state) =>
  fs.writeFileSync(path.join(root, STATE_FILE),
                   `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })

/** Run a CLI step, echoing it, surfacing the error if it fails. */
function cli(bin, args, { cwd, timeout = 600000, quiet = false } = {}) {
  if (!quiet) cmdEcho([bin, ...args].join(' '))
  const result = capture(bin, args, { cwd, timeout })
  if (!result.ok && !quiet) {
    const detail = result.stderr || result.stdout || result.error?.message || ''
    if (detail) note(detail.split('\n').slice(0, 6).join('\n    '))
  }
  return result
}

function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch { /* fall through */ }
  const start = text.indexOf('{')
  const startArr = text.indexOf('[')
  const from = start === -1 ? startArr
    : (startArr === -1 ? start : Math.min(start, startArr))
  if (from === -1) return null
  try {
    return JSON.parse(text.slice(from))
  } catch {
    return null
  }
}

const firstUrl = (text) => {
  const m = (text || '').match(/https?:\/\/[^\s"',)]+/)
  return m ? m[0].replace(/[.,)]+$/, '') : null
}

const suffix = () => crypto.randomBytes(2).toString('hex')
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * The Railway CLI renames flags and subcommands between majors: `--yes` on
 * `up` and `--port` on `domain` are 5.x only, and `variable set` replaced
 * `variables --set`. Rather than pinning a version, try the modern spelling
 * first and fall back through older ones, but only when the failure actually
 * looks like a flag the CLI does not know.
 */
const UNKNOWN_FLAG = /unexpected argument|unrecognized subcommand|unknown (flag|option)|invalid (flag|option)|Found argument .* which wasn't expected/i

function tryVariants(bin, variants, options = {}) {
  let last = null
  for (const [index, args] of variants.entries()) {
    const quiet = index < variants.length - 1
    const result = cli(bin, args, { ...options, quiet })
    if (result.ok) return result
    last = result
    const output = `${result.stderr}\n${result.stdout}`
    if (!UNKNOWN_FLAG.test(output)) return result   // a real failure, not drift
    if (index < variants.length - 1) {
      note(`That flag is not in this CLI version; trying the older spelling.`)
    }
  }
  return last
}

/* ========================================================================== */
export async function provisionNetlifyRailway({
  root, config, unattended = false, dryRun = false,
}) {
  const state = loadState(root)
  const record = (key, value) => {
    state[key] = value
    if (!dryRun) saveState(root, state)
  }

  const prefix = config.sitePrefix || 'openadms'
  const names = {
    backOffice: `${prefix}-back-office`,
    field: `${prefix}-field`,
  }

  if (dryRun) {
    step('Dry run')
    note('These are the commands that would run, in order. Nothing is executed.')
    const plan = [
      `railway init --name ${prefix} --json`,
      'railway add --database postgres --json',
      'railway variable list --service Postgres --json      # read DATABASE_PUBLIC_URL',
      './database/setup.sh --with-demo --test               # 13 migrations + 64 assertions',
      'git add --all && git commit -m "chore: initial deploy commit"',
      'git push origin HEAD                                  # push code to GitHub',
      `railway add --service api --repo <owner/repo> --branch main`,
      'railway variable set DATABASE_URL=... JWT_SECRET=... ... --service api --skip-deploys',
      'railway service redeploy --service api --yes          # trigger first build',
      'railway domain --service api --port 8080',
      'cd frontend && VITE_API_URL=<api> npm run build',
      'cd mobile   && VITE_API_URL=<api> npm run build',
      `cd frontend && netlify sites:create --name ${names.backOffice}`,
      'cd frontend && netlify deploy --prod --no-build --dir dist --json',
      `cd mobile   && netlify sites:create --name ${names.field}`,
      'cd mobile   && netlify deploy --prod --no-build --dir dist --json',
      'railway variable set CORS_ORIGIN_REGEX=<from the real site URLs> --service api',
    ]
    plan.forEach((p) => note(p))
    return { ok: true, dryRun: true, plan, state }
  }

  /* ------------------------------------------------------- 1. Railway project */
  step('Railway project')

  if (state.railwayProject) {
    ok(`Already linked to "${state.railwayProject}"`)
  } else {
    const linked = cli('railway', ['status', '--json'], { cwd: root, quiet: true, timeout: 40000 })
    const existing = parseJson(linked.stdout)?.name

    if (linked.ok && existing) {
      ok(`This directory is already linked to "${existing}"`)
      record('railwayProject', existing)
    } else {
      let created = cli('railway', ['init', '--name', prefix, '--json'], { cwd: root, timeout: 120000 })

      // Outside a terminal Railway wants an explicit workspace.
      if (!created.ok && /workspace/i.test(created.stderr || '')) {
        warn('Railway needs to know which workspace to create the project in.')
        const workspace = await ask('Workspace name or ID', { unattended })
        if (workspace) {
          created = cli('railway',
                        ['init', '--name', prefix, '--workspace', workspace, '--json'],
                        { cwd: root, timeout: 120000 })
        }
      }

      if (!created.ok) {
        fail('Could not create the Railway project.')
        note('Create it by hand, then re-run this. It will pick up the link:')
        note(`  railway init --name ${prefix}`)
        return { ok: false, state }
      }
      record('railwayProject', parseJson(created.stdout)?.name || prefix)
      ok(`Created Railway project "${state.railwayProject}"`)
    }
  }

  /* ---------------------------------------------------------- 2. Postgres */
  step('Postgres')

  let databaseUrl = state.databaseUrl || ''

  if (config.bringYourOwnDatabase && config.databaseUrl) {
    databaseUrl = config.databaseUrl
    record('databaseUrl', databaseUrl)
    ok('Using the database you supplied; not provisioning one')
  } else if (databaseUrl) {
    ok('Postgres already provisioned')
  } else {
    const added = cli('railway', ['add', '--database', 'postgres', '--json'],
                      { cwd: root, timeout: 300000 })
    if (!added.ok) {
      fail('Could not add Postgres.')
      note('Add it in the Railway dashboard, then re-run with the connection string:')
      note('  npm run deploy:netlify -- --database-url="postgresql://..."')
      return { ok: false, state }
    }
    ok('Postgres service created')

    // The public proxy URL is the one that works from this laptop; the API
    // gets the internal one via a Railway reference variable.
    //
    // Two things make this fiddly: the variables command was renamed between
    // CLI 4 (`railway variables`) and 5 (`railway variable list`), and the
    // database takes a few seconds to finish provisioning, so the first read
    // often comes back empty. Try both spellings, both output formats, and
    // give it time before giving up and asking.
    const readDatabaseUrl = () => {
      for (const service of ['Postgres', 'postgres', 'postgresql', 'PostgreSQL']) {
        const attempts = [
          ['variable', 'list', '--service', service, '--json'],   // CLI 5
          ['variables', '--service', service, '--json'],          // CLI 4
          ['variable', 'list', '--service', service, '--kv'],     // CLI 5, KV
          ['variables', '--service', service, '--kv'],            // CLI 4, KV
        ]

        for (const args of attempts) {
          const result = cli('railway', args, { cwd: root, quiet: true, timeout: 90000 })
          if (!result.stdout) continue

          const parsed = parseJson(result.stdout)
          if (parsed && typeof parsed === 'object') {
            const hit = parsed.DATABASE_PUBLIC_URL || parsed.DATABASE_URL
            if (hit && /^postgres/i.test(hit)) return hit
          }

          // KV output: KEY=value per line.
          const kv = result.stdout.match(
            /^DATABASE_PUBLIC_URL=(.+)$/m) || result.stdout.match(/^DATABASE_URL=(.+)$/m)
          if (kv && /^postgres/i.test(kv[1].trim())) return kv[1].trim()

          // Last resort: any postgres URL in the output at all.
          const loose = result.stdout.match(/postgres(ql)?:\/\/[^\s"',]+/)
          if (loose) return loose[0]
        }
      }
      return null
    }

    let found = null
    const waits = [0, 3000, 5000, 8000, 12000, 15000]
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (waits[attempt]) {
        note(`Waiting for Postgres to finish provisioning (${attempt}/${waits.length - 1})`)
        await sleep(waits[attempt])
      }
      found = readDatabaseUrl()
      if (found) break
    }

    if (!found) {
      warn('Postgres is up but the CLI did not return a connection string.')
      note('Railway dashboard, Postgres service, Variables tab, copy DATABASE_PUBLIC_URL.')
      found = await ask('DATABASE_PUBLIC_URL', {
        unattended,
        validate: (v) => (/^postgres(ql)?:\/\//i.test(v)
          ? null : 'Must be a full postgresql:// connection string.'),
      })
    }

    databaseUrl = found
    record('databaseUrl', databaseUrl)
    ok('Postgres ready')
  }

  /* ------------------------------------------------------------ 3. Schema */
  step('Database schema')

  if (state.migrated) {
    ok('Schema already applied')
  } else {
    const withDemo = unattended
      ? Boolean(config.demo)
      : await confirm('Seed the worked demo project as well?', true)

    const args = ['./setup.sh']
    if (withDemo) args.push('--with-demo')
    args.push('--test')

    const result = run('bash', args, {
      cwd: path.join(root, 'database'),
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        ADMS_INSTANCE_NAME: config.instanceName,
        ADMS_ORGANIZATION: config.organization || '',
      },
    })

    if (!result.ok) {
      fail('The schema setup did not finish.')
      note('Migrations are idempotent, so fix the error above and re-run.')
      return { ok: false, state }
    }
    record('migrated', true)
    ok('Schema applied and verified')
  }

  /* -------------------------------------------------------- 4. GitHub push */
  step('GitHub — pushing code')

  // Railway builds from the GitHub repo, so the code must be there before the
  // service is linked. We commit anything untracked/modified and push. This is
  // intentionally a "get it there" push rather than a curated commit; the
  // operator can tidy history afterwards.
  if (state.githubPushed) {
    ok('Code already pushed to GitHub')
  } else {
    // Discover the remote URL so we can tell Railway which repo to watch.
    const remoteResult = cli('git', ['remote', 'get-url', 'origin'], { cwd: root, quiet: true })
    if (!remoteResult.ok || !remoteResult.stdout) {
      fail('No git remote named "origin" found.')
      note('Create a GitHub repo and add it as a remote, then re-run:')
      note('  gh repo create <name> --public --source . --remote origin --push')
      return { ok: false, state }
    }

    // Normalise the remote to owner/repo format (works for both https and ssh).
    const rawRemote = remoteResult.stdout.trim()
    const repoSlug = rawRemote
      .replace(/^git@github\.com:/, '')
      .replace(/^https:\/\/github\.com\//, '')
      .replace(/\.git$/, '')
    record('githubRepo', repoSlug)

    // Stage everything that isn't already committed, then commit and push.
    // If the tree is already clean this is a no-op (git exits 0 on a clean push).
    const statusResult = cli('git', ['status', '--porcelain'], { cwd: root, quiet: true })
    const hasChanges = Boolean(statusResult.stdout?.trim())

    if (hasChanges) {
      // Respect any existing .gitignore; only add if missing.
      const gitignorePath = path.join(root, '.gitignore')
      let gitignore = ''
      try { gitignore = fs.readFileSync(gitignorePath, 'utf8') } catch { /* new file */ }
      const needsIgnore = (entry) => !gitignore.split('\n').some((l) => l.trim() === entry)
      const toAdd = ['.deploy-state.json', 'backend/.env', '.instance', 'node_modules']
        .filter(needsIgnore)
      if (toAdd.length) {
        fs.writeFileSync(gitignorePath,
          `${gitignore}${gitignore.endsWith('\n') ? '' : '\n'}${toAdd.join('\n')}\n`)
        ok('Updated .gitignore with sensitive/runtime files')
      }

      const added = cli('git', ['add', '--all'], { cwd: root })
      if (!added.ok) {
        fail('git add failed.')
        return { ok: false, state }
      }

      const committed = cli('git', ['commit', '-m', 'chore: initial deploy commit [openadms setup]'],
                            { cwd: root })
      // exit 1 with "nothing to commit" is fine — treat as success.
      if (!committed.ok && !/nothing to commit/i.test(committed.stdout + committed.stderr)) {
        fail('git commit failed.')
        note(committed.stderr || committed.stdout)
        return { ok: false, state }
      }
    }

    const pushed = cli('git', ['push', 'origin', 'HEAD'], { cwd: root, timeout: 120000 })
    if (!pushed.ok) {
      fail('git push failed.')
      note(pushed.stderr || pushed.stdout)
      note('Make sure you have push access to the remote and try again.')
      return { ok: false, state }
    }

    record('githubPushed', true)
    ok(`Pushed to github.com/${repoSlug}`)
  }

  const repoSlug = state.githubRepo

  /* -------------------------------------------------------- 5. API service */
  step('API service')

  let apiUrl = state.apiUrl || ''

  if (apiUrl) {
    ok(`API already deployed at ${apiUrl}`)
  } else {
    const variables = {
      // When Railway provisions the database, reference the service so the API
      // talks to it over the internal network. When the operator supplied their
      // own connection string there may be no Postgres service to reference, so
      // use the literal value they gave.
      DATABASE_URL: config.bringYourOwnDatabase && databaseUrl
        ? databaseUrl
        : '${{Postgres.DATABASE_URL}}',
      JWT_SECRET: config.jwtSecret,
      INSTANCE_KEY: config.instanceKey,
      ENVIRONMENT: 'production',
      PORT: '8080',
      LOG_LEVEL: 'info',
      CORS_ORIGIN_REGEX:
        `^https://([a-z0-9-]+--)?${prefix}-(back-office|field)\\.netlify\\.app$`,
    }

    if (!state.apiService) {
      // Create the service already linked to the GitHub repo so Railway builds
      // from source immediately. --repo links it; --branch targets main.
      // The Railway CLI's `add --service` with `--repo` and `--branch` is 5.x+.
      // Fall back to creating an empty service and then connecting the source.
      let serviceOk = false

      const withRepo = cli('railway',
        ['add', '--service', 'api', '--repo', repoSlug, '--branch', 'main'],
        { cwd: root, timeout: 180000 })

      if (withRepo.ok) {
        serviceOk = true
        ok('API service created and linked to GitHub repo')
      } else if (UNKNOWN_FLAG.test(withRepo.stderr + withRepo.stdout)) {
        // Older CLI: create first, then connect source separately.
        note('CLI does not support --repo on add; creating service then connecting source.')
        const created = cli('railway', ['add', '--service', 'api', '--json'],
                            { cwd: root, timeout: 180000 })
        if (created.ok) {
          const connected = cli('railway',
            ['service', 'source', 'connect',
             '--repo', repoSlug, '--branch', 'main', '--service', 'api'],
            { cwd: root, timeout: 180000 })
          if (connected.ok) {
            serviceOk = true
            ok('API service created and source connected to GitHub repo')
          } else {
            warn('Could not connect the GitHub source automatically.')
            note('In the Railway dashboard: api service → Settings → Source → Connect Repo')
            note(`Repo: ${repoSlug}  Branch: main`)
            note('Once connected, re-run this script.')
            return { ok: false, state }
          }
        }
      }

      if (!serviceOk) {
        fail('Could not create the API service.')
        note('Create a service named "api" in the Railway dashboard, connect it to:')
        note(`  Repo: ${repoSlug}   Branch: main`)
        note('Then re-run this script.')
        return { ok: false, state }
      }

      record('apiService', 'api')
    } else {
      // Service already exists but may not have a source connected yet (e.g. a
      // previous run created it without --repo). Ensure the source is linked.
      const connected = cli('railway',
        ['service', 'source', 'connect',
         '--repo', repoSlug, '--branch', 'main', '--service', 'api'],
        { cwd: root, quiet: true, timeout: 180000 })
      if (connected.ok) {
        ok('GitHub source connected to existing API service')
      }
      // If it fails here it was probably already connected; continue.
    }

    // Set every time, not only at creation, so a resumed run repairs anything
    // that drifted. --skip-deploys avoids one redeploy per variable.
    const pairs = Object.entries(variables).map(([k, v]) => `${k}=${v}`)
    const setVars = tryVariants('railway', [
      ['variable', 'set', ...pairs, '--service', 'api', '--skip-deploys'],
      ['variables', ...pairs.flatMap((pair) => ['--set', pair]),
       '--service', 'api', '--skip-deploys'],
      ['variables', ...pairs.flatMap((pair) => ['--set', pair]), '--service', 'api'],
    ], { cwd: root, timeout: 180000 })

    if (!setVars?.ok) {
      warn('Could not set the API environment variables from the CLI.')
      note('Set these on the api service in Railway, then re-run:')
      Object.keys(variables).forEach((k) => note(`  ${k}`))
      return { ok: false, state }
    }
    ok(`Set ${pairs.length} environment variables`)

    // Trigger the first build by redeploying (variables were set with
    // --skip-deploys, so Railway hasn't started a build yet).
    const redeployed = tryVariants('railway', [
      ['service', 'redeploy', '--service', 'api', '--yes'],
      ['service', 'redeploy', '--service', 'api'],
      ['redeploy', '--service', 'api', '--yes'],
      ['redeploy', '--service', 'api'],
    ], { cwd: root, timeout: 180000 })

    if (redeployed?.ok) {
      ok('API build triggered on Railway')
    } else {
      // Not fatal — Railway may have started a build automatically when the
      // source was connected. Warn and let the domain step confirm liveness.
      warn('Could not trigger a redeploy via CLI; Railway may have started one automatically.')
      note('Check the Railway dashboard to confirm a build is running for the api service.')
    }

    // `--port` is 5.x only.
    const domain = tryVariants('railway', [
      ['domain', '--service', 'api', '--port', '8080'],
      ['domain', '--service', 'api'],
      ['domain'],
    ], { cwd: root, timeout: 180000 })

    const host = firstUrl(domain?.stdout) || firstUrl(domain?.stderr)

    if (!host) {
      warn('Railway did not print a domain.')
      note('Dashboard, api service, Settings, Networking, Generate Domain.')
      const entered = await ask('Public API URL, without /api/v1', {
        unattended,
        validate: (v) => (/^https?:\/\//.test(v) ? null : 'Must start with https://'),
      })
      apiUrl = `${entered.replace(/\/+$/, '')}/api/v1`
    } else {
      apiUrl = `${host.replace(/\/+$/, '')}/api/v1`
    }

    record('apiUrl', apiUrl)
    ok(`API at ${apiUrl}`)
  }

  /* -------------------------------------------------- 5. Build the frontends */
  step('Building the frontends against that API URL')

  for (const dir of ['frontend', 'mobile']) {
    const cwd = path.join(root, dir)
    if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
      const ci = run('npm', ['ci'], { cwd })
      if (!ci.ok) run('npm', ['install'], { cwd })
    }
    const built = run('npm', ['run', 'build'], {
      cwd, env: { ...process.env, VITE_API_URL: apiUrl },
    })
    if (!built.ok) {
      fail(`The ${dir} build failed.`)
      return { ok: false, state }
    }
    ok(`${dir} built`)
  }

  /* --------------------------------------------------------- 6. Netlify */
  step('Netlify sites')

  /**
   * The Netlify CLI is folder-centric: `netlify link` and `netlify sites:create`
   * write .netlify/state.json into the current directory, and most commands
   * read the site from there. This repo has two frontends, so each gets its own
   * link inside its own directory rather than one link at the root. After this
   * runs you can `cd frontend && netlify open` or `netlify deploy` by hand and
   * it will target the right site.
   *
   * Flags differ across CLI versions (23 has no --json on sites:create; 27 has
   * --site-name on deploy), so only flags present in both are used here.
   */
  const sites = state.sites || {}

  const linkedSiteId = (dir) => {
    try {
      const raw = fs.readFileSync(path.join(dir, '.netlify', 'state.json'), 'utf8')
      return JSON.parse(raw).siteId || null
    } catch {
      return null
    }
  }

  // The team slug is needed when creating a site on a multi-team account.
  let slug = state.netlifyAccountSlug
  if (!slug) {
    const accounts = cli('netlify', ['api', 'listAccountsForUser', '--data', '{}'],
                         { quiet: true, timeout: 60000 })
    const parsed = parseJson(accounts.stdout)
    if (Array.isArray(parsed) && parsed.length) {
      slug = parsed[0].slug
      if (parsed.length > 1 && !unattended) {
        note(`You belong to ${parsed.length} Netlify teams: ${parsed.map((a) => a.slug).join(', ')}`)
        slug = await ask('Team slug to create the sites under',
                         { fallback: parsed[0].slug, unattended })
      }
      record('netlifyAccountSlug', slug)
    }
  }

  // One listing, reused for both apps, so an existing site is relinked rather
  // than duplicated.
  const listed = cli('netlify', ['sites:list', '--json'], { quiet: true, timeout: 120000 })
  const existingSites = parseJson(listed.stdout) || []
  const findSite = (name) => (Array.isArray(existingSites)
    ? existingSites.find((site) => site.name === name)
    : null)

  for (const [key, appDir] of [['backOffice', 'frontend'], ['field', 'mobile']]) {
    const cwd = path.join(root, appDir)
    let siteName = names[key]
    let siteId = linkedSiteId(cwd)

    if (siteId) {
      ok(`${appDir}/ is already linked to a Netlify site`)
    } else {
      const already = findSite(siteName)

      if (already) {
        // The site exists on the account but this folder is not linked to it.
        note(`Site "${siteName}" already exists; linking ${appDir}/ to it`)
        const linked = cli('netlify', ['link', '--id', already.id], { cwd, timeout: 90000 })
        if (!linked.ok) {
          fail(`Could not link ${appDir}/ to ${siteName}.`)
          note(`Run this yourself:  cd ${appDir} && netlify link --id ${already.id}`)
          return { ok: false, state }
        }
        siteId = already.id
      } else {
        // sites:create links the current directory as a side effect, which is
        // exactly what we want here.
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const args = ['sites:create', '--name', siteName]
          if (slug) args.push('--account-slug', slug)
          const created = cli('netlify', args, { cwd, timeout: 180000 })

          siteId = linkedSiteId(cwd)
          if (created.ok && siteId) break

          const output = `${created.stdout}\n${created.stderr}`
          if (/already (exists|taken)|unavailable|must be unique|name.*taken/i.test(output)) {
            siteName = `${names[key]}-${suffix()}`
            warn(`That site name is taken globally. Trying ${siteName}`)
            continue
          }
          break
        }
      }

      if (!siteId) {
        fail(`Could not create or link a Netlify site for ${appDir}/.`)
        note('Create it in the Netlify UI, then link this folder and re-run:')
        note(`  cd ${appDir} && netlify link`)
        return { ok: false, state }
      }
      ok(`${appDir}/ linked to ${siteName}`)
    }

    // Deployed from inside the app directory, so the folder link is what
    // selects the site. --dir is relative to that directory.
    const deployed = cli('netlify',
                         ['deploy', '--prod', '--no-build', '--dir', 'dist', '--json'],
                         { cwd, timeout: 900000 })

    if (!deployed.ok) {
      fail(`Deploy of ${siteName} failed.`)
      note(`Retry with:  cd ${appDir} && netlify deploy --prod --no-build --dir dist`)
      return { ok: false, state }
    }

    const result = parseJson(deployed.stdout) || {}
    sites[key] = {
      id: siteId,
      name: siteName,
      dir: appDir,
      url: result.url || result.site_url || result.deploy_url
           || `https://${siteName}.netlify.app`,
    }
    record('sites', sites)
    ok(`Deployed ${sites[key].url}`)

    // Keep the build-time variable on the site too, so a later git-linked
    // build produces the same bundle. Run from the linked folder.
    cli('netlify', ['env:set', 'VITE_API_URL', apiUrl, '--force'],
        { cwd, quiet: true, timeout: 90000 })
  }

  /* ------------------------------------------------------------- 7. CORS */
  step('Pointing the API CORS policy at the real site URLs')

  const hosts = Object.values(sites)
    .map((s) => (s.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, ''))
    .filter(Boolean)
    .map((h) => h.replace(/\./g, '\\.'))

  if (hosts.length) {
    // Deploy previews arrive as <branch>--<site>.netlify.app.
    const regex = `^https://([a-z0-9-]+--)?(${hosts.join('|')})$`
    const set = tryVariants('railway', [
      ['variable', 'set', `CORS_ORIGIN_REGEX=${regex}`, '--service', 'api'],
      ['variables', '--set', `CORS_ORIGIN_REGEX=${regex}`, '--service', 'api'],
    ], { cwd: root, timeout: 90000 })

    if (set?.ok) {
      ok('CORS updated; Railway is redeploying the API')
    } else {
      warn('Could not update CORS automatically.')
      note(`Set this on the api service in Railway:\n    CORS_ORIGIN_REGEX=${regex}`)
    }
    record('corsRegex', regex)
  }

  return {
    ok: true,
    state,
    apiUrl,
    databaseUrl,
    backOfficeUrl: sites.backOffice?.url,
    fieldAppUrl: sites.field?.url,
  }
}

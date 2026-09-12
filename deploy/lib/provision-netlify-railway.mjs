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
  ask, c, capture, checkDatabase, cmdEcho, confirm, fail, note, ok, run, say,
  step, warn,
} from './cli.mjs'
import {
  latestDeployment, linkContext, projectServices, railwayApi, readServiceInstance,
  setRootDirectory, triggerDeploy,
} from './railway-api.mjs'

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

/* ------------------------------------------------- frontend dependencies */

const readFile = (file) => {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * A node_modules folder is not proof that the dependencies are current. A
 * commit that adds a package leaves the folder in place and the new package
 * absent, and the build then fails deep inside rollup as an unresolved
 * import. Compare what package.json declares against what is actually on
 * disk instead.
 */
function missingDependencies(cwd) {
  const manifest = parseJson(readFile(path.join(cwd, 'package.json')))
  if (!manifest) return []
  const declared = Object.keys({
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  })
  return declared.filter(
    (name) => !fs.existsSync(path.join(cwd, 'node_modules', name)))
}

/** True when the lockfile does not know about a package package.json wants. */
function lockIsStale(cwd, names) {
  const lock = parseJson(readFile(path.join(cwd, 'package-lock.json')))
  if (!lock) return true
  const packages = lock.packages || {}
  return names.some((name) => !packages[`node_modules/${name}`])
}

/**
 * Install before building, and install whenever anything declared is absent.
 *
 * `npm ci` is the reproducible path, but it refuses to run when package.json
 * and package-lock.json disagree, which is exactly the state left behind by a
 * commit that adds a dependency without regenerating the lockfile. In that
 * case go straight to `npm install`, which reconciles the two, and say so:
 * the rewritten lockfile has to be committed, because both netlify.toml files
 * build with `npm ci` and would fail on the same mismatch.
 */
function installDependencies(cwd, dir) {
  const fresh = !fs.existsSync(path.join(cwd, 'node_modules'))
  const missing = missingDependencies(cwd)
  if (!fresh && !missing.length) return true

  if (missing.length && !fresh) {
    note(`${dir}: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} `
         + 'declared in package.json but not installed.')
  }

  const lockBefore = readFile(path.join(cwd, 'package-lock.json'))
  const stale = missing.length > 0 && lockIsStale(cwd, missing)

  if (stale) {
    note('The lockfile does not list it, so npm ci would refuse. Installing.')
    if (!run('npm', ['install'], { cwd }).ok) {
      fail(`Could not install the ${dir} dependencies.`)
      return false
    }
  } else if (!run('npm', ['ci'], { cwd }).ok) {
    warn(`npm ci failed in ${dir}. Falling back to npm install.`)
    if (!run('npm', ['install'], { cwd }).ok) {
      fail(`Could not install the ${dir} dependencies.`)
      return false
    }
  }

  const stillMissing = missingDependencies(cwd)
  if (stillMissing.length) {
    fail(`${dir} is still missing ${stillMissing.join(', ')} after installing.`)
    note('Check that the package name in package.json is spelled correctly')
    note('and that the registry is reachable.')
    return false
  }

  const lockAfter = readFile(path.join(cwd, 'package-lock.json'))
  if (lockBefore !== null && lockAfter !== lockBefore) {
    warn(`${dir}/package-lock.json was rewritten by the install.`)
    note('Commit it. Netlify builds with `npm ci`, which fails when the')
    note('lockfile and package.json disagree.')
  }
  return true
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

/* --------------------------------------------------------------------------
 * Postgres public access is a manual step, deliberately.
 *
 * Railway creates databases private by default. Turning public access on from
 * the dashboard is one button that stages TWO changes, the TCP proxy and the
 * DATABASE_PUBLIC_URL variable, and applies them on Deploy. The CLI has no
 * equivalent: `tcp-proxy create` performs only the proxy half, `variable set`
 * only the variable half, and the redeploy needed to apply them races the read
 * that follows. Every automatic combination of those was tried and each failed
 * in a different way, so this asks the operator to press the button and then
 * proves the result by opening a real connection rather than believing it.
 * ------------------------------------------------------------------------ */
const publicAccessInstructions = () => {
  say('')
  note('Railway keeps databases private by default, and its CLI cannot switch')
  note('public access on reliably. This one step is yours. In the dashboard:')
  say('')
  note('  1. Open this project, then the Postgres service')
  note('  2. Settings, Networking, Add Public Access')
  note('  3. Press Deploy, and wait for the service to read Online')
  note('  4. Variables tab, copy DATABASE_PUBLIC_URL')
  say('')
  note('Migrations run from this machine, so it needs a public address. The API')
  note('keeps talking to Postgres privately. You can remove public access when')
  note('setup has finished.')
  say('')
}

/** Turn a psql failure into the next thing worth trying. */
const DSN_HINTS = [
  [/closed the connection unexpectedly|terminated abnormally/i,
   'The service is still redeploying. Wait for it to read Online, then retry.'],
  [/could not translate host name/i,
   'That host does not resolve. A .railway.internal address only works inside '
   + 'Railway: copy DATABASE_PUBLIC_URL, not DATABASE_URL.'],
  [/nothing is listening|Connection refused/i,
   'Nothing is listening there. Public access may not be deployed yet.'],
  [/username or password is wrong|password authentication/i,
   'Those credentials are stale. Re-copy DATABASE_PUBLIC_URL after the deploy '
   + 'has finished.'],
  [/database name does not exist/i,
   'Right server, wrong database name on the end of the URL.'],
]

/**
 * Ask for a connection string and do not accept it until psql agrees. Loops
 * rather than failing, because the usual reason is simply "not deployed yet".
 */
async function askVerifiedDatabaseUrl({ unattended = false, suppliedValue } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const url = await ask('DATABASE_PUBLIC_URL', {
      unattended,
      suppliedValue: attempt === 1 ? suppliedValue : undefined,
      validate: (v) => {
        if (!/^postgres(ql)?:\/\//i.test(v)) {
          return 'Must be a full postgresql:// connection string.'
        }
        if (/\.railway\.internal\b/i.test(v)) {
          return 'That is the private URL. This machine cannot reach it; copy '
               + 'DATABASE_PUBLIC_URL instead.'
        }
        return null
      },
    })

    if (!url) return null

    cmdEcho("psql <DATABASE_PUBLIC_URL> -tAc 'SELECT version()'")
    const probe = checkDatabase(url)

    if (probe.ok) {
      ok(`Connected: ${probe.version}`)
      return url
    }
    if (probe.skipped) {
      warn('psql is not installed, so the connection was not verified.')
      note('The migrations need it. Install it before going further.')
      return url
    }

    fail(`Could not connect: ${probe.reason}`)
    const hint = DSN_HINTS.find(([re]) => re.test(`${probe.reason} ${probe.stderr || ''}`))
    if (hint) note(hint[1])

    if (unattended) return null
    if (!await confirm('Try again?', true)) return null
  }
}

/** One request against a health endpoint. Never throws. */
async function probeHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const body = await response.text()
    return { ok: response.ok, status: response.status, body: body.slice(0, 200) }
  } catch (error) {
    return { ok: false, status: 0, body: error.message }
  }
}

/**
 * Poll an API health endpoint until it answers 200, or the operator gives up.
 * Railway builds take a couple of minutes, so this is patient by default and
 * then hands the decision back rather than looping forever.
 */
async function waitForHealth(url, { unattended = false, describe = null } = {}) {
  const probe = () => probeHealth(url)

  for (let round = 1; ; round += 1) {
    const waits = [0, 10000, 15000, 15000, 20000, 20000, 30000, 30000, 30000]
    let last = null

    let lastLine = null

    for (let i = 0; i < waits.length; i += 1) {
      if (waits[i]) {
        note(`Waiting for the API to build and answer (${i}/${waits.length - 1})`)
        await new Promise((resolve) => { setTimeout(resolve, waits[i]) })
      }
      last = await probe()
      if (last.ok) {
        ok(`API healthy: ${last.body}`)
        return true
      }

      // Say what Railway is actually doing rather than counting silently. A
      // build that has already failed is worth stopping on now instead of in
      // another two minutes, and a domain that answers 404 "Application not
      // found" because no deployment exists looks identical from out here.
      if (describe) {
        const report = await describe()
        if (report?.line && report.line !== lastLine) {
          lastLine = report.line
          note(report.line)
        }
        if (report?.stop) {
          fail(`Railway build did not succeed: ${report.line}`)
          note('Build log:  railway logs --service api --build')
          return false
        }
      }
    }

    fail(`API not healthy after ${round === 1 ? 'three minutes' : 'another wait'}.`)
    note(last.status ? `Last response: HTTP ${last.status} ${last.body}`
                     : `Last error: ${last.body}`)
    if (unattended) return false
    if (!await confirm('Keep waiting?', true)) return false
  }
}

/* --------------------------------------------------------------------------
 * Root Directory, and why it goes through the API.
 *
 * The API code lives in backend/. Railway builds from the service's Root
 * Directory, so with that unset it builds the repository root and reads the
 * root railway.json. Both trees are buildable here on purpose, but the service
 * should say out loud where the API is, because that is what makes the build
 * predictable and what makes railway.json land where the API code is.
 *
 * The CLI cannot commit this. `railway environment edit --service-config`
 * stages the change the way the dashboard does, so it reported success while
 * Railway carried on building the previous tree. The public API applies it
 * immediately and can be read straight back, which is the only reason we can
 * claim it is set.
 * ------------------------------------------------------------------------ */
const API_ROOT_DIRECTORY = '/backend'

/** Compare what Railway reports against what we asked for, ignoring slashes. */
const trimSlashes = (value) => String(value || '').replace(/^\/+|\/+$/g, '')
const isWantedRootDirectory = (live) => trimSlashes(live) === trimSlashes(API_ROOT_DIRECTORY)

/** What Railway currently reports as the root directory, or null. */
async function currentRootDirectory(rw) {
  const check = await readServiceInstance(rw.api, {
    serviceId: rw.serviceId, environmentId: rw.environmentId,
  })
  return check.ok ? (check.instance.rootDirectory ?? null) : null
}

/** Resolve project, environment and service ids for one service by name. */
async function railwayServiceContext(root, serviceName) {
  const link = linkContext(root)
  if (!link.ok) return { ok: false, reason: link.reason }

  const api = railwayApi()
  const project = await projectServices(api, link.projectId)
  if (!project.ok) {
    return { ok: false, api, reason: project.reason || 'Railway API did not return the project.' }
  }

  const service = project.services.find((entry) => entry.name === serviceName)
  if (!service?.id) {
    return { ok: false, api,
             reason: `No service named "${serviceName}" in ${project.name || link.projectId}.` }
  }

  const environmentId = link.environmentId
    || project.environments.find((entry) => entry.name === 'production')?.id
    || project.environments[0]?.id
  if (!environmentId) {
    return { ok: false, api, reason: 'Could not work out which environment to write to.' }
  }

  return {
    ok: true,
    api,
    projectId: link.projectId,
    environmentId,
    serviceId: service.id,
    projectName: project.name || link.projectName || null,
    source: link.source,
  }
}

/**
 * Commit API_ROOT_DIRECTORY on the api service and verify it. Returns true only
 * when Railway itself reports the value back.
 */
async function ensureRootDirectory({ root, rw, unattended, prompt = true }) {
  if (rw.ok) {
    const applied = await setRootDirectory(rw.api, {
      serviceId: rw.serviceId,
      environmentId: rw.environmentId,
      rootDirectory: API_ROOT_DIRECTORY,
    })
    if (applied.ok) {
      const via = rw.api.authSource ? ` (token from ${rw.api.authSource})` : ''
      ok(`Root directory committed and verified as ${API_ROOT_DIRECTORY}${via}`)
      return true
    }
    warn(`The Railway API would not set the root directory: ${applied.reason}`)
  } else {
    warn(`Could not reach the Railway API: ${rw.reason}`)
    note('The API path needs `railway login`, or RAILWAY_API_TOKEN in the environment.')
  }

  // Second attempt: the CLI, without --stage. It may work on some versions and
  // costs one call to find out. input: '' closes stdin straight away, so on
  // versions where this command is an interactive editor it exits rather than
  // waiting out the timeout.
  const viaCli = tryVariants('railway', [
    ['environment', 'edit', '--service-config', 'api',
     'source.rootDirectory', API_ROOT_DIRECTORY, '--yes'],
    ['environment', 'edit', '--service-config', 'api',
     'source.rootDirectory', API_ROOT_DIRECTORY],
  ], { cwd: root, timeout: 60000, input: '' })

  if (viaCli?.ok && rw.ok) {
    const live = await currentRootDirectory(rw)
    if (isWantedRootDirectory(live)) {
      ok(`Root directory set to ${API_ROOT_DIRECTORY} by the CLI and verified`)
      return true
    }
    warn('The CLI reported success but Railway still does not report that value.')
    note('That is the staged-change trap: the setting is pending, not applied.')
  }

  // Third attempt: the operator, with a verified re-check rather than a promise.
  note('')
  note(`Set this by hand: Railway dashboard, api service, Settings, Source,`)
  note(`Root Directory = ${API_ROOT_DIRECTORY}, then press Deploy.`)
  note('')

  if (unattended || !prompt) return false

  // Without API access there is nothing to check the answer against, and a
  // confirmation nobody can verify is worse than no question at all.
  if (!rw.ok) {
    note('This run cannot read the setting back, so it will not ask you to')
    note('confirm it. The health check below is the real test.')
    return false
  }

  for (;;) {
    if (!await confirm('Saved and deployed in the dashboard?', true)) return false
    const live = await currentRootDirectory(rw)
    if (isWantedRootDirectory(live)) {
      ok(`Verified: root directory is ${live}`)
      return true
    }
    warn(`Railway reports ${live === null ? 'no root directory' : live}. Press Deploy so it applies.`)
  }
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
      '   -> you enable Public Access in the dashboard and paste DATABASE_PUBLIC_URL',
      '   -> psql verifies it before anything else runs',
      './database/setup.sh --with-demo --test               # 18 migrations + assertions',
      'git add --all && git commit -m "chore: initial deploy commit"',
      'git push origin HEAD                                  # push code to GitHub',
      `railway add --service api --repo <owner/repo> --branch main`,
      '   -> Railway API: serviceInstanceUpdate rootDirectory=/backend, then read it back',
      'railway variable set DATABASE_URL=... JWT_SECRET=... ... --service api --skip-deploys',
      'railway redeploy --service api --yes                  # trigger first build',
      'railway domain --service api --port 8080',
      '   -> GET <api>/health until it answers 200',
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

    publicAccessInstructions()
    databaseUrl = await askVerifiedDatabaseUrl({ unattended })
    if (!databaseUrl) {
      fail('No reachable database URL. Nothing further can run.')
      return { ok: false, state }
    }
    record('databaseUrl', databaseUrl)
  }

  /* ------------------------------------------------------------ 3. Schema */
  step('Database schema')

  if (state.migrated) {
    ok('Schema already applied')
  } else {
    // Never assume the saved URL still works. A resumed run can be pointing at
    // a database that has since been redeployed, torn down, or had public
    // access removed. Verify, and walk through it again if it has gone stale.
    const probe = checkDatabase(databaseUrl)

    if (probe.ok) {
      ok('Database reachable')
    } else if (probe.skipped) {
      warn('psql is not installed, so the connection was not verified.')
      note('The migrations below need it.')
    } else {
      warn(`The saved database URL does not connect: ${probe.reason}`)
      publicAccessInstructions()
      const fresh = await askVerifiedDatabaseUrl({ unattended })
      if (!fresh) {
        fail('Cannot reach the database, so the schema was not applied.')
        return { ok: false, state }
      }
      databaseUrl = fresh
      record('databaseUrl', databaseUrl)
    }

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
  // This step runs every time, and a recorded "already pushed" is treated as a
  // note rather than proof.
  //
  // Railway builds the commit that is on GitHub. When the installer itself is
  // fixed between runs, which is the normal case for a resumed deploy, the
  // local tree holds the fix and the remote does not, so skipping this step
  // deploys the old commit and the run fails for a reason that has nothing to
  // do with the code being looked at. Verifying costs one ls-remote.
  {
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

    // Compare the local commit against the branch Railway watches. ls-remote
    // reads the remote directly, so this is accurate without a fetch.
    const branchResult = cli('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
                             { cwd: root, quiet: true })
    const branch = branchResult.stdout?.trim() || 'main'
    const localHead = cli('git', ['rev-parse', 'HEAD'], { cwd: root, quiet: true }).stdout?.trim()
    const remoteRef = cli('git', ['ls-remote', 'origin', `refs/heads/${branch}`],
                          { cwd: root, quiet: true, timeout: 60000 })
    const remoteHead = remoteRef.stdout?.trim().split(/\s+/)[0] || ''

    if (branch !== 'main') {
      warn(`On branch "${branch}", but the Railway service is linked to main.`)
      note(`Railway will not build this branch. Merge it into main, or point the`)
      note('api service at it in the dashboard.')
    }

    if (localHead && localHead === remoteHead) {
      record('githubPushed', true)
      ok(`github.com/${repoSlug} already has ${localHead.slice(0, 7)} on ${branch}`)
    } else {
      const pushed = cli('git', ['push', 'origin', 'HEAD'], { cwd: root, timeout: 120000 })
      if (!pushed.ok) {
        fail('git push failed.')
        note(pushed.stderr || pushed.stdout)
        note('Make sure you have push access to the remote and try again.')
        return { ok: false, state }
      }

      record('githubPushed', true)
      ok(`Pushed ${(localHead || '').slice(0, 7)} to github.com/${repoSlug}`)
    }
  }

  const repoSlug = state.githubRepo

  /* -------------------------------------------------------- 5. API service */
  step('API service')

  let apiUrl = state.apiUrl || ''

  // Ids for the api service, resolved once. The root-directory repair, the
  // deploy trigger and the deployment-status reporting all need them.
  const rw = await railwayServiceContext(root, 'api')
  if (rw.ok) {
    note(`Railway project ${rw.projectName || rw.projectId} (ids via ${rw.source})`)
  }

  /*
   * A URL in .deploy-state.json is not evidence of a working API. An earlier
   * run recorded one the moment Railway minted the domain, which happens long
   * before, and regardless of whether, a build succeeds. Trusting it meant a
   * resumed run printed "API already deployed", skipped every repair below,
   * and then built both frontends against an address that answered 404. So the
   * recorded URL is probed, and a dead one falls through to the repair path.
   */
  let apiHealthy = false

  if (apiUrl) {
    const probe = await probeHealth(`${apiUrl.replace(/\/api\/v1\/?$/, '')}/health`)
    if (probe.ok) {
      apiHealthy = true
      ok(`API already deployed and healthy at ${apiUrl}`)

      // Repair the root directory even on a healthy service, since a run that
      // finished before this existed left it unset. No prompting here: the API
      // works, so this is housekeeping, not a blocker.
      const repaired = await ensureRootDirectory({ root, rw, unattended, prompt: false })
      if (!repaired) {
        note(`Root directory is not confirmed as ${API_ROOT_DIRECTORY}, but the API`)
        note('is answering, so nothing here needs to change today.')
      }
    } else {
      warn(`The recorded API URL does not answer: HTTP ${probe.status || 'no response'}`)
      note(probe.body ? probe.body.split('\n')[0] : 'no body')
      note('Repairing the service rather than building the frontends against it.')
    }
  }

  if (!apiHealthy) {
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

    // Check whether the service already exists on Railway regardless of what
    // state says — a manual dashboard action may have created it.
    const serviceList = cli('railway', ['service', 'list', '--json'],
                            { cwd: root, quiet: true, timeout: 60000 })
    const services = parseJson(serviceList.stdout)
    const existingService = Array.isArray(services)
      ? services.find((s) => s.name === 'api')
      : null

    if (existingService) {
      // Service exists (created manually or by a previous run). Record it so
      // future re-runs skip straight past this block.
      record('apiService', 'api')
      ok('API service already exists on Railway')

      // Ensure the GitHub source is connected if it isn't already.
      if (!existingService.source?.repo) {
        const connected = cli('railway',
          ['service', 'source', 'connect',
           '--repo', repoSlug, '--branch', 'main', '--service', 'api'],
          { cwd: root, timeout: 180000 })
        if (connected.ok) {
          ok('GitHub source connected to API service')
        } else {
          warn('Could not connect the GitHub source automatically.')
          note('In the Railway dashboard: api service → Settings → Source → Connect Repo')
          note(`Repo: ${repoSlug}   Branch: main`)
          note('Once connected, re-run this script.')
          return { ok: false, state }
        }
      } else {
        ok(`Source already connected: ${existingService.source.repo}`)
      }
    } else {
      // Service does not exist yet — create it linked to the GitHub repo.
      // --repo + --branch is Railway CLI 5.x. Fall back to create-then-connect
      // for older versions.
      let serviceOk = false

      const withRepo = cli('railway',
        ['add', '--service', 'api', '--repo', repoSlug, '--branch', 'main'],
        { cwd: root, timeout: 180000 })

      if (withRepo.ok) {
        serviceOk = true
        ok('API service created and linked to GitHub repo')
      } else if (UNKNOWN_FLAG.test(withRepo.stderr + withRepo.stdout)) {
        note('CLI does not support --repo on add; creating then connecting source.')
        const created = cli('railway', ['add', '--service', 'api', '--json'],
                            { cwd: root, timeout: 180000 })
        if (created.ok) {
          const connected = cli('railway',
            ['service', 'source', 'connect',
             '--repo', repoSlug, '--branch', 'main', '--service', 'api'],
            { cwd: root, timeout: 180000 })
          if (connected.ok) {
            serviceOk = true
            ok('API service created and source connected')
          }
        }
      }

      if (!serviceOk) {
        fail('Could not create the API service.')
        note('Create a service named "api" in the Railway dashboard, connect it to:')
        note(`  Repo: ${repoSlug}   Branch: main   Root Directory: ${API_ROOT_DIRECTORY}`)
        note('Then re-run this script.')
        return { ok: false, state }
      }

      record('apiService', 'api')
    }

    // Root directory. Tell Railway where the API lives instead of relying on a
    // default, so it reads backend/railway.json and builds backend/Dockerfile.
    const rootDirSet = await ensureRootDirectory({ root, rw, unattended })

    if (rootDirSet) {
      ok('Build configured by backend/railway.json (Dockerfile in backend/)')
    } else {
      warn(`Root directory is not confirmed as ${API_ROOT_DIRECTORY}.`)
      note('Carrying on rather than stopping: the repository root holds an')
      note('equivalent Dockerfile and railway.json that build the same image')
      note('from the root context, so a service left at / still deploys. The')
      note('health check below is what decides whether it worked.')
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

    // Trigger a build so the variables and the root directory take effect.
    //
    // `redeploy` is a top-level command, not a subcommand of `service`, which
    // is why the earlier spelling always failed and left runs with a service
    // that had never built. A service with no deployment at all cannot be
    // redeployed either, so the API is the fallback: without a first build,
    // the generated domain answers every request with a 404 "Application not
    // found" that looks exactly like a broken API.
    const redeployed = tryVariants('railway', [
      ['redeploy', '--service', 'api', '--yes'],
      ['redeploy', '--service', 'api'],
      ['service', 'redeploy', '--service', 'api', '--yes'],
    ], { cwd: root, timeout: 180000 })

    if (redeployed?.ok) {
      ok('Deploy triggered with the new environment variables')
    } else if (rw.ok) {
      const triggered = await triggerDeploy(rw.api, {
        serviceId: rw.serviceId, environmentId: rw.environmentId,
      })
      if (triggered.ok) {
        ok(`Deploy triggered through the Railway API (${triggered.mutation})`)
      } else {
        warn(`Could not trigger a deploy: ${triggered.reason}`)
        note('Railway may already be building from the source connection.')
      }
    } else {
      note('Could not trigger a deploy from here; Railway may already be building.')
    }

    // `--port` is 5.x only. Skipped when a domain was already recorded: the
    // service keeps its address across rebuilds, and asking again risks a
    // second domain.
    const domain = apiUrl ? null : tryVariants('railway', [
      ['domain', '--service', 'api', '--port', '8080'],
      ['domain', '--service', 'api'],
      ['domain'],
    ], { cwd: root, timeout: 180000 })

    const host = apiUrl
      ? apiUrl.replace(/\/api\/v1\/?$/, '')
      : (firstUrl(domain?.stdout) || firstUrl(domain?.stderr))

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

    // Never assume a deployed service is a working service. Railway reports a
    // domain the moment it exists, long before the first build finishes, and a
    // build that produces a broken image still gets one. /health runs a real
    // query, so a 200 here means the image built, booted, and reached Postgres.
    const healthUrl = `${apiUrl.replace(/\/api\/v1\/?$/, '')}/health`

    // Report what Railway thinks is happening while we poll, so a failed build
    // is named in seconds instead of showing up as a silent timeout.
    const describe = rw.ok
      ? async () => {
        const result = await latestDeployment(rw.api, {
          projectId: rw.projectId,
          environmentId: rw.environmentId,
          serviceId: rw.serviceId,
        })
        if (!result.ok) return null
        if (!result.deployment) {
          return { line: 'Railway has no deployment for this service yet.', stop: false }
        }
        const status = String(result.deployment.status || 'UNKNOWN').toUpperCase()
        const id = String(result.deployment.id || '').slice(0, 8)
        return {
          line: `Railway deployment ${id || '(unknown)'} is ${status}`,
          stop: ['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(status),
        }
      }
      : null

    const apiReady = await waitForHealth(healthUrl, { unattended, describe })

    if (!apiReady) {
      warn('The API is not answering yet, so the frontends would be built')
      note('against a URL that does not work.')
      note(`Check the build log: Railway dashboard, api service, Deployments.`)
      note(`Health endpoint: ${healthUrl}`)
      if (unattended) return { ok: false, state }
      if (!await confirm('Carry on and deploy the frontends anyway?', false)) {
        fail('Stopping. Re-run once the API is healthy; it resumes from here.')
        return { ok: false, state }
      }
    }
  }

  /* -------------------------------------------------- 5. Build the frontends */
  step('Building the frontends against that API URL')

  for (const dir of ['frontend', 'mobile']) {
    const cwd = path.join(root, dir)
    if (!installDependencies(cwd, dir)) return { ok: false, state }
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

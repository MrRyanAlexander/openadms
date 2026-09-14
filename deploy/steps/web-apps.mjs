/**
 * Step: build both frontends against the live API URL, put them on Netlify,
 * then point the API's CORS policy at the addresses they actually got.
 *
 * The Netlify CLI is folder-centric: `netlify link` and `netlify sites:create`
 * write .netlify/state.json into the current directory and most commands read
 * the site from there. This repo has two frontends, so each gets its own link
 * inside its own directory rather than one link at the root. Afterwards you
 * can `cd frontend && netlify open` and it targets the right site.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { ask, fail, note, ok, step, warn } from '../lib/ui.mjs'
import { cli, parseJson, run, tryVariants } from '../lib/shell.mjs'

const suffix = () => crypto.randomBytes(2).toString('hex')

const readFile = (file) => {
  try { return fs.readFileSync(file, 'utf8') } catch { return null }
}

/**
 * A node_modules folder is not proof that dependencies are current. A commit
 * that adds a package leaves the folder in place and the package absent, and
 * the build then dies deep inside rollup as an unresolved import. Compare what
 * package.json declares against what is actually on disk instead.
 */
function missingDependencies(cwd) {
  const manifest = parseJson(readFile(path.join(cwd, 'package.json')))
  if (!manifest) return []
  const declared = Object.keys({
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
  })
  return declared.filter((name) => !fs.existsSync(path.join(cwd, 'node_modules', name)))
}

/** True when the lockfile does not know about a package package.json wants. */
function lockIsStale(cwd, names) {
  const lock = parseJson(readFile(path.join(cwd, 'package-lock.json')))
  if (!lock) return true
  const packages = lock.packages || {}
  return names.some((name) => !packages[`node_modules/${name}`])
}

/**
 * `npm ci` is the reproducible path, but it refuses to run when package.json
 * and package-lock.json disagree, which is exactly the state a commit that
 * adds a dependency without regenerating the lockfile leaves behind. Go
 * straight to `npm install` there, and say so: the rewritten lockfile has to
 * be committed, because both netlify.toml files build with `npm ci` and would
 * fail on the same mismatch.
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

  if (missing.length > 0 && lockIsStale(cwd, missing)) {
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
    note('Check the package name in package.json and that the registry is reachable.')
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

export async function deployWebApps({ root, state, record, unattended, prefix, apiUrl }) {
  /* ---- build ----------------------------------------------------------- */
  step('Building the frontends against that API URL')

  for (const dir of ['frontend', 'mobile']) {
    const cwd = path.join(root, dir)
    if (!installDependencies(cwd, dir)) return { ok: false }
    const built = run('npm', ['run', 'build'],
                      { cwd, env: { ...process.env, VITE_API_URL: apiUrl } })
    if (!built.ok) {
      fail(`The ${dir} build failed.`)
      return { ok: false }
    }
    ok(`${dir} built`)
  }

  /* ---- netlify --------------------------------------------------------- */
  step('Netlify sites')

  const names = {
    backOffice: `${prefix}-back-office`,
    field: `${prefix}-field`,
  }
  const sites = state.sites || {}

  const linkedSiteId = (dir) => {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(dir, '.netlify', 'state.json'), 'utf8')).siteId || null
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
        note(`Site "${siteName}" already exists; linking ${appDir}/ to it`)
        const linked = cli('netlify', ['link', '--id', already.id], { cwd, timeout: 90000 })
        if (!linked.ok) {
          fail(`Could not link ${appDir}/ to ${siteName}.`)
          note(`Run this yourself:  cd ${appDir} && netlify link --id ${already.id}`)
          return { ok: false }
        }
        siteId = already.id
      } else {
        // sites:create links the current directory as a side effect, which is
        // exactly what is wanted here.
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
        return { ok: false }
      }
      ok(`${appDir}/ linked to ${siteName}`)
    }

    // Deployed from inside the app directory, so the folder link selects the
    // site. --dir is relative to that directory.
    const deployed = cli('netlify',
                         ['deploy', '--prod', '--no-build', '--dir', 'dist', '--json'],
                         { cwd, timeout: 900000 })

    if (!deployed.ok) {
      fail(`Deploy of ${siteName} failed.`)
      note(`Retry with:  cd ${appDir} && netlify deploy --prod --no-build --dir dist`)
      return { ok: false }
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
    // build produces the same bundle.
    cli('netlify', ['env:set', 'VITE_API_URL', apiUrl, '--force'],
        { cwd, quiet: true, timeout: 90000 })
  }

  /* ---- CORS ------------------------------------------------------------ */
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

    if (set?.ok) ok('CORS updated; Railway is redeploying the API')
    else {
      warn('Could not update CORS automatically.')
      note(`Set this on the api service in Railway:\n    CORS_ORIGIN_REGEX=${regex}`)
    }
    record('corsRegex', regex)
  }

  return {
    ok: true,
    backOfficeUrl: sites.backOffice?.url,
    fieldAppUrl: sites.field?.url,
  }
}

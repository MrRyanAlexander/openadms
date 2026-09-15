#!/usr/bin/env node
/**
 * Open ADMS setup. The one entry point.
 *
 *   npm run setup                     interactive, first run or resume
 *   npm run setup -- --dry-run        print the plan, change nothing
 *   npm run setup -- --yes ...        unattended, every answer from a flag
 *   npm run preflight                 check tooling only  (--check)
 *   npm run deploy:netlify            re-provision without re-minting keys (--resume)
 *   npm run setup -- --showcase-seed=10000
 *                                     also load the showcase: 20 projects,
 *                                     6 declarations, 10,000 tickets
 *   npm run setup -- --large-seed=250000 --large-projects=10
 *                                     or the volume seed instead: 10 more
 *                                     projects, 250,000 tickets across them
 *
 * This file owns the ORDER. Each step owns its own job and lives in one file
 * under deploy/steps/, named for what it does. Nothing calls sideways: a step
 * never reaches into another step's platform, it returns a value and this file
 * decides what happens next.
 *
 *   railway-project   the Railway project and a Postgres you can connect to
 *   database-schema   migrations and the optional worked demo
 *   github            get the commit onto GitHub, because that is what builds
 *   api-service       the api service, from nothing to a URL answering 200
 *   web-apps          both frontends built, on Netlify, with CORS pointed back
 *
 * Every step is idempotent and records what it achieved in .deploy-state.json,
 * so a re-run resumes rather than starting over. `npm run teardown` is the
 * inverse and makes the next run a genuine first run.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import {
  ask, c, choose, closePrompts, confirm, initPrompts, note, ok, say, step, warn,
} from './lib/ui.mjs'
import {
  checkDatabase, has, run, validateDatabaseUrl, validateHttpUrl,
} from './lib/shell.mjs'
import { stateRecorder } from './lib/state.mjs'
import { preflight, TARGET_TOOLS } from './lib/requirements.mjs'

import { ensureDatabase, ensureProject } from './steps/railway-project.mjs'
import { applySchema, seedVolume } from './steps/database-schema.mjs'
import { pushToGithub } from './steps/github.mjs'
import { deployApi } from './steps/api-service.mjs'
import { deployWebApps } from './steps/web-apps.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const flags = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=')
    return [key, rest.length ? rest.join('=') : true]
  }))

const UNATTENDED = Boolean(flags.yes || flags.y || flags['non-interactive'])
const DRY_RUN = Boolean(flags['dry-run'])
const RESUME = Boolean(flags.resume)

initPrompts({ unattended: UNATTENDED })

const opts = (flag, extra = {}) =>
  ({ unattended: UNATTENDED, suppliedValue: flags[flag], ...extra })

/* ------------------------------------------------------------------ files */
function readEnvFile(rel) {
  try {
    return Object.fromEntries(
      fs.readFileSync(path.join(ROOT, rel), 'utf8')
        .split('\n').filter(Boolean).filter((l) => !l.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=')
          return [line.slice(0, i), line.slice(i + 1)]
        }))
  } catch {
    return {}
  }
}

function writeEnv(rel, values) {
  const body = Object.entries(values).map(([k, v]) => `${k}=${v ?? ''}`).join('\n')
  const target = path.join(ROOT, rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${body}\n`, { mode: 0o600 })
  ok(`wrote ${rel}`)
}

const newInstanceKey = () => crypto.randomBytes(32).toString('hex')

function newKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

const CORS_DEFAULT =
  '^https?://(localhost(:\\d+)?|127\\.0\\.0\\.1(:\\d+)?|[a-z0-9-]+\\.netlify\\.app'
  + '|[a-z0-9-]+\\.netlify\\.live|[a-z0-9-]+\\.up\\.railway\\.app'
  + '|[a-z0-9-]+\\.onrender\\.com|[a-z0-9-]+\\.web\\.app'
  + '|[a-z0-9]+\\.cloudfront\\.net)$'

/* ----------------------------------------------------------- the sequence */
/**
 * The Netlify + Railway path, start to finish. Frontends on Netlify, API and
 * Postgres on Railway, API deployed from GitHub.
 *
 * The API image is the Dockerfile at the repository root and there is no build
 * setting to apply: Railway's default for a GitHub service already looks
 * there. Nothing below reads or writes the service's Root Directory.
 */
async function provisionRailwayNetlify({ config, prefix }) {
  const { state, record } = stateRecorder(ROOT, { dryRun: DRY_RUN })
  const ctx = { root: ROOT, config, state, record, unattended: UNATTENDED, prefix }

  if (DRY_RUN) {
    step('Dry run')
    note('These are the steps that would run, in order. Nothing is executed.')
    ;[
      `railway init --name ${prefix}`,
      'railway add --database postgres',
      '   you enable Public Access in the dashboard and paste DATABASE_PUBLIC_URL',
      '   psql verifies it before anything else runs',
      './database/setup.sh --with-demo --test',
      '   optionally ./database/seed-showcase.sh --yes for 20 varied projects,',
      '   or ./database/seed-large.sh <n> --projects=<n> --yes for volume',
      'git add --all && git commit && git push origin HEAD',
      'railway add --service api --repo <owner/repo> --branch main',
      '   no Root Directory is set: Railway builds /Dockerfile, which is the API',
      'railway variable set DATABASE_URL=... JWT_SECRET=... --skip-deploys',
      'railway redeploy --service api --yes',
      'railway domain --service api --port 8080',
      '   GET <api>/health until it answers 200',
      'npm run build in frontend/ and mobile/ with VITE_API_URL=<api>',
      `netlify sites:create --name ${prefix}-back-office   (and -field)`,
      'netlify deploy --prod --no-build --dir dist',
      'railway variable set CORS_ORIGIN_REGEX=<from the real site URLs>',
    ].forEach((line) => note(line))
    return { ok: true, dryRun: true }
  }

  const project = await ensureProject(ctx)
  if (!project.ok) return { ok: false }

  const database = await ensureDatabase(ctx)
  if (!database.ok) return { ok: false }

  const schema = await applySchema({ ...ctx, databaseUrl: database.databaseUrl })
  if (!schema.ok) return { ok: false }

  const github = await pushToGithub(ctx)
  if (!github.ok) return { ok: false }

  const api = await deployApi({
    ...ctx, repoSlug: github.repoSlug, databaseUrl: schema.databaseUrl,
  })
  if (!api.ok) return { ok: false }

  const web = await deployWebApps({ ...ctx, apiUrl: api.apiUrl })
  if (!web.ok) return { ok: false }

  return {
    ok: true,
    apiUrl: api.apiUrl,
    databaseUrl: schema.databaseUrl,
    backOfficeUrl: web.backOfficeUrl,
    fieldAppUrl: web.fieldAppUrl,
  }
}

/* ------------------------------------------------------------------- main */
async function main() {
  /* ---- preflight only --------------------------------------------------- */
  if (flags.check) {
    for (const target of Object.keys(TARGET_TOOLS)) {
      const result = await preflight(target, { unattended: UNATTENDED })
      if (result.ready) ok(`${target}: ready`)
      else warn(`${target}: missing ${[...result.missing, ...result.notAuthed].join(', ') || 'nothing'}`)
    }
    closePrompts()
    return
  }

  const saved = readEnvFile('.instance')
  const savedBackend = readEnvFile('backend/.env')
  const resuming = RESUME && Boolean(saved.INSTANCE_UNIQUE_KEY)

  say(`
${c.bold}Open ADMS setup${c.reset}
${c.dim}Automated Debris Management System, self-hosted, portable, federated.${c.reset}${
  DRY_RUN ? `\n${c.amber}Dry run: nothing will be created or changed.${c.reset}` : ''}${
  resuming ? `\n${c.dim}Resuming an existing instance; keys are reused, not re-minted.${c.reset}` : ''}
`)

  if (RESUME && !resuming) {
    warn('No .instance file, so there is nothing to resume.')
    note('Run `npm run setup` first so this instance has an identity.')
    closePrompts()
    process.exitCode = 1
    return
  }

  /* ---- 1. target -------------------------------------------------------- */
  step('Deployment target')
  const target = resuming
    ? (saved.TARGET || 'netlify')
    : await choose('Where should this instance live?', [
        { value: 'netlify', label: 'Netlify + Railway',
          hint: 'frontends on Netlify, API and Postgres on Railway' },
        { value: 'aws', label: 'AWS', hint: 'S3 + CloudFront, App Runner, RDS' },
        { value: 'gcp', label: 'Google Cloud', hint: 'Firebase Hosting, Cloud Run, Cloud SQL' },
        { value: 'local', label: 'Local only', hint: 'write the .env files and stop' },
      ], opts('target', { fallback: 'local' }))
  if (resuming) ok(`Target ${target} (from .instance)`)

  /* ---- 2. tooling ------------------------------------------------------- */
  const tools = await preflight(target, {
    unattended: UNATTENDED,
    autoInstall: Boolean(flags['auto-install']),
  })

  let configOnly = false
  if (!tools.ready) {
    if (tools.missing.length) warn(`Still missing: ${tools.missing.join(', ')}`)
    if (tools.notAuthed.length) warn(`Not signed in: ${tools.notAuthed.join(', ')}`)
    note('Install or sign in to those, then run this again. Nothing you have '
         + 'already answered is lost; setup is safe to re-run.')

    const carryOn = target === 'local'
      ? true
      : await confirm('Continue anyway and just write the config files?', false,
                      { unattended: UNATTENDED })
    if (!carryOn) {
      closePrompts()
      return
    }
    configOnly = true
  }

  /* ---- 3. database ------------------------------------------------------ */
  step('Database')

  let databaseUrl = ''
  let bringYourOwnDatabase = false

  if (target === 'netlify' && !configOnly) {
    if (resuming) {
      note('Resuming, so the database is whatever .deploy-state.json recorded.')
      databaseUrl = flags['database-url'] ? String(flags['database-url']) : ''
      bringYourOwnDatabase = Boolean(databaseUrl)
    } else {
      note('Railway can provision Postgres for you, or you can point at one you already have.')
      const source = await choose('Where is the database?', [
        { value: 'provision', label: 'Provision one on Railway now' },
        { value: 'existing', label: 'I already have a connection string' },
      ], opts('database-source',
              { fallback: flags['database-url'] ? 'existing' : 'provision' }))

      if (source === 'existing') {
        bringYourOwnDatabase = true
        databaseUrl = await ask('DATABASE_URL', {
          validate: validateDatabaseUrl,
          hint: 'Example: postgresql://user:secret@caboose.proxy.rlwy.net:15474/railway',
          ...opts('database-url'),
        })
      }
    }
  } else {
    note('The whole system addresses Postgres through one variable: DATABASE_URL.')
    databaseUrl = await ask('DATABASE_URL', {
      fallback: savedBackend.DATABASE_URL || 'postgresql://adms:adms@localhost:5432/openadms',
      validate: validateDatabaseUrl,
      hint: 'No Postgres yet? `docker compose up -d db` in this repo gives you one.',
      ...opts('database-url'),
    })
    bringYourOwnDatabase = true
  }

  // Fail here, with a readable reason, rather than three steps later.
  if (databaseUrl && !DRY_RUN) {
    const probe = checkDatabase(databaseUrl)
    if (probe.ok) {
      ok(`Connected: ${probe.version}`)
    } else if (probe.skipped) {
      warn('psql is not installed, so the connection was not verified.')
    } else {
      warn(`Could not connect: ${probe.reason}`)
      if (/does not resolve|nothing is listening/.test(probe.reason)) {
        note('If you have Docker, this repo ships a local Postgres:')
        note(`  ${c.cyan}docker compose up -d db${c.reset}`)
        note('  then use  postgresql://adms:adms@localhost:5432/openadms')
      }
      const carryOn = await confirm('Continue with that URL anyway?', false,
                                    { unattended: UNATTENDED })
      if (!carryOn) {
        databaseUrl = await ask('DATABASE_URL',
                                { validate: validateDatabaseUrl, ...opts('database-url') })
      }
    }
  }

  /* ---- 4. identity ------------------------------------------------------ */
  step('Instance identity')

  let instanceName
  let organization
  let instanceKey
  let jwtSecret
  let keypair = null

  if (resuming) {
    instanceName = saved.INSTANCE_NAME || 'Open ADMS'
    organization = saved.ORGANIZATION || ''
    instanceKey = saved.INSTANCE_UNIQUE_KEY
    jwtSecret = savedBackend.JWT_SECRET
    ok(`Reusing the identity of "${instanceName}"`)
    note('The instance key does not rotate, so a resume never mints a new one.')
    if (!jwtSecret) {
      warn('backend/.env has no JWT_SECRET. Minting a new one.')
      jwtSecret = crypto.randomBytes(32).toString('hex')
    }
  } else {
    instanceName = await ask('Name this instance',
                             { fallback: 'Open ADMS', ...opts('instance-name') })
    organization = await ask('Organization', { fallback: '', ...opts('organization') })
    instanceKey = newInstanceKey()
    jwtSecret = crypto.randomBytes(32).toString('hex')
    keypair = newKeypair()

    ok(`INSTANCE_UNIQUE_KEY ${c.cyan}${instanceKey}${c.reset}`)
    note('Peers reference this deployment by that key. Keep it; it does not rotate.')
    ok('Ed25519 signing key pair generated')
  }

  /* ---- 5. federation ---------------------------------------------------- */
  let registry = String(saved.REGISTRY_OPT_IN || '') === 'true'
  let registryUrl = ''
  if (!resuming) {
    step('Peer federation')
    registry = await confirm('Publish this instance to a peer discovery registry?',
                             false, opts('registry'))
    registryUrl = registry
      ? await ask('Registry URL', { validate: validateHttpUrl, ...opts('registry-url') })
      : ''
  } else {
    registryUrl = savedBackend.REGISTRY_URL || ''
  }

  /* ---- 6. naming -------------------------------------------------------- */
  const prefix = target === 'local'
    ? 'openadms'
    : await ask('Site name prefix', {
        fallback: 'openadms',
        validate: (v) => (/^[a-z0-9][a-z0-9-]{1,30}$/.test(v)
          ? null : 'Lowercase letters, digits and hyphens only.'),
        ...opts('site-prefix'),
      })

  const config = {
    instanceName, organization, instanceKey, jwtSecret, databaseUrl,
    bringYourOwnDatabase, registryUrl,
    demo: flags.demo === undefined ? true : flags.demo !== 'false',
    // Absent means never. A volume seed is minutes of work and hundreds of
    // megabytes, so an unattended run only gets one when it asks by number.
    // largeSeed is the TOTAL number of tickets, split across the projects being
    // filled; largeProjects is how many further demo projects to build first.
    largeSeed: flags['large-seed'],
    largeProjects: flags['large-projects'],
    // The other shape of demo data: twenty varied projects inside ten thousand
    // tickets, which is the one that fits a free database.
    showcaseSeed: flags['showcase-seed'],
  }

  /* ---- 7. provision ----------------------------------------------------- */
  let apiUrl = ''
  let backOfficeUrl = ''
  let fieldAppUrl = ''

  if (target === 'netlify' && !configOnly) {
    const result = await provisionRailwayNetlify({ config, prefix })

    if (!result.ok) {
      warn('Provisioning stopped. Progress is in .deploy-state.json, so '
           + 're-running picks up from here.')
      closePrompts()
      process.exitCode = 1
      return
    }

    if (!DRY_RUN) {
      apiUrl = result.apiUrl
      backOfficeUrl = result.backOfficeUrl
      fieldAppUrl = result.fieldAppUrl
      databaseUrl = result.databaseUrl || databaseUrl
    }
  } else if (target === 'aws' || target === 'gcp') {
    step(`Provisioning ${target}`)
    note('The AWS and GCP paths are Terraform stacks rather than a CLI walk-through.')
    note(`  cd deploy/terraform/${target} && terraform init && terraform apply`)
    note('Pass -var="jwt_secret=..." -var="instance_key=..." from the values above.')
    apiUrl = await ask('API base URL, once that stack has applied',
                       { fallback: 'http://localhost:8080/api/v1',
                         validate: validateHttpUrl, ...opts('api-url') })
  } else {
    apiUrl = await ask('API base URL (VITE_API_URL)', {
      fallback: savedBackend.VITE_API_URL || 'http://localhost:8080/api/v1',
      validate: validateHttpUrl,
      ...opts('api-url'),
    })
  }

  /* ---- 8. write config -------------------------------------------------- */
  if (DRY_RUN) {
    step('Dry run complete')
    note('Nothing was created. Re-run without --dry-run to do it for real.')
    closePrompts()
    return
  }

  step('Writing configuration')

  const corsRegex = backOfficeUrl && fieldAppUrl
    ? `^https://([a-z0-9-]+--)?(${[backOfficeUrl, fieldAppUrl]
        .map((u) => u.replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\./g, '\\.'))
        .join('|')})$`
    : CORS_DEFAULT

  writeEnv('backend/.env', {
    DATABASE_URL: databaseUrl,
    JWT_SECRET: jwtSecret,
    INSTANCE_KEY: instanceKey,
    ENVIRONMENT: target === 'local' ? 'development' : 'production',
    PORT: 8080,
    LOG_LEVEL: 'info',
    REGISTRY_URL: registryUrl,
    CORS_ORIGIN_REGEX: corsRegex,
  })
  writeEnv('frontend/.env', { VITE_API_URL: apiUrl, VITE_APP_NAME: instanceName })
  writeEnv('mobile/.env', { VITE_API_URL: apiUrl, VITE_APP_NAME: `${instanceName} Field` })
  writeEnv('database/.env', { DATABASE_URL: databaseUrl })
  writeEnv('.instance', {
    INSTANCE_NAME: instanceName,
    ORGANIZATION: organization,
    INSTANCE_UNIQUE_KEY: instanceKey,
    REGISTRY_OPT_IN: registry,
    TARGET: target,
    CREATED_AT: saved.CREATED_AT || new Date().toISOString(),
  })

  if (keypair) {
    fs.writeFileSync(path.join(ROOT, '.instance-key.pem'), keypair.privateKeyPem,
                     { mode: 0o600 })
    fs.writeFileSync(path.join(ROOT, '.instance-key.pub'), keypair.publicKeyPem,
                     { mode: 0o644 })
    ok('wrote .instance-key.pem (private, chmod 600) and .instance-key.pub')
  }

  /* ---- 9. local schema, when the netlify path has not already done it ---- */
  if (target !== 'netlify' && databaseUrl) {
    step('Database schema')
    if (!has('psql')) {
      warn('psql is not on PATH, so the schema was not applied.')
      note('Install it, then run:  ./database/setup.sh --with-demo --test')
    } else if (await confirm('Apply the migrations and seed now?', true, opts('migrate'))) {
      const withDemo = await confirm('Include the worked demo project?', true, opts('demo'))
      const args = ['./setup.sh']
      if (withDemo) args.push('--with-demo')
      args.push('--test')
      const result = run('bash', args, {
        cwd: path.join(ROOT, 'database'),
        env: { ...process.env, DATABASE_URL: databaseUrl,
               ADMS_INSTANCE_NAME: instanceName, ADMS_ORGANIZATION: organization },
      })
      if (result.ok) {
        ok('Schema applied and verified')
        await seedVolume({
          root: ROOT, databaseUrl, unattended: UNATTENDED, config, withDemo,
        })
      } else {
        warn('The setup script exited non-zero. Check the output above.')
      }
    }
  }

  /* ---- 10. summary ------------------------------------------------------ */
  step('Ready')
  say(`
  ${c.bold}${instanceName}${c.reset}
  ${c.dim}instance key${c.reset}  ${instanceKey}
  ${c.dim}api${c.reset}           ${apiUrl || '(not deployed yet)'}${
    backOfficeUrl ? `\n  ${c.dim}back office${c.reset}   ${backOfficeUrl}` : ''}${
    fieldAppUrl ? `\n  ${c.dim}field app${c.reset}     ${fieldAppUrl}` : ''}
`)

  if (target === 'netlify' && backOfficeUrl) {
    say(`  ${c.bold}Sign in${c.reset}
    Open ${backOfficeUrl} and use one of the demo accounts
    (admin / manager / analyst / monitor1), password ${c.cyan}openadms${c.reset}.
    Change those before anyone real touches this.
`)
  } else {
    say(`  ${c.bold}Run it locally${c.reset}
    ${c.dim}api${c.reset}          cd backend  && uvicorn app.main:app --reload --port 8080
    ${c.dim}back office${c.reset}  cd frontend && npm run dev
    ${c.dim}field app${c.reset}    cd mobile   && npm run dev
`)
  }

  say(`  ${c.bold}Share a project with a peer${c.reset}
    1. Ask the peer for their /peer/identity response
    2. Add them under Sharing & Peers, paste their public key, mark them trusted
    3. Set the project visibility to restricted and tick their instance
`)

  closePrompts()
}

main().catch((error) => {
  say(`\n${c.red}Setup failed:${c.reset} ${error.message}`)
  closePrompts()
  process.exit(1)
})

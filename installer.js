#!/usr/bin/env node
/**
 * Open ADMS installer.
 *
 *   npm run setup                    interactive
 *   npm run setup -- --yes --target=local --database-url=...   unattended
 *   npm run setup -- --dry-run       show the provisioning plan, change nothing
 *
 * What it does, in order:
 *   1. Asks where this instance is going.
 *   2. Checks every CLI that target needs, offers to install what is missing,
 *      and walks you through signing in. Control comes back here either way.
 *   3. Mints the INSTANCE_UNIQUE_KEY and an Ed25519 signing key pair.
 *   4. Provisions the target with its own CLI, applies the schema, deploys.
 *   5. Writes the .env files with the URLs it actually ended up with.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  ask, c, checkDatabase, choose, closePrompts, confirm, fail, has, initPrompts,
  note, ok, run, say, step, validateDatabaseUrl, validateHttpUrl, warn,
} from './deploy/lib/cli.mjs'
import { preflight } from './deploy/lib/preflight.mjs'
import { provisionNetlifyRailway } from './deploy/lib/provision-netlify-railway.mjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))

const flags = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.length ? rest.join('=') : true]
}))

const UNATTENDED = Boolean(flags.yes || flags.y || flags['non-interactive'])
const DRY_RUN = Boolean(flags['dry-run'])

initPrompts({ unattended: UNATTENDED })

const opts = (flag, extra = {}) => ({ unattended: UNATTENDED, suppliedValue: flags[flag], ...extra })

/* ------------------------------------------------------------------ keys */
const newInstanceKey = () => crypto.randomBytes(32).toString('hex')

function newKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

function writeEnv(file, values) {
  const body = Object.entries(values).map(([k, v]) => `${k}=${v ?? ''}`).join('\n')
  const target = path.join(ROOT, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${body}\n`, { mode: 0o600 })
  ok(`wrote ${file}`)
}

const CORS_DEFAULT =
  '^https?://(localhost(:\\d+)?|127\\.0\\.0\\.1(:\\d+)?|[a-z0-9-]+\\.netlify\\.app'
  + '|[a-z0-9-]+\\.netlify\\.live|[a-z0-9-]+\\.up\\.railway\\.app'
  + '|[a-z0-9-]+\\.onrender\\.com|[a-z0-9-]+\\.web\\.app'
  + '|[a-z0-9]+\\.cloudfront\\.net)$'

/* ------------------------------------------------------------------ main */
async function main() {
  say(`
${c.bold}Open ADMS installer${c.reset}
${c.dim}Automated Debris Management System — self-hosted, portable, federated.${c.reset}${
  DRY_RUN ? `\n${c.amber}Dry run: nothing will be created or changed.${c.reset}` : ''}
`)

  /* ---- 1. Target -------------------------------------------------------- */
  step('Deployment target')
  const target = await choose('Where should this instance live?', [
    { value: 'netlify', label: 'Netlify + Railway',
      hint: 'frontends on Netlify, API and Postgres on Railway' },
    { value: 'aws', label: 'AWS', hint: 'S3 + CloudFront, App Runner, RDS' },
    { value: 'gcp', label: 'Google Cloud', hint: 'Firebase Hosting, Cloud Run, Cloud SQL' },
    { value: 'local', label: 'Local only', hint: 'write the .env files and stop' },
  ], opts('target', { fallback: 'local' }))

  /* ---- 2. Tooling ------------------------------------------------------- */
  const tools = await preflight(target, {
    unattended: UNATTENDED,
    autoInstall: Boolean(flags['auto-install']),
  })

  if (!tools.ready) {
    if (tools.missing.length) {
      warn(`Still missing: ${tools.missing.join(', ')}`)
    }
    if (tools.notAuthed.length) {
      warn(`Not signed in: ${tools.notAuthed.join(', ')}`)
    }
    note('Install or sign in to those, then run this again. Nothing you have '
         + 'already answered is lost — the installer is safe to re-run.')

    const carryOn = target === 'local'
      ? true
      : await confirm('Continue anyway and just write the config files?', false,
                      { unattended: UNATTENDED })
    if (!carryOn) {
      closePrompts()
      return
    }
    flags.__configOnly = true
  }

  /* ---- 3. Database ------------------------------------------------------ */
  step('Database')

  let databaseUrl = ''
  let bringYourOwnDatabase = false

  if (target === 'netlify' && !flags.__configOnly) {
    note('Railway can provision Postgres for you, or you can point at one you already have.')
    const source = await choose('Where is the database?', [
      { value: 'provision', label: 'Provision one on Railway now' },
      { value: 'existing', label: 'I already have a connection string' },
    ], opts('database-source', { fallback: flags['database-url'] ? 'existing' : 'provision' }))

    if (source === 'existing') {
      bringYourOwnDatabase = true
      databaseUrl = await ask('DATABASE_URL', {
        validate: validateDatabaseUrl,
        hint: 'Example: postgresql://user:secret@caboose.proxy.rlwy.net:15474/railway',
        ...opts('database-url'),
      })
    }
  } else {
    note('The whole system addresses Postgres through one variable: DATABASE_URL.')
    databaseUrl = await ask('DATABASE_URL', {
      fallback: 'postgresql://adms:adms@localhost:5432/openadms',
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
        databaseUrl = await ask('DATABASE_URL', {
          validate: validateDatabaseUrl, ...opts('database-url'),
        })
      }
    }
  }

  /* ---- 4. Identity ------------------------------------------------------ */
  step('Instance identity')
  const instanceName = await ask('Name this instance',
                                 { fallback: 'Open ADMS', ...opts('instance-name') })
  const organization = await ask('Organization', { fallback: '', ...opts('organization') })

  const instanceKey = newInstanceKey()
  const { publicKeyPem, privateKeyPem } = newKeypair()
  const jwtSecret = crypto.randomBytes(32).toString('hex')

  ok(`INSTANCE_UNIQUE_KEY ${c.cyan}${instanceKey}${c.reset}`)
  note('Peers reference this deployment by that key. Keep it; it does not rotate.')
  ok('Ed25519 signing key pair generated')

  /* ---- 5. Federation ---------------------------------------------------- */
  step('Peer federation')
  const registry = await confirm(
    'Publish this instance to a peer discovery registry?', false, opts('registry'))
  const registryUrl = registry
    ? await ask('Registry URL', { validate: validateHttpUrl, ...opts('registry-url') })
    : ''

  /* ---- 6. Naming -------------------------------------------------------- */
  const sitePrefix = target === 'local'
    ? 'openadms'
    : await ask('Site name prefix', {
        fallback: 'openadms',
        validate: (v) => (/^[a-z0-9][a-z0-9-]{1,30}$/.test(v)
          ? null : 'Lowercase letters, digits and hyphens only.'),
        ...opts('site-prefix'),
      })

  const config = {
    instanceName, organization, instanceKey, jwtSecret, databaseUrl,
    bringYourOwnDatabase, sitePrefix, registryUrl,
    demo: flags.demo === undefined ? true : flags.demo !== 'false',
  }

  /* ---- 7. Provision ----------------------------------------------------- */
  let apiUrl = ''
  let backOfficeUrl = ''
  let fieldAppUrl = ''

  if (target === 'netlify' && !flags.__configOnly) {
    const result = await provisionNetlifyRailway({
      root: ROOT, config, unattended: UNATTENDED, dryRun: DRY_RUN,
    })

    if (!result.ok) {
      warn('Provisioning stopped. Your answers are kept in .deploy-state.json, '
           + 'so re-running picks up from here.')
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
    note(`  cd deploy/${target} && terraform init && terraform apply`)
    note('Pass -var="jwt_secret=..." -var="instance_key=..." from the values above.')
    apiUrl = await ask('API base URL, once that stack has applied',
                       { fallback: 'http://localhost:8080/api/v1',
                         validate: validateHttpUrl, ...opts('api-url') })
  } else {
    apiUrl = await ask('API base URL (VITE_API_URL)', {
      fallback: 'http://localhost:8080/api/v1',
      validate: validateHttpUrl,
      ...opts('api-url'),
    })
  }

  /* ---- 8. Write config -------------------------------------------------- */
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
    CREATED_AT: new Date().toISOString(),
  })

  fs.writeFileSync(path.join(ROOT, '.instance-key.pem'), privateKeyPem, { mode: 0o600 })
  fs.writeFileSync(path.join(ROOT, '.instance-key.pub'), publicKeyPem, { mode: 0o644 })
  ok('wrote .instance-key.pem (private, chmod 600) and .instance-key.pub')

  /* ---- 9. Local schema, if we have not already done it ------------------ */
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
      if (result.ok) ok('Schema applied and verified')
      else warn('The setup script exited non-zero. Check the output above.')
    }
  }

  /* ---- 10. Summary ------------------------------------------------------ */
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
    (admin / manager / analyst / jmiller), password ${c.cyan}openadms${c.reset}.
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
  say(`\n${c.red}Installer failed:${c.reset} ${error.message}`)
  closePrompts()
  process.exit(1)
})

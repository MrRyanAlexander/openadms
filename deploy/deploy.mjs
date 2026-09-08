#!/usr/bin/env node
/**
 * Standalone deploy and preflight, for when you have already run the installer
 * once and just want to push again or check your tooling.
 *
 *   npm run preflight                 check tools and sign-in for every target
 *   npm run preflight -- netlify      check just one target
 *   npm run deploy:netlify            re-run the Netlify + Railway provisioning
 *   npm run deploy:netlify -- --dry-run
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { c, closePrompts, initPrompts, note, ok, say, step, warn } from './lib/cli.mjs'
import { preflight, TARGET_TOOLS } from './lib/preflight.mjs'
import { provisionNetlifyRailway } from './lib/provision-netlify-railway.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.length ? rest.join('=') : true]
}))
const positional = args.filter((a) => !a.startsWith('--'))

const UNATTENDED = Boolean(flags.yes || flags.y)
const DRY_RUN = Boolean(flags['dry-run'])

initPrompts({ unattended: UNATTENDED })

function readEnv(file) {
  try {
    return Object.fromEntries(
      fs.readFileSync(path.join(ROOT, file), 'utf8')
        .split('\n').filter(Boolean).filter((l) => !l.startsWith('#'))
        .map((line) => {
          const i = line.indexOf('=')
          return [line.slice(0, i), line.slice(i + 1)]
        }))
  } catch {
    return {}
  }
}

async function main() {
  if (flags.check || positional[0] === undefined) {
    const targets = positional.length ? positional : Object.keys(TARGET_TOOLS)
    for (const target of targets) {
      const result = await preflight(target, { unattended: UNATTENDED })
      if (result.ready) ok(`${target}: ready`)
      else warn(`${target}: missing ${[...result.missing, ...result.notAuthed].join(', ') || 'nothing'}`)
    }
    closePrompts()
    return
  }

  const target = positional[0]
  if (target !== 'netlify') {
    warn(`Only the netlify target has a CLI provisioner. For ${target}:`)
    note(`  cd deploy/${target} && terraform init && terraform apply`)
    closePrompts()
    return
  }

  const backend = readEnv('backend/.env')
  const instance = readEnv('.instance')

  if (!backend.JWT_SECRET || !instance.INSTANCE_UNIQUE_KEY) {
    warn('No .env yet. Run `npm run setup` first so this instance has an identity.')
    closePrompts()
    process.exitCode = 1
    return
  }

  const tools = await preflight('netlify', { unattended: UNATTENDED })
  if (!tools.ready) {
    warn('Fix the tooling above, then run this again.')
    closePrompts()
    process.exitCode = 1
    return
  }

  const result = await provisionNetlifyRailway({
    root: ROOT,
    unattended: UNATTENDED,
    dryRun: DRY_RUN,
    config: {
      instanceName: instance.INSTANCE_NAME || 'Open ADMS',
      organization: instance.ORGANIZATION || '',
      instanceKey: instance.INSTANCE_UNIQUE_KEY,
      jwtSecret: backend.JWT_SECRET,
      databaseUrl: flags['database-url'] || backend.DATABASE_URL || '',
      bringYourOwnDatabase: Boolean(flags['database-url']),
      sitePrefix: flags['site-prefix'] || 'openadms',
      demo: flags.demo !== 'false',
    },
  })

  if (!result.ok) {
    process.exitCode = 1
  } else if (!DRY_RUN) {
    step('Deployed')
    say(`
  ${c.dim}api${c.reset}          ${result.apiUrl}
  ${c.dim}back office${c.reset}  ${result.backOfficeUrl}
  ${c.dim}field app${c.reset}    ${result.fieldAppUrl}
`)
  }

  closePrompts()
}

main().catch((error) => {
  say(`\n${c.red}Deploy failed:${c.reset} ${error.message}`)
  closePrompts()
  process.exit(1)
})

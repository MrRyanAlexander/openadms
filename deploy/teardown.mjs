#!/usr/bin/env node
/**
 * Open ADMS teardown.
 *
 *   npm run teardown                 interactive, asks before each destructive step
 *   npm run teardown -- --yes        no prompts
 *   npm run teardown -- --local-only leave the cloud alone, reset this checkout
 *   npm run teardown -- --dry-run    print the plan, change nothing
 *
 * The inverse of `npm run setup`. It removes everything that makes this
 * checkout look "already installed", so the next `npm run setup` is a genuine
 * first run rather than a resume.
 *
 * What it deletes:
 *   Netlify   every site recorded in .deploy-state.json
 *   Railway   the whole project (api, Postgres, proxies, domains, data)
 *   Local     .deploy-state.json, the .env files, .instance*, the Netlify
 *             folder links, and the built dist/ folders
 *
 * What it never touches:
 *   git       no commits, no branches, no pushes, no history rewriting. It
 *             prints where the repo stands and leaves it entirely alone.
 *   GitHub    the repo stays; setup re-pushes to it on the next run.
 *   source    nothing outside the generated files listed above.
 *
 * The instance key does not rotate, so .instance and the Ed25519 pair are
 * copied into backup/ before removal rather than simply deleted.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  ask, c, capture, closePrompts, cmdEcho, confirm, fail, initPrompts,
  note, ok, say, step, warn,
} from './lib/cli.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const STATE_FILE = path.join(ROOT, '.deploy-state.json')

const flags = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=')
  return [key, rest.length ? rest.join('=') : true]
}))

const UNATTENDED = Boolean(flags.yes || flags.y)
const DRY_RUN = Boolean(flags['dry-run'])
const LOCAL_ONLY = Boolean(flags['local-only'])

initPrompts({ unattended: UNATTENDED })

/** Generated files and folders. Every one of these is gitignored. */
const ARTIFACTS = [
  '.deploy-state.json',
  '.instance',
  '.instance-key.pem',
  '.instance-key.pub',
  'backend/.env',
  'frontend/.env',
  'mobile/.env',
  'database/.env',
  'frontend/.netlify',
  'mobile/.netlify',
  'frontend/dist',
  'mobile/dist',
]

/** Worth keeping a copy of: the instance key is meant not to rotate. */
const WORTH_KEEPING = ['.instance', '.instance-key.pem', '.instance-key.pub', 'backend/.env']

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function cli(bin, args, { timeout = 180000 } = {}) {
  cmdEcho([bin, ...args].join(' '))
  if (DRY_RUN) return { ok: true, stdout: '', stderr: '', dryRun: true }
  const result = capture(bin, args, { cwd: ROOT, timeout })
  if (!result.ok) {
    const detail = result.stderr || result.stdout || result.error?.message || ''
    if (detail) note(detail.split('\n').slice(0, 4).join('\n    '))
  }
  return result
}

const exists = (rel) => fs.existsSync(path.join(ROOT, rel))

/* ========================================================================= */
async function main() {
  const state = loadState()
  const sites = Object.values(state.sites || {})

  say(`
${c.bold}Open ADMS teardown${c.reset}
${c.dim}Removes the deployment and resets this checkout to a pre-install state.${c.reset}${
  DRY_RUN ? `\n${c.amber}Dry run: nothing will be deleted.${c.reset}` : ''}
`)

  /* ---- 1. Show the blast radius ---------------------------------------- */
  step('What will be destroyed')

  if (!LOCAL_ONLY && state.railwayProject) {
    note(`Railway project  ${state.railwayProject}  (api, Postgres, all data)`)
  } else if (!LOCAL_ONLY) {
    note('Railway project  none recorded in .deploy-state.json')
  }

  if (!LOCAL_ONLY && sites.length) {
    sites.forEach((s) => note(`Netlify site     ${s.name}  ${s.url || ''}`))
  } else if (!LOCAL_ONLY) {
    note('Netlify sites    none recorded in .deploy-state.json')
  }

  const present = ARTIFACTS.filter(exists)
  if (present.length) {
    present.forEach((f) => note(`Local            ${f}`))
  } else {
    note('Local            nothing to remove; this checkout is already clean')
  }

  if (!present.length && (LOCAL_ONLY || (!state.railwayProject && !sites.length))) {
    say('')
    ok('Nothing to tear down.')
    closePrompts()
    return
  }

  note('')
  note('git history, branches and GitHub are not touched by any of this.')

  /* ---- 2. Confirm ------------------------------------------------------- */
  if (!DRY_RUN && !UNATTENDED) {
    say('')
    const phrase = state.railwayProject || 'openadms'
    const typed = await ask(`Type ${c.bold}${phrase}${c.reset} to confirm`, { fallback: '' })
    if (typed.trim() !== phrase) {
      say('')
      warn('That did not match. Nothing was deleted.')
      closePrompts()
      return
    }
  }

  /* ---- 3. Keep a copy of the identity files ----------------------------- */
  const keepable = WORTH_KEEPING.filter(exists)
  if (keepable.length && !DRY_RUN) {
    step('Backing up the instance identity')
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const dir = path.join(ROOT, 'backup', `teardown-${stamp}`)
    fs.mkdirSync(dir, { recursive: true })
    for (const rel of keepable) {
      fs.copyFileSync(path.join(ROOT, rel), path.join(dir, path.basename(rel)))
    }
    ok(`Copied ${keepable.length} file(s) to backup/teardown-${stamp}/`)
    note('The instance key does not rotate, so this is the only copy once the')
    note('database holding it is gone.')
  }

  /* ---- 4. Netlify ------------------------------------------------------- */
  if (!LOCAL_ONLY && sites.length) {
    step('Netlify sites')
    for (const site of sites) {
      if (!site.id) {
        warn(`No site id recorded for ${site.name}; delete it in the Netlify UI.`)
        continue
      }
      const deleted = cli('netlify', ['sites:delete', site.id, '--force'])
      if (deleted.ok) {
        ok(`Deleted ${site.name}`)
      } else {
        warn(`Could not delete ${site.name}.`)
        note(`Netlify dashboard: ${site.name}, Site configuration, Delete this project.`)
        note('The subdomain is only released once the site is gone, and setup')
        note('reuses that exact name, so this one is worth finishing by hand.')
      }
    }
  }

  /* ---- 5. Railway ------------------------------------------------------- */
  if (!LOCAL_ONLY && state.railwayProject) {
    step('Railway project')
    note('This deletes every service, deployment and byte of data in it.')

    const go = DRY_RUN || UNATTENDED
      ? true
      : await confirm(`Delete the Railway project "${state.railwayProject}"?`, true)

    if (go) {
      const deleted = cli('railway',
                          ['delete', '--project', state.railwayProject, '--yes'],
                          { timeout: 180000 })
      if (deleted.ok) {
        ok(`Deleted Railway project "${state.railwayProject}"`)
      } else {
        warn('Could not delete the project from the CLI.')
        note('If you have 2FA on, railway delete wants --2fa-code <code>.')
        note('Otherwise: Railway dashboard, project Settings, Danger, Delete Project.')
      }

      // Clear the directory link so the next setup runs `railway init` for real
      // rather than reporting "already linked" to a project that is gone.
      const unlinked = cli('railway', ['unlink'], { timeout: 60000 })
      if (unlinked.ok) ok('Unlinked this directory from Railway')
      else note('Could not unlink. Run `railway unlink` here before the next setup.')
    } else {
      note('Left the Railway project alone.')
    }
  }

  /* ---- 6. Local artifacts ----------------------------------------------- */
  if (present.length) {
    step('Local files')
    for (const rel of present) {
      if (!DRY_RUN) fs.rmSync(path.join(ROOT, rel), { recursive: true, force: true })
      ok(`removed ${rel}`)
    }
  }

  /* ---- 7. Where the repo stands ----------------------------------------- */
  step('Repository (read-only, nothing changed)')

  const git = (args) => capture('git', args, { cwd: ROOT, encoding: 'utf8' })
  const branch = git(['branch', '--show-current']).stdout?.trim()
  const dirty = git(['status', '--porcelain']).stdout?.trim()
  const counts = git(['rev-list', '--left-right', '--count', 'origin/main...HEAD'])
    .stdout?.trim()

  note(`branch           ${branch || 'unknown'}`)
  if (counts) {
    const [behind, ahead] = counts.split(/\s+/)
    note(`vs origin/main   ${ahead} ahead, ${behind} behind`)
  }
  note(`uncommitted      ${dirty ? `${dirty.split('\n').length} file(s)` : 'none'}`)

  if (dirty) {
    note('')
    note('Setup runs `git add --all`, commits and pushes as its GitHub step, so')
    note('anything above gets swept into that commit. Commit it yourself first if')
    note('you want it to land under its own message.')
  }
  if (branch && branch !== 'main') {
    note('')
    warn(`You are on "${branch}". Setup links the Railway api service to main.`)
    note('Merge to main before the next run or the API builds the wrong code.')
  }

  /* ---- 8. Done ---------------------------------------------------------- */
  step('Done')
  say(`
  This checkout no longer looks installed.
  Next run starts from zero:  ${c.cyan}npm run setup${c.reset}
`)

  closePrompts()
}

main().catch((error) => {
  say(`\n${c.red}Teardown failed:${c.reset} ${error.message}`)
  closePrompts()
  process.exit(1)
})

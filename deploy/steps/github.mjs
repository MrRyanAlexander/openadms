/**
 * Step: get this commit onto GitHub, because that is what Railway builds.
 *
 * This runs every time and a recorded "already pushed" is a note, not proof.
 * When the installer itself is fixed between runs, which is the normal case
 * for a resumed deploy, the local tree holds the fix and the remote does not.
 * Skipping the push there deploys the old commit and the run fails for a
 * reason that has nothing to do with the code being looked at. Verifying
 * against the remote costs one ls-remote.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fail, note, ok, step, warn } from '../lib/ui.mjs'
import { cli } from '../lib/shell.mjs'

const GITIGNORE_MUST_HAVE = [
  '.deploy-state.json', 'backend/.env', '.instance', 'node_modules',
]

export async function pushToGithub({ root, record }) {
  step('GitHub, pushing code')

  const remoteResult = cli('git', ['remote', 'get-url', 'origin'],
                           { cwd: root, quiet: true })
  if (!remoteResult.ok || !remoteResult.stdout) {
    fail('No git remote named "origin" found.')
    note('Create a GitHub repo and add it as a remote, then re-run:')
    note('  gh repo create <name> --public --source . --remote origin --push')
    return { ok: false }
  }

  const repoSlug = remoteResult.stdout.trim()
    .replace(/^git@github\.com:/, '')
    .replace(/^https:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
  record('githubRepo', repoSlug)

  const statusResult = cli('git', ['status', '--porcelain'], { cwd: root, quiet: true })

  if (statusResult.stdout?.trim()) {
    const gitignorePath = path.join(root, '.gitignore')
    let gitignore = ''
    try { gitignore = fs.readFileSync(gitignorePath, 'utf8') } catch { /* new file */ }
    const missing = GITIGNORE_MUST_HAVE.filter(
      (entry) => !gitignore.split('\n').some((l) => l.trim() === entry))
    if (missing.length) {
      fs.writeFileSync(gitignorePath,
        `${gitignore}${gitignore.endsWith('\n') ? '' : '\n'}${missing.join('\n')}\n`)
      ok('Updated .gitignore with sensitive and runtime files')
    }

    if (!cli('git', ['add', '--all'], { cwd: root }).ok) {
      fail('git add failed.')
      return { ok: false }
    }

    const committed = cli('git',
      ['commit', '-m', 'chore: deploy commit [openadms setup]'], { cwd: root })
    if (!committed.ok && !/nothing to commit/i.test(committed.stdout + committed.stderr)) {
      fail('git commit failed.')
      note(committed.stderr || committed.stdout)
      return { ok: false }
    }
  }

  const branch = cli('git', ['rev-parse', '--abbrev-ref', 'HEAD'],
                     { cwd: root, quiet: true }).stdout?.trim() || 'main'
  const localHead = cli('git', ['rev-parse', 'HEAD'],
                        { cwd: root, quiet: true }).stdout?.trim()
  const remoteHead = cli('git', ['ls-remote', 'origin', `refs/heads/${branch}`],
                         { cwd: root, quiet: true, timeout: 60000 })
    .stdout?.trim().split(/\s+/)[0] || ''

  if (branch !== 'main') {
    warn(`On branch "${branch}", but the Railway service is linked to main.`)
    note('Railway will not build this branch. Merge it into main, or point the')
    note('api service at it in the dashboard.')
  }

  if (localHead && localHead === remoteHead) {
    record('githubPushed', true)
    ok(`github.com/${repoSlug} already has ${localHead.slice(0, 7)} on ${branch}`)
    return { ok: true, repoSlug, branch }
  }

  const pushed = cli('git', ['push', 'origin', 'HEAD'], { cwd: root, timeout: 120000 })
  if (!pushed.ok) {
    fail('git push failed.')
    note(pushed.stderr || pushed.stdout)
    note('Make sure you have push access to the remote and try again.')
    return { ok: false }
  }

  record('githubPushed', true)
  ok(`Pushed ${(localHead || '').slice(0, 7)} to github.com/${repoSlug}`)
  return { ok: true, repoSlug, branch }
}

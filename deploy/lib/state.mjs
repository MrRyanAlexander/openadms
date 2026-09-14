/**
 * .deploy-state.json: what the last run got as far as.
 *
 * It is a resume hint, never evidence. Every value in here was true when it
 * was written and may not be now: a recorded API URL is minted by Railway the
 * moment a service exists, long before, and regardless of whether, a build
 * succeeds. Steps that read this file re-verify before trusting it.
 */
import fs from 'node:fs'
import path from 'node:path'

export const STATE_FILE = '.deploy-state.json'

export function loadState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, STATE_FILE), 'utf8'))
  } catch {
    return {}
  }
}

export function saveState(root, state) {
  fs.writeFileSync(path.join(root, STATE_FILE),
                   `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 })
}

/**
 * A recorder bound to one run. Writes through to disk on every change so an
 * interrupted run resumes from wherever it actually got to.
 */
export function stateRecorder(root, { dryRun = false } = {}) {
  const state = loadState(root)
  const record = (key, value) => {
    state[key] = value
    if (!dryRun) saveState(root, state)
    return value
  }
  return { state, record }
}

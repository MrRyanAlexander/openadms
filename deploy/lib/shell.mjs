/**
 * Everything that runs: child processes, tool presence, and the validators
 * that reject a bad value before it is handed to a CLI.
 *
 * Nothing in here prompts. That is ui.mjs.
 */
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { cmdEcho, note } from './ui.mjs'

/** Run and capture. Never throws; the caller decides what a failure means. */
export function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8', shell: false, ...options,
  })
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error,
  }
}

/** Run with the operator's terminal attached, for anything interactive. */
export function run(command, args, options = {}) {
  cmdEcho([command, ...args].join(' '))
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })
  return { ok: result.status === 0, status: result.status, error: result.error }
}

/**
 * Run a step, echo it, and surface the error when it fails. This is the form
 * every provisioning step uses, so the transcript always shows the exact
 * command a person could paste to reproduce what happened.
 */
export function cli(bin, args, { cwd, timeout = 600000, quiet = false } = {}) {
  if (!quiet) cmdEcho([bin, ...args].join(' '))
  const result = capture(bin, args, { cwd, timeout })
  if (!result.ok && !quiet) {
    const detail = result.stderr || result.stdout || result.error?.message || ''
    if (detail) note(detail.split('\n').slice(0, 6).join('\n    '))
  }
  return result
}

export function has(command) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which',
                          [command], { stdio: 'ignore' })
  return probe.status === 0
}

/**
 * The Railway and Netlify CLIs rename flags and subcommands between majors.
 * Try the modern spelling first and fall back through older ones, but only
 * when the failure actually looks like a flag the CLI does not know. A real
 * failure is returned as-is rather than retried in three different dialects.
 */
export const UNKNOWN_FLAG =
  /unexpected argument|unrecognized subcommand|unknown (flag|option)|invalid (flag|option)|Found argument .* which wasn't expected/i

export function tryVariants(bin, variants, options = {}) {
  let last = null
  for (const [index, args] of variants.entries()) {
    const quiet = index < variants.length - 1
    const result = cli(bin, args, { ...options, quiet })
    if (result.ok) return result
    last = result
    const output = `${result.stderr}\n${result.stdout}`
    if (!UNKNOWN_FLAG.test(output)) return result
    if (index < variants.length - 1) {
      note('That flag is not in this CLI version; trying the older spelling.')
    }
  }
  return last
}

/** Tolerant JSON parse for CLI output that prefixes banners onto its JSON. */
export function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch { /* fall through to the slice below */ }
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

export const firstUrl = (text) => {
  const m = (text || '').match(/https?:\/\/[^\s"',)]+/)
  return m ? m[0].replace(/[.,)]+$/, '') : null
}

/* ------------------------------------------------------------- validators */
export function validateDatabaseUrl(value) {
  if (!value) return 'A connection string is required.'
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    return 'Must start with postgresql://. A bare host:port is not a connection string.'
  }
  let url
  try {
    url = new URL(value)
  } catch {
    return 'That is not a parseable URL.'
  }
  if (!url.hostname) return 'No host in that URL.'
  if (url.hostname.toLowerCase() === 'host') {
    return 'That is the placeholder from the docs, not a real host.'
  }
  if (!url.pathname || url.pathname === '/') {
    return 'No database name after the port, for example /openadms or /railway.'
  }
  return null
}

export function validateHttpUrl(value) {
  if (!value) return 'A URL is required.'
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol)) return 'Must be http:// or https://'
    return null
  } catch {
    return 'That is not a parseable URL.'
  }
}

/**
 * Reachability check with a real query, so a wrong host fails here rather than
 * three steps later inside asyncpg.
 */
export function checkDatabase(databaseUrl) {
  if (!has('psql')) {
    return { ok: false, reason: 'psql is not installed', skipped: true }
  }
  const probe = capture('psql', [databaseUrl, '-tAc', 'SELECT version()'],
                        { timeout: 20000 })
  if (probe.ok) return { ok: true, version: probe.stdout.split(',')[0] }

  const stderr = probe.stderr || ''
  let reason = stderr.split('\n')[0] || 'connection failed'
  if (/could not translate host name/i.test(stderr)) {
    reason = 'that hostname does not resolve, so check the host part of the URL'
  } else if (/Connection refused/i.test(stderr)) {
    reason = 'nothing is listening on that host and port'
  } else if (/password authentication failed/i.test(stderr)) {
    reason = 'the username or password is wrong'
  } else if (/does not exist/i.test(stderr)) {
    reason = 'that database name does not exist on the server'
  }
  return { ok: false, reason, stderr }
}

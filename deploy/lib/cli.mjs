/**
 * Shared plumbing for the installer and the provisioners: coloured output,
 * prompts that re-ask instead of exiting, and command execution that always
 * shows the reader the exact command being run.
 */
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import readline from 'node:readline/promises'

export const c = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', blue: '\x1b[34m', amber: '\x1b[33m',
  red: '\x1b[31m', cyan: '\x1b[36m',
}

export const say = (s = '') => process.stdout.write(`${s}\n`)
export const step = (s) => say(`\n${c.green}==>${c.reset} ${c.bold}${s}${c.reset}`)
export const note = (s) => say(`    ${c.dim}${s}${c.reset}`)
export const ok = (s) => say(`  ${c.green}ok${c.reset}  ${s}`)
export const warn = (s) => say(`  ${c.amber}!!${c.reset}  ${s}`)
export const fail = (s) => say(`  ${c.red}xx${c.reset}  ${s}`)
export const cmdEcho = (s) => say(`  ${c.dim}$ ${s}${c.reset}`)

/* ------------------------------------------------------------------ input */
let rl = null
let forcedUnattended = false

/** True when there is nobody at a keyboard: piped stdin, CI, a cron run.
 *  Prompting in that situation hangs forever, so we fall back to defaults. */
export function isInteractive() {
  return Boolean(process.stdin.isTTY) && !process.env.CI
}

export function unattendedMode() {
  return forcedUnattended
}

export function initPrompts({ unattended }) {
  if (unattended) {
    forcedUnattended = true
    return null
  }
  if (!isInteractive()) {
    forcedUnattended = true
    warn('No interactive terminal detected, so every prompt will take its default.')
    note('Run this from a terminal, or pass --yes with explicit --flags.')
    return null
  }
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  }
  return rl
}

export function closePrompts() {
  rl?.close()
  rl = null
}

/**
 * Ask until the answer validates. A bad answer never ends the run — that was
 * the behaviour that made the first version of this installer so annoying.
 */
export async function ask(question, {
  fallback = '', secret = false, validate = null, hint = null, unattended = false,
  suppliedValue = undefined,
} = {}) {
  if (unattended || forcedUnattended || !rl) {
    const value = suppliedValue === undefined || suppliedValue === true
      ? fallback : String(suppliedValue)
    say(`  ${question}: ${c.dim}${secret ? '••••' : value}${c.reset}`)
    if (validate) {
      const problem = validate(value)
      if (problem) throw new Error(`${question}: ${problem}`)
    }
    return value
  }

  for (;;) {
    const suffix = fallback ? ` ${c.dim}(${secret ? '••••' : fallback})${c.reset}` : ''
    const answer = (await rl.question(`  ${question}${suffix}: `)).trim() || fallback
    if (!validate) return answer
    const problem = validate(answer)
    if (!problem) return answer
    warn(problem)
    if (hint) note(hint)
  }
}

export async function choose(question, options, { unattended = false, suppliedValue, fallback } = {}) {
  if (unattended || forcedUnattended || !rl) {
    const value = options.some((o) => o.value === suppliedValue)
      ? suppliedValue : (fallback ?? options[0].value)
    say(`  ${question} ${c.dim}${value}${c.reset}`)
    return value
  }
  say(`  ${question}`)
  options.forEach((o, i) => say(
    `    ${c.cyan}${i + 1}${c.reset}. ${o.label}  ${c.dim}${o.hint || ''}${c.reset}`))
  for (;;) {
    const raw = (await rl.question(`  Choice ${c.dim}[1-${options.length}]${c.reset}: `)).trim()
    const index = Number(raw) - 1
    if (options[index]) return options[index].value
    warn('Pick one of the numbers listed.')
  }
}

export async function confirm(question, fallback = true, { unattended = false, suppliedValue } = {}) {
  if (unattended || forcedUnattended || !rl) {
    const value = suppliedValue === undefined ? fallback
      : !['false', 'no', '0'].includes(String(suppliedValue).toLowerCase())
    say(`  ${question} ${c.dim}${value ? 'yes' : 'no'}${c.reset}`)
    return value
  }
  const hint = fallback ? 'Y/n' : 'y/N'
  const raw = (await rl.question(`  ${question} ${c.dim}[${hint}]${c.reset}: `)).trim().toLowerCase()
  if (!raw) return fallback
  return raw.startsWith('y')
}

/* ---------------------------------------------------------------- commands */
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

/** Run with the user's terminal attached, for anything interactive. */
export function run(command, args, options = {}) {
  cmdEcho([command, ...args].join(' '))
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options })
  return { ok: result.status === 0, status: result.status, error: result.error }
}

export function has(command) {
  const probe = spawnSync(process.platform === 'win32' ? 'where' : 'which',
                          [command], { stdio: 'ignore' })
  return probe.status === 0
}

/* ---------------------------------------------------------------- helpers */
export function validateDatabaseUrl(value) {
  if (!value) return 'A connection string is required.'
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    return 'Must start with postgresql:// — a bare host:port is not a connection string.'
  }
  let url
  try {
    url = new URL(value)
  } catch {
    return 'That is not a parseable URL.'
  }
  if (!url.hostname) return 'No host in that URL.'
  if (url.hostname === 'host' || url.hostname === 'HOST') {
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

/** Reachability check with a real query, so a wrong host fails here and not
 *  three steps later inside asyncpg. */
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
    reason = 'that hostname does not resolve — check the host part of the URL'
  } else if (/Connection refused/i.test(stderr)) {
    reason = 'nothing is listening on that host and port'
  } else if (/password authentication failed/i.test(stderr)) {
    reason = 'the username or password is wrong'
  } else if (/does not exist/i.test(stderr)) {
    reason = 'that database name does not exist on the server'
  }
  return { ok: false, reason, stderr }
}

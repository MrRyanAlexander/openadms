/**
 * Everything the operator sees and answers: colours, the step/ok/warn/note
 * vocabulary every step prints in, and prompts that re-ask instead of exiting.
 *
 * Nothing in here runs a command or touches the network. That is shell.mjs.
 */
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

let rl = null
let forcedUnattended = false

/**
 * True when there is somebody at a keyboard. Prompting a piped stdin or a CI
 * runner hangs forever, so every prompt falls back to its default instead.
 */
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
 * Ask until the answer validates. A bad answer never ends the run, which is
 * the single most important property of this installer: every failure mode is
 * recoverable in place rather than by starting over.
 */
export async function ask(question, {
  fallback = '', secret = false, validate = null, hint = null, unattended = false,
  suppliedValue = undefined,
} = {}) {
  if (unattended || forcedUnattended || !rl) {
    const value = suppliedValue === undefined || suppliedValue === true
      ? fallback : String(suppliedValue)
    say(`  ${question}: ${c.dim}${secret ? '....' : value}${c.reset}`)
    if (validate) {
      const problem = validate(value)
      if (problem) throw new Error(`${question}: ${problem}`)
    }
    return value
  }

  for (;;) {
    const suffix = fallback ? ` ${c.dim}(${secret ? '....' : fallback})${c.reset}` : ''
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

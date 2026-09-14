/**
 * Step: the Railway project and its Postgres service, ending in a connection
 * string this machine has actually connected to.
 *
 * Public access on the database is a manual button, deliberately. Railway
 * creates databases private, and the dashboard toggle stages TWO changes at
 * once (the TCP proxy and DATABASE_PUBLIC_URL) which it applies on Deploy.
 * The CLI has no equivalent: `tcp-proxy create` does only the proxy half,
 * `variable set` only the variable half, and the redeploy needed to apply them
 * races the read that follows. Every automatic combination was tried and each
 * failed differently, so this asks for the button and then proves the result
 * by opening a real connection rather than believing it.
 */
import { ask, confirm, fail, note, ok, say, step, warn, cmdEcho } from '../lib/ui.mjs'
import { checkDatabase, cli, parseJson } from '../lib/shell.mjs'

const publicAccessInstructions = () => {
  say('')
  note('Railway keeps databases private by default, and its CLI cannot switch')
  note('public access on reliably. This one step is yours. In the dashboard:')
  say('')
  note('  1. Open this project, then the Postgres service')
  note('  2. Settings, Networking, Add Public Access')
  note('  3. Press Deploy, and wait for the service to read Online')
  note('  4. Variables tab, copy DATABASE_PUBLIC_URL')
  say('')
  note('Migrations run from this machine, so it needs a public address. The API')
  note('keeps talking to Postgres privately. You can remove public access when')
  note('setup has finished.')
  say('')
}

/** Turn a psql failure into the next thing worth trying. */
const DSN_HINTS = [
  [/closed the connection unexpectedly|terminated abnormally/i,
   'The service is still redeploying. Wait for it to read Online, then retry.'],
  [/could not translate host name/i,
   'That host does not resolve. A .railway.internal address only works inside '
   + 'Railway: copy DATABASE_PUBLIC_URL, not DATABASE_URL.'],
  [/nothing is listening|Connection refused/i,
   'Nothing is listening there. Public access may not be deployed yet.'],
  [/username or password is wrong|password authentication/i,
   'Those credentials are stale. Re-copy DATABASE_PUBLIC_URL after the deploy '
   + 'has finished.'],
  [/database name does not exist/i,
   'Right server, wrong database name on the end of the URL.'],
]

/**
 * Ask for a connection string and do not accept it until psql agrees. Loops
 * rather than failing, because the usual reason is simply "not deployed yet".
 */
export async function askVerifiedDatabaseUrl({ unattended = false, suppliedValue } = {}) {
  for (let attempt = 1; ; attempt += 1) {
    const url = await ask('DATABASE_PUBLIC_URL', {
      unattended,
      suppliedValue: attempt === 1 ? suppliedValue : undefined,
      validate: (v) => {
        if (!/^postgres(ql)?:\/\//i.test(v)) {
          return 'Must be a full postgresql:// connection string.'
        }
        if (/\.railway\.internal\b/i.test(v)) {
          return 'That is the private URL. This machine cannot reach it; copy '
               + 'DATABASE_PUBLIC_URL instead.'
        }
        return null
      },
    })

    if (!url) return null

    cmdEcho("psql <DATABASE_PUBLIC_URL> -tAc 'SELECT version()'")
    const probe = checkDatabase(url)

    if (probe.ok) {
      ok(`Connected: ${probe.version}`)
      return url
    }
    if (probe.skipped) {
      warn('psql is not installed, so the connection was not verified.')
      note('The migrations need it. Install it before going further.')
      return url
    }

    fail(`Could not connect: ${probe.reason}`)
    const hint = DSN_HINTS.find(([re]) => re.test(`${probe.reason} ${probe.stderr || ''}`))
    if (hint) note(hint[1])

    if (unattended) return null
    if (!await confirm('Try again?', true)) return null
  }
}

/** Create or adopt the Railway project this directory is linked to. */
export async function ensureProject({ root, state, record, unattended, prefix }) {
  step('Railway project')

  if (state.railwayProject) {
    ok(`Already linked to "${state.railwayProject}"`)
    return { ok: true }
  }

  const linked = cli('railway', ['status', '--json'],
                     { cwd: root, quiet: true, timeout: 40000 })
  const existing = parseJson(linked.stdout)?.name

  if (linked.ok && existing) {
    ok(`This directory is already linked to "${existing}"`)
    record('railwayProject', existing)
    return { ok: true }
  }

  let created = cli('railway', ['init', '--name', prefix, '--json'],
                    { cwd: root, timeout: 120000 })

  // Outside a terminal Railway wants an explicit workspace.
  if (!created.ok && /workspace/i.test(created.stderr || '')) {
    warn('Railway needs to know which workspace to create the project in.')
    const workspace = await ask('Workspace name or ID', { unattended })
    if (workspace) {
      created = cli('railway',
                    ['init', '--name', prefix, '--workspace', workspace, '--json'],
                    { cwd: root, timeout: 120000 })
    }
  }

  if (!created.ok) {
    fail('Could not create the Railway project.')
    note('Create it by hand, then re-run this. It will pick up the link:')
    note(`  railway init --name ${prefix}`)
    return { ok: false }
  }

  record('railwayProject', parseJson(created.stdout)?.name || prefix)
  ok(`Created Railway project "${state.railwayProject}"`)
  return { ok: true }
}

/** Provision Postgres, or adopt the connection string the operator supplied. */
export async function ensureDatabase({ root, config, state, record, unattended }) {
  step('Postgres')

  if (config.bringYourOwnDatabase && config.databaseUrl) {
    record('databaseUrl', config.databaseUrl)
    ok('Using the database you supplied; not provisioning one')
    return { ok: true, databaseUrl: config.databaseUrl }
  }

  if (state.databaseUrl) {
    ok('Postgres already provisioned')
    return { ok: true, databaseUrl: state.databaseUrl }
  }

  const added = cli('railway', ['add', '--database', 'postgres', '--json'],
                    { cwd: root, timeout: 300000 })
  if (!added.ok) {
    fail('Could not add Postgres.')
    note('Add it in the Railway dashboard, then re-run with the connection string:')
    note('  npm run deploy:netlify -- --database-url="postgresql://..."')
    return { ok: false }
  }
  ok('Postgres service created')

  publicAccessInstructions()
  const databaseUrl = await askVerifiedDatabaseUrl({ unattended })
  if (!databaseUrl) {
    fail('No reachable database URL. Nothing further can run.')
    return { ok: false }
  }

  record('databaseUrl', databaseUrl)
  return { ok: true, databaseUrl }
}

export { publicAccessInstructions }

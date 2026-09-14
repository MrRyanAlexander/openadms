/**
 * Step: migrations and the optional worked demo.
 *
 * The saved connection string is never assumed to still work. A resumed run
 * can point at a database that has since been redeployed, torn down, or had
 * public access removed, so this verifies first and walks the operator back
 * through the public-access step when it has gone stale.
 */
import path from 'node:path'
import process from 'node:process'
import { confirm, fail, note, ok, step, warn } from '../lib/ui.mjs'
import { checkDatabase, run } from '../lib/shell.mjs'
import { askVerifiedDatabaseUrl, publicAccessInstructions } from './railway-project.mjs'

export async function applySchema({ root, config, state, record, unattended, databaseUrl }) {
  step('Database schema')

  if (state.migrated) {
    ok('Schema already applied')
    return { ok: true, databaseUrl }
  }

  let url = databaseUrl
  const probe = checkDatabase(url)

  if (probe.ok) {
    ok('Database reachable')
  } else if (probe.skipped) {
    warn('psql is not installed, so the connection was not verified.')
    note('The migrations below need it.')
  } else {
    warn(`The saved database URL does not connect: ${probe.reason}`)
    publicAccessInstructions()
    const fresh = await askVerifiedDatabaseUrl({ unattended })
    if (!fresh) {
      fail('Cannot reach the database, so the schema was not applied.')
      return { ok: false }
    }
    url = fresh
    record('databaseUrl', url)
  }

  const withDemo = unattended
    ? Boolean(config.demo)
    : await confirm('Seed the worked demo project as well?', true)

  const args = ['./setup.sh']
  if (withDemo) args.push('--with-demo')
  args.push('--test')

  const result = run('bash', args, {
    cwd: path.join(root, 'database'),
    env: {
      ...process.env,
      DATABASE_URL: url,
      ADMS_INSTANCE_NAME: config.instanceName,
      ADMS_ORGANIZATION: config.organization || '',
    },
  })

  if (!result.ok) {
    fail('The schema setup did not finish.')
    note('Migrations are idempotent, so fix the error above and re-run.')
    return { ok: false }
  }

  record('migrated', true)
  ok('Schema applied and verified')
  return { ok: true, databaseUrl: url }
}

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
import { ask, confirm, fail, note, ok, step, warn } from '../lib/ui.mjs'
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

  await seedVolume({
    root, databaseUrl: url, unattended, config, state, record, withDemo,
  })

  return { ok: true, databaseUrl: url }
}

const DEFAULT_LARGE_TICKETS = 25000

/**
 * The optional volume seed, offered here rather than left as a target somebody
 * has to know the name of.
 *
 * It is still the same script `npm run db:seed:large` runs and it still refuses
 * to run without the demo project, because the tickets it writes are priced
 * through that project's rules. Answering no leaves the database exactly as it
 * was before this existed, which is what every other install already expects.
 *
 * Unattended runs never get it by surprise: it happens only when --large-seed
 * names a number. The count is recorded, so a resumed run does not quietly add
 * another twenty-five thousand tickets on top of the ones already there.
 */
export async function seedVolume({
  root, databaseUrl, unattended, config, state = {}, record = () => {}, withDemo,
}) {
  const asked = config?.largeSeed

  if (state.largeSeeded) {
    ok(`Volume seed already run (${state.largeSeeded} tickets)`)
    return { ok: true, seeded: 0 }
  }

  if (!withDemo) {
    // The seed adds tickets to the demo project and exits non-zero without it,
    // so this is a skip with a reason rather than a failure to explain later.
    if (asked) {
      warn('The volume seed needs the demo project, which was not seeded, so it '
           + 'was skipped.')
    }
    return { ok: true, seeded: 0 }
  }

  let count = 0
  if (unattended) {
    if (asked === undefined || asked === null || asked === false) return { ok: true, seeded: 0 }
    count = asked === true ? DEFAULT_LARGE_TICKETS : Number(asked)
    if (!Number.isFinite(count) || count < 1) return { ok: true, seeded: 0 }
  } else {
    step('Volume seed')
    note('The demo project carries about a hundred tickets, which makes every list '
         + 'look fast. This adds tens of thousands more and prices each one through '
         + 'the rules engine, so the screens can be judged at real volume.')
    note('It takes a few minutes and leaves the database several hundred megabytes '
         + 'larger. Skipping it changes nothing else about this install.')
    const wanted = await confirm('Load a large volume of demo tickets as well?',
                                 Boolean(asked))
    if (!wanted) return { ok: true, seeded: 0 }
    const answer = await ask('How many tickets', {
      fallback: String(asked && asked !== true ? asked : DEFAULT_LARGE_TICKETS),
      validate: (v) => (/^\d+$/.test(v) && Number(v) > 0
        ? null : 'A whole number of tickets, for example 25000.'),
    })
    count = Number(answer)
  }

  step(`Seeding ${count} tickets`)
  const result = run('bash', ['./seed-large.sh', String(count), '--yes'], {
    cwd: path.join(root, 'database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  if (!result.ok) {
    // Never fatal. The instance is complete without it, and failing the whole
    // run over demo data would throw away a working deployment.
    warn('The volume seed did not finish. The instance is fine without it; '
         + '`npm run db:seed:large` can be re-run on its own.')
    return { ok: false, seeded: 0 }
  }

  record('largeSeeded', count)
  ok(`${count} tickets seeded and priced`)
  return { ok: true, seeded: count }
}

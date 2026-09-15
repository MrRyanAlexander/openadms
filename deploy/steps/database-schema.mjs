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
import { ask, choose, confirm, fail, note, ok, step, warn } from '../lib/ui.mjs'
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
const MAX_LARGE_TICKETS = 1000000
const MAX_LARGE_PROJECTS = 50
const DEFAULT_SHOWCASE_TICKETS = 10000
const MAX_SHOWCASE_TICKETS = 10000
const MIN_SHOWCASE_TICKETS = 500

/**
 * The optional demo data, offered here rather than left as a target somebody
 * has to know the name of. Two shapes, because two different questions get
 * asked of a system people are trying out:
 *
 *   showcase  twenty projects across six declarations inside ten thousand
 *             tickets. Different programs, clients, ticket types and pricing on
 *             every one. Fits a free Postgres. This is the one to run.
 *   volume    one ticket total up to a million, spread across as many projects
 *             as asked for. Answers "is it still fast at this size", and needs
 *             a database with room for it.
 *
 * Both refuse to run without the worked demo project, because the tickets they
 * write are priced through a demo project's rules. Answering no leaves the
 * database exactly as it was, which is what every other install already expects.
 *
 * Unattended runs never get either by surprise: --showcase-seed or --large-seed
 * has to name it. The result is recorded, so a resumed run does not quietly add
 * another twenty-five thousand tickets on top of the ones already there.
 */
export async function seedVolume({
  root, databaseUrl, unattended, config, state = {}, record = () => {}, withDemo,
}) {
  const asked = config?.largeSeed
  const askedProjects = config?.largeProjects
  const askedShowcase = config?.showcaseSeed

  if (state.largeSeeded || state.showcaseSeeded) {
    ok(`Demo data already seeded (${state.largeSeeded || state.showcaseSeeded} tickets)`)
    return { ok: true, seeded: 0 }
  }

  if (!withDemo) {
    // These add tickets to a demo project and exit non-zero without one, so
    // this is a skip with a reason rather than a failure to explain later.
    if (asked || askedShowcase) {
      warn('The demo data seeds need the demo project, which was not seeded, so '
           + 'they were skipped.')
    }
    return { ok: true, seeded: 0 }
  }

  const whole = (value, max) => {
    const n = Number(value)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > max) return null
    return n
  }

  let shape = 'none'
  let count = 0
  let projects = 0

  if (unattended) {
    if (askedShowcase !== undefined && askedShowcase !== null && askedShowcase !== false) {
      shape = 'showcase'
      count = askedShowcase === true
        ? DEFAULT_SHOWCASE_TICKETS
        : (whole(askedShowcase, MAX_SHOWCASE_TICKETS) ?? 0)
    } else if (asked !== undefined && asked !== null && asked !== false) {
      shape = 'volume'
      count = asked === true ? DEFAULT_LARGE_TICKETS : (whole(asked, MAX_LARGE_TICKETS) ?? 0)
      projects = askedProjects === undefined || askedProjects === true
        ? 0
        : (whole(askedProjects, MAX_LARGE_PROJECTS) ?? 0)
    }
    if (shape === 'none' || count < 1) return { ok: true, seeded: 0 }
  } else {
    step('Demo data')
    note('The worked demo project carries about a hundred tickets on one project, '
         + 'which makes every list look fast and the projects list look like a '
         + 'label. There are two ways to fill it out.')
    shape = await choose('Add more demo data?', [
      { value: 'showcase', label: 'Showcase',
        hint: '20 projects, 6 declarations, 10,000 tickets. Fits a free database.' },
      { value: 'volume', label: 'Volume',
        hint: 'up to 1,000,000 tickets, for judging the screens at size' },
      { value: 'none', label: 'Neither', hint: 'just the worked demo project' },
    ], { fallback: askedShowcase ? 'showcase' : (asked ? 'volume' : 'showcase') })

    if (shape === 'none') return { ok: true, seeded: 0 }

    if (shape === 'showcase') {
      note('Two hurricanes, a flood, a wildfire, an ice storm and a state river '
           + 'flood, across six of the seven programs and five kinds of client. '
           + 'Projects in setup, active, paused, closeout and closed; per cubic '
           + 'yard, per ton, per unit, per hour and banded pricing; an approved '
           + 'invoice, a corrected certification, and loads still in the field.')
      note('Reckon on six minutes and about 150 MB.')
      const answer = await ask('How many tickets in total', {
        fallback: String(askedShowcase && askedShowcase !== true
          ? askedShowcase : DEFAULT_SHOWCASE_TICKETS),
        validate: (v) => (/^\d+$/.test(v)
          && Number(v) >= MIN_SHOWCASE_TICKETS && Number(v) <= MAX_SHOWCASE_TICKETS
          ? null
          : `Between ${MIN_SHOWCASE_TICKETS} and ${MAX_SHOWCASE_TICKETS}. `
            + 'The volume option is the one that goes higher.'),
      })
      count = Number(answer)
    } else {
      note('The ticket number is a total split across the projects, not a figure '
           + 'per project. Reckon on four minutes and a quarter of a gigabyte '
           + 'per 25,000 tickets.')
      const answer = await ask('How many tickets in total', {
        fallback: String(asked && asked !== true ? asked : DEFAULT_LARGE_TICKETS),
        validate: (v) => (/^\d+$/.test(v) && Number(v) > 0 && Number(v) <= MAX_LARGE_TICKETS
          ? null : `A whole number of tickets between 1 and ${MAX_LARGE_TICKETS}.`),
      })
      count = Number(answer)

      note('Extra projects are built complete: their own client, contractors, '
           + 'contract and line items, sites, zones, crew, trucks, '
           + 'certifications, service codes, rates and rules.')
      const answerProjects = await ask('How many demo projects to build', {
        fallback: String(askedProjects && askedProjects !== true ? askedProjects : 0),
        validate: (v) => (/^\d+$/.test(v) && Number(v) <= MAX_LARGE_PROJECTS
          ? null : `0 to ${MAX_LARGE_PROJECTS}. Zero fills the demo project already there.`),
      })
      projects = Number(answerProjects)
    }
  }

  const script = shape === 'showcase' ? './seed-showcase.sh' : './seed-large.sh'
  const args = shape === 'showcase'
    ? [script, String(count), '--yes']
    : [script, String(count), `--projects=${projects}`, '--yes']

  step(shape === 'showcase'
    ? `Seeding the showcase: 20 projects, ${count} tickets`
    : (projects > 0
        ? `Seeding ${count} tickets across ${projects} new demo project(s)`
        : `Seeding ${count} tickets`))

  const result = run('bash', args, {
    cwd: path.join(root, 'database'),
    env: { ...process.env, DATABASE_URL: databaseUrl },
  })

  if (!result.ok) {
    // Never fatal. The instance is complete without it, and failing the whole
    // run over demo data would throw away a working deployment.
    warn('The demo data seed did not finish. The instance is fine without it; '
         + '`npm run db:seed:showcase` or `npm run db:seed:large` can be re-run '
         + 'on their own.')
    return { ok: false, seeded: 0 }
  }

  record(shape === 'showcase' ? 'showcaseSeeded' : 'largeSeeded', count)
  if (projects > 0) record('largeProjects', projects)
  ok(`${count} tickets seeded and priced`)
  return { ok: true, seeded: count, projects, shape }
}

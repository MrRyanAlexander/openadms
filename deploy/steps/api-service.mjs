/**
 * Step: the Railway api service, from nothing to a URL that answers 200.
 *
 * There is deliberately no build configuration here. Railway builds a GitHub
 * service by looking for `Dockerfile` at the root of the service's source
 * directory, and this repo puts exactly one Dockerfile there. The service's
 * Root Directory is left at its default and is never read, written, or
 * repaired by this installer.
 *
 * That is a change from an earlier version, which kept a second Dockerfile in
 * backend/ and tried to point Railway at it by setting Root Directory to
 * /backend over the CLI and then the GraphQL API. The CLI stages that change
 * rather than committing it, so it reported success while Railway went on
 * building the root Dockerfile, and because the root Dockerfile built a
 * perfectly good image nothing ever surfaced the failure. Two files had to be
 * kept in sync by hand and which one you got was luck. Deleting the setting
 * removed the whole class of problem; making the setting more reliable would
 * not have.
 */
import {
  ask, confirm, fail, note, ok, step, warn,
} from '../lib/ui.mjs'
import { cli, firstUrl, parseJson, tryVariants } from '../lib/shell.mjs'
import {
  latestDeployment, linkContext, projectServices, railwayApi, triggerDeploy,
} from '../lib/railway.mjs'

/** One request against a health endpoint. Never throws. */
export async function probeHealth(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
    const body = await response.text()
    return { ok: response.ok, status: response.status, body: body.slice(0, 200) }
  } catch (error) {
    return { ok: false, status: 0, body: error.message }
  }
}

/**
 * Poll a health endpoint until it answers 200, or the operator gives up.
 * Railway builds take a couple of minutes, so this is patient by default and
 * then hands the decision back rather than looping forever.
 */
async function waitForHealth(url, { unattended = false, describe = null } = {}) {
  for (;;) {
    const waits = [0, 10000, 15000, 15000, 20000, 20000, 30000, 30000, 30000]
    let last = null
    let lastLine = null

    for (let i = 0; i < waits.length; i += 1) {
      if (waits[i]) {
        note(`Waiting for the API to build and answer (${i}/${waits.length - 1})`)
        await new Promise((resolve) => { setTimeout(resolve, waits[i]) })
      }
      last = await probeHealth(url)
      if (last.ok) {
        ok(`API healthy: ${last.body}`)
        return true
      }

      // Say what Railway is actually doing rather than counting silently. A
      // build that has already failed is worth stopping on now instead of in
      // another two minutes, and a domain answering 404 "Application not
      // found" because no deployment exists looks identical from out here.
      if (describe) {
        const report = await describe()
        if (report?.line && report.line !== lastLine) {
          lastLine = report.line
          note(report.line)
        }
        if (report?.stop) {
          fail(`Railway build did not succeed: ${report.line}`)
          note('Build log:  railway logs --service api --build')
          return false
        }
      }
    }

    fail('API not healthy after three minutes.')
    note(last.status ? `Last response: HTTP ${last.status} ${last.body}`
                     : `Last error: ${last.body}`)
    if (unattended) return false
    if (!await confirm('Keep waiting?', true)) return false
  }
}

/** Resolve project, environment and service ids for one service by name. */
export async function railwayServiceContext(root, serviceName) {
  const link = linkContext(root)
  if (!link.ok) return { ok: false, reason: link.reason }

  const api = railwayApi()
  const project = await projectServices(api, link.projectId)
  if (!project.ok) {
    return { ok: false, api,
             reason: project.reason || 'Railway API did not return the project.' }
  }

  const service = project.services.find((entry) => entry.name === serviceName)
  if (!service?.id) {
    return { ok: false, api,
             reason: `No service named "${serviceName}" in ${project.name || link.projectId}.` }
  }

  const environmentId = link.environmentId
    || project.environments.find((entry) => entry.name === 'production')?.id
    || project.environments[0]?.id
  if (!environmentId) {
    return { ok: false, api, reason: 'Could not work out which environment to write to.' }
  }

  return {
    ok: true,
    api,
    projectId: link.projectId,
    environmentId,
    serviceId: service.id,
    projectName: project.name || link.projectName || null,
    source: link.source,
  }
}

export async function deployApi({
  root, config, state, record, unattended, prefix, repoSlug, databaseUrl,
}) {
  step('API service')

  let apiUrl = state.apiUrl || ''

  const rw = await railwayServiceContext(root, 'api')
  if (rw.ok) {
    note(`Railway project ${rw.projectName || rw.projectId} (ids via ${rw.source})`)
  }

  /*
   * A URL in .deploy-state.json is not evidence of a working API. An earlier
   * run recorded one the moment Railway minted the domain, which happens long
   * before, and regardless of whether, a build succeeds. Trusting it meant a
   * resumed run printed "API already deployed", skipped every repair below,
   * and then built both frontends against an address answering 404.
   */
  if (apiUrl) {
    const probe = await probeHealth(`${apiUrl.replace(/\/api\/v1\/?$/, '')}/health`)
    if (probe.ok) {
      ok(`API already deployed and healthy at ${apiUrl}`)
      return { ok: true, apiUrl }
    }
    warn(`The recorded API URL does not answer: HTTP ${probe.status || 'no response'}`)
    note(probe.body ? probe.body.split('\n')[0] : 'no body')
    note('Repairing the service rather than building the frontends against it.')
  }

  const variables = {
    // When Railway provisions the database, reference the service so the API
    // talks to it over the internal network. When the operator supplied their
    // own connection string there may be no Postgres service to reference, so
    // use the literal value they gave.
    DATABASE_URL: config.bringYourOwnDatabase && databaseUrl
      ? databaseUrl
      : '${{Postgres.DATABASE_URL}}',
    JWT_SECRET: config.jwtSecret,
    INSTANCE_KEY: config.instanceKey,
    ENVIRONMENT: 'production',
    PORT: '8080',
    LOG_LEVEL: 'info',
    CORS_ORIGIN_REGEX:
      `^https://([a-z0-9-]+--)?${prefix}-(back-office|field)\\.netlify\\.app$`,
  }

  /* ---- the service itself --------------------------------------------- */
  const serviceList = cli('railway', ['service', 'list', '--json'],
                          { cwd: root, quiet: true, timeout: 60000 })
  const services = parseJson(serviceList.stdout)
  const existing = Array.isArray(services)
    ? services.find((s) => s.name === 'api')
    : null

  if (existing) {
    record('apiService', 'api')
    ok('API service already exists on Railway')

    if (!existing.source?.repo) {
      const connected = cli('railway',
        ['service', 'source', 'connect',
         '--repo', repoSlug, '--branch', 'main', '--service', 'api'],
        { cwd: root, timeout: 180000 })
      if (!connected.ok) {
        fail('Could not connect the GitHub source automatically.')
        note('In the Railway dashboard: api service, Settings, Source, Connect Repo')
        note(`Repo: ${repoSlug}   Branch: main`)
        note('Leave Root Directory alone. Once connected, re-run this.')
        return { ok: false }
      }
      ok('GitHub source connected to API service')
    } else {
      ok(`Source already connected: ${existing.source.repo}`)
    }
  } else {
    let serviceOk = false

    const withRepo = cli('railway',
      ['add', '--service', 'api', '--repo', repoSlug, '--branch', 'main'],
      { cwd: root, timeout: 180000 })

    if (withRepo.ok) {
      serviceOk = true
      ok('API service created and linked to GitHub repo')
    } else if (/unexpected argument|unknown (flag|option)/i.test(withRepo.stderr + withRepo.stdout)) {
      note('This CLI does not support --repo on add; creating then connecting.')
      const created = cli('railway', ['add', '--service', 'api', '--json'],
                          { cwd: root, timeout: 180000 })
      if (created.ok) {
        const connected = cli('railway',
          ['service', 'source', 'connect',
           '--repo', repoSlug, '--branch', 'main', '--service', 'api'],
          { cwd: root, timeout: 180000 })
        if (connected.ok) {
          serviceOk = true
          ok('API service created and source connected')
        }
      }
    }

    if (!serviceOk) {
      fail('Could not create the API service.')
      note('Create a service named "api" in the Railway dashboard, connect it to:')
      note(`  Repo: ${repoSlug}   Branch: main`)
      note('Leave Root Directory at its default. The Dockerfile at the')
      note('repository root is the API image. Then re-run this.')
      return { ok: false }
    }

    record('apiService', 'api')
  }

  /* ---- variables ------------------------------------------------------- */
  // Set every time, not only at creation, so a resumed run repairs drift.
  // --skip-deploys avoids one redeploy per variable.
  const pairs = Object.entries(variables).map(([k, v]) => `${k}=${v}`)
  const setVars = tryVariants('railway', [
    ['variable', 'set', ...pairs, '--service', 'api', '--skip-deploys'],
    ['variables', ...pairs.flatMap((pair) => ['--set', pair]),
     '--service', 'api', '--skip-deploys'],
    ['variables', ...pairs.flatMap((pair) => ['--set', pair]), '--service', 'api'],
  ], { cwd: root, timeout: 180000 })

  if (!setVars?.ok) {
    fail('Could not set the API environment variables from the CLI.')
    note('Set these on the api service in Railway, then re-run:')
    Object.keys(variables).forEach((k) => note(`  ${k}`))
    return { ok: false }
  }
  ok(`Set ${pairs.length} environment variables`)

  /* ---- build ----------------------------------------------------------- */
  // `redeploy` is top level, not a subcommand of `service`, which is why an
  // earlier spelling always failed and left runs with a service that had never
  // built. A service with no deployment cannot be redeployed either, so the
  // GraphQL API is the fallback: without a first build the generated domain
  // answers every request with a 404 that looks exactly like a broken API.
  const redeployed = tryVariants('railway', [
    ['redeploy', '--service', 'api', '--yes'],
    ['redeploy', '--service', 'api'],
  ], { cwd: root, timeout: 180000 })

  if (redeployed?.ok) {
    ok('Deploy triggered with the new environment variables')
  } else if (rw.ok) {
    const triggered = await triggerDeploy(rw.api, {
      serviceId: rw.serviceId, environmentId: rw.environmentId,
    })
    if (triggered.ok) ok(`Deploy triggered through the Railway API (${triggered.mutation})`)
    else {
      warn(`Could not trigger a deploy: ${triggered.reason}`)
      note('Railway may already be building from the source connection.')
    }
  } else {
    note('Could not trigger a deploy from here; Railway may already be building.')
  }

  /* ---- domain ---------------------------------------------------------- */
  // `--port` is 5.x only. Skipped when a domain was already recorded: the
  // service keeps its address across rebuilds and asking again risks a second.
  const domain = apiUrl ? null : tryVariants('railway', [
    ['domain', '--service', 'api', '--port', '8080'],
    ['domain', '--service', 'api'],
    ['domain'],
  ], { cwd: root, timeout: 180000 })

  const host = apiUrl
    ? apiUrl.replace(/\/api\/v1\/?$/, '')
    : (firstUrl(domain?.stdout) || firstUrl(domain?.stderr))

  if (!host) {
    warn('Railway did not print a domain.')
    note('Dashboard, api service, Settings, Networking, Generate Domain.')
    const entered = await ask('Public API URL, without /api/v1', {
      unattended,
      validate: (v) => (/^https?:\/\//.test(v) ? null : 'Must start with https://'),
    })
    apiUrl = `${entered.replace(/\/+$/, '')}/api/v1`
  } else {
    apiUrl = `${host.replace(/\/+$/, '')}/api/v1`
  }

  record('apiUrl', apiUrl)
  ok(`API at ${apiUrl}`)

  /* ---- health ---------------------------------------------------------- */
  // Never assume a deployed service is a working service. Railway reports a
  // domain the moment it exists, long before the first build finishes, and a
  // build producing a broken image still gets one. /health runs a real query,
  // so a 200 means the image built, booted, and reached Postgres.
  const healthUrl = `${apiUrl.replace(/\/api\/v1\/?$/, '')}/health`

  const describe = rw.ok
    ? async () => {
      const result = await latestDeployment(rw.api, {
        projectId: rw.projectId,
        environmentId: rw.environmentId,
        serviceId: rw.serviceId,
      })
      if (!result.ok) return null
      if (!result.deployment) {
        return { line: 'Railway has no deployment for this service yet.', stop: false }
      }
      const status = String(result.deployment.status || 'UNKNOWN').toUpperCase()
      const id = String(result.deployment.id || '').slice(0, 8)
      return {
        line: `Railway deployment ${id || '(unknown)'} is ${status}`,
        stop: ['FAILED', 'CRASHED', 'REMOVED', 'SKIPPED'].includes(status),
      }
    }
    : null

  const healthy = await waitForHealth(healthUrl, { unattended, describe })

  if (!healthy) {
    warn('The API is not answering yet, so the frontends would be built')
    note('against a URL that does not work.')
    note('Check the build log: Railway dashboard, api service, Deployments.')
    note(`Health endpoint: ${healthUrl}`)
    if (unattended) return { ok: false }
    if (!await confirm('Carry on and deploy the frontends anyway?', false)) {
      fail('Stopping. Re-run once the API is healthy; it resumes from here.')
      return { ok: false }
    }
  }

  return { ok: true, apiUrl }
}

/**
 * Railway's public GraphQL API, for the two things its CLI cannot do reliably:
 * naming the status of the latest deployment, and starting a build on a
 * service that has never built (which `railway redeploy` cannot do, because
 * there is nothing to re-deploy).
 *
 * This file used to also set the api service's Root Directory, and that is
 * gone on purpose. The API now builds the Dockerfile at the repository root,
 * which is Railway's default for a GitHub service, so there is no build
 * setting left for this installer to apply, verify or repair. See the comment
 * at the top of /Dockerfile for why.
 *
 * Auth reuses whatever the operator already has. No new secret to create:
 *   RAILWAY_API_TOKEN / RAILWAY_TOKEN from the environment, or the token the
 *   CLI wrote to ~/.railway/config.json when they ran `railway login`.
 *
 * Every function returns { ok, ... } and never throws, matching shell.mjs.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { capture } from './shell.mjs'

const ENDPOINTS = [
  'https://backboard.railway.com/graphql/v2',
  'https://backboard.railway.app/graphql/v2',
]

const CONFIG_CANDIDATES = () => [
  path.join(os.homedir(), '.railway', 'config.json'),
  process.env.XDG_CONFIG_HOME
    ? path.join(process.env.XDG_CONFIG_HOME, 'railway', 'config.json')
    : null,
  path.join(os.homedir(), '.config', 'railway', 'config.json'),
].filter(Boolean)

function readCliConfig() {
  for (const file of CONFIG_CANDIDATES()) {
    try {
      return { file, data: JSON.parse(fs.readFileSync(file, 'utf8')) }
    } catch { /* try the next location */ }
  }
  return null
}

/**
 * Candidate credentials, most specific first. Account tokens go in an
 * Authorization header; project tokens use Project-Access-Token. RAILWAY_TOKEN
 * has meant both across CLI majors, so each token is offered under both header
 * names rather than guessing.
 */
function authCandidates() {
  const out = []
  const push = (token, source) => {
    if (!token) return
    out.push({ source, headers: { Authorization: `Bearer ${token}` } })
    out.push({ source, headers: { 'Project-Access-Token': token } })
  }
  push(process.env.RAILWAY_API_TOKEN, 'RAILWAY_API_TOKEN')
  push(process.env.RAILWAY_TOKEN, 'RAILWAY_TOKEN')
  const config = readCliConfig()
  push(config?.data?.user?.token, config?.file || 'railway CLI config')
  return out
}

/** Every id-looking value in a nested object, keyed by the field that held it. */
function deepFind(value, keys, found = {}) {
  if (!value || typeof value !== 'object') return found
  for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && typeof child === 'string' && child.length > 8) {
      found[key] = found[key] || child
    }
    deepFind(child, keys, found)
  }
  return found
}

/**
 * Project, environment and service ids for the linked directory.
 *
 * The CLI writes them into its own config keyed by absolute path, which is the
 * cheapest and most exact source. `railway status --json` is the fallback, and
 * its shape has changed between majors, so it is walked rather than indexed.
 */
export function linkContext(root) {
  const config = readCliConfig()
  const projects = config?.data?.projects || {}
  const key = Object.keys(projects)
    .filter((candidate) => root === candidate || root.startsWith(`${candidate}${path.sep}`))
    .sort((a, b) => b.length - a.length)[0]

  if (key) {
    const entry = projects[key] || {}
    if (entry.project) {
      return {
        ok: true,
        source: 'railway CLI config',
        projectId: entry.project,
        environmentId: entry.environment || null,
        serviceId: entry.service || null,
        projectName: entry.name || null,
      }
    }
  }

  const status = capture('railway', ['status', '--json'], { cwd: root, timeout: 60000 })
  if (status.ok && status.stdout) {
    let parsed = null
    try { parsed = JSON.parse(status.stdout) } catch { /* not JSON */ }
    const ids = deepFind(parsed, ['projectId', 'environmentId', 'serviceId'])
    if (ids.projectId) {
      return {
        ok: true,
        source: 'railway status',
        projectId: ids.projectId,
        environmentId: ids.environmentId || null,
        serviceId: ids.serviceId || null,
        projectName: parsed?.name || null,
      }
    }
  }

  return { ok: false, reason: 'Could not work out which Railway project this directory is linked to.' }
}

/**
 * A client bound to one working credential and endpoint. The pair is settled by
 * the first successful request rather than by a probe query, because a project
 * token cannot answer the queries an account token can and a probe would rule
 * out a credential that works perfectly well for what we actually need.
 */
export function railwayApi() {
  let pinned = null
  const attempts = []

  const post = async (endpoint, auth, query, variables) => {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...auth.headers },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(45000),
      })
      const text = await response.text()
      let json = null
      try { json = JSON.parse(text) } catch { /* not JSON */ }
      if (!json) {
        return { ok: false, retryAuth: response.status === 401 || response.status === 403,
                 reason: `HTTP ${response.status} ${text.slice(0, 160)}` }
      }
      if (json.errors?.length) {
        const reason = json.errors.map((e) => e.message).filter(Boolean).join('; ')
        // Railway answers a bad credential with "Not Authorized", sometimes at
        // HTTP 200. Either signal means try the next credential; anything else
        // is a schema or permission problem that a different token will not
        // fix, so that credential is kept and the error is reported as-is.
        const rejected = response.status === 401 || response.status === 403
          || /unauthor|not authoriz|not authenticated|forbidden|invalid token|missing token/i.test(reason)
        return { ok: false, retryAuth: rejected, reason, data: json.data }
      }
      return { ok: true, data: json.data }
    } catch (error) {
      return { ok: false, retryAuth: false, reason: error.message }
    }
  }

  const call = async (query, variables = {}) => {
    if (pinned) return post(pinned.endpoint, pinned.auth, query, variables)

    const credentials = authCandidates()
    if (!credentials.length) {
      return { ok: false, reason: 'No Railway token found. Run `railway login`, or set RAILWAY_API_TOKEN.' }
    }

    let last = null
    for (const endpoint of ENDPOINTS) {
      for (const auth of credentials) {
        const result = await post(endpoint, auth, query, variables)
        if (result.ok) {
          pinned = { endpoint, auth }
          return result
        }
        last = result
        attempts.push(`${auth.source}: ${result.reason}`)
        // A schema complaint means the credential worked and the query did not.
        if (!result.retryAuth) {
          pinned = { endpoint, auth }
          return result
        }
      }
    }
    return last || { ok: false, reason: 'Railway API unreachable.' }
  }

  return {
    call,
    attempts,
    get authSource() { return pinned?.auth.source || null },
  }
}

/** Service ids by name for a project, so "api" can be looked up. */
export async function projectServices(api, projectId) {
  const result = await api.call(`
    query($projectId: String!) {
      project(id: $projectId) {
        id
        name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`, { projectId })

  if (!result.ok) return result

  const project = result.data?.project
  const edges = (group) => (project?.[group]?.edges || [])
    .map((edge) => edge?.node)
    .filter(Boolean)

  return {
    ok: true,
    name: project?.name || null,
    services: edges('services'),
    environments: edges('environments'),
  }
}

/**
 * Start a build. Railway usually kicks one off when a source is connected, but
 * not always, and a service with no deployment answers every request from its
 * domain with a 404 "Application not found" that reads exactly like a broken
 * app. Mutation names have moved around across API versions, so the plausible
 * ones are tried in turn.
 */
export async function triggerDeploy(api, { serviceId, environmentId }) {
  const mutations = [
    ['serviceInstanceRedeploy', `
      mutation($serviceId: String!, $environmentId: String!) {
        serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
      }`],
    ['serviceInstanceDeploy', `
      mutation($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId)
      }`],
    ['serviceInstanceDeployV2', `
      mutation($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
      }`],
  ]

  let last = null
  for (const [name, query] of mutations) {
    const result = await api.call(query, { serviceId, environmentId })
    if (result.ok) return { ok: true, mutation: name }
    last = result
    // Only move on when the field itself is unknown to this schema.
    if (!/cannot query field|unknown (field|argument)|no field/i.test(result.reason || '')) break
  }
  return { ok: false, reason: last?.reason || 'No deploy mutation was accepted.' }
}

/** Latest deployment for a service, so a failed build is named, not waited on. */
export async function latestDeployment(api, { projectId, environmentId, serviceId }) {
  const result = await api.call(`
    query($projectId: String!, $environmentId: String!, $serviceId: String!) {
      deployments(
        first: 1
        input: { projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId }
      ) {
        edges { node { id status createdAt } } }
    }`, { projectId, environmentId, serviceId })

  if (!result.ok) return result
  const node = result.data?.deployments?.edges?.[0]?.node
  if (!node) return { ok: true, deployment: null }
  return { ok: true, deployment: node }
}

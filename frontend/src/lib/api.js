/**
 * The only thing this client knows about its deployment is VITE_API_URL.
 * Access tokens are held in memory; the refresh token survives a reload so a
 * page refresh does not log a reviewer out mid-audit.
 */
const RAW = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1'
export const API_BASE = RAW.replace(/\/+$/, '')

const REFRESH_KEY = 'openadms.refresh'
const PROJECT_KEY = 'openadms.project'
const THEME_KEY = 'openadms.theme'

let accessToken = null
let refreshing = null

export const tokens = {
  get access() { return accessToken },
  set access(value) { accessToken = value },
  get refresh() {
    try { return localStorage.getItem(REFRESH_KEY) } catch { return null }
  },
  set refresh(value) {
    try {
      if (value) localStorage.setItem(REFRESH_KEY, value)
      else localStorage.removeItem(REFRESH_KEY)
    } catch { /* private browsing */ }
  },
  clear() { accessToken = null; this.refresh = null },
}

export const prefs = {
  get projectId() {
    try { return localStorage.getItem(PROJECT_KEY) } catch { return null }
  },
  set projectId(value) {
    try {
      if (value) localStorage.setItem(PROJECT_KEY, value)
      else localStorage.removeItem(PROJECT_KEY)
    } catch { /* ignore */ }
  },
  get theme() {
    try { return localStorage.getItem(THEME_KEY) || 'dark' } catch { return 'dark' }
  },
  set theme(value) {
    try { localStorage.setItem(THEME_KEY, value) } catch { /* ignore */ }
  },
}

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'Request failed')
    this.status = status
    this.code = code
    this.details = details
  }
}

function url(path, params) {
  const u = new URL(API_BASE + path, window.location.origin)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v)
  })
  return u.toString()
}

async function raw(method, path, { body, params, headers } = {}) {
  const response = await fetch(url(path, params), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (response.status === 204) return null

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    const err = payload?.error || {}
    throw new ApiError(response.status, err.code, err.message || response.statusText,
                       err.details)
  }
  return payload
}

/** One in-flight refresh at a time, so a burst of 401s does not stampede. */
async function refreshOnce() {
  if (!tokens.refresh) return false
  if (!refreshing) {
    refreshing = raw('POST', '/auth/refresh', { body: { refresh_token: tokens.refresh } })
      .then((result) => {
        accessToken = result.access_token
        tokens.refresh = result.refresh_token
        return true
      })
      .catch(() => { tokens.clear(); return false })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

async function request(method, path, options = {}) {
  try {
    return await raw(method, path, options)
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && tokens.refresh
        && !path.startsWith('/auth/')) {
      if (await refreshOnce()) return raw(method, path, options)
    }
    throw error
  }
}

export const api = {
  get:   (path, params) => request('GET', path, { params }),
  post:  (path, body, params) => request('POST', path, { body, params }),
  put:   (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del:   (path) => request('DELETE', path),

  async login(username, password) {
    const result = await raw('POST', '/auth/login', { body: { username, password } })
    accessToken = result.access_token
    tokens.refresh = result.refresh_token
    return result
  },

  async restore() {
    if (!tokens.refresh) return null
    if (!(await refreshOnce())) return null
    return request('GET', '/auth/me')
  },

  /** A file the API streams back, rather than JSON. The access token is in
      memory, so a plain link cannot fetch it: the blob is pulled here and
      handed to the browser as a download. */
  async download(path, filename, params) {
    const pull = () => fetch(url(path, params), {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
    let response = await pull()
    if (response.status === 401 && tokens.refresh && await refreshOnce()) {
      response = await pull()
    }
    if (!response.ok) {
      const text = await response.text()
      let message = response.statusText
      try { message = JSON.parse(text)?.error?.message || message } catch { /* not json */ }
      throw new ApiError(response.status, 'download_failed', message)
    }
    const blob = await response.blob()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    // The server wins on naming. Closeout packages are named from the project's
    // own convention, and a name invented here would override it without anyone
    // seeing, which is the complaint: the convention set did not reach the files.
    const offered = (response.headers.get('content-disposition') || '')
      .split('filename=')[1]?.replace(/"/g, '').trim()
    link.download = offered || filename || 'download'
    link.click()
    URL.revokeObjectURL(link.href)
    return blob.size
  },

  async logout() {
    try {
      if (tokens.refresh) await raw('POST', '/auth/logout',
                                    { body: { refresh_token: tokens.refresh } })
    } catch { /* the session is going away regardless */ }
    tokens.clear()
  },
}

/* -------------------------------------------------------------------------
   Formatting. Kept here so every screen renders a number the same way.
   ------------------------------------------------------------------------- */
export const fmt = {
  money(value, digits = 2) {
    const n = Number(value || 0)
    return n.toLocaleString('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    })
  },
  /**
   * A rate, shown at the precision it actually carries.
   *
   * Contracts write 9.45 and occasionally 9.4567. Padding the first to 9.4500
   * to accommodate the second makes every column harder to read for the sake
   * of a case that is rare, so the trailing zeros go and the precision stays.
   */
  rate(value, max = 4) {
    const n = Number(value || 0)
    return n.toLocaleString('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 2, maximumFractionDigits: max,
    })
  },
  number(value, digits = 2) {
    return Number(value || 0).toLocaleString('en-US', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    })
  },
  int(value) { return Math.round(Number(value || 0)).toLocaleString('en-US') },
  date(value) {
    if (!value) return '—'
    return new Date(value).toLocaleDateString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric' })
  },
  datetime(value) {
    if (!value) return '—'
    return new Date(value).toLocaleString('en-US',
      { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
  },
  time(value) {
    if (!value) return '—'
    return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  },
  ago(value) {
    if (!value) return '—'
    const seconds = (Date.now() - new Date(value).getTime()) / 1000
    const steps = [[60, 's'], [3600, 'm'], [86400, 'h'], [604800, 'd']]
    if (seconds < 60) return 'just now'
    for (let i = 1; i < steps.length; i += 1) {
      if (seconds < steps[i][0]) {
        return `${Math.floor(seconds / steps[i - 1][0])}${steps[i][1]} ago`
      }
    }
    return fmt.date(value)
  },
  title(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  },
}

export const STATUS_TONE = {
  completed: 'green', open: 'blue', draft: '', in_transit: 'violet',
  pending_disposal: 'amber', pending_haul_out: 'amber',
  voided: 'red', rejected: 'red',
  processed: 'green', unprocessed: '', queued: 'amber', no_match: '',
  error: 'red', excluded: '',
  active: 'green', setup: 'amber', paused: 'amber', closeout: 'blue',
  closed: '', archived: '',
  approved: 'green', submitted: 'blue', paid: 'green', void: 'red',
  trusted: 'green', pending: 'amber', revoked: 'red',
  critical: 'red', high: 'red', medium: 'amber', low: 'blue', info: '',
  private: '', restricted: 'amber', public: 'green',
}

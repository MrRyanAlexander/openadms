/**
 * Field session state, device sensors, and the offline queue.
 *
 * A monitor on a right of way loses signal constantly. Every ticket write is
 * minted with a client_uuid before it leaves the phone, so replaying the queue
 * is idempotent: the server returns the ticket it already stored rather than
 * creating a second one.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, prefs, tokens } from './api'

const QUEUE_KEY = 'openadms.field.queue'
const FieldContext = createContext(null)

function readQueue() {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function writeQueue(items) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}

export function FieldProvider({ children }) {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectId, setProjectIdState] = useState(prefs.projectId)
  const [lookups, setLookups] = useState(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [queue, setQueue] = useState(readQueue)
  const [syncing, setSyncing] = useState(false)
  const [toasts, setToasts] = useState([])

  const toast = useCallback((title, message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((all) => [...all, { id, title, message, tone }])
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 4200)
  }, [])

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const adopt = useCallback((session) => {
    setUser(session.user)
    setProjects(session.projects || [])
    const wanted = prefs.projectId
    const known = (session.projects || []).some((p) => p.id === wanted)
    const next = known ? wanted : (session.projects?.[0]?.id || null)
    prefs.projectId = next
    setProjectIdState(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await api.restore()
        if (session && !cancelled) {
          adopt(session)
          setLookups(await api.get('/lookups'))
        }
      } catch { /* offline or signed out */ } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [adopt])

  const login = useCallback(async (username, password) => {
    await api.login(username, password)
    const session = await api.get('/auth/me')
    adopt(session)
    setLookups(await api.get('/lookups'))
  }, [adopt])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null); setProjects([]); setLookups(null)
    prefs.projectId = null
    setProjectIdState(null)
  }, [])

  const setProjectId = useCallback((id) => {
    prefs.projectId = id
    setProjectIdState(id)
  }, [])

  /* ------------------------------------------------------------ queue */
  const enqueue = useCallback((job) => {
    setQueue((current) => {
      const next = [...current, { ...job, id: crypto.randomUUID(), queued_at: Date.now() }]
      writeQueue(next)
      return next
    })
  }, [])

  const sync = useCallback(async () => {
    if (syncing) return { sent: 0, failed: 0 }
    const pending = readQueue()
    if (!pending.length) return { sent: 0, failed: 0 }

    setSyncing(true)
    const remaining = []
    let sent = 0
    for (const job of pending) {
      try {
        if (job.method === 'POST') await api.post(job.path, job.body)
        else if (job.method === 'PATCH') await api.patch(job.path, job.body)
        else if (job.method === 'PUT') await api.put(job.path, job.body)
        sent += 1
      } catch (error) {
        // A 4xx means the server rejected the payload; retrying will not help.
        if (error.status >= 400 && error.status < 500 && error.status !== 401) {
          sent += 1
        } else {
          remaining.push(job)
        }
      }
    }
    writeQueue(remaining)
    setQueue(remaining)
    setSyncing(false)
    if (sent) toast('Synced', `${sent} queued item${sent === 1 ? '' : 's'} sent`)
    return { sent, failed: remaining.length }
  }, [syncing, toast])

  useEffect(() => {
    if (online && queue.length && user) sync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, user])

  /** Send now when we can, queue when we cannot. */
  const submit = useCallback(async (method, path, body) => {
    if (!online) {
      enqueue({ method, path, body })
      toast('Saved offline', 'It will send as soon as you have signal')
      return { queued: true }
    }
    try {
      if (method === 'POST') return await api.post(path, body)
      if (method === 'PATCH') return await api.patch(path, body)
      if (method === 'PUT') return await api.put(path, body)
      return null
    } catch (error) {
      if (!error.status || error.status >= 500) {
        enqueue({ method, path, body })
        toast('Saved offline', 'The server could not be reached; it is queued')
        return { queued: true }
      }
      throw error
    }
  }, [online, enqueue, toast])

  const value = useMemo(() => ({
    booting, user, projects, projectId, setProjectId,
    project: projects.find((p) => p.id === projectId) || null,
    lookups, login, logout, online, queue, syncing, sync, submit, enqueue,
    toast, toasts, signedIn: Boolean(user),
  }), [booting, user, projects, projectId, setProjectId, lookups, login, logout,
       online, queue, syncing, sync, submit, enqueue, toast, toasts])

  return <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
}

export function useField() {
  const ctx = useContext(FieldContext)
  if (!ctx) throw new Error('useField must be used inside FieldProvider')
  return ctx
}

/* ---------------------------------------------------------------- sensors */
export function useGeo({ watch = false } = {}) {
  const [position, setPosition] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const capture = useCallback(() => {
    if (!navigator.geolocation) {
      setError('This device has no location service')
      return
    }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPosition({
          latitude: Number(p.coords.latitude.toFixed(6)),
          longitude: Number(p.coords.longitude.toFixed(6)),
          accuracy_m: p.coords.accuracy ? Number(p.coords.accuracy.toFixed(1)) : null,
          at: new Date().toISOString(),
        })
        setError(null); setBusy(false)
      },
      (err) => { setError(err.message); setBusy(false) },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    )
  }, [])

  useEffect(() => {
    if (!watch || !navigator.geolocation) return undefined
    const id = navigator.geolocation.watchPosition(
      (p) => setPosition({
        latitude: Number(p.coords.latitude.toFixed(6)),
        longitude: Number(p.coords.longitude.toFixed(6)),
        accuracy_m: p.coords.accuracy ? Number(p.coords.accuracy.toFixed(1)) : null,
        at: new Date().toISOString(),
      }),
      (err) => setError(err.message),
      { enableHighAccuracy: true, maximumAge: 4000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [watch])

  useEffect(() => { if (!watch) capture() }, [watch, capture])

  return { position, error, busy, capture }
}

/** Drafts survive a phone locking mid-ticket. */
export function useDraft(key, initial) {
  const storageKey = `openadms.field.draft.${key}`
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored ? { ...initial, ...JSON.parse(stored) } : initial
    } catch { return initial }
  })

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* ignore */ }
  }, [storageKey, value])

  const clear = useCallback(() => {
    try { localStorage.removeItem(storageKey) } catch { /* ignore */ }
    setValue(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  return [value, setValue, clear]
}

export function useAsync(fn, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (skip) { setLoading(false); return undefined }
    let cancelled = false
    setLoading(true); setError(null)
    Promise.resolve(fn())
      .then((r) => { if (!cancelled) setData(r) })
      .catch((e) => { if (!cancelled) setError(e) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, skip])

  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}

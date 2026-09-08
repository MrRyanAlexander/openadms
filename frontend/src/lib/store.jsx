/**
 * Session, project context and the reference data every screen needs.
 * The active project is always in context: nothing renders project data
 * without one selected.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, prefs, tokens } from './api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  const [projects, setProjects] = useState([])
  const [projectId, setProjectIdState] = useState(prefs.projectId)
  const [lookups, setLookups] = useState(null)
  const [theme, setThemeState] = useState(prefs.theme)
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const setTheme = useCallback((value) => {
    prefs.theme = value
    setThemeState(value)
  }, [])

  const toast = useCallback((title, message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((all) => [...all, { id, title, message, tone }])
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 5200)
  }, [])

  const adopt = useCallback((session) => {
    setUser(session.user)
    setPermissions(session.permissions || [])
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
      } catch { /* not signed in */ } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [adopt])

  const login = useCallback(async (username, password) => {
    const result = await api.login(username, password)
    const session = await api.get('/auth/me')
    adopt(session)
    setLookups(await api.get('/lookups'))
    return result
  }, [adopt])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null); setPermissions([]); setProjects([]); setLookups(null)
    prefs.projectId = null
    setProjectIdState(null)
  }, [])

  const setProjectId = useCallback((id) => {
    prefs.projectId = id
    setProjectIdState(id)
  }, [])

  const refreshProjects = useCallback(async () => {
    const session = await api.get('/auth/me')
    setProjects(session.projects || [])
    return session.projects
  }, [])

  const can = useCallback((code) => permissions.includes(code), [permissions])

  const value = useMemo(() => ({
    booting, user, permissions, can, projects, projectId, setProjectId,
    project: projects.find((p) => p.id === projectId) || null,
    lookups, login, logout, refreshProjects, theme, setTheme, toast, toasts,
    signedIn: Boolean(user),
  }), [booting, user, permissions, can, projects, projectId, setProjectId,
       lookups, login, logout, refreshProjects, theme, setTheme, toast, toasts])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

/** Small data-fetch hook: loading, error, and a manual reload. */
export function useFetch(fn, deps = [], { skip = false } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(!skip)
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (skip) { setLoading(false); return undefined }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.resolve(fn())
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => { if (!cancelled) setError(err) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, skip])

  return { data, loading, error, reload: () => setNonce((n) => n + 1), setData }
}

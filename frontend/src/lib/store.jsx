/**
 * Session, project context and the reference data every screen needs.
 *
 * There are two scopes. Inside a project, a project is in context and every
 * project-scoped screen reads from it. Above that, no project is in context at
 * all, and the portfolio screens work across all of them. A null projectId is
 * therefore a legitimate state rather than an error state, which is what makes
 * the projects list possible.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, prefs, tokens } from './api'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState([])
  // Everything the caller may see. An admin sees the whole portfolio here,
  // which auth/me alone never returned.
  const [projects, setProjects] = useState([])
  // The subset the caller is actually assigned to, which is what carries a
  // project_role.
  const [myProjects, setMyProjects] = useState([])
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
    setMyProjects(session.projects || [])
    setProjects(session.projects || [])
    // The remembered project is restored if the caller can still see it.
    // Nothing is auto-selected otherwise: landing at portfolio scope is a
    // legitimate place to be, and guessing a project for someone is worse.
    const wanted = prefs.projectId
    const known = (session.projects || []).some((p) => p.id === wanted)
    const next = known ? wanted : null
    prefs.projectId = next
    setProjectIdState(next)
  }, [])

  /** The full list, which for an admin is every project on the instance. */
  const loadProjects = useCallback(async (roles) => {
    try {
      const page = await api.get('/projects', { limit: 200, sort: 'status' })
      const byId = Object.fromEntries((roles || []).map((p) => [p.id, p]))
      setProjects((page.items || []).map((p) => ({
        ...p, project_role: byId[p.id]?.project_role || null,
      })))
    } catch { /* the session list is enough to work from */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await api.restore()
        if (session && !cancelled) {
          adopt(session)
          setLookups(await api.get('/lookups'))
          await loadProjects(session.projects)
        }
      } catch { /* not signed in */ } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => { cancelled = true }
  }, [adopt, loadProjects])

  const login = useCallback(async (username, password) => {
    const result = await api.login(username, password)
    const session = await api.get('/auth/me')
    adopt(session)
    setLookups(await api.get('/lookups'))
    await loadProjects(session.projects)
    return result
  }, [adopt, loadProjects])

  const logout = useCallback(async () => {
    await api.logout()
    setUser(null); setPermissions([]); setProjects([]); setMyProjects([])
    setLookups(null)
    prefs.projectId = null
    setProjectIdState(null)
  }, [])

  const setProjectId = useCallback((id) => {
    prefs.projectId = id
    setProjectIdState(id)
  }, [])

  const enterProject = useCallback((id) => {
    prefs.projectId = id
    setProjectIdState(id)
  }, [])

  /** Step back up to portfolio scope. No project in context is a real place. */
  const exitProject = useCallback(() => {
    prefs.projectId = null
    setProjectIdState(null)
  }, [])

  const refreshProjects = useCallback(async () => {
    const session = await api.get('/auth/me')
    setMyProjects(session.projects || [])
    await loadProjects(session.projects)
    return session.projects
  }, [loadProjects])

  const can = useCallback((code) => permissions.includes(code), [permissions])

  const value = useMemo(() => ({
    booting, user, permissions, can, projects, myProjects,
    projectId, setProjectId, enterProject, exitProject,
    project: projects.find((p) => p.id === projectId)
             || myProjects.find((p) => p.id === projectId) || null,
    inProject: Boolean(projectId),
    lookups, login, logout, refreshProjects, theme, setTheme, toast, toasts,
    signedIn: Boolean(user),
  }), [booting, user, permissions, can, projects, myProjects, projectId,
       setProjectId, enterProject, exitProject, lookups, login, logout,
       refreshProjects, theme, setTheme, toast, toasts])

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

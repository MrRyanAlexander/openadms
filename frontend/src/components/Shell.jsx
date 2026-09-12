import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { Icon, Modal, Toasts } from './ui'

/**
 * Whether the navigation is showing on a narrow screen.
 *
 * M12: "the back office does not navigate on mobile whatsoever and it should
 * be 100% compatible". The sidebar is always there on a desktop and slides in
 * over the page on a phone, which means the button that opens it belongs in
 * the page header. Kept in its own context rather than in the app store so
 * opening the menu does not re-render every screen that reads a project.
 */
const NavContext = createContext({ open: false, setOpen: () => {} })

/**
 * Two navigation sets, because there are two scopes and it should never be
 * ambiguous which one a screen is operating at.
 *
 * With no project in context the sidebar is the portfolio: the projects list
 * and the instance-wide records that are reusable on any project. Inside a
 * project it is that project's work, with the project named in the header and
 * a way back out that is always visible.
 */
const PORTFOLIO_NAV = [
  { group: 'Portfolio', items: [
    { to: '/projects', label: 'Projects', icon: 'folder' },
  ]},
  { group: 'Organization', items: [
    { to: '/organization?tab=clients', match: '/organization', label: 'Clients',
      icon: 'building', perm: 'client.manage' },
    { to: '/organization?tab=contractors', match: '/organization', label: 'Contractors',
      icon: 'truck', perm: 'contractor.manage' },
    { to: '/organization?tab=contracts', match: '/organization', label: 'Contracts',
      icon: 'invoice', perm: 'contract.manage' },
    { to: '/organization?tab=sites', match: '/organization', label: 'Disposal Sites',
      icon: 'pin', perm: 'site.manage' },
    { to: '/organization?tab=equipment', match: '/organization', label: 'Trucks & Equipment',
      icon: 'truck', perm: 'equipment.manage' },
    { to: '/organization?tab=disasters', match: '/organization', label: 'Disasters',
      icon: 'alert', perm: 'project.create' },
    { to: '/workers', label: 'Workers', icon: 'users', perm: 'worker.manage' },
  ]},
  { group: 'Oversight', items: [
    { to: '/catalog', label: 'Ticket Catalog', icon: 'layers', perm: 'ticket_type.manage' },
    { to: '/audit', label: 'Audit History', icon: 'audit', perm: 'audit.read' },
    { to: '/query', label: 'Query Builder', icon: 'query', perm: 'query.build' },
    { to: '/sharing', label: 'Sharing & Peers', icon: 'share', perm: 'sharing.manage' },
    { to: '/settings', label: 'Settings', icon: 'settings' },
  ]},
]

const PROJECT_NAV = [
  { group: 'Operations', items: [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/tickets', label: 'Tickets', icon: 'truck' },
    { to: '/review', label: 'Review', icon: 'check' },
    { to: '/incidents', label: 'Incidents', icon: 'alert' },
  ]},
  { group: 'Project', items: [
    { to: '/setup', label: 'Project Setup', icon: 'layers', perm: 'project.update' },
    { to: '/certifications', label: 'Certifications', icon: 'scale',
      perm: 'equipment.manage' },
    { to: '/intake', label: 'Contract Intake', icon: 'inbox', perm: 'contract.manage' },
    { to: '/rules', label: 'Rules', icon: 'rules', perm: 'rule.manage' },
    { to: '/service-codes', label: 'Service Codes', icon: 'money', perm: 'service_code.manage' },
  ]},
  { group: 'Money', items: [
    { to: '/transactions', label: 'Transactions', icon: 'money', perm: 'transaction.read' },
    { to: '/invoices', label: 'Invoices', icon: 'invoice', perm: 'invoice.manage' },
  ]},
  { group: 'Oversight', items: [
    { to: '/closeout', label: 'Closeout', icon: 'download', perm: 'report.run' },
    { to: '/audit', label: 'Audit History', icon: 'audit', perm: 'audit.read' },
    { to: '/query', label: 'Query Builder', icon: 'query', perm: 'query.build' },
    { to: '/sharing', label: 'Sharing & Peers', icon: 'share', perm: 'sharing.manage' },
  ]},
]

export default function Shell() {
  const { user, can, projects, project, enterProject, exitProject, logout,
          theme, setTheme, toasts } = useApp()
  const [switching, setSwitching] = useState(false)
  const [menu, setMenu] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const nav = project ? PROJECT_NAV : PORTFOLIO_NAV

  // Going somewhere closes the menu. A navigation drawer left standing over the
  // screen you just asked for is the most common way a phone layout feels
  // broken even when every route works.
  useEffect(() => { setNavOpen(false) }, [location.pathname, location.search])

  useEffect(() => {
    if (!navOpen) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navOpen])

  function leaveProject() {
    exitProject()
    setSwitching(false)
    navigate('/projects')
  }

  const initials = useMemo(() => (user?.full_name || '?')
    .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), [user])

  const navValue = useMemo(() => ({ open: navOpen, setOpen: setNavOpen }), [navOpen])

  return (
    <NavContext.Provider value={navValue}>
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      {navOpen && (
        <button className="nav-scrim" aria-label="Close navigation"
                onClick={() => setNavOpen(false)} />
      )}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16V7h9v9M13 10h3.4L20 13.4V16h-2.4" />
              <circle cx="7.5" cy="18.5" r="1.8" /><circle cx="16.5" cy="18.5" r="1.8" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="brand-name">Open ADMS</div>
            <div className="brand-sub">Back Office</div>
          </div>
        </div>

        {project ? (
          <>
            <button className="project-switch" onClick={() => setSwitching(true)}>
              <div className="label">In project · {project.project_code}</div>
              <div className="value">
                <span>{project.name}</span>
                <Icon name="chevronDown" size={13} />
              </div>
            </button>
            <button className="btn ghost sm"
                    style={{ justifyContent: 'flex-start', margin: '6px 0 2px' }}
                    onClick={leaveProject}>
              <Icon name="chevron" size={13} style={{ transform: 'rotate(180deg)' }} />
              All projects
            </button>
          </>
        ) : (
          <button className="project-switch" onClick={() => navigate('/projects')}>
            <div className="label">Scope</div>
            <div className="value">
              <span>All projects</span>
              <Icon name="chevron" size={13} />
            </div>
          </button>
        )}

        <nav className="nav">
          {nav.map((group) => {
            const visible = group.items.filter((i) => !i.perm || can(i.perm))
            if (!visible.length) return null
            return (
              <div className="nav-group" key={group.group}>
                <div className="nav-group-title">{group.group}</div>
                {visible.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}
                           className={({ isActive }) => {
                             const on = item.match
                               ? location.pathname === item.match
                                 && location.search === item.to.slice(item.match.length)
                               : isActive
                             return `nav-item${on ? ' active' : ''}`
                           }}>
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-foot">
          <ReviewInbox />
          <div className="user-chip" style={{ cursor: 'pointer' }} onClick={() => setMenu(!menu)}>
            <div className="avatar">{initials}</div>
            <div className="who" style={{ flex: 1, minWidth: 0 }}>
              <div className="name">{user?.full_name}</div>
              <div className="role">{user?.role_label} · {user?.monitor_id || user?.username}</div>
            </div>
            <Icon name="chevronDown" size={13} />
          </div>
          {menu && (
            <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
              <button className="btn ghost sm" style={{ justifyContent: 'flex-start' }}
                      onClick={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setMenu(false) }}>
                <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={14} />
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button className="btn ghost sm" style={{ justifyContent: 'flex-start' }}
                      onClick={() => { navigate('/settings'); setMenu(false) }}>
                <Icon name="settings" size={14} /> Settings
              </button>
              <button className="btn ghost sm" style={{ justifyContent: 'flex-start' }}
                      onClick={logout}>
                <Icon name="logout" size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>

      {switching && (
        <Modal title="Switch project" onClose={() => setSwitching(false)}>
          <div className="stack">
            <button className="card" style={{ padding: 13, textAlign: 'left', cursor: 'pointer' }}
                    onClick={leaveProject}>
              <div className="row" style={{ gap: 9 }}>
                <Icon name="folder" size={15} />
                <div>
                  <div style={{ fontWeight: 590 }}>View all projects</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                    Work above any single project
                  </div>
                </div>
              </div>
            </button>
            {projects.map((p) => (
              <button key={p.id}
                      className="card"
                      style={{
                        padding: 13, textAlign: 'left', cursor: 'pointer',
                        borderColor: p.id === project?.id ? 'var(--accent)' : undefined,
                        background: p.id === project?.id ? 'var(--accent-soft)' : undefined,
                      }}
                      onClick={() => {
                        enterProject(p.id)
                        setSwitching(false)
                        if (location.pathname !== '/') navigate('/')
                      }}>
                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 590 }}>{p.name}</div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                      {p.project_code} · {p.project_role || 'not assigned'} · {p.status}
                    </div>
                  </div>
                  {p.id === project?.id && <Icon name="check" size={16} />}
                </div>
              </button>
            ))}
            {!projects.length && (
              <p className="muted">There is nothing to switch to yet.</p>
            )}
          </div>
        </Modal>
      )}

      <Toasts items={toasts} />
    </div>
    </NavContext.Provider>
  )
}

export function PageHeader({ title, sub, children, crumb, scope }) {
  const { project } = useApp()
  const { setOpen } = useContext(NavContext)
  const label = crumb || (scope === 'portfolio' ? 'All projects'
                          : project ? `${project.project_code} · ${project.name}` : null)
  return (
    <>
      <header className="topbar">
        {/* Hidden above the breakpoint, where the sidebar is always showing. */}
        <button className="btn ghost icon nav-toggle" aria-label="Open navigation"
                onClick={() => setOpen(true)}>
          <Icon name="menu" size={17} />
        </button>
        <h1>{title}</h1>
        {label && <span className="crumb">/ {label}</span>}
        <div className="topbar-actions">{children}</div>
      </header>
    </>
  )
}


/* ------------------------------------------------------------------------ */
/**
 * Review work somebody has put in front of this person.
 *
 * "The list should also be supported by notifications/alerts elsewhere in the
 *  application so users know that work is waiting for them." A queue nobody
 * opens is not a queue, so the count sits where the reviewer already looks and
 * each line opens the record it is about.
 */
function ReviewInbox() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState(null)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try { setData(await api.get('/review/inbox')) } catch { /* not fatal */ }
  }, [])

  useEffect(() => {
    load()
    // Cheap and infrequent: this is a nudge, not a live feed.
    const handle = setInterval(load, 120000)
    return () => clearInterval(handle)
  }, [load])

  const unread = data?.unread || 0
  const items = data?.items || []
  if (!items.length) return null

  async function go(alert) {
    setOpen(false)
    try { await api.post(`/review/alerts/${alert.id}/acknowledge`) } catch { /* fine */ }
    load()
    navigate(`/review?open=${alert.subject_kind}:${alert.subject_id}`)
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <button className="btn ghost sm" style={{ width: '100%', justifyContent: 'flex-start' }}
              onClick={() => setOpen(!open)}>
        <Icon name="inbox" size={14} />
        Review inbox
        {unread > 0 && <span className="badge red" style={{ marginLeft: 'auto' }}>{unread}</span>}
      </button>
      {open && (
        <div className="stack" style={{ gap: 4, marginTop: 6 }}>
          {items.slice(0, 6).map((a) => (
            <button key={a.id} className="inbox-line" onClick={() => go(a)}>
              <span className={`dot ${a.severity}`} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{a.title}</b>
                <span className="dim"> {a.subject}</span>
              </span>
              {!a.read_at && <span className="badge blue">New</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

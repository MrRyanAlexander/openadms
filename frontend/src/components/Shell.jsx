import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/store'
import { Icon, Modal, Toasts } from './ui'

const NAV = [
  { group: 'Operations', items: [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/tickets', label: 'Tickets', icon: 'truck' },
    { to: '/incidents', label: 'Incidents', icon: 'alert' },
  ]},
  { group: 'Project', items: [
    { to: '/setup', label: 'Project Setup', icon: 'layers', perm: 'project.update' },
    { to: '/rules', label: 'Rules', icon: 'rules', perm: 'rule.manage' },
    { to: '/service-codes', label: 'Service Codes', icon: 'money', perm: 'service_code.manage' },
  ]},
  { group: 'Money', items: [
    { to: '/transactions', label: 'Transactions', icon: 'money', perm: 'transaction.read' },
    { to: '/invoices', label: 'Invoices', icon: 'invoice', perm: 'invoice.manage' },
  ]},
  { group: 'Records', items: [
    { to: '/organization', label: 'Organization', icon: 'building', perm: 'client.manage' },
    { to: '/workers', label: 'Workers', icon: 'users', perm: 'worker.manage' },
    { to: '/catalog', label: 'Ticket Catalog', icon: 'layers', perm: 'ticket_type.manage' },
  ]},
  { group: 'Oversight', items: [
    { to: '/audit', label: 'Audit History', icon: 'audit', perm: 'audit.read' },
    { to: '/query', label: 'Query Builder', icon: 'query', perm: 'query.build' },
    { to: '/sharing', label: 'Sharing & Peers', icon: 'share', perm: 'sharing.manage' },
  ]},
]

export default function Shell() {
  const { user, can, projects, project, setProjectId, logout, theme, setTheme, toasts } = useApp()
  const [switching, setSwitching] = useState(false)
  const [menu, setMenu] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const initials = useMemo(() => (user?.full_name || '?')
    .split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(), [user])

  return (
    <div className="shell">
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

        <button className="project-switch" onClick={() => setSwitching(true)}>
          <div className="label">Active project</div>
          <div className="value">
            <span>{project ? project.name : 'No project selected'}</span>
            <Icon name="chevronDown" size={13} />
          </div>
        </button>

        <nav className="nav">
          {NAV.map((group) => {
            const visible = group.items.filter((i) => !i.perm || can(i.perm))
            if (!visible.length) return null
            return (
              <div className="nav-group" key={group.group}>
                <div className="nav-group-title">{group.group}</div>
                {visible.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}
                           className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                    <Icon name={item.icon} size={15} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )
          })}
        </nav>

        <div className="sidebar-foot">
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
            {projects.map((p) => (
              <button key={p.id}
                      className="card"
                      style={{
                        padding: 13, textAlign: 'left', cursor: 'pointer',
                        borderColor: p.id === project?.id ? 'var(--accent)' : undefined,
                        background: p.id === project?.id ? 'var(--accent-soft)' : undefined,
                      }}
                      onClick={() => {
                        setProjectId(p.id)
                        setSwitching(false)
                        if (location.pathname !== '/') navigate('/')
                      }}>
                <div className="row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 590 }}>{p.name}</div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                      {p.project_code} · {p.project_role} · {p.status}
                    </div>
                  </div>
                  {p.id === project?.id && <Icon name="check" size={16} />}
                </div>
              </button>
            ))}
            {!projects.length && (
              <p className="muted">You are not assigned to any project yet.</p>
            )}
          </div>
        </Modal>
      )}

      <Toasts items={toasts} />
    </div>
  )
}

export function PageHeader({ title, sub, children, crumb }) {
  return (
    <>
      <header className="topbar">
        <h1>{title}</h1>
        {crumb && <span className="crumb">/ {crumb}</span>}
        <div className="topbar-actions">{children}</div>
      </header>
    </>
  )
}

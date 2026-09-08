import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useField } from './lib/field'
import { Icon, Toasts } from './components/kit'
import Login from './pages/Login'
import Home from './pages/Home'
import Scan from './pages/Scan'
import MyTickets from './pages/MyTickets'
import Profile from './pages/Profile'
import TicketFlow from './pages/TicketFlow'
import TicketDetail from './pages/TicketDetail'

const TITLES = {
  '/': 'Field', '/scan': 'Scan', '/tickets': 'My Tickets', '/profile': 'Profile',
}

export default function App() {
  const { booting, signedIn, online, queue, project, toasts } = useField()
  const location = useLocation()
  const navigate = useNavigate()

  if (booting) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <span className="spinner" />
      </div>
    )
  }

  if (!signedIn) return <Login />

  const root = TITLES[location.pathname]
  const nested = !root

  return (
    <div className="app">
      {!online && (
        <div className="offline-bar">
          Offline — everything you record is saved on this phone
          {queue.length > 0 && ` (${queue.length} waiting)`}
        </div>
      )}

      <header className="appbar">
        {nested && (
          <button className="btn ghost icon sm" onClick={() => navigate(-1)}>
            <Icon name="back" size={20} />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{root || 'Ticket'}</h1>
          {project && <div className="sub">{project.project_code} · {project.name}</div>}
        </div>
      </header>

      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="/tickets" element={<MyTickets />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/new/:typeId" element={<TicketFlow />} />
        <Route path="/ticket/:ticketId" element={<TicketDetail />} />
        <Route path="/ticket/:ticketId/continue" element={<TicketFlow />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <nav className="tabbar">
        {[['/', 'home', 'Home'], ['/scan', 'barcode', 'Scan'],
          ['/tickets', 'list', 'Tickets'], ['/profile', 'user', 'Profile']].map(
          ([to, icon, label]) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `tab${isActive ? ' on' : ''}`}>
              <Icon name={icon} size={21} />
              {label}
            </NavLink>
          ))}
      </nav>

      <Toasts items={toasts} />
    </div>
  )
}

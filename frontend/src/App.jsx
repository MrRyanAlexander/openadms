import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './lib/store'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Tickets from './pages/Tickets'
import Rules from './pages/Rules'
import Setup from './pages/Setup'
import { Invoices, ServiceCodes, Transactions } from './pages/Money'
import { Organization, Workers } from './pages/Records'
import { Audit, Catalog, QueryBuilder, Settings, Sharing } from './pages/Oversight'

export default function App() {
  const { booting, signedIn } = useApp()

  if (booting) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div className="row" style={{ gap: 10, color: 'var(--text-muted)' }}>
          <span className="spinner" /> Restoring your session
        </div>
      </div>
    )
  }

  if (!signedIn) return <Login />

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="incidents" element={<Tickets kindFilter="incident" />} />
        <Route path="setup" element={<Setup />} />
        <Route path="rules" element={<Rules />} />
        <Route path="service-codes" element={<ServiceCodes />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="organization" element={<Organization />} />
        <Route path="workers" element={<Workers />} />
        <Route path="catalog" element={<Catalog />} />
        <Route path="audit" element={<Audit />} />
        <Route path="query" element={<QueryBuilder />} />
        <Route path="sharing" element={<Sharing />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

import { Navigate, Route, Routes } from 'react-router-dom'
import { useApp } from './lib/store'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import NewProject from './pages/NewProject'
import ContractIntake from './pages/ContractIntake'
import Closeout from './pages/Closeout'
import Tickets from './pages/Tickets'
import Rules from './pages/Rules'
import Setup from './pages/Setup'
import Certifications from './pages/Certifications'
import { Invoices, ServiceCodes, Transactions } from './pages/Money'
import { Organization } from './pages/Records'
import Workers from './pages/Workers'
import { Audit, Catalog, QueryBuilder, Settings, Sharing } from './pages/Oversight'

export default function App() {
  const { booting, signedIn, inProject } = useApp()

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
        {/* With no project in context the portfolio is the home screen. That is
            a real place to be, not a missing selection. */}
        <Route index element={inProject ? <Dashboard /> : <Navigate to="/projects" replace />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/new" element={<NewProject />} />
        <Route path="tickets" element={<Tickets />} />
        <Route path="incidents" element={<Tickets kindFilter="incident" />} />
        <Route path="setup" element={<Setup />} />
        <Route path="certifications" element={<Certifications />} />
        <Route path="intake" element={<ContractIntake />} />
        <Route path="closeout" element={<Closeout />} />
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

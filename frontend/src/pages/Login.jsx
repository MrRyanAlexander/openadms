import { useState } from 'react'
import { useApp } from '../lib/store'
import { Field, Icon } from '../components/ui'
import { API_BASE } from '../lib/api'

const POINTS = [
  ['truck', 'Every load, haul out and unit ticket tracked from the curb to final disposal.'],
  ['rules', 'Rules turn completed tickets into locked transactions, with the quantity pulled from what the field actually recorded.'],
  ['audit', 'An immutable audit artifact for every change, ready for the reviewer who shows up two years later.'],
]

export default function Login() {
  const { login } = useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message || 'Sign in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <section className="login-art">
        <div className="brand" style={{ border: 0, padding: 0, height: 'auto', marginBottom: 34 }}>
          <div className="brand-mark" style={{ width: 34, height: 34 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16V7h9v9M13 10h3.4L20 13.4V16h-2.4" />
              <circle cx="7.5" cy="18.5" r="1.8" /><circle cx="16.5" cy="18.5" r="1.8" />
            </svg>
          </div>
          <div>
            <div className="brand-name" style={{ fontSize: 17 }}>Open ADMS</div>
            <div className="brand-sub">Automated Debris Management</div>
          </div>
        </div>
        <h2>The ticket is the record. Everything else is derived from it.</h2>
        <p>
          Open ADMS tracks debris per load or unit of work from start to completion and
          surfaces the result for review, reporting, invoicing and audit.
        </p>
        <div className="login-points">
          {POINTS.map(([icon, text]) => (
            <div className="login-point" key={icon}>
              <span className="pi"><Icon name={icon} size={14} /></span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="login-form">
        <form className="login-card" onSubmit={submit}>
          <h1>Sign in</h1>
          <div className="sub">Use the credentials your regional data manager issued.</div>

          <div className="stack">
            <Field label="Username" required>
              <input className="input" autoFocus autoComplete="username"
                     value={username} onChange={(e) => setUsername(e.target.value)} />
            </Field>
            <Field label="Password" required error={error}>
              <input className="input" type="password" autoComplete="current-password"
                     value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <button className="btn primary lg block" type="submit"
                    disabled={busy || !username || !password}>
              {busy && <span className="spinner" />} Sign in
            </button>
          </div>

          <div className="demo-hint">
            <div><b>Demo accounts</b> — password <b>openadms</b></div>
            <div style={{ marginTop: 5 }}>
              admin · manager · analyst · jmiller (monitor)
            </div>
            <div className="dim mono" style={{ marginTop: 8, fontSize: 11 }}>
              API {API_BASE}
            </div>
          </div>
        </form>
      </section>
    </div>
  )
}

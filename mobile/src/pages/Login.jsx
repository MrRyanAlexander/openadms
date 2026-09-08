import { useState } from 'react'
import { API_BASE } from '../lib/api'
import { useField } from '../lib/field'
import { Field, Icon } from '../components/kit'

export default function Login() {
  const { login } = useField()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      await login(username.trim(), password)
    } catch (err) {
      setError(err.message || 'Sign in failed')
    } finally { setBusy(false) }
  }

  return (
    <form className="login" onSubmit={submit}>
      <div className="logo">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 16V7h9v9M13 10h3.4L20 13.4V16h-2.4" />
          <circle cx="7.5" cy="18.5" r="1.8" /><circle cx="16.5" cy="18.5" r="1.8" />
        </svg>
      </div>
      <h1>Open ADMS Field</h1>
      <div className="sub">Sign in to start monitoring.</div>

      <div className="stack">
        <Field label="Username" required>
          <input className="input" autoCapitalize="none" autoCorrect="off"
                 autoComplete="username" inputMode="text"
                 value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="Password" required>
          <input className="input" type="password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>

        {error && <div className="banner red">{error}</div>}

        <button className="btn primary xl block" type="submit"
                disabled={busy || !username || !password}>
          {busy && <span className="spinner" />} Sign in
        </button>
      </div>

      <div className="banner" style={{ marginTop: 22 }}>
        <b>Demo</b> — jmiller / openadms
        <div className="dim mono" style={{ fontSize: 11, marginTop: 6, wordBreak: 'break-all' }}>
          {API_BASE}
        </div>
      </div>
    </form>
  )
}

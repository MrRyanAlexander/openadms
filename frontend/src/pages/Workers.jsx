/**
 * Workers, rebuilt around how crews actually arrive.
 *
 * One person at a time still works and is kept. The common case is a list of
 * forty people pasted out of a spreadsheet or an email, so that is what the
 * import is built for: one box, no questions about format, and the parsed rows
 * shown as an editable table before anything is written. A wrong name split or
 * a mis-guessed column is fixed in place, and the unusable rows stay visible
 * and fixable rather than merely counted.
 */
import { useMemo, useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, rowProps, Search,
  useDebounced,
} from '../components/ui'

const ELEVATED_ROLE_RANK = 30

export default function Workers() {
  const { toast, lookups, can } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [role, setRole] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [editing, setEditing] = useState(null)
  const [importing, setImporting] = useState(false)
  const [passwording, setPasswording] = useState(false)
  const [picked, setPicked] = useState({})

  const projects = useFetch(() => api.get('/projects', { limit: 200 }), [])
  const { data, loading, error, reload } = useFetch(
    () => api.get('/users', {
      q: search || undefined, role: role || undefined,
      project_id: projectFilter || undefined, limit: 200,
    }), [search, role, projectFilter])

  const rows = data?.items || []
  const chosen = Object.entries(picked).filter(([, v]) => v).map(([k]) => k)

  const employers = useMemo(() => {
    const seen = new Set()
    rows.forEach((u) => { if (u.employer_label) seen.add(u.employer_label) })
    return [...seen].sort()
  }, [rows])
  const [employer, setEmployer] = useState('')
  const visible = employer ? rows.filter((u) => u.employer_label === employer) : rows

  return (
    <>
      <PageHeader title="Workers" scope="portfolio">
        <button className="btn" onClick={() => setImporting(true)}>
          <Icon name="inbox" size={14} /> Paste a crew list
        </button>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> New worker
        </button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '11px 14px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
            <Icon name="users" size={14} />
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              Workers belong to this instance, not to any one project. Assigning someone to
              a project happens in Project Setup, and a temp worker paid by a staffing firm
              is found here by their employer.
            </div>
          </div>
        </div>

        <Card flush>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 9 }}>
            <Search value={q} onChange={setQ}
                    placeholder="Name, username, monitor ID, employee ID, employer" />
            <select className="select" style={{ width: 150 }} value={role}
                    onChange={(e) => setRole(e.target.value)}>
              <option value="">Any role</option>
              {(lookups?.roles || []).map((r) => (
                <option key={r.code} value={r.code}>{r.label}</option>
              ))}
            </select>
            <select className="select" style={{ width: 200 }} value={employer}
                    onChange={(e) => setEmployer(e.target.value)}>
              <option value="">Any employer</option>
              {employers.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
            <select className="select" style={{ width: 210 }} value={projectFilter}
                    onChange={(e) => setProjectFilter(e.target.value)}>
              <option value="">Any project</option>
              {(projects.data?.items || []).map((p) => (
                <option key={p.id} value={p.id}>{p.project_code} — {p.name}</option>
              ))}
            </select>
            {(role || employer || projectFilter) && (
              <button className="btn ghost sm" onClick={() => {
                setRole(''); setEmployer(''); setProjectFilter('')
              }}>
                <Icon name="x" size={13} /> Clear
              </button>
            )}
            <div className="spacer" />
            {chosen.length > 0 && (
              <button className="btn sm" onClick={() => setPasswording(true)}>
                Set password for {chosen.length} selected
              </button>
            )}
          </div>

          {loading && <Loading rows={6} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (visible.length === 0 ? (
            <Empty icon="users" title="No workers match">
              Adjust the filters, or paste a crew list to bring people in.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 34 }}>
                    <input type="checkbox"
                           checked={visible.length > 0 && chosen.length === visible.length}
                           onChange={(e) => setPicked(e.target.checked
                             ? Object.fromEntries(visible.map((u) => [u.id, true])) : {})} />
                  </th>
                  <th>Name</th><th>Employee ID</th><th>Employer</th><th>Monitor ID</th>
                  <th>Role</th><th className="num">Projects</th>
                  <th className="num">Tickets</th><th>Last login</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {visible.map((u) => (
                    <tr key={u.id} {...rowProps(() => setEditing(u))}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={Boolean(picked[u.id])}
                               onChange={(e) => setPicked({ ...picked, [u.id]: e.target.checked })} />
                      </td>
                      <td style={{ fontWeight: 550 }} onClick={() => setEditing(u)}>
                        {u.full_name}
                        <div className="dim" style={{ fontSize: 11.5 }}>{u.username}</div>
                      </td>
                      <td className="mono" onClick={() => setEditing(u)}>{u.employee_id || '—'}</td>
                      <td className="truncate" style={{ maxWidth: 190 }}
                          onClick={() => setEditing(u)}>{u.employer_label || '—'}</td>
                      <td className="mono" onClick={() => setEditing(u)}>{u.monitor_id || '—'}</td>
                      <td onClick={() => setEditing(u)}><Badge>{u.role_label}</Badge></td>
                      <td className="num" onClick={() => setEditing(u)}>{fmt.int(u.project_count)}</td>
                      <td className="num" onClick={() => setEditing(u)}>{fmt.int(u.tickets_created)}</td>
                      <td className="muted" onClick={() => setEditing(u)}>
                        {u.last_login_at ? fmt.ago(u.last_login_at) : 'Never'}
                      </td>
                      <td onClick={() => setEditing(u)}>
                        {u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
      </div>

      {editing && (
        <WorkerForm user={editing} roles={lookups?.roles || []} toast={toast}
                    canGrantRank={can('user.manage')}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); reload() }} />
      )}

      {importing && (
        <PasteImport onClose={() => setImporting(false)} toast={toast}
                     onDone={() => { setImporting(false); reload() }} />
      )}

      {passwording && (
        <BulkPassword userIds={chosen} count={chosen.length} toast={toast}
                      onClose={() => setPasswording(false)}
                      onDone={() => { setPasswording(false); setPicked({}); reload() }} />
      )}
    </>
  )
}

/* ------------------------------------------------------------ paste import */
const COLUMNS = [
  ['first_name', 'First'], ['middle_name', 'Middle'], ['last_name', 'Last'],
  ['employee_id', 'Employee ID'], ['employer_name', 'Employer'],
  ['monitor_id', 'Monitor ID'], ['email', 'Email'], ['phone', 'Phone'],
]

/**
 * One box. Nothing asks the user to declare a format, pick a separator or map
 * columns before they can see anything, because most of them have never heard
 * the word delimiter. What comes back is a table they can correct.
 */
function PasteImport({ onClose, toast, onDone }) {
  const { lookups } = useApp()
  const [text, setText] = useState('')
  const [role, setRole] = useState('monitor')
  const [employer, setEmployer] = useState('')
  const [password, setPassword] = useState('')
  const [preview, setPreview] = useState(null)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function look() {
    setBusy(true); setError(null)
    try {
      const result = await api.post('/users/import', {
        text, global_role: role, employer_name: employer || undefined,
      })
      setPreview(result)
      setRows(result.rows.map((r) => ({ ...r, values: { ...r.values } })))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function commit() {
    setBusy(true); setError(null)
    try {
      // The corrected table is sent back as a clean tab-separated block, so the
      // user's edits are what lands rather than the original paste.
      const header = COLUMNS.map(([, label]) => label).join('\t')
      const body = usable.map((r) => COLUMNS.map(([key]) => r.values[key] || '').join('\t'))
      const result = await api.post('/users/import', {
        text: [header, ...body].join('\n'), dry_run: false,
        global_role: role, employer_name: employer || undefined,
        default_password: password || undefined,
      })
      toast('Crew imported', result.summary)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const usable = rows.filter((r) => r.action !== 'skip')
  const unusable = rows.filter((r) => r.action === 'skip')

  function edit(index, key, value) {
    setRows((all) => all.map((r, i) => (i === index
      ? { ...r, values: { ...r.values, [key]: value },
          action: r.action === 'skip' && key.endsWith('name') && value ? 'create' : r.action,
          problems: (key.endsWith('name') && value) ? [] : r.problems }
      : r)))
  }

  return (
    <Modal wide title="Paste a crew list" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        {!preview ? (
          <button className="btn primary" disabled={!text.trim() || busy} onClick={look}>
            {busy && <span className="spinner" />} Read it
          </button>
        ) : (
          <button className="btn primary" disabled={!usable.length || busy} onClick={commit}>
            {busy && <span className="spinner" />}
            Import {usable.length} worker{usable.length === 1 ? '' : 's'}
          </button>
        )}
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}

      {!preview ? (
        <div className="stack">
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
            Copy the crew straight out of the spreadsheet, or out of the table in the
            email, and paste it below. A plain list of names works too. Nothing is written
            until you have seen what it read.
          </div>
          <Field label="Paste here" required>
            <textarea className="textarea" rows={9} value={text} autoFocus
                      placeholder={'Jordan Miller\t88101\tjmiller@example.com\nThu Nguyen\t88102\ttnguyen@example.com'}
                      onChange={(e) => setText(e.target.value)} />
          </Field>
          <div className="grid c3" style={{ gap: 12 }}>
            <Field label="Role for everyone in this list">
              <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
                {(lookups?.roles || []).filter((r) => r.rank < ELEVATED_ROLE_RANK).map((r) => (
                  <option key={r.code} value={r.code}>{r.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Employer" hint="Used where the list does not name one">
              <input className="input" value={employer} placeholder="Gateway Staffing Partners"
                     onChange={(e) => setEmployer(e.target.value)} />
            </Field>
            <Field label="Starting password"
                   hint="Everyone is asked to change it at first sign in">
              <input className="input" value={password} type="text"
                     onChange={(e) => setPassword(e.target.value)} />
            </Field>
          </div>
        </div>
      ) : (
        <div className="stack" style={{ gap: 12 }}>
          <div className="card" style={{ padding: '11px 14px', background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 13, lineHeight: 1.65 }}>{preview.summary}</div>
            {preview.unmapped_columns?.length > 0 && (
              <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                Columns that were not used: {preview.unmapped_columns.join(', ')}
              </div>
            )}
          </div>

          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            The name split is shown rather than applied silently, because it is sometimes
            wrong. Fix anything here and it is what gets written.
          </div>

          <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
            <table className="data">
              <thead><tr>
                <th>Row</th>
                {COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}
                <th>What happens</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.row} style={r.action === 'skip'
                    ? { background: 'var(--red-soft)' } : undefined}>
                    <td className="dim mono">{r.row}</td>
                    {COLUMNS.map(([key]) => (
                      <td key={key} style={{ padding: 3 }}>
                        <input className="input" style={{ minWidth: 92, fontSize: 12.5 }}
                               value={r.values[key] || ''}
                               onChange={(e) => edit(i, key, e.target.value)} />
                      </td>
                    ))}
                    <td style={{ minWidth: 190 }}>
                      {r.action === 'create' && <Badge tone="green">New</Badge>}
                      {r.action === 'update' && <Badge tone="blue">Already here, updated</Badge>}
                      {r.action === 'skip' && (
                        <span style={{ color: 'var(--red)', fontSize: 12.5 }}>
                          {r.problems.join('; ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {unusable.length > 0 && (
            <div className="muted" style={{ fontSize: 12.5 }}>
              {unusable.length} row{unusable.length === 1 ? '' : 's'} cannot be used yet.
              They are highlighted above and stay editable: fill in what is missing and
              they join the import.
            </div>
          )}

          <div className="row">
            <button className="btn ghost sm" onClick={() => { setPreview(null); setRows([]) }}>
              Start over with a different paste
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------------------------------------------------------- bulk passwords */
function BulkPassword({ userIds, count, toast, onClose, onDone }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      const result = await api.post('/users/bulk-password', {
        user_ids: userIds, password, must_reset: true,
      })
      toast('Password set', `${result.updated} account(s), reset required at first sign in`)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Set one password for ${count} selected`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={password.length < 8 || busy} onClick={save}>
          {busy && <span className="spinner" />} Set it
        </button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}
      <div className="stack">
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
          The selected accounts get this password and are asked to change it the first time
          they sign in. Anyone currently signed in on an old password is signed out.
        </div>
        <Field label="Password" required hint="At least 8 characters">
          <input className="input" value={password} autoFocus
                 onChange={(e) => setPassword(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------- one at a time */
function WorkerForm({ user, roles, toast, canGrantRank, onClose, onSaved }) {
  const isNew = !user.id
  const grantable = roles.filter((r) => canGrantRank || r.rank < ELEVATED_ROLE_RANK)
  const locked = !isNew && !canGrantRank
    && (roles.find((r) => r.code === user.global_role)?.rank ?? 0) >= ELEVATED_ROLE_RANK

  const contractors = useFetch(() => api.get('/contractors', { limit: 200 }), [])
  const [form, setForm] = useState({
    username: user.username || '',
    first_name: user.first_name || '', middle_name: user.middle_name || '',
    last_name: user.last_name || '', employee_id: user.employee_id || '',
    employer_contractor_id: user.employer_contractor_id || '',
    employer_name: user.employer_name || '',
    email: user.email || '', monitor_id: user.monitor_id || '',
    phone: user.phone || '', global_role: user.global_role || 'monitor',
    password: '', is_active: user.is_active ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    const payload = Object.fromEntries(
      Object.entries(form).filter(([k, v]) => v !== '' && !(k === 'password' && !v)))
    try {
      if (isNew) await api.post('/users', payload)
      else {
        delete payload.username
        await api.patch(`/users/${user.id}`, payload)
      }
      toast(isNew ? 'Worker created' : 'Worker updated',
            `${form.first_name} ${form.last_name}`.trim())
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const named = form.first_name || form.last_name

  return (
    <Modal wide title={isNew ? 'New worker' : user.full_name} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary"
                disabled={busy || locked || !named || (isNew && !form.username)}
                onClick={save}>
          {busy && <span className="spinner" />} {isNew ? 'Create' : 'Save'}
        </button>
      </>
    }>
      {locked && (
        <div className="card" style={{ padding: 12, marginBottom: 14,
                                       borderColor: 'var(--amber)',
                                       background: 'var(--amber-soft)' }}>
          This account holds analyst rank or higher. Editing it needs the user.manage
          permission, which an administrator carries.
        </div>
      )}
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}
      <div className="stack">
        <div className="grid c3" style={{ gap: 12 }}>
          <Field label="First name" required>
            <input className="input" value={form.first_name} autoFocus
                   onChange={(e) => set({ first_name: e.target.value })} />
          </Field>
          <Field label="Middle name">
            <input className="input" value={form.middle_name}
                   onChange={(e) => set({ middle_name: e.target.value })} />
          </Field>
          <Field label="Last name" required>
            <input className="input" value={form.last_name}
                   onChange={(e) => set({ last_name: e.target.value })} />
          </Field>
        </div>
        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Username" required hint={isNew ? '' : 'Cannot be changed'}>
            <input className="input" value={form.username} disabled={!isNew}
                   onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label="Employee ID" hint="The badge their employer knows them by">
            <input className="input" value={form.employee_id}
                   onChange={(e) => set({ employee_id: e.target.value })} />
          </Field>
          <Field label="Employer on the project"
                 hint="A contractor already in the system">
            <select className="select" value={form.employer_contractor_id}
                    onChange={(e) => set({ employer_contractor_id: e.target.value })}>
              <option value="">Not a project contractor</option>
              {(contractors.data?.items || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Employer name"
                 hint="For a staffing firm that is not on any project">
            <input className="input" value={form.employer_name}
                   onChange={(e) => set({ employer_name: e.target.value })} />
          </Field>
          <Field label="Monitor ID" hint="Printed on tickets the field creates">
            <input className="input" value={form.monitor_id}
                   onChange={(e) => set({ monitor_id: e.target.value })} placeholder="MON-118" />
          </Field>
          <Field label="Role"
                 hint={canGrantRank ? undefined
                       : 'Analyst and admin rank is granted by an administrator'}>
            <select className="select" value={form.global_role} disabled={locked}
                    onChange={(e) => set({ global_role: e.target.value })}>
              {grantable.map((r) => (
                <option key={r.code} value={r.code}>{r.label} — {r.description}</option>
              ))}
            </select>
          </Field>
          <Field label="Email">
            <input className="input" type="email" value={form.email}
                   onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className="input" value={form.phone}
                   onChange={(e) => set({ phone: e.target.value })} />
          </Field>
        </div>
        <Field label={isNew ? 'Initial password' : 'Reset password'}
               hint="Leave blank to require a reset on first sign in">
          <input className="input" type="password" value={form.password}
                 onChange={(e) => set({ password: e.target.value })} />
        </Field>
        {canGrantRank ? (
          <label className="check">
            <input type="checkbox" checked={form.is_active}
                   onChange={(e) => set({ is_active: e.target.checked })} />
            Active
          </label>
        ) : (
          <div className="hint">Taking an account away is done by an administrator.</div>
        )}
      </div>
    </Modal>
  )
}

import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, Search, Tabs, useDebounced,
} from '../components/ui'

/* ============================== ORGANIZATION ============================= */
const ENTITIES = {
  clients: {
    label: 'Clients', path: '/clients', icon: 'building',
    columns: [['Name', 'name'], ['Code', 'code'],
              ['Type', (r) => fmt.title(r.client_type)],
              ['FEMA applicant', 'fema_applicant_id'],
              ['Contact', 'primary_contact'], ['City', 'city'], ['State', 'state_code']],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'code', label: 'Code' },
      { key: 'client_type', label: 'Type', type: 'select',
        options: ['local_government', 'state_agency', 'federal_agency', 'tribal_nation',
                  'special_district', 'private'] },
      { key: 'fema_applicant_id', label: 'FEMA applicant ID' },
      { key: 'primary_contact', label: 'Primary contact' },
      { key: 'contact_email', label: 'Email' },
      { key: 'contact_phone', label: 'Phone' },
      { key: 'address_line1', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state_code', label: 'State' },
      { key: 'postal_code', label: 'ZIP' },
    ],
  },
  contractors: {
    label: 'Contractors', path: '/contractors', icon: 'truck',
    columns: [['Name', 'name'], ['Code', 'code'],
              ['Type', (r) => fmt.title(r.contractor_type)],
              ['Contact', 'primary_contact'], ['City', 'city']],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'code', label: 'Code' },
      { key: 'contractor_type', label: 'Type', type: 'select',
        options: ['debris_removal', 'monitoring', 'hauling', 'processing', 'other'] },
      { key: 'primary_contact', label: 'Primary contact' },
      { key: 'contact_email', label: 'Email' },
      { key: 'contact_phone', label: 'Phone' },
      { key: 'city', label: 'City' },
      { key: 'state_code', label: 'State' },
    ],
  },
  contracts: {
    label: 'Contracts', path: '/contracts', icon: 'invoice',
    columns: [['Number', 'contract_number'], ['Title', 'title'],
              ['Client', 'client_name'], ['Contractor', 'contractor_name'],
              ['Status', (r) => <Badge status={r.status} />],
              ['NTE', (r) => fmt.money(r.not_to_exceed)],
              ['Executed', (r) => fmt.date(r.executed_on)]],
    fields: [
      { key: 'contract_number', label: 'Contract number', required: true },
      { key: 'title', label: 'Title', required: true },
      { key: 'client_id', label: 'Client', type: 'ref', source: '/clients', labelKey: 'name',
        required: true },
      { key: 'contractor_id', label: 'Contractor', type: 'ref', source: '/contractors',
        labelKey: 'name', required: true },
      { key: 'contract_type', label: 'Contract type', type: 'select',
        options: ['unit_price', 'time_and_materials', 'lump_sum', 'cost_plus'] },
      { key: 'status', label: 'Status', type: 'select',
        options: ['draft', 'executed', 'active', 'suspended', 'closed'] },
      { key: 'executed_on', label: 'Executed on', type: 'date' },
      { key: 'effective_from', label: 'Effective from', type: 'date' },
      { key: 'effective_to', label: 'Effective to', type: 'date' },
      { key: 'not_to_exceed', label: 'Not to exceed', type: 'number' },
      { key: 'document_url', label: 'Signed document URL' },
    ],
  },
  sites: {
    label: 'Disposal sites', path: '/sites', icon: 'pin',
    columns: [['Name', 'name'], ['Code', 'site_code'],
              ['Kind', (r) => <Badge>{r.site_kind}</Badge>],
              ['Scale', (r) => (r.has_scale ? 'Yes' : 'No')],
              ['Permit', 'permit_number'],
              ['Expires', (r) => fmt.date(r.permit_expires_on)], ['City', 'city']],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'site_code', label: 'Site code' },
      { key: 'site_kind', label: 'Kind', type: 'select', required: true,
        options: ['DMS', 'FDS', 'TDSRS', 'TRANSFER', 'RECYCLING'] },
      { key: 'operator_id', label: 'Operator', type: 'ref', source: '/contractors',
        labelKey: 'name' },
      { key: 'address_line1', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state_code', label: 'State' },
      { key: 'latitude', label: 'Latitude', type: 'number' },
      { key: 'longitude', label: 'Longitude', type: 'number' },
      { key: 'permit_number', label: 'Permit number' },
      { key: 'permit_expires_on', label: 'Permit expires', type: 'date' },
      { key: 'has_scale', label: 'Has a certified scale', type: 'bool' },
      { key: 'capacity_cy', label: 'Capacity (CY)', type: 'number' },
    ],
  },
  equipment: {
    label: 'Trucks & equipment', path: '/equipment', icon: 'truck',
    columns: [['Unit', 'unit_number'], ['Type', (r) => fmt.title(r.equipment_type)],
              ['Make', 'make'], ['Model', 'model'],
              ['Capacity', (r) => (r.capacity_cy ? `${fmt.number(r.capacity_cy, 0)} CY` : '—')],
              ['Placard', 'placard_code'], ['Barcode', 'barcode'],
              ['Certified', (r) => fmt.date(r.certified_on)]],
    fields: [
      { key: 'unit_number', label: 'Unit number', required: true },
      { key: 'contractor_id', label: 'Contractor', type: 'ref', source: '/contractors',
        labelKey: 'name', required: true },
      { key: 'equipment_type', label: 'Type', type: 'select',
        options: ['truck', 'trailer', 'grapple', 'loader', 'chipper', 'grinder',
                  'excavator', 'crew', 'other'] },
      { key: 'make', label: 'Make' },
      { key: 'model', label: 'Model' },
      { key: 'model_year', label: 'Year', type: 'number' },
      { key: 'license_plate', label: 'Plate' },
      { key: 'capacity_cy', label: 'Certified capacity (CY)', type: 'number' },
      { key: 'tare_weight_lbs', label: 'Tare weight (lbs)', type: 'number' },
      { key: 'certified_on', label: 'Certified on', type: 'date' },
      { key: 'certification_exp', label: 'Certification expires', type: 'date' },
      { key: 'placard_code', label: 'Placard code' },
      { key: 'barcode', label: 'Barcode' },
    ],
  },
  disasters: {
    label: 'Disasters', path: '/disasters', icon: 'alert',
    columns: [['Declaration', 'declaration_code'], ['Name', 'name'],
              ['Incident', 'incident_type'],
              ['Declared', (r) => fmt.date(r.declared_on)], ['State', 'state_code']],
    fields: [
      { key: 'declaration_code', label: 'Declaration code', required: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'incident_type', label: 'Incident type' },
      { key: 'declared_on', label: 'Declared on', type: 'date' },
      { key: 'incident_start', label: 'Incident start', type: 'date' },
      { key: 'incident_end', label: 'Incident end', type: 'date' },
      { key: 'state_code', label: 'State' },
    ],
  },
}

export function Organization() {
  const [tab, setTab] = useState('clients')
  const config = ENTITIES[tab]

  return (
    <>
      <PageHeader title="Organization" crumb={config.label} />
      <div className="page">
        <Card flush>
          <Tabs value={tab} onChange={setTab}
                tabs={Object.entries(ENTITIES).map(([key, c]) => ({ key, label: c.label }))} />
          <EntityTable key={tab} config={config} />
        </Card>
      </div>
    </>
  )
}

function EntityTable({ config }) {
  const { toast } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [editing, setEditing] = useState(null)
  const { data, loading, error, reload } = useFetch(
    () => api.get(config.path, { q: search || undefined, limit: 200 }),
    [config.path, search])

  return (
    <>
      <div className="card-head" style={{ borderTop: 0 }}>
        <Search value={q} onChange={setQ} placeholder={`Search ${config.label.toLowerCase()}`} />
        <div className="spacer" />
        <button className="btn primary sm" onClick={() => setEditing({})}>
          <Icon name="plus" size={13} /> New
        </button>
      </div>

      {loading && <Loading rows={6} />}
      {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

      {data && !loading && (data.items.length === 0 ? (
        <Empty icon={config.icon} title={`No ${config.label.toLowerCase()} yet`} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              {config.columns.map(([label]) => <th key={label}>{label}</th>)}
              <th />
            </tr></thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => setEditing(row)}>
                  {config.columns.map(([label, accessor]) => (
                    <td key={label}>
                      {typeof accessor === 'function' ? accessor(row) : (row[accessor] ?? '—')}
                    </td>
                  ))}
                  <td style={{ width: 30, textAlign: 'right' }} className="dim">
                    <Icon name="chevron" size={13} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {editing && (
        <EntityForm config={config} record={editing} onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); reload() }} toast={toast} />
      )}
    </>
  )
}

function EntityForm({ config, record, onClose, onSaved, toast }) {
  const isNew = !record.id
  const [form, setForm] = useState(() => {
    const seed = {}
    config.fields.forEach((f) => {
      const v = record[f.key]
      seed[f.key] = v === null || v === undefined ? (f.type === 'bool' ? false : '')
        : (f.type === 'date' ? String(v).slice(0, 10) : v)
    })
    return seed
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setBusy(true); setError(null)
    const payload = {}
    config.fields.forEach((f) => {
      const value = form[f.key]
      if (value === '' || value === undefined) return
      payload[f.key] = f.type === 'number' ? Number(value) : value
    })
    try {
      if (isNew) await api.post(config.path, payload)
      else await api.patch(`${config.path}/${record.id}`, payload)
      toast(isNew ? 'Created' : 'Saved', payload.name || payload.contract_number
                                          || payload.unit_number || config.label)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const valid = config.fields.filter((f) => f.required).every((f) => form[f.key])

  return (
    <Modal wide title={`${isNew ? 'New' : 'Edit'} ${config.label.replace(/s$/, '').toLowerCase()}`}
           onClose={onClose} footer={
             <>
               {!isNew && (
                 <button className="btn danger" onClick={async () => {
                   await api.del(`${config.path}/${record.id}`)
                   toast('Deactivated', record.name || record.unit_number)
                   onSaved()
                 }}>Deactivate</button>
               )}
               <div className="spacer" />
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className="btn primary" disabled={!valid || busy} onClick={save}>
                 {busy && <span className="spinner" />} {isNew ? 'Create' : 'Save'}
               </button>
             </>
           }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                       borderColor: 'var(--red)', background: 'var(--red-soft)',
                       color: 'var(--red)' }}>{error}</div>}
      <div className="grid c2" style={{ gap: 12 }}>
        {config.fields.map((f) => (
          <FormField key={f.key} field={f} value={form[f.key]}
                     onChange={(v) => setForm({ ...form, [f.key]: v })} />
        ))}
      </div>
    </Modal>
  )
}

function FormField({ field, value, onChange }) {
  const refs = useFetch(
    () => (field.type === 'ref' ? api.get(field.source, { limit: 200 }) : null),
    [field.source], { skip: field.type !== 'ref' })

  if (field.type === 'bool') {
    return (
      <label className="check" style={{ alignSelf: 'end', paddingBottom: 9 }}>
        <input type="checkbox" checked={Boolean(value)}
               onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    )
  }

  return (
    <Field label={field.label} required={field.required}>
      {field.type === 'select' ? (
        <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {field.options.map((o) => <option key={o} value={o}>{fmt.title(o)}</option>)}
        </select>
      ) : field.type === 'ref' ? (
        <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(refs.data?.items || []).map((r) => (
            <option key={r.id} value={r.id}>{r[field.labelKey]}</option>
          ))}
        </select>
      ) : (
        <input className="input"
               type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
               value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/* ================================= WORKERS =============================== */
export function Workers() {
  const { toast, lookups } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [editing, setEditing] = useState(null)
  const { data, loading, error, reload } = useFetch(
    () => api.get('/users', { q: search || undefined, limit: 200 }), [search])

  return (
    <>
      <PageHeader title="Workers">
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> New worker
        </button>
      </PageHeader>
      <div className="page">
        <Card flush>
          <div className="card-head">
            <Search value={q} onChange={setQ} placeholder="Name, username, monitor ID" />
          </div>
          {loading && <Loading rows={6} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}
          {data && !loading && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Name</th><th>Username</th><th>Monitor ID</th><th>Role</th>
                  <th className="num">Projects</th><th className="num">Tickets created</th>
                  <th>Last login</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {data.items.map((u) => (
                    <tr key={u.id} className="clickable" onClick={() => setEditing(u)}>
                      <td style={{ fontWeight: 550 }}>{u.full_name}</td>
                      <td className="mono dim">{u.username}</td>
                      <td className="mono">{u.monitor_id || '—'}</td>
                      <td><Badge>{u.role_label}</Badge></td>
                      <td className="num">{fmt.int(u.project_count)}</td>
                      <td className="num">{fmt.int(u.tickets_created)}</td>
                      <td className="muted">{u.last_login_at ? fmt.ago(u.last_login_at) : 'Never'}</td>
                      <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge>Disabled</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {editing && (
        <WorkerForm user={editing} roles={lookups?.roles || []} toast={toast}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); reload() }} />
      )}
    </>
  )
}

function WorkerForm({ user, roles, toast, onClose, onSaved }) {
  const isNew = !user.id
  const [form, setForm] = useState({
    username: user.username || '', full_name: user.full_name || '',
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
      toast(isNew ? 'Worker created' : 'Worker updated', form.full_name)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'New worker' : form.full_name} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.full_name || !form.username}
                onClick={save}>{busy && <span className="spinner" />} {isNew ? 'Create' : 'Save'}</button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                       borderColor: 'var(--red)', background: 'var(--red-soft)',
                       color: 'var(--red)' }}>{error}</div>}
      <div className="stack">
        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Full name" required>
            <input className="input" value={form.full_name} autoFocus
                   onChange={(e) => set({ full_name: e.target.value })} />
          </Field>
          <Field label="Username" required hint={isNew ? '' : 'Cannot be changed'}>
            <input className="input" value={form.username} disabled={!isNew}
                   onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label="Monitor ID" hint="Printed on tickets the field creates">
            <input className="input" value={form.monitor_id}
                   onChange={(e) => set({ monitor_id: e.target.value })} placeholder="MON-118" />
          </Field>
          <Field label="Role">
            <select className="select" value={form.global_role}
                    onChange={(e) => set({ global_role: e.target.value })}>
              {roles.map((r) => (
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
        <label className="check">
          <input type="checkbox" checked={form.is_active}
                 onChange={(e) => set({ is_active: e.target.checked })} />
          Active
        </label>
      </div>
    </Modal>
  )
}

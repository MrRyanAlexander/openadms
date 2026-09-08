import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Confirm, Empty, ErrorNote, Field, Icon, Loading, Modal, Tabs,
} from '../components/ui'

const STEPS = [
  { key: 'has_client', label: 'Client' },
  { key: 'has_contract', label: 'Contract' },
  { key: 'has_contractor', label: 'Contractor' },
  { key: 'has_site', label: 'Disposal site' },
  { key: 'has_ticket_type', label: 'Ticket types' },
  { key: 'has_field_worker', label: 'Field workers' },
  { key: 'has_service_code', label: 'Service codes' },
  { key: 'has_rate', label: 'Rates' },
  { key: 'has_rule', label: 'Rules' },
]

export default function Setup() {
  const { projectId, project, toast } = useApp()
  const [tab, setTab] = useState('overview')
  const [adding, setAdding] = useState(null)

  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })
  const catalogue = {
    contractors: useFetch(() => api.get('/contractors', { limit: 200 }), []),
    contracts: useFetch(() => api.get('/contracts', { limit: 200 }), []),
    sites: useFetch(() => api.get('/sites', { limit: 200 }), []),
    types: useFetch(() => api.get('/ticket-types'), []),
    users: useFetch(() => api.get('/users', { limit: 200 }), []),
  }

  if (!projectId) {
    return (<><PageHeader title="Project Setup" /><div className="page">
      <Empty icon="folder" title="No project in context" /></div></>)
  }

  const p = detail.data

  async function link(path, body, label) {
    try {
      await api.post(path, body)
      toast('Linked', label)
      setAdding(null)
      detail.reload()
    } catch (err) { toast('Could not link', err.message, 'err') }
  }

  async function unlink(path, label) {
    try {
      await api.del(path)
      toast('Removed', label)
      detail.reload()
    } catch (err) { toast('Could not remove', err.message, 'err') }
  }

  return (
    <>
      <PageHeader title="Project Setup" crumb={project?.project_code}>
        <button className="btn icon" onClick={detail.reload}><Icon name="refresh" size={15} /></button>
      </PageHeader>

      <div className="page">
        {detail.loading && <Loading rows={7} />}
        {detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}

        {p && (
          <div className="stack" style={{ gap: 14 }}>
            <Card>
              <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="row" style={{ gap: 9 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 640 }}>{p.name}</h2>
                    <Badge status={p.status} />
                    <Badge status={p.visibility_flag} />
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>
                    {p.client_name}
                    {p.declaration_code && ` · ${p.declaration_code}`}
                    {p.program && ` · ${p.program}`}
                  </div>
                  {p.description && (
                    <div className="muted" style={{ fontSize: 13, marginTop: 8, maxWidth: 640,
                                                    lineHeight: 1.65 }}>{p.description}</div>
                  )}
                </div>
                <div style={{ minWidth: 260 }}>
                  <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {STEPS.map((s) => (
                      <span key={s.key} className={`badge ${p[s.key] ? 'green' : 'amber'}`}>
                        <Icon name={p[s.key] ? 'check' : 'alert'} size={11} /> {s.label}
                      </span>
                    ))}
                  </div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
                    {p.ready_for_field
                      ? 'The field can create tickets on this project.'
                      : `Field work is blocked until you add: ${(p.missing || []).join(', ')}.`}
                  </div>
                </div>
              </div>
            </Card>

            <Card flush>
              <Tabs value={tab} onChange={setTab} tabs={[
                { key: 'overview', label: 'Contractors', count: p.contractors.length },
                { key: 'contracts', label: 'Contracts', count: p.contracts.length },
                { key: 'sites', label: 'Disposal sites', count: p.sites.length },
                { key: 'types', label: 'Ticket types', count: p.ticket_types.length },
                { key: 'zones', label: 'Zones', count: p.zones.length },
                { key: 'workers', label: 'Workers', count: p.assignments.length },
              ]} />

              <div style={{ padding: 16 }}>
                {tab === 'overview' && (
                  <LinkTable
                    rows={p.contractors}
                    columns={[['Contractor', 'name'], ['Code', 'code'],
                              ['Role', (r) => fmt.title(r.role_on_project)]]}
                    onAdd={() => setAdding('contractor')}
                    addLabel="Link contractor"
                    onRemove={(r) => unlink(`/projects/${projectId}/contractors/${r.id}`, r.name)}
                    empty="No contractors on this project. Rules and service codes can only reference contractors linked here." />
                )}
                {tab === 'contracts' && (
                  <LinkTable
                    rows={p.contracts}
                    columns={[['Contract', 'contract_number'], ['Title', 'title'],
                              ['Contractor', 'contractor_name'],
                              ['Status', (r) => <Badge status={r.contract_status} />],
                              ['NTE', (r) => fmt.money(r.not_to_exceed)],
                              ['Primary', (r) => (r.is_primary ? <Badge tone="blue">Primary</Badge> : '')]]}
                    onAdd={() => setAdding('contract')}
                    addLabel="Link contract"
                    onRemove={(r) => unlink(`/projects/${projectId}/contracts/${r.id}`, r.contract_number)}
                    empty="No contracts linked. A rule cannot be saved until its contract is on the project." />
                )}
                {tab === 'sites' && (
                  <LinkTable
                    rows={p.sites}
                    columns={[['Site', 'name'], ['Code', 'site_code'],
                              ['Kind', (r) => <Badge>{r.site_kind}</Badge>],
                              ['Scale', (r) => (r.has_scale ? 'Yes' : 'No')],
                              ['Permit', 'permit_number'],
                              ['Expires', (r) => fmt.date(r.permit_expires_on)]]}
                    onAdd={() => setAdding('site')}
                    addLabel="Link site"
                    onRemove={(r) => unlink(`/projects/${projectId}/sites/${r.id}`, r.name)}
                    empty="No disposal sites. Load tickets cannot be closed without one." />
                )}
                {tab === 'types' && (
                  <LinkTable
                    rows={p.ticket_types}
                    columns={[['Ticket type', 'label'], ['Code', 'code'],
                              ['Kind', (r) => fmt.title(r.kind)],
                              ['Stages', (r) => (r.stage_schema || []).length],
                              ['Fields', (r) => (r.field_schema || []).length],
                              ['Billable', (r) => (r.billable ? 'Yes' : 'No')]]}
                    onAdd={() => setAdding('type')}
                    addLabel="Enable ticket type"
                    onRemove={(r) => unlink(`/projects/${projectId}/ticket-types/${r.id}`, r.label)}
                    empty="No ticket types enabled. The field app shows nothing to create until one is." />
                )}
                {tab === 'zones' && (
                  <ZoneEditor zones={p.zones} projectId={projectId}
                              onChanged={detail.reload} toast={toast} />
                )}
                {tab === 'workers' && (
                  <LinkTable
                    rows={p.assignments}
                    columns={[['Worker', 'full_name'], ['Monitor ID', 'monitor_id'],
                              ['Project role', (r) => <Badge>{fmt.title(r.project_role)}</Badge>],
                              ['Firm', 'contractor_name'],
                              ['Creates tickets', (r) => (r.can_create_tickets ? 'Yes' : 'No')],
                              ['Reviews', (r) => (r.can_review_tickets ? 'Yes' : 'No')],
                              ['Active', (r) => (r.is_active ? <Badge tone="green">Active</Badge>
                                                             : <Badge>Inactive</Badge>)]]}
                    onAdd={() => setAdding('worker')}
                    addLabel="Assign worker"
                    onRemove={(r) => unlink(`/projects/${projectId}/assignments/${r.id}`, r.full_name)}
                    empty="Nobody is assigned. A ticket can only be created by an approved worker on the project." />
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

      {adding && (
        <AddLink kind={adding} project={p} catalogue={catalogue}
                 onClose={() => setAdding(null)}
                 onPick={(body, label) => {
                   const paths = {
                     contractor: `/projects/${projectId}/contractors`,
                     contract: `/projects/${projectId}/contracts`,
                     site: `/projects/${projectId}/sites`,
                     type: `/projects/${projectId}/ticket-types`,
                     worker: `/projects/${projectId}/assignments`,
                   }
                   link(paths[adding], body, label)
                 }} />
      )}
    </>
  )
}

function LinkTable({ rows, columns, onAdd, addLabel, onRemove, empty }) {
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="spacer" />
        <button className="btn primary sm" onClick={onAdd}>
          <Icon name="plus" size={13} /> {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <Empty icon="layers" title="Nothing linked yet">{empty}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              {columns.map(([label]) => <th key={label}>{label}</th>)}
              <th />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {columns.map(([label, accessor]) => (
                    <td key={label}>
                      {typeof accessor === 'function' ? accessor(r) : (r[accessor] ?? '—')}
                    </td>
                  ))}
                  <td style={{ width: 40, textAlign: 'right' }}>
                    <button className="btn ghost icon sm" onClick={() => onRemove(r)}
                            title="Remove from project">
                      <Icon name="x" size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function AddLink({ kind, project, catalogue, onClose, onPick }) {
  const [selection, setSelection] = useState('')
  const [extra, setExtra] = useState({})

  const config = {
    contractor: {
      title: 'Link a contractor',
      items: (catalogue.contractors.data?.items || []).filter(
        (c) => !project.contractors.some((pc) => pc.contractor_id === c.id)),
      label: (c) => `${c.name}${c.code ? ` (${c.code})` : ''}`,
      body: () => ({ contractor_id: selection, role_on_project: extra.role || 'prime' }),
      fields: (
        <Field label="Role on project">
          <select className="select" value={extra.role || 'prime'}
                  onChange={(e) => setExtra({ ...extra, role: e.target.value })}>
            <option value="prime">Prime</option>
            <option value="subcontractor">Subcontractor</option>
            <option value="monitoring_firm">Monitoring firm</option>
          </select>
        </Field>
      ),
    },
    contract: {
      title: 'Link a contract',
      items: (catalogue.contracts.data?.items || []).filter(
        (c) => !project.contracts.some((pc) => pc.contract_id === c.id)),
      label: (c) => `${c.contract_number} — ${c.title}`,
      body: () => ({ contract_id: selection, is_primary: Boolean(extra.primary) }),
      fields: (
        <label className="check">
          <input type="checkbox" checked={Boolean(extra.primary)}
                 onChange={(e) => setExtra({ ...extra, primary: e.target.checked })} />
          Make this the primary contract
        </label>
      ),
    },
    site: {
      title: 'Link a disposal site',
      items: (catalogue.sites.data?.items || []).filter(
        (s) => !project.sites.some((ps) => ps.site_id === s.id)),
      label: (s) => `${s.name} (${s.site_kind})`,
      body: () => ({ site_id: selection }),
    },
    type: {
      title: 'Enable a ticket type',
      items: (catalogue.types.data?.items || []).filter(
        (t) => !project.ticket_types.some((pt) => pt.ticket_type_id === t.id)),
      label: (t) => `${t.label} — ${fmt.title(t.kind)}`,
      body: () => ({ ticket_type_id: selection }),
    },
    worker: {
      title: 'Assign a worker',
      items: (catalogue.users.data?.items || []).filter(
        (u) => !project.assignments.some((a) => a.user_id === u.id)),
      label: (u) => `${u.full_name}${u.monitor_id ? ` (${u.monitor_id})` : ''} — ${u.role_label}`,
      body: () => ({
        user_id: selection,
        project_role: extra.role || 'monitor',
        can_create_tickets: extra.create !== false,
        can_review_tickets: Boolean(extra.review),
      }),
      fields: (
        <>
          <Field label="Project role">
            <select className="select" value={extra.role || 'monitor'}
                    onChange={(e) => setExtra({ ...extra, role: e.target.value })}>
              {['monitor', 'manager', 'analyst', 'admin'].map((r) => (
                <option key={r} value={r}>{fmt.title(r)}</option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={extra.create !== false}
                   onChange={(e) => setExtra({ ...extra, create: e.target.checked })} />
            May create tickets
          </label>
          <label className="check">
            <input type="checkbox" checked={Boolean(extra.review)}
                   onChange={(e) => setExtra({ ...extra, review: e.target.checked })} />
            May review other people's tickets
          </label>
        </>
      ),
    },
  }[kind]

  const chosen = config.items.find((i) => i.id === selection)

  return (
    <Modal title={config.title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!selection}
                onClick={() => onPick(config.body(), config.label(chosen))}>
          Link
        </button>
      </>
    }>
      <div className="stack">
        <Field label="Choose one" required>
          <select className="select" value={selection}
                  onChange={(e) => setSelection(e.target.value)}>
            <option value="">Select…</option>
            {config.items.map((i) => (
              <option key={i.id} value={i.id}>{config.label(i)}</option>
            ))}
          </select>
        </Field>
        {config.items.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>
            Everything available is already linked. Create a new record under
            Organization first.
          </div>
        )}
        {config.fields}
      </div>
    </Modal>
  )
}

function ZoneEditor({ zones, projectId, onChanged, toast }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  async function add() {
    try {
      await api.post(`/projects/${projectId}/zones`, { zone_code: code, name })
      setCode(''); setName(''); onChanged()
    } catch (err) { toast('Could not add zone', err.message, 'err') }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <input className="input" style={{ width: 110 }} placeholder="Code"
               value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="input" style={{ maxWidth: 300 }} placeholder="Name (optional)"
               value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary sm" disabled={!code} onClick={add}>
          <Icon name="plus" size={13} /> Add zone
        </button>
      </div>
      {zones.length === 0 ? (
        <Empty icon="pin" title="No zones defined">
          Zones are optional. They give the rule builder a `zone in [...]` operand and
          group tickets in reporting.
        </Empty>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          {zones.map((z) => (
            <div key={z.id} className="badge" style={{ height: 28, fontSize: 12.5 }}>
              <b>{z.zone_code}</b>{z.name ? ` · ${z.name}` : ''}
              <button className="btn ghost icon sm" style={{ width: 20, height: 20 }}
                      onClick={async () => {
                        await api.del(`/projects/${projectId}/zones/${z.id}`)
                        onChanged()
                      }}>
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Drawer, Empty, ErrorNote, Field, Icon, Loading, Modal, Search, Stat,
  Tabs, useDebounced,
} from '../components/ui'
import { DocumentsPanel } from '../components/setup-bits'

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
    label: 'Contractors', path: '/contractors', icon: 'truck', detail: 'documents',
    documentKinds: ['rate_sheet', 'certificate_hhw', 'certificate_asbestos',
                    'certificate_other', 'insurance', 'w9', 'other'],
    columns: [['Name', 'name'], ['Code', 'code'],
              ['Type', (r) => fmt.title(r.contractor_type)],
              ['Contact', 'primary_contact'], ['City', 'city']],
    fields: [
      { key: 'name', label: 'Name', required: true },
      { key: 'code', label: 'Code' },
      { key: 'contractor_type', label: 'Type', type: 'select', required: true,
        options: ['hauler', 'tree_removal', 'monitoring', 'other'] },
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
              ['Projects', (r) => (Number(r.project_count) > 0
                ? <Badge>{fmt.int(r.project_count)}</Badge>
                : <span className="dim">none</span>)],
              ['Line items', (r) => (Number(r.line_item_count) > 0
                ? fmt.int(r.line_item_count) : '—')],
              ['NTE', (r) => fmt.money(r.not_to_exceed)],
              ['Executed', (r) => fmt.date(r.executed_on)]],
    fields: [
      { key: 'contract_number', label: 'Contract number', required: true },
      { key: 'title', label: 'Title', required: true },
      { key: 'client_id', label: 'Client', type: 'ref', source: '/clients', labelKey: 'name',
        required: true },
      { key: 'contractor_id', label: 'Contractor', type: 'ref', source: '/contractors',
        labelKey: 'name', required: true },
      { key: 'contract_type', label: 'Contract type', type: 'select', required: true,
        options: ['unit_price', 'time_and_materials', 'lump_sum', 'cost_plus'] },
      { key: 'status', label: 'Status', type: 'select', required: true,
        options: ['draft', 'executed', 'active', 'suspended', 'closed'] },
      { key: 'executed_on', label: 'Executed on', type: 'date' },
      { key: 'effective_from', label: 'Effective from', type: 'date', required: true },
      { key: 'effective_to', label: 'Effective to', type: 'date' },
      { key: 'not_to_exceed', label: 'Not to exceed', type: 'number' },
      { key: 'document_url', label: 'Signed document URL', required: true, wide: true,
        hint: 'The executed contract in Box or SharePoint. Paste the full https link. '
            + 'Billing depends on it later, so it is required now.' },
    ],
    notice: 'contracts',
    detail: 'contract',
  },
  sites: {
    label: 'Disposal sites', path: '/sites', icon: 'pin', detail: 'documents',
    documentKinds: ['permit', 'insurance', 'certificate_other', 'other'],
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

function ScopeNote({ children }) {
  return (
    <div className="card" style={{ padding: '11px 14px', marginBottom: 14,
                                   background: 'var(--surface-2)' }}>
      <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
        <Icon name="building" size={14} />
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  )
}

export function Organization() {
  const [params, setParams] = useSearchParams()
  const tab = ENTITIES[params.get('tab')] ? params.get('tab') : 'clients'
  const setTab = (next) => setParams({ tab: next }, { replace: true })
  const config = ENTITIES[tab]

  return (
    <>
      <PageHeader title={config.label} scope="portfolio" crumb="Organization" />
      <div className="page">
        <ScopeNote>
          These records belong to this instance, not to the project in the switcher.
          A client, contractor, contract, disposal site, truck or disaster entered here
          is reusable on every project, and linking one to a project happens in Project
          Setup.
        </ScopeNote>
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
  const [viewing, setViewing] = useState(null)
  const { data, loading, error, reload } = useFetch(
    () => api.get(config.path, { q: search || undefined, limit: 200 }),
    [config.path, search])

  return (
    <>
      {config.notice === 'contracts' && <ContractRemediation />}
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
                <tr key={row.id} className="clickable"
                    onClick={() => (config.detail ? setViewing(row) : setEditing(row))}>
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

      {viewing && config.detail === 'contract' && (
        <ContractDrawer contractId={viewing.id} onClose={() => setViewing(null)}
                        onEdit={() => { setEditing(viewing); setViewing(null) }} />
      )}

      {viewing && config.detail === 'documents' && (
        <Drawer title={viewing.name}
                sub={config.label.replace(/s$/, '')}
                onClose={() => setViewing(null)}
                actions={<button className="btn sm"
                                 onClick={() => { setEditing(viewing); setViewing(null) }}>
                  Edit
                </button>}>
          <DocumentsPanel entityType={config.path === '/sites' ? 'disposal_sites' : 'contractors'}
                          entityId={viewing.id} kinds={config.documentKinds} />
        </Drawer>
      )}

      {editing && (
        <EntityForm config={config} record={editing} onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); reload() }} toast={toast} />
      )}
    </>
  )
}

/**
 * A contract read from above any single project. The question this answers is
 * the one a single project screen cannot: which projects does this contract
 * serve, and how much of its not-to-exceed is gone across all of them.
 */
function ContractDrawer({ contractId, onClose, onEdit }) {
  const [tab, setTab] = useState('projects')
  const { data, loading, error } = useFetch(
    () => api.get(`/contracts/${contractId}/overview`), [contractId])

  return (
    <Drawer title={data ? data.contract_number : 'Contract'}
            sub={data ? data.title : ''}
            onClose={onClose}
            actions={<button className="btn sm" onClick={onEdit}>Edit</button>}>
      {loading && <Loading rows={5} />}
      {error && <ErrorNote error={error} />}
      {data && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="grid c3" style={{ gap: 12 }}>
            <Stat label="Not to exceed" value={fmt.money(data.not_to_exceed, 0)} />
            <Stat label="Billed across all projects" value={fmt.money(data.billed_total, 0)}
                  detail={data.nte_burn_pct != null ? `${data.nte_burn_pct}% of NTE` : null}
                  tone={data.nte_burn_pct >= 90 ? 'red'
                        : data.nte_burn_pct >= 75 ? 'amber' : undefined} />
            <Stat label="Remaining"
                  value={data.nte_remaining != null ? fmt.money(data.nte_remaining, 0) : '—'} />
          </div>

          <div className="card" style={{ padding: '11px 14px' }}>
            <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
              <Icon name="external" size={14} />
              <div style={{ fontSize: 12.5, lineHeight: 1.6, minWidth: 0 }}>
                <div className="dim">Signed document</div>
                <a href={data.document_url} target="_blank" rel="noreferrer"
                   className="truncate" style={{ display: 'block' }}>{data.document_url}</a>
              </div>
            </div>
          </div>

          <Card flush>
            <Tabs value={tab} onChange={setTab} tabs={[
              { key: 'projects', label: 'Projects', count: data.projects.length },
              { key: 'lines', label: 'Line items', count: data.line_items.length },
              { key: 'documents', label: 'Documents', count: data.documents.length },
            ]} />
            {tab === 'projects' && (
              data.projects.length === 0
                ? <Empty icon="folder" title="Not linked to any project yet" />
                : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr>
                        <th>Code</th><th>Project</th><th>Status</th>
                        <th className="num">Billed</th><th>Linked</th>
                      </tr></thead>
                      <tbody>
                        {data.projects.map((p) => (
                          <tr key={p.id}>
                            <td className="mono">{p.project_code}</td>
                            <td>{p.name}{p.is_primary && <Badge tone="green">Primary</Badge>}</td>
                            <td><Badge status={p.status} /></td>
                            <td className="num">{fmt.money(p.billed, 0)}</td>
                            <td className="muted">{fmt.date(p.linked_on)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}
            {tab === 'lines' && (
              data.line_items.length === 0
                ? <Empty icon="invoice" title="No line items entered yet">
                    Line items are what service codes and rates get built from.
                  </Empty>
                : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr>
                        <th>Line</th><th>Code</th><th>Description</th><th>Unit</th>
                        <th className="num">Price</th><th>Status</th><th>Service code</th>
                      </tr></thead>
                      <tbody>
                        {data.line_items.map((l) => (
                          <tr key={l.id}>
                            <td className="mono dim">{l.line_number ?? '—'}</td>
                            <td className="mono">{l.item_code || '—'}</td>
                            <td className="truncate" style={{ maxWidth: 260 }}>{l.description}</td>
                            <td className="dim">{l.unit_abbreviation || '—'}</td>
                            <td className="num">{l.unit_price != null
                              ? fmt.money(l.unit_price, 4) : '—'}</td>
                            <td><Badge status={l.status === 'accepted' ? 'approved'
                                              : l.status === 'rejected' ? 'rejected' : 'draft'}>
                              {fmt.title(l.status)}</Badge></td>
                            <td className="mono">{l.service_code || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
            )}
            {tab === 'documents' && (
              <div style={{ padding: 14 }}>
                <DocumentsPanel entityType="contracts" entityId={contractId}
                                kinds={['contract', 'contract_modification', 'rate_sheet',
                                        'insurance', 'other']} />
              </div>
            )}
          </Card>
        </div>
      )}
    </Drawer>
  )
}

/** Contracts entered before the document link was required. Listed rather than
    left to fail at billing time. */
function ContractRemediation() {
  const { data } = useFetch(() => api.get('/contracts/remediation'), [])
  if (!data || !data.items.length) return null
  return (
    <div style={{ padding: '13px 16px 0' }}>
      <div className="card" style={{ padding: '11px 14px', borderColor: 'var(--amber)',
                                     background: 'var(--amber-soft)' }}>
        <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
          <Icon name="alert" size={14} />
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            <b>{data.items.length} contract{data.items.length === 1 ? '' : 's'} need
            attention.</b> These predate the required signed document link and will not
            save again until one is added:{' '}
            {data.items.map((c) => c.contract_number).join(', ')}
          </div>
        </div>
      </div>
    </div>
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
          <div key={f.key} style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
            <FormField field={f} value={form[f.key]}
                       onChange={(v) => setForm({ ...form, [f.key]: v })} />
          </div>
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
    <Field label={field.label} required={field.required} hint={field.hint}>
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

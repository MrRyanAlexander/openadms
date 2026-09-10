/**
 * The pieces project setup is made of, shared by the new-project wizard and the
 * setup screen so the two can never disagree about how something is entered.
 *
 * Every picker here can create the thing it is picking. Sending someone to
 * Organization to make a disposal site and then back again was the navigating
 * around that made setup feel like a maze.
 */
import { useMemo, useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { Badge, Card, Empty, Field, Icon, Loading, Modal } from './ui'

/* ------------------------------------------------------------------ picker */
/**
 * Choose an existing record, or make a new one without leaving the flow. The
 * new-record path posts `new` to the link endpoint, which creates and links in
 * one transaction.
 */
export function LinkPicker({
  title, items, labelFor, valueKey = 'id', linkKey, selected, onSelect,
  createFields, createTitle, children, hint, busy, onSubmit, onClose,
  submitLabel = 'Add',
}) {
  const [mode, setMode] = useState('existing')
  const [fresh, setFresh] = useState({})
  const [error, setError] = useState(null)
  const available = items || []

  async function submit() {
    setError(null)
    try {
      // valueKey reads the list. linkKey is what the API calls the column, and
      // the two are not the same: a contractor is chosen by `id` and linked as
      // `contractor_id`. Sending the reading key is what refused every attempt
      // to link a record that already existed.
      await onSubmit(mode === 'new'
        ? { new: Object.fromEntries(Object.entries(fresh).filter(([, v]) => v !== '')) }
        : { [linkKey || valueKey]: selected })
    } catch (err) { setError(err.message) }
  }

  const ready = mode === 'new'
    ? (createFields || []).filter((f) => f.required).every((f) => fresh[f.key])
    : Boolean(selected)

  return (
    <Modal wide={mode === 'new'} title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ready || busy} onClick={submit}>
          {busy && <span className="spinner" />} {submitLabel}
        </button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}

      {createFields && (
        <div className="tabs" style={{ marginBottom: 14 }}>
          <button className={mode === 'existing' ? 'on' : ''}
                  onClick={() => setMode('existing')}>
            Choose existing<span className="dim"> ({available.length})</span>
          </button>
          <button className={mode === 'new' ? 'on' : ''} onClick={() => setMode('new')}>
            {createTitle || 'Create new'}
          </button>
        </div>
      )}

      <div className="stack">
        {mode === 'existing' ? (
          <>
            <Field label="Choose one" required hint={hint}>
              <select className="select" value={selected || ''}
                      onChange={(e) => onSelect(e.target.value)}>
                <option value="">Select…</option>
                {available.map((i) => (
                  <option key={i[valueKey]} value={i[valueKey]}>{labelFor(i)}</option>
                ))}
              </select>
            </Field>
            {available.length === 0 && (
              <div className="muted" style={{ fontSize: 13 }}>
                {createFields
                  ? 'Nothing left to choose. Create a new one on the other tab.'
                  : 'Everything available is already linked.'}
              </div>
            )}
          </>
        ) : (
          <div className="grid c2" style={{ gap: 12 }}>
            {createFields.map((f) => (
              <div key={f.key} style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
                <NewField field={f} value={fresh[f.key]}
                          onChange={(v) => setFresh({ ...fresh, [f.key]: v })} />
              </div>
            ))}
          </div>
        )}
        {children}
      </div>
    </Modal>
  )
}

function NewField({ field, value, onChange }) {
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
          {field.options.map((o) => (
            <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? fmt.title(o)}</option>
          ))}
        </select>
      ) : field.type === 'ref' ? (
        <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(refs.data?.items || []).map((r) => (
            <option key={r.id} value={r.id}>{r[field.labelKey || 'name']}</option>
          ))}
        </select>
      ) : (
        <input className="input"
               type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
               value={value ?? ''} placeholder={field.placeholder}
               onChange={(e) => onChange(e.target.value)} />
      )}
    </Field>
  )
}

/* -------------------------------------------------------- field definitions */
export const NEW_CONTRACTOR_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'code', label: 'Code' },
  { key: 'contractor_type', label: 'Type', type: 'select', required: true,
    options: ['hauler', 'tree_removal', 'monitoring', 'other'] },
  { key: 'primary_contact', label: 'Primary contact' },
  { key: 'contact_email', label: 'Email' },
  { key: 'contact_phone', label: 'Phone' },
  { key: 'city', label: 'City' },
  { key: 'state_code', label: 'State' },
]

export const NEW_CONTRACT_FIELDS = [
  { key: 'contract_number', label: 'Contract number', required: true },
  { key: 'title', label: 'Title', required: true },
  { key: 'client_id', label: 'Client', type: 'ref', source: '/clients', required: true },
  { key: 'contractor_id', label: 'Contractor', type: 'ref', source: '/contractors',
    required: true },
  { key: 'contract_type', label: 'Contract type', type: 'select', required: true,
    options: ['unit_price', 'time_and_materials', 'lump_sum', 'cost_plus'] },
  { key: 'status', label: 'Status', type: 'select', required: true,
    options: ['draft', 'executed', 'active', 'suspended', 'closed'] },
  { key: 'effective_from', label: 'Effective from', type: 'date', required: true },
  { key: 'effective_to', label: 'Effective to', type: 'date' },
  { key: 'not_to_exceed', label: 'Not to exceed', type: 'number' },
  { key: 'document_url', label: 'Signed document URL', required: true, wide: true,
    placeholder: 'https://…',
    hint: 'The executed contract in Box or SharePoint. Required: billing depends on it.' },
]

export const NEW_SITE_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'site_code', label: 'Site code' },
  { key: 'site_kind', label: 'Kind', type: 'select', required: true,
    options: ['DMS', 'FDS', 'TDSRS', 'TRANSFER', 'RECYCLING'] },
  { key: 'operator_id', label: 'Operator', type: 'ref', source: '/contractors' },
  { key: 'address_line1', label: 'Address' },
  { key: 'city', label: 'City' },
  { key: 'state_code', label: 'State' },
  { key: 'permit_number', label: 'Permit number' },
  { key: 'permit_expires_on', label: 'Permit expires', type: 'date' },
  { key: 'has_scale', label: 'Has a certified scale', type: 'bool' },
  { key: 'capacity_cy', label: 'Capacity (CY)', type: 'number' },
]

export const NEW_WORKER_FIELDS = [
  { key: 'first_name', label: 'First name', required: true },
  { key: 'last_name', label: 'Last name', required: true },
  { key: 'employee_id', label: 'Employee ID', hint: 'The badge their employer knows them by' },
  { key: 'monitor_id', label: 'Monitor ID', hint: 'Printed on tickets the field creates' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'employer_name', label: 'Employer',
    hint: 'A staffing firm, where they are not paid by a contractor on the project' },
]

/* ------------------------------------------------------------------- scope */
/**
 * What the client actually authorised. Nothing is assumed: the program
 * pre-selects streams and never limits them.
 */
export function ScopeEditor({ scopes, suggested, onToggle, lookups }) {
  const streams = lookups?.debris_types || []
  const enabled = new Set(scopes.filter((s) => s.is_enabled).map((s) => s.debris_type_code))
  const known = new Set(scopes.map((s) => s.debris_type_code))

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
        Enable only what the client has confirmed. A stream that is not enabled here was
        not authorised, and nothing downstream assumes otherwise. Streams can be added
        later without disturbing anything already collected.
      </div>
      <div className="grid c3" style={{ gap: 10 }}>
        {streams.map((d) => {
          const on = enabled.has(d.code)
          const hinted = !known.has(d.code) && (suggested || []).includes(d.code)
          return (
            <button key={d.code} className="card"
                    style={{ padding: '11px 13px', textAlign: 'left', cursor: 'pointer',
                             borderColor: on ? 'var(--accent)' : hinted ? 'var(--blue)' : undefined,
                             background: on ? 'var(--accent-soft)' : undefined }}
                    onClick={() => onToggle(d.code, !on)}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name={on ? 'check' : 'plus'} size={14} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 570, fontSize: 13.5 }}>{d.label}</div>
                  <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {d.code}
                    {hinted && ' · suggested by the program'}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- estimates */
const QUICK_FILL = [50, 250, 1000, 5000, 25000, 100000]

/**
 * A real number per stream, never a range. A bucket cannot answer "are we at
 * 60 percent of the hanger estimate", which is the question asked by week
 * three. The unit is fixed by the stream, so nobody is asked to choose one, and
 * skipping is allowed: a missing estimate is honest, a bucket is fake precision.
 */
export function EstimateEditor({ scopes, estimates, lookups, onSave, busy }) {
  const streams = (lookups?.debris_types || [])
  const byCode = Object.fromEntries(streams.map((d) => [d.code, d]))
  const units = Object.fromEntries((lookups?.unit_types || []).map((u) => [u.code, u]))
  const current = Object.fromEntries(estimates.map((e) => [e.debris_type_code, e]))
  const enabled = scopes.filter((s) => s.is_enabled)

  const [draft, setDraft] = useState({})
  const [confidence, setConfidence] = useState({})

  if (!enabled.length) {
    return <Empty icon="layers" title="Confirm the scope first">
      Estimates are recorded per debris stream, so there is nothing to estimate until a
      stream is enabled.
    </Empty>
  }

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
        One number per stream, in the unit that stream is counted in. Skip anything you
        do not know: a missing estimate is honest, and a guessed range cannot be measured
        against production later. Every revision is kept, so a rough number now is safe.
      </div>

      {enabled.map((s) => {
        const stream = byCode[s.debris_type_code] || { label: s.debris_type_code }
        const unit = units[stream.estimate_unit_type_code] || {}
        const existing = current[s.debris_type_code]
        const value = draft[s.debris_type_code] ?? ''
        return (
          <Card key={s.debris_type_code}>
            <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <div style={{ fontWeight: 590 }}>{stream.label}</div>
                <div className="dim" style={{ fontSize: 12, marginTop: 3 }}
                     title={unit.label}>
                  counted in {unit.abbreviation || 'units'}
                </div>
                {existing && (
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 7 }}>
                    Now: <b>{fmt.number(existing.estimated_quantity, 0)} {existing.unit_abbreviation}</b>
                    {' · '}{fmt.title(existing.confidence)}
                    {existing.revision_count > 1 && ` · ${existing.revision_count} revisions`}
                  </div>
                )}
              </div>

              <div style={{ flex: '2 1 380px' }}>
                <div className="row wrap" style={{ gap: 6, marginBottom: 8 }}>
                  {QUICK_FILL.map((n) => (
                    <button key={n} className="btn ghost sm"
                            onClick={() => setDraft({ ...draft, [s.debris_type_code]: String(n) })}>
                      {fmt.int(n)}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <input className="input" type="number" style={{ maxWidth: 170 }}
                         placeholder="Skip if unknown" value={value}
                         onChange={(e) => setDraft({ ...draft, [s.debris_type_code]: e.target.value })} />
                  <select className="select" style={{ width: 165 }}
                          value={confidence[s.debris_type_code] || 'rough'}
                          onChange={(e) => setConfidence(
                            { ...confidence, [s.debris_type_code]: e.target.value })}>
                    <option value="rough">Rough</option>
                    <option value="client_provided">Client provided</option>
                    <option value="surveyed">Surveyed</option>
                  </select>
                  <button className="btn primary sm" disabled={!value || busy}
                          onClick={() => onSave({
                            debris_type_code: s.debris_type_code,
                            estimated_quantity: Number(value),
                            confidence: confidence[s.debris_type_code] || 'rough',
                            source: (confidence[s.debris_type_code] === 'surveyed')
                              ? 'field_survey' : 'client',
                          }).then(() => setDraft({ ...draft, [s.debris_type_code]: '' }))}>
                    {existing ? 'Revise' : 'Record'}
                  </button>
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* --------------------------------------------------- contract line item review */
/**
 * The manual half of the automation, and the surface the parser will feed in a
 * later pass. Accepting a set of lines generates the service codes and their
 * opening rates in one call.
 */
export function LineItemReview({ contractId, projectId, onGenerated }) {
  const [picked, setPicked] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { toast } = useApp()
  const { data, loading, reload } = useFetch(
    () => api.get(`/contracts/${contractId}/line-items`), [contractId])

  const lines = data?.items || []
  const selectable = lines.filter((l) => l.status !== 'accepted')
  const chosen = Object.entries(picked).filter(([, v]) => v).map(([k]) => k)

  async function generate() {
    setBusy(true); setError(null)
    try {
      const made = await api.post(`/projects/${projectId}/service-codes/from-line-items`,
                                  { line_item_ids: chosen })
      toast('Service codes created',
            made.items.map((c) => c.code).join(', '))
      setPicked({})
      reload()
      onGenerated?.(made)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function reject(id) {
    await api.patch(`/line-items/${id}`, { status: 'rejected', description: undefined })
      .catch((err) => toast('Could not reject', err.message, 'err'))
    reload()
  }

  if (loading) return <Loading rows={4} />
  if (!lines.length) {
    return (
      <Empty icon="invoice" title="No line items on this contract yet">
        Line items are what service codes and rates get built from. Add them by hand or
        paste the priced schedule in on the contract screen.
      </Empty>
    )
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {error && <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                     background: 'var(--red-soft)', color: 'var(--red)' }}>{error}</div>}
      <div className="row wrap" style={{ gap: 9 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {data.counts.accepted} accepted · {data.counts.draft} awaiting a decision ·{' '}
          {data.counts.rejected} rejected
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" disabled={!selectable.length}
                onClick={() => setPicked(Object.fromEntries(
                  selectable.map((l) => [l.id, true])))}>
          Select all
        </button>
        <button className="btn primary sm" disabled={!chosen.length || busy}
                onClick={generate}>
          {busy && <span className="spinner" />}
          Accept {chosen.length || ''} and create service codes
        </button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th style={{ width: 34 }} />
            <th>Line</th><th>Code</th><th>Description</th><th>Unit</th>
            <th className="num">Price</th><th>Debris</th><th>Status</th><th />
          </tr></thead>
          <tbody>
            {lines.map((l) => {
              const done = l.status === 'accepted'
              return (
                <tr key={l.id}>
                  <td>
                    {!done && (
                      <input type="checkbox" checked={Boolean(picked[l.id])}
                             onChange={(e) => setPicked({ ...picked, [l.id]: e.target.checked })} />
                    )}
                  </td>
                  <td className="mono dim">{l.line_number ?? '—'}</td>
                  <td className="mono">{l.item_code || '—'}</td>
                  <td className="truncate" style={{ maxWidth: 300 }}>{l.description}</td>
                  <td className="dim">{l.unit_abbreviation || '—'}</td>
                  <td className="num">{l.unit_price != null ? fmt.money(l.unit_price, 4) : '—'}</td>
                  <td className="dim">{l.debris_type_code || '—'}</td>
                  <td>
                    {done ? <Badge tone="green">{l.service_code || 'Accepted'}</Badge>
                          : l.status === 'rejected' ? <Badge tone="red">Rejected</Badge>
                          : <Badge>Awaiting</Badge>}
                  </td>
                  <td style={{ width: 36, textAlign: 'right' }}>
                    {l.status === 'draft' && (
                      <button className="btn ghost icon sm" title="Reject this line"
                              onClick={() => reject(l.id)}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- permit state */
export function PermitControl({ projectId, site, onChanged }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState(false)

  async function request(from) {
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/sites/${site.project_site_id || site.id}/permit/request`,
                     { requested_from: from })
      toast('Permit requested', `${site.site_name || site.name}, asked of the ${from}`)
      onChanged?.()
    } catch (err) { toast('Could not record that', err.message, 'err') }
    finally { setBusy(false) }
  }

  async function markNotRequired() {
    setBusy(true)
    try {
      await api.patch(`/projects/${projectId}/sites/${site.project_site_id || site.id}/permit`,
                      { permit_status: 'not_required' })
      onChanged?.()
    } catch (err) { toast('Could not record that', err.message, 'err') }
    finally { setBusy(false) }
  }

  const status = site.permit_status || 'pending'
  return (
    <div className="row wrap" style={{ gap: 6 }}>
      <Badge tone={status === 'verified' ? 'green' : status === 'not_required' ? '' : 'amber'}>
        {fmt.title(status)}
      </Badge>
      {site.days_since_request != null && status === 'pending' && (
        <span className="dim" style={{ fontSize: 12 }}>
          asked of the {site.permit_requested_from} {site.days_since_request}d ago
        </span>
      )}
      {status === 'pending' && !site.permit_requested_on && (
        <>
          <button className="btn ghost sm" disabled={busy} onClick={() => request('client')}>
            Requested from client
          </button>
          <button className="btn ghost sm" disabled={busy} onClick={() => request('pm')}>
            from PM
          </button>
          <button className="btn ghost sm" disabled={busy} onClick={markNotRequired}>
            Not required
          </button>
        </>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- readiness */
export const READINESS_LABELS = {
  client: 'Client', contract: 'Contract', contractor: 'Contractor',
  disposal_site: 'Disposal site', ticket_type: 'Ticket types',
  service_code: 'Service codes', rate: 'Rates', rule: 'Rules',
  field_worker: 'Field workers',
}

/**
 * Read straight from project_readiness_summary so the wizard and the database
 * can never disagree about what is still missing.
 */
export function ReadinessPanel({ readiness }) {
  if (!readiness) return <Loading rows={3} />
  const missing = readiness.missing || []
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 7 }}>
        {Object.entries(READINESS_LABELS).map(([key, label]) => {
          const gone = missing.includes(key)
          return (
            <span key={key} className={`badge ${gone ? 'amber' : 'green'}`}>
              <Icon name={gone ? 'alert' : 'check'} size={11} /> {label}
            </span>
          )
        })}
      </div>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
        {readiness.ready_for_field
          ? 'The field can create tickets on this project.'
          : `Field work is blocked until you add: ${missing.map(
              (m) => READINESS_LABELS[m] || m).join(', ')}.`}
        {readiness.ready_for_billing
          ? ' Billing is ready to run.'
          : ' Billing needs service codes, rates and at least one rule.'}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- documents */
/**
 * The document registry, wherever the parent record lives. Add by URL, verify,
 * or record who it was requested from. The file stays in Box or SharePoint; this
 * tracks the link, the dates and the state, which is what the closeout package
 * has to account for.
 */
export function DocumentsPanel({ entityType, entityId, projectId, kinds }) {
  const { lookups, toast } = useApp()
  const [adding, setAdding] = useState(false)
  const { data, loading, reload } = useFetch(
    () => api.get('/documents', { entity_type: entityType, entity_id: entityId, limit: 100 }),
    [entityType, entityId])

  const allKinds = (lookups?.document_kinds || [])
  const offered = kinds
    ? allKinds.filter((k) => kinds.includes(k.code))
    : allKinds.filter((k) => !k.applies_to?.length || k.applies_to.includes(entityType))

  async function verify(doc) {
    try {
      await api.post(`/documents/${doc.id}/verify`, {})
      toast('Verified', doc.title)
      reload()
    } catch (err) { toast('Could not verify', err.message, 'err') }
  }

  async function request(doc, from) {
    try {
      await api.post(`/documents/${doc.id}/request`, { requested_from: from })
      toast('Recorded', `${doc.title}, asked of the ${from}`)
      reload()
    } catch (err) { toast('Could not record that', err.message, 'err') }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 640 }}>
        Links into Box or SharePoint, never files. Anything registered here is what the
        closeout package accounts for, and anything with an expiry date is watched.
      </div>

      {loading && <Loading rows={3} />}
      {data && (data.items.length === 0 ? (
        <Empty icon="invoice" title="Nothing registered yet" />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th>Kind</th><th>Title</th><th>Provider</th><th>State</th>
              <th>Expires</th><th />
            </tr></thead>
            <tbody>
              {data.items.map((d) => (
                <tr key={d.id}>
                  <td>{d.kind_label}</td>
                  <td className="truncate" style={{ maxWidth: 260 }}>
                    <a href={d.url} target="_blank" rel="noreferrer">{d.title}</a>
                  </td>
                  <td className="dim">{fmt.title(d.provider)}</td>
                  <td>
                    <Badge status={d.verification_status} />
                    {d.verification_status === 'pending' && d.days_since_request != null && (
                      <span className="dim" style={{ fontSize: 11.5, marginLeft: 6 }}>
                        asked of the {d.requested_from}, {d.days_since_request}d
                      </span>
                    )}
                  </td>
                  <td className="muted">
                    {fmt.date(d.expires_on)}
                    {d.watch_state === 'expiring' && <Badge tone="amber">Soon</Badge>}
                    {d.watch_state === 'expired' && <Badge tone="red">Expired</Badge>}
                  </td>
                  <td style={{ width: 190, textAlign: 'right' }}>
                    <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
                      {d.verification_status !== 'verified' && (
                        <button className="btn ghost sm" onClick={() => verify(d)}>Verify</button>
                      )}
                      {d.verification_status === 'pending' && !d.requested_on && (
                        <button className="btn ghost sm" onClick={() => request(d, 'client')}>
                          Requested
                        </button>
                      )}
                      <button className="btn ghost icon sm" title="Remove"
                              onClick={async () => {
                                await api.del(`/documents/${d.id}`)
                                reload()
                              }}>
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="row">
        <div className="spacer" />
        <button className="btn primary sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add document link
        </button>
      </div>

      {adding && (
        <LinkPicker title="Register a document" items={[]} labelFor={() => ''}
                    selected="" onSelect={() => {}} submitLabel="Register"
                    createTitle="By link"
                    createFields={[
                      { key: 'kind_code', label: 'Kind', type: 'select', required: true,
                        options: offered.map((k) => ({ value: k.code, label: k.label })) },
                      { key: 'title', label: 'Title', required: true },
                      { key: 'url', label: 'Link', required: true, wide: true,
                        placeholder: 'https://…',
                        hint: 'The full https link to the file in Box or SharePoint' },
                      { key: 'provider', label: 'Where it lives', type: 'select',
                        options: ['box', 'sharepoint', 'gdrive', 'dropbox', 'other'] },
                      { key: 'effective_from', label: 'Effective from', type: 'date' },
                      { key: 'expires_on', label: 'Expires on', type: 'date' },
                    ]}
                    onClose={() => setAdding(false)}
                    onSubmit={async (body) => {
                      await api.post('/documents', {
                        ...body.new, entity_type: entityType, entity_id: entityId,
                        ...(projectId ? { project_id: projectId } : {}),
                      })
                      setAdding(false)
                      reload()
                    }} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ alerts */
const ALERT_TONE = { 3: 'red', 2: 'amber', 1: '', 0: '' }

/**
 * Nagging, never blocking. Every pending permit, expiring document and expiring
 * truck certification on this project, in the order they deserve attention.
 */
export function AlertsPanel({ projectId, limit }) {
  const { data, loading } = useFetch(
    () => api.get(`/projects/${projectId}/alerts`), [projectId], { skip: !projectId })

  if (loading) return <Loading rows={3} />
  if (!data) return null
  if (!data.items.length) {
    return (
      <div className="muted" style={{ fontSize: 13, padding: '6px 0' }}>
        Nothing outstanding. No permit, document or certification needs chasing.
      </div>
    )
  }

  const shown = limit ? data.items.slice(0, limit) : data.items
  return (
    <div className="stack" style={{ gap: 8 }}>
      {shown.map((a, i) => (
        <div key={`${a.entity_id}-${i}`} className="row"
             style={{ gap: 10, alignItems: 'flex-start' }}>
          <Badge tone={ALERT_TONE[a.severity]}>{fmt.title(a.state)}</Badge>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 540 }} className="truncate">{a.title}</div>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{a.detail}</div>
          </div>
        </div>
      ))}
      {limit && data.items.length > limit && (
        <div className="dim" style={{ fontSize: 12 }}>
          and {data.items.length - limit} more
        </div>
      )}
      <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
        None of this stops field work. It is here so nobody has to dig through email to
        find out what is outstanding.
      </div>
    </div>
  )
}

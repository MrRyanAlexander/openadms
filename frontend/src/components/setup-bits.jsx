/**
 * The pieces project setup is made of, shared by the new-project wizard and the
 * setup screen so the two can never disagree about how something is entered.
 *
 * Every picker here can create the thing it is picking. Sending someone to
 * Organization to make a disposal site and then back again was the navigating
 * around that made setup feel like a maze.
 */
import { useEffect, useMemo, useState } from 'react'
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
               type={field.type === 'number' ? 'number'
                     : field.type === 'date' ? 'date'
                     : field.type === 'password' ? 'password' : 'text'}
               autoComplete={field.type === 'password' ? 'new-password' : undefined}
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

// A5: "from the assign worker option inside of projects we dont have the same
// form or options and are not able to fully create a new user the right way".
// The same fields the Workers screen asks for, so a worker created here is a
// whole worker rather than a stub somebody has to go back and finish.
export const NEW_WORKER_FIELDS = [
  { key: 'first_name', label: 'First name', required: true },
  { key: 'middle_name', label: 'Middle name' },
  { key: 'last_name', label: 'Last name', required: true },
  { key: 'global_role', label: 'Role', type: 'select', required: true,
    hint: 'What they can do across the instance. The project role is set below.',
    options: [
      { value: 'monitor', label: 'Monitor' },
      { value: 'manager', label: 'Manager' },
      { value: 'analyst', label: 'Analyst' },
      { value: 'admin', label: 'Admin' },
    ] },
  { key: 'employee_id', label: 'Employee ID', hint: 'The badge their employer knows them by' },
  { key: 'monitor_id', label: 'Monitor ID',
    hint: 'Printed on tickets the field creates. Left empty, one is issued.' },
  { key: 'employer_contractor_id', label: 'Employer on the project', type: 'ref',
    source: '/contractors', labelKey: 'name',
    hint: 'The contractor paying them, where one on this project does' },
  { key: 'employer_name', label: 'Employer name',
    hint: 'A staffing firm, where they are not paid by a contractor on the project' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'username', label: 'Username',
    hint: 'Left empty, one is built from their name' },
  { key: 'password', label: 'Initial password', type: 'password',
    hint: 'At least 8 characters. They are asked to change it at first sign-in.' },
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
    () => api.get(`/contracts/${contractId}/line-items`, { project_id: projectId }),
    [contractId, projectId])

  const lines = data?.items || []
  // Accepted means accepted on THIS project. Everything else is on the table,
  // a line this project previously rejected included, because a rejection is
  // this project's call and this project can take it back.
  const selectable = lines.filter((l) => l.status !== 'accepted')
  const chosen = Object.entries(picked).filter(([, v]) => v).map(([k]) => k)
  const allPicked = selectable.length > 0 && chosen.length === selectable.length

  async function generate() {
    setBusy(true); setError(null)
    try {
      const made = await api.post(`/projects/${projectId}/service-codes/from-line-items`,
                                  { line_item_ids: chosen })
      const names = made.items.map((c) => c.code)
      if (names.length) {
        toast(`${names.length} service code${names.length === 1 ? '' : 's'} created`,
              names.join(', '))
      }
      if (made.skipped?.length) {
        toast('Already billing on this project',
              made.skipped.map((sk) => sk.service_code).filter(Boolean).join(', '),
              'warn')
      }
      setPicked({})
      reload()
      onGenerated?.(made)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function decide(id, status) {
    setError(null)
    try {
      await api.post(`/projects/${projectId}/line-items/${id}/decision`, { status })
    } catch (err) {
      toast('Could not record that', err.message, 'err')
    }
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
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 620 }}>
        This is what <strong>this project</strong> bills under the contract. The same
        contract on another project is decided separately, so accepting a line here
        changes nothing anywhere else.
      </div>
      <div className="row wrap" style={{ gap: 9 }}>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {data.counts.accepted} accepted · {data.counts.draft} awaiting a decision ·{' '}
          {data.counts.rejected} rejected
        </div>
        <div className="spacer" />
        <button className="btn ghost sm" disabled={!selectable.length}
                onClick={() => setPicked(allPicked ? {} : Object.fromEntries(
                  selectable.map((l) => [l.id, true])))}>
          {allPicked ? 'Clear selection' : `Select all ${selectable.length || ''}`}
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
                  <td className="num">{l.unit_price != null ? fmt.rate(l.unit_price) : '—'}</td>
                  <td className="dim">{l.debris_type_code || '—'}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      {done ? <Badge tone="green">{l.service_code || 'Accepted'}</Badge>
                            : l.status === 'rejected' ? <Badge tone="red">Rejected</Badge>
                            : <Badge>Awaiting</Badge>}
                      {!done && l.code_used_elsewhere && (
                        <span className="dim" style={{ fontSize: 11 }}
                              title={`Billed as ${l.code_used_elsewhere} on `
                                     + `${l.accepted_on_other_projects} other project`
                                     + `${l.accepted_on_other_projects === 1 ? '' : 's'}`}>
                          {l.code_used_elsewhere} elsewhere
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ width: 36, textAlign: 'right' }}>
                    {l.status === 'draft' && (
                      <button className="btn ghost icon sm"
                              title="Not billed on this project"
                              onClick={() => decide(l.id, 'rejected')}>
                        <Icon name="x" size={12} />
                      </button>
                    )}
                    {l.status === 'rejected' && (
                      <button className="btn ghost sm"
                              title="Put this line back on the table for this project"
                              onClick={() => decide(l.id, 'draft')}>
                        Undo
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
  rule_coverage: 'Rule coverage', code_coverage: 'Billable codes',
  field_worker: 'Field workers',
}

// Which of the checks above stop the field from working. The rest stop an
// invoice from being produced, which is a different conversation with a
// different person.
const FIELD_KEYS = ['client', 'contract', 'contractor', 'disposal_site',
                    'ticket_type', 'rule', 'rule_coverage', 'field_worker']

/**
 * Read straight from project_readiness_summary so the wizard and the database
 * can never disagree about what is still missing.
 *
 * Rule coverage is the check that used to sit here as a yellow badge next to a
 * green "ready" state. A project with no rule covering an enabled ticket type
 * cannot produce a transaction on that type, so the badge now belongs to the
 * gate rather than beside it, and it names the type rather than saying "rules".
 */
export function ReadinessPanel({ readiness }) {
  if (!readiness) return <Loading rows={3} />
  const missing = readiness.missing || []
  const unruledTypes = readiness.unruled_ticket_types || []
  const unruledCodes = readiness.unruled_service_codes || []
  const fieldMissing = missing.filter((m) => FIELD_KEYS.includes(m))

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

      {unruledTypes.length > 0 && (
        <div className="card" style={{ padding: '11px 14px', borderColor: 'var(--amber)',
                                       background: 'var(--amber-soft)' }}>
          <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
            <Icon name="alert" size={15} style={{ marginTop: 2, color: 'var(--amber)' }} />
            <div style={{ fontSize: 13, lineHeight: 1.65 }}>
              <b>No rule covers {unruledTypes.join(', ')}.</b> A ticket of{' '}
              {unruledTypes.length === 1 ? 'that type' : 'those types'} could be
              created and monitored and would never reach an invoice, so the
              field stays blocked until{' '}
              {unruledTypes.length === 1 ? 'it has' : 'each has'} at least one rule.
            </div>
          </div>
        </div>
      )}

      {unruledCodes.length > 0 && (
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          No rule references {unruledCodes.join(', ')}. Those codes carry a rate
          and can still never be billed, which is usually a rule that was never
          written rather than a code that was not wanted.
        </div>
      )}

      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
        {readiness.ready_for_field
          ? 'The field can create tickets on this project.'
          : `Field work is blocked until you add: ${fieldMissing.map(
              (m) => READINESS_LABELS[m] || m).join(', ')}.`}
        {readiness.ready_for_billing
          ? ' Billing is ready to run.'
          : ' Billing needs service codes, rates, and a rule on every code.'}
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
        <Empty icon="invoice" title="Nothing registered yet">
          What belongs here is every piece of paper the closeout package has to account
          for: the executed contract and its amendments, the disposal site permits, load
          ticket samples, insurance and licences, and the client's notice to proceed.
          Each one is a link and a date, watched for expiry, so nobody is reading email
          to find out what is outstanding.
        </Empty>
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

/* ------------------------------------------------------ rules from contract */
/**
 * The confirm half of the rule proposal.
 *
 * A line item already knows almost everything a rule needs: the service code
 * and contract come off its own bridge, the ticket type follows from the debris
 * stream or the unit, and the conditions follow from the contractor and that
 * stream. So the derivable part is derived and shown, and the part that is not
 * derivable is asked for here rather than guessed at.
 *
 * Nothing is written until the button at the bottom is pressed. A banded line
 * cannot be selected until its boundaries are entered, and a pass-through line
 * cannot be selected at all, because how one is billed varies by contract and a
 * rule that looks right and bills wrong is the expensive mistake in this domain.
 */
export function RuleProposalReview({ projectId, serviceCodeIds, onWritten }) {
  const { toast } = useApp()
  const [picked, setPicked] = useState({})
  const [edits, setEdits] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const { data, loading, error: loadError, reload } = useFetch(
    () => api.post(`/projects/${projectId}/rules/from-line-items`,
                   serviceCodeIds?.length ? { service_code_ids: serviceCodeIds } : {}),
    [projectId, (serviceCodeIds || []).join(',')])

  const proposals = data?.proposals || []

  function edit(id, patch) {
    setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), ...patch } }))
  }
  function valueOf(p, key) {
    const e = edits[p.service_code_id] || {}
    return e[key] !== undefined ? e[key] : p[key]
  }

  // What still stops a row from being written, read fresh every render so the
  // answer follows what has been typed rather than what was proposed.
  function blocking(p) {
    if (p.blocked) return p.blocked
    if (!valueOf(p, 'ticket_type_id')) return 'Pick the ticket type this bills on.'
    if (!valueOf(p, 'contract_id')) return 'This needs a contract.'
    if (p.kind === 'tiered') {
      const bands = valueOf(p, 'bands') || []
      const usable = bands.filter((b) => b.amount !== '' && b.amount != null)
      if (!usable.length) return 'Enter the bands off the rate sheet.'
      if (!valueOf(p, 'tier_source')) return 'Say which measurement picks the band.'
    }
    return null
  }

  const chosen = proposals.filter((p) => picked[p.service_code_id] && !blocking(p))

  async function write() {
    setBusy(true); setError(null)
    try {
      const body = {
        dry_run: false,
        proposals: chosen.map((p) => {
          const out = {
            service_code_id: p.service_code_id,
            ticket_type_id: valueOf(p, 'ticket_type_id'),
            contract_id: valueOf(p, 'contract_id'),
            name: valueOf(p, 'name'),
            priority: Number(valueOf(p, 'priority')) || 100,
            statements: (p.statements || []).map((s) => ({
              operand_code: s.operand_code, operator_code: s.operator_code,
              value: s.value, value_label: s.value_label,
            })),
          }
          if (p.kind === 'tiered') {
            out.tiers = {
              tier_source: valueOf(p, 'tier_source'),
              bands: (valueOf(p, 'bands') || [])
                .filter((b) => b.amount !== '' && b.amount != null)
                .map((b) => ({
                  label: b.label || null,
                  from_value: Number(b.from_value) || 0,
                  to_value: b.to_value === '' || b.to_value == null
                    ? null : Number(b.to_value),
                  amount: Number(b.amount),
                })),
            }
          }
          return out
        }),
      }
      const made = await api.post(`/projects/${projectId}/rules/from-line-items`, body)
      toast('Rules written', made.summary)
      setPicked({}); setEdits({})
      reload()
      onWritten?.(made)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  if (loading) return <Loading rows={4} />
  // A proposal that could not be asked for at all is not the same as a project
  // with nothing left to rule on, and saying so is the difference between the
  // user fixing the ticket types and the user staring at the wrong sentence.
  if (loadError) {
    return (
      <Empty icon="rules" title="Nothing to propose yet">
        {loadError.message}
      </Empty>
    )
  }
  if (!proposals.length) {
    return (
      <Empty icon="rules" title="Every code already has a rule">
        {data?.skipped?.length
          ? `${data.skipped.length} code${data.skipped.length === 1 ? ' is' : 's are'} already referenced by a rule. Nothing on this project is left unbilled.`
          : 'Accept some contract line items first and the rules are proposed from them.'}
      </Empty>
    )
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {error && <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                     background: 'var(--red-soft)', color: 'var(--red)' }}>{error}</div>}

      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 700 }}>
        {data.summary} Nothing here is saved until you write it.
      </div>

      <div className="stack" style={{ gap: 9 }}>
        {proposals.map((p) => {
          const stop = blocking(p)
          const on = Boolean(picked[p.service_code_id])
          return (
            <div key={p.service_code_id} className="card"
                 style={{ padding: '12px 14px',
                          borderColor: p.blocked ? 'var(--amber)'
                                     : on ? 'var(--accent)' : undefined }}>
              <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={on} disabled={Boolean(p.blocked)}
                       style={{ marginTop: 4 }}
                       onChange={(e) => setPicked(
                         { ...picked, [p.service_code_id]: e.target.checked })} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row wrap" style={{ gap: 7 }}>
                    <span className="mono" style={{ fontWeight: 580 }}>{p.service_code}</span>
                    {p.kind === 'tiered' && <Badge tone="blue">Priced in bands</Badge>}
                    {p.kind === 'pass_through' && <Badge tone="amber">Pass-through cost</Badge>}
                    {p.line_number != null && (
                      <span className="dim" style={{ fontSize: 12 }}>
                        contract line {p.line_number}
                      </span>
                    )}
                  </div>
                  <div className="dim truncate" style={{ fontSize: 12.5, marginTop: 2 }}>
                    {p.description}
                    {p.unit_price != null && ` · ${fmt.rate(p.unit_price)}`}
                    {p.unit_abbrev && ` per ${p.unit_abbrev}`}
                  </div>

                  {p.blocked ? (
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 8,
                                  color: 'var(--amber)' }}>
                      {p.blocked}
                    </div>
                  ) : (
                    <>
                      <div className="grid c2" style={{ gap: 10, marginTop: 10 }}>
                        <Field label="Rule name">
                          <input className="input" value={valueOf(p, 'name')}
                                 onChange={(e) => edit(p.service_code_id,
                                                       { name: e.target.value })} />
                        </Field>
                        <Field label="Bills on"
                               hint={p.ticket_type_source
                                 ? `Derived from ${p.ticket_type_source}`
                                 : 'Nothing on the line says which'}>
                          <select className="select" value={valueOf(p, 'ticket_type_id') || ''}
                                  onChange={(e) => edit(p.service_code_id,
                                                        { ticket_type_id: e.target.value })}>
                            <option value="">Choose a ticket type</option>
                            {(p.ticket_type_options || []).map((t) => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                          </select>
                        </Field>
                      </div>

                      <div className="muted" style={{ fontSize: 12.5, marginTop: 8,
                                                      lineHeight: 1.7 }}>
                        When{' '}
                        {(p.statements || []).length
                          ? p.statements.map((s, i) => (
                              <span key={s.operand_code}>
                                {i > 0 && ' and '}
                                <b style={{ color: 'var(--text)' }}>{s.operand_label}</b>
                                {' '}{s.operator_symbol}{' '}
                                <b style={{ color: 'var(--text)' }}>{s.value_label}</b>
                              </span>
                            ))
                          : <b style={{ color: 'var(--text)' }}>any ticket of that type</b>}
                        , bill <b style={{ color: 'var(--text)' }}>{p.service_code}</b>
                        {p.contract_number && ` under ${p.contract_number}`}.
                      </div>

                      {p.kind === 'tiered' && (
                        <TierBands proposal={p}
                                   source={valueOf(p, 'tier_source')
                                           || p.tier_source_suggestion || ''}
                                   bands={valueOf(p, 'bands')}
                                   onChange={(patch) => edit(p.service_code_id, patch)} />
                      )}

                      {(p.needs || []).map((n) => (
                        <div key={n.field} className="dim"
                             style={{ fontSize: 12, marginTop: 6 }}>
                          <Icon name="alert" size={11} /> {n.why}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {(data.skipped || []).length > 0 && (
        <div className="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
          Not proposed, because a rule already references them:{' '}
          {data.skipped.map((s) => s.service_code).join(', ')}.
        </div>
      )}

      <div className="row">
        <div className="spacer" />
        <button className="btn primary" disabled={!chosen.length || busy} onClick={write}>
          {busy && <span className="spinner" />}
          Write {chosen.length || ''} rule{chosen.length === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  )
}

/**
 * The bands, off the rate sheet rather than out of the line's wording. from is
 * inclusive and to is exclusive, which is how rate_tiers stores them, so bands
 * copied straight off a contract meet at the boundary instead of across it.
 */
const TIER_SOURCES = [
  { value: 'haul_miles', label: 'Haul distance in miles' },
  { value: 'stump_diameter_inches', label: 'Stump diameter in inches' },
  { value: 'net_tons', label: 'Net tons' },
  { value: 'billable_cubic_yards', label: 'Billable cubic yards' },
  { value: 'unit_count', label: 'Unit count' },
]

function TierBands({ proposal, source, bands, onChange }) {
  const rows = bands || [
    { label: '', from_value: 0, to_value: '', amount: proposal.unit_price ?? '' },
  ]

  function setRow(i, patch) {
    onChange({ bands: rows.map((r, n) => (n === i ? { ...r, ...patch } : r)) })
  }

  return (
    <div className="card" style={{ padding: '10px 12px', marginTop: 10,
                                   background: 'var(--surface-2)' }}>
      <div className="row" style={{ gap: 10, marginBottom: 8 }}>
        <Field label="Which measurement picks the band">
          <select className="select" value={source}
                  onChange={(e) => onChange({ tier_source: e.target.value })}>
            <option value="">Choose</option>
            {TIER_SOURCES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <table className="data">
        <thead><tr>
          <th>Band</th><th className="num">From</th><th className="num">To</th>
          <th className="num">Rate</th><th />
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>
                <input className="input" value={r.label || ''} placeholder="0 to 10 miles"
                       onChange={(e) => setRow(i, { label: e.target.value })} />
              </td>
              <td className="num">
                <input className="input num" type="number" value={r.from_value ?? ''}
                       onChange={(e) => setRow(i, { from_value: e.target.value })} />
              </td>
              <td className="num">
                <input className="input num" type="number" value={r.to_value ?? ''}
                       placeholder="and over"
                       onChange={(e) => setRow(i, { to_value: e.target.value })} />
              </td>
              <td className="num">
                <input className="input num" type="number" step="0.0001"
                       value={r.amount ?? ''}
                       onChange={(e) => setRow(i, { amount: e.target.value })} />
              </td>
              <td style={{ width: 34, textAlign: 'right' }}>
                {rows.length > 1 && (
                  <button className="btn ghost icon sm" title="Remove this band"
                          onClick={() => onChange(
                            { bands: rows.filter((_, n) => n !== i) })}>
                    <Icon name="x" size={12} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn ghost sm" onClick={() => onChange({
          bands: [...rows, {
            label: '',
            from_value: rows[rows.length - 1]?.to_value || 0,
            to_value: '', amount: '',
          }],
        })}>
          <Icon name="plus" size={12} /> Add a band
        </button>
        <div className="spacer" />
        <span className="dim" style={{ fontSize: 11.5 }}>
          From is inclusive, To is exclusive. Leave To empty for the top band.
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------- contract line items ---- */
const BLANK_LINE = {
  line_number: '', item_code: '', description: '', unit_type_code: '',
  unit_price: '', debris_type_code: '', source_page: '',
}

/**
 * The priced schedule itself, editable.
 *
 * This is the half the setup wizard did not have. A contract typed in by hand
 * arrived with no lines and no way to add any: the only manual entry path was
 * on the intake screen, behind registering a PDF first, for the project already
 * in context rather than the one being created. So a contract created in the
 * wizard was a dead end.
 *
 * What lives here is the contract, not a project's opinion of it. Accepting
 * lines onto a project is a separate decision on a separate screen, because
 * the same schedule goes out to client after client and 0027 is the reasoning.
 */
export function ContractLineItems({ contractId, projectId, onChanged }) {
  const { lookups, toast } = useApp()
  const [pasting, setPasting] = useState(false)
  const [adding, setAdding] = useState(BLANK_LINE)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const { data, loading, reload } = useFetch(
    () => api.get(`/contracts/${contractId}/line-items`), [contractId])

  const lines = data?.items || []

  function changed() { reload(); onChanged?.() }

  async function add() {
    setBusy(true); setError(null)
    try {
      await api.post(`/contracts/${contractId}/line-items`, clean(adding))
      setAdding(BLANK_LINE)
      changed()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function remove(line) {
    try {
      await api.del(`/line-items/${line.id}`)
      changed()
    } catch (err) { toast('Could not remove that line', err.message, 'err') }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {error && <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                     background: 'var(--red-soft)', color: 'var(--red)' }}>{error}</div>}

      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 660 }}>
        The priced schedule off the contract, as the contract has it. Type the lines,
        or paste a block straight out of the rate sheet. Which of them{' '}
        <strong>this project</strong> bills is a separate decision, made on the service
        codes step, because the same contract goes out to client after client.
      </div>

      {loading && <Loading rows={4} />}

      <div className="table-wrap">
        <table className="data">
          <thead><tr>
            <th style={{ width: 62 }}>Line</th>
            <th style={{ width: 96 }}>Code</th>
            <th>Description</th>
            <th style={{ width: 118 }}>Unit</th>
            <th style={{ width: 104 }}>Price</th>
            <th style={{ width: 108 }}>Debris</th>
            <th style={{ width: 40 }} />
          </tr></thead>
          <tbody>
            {lines.map((l) => (
              <LineItemRow key={l.id} line={l} lookups={lookups}
                           onSaved={changed} onRemove={() => remove(l)} />
            ))}
            <tr style={{ background: 'var(--surface-2)' }}>
              <LineCells row={adding} lookups={lookups}
                         onChange={(patch) => setAdding({ ...adding, ...patch })} />
              <td style={{ textAlign: 'right' }}>
                <button className="btn primary icon sm" title="Add this line"
                        disabled={!adding.description.trim() || busy} onClick={add}>
                  <Icon name="plus" size={13} />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="row">
        <div className="dim" style={{ fontSize: 12 }}>
          {lines.length} line{lines.length === 1 ? '' : 's'} on this contract
          {lines.length === 0 && '. Nothing can be billed under it until it has at least one, '
            + 'or until a service code is entered by hand.'}
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setPasting(true)}>
          <Icon name="plus" size={13} /> Paste a priced schedule
        </button>
      </div>

      {pasting && (
        <PasteSchedule contractId={contractId} onClose={() => setPasting(false)}
                       onWritten={() => { setPasting(false); changed() }} />
      )}
    </div>
  )
}

function clean(row) {
  const out = { description: (row.description || '').trim() }
  if (row.line_number !== '') out.line_number = Number(row.line_number)
  if (row.item_code) out.item_code = row.item_code
  if (row.unit_type_code) out.unit_type_code = row.unit_type_code
  if (row.unit_price !== '') out.unit_price = Number(row.unit_price)
  if (row.debris_type_code) out.debris_type_code = row.debris_type_code
  if (row.source_page !== '') out.source_page = Number(row.source_page)
  return out
}

/** One row, edited in place. Saves on blur and only when something changed, so
 *  tabbing across a row somebody was only reading never writes anything. */
function LineItemRow({ line, lookups, onSaved, onRemove }) {
  const { toast } = useApp()
  const [draft, setDraft] = useState(line)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { setDraft(line); setDirty(false) }, [line.id, line.updated_at])

  // Focus moving between cells of the same row is still someone typing one
  // line, so the write waits until they have left the row altogether.
  async function commit(event) {
    if (!dirty) return
    if (event.currentTarget.contains(event.relatedTarget)) return
    setDirty(false)
    try {
      await api.patch(`/line-items/${line.id}`, clean(draft))
      onSaved()
    } catch (err) {
      toast('Could not save that line', err.message, 'err')
      setDraft(line)
    }
  }

  return (
    <tr onBlur={commit}>
      <LineCells row={draft} lookups={lookups}
                 onChange={(patch) => { setDraft({ ...draft, ...patch }); setDirty(true) }} />
      <td style={{ textAlign: 'right' }}>
        <button className="btn ghost icon sm" title="Remove this line" onClick={onRemove}>
          <Icon name="x" size={12} />
        </button>
      </td>
    </tr>
  )
}

/** The cells themselves, shared by an existing row and the row being added, so
 *  the two can never offer different fields. */
function LineCells({ row, lookups, onChange }) {
  const val = (k) => (row[k] === null || row[k] === undefined ? '' : row[k])
  return (
    <>
      <td style={{ padding: 3 }}>
        <input className="input" value={val('line_number')} placeholder="1"
               onChange={(e) => onChange({ line_number: e.target.value })} />
      </td>
      <td style={{ padding: 3 }}>
        <input className="input mono" value={val('item_code')} placeholder="2.02"
               onChange={(e) => onChange({ item_code: e.target.value })} />
      </td>
      <td style={{ padding: 3 }}>
        <input className="input" value={val('description')}
               placeholder="What the contract calls this work"
               onChange={(e) => onChange({ description: e.target.value })} />
      </td>
      <td style={{ padding: 3 }}>
        <select className="select" value={val('unit_type_code')}
                onChange={(e) => onChange({ unit_type_code: e.target.value })}>
          <option value="">—</option>
          {(lookups?.unit_types || []).map((u) => (
            <option key={u.code} value={u.code}>{u.abbreviation}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: 3 }}>
        <input className="input num" type="number" step="0.0001" value={val('unit_price')}
               onChange={(e) => onChange({ unit_price: e.target.value })} />
      </td>
      <td style={{ padding: 3 }}>
        <select className="select" value={val('debris_type_code')}
                onChange={(e) => onChange({ debris_type_code: e.target.value })}>
          <option value="">—</option>
          {(lookups?.debris_types || []).map((d) => (
            <option key={d.code} value={d.code}>{d.code}</option>
          ))}
        </select>
      </td>
    </>
  )
}

/**
 * Paste, then read what it would do, then write it. The dry run is not a
 * formality: a rate sheet pasted out of a PDF arrives with merged columns and
 * stray headers often enough that writing first and apologising later would
 * put wrong money in the system.
 */
function PasteSchedule({ contractId, onClose, onWritten }) {
  const { toast } = useApp()
  const [text, setText] = useState('')
  const [plan, setPlan] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function preview() {
    setBusy(true); setError(null)
    try {
      setPlan(await api.post(`/contracts/${contractId}/line-items/import`,
                             { text, dry_run: true }))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  async function write() {
    setBusy(true); setError(null)
    try {
      const done = await api.post(`/contracts/${contractId}/line-items/import`,
                                  { text, dry_run: false })
      toast('Schedule imported', `${done.written} line(s) written`)
      onWritten()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const usable = plan ? plan.rows.filter((r) => r.action !== 'skip').length : 0

  return (
    <Modal wide title="Paste a priced schedule" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        {plan ? (
          <button className="btn primary" disabled={!usable || busy} onClick={write}>
            {busy && <span className="spinner" />} Write {usable || ''} line{usable === 1 ? '' : 's'}
          </button>
        ) : (
          <button className="btn primary" disabled={!text.trim() || busy} onClick={preview}>
            {busy && <span className="spinner" />} Read it back to me
          </button>
        )}
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}

      <div className="stack" style={{ gap: 12 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          A block copied out of the contract spreadsheet works, and so does one line item
          per line. Nothing is written until you have read back what it found.
        </div>

        <textarea className="textarea mono" rows={8} value={text} autoFocus
                  placeholder={'Line\tItem Code\tDescription\tUnit\tUnit Price\tDebris'}
                  onChange={(e) => { setText(e.target.value); setPlan(null) }} />

        {plan && (
          <>
            <div className="muted" style={{ fontSize: 12.5 }}>{plan.summary}</div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Row</th><th>Action</th><th>Line</th><th>Code</th>
                  <th>Description</th><th>Unit</th><th className="num">Price</th>
                  <th>Debris</th>
                </tr></thead>
                <tbody>
                  {plan.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="dim">{r.row}</td>
                      <td>
                        {r.action === 'create' && <Badge tone="green">Add</Badge>}
                        {r.action === 'update' && <Badge tone="blue">Update</Badge>}
                        {r.action === 'skip' && (
                          <Badge tone="amber" title={r.problems.join('; ')}>Skip</Badge>
                        )}
                      </td>
                      <td className="mono dim">{r.values.line_number ?? '—'}</td>
                      <td className="mono">{r.values.item_code || '—'}</td>
                      <td className="truncate" style={{ maxWidth: 260 }}>
                        {r.values.description || (
                          <span className="dim">{r.problems.join('; ')}</span>
                        )}
                      </td>
                      <td className="dim">{r.values.unit_type_code || '—'}</td>
                      <td className="num">
                        {r.values.unit_price != null ? fmt.rate(r.values.unit_price) : '—'}
                      </td>
                      <td className="dim">{r.values.debris_type_code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(plan.unmapped_columns || []).length > 0 && (
              <div className="dim" style={{ fontSize: 12 }}>
                Columns nothing was read from: {plan.unmapped_columns.join(', ')}.
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------- service codes ---- */
/**
 * A service code, entered directly.
 *
 * The code, its rate and its contractor are one thought and are asked for
 * together. Generating them from an accepted contract line is a shortcut for
 * when the schedule is already typed in, not the only way in: a project whose
 * contract arrived as a scan, or whose rates were agreed by email, still has
 * to be able to bill.
 */
export function ServiceCodeForm({ projectId, contractors, onClose, onSaved }) {
  const { lookups, toast } = useApp()
  const [form, setForm] = useState({
    code: '', name: '', contractor_id: contractors.length === 1
      ? contractors[0].contractor_id : '',
    rate_amount: '', rate_unit_type: '', fema_category: '', description: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      const made = await api.post(`/projects/${projectId}/service-codes`, {
        code: form.code.trim(), name: form.name.trim(),
        contractor_id: form.contractor_id,
        ...(form.description ? { description: form.description } : {}),
        ...(form.fema_category ? { fema_category: form.fema_category } : {}),
        ...(form.rate_amount !== '' && form.rate_unit_type
          ? { rate_amount: Number(form.rate_amount), rate_unit_type: form.rate_unit_type }
          : {}),
      })
      toast('Service code created', `${made.code} — ${made.name}`)
      onSaved(made)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const ready = form.code.trim() && form.name.trim().length > 1 && form.contractor_id

  return (
    <Modal wide title="Add a service code" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ready || busy} onClick={save}>
          {busy && <span className="spinner" />} Create code
        </button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}

      <div className="stack" style={{ gap: 12 }}>
        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Code" required hint="Short, and printed on every transaction">
            <input className="input mono" value={form.code} autoFocus
                   placeholder="ROW-VEG"
                   onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Name" required>
            <input className="input" value={form.name}
                   placeholder="Collection and hauling of vegetative debris"
                   onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Contractor" required
                 hint="Who gets paid under this code. Has to be on this project.">
            <select className="select" value={form.contractor_id}
                    onChange={(e) => set({ contractor_id: e.target.value })}>
              <option value="">Choose…</option>
              {contractors.map((c) => (
                <option key={c.contractor_id} value={c.contractor_id}>
                  {c.name} · {fmt.title(c.role_on_project)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="FEMA category" hint="Usually A for debris removal">
            <input className="input" value={form.fema_category} placeholder="A"
                   onChange={(e) => set({ fema_category: e.target.value.toUpperCase() })} />
          </Field>
        </div>

        <div className="card" style={{ padding: '12px 14px', background: 'var(--surface-2)' }}>
          <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                        letterSpacing: '.06em', marginBottom: 10 }}>
            Opening rate
          </div>
          <div className="grid c2" style={{ gap: 12 }}>
            <Field label="Amount" hint="Leave both empty and add the rate later">
              <input className="input num" type="number" step="0.0001"
                     value={form.rate_amount} placeholder="9.45"
                     onChange={(e) => set({ rate_amount: e.target.value })} />
            </Field>
            <Field label="Per">
              <select className="select" value={form.rate_unit_type}
                      onChange={(e) => set({ rate_unit_type: e.target.value })}>
                <option value="">Choose…</option>
                {(lookups?.unit_types || []).map((u) => (
                  <option key={u.code} value={u.code}>{u.label} ({u.abbreviation})</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="dim" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
            A code with no rate cannot bill. Rules can still reference it, and the
            readiness check will keep saying so until a rate is in effect.
          </div>
        </div>

        <Field label="Description">
          <input className="input" value={form.description}
                 placeholder="What this covers, in the words the reviewer will read later"
                 onChange={(e) => set({ description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * A rate change, written as a new effective-dated row rather than an edit.
 *
 * Overwriting the amount would silently restate money that was already
 * computed under the old one. Every transaction names the rate it used, so the
 * old row has to stay exactly where it is.
 */
export function RateForm({ serviceCode, onClose, onSaved }) {
  const { lookups, toast } = useApp()
  const [form, setForm] = useState({
    amount: serviceCode.current_rate ?? '',
    unit_type: serviceCode.current_unit_type || '',
    effective_from: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      await api.post(`/service-codes/${serviceCode.id}/rates`, {
        amount: Number(form.amount), unit_type: form.unit_type,
        ...(form.effective_from ? { effective_from: form.effective_from } : {}),
      })
      toast('Rate recorded', `${serviceCode.code} at ${fmt.rate(Number(form.amount))}`)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const history = serviceCode.rates || []

  return (
    <Modal title={`Rate · ${serviceCode.code}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}
                disabled={form.amount === '' || !form.unit_type || busy}>
          {busy && <span className="spinner" />} Record rate
        </button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}

      <div className="stack" style={{ gap: 12 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          A rate is never edited. This writes a new one and closes the one in effect the
          day before it starts, so every transaction already computed still names the
          rate it was actually priced at.
        </div>

        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Amount" required>
            <input className="input num" type="number" step="0.0001" autoFocus
                   value={form.amount}
                   onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Per" required>
            <select className="select" value={form.unit_type}
                    onChange={(e) => set({ unit_type: e.target.value })}>
              <option value="">Choose…</option>
              {(lookups?.unit_types || []).map((u) => (
                <option key={u.code} value={u.code}>{u.label} ({u.abbreviation})</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="In effect from" hint="Left empty, it starts today">
          <input className="input" type="date" value={form.effective_from}
                 onChange={(e) => set({ effective_from: e.target.value })} />
        </Field>

        {history.length > 0 && (
          <div className="table-wrap">
            <table className="data">
              <thead><tr>
                <th className="num">Amount</th><th>Per</th><th>From</th><th>To</th>
              </tr></thead>
              <tbody>
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="num">{fmt.rate(r.amount)}</td>
                    <td className="dim">{r.abbreviation}</td>
                    <td className="muted">{fmt.date(r.effective_from)}</td>
                    <td className="muted">{r.effective_to ? fmt.date(r.effective_to)
                                                          : 'in effect'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* --------------------------------------------------------- rule builder ---- */
/**
 * The rule, built the way it is actually read.
 *
 * A rule is one sentence with five parts: on this ticket type, when these
 * checks hold, bill this service code, as the nth transaction on the ticket,
 * under this contract. The checks are the part that varies in length, so they
 * get the table; the four fixed choices sit beside them and stay in view while
 * the checks are edited; and the sentence the whole thing adds up to is written
 * out at the bottom before anything is saved.
 *
 * Two things this deliberately does not do:
 *
 * An else branch is not a row in the database. Branching inside one rule would
 * break the one rule to one transaction guarantee every audit trail depends on,
 * so "otherwise" is written as a second rule at the same transaction_sequence,
 * behind the first on priority, with the first stopping its group. Both go in
 * one call, because half of an if/else on a live project means every ticket the
 * else was meant to catch quietly bills nothing.
 *
 * And the transaction sequence is not the priority. The sequence is the order
 * separate charges stack on one ticket: a haul is 1 and the tipping fee it
 * incurs is 2, and both bill. Priority only decides which of several
 * alternatives at the same sequence wins. Confusing the two is how a tipping
 * fee disappears.
 */
const BLANK_RULE = {
  name: '', ticket_type_id: '', service_code_id: '', contract_id: '',
  description: '', match_mode: 'all', priority: 100, transaction_sequence: 1,
  stop_on_match: false, is_active: true, statements: [],
}

export function RuleBuilder({ projectId, project, serviceCodes, rule,
                              onClose, onSaved }) {
  const { toast } = useApp()
  const editing = Boolean(rule?.id)
  const [form, setForm] = useState({ ...BLANK_RULE, ...(rule || {}) })
  const [otherwise, setOtherwise] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const operands = useFetch(
    () => api.get(`/projects/${projectId}/rule-operands`,
                  form.ticket_type_id ? { ticket_type_id: form.ticket_type_id } : {}),
    [projectId, form.ticket_type_id])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const codeOf = (id) => serviceCodes.find((c) => c.id === id)
  const contracts = project?.contracts || []
  const types = project?.ticket_types || []
  const contract = contracts.find((c) => c.contract_id === form.contract_id)

  function addCheck() {
    const first = operands.data?.items?.[0]
    set({ statements: [...form.statements, {
      operand_code: first?.code || 'debris_type',
      operator_code: first?.operators?.[0]?.code || 'eq',
      value: '', value_label: '', negate: false,
    }] })
  }

  function updateCheck(index, patch) {
    set({ statements: form.statements.map((s, i) => (i === index ? { ...s, ...patch } : s)) })
  }

  function body(over = {}) {
    return {
      name: form.name.trim(),
      ticket_type_id: form.ticket_type_id,
      service_code_id: form.service_code_id,
      contract_id: form.contract_id,
      description: form.description || null,
      match_mode: form.match_mode,
      priority: Number(form.priority) || 100,
      transaction_sequence: Number(form.transaction_sequence) || 1,
      stop_on_match: Boolean(form.stop_on_match),
      is_active: form.is_active !== false,
      statements: form.statements.map((s) => ({
        operand_code: s.operand_code,
        operator_code: s.operator_code,
        value: normaliseValue(s),
        value_label: s.value_label || null,
        negate: Boolean(s.negate),
      })),
      ...over,
    }
  }

  // What is actually going to be written, derived rather than described, so the
  // preview at the bottom and the request are the same object.
  const payloads = useMemo(() => {
    if (!otherwise) return [body()]
    return [
      // The branch that wins closes its own sequence group and nothing beyond it.
      body({ priority: 10, stop_on_match: true }),
      body({
        name: otherwise.name.trim(),
        service_code_id: otherwise.service_code_id,
        priority: 20, stop_on_match: false, statements: [],
        description: `Anything of this type the previous rule did not catch.`,
      }),
    ]
  }, [form, otherwise])

  async function save() {
    setBusy(true); setError(null)
    try {
      if (editing) {
        await api.put(`/rules/${rule.id}`, payloads[0])
        toast('Rule updated', form.name)
      } else if (payloads.length > 1) {
        const made = await api.post(`/projects/${projectId}/rules/batch`,
                                    { rules: payloads })
        toast('Rules written', made.summary)
      } else {
        await api.post(`/projects/${projectId}/rules`, payloads[0])
        toast('Rule created', form.name)
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const stops = []
  if (form.name.trim().length < 2) stops.push('a name')
  if (!form.ticket_type_id) stops.push('a ticket type')
  if (!form.service_code_id) stops.push('a service code')
  if (!form.contract_id) stops.push('a contract')
  if (otherwise && otherwise.name.trim().length < 2) stops.push('a name for the otherwise branch')
  if (otherwise && !otherwise.service_code_id) stops.push('a service code for the otherwise branch')
  if (otherwise && !form.statements.length) {
    stops.push('at least one check, or there is nothing for the otherwise branch to be other than')
  }

  return (
    <Modal wide title={editing ? `Edit rule · ${rule.name}` : 'New rule'}
           onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={stops.length > 0 || busy} onClick={save}>
          {busy && <span className="spinner" />}
          {editing ? 'Save rule'
            : `Save ${payloads.length} rule${payloads.length === 1 ? '' : 's'}`}
        </button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}

      <div className="row wrap" style={{ gap: 16, alignItems: 'flex-start' }}>
        {/* ------------------------------------------------ the checks ---- */}
        <div className="stack" style={{ gap: 12, flex: '2 1 440px', minWidth: 320 }}>
          <div className="grid c2" style={{ gap: 12 }}>
            <Field label="Rule name" required>
              <input className="input" value={form.name} autoFocus
                     placeholder="ROW vegetative load"
                     onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Ticket type" required
                   hint="What the field raises. The checks follow from it.">
              <select className="select" value={form.ticket_type_id}
                      onChange={(e) => set({ ticket_type_id: e.target.value,
                                             statements: [] })}>
                <option value="">Choose…</option>
                {types.map((t) => (
                  <option key={t.ticket_type_id} value={t.ticket_type_id}>{t.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div>
            <div className="row" style={{ gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 560, color: 'var(--text-muted)' }}>
                Checks
              </span>
              <div className="seg">
                {['all', 'any'].map((mode) => (
                  <button key={mode} className={form.match_mode === mode ? 'on' : ''}
                          onClick={() => set({ match_mode: mode })}>
                    match {mode}
                  </button>
                ))}
              </div>
              <div className="spacer" />
              <button className="btn sm" onClick={addCheck} disabled={!form.ticket_type_id}>
                <Icon name="plus" size={13} /> Add a check
              </button>
            </div>

            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 28 }} />
                  <th>Field</th><th style={{ width: 150 }}>Test</th>
                  <th>Value</th><th style={{ width: 36 }} />
                </tr></thead>
                <tbody>
                  {form.statements.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted"
                          style={{ fontSize: 12.5, lineHeight: 1.6, padding: '12px 10px' }}>
                        No checks. This bills every completed ticket of that type, which
                        is right for a flat per-ticket fee and wrong for anything else.
                      </td>
                    </tr>
                  ) : form.statements.map((s, i) => (
                    <CheckRow key={i} statement={s} index={i}
                              joiner={form.match_mode === 'any' ? 'or' : 'and'}
                              operands={operands.data?.items || []}
                              projectId={projectId}
                              onChange={(patch) => updateCheck(i, patch)}
                              onRemove={() => set({
                                statements: form.statements.filter((_, j) => j !== i) })} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {!editing && (
            <div className="card" style={{ padding: '11px 14px',
                                           background: 'var(--surface-2)' }}>
              <label className="check">
                <input type="checkbox" checked={Boolean(otherwise)}
                       onChange={(e) => setOtherwise(e.target.checked
                         ? { name: `${form.name || 'Rule'} — otherwise`,
                             service_code_id: '' }
                         : null)} />
                Bill something else when these checks do not hold
              </label>
              {otherwise && (
                <div className="grid c2" style={{ gap: 12, marginTop: 10 }}>
                  <Field label="Otherwise rule name" required>
                    <input className="input" value={otherwise.name}
                           onChange={(e) => setOtherwise(
                             { ...otherwise, name: e.target.value })} />
                  </Field>
                  <Field label="Otherwise bills" required>
                    <select className="select" value={otherwise.service_code_id}
                            onChange={(e) => setOtherwise(
                              { ...otherwise, service_code_id: e.target.value })}>
                      <option value="">Choose a service code</option>
                      {serviceCodes.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}
              <div className="dim" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.6 }}>
                Saved as a second rule sharing this transaction number, behind this one.
                They are alternatives to each other, so exactly one of them bills.
              </div>
            </div>
          )}
        </div>

        {/* -------------------------------------------- the fixed choices ---- */}
        <div className="stack" style={{ gap: 12, flex: '1 1 250px', minWidth: 230 }}>
          <div className="card" style={{ padding: '12px 14px' }}>
            <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                          letterSpacing: '.06em', marginBottom: 10 }}>
              Then bill
            </div>
            <div className="stack" style={{ gap: 12 }}>
              <Field label="Service code" required
                     hint={codeOf(form.service_code_id)
                       ? `${codeOf(form.service_code_id).current_rate != null
                            ? fmt.rate(codeOf(form.service_code_id).current_rate)
                            : 'no rate yet'} per `
                         + `${codeOf(form.service_code_id).current_unit_abbrev || '—'} · `
                         + `${codeOf(form.service_code_id).contractor_name}`
                       : 'The contractor and the rate come from the code'}>
                <select className="select" value={form.service_code_id}
                        onChange={(e) => set({ service_code_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {serviceCodes.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </Field>

              <Field label="Transaction #" required
                     hint={'1 is the first charge on the ticket. A tipping fee that '
                           + 'follows a haul is 2, and both of them bill.'}>
                <input className="input num" type="number" min="1"
                       value={form.transaction_sequence}
                       onChange={(e) => set({ transaction_sequence: e.target.value })} />
              </Field>

              <Field label="Contract" required
                     hint="Only contracts already on this project">
                <select className="select" value={form.contract_id}
                        onChange={(e) => set({ contract_id: e.target.value })}>
                  <option value="">Choose…</option>
                  {contracts.map((c) => (
                    <option key={c.contract_id} value={c.contract_id}>
                      {c.contract_number} · {c.contractor_name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          {editing && (
            <div className="card" style={{ padding: '12px 14px' }}>
              <div className="stack" style={{ gap: 10 }}>
                <Field label="Priority"
                       hint="Which alternative at this transaction number wins. Lower first.">
                  <input className="input num" type="number" value={form.priority}
                         onChange={(e) => set({ priority: e.target.value })} />
                </Field>
                <label className="check">
                  <input type="checkbox" checked={Boolean(form.stop_on_match)}
                         onChange={(e) => set({ stop_on_match: e.target.checked })} />
                  Stop the alternatives here
                </label>
                <label className="check">
                  <input type="checkbox" checked={form.is_active !== false}
                         onChange={(e) => set({ is_active: e.target.checked })} />
                  Active
                </label>
              </div>
            </div>
          )}

          {contracts.length === 0 && (
            <div className="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
              No contract is on this project yet, and a rule cannot be saved without one.
            </div>
          )}
          {serviceCodes.length === 0 && (
            <div className="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
              No service code on this project yet. Add one on the service codes step;
              a rule has nothing to bill without it.
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------------------------ what gets saved ---- */}
      <div className="card" style={{ padding: '12px 14px', marginTop: 16,
                                     background: 'var(--surface-2)' }}>
        <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                      letterSpacing: '.06em', marginBottom: 10 }}>
          What gets saved
        </div>

        {stops.length > 0 ? (
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
            Still needs {stops.join(', ')}.
          </div>
        ) : (
          <div className="stack" style={{ gap: 8 }}>
            {payloads.map((p, i) => (
              <RuleSentence key={i} payload={p} index={i} total={payloads.length}
                            code={codeOf(p.service_code_id)}
                            ticketType={types.find(
                              (t) => t.ticket_type_id === p.ticket_type_id)}
                            contract={contract} />
            ))}
            <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 2 }}>
              {payloads.length > 1
                ? 'Two rules, one transaction. The first to match bills and the other '
                  + 'does not, because they share a transaction number.'
                : `Transaction ${payloads[0].transaction_sequence} on the ticket. `
                  + 'Another rule at a different number bills alongside this one.'}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** One line of the preview: the rule as the person who reads it later sees it. */
function RuleSentence({ payload, index, total, code, ticketType, contract }) {
  return (
    <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
      <Badge tone={index === 0 ? 'blue' : ''}>#{payload.transaction_sequence}</Badge>
      <div style={{ fontSize: 12.5, lineHeight: 1.7, minWidth: 0 }}>
        <b>{payload.name}</b>
        {total > 1 && (
          <span className="dim">{index === 0 ? ' (if)' : ' (otherwise)'}</span>
        )}
        <br />
        On a <b>{ticketType?.label || 'ticket'}</b>
        {payload.statements.length === 0
          ? (index === 0 ? ', whatever it measures' : ' the first rule did not catch')
          : (<>
              {' when '}
              {payload.statements.map((s, i) => (
                <span key={i}>
                  {i > 0 && (payload.match_mode === 'any' ? ' or ' : ' and ')}
                  <b>{s.operand_code}</b>{' '}
                  {s.operator_code}{' '}
                  <b>{s.value_label || String(s.value ?? '')}</b>
                </span>
              ))}
            </>)}
        {', bill '}
        <b className="mono">{code?.code || '—'}</b>
        {code?.current_rate != null && ` at ${fmt.rate(code.current_rate)} per `
          + `${code.current_unit_abbrev || 'unit'}`}
        {code?.contractor_name && ` to ${code.contractor_name}`}
        {contract && ` under ${contract.contract_number}`}.
      </div>
    </div>
  )
}

/** A check, as a table row. The value control follows the operand: a list where
 *  the project can enumerate the answers, a plain box where it cannot. */
function CheckRow({ statement, index, joiner, operands, projectId, onChange, onRemove }) {
  const operand = operands.find((o) => o.code === statement.operand_code)
  const operators = operand?.operators || []
  const [options, setOptions] = useState(null)

  useEffect(() => {
    let cancelled = false
    setOptions(null)
    if (operand?.options_source) {
      api.get(`/projects/${projectId}/options/${operand.options_source}`)
        .then((r) => { if (!cancelled) setOptions(r.items) })
        .catch(() => { if (!cancelled) setOptions([]) })
    }
    return () => { cancelled = true }
  }, [operand?.options_source, projectId])

  const multi = ['in', 'not_in'].includes(statement.operator_code)
  const none = ['is_null', 'is_not_null'].includes(statement.operator_code)
  const selected = multi
    ? (Array.isArray(statement.value) ? statement.value
       : String(statement.value || '').split(',').filter(Boolean))
    : statement.value

  return (
    <tr>
      <td className="dim" style={{ fontSize: 11.5, verticalAlign: 'middle' }}>
        {index === 0 ? 'if' : joiner}
      </td>
      <td style={{ padding: 3 }}>
        <select className="select" value={statement.operand_code}
                onChange={(e) => {
                  const next = operands.find((o) => o.code === e.target.value)
                  onChange({
                    operand_code: e.target.value,
                    operator_code: next?.operators?.[0]?.code || 'eq',
                    value: '', value_label: '',
                  })
                }}>
          {operands.map((o) => (
            <option key={o.code} value={o.code}>{o.label}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: 3 }}>
        <select className="select" value={statement.operator_code}
                onChange={(e) => onChange({ operator_code: e.target.value,
                                            value: '', value_label: '' })}>
          {operators.map((op) => (
            <option key={op.code} value={op.code}>{op.label}</option>
          ))}
        </select>
      </td>
      <td style={{ padding: 3 }}>
        {none ? (
          <span className="dim" style={{ fontSize: 12 }}>no value needed</span>
        ) : options ? (
          multi ? (
            <div className="row wrap" style={{ gap: 5 }}>
              {options.map((o) => {
                const on = selected.includes(o.value)
                return (
                  <button key={o.value} className={`btn sm${on ? ' primary' : ''}`}
                          onClick={() => {
                            const next = on ? selected.filter((v) => v !== o.value)
                                            : [...selected, o.value]
                            onChange({ value: next,
                                       value_label: options
                                         .filter((x) => next.includes(x.value))
                                         .map((x) => x.label).join(', ') })
                          }}>
                    {o.label}
                  </button>
                )
              })}
            </div>
          ) : (
            <select className="select" value={statement.value || ''}
                    onChange={(e) => {
                      const opt = options.find((o) => o.value === e.target.value)
                      onChange({ value: e.target.value, value_label: opt?.label })
                    }}>
              <option value="">Choose…</option>
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}{o.hint ? ` — ${o.hint}` : ''}
                </option>
              ))}
            </select>
          )
        ) : (
          <input className="input"
                 type={operand?.data_type === 'number' ? 'number'
                       : operand?.data_type === 'date' ? 'date' : 'text'}
                 value={Array.isArray(statement.value) ? statement.value.join(', ')
                                                       : (statement.value ?? '')}
                 placeholder={statement.operator_code === 'between' ? 'min, max'
                              : multi ? 'comma separated'
                              : operand?.unit_hint ? `value in ${operand.unit_hint}`
                              : 'value'}
                 onChange={(e) => onChange({ value: e.target.value,
                                             value_label: e.target.value })} />
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        <button className="btn ghost icon sm" onClick={onRemove} title="Remove this check">
          <Icon name="x" size={12} />
        </button>
      </td>
    </tr>
  )
}

/** The value as the operator means it: a list for in, a pair for between, a
 *  number where the comparison is numeric, and nothing where none is wanted. */
export function normaliseValue(statement) {
  const operator = statement.operator_code
  if (operator === 'is_null' || operator === 'is_not_null') return null
  if (operator === 'in' || operator === 'not_in') {
    if (Array.isArray(statement.value)) return statement.value
    return String(statement.value || '').split(',').map((v) => v.trim()).filter(Boolean)
  }
  if (operator === 'between') {
    if (Array.isArray(statement.value)) return statement.value.map(Number)
    return String(statement.value || '').split(',').map((v) => Number(v.trim()))
  }
  return ['gt', 'gte', 'lt', 'lte'].includes(operator)
    ? Number(statement.value) : statement.value
}

/**
 * Equipment certification, inside a project.
 *
 * The walkthrough was unambiguous about where this belongs: "Equipment is
 * certified under a given project, NOT outside of it. We cannot transfer a cert
 * from one project to another or copy them over." The org-wide Trucks and
 * Equipment list is the fleet; this is what each of those units is certified to
 * carry on THIS declaration.
 *
 * Capacity times the monitor's load call is the billable volume on every load
 * ticket, so correcting a measurement moves money that has already been
 * invoiced. That is why nothing here edits in place and why the correction
 * dialog prices the change before it is written.
 */
import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Drawer, Empty, ErrorNote, Field, Icon, Loading, Modal, Search,
  Stat, useDebounced,
} from '../components/ui'

const METHOD_LABEL = {
  physical: 'Measured',
  manufacturer: 'Manufacturer',
  recertification: 'Recertified',
  correction: 'Corrected',
}

export default function Certifications() {
  const { project, can, toast } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [status, setStatus] = useState('active')
  const [certifying, setCertifying] = useState(false)
  const [viewing, setViewing] = useState(null)

  const { data, loading, error, reload } = useFetch(
    () => (project
      ? api.get(`/projects/${project.id}/certifications`,
                { q: search || undefined, status, limit: 200 })
      : null),
    [project?.id, search, status])

  if (!project) {
    return (<><PageHeader title="Certifications" /><div className="page">
      <Empty icon="truck" title="No project in context">
        A certification belongs to one project, so pick one first.
      </Empty></div></>)
  }

  const summary = data?.summary

  return (
    <>
      <PageHeader title="Certifications" crumb={project.project_code}>
        {can('equipment.manage') && (
          <button className="btn primary sm" onClick={() => setCertifying(true)}>
            <Icon name="plus" size={13} /> Certify a unit
          </button>
        )}
      </PageHeader>

      <div className="page stack">
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 660 }}>
          Every unit is measured under this declaration. A capacity is never
          copied from another project, and it is never edited: a new measurement
          supersedes the one before it, so the chain is the evidence.
        </div>

        {summary && (
          <div className="grid c4">
            <Stat label="Certified units" value={fmt.int(summary.certified)} />
            <Stat label="Total capacity" value={`${fmt.number(summary.total_capacity_cy, 0)} CY`} />
            <Stat label="Expiring in 30 days" value={fmt.int(summary.expiring_soon)}
                  tone={summary.expiring_soon ? 'amber' : undefined} />
            <Stat label="Expired" value={fmt.int(summary.expired)}
                  tone={summary.expired ? 'red' : undefined} />
          </div>
        )}

        <Card flush>
          <div className="card-head">
            <Search value={q} onChange={setQ} placeholder="Unit or certification number" />
            <select className="select" style={{ width: 160 }} value={status}
                    aria-label="Certification state"
                    onChange={(e) => setStatus(e.target.value)}>
              <option value="active">In force</option>
              <option value="superseded">Superseded</option>
              <option value="revoked">Revoked</option>
              <option value="all">Everything</option>
            </select>
          </div>

          {loading && <Loading rows={6} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (data.items.length === 0 ? (
            <Empty icon="truck" title="Nothing certified yet">
              A load ticket bills on certified capacity, so the field cannot
              produce billable work until the units carrying it are measured.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Unit</th><th>Contractor</th>
                  <th className="num">Capacity</th><th className="num">Tare</th>
                  <th>How</th><th>From</th><th>Expires</th>
                  <th className="num">Tickets</th><th className="num">Revisions</th>
                  <th />
                </tr></thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} className="clickable" onClick={() => setViewing(c)}>
                      <td>
                        <b>{c.unit_number}</b>
                        {c.certification_number && (
                          <span className="dim" style={{ fontSize: 12 }}> · {c.certification_number}</span>
                        )}
                      </td>
                      <td>{c.contractor_name || '—'}</td>
                      <td className="num"><b>{fmt.number(c.certified_capacity_cy, 2)}</b> CY</td>
                      <td className="num">{c.tare_weight_lbs ? fmt.int(c.tare_weight_lbs) : '—'}</td>
                      <td><Badge tone={c.method === 'correction' ? 'amber' : undefined}>
                        {METHOD_LABEL[c.method] || c.method}</Badge></td>
                      <td className="nums">{fmt.date(c.applies_from)}</td>
                      <td className="nums">
                        {c.expires_on ? <ExpiryCell on={c.expires_on} /> : '—'}
                      </td>
                      <td className="num">{fmt.int(c.tickets_priced)}</td>
                      <td className="num dim">{c.supersedes_id ? '↻' : '—'}</td>
                      <td className="dim" style={{ width: 24, textAlign: 'right' }}>
                        <Icon name="chevron" size={13} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
      </div>

      {certifying && (
        <CertifyModal projectId={project.id} onClose={() => setCertifying(false)}
                      onDone={() => { setCertifying(false); reload() }} toast={toast} />
      )}

      {viewing && (
        <CertificationDrawer certificationId={viewing.id}
                             onClose={() => setViewing(null)}
                             onChanged={() => { setViewing(null); reload() }}
                             toast={toast} />
      )}
    </>
  )
}

function ExpiryCell({ on }) {
  const days = Math.round((new Date(on) - new Date()) / 86400000)
  const tone = days < 0 ? 'red' : days <= 30 ? 'amber' : undefined
  return (
    <span style={{ color: tone ? `var(--${tone})` : undefined }}>
      {fmt.date(on)}
      {days <= 30 && (
        <span style={{ fontSize: 11, marginLeft: 6 }}>
          {days < 0 ? `${-days}d ago` : `${days}d`}
        </span>
      )}
    </span>
  )
}

/* ------------------------------------------------------------ the chain */
function CertificationDrawer({ certificationId, onClose, onChanged, toast }) {
  const { can } = useApp()
  const [changing, setChanging] = useState(null)
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/certifications/${certificationId}`), [certificationId])

  const c = data

  return (
    <Drawer title={loading ? 'Loading' : c?.unit_number}
            sub={c ? `${METHOD_LABEL[c.method]} · ${fmt.number(c.certified_capacity_cy, 2)} CY` : ''}
            onClose={onClose}
            actions={can('equipment.manage') && c?.status === 'active' && (
              <>
                <button className="btn sm" onClick={() => setChanging('recertification')}>
                  Recertify
                </button>
                <button className="btn sm danger" onClick={() => setChanging('correction')}>
                  Correct
                </button>
              </>
            )}>
      {loading && <Loading rows={6} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {c && (
        <div className="stack">
          <dl className="kv">
            <dt>Certified capacity</dt><dd><b>{fmt.number(c.certified_capacity_cy, 2)} CY</b></dd>
            <dt>Tare weight</dt><dd>{c.tare_weight_lbs ? `${fmt.int(c.tare_weight_lbs)} lbs` : '—'}</dd>
            <dt>Counts from</dt><dd>{fmt.date(c.applies_from)}</dd>
            <dt>Measured on</dt><dd>{fmt.date(c.measured_on)}</dd>
            <dt>Measured by</dt><dd>{c.measured_by_full_name || c.measured_by_name || '—'}</dd>
            <dt>Expires</dt><dd>{c.expires_on ? fmt.date(c.expires_on) : 'No expiry set'}</dd>
            <dt>Tickets priced</dt><dd>{fmt.int(c.tickets_priced)}</dd>
            <dt>Document</dt>
            <dd>{c.document_url
              ? <a href={c.document_url} target="_blank" rel="noreferrer">
                  {c.document_title || 'Open'} <Icon name="external" size={11} />
                </a>
              : '—'}</dd>
          </dl>

          {c.notes && <p className="muted" style={{ fontSize: 13 }}>{c.notes}</p>}

          <Card title="Measurement history"
                sub="Each row replaced the one above it. Nothing here was edited.">
            <div className="stack" style={{ gap: 8 }}>
              {(c.chain || []).map((row) => (
                <div key={row.id} className="row"
                     style={{ gap: 10, padding: '8px 0',
                              borderTop: '1px solid var(--line)',
                              opacity: row.status === 'active' ? 1 : 0.62 }}>
                  <Badge tone={row.status === 'active' ? 'green'
                    : row.status === 'revoked' ? 'red' : undefined}>
                    {fmt.title(row.status)}
                  </Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{fmt.number(row.certified_capacity_cy, 2)} CY</b>
                    <span className="dim" style={{ fontSize: 12 }}>
                      {' '}· {METHOD_LABEL[row.method]} · counts from {fmt.date(row.applies_from)}
                    </span>
                    {row.superseded_reason && (
                      <div className="dim" style={{ fontSize: 12 }}>{row.superseded_reason}</div>
                    )}
                  </div>
                  <div className="dim nums" style={{ fontSize: 12 }}>
                    {fmt.int(row.tickets_priced)} tickets
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {changing && c && (
        <ChangeModal cert={c} method={changing} onClose={() => setChanging(null)}
                     onDone={() => { setChanging(null); reload(); onChanged?.() }}
                     toast={toast} />
      )}
    </Drawer>
  )
}

/* --------------------------------------------------------- first measure */
function CertifyModal({ projectId, onClose, onDone, toast }) {
  const [form, setForm] = useState({ method: 'physical' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const units = useFetch(
    () => api.get(`/projects/${projectId}/options/project_equipment`), [projectId])

  async function save() {
    setBusy(true); setError(null)
    try {
      const result = await api.post(`/projects/${projectId}/certifications`, {
        equipment_id: form.equipment_id,
        certified_capacity_cy: Number(form.certified_capacity_cy),
        tare_weight_lbs: form.tare_weight_lbs ? Number(form.tare_weight_lbs) : undefined,
        certification_number: form.certification_number || undefined,
        method: form.method,
        measured_on: form.measured_on || undefined,
        expires_on: form.expires_on || undefined,
        notes: form.notes || undefined,
      })
      toast('Certified', result.message)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const ready = form.equipment_id && Number(form.certified_capacity_cy) > 0

  return (
    <Modal wide title="Certify a unit on this project" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ready || busy} onClick={save}>
          {busy && <span className="spinner" />} Certify
        </button>
      </>
    }>
      {error && <ErrorNote error={{ message: error }} />}
      <div className="grid c2" style={{ gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Unit" required hint="Only equipment belonging to a contractor on this project">
            <select className="select" value={form.equipment_id || ''}
                    onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}>
              <option value="">Choose a unit</option>
              {(units.data?.items || []).map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Certified capacity" required hint="Cubic yards, as measured">
          <input className="input" type="number" step="0.01"
                 value={form.certified_capacity_cy || ''}
                 onChange={(e) => setForm({ ...form, certified_capacity_cy: e.target.value })}
                 placeholder="44.00" />
        </Field>
        <Field label="Tare weight" hint="Pounds, empty">
          <input className="input" type="number" step="1" value={form.tare_weight_lbs || ''}
                 onChange={(e) => setForm({ ...form, tare_weight_lbs: e.target.value })} />
        </Field>
        <Field label="Certification number" hint="Printed on the placard">
          <input className="input" value={form.certification_number || ''}
                 onChange={(e) => setForm({ ...form, certification_number: e.target.value })} />
        </Field>
        <Field label="How it was measured">
          <select className="select" value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="physical">Measured physically</option>
            <option value="manufacturer">Taken from the manufacturer</option>
          </select>
        </Field>
        <Field label="Measured on">
          <input className="input" type="date" value={form.measured_on || ''}
                 onChange={(e) => setForm({ ...form, measured_on: e.target.value })} />
        </Field>
        <Field label="Expires">
          <input className="input" type="date" value={form.expires_on || ''}
                 onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
        </Field>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Notes">
            <textarea className="input" rows={2} value={form.notes || ''}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------ recertify, or correct */
/**
 * The difference between these two is the whole design, so the dialog says it
 * in words rather than assuming anyone remembers.
 *
 * A recertification counts forward from the day it was measured. A correction
 * says the previous number was wrong, stands where that number stood, and
 * therefore reprices the tickets it already touched. The impact panel exists
 * because that second case is expensive and has to be seen before it happens.
 */
function ChangeModal({ cert, method, onClose, onDone, toast }) {
  const [capacity, setCapacity] = useState('')
  const [tare, setTare] = useState(cert.tare_weight_lbs || '')
  const [notes, setNotes] = useState('')
  const [measuredOn, setMeasuredOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const proposed = Number(capacity)
  const impact = useFetch(
    () => (method === 'correction' && proposed > 0
      ? api.get(`/certifications/${cert.id}/impact`, { capacity: proposed })
      : method === 'correction'
        ? api.get(`/certifications/${cert.id}/impact`)
        : null),
    [cert.id, method, proposed > 0 ? proposed : 0])

  async function save() {
    setBusy(true); setError(null)
    try {
      const result = await api.post(
        `/projects/${cert.project_id}/certifications`, {
          equipment_id: cert.equipment_id,
          certified_capacity_cy: proposed,
          tare_weight_lbs: tare ? Number(tare) : undefined,
          method,
          measured_on: measuredOn || undefined,
          supersedes_id: cert.id,
          notes: notes || undefined,
        })
      toast(method === 'correction' ? 'Correction recorded' : 'Recertified',
            result.message)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const a = impact.data?.affected
  const locked = impact.data?.locked_invoices || []

  return (
    <Modal wide
           title={method === 'correction'
             ? `Correct the measurement for ${cert.unit_number}`
             : `Recertify ${cert.unit_number}`}
           onClose={onClose} footer={
             <>
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className={`btn ${method === 'correction' ? 'danger' : 'primary'}`}
                       disabled={busy || !(proposed > 0) || notes.trim().length < 4}
                       onClick={save}>
                 {busy && <span className="spinner" />}
                 {method === 'correction' ? 'Record correction' : 'Recertify'}
               </button>
             </>
           }>
      {error && <ErrorNote error={{ message: error }} />}

      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6 }}>
          {method === 'correction' ? (
            <>
              A correction says the previous number was <b>wrong</b>. It stands
              where that number stood, from {fmt.date(cert.applies_from)}, so
              every ticket it already priced is repriced.
            </>
          ) : (
            <>
              A recertification says the unit <b>changed</b>. It counts forward
              from the day you measured it, and tickets before that keep the
              capacity they were priced on.
            </>
          )}
        </div>
      </div>

      <div className="grid c2" style={{ gap: 12 }}>
        <Field label="Was" hint="The capacity in force now">
          <input className="input" value={`${fmt.number(cert.certified_capacity_cy, 2)} CY`}
                 readOnly disabled />
        </Field>
        <Field label="Is" required hint="Cubic yards">
          <input className="input" type="number" step="0.01" value={capacity}
                 autoFocus onChange={(e) => setCapacity(e.target.value)} />
        </Field>
        <Field label="Tare weight" hint="Pounds, empty">
          <input className="input" type="number" step="1" value={tare}
                 onChange={(e) => setTare(e.target.value)} />
        </Field>
        {method === 'recertification' && (
          <Field label="Measured on" hint="It counts from this date forward">
            <input className="input" type="date" value={measuredOn}
                   onChange={(e) => setMeasuredOn(e.target.value)} />
          </Field>
        )}
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Reason" required
                 hint="Carried onto the superseded row and into the audit trail">
            <textarea className="input" rows={2} value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={method === 'correction'
                        ? 'Tare read as 3 instead of 1 at the original measurement'
                        : 'Body replaced after the August collision'} />
          </Field>
        </div>
      </div>

      {method === 'correction' && a && (
        <div className="card" style={{ padding: 14, marginTop: 14 }}>
          <div className="dim" style={{ fontSize: 11, letterSpacing: '0.06em',
                                        textTransform: 'uppercase', marginBottom: 8 }}>
            What this reprices
          </div>
          {a.tickets === 0 ? (
            <div style={{ fontSize: 13 }}>
              Nothing has been priced on this measurement yet, so the correction
              costs nothing.
            </div>
          ) : (
            <>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                <b>{fmt.int(a.tickets)}</b> ticket{a.tickets === 1 ? '' : 's'}
                {a.first_day && <> between {fmt.date(a.first_day)} and {fmt.date(a.last_day)}</>},
                carrying <b>{fmt.number(a.cubic_yards, 1)} CY</b>.
              </div>
              <div className="row" style={{ gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>Billing now</div>
                  <div style={{ fontSize: 16, fontWeight: 620 }}>{fmt.money(a.billed)}</div>
                </div>
                {impact.data.estimated_billed_after !== undefined && (
                  <>
                    <div>
                      <div className="dim" style={{ fontSize: 11 }}>After</div>
                      <div style={{ fontSize: 16, fontWeight: 620 }}>
                        {fmt.money(impact.data.estimated_billed_after)}
                      </div>
                    </div>
                    <div>
                      <div className="dim" style={{ fontSize: 11 }}>Difference</div>
                      <div style={{ fontSize: 16, fontWeight: 620,
                                    color: impact.data.estimated_difference < 0
                                      ? 'var(--red)' : 'var(--green)' }}>
                        {impact.data.estimated_difference >= 0 ? '+' : ''}
                        {fmt.money(impact.data.estimated_difference)}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
                An estimate. The exact figures come out of the rules engine when
                the tickets are repriced, which happens from the reprice queue.
              </div>
            </>
          )}

          {locked.length > 0 && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 6,
                          background: 'var(--amber-soft)', color: 'var(--amber)',
                          fontSize: 13 }}>
              <b>{locked.join(', ')}</b> {locked.length === 1 ? 'has' : 'have'} been
              approved. Those tickets are refused by the reprice queue until the
              invoice is reopened, or repriced deliberately with an adjustment
              left behind.
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

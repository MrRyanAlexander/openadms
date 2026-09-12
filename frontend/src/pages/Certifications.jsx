/**
 * Equipment certification, inside a project.
 *
 * Two things this screen has to be true to.
 *
 * A certification belongs to one declaration: "Equipment is certified under a
 * given project, NOT outside of it. We cannot transfer a cert from one project
 * to another or copy them over." The org wide equipment list is the fleet;
 * this is what each unit is certified to carry on THIS declaration.
 *
 * And a capacity is a measurement, not a number. "Do not just record the
 * answer. Record the measurements that produced the answer." So there is no
 * box on this screen to type a capacity into. There is a worksheet: what kind
 * of container it is, what shape its interior takes, what came off the tape,
 * what was added, what was deducted, and the arithmetic that follows. The
 * certified capacity is the output of that, and it is never edited: a new
 * measurement supersedes the one before it, and the chain is the evidence.
 */
import { useEffect, useMemo, useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Drawer, Empty, ErrorNote, Field, Icon, Loading, Modal, rowProps,
  Search, Stat, useDebounced,
} from '../components/ui'
import {
  DimensionInput, EvidenceChecklist, ShapeDiagram, VolumeReadout, feetAndInches,
} from '../components/measure-bits'

const METHOD_LABEL = {
  physical: 'Measured',
  manufacturer: 'Manufacturer',
  recertification: 'Recertified',
  correction: 'Corrected',
}

const STATUS_TONE = {
  draft: undefined, submitted: 'blue', active: 'green',
  rejected: 'red', superseded: undefined, revoked: 'red',
}

const STATUS_LABEL = {
  draft: 'Being measured', submitted: 'Waiting on review', active: 'In force',
  rejected: 'Sent back', superseded: 'Superseded', revoked: 'Revoked',
}

const ROLE_LABEL = { base: 'Base', addition: 'Added', deduction: 'Deducted' }

export default function Certifications() {
  const { project, can, toast } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [status, setStatus] = useState('active')
  const [starting, setStarting] = useState(false)
  const [worksheet, setWorksheet] = useState(null)
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
  const items = data?.items || []
  const unmeasured = items.filter((c) => c.status === 'active' && !c.is_measured).length

  return (
    <>
      <PageHeader title="Certifications" crumb={project.project_code}>
        {can('equipment.manage') && (
          <button className="btn primary sm" onClick={() => setStarting(true)}>
            <Icon name="plus" size={13} /> Measure a unit
          </button>
        )}
      </PageHeader>

      <div className="page stack">
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 700 }}>
          Every unit is measured under this declaration. A capacity is never
          copied from another project and never typed: it comes out of the
          measurements, which stay on the record so anyone can see how the
          number was reached.
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

        {unmeasured > 0 && status === 'active' && (
          <div className="card" style={{ padding: 14, borderColor: 'var(--red)',
                                         background: 'var(--red-soft)' }}>
            <div className="row" style={{ gap: 8, color: 'var(--red)' }}>
              <Icon name="alert" size={15} />
              <b>{unmeasured} capacit{unmeasured === 1 ? 'y has' : 'ies have'} no
                 measurements behind {unmeasured === 1 ? 'it' : 'them'}</b>
            </div>
            <div className="muted" style={{ marginTop: 5, fontSize: 12.5, lineHeight: 1.6 }}>
              These numbers were entered directly, so nothing in the record says
              how they were reached. Each one prices every load its unit hauls.
              They are on the review queue until somebody measures them.
            </div>
          </div>
        )}

        <Card flush>
          <div className="card-head">
            <Search value={q} onChange={setQ} placeholder="Unit or certification number" />
            <select className="select" style={{ width: 190 }} value={status}
                    aria-label="Certification state"
                    onChange={(e) => setStatus(e.target.value)}>
              <option value="active">In force</option>
              <option value="open">Being measured or reviewed</option>
              <option value="submitted">Waiting on review</option>
              <option value="draft">Being measured</option>
              <option value="rejected">Sent back</option>
              <option value="superseded">Superseded</option>
              <option value="revoked">Revoked</option>
              <option value="all">Everything</option>
            </select>
          </div>

          {loading && <Loading rows={6} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (items.length === 0 ? (
            <Empty icon="truck" title="Nothing here yet">
              A load ticket bills on certified capacity, so the field cannot
              produce billable work until the units carrying it are measured.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Unit</th><th>Contractor</th>
                  <th className="num">Capacity</th><th>How it was reached</th>
                  <th>Container</th><th>From</th><th>Expires</th>
                  <th className="num">Tickets</th><th>State</th><th />
                </tr></thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c.id} {...rowProps(() => (
                      c.status === 'draft' ? setWorksheet(c.id) : setViewing(c)))}>
                      <td>
                        <b>{c.unit_number}</b>
                        {c.certification_number && (
                          <span className="dim" style={{ fontSize: 12 }}> · {c.certification_number}</span>
                        )}
                      </td>
                      <td>{c.contractor_name || '—'}</td>
                      <td className="num">
                        {c.certified_capacity_cy == null
                          ? <span className="dim">not yet</span>
                          : <><b>{fmt.number(c.certified_capacity_cy, 2)}</b> CY</>}
                      </td>
                      <td>
                        {c.is_measured
                          ? <span className="row" style={{ gap: 6 }}>
                              <Icon name="scale" size={13} />
                              {c.section_count} section{c.section_count === 1 ? '' : 's'}
                            </span>
                          : <span className="badge red">Typed, not measured</span>}
                      </td>
                      <td>{c.container_label || <span className="dim">—</span>}</td>
                      <td className="nums">{fmt.date(c.applies_from)}</td>
                      <td className="nums">
                        {c.expires_on ? <ExpiryCell on={c.expires_on} /> : '—'}
                      </td>
                      <td className="num">{fmt.int(c.tickets_priced)}</td>
                      <td>
                        <Badge tone={STATUS_TONE[c.status]}>
                          {STATUS_LABEL[c.status] || fmt.title(c.status)}
                        </Badge>
                      </td>
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

      {starting && (
        <StartMeasurement projectId={project.id} onClose={() => setStarting(false)}
                          onStarted={(id) => { setStarting(false); reload(); setWorksheet(id) }}
                          toast={toast} />
      )}

      {worksheet && (
        <WorksheetDrawer certificationId={worksheet}
                         onClose={() => { setWorksheet(null); reload() }}
                         toast={toast} />
      )}

      {viewing && (
        <CertificationDrawer certificationId={viewing.id}
                             onClose={() => setViewing(null)}
                             onChanged={() => { setViewing(null); reload() }}
                             onMeasure={(id) => { setViewing(null); setWorksheet(id) }}
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

/* ==================================================== starting a measurement */
/**
 * Step one of the requirement's model: identify what is being measured.
 *
 * Container type is asked for before anything else, because it decides which
 * shapes the worksheet starts with, which photographs are required, and what
 * capacity is plausible for this kind of equipment.
 */
function StartMeasurement({ projectId, onClose, onStarted, toast }) {
  const [form, setForm] = useState({ method: 'physical' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const units = useFetch(
    () => api.get(`/projects/${projectId}/options/project_equipment`), [projectId])
  const types = useFetch(() => api.get('/measurements/container-types'), [])

  const chosen = (types.data?.items || []).find((t) => t.code === form.container_type_code)

  async function start() {
    setBusy(true); setError(null)
    try {
      const cert = await api.post(`/projects/${projectId}/certifications`, {
        equipment_id: form.equipment_id,
        method: form.method,
        certification_number: form.certification_number || undefined,
        measured_on: form.measured_on || undefined,
        expires_on: form.expires_on || undefined,
      })
      await api.post(`/certifications/${cert.id}/measurement`, {
        container_type_code: form.container_type_code,
        intended_use: form.intended_use || chosen?.typical_use,
        measurement_method: form.measurement_method || 'tape',
        paper_form_number: form.paper_form_number || undefined,
        sections: (chosen?.default_sections || []).map((s, i) => ({
          label: s.label, shape_code: s.shape_code, role: s.role || 'base',
          dimensions: {}, sequence: i + 1,
        })).filter(() => false),
      })
      toast('Worksheet open', 'Measure the interior and the capacity follows')
      onStarted(cert.id)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const ready = form.equipment_id && form.container_type_code

  return (
    <Modal wide title="Measure a unit on this project" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!ready || busy} onClick={start}>
          {busy && <span className="spinner" />} Open the worksheet
        </button>
      </>
    }>
      {error && <ErrorNote error={{ message: error }} />}
      <p className="muted" style={{ marginTop: 0 }}>
        No capacity is entered here. It comes out of the measurements on the
        next screen.
      </p>

      <div className="grid c2" style={{ gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Unit" required
                 hint="Only equipment belonging to a contractor on this project">
            <select className="select" value={form.equipment_id || ''}
                    onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}>
              <option value="">Choose a unit</option>
              {(units.data?.items || []).map((u) => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="What is being measured" required
                 hint="Decides the shapes to start from and the photographs required">
            <select className="select" value={form.container_type_code || ''}
                    onChange={(e) => setForm({ ...form, container_type_code: e.target.value })}>
              <option value="">Choose a container type</option>
              {(types.data?.items || []).map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>

        {chosen && (
          <div className="card" style={{ gridColumn: '1 / -1', padding: 12 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>{chosen.description}</div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
              Normally used for {chosen.typical_use.toLowerCase()}.
              {chosen.typical_min_cy != null && (
                <> Usually measures between {fmt.number(chosen.typical_min_cy, 0)} and{' '}
                  {fmt.number(chosen.typical_max_cy, 0)} CY.</>
              )}
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
              {chosen.required_photo_slots.map((s) => (
                <span key={s} className="badge">{fmt.title(s)}</span>
              ))}
            </div>
          </div>
        )}

        <Field label="How it is being measured">
          <select className="select" value={form.measurement_method || 'tape'}
                  onChange={(e) => setForm({ ...form, measurement_method: e.target.value })}>
            <option value="tape">Tape measure</option>
            <option value="laser">Laser measure</option>
            <option value="manufacturer_drawing">Manufacturer drawing</option>
            <option value="other">Something else</option>
          </select>
        </Field>
        <Field label="Certification number" hint="The number printed on the placard">
          <input className="input" value={form.certification_number || ''}
                 onChange={(e) => setForm({ ...form, certification_number: e.target.value })} />
        </Field>
        <Field label="Paper form number" hint="Ties this record to the form in the truck">
          <input className="input" value={form.paper_form_number || ''}
                 onChange={(e) => setForm({ ...form, paper_form_number: e.target.value })} />
        </Field>
        <Field label="Expires">
          <input className="input" type="date" value={form.expires_on || ''}
                 onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

/* ================================================================ worksheet */
/**
 * The worksheet itself.
 *
 * Sections down the left with their own arithmetic, the running total at the
 * top where it stays visible, and the photographs the type requires shown as a
 * checklist rather than a grid of whatever happened to arrive.
 */
function WorksheetDrawer({ certificationId, onClose, toast }) {
  const { can } = useApp()
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)

  const { data, loading, error, reload } = useFetch(
    () => api.get(`/certifications/${certificationId}/measurement`), [certificationId])
  const shapes = useFetch(() => api.get('/measurements/shapes'), [])
  const photos = useFetch(
    () => api.get(`/certifications/${certificationId}/media`), [certificationId])

  const sheet = data?.measured ? data : null
  const sections = sheet?.sections || []
  const open = sheet?.certification_status === 'draft'

  async function removeSection(id) {
    try {
      await api.del(`/measurements/sections/${id}`)
      reload()
    } catch (err) { toast('Could not remove it', err.message, 'err') }
  }

  async function submit() {
    setBusy(true)
    try {
      const out = await api.post(`/certifications/${certificationId}/submit`, {})
      toast('Submitted', out.message)
      onClose()
    } catch (err) {
      toast('Could not submit', err.message, 'err')
    } finally { setBusy(false) }
  }

  const total = sheet && {
    total_cubic_inches: sheet.total_cubic_inches,
    total_cubic_feet: sheet.total_cubic_feet,
    total_cubic_yards: sheet.total_cubic_yards,
    base_cubic_inches: sheet.base_cubic_inches,
    addition_cubic_inches: sheet.addition_cubic_inches,
    deduction_cubic_inches: sheet.deduction_cubic_inches,
    capacity_cy: sheet.derived_capacity_cy,
    within_typical_range: sheet.typical_min_cy == null ? null
      : Number(sheet.total_cubic_yards) >= Number(sheet.typical_min_cy)
        && Number(sheet.total_cubic_yards) <= Number(sheet.typical_max_cy),
    range_note: (sheet.typical_min_cy != null
      && (Number(sheet.total_cubic_yards) < Number(sheet.typical_min_cy)
          || Number(sheet.total_cubic_yards) > Number(sheet.typical_max_cy)))
      ? `A ${String(sheet.container_label).toLowerCase()} normally measures `
        + `between ${fmt.number(sheet.typical_min_cy, 0)} and `
        + `${fmt.number(sheet.typical_max_cy, 0)} CY.`
      : null,
  }

  return (
    <Drawer
      title={loading ? 'Loading' : `${sheet?.unit_number || 'Worksheet'}`}
      sub={sheet ? `${sheet.container_label} · ${sheet.section_count} section${sheet.section_count === 1 ? '' : 's'}` : ''}
      onClose={onClose}
      actions={open && can('equipment.manage') && (
        <button className="btn sm primary" onClick={submit}
                disabled={busy || !sections.length}>
          {busy && <span className="spinner" />} Submit for review
        </button>
      )}>
      {loading && <Loading rows={8} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {sheet && (
        <div className="stack" style={{ gap: 16 }}>
          <VolumeReadout result={total} />

          {!open && (
            <div className="card" style={{ padding: 12, borderColor: 'var(--line-strong)' }}>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                This certification is {STATUS_LABEL[sheet.certification_status]?.toLowerCase()},
                so the worksheet is closed. Evidence that can be edited afterwards
                is not evidence. Record a correction if the number was wrong.
              </div>
            </div>
          )}

          <Card title="Sections"
                sub="Base plus what was added, minus what was deducted"
                actions={open && (
                  <button className="btn sm" onClick={() => setAdding(true)}>
                    <Icon name="plus" size={13} /> Add a section
                  </button>
                )}>
            {sections.length === 0 ? (
              <Empty icon="scale" title="Nothing measured yet">
                Add the main body first, then anything added or deducted.
              </Empty>
            ) : (
              <div className="stack" style={{ gap: 0 }}>
                {sections.map((s) => (
                  <div key={s.id} className="section-row">
                    <div className="section-figure">
                      <ShapeDiagram shape={s.diagram_key} height={64} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <b>{s.label}</b>
                        <span className={`badge${s.role === 'deduction' ? ' red'
                          : s.role === 'addition' ? ' blue' : ''}`}>
                          {ROLE_LABEL[s.role]}
                        </span>
                        {s.quantity > 1 && <span className="dim">×{s.quantity}</span>}
                      </div>
                      <div className="dim" style={{ fontSize: 12, marginTop: 3 }}>
                        {s.shape_label} · {s.formula_note}
                      </div>
                      <div className="nums" style={{ fontSize: 12.5, marginTop: 5 }}>
                        {Object.entries(s.dimensions).map(([k, v]) => (
                          <span key={k} className="dim-chip">
                            {fmt.title(k)} {feetAndInches(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="nums" style={{ fontWeight: 620 }}>
                        {s.role === 'deduction' && '-'}{fmt.int(s.computed_cubic_inches)}
                      </div>
                      <div className="dim nums" style={{ fontSize: 11 }}>
                        cubic inches
                      </div>
                      <div className="dim nums" style={{ fontSize: 11 }}>
                        {fmt.number(s.cubic_yards, 2)} CY
                      </div>
                      {open && (
                        <div className="row" style={{ gap: 4, marginTop: 6,
                                                      justifyContent: 'flex-end' }}>
                          <button className="btn sm ghost icon" aria-label="Edit section"
                                  onClick={(e) => { e.stopPropagation(); setEditing(s) }}>
                            <Icon name="edit" size={13} />
                          </button>
                          <button className="btn sm ghost icon" aria-label="Remove section"
                                  onClick={(e) => { e.stopPropagation(); removeSection(s.id) }}>
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Photographs"
                sub="What this container type requires, against what was collected"
                actions={open && (
                  <button className="btn sm" onClick={() => setPhoto({ slot: 'front' })}>
                    <Icon name="camera" size={13} /> Attach
                  </button>
                )}>
            <EvidenceChecklist evidence={photos.data?.evidence}
                               media={photos.data?.items}
                               onAdd={open ? (slot) => setPhoto({ slot }) : undefined}
                               onOpen={(m) => window.open(m.storage_url, '_blank')} />
          </Card>

          <Card title="How it was measured">
            <dl className="kv">
              <dt>Container</dt><dd>{sheet.container_label}</dd>
              <dt>Intended use</dt><dd>{sheet.intended_use || sheet.container_typical_use}</dd>
              <dt>Method</dt><dd>{fmt.title(sheet.measurement_method)}</dd>
              <dt>Measured by</dt><dd>{sheet.measured_by_name || '—'}</dd>
              <dt>Measured on</dt><dd>{fmt.date(sheet.measured_on)}</dd>
              <dt>Interior only</dt><dd>{sheet.interior_only ? 'Yes' : 'No'}</dd>
              <dt>Door counted</dt>
              <dd>{sheet.door_included
                ? 'Yes, the door closes fully' : 'No, measured to the rail'}</dd>
              <dt>Paper form</dt><dd>{sheet.paper_form_number || '—'}</dd>
              <dt>Rounding</dt><dd>{fmt.title(sheet.rounding_rule)}</dd>
            </dl>
          </Card>
        </div>
      )}

      {data && !data.measured && (
        <Empty icon="alert" title="No worksheet on this certification">
          {data.message}
        </Empty>
      )}

      {(adding || editing) && (
        <SectionEditor certificationId={certificationId}
                       shapes={shapes.data?.items || []}
                       section={editing}
                       nextSequence={(sections.at(-1)?.sequence || 0) + 1}
                       onClose={() => { setAdding(false); setEditing(null) }}
                       onSaved={() => { setAdding(false); setEditing(null); reload() }}
                       toast={toast} />
      )}

      {photo && (
        <PhotoModal certificationId={certificationId} slot={photo.slot}
                    onClose={() => setPhoto(null)}
                    onSaved={() => { setPhoto(null); photos.reload(); reload() }}
                    toast={toast} />
      )}
    </Drawer>
  )
}

/* ------------------------------------------------------------ one section */
/**
 * One measured shape.
 *
 * The drawing is the point. A dimension called "straight side height" is
 * ambiguous in words and obvious against a picture of the trailer with that
 * line marked, so the diagram highlights whichever field has focus.
 *
 * The volume is worked out by the same function the saved worksheet uses, over
 * the API, rather than in this file. Two implementations of a formula is two
 * answers.
 */
function SectionEditor({ certificationId, shapes, section, nextSequence,
                         onClose, onSaved, toast }) {
  const [shapeCode, setShapeCode] = useState(section?.shape_code || 'rectangular')
  const [label, setLabel] = useState(section?.label || '')
  const [role, setRole] = useState(section?.role || 'base')
  const [quantity, setQuantity] = useState(section?.quantity || 1)
  const [dims, setDims] = useState(section?.dimensions || {})
  const [notes, setNotes] = useState(section?.notes || '')
  const [active, setActive] = useState(null)
  const [preview, setPreview] = useState(null)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  const shape = shapes.find((s) => s.code === shapeCode)
  const schema = shape?.dimension_schema || []
  const complete = schema.every(
    (d) => d.required === false || typeof dims[d.key] === 'number')

  // Recalculate as the tape is read out. Same endpoint the field app calls.
  useEffect(() => {
    let cancelled = false
    if (!complete) { setPreview(null); setProblem(null); return undefined }
    const handle = setTimeout(async () => {
      try {
        const out = await api.post('/measurements/preview', {
          sections: [{ label: label || 'Section', shape_code: shapeCode,
                       role: 'base', quantity: Number(quantity) || 1,
                       dimensions: dims }],
        })
        if (!cancelled) { setPreview(out); setProblem(null) }
      } catch (err) {
        if (!cancelled) { setPreview(null); setProblem(err.message) }
      }
    }, 220)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [shapeCode, JSON.stringify(dims), quantity, complete, label])

  function pickShape(code) {
    setShapeCode(code)
    setDims({})
    setPreview(null)
    setProblem(null)
  }

  async function save() {
    setBusy(true)
    try {
      const body = {
        label: label || shape.label, shape_code: shapeCode, role,
        quantity: Number(quantity) || 1, dimensions: dims,
        notes: notes || undefined,
      }
      if (section) await api.patch(`/measurements/sections/${section.id}`, body)
      else {
        await api.post(`/certifications/${certificationId}/measurement/sections`,
                       { ...body, sequence: nextSequence })
      }
      onSaved()
    } catch (err) {
      toast('Could not save the section', err.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <Modal wide title={section ? `Edit ${section.label}` : 'Add a section'}
           onClose={onClose} footer={
             <>
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className="btn primary" disabled={busy || !complete || !!problem}
                       onClick={save}>
                 {busy && <span className="spinner" />}
                 {section ? 'Save the section' : 'Add the section'}
               </button>
             </>
           }>
      <div className="grid c2" style={{ gap: 16, alignItems: 'start' }}>
        <div className="stack" style={{ gap: 12 }}>
          <Field label="Shape" required hint={shape?.description}>
            <select className="select" value={shapeCode}
                    onChange={(e) => pickShape(e.target.value)}>
              {shapes.map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
          </Field>

          <Field label="What this section is" required
                 hint="Main body, top flare, wheel well intrusion">
            <input className="input" value={label} autoFocus
                   placeholder={shape?.label}
                   onChange={(e) => setLabel(e.target.value)} />
          </Field>

          <div className="grid c2" style={{ gap: 10 }}>
            <Field label="Counts toward">
              <select className="select" value={role}
                      onChange={(e) => setRole(e.target.value)}>
                <option value="base">The base volume</option>
                <option value="addition">Added to it</option>
                <option value="deduction">Deducted from it</option>
              </select>
            </Field>
            <Field label="How many" hint="Two wheel wells is one row, quantity 2">
              <input className="input" type="number" min="1" max="99" value={quantity}
                     onChange={(e) => setQuantity(e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          <div className="card" style={{ padding: 10 }}>
            <ShapeDiagram shape={shape?.diagram_key} active={active} />
            <div className="dim" style={{ fontSize: 11.5, textAlign: 'center',
                                          marginTop: 2 }}>
              {shape?.formula_note}
            </div>
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <div className="grid c2" style={{ gap: 12 }}>
            {schema.map((d) => (
              <DimensionInput key={`${shapeCode}-${d.key}`} spec={d}
                              value={dims[d.key]}
                              onFocus={setActive} onBlur={() => setActive(null)}
                              onChange={(v) => setDims((prev) => {
                                const next = { ...prev }
                                if (v == null) delete next[d.key]
                                else next[d.key] = v
                                return next
                              })} />
            ))}
          </div>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Note"
                 hint={shapeCode === 'manual_volume'
                   ? 'Required. Say how the figure was worked out, because nothing here can check it.'
                   : 'Anything the reviewer should know about this measurement'}>
            <input className="input" value={notes}
                   onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          {problem && (
            <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                                           background: 'var(--red-soft)',
                                           color: 'var(--red)', fontSize: 13 }}>
              {problem}
            </div>
          )}
          {!problem && preview && (
            <div className="card" style={{ padding: 12 }}>
              <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>This section</div>
                  <div className="nums" style={{ fontSize: 19, fontWeight: 640 }}>
                    {fmt.int(preview.total_cubic_inches)}
                    <small style={{ fontSize: 12 }}> cubic inches</small>
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>Cubic feet</div>
                  <div className="nums" style={{ fontSize: 15 }}>
                    {fmt.number(preview.total_cubic_feet, 1)}
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>Cubic yards</div>
                  <div className="nums" style={{ fontSize: 15 }}>
                    {fmt.number(preview.total_cubic_yards, 2)}
                  </div>
                </div>
              </div>
            </div>
          )}
          {!problem && !preview && (
            <div className="dim" style={{ fontSize: 13 }}>
              Fill in the dimensions and the volume appears here.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------- one photo */
function PhotoModal({ certificationId, slot, onClose, onSaved, toast }) {
  const [form, setForm] = useState({ slot, storage_url: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save() {
    setBusy(true); setError(null)
    try {
      await api.post(`/certifications/${certificationId}/media`, {
        slot: form.slot,
        storage_url: form.storage_url.trim(),
        description: form.description || undefined,
      })
      toast('Photograph attached', fmt.title(form.slot))
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Attach a photograph" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.storage_url.trim()}
                onClick={save}>
          {busy && <span className="spinner" />} Attach
        </button>
      </>
    }>
      {error && <ErrorNote error={{ message: error }} />}
      <p className="muted" style={{ marginTop: 0 }}>
        The file stays wherever it lives. This holds the link, the same as every
        other document in the system.
      </p>
      <div className="stack">
        <Field label="Which photograph" required>
          <select className="select" value={form.slot}
                  onChange={(e) => setForm({ ...form, slot: e.target.value })}>
            {['front', 'rear', 'side', 'interior', 'placard', 'measurement',
              'paper_form', 'other'].map((s) => (
                <option key={s} value={s}>{fmt.title(s)}</option>
            ))}
          </select>
        </Field>
        <Field label="Link" required hint="A full http or https URL">
          <input className="input" value={form.storage_url} autoFocus
                 placeholder="https://"
                 onChange={(e) => setForm({ ...form, storage_url: e.target.value })} />
        </Field>
        <Field label="Description">
          <input className="input" value={form.description || ''}
                 onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

/* ================================================== an existing certification */
/**
 * How this capacity was reached, what it is pricing, and what replaced what.
 *
 * A certification with no worksheet behind it says so plainly. That is the
 * honest answer to "how did we determine this trailer is 30 CY" for every
 * number the system carried before measurements existed.
 */
function CertificationDrawer({ certificationId, onClose, onChanged, onMeasure, toast }) {
  const { can } = useApp()
  const [changing, setChanging] = useState(null)
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/certifications/${certificationId}`), [certificationId])
  const sheet = useFetch(
    () => api.get(`/certifications/${certificationId}/measurement`), [certificationId])
  const photos = useFetch(
    () => api.get(`/certifications/${certificationId}/media`), [certificationId])

  const c = data
  const measured = sheet.data?.measured

  return (
    <Drawer title={loading ? 'Loading' : c?.unit_number}
            sub={c ? `${METHOD_LABEL[c.method]} · ${fmt.number(c.certified_capacity_cy, 2)} CY` : ''}
            onClose={onClose}
            actions={can('equipment.manage') && c?.status === 'active' && (
              <>
                <button className="btn sm" onClick={() => setChanging('recertification')}>
                  Recertify
                </button>
                <button className="btn sm" onClick={() => setChanging('correction')}>
                  Correct
                </button>
              </>
            )}>
      {loading && <Loading rows={6} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {c && (
        <div className="stack">
          {measured === false && (
            <div className="card" style={{ padding: 14, borderColor: 'var(--red)',
                                           background: 'var(--red-soft)' }}>
              <div className="row" style={{ gap: 8, color: 'var(--red)' }}>
                <Icon name="alert" size={15} /><b>No measurements behind this number</b>
              </div>
              <div className="muted" style={{ marginTop: 5, fontSize: 12.5, lineHeight: 1.6 }}>
                {sheet.data?.message} It prices {fmt.int(c.tickets_priced)} ticket
                {c.tickets_priced === 1 ? '' : 's'} so far.
              </div>
            </div>
          )}

          <dl className="kv">
            <dt>Certified capacity</dt><dd><b>{fmt.number(c.certified_capacity_cy, 2)} CY</b></dd>
            <dt>Tare weight</dt><dd>{c.tare_weight_lbs ? `${fmt.int(c.tare_weight_lbs)} lbs` : '—'}</dd>
            <dt>Counts from</dt><dd>{fmt.date(c.applies_from)}</dd>
            <dt>Measured on</dt><dd>{fmt.date(c.measured_on)}</dd>
            <dt>Measured by</dt><dd>{c.measured_by_full_name || c.measured_by_name || '—'}</dd>
            <dt>Expires</dt><dd>{c.expires_on ? fmt.date(c.expires_on) : 'No expiry set'}</dd>
            <dt>Tickets priced</dt><dd>{fmt.int(c.tickets_priced)}</dd>
          </dl>

          {c.notes && <p className="muted" style={{ fontSize: 13 }}>{c.notes}</p>}

          {measured && (
            <Card title="How the number was reached"
                  sub={`${sheet.data.container_label} · ${sheet.data.section_count} section${sheet.data.section_count === 1 ? '' : 's'}`}
                  actions={
                    <span className="dim nums" style={{ fontSize: 12 }}>
                      {fmt.int(sheet.data.total_cubic_inches)} cubic inches
                    </span>
                  }>
              <div className="stack" style={{ gap: 0 }}>
                {sheet.data.sections.map((s) => (
                  <div key={s.id} className="section-row compact">
                    <div className="section-figure">
                      <ShapeDiagram shape={s.diagram_key} height={48} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <b>{s.label}</b>
                        <span className={`badge${s.role === 'deduction' ? ' red'
                          : s.role === 'addition' ? ' blue' : ''}`}>
                          {ROLE_LABEL[s.role]}
                        </span>
                        {s.quantity > 1 && <span className="dim">×{s.quantity}</span>}
                      </div>
                      <div className="nums dim" style={{ fontSize: 12, marginTop: 3 }}>
                        {Object.entries(s.dimensions)
                          .map(([k, v]) => `${fmt.title(k)} ${feetAndInches(v)}`)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="nums" style={{ textAlign: 'right', fontWeight: 600 }}>
                      {s.role === 'deduction' && '-'}{fmt.int(s.computed_cubic_inches)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {!measured && can('equipment.manage') && (
            <button className="btn" onClick={() => onMeasure?.(certificationId)}>
              <Icon name="scale" size={13} /> Open a worksheet for this unit
            </button>
          )}

          <Card title="Photographs">
            <EvidenceChecklist evidence={photos.data?.evidence}
                               media={photos.data?.items}
                               onOpen={(m) => window.open(m.storage_url, '_blank')} />
          </Card>

          <Card title="Measurement history"
                sub="Each row replaced the one above it. Nothing here was edited.">
            <div className="stack" style={{ gap: 8 }}>
              {(c.chain || []).map((row) => (
                <div key={row.id} className="row"
                     style={{ gap: 10, padding: '8px 0',
                              borderTop: '1px solid var(--line)',
                              opacity: row.status === 'active' ? 1 : 0.62 }}>
                  <Badge tone={STATUS_TONE[row.status]}>
                    {STATUS_LABEL[row.status] || fmt.title(row.status)}
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
                     onDone={(id) => { setChanging(null); onChanged?.(); onMeasure?.(id) }}
                     toast={toast} />
      )}
    </Drawer>
  )
}

/* ------------------------------------------------ recertify, or correct */
/**
 * The difference between these two is the whole design, so the dialog says it
 * in words rather than assuming anyone remembers.
 *
 * A recertification counts forward from the day it was measured. A correction
 * says the previous number was wrong, stands where that number stood, and
 * reprices the tickets it already touched. The impact panel exists because
 * that second case is expensive and has to be seen before it happens.
 *
 * Neither one asks for a capacity. Both open a worksheet, because a
 * replacement measurement is still a measurement.
 */
function ChangeModal({ cert, method, onClose, onDone, toast }) {
  const [notes, setNotes] = useState('')
  const [containerType, setContainerType] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const types = useFetch(() => api.get('/measurements/container-types'), [])
  const impact = useFetch(
    () => (method === 'correction'
      ? api.get(`/certifications/${cert.id}/impact`) : null),
    [cert.id, method])

  async function start() {
    setBusy(true); setError(null)
    try {
      const created = await api.post(
        `/projects/${cert.project_id}/certifications`, {
          equipment_id: cert.equipment_id,
          method,
          certification_number: cert.certification_number || undefined,
          supersedes_id: cert.id,
          notes,
        })
      await api.post(`/certifications/${created.id}/measurement`, {
        container_type_code: containerType,
      })
      toast(method === 'correction' ? 'Correction started' : 'Recertification started',
            'Measure the interior; nothing changes until it is approved')
      onDone(created.id)
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
                       disabled={busy || !containerType || notes.trim().length < 4}
                       onClick={start}>
                 {busy && <span className="spinner" />} Open a worksheet
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
              every ticket it already priced is repriced when this is approved.
            </>
          ) : (
            <>
              A recertification says the unit <b>changed</b>. It counts forward
              from the day you measure it, and tickets before that keep the
              capacity they were priced on.
            </>
          )}
        </div>
      </div>

      <div className="grid c2" style={{ gap: 12 }}>
        <Field label="Capacity in force now">
          <input className="input" value={`${fmt.number(cert.certified_capacity_cy, 2)} CY`}
                 readOnly disabled />
        </Field>
        <Field label="What is being measured" required>
          <select className="select" value={containerType}
                  onChange={(e) => setContainerType(e.target.value)}>
            <option value="">Choose a container type</option>
            {(types.data?.items || []).map((t) => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
        </Field>
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
            What this will reprice
          </div>
          {a.tickets === 0 ? (
            <div style={{ fontSize: 13 }}>
              Nothing has been priced on this measurement yet, so the correction
              costs nothing.
            </div>
          ) : (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <b>{fmt.int(a.tickets)}</b> ticket{a.tickets === 1 ? '' : 's'}
              {a.first_day && <> between {fmt.date(a.first_day)} and {fmt.date(a.last_day)}</>},
              carrying <b>{fmt.number(a.cubic_yards, 1)} CY</b> and{' '}
              <b>{fmt.money(a.billed)}</b> as they stand. The exact figures come
              out of the rules engine when the correction is approved.
            </div>
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

/**
 * Certifying a unit, on the phone, at the trailer.
 *
 * This is where the measurement actually happens. A monitor is standing at the
 * equipment with a tape measure, and the requirement describes exactly what
 * they do:
 *
 *   "A human in the field physically measures the equipment/container ... They
 *    then enter those measurements into the field application. The application
 *    should perform the necessary calculations and return the calculated
 *    volume/capacity."
 *
 * Three things that follow.
 *
 * The device does the arithmetic, over the same endpoint the back office uses,
 * so the number on this screen and the number on the certification cannot
 * disagree. It is shown in cubic inches first, because that is the figure that
 * goes onto the paper form in the truck.
 *
 * Feet and inches are accepted, because nobody at a trailer says 264 inches.
 *
 * Photographs come before the tape. Front, side, interior and the placard are
 * what a reviewer checks the number against, and a monitor who has already
 * walked around the truck will not walk around it again.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useAsync, useField } from '../lib/field'
import { Badge, Empty, Field, Icon, Sheet, Steps } from '../components/kit'

const SLOTS = [
  ['front', 'Truck front'],
  ['side', 'Truck side'],
  ['interior', 'Interior'],
  ['placard', 'Certification placard'],
  ['measurement', 'Measurement'],
]

const ROLE_LABEL = { base: 'Base', addition: 'Added', deduction: 'Deducted' }

function toInches(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return null
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw)
  const m = raw.match(/^\s*(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?\s*)?$/)
  if (!m) return null
  const feet = Number(m[1] || 0)
  const inches = Number(m[2] || 0)
  if (!feet && !inches) return null
  return feet * 12 + inches
}

function feetAndInches(inches) {
  const n = Number(inches || 0)
  if (!n) return ''
  const ft = Math.floor(n / 12)
  const rest = Math.round((n - ft * 12) * 100) / 100
  if (!ft) return `${rest} in`
  return rest ? `${ft} ft ${rest} in` : `${ft} ft`
}

/* ------------------------------------------------------------ the list */
export default function Certify() {
  const { projectId, online } = useField()
  const navigate = useNavigate()
  const [starting, setStarting] = useState(false)

  const mine = useAsync(
    () => api.get(`/projects/${projectId}/certifications`,
                  { status: 'open', limit: 50 }),
    [projectId], { skip: !projectId || !online })

  if (!projectId) {
    return (
      <div className="screen">
        <Empty icon="folder" title="No project assigned">
          Equipment is certified under a project, so you need one first.
        </Empty>
      </div>
    )
  }

  const open = mine.data?.items || []

  return (
    <div className="screen">
      <button className="btn primary block" onClick={() => setStarting(true)}>
        <Icon name="plus" size={18} /> Measure a unit
      </button>

      <div style={{ marginTop: 16 }}>
        <div className="dim" style={{ fontSize: 11.5, letterSpacing: '0.07em',
                                      textTransform: 'uppercase', marginBottom: 8 }}>
          In progress
        </div>
        {open.length === 0 ? (
          <Empty icon="ruler" title="Nothing part measured">
            Start one and it stays here until you submit it, so you can put the
            phone down halfway through.
          </Empty>
        ) : open.map((c) => (
          <button key={c.id} className="card row tappable"
                  style={{ width: '100%', marginBottom: 8 }}
                  onClick={() => navigate(`/certify/${c.id}`)}>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontWeight: 620 }}>{c.unit_number}</div>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
                {c.container_label || 'Not yet described'}
                {c.certified_capacity_cy != null
                  && ` · ${fmt.number(c.certified_capacity_cy, 2)} CY so far`}
              </div>
            </div>
            <Badge tone={c.status === 'submitted' ? 'blue' : undefined}>
              {c.status === 'submitted' ? 'With review' : 'Measuring'}
            </Badge>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>

      {starting && (
        <StartSheet projectId={projectId} onClose={() => setStarting(false)}
                    onStarted={(id) => navigate(`/certify/${id}`)} />
      )}
    </div>
  )
}

function StartSheet({ projectId, onClose, onStarted }) {
  const { toast } = useField()
  const [equipmentId, setEquipmentId] = useState('')
  const [typeCode, setTypeCode] = useState('')
  const [number, setNumber] = useState('')
  const [paper, setPaper] = useState('')
  const [busy, setBusy] = useState(false)

  const units = useAsync(
    () => api.get(`/projects/${projectId}/options/project_equipment`), [projectId])
  const types = useAsync(() => api.get('/measurements/container-types'), [])
  const chosen = (types.data?.items || []).find((t) => t.code === typeCode)

  async function start() {
    setBusy(true)
    try {
      const cert = await api.post(`/projects/${projectId}/certifications`, {
        equipment_id: equipmentId, method: 'physical',
        certification_number: number || undefined,
      })
      await api.post(`/certifications/${cert.id}/measurement`, {
        container_type_code: typeCode,
        intended_use: chosen?.typical_use,
        measurement_method: 'tape',
        paper_form_number: paper || undefined,
      })
      onStarted(cert.id)
    } catch (err) {
      toast('Could not start', err.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <Sheet title="What are you measuring" onClose={onClose} footer={
      <button className="btn primary block"
              disabled={busy || !equipmentId || !typeCode} onClick={start}>
        {busy ? <span className="spinner" /> : 'Start measuring'}
      </button>
    }>
      <Field label="Unit" required>
        <select className="input" value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}>
          <option value="">Choose the truck or trailer</option>
          {(units.data?.items || []).map((u) => (
            <option key={u.value} value={u.value}>{u.label}</option>
          ))}
        </select>
      </Field>

      <Field label="What kind of container" required
             hint="Decides the shapes and which photographs are needed">
        <select className="input" value={typeCode}
                onChange={(e) => setTypeCode(e.target.value)}>
          <option value="">Choose one</option>
          {(types.data?.items || []).map((t) => (
            <option key={t.code} value={t.code}>{t.label}</option>
          ))}
        </select>
      </Field>

      {chosen && (
        <div className="banner" style={{ marginBottom: 12 }}>
          {chosen.description}
          {chosen.typical_min_cy != null && (
            <> Usually {fmt.number(chosen.typical_min_cy, 0)} to{' '}
              {fmt.number(chosen.typical_max_cy, 0)} CY.</>
          )}
        </div>
      )}

      <Field label="Placard number" hint="The number printed on the truck">
        <input className="input" value={number} inputMode="text"
               onChange={(e) => setNumber(e.target.value)} />
      </Field>
      <Field label="Paper form number" hint="So the two copies find each other later">
        <input className="input" value={paper} inputMode="text"
               onChange={(e) => setPaper(e.target.value)} />
      </Field>
    </Sheet>
  )
}

/* -------------------------------------------------------- the worksheet */
export function CertifyFlow() {
  const { certificationId } = useParams()
  const { toast } = useField()
  const navigate = useNavigate()
  const [stage, setStage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [photo, setPhoto] = useState(null)
  const [busy, setBusy] = useState(false)

  const sheet = useAsync(
    () => api.get(`/certifications/${certificationId}/measurement`), [certificationId])
  const photos = useAsync(
    () => api.get(`/certifications/${certificationId}/media`), [certificationId])
  const shapes = useAsync(() => api.get('/measurements/shapes'), [])

  const w = sheet.data?.measured ? sheet.data : null
  const evidence = photos.data?.evidence
  const missing = evidence?.missing_slots || []
  const sections = w?.sections || []

  async function submit() {
    setBusy(true)
    try {
      const out = await api.post(`/certifications/${certificationId}/submit`, {})
      toast('Sent for review', out.message)
      navigate('/certify')
    } catch (err) {
      toast('Could not submit', err.message, 'err')
    } finally { setBusy(false) }
  }

  async function removeSection(id) {
    try {
      await api.del(`/measurements/sections/${id}`)
      sheet.reload()
    } catch (err) { toast('Could not remove it', err.message, 'err') }
  }

  if (!w) {
    return (
      <div className="screen">
        <Empty icon="ruler" title="Loading the worksheet" />
      </div>
    )
  }

  return (
    <div className="screen">
      <Steps total={2} current={stage} />

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 640, fontSize: 16 }}>{w.unit_number}</div>
        <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
          {w.container_label}
          {w.paper_form_number && ` · form ${w.paper_form_number}`}
        </div>
      </div>

      {stage === 0 && (
        <>
          <div className="dim" style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.6 }}>
            Photograph the truck before you measure it. A reviewer checks the
            number against these, and the placard is how they know it is the
            right truck.
          </div>
          {SLOTS.map(([slot, label]) => {
            const has = (photos.data?.items || []).some((m) => m.slot === slot)
            const needed = (evidence?.required_slots || []).includes(slot)
            return (
              <button key={slot} className="card row tappable"
                      style={{ width: '100%', marginBottom: 8,
                               borderColor: (!has && needed) ? 'var(--red)' : undefined }}
                      onClick={() => setPhoto(slot)}>
                <Icon name={has ? 'check' : 'camera'} size={20}
                      style={{ color: has ? 'var(--green)' : undefined }} />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 560 }}>{label}</div>
                  <div className="dim" style={{ fontSize: 12 }}>
                    {has ? 'Attached' : needed ? 'Required' : 'Optional'}
                  </div>
                </div>
                <Icon name="chevron" size={18} />
              </button>
            )
          })}
          <button className="btn primary block" style={{ marginTop: 14 }}
                  onClick={() => setStage(1)}>
            {missing.length
              ? `Measure it (${missing.length} photo${missing.length === 1 ? '' : 's'} still missing)`
              : 'Measure it'}
          </button>
        </>
      )}

      {stage === 1 && (
        <>
          <Readout sheet={w} />

          <div className="dim" style={{ fontSize: 11.5, letterSpacing: '0.07em',
                                        textTransform: 'uppercase', margin: '16px 0 8px' }}>
            Sections
          </div>

          {sections.length === 0 && (
            <Empty icon="ruler" title="Nothing measured yet">
              Start with the main body, then add anything bolted on or anything
              intruding into the space.
            </Empty>
          )}

          {sections.map((s) => (
            <div key={s.id} className="card" style={{ marginBottom: 8 }}>
              <div className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7 }}>
                    <b>{s.label}</b>
                    <Badge tone={s.role === 'deduction' ? 'red'
                      : s.role === 'addition' ? 'blue' : undefined}>
                      {ROLE_LABEL[s.role]}
                    </Badge>
                    {s.quantity > 1 && <span className="dim">×{s.quantity}</span>}
                  </div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                    {Object.entries(s.dimensions)
                      .map(([k, v]) => `${fmt.title(k)} ${feetAndInches(v)}`)
                      .join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 620 }}>
                    {s.role === 'deduction' && '-'}{fmt.int(s.computed_cubic_inches)}
                  </div>
                  <div className="dim" style={{ fontSize: 11 }}>cu in</div>
                  <button className="btn ghost icon sm" style={{ marginTop: 4 }}
                          aria-label="Remove" onClick={() => removeSection(s.id)}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <button className="btn block" style={{ marginTop: 10 }}
                  onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} /> Add a section
          </button>

          <button className="btn primary block" style={{ marginTop: 10 }}
                  disabled={busy || !sections.length} onClick={submit}>
            {busy ? <span className="spinner" /> : 'Submit for review'}
          </button>

          {missing.length > 0 && (
            <div className="banner amber" style={{ marginTop: 10 }}>
              {missing.length} required photograph{missing.length === 1 ? ' is' : 's are'}{' '}
              still missing. You can still submit; the reviewer will see the gap.
            </div>
          )}

          <button className="btn ghost block" style={{ marginTop: 10 }}
                  onClick={() => setStage(0)}>
            Back to the photographs
          </button>
        </>
      )}

      {adding && (
        <SectionSheet certificationId={certificationId}
                      shapes={shapes.data?.items || []}
                      nextSequence={(sections.at(-1)?.sequence || 0) + 1}
                      onClose={() => setAdding(false)}
                      onSaved={() => { setAdding(false); sheet.reload() }} />
      )}

      {photo && (
        <PhotoSheet certificationId={certificationId} slot={photo}
                    onClose={() => setPhoto(null)}
                    onSaved={() => { setPhoto(null); photos.reload() }} />
      )}
    </div>
  )
}

/** Cubic inches first: that is the figure that goes on the paper form. */
function Readout({ sheet }) {
  const odd = sheet.typical_min_cy != null
    && (Number(sheet.total_cubic_yards) < Number(sheet.typical_min_cy)
        || Number(sheet.total_cubic_yards) > Number(sheet.typical_max_cy))
  return (
    <div className={`card${odd ? ' amber' : ''}`}>
      <div className="dim" style={{ fontSize: 11.5, letterSpacing: '0.07em',
                                    textTransform: 'uppercase' }}>
        Cubic inches
      </div>
      <div style={{ fontSize: 30, fontWeight: 680, lineHeight: 1.15 }}>
        {fmt.int(sheet.total_cubic_inches)}
      </div>
      <div className="row" style={{ gap: 18, marginTop: 8 }}>
        <div>
          <div className="dim" style={{ fontSize: 11 }}>Cubic feet</div>
          <div style={{ fontWeight: 600 }}>{fmt.number(sheet.total_cubic_feet, 1)}</div>
        </div>
        <div>
          <div className="dim" style={{ fontSize: 11 }}>Cubic yards</div>
          <div style={{ fontWeight: 600 }}>{fmt.number(sheet.total_cubic_yards, 2)}</div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="dim" style={{ fontSize: 11 }}>Capacity</div>
          <div style={{ fontWeight: 680, fontSize: 18 }}>
            {fmt.number(sheet.derived_capacity_cy, 2)} CY
          </div>
        </div>
      </div>
      {odd && (
        <div style={{ marginTop: 8, fontSize: 12.5 }}>
          That is outside what a {String(sheet.container_label).toLowerCase()}{' '}
          normally measures. Check the tape before you submit.
        </div>
      )}
    </div>
  )
}

/**
 * One shape, measured.
 *
 * The volume comes back from the server as the numbers are typed, which is the
 * same function the certification will be saved with. The monitor sees the
 * total before committing to it, and writes the cubic inches onto the paper.
 */
function SectionSheet({ certificationId, shapes, nextSequence, onClose, onSaved }) {
  const { toast } = useField()
  const [shapeCode, setShapeCode] = useState('rectangular')
  const [label, setLabel] = useState('')
  const [role, setRole] = useState('base')
  const [quantity, setQuantity] = useState('1')
  const [raw, setRaw] = useState({})
  const [preview, setPreview] = useState(null)
  const [problem, setProblem] = useState(null)
  const [busy, setBusy] = useState(false)

  const shape = shapes.find((s) => s.code === shapeCode)
  const schema = shape?.dimension_schema || []

  const dims = useMemo(() => {
    const out = {}
    Object.entries(raw).forEach(([k, v]) => {
      const n = toInches(v)
      if (n != null) out[k] = n
    })
    return out
  }, [raw])

  const complete = schema.every(
    (d) => d.required === false || typeof dims[d.key] === 'number')

  useEffect(() => {
    let dead = false
    if (!complete) { setPreview(null); setProblem(null); return undefined }
    const handle = setTimeout(async () => {
      try {
        const out = await api.post('/measurements/preview', {
          sections: [{ label: label || 'Section', shape_code: shapeCode,
                       role: 'base', quantity: Number(quantity) || 1, dimensions: dims }],
        })
        if (!dead) { setPreview(out); setProblem(null) }
      } catch (err) {
        if (!dead) { setPreview(null); setProblem(err.message) }
      }
    }, 250)
    return () => { dead = true; clearTimeout(handle) }
  }, [shapeCode, JSON.stringify(dims), quantity, complete, label])

  async function save() {
    setBusy(true)
    try {
      await api.post(`/certifications/${certificationId}/measurement/sections`, {
        label: label || shape.label, shape_code: shapeCode, role,
        quantity: Number(quantity) || 1, dimensions: dims, sequence: nextSequence,
      })
      onSaved()
    } catch (err) {
      toast('Could not save the section', err.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <Sheet title="Measure a section" onClose={onClose} footer={
      <button className="btn primary block" disabled={busy || !complete || !!problem}
              onClick={save}>
        {busy ? <span className="spinner" /> : 'Add it'}
      </button>
    }>
      <Field label="Shape" required hint={shape?.description}>
        <select className="input" value={shapeCode}
                onChange={(e) => { setShapeCode(e.target.value); setRaw({}) }}>
          {shapes.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
      </Field>

      <Field label="What is it" required hint="Main body, top flare, wheel well">
        <input className="input" value={label} placeholder={shape?.label}
               onChange={(e) => setLabel(e.target.value)} />
      </Field>

      <div className="row" style={{ gap: 10 }}>
        <Field label="Counts as">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="base">Base</option>
            <option value="addition">Added</option>
            <option value="deduction">Deducted</option>
          </select>
        </Field>
        <Field label="How many">
          <input className="input" inputMode="numeric" value={quantity}
                 onChange={(e) => setQuantity(e.target.value)} />
        </Field>
      </div>

      {schema.map((d) => {
        const inches = toInches(raw[d.key])
        return (
          <Field key={d.key} label={d.label} required={d.required !== false}
                 hint={inches != null
                   ? `${fmt.number(inches, 2)} inches · ${feetAndInches(inches)}`
                   : d.help || "Inches, or feet and inches like 22' 6"}>
            <input className="input" inputMode="decimal" value={raw[d.key] || ''}
                   placeholder="0"
                   onChange={(e) => setRaw({ ...raw, [d.key]: e.target.value })} />
          </Field>
        )
      })}

      {problem && <div className="banner red">{problem}</div>}

      {!problem && preview && (
        <div className="card">
          <div className="dim" style={{ fontSize: 11.5 }}>This section</div>
          <div style={{ fontSize: 22, fontWeight: 660 }}>
            {fmt.int(preview.total_cubic_inches)}
            <span style={{ fontSize: 12, fontWeight: 400 }}> cubic inches</span>
          </div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
            {fmt.number(preview.total_cubic_feet, 1)} cubic feet ·{' '}
            {fmt.number(preview.total_cubic_yards, 2)} cubic yards
          </div>
        </div>
      )}
    </Sheet>
  )
}

function PhotoSheet({ certificationId, slot, onClose, onSaved }) {
  const { toast } = useField()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const label = (SLOTS.find(([s]) => s === slot) || [])[1] || fmt.title(slot)

  async function save() {
    setBusy(true)
    try {
      await api.post(`/certifications/${certificationId}/media`, {
        slot, storage_url: url.trim(),
      })
      toast('Attached', label)
      onSaved()
    } catch (err) {
      toast('Could not attach it', err.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <Sheet title={label} onClose={onClose} footer={
      <button className="btn primary block" disabled={busy || !url.trim()} onClick={save}>
        {busy ? <span className="spinner" /> : 'Attach'}
      </button>
    }>
      <div className="dim" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>
        The photo itself stays where your camera uploads it. This records the
        link, the same way every other document in the system works.
      </div>
      <Field label="Link" required>
        <input className="input" value={url} inputMode="url" placeholder="https://"
               onChange={(e) => setUrl(e.target.value)} />
      </Field>
    </Sheet>
  )
}

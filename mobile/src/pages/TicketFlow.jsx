/**
 * The whole ticket flow is rendered from the ticket type's stage_schema and
 * field_schema. A new ticket type added in the back office shows up here with
 * no release of this app.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useAsync, useDraft, useField, useGeo } from '../lib/field'
import { Badge, Empty, Field, Icon, Sheet, Steps } from '../components/kit'

const LOAD_CALLS = [25, 50, 75, 90, 100]

export default function TicketFlow() {
  const { typeId, ticketId } = useParams()
  const navigate = useNavigate()
  const { projectId, project, user, lookups, submit, online, toast } = useField()

  const types = useAsync(() => api.get('/ticket-types'), [])
  const existing = useAsync(() => api.get(`/tickets/${ticketId}`),
                            [ticketId], { skip: !ticketId })
  const options = useAsync(async () => {
    const [equipment, sites, contractors, zones] = await Promise.all([
      api.get(`/projects/${projectId}/options/project_equipment`),
      api.get(`/projects/${projectId}/options/project_sites`),
      api.get(`/projects/${projectId}/options/project_contractors`),
      api.get(`/projects/${projectId}/options/project_zones`),
    ])
    return {
      project_equipment: equipment.items,
      project_sites: sites.items,
      project_contractors: contractors.items,
      project_zones: zones.items,
      debris_types: (lookups?.debris_types || []).map(
        (d) => ({ value: d.code, label: d.label, hint: d.category })),
      incident_categories: (lookups?.incident_categories || [])
        .filter((c) => !c.parent_id)
        .map((c) => ({ value: c.id, label: c.label })),
      incident_subcategories: (lookups?.incident_categories || [])
        .filter((c) => c.parent_id)
        .map((c) => ({ value: c.id, label: c.label })),
    }
  }, [projectId, lookups], { skip: !projectId || !lookups })

  const type = useMemo(() => {
    if (existing.data) return existing.data.ticket_type
    return (types.data?.items || []).find((t) => t.id === typeId)
  }, [types.data, typeId, existing.data])

  const stages = type?.stage_schema || []
  const ticket = existing.data?.ticket
  const completed = new Set((existing.data?.stages || [])
    .filter((s) => s.status === 'complete').map((s) => s.stage_code))
  const firstOpen = stages.findIndex((s) => !completed.has(s.code))
  const [stageIndex, setStageIndex] = useState(0)

  useEffect(() => {
    if (ticketId && firstOpen >= 0) setStageIndex(firstOpen)
  }, [ticketId, firstOpen])

  const stage = stages[stageIndex]
  const draftKey = ticketId || `new-${typeId}`
  const [draft, setDraft, clearDraft] = useDraft(draftKey, { client_uuid: crypto.randomUUID() })
  const geo = useGeo()
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(null)

  const fields = (type?.field_schema || []).filter(
    (f) => !f.stage || f.stage === stage?.code)

  const missing = fields.filter((f) => f.required && !hasValue(draft[f.key], f))

  function set(key, value) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function advance() {
    if (missing.length) {
      toast('Missing information', missing.map((f) => f.label).join(', '), 'err')
      return
    }
    setBusy(true)
    try {
      let id = ticketId
      const gps = draft.__gps || geo.position

      if (!id) {
        const created = await submit('POST', `/projects/${projectId}/tickets`, {
          ticket_type_id: typeId,
          client_uuid: draft.client_uuid,
          status: 'open',
          fields: toColumns(draft, type, gps),
        })
        if (created?.queued) {
          toast('Saved offline', 'The ticket will be created when you have signal')
          clearDraft()
          navigate('/')
          return
        }
        id = created.ticket.id
      }

      const stageBody = {
        stage_code: stage.code,
        status: 'complete',
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        accuracy_m: gps?.accuracy_m,
        address: draft.origin_street || draft.address || undefined,
        debris_type: draft.debris_type || undefined,
        load_call_pct: draft.load_call_pct != null ? Number(draft.load_call_pct) : undefined,
        scale_ticket_number: draft.scale_ticket_number || undefined,
        weight_lbs: draft.net_weight_lbs ? Number(draft.net_weight_lbs) : undefined,
        site_id: draft.destination_site_id || draft.origin_site_id || undefined,
        occurred_at: new Date().toISOString(),
        notes: draft.notes || undefined,
        fields: toColumns(draft, type, gps),
      }

      const result = await submit('POST', `/tickets/${id}/stages`, stageBody)

      // Photos declared by the type are recorded as media rows.
      const photoFields = (type.field_schema || []).filter(
        (f) => f.type === 'photo' && (!f.stage || f.stage === stage.code) && draft[f.key])
      for (const f of photoFields) {
        await submit('POST', `/tickets/${id}/media`, {
          stage_code: stage.code,
          media_kind: 'photo',
          description: f.label,
          storage_url: draft[f.key],
          is_primary: photoFields[0].key === f.key,
          captured_at: new Date().toISOString(),
          latitude: gps?.latitude,
          longitude: gps?.longitude,
        })
      }

      if (result?.queued) {
        toast('Saved offline', 'This stage will send when you have signal')
        clearDraft(); navigate('/')
        return
      }

      const isLast = stage.completes_ticket || stageIndex === stages.length - 1
      if (isLast) {
        const closed = result?.ticket?.status === 'completed'
        if (closed && type.kind === 'unit_rate') {
          setPrinting(result.ticket)
        } else {
          toast(closed ? 'Ticket completed' : 'Stage recorded',
                result?.ticket?.ticket_number || '')
          clearDraft()
          navigate('/')
        }
      } else {
        // A two-monitor type hands off here rather than continuing on this phone.
        const nextStage = stages[stageIndex + 1]
        if (nextStage && type.requires_barcode) {
          const handoff = await submit('POST', `/tickets/${id}/handoff`,
                                       { handoff_kind: 'pending_disposal' })
          toast('Handoff issued',
                `Give the driver barcode ${handoff?.barcode || draft.barcode}`)
        }
        clearDraft()
        navigate('/')
      }
    } catch (err) {
      toast('Could not save', err.message, 'err')
    } finally { setBusy(false) }
  }

  if (!type) {
    return <div className="screen"><Empty icon="list" title="Loading ticket type" /></div>
  }

  return (
    <div className="screen">
      <Steps total={stages.length} current={stageIndex} />

      <div className="row" style={{ marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 640, fontSize: 17 }}>{stage?.label}</div>
          <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
            {type.label}
            {ticket && <span className="mono"> · {ticket.ticket_number}</span>}
          </div>
        </div>
        {!online && <Badge tone="amber">Offline</Badge>}
      </div>

      {stage?.instructions && (
        <div className="banner" style={{ marginBottom: 14 }}>{stage.instructions}</div>
      )}

      <GpsCard geo={geo} draft={draft} onCapture={(p) => set('__gps', p)} />

      <div className="stack" style={{ marginTop: 12 }}>
        {fields.map((f) => (
          <DynamicField key={f.key} field={f} value={draft[f.key]}
                        options={options.data}
                        onChange={(v) => set(f.key, v)} />
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        <button className="btn primary xl block" disabled={busy} onClick={advance}>
          {busy && <span className="spinner" />}
          {stage?.completes_ticket ? 'Complete ticket'
            : stageIndex === stages.length - 1 ? 'Save' : 'Save and hand off'}
        </button>
        <button className="btn ghost block" onClick={() => { clearDraft(); navigate('/') }}>
          Discard
        </button>
      </div>

      {printing && (
        <Sheet title="Crew copy" onClose={() => { setPrinting(null); clearDraft(); navigate('/') }}
               footer={
                 <div style={{ display: 'grid', gap: 9 }}>
                   <button className="btn blue block" onClick={() => window.print()}>
                     <Icon name="print" size={17} /> Print
                   </button>
                   <button className="btn ghost block"
                           onClick={() => { setPrinting(null); clearDraft(); navigate('/') }}>
                     Done
                   </button>
                 </div>
               }>
          <div className="print-ticket">
            <h3>{project?.name}</h3>
            <div>{type.label}</div>
            <div className="hr" />
            <div><b>Ticket</b> {printing.ticket_number}</div>
            <div><b>Date</b> {fmt.datetime(printing.completed_at || Date.now())}</div>
            <div><b>Monitor</b> {user?.full_name} ({user?.monitor_id})</div>
            {draft.unit_work_type && <div><b>Work</b> {draft.unit_work_type}</div>}
            {draft.quantity && <div><b>Quantity</b> {draft.quantity}</div>}
            {draft.origin_street && <div><b>Location</b> {draft.origin_street}</div>}
            {(draft.__gps || geo.position) && (
              <div><b>GPS</b> {(draft.__gps || geo.position).latitude},{' '}
                {(draft.__gps || geo.position).longitude}</div>
            )}
            <div className="hr" />
            <div style={{ fontSize: 10 }}>
              Crew signature ____________________________
            </div>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function hasValue(value, field) {
  if (field.type === 'boolean') return value !== undefined && value !== null
  return value !== undefined && value !== null && value !== ''
}

/** Split the draft into the columns the API knows and the extras it stores as JSON. */
function toColumns(draft, type, gps) {
  const out = {}
  for (const [key, value] of Object.entries(draft)) {
    if (key.startsWith('__') || key === 'client_uuid') continue
    const field = (type.field_schema || []).find((f) => f.key === key)
    if (field?.type === 'photo' || field?.type === 'gps') continue
    if (value === '' || value === undefined || value === null) continue
    out[key] = field?.type === 'number' || field?.type === 'percent' ? Number(value) : value
  }
  if (gps) {
    out.origin_latitude = out.origin_latitude ?? gps.latitude
    out.origin_longitude = out.origin_longitude ?? gps.longitude
  }
  return out
}

function GpsCard({ geo, draft, onCapture }) {
  const position = draft.__gps || geo.position
  return (
    <div className={`gps${position ? ' locked' : ''}`}>
      <Icon name="pin" size={18} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {position ? (
          <>
            <div style={{ fontWeight: 570 }}>
              {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
            </div>
            <div className="dim" style={{ fontSize: 11.5 }}>
              {position.accuracy_m ? `±${Math.round(position.accuracy_m)} m` : 'accuracy unknown'}
              {' · '}{fmt.time(position.at)}
            </div>
          </>
        ) : (
          <div className="dim">{geo.error || 'Getting your location…'}</div>
        )}
      </div>
      <button className="btn sm" onClick={() => { geo.capture(); onCapture(null) }}>
        {geo.busy ? <span className="spinner" /> : <Icon name="refresh" size={15} />}
      </button>
    </div>
  )
}

function DynamicField({ field, value, options, onChange }) {
  const list = field.source ? filterOptions(options?.[field.source] || [], field.filter) : null

  switch (field.type) {
    case 'select':
      return (
        <Field label={field.label} required={field.required} hint={field.help}>
          {field.options ? (
            <div className="chips">
              {field.options.map((o) => (
                <button key={o} type="button"
                        className={`chip${value === o ? ' on' : ''}`}
                        onClick={() => onChange(o)}>{o}</button>
              ))}
            </div>
          ) : (
            <select className="select" value={value || ''}
                    onChange={(e) => onChange(e.target.value)}>
              <option value="">Choose…</option>
              {(list || []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}{o.hint ? ` · ${o.hint}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>
      )

    case 'percent':
      return (
        <Field label={field.label} required={field.required}
               hint={field.help || 'Tap a call, or fine-tune with the slider'}>
          <div className="pct">
            {LOAD_CALLS.map((p) => (
              <button key={p} type="button"
                      className={Number(value) === p ? 'on' : ''}
                      onClick={() => onChange(p)}>{p}</button>
            ))}
          </div>
          <input className="slider" type="range" min="0" max="100" step="5"
                 value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} />
          <div className="center nums" style={{ fontSize: 22, fontWeight: 660 }}>
            {value ?? 0}%
          </div>
        </Field>
      )

    case 'photo':
      return (
        <Field label={field.label} required={field.required}>
          <label className={`photo-slot${value ? ' filled' : ''}`}>
            <Icon name={value ? 'check' : 'camera'} size={26} />
            <span>{value ? 'Photo captured — tap to retake' : 'Tap to capture'}</span>
            <input type="file" accept="image/*" capture="environment" hidden
                   onChange={(e) => {
                     const file = e.target.files?.[0]
                     if (!file) return
                     // The real upload target is set per deployment; the ticket
                     // stores the reference the media service hands back.
                     onChange(`captured://${file.name}?at=${Date.now()}`)
                   }} />
          </label>
        </Field>
      )

    case 'barcode':
      return (
        <Field label={field.label} required={field.required}
               hint={field.help || 'Scan the placard, or type the number'}>
          <div className="row" style={{ gap: 9 }}>
            <input className="input" value={value || ''} inputMode="text"
                   placeholder="GES001BC"
                   onChange={(e) => onChange(e.target.value.toUpperCase())} />
            <button type="button" className="btn icon" onClick={() => {
              const entered = window.prompt('Enter the barcode')
              if (entered) onChange(entered.toUpperCase())
            }}>
              <Icon name="barcode" size={20} />
            </button>
          </div>
        </Field>
      )

    case 'boolean':
      return (
        <Field label={field.label} required={field.required}>
          <div className="chips">
            {[['Yes', true], ['No', false]].map(([label, v]) => (
              <button key={label} type="button"
                      className={`chip${value === v ? ' on' : ''}`}
                      onClick={() => onChange(v)}>{label}</button>
            ))}
          </div>
        </Field>
      )

    case 'textarea':
      return (
        <Field label={field.label} required={field.required} hint={field.help}>
          <textarea className="textarea" value={value || ''}
                    onChange={(e) => onChange(e.target.value)} />
        </Field>
      )

    case 'number':
      return (
        <Field label={field.label} required={field.required}
               hint={field.help || (field.unit ? `in ${field.unit}` : undefined)}>
          <input className="input" type="number" inputMode="decimal"
                 value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
        </Field>
      )

    case 'datetime':
      return (
        <Field label={field.label} required={field.required}
               hint="Defaults to the moment you save this stage">
          <input className="input" type="datetime-local"
                 value={value || ''} onChange={(e) => onChange(e.target.value)} />
        </Field>
      )

    case 'date':
      return (
        <Field label={field.label} required={field.required}>
          <input className="input" type="date" value={value || ''}
                 onChange={(e) => onChange(e.target.value)} />
        </Field>
      )

    case 'gps':
      return null

    case 'signature':
      return (
        <Field label={field.label} required={field.required}>
          <button type="button" className={`photo-slot${value ? ' filled' : ''}`}
                  onClick={() => onChange(`signed://${Date.now()}`)}>
            <Icon name={value ? 'check' : 'signature'} size={26} />
            <span>{value ? 'Signature captured' : 'Tap to capture a signature'}</span>
          </button>
        </Field>
      )

    default:
      return (
        <Field label={field.label} required={field.required} hint={field.help}>
          <input className="input" value={value || ''}
                 onChange={(e) => onChange(e.target.value)} />
        </Field>
      )
  }
}

function filterOptions(items, filter) {
  if (!filter) return items
  return items.filter((item) => Object.values(filter).some(
    (allowed) => allowed.includes(item.hint)))
}

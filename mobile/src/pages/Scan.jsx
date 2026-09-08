import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useField } from '../lib/field'
import { Badge, Empty, Field, Icon } from '../components/kit'

export default function Scan() {
  const { projectId, toast } = useField()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  async function lookup(value) {
    const barcode = (value || code).trim()
    if (!barcode) return
    setBusy(true); setResult(null)
    try {
      setResult(await api.get(`/projects/${projectId}/scan/${encodeURIComponent(barcode)}`))
    } catch (err) {
      toast('Nothing found', err.message, 'err')
    } finally { setBusy(false) }
  }

  return (
    <div className="screen">
      <div className="scan-frame" style={{ marginBottom: 16 }}>
        <div className="center" style={{ color: 'var(--text-dim)' }}>
          <Icon name="barcode" size={44} strokeWidth={1.3} />
          <div style={{ marginTop: 10, fontSize: 13 }}>
            Point the camera at the placard
          </div>
          <div style={{ fontSize: 11.5, marginTop: 4 }}>
            or enter the number below
          </div>
        </div>
      </div>

      <Field label="Barcode or truck number">
        <div className="row" style={{ gap: 9 }}>
          <input className="input" value={code} autoFocus autoCapitalize="characters"
                 placeholder="GES001BC"
                 onChange={(e) => setCode(e.target.value.toUpperCase())}
                 onKeyDown={(e) => e.key === 'Enter' && lookup()} />
          <button className="btn primary" disabled={busy || !code} onClick={() => lookup()}>
            {busy ? <span className="spinner" /> : 'Look up'}
          </button>
        </div>
      </Field>

      {result && (
        <div style={{ marginTop: 18 }}>
          {result.handoff ? (
            <div className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <Badge tone="amber">Waiting for you</Badge>
                <div className="spacer" />
                <span className="mono dim" style={{ fontSize: 12 }}>
                  {result.handoff.ticket_number}
                </span>
              </div>
              <div style={{ fontWeight: 620, fontSize: 16 }}>
                {result.handoff.ticket_type_label}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>
                Issued by {result.handoff.issued_by_name || 'another monitor'}
                {' '}{fmt.ago(result.handoff.issued_at)}.
                {result.handoff.debris_type && ` Debris ${result.handoff.debris_type}.`}
                {result.handoff.certified_capacity_cy
                  && ` Certified ${fmt.number(result.handoff.certified_capacity_cy, 0)} CY.`}
              </div>
              {result.handoff.origin_address && (
                <div className="dim" style={{ fontSize: 12.5, marginTop: 6 }}>
                  Loaded at {result.handoff.origin_address}
                </div>
              )}
              <button className="btn primary xl block" style={{ marginTop: 14 }}
                      onClick={() => navigate(`/ticket/${result.handoff.ticket_id}`)}>
                Claim and finish this load
              </button>
            </div>
          ) : result.equipment ? (
            <div className="card">
              <div className="row" style={{ marginBottom: 10 }}>
                <Badge tone="blue">Truck on this project</Badge>
              </div>
              <div style={{ fontWeight: 640, fontSize: 18 }}>
                {result.equipment.unit_number}
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {result.equipment.contractor_name}
                {result.equipment.make && ` · ${result.equipment.make}`}
                {result.equipment.model && ` ${result.equipment.model}`}
              </div>
              <div className="row wrap" style={{ gap: 7, marginTop: 12 }}>
                {result.equipment.capacity_cy && (
                  <Badge tone="green">
                    {fmt.number(result.equipment.capacity_cy, 0)} CY certified
                  </Badge>
                )}
                {result.equipment.certified_on && (
                  <Badge>Certified {fmt.date(result.equipment.certified_on)}</Badge>
                )}
              </div>
              <div className="banner" style={{ marginTop: 14 }}>
                No load is waiting on this placard. Start a new ticket from the home
                screen and pick this truck.
              </div>
              <button className="btn block" style={{ marginTop: 12 }}
                      onClick={() => navigate('/')}>
                Back to ticket types
              </button>
            </div>
          ) : null}
        </div>
      )}

      {!result && !busy && (
        <div style={{ marginTop: 20 }}>
          <Empty icon="barcode" title="Scan to continue a load">
            When a loading monitor hands a driver a barcode, scanning it here brings up
            that exact ticket so you can close it at the site.
          </Empty>
        </div>
      )}
    </div>
  )
}

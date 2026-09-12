/**
 * The parts of a review.
 *
 * The reviewer's job is not checking whether fields are filled in. It is:
 *
 *   "Does the evidence and information collected on this record make sense,
 *    and does it support what the record says happened?"
 *
 * So each of these puts one kind of evidence in front of a person at a size
 * they can judge, with what was expected beside what arrived. The map exists
 * because that comparison currently happens across two browser windows.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt } from '../lib/api'
import { Icon } from './ui'

/* ------------------------------------------------------------------ map */
/**
 * Satellite imagery, the ticket, and the rest of that monitor and truck's day.
 *
 * "The reviewer has the ticket system and GeoPortal open in separate browser
 *  tabs/windows and visually compares the information." This is that
 * comparison in one place: the load point on imagery, the disposal site, the
 * line between them, and the other tickets from the same monitor, truck and
 * trailer combination that day, numbered in the order they happened.
 *
 * The basemap is a URL so a self hosted install can point at an internal tile
 * server. Without tiles the panel still draws the points and the haul line on
 * a plain ground, which is worse than imagery and better than nothing.
 */
const TILES = import.meta.env.VITE_MAP_TILES
  || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const TILE_CREDIT = import.meta.env.VITE_MAP_CREDIT || 'Esri World Imagery'

let leafletPromise = null
function loadLeaflet() {
  if (!leafletPromise) leafletPromise = import('leaflet')
  return leafletPromise
}

export function ReviewMap({ origin, destination, track, tall, onPick }) {
  const holder = useRef(null)
  const [failed, setFailed] = useState(false)

  const points = useMemo(() => {
    const out = []
    if (origin?.latitude != null) {
      out.push({ kind: 'origin', lat: Number(origin.latitude),
                 lon: Number(origin.longitude),
                 label: origin.address || origin.street || 'Load point' })
    }
    if (destination?.latitude != null) {
      out.push({ kind: 'destination', lat: Number(destination.latitude),
                 lon: Number(destination.longitude),
                 label: destination.name || 'Disposal site' })
    }
    ;(track || []).forEach((t, i) => {
      if (t.origin_latitude == null || t.is_this_one) return
      out.push({ kind: 'other', lat: Number(t.origin_latitude),
                 lon: Number(t.origin_longitude), n: i + 1, id: t.id,
                 label: `${t.ticket_number} · ${fmt.time(t.origin_at)}`
                        + (t.unit_number ? ` · ${t.unit_number}` : '') })
    })
    return out
  }, [origin, destination, track])

  useEffect(() => {
    let map = null
    let dead = false
    if (!points.length || !holder.current) return undefined

    loadLeaflet().then((mod) => {
      if (dead || !holder.current) return
      const L = mod.default || mod
      map = L.map(holder.current, { zoomControl: true, attributionControl: false })

      L.tileLayer(TILES, { maxZoom: 19, crossOrigin: true })
        .on('tileerror', () => setFailed(true))
        .addTo(map)

      const marks = []
      points.forEach((p) => {
        const tone = p.kind === 'origin' ? 'var(--green)'
          : p.kind === 'destination' ? 'var(--red)' : 'var(--accent)'
        const inner = p.kind === 'other' ? String(p.n) : ''
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-pin" style="background:${tone}">${inner}</div>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        })
        const m = L.marker([p.lat, p.lon], { icon, title: p.label }).addTo(map)
        m.bindTooltip(p.label, { direction: 'top', offset: [0, -12] })
        if (p.id && onPick) m.on('click', () => onPick(p.id))
        marks.push(m)
      })

      const o = points.find((p) => p.kind === 'origin')
      const d = points.find((p) => p.kind === 'destination')
      if (o && d) {
        L.polyline([[o.lat, o.lon], [d.lat, d.lon]],
                   { color: 'var(--accent)', weight: 2, dashArray: '6 5',
                     opacity: 0.85 }).addTo(map)
      }

      const group = L.featureGroup(marks)
      map.fitBounds(group.getBounds().pad(0.35), { maxZoom: 17 })
    }).catch(() => setFailed(true))

    return () => { dead = true; if (map) map.remove() }
  }, [points, onPick])

  if (!points.length) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div className="row" style={{ gap: 8, color: 'var(--amber)' }}>
          <Icon name="alert" size={15} />
          <b>Nothing to put on a map</b>
        </div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 5 }}>
          No coordinates were recorded on this record, so nothing can confirm
          where it happened. That is itself a finding.
        </div>
      </div>
    )
  }

  return (
    <div className={`review-map${tall ? ' tall' : ''}`}>
      <div ref={holder} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-note">
        {failed
          ? 'Imagery did not load. Points and the haul line are still plotted.'
          : `Green is the load point, red the site, numbered pins the rest of the day. ${TILE_CREDIT}.`}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- time */
/**
 * "The question is not: is a time present? The question is: does the sequence
 *  of events and the amount of time between events make sense?"
 *
 * So the gap is the thing being displayed, not the timestamps either side of
 * it. A gap that does not fit the distance is called out in the gap itself.
 */
export function TimeSequence({ sequence, expectedMinutes }) {
  if (!sequence?.length) {
    return <div className="dim" style={{ fontSize: 13 }}>No times recorded.</div>
  }
  return (
    <div className="gap-line" style={{ flexDirection: 'column' }}>
      {sequence.map((step, i) => (
        <div key={`${step.label}-${i}`}>
          {i > 0 && step.gap_minutes != null && (
            <div className={`gap-join${
              expectedMinutes && step.gap_minutes < expectedMinutes ? ' odd' : ''}`}>
              <Icon name="clock" size={12} />
              {fmt.number(step.gap_minutes, 0)} minutes later
              {expectedMinutes && step.gap_minutes < expectedMinutes && (
                <> · the distance needs about {fmt.number(expectedMinutes, 0)}</>
              )}
            </div>
          )}
          <div className="gap-step">
            <span className="what">{step.label}</span>
            <span className="at dim nums">{fmt.datetime(step.at)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- evidence */
/**
 * Photographs at a size somebody can judge, in the order the work happened,
 * with a labelled gap wherever one was required and did not arrive.
 *
 * "C18: the images are just icons, i cant actually see anything" was fixed
 * with a thumbnail grid. This goes further: a reviewer should not have to know
 * which photograph was supposed to be where.
 */
export function EvidenceStrip({ required, media, onOpen }) {
  const bySlot = useMemo(() => {
    const out = {}
    ;(media || []).forEach((m) => {
      const key = m.slot || m.stage_code || 'other'
      ;(out[key] = out[key] || []).push(m)
    })
    return out
  }, [media])

  const wanted = required || []
  const seen = new Set(wanted.map((r) => r.slot))
  const extras = Object.entries(bySlot).filter(([slot]) => !seen.has(slot))

  if (!wanted.length && !extras.length) {
    return (
      <div className="dim" style={{ fontSize: 13 }}>
        No photographs were required on this record type, and none were attached.
      </div>
    )
  }

  return (
    <div className="shot-row">
      {wanted.map((req) => {
        const shots = bySlot[req.slot] || []
        if (!shots.length) {
          return (
            <div key={req.slot} className="shot gap">
              <div className="placeholder">
                <Icon name="camera" size={22} />
                <div><b>{req.label}</b></div>
                <div>Required at the {fmt.title(req.stage || '')} stage, and
                     nothing was collected</div>
              </div>
            </div>
          )
        }
        return shots.map((m) => (
          <button key={m.id} type="button" className="shot" onClick={() => onOpen(m)}>
            <img src={m.thumbnail_url || m.storage_url} alt={req.label}
                 loading="lazy"
                 onError={(e) => { e.currentTarget.classList.add('broken') }} />
            <div className="meta">
              <div><b>{req.label}</b></div>
              <div className="when">
                {fmt.datetime(m.captured_at || m.created_at)}
                {m.description && ` · ${m.description}`}
              </div>
            </div>
          </button>
        ))
      })}

      {extras.map(([slot, shots]) => shots.map((m) => (
        <button key={m.id} type="button" className="shot" onClick={() => onOpen(m)}>
          <img src={m.thumbnail_url || m.storage_url} alt={slot} loading="lazy"
               onError={(e) => { e.currentTarget.classList.add('broken') }} />
          <div className="meta">
            <div><b>{m.description || fmt.title(slot)}</b></div>
            <div className="when">
              {fmt.datetime(m.captured_at || m.created_at)} · not required
            </div>
          </div>
        </button>
      )))}
    </div>
  )
}

/* ------------------------------------------------------------- lightbox */
export function Lightbox({ items, index, onIndex, onClose }) {
  const item = items[index]
  const [failed, setFailed] = useState(false)

  useEffect(() => { setFailed(false) }, [index])
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      if (e.key === 'ArrowRight') onIndex((i) => (i + 1) % items.length)
      if (e.key === 'ArrowLeft') onIndex((i) => (i - 1 + items.length) % items.length)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [items.length, onClose, onIndex])

  if (!item) return null
  const url = item.storage_url

  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lightbox-bar">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 570 }}>
            {item.description || fmt.title(item.slot || item.media_kind || 'Photo')}
          </div>
          <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
            {fmt.title(item.stage_code || item.slot || '')}
            {item.captured_at && ` · ${fmt.datetime(item.captured_at)}`}
            {items.length > 1 && ` · ${index + 1} of ${items.length}`}
          </div>
        </div>
        <div className="spacer" />
        {url && (
          <a className="btn sm" href={url} target="_blank" rel="noreferrer">
            <Icon name="external" size={13} /> Open original
          </a>
        )}
        <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>
      <div className="lightbox-stage">
        {items.length > 1 && (
          <button className="lightbox-step" aria-label="Previous image"
                  onClick={() => onIndex((i) => (i - 1 + items.length) % items.length)}>
            <Icon name="chevron" size={20} style={{ transform: 'rotate(180deg)' }} />
          </button>
        )}
        {failed || !url ? (
          <div className="photo-missing big">
            <Icon name="camera" size={34} />
            <span>{url ? 'This image will not load' : 'No link was recorded'}</span>
            {url && <code className="mono">{url}</code>}
          </div>
        ) : (
          <img src={url} alt={item.description || 'Evidence'}
               onError={() => setFailed(true)} />
        )}
        {items.length > 1 && (
          <button className="lightbox-step" aria-label="Next image"
                  onClick={() => onIndex((i) => (i + 1) % items.length)}>
            <Icon name="chevron" size={20} />
          </button>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- small parts */
export const SEVERITY_TONE = {
  serious: 'red', review: 'amber', info: 'blue', none: undefined,
}

/** A flag, in the reviewer's words, with the numbers that raised it. */
export function FlagCard({ flag }) {
  const detail = Object.entries(flag.detail || {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
  return (
    <div className="card" style={{
      padding: 12,
      borderColor: flag.severity === 'serious' ? 'var(--red)'
        : flag.severity === 'review' ? 'var(--amber)' : undefined,
      background: flag.severity === 'serious' ? 'var(--red-soft)'
        : flag.severity === 'review' ? 'var(--amber-soft)' : undefined,
      opacity: flag.cleared_at ? 0.55 : 1,
    }}>
      <div className="row" style={{ gap: 8 }}>
        <Icon name="alert" size={14}
              style={{ color: `var(--${SEVERITY_TONE[flag.severity] || 'text-muted'})` }} />
        <b style={{ fontSize: 13 }}>{flag.label}</b>
        {flag.cleared_at && <span className="badge">Settled</span>}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.6 }}>
        {flag.description}
      </div>
      {detail.length > 0 && (
        <div className="row wrap nums" style={{ gap: 6, marginTop: 8 }}>
          {detail.map(([k, v]) => (
            <span key={k} className="dim-chip">
              {fmt.title(k)} {Array.isArray(v) ? v.join(', ') : String(v)}
            </span>
          ))}
        </div>
      )}
      {flag.cleared_reason && (
        <div className="dim" style={{ fontSize: 11.5, marginTop: 6 }}>
          {flag.cleared_reason}
        </div>
      )}
    </div>
  )
}

/** How often this has come back, from whom. */
export function RepeatChip({ repeat }) {
  return (
    <span className="repeat-chip" title={
      `${repeat.occurrences} in the last ${repeat.window_days} days from `
      + `${repeat.party_name || 'this source'}`}>
      <Icon name="refresh" size={11} />
      {repeat.occurrences}× {repeat.label.toLowerCase()}
    </span>
  )
}

/**
 * The parts of a measurement worksheet.
 *
 * A monitor is standing at a trailer with a tape measure, reading numbers off
 * it into a device, and writing the same numbers onto a paper form. Three
 * things follow from that and shape everything here.
 *
 * The drawing comes first. "Interior width" means nothing next to a text box
 * and everything next to a picture of the trailer with that dimension marked,
 * so every shape has a diagram and the dimension being typed is picked out on
 * it.
 *
 * Feet and inches are what people say. Nobody at a trailer says 264 inches,
 * they say twenty two feet, so the field takes either and says back what it
 * understood.
 *
 * Cubic inches are the answer that goes on the paper. Cubic yards price the
 * load, but the figure the monitor writes down is cubic inches, so it is the
 * one shown largest.
 */
import { useMemo, useState } from 'react'
import { fmt } from '../lib/api'

/* --------------------------------------------------------------- drawings */
/**
 * One drawing per shape, with the dimension being typed picked out.
 *
 * Deliberately schematic. This is not a picture of a truck, it is a picture of
 * where to put the tape.
 */
export function ShapeDiagram({ shape, active, height = 132 }) {
  const on = (key) => (active === key ? 'var(--accent)' : 'var(--text-muted)')
  const w = (key) => (active === key ? 2.2 : 1.2)
  const label = { fontSize: 7, fill: 'currentColor' }

  const body = {
    box: (
      <>
        <path d="M18 78 L18 34 L92 34 L92 78 Z" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M18 34 L30 22 L104 22 L92 34" fill="none"
              stroke="var(--line-strong)" strokeWidth="1.2" />
        <path d="M92 34 L104 22 L104 66 L92 78" fill="none"
              stroke="var(--line-strong)" strokeWidth="1.2" />
        <path d="M18 84 L92 84" stroke={on('length')} strokeWidth={w('length')} />
        <path d="M10 78 L10 34" stroke={on('height')} strokeWidth={w('height')} />
        <path d="M96 82 L108 70" stroke={on('width')} strokeWidth={w('width')} />
        <text x="52" y="94" textAnchor="middle" style={label} fill={on('length')}>length</text>
        <text x="4" y="58" textAnchor="middle" style={label} fill={on('height')}
              transform="rotate(-90 4 58)">height</text>
        <text x="110" y="80" style={label} fill={on('width')}>width</text>
      </>
    ),
    'taper-side': (
      <>
        <path d="M26 78 L14 30 L102 30 L90 78 Z" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M14 24 L102 24" stroke={on('width_top')} strokeWidth={w('width_top')} />
        <path d="M26 84 L90 84" stroke={on('width_bottom')} strokeWidth={w('width_bottom')} />
        <path d="M112 78 L112 30" stroke={on('height')} strokeWidth={w('height')} />
        <text x="58" y="18" textAnchor="middle" style={label} fill={on('width_top')}>width at the top</text>
        <text x="58" y="94" textAnchor="middle" style={label} fill={on('width_bottom')}>width at the floor</text>
        <text x="116" y="56" style={label} fill={on('height')}>height</text>
        <text x="58" y="58" textAnchor="middle" style={label} fill={on('length')}>length runs back</text>
      </>
    ),
    'taper-end': (
      <>
        <path d="M18 78 L18 30 L96 46 L96 78 Z" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M18 24 L96 40" stroke={on('length_top')} strokeWidth={w('length_top')} />
        <path d="M18 84 L96 84" stroke={on('length_bottom')} strokeWidth={w('length_bottom')} />
        <path d="M10 78 L10 30" stroke={on('height')} strokeWidth={w('height')} />
        <text x="56" y="20" textAnchor="middle" style={label} fill={on('length_top')}>length at the top</text>
        <text x="56" y="94" textAnchor="middle" style={label} fill={on('length_bottom')}>length at the floor</text>
        <text x="4" y="56" textAnchor="middle" style={label} fill={on('height')}
              transform="rotate(-90 4 56)">height</text>
      </>
    ),
    prismatoid: (
      <>
        <path d="M28 78 L12 28 L104 28 L88 78 Z" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M12 28 L24 18 L116 18 L104 28" fill="none"
              stroke="var(--line-strong)" strokeWidth="1.1" />
        <path d="M12 22 L104 22" stroke={on('width_top')} strokeWidth={w('width_top')} />
        <path d="M28 84 L88 84" stroke={on('width_bottom')} strokeWidth={w('width_bottom')} />
        <text x="58" y="14" textAnchor="middle" style={label} fill={on('width_top')}>top opening</text>
        <text x="58" y="94" textAnchor="middle" style={label} fill={on('width_bottom')}>floor</text>
        <text x="58" y="56" textAnchor="middle" style={label}>measure both, top and floor</text>
      </>
    ),
    'round-bottom': (
      <>
        <path d="M20 30 L20 58 A 32 22 0 0 0 88 58 L88 30"
              fill="var(--surface-2)" stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M20 24 L88 24" stroke={on('width')} strokeWidth={w('width')} />
        <path d="M100 58 L100 30" stroke={on('straight_height')}
              strokeWidth={w('straight_height')} />
        <path d="M54 58 L54 80" stroke={on('curve_depth')} strokeWidth={w('curve_depth')} />
        <path d="M20 58 L88 58" stroke="var(--line)" strokeWidth="0.8" strokeDasharray="3 3" />
        <text x="54" y="18" textAnchor="middle" style={label} fill={on('width')}>width at the widest point</text>
        <text x="104" y="46" style={label} fill={on('straight_height')}>straight side</text>
        <text x="58" y="92" style={label} fill={on('curve_depth')}>depth of the curve</text>
      </>
    ),
    'half-cylinder': (
      <>
        <path d="M20 44 A 34 34 0 0 0 88 44 Z" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M20 38 L88 38" stroke={on('diameter')} strokeWidth={w('diameter')} />
        <text x="54" y="32" textAnchor="middle" style={label} fill={on('diameter')}>diameter</text>
        <text x="54" y="92" textAnchor="middle" style={label} fill={on('length')}>length runs back</text>
      </>
    ),
    cylinder: (
      <>
        <ellipse cx="54" cy="30" rx="30" ry="9" fill="var(--surface-2)"
                 stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M24 30 L24 72 A 30 9 0 0 0 84 72 L84 30" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M24 24 L84 24" stroke={on('diameter')} strokeWidth={w('diameter')} />
        <path d="M94 72 L94 30" stroke={on('height')} strokeWidth={w('height')} />
        <text x="54" y="18" textAnchor="middle" style={label} fill={on('diameter')}>diameter</text>
        <text x="98" y="54" style={label} fill={on('height')}>height</text>
      </>
    ),
    wedge: (
      <>
        <path d="M18 78 L18 34 L92 78 Z" fill="var(--surface-2)"
              stroke="var(--line-strong)" strokeWidth="1.4" />
        <path d="M18 84 L92 84" stroke={on('length')} strokeWidth={w('length')} />
        <path d="M10 78 L10 34" stroke={on('height')} strokeWidth={w('height')} />
        <text x="52" y="94" textAnchor="middle" style={label} fill={on('length')}>length</text>
        <text x="4" y="58" textAnchor="middle" style={label} fill={on('height')}
              transform="rotate(-90 4 58)">height</text>
      </>
    ),
  }[shape] || (
    <>
      <rect x="18" y="30" width="80" height="48" rx="3" fill="var(--surface-2)"
            stroke="var(--line-strong)" strokeWidth="1.3" strokeDasharray="4 3" />
      <text x="58" y="58" textAnchor="middle" style={label}>worked out another way</text>
    </>
  )

  return (
    <svg viewBox="0 0 132 100" style={{ width: '100%', height, display: 'block' }}
         className="dim" aria-hidden="true">
      {body}
    </svg>
  )
}

/* ------------------------------------------------------- feet and inches */
const FEET_INCHES = /^\s*(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?\s*)?$/

/** Read 264, 22ft, 22' 6 or 22'6" as inches. */
export function toInches(text) {
  const raw = String(text ?? '').trim()
  if (raw === '') return null
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw)
  const m = raw.match(FEET_INCHES)
  if (!m) return null
  const feet = Number(m[1] || 0)
  const inches = Number(m[2] || 0)
  if (!feet && !inches) return null
  return feet * 12 + inches
}

export function feetAndInches(inches) {
  const n = Number(inches || 0)
  if (!n) return ''
  const ft = Math.floor(n / 12)
  const rest = Math.round((n - ft * 12) * 100) / 100
  if (!ft) return `${rest} in`
  return rest ? `${ft} ft ${rest} in` : `${ft} ft`
}

/**
 * One dimension.
 *
 * Takes whatever the monitor types and says back what it understood, because
 * the difference between 24 and 24 feet is the difference between a reasonable
 * number and a trailer that does not fit on a road.
 */
export function DimensionInput({ spec, value, onChange, onFocus, onBlur }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  const inches = toInches(text)

  function change(next) {
    setText(next)
    onChange(toInches(next))
  }

  return (
    <div className="field">
      <label htmlFor={`dim-${spec.key}`}>
        {spec.label}
        {spec.required !== false && <span className="req">*</span>}
      </label>
      <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
        <input id={`dim-${spec.key}`} className="input" inputMode="decimal"
               style={{ maxWidth: 132 }}
               value={text} placeholder="inches, or 22' 6"
               onFocus={() => onFocus?.(spec.key)}
               onBlur={() => onBlur?.(spec.key)}
               onChange={(e) => change(e.target.value)} />
        <span className="dim nums" style={{ fontSize: 12, minWidth: 92 }}>
          {inches == null
            ? (text ? 'not a measurement' : 'in inches')
            : `${fmt.number(inches, 2)} in · ${feetAndInches(inches)}`}
        </span>
      </div>
      {spec.help && <div className="hint">{spec.help}</div>}
    </div>
  )
}

/* ----------------------------------------------------------- the totals */
/**
 * The answer, in the three units that matter, with cubic inches largest
 * because that is the figure the monitor copies onto the paper form.
 */
export function VolumeReadout({ result, compact }) {
  if (!result) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="dim" style={{ fontSize: 13 }}>
          Nothing measured yet. Add a section and the volume appears here.
        </div>
      </div>
    )
  }
  const odd = result.within_typical_range === false
  return (
    <div className="card" style={{
      padding: compact ? 12 : 16,
      borderColor: odd ? 'var(--amber)' : undefined,
      background: odd ? 'var(--amber-soft)' : undefined,
    }}>
      <div className="row" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                        letterSpacing: '0.06em' }}>Cubic inches</div>
          <div className="nums" style={{ fontSize: 26, fontWeight: 660, lineHeight: 1.1 }}>
            {fmt.int(result.total_cubic_inches)}
          </div>
        </div>
        <div>
          <div className="dim" style={{ fontSize: 11 }}>Cubic feet</div>
          <div className="nums" style={{ fontSize: 17, fontWeight: 580 }}>
            {fmt.number(result.total_cubic_feet, 1)}
          </div>
        </div>
        <div>
          <div className="dim" style={{ fontSize: 11 }}>Cubic yards</div>
          <div className="nums" style={{ fontSize: 17, fontWeight: 580 }}>
            {fmt.number(result.total_cubic_yards, 2)}
          </div>
        </div>
        <div className="spacer" />
        <div style={{ textAlign: 'right' }}>
          <div className="dim" style={{ fontSize: 11 }}>Certified capacity</div>
          <div className="nums" style={{ fontSize: 22, fontWeight: 680 }}>
            {fmt.number(result.capacity_cy, 2)}<small style={{ fontSize: 13 }}> CY</small>
          </div>
        </div>
      </div>

      <div className="dim nums" style={{ fontSize: 12, marginTop: 10 }}>
        base {fmt.int(result.base_cubic_inches)}
        {result.addition_cubic_inches > 0 && <> plus {fmt.int(result.addition_cubic_inches)} added</>}
        {result.deduction_cubic_inches > 0 && <> minus {fmt.int(result.deduction_cubic_inches)} deducted</>}
        {' '}cubic inches
      </div>

      {result.range_note && (
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--amber)' }}>
          {result.range_note} Worth a second look before you submit it.
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------- photo checklist */
export const SLOT_LABEL = {
  front: 'Truck front',
  rear: 'Truck rear',
  side: 'Truck side',
  interior: 'Interior',
  placard: 'Certification placard',
  measurement: 'Measurement',
  paper_form: 'Paper form',
  other: 'Other',
}

/**
 * Required against collected, said rather than left as an absence.
 *
 * A missing photograph renders as a labelled gap. The reviewer's question is
 * "was one supposed to be here", and a grid that only shows what arrived
 * cannot answer it.
 */
export function EvidenceChecklist({ evidence, media, labels, onOpen, onAdd }) {
  const bySlot = useMemo(() => {
    const out = {}
    ;(media || []).forEach((m) => {
      const key = m.slot || 'other'
      ;(out[key] = out[key] || []).push(m)
    })
    return out
  }, [media])

  const name = (slot) => labels?.[slot] || SLOT_LABEL[slot] || fmt.title(slot)
  const required = evidence?.required_slots || []
  const extras = Object.keys(bySlot).filter((s) => !required.includes(s))

  if (!required.length && !extras.length) {
    return (
      <div className="dim" style={{ fontSize: 13 }}>
        This record type does not require photographs, and none were attached.
      </div>
    )
  }

  return (
    <div className="evidence-grid">
      {required.map((slot) => {
        const shots = bySlot[slot] || []
        const missing = shots.length === 0
        return (
          <div key={slot} className={`evidence-slot${missing ? ' missing' : ''}`}>
            <div className="evidence-head">
              <span>{name(slot)}</span>
              {missing ? <span className="badge red">Missing</span>
                : shots.length > 1 && <span className="dim">{shots.length}</span>}
            </div>
            {missing ? (
              <button type="button" className="evidence-empty"
                      onClick={() => onAdd?.(slot)}>
                Required, and nothing was collected
              </button>
            ) : (
              <div className="evidence-shots">
                {shots.map((m) => (
                  <button key={m.id} type="button" className="evidence-shot"
                          onClick={() => onOpen?.(m)}>
                    <img src={m.thumbnail_url || m.storage_url} alt={name(slot)}
                         loading="lazy"
                         onError={(e) => { e.currentTarget.classList.add('broken') }} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}

      {extras.map((slot) => (
        <div key={slot} className="evidence-slot">
          <div className="evidence-head">
            <span>{name(slot)}</span>
            <span className="dim" style={{ fontSize: 11 }}>not required</span>
          </div>
          <div className="evidence-shots">
            {bySlot[slot].map((m) => (
              <button key={m.id} type="button" className="evidence-shot"
                      onClick={() => onOpen?.(m)}>
                <img src={m.thumbnail_url || m.storage_url} alt={name(slot)} loading="lazy"
                     onError={(e) => { e.currentTarget.classList.add('broken') }} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

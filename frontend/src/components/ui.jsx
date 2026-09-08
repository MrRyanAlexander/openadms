/** Shared presentational pieces. No data fetching lives in here. */
import { useEffect, useRef, useState } from 'react'
import { STATUS_TONE, fmt } from '../lib/api'

/* ---------------------------------------------------------------- icons */
export function Icon({ name, size = 16, strokeWidth = 1.7, ...rest }) {
  const paths = {
    dashboard: 'M4 13h7V4H4v9Zm0 7h7v-5H4v5Zm9 0h7v-9h-7v9Zm0-16v5h7V4h-7Z',
    truck: 'M3 16V6h11v10M14 9h3.5L21 12.5V16h-3M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm11 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
    rules: 'M4 6h16M4 12h10M4 18h7M18 15l2 2 3-3',
    money: 'M12 3v18M16.5 7.5c0-1.7-2-2.5-4.5-2.5s-4.5.8-4.5 2.8 2 2.5 4.5 3 4.5 1.3 4.5 3.2-2 2.8-4.5 2.8-4.5-.9-4.5-2.6',
    invoice: 'M6 3h9l5 5v13H6V3Zm9 0v5h5M9 12h7M9 16h5',
    audit: 'M12 21a9 9 0 1 0-9-9M12 7v5l3 2M3 5v5h5',
    query: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    building: 'M4 21V6l7-3v18M11 21h9V10l-9-3M7 9v.01M7 13v.01M7 17v.01M15 12v.01M15 16v.01',
    users: 'M16 20v-1.6a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 10.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM22 20v-1.6a4 4 0 0 0-3-3.87M16 3.9a4 4 0 0 1 0 7.75',
    share: 'M17 8a2.6 2.6 0 1 0 0-5.2A2.6 2.6 0 0 0 17 8Zm0 13.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2ZM6.4 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Zm2.3-3.9 6 -3.2m-6 5.8 6 3.2',
    settings: 'M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm10 3-5-5',
    plus: 'M12 5v14M5 12h14',
    check: 'm5 12.5 4.5 4.5L19 7',
    x: 'M6 6l12 12M18 6 6 18',
    chevron: 'm9 5 7 7-7 7',
    chevronDown: 'm5 9 7 7 7-7',
    alert: 'M12 9v4m0 4h.01M10.3 3.8 2.5 17.3A2 2 0 0 0 4.2 20.3h15.6a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z',
    download: 'M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4 19h16',
    trash: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13',
    external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
    pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
    camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z',
    layers: 'm12 3 9 5-9 5-9-5 9-5Zm9 9-9 5-9-5m18 4-9 5-9-5',
    refresh: 'M20 11a8 8 0 1 0-1.8 6M20 5v6h-6',
    filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5Z',
    print: 'M7 8V3h10v5M7 18H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7v-7Z',
    sun: 'M12 17.2a5.2 5.2 0 1 0 0-10.4 5.2 5.2 0 0 0 0 10.4ZM12 1.6v2.2M12 20.2v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M1.6 12h2.2M20.2 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6',
    moon: 'M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7Z',
    logout: 'M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6',
    barcode: 'M4 5v14M7 5v14M10 5v10M13 5v14M16 5v10M20 5v14',
    inbox: 'M3 12h5l2 3h4l2-3h5M3 12l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
         strokeLinejoin="round" {...rest}>
      <path d={paths[name] || paths.folder} />
    </svg>
  )
}

/* ---------------------------------------------------------------- atoms */
export function Badge({ children, tone, status }) {
  const t = tone || STATUS_TONE[status] || ''
  return <span className={`badge ${t}`}>{children ?? fmt.title(status)}</span>
}

export function Card({ title, sub, actions, children, flush, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <div className="sub">{sub}</div>}
          </div>
          <div className="spacer" />
          {actions}
        </div>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>{children}</div>
    </div>
  )
}

export function Stat({ label, value, detail, tone, unit }) {
  return (
    <div className="card stat">
      <div className="k">{label}</div>
      <div className="v" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}{unit && <small>{unit}</small>}
      </div>
      {detail && <div className="d">{detail}</div>}
    </div>
  )
}

export function Field({ label, hint, error, required, children }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {error ? <div className="err">{error}</div>
             : hint ? <div className="hint">{hint}</div> : null}
    </div>
  )
}

export function Search({ value, onChange, placeholder = 'Search' }) {
  return (
    <div className="search" style={{ minWidth: 220, flex: '0 1 320px' }}>
      <Icon name="search" size={14} />
      <input className="input" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

export function Empty({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty">
      <div className="icon"><Icon name={icon} size={42} strokeWidth={1.2} /></div>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  )
}

export function Loading({ rows = 5 }) {
  return (
    <div className="stack" style={{ padding: 16 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 34, opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  )
}

export function ErrorNote({ error, onRetry }) {
  if (!error) return null
  return (
    <div className="card" style={{ borderColor: 'var(--red)', padding: 16 }}>
      <div className="row" style={{ color: 'var(--red)', gap: 8 }}>
        <Icon name="alert" size={16} />
        <b>{error.code === 'forbidden' ? 'Not permitted' : 'Something went wrong'}</b>
      </div>
      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{error.message}</div>
      {onRetry && (
        <button className="btn sm" style={{ marginTop: 12 }} onClick={onRetry}>
          <Icon name="refresh" size={13} /> Try again
        </button>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- modal */
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <div className="spacer" />
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Drawer({ title, sub, onClose, children, actions }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer">
        <div className="card-head" style={{ padding: '16px 20px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 15 }}>{title}</h3>
            {sub && <div className="sub">{sub}</div>}
          </div>
          <div className="spacer" />
          {actions}
          <button className="btn ghost icon sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={15} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: 20, flex: 1 }}>{children}</div>
      </aside>
    </>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={value === t.key ? 'on' : ''}
                onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="dim"> ({t.count})</span>}
        </button>
      ))}
    </div>
  )
}

export function Confirm({ title, message, confirmLabel = 'Confirm', tone = 'danger',
                          onConfirm, onClose, busy }) {
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`}
                onClick={onConfirm} disabled={busy}>
          {busy && <span className="spinner" />}{confirmLabel}
        </button>
      </>
    }>
      <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.65 }}>{message}</p>
    </Modal>
  )
}

/* ---------------------------------------------------------------- charts */
const SERIES = ['#3b82f6', '#22c08a', '#f0a63a', '#9b7cf0', '#38bdf8', '#ef5f5f',
                '#2dd4bf', '#f472b6']

export function AreaChart({ data, xKey, yKey, height = 190, color = '#3b82f6',
                            format = fmt.int, label = '' }) {
  if (!data?.length) {
    return <div className="empty" style={{ padding: 30 }}>No activity in this window</div>
  }
  const w = 720
  const h = height
  const pad = { l: 46, r: 12, t: 12, b: 24 }
  const values = data.map((d) => Number(d[yKey] || 0))
  const max = Math.max(...values, 1) * 1.12
  const stepX = (w - pad.l - pad.r) / Math.max(data.length - 1, 1)
  const y = (v) => pad.t + (h - pad.t - pad.b) * (1 - v / max)
  const pts = data.map((d, i) => [pad.l + i * stepX, y(Number(d[yKey] || 0))])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad.b} L${pad.l},${h - pad.b} Z`
  const gid = `g-${yKey}-${color.slice(1)}`
  const ticks = [0, 0.5, 1].map((t) => max * t)

  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
         style={{ height, display: 'block' }} role="img" aria-label={label}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)}
                stroke="var(--line-soft)" strokeWidth="1" />
          <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end"
                fontSize="10" fill="var(--text-dim)">{format(t, 0)}</text>
        </g>
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill={color}>
          <title>{`${data[i][xKey]}: ${format(data[i][yKey])}`}</title>
        </circle>
      ))}
      {data.map((d, i) => (
        i % Math.ceil(data.length / 7) === 0 ? (
          <text key={i} x={pad.l + i * stepX} y={h - 7} textAnchor="middle"
                fontSize="10" fill="var(--text-dim)">
            {String(d[xKey]).slice(5)}
          </text>
        ) : null
      ))}
    </svg>
  )
}

export function BarList({ data, labelKey = 'label', valueKey, format = fmt.int, max }) {
  if (!data?.length) return <div className="empty" style={{ padding: 26 }}>Nothing recorded yet</div>
  const top = max || Math.max(...data.map((d) => Number(d[valueKey] || 0)), 1)
  return (
    <div>
      {data.slice(0, 9).map((d, i) => (
        <div className="bar-row" key={`${d[labelKey]}-${i}`}>
          <div className="truncate muted" title={d[labelKey]}>{d[labelKey]}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{
              width: `${Math.max((Number(d[valueKey] || 0) / top) * 100, 1.5)}%`,
              background: SERIES[i % SERIES.length],
            }} />
          </div>
          <div className="nums" style={{ textAlign: 'right' }}>{format(d[valueKey])}</div>
        </div>
      ))}
    </div>
  )
}

export function Donut({ data, labelKey = 'label', valueKey, size = 168, format = fmt.int }) {
  const total = (data || []).reduce((sum, d) => sum + Number(d[valueKey] || 0), 0)
  if (!total) return <div className="empty" style={{ padding: 26 }}>Nothing recorded yet</div>
  const r = size / 2 - 14
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="row" style={{ gap: 22, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2},${size / 2}) rotate(-90)`}>
          {data.map((d, i) => {
            const frac = Number(d[valueKey] || 0) / total
            const dash = `${(c * frac).toFixed(2)} ${(c * (1 - frac)).toFixed(2)}`
            const el = (
              <circle key={i} r={r} fill="none" stroke={SERIES[i % SERIES.length]}
                      strokeWidth="15" strokeDasharray={dash}
                      strokeDashoffset={-offset} strokeLinecap="butt">
                <title>{`${d[labelKey]}: ${format(d[valueKey])}`}</title>
              </circle>
            )
            offset += c * frac
            return el
          })}
        </g>
        <text x="50%" y="48%" textAnchor="middle" fontSize="19" fontWeight="640"
              fill="var(--text)">{format(total)}</text>
        <text x="50%" y="62%" textAnchor="middle" fontSize="10.5"
              fill="var(--text-dim)">total</text>
      </svg>
      <div className="chart-legend" style={{ flexDirection: 'column', gap: 7, marginTop: 0 }}>
        {data.slice(0, 7).map((d, i) => (
          <div className="item" key={i}>
            <span className="swatch" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="truncate" style={{ maxWidth: 160 }}>{d[labelKey]}</span>
            <span className="nums dim">{format(d[valueKey])}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function useDebounced(value, delay = 300) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return out
}

export function Toasts({ items }) {
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone}`}>
          <div className="t">{t.title}</div>
          {t.message && <div className="m">{t.message}</div>}
        </div>
      ))}
    </div>
  )
}

export { SERIES }

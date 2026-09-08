import { useEffect } from 'react'
import { STATUS_TONE, fmt } from '../lib/api'

export function Icon({ name, size = 20, strokeWidth = 1.8, ...rest }) {
  const paths = {
    home: 'M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z',
    truck: 'M3 16V6h11v10M14 9h3.5L21 12.5V16h-3M6.5 19a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Zm11 0a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z',
    route: 'M6 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm12-9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0 0v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V7',
    ruler: 'M4 15 15 4l5 5L9 20l-5-5Zm3-3 2 2m1-4 2 2m1-4 2 2',
    alert: 'M12 9v4m0 4h.01M10.3 3.8 2.5 17.3A2 2 0 0 0 4.2 20.3h15.6a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z',
    barcode: 'M4 5v14M7 5v14M10 5v10M13 5v14M16 5v10M20 5v14',
    list: 'M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01',
    user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    camera: 'M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z',
    pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Zm0-8.6a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z',
    check: 'm5 12.5 4.5 4.5L19 7',
    x: 'M6 6l12 12M18 6 6 18',
    chevron: 'm9 5 7 7-7 7',
    back: 'm15 19-7-7 7-7',
    plus: 'M12 5v14M5 12h14',
    refresh: 'M20 11a8 8 0 1 0-1.8 6M20 5v6h-6',
    cloud: 'M7 18a4 4 0 0 1 0-8 5.5 5.5 0 0 1 10.6 1.3A3.6 3.6 0 0 1 17 18H7Z',
    cloudOff: 'M3 3l18 18M7 18a4 4 0 0 1-.9-7.9M9.5 6.2A5.5 5.5 0 0 1 17.6 11a3.6 3.6 0 0 1 1.5 6',
    print: 'M7 8V3h10v5M7 18H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7v-7Z',
    logout: 'M15 17l5-5-5-5M20 12H9M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
    inbox: 'M3 12h5l2 3h4l2-3h5M3 12l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z',
    signature: 'M3 17c3 0 3-9 6-9s3 12 6 12 3-9 6-9M3 21h18',
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      <path d={paths[name] || paths.folder} />
    </svg>
  )
}

export function Badge({ children, tone, status }) {
  const t = tone || STATUS_TONE[status] || ''
  const map = { violet: 'blue', '': '' }
  return <span className={`badge ${map[t] ?? t}`}>{children ?? fmt.title(status)}</span>
}

export function Field({ label, hint, required, children }) {
  return (
    <div className="field">
      {label && <label>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Empty({ icon = 'inbox', title, children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={38} strokeWidth={1.3} />
      <h4>{title}</h4>
      {children && <p>{children}</p>}
    </div>
  )
}

export function Sheet({ title, onClose, children, footer }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet">
        <div className="sheet-grip" />
        {title && (
          <div className="row" style={{ marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 640 }}>{title}</h3>
            <div className="spacer" />
            <button className="btn ghost icon sm" onClick={onClose}><Icon name="x" size={17} /></button>
          </div>
        )}
        {children}
        {footer && <div style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </>
  )
}

export function Toasts({ items }) {
  if (!items.length) return null
  return (
    <div className="toast-wrap">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'err' ? 'err' : ''}`}>
          <div className="t">{t.title}</div>
          {t.message && <div className="m">{t.message}</div>}
        </div>
      ))}
    </div>
  )
}

export function Steps({ total, current }) {
  return (
    <div className="steps">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`step ${i < current ? 'done' : i === current ? 'now' : ''}`} />
      ))}
    </div>
  )
}

// The desktop's pictures (the user, 2026-10-22: "a real desktop with icons you can click on"): one
// small drawing for each kind of place, beside its words on a desktop icon, a taskbar button, a
// window's title bar. Every one is hidden from a screen reader, which reads the words, and drawn
// here in the words' colour: nothing is loaded for them. Only the back office draws them, so they
// stay in the app (the look's own icons are `@open-adms/look`'s).
import type { ReactNode } from 'react';

export type GlyphName =
  | 'about'
  | 'account'
  | 'audit'
  | 'batches'
  | 'billings'
  | 'building'
  | 'certification'
  | 'checklist'
  | 'clock'
  | 'close'
  | 'desktop'
  | 'dispatch'
  | 'document'
  | 'dropOff'
  | 'export'
  | 'folder'
  | 'form'
  | 'held'
  | 'incident'
  | 'jobs'
  | 'ledger'
  | 'list'
  | 'lock'
  | 'map'
  | 'maximize'
  | 'minimize'
  | 'payItem'
  | 'people'
  | 'phone'
  | 'projects'
  | 'qc'
  | 'quarantine'
  | 'report'
  | 'restore'
  | 'review'
  | 'roe'
  | 'rules'
  | 'settings'
  | 'setup'
  | 'site'
  | 'storm'
  | 'survey'
  | 'ticket'
  | 'truck';

const drawn: Readonly<Record<GlyphName, ReactNode>> = {
  about: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.01" />
    </>
  ),
  account: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 3.8-6 7-6s6 2 7 6" />
    </>
  ),
  audit: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 3.5V8H8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  batches: (
    <>
      <path d="M4 9h16v11H4zM6 6h12M8 3h8" />
      <path d="M9.5 13h5" />
    </>
  ),
  billings: (
    <>
      <path d="M3 7h18v11H3z" />
      <circle cx="12" cy="12.5" r="2.5" />
      <path d="M6 10v.01M18 15v.01" />
    </>
  ),
  building: <path d="M5 20V4h9v16M14 9h5v11M8 7.5h3M8 11h3M8 14.5h3M3 20h18" />,
  certification: (
    <>
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8 17c1-2 2.4-3 4-3s3 1 4 3" />
    </>
  ),
  checklist: (
    <path d="M10 6h10M10 12h10M10 18h10M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  desktop: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="1.5" />
      <path d="M8.5 20.5h7M12 16.5v4" />
    </>
  ),
  dispatch: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4M7.5 14h3M13.5 14h3M7.5 17.5h3" />
    </>
  ),
  document: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14.5 3v4.5H19M9 12h7M9 16h5" />
    </>
  ),
  dropOff: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />,
  export: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4 19.5h16" />,
  folder: <path d="M3 6h6.5l2 2.5H21V19H3z" />,
  form: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="1.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </>
  ),
  held: (
    <>
      <path d="M4 13l3-8h10l3 8v6H4z" />
      <path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" />
    </>
  ),
  incident: <path d="M12 3.5L2.5 20h19zM12 10v4.5M12 17.5v.01" />,
  jobs: <path d="M12 3l9 5-9 5-9-5zM3 12.5l9 5 9-5M3 17l9 5 9-5" />,
  ledger: (
    <>
      <path d="M6 3h12a1 1 0 0 1 1 1v17H7a2 2 0 0 1-2-2V4a1 1 0 0 1 1-1z" />
      <path d="M12 6.5v10M14.5 8.5c0-1-1-1.5-2.5-1.5S9.5 7.6 9.5 8.6c0 2.6 5 1.1 5 3.7 0 1-1 1.7-2.5 1.7s-2.5-.7-2.5-1.7" />
    </>
  ),
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6v.01M4.5 12v.01M4.5 18v.01" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </>
  ),
  map: <path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20" />,
  maximize: <rect x="5" y="5" width="14" height="14" rx="1" />,
  minimize: <path d="M5 18.5h14" />,
  payItem: (
    <>
      <path d="M3 12.5V4h8.5l9.5 9.5-8 8z" />
      <circle cx="7.5" cy="8.5" r="1.5" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c.8-3.4 3.2-5 6-5s5.2 1.6 6 5M15.5 5.2a3 3 0 0 1 0 5.6M17 14.3c2 .6 3.4 2.2 4 4.7" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </>
  ),
  projects: (
    <>
      <path d="M3 8h6.5l2 2.5H21V20H3z" />
      <path d="M5.5 5h5l2 2.5h6" />
    </>
  ),
  qc: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </>
  ),
  quarantine: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9.5 9.5l5 5M14.5 9.5l-5 5" />,
  report: <path d="M4 3.5V20h16.5M8 16v-5M12 16V8M16 16v-7" />,
  restore: (
    <>
      <rect x="4" y="8" width="12" height="12" rx="1" />
      <path d="M8 8V4.5h11.5V16H16" />
    </>
  ),
  review: (
    <>
      <path d="M8.5 3.5h7v3h-7z" />
      <path d="M8.5 5H5v16h14V5h-3.5M8.5 13l2.5 2.5 4.5-5" />
    </>
  ),
  roe: <path d="M3 11l9-7 9 7M5.5 9v11h13V9M10 20v-6h4v6" />,
  rules: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="12" r="2.5" />
      <path d="M6 8.5v7M8.5 6H12a3 3 0 0 1 3 3v.5M8.5 18H12a3 3 0 0 0 3-3v-.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
  setup: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  site: (
    <>
      <path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  storm: (
    <>
      <path d="M7 15.5a4 4 0 0 1-.4-8A5.5 5.5 0 0 1 17 8a3.8 3.8 0 0 1 .5 7.5" />
      <path d="M12.5 12l-2.5 4.5h4L11.5 21" />
    </>
  ),
  survey: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14.5 3v4.5H19M9 13l2 2 4-4.5" />
    </>
  ),
  ticket: (
    <>
      <path d="M3.5 6.5h17v3.5a2 2 0 0 0 0 4v3.5h-17V14a2 2 0 0 0 0-4z" />
      <path d="M14 6.5v11" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 6.5h11v9h-11zM13.5 9.5h4l3 3.5v2.5h-7" />
      <circle cx="6.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </>
  ),
};

export function Glyph({
  name,
  className,
}: {
  readonly name: GlyphName;
  readonly className?: string;
}) {
  return (
    <svg
      className={className === undefined ? 'glyph' : `glyph ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {drawn[name]}
    </svg>
  );
}

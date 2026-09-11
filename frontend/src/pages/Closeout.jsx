/**
 * Closeout packaging.
 *
 * The zip that goes to the client at project completion: the data exported to
 * spreadsheets under an agreed naming convention, and a manifest accounting for
 * every document the project collected, where it lives, who verified it and
 * when. Assembled from the registry rather than by hand, which is the only way
 * it stays honest about what is missing.
 */
import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Stat,
} from '../components/ui'

const DATASETS = [
  ['tickets', 'Tickets'],
  ['transactions', 'Transactions'],
  ['audit', 'Audit history'],
]

const iso = (d) => d.toISOString().slice(0, 10)

// The periods a closeout is actually asked for. A client wants last month, a
// program wants the quarter, and typing two dates for either is friction
// nobody needs twice a month.
const PRESETS = [
  ['This month', () => {
    const now = new Date()
    return { date_from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
             date_to: iso(now) }
  }],
  ['Last month', () => {
    const now = new Date()
    return { date_from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
             date_to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) }
  }],
  ['Last 90 days', () => {
    const now = new Date()
    const from = new Date(now); from.setDate(from.getDate() - 89)
    return { date_from: iso(from), date_to: iso(now) }
  }],
]

export default function Closeout() {
  const { projectId, project, toast } = useApp()
  const [template, setTemplate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [picked, setPicked] = useState({ tickets: true, transactions: true, audit: true })
  const [range, setRange] = useState({ date_from: '', date_to: '' })

  const period = { date_from: range.date_from || undefined,
                   date_to: range.date_to || undefined }
  const ranged = Boolean(range.date_from || range.date_to)
  const inverted = Boolean(range.date_from && range.date_to
                           && range.date_to < range.date_from)

  const naming = useFetch(
    () => api.get(`/projects/${projectId}/closeout/naming`, period),
    [projectId, range.date_from, range.date_to],
    { skip: !projectId || inverted })
  const manifest = useFetch(
    () => api.get(`/projects/${projectId}/closeout/manifest`, period),
    [projectId, range.date_from, range.date_to],
    { skip: !projectId || inverted })

  if (!projectId) {
    return (<><PageHeader title="Closeout" /><div className="page">
      <Empty icon="folder" title="No project in context" /></div></>)
  }

  const current = template ?? naming.data?.template ?? ''
  const chosen = Object.entries(picked).filter(([, v]) => v).map(([k]) => k)

  async function saveTemplate() {
    setBusy(true)
    try {
      await api.put(`/projects/${projectId}/closeout/naming`, { template: current })
      toast('Naming convention saved', current)
      setTemplate(null)
      naming.reload(); manifest.reload()
    } catch (err) { toast('Could not save that', err.message, 'err') }
    finally { setBusy(false) }
  }

  async function download() {
    setBusy(true)
    try {
      // The server names the archive from the same template it names everything
      // else with. This is only the fallback if the header does not arrive.
      const fallback = `${manifest.data?.package_files?.archive
                          || project?.project_code || 'project'}.zip`
      const size = await api.download(
        `/projects/${projectId}/closeout/package`, fallback,
        { datasets: chosen.join(','), ...period })
      toast('Package built', `${(size / 1024).toFixed(0)} KB downloaded`)
    } catch (err) { toast('Could not build the package', err.message, 'err') }
    finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title="Closeout"
                  crumb={ranged ? manifest.data?.period : undefined}>
        <button className="btn primary"
                disabled={busy || !chosen.length || inverted} onClick={download}>
          {busy && <span className="spinner" />}
          <Icon name="download" size={14} /> Build the package
        </button>
      </PageHeader>

      <div className="page">
        {inverted && (
          <div className="card" style={{ padding: '12px 15px', marginBottom: 14,
                                         borderColor: 'var(--red)' }}>
            <div className="row" style={{ gap: 9 }}>
              <Icon name="alert" size={15} />
              <span style={{ fontSize: 13 }}>
                The end of the range falls before its start. Fix the dates and the
                package will build.
              </span>
            </div>
          </div>
        )}
        {(naming.loading || manifest.loading) && <Loading rows={6} />}
        {manifest.error && <ErrorNote error={manifest.error} onRetry={manifest.reload} />}

        {manifest.data && (
          <div className="stack" style={{ gap: 14 }}>
            <div className="grid c4" style={{ gap: 12 }}>
              <Stat label="Documents" value={fmt.int(manifest.data.document_count)}
                    detail="Every link this project collected" />
              <Stat label="Unverified" value={fmt.int(manifest.data.unverified.length)}
                    tone={manifest.data.unverified.length ? 'amber' : undefined}
                    detail={manifest.data.unverified.length
                      ? 'Named in the manifest, not hidden' : 'All verified'} />
              <Stat label="Tickets" value={fmt.int(manifest.data.datasets.tickets)}
                    detail={ranged
                      ? `of ${fmt.int(manifest.data.dataset_totals.tickets)} on the project`
                      : undefined} />
              <Stat label="Transactions"
                    value={fmt.int(manifest.data.datasets.transactions)}
                    detail={ranged
                      ? `of ${fmt.int(manifest.data.dataset_totals.transactions)} on the project`
                      : undefined} />
            </div>

            {manifest.data.warnings.length > 0 && (
              <div className="card" style={{ padding: '12px 15px',
                                             borderColor: 'var(--amber)',
                                             background: 'var(--amber-soft)' }}>
                <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
                  <Icon name="alert" size={15} style={{ marginTop: 2 }} />
                  <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                    {manifest.data.warnings.map((w) => <div key={w}>{w}</div>)}
                    <div className="muted" style={{ marginTop: 5 }}>
                      The package is still buildable. These are stated in the manifest so
                      nobody discovers them later.
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Card title="Naming convention"
                  sub="Filenames are generated from this rather than typed.">
              <div className="stack" style={{ gap: 12 }}>
                <Field label="Template"
                       hint={`Tokens: ${(naming.data?.tokens || []).map((t) => `{${t}}`).join(' ')}`}>
                  <div className="row" style={{ gap: 8 }}>
                    <input className="input mono" value={current}
                           onChange={(e) => setTemplate(e.target.value)} />
                    <button className="btn primary sm" disabled={busy || template === null}
                            onClick={saveTemplate}>Save</button>
                    {template !== null && (
                      <button className="btn sm" onClick={() => setTemplate(null)}>
                        Cancel
                      </button>
                    )}
                  </div>
                </Field>
                {naming.data?.package?.length > 0 && (
                  <div>
                    <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>
                      What the package will be called
                    </div>
                    <div className="stack" style={{ gap: 4 }}>
                      {naming.data.package.map((e) => (
                        <div key={e.what} className="row" style={{ gap: 8 }}>
                          <span className="dim" style={{ fontSize: 12, minWidth: 150 }}>
                            {e.what}
                          </span>
                          <span className="mono truncate" style={{ fontSize: 12 }}>
                            {e.filename}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {naming.data?.examples?.length > 0 && (
                  <div>
                    <div className="dim" style={{ fontSize: 11.5, marginBottom: 6 }}>
                      What the documents in the manifest will be called
                    </div>
                    <div className="stack" style={{ gap: 4 }}>
                      {naming.data.examples.slice(0, 5).map((e, i) => (
                        <div key={i} className="row" style={{ gap: 8 }}>
                          <span className="dim" style={{ fontSize: 12, minWidth: 150 }}>
                            {e.kind}
                          </span>
                          <span className="mono truncate" style={{ fontSize: 12 }}>
                            {e.filename}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {naming.data?.values && (
                  <div className="dim" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
                    Token values on this project:{' '}
                    {Object.entries(naming.data.values)
                      .map(([k, v]) => `{${k}} = ${v || 'not set'}`)
                      .join(' · ')}
                  </div>
                )}
              </div>
            </Card>

            <Card title="What goes in the package">
              <div className="stack" style={{ gap: 12 }}>
                <div className="row wrap" style={{ gap: 14 }}>
                  {DATASETS.map(([key, label]) => (
                    <label key={key} className="check">
                      <input type="checkbox" checked={Boolean(picked[key])}
                             onChange={(e) => setPicked({ ...picked, [key]: e.target.checked })} />
                      {label}
                      <span className="dim">
                        {' '}({fmt.int(manifest.data.datasets[key])} rows)
                      </span>
                    </label>
                  ))}
                </div>

                <Field label="Period"
                       hint="Leave both dates empty for the whole project. A range narrows the exports by ticket date, transaction pricing date and audit date.">
                  <div className="row wrap" style={{ gap: 8, alignItems: 'center' }}>
                    <input className="input" type="date" style={{ width: 152 }}
                           value={range.date_from}
                           onChange={(e) => setRange({ ...range, date_from: e.target.value })} />
                    <span className="dim" style={{ fontSize: 12 }}>through</span>
                    <input className="input" type="date" style={{ width: 152 }}
                           value={range.date_to}
                           onChange={(e) => setRange({ ...range, date_to: e.target.value })} />
                    {ranged && (
                      <button className="btn sm"
                              onClick={() => setRange({ date_from: '', date_to: '' })}>
                        Whole project
                      </button>
                    )}
                    <div className="row wrap" style={{ gap: 6 }}>
                      {PRESETS.map(([label, make]) => (
                        <button key={label} className="btn ghost sm"
                                onClick={() => setRange(make())}>{label}</button>
                      ))}
                    </div>
                  </div>
                </Field>

                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                  The manifest is always included and is never narrowed by the period: a
                  document belongs to the project whatever month it was signed in. The
                  documents themselves are not in the package. They live in Box or
                  SharePoint, and the manifest names where each one is.
                </div>
              </div>
            </Card>

            <Card flush title={`Manifest · ${manifest.data.document_count} document(s)`}>
              {manifest.data.documents.length === 0 ? (
                <Empty icon="invoice" title="Nothing registered on this project yet" />
              ) : (
                <div className="table-wrap">
                  <table className="data">
                    <thead><tr>
                      <th>Filename</th><th>Kind</th><th>Belongs to</th>
                      <th>State</th><th>Verified by</th><th>Expires</th><th>Source</th>
                    </tr></thead>
                    <tbody>
                      {manifest.data.documents.map((d) => (
                        <tr key={d.filename + d.source_url}>
                          <td className="mono truncate" style={{ maxWidth: 300 }}>
                            {d.filename}
                          </td>
                          <td className="muted">{d.kind}</td>
                          <td className="truncate" style={{ maxWidth: 180 }}>{d.belongs_to}</td>
                          <td><Badge status={d.verification_status} /></td>
                          <td className="muted">{d.verified_by || '—'}</td>
                          <td className="muted">
                            {d.expires_on ? fmt.date(d.expires_on) : '—'}
                          </td>
                          <td>
                            <a href={d.source_url} target="_blank" rel="noreferrer">
                              <Icon name="external" size={13} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  )
}

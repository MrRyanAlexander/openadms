import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch, useListState } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, rowProps, Search,
  Tabs, useDebounced,
} from '../components/ui'

/* ================================= AUDIT ================================= */
// Four questions, four audiences. Who logged in is a security question, who
// changed a rate is a billing question, and an auditor asking one of them
// should not have to read past the other three.
const DOMAINS = [
  ['', 'Everything', 'Every write, in one list'],
  ['operations', 'Operations', 'Tickets, media, review and field records'],
  ['billing', 'Billing', 'Rules, rates, transactions and invoices'],
  ['records', 'Records', 'Projects, contracts, catalog and reference data'],
  ['security', 'Security', 'Sign-in, accounts, roles and sharing'],
]

const AUDIT_DEFAULTS = {
  domain: '', entity_type: '', action: '', actor: '',
  date_from: '', date_to: '', scope: 'project', offset: 0,
}

export function Audit() {
  const { projectId, project } = useApp()
  const { state, set, clear, touched } = useListState(AUDIT_DEFAULTS)
  const [chain, setChain] = useState(null)
  const { domain, entity_type, action, actor, date_from, date_to, scope, offset } = state

  const { data, loading, error, reload } = useFetch(
    () => api.get('/audit', {
      limit: 60, offset,
      project_id: scope === 'project' ? projectId : undefined,
      domain: domain || undefined,
      entity_type: entity_type || undefined,
      action: action || undefined,
      actor: actor || undefined,
      date_from: date_from || undefined,
      date_to: date_to || undefined,
    }),
    [projectId, scope, offset, domain, entity_type, action, actor, date_from, date_to])

  const counts = data?.domains || {}

  return (
    <>
      <PageHeader title="Audit History"
                  crumb={scope === 'project' ? project?.project_code : 'All projects'}>
        <div className="seg">
          {['project', 'all'].map((s) => (
            <button key={s} className={scope === s ? 'on' : ''}
                    onClick={() => set({ scope: s })}>
              {s === 'project' ? 'This project' : 'Everything'}
            </button>
          ))}
        </div>
        <button className="btn icon" onClick={reload}><Icon name="refresh" size={15} /></button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
            Every write in the system leaves an artifact here: what changed, the value
            before and after, who did it and when. The table is append-only at the
            database level, so nothing in this list can be edited or removed. Open any
            row to follow that record's whole chain of events in order.
          </div>
        </div>

        <div className="seg wide" style={{ marginBottom: 12 }}>
          {DOMAINS.map(([key, label, hint]) => (
            <button key={key || 'all'} className={domain === key ? 'on' : ''}
                    title={hint} onClick={() => set({ domain: key })}>
              {label}
              <span className="dim" style={{ marginLeft: 6 }}>
                {fmt.int(counts[key || 'all'] ?? 0)}
              </span>
            </button>
          ))}
        </div>

        <Card flush>
          <div className="card-head" style={{ gap: 9, flexWrap: 'wrap' }}>
            <select className="select" style={{ width: 165 }} value={entity_type}
                    onChange={(e) => set({ entity_type: e.target.value })}>
              <option value="">Any record type</option>
              {['tickets', 'projects', 'rules', 'rule_statements', 'service_codes', 'rates',
                'rate_tiers', 'invoices', 'invoice_lines', 'transactions', 'users',
                'contracts', 'clients', 'contractors', 'disposal_sites', 'equipment',
                'equipment_certifications', 'ticket_reviews', 'ticket_flags',
                'project_assignments', 'peer_instances'].map((t) => (
                <option key={t} value={t}>{fmt.title(t)}</option>
              ))}
            </select>
            <select className="select" style={{ width: 140 }} value={action}
                    onChange={(e) => set({ action: e.target.value })}>
              <option value="">Any action</option>
              {['create', 'update', 'delete', 'void', 'unvoid', 'login', 'login_failed',
                'logout', 'export', 'process', 'reprocess', 'reverse', 'supersede',
                'share', 'peer_read', 'approve', 'reject', 'submit'].map((a) => (
                <option key={a} value={a}>{fmt.title(a)}</option>
              ))}
            </select>
            <input className="input" style={{ width: 170 }} placeholder="Actor"
                   value={actor} onChange={(e) => set({ actor: e.target.value })} />
            <input className="input" type="date" style={{ width: 148 }} value={date_from}
                   onChange={(e) => set({ date_from: e.target.value })} />
            <input className="input" type="date" style={{ width: 148 }} value={date_to}
                   onChange={(e) => set({ date_to: e.target.value })} />
            {touched && <button className="btn sm" onClick={clear}>Clear</button>}
            <div className="spacer" />
            {data && <span className="dim">{fmt.int(data.total)} artifacts</span>}
          </div>

          {loading && <Loading rows={8} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (data.items.length === 0 ? (
            <Empty icon="audit" title="No audit artifacts match">
              {touched ? 'Clear the filters to see the whole trail.' : null}
            </Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr>
                    <th>When</th><th>Action</th><th>Record</th><th>Identifier</th>
                    <th>Actor</th><th>Changed</th><th>Reason</th><th />
                  </tr></thead>
                  <tbody>
                    {data.items.map((e) => (
                      <tr key={e.id} {...rowProps(() => setChain(e))}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {fmt.datetime(e.occurred_at)}
                        </td>
                        <td><ActionBadge action={e.action} /></td>
                        <td className="muted">{fmt.title(e.entity_type)}</td>
                        <td className="mono">{e.entity_label || '—'}</td>
                        <td>{e.actor}{e.actor_role && (
                          <span className="dim"> · {e.actor_role}</span>)}</td>
                        <td onClick={(ev) => ev.stopPropagation()}>
                          <ChangeSummary changed={e.changed} />
                        </td>
                        <td className="muted truncate" style={{ maxWidth: 180 }}>
                          {e.reason || '—'}
                        </td>
                        <td className="dim" style={{ textAlign: 'right' }}>
                          <Icon name="chevron" size={14} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span>{fmt.int(offset + 1)}–{fmt.int(offset + data.items.length)} of {fmt.int(data.total)}</span>
                <div className="spacer" />
                <button className="btn sm" disabled={offset === 0}
                        onClick={() => set({ offset: Math.max(0, offset - 60) })}>Previous</button>
                <button className="btn sm" disabled={!data.has_more}
                        onClick={() => set({ offset: offset + 60 })}>Next</button>
              </div>
            </>
          ))}
        </Card>
      </div>

      {chain && <ChainView event={chain} onClose={() => setChain(null)} />}
    </>
  )
}

function ActionBadge({ action }) {
  const tone =
    action === 'delete' || action === 'void' || action === 'login_failed' ? 'red'
    : action === 'create' ? 'green'
    : action === 'peer_read' || action === 'share' ? 'violet'
    : action === 'reverse' || action === 'supersede' || action === 'reprocess' ? 'amber'
    : ''
  return <Badge tone={tone}>{fmt.title(action)}</Badge>
}

/* The chain. One record, every artifact touching it, oldest first. */
function ChainView({ event, onClose }) {
  const { data, loading, error, reload } = useFetch(
    () => api.get('/audit/chain', {
      entity_type: event.entity_type, entity_id: event.entity_id,
    }),
    [event.entity_type, event.entity_id])

  const title = `${fmt.title(event.entity_type)} · ${event.entity_label || 'record'}`

  return (
    <Modal title={title} wide onClose={onClose}>
      {loading && <Loading rows={6} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && (
        <div className="stack" style={{ gap: 14 }}>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
            {data.count === 1
              ? 'One artifact so far.'
              : `${fmt.int(data.count)} artifacts, oldest first.`}
            {data.first_at && (
              <> From {fmt.datetime(data.first_at)} to {fmt.datetime(data.last_at)}.</>)}
            {data.actors.length > 0 && <> Touched by {data.actors.join(', ')}.</>}
            {Object.keys(data.related).length > 0 && (
              <> The chain also carries {
                Object.entries(data.related)
                  .map(([k, n]) => `${fmt.int(n)} ${fmt.title(k).toLowerCase()}`)
                  .join(', ')
              } that hang off this record.</>
            )}
          </div>

          {data.events.length === 0 ? (
            <Empty icon="audit" title="Nothing recorded against this record yet" />
          ) : (
            <ol className="chain">
              {data.events.map((e) => {
                const fields = Object.entries(e.changed || {})
                const own = e.entity_type === data.entity_type
                return (
                  <li key={e.id} className={own ? '' : 'related'}>
                    <div className="chain-dot" />
                    <div className="chain-body">
                      <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
                        <ActionBadge action={e.action} />
                        {!own && (
                          <span className="dim" style={{ fontSize: 11.5 }}>
                            on {fmt.title(e.entity_type)}
                            {e.entity_label ? ` ${e.entity_label}` : ''}
                          </span>
                        )}
                        <div className="spacer" />
                        <span className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                          {fmt.datetime(e.occurred_at)}
                        </span>
                      </div>
                      <div style={{ fontSize: 12.5, marginTop: 3 }}>
                        {e.actor}
                        {e.actor_role && <span className="dim"> · {e.actor_role}</span>}
                        {e.source && <span className="dim"> · via {e.source}</span>}
                      </div>
                      {e.reason && (
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 4,
                                                        fontStyle: 'italic' }}>
                          {e.reason}
                        </div>
                      )}
                      {fields.length > 0 && (
                        <div className="diff stack" style={{ gap: 3, marginTop: 6 }}>
                          {fields.slice(0, 8).map(([field, change]) => (
                            <div key={field} style={{ fontSize: 12 }}>
                              <span className="dim">{field}: </span>
                              {change?.from !== undefined && change?.from !== null && (
                                <><span className="from">{JSON.stringify(change.from)}</span>
                                  {' → '}</>
                              )}
                              <span className="to">{JSON.stringify(change?.to ?? change)}</span>
                            </div>
                          ))}
                          {fields.length > 8 && (
                            <div className="dim" style={{ fontSize: 11.5 }}>
                              and {fields.length - 8} more field(s)
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      )}
    </Modal>
  )
}

function ChangeSummary({ changed }) {
  const entries = Object.entries(changed || {})
  const [open, setOpen] = useState(false)
  if (!entries.length) return <span className="dim">—</span>

  return (
    <>
      <button className="btn ghost sm" onClick={() => setOpen(true)}>
        {entries.length} field{entries.length === 1 ? '' : 's'}
      </button>
      {open && (
        <Modal title="Change detail" onClose={() => setOpen(false)}>
          <div className="diff stack" style={{ gap: 8 }}>
            {entries.map(([field, change]) => (
              <div key={field} className="card" style={{ padding: 10 }}>
                <div className="dim" style={{ fontSize: 11.5, marginBottom: 3 }}>{field}</div>
                <div>
                  {change.from !== undefined && change.from !== null && (
                    <span className="from">{JSON.stringify(change.from)}</span>
                  )}
                  {' → '}
                  <span className="to">{JSON.stringify(change.to)}</span>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  )
}

/* ============================== QUERY BUILDER ============================ */
export function QueryBuilder() {
  const { toast } = useApp()
  const [source, setSource] = useState('tickets')
  const [columns, setColumns] = useState([])
  const [filters, setFilters] = useState([])
  const [orderBy, setOrderBy] = useState('')
  const [ascending, setAscending] = useState(false)
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  const meta = useFetch(() => api.get('/query/sources'), [])
  const config = meta.data?.sources?.find((s) => s.key === source)

  function switchSource(next) {
    setSource(next)
    setColumns([])
    setFilters([])
    setOrderBy('')
    setResult(null)
  }

  async function run() {
    setBusy(true)
    try {
      const payload = {
        source,
        columns: columns.length ? columns : undefined,
        filters: filters.filter((f) => f.column),
        order_by: orderBy || undefined,
        ascending,
        limit: 500,
      }
      setResult(await api.post('/query/run', payload))
    } catch (err) { toast('Query failed', err.message, 'err') } finally { setBusy(false) }
  }

  function downloadCsv() {
    if (!result) return
    const escape = (v) => {
      const s = v === null || v === undefined ? '' : (typeof v === 'object'
        ? JSON.stringify(v) : String(v))
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [result.columns.join(','),
      ...result.rows.map((r) => result.columns.map((c) => escape(r[c])).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `openadms-${source}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const active = columns.length ? columns : (config?.default_columns || [])

  return (
    <>
      <PageHeader title="Query Builder">
        <button className="btn" disabled={!result} onClick={downloadCsv}>
          <Icon name="download" size={14} /> CSV
        </button>
        <button className="btn primary" onClick={run} disabled={busy}>
          {busy && <span className="spinner" />} Run query
        </button>
      </PageHeader>

      <div className="page">
        <div className="grid" style={{ gridTemplateColumns: 'minmax(300px, 380px) minmax(0, 1fr)' }}>
          <div className="stack">
            <Card title="Source">
              <div className="seg" style={{ width: '100%' }}>
                {(meta.data?.sources || []).map((s) => (
                  <button key={s.key} className={source === s.key ? 'on' : ''}
                          style={{ flex: 1 }} onClick={() => switchSource(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            </Card>

            <Card title="Filters" actions={
              <button className="btn sm" onClick={() => setFilters([...filters,
                { column: config?.columns?.[0]?.column_name || '', operator: 'eq', value: '' }])}>
                <Icon name="plus" size={13} /> Add
              </button>
            }>
              {filters.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  No filters. Every row in the source will be returned, up to 500.
                </div>
              ) : (
                <div className="stack" style={{ gap: 8 }}>
                  {filters.map((f, i) => (
                    <div className="row" key={i} style={{ gap: 6 }}>
                      <select className="select" style={{ flex: 2 }} value={f.column}
                              onChange={(e) => setFilters(filters.map((x, j) =>
                                (j === i ? { ...x, column: e.target.value } : x)))}>
                        {(config?.columns || []).map((c) => (
                          <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                        ))}
                      </select>
                      <select className="select" style={{ flex: 1 }} value={f.operator}
                              onChange={(e) => setFilters(filters.map((x, j) =>
                                (j === i ? { ...x, operator: e.target.value } : x)))}>
                        {(meta.data?.operators || []).map((o) => (
                          <option key={o.code} value={o.code}>{o.label}</option>
                        ))}
                      </select>
                      <input className="input" style={{ flex: 1.4 }} value={f.value}
                             placeholder="value"
                             onChange={(e) => setFilters(filters.map((x, j) =>
                               (j === i ? { ...x, value: e.target.value } : x)))} />
                      <button className="btn ghost icon sm"
                              onClick={() => setFilters(filters.filter((_, j) => j !== i))}>
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card title="Columns" sub={`${active.length} selected`}>
              <div className="row wrap" style={{ gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                {(config?.columns || []).map((c) => {
                  const on = active.includes(c.column_name)
                  return (
                    <button key={c.column_name} className={`btn sm${on ? ' primary' : ''}`}
                            onClick={() => setColumns(on
                              ? active.filter((x) => x !== c.column_name)
                              : [...active, c.column_name])}>
                      {c.column_name}
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card title="Order">
              <div className="row" style={{ gap: 8 }}>
                <select className="select" value={orderBy}
                        onChange={(e) => setOrderBy(e.target.value)}>
                  <option value="">Default</option>
                  {(config?.columns || []).map((c) => (
                    <option key={c.column_name} value={c.column_name}>{c.column_name}</option>
                  ))}
                </select>
                <div className="seg">
                  <button className={!ascending ? 'on' : ''} onClick={() => setAscending(false)}>
                    Desc</button>
                  <button className={ascending ? 'on' : ''} onClick={() => setAscending(true)}>
                    Asc</button>
                </div>
              </div>
            </Card>
          </div>

          <Card flush title={result ? `${fmt.int(result.returned)} of ${fmt.int(result.total)} rows` : 'Results'}>
            {/* A result that stopped short says so here rather than looking
                like the whole answer to the question that was asked. */}
            {result?.truncated && (
              <div style={{ padding: '11px 16px', borderBottom: '1px solid var(--line-soft)',
                            background: 'var(--amber-soft)', fontSize: 12.5 }}>
                <Icon name="alert" size={14} style={{ verticalAlign: '-2px', marginRight: 7 }} />
                {result.message}
              </div>
            )}
            {!result ? (
              <Empty icon="query" title="Nothing run yet">
                Pick a source, add filters, then run the query. Column names and operators
                are validated server side; values are always bound parameters.
              </Empty>
            ) : result.rows.length === 0 ? (
              <Empty icon="filter" title="No rows matched" />
            ) : (
              <div className="table-wrap" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <table className="data">
                  <thead><tr>{result.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i}>
                        {result.columns.map((c) => (
                          <td key={c} className="truncate" style={{ maxWidth: 220 }}>
                            {row[c] === null || row[c] === undefined ? <span className="dim">—</span>
                             : typeof row[c] === 'object' ? <span className="mono">{JSON.stringify(row[c])}</span>
                             : String(row[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}

/* =============================== SHARING ================================= */
export function Sharing() {
  const { projectId, project, toast } = useApp()
  const [adding, setAdding] = useState(false)

  const instance = useFetch(() => api.get('/instance'), [])
  const peers = useFetch(() => api.get('/peers'), [])
  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })

  async function setVisibility(flag, viewers) {
    try {
      await api.put(`/projects/${projectId}/share`,
                    { visibility_flag: flag, allowed_viewers: viewers })
      toast('Sharing updated', `Project is now ${flag}`)
      detail.reload()
    } catch (err) { toast('Could not update sharing', err.message, 'err') }
  }

  const p = detail.data
  const viewers = p?.allowed_viewers || []

  return (
    <>
      <PageHeader title="Sharing & Peers" crumb={project?.project_code}>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add peer
        </button>
      </PageHeader>

      <div className="page stack" style={{ gap: 14 }}>
        <Card title="This instance"
              sub="Peers reference this deployment by its instance key">
          {instance.loading && <Loading rows={2} />}
          {instance.data && (
            <dl className="kv">
              <dt>Display name</dt><dd>{instance.data.display_name}</dd>
              <dt>Organization</dt><dd>{instance.data.organization || '—'}</dd>
              <dt>Instance key</dt>
              <dd className="mono" style={{ wordBreak: 'break-all' }}>
                {instance.data.instance_key}
                <button className="btn ghost sm" style={{ marginLeft: 8 }}
                        onClick={() => {
                          navigator.clipboard?.writeText(instance.data.instance_key)
                          toast('Copied', 'Instance key on the clipboard')
                        }}>Copy</button>
              </dd>
              <dt>Signing key</dt>
              <dd className="mono dim" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-all' }}>
                {(instance.data.public_key_pem || '—').split('\n').slice(0, 3).join('\n')}
              </dd>
              <dt>Registry</dt>
              <dd>{instance.data.registry_opt_in ? 'Opted in' : 'Not published'}</dd>
            </dl>
          )}
        </Card>

        {p && (
          <Card title="Project visibility"
                sub="Who outside this deployment may read this project's tickets">
            <div className="stack" style={{ gap: 12 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                {[['private', 'Private', 'Readable only by users of this instance'],
                  ['restricted', 'Restricted', 'Allow-listed peers with a valid signature'],
                  ['public', 'Public', 'Any caller, no signature required']].map(
                  ([flag, label, help]) => (
                    <button key={flag}
                            className={`card${p.visibility_flag === flag ? '' : ''}`}
                            style={{
                              flex: '1 1 200px', padding: 13, textAlign: 'left', cursor: 'pointer',
                              borderColor: p.visibility_flag === flag ? 'var(--accent)' : undefined,
                              background: p.visibility_flag === flag ? 'var(--accent-soft)' : undefined,
                            }}
                            onClick={() => setVisibility(flag, viewers)}>
                      <div className="row" style={{ gap: 7 }}>
                        <b>{label}</b>
                        {p.visibility_flag === flag && <Icon name="check" size={14} />}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{help}</div>
                    </button>
                  ))}
              </div>

              {p.visibility_flag === 'restricted' && (
                <div>
                  <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                                  letterSpacing: '0.06em', marginBottom: 8 }}>
                    Allowed peer instances
                  </div>
                  <div className="stack" style={{ gap: 7 }}>
                    {(peers.data?.items || []).map((peer) => {
                      const on = viewers.includes(peer.instance_key)
                      return (
                        <label className="check card" key={peer.id}
                               style={{ padding: 11, justifyContent: 'flex-start' }}>
                          <input type="checkbox" checked={on}
                                 onChange={() => setVisibility('restricted', on
                                   ? viewers.filter((v) => v !== peer.instance_key)
                                   : [...viewers, peer.instance_key])} />
                          <span style={{ flex: 1 }}>
                            <b>{peer.display_name}</b>
                            <span className="dim mono" style={{ marginLeft: 8, fontSize: 11 }}>
                              {peer.instance_key.slice(0, 16)}…
                            </span>
                          </span>
                          <Badge status={peer.trust_state} />
                        </label>
                      )
                    })}
                    {!(peers.data?.items || []).length && (
                      <div className="muted" style={{ fontSize: 13 }}>
                        No peers registered yet. Add one below, paste in its public key,
                        and mark it trusted before it can read anything.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        )}

        <Card title="Peer instances" flush
              sub="Other Open ADMS deployments this instance recognises">
          {peers.loading && <Loading rows={3} />}
          {peers.data && (peers.data.items.length === 0 ? (
            <Empty icon="share" title="No peers registered">
              A peer presents its instance key and an Ed25519 signature on every read.
              Until one is registered and trusted, nothing crosses the boundary.
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Peer</th><th>Instance key</th><th>Base URL</th><th>Trust</th>
                  <th className="num">Shared projects</th><th className="num">Shared tickets</th>
                  <th>Last seen</th><th />
                </tr></thead>
                <tbody>
                  {peers.data.items.map((peer) => (
                    <tr key={peer.id}>
                      <td style={{ fontWeight: 550 }}>{peer.display_name}</td>
                      <td className="mono dim">{peer.instance_key.slice(0, 20)}…</td>
                      <td className="muted truncate" style={{ maxWidth: 180 }}>
                        {peer.base_url || '—'}</td>
                      <td><Badge status={peer.trust_state} /></td>
                      <td className="num">{fmt.int(peer.shared_projects)}</td>
                      <td className="num">{fmt.int(peer.shared_tickets)}</td>
                      <td className="muted">{peer.last_seen_at ? fmt.ago(peer.last_seen_at) : 'Never'}</td>
                      <td style={{ width: 160, textAlign: 'right' }}>
                        {peer.trust_state !== 'trusted' && (
                          <button className="btn sm" onClick={async () => {
                            await api.patch(`/peers/${peer.id}`, { trust_state: 'trusted' })
                            peers.reload()
                          }}>Trust</button>
                        )}
                        {peer.trust_state === 'trusted' && (
                          <button className="btn sm danger" onClick={async () => {
                            await api.patch(`/peers/${peer.id}`, { trust_state: 'revoked' })
                            peers.reload()
                          }}>Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </Card>
      </div>

      {adding && (
        <PeerForm onClose={() => setAdding(false)}
                  onSaved={() => { setAdding(false); peers.reload() }} toast={toast} />
      )}
    </>
  )
}

function PeerForm({ onClose, onSaved, toast }) {
  const [form, setForm] = useState({
    instance_key: '', display_name: '', base_url: '', public_key_pem: '',
    trust_state: 'pending', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true)
    try {
      await api.post('/peers', form)
      toast('Peer added', form.display_name)
      onSaved()
    } catch (err) { toast('Could not add peer', err.message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title="Add a peer instance" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.instance_key || !form.display_name}
                onClick={save}>{busy && <span className="spinner" />} Add peer</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.65 }}>
        Ask the other deployment for its <span className="mono">/peer/identity</span>
        {' '}response. It carries the instance key and the public key you need here.
      </p>
      <div className="stack">
        <Field label="Display name" required>
          <input className="input" value={form.display_name} autoFocus
                 onChange={(e) => set({ display_name: e.target.value })}
                 placeholder="Jefferson County ADMS" />
        </Field>
        <Field label="Instance key" required hint="64 hex characters">
          <input className="input mono" value={form.instance_key}
                 onChange={(e) => set({ instance_key: e.target.value.trim() })} />
        </Field>
        <Field label="Base URL">
          <input className="input" value={form.base_url}
                 onChange={(e) => set({ base_url: e.target.value })}
                 placeholder="https://adms.example.gov/api/v1" />
        </Field>
        <Field label="Public key (PEM)"
               hint="Ed25519. Without it, signed reads from this peer cannot be verified.">
          <textarea className="textarea mono" rows={5} value={form.public_key_pem}
                    onChange={(e) => set({ public_key_pem: e.target.value })}
                    placeholder="-----BEGIN PUBLIC KEY-----" />
        </Field>
        <Field label="Trust state">
          <select className="select" value={form.trust_state}
                  onChange={(e) => set({ trust_state: e.target.value })}>
            <option value="pending">Pending — registered but cannot read</option>
            <option value="trusted">Trusted — signed reads accepted</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}

/* ================================ CATALOG ================================ */
export function Catalog() {
  const { toast } = useApp()
  const [editing, setEditing] = useState(null)
  const [showSystem, setShowSystem] = useState(false)
  const { data, loading, error, reload } = useFetch(
    () => api.get('/ticket-types', { include_system: showSystem }), [showSystem])

  return (
    <>
      <PageHeader title="Ticket Catalog">
        <label className="check" style={{ marginRight: 8 }}>
          <input type="checkbox" checked={showSystem}
                 onChange={(e) => setShowSystem(e.target.checked)} />
          Show system types
        </label>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> New ticket type
        </button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
            A ticket type is data, not code. Its lifecycle stages and its form fields are
            declared here, and both the field app and the back office render straight from
            them. A new ticket type needs no release of either client.
          </div>
        </div>

        {loading && <Loading rows={5} />}
        {error && <ErrorNote error={error} onRetry={reload} />}

        {data && (
          <div className="grid c2" style={{ gap: 12 }}>
            {data.items.map((t) => (
              <div className="card" key={t.id} style={{ padding: 15 }}>
                <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flex: 'none',
                    background: `${t.color || '#3b82f6'}22`, color: t.color || '#3b82f6',
                    display: 'grid', placeItems: 'center',
                  }}>
                    <Icon name="layers" size={17} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 7 }}>
                      <b style={{ fontSize: 14 }}>{t.label}</b>
                      <span className="mono dim" style={{ fontSize: 11.5 }}>{t.code}</span>
                      {t.is_system && <Badge tone="amber">System</Badge>}
                      {!t.billable && <Badge>Non-billable</Badge>}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 5,
                                                    lineHeight: 1.6 }}>
                      {t.description}
                    </div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                      <Badge>{(t.stage_schema || []).length} stages</Badge>
                      <Badge>{(t.field_schema || []).length} fields</Badge>
                      {t.requires_barcode && <Badge tone="blue">Barcode</Badge>}
                      {t.requires_photo && <Badge tone="blue">Photo</Badge>}
                      {t.supports_waypoints && <Badge tone="blue">Waypoints</Badge>}
                    </div>
                    <div className="timeline" style={{ marginTop: 12 }}>
                      {(t.stage_schema || []).map((s) => (
                        <div className="tl-item" key={s.code} style={{ paddingBottom: 9 }}>
                          <div className="tl-title" style={{ fontSize: 12.5 }}>{s.label}</div>
                          <div className="tl-meta" style={{ fontSize: 11.5 }}>
                            {(s.captures || []).join(' · ')}
                            {s.completes_ticket && ' · completes the ticket'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {!t.is_system && (
                    <button className="btn sm" onClick={() => setEditing(t)}>Edit</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <TicketTypeForm type={editing} toast={toast} onClose={() => setEditing(null)}
                        onSaved={() => { setEditing(null); reload() }} />
      )}
    </>
  )
}

const FIELD_TYPES = ['text', 'textarea', 'number', 'percent', 'select', 'multiselect',
                     'boolean', 'date', 'datetime', 'gps', 'photo', 'barcode', 'signature']

function TicketTypeForm({ type, toast, onClose, onSaved }) {
  const isNew = !type.id
  const [form, setForm] = useState({
    code: type.code || '', label: type.label || '', kind: type.kind || 'custom',
    description: type.description || '', billable: type.billable ?? true,
    requires_equipment: type.requires_equipment ?? false,
    requires_barcode: type.requires_barcode ?? false,
    requires_photo: type.requires_photo ?? false,
    supports_waypoints: type.supports_waypoints ?? false,
    color: type.color || '#3b82f6', sort_order: type.sort_order ?? 500,
    stage_schema: type.stage_schema || [
      { code: 'work', label: 'Work', sequence: 1, required: true, completes_ticket: true,
        captures: ['gps', 'photo'] }],
    field_schema: type.field_schema || [],
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      if (isNew) await api.post('/ticket-types', form)
      else await api.put(`/ticket-types/${type.id}`, form)
      toast(isNew ? 'Ticket type created' : 'Ticket type updated', form.label)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal wide title={isNew ? 'New ticket type' : form.label} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.code || !form.label}
                onClick={save}>{busy && <span className="spinner" />} {isNew ? 'Create' : 'Save'}</button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                       borderColor: 'var(--red)', background: 'var(--red-soft)',
                       color: 'var(--red)' }}>{error}</div>}

      <div className="stack" style={{ gap: 16 }}>
        <div className="grid c3" style={{ gap: 12 }}>
          <Field label="Code" required hint="Uppercase, stable">
            <input className="input mono" value={form.code} disabled={!isNew}
                   onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })} />
          </Field>
          <Field label="Label" required>
            <input className="input" value={form.label}
                   onChange={(e) => set({ label: e.target.value })} />
          </Field>
          <Field label="Kind">
            <select className="select" value={form.kind}
                    onChange={(e) => set({ kind: e.target.value })}>
              {['load', 'haul_out', 'unit_rate', 'incident', 'custom'].map((k) => (
                <option key={k} value={k}>{fmt.title(k)}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea className="textarea" value={form.description}
                    onChange={(e) => set({ description: e.target.value })} />
        </Field>

        <div className="row wrap" style={{ gap: 16 }}>
          {[['billable', 'Billable'], ['requires_equipment', 'Requires equipment'],
            ['requires_barcode', 'Requires a barcode'], ['requires_photo', 'Requires a photo'],
            ['supports_waypoints', 'Supports waypoints']].map(([key, label]) => (
            <label className="check" key={key}>
              <input type="checkbox" checked={form[key]}
                     onChange={(e) => set({ [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 560, color: 'var(--text-muted)' }}>
              Lifecycle stages
            </label>
            <div className="spacer" />
            <button className="btn sm" onClick={() => set({ stage_schema: [...form.stage_schema, {
              code: `stage_${form.stage_schema.length + 1}`,
              label: `Stage ${form.stage_schema.length + 1}`,
              sequence: form.stage_schema.length + 1, required: true,
              completes_ticket: false, captures: [],
            }] })}>
              <Icon name="plus" size={13} /> Add stage
            </button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {form.stage_schema.map((s, i) => (
              <div className="statement" key={i}
                   style={{ gridTemplateColumns: '130px 1fr 150px 30px' }}>
                <input className="input mono" value={s.code} placeholder="code"
                       onChange={(e) => set({ stage_schema: form.stage_schema.map((x, j) =>
                         (j === i ? { ...x, code: e.target.value } : x)) })} />
                <input className="input" value={s.label} placeholder="Label"
                       onChange={(e) => set({ stage_schema: form.stage_schema.map((x, j) =>
                         (j === i ? { ...x, label: e.target.value } : x)) })} />
                <label className="check">
                  <input type="checkbox" checked={Boolean(s.completes_ticket)}
                         onChange={(e) => set({ stage_schema: form.stage_schema.map((x, j) =>
                           (j === i ? { ...x, completes_ticket: e.target.checked } : x)) })} />
                  Completes
                </label>
                <button className="btn ghost icon sm"
                        onClick={() => set({ stage_schema: form.stage_schema.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
          </div>
          {!form.stage_schema.some((s) => s.completes_ticket) && (
            <div className="err" style={{ fontSize: 11.5, marginTop: 6, color: 'var(--amber)' }}>
              At least one stage must complete the ticket, or it can never become billable.
            </div>
          )}
        </div>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 560, color: 'var(--text-muted)' }}>
              Form fields
            </label>
            <div className="spacer" />
            <button className="btn sm" onClick={() => set({ field_schema: [...form.field_schema, {
              key: `field_${form.field_schema.length + 1}`, label: 'New field',
              type: 'text', required: false,
              stage: form.stage_schema[0]?.code,
            }] })}>
              <Icon name="plus" size={13} /> Add field
            </button>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            {form.field_schema.map((f, i) => (
              <div className="statement" key={i}
                   style={{ gridTemplateColumns: '140px 1fr 120px 120px 30px' }}>
                <input className="input mono" value={f.key} placeholder="key"
                       onChange={(e) => set({ field_schema: form.field_schema.map((x, j) =>
                         (j === i ? { ...x, key: e.target.value } : x)) })} />
                <input className="input" value={f.label} placeholder="Label"
                       onChange={(e) => set({ field_schema: form.field_schema.map((x, j) =>
                         (j === i ? { ...x, label: e.target.value } : x)) })} />
                <select className="select" value={f.type}
                        onChange={(e) => set({ field_schema: form.field_schema.map((x, j) =>
                          (j === i ? { ...x, type: e.target.value } : x)) })}>
                  {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <select className="select" value={f.stage || ''}
                        onChange={(e) => set({ field_schema: form.field_schema.map((x, j) =>
                          (j === i ? { ...x, stage: e.target.value } : x)) })}>
                  {form.stage_schema.map((s) => (
                    <option key={s.code} value={s.code}>{s.label}</option>
                  ))}
                </select>
                <button className="btn ghost icon sm"
                        onClick={() => set({ field_schema: form.field_schema.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* =============================== SETTINGS ================================ */
export function Settings() {
  const { user, theme, setTheme, permissions, lookups } = useApp()
  const [changing, setChanging] = useState(false)

  return (
    <>
      <PageHeader title="Settings" />
      <div className="page grid c2" style={{ alignItems: 'start' }}>
        <div className="stack">
          <Card title="Account">
            <dl className="kv">
              <dt>Name</dt><dd>{user?.full_name}</dd>
              <dt>Username</dt><dd className="mono">{user?.username}</dd>
              <dt>Monitor ID</dt><dd className="mono">{user?.monitor_id || '—'}</dd>
              <dt>Email</dt><dd>{user?.email || '—'}</dd>
              <dt>Role</dt><dd><Badge>{user?.role_label}</Badge></dd>
            </dl>
            <button className="btn" style={{ marginTop: 14 }} onClick={() => setChanging(true)}>
              Change password
            </button>
          </Card>

          <Card title="Appearance">
            <div className="seg">
              {['dark', 'light'].map((t) => (
                <button key={t} className={theme === t ? 'on' : ''} onClick={() => setTheme(t)}>
                  <Icon name={t === 'dark' ? 'moon' : 'sun'} size={13} /> {fmt.title(t)}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <Card title="Your permissions"
              sub={`${permissions.length} of ${(lookups?.permissions || []).length} in the system`}>
          <div className="stack" style={{ gap: 12 }}>
            {Object.entries(
              (lookups?.permissions || []).reduce((acc, p) => {
                (acc[p.domain] ||= []).push(p)
                return acc
              }, {})
            ).map(([domain, items]) => (
              <div key={domain}>
                <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                                letterSpacing: '0.06em', marginBottom: 6 }}>
                  {domain}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {items.map((p) => (
                    <span key={p.code} className={`badge ${permissions.includes(p.code) ? 'green' : ''}`}
                          style={{ opacity: permissions.includes(p.code) ? 1 : 0.45 }}>
                      {p.label}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {changing && <PasswordModal onClose={() => setChanging(false)} />}
    </>
  )
}

function PasswordModal({ onClose }) {
  const { toast } = useApp()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    try {
      await api.post('/auth/password', { current_password: current, new_password: next })
      toast('Password changed', 'Other sessions were signed out')
      onClose()
    } catch (err) { toast('Could not change password', err.message, 'err') }
    finally { setBusy(false) }
  }

  return (
    <Modal title="Change password" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || next.length < 8} onClick={save}>
          {busy && <span className="spinner" />} Change password
        </button>
      </>
    }>
      <div className="stack">
        <Field label="Current password" required>
          <input className="input" type="password" value={current} autoFocus
                 onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" required hint="At least 8 characters">
          <input className="input" type="password" value={next}
                 onChange={(e) => setNext(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

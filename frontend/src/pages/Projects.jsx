/**
 * The projects list, worked at a level above any single project.
 *
 * Built in the same idiom as the tickets list, because that is the list people
 * already know how to operate: search, filters, sortable columns, a row you
 * click into. Clicking a row enters the project and everything below this
 * screen becomes project-scoped.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Icon, Loading, Search, Stat, useDebounced,
} from '../components/ui'

const PAGE = 50

const COLUMNS = [
  { key: 'code', label: 'Code', sortable: true },
  { key: 'name', label: 'Project', sortable: true },
  { key: 'client', label: 'Client', sortable: true },
  { key: 'program', label: 'Program', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'readiness', label: 'Readiness', sortable: true },
  { key: 'open_tickets', label: 'Open', sortable: true, num: true },
  { key: 'cubic_yards', label: 'CY to date', sortable: true, num: true },
  { key: 'billed', label: 'Billed', sortable: true, num: true },
  { key: 'permits', label: 'Permits', sortable: true, num: true },
]

export default function Projects() {
  const { can, lookups, enterProject } = useApp()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [filters, setFilters] = useState({ status: '', client_id: '', program_code: '', readiness: '' })
  const [sort, setSort] = useState('status')
  const [offset, setOffset] = useState(0)


  useEffect(() => { setOffset(0) }, [search, filters, sort])

  const query = useMemo(() => ({
    q: search || undefined, limit: PAGE, offset, sort,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }), [search, offset, sort, filters])

  const { data, loading, error, reload } = useFetch(
    () => api.get('/projects', query), [JSON.stringify(query)])
  const summary = useFetch(() => api.get('/projects/summary'), [])
  const clients = useFetch(() => api.get('/clients', { limit: 200 }), [])

  function open(project) {
    enterProject(project.id)
    navigate('/')
  }

  const filtered = Object.values(filters).some(Boolean)

  return (
    <>
      <PageHeader title="Projects">
        {can('project.create') && (
          <button className="btn primary" onClick={() => navigate('/projects/new')}>
            <Icon name="plus" size={14} /> New project
          </button>
        )}
        <button className="btn icon" onClick={reload}><Icon name="refresh" size={15} /></button>
      </PageHeader>

      <div className="page">
        {summary.data && (
          <div className="grid c4" style={{ gap: 12, marginBottom: 14 }}>
            <Stat label="Projects" value={fmt.int(summary.data.projects)}
                  detail={`${fmt.int(summary.data.active)} active · ${fmt.int(summary.data.in_setup)} in setup`} />
            <Stat label="Open tickets" value={fmt.int(summary.data.open_tickets)} />
            <Stat label="Cubic yards to date" value={fmt.int(summary.data.cubic_yards)} />
            <Stat label="Billed to date" value={fmt.money(summary.data.billed, 0)}
                  detail={summary.data.permits_pending > 0
                    ? `${fmt.int(summary.data.permits_pending)} permit(s) pending, nothing blocked`
                    : 'No permits outstanding'} />
          </div>
        )}

        <Card flush>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 9 }}>
            <Search value={q} onChange={setQ} placeholder="Project name or code" />
            <select className="select" style={{ width: 150 }} value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any status</option>
              {['setup', 'active', 'paused', 'closeout', 'closed', 'archived'].map((s) => (
                <option key={s} value={s}>{fmt.title(s)}</option>
              ))}
            </select>
            <select className="select" style={{ width: 190 }} value={filters.client_id}
                    onChange={(e) => setFilters({ ...filters, client_id: e.target.value })}>
              <option value="">Any client</option>
              {(clients.data?.items || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="select" style={{ width: 190 }} value={filters.program_code}
                    onChange={(e) => setFilters({ ...filters, program_code: e.target.value })}>
              <option value="">Any program</option>
              {(lookups?.programs || []).map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>
            <select className="select" style={{ width: 170 }} value={filters.readiness}
                    onChange={(e) => setFilters({ ...filters, readiness: e.target.value })}>
              <option value="">Any readiness</option>
              <option value="ready">Ready for field</option>
              <option value="not_ready">Not ready</option>
              <option value="billing_ready">Ready for billing</option>
            </select>
            {filtered && (
              <button className="btn ghost sm" onClick={() => setFilters(
                { status: '', client_id: '', program_code: '', readiness: '' })}>
                <Icon name="x" size={13} /> Clear
              </button>
            )}
          </div>

          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}
          {loading && <Loading rows={8} />}

          {data && !loading && (data.items.length === 0 ? (
            <Empty icon="folder" title="No projects match"
                   action={can('project.create') ? (
                     <button className="btn primary" onClick={() => navigate('/projects/new')}>
                       <Icon name="plus" size={14} /> New project
                     </button>) : null}>
              {filtered ? 'Adjust the filters to widen the search.'
                        : 'Nothing has been set up on this instance yet.'}
            </Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      {COLUMNS.map((c) => (
                        <th key={c.key}
                            className={`${c.num ? 'num ' : ''}${c.sortable ? 'sortable' : ''}`}
                            onClick={c.sortable ? () => setSort(c.key) : undefined}>
                          {c.label}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p) => (
                      <tr key={p.id} className="clickable" onClick={() => open(p)}>
                        <td className="mono" style={{ whiteSpace: 'nowrap' }}>
                          {p.project_code}
                        </td>
                        <td style={{ fontWeight: 550 }} className="truncate">{p.name}</td>
                        <td className="truncate" style={{ maxWidth: 180 }}>{p.client_name}</td>
                        <td className="muted">{p.program_label || p.program || '—'}</td>
                        <td><Badge status={p.status} /></td>
                        <td><ReadinessCell project={p} /></td>
                        <td className="num">{fmt.int(p.ticket_open)}</td>
                        <td className="num">{fmt.int(p.total_cubic_yards)}</td>
                        <td className="num">{fmt.money(p.billable_total, 0)}</td>
                        <td className="num">
                          {p.permits_pending > 0 ? (
                            <Badge tone={p.permits_overdue > 0 ? 'red' : 'amber'}>
                              {fmt.int(p.permits_pending)}
                            </Badge>
                          ) : <span className="dim">—</span>}
                        </td>
                        <td style={{ width: 30, textAlign: 'right' }} className="dim">
                          <Icon name="chevron" size={13} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pager">
                <span>
                  {fmt.int(offset + 1)}–{fmt.int(offset + data.items.length)} of {fmt.int(data.total)}
                </span>
                <div className="spacer" />
                <button className="btn sm" disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
                <button className="btn sm" disabled={!data.has_more}
                        onClick={() => setOffset(offset + PAGE)}>Next</button>
              </div>
            </>
          ))}
        </Card>
      </div>

    </>
  )
}

function ReadinessCell({ project }) {
  if (project.ready_for_field && project.ready_for_billing) {
    return <Badge tone="green">Ready</Badge>
  }
  if (project.ready_for_field) return <Badge tone="blue">Field only</Badge>
  const missing = (project.missing || []).length
  return (
    <Badge tone="amber" >
      {missing ? `${missing} missing` : 'Not ready'}
    </Badge>
  )
}

/**
 * Ticket review: the screen a data manager works all day.
 *
 * The dashboard answers what the project produced. This answers what looks
 * wrong, which is the actual 9am job three weeks into an event:
 *
 *   "we are hunting for the issues: times that don't make sense, duplicate
 *    tickets ... location data that doesn't match up"
 *
 *   "I spend most of my day auditing tickets for accuracy ... and then marking
 *    each ticket QC approved or if there is some issue"
 *
 * Two things follow from that sentence and shape the whole screen. It is a
 * QUEUE, so the default is unreviewed work with the worst first and the row
 * carries enough to decide without opening anything. And it is a LOT of
 * tickets, so approving is one keystroke, selection is bulk, and the ticket
 * opens beside the queue instead of navigating away from it.
 */
import { useEffect, useMemo, useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, rowProps, Search,
  Stat, useDebounced,
} from '../components/ui'
import { TicketDrawer } from './Tickets'

const SEVERITY_TONE = { serious: 'red', review: 'amber', info: 'blue', none: undefined }
const PAGE = 60

export default function Review() {
  const { project, can, toast } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [state, setState] = useState('pending')
  const [severity, setSeverity] = useState('')
  const [flagCode, setFlagCode] = useState('')
  const [monitorId, setMonitorId] = useState('')
  const [sort, setSort] = useState('worst')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(() => new Set())
  const [openId, setOpenId] = useState(null)
  const [flagging, setFlagging] = useState(null)
  const [scanning, setScanning] = useState(false)

  const kinds = useFetch(() => api.get('/flag-kinds'), [])
  const summary = useFetch(
    () => (project ? api.get(`/projects/${project.id}/review/summary`) : null),
    [project?.id, state])
  const monitors = useFetch(
    () => (project ? api.get(`/projects/${project.id}/monitor-accuracy`) : null),
    [project?.id])

  const query = {
    state, limit: PAGE, offset, sort,
    q: search || undefined,
    severity: severity || undefined,
    flag_code: flagCode || undefined,
    monitor_id: monitorId || undefined,
  }
  const { data, loading, error, reload } = useFetch(
    () => (project ? api.get(`/projects/${project.id}/review`, query) : null),
    [project?.id, state, severity, flagCode, monitorId, sort, search, offset])

  useEffect(() => { setOffset(0); setSelected(new Set()) },
    [state, severity, flagCode, monitorId, search, project?.id])

  if (!project) {
    return (<><PageHeader title="Review" /><div className="page">
      <Empty icon="check" title="No project in context">
        Reviewing is work on one project's tickets, so pick one first.
      </Empty></div></>)
  }

  const rows = data?.items || []
  const s = summary.data

  function toggle(id) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  async function scan() {
    setScanning(true)
    try {
      const result = await api.post(`/projects/${project.id}/review/scan`)
      toast('Checked', result.message)
      reload(); summary.reload()
    } catch (err) {
      toast('Scan failed', err.message, 'err')
    } finally { setScanning(false) }
  }

  async function decide(ids, next, extra = {}) {
    try {
      if (ids.length === 1) {
        await api.post(`/tickets/${ids[0]}/review`, { state: next, ...extra })
      } else {
        await api.post(`/projects/${project.id}/review/bulk`,
                       { ticket_ids: ids, state: next, ...extra })
      }
      toast(next === 'approved' ? 'Approved' : 'Flagged',
            `${ids.length} ticket${ids.length === 1 ? '' : 's'}`)
      setSelected(new Set())
      reload(); summary.reload(); monitors.reload()
    } catch (err) {
      toast('Could not save', err.message, 'err')
    }
  }

  return (
    <>
      <PageHeader title="Review" crumb={project.project_code}>
        {can('ticket.update') && (
          <button className="btn sm" onClick={scan} disabled={scanning}>
            {scanning ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
            {' '}Re-check every ticket
          </button>
        )}
      </PageHeader>

      <div className="page stack">
        {s && (
          <div className="grid c4">
            <Stat label="Not looked at" value={fmt.int(s.unreviewed)}
                  detail={`${fmt.money(s.unreviewed_value)} of work`} />
            <Stat label="Serious" value={fmt.int(s.serious)}
                  tone={s.serious ? 'red' : undefined} />
            <Stat label="Carrying a flag" value={fmt.int(s.with_flags)}
                  tone={s.with_flags ? 'amber' : undefined} />
            <Stat label="Approved" value={fmt.int(s.approved)} tone="green" />
          </div>
        )}

        {s?.by_flag?.length > 0 && (
          <Card title="What the checks are finding"
                sub="Click one to work only those tickets">
            <div className="row wrap" style={{ gap: 8 }}>
              {s.by_flag.map((f) => (
                <button key={f.code}
                        className={`btn sm${flagCode === f.code ? ' primary' : ''}`}
                        title={f.description}
                        onClick={() => setFlagCode(flagCode === f.code ? '' : f.code)}>
                  <span style={{ color: `var(--${SEVERITY_TONE[f.severity] || 'text-muted'})` }}>
                    ●
                  </span>{' '}
                  {f.label} <b>{f.tickets}</b>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card flush>
          <div className="card-head">
            <Search value={q} onChange={setQ} placeholder="Ticket, unit or monitor" />
            <select className="select" style={{ width: 150 }} value={state}
                    aria-label="Review state" onChange={(e) => setState(e.target.value)}>
              <option value="pending">Not looked at</option>
              <option value="flagged">Flagged</option>
              <option value="approved">Approved</option>
              <option value="resolved">Resolved</option>
              <option value="all">Everything</option>
            </select>
            <select className="select" style={{ width: 130 }} value={severity}
                    aria-label="Severity" onChange={(e) => setSeverity(e.target.value)}>
              <option value="">Any severity</option>
              <option value="serious">Serious</option>
              <option value="review">Worth a look</option>
              <option value="info">For information</option>
            </select>
            <select className="select" style={{ width: 170 }} value={monitorId}
                    aria-label="Monitor" onChange={(e) => setMonitorId(e.target.value)}>
              <option value="">Any monitor</option>
              {(monitors.data?.items || []).map((m) => (
                <option key={m.monitor_id} value={m.monitor_id}>{m.monitor_name}</option>
              ))}
            </select>
            <select className="select" style={{ width: 140 }} value={sort}
                    aria-label="Order" onChange={(e) => setSort(e.target.value)}>
              <option value="worst">Worst first</option>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="value">Most valuable</option>
            </select>
            <div className="spacer" />
            {flagCode && (
              <button className="btn sm" onClick={() => setFlagCode('')}>Clear flag filter</button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="card-head" style={{ background: 'var(--accent-soft)' }}>
              <b>{selected.size} selected</b>
              <div className="spacer" />
              <button className="btn sm" onClick={() => setSelected(new Set())}>Clear</button>
              <button className="btn sm"
                      onClick={() => setFlagging([...selected])}>Flag these</button>
              <button className="btn sm primary"
                      onClick={() => decide([...selected], 'approved')}>
                Approve {selected.size}
              </button>
            </div>
          )}

          {loading && <Loading rows={8} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (rows.length === 0 ? (
            <Empty icon="check" title={state === 'pending'
              ? 'Everything has been looked at'
              : 'Nothing here'}>
              {state === 'pending'
                ? 'Every ticket on this project has a review decision on it.'
                : 'Try a different state or clear the filters.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" aria-label="Select all on this page"
                           checked={rows.every((r) => selected.has(r.ticket_id))}
                           onChange={(e) => setSelected(e.target.checked
                             ? new Set(rows.map((r) => r.ticket_id)) : new Set())} />
                  </th>
                  <th>Ticket</th><th>Type</th><th>Monitor</th><th>Unit</th>
                  <th className="num">CY</th><th className="num">Value</th>
                  <th>What the check saw</th><th>State</th><th />
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.ticket_id} {...rowProps(() => setOpenId(r.ticket_id))}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${r.ticket_number}`}
                               checked={selected.has(r.ticket_id)}
                               onChange={() => toggle(r.ticket_id)} />
                      </td>
                      <td>
                        <b>{r.ticket_number}</b>
                        <div className="dim" style={{ fontSize: 11 }}>
                          {fmt.date(r.completed_at)}
                        </div>
                      </td>
                      <td>{r.ticket_type_code}</td>
                      <td>{r.monitor_name || '—'}</td>
                      <td>{r.unit_number || '—'}</td>
                      <td className="num">{fmt.number(r.billable_cubic_yards, 1)}</td>
                      <td className="num">{fmt.money(r.transaction_total)}</td>
                      <td>
                        {(r.flag_codes || []).length === 0
                          ? <span className="dim">Nothing flagged</span>
                          : <FlagChips codes={r.flag_codes} kinds={kinds.data?.items}
                                       worst={r.worst_severity} />}
                      </td>
                      <td><Badge tone={r.review_state === 'approved' ? 'green'
                        : r.review_state === 'flagged' ? 'red'
                          : r.review_state === 'resolved' ? 'blue' : undefined}>
                        {r.review_state === 'pending' ? 'Not looked at'
                          : fmt.title(r.review_state)}
                      </Badge></td>
                      <td onClick={(e) => e.stopPropagation()}
                          style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {can('ticket.update') && r.review_state !== 'approved' && (
                          <button className="btn sm"
                                  onClick={() => decide([r.ticket_id], 'approved')}>
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {data && data.total > PAGE && (
            <div className="card-head" style={{ borderTop: '1px solid var(--line)' }}>
              <span className="dim" style={{ fontSize: 13 }}>
                {offset + 1} to {Math.min(offset + PAGE, data.total)} of {fmt.int(data.total)}
              </span>
              <div className="spacer" />
              <button className="btn sm" disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
              <button className="btn sm" disabled={offset + PAGE >= data.total}
                      onClick={() => setOffset(offset + PAGE)}>Next</button>
            </div>
          )}
        </Card>

        {monitors.data?.items?.length > 0 && (
          <Card title="Monitor accuracy"
                sub="Approval rate over reviewed work, so nobody is judged on tickets nobody has read yet">
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Monitor</th><th className="num">Tickets</th>
                  <th className="num">Approved</th><th className="num">Flagged</th>
                  <th className="num">Not looked at</th><th className="num">Rate</th><th />
                </tr></thead>
                <tbody>
                  {monitors.data.items.map((m) => (
                    <tr key={m.monitor_id}
                        {...rowProps(() => { setMonitorId(m.monitor_id); setState('all') })}>
                      <td><b>{m.monitor_name}</b></td>
                      <td className="num">{fmt.int(m.tickets)}</td>
                      <td className="num">{fmt.int(m.approved)}</td>
                      <td className="num">{fmt.int(m.flagged)}</td>
                      <td className="num dim">{fmt.int(m.unreviewed)}</td>
                      <td className="num">
                        {m.approval_rate === null
                          ? <span className="dim">Nothing reviewed</span>
                          : <b style={{ color: m.approval_rate < 80 ? 'var(--red)' : undefined }}>
                              {fmt.number(m.approval_rate, 1)}%
                            </b>}
                      </td>
                      <td className="dim" style={{ width: 24, textAlign: 'right' }}>
                        <Icon name="chevron" size={13} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {openId && (
        <TicketDrawer ticketId={openId} onClose={() => setOpenId(null)}
                      onChanged={() => { reload(); summary.reload() }} />
      )}

      {flagging && (
        <FlagModal count={flagging.length} kinds={kinds.data?.items || []}
                   onClose={() => setFlagging(null)}
                   onSubmit={(issue, notes) => {
                     decide(flagging, 'flagged', { issue_code: issue, notes })
                     setFlagging(null)
                   }} />
      )}
    </>
  )
}

function FlagChips({ codes, kinds, worst }) {
  const byCode = useMemo(
    () => Object.fromEntries((kinds || []).map((k) => [k.code, k])), [kinds])
  return (
    <div className="row wrap" style={{ gap: 5 }}>
      {codes.map((code) => {
        const kind = byCode[code]
        return (
          <span key={code} className={`badge ${SEVERITY_TONE[kind?.severity || worst] || ''}`}
                title={kind?.description || code}>
            {kind?.label || code}
          </span>
        )
      })}
    </div>
  )
}

/**
 * Flagging says what is wrong. A flag with no claim behind it is just a ticket
 * somebody moved past, which is why the API refuses one and this asks for it.
 */
function FlagModal({ count, kinds, onClose, onSubmit }) {
  const [issue, setIssue] = useState('')
  const [notes, setNotes] = useState('')
  return (
    <Modal title={count === 1 ? 'Flag this ticket' : `Flag ${count} tickets`}
           onClose={onClose} footer={
             <>
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className="btn danger"
                       disabled={!issue && notes.trim().length < 4}
                       onClick={() => onSubmit(issue || undefined, notes || undefined)}>
                 Flag
               </button>
             </>
           }>
      <p className="muted" style={{ marginTop: 0 }}>
        Flagging does not stop the ticket billing. It puts it on somebody's list
        with a note about what has to be fixed.
      </p>
      <div className="stack">
        <Field label="What is wrong">
          <select className="select" value={issue} onChange={(e) => setIssue(e.target.value)}>
            <option value="">Something else, described below</option>
            {kinds.map((k) => (
              <option key={k.code} value={k.code}>{k.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Note" hint="What the next person has to do about it">
          <textarea className="input" rows={3} value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Monitor needs to re-shoot the pre photo before this can bill" />
        </Field>
      </div>
    </Modal>
  )
}

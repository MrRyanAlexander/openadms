/**
 * Review: the data manager's day.
 *
 * Two screens. A queue, because a list is still the right way to see what is
 * waiting. And a record, which is the part that needed rebuilding.
 *
 * The old flow was: click an item, a drawer opens, click through five tabs to
 * understand it, click each image to see it, then find the close control next
 * to Void. Every one of those is a problem the requirement names. So:
 *
 *   The record is one scrollable view, in the order a person actually reads
 *   it. Identity, why it is here, where, when, who and what, the arithmetic,
 *   the evidence, the notes, the rules, what else is related, decide.
 *
 *   The evidence is shown at a size somebody can judge, with what was required
 *   beside what arrived, so a missing photograph is a labelled gap rather than
 *   an absence nobody notices.
 *
 *   The location is on imagery with the rest of that monitor and truck's day,
 *   because that comparison currently happens in a second browser window.
 *
 *   Approve, Flag and Update are the exposed actions and take one keystroke.
 *   Void is destructive and rare, so it sits inside a menu with Re-run rules
 *   and Reprice, away from the close control.
 *
 * The queue is across kinds. A certification is reviewed the same way a ticket
 * is, which is what the requirement asks for. Invoices are not here: they are
 * an invoice analyst's job.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, rowProps, Search,
  Stat, useDebounced,
} from '../components/ui'
import {
  EvidenceStrip, FlagCard, Lightbox, RepeatChip, ReviewMap, SEVERITY_TONE,
  TimeSequence,
} from '../components/review-bits'
import { EvidenceChecklist, ShapeDiagram, feetAndInches } from '../components/measure-bits'
import { TicketCorrection } from './Tickets'

const PAGE = 60

const KIND_ICON = {
  ticket: 'invoice', certification: 'truck', permit: 'folder', contract: 'folder',
}

export default function Review() {
  const { project, can, toast } = useApp()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [state, setState] = useState('pending')
  const [subjectKind, setSubjectKind] = useState('')
  const [recordKind, setRecordKind] = useState('')
  const [severity, setSeverity] = useState('')
  const [issueCode, setIssueCode] = useState('')
  const [partyId, setPartyId] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [escalatedOnly, setEscalatedOnly] = useState(false)
  const [sort, setSort] = useState('worst')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState(() => new Set())
  const [open, setOpen] = useState(null)
  const [flagging, setFlagging] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [params, setParams] = useSearchParams()

  // An alert in somebody's inbox links straight here, at the record it is
  // about, so being told about work and doing it are one click apart.
  useEffect(() => {
    const asked = params.get('open')
    if (!asked) return
    const [kind, id] = asked.split(':')
    if (kind && id) setOpen({ subject_kind: kind, subject_id: id })
  }, [params])

  const overview = useFetch(
    () => (project ? api.get(`/projects/${project.id}/review/overview`) : null),
    [project?.id, state])
  const monitors = useFetch(
    () => (project ? api.get(`/projects/${project.id}/monitor-accuracy`) : null),
    [project?.id])
  const kinds = useFetch(() => api.get('/issue-kinds'), [])

  const query = {
    state, limit: PAGE, offset, sort,
    q: search || undefined,
    subject_kind: subjectKind || undefined,
    record_kind: recordKind || undefined,
    severity: severity || undefined,
    issue_code: issueCode || undefined,
    party_id: partyId || undefined,
    overdue_only: overdueOnly || undefined,
    escalated_only: escalatedOnly || undefined,
  }
  const { data, loading, error, reload } = useFetch(
    () => (project ? api.get(`/projects/${project.id}/review/queue`, query) : null),
    [project?.id, state, subjectKind, recordKind, severity, issueCode, partyId,
     overdueOnly, escalatedOnly, sort, search, offset])

  useEffect(() => { setOffset(0); setSelected(new Set()) },
    [state, subjectKind, recordKind, severity, issueCode, partyId, overdueOnly,
     escalatedOnly, search, project?.id])

  const rows = data?.items || []
  const refresh = useCallback(() => {
    reload(); overview.reload(); monitors.reload()
  }, [reload, overview, monitors])

  // Working a queue means moving through it. The record view can step to the
  // next one without going back to the list.
  const step = useCallback((delta) => {
    if (!open) return
    const i = rows.findIndex((r) => r.subject_id === open.subject_id)
    const next = rows[i + delta]
    if (next) setOpen({ subject_kind: next.subject_kind, subject_id: next.subject_id })
  }, [open, rows])

  if (!project) {
    return (<><PageHeader title="Review" /><div className="page">
      <Empty icon="check" title="No project in context">
        Reviewing is work on one project's records, so pick one first.
      </Empty></div></>)
  }

  const o = overview.data

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
      refresh()
    } catch (err) {
      toast('Could not run the checks', err.message, 'err')
    } finally { setScanning(false) }
  }

  async function decide(items, next, extra = {}) {
    try {
      await Promise.all(items.map((it) => api.post(
        `/review/${it.subject_kind}/${it.subject_id}/decision`,
        { state: next, ...extra })))
      toast(next === 'approved' ? 'Approved' : fmt.title(next),
            `${items.length} record${items.length === 1 ? '' : 's'}`)
      setSelected(new Set())
      refresh()
    } catch (err) {
      toast('Could not save', err.message, 'err')
    }
  }

  const selectedRows = rows.filter((r) => selected.has(r.subject_id))

  return (
    <>
      <PageHeader title="Review" crumb={project.project_code}>
        {can('ticket.update') && (
          <button className="btn sm" onClick={scan} disabled={scanning}>
            {scanning ? <span className="spinner" /> : <Icon name="refresh" size={13} />}
            {' '}Re-check everything
          </button>
        )}
      </PageHeader>

      <div className="page stack">
        {o && (
          <div className="grid c4">
            <Stat label="Not looked at" value={fmt.int(o.totals.unreviewed)}
                  detail={`${fmt.int(o.totals.records)} records in scope`} />
            <Stat label="Serious" value={fmt.int(o.totals.serious)}
                  tone={o.totals.serious ? 'red' : undefined} />
            <Stat label={`Waiting over ${o.policy.overdue_days} days`}
                  value={fmt.int(o.totals.overdue)}
                  tone={o.totals.overdue ? 'amber' : undefined} />
            <Stat label="Escalated" value={fmt.int(o.totals.escalated)}
                  detail={o.escalation_candidates
                    ? `${o.escalation_candidates} more qualify` : undefined}
                  tone={o.totals.escalated ? 'violet' : undefined} />
          </div>
        )}

        {o?.by_kind?.length > 1 && (
          <div className="row wrap" style={{ gap: 8 }}>
            <button className={`btn sm${subjectKind === '' ? ' primary' : ''}`}
                    onClick={() => setSubjectKind('')}>
              Everything <b>{fmt.int(o.totals.records)}</b>
            </button>
            {o.by_kind.map((k) => (
              <button key={k.subject_kind}
                      className={`btn sm${subjectKind === k.subject_kind ? ' primary' : ''}`}
                      onClick={() => setSubjectKind(
                        subjectKind === k.subject_kind ? '' : k.subject_kind)}>
                <Icon name={KIND_ICON[k.subject_kind] || 'folder'} size={13} />
                {' '}{k.plural_label} <b>{fmt.int(k.unreviewed)}</b>
                {k.serious > 0 && (
                  <span style={{ color: 'var(--red)' }}> · {k.serious} serious</span>
                )}
              </button>
            ))}
          </div>
        )}

        {o?.repeating?.length > 0 && (
          <Card title="The same problem, again"
                sub={`Counted over the last ${o.policy.repeat_window_days} days. `
                     + `${o.policy.repeat_count} or more is a pattern on this project`}>
            <div className="stack" style={{ gap: 0 }}>
              {o.repeating.slice(0, 5).map((p, i) => (
                <div key={`${p.issue_code}-${p.party_id}-${i}`} className="row"
                     style={{ gap: 10, padding: '8px 0',
                              borderTop: i ? '1px solid var(--line)' : 'none' }}>
                  <span className={`badge ${SEVERITY_TONE[p.severity] || ''}`}>
                    {p.open_occurrences}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: 13 }}>{p.issue_label}</b>
                    <span className="dim" style={{ fontSize: 12.5 }}>
                      {' '}from {p.party_name || 'an unnamed source'}
                      {p.contractor_name && ` at ${p.contractor_name}`}
                    </span>
                  </div>
                  <button className="btn sm" onClick={() => {
                    setIssueCode(p.issue_code); setPartyId(p.party_id || '')
                    setState('all')
                  }}>Work these</button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {o?.by_issue?.length > 0 && (
          <Card title="What the checks are finding"
                sub="Click one to work only those records">
            <div className="row wrap" style={{ gap: 8 }}>
              {o.by_issue.map((f) => (
                <button key={`${f.subject_kind}-${f.code}`}
                        className={`btn sm${issueCode === f.code ? ' primary' : ''}`}
                        title={f.description}
                        onClick={() => setIssueCode(issueCode === f.code ? '' : f.code)}>
                  <span style={{ color: `var(--${SEVERITY_TONE[f.severity] || 'text-muted'})` }}>
                    ●
                  </span>{' '}
                  {f.label} <b>{f.records}</b>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card flush>
          <div className="card-head">
            <Search value={q} onChange={setQ} placeholder="Record, unit or person" />
            <select className="select" style={{ width: 150 }} value={state}
                    aria-label="Review state" onChange={(e) => setState(e.target.value)}>
              <option value="pending">Not looked at</option>
              <option value="open">Still open</option>
              <option value="flagged">Flagged</option>
              <option value="approved">Approved</option>
              <option value="resolved">Resolved</option>
              <option value="all">Everything</option>
            </select>
            <select className="select" style={{ width: 140 }} value={recordKind}
                    aria-label="Record type"
                    onChange={(e) => setRecordKind(e.target.value)}>
              <option value="">Any type</option>
              <option value="load">Load tickets</option>
              <option value="haul_out">Haul out</option>
              <option value="unit_rate">Unit rate</option>
              <option value="incident">Incidents</option>
              <option value="custom">Surveys and custom</option>
              <option value="certification">Certifications</option>
            </select>
            <select className="select" style={{ width: 130 }} value={severity}
                    aria-label="Severity" onChange={(e) => setSeverity(e.target.value)}>
              <option value="">Any severity</option>
              <option value="serious">Serious</option>
              <option value="review">Worth a look</option>
              <option value="info">For information</option>
            </select>
            <select className="select" style={{ width: 160 }} value={partyId}
                    aria-label="Monitor" onChange={(e) => setPartyId(e.target.value)}>
              <option value="">Anyone</option>
              {(monitors.data?.items || []).map((m) => (
                <option key={m.monitor_id} value={m.monitor_id}>{m.monitor_name}</option>
              ))}
            </select>
            <select className="select" style={{ width: 140 }} value={sort}
                    aria-label="Order" onChange={(e) => setSort(e.target.value)}>
              <option value="worst">Worst first</option>
              <option value="waiting">Waiting longest</option>
              <option value="oldest">Oldest first</option>
              <option value="newest">Newest first</option>
              <option value="value">Most valuable</option>
            </select>
            <div className="spacer" />
            <button className={`btn sm${overdueOnly ? ' primary' : ''}`}
                    onClick={() => setOverdueOnly(!overdueOnly)}>Overdue</button>
            <button className={`btn sm${escalatedOnly ? ' primary' : ''}`}
                    onClick={() => setEscalatedOnly(!escalatedOnly)}>Escalated</button>
            {(issueCode || partyId || recordKind) && (
              <button className="btn sm" onClick={() => {
                setIssueCode(''); setPartyId(''); setRecordKind('')
              }}>Clear filters</button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="card-head" style={{ background: 'var(--accent-soft)' }}>
              <b>{selected.size} selected</b>
              <div className="spacer" />
              <button className="btn sm" onClick={() => setSelected(new Set())}>Clear</button>
              <button className="btn sm"
                      onClick={() => setFlagging(selectedRows)}>Flag these</button>
              <button className="btn sm primary"
                      onClick={() => decide(selectedRows, 'approved')}>
                Approve {selected.size}
              </button>
            </div>
          )}

          {loading && <Loading rows={8} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (rows.length === 0 ? (
            <Empty icon="check" title={state === 'pending'
              ? 'Everything has been looked at' : 'Nothing here'}>
              {state === 'pending'
                ? 'Every record on this project has a review decision on it.'
                : 'Try a different state or clear the filters.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox" aria-label="Select all on this page"
                           checked={rows.every((r) => selected.has(r.subject_id))}
                           onChange={(e) => setSelected(e.target.checked
                             ? new Set(rows.map((r) => r.subject_id)) : new Set())} />
                  </th>
                  <th>Record</th><th>Type</th><th>Who</th>
                  <th>Why it needs review</th>
                  <th className="num">Waiting</th>
                  <th className="num">Value</th>
                  <th>State</th><th />
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.subject_kind}-${r.subject_id}`}
                        {...rowProps(() => setOpen(r))}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${r.title}`}
                               checked={selected.has(r.subject_id)}
                               onChange={() => toggle(r.subject_id)} />
                      </td>
                      <td>
                        <b>{r.title}</b>
                        <div className="dim" style={{ fontSize: 11 }}>
                          {fmt.date(r.occurred_at)}
                          {r.unit_number && ` · ${r.unit_number}`}
                        </div>
                      </td>
                      <td>
                        <span className="row" style={{ gap: 6 }}>
                          <Icon name={KIND_ICON[r.subject_kind] || 'folder'} size={13}
                                className="dim" />
                          {r.record_kind_label}
                        </span>
                      </td>
                      <td>{r.party_name || '—'}</td>
                      <td>
                        <div className="row wrap" style={{ gap: 5 }}>
                          {(r.flag_codes || []).length === 0
                            ? <span className="dim">Nothing flagged</span>
                            : <FlagChips codes={r.flag_codes} kinds={kinds.data?.items}
                                         worst={r.worst_severity} />}
                          {(r.repeat_issues || []).map((p) => (
                            <RepeatChip key={p.issue_code} repeat={p} />
                          ))}
                        </div>
                      </td>
                      <td className="num">
                        <span style={{ color: r.is_overdue ? 'var(--amber)' : undefined }}>
                          {fmt.number(r.waiting_days, 0)}d
                        </span>
                      </td>
                      <td className="num">
                        {r.value_amount == null
                          ? <span className="dim">
                              {r.quantity ? `${fmt.number(r.quantity, 0)} CY` : '—'}
                            </span>
                          : fmt.money(r.value_amount)}
                      </td>
                      <td>
                        <Badge tone={r.review_state === 'approved' ? 'green'
                          : r.review_state === 'flagged' ? 'red'
                            : r.review_state === 'resolved' ? 'blue' : undefined}>
                          {r.review_state === 'pending' ? 'Not looked at'
                            : fmt.title(r.review_state)}
                        </Badge>
                        {r.escalation_level !== 'none' && (
                          <div style={{ marginTop: 3 }}>
                            <span className="badge violet">
                              {fmt.title(r.escalation_level)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="dim" style={{ width: 24, textAlign: 'right' }}>
                        <Icon name="chevron" size={13} />
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
                        {...rowProps(() => { setPartyId(m.monitor_id); setState('all') })}>
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

      {open && (
        <ReviewRecord subjectKind={open.subject_kind} subjectId={open.subject_id}
                      onClose={() => {
                        setOpen(null)
                        if (params.get('open')) {
                          const next = new URLSearchParams(params)
                          next.delete('open')
                          setParams(next, { replace: true })
                        }
                        refresh()
                      }}
                      onChanged={refresh}
                      onStep={step}
                      position={(() => {
                        const i = rows.findIndex((r) => r.subject_id === open.subject_id)
                        return i < 0 ? null : { at: i + 1, of: data?.total || rows.length }
                      })()} />
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
    <>
      {codes.map((code) => {
        const kind = byCode[code]
        return (
          <span key={code} className={`badge ${SEVERITY_TONE[kind?.severity || worst] || ''}`}
                title={kind?.description || code}>
            {kind?.label || code}
          </span>
        )
      })}
    </>
  )
}

/**
 * Flagging says what is wrong. A flag with no claim behind it is just a record
 * somebody moved past, which is why the API refuses one and this asks for it.
 */
function FlagModal({ count, kinds, onClose, onSubmit, subjectKind }) {
  const [issue, setIssue] = useState('')
  const [notes, setNotes] = useState('')
  const usable = kinds.filter(
    (k) => !subjectKind || (k.subject_kinds || []).includes(subjectKind))
  return (
    <Modal title={count === 1 ? 'Flag this record' : `Flag ${count} records`}
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
        Flagging does not stop anything billing. It puts the record on
        somebody's list with a note about what has to be fixed.
      </p>
      <div className="stack">
        <Field label="What is wrong">
          <select className="select" value={issue} onChange={(e) => setIssue(e.target.value)}>
            <option value="">Something else, described below</option>
            {usable.map((k) => (
              <option key={k.code} value={k.code}>{k.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Note" hint="What the next person has to do about it">
          <textarea className="input" rows={3} value={notes} autoFocus
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Monitor needs to re-shoot the pre photo before this can bill" />
        </Field>
      </div>
    </Modal>
  )
}

/* ======================================================================== */
/**
 * One record, read top to bottom.
 *
 * The requirement gives a conceptual sequence: identity, why it needs review,
 * location, time, personnel and equipment, measurements, evidence, notes,
 * rules, related records, decision. It also says the interface should adapt to
 * the record type rather than render everything identically, so the steps are
 * assembled per kind: a load ticket leads with location and time, a
 * certification leads with its measurements, an incident leads with its
 * photographs.
 *
 * Nothing is behind a tab. The rail on the right is a jump list, not a set of
 * panels that hide each other.
 */
function ReviewRecord({ subjectKind, subjectId, onClose, onChanged, onStep, position }) {
  const { can, toast } = useApp()
  const [lightbox, setLightbox] = useState(null)
  const [flagging, setFlagging] = useState(false)
  const [escalating, setEscalating] = useState(false)
  const [alerting, setAlerting] = useState(false)
  const [noting, setNoting] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [menu, setMenu] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const [here, setHere] = useState(null)
  const bodyRef = useRef(null)

  const { data, loading, error, reload } = useFetch(
    () => api.get(`/review/${subjectKind}/${subjectId}`), [subjectKind, subjectId])
  const kinds = useFetch(() => api.get('/issue-kinds', { subject_kind: subjectKind }),
                         [subjectKind])

  const identity = data?.identity
  const isTicket = subjectKind === 'ticket'
  const isIncident = identity?.record_kind === 'incident'

  const openFlags = (data?.flags || []).filter((f) => !f.cleared_at)
  const media = data?.media || []
  const requiredShots = data?.record?.field_schema
    ? data.record.field_schema
        .filter((f) => f.type === 'photo' && f.required)
        .map((f) => ({ slot: f.key, label: f.label, stage: f.stage }))
    : []

  const steps = useMemo(() => {
    const all = [
      { key: 'why', label: 'Why it needs review', count: openFlags.length || undefined },
      { key: 'evidence', label: 'Evidence', count: media.length || undefined },
      { key: 'location', label: 'Location' },
      { key: 'time', label: 'Time' },
      { key: 'who', label: 'People and equipment' },
      { key: 'numbers', label: 'Measurements' },
      { key: 'notes', label: 'Notes' },
      { key: 'rules', label: 'Project rules' },
      { key: 'related', label: 'Related records' },
      { key: 'history', label: 'Review history', count: (data?.history || []).length || undefined },
    ]
    const order = subjectKind === 'certification'
      ? ['why', 'numbers', 'evidence', 'who', 'time', 'related', 'notes', 'rules', 'history']
      : isIncident
        ? ['why', 'evidence', 'location', 'time', 'who', 'notes', 'rules', 'related', 'history']
        : ['why', 'location', 'time', 'evidence', 'numbers', 'who', 'notes', 'rules',
           'related', 'history']
    return order.map((k) => all.find((s) => s.key === k)).filter(Boolean)
  }, [subjectKind, isIncident, openFlags.length, media.length, data?.history])

  // Escape closes, and the queue can be walked without going back to it.
  useEffect(() => {
    const onKey = (e) => {
      // Anything on top of the record owns the keyboard, the overflow menu
      // included. Escape closing the whole record out from under a menu is
      // exactly the kind of slip the action model is meant to prevent.
      if (lightbox !== null || flagging || escalating || alerting || noting
          || updating || voiding || menu) return
      if (e.target.matches?.('input, textarea, select')) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); onStep?.(1) }
      if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); onStep?.(-1) }
      if (e.key === 'a') decide('approved')
      if (e.key === 'f') setFlagging(true)
      if (e.key === 'u' && isTicket) setUpdating(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Which step the reader is in, so the rail keeps up.
  useEffect(() => {
    const root = bodyRef.current
    if (!root) return undefined
    const observer = new IntersectionObserver((entries) => {
      const seen = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (seen) setHere(seen.target.dataset.step)
    }, { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 })
    root.querySelectorAll('[data-step]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [data, steps])

  function jump(key) {
    const el = bodyRef.current?.querySelector(`[data-step="${key}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function decide(state, extra = {}) {
    try {
      await api.post(`/review/${subjectKind}/${subjectId}/decision`,
                     { state, ...extra })
      toast(state === 'approved' ? 'Approved' : fmt.title(state), identity?.title || '')
      onChanged?.()
      if (state === 'approved' && onStep) onStep(1)
      else reload()
    } catch (err) {
      toast('Could not save', err.message, 'err')
    }
  }

  return (
    <div className="review-sheet" role="dialog" aria-modal="true">
      <header className="review-sheet-head">
        <button className="btn ghost icon" onClick={onClose} aria-label="Close review">
          <Icon name="x" size={17} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 9 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>
              {loading ? 'Loading' : identity?.title}
            </h2>
            {identity && (
              <>
                <Badge tone={identity.review_state === 'approved' ? 'green'
                  : identity.review_state === 'flagged' ? 'red'
                    : identity.review_state === 'resolved' ? 'blue' : undefined}>
                  {identity.review_state === 'pending' ? 'Not looked at'
                    : fmt.title(identity.review_state)}
                </Badge>
                {identity.escalation_level !== 'none' && (
                  <Badge tone="violet">{fmt.title(identity.escalation_level)}</Badge>
                )}
              </>
            )}
          </div>
          {identity && (
            <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
              {identity.record_kind_label}
              {identity.party_name && ` · ${identity.party_name}`}
              {identity.unit_number && ` · ${identity.unit_number}`}
              {' · waiting '}{fmt.number(identity.waiting_days, 0)} days
              {identity.value_amount != null && ` · ${fmt.money(identity.value_amount)}`}
            </div>
          )}
        </div>

        <div className="spacer" />

        {position && (
          <div className="row" style={{ gap: 4 }}>
            <button className="btn ghost icon sm" aria-label="Previous record"
                    onClick={() => onStep?.(-1)}>
              <Icon name="chevron" size={14} style={{ transform: 'rotate(-90deg)' }} />
            </button>
            <span className="dim nums" style={{ fontSize: 12 }}>
              {position.at} of {fmt.int(position.of)}
            </span>
            <button className="btn ghost icon sm" aria-label="Next record"
                    onClick={() => onStep?.(1)}>
              <Icon name="chevron" size={14} style={{ transform: 'rotate(90deg)' }} />
            </button>
          </div>
        )}
      </header>

      <div className="review-sheet-body" ref={bodyRef}>
        {loading && <div className="page"><Loading rows={10} /></div>}
        {error && <div className="page"><ErrorNote error={error} onRetry={reload} /></div>}

        {data && (
          <div className="page review-layout">
            <div className="stack" style={{ gap: 18 }}>
              {steps.map((step, i) => (
                <section key={step.key} className="review-step" data-step={step.key}>
                  <div className="review-step-head">
                    <span className="n">{i + 1}</span>
                    <h3>{step.label}</h3>
                  </div>
                  <StepBody step={step.key} data={data} subjectKind={subjectKind}
                            requiredShots={requiredShots}
                            onOpenShot={(m) => setLightbox(
                              media.findIndex((x) => x.id === m.id))} />
                </section>
              ))}

              {can('ticket.update') && (
                <div className="decide-bar">
                  <button className="btn primary" onClick={() => decide('approved')}>
                    <Icon name="check" size={14} /> Approve
                  </button>
                  <button className="btn" onClick={() => setFlagging(true)}>
                    <Icon name="alert" size={14} /> Flag an issue
                  </button>
                  {isTicket && (
                    <button className="btn" onClick={() => setUpdating(true)}>
                      <Icon name="edit" size={14} /> Update
                    </button>
                  )}
                  <button className="btn" onClick={() => setNoting(true)}>Add a note</button>
                  <button className="btn" onClick={() => setAlerting(true)}>Alert someone</button>
                  <button className="btn" onClick={() => setEscalating(true)}>
                    {identity?.escalation_level === 'none' ? 'Escalate' : 'Change escalation'}
                  </button>

                  <div className="spacer" />
                  <span className="keys">
                    <span className="kbd">A</span>pprove
                    <span className="kbd">F</span>lag
                    {isTicket && <><span className="kbd">U</span>pdate</>}
                    <span className="kbd">J</span><span className="kbd">K</span>move
                  </span>

                  {/* Rare and destructive, kept behind a menu and away from the
                      close control. Void used to sit next to the X. */}
                  <div style={{ position: 'relative' }}>
                    <button className="btn ghost icon" aria-label="More actions"
                            onClick={() => setMenu(!menu)}>
                      <Icon name="menu" size={15} />
                    </button>
                    {menu && (
                      <MoreMenu subjectKind={subjectKind} record={data.record}
                                onClose={() => setMenu(false)}
                                onVoid={() => { setMenu(false); setVoiding(true) }}
                                onReran={() => { setMenu(false); reload(); onChanged?.() }}
                                toast={toast} />
                    )}
                  </div>
                </div>
              )}
            </div>

            <nav className="review-rail">
              <Card title="Jump to" flush>
                <div className="review-jump" style={{ padding: 6 }}>
                  {steps.map((s) => (
                    <button key={s.key} className={here === s.key ? 'on' : ''}
                            onClick={() => jump(s.key)}>
                      {s.label}
                      {s.count != null && <span className="count">{s.count}</span>}
                    </button>
                  ))}
                </div>
              </Card>

              {data.patterns?.length > 0 && (
                <Card title="From this source" flush>
                  <div style={{ padding: '8px 12px 12px' }} className="stack">
                    {data.patterns.slice(0, 4).map((p) => (
                      <div key={p.issue_code} style={{ fontSize: 12.5 }}>
                        <b>{p.open_occurrences}</b> open · {p.issue_label.toLowerCase()}
                        <div className="dim" style={{ fontSize: 11.5 }}>
                          {p.last_7_days} in the last 7 days,
                          {' '}{p.last_30_days} in 30
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {data.alerts?.length > 0 && (
                <Card title="Who has been told" flush>
                  <div style={{ padding: '8px 12px 12px' }} className="stack">
                    {data.alerts.map((a) => (
                      <div key={a.id} style={{ fontSize: 12.5 }}>
                        <b>{a.to_name || a.to_role_code}</b>
                        <div className="dim" style={{ fontSize: 11.5 }}>
                          {a.subject} · {fmt.ago(a.sent_at)}
                          {a.acknowledged_at && ' · picked up'}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </nav>
          </div>
        )}
      </div>

      {lightbox !== null && media.length > 0 && (
        <Lightbox items={media} index={lightbox} onIndex={setLightbox}
                  onClose={() => setLightbox(null)} />
      )}

      {flagging && (
        <FlagModal count={1} kinds={kinds.data?.items || []} subjectKind={subjectKind}
                   onClose={() => setFlagging(false)}
                   onSubmit={(issue, notes) => {
                     decide('flagged', { issue_code: issue, notes })
                     setFlagging(false)
                   }} />
      )}

      {noting && (
        <NoteModal onClose={() => setNoting(false)} onSaved={() => {
          setNoting(false); reload()
        }} subjectKind={subjectKind} subjectId={subjectId} toast={toast} />
      )}

      {alerting && (
        <AlertModal onClose={() => setAlerting(false)}
                    onSent={() => { setAlerting(false); reload() }}
                    subjectKind={subjectKind} subjectId={subjectId}
                    title={identity?.title} toast={toast} />
      )}

      {escalating && (
        <EscalateModal current={identity?.escalation_level}
                       patterns={data?.patterns}
                       waitingDays={identity?.waiting_days}
                       onClose={() => setEscalating(false)}
                       onDone={() => { setEscalating(false); reload(); onChanged?.() }}
                       subjectKind={subjectKind} subjectId={subjectId} toast={toast} />
      )}

      {updating && data?.record && (
        <TicketCorrection ticket={data.record} onClose={() => setUpdating(false)}
                          onSaved={() => { setUpdating(false); reload(); onChanged?.() }}
                          toast={toast} />
      )}

      {voiding && data?.record && (
        <VoidModal ticket={data.record} onClose={() => setVoiding(false)}
                   onDone={() => { setVoiding(false); onClose() }} toast={toast} />
      )}
    </div>
  )
}

/* ----------------------------------------------------------- the sections */
/**
 * Each step renders what that kind of record actually has.
 *
 * "Do not assume that the reviewer should have to mentally combine information
 *  from several disconnected screens." So where a step has nothing, it says so
 * plainly rather than disappearing, because an absent section and an empty one
 * are different facts.
 */
function StepBody({ step, data, subjectKind, requiredShots, onOpenShot }) {
  const record = data.record || {}
  const identity = data.identity || {}
  const isTicket = subjectKind === 'ticket'

  switch (step) {
    case 'why': {
      const open = (data.flags || []).filter((f) => !f.cleared_at)
      const settled = (data.flags || []).filter((f) => f.cleared_at)
      if (!open.length && !settled.length) {
        return (
          <div className="card" style={{ padding: 14 }}>
            <div className="row" style={{ gap: 8 }}>
              <Icon name="check" size={15} style={{ color: 'var(--green)' }} />
              <b style={{ fontSize: 13 }}>Nothing was flagged on this record</b>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              It is in the queue because nobody has looked at it yet, which is
              its own reason.
            </div>
          </div>
        )
      }
      return (
        <div className="stack" style={{ gap: 10 }}>
          {open.map((f) => <FlagCard key={f.id} flag={f} />)}
          {settled.length > 0 && (
            <details>
              <summary className="dim" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                {settled.length} settled earlier
              </summary>
              <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                {settled.map((f) => <FlagCard key={f.id} flag={f} />)}
              </div>
            </details>
          )}
        </div>
      )
    }

    case 'evidence':
      return (
        <div className="stack" style={{ gap: 12 }}>
          {data.evidence && (
            <div className="dim" style={{ fontSize: 12.5 }}>
              {data.evidence.required_slots?.length
                ? <>This record type requires {data.evidence.required_slots.length}{' '}
                    photograph{data.evidence.required_slots.length === 1 ? '' : 's'}.{' '}
                    {data.evidence.missing_slots?.length
                      ? <b style={{ color: 'var(--red)' }}>
                          {data.evidence.missing_slots.length} did not arrive.
                        </b>
                      : 'All of them arrived.'}
                  </>
                : 'No photographs are required on this record type.'}
            </div>
          )}
          {subjectKind === 'certification'
            ? <EvidenceChecklist evidence={data.evidence} media={data.media}
                                 onOpen={onOpenShot} />
            : <EvidenceStrip required={requiredShots} media={data.media}
                             onOpen={onOpenShot} />}
        </div>
      )

    case 'location': {
      const loc = data.location
      if (!loc) return <div className="dim">Not something this record carries.</div>
      const drift = loc.haul_miles_straight_line != null
        && loc.haul_miles_recorded != null
        && Number(loc.haul_miles_recorded) > 0
        ? Number(loc.haul_miles_recorded) / Number(loc.haul_miles_straight_line)
        : null
      return (
        <div className="stack" style={{ gap: 12 }}>
          <ReviewMap origin={loc.origin} destination={loc.destination}
                     track={loc.day_track} tall />
          <div className="grid c2" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                            letterSpacing: '0.06em' }}>Where it loaded</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {loc.origin.address || loc.origin.street || 'No address recorded'}
              </div>
              <div className="dim nums" style={{ fontSize: 12, marginTop: 3 }}>
                {loc.origin.latitude != null
                  ? `${Number(loc.origin.latitude).toFixed(5)}, ${Number(loc.origin.longitude).toFixed(5)}`
                  : 'No coordinates, so nothing can confirm where this came from'}
              </div>
              {loc.same_street?.length > 0 && (
                <div className="dim" style={{ fontSize: 12, marginTop: 6 }}>
                  {loc.same_street.length} other ticket
                  {loc.same_street.length === 1 ? '' : 's'} on this street, the
                  nearest {fmt.number(loc.same_street[0].miles_away, 2)} miles away.
                </div>
              )}
              {loc.same_street?.length === 0 && loc.origin.street && (
                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--amber)' }}>
                  No other ticket on this project names this street.
                </div>
              )}
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                            letterSpacing: '0.06em' }}>Where it went</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {loc.destination?.name || 'No site recorded'}
              </div>
              <div className="dim nums" style={{ fontSize: 12, marginTop: 3 }}>
                {loc.haul_miles_recorded != null && (
                  <>{fmt.number(loc.haul_miles_recorded, 2)} miles recorded</>
                )}
                {loc.haul_miles_straight_line != null && (
                  <> · {fmt.number(loc.haul_miles_straight_line, 2)} straight line</>
                )}
              </div>
              {drift != null && drift < 0.95 && (
                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--amber)' }}>
                  The recorded distance is shorter than the straight line between
                  the two points, which cannot be right.
                </div>
              )}
              {loc.destination && loc.destination.is_active === false && (
                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--red)' }}>
                  This site is not active on this declaration.
                </div>
              )}
            </div>
          </div>
          {loc.day_track?.length > 1 && (
            <Card title="The rest of that day"
                  sub="Same monitor, truck and trailer, in the order it happened">
              <div className="table-wrap">
                <table className="data">
                  <thead><tr>
                    <th /><th>Ticket</th><th>Unit</th><th>Loaded</th>
                    <th>At the site</th><th className="num">CY</th><th>Where</th>
                  </tr></thead>
                  <tbody>
                    {loc.day_track.map((t, i) => (
                      <tr key={t.id} style={{
                        background: t.is_this_one ? 'var(--accent-soft)' : undefined }}>
                        <td className="dim nums">{i + 1}</td>
                        <td><b>{t.ticket_number}</b></td>
                        <td>{t.unit_number || '—'}</td>
                        <td className="nums">{fmt.time(t.origin_at)}</td>
                        <td className="nums">{fmt.time(t.destination_at)}</td>
                        <td className="num">{fmt.number(t.billable_cubic_yards, 1)}</td>
                        <td className="dim" style={{ fontSize: 12 }}>
                          {t.origin_address || t.origin_street || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )
    }

    case 'time': {
      const time = data.time
      const expected = isTicket && record.haul_miles
        ? (Number(record.haul_miles) / 45) * 60 : null
      return (
        <div className="stack" style={{ gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <TimeSequence sequence={time?.sequence} expectedMinutes={expected} />
          </div>
          {time?.cycle_minutes != null && (
            <div className="dim" style={{ fontSize: 12.5 }}>
              {fmt.number(time.cycle_minutes, 0)} minutes from the curb to the site
              {expected && <> · the recorded distance needs about {fmt.number(expected, 0)}</>}.
              {' '}Compare it against the monitor's paper log for the same run.
            </div>
          )}
        </div>
      )
    }

    case 'who': {
      const r = data.relationships || {}
      const cert = r.certification
      return (
        <div className="stack" style={{ gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <dl className="kv">
              {r.monitor?.name && <><dt>Monitor</dt><dd>{r.monitor.name}</dd></>}
              {r.measured_by && <><dt>Measured by</dt><dd>{r.measured_by}</dd></>}
              {r.driver && <><dt>Driver</dt><dd>{r.driver}</dd></>}
              {r.unit && <><dt>Unit</dt><dd>{r.unit}</dd></>}
              {r.placard && <><dt>Placard</dt><dd>{r.placard}</dd></>}
              {r.contractor && <><dt>Contractor</dt><dd>{r.contractor}</dd></>}
            </dl>
          </div>

          {cert && (
            <div className="card" style={{ padding: 14 }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name="truck" size={14} className="dim" />
                <b style={{ fontSize: 13 }}>
                  Priced on {fmt.number(cert.certified_capacity_cy, 2)} CY certified
                </b>
                {!cert.is_measured && (
                  <span className="badge red">No measurements behind it</span>
                )}
              </div>
              <div className="dim" style={{ fontSize: 12.5, marginTop: 4 }}>
                {fmt.title(cert.method)} · counts from {fmt.date(cert.applies_from)}
                {cert.is_measured && cert.section_count
                  && ` · ${cert.section_count} measured section${cert.section_count === 1 ? '' : 's'}`}
              </div>
            </div>
          )}

          {r.chain?.length > 1 && (
            <Card title="Measurement history for this unit">
              <div className="stack" style={{ gap: 0 }}>
                {r.chain.map((c) => (
                  <div key={c.id} className="row" style={{
                    gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)',
                    opacity: c.status === 'active' ? 1 : 0.6 }}>
                    <Badge tone={c.status === 'active' ? 'green' : undefined}>
                      {fmt.title(c.status)}
                    </Badge>
                    <div style={{ flex: 1 }}>
                      <b>{fmt.number(c.certified_capacity_cy, 2)} CY</b>
                      <span className="dim" style={{ fontSize: 12 }}>
                        {' '}· {fmt.title(c.method)} · from {fmt.date(c.applies_from)}
                        {!c.is_measured && ' · typed, not measured'}
                      </span>
                    </div>
                    <span className="dim nums" style={{ fontSize: 12 }}>
                      {fmt.int(c.tickets_priced)} tickets
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )
    }

    case 'numbers': {
      const m = data.measurements || {}
      if (subjectKind === 'certification') {
        if (!m.sections) {
          return (
            <div className="card" style={{ padding: 14, borderColor: 'var(--red)',
                                           background: 'var(--red-soft)' }}>
              <div className="row" style={{ gap: 8, color: 'var(--red)' }}>
                <Icon name="alert" size={15} />
                <b>Nothing says how this number was reached</b>
              </div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 5, lineHeight: 1.6 }}>
                {m.note} It is pricing {fmt.int(data.impact?.tickets || 0)} ticket
                {data.impact?.tickets === 1 ? '' : 's'}
                {data.impact?.billed ? ` worth ${fmt.money(data.impact.billed)}` : ''}.
              </div>
            </div>
          )
        }
        return (
          <div className="stack" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="row" style={{ gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>Cubic inches</div>
                  <div className="nums" style={{ fontSize: 22, fontWeight: 650 }}>
                    {fmt.int(m.total_cubic_inches)}
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>Cubic feet</div>
                  <div className="nums" style={{ fontSize: 16 }}>
                    {fmt.number(m.total_cubic_feet, 1)}
                  </div>
                </div>
                <div>
                  <div className="dim" style={{ fontSize: 11 }}>Certified capacity</div>
                  <div className="nums" style={{ fontSize: 20, fontWeight: 660 }}>
                    {fmt.number(m.certified_capacity_cy, 2)} CY
                  </div>
                </div>
                <div className="spacer" />
                <div className="dim" style={{ fontSize: 12 }}>
                  {m.container_label} · measured with a {fmt.title(m.measurement_method)}
                  {m.paper_form_number && ` · paper form ${m.paper_form_number}`}
                </div>
              </div>
              {m.typical_min_cy != null
                && (Number(m.total_cubic_yards) < Number(m.typical_min_cy)
                    || Number(m.total_cubic_yards) > Number(m.typical_max_cy)) && (
                <div style={{ marginTop: 10, color: 'var(--amber)', fontSize: 12.5 }}>
                  A {String(m.container_label).toLowerCase()} normally measures
                  between {fmt.number(m.typical_min_cy, 0)} and{' '}
                  {fmt.number(m.typical_max_cy, 0)} CY.
                </div>
              )}
            </div>

            <Card title="Every section, and its arithmetic">
              <div className="stack" style={{ gap: 0 }}>
                {m.sections.map((s) => (
                  <div key={s.id} className="section-row compact">
                    <div className="section-figure">
                      <ShapeDiagram shape={s.diagram_key} height={48} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <b>{s.label}</b>
                        <span className={`badge${s.role === 'deduction' ? ' red'
                          : s.role === 'addition' ? ' blue' : ''}`}>
                          {fmt.title(s.role)}
                        </span>
                        {s.quantity > 1 && <span className="dim">×{s.quantity}</span>}
                      </div>
                      <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                        {s.shape_label} · {s.formula_note}
                      </div>
                      <div className="nums" style={{ fontSize: 12.5, marginTop: 4 }}>
                        {Object.entries(s.dimensions).map(([k, v]) => (
                          <span key={k} className="dim-chip">
                            {fmt.title(k)} {feetAndInches(v)}
                          </span>
                        ))}
                      </div>
                      {s.notes && (
                        <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                          {s.notes}
                        </div>
                      )}
                    </div>
                    <div className="nums" style={{ textAlign: 'right', fontWeight: 620 }}>
                      {s.role === 'deduction' && '-'}{fmt.int(s.computed_cubic_inches)}
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {data.impact?.tickets > 0 && (
              <div className="dim" style={{ fontSize: 12.5 }}>
                This capacity has priced {fmt.int(data.impact.tickets)} ticket
                {data.impact.tickets === 1 ? '' : 's'}
                {data.impact.first_day && <> between {fmt.date(data.impact.first_day)}
                  {' '}and {fmt.date(data.impact.last_day)}</>},
                {' '}{fmt.number(data.impact.cubic_yards, 1)} CY,
                {' '}{fmt.money(data.impact.billed)}.
              </div>
            )}
          </div>
        )
      }

      return (
        <div className="card" style={{ padding: 14 }}>
          {m.explanation
            ? <div style={{ fontSize: 14, lineHeight: 1.7 }}>{m.explanation}</div>
            : <div className="dim" style={{ fontSize: 13 }}>
                This record is not priced on a measured volume.
              </div>}
          <dl className="kv" style={{ marginTop: 10 }}>
            {m.certified_capacity_cy != null && (
              <><dt>Certified capacity</dt>
                <dd>{fmt.number(m.certified_capacity_cy, 2)} CY</dd></>
            )}
            {m.load_call_pct != null && (
              <><dt>Load call</dt><dd>{fmt.number(m.load_call_pct, 0)}%</dd></>
            )}
            {m.billable_cubic_yards != null && (
              <><dt>Billable volume</dt>
                <dd>{fmt.number(m.billable_cubic_yards, 2)} CY</dd></>
            )}
            {Number(m.net_tons) > 0 && (
              <><dt>Net weight</dt><dd>{fmt.number(m.net_tons, 2)} tons</dd></>
            )}
            {m.quantity != null && Number(m.quantity) > 0 && (
              <><dt>Unit count</dt>
                <dd>{fmt.number(m.quantity, 0)} {m.quantity_unit || ''}</dd></>
            )}
          </dl>
        </div>
      )
    }

    case 'notes':
      return (
        <div className="card" style={{ padding: 14 }}>
          {record.notes
            ? <div style={{ lineHeight: 1.7, fontSize: 13.5 }}>{record.notes}</div>
            : <div className="dim" style={{ fontSize: 13 }}>
                The monitor left no note on this record.
              </div>}
          {identity.review_notes && (
            <div style={{ marginTop: 12, paddingTop: 12,
                          borderTop: '1px solid var(--line)' }}>
              <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                            letterSpacing: '0.06em' }}>
                Review note
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{identity.review_notes}</div>
            </div>
          )}
        </div>
      )

    case 'rules': {
      const c = data.compliance || {}
      const rows = subjectKind === 'certification'
        ? [
          ['Counts from', fmt.date(c.applies_from), true],
          ['Expires', c.expires_on ? fmt.date(c.expires_on) : 'No expiry set',
            !c.expires_on || new Date(c.expires_on) > new Date()],
          ['Number matches the placard',
            c.placard_matches == null ? 'Nothing to compare'
              : c.placard_matches ? 'Yes' : 'No',
            c.placard_matches !== false],
        ]
        : [
          ['Ticket type enabled on this project',
            c.type_enabled === false ? 'No' : 'Yes', c.type_enabled !== false],
          ['Disposal site active on this declaration',
            c.site_active === false ? 'No' : c.site_active == null ? 'No site' : 'Yes',
            c.site_active !== false],
          ['Site permit', c.site_permit_status
            ? fmt.title(c.site_permit_status) : 'Not tracked',
            c.site_permit_status !== 'pending'],
          ['Debris stream in scope',
            c.debris_stream_enabled === false ? 'No' : 'Yes',
            c.debris_stream_enabled !== false],
          ['Photographs required',
            data.declared?.requires_photo ? 'Yes' : 'No', true],
        ]
      return (
        <div className="card" style={{ padding: 14 }}>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
            What this project allows for this record. The system surfaces the
            rule; the decision stays yours.
          </div>
          <dl className="kv">
            {rows.map(([k, v, ok]) => (
              <>
                <dt key={`${k}-t`}>{k}</dt>
                <dd key={`${k}-d`} style={{ color: ok ? undefined : 'var(--amber)' }}>
                  {v}
                </dd>
              </>
            ))}
          </dl>
        </div>
      )
    }

    case 'related': {
      const n = data.relationships?.neighbours || []
      if (!n.length) {
        return (
          <div className="dim" style={{ fontSize: 13 }}>
            Nothing else on this project is directly related to this record.
          </div>
        )
      }
      return (
        <div className="card" style={{ padding: 4 }}>
          <table className="data">
            <tbody>
              {n.map((row) => (
                <tr key={row.id}>
                  <td className="dim" style={{ width: 90 }}>{fmt.title(row.position)}</td>
                  <td><b>{row.ticket_number}</b></td>
                  <td className="nums dim">{fmt.datetime(row.completed_at)}</td>
                  <td className="dim" style={{ fontSize: 12 }}>{row.origin_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'history': {
      const events = data.history || []
      if (!events.length) {
        return (
          <div className="dim" style={{ fontSize: 13 }}>
            Nobody has touched this record yet. Deciding on it starts the history.
          </div>
        )
      }
      return (
        <div className="timeline">
          {events.map((e) => (
            <div className="tl-item done" key={e.id}>
              <div className="tl-title">
                {EVENT_LABEL[e.event] || fmt.title(e.event)}
                {e.to_state && e.event === 'decided' && `: ${fmt.title(e.to_state)}`}
                <span className="dim" style={{ fontWeight: 400 }}> by {e.actor_name}</span>
              </div>
              <div className="tl-meta">{fmt.datetime(e.occurred_at)}</div>
              {e.note && <div className="tl-meta">{e.note}</div>}
            </div>
          ))}
        </div>
      )
    }

    default:
      return null
  }
}

const EVENT_LABEL = {
  opened: 'Picked up for review',
  decided: 'Decision',
  noted: 'Note added',
  assigned: 'Assigned',
  alerted: 'Sent to somebody',
  escalated: 'Escalated',
  de_escalated: 'Escalation lifted',
  reopened: 'Reopened',
  updated: 'Record updated',
}

/* --------------------------------------------------------------- actions */
/**
 * The rare and the dangerous, kept together and out of the way.
 *
 * "VOID is a dangerous/destructive action and should not be presented as an
 *  easy-to-hit primary action. RE-RUN RULES is useful, but it is used much
 *  less frequently and should be placed inside a more contained action menu."
 */
function MoreMenu({ subjectKind, record, onClose, onVoid, onReran, toast }) {
  const { can } = useApp()
  const ref = useRef(null)

  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target)) onClose() }
    // The menu owns Escape while it is open. Without stopping propagation the
    // record's own Escape handler also fires and closes the whole record out
    // from under the menu, which is the slip this menu exists to prevent.
    const esc = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', esc)
    }
  }, [onClose])

  async function rerun() {
    try {
      const out = await api.post(`/tickets/${record.id}/process`)
      toast('Rules re-run',
            `${out.created} new transaction(s), ${out.rules_matched} rule(s) matched`)
      onReran()
    } catch (err) { toast('Processing failed', err.message, 'err') }
  }

  async function reprice() {
    try {
      const out = await api.post(`/tickets/${record.id}/reprocess`,
                                 { reason: 'Repriced from the review screen' })
      const r = out.reprocess
      toast('Repriced',
            `${fmt.money(r.old_total)} to ${fmt.money(r.new_total)}`)
      onReran()
    } catch (err) { toast('Could not reprice', err.message, 'err') }
  }

  return (
    <div className="more-menu" ref={ref}>
      {subjectKind === 'ticket' && can('transaction.process') && (
        <>
          <button onClick={rerun}>
            <Icon name="refresh" size={13} /> Re-run the rules
            <span className="dim">adds what was missing</span>
          </button>
          <button onClick={reprice}>
            <Icon name="undo" size={13} /> Reprice
            <span className="dim">reverses and computes again</span>
          </button>
        </>
      )}
      {subjectKind === 'ticket' && can('ticket.void') && !record?.is_void && (
        <button className="danger" onClick={onVoid}>
          <Icon name="trash" size={13} /> Void this ticket
          <span className="dim">reverses its money</span>
        </button>
      )}
      {subjectKind === 'certification' && (
        <a className="menu-link" href={`/certifications`} onClick={onClose}>
          <Icon name="truck" size={13} /> Open in Certifications
        </a>
      )}
    </div>
  )
}

function NoteModal({ subjectKind, subjectId, onClose, onSaved, toast }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      await api.post(`/review/${subjectKind}/${subjectId}/note`, { note })
      toast('Noted', 'It is on the record')
      onSaved()
    } catch (err) { toast('Could not save the note', err.message, 'err') }
    finally { setBusy(false) }
  }
  return (
    <Modal title="Add a note" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || note.trim().length < 2}
                onClick={save}>
          {busy && <span className="spinner" />} Save the note
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        Half a review is a real state. Somebody looked, wrote down what they
        saw, and has to come back to it.
      </p>
      <Field label="Note">
        <textarea className="input" rows={4} value={note} autoFocus
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Called the monitor, they are re-shooting the pre photo" />
      </Field>
    </Modal>
  )
}

/**
 * "Send an alert to the appropriate person/team."
 *
 * The record of who was told and when is the part that matters, which is why
 * this writes an event rather than opening a mail client.
 */
function AlertModal({ subjectKind, subjectId, title, onClose, onSent, toast }) {
  const { project } = useApp()
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState(title ? `${title} needs attention` : '')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState('review')
  const [busy, setBusy] = useState(false)
  const people = useFetch(
    () => (project ? api.get(`/projects/${project.id}/options/project_workers`) : null),
    [project?.id])

  async function send() {
    setBusy(true)
    try {
      await api.post(`/review/${subjectKind}/${subjectId}/alert`, {
        to_user_id: to, subject, body: body || undefined, severity,
      })
      toast('Sent', 'It is on their list')
      onSent()
    } catch (err) { toast('Could not send it', err.message, 'err') }
    finally { setBusy(false) }
  }

  return (
    <Modal title="Alert someone" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !to || !subject.trim()}
                onClick={send}>
          {busy && <span className="spinner" />} Send
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        It appears in their review inbox with a link back to this record.
      </p>
      <div className="stack">
        <Field label="Who" required>
          <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Choose somebody on this project</option>
            {(people.data?.items || []).map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}{p.hint ? ` · ${fmt.title(p.hint)}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subject" required>
          <input className="input" value={subject}
                 onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field label="What they need to do">
          <textarea className="input" rows={3} value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Re-shoot the disposal photo before this can close" />
        </Field>
        <Field label="How urgent">
          <select className="select" value={severity}
                  onChange={(e) => setSeverity(e.target.value)}>
            <option value="info">For information</option>
            <option value="review">Worth a look</option>
            <option value="serious">Serious</option>
          </select>
        </Field>
      </div>
    </Modal>
  )
}

/**
 * "Escalation becomes particularly important when too much time has passed,
 *  the same problem continues occurring, a pattern of similar errors is
 *  developing, or an issue requires management attention rather than another
 *  simple correction."
 *
 * So the dialog leads with whether any of those are true of this record,
 * counted rather than guessed. It still takes a person to decide.
 */
function EscalateModal({ subjectKind, subjectId, current, patterns, waitingDays,
                         onClose, onDone, toast }) {
  const [level, setLevel] = useState(current === 'none' ? 'supervisor' : current)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const repeats = (patterns || []).filter((p) => p.open_occurrences > 1)

  async function save() {
    setBusy(true)
    try {
      await api.post(`/review/${subjectKind}/${subjectId}/escalate`, { level, reason })
      toast(level === 'none' ? 'Escalation lifted' : 'Escalated',
            level === 'none' ? '' : fmt.title(level))
      onDone()
    } catch (err) { toast('Could not escalate', err.message, 'err') }
    finally { setBusy(false) }
  }

  return (
    <Modal title="Escalate this record" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || reason.trim().length < 4}
                onClick={save}>
          {busy && <span className="spinner" />}
          {level === 'none' ? 'Lift the escalation' : 'Escalate'}
        </button>
      </>
    }>
      <div className="card" style={{ padding: 12, marginBottom: 14 }}>
        <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                      letterSpacing: '0.06em', marginBottom: 6 }}>
          What is true of this record
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
          <li>Waiting {fmt.number(waitingDays, 0)} days.</li>
          {repeats.length > 0
            ? repeats.slice(0, 3).map((p) => (
              <li key={p.issue_code}>
                {p.issue_label} has come back {p.last_30_days} times in 30 days
                from {p.party_name || 'this source'}.
              </li>
            ))
            : <li>No pattern of the same issue from this source.</li>}
        </ul>
      </div>

      <div className="stack">
        <Field label="Raise it to">
          <select className="select" value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="supervisor">A supervisor</option>
            <option value="management">Management</option>
            {current !== 'none' && <option value="none">Nobody, lift it</option>}
          </select>
        </Field>
        <Field label="Why" required
               hint="Read by whoever picks this up, so say what another correction will not fix">
          <textarea className="input" rows={3} value={reason} autoFocus
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Fourth missing disposal photo from this monitor in a week" />
        </Field>
      </div>
    </Modal>
  )
}

function VoidModal({ ticket, onClose, onDone, toast }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    try {
      await api.post(`/tickets/${ticket.id}/void`, { reason })
      toast('Ticket voided', 'Existing transactions were reversed')
      onDone()
    } catch (err) { toast('Could not void', err.message, 'err') }
    finally { setBusy(false) }
  }

  return (
    <Modal title={`Void ${ticket.ticket_number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" disabled={reason.trim().length < 3 || busy}
                onClick={run}>
          {busy && <span className="spinner" />} Void the ticket
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        Voiding never deletes. The ticket stays in the record, any transactions
        it produced are reversed rather than removed, and the reason you give
        here is written into the audit history. If the ticket is wrong rather
        than fictitious, Update it instead.
      </p>
      <Field label="Reason" required>
        <textarea className="textarea" value={reason} autoFocus
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Duplicate scan at the DMS gate" />
      </Field>
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Confirm, Drawer, Empty, ErrorNote, Field, Icon, Loading, Modal,
  Search, Tabs, useDebounced,
} from '../components/ui'

const PAGE = 50

export default function Tickets({ kindFilter }) {
  const { projectId, project, can, lookups, toast } = useApp()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 320)
  const [filters, setFilters] = useState({
    status: '', ticket_type: '', debris_type: '', processing_state: '',
    date_from: '', date_to: '',
  })
  const [sort, setSort] = useState({ key: 'created_at', dir: 'desc' })
  const [offset, setOffset] = useState(0)
  const [openId, setOpenId] = useState(params.get('ticket') || null)

  const types = useFetch(() => api.get('/ticket-types'), [])
  const typeCodes = useMemo(() => {
    if (!kindFilter) return null
    return (types.data?.items || []).filter((t) => t.kind === kindFilter).map((t) => t.code)
  }, [types.data, kindFilter])

  useEffect(() => { setOffset(0) }, [search, filters, projectId, sort])

  const query = {
    q: search || undefined,
    limit: PAGE,
    offset,
    sort: sort.key,
    direction: sort.dir,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  }
  if (kindFilter && typeCodes?.length && !filters.ticket_type) {
    query.ticket_type = typeCodes[0]
  }

  const { data, loading, error, reload } = useFetch(
    () => api.get(`/projects/${projectId}/tickets`, query),
    [projectId, JSON.stringify(query)], { skip: !projectId })

  function toggleSort(key) {
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
  }

  function openTicket(id) {
    setOpenId(id)
    setParams({ ticket: id }, { replace: true })
  }

  function closeTicket() {
    setOpenId(null)
    setParams({}, { replace: true })
  }

  async function exportCsv() {
    try {
      const result = await api.get(`/projects/${projectId}/export/tickets`)
      const cols = result.columns
      const escape = (v) => {
        const s = v === null || v === undefined ? '' : String(v)
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const csv = [cols.join(','),
        ...result.rows.map((row) => cols.map((c) => escape(row[c])).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `${project?.project_code || 'project'}-tickets.csv`
      link.click()
      URL.revokeObjectURL(link.href)
      toast('Export ready', `${result.count} rows written to CSV`)
    } catch (err) {
      toast('Export failed', err.message, 'err')
    }
  }

  if (!projectId) {
    return (<><PageHeader title="Tickets" />
      <div className="page"><Empty icon="folder" title="No project in context">
        Choose a project in the sidebar to review its tickets.</Empty></div></>)
  }

  const title = kindFilter === 'incident' ? 'Incidents' : 'Tickets'

  return (
    <>
      <PageHeader title={title} crumb={project?.project_code}>
        <button className="btn" onClick={exportCsv}>
          <Icon name="download" size={14} /> Export
        </button>
        <button className="btn icon" onClick={reload}><Icon name="refresh" size={15} /></button>
      </PageHeader>

      <div className="page">
        <Card flush>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: 9 }}>
            <Search value={q} onChange={setQ}
                    placeholder="Ticket, truck, driver, address, scale ticket" />
            <select className="select" style={{ width: 150 }} value={filters.status}
                    onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Any status</option>
              {(lookups?.ticket_statuses || []).map((s) => (
                <option key={s.code} value={s.code}>{s.label}</option>
              ))}
            </select>
            {!kindFilter && (
              <select className="select" style={{ width: 160 }} value={filters.ticket_type}
                      onChange={(e) => setFilters({ ...filters, ticket_type: e.target.value })}>
                <option value="">Any type</option>
                {(types.data?.items || []).map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
            )}
            <select className="select" style={{ width: 150 }} value={filters.debris_type}
                    onChange={(e) => setFilters({ ...filters, debris_type: e.target.value })}>
              <option value="">Any debris</option>
              {(lookups?.debris_types || []).map((d) => (
                <option key={d.code} value={d.code}>{d.label}</option>
              ))}
            </select>
            <select className="select" style={{ width: 165 }} value={filters.processing_state}
                    onChange={(e) => setFilters({ ...filters, processing_state: e.target.value })}>
              <option value="">Any billing state</option>
              {['unprocessed', 'queued', 'processed', 'no_match', 'error', 'excluded'].map((s) => (
                <option key={s} value={s}>{fmt.title(s)}</option>
              ))}
            </select>
            <input className="input" type="date" style={{ width: 145 }} value={filters.date_from}
                   onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            <input className="input" type="date" style={{ width: 145 }} value={filters.date_to}
                   onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
            {Object.values(filters).some(Boolean) && (
              <button className="btn ghost sm" onClick={() => setFilters({
                status: '', ticket_type: '', debris_type: '', processing_state: '',
                date_from: '', date_to: '' })}>
                <Icon name="x" size={13} /> Clear
              </button>
            )}
          </div>

          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}
          {loading && <Loading rows={8} />}

          {data && !loading && (
            data.items.length === 0 ? (
              <Empty icon="truck" title="No tickets match">
                Adjust the filters, or widen the date range.
              </Empty>
            ) : (
              <>
                <div className="table-wrap">
                  <table className="data">
                    <thead>
                      <tr>
                        <th className="sortable" onClick={() => toggleSort('ticket_number')}>Ticket</th>
                        <th>Type</th>
                        <th className="sortable" onClick={() => toggleSort('status')}>Status</th>
                        <th>Debris</th>
                        <th>Contractor</th>
                        <th>Truck</th>
                        <th className="num sortable" onClick={() => toggleSort('billable_cubic_yards')}>CY</th>
                        <th className="num">Load call</th>
                        <th className="num sortable" onClick={() => toggleSort('transaction_total')}>Billed</th>
                        <th>Billing</th>
                        <th className="sortable" onClick={() => toggleSort('completed_at')}>Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.items.map((t) => (
                        <tr key={t.id} className="clickable" onClick={() => openTicket(t.id)}>
                          <td className="mono">
                            {t.ticket_number}
                            {t.is_void && <Badge tone="red" >Void</Badge>}
                          </td>
                          <td>{t.ticket_type_label}</td>
                          <td><Badge status={t.status} /></td>
                          <td className="muted">{t.debris_label || '—'}</td>
                          <td className="truncate" style={{ maxWidth: 170 }}>{t.contractor_name || '—'}</td>
                          <td className="mono dim">{t.truck_number || '—'}</td>
                          <td className="num">{t.billable_cubic_yards > 0
                            ? fmt.number(t.billable_cubic_yards, 1) : '—'}</td>
                          <td className="num">{t.load_call_pct ? `${fmt.number(t.load_call_pct, 0)}%` : '—'}</td>
                          <td className="num">{Number(t.transaction_total) !== 0
                            ? fmt.money(t.transaction_total) : '—'}</td>
                          <td><Badge status={t.processing_state} /></td>
                          <td className="muted">{fmt.date(t.completed_at || t.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pager">
                  <span>
                    {fmt.int(offset + 1)}–{fmt.int(offset + data.items.length)} of {fmt.int(data.total)}
                  </span>
                  <span className="dim">·</span>
                  <span className="dim">
                    {fmt.number(data.totals.cubic_yards, 0)} CY · {fmt.money(data.totals.billable)} billed
                  </span>
                  <div className="spacer" />
                  <button className="btn sm" disabled={offset === 0}
                          onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</button>
                  <button className="btn sm" disabled={!data.has_more}
                          onClick={() => setOffset(offset + PAGE)}>Next</button>
                </div>
              </>
            )
          )}
        </Card>
      </div>

      {openId && <TicketDrawer ticketId={openId} onClose={closeTicket} onChanged={reload} />}
    </>
  )
}

/* ======================================================================== */
export function TicketDrawer({ ticketId, onClose, onChanged }) {
  const { can, toast } = useApp()
  const [tab, setTab] = useState('detail')
  const [voiding, setVoiding] = useState(false)
  const [unvoiding, setUnvoiding] = useState(false)
  const [editing, setEditing] = useState(false)
  const [repricing, setRepricing] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/tickets/${ticketId}`), [ticketId])

  async function doVoid() {
    setBusy(true)
    try {
      await api.post(`/tickets/${ticketId}/void`, { reason })
      toast('Ticket voided', 'Existing transactions were reversed')
      setVoiding(false); setReason('')
      reload(); onChanged?.()
    } catch (err) {
      toast('Could not void', err.message, 'err')
    } finally { setBusy(false) }
  }

  async function doUnvoid() {
    setBusy(true)
    try {
      await api.post(`/tickets/${ticketId}/unvoid`, { reason })
      toast('Ticket restored', 'It is queued for repricing')
      setUnvoiding(false); setReason('')
      reload(); onChanged?.()
    } catch (err) {
      toast('Could not restore', err.message, 'err')
    } finally { setBusy(false) }
  }

  // Re-running the rules and repricing are different acts. The first only ever
  // adds what was missing; the second reverses what is there and computes it
  // again, which is the one a corrected ticket needs.
  async function reRunRules() {
    try {
      const result = await api.post(`/tickets/${ticketId}/process`)
      toast('Rules re-run',
            `${result.created} new transaction(s); ${result.rules_matched} rule(s) matched`)
      reload(); onChanged?.()
    } catch (err) {
      toast('Processing failed', err.message, 'err')
    }
  }

  const t = data?.ticket
  const o = data?.overview
  const type = data?.ticket_type

  return (
    <Drawer
      title={loading ? 'Loading ticket' : t?.ticket_number}
      sub={o ? `${o.ticket_type_label} · ${o.project_name}` : ''}
      onClose={onClose}
      actions={
        <>
          {can('ticket.update') && t && !t.is_void && (
            <button className="btn sm" onClick={() => setEditing(true)}>
              <Icon name="edit" size={13} /> Correct
            </button>
          )}
          {can('transaction.process') && t && !t.is_void && t.status === 'completed' && (
            t.needs_reprocess
              ? <button className="btn sm primary" onClick={() => setRepricing(true)}>
                  <Icon name="refresh" size={13} /> Reprice
                </button>
              : <button className="btn sm" onClick={reRunRules}>
                  <Icon name="refresh" size={13} /> Re-run rules
                </button>
          )}
          {can('ticket.void') && t && !t.is_void && (
            <button className="btn sm danger" onClick={() => setVoiding(true)}>Void</button>
          )}
          {can('ticket.void') && t && t.is_void && (
            <button className="btn sm" onClick={() => setUnvoiding(true)}>Restore</button>
          )}
        </>
      }>
      {loading && <Loading rows={8} />}
      {error && <ErrorNote error={error} onRetry={reload} />}

      {data && (
        <>
          <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
            <Badge status={t.status} />
            <Badge status={t.processing_state} />
            {t.is_void && <Badge tone="red">Void</Badge>}
            <Badge status={t.visibility_flag} />
            <div className="spacer" />
            {Number(o?.transaction_total) !== 0 && (
              <div style={{ fontSize: 17, fontWeight: 640 }}>
                {fmt.money(o.transaction_total)}
              </div>
            )}
          </div>

          {t.needs_reprocess && !t.is_void && (
            <div className="card" style={{ padding: 12, marginBottom: 14,
                                           borderColor: 'var(--amber)',
                                           background: 'var(--amber-soft)' }}>
              <div className="row" style={{ color: 'var(--amber)', gap: 8 }}>
                <Icon name="alert" size={14} /><b>Waiting to be repriced</b>
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>
                {t.reprocess_reason}
                {t.reprocess_queued_at ? ` · queued ${fmt.datetime(t.reprocess_queued_at)}` : ''}
                . The figures below are what it billed before the change.
              </div>
            </div>
          )}

          {t.is_void && (
            <div className="card" style={{ padding: 12, marginBottom: 14,
                                           borderColor: 'var(--red)', background: 'var(--red-soft)' }}>
              <div className="row" style={{ color: 'var(--red)', gap: 8 }}>
                <Icon name="alert" size={14} /><b>Voided</b>
              </div>
              <div className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>
                {t.void_reason} · {fmt.datetime(t.voided_at)}
              </div>
            </div>
          )}

          <Tabs value={tab} onChange={setTab} tabs={[
            { key: 'detail', label: 'Detail' },
            { key: 'stages', label: 'Lifecycle', count: data.stages.length },
            { key: 'media', label: 'Images', count: data.media.length },
            { key: 'money', label: 'Transactions', count: data.transactions.length },
            { key: 'audit', label: 'Audit', count: data.audit.length },
          ]} />

          <div style={{ paddingTop: 16 }}>
            {tab === 'detail' && <DetailTab t={t} o={o} m={data.metrics} type={type} />}
            {tab === 'stages' && <StagesTab stages={data.stages} type={type}
                                            waypoints={data.waypoints} />}
            {tab === 'media' && <MediaTab media={data.media} />}
            {tab === 'money' && <MoneyTab transactions={data.transactions}
                                          onChanged={() => { reload(); onChanged?.() }} />}
            {tab === 'audit' && <AuditTab events={data.audit} />}
          </div>
        </>
      )}

      {editing && t && (
        <TicketCorrection ticket={t} onClose={() => setEditing(false)}
                          onSaved={() => { setEditing(false); reload(); onChanged?.() }}
                          toast={toast} />
      )}

      {repricing && t && (
        <RepriceModal ticket={t} onClose={() => setRepricing(false)}
                      onDone={() => { setRepricing(false); reload(); onChanged?.() }}
                      toast={toast} />
      )}

      {unvoiding && (
        <Modal title="Restore this ticket" onClose={() => setUnvoiding(false)} footer={
          <>
            <button className="btn" onClick={() => setUnvoiding(false)}>Cancel</button>
            <button className="btn primary" disabled={reason.length < 4 || busy}
                    onClick={doUnvoid}>
              {busy && <span className="spinner" />} Restore ticket
            </button>
          </>
        }>
          <p className="muted" style={{ marginTop: 0 }}>
            The ticket comes back and is queued for repricing, so its money
            returns when the queue is next run. The original void stays on the
            audit trail.
          </p>
          <Field label="Reason" required>
            <textarea className="input" rows={3} value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Not a duplicate, the second load was real" />
          </Field>
        </Modal>
      )}

      {voiding && (
        <Modal title="Void this ticket" onClose={() => setVoiding(false)} footer={
          <>
            <button className="btn" onClick={() => setVoiding(false)}>Cancel</button>
            <button className="btn danger" disabled={reason.length < 3 || busy} onClick={doVoid}>
              {busy && <span className="spinner" />} Void ticket
            </button>
          </>
        }>
          <p className="muted" style={{ marginTop: 0 }}>
            Voiding never deletes. The ticket stays in the record, any transactions it
            produced are reversed rather than removed, and the reason you give here is
            written into the audit history.
          </p>
          <Field label="Reason" required>
            <textarea className="textarea" value={reason} autoFocus
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Duplicate scan at the DMS gate" />
          </Field>
        </Modal>
      )}
    </Drawer>
  )
}

/**
 * Correcting a ticket the field has already finished with.
 *
 * The walkthrough's finding was blunt: "I have no way to edit existing tickets
 * in the back-office (apart from void), but I should." The fields here are the
 * ones a data manager actually corrects at 9am after looking at the photos, and
 * the reason is required because it is what an auditor reads next to the
 * change. Anything touched here queues a reprice rather than leaving the ticket
 * and its money disagreeing.
 */
const CORRECTABLE = [
  { key: 'load_call_pct', label: 'Load call', type: 'number', unit: '%',
    hint: 'Certified capacity times this is the billable volume' },
  { key: 'debris_type', label: 'Debris type', source: 'debris_types' },
  { key: 'destination_site_id', label: 'Disposal site', source: 'project_sites' },
  { key: 'equipment_id', label: 'Truck', source: 'project_equipment' },
  { key: 'contractor_id', label: 'Contractor', source: 'project_contractors' },
  { key: 'driver_name', label: 'Driver' },
  { key: 'scale_ticket_number', label: 'Scale ticket' },
  { key: 'net_weight_lbs', label: 'Net weight', type: 'number', unit: 'lbs' },
  { key: 'quantity', label: 'Unit count', type: 'number',
    hint: 'Hangers, leaners or stumps on a unit rate ticket' },
  { key: 'origin_address', label: 'Origin address', wide: true,
    hint: 'Correcting an address a monitor typed by hand' },
  { key: 'notes', label: 'Notes', wide: true },
]

function TicketCorrection({ ticket, onClose, onSaved, toast }) {
  const { project } = useApp()
  const [form, setForm] = useState({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const changed = Object.entries(form).filter(
    ([k, v]) => String(v ?? '') !== String(ticket[k] ?? ''))

  async function save() {
    setBusy(true); setError(null)
    try {
      const payload = { _reason: reason }
      changed.forEach(([k, v]) => {
        const field = CORRECTABLE.find((f) => f.key === k)
        payload[k] = v === '' ? null : (field?.type === 'number' ? Number(v) : v)
      })
      const result = await api.patch(`/tickets/${ticket.id}`, payload)
      toast('Ticket corrected',
            result.reprocess_queued
              ? 'Queued for repricing, so the money follows'
              : 'Nothing about the price changed')
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal wide title={`Correct ${ticket.ticket_number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary"
                disabled={busy || reason.trim().length < 4 || changed.length === 0}
                onClick={save}>
          {busy && <span className="spinner" />} Save correction
        </button>
      </>
    }>
      {error && <ErrorNote error={{ message: error }} />}

      <div className="grid c2" style={{ gap: 12 }}>
        {CORRECTABLE.map((f) => (
          <div key={f.key} style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
            <Field label={f.label} hint={f.hint}>
              {f.source ? (
                <OptionSelect source={f.source} projectId={project?.id}
                              value={form[f.key] ?? ticket[f.key] ?? ''}
                              onChange={(v) => setForm({ ...form, [f.key]: v })} />
              ) : (
                <input className="input" type={f.type === 'number' ? 'number' : 'text'}
                       value={form[f.key] ?? ticket[f.key] ?? ''}
                       onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              )}
            </Field>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <Field label="Reason" required
               hint="Goes on the audit artifact next to what changed">
          <textarea className="input" rows={2} value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Load call corrected after reviewing the photos" />
        </Field>
      </div>

      {changed.length > 0 && (
        <div className="card" style={{ padding: 12, marginTop: 14 }}>
          <div className="dim" style={{ fontSize: 11, letterSpacing: '0.06em',
                                        textTransform: 'uppercase', marginBottom: 6 }}>
            Changing
          </div>
          {changed.map(([k, v]) => (
            <div key={k} style={{ fontSize: 13 }}>
              {CORRECTABLE.find((f) => f.key === k)?.label}:{' '}
              <span className="dim">{String(ticket[k] ?? '—')}</span> to <b>{String(v || '—')}</b>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function OptionSelect({ source, projectId, value, onChange }) {
  const opts = useFetch(
    () => (projectId ? api.get(`/projects/${projectId}/options/${source}`) : null),
    [projectId, source])
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not set</option>
      {(opts.data?.items || []).map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/**
 * Repricing, with the cost shown rather than reported afterwards.
 *
 * An approved invoice stops this. Forcing past it is a real decision, so the
 * refusal is read first and the override only appears once it has been.
 */
function RepriceModal({ ticket, onClose, onDone, toast }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [locked, setLocked] = useState(false)
  const [reason, setReason] = useState(ticket.reprocess_reason || '')

  async function run(force) {
    setBusy(true); setError(null)
    try {
      const result = await api.post(`/tickets/${ticket.id}/reprocess`, { reason, force })
      const r = result.reprocess
      toast('Repriced',
            `${fmt.money(r.old_total)} to ${fmt.money(r.new_total)} `
            + `(${r.difference >= 0 ? '+' : ''}${fmt.money(r.difference)})`)
      onDone()
    } catch (err) {
      setError(err.message)
      if (/has been approved/i.test(err.message)) setLocked(true)
    } finally { setBusy(false) }
  }

  return (
    <Modal title={`Reprice ${ticket.ticket_number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        {locked && (
          <button className="btn danger" disabled={busy || reason.trim().length < 4}
                  onClick={() => run(true)}>
            Reprice anyway
          </button>
        )}
        <button className="btn primary" disabled={busy || reason.trim().length < 4}
                onClick={() => run(false)}>
          {busy && <span className="spinner" />} Reprice
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        Every live transaction on this ticket is reversed and the rules run
        again. Nothing is deleted: the reversals stay in the ledger as the record
        of what changed.
      </p>
      {error && (
        <div className="card" style={{ padding: 12, marginBottom: 12,
                                       borderColor: 'var(--red)',
                                       background: 'var(--red-soft)',
                                       color: 'var(--red)' }}>
          {error}
          {locked && (
            <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
              Repricing anyway leaves the invoice carrying a superseded line,
              which shows on the invoice as needing review.
            </div>
          )}
        </div>
      )}
      <Field label="Reason" required>
        <textarea className="input" rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Certified capacity corrected" />
      </Field>
    </Modal>
  )
}

function DetailTab({ t, o, m, type }) {
  const rows = [
    ['Ticket type', type?.label],
    ['Contractor', o?.contractor_name],
    ['Truck', o?.truck_number],
    ['Driver', t.driver_name],
    ['Barcode', t.barcode],
    ['Debris type', o?.debris_label],
    ['Zone', t.zone_id ? 'Assigned' : null],
    ['Origin', t.origin_address || [t.origin_house_number, t.origin_street]
      .filter(Boolean).join(' ')],
    ['Origin GPS', t.origin_latitude
      ? `${Number(t.origin_latitude).toFixed(5)}, ${Number(t.origin_longitude).toFixed(5)}` : null],
    ['Loading time', fmt.datetime(t.origin_at)],
    ['Destination', o?.destination_site_name],
    ['Disposal time', fmt.datetime(t.destination_at)],
    ['Certified capacity', t.certified_capacity_cy ? `${fmt.number(t.certified_capacity_cy, 0)} CY` : null],
    ['Load call', t.load_call_pct ? `${fmt.number(t.load_call_pct, 0)}%` : null],
    ['Scale ticket', t.scale_ticket_number],
    ['Net weight', t.net_weight_lbs ? `${fmt.number(t.net_weight_lbs, 0)} lbs` : null],
    ['Special class', t.special_class],
    ['Severity', t.severity],
    ['Created by', o?.created_by_name],
    ['Source', fmt.title(t.source)],
  ].filter(([, v]) => v)

  const extra = Object.entries(t.data || {})

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="grid c3" style={{ gap: 10 }}>
        <div className="card stat">
          <div className="k">Billable volume</div>
          <div className="v" style={{ fontSize: 20 }}>
            {fmt.number(m?.billable_cubic_yards, 2)}<small>CY</small>
          </div>
        </div>
        <div className="card stat">
          <div className="k">Net weight</div>
          <div className="v" style={{ fontSize: 20 }}>
            {fmt.number(m?.net_tons, 2)}<small>tons</small>
          </div>
        </div>
        <div className="card stat">
          <div className="k">Haul distance</div>
          <div className="v" style={{ fontSize: 20 }}>
            {fmt.number(m?.haul_miles, 2)}<small>mi</small>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <dl className="kv">
          {rows.map(([k, v]) => (<><dt key={`${k}-t`}>{k}</dt><dd key={`${k}-d`}>{v}</dd></>))}
        </dl>
      </div>

      {t.notes && (
        <div className="card" style={{ padding: 16 }}>
          <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                          letterSpacing: '0.06em', marginBottom: 6 }}>Notes</div>
          <div style={{ lineHeight: 1.65 }}>{t.notes}</div>
        </div>
      )}

      {extra.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                          letterSpacing: '0.06em', marginBottom: 8 }}>
            Type-specific fields
          </div>
          <dl className="kv">
            {extra.map(([k, v]) => (
              <><dt key={`${k}-t`}>{fmt.title(k)}</dt>
                <dd key={`${k}-d`} className="mono">{String(v)}</dd></>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function StagesTab({ stages, type, waypoints }) {
  const declared = type?.stage_schema || []
  const done = new Set(stages.map((s) => s.stage_code))

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="timeline">
        {declared.map((d) => {
          const actual = stages.find((s) => s.stage_code === d.code)
          const state = actual?.status === 'complete' ? 'done' : (done.has(d.code) ? 'current' : '')
          return (
            <div className={`tl-item ${state}`} key={d.code}>
              <div className="tl-title">{d.label}</div>
              {actual ? (
                <>
                  <div className="tl-meta">
                    {fmt.datetime(actual.occurred_at)}
                    {actual.monitor_full_name && ` · ${actual.monitor_full_name}`}
                    {actual.monitor_code && ` (${actual.monitor_code})`}
                  </div>
                  <div className="tl-meta">
                    {[actual.site_name, actual.address,
                      actual.load_call_pct != null && `${fmt.number(actual.load_call_pct, 0)}% load call`,
                      actual.scale_ticket_number && `Scale ${actual.scale_ticket_number}`,
                      actual.latitude && `${Number(actual.latitude).toFixed(5)}, ${Number(actual.longitude).toFixed(5)}`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                </>
              ) : (
                <div className="tl-meta">{d.instructions || 'Not yet recorded'}</div>
              )}
            </div>
          )
        })}
      </div>

      {waypoints.length > 0 && (
        <div>
          <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                          letterSpacing: '0.06em', marginBottom: 8 }}>
            Route ({waypoints.length} waypoints)
          </div>
          <Route waypoints={waypoints} />
        </div>
      )}
    </div>
  )
}

function Route({ waypoints }) {
  const lats = waypoints.map((w) => Number(w.latitude))
  const lons = waypoints.map((w) => Number(w.longitude))
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats)
  const minLon = Math.min(...lons); const maxLon = Math.max(...lons)
  const spanLat = maxLat - minLat || 0.001
  const spanLon = maxLon - minLon || 0.001
  const x = (lon) => 8 + ((lon - minLon) / spanLon) * 84
  const y = (lat) => 92 - ((lat - minLat) / spanLat) * 84

  return (
    <div className="map-frame">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
           style={{ width: '100%', height: '100%' }}>
        <polyline fill="none" stroke="var(--accent)" strokeWidth="0.7"
                  strokeLinecap="round" strokeLinejoin="round"
                  points={waypoints.map((w) => `${x(Number(w.longitude))},${y(Number(w.latitude))}`).join(' ')} />
        {waypoints.map((w, i) => (
          <circle key={w.id} cx={x(Number(w.longitude))} cy={y(Number(w.latitude))}
                  r={i === 0 || i === waypoints.length - 1 ? 1.6 : 1}
                  fill={i === 0 ? 'var(--green)' : i === waypoints.length - 1
                    ? 'var(--red)' : 'var(--accent)'}>
            <title>{`#${w.sequence} ${fmt.time(w.recorded_at)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  )
}

function MediaTab({ media }) {
  if (!media.length) {
    return <Empty icon="camera" title="No images attached">
      Photos captured in the field appear here alongside any scanned documents.
    </Empty>
  }
  return (
    <div className="photo-grid">
      {media.map((m) => (
        <div key={m.id} className={`photo${m.is_primary ? ' primary' : ''}`}>
          <Icon name="camera" size={20} />
          <div className="cap">
            {m.description || fmt.title(m.media_kind)}
            {m.is_primary && ' · primary'}
          </div>
        </div>
      ))}
    </div>
  )
}

function MoneyTab({ transactions, onChanged }) {
  const { can, toast } = useApp()
  const [reversing, setReversing] = useState(null)

  if (!transactions.length) {
    return <Empty icon="money" title="No transactions">
      This ticket has not matched any rule yet, or it is not in a billable state.
    </Empty>
  }

  // A superseded row is the evidence of a correction, not a live charge. It is
  // dimmed rather than hidden, because the whole point of keeping it is that
  // somebody can see what the number used to be.
  const live = transactions.filter((tx) => !tx.superseded_at)
  const total = live.reduce((sum, tx) => sum + Number(tx.amount || 0), 0)

  return (
    <div className="stack" style={{ gap: 10 }}>
      {transactions.length !== live.length && (
        <div className="muted" style={{ fontSize: 13 }}>
          {transactions.length - live.length} of these have been superseded by a
          correction. They stay here as the record of what changed.
        </div>
      )}

      {transactions.map((tx) => (
        <div className="card" key={tx.id}
             style={{ padding: 14, opacity: tx.superseded_at ? 0.55 : 1 }}>
          <div className="row">
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="mono dim">{tx.transaction_number}</span>
                {tx.is_reversal && <Badge tone="red">Reversal</Badge>}
                {tx.superseded_at && <Badge>Superseded</Badge>}
                {tx.invoice_number && <Badge tone="blue">{tx.invoice_number}</Badge>}
              </div>
              <div style={{ fontWeight: 570, marginTop: 4 }}>{tx.service_code_name}</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                Matched by “{tx.rule_name}” · {tx.contractor_name} · {tx.contract_number}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 17, fontWeight: 640 }}>{fmt.money(tx.amount)}</div>
              <div className="dim nums" style={{ fontSize: 12 }}>
                {fmt.number(tx.quantity, 2)} {tx.unit_abbrev} × {fmt.rate(tx.rate_amount)}
              </div>
              <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>
                from {fmt.title(tx.quantity_source)}
              </div>
              {can('transaction.reverse') && !tx.is_reversal && !tx.superseded_at && (
                <button className="btn sm" style={{ marginTop: 8 }}
                        onClick={() => setReversing(tx)}>Reverse</button>
              )}
            </div>
          </div>
          {tx.supersede_reason && (
            <div className="dim" style={{ fontSize: 12, marginTop: 8,
                                          paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              Superseded: {tx.supersede_reason}
            </div>
          )}
          {tx.reversal_reason && (
            <div className="dim" style={{ fontSize: 12, marginTop: 8,
                                          paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              Reversed: {tx.reversal_reason}
            </div>
          )}
        </div>
      ))}

      <div className="row" style={{ justifyContent: 'flex-end', gap: 10,
                                    paddingTop: 4 }}>
        <span className="dim" style={{ fontSize: 12 }}>Billing now</span>
        <span style={{ fontSize: 17, fontWeight: 640 }}>{fmt.money(total)}</span>
      </div>

      {reversing && (
        <ReverseModal tx={reversing} onClose={() => setReversing(null)}
                      onDone={() => { setReversing(null); onChanged?.() }}
                      toast={toast} />
      )}
    </div>
  )
}

/**
 * Reversing one transaction, as opposed to repricing the whole ticket.
 *
 * The endpoint has always existed and no screen called it, which is why the
 * walkthrough found "no way to reverse a transaction". The original is never
 * touched: a matching negative row is written beside it.
 */
function ReverseModal({ tx, onClose, onDone, toast }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function run() {
    setBusy(true); setError(null)
    try {
      await api.post(`/transactions/${tx.id}/reverse`, { reason })
      toast('Transaction reversed', `${fmt.money(-tx.amount)} against ${tx.transaction_number}`)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={`Reverse ${tx.transaction_number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" disabled={busy || reason.trim().length < 4}
                onClick={run}>
          {busy && <span className="spinner" />} Reverse {fmt.money(tx.amount)}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        The original is not touched. A matching negative row is written beside
        it, so the ledger explains itself.
        {tx.invoice_number && (
          <> This transaction is on <b>{tx.invoice_number}</b>, which will show
          as needing review.</>
        )}
      </p>
      {error && <ErrorNote error={{ message: error }} />}
      <Field label="Reason" required>
        <textarea className="input" rows={2} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Load call corrected after site review" />
      </Field>
    </Modal>
  )
}

function AuditTab({ events }) {
  if (!events.length) return <Empty icon="audit" title="No audit artifacts yet" />
  return (
    <div className="timeline">
      {events.map((e) => (
        <div className="tl-item done" key={e.id}>
          <div className="tl-title">
            {fmt.title(e.action)} <span className="dim" style={{ fontWeight: 400 }}>by {e.actor}</span>
          </div>
          <div className="tl-meta">{fmt.datetime(e.occurred_at)}
            {e.reason && ` · ${e.reason}`}</div>
          {e.changed && Object.keys(e.changed).length > 0 && (
            <div className="diff" style={{ marginTop: 6 }}>
              {Object.entries(e.changed).slice(0, 6).map(([field, change]) => (
                <div key={field}>
                  <span className="dim">{field}: </span>
                  {change.from !== undefined && change.from !== null && (
                    <span className="from">{String(change.from)}</span>
                  )}
                  {' '}
                  <span className="to">{String(change.to ?? '')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

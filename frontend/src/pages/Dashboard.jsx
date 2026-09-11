import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import { AlertsPanel } from '../components/setup-bits'
import {
  AreaChart, BarList, Badge, Card, Donut, Empty, ErrorNote, Icon, Loading, Stat,
} from '../components/ui'

const READINESS_LABELS = {
  has_client: 'Client', has_contract: 'Contract', has_contractor: 'Contractor',
  has_site: 'Disposal site', has_ticket_type: 'Ticket type',
  has_service_code: 'Service code', has_rate: 'Rate', has_rule: 'Rule',
  has_field_worker: 'Field worker',
}

/**
 * What needs attention, above what was produced.
 *
 * C1: "When we wake up and start our day with coffee at 9am we are hunting for
 * the issues". The dashboard opened on totals, which is the project manager's
 * question. This is the data manager's, and it links straight into the work
 * rather than describing it.
 */
function NeedsAttention({ data, navigate }) {
  const r = data.review || {}
  // Written as pairs rather than by appending an s, because the plural of
  // "ticket not looked at" is not "ticket not looked ats".
  const items = [
    { n: Number(r.serious || 0), one: 'serious flag', many: 'serious flags',
      tone: 'red', go: '/review?state=all&severity=serious' },
    { n: Number(r.unreviewed || 0), one: 'ticket not looked at',
      many: 'tickets not looked at', tone: 'amber', go: '/review' },
    { n: Number(r.raised || 0), one: 'ticket flagged for someone',
      many: 'tickets flagged for someone', tone: 'amber', go: '/review?state=flagged' },
    { n: Number(data.needs_reprocess || 0), one: 'ticket waiting to be repriced',
      many: 'tickets waiting to be repriced', tone: 'amber',
      go: '/tickets?processing_state=queued' },
    { n: (data.alerts || []).filter((a) => a.severity === 'serious').length,
      one: 'permit or certificate overdue', many: 'permits or certificates overdue',
      tone: 'red', go: '/setup' },
  ].filter((i) => i.n > 0)

  if (items.length === 0) {
    return (
      <Card title="Nothing needs attention"
            actions={<Badge tone="green">Clear</Badge>}>
        <p className="muted" style={{ margin: 0 }}>
          Every ticket has been reviewed, nothing is waiting to be repriced, and
          no permit or certificate is overdue.
        </p>
      </Card>
    )
  }

  return (
    <Card title="Needs attention"
          sub="Where the day starts"
          actions={<button className="btn sm primary"
                           onClick={() => navigate('/review')}>Open the queue</button>}>
      <div className="row wrap" style={{ gap: 8 }}>
        {items.map((i) => (
          <button key={i.one} className="btn" onClick={() => navigate(i.go)}>
            <b style={{ color: `var(--${i.tone})`, fontSize: 15 }}>{fmt.int(i.n)}</b>
            {' '}{i.n === 1 ? i.one : i.many}
          </button>
        ))}
      </div>
    </Card>
  )
}

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
]

// What the breakdowns count. The headline totals stay project to date, because
// "billed to date" has to keep meaning to date.
const PERIODS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: '30 days' },
  { key: 'all', label: 'All' },
]

export default function Dashboard() {
  const { projectId, project, can, toast } = useApp()
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const [period, setPeriod] = useState('all')
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/projects/${projectId}/dashboard`, { days, period }),
    [projectId, days, period], { skip: !projectId })

  if (!projectId) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="page">
          <Empty icon="folder" title="No project in context">
            Pick a project from the switcher in the sidebar. Every screen in the back
            office is scoped to one project at a time.
          </Empty>
        </div>
      </>
    )
  }

  async function processQueue() {
    try {
      const result = await api.post(`/projects/${projectId}/tickets/process`)
      toast('Queue processed',
            `${result.tickets_processed} ticket(s), ${result.transactions_created} transaction(s) created`)
      reload()
    } catch (err) {
      toast('Could not process', err.message, 'err')
    }
  }

  const s = data?.summary
  const r = data?.readiness
  const queued = (data?.processing_queue || [])
    .filter((q) => ['queued', 'unprocessed', 'error'].includes(q.processing_state))
    .reduce((sum, q) => sum + Number(q.tickets), 0)

  return (
    <>
      <PageHeader title="Dashboard" crumb={project?.project_code}>
        {can('transaction.process') && queued > 0 && (
          <button className="btn primary" onClick={processQueue}>
            <Icon name="refresh" size={14} /> Process {fmt.int(queued)} queued
          </button>
        )}
      </PageHeader>

      <div className="page">
        {error && <ErrorNote error={error} onRetry={reload} />}
        {loading && <Loading rows={6} />}

        {data && (
          <div className="stack" style={{ gap: 14 }}>
            <NeedsAttention data={data} navigate={navigate} />

            <div className="grid c4">
              <Stat label="Tickets" value={fmt.int(s.ticket_total)}
                    detail={`${fmt.int(s.ticket_completed)} completed · ${fmt.int(s.ticket_open)} open`} />
              <Stat label="Cubic yards" value={fmt.number(s.total_cubic_yards, 0)}
                    detail={`${fmt.number(s.total_tons, 1)} tons weighed`} />
              <Stat label="Billable" value={fmt.money(s.billable_total)} tone="green"
                    detail="Locked transactions to date" />
              <Stat label="Awaiting processing" value={fmt.int(s.awaiting_processing)}
                    tone={s.awaiting_processing > 0 ? 'amber' : undefined}
                    detail={s.awaiting_processing ? 'Completed but not yet billed' : 'Queue is clear'} />
            </div>

            {/* Nagging, never blocking. Nobody should have to dig through email
                to find out which permit or certificate is outstanding. */}
            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)' }}>
              <Card title="Outstanding work"
                    sub="Nothing here stops the field"
                    actions={data.alerts?.length
                      ? <Badge tone={data.alerts.some((a) => a.severity === 'serious')
                          ? 'red' : 'amber'}>{data.alerts.length}</Badge>
                      : <Badge tone="green">Clear</Badge>}>
                {data.alerts?.length ? (
                  <div className="stack" style={{ gap: 8 }}>
                    {data.alerts.slice(0, 6).map((a, n) => (
                      <div key={n} className="row" style={{ gap: 9, alignItems: 'baseline' }}>
                        <Badge tone={a.severity === 'serious' ? 'red' : 'amber'}>
                          {fmt.title(a.kind)}
                        </Badge>
                        <b style={{ fontSize: 13.5 }}>{a.label}</b>
                        <span className="dim" style={{ fontSize: 12.5 }}>{a.detail}</span>
                      </div>
                    ))}
                    {data.alerts.length > 6 && (
                      <div className="dim" style={{ fontSize: 12.5 }}>
                        and {data.alerts.length - 6} more
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    No permit, document or certification is waiting on anyone.
                  </p>
                )}
              </Card>

              {/* E1: "are we at sixty percent of the hanger estimate". The
                  estimate has existed since Sprint 1 and nothing compared it
                  to what the field has actually collected. */}
              <Card title="Against the estimate"
                    sub="What the client authorised, against what has come in">
                {data.progress?.length ? (
                  <div className="stack" style={{ gap: 10 }}>
                    {data.progress.map((row) => (
                      <div key={row.debris_type_code}>
                        <div className="row" style={{ fontSize: 13, gap: 8 }}>
                          <span>{row.debris_label}</span>
                          <div className="spacer" />
                          <span className="nums dim">
                            {fmt.number(row.collected, 0)} of{' '}
                            {fmt.number(row.estimated_quantity, 0)} {row.unit_abbrev}
                          </span>
                          <b className="nums" style={{ minWidth: 46, textAlign: 'right' }}>
                            {row.percent_of_estimate === null
                              ? '—' : `${fmt.number(row.percent_of_estimate, 0)}%`}
                          </b>
                        </div>
                        <div className="meter" title={`${row.confidence}, as of ${fmt.date(row.as_of_date)}`}>
                          <span style={{
                            width: `${Math.min(Number(row.percent_of_estimate) || 0, 100)}%`,
                            background: Number(row.percent_of_estimate) > 90
                              ? 'var(--amber)' : 'var(--accent)',
                          }} />
                        </div>
                      </div>
                    ))}
                    <div className="dim" style={{ fontSize: 12 }}>
                      Estimates are append only, so every revision is still on the
                      project setup screen.
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0 }}>
                    No estimate has been recorded yet, so there is nothing to
                    measure production against.
                  </p>
                )}
              </Card>
            </div>

            <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
              <Card title="Volume and billing"
                    sub={`Last ${RANGES.find((r) => r.days === days)?.label}`}
                    actions={
                      <div className="seg">
                        {RANGES.map((r) => (
                          <button key={r.days} className={days === r.days ? 'on' : ''}
                                  onClick={() => setDays(r.days)}>{r.label}</button>
                        ))}
                      </div>
                    }>
                <AreaChart data={data.by_day} xKey="day" yKey="cubic_yards"
                           format={fmt.int} label="Cubic yards per day" />
                <div className="chart-legend">
                  <span className="item"><span className="swatch" style={{ background: '#3b82f6' }} />
                    Cubic yards collected</span>
                  <span className="item dim">
                    {fmt.int(data.by_day.reduce((a, d) => a + Number(d.tickets), 0))} tickets ·
                    {' '}{fmt.money(data.by_day.reduce((a, d) => a + Number(d.billable), 0))} billed
                    {' '}in window
                  </span>
                </div>
              </Card>

              <Card title="Project readiness"
                    sub={r?.ready_for_field ? 'Field work is unblocked' : 'Field work is blocked'}
                    actions={r?.ready_for_field
                      ? <Badge tone="green">Ready</Badge>
                      : <Badge tone="amber">Setup incomplete</Badge>}>
                <div className="checklist">
                  {Object.entries(READINESS_LABELS).map(([key, label]) => (
                    <div key={key} className={`check-row ${r?.[key] ? 'ok' : 'missing'}`}>
                      <span className="check-icon">
                        <Icon name={r?.[key] ? 'check' : 'alert'} size={15} />
                      </span>
                      {label}
                    </div>
                  ))}
                </div>
                {!r?.ready_for_field && can('project.update') && (
                  <button className="btn block" style={{ marginTop: 12 }}
                          onClick={() => navigate('/setup')}>
                    Finish project setup <Icon name="chevron" size={13} />
                  </button>
                )}
              </Card>
            </div>

            <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
              <h2 style={{ fontSize: 15, margin: 0 }}>Production</h2>
              <span className="dim" style={{ fontSize: 12.5 }}>
                {period === 'all' ? 'the whole project' :
                 period === 'yesterday' ? 'yesterday only' :
                 period === 'week' ? 'the last seven days' : 'the last thirty days'}
              </span>
              <div className="spacer" />
              <div className="seg">
                {PERIODS.map((p) => (
                  <button key={p.key} className={period === p.key ? 'on' : ''}
                          onClick={() => setPeriod(p.key)}>{p.label}</button>
                ))}
              </div>
            </div>

            <div className="grid c3">
              <Card title="By ticket type">
                <Donut data={data.by_ticket_type} valueKey="tickets" />
              </Card>
              <Card title="By debris type" sub="Billable cubic yards">
                <BarList data={data.by_debris_type} valueKey="cubic_yards"
                         format={(v) => fmt.number(v, 0)} />
              </Card>
              <Card title="By contractor" sub="Billed to date">
                <BarList data={data.by_contractor} valueKey="billable" format={fmt.money} />
              </Card>
            </div>

            <div className="grid c2">
              <Card title="Disposal sites" sub="Cubic yards received">
                <BarList data={data.by_site} valueKey="cubic_yards"
                         format={(v) => fmt.number(v, 0)} />
              </Card>
              <Card title="Open and severe incidents"
                    actions={<button className="btn sm ghost" onClick={() => navigate('/incidents')}>
                      View all <Icon name="chevron" size={12} /></button>}>
                {data.open_incidents.length === 0 ? (
                  <Empty icon="check" title="Nothing outstanding">
                    No ongoing or high severity incidents on this project.
                  </Empty>
                ) : (
                  <div className="stack" style={{ gap: 9 }}>
                    {data.open_incidents.map((i) => (
                      <div key={i.id} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                        <Badge status={i.severity} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 550 }}>
                            {i.category || 'Uncategorised'}
                            <span className="dim mono" style={{ marginLeft: 8, fontWeight: 400 }}>
                              {i.ticket_number}
                            </span>
                          </div>
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                            {i.notes}
                          </div>
                          <div className="dim" style={{ fontSize: 11.5, marginTop: 3 }}>
                            {i.origin_street} · {fmt.ago(i.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            <div className="grid c2">
              <Card title="Monitors"
                    sub="Most work in this period. Accuracy is on the review screen."
                    actions={<button className="btn sm"
                                     onClick={() => navigate('/review')}>Review</button>}>
                <BarList data={data.top_monitors} valueKey="tickets" />
              </Card>
              <Card title="Processing queue">
                <div className="stack" style={{ gap: 8 }}>
                  {data.processing_queue.map((q) => (
                    <div className="row" key={q.processing_state}>
                      <Badge status={q.processing_state} />
                      <div className="spacer" />
                      <span className="nums">{fmt.int(q.tickets)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

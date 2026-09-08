import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  AreaChart, BarList, Badge, Card, Donut, Empty, ErrorNote, Icon, Loading, Stat,
} from '../components/ui'

const READINESS_LABELS = {
  has_client: 'Client', has_contract: 'Contract', has_contractor: 'Contractor',
  has_site: 'Disposal site', has_ticket_type: 'Ticket type',
  has_service_code: 'Service code', has_rate: 'Rate', has_rule: 'Rule',
  has_field_worker: 'Field worker',
}

const RANGES = [
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
  { days: 365, label: '1 year' },
]

export default function Dashboard() {
  const { projectId, project, can, toast } = useApp()
  const navigate = useNavigate()
  const [days, setDays] = useState(30)
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/projects/${projectId}/dashboard`, { days }),
    [projectId, days], { skip: !projectId })

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
        <button className="btn icon" onClick={reload} title="Refresh">
          <Icon name="refresh" size={15} />
        </button>
      </PageHeader>

      <div className="page">
        {error && <ErrorNote error={error} onRetry={reload} />}
        {loading && <Loading rows={6} />}

        {data && (
          <div className="stack" style={{ gap: 14 }}>
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
              <Card title="Most active monitors">
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

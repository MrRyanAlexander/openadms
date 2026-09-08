import { useNavigate, useParams } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useAsync, useField } from '../lib/field'
import { Badge, Empty, Icon } from '../components/kit'

export default function TicketDetail() {
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const { online } = useField()
  const { data, loading } = useAsync(() => api.get(`/tickets/${ticketId}`),
                                     [ticketId], { skip: !online })

  if (loading) return <div className="screen"><Empty icon="clock" title="Loading" /></div>
  if (!data) return <div className="screen"><Empty icon="cloudOff" title="Not available offline" /></div>

  const { ticket: t, overview: o, ticket_type: type, stages, metrics } = data
  const declared = type?.stage_schema || []
  const nextStage = declared.find(
    (d) => !stages.some((s) => s.stage_code === d.code && s.status === 'complete'))

  return (
    <div className="screen">
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="mono" style={{ fontWeight: 640, fontSize: 16 }}>
            {t.ticket_number}
          </span>
          <div className="spacer" />
          <Badge status={t.is_void ? 'voided' : t.status} />
        </div>
        <div className="muted" style={{ fontSize: 13.5 }}>
          {type?.label}
          {o?.contractor_name && ` · ${o.contractor_name}`}
          {o?.truck_number && ` · ${o.truck_number}`}
        </div>
        <div className="row wrap" style={{ gap: 7, marginTop: 12 }}>
          {t.debris_type && <Badge tone="blue">{o?.debris_label || t.debris_type}</Badge>}
          {t.load_call_pct != null && (
            <Badge tone="green">{fmt.number(t.load_call_pct, 0)}% load call</Badge>
          )}
          {metrics?.billable_cubic_yards > 0 && (
            <Badge>{fmt.number(metrics.billable_cubic_yards, 1)} CY</Badge>
          )}
          {metrics?.haul_miles > 0 && (
            <Badge>{fmt.number(metrics.haul_miles, 1)} mi</Badge>
          )}
        </div>
      </div>

      {nextStage && !t.is_void && (
        <div className="card">
          <div style={{ fontWeight: 620, marginBottom: 4 }}>Next: {nextStage.label}</div>
          <div className="dim" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            {nextStage.instructions || 'Record this stage to move the ticket forward.'}
          </div>
          <button className="btn primary xl block" style={{ marginTop: 12 }}
                  onClick={() => navigate(`/ticket/${ticketId}/continue`)}>
            Continue this ticket
          </button>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 620, marginBottom: 12 }}>Lifecycle</div>
        {declared.map((d) => {
          const actual = stages.find((s) => s.stage_code === d.code)
          return (
            <div className="row" key={d.code}
                 style={{ alignItems: 'flex-start', padding: '9px 0',
                          borderBottom: '1px solid var(--line-soft)' }}>
              <div style={{
                width: 26, height: 26, borderRadius: 9, flex: 'none', marginTop: 1,
                display: 'grid', placeItems: 'center',
                background: actual ? 'var(--accent-soft)' : 'var(--surface-2)',
                color: actual ? 'var(--accent)' : 'var(--text-dim)',
              }}>
                <Icon name={actual ? 'check' : 'clock'} size={14} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 570, fontSize: 13.5 }}>{d.label}</div>
                <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                  {actual
                    ? `${fmt.datetime(actual.occurred_at)}${actual.monitor_name ? ` · ${actual.monitor_name}` : ''}`
                    : 'Not yet recorded'}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {data.media.length > 0 && (
        <div className="card">
          <div style={{ fontWeight: 620, marginBottom: 10 }}>
            Photos ({data.media.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {data.media.map((m) => (
              <div key={m.id} className="photo-slot filled" style={{ cursor: 'default' }}>
                <Icon name="camera" size={22} />
                <span style={{ fontSize: 11 }}>{m.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  )
}

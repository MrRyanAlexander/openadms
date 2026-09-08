import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useAsync, useField } from '../lib/field'
import { Badge, Empty, Icon } from '../components/kit'

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]

export default function MyTickets() {
  const { projectId, online } = useField()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('open')

  const { data, loading, reload } = useAsync(
    () => api.get(`/projects/${projectId}/tickets`, {
      mine_only: true, limit: 60,
      status: filter === 'completed' ? 'completed' : undefined,
    }),
    [projectId, filter], { skip: !projectId || !online })

  const items = (data?.items || []).filter((t) => {
    if (filter === 'open') return !['completed', 'voided'].includes(t.status)
    return true
  })

  if (!online) {
    return (
      <div className="screen">
        <Empty icon="cloudOff" title="You are offline">
          Your ticket history needs a connection. Anything you created while offline is
          queued and will send on its own.
        </Empty>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="chips" style={{ marginBottom: 16 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip${filter === f.key ? ' on' : ''}`}
                  onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
        <div className="spacer" />
        <button className="btn ghost icon sm" onClick={reload}>
          <Icon name="refresh" size={17} />
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ opacity: 0.4, height: 90 }} />
      ) : items.length === 0 ? (
        <Empty icon="inbox" title={filter === 'open' ? 'Nothing open' : 'No tickets yet'}>
          {filter === 'open'
            ? 'Every ticket you started has been closed out.'
            : 'Tickets you create appear here.'}
        </Empty>
      ) : (
        <div className="card">
          {items.map((t) => (
            <div className="ticket-row" key={t.id} onClick={() => navigate(`/ticket/${t.id}`)}>
              <div className="ticket-icon"
                   style={{ color: t.status === 'completed' ? 'var(--accent)'
                                   : t.is_void ? 'var(--red)' : 'var(--amber)' }}>
                <Icon name={t.status === 'completed' ? 'check' : 'clock'} size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>
                  {t.ticket_number}
                </div>
                <div className="dim truncate" style={{ fontSize: 12, marginTop: 1 }}>
                  {t.ticket_type_label}
                  {t.debris_label && ` · ${t.debris_label}`}
                  {t.truck_number && ` · ${t.truck_number}`}
                </div>
                <div className="dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                  {fmt.ago(t.completed_at || t.created_at)}
                  {t.billable_cubic_yards > 0
                    && ` · ${fmt.number(t.billable_cubic_yards, 1)} CY`}
                </div>
              </div>
              <Badge status={t.is_void ? 'voided' : t.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

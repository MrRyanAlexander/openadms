import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useAsync, useField } from '../lib/field'
import { Badge, Empty, Icon } from '../components/kit'

const KIND_STYLE = {
  load:      { icon: 'truck',  color: '#3b82f6' },
  haul_out:  { icon: 'route',  color: '#a78bfa' },
  unit_rate: { icon: 'ruler',  color: '#2dd48f' },
  incident:  { icon: 'alert',  color: '#f4676c' },
  custom:    { icon: 'list',   color: '#f5b03e' },
}

export default function Home() {
  const { project, projectId, user, online, queue } = useField()
  const navigate = useNavigate()

  const detail = useAsync(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId || !online })
  const mine = useAsync(
    () => api.get(`/projects/${projectId}/tickets`, { mine_only: true, limit: 6 }),
    [projectId], { skip: !projectId || !online })

  if (!projectId) {
    return (
      <div className="screen">
        <Empty icon="folder" title="No project assigned">
          Ask your manager to add you to a project. Tickets can only be created on a
          project you are approved to work.
        </Empty>
      </div>
    )
  }

  const types = (detail.data?.ticket_types || []).filter((t) => t.is_active !== false)
  const ready = detail.data?.ready_for_field
  const openTickets = (mine.data?.items || []).filter(
    (t) => !['completed', 'voided'].includes(t.status))

  return (
    <div className="screen">
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="dim" style={{ fontSize: 11.5, letterSpacing: '0.07em',
                                          textTransform: 'uppercase' }}>Active project</div>
            <div style={{ fontWeight: 640, fontSize: 16, marginTop: 3 }}>{project?.name}</div>
            <div className="dim" style={{ fontSize: 12.5, marginTop: 2 }}>
              {project?.project_code} · {fmt.title(project?.project_role)}
            </div>
          </div>
          <button className="btn ghost icon" onClick={() => navigate('/profile')}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      </div>

      {detail.data && !ready && (
        <div className="banner amber" style={{ marginBottom: 14 }}>
          This project is not fully configured yet, so the server will refuse new tickets.
          Missing: {(detail.data.missing || []).join(', ')}.
        </div>
      )}

      {queue.length > 0 && (
        <div className="banner amber" style={{ marginBottom: 14 }}>
          {queue.length} item{queue.length === 1 ? '' : 's'} waiting to sync.
          {online ? ' Sending now.' : ' They will send when you have signal.'}
        </div>
      )}

      {openTickets.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <b style={{ fontSize: 14 }}>Open on your phone</b>
            <div className="spacer" />
            <Badge tone="amber">{openTickets.length}</Badge>
          </div>
          {openTickets.map((t) => (
            <div className="ticket-row" key={t.id}
                 onClick={() => navigate(`/ticket/${t.id}`)}>
              <div className="ticket-icon" style={{ color: '#f5b03e' }}>
                <Icon name="clock" size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontWeight: 600, fontSize: 13.5 }}>
                  {t.ticket_number}
                </div>
                <div className="dim" style={{ fontSize: 12 }}>
                  {t.ticket_type_label} · {fmt.ago(t.created_at)}
                </div>
              </div>
              <Badge status={t.status} />
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, letterSpacing: '0.07em', textTransform: 'uppercase',
                    color: 'var(--text-dim)', fontWeight: 620, margin: '4px 2px 10px' }}>
        Start a ticket
      </div>

      {detail.loading ? (
        <div className="tiles">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="tile" style={{ opacity: 0.35 }} />
          ))}
        </div>
      ) : types.length === 0 ? (
        <Empty icon="list" title="No ticket types enabled">
          Nothing is enabled on this project yet.
        </Empty>
      ) : (
        <div className="tiles">
          {types.map((t) => {
            const style = KIND_STYLE[t.kind] || KIND_STYLE.custom
            return (
              <button key={t.ticket_type_id} className="tile"
                      onClick={() => navigate(`/new/${t.ticket_type_id}`)}>
                <div className="ic" style={{ background: `${style.color}22`, color: style.color }}>
                  <Icon name={style.icon} size={21} />
                </div>
                <div>
                  <div className="name">{t.label}</div>
                  <div className="desc">
                    {(t.stage_schema || []).length} stage
                    {(t.stage_schema || []).length === 1 ? '' : 's'}
                    {t.requires_barcode && ' · barcode'}
                    {t.requires_photo && ' · photo'}
                  </div>
                </div>
              </button>
            )
          })}
          <button className="tile wide" onClick={() => navigate('/scan')}>
            <div className="ic" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>
              <Icon name="barcode" size={21} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="name">Scan a placard</div>
              <div className="desc">Claim a load handed off by another monitor</div>
            </div>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      )}
    </div>
  )
}

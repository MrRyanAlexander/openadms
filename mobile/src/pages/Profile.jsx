import { fmt } from '../lib/api'
import { useField } from '../lib/field'
import { Badge, Icon } from '../components/kit'

export default function Profile() {
  const { user, projects, projectId, setProjectId, logout, online, queue, sync, syncing } = useField()

  return (
    <div className="screen">
      <div className="card">
        <div className="row">
          <div style={{
            width: 48, height: 48, borderRadius: 16, flex: 'none',
            background: 'linear-gradient(140deg, var(--accent), var(--blue))',
            display: 'grid', placeItems: 'center', color: '#04150d',
            fontWeight: 680, fontSize: 17,
          }}>
            {(user?.full_name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 640, fontSize: 16 }}>{user?.full_name}</div>
            <div className="dim" style={{ fontSize: 12.5 }}>
              {user?.role_label} · {user?.monitor_id || user?.username}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <b style={{ fontSize: 14 }}>Connection</b>
          <div className="spacer" />
          <Badge tone={online ? 'green' : 'amber'}>
            <Icon name={online ? 'cloud' : 'cloudOff'} size={13} />
            {online ? 'Online' : 'Offline'}
          </Badge>
        </div>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          {queue.length === 0
            ? 'Nothing is waiting to send. Tickets you create offline are held here until you have signal.'
            : `${queue.length} item${queue.length === 1 ? '' : 's'} queued.`}
        </div>
        {queue.length > 0 && online && (
          <button className="btn block" style={{ marginTop: 12 }} onClick={sync} disabled={syncing}>
            {syncing && <span className="spinner" />} Sync now
          </button>
        )}
      </div>

      <div className="card">
        <b style={{ fontSize: 14 }}>Your projects</b>
        <div className="stack" style={{ marginTop: 10, gap: 8 }}>
          {projects.map((p) => (
            <button key={p.id}
                    className="chip"
                    style={{
                      textAlign: 'left', width: '100%',
                      borderColor: p.id === projectId ? 'var(--accent)' : undefined,
                      background: p.id === projectId ? 'var(--accent-soft)' : undefined,
                      color: p.id === projectId ? 'var(--accent)' : undefined,
                    }}
                    onClick={() => setProjectId(p.id)}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 2 }}>
                {p.project_code} · {fmt.title(p.project_role)}
                {p.can_create_tickets ? ' · may create tickets' : ' · read only'}
              </div>
            </button>
          ))}
          {projects.length === 0 && (
            <div className="muted" style={{ fontSize: 13 }}>
              You are not assigned to any project.
            </div>
          )}
        </div>
      </div>

      <button className="btn danger block" style={{ marginTop: 14 }} onClick={logout}>
        <Icon name="logout" size={18} /> Sign out
      </button>
    </div>
  )
}

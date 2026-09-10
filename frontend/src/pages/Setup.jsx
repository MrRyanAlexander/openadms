/**
 * Project setup, and the place a half-finished wizard is picked up again.
 *
 * The wizard and this screen are the same work seen from two angles: both use
 * the same step components, so they cannot drift apart, and both read the
 * readiness checklist straight from the database rather than tracking it
 * themselves.
 */
import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import { Badge, Card, Empty, ErrorNote, Icon, Loading, Tabs } from '../components/ui'
import {
  AlertsPanel, DocumentsPanel, EstimateEditor, ReadinessPanel, ScopeEditor,
} from '../components/setup-bits'
import {
  ContractStep, ContractorStep, ServiceCodeStep, SiteStep, TicketTypeStep, WorkerStep,
} from './NewProject'

export default function Setup() {
  const { projectId, project, lookups, toast } = useApp()
  const [tab, setTab] = useState('contractors')

  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })
  const scope = useFetch(() => api.get(`/projects/${projectId}/scope`),
                         [projectId], { skip: !projectId })
  const readiness = useFetch(() => api.get(`/projects/${projectId}/readiness`),
                             [projectId], { skip: !projectId })

  if (!projectId) {
    return (<><PageHeader title="Project Setup" /><div className="page">
      <Empty icon="folder" title="No project in context">
        Choose a project from the projects list to set it up.
      </Empty></div></>)
  }

  const p = detail.data
  function refresh() { detail.reload(); scope.reload(); readiness.reload() }

  return (
    <>
      <PageHeader title="Project Setup">
        <button className="btn icon" onClick={refresh}><Icon name="refresh" size={15} /></button>
      </PageHeader>

      <div className="page">
        {detail.loading && <Loading rows={7} />}
        {detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}

        {p && (
          <div className="stack" style={{ gap: 14 }}>
            <Card>
              <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div className="row" style={{ gap: 9 }}>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 640 }}>{p.name}</h2>
                    <Badge status={p.status} />
                    <Badge status={p.visibility_flag} />
                  </div>
                  <div className="muted" style={{ fontSize: 13, marginTop: 5 }}>
                    {p.client_name}
                    {p.declaration_code && ` · ${p.declaration_code}`}
                    {p.program_label && ` · ${p.program_label}`}
                  </div>
                  {p.description && (
                    <div className="muted" style={{ fontSize: 13, marginTop: 8, maxWidth: 640,
                                                    lineHeight: 1.65 }}>{p.description}</div>
                  )}
                </div>
                <div style={{ minWidth: 300, flex: '1 1 300px' }}>
                  <ReadinessPanel readiness={readiness.data} />
                </div>
                <div style={{ minWidth: 280, flex: '1 1 280px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: '.06em',
                                textTransform: 'uppercase', color: 'var(--text-dim)',
                                marginBottom: 8 }}>
                    Outstanding
                  </div>
                  <AlertsPanel projectId={projectId} limit={4} />
                </div>
              </div>
            </Card>

            <Card flush>
              <Tabs value={tab} onChange={setTab} tabs={[
                { key: 'scope', label: 'Scope',
                  count: (scope.data?.scopes || []).filter((s) => s.is_enabled).length },
                { key: 'estimates', label: 'Estimates',
                  count: (scope.data?.estimates || []).length },
                { key: 'contractors', label: 'Contractors', count: p.contractors.length },
                { key: 'contracts', label: 'Contracts', count: p.contracts.length },
                { key: 'sites', label: 'Disposal sites', count: p.sites.length },
                { key: 'types', label: 'Ticket types', count: p.ticket_types.length },
                { key: 'codes', label: 'Service codes' },
                { key: 'zones', label: 'Zones', count: p.zones.length },
                { key: 'workers', label: 'Workers', count: p.assignments.length },
                { key: 'documents', label: 'Documents' },
              ]} />

              <div style={{ padding: 16 }}>
                {tab === 'scope' && (scope.data ? (
                  <ScopeEditor scopes={scope.data.scopes}
                               suggested={scope.data.suggested_debris_types}
                               lookups={lookups}
                               onToggle={async (code, enabled) => {
                                 await api.put(`/projects/${projectId}/scope`, {
                                   entries: [{ debris_type_code: code, is_enabled: enabled }] })
                                 refresh()
                               }} />
                ) : <Loading rows={3} />)}

                {tab === 'estimates' && (scope.data ? (
                  <EstimateEditor scopes={scope.data.scopes} estimates={scope.data.estimates}
                                  lookups={lookups}
                                  onSave={async (body) => {
                                    await api.post(`/projects/${projectId}/estimates`, body)
                                    toast('Estimate recorded',
                                          `${body.debris_type_code}: ${fmt.int(body.estimated_quantity)}`)
                                    scope.reload()
                                  }} />
                ) : <Loading rows={3} />)}

                {tab === 'contractors' && (
                  <ContractorStep project={p} projectId={projectId} onChanged={refresh} />
                )}
                {tab === 'contracts' && (
                  <ContractStep project={p} projectId={projectId} onChanged={refresh} />
                )}
                {tab === 'sites' && (
                  <SiteStep project={p} projectId={projectId} onChanged={refresh} />
                )}
                {tab === 'types' && (
                  <TicketTypeStep project={p} projectId={projectId}
                                  scopes={scope.data?.scopes || []} onChanged={refresh} />
                )}
                {tab === 'codes' && (
                  <ServiceCodeStep project={p} projectId={projectId} onChanged={refresh} />
                )}
                {tab === 'zones' && (
                  <ZoneEditor zones={p.zones} projectId={projectId}
                              onChanged={detail.reload} toast={toast} />
                )}
                {tab === 'workers' && (
                  <WorkerStep project={p} projectId={projectId} onChanged={refresh} />
                )}
                {tab === 'documents' && (
                  <DocumentsPanel entityType="projects" entityId={projectId}
                                  projectId={projectId} />
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}

function ZoneEditor({ zones, projectId, onChanged, toast }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')

  async function add() {
    try {
      await api.post(`/projects/${projectId}/zones`, { zone_code: code, name })
      setCode(''); setName(''); onChanged()
    } catch (err) { toast('Could not add zone', err.message, 'err') }
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 14, gap: 8 }}>
        <input className="input" style={{ width: 110 }} placeholder="Code"
               value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="input" style={{ maxWidth: 300 }} placeholder="Name (optional)"
               value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary sm" disabled={!code} onClick={add}>
          <Icon name="plus" size={13} /> Add zone
        </button>
      </div>
      {zones.length === 0 ? (
        <Empty icon="pin" title="No zones defined">
          Zones are optional. They give the rule builder a zone operand and group tickets
          in reporting.
        </Empty>
      ) : (
        <div className="row wrap" style={{ gap: 8 }}>
          {zones.map((z) => (
            <div key={z.id} className="badge" style={{ height: 28, fontSize: 12.5 }}>
              <b>{z.zone_code}</b>{z.name ? ` · ${z.name}` : ''}
              <button className="btn ghost icon sm" style={{ width: 20, height: 20 }}
                      onClick={async () => {
                        await api.del(`/projects/${projectId}/zones/${z.id}`)
                        onChanged()
                      }}>
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

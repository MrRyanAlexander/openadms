/**
 * The missing front door.
 *
 * POST /projects has worked the whole time and needs only project.create at
 * manager rank. There was simply no interface calling it, so even an admin had
 * no way to make a project.
 *
 * Stepped in the order the database already enforces, and it writes as it goes
 * rather than at the end: the project is created at the identity step and every
 * later step links immediately. That is what makes an abandoned setup resumable
 * instead of lost, and it is why the setup screen and this wizard are the same
 * work seen from two angles.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal,
} from '../components/ui'
import {
  ContractLineItems, EstimateEditor, LineItemReview, LinkPicker,
  NEW_CONTRACTOR_FIELDS, NEW_CONTRACT_FIELDS, NEW_SITE_FIELDS, NEW_WORKER_FIELDS,
  PermitControl, RateForm, ReadinessPanel, RuleBuilder, RuleProposalReview,
  ScopeEditor, ServiceCodeForm,
} from '../components/setup-bits'

const STEPS = [
  { key: 'identity', label: 'Identity', hint: 'Name, code, client and declaration' },
  { key: 'scope', label: 'Scope', hint: 'Debris streams the client confirmed' },
  { key: 'estimate', label: 'Estimate', hint: 'How much of each stream' },
  { key: 'contractors', label: 'Contractors', hint: 'Prime, subs and the monitoring firm' },
  { key: 'contracts', label: 'Contracts', hint: 'And the line items they price' },
  { key: 'sites', label: 'Disposal sites', hint: 'And their permit state' },
  { key: 'types', label: 'Ticket types', hint: 'What the field can create' },
  { key: 'codes', label: 'Service codes', hint: 'Built from accepted line items' },
  { key: 'rules', label: 'Rules', hint: 'What turns a ticket into a transaction' },
  { key: 'workers', label: 'Workers', hint: 'Who is on this project' },
  { key: 'review', label: 'Review', hint: 'What is still missing' },
]

export default function NewProject() {
  const { lookups, enterProject, refreshProjects, toast } = useApp()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [projectId, setProjectId] = useState(null)

  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })
  const scope = useFetch(() => api.get(`/projects/${projectId}/scope`),
                         [projectId], { skip: !projectId })
  const readiness = useFetch(() => api.get(`/projects/${projectId}/readiness`),
                             [projectId], { skip: !projectId })

  const project = detail.data
  const at = STEPS[step]

  function refresh() {
    detail.reload(); scope.reload(); readiness.reload()
  }

  function finish() {
    enterProject(projectId)
    refreshProjects()
    navigate('/setup')
  }

  return (
    <>
      <PageHeader title="New project"
                  crumb={project ? `${project.project_code} · ${project.name}` : 'Not created yet'}>
        {projectId && (
          <button className="btn" onClick={finish}>
            Leave and finish later
          </button>
        )}
      </PageHeader>

      <div className="page">
        <div className="stack" style={{ gap: 14 }}>
          <Card>
            <div className="row wrap" style={{ gap: 6 }}>
              {STEPS.map((s, i) => {
                const done = i < step
                const here = i === step
                return (
                  <button key={s.key} className="badge"
                          disabled={!projectId && i > 0}
                          style={{
                            cursor: (!projectId && i > 0) ? 'default' : 'pointer',
                            opacity: (!projectId && i > 0) ? 0.45 : 1,
                            borderColor: here ? 'var(--accent)' : undefined,
                            background: here ? 'var(--accent-soft)' : undefined,
                            color: here ? 'var(--accent)' : undefined,
                          }}
                          onClick={() => (projectId || i === 0) && setStep(i)}>
                    <Icon name={done ? 'check' : here ? 'chevron' : 'plus'} size={11} />
                    {s.label}
                  </button>
                )
              })}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
              Step {step + 1} of {STEPS.length}: {at.hint}.
              {projectId && ' Everything you enter is saved as you go, so this can be left and picked up later.'}
            </div>
          </Card>

          <Card title={at.label}>
            {step === 0 && (
              <IdentityStep lookups={lookups}
                            onCreated={(p) => {
                              setProjectId(p.id)
                              toast('Project created', `${p.project_code} — ${p.name}`)
                              setStep(1)
                            }} />
            )}

            {step > 0 && !project && <Loading rows={5} />}

            {step === 1 && project && (
              <ScopeStep projectId={projectId} scope={scope} lookups={lookups}
                         onChanged={refresh} />
            )}
            {step === 2 && project && (
              <EstimateEditor scopes={scope.data?.scopes || []}
                              estimates={scope.data?.estimates || []}
                              lookups={lookups}
                              onSave={async (body) => {
                                await api.post(`/projects/${projectId}/estimates`, body)
                                scope.reload()
                              }} />
            )}
            {step === 3 && project && (
              <ContractorStep project={project} projectId={projectId} onChanged={refresh} />
            )}
            {step === 4 && project && (
              <ContractStep project={project} projectId={projectId} onChanged={refresh} />
            )}
            {step === 5 && project && (
              <SiteStep project={project} projectId={projectId} onChanged={refresh} />
            )}
            {step === 6 && project && (
              <TicketTypeStep project={project} projectId={projectId}
                              scopes={scope.data?.scopes || []} onChanged={refresh} />
            )}
            {step === 7 && project && (
              <ServiceCodeStep project={project} projectId={projectId} onChanged={refresh} />
            )}
            {step === 8 && project && (
              <RuleStep project={project} projectId={projectId} onChanged={refresh} />
            )}
            {step === 9 && project && (
              <WorkerStep project={project} projectId={projectId} onChanged={refresh} />
            )}
            {step === 10 && project && (
              <div className="stack" style={{ gap: 14 }}>
                <ReadinessPanel readiness={readiness.data} />
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
                  This checklist is read straight from the database rather than tracked by
                  this screen, so it cannot drift from what the system will actually allow.
                  Anything still missing can be finished on the project setup screen.
                </div>
                <div className="row">
                  <div className="spacer" />
                  <button className="btn primary" onClick={finish}>
                    Open the project <Icon name="chevron" size={13} />
                  </button>
                </div>
              </div>
            )}
          </Card>

          {projectId && step < STEPS.length - 1 && (
            <div className="row">
              <button className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
                Back
              </button>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setStep(step + 1)}>
                Next: {STEPS[step + 1].label} <Icon name="chevron" size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

/* ---------------------------------------------------------------- identity */
function IdentityStep({ lookups, onCreated }) {
  const [form, setForm] = useState({
    name: '', project_code: '', client_id: '', disaster_id: '', program_code: '',
    description: '', starts_on: '', ends_on: '', timezone: 'America/Chicago',
    ticket_prefix: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [creatingClient, setCreatingClient] = useState(false)
  const clients = useFetch(() => api.get('/clients', { limit: 200 }), [])
  const disasters = useFetch(() => api.get('/disasters', { limit: 100 }), [])
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      onCreated(await api.post('/projects', Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== ''))))
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  const valid = form.name && form.project_code && form.client_id

  return (
    <div className="stack">
      {error && <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                     background: 'var(--red-soft)', color: 'var(--red)' }}>{error}</div>}
      <div className="grid c2" style={{ gap: 12 }}>
        <Field label="Project name" required>
          <input className="input" value={form.name} autoFocus
                 onChange={(e) => set({ name: e.target.value })}
                 placeholder="DEMO Project 01 - Hurricane Vesper" />
        </Field>
        <Field label="Project code" required hint="Short, stable, and used on every ticket">
          <input className="input mono" value={form.project_code}
                 onChange={(e) => set({ project_code: e.target.value.toUpperCase() })}
                 placeholder="DEMO-01-VESPER" />
        </Field>
        <Field label="Client" required>
          <div className="row" style={{ gap: 6 }}>
            <select className="select" value={form.client_id}
                    onChange={(e) => set({ client_id: e.target.value })}>
              <option value="">Choose a client</option>
              {(clients.data?.items || []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="btn sm" onClick={() => setCreatingClient(true)}>
              <Icon name="plus" size={13} />
            </button>
          </div>
        </Field>
        <Field label="Declaration" hint="The clock every eligibility question is answered against">
          <select className="select" value={form.disaster_id}
                  onChange={(e) => set({ disaster_id: e.target.value })}>
            <option value="">Not linked yet</option>
            {(disasters.data?.items || []).map((d) => (
              <option key={d.id} value={d.id}>{d.declaration_code} — {d.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Program" hint="Pre-selects debris streams at the next step. It never limits them.">
          <select className="select" value={form.program_code}
                  onChange={(e) => set({ program_code: e.target.value })}>
            <option value="">Not set</option>
            {(lookups?.programs || []).map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Ticket prefix" hint="Leading letters on every ticket number">
          <input className="input mono" value={form.ticket_prefix}
                 onChange={(e) => set({ ticket_prefix: e.target.value.toUpperCase() })}
                 placeholder="STL" />
        </Field>
        <Field label="Starts on">
          <input className="input" type="date" value={form.starts_on}
                 onChange={(e) => set({ starts_on: e.target.value })} />
        </Field>
        <Field label="Timezone">
          <input className="input" value={form.timezone}
                 onChange={(e) => set({ timezone: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <textarea className="textarea" value={form.description}
                  onChange={(e) => set({ description: e.target.value })} />
      </Field>
      <div className="row">
        <div className="spacer" />
        <button className="btn primary" disabled={!valid || busy} onClick={save}>
          {busy && <span className="spinner" />} Create and continue
        </button>
      </div>

      {creatingClient && (
        <LinkPicker title="New client" items={[]} labelFor={() => ''}
                    selected="" onSelect={() => {}}
                    createTitle="Create" submitLabel="Create client"
                    createFields={[
                      { key: 'name', label: 'Name', required: true },
                      { key: 'code', label: 'Code' },
                      { key: 'client_type', label: 'Type', type: 'select',
                        options: ['local_government', 'state_agency', 'federal_agency',
                                  'tribal_nation', 'special_district', 'private'] },
                      { key: 'fema_applicant_id', label: 'FEMA applicant ID' },
                      { key: 'primary_contact', label: 'Primary contact' },
                      { key: 'contact_email', label: 'Email' },
                      { key: 'city', label: 'City' },
                      { key: 'state_code', label: 'State' },
                    ]}
                    onClose={() => setCreatingClient(false)}
                    onSubmit={async (body) => {
                      const made = await api.post('/clients', body.new)
                      await clients.reload()
                      set({ client_id: made.id })
                      setCreatingClient(false)
                    }} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- scope */
export function ScopeStep({ projectId, scope, lookups, onChanged }) {
  const [busy, setBusy] = useState(false)

  async function toggle(code, enabled) {
    setBusy(true)
    try {
      await api.put(`/projects/${projectId}/scope`,
                    { entries: [{ debris_type_code: code, is_enabled: enabled }] })
      onChanged()
    } finally { setBusy(false) }
  }

  if (!scope.data) return <Loading rows={4} />
  return (
    <div style={{ opacity: busy ? 0.7 : 1 }}>
      <ScopeEditor scopes={scope.data.scopes} suggested={scope.data.suggested_debris_types}
                   lookups={lookups} onToggle={toggle} />
    </div>
  )
}

/* ------------------------------------------------------------- contractors */
export function ContractorStep({ project, projectId, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [role, setRole] = useState('prime')
  const [parent, setParent] = useState('')
  const [busy, setBusy] = useState(false)
  const all = useFetch(() => api.get('/contractors', { limit: 200 }), [])

  const linked = project.contractors || []
  const available = (all.data?.items || []).filter(
    (c) => !linked.some((pc) => pc.contractor_id === c.id))
  const needsParent = role === 'sub_tier_2'

  async function submit(body) {
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/contractors`, {
        ...body,
        role_on_project: role,
        ...(needsParent || (role === 'sub_tier_1' && parent) ? { parent_contractor_id: parent } : {}),
      })
      setAdding(false); setSelected(''); setParent(''); setRole('prime')
      await all.reload()
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
        Tier is recorded here rather than on the firm, because a firm can be prime on one
        declaration and a second tier sub on the next. A second tier sub names the firm it
        works under, and that firm has to be on this project too.
      </div>

      <LinkedTable rows={linked} empty="No contractors yet. Service codes and rules can only reference contractors linked here."
                   columns={[['Contractor', 'name'], ['Code', 'code'],
                             ['Type', (r) => fmt.title(r.contractor_type)],
                             ['Tier', (r) => <Badge>{fmt.title(r.role_on_project)}</Badge>],
                             ['Works under', (r) => {
                               const p = linked.find((x) => x.contractor_id === r.parent_contractor_id)
                               return p ? p.name : '—'
                             }]]}
                   onAdd={() => setAdding(true)} addLabel="Add contractor"
                   onRemove={async (r) => {
                     await api.del(`/projects/${projectId}/contractors/${r.id}`)
                     onChanged()
                   }} />

      {adding && (
        <LinkPicker title="Add a contractor" items={available}
                    labelFor={(c) => `${c.name}${c.code ? ` (${c.code})` : ''}`}
                    valueKey="id" linkKey="contractor_id"
                    selected={selected} onSelect={setSelected}
                    createFields={NEW_CONTRACTOR_FIELDS} createTitle="Create new contractor"
                    busy={busy} onClose={() => setAdding(false)} onSubmit={submit}>
          <Field label="Tier on this project" required>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="prime">Prime</option>
              <option value="sub_tier_1">First tier sub</option>
              <option value="sub_tier_2">Second tier sub</option>
              <option value="monitoring_firm">Monitoring firm</option>
            </select>
          </Field>
          {(role === 'sub_tier_1' || role === 'sub_tier_2') && (
            <Field label="Works under" required={needsParent}
                   hint="Has to already be on this project">
              <select className="select" value={parent} onChange={(e) => setParent(e.target.value)}>
                <option value="">Choose…</option>
                {linked.map((c) => (
                  <option key={c.contractor_id} value={c.contractor_id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}
        </LinkPicker>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- contracts */
export function ContractStep({ project, projectId, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [primary, setPrimary] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reviewing, setReviewing] = useState(null)
  const all = useFetch(() => api.get('/contracts', { limit: 200 }), [])

  const linked = project.contracts || []
  const available = (all.data?.items || []).filter(
    (c) => !linked.some((pc) => pc.contract_id === c.id))

  async function submit(body) {
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/contracts`, { ...body, is_primary: primary })
      setAdding(false); setSelected(''); setPrimary(false)
      await all.reload()
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 660 }}>
        The contracts this project bills under. A rule cannot be saved without one, and
        the contract it names has to be on this list. A contract's priced schedule can be
        typed or pasted in here, which is a head start on the service codes rather than a
        requirement: a project whose rates were agreed by email bills perfectly well
        without a line item on file.
      </div>

      <LinkedTable rows={linked} empty="No contracts linked. A rule cannot be saved until its contract is on the project."
                   columns={[['Contract', 'contract_number'], ['Title', 'title'],
                             ['Contractor', 'contractor_name'],
                             ['Status', (r) => <Badge status={r.contract_status} />],
                             ['NTE', (r) => fmt.money(r.not_to_exceed)],
                             ['Primary', (r) => (r.is_primary
                               ? <Badge tone="blue">Primary</Badge> : '')],
                             ['Line items', (r) => (
                               <button className="btn ghost sm"
                                       onClick={(e) => { e.stopPropagation(); setReviewing(r) }}>
                                 {r.line_item_count
                                   ? `${r.line_item_count} line${r.line_item_count === 1 ? '' : 's'}`
                                   : 'Add lines'}
                               </button>
                             )]]}
                   onAdd={() => setAdding(true)} addLabel="Add contract"
                   onRemove={async (r) => {
                     await api.del(`/projects/${projectId}/contracts/${r.id}`)
                     onChanged()
                   }} />

      {adding && (
        <LinkPicker title="Add a contract" items={available}
                    labelFor={(c) => `${c.contract_number} — ${c.title}`}
                    valueKey="id" linkKey="contract_id"
                    selected={selected} onSelect={setSelected}
                    createFields={NEW_CONTRACT_FIELDS} createTitle="Create new contract"
                    busy={busy} onClose={() => setAdding(false)} onSubmit={submit}>
          <label className="check">
            <input type="checkbox" checked={primary}
                   onChange={(e) => setPrimary(e.target.checked)} />
            Make this the primary contract
          </label>
        </LinkPicker>
      )}

      {reviewing && (
        <Modal wide title={`Line items · ${reviewing.contract_number}`}
               onClose={() => { setReviewing(null); onChanged() }}>
          <ContractLineItems contractId={reviewing.contract_id} projectId={projectId}
                             onChanged={onChanged} />
        </Modal>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- sites */
export function SiteStep({ project, projectId, onChanged }) {
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const all = useFetch(() => api.get('/sites', { limit: 200 }), [])
  const permits = useFetch(() => api.get(`/projects/${projectId}/permits`), [projectId])

  const linked = permits.data?.items || []
  const available = (all.data?.items || []).filter(
    (s) => !(project.sites || []).some((ps) => ps.site_id === s.id))

  async function submit(body) {
    setBusy(true)
    try {
      await api.post(`/projects/${projectId}/sites`, body)
      setAdding(false); setSelected('')
      await all.reload(); permits.reload()
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
        A permit is recorded per declaration, and a pending one never stops work. Log who
        it was requested from so the clock starts; the alerts feed does the chasing.
      </div>

      {permits.loading && <Loading rows={3} />}
      {linked.length === 0 && !permits.loading && (
        <Empty icon="pin" title="No disposal sites yet">
          Load tickets cannot be closed without somewhere to take the debris.
        </Empty>
      )}

      {linked.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th>Site</th><th>Code</th><th>Kind</th><th>Permit</th><th />
            </tr></thead>
            <tbody>
              {linked.map((s) => (
                <tr key={s.project_site_id}>
                  <td style={{ fontWeight: 550 }}>{s.site_name}</td>
                  <td className="mono dim">{s.site_code || '—'}</td>
                  <td><Badge>{s.site_kind}</Badge></td>
                  <td>
                    <PermitControl projectId={projectId} site={s}
                                   onChanged={() => { permits.reload(); onChanged() }} />
                  </td>
                  <td style={{ width: 40, textAlign: 'right' }}>
                    <button className="btn ghost icon sm" title="Remove from project"
                            onClick={async () => {
                              await api.del(`/projects/${projectId}/sites/${s.project_site_id}`)
                              permits.reload(); onChanged()
                            }}>
                      <Icon name="x" size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row">
        <div className="spacer" />
        <button className="btn primary sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add disposal site
        </button>
      </div>

      {adding && (
        <LinkPicker title="Add a disposal site" items={available}
                    labelFor={(s) => `${s.name} (${s.site_kind})`}
                    valueKey="id" linkKey="site_id"
                    selected={selected} onSelect={setSelected}
                    createFields={NEW_SITE_FIELDS} createTitle="Create new site"
                    busy={busy} onClose={() => setAdding(false)} onSubmit={submit} />
      )}
    </div>
  )
}

/* ------------------------------------------------------------ ticket types */
const TREE_STREAMS = ['HANGER', 'LEANER', 'STUMP']

export function TicketTypeStep({ project, projectId, scopes, onChanged }) {
  const types = useFetch(() => api.get('/ticket-types'), [])
  const [busy, setBusy] = useState(false)

  const enabledStreams = scopes.filter((s) => s.is_enabled).map((s) => s.debris_type_code)
  const treeWork = enabledStreams.some((c) => TREE_STREAMS.includes(c))

  /** Pre-selection, never a gate: the scope suggests, and anything can be turned on. */
  const suggested = useMemo(() => {
    const out = ['LOAD', 'HAULOUT', 'INCIDENT']
    if (treeWork) out.push('UNIT')
    return out
  }, [treeWork])

  const linked = project.ticket_types || []
  const catalogue = (types.data?.items || []).filter((t) => !t.is_system)

  async function toggle(type, on) {
    setBusy(true)
    try {
      if (on) {
        await api.post(`/projects/${projectId}/ticket-types`, { ticket_type_id: type.id })
      } else {
        const link = linked.find((l) => l.ticket_type_id === type.id)
        if (link) await api.del(`/projects/${projectId}/ticket-types/${link.id}`)
      }
      onChanged()
    } finally { setBusy(false) }
  }

  if (types.loading) return <Loading rows={4} />

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
        The field app offers exactly what is enabled here and nothing else.
        {treeWork
          ? ' Tree work is in scope, so unit rate tickets are suggested.'
          : ' No tree streams are in scope, so unit rate tickets are not suggested.'}
      </div>
      <div className="grid c2" style={{ gap: 10, opacity: busy ? 0.7 : 1 }}>
        {catalogue.map((t) => {
          const on = linked.some((l) => l.ticket_type_id === t.id)
          const hinted = !on && suggested.includes(t.code)
          return (
            <button key={t.id} className="card"
                    style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                             borderColor: on ? 'var(--accent)' : hinted ? 'var(--blue)' : undefined,
                             background: on ? 'var(--accent-soft)' : undefined }}
                    onClick={() => toggle(t, !on)}>
              <div className="row" style={{ gap: 9 }}>
                <Icon name={on ? 'check' : 'plus'} size={14} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 570 }}>{t.label}</div>
                  <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
                    {fmt.title(t.kind)}{hinted && ' · suggested by the scope'}
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- service codes */
/**
 * Where a service code is made.
 *
 * This step used to be a read-only list of codes generated somewhere else, with
 * a second copy of the contract line reviewer underneath it. That put the whole
 * weight of the step on a path that only works when the priced schedule is
 * already typed in, and gave a project whose contract arrived as a scan no way
 * to bill at all.
 *
 * So the code, its rate and its contractor are entered here, and building a
 * batch of them from a contract's lines is one button beside that: an
 * accelerator, which is what it always was.
 */
export function ServiceCodeStep({ project, projectId, onChanged }) {
  const codes = useFetch(() => api.get(`/projects/${projectId}/service-codes`), [projectId])
  const [adding, setAdding] = useState(false)
  const [rating, setRating] = useState(null)
  const [building, setBuilding] = useState(null)
  const contracts = project.contracts || []
  const contractors = project.contractors || []

  function refresh() { codes.reload(); onChanged() }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 660 }}>
        A service code is what a rule bills: a code, the rate in effect, and the
        contractor it is paid to. Enter them here. Where a contract's priced schedule is
        already on file, the codes and their opening rates can be built from it in one
        pass instead, and each one keeps a link back to the line it came from.
      </div>

      {codes.loading && <Loading rows={3} />}
      {codes.data && (codes.data.items.length === 0 ? (
        <Empty icon="money" title="No service codes yet">
          Nothing on this project can be billed until there is at least one, with a rate
          in effect and a contractor who is on the project.
        </Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th>Code</th><th>Name</th><th>Contractor</th>
              <th className="num">Rate</th><th>Unit</th><th>Rules</th>
              <th>From line</th><th style={{ width: 90 }} />
            </tr></thead>
            <tbody>
              {codes.data.items.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td>
                  <td className="truncate" style={{ maxWidth: 240 }}>{c.name}</td>
                  <td className="muted">{c.contractor_name}</td>
                  <td className="num">
                    {c.current_rate != null ? fmt.rate(c.current_rate)
                      : <Badge tone="amber">No rate</Badge>}
                  </td>
                  <td className="dim">{c.current_unit_abbrev || '—'}</td>
                  <td className="dim">
                    {c.rule_count ? `${c.rule_count}` : <Badge tone="amber">None</Badge>}
                  </td>
                  <td>{c.contract_line_item_id
                    ? <Badge tone="green">Linked</Badge>
                    : <span className="dim">entered by hand</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost sm" onClick={() => setRating(c)}>
                      {c.current_rate != null ? 'Change rate' : 'Add a rate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <div className="row wrap" style={{ gap: 8 }}>
        <div className="spacer" />
        {contracts.length > 0 && (
          <div className="row" style={{ gap: 6 }}>
            <select className="select sm" style={{ maxWidth: 260 }}
                    value={building?.contract_id || ''}
                    onChange={(e) => setBuilding(contracts.find(
                      (c) => c.contract_id === e.target.value) || null)}>
              <option value="">Build from a contract…</option>
              {contracts.map((c) => (
                <option key={c.contract_id} value={c.contract_id}>
                  {c.contract_number}
                  {c.line_item_count ? ` · ${c.line_item_count} lines` : ' · no lines yet'}
                </option>
              ))}
            </select>
          </div>
        )}
        <button className="btn primary sm" disabled={!contractors.length}
                onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> Add service code
        </button>
      </div>

      {!contractors.length && (
        <div className="muted" style={{ fontSize: 12.5 }}>
          Every service code names the contractor it pays, so link a contractor to this
          project first.
        </div>
      )}

      {adding && (
        <ServiceCodeForm projectId={projectId} contractors={contractors}
                         onClose={() => setAdding(false)}
                         onSaved={() => { setAdding(false); refresh() }} />
      )}

      {rating && (
        <RateForm serviceCode={rating} onClose={() => setRating(null)}
                  onSaved={() => { setRating(null); refresh() }} />
      )}

      {building && (
        <Modal wide title={`Build codes from ${building.contract_number}`}
               onClose={() => { setBuilding(null); refresh() }}>
          <LineItemReview contractId={building.contract_id} projectId={projectId}
                          onGenerated={refresh} />
        </Modal>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- rules */
/**
 * The step the wizard did not have.
 *
 * Service codes were generated from the contract and then nothing connected
 * them to a ticket, which is the gap that let a project reach "ready for field
 * work" with no way to bill anything it collected. The rules are proposed from
 * the same line items the codes came from, and a person confirms them here.
 */
export function RuleStep({ project, projectId, onChanged }) {
  const readiness = useFetch(() => api.get(`/projects/${projectId}/readiness`),
                             [projectId])
  const codes = useFetch(() => api.get(`/projects/${projectId}/service-codes`),
                         [projectId])
  const rules = useFetch(() => api.get(`/projects/${projectId}/rules`), [projectId])
  const [building, setBuilding] = useState(null)
  const uncovered = readiness.data?.unruled_ticket_types || []

  function refresh() {
    readiness.reload(); rules.reload(); codes.reload(); onChanged?.()
  }

  const written = rules.data?.items || []

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 680 }}>
        A rule reads: on a ticket of this type, when these checks hold, bill this service
        code as the nth transaction on the ticket, under this contract. Without one, a
        ticket is collected, monitored and never billed, so the field stays blocked until
        every enabled ticket type has at least one.
      </div>

      {uncovered.length > 0 && (
        <div className="card" style={{ padding: '11px 14px', borderColor: 'var(--amber)',
                                       background: 'var(--amber-soft)' }}>
          <div className="row" style={{ gap: 9, alignItems: 'flex-start' }}>
            <Icon name="alert" size={15} style={{ marginTop: 2, color: 'var(--amber)' }} />
            <div style={{ fontSize: 13, lineHeight: 1.65 }}>
              Nothing bills {uncovered.join(', ')} yet.
            </div>
          </div>
        </div>
      )}

      {written.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th style={{ width: 44 }}>#</th>
              <th>Rule</th><th>Ticket type</th><th>Bills</th>
              <th className="num">Rate</th><th>Contract</th>
            </tr></thead>
            <tbody>
              {written.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }}
                    onClick={() => setBuilding(hydrateRule(r))}>
                  <td><Badge tone={r.transaction_sequence > 1 ? '' : 'blue'}>
                    {r.transaction_sequence}
                  </Badge></td>
                  <td style={{ fontWeight: 540 }}>{r.name}</td>
                  <td className="muted">{r.ticket_type_label}</td>
                  <td className="mono">{r.service_code}</td>
                  <td className="num">
                    {r.rate_amount != null ? fmt.rate(r.rate_amount) : '—'}
                  </td>
                  <td className="dim">{r.contract_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="row wrap" style={{ gap: 8 }}>
        <div className="spacer" />
        <button className="btn primary sm" onClick={() => setBuilding({})}
                disabled={!(project?.contracts || []).length}>
          <Icon name="plus" size={13} /> New rule
        </button>
      </div>

      <div className="card" style={{ padding: '12px 14px' }}>
        <div className="dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                      letterSpacing: '.06em', marginBottom: 10 }}>
          Proposed from the contract
        </div>
        <RuleProposalReview projectId={projectId} onWritten={refresh} />
      </div>

      {building && (
        <RuleBuilder projectId={projectId} project={project}
                     serviceCodes={codes.data?.items || []}
                     rule={building.id ? building : null}
                     onClose={() => setBuilding(null)}
                     onSaved={() => { setBuilding(null); refresh() }} />
      )}
    </div>
  )
}

/** A rule as the list returns it, in the shape the builder edits. */
export function hydrateRule(rule) {
  return {
    id: rule.id || rule.rule_id,
    name: rule.name || rule.rule_name || '',
    description: rule.description || rule.rule_description || '',
    ticket_type_id: rule.ticket_type_id || '',
    service_code_id: rule.service_code_id || '',
    contract_id: rule.contract_id || '',
    match_mode: rule.match_mode || 'all',
    priority: rule.priority ?? 100,
    transaction_sequence: rule.transaction_sequence ?? 1,
    stop_on_match: Boolean(rule.stop_on_match),
    is_active: rule.is_active !== false,
    statements: (rule.statements || []).map((s) => ({
      operand_code: s.operand_code, operator_code: s.operator_code,
      value: s.value, value_label: s.value_label, negate: Boolean(s.negate),
    })),
  }
}

/* ----------------------------------------------------------------- workers */
export function WorkerStep({ project, projectId, onChanged }) {
  const { toast } = useApp()
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState('')
  const [role, setRole] = useState('monitor')
  const [creates, setCreates] = useState(true)
  const [reviews, setReviews] = useState(false)
  const [busy, setBusy] = useState(false)
  const all = useFetch(() => api.get('/users', { limit: 200 }), [])

  const linked = project.assignments || []
  const available = (all.data?.items || []).filter(
    (u) => !linked.some((a) => a.user_id === u.id))

  async function submit(body) {
    setBusy(true)
    try {
      // Assignments take a user id, so a brand new worker is created first and
      // then assigned. Both happen without leaving this step.
      let created = null
      if (body.new) created = await api.post('/users', body.new)
      const userId = created ? created.id : body.user_id
      await api.post(`/projects/${projectId}/assignments`, {
        user_id: userId, project_role: role,
        can_create_tickets: creates, can_review_tickets: reviews,
      })
      if (created) {
        // The username and monitor ID are issued server-side when they are left
        // empty, so say what they came out as. A PM who has to go and look them
        // up on another screen has not finished creating the worker here.
        toast('Worker created and assigned',
              `${created.full_name} · ${created.username}`
              + (created.monitor_id ? ` · ${created.monitor_id}` : ''))
      }
      setAdding(false); setSelected('')
      await all.reload()
      onChanged()
    } finally { setBusy(false) }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 640 }}>
        A ticket can only be created by someone assigned here and cleared to create. A
        worker created here is a full account: the same fields the Workers screen asks
        for, with a username and monitor ID issued where they are left empty. Whole crews
        are faster to bring in by pasting a list on the Workers screen.
      </div>

      <LinkedTable rows={linked} empty="Nobody is assigned yet."
                   columns={[['Worker', 'full_name'], ['Monitor ID', 'monitor_id'],
                             ['Project role', (r) => <Badge>{fmt.title(r.project_role)}</Badge>],
                             ['Creates tickets', (r) => (r.can_create_tickets ? 'Yes' : 'No')],
                             ['Reviews', (r) => (r.can_review_tickets ? 'Yes' : 'No')]]}
                   onAdd={() => setAdding(true)} addLabel="Assign worker"
                   onRemove={async (r) => {
                     await api.del(`/projects/${projectId}/assignments/${r.id}`)
                     onChanged()
                   }} />

      {adding && (
        <LinkPicker title="Assign a worker" items={available}
                    labelFor={(u) => `${u.full_name}${u.monitor_id ? ` (${u.monitor_id})` : ''}`
                                     + ` — ${u.role_label}`}
                    valueKey="id" selected={selected}
                    onSelect={setSelected}
                    createFields={NEW_WORKER_FIELDS} createTitle="Create new worker"
                    busy={busy} onClose={() => setAdding(false)}
                    onSubmit={(body) => submit(body.new ? body : { user_id: body.id })}
                    submitLabel="Assign">
          <Field label="Project role">
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              {['monitor', 'manager', 'analyst', 'admin'].map((r) => (
                <option key={r} value={r}>{fmt.title(r)}</option>
              ))}
            </select>
          </Field>
          <label className="check">
            <input type="checkbox" checked={creates}
                   onChange={(e) => setCreates(e.target.checked)} />
            May create tickets
          </label>
          <label className="check">
            <input type="checkbox" checked={reviews}
                   onChange={(e) => setReviews(e.target.checked)} />
            May review other people's tickets
          </label>
        </LinkPicker>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ shared */
function LinkedTable({ rows, columns, onAdd, addLabel, onRemove, empty }) {
  return (
    <>
      {rows.length === 0 ? (
        <Empty icon="layers" title="Nothing linked yet">{empty}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              {columns.map(([label]) => <th key={label}>{label}</th>)}
              <th />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {columns.map(([label, accessor]) => (
                    <td key={label}>
                      {typeof accessor === 'function' ? accessor(r) : (r[accessor] ?? '—')}
                    </td>
                  ))}
                  <td style={{ width: 40, textAlign: 'right' }}>
                    <button className="btn ghost icon sm" onClick={() => onRemove(r)}
                            title="Remove from project">
                      <Icon name="x" size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ marginTop: 12 }}>
        <div className="spacer" />
        <button className="btn primary sm" onClick={onAdd}>
          <Icon name="plus" size={13} /> {addLabel}
        </button>
      </div>
    </>
  )
}

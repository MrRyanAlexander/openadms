import { useMemo, useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Confirm, Empty, ErrorNote, Icon, Loading, Modal, rowProps,
} from '../components/ui'
import { RuleBuilder, RuleProposalReview } from '../components/setup-bits'

export default function Rules() {
  const { projectId, project, toast } = useApp()
  const [editing, setEditing] = useState(null)
  const [testing, setTesting] = useState(null)
  const [removing, setRemoving] = useState(null)
  // The statement expression and the billed total are useful to the people who
  // want them and noise to everyone else, so the list leads and the technical
  // view sits one click away.
  const [expanded, setExpanded] = useState(null)
  const [building, setBuilding] = useState(false)
  // The list answers "what rules exist". The map answers "does every kind of
  // work on this project reach an invoice", which is a different question and
  // needs the whole chain on one row.
  const [view, setView] = useState('list')

  const rules = useFetch(() => api.get(`/projects/${projectId}/rules`),
                         [projectId], { skip: !projectId })
  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })
  const codes = useFetch(() => api.get(`/projects/${projectId}/service-codes`),
                         [projectId], { skip: !projectId })

  async function remove() {
    try {
      await api.del(`/rules/${removing.id}`)
      toast('Rule retired', `“${removing.name}” will no longer match new tickets`)
      setRemoving(null); rules.reload()
    } catch (err) { toast('Could not retire', err.message, 'err') }
  }

  if (!projectId) {
    return (<><PageHeader title="Rules" /><div className="page">
      <Empty icon="folder" title="No project in context" /></div></>)
  }


  return (
    <>
      <PageHeader title="Rules" crumb={project?.project_code}>
        <div className="seg" style={{ marginRight: 6 }}>
          <button className={view === 'list' ? 'on' : ''}
                  onClick={() => setView('list')}>List</button>
          <button className={view === 'map' ? 'on' : ''}
                  onClick={() => setView('map')}>Map</button>
        </div>
        <button className="btn" onClick={() => setBuilding(true)}>
          <Icon name="layers" size={14} /> Build from contract
        </button>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> New rule
        </button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Icon name="rules" size={16} style={{ marginTop: 2, color: 'var(--accent)' }} />
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
              A rule reads: <b style={{ color: 'var(--text)' }}>on a completed ticket of this
              type, when these checks hold, bill this service code as transaction number n,
              under this contract</b>. One ticket can produce several: a haul is number 1
              and the tipping fee it incurs is number 2, and both bill. Rules sharing a
              number are alternatives instead, and priority decides which of them wins. A
              rule cannot be saved without both a service code and a contract already
              linked to the project.
            </div>
          </div>
        </div>

        {view === 'map' && (
          <RuleMap projectId={projectId} serviceCodes={codes.data?.items || []}
                   project={detail.data}
                   onBuild={() => setBuilding(true)}
                   onChanged={() => { rules.reload(); codes.reload() }} />
        )}

        {view === 'list' && rules.loading && <Loading rows={5} />}
        {view === 'list' && rules.error && <ErrorNote error={rules.error} onRetry={rules.reload} />}

        {view === 'list' && rules.data && (rules.data.items.length === 0 ? (
          <Empty icon="rules" title="No rules yet"
                 action={<button className="btn primary" onClick={() => setBuilding(true)}>
                   <Icon name="layers" size={14} /> Build them from the contract</button>}>
            Until a rule exists, completed tickets are recorded but never billed, and
            the field stays blocked.
          </Empty>
        ) : (
          <Card flush>
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 30 }} />
                  <th>Rule</th><th>Ticket type</th><th>Service code</th>
                  <th className="num">Rate</th><th>Contract</th>
                  <th className="num" title="The order this charge runs on one ticket">
                    Txn #
                  </th>
                  <th className="num">Priority</th><th>Active</th>
                  <th className="num">Matches</th><th className="num">Billed</th><th />
                </tr></thead>
                <tbody>
                  {rules.data.items.map((r) => (
                    <RuleRow key={r.id} rule={r}
                             open={expanded === r.id}
                             onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                             onEdit={() => setEditing(hydrate(r))}
                             onTest={() => setTesting(r)}
                             onRemove={() => setRemoving(r)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {building && (
        <Modal wide title="Rules from the contract"
               onClose={() => { setBuilding(false); rules.reload() }}>
          <RuleProposalReview projectId={projectId}
                              onWritten={() => rules.reload()} />
        </Modal>
      )}
      {editing && (
        <RuleBuilder projectId={projectId} project={detail.data}
                     serviceCodes={codes.data?.items || []}
                     rule={editing.id ? editing : null}
                     onClose={() => setEditing(null)}
                     onSaved={() => { setEditing(null); rules.reload() }} />
      )}
      {testing && <RuleTest rule={testing} onClose={() => setTesting(null)} />}
      {removing && (
        <Confirm title="Retire this rule"
                 message={`“${removing.name}” has matched ${fmt.int(removing.match_count)} ticket(s) worth ${fmt.money(removing.billed_total)}. Retiring it stops future matches; transactions it already produced stay exactly as they are.`}
                 confirmLabel="Retire rule" onConfirm={remove} onClose={() => setRemoving(null)} />
      )}
    </>
  )
}

/* --------------------------------------------------------------- rule map */
/**
 * The chain on one row.
 *
 * A rule read on its own does not answer the question somebody checking a
 * project actually has, which is whether every kind of work this project does
 * reaches an invoice under the right code, rate, contract and contractor.
 * Opening rules one at a time to assemble that in your head is how a wrong
 * service code survives a whole event.
 *
 * Rows with something wrong sort first, the ticket types nothing covers are
 * named above the table, and the service code, contract and priority are
 * editable in place, because the fix for what this screen shows is almost
 * always one field on one row.
 */
const PROBLEM_TEXT = {
  no_rate: 'No rate in effect, so a match produces nothing',
  code_inactive: 'The service code is retired',
  rule_inactive: 'The rule is switched off',
  tiered_without_bands: 'Priced in bands, but no bands are written',
  expired: 'The rule stopped being effective',
}

function RuleMap({ projectId, serviceCodes, project, onBuild, onChanged }) {
  const { toast } = useApp()
  const [saving, setSaving] = useState(null)
  const map = useFetch(() => api.get(`/projects/${projectId}/rules/map`),
                       [projectId], { skip: !projectId })

  const contracts = project?.contracts || []

  async function patch(rule, body) {
    setSaving(rule.rule_id)
    try {
      await api.patch(`/rules/${rule.rule_id}`, body)
      map.reload()
      onChanged?.()
    } catch (err) { toast('Could not change that', err.message, 'err') }
    finally { setSaving(null) }
  }

  if (map.loading) return <Loading rows={6} />
  if (map.error) return <ErrorNote error={map.error} onRetry={map.reload} />
  if (!map.data) return null

  const uncovered = map.data.unruled_ticket_types || []
  const unruledCodes = map.data.unruled_service_codes || []

  return (
    <div className="stack" style={{ gap: 12 }}>
      {uncovered.length > 0 && (
        <div className="card" style={{ padding: '12px 15px', borderColor: 'var(--amber)',
                                       background: 'var(--amber-soft)' }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Icon name="alert" size={16} style={{ marginTop: 2, color: 'var(--amber)' }} />
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.65 }}>
              <b>Nothing bills {uncovered.join(', ')}.</b> A ticket of{' '}
              {uncovered.length === 1 ? 'that type' : 'those types'} cannot produce a
              transaction, so the field is blocked on this project until{' '}
              {uncovered.length === 1 ? 'it has' : 'each has'} a rule.
            </div>
            <button className="btn sm" onClick={onBuild}>Build from contract</button>
          </div>
        </div>
      )}

      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        {map.data.total} rule{map.data.total === 1 ? '' : 's'}
        {map.data.with_problems > 0
          ? `, ${map.data.with_problems} with something in the chain that stops it billing.`
          : '. Every chain is complete.'}
      </div>

      <Card flush>
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th>Rule</th><th>Ticket type</th><th>Service code</th>
              <th className="num">Rate</th><th>Contract</th><th>Contractor</th>
              <th className="num">Priority</th><th className="num">Billed</th>
              <th>State</th>
            </tr></thead>
            <tbody>
              {map.data.items.map((r) => (
                <tr key={r.rule_id} style={{
                  opacity: saving === r.rule_id ? 0.55 : 1,
                  background: r.problems?.length ? 'var(--amber-soft)' : undefined,
                }}>
                  <td style={{ minWidth: 190 }}>
                    <div style={{ fontWeight: 540 }}>{r.rule_name}</div>
                    {r.line_number != null && (
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        contract line {r.line_number}
                        {r.item_code ? ` · ${r.item_code}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="dim">{r.ticket_type_label}</td>
                  <td style={{ minWidth: 170 }}>
                    <select className="select sm" value={r.service_code_id}
                            onChange={(e) => patch(r, { service_code_id: e.target.value })}>
                      {serviceCodes.map((c) => (
                        <option key={c.id} value={c.id}>{c.code}</option>
                      ))}
                    </select>
                    <div className="dim truncate" style={{ fontSize: 11.5, maxWidth: 180 }}>
                      {r.service_code_name}
                    </div>
                  </td>
                  <td className="num">
                    {r.rate_amount != null
                      ? <>{fmt.rate(r.rate_amount)}<span className="dim"> / {r.unit_abbrev}</span></>
                      : <span className="dim">none</span>}
                    {r.tier_count > 0 && (
                      <div className="dim" style={{ fontSize: 11.5 }}>
                        {r.tier_count} band{r.tier_count === 1 ? '' : 's'}
                      </div>
                    )}
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <select className="select sm" value={r.contract_id}
                            onChange={(e) => patch(r, { contract_id: e.target.value })}>
                      {contracts.map((c) => (
                        <option key={c.contract_id} value={c.contract_id}>
                          {c.contract_number}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="dim truncate" style={{ maxWidth: 160 }}>
                    {r.contractor_name}
                  </td>
                  <td className="num" style={{ width: 82 }}>
                    <input className="input num sm" type="number"
                           defaultValue={r.priority}
                           onBlur={(e) => Number(e.target.value) !== r.priority
                             && patch(r, { priority: Number(e.target.value) })} />
                  </td>
                  <td className="num">
                    {fmt.money(r.billed_total)}
                    <div className="dim" style={{ fontSize: 11.5 }}>
                      {fmt.int(r.transaction_count)} txn
                    </div>
                  </td>
                  <td style={{ minWidth: 150 }}>
                    {r.problems?.length ? (
                      r.problems.map((code) => (
                        <div key={code} style={{ fontSize: 11.5, lineHeight: 1.5,
                                                 color: 'var(--amber)' }}>
                          {PROBLEM_TEXT[code] || code}
                        </div>
                      ))
                    ) : (
                      <Badge tone="green">Billing</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {unruledCodes.length > 0 && (
        <Card title="Service codes no rule references"
              sub="Priced, on the project, and unable to reach an invoice">
          <div className="table-wrap">
            <table className="data">
              <thead><tr>
                <th>Code</th><th>Name</th><th>Contractor</th><th className="num">Rate</th>
              </tr></thead>
              <tbody>
                {unruledCodes.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.code}</td>
                    <td className="truncate" style={{ maxWidth: 280 }}>{c.name}</td>
                    <td className="dim">{c.contractor_name}</td>
                    <td className="num">
                      {c.rate_amount != null
                        ? <>{fmt.rate(c.rate_amount)}<span className="dim"> / {c.unit_abbrev}</span></>
                        : <span className="dim">none</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="spacer" />
            <button className="btn sm" onClick={onBuild}>
              <Icon name="layers" size={13} /> Propose rules for these
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}

function hydrate(rule) {
  return {
    id: rule.id, name: rule.name, description: rule.description || '',
    ticket_type_id: rule.ticket_type_id, service_code_id: rule.service_code_id,
    contract_id: rule.contract_id, match_mode: rule.match_mode,
    priority: rule.priority, transaction_sequence: rule.transaction_sequence ?? 1,
    stop_on_match: rule.stop_on_match, is_active: rule.is_active,
    statements: (rule.statements || []).map((s) => ({
      operand_code: s.operand_code, operator_code: s.operator_code,
      value: s.value, value_label: s.value_label, negate: s.negate,
    })),
  }
}

/**
 * One rule per row. Someone arriving here is either adding a rule or editing
 * one, so Edit is on the row rather than inside a detail view. The chevron opens
 * the statement expression, the dry run and the totals, unchanged, for the
 * people who came for those.
 */
function RuleRow({ rule, open, onToggle, onEdit, onTest, onRemove }) {
  return (
    <>
      <tr {...rowProps(onToggle)}>
        <td className="dim" style={{ textAlign: 'center' }}>
          <Icon name={open ? 'chevronDown' : 'chevron'} size={13} />
        </td>
        <td style={{ fontWeight: 550 }}>
          {rule.name}
          {rule.stop_on_match && <Badge tone="violet">Stops</Badge>}
        </td>
        <td className="muted">{rule.ticket_type_label}</td>
        <td className="mono">{rule.service_code}</td>
        <td className="num">
          {rule.rate_amount != null ? fmt.rate(rule.rate_amount) : '—'}
          <span className="dim"> / {rule.unit_abbrev || '—'}</span>
        </td>
        <td className="muted truncate" style={{ maxWidth: 150 }}>{rule.contract_number}</td>
        <td className="num">
          <Badge tone={rule.transaction_sequence > 1 ? '' : 'blue'}>
            {rule.transaction_sequence ?? 1}
          </Badge>
        </td>
        <td className="num dim">{rule.priority}</td>
        <td>{rule.is_active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</td>
        <td className="num">{fmt.int(rule.match_count)}</td>
        <td className="num">{fmt.money(rule.billed_total)}</td>
        <td style={{ width: 130, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={onEdit}>Edit</button>
            <button className="btn ghost icon sm" onClick={onRemove} title="Retire">
              <Icon name="trash" size={13} />
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={11} style={{ background: 'var(--surface-2)' }}>
            <RuleDetail rule={rule} onTest={onTest} />
          </td>
        </tr>
      )}
    </>
  )
}

function RuleDetail({ rule, onTest }) {
  return (
    <div className="row" style={{ alignItems: 'flex-start', gap: 12, padding: '4px 2px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {rule.description && (
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{rule.description}</div>
          )}
          <div className="rule-summary">
            {rule.statements.length === 0 ? (
              <div><span className="op">always</span> matches this ticket type</div>
            ) : rule.statements.map((s, i) => (
              <div key={s.id}>
                {i > 0 && (
                  <span className="op" style={{ marginRight: 6 }}>
                    {rule.match_mode === 'any' ? 'or' : 'and'}
                  </span>
                )}
                <b>{s.operand_label || s.operand_code}</b>{' '}
                <span className="op">{s.negate ? 'not ' : ''}{s.operator_symbol}</span>{' '}
                <b>{s.value_label || renderValue(s.value)}</b>
              </div>
            ))}
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--line-soft)' }}>
              <span className="op">then bill</span> <b>{rule.service_code}</b>
              {' '}<span className="op">at</span>{' '}
              <b>{fmt.rate(rule.rate_amount || 0)} / {rule.unit_abbrev || '—'}</b>
              {' '}<span className="op">under</span> <b>{rule.contract_number}</b>
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', flex: '0 0 160px' }}>
          <div style={{ fontSize: 17, fontWeight: 640 }}>{fmt.money(rule.billed_total)}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            {fmt.int(rule.match_count)} ticket{rule.match_count === 1 ? '' : 's'} matched
          </div>
          <button className="btn sm" style={{ marginTop: 10 }} onClick={onTest}>
            Dry run
          </button>
        </div>
    </div>
  )
}

function renderValue(value) {
  if (Array.isArray(value)) return `[${value.join(', ')}]`
  return String(value ?? '')
}

/* ======================================================================== */
function RuleTest({ rule, onClose }) {
  const { data, loading, error } = useFetch(
    () => api.post(`/rules/${rule.id}/test`, undefined, { limit: 40 }), [rule.id])

  return (
    <Modal wide title={`Dry run · ${rule.name}`} onClose={onClose} footer={
      <button className="btn" onClick={onClose}>Close</button>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
        This evaluates the rule against completed tickets and shows what it would bill.
        Nothing is written.
      </p>
      {loading && <Loading rows={5} />}
      {error && <ErrorNote error={error} />}
      {data && (
        <>
          <div className="grid c3" style={{ gap: 10, marginBottom: 14 }}>
            <div className="card stat"><div className="k">Sampled</div>
              <div className="v" style={{ fontSize: 21 }}>{fmt.int(data.sampled)}</div></div>
            <div className="card stat"><div className="k">Matched</div>
              <div className="v" style={{ fontSize: 21, color: 'var(--accent)' }}>
                {fmt.int(data.matched)}</div></div>
            <div className="card stat"><div className="k">Would bill</div>
              <div className="v" style={{ fontSize: 21, color: 'var(--green)' }}>
                {fmt.money(data.estimated_total)}</div></div>
          </div>
          {data.matches.length === 0 ? (
            <Empty icon="filter" title="No tickets matched">
              Loosen a condition, or check that the debris types and contractors named in
              the rule are the ones the field is actually recording.
            </Empty>
          ) : (
            <div className="table-wrap card" style={{ padding: 0 }}>
              <table className="data">
                <thead><tr>
                  <th>Ticket</th><th>Debris</th>
                  <th className="num">CY</th><th className="num">Tons</th>
                  <th className="num">Miles</th><th className="num">Quantity</th>
                  <th className="num">Amount</th>
                </tr></thead>
                <tbody>
                  {data.matches.map((m) => (
                    <tr key={m.id}>
                      <td className="mono">{m.ticket_number}</td>
                      <td className="muted">{m.debris_type}</td>
                      <td className="num">{fmt.number(m.billable_cubic_yards, 1)}</td>
                      <td className="num">{fmt.number(m.net_tons, 2)}</td>
                      <td className="num">{fmt.number(m.haul_miles, 2)}</td>
                      <td className="num">{fmt.number(m.quantity, 2)}</td>
                      <td className="num">{fmt.money(m.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Confirm, Empty, ErrorNote, Field, Icon, Loading, Modal, rowProps,
} from '../components/ui'

const BLANK = {
  name: '', description: '', ticket_type_id: '', service_code_id: '', contract_id: '',
  match_mode: 'all', priority: 100, stop_on_match: false, is_active: true, statements: [],
}

export default function Rules() {
  const { projectId, project, toast } = useApp()
  const [editing, setEditing] = useState(null)
  const [testing, setTesting] = useState(null)
  const [removing, setRemoving] = useState(null)
  // The statement expression and the billed total are useful to the people who
  // want them and noise to everyone else, so the list leads and the technical
  // view sits one click away.
  const [expanded, setExpanded] = useState(null)

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
        <button className="btn primary" onClick={() => setEditing(BLANK)}>
          <Icon name="plus" size={14} /> New rule
        </button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Icon name="rules" size={16} style={{ marginTop: 2, color: 'var(--accent)' }} />
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
              A rule reads: <b style={{ color: 'var(--text)' }}>when these conditions hold on a
              completed ticket of this type, bill this service code under this contract</b>.
              Every completed ticket is evaluated against all of them, so one ticket can
              produce several transactions. A rule cannot be saved without both a service
              code and a contract already linked to the project.
            </div>
          </div>
        </div>

        {rules.loading && <Loading rows={5} />}
        {rules.error && <ErrorNote error={rules.error} onRetry={rules.reload} />}

        {rules.data && (rules.data.items.length === 0 ? (
          <Empty icon="rules" title="No rules yet"
                 action={<button className="btn primary" onClick={() => setEditing(BLANK)}>
                   <Icon name="plus" size={14} /> Create the first rule</button>}>
            Until a rule exists, completed tickets are recorded but never billed.
          </Empty>
        ) : (
          <Card flush>
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 30 }} />
                  <th>Rule</th><th>Ticket type</th><th>Service code</th>
                  <th className="num">Rate</th><th>Contract</th>
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

      {editing && (
        <RuleEditor rule={editing} project={detail.data} serviceCodes={codes.data?.items || []}
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

function hydrate(rule) {
  return {
    id: rule.id, name: rule.name, description: rule.description || '',
    ticket_type_id: rule.ticket_type_id, service_code_id: rule.service_code_id,
    contract_id: rule.contract_id, match_mode: rule.match_mode,
    priority: rule.priority, stop_on_match: rule.stop_on_match,
    is_active: rule.is_active,
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
function RuleEditor({ rule, project, serviceCodes, onClose, onSaved }) {
  const { projectId, toast } = useApp()
  const [form, setForm] = useState(rule)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const operands = useFetch(
    () => api.get(`/projects/${projectId}/rule-operands`,
                  form.ticket_type_id ? { ticket_type_id: form.ticket_type_id } : {}),
    [projectId, form.ticket_type_id])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const selectedCode = serviceCodes.find((c) => c.id === form.service_code_id)

  function addStatement() {
    const first = operands.data?.items?.[0]
    set({ statements: [...form.statements, {
      operand_code: first?.code || 'debris_type',
      operator_code: first?.operators?.[0]?.code || 'eq',
      value: '', value_label: '', negate: false,
    }] })
  }

  function updateStatement(index, patch) {
    const next = form.statements.map((s, i) => (i === index ? { ...s, ...patch } : s))
    set({ statements: next })
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const payload = {
        ...form,
        priority: Number(form.priority) || 100,
        statements: form.statements.map((s) => ({
          operand_code: s.operand_code,
          operator_code: s.operator_code,
          value: normalise(s),
          value_label: s.value_label || null,
          negate: Boolean(s.negate),
        })),
      }
      delete payload.id
      if (rule.id) await api.put(`/rules/${rule.id}`, payload)
      else await api.post(`/projects/${projectId}/rules`, payload)
      toast(rule.id ? 'Rule updated' : 'Rule created', form.name)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }

  const valid = form.name.length > 1 && form.ticket_type_id && form.service_code_id
                && form.contract_id

  return (
    <Modal wide title={rule.id ? 'Edit rule' : 'New rule'} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!valid || busy} onClick={save}>
          {busy && <span className="spinner" />} {rule.id ? 'Save rule' : 'Create rule'}
        </button>
      </>
    }>
      <div className="stack" style={{ gap: 16 }}>
        {error && (
          <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                                         background: 'var(--red-soft)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Rule name" required>
            <input className="input" value={form.name} autoFocus
                   onChange={(e) => set({ name: e.target.value })}
                   placeholder="ROW Vegetative Load" />
          </Field>
          <Field label="Applies to ticket type" required>
            <select className="select" value={form.ticket_type_id}
                    onChange={(e) => set({ ticket_type_id: e.target.value, statements: [] })}>
              <option value="">Choose a ticket type</option>
              {(project?.ticket_types || []).map((t) => (
                <option key={t.ticket_type_id} value={t.ticket_type_id}>{t.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <input className="input" value={form.description}
                 onChange={(e) => set({ description: e.target.value })}
                 placeholder="What this rule is for, in the words the reviewer will read later" />
        </Field>

        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 560, color: 'var(--text-muted)' }}>
              Conditions
            </label>
            <div className="seg" style={{ marginLeft: 8 }}>
              {['all', 'any'].map((mode) => (
                <button key={mode} className={form.match_mode === mode ? 'on' : ''}
                        onClick={() => set({ match_mode: mode })}>
                  match {mode}
                </button>
              ))}
            </div>
            <div className="spacer" />
            <button className="btn sm" onClick={addStatement}
                    disabled={!form.ticket_type_id}>
              <Icon name="plus" size={13} /> Add condition
            </button>
          </div>

          {form.statements.length === 0 ? (
            <div className="card" style={{ padding: 16, background: 'var(--surface-2)' }}>
              <div className="muted" style={{ fontSize: 13 }}>
                No conditions. This rule will match every completed ticket of the chosen
                type, which is the right shape for a flat per-ticket fee and the wrong
                shape for anything else.
              </div>
            </div>
          ) : form.statements.map((s, i) => (
            <div key={i}>
              {i > 0 && <div className="statement-join">{form.match_mode === 'any' ? 'or' : 'and'}</div>}
              <StatementRow
                statement={s}
                operands={operands.data?.items || []}
                projectId={projectId}
                onChange={(patch) => updateStatement(i, patch)}
                onRemove={() => set({ statements: form.statements.filter((_, j) => j !== i) })}
              />
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 14, background: 'var(--surface-2)' }}>
          <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                          letterSpacing: '0.06em', marginBottom: 10 }}>
            Then bill
          </div>
          <div className="grid c2" style={{ gap: 12 }}>
            <Field label="Service code" required
                   hint={selectedCode
                     ? `${fmt.rate(selectedCode.current_rate || 0)} per ${selectedCode.current_unit_abbrev || '—'} · ${selectedCode.contractor_name}`
                     : 'Project-scoped; the contractor comes from the code'}>
              <select className="select" value={form.service_code_id}
                      onChange={(e) => set({ service_code_id: e.target.value })}>
                <option value="">Choose a service code</option>
                {serviceCodes.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Under contract" required
                   hint="Must already be linked to this project">
              <select className="select" value={form.contract_id}
                      onChange={(e) => set({ contract_id: e.target.value })}>
                <option value="">Choose a contract</option>
                {(project?.contracts || []).map((c) => (
                  <option key={c.contract_id} value={c.contract_id}>
                    {c.contract_number} — {c.contractor_name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="grid c3" style={{ gap: 12, alignItems: 'end' }}>
          <Field label="Priority" hint="Lower runs first">
            <input className="input" type="number" value={form.priority}
                   onChange={(e) => set({ priority: e.target.value })} />
          </Field>
          <label className="check" style={{ paddingBottom: 9 }}>
            <input type="checkbox" checked={form.stop_on_match}
                   onChange={(e) => set({ stop_on_match: e.target.checked })} />
            Stop after this rule matches
          </label>
          <label className="check" style={{ paddingBottom: 9 }}>
            <input type="checkbox" checked={form.is_active}
                   onChange={(e) => set({ is_active: e.target.checked })} />
            Active
          </label>
        </div>
      </div>
    </Modal>
  )
}

function normalise(statement) {
  const operator = statement.operator_code
  if (operator === 'is_null' || operator === 'is_not_null') return null
  if (operator === 'in' || operator === 'not_in') {
    if (Array.isArray(statement.value)) return statement.value
    return String(statement.value || '').split(',').map((v) => v.trim()).filter(Boolean)
  }
  if (operator === 'between') {
    if (Array.isArray(statement.value)) return statement.value.map(Number)
    return String(statement.value || '').split(',').map((v) => Number(v.trim()))
  }
  const numeric = ['gt', 'gte', 'lt', 'lte'].includes(operator)
  return numeric ? Number(statement.value) : statement.value
}

function StatementRow({ statement, operands, projectId, onChange, onRemove }) {
  const operand = operands.find((o) => o.code === statement.operand_code)
  const operators = operand?.operators || []
  const [options, setOptions] = useState(null)

  useEffect(() => {
    let cancelled = false
    setOptions(null)
    if (operand?.options_source) {
      api.get(`/projects/${projectId}/options/${operand.options_source}`)
        .then((r) => { if (!cancelled) setOptions(r.items) })
        .catch(() => { if (!cancelled) setOptions([]) })
    }
    return () => { cancelled = true }
  }, [operand?.options_source, projectId])

  const multi = ['in', 'not_in'].includes(statement.operator_code)
  const none = ['is_null', 'is_not_null'].includes(statement.operator_code)
  const selected = multi
    ? (Array.isArray(statement.value) ? statement.value
       : String(statement.value || '').split(',').filter(Boolean))
    : statement.value

  function pick(value, label) {
    onChange({ value, value_label: label })
  }

  return (
    <div className="statement">
      <select className="select" value={statement.operand_code}
              onChange={(e) => {
                const next = operands.find((o) => o.code === e.target.value)
                onChange({
                  operand_code: e.target.value,
                  operator_code: next?.operators?.[0]?.code || 'eq',
                  value: '', value_label: '',
                })
              }}>
        {operands.map((o) => (
          <option key={o.code} value={o.code}>{o.label}</option>
        ))}
      </select>

      <select className="select" value={statement.operator_code}
              onChange={(e) => onChange({ operator_code: e.target.value, value: '', value_label: '' })}>
        {operators.map((op) => (
          <option key={op.code} value={op.code}>{op.label}</option>
        ))}
      </select>

      {none ? (
        <div className="dim" style={{ fontSize: 12.5, paddingLeft: 4 }}>no value needed</div>
      ) : options ? (
        multi ? (
          <div className="row wrap" style={{ gap: 6 }}>
            {options.map((o) => {
              const on = selected.includes(o.value)
              return (
                <button key={o.value}
                        className={`btn sm${on ? ' primary' : ''}`}
                        onClick={() => {
                          const next = on ? selected.filter((v) => v !== o.value)
                                          : [...selected, o.value]
                          const labels = options.filter((x) => next.includes(x.value))
                            .map((x) => x.label).join(', ')
                          pick(next, labels)
                        }}>
                  {o.label}
                </button>
              )
            })}
          </div>
        ) : (
          <select className="select" value={statement.value || ''}
                  onChange={(e) => {
                    const opt = options.find((o) => o.value === e.target.value)
                    pick(e.target.value, opt?.label)
                  }}>
            <option value="">Choose…</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}{o.hint ? ` — ${o.hint}` : ''}
              </option>
            ))}
          </select>
        )
      ) : (
        <input className="input"
               type={operand?.data_type === 'number' ? 'number'
                     : operand?.data_type === 'date' ? 'date' : 'text'}
               value={Array.isArray(statement.value) ? statement.value.join(', ')
                                                     : (statement.value ?? '')}
               placeholder={statement.operator_code === 'between' ? 'min, max'
                            : multi ? 'comma separated'
                            : operand?.unit_hint ? `value in ${operand.unit_hint}` : 'value'}
               onChange={(e) => pick(e.target.value, e.target.value)} />
      )}

      <button className="btn ghost icon sm" onClick={onRemove} title="Remove condition">
        <Icon name="x" size={13} />
      </button>
    </div>
  )
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

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { api, fmt } from '../lib/api'
import { useApp, useFetch, useListState } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, Search, useDebounced,
} from '../components/ui'

/* ============================== SERVICE CODES ============================ */
export function ServiceCodes() {
  const { projectId, project, lookups, toast } = useApp()
  const [editing, setEditing] = useState(null)
  const [rating, setRating] = useState(null)
  // Same treatment as the rules list: the list leads, the rate history is one
  // click further in for whoever wants it.
  const [expanded, setExpanded] = useState(null)

  const codes = useFetch(() => api.get(`/projects/${projectId}/service-codes`),
                         [projectId], { skip: !projectId })
  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })

  if (!projectId) {
    return (<><PageHeader title="Service Codes" /><div className="page">
      <Empty icon="folder" title="No project in context" /></div></>)
  }

  return (
    <>
      <PageHeader title="Service Codes" crumb={project?.project_code}>
        <button className="btn primary" onClick={() => setEditing({})}>
          <Icon name="plus" size={14} /> New service code
        </button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
            A service code is a billable line of work tied to one contractor on this
            project. Its rate carries a unit type, and that unit type decides which
            measurement the engine pulls off the ticket: cubic yards from capacity times
            load call, tons from the scale, miles from the route.
          </div>
        </div>

        {codes.loading && <Loading rows={4} />}
        {codes.error && <ErrorNote error={codes.error} onRetry={codes.reload} />}

        {codes.data && (codes.data.items.length === 0 ? (
          <Empty icon="money" title="No service codes yet"
                 action={<button className="btn primary" onClick={() => setEditing({})}>
                   <Icon name="plus" size={14} /> Create one</button>}>
            Rules cannot be written until at least one service code exists.
          </Empty>
        ) : (
          <Card flush>
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th style={{ width: 30 }} />
                  <th>Code</th><th>Name</th><th>Contractor</th>
                  <th className="num">Current rate</th><th>Unit</th>
                  <th>From contract</th><th className="num">Rules</th>
                  <th className="num">Billed</th><th />
                </tr></thead>
                <tbody>
                  {codes.data.items.map((c) => (
                    <ServiceCodeRow key={c.id} code={c}
                                    open={expanded === c.id}
                                    onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                                    onEdit={() => setEditing(c)}
                                    onRate={() => setRating(c)} />
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {editing && (
        <ServiceCodeModal project={detail.data} lookups={lookups} record={editing}
                          onClose={() => setEditing(null)}
                          onSaved={() => { setEditing(null); codes.reload() }} />
      )}
      {rating && (
        <RateModal code={rating} lookups={lookups} onClose={() => setRating(null)}
                   onSaved={() => { setRating(null); codes.reload() }} />
      )}
    </>
  )
}

/**
 * One code per row, with Edit on the row because that is what someone arriving
 * here came to do. The chevron opens the rate history, which is the part that
 * has to stay readable: a rate is superseded, never rewritten.
 */
function ServiceCodeRow({ code, open, onToggle, onEdit, onRate }) {
  const c = code
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td className="dim" style={{ textAlign: 'center' }}>
          <Icon name={open ? 'chevronDown' : 'chevron'} size={13} />
        </td>
        <td className="mono" style={{ fontWeight: 600 }}>{c.code}</td>
        <td className="truncate" style={{ maxWidth: 240 }}>
          {c.name}
          {c.fema_category && <Badge>FEMA {c.fema_category}</Badge>}
          {!c.is_active && <Badge>Inactive</Badge>}
        </td>
        <td className="muted truncate" style={{ maxWidth: 160 }}>{c.contractor_name}</td>
        <td className="num" style={{ fontWeight: 550 }}>
          {c.current_rate != null ? fmt.rate(c.current_rate) : '—'}
        </td>
        <td className="dim">{c.current_unit_abbrev || 'not set'}</td>
        <td>
          {c.contract_line_item_id
            ? <Badge tone="green">Line item</Badge>
            : c.contract_id ? <Badge tone="blue">Contract</Badge>
            : <span className="dim">entered by hand</span>}
        </td>
        <td className="num">{fmt.int(c.rule_count)}</td>
        <td className="num">{fmt.money(c.billed_total)}</td>
        <td style={{ width: 140, textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
          <div className="row" style={{ gap: 5, justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={onEdit}>Edit</button>
            <button className="btn sm" onClick={onRate}>New rate</button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={10} style={{ background: 'var(--surface-2)' }}>
            <div className="stack" style={{ gap: 9, padding: '4px 2px' }}>
              {c.description && (
                <div className="muted" style={{ fontSize: 12.5 }}>{c.description}</div>
              )}
              <div style={{ fontSize: 11.5, fontWeight: 650, letterSpacing: '.06em',
                            textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                Rate history
              </div>
              {c.rates.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>
                  No rate yet, so nothing this code matches can be billed.
                </div>
              ) : (
                <div className="row wrap" style={{ gap: 6 }}>
                  {c.rates.map((r) => {
                    const current = r.id === c.current_rate_id
                    return (
                      <span key={r.id} className={`badge ${current ? 'green' : ''}`}>
                        {fmt.rate(r.amount)} / {r.abbreviation}
                        <span className="dim" style={{ marginLeft: 4 }}>
                          {fmt.date(r.effective_from)}
                          {r.effective_to ? ` – ${fmt.date(r.effective_to)}` : ' →'}
                        </span>
                      </span>
                    )
                  })}
                </div>
              )}
              <div className="dim" style={{ fontSize: 11.5 }}>
                A new rate supersedes the current one from its effective date. Nothing
                already billed is rewritten.
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function ServiceCodeModal({ project, lookups, record = {}, onClose, onSaved }) {
  const { projectId, toast } = useApp()
  const isNew = !record.id
  const [form, setForm] = useState({
    code: record.code || '', name: record.name || '',
    contractor_id: record.contractor_id || '',
    description: record.description || '',
    fema_category: record.fema_category || '',
    is_active: record.is_active ?? true,
    rate_amount: '', rate_unit_type: 'per_cubic_yard',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      if (isNew) {
        await api.post(`/projects/${projectId}/service-codes`, {
          ...form,
          rate_amount: form.rate_amount === '' ? null : Number(form.rate_amount),
        })
        toast('Service code created', `${form.code} — ${form.name}`)
      } else {
        await api.patch(`/service-codes/${record.id}`, {
          code: form.code, name: form.name, contractor_id: form.contractor_id,
          description: form.description, fema_category: form.fema_category,
          is_active: form.is_active,
        })
        toast('Service code saved', `${form.code} — ${form.name}`)
      }
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title={isNew ? 'New service code' : `Edit ${record.code}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.code || !form.name || !form.contractor_id}
                onClick={save}>{busy && <span className="spinner" />} {isNew ? 'Create' : 'Save'}</button>
      </>
    }>
      <div className="stack">
        {error && <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                        background: 'var(--red-soft)', color: 'var(--red)' }}>{error}</div>}
        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Code" required hint="Short, stable, printed on invoices">
            <input className="input" value={form.code} autoFocus
                   onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                   placeholder="ROW-VEG" />
          </Field>
          <Field label="FEMA category">
            <input className="input" value={form.fema_category}
                   onChange={(e) => set({ fema_category: e.target.value })} placeholder="A" />
          </Field>
        </div>
        <Field label="Name" required>
          <input className="input" value={form.name}
                 onChange={(e) => set({ name: e.target.value })}
                 placeholder="ROW Vegetative Collection" />
        </Field>
        <Field label="Contractor" required
               hint="Only contractors already linked to this project">
          <select className="select" value={form.contractor_id}
                  onChange={(e) => set({ contractor_id: e.target.value })}>
            <option value="">Choose a contractor</option>
            {(project?.contractors || []).map((c) => (
              <option key={c.contractor_id} value={c.contractor_id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Description">
          <textarea className="textarea" value={form.description}
                    onChange={(e) => set({ description: e.target.value })} />
        </Field>
        {isNew ? (
          <div className="grid c2" style={{ gap: 12 }}>
            <Field label="Opening rate">
              <input className="input" type="number" step="0.0001" value={form.rate_amount}
                     onChange={(e) => set({ rate_amount: e.target.value })} placeholder="9.4500" />
            </Field>
            <Field label="Unit type"
                   hint={(lookups?.unit_types || []).find((u) => u.code === form.rate_unit_type)?.description}>
              <select className="select" value={form.rate_unit_type}
                      onChange={(e) => set({ rate_unit_type: e.target.value })}>
                {(lookups?.unit_types || []).map((u) => (
                  <option key={u.code} value={u.code}>{u.label}</option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <>
            <label className="check">
              <input type="checkbox" checked={form.is_active}
                     onChange={(e) => set({ is_active: e.target.checked })} />
              Active
            </label>
            <div className="hint">
              Rates carry their own history. Use New rate to supersede the current one
              rather than editing it here.
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function RateModal({ code, lookups, onClose, onSaved }) {
  const { toast } = useApp()
  const [form, setForm] = useState({
    amount: code.current_rate || '', unit_type: code.current_unit_type || 'per_cubic_yard',
    effective_from: new Date().toISOString().slice(0, 10), notes: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true)
    try {
      await api.post(`/service-codes/${code.id}/rates`, {
        ...form, amount: Number(form.amount),
      })
      toast('Rate added', `${code.code} now bills at ${fmt.rate(form.amount)}`)
      onSaved()
    } catch (err) { toast('Could not add rate', err.message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title={`New rate · ${code.code}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.amount} onClick={save}>
          {busy && <span className="spinner" />} Add rate
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.65 }}>
        Rates are effective-dated. Adding one closes the current rate the day before this
        one starts; transactions already computed keep pointing at the rate they were
        billed under.
      </p>
      <div className="stack">
        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Amount" required>
            <input className="input" type="number" step="0.0001" autoFocus
                   value={form.amount} onChange={(e) => set({ amount: e.target.value })} />
          </Field>
          <Field label="Unit type">
            <select className="select" value={form.unit_type}
                    onChange={(e) => set({ unit_type: e.target.value })}>
              {(lookups?.unit_types || []).map((u) => (
                <option key={u.code} value={u.code}>{u.label}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Effective from" required>
          <input className="input" type="date" value={form.effective_from}
                 onChange={(e) => set({ effective_from: e.target.value })} />
        </Field>
        <Field label="Notes">
          <input className="input" value={form.notes}
                 onChange={(e) => set({ notes: e.target.value })}
                 placeholder="Contract modification 3" />
        </Field>
      </div>
    </Modal>
  )
}

/* ============================== TRANSACTIONS ============================= */
const TXN_DEFAULTS = {
  invoice_status: '', contractor_id: '', service_code_id: '',
  date_from: '', date_to: '', offset: 0,
}

export function Transactions() {
  const { projectId, project, can, toast } = useApp()
  const { state: f, set: setF, clear, touched } = useListState(TXN_DEFAULTS)
  const [reversing, setReversing] = useState(null)

  // E7: "No option to select the contractor so we are just seeing everything."
  // What is owed to one hauler is the question this screen exists to answer.
  const contractors = useFetch(
    () => (projectId ? api.get(`/projects/${projectId}/options/project_contractors`) : null),
    [projectId])
  const codes = useFetch(
    () => (projectId ? api.get(`/projects/${projectId}/options/project_service_codes`) : null),
    [projectId])

  const { data, loading, error, reload } = useFetch(
    () => api.get(`/projects/${projectId}/transactions`, {
      limit: 100,
      offset: f.offset,
      invoice_status: f.invoice_status || undefined,
      contractor_id: f.contractor_id || undefined,
      service_code_id: f.service_code_id || undefined,
      date_from: f.date_from || undefined,
      date_to: f.date_to || undefined,
    }),
    [projectId, f.offset, f.invoice_status, f.contractor_id, f.service_code_id,
     f.date_from, f.date_to], { skip: !projectId })

  if (!projectId) {
    return (<><PageHeader title="Transactions" /><div className="page">
      <Empty icon="folder" title="No project in context" /></div></>)
  }

  return (
    <>
      <PageHeader title="Transactions" crumb={project?.project_code}>
        <button className="btn icon" onClick={reload}><Icon name="refresh" size={15} /></button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
            Transactions are system generated and permanently locked. Nothing here can be
            edited: a correction is a reversal row plus a fresh computation, and both stay
            in the ledger.
          </div>
        </div>

        <Card flush>
          <div className="card-head" style={{ gap: 9, flexWrap: 'wrap' }}>
            <select className="select" style={{ width: 170 }} value={f.invoice_status}
                    aria-label="Invoice state"
                    onChange={(e) => setF({ invoice_status: e.target.value })}>
              <option value="">All transactions</option>
              <option value="uninvoiced">Not yet invoiced</option>
              <option value="invoiced">On an invoice</option>
            </select>
            <select className="select" style={{ width: 190 }} value={f.contractor_id}
                    aria-label="Contractor"
                    onChange={(e) => setF({ contractor_id: e.target.value })}>
              <option value="">Any contractor</option>
              {(contractors.data?.items || []).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select className="select" style={{ width: 180 }} value={f.service_code_id}
                    aria-label="Service code"
                    onChange={(e) => setF({ service_code_id: e.target.value })}>
              <option value="">Any service code</option>
              {(codes.data?.items || []).map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <input className="input" type="date" style={{ width: 150 }} value={f.date_from}
                   aria-label="Computed from"
                   onChange={(e) => setF({ date_from: e.target.value })} />
            <input className="input" type="date" style={{ width: 150 }} value={f.date_to}
                   aria-label="Computed to"
                   onChange={(e) => setF({ date_to: e.target.value })} />
            {touched > 0 && (
              <button className="btn ghost sm" onClick={clear}>
                <Icon name="x" size={13} /> Clear {touched}
              </button>
            )}
            <div className="spacer" />
            {data?.summary && (
              <div className="row" style={{ gap: 16 }}>
                <div style={{ textAlign: 'right' }}>
                  <div className="dim" style={{ fontSize: 11 }}>TOTAL</div>
                  <div style={{ fontWeight: 640, fontSize: 15 }}>
                    {fmt.money(data.summary.total_amount)}
                  </div>
                </div>
              </div>
            )}
          </div>

          {loading && <Loading rows={8} />}
          {error && <div style={{ padding: 16 }}><ErrorNote error={error} onRetry={reload} /></div>}

          {data && !loading && (data.items.length === 0 ? (
            <Empty icon="money" title="No transactions">
              Completed tickets produce transactions once they match a rule.
            </Empty>
          ) : (
            <>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr>
                    <th>Transaction</th><th>Ticket</th><th>Service code</th><th>Rule</th>
                    <th className="num">Quantity</th><th className="num">Rate</th>
                    <th className="num">Amount</th><th>Invoice</th><th>Computed</th><th />
                  </tr></thead>
                  <tbody>
                    {data.items.map((t) => (
                      <tr key={t.id}>
                        <td className="mono">
                          {t.transaction_number}
                          {t.is_reversal && <Badge tone="red">Reversal</Badge>}
                        </td>
                        <td className="mono dim">{t.ticket_number}</td>
                        <td>
                          <div style={{ fontWeight: 550 }}>{t.service_code}</div>
                          <div className="dim" style={{ fontSize: 11.5 }}>{t.contractor_name}</div>
                        </td>
                        <td className="muted truncate" style={{ maxWidth: 170 }}>{t.rule_name}</td>
                        <td className="num">
                          {fmt.number(t.quantity, 2)} <span className="dim">{t.unit_abbrev}</span>
                        </td>
                        <td className="num">{fmt.rate(t.rate_amount)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmt.money(t.amount)}</td>
                        <td>{t.invoice_number
                          ? <Badge status={t.invoice_status}>{t.invoice_number}</Badge>
                          : <span className="dim">—</span>}</td>
                        <td className="muted">{fmt.date(t.computed_at)}</td>
                        <td style={{ width: 40 }}>
                          {can('transaction.reverse') && !t.is_reversal && !t.invoice_number && (
                            <button className="btn ghost sm" onClick={() => setReversing(t)}>
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pager">
                <span>{fmt.int(f.offset + 1)} to {fmt.int(f.offset + data.items.length)} of {fmt.int(data.total)}</span>
                <div className="spacer" />
                <button className="btn sm" disabled={f.offset === 0}
                        onClick={() => setF({ offset: Math.max(0, f.offset - 100) },
                                            { keepOffset: true })}>Previous</button>
                <button className="btn sm" disabled={!data.has_more}
                        onClick={() => setF({ offset: f.offset + 100 },
                                            { keepOffset: true })}>Next</button>
              </div>
            </>
          ))}
        </Card>
      </div>

      {reversing && (
        <ReverseModal transaction={reversing} onClose={() => setReversing(null)}
                      onDone={() => { setReversing(null); reload() }} />
      )}
    </>
  )
}

function ReverseModal({ transaction, onClose, onDone }) {
  const { toast } = useApp()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  async function reverse() {
    setBusy(true)
    try {
      await api.post(`/transactions/${transaction.id}/reverse`, { reason })
      toast('Transaction reversed', 'A negating row was written; the original is untouched')
      onDone()
    } catch (err) { toast('Could not reverse', err.message, 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title="Reverse transaction" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn danger" disabled={reason.length < 3 || busy} onClick={reverse}>
          {busy && <span className="spinner" />} Reverse {fmt.money(transaction.amount)}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, lineHeight: 1.65 }}>
        This writes a negating transaction of {fmt.money(-transaction.amount)}. The
        original stays exactly as computed, and both rows carry your reason.
      </p>
      <Field label="Reason" required>
        <textarea className="textarea" value={reason} autoFocus
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Load call corrected after site review" />
      </Field>
    </Modal>
  )
}

/* ================================ INVOICES =============================== */
export function Invoices() {
  const { projectId, project } = useApp()
  const [creating, setCreating] = useState(false)
  const [open, setOpen] = useState(null)

  const invoices = useFetch(() => api.get(`/projects/${projectId}/invoices`),
                            [projectId], { skip: !projectId })
  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })

  if (!projectId) {
    return (<><PageHeader title="Invoices" /><div className="page">
      <Empty icon="folder" title="No project in context" /></div></>)
  }

  return (
    <>
      <PageHeader title="Invoices" crumb={project?.project_code}>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={14} /> New invoice
        </button>
      </PageHeader>

      <div className="page">
        {invoices.loading && <Loading rows={4} />}
        {invoices.error && <ErrorNote error={invoices.error} onRetry={invoices.reload} />}

        {invoices.data && (invoices.data.items.length === 0 ? (
          <Empty icon="invoice" title="No invoices yet"
                 action={<button className="btn primary" onClick={() => setEditing({})}>
                   <Icon name="plus" size={14} /> Create one</button>}>
            An invoice gathers every uninvoiced transaction for a contractor in a period.
          </Empty>
        ) : (
          <Card flush>
            <div className="table-wrap">
              <table className="data">
                <thead><tr>
                  <th>Invoice</th><th>Contractor</th><th>Contract</th><th>Period</th>
                  <th className="num">Lines</th><th className="num">Subtotal</th>
                  <th className="num">Total</th><th>Status</th><th>Created</th>
                </tr></thead>
                <tbody>
                  {invoices.data.items.map((i) => (
                    <tr key={i.id} className="clickable" onClick={() => setOpen(i.id)}>
                      <td className="mono">{i.invoice_number}</td>
                      <td>{i.contractor_name}</td>
                      <td className="mono dim">{i.contract_number}</td>
                      <td className="muted">
                        {fmt.date(i.period_start)} – {fmt.date(i.period_end)}
                      </td>
                      <td className="num">{fmt.int(i.line_count)}</td>
                      <td className="num">{fmt.money(i.subtotal)}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmt.money(i.total)}</td>
                      <td><Badge status={i.status} /></td>
                      <td className="muted">{fmt.date(i.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      {creating && (
        <NewInvoice project={detail.data} onClose={() => setCreating(false)}
                    onSaved={(id) => { setCreating(false); invoices.reload(); setOpen(id) }} />
      )}
      {open && (
        <InvoiceDetail invoiceId={open} onClose={() => setOpen(null)}
                       onChanged={invoices.reload} />
      )}
    </>
  )
}

function NewInvoice({ project, onClose, onSaved }) {
  const { projectId, toast } = useApp()
  const [form, setForm] = useState({
    contractor_id: '', contract_id: '', period_start: '', period_end: '', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true)
    try {
      const result = await api.post(`/projects/${projectId}/invoices`, {
        ...form,
        period_start: form.period_start || null,
        period_end: form.period_end || null,
      })
      toast('Invoice created', `${result.invoice_number} with ${result.line_count} line(s)`)
      onSaved(result.id)
    } catch (err) { toast('Could not create invoice', err.message, 'err') }
    finally { setBusy(false) }
  }

  const contracts = (project?.contracts || []).filter(
    (c) => !form.contractor_id
      || (project.contractors.find((x) => x.contractor_id === form.contractor_id)?.name
          === c.contractor_name))

  return (
    <Modal title="New invoice" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.contractor_id || !form.contract_id}
                onClick={save}>{busy && <span className="spinner" />} Create invoice</button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.65 }}>
        Every transaction for this contractor and contract that is not already on an
        invoice, and falls inside the period, is pulled in as a line.
      </p>
      <div className="stack">
        <Field label="Contractor" required>
          <select className="select" value={form.contractor_id}
                  onChange={(e) => set({ contractor_id: e.target.value, contract_id: '' })}>
            <option value="">Choose…</option>
            {(project?.contractors || []).map((c) => (
              <option key={c.contractor_id} value={c.contractor_id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Contract" required>
          <select className="select" value={form.contract_id}
                  onChange={(e) => set({ contract_id: e.target.value })}>
            <option value="">Choose…</option>
            {contracts.map((c) => (
              <option key={c.contract_id} value={c.contract_id}>
                {c.contract_number} — {c.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid c2" style={{ gap: 12 }}>
          <Field label="Period start">
            <input className="input" type="date" value={form.period_start}
                   onChange={(e) => set({ period_start: e.target.value })} />
          </Field>
          <Field label="Period end">
            <input className="input" type="date" value={form.period_end}
                   onChange={(e) => set({ period_end: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <input className="input" value={form.notes}
                 onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}

/**
 * One invoice.
 *
 * This is the only screen in the product whose output leaves the building, so
 * it gets judged by somebody who has never seen the app. The walkthrough judged
 * it that way and found three things: no way to take a line off, no way to
 * record an adjustment, a rejection that required no reason and no way back
 * from it, and a printed page that showed nine rows inside a border.
 */
function InvoiceDetail({ invoiceId, onClose, onChanged }) {
  const { can, toast } = useApp()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/invoices/${invoiceId}`), [invoiceId])

  async function patch(body, done) {
    setBusy(true)
    try {
      await api.patch(`/invoices/${invoiceId}`, body)
      toast('Invoice updated', done)
      reload(); onChanged?.()
      return true
    } catch (err) {
      toast('Could not update', err.message, 'err')
      return false
    } finally { setBusy(false) }
  }

  async function removeLine(line) {
    setBusy(true)
    try {
      await api.del(`/invoices/${invoiceId}/lines/${line.id}`)
      toast('Line removed',
            `${line.ticket_number} goes back to uninvoiced and the next invoice picks it up`)
      reload(); onChanged?.()
    } catch (err) {
      toast('Could not remove', err.message, 'err')
    } finally { setBusy(false) }
  }

  const i = data?.invoice
  const draft = i?.status === 'draft'
  const integrity = data?.integrity

  return (
    <Modal wide title={loading ? 'Loading invoice' : i?.invoice_number} onClose={onClose}
           footer={
             <>
               <button className="btn" onClick={() => window.print()}>
                 <Icon name="print" size={14} /> Print
               </button>
               {draft && can('invoice.manage') && (
                 <button className="btn" onClick={() => setAdjusting(true)}>
                   Adjustment
                 </button>
               )}
               <div className="spacer" />
               {draft && (
                 <button className="btn" disabled={busy}
                         onClick={() => patch({ status: 'submitted' }, 'Submitted for approval')}>
                   Submit
                 </button>
               )}
               {i?.status === 'rejected' && can('invoice.manage') && (
                 <button className="btn primary" disabled={busy}
                         onClick={() => patch({ status: 'draft' }, 'Reopened as a draft')}>
                   Reopen
                 </button>
               )}
               {i?.status === 'submitted' && can('invoice.approve') && (
                 <>
                   <button className="btn danger" onClick={() => setRejecting(true)}>
                     Reject
                   </button>
                   <button className="btn primary" disabled={busy}
                           onClick={() => patch({ status: 'approved' }, 'Approved')}>
                     Approve
                   </button>
                 </>
               )}
               {i?.status === 'approved' && can('invoice.approve') && (
                 <button className="btn primary" disabled={busy}
                         onClick={() => patch({ status: 'paid' }, 'Marked paid')}>
                   Mark paid
                 </button>
               )}
             </>
           }>
      {loading && <Loading rows={6} />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 16 }}>
          {i.status === 'rejected' && (
            <div className="card" style={{ padding: 12, borderColor: 'var(--red)',
                                           background: 'var(--red-soft)' }}>
              <div className="row" style={{ color: 'var(--red)', gap: 8 }}>
                <Icon name="alert" size={14} /><b>Rejected</b>
              </div>
              <div style={{ marginTop: 4, fontSize: 13 }}>{i.rejection_reason}</div>
              <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                {fmt.datetime(i.rejected_at)} · Reopen to correct and resubmit.
              </div>
            </div>
          )}

          {integrity?.needs_review && (
            <div className="card" style={{ padding: 12, borderColor: 'var(--amber)',
                                           background: 'var(--amber-soft)' }}>
              <div className="row" style={{ color: 'var(--amber)', gap: 8 }}>
                <Icon name="alert" size={14} /><b>Needs review</b>
              </div>
              <div style={{ marginTop: 4, fontSize: 13 }}>
                {fmt.int(integrity.superseded_lines)} line
                {integrity.superseded_lines === 1 ? '' : 's'} worth{' '}
                {fmt.money(integrity.superseded_amount)} {integrity.superseded_lines === 1
                  ? 'has' : 'have'} been reversed and recomputed since this invoice
                was built, so the total below no longer matches the ledger.
              </div>
            </div>
          )}

          <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <dl className="kv">
                <dt>Project</dt><dd>{i.project_name}</dd>
                <dt>Client</dt><dd>{i.client_name}</dd>
                <dt>Contractor</dt><dd>{i.contractor_name}</dd>
                <dt>Contract</dt><dd className="mono">{i.contract_number}</dd>
                <dt>Period</dt><dd>{fmt.date(i.period_start)} to {fmt.date(i.period_end)}</dd>
                {i.approved_at && (
                  <><dt>Approved</dt><dd>{fmt.datetime(i.approved_at)}</dd></>
                )}
                {i.paid_at && (<><dt>Paid</dt><dd>{fmt.datetime(i.paid_at)}</dd></>)}
              </dl>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge status={i.status} />
              <div style={{ fontSize: 27, fontWeight: 660, marginTop: 8 }}>
                {fmt.money(i.total)}
              </div>
              <div className="dim" style={{ fontSize: 12 }}>
                {fmt.money(i.subtotal)} subtotal
                {Number(i.adjustments) !== 0 && ` · ${fmt.money(i.adjustments)} adjustment`}
              </div>
            </div>
          </div>

          {Number(i.adjustments) !== 0 && i.adjustment_reason && (
            <div className="muted" style={{ fontSize: 13 }}>
              Adjustment of {fmt.money(i.adjustments)}: {i.adjustment_reason}
            </div>
          )}

          {data.by_service_code.length > 0 && (
            <div>
              <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                              letterSpacing: '0.06em', marginBottom: 8 }}>
                Summary by service code
              </div>
              <div className="card table-wrap" style={{ padding: 0 }}>
                <table className="data">
                  <thead><tr>
                    <th>Code</th><th>Name</th><th className="num">Quantity</th>
                    <th className="num">Lines</th><th className="num">Amount</th>
                  </tr></thead>
                  <tbody>
                    {data.by_service_code.map((r) => (
                      <tr key={r.service_code}>
                        <td className="mono">{r.service_code}</td>
                        <td>{r.service_code_name}</td>
                        <td className="num">{fmt.number(r.quantity, 2)} {r.unit_abbrev}</td>
                        <td className="num">{fmt.int(r.lines)}</td>
                        <td className="num" style={{ fontWeight: 600 }}>{fmt.money(r.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div>
            <div className="k dim" style={{ fontSize: 11, textTransform: 'uppercase',
                                            letterSpacing: '0.06em', marginBottom: 8 }}>
              Lines ({data.lines.length})
              {draft && <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                {' '}· a removed line goes back to uninvoiced
              </span>}
            </div>
            <div className="card table-wrap" style={{ padding: 0, maxHeight: 340,
                                                      overflowY: 'auto' }}>
              <table className="data">
                <thead><tr>
                  <th>#</th><th>Ticket</th><th>Service code</th><th>Rule</th>
                  <th className="num">Qty</th><th className="num">Rate</th>
                  <th className="num">Amount</th>{draft && <th />}
                </tr></thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.id} style={{ opacity: l.is_live === false ? 0.55 : 1 }}>
                      <td className="dim">{l.line_number}</td>
                      <td className="mono">
                        {l.ticket_number}
                        {l.is_live === false && <> <Badge>Superseded</Badge></>}
                      </td>
                      <td>{l.service_code}</td>
                      <td className="muted truncate" style={{ maxWidth: 160 }}>{l.rule_name}</td>
                      <td className="num">{fmt.number(l.quantity, 2)} {l.unit_abbrev}</td>
                      <td className="num">{fmt.rate(l.rate_amount)}</td>
                      <td className="num">{fmt.money(l.amount)}</td>
                      {draft && (
                        <td style={{ textAlign: 'right' }}>
                          <button className="btn sm" disabled={busy}
                                  onClick={() => removeLine(l)}>Remove</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {data && <InvoiceDocument data={data} />}

      {rejecting && (
        <ReasonModal title={`Reject ${i.invoice_number}`}
                     blurb="The reason is what the person reopening this has to work from, so it goes on the invoice rather than into a phone call."
                     placeholder="Two load calls look high against the photos, please re-check STL-0000024"
                     confirm="Reject invoice" danger
                     onClose={() => setRejecting(false)}
                     onSubmit={async (reason) => {
                       if (await patch({ status: 'rejected', rejection_reason: reason },
                                       'Rejected')) setRejecting(false)
                     }} />
      )}

      {adjusting && (
        <AdjustmentModal current={i.adjustments} subtotal={i.subtotal}
                         reason={i.adjustment_reason}
                         onClose={() => setAdjusting(false)}
                         onSubmit={async (amount, reason) => {
                           if (await patch({ adjustments: amount, adjustment_reason: reason },
                                           'Adjustment recorded')) setAdjusting(false)
                         }} />
      )}
    </Modal>
  )
}

/**
 * The printed invoice.
 *
 * Rendered separately from the screen rather than printed from it. The modal
 * capped its line list at a scrolling 340 pixels, which on paper became nine
 * rows inside a border, and that was the whole of H12. This is a full page
 * document: every line, a repeating table head across page breaks, and nothing
 * from the application chrome.
 */
function InvoiceDocument({ data }) {
  const i = data.invoice
  // Portalled to the body on purpose. Rendered inside the modal it would be a
  // child of the application chrome that printing has to hide.
  return createPortal(
    <div className="print-doc" aria-hidden="true">
      <div className="print-doc-head">
        <div>
          <div className="print-doc-title">Invoice {i.invoice_number}</div>
          <div className="print-doc-sub">
            {i.project_name} · {i.client_name}
          </div>
        </div>
        <div className="print-doc-meta">
          <div><b>Contractor</b> {i.contractor_name}</div>
          <div><b>Contract</b> {i.contract_number}</div>
          <div><b>Period</b> {fmt.date(i.period_start)} to {fmt.date(i.period_end)}</div>
          <div><b>Status</b> {fmt.title(i.status)}</div>
          {i.approved_at && <div><b>Approved</b> {fmt.datetime(i.approved_at)}</div>}
          {i.paid_at && <div><b>Paid</b> {fmt.datetime(i.paid_at)}</div>}
        </div>
      </div>

      {data.by_service_code.length > 0 && (
        <>
          <div className="print-doc-section">Summary by service code</div>
          <table className="print-doc-table">
            <thead><tr>
              <th>Code</th><th>Description</th><th className="num">Quantity</th>
              <th className="num">Lines</th><th className="num">Amount</th>
            </tr></thead>
            <tbody>
              {data.by_service_code.map((r) => (
                <tr key={r.service_code}>
                  <td>{r.service_code}</td>
                  <td>{r.service_code_name}</td>
                  <td className="num">{fmt.number(r.quantity, 2)} {r.unit_abbrev}</td>
                  <td className="num">{fmt.int(r.lines)}</td>
                  <td className="num">{fmt.money(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="print-doc-section">
        Detail · {data.lines.length} line{data.lines.length === 1 ? '' : 's'}
      </div>
      <table className="print-doc-table">
        <thead><tr>
          <th>#</th><th>Ticket</th><th>Service code</th><th>Description</th>
          <th className="num">Quantity</th><th className="num">Rate</th>
          <th className="num">Amount</th>
        </tr></thead>
        <tbody>
          {data.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.line_number}</td>
              <td>{l.ticket_number}</td>
              <td>{l.service_code}</td>
              <td>{l.service_code_name}</td>
              <td className="num">{fmt.number(l.quantity, 2)} {l.unit_abbrev}</td>
              <td className="num">{fmt.rate(l.rate_amount)}</td>
              <td className="num">{fmt.money(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <table className="print-doc-totals">
        <tbody>
          <tr><td>Subtotal</td><td className="num">{fmt.money(i.subtotal)}</td></tr>
          {Number(i.adjustments) !== 0 && (
            <tr>
              <td>Adjustment{i.adjustment_reason ? ` · ${i.adjustment_reason}` : ''}</td>
              <td className="num">{fmt.money(i.adjustments)}</td>
            </tr>
          )}
          <tr className="grand"><td>Total</td><td className="num">{fmt.money(i.total)}</td></tr>
        </tbody>
      </table>

      {i.notes && <div className="print-doc-notes">{i.notes}</div>}
    </div>,
    document.body)
}

function ReasonModal({ title, blurb, placeholder, confirm, danger, onClose, onSubmit }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={`btn ${danger ? 'danger' : 'primary'}`}
                disabled={busy || reason.trim().length < 4}
                onClick={async () => { setBusy(true); await onSubmit(reason); setBusy(false) }}>
          {busy && <span className="spinner" />} {confirm}
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>{blurb}</p>
      <Field label="Reason" required>
        <textarea className="input" rows={3} value={reason} autoFocus
                  onChange={(e) => setReason(e.target.value)} placeholder={placeholder} />
      </Field>
    </Modal>
  )
}

function AdjustmentModal({ current, subtotal, reason: existing, onClose, onSubmit }) {
  const [amount, setAmount] = useState(String(current || ''))
  const [reason, setReason] = useState(existing || '')
  const [busy, setBusy] = useState(false)
  const next = Number(subtotal || 0) + Number(amount || 0)
  return (
    <Modal title="Adjustment" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary"
                disabled={busy || (Number(amount || 0) !== 0 && reason.trim().length < 4)}
                onClick={async () => {
                  setBusy(true); await onSubmit(Number(amount || 0), reason); setBusy(false)
                }}>
          {busy && <span className="spinner" />} Save adjustment
        </button>
      </>
    }>
      <p className="muted" style={{ marginTop: 0 }}>
        An adjustment sits beside the lines rather than changing them, so the
        tickets still add up to the subtotal. Negative for a credit.
      </p>
      <div className="stack">
        <Field label="Amount" hint="Negative for a credit">
          <input className="input" type="number" step="0.01" value={amount} autoFocus
                 onChange={(e) => setAmount(e.target.value)} placeholder="-250.00" />
        </Field>
        <Field label="What it is for" required={Number(amount || 0) !== 0}
               hint="This prints on the invoice the client reads">
          <textarea className="input" rows={2} value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Credit agreed for the two loads rejected at the DMS gate" />
        </Field>
        <div className="card" style={{ padding: 12 }}>
          <div className="row">
            <span className="dim">Subtotal</span><div className="spacer" />
            <span>{fmt.money(subtotal)}</span>
          </div>
          <div className="row" style={{ marginTop: 4 }}>
            <span className="dim">Adjustment</span><div className="spacer" />
            <span>{fmt.money(Number(amount || 0))}</span>
          </div>
          <div className="row" style={{ marginTop: 6, paddingTop: 6,
                                        borderTop: '1px solid var(--line)' }}>
            <b>Total</b><div className="spacer" />
            <b style={{ fontSize: 17 }}>{fmt.money(next)}</b>
          </div>
        </div>
      </div>
    </Modal>
  )
}

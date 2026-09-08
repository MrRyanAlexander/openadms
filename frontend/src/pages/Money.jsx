import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal, Search, useDebounced,
} from '../components/ui'

/* ============================== SERVICE CODES ============================ */
export function ServiceCodes() {
  const { projectId, project, lookups, toast } = useApp()
  const [creating, setCreating] = useState(false)
  const [rating, setRating] = useState(null)

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
        <button className="btn primary" onClick={() => setCreating(true)}>
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
                 action={<button className="btn primary" onClick={() => setCreating(true)}>
                   <Icon name="plus" size={14} /> Create one</button>}>
            Rules cannot be written until at least one service code exists.
          </Empty>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {codes.data.items.map((c) => (
              <div className="card" key={c.id} style={{ padding: 15 }}>
                <div className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="mono" style={{ fontWeight: 620, fontSize: 13.5 }}>{c.code}</span>
                      <span style={{ fontWeight: 570 }}>{c.name}</span>
                      {c.fema_category && <Badge>FEMA {c.fema_category}</Badge>}
                      {!c.is_active && <Badge>Inactive</Badge>}
                    </div>
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                      {c.contractor_name}
                      {c.description && ` · ${c.description}`}
                    </div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
                      {c.rates.map((r) => {
                        const current = r.id === c.current_rate_id
                        return (
                          <span key={r.id} className={`badge ${current ? 'green' : ''}`}>
                            {fmt.money(r.amount, 4)} / {r.abbreviation}
                            <span className="dim" style={{ marginLeft: 4 }}>
                              {fmt.date(r.effective_from)}
                              {r.effective_to ? ` – ${fmt.date(r.effective_to)}` : ' →'}
                            </span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flex: '0 0 160px' }}>
                    <div style={{ fontSize: 19, fontWeight: 640 }}>
                      {c.current_rate != null ? fmt.money(c.current_rate, 2) : '—'}
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>
                      per {c.current_unit_label || 'unit not set'}
                    </div>
                    <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>
                      {fmt.int(c.rule_count)} rule(s) · {fmt.money(c.billed_total)} billed
                    </div>
                    <button className="btn sm" style={{ marginTop: 9 }}
                            onClick={() => setRating(c)}>
                      New rate
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {creating && (
        <ServiceCodeModal project={detail.data} lookups={lookups}
                          onClose={() => setCreating(false)}
                          onSaved={() => { setCreating(false); codes.reload() }} />
      )}
      {rating && (
        <RateModal code={rating} lookups={lookups} onClose={() => setRating(null)}
                   onSaved={() => { setRating(null); codes.reload() }} />
      )}
    </>
  )
}

function ServiceCodeModal({ project, lookups, onClose, onSaved }) {
  const { projectId, toast } = useApp()
  const [form, setForm] = useState({
    code: '', name: '', contractor_id: '', description: '', fema_category: '',
    rate_amount: '', rate_unit_type: 'per_cubic_yard',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      await api.post(`/projects/${projectId}/service-codes`, {
        ...form,
        rate_amount: form.rate_amount === '' ? null : Number(form.rate_amount),
      })
      toast('Service code created', `${form.code} — ${form.name}`)
      onSaved()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="New service code" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy || !form.code || !form.name || !form.contractor_id}
                onClick={save}>{busy && <span className="spinner" />} Create</button>
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
      toast('Rate added', `${code.code} now bills at ${fmt.money(form.amount, 4)}`)
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
export function Transactions() {
  const { projectId, project, can, toast } = useApp()
  const [filters, setFilters] = useState({ invoice_status: '', date_from: '', date_to: '' })
  const [offset, setOffset] = useState(0)
  const [reversing, setReversing] = useState(null)

  const { data, loading, error, reload } = useFetch(
    () => api.get(`/projects/${projectId}/transactions`, {
      limit: 100, offset, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    }),
    [projectId, offset, JSON.stringify(filters)], { skip: !projectId })

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
            <select className="select" style={{ width: 170 }} value={filters.invoice_status}
                    onChange={(e) => { setOffset(0); setFilters({ ...filters, invoice_status: e.target.value }) }}>
              <option value="">All transactions</option>
              <option value="uninvoiced">Not yet invoiced</option>
              <option value="invoiced">On an invoice</option>
            </select>
            <input className="input" type="date" style={{ width: 150 }} value={filters.date_from}
                   onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
            <input className="input" type="date" style={{ width: 150 }} value={filters.date_to}
                   onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
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
                        <td className="num">{fmt.money(t.rate_amount, 4)}</td>
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
                <span>{fmt.int(offset + 1)}–{fmt.int(offset + data.items.length)} of {fmt.int(data.total)}</span>
                <div className="spacer" />
                <button className="btn sm" disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - 100))}>Previous</button>
                <button className="btn sm" disabled={!data.has_more}
                        onClick={() => setOffset(offset + 100)}>Next</button>
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
                 action={<button className="btn primary" onClick={() => setCreating(true)}>
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

function InvoiceDetail({ invoiceId, onClose, onChanged }) {
  const { can, toast } = useApp()
  const { data, loading, error, reload } = useFetch(
    () => api.get(`/invoices/${invoiceId}`), [invoiceId])

  async function setStatus(status) {
    try {
      await api.patch(`/invoices/${invoiceId}`, { status })
      toast('Invoice updated', `Status set to ${status}`)
      reload(); onChanged?.()
    } catch (err) { toast('Could not update', err.message, 'err') }
  }

  const i = data?.invoice

  return (
    <Modal wide title={loading ? 'Loading invoice' : i?.invoice_number} onClose={onClose}
           footer={
             <>
               <button className="btn" onClick={() => window.print()}>
                 <Icon name="print" size={14} /> Print
               </button>
               <div className="spacer" />
               {i?.status === 'draft' && (
                 <button className="btn" onClick={() => setStatus('submitted')}>Submit</button>
               )}
               {i?.status === 'submitted' && can('invoice.approve') && (
                 <>
                   <button className="btn danger" onClick={() => setStatus('rejected')}>Reject</button>
                   <button className="btn primary" onClick={() => setStatus('approved')}>Approve</button>
                 </>
               )}
               {i?.status === 'approved' && can('invoice.approve') && (
                 <button className="btn primary" onClick={() => setStatus('paid')}>Mark paid</button>
               )}
             </>
           }>
      {loading && <Loading rows={6} />}
      {error && <ErrorNote error={error} onRetry={reload} />}
      {data && (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row wrap" style={{ gap: 14, alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <dl className="kv">
                <dt>Project</dt><dd>{i.project_name}</dd>
                <dt>Client</dt><dd>{i.client_name}</dd>
                <dt>Contractor</dt><dd>{i.contractor_name}</dd>
                <dt>Contract</dt><dd className="mono">{i.contract_number}</dd>
                <dt>Period</dt><dd>{fmt.date(i.period_start)} – {fmt.date(i.period_end)}</dd>
              </dl>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge status={i.status} />
              <div style={{ fontSize: 27, fontWeight: 660, marginTop: 8 }}>
                {fmt.money(i.total)}
              </div>
              <div className="dim" style={{ fontSize: 12 }}>
                {fmt.money(i.subtotal)} subtotal
                {Number(i.adjustments) !== 0 && ` · ${fmt.money(i.adjustments)} adjustments`}
              </div>
            </div>
          </div>

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
            </div>
            <div className="card table-wrap" style={{ padding: 0, maxHeight: 340,
                                                      overflowY: 'auto' }}>
              <table className="data">
                <thead><tr>
                  <th>#</th><th>Ticket</th><th>Service code</th><th>Rule</th>
                  <th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th>
                </tr></thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="dim">{l.line_number}</td>
                      <td className="mono">{l.ticket_number}</td>
                      <td>{l.service_code}</td>
                      <td className="muted truncate" style={{ maxWidth: 160 }}>{l.rule_name}</td>
                      <td className="num">{fmt.number(l.quantity, 2)} {l.unit_abbrev}</td>
                      <td className="num">{fmt.money(l.rate_amount, 4)}</td>
                      <td className="num">{fmt.money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

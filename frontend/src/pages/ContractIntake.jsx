/**
 * Contract intake.
 *
 * The idea is to drop the PDFs into a bucket and have the system pull the line
 * items out, with a person ruling on what is kept. The extraction is a later
 * pass. What is here now is everything around it: the document is registered
 * and staged, proposed line items are reviewed with their source page and
 * confidence in view, and accepting a set generates the service codes and rates.
 *
 * Being honest about the gap matters more than hiding it. A staged document says
 * plainly that nothing is reading it yet, and the review surface is real and
 * tested against seeded proposals, so the parser drops into a path that already
 * works rather than into an unproven one.
 */
import { useState } from 'react'
import { api, fmt } from '../lib/api'
import { useApp, useFetch } from '../lib/store'
import { PageHeader } from '../components/Shell'
import {
  Badge, Card, Empty, ErrorNote, Field, Icon, Loading, Modal,
} from '../components/ui'
import { LineItemReview } from '../components/setup-bits'

export default function ContractIntake() {
  const { projectId, toast } = useApp()
  const [openContract, setOpenContract] = useState(null)

  const detail = useFetch(() => api.get(`/projects/${projectId}`),
                          [projectId], { skip: !projectId })

  if (!projectId) {
    return (<><PageHeader title="Contract Intake" /><div className="page">
      <Empty icon="folder" title="No project in context">
        Contract intake works against the contracts linked to a project.
      </Empty></div></>)
  }

  const contracts = detail.data?.contracts || []

  return (
    <>
      <PageHeader title="Contract Intake">
        <button className="btn icon" onClick={detail.reload}>
          <Icon name="refresh" size={15} />
        </button>
      </PageHeader>

      <div className="page">
        <div className="card" style={{ padding: '13px 16px', marginBottom: 14,
                                       background: 'var(--surface-2)' }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <Icon name="invoice" size={16} style={{ marginTop: 2, color: 'var(--accent)' }} />
            <div className="muted" style={{ fontSize: 13, lineHeight: 1.65 }}>
              A contract is a list of priced line items, and those lines are what service
              codes, rates and rules get built from. Register the PDF here, review the
              lines, and accept the ones this project actually bills.{' '}
              <b style={{ color: 'var(--text)' }}>Reading the PDF automatically is a later
              pass</b>, so lines are entered, pasted or seeded for now, and the review is
              the same either way.
            </div>
          </div>
        </div>

        {detail.loading && <Loading rows={5} />}
        {detail.error && <ErrorNote error={detail.error} onRetry={detail.reload} />}

        {detail.data && (contracts.length === 0 ? (
          <Empty icon="invoice" title="No contracts on this project">
            Link a contract in Project Setup and its line items become reviewable here.
          </Empty>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {contracts.map((c) => (
              <ContractIntakeCard key={c.id} contract={c} projectId={projectId}
                                  open={openContract === c.contract_id}
                                  onToggle={() => setOpenContract(
                                    openContract === c.contract_id ? null : c.contract_id)}
                                  toast={toast} />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function ContractIntakeCard({ contract, projectId, open, onToggle, toast }) {
  const [staging, setStaging] = useState(false)
  const [seeding, setSeeding] = useState(null)
  const ingestions = useFetch(
    () => api.get(`/contracts/${contract.contract_id}/ingestions`),
    [contract.contract_id])

  const staged = ingestions.data?.items || []
  const awaiting = staged.reduce((n, s) => n + Number(s.awaiting_count || 0), 0)

  return (
    <Card>
      <div className="row wrap" style={{ gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="mono" style={{ fontWeight: 620 }}>{contract.contract_number}</span>
            <Badge status={contract.contract_status} />
            {contract.is_primary && <Badge tone="blue">Primary</Badge>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {contract.title} · {contract.contractor_name}
          </div>
          <div className="row wrap" style={{ gap: 6, marginTop: 9 }}>
            <Badge>{staged.length} staged document{staged.length === 1 ? '' : 's'}</Badge>
            {awaiting > 0 && <Badge tone="amber">{awaiting} line(s) awaiting a decision</Badge>}
          </div>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => setStaging(true)}>
            <Icon name="plus" size={13} /> Register a PDF
          </button>
          <button className="btn sm" onClick={onToggle}>
            {open ? 'Hide line items' : 'Review line items'}
          </button>
        </div>
      </div>

      {staged.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data">
            <thead><tr>
              <th>Document</th><th>State</th><th>Proposed</th>
              <th>Accepted</th><th>Rejected</th><th>Registered</th><th />
            </tr></thead>
            <tbody>
              {staged.map((s) => (
                <tr key={s.id}>
                  <td className="truncate" style={{ maxWidth: 260 }}>
                    {s.document_url
                      ? <a href={s.document_url} target="_blank" rel="noreferrer">
                          {s.document_title}
                        </a>
                      : s.document_title || '—'}
                  </td>
                  <td>
                    {s.status === 'parsing_not_enabled' && (
                      <Badge tone="amber">Not read yet</Badge>
                    )}
                    {s.status === 'parsed' && <Badge tone="blue">Proposals ready</Badge>}
                    {s.status === 'reviewed' && <Badge tone="green">Reviewed</Badge>}
                    {s.status === 'failed' && <Badge tone="red">Failed</Badge>}
                  </td>
                  <td className="num">{fmt.int(s.proposed_count)}</td>
                  <td className="num">{fmt.int(s.accepted_count)}</td>
                  <td className="num">{fmt.int(s.rejected_count)}</td>
                  <td className="muted">{fmt.date(s.created_at)}</td>
                  <td style={{ width: 150, textAlign: 'right' }}>
                    {s.status === 'parsing_not_enabled' && (
                      <button className="btn ghost sm" onClick={() => setSeeding(s)}>
                        Enter the lines
                      </button>
                    )}
                    {s.status === 'parsed' && (
                      <button className="btn ghost sm"
                              onClick={async () => {
                                await api.post(`/ingestions/${s.id}/close`)
                                toast('Review closed', s.document_title || 'Document')
                                ingestions.reload()
                              }}>
                        Mark reviewed
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dim" style={{ fontSize: 11.5, padding: '8px 2px 0' }}>
            {ingestions.data?.note}
          </div>
        </div>
      )}

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line-soft)' }}>
          <LineItemReview contractId={contract.contract_id} projectId={projectId}
                          onGenerated={() => ingestions.reload()} />
        </div>
      )}

      {staging && (
        <StageDocument contractId={contract.contract_id} toast={toast}
                       onClose={() => setStaging(false)}
                       onDone={() => { setStaging(false); ingestions.reload() }} />
      )}

      {seeding && (
        <SeedProposals ingestion={seeding} toast={toast}
                       onClose={() => setSeeding(null)}
                       onDone={() => { setSeeding(null); ingestions.reload() }} />
      )}
    </Card>
  )
}

function StageDocument({ contractId, toast, onClose, onDone }) {
  const [form, setForm] = useState({
    title: '', url: '', provider: 'sharepoint', notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    setBusy(true); setError(null)
    try {
      await api.post(`/contracts/${contractId}/ingestions`, form)
      toast('Registered', `${form.title} is staged`)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal title="Register a contract PDF" onClose={onClose} footer={
      <>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!form.title || !form.url || busy}
                onClick={save}>
          {busy && <span className="spinner" />} Register and stage
        </button>
      </>
    }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}
      <div className="stack">
        <div className="card" style={{ padding: '11px 14px', borderColor: 'var(--amber)',
                                       background: 'var(--amber-soft)' }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
            The file stays where the link points. Nothing reads it yet: registering it
            stages the document so its line items can be reviewed, and so the extraction
            pass has somewhere to write when it ships.
          </div>
        </div>
        <Field label="Title" required>
          <input className="input" value={form.title} autoFocus
                 placeholder="Countywide Debris Removal, executed"
                 onChange={(e) => set({ title: e.target.value })} />
        </Field>
        <Field label="Link" required
               hint="The full https link into Box or SharePoint">
          <input className="input" value={form.url} placeholder="https://…"
                 onChange={(e) => set({ url: e.target.value })} />
        </Field>
        <Field label="Where it lives">
          <select className="select" value={form.provider}
                  onChange={(e) => set({ provider: e.target.value })}>
            {['sharepoint', 'box', 'gdrive', 'dropbox', 'other'].map((p) => (
              <option key={p} value={p}>{fmt.title(p)}</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  )
}

/**
 * Entering the lines by hand against a staged document. This is the same shape
 * the parser will write, which is the point: the review path is proven before
 * anything automated feeds it.
 */
function SeedProposals({ ingestion, toast, onClose, onDone }) {
  const { lookups } = useApp()
  const [rows, setRows] = useState([
    { description: '', line_number: '', item_code: '', unit_type_code: '',
      unit_price: '', debris_type_code: '', source_page: '' },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function set(i, key, value) {
    setRows((all) => all.map((r, index) => (index === i ? { ...r, [key]: value } : r)))
  }

  async function save() {
    setBusy(true); setError(null)
    try {
      const payload = rows
        .filter((r) => r.description.trim())
        .map((r) => ({
          description: r.description.trim(),
          line_number: r.line_number ? Number(r.line_number) : undefined,
          item_code: r.item_code || undefined,
          unit_type_code: r.unit_type_code || undefined,
          unit_price: r.unit_price ? Number(r.unit_price) : undefined,
          debris_type_code: r.debris_type_code || undefined,
          source_page: r.source_page ? Number(r.source_page) : undefined,
        }))
      if (!payload.length) throw new Error('Nothing to add yet')
      await api.post(`/ingestions/${ingestion.id}/proposals`, payload)
      toast('Lines added', `${payload.length} awaiting a decision`)
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }

  return (
    <Modal wide title={`Line items · ${ingestion.document_title || 'staged document'}`}
           onClose={onClose} footer={
             <>
               <button className="btn" onClick={onClose}>Cancel</button>
               <button className="btn primary" disabled={busy} onClick={save}>
                 {busy && <span className="spinner" />} Add for review
               </button>
             </>
           }>
      {error && <div className="card" style={{ padding: 12, marginBottom: 14,
                     borderColor: 'var(--red)', background: 'var(--red-soft)',
                     color: 'var(--red)' }}>{error}</div>}
      <div className="stack" style={{ gap: 12 }}>
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
          Type the lines off the contract, with the page they came from. They land as
          proposals awaiting a decision, exactly where extracted lines will land.
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead><tr>
              <th>Line</th><th>Code</th><th>Description</th><th>Unit</th>
              <th>Price</th><th>Debris</th><th>Page</th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: 3 }}>
                    <input className="input" style={{ width: 62 }} value={r.line_number}
                           onChange={(e) => set(i, 'line_number', e.target.value)} />
                  </td>
                  <td style={{ padding: 3 }}>
                    <input className="input" style={{ width: 88 }} value={r.item_code}
                           onChange={(e) => set(i, 'item_code', e.target.value)} />
                  </td>
                  <td style={{ padding: 3 }}>
                    <input className="input" style={{ minWidth: 220 }} value={r.description}
                           onChange={(e) => set(i, 'description', e.target.value)} />
                  </td>
                  <td style={{ padding: 3 }}>
                    <select className="select" style={{ width: 132 }} value={r.unit_type_code}
                            onChange={(e) => set(i, 'unit_type_code', e.target.value)}>
                      <option value="">—</option>
                      {(lookups?.unit_types || []).map((u) => (
                        <option key={u.code} value={u.code}>{u.abbreviation}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: 3 }}>
                    <input className="input" style={{ width: 92 }} type="number" step="0.0001"
                           value={r.unit_price}
                           onChange={(e) => set(i, 'unit_price', e.target.value)} />
                  </td>
                  <td style={{ padding: 3 }}>
                    <select className="select" style={{ width: 118 }} value={r.debris_type_code}
                            onChange={(e) => set(i, 'debris_type_code', e.target.value)}>
                      <option value="">—</option>
                      {(lookups?.debris_types || []).map((d) => (
                        <option key={d.code} value={d.code}>{d.code}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: 3 }}>
                    <input className="input" style={{ width: 58 }} value={r.source_page}
                           onChange={(e) => set(i, 'source_page', e.target.value)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row">
          <button className="btn ghost sm" onClick={() => setRows([...rows, {
            description: '', line_number: '', item_code: '', unit_type_code: '',
            unit_price: '', debris_type_code: '', source_page: '' }])}>
            <Icon name="plus" size={13} /> Another line
          </button>
        </div>
      </div>
    </Modal>
  )
}

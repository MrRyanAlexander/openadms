---
title: QC, the lock and the client package
description: QC marks set by people, locking QC Approved tickets as invoiced in named batches, the ledger and the audit trail, reports and exports, assembling the client package by hand, and closing the project.
---

Once tickets are reviewed, the back office checks them (QC), locks what it invoices, and assembles
the client package from the exports. Open ADMS records what work is worth and locks what was
invoiced; **it moves no money and generates no invoice**.

## The ledger

**Billings → Ledger** shows every transaction line: the ticket and line, its date, the pay item,
quantity, rate and amount, the prime (and the sub that did the work), the contract and rule, the
ticket's status, QC mark and lock, and its mileage. Filter by workflow, pay item, prime, invoice
batch or lock. The ledger is always the current truth: it is regenerated when a ticket changes,
never reversed.

## QC

**Billings → QC and invoice lock.** Pick tickets and **set the QC status**:

```text
QC Review  →  QC Approved  |  QC Issues  |  QC Void
```

- QC is set on the **completed load or haul-out** (a split is one), never on a single field event;
  unit rate tickets, forms and certifications are QC'd on their own.
- A QC mark **never changes the record** or reruns anything.
- It takes the _QC_ permission.

## The invoice lock and batches

"Invoicing" means the back office checked a set of tickets and **locked them as invoiced**. There is
no invoice record.

- **Only a whole, `COMPLETED`, QC Approved ticket locks.** QC Review, QC Issues and QC Void all block
  the lock, and each ticket that can't lock says why.
- Locked tickets may be grouped in a **named invoice batch**, such as "Bayline ROW, week of 12 Oct":
  a name and its tickets, no amounts, reportable by name.
- While a lock stands, nothing on the ticket changes, and a rate or rule change never touches it. An
  unlock takes its own permission and a note, and is audited.

## The audit trail

**Billings → Audit trail** shows every change on the project: what was made, changed or removed,
the fields before and after, who, from where, and why. It is read-only: the audit log is
append-only, and no one can edit it.

## Reports and exports

- **Reports and Forms → Reports**: what the project moved, in debris totals, never costs, by period,
  workflow, debris type, site or contractor; the **daily report** as a PDF and an **email summary**
  to paste.
- **Reports and Forms → Exports, photo PDFs and receipts**: tickets, transactions (the ledger),
  certifications and the audit history as **CSV**, **Excel-compatible** or **JSON**, filtered by
  workflow, prime or invoice batch; **photo PDFs** of tickets, certifications or incidents, several
  to a page or one to a page with its receipt; and the receipt batch.

Each file is made when you ask for it; nothing of it is kept.

## The client package

The client package is the deliverable: the project's final tickets with their photographs and
receipts, its transactions and its other records. **The back office assembles it by hand** from the
exports and zips it. The system doesn't generate it.

## Closing the project

**Billings → Close the project** marks it closed; it can be reopened. A project is closed, never
deleted, and any ledger row still traces to its field events, certification, photographs, GPS and
every audited change, years later.

## Related

- [The ledger and the audit trail](/concepts/ledger-and-audit/)
- [Statuses and QC status](/concepts/statuses/)

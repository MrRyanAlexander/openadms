---
title: Statuses and QC status
description: The four statuses the worker sets on every ticket, which of them bill, what reprocessing does, and the QC status people set separately.
---

Every ticket has a **status**, set by the worker on every run, and, once it is whole, a **QC status**
set only by people. The two are separate: QC never changes the status or reruns anything.

## The four statuses

There are four, and only these:

| Status          | When                                                                           | Bills?                                                                     |
| --------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `PENDING`       | A field event is still missing. Never flagged for waiting, and never expires   | No lines yet                                                               |
| `COMPLETED`     | All its field events are in and no flag is open (every flag fixed or accepted) | Yes                                                                        |
| `MANUAL_REVIEW` | Any flag is open                                                               | **Yes, wherever an amount can be computed**                                |
| `VOID`          | A person voided it with a reason, or a rule's _Void ticket_ action did         | Nothing: its lines are removed, each copied in full to the audit log first |

- **Review still bills.** `MANUAL_REVIEW` means "resolve this", not "hold the money". Where no amount
  can be computed (no rule matches, no quantity), the flag's message says "not billed".
- **Only a person (with a reason) or a rule voids.** A void keeps the record and its audit trail and
  stops all billing. Unvoiding is an audited override, and a rule's void always wins: a person's
  unvoid lasts only until the next reprocess, so to keep the ticket, correct the data or the rule.
- **A `PENDING` ticket shows the flags of the field event it has** (a typed number, a certification
  problem), so the review queue can act on them early. It stays `PENDING` until it is whole.

## Reprocessing

A correction, a renumber, an accepted flag, a void or unvoid, or a setup change (a rate, a rule, a
site's facts) **runs the ticket again**, `COMPLETED` ones included. The worker draws its conclusions
again from the current field events and setup: the completed load is updated in place, never
duplicated, and the transactions are regenerated.

A ticket **locked as invoiced** is never touched by a reprocess; it is unlocked first, and the
unlock is audited.

## Time

- The phone's clock is the recorded time, stored with the phone's offset and the time the server
  received it. **Which day** a ticket belongs to is the project's time zone: every project has one.
- **A load's time is its collection's end**, so a Monday preload dumped on Tuesday counts on Monday,
  at Monday's rate.
- Timing checks look only for what can't be true (a disposal that started before its collection
  ended, overlapping loads on one truck). Nothing ever measures how long a field event has waited.

## QC status

The back office's own review mark, set **only by people**:

```text
QC Review  →  QC Approved  |  QC Issues  |  QC Void
```

- On the **completed load or haul-out** (a split is one), never on a single field event. Unit rate
  tickets, forms and certifications are QC'd on their own.
- It **never changes the record** or reruns anything.
- **Only QC Approved tickets can be locked as invoiced.** QC Review, QC Issues and QC Void all
  block the lock, and a ticket in review is resolved first.

## Related

- [Flags, never blocks](/concepts/flags/)
- [QC, the lock and the client package](/guides/back-office/qc-lock-and-deliver/)

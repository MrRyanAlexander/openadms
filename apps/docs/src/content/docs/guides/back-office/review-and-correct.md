---
title: Review and correct
description: The one review queue, a ticket's page, and the tools - correct, renumber, void, accept - with when each is right, plus quarantined records, held records and records made in the back office.
---

Every problem lands in **one review queue**. A permitted person reads the evidence and fixes the
record, or accepts that it is right as it is; the worker then draws its conclusions again. Nothing
is deleted and every change is audited under the person who made it.

## The review queue

**Tickets → Review queue** lists the project's tickets with an open flag, by workflow (loads,
haul-outs, unit rate) and by cause (_Debris type mismatch_, _Load call high_, _Ineligible site_…).
It needs _View review_.

A **ticket's page** shows its field events side by side (collection and disposal, or each property
of a split), their photographs, its flags with their plain messages, its transactions, and its
**history**: every change, who made it, from where (a phone, the back office, the system), why, and
what each run of the worker decided.

## Four tools, and when each is right

| The evidence says                                                             | Tool                               | Why                                                                            |
| ----------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Real work under the wrong number                                              | **Renumber** the field event       | The work happened; only the identifier is wrong                                |
| Real work, a detail keyed wrong                                               | **Correct** the field              | The same                                                                       |
| The work never happened                                                       | **Void** the ticket, with a reason | A record that shouldn't exist can't be corrected; renumbering one double-bills |
| The flag is right as it is (a heaped load at 96%, the photographs confirm it) | **Accept** the flag, with a reason | Nothing is wrong with the evidence                                             |

:::danger[Renumber real work; void what never happened]
A phantom (two numbers for one load) is **voided**, never renumbered: renumbering it would bill the
same debris twice. Nothing technically stops the wrong choice; the audit trail is the backstop.
:::

### Correct

**Every captured field** can be corrected in place (GPS, times, photographs, the load call,
estimates, the number), because real errors happen in all of them. The prior value is kept in the
audit log, written by the database itself. Each correction takes the _Correct records_ permission,
keeps your note beside it, and reprocesses the ticket, `COMPLETED` ones included.

Example: ticket `101001`'s tower photograph shows 70%, not the 80% called. Luis Ortega corrects the
load call to 70% with the note "Tower photo shows 70%"; the worker reprices it at 45.5 CY.

### Renumber

A renumber is a correction of the number. It writes an audit record of the old and new numbers under
the reviewer's own name, and the field event joins the ticket it now names; the reviewer never forces
a pairing or writes a completed load.

### Void

A void needs the _Void_ permission and a **reason from the firm's list** (_Duplicate ticket_, _Work
never happened_, _Not eligible work_…). It keeps the record and its audit trail and **stops all
billing**: the ticket's lines are removed, each copied in full to the audit log first. Unvoiding
always leaves an audited record of its own. A rule's _Void ticket_ action always wins over a
person's unvoid at the next reprocess, so to keep such a ticket, correct the data or the rule.

### Accept a flag

_Accept a flag_ is a permission of its own: _Correct records_ doesn't carry it. An accepted flag
stays in the ticket's history and isn't raised again unless its facts change. Accepting **never
changes what bills**. When every flag is fixed or accepted, the ticket is `COMPLETED`.

## Quarantined records

**Tickets → Quarantined records** holds what a phone sent under a number another record already
holds: a second disposal on one ticket, say. A quarantined record is **never a wastebasket**: it is
a monitor's observation of real work, kept in full.

Read it beside the record that holds the number. The cert number, the start and end times, the site,
the GPS and the photographs usually settle it. Example: two disposals at Marsh Road TDSR, at 10:22
and 11:40, both scanned `101020`, on the same truck `730416`. Two trips means real work done twice;
the 11:40 disposal follows the collection `101021` ended at 11:05, so the reviewer **renumbers** it to
`101021`. A quarantined record that is a second copy of the same record is marked so.

## Held records, jobs and records made here

- **Held records and files**: a record or photograph a phone sent that couldn't be taken as it was
  (too heavy, unreadable), held for a person rather than lost.
- **Jobs set aside**: work the worker couldn't finish after its tries, kept for a person to look at.
- **Records made in the back office**: where a phone failed or was lost, a permitted person makes the
  field event in the back office, for the monitor who did the work, with a reason (_Device failed_,
  _Device lost_). The ticket is flagged "record created in the back office", naming who and why.

## A locked ticket

A ticket **locked as invoiced** refuses any change ("Ticket 101001 is locked as invoiced: unlock it
first. Nothing was changed."). A person with _Unlock an invoiced ticket_ unlocks it, with a note,
audited; then it can be corrected and reprocessed.

## Related

- [Flags, never blocks](/concepts/flags/)
- [Flags reference](/reference/flags/)
- [QC, the lock and the client package](/guides/back-office/qc-lock-and-deliver/)

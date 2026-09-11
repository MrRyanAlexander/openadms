<div align="center">
<sub>

[Docs index](README.md) · [Rules engine](RULES_ENGINE.md) · [Data model](DATA_MODEL.md) · [Repository](../README.md)

</sub>
</div>

# Sprint 2 plan

Source: the second back office walkthrough, 187 steps across 13 suites, answered
10 Sep 2026. Every step carries a mark and almost all carry a note. The tracker
holds the raw answers; this document is what they add up to.

Sprint 1 (`docs/BACKOFFICE_REMEDIATION_PLAN.md`) came from a walkthrough that set
a project up. This one came from a walkthrough that tried to **run** one, and the
findings are a different shape: less about missing forms, more about what the
system refuses to let a data manager do after the field has already produced work.

Baseline before any change: 18 migrations, 106 schema assertions, 96 API tests,
52 tables, 15 views. Every phase below must leave those green.

---

## What the 187 answers say

| Mark | Count | Reading |
|---|---|---|
| Works | 108 | The setup half of the product is sound |
| Broken | 27 | Real defects, most of them in the running-a-project half |
| Missing | 24 | Nothing exists to do the job at all |
| Partial | 10 | Works, badly or in too many steps |
| N/A | 18 | Field app, peers, future access, deferred by decision |

The 27 broken and 24 missing marks collapse into **eight themes**. Six of them
share one root cause, which is why the phase order below is not the suite order.

### Theme 1. Nothing downstream of a completed ticket can be corrected

> D3, D4, D10, D11: "I have no way to edit existing tickets in the back-office
> (apart from void), but I should."
> D2: "all they can do is VOID the pending ticket… as a manager or even an
> analyst, I need to be able to go into the system and create the missing side of
> the ticket details to fix the issues."
> D9: "I see no way to reverse a transaction or unvoid the ticket."
> E10: "changing a truck certificate has much wider impacts… re-running the rules
> against all of the tickets the certificate touched prior and any downstream."

`PATCH /tickets/{id}` exists and no screen calls it. Even if one did, the engine
cannot currently reprice a ticket: `transactions_one_per_ticket_rule` is a unique
index over `(ticket_id, rule_id) WHERE NOT is_reversal`, and reversing a
transaction leaves the original row in place, so a second `adms_process_ticket`
run hits the conflict and does nothing.

This is the sprint's spine. Correcting a ticket, correcting a certificate,
correcting a rate and repairing a stuck handoff are the same operation with
different triggers.

### Theme 2. Equipment certification is modelled at the wrong level

> E10: "Equipment is certified under a given project, NOT outside of it. We
> cannot transfer a cert from one project to another or copy them over… you would
> never be able to certify something unless you were doing it under a given
> project."

`equipment` is instance wide and carries a single `capacity_cy`, `certified_on`
and `certification_exp`. A certification is per project, per measurement event,
and supersedes the one before it. Because `ticket_metrics` derives billable cubic
yards from `COALESCE(tickets.certified_capacity_cy, equipment.capacity_cy)`, this
is a billing-critical model change, not a records tidy-up.

### Theme 3. The data manager's actual day has no screen

> C1: "we are hunting for the issues: times that don't make sense, duplicate
> tickets… location data that doesn't match up. Address details the monitor typed
> in manually."
> B12: "I spend most of my day auditing tickets for accuracy, especially photos
> for tree work to compare pre, measure and post… and then marking each ticket QC
> approved or if there is some issue."
> C6: "Most accurate, Most inaccurate would be even more useful."

The dashboard answers "what did we produce", which is the question a PM asks. The
data manager's question is "what looks wrong", and nothing answers it. This is a
new subsystem: exception detection plus a review queue plus a QC state on the
ticket.

### Theme 4. Date filters are broken everywhere

> C14 and G11: `invalid input for query argument $2: '2026-08-13' ('str' object
> has no attribute 'toordinal')`

Three endpoints declare `date_from`/`date_to` as `Optional[str]` and bind them to
a `${n}::date` placeholder. asyncpg infers `date` from the cast and refuses the
string. One-line fix in three files, and it blocks testing everything else.

### Theme 5. Filter state does not survive navigation

> C13: "When I filter VOID and then page back back and forward forward I see the
> default list of tickets again without any filters."
> C9: "We need to put a submit button on query fields like the ticket list."
> C8: "It works on some pages but breaks on others… I'm back at the top of the
> page of tickets."

Filters live in component state. They belong in the URL.

### Theme 6. Deactivation is a black hole

> F11: "I deactivated the Hazelwood DMS… it simply disappeared forever… but when
> I go back into the project the DMS is still listed. And logged in as a monitor…
> the hazelwood dms is still an option. The ticket completed and it processed as
> if the DMS was still active."
> M4: "I can only deactivate clients, and when I do they go away into a black
> hole, and there is no warning to confirm this destructive action."

Two bugs in one: the record vanishes from the only list that could bring it back,
and the deactivation does not reach the project link or the field app option
lists. That second half is a correctness problem, not a UX one.

### Theme 7. Money surfaces are incomplete at the edges

> H4/H5: no way to remove an invoice line or record an adjustment.
> H9: "Only an admin could reject it but no reason was required. And no
> opportunity to reopen and fix it to resubmit later exists."
> H12: "The row data is capped to one page… We should be outputting what looks
> more like a standard full page invoice document."
> D7: void after approval moved the transaction and left the invoice alone.
> M8: "We are using triple decimals all over the place for double digits."
> G13: hangers are flat rate whatever the count; leaners and stumps are tiered.

### Theme 8. Contract line items cannot be worked

> I5: "Cannot paste tabular data into the form… Need to make it a real tabular
> box… auto expands into a table."
> I6: "Adding line items works, but you cannot edit them post save."
> I8: "attempts to reject line items… get an error noting the rejection could not
> be saved."

The worker importer (J1 through J9, every one green, "It worked really well")
already solved this problem. Line items need the same component.

---

## Phases

Dependency ordered. Phase 2 blocks 3, and 3 blocks 4 and 5. Everything from 6
down is independent and can land in any order.

### Phase 1. Defects with no schema change

Cheap, and several of them block testing the rest.

| | Finding | Change |
|---|---|---|
| 1.1 | C14, G11 | `date_from`/`date_to` become `Optional[date]` in `tickets.py`, `billing.py`, `reports.py`. FastAPI parses and validates; asyncpg gets a real date and a bad value returns 422 instead of 500 |
| 1.2 | I8 | Fix the line item reject path |
| 1.3 | F5 | Contractor tier parent validation rejects a valid prime/sub combination. Correct the constraint and the API check |
| 1.4 | F6 | Enabling a debris stream does not enable the ticket types that depend on it |
| 1.5 | F7 | Recording an estimate revision for a newly enabled stream fails |
| 1.6 | F11 | Deactivating a disposal site must cascade to `project_sites` and to the field app option lists, and a deactivated record must remain visible and reactivatable |
| 1.7 | M4 | Same for clients, contractors and equipment, plus a confirm step naming what will happen |
| 1.8 | A5 | Inline worker create from the assign-worker picker |
| 1.9 | G7 | Deleting a rule that has produced transactions is refused with the reason; retiring stays available |

### Phase 2. Schema

One batch, folded into the baseline migrations where the table already exists,
per the standing decision to rebuild rather than migrate forward.

| | Finding | Change |
|---|---|---|
| 2.1 | E10 | `project_equipment_certifications`: project_id, equipment_id, certified_capacity_cy, tare_weight_lbs, measured_by, measured_on, method, document_id, supersedes_id, status, notes. Unique on one active certification per (project, equipment). `tickets.certification_id` FK, snapshotted at creation |
| 2.2 | Theme 1 | `transactions.superseded_at` and `superseded_by`, the unique index becomes `(ticket_id, rule_id) WHERE NOT is_reversal AND superseded_at IS NULL`, and the immutability trigger is narrowed to permit exactly that one transition and nothing else |
| 2.3 | Theme 1 | `tickets.needs_reprocess`, `reprocess_reason`, `last_reprocessed_at` |
| 2.4 | Theme 3 | `ticket_reviews`: ticket_id, state (pending, approved, flagged, resolved), reviewer, reviewed_at, issue_code, notes. `ticket_flags`: ticket_id, flag_code, severity, detail jsonb, raised_at, cleared_at. `ticket_flag_kinds` lookup so a new check is a seed row |
| 2.5 | G13 | `service_codes.quantity_mode` (`measured`, `flat`, `tiered`) and `rate_tiers` (rate_id, from_value, to_value, amount). A flat code always bills quantity 1 whatever the ticket says; a tiered code picks the tier the measurement falls in |
| 2.6 | F1 | `disposal_sites.latitude`/`longitude`, and `capacity_cy` removed. A disposal site has no cubic yard capacity in this product |
| 2.7 | H9 | `invoices.rejection_reason`, `rejected_by`, `rejected_at`, and `rejected` becomes reopenable to `draft` |
| 2.8 | C20 | `audit_events.domain` generated from entity_type: `billing`, `operations`, `records`, `security`. Drives the audit screen's tabs |
| 2.9 | M8 | Money presents at 2 decimals and quantity at the unit type's `precision_digits`. Storage precision is unchanged; the formatter and the exports change |

### Phase 3. The reprocessing engine

| | Change |
|---|---|
| 3.1 | `adms_reprocess_ticket(ticket, reason, actor)`: re-snapshot the ticket's certification-derived values, reverse every live transaction, stamp them superseded, re-evaluate, write the new ones, all inside one transaction |
| 3.2 | Guardrail: a transaction on an approved or paid invoice is never silently superseded. The call returns a refusal naming the invoice, and the operator either reopens the invoice or accepts a forward adjustment |
| 3.3 | `adms_mark_affected_tickets(entity_type, entity_id)`: certification change, rate change, service code change and rule change each mark their affected tickets `needs_reprocess` with a reason, rather than repricing thousands of rows inside someone's PATCH |
| 3.4 | `POST /tickets/{id}/reprocess`, `POST /projects/{id}/reprocess` (bounded, reports what it will touch first), `POST /tickets/{id}/unvoid` |
| 3.5 | D7: a reversal against an invoiced transaction marks the invoice `needs_review` and surfaces on the invoice screen |

### Phase 4. Ticket editing and exception repair

| | Finding | Change |
|---|---|---|
| 4.1 | D3, D4, D10, D11 | Ticket edit surface at manager rank, reason required, writing through `PATCH /tickets/{id}` and queueing a reprocess |
| 4.2 | D2 | Stuck handoff repair: create or complete the missing stage from the back office at manager rank, or void with notes. Currently admin-only and void-only |
| 4.3 | D9 | Reverse a transaction from the ticket's Billings tab and from the ledger, admin rank, reason required |
| 4.4 | D9 | Unvoid, with the ticket returning to its prior state and reprocessing |
| 4.5 | E10 | Certification screen inside the project: measure, supersede, and see exactly which tickets a change will reprice before committing it |

### Phase 5. The QC review queue

| | Finding | Change |
|---|---|---|
| 5.1 | C1 | Flag engine over `ticket_evaluation`: implausible cycle time, load call outlier for the truck, missing or too-few photos, manually typed origin address, origin far from every project zone, same truck in two places at once, duplicate-looking load on the same truck within N minutes |
| 5.2 | B12 | QC queue: the day's tickets needing review, filterable by flag, with approve and flag-with-issue on the row and a keyboard path through them |
| 5.3 | C6 | Monitor accuracy: tickets reviewed, approved, flagged, and the flag mix per monitor, with a click into their flagged tickets |
| 5.4 | C1, C2 | Dashboard leads with what needs attention. Outstanding tile copy becomes "Outstanding work" with the explanation removed |
| 5.5 | — | Deferred to Sprint 3 by decision: GPS drift correction against a street-address matrix. The flag that detects the mismatch ships now, the automated correction does not |

### Phase 6. Lists, filters and search

| | Finding | Change |
|---|---|---|
| 6.1 | C13 | Filter, sort and page state moves into the URL query string on every list |
| 6.2 | C9 | Search submits on Enter and on a button, not on every keystroke |
| 6.3 | C8 | The refresh button goes. Lists refetch on navigation and after a write |
| 6.4 | C15 | Incidents list gets severity and description columns and stops borrowing the ticket columns |
| 6.5 | E7 | Contractor filter on transactions |
| 6.6 | B9 | Equipment list gets certification expiry and days remaining |
| 6.7 | B6 | Projects list gets estimate against completion and days to the end date |
| 6.8 | E5, E6 | Dashboard period selector so "yesterday" and "this week" are answerable |
| 6.9 | E1, E9 | Estimate against actual per debris stream, with the revision history |
| 6.10 | E4 | The alerts feed surfaces on the dashboard, not only inside setup |

### Phase 7. Money surfaces

| | Finding | Change |
|---|---|---|
| 7.1 | H4, H5 | Remove a line from a draft invoice, and record an adjustment with a reason |
| 7.2 | H9 | Reject requires a reason; a rejected invoice reopens to draft and keeps the rejection on the record |
| 7.3 | H12, H8 | A real printable invoice document: full page, all lines, approver and approval time on it |
| 7.4 | M8 | Decimal presentation rules across lists, detail, print and export |
| 7.5 | G13 | Flat and tiered quantity modes wired into the engine and into the service code editor |
| 7.6 | F8 | An upcoming rate change marker on the service code row |
| 7.7 | C19, C17 | "Money" becomes "Billings". "Stages" becomes "Lifecycle" everywhere |

### Phase 8. Contract line items

| | Finding | Change |
|---|---|---|
| 8.1 | I5 | One paste box that expands into an editable table, the same component as the worker importer |
| 8.2 | I6 | Line items stay editable while the ingestion is awaiting review |
| 8.3 | I8 | Reject persists |

### Phase 9. Project lifecycle

| | Finding | Change |
|---|---|---|
| 9.1 | F12 | Ticket prefix editable, with issued numbers untouched and the change refused once tickets exist unless forced with a reason |
| 9.2 | F13 | Project dates editable after creation |
| 9.3 | F14 | Bulk worker actions: remove from project, deactivate, in addition to the existing bulk password |
| 9.4 | M5 | Project archive. Delete stays refused while tickets exist |

### Phase 10. Audit and closeout

| | Finding | Change |
|---|---|---|
| 10.1 | C20 | Audit splits by domain: billing, operations, records, security |
| 10.2 | K2 | Chain view: click a change and see the record's whole history in order |
| 10.3 | K11 | The naming template actually names the files in the closeout package |
| 10.4 | K13 | Closeout for a date range |

### Phase 11. Mobile and keyboard

| | Finding | Change |
|---|---|---|
| 11.1 | M12 | The back office works at phone width. Navigation collapses, tables scroll in their own container, and the screens that cannot usefully shrink say so |
| 11.2 | M13 | Enter opens a focused row |
| 11.3 | C18 | Media renders as real images with a lightbox |

### Phase 12. Seeds and copy

| | Finding | Change |
|---|---|---|
| 12.1 | M6 | `npm run db:seed:large` as a separate opt-in target generating tens of thousands of tickets. `npm run setup` is untouched and keeps its current seed, so the Railway and Netlify path stays exactly as it is |
| 12.2 | J1 | Monitor ID suggestions in the worker importer instead of requiring the user to invent them |
| 12.3 | C2 | Copy pass on the tiles the walkthrough called wordy |

### Phase 13. The six notes that did not reach the artifact

Six answers were cut off by a bug in the walkthrough artifact and were supplied
in full later. Five of them changed what the finding meant.

| | Finding | What the full note said | Change |
|---|---|---|---|
| 13.1 | A5 | "We can save a new worker from inside of the organzation, but from the assign worker option inside of projects we dont have the same form or options and are not able to fully create a new user the right way" | The inline create in the assign-worker picker carries the same fields as the Workers form: middle name, instance role, employer contractor, username and initial password. Username and monitor ID are issued when left empty, and the toast says what they came out as |
| 13.2 | B5 | "It works... However it would be ideal if there is also an edit button on each row so we can either click the row to enter the project dashboard or project setup if we click that button/option on the row" | Row enters the project. A button on the row goes straight to its setup |
| 13.3 | B6 | "Estimate Vs Completion (some kinda value for that), Days To Project end date, things like that if it makes sense" | Two columns on the projects list, both sortable: volume collected against the volume estimated, and days to the end date. The demo project carries a period of performance so the column means something |
| 13.4 | B8 | "We are not able to do that because a contract is part of a project" | Already answered in phase 6: contracts are instance-level, the list carries a project count, and the drawer shows every project a contract serves with its line items, documents and NTE burn across all of them. No change needed |
| 13.5 | C17 | "It is called the lifecycle... but you had it called stages" | Already renamed in phase 7 |
| 13.6 | F7 | "you correctly figured this one out" | No change |

---

## Explicitly out of scope

Recorded so nobody reopens them mid-sprint.

- **External logins for client, prime and sub** (L1, L2, L3, L5). Ryan's answer:
  "We will provide the prime, client and others with their own login… but that is
  for later." Sprint 3 at the earliest, and it needs the role model designed
  first.
- **Peer to peer sharing beyond what exists** (L2, L7, L8). "for the peer to peer
  aspect we will just leave it alone for now."
- **Automated GPS drift correction** (C1). The detection flag ships in phase 5.
  The correction against a street matrix does not.
- **Document link health checking** (I14). "As we mature this setup we will build
  out parts like this."
- **The contract PDF parser** (Sprint 1 step 6.3). Still deferred.
- **Field app changes** (D12, D13, D14, L10 through L14). Marked N/A: this pass
  was back office only.

## Standing constraints

1. `npm run setup` stays exactly as it is. Any large seed is a separate target.
2. Schema corrections fold into the baseline migration that defines the table.
   The database is rebuilt, not migrated forward.
3. Every phase leaves `npm run db:setup`, `npm run test:api` and `npm run test:ui`
   green before the next one starts.
4. No em dashes or en dashes in anything written here or in the interface.

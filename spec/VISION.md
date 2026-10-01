# Open ADMS — Vision

✅ **Approved**

> **Status: approved by the user 2026-09-29** (ADR-269), rewritten short on 2026-09-29 (through ADR-243). It says **what the finished
> system is and how it behaves**, in one read. It restates decided rules. The rules and their reasons
> live in `agent_store/SUMMARY.md` and the skills (`adms-domain` first), each step lives in
> `spec/parts/` (start at `spec/INDEX.md`), and the worked example is `spec/golden/MISSION.md`. If
> this page disagrees with them, they win: log a KD. The agent's own proposals (§6's map
> layers, §7's portal phase, §8) were approved with the page. Words follow `spec/CONVENTIONS.md`.

---

## 1. The one sentence

> **For every dollar billed, produce a GPS-stamped, photo-backed, dual-witnessed, audited record
> proving that a specific certified container or crew did specific eligible work, from a specific
> place to a specific approved site, at a specific time.** *(adms-domain §1.1)*

A chain-of-custody and billing-integrity system that happens to run in the field. Not a logistics
app, not a CRM.

**Section status:** ✅ Approved (ADR-269)

## 2. Why it exists

FEMA and USACE reimburse a jurisdiction only for debris proven eligible, measured and documented.
The hauler is paid per unit **and** reports the units. So every load is recorded as **two field
events by two monitors who cannot see each other**: the collection at the curb and the disposal at
the tower, under one ticket number the truck carries between them. **Only the server joins them**,
and flags whatever their independent facts disagree on. Everything happens offline, so every
control runs after the fact. *(adms-domain §1.1–1.2, ADR-030, 236)*

**Section status:** ✅ Approved (ADR-269)

## 3. Who uses it

A **firm** (usually a monitoring firm) installs Open ADMS in its own cloud: one organisation per
installation, open source (AGPL-3.0). *(ADR-050, 063, 099, 171)*

| Who | Gets |
|---|---|
| **Admin** (the firm's back office) | Sets up projects fast and correctly; everything else too |
| **Manager / analyst** | Dispatches, reviews, corrects, voids, QCs, locks as invoiced, as granted |
| **Field monitor** | Records what they witnessed, fast, offline, never blocked; never sees a rate or a code |
| **Client, contractor, auditor** (read-only) | Their own project's tickets and reports; any ledger row walked back to its evidence years later |

**Section status:** ✅ Approved (ADR-269)

## 4. A mission, start to finish

1. **Set up** (back office). Client → declaration event → project (program type, active window, time
   zone, ticket-number source, split loads allowed or not). Then contractors and **contracts** (a
   name, a prime, a link); **forms** with their debris types; **pay items** (the **payable type** is
   the work, each pay item a priced line of it, holding a rate per prime); disposal sites and their
   facts; the project map; **rules** (per form, naming one contract: criteria → *Add transaction #n*,
   *Remove transaction #n*, *Void ticket*). A setup check lists gaps first. *(ADR-197, 206, 215, 229,
   239)*
2. **Certify.** A container is measured once, or a crew certified unmeasured; one number is cert,
   placard and badge. Capacity follows `adms-certifications` §3A.3 exactly. A certification never
   ends on its own; tag expiry, revocation and replacement flag later tickets. *(ADR-015, 045, 079)*
3. **Dispatch.** Each phone is **enrolled** once. Each day the back office writes **assignments** on
   the **dispatch board**: who works which project, doing what, at which site. A monitor signs in on
   any enrolled phone and it takes their assignment; with none, the master passcode sets the phone up
   on the spot, marked. *(ADR-240)*
4. **Capture field events, offline.** **New**: scan the badge (the certification says whose work it
   is). **Complete**: the details (a load's **debris type**; the tower's one quantity, worked out ahead
   for its site: the **load call**, the scale weight where the paying pay items are by weight, or a
   count of the tickets a load carries), then **the number last**, scanned or shown and
   re-entered by hand, and a printed receipt. A haul-out takes its call at the TDSR; unit rate work is
   one event, the monitor picking the work by name and measuring. Forms (ROE, surveys, incidents,
   drop-off logs) are records, not events. A finished event is reopenable until the shift ends.
   *(ADR-207, 209, 213, 223, 227, 236, 240, 243)*
5. **Sync** whenever there's signal, in any order. Every event is received; the only rejection is a
   duplicate number, quarantined in full for a person. *(ADR-022, 030, 240)*
6. **Reconcile** (the worker). Group events by project + workflow + bare number. A ticket missing an
   event stays `PENDING` and **never expires**. Check the pair (certification at work time, times,
   the site's area and facts, the project boundary), attach zone and mileage, run every passing rule
   of the ticket's prime's contracts in # order, write the transactions and the completed load. Problems are **flagged, never blocked**,
   in a plain message ("Ticket 101008: debris type mismatch. Flagged for review."); review still
   bills. *(ADR-052, 053, 060, 130, 239)*
7. **Review** (one queue). A permitted person corrects any captured field in place (audited),
   renumbers real work, voids what never happened (with a reason), or accepts a flag that's right as
   it is. The ticket reprocesses: the worker draws its conclusions again. *(ADR-051, 086, 166)*
8. **QC and lock.** QC status is the back office's own mark. Only QC Approved completed loads, unit
   rate tickets and the like lock as invoiced, optionally in a named batch. A rate or rule change
   regenerates only un-invoiced tickets. *(ADR-090, 107, 121, 168, 228)*
9. **Deliver and close.** The back office assembles the client package by hand from the exports. The
   project is closed, never deleted, and any ledger row traces to its events, certification, photos,
   GPS and every audited change. *(ADR-057, 088)*

**Beside it, optional per project:** the **time clock**. Anyone with an assignment clocks in, breaks
and clocks out by hand, with simple nudges; activity is pre-filled from their field events; a
manager approves the day; hours are exported for payroll and for billing the client. Never related to
crew time. *(ADR-063, 241)*

**Section status:** ✅ Approved (ADR-269)

## 5. What it guarantees

Each gets at least one automated check.

1. **No billable load without two independent witnesses.** Unit rate work is the one-witness
   exception, by design.
2. **Field events are the evidence; everything the system writes is drawn from them**, by the
   worker only. No person authors a completed load. *(invariants 4, 21)*
3. **Nothing is lost:** no hard deletes; a regenerated transaction's old row is copied to the audit
   log first; the audit log is append-only. *(ADR-085, 097)*
4. **Every change is attributable** to a real actor, prior value kept. *(ADR-051)*
5. **The ledger is the current truth**, regenerated, never reversed. *(ADR-085)*
6. **One load bills once:** unique numbers, unique pair links, a scale receipt used once, phantoms
   voided, never renumbered. *(ADR-028, 034, invariant 17)*
7. **Money is computed on the server, deterministically**: the same events and setup always give the
   same transactions. *(ADR-130)*
8. **Offline is normal:** nothing in the working day depends on a connection. *(ADR-030)*
9. **No control is silently inert:** a rule, flag or setting that is configured actually runs.
10. **Flag, never block:** after setup nothing refuses field work or a record over eligibility.
    *(ADR-052)*

**Section status:** ✅ Approved (ADR-269)

## 6. What it deliberately is not

- Not a truck-routing or logistics system. It plans **people** (the dispatch board), never trucks.
- Not a payment, invoicing or payroll system: it records what work is worth and the hours worked,
  locks what was invoiced or approved, and exports; money moves elsewhere. *(ADR-061, 241)*
- Not a real-time validator: every control runs after the fact. *(ADR-030)*
- Not a guesser: it never infers a tandem, where debris was headed, which of two matching rules
  wins, or a missing weight. *(ADR-038, 118, 205)*
- Not a stop-work system: incidents are recorded; stopping work is decided outside it.
- Not the GIS system of record: it publishes to a client's map layers rather than replacing them
  (REQ-506).

**Section status:** ✅ Approved (ADR-269)

## 7. The finished surfaces

| Surface | What it is | Phase |
|---|---|---|
| Foundation | Architecture approved; the database enforces the rules; the scenario harness runs (`spec/ARCHITECTURE.md`) | 0 |
| Data core and engine | Setup, certifications, field events, sync intake, reconciliation, rules, ledger, audit, review, QC, lock; rebuilt in TypeScript with Prisma | 1 |
| API | Device sync and back-office endpoints, hardened (ARCHITECTURE §6) | 2 |
| Field app | Browser, then iPhone, then Android; enrolment and assignments; encrypted days of offline work; every capture; scanning; Zebra printing; the time clock | 3 |
| Back office | Setup with its check, rule builder, **dispatch board**, review queue, QC, invoice lock and batches, ledger, audit viewer, exports, time-clock approval | 4 |
| Read-only portal | Clients, contractors, auditors see their projects | 4 |
| Later features | Candidates any project may use once confirmed (daily reports, stump tables, parcels, live scales…). No USACE mode | 5 |
| Deploy | The firm's own cloud; the shipped demo is Railway + Netlify, after everything is green locally over HTTPS | 5 |

**Section status:** ✅ Approved (ADR-269)

## 8. What "done" means

Done when a full, deliberately messy mission runs through it and comes out correct:
approved part pages → acceptance scenarios (`spec/acceptance/`, `AC-…`) → a **golden mission**
(`spec/golden/`: several field days with duplicates, a preload, a phantom, a split, a tandem receipt,
late syncs, a correction and an invoice lock, with the exact statuses, review queue and ledger
**signed off by the user**) → the same scenarios passing at each layer (engine, API, apps). Progress
is "N of M scenarios passing", not boxes ticked.

**Section status:** ✅ Approved (ADR-269)

## 9. Questions

Every product question is in `spec/QUESTIONS.md`. Discovery is closed (ADR-230): agents ask only
when money, evidence or the monitor's work is at stake and nothing covers it.

---

## User review notes (2026-09-24), kept verbatim

> **§4.7 (client package):** and just to be clear this is put together manually by the back office team. the system isn't trying to generate this out of the box.
>
> **§7 (placards):** dropped placard printing from the back office. we aren't making those for whoever is using the system. they have their own already. lock this in.

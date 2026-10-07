# Open ADMS — Roadmap

> **The one page to look at to see where the build is.** From the first decision to the day people
> use it. Kept current by agents at every close-out (ADR-280): when a task, milestone or phase
> closes, its row here changes in the same response.
>
> It **summarises**; it decides nothing. The detail and the authority are `NEXT.md` (the next task),
> `BACKLOG.md` (the active phase's tasks), `REQUIREMENTS.md` / `REQUIREMENTS-LATER.md` (every
> requirement) and `spec/VISION.md` §7–§8 (the finished surfaces, and what "done" means). If this
> page disagrees with them, they win.
>
> **Last updated:** 2026-10-06 (**You opened Phase 2, API and sync (ADR-376). Its plan is written: eight milestones, 32 tasks (ADR-377); nothing of it is built yet.** Your approval mark on the names page is recorded and the last open deviation closed (ADR-378). Owed after 7 October 14:08 UTC: removing the one exception to the seven-day rule, which you have already commented out.)

**Key:** ✅ done · 🟡 in progress · ⬜ not started · 🔒 gated (doesn't open until the phase before it exits)

---

## 1. Where we are

| | |
|---|---|
| **Start** | 2026-09-25: the rebuild decision (ADR-093). Security first, the plan is the core, TypeScript end to end with Prisma, the old `database/` code is history |
| **Now** | **Phase 2, API and sync: open since 2026-10-06 at your word** (ADR-376). Task 1 of 32 is done: the plan (§3). Phase 1 met its exit the same day (ADR-371, 372): the whole product without a screen runs from a terminal, and the golden mission comes out with the numbers you approved (P1 $5,548.25 on 19 lines, P2 $324.00) |
| **Next task** | **2.1.1, the threat model and the API's scenarios** (two pages for your approval; building doesn't wait). First, after 7 October 14:08 UTC: delete the exception to the seven-day rule (ADR-372) |
| **Finish line** | A firm installs Open ADMS, and its back office and its monitors run a real mission on it: every app built, tested and working |
| **How "done" is judged** | Not boxes ticked. A deliberately messy mission (the **golden mission**) comes out with the exact statuses, review queue and ledger you signed off, at every layer: engine, then API, then the apps (`spec/VISION.md` §8) |

---

## 2. The road, start to finish

| # | Stage | When it's done, you can… | Requirements met | Status |
|---|---|---|---|---|
| — | **Design** | Read the whole product on paper: the rules, the spec, the architecture, all approved | 26 rounds of questions, ADR-001…279 | ✅ done 2026-09-29 |
| **0** | **Foundation** | Start the whole local stack with one command over HTTPS, the mileage and address servers included; watch the database itself refuse what the rules forbid; run a ticket's story from a terminal | 17 of 17 | ✅ done 2026-10-01: every task and every requirement, and committed |
| — | **The answer key** | Hold the golden mission's signed-off numbers and the acceptance scenarios that every later phase must pass | not counted in REQs | 🟡 the golden mission is approved, numbers included (2026-10-01, ADR-297: P1 $5,548.25 on 19 lines, P2 $324.00); the acceptance scenarios are written part by part, each before the code it judges (ADR-300): 9 of 9 files (review and corrections' 65 and invoicing and closeout's 31 written 2026-10-06, ADR-362; pricing, the ledger and audit's 114 written 2026-10-05, ADR-353; reconciliation's 162 written 2026-10-05, ADR-339; the counts before it: setup 82, people and devices 74, certifications 60, capture 98, sync 56; the passing counts are in `spec/acceptance/README.md`) |
| **1** | **Data core and engine** | Run a whole messy mission from a terminal, no screens, and see the right statuses, flags, ledger and audit trail come out | 93 of 98 ticked; the other 5 moved to Phases 3 and 4 with what Phase 1 built for each (ADR-371) | ✅ exit met 2026-10-06 (ADR-371, 372), 49 of 49 tasks; open since 2026-10-01 (ADR-299) |
| **2** | **API and sync** | Have phones and the back office talk to the server: sign-in, permissions, device enrolment, sync, background jobs, all hardened | 0 of 14 (three added at Phase 1's exit, ADR-371: the setup check and lookup as services, a statement timeout, the master passcode's actor and key revocation) | 🟡 open since 2026-10-06 (ADR-376); 1 of 32 tasks: the plan (ADR-377) |
| **3** | **Field app** | Hand a monitor a phone: enrol it, take the day's assignment, capture every kind of field event offline for days, scan, print, sync. Browser first, then iPhone, then Android | 0 of 29 (four carried from Phase 1, ADR-371) | 🔒 |
| **4** | **Back office and read-only portal** | Set up a project, dispatch the day, review and correct, QC, lock as invoiced, export; clients, contractors and auditors see their own projects | 0 of 19 (one carried from Phase 1, ADR-371) | 🔒 |
| **5a** | **Deploy and go-live checks** | Run it in a real cloud (the shipped demo: Railway + Netlify), passing the scenario suite and load tests, with an outside security test done | 0 of 1 (REQ-517), plus carried-forward items C25, C33, C38…C40, C48, C49 | 🔒 |
| 🏁 | **Finish line** | **A firm can install it and people use it on a real mission** | | |
| **5b** | **Later features** | Add the candidate features a project may want (daily report set, parcels, live scales, the HHW trail…), each confirmed by you first | 0 of 12 listed, 2 of them marked not planned | 🔒 after the finish line |

Phase 5 is one phase in the plan ("later features and the demo deploy"). This page shows it as two
rows, with the finish line between them, because the deploy is what makes it usable and the later
features are optional extras. That split is this page's drawing, not a change to the plan.

**No dates.** Nothing in the plan sets one, and none is guessed here. The requirement counts give
the relative size: Phase 1 is by far the largest piece.

---

## 3. Phase 2, API and sync: open

Opened 2026-10-06 at your word (ADR-376). The plan is `BACKLOG.md`'s (ADR-377). It adds no rule to
what Phase 1 built: it puts the server in front of it. The first task writes the threat model and
the scenarios the API must pass, so the answer exists before the code.

| Milestone | What it is | When it's done, you can… | Tasks | Status |
|---|---|---|---|---|
| 2.0 | Open the phase: the plan | Read every Phase 2 task, with the requirements each one meets | 1 of 1 | ✅ 2026-10-06 |
| 2.1 | The answer and the foundation | Read who could attack what and what stops them; reach the API over HTTPS on your own machine, refusing anything malformed or from a site not on its list | 0 of 4 | ⬜ next: 2.1.1 |
| 2.2 | Sign-in, sessions and permissions | Sign in to the server as an admin with an authenticator code; take a permission from someone and see their very next request refused | 0 of 6 | ⬜ |
| 2.3 | Jobs and the worker's process | Change a ticket and watch the worker pick up just that ticket by itself, with nothing asked to wait | 0 of 3 | ⬜ |
| 2.4 | The back office's endpoints | Do everything the back office does (setup, dispatch, corrections, void, QC, lock) by a request, each checked against the person's permissions; see a contractor's login read only its own tickets | 0 of 5 | ⬜ |
| 2.5 | Phones: enrolment, sign-in, the lists | Enrol a phone with the master passcode, sign a monitor in on it and have it take the day's assignment and its lists, with never a rate among them | 0 of 4 | ⬜ |
| 2.6 | Sync | Sync a phone's day: records first, photographs after, a retry answered "already saved", a duplicate held for a person, a lost phone's work received and flagged | 0 of 5 | ⬜ |
| 2.7 | Prove it | Run the golden mission through the real endpoints and get the numbers you approved; read the security checklist with a test beside each item | 0 of 4 | ⬜ |

**Phase 2's exit criteria** (`NEXT.md`; the agent's, yours to change): the golden mission through
the real endpoints and the job queue with the approved numbers; every scenario with a Phase 2 part
passing at the API; all 14 requirements ticked from real runs; the security checklist answered
item by item; every new table guarded; the whole check chain green over HTTPS; every rule and every
payload shape in one shared place.

**Scenarios with a Phase 2 part:** 48 rows in the nine approved files name Phase 2 (37 as "API
(Phase 2)"); task 2.1.1 adds a tenth file for what the architecture decides about the API itself.
None is proven at the API yet.

---

## 3a. Phase 1, Data core and engine: exit met 2026-10-06

Opened 2026-10-01 at your word (ADR-299). The plan is `BACKLOG.md`'s (ADR-300). Each milestone
starts by writing its part's acceptance scenarios, so the answer exists before the code.

| Milestone | What it is | When it's done, you can… | Tasks | Status |
|---|---|---|---|---|
| 1.0 | Open the phase: the plan | Read every Phase 1 task, with the requirements each one meets | 1 of 1 | ✅ 2026-10-01 |
| 1.1 | Setup records | See a whole project's setup in the database: client, declaration event, project, contractors and contracts, forms and debris types, pay items with a rate per prime, sites, the map, rules | 11 of 11 | ✅ 2026-10-03: every setup record is built (ADR-302…315) and the whole setup of P1 and P2 runs as a story through the API's setup services (ADR-316). Setup scenarios: 64 of 82 passing; people and devices: 35 of 74. The rest wait for the tasks that build their parts (numbering, the setup check, flags) |
| 1.2 | Certifications and capacity | Give it a container's measured boxes and get the paper form's capacity, to the cubic yard | 3 of 3 | ✅ 2026-10-03: the scenarios (ADR-317), the capacity math (ADR-320) and the certification's records with the service that certifies (ADR-321). Certification scenarios: 36 of 60 passing; the rest wait for numbering, photographs, the flags and QC |
| 1.3 | Tickets and numbers | Record every kind of field event, with numbers no two phones can share | 7 of 7 | ✅ done 2026-10-04 (ADR-332): the phones' day as a story; its scenarios are written (ADR-322); numbering is built (ADR-323); what every field event records (ADR-324), what each kind records (ADR-325), scale receipts and photographs (ADR-326) and ROEs and forms (ADR-327) are built |
| 1.4 | Sync intake with quarantine | Send a day's field events in any order; a duplicate is held in full for a person, never lost | 2 of 2 | ✅ done 2026-10-04: the 56 scenarios (1.4.1, ADR-333) and intake (1.4.2, ADR-338); 43 of the 56 pass at the engine, two in part, the rest wait for the worker and Phases 2–4 |
| 1.5 | Reconciliation | Watch tickets pair up on their number and come out pending, completed or flagged for review, each flag in the catalogue's own words | 10 of 10 | ✅ done 2026-10-05: the worker's run is built and P1's two field days reconcile as a story, unpriced (1.5.9, ADR-352); mileage is built (1.5.8, 2026-10-05, ADR-349, 350), and the example world is on the test map (1.5.8a, ADR-351); its 162 scenarios are written (1.5.1, 2026-10-05, ADR-339); the worker's records are built (1.5.2, 2026-10-05, ADR-340); grouping and status are built (1.5.3, 2026-10-05, ADR-341); the quantities are built (1.5.4, 2026-10-05, ADR-343); the flag catalogue and the checks between field events, on the certification and on times are built (1.5.5, 2026-10-05, ADR-344); nine more flags at your word (ADR-345): the checks on place are built (1.5.6, 2026-10-05, ADR-346): the checks on quantity, the pay item's settings, unit rate work and forms are built (1.5.7, 2026-10-05, ADR-347): two more flags at your word (ADR-348): 116 of 165 scenarios pass and 15 more in part; next mileage (1.5.8) |
| 1.6 | The rule engine | Have the firm's rules pick the pay items, the same way every time; see the setup check list the gaps | 4 of 4 | ✅ done 2026-10-05: its scenarios (1.6.1, ADR-353), the criteria (1.6.2, ADR-354), the passing rules turned into priced lines and flags (1.6.3, ADR-355: 83 of 114 scenarios pass, at the rules; the ledger itself is Milestone 1.7), and the setup check with what each site's phones ask for (1.6.4, ADR-357) |
| 1.7 | The ledger and audit | See every billed line, regenerated when a ticket changes, the old one kept in the audit log | 3 of 3 | ✅ done 2026-10-06: the line as a record (1.7.1, 2026-10-06, ADR-358); the engine prices every ticket and keeps the ledger current, each removed line kept in the audit log (1.7.2, 2026-10-06, ADR-359: 108 of 114 pricing scenarios pass; P1's Monday and Tuesday to the cent); what a contractor's login sees of its own tickets, and no money for a sub at your word (1.7.3, 2026-10-06, ADR-361) |
| 1.8 | Review, QC, the invoice lock and batches | Correct, renumber, void, accept a flag, QC and lock, each audited, each reprocessing the ticket | 5 of 5 | ✅ done 2026-10-06: QC, the lock as invoiced, the named batch and the unlock work end to end (1.8.5, ADR-367: 75 of the 98 review and invoicing scenarios pass; the rest are the golden mission's and the later phases'); before it: void, unvoid and accept work end to end (1.8.4, 2026-10-06, ADR-365, 366: 58 of the 98 review and invoicing scenarios pass now); before it: its acceptance scenarios are written (1.8.1, 2026-10-06, ADR-362: 65 for review, 31 for invoicing and closeout), the records a reviewer's actions are kept in are built (1.8.2, 2026-10-06, ADR-363) and corrections and renumbering work end to end (1.8.3, 2026-10-06, ADR-364: 38 of those scenarios passed then); next 1.8.5, QC, the lock and batches |
| 1.9 | The golden mission | Run the mission you approved from a terminal and get its numbers: P1 $5,548.25 on 19 lines, P2 $324.00 | 3 of 3 | ✅ done 2026-10-06 (ADR-372: the security check passes). The phase exit (1.9.3, 2026-10-06, ADR-371): every requirement ticked or moved, the old code's lessons closed, 693 scenarios proven whole; it waits only for the security fix due from 7 October. Before it: the mission runs as a story and gets those numbers (1.9.1, 2026-10-06, ADR-368); the cases it leaves out run too, and 691 of 760 scenarios are proven whole (1.9.2, 2026-10-06, ADR-369); next the phase exit (1.9.3) |

**The requirements at the phase exit (ADR-371): 93 of 98 ticked, 5 moved** to the phase that
finishes them: REQ-112b, 124c, 124f and 125c to Phase 3, REQ-124b to Phase 4 (`REQUIREMENTS.md` says
what Phase 1 built for each).

**Phase 1's exit criteria** (`NEXT.md`), all seven met: the golden mission as a story; every Phase 1 scenario
passing; all 98 requirements ticked from real runs; the old code's lessons closed; every new table
guarded and tested; the whole check chain green; every rule in one shared place.

**Scenarios** (the measure of done, `spec/VISION.md` §8; `spec/acceptance/README.md` has the table):
760 written in nine files, all approved by you (ADR-335, 374). 693 are proven whole at the engine,
15 in part (the rest of each is a later phase's), 52 belong to Phases 2–4 only.

**Test state, seen 2026-10-06:** 80 test files, 1,753 tests passing; fifteen stories pass, the golden
mission among them (27 checks); `pnpm security` 7 passed, 0 failed; 358 licences allowed.

---

## 3b. Phase 0, Foundation: done 2026-10-01

| Milestone | What it is | Tasks | Status |
|---|---|---|---|
| 0.1 | Approve the architecture, section by section; the agents' guard hook for the new layout | 6 of 6 | ✅ 2026-10-01 |
| 0.2 | Scaffold: the monorepo, the test runner, the local HTTPS stack, the installer | 4 of 4 | ✅ 2026-09-29 |
| 0.2b | Spec pages before the schema: naming, `DATA-MODEL.md`, `FLAGS.md` | 3 of 3 | ✅ 2026-10-01: all three approved (ADR-289, 290); the data model changed at your word (ADR-292…295); its thirteen points are all settled |
| 0.2c | Rewrite every skill in today's rules | all | ✅ 2026-09-29 |
| 0.3 | The database enforces the rules: roles, grants, no deletes, audit by trigger, row-level security | 4 of 4 | ✅ 2026-09-30 |
| 0.4 | Prove it end to end: scenario harness, security checks, the device and assignment models | 3 of 3 | ✅ 2026-10-01 |
| — | Closing out (ADR-282…287): the mileage and address servers in the local stack; an assignment's pay items; the requirement list | all | ✅ 2026-10-01 |

**Phase 0's exit criteria** (`NEXT.md`): all seven are met (2026-10-01, ADR-281). You opened Phase 1 the same day (ADR-299).

**Recorded test state** (2026-10-01, ADR-287, run that day): 26 test files, 317 tests passing; two
stories pass (`ticket-101001` 15 checks, `dispatch-monday` 13 checks); `pnpm security` 7 checks
passed, 0 failed (run again 2026-10-01, after you retired the old root `docker-compose.yml`, ADR-291).

**Phase 0's requirements, after the close-out (ADR-287):**

| | REQs | Where they stand |
|---|---|---|
| Ticked | 001, 002, 005, 007…014, 018…023 (17) | Met and proven by tests or by the approvals on record; 002 by your first commits, the lockfile among them (ADR-288) |
| Moved to Phase 1 | 003, 015, 017 | The shared rules package fills up as rules are built; reconciliation; the golden mission as the harness's story |
| Moved to Phase 2 | 004, 006, 016 | A schema for every API payload; every service (the API and apps too) over HTTPS; the sync's "already saved" ledger |

The moves are a default you may overturn: each of the six can only be finished by that phase's own
work, and what Phase 0 delivered for each is listed in `REQUIREMENTS.md`.

---

## 4. What each later phase holds

| Phase | The pieces, in build order | Proven by |
|---|---|---|
| **1. Data core and engine** | Setup records · certifications and capacity · tickets and numbers · sync intake with quarantine · reconciliation · the rule engine · the ledger and audit · review, QC, invoice lock and batches | The golden mission passing at the engine, from a terminal |
| **2. API and sync** (as planned, ADR-377) | The threat model and the API's scenarios · the API as a process over HTTPS, exact CORS list · sign-in, roles and permissions · reprocessing as jobs and the worker's process · the back office's endpoints wrapping the same rules (no new logic) · device enrolment and device keys · the sync endpoints · rate limits throughout | API tests; the same scenarios syncing through the real endpoints |
| **3. Field app** | Enrol once, take the assignment · encrypted offline store · collection, disposal, haul-out, unit rate and forms · scanning · Zebra printing · photos · switching monitors, sync and turn in · the time clock | Browser end-to-end tests, then on real iPhones, then Android |
| **4. Back office and portal** | Project setup with its check · contractors and contracts · certification intake · rule builder · dispatch board · one review queue and quarantine resolution · ledger, lock and batches · audit viewer · reports, exports, photo PDFs · worker administration · read-only portal | Browser end-to-end tests; the golden mission run through the screens |
| **5a. Deploy and go-live checks** | The demo deploy · monitoring and alerts · availability and backups rehearsed · an outside penetration test · how upgrades reach an installation (Q-167) · map data per region (Q-166) | The scenario suite and load tests passing in the cloud |
| **5b. Later features** | "USACE approved" flag on the load call · hazard tree workflow · Esri feature service · parcel lifecycle · live scale-house link · volume-reduction tracking · daily QC and expenditure reports · the HHW trail | Each confirmed by you before it's built |

Phase 1 by area (98 requirements; two added for split haul-outs, ADR-296): schema and data model 35 · reconciliation engine 36 · ticket
workflows 12 · ledger and audit 8 · verification 4 · carried from Phase 0, 3. **Phase 1's task-by-task milestones are
in `BACKLOG.md`** (ADR-300) and summarised in §3a: every one of the 98 is named by the task that meets it.

---

## 5. The six layers of testing

"Tested and working" means all six, each run from a terminal (`spec/ARCHITECTURE.md` §15).

| Layer | What it proves | Arrives in | Today |
|---|---|---|---|
| Unit | The shared rules: capacity math, volume, split shares, checks, pricing, time, number blocks | Phase 1 | ✅ 575 tests of the rules, none needing a database |
| Database | Every grant and every refusal; audit can't be forged or edited | Phase 0 | ✅ in place, grows with each new table |
| Scenario harness | Whole missions told as stories; exact statuses, queue and ledger | Phases 0–1 | ✅ fifteen stories, the golden mission the fourteenth (ADR-368) and what it leaves out the fifteenth (ADR-369) |
| API | Sign-in, permissions, CORS, rate limits, the sync contract | Phase 2 | ⬜ open, none written yet |
| Browser end-to-end | The web apps and the field app's browser build | Phases 3–4 | ⬜ |
| On device | iPhone, then Android: airplane mode, printing, scanning, camera, encryption, turn in | Phase 3 | ⬜ |

---

## 6. What waits on you

Nothing here blocks the next task. Each is listed with the point where it starts to matter.

| What | Why it's yours | Matters by |
|---|---|---|
| ~~Opening Phase 2~~ | ✅ Opened by you 2026-10-06 (ADR-376) | Done |
| **Phase 2's plan and exit criteria (ADR-376, 377)** | The agent wrote them, as it did Phase 1's: eight milestones, 32 tasks; the job queue built before the endpoints that use it; a threat model and a tenth scenario file written first, for your approval; read-only requests that only a screen needs left to Phase 4. Yours to change | Any time; building doesn't wait |
| **Your approval of the names page, as the agent read it (ADR-378)** | You marked `spec/CONVENTIONS.md` "Approved" at its top. The agent read that as the whole page, its last section included (what the earlier conventions draft gets wrong), and closed the one open deviation (KD-63). Say so if you meant less | Any time |
| **Three requirements the agent added to Phase 2 (ADR-371)**, each now named by a task (2.4.1, 2.1.4, 2.5.1 and 2.6.5) | Work the build notes had left for Phase 2 without a requirement of its own: the setup check and a site's lookup as services; a time limit on each service's database statements; who is recorded for an act under the master passcode, and refusing a lost phone's key once it is wiped. None changes a rule | When you open Phase 2 |
| **Whether *photos required* should take a number** (asked 2026-10-05, ADR-345) | Today a pay item's *photos required* is yes or no, meaning at least one. Your example spoke of a ticket that requires 4. If you want a firm to set a number, it is a new pay item setting; if "at least one" is enough, nothing changes. Nothing waits on it |
| **Removing the one exception to the seven-day rule** (ADR-372) | The security fix was let in early by name, at your word; the exception is deleted once the fix is seven days old. You said "will do later" (2026-10-06), then commented the entry out yourself. Until 14:08 UTC on 7 October an install fails with it commented out (seen); after that it passes, and the next task deletes the lines for good | From 7 October 14:08 UTC |
| **The agent's details on what a contractor's login sees (ADR-361)** | You decided the money: a sub's login sees none. The rest is the agent's, yours to change: a contractor's login sees no flag on its tickets, no monitor's name, no ROE and no form; a first-tier sub above a second-tier sub sees the ticket but not its priced lines; where a load's two ends scanned badges of two different contractors, each sees its own end; every login given a project reads all its pay items' codes and descriptions, site names and debris type names. Five new scenarios, AC-02-78…82 in `spec/acceptance/02-people-and-devices.md`, wait for your approval | Before the read-only portal, Phase 4 |
| ~~A ticket waiting on a negotiated rate (KD-72)~~ | ✅ Settled 2026-10-06 (ADR-373): it sits in the review queue like any flagged ticket until someone accepts the flag, as built | Done |
| ~~The defaults of corrections and renumbering (ADR-364)~~ | ✅ Approved by you 2026-10-06 (ADR-374) | Done |
| ~~The defaults of the reviewer's records (ADR-363)~~ | ✅ Approved by you 2026-10-06 (ADR-374) | Done |
| ~~Approving the review and invoicing scenarios (ADR-362)~~ | ✅ Approved by you 2026-10-06 (ADR-374) | Done |
| ~~The defaults of QC, the lock and the unlock (ADR-367)~~ | ✅ Approved by you 2026-10-06 (ADR-374) | Done |
| ~~The defaults of void, unvoid and accept (ADR-365)~~ | ✅ Approved 2026-10-06, with your rule that unvoiding anything always leaves an audit record: built the same day (ADR-366) | Done |
| ~~Approving `spec/acceptance/06-reconciliation.md` (and 07, the pricing scenarios)~~ | ✅ Approved by you 2026-10-06 (ADR-374) | Done |
| Commit each response's changes | Agents don't write to git; every file-changing response ends with a block for you to run. The history began 2026-10-01 (nine commits on `phase0-foundation`, ADR-288) | After each response, so no work sits uncommitted (tasks 1.8.4…1.9.3 and the 2026-10-06 housekeeping were waiting on 2026-10-06; one script commits them) |
| A `main` branch and a remote | The history lives on one branch on this machine only; where it is pushed and what the default branch is are your call | Before anyone else needs the code, and as the only copy's backup |
| The agent's details on five of your answers | An ROE's scope (debris types and unit rate payable types; no picks, no check); helpers stored one row each; a flag naming the line it is about; a survey number not forced to be unique; a haul-out pile told apart by its debris type and field tag, with a flag when a pile's load call isn't higher than the one before. Each is yours to overturn (`spec/DATA-MODEL.md` §12, 17–21) | Before Phase 1 builds those records: certifications in milestone 1.2, ROEs and surveys in 1.3, flags and haul-outs in 1.5 |
| The agent's details on a new project (ADR-303) | (The time clock being switched off on a new project, so workers aren't offered it until you switch it on, is confirmed by you, ADR-304.) The built-in defaults (5 and 95, 200 m, 31 in) live in one committed file the system reads, and whether your installation may change them for every new project, not only project by project, is still open; a window can't end before it starts; a kind of unit rate work is taken off a project by archiving it | Any time; building doesn't wait |
| The agent's details on contractors and contracts (ADR-305) | The database itself, not only the setup screen, refuses a contract whose prime isn't one of the project's primes, and a sub placed under anyone but one of them. Whoever adds a contractor must say its kind (no kind is assumed). A contract's changes are filed with the billing changes in the audit log. You saw these and said "the rest of this is good to go" (ADR-306); each is still yours to change. ~~Whether a contractor should hold contact details~~ ✅ answered 2026-10-02: it does. The agent's details on your answer: the same three fields a client has (contact name, email, phone), each optional, with no check of how an email or a phone number is written | Any time |
| The agent's details on the capacity math (ADR-320) | A measurement of zero, or one left blank, gives no capacity and names the box, instead of being read as nought; so do boxes that subtract as much as the primary box holds. Every single operation counts as "a step" for the hundredths rounding (it can only change a round bottom, a radius corner and the final ÷ 46,656). The measured boxes given to the example world's three containers (65, 48 and 110 CY) are made up | Before certifying is built on the phone (Phase 3); task 1.2.3 builds on them |
| The agent's details on certifications (ADR-321) | A sub typed at certification whose name is already placed elsewhere on the project (another prime's sub, or the other tier) is saved as a separate contractor of that name, with a warning, never refused and never moved. A new sub starts as a hauler on a container, a crew on a crew. A merge moves the duplicate's certifications to the kept contractor, and is refused where the two are placed differently on one project. "Replaced on" is the day the new certification was made, and a certification is replaced once. A container that works out to 0 CY is saved. Nothing checks that the certifying monitor's assignment includes certifying. A contractor user sees no certification yet | Any time; say which to change |
| ~~Say when Phase 1 opens~~ | ✅ Done 2026-10-01 (ADR-299) | |
| ~~The acceptance scenarios, as they're written~~ | ✅ All nine files approved (01…05, ADR-335; 06…09, 2026-10-06, ADR-374) | Done |
| ~~Sign off the golden mission's numbers~~ | ✅ Done 2026-10-01 (ADR-297): you approved the mission with its split haul-out weighed. What the agent added to P1's setup to tell it that way is yours to change: a second landfill with a scale house (Cypress Creek), a per-ton mulch haul-out pay item at a made-up $20.00, two haul-out rules that pick by where it's dumped, and a sixth monitor | Any time; a change to an approved number is recorded as a decision |
| The map region for examples | The local stack's built-in map extract is Delaware (small, dated), standing in for the made-up Bayline County (ADR-282). Florida's needs more disk than Docker has on this machine (8 GB) | Before the golden mission's GPS points are picked |
| Approve the ADR-240 notes in ARCHITECTURE §7–§10 | The approved sections were updated to "enrol once, assignment daily" | Any time; building doesn't wait |
| Pick the accessibility standard | Public clients ask for one in procurement (C41) | Before the first screen, Phase 3 |
| Approve a security policy file | How a vulnerability is reported and fixed (C40) | Before the repository is public |

---

## 7. Keeping this page true

| When | Change here |
|---|---|
| A task closes | §3's task count and "next" |
| A milestone or phase closes | Its row's status in §2 and §3; the test state |
| A phase opens | Add its milestone table (like §3), from `BACKLOG.md`; the phase before it keeps its table under it |
| A scenario file is written, or scenarios pass | §3's "Scenarios passing" line and the answer key's row in §2 |
| Requirements are ticked | The counts in §2 |
| Something new waits on the user, or stops waiting | §6 |

Always change the "Last updated" line. Never add a date estimate the user didn't give.

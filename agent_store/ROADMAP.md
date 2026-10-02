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
> **Last updated:** 2026-10-01 (split haul-outs given their two requirements; the golden mission approved, with its split haul-out weighed; a haul-out leaves only a TDSR) · counts read from the files that day · newest decision: ADR-298.

**Key:** ✅ done · 🟡 in progress · ⬜ not started · 🔒 gated (doesn't open until the phase before it exits)

---

## 1. Where we are

| | |
|---|---|
| **Start** | 2026-09-25: the rebuild decision (ADR-093). Security first, the plan is the core, TypeScript end to end with Prisma, the old `database/` code is history |
| **Now** | **Phase 0, Foundation: every task is done** (ADR-282…287) and its seven exit criteria are met. All 17 of its requirements are ticked; the last (REQ-002) with your first commits (ADR-288). You approved the data model and the flag catalogue the same day (ADR-289, 290). No product code exists yet; everything built so far is the ground the product stands on. Opening Phase 1 is your call (§6) |
| **Next task** | None until you open Phase 1. Nothing else waits on you for Phase 0 |
| **Finish line** | A firm installs Open ADMS, and its back office and its monitors run a real mission on it: every app built, tested and working |
| **How "done" is judged** | Not boxes ticked. A deliberately messy mission (the **golden mission**) comes out with the exact statuses, review queue and ledger you signed off, at every layer: engine, then API, then the apps (`spec/VISION.md` §8) |

---

## 2. The road, start to finish

| # | Stage | When it's done, you can… | Requirements met | Status |
|---|---|---|---|---|
| — | **Design** | Read the whole product on paper: the rules, the spec, the architecture, all approved | 26 rounds of questions, ADR-001…279 | ✅ done 2026-09-29 |
| **0** | **Foundation** | Start the whole local stack with one command over HTTPS, the mileage and address servers included; watch the database itself refuse what the rules forbid; run a ticket's story from a terminal | 17 of 17 | ✅ done 2026-10-01: every task and every requirement, and committed; opening Phase 1 is your call (§6) |
| — | **The answer key** | Hold the golden mission's signed-off numbers and the acceptance scenarios that every later phase must pass | not counted in REQs | 🟡 the golden mission is approved, numbers included (2026-10-01, ADR-297: P1 $5,548.25 on 19 lines, P2 $324.00); the acceptance scenarios aren't written yet |
| **1** | **Data core and engine** | Run a whole messy mission from a terminal, no screens, and see the right statuses, flags, ledger and audit trail come out | 0 of 98 | 🔒 |
| **2** | **API and sync** | Have phones and the back office talk to the server: sign-in, permissions, device enrolment, sync, background jobs, all hardened | 0 of 11 | 🔒 |
| **3** | **Field app** | Hand a monitor a phone: enrol it, take the day's assignment, capture every kind of field event offline for days, scan, print, sync. Browser first, then iPhone, then Android | 0 of 25 | 🔒 |
| **4** | **Back office and read-only portal** | Set up a project, dispatch the day, review and correct, QC, lock as invoiced, export; clients, contractors and auditors see their own projects | 0 of 18 | 🔒 |
| **5a** | **Deploy and go-live checks** | Run it in a real cloud (the shipped demo: Railway + Netlify), passing the scenario suite and load tests, with an outside security test done | 0 of 1 (REQ-517), plus carried-forward items C25, C33, C38…C40, C48, C49 | 🔒 |
| 🏁 | **Finish line** | **A firm can install it and people use it on a real mission** | | |
| **5b** | **Later features** | Add the candidate features a project may want (daily report set, parcels, live scales, the HHW trail…), each confirmed by you first | 0 of 12 listed, 2 of them marked not planned | 🔒 after the finish line |

Phase 5 is one phase in the plan ("later features and the demo deploy"). This page shows it as two
rows, with the finish line between them, because the deploy is what makes it usable and the later
features are optional extras. That split is this page's drawing, not a change to the plan.

**No dates.** Nothing in the plan sets one, and none is guessed here. The requirement counts give
the relative size: Phase 1 is by far the largest piece.

---

## 3. Phase 0, Foundation: the active phase

| Milestone | What it is | Tasks | Status |
|---|---|---|---|
| 0.1 | Approve the architecture, section by section; the agents' guard hook for the new layout | 6 of 6 | ✅ 2026-10-01 |
| 0.2 | Scaffold: the monorepo, the test runner, the local HTTPS stack, the installer | 4 of 4 | ✅ 2026-09-29 |
| 0.2b | Spec pages before the schema: naming, `DATA-MODEL.md`, `FLAGS.md` | 3 of 3 | ✅ 2026-10-01: all three approved (ADR-289, 290); the data model changed at your word (ADR-292…295); its thirteen points are all settled |
| 0.2c | Rewrite every skill in today's rules | all | ✅ 2026-09-29 |
| 0.3 | The database enforces the rules: roles, grants, no deletes, audit by trigger, row-level security | 4 of 4 | ✅ 2026-09-30 |
| 0.4 | Prove it end to end: scenario harness, security checks, the device and assignment models | 3 of 3 | ✅ 2026-10-01 |
| — | Closing out (ADR-282…287): the mileage and address servers in the local stack; an assignment's pay items; the requirement list | all | ✅ 2026-10-01 |

**Phase 0's exit criteria** (`NEXT.md`): all seven are met (2026-10-01, ADR-281). Phase 1 opens when you say so.

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
| **2. API and sync** | The API wrapping the same rules (no new logic) · sign-in, roles and permissions · device enrolment and device keys · the sync endpoints · reprocessing as jobs · HTTPS, exact CORS list, rate limits | API tests; the same scenarios syncing through the real endpoints |
| **3. Field app** | Enrol once, take the assignment · encrypted offline store · collection, disposal, haul-out, unit rate and forms · scanning · Zebra printing · photos · switching monitors, sync and turn in · the time clock | Browser end-to-end tests, then on real iPhones, then Android |
| **4. Back office and portal** | Project setup with its check · contractors and contracts · certification intake · rule builder · dispatch board · one review queue and quarantine resolution · ledger, lock and batches · audit viewer · reports, exports, photo PDFs · worker administration · read-only portal | Browser end-to-end tests; the golden mission run through the screens |
| **5a. Deploy and go-live checks** | The demo deploy · monitoring and alerts · availability and backups rehearsed · an outside penetration test · how upgrades reach an installation (Q-167) · map data per region (Q-166) | The scenario suite and load tests passing in the cloud |
| **5b. Later features** | "USACE approved" flag on the load call · hazard tree workflow · Esri feature service · parcel lifecycle · live scale-house link · volume-reduction tracking · daily QC and expenditure reports · the HHW trail | Each confirmed by you before it's built |

Phase 1 by area (98 requirements; two added for split haul-outs, ADR-296): schema and data model 35 · reconciliation engine 36 · ticket
workflows 12 · ledger and audit 8 · verification 4 · carried from Phase 0, 3. **Phase 1's task-by-task milestones aren't
written yet**: `BACKLOG.md` holds only the active phase, and gets Phase 1's when Phase 0 exits.

---

## 5. The six layers of testing

"Tested and working" means all six, each run from a terminal (`spec/ARCHITECTURE.md` §15).

| Layer | What it proves | Arrives in | Today |
|---|---|---|---|
| Unit | The shared rules: capacity math, volume, split shares, time, number blocks | Phase 1 | 🟡 runner wired, first tests only |
| Database | Every grant and every refusal; audit can't be forged or edited | Phase 0 | ✅ in place, grows with each new table |
| Scenario harness | Whole missions told as stories; exact statuses, queue and ledger | Phases 0–1 | 🟡 harness runs two small stories (ticket 101001; Monday's dispatch, with a unit rate monitor's pay items); the golden mission is Phase 1's |
| API | Sign-in, permissions, CORS, rate limits, the sync contract | Phase 2 | ⬜ |
| Browser end-to-end | The web apps and the field app's browser build | Phases 3–4 | ⬜ |
| On device | iPhone, then Android: airplane mode, printing, scanning, camera, encryption, turn in | Phase 3 | ⬜ |

---

## 6. What waits on you

Nothing here blocks the next task. Each is listed with the point where it starts to matter.

| What | Why it's yours | Matters by |
|---|---|---|
| Commit each response's changes | Agents don't write to git; every file-changing response ends with a block for you to run. The history began 2026-10-01 (nine commits on `phase0-foundation`, ADR-288) | After each response, so no work sits uncommitted |
| A `main` branch and a remote | The history lives on one branch on this machine only; where it is pushed and what the default branch is are your call | Before anyone else needs the code, and as the only copy's backup |
| The agent's details on five of your answers | An ROE's scope (debris types and unit rate payable types; no picks, no check); helpers stored one row each; a flag naming the line it is about; a survey number not forced to be unique; a haul-out pile told apart by its debris type and field tag, with a flag when a pile's load call isn't higher than the one before. Each is yours to overturn (`spec/DATA-MODEL.md` §12, 17–21) | Before Phase 1 builds those records |
| **Say when Phase 1 opens** | Phase 0's tasks are done; the phase gate is yours | Whenever you choose: nothing in Phase 0 is waiting |
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
| A phase opens | Add its milestone table (like §3), from `BACKLOG.md` |
| Requirements are ticked | The counts in §2 |
| Something new waits on the user, or stops waiting | §6 |

Always change the "Last updated" line. Never add a date estimate the user didn't give.

# Open ADMS — Next

> **This file defines the immediate scope of work.** If asked for something outside this phase,
> say which phase it belongs to and ask before proceeding. Keep the Next Atomic Task pointer at
> the bottom accurate. Milestone detail lives in `agent_store/BACKLOG.md`.


## Active Phase — `PHASE 2: API AND SYNC` *(opened by the user 2026-10-06, ADR-376)*

**User, 2026-10-06:** "phase 2 is open, begin working on the next task".

**What it is.** The server in front of what Phase 1 built: the API as a running process over HTTPS,
sign-in and permissions, a phone's enrolment and its proof of itself, the sync endpoints, and
reconciliation as queued jobs drained by the worker's own process. **It adds no rule: it wraps,
signs in, queues and hardens.**

**Objective.** The golden mission syncs through the real endpoints, is reconciled by queued jobs,
and comes out with the numbers the user approved (`spec/golden/MISSION.md`, ADR-297).

**The plan.** `BACKLOG.md`, "Active — Phase 2": eight milestones, 32 tasks, **one task per
response** (ADR-377). Read its brief before any task.

**Scope boundary.**
- **In:** `apps/api` (the process, endpoints, sign-in), `apps/worker` (the process, the queue),
  `packages/contracts` (every payload), `packages/db` (sign-in's, the queue's and sync's records,
  their guards and tests), `packages/domain` (password rules and any rule a task's ADR records),
  `packages/scenarios`, `infra/local` (the API behind Caddy), `tools/` (the installer, the security
  checks), `spec/acceptance/`, `spec/THREAT-MODEL.md`.
- **Not Phase 2's:** any screen, the phone's own store, real secure hardware, printing and scanning
  (Phase 3); the back office's and the portal's pages, exports, the time clock's tables (Phases
  3–4); the demo deploy, cloud TLS, pgAudit, the outside penetration test (Phase 5a). Say which
  phase and ask; never widen silently.
- `development/` stays read-only reference.

**Environment.** Node 24 through fnm (`eval "$(fnm env --shell zsh)"` first), pnpm 11, TypeScript
6.0.3, Prisma 7.10.0, Postgres 18.6 in the local stack (`pnpm local:up`; stopped at every close-out).

---

## Exit criteria for Phase 2 *(ADR-376; agent default, the user may change them)*

All observed and reported, not assumed:

1. **The golden mission syncs through the real endpoints and is reconciled by queued jobs**, with
   the exact statuses, review queue, ledger (P1 $5,548.25 on 19 lines; P2 $324.00) and audit rows
   the user approved; every other story still passes.
2. **Every acceptance scenario with a Phase 2 part passes at the API**, reported as N of M.
3. **All 14 Phase 2 REQs** ticked from runs that were seen, or re-filed with an ADR.
4. **The security checklist for this layer** (ARCHITECTURE §16: OWASP ASVS Level 2, API Security
   Top 10, NIST SP 800-63B): each item answered by a named test or by the phase that owns it; the
   threat model written; `pnpm security` passing.
5. **The database still enforces the rules:** every new table guarded, every grant and refusal
   tested, `guard_gaps()` empty, each service login under a statement timeout.
6. **The chain is green** with real counts (typecheck, lint, licences, tests, stories), and the
   API is reached only over HTTPS through Caddy.
7. **Rules and shapes live once:** no rule outside `packages/domain`, no payload shape outside
   `packages/contracts`, only `packages/db` and the two server apps reaching Postgres.

Only then is **Phase 3 (the field app)** offered to the user to open.

---

## Phases 0 and 1 and the spec track: done *(the record moved 2026-10-02, ADR-307, and 2026-10-06, ADR-375)*

**Phase 1 (data core and engine) met its seven exit criteria on 2026-10-06** (ADR-371, 372): 49
tasks, 93 of 98 REQs ticked and 5 moved to Phases 3 and 4; the user opened Phase 2 the same day
(ADR-376). Its task-by-task record is in `DECISIONS.md`'s scratchpad, "Moved 2026-10-06 (ADR-375)".


**Phase 0 (Foundation) closed on 2026-10-01** with its seven exit criteria met and all 17 of its
REQs ticked (ADR-281…288); the user opened Phase 1 the same day (ADR-299). **Every spec page is
approved:** `ARCHITECTURE.md` (ADR-104…144), `VISION.md`, `INDEX.md`, the part pages, `LISTS.md`,
`RATE-SHEET.md` and `RULES.md` (ADR-269), `DATA-MODEL.md` and `FLAGS.md` (ADR-289, 290; KD-65's
thirteen points settled, ADR-292…295), the golden mission and its numbers (ADR-297). Their full
record (why Phase 0 existed, its exit criteria and how each was met, the spec track and the 26
question rounds) moved word for word to `DECISIONS.md`'s scratchpad, "Moved from NEXT.md,
2026-10-02"; `ROADMAP.md` §3b keeps the table.

**Still live from the spec track:** nothing. All nine acceptance files are approved by the user
(01…05 by ADR-335; 06…09 on 2026-10-06, ADR-374). Their count is `spec/acceptance/README.md`'s
table: 760 scenarios, 693 proven whole at the engine, 15 in part, 52 for Phases 2–4.

---

## 🔁 Handoff — read this first in a new session (rewritten 2026-09-28, ADR-225; updated 2026-10-02)

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and what is still to be asked**. What is
true now, topic by topic, is `SUMMARY.md`; the round-by-round history is the session log at the end
of `DECISIONS.md`.

### Where things stand (2026-10-09, through ADR-450)
- **Phase 2 (API and sync) is open (ADR-376): 20 of its 32 tasks are done** (`BACKLOG.md`,
  "Active — Phase 2", ticks each with its ADRs). Complete: Milestone 2.1 (the API as a process,
  the boundary, time limits and policy), 2.2 (sign-in: its records, passwords, sessions, two-step
  sign-in, permissions and people, rate limits), 2.3 (the job queue, the worker as a process, what
  queues work) and 2.4 (the services behind endpoints: setup, dispatch and phones, review and
  certifications, the read-only viewer's path). Of 2.5 (phones): 2.5.1 (enrolment and a phone's
  proof of itself, ADR-436…440) and 2.5.2 (monitors on phones: created, signed in, and the
  assignment a phone takes, ADR-441…444) are done; **2.5.3 (the lists a phone takes) is cut in five (ADR-449) and its part 1 is done
  (ADR-450)**; its part 2 is next.
- **Where each thing is written, so nothing is read twice:** a rule as it stands, with its ADR:
  `SUMMARY.md`, by topic (grep its `###` headings; never read it whole). What a finished task left
  for a later one: `BACKLOG.md`'s carry-forward register (C85…C116). How a layer's tests are
  written and what a loosening is tried on: the page for that layer beside the `adms-verify`
  skill. Today's counts: `agent_store/CHAIN.md`. **The task-by-task record that stood here
  (2.0.1 to 2.5.2, every endpoint and service named) moved word for word to `DECISIONS.md`'s
  scratchpad, "Moved 2026-10-09 (ADR-445)"**: grep it for a task's number when you need its detail.
- **The user's word (ADR-401): sign-in follows NIST SP 800-63B and ASVS Level 2; when a direction
  in security is suggested, say what the standard asks before building it** (ADR-400 was built
  first and withdrawn).
- **What runs.** The API (NestJS 12.1.2 on Fastify 5.12.5) is the local stack's seventh service,
  reached only at `https://api.adms.localhost` through Caddy; the worker is the eighth, draining
  the job queue. **Every endpoint is defined in `packages/contracts` and served through `@Serves`;
  it says who may call it (`access`, `roles`, one `permission`), asked by `Admission` before the
  schemas read anything** (BACKLOG C86 is the recipe for adding one; `pnpm openapi` after).
  Each service login is under a statement timeout; an installation may state its own value for
  any policy value. `spec/acceptance/10-api-and-sync.md` and `spec/THREAT-MODEL.md` are approved
  by the user (ADR-386, 393). Phase 2's 14 REQs are in `REQUIREMENTS.md`, two ticked (REQ-201, 208).
- **Phones today (what 2.5.3 builds on).** A phone enrols under the master passcode (`POST
  /phones/enrolments`), proves itself by signing a challenge and gets a fifteen-minute token
  (`access: 'PROVEN_PHONE'`, read with `phoneOf(request)`); a monitor is created on it under the
  master passcode and signs in with Monitor ID and password (`access: 'MONITOR_ON_PHONE'`: the
  phone's token and `x-adms-monitor-session`, read with `monitorOf(request)`); the sign-in's own
  answer carries the assignment the phone takes, or `noAssignment`; **the phone reads its lists by
  `GET /phones/current/lists`** (`PhoneLists`, `apps/api/src/phone/phone-lists.ts`: the sign-in's rule
  asked again, then that assignment's lists; part 1's lists only). What is written under the
  master passcode names its own actor (`underMasterPasscode`), a proof's the device key's
  (`byDeviceKey`). The code is `apps/api/src/phone/`. **No story and no test writes a phone or a
  monitor by hand:** a story uses `story.enrolled`, `story.proofs`, `story.monitor`,
  `story.signedIn`, `taken` (`stories/board.ts`) and `story.lists.held` for a phone's lists; an API test `enrolledPhone`, `proven`
  (`test/support/phones.ts`), `created` and `signedIn` (`phone-sign-ins.test.ts`).
- **This machine's installation holds no person but the seed's three actors:** `pnpm
  local:accounts` and `pnpm installer:admin` have not been run for real here.
- **A test of the API that must write** runs in one piece of work on the installation's database,
  undone afterwards (`apps/api/test/support/database.ts`), and may hand the process its own
  database, mail and clock (ADR-405). **A test of a signed-in endpoint** uses
  `apps/api/test/support/served.ts`: `worldOn` gives Dana and Luis a password and an
  authenticator, and `served.signedIn(email, password)` sends the code their app shows (a code
  is good once, so a second sign-in in one step moves the test's clock on thirty seconds).
  **The API's test files run one at a time** (ADR-415): the database keeps two who sign in
  from one address, and every test's world has Dana's. A test that archives Dana gives the
  firm another admin first; what needs a firm with no admin is a story (`first-admin`).
  **A test's requests come from `served.from`** (ADR-416): one that makes more than four wrong
  tries at one login moves it, and one that needs other limits hands `worldOn` a policy from
  `installationPolicy({ … })`.
- **Phase 1 is done:** all seven exit criteria met (ADR-371, 372); 693 of the 708 scenarios with a
  Phase 1 part proven whole, 15 in part. 48 scenario rows name Phase 2 (37 as "API (Phase 2)").
- **The chain** was seen whole on 2026-10-09 after the housekeeping (ADR-445…448). Its counts
  are `agent_store/CHAIN.md`'s; what each command proves is `adms-verify`'s. **Start with `pnpm
  ready`**; the stories run once, in `pnpm scenarios`; run `pnpm security` after `pnpm test`.
- **What exists:** `packages/db` (schema, guards, tests), `packages/domain` (every rule; one
  dependency, no database), `packages/contracts`, `packages/scenarios` (the harness and stories,
  the golden mission among them), `apps/worker/src/` (`reconciliation/`, the run: group, check,
  price, write, and the waiting jobs it takes up; `process/` and `main.ts`, the process that
  drains the queue), `apps/api/src/` (the service classes: setup,
  certifications, numbering, intake, review; and `process/` with `main.ts`, the HTTP process with
  a health answer, the boundary, the headers and the API's database client: no endpoint of the
  services, no sign-in), `tools/`, `infra/local`.
- **Open deviations:** none. KD-63 closed when the user marked `spec/CONVENTIONS.md` approved
  (ADR-378). KD-30 is re-filed to Phase 5 (REQ-518).
- **After a change to `apps/api` or `apps/worker`, `pnpm local:up` again** before the chain: each
  container runs what was built when it started, and `apps/api/test/door.test.ts` and
  `apps/worker/test/container.test.ts` ask those containers (BACKLOG C85, C95). Docker Desktop may be closed at the start of a session: `open -a Docker`, and
  quit it at close-out if you opened it.

### The model as it stands now (today's words; `SUMMARY.md` has each rule and its ADR)
The firm's setup decides how things play out (ADR-197), and there are **two sides** (ADR-224): the
monitor enters only the main ticket, the system and the back office do the rest.
- **Setup:** client → declaration event → project; contractors and **contracts** (name, prime,
  link); **forms** with their **debris types**, named as the contract names the work (ADR-211, 214);
  **pay items** (a code unique on the project, a description, **payable type** = the work, Unit of
  Measure, size band, capture settings, **a rate per prime**; ADR-206, 207, 221, 237, 301); **sites** (site type + Takes loads ·
  Haul-outs leave here · Charges a tipping fee · Ineligible site; ADR-215, 222); field tags; the
  project map; **rules** per form, **naming one contract** and running only on its prime's tickets:
  criteria → *Add / Remove transaction #n*, *Void ticket* (ADR-109, 130, 239).
- **Phones and people:** a phone is **enrolled** once; the back office's **dispatch board** gives
  each person a daily **assignment** (project, work, one site where the work is at one); the phone
  takes it at sign-in; setup by master passcode is the fallback; phones sync whenever there's signal
  (ADR-240). The optional **time clock** hangs on the assignment (ADR-241).
- **Field:** each monitor records a **field event** (`COL` `DIS` · `HOC` `HOD` · `URT`; ADR-236).
  **Badge first, number last** (ADR-209). Picks **by name, never a code**: a load's debris type at
  both ends; a unit rate payable type, and the phone works out the pay item from its band (ADR-207,
  213, 217). One quantity: a load call, or a scale weight when the paying pay item is by weight
  (ADR-223).
- **Engine:** groups field events on project + workflow + bare number; flags, never blocks;
  attaches zone and mileage; runs every passing rule in # order (creates, deletes, voids); writes the
  completed load and the transactions (regenerated, each removed row copied to audit first); checks
  where debris went against the site's facts.
- **Back office:** sees everything, corrects in place (audited), accepts flags, voids with a reason,
  reprocesses; QC status is separate; only QC Approved records lock as invoiced, optionally in a named
  **invoice batch**; the client package is assembled by hand from exports; one review queue; a setup
  check; the pay item screen writes its own rules (ADR-228, 229).

### Where it ends up
Done is proven, not ticked (`spec/VISION.md` §8, approved, ADR-269): approved part pages →
**acceptance scenarios** (`spec/acceptance/`, `AC-…`) → a **golden mission** (`spec/golden/`: several
messy field days, with the exact statuses, review queue and ledger **signed off by the user**) →
the same scenarios passing at each layer (engine, API, apps). The finished surfaces are `VISION.md` §7.

### The road to done
**The user's one-page view of this, with every phase's status: `agent_store/ROADMAP.md`** (ADR-280).
Update it at close-out when a task, milestone or phase closes.

| # | Step | What it produces | Needs first |
|---|---|---|---|
| 1 | **Phase 0 scaffold** (BACKLOG 0.2.1 → 0.2.4) ✅ done (ADR-255…266) | Monorepo with pinned dependencies (AGPL-3.0-compatible), domain and contracts packages with tests, local HTTPS stack, installer | Node 24 LTS on the machine |
| 2 | **Naming pass ✅ (`spec/CONVENTIONS.md`, ADR-234) → `DATA-MODEL.md` → `FLAGS.md`** (BACKLOG 0.2b) ✅ both drafted and **approved 2026-10-01** (ADR-284, 285, 289, 290); DATA-MODEL's thirteen points settled (KD-65 closed, ADR-292…295) | Every record, field, criterion, status and export column named; the schema on paper; every flag's code, trigger, message, still-bills and accept rule; the user may overturn any name | Can run beside step 1 |
| 3 | **Database hardening** (BACKLOG 0.3) ✅ done (ADR-267, 268, 270…273) | Roles, grants, no deletes, audit triggers, insert-only audit, transaction copy-to-audit, row-level security, each proven by tests | Step 1; minimal provisional models |
| 4 | **Prove it** (BACKLOG 0.4) ✅ done 2026-10-01 (ADR-275, 276, 281) | Scenario harness with one trivial story; security checks in the test run; time zone, device, Monitor ID models | Steps 1, 3 |
| 5 | **Truth-up the docs** ✅ done 2026-09-29 (ADR-247…253; KD-33, 58, 61, 62 closed) | `RATE-SHEET.md`, `RULES.md`, `LISTS.md`, parts 01/04/06/07 and the skills rewritten to today's rules, one per response (ADR-138) | Before step 7's engine work |
| 6 | **Acceptance scenarios + golden mission** ✅ the mission is approved (ADR-297) and runs as a story (ADR-368); the nine scenario files are written and approved (ADR-335, 374) | `spec/acceptance/`, `spec/golden/` with the user's signed-off numbers | Steps 2, 5 |
| 7 | **Phase 1: data core + engine, rebuilt** ✅ exit met 2026-10-06 (ADR-371, 372); opened 2026-10-01 (ADR-299); its tasks are ticked in `BACKLOG.md` | Setup records, certifications and capacity, tickets and numbers, sync intake with quarantine, reconciliation, the rule engine, the ledger and audit, review, QC, invoice lock and batches; KD-01, 04, 05, 10, 12, 13, 15, 55, 56 closed; the golden mission passing at the engine | Steps 3–6 |
| 8 | **Phases 2–5**: **Phase 2 open since 2026-10-06 (ADR-376)**, its plan in `BACKLOG.md` (ADR-377) | API and sync → field app (browser, iPhone, Android) → back office (setup screens with the setup check, rule builder, review queue, exports, viewers) → later features and the demo deploy | Each phase's REQs refreshed before it opens |

### What is still to be asked (so nothing is guessed later)
- **Nothing is open** (ADR-230). New questions only under the shot-clock rule above.
- **Agent defaults the user may overturn:** listed in `SUMMARY.md` §4.
- **Later phases, not asked now:** the HHW trail (KD-30, REQ-518); the time clock's screens
  (rules settled, ADR-241); which phase the read-only portal lands in (`VISION.md` §7); each Phase 5
  candidate; `RULES.md` §7 "Is valid"; whether to keep hand re-entry of the ticket number (ADR-209)
  when the field app is built.
- **Approvals as part of later steps:** none left for the spec pages (`DATA-MODEL.md` and
  `FLAGS.md` are approved, ADR-289, 290; the golden mission and its numbers, ADR-297; `spec/CONVENTIONS.md`, ADR-378; `spec/acceptance/10-api-and-sync.md`, ADR-386; `spec/THREAT-MODEL.md`, ADR-393).
- **Ours, not the user's:** design tasks Q-166 (regional map data) and Q-167 (upgrading an
  installation).

### How the user works
- The user is the domain expert and the authority on field reality; the `development/` specs are
  not (their truck-capacity section is wrong). The legacy screenshots in `development/legacy_app(…)/`
  are the best evidence of what a firm needs; when told "think harder", look there first.
- They answer **inline** in the docs (usually `spec/QUESTIONS.md`), sometimes inside tables, as
  corrections above earlier quotes, or numbered oddly; they write "APPROVED" under sections. Read the
  changed section in full; move each answer into a dated `> **User, …:**` quote, verbatim; record an
  ADR in the same response; update `SUMMARY.md`, the owning skill, `spec/RULES.md` and the part pages.
- They answer wearing **different hats**: a firm setting up, a monitor in the field, the back office
  (ADR-224). Note which, and design each side for its own user.
- **A "yes" to an either-or question is read back before it is recorded.** Q-139 asked "may two
  share the name, or should the second be named `3A-2`?"; the answer began "Yes", an agent took it
  for the first half, and the wrong rule stood for five days until an acceptance scenario showed it
  to the user (ADR-147 → 301). Say which half you understood, in one line, and never ask two
  things in one question. A scenario in `spec/acceptance/` is where the user catches such a
  misreading: write them plainly.
- Write questions that stand alone: plain words, **a story told as a table of what happens to each
  ticket**, then the question, refs at the end. No paraphrase ("TOO MUCH PARAPHRASING"). Give ticket
  numbers that make sense (a haul-out has its own number). When their numbers don't add up, show the
  arithmetic and ask once. Never guess money.
- Before asking how a contract line works, check whether projects, names, pay items and rules already
  express it (ADR-197, 200). Never relabel a status mark yourself (ADR-133, 139).
- Never mention data sharing between installations; say "installation", never "instance" (ADR-112).
  Say "set up", never "provision".

### Tools and housekeeping
- **A guard's `--create-only` stub must come out empty (KD-70, seen 2026-10-03).** Prisma read
  `MapVersion.loadedAt`'s default `CURRENT_TIMESTAMP` back as its own `now()` and wrote the default
  again into every later migration, the guard's stub included; the hook then rightly refused
  writing into it. The default is now `transaction_timestamp()`. If a stub ever carries a line
  nobody asked for, find the `dbgenerated` default Prisma is reading back differently and fix
  that; never write around the hook.
- **Docker on this machine (seen 2026-10-01, ADR-282).** Docker Desktop's disk is **8 GB**; the local
  stack's six images take about 4.4 GB and its data about 0.5 GB, leaving under 1 GB. If a `local:up`
  fails with "No space left on device", free space before retrying (the user's build cache, about
  0.9 GB, and the historical volume are theirs to clear), or the user raises the limit in Docker
  Desktop's settings. A first `local:up` downloads the map extract (20 MB; the download site answers
  only over IPv4 here, which Node handles) and takes about two minutes; a resume takes about 12 s.
  If every `docker` call answers 500, Docker Desktop's engine is stuck: quit and reopen it.
  **Seen 2026-10-03 (ADR-313):** four throw-away copies of `adms` made at once filled the disk and
  stopped Postgres (each copy is about 85 MB, and `CREATE DATABASE` writes the whole copy to the
  write-ahead log, which grew to 0.5 GB). It came back by itself once space was freed (the routing
  server's volume, rebuilt by the next `up`, removed while its container was stopped), with nothing
  lost. **Try loosened guards two at a time here, not four,** each copy made with `STRATEGY
  FILE_COPY` and followed by a `CHECKPOINT` after its drop (`adms-verify` §1.3).
- **The repository has a history since 2026-10-01 (ADR-288):** nine commits by the user on branch
  `phase0-foundation` (`a94cdb6`…`b5329fe`), each a slice of that day's files in Phase 0's build
  order, so only the newest is a state that was built and tested whole; Phase 1's on
  `phase1-data-coreh` (26 commits in all, seen 2026-10-02). There is no `main` and no remote yet
  (both the user's call). Agents still never write to git (ADR-008): end a file-changing response
  with the user's git block, **staging named paths, never `git add .`**.
- **`database/` and the placeholder folders (`api/`, `field-webapp/`, `back-office-webapp/`) are no
  longer in the working folder** (seen 2026-10-01; they were never committed). Never recreate them
  (`AGENTS.md` write boundaries; the guard hook still refuses a write under `database/`).
- **Leave nothing running (ADR-277, the user, 2026-09-30).** Start the local stack with `pnpm
  local:up` when a task needs it; stop it with `pnpm local:down` at close-out (`adms-close-out` §0),
  with throw-away databases, containers and volumes gone. Something stays up only with a line here
  saying what, why and who stops it. **Nothing needs to stay running today.** The historical root
  stack is gone: the user retired its file and volume on 2026-10-01 (KD-59 closed, ADR-291).
- **The local installation was re-made on 2026-10-07, twice** (the second time for ADR-401, to take an uncommitted migration back out; the first, ADR-396: teardown, then a first run, at
  the user's word, to prove the statement timeout on a first run; before it on 2026-10-01, ADR-281). Its master passcode is a throw-away random value; the user sets
  their own with `pnpm installer:teardown`, then `pnpm installer`. `prisma migrate dev --create-only`
  applies earlier pending migrations to `adms` itself and wants a terminal when the new migration
  carries a warning (`adms-verify`, "The schema").
- In the round 19 session the auto-mode safety check sometimes returned no verdict for Bash and web
  search; reads and edits kept working. If it happens, carry on with the file tools.
- `pdftoppm` isn't installed, so the legacy field-app PDFs can't be read by the agent here; they
  were reviewed in round 22 (incident, collection and unit rate flows).
- The Build 1 copy is gone (removed by the user); `README.md` is missing (intentional).
  `AGENTS.md` (`CLAUDE.md` links to it) is 189 lines, over its ~150 target (ADR-092); the session hook prints about 3 KB since the Next Atomic Task section was cut (ADR-375; it had grown to 74 KB).

## 📍 Next Atomic Task

**New session? Read the "🔁 Handoff" block above first**, then `agent_store/SUMMARY.md`'s header
and the topic you are touching. Product discovery is closed (ADR-230): don't open new rounds of
questions.

**Phase 2 is open (ADR-376). Its plan is `BACKLOG.md`, "Active — Phase 2" (ADR-377): read its
brief first. One task per response.**

**Task 2.5.3, part 2 of 5: the rest of the project's lists** *(BACKLOG 2.5.3 and C117; ADR-449
(4) is the cut, ADR-450 what part 1 built; read `apps/api/src/phone/phone-lists.ts`,
`apps/api/test/phone-lists.test.ts`, ARCHITECTURE §7.1's ⚠️ lists note, `adms-field-app` §4A.2a,
`adms-certifications`, `packages/domain/src/quantity-lookup.ts` and `SetupStanding` first)*.
`PhoneLists.held` and `phoneListsSchema` grow by: the project's certifications (number, kind,
capacity, prime and subs; a new one is there at the next read, AC-03-09), its sites, its ROEs
with those whose pre-work survey is done, its control ranges, a cert-number block for a phone
that certifies, each unit rate pay item's capture settings, and the site's quantity lookup for
a phone at a site; **never a rate, a load's pay item, a rule or a transaction** (AC-02-37,
AC-07-91: the tests read every list for one). No private citizen's details beyond what a monitor
needs to pick an ROE. Then part 3 (`SetupManifest` and the setup version, a schema change),
part 4 (the login list and the master passcode's check: **read the user's reply to ADR-449 (5)
first**; none in the files means it is built as proposed) and part 5 (the address lookup).
**The user may still overturn ADR-450's defaults, ADR-449 (5)'s proposals, ADR-444's, ADR-443's,
ADR-442's, ADR-440's, ADR-438's two choices or ADR-439's (`SUMMARY.md` §4).**
**Before the chain, `pnpm ready`** (the stack up, then `installer:check`): a `✗` at the migrations
means one was made elsewhere, and `pnpm installer` applies it (seen 2026-10-09: 176 tests failed
until it was). **After a change to `apps/api` or `apps/worker`, `pnpm local:up` again; if Docker
answers 500, quit and reopen it; if `local:up` meets `ECONNRESET` or a container whose layer is
gone, `pnpm local:down` and `up` once more.** **On a Linux host (a cloud session), the containers run as uid
1000:** after `pnpm installer` the two service env files, and after each `local:up` the copied
Caddy root, must be readable by it (`chown 1000:1000`), or the API or worker fails to start
(seen 2026-10-09, ADR-443's session log).

**Every command starts with** `eval "$(fnm env --shell zsh)"`. The checks are `adms-verify`'s
(read the page for the layer you touch, beside it; skip the others); the counts to compare with
are `agent_store/CHAIN.md`'s; loosenings go in one list through its `loosen.mjs`. The stack is
stopped at close-out (ADR-277). Names and examples: `spec/CONVENTIONS.md`. Field
names: `spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.

**Keep this section short (ADR-375):** the session hook prints all of it into every session. It
holds the next task and what that task needs, never a list of finished ones; what a finished task
leaves for a later one goes in BACKLOG's carry-forward register.

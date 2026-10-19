# Open ADMS — Next

> **This file defines the immediate scope of work.** If asked for something outside this phase,
> say which phase it belongs to and ask before proceeding. Keep the Next Atomic Task pointer at
> the bottom accurate. Milestone detail lives in `agent_store/BACKLOG.md`. **Keep this page under
> about 20 KB** (the session hook warns past it; ADR-532): where things stand in a few lines,
> never a task-by-task record (that is each task's ADR and its BACKLOG tick).

## Active Phase — **Phase 3 (the field app): opened by the user 2026-10-17 (ADR-557)**

**User, 2026-10-17:** "phase 2 is complete and phase 3 is approved to start working... Mark the
fiels ready and begin opening phase 3". Task 3.0.1 opened it (ADR-557…560): the plan, the 33 REQs
moved, the phone's scenarios, and the accessibility standard asked first (WCAG 2.2 AA, ADR-559).

**What Phase 3 is.** The phone, built against the contract Phase 2 serves (enrolment and proof,
sign-in and the assignment, the lists, the login list, the passcode's check, the address lookup,
sync and photographs, turn-in, `syncClientSuite`). **It adds no rule.** One codebase, `apps/field`
(React + Vite + Capacitor): the browser build first and whole, then the iPhone, then Android
(ADR-099). Its one server half is the time clock's records (REQ-310). Its plan is `BACKLOG.md`,
one task per response (ADR-558); read its brief before any task.

**Scope boundary.**
- **In:** `apps/field`; `packages/domain` (a rule a task's ADR records, the UUIDv7 maker),
  `packages/contracts` (the time clock's kind of record, a payload a phone needs), `packages/db`
  and `apps/api` for the time clock's records and any call a phone needs that the API doesn't
  serve (the endpoint recipe), `packages/scenarios`, `infra/local` (the browser build's name and
  origins), `tools/`, `spec/acceptance/11-field-app.md`, `spec/CHECKLIST-FIELD.md`,
  `spec/THREAT-MODEL.md`.
- **Not Phase 3's:** the back office's and portal's screens, the time clock's approval screen and
  export, the receipt batch (Phase 4); the demo deploy and the app stores (Phase 5a). Say which
  phase and ask; never widen silently. **A phase's own server work never moves to a later phase
  by agent default** (ADR-519).
- `development/` stays read-only reference.

## Exit criteria for Phase 3 *(ADR-557; agent default, the user may change them)*

1. **The golden mission's field events captured through the field app's browser build** by its
   end-to-end tests, synced through the real endpoints, reconciled by queued jobs, with the
   approved statuses, review queue, ledger (P1 $5,548.25 on 19 lines; P2 $324.00) and audit rows;
   every story still passing.
2. **Every acceptance scenario with a Phase 3 part passes at its layer**, reported as N of M
   (`spec/acceptance/11-field-app.md`: 133).
3. **All 33 REQs** ticked from runs that were seen, or moved with an ADR (ADR-371).
4. **The field app's security checklist** (OWASP MASVS, `spec/CHECKLIST-FIELD.md`) answered
   control by control; the threat model's phone rows read again; `pnpm security` passing.
5. **Every screen meets WCAG 2.2 AA**: the automated check with no violation, a hand review
   recorded, and the field app's conformance report (VPAT format) written (ADR-559).
6. **The database still enforces the rules:** every new table guarded, every grant and refusal
   tested, `guard_gaps()` empty.
7. **The chain is green** with real counts, the browser end-to-end layer in it, and the browser
   build reached only over HTTPS through Caddy.
8. **Rules and shapes live once:** no rule in `apps/field`, no payload shape outside
   `packages/contracts`, the phone reaching the server only through the API.
9. **On device:** the on-device layer (airplane mode, printing, scanning, camera, encryption,
   turn-in) run on a real iPhone and a real Android phone with the user, what was seen recorded.
10. **No "no task yet" of the field app's in the register**, and three full runs in a row of the
    browser end-to-end tests and `pnpm scenarios` after a green chain.

Only then is **Phase 4 (the back office and portal)** offered to the user to open.

---

## 🔁 Handoff — read this first in a new session

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and how the user works**. What is true
now, topic by topic, is `SUMMARY.md` (its header's topic index, then only the topics you touch);
the round-by-round history is the session log at the end of `DECISIONS.md`.

### Where things stand (2026-10-19, through ADR-584)
- **Phase 3 is open (ADR-557)**: 18 of 33 tasks done (ADR-557…584). **Milestones 3.1…3.4 are done**:
  the plan, the scenarios (`spec/acceptance/11-field-app.md`), the checklist
  (`spec/CHECKLIST-FIELD.md`), the shell at `https://field.adms.localhost` with `pnpm e2e` in the
  chain and axe-core on every screen, the look, the prototype (the user's notes ADR-571, their
  answers to Q-215…Q-218 ADR-573); the store, enrolment and its proof, sign-in online and offline;
  setup, switching, moving and sessions under the master passcode (its ten wrong tries offline lock
  the phone, the user, ADR-577); the phone's own sync, its photographs' files, and **"Sync and turn
  in" with the wipe (ADR-580)**. **Milestone 3.5 begun: the collection (ADR-581)**, with
  waypoints end to end, the phone's first block of numbers, and the harness's phone taking the
  number at New; **the tower and the haul-out (ADR-582)**, each quantity from the site's lookup by
  one domain rule (`PhoneQuantityAsks`), the harness's tower asking the same; **unit rate
  (ADR-583)**, each kind of work's screen by the domain's `PhoneUnitRate`; **the prototype gone**,
  its checks on every screen; **the forms (ADR-584)**: the ROE's number from the phone's ROE
  block, surveys (a post-work survey's ROEs by the domain's `PhoneSurveys`), the incident's offers,
  the drop-off log, and the firm's own fields, now in the phone's lists. **Next: task 3.5.5,
  certifying.** What each
  task did is its ADR and its `BACKLOG.md` tick; the earlier, longer account of these milestones is
  `ARCHIVE.md`, "Moved 2026-10-19 (ADR-580)".
- **Phase 2's exit was met a third time (ADR-555)**: the chain green, three full story runs in a
  row, 184 of 184 Phase 2 scenarios, 22 of 23 REQs ticked and REQ-006 moved to Phase 3. The
  independent check of Phases 0–2 is answered whole (ADR-541…551); its file
  (`AUDIT-2026-10-17-PHASE-2.md`) is no longer in the working folder (a missing file is intentional; never restored).
- **Phases 0 and 1 are done** (Phase 0 closed 2026-10-01, all 17 REQs, ADR-281…288; Phase 1's exit
  met 2026-10-06, ADR-371, 372). **Every spec page is approved** (ARCHITECTURE, VISION, INDEX, the
  part pages, LISTS, RATE-SHEET, RULES, DATA-MODEL, FLAGS, CONVENTIONS, the golden mission and its
  numbers, all ten acceptance files, THREAT-MODEL, CHECKLIST-API §3.1). Their record: `ROADMAP.md`
  §3a–§3c and `DECISIONS.md`.
- **Phase 2:** 44 tasks over Milestones 2.0…2.9 (ADR-376…555); the user's answers to the
  defaults page confirmed all but D1 (ADR-538, 539). What each task left is `BACKLOG.md`'s
  carry-forward register (live items only since ADR-532), mapped to Phase 3's tasks (ADR-558).
- **What runs.** The API (NestJS on Fastify) is the local stack's own service, reached only at
  `https://api.adms.localhost` through Caddy; the worker drains the job queue. **Every endpoint is
  defined in `packages/contracts` and served through `@Serves`; `Admission` asks who may call it
  before the schemas read anything**; the recipe for adding one is the register's standing rules.
- **What exists:** `packages/db` (schema, guards, tests), `packages/domain` (every rule),
  `packages/contracts` (every payload, the sync client's suite), `packages/scenarios` (the harness
  and stories, the golden mission among them), `apps/api/src/` (services by area, `process/`,
  `phone/`, `sync/`, `review/`, `setup/`, `dispatch/`, `viewer/`), `apps/worker/src/`
  (`reconciliation/`, `mileage/`, `process/`), `tools/` (installer, security, licences), `infra/local`.
- **This machine's installation holds no person but the seed's actors** (`pnpm local:accounts` and
  `pnpm installer:admin` are never run for real here; the API's tests rely on it). Its master
  passcode is a throw-away random value.
- **Open deviations:** none (`SUMMARY.md` §3). **Waiting on the user:** nothing blocks; for the
  on-device milestones (3.8, 3.9) a real iPhone and Android phone, a Zebra ZQ printer, Xcode and an
  Apple developer account (`ROADMAP.md` §6); `SUMMARY.md` §4 lists the defaults open to them.
- **The user's word (ADR-401): sign-in follows NIST SP 800-63B and ASVS Level 2; when a direction
  in security is suggested, say what the standard asks before building it.**

### The model as it stands now (today's words; `SUMMARY.md` has each rule and its ADR)
The firm's setup decides how things play out (ADR-197), and there are **two sides** (ADR-224): the
monitor enters only the main ticket, the system and the back office do the rest.
- **Setup:** client → declaration event → project; contractors and **contracts** (name, prime,
  link); **forms** with their **debris types**, named as the contract names the work; **pay items**
  (a code unique on the project, a description, a **payable type**, Unit of Measure, size band,
  capture settings, **a rate per prime**); **sites** (site type + Takes loads · Haul-outs leave here
  · Charges a tipping fee · Ineligible site); field tags; the project map; **rules** per form,
  **naming one contract** and running only on its prime's tickets: criteria → *Add / Remove
  transaction #n*, *Void ticket*.
- **Phones and people:** a phone is **enrolled** once; the back office's **dispatch board** gives
  each person a daily **assignment**; the phone takes it at sign-in; setup by master passcode is the
  fallback; phones sync whenever there's signal, with somebody signed in. The optional **time
  clock** hangs on the assignment.
- **Field:** each monitor records a **field event** (`COL` `DIS` · `HOC` `HOD` · `URT`). **The badge,
  then the number, at New**; a ticket left at any step and resumed, one open per truck on a phone
  (ADR-571). Picks **by name, never a code**. One quantity: a load call, or a scale
  weight when the paying pay item is by weight. A submitted record is sealed for its monitor.
- **Engine:** groups field events on project + workflow + bare number; flags, never blocks;
  attaches zone and mileage; runs every passing rule in # order; writes the completed load and the
  transactions (regenerated, each removed row copied to audit first).
- **Back office:** sees everything, corrects in place (audited), accepts flags, voids with a reason,
  reprocesses; QC status is separate; only QC Approved records lock as invoiced, optionally in a
  named **invoice batch**; the client package is assembled by hand from exports; one review queue;
  a setup check; the pay item screen writes its own rules.

### Where it ends up
Done is proven, not ticked (`spec/VISION.md` §8): approved part pages → **acceptance scenarios**
(`spec/acceptance/`, `AC-…`) → a **golden mission** (`spec/golden/`, signed off by the user) → the
same scenarios passing at each layer (engine, API, apps). The finished surfaces are `VISION.md` §7.

### The road to done (the user's view: `ROADMAP.md`)
| Phase | What it produces | Status |
|---|---|---|
| 0 Foundation | approved architecture, scaffold, database hardening, scenario harness | ✅ 2026-10-01 |
| 1 Data core and engine | every record, the engine, the ledger, review; the golden mission at the engine | ✅ 2026-10-06 |
| 2 API and sync | the API, sign-in, phones, sync, queued jobs; the mission through the real endpoints | ✅ exit met 2026-10-17 (ADR-555), after reopenings for Milestones 2.8 and 2.9 |
| 3 Field app | browser, then iPhone, then Android | 🟡 open 2026-10-17 (ADR-557); 18 of 33 tasks |
| 4 Back office and portal | setup screens, the rule builder, the review queue, exports, viewers | 🔒 |
| 5 Later features and the demo deploy | Railway + Netlify, the outside penetration test, later features | 🔒 |

### What is still to be asked (so nothing is guessed later)
- **Nothing blocks** (ADR-230). New questions only under the shot-clock rule.
- **Agent defaults the user may overturn:** `SUMMARY.md` §4 (never copied here, ADR-516).
- **Later phases, not asked now:** the HHW trail (KD-30, REQ-518); the time clock's screens (rules
  settled, ADR-241); which phase the read-only portal lands in (`VISION.md` §7); each Phase 5
  candidate; `RULES.md` §7 "Is valid".
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
- **A "yes" to an either-or question is read back before it is recorded** (Q-139 → ADR-147 → 301:
  a misread "Yes" stood five days). Say which half you understood, in one line, and never ask two
  things in one question. An acceptance scenario is where the user catches a misreading: write
  them plainly.
- Write questions that stand alone: plain words, **a story told as a table of what happens to each
  ticket**, then the question, refs at the end. No paraphrase ("TOO MUCH PARAPHRASING"). Give ticket
  numbers that make sense. When their numbers don't add up, show the arithmetic and ask once.
  Never guess money.
- **When the user reviews a finished task with questions, answer them in plain words first and
  change no code until they say go** (that is how the review of 2.8.6 went, ADR-531).
- **Don't cut a task ahead of time** (ADR-516): take the whole task; cut only when it truly can't go
  on, and say what was left on the task's tick line.
- Before asking how a contract line works, check whether projects, names, pay items and rules already
  express it (ADR-197, 200). Never relabel a status mark yourself (ADR-133, 139).
- Never mention data sharing between installations; say "installation", never "instance" (ADR-112).
  Say "set up", never "provision".

### Tools and housekeeping
- **Every command starts with** `eval "$(fnm env --shell zsh)"`. **The chain is `pnpm chain`**, run in
  the background (ADR-533); its first step is `pnpm ready` (the stack up, then `installer:check`). **Leave nothing running** (ADR-277): stop the stack with
  `pnpm local:down` at close-out (`adms-close-out` §0); nothing needs to stay running today. Docker
  Desktop may be closed at a session's start: `open -a Docker`, and quit it at close-out if you
  opened it.
- **Docker's disk is 8 GB** (ADR-282): the stack's images take about 4.4 GB and its data about
  0.5 GB. It was full on 2026-10-03 (four throw-away copies of `adms` at once) and 2026-10-10 (after
  `pnpm test`, `pnpm scenarios` and two more database runs: Postgres restarted in a loop on its
  write-ahead log). **If `pnpm ready` or `local:up` fails for space, stop and ask the user to free
  some** (`docker builder prune`, about 0.9 GB, is theirs) or raise the limit; never work around
  it. **Try loosened guards two at a time**, each copy `STRATEGY FILE_COPY` then a `CHECKPOINT`
  after its drop (`adms-verify` §1.3). A first `local:up` downloads the map extract (20 MB, IPv4
  only) and takes about two minutes; a resume about 12 s.
- **When Docker misbehaves:** it hangs often on this machine and a restart always clears it (the
  user, ADR-551): a `docker` call or `local:up` that hangs, or every call answering 500 →
  `docker desktop restart` at once, never a long wait (quitting by `osascript` left its backend
  running); then `pnpm local:down` and `up`. **Volumes nobody recognises are an agent's one-off
  containers** (the stack's own are all named `open-adms-local_…`): run every one-off with `--rm`,
  and before close-out `docker volume ls -f dangling=true` must show none you made; `local:up` meeting `ECONNRESET` or a container
  whose layer is gone → `pnpm local:down` and `up` once more. **On a Linux host (a cloud session)**
  the containers run as uid 1000: after `pnpm installer` the two service env files, after each
  `local:up` the copied Caddy root, and each key under `infra/local/.generated/tls/` by its own
  container's user (Postgres 999, the mail catcher 65534, the address server's `nominatim`, the
  rest 1000) must be readable, or that service fails to start.
- **A guard's `--create-only` stub must come out empty** (KD-70): if it carries a line nobody asked
  for, find the `dbgenerated` default Prisma reads back differently; never write around the hook.
  `prisma migrate dev --create-only` applies earlier pending migrations to `adms` and wants a
  terminal when the new migration carries a warning (`adms-verify`, "The schema").
- **`pnpm lint` runs under a 4 GB heap** (ADR-465); if it stops with "heap out of memory", split it
  by workspace.
- **Git:** the repository has `main`, a branch per phase (`phase0-foundation`, `phase1-data-coreh`,
  `phase2-api-sync`, the current one) and the remote `openadms_dev` (GitHub), all the user's.
  **Agents never write to git** (ADR-008): end a file-changing response with the user's git block,
  **staging named paths, never `git add .`**. The guard hook also refuses a Bash command whose text
  names a git write, a heredoc included: write such a file with the Write tool.
- **Gone on purpose:** `database/`, the placeholder folders and the Build 1 copy (never recreate or
  port from them); `README.md` is missing (the user's, KD-34). `pdftoppm` isn't installed, so the
  legacy field-app PDFs can't be read here (they were reviewed in round 22).
- **The session hook prints the Next Atomic Task below into every session**, and warns when
  `SUMMARY.md`'s topics or this page outgrow their budgets (ADR-532).

## 📍 Next Atomic Task

**Task 3.5.5, Certifying on a phone, and the truck keyed in by hand** (`BACKLOG.md`, Milestone
3.5; REQ-322, 317; C118, C127, C129; AC-03-09, 14, 36, AC-11-42). **Build on 3.5.1…3.5.4's**
(ADR-581…584): `PhoneTickets` and `PhoneForms` (a record begun, kept, left and finished, sealed),
`capture.tsx` (`Step`, `TicketPhotos`, `TypeAgain`), the truck lists already in the phone's lists
(ADR-553). The prime, the vehicle or crew type, each box's feature and the helpers picked from the
lists, a sub typed with suggestions; the capacity from the domain's `Capacity`, shown, never typed;
five views; the cert number from the phone's cert block or the pre-printed sheet; the boxes sent,
every measurement a shape doesn't hold `null`; a hand-keyed truck's typed capacity. Read its whole
brief and the register's items first. **From 2026-10-21, C175** (React 19.3.1 and Playwright
1.64.1 read again).

**New session?** Read the Handoff above, then `SUMMARY.md`'s header (its topic index) and only the
topics your task touches. Product discovery is closed (ADR-230). **Every command starts with**
`eval "$(fnm env --shell zsh)"`; **the chain is `pnpm chain`** (in the background: about ten
minutes; `pnpm ready` is its first step, ADR-533); after a change to `apps/api`
or `apps/worker`, `pnpm local:up` again. The checks are `adms-verify`'s (read the page for the
layer you touch); the counts are `CHAIN.md`'s. **If Docker's 8 GB disk is full, stop and ask the
user**; the rest of what Docker and a Linux host need is the Handoff's "Tools and housekeeping".
Names: `spec/CONVENTIONS.md`; field names: `spec/DATA-MODEL.md`; flag wording: `spec/FLAGS.md`.

**Keep this section short (ADR-375):** the hook prints all of it into every session. It holds the
next task and what that task needs, never a list of finished ones.

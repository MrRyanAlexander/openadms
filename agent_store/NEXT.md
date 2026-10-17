# Open ADMS — Next

> **This file defines the immediate scope of work.** If asked for something outside this phase,
> say which phase it belongs to and ask before proceeding. Keep the Next Atomic Task pointer at
> the bottom accurate. Milestone detail lives in `agent_store/BACKLOG.md`. **Keep this page under
> about 20 KB** (the session hook warns past it; ADR-532): where things stand in a few lines,
> never a task-by-task record (that is each task's ADR and its BACKLOG tick).

## Active Phase — **Phase 2 (API and sync), reopened 2026-10-14 at the user's word** *(ADR-519; Milestone 2.8)*

An audit of Phase 2 (ADR-519 (1)) found its own server work moved to later phases or left "no
task yet". The user: "all 3 of these are part of phase 2", "these should be part of phase 2".
ADR-518's exit is withdrawn; **Milestone 2.8 (`BACKLOG.md`), nine tasks, is the work: all nine done;
Phase 2's exit is met again (2026-10-17, ADR-537…540).** Phase 3 is the user's to open.

**What Phase 2 is.** The server in front of what Phase 1 built: the API as a running process over
HTTPS, sign-in and permissions, a phone's enrolment and its proof of itself, the sync endpoints,
and reconciliation as queued jobs drained by the worker's own process. **It adds no rule: it wraps,
signs in, queues and hardens.** Opened by the user 2026-10-06 ("phase 2 is open, begin working on
the next task", ADR-376); its plan is `BACKLOG.md`, one task per response (ADR-377); read its brief
before any task.

**Scope boundary.**
- **In:** `apps/api` (the process, endpoints, sign-in), `apps/worker` (the process, the queue),
  `packages/contracts` (every payload), `packages/db` (sign-in's, the queue's and sync's records,
  their guards and tests), `packages/domain` (any rule a task's ADR records), `packages/scenarios`,
  `infra/local`, `tools/` (the installer, the security checks), `spec/acceptance/`,
  `spec/THREAT-MODEL.md`, `spec/CHECKLIST-API.md`.
- **Not Phase 2's:** any screen, the phone's own store, real secure hardware, printing and scanning
  (Phase 3); the back office's and the portal's pages, exports, the time clock's tables (Phases
  3–4); the demo deploy, cloud TLS, pgAudit, the outside penetration test (Phase 5a). Say which
  phase and ask; never widen silently. **But a phase's own server work never moves to a later
  phase by agent default** (ADR-519).
- `development/` stays read-only reference.

## Exit criteria for Phase 2 *(ADR-376, and 8…10 by ADR-519; agent default, the user may change them)*

The seven were met once (2026-10-14, ADR-518: how each was met is that ADR); **all ten are met
(task 2.8.9, 2026-10-16…17, ADR-537…540)**: 9 by the user's answers to `spec/DEFAULTS-REVIEW.md`.

1. **The golden mission syncs through the real endpoints and is reconciled by queued jobs**, with
   the exact statuses, review queue, ledger (P1 $5,548.25 on 19 lines; P2 $324.00) and audit rows
   the user approved; every other story still passes.
2. **Every acceptance scenario with a Phase 2 part passes at the API**, reported as N of M.
3. **All of Phase 2's REQs** (22 since ADR-519) ticked from runs that were seen, or re-filed with an ADR.
4. **The security checklist for this layer** (ARCHITECTURE §16: OWASP ASVS Level 2, API Security
   Top 10, NIST SP 800-63B): each item answered by a named test or by the phase that owns it; the
   threat model written; `pnpm security` passing.
5. **The database still enforces the rules:** every new table guarded, every grant and refusal
   tested, `guard_gaps()` empty, each service login under a statement timeout.
6. **The chain is green** with real counts (typecheck, lint, licences, tests, stories), and the
   API is reached only over HTTPS through Caddy.
7. **Rules and shapes live once:** no rule outside `packages/domain`, no payload shape outside
   `packages/contracts`, only `packages/db` and the two server apps reaching Postgres.
8. **No "no task yet" of the server's stands in the register**, and every line aimed at a Phase 2
   task is done with its ADR or re-filed (ADR-519; held at every task's close).
9. **`SUMMARY.md` §4's agent defaults put to the user on one page**, each confirmed or overturned
   (the user's #3, ADR-519).
10. **Three full runs of `pnpm scenarios` in a row**, `burst` passing with no 500 in its API's log
    (REQ-210).

Only then is **Phase 3 (the field app)** offered to the user to open.

---

## 🔁 Handoff — read this first in a new session

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and how the user works**. What is true
now, topic by topic, is `SUMMARY.md` (its header's topic index, then only the topics you touch);
the round-by-round history is the session log at the end of `DECISIONS.md`.

### Where things stand (2026-10-17, through ADR-550)
- **The independent check of Phases 0–2** (`AUDIT-2026-10-17-PHASE-2.md`) **is answered whole** at
  the user's word "resolve all of these" (ADR-541…550): the passcode can't be held shut by a
  stranger, bursts are counted try by try, one key a purpose with the passcode's own sealed seed, a
  record naming somebody who didn't hold the phone flagged, the audit log and the jobs set aside
  read, a phone's held budget, sign-in by one indexed equality, map files read in a thread, an
  untrusted proxy logged; the threat model read again whole. Three answers wait on the user
  (`SUMMARY.md` §4).
- **Phases 0 and 1 are done** (Phase 0 closed 2026-10-01, all 17 REQs, ADR-281…288; Phase 1's exit
  met 2026-10-06, ADR-371, 372). **Every spec page is approved** (ARCHITECTURE, VISION, INDEX, the
  part pages, LISTS, RATE-SHEET, RULES, DATA-MODEL, FLAGS, CONVENTIONS, the golden mission and its
  numbers, all ten acceptance files, THREAT-MODEL, CHECKLIST-API §3.1). Their record: `ROADMAP.md`
  §3a–§3b and `DECISIONS.md`.
- **Phase 2:** 32 tasks of Milestones 2.0…2.7 closed (ADR-376…518); **Milestone 2.8, from the
  audit:** 2.8.1…2.8.8 done (ADR-522…531, 534, 535), what 2.8.8 left (C172) done (ADR-536); **2.8.9 done: Phase 2's exit met (ADR-537…540)**; the user's answers to the defaults page confirmed all but D1, built as the back office's view permissions (ADR-539). **Phase 3 waits on the user's word.** What each task left is `BACKLOG.md`'s
  carry-forward register (live items only since ADR-532).
- **Housekeeping, 2026-10-15 (ADR-532), at the user's word:** `SUMMARY.md` cut by topic (432 → 202
  KB, every rule kept with its ADRs), `BACKLOG.md`'s register live-only and its done phases one
  line a task (452 → 54 KB), this page trimmed; the text that left each moved word for word to
  `agent_store/ARCHIVE.md`, "Moved 2026-10-15 (ADR-532)". No product rule changed.
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
- **Open deviations:** none (`SUMMARY.md` §3). **Waiting on the user:** their word to open Phase 3;
  every agent default on `spec/DEFAULTS-REVIEW.md` is answered (ADR-538), `SUMMARY.md` §4 lists what stays open.
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
- **Field:** each monitor records a **field event** (`COL` `DIS` · `HOC` `HOD` · `URT`). **Badge
  first, number last.** Picks **by name, never a code**. One quantity: a load call, or a scale
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
| 2 API and sync | the API, sign-in, phones, sync, queued jobs; the mission through the real endpoints | ✅ exit met 2026-10-17 (ADR-537…540); the audit's F1…F11 answered (ADR-541…550) |
| 3 Field app | browser, then iPhone, then Android | 🔒 the user opens it |
| 4 Back office and portal | setup screens, the rule builder, the review queue, exports, viewers | 🔒 |
| 5 Later features and the demo deploy | Railway + Netlify, the outside penetration test, later features | 🔒 |

### What is still to be asked (so nothing is guessed later)
- **Nothing blocks** (ADR-230). New questions only under the shot-clock rule.
- **Agent defaults the user may overturn:** `SUMMARY.md` §4 (never copied here, ADR-516).
- **Later phases, not asked now:** the HHW trail (KD-30, REQ-518); the time clock's screens (rules
  settled, ADR-241); which phase the read-only portal lands in (`VISION.md` §7); each Phase 5
  candidate; `RULES.md` §7 "Is valid"; whether to keep hand re-entry of the ticket number (ADR-209);
  Phase 3's first question, the accessibility standard (REQ-324).
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
- **When Docker misbehaves:** every `docker` call answering 500 → `docker desktop restart`
  (quitting by `osascript` left its backend running); `local:up` meeting `ECONNRESET` or a container
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

**Phase 2's exit is met (task 2.8.9, ADR-537…540). Waiting on the user: their word to open Phase 3.**
Nothing of Phase 3 starts before it. When they open it: task 3.0.1 writes its plan
(`REQUIREMENTS-LATER.md`'s Phase 3 and the register's map), and asks first, before any screen is
designed, the accessibility standard and level (REQ-324, C41).

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

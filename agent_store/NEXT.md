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

### Where things stand (2026-10-07, through ADR-419)
- **Phase 2 (API and sync) is open (ADR-376).** Its plan is `BACKLOG.md`'s eight milestones and 32
  tasks (ADR-377); tasks 2.0.1 (the opening and the plan), 2.1.1 (the threat model and the
  API's scenarios, ADR-379; docs), 2.1.2 (the API as a process, ADR-380…385), 2.1.3 (the
  boundary, ADR-387…392) and **2.1.4 (time limits and policy, ADR-394…396)** are done:
  Milestone 2.1 is complete. **Task 2.2.1 (sign-in's records, ADR-397…399) is done:** three
  tables read by the API alone, each with its own guards: `user_credential` (a person's password
  hash, authenticator secret and locked-until, apart from `user`), `session` (the SHA-256 of
  the refresh token in force) and `security_event` (copied by the database into the audit
  log's security domain). **Task 2.2.2 (passwords, ADR-402…406) is done:** the rules are
  `packages/domain`'s (`PasswordRules`: NIST SP 800-63B-4 and ASVS 5.0; 15 to 128 characters as
  policy values, never a composition rule or an age; a monitor's exempt, ADR-105); a password or
  a master passcode that is on the release's own list of 46,483 known breached passwords
  (`packages/domain/breached-passwords.txt`) is refused, with no outside service; a password is
  kept only as an Argon2id hash (19 MiB, 2 passes, 1 lane); `Passwords` in `apps/api/src/sign-in/`
  lets an admin set anybody's (**a service: its endpoint comes with 2.2.5**, when a session says
  who calls) and a back-office or outside user reset theirs by email through two endpoints
  (`POST /password-resets`, `/password-resets/completions`) with a signed code, good once for 60
  minutes, that stores nothing; mail is `nodemailer` and never required. What it leaves: BACKLOG
  C89. **Task 2.2.3 (sessions, ADR-407…411) is done:** an admin, a manager/analyst or a
  read-only viewer signs in with their email address and password (`POST /sessions`) and gets
  two `__Host-` cookies (`HttpOnly; Secure; SameSite=Strict`): an access token good for five
  minutes and a refresh token that rotates and is good once (used twice, its session ends).
  **Every endpoint says who may call it** (`access` in the contracts), asked by `Admission`
  before the schemas read anything; a call that isn't a GET carries the session's CSRF value
  in `x-adms-csrf`. A session ends after 30 quiet minutes and 12 hours at most. Wrong tries
  are counted on `user_credential` (the domain's `SignInTries`): a wait from the 5th in a row,
  a lock at the 50th (ADR-417, the user's decision; the 10th before) until the password is set anew; each a security event, written with the
  person whose login was tried as its actor; a name nobody has writes nothing. A password an
  admin set is changed by its owner first (`passwordChangeRequired`); a new password ends the
  person's sessions; the password hash is keyed from `ADMS_TOKEN_SIGNING_SECRET`. A monitor
  and the system actor are refused. What it leaves: BACKLOG C90. **Task 2.2.4 (two-step
  sign-in, ADR-412) is done:** the second step is an authenticator app's code (RFC 6238, by
  `node:crypto`); a person who has one gets a session only with it (`POST /sessions` takes
  `code`; a right password without one answers `TWO_STEP_CODE_NEEDED`; a wrong or spent code
  is a wrong try at the login); a code is good once (`user_credential.two_step_last_step`);
  **an admin and a manager/analyst with none get a session that opens nothing but setting one
  up** (`TWO_STEP_SETUP_REQUIRED`; an endpoint is open to them only where its definition says
  `beforeTwoStepSetup`); a read-only viewer may choose one; a person sets it up by proving a
  code (`POST /two-step/setups`, `/two-step/setups/confirmations`; nothing is kept before
  that); the secret is kept sealed with a key drawn from the signing secret; an admin clears
  another person's (`POST /people/:userId/two-step-clearings`: their sessions end, a
  `TWO_STEP_CLEARED` security event). **The dev stack's accounts:** `pnpm local:accounts`
  writes an admin, a manager/analyst and a viewer with known passwords and authenticator
  secrets into this machine's installation (`--show` only shows them; it has not been run
  for real here, so the installation holds no person but the system actor). What it leaves:
  BACKLOG C91. **Task 2.2.5 (permissions on every request, and people, ADR-415) is done:**
  every `SIGNED_IN` endpoint names its `roles` and may name one `permission`; `Admission` asks
  them on each request from the database (`NOT_ALLOWED`), the rule the domain's (`Access`); an
  admin creates back-office and outside users (`POST /people`), reads one (`GET
  /people/:userId`, a monitor's phone number an admin's alone), gives and takes permissions and
  a viewer's projects (`PUT …/permissions`, `…/viewer-projects`), sets a password
  (`POST …/passwords`), ends sessions (`…/session-endings`) and archives (`…/archivings`); the
  database keeps one email address a person who signs in and the firm's last admin; **`pnpm
  installer:admin`** on the server makes the first admin and lets an admin back in (it has
  not been run for real here: the installation still holds no person but the system actor).
  What it leaves: BACKLOG C92. **Task 2.2.6 (rate limits, ADR-416) is done:** a caller over
  a limit is answered 429 `LIMITED` with `Retry-After` (and `retryAfterSeconds` in the body);
  every request is counted by address and, signed in, by person; refused tries at a secret by
  address and by address at one login (four, under the login's own wait: the fifth from one
  address never reaches the login); resets by email by who asks and who is asked for; nine
  policy values; the counts in the API's own memory (gone at a restart, per process), never
  the database; a caller's address taken from a proxy only where `ADMS_TRUSTED_PROXIES` lists
  it (the local stack's Caddy is `172.30.213.2` on a network of fixed addresses); no address
  logged or stored. **The user confirmed its defaults and put the lock at fifty wrong tries
  (ADR-417).** What it leaves: BACKLOG C93. **Milestone 2.2 is complete.** **Task 2.3.1 (the job queue, ADR-418) is done:** two guarded tables of our own
  written through Prisma, `reconciliation_job` and `reconciliation_job_ticket`, and no queue
  library; a job names its project, what asked for it and who, and its tickets (workflow and
  bare number); **it is added only inside the piece of work of the change that asks for it**,
  by `new ReconciliationJobs(tx).queue(…)` in `packages/db`; the API adds a job and changes
  nothing of it, the worker writes only how it went (`attempts`, `finishedAt` with its run,
  `lastError`, `setAsideAt`), nobody deletes, no viewer reads; a job once finished or set aside
  never changes. What it leaves: BACKLOG C94. **Task 2.3.2 (the worker as a process, ADR-419) is
  done:** `apps/worker/src/main.ts`, the stack's eighth service (profile `worker`), looks at the
  queue every five seconds and hands each project with a job waiting to
  `Reconciliation.waitingJobs`: under the project's lock a try is counted on each waiting job,
  the tickets they name are worked and no other, each once, and each job is finished in the
  run's closing piece of work; a try that fails whole keeps its reason, and a job is set aside
  after five (`JOB_TRIES_BEFORE_SET_ASIDE`). Its settings stop the start when off, named; its
  log is JSON by ids; its health answer (`{"status":"ok","jobsWaiting":N,"jobsSetAside":N}`) is
  on its own loopback, asked from inside the container. Five policy values more, the pool's
  size for both services among them. `pnpm installer` writes the worker's map settings (it
  added them to this machine's `apps/worker/.env`), starts the worker and checks it.
  **Nothing queues a job yet** (2.3.3), **and `Reconciliation.run`, which the stories call,
  still works every ticket of the project:** a job must name the neighbours a change can move
  (voiding 101031 clears a flag on 101030), which is 2.3.3's first decision. What it leaves:
  BACKLOG C95. **The user's word (ADR-401):
  sign-in follows NIST SP 800-63B and ASVS Level 2; when a direction in security is suggested,
  say what the standard asks before building it** (ADR-400 was built first and withdrawn). **Each service login (`adms_api`, `adms_worker`, `adms_readonly`) is
  under a statement timeout**, the policy value `STATEMENT_TIMEOUT_MS` (30,000 ms), set by
  `pnpm installer` and read by `installer:check`; **an installation may state its own value for
  any policy value** by the same name in a service's own env file or environment.
  **The API runs**: NestJS 12.1.2 on Fastify 5.12.5, the local stack's seventh service, reached
  only at `https://api.adms.localhost`; settings checked at the start, a structured log, one error
  filter, `GET /health`. **Every endpoint is defined in `packages/contracts` and served through
  `@Serves`; `Boundary` reads its path, query and body by its schemas first** (BACKLOG C86 is the
  recipe for adding one); the CORS list is `ADMS_CORS_ORIGINS`; every answer carries the API's own
  headers; the API's database client states the request's id on every write; `pnpm openapi`
  writes `apps/api/openapi.json`. `spec/acceptance/10-api-and-sync.md` (56 scenarios, 33 passing)
  and `spec/THREAT-MODEL.md` are both **approved by the user** (their marks, ADR-386, 393).
  Its 14 REQs are in `REQUIREMENTS.md`, one ticked (REQ-208).
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
- **The chain, seen whole on 2026-10-07:** 107 test
  files, 2,178 tests; lint clean; 421 licences allowed; seventeen stories; `pnpm security` 7 passed,
  0 failed; eighty-nine migrations; `installer:check` 27 `✓`. The expected output of each command is `adms-verify`'s.
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

**Task 2.3.3, what queues work** *(BACKLOG has the task in full)*. Read first: ARCHITECTURE
§13; **ADR-418, 419** and BACKLOG **C95** (its first decision: a job must name every ticket a
change can move, not only the one changed, or the run must find them; the stories `p1-reviewed`,
`p1-voided` and `p1-invoiced` prove it once they go through `waitingJobs`), **C94** (where each
service calls `new ReconciliationJobs(tx).queue(…)`), **C79…C81, C83, C62**; ADR-090, 360;
`spec/acceptance/10-api-and-sync.md` AC-10-50, 51, 54, `06-reconciliation.md` AC-06-02, 03, 36
and `05-sync.md` AC-05-53; `adms-exceptions` and `adms-validation` for which checks read another
ticket. **Done when:** a correction, a renumber, a void, an unvoid, an acceptance and an unlock
queue their job in their own piece of work and no caller asks the worker; a rate or rule change
queues the un-invoiced tickets it touches, in jobs a run can finish; a certification made after
a field event scanned its number links it and queues its tickets; the neighbours are worked;
AC-10-50 whole, AC-10-54 whole; and the chain is green with the new counts. **After a change to
`apps/api` or `apps/worker`, `pnpm local:up` again.** **Next after it: 2.4.1.**

**Every command starts with** `eval "$(fnm env --shell zsh)"`. The checks are `adms-verify`'s; the
database tests, the map servers' tests, the stories and `pnpm security` need `pnpm local:up` first,
and the stack is stopped at close-out (ADR-277). Names and examples: `spec/CONVENTIONS.md`. Field
names: `spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.

**Keep this section short (ADR-375):** the session hook prints all of it into every session. It
holds the next task and what that task needs, never a list of finished ones; what a finished task
leaves for a later one goes in BACKLOG's carry-forward register.

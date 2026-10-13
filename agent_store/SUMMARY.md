# Open ADMS — Current decisions and gaps, at a glance

**The present tense of the project on one page.** `DECISIONS.md` and `DEVIATIONS.md` are the full
history, with 500 ADRs and 77 KDs, many superseded. This page says what is true **now** and which
entries to cite. The reasons live in the ADRs and the skills.

- **Keep it current:** when you add, amend or supersede an ADR, or open or close a KD, update this
  page **in the same response** (`adms-decisions`).
- **If this page and a log entry disagree,** the newest ADR wins: fix this page and say so.
- **Updated 2026-10-13, through ADR-500 (no KD open).** **Piece 4c is done (ADR-500): every QC mark, lock, batch, batch change and unlock of `p1-invoiced` and the golden mission (its thirteen lock requests) is Luis's or Dana's request at their browsers, with those two stories' voids, acceptances, corrections, renumbers and grants; `p1-priced`'s lock of 101004 is QC'd and locked at the endpoints between Luis's reprocess request and the run, which still leaves it as it is. Only `p1-reviewed` still makes review acts in process; next, 4d (quarantine, back-office records, a certification's measurement and revocation), and 2.7.1 closes.** **Piece 4b2 is built (ADR-499): `POST /projects/:projectId/reprocesses` (*correct*) takes tickets named, or a set-aside job's id, and queues one `REPROCESS` job naming the person, changing no record; a ticket locked as invoiced is left off and counted; a job set aside is an error line each in the worker's log, coded `JOB_SET_ASIDE` (what queued it, its tickets, its tries, `RUN_FAILED` with the error's kind or `STOPPED_WITHOUT_A_WORD`); `QueueRuns.asked` is gone, every story's reprocess is a person's request. Next, 4c: QC, the lock, a batch, the unlock.** **The user decided (ADR-498): a reprocess a person asks for with nothing changed gets an endpoint in Phase 2 (an admin, or a manager/analyst with *correct*; it only queues a `REPROCESS` job), overturning ADR-497 (4); a job set aside after five failed tries is logged as an error with the code `JOB_SET_ASIDE`, to filter on, no alert; and a set-aside job is put back through the same endpoint. Built next, as 2.7.1 piece 4b2, before 4c.** **Piece 4b is done (ADR-497): every void, unvoid, flag accepted, correction and renumber of `p1-voided`, `p1-left-out`, `p1-reconciled` and `p1-priced` is Luis's request at his browser; the by-hand corrections and their jobs are gone (each endpoint queues its own); Dana grants at `setPermissions`; a refusal is checked as the door's 403 or the endpoint's 422 with the rule's words. A reprocess asked with nothing changed stays without an endpoint in Phase 2 (agent default). Next, 4c: QC, the lock, a batch, the unlock.** **Task 2.7.1's part 4 is cut in four pieces (ADR-496), and 4a is done: the back office and the read-only viewers reach a story's API at their browsers, signed in as real people are (`OfficeBrowser`, `story.backOffice`: password, authenticator code, the session as cookies, CSRF past a GET; the first admin's password set on the server, everyone else's first by an admin at its endpoint); `p1-viewed`'s every read goes through `/viewer/…`. Next, 4b: voids, acceptances, corrections and renumbers.** **The user closed KD-77, as built (ADR-495): a turned-in phone's key is revoked as it is told to wipe; ARCHITECTURE §7.4, AC-02-61 and AC-05-56 reworded; and confirmed ADR-494's defaults.** **Task 2.7.1 (the stories sync through the real endpoints) is cut in four (ADR-491); parts 1 to 3 are done (ADR-492…494). Part 3: every story's queue is drained by the worker's own job loop on the story's database and clock; no story asks the worker for a run, and the golden mission, its figures unmoved, checks that every run on its projects took up queued jobs. Parts 1 and 2: every request a story's phone makes (enrolment, a monitor created, a sign-in, a session and the choices under the master passcode, its lists, a sync, a file's part, the turn-in) goes over HTTPS through the API's own process, run on the story's database and clock behind the stack's proxy (`stories.adms.localhost`); the runner calls no phone service in process.** **Task 2.6.5 (a phone out of service, and turn-in) is closed in three parts (ADR-487…490), and with it Milestone 2.6 (sync):** a phone is turned in under the master passcode (`POST /phones/current/turn-ins`) only when everything it still holds is on the server from that phone; then its blocks end, it is out of service, its sessions end and its key is revoked, the database letting nobody else revoke a key; the sync contract's suite holds a client to it; every request of a proven phone is counted for that phone too. **KD-77 asks the user** whether the key is revoked as the wipe is ordered (as built) or after it. REQ-004, 202a, 202b, 203 and 209 are ticked. Before it: **The user kept the map's file on its own route (ADR-486): KD-76 closed, AC-10-47 and ARCHITECTURE §6 reworded to name both endpoints that take a file.** **Task 2.6.4's fifth and last part is built (ADR-484, 485), and 2.6.4 is closed: the back office sends a map's file (a zipped shapefile, converted from its `.prj` where it is projected, or a GeoJSON file) whole, up to 16 MiB, to a route of its own (`POST /projects/:projectId/map-files`); the API reads it (`MapFileReader`: `shpjs`, `but-unzip`, `proj4`, pinned by ADR-484; a zip bounded unzipped and in files) and keeps it once by its SHA-256 under its project, only when it holds a shape; a map version (`MapVersion.uploadedFileKey`) or a site's next shape is then loaded from the file as kept, its fingerprint checked again. Two faults of the libraries' are guarded (a zip reader that loops for ever, a `.dbf` reader that trusts its header). **KD-76 (a second endpoint takes a file) is closed by the user: kept, ADR-486.** Before it: **Task 2.6.4's fourth part is built (ADR-483): the harness's phone makes a real file for each photograph, its record's fingerprint that file's SHA-256, and sends it to the media endpoint after the sync that saved the record, in parts, each from where the server says it stands, until kept; `syncClientSuite` holds any client to that (five new checks, each catching a fault no other does); the story `interrupted-upload` tells an upload interrupted and continued, an API started again, and a file changed on the phone set aside; the back office reads a kept file (`GET /photographs/:photoId/files/:file`) as the bytes stored, under their own type, as a download never run, and never one that isn't the one fingerprinted. A story's files are kept in a store of its own, in memory. Part 5 (the map's files) is next.** Before it: **Task 2.6.4's third part is built (ADR-482): the media endpoint, the one endpoint that takes a file. A phone sends a photograph's file (or the depth file beside it) by the photograph's id, in parts that go on where the last one ended; unfinished parts are held only in the API's memory, bounded; the file is checked (size, an image by its first bytes, then the whole file's SHA-256 against the record's) and kept once at its place, its upload time written by the phone; a whole file that isn't the one fingerprinted is set aside for a person (`set_aside_file`) and the phone sends again. The record now carries the depth file's own fingerprint (`depthSha256`, replacing `depthFile`). Part 4 (the harness and the stories, and the back office's read of a file) is next.** Before it: **Task 2.6.4's second part is built (ADR-481): a photograph's record is a sync's own part, `photos`, sent after the records with both fingerprints and never a place; the server makes the place (`projects/<project>/photos/<photograph>`), holds one whose record it doesn't have saved (`OWNER_NOT_SAVED`), joins the rest to the ledger and queues what reads them; the harness's phones send their photographs in their syncs and every story's certification its five, so `CERTIFICATION_PHOTO_MISSING` stands on none. Part 3, the media endpoint, is next.** Before it: **Task 2.6.4 (photographs) is cut in five (ADR-478) and its first part is built: the object store's client (`@aws-sdk/client-s3`, ADR-479), the media bucket, the API's own identity at the store, which may put and get an object and nothing else, and `MediaStore`, which keeps a file once and never overwrites, deletes or lists (ADR-480; "Time and photos", below). Part 2, a photograph's record in the sync contract, is next.** Before it: **The user's hard rule (ADR-477): once a monitor submits a record on the phone it is sealed for them, synced or not; only the back office changes it. One not yet submitted stays open and theirs to adjust, for days if need be. "Reopenable until the shift ends" (ADR-240 (6), 072) is overturned, the edit log is withdrawn with task 2.6.3, and ADR-476's table, built and taken out again the same day, was never committed. Task 2.6.4 (photographs) is next.** Before it: **Task 2.6.2 is closed (ADR-475): every story's phone syncs through the API's own `Sync` (`story.server`), the stand-in is gone, and the story `held-for-review` tells what a sync can't save.** Before it: **The user confirmed two of ADR-473's defaults (ADR-474): the lists stay out of a sync's answer (2.6.5 decides whether a proven phone with nobody signed in may read them), and the clock's limit is 5 minutes.** Before it: **Task 2.6.2's third part is built (ADR-473): a sync's answer brings the master passcode's version, with its check where the phone holds another, and the setup version of the project whose lists the phone holds, never the lists (those stay a signed-in monitor's phone's own reads); `Sync.setupVersionSent` is written once; the worker reads a field event's sync through the ledger and flags a sync whose phone's clock stood more than `DEVICE_CLOCK_OFF_LIMIT_MINUTES` (5) whole minutes off; part 4 (the harness's phones through `Sync`) is next.** Before it: **Task 2.6.2's second part is built (ADR-472): a proven phone syncs at `POST /phones/current/syncs` (`Sync`, `apps/api/src/sync/sync.ts`); the sync is kept first with both clocks, each thing sent is its own piece of work and answer, a record's ledger row and its job are written with it, and what can't be saved is held once by fingerprint and its phone told so; REQ-016 is ticked; part 3 (what the answer carries besides the answers, and the worker reading the clock's difference) is next.** Before it: **Task 2.6.2 (the sync endpoint) is cut in four and its first part is built (ADR-471): a sync, the idempotency ledger and a held record are tables with their own guards (`sync`, `synced_record`, `held_record`); the ledger holds only what the server stored, and a record it could not save is a held record (ADR-468 (3)'s last sentence amended); part 2, the service and the endpoint, is next.** Before it: **Task 2.6.1 (the sync contract) is done: its fourth part is the suite any client must pass, `syncClientSuite`, with the client's rule for reading an answer (`syncAnswerRead`), and the harness's phone is now a client of the contract and held to the suite (ADR-470); 23 of Phase 2's 32 tasks are done, and 2.6.2 (the endpoint) is next.** Before it: **Task 2.6.1's third part is built (ADR-469): a certification made on a phone is the sync contract's seventh kind of record, sent with its measured boxes and never a capacity; what `certify` refuses is answered `NOT_SAVED`, `CERTIFICATION_REFUSED`.** **The user decided (ADR-468): a record the server can't save is held on the server for a person, built with 2.6.2.** Phase 2 (API and sync) is open (ADR-376):
  22 of its 32 tasks are done, and **task 2.6.1 (the sync contract) is cut in four with three parts built: the records a phone sends, as schemas (ADR-466), the whole payload and its answer (ADR-467), and a certification made on a phone (ADR-469)**. Before it: **task 2.5.4 (what a phone reports besides field events) closed with its fifth part, every other use of the master passcode a phone logged (ADR-464); REQ-202b stays open for the turn-in's use (2.6.5); `pnpm lint` states its heap (ADR-465).** Before it, **2.5.3 (the lists a phone takes, in five parts,
  ADR-449…451, 453, 454; its last, an address looked up for a phone's GPS, ADR-455)**; **2.5.4
  (what a phone reports besides field events) is cut in five (ADR-462) and its parts 1 to 4 are
  done (part 4, what a phone being set up online picks from, read only with the master passcode
  sent, ADR-463): an unplanned assignment arrives from the phone it was made on (ADR-456, 457); a site
  move and a monitor switch are reported the same way, the sign-in taking the one made on the
  phone last (ADR-458); and a session is opened on a phone under the master passcode, with a
  connection, marked as the passcode's (ADR-462).** **The user approved ARCHITECTURE §7.2's notes on signing in online and taking the assignment (ADR-452).** Before them, the
  entries were housekeeping at the user's word (ADR-445…448): the chain's counts in one file, the
  `adms-verify` skill cut to the chain with a page per layer, the stories run once, a run's
  template database, and a container kept when nothing changed ("Agent tooling and terms",
  below). **No KD is open:** KD-77 was closed by the user (ADR-495: the key revoked as the wipe is ordered; KD-76 was closed by the user, ADR-486). `spec/acceptance/10-api-and-sync.md` and `spec/THREAT-MODEL.md` are
  approved by the user (ADR-386, 393). The task-by-task line that stood here moved word for word
  to `DECISIONS.md`'s scratchpad, "Moved 2026-10-09 (ADR-445)".
- **Read this page by topic, never whole** (ADR-445): it is some 300 KB. Read this header, §4 (what
  waits on the user) when your task touches a default, and the `###` topics you are about to
  touch (`grep -n '^### ' agent_store/SUMMARY.md`).
- **Where things stand, the road and the next task:** `NEXT.md`. The roadmap in tables:
  `ROADMAP.md`. Names, examples and formats: `spec/CONVENTIONS.md`. The task-by-task record of
  Phase 1 that used to sit here: `DECISIONS.md`'s scratchpad, "Moved 2026-10-06 (ADR-375)".

---

## 1. Current rules, by topic

Cite the ADRs in brackets. Each topic's detail is in the named skill.

### Foundation, stack and security — `spec/ARCHITECTURE.md` (**approved in full**, §1–§18) [104, 139, 141, 143, 144]
- **Security first, at every layer.** The plan (skills, spec, ADRs) is the core; **`database/` is
  historical** (read-only), and the engine is rebuilt 100%. **Phase 0 (Foundation)** came first:
  approve the architecture, answer the foundation questions, scaffold, prove the database
  hardening, run the scenario harness. Then the rebuild: **Phase 1, open since 2026-10-01**. [093,
  103, 299]
- **TypeScript on Node end to end, Prisma** (multi-file schema, readable class-style code, no
  hand-written SQL for modelling). Rules that must match on phone and server live once, in a shared
  domain package. Python leaves the core. The §3 stack table is approved (NestJS on Fastify, Zod contracts, a Postgres job queue, React + Vite, Capacitor, encrypted SQLite, Caddy…); each exact package and version is pinned by an ADR when added. **Milestone 0.2 (scaffold) is done.** [143, 266] **The skeleton (0.2.1):** a **pnpm 11.27.1** workspace, settings in `pnpm-workspace.yaml`: no version younger than 7 days, no install scripts unless an ADR allows one by name, exotic sub-dependencies refused, engines strict, exact versions; **Node 24 LTS** (`.nvmrc` 24, `engines` `>=24.21.0 <25`); eleven private `@open-adms/…` workspaces (§18 plus `tools/licences`), licence field `AGPL-3.0-only` (agent default) [255]. **TypeScript 6.0.3** strict (not 7: typescript-eslint supports only <6.1), one `tsconfig.base.json`, project references, `pnpm typecheck` = `tsc --build` [256]. **ESLint 10 + typescript-eslint (strict, type-checked) + Prettier**, `pnpm lint`; Prettier never touches `spec/`, `agent_store/` or `.claude/` [257]. **`pnpm licences`** fails on any licence refused or undecided [258]. **Tests (0.2.2):** **Vitest 5.0.1 on Vite 8.3.0**, one run from the root, `pnpm test` = `tsc --build && vitest run`; tests in `<workspace>/test/` with their own tsconfig (typechecked and linted, never in `dist/`); a workspace joins `vitest.config.js` with its first test [259]. **`contracts` (Zod 4.6.5) depends on `domain` only; `domain` on nothing**; both hold only a wiring probe until Phase 1 [261]. **The local stack (0.2.3):** `infra/local`, one compose project run by `pnpm local:up` / `local:down` / `local:wipe` / `local:status`: **Postgres 18.6**, **SeaweedFS 4.47** as the S3 store (MinIO's repository is archived), **Caddy 2.11.4** with its internal CA on `*.adms.localhost` (health page `https://adms.localhost/health`; `s3.` and `mail.` beside it), **Mailpit 1.31.2**; every image pinned by tag and digest [264]. Every port on 127.0.0.1 (Postgres on **55432**); plain HTTP redirected to HTTPS; dev passwords generated into a git-ignored `infra/local/.env` (mode 0600), handed to containers as files, never printed; `down` keeps data, `wipe` makes the next run a first run. SeaweedFS lets a non-empty *versioned* bucket be deleted, so the API's S3 identity will never hold bucket-delete [263]. **The installer (0.2.4):** **`pnpm installer`** (`pnpm setup` is pnpm's own command), `installer:check`, `installer:teardown`. A first run asks three things (the firm's name; email through the local mail catcher or none; the master passcode, twice, unseen), makes every secret once, and writes **one owner-only, git-ignored env file per service with only its own logins** (`packages/db/.env`: `adms_owner` only; the master passcode's **Argon2id** hash is kept in the database alone, ADR-281; `apps/api/.env`: `adms_api`, `adms_readonly`, the token signing secret, `SMTP_URL`; `apps/worker/.env`: `adms_worker`), plus a secret-free record in `tools/setup/.state/`. It creates the four login roles of §5.1 (no superuser, create, replication or RLS-bypass rights) from **SCRAM verifiers it makes itself**, so no password reaches the server, and database **`adms`** owned by `adms_owner`, open only to the logins. A rerun says what it knows, re-checks it, asks once to resume, puts back what it can with the secrets it has, and **stops rather than remake a lost secret**; teardown drops the database and logins and removes the files. Migrations and the seed are stubs until 0.3. Talks to Postgres through **`pg` 8.23.0** (the driver Prisma 7's adapter uses). *Agent defaults:* the names, the questions, a passcode of 8–128 characters [265, 266]. Each run also creates the shadow database **`adms_shadow`** (owner only, for `prisma migrate dev`), runs **`prisma migrate deploy`** as `adms_owner`, and the re-check includes `prisma migrate status`; a stray `DATABASE_URL` in the shell is ignored [268]. **Prisma (0.3.1):** the **`prisma` CLI 7.10.0** (stable; npm's `latest` is an 8.0 release candidate), a dev dependency of `packages/db`; its install scripts refused (`allowBuilds: false`), the schema engine fetched and SHA-256-checked on first use; Prisma Studio's `elkjs` (EPL-2.0) and `@visx/vendor` allowed **by name and version** as dev-only (ADR-262); `@prisma/client` and `@prisma/adapter-pg` join when code first queries [267]. `packages/db/prisma.config.js` reads `packages/db/.env`. **The schema is provisional** until `spec/DATA-MODEL.md`: nine models (thirteen since 0.4.3, ADR-281, below) in five files by kind of record (`Project`, `Contractor`, `User`, `Device`; `FieldEvent`; `CompletedLoad`, `Transaction`, `InvoiceLock`; `AuditRecord`), ids UUIDv7 made by the database (`uuidv7()`, a field event's from the phone), every foreign key `RESTRICT` on delete and update, ticket numbers as text, an empty split suffix when not split (so the unique key holds) [268]. The chain and its expected counts: `adms-verify`. Prisma
  was re-checked against Drizzle and Atlas and **kept**: **no business logic in the database**; the
  database holds only guards, each written as its own reviewed, tested migration. **Never edit a
  generated or applied migration** (the hook allows writing only into Prisma's empty stub). [094, 113]
- **The database enforces the rules itself**: per-service roles and least-privilege grants, no
  deletes, audit written by triggers with a required actor, `AuditRecord` insert-only, transaction
  deletes copied to audit first. Approved (§5). [097, 113] **Built (0.3.2):** nine guard migrations
  in `packages/db/prisma/migrations/`: kind-in-workflow and load-call checks (0–100, DIS and HOC
  only, missing allowed); least-privilege grants, column-level on evidence (the API corrects captured
  columns, the worker writes only `status`, `reconciled_at`), nothing by default; delete and truncate
  refused for everyone; audit by trigger with **`adms.actor_id` and `adms.source` required**
  (transaction-local settings; device, reason, request optional; domains per table); audit
  append-only; a transaction delete copied to audit first and refused on an invoice-locked load;
  row-level security with `viewer_*` views, the viewer stated per request (since ADR-315 as
  `adms.viewer_id` alone; the two settings ADR-270 named are gone), fail closed. The worker's system
  actor is a `User` row (ADR-273 below). [270] **A new table is guarded in one
  line** (the user wants hand-written SQL near zero): its model in the right `.prisma` file, then a
  guard migration `SELECT guard_table('<table>', '<CONFIGURATION|MARK|EVIDENCE|DERIVED>',
  '<domain>'[, ARRAY[<worker columns>]]);` (rerun when an evidence model gains a column); the
  installer stops while `guard_gaps()` lists any unguarded table. Row-level security for a table
  viewers see stays its own decision. [271] **Proven (0.3.3):** 94 tests in `packages/db/test`
  (Vitest, `pg`, as the local stack's administrator with `SET LOCAL ROLE`, each test's work rolled
  back on a fresh example world; they need `pnpm local:up` and `pnpm installer` at head). They read
  every grant, trigger, check and policy exactly and try each write as each login; 26 loosened or
  removed guards, each on a throw-away copy, were all caught. `guard_gaps()` now asks what a trigger
  fires on (a dropped delete refusal had gone unseen; fixed forward). [272] **Every service write goes
  through `db.$write(actor, (tx) => …)`** (`packages/db`, a Prisma client extension over
  `@prisma/adapter-pg`, both 7.10.0): one database transaction whose first statement states the
  actor, source and, when known, device, reason and request, as transaction-local settings; a write
  outside it states no actor and the database refuses it. The client is generated into
  `packages/db/src/generated/` (git-ignored) by `pnpm generate`, which typecheck, test and lint run
  first. **The worker's system actor:** `User` role **`SYSTEM`** (never a login), id
  `00000000-0000-7000-8000-000000000001` in every installation, "Open ADMS (system)", seeded by the
  installer (`prisma db seed`, as `adms_owner`, with itself as actor), which stops if it finds it
  changed. *Agent defaults.* [273] **Only the worker writes as the system actor:** a write stating
  it, or source `SYSTEM`, is refused unless the writing login is `adms_worker` or `adms_owner` (the
  seed); no login but `adms_owner` changes its row, makes it or gives role `SYSTEM` to anyone;
  `SYSTEM` is that one id, with no Monitor ID and no contractor. The worker may still state a person
  (a reprocess a person asked for) until Phase 1's worker decides. `installer:check` looks at it (its
  20th ✓). [276] **An applied migration is never edited:** a test checks each `migration.sql` against
  the checksum Prisma recorded. [276] [274] **The scenario harness (0.4.1):** `packages/scenarios`, run by **`pnpm scenarios`**
  (`[name…]`, `--keep`, `list`, `clean`; exit 1 on any failed check). **Each story runs on its own
  database**, never `adms`: `adms_story_…`, made by the local stack's administrator from `template0`,
  owned by `adms_owner`, open only to the logins (checked), migrated through
  **`packages/db/prisma.story.config.js`** (same migrations and owner login; it can reach only an
  `adms_story_…` database, named by `ADMS_STORY_DATABASE`), seeded, and **dropped afterwards**. Every
  row goes through `$write` as the services' own logins. A **story clock** (never the machine's);
  **simulated offline phones** that stamp their own clock and offset, make each field event's UUIDv7
  id at the badge scan and keep it until they sync; a **stand-in for the API's sync** (`adms_api`,
  actor the monitor, source `DEVICE`, the phone's id, received time from the story clock). First story:
  **`ticket-101001`**, the golden mission's first load, synced out of order, ending `PENDING` (the
  engine is Phase 1's). *Agent defaults.* [275]
- **The security checks run with one command, `pnpm security`, with real counts** (REQ-018): the
  **dependency audit** (`pnpm audit`: **every advisory, at any severity, fails**, unless accepted by
  its GitHub advisory id in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas`, each with an ADR saying
  why it can't be reached; today three inside the Prisma CLI, looked at again at every Prisma
  upgrade); the **secrets scan** over exactly the files git would commit (secretlint 13.0.5's
  recommended rules, the installation's own secrets from its env files, and password-like settings
  with a literal value), printing **file, line and rule only, never a secret**; every inline
  `secretlint-disable-next-line` carries its reason and is named on every run; **every `.env` file
  ignored by git and untracked**; the **grant tests**. The database's configuration is tested against
  the **CIS PostgreSQL Benchmark** items for this layer (SCRAM only from outside the container, no
  `PUBLIC` rights, row security on, `adms_owner` owns everything); TLS, connection logging and pgAudit
  wait for the demo deploy. *Agent defaults.* [276]
- **The Phase 0 models (0.4.3), all provisional until `spec/DATA-MODEL.md`:** thirteen models then (fifteen with ADR-286's pay item, below).
  **`MasterPasscode`**: a version and its slow hash (a check holds it to an Argon2id PHC string); a
  change is a new version, never an edit; the API reads and inserts, the worker and viewers can't
  read it; **the seed writes version 1 from a hash the installer hands it in memory, never through a
  file**; an installation made earlier has it moved out of `packages/db/.env` on its next run; **a
  database that lost it asks for the passcode again** (the firm's own secret). **The audit capture
  leaves named columns out** (`audit_capture('SECURITY', 'hash')`: the record says the column changed,
  never its value), the path for password hashes in Phase 2. **`NumberBlock`**: device, project,
  series (`LOAD · HAUL_OUT · UNIT_RATE · CERTIFICATION`), first, last, last used, `ISSUED · RECLAIMED ·
  RETIRED`; the series, the allocator and the refusal of overlapping blocks are built (ADR-323).
  **`DisposalSite`** (project and name only, built in full since ADR-311) so an assignment's site
  can only be its own project's.
  **`Assignment`**: person, work date, project, the kinds of field event they may record, certifying,
  an optional site and phone, `PLANNED` (with its author) or `UNPLANNED` (no author, always its phone,
  its id from the phone), withdrawn by archiving; no uniqueness on person or phone and day; **its forms
  join in Phase 1** (C42; its unit rate pay items are built, ADR-286). **Every field event carries `assignmentId` and
  `setupVersion`**, corrected by permission like any captured field. **No read-only viewer sees any
  of the four new tables** (no view, no grant, so no policy yet). The system actor is never assigned,
  never writes the board, never records a field event and has no employer. *Agent defaults.* [281]
- **An assignment names its unit rate pay items (REQ-020 met in full):** a provisional **`PayItem`**
  (its project, the firm's code, unique on its project, and its description; ADR-301) and **`AssignmentPayItem`**, tied
  to the assignment's own project by two two-column foreign keys; a pay item is taken off by
  archiving, never deleted; an assignment that names pay items stays on its project. `pay_item` is
  audited in the billing domain. Fifteen provisional models, twenty migrations (the twentieth:
  ADR-301). Whether a named pay item is a unit rate one is Phase 1's to check. *Agent defaults.* [286, 301]
- **The firm's lists are built (Phase 1, task 1.1.2):** eighteen tables, **one per list**
  (`ProgramType`, `DeclarationReferenceType`, `DebrisType`, `ReductionMethod`, `PayableType`,
  `KindOfWork`, `ItemName`, `VehicleType`, `VehicleFeature`, `CrewType`, `SiteType`, `SiteLabel`,
  `IncidentType`, `IncidentSubType`, `Reason`, `SurveyWorkType`, `ClockActivity`, `FieldTag`), each
  with a key, a name, a position and its own columns; three more closed sets (`CountShape`,
  `ReasonUse`, `CertificationKind`). **The built-in keys are one closed set in `packages/domain`**
  (`builtInKeys`: `STUMPS`; `TDSR`, `FINAL_DISPOSAL`; `PRE_WORK`, `POST_WORK`, `ROE`), and
  `packages/db` depends on `domain` for its types only, so the seed can write no other key and the
  installer still needs no build. **The database keeps two rules itself:** only a release
  (`adms_owner`: the migrations and the seed) writes a key, so a firm's own value never has one and a
  built-in value's never changes; and a value with a key is never archived, by anyone. **A new list
  is guarded in one line:** `SELECT guard_list('<table>', '<domain>');` (`guard_table` plus those
  two). Audited in the operations domain; no read-only viewer sees a list yet, so no row-level
  security (since ADR-315 a client user and an auditor read the lists; a contractor user none). **The seed writes a list's starting values once, into an empty list**, as
  the system actor (94 values in 15 lists; site labels, incident sub-types and field tags start
  empty); a list that holds anything is the firm's and gets only a built-in value it lacks, which is
  how a release adds one. Thirty-three models, twenty-two migrations. The starting values where
  `spec/LISTS.md` gave none are in its "What ships" section. *Agent defaults.* [302]
- **The client, the declaration event and the project are built in full (Phase 1, task 1.1.3):**
  `Client` and `DeclarationEvent` (its reference as written, its reference type picked from the
  firm's list), firm-wide; `Project` with its client, declaration event, program type, *Allow split
  loads*, active window (calendar days; the end optional, never before the start), ticket-number
  source (`CONTROL` · `GENERATED`), ticket types and settings; `ProjectKindOfWork` (a kind is taken
  off by archiving). **No setting has a default in the database:** what a new project's settings
  start as is one rule in `packages/domain`, `NewProjectSettings`: *Allow split loads* from the
  program type's *Requires ROE*, both stump checks on, **the time clock switched off** (the project
  doesn't offer its workers the option to log their hours until the firm switches it on; confirmed
  by the user, ADR-304), and the numbers from
  the **policy values**. **A policy value** has a name the domain owns (`LOAD_CALL_LOW_LIMIT`,
  `LOAD_CALL_HIGH_LIMIT`, `DISPOSAL_SITE_PROXIMITY_M`, `STUMP_FILL_DEPTH_INCHES`); the domain's
  `Policy` refuses one that is missing or out of range and never stands a number in for it; **the
  release's built-in defaults are the committed env file `packages/domain/policy.env`** (5, 95,
  200, 31), read by a server app and handed to the domain (invariant 16 as built). **An
  installation may state its own value** under the same name in a service's own settings (its
  env file or its environment): it wins over the release's, is held to the same range, and one
  the domain refuses stops the start, named, never shown; for a new project's settings it holds
  for projects made afterwards (C53 decided, ADR-395). The
  database itself refuses a project with no ticket-type list, a window that ends before it starts,
  a load-call limit outside 0–100, and a fill depth or site circle under 1. The three new tables
  are guarded in one line each, in the operations domain; no read-only viewer sees them, and the
  project's viewer view shows none of the new columns (since ADR-315 a client user and an auditor see
  them all; a contractor user still the five). Thirty-six models,
  twenty-four migrations. *Agent defaults.* [303]
- **Contractors on a project, and contracts, are built (Phase 1, task 1.1.4):** `Contractor` has
  a **kind** (`ContractorKind`: `HAULER` · `MONITORING` · `CREW` · `OTHER`; no default, whoever adds
  it says which), **contact details** (a contact name, email and phone, each optional, edited
  freely and audited, the same three a client holds: the user's word, ADR-306) and a merge link (`mergedIntoId`: never itself; a merged contractor is archived
  for as long as it is merged). **`ProjectContractor`** is a contractor's place on a project
  (`ContractorPosition`: `PRIME` · `SUB_TIER_1` · `SUB_TIER_2`): **one place per project**, so a
  sub is never shared by two primes; a sub names its prime, tier 1 and tier 2 alike, and a prime
  names none; taken off a project by archiving. **`Contract`**: its project, a name, its prime, an
  optional link, nothing else; a prime may hold one or several. **The database itself holds "the
  prime" to one of the project's primes:** a prime's row carries its own contractor again as
  `asPrimeId`, unique with the project, and a sub's prime and a contract's prime are two-column
  foreign keys to it. So a sub under a sub, a prime borrowed from another project and a contract
  written before its prime is on the project are refused, and a prime that a sub or a contract
  names can't be made a sub; no trigger does it. **Whoever adds a prime writes `asPrimeId`**; a
  rate's prime and a certification's prime will point at the same key (C56). `project_contractor`
  is audited in the operations domain, `contract` in billing; no read-only viewer sees either
  (since ADR-315 a client user and an auditor see both, never a contact detail). What a
  merge moves is the certification task's (C56). Thirty-eight models, twenty-seven migrations.
  *Agent defaults, seen by the user ("the rest of this is good to go", ADR-306).* [305, 306]
- **Forms, debris types on them, field tags, the firm's own fields (built 2026-10-02, task 1.1.5):**
  `Form`, `FormDebrisType`, `FormDefinition` and `Assignment.formDocumentTypes`, as the "Forms:"
  bullet below states them; a row that belongs only on some kinds of form repeats its form's document type,
  held by a check and a two-column foreign key to `form (id, document_type)`; a definition version
  is never edited by anyone (`refuse_edit()`). Forty-one models, twenty-nine migrations. *Agent
  defaults.* [308]
- **Pay items in full (built 2026-10-02, task 1.1.6):** `PayItem`'s every field of DATA-MODEL §3
  (payable type required; `BillingUnit`; kind of work on a unit rate one; band from and to, inches
  to a tenth, both ends included, either open; the seven capture settings, each stated, no default;
  `CrewTimeConversion` only on an `HR` or `CREW_DAY` pay item, the day length only on an exact one,
  starting at the policy value **`CREW_DAY_HOURS=12`**); `PayItemRate` (one per prime, the prime held
  by ADR-305's key, so never a sub or a contractor off the project; archived, never deleted; a
  change's prior value is the audit log's); `PayItemCrewDayStep` (hours to the quarter within a
  day, a quantity); `AssignmentPayItem` repeats the pay item's kind of work, so **only a unit rate
  pay item can be named** (C42, a three-column foreign key). **`SizeBands` (`packages/domain`)**
  refuses a band that overlaps another of its payable type, naming each, and warns of a gap; the
  database refuses an overlap too since ADR-310 (an exclusion constraint; `btree_gist` in a schema of
  its own, `extensions`, that no runtime login may use). Forty-three models, thirty-one
  migrations. *Agent defaults.* [309]
- **Disposal sites in full, and the project map (built 2026-10-02, task 1.1.7):** `DisposalSite`
  (site type, and the type's built-in key again as `siteTypeKey`; the four facts, none with a
  default; permit; GPS `decimal(38,8)` on the earth; activation and close dates, never closing
  before it opens; short code); `DisposalSiteLabel`; **`DisposalSiteTippingFee`, several per site**
  (per CY and per ton, and more where a contract needs them; ADR-222's "Service(s)", in place of DATA-MODEL's one link, KD-67; **confirmed by the user, ADR-312**), held to
  the site's own project's pay items and audited in billing; `SiteAreaVersion`, `MapVersion` and
  `Zone`, **never edited or deleted**, versions from 1, and **a zone written only with its
  version**. **The database refuses *Haul-outs leave here* off a TDSR/DMS site, and a marked site's
  type changing** (C52: a check on the repeated key, held by a two-column foreign key; no trigger);
  setup says so first (`SiteFacts` in `packages/domain`). **Shapes are GeoJSON** `Polygon` or
  `MultiPolygon` in longitude and latitude, as JSONB, checked to hold their type and coordinates,
  each with a bounding box of four `decimal(38,8)` columns; **Phase 1 takes shapes in as GeoJSON
  only** (a shapefile, KML and an Esri layer: REQ-124b, Phase 4); reading a shape and its box, and
  point-in-polygon, are the domain's later (C57). The site circle stays one project setting. Forty-eight
  models, thirty-five migrations. *Agent defaults, except the several fee links, which the user confirmed.* [310, 311, 312]
- **Rules (built 2026-10-03, task 1.1.8):** `Rule` (its project, **one of that project's load,
  haul-out or unit rate forms**, held by one foreign key with the form's document type repeated; a
  name; **one of the project's contracts**, or none; Active, with no default; the pay item whose
  "Pays when" wrote it), `RuleCriterion` (its place, criterion, operator, a typed number, date or
  text), `RuleCriterionPick`, `RuleAction` (*Add transaction* # and pay item, *Remove transaction* #,
  *Void ticket*; *Quantity from* stated on every Add) and `RuleActionItem`; every line is taken off
  by archiving. **The database refuses** an operator that isn't its criterion's kind's, a value that
  isn't its operator's (BETWEEN lower end first), a pick that doesn't fill the one column its
  criterion picks from, and **a picked value that isn't the rule's own project's** (a contractor on
  the project; a debris type of the rule's own form; a field tag, site or pay item of the project);
  a zone is picked by name. **What `spec/RULES.md` §7 calls not valid is saved and never runs**
  ("Is valid" is no column). **In `packages/domain`:** `RuleCriteria` (the criteria a form takes,
  each one's kind of value and operators), `RuleValidity` (§7, every reason in plain words),
  `ProjectRules.check` (refuses an exact copy, "Not saved: this rule is the same as "…"."; refuses a
  change in the rule builder to a rule a pay item wrote; **warns**, code `RULES_OVERLAP`, when two
  rules of one form and contract add the same # and nothing in their criteria keeps them apart,
  naming where a shared range overlaps) and `PaysWhen` (one rule per form the pay item pays on and
  per contract whose prime has a rate, named "`<code> - <description>`"). **An *Item* line is one
  picked item and a number operator on its count**; the list operators aren't taken on *Item*.
  Audited in billing; since ADR-315 a client user and an auditor see their projects' rules. An archived
  pay item, contract or form makes a rule naming it not valid, so it never runs, and the setup check lists it (agent default, ADR-357). Fifty-three models,
  thirty-seven migrations. *Agent defaults.* [313]
- **People's permissions and read-only viewers (built 2026-10-03, task 1.1.10):** `UserPermission`
  (a person and one of the ten permissions, once; **taken away by archiving, given back by clearing
  it**, never a second row; never the system actor's; the database doesn't tie it to the role
  manager/analyst, which is the API's to read); `ViewerProject`, **table `user_viewer_project`** (a
  project once per viewer, taken away by archiving); `User.viewerKind` (`CLIENT · CONTRACTOR ·
  AUDITOR`: every read-only viewer states it and nobody else does; **a contractor user names its
  contractor and nobody else does**), `email`, `phone`; `Device.keyRevokedAt` (only on a phone out
  of service, never before its removal time; the refusal is Phase 2's). Both tables audited in the
  **security** domain. **The viewer of a request is read from their own record:** the API states
  only `adms.viewer_id`; `viewer_sees_project`, `viewer_sees_every_ticket` and
  `viewer_is_contractor` read the person (a read-only viewer, not archived), the projects given and
  not taken away, the kind and the contractor, with the owner's rights; anyone else, or nobody,
  sees nothing. **A table gets its viewer sight in one line:** `SELECT guard_viewer('<table>',
  '<PROJECT|PART_OF|NAMED_BY|FIRM>'[, relation, column][, hidden]);` (row-level security, the
  services' policy, the viewer's policy, the view `viewer_<table>`, exactly its columns granted).
  **A client user and an auditor see** their projects' whole setup (21 project tables), the
  project's settings (`viewer_project_setup`, the one view run with the owner's rights, since
  row-level security can't tell columns apart), the client, declaration event and contractors
  their projects name, and the firm's lists. **A contractor user sees** the project's name, time
  zone and dates, and no setup at all (since ADR-361: also its own place on the project, its
  subs', and three names a ticket is read with; the point below). **No viewer reads** a contact name, email or phone, a
  client's notes, a map's uploaded file key, or any person, permission, phone, assignment, number
  block or the master passcode. Fifty-five models, thirty-nine migrations. Left for later: C59.
  *Agent defaults.* [315]
- **What a contractor user sees of its own tickets (task 1.7.3, 2026-10-06)** [361]: **whose work
  a ticket is, is told in one place, the certification its field events found.** A contractor
  user sees, in the projects it is given: the certifications that name its contractor, as the
  prime (so a prime sees its subs' too) or as either tier of sub, with boxes and helpers, never
  the driver's phone or licence number; the field events that found one of those (item lines and
  carried tickets with them); a completed load or haul-out with its disposal event, a property's
  or pile's row with its collection event; a scale receipt one of its field events points at; the
  photographs' records of those field events, certifications and receipts; its own place on the
  project and, a prime, its subs', and those contractors by name. **A field event whose badge
  found no certification is no contractor's** (fail closed). **No flag, no monitor's name, no
  ROE, form or quarantined record, no list** (*agent defaults*). **A sub's contractor user reads
  no rate and no amount (the user, 2026-10-06):** the two columns are in no `viewer_transaction`
  and granted to no viewer on the table; `viewer_transaction_money` shows them to a client user,
  an auditor and the line's own prime's contractor user. **Three names of setup for every viewer
  given the project:** `viewer_pay_item_name`, `viewer_disposal_site_name`,
  `viewer_debris_type_name` (the owner's views). **`guard_viewer` takes `own`**, the question
  that makes a row a contractor user's own (only on a `PROJECT` table; asked as the viewer, so
  one that looks in another viewed table follows that table's policy): **every rerun of a
  table's line repeats its `own`** (`certification`, `project_contractor`, `field_event`, the
  four completed tables, `scale_receipt`, `photo`; `test/support/viewers.ts` holds each).
  *Agent defaults but the money, which is the user's.*
- **Whether a viewer sees private citizens by name is the firm's choice for each viewer (the
  user, ADR-328 (4); built 2026-10-04, C67 (d)):** `User.seesPrivateCitizens`, stated on every
  read-only viewer and on nobody else (a check), no database default; **a new viewer starts at
  yes** (`packages/domain`, `ViewerSettings.starting()`); changed at any time, audited (security).
  **The columns that name a private citizen** *(agent default)*: an ROE's `owner_name`, a
  drop-off log's `resident_name` and `origin_address`. They are in no `viewer_<table>` view and
  the read-only login holds no grant on them; `viewer_roe_citizen` and
  `viewer_drop_off_log_citizen` (id, project, those columns), run with the owner's rights behind
  a security barrier, show a row only to a client user or an auditor of its project whose record
  says yes (`viewer_sees_private_citizens()`, the viewer's fourth question). **One line says
  it:** `SELECT guard_viewer('roe', 'PROJECT', citizen => ARRAY['owner_name']);`. Not hidden,
  for the user to say: an ROE's address and parcel, free text, the firm's own form fields, a
  photograph of a signed form. A migration that writes a row states its actor inside one `DO`
  block. Sixty-one migrations; 58 test files, 1,173 tests. [328, 336]
- **The API's setup services, and where services live (built 2026-10-03, task 1.1.11):**
  `apps/api/src/<part>/`, plain classes, no HTTP, no sign-in, each given the API's database client,
  a clock and, where needed, the policy values (read by `apps/api/src/policy.ts`). `setup/`:
  `ProjectSetup`, `ContractorSetup`, `ListSetup`, `FormSetup`, `PayItemSetup`, `SiteSetup`,
  `RuleSetup`. **One call is one thing a person does and one `db.$write` as that person**; it
  answers saved (the record, any warnings) or refused (the domain's code and message; nothing
  saved); a refusal by the database's own constraints throws. **Permissions aren't read yet**
  (Phase 2). Every rule stays in `packages/domain` and is called before a save. `addPrime` is the
  one place that writes `asPrimeId`. A pay item's "Pays when" is matched to the rules it keeps
  (archive, add, change, leave); a changed rule's lines are archived and written anew, never
  edited. **`MapShapes`** (`packages/domain`) reads GeoJSON into a Polygon or MultiPolygon with its
  bounding box, and refuses the rest. **A map version's `loadedAt` is the database's own time**
  (40 migrations): Prisma's client fills `@default(now())` itself, so no guard compares such a
  column with `now()` (KD-68). The story `setup` runs it all: `pnpm scenarios` runs three stories
  (16, 18, 51 checks). *Agent defaults.* [316]
- **Certifications are built (2026-10-03, task 1.2.3):** `Certification` (every field of
  DATA-MODEL §3; its id the phone's; **no archive**: replaced, revoked or QC Void, it stays),
  `CertificationBox` and `CertificationHelper` (each taken off by archiving). **The database
  refuses:** a second certification of one number on a project (the same number on another
  project is fine, ADR-318); a blank number; a container with no capacity or a negative one (**0 CY
  is taken**), a crew with a capacity, a crew type on a container; **a box on a crew** (the box
  repeats its certification's kind, held by a foreign key) and **a container with no primary box**
  (two deferred constraint triggers, asked when the piece of work ends); a primary that isn't a
  rectangle that adds, or is archived; a box after it with no feature or with both a picked and a
  typed one; a radius corner that adds; a shape holding another shape's measurements, or one under
  1 (integers, so no fraction of an inch); a prime that isn't one of the project's primes; **a sub
  that isn't placed on that project under that prime** (three-column foreign keys to
  `project_contractor (project_id, contractor_id, prime_id)`, a new unique key), a second tier
  with no first, one contractor in both; a "replaces" with no reason, of another project's
  certification, of itself, or of one already replaced; a revocation without its date, reason and
  person; the system actor as certifier, revoker or helper; a helper twice. **Not held by the
  database:** which tier a sub's place is, a vehicle type's *certifies* against the kind, a
  certifying assignment, a helper's assignment (flag, never block). Audited in **billing** (the
  capacity is what loads bill by), helpers in operations. **A client user and an auditor see**
  their projects' certifications, boxes and helpers, never the driver's phone or licence number; a
  contractor user those that name its contractor (ADR-361). **In `packages/domain`:** `CertificationSubs` (a typed name is
  matched to the firm's contractors ignoring case and spacing; placed as typed it is named, known
  elsewhere in the firm it is placed, unknown it is a new contractor, a hauler on a container and
  a crew on a crew; **a name that already has another place on the project is never moved: the
  certification is saved under a separate contractor of that name, with the warning
  `SUB_PLACED_ELSEWHERE`**), `CertificationChanges` (a replacement and a revocation say why) and `ContractorMerge` (the kept record takes
  the duplicate's place on each project; refused into itself, of a merged record, into an archived
  one, of a prime, or where the two are placed differently on one project). **In `apps/api`:**
  `Certifications` (`src/certification/`): `certify`, written as the certifying monitor from their
  phone (source `DEVICE`), the capacity worked out by `Capacity` and never typed, **measurements
  that give no capacity refused with nothing saved**; `measure` (a box corrected in place, the
  capacity worked out again); `signaturesOnFile`; `revoke`; **no copy** (a certification is never copied, ADR-328, 330); `SubPlaces` and
  `ContractorSetup.merge` (the certifications that named the duplicate name the kept one). **"Replaced on" is the new certification's certified time**, as a day in the project's time
  zone. A certification's number is the phone's (the next of its block, or the pre-printed
  sheet's). The story
  `certification` runs it: `pnpm scenarios` runs six stories (16, 18, 52, 25, 15, 35 checks since ADR-332). Sixty
  models, forty-five migrations. **`MapVersion.loadedAt`'s default is `transaction_timestamp()`** (KD-70:
  Prisma read `CURRENT_TIMESTAMP` back as its own `now()` and wrote it into every later
  migration). Left for later: C62. *Agent defaults.* [321]
- **The map servers are in the local stack (REQ-022):** `routing` (**Valhalla 3.9.0**) and
  `addresses` (**Nominatim 5.3.2**, mediagis's image), pinned by tag and digest, reached **only
  through Caddy over HTTPS** (`https://routing.adms.localhost`, `https://addresses.adms.localhost`),
  no port published. **One OpenStreetMap extract, named by a URL and a SHA-256 together**
  (`ADMS_MAP_EXTRACT_URL`, `ADMS_MAP_EXTRACT_SHA256`; built in: Delaware, Geofabrik's dated copy of
  1 January 2026), downloaded once by `pnpm local:up` into the git-ignored `infra/local/.cache/maps/`
  and checked against its hash every run; each server rebuilds its data when the hash changes. **The
  extract's date is the map's date.** Valhalla answers only `locate`, `route` and `status`, with no
  capabilities and a read-only root filesystem. Nominatim is **address lookup only** (no search), and
  **its own Postgres is closed to everything outside its container** by our wrapper (the image leaves
  it open with a public password); we set no password of ours on it. The example world's Bayline
  County is made up, so its roads stand in from Delaware's. The demo deploy's half is REQ-517's.
  *Agent defaults.* [282]
- **HTTPS between every service, locally too**; CORS by explicit origin allow-list, never
  disabled. [098]
- **Local first.** Test in a browser, then iPhone, then Android. Firms host in **their own cloud**;
  **Railway + Netlify is the shipped demo deploy**. Sync needs a data connection. [099]
- **Mileage is the road route**: the shortest route on **public roads open to ordinary traffic**
  (no truck size) from the collection's end GPS (a load's or a haul-out's collection) to **the
  disposal site's own GPS**, entered with the site (ADR-208), from **our own routing
  server** with OpenStreetMap data (a third service). The worker **snaps** the collection's GPS to
  the nearest road point (its address from Nominatim) and routes from there; if no route is found,
  mileage is the **straight line, flagged** "no road route found". Always the truck's road trip,
  never water. A split's mileage is per property. The worker computes it before pricing.
  **Valhalla** (mileage) and **Nominatim** (address lookup) are separate servers we run. [110,
  119, 162, 163]
- The user's Build 1 answers are kept verbatim in `spec/FROM-BUILD-1.md` and bind unless a newer
  ADR differs; Build 1 code is never a source. [102]
- An install is an **installation** (or "the system"), never an "instance". [112]
- **Licence: AGPL-3.0.** Every dependency's licence must be compatible (permissive, LGPL, GPL-3.0,
  AGPL-3.0; **MPL-2.0 too**, which names AGPL-3.0 as a Secondary License, unless the package carries Exhibit B). **The rule is about what ships** (user, ADR-262): tools that only build, test or lint are outside it. Checked before pinning (`pnpm licences`, ADR-258, which still checks every installed package); `LICENSE` (the AGPL-3.0 text) is at the root. [171, 255, 260, 262]
- **Two-step sign-in** (authenticator code) is **required for admins and managers/analysts**,
  optional for viewers; monitors unchanged. **Email is optional** (installer sets it up if the firm
  has a mail server; otherwise admins reset passwords). Local dev must work with both (a mail catcher,
  seeded dev secrets, dev stack only). [170]
- **Every screen translatable** from day one, English only at first; **US units only**. [172]
- **Enterprise readiness, carried forward (nothing decided about how):** the plan is silent on
  **operations monitoring**, **availability**, **independent security testing** (a threat model, a
  penetration test, how a vulnerability is reported) and **accessibility**. Each is in `BACKLOG.md`'s
  carry-forward register (C38…C41) with what exists, what's missing and when to raise it: the first
  three with Phase 2 and the demo deploy, accessibility before the first screen. Server backups
  (ARCHITECTURE §4) and upgrades (Q-167) were already recorded; single sign-on is not planned. [279]

- **The API as a process (task 2.1.2).** [380, 381, 382, 383, 384, 385] **NestJS 12.1.2 on
  Fastify 5.12.5** (`reflect-metadata` 0.2.2, `rxjs` 7.8.2), in `apps/api/src/process/` beside the
  services, started by `apps/api/src/main.ts`. Decorators through `experimentalDecorators` in
  `apps/api` only, **no `emitDecoratorMetadata`** (name what a class needs with `@Inject`), so the
  API runs as built, never by type stripping. **Locally it is the stack's seventh service**: the
  pinned image `node:24.21.0-alpine3.23`, the built code and dependencies mounted read-only folder
  by folder, uid 1000, read-only root, no capability, **no port published**; compose profile
  `api`, started by `pnpm local:up` only once `apps/api/.env` exists (it builds first and makes
  the container afresh) and by `pnpm installer` at the end of a run; `installer:check` asks its
  health answer. Caddy's `api.adms.localhost` is the only way in (HTTPS, TLS 1.2 and 1.3; plain
  HTTP → 308). **Settings** (`Settings`): the process's environment first, then its env file
  (`ADMS_ENV_FILE`, a compose secret in the stack; else `apps/api/.env`); `DATABASE_URL`,
  `READONLY_DATABASE_URL`, `ADMS_TOKEN_SIGNING_SECRET`, `SMTP_URL`, `ADMS_API_HOST`,
  `ADMS_API_PORT`, and optionally `ADMS_DATABASE_ADDRESS` (the stack's `postgres:5432`); a missing
  or malformed key stops the start, **named, never its value**. **The log** is one JSON object a
  line and safe by construction: a request as its method and path, an error as its kind and
  frames, never a query, a header, a body or a message; **the request id is the server's own**
  (`requestId`). **One error filter:** every refusal or failure answers `{ code, requestId }`
  (`packages/contracts`' `errorAnswerSchema`; codes `BAD_REQUEST`, `NOT_FOUND`, `TOO_LARGE`,
  `UNSUPPORTED_MEDIA_TYPE`, `INTERNAL_ERROR`; a task adds its own). **`GET /health` →
  `{"status":"ok"}`**, to anybody, nothing else *(agent default; 2.7.2 looks again)*. Nothing
  opens the database yet. Tests: `apps/api/test` (40; `door.test.ts` needs `pnpm local:up` after
  `pnpm installer`, **and `pnpm local:up` again after any change to `apps/api`**). AC-10-01, 02,
  03, 33, 55 pass; AC-10-32 in part. What it leaves: BACKLOG C85.
- **The boundary (task 2.1.3).** [387, 388, 389, 390, 391, 392] **Every endpoint is said once,
  in `packages/contracts`** (`endpoint()`, the list `endpoints`): a name, a method (`GET · POST ·
  PUT · PATCH`), a path, the schema of its path parameters, its query, its body and its answer.
  A definition that would take a field nobody named, at any depth, is refused when it is
  written. **The API maps a route only with `@Serves(endpoint)`**, and one interceptor,
  `Boundary`, reads the path, the query and the body by those schemas before any controller
  runs: a field not named, a part the endpoint doesn't name, a wrong value → 400 `BAD_REQUEST`
  (a code, never what was sent; which field, in plain words, is 2.4.4's); a route that names no
  endpoint → 500. A test holds the API's routes to the contracts' list. **OpenAPI 3.1** is made
  from that list by **`pnpm openapi`** (Zod's own JSON Schema; no dependency), written to
  `apps/api/openapi.json`, and a test fails when the file is stale. **A body is one mebibyte at
  most:** the policy value `REQUEST_BODY_LIMIT_BYTES`, refused as `TOO_LARGE` before it is read
  whole; one limit for every endpoint today. **Each service login is under a statement
  timeout:** the policy value `STATEMENT_TIMEOUT_MS` (30,000 ms), set by `pnpm installer` on
  `adms_api`, `adms_worker` and `adms_readonly` with `ALTER ROLE … SET statement_timeout` on a
  first run and a rerun, never on `adms_owner`; `installer:check` reads it signed in as each
  login and checks the owner has none (25 `✓`); a run takes off an owner's timeout and one kept
  for a login in a single database; a service's own env file may state another for its logins
  (ADR-394, 395, 396; a first run and an override both seen in real runs). **CORS:** the setting `ADMS_CORS_ORIGINS`, exact
  origins (`https://` or `capacitor://`, lower case, no path, `*` or pattern; plain `http://` is
  not taken; a malformed list stops the start), matched whole; left out, no other origin's page
  is let in; an origin off the list is told nothing. The local stack lists
  `https://adms.localhost`. **Every answer carries the API's own headers:** HSTS, `nosniff`,
  no referrer, a content security policy that lets nothing load or frame it, `no-store`, and
  `X-Request-Id`; Caddy removes `Server` and `Via`. **Every write made while a request is
  answered states that request's id**: the API's one database client (`@Inject(apiDatabase)`,
  the first use of `Settings.databaseUrl`) asks which request the running controller is, so no
  service passes it along (`openDatabase`'s `requestNow`). Tests: `apps/api/test` 86 (`boundary`
  24 and `settings` 38 need nothing; `door` 15 and `request-id` 2 need the stack and the
  installation), `packages/contracts/test/endpoints.test.ts`. AC-10-04…08, 34, 36, 39, 43 pass.
  Adding an endpoint, and what is left: BACKLOG C86. *Agent defaults.*
- **Sign-in follows the named standards; a departure is said before it is built (the user,
  2026-10-07).** [401] NIST SP 800-63B and OWASP ASVS Level 2 (ARCHITECTURE §16). **A failed
  sign-in and a lockout are security audit events, and lockout state is kept in the database**
  (on the person's sign-in record: it must outlast a restart and be shared by every API
  process). *Agent default, for 2.2.3 to build and test:* a try at a name nobody has writes no
  row (a log line), nothing a stranger typed is ever stored, and writes for a real account are
  bounded by the lockout itself. **When anyone suggests a direction in security, say what the
  standard asks and what comparable products do before building it**; a departure is built only
  as a risk the user accepted knowing that. ADR-400 (nothing an unsigned caller does is written;
  lockout in memory) stood for an hour, was never committed, and is withdrawn: never cite it.
- **Sign-in's records (task 2.2.1; the database only, no endpoint yet).** [397, 398, 399] Three
  tables, **each with its own guards, tighter than `guard_table`'s, and read by the API alone**
  (the worker and the read-only login hold nothing on them; no viewer view), audited in the
  security domain, never deleted. **`UserCredential`** (`user_credential`): what sign-in keeps
  of a person, one row a person, **apart from `user`** (which the worker and every reader of a
  person read whole): `passwordHash` (only an Argon2id PHC string), `twoStepSecret` (never
  blank), `lockedUntil`; whose it is never changes; the system actor can have none (C21).
  **`Session`** (`session`): one row a back-office or portal sign-in, holding **the SHA-256 of
  the one refresh token in force** (64 lower-case hexadecimal digits, unique; the token itself
  is refused), rotated in place, `expiresAt` after `createdAt`, **`revokedAt` final** (a revoked
  row is never changed again). **`SecurityEvent`** (`security_event`): a sign-in, a wrong try, a
  lockout, a phone's setup or switch, a use of the master passcode (`SecurityEventKind`, REQ-202b's
  list); added and never edited; **the audit capture copies each into `audit_record` in the
  security domain**, which is how it is "in the same log"; it holds who it is about, the phone,
  the request and when, **never a typed name, an address or a secret**. **The three secret
  columns** (`password_hash`, `two_step_secret`, `refresh_token_hash`) **are named on their audit
  triggers**: the audit log says one changed, never what from or to. Tests:
  `packages/db/test/sign-in.test.ts` (17). AC-10-10, 11 pass at the database; AC-10-19 in part.
  Eighty-two migrations. **Open, for the task that first writes one (C88):** who is stated as
  the actor when nobody is signed in. *Agent defaults, seen by the user ("make sense"; the
  secrets apart from the person: "Security is key here").*
- **Passwords (task 2.2.2).** [402, 403, 404, 405, 406] **The standard:** NIST SP 800-63B-4
  (August 2025) §3.1.1.2 and OWASP ASVS 5.0 §6.2, read before building (ADR-401). **The rules
  are `packages/domain`'s** (`PasswordRules`, `BreachedPasswords`, `passwordAsKept`): a
  back-office or outside user's password is **15 to 128 characters** (the policy values
  `PASSWORD_MINIMUM_LENGTH`, never under 8, and `PASSWORD_MAXIMUM_LENGTH`), each Unicode code
  point one character, of any characters; **never a composition rule, never a forced change**
  (nothing knows a password's age: no rule, no policy value, no column); compared and hashed
  in Unicode's composed form (NFC), otherwise exactly as typed. It is refused, with a code and
  a plain reason, when it is too short or long, when **all of it** (whatever its capitals) is
  on **the release's list of 46,483 known breached passwords**
  (`packages/domain/breached-passwords.txt`: the NCSC's 100,000 most used, 8 characters and up;
  read by the API at its start; **no outside service**; never on a phone), or when it is made
  only of the product's words and the person's own name, address or Monitor ID. **A monitor's
  password is exempt** (their phone number without the area code, ADR-105): never empty, kept
  the same way. **The master passcode** is refused by `pnpm installer` when it is on the same
  list (C35; its 8 to 128 characters unchanged). **The hash:** Argon2id, 19 MiB, 2 passes, 1
  lane, a 16-byte salt, a PHC string, by `node:crypto` (`PasswordHasher`). **An admin sets
  anybody's password** (`Passwords.setByAdmin`: admin read from the database in the same piece
  of work; never the system actor's); **its endpoint is mapped with 2.2.5**, when a session
  says who calls. **Reset by email**, where the firm has mail, for a back-office or outside
  user, never a monitor: `POST /password-resets` `{ email }` (always `accepted`; a message only
  when exactly one such person has the address, sent to the address the database holds) and
  `POST /password-resets/completions` `{ code, password }`; the code is signed over the person,
  its end and their current password hash, so the server stores nothing, it is **good once**
  and for `PASSWORD_RESET_MINUTES` (60; a day at most); the change is written as the person;
  it signs nobody in and clears no second step; the person is told by a second message. **No
  mail server → `NO_MAIL` (409), and nothing else changes.** Mail: `nodemailer` 10.0.13;
  optional settings `ADMS_SMTP_ADDRESS` (the stack's `mail:1025`) and `ADMS_MAIL_FROM`; TLS
  required except to the local mail catcher. Refusal codes: `PASSWORD_TOO_SHORT`, `_TOO_LONG`,
  `_BREACHED`, `_EASY_TO_GUESS` (422), `RESET_REFUSED` (400), `NO_MAIL` (409). Tests:
  `packages/domain/test/passwords.test.ts`, `apps/api/test/passwords.test.ts` (no stack) and
  `password-set.test.ts` (the installation's database, each test undone; the mail catcher),
  `tools/setup/test/secrets.test.ts`. AC-10-20, 21, 23, 24 pass; AC-10-25 in part (the admin's
  endpoint: 2.2.5). **Built since, by task 2.2.3:** the keyed hash (ADR-411) and the change of
  an admin-set password at its owner's next sign-in (ADR-410). **Not built, said:** rate limits
  on the reset endpoints (C89). *Agent defaults, confirmed by the user (ADR-407); AC-10-24's
  example for a person is now `1q2w3e4r5t6y7u8i`.*
- **Sessions (task 2.2.3).** [407, 408, 409, 410, 411] **The standard, read first (ADR-401):**
  NIST SP 800-63B-4 §2.2.3, §3.2.2, §5 and OWASP ASVS 5.0 V3, V6, V7; nothing built departs
  from them. **Who signs in here:** an admin, a manager/analyst or a read-only viewer, with
  **the email address the firm holds for them** and their password; never a monitor (their ID
  and password open a phone's calls only) and never the system actor. Where two such people
  share an address neither is signed in by it (refusing the second person is 2.2.5's).
  **Endpoints:** `POST /sessions`, `POST /sessions/refreshes`, `POST /sessions/sign-outs`,
  `GET /sessions/current`, `GET /sessions/csrf`, `POST /password-changes`. **Every endpoint
  says who may call it** in the contracts (`access`: `ANYBODY` · `SIGNED_IN` · `REFRESH_TOKEN`),
  and `Admission` asks it inside the boundary **before** the schemas read anything. **The
  tokens are cookies only**, `__Host-adms-access` and `__Host-adms-refresh`, each `Path=/;
  HttpOnly; Secure; SameSite=Strict`; no body holds one. The access token is the session's id
  and its end, signed with HMAC-SHA-256 by a key of that purpose drawn from
  `ADMS_TOKEN_SIGNING_SECRET` (`node:crypto`, no dependency), good for `ACCESS_TOKEN_MINUTES`
  (5); **the session, its person, their role and that they aren't archived are read from the
  database on every request.** The refresh token is the session's id and 32 random bytes, the
  row keeping their SHA-256; **good once**: a refresh writes the new hash over the old, and **a
  token that isn't the one in force ends the session** (so two tabs refreshing at once sign
  the person out: the page takes a lock, Phase 4). **CSRF:** every call that isn't a GET on a
  `SIGNED_IN` or `REFRESH_TOKEN` endpoint carries the session's own value (a signature over
  its id, given in the sign-in and refresh answers and by `GET /sessions/csrf`) in the header
  `x-adms-csrf`, or is refused `CSRF_REFUSED`; a listed origin is answered
  `Access-Control-Allow-Credentials: true`. **A firm's back office and its API must be one
  site** (`SameSite=Strict`). **A session ends** at sign-out, after
  `SESSION_INACTIVITY_MINUTES` (30) with nothing asked, at `SESSION_OVERALL_HOURS` (12) after
  sign-in, when its refresh token is used twice, when the person's password is set anew, and
  at once for a person archived. **Wrong tries** (the domain's `SignInTries`): counted on
  `user_credential.failed_sign_ins`; from `SIGN_IN_TRIES_BEFORE_WAIT` (5) each puts a wait on
  the login (`locked_until`: `SIGN_IN_FIRST_WAIT_SECONDS`, 30, doubling, at most
  `SIGN_IN_LONGEST_WAIT_MINUTES`, 60); at `SIGN_IN_TRIES_BEFORE_LOCK` (**50** since ADR-417, the user's decision; 10 before; never over 100)
  **the login is locked until its password is set anew** (a reset by email, or an admin),
  never by time; while it waits or is locked the right password is refused too and **nothing
  is written**. **Every failed sign-in is told `SIGN_IN_REFUSED` and nothing else**; a try at
  a name nobody has writes no row. **Security events:** `SIGN_IN`, `SIGN_IN_FAILED`,
  `LOCKOUT`, each with who it is about, when and the request; **a failed try is written with
  the person whose login was tried as its actor** (nobody is signed in; only the worker states
  the system actor). A locked person is told by email where the firm has mail. **A password
  somebody else set** (`user_credential.password_change_required`, set by an admin's set for
  anybody but themselves and a monitor) **is changed by its owner first**: until then every
  `SIGNED_IN` endpoint not marked `beforePasswordChange` answers `PASSWORD_CHANGE_REQUIRED`.
  **A person changes their own** giving the current one (a wrong one is a wrong try); **a
  password set anew ends the person's sessions** (their own change keeps the one it was made
  in) and opens a lock. **The password hash is keyed** (Argon2id's secret input, a key drawn
  from the signing secret, named `keyid=djE` in the string, never in the database); an
  unkeyed hash still checks and is made again at sign-in; **losing or changing
  `ADMS_TOKEN_SIGNING_SECRET` means every password is set anew**. The master passcode's hash
  is not keyed (2.5.1). Refusal codes: `SIGN_IN_REFUSED`, `NOT_SIGNED_IN` (401),
  `CSRF_REFUSED`, `PASSWORD_CHANGE_REQUIRED` (403), `PASSWORD_WRONG`, `PASSWORD_UNCHANGED`
  (422). Eighty-four migrations. Tests: `packages/domain/test/sign-in-tries.test.ts`,
  `apps/api/test/session-tokens.test.ts` (no stack), `sessions.test.ts` (the installation's
  database, each test undone), `door.test.ts`, `packages/db/test/sign-in.test.ts`. AC-10-09,
  12…19 pass; AC-02-39 in part. **Not built, said:** the second step (2.2.4: **until then an
  admin signs in with a password alone**: built, ADR-412); a way in for the last admin, locked, of a firm
  with no mail (2.2.5); rate limits (2.2.6); a person's list of their own sessions and an
  admin ending somebody's (ASVS 7.5.2, 7.4.5). What it leaves: BACKLOG C90. *Agent defaults,
  but (a) the change of an admin-set password and (b) the keyed hash, built at the user's
  word (ADR-407).*
- **Two-step sign-in (task 2.2.4).** [412; the rule is 170] **The standard, read first
  (ADR-401):** NIST SP 800-63B-4 §3.1.4, §3.1.5, §3.2.2 and OWASP ASVS 5.0 V6.3…6.5; nothing
  built departs from them (one reading is said, below). **The second step is an authenticator
  app's code** (RFC 6238: HMAC-SHA-1, six digits, a thirty-second step, a secret of 20 random
  bytes; `OneTimeCodes`, `node:crypto`, no dependency). **Who** (the domain's `TwoStepRules`):
  required for an admin and a manager/analyst, optional for a read-only viewer, none for a
  monitor. **Signing in:** `POST /sessions` takes an optional `code`; the password is checked
  first; a person with an authenticator and no code is answered 401 `TWO_STEP_CODE_NEEDED`
  (nothing opened, nothing written; never said while the login waits or is locked) and the page
  sends the sign-in again with it; **a wrong or spent code is a wrong try at the login**
  (`SIGN_IN_REFUSED`, counted, a `SIGN_IN_FAILED` event, the wait and the lock of ADR-409).
  **A code is good once:** `user_credential.two_step_last_step` keeps the step of the last one
  taken and none at or before it is taken again. **Which steps:** the server's own and
  `TWO_STEP_CODE_STEPS_EITHER_SIDE` (1; 0 or 1) either side. *The reading, confirmed by the user (ADR-414):* ASVS 6.5.5's
  "30 seconds at most" is read as the step's length, as the apps and comparable products work;
  to the letter it is the value 0, which an installation may state. **A required person with
  no authenticator** gets a session that opens nothing but setting one up: every `SIGNED_IN`
  endpoint not marked `beforeTwoStepSetup` answers 403 `TWO_STEP_SETUP_REQUIRED`; a password
  somebody else set is changed first. **Setting it up:** `POST /two-step/setups` answers a new
  secret (base32, and the `otpauth://` address for a QR code) and a *setup* (the secret sealed
  with whose it is, good for `TWO_STEP_SETUP_MINUTES`, 10); `POST
  /two-step/setups/confirmations` `{ setup, code }` keeps it. **Nothing is in the database
  until a code proves the app has the secret** (no "confirmed" column). A `TWO_STEP_SET_UP`
  event; the person's other sessions end; told by email. A second one is refused
  (`TWO_STEP_ALREADY_SET_UP`). **At rest** the secret is sealed (AES-256-GCM, a key of that
  purpose drawn from `ADMS_TOKEN_SIGNING_SECRET`, bound to its person, written `v1.…`); **the
  database refuses anything unsealed** and the audit log never holds it; **losing or changing
  the signing secret means every authenticator is set up again**. **An admin clears another
  person's** (`POST /people/:userId/two-step-clearings`; admin read from the database in the
  same piece of work; never their own; `NOT_ALLOWED`, `NOT_FOUND`, `TWO_STEP_NOT_SET_UP`): the
  secret goes, **the person's sessions end**, a `TWO_STEP_CLEARED` event about them with the
  admin as actor, an email, and they set one up at their next sign-in. **The dev stack's
  accounts** (`infra/local/src/dev-accounts.ts`; **`pnpm local:accounts`**, `--show` to only
  show them): an admin, a manager/analyst and a viewer with known passwords and authenticator
  secrets, written only to a database on this machine; no shipped folder holds one of those
  values (a test). Eighty-six migrations. Tests: `packages/domain/test/two-step.test.ts`,
  `apps/api/test/one-time-codes.test.ts` (no stack), `two-step.test.ts` (the installation's
  database, undone), `infra/local/test/dev-accounts.test.ts`, `packages/db/test/sign-in.test.ts`.
  AC-10-26 and AC-02-14 pass; AC-02-74's sign-in half. **Not built, said:** a person replacing
  or removing their own authenticator; recovery codes; a way in for the only admin who lost
  their phone (2.2.5, with the locked last admin); rate limits (2.2.6). What it leaves:
  BACKLOG C91. *Agent defaults.*
- **Permissions on every request, and people (task 2.2.5).** **Every `SIGNED_IN` endpoint names
  its `roles` and may name the one `permission` it takes** (`packages/contracts`; one that names
  no role can't be defined; OpenAPI carries both). **`Admission` asks them before the schemas
  read anything**, after the session, the CSRF value, the password to change and the
  authenticator to set up: 403 `NOT_ALLOWED`. The person's role and the permissions they hold
  now are read with their session on each request (`Caller.granted`), never from a token: **a
  grant taken away, a role changed or a person archived refuses their very next request.** The
  rule is the domain's (`packages/domain/src/people.ts`: `Access`, `PeopleRules`): an admin holds
  every permission and needs none granted; a manager/analyst the ones granted and not taken
  away; a monitor, a read-only viewer, the system actor and anyone archived none. A service
  behind an endpoint asks again in its own piece of work (ADR-364). **No endpoint takes a
  permission yet** (the reviewer's: 2.4.4). **People** (`apps/api/src/people/`, `People`):
  `POST /people` (an admin, a manager/analyst, or a read-only viewer with its kind and, for a
  contractor user, its contractor; **never a monitor**; an email address required; no Monitor
  ID; no password until an admin sets one), `GET /people/:userId` (an admin or a
  manager/analyst; **a monitor's phone number is in an admin's answer only**),
  `PUT /people/:userId/permissions` and `/viewer-projects` (the whole of what the person holds
  from now on; one not named is archived, never deleted; **only an admin gives a permission,
  and an admin holds every one, so nobody gives what they don't hold**; a permission to a
  manager/analyst only, a project to a read-only viewer only), `POST /people/:userId/passwords`
  (an admin sets a password; its owner changes it first), `/session-endings` (an admin ends
  anybody's sessions), `/archivings` (the person's sessions end). **One email address a person
  who signs in**: 409 `EMAIL_HELD`, and the database's exclusion `user_sign_in_email_once`
  (admins, manager/analysts and read-only viewers who aren't archived, without regard to
  capitals; a monitor's address is no key). **The last admin stays**: 409 `LAST_ADMIN`, and the
  database's trigger `user_last_admin` refuses archiving the only admin in service or making
  them anything else, whoever asks. **`pnpm installer:admin`** (the user's decision, ADR-413
  (2), 414 (2)), on the firm's own server: makes the firm's first admin where it has none; sets
  an admin's password anew (a lock opens, their sessions end) and, asked, clears their
  authenticator; never makes a second admin; written with the admin as the actor and the reason
  "Done on the server, by pnpm installer:admin." **A refusal may carry the domain's plain
  words** (`message` on the error answer: why a password wasn't taken; nothing else). Eighty-
  seven migrations (the 87th a guard alone). Tests: `packages/domain/test/people.test.ts`,
  `apps/api/test/people.test.ts`, `packages/db/test/people.test.ts`, the story `first-admin`;
  **the API's test files run one at a time**. AC-02-08, 12, 13, 72, AC-10-25 pass at the API;
  AC-02-83, 84 added for the user's approval; AC-09-18 and AC-10-27 in part. **Not built,
  said:** a list of people; editing a person or their role; taking a person out of the archive;
  a person's own sessions; rate limits (2.2.6). What it leaves: BACKLOG C92. *Agent defaults
  but for the server command.* [415]
- **Rate limits (task 2.2.6).** Read against NIST SP 800-63B-4 §3.2.2 and ASVS 5.0 2.4.1,
  6.1.1, 6.3.1 first (ADR-401): the standard's SHALL is the login's own count and lock (ADR-409,
  in the database, unchanged); this adds the anti-automation, and is no departure. **A caller
  over a limit is answered 429 `LIMITED`**, with the whole seconds to wait in the header
  `Retry-After` and in the body's `retryAfterSeconds`; never which limit. The rule is the
  domain's (`RateLimits`: so many in a stretch that starts with the first one counted; a
  refused request isn't counted). **Six limits on nine policy values**, each an installation's
  to state: every request **by address** (`RATE_LIMIT_REQUESTS_PER_ADDRESS` 3,000 in
  `RATE_LIMIT_WINDOW_SECONDS` 60; an office and its phones share one address) and **by
  signed-in person** (`RATE_LIMIT_REQUESTS_PER_ACCOUNT` 600; a call with only a refresh token,
  by its session) and, since ADR-490, **by proven phone** (`RATE_LIMIT_REQUESTS_PER_PHONE` 600,
  still counted for its address too; a phone's file parts have their own count, ADR-482); **refused tries at a secret by address** (`SIGN_IN_WRONG_TRIES_PER_ADDRESS`
  30 in `SIGN_IN_ADDRESS_WINDOW_MINUTES` 60: a sign-in, a reset's code, a current password, an
  authenticator's code) and **by address at one login**
  (`SIGN_IN_WRONG_TRIES_PER_ADDRESS_AT_LOGIN` 4, always under `SIGN_IN_TRIES_BEFORE_WAIT`);
  **resets by email** by who asks (`PASSWORD_RESET_ASKS_PER_ADDRESS` 10) and who is asked for
  (`PASSWORD_RESET_ASKS_PER_LOGIN` 3), counted whether or not anybody has the address. **Per
  account at sign-in is the login's own count** (AC-10-40's "limited by login"). **A try
  stopped by a limit never reaches the login**: it is no wrong try, writes nothing, and the
  right password from there is told the same; the owner signs in from any other address; a
  sign-in that works from the address, or the password set anew, starts that count again.
  **With the lock at fifty wrong tries (ADR-417, the user's decision)** one address needs about
  forty hours of steady trying to lock a login, and any sign-in by the owner starts the count
  again. **The
  counts are in the API's own memory, never the database** (ADR-401 (3)): they start again
  with the process, each process keeps its own, and past `RATE_LIMIT_COUNTS_KEPT` (100,000)
  the oldest goes. **A caller's address** is the one that connected unless a proxy listed in
  the new optional setting `ADMS_TRUSTED_PROXIES` (addresses or networks) says whose request
  it carries; the local stack's network has fixed addresses and Caddy is `172.30.213.2`; an
  IPv6 caller is counted by its first 64 bits; a login is kept as a hash. **No address is
  logged or stored**, and a limit's refusal is one warning in the log, no security event. No
  dependency, no migration. Tests: `packages/domain/test/rate-limits.test.ts`,
  `apps/api/test/limits.test.ts`. AC-10-40 passes. **Not built, said:** per device and what a
  phone does when limited (2.6.5); a shared store for several API processes (5a). What it
  leaves: BACKLOG C93. *Agent defaults.* [416]
- **A badge whose number the phone's list doesn't hold (the user, 2026-10-08)** [421, 151, 154, 209]:
  a badge carries only the cert number, and a phone learns the capacity, the prime and the subs
  from the certifications in its lists; certifying is done where there is signal, so the
  project knows a certification before its truck works. **Where the number scanned or typed at
  New isn't in the phone's list, the phone warns, asks to refresh its lists if it has a
  connection, and otherwise lets the monitor key the truck in by hand** (marked manual,
  flagged, billed at the certification's capacity once one exists). Nothing is refused. Phase
  3 builds it (REQ-317); the server's half is built (ADR-420: the field events linked and
  their tickets queued when the certification exists).
- **A locked ticket and a setup change (the user, 2026-10-08)** [422, 420, 090, 057]: a ticket
  locked as invoiced is on no job, and a setup change's run writes nothing on it. **A saved
  change answers how many tickets it queued and how many it reached that are locked and were
  left as they are** (`Outcome.queued`). Phase 4: the screen that shows it, and a mark on a
  locked ticket that its setup has changed since it was priced (unlocking will move its
  amount).
- **What queues work (task 2.3.3, 2026-10-07)** [420, 419, 418, 360, 090]: **a change that
  moves a ticket queues its own job in its own piece of work, and nobody asks the worker.**
  Every such service hands its ask to `WorkQueue` (`apps/api/src/jobs/`) and is made with
  `(db, clock, policy)` (`QueueingService`). **A job names the tickets the change touched and
  their neighbours**, the other tickets whose conclusions read them. What makes two tickets
  neighbours is the domain's `TicketNeighbours`, four things and no other: two loads on one
  certification whose loading times overlap; two crew-time tickets of one crew that overlap or
  share a day of the project; two tickets on one scale receipt; a load and a unit rate ticket
  it carries (from the load's side only), and two loads listing the same carried ticket. **The
  change names them, not the run, asked before the change and after it**, since only the change
  knows what stood before. **Left off every job:** a ticket locked as invoiced (its unlock
  queues it); and, among neighbours and a setup change's tickets, a void ticket (settled until
  a person unvoids it). **Who queues what:** a correction, a renumber, a quarantined record
  resolved, a back-office record, a void and an unvoid: their tickets and neighbours; an
  acceptance and an unlock: the ticket alone; a rule: its form's tickets; a pay item, **a rate
  (`PayItemSetup.rate`)**, "Pays when", a project's settings, a control range, a map version:
  every ticket of the project; a site: the tickets with a field event at it; a certification
  made (**its number's field events are linked to it**, AC-06-36), measured again or revoked:
  the tickets on its number, and those sharing a scale receipt with one. A change to a record
  that is no ticket's (a new site or certification, a corrected survey, an accepted flag on
  one) queues **a job that names no ticket** (`forProjectRecords`). **Size:** the policy value
  `JOB_TICKETS_AT_MOST` (200), read by both services: a change is cut into jobs of that size,
  and a run takes up waiting jobs, the oldest first, until their tickets come to it. Tests:
  `packages/domain/test/neighbours.test.ts`, `packages/db/test/job-queue.test.ts`; the stories
  `p1-reviewed`, `p1-voided`, `p1-invoiced` (run from the queue), `p1-queued`, `p1-left-out`.
  AC-10-50 and 54 whole, AC-10-51 in part. **Not built, said:** a sync's job (2.6.2); a
  contractor merged, a contract, a prime added, a form's debris type and a list's value queue
  nothing. What it leaves: BACKLOG C96. *Agent defaults.*
- **The worker runs as a process (task 2.3.2, 2026-10-07)** [419, 418, 360, 352, 395]: `apps/worker/src/main.ts`, the local stack's eighth service (profile `worker`), started by `pnpm local:up` and `pnpm installer` after the API. **It looks at the queue every `JOB_QUEUE_POLL_SECONDS` (5) and hands each project with a job waiting to `Reconciliation.waitingJobs`, one project after another.** Under the project's lock (the claim) the run counts a try on each waiting job first, in its own piece of work; works the tickets they name and no other, each once; and finishes each job (`finishedAt`, its run) in the run's own closing piece of work. A try that fails whole writes `lastError`; a job is set aside (`setAsideAt`) after `JOB_TRIES_BEFORE_SET_ASIDE` (5) tries, also where the worker died each time without a word; a ticket that errors fails no job. With no job waiting nothing is written. **The run still reads the whole project** (a ticket's checks read its neighbours) and still checks the flags that sit on no ticket in every run. **A run asked for directly (`Reconciliation.run`, the stories' until 2.7.1) works every ticket of the project**, whatever tickets a review service names: a job must name the neighbours a change can move, which is 2.3.3's (C95). The run's trigger is the oldest job's, its person only where every job names the same one. Two projects' runs may go at once between two worker processes; one process works them in turn. **Settings** (a missing or malformed one stops the start, named, never shown): `DATABASE_URL`, `ADMS_ROUTING_URL`, `ADMS_ADDRESSES_URL`, `ADMS_MAP_EXTRACT_SHA256`, `ADMS_WORKER_HOST`, `ADMS_WORKER_PORT`; optional `ADMS_MAP_CA_FILE`, `ADMS_DATABASE_ADDRESS`, `ADMS_MAP_SERVERS_ADDRESS`. **Policy values added:** `JOB_TRIES_BEFORE_SET_ASIDE`, `RECONCILIATION_RUN_LONGEST_MINUTES` (10), `JOB_QUEUE_POLL_SECONDS`, `MAP_SERVER_ANSWER_SECONDS` (30), read by the worker alone, and `DATABASE_POOL_CONNECTIONS` (10, never under 2), read by each service for its own pool. **Log:** JSON lines, `service: worker`, ids only, never an error's message. **Health:** `GET /health` → `{"status":"ok","jobsWaiting":N,"jobsSetAside":N}` on the container's own loopback; no port published, no proxy leads to it. **The installer** writes the worker's map settings, adds them to an older installation's `apps/worker/.env` without touching a line that is there (`EnvFile.add`), starts the worker and checks it (27 `✓`). **After a change to `apps/worker`, `pnpm local:up` again** before the chain.
- **The job queue is built (task 2.3.1, 2026-10-07)** [418, 360, 094, 097]: **two guarded
  tables of our own, written through Prisma, and no queue library** (pg-boss keeps its own
  schema by its own SQL outside the migration history and `guard_gaps()`, deletes finished jobs,
  writes with no actor, and reaches Prisma's transaction only as raw SQL). `ReconciliationJob`
  (`reconciliation_job`): its project, what asked for it (`trigger`), who (none on a sync's),
  when; and how it went, the worker's to write: `attempts`, `finishedAt` with the run that
  worked it, `lastError`, `setAsideAt`. `ReconciliationJobTicket`: the tickets it names, as the
  worker groups one (workflow and bare number), each once, each its job's own project's. **A job
  is added only inside the piece of work of the change that asks for it**:
  `new ReconciliationJobs(tx).queue({ projectId, trigger, requestedById?, tickets })` in
  `packages/db` takes the open piece of work and nothing else, so the change and its job commit
  or are undone together (AC-10-50); it refuses a job with no ticket. **Who may do what:** the
  API adds a job and its tickets and changes neither; the worker reads both and updates the job;
  nobody deletes; the read-only login and every viewer hold nothing; audited in operations.
  What was asked never changes; **a job is waiting while it is neither finished nor set aside,
  and once either it never changes again.** **Retries:** a ticket that errors never fails its
  job (it is flagged and skipped by the run); a job that fails whole stays waiting for its
  project's next run, and **after five tries is set aside**: kept, no longer taken up, shown to
  whoever runs the installation, with no new flag. Two waiting jobs may name one ticket; the run
  works it once. **Built since (2.3.2, ADR-419, the entry above):** the worker's process that takes a job up
  and finishes it, and the policy value `JOB_TRIES_BEFORE_SET_ASIDE`. **Not built, said:** the review services and a setup
  change handing their work to the queue (2.3.3); a sync's jobs (2.6.2). Tests:
  `packages/db/test/reconciliation-jobs.test.ts`, `job-queue.test.ts`. What it leaves: BACKLOG
  C94. *Agent defaults.*
- **The threat model and the API's scenarios (task 2.1.1; both approved by the user, ADR-386,
  393).**
  `spec/THREAT-MODEL.md`: eleven kinds of attacker, 36 threats over the layers of ARCHITECTURE §2,
  each with the recorded control that answers it and the test or Phase 2 task that proves it, and
  what the software records but doesn't stop (people who agree to lie, an admin, the master
  passcode's reach). `spec/acceptance/10-api-and-sync.md`: AC-10-01…56, how the server behaves
  towards any caller, each tied to its checklist chapter (ASVS Level 2, API Security Top 10, NIST
  SP 800-63B; the numbered requirements are pinned by task 2.7.3), with the 48 earlier scenarios
  that have a Phase 2 part beside their tasks. **Neither decides anything:** seventeen points
  nothing records are left to the tasks that build them (BACKLOG C84). Every Phase 2 task reads
  its threats first. [379]

### Product and scope
- **The firm's setup decides how things play out.** Hardcode as little as possible; ship defaults
  tailored to debris work that the firm can change. Before proposing a new ticket type, unit,
  criterion or behaviour, or asking how a contract line works, check whether projects, names, codes,
  rules and lists already express it; which price a contract means is the firm's call. Work the prime
  bills outside Open ADMS isn't set up. Also in `CLAUDE.md` / `AGENTS.md`. [197]
- **Two sides.** The monitor enters **only the main ticket**, fast; fees, pricing, zones, mileage and
  checks are the system's work, from the firm's setup. The back office sees **everything** about a
  ticket, laid out to review, correct and QC many quickly. Before asking a monitor for something,
  check whether the system or the back office can supply it. The **rules are the firm's own tool**
  (create / delete transactions, void, any criteria, date ranges included): enable the options, never
  hardcode a firm's rules. The user answers wearing different hats (firm setting up, monitor, back
  office): design each side for its own user. Also in `AGENTS.md`. [224]
- **Scope settled from the legacy screens (ADR-228):** out: work orders, purchase orders, Service
  Categories; Time and Material = crew time; Stump Collection = the load of stumps; **no separate
  crew list, the crew certification is the crew**; **one review queue** (replaces the QC error
  report, queues, workflow screens), photos reviewed inside a ticket; reports = fixed exports plus
  saved filters (a query builder later); a **firm library plus "copy from a past project"**;
  **invoice batches**: a named set of tickets locked as invoiced, reportable by name. [228]
- **Question shot-clock (ADR-230):** product discovery is closed. Ask the user only when the answer
  changes money, evidence or the monitor's work, blocks the task, and nothing covers it (at most
  three, each with a recommendation); otherwise record an **agent default** ADR and carry on. Spec
  page approvals don't block building. Also in `AGENTS.md`. [230]
- One organisation runs it, usually a monitoring firm. It is **self-installed open source**: one
  organisation per installation, no multi-tenancy. [050, 063]
- **No USACE mode.** Every project runs the same rules, plus an optional "USACE approved" flag on
  the load call. [077]
- The deliverable is the **client package**, assembled **by hand** by the back office from the
  system's data. There is **no invoice record**: "invoicing" means locking tickets as invoiced, and
  a ticket in review can't be locked. No placard printing. [057, 061, 067, 088]
- **A separate project per funder or kind of work** (ROW, PARKS, WATERWAY, federal-aid roads…):
  commingled data is rejected by FEMA. No funder field. [148]
- **Every load has a monitor at both ends**; no unmonitored disposal sites. Everything comes into the
  system; paper logs are only a monitor's own backup. The back office may **create any record** (e.g.
  a device failed), marked with the person and a reason, flagged, pairing normally. [156]
- **Citizen drop-off sites are in scope**, but a drop-off is **a reference log, like an incident,
  not a ticket**: the monitor notes that it happened, simple details, and (optionally) the resident's
  name and where the debris came from. No quantity, ticket number, receipt, pay item or cost; logs
  can be looked up later. The pile is billed only when it's **hauled out as an ordinary haul-out**.
  A log holds the site, monitor, phone time and GPS, the resident's name and origin address
  (optional), up to 8 photos (optional), notes, plus the firm's own form fields; searchable by site,
  dates, name, address. A drop-off log is **a form a phone is set up for at a site** (ADR-215; no
  longer a site setting); drop-off logs are switched on for a project and phone like incidents and
  **QC'd on their own**. [184, 188, 215]
- **Disposal sites** (the legacy "Location"): a **site type**, one of **TDSR/DMS · Final Disposal
  (FDS) · Transfer Station · Other** (firm-extendable; **HHW is not a type**; descriptive, and what
  *Disposal site type* tests), plus **facts about the site** that hold for every ticket type:
  **Haul-outs leave here** (haul-outs leave from it), **Takes loads** (loads end there), **Charges a tipping
  fee** (the box is what tells the system, nothing on the pay item, ADR-220; ticking it leads the firm
  to **write the site's tipping fee pay item** there and then, with its rate for each prime, and then the fee
  rule, Add transaction #2; the site keeps the link, which is how a fee line is told from a hauling
  line (**a site may keep several**, per CY and per ton and beyond, ADR-311, confirmed by the user, ADR-312); a load dumped there with no line for its tipping fee pay item is flagged as a **missing rule**, never a
  mismatch, ADR-222; checked on loads and haul-outs **dumped** there, never on a haul-out leaving it or
  unit rate work there; **a haul-out dumped at a TDSR** is flagged and priced no further, since a
  haul-out only leaves a TDSR, ADR-226; **a haul-out is reduced debris leaving a TDSR for a
  different site, never back to the site it left and never from one final disposal site to another:
  *Haul-outs leave here* can be ticked only on a site of the built-in TDSR/DMS type** (setup refuses
  it elsewhere, and so does the database, which also refuses changing a marked site's type, agent
  defaults, ADR-298, 311), so a haul-out that left anything else is always flagged, ADR-298),
  **Ineligible site** (a load dumped there is flagged and still bills); plus the firm's own labels. The
  legacy **Critical** box is left out (ADR-219). These **replace** the options Disposal · Haul-out · Staging ·
  Citizen drop-off · HHW: a load that needs no load call measures its quantity **from the tickets it
  carries**, a setting on the pay item (stumps, white goods); a **citizen drop-off log** is a form a
  phone is set up for at a site; HHW is no longer an option. *Agent reading, to confirm:* drop-off
  logs aren't checked against the site's facts. [201, 205, 215]
  **A ticket at a site without the matching fact is flagged**, never refused ("Ticket 101013: dumped
  at Old Quarry Pit, which isn't marked Takes loads. Flagged for review."; "Ticket 101009: dumped at
  Old Quarry Pit, an ineligible site. Flagged for review."). Tickets never say
  where debris is headed and the system never guesses ahead: it checks that the debris was allowed
  to go where it went. Halves on different days (a preload, a haul-out from a prior date) are **not**
  flagged by default. [205] **Master setup** can set a phone up for any work on the project; its
  monitor then has access only to that work. *Agent reading, to confirm:* setup lists every active
  site for any work, nothing hidden. [205] **Every phone that works at a site is set up for that one site**: the tower, the
  haul-out collection at the TDSR, the haul-out disposal at the FDS, the drop-off log. The site fills
  in on every record; **no start list shows sites**. A curb collection phone has no site. A phone
  **moves site offline**, on the phone; each record keeps its site; what it still holds syncs later
  and is always received. *Agent readings to confirm:* setup offers the project's active sites; the
  move takes the master passcode and is recorded. The user's account of an HHW site is kept for the
  HHW trail (KD-30, REQ-518). [188, 190, 193, 194, 195, 201, 205]
- **Lists with built-in values plus the firm's own** (site options first): the system acts only on a
  built-in value's **fixed key**, never its name; built-in values can be renamed, not archived; the
  firm's values are labels, added, renamed and archived (audited, never deleted); new behaviour means
  a new built-in value in a release with an ADR. How to code, keep and explain it: `spec/LISTS.md`.
  **Built (ADR-302):** the keys are `packages/domain`'s closed set; the database lets only a release
  write a key and refuses archiving a value that has one. [194, 302]
- **Time clock:** an optional per-project add-on for workers' own hours (ICS-214 data), on the
  **assignment**: **anyone with an assignment** clocks in, takes a break and clocks out **by hand**;
  **simple nudges** only ("You're not clocked in. Clock in now?" on starting a field event; "Clock
  out?" on signing out); activity lines pre-filled from the day's field events, edited and approved
  by the worker; a **manager approves the day** (locked, unlock audited); **exported** for payroll and
  for billing the client. *Agent defaults:* no hourly rates or pay in Open ADMS; viewers don't see
  hours. It is **never** related to crew-day billing (no shared field, no cross-check). [063, 100, 241]

### People and devices — `adms-domain`, `adms-field-app`, ARCHITECTURE §7–§8
- Roles: **admin**, **manager/analyst** (granted permissions), **monitor** (through a device),
  and **read-only viewers** (clients, contractors, auditors) for their own projects. [050]
- **Enrol once, dispatch daily (ADR-240).** A phone is **enrolled** once (online, master passcode:
  its device key; no project, no monitor). The back office writes each day's **assignments** on a
  **dispatch board** (replacing the spreadsheet): person, date, project, their work (ticket types,
  unit rate pay items, certifying), **one site** where the work is at one, optionally a phone; copy
  yesterday's. The monitor signs in on any enrolled phone; **online, the phone gets their assignment**,
  the project's lists and numbers: no passcode, no picking. **One assignment, so one project, on a
  phone at a time** (ADR-145). **Unassigned**, the master passcode sets the phone up as below
  (offline only on the project whose lists it already holds), recorded as an **unplanned
  assignment** (marked, not flagged). **Phones sync whenever there's
  a connection** (records, then photos); hand-in is only for taking a phone out of service. **Once a
  monitor submits a record on the phone it is sealed for them: no reopen, no edit, synced or not;
  only the back office changes it (the user, ADR-477; ADR-240 (6)'s "reopenable until the shift
  ends" and the edit log are overturned).** Every field event records its **assignment** and
  the **setup version** of the phone's lists. The board shows planned against actual as views, never
  ticket flags; an assignment never expires or stops work. Not taken: passkeys, attestation,
  personal phones, per-supervisor keys. [240, 477]
- **"Setup", never "provisioning".** Setup on the phone (now the unassigned fallback, ADR-240) is opened by the **master passcode**:
  one project, its ticket types, and **one monitor** picked from a list. That monitor signs in
  **offline** against a stored verifier; nobody else can; the master passcode can also sign in as
  them. A device can **switch monitors offline** with the master passcode (same project, a monitor
  known by name and **Monitor ID**, e.g. `M004127`); the previous monitor's unsynced work is
  archived and synced in the background. Devices sync whenever there's a connection; hand-in is for turning a phone in (ADR-240). How the
  switched-in monitor proves identity: the login list (ADR-105/120, below); master passcode scope:
  one per firm (ADR-106). [095]
- **Sign-in:** a monitor's **ID** + password (the firm's practice: phone number without area code).
  A set-up phone gets a **login list** for its project's monitors, so the server knows who signed in.
  Monitor credentials work only on set-up phones (five safeguards approved, ARCHITECTURE §7.2, ADR-139). The
  username is the **system Monitor ID**. **Changing the monitor on a phone needs the master passcode
  first**; a master-passcode temporary session for a roster monitor is an allowed shortcut, marked
  and ending at day end. [105, 120]
- **One phone, one project, disposal phones included** (one assignment at a time, ADR-240); a tower monitor working two projects
  carries two phones. [145]
- **Certifying** is done on a field phone **set up for certifying**, where there is signal. It gets a
  **block of cert numbers** (unless pre-printed numbers are typed). **Any phone with a connection can
  refresh its lists** at any time, outside the nightly sync. [151]
- **What read-only viewers see:** clients and auditors the whole project except personal phone and
  licence numbers; a contractor only its own tickets and transactions (a prime with its subs'),
  never another prime's; monitors' phone numbers only admins. Enforced by row-level security. [169]
  **Built for setup (ADR-315):** a client user and an auditor see their projects' whole setup; a
  contractor user none of it (the project's name and dates only); no viewer a client's or a
  contractor's contact, or any person's record. An admin issues a viewer its kind, its projects
  and, for a contractor user, its contractor; a project or a permission is taken away by
  archiving. *Agent defaults.* [315]
- **Creating users:** field monitors are created **on a phone, online**, by the master user (then
  optionally set up); back-office and outside users by an admin in the back office. [105]
- **A phone's device key and its proof (task 2.5.1, part 1 of 3, 2026-10-09, ADR-436, 437).** **The key is ECDSA on P-256; a proof is its signature with SHA-256** over `open-adms/phone-proof/v1`, a line break and the server's challenge (`PhoneProofRules.signed`, `phoneKeyKind`, `packages/domain/src/phone-proof.ts`). The server is sent and keeps the public half only, as base64 SubjectPublicKeyInfo **written one way** (`DeviceKeys`, `apps/api/src/phone/`); a signature travels as base64 DER. **A challenge** (`PhoneChallenges`) is kept nowhere: it names its phone and when it was made, carries 256 random bits and is signed with a key drawn from `ADMS_TOKEN_SIGNING_SECRET`; good for `PHONE_CHALLENGE_SECONDS` (120) and once (`PhoneProofRules.unspent`, kept on the phone's record by part 3). A proof gives a short-lived token for the sync's calls, never a signature on every request (part 3). What NIST SP 800-63B-4 §3.1.6, §3.2.2, §5.1 and ASVS 6.7.2, 11.2.3, 11.5.1, 11.6.1 ask is ADR-436; **neither standard provides for a secret shared by several people: the one master passcode is ADR-106's accepted risk** (THREAT-MODEL §5 (4)). **Not built yet:** the challenge's endpoints and a phone's token (part 3). [436, 437]
- **Enrolling a phone (task 2.5.1, part 2 of 3, 2026-10-09, ADR-438, 439).** `POST /phones/enrolments`, nobody signed in: a name, the master passcode and the public key; the answer is the phone's id and the passcode's version. **An act under the master passcode is written as the master passcode's own actor** (user `…0002`, role `MASTER_PASSCODE`, "Master passcode"; seeded; `underMasterPasscode(deviceId)` in `packages/db`), never as a person: only the API states it, only with source `DEVICE`, nobody changes its row, and **no column that names a user may name it** but the audit record's actor (a later table that names a user adds that check in its guard; a database test holds it). The domain's `actorOnly` tells the two users that are no person. **Wrong tries** are counted on `master_passcode_tries` against the version in force, by sign-in's rule and numbers (`MasterPasscodeTries`): a wait from the 5th in a row, a lock at the 50th until an admin changes the passcode; while it waits or is locked the right passcode is refused and nothing is written; an address is stopped at its own fourth wrong try; at the lock every admin is told by mail. Security events: `MASTER_PASSCODE_USE` (with the phone), `MASTER_PASSCODE_FAILED`, `MASTER_PASSCODE_LOCKOUT`. Refusals: 401 `ENROLMENT_REFUSED` (one code), 422 `DEVICE_KEY_REFUSED`, 409 `ALREADY_HELD` for a key another phone holds. [438, 439]
- **A phone proves itself (task 2.5.1, part 3 of 3, 2026-10-09, ADR-440).** Before a sync a phone asks for a challenge by its id (`POST /phones/:deviceId/challenges`: made for any id, nothing read or kept), signs it and sends both back (`POST /phones/:deviceId/proofs`); nobody is signed in. **A challenge is good once:** the moment it was made is kept on the phone's record (`Device.lastAnsweredChallengeMadeAt`), compared and written in one statement under the row's lock, and the database itself lets only that phone's own proof write it, only later, never for a revoked key. **What a proof writes is written as the device key's own actor** (user `…0003`, role `DEVICE_KEY`, "Device key"; seeded; `byDeviceKey(deviceId)` in `packages/db`): only the API states it, only with source `DEVICE`, always naming the phone, and no column that names a user may name it (a later table that names a user adds that check beside the master passcode's). **A proof gives a token** (`PhoneTokens`: 128 random bits, signed, kept nowhere, good for `PHONE_TOKEN_MINUTES`, 15), sent as `Authorization: Bearer`; an endpoint open to a proven phone says `access: 'PROVEN_PHONE'`, and `Admission` reads the phone from the database on every request. **A phone out of service still proves itself; one whose key is revoked proves nothing, and its token stops at once.** A proof that isn't one is 401 `PHONE_NOT_PROVEN`, one code, and writes nothing; one that works leaves the phone's audit record, no security event. Limited by address only. `GET /phones/current` answers a proven phone what the server has of it (in service or not, the passcode's version in force). The database holds a device key to its shape (`device_public_key_check`). **No story or API test writes a phone by hand:** `story.enrolled(name)`, `apps/api/test/support/phones.ts`. **Not built yet:** the phone's clock reported, the sync's calls behind `PROVEN_PHONE`, the signed-in monitor, the revocation itself. [440]
- **A monitor created on a phone (task 2.5.2, part 1 of 3, 2026-10-09, ADR-441, 442).** `POST /phones/current/monitors`, open to a phone that has proved itself (`PROVEN_PHONE`) and is in service, with the master passcode in the body beside the monitor's name, password and optional phone number: **the phone's key and the passcode together open it.** The database issues the Monitor ID, the monitor's username; the answer is their id, Monitor ID and name. Every write is stated with `underMasterPasscode(deviceId)`; `MASTER_PASSCODE_USE` names the phone and the monitor it is about. The password is the firm's practice (ADR-105, 402 (5)): never empty, no other rule, the same keyed Argon2id hash, not marked to be changed. **`MasterPasscodeCheck`** (`apps/api/src/phone/`) is the one check of the passcode for every act under it: a wrong try on a phone counts on the same `master_passcode_tries` row as one at enrolment and names the phone. Refusals: 401 `MASTER_PASSCODE_REFUSED` (one code), 409 `PHONE_OUT_OF_SERVICE` (a phone out of service creates nobody), 422 with the domain's words for a password over the longest. **What the standards ask of a monitor's sign-in is ADR-441:** the seven-digit password (under the 8 asked even of a second factor), the phone shared between monitors and the shared passcode are the user's accepted risks (ADR-105, 139, 240, 106), restated; the phone's device key is what makes a monitor's sign-in two factors in shape. **Not built yet:** the assignment taken (part 3). [441, 442]
- **A monitor signs in on a phone (task 2.5.2, part 2 of 3, 2026-10-09, ADR-443; ADR-441 (6) built as proposed).** `POST /phones/current/sign-ins`, open to a proven phone (`PROVEN_PHONE`), with the monitor's `monitorNumber` and `password`: the answer is their session token, id, Monitor ID, name and `expiresInSeconds`. **The device's session is a row of `session` that names the phone (`device_id`)**, its token (the session's id and 32 random bytes) kept only as a SHA-256; it lasts **`MONITOR_SESSION_HOURS` (12; 1 to 24)** from the sign-in and quiet never ends it; **one monitor at a time on a phone** (a sign-in ends any other session on it). The phone sends it as **`x-adms-monitor-session`** beside its own `Authorization: Bearer`, never as a cookie. **`MONITOR_ON_PHONE`**, the fifth access: `Admission` reads the phone's proof, then the session, from the database on every request (`PHONE_NOT_PROVEN`, then `NOT_SIGNED_IN`), so a sign-out, a password set anew, an archive, another monitor's sign-in on the phone and a revoked key each stop it at once; `monitorOf(request)`. Two endpoints take it: `GET /phones/current/monitor` and `POST /phones/current/sign-outs`. **Wrong tries follow everybody's rule** (a wait from the 5th, a lock at the 50th until an admin sets the password anew), counted on the monitor's own `user_credential`, written as the monitor with source `DEVICE` on that phone; `SIGN_IN_FAILED` and `LOCKOUT` name the phone; no lock mail to a monitor. **One refusal code**, 401 `SIGN_IN_REFUSED`; **a phone out of service signs nobody in** (409 `PHONE_OUT_OF_SERVICE`, before the password is read), while a monitor signed in before it was marked keeps their session until the key is revoked. **AC-02-39 at the database:** a monitor's session must name a phone and no other session may; one on a phone is opened only for a monitor not archived, on a phone in service whose key stands, written as that monitor from that phone; the phone it names never changes (`20261009182002_guard_a_monitors_session_on_a_phone`). [443]
- **The phone takes the monitor's assignment at sign-in (task 2.5.2, part 3 of 3, 2026-10-09, ADR-444; agent defaults).** `POST /phones/current/sign-ins`' answer carries **`assignment`**, or null with **`noAssignment`** (`NONE_THAT_DAY`, `SEVERAL_THAT_DAY`); the body is still the Monitor ID and password alone (no passcode, no project; AC-02-35), and taking one writes nothing. **Which one is the domain's rule, `AssignmentRules.takenAtSignIn`:** of the monitor's assignments that stand, those whose day is today **in their own project's time zone**; the one that names this phone; with none naming it, the only one there is, whichever phone the board named; **where several are left the phone takes none** (nobody picks a project on a phone, and the server never picks one); with none that day the monitor is signed in all the same. The phone is told the assignment's id, day, project (id, name, time zone), kinds of field event, certifying, forms and site: **never a rate, a code or a pay item** (the lists are 2.5.3's). Read by `apps/api/src/phone/phone-assignments.ts` (`PhoneAssignments`). **Nothing records that a phone took one** (the board's phone stays the dispatcher's plan). **No story writes a monitor by hand:** `story.monitor(name, onPhone)` (through `PhoneMonitors`; the Monitor ID is the database's, read, never stated), `story.signedIn(monitor, onPhone, at?)` (through `PhoneSignIns`) and `taken(story, monitor, phone)` in `stories/board.ts`. **Task 2.5.2 is done.** [444]
- **The lists a phone takes (task 2.5.3, part 1 of 5, 2026-10-09, ADR-449, 450; agent defaults).** `GET /phones/current/lists`, open to a signed-in monitor's proven phone (`MONITOR_ON_PHONE`), at any time it has a connection: **the assignment the phone takes now, by the sign-in's own rule asked again** (`PhoneAssignments.taken`), **and that assignment's lists**, or both null with `noAssignment`; no request names an assignment or a project. A phone told there is none is sent no lists and keeps what it holds. Nothing is written. **Part 1's lists** (`phoneListsSchema`, strict): the phone's number blocks on the project, the load and haul-out forms' debris types by name without those *Hidden on phones*, field tags, reasons for a typed number, **the unit rate pay items the assignment names now** (code, band, payable type, kind of work) with their kinds' item names, and the incident and survey lists only where the assignment makes those forms. **Never a rate, a rule, a transaction, a description or a load's pay item**; the one code is a unit rate pay item's, which the phone prints. Read by `apps/api/src/phone/phone-lists.ts` (`PhoneLists.taken`, `.held`). **No story reads a phone's lists by hand:** `story.lists.held({ assignmentId, deviceId })`; the harness's `phone-lists.ts` is gone. **What the standards ask of a login list kept on a device is ADR-449:** a list of password checks handed to a phone is outside both NIST SP 800-63B-4 and ASVS 5.0 (the nearest rule, §3.2.10, allows ten wrong tries on the device); whoever reads a list out can guess a seven-digit password whole, so the protection is ARCHITECTURE §7.2's five safeguards: the user's accepted risk (ADR-105, 139), restated. **Part 2's lists (ADR-451, agent defaults):** **every certification of the project** (id, cert number, kind, whole-CY capacity or none on a crew, prime and subs by name; never the driver, tag or measurements; a revoked or replaced one too), **the live sites** (name, site type, *Takes loads*, *Haul-outs leave here*; never the fee, *Ineligible site*, the permit, dates or GPS), **the ROEs** (number, address, parcel ID and `preWorkSurveyDone`, found by the ROE number written on a `PRE_WORK` survey; never the owner, signature or scope) **only for a phone whose assignment names one** (collections, unit rate work, or the ROE, survey or incident forms), **the live control ranges**, **each unit rate pay item's seven capture settings**, and, **for an assignment at a site, that site's quantity lookup** (form, debris type entry, prime, what is asked) for the debris types the phone holds, worked out when asked by `SetupStanding.quantityLookupIn`. A certifying phone's cert-number block is one of its `ISSUED` blocks, sent as any is; a read issues none (the sync tops up, 2.6.2). **Part 3, the setup version (ADR-453, agent defaults):** **a setup version numbers the project's setup as its phones are shown it, whole for the project** (control ranges, debris types not hidden, field tags, typed-number reasons, live sites, every unit rate pay item with its capture settings, item names, the incident and survey lists, every live site's quantity lookup), **never the certifications, the ROEs or a phone's blocks**: those are records with their own history, and a new one makes no version. A phone's lists are its assignment's part of that version and say which it is (`lists.setupVersion`, from 1), which is what every field event the phone makes records. **A version is made when a phone is first sent lists that differ from the newest one, and at no other time** (the one thing the read writes), **as the device key's actor on that phone** (`byDeviceKey`), never the monitor. **`setup_manifest`** (`SetupManifest`: project, version, content, built at): the API reads and adds, nobody edits or deletes, the worker and viewers read none, audited as a record; the database numbers a project's versions 1, 2, 3… with no gap, refuses one whose content is the newest's, and takes one only as a phone's write naming the phone. A field event's `setupVersion` has no foreign key to it (evidence, never refused). **The site's quantity lookup by setup version:** `GET /sites/:siteId/quantity-lookup?setupVersion=N` answers the back office that site's rows as kept in version N, never worked out again (REQ-124f's server half); no such version: not found. Code: `apps/api/src/setup/setup-versions.ts` (`SetupVersions`), `SetupStanding.quantityLookupUnder`; the contracts' `setupShownSchema`. **No story states a version:** a story's phone takes it from the lists it read. **Part 4, the login list and the master passcode's check (ADR-454; ADR-449 (5) built as proposed, the rest agent defaults):** **`POST /phones/current/login-list`**, a signed-in monitor's proven phone's (`MONITOR_ON_PHONE`), its own call and no part of the lists read or of a setup version. **The phone says what it holds** (the version of the passcode whose check it has, and a *mark* for each monitor's entry) **and is made only what it lacks**: an entry is a slow hash (11.8 ms each, measured), so a list's cost follows what changed, never the project's size. **Who is on the list:** monitors in service with an assignment that stands on the project of the assignment the phone takes now, for that project's today or later; one with no offline seed is left off until their next online sign-in; a phone that takes no assignment is sent no list and keeps what it holds. **An entry** is Argon2id of the monitor's **offline seed** under a salt made for that phone; the phone is sent how to make the first hash (salt and settings, never the seed) and the entry, and checks a typed password by doing both steps. **The offline seed** (`user_credential.offline_seed`) is an unkeyed Argon2id of the password, sealed by the API (AES-256-GCM, bound to the monitor) and kept out of the audit log; kept when a monitor is created, when an admin sets their password, and at an online sign-in where there is none; the database refuses a password changed with its seed left as it was. **A mark** is a keyed fingerprint of phone, monitor and seed: a password set anew makes it good no more. **One call makes at most `LOGIN_LIST_ENTRIES_PER_CALL` entries (50)** and says `more`. **The master passcode's check** is made the same way from the server's unkeyed hash, sent with the version in force to a phone that holds another or none, whatever its assignment; **`Device.masterPasscodeVersion` moves then, as the device key's actor on that phone, and the database lets nobody else move it, and never back.** Entries are kept nowhere on the server. Code: `apps/api/src/phone/offline-checks.ts`, `phone-login-list.ts`. **Not built yet:** the address lookup (part 5); a certifying phone's own pick lists (C118); `Sync.setupVersionSent` (2.6.2, C119). [449, 450, 451, 453, 454]
- **An address looked up for a phone's GPS (task 2.5.3, part 5 of 5, 2026-10-10, ADR-455; agent defaults).** `POST /phones/current/address-lookups`, open to a signed-in monitor's proven phone (`MONITOR_ON_PHONE`), body `{ latitude, longitude }` as exact decimals on the earth: **the point is in the body, never in a URL**. Answered `{ address, noAddress }`: the street number and name our own address server finds ("25 The Green"), or none with `NO_STREET_THERE` or `NOT_ANSWERED`; **never a refusal for want of an address** (the monitor types it, ADR-111). Nothing is written or kept; **neither the point nor the address is logged**. The API alone asks the address server (`AddressServer`: the settings' own server over HTTPS, the path fixed, no redirect followed, `ADDRESS_LOOKUP_ANSWER_SECONDS` = 5 and 64 KiB at most); no phone and no browser reaches it (AC-04-24). **One reading of an answer for the API and the worker:** the domain's `lookedUpAddress`. The API's settings name the server (`ADMS_ADDRESSES_URL`, required; `ADMS_MAP_CA_FILE`, `ADMS_MAP_SERVERS_ADDRESS`), written and added by `pnpm installer`. No limit of its own per phone (2.6.5, C93). Left for later: C121. [455]
- **An unplanned assignment arrives from the phone it was made on (task 2.5.4, part 1 of 4, 2026-10-10, ADR-456, 457; agent defaults).** `POST /phones/current/unplanned-assignments`, open to a phone that has proved itself (`PROVEN_PHONE`): **nobody need be signed in and the passcode is never sent** (the phone checked it against its own check, online or not; the server takes the phone's word and counts no try). Body: the id the phone made, the project, the monitor, the work as the board states it, the site, the unit rate pay items, `madeAt` (a UTC instant) and `deviceUtcOffsetMinutes`; never the day, the phone or who wrote it. Answered 200 `{ assignmentId, answer, reason }`: `SAVED`, `ALREADY_SAVED` (the same id from the phone that made it: kept once, **the first stands**), or `NOT_SAVED` with the domain's reason (`UNKNOWN_PROJECT`, `NOT_A_MONITOR`, `NOT_THE_PROJECTS_SITE`, `NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM`, `ID_ALREADY_HELD`). **Kept as reported, never refused over eligibility:** for a monitor archived since, a closed project, a phone out of service. **Its day is the day the phone's clock said, in the project's time zone.** **Three times are kept** (C46): `Assignment.madeAt`, `.deviceUtcOffsetMinutes`, `.receivedAt` (an unplanned one has all three, a planned one none) and `SecurityEvent.deviceUtcOffsetMinutes` (only where a phone reported the event; `occurredAt` is then the phone's own time). **Written as the master passcode's actor on that phone**, with two security events at the phone's time naming the phone and the monitor: `DEVICE_SETUP` and `MASTER_PASSCODE_USE`. **The database itself** lets an unplanned assignment be made only as that actor, with source `DEVICE`, naming the very phone stated; whether one was planned, and when an unplanned one was received, never change (`20261010142419_guard_what_a_phone_reports`). Code: `apps/api/src/phone/unplanned-assignments.ts` (`UnplannedAssignments.received`), the domain's `AssignmentRules.unplannedDay`, `.mayHoldUnplanned`, `.reportedAgain`. **No story or test writes one by hand:** `unplanned` in `stories/board.ts`. **What the standards ask is ADR-456:** ASVS 16.2.1, 16.2.2, 16.3.1, 16.3.3 and 63B §3.2.10; **a server taking a phone's word for an act done offline under a shared passcode is outside both**, the user's accepted risks (ADR-030, 095, 106, 120, 240) restated: what stands for it is the device key, the three times, and the clock difference kept at sync. **The task's cut (ADR-456 (4)):** part 2 a monitor switch and a site move reported; part 3 a session under the passcode with a connection and the temporary session; part 4 every other use a phone logged, REQ-202b whole. **Proposed for those parts (ADR-456 (5)), the user's to overturn:** a site move and a switch to a monitor with none are each a new unplanned assignment; the sign-in takes the assignment made on the phone last where several name it; a session under the passcode is a marked row. Left for later: C122. [456, 457]
- **A site move and a monitor switch, reported by the phone (task 2.5.4, part 2 of 4, 2026-10-10, ADR-458; agent defaults, built as ADR-456 (5)(a)…(c) proposed, no reply from the user being in the files).** Both are **a new unplanned assignment reported by the same call** (`POST /phones/current/unplanned-assignments`), whose body now must state **`occasion`: `SETUP` or `MONITOR_SWITCH`**. **A site move is a setup anew at another of the project's sites** (`SETUP`; `DEVICE_SETUP` and `MASTER_PASSCODE_USE`): the earlier assignment stands untouched with everything recorded under it, and **nothing the dispatcher planned is changed from a phone**; a move has no kind or mark of its own (it is told by the monitor's earlier assignment on that phone that day). **A switch to a monitor who has no assignment** is `MONITOR_SWITCH`: a new one for them, with `DEVICE_SWITCH` and `MASTER_PASSCODE_USE` at the phone's own time naming the monitor switched to. Kept as reported, as part 1's. **The sign-in's rule** (`AssignmentRules.takenAtSignIn`; the phone's lists and login list ask the same rule): where several of a monitor's assignments for the day name the phone they sign in on, **it takes the one made on it last, by the phone's clock (`madeAt`)**, whenever each arrived; none where none of them was made on the phone (two planned ones) or two were made at one instant. So for the rest of that day what was set up on a phone stands over the board's plan for that phone. Code: `securityEventsOf`, `unplannedOccasions` (domain); `unplanned-assignments.ts`, `phone-assignments.ts`. **Not built (C123):** a switch to a monitor who has their own assignment (the event alone, with an id of the phone's: part 4); whether a reported switch ends the earlier monitor's server session (part 3); the story (part 4); the hand-over and the move on the phone (Phase 3). **Confirmed by the user (ADR-459):** a move has no kind of its own, a switch names only the monitor switched to, and what was set up on a phone stands over the board's plan for that phone that day. [458, 459]
- **One master passcode per firm**, set at install, changed by the firm when it chooses; no
  reminders. [106]
- **Device data is encrypted**, **never backed up**, and bound to that phone; a device can be
  synced and turned in **without the monitor**, so the key never comes from a password. [096]
- **A phone taken out of service is received, never refused:** at its next sync it proves itself
  and uploads; what it made **after** its removal time arrives **flagged**; then its number block is
  retired and it's wiped (only then is it refused). [134]
- **"Sync and turn in" (task 2.6.5, 2026-10-13, ADR-487…490; agent defaults; KD-77 closed as built, ADR-495).** **`POST /phones/current/turn-ins`** (`TurnIns`, `apps/api/src/phone/turn-ins.ts`; contract `turn-in.ts`): `PROVEN_PHONE`, nobody need be signed in, the master passcode in the body (checked as every act under it is; wrong tries counted as at enrolment); **a phone out of service is turned in the same way.** The phone has synced and sent its files, then names everything it still holds by the ids it made (reports, records, photographs) and by fingerprint (`sentCanonical`, SHA-256) what it sent with no id the server could read, with the last number used of each series; bounded (10,000 records, 10,000 photographs, 1,000 of each report and of fingerprints). **Only when the server has all of it from that same phone** (a record saved, quarantined or held for a person; an unplanned assignment or logged use of its own; a photograph saved with every file kept) is it turned in, in one piece of work as the master passcode's actor: `MASTER_PASSCODE_USE` and **`DEVICE_TURN_IN`**; each series' blocks end (**reported: the unused rest handed back; not reported, or a phone marked lost: retired whole**, `TurnInRules`); a phone in service becomes `RETIRED` from now (a lost one stays lost); its sessions end; **its key is revoked** (as the wipe is ordered, KD-77); answered `wipe: true`. Otherwise nothing changes but the use, logged, and the answer names what the server doesn't have (`wipe: false`, the domain's words). **The database:** only the turn-in (the master passcode's actor for that phone) revokes a key, never at enrolment, only once no block is issued; a phone turned in never changes status, removal time or revocation again, and is issued no block. **A client** wipes only on `wipe: true` (`turnInAnswerRead`, `toWipe`) and is held to it by the suite's checks 14…16. **A story** turns a phone in by `story.underPasscode.turnIn(phone)`. **Every request of a proven phone is counted for the phone** (`REQUESTS_BY_PHONE`, `RATE_LIMIT_REQUESTS_PER_PHONE` 600 a minute) as well as for its address. [065, 096, 134, 468, 487…490]
- A device records its id on every record it creates. **Monitors never pick pricing** (never see a rate; rules create every transaction) and **never see a code**: they pick **by name**, a unit rate **pay item** (shown by its payable type) after the crew photo, a load's or haul-out's **debris type** on Complete; a load carries no pay item. Setup pushes the unit rate pay items and their settings to the phones that do that work (ADR-176); a load's phones get none (ADR-223). [088, 124, 176, 207, 223]
- **The database issues the Monitor ID** (`M` and six or more digits, the next of one series from
  `M000001`): a person written without one gets one; every monitor has one; a writer may leave it off
  anyone else; unique; never the system actor's. A worker's **employer** is a contractor record
  (`User.employerId`), with the employer's own ID for them (`employerNumber`), kept apart from a
  viewer's contractor. **A device** has a name (the dispatch board's, `P1-COL-1`), a unique public
  key, a status (`ACTIVE · LOST · RETIRED`, out of service exactly from its removal time), the version
  of the master passcode's check it holds, and its number blocks; **no details column** (no rule has a
  phone report anything but its key and, at a sync, its clock). *Agent defaults.* [281]
- Workers have a **system Monitor ID** plus an optional employer ID; subcontracted monitoring
  firms and temp agencies are contractors (monitoring kind); each field event records its own
  monitor. (Q-97, Build 1 answer) [102]
- Disposal devices carry **no ticket list**; they trust the scan. Cancelled tickets stay on the
  device, unsynced. **A record the monitor submitted is sealed for them** (the
  user, ADR-477): never reopened or edited on the phone, synced or not, even to undo a mistake;
  one opened and not yet submitted stays theirs to adjust, for days where the work takes days,
  and is not flagged for having stood open. The device sends no change log; a record sent again
  under its id is answered "already saved" as it was stored (ADR-472; `apps/api/test/sync.test.ts`).
  [056, 071, 477]
- The device sends whatever GPS fix it has. The **back office** checks it and adjusts drift.
  There is no accuracy check. [083]
- **Printing on every project** (Zebra ZQ): two collection copies (or control ticket + stub), a
  disposal copy at disposal, haul-out and final disposal, unit rate always; barcode = the ticket
  number; receipts are never records. **Capacity is never typed**, except for a truck keyed in by
  hand, which is flagged and bills the cert's capacity (ADR-154). (Q-95, Q-98, Build 1 answers) [102] On a control-ticket project the disposal receipt may
  be **handwritten on the back of the control ticket**; haul-out prints at the collection side. [115]
- **No check digit.** A tandem's truck and trailer carry unrelated ticket numbers; tandem cert
  numbers are usually, not always, consecutive, and a trailer swap isn't flagged. [114]
- **A session under the master passcode, with a connection** (ADR-462; ADR-456 (5)(d) built as
  proposed, the rest agent defaults). `POST /phones/current/passcode-sessions`, a proven phone
  in service: a monitor's id, which way (`AS_MONITOR`, the passcode in place of their password;
  `TEMPORARY`, a monitor picked from the roster) and the passcode, checked by the one
  `MasterPasscodeCheck`. The session is a row for that monitor on that phone, **marked**
  (`Session.masterPasscodeSession`), written as the master passcode's actor with one
  `MASTER_PASSCODE_USE` event; the database lets nobody else write a marked one and lets that
  actor write no unmarked one. **It is no sign-in of the monitor's.** It ends any other session
  on the phone. A temporary one ends at the end of the project's day (the project of the
  assignment the phone takes) or after a monitor's own hours, whichever is first; as the
  phone's monitor, after the hours. The phone says which way; the server holds neither against
  the board. `GET /phones/current/monitor` says how the session was opened. **A monitor switch
  a phone reports ends the sessions on that phone opened before it, by the phone's clock, but
  for the monitor's it was switched to.** A field event's mark for a session as the phone's
  monitor is task 2.6.2's (BACKLOG C124). [462]
- **What a phone being set up under the master passcode picks from, with a connection**
  (ADR-463; ADR-462 (4)(f) built as proposed, the rest agent defaults). `POST
  /phones/current/setup-choices`, a proven phone in service, nobody signed in: the passcode
  (in the body, never a path or a query; checked by the one `MasterPasscodeCheck`),
  `projectId` (null until one is picked) and `monitorsAfter`. Answered the firm's **open
  projects** (not closed; id, name, time zone), the **monitors in service** (id, Monitor ID,
  name; a thousand a call, `moreMonitorsAfter` says where to ask on from) and, for an open
  project named, its **live sites and unit rate pay items in service** in the shape a phone's
  lists show them (`SetupVersions.sitesShownIn`, `.payItemsShownIn`). **Never a rate, a rule,
  a description, a load's pay item, a password, a phone number or a role.** A closed or
  unknown project is answered no lists and no refusal. **Each read is one
  `MASTER_PASSCODE_USE` event** naming the phone and nobody, written as the master passcode's
  actor with the read. A phone out of service is refused before the passcode is touched. What
  ASVS and the API Security Top 10 ask of it is in the ADR. Code:
  `apps/api/src/phone/setup-choices.ts`. [463]
- **Every other use of the master passcode a phone logged, reported** (ADR-464; ADR-456 (5)(e)
  built as proposed, the rest agent defaults). `POST /phones/current/passcode-uses`, a proven
  phone, nobody signed in, **no passcode sent** (the phone checked it; the server takes the
  phone's word). Body: `id` (the phone's own), `use`, `personId` (null for a wrong try, and
  only for one), `loggedAt` (a UTC instant), `deviceUtcOffsetMinutes`. Four uses
  (`loggedPasscodeUses`, the domain's `PasscodeLogRules`): **`MONITOR_SWITCH`**, the phone
  passed to a monitor who has their own assignment: `DEVICE_SWITCH` and `MASTER_PASSCODE_USE`
  naming them, no assignment made; **`SESSION_AS_MONITOR`**, **`TEMPORARY_SESSION`**, a
  session opened on the phone with no connection: one `MASTER_PASSCODE_USE` saying which way
  in `SecurityEvent.masterPasscodeSession`, never a sign-in, no session row;
  **`WRONG_TRY`**: `MASTER_PASSCODE_FAILED` about nobody, **moving no count and no lock on
  the server**. Each at the phone's own time with its offset; the first event of a use takes
  the phone's id, so a report sent again is `ALREADY_SAVED`. `NOT_SAVED` only for
  `NOT_A_MONITOR` or `ID_ALREADY_HELD`; kept for a monitor archived since and from a phone
  out of service. A switch or a session saved ends what anybody else had open on that phone
  before it, by the phone's clock. **The database lets a security event a phone reported (one
  with an offset) be written only as the master passcode's actor, from a phone, naming that
  phone** (`security_event_a_phone_reported`). A setup, a move and a switch to a monitor
  with no assignment stay the unplanned assignment's report. **REQ-202b is not whole:** the
  passcode's use to sync and turn a phone in is task 2.6.5's. The story is
  `under-the-passcode`. Left for later: BACKLOG C126. [464]

### Time and photos — ARCHITECTURE §10–§11
- **Each project has a time zone**; tickets and time-clock entries use it. **The database checks it's an IANA name** (an area and a location, or `UTC`, known to the server's time zone data; never an abbreviation or an offset), and no column anywhere is a time without its zone; a field event's own times and offset are never checked, only flagged later [281]. Offline, the **device
  clock** is the recorded time; reconciliation checks times make sense and **flags** with a time
  message. Time clock: start, 30-min break at 6+ hours, clock-out, day ends before midnight, **no
  cap on monitor hours**. The 12-hour flag is **crew hours only**. [100]
- **Photos:** shrink carefully at near-original quality, **keep depth data** (or store it
  linked), hash at capture, **keep indefinitely**. [101] **At most 8 per ticket** (not per phase);
  whether photos are **required** is a **pay item** setting; too few is flagged, never blocked
  (a hazardous tree: 1 pre, 1 measure, 1 post); no minimum unless required, then 1. **A
  certification takes five photos**: operator with placard, interior/back, right, left, front. [157,
  179, 181] **The record is built (ADR-326; see "Field events"):** one owner, two fingerprints,
  the file's place written once; the 8 is the phone's rule, never the database's.
- **Where a file is kept (task 2.6.4, part 1 of 5, 2026-10-12, ADR-478…480; agent defaults).** Any S3-compatible object store, asked through `@aws-sdk/client-s3` 3.1146.0 (with `@smithy/node-http-handler` 4.12.1; both exact, ADR-479), over HTTPS, its certificate checked. **One bucket (`adms-media` in the local stack, made by `pnpm local:up`, never by the API), which keeps every version. The API's identity there may put and get an object in that bucket and nothing else:** it deletes no object and no bucket, makes no bucket, lists nothing, changes no bucket's settings (held by `apps/api/test/media-store.test.ts`). **`MediaStore`** (`apps/api/src/media/media-store.ts`; `Media` for a test's own): `keep` puts only where nothing is kept under the key and answers `KEPT` or `ALREADY_THERE`; `sizeOf`; `read` up to what the caller will take; **no call deletes, moves, copies or lists**; a key and a type are held to their form before anything is asked; an error names what was asked and the store's status, never the key, the bucket or the identity. Settings: `ADMS_MEDIA_URL`, `_BUCKET`, `_REGION`, `_ACCESS_KEY`, `_SECRET_KEY` (required), `_CA_FILE`, `_ADDRESS`; the policy value `MEDIA_STORE_ANSWER_SECONDS` (30). **Nothing calls it yet:** the media endpoint (part 3, ADR-482) is the one caller. **The task's five parts (ADR-478, 482):** the store ✅ · a photograph's record in the sync contract, the server making its place ✅ (ADR-481) · the media endpoint ✅ (ADR-482) · the harness and the stories, and the back office's read of a file (AC-10-48's asked-for half, moved here by ADR-482) · the map's files (C100). [478, 479, 480, 482]
- **A photograph's record at a sync (task 2.6.4, part 2 of 5, 2026-10-12, ADR-481; agent defaults).** **A sync's own part, `photos`, after the records** (at most 200 a sync), each read on its own (`photoRead`) and answered in its place under its id: `SAVED`, `ALREADY_SAVED` or `NOT_SAVED`, **never quarantined**. It says what it is of (one of the seven kinds a phone makes, by id), the view (a certification's alone), who took it, when and where, **both SHA-256 fingerprints (the phone's word, written once)** and, where a depth file goes beside it, **that file's own fingerprint, `depthSha256`** (ADR-482; it replaced `depthFile`); **never where a file is kept, the file, an upload's time or the phone.** **The server makes the place:** `projects/<project>/photos/<photograph>` (and `.depth` after it for the depth file), lower case, passing `MediaStore`'s form; never told to the phone. **A photograph whose record the server doesn't have saved is not tried: held, `OWNER_NOT_SAVED`**; sent again once its record is saved, it is saved (the held row stays for a person). One of a record in quarantine belongs to the quarantined record. Saved, it joins the ledger (`PHOTO`) and queues what reads it: a field event's ticket, a certification's views. Sent again changed, it is already saved and nothing moves (ADR-477). The harness's phones send theirs in their syncs; every story's certification is sent with its five. The file itself is the media endpoint's (below). [481, 482]
- **A photograph's files, through the media endpoint (task 2.6.4, part 3 of 5, 2026-10-12, ADR-482; agent defaults).** **The one endpoint that takes a file** (AC-10-47): `GET` and `PATCH /phones/current/photos/:photoId/files/:file` (`photo` or `depth`), `PROVEN_PHONE`; **only the phone that took the photograph, once its record is saved** (anyone else: 404, told nothing). A part is the body as bytes of `application/offset+octet-stream`, with `offset` and the file's `length` in the query (tus 1.0's core); the contract marks it `file: true`. **Answered `KEPT`, `RECEIVING` (`received`, `length`; send the rest from `received`) or `NOT_MATCHED`; never a place.** A part is taken only where it starts the file or goes on where the last ended; **unfinished parts are held only in the API's memory, at most `MEDIA_RECEIVING_BYTES_AT_MOST` (256 MiB) across every phone, the longest waiting let go** (its phone starts again; nothing unfinished reaches a disk or the store, so the store's identity was widened by nothing). **Checked before anything is held:** a file at most `MEDIA_FILE_BYTES_AT_MOST` (32 MiB, 413), a part at most `MEDIA_PART_BYTES_AT_MOST` (4 MiB, the route's own body limit, refused before it is read whole), the first part's first bytes **an image: JPEG, HEIC or HEIF, PNG, TIFF** (the domain's `photoFileTypeOf`; else 415, never stored). **Whole, its SHA-256 against the record's** (`uploadedSha256`, or the depth file's `depthSha256`): **kept once at the server's place, never overwritten, and `uploadedAt` / `depthUploadedAt` written once, by the phone, under the device key's actor** (the database refuses an upload time written any other way, or again); a file already at the place is read back and checked first (C136). **A whole file that isn't the one fingerprinted is set aside, never turned away** (C84 (12)): kept at `<place>.set-aside/<its SHA-256>` with a `set_aside_file` row (what arrived, as the server read it; the API's alone, never changed), and the phone told `NOT_MATCHED` sends again. A phone's questions and parts are counted, `RATE_LIMIT_FILE_PARTS_PER_PHONE` (300 a minute; 429). AC-10-48 in part: a kept file reads back as the bytes stored; the back office's own read of one is part 4. [482]
- **A phone's photographs' files, and the back office's read of one (task 2.6.4, part 4 of 5, 2026-10-12, ADR-483; agent defaults).** **A client sends a photograph's files only once its record is answered saved**, never one not saved (kept with its file), in parts no larger than the server takes, each from where the server last said the file stands (`photoFileAnswerRead`, `photoFileGoesOnFrom`), until it is answered `KEPT`; no answer and the part goes again; none held and the file starts again; `NOT_MATCHED` from the first byte. **`syncClientSuite` holds a client to it** (13 checks; `SyncClient.sendsFilePart`, `filePartAnswered`, `holdsFiles`; `SyncClientHolds.files`, `filePartBytesAtMost`). **The harness's phone** makes a real file for each photograph (its `uploadedSha256` and `depthSha256` the SHA-256 of the bytes it sends) and uploads after each sync (`SimulatedDevice.upload`; `NoSignal`; `sendsPartsOf`); **a story's files are kept in a store of its own, in memory** (`StoryMedia`), never the stack's bucket. **The back office's read** (AC-10-48): `GET /photographs/:photoId/files/:file`, `photographFileEndpoint`, open to every admin and manager/analyst with no permission, no viewer; the contract's one endpoint that answers a file (`answersFile`); the bytes kept, under the type their first bytes say, `Content-Disposition: attachment` with a name the server makes, the answers' policy plus `sandbox`, `nosniff`, `no-store`; **its SHA-256 read again first: a file that isn't the one fingerprinted is never handed back (500)**; not arrived, 404 in words; logged with its reader, not audited. The story `interrupted-upload` (AC-05-09).
- **A map's file (task 2.6.4, part 5 of 5, 2026-10-12, ADR-484, 485; agent defaults; KD-76).** **`POST /projects/:projectId/map-files`** (Setup's): the whole file as bytes, at most `MAP_FILE_BYTES_AT_MOST` (16 MiB, the route's own body limit); its kind by its first bytes (the domain's `mapFileTypeOf`: a zip or GeoJSON; else 415); read before anything is kept (`MapFileReader`, `apps/api/src/setup/map-file-reader.ts`): a zip of at most `MAP_FILE_ENTRIES_AT_MOST` files, unzipped no further than `MAP_FILE_UNZIPPED_BYTES_AT_MOST` (64 MiB); a `.prj` read first by proj4 and a projected file converted, one it can't read a layer that can't be read; no `.prj`, taken as longitude and latitude. **Kept only when a layer is a shape** (`MAP_FILE_NOT_READ` otherwise), **once, by its SHA-256, at `projects/<project>/maps/<SHA-256>`**; something else already there is the server's failure. The answer: id, kind, size, each layer's name, features, fields and problem; never a place. **`POST /projects/:projectId/map-files/:mapFileId/map-versions`** loads a map from it (boundary layer, zones' layer and name field; `uploadedFileKey` its place; the record says `fileKept`) and **`POST /sites/:siteId/map-files/:mapFileId/shapes`** a site's next shape (from an upload), each from the file as kept, read back and its fingerprint checked again, through `ProjectSetup` and `SiteSetup`. `MapShapes` works out a box position by position. **Its own route is the user's (ADR-486, KD-76 closed); AC-10-47 names both endpoints that take a file.** [478, 484, 485, 486]
- **A load's time is its collection's end** (haul-outs too); a disposal's time is its disposal's
  end. The active window, the *Ticket date* criterion and daily counts use the load's time: a Monday
  preload dumped Tuesday is Monday's, at Monday's rate. [161, 181]

### Org model and project setup — `adms-data-model`, `adms-ticket-workflows` §4.0
- `Client` → `DeclarationEvent` → `Project`. Clients and events are shared global records.
  [023, 026] **Built (ADR-303):** a project names one client, one declaration event and one program
  type; "every project under this declaration" is one query across clients. [303]
- **Pick-lists are firm-extendable**: program types (with "requires ROE"), debris types
  (**added to a project's forms**), vehicle types, features, payable types, and others; **no fee
  kinds** [246]. They are picked,
  never typed. **Fixed in code:** ticket types, statuses, billing units, roles.
  Catalogue: `spec/LISTS.md`. [024, 070, 074]
- A project has an **active window**, judged by each ticket's **end time** (a completed load: its
  collection's end, ADR-161); tickets outside it
  are flagged. It also has a **ticket-number source**, control or generated, plus enabled ticket
  types and unit rate sub-types. [018, 041, 056, 057, 064]
- **Several primes per project** are allowed. Each prime has its own subs, **at most two tiers**,
  never shared between primes. **Subs are typed in at certification** under the chosen prime (the
  phone suggests known ones; the back office can merge duplicates). [081, 108] **Built
  (ADR-305):** a contractor has one place on a project (prime, tier 1 or tier 2); the prime a sub
  names is one of that project's own primes, never a sub; the merge is a link on the duplicate,
  which is archived, audited, never deleted. **A contractor holds contact details** (name, email,
  phone; optional), as a client does. [305, 306]
- **A disposal site is entered on each project that uses it** (never shared) [145]. It has an
  **activation date** and an optional **close date**; a disposal after a set close date is flagged
  "site closed" [173].
- **Every disposal site requires a permit**; a missing one is flagged outstanding, never blocking. [111]
  Its **GPS is entered when it's added**, and it has an **area**: **standard**, a circle round the
  GPS (built-in 200 m, changed in the project's **GIS settings**), or **advanced**, its own shape,
  drawn in Open ADMS or from a shapefile. A disposal whose end GPS is outside it is flagged. **One
  circle size per project**; a site with a shape ignores it; both haul-out ends are checked the same
  way; a changed size or shape is dated, kept and reprocesses un-invoiced tickets at that site.
  **Drawing** works for site shapes and the project boundary and zones; anything drawn downloads as
  a zipped shapefile or GeoJSON; the base map is **our own** (a regional map file in our storage, no
  outside map company). [136, 142, 144]
- **Project map:** each project has a **boundary** and optional **zones** (Esri-style shapes). **No
  monitor records a zone**: reconciliation tests the ticket's GPS against the map and **attaches**
  the zone; a collection (or unit rate ticket) outside the boundary is flagged, and one inside it but
  in no zone. Maps come in by **upload** (shapefile, GeoJSON, KML) or an **Esri layer link**, as dated
  **map versions**; the worker checks at reconciliation, never the phone; a new version reprocesses
  un-invoiced tickets; each ticket records the version used. **A version and its zones are never
  edited, and a zone is written only with its version** (the database refuses both); shapes are
  stored as GeoJSON with a bounding box, and **Phase 1 took them in as GeoJSON only** (ADR-311).
  **Since ADR-485 a map's file comes in too:** a zipped shapefile (a projected one converted from
  its `.prj`) or a GeoJSON file, sent whole to its own route (16 MiB), read, kept once by its
  SHA-256 under its project, and a map version (keeping where its file is) or a site's next shape
  loaded from it by layer. KML and an Esri layer link are Phase 4's (REQ-124b).
  [135, 141, 311, 484, 485]
- **Contracts** are simple: a **name, the prime contractor, an optional link** to the signed copy.
  The contractor is added to the project first (**the database refuses a contract whose prime
  isn't one of the project's primes**, ADR-305); the contract is created in the project; **a
  pay item holds a rate for each of several primes** (the legacy "Contract Service Rates"), never a
  copy per prime. **A rule names one contract, once** (picked from the project's contracts; "Ticket
  Contract" was only the legacy label), and **runs only on tickets whose prime holds it**, so a
  pricing rule needs no *Contractor* criterion; **each prime still gets its own rules**. A rule with
  only *Remove transaction* / *Void ticket* may leave the contract blank and runs on every ticket of
  its form (*Contractor* stays a criterion for it; agent default). **A transaction takes the pay
  item's rate for the rule's contract's prime**; a ticket no rule of its prime prices is flagged
  ("Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review."); a pay item with
  no rate for that prime writes a **$0 line**, flagged ("Pay item VEG-HAUL-CY-15 has no rate for
  Summit"). **The payable type is the work; each pay item is a priced line of it** (same work at two
  rates by distance = two pay items, mileage rules). [146, 174, 206, 212, 239]
- **Load-call limits** are a **project setting**: flag at or under **5%** and at or over **95%** by
  default (built-in defaults in `.env`: the release's `packages/domain/policy.env`, ADR-303),
  changeable or off. Not a rule criterion. [164, 303]
- **Pick-list reasons:** voiding, a typed ticket number, accepting a flag, a back-office-created
  record: **picked from a firm list** (defaults, extendable). [173]
- **Forms:** fixed fields on anything that bills (tickets, certifications); **firm-added fields**
  (text, number, yes/no, list, photo) on surveys, ROE forms and incidents, exported, never read by
  the engine or rules; free-text notes on everything. [160] **How they're stored (the path for
  flexible data):** a versioned form definition per record kind (a change is a new version, never
  an edit); each record holds **one JSONB answers column keyed by field ID** and the definition
  version it answered; checked by one schema generated from the definition (`packages/contracts`);
  corrected and audited like any captured field; through Prisma's `Json` type, no hand-written SQL.
  **Nothing the engine, a rule or a flag reads lives in JSONB**: a value they must read is promoted
  to a real column by a migration. A new field or field type is a definition change, not a
  migration. The direction is the user's; the details are an agent default `spec/DATA-MODEL.md`
  settles. [278] **A legacy "Document Format" is a Form**
  ("everything is a form", Q-103): a project picks a form for each document type (load, haul-out,
  unit rate ticket, truck certificate…), and **debris types are added to a form** (with Reduced,
  reduction method, Hidden on phones). **Debris types are named as the contract names the work**: Mulch
  and Ash are two debris types on the haul-out form. **Reduced** says the debris type is already reduced, a
  helper for rules, reports and checks; **reduction method** is a firm list (starts Grinding,
  Incineration, Compaction); **Hidden on phones** takes the debris type off that form's list on phones, and
  tickets that have it keep it. *Agent readings, to confirm:* a *Reduced* criterion on loads and
  haul-outs; setup **warns** (never refuses) when an unreduced class is added to the haul-out form,
  since C&D, metals and white goods often leave unreduced. [211, 214] **Field tags** (the legacy "Special Classes", ADR-234) come back:
  a project list the firm fills, starting empty; the collecting monitor picks one **optionally** on
  Complete, right after the debris type, and a unit rate ticket can take one too (the tower
  doesn't); read only by the *Field tag* criterion and exports; the firm decides what each
  means. *Agent readings, to confirm:* picked at a haul-out's loading end; on unit rate, on the
  review before the number. [211, 216, 218] **Built (ADR-308):** `Form` (one per document type
  on a project, archived ones included; `enabled` read only on forms that aren't a workflow's, whose
  use is `Project.workflows`'; "GPS required" stated on the ROE form alone), `FormDebrisType` (only on
  a load or haul-out form; archived, never deleted), `FormDefinition` (**per project form**, only on
  an ROE, survey, incident or drop-off log form; versions from 1, unique per form; never edited or
  deleted by anyone, a trigger refuses an edit; its fields' shape in `packages/contracts`),
  `Assignment.formDocumentTypes` (those four only). Setup's warning for an unreduced debris type on
  the haul-out form, and what a phone's list offers (not archived, not hidden), are `packages/domain`'s
  `DebrisTypeEntries`. [308]
- **Disposal site dates:** a disposal **before** the activation date ("site not yet active") or
  after a set close date ("site closed") is flagged. [173, 181]
- **Cert-number blocks:** 100 per certifying phone, topped up at sync. **A 0% load call is always
  flagged**, even with the 5%/95% limits off. [181]
- **"Allow split loads"** is a project setting (ticked by default where the program type requires
  ROEs). **Incident sub-types start empty**; the firm adds them. [137]

### Certification — `adms-certifications`
- It certifies a **container or a crew, never a vehicle**. **One number:** cert = placard =
  badge, pre-printed or system-issued, unique per project. Tickets copy it. [015, 016, 017, 045,
  056] **Unique per project only** (the user, ADR-318): the same number on two projects is
  ordinary, never flagged or refused; the golden mission's P2 has its own `730416`. A certification is never copied (ADR-328, below). [318]
- **System-issued cert numbers** come from a per-project series set at project creation, seeded
  with a number that doesn't look made up (e.g. `730415`), counting up by one; a tandem gets
  consecutive numbers. (Q-96, Build 1 answer) [102]
- **Capacity:** whole inches; a primary box plus boxes 1…N (rectangle, ÷2 triangle, two-length
  hoist, round bottom with 3.14, radius corner), each added or subtracted; round to hundredths at
  **each step**; ÷ 46,656; then a whole CY with .5 up. **No override.** Exactly §3A.3, and never
  the `development/` spec's truck section. [076, 078, 082, 087] **Built** as `packages/domain`'s
  `Capacity` (kind and boxes in; the whole CY and the sheet's lines out), in exact hundredths:
  **every single operation of a shape's formula is a step**, rounded half up; a zero, missing or
  fractional measurement, a radius corner marked add, or boxes that subtract as much as the primary
  holds give **no capacity and a plain reason, never a guess**; a crew has none. Whether such a
  certification is saved is its service's (1.2.3). *(agent default)* [320]
- A certification **never ends on its own**. **Tag expiry**, **revoked from a date** (admin, with a
  reason) and **replaced** (a modified truck gets a new cert and a "replaces" link) only flag later
  tickets, with a message to review the certification. **A driver's licence flags nothing**; the
  driver is recorded on the cert only and carried onto its tickets (no driver list). A measuring
  mistake is corrected in place and its tickets reprocess. [079, 082, 153]
- **A certification is never copied** (the user, 2026-10-04): a truck that moves to a second
  project is **certified there from scratch**, measured and photographed again, with that
  project's own number, as tickets, incidents and surveys are never copied (configuration is:
  pay items, rules). Supersedes ADR-152 (Q-143) and `REVIEW_ORIGINAL_CERTIFICATION`. **Built
  (ADR-330):** `Certifications.copy`, the domain's copy rule, `NumberAllocator.next` and
  `Certification.copiedFromId` are gone (three migrations: the viewers' view dropped, the
  column dropped, the view written again; 56 in all). [328, 329, 330]
- **A truck keyed in by hand** bills the **certification's** capacity; the typed capacity is only
  the monitor's claim, flagged if it differs; no such cert → unbilled and flagged until one exists.
  [154]
- **Attestation:** the certifying monitor makes and measures it; a helper is **picked** from the
  people assigned to the project with them, or left blank (never typed; `HELPER_NOT_FOUND` is retired,
  ADR-294, amending 080); then
  a back-office **QC** as "checked by", with a "signatures on file" yes/no. Representatives are
  names only. The paper's barcode isn't used. [080]

### Field events — `adms-domain` §1.2 [236]
- **A field event** is one monitor's record of one thing witnessed at one place and time, under a
  ticket number: collection `COL`, disposal `DIS`, haul-out collection `HOC`, haul-out disposal `HOD`,
  unit rate `URT`. **A ticket is its number and the events under it** (project + workflow + bare
  number). The first event makes the number and the truck carries it to the second.
- **Each workflow, fixed in code:** load `COL` → `DIS` (quantity at the disposal; a split has one
  `COL` per suffix); haul-out `HOC` → `HOD` (quantity at the TDSR end, the disposal confirms it
  dumped and left empty); unit rate, one `URT`. One event of each kind per ticket; another is the
  duplicate quarantined at sync.
- **The completed load and haul-out, statuses, flags, zone, mileage and transactions are not
  events**: the worker draws them from the ticket's current events and setup, alone, and again on
  every reprocess. A synced, back-office-created or corrected event, and a setup change, queue
  reconciliation of the tickets they touch (ARCHITECTURE §13).
- **Event-driven, not event-sourced** (agent default): corrections stay in place with the prior value
  in `AuditRecord`; no correction events, no replayed log. **Forms and certifications are records,
  not a ticket's events** (agent default).
- **Words:** "field event" or its kind; never a bare "event" where the declaration event could be
  meant. **Code** (agent default): `FieldEvent` with `kind` `COLLECTION` · `DISPOSAL` ·
  `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE`; derived `CompletedLoad`,
  `CompletedHaulOut`.
- **What every kind records, as built (task 1.3.3)** [324]: `FieldEvent` holds
  `spec/DATA-MODEL.md` §4.1 (1)'s columns. **Where it came from** (`source`: `DEVICE` ·
  `BACK_OFFICE`): a phone's record carries its phone, assignment and setup version and no
  back-office person or reason; one created in the back office carries the person and the reason
  (from the firm's list) and no phone, assignment or setup version, and was made in no temporary
  session; the system actor creates none (one check, C44). **The number:** whether it was typed,
  and the reason picked; a reason on a scanned number is refused, **a typed number with no reason
  is taken**. **The certification:** the number as scanned, always there, a snapshot; the
  certification found, one of the field event's own project, empty until one has that number;
  keyed in by hand, with the capacity typed (**only on a truck keyed in by hand**, nought or
  more; a crew keyed in has none). **The site** is one of its own project's; a curb collection
  has none. **GPS at both ends**: a latitude and a longitude together, on the earth, or neither;
  no accuracy. **The address** with whether it was looked up or typed. Notes; made in a temporary
  session. **No new required column has a database default.** **Not checked, on purpose:** that
  a number is digits, that times are in order, that the certification found bears the number
  scanned, that a load is on a container's certification, that the site is the assignment's
  (flags, or nothing). No driver, contractor, zone, destination or rate on a field event.
  **Viewers:** a client user and an auditor see every column of their projects' field events
  (`guard_viewer`), and **who recorded each through `viewer_field_event_monitor`** (id, name,
  Monitor ID, nothing else of a person; owner's rights behind a security barrier, as
  `viewer_project_setup`); a contractor user those of its own tickets, and not who recorded them (ADR-361). Who looks the certification up
  by its number is intake's and the worker's (1.4.2, 1.5.2). Sixty models, forty-seven
  migrations. *Agent defaults, but for the C44 check, which DATA-MODEL §8 approved.*
- **What each kind records, as built (task 1.3.4)** [325]: `spec/DATA-MODEL.md` §4.1 (2)'s
  columns, but for the ROE found, which joins with its own table (1.3.6; the scale receipt
  joined in 1.3.5, ADR-326). **None is required, on any kind**: a pick that didn't reach the server is a flag's.
  **The database refuses a detail on a kind that doesn't record it**: a debris type on unit rate
  work; a field tag at a tower or a haul-out's final site; an ROE number off a collection or unit
  rate work; an estimate off a collection; a carried count off a disposal; a kind of work,
  payable type, pay item, count, measurement, root ball, survey number or "marked ineligible"
  off unit rate work. **A debris type is the entry on the field event's own project's form for
  its workflow** (the field event repeats the entry's form and document type; foreign keys, no
  trigger); **a field tag and a pay item are its own project's**. **A split suffix is capital
  letters (`A`… `AA`), only on a collection or a haul-out collection**; a collection has its
  suffix and its estimate both or neither; a pile gives a load call, never an estimate. A
  measurement says whether it was read as a circumference or a diameter (`MeasuredAs`), both or
  neither; numbers are nought or more. **`FieldEventItem`** (an itemised unit rate event's
  lines: an item once, a count or hours) and **`CarriedTicket`** (the numbers a load's
  collection lists, as written, each once, never a link) sit only on the kind they belong to,
  are evidence audited in the records domain, and are seen by a client user and an auditor with
  their field event. **Not checked, on purpose:** a suffixed collection on a project that
  doesn't allow split loads; a pile with no load call; a disposal with both a load call and a
  count; a pay item against the kind of work or payable type beside it; an itemised event with a
  count of its own; quarter hours; a stump "as a circumference"; an ROE or survey number against
  the project (flags, or nothing). **The rule lives once:** `packages/domain`'s
  `fieldEventDetails` and `FieldEventDetails`; `packages/contracts`' `fieldEventDetailsSchema`
  asks it; a database test holds the database to the same table. How a correction takes an item
  line or a carried ticket off: a mark, `archivedAt` (task 1.8.3, ADR-364). Sixty-two models, forty-nine migrations. *Agent
  defaults.*
- **Scale receipts and photographs, as built (task 1.3.5)** [326]: **`ScaleReceipt`**
  (`spec/DATA-MODEL.md` §4.2): its own record, apart from any ticket; the site's number **exactly
  as written**, **never unique** (the user, ADR-328; the key taken off, ADR-331: a receipt book
  starts again at 001, so two receipts of one number are both kept; a duplicate *record* is the
  worker's to flag, 1.5.x); its site one of its own project's; who entered it (never the
  system actor), when, on which phone if any. **Every weight is what the paper says**: all four
  may be missing (a receipt-book slip), none is worked out from another, a net of nought or
  below nought is kept for a flag; only a gross or a tare below nought is refused.
  **`FieldEvent.scaleReceiptId`**: only on a disposal and a haul-out disposal, only a receipt of
  its own project; **a load call or a count beside it is taken** (which bills: 1.5.4). **A
  tandem weighed once is one receipt both disposals point at**; no field event holds a weight
  and no share sits on the receipt. **`Photo`** (§4.4): the record only, the file is storage's;
  **exactly one owner, of its own project**: a field event, a certification or a scale receipt
  today (an ROE, a survey, an incident and a drop-off log join in 1.3.6, a quarantined record in
  1.4.2, C65); a **view** (`PhotoView`, the five) only on a certification's photograph, never
  required; when and where it was taken, the phone; **two fingerprints (SHA-256, 64 lower-case
  hex digits) and two places in storage, each place unique, all four written once** (a trigger
  refuses any change to them, by anyone); its owner, time, place and `uploadedAt` are corrected
  as evidence is. **The back office's two marks (ADR-329 (9), 337):** `archivedAt`, removed from
  the record (a mark with its time; the row, the file and its fingerprints stay; cleared to put
  it back; who did it is the audit record's actor), and `label`, the firm's own words (never
  blank; read by no check); both empty as a phone sends a photograph, both corrected by the API
  and audited, both in `viewer_photo`. **A removed photograph counts for nothing a record must have (the user, ADR-345)**: a certification's views (built), a pay item's required photographs (1.5.7); the service call is 1.8.3's. **The database counts no photographs** ("at most 8" stays the phone's rule;
  each belongs to the field event that took it). A certification is never copied (ADR-328), so each holds its own photographs. Both tables are
  evidence, audited in the records domain; a client user and an auditor see their projects'
  receipts and photographs' records, **never where a file is kept**; a contractor user those of its
  own tickets (ADR-361). **Not checked, on purpose** (flags, 1.5.x): net against gross less tare; the
  receipt's site against the disposal's, or its type; one trip per receipt; a missing view.
  `fieldEventDetails` and `fieldEventDetailsSchema` hold the new link. No service, intake or
  story yet (1.4.2, 1.3.7). Sixty-four models, fifty-one migrations. *Agent defaults.*
- **ROEs and forms, as built (task 1.3.6)** [327]: **`Roe`** is configuration (ADR-294), in the
  records domain: edited freely by the API, audited, never deleted, no archive. Its number
  (issued, `R-0007`, or typed off the paper) is not blank and once per project; only the number,
  `signed`, `answers` and `source` are required, so one can be set up with its number alone. A
  phone's says who made it, the phone, the assignment and the phone's time; a back-office one
  has no phone, assignment or offset. **No setup version.** **`RoeScopeItem`**: exactly one of
  a debris type (an entry of its own project's **load** form, held by foreign keys) and a
  payable type, each once per ROE; a count of 1 or more, never checked; taken off by archiving.
  That a payable type is among the project's unit rate pay items isn't held by the database.
  **`Survey`, `Incident`, `DropOffLog`** are evidence in the records domain, with no status and
  no worker column: "its time" is `madeAt`; one check tells a phone's (phone, assignment, setup
  version) from one created in the back office (person, reason); a whole fix on the earth, or
  none. A survey's ROE and a drop-off log's site are its own project's; a survey has no unique
  key; **an incident may name the contractor involved, a cert number and an ROE number**, each
  optional (ADR-328 (3), built ADR-334: the contractor one on its own project, the
  certification and the ROE found its own project's, each only with its number; the project's
  incident form's `incidentOffers` says which a monitor is offered, never a refusal on the
  record); its sub-type isn't held to its type. **The firm's own fields:** `answers` is an object;
  the definition answered comes with its form and document type, all three or none, of its own
  project's form of the record's kind; **no definition means `{}`** (`formDefinitionId` is
  optional: a form with no added field has no definition). **The answers' schema is
  `packages/contracts`' `formAnswersSchema(fields)`**, made from the version answered (text
  not blank, a number, yes or no, one of a pick's choices, a photograph's id; required fields
  answered; no unknown field); the database doesn't run it. **`FieldEvent.roeId`** only on a
  collection and a unit rate event, its own project's, not held to match `roeNumber`.
  **`Photo`** has seven owners (the four new ones of its own project). A client user and an
  auditor see all five tables with their project, every column; a contractor user none.
  **Not checked, on purpose** (flags, 1.5.7): an unsigned or missing ROE, work out of scope, a
  post-work survey with no pre-work survey. No service, intake or story yet (1.4.2, 1.3.7).
  Sixty-nine models, fifty-three migrations. *Agent defaults.*
- **An outside design review** (contract-first templates, a state machine replacing rules, a billing
  matrix, hard field checks) was weighed: only the event idea is taken; each other point is already
  ours or declined, with the reason, in ADR-238. [238]
- **The harness's phones capture every kind (built, ADR-332).** **The pay item a unit rate
  measurement falls to is one rule**, `SizeBands.payItemFor` in `packages/domain`, for the phone
  and the worker: a payable type with one pay item is that pay item, measured or not (ADR-210);
  with several, the one whose band holds the diameter (a circumference ÷ 3.14, half up to a
  tenth), else **no pay item** (*agent default:* several pay items and nothing measured is no pay
  item too). The harness's phone (`packages/scenarios`) holds its assignment's lists, read from
  the server (never a rate, a rule or a load's pay item), scans the badge at New, picks by name,
  and takes the number last: the first field event's from its own block, the second's scanned,
  either entered again. *Agent defaults (the phone's own, Phase 3 may overturn):* **a number
  entered again that doesn't match saves nothing, the field event stays open and no number is
  used up; a cancelled field event stays on the phone, unsent, with no number; a typed number
  isn't entered twice; the next of a split chain carries its chain's number.** The story
  `p1-field-days` records P1's Monday and Tuesday: 25 field events, a scale receipt, an incident
  and a drop-off log, every field event `PENDING`. The stand-in intake writes them; the real one
  is 1.4.2 (C68). [332]

### Tickets and numbers — `adms-ticket-workflows`, `adms-exceptions`
- **The sync contract's records (task 2.6.1, part 1 of 4, 2026-10-11, ADR-466; agent defaults).** `packages/contracts/src/sync-records.ts`: a field event (with its item lines and carried tickets), a scale receipt, an incident, a drop-off log, a survey and an ROE, each a strict schema, and `syncedRecordSchema` naming each by its kind. **A schema says what a record can be at all, never whether the work was right** (ADR-052): an unknown field is refused, every value is bounded by what the database keeps, a detail belongs to its kind (the domain's `FieldEventDetails`); a gap, an end before its start, a GPS fix that couldn't be one and a number that isn't digits are taken as sent. **No record names a conclusion, money or a certified capacity, nor which phone it is from** (`deviceId` and `source` are the server's to say, from the phone's proof). A time travels as a UTC instant with its offset and is read as a `Date`. **`Intake`'s types are these** (`apps/api/src/sync/sent.ts`), with the phone added; a photograph's record is still by hand (2.6.4). **A phone's field event carries `typedCapacityCy`** (KD-75, closed: intake had no way to take it). The task's other parts: the payload and its answers; a certification; the suite any client must pass. No endpoint yet (2.6.2). [466]
- **One sync, whole, and what it is answered (task 2.6.1, part 2 of 4, 2026-10-11, ADR-467; agent defaults).** `packages/contracts/src/sync.ts`. **Sent (`syncSentSchema`), read in this order:** the phone's clock (`clockAt`, `deviceUtcOffsetMinutes`), its unplanned assignments and the passcode's uses it logged (the schemas their own endpoints read, `phone-reports.ts`), its records, the last number it used of each series; never the phone, who is signed in or a conclusion. **Each record is read on its own by `recordRead`**, so one that isn't a record never refuses the sync or the others (AC-05-45). **At most** 200 records, 20 unplanned assignments, 100 uses, 20 series each once; a phone with more syncs again. **Answered (`syncAnsweredSchema`), one answer for each thing sent, in order:** a record is `SAVED` (with notes), `ALREADY_SAVED`, `QUARANTINED` (reason, words, the record that holds the number) or **`NOT_SAVED`** (**held on the server for a person once 2.6.2 builds its table: the user's decision, ADR-468, replacing 467 (5)'s "kept nowhere"; `quarantined_record` cannot hold it**), for one of three reasons the domain names (`NotSaved`): `NOT_A_RECORD`, `NAMES_NO_RECORD` (the database refuses what it names), `ASSIGNMENT_NOT_SAVED`. A record that isn't one is told which field and how, never a value that was sent (`notRead`, ADR-431's rule). A record under another monitor's assignment is saved as sent. For each series, the blocks held now and `toppedUp`. No endpoint yet (2.6.2); what it leaves: C128. [467, 468]
- **A certification made on a phone, as a synced record (task 2.6.1, part 3 of 4, 2026-10-11, ADR-469; agent defaults).** `syncedCertificationSchema`, the seventh kind of `syncedRecordSchema` (`CERTIFICATION`): what `Certifications.certify` takes and nothing else. **Never a capacity:** the boxes as measured (the primary first, 100 at most, whole inches 1 to 9,999), and the server works it out. Never a QC status, signatures on file, a revocation, who a typed sub is, or the phone. Its number as written, never blank; a sub typed by name; `replaces` names the replaced certification's id and why. The schema refuses only what isn't a certification at all (a field nobody named, a value past its bound, a vehicle type picked and typed, a crew type on a container, a feature on the primary box, a later box with none or two, a helper twice). **What `certify` itself refuses** (measurements that give no capacity, a replacement with no reason, a second tier with no first, a sub typed twice) **and a cert number its project already has are answered `NOT_SAVED` with a fourth reason, `CERTIFICATION_REFUSED`**, in the rule's own words (`NotSaved.certificationRefused`, `.certNumberHeld`); held on the server for a person (ADR-468), never quarantined. **Its photographs are photograph records that name it** (`owner.kind: 'CERTIFICATION'`, with the view); the certification lists none. One way in: `Certifications.received` hands the contract's shape to `certify`; the endpoint is 2.6.2's. [469]
- **A sync, the idempotency ledger and a held record, as tables (task 2.6.2, part 1 of 4, 2026-10-11, ADR-471; agent defaults).** **Task 2.6.2 is cut in four:** the schema (done); the service and the endpoint; what the answer carries besides the answers and the worker reading the clock's difference (`DEVICE_CLOCK_OFF`'s threshold a policy value); the harness's phones through it. **`Sync`** (`sync`): the phone, the server's clock when it began, the phone's clock with its offset, **the difference (the phone's less the server's, whole seconds, wide)** held by the database to the two instants, and the setup version sent, written once; nothing else of it ever changes. **`SyncedRecord`** (`synced_record`, key column `id`, `recordId` in code): one row for each record the server **stored**, `SAVED` or `QUARANTINED`, with its kind (the contract's word), its sync and its phone; written once, never changed. **A record the server could not save is not in the ledger: it is a `HeldRecord`** (`held_record`, ADR-468's table; `SyncAnswer` stays the two values, amending ADR-468 (3)'s last sentence): an id of its own, the phone and the sync, the record's id, project and monitor only as sent (no foreign key), what was sent as any JSON value with its SHA-256, the domain's reason, what the phone was told, and a resolution by a person. **The same thing sent again by the same phone is the same held record**; what was sent is never changed or deleted, and the audit log holds no second copy of it. Each of the three is written only for the phone it names (`sync_from_its_phone_guard`). The API writes them; **the worker reads `sync` and `synced_record` and holds nothing on `held_record`**; a viewer sees a held record as a quarantined one (what was sent only where the firm lets them see private citizens), and no sync or ledger row. No service writes them yet (part 2). `spec/DATA-MODEL.md` §4.5 has the as-built notes. [468, 471]
- **The sync service and its endpoint (task 2.6.2, part 2 of 4, 2026-10-11, ADR-472; agent defaults).** **`POST /phones/current/syncs` (`syncPhone`, `PROVEN_PHONE`; body `syncSentSchema`, answer `syncAnsweredSchema`), served by `Sync` (`apps/api/src/sync/sync.ts`).** A `Sync` row is written first as the device key's actor on the proven phone, with the phone's clock less the server's rounded to the second; one row a call. Then, in the payload's order, each its own piece of work and its own answer: unplanned assignments (`UnplannedAssignments.received`), passcode uses (`PasscodeUses.received`), records, numbers. **A record:** the ledger is asked first (an id held as `SAVED` under the same kind is `ALREADY_SAVED`; a quarantined one and one stored before the ledger are `Intake`'s own look); the server adds `source: 'DEVICE'` and the phone; `Intake.receive(sent, brought)` or `Certifications.received(sent, brought)` stores it **with its ledger row (`ledgerRow`) and its job in the same piece of work**, as the monitor from the phone. **What a sync queues (trigger `SYNC`, no person, one job a record):** a saved field event's ticket and its neighbours; an ROE's waiting tickets, else a job that names none; a survey, a job that names none; a certification as `certify` does; a scale receipt, an incident, a drop-off log and a quarantined record nothing. A record received with no sync named (a story's own intake) writes no row and no job. **Held (`HeldRecord`, by `Sync` alone, as the device key's actor):** what isn't a record; a record under an unplanned assignment this sync answered `NOT_SAVED` (not tried); what the database's constraints refuse or a form definition the server lacks (`NAMES_NO_RECORD`; never an error, never the database's words); a certification its rules refuse, whose number is held or that replaces one already replaced (`CERTIFICATION_REFUSED`, asked before `certify`). A unique refusal on any other record and anything else thrown stay the server's failure; a report answered `NOT_SAVED` is not held. **The fingerprint is the SHA-256, hex, of what was sent as canonical JSON in UTF-8 (keys sorted at every depth)**: the same thing again, in any field order, is the same held record. **The phone is told the domain's words plus "Held on the server for review." (`NotSaved.heldForReview`), only once it is held.** A held record whose record is later saved stays for a person. **Numbers:** `NumberAllocator.topUp` as the device key's actor, a lost race asked again; a refused report answered `toppedUp: false` with the blocks held before. A saved certification's warnings are not sent to the phone. The log carries the phone, the sync's id, the difference and counts by answer: never a record, its id or a message. **Not yet:** lists, a new passcode check and `setupVersionSent` in the answer, the worker reading the difference (part 3); the harness's phones through it and a database's refusal as a story (part 4); a per-phone limit (2.6.5).
- **What a sync brings besides its answers, and the clock's flag (task 2.6.2, part 3 of 4, 2026-10-11, ADR-473; the lists staying out of the answer and the 5-minute limit confirmed by the user, ADR-474; the rest agent defaults).** **The phone says what it holds**, last in `syncSentSchema`: `holds: { masterPasscodeVersion, listsProjectId }`, each null where it holds none. **The answer gains two things that need nobody signed in:** `masterPasscode: { version, check }` (the version in force; a check, the login list's own kind, only where the phone holds another, made by `PhoneLoginList.passcodeBrought`, and the version the phone's record holds moves then as the device key's actor) and `setupVersion: { projectId, version }` or null (that project's setup as its phones are shown it now, a new version made where it moved, `SetupVersions.numbered`; null for no lists held or a project the server doesn't have). **Never the lists or the login list:** those are an assignment's, read by a signed-in monitor's phone at `GET /phones/current/lists` and `POST /phones/current/login-list`; ARCHITECTURE §9 (6) is those reads beside the sync's call. **`Sync.setupVersionSent` is written once, by `Sync`, as the device key's actor**, where a version was sent. `syncAnswerRead` takes another project's setup version for no answer. The log says the passcode's version, whether a check went and the version sent, never a check. **The worker:** `project-read.ts` reads each phone-made field event's sync through `synced_record` (its id, `FIELD_EVENT`, `SAVED`) and hands `TicketChecks` the difference in whole minutes with the seconds dropped, signed; `WorkSettings.deviceClockOffLimitMinutes` is the policy value **`DEVICE_CLOCK_OFF_LIMIT_MINUTES=5`** (1 to 1,440; the worker's own settings may state another, ADR-395). **More than the limit's whole minutes off, ahead or behind, flags that sync's field events `DEVICE_CLOCK_OFF`** (6 m 00 s is, 5 m 59 s is not); a back-office record, or one no sync stored, has none. C53 is done with it. Proven by `apps/api/test/sync.test.ts` and the story `p1-queued`'s last step, which syncs through the API's own `Sync`; **every other story's phone still syncs through the stand-in, so its tickets have no sync to read until part 4.** **Raised, not built:** a phone that syncs with nobody signed in learns its lists moved and can't read them (2.6.5 decides whether a proven phone may read the lists of an assignment that names it).
- **The harness's phones sync through `Sync` (task 2.6.2, part 4 of 4, 2026-10-12, ADR-475; agent defaults).** A story's phone reaches the server only through **`story.server`** (`PhoneServer`: the API's `Sync` built as `api-process.ts` builds it, and the intake behind it for a photograph's record until 2.6.4; `story.serverOn(clock)` for field days told again). `SimulatedDevice.sync(server)` sends JSON, read by `syncSentSchema`, and reads the answer by `syncAnswerRead`; with its records it reports the last number used of each series it holds and takes in the blocks answered, the master passcode's version, and whether its lists are stale (`listsStale`). **What a phone sends apart from its day's records is a sync of its own** (`stories/board.ts`: `synced`, `firstBlocks`, `sentAlone`, `unplanned`, `loggedUse`); no story calls `Intake`, `NumberAllocator.topUp`, `UnplannedAssignments` or `PasscodeUses` for a phone, and **a top-up is audited as the device key's actor**. Held field days are whole syncs (`office.syncs`), replayed by `P1Syncs.arrive` with the phone's clock as it sends them. `p1-reviewed`, `p1-voided` and `p1-invoiced` settle the queue after each later sync; **the stories that ask for whole runs by hand, the golden mission among them, leave their syncs' jobs waiting** (Milestone 2.8, C134). The story **`held-for-review`**: two phones racing for one cert number, and a record the database's constraints refuse, each held exactly as sent and never answered "saved". `SyncStandIn`, `SyncIntake` and the context's `intake` are gone.
- **A story's phones go through the API's process over HTTPS (task 2.7.1, part 1 of 4, 2026-10-13, ADR-491, 492; agent defaults).** The task is cut in four (ADR-491): this part; every other request of a story's phone; the worker's own job loop draining each story's queue; the back office's acts and the viewers' reads. **A story's API is the API's process itself** (`ApiProcess` with `ApiModule`; `StoryApi`, `packages/scenarios/src/story-api.ts`) on the story's database, clock and store, started at its first request and stopped at its end, listening at 127.0.0.1:3180, and **reached only over HTTPS through the stack's proxy at `stories.adms.localhost`** (`OverHttps`; the certificate checked against the stack's own root alone, OWASP ASVS 5.0 12.3.2). The installation's own API can't run a story (it keeps `adms` and the real time). **One clock at a time:** `story.phonesOn(clock)` is every request of a story's phones on that clock, the story's API started again on it (ADR-493, in place of part 1's `serverOn`); two requests at once on two clocks stop the story. **A phone proves itself with its own key** and holds the token until it runs out by the clock in use (`story.proofs.proves`); a refused proof is told only `PHONE_NOT_PROVEN`. `story.server`'s sync, file parts and turn-in go through their endpoints; any answer but a 200 stops the story. **A story's setup stays on the setup services** (ADR-491). The golden mission's figures did not move.
- **Every request a story's phone makes goes through its endpoint (task 2.7.1, part 2 of 4, 2026-10-13, ADR-493; agent defaults).** `StoryApi.requests(clock)`: enrolment, a monitor created, a sign-in, a session and the setup's choices under the master passcode, the lists, and part 1's sync, file part and turn-in, each answer read by the contracts' schema. **A phone holds its monitor's session** (a sign-in's, or one opened under the passcode) and a monitor's request carries it in `x-adms-monitor-session` beside the phone's token (NIST SP 800-63B §7.1; ADR-443). The runner's in-process phone services and `phoneNow` are gone; a story is told what the endpoint answered (`TakenAtSignIn`, the contracts' answers). **`story.lists.held` stops the story where the phone takes another assignment than the one named**; the session opened under the passcode is found by phone, monitor and kind (its id isn't told to a phone). `p1-office`'s field days told again take every phone request on their own clock (`phonesOn`); their phones prove themselves in time order.
- **Every story's queue is drained by the worker's own job loop (task 2.7.1, part 3 of 4, 2026-10-13, ADR-494; its defaults confirmed by the user, ADR-495).** `QueueRuns` (`packages/scenarios/src/stories/p1-office.ts`) runs the worker's own `JobLoop` on the story's worker login, database and clock under the release's policy, as `apps/worker/src/main.ts` runs it; **no story calls `Reconciliation.run`**, so every run a story sees works only the tickets its jobs name. `JobLoop.pass()` answers what it did with each project (`ProjectPassed`: the run's own `JobsOutcome`, or the error), which the process ignores. A story settles the queue after a sync, an action or a setup change (`settle`, `settled`: one run's own answer, or the story stops), reads a whole project as it stands from its records (`standing`), and adds by hand only a reprocess a person asks for with nothing changed, or the job beside a correction it still writes by hand (`asked`; no endpoint queues one yet, C144). **The golden mission checks that every run on its two projects took up jobs, none waits and none was set aside** (exit criterion 1), its figures unmoved. `Reconciliation.run` stays, called by nothing, until 2.7.1 closes (C144).
- **The back office and the viewers at their browsers (task 2.7.1, part 4, piece 4a, 2026-10-13, ADR-496; agent defaults).** **Part 4 is cut in four pieces:** 4a this; 4b voids, acceptances, corrections, renumbers (`p1-voided`, `p1-left-out`, `p1-reconciled`, `p1-priced`; C144's reprocess); 4c QC, the lock, a batch, the unlock (`p1-invoiced`, `golden-mission`); 4d quarantine, back-office records, a certification's measurement and revocation (`p1-reviewed`, `certification`…), then 2.7.1 closes. **`OfficeBrowser`** (`packages/scenarios/src/office-browser.ts`) is a person at their browser over HTTPS to the story's API on the story's clock: signed in with email, password and the code their authenticator shows now (good once a step: the story stops rather than give a step's code twice, NIST SP 800-63B §5.1.4); a password an admin set changed at once; an admin's or a manager/analyst's authenticator set up at once; **the session held only as the cookies the API sets**, the CSRF value sent past a GET (ASVS 3.5.1); answered `NOT_SIGNED_IN` (the clock moved on), it refreshes, else signs in again, and sends once more. `asked` gives any answer; `answered` a 200 by the endpoint's schema or stops the story. **`story.backOffice`:** `admin(person)` (the first admin's password set on the server, `ServerAdmin.letBackIn`, as `pnpm installer:admin`), `person(by, person)` (the first password set by that admin at `setPersonPassword`), `signedOut`; one browser per person. **No story writes a credential by hand.** Dana and Luis are written with their sign-in addresses (`p1.ts`). **`p1-viewed`:** viewers created, given P1 and their first passwords at the people endpoints; every read at `/viewer/…`, a ticket not shown answered 404; AC-10-30's nobody is the door's refusals (401 signed out, 403 for an admin). `story.viewed` is gone from the context.
- **Voids, acceptances, corrections and renumbers at Luis's browser (task 2.7.1, part 4, piece 4b, 2026-10-13, ADR-497; agent defaults).** `p1-voided`, `p1-left-out`, `p1-reconciled` and `p1-priced` make every void, unvoid, acceptance, correction and renumber at its endpoint as Luis, signed in (`voidTicket`, `unvoidTicket`, `acceptFlag`, `correctFieldEvent`, `renumberFieldEvent`); **no story writes a correction or its job by hand**: the endpoint queues its own, neighbours too. **`p1BackOffice(story, office)`** (`p1-office.ts`): `danas()`, `luiss()`, and `grantLuis(...)`, Dana reading Luis at `readPerson` and stating the whole set at `setPermissions`. **`refusalOf(answer)`** (`over-https.ts`): `403 NOT_ALLOWED` (the door, no words) or `422 NOT_SAVED · CODE: plain words`. An act's answer is `{ record, warnings, queued? }` (`queued`: job ids, a count of tickets, of locked ones), never the service's `reprocess`. ~~**A reprocess a person asks for with nothing changed has no endpoint in Phase 2**~~ (overturned by the user, ADR-498: it has one since 4b2, ADR-499; `QueueRuns.asked` is gone). Still written by hand: `p1-priced`'s and `p1-reviewed`'s locks (4c, 4d).
- **A reprocess a person asks for, and a job set aside (the user, 2026-10-13, ADR-498; built in 2.7.1 piece 4b2, ADR-499).** (1) **A reprocess endpoint:** a back-office person names tickets of a project (at most `JOB_TICKETS_AT_MOST`) and asks for them to be worked again, nothing changed; an admin, or a manager/analyst holding *correct* (no new permission); it changes no record, only queues one `REPROCESS` job naming the person, audited; a ticket locked as invoiced is left as it is by the worker and counted in the answer. It is how a ticket flagged "could not be processed" is fixed once the cause is gone. (2) **A job set aside** (after `JOB_TRIES_BEFORE_SET_ASIDE` whole-run failures) **is logged as an error with the code `JOB_SET_ASIDE`**: what queued it, how many tickets, how many tries, the kind of failure; never the error's text, a name or a ticket's contents. No alert yet. (3) **It is put back through the reprocess endpoint** (its tickets, or the job's id); the old job stays set aside as the record of what failed.
- **The reprocess endpoint and the set-aside line, as built (2026-10-13, ADR-499; agent defaults (a)…(f)).** `POST /projects/:projectId/reprocesses` (`reprocessTicketsEndpoint`, `Reprocesses`): `{ tickets }` or `{ setAsideJobId }`, with a note kept in the audit record; one `REPROCESS` job naming the person, **the tickets alone, never neighbours**; **a ticket locked as invoiced is left off the job and counted** (as `WorkQueue` does everywhere; the worker's own look for a lock is proven by a job queued before the lock, `p1-priced`); refused (`ReprocessAsking`): `TOO_MANY_TICKETS` (over `JOB_TICKETS_AT_MOST`, each counted once), `NOT_A_TICKET` (a named number with no field event of the project in its workflow; not asked of a set-aside job's), `NOT_ON_THIS_PROJECT`, `NOT_SET_ASIDE`; an unknown job is 404. A set-aside job that named no ticket is put back as a job for the project's own records; the job set aside never changes, and nothing links the new job to it but the answer and the audit record. **The worker's line:** one error (level 50) a job set aside, `code: 'JOB_SET_ASIDE'`, `projectId`, `jobId`, `trigger`, `tickets` (a count), `tries`, `failure` (`RUN_FAILED` with `failureKind` and `failureCode`, or `STOPPED_WITHOUT_A_WORD`); never `lastError`, a number or a name.
- **QC, the lock, a batch and the unlock at their endpoints (task 2.7.1, part 4, piece 4c, 2026-10-13, ADR-500; agent defaults).** `p1-invoiced` and `golden-mission` make every QC mark, lock, batch, batch change and unlock at its endpoint (`setQcStatus`, `lockAsInvoiced`, `createInvoiceBatch`, `setLockBatch`, `unlockInvoiced`), as Luis at his browser and the unlocks as Dana at hers, and their voids, acceptances, corrections and renumbers too; their grants are Dana's request at `setPermissions` (`grantLuis`). `p1-priced`'s lock of 101004 is Luis's QC Approved and lock at the endpoints between his reprocess request and the run, which leaves it as it is (the worker's own look for a lock, C147). A lock's or a mark's answer names a unit rate ticket `unitRateTicketId`; the unlock's answer says what it queued (`queued`: one job, one ticket). No exact audit list moved. **Only `p1-reviewed` still makes review acts in process** (4d). What it leaves: C148.
- **The suite any client of the sync contract must pass (task 2.6.1, part 4 of 4, 2026-10-11, ADR-470; agent defaults).** `syncClientSuite` (`packages/contracts/src/sync-client-suite.ts`): eight checks, no test runner and no server; a client is handed what it holds, the suite reads what it sends off the wire, plays the answer and looks at what it holds and shows. **A client is held to:** every part of `SyncSent` sent, empty where there is nothing; each record once, as recorded, under its phone-made id, never which phone; a scale receipt ahead of the disposal that points at it, no record ahead of its unplanned assignment; no sync over the contract's limits; **only `SAVED` and `ALREADY_SAVED` take anything off the phone** (`stored`), a `QUARANTINED` or `NOT_SAVED` record or report kept and shown as not saved with the server's reason and words; **no answer, and what is no answer to what was sent, mark nothing**. **`syncAnswerRead(sent, answered)`** (`sync-client.ts`) is the one rule for the second: the contract's shape, one answer for each thing sent, each in its place and under its id, else null. Left to a client: when it syncs, its store, and whether a kept record is sent again. The example records are `src/sync-examples.ts` (`syncExamples`). **The harness's phone is the first client** (`SimulatedDevice.sends` / `answered` / `certify`; `SyncStandIn` stands where the endpoint will until 2.6.2, records and certifications only); a sync with no answer leaves everything it carried on the phone. [470]
- **Intake and quarantine are built (2026-10-04, task 1.4.2):** `Intake` (`apps/api/src/sync/`), a
  plain service with no endpoint (Phase 2 wraps it): `receive(record)` answers **`SAVED`** (with
  notes), **`ALREADY_SAVED`** or **`QUARANTINED`** (the reason, a plain message, the record that
  holds the number); `topUp(phone, reports)` fills the phone's number blocks, asked again when it
  loses a race. Each record is written as the monitor who made it, from their phone, with the
  server's received time. **A retry is known by the phone-made id** already being a record of
  its kind or a quarantined record; `Sync` and `SyncedRecord` wait for Phase 2. **A duplicate**
  (a second field event of one kind on one project, workflow, bare number and split suffix) goes
  whole into **`QuarantinedRecord`**: its phone-made id, project, phone, monitor, the record as
  sent (`payload`), the reason (`DUPLICATE_FIELD_EVENT` · `DUPLICATE_ROE_NUMBER`), what holds the
  number (`holdingEventId` or `holdingRoeId`, exactly the one the reason names) and the received
  time; later its resolution (who, when, what: free text until 1.8.x). **The first received
  holds the number**, a voided ticket's field event included. **An ROE made on a phone whose
  number the project already has is quarantined the same way.** What the phone sent is never
  changed (a trigger, any login) and never deleted; audited in the records domain; the worker
  never reads it. **A client user and an auditor see that a record waits; the record as sent
  only through `viewer_quarantined_record_citizen`**, where the firm lets them see private
  citizens. **`Photo.quarantinedRecordId`** is a photograph's eighth owner. **Intake fills in**
  the certification a cert number finds, the ROE a number finds (and points earlier records at
  an ROE when it arrives), and a debris type's form; **it refuses nothing else**: a record with
  a gap is saved as sent, `PENDING`. **An impossible GPS fix isn't written: the field event is
  saved without it and the fix kept as sent in `FieldEvent.unreadableGps`** (the domain's
  `GpsFix`; a form's, an ROE's and a photograph's is kept in the insert's audit reason). A
  form's answers are run against the version answered and saved as sent either way. A record
  the database's own constraints refuse throws and stays on the phone (the sync contract's,
  Phase 2). The words a phone is told are the domain's `Quarantine`: "Ticket 101020: this ticket
  already has a disposal. Not saved: kept in quarantine for review." Stories `sync` and
  `p1-any-order`; sixty-five migrations; 60 test files, 1,199 tests. Left for later: C69.
  *Agent defaults, for the user: an ROE's quarantine, first received holds the number, the
  wording, a viewer's sight, where an unreadable fix is kept.* [338]
- Two field events per load, two witnesses. The load call is on the **disposal** for a standard load
  and on the **collection** for a haul-out. One truck has one open load at a time. [013, 027]
- Numbers are **bare**, in a **per-project series per workflow** (load, haul-out, unit rate),
  from 100,001 to 9,999,999, unique per project. `COL`/`DIS`/`CLT`/`HOC`/`HOD`/`CHO`/`URT` labels
  are **display only**. Generated numbers come from **1,000-number device blocks**, reclaimed on
  reset. Control tickets use pre-entered ranges. [046, 056, 062, 065]
- **Numbering as built** [323]: `ProjectNumberSeries` (one per project and series: `LOAD ·
  HAUL_OUT · UNIT_RATE · CERTIFICATION · ROE`; first number, next number never handed out) and
  `ControlRange` (loads and haul-outs only; two of one series, neither taken off, never share a
  number). A generated project has a series per workflow; a control-ticket project only the unit
  rate series; either an ROE series from 1, and a cert-number series once the firm seeds it
  (without one, cert numbers are typed). **Two phones never hold the same number:** the database's
  `number_blocks_never_overlap` keeps apart what blocks *hold* (an issued or retired block its
  whole run; **a reclaimed block only what its phone used, so its unused rest is cut again for the
  next phone, once**: ADR-065's own words). A block is cut only from a series its project has;
  ticket series and their blocks lie inside 100,001–9,999,999 by checks. The rules are
  `packages/domain`'s `numbers.ts` (`NumberSeriesRules`, `NumberSeriesBook`, `PhoneNumbers`,
  `ControlRanges`, `NewProjectNumbers`); the allocator is `apps/api`'s `NumberAllocator`
  (`topUp`, `reclaim`, `retire`, `next`). **Block sizes are policy values:** 1,000 ticket
  numbers, 100 cert numbers, 100 ROE numbers. *Agent defaults:* **a phone-made ROE's number is
  written `R-0007`** (`R-` and at least four digits; written, never parsed); ROE blocks of 100;
  control ranges of one series never overlap; a top-up brings a phone to a full block of unused
  numbers at every sync, however few it used.
- **Splits:** N collections → 1 disposal, grouped on the base number; the first is **`-A`**, never
  bare. Each property's share = its estimate ÷ Σ estimates, applied to CY or tonnage. There is no
  divergence check. **Rules run once per property**, on its share (its own zone, address, mileage;
  the load's cert, disposal and load call; *Volume* = its share). [032, 033, 055, 064, 162, 173]
- **Split haul-outs** (where the project allows split loads): N haul-out collections → 1 haul-out
  disposal, one collection per **pile** at the TDSR (debris kept apart by the area it came from),
  `-A`, `-B`… Each gives the **load call so far**; the last is the haul-out's. A pile's part is what
  it added (10%, 35%, 85% → 10, 25, 50); its CY = capacity × its part, its share of a scale weight =
  its part ÷ the last call. **Rules run once per pile.** *Agent defaults:* a pile is told by its
  debris type and field tag; a call not higher than the one before is flagged
  (`PILE_CALL_NOT_HIGHER`) and nothing bills; the load-call limits judge only the last call. A truck
  and trailer hauled out and weighed once are split by capacity, flagged and marked as shares, as
  loads are. [295] **Paid by the CY or by the scale's weight, as the firm's setup says** (the user, as a
  firm): the pay item's Unit of Measure decides and the firm's rules pick it, exactly as a split
  load's shares apply to its CY or its tonnage; a haul-out usually ends at a scale house, so the
  weight is the common case; the load calls are taken either way and set the shares. [297]
  **Required and in the golden mission:** REQ-111a (the shape) and REQ-120j (the shares); mission
  ticket **201004**, approved: 110 CY, calls 10%, 35%, 85%, dumped at Cypress Creek Landfill and
  weighed at 24.00 tons → 2.82, 7.06 and 14.12 tons, one `MULCH-HO-TN` line per pile at $20.00,
  three lines, $480.00; its CY (11.0, 27.5, 55.0) kept, unbilled. P1 ticks *Allow split loads* and
  holds both `MULCH-HO-CY` and `MULCH-HO-TN`, its haul-out rules picking by *Disposal site* (201001,
  to Bayline County Landfill, stays by the CY). *Agent defaults:* the second landfill, its per-ton
  rate and its monitor; no flagged pile; numbered 201004. A split haul-out paid by the CY and one
  with a pile that isn't higher are acceptance scenarios, not mission tickets. [296, 297]
- **A refused load is not recorded**; a load dumps once and has **one** disposal. [155]
- **ROEs** are records like tickets: made on a phone (offline) or in the back office; number,
  parcel ID, address, owner, signed + date, **scope** (choices, counts, GPS), photo of the signed
  form. On an ROE-required project **every collection, unit rate ticket and survey carries one**. A
  **post-work survey links to its pre-work survey by ROE number** (flagged if none). A phone-made ROE
  takes a number from the phone's block unless the paper ROE has one (typed); its **scope** is
  picked from what the project already has (its load form's debris types, its unit rate payable
  types, each with an optional count that is recorded, never checked), and a ticket whose debris
  type or payable type isn't among them is flagged; no picks, no scope check (ADR-293, amending
  ADR-181 (6)); "GPS required" is a setting on the ROE form. [149, 150, 181]
- **Unit rate:** after the crew badge and crew photo, the monitor picks the **pay item** being done
  (the legacy "hazard type") **by name**, never a code: the list shows **each payable type once**
  (Leaners, Hangers, Stumps), the monitor measures, and **the phone works out the payable pay item** in
  the background from the pay items' size bands, printing it on the receipt with the work
  details; reconciliation matches rules on that pay item, the measurement and the contractor. So
  **each unit rate ticket carries one pay item**. The ticket keeps **the pick and the pay item**;
  reconciliation works the pay item out again from the bands, so a corrected measurement moves it on
  reprocess (the phone's answer printed, the engine's bills); **no band → no pay item, flagged**;
  bands in one payable type **can't overlap** (setup refuses) and a gap warns; rules test *Service
  code*, one per band. [207, 213, 217] Itemised details (washer, dryer; skid steer, truck) sit inside that one code and are **not**
  pay items. Capture shape ≠ billing basis. Itemised lists (white goods, HHW, **crew time as
  item + hours**). HHW pounds are entered as the count. **Each unit rate code names its kind of
  work** (Hangers, White Goods, Crew time…, the sub-type list), which picks the screen and the item
  names; a phone gets the unit rate codes chosen for it at setup. White goods bill the **total of
  payable items**; crew time bills the **highest item's hours**, once; freon recovery is either
  extra transactions from the item list or its own ticket, per project; kinds never mix on a ticket.
  **Rules** say which items count toward which code (*Item* criterion, *Quantity from*); a code with
  no rate is a **$0 code** that still writes a line (staged freon). White goods pay **per item
  removed, not by type**; a staged freon fridge gets only the $0 line, then `WG-RMV-EA` + `WG-FRN-EA` when removed
  later (not double billing). Worked example: ticket A = `WG-RMV-EA × 6`, `WG-FRN-EA × 2`; ticket B = `WG-RMV-EA × 4`,
  `WG-FRN-EA-STG × 2` (`spec/RULES.md` §9). [040, 054, 084, 124, 126, 127, 128, 131, 132]
  **Measurement:** a standing tree at chest height before it's cut; the monitor records **whether
  they measured the circumference or the diameter**; rules test the **diameter** (circumference ÷ 3.14,
  half up to a tenth); an already-cut tree's diameter, with photos, is eligible; QC checks the photo.
  One per ticket (a hanger: limbs of 2 in or more); "Measurement required" is a pay item setting. A
  pay item's **size band** (from, to) sets its place among the pay items of one payable type (the
  phone and the engine pick the pay item by it), and on a payable type's only pay item they **flag**
  a ticket measured under or over them. A pay item with **"Monitor may mark ineligible"** lets the monitor
  mark the work **ineligible**, and the ticket is flagged. [210, 213]
  **Stumps:** CY = [(D² × 0.7854) × 24 + ((3.6 D)² × 0.7854) × 31] ÷ 46,656, D = diameter two feet up
  (L = 24 in recorded from the user). From the USACE Stump Conversion Guide: the ticket records **only
  the diameter** (root ball fixed by the guide, no fill dirt); CY **rounded half up to one decimal**
  (30 in → 6.5 CY; all 79 table rows match). A stump is **two pieces of paid work, extraction and
  debris removal**, each with the firm's own codes and rules. **Paid as the contract says, never from
  the stump's CY:** in the user's example, extraction **EACH by size class** of the diameter two feet
  up (#1) and **fill per CY** (#2), one ticket per stump, two codes (ADR-196). **Under
  24 in is not an eligible stump** (flagged, never refused; FEMA pays per stump only from 24 in two
  feet up); no maximum; the same formula at every size; **no circumference** for stumps. The monitor
  measures **the stump two feet up** (the *Measurement*, the 24 in test) **and the root ball's
  diameter**, for the fill; a root-ball reading never goes into the stump CY formula as D. **The stump
  ticket is a unit rate ticket, kind of work Stumps** (built in): diameter two feet up, root-ball
  diameter, "half or more exposed" (yes/no), **no hole depth**; the survey number picked or typed
  (none: flagged). **Fill CY = 0.7854 × root ball² × 31 ÷ 46,656**, half up to a tenth (31 in is the
  USACE guide's root-ball height; 96 in → 4.8 CY). A rule pays from **the stump (1 each) or the fill
  CY, never the stump CY**; **no root-ball rule criteria**. The fill is an ordinary rule
  (*Pay item = the stump code* → #2 from the fill CY); no root ball, no fill CY, no fill line.
  **Two built-in stump checks**, each on by default and switched per project: root ball not wider
  than the stump; fill paid but the root ball not half exposed (both still bill). A blank root ball
  is flagged when the code requires the measurement. **The 31 in is a project setting**, default 31.
  [198, 203]
  A smaller stump goes out as ordinary vegetative debris. **A load of stumps is an
  ordinary load whose code measures quantity "from the stumps"**: never called or weighed; the stump
  ticket's number is painted on each stump and the loading monitor adds each by that number (no match,
  or already on another load: flagged); the tower counts and confirms (mismatch flagged); CY = each
  stump's CY rounded to a tenth, then added. **Backfill** is the firm's own code and rule on the stump
  ticket, measured from the **root ball** (not the stump CY); a stump ticket under 24 in stays flagged
  (a firm's rule may void it). **Whether the load of stumps bills its CY is the firm's rules**: a
  hauling code where the contract pays hauling (the sheet in `spec/RATE-SHEET.md` does), a $0 code where the
  per-stump price covers transport; nothing checks for "paid twice". [177, 178, 183, 187, 189, 192,
  196, 198, 199] **Demolition** is ordinary debris work billed by the CY on a project named for it; no
  kind of work, no square-foot unit. [200] **White goods priced by destination** ride a load: the curb
  unit rate ticket, then a collection when loaded, a white goods debris type, a code and a distance
  rule; the load needs no load call because its pay item's quantity comes **from the tickets it
  carries** (ADR-215; no longer a "staging" site); rare. The items are **paid once, on the load**, at the mileage
  band's rate (six fridges 40 miles away, `WG-HAUL-EA-60` 6 × $65, not $40 at the curb plus $65); the count comes from the
  white goods ticket the load carries (added by its number, counted at the tower, like a load of
  stumps); the curb ticket's own lines (e.g. freon) are the firm's rules. "White Goods" is a **debris
  type the firm adds**; nothing groups types (field tag doesn't change that, ADR-218). [201, 204, 215] **Crew time:** several tickets a day per crew allowed; the 12-hour check adds each
  item's hours over the crew's day; overlapping crew-time tickets are flagged. [158, 159]
  The crew badge is kept on the
  phone until the monitor changes crew (the system doesn't track it); monitors document only work
  they believe eligible, except that a pay item with "Monitor may mark ineligible" lets them mark work
  ineligible (flagged). [111, 210]
- **Every start on the phone** (ticket, incident, form) is **start → pick from a list → maybe a
  sub-list → details**, each list built from project setup and custom values. **The legacy order**
  (ADR-209): every phone opens on the same home screen; **New** takes the **badge scan** and opens
  the ticket, which waits in the phone's open list while the truck loads; **Complete** takes the
  details and then **the ticket number**: the control ticket scanned, or a generated number shown at
  that same point, then **re-entered by hand** to confirm, generated numbers too. The tower follows
  the same pivot. **What the monitor picks, by name, never a code** (ADR-207): a load's or haul-out's
  **debris type** on Complete, from the project's debris types on that form (ADR-211, Q-201); a
  unit rate **pay item** after the crew photo. **The truck's scanned information, not the monitor's
  pick, decides whose work it is** (ADR-186). **Both events pick the debris type** and a difference
  is flagged "debris type mismatch". A load's capture settings (weight instead of a load call, a
  quantity from the tickets it carries, photos, GPS) **stay on the pay item** (ADR-213, ADR-221). **No
  phone knows which pay item a load is paid at** (its miles, so its pay item, are known only after
  sync) (ADR-221). **A load asks for one quantity, never both**: a load call, or the scale weight
  when the pay item the firm's rules pay it at is by weight (its **Unit of Measure**); **the site
  doesn't own weighing**; **no pay items are ticked on a phone**, whose setup stays basic; a haul-out
  takes its load call at the loading end as always. Fees never make a phone ask for anything (ADR-224).
  **What a site's phones ask for is worked out ahead by the back office** from the rules on that
  form that could match there (tipping fee pay items left out) and **follows the truck's prime**: all per ton
  or pound → the scale receipt instead of a load call; all "quantity from the tickets it carries" → a
  **count** of the stumps or items on the truck (agent default, ADR-243); anything else (per CY, a mix,
  no rule) → the load call. **The phone's assignment names its site, and its lists carry that site's
  lookup** (ADR-240, 243); it's shown on the site's page. The tower holds no ticket list: the worker
  compares its count with the collection's carried tickets after sync (ADR-243). A weight-paid
  haul-out keeps its loading-end load call, unbilled. A Final Disposal tower offers the receipt
  number as an optional field (agent default). [213, 221, 223, 227, 243] Where "normal or
  split" is asked in the new order: not yet placed. Surveys/ROE start with the **work type** (Pre-work · Post-work · ROE); incidents with
  **type, then sub-type** (firm-added, empty at install). "Normal or split" is asked only on projects
  that **allow split loads**. [127, 137, 186, 207, 209]
- **Capture:** the collection address comes from "Get GPS" then "Get address info" (looked up if
  online, else street number and name typed); a typed ticket number is flagged and needs a reason;
  the load call is **typed** as a whole number 0–100, never prompted; **0 is accepted and flagged**
  and bills nothing. [111, 116]

### Reconciliation and review — `adms-validation`, `adms-exceptions`
- **The worker's run is built, unpriced (task 1.5.9, 2026-10-05):** `new Reconciliation(db, clock, { crewItemHoursLimit, longestRunMs }, mileages).run({ projectId, trigger, requestedById? })` (`apps/worker/src/reconciliation/`) answers `{ ran: true, runId, ticketsDone, ticketsFailed, tickets, pending }` or `{ ran: false, reason: 'RUN_UNDER_WAY' }`. **One run per project at a time**, by a Postgres advisory lock held in a transaction for the length of the run (a run needs two connections). **It reads the whole project once** (`ProjectRead`: every field event that isn't void, the setup, what was concluded before) and **works every ticket**: no queue record exists; what starts a run is Phase 2's job queue. **One ticket is one `db.$write` as the system actor** (`TicketWork` concludes, `TicketWrite` writes): the worker's columns on its field events, its completed load or haul-out with a row for each collection (updated in place; marked dissolved, with its rows, while the ticket isn't whole, and un-marked when it is again), its flags through `Flags.compared`, the run's decision. **Only what differs is written**: a run over unchanged input writes its run and decisions and not one other audit record. **A ticket that errors** gets `NOT_PROCESSED` (once) and a decision with the error, in a piece of work of their own; its status and earlier conclusions stay; the flag clears when it is next worked. **The worker never states a person:** who asked for a reprocess is the run's `requestedById`. **A kept mileage stands until the audit log says an end moved** (the collection's end GPS, the disposal's site, the site's GPS; `MileageStanding`). **Flags on no ticket** (a certification's views, a site's permit, a survey's) are checked for every such record in every run. **A flag on a number no field event is under any longer is cleared.** A load bills from the certification its disposal scanned; a haul-out from the one scanned at the loading end. `reconciledAt` is when the worker last changed its conclusions on the field event. No acceptance is read yet (1.8.x), void field events are left out (1.6.3, 1.8.x), and nothing is priced (1.6). *Agent defaults.* [352]
- **Review's and closeout's acceptance scenarios are `spec/acceptance/08-review-and-corrections.md` (65, AC-08-…) and `09-invoice-deliver-closeout.md` (31, AC-09-…)** (drafts for the user; none passing; ADR-362). They restate Parts 8 and 9, `adms-exceptions`, `spec/FLAGS.md` §1 and §4 and `spec/DATA-MODEL.md` §6, and decide nothing. Each row names the Milestone 1.8 task that first proves it; each file lists the earlier files' rows that wait for a reviewer's action or the lock, and its own unsettled points (fourteen and eight; BACKLOG C77). **KD-74 (open, the user's):** whether *correct* carries *accept flags*; the built list of grants keeps them apart. [362]
- **QC, the lock as invoiced, batches and the unlock are built (ADR-367): Milestone 1.8 is done.** `apps/api/src/review/`: `new QcMarks(api, clock).set(person, marked, status, note?)` (`marked`: `{ completedLoadId }`, `{ completedHaulOutId }`, `{ unitRateTicketId }`, `{ certificationId }`, `{ roeId }`, `{ surveyId }`, `{ incidentId }` or `{ dropOffLogId }`; the record's one mark written or changed; grant `QC`); `new InvoiceLocks(api, clock)` has `batch(person, projectId, name)`, `lock(person, ticket, invoiceBatchId?)`, `intoBatch(person, ticket, invoiceBatchId | null)` (grant `LOCK_INVOICED`) and `unlock(person, ticket, note?)` (grant `UNLOCK_INVOICED`). **A QC mark, a lock and a batch answer the record alone and ask for no run** (`ReviewService.mark`); **an unlock answers `{ record, reprocess }`**, `reprocess.trigger` `'REPROCESS'`, naming the ticket. **Only a ticket that is whole, `COMPLETED` and QC Approved locks**; a void ticket isn't locked; a `COMPLETED` ticket that bills nothing is (refusals `ALREADY_LOCKED`, `NOT_WHOLE`, `NOT_COMPLETED`, `NOT_QC_APPROVED`, `NOT_LOCKED`, `NOT_QCD_ALONE`, `BATCH_NAME_BLANK`, `BATCH_NAME_USED`, `BATCH_ON_ANOTHER_PROJECT`; the rules are `packages/domain`'s `InvoiceLocking`, `TicketOnItsOwn`, `BatchName`). **While a ticket is locked as invoiced, every review service refuses a change to its own records** (`LOCKED_AS_INVOICED`: "Ticket 101001 is locked as invoiced: unlock it first. Nothing was changed."): a correction, a renumber out of or into it, a line or carried ticket, a field event's photograph, a void, an acceptance, its QC mark. That is `ReviewService.review`'s default; **a service that corrects a record several tickets share passes `'PASSED_BY'`** (an ROE, its scope, a scale receipt; a certification goes its own way), and each locked ticket is named in `reprocess.lockedAsInvoiced` and waits. The database still holds a locked ticket's lines itself and has no guard on its field events (for the user, BACKLOG C81). **`ProjectSetup.close(person, projectId)`** writes `closedAt`, audited; nothing reads it or is refused over it. **The story `p1-invoiced`** (26 checks) is the model for a QC mark, a lock, a batch and an unlock, for a ticket's locks over its life (`locksOf`), for a batch read by its name (`lockedIn`), for counting what the worker wrote to show a mark changed none of it (`concluded`), and for a story that jumps months ahead. **The audit log lists a `qc_mark` update's fields as `note, set_at, status`** and an unlock's as `unlocked_at, unlocked_by_id, unlock_note`: read them from a run. What it leaves: BACKLOG C81.
- **What the mission leaves out is a story too (ADR-369).** `pnpm scenarios p1-left-out` (`packages/scenarios/src/stories/p1-left-out.ts`, 25 checks; needs the map servers): any arrival order; the split haul-out paid by the CY ($850.85) and the pile whose call isn't higher; a certification made later, revoked, replaced; a tandem's one weight; a load that carries a ticket; a missing rate, a missing tipping fee rule and a TBN rate, each cleared by setup; a new map version and a site's own shape; a load after the window. **The count of scenarios with a passing test is `spec/acceptance/README.md`'s table** (760: 691 whole, 17 in part, 52 later phases). **Open from it (BACKLOG C83):** a field event's `certificationId` isn't found again when its certification is made later (the ticket bills; its contractor user wouldn't see it); ~~what the tower counts on a load of white goods~~ **answered (ADR-370): the tickets.**
- **The golden mission is a story (ADR-368).** `pnpm scenarios golden-mission` (`packages/scenarios/src/stories/golden-mission.ts`, 27 checks): both projects set up through the services, P1's field days as `p1-field-days` records them, P2's split load worked on the harness's phones by Ana and Kim on Monday, every reviewer's step through `apps/api/src/review/`, each followed by its run. **Its expected figures are `spec/golden/MISSION.md`'s and change only at the user's word.** A reason is one of the firm's list and the mission's words are the note (*Photos confirm*, *Duplicate ticket*, *Not eligible work*). P2's `102001` is locked as one with no batch; the batch "Bayline ROW, week of 12 Oct" is P1's thirteen. **A certification's five photographs have no service yet:** the story writes them as Sam's phone would, and every other story leaves `CERTIFICATION_PHOTO_MISSING` on each certification (BACKLOG C82). In the audit log Luis's void is his own record with his words, and the ticket's `COMPLETED` → `VOID` is the worker's, in the run the void asks for (ADR-365). What it leaves: BACKLOG C82.
- **Void, unvoid and accept are built (ADR-365).** ***Accept flags* is a grant of its own; *correct* doesn't carry it (the user, 2026-10-06; KD-74 closed; supersedes ADR-166's "whoever may correct may accept").** `new Voids(api, clock).ticket(person, projectId, { workflow, ticketNumber }, reasonId, note?)` and `.lift(person, projectId, ticket, note?)`; `new Acceptances(api, clock).flag(person, flagId, reasonId, note?)`; each answers `{ record, reprocess }` or a refusal (`NOT_A_TICKET`, `ALREADY_VOID`, `NOT_VOID`, `FLAG_CLEARED`, `ALREADY_ACCEPTED`, `REASON_NOT_OFFERED`, `NOT_PERMITTED`). `reprocess.unvoided` names the tickets a run reads back in. **The worker:** a person's void in force → the field events `VOID`, the lines removed, the flags cleared, the completed record left as it is, the decision "Voided by <person> (<reason>)."; no other ticket's checks read a voided ticket's field events; **a void ticket has no open flag, whoever voided it**; a flag raised now is accepted only where the same flag stands accepted (`Flags.accepted`). **Agent defaults:** an acceptance stays with its flag (a renumber means accepting again); a pending ticket's flag may be accepted; no un-accept; correcting a void ticket's field event brings nothing back; the mission's words are the note beside a picked reason. **An unvoid always leaves a record of its own, `TicketUnvoid` (the user, ADR-366, superseding ADR-365 (5)):** `Voids.lift` answers it (`record.unvoidedById`, `unvoidedAt`, `note`) and marks a person's void lifted as well; the worker reads back a void ticket whose newest unvoid is newer than its last decision without an error (ids compared, the database's own), so any run picks an unvoid up, once; `reprocess` and `RunAsked` carry no `unvoided`. **The user approved ADR-365's other defaults (2026-10-06).**
- **A reviewer's corrections and renumbers are built (task 1.8.3, 2026-10-06)** [364, 051, 028, 022, 156]: `apps/api/src/review/`: `Corrections` (any captured field of a field event but its number; a renumber; an item line; a carried ticket; a photograph's two marks; a scale receipt; an ROE and its scope; a survey, an incident, a drop-off log; a certification's box), `QuarantineReview` (renumber, keeping the phone-made id and its photographs; a second copy, nothing made; resolved once, in the domain's words) and `BackOfficeRecords` (a field event, with the monitor named and a reason offered for that use). **The service reads the grant itself**: an admin every action, a manager/analyst only with its live grant (`CORRECT`; `RENUMBER` for a number, a suffix and a quarantine), nobody else; rules in `packages/domain/src/review.ts`. **A correction and a renumber ask for no reason** and take a note, kept in the audit record. **A renumber is refused only what can't be a number**, and a number held, by the database's own key; never for being a wrong choice. **Each call answers `reprocess`** (project, `CORRECTION`, who asked, the tickets touched, which are locked as invoiced); its caller asks the worker until Phase 2's queue does. **Taken off is a mark** (`archivedAt` on `field_event_item` and `carried_ticket`, as on a photograph and a scope pick): the worker reads only live ones. **Not corrected by these services:** id, project, workflow, kind, the received time, an ROE's number, a form's own answers. **Not decided here:** a correction or renumber under a void (1.8.4), a correction to a locked ticket (1.8.5). Left: BACKLOG C79.
- **People's marks are built at the database (task 1.8.2, 2026-10-06)** [363, 245]: `QcMark`, `InvoiceLock`, `InvoiceBatch`, `FlagAcceptance`, `TicketVoid`, in `packages/db/prisma/schema/marks.prisma`. **Each is its own record, written by the API for a person (`guard_table`, `MARK`), read by the worker, never deleted, and repeats its project**, which holds what it marks to that project; a mark on a field event repeats its kind, held to `UNIT_RATE`. **A QC mark** is on one of eight things (a completed load or haul-out, a unit rate ticket, a certification, an ROE, a survey, an incident, a drop-off log), one for each; a change of status is the same row; no row is QC Review; it stays on its record through a dissolve, and only a person changes one; QC Void on a certification does nothing to its tickets. **An invoice lock**'s unlock is on its own row (who and when together, a note optional); **a ticket has one lock in force** (exclusions `WHERE unlocked_at IS NULL`), locking again is a new row; the two guards on a transaction and the worker ask only about a lock in force. That only QC Approved locks is the service's (1.8.5). **An invoice batch**: a name used once on its project, never blank; a lock names its own project's, now or later while it stands; renamed freely, never archived. **A flag's acceptance**: once for a flag, with a reason; the flag itself is never changed. **A person's void**: project, workflow and number, a reason; the unvoid on its own row; **one void in force for a ticket**, voiding again is a new row; that a reason is offered for its use, and what the worker does with a void, are 1.8.4's. **What a mark is on, who made it and when never change; a lock once unlocked and a void once lifted are history** (`refuse_edit()`); no mark is the system actor's. **Audited:** a QC mark in records; a lock, a batch and a void in billing; an acceptance in operations. **Seen by** a client user and an auditor, every mark; **a contractor user sees its own tickets' locks and the batches that hold one, and no other mark; no viewer an unlock's note.** A test writes them with the helpers in `packages/db/test/marks.test.ts` (`qcLike`, `lockLike`, `acceptanceLike`, `voidLike`, `flagOn101001`). *Agent defaults.* What is left: BACKLOG C78.
- Offline all day; arrival order means nothing; order by field time; load comes in bursts. [030]
- Group by **project + workflow + base number**; type is never used to *find* a pair. [019, 033,
  062]
- **Flag, never block.** Messages are plain facts ("Ticket 101008: debris type mismatch. Flagged
  for review."). The only sync rejection is a duplicate number, quarantined in full. [021, 022,
  052]
- **Statuses:** `PENDING | COMPLETED | MANUAL_REVIEW | VOID`. **Review still bills**. A void stops
  billing; it's made by a person with a reason (a **Void ticket** button) or by a rule's **Void
  ticket** action, which names the rule. [060, 118]
- **QC status, separate:** QC Review → **QC Approved / QC Issues / QC Void**, set by hand. It's the
  back office's own review mark: it never changes the record or re-runs reconciliation. **Only QC
  Approved tickets can be locked as invoiced** (QC Review, Issues and Void all block). **For loads
  and haul-outs only the completed load (`CLT`/`CHO`, a split included) is QC'd and locked; never a
  single event.** Events are flagged and corrected before the merge. Unit rate tickets, incidents, certs and
  forms are QC'd on their own. [107, 117, 121, 168] *Agent default:* QC status, the invoice lock and
  a flag's acceptance are **their own records**, written by the API and keyed to the record they
  mark, so the API never updates a derived row (ARCHITECTURE §5.1) and a reprocess can't lose one. [245]
- **Accepting a flag:** a reviewer **accepts** a flag that's right as it is, with a reason, audited;
  it isn't raised again unless the facts it was about change. All flags fixed or accepted →
  `COMPLETED`. Those who may correct may accept. [166]
- **A rule's void always wins:** an unvoid lasts until the next reprocess; to keep it, correct the
  data or the rule. [167]
- **No ageing:** an unpartnered event never expires, and preloads are normal. Only impossible
  timing is flagged. [053] *Agent default:* a `PENDING` ticket shows the flags of the field event it
  has (a typed number, a certification) so the review queue can act on them; it stays `PENDING`
  until whole. [244]
- Cert validity is judged at **work time**, and a failure flags. [048, 079]
- **Reconciliation's acceptance scenarios are `spec/acceptance/06-reconciliation.md`** (165 today, AC-06-…; approved by the user 2026-10-06, ADR-374). **The flag catalogue is 78 flags today** (it was 66 when these were written: 67 less `REVIEW_ORIGINAL_CERTIFICATION`, ADR-328; then ADR-345, 348, 360). The things ADR-329 keeps and flags have no code or words yet: worded with the user by tasks 1.5.5 and 1.5.7. **`OVERLAPPING_LOADS` is raised on both tickets** (the catalogue, and the user, ADR-342: the ticket the truck dumped under is `MANUAL_REVIEW`, still bills, and can't be locked as invoiced until its flag is fixed or accepted; the phantom stays `PENDING`, flagged, until voided. The same flag covers two loads that both happened on one cert number, a wrong badge scanned. Whether voiding the phantom clears the other's flag is 1.5.5's; KD-71 (1) closed). [339, 342]
- **The derived records are built (ADR-340):** `CompletedLoad` (one per disposal event, for its life: quantity source, capacity, load call, volume, weight and whether it is a share, carried count, `dissolvedAt`), `CompletedLoadCollection` (a row for each collection: suffix, share, volume, weight, mileage with its source, road point and map data), `CompletedHaulOut` and `CompletedHaulOutCollection` (the same, with `pileLoadCall`), `Flag` (`FlagCode`, the catalogue's 66 codes held to `spec/FLAGS.md` by a test; message; facts with their SHA-256; `FlagBilling`; the # and pay item of a line; raised and cleared), `ReconciliationRun` and `ReconciliationDecision` (one for a ticket in a run); on a field event the worker's `zoneId`, `mapVersionId`, `workedOutPayItemId`. **Only the worker's login writes them** (the API reads; nobody deletes); on a field event the worker writes those three, the status and the run time, and nothing captured. **A load can't be concluded twice:** one completed record per disposal, dissolved or not; a collection a live row of one; a ticket number one live completed load's and one live completed haul-out's per project; a suffix once among a record's live rows. **The live rules are exclusion constraints `WHERE dissolved_at IS NULL`**, never partial unique indexes (Prisma would drop those in its next migration). **Whatever a derived record or a worker's column names is its own project's**; a zone is one of the map version used. *Agent defaults:* a collection row's own `id` and repeated `projectId`; `mileageSource` only with a mileage; the kind of field event a completed record names is the grouping's to keep, not the database's; no check ties the quantity columns to `quantitySource`; a client user and an auditor see the completed records, their rows and the flags, **no viewer a run or its decisions**; audit domains `BILLING` (completed records and rows) and `OPERATIONS` (flag, run, decision). **Not decided here:** how the worker finds the tickets to work (no queue record exists; 1.5.9), and who points a field event at a certification made later (not the worker: it can't write `certification_id`; 1.5.5). `Transaction` and `InvoiceLock` are unchanged until 1.7.1 and 1.8.2. Tests: `packages/db/test/derived-records.test.ts`. [340]
- **Mileage is built (ADR-349, 350):** `packages/domain/src/mileage.ts`: `new Mileage({ from, to }, mapData)` (the collection's end GPS, the site's own GPS; the extract's date and SHA-256) gives `.byRoad(roadPoint, routeMiles)` and `.straightLine(roadPoint | null)`, each a `MileageMeasured` (`miles` as text at four places, `source`, `ends`, `snapped`, `snappedAddress`, `mapData`); `Mileage.noRoadRoute(flags, subject, collectionEventId, measured)` is the `NO_ROAD_ROUTE` flag, or none. **The asking is the worker's** (`apps/worker/src/mileage/`, its first code): `new MapServers({ routing, addresses, caFile, mapDataSha256, timeoutMs })` has `nearestRoad`, `shortestRouteMiles`, `addressOf` and `mapData`; `new Mileages(servers).between(ends, standing?)` is the step for one collection: `standing` is the row's mileage, handed in only while neither end has been corrected since, and then no server is asked. **The route is asked by distance as a car drives it, never the server's plain `shortest`, so it crosses no private road and no farm track (the user, ADR-350).** **Nothing keeps a mileage's two ends** (ADR-350): they are the collection's end GPS and the site's GPS on the records. **A map server that doesn't answer throws; only "no road" and "no path" are the straight line.** The tests (`packages/domain/test/mileage.test.ts`; `apps/worker/test/mileages.test.ts`, which needs `pnpm local:up`) use **the example world's stand-in points on the pinned extract** (`spec/CONVENTIONS.md` §6: Marsh Road TDSR 39.09000000, −75.62000000; 14 Heron St 39.13850000, −75.55370000, 6.2050 road miles away); **every fixture stands on those points since task 1.5.8a (ADR-351)**, and the made-up points round 27.98° N, 82.40° W are retired. **Mileage is shown with the transactions** (the user, ADR-350 (4)): each exported line of a load or a haul-out shows its mileage and how it was measured; a transaction stores no second copy and reads it from its property's or pile's collection row (agent default; 1.7.1, Phase 4). **Left:** how the run knows an end moved (1.5.9). REQ-126f waits for the run.
- **The checks on quantity, the pay item's settings, unit rate work and forms are built (ADR-347):** `QuantityChecks` (`quantity-checks.ts`): the load call that is the ticket's (a load's disposal's; a haul-out's loading-end call, the last pile's on a split, read once the ticket is whole) against 0% and the project's limits; `PILE_CALL_NOT_HIGHER`; a scale receipt handed with every disposal that points at it: unusable (a net below nought, or no net and only one of gross and tare; **a receipt with no weight at all is a lineage token, not flagged**), two debris types (its weight unused, no share said), one weight shared (each ticket at its share); a carried ticket not found, or on another load (**both loads flagged**). `UnitRateChecks` (`unit-rate-checks.ts`): **the worker's own pay item**, from the live pay items of the payable type picked, by `SizeBands.payItemFor`; `NO_SIZE_BAND`, `OUTSIDE_SIZE_BAND`; several pay items and nothing measured is "no measurement"; the settings of the worked-out pay item (measurement, GPS at the end fix, at least one photograph not removed, whole counts); `MARKED_INELIGIBLE` wherever the record says so; ***Count is always 1* raises nothing** (it makes the count 1 at pricing, 1.6.3); the stump checks on the key `STUMPS` (under 24 in, FEMA's fixed test; **`301005` carries `STUMP_UNDER_24` alone**; root ball not wider, by the project's switch; root ball missing; no survey); crew time (a kind of work counted in items by hours): each item's hours over the crew's project day against a limit handed in, **the policy value `CREW_DAY_HOURS`**, flagged on the ticket that takes it over and each later one that day; overlapping crew-time tickets flagged on each. `RoeChecks` (`roe-checks.ts`): missing, not on the project, unsigned, out of scope, only where the program type requires ROEs, on a collection and a unit rate event; **a ticket's ROE flag puts it in review like any other, and it still bills**; a survey's ROE flags and `NO_PRE_WORK_SURVEY` sit on the survey. Left for 1.6.3: `QUANTITY_MISSING_FOR_PAY_ITEM`, `FILL_WITHOUT_EXPOSED_ROOT_BALL`. **Approved by the user and built (ADR-348):** `SCALE_NET_DISAGREES`, a receipt with a gross, a tare and a net whose net isn't the gross less the tare (pounds to the pound, tons to the hundredth; kept as typed, still bills from the net as written), and `TWO_QUANTITIES`, a load's disposal with a load call and a usable scale weight (still bills; the pay item says which; never compared); **the catalogue is 77 flags** (`spec/FLAGS.md` §3.10; seventy migrations). *Agent defaults but for those two flags' words.* [347, 348]
- **The checks on place are built (ADR-346):** `packages/domain/src/geodesic.ts` is the one home of distance (`new Distance(from, to).meters()`, `.isWithin(m)`: the WGS84 geodesic by Karney's algorithm, `geographiclib-geodesic` 2.2.0, MIT; a point on the circle is inside); `ShapeArea` in `map-shapes.ts` says whether a point is in a shape (an edge inside, a hole outside); `place.ts`'s `PlaceChecks.of(ticket)` judges a collection and a unit rate event against the boundary then the zones and answers the zone and map version to attach, a disposal and both haul-out ends against their own site's shape or the project's circle, a disposal (a haul-out's too) against the site's dates, a load's disposal against *Takes loads* and *Ineligible site*, a haul-out's collections against *Haul-outs leave here* (once for each site) and its disposal against the TDSR key; `SiteChecks.permit(site)` is the site's own flag. **Agent defaults:** no map, nothing raised and no zone; a map with no zones never says "not inside any zone"; outside the boundary is one flag and no zone; a point in two zones is in the first the version names; a haul-out's collection takes no zone; a field event with no fix or no site is not placed and nothing is raised for it here; a site is open on its activation and close dates themselves, and a haul-out's collection isn't judged by them; a haul-out dumped at a site not marked *Takes loads* or at an ineligible one isn't flagged (the catalogue says "a load"); a flag judged against a site's shape keeps the shape's version, one judged against the circle the site's GPS and the metres. `TIPPING_FEE_RULE_MISSING` is 1.6.3's. [346]
- **The flag catalogue and the first checks are built (ADR-344):** `packages/domain/src/flags.ts`: `flagCodes` (75 since ADR-345, the page's order), `flagBillings`, and `new Flags(timeZone).raise(code, subject, told, facts[, fieldEventId])`, which gives a `FlagRaised` (code, subject, field event, message, billing, facts, `factsSha256`). **A new check raises a flag only through it**, saying what the message is *told* (names, times) apart from the *facts* kept (ids, numbers, days, ISO instants): a renamed site changes no flag. **A flag is the same flag when its code, field event and facts' hash are** (`Flags.compared(standing, now)` → kept, cleared, raised). `packages/scenarios/test/flag-catalogue.test.ts` raises each flag with the page's example and compares it with `spec/FLAGS.md`: **a new flag is a row on the page, a code in `flagCodes` and `FlagCode` (a migration), an entry in `flags.ts` and an example in that test.** `checks.ts`: `new TicketChecks({ timeZone, activeFrom, activeTo, certifications, deviceClockOffLimitMinutes }).of(ticket, { otherLoads, carried })` raises §3.1, §3.2 and §3.3's time rows; `new CertificationChecks(timeZone).views(certNumber, photographs)` the certification's missing views. `ProjectClock` (`project-clock.ts`) answers every day, date and time in the project's time zone. *Agent defaults:* **the work time is the field event's end**; a tag is good through its expiry date; replaced means after the new certification's certified instant; certification flags are per field event; `NO_CERTIFICATION` not on the end that didn't take the quantity when the other end found its certification; `OVERLAPPING_LOADS` reads only loads that aren't void (voiding the phantom clears the other's flag), loads only; `SPLIT_SUFFIX_GAP` once the ticket is whole; the window never judged on a disposal; no time-zone check on a back-office record; a removed photograph is no view; **`DEVICE_CLOCK_OFF`'s threshold is handed in and its policy value waits for Phase 2's sync record**; nothing flags a suffixed collection on a project without split loads, a control ticket outside its ranges, or a field event whose project isn't its assignment's. **§3.10, a record that should not have been possible (ADR-345, the user's "Yes to all" and "make them flag"):** `DETAIL_MISSING` (no debris type; a haul-out collection with no load call; a unit rate event with no kind of work; a load's disposal with no load call, no scale receipt and no count), `TYPED_NUMBER_NO_REASON`, `WRONG_KIND_OF_BADGE`, `GPS_UNREADABLE`, `NOT_A_TICKET_NUMBER` (`TicketChecks.notATicketNumber(event)`; not billed; in no ticket), `ENDED_BEFORE_STARTED`, and the backup catches `SPLIT_NOT_ALLOWED`, `OUTSIDE_CONTROL_RANGES` (only where ranges were entered for the series), `ASSIGNMENT_ON_ANOTHER_PROJECT`. **Whatever a record must have is counted from what is on it now (the user, ADR-345): a photograph the back office removed counts for nothing**, towards a certification's five views (built), the photographs a pay item requires (1.5.7) or any required count; removing one or putting it back reprocesses its ticket or certification (1.8.3). [344, 345]
- **Quantities are built (ADR-343):** `packages/domain/src/quantities.ts`, plain classes over exact decimals (no floating point; figures are text at their column's scale). `new LoadQuantities({ capacityCy, loadCall, weightTons, weightIsShare, collections, carried }).work()` and `new HaulOutQuantities({ capacityCy, piles, weightTons, weightIsShare }).work()` give the completed record's figures and a row for each property or pile; `new ScaleWeight(receipt).net()` reads a receipt (net tons as written, else net pounds, else gross less tare; **usable only above nought**) and `.sharedBy(containers)` splits one weight by certified capacity, each marked a share; `new StumpQuantities(diameter, rootBall).stumpCy()` and `.fillCy(projectFillDepth)`; `new CarriedTickets(found).quantities()`; `quantityFor(payItem, figures)`. **Shares are rounded a half up and what is left goes to the largest, the last of equals** *(agent default)*. **Which figure bills is the paying pay item's to say** (its Unit of Measure, its *quantity from the tickets it carries*), for a load call beside a weight and beside a count alike *(agent default)*; `quantitySource` only describes what the tower took. Where shares can't be worked out (an estimate missing, a pile's call missing or not higher) the whole keeps its figures and no property or pile gets one *(agent default)*. It raises no flag and compares no two quantities. [343]
- **Grouping and status are built (ADR-341):** `packages/domain/src/tickets.ts`. `new Tickets(fieldEvents)` gathers them into `tickets` on **project, workflow and the number as recorded** (the suffix is its own column), in the same order whatever order they came in, and lists `pending` (each missing a field event). A `Ticket` has its `events` in field order (a disposal's start, any other's end), `collections`, `disposal` or `unitRate`, `missing`, `isWhole`, `isSplit`, `splitShape` (the suffixes present, each skipped, a bare collection beside suffixed ones: read here, flagged by 1.5.5), `timeOf(suffix)` (that collection's end, ADR-161) and **`status(raisedFlags)`**: `PENDING` while a field event is missing, whatever its flags; whole, `MANUAL_REVIEW` while any raised flag isn't accepted, else `COMPLETED`. The worker's statuses are a closed set of three (`workerStatuses`); `VOID` is never its. *Agent defaults:* whole is at least one collection and the disposal (a unit rate ticket its one field event); a second field event of one kind on a ticket is an error thrown, never a pick (the worker's errored-ticket path); suffixes run A…Z, AA…; **a field event whose ticket number isn't digits is in no ticket** (`notTicketNumbers`), pairing with nothing, a unit rate event included, and its flag, status and billing are 1.5.5's with the user; what a flag does to the money is never read for the status; nothing in the module takes a clock or a received time. Tests: `packages/domain/test/tickets.test.ts` (24). [341]
- **GPS checks:** a disposal's end GPS against its site (kept); the **5 km collection route check is
  dropped** (collections cover long distances); the project **boundary** check replaces it. The
  pair's "zones differ" and the split's "same zone" checks are **dropped**: a load's zone is its
  collection's. [135, 136, 141]
- **Where it went:** a load dumped at a site not marked Takes loads, or a haul-out leaving one not
  marked Haul-outs leave here, is flagged; a load at an ineligible site is flagged and bills; a load at a
  site that charges a tipping fee with no line for the site's tipping fee pay item is flagged as a missing rule ("Ticket
  101011: dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this project
  gives it one. Flagged for review.", ADR-222); a line whose pay item needs a quantity the load
  doesn't have is flagged ("Ticket 101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight.",
  ADR-223). The system checks where debris went, never
  where it was headed. [205, 215] **Stump checks** (on by default,
  per project): root ball not wider than the stump; fill paid with the root ball not half exposed.
  [203]
- **Corrections:** a permitted user may fix **any captured field** in place (audited), including
  renumbering. Void is for work that never happened (never renumber a phantom), and unvoid is an
  audited override. Any ticket, **completed ones included**, is then reprocessed; the engine
  updates its existing reconciled record. Reconciled records are system-only. [028, 039, 051,
  086]

### Pricing and the ledger — `adms-ledger-audit`
- **`Transaction` is built in full (task 1.7.1, 2026-10-06)** [358]: a line is on **exactly one kind of ticket**: a completed load with the property it prices (`completedLoadCollectionId`; an ordinary load's one row), a completed haul-out with the pile it prices, or a unit rate ticket's field event. It holds its project, # (`slot`, once per property, pile or unit rate ticket, 1 or more), rule, pay item, contract, prime, operating sub, the pay item's unit as it was, quantity, rate, amount and run; **the database holds each thing it names to the line's own project**, the prime to one of the project's primes and the operating sub to a contractor placed under that prime. It does not hold a rule to its contract or a contract to its prime (setup may change either; the lines are regenerated). **The operating sub is the sub of the lowest tier the certification names** (AC-03-12), from the certification that gives the prime: `packages/domain`'s `TicketRead.operatingSubId`. A line keeps no mileage (ADR-350). **`InvoiceLock` names a completed load, a completed haul-out or a unit rate ticket's field event, exactly one; a locked ticket gives up no line (the delete's guard) and takes none (an insert guard, C17).** Its unlock and batch are 1.8.2's. **A contractor user sees its own contractor's lines** in its projects, as the prime (its subs' work among them) or as the sub that did the work; the tickets themselves since task 1.7.3 (ADR-361), which also took a line's rate and amount out of `viewer_transaction` into `viewer_transaction_money` (a sub's contractor user reads neither). Only the worker's login writes or removes a line; nobody updates one. **The worker writes none yet (1.7.2).** *Agent defaults; the user answered the sub's money on 2026-10-06 (ADR-361): none.*
- **The worker prices (task 1.7.2, 2026-10-06)** [359]: `apps/worker`'s `TicketWork` reads each piece of a ticket with `TicketReadings` (from the ticket and what the run just attached), hands `TicketPricing` the checks' flags, and answers the lines, the pricing flags and the rules whose *Void ticket* ran; `TicketWrite` writes them in the ticket's one `db.$write`, with its completed record, flags, status and decision (the decision's summary holds `lines`, `linesKept`, `linesRemoved`, `linesWritten`, `voidedBy`). **Only what differs is written:** a line that stands exactly as the rules give it now is left, the same record; one that differs in anything is removed and written again, never updated; one the rules no longer give is removed; the database copies each removed row whole to the audit log first. A ticket that is pending again, voided, or under a "not billed" flag has no lines. **A ticket locked as invoiced is left exactly as it is**, its decision saying so. **A rate or a rule change is a run with `trigger: 'SETUP_CHANGE'`**: it works the whole project and changes only the tickets the change touches (no list of them is kept; the job queue is Phase 2's). **A void stays until a person unvoids it, whoever voided it** (the user, 2026-10-06) [360, superseding 359 (5)]: a rule's *Void ticket* sets `VOID` on the field events, removes the lines and names the rule in the decision; the ticket is then **out of every later run** (the run reads only field events that aren't void), whatever happens to the rule, until a person unvoids it (task 1.8.4, which must lift a rule's void too; the rule then voids it again if it still passes). **The queue's rule, the user's, for everything of this kind** [360]: only what is active or was changed is worked; a settled ticket drops off the queue until it, or the setup it is priced by, is edited. *Built:* void tickets out of the run; nothing written for a ticket whose conclusions don't differ. *Not built (Phase 2's job queue, C71):* a run still works out every ticket that isn't void; the queue must name the tickets a sync, a correction or a setup change touches. **An errored ticket keeps the lines it had, and its flag says so** [360, closing KD-73]: `NOT_PROCESSED_LINES_STAND`, "…could not be processed. Flagged for review; its lines are as of its last run.", where it has lines; `NOT_PROCESSED`, "…not billed.", where it has none. The catalogue is 78 flags (`spec/FLAGS.md` §3.11). **The rules are read one way:** `packages/db`'s `RuleRows` (`entries()`, `names()`), used by `apps/api`'s `RuleBook` and the worker; `db.$read(work)` is a read-only transaction with no actor. A message names a prime as its contractor's record does ("Summit Debris Services"). What a load's carried tickets come to is handed to pricing only on a load that isn't split. **The stories' shared P1 steps are `packages/scenarios/src/stories/p1-office.ts`** (`p1FieldDaysHeld`, `loadP1Map`, `certifyP1`, `setUpP1Pricing`, `P1Syncs`); the story `p1-priced` is the model for a story that reads the ledger. **AC-07-112's figures are corrected:** 17 lines, $4,879.00 on Tuesday night; 19 lines, $5,400.25 after Wednesday's sync, before any review. *The user, 2026-10-06 ("the rest makes sense as well", ADR-360):* only what differs is written; the prime's name as recorded; the carried figures on an unsplit load only.
- **What the passing rules write is `packages/domain/src/ticket-pricing.ts`** [355]: `new TicketPricing({ timeZone, rules, contracts, primes, payItems, stumpCheckFillNeedsExposure }).of({ ticketNumber, form, primeId, operatingSubId, pieces, dumpedAt, raised })` answers `{ voidedBy, lines, flags }`. A ticket is priced a piece at a time (a load or each property, a haul-out or each pile, a unit rate ticket): every passing rule found, every *Add transaction* in # order, then every *Remove*, then any *Void*; the same answer whatever order the rules are in. **The user, 2026-10-05:** an amount is rounded **to the cent a half up**, and is the quantity as the line keeps it (four decimals) × the rate; **a crew day by exact division keeps four decimals** (10.25 h ÷ 12 = 0.8542); **hours in no step of a crew day paid in steps bill nothing on that line, and the ticket is flagged**. A ticket under a check's flag that says "not billed" gets no lines, accepted or not (`spec/FLAGS.md` §1), though a rule's void still runs; a haul-out dumped at a TDSR skips every rule. The pricing flags (`NO_PRICING_RULE`, `DUPLICATE_TRANSACTION_NUMBER`, `NO_RATE_FOR_PRIME`, `RATE_TO_BE_NEGOTIATED`, `QUANTITY_MISSING_FOR_PAY_ITEM`, `TIPPING_FEE_RULE_MISSING`, `FILL_WITHOUT_EXPOSED_ROOT_BALL`) are raised only where the rules ran, each keeping the # and pay item of its line where it is about one. Agent defaults: two creates of one # stop that # only; a removed fee isn't a missing rule; a pay item with no rate at all is a $0 pay item, not flagged; TBN writes no line; a stump with no root ball gets no fill line and no flag from pricing; a rule naming a pay item the project doesn't have throws. **Nothing writes a transaction yet**: the worker reads none of this until 1.7.2 (BACKLOG C73). KD-72: a TBN ticket is `MANUAL_REVIEW` until its flag is accepted (the catalogue), where the skill says it completes.
- **Which rules may run on a ticket, and which pass, is `packages/domain/src/ticket-rules.ts`** [354]: `TicketReadings` (what the criteria read, one reading for each property or pile; the prime from the certification on the field event that took the quantity), `CriterionCheck` (one line on one reading), `TicketRules` (`mayRunOn`, `passing`). **A line that compares with something the ticket doesn't have never passes, however it is worded; only IS EMPTY does (the user, 2026-10-05).** Mileage is compared through `Mileage.inTenths`, every other number by its exact value; text without regard to capitals (*agent default*). The worker calls it from task 1.6.3.
- **Pricing's acceptance scenarios are `spec/acceptance/07-pricing-ledger-audit.md`** (114, AC-07-01…114; a draft for the user; 83 passing at the domain after task 1.6.3, ADR-355; 35 after 1.6.2). They decide nothing: the rules that may run, each criterion and operator, actions and their order, the quantity by unit, the rate and amount, the pricing flags, what a transaction holds, regeneration and the audit trail, the mission's ledger. **P1's Monday and Tuesday priced before any review is $5,059.00 on 18 lines** (worked from the mission's lines; task 1.7.2's story). Ten restate guards Phase 0 built. White goods follow `spec/RULES.md` §9's rules 5…7. **Eighteen points nothing settles** are in its last table (BACKLOG C72); four could change money and go to the user if no record settles them: how an amount is rounded to the cent; a crew day's decimals and hours in no step; what a criterion does when what it reads is empty; which lines stay under a "not billed" flag. [353]
- **Pay items** (ADR-206 to ADR-233 said "Services", the legacy word; ADR-234): a pay item
  has a **code**, a string the firm types; setup **suggests one from the published convention**
  (`VEG-HAUL-CY-15`, `TIP-FEE-CY-BCL`, `spec/CONVENTIONS.md` §5), never forces it (ADR-235); **a code is
  unique on its project** (the user, 2026-10-02: "The "code" is the number+chars you assign it. This
  must be unique per project."), enforced by the database, archived pay items included. A rate that
  changes from a date is the firm's own setup: a second pay item with a code of its own, whatever
  the firm calls it (the examples use `VEG-HAUL-CY-15-B`), plus *Ticket date* criteria; nothing
  forces a pattern. They appear as options wherever a pay item is picked. *Agent defaults:* an
  archived pay item keeps its code; codes are compared exactly as typed. [109, 206, 235, 301]
- **A pay item's fields** (ADR-207, amended by 301; named per `spec/CONVENTIONS.md` §2): **code**,
  **description** (what the work is, in the firm's own words: "The code should be unique, but the
  decription should be whatever the firm wants to make it"; required, *agent default*; nothing reads
  it; **there is no separate name, and no "line number"**: that phrase was an agent's), **payable type**,
  unit of measure, **size band** (from, to; band and
  flag, ADR-210, ADR-213), "Count is always 1",
  "GPS required", "Measurement required", "Decimals allowed", **"Monitor may mark ineligible"** (ADR-210),
  and **its rates, one per prime** (ADR-206). The **payable type** comes from a firm list (the
  legacy "Service Classifications", kept with its project; seeded from USACE's umbrella debris types,
  ADR-234), is what the monitor's list shows, each
  once, and is the "payable type" of ADR-173 (exported as a type column: leaners and hangers in the
  unit rate export); exports also carry the pay item's description and code. **Every
  pay item, on every form (loads, haul-outs, fees), has a payable type** (ADR-221); on a hauling
  form it stands for a debris type (Q-204 lines 1–4). The legacy **Tickets** screen links each
  pay item to its ticket type. Photos required,
  GPS required and the quantity method (ADR-157, 165, 192) **stay pay item settings**, loads included;
  **whether a load is weighed is set by the pay item's Unit of Measure**, a picked list; there is **no
  "requires weight" box** (ADR-221, ADR-223). **Setup pushes the unit rate pay items and their
  settings to the phones that do that work** (ADR-176, ADR-213); a load's phones get no pay items
  (ADR-223; they get the lookup of ADR-227); reconciliation checks every pay item's settings. **A load carries no
  pay item**: its *Debris type* is the one the monitor picked, and *Pay item* no longer applies to
  loads and haul-outs (the legacy load operands). [157, 158, 165, 173, 175, 176, 181, 206, 207, 210, 213, 221]
- **Rules have no *Load call* criterion and no *Flag* action** (project settings do that). On a
  haul-out, *Disposal site* is the FDS; a criterion for **the TDSR it left** is added. A **naming
  pass** over criteria, codes and export columns comes before the build. [164]
- **A rule's *Debris type* matches only the exact entry the monitor picked, no exceptions** ("Veg"
  is not "Marine based – Veg/Woody"). [226]
- **Setup made easier, model unchanged (ADR-229):** the back office's pay item screen has a "Pays
  when" part; saving it **writes and keeps its own rule**, one per contract whose prime has a rate (ADR-239), marked "from
  pay item HNG-RMV-EA" and edited only there; free-standing rules stay for everything else (delete, void,
  date ranges). A **setup check** lists gaps before the field day, and every change shows **what it
  would change** first. The agent's "pay items" (pay item and rule as one record) is withdrawn. [229]
- **The setup check and the sites' quantity lookup are asked of a service in `apps/api` (task 2.4.1, 2026-10-08, ADR-423):** `new SetupStanding(db)` answers `gaps(projectId)`, `quantityLookup(projectId)` and `quantityLookupAt(siteId)`, reading the project's setup in one read-only piece of work (live primes, contracts, load and haul-out forms, debris types and sites; every pay item and rule) and keeping nothing: each answer is the setup as it stands when asked. Its endpoint is 2.4.2's; the lookup with a phone's lists is 2.6.x and Phase 3. **Setup changes that had no service have one, each queueing the tickets it moves (ADR-420, 423):** `PayItemSetup.change` (the unit, the crew-time conversion, the capture settings; since ADR-425 the code, the description and the band too; never the payable type or the kind of work), `ProjectSetup.changeWindow`, `SiteSetup.shape` (GeoJSON, the next version; `SITE_SHAPE_NOT_READ` when it isn't a shape) and a site's GPS on `SiteSetup.change`. [229, 243, 357, 420, 423]
- **Setup's endpoints, part 1 of 4 (task 2.4.2, 2026-10-08, ADR-424).** Eighteen requests, each defined in `packages/contracts` and open to an admin or a manager/analyst **who holds `SETUP`**: `GET`/`POST /clients`, `GET`/`POST /declaration-events`, `POST /projects`, `PATCH /projects/:projectId/settings`, `PATCH …/active-window`, `POST …/closings`, `POST …/number-series`, `POST …/control-ranges`, `POST /control-ranges/:controlRangeId/archivings`, `POST /projects/:projectId/field-tags`, `GET`/`POST /contractors`, `POST /projects/:projectId/primes`, `POST …/contracts`, `POST /debris-types`, `POST /payable-types`. **Every setup service asks again inside its own piece of work** (`SetupService.setup`; the domain's `SetupRights`), the ones with no endpoint yet too, so a contractor merge takes Setup. **A saved change answers `{ record, warnings, queued? }`.** **A setting the domain refuses: 422 `NOT_SAVED`, with `reason` (the rule's code) and `message` (its words).** **What the database's constraints refuse is answered plainly by the one error filter, for every endpoint** (`process/database-refusal.ts`): unique 409 `ALREADY_HELD`, foreign key 422 `UNKNOWN_RECORD`, a check or exclusion 422 `REFUSED_BY_THE_DATABASE`, a record needed by its id 404 `NOT_FOUND`; the constraint's name is logged, never told; no grant, a refused delete and a stopped statement stay 500. A task that adds an endpoint adds the plain words for the constraints its requests can reach. A contract's signed-copy link is `https` only. **Still to come:** part 3 (sites, the map, the merge with its queueing, the setup check and lookup), part 4 (people). BACKLOG C98.
- **Setup's endpoints, part 2 of 4: forms, pay items, "Pays when" and rules (task 2.4.2, 2026-10-08, ADR-425).** Nine requests more, each taking `SETUP` as part 1's do: `POST /projects/:projectId/forms`, `POST /forms/:formId/debris-types`, `POST /forms/:formId/definitions` (the firm's own fields, the next version); `POST /projects/:projectId/pay-items`, `PATCH /pay-items/:payItemId`, `PUT /pay-items/:payItemId/rates/:primeId`, `PUT /pay-items/:payItemId/pays-when`; `POST /projects/:projectId/rules`, `PUT /rules/:ruleId`. **A rate travels as an exact decimal in a string (`"7.50"`, four places at most), never a number**, and is put, never added: one row a prime. **A rate is said in one answer only: to whoever just set it.** **What may change on a pay item: its code, its description, its Unit of Measure, its size band (asked of `SizeBands`, itself left out), its crew-time conversion and its capture settings; never its payable type or its kind of work.** A change of code or description renames the rules its "Pays when" wrote, in the same piece of work (the name is the domain's `PaysWhen.ruleName`); every change queues the project's tickets not locked as invoiced. **"Pays when" is stated whole**: a form left out is one the pay item no longer pays on, and its rule there is archived. **A rule is stated whole**, new or anew; one that isn't valid is saved and never runs, and the answer says `valid` and `reasons`; a rule nobody has is not found, never written as new (`RuleSetup.change`). A form, a debris type on a form and the firm's own fields queue nothing. The schemas only bound what is read (an operator or a criterion nobody has, a transaction # under 1): which operator a criterion takes and which picks exist stay the domain's and the database's, each of the database's refusals with its own plain words (twenty-two more in `process/database-refusal.ts`). **AC-10-38 on its own case:** a pay item entered with Coastline's rate twice is answered 409 `ALREADY_HELD`, "Not saved: that prime already has a rate on the pay item."; a later rate for Coastline changes the one it has. **No service yet (BACKLOG C99):** archiving a form's debris type, a pay item, a rate or a rule; changing a form; a crew day's steps; reading a project's forms, pay items and rules. [206, 229, 239, 301, 309, 313, 420, 422, 424, 425]
- **Setup's endpoints, part 3 of 4: sites, the map, the merge, the setup check and the lookup (task 2.4.2, 2026-10-08, ADR-426).** Six requests more that take `SETUP`: `POST /projects/:projectId/sites`, `PATCH /sites/:siteId` (its name, short code, type, facts, permit, GPS and **its dates**, the close date emptied with `null`), `POST /sites/:siteId/shapes` (GeoJSON, the next version), `POST /sites/:siteId/tipping-fees`, `POST /projects/:projectId/map-versions` (GeoJSON boundary and zones, the next version) and `POST /contractors/:contractorId/merges` (the path names the second spelling, the body's `intoContractorId` the one kept). **Three reads take no permission and are open to every admin and manager/analyst:** `GET /projects/:projectId/setup-check`, `GET /projects/:projectId/quantity-lookup`, `GET /sites/:siteId/quantity-lookup`; a read-only viewer is refused (2.4.5), and a project or site nobody has is not found. **A merge queues, per project, the tickets not locked as invoiced and not void whose field events carry a certification it moved** (`ContractorSetup` is made with `(db, clock, policy)`); the worker then writes the contractor kept on their lines. A map or a shape `MapShapes` can't read is `NOT_SAVED` with the reason `MAP_NOT_READ` or `SITE_SHAPE_NOT_READ`; a shapefile is not read yet (2.6.4, C100). A site's GPS travels as a string of exact decimals. An answer says the version saved, never the shapes. Nine more of the database's refusals have plain words (a site closing before it is activated among them). Not built, no service: a site's label, archiving a site or a link, reading sites or maps (BACKLOG C100).
- **Setup's endpoints, part 4 of 4: the firm's people (task 2.4.2, 2026-10-08, ADR-427). Task 2.4.2 is done.** Four requests more on `People`: **`GET /people`** (an admin or a manager/analyst; those in service, or `archived=true`; one `role`; in the order added; `limit` 50 unless said, 200 at most; `next` is the `after` of the page that follows; a monitor's phone number in an admin's answer only; never the system actor), **`PATCH /people/:userId`** (an admin; only what is stated: name, phone (null clears it), email (changed, never cleared), and on a read-only viewer the kind, the contractor and `seesPrivateCitizens`; nothing written where nothing differs; `EMAIL_HELD`, `NOT_A_VIEWER`, `UNKNOWN_CONTRACTOR`; an archived person is not found), **`PUT /people/:userId/role`** (an admin; **between admin and manager/analyst only**, else 422 `NOT_BACK_OFFICE`: a monitor who joins the back office is created there; the only admin stays one, 409 `LAST_ADMIN`; the next request is asked as the new role; what a manager/analyst was granted stays beside them and is theirs again if made one again) and **`POST /people/:userId/unarchivings`** (an admin; the person they were, with what they held and no session; `EMAIL_HELD` while somebody in service signs in with their address; one in service is not found). **Where a sign-in address changes, the old one is told if the firm has mail, never the new one** (ASVS 5.0 6.3.7). **The database's last-admin guard answering in a race is now 409 `LAST_ADMIN`** on an archive and a change of role, not an internal error. People's endpoints stay an admin's alone but for the two reads. Tests: `apps/api/test/people-changes.test.ts`, `packages/domain/test/people.test.ts`. What it leaves: BACKLOG C101. *Agent defaults.*
- **Dispatch and phones, part 1 of 2: the firm's phones and its master passcode (task 2.4.3, 2026-10-08, ADR-428).** **Dispatch takes the permission `DISPATCH`**: an admin, or a manager/analyst who holds it now, asked at the door and again in the service (`DispatchRights`). **`GET /phones`** (any admin or manager/analyst; in service, or `outOfService=true`; in the order enrolled; `after`, `limit`, `next`): each phone's name, status, times, the version of the master passcode's check it holds and whether that is the current one; never its key. **`POST /phones/:deviceId/removals`** (`LOST` or `RETIRED`, an optional note kept as the audit reason): out of service **from the server's time at that moment**, once (`NOT_SAVED`, reason `ALREADY_OUT_OF_SERVICE`); it queues nothing and refuses the phone nothing (ADR-134). **`POST /master-passcode/versions`** (an admin's alone): the admin gives their own password again (ASVS 5.0 7.5.1; a wrong one is a wrong try, `PASSWORD_WRONG`); the passcode is 8 to 128 characters and never one known from breaches (`MasterPasscodeRules`), nor the one in force (`PASSWORD_UNCHANGED`); a new version is kept as an unkeyed Argon2id hash, no earlier one touched; every admin is told by mail where there is any (ASVS 6.3.7); a phone's check moves at its next sync (2.5.x). Services: `apps/api/src/dispatch/` (`Phones`, `MasterPasscode`). Tests: `apps/api/test/phones.test.ts`, `packages/domain/test/phones.test.ts`. Part 2 is the next entry. *Agent defaults.* [428]
- **Dispatch, part 2 of 2: a day's assignments (task 2.4.3, 2026-10-08, ADR-429).** Service: `apps/api/src/dispatch/assignments.ts` (`Assignments`; it and `Phones` extend `DispatchService`); rules: the domain's `AssignmentRules`. **`POST /projects/:projectId/assignments`** (takes `DISPATCH`): a person, a day, their work (`fieldEventKinds`, `certifying`, `formDocumentTypes`, the four of ADR-308), `siteId` or null, `deviceId` or null, `payItemIds` (unit rate pay items, each once, written with the pay item's own kind of work); `PLANNED`, `madeBy` the caller. **For a monitor, an admin or a manager/analyst in service; never a read-only viewer, the system actor or somebody archived** (`PERSON_NOT_ASSIGNABLE`, `PERSON_ARCHIVED`); **never on a phone out of service** (`PHONE_OUT_OF_SERVICE`); a hauling pay item is `NOT_A_UNIT_RATE_PAY_ITEM`; a site or a pay item of another project is the database's refusal, 422 `UNKNOWN_RECORD` in plain words. **`PATCH /assignments/:assignmentId`**: only what is stated of the work, site, phone and pay items (a list whole; a pay item taken off is archived and put back as the same row); **person, day and project never change**. **`POST /assignments/:assignmentId/withdrawals`**: archived from the server's time, once (`ALREADY_WITHDRAWN`). **An assignment is changed or withdrawn at any time while it stands**, audited; it queues nothing (the worker reads only its project). **One made on a phone (unplanned) is the phone's:** on the board, never changed or withdrawn there (`MADE_ON_A_PHONE`). **`GET /projects/:projectId/assignments?workDate=`** (any admin or manager/analyst): the day's board, standing or `withdrawn=true`, paged (`after`, `limit`, `next`). Nothing stops or warns of a second assignment (AC-02-29). **No story writes a planned assignment by hand** (`stories/board.ts`). Tests: `apps/api/test/assignments.test.ts`, `packages/domain/test/assignments.test.ts`. *Agent defaults.* [429]
- **Review's marks behind their requests (task 2.4.4, part 1 of 4, 2026-10-08, ADR-430).** Task 2.4.4 is in four parts: marks (done), corrections to a ticket's records, corrections to ROEs and forms with quarantine and back-office records, certifications. One controller, `apps/api/src/review/review-marks.controller.ts`, over the unchanged services `Voids`, `Acceptances`, `QcMarks`, `InvoiceLocks`. **Each request is open to an admin and to a manager/analyst who holds its own permission now, asked at the door and again in the service:** `POST /projects/:projectId/ticket-voids` and `…/ticket-unvoids` (`VOID`; body `workflow`, `ticketNumber`, a void's `reasonId`, `note`), `POST /flags/:flagId/acceptances` (`ACCEPT_FLAG`; `reasonId`, `note`), `PUT /qc-marks` (`QC`; `record` is exactly one of `completedLoadId`, `completedHaulOutId`, `unitRateTicketId`, `certificationId`, `roeId`, `surveyId`, `incidentId`, `dropOffLogId`; `status`, `note`), `POST /projects/:projectId/invoice-batches` (`LOCK_INVOICED`; `name`), `POST /invoice-locks` (`LOCK_INVOICED`; `ticket`, one of the first three ids, and `invoiceBatchId` or none), `PUT /invoice-locks/batch` (`LOCK_INVOICED`; `ticket`, `invoiceBatchId` or null), `POST /invoice-unlocks` (`UNLOCK_INVOICED`; `ticket`, `note`). **Answer:** the mark (`packages/contracts/src/review-answers.ts`), `warnings`, and `queued` where a run was queued (a void, an unvoid, an acceptance, an unlock; ADR-422). **Refusals:** the domain's rule as 422 `NOT_SAVED` with `reason` (`NOT_A_TICKET`, `ALREADY_VOID`, `NOT_VOID`, `REASON_NOT_OFFERED`, `FLAG_CLEARED`, `ALREADY_ACCEPTED`, `NOT_QCD_ALONE`, `LOCKED_AS_INVOICED`, `NOT_COMPLETED`, `NOT_QC_APPROVED`, `ALREADY_LOCKED`, `NOT_LOCKED`, `BATCH_NAME_USED`…) and its words; the service's own `NOT_PERMITTED` as 403 `NOT_ALLOWED` with no words; an id nobody has as 404. A note is 1 to 500 characters, kept on the mark and in the audit log, never logged. **An API test can't make a flag, a status or a completed load** (the worker's): accepting, locking, batching and unlocking a completed ticket are proven at the services by `p1-reviewed`, `p1-voided`, `p1-invoiced`, and through the endpoints by 2.7.1 (BACKLOG C104). AC-10-28 passes; AC-02-12 and AC-09-18 on the real calls.
- **Corrections to a ticket's own records behind their requests (task 2.4.4, part 2 of 4, 2026-10-08, ADR-431).** One controller, `apps/api/src/review/corrections.controller.ts`, over the unchanged `Corrections`: `PATCH /field-events/:fieldEventId` (the captured details: only what `changes` states, `null` empties), `PUT …/item-lines/:itemNameId` (a quantity, or `TAKEN_OFF`), `PUT …/carried-tickets`, `PATCH /photographs/:photoId` (`marks`: removed, label) and `PATCH /scale-receipts/:scaleReceiptId` take *correct*; `PUT /field-events/:fieldEventId/number` takes *renumber*; each asked at the door and again in the service, each queueing the tickets it moves. A schema says only what a value can be at all (a load call 0 to 100, a blank isn't a label), never whether a correction is right (ADR-051); which kind of field event records which detail is the database's check, told plainly (fifteen constraints' words). The answer is the record as recorded and corrected (`review-answers.ts`), never a status, a zone or where a photograph's file is kept. **A request its schema refuses is told which field, for every endpoint (AC-10-37):** 400 `BAD_REQUEST` with a `message` from the contracts' `notTaken` ("Not taken: changes.loadCall in the body can’t be more than 100."), three refusals at most; a field is named only where the schema names it, and nothing a caller sent is said back. Tests: `apps/api/test/corrections.test.ts`; the helpers a reviewer's test starts from are `apps/api/test/support/review.ts`. Still to come: part 4 (certifications).
- **An ROE and the forms corrected, a quarantined record resolved, a field event created in the back office, behind their requests (task 2.4.4, part 3 of 4, 2026-10-08, ADR-432).** One controller, `apps/api/src/review/review-records.controller.ts`, over `Corrections`, `QuarantineReview` and `BackOfficeRecords`: `PATCH /roes/:roeId` (parcel, address, owner, signed and when, notes), `PUT /roes/:roeId/scope` (a pick put in scope or out of it, with how many), `PATCH /surveys/:surveyId`, `PATCH /incidents/:incidentId`, `PATCH /drop-off-logs/:dropOffLogId` and `POST /projects/:projectId/field-events` (a field event entered whole, with the monitor whose work it was and a reason picked) take *correct*; `POST /quarantined-records/:quarantinedRecordId/renumberings` (`to`: a ticket number and a split's suffix, or an ROE number) and `…/second-copies` take *renumber*; each asked at the door and again in the service. **No request corrects an ROE's number or the answers to a form's own fields, and none creates an ROE, a survey, an incident or a drop-off log: no service does yet (BACKLOG C79, C106).** A quarantined field event given an ROE number (or the other way) is the domain's `NOT_THIS_KIND_OF_NUMBER`; a pick a scope never had can't be taken off (404); **a fix typed for a record created in the back office that can't be one is refused (`GPS_UNREADABLE`), never kept unreadable as a phone's is.** What a phone alone would have said (the phone, the assignment, a typed number, a truck keyed in by hand) is never entered. The answer is the record as it stands: never a form's own answers, and never what the phone sent to quarantine. Seventeen more of the database's refusals have their own words. Tests: `apps/api/test/review-records.test.ts` (a quarantined record is made there by `Intake`, on the test's own piece of work).
- **A certification's changes behind their requests (task 2.4.4, part 4 of 4, 2026-10-08, ADR-433): task 2.4.4 is done.** One controller, `apps/api/src/certification/certifications.controller.ts`: `PATCH /certifications/:certificationId/boxes/:position` (a measuring mistake: `changes` in whole inches of 1 or more and the reviewer's note; box 0 is the primary; takes `CORRECT`; over `Corrections.certification`, which now takes the note and says what it queued), `PUT /certifications/:certificationId/signatures-on-file` (`{ onFile }`; takes `QC`; queues nothing) and `POST /certifications/:certificationId/revocations` (`{ from, reason }`; **an admin's alone: no permission opens it**, AC-03-55; queues every ticket on the number). **`Certifications` stands on `ReviewService` and asks inside its own piece of work:** `signaturesOnFile` asks *QC*, `revoke` the domain's `CertificationChanges.revoker`. **Nobody sends a capacity**; a box the certification doesn't have is `NO_SUCH_BOX`; a measurement the box's shape doesn't hold is the database's refusal in plain words. The answer is the certification as it stands, never the driver's phone or licence number. **No request makes a certification or replaces one: a phone does, and its sync brings it (2.6.2).** Tests: `apps/api/test/certifications.test.ts` (8). What it leaves: BACKLOG C107.
- **The read-only viewer's path (task 2.4.5, part 1 of 2, 2026-10-08, ADR-434).** **Every read for a read-only viewer goes through one place, `ViewerDatabase.$viewed(viewerId, work)` (`packages/db/src/viewer.ts`):** one database transaction as `adms_readonly`, made read-only, that states `adms.viewer_id` before it reads; the setting ends with it. The login's client is kept inside and offers nothing else, so no read is made as that login with no viewer stated. **The viewer stated is the signed-in person's own id; `apps/api` never filters a viewer's rows by project or contractor itself**: what comes back is what the database shows that viewer now (ADR-315, 361). The API opens it from `READONLY_DATABASE_URL` (`openApiViewerDatabase`; the pool is `DATABASE_POOL_CONNECTIONS`). **A viewer's reads are endpoints of their own under `/viewer/…`, each a GET open to `viewerOnly` (a read-only viewer and nobody else)**, served by `apps/api/src/viewer/` (`ViewerReads`). The first: `GET /viewer/projects` (id, name, time zone, when closed; paged 50, 200 at most). **A viewer may send nothing that isn't a GET but their own password and authenticator** (AC-10-31; the exact list is `viewer-reads.test.ts`'s). **A test of the API can't show which rows a viewer is shown** (the read-only login sees nothing uncommitted; the process is handed `ViewedWithin`, which keeps who was stated): that is the database's tests and, for the API, part 2's story. **Part 2 (not built):** a project's tickets and one ticket with its lines, money from `viewer_transaction_money`, an ROE's owner by the viewer's setting, the story as five callers (AC-10-29; REQ-201). What it leaves: BACKLOG C108. *Agent defaults.* [434]
- **A viewer's tickets, the money and an ROE's owner (task 2.4.5, part 2 of 2, 2026-10-08, ADR-435): task 2.4.5 and Milestone 2.4 are done.** Three reads more on `ViewerReads`, each a GET open to `viewerOnly`: `GET /viewer/projects/:projectId/tickets?workflow=` (one workflow's tickets a page at a time, by number as text; each row its field events' `statuses` and how many it has), `GET /viewer/projects/:projectId/tickets/:workflow/:ticketNumber` (one ticket: its field events by field time, the completed record that stands with a row for each property or pile, and its lines) and `GET /viewer/projects/:projectId/roes` (number, signed, signed date, owner). **A ticket is asked for by its project, workflow and bare number (there is no ticket id); one the viewer isn't shown is 404 `NOT_FOUND`, exactly as one nobody has** (AC-10-29). **What the database doesn't show a viewer is `null`:** a line's rate and amount for a sub's contractor user, who recorded a field event for any contractor user, an ROE's owner for a viewer not let see private citizens, a contractor's name the viewer isn't shown (a sub reads its own name on its line, not its prime's). **The owner's views (`viewer_transaction_money`, `viewer_roe_citizen`, the three names of setup, `viewer_field_event_monitor`) are declared in `packages/db/prisma/schema/viewer.prisma`** under Prisma's `views` preview feature: read typed, never by hand-written SQL, never made or changed by Prisma Migrate (`migrate diff` stays empty). Exact numbers travel as decimal text. **Proven by the story `p1-viewed` on its own database, as the read-only login** (`StoryContext.viewed`): the client user, an auditor, Coastline's, Rivera's and Summit's contractor users, nobody, an admin and a viewer given no project. The owner's views are refused to the API's own login, so no API test reads one ticket whole. Left for Phase 4: flags, photographs, receipts, certifications, forms, setup and exports for a viewer (BACKLOG C109).
- **The setup check and the sites' quantity lookup are built at the domain (task 1.6.4, 2026-10-05):** `new SetupCheck(setup).gaps()` lists, never refuses: a tipping fee site with no live fee pay item linked; a debris type on a load or haul-out form no running rule of that form can pay (a fee pays no debris type; once per form, not per prime); a pay item a rule adds on a prime's contract holding other primes' rates and none for that prime (a $0 pay item and a TBN one aren't listed); bands that overlap or leave a stretch between them; a crew day's steps that leave hours between them, or none at all; every active rule that isn't valid, with each reason. **A rule that names an archived form, contract or pay item is not valid and never runs** (`RuleEntry`'s `formArchived`, `contract.archived`, an action's `payItem.archived`; `spec/RULES.md` §7). `new QuantityLookup(setup).asks({ siteId, form, debrisTypeId, primeId })`: from the running rules of the truck's prime that could meet a ticket dumped there (debris type, disposal site, site type, contractor; anything else left open), tipping fee pay items left out: a load → a count where every paying pay item is paid from the tickets it carries, the scale weight where every one is per ton or pound, else the load call; a haul-out's disposal → the scale weight where every one is per ton or pound, else nothing more. Who runs them and where they show are Phases 2…4 (BACKLOG C74). *Agent defaults.* [357]
- **The back office's rule builder:** ticket type → name → **contract** (once, ADR-239) → criteria ("ifs", operand · operator ·
  value from a list, all must hold; each criterion names the field event it reads, agent default) → **actions**: *Add transaction #n* (order #, pay item;
  the rule's contract), *Remove transaction #n*, *Void ticket*; Active; Check; Show matches; Reprocess. **Each criterion's value is either picked from a list or typed**; `spec/RULES.md`
  §4 is the one place that says which [135]. Actions apply creates → deletes → voids. **Two creates of the same # on one
  ticket → flagged** (replaces the fee-kind check). **Collection address** = the ticket's address.
  Pay items are entered one by one, each with its rates per prime (ADR-206). **A pay item is the
  payable-work thing itself; there is no separate "work item".** Build spec: **`spec/RULES.md`**.
  *Agent default:* a rule's *Debris type* reads **the collection event's** (each property's own on a
  split; a haul-out's collection); a mismatch is flagged anyway [244]. **Operators** (ADR-125): lists EQUALS · NOT EQUALS · IS ONE OF · IS NOT ONE OF; numbers add BETWEEN
  (both ends included) · AT LEAST · AT MOST · MORE THAN · LESS THAN; dates ON · NOT ON · BETWEEN ·
  ON OR BEFORE · ON OR AFTER; text CONTAINS · STARTS WITH; any IS EMPTY · IS NOT EMPTY. The builder
  **warns** on overlapping ranges for the same #, and **refuses an exact duplicate of a rule before it
  is saved** (same form, contract, criteria and actions in any order; the name and Active ignored;
  compared with every rule not archived; the error names the rule it copies; the user, 2026-10-02;
  the details an agent default; ADR-301). A rule's name is the firm's free text, usually matched to
  its pay item. **Mileage is compared in tenths, half up.** A unit
  rate ticket's *Pay Item* is the one the monitor picked (ADR-124). Itemised tickets add an
  **Item** criterion and **Quantity from** (all items or chosen items) on Add transaction (ADR-128).
  **The # is a slot and the creation order**: #1 first, then #2…; the same ticket and rules always
  give the same transactions (never flip-flop). The engine finds **all** passing rules, creates in #
  order, then deletes, then voids; **criteria read only the ticket**, never another transaction.
  [109, 118, 122, 123, 124, 125, 128, 130, 131]
- The firm types in the **paper contract's line items** as pay items with a rate per prime,
  writes **rules** (criteria + actions, ADR-109), each naming its contract (ADR-239). **There are
  no fee kinds**: the # slot keeps a load's lines apart, the site's link to its tipping fee pay item
  tells a fee line (ADR-220, 222), and the payable type groups lines in exports (ADR-246). A real rate sheet walked line by line: **`spec/RATE-SHEET.md`** (approved, ADR-269; mileage bands,
  site fees, in/out of county and size classes all come from rules; its codes-per-prime and
  moved onto the example world, ADR-247) [196…204]. **A contract usually
  prices a line per CY and per ton**, so the prime can work with various landfills: the firm enters
  the codes it needs and its setup picks; Open ADMS never chooses. Read a rate sheet as the choices
  it allows. [202] **Each Add transaction action writes one transaction.** Two creates of the same #
  (ADR-118), or no rule creating anything, are flagged. Splits are priced per property. ~~Itemised tickets priced per line~~: withdrawn by ADR-124,
  one unit rate ticket has one code; its quantity is ADR-126. [089, 124, 126]
- The **prime's rate** applies: **one pay item holds a rate for each prime**, never a copy per prime
  (the rate of the named contract's prime, ADR-212). The transaction records
  **prime + operating sub**. [081, 206, 212]
- **Quantity** (unit keys per `spec/CONVENTIONS.md` §4): CY = capacity × load call; TN = apportioned net; EA = count; LB = pounds; crew
  time uses the **highest item's hours** through the code's conversion (per hour, ÷ day length, or steps); TBN bills nothing until a
  rate is agreed. More than 12 crew hours a day is flagged. [035, 054, 068, 084, 087, 126]
- **Transactions are the current truth:** when a ticket changes, its transactions are
  **regenerated**, and each removed row is **first copied in full to `AuditRecord`**. No reversals.
  A rate or rule change regenerates every **un-invoiced** ticket it affects. [085, 090]
- **`AuditRecord` is append-only, absolutely.** It is the only history. [007, 085]
- **Scale receipts:** only at an FDS, only when the contract asks. Hand-transcribed, consumed
  once. A receipt with two debris types is flagged and its weight unused. [034, 035, 036, 037, 038,
  069] **When a load is billed by weight the tower monitor enters the scale weight instead of a load
  call**; it is set on the pay item the rules pay, by its Unit of Measure, never on the site; **one
  quantity is asked, never both** (ADR-175, ADR-221, ADR-223; how a site's phones learn which: ADR-227);
  there is **no weight-vs-load-call check**. **One weight shared by a tandem** is split **by certified capacity**
  (derived, stored apart, summing exactly) and **both tickets are flagged**; weighing each container
  separately avoids it. [165, 175] **The record is built (ADR-326; see "Field events"):** its
  own table, the number never unique (ADR-328, 331), weights as written, pointed at by disposals.

### Agent tooling and terms
- **`pnpm lint` runs ESLint with a 4 GB heap** (2026-10-10, ADR-465): the type-aware run over the whole tree had outgrown Node's default (2,240 MB on the 8 GB Mac; the run peaks near 3 GB) and stopped with "heap out of memory". Nothing else about the lint changed. If it outgrows this, split the run by workspace. [465]
- **Prisma's own agent skills are not installed here, and `prisma generate` runs with `--no-hints`** (2026-10-10, ADR-461): in a person's terminal it offered to fetch them (`.agents/`, `.claude/`, `.windsurf/` and `skills-lock.json` under `packages/db/`); they speak of `db push` and `migrate reset`, which this project never runs (ADR-113). If those paths appear again, they are not ours: say so, never commit them. [461]
- **`pnpm security`'s own run of the grant tests names its report's file by `ADMS_TEST_REPORT`** (2026-10-10, ADR-460): `vitest.config.js` states the JSON report's file, which Vitest takes over a path on the command line, so from ADR-446 until this the check's own run (`--fresh`, or after any change) always answered `✗ no report`. Run `pnpm security --fresh` once after a change to `tools/security/src/grants.ts` or the run's reporters. [460]
- Front door `spec/INDEX.md`; rules in skills; product questions in `spec/QUESTIONS.md`; the
  hooks enforce the no-git rule and the write boundaries. [042, 043, 044, 049, 059]
- **This page** is the present tense; keep it current with every ADR/KD change. `AGENTS.md` stays
  about 150 lines of one-line rules. [092]
- **Housekeeping, 2026-10-09, at the user's word** ("make sure when the agent goes to complete a
  task, its not repeating a bunch of stuff it already did before"; then "Complete all 7 steps as
  stated"). **The chain's counts are in `agent_store/CHAIN.md` and nowhere else**, today's only;
  the `adms-verify` skill is the chain itself, and what each layer's tests need is a page beside
  it, read when that layer is touched; `NEXT.md`'s handoff holds where things stand, never a
  task-by-task record; this page is read by topic. **`pnpm ready`** (the stack up, then
  `installer:check`) comes before the chain. **Loosenings are one list tried in one command**
  (`.claude/skills/adms-verify/loosen.mjs`), which puts every file back. [445] **The stories run
  once, in `pnpm scenarios`**, no longer a second time inside `pnpm test`; **`pnpm security`
  reports the database tests from the run `pnpm test` just made** where it held every file, all
  passed, it began within thirty minutes and no code or env file changed since, and runs them
  itself otherwise or with `--fresh`. [446] **A run of several stories migrates and seeds once**:
  a template each story's database is copied from, file by file, each copy locked down and
  checked; a test holds a copy to what a database made by itself is. [447] **`pnpm local:up`
  keeps the API's or the worker's container** when it is the one it last started, still running,
  and its built code, mounted files and settings file are unchanged; otherwise it is made
  afresh, as always after `local:down`. [448]
- **No state-changing git** by agents. [008] **The guard hook is tested** (`tools/security/test/
  guard-hook.test.ts`, 57 tests) and covers the rebuilt layout: no git writes; `development/` and
  `database/` read-only; a migration written only into its empty stub; **an env file never read,
  written or printed**; generated paths (`dist/`, the Prisma client, `.generated/`, `.cache/`,
  `.state/`), the lockfile, the historical root `docker-compose.yml` and `README.md` never
  hand-written; it fails closed without `jq`. Hook, test and `AGENTS.md` change together. [283]
- **`agent_store/ROADMAP.md` is the user's one-page roadmap** (markdown tables: start, now, the
  finish line, every phase's status and requirement count, the test layers, what waits on the user).
  It summarises and decides nothing; `NEXT.md`, `BACKLOG.md` and the requirements files win. Update
  it at close-out when a task, milestone or phase closes, a REQ is ticked, or what waits on the user
  changes. No date estimates the user didn't give. [280]
- **Every skill is current** (ADR-232, 242, 244, 245, 248…253; `adms-verify` ADR-259): each is written in
  the present tense, in field events and today's words, user words verbatim, history at the end,
  and carries `<!-- skill-status: current -->`; the session hook lists them. **Trust a current
  skill's body**; this page breaks ties. `adms-verify` holds the rebuild's check chain, the historical
  one under its History (ADR-259). The Build 1 copy (`old_openadms(do not copy)/`) was removed by the user;
  never port from it if it reappears. **The trust order holds for every answer, explanation or demo,
  not only code.** To explain or demo the domain, use **`spec/golden/MISSION.md`** (approved, ADR-297). **The
  spec pages** (`spec/parts/01…09`, `RULES.md`, `RATE-SHEET.md`, `INDEX.md`, `LISTS.md`) and the
  REQs are in today's rules too (ADR-246, 247). [102, 133, 138, 232, 233, 247]
- **Debris type** is the word (ADR-234); "debris class" (the legacy's word, ADR-233) is the same one
  picked value. [074, 214, 233, 234]
  `adms-field-app` is loadable (its §4A.0 is Phase 0 scope). [138]
- **Names and examples: `spec/CONVENTIONS.md`** (the naming pass, BACKLOG 0.2b.1, done as an agent
  default at the user's word). **Names:** the industry's keyword where there is one, else plain
  English; never a legacy product's screen label. Service → service code → **pay item** (`PayItem`,
  ADR-237, the user's pick), a load's halves → **field events** (ADR-236), `service_code` → its
  **code**, Classification → **payable type** (seeded from USACE's umbrella debris types), debris
  class → **debris type**, Location Type → **site type**, the site boxes → **Takes loads · Haul-outs
  leave here · Charges a tipping fee · Ineligible site**, Special Class → **field tag**, rule actions →
  ***Add transaction #n* · *Remove transaction #n* · *Void ticket***, billing units `CY` `TN` `EA` `LB`
  `HR` `CREW_DAY` `TBN`; code, identifier, API and time conventions in its §3. **Examples:** every
  shared doc, test, seed and demo uses its **example world** (the golden mission) and its **service
  code convention** (`TYPE-WORK-UNIT[-DETAIL]`, a default the firm may ignore, ADR-235); the
  **retired examples** (`1A`, `54A`, `90A`, Bobs, TFR, Ceres, Charlotte County Landfill, Hwy 20 TDSR,
  `M003490`, `610810`…) stay only in `QUESTIONS.md`, `DECISIONS.md` and `FROM-BUILD-1.md` as history,
  and each skill or spec page drops them when it's rewritten. `development/Open_ADMS_Initial_Conventions.md`
  is read-only background; its errors are listed in CONVENTIONS §8 (KD-63, closed). **The page is approved by the user, whole** (their mark at its head; ADR-378). [234, 235, 378]
- **`NEXT.md`'s Handoff** is where a new agent learns where the product ends up and the road there
  (state, road to done, open areas, how the user works); round history lives in `DECISIONS.md`'s
  session log. [225]
- **`spec/DATA-MODEL.md` and `spec/FLAGS.md` are approved by the user (2026-10-01, ADR-289, 290).** The first is the
  schema on paper (every record and field, who writes it, what the database refuses, thirteen
  exports' columns), with sixteen agent defaults in its §12: one table per list; no ticket table; a
  completed load tied to its disposal event with a row per collection and `dissolvedAt` instead of a
  delete; the zone on the field event and mileage on the completed record's collection row; a
  person's void as `TicketVoid`; QC status only in `QcMark`; an unlock that keeps the lock's row; a
  flag's facts as JSON written by the worker alone; subs as contractors placed on a project; the
  form's own debris type entry on a field event; typed rule criteria; no driver copy on events; an
  ROE number series; the permissions list; a site's short code; the export column names. The second
  is the catalogue of **67 flags** (67 as approved; `HELPER_NOT_FOUND` retired, ADR-294; `PILE_CALL_NOT_HIGHER` added, ADR-295) (code, trigger, message, whether it still bills, the facts it
  keeps), one message shape ("Ticket 101008: … Flagged for review."), accepting never changes what
  bills. **Approved with FLAGS §5 (ADR-290):** when a load's two cert numbers differ, the certification
  on the field event that took the quantity bills it (the disposal; a haul-out's collection), flagged
  either way; no "over the legal limit" weight test until a limit is given; a message's dates and
  times are `03-Feb-2027` and 24-hour `21:40`, project time. **Approved with DATA-MODEL (ADR-289):**
  the driver is on the certification only and a ticket shows it from there, no copy stored on the
  field event. Field names and flag codes come from these two pages; what a record *means* stays
  with the skills. **Changed on DATA-MODEL at the user's word (ADR-292):** a pay item names no form (a
  rule does, so a site's tipping fee can be added by a Load rule and a Haul-out rule; "Pays when"
  says which forms); the numbering model is `ProjectNumberSeries` (`NumberSeries` is the enum); a
  field event and a survey keep `roeNumber` as picked or typed beside `roeId`; a unit rate event
  keeps its `kindOfWorkId`; a quarantined record owns its photos and its field event keeps the
  phone-made id; a transaction's contract is required. **An ROE's scope (ADR-293)** is rows picked
  from the project's own setup (`RoeScopeItem`: the load form's debris types, the unit rate payable
  types, an optional count); a ticket whose debris type or payable type isn't among them is
  flagged `ROE_OUT_OF_SCOPE`; no rows, no scope check. **Also settled (ADR-294):** a flag carries `billing` (`BILLS` ·
  `LINE_NOT_BILLED` · `NOT_BILLED`) and the line it is about; an ROE is setup, like a certification
  (set up, then filled in by a monitor or the back office); a survey's number is typed as written,
  usually the property's legal identifier, never issued; a scale receipt names the disposal monitor
  who entered it. **KD-65 is closed (ADR-295):** a completed haul-out has a completed
  load's shape (a row per collection event) and carries the tandem's `weightIsShare` mark. [140, 284,
  285, 289, 290, 292, 293, 294, 295]
- **Phase 2 (API and sync) is the active phase, opened by the user on 2026-10-06** ("phase 2 is
  open, begin working on the next task"). **It adds no rule: it wraps, signs in, queues and
  hardens.** **Its exit** (agent default): the golden mission syncing through the real endpoints,
  reconciled by queued jobs, with the approved numbers; every scenario with a Phase 2 part passing
  at the API (N of M); all 14 REQs ticked or re-filed; ARCHITECTURE §16's checklist for this layer
  answered item by item, the threat model written, `pnpm security` passing; every new table
  guarded and each service login under a statement timeout; the chain green, the API only over
  HTTPS through Caddy; no rule outside `packages/domain`, no payload shape outside
  `packages/contracts`. Phase 3 opens only on the user's word after that. [376] **Its plan**
  (`BACKLOG.md`, "Active — Phase 2"): 2.0 open · 2.1 the answer and the foundation (the threat
  model and `spec/acceptance/10-api-and-sync.md` first; the API as a process; the boundary; time
  limits) · 2.2 sign-in, sessions and permissions · 2.3 jobs and the worker's process · 2.4 the
  back office's endpoints · 2.5 phones: enrolment, sign-in, the lists · 2.6 sync · 2.7 prove it.
  **Jobs come before the endpoints that queue them**, so nothing is built against a stand-in. One
  task per response. **Every endpoint is added with its permission (read from the database on that
  request), its rate limit, its request id and its tests as each kind of caller, in one task;
  every payload is a Zod schema in `packages/contracts`; every dependency gets an ADR first.** A
  read endpoint only a screen needs comes with that screen (Phase 4). The exact packages, where a
  security event is kept, Argon2id's parameters, the device key's kind, who a record names for an
  act under the master passcode (C45) and `FieldEventEdit`'s fields (withdrawn since: no edit log, ADR-477) are each decided, by ADR, in
  the task that meets them. *Agent default.* [377]
- **Phase 1 was opened by the user on 2026-10-01 and met its exit on 2026-10-06 (ADR-371, 372)** ("phase 1 is open, begin working
  on the next task"). **Its exit:** the golden mission running as a story with the approved statuses,
  queue, ledger and audit rows; every Phase 1 acceptance scenario passing at the engine (N of M); all
  98 REQs ticked from runs that were seen; the rebuild-lesson KDs closed; every new table guarded and
  tested; the chain green; no rule outside `packages/domain`. Phase 2 opens only on the user's word
  after that. [299] **Its plan** (`BACKLOG.md`, "Active — Phase 1"): ten milestones (1.0 open · 1.1
  setup records · 1.2 certifications and capacity · 1.3 tickets and numbers · 1.4 sync intake with
  quarantine · 1.5 reconciliation · 1.6 the rule engine · 1.7 the ledger and audit · 1.8 review, QC,
  the lock and batches · 1.9 the golden mission), 47 tasks, **one per response**; every one of the
  98 REQs is named by a task. **Each milestone opens with its part's acceptance scenarios**
  (`spec/acceptance/`, one file per part page; `README.md` says how one is written): `AC-<part>-<number>`,
  given/when/then in the example world, the decision it restates, where Phase 1 proves it (database,
  domain, story) and the task; **a test's name starts with the scenario ID it proves**; a scenario
  never states a rule nothing records. **Where Phase 1's code lives** (each first task confirms it in
  its ADR): rules in `packages/domain`; the run in `apps/worker`; what a phone or a person writes as
  service classes in `apps/api` with no HTTP until Phase 2. Not Phase 1's: endpoints, sign-in, the
  sync records Phase 2 settles, the time clock's tables, exports, screens. `BACKLOG.md`'s historical
  list is numbered H1.x. *Agent default.* [300]
- **Status marks** (✅ / ⚠️ / ❓) are changed only by the user, or recorded from their words. [133, 139]
- **TDSR** = Temporary Debris *Staging* and Reduction Site; DMS means the same thing. [091]

---

## 2. Superseded — never cite these for a current rule

| Old | Replaced by | What changed |
|---|---|---|
| 497 (4), "a reprocess a person asks for with nothing changed has no endpoint in Phase 2" | 498 | It gets one in Phase 2 (an admin, or a manager/analyst with *correct*; it queues a `REPROCESS` job and changes nothing); a set-aside job is put back through it |
| 468 (3), its last sentence: "`SyncAnswer` gains the third answer" | 471 | The ledger holds only what the server stored (`SAVED` · `QUARANTINED`); a record not saved is a `HeldRecord`, in its own table |
| 270 (7), the API stating a viewer's projects and contractor (`adms.viewer_project_ids`, `adms.viewer_contractor_id`) | 315 | The API states only who is looking (`adms.viewer_id`); the database reads their projects, kind and contractor from their record |
| 305 (5), "no contact details on a contractor" | 306 | A contractor holds a contact name, email and phone |
| 001 | 074 | Debris types are extendable, not a closed 12-value enum |
| 007 (Transaction part) | 085 | Transactions regenerate; only `AuditRecord` is append-only |
| 010 | 019 | Pairing is by ticket number, not composite attributes |
| 011, 012 | 060 | No `FAILED`; four statuses |
| 014 | 042 | Agent files restructured |
| 016 (part) | 045 | Cert number may be pre-printed; unique per project |
| 020, 025 (part) | 039, 051 | Every captured field is correctable |
| 021 (part) | 046, 062 | No `LDT-`/`HOT-`; bare per-project numbers |
| 029, 030 (b) | 053 | No grace period |
| 031 (part) | 071 | No ticket list on disposal devices |
| 048 (part) | 060, 079 | Review still bills; licence/tag expiry |
| 050 (part) | 088 | One active project per device |
| 057 (part) | 061, 088 | No invoice record; package assembled by hand |
| 058 | 077 | No USACE mode |
| 060 (2)–(3) | 085 | No reversal rows |
| 064, 066 (part) | 084, 087 | Crew time itemised; conversion configured |
| 073 (part) | 080 | Attestation simplified; no copies; paper barcode unused |
| 075 (part) | 081 | Tiers live on the contract |
| 077 (GPS) | 083 | No GPS accuracy check |
| 004 (part) | 099 | Railway/Netlify is the shipped demo deploy, not *the* production target |
| 005 (part) | 094 | Geodesic math lives in one TypeScript module, not `gps.py` |
| 047, 050, 088 (wording) | 095 | "Provisioned" is now "set up" |
| 075 (depth), 081 (tiers on the contract) | 108 | Two sub tiers at most; subs recorded at certification; several primes |
| 080 (QC part) | 107 | QC is the general QC status |
| 089 (part) | 109 | Pricing written as rule actions; "the ticket's contract" allowed |
| 095 (part) | 105, 106 | Login list for the project; monitors created on a phone; one master passcode per firm |
| 060, 069 ("only a person voids") | 118 | A rule's Void ticket action may void too |
| 089 (fee-kind conflict) | 118 | The transaction # is the conflict key |
| 089, 109 (fee kinds on pay items, a firm list of them) | 246 | No fee kinds: the # slot, the site's tipping fee link and the payable type do their jobs |
| 047 ("never choose a service code") | 124 | Unit rate: the monitor picks the code that names the work, never a rate |
| 084 (agent reading: each item line priced by its own rule/code), 089 ("itemised priced line by line") | 124 | One unit rate ticket, one service code; its quantity per ADR-126 |
| 130 (agent reading: ticket B = `WG-RMV-EA × 1`) | 131 | White goods pay per item removed; B = `WG-RMV-EA × 4` |
| 128, 130 (ticket A = `WG-RMV-EA × 3`) | 132 | Ticket A = `WG-RMV-EA × 6`: every white good removed counts |
| 107 (lock only "flagged") | 117, 121 | Only QC Approved tickets can be locked |
| 105 (who signs in) | 120 | Master passcode first; username = Monitor ID |
| `adms-domain` §1.3 (0 refused) | 116 | A 0 load call is accepted and flagged |
| ARCHITECTURE §7.2/§7.4 ("refused at its next sync") | 134 | An out-of-service phone is received; its later work flagged |
| 005 / invariant 16 (`MAX_ROUTE_DRIFT_M`, route drift) | 136 | No collection route check; the project boundary replaces it |
| Monitor-recorded zone; "zones differ" (skills, part 04) | 135 | Zone attached by reconciliation from the project map |
| 129 ("split only where ROEs are required") | 137 | "Allow split loads" per project, defaulting from the program type |
| 079 (driver-licence expiry flags) | 153 | Licence flags nothing; tag expiry still flags |
| 107 ("everything a monitor makes starts QC Review") | 168 | Loads and haul-outs: only the completed load is QC'd and locked |
| 110 ("shortest legal truck route") | 163 | Public roads, no truck size; snap to nearest road; flagged straight-line fallback |
| 064 (active window by each ticket's end, for a load) | 161 | A completed load's time is its collection's end |
| `adms-scale-receipts` "cross-check it unlocks" | 165 | No weight-vs-load-call check |
| Glossary "service code binds a debris type" | 173 | Rules bind debris type; the code picks what the payable is |
| Old 4-photo limit | 157 | At most 8 per ticket; "required" on the service code |
| 109, 118, 146 ("Ticket Contract" = the ticket's own contract) | 174 | Always a named contract; one set of rules per prime |
| 035 (apportion by load-called volume) | 175 | Split by certified capacity, flagged |
| 047 ("monitors never choose a service code") for what the phone knows | 176 | Codes and settings pushed to every phone; load pick: ADR-182 |
| 158 ("circumference") | 177 | Circumference or diameter, chosen; rules test diameter |
| 047 ("monitors never choose a service code"), 129 (load start lists = debris types) | 182 | Every ticket starts from a picked service code; never a rate |
| 173 (3) ("the code does not bind a debris type"), for load codes | 182 | A load code a monitor starts from carries its debris type |
| 180 (citizen drop-off is a priced ticket type) | 184 | A drop-off is a reference log; billed only through the later haul-out |
| 187 (agent reading: the later load of stumps bills as ordinary hauling at a load call) | 189 | A load of stumps bills the sum of its stumps' CY; no load call; the stump, not the root ball, is measured |
| Site types with `HHW`; ADR-188's "takes citizen drop-off" as a lone setting | 190 | Types TDSR/DMS · Final Disposal · Transfer Station · Other; haul-out, drop-off, HHW are site options |
| 182 (start list = all the phone's shown codes for the ticket type, by code and name) | 191 | Only the badge's prime's shown codes, by the firm's name shown to monitors |
| 165 (quantity is a load call or a scale weight) | 192 | Also "from the stumps", for a load of stumps |
| Part 04 (the tower monitor records the disposal site) | 193, 195 | Every phone working at a site (tower included) is set up for one site; no start list shows sites |
| 187 (extraction "per CY from the formula"), 189 ("never the root ball"), 192 (5) (backfill from the same stump CY) | 196 | Extraction by size class in the example; the root ball is measured, for the fill |
| 196 ("maybe the hole's depth"; the stump ticket's kind and fill formula open) | 198 | Unit rate, kind of work Stumps; no hole depth; fill = root ball × 31 in; no root-ball criteria |
| 190 ("no staging site", as a type or an option), 193 (site options are labels that change nothing) | 201 | Staging is a built-in site option (not a type); built-in options tell the engine how to handle tickets at the site |
| 193 ("haul-out" flags nothing; no option flags anything) | 205 | A ticket at a site without the matching option is flagged; only a preload isn't flagged by default |
| 054 (a separate service code per contractor), 174 (codes and rules copied per prime with an acronym) | 206 | One service code holds a rate for each prime; rules still test *Contractor* |
| 182, 185, 191 (every ticket starts from a picked code; shown codes of the badge's prime; a load code carries its debris type) | 207 | The monitor picks by name, never a code: a load's debris type on Complete, a unit rate service code after the crew photo |
| 191 (number, badge, then code, all at the start) | 209 | Badge at New; details and the number at Complete, re-entered by hand |
| 110, 163 (mileage to the disposal's end GPS) | 208 | Mileage ends at the disposal site's own GPS |
| 107 ("monitors document only work they believe eligible"), for a service code with the eligibility flag | 210 | Ineligible work can be recorded, marked and flagged |
| 109 ("document format" = the ticket type; "field tag not needed") | 211 | A Document Format is a Form; field tag comes back |
| 201 (staging as a site option), 205 (options Disposal · Haul-out · Staging · Citizen drop-off · HHW), 188/190 (drop-off and HHW as site options) | 215 | A site is a site type plus Haul-outs leave here · Takes loads · Charges a tipping fee · Ineligible; "no load call" is the service code's quantity from the tickets it carries |
| 210 (min/max are checks, not price classes) | 213 | Min/max set a service code's band within its payable type; the phone works out the service code |
| 175 ("requires weight" box; service codes set up on the tower phone), 221 (agent's Q-211: fees make a phone ask; both quantities asked) | 223 | One quantity, from the paying service code's Unit of Measure; no service codes ticked on a phone; after-sync flag when a quantity is missing |
| Agent's Q-210 proposal (the site picks its tipping fee service code) | 222 | The firm writes the tipping fee service code from the site; a load no fee rule matches is flagged as a missing rule |
| 061 ("no invoice record" in full) | 228 | Locked tickets may be grouped in a named invoice batch (no amounts) |
| "Unknown behaviour → append ❓ and ask" (`AGENTS.md`) | 230 | Question shot-clock: ask only for money / evidence / monitor-work blockers; otherwise an agent default ADR |
| 206, 207, 211, 214–216, 233 (the **names** "Service", `service_code`, "Classification", "debris class", "Location Type", Allow Collection / Allow Disposal / Disposal Fee / Ineligible, "Special Class"; "debris class is the word in use") | 234 | Names only, the rules stand: service code, code, payable type, debris type, site type, Takes loads · Haul-outs leave here · Charges a tipping fee · Ineligible site, field tag (`spec/CONVENTIONS.md` §2) |
| 109, 147 ("no convention is offered" for codes), `FROM-BUILD-1.md` §6's "superseded" note | 235 | A published service code convention is offered and used in every example; the firm may still type any code |
| 234 (the word *service code*) | 237 | Now **pay item**; rules unchanged |
| 174, 206 (a pricing rule tests *Contractor*; the contract named on each action), 212 (2) (a truck priced on another prime's contract) | 239 | The contract is named once on the rule, which runs only on its prime's tickets |
| 095 (setup at the phone picks project, work, site and monitor, every day), "devices are handed in at the end of the day" to sync | 240 | Enrol once; the day's assignment from the dispatch board; setup on the phone is the unassigned fallback; sync whenever there's a connection |
| 072 ("reopened until it syncs"), 240 (6) ("reopened until the monitor ends the shift", the edit log), 476 (the edit log's table, built and taken out the same day, never committed) | 477 | Sealed for the monitor once submitted on the phone, synced or not; only the back office changes it; no edit log (the user) |
| 063 (time clock for monitors only; details open) | 241 | Anyone with an assignment; manual with nudges; manager approval; export for payroll and client billing |
| 281 (8) (an assignment's unit rate pay items left for Phase 1) | 286 | Built: a provisional `PayItem` and `AssignmentPayItem` |
| 263 (2) (four services in the local stack) | 282 | Six: the routing and address servers joined |
| 266 (3), (5) (the master passcode's hash in `packages/db/.env`; a lost database put back with nothing asked) | 281 | The hash is kept only in the database; a resume after a lost database asks for the passcode again |
| 153 (the driver "carried onto" a ticket read as a stored copy) | 289 | No copy is stored on a field event; a ticket shows and exports its certification's driver |
| 181 (6) (an ROE's scope choices and counts are the firm's own ROE form fields) | 293 | Scope is picked from the project's own setup: the load form's debris types and the unit rate payable types; a count is recorded, never checked |
| 296 (a) (the golden mission's split haul-out paid by the CY: six lines, $850.85; P1 $5,919.10 on 22 lines) | 297 | Paid by the scale's weight: three lines, $480.00; P1 $5,548.25 on 19 lines; the mission approved |
| 080 (helpers' IDs typed, flagged when they match no user) | 294 | A helper is picked from the people assigned to the project, or left blank; no flag |
| 147 ("two service codes may share a name"; codes and names not unique), 207 (a pay item's separate name), 235 ("the description carries the contract's words and line number") | 301 | A pay item's code is unique on its project; its texts are its code and its description, the firm's own words. ADR-147's "nothing forces a pattern" and the same-slot flag stand |
| 125 (the builder only ever warns) for an exact copy | 301 | An exact duplicate of a rule is refused before it is saved; overlapping ranges still only warn |
| 365 (5), the unvoid of a rule's void carried only by the run it asks for; `reprocess.unvoided` | 366 | Every unvoid writes a `TicketUnvoid`, audited under the person; the worker reads it (the user) |
| 166, "whoever may correct may accept" (and `spec/FLAGS.md` §1, `adms-validation` §5.4b as they read before) | 365 | *Accept flags* is a grant of its own; *correct* doesn't carry it (the user, KD-74) |
| 400, nothing a caller who isn't signed in does is written to the database; a failed sign-in and a lockout only in the server's log; lockout held in the API process | 401 | The standards stand: a failed sign-in and a lockout are security audit events; lockout state is in the database (the user, the same day) |
| 423 (2)'s "its code, description and band stay as entered" (an agent default that said 2.4.2 would decide) | 425 | A pay item's code, description and size band may change, the band asked of `SizeBands`; its payable type and kind of work stay as entered |

---

## 3. Open gaps — code that doesn't match the rules yet (build work)

> **2026-09-25:** the code these KDs point at is **historical** (ADR-093). They are now the list of
> behaviours and lessons the **rebuild** must get right, closed when the rebuilt layer is verified.
> New: **KD-55** (engine writes weren't atomic; one bad group blocked a project), **KD-56** (no
> device-made IDs, so retries would quarantine as duplicates), **KD-57** (docs still describe the
> historical code as where things live).

Full text: `DEVIATIONS.md`.

> **2026-10-06 (ADR-371), at Phase 1's exit: every rebuild-lesson KD in the table below is closed**
> (01, 02, 04, 05, 06, 10…19, 22…29, 35…50, 52…56), each with the scenario IDs that prove the
> rebuilt behaviour, in `DEVIATIONS.md`. **KD-30** (the HHW trail) is re-filed to Phase 5, REQ-518.
> **Open now: none.** KD-63 (the `development/` conventions draft) closed when the user marked
> `spec/CONVENTIONS.md` approved, §8 with it (ADR-378). KD-71 (2) and KD-72 are closed (ADR-373: the catalogue is
> 78 flags; a ticket waiting on a negotiated rate is in the review queue until its flag is accepted). The table is kept as the list of what the rebuild had to get right.

| Area | KDs | The gist |
|---|---|---|
| **Ledger and pricing** | **01**, 26, 36, 38, 49, 52, 54 | No transaction is ever written; rules can't select prices; no prime + sub (**the record holds both since ADR-358, KD-49's shape; the worker writes them in 1.7.2**); no regenerate path |
| **Reconciliation engine** | 02, 04, 05, 06, **12**, **13**, 15, 19, 35, 42, 43, 53 | Pairs on a composite key, not the number; numbers are prefixed and globally unique; some outcomes are unaudited or mislabelled; old statuses; three rule types never run; cert checked against "now"; can't reprocess a completed ticket |
| **Setup and org** | 14, 16, 17, 18, 39, 41, 47, 48 | No enabled ticket types, declaration event, program-type list, reference-data updates, active window, ticket-number source, debris-type list or contract tiers |
| **Certification** | 10, 11, 45, 46, 50 | No per-project uniqueness or issuer; thin model; wrong capacity math; no revoke, replace or QC |
| **Unit rate** | 27, 28, 44, 30 | No itemised counts or sub-types; unit-count flag ignored; no decimals; HHW disposition trail (low priority, design not yet discussed) |
| **Splits and scale receipts** | 22, 23, 24, 29 | No estimate or ROE on collections; no scale receipts; no `LB` unit |
| **Permissions and records** | 25, 37, 40 | No edit permissions; no creating-device field; no invoice lock |
| **Docs and tooling** | 34, 63, 65, 66, **71**, 72, **74** | **74 (open, for the user, ADR-362):** ADR-166 and `spec/FLAGS.md` §1 say whoever may correct may accept a flag; Part 2 and `spec/DATA-MODEL.md` §2.2 make *accept flags* a grant of its own (as built). Recommended: two grants. Task 1.8.4 needs it. **71 (open, for the user, ADR-339):** the flag catalogue raises `OVERLAPPING_LOADS` on both tickets of a phantom pair, `adms-exceptions` Scenario B shows the real one `COMPLETED`; and the catalogue's count says 67 where it lists 66.  69 closed 2026-10-03 by the user (ADR-318): the golden mission's P2 ticket 102001 scanning cert `730416` stands, a cert number being unique per project only. README test count (34); 66 closed 2026-10-02 (ADR-308): task 1.1.5's six open points settled as agent defaults, as recommended; 65 closed 2026-10-01: `spec/DATA-MODEL.md`'s thirteen points settled at the user's word (ADR-292…295). 59 closed 2026-10-01: the user retired the root `docker-compose.yml` and its volume, `pnpm security` 7 passed, 0 failed (ADR-291); **63**: the `development/` conventions draft is read-only background, its errors listed in CONVENTIONS §8. 33, 58, 61 and 62 closed by the rewrites and the truth-up (ADR-247…253); 57 closed by the `adms-verify` rewrite (ADR-259) |

**Known later concerns from the Phase 0 build** (not KDs: nothing disagrees with a rule yet) are the
**carry-forward register** in `BACKLOG.md` (C1…C56, by the task that picks each up; ADR-274; C1–C3
done by ADR-275; C4–C9 by ADR-276; C42's pay items by ADR-286; C51, the split haul-out's requirements and mission ticket, filed by ADR-295 and done by ADR-296, 297; C48–C50 filed by ADR-282: the demo's map servers, the rest of Q-166, what the worker asks the map servers; C12–C15 and C37 by ADR-281, which filed C42–C47: the assignment's pay items and forms, numbering, back-office-created events, the actor for a master-passcode act, a phone's other times, a device key's revocation). Among them: `installer:teardown` doesn't drop a leftover story database (C28); no statement timeout or TLS yet (C10: a
per-login timeout with Phase 2, TLS with the demo deploy); nothing states the viewer yet (C22). Read a task's items before starting it.

**Phase 0 exit** was met (`NEXT.md`). **Phase 1 exit** (the rebuild; `NEXT.md`, ADR-299) needs, at
minimum, the behaviour of **01, 04, 05, 10, 12, 13, 15, 55, 56** right and verified. `BACKLOG.md`'s
Phase 1 milestones name the KDs each closes (ADR-300).

**Closed:** 03, 07, 08, 09, 20, 21, 31, 32, 33, 51, 57, 58, 60, 61, 62, 63 (2026-10-06, ADR-378), 64, 65, 66, 68, 69, 70
(70, 2026-10-03, ADR-321: Prisma wrote `map_version.loaded_at`'s default again into every later
migration; the default is now `transaction_timestamp()`). **Milestone 1.2 built the behaviour
of KD-11, 45, 46 and 48, and KD-10's uniqueness** (its issuer: 1.3.2), each under a test named by
its scenario.

---

## 4. Waiting on the user

**Live today (2026-10-07, ADR-376…420):**
- **Nothing blocks the next task** (2.4.1, the services Phase 1 left to a story's hand).
- **Agent defaults of 2.4.1 to confirm or overturn (ADR-423):** (a) **what may be changed on a pay item after it is entered:** its Unit of Measure, its crew-time conversion and its capture settings (**amended by ADR-425:** its code, description and size band too; its payable type and kind of work stay as entered); (b) **the setup check reads every live load and haul-out form**, whether or not the project's workflows use it, and a debris type hidden on the phones; (c) **the check and the lookup are worked out when asked and kept nowhere**; (d) a pay item's unit and a project's window queue every un-invoiced, un-voided ticket of the project, a site's shape or GPS the tickets with a field event at the site.
- **Agent defaults of 2.4.2 part 1 to confirm or overturn (ADR-424):** (a) every setup request, the searches too, takes the permission Setup; (b) **merging two spellings of a sub takes Setup** (the stories had Luis do it with no grant); (c) a contract's link to its signed copy must be an `https` address; (d) adding a list value, a prime or a contract queues no ticket, and **a merge will queue the tickets of the trucks it moves** (built in part 3); (e) the status codes and plain words of a refusal by the database (409, 422, 404).
- **Agent defaults of 2.4.2 part 2 to confirm or overturn (ADR-425):** (a) **a pay item's code, description and size band may be changed after it is entered; its payable type and its kind of work may not** (they say what work it is); (b) a change to a pay item's code or description renames the rules its "Pays when" wrote, and queues the project's tickets like any other change to it; (c) **a rate is told only in the answer to whoever just set it**, and no other answer carries one yet; (d) a form, a debris type added to a form and the firm's own fields queue no ticket; (e) "Pays when" and a rule are each stated whole (a form left out of "Pays when" archives its rule there); (f) the plain words of the twenty-two refusals by the database this part can reach.
- **Agent defaults of 2.4.2 part 3 to confirm or overturn (ADR-426):** (a) **the setup check and the quantity lookup may be asked by any admin or manager/analyst, with or without Setup** (they change nothing and hold no rate; a reviewer needs to see why a ticket paid nothing); (b) **a contractor merge queues only the tickets of the certifications it moved**, on each project, as a setup change by the person who merged; (c) a site's activation and close dates may be changed, the close date emptied; (d) a map and a site's shape are sent as GeoJSON in the request, as large as a request may be (1 MiB); **a shapefile waits for the uploads' task (2.6.4)**; (e) an Esri layer named as a map's source is kept as a word, and the server fetches nothing; (f) a saved map's or shape's answer says its version, never the shapes back.
- **Agent defaults of 2.4.2 part 4 to confirm or overturn (ADR-427):** (a) **a role changes between admin and manager/analyst only**: a monitor who joins the back office is created there as a back-office user (a second person record for one human), because a monitor's password is exempt from the password rules; (b) **a manager/analyst can read the page of people**, as they can read one person (never a monitor's phone number); (c) **a person taken out of the archive comes back with the permissions, the password and the authenticator they had**; an admin clears or sets each by its own request; (d) **an admin changing somebody's sign-in address doesn't end their sessions**, and the old address is told by mail where the firm has mail; (e) an email address is changed, never cleared; (f) the page is in the order people were added, 50 at a time, with no search by name yet.
- **Agent defaults of 2.4.3 part 1 to confirm or overturn (ADR-428):** (a) **dispatch takes the permission *dispatch***, so Luis, who writes the board in the golden mission, is granted it beside the six of AC-02-10; (b) the firm's phones are read by any admin or manager/analyst; (c) **a phone is out of service from the moment it is marked**, never from a time typed in, with an optional note in the person's own words; (d) **only an admin changes the master passcode, and gives their own password again to do it**; every admin is told by mail; (e) the passcode is 8 to 128 characters, as the installer asks, and never the one in force again; (f) a removal queues no reconciliation; a found phone can't be put back in service yet.
- **Agent defaults of 2.4.3 part 2 to confirm or overturn (ADR-429):** (a) **an assignment may be for a monitor, an admin or a manager/analyst**, never a read-only viewer; (b) **a phone taken out of service can't be named** on an assignment (the person can be assigned with no phone); (c) **an assignment may be changed or withdrawn at any time while it stands**, also after a phone took it or records were made under it, audited, and it queues nothing; its person, day and project never change; (d) **an unplanned assignment, made on a phone under the master passcode, is shown on the board and neither changed nor withdrawn there**; (e) the board is read by any admin or manager/analyst; (f) a withdrawn assignment isn't put back (a new one is written), and a withdrawal takes no note; (g) nothing warns of a second assignment for one person or phone on a day; (h) Luis holds *dispatch* in every P1 story.
- **Agent defaults of 2.4.4 part 2 to confirm or overturn (ADR-431):** (a) **a request its schema refuses says which field and how** ("changes.loadCall in the body can’t be more than 100"), on every endpoint, sign-in's too: only words the published API description already holds, never a value or a field name the caller sent, three at most; (b) marking a photograph removed and labelling one take *correct* (no permission of their own); (c) a correction's answer is the record without the worker's conclusions (no status, zone or worked-out pay item) and without where a photograph's file is kept; (d) a schema bounds a value only by what it can be at all and what its column holds (a label 1 to 200 characters, a note or an address up to 2,000, a number as written up to 40), and leaves which kind records which detail to the database's checks, each told in plain words; (e) a field event's number, kind, workflow and project are never in a correction's body (a renumber is its own request; a wrong kind is made again and the wrong one voided, C79); (f) a line taken off is asked for with the quantity `TAKEN_OFF`.
- **Agent defaults of 2.4.4 part 3 to confirm or overturn (ADR-432):** (a) **a fix typed for a field event created in the back office that can't be one (a latitude of 95) is refused**, where before it was saved without the fix and the person told nothing (a phone's own record is still never refused for its fix); (b) a record created in the back office never states a typed number, a truck keyed in by hand or its typed capacity: those say what a phone did; (c) its request states both the workflow and the kind, and a kind that isn't its workflow's is the database's refusal in plain words; (d) at most 100 item lines and 100 carried tickets on one request; (e) resolving a quarantined record is two requests (a renumbering; a second copy), both taking *renumber* as their service already did (ADR-364); (f) a quarantined record's answer is its own row and never what the phone sent; an ROE's and a form's answer never hold the firm's own fields; (g) a pick a scope never had, taken off, is answered not found (404); (h) this part built no new service: an ROE's number, a form's own answers and a form created in the back office still wait for a task (C106).
- **Agent defaults of 2.4.5 part 2 to confirm or overturn (ADR-435):** (a) **a viewer asks for a ticket by its project, workflow and number, and one that isn't theirs is answered "not found"**, the same as a number nobody has; (b) **a sub's contractor user reads its own name on its line and not its prime's** (the database shows a sub only its own place on the project); (c) **a page of tickets is one workflow's** (loads, haul-outs or unit rate tickets), by number; (d) **an ROE is read on its own, not as part of a ticket**, with its number, whether and when it was signed and its owner, and not yet its parcel or address; (e) **the owner's views are declared in the Prisma schema under its `views` preview feature** rather than read with hand-written SQL; (f) **a viewer reads no flag, photograph, scale receipt, certification, survey, incident or drop-off log through the API yet**: Phase 4's portal.

- **Agent defaults of 2.4.5 part 1 to confirm or overturn (ADR-434):** (a) **task 2.4.5 is built in two parts** (the shared place, the door and the viewer's projects; then tickets, money, private citizens and the story as five callers); (b) **a viewer's reads are endpoints of their own under `/viewer/…`, closed to the back office**, which reads the same records its own way; (c) **the API never filters a viewer's rows itself**: it states the viewer and takes what the database shows; (d) **a viewer may still change their own password and set up their own authenticator** ("a read-only viewer changes nothing" is read as nothing of the firm's records); (e) **no viewer reads the setup check, the lookups, the dispatch board, the phones or the firm's people through the API yet**: a client user's and an auditor's read of setup waits for Phase 4's portal.
- ✅ **Approved by the user 2026-10-09 (ADR-452, their mark on ARCHITECTURE §7.2's note); kept here for the record.** **Agent defaults of 2.5.2 part 2 (ADR-443; ADR-441 (6) built as proposed, since no reply said otherwise; overturning (b) or (f) now takes a migration):** (a) **wrong tries at a monitor's login online wait from the fifth and lock at the fiftieth, as everybody's do, until an admin sets the password anew** (the standard allows a hundred at most; the phone's own offline screen keeps its 5 and 10), and a monitor isn't mailed at the lock; (b) **a monitor's sign-in on the server lasts twelve hours (`MONITOR_SESSION_HOURS`) and doesn't end for quiet** (the standard suggests an hour of quiet: a phone is out of signal all day, and its sync must not need the monitor back); (c) **a phone taken out of service signs nobody in online, but a monitor already signed in on it keeps their sign-in** to hand its work over, until the phone's key is revoked; (d) a monitor with no assignment that day still signs in (what they are told is part 3's); (e) **one monitor at a time on a phone: a sign-in signs out whoever was signed in on it**, and a monitor may be signed in on two phones at once; (f) the sign-in is a row of the sessions table naming the phone, and its token travels in a header of its own (`x-adms-monitor-session`) beside the phone's.
- ✅ **Approved by the user 2026-10-09 (ADR-452, their mark on ARCHITECTURE §7.2's note); kept here for the record.** **Agent defaults of 2.5.2 part 3 (ADR-444):** (a) **the phone takes the assignment in the sign-in's own answer**, not by a second call; (b) **the day is the project's own**, by its time zone; (c) **the assignment that names this phone is taken first; with none naming it, the monitor's only one for the day is taken whichever phone the board named**; (d) **with two or more left that day and nothing to say which is this phone's, the phone takes none and says so** (the dispatcher names the phone, or the master passcode sets the phone up): the server never picks a project for a monitor; (e) the phone is told the project, day, work and site, never the unit rate pay items (they come with its lists); (f) nothing records that a phone took an assignment yet, and a closed project or one outside its window is not judged.
- **Agent defaults of 2.5.3 part 4 to confirm or overturn (ADR-454; ADR-449 (5)'s four proposals were built as proposed, no reply being in the files, and may still be overturned):** (a) **the phone says which entries it holds and is made only the others** (the other choice: every entry made at every read, about 3.6 s of a processor for a project of 300 monitors, each phone, each read); (b) **one call makes at most 50 entries** (`LOGIN_LIST_ENTRIES_PER_CALL`) and the phone asks again; (c) **the login list is a call of its own**, `POST /phones/current/login-list`, not part of `GET /phones/current/lists`; (d) **a monitor with no offline seed is left off a phone's list** until their next sign-in online; (e) **the master passcode's check is sent whatever the phone's assignment**; (f) **an entry names the monitor by id, Monitor ID and name**, nothing else of them; (g) **the database lets only a phone's own proven call move the version of the passcode's check it holds, and never back**.
- **Proposed for task 2.5.4's parts 2 to 4, yours to overturn (ADR-456 (5)); (a), (b) and (c) are now built as proposed (ADR-458), (d) too (ADR-462), (e) not yet:** (a) **moving a phone to another site is recorded as a new unplanned assignment** at the new site; the earlier one stands with everything recorded under it, and nothing the dispatcher planned is edited from a phone; (b) **a switch to a monitor who has no assignment is a new unplanned assignment for them**, with a security event naming who the phone was switched to; (c) **where a monitor has several assignments on a day that name the phone they sign in on, the phone takes the one made on it last** (today it takes none); (d) **a session opened under the master passcode is marked as the passcode's**, and a temporary one ends at the end of the project's day; (e) a wrong try at the passcode on a phone with no connection doesn't count toward the server's lock. **Also said there:** nothing yet says what a phone does after wrong tries at the passcode offline (the standard's limit is ten); the field app proposes it in Phase 3.
- **Agent defaults of 2.5.4 part 1 to confirm or overturn (ADR-457):** (a) **a phone reports an unplanned assignment with no passcode sent and nobody signed in**: the phone checked the passcode, and the server takes the phone's word because it proved itself with its device key; (b) **it is kept as reported, also for a monitor archived since, a closed project and a phone taken out of service**, and is not saved only where it names a project, monitor, site or unit rate pay item that isn't one; (c) **it is for a monitor only**, never somebody of the back office (the board assigns them); (d) **its day is the day the phone's clock said**, in the project's time zone, whenever it arrives; (e) **reported again it is kept once, and the first report stands** whatever the second says; (f) **it is two security events**, "a phone set up" and "a use of the master passcode", each at the phone's own time; (g) the record names "Master passcode" on that phone, never the monitor; (h) an offset is UTC−12:00 to UTC+14:00.
- **Agent defaults of 2.5.4 part 3 to confirm or overturn (ADR-462):** (a) **the phone says which way a session under the passcode was opened** (as the phone's monitor, or temporary), and the server doesn't hold it against the board; (b) **a temporary session ends at the end of the project's day or after twelve hours, whichever comes first**, and with no assignment for the phone to take, after the twelve hours; (c) it is one security event, "a use of the master passcode", never "a sign-in"; (d) somebody who is no monitor in service is refused in plain words after the passcode was taken; (e) **a monitor switch a phone reports signs out whoever was signed in on that phone before it** (by the phone's clock), never the monitor it was switched to; (f) task 2.5.4 is five parts. **Its proposal for part 4 is now built as proposed (ADR-463):** what a phone being set up online picks from is read only with the master passcode sent, not on the phone's proof alone.
- **Agent defaults of 2.6.1 part 1 to confirm or overturn (ADR-466):** (a) **a synced record never says which phone it is from**: the server takes that from the phone's proof; (b) a time is sent as a UTC instant with the clock's offset beside it; (c) an answer to one of the firm's own form fields is text, a number or yes/no, at most 200 on a form; (d) the bounds (a number as written 40 characters, typed words 2,000, 100 item lines and 100 carried tickets on a field event).
- **Agent defaults of 2.6.1 part 2 (ADR-467):** ~~(a) a record the server can't save is kept only on its phone~~ **decided by the user, ADR-468: held on the server for a person**; (b) and (d) withdrawn from this list at the user's word (defensive details, built as they stand); **still open: (c)** one sync carries at most 200 records, 20 unplanned assignments, 100 uses of the passcode and 20 series (the user: "seems like a rather large payload… but sure"; it is the server's ceiling, the field app picks its own batch in Phase 3).
- **Agent defaults of 2.6.1 part 3 (ADR-469):** (a) a certification whose number another certification of its project already has is answered "not saved" and held for a person (ADR-468), not quarantined as a duplicate ticket number is; (b) a certification's photographs are separate photograph records that name it, never a list on the certification; (c) the bounds: 100 boxes, 20 helpers, 200 characters a name, 9,999 inches a measurement.
- **Agent defaults of 2.7.1 part 1 (ADR-491, 492):** (a) the task's cut in four, and **a story's setup left on the setup services**; (b) **a story's API is the API's process run by the stories on this machine**, on the story's database and clock, not the installation's container, reached through the stack's proxy at `stories.adms.localhost` (port 3180, `host.docker.internal`); the hop from the proxy to it plain HTTP on the machine, as the hop to the API's container is on the stack's network; (c) one clock a process: `serverOn` starts the story's API again on its clock (since ADR-493 `phonesOn`, every phone request on it); (d) a story's phone holds its token until it runs out and proves again once when told it isn't proven; (e) the API's log in a story goes nowhere, no proxy believed, no browser origin; (f) a refused proof is checked by the API's one code, the reason read from the database instead.
- **Agent defaults of 2.7.1 part 2 (ADR-493):** (a) **`story.lists.held` checks** that the phone takes the assignment named, and stops the story otherwise; (b) **`phonesOn(clock)`** in place of `serverOn(clock)`: every phone request of a story on one clock; (c) a session opened under the passcode found by its phone, monitor and kind, since a phone is told only its token; (d) `apps/api`'s index keeps exporting the phone services the stories no longer call, until 2.7.1 closes.
- **Agent defaults of 2.7.1 part 4a (ADR-496):** (a) **part 4 cut in four pieces** (4a…4d); (b) **the first admin's password set on the server** by `ServerAdmin.letBackIn` in process (the server's own command; no endpoint makes a first admin), every other person's first password by an admin at its endpoint; (c) a story's passwords made up, never shown; (d) a browser renews on `NOT_SIGNED_IN` (refresh, else sign in again) and sends the request once more; (e) one browser per person in a story; (f) AC-10-30's "nobody reads nothing" checked as the door's refusals (401 for a browser nobody signed in at, 403 for Dana) where the service answered nothing; (g) `story.viewed` taken out of the story's context.
- **Agent defaults of 2.7.1 piece 4c (ADR-500):** (a) `p1-invoiced`'s and the golden mission's voids, acceptance, correction and renumber moved with their QC and locks, so neither calls a review service in process; (b) the golden mission's grants are Dana's request at `setPermissions`, not written by hand; (c) the checks that moved say what the endpoint answers (the door's 403 with no words for a missing grant, a rule's 422 with its words, ISO times, `unitRateTicketId` with the lock's kind read from its row, the unlock's job read from the queue), none loosened; (d) no exact audit list moved.
- **Agent defaults of 2.7.1 piece 4b2 (ADR-499):** (a) a reprocess names the tickets alone, never neighbours; (b) a ticket locked as invoiced is left off the job and counted, not named for the worker to leave; (c) `NOT_A_TICKET` only for numbers a person names; (d) a set-aside job with no ticket is put back as a records job, may be put back more than once, and nothing links the new job to the old; (e) the schema's bound of 100,000 tickets; (f) `p1-queued`'s and `p1-reconciled`'s audit counts leave out what a sign-in and a grant write.
- **Agent defaults of 2.7.1 part 4b (ADR-497):** ~~(a) a reprocess with nothing changed stays without an endpoint in Phase 2~~ (overturned by the user, ADR-498); (b) Dana grants Luis at `setPermissions` with the whole set read at `readPerson`, not by hand; (c) a refusal checked as `403 NOT_ALLOWED` or `422 NOT_SAVED · CODE: words`; (d) `p1-priced`'s by-hand lock left for 4c, with QC.
- **Agent defaults of 2.6.5 (ADR-487…490):** (a) the cut in three parts; (b) **a record held for a person, not saved, counts as on the server**, but a report answered not saved, a photograph not saved, a file set aside or not yet sent keeps a phone from being turned in, named back; (c) **a series the phone doesn't report is retired whole**, and **a lost phone's blocks are retired whole whatever it reports** (a phone in hand that reports has its rest handed back); (d) **turning in a phone in service makes it `RETIRED` from that moment**; (e) a new security event kind, `DEVICE_TURN_IN`, beside the passcode's use; (f) the bounds of what a turn-in names; (g) the passcode's use is logged when the phone is not turned in too; (h) **every request of a proven phone counted for it, 600 a minute, and still for its address** (the firm raises `RATE_LIMIT_REQUESTS_PER_ADDRESS` for an office of many phones); (i) a phone names a record answered under no id by the SHA-256 of `sentCanonical`.
- **Agent defaults of 2.6.4 part 1 (ADR-478, 480):** (a) the task's cut in five and their order; (b) the API's identity at the object store may put and get an object in the media bucket and nothing else, not even list; (c) the local bucket's name (`adms-media`), its region and the bucket named in the path; (d) the store has thirty seconds to answer one question (`MEDIA_STORE_ANSWER_SECONDS`); (e) the client is the store vendor's own, `@aws-sdk/client-s3` (ADR-479), rather than a signature written by hand.
- **Agent defaults of 2.6.4 part 5 (ADR-484, 485):** (a) the three libraries (`shpjs`, `but-unzip`, `proj4`) and the two guards against their faults; (b) a map's file sent whole in one request, 16 MiB; (c) a zip unzipped to 64 MiB at most and of 1,000 files at most; (d) a file known and kept by its SHA-256 under its project; (e) a file kept only when a layer of it is a shape; (f) a shapefile with no `.prj` taken as longitude and latitude; (g) a site's shape keeps no file key; (h) the file's name sent at the load as a label, never with the file.
- **Agent defaults of 2.6.4 part 4 (ADR-483):** (a) a story's photographs' files kept in a store of the story's own, in memory, never the stack's bucket; (b) the suite's client calls for files: a part sent again where nothing came back, no question asked first; (c) a file answered not the one fingerprinted twice in one upload rests till the next (the harness's phone); (d) **the back office's read of a file open to every admin and manager/analyst, with no permission; no read-only viewer yet**; (e) a file answered as an attachment and under a sandboxing policy both; (f) a file at a photograph's place that isn't the one fingerprinted is never handed back (500); (g) the read logged with its reader, not audited; (h) the harness's files 4,096 bytes, a depth file 1,024.
- **Agent defaults of 2.6.4 part 3 (ADR-482):** (a) a file's unfinished parts held only in the API's memory, 256 MiB across every phone, the longest waiting let go (the phone starts that file again); (b) 32 MiB a file and 4 MiB a part; (c) the kinds of image taken, JPEG, HEIC or HEIF, PNG and TIFF, told by their first bytes (to be measured on real phones in Phase 3); (d) **a whole file that isn't the one the phone fingerprinted is set aside for a person, with a row of its own, and the phone sends again** (C84 (12)); (e) the depth file's own fingerprint in the record, `depthSha256`, replacing `depthFile`; (f) 300 questions and parts a phone a minute; (g) upload times written under the device key's actor; (h) the back office's read of a file moved to part 4.
- **Agent defaults of 2.6.4 part 2 (ADR-481):** (a) a photograph's record is its own part of a sync, after the records, at most 200 a sync; (b) the place the server makes, `projects/<project>/photos/<photograph>`, and `.depth` beside it; (c) ~~the phone says whether a depth file comes (`depthFile`), and no depth fingerprint is kept yet~~ replaced by ADR-482 (e): the depth file's own fingerprint, `depthSha256`; (d) a photograph whose record the server doesn't have saved is held for a person with its own reason, `OWNER_NOT_SAVED`, never saved on its own and never kept waiting for its record; sent again later it is saved.
- **Agent defaults of 2.6.2 part 1 (ADR-471):** (a) the idempotency ledger holds only records the server stored (saved or quarantined); a record it could not save is kept in the held table alone, so the ledger's answer never gains "not saved" (this amends a sentence of ADR-468); (b) the same thing sent again by the same phone is the same held record, and the same record sent with anything changed is held as another; (c) the audit log says that a held record was made and never holds a second copy of what was sent; (d) a held record is resolved only by a person.
- **Agent defaults of 2.6.2 part 2 (ADR-472):** (a) the sync is open to a proven phone with nobody signed in; (b) the ledger answers a retry by the record's id and kind, and is not compared with the phone that sent it; (c) what a sync queues: one job a record, a field event's ticket with its neighbours, an ROE's waiting tickets, a survey's own flags; nothing for a scale receipt, an incident, a drop-off log or a quarantined record; (d) a held record's fingerprint is the SHA-256 of what was sent as canonical JSON, so field order doesn't matter and any other change makes another held record; (e) **the words a phone is told gain "Held on the server for review."**; (f) a held record whose record is later sent again and saved stays open for a person; (g) a phone's blocks of numbers are topped up as the phone's own act (the device key's actor), not the signed-in monitor's; (h) a saved certification's warnings (a sub placed elsewhere) are not sent to the certifying phone; (i) a report (an unplanned assignment, a passcode use) the database refuses at the same moment is still an error for the whole call, as at its own endpoint.
- **Agent defaults of 2.6.2 part 3 (ADR-473): (a), (d) and (e) confirmed by the user on 2026-10-12 (ADR-474: "I agreed with all the flags"); (b) and (c) still to confirm or overturn:** (a) **a sync's answer carries the master passcode's check and one setup version number, and the lists and the login list stay their own reads by a signed-in monitor's phone** (the other choices: the lists in every sync's answer, or nothing but the answers); (b) the phone says which passcode version and which project's lists it holds, in what it sends; (c) a setup version may be made by a sync that only tells its number, not only by a read of the lists; (d) **the clock's limit is 5 minutes** (`DEVICE_CLOCK_OFF_LIMIT_MINUTES`), counted in whole minutes with the seconds dropped, so six minutes or more off is flagged, ahead or behind; (e) a phone that syncs with nobody signed in is not sent its lists (raised: 2.6.5).
- **Agent defaults of 2.6.2 part 4 (ADR-475), the harness only:** (a) a story's phone reports its numbers and takes its blocks in at every sync, and its first block of a series comes from a sync that carries nothing else; (b) an unplanned assignment and a logged use of the passcode are told as reported in a sync (their own endpoints are the API's tests'); (c) the stories that ask the worker for whole runs by hand still do, so their syncs' jobs wait: the golden mission reconciled by queued jobs is left to Milestone 2.8.
- **Agent defaults of 2.6.1 part 4 (ADR-470):** (a) what the suite holds any client to (the eight checks listed under "Tickets and numbers"); (b) the suite does not say whether a phone sends a record answered "not saved" again by itself: that stays the field app's and the firm's (Phase 3); (c) a sync that gets no answer leaves every record it carried on the phone, to go again whole.
- **Agent defaults of 2.5.4 part 5 to confirm or overturn (ADR-464):** (a) **a wrong try at the master passcode typed on a phone with no connection is kept in the security log but never counts toward locking the passcode on the server** (ADR-456 (5)(e), now built); (b) **a switch or a session a phone reports signs out whoever else was signed in on that phone before it**, by the phone's clock; (c) a wrong try names nobody, whatever it was typed for; (d) the phone doesn't say which version of the passcode it checked against (its record says which it holds); (e) a reported use is kept once by the id the phone gave it; (f) **REQ-202b stays open until the passcode's use at turn-in is built (2.6.5)**. Also: `pnpm lint` now runs with a 4 GB heap (ADR-465).
- **Agent defaults of 2.5.4 part 4 to confirm or overturn (ADR-463):** (a) **a supervisor setting a phone up online is shown every open project and every monitor in service**, whichever project a monitor last worked; (b) **an "open" project is one that isn't closed**, whether or not its active window has begun; (c) **only sites and unit rate pay items in service are shown to pick from** (a phone already working keeps an archived pay item its assignment names); (d) a project closed in the meantime is answered no lists and no refusal, and the phone is shown the open ones again; (e) **each read is its own "use of the master passcode" in the security log**, so a setup that reads the projects and then one project's lists is two; (f) a phone taken out of service is refused the read; (g) the monitors come a thousand a call.
- **Agent defaults of 2.5.4 part 2 (ADR-458): (b), (c) and (e) confirmed by the user on 2026-10-10 (ADR-459: "Yes on the ones you asked about"); (a), (d) and (f) still to confirm or overturn:** (a) **a site move and a switch are reported by the same call as a setup**, which says which it was made at (a setup, or a switch); (b) **a site move is recorded as the phone set up again at the new site**, with no kind of security event of its own ("a phone set up" and "a use of the master passcode"); (c) **a switch is "a phone switched" and "a use of the master passcode", naming the monitor the phone was switched to**; who held it before is not recorded on the event; (d) **the server doesn't ask that a move keeps the project or the work**: it is kept as the phone reports it; (e) **for the rest of that day, what was set up on a phone under the passcode stands over the board's plan for that phone**: a dispatcher who wants otherwise has the phone set up again; (f) where two planned assignments name one phone, or two were made on it at the same instant, the phone still takes none and says there are several.
- **Agent defaults of 2.5.3 part 5 to confirm or overturn (ADR-455):** (a) a lookup is a POST with the point in its body, and needs no assignment; (b) the answer is the street number and name alone, never a town or a postcode; (c) where the address server gives no answer the phone is told so with a 200, never refused; (d) the address server has five seconds (`ADDRESS_LOOKUP_ANSWER_SECONDS`), an installation may state another; (e) neither the point nor the address is logged, and nothing is kept; (f) the API's process does not start without `ADMS_ADDRESSES_URL`, as the worker's; (g) no limit of its own per phone until 2.6.5.
- **Agent defaults of 2.5.3 part 3 to confirm or overturn (ADR-453):** (a) **a setup version numbers the project's setup as phones are shown it, not everything a phone is sent**: a new certification, ROE or block of numbers makes no new version (the other choice: one number for everything, moving with every truck certified and every ROE signed); (b) **a version is made when a phone is first sent lists that differ**, not at each setup change, so setup changed ten times before a phone reads makes one version; (c) **its record names the device key's actor on that phone**, not the monitor who happened to be signed in; (d) **a version holds the whole project's setup**, every site's lookup and every unit rate pay item, and a phone's lists are its assignment's part; (e) **the back office reads a site's quantity lookup as a version held it** by adding `?setupVersion=N` to the lookup it already has, with no page of versions yet; (f) **a field event whose version the project never had is neither refused nor flagged**; (g) **no read-only viewer reads a version**.
- **Agent defaults of 2.5.3 part 2 to confirm or overturn (ADR-451):** (a) **a phone is sent every certification of the project**, revoked or replaced ones too, with its number, kind, capacity, prime and subs and **nothing of its driver**; (b) **a site is sent by name, site type and its two facts of use** (*Takes loads*, *Haul-outs leave here*), **without** *Charges a tipping fee*, *Ineligible site*, its permit, dates or GPS; (c) **an ROE is sent as its number, address and parcel ID, never its owner's name**, and **only to a phone whose assignment names an ROE** (a tower's phone is sent none); (d) **"pre-work survey done" means a pre-work survey carries that ROE's number**, whoever made it and whatever its QC; (e) **the site's lookup has no row for a debris type *Hidden on phones***; (f) **a pay item's Unit of Measure is not sent**, only its seven capture settings.
- **Agent defaults of 2.5.3 part 1 to confirm or overturn (ADR-450):** (a) **a phone's lists are read by a call of their own**, `GET /phones/current/lists`, which **asks the sign-in's rule again** for which assignment, so a refresh follows the board; (b) **a phone with no assignment that day is sent no lists** and keeps what it holds; (c) **a unit rate pay item's code is sent** (the phone prints it) **and its description is not**; (d) nothing records that a phone read its lists.
- **Agent defaults of 2.5.2 part 1 to confirm or overturn (ADR-442):** (a) **a monitor is created only from an enrolled phone that has proved itself, with the master passcode typed on it**: the passcode alone, anywhere else, creates nobody; (b) **nobody types a Monitor ID**: the system issues the next one; (c) the phone asks a name, a password and optionally the monitor's phone number, and nothing else (no employer); (d) a monitor's password isn't marked to be changed at first sign-in; (e) a phone taken out of service creates nobody; (f) a wrong passcode there is one code, and counts with the wrong tries at enrolment toward the same wait and lock.
- **Agent defaults of 2.5.1 part 3 to confirm or overturn (ADR-440; the first now takes a new migration to overturn):** (a) **when a phone proves itself with nobody signed in, the audit log names "Device key", an actor that is not a person, on that phone**: never a monitor who may not be there, never the master passcode, which wasn't used; (b) a proof that fails is logged and **not** kept in the database or made a security event, since anybody can send one for any phone; one that works is in the audit log's security domain; (c) a phone's token is good for fifteen minutes (`PHONE_TOKEN_MINUTES`); (d) a failed proof is one code whatever the reason, and never holds back another phone at the same address; (e) asking for a challenge works for any id, so it tells nobody which phones the firm has; (f) the database refuses a device key that isn't shaped as one; (g) `GET /phones/current` tells a proven phone whether it is in service and which version of the master passcode is in force.
- **Agent defaults of 2.5.1 part 2 to confirm or overturn (ADR-439):** (a) the two choices below, built as proposed since no reply said otherwise; (b) a passcode that isn't taken is one code whether it was wrong, waits or is locked, so a supervisor with the right passcode during a lock is told nothing more (the admins are told by mail); (c) a right passcode with something that is no key is told apart; (d) a phone's name is 1 to 80 characters and two phones may share one; (e) no new policy value: the passcode's waits and lock are sign-in's four; (f) every column that names a user refuses the master passcode's actor, more widely than the system actor is refused.
- **Built as proposed (ADR-438; overturning either now takes a new migration):** (a) **an act under the master passcode (enrolling a phone, and later creating a monitor) is recorded as done by "Master passcode", an actor that is not a person, on the phone it was done on**, never as an admin or a monitor who may not have done it; (b) **fifty wrong tries in a row at the master passcode lock enrolment until an admin changes the passcode** (waits from the fifth; phones already enrolled keep working); the standard asks for a limit of a hundred at most, and the cost is that a stranger with many addresses could force a change of passcode. Say otherwise and part 2 builds that instead.
- **Agent defaults of 2.5.1 part 1 to confirm or overturn (ADR-437):** (a) the device key is ECDSA P-256 (the one kind both phones' secure hardware makes); (b) a challenge is good for two minutes (`PHONE_CHALLENGE_SECONDS`) and once; (c) a phone proves itself once a sync and is given a short-lived token, never signing every request.
- **Agent defaults of 2.4.4 part 4 to confirm or overturn (ADR-433):** (a) **the back office can't make a certification or replace one by a request**: certifying is a monitor's, on a phone, and arrives by sync; say so if the back office should be able to enter one from a paper sheet when a phone failed, as it can a field event (ADR-156); (b) **marking signatures on file takes the *QC* permission** (it is marked at QC, ADR-080), not one of its own; (c) a measuring correction's request changes a box's measurements only: never its shape, its add/subtract mark or its feature, and no box is added or taken off (no service does; a box entered wrong that way has no fix yet short of certifying again); (d) the answer leaves out the driver's phone and licence number; (e) revoking again states the day and reason anew, and nothing un-revokes.
- **Agent defaults of 2.4.4 part 1 to confirm or overturn (ADR-430):** (a) **task 2.4.4 is built in four parts** (marks; corrections to a ticket; ROEs, forms, quarantine and back-office records; certifications); (b) **no permission is new:** an unvoid takes *void*, and naming an invoice batch or moving a locked ticket between batches takes *lock as invoiced*, as the services already asked; (c) **a reviewer told "not allowed" is never told who holds what** (403 with a code only, also when the service refuses past the door); (d) **an answer says how many tickets were queued**, as a setup change's does, and doesn't list them; (e) a reviewer's note is at most 500 characters; (f) the paths (`/projects/:projectId/ticket-voids`, `/flags/:flagId/acceptances`, `PUT /qc-marks`, `/invoice-locks`, `/invoice-unlocks`).
- **Agent defaults of 2.3.3 to confirm or overturn (ADR-420):** (a) **a rate, a pay item, a "Pays when", a project setting, a control range or a new map queues every un-invoiced, un-voided ticket of the project** (a rule its form's, a site its own), rather than a narrower guess; the run writes only what differs; (b) **a job names 200 tickets at most and a run takes up 200 at a time** (`JOB_TICKETS_AT_MOST`); (c) ~~a ticket locked as invoiced is left off every job~~ ✅ **decided by the user 2026-10-08 (ADR-422)**: left off, and the change's answer says how many were left; (d) **a certification that arrives from a phone queues the tickets that named its number as a sync's job, with nobody named as having asked for the run** (the certification is still its certifier's; certifying is done where there is signal, ADR-151, so normally no ticket has the number yet); (e) a change to a site, a new certification, a corrected survey or an accepted flag on one queues a job that names no ticket; (f) a contractor merged, a contract or prime added, a form's debris type and a list's value queue nothing yet (BACKLOG C96).
- **Agent defaults of 2.3.2 to confirm or overturn (ADR-419):** (a) **one worker process works its projects one after another**, looking at the queue every five seconds; two processes may work two projects at once; (b) **the worker's numbers**, all policy values a firm's server may state for itself: a job set aside after 5 tries, a run of 10 minutes at most, a map server given 30 seconds to answer, a pool of 10 database connections for each service; (c) **the longest run is a policy value**, not a line the installer writes into the env file as the backlog first said; (d) **a run the queue starts still checks the flags that sit on no ticket** (a certification's photographs, a site's permit) every time; (e) **when one run works several jobs**, its record names the oldest job's reason, and a person only where all were asked for by the same one; (f) **the worker's health answer** gives two counts (jobs waiting, jobs set aside) and is asked only from inside its own container. **For 2.3.3, not a question yet:** a job must name the neighbours a change can move (C95).
- **Agent defaults of 2.3.1 to confirm or overturn (ADR-418):** (a) **the queue is two tables
  of our own, not pg-boss**, which ARCHITECTURE §3 names as an example; (b) a job that fails
  whole is tried again by its project's next run and **set aside after five tries**, kept and
  shown to whoever runs the installation; (c) **a job set aside raises no flag on its tickets**
  (it says the server failed, not that a ticket is wrong), so the back office learns of one
  from the server's side until a screen shows it; (d) only the API adds a job, and the worker
  never adds one of its own.
- **Answered by the user 2026-10-07 (ADR-417: "Going with your recommendation here, and for
  the rest of the flags … your recommended approach as well"), no longer waiting:** the lock
  comes at the fiftieth wrong try in a row, not the tenth; and the agent defaults of task 2.2.6
  stand (the limits' numbers; four wrong tries at one login from one address closing that
  address for the hour; the counts in the API's memory; no caller's address logged or stored).
  Not done, by the same word: a count that fades with time, a memory of known addresses.
- **Agent defaults of 2.2.5 to confirm or overturn (ADR-415):** (a) **only an admin** creates
  people, gives and takes permissions and a viewer's projects, sets another's password, ends
  sessions and archives: there is no "manage people" permission a manager/analyst could hold;
  (b) any admin or manager/analyst reads a person, a manager/analyst without a monitor's phone
  number and with everybody else's; (c) nobody created in the back office is issued a Monitor
  ID; (d) an archived person's email address is free for somebody new; (e) `pnpm
  installer:admin` lets any admin back in, not only a firm's only one, and never makes a
  second admin; (f) a refused password's reason reaches the caller in plain words.
- **For your approval, two scenarios added to the approved file 02:** AC-02-83 (one email
  address a person who signs in) and AC-02-84 (the server command); and the note under
  ARCHITECTURE §7.0.
- **Settled at the user's word, 2026-10-07 (ADR-413: "as it relates to the previous task FLAGS,
  Im going with your recommendations"), no longer waiting:** the agent defaults of task 2.2.3
  (the email address; 30 quiet minutes, 12 hours, 5 minutes; a wait after 5 wrong tries and a
  lock at the 10th (the 50th since ADR-417) until the password is set anew; one answer to every failed sign-in; the
  actor of a wrong try; a new password ending sessions; two tabs), and **the server command
  that sets an admin's password for a firm's locked last admin, which task 2.2.5 builds**.
  Before it, ADR-407 settled tasks 2.1.2…2.2.2's.
- **Settled at the user's word, 2026-10-07 (ADR-414), no longer waiting:** a code is taken in
  one thirty-second step either side of the server's own (`TWO_STEP_CODE_STEPS_EITHER_SIDE`
  stays 1); **task 2.2.5's server command also clears an admin's authenticator**, for the only
  admin who lost their phone; a person replacing their own authenticator is Phase 4's; the
  approach (an authenticator app's code) confirmed for the product's level, with a passkey or
  hardware key a later candidate (BACKLOG C91), never assumed.
- **Agent defaults of 2.2.4 still yours to overturn (ADR-412):** a right password without a
  code is told "a code is needed"; a wrong code counts as a wrong try and locks at the policy's count (the 50th, ADR-417); an
  admin never clears their own authenticator; setting one up ends the person's other sessions
  and must be finished within ten minutes; the dev accounts' names and `pnpm local:accounts`.
- **Phase 2's exit criteria and its plan are agent defaults (ADR-376, 377)**, the user's to change:
  jobs built before the endpoints that queue them; a tenth acceptance file and a threat model
  written first, for the user's approval; reads that only a screen needs left to Phase 4.
- **`spec/CONVENTIONS.md` read as approved whole, §8 included (ADR-378).** If the mark was meant
  for less, the user says so and KD-63 reopens.
- **Owed:** from 2026-10-07 14:08 UTC, delete the `minimumReleaseAgeExclude` entry (ADR-372). The
  user has commented it out already; until that time `pnpm install --frozen-lockfile` fails.
- **Approved by the user 2026-10-06 (ADR-374), no longer waiting:** acceptance files 06…09, and the
  agent defaults of tasks 1.8.2, 1.8.3, 1.8.5, 1.9.1 and 1.9.2 (ADR-363, 364, 367, 368, 369) as
  they were listed here; the list moved word for word to `DECISIONS.md`'s scratchpad, "Moved
  2026-10-06 (ADR-375)". 1.8.4's were approved earlier (ADR-366). KD-72 and KD-71 are settled
  (ADR-373).
- **Still open to the user, any time:** whether *photos required* should take a number (ADR-345);
  the agent's details of what a contractor's login sees (ADR-361); the older defaults below.
- **Decided by the user 2026-10-04 (ADR-328), not built yet (BACKLOG C67) but for the first; the
  lines above and below that say otherwise are superseded:** **a certification is never copied**
  (configuration is: pay items, rules; **built, ADR-330**); **a scale receipt's number is never unique** (a receipt book restarts
  at 001; only a duplicate *record* matters; **built, ADR-331**); **an incident may name a contractor, a cert number
  and an ROE number**, each optional, offered as the project's setup says; **a viewer sees
  private citizens by name unless the firm said otherwise for that viewer**, set when it adds
  them (**built, ADR-336**). Confirmed as built: loose ROE scope and incident sub-type; no database limit of 8
  photographs; `MeasuredAs`; 0 CY; `formDefinitionId` optional.
- **The user's second round, 2026-10-04 (ADR-329), not built yet (C67):** **the phone prevents a
  broken record; one that reaches the server anyway is kept and flagged** (a missing kind of
  work, debris type or load call; a typed number with no reason; a load on a crew's badge; a
  net that isn't gross less tare; a ticket number that isn't digits; an end before a start).
  **An impossible GPS fix is dropped at intake with a flag and the record kept** (1.4.2). **A
  disposal with two quantities is flagged.** **A truck on a second project is certified there
  from scratch.** **The back office can archive and label a photograph.** A load of white goods
  never has a load call (`adms-ticket-workflows` §4.2b, unchanged). Nothing waits on the user.
- **From task 1.3.6 (ADR-327), yours to overturn:** ~~an incident names no certification~~
  (overturned, ADR-328 (3); built, ADR-334); **an ROE carries no setup
  version**, and the database lets the back office and a phone edit one freely, audited;
  **a record on a form with no fields of the firm's own has no definition** and empty answers;
  **a photograph field's answer is that photograph's id**; an incident's sub-type isn't held to
  its type, nor an ROE's payable type to the project's unit rate pay items, by the database;
  ~~a client user and an auditor see an ROE's owner and a drop-off log's resident by name~~ (the firm's choice per viewer, ADR-328 (4); built, ADR-336).
- **From task 1.3.5 (ADR-326), yours to overturn:** **a scale receipt's weights are kept as
  written and none is required or worked out** (a net that isn't its gross less its tare, or is
  nought or below, is received and left for a flag; only a gross or tare below nought is
  refused); **a load call or a count beside a scale receipt is received**; **the database holds
  no limit of 8 photographs a ticket** (the phone's rule); **a certification copied to another
  project holds no photographs of its own and shows its original's**; a photograph's
  fingerprints and its file's place can never be changed, by anyone; a certification's
  photograph may have no view (a crew's); **a client user and an auditor see a photograph's
  record but not where its file is kept**.
- **From task 1.3.4 (ADR-325), yours to overturn:** **no detail of a field event is required**
  (a unit rate ticket with no kind of work or count, a load with no debris type, a pile with no
  load call are all received and left for a flag); **a disposal that arrives with both a load
  call and a count is received**, and which one bills is read from the pay item; **a split
  suffix is capital letters only (`A`… `Z`, then `AA`)** and only on a collection or a haul-out
  collection; a split collection without its estimate, or an estimate without a suffix, is
  refused; a measurement must say whether it is a circumference or a diameter; a debris type,
  a field tag and a pay item of another project are refused; a carried ticket is kept as the
  number written, with no link to the ticket; an item appears once on a ticket.
- **From task 1.3.3 (ADR-324), yours to overturn:** **a typed ticket number with no reason picked
  is still received** (a reason on a scanned number is refused); **a typed capacity is taken only
  on a truck keyed in by hand, and a truck or crew keyed in by hand may have none**; **half a GPS
  fix, or one off the earth, is refused, and no fix at all is taken**; an address always says
  whether it was looked up or typed; the database takes a load on a crew's certification and
  unit rate work on a container's; it doesn't check that a ticket number is digits or that times
  are in order; a client user and an auditor see every column of a field event and its monitor's
  name and Monitor ID; AC-04-19's reason is "Device failed", as the list ships.
- **From task 1.3.2 (ADR-323), yours to overturn:** **a phone-made ROE's number is written `R-0007`** (ticket and cert numbers stay bare); **a phone holds 100 ROE numbers**; **two control ranges of one series on a project can't share a number**; a project has a cert-number series only once the firm seeds it.
- **From task 1.2.3 (ADR-321), yours to overturn:** **a sub typed at certification whose name
  already has another place on the project** (another prime's sub, or the other tier) is saved as
  a separate contractor of that name under the prime picked, with a warning, never refused and
  never moved; **a new sub is a hauler** where a container was certified and **a crew** where a
  crew was; **a merge** moves the certifications to the kept contractor and is refused where the
  two are placed differently on one project; **"replaced on" is the day the new certification was
  made**, and a certification is replaced once; **a 0 CY container is saved**; measurements that
  give no capacity are refused when certifying; **nothing checks that the certifying monitor's
  assignment includes certifying**, or that a helper was assigned that day; a vehicle type isn't
  required, and isn't held to container or crew; a certification's changes are read with
  **billing**'s; a contractor user sees no certification yet.
- **From task 1.2.2 (ADR-320), yours to overturn:** in the capacity math, **a measurement of zero
  or left blank gives no capacity** and names the box (it is never read as nought), and so do boxes
  that subtract as much as the primary holds; **every operation is "a step"** for the hundredths
  rounding (it only matters in a round bottom, a radius corner and the ÷ 46,656); a container
  under half a cubic yard works out to 0 CY; and the made-up measured boxes of `730415`, `730416`
  and `730419` (`spec/CONVENTIONS.md` §6).
- **From task 1.2.1 (ADR-317), yours to overturn:** `spec/acceptance/03-certification.md` is a
  draft until you approve it; what it added to the example world (Sam Grant certifying on Saturday
  10 October 2026 with Lee Morgan as helper; a tier 2 sub, Tidewater Hauling; a pre-printed number
  `88120`); and its fourteen unsettled points, each to be a default of the task named there.
- **From task 1.1.11 (ADR-316), yours to overturn:** what the story added to the example world
  (`spec/CONVENTIONS.md` §6): **P2's setup beyond the mission's words** (loads only; a load, an ROE
  and a survey form, the ROE form with GPS required; one rule; no map), **the fill and freon pay
  items have no kind of work** (no monitor picks them), each pay item's capture settings, Cypress
  Creek Landfill's GPS and permit. And **AC-01-80 names three things setup refuses; setup refuses
  five** (also a change in the rule builder to a rule a pay item wrote, ADR-313, and a map file
  it can't read): the scenario's wording is yours to extend.
What was answered or done moved word for word to `DECISIONS.md`'s scratchpad, "Moved from
SUMMARY.md, 2026-10-02" (ADR-307). Yours whenever you like; none of it blocks building (ADR-230):

- **Phase 1's plan is yours to overturn (ADR-300):** the acceptance scenarios are written **part by
  part, each before its milestone's code**, not all nine before any code (say so and all nine are
  written first); one task per response; the setup points nothing settles, listed at the end of
  `spec/acceptance/01-setup.md`, are decided as agent defaults by the tasks named there.
  `spec/acceptance/` is a draft for you to approve (`01-setup.md` you marked partially approved;
  `02-people-and-devices.md`, 74 scenarios, is new, ADR-314: its last table lists ten points
  nothing settles; **six were decided as agent defaults by task 1.1.10 (ADR-315), yours to
  overturn: a contractor user sees none of a project's setup** (only its name and dates; say so
  and it sees its pay items, rates or sites), **no viewer sees a client's or a contractor's contact
  details or a client's notes, a permission or a viewer's project is taken away by archiving, the
  database refuses a contractor user with no contractor, grants are audited in the security
  domain, and the table is `user_viewer_project`**).
- **Approval:** the ADR-240 notes in ARCHITECTURE §7–§10 (the approved sections now say "enrol once,
  assignment daily").
- **The REQ moves (ADR-287):** REQ-003, 015, 017 now sit in Phase 1 and REQ-004, 006, 016 in Phase
  2, because only that phase's work can finish them.
- **The map region (ADR-282):** the local stack's built-in extract is Delaware (small, dated, in the
  mission's time zone), standing in for the made-up Bayline County. Say if another region should
  stand in; Florida's needs more disk than Docker has here (8 GB).
- **Your own master passcode:** the local installation was re-made on 2026-10-01 with a throw-away
  random one nobody knows. To set yours: `pnpm installer:teardown`, then `pnpm installer`.
- **Git:** a `main` branch and a remote, when you want them (the history is two local branches,
  `phase0-foundation` and `phase1-data-coreh`). **A README** (it's missing; KD-34).
- **Names:** `spec/CONVENTIONS.md`'s names are agent defaults (ADR-234); overturn any.
- **Agent defaults the user may overturn any time** (formerly readings to confirm): ADR-214, a
  *Reduced* criterion and a setup warning for an unreduced class on the haul-out form; ADR-215,
  drop-off logs not checked against site facts; ADR-205 (2), setup lists every active site for any
  work; ADR-208, a corrected site GPS recomputes mileage; ADR-209, the re-entered number must match;
  ADR-227, the optional receipt number at Final Disposal towers; ADR-228, crews as certifications;
  ADR-229, the pay item screen writing its rules; ADR-236, field events are event-driven, not
  event-sourced (corrections in place), forms aren't a ticket's events, and the `FieldEvent` model
  shape; ADR-239, a remove/void-only rule may leave its contract blank, and each criterion names the
  field event it reads; ~~ADR-240, a finished field event is reopenable until the monitor ends the
  shift~~ (**overturned by the user, ADR-477: sealed once submitted**); ADR-241, no hourly rates or pay
  in Open ADMS, and viewers don't see hours; ADR-243, the site's lookup also answers "count the carried
  tickets", and the worker (not the tower phone) compares the count with the collection's list; ADR-244, a rule's *Debris type* reads the collection's, and a `PENDING` ticket shows its one event's flags; ADR-309, a crew day's length starts at 12 h as a policy value and a band holds both its ends in tenths of an inch (an overlap of bands is refused by the database too since ADR-310, at your word); **ADR-311, task 1.1.7's agent defaults** (the database refusing *Haul-outs leave here* off a TDSR/DMS site through the type's key repeated on the site; a bounding box as four columns; a zone's name once per version, and a zone written only with its version; Phase 1 taking shapes as GeoJSON only); ADR-310, `btree_gist` in its own schema, and Prisma's `externalTables` flag switched on so its shadow database can be prepared; ADR-245, people's marks on derived records (QC status, the invoice lock, a flag's acceptance) are their own records keyed to the record they mark; ADR-278, the details of how firm-added fields are stored (one JSONB answers column per record, a versioned form definition); **ADR-308, task 1.1.5's agent defaults** (a form definition per project form; the database refuses a definition on a load, haul-out, unit rate or certification form, and a debris type on any form but a load or haul-out one; `Form.enabled` read only on the forms that aren't a workflow's; an assignment names only ROE, survey, incident and drop-off log forms; the unreduced warning's wording); ADR-280, the roadmap page's place and name, its finish line drawn after the deploy and before the later features, and no dates; ADR-255, the licence field `AGPL-3.0-only` rather than `-or-later`; ADR-262, `pnpm licences` still checks every installed package, not only shipped ones; ADR-263, the local stack's hostnames, Postgres on port 55432, `local:down` keeping the data and the helper's command names; ADR-268, the provisional schema's shapes (database-made UUIDv7 ids, RESTRICT foreign keys, text ticket numbers, an empty split suffix, `User.monitorNumber` for the Monitor ID, the `UserRole` keys); ADR-273, the system actor (role `SYSTEM`, its fixed id and the name "Open ADMS (system)", seeded by the installer) and the tests reaching a login through the service's own env file; ADR-275, a new database per story (not a copy of `adms`), dropped afterwards, the `pnpm scenarios` command and the story's names; ADR-282, the map servers (the images, Delaware as the built-in extract, address lookup only, the hostnames, the two settings); ADR-283, the hook's new rules (env files unreadable to agents, generated paths, failing closed without `jq`); ADR-284, `spec/DATA-MODEL.md`'s sixteen defaults; ADR-285, `spec/FLAGS.md`'s codes and wording; ADR-286, the provisional pay item and an assignment that names pay items staying on its project; ADR-287, the six moved REQs; ADR-298, *Haul-outs leave here* tickable only on a TDSR/DMS site, refused in setup elsewhere; ADR-296, 297, the golden mission's split haul-out with no flagged pile and numbered 201004, and what P1's setup gained for it (Cypress Creek Landfill, `MULCH-HO-TN` at $20.00, the haul-out rules picking by disposal site, a sixth monitor); ADR-281, the Phase 0 models' shapes (a Monitor ID issued to every person written without one, from `M000001`; the device's name and no details column; an unplanned assignment with no author; no uniqueness on person or phone and day; the provisional `DisposalSite`; the number block's series and statuses; the time zone checks; the master passcode asked again when the database is lost); ADR-276, the worker still free to state a person, every audit advisory failing the run unless accepted by id, secretlint as the scanner (with our own two checks), the three accepted Prisma-CLI advisories and seven dev-tool licences allowed by version; ADR-266, the installer's command names (`pnpm installer`…), its three questions, **a master passcode of 8 to 128 characters** (NIST's floor, no breached-list screening yet), the env file locations, the database name `adms`, and stopping rather than remaking a lost secret; ADR-247, `spec/RULES.md` §7 "Is valid" (with the setup check listing every invalid active rule) and the white goods example code `WG-HAUL-EA-60`; ADR-301, the details on your correction (an archived pay item keeps its code; codes compared exactly as typed; a description is required; what makes two rules "the same" and the error's wording; a "Pays when" rule named from its pay item); ADR-300, Phase 1's plan (its milestones and their order, the acceptance scenarios written part by part, where the code lives, the scenario format, the example world's second client); ADR-302, the firm's lists as built (one table per list; only PPDR starting with *Requires ROE*; the item names and the default reasons each list starts with; "Other (typed)" not a list value; the seed never touching a list the firm has changed except to add a missing built-in value; names not unique in a list; `packages/db` depending on `packages/domain` for its types); ADR-303, the project as built (the policy values' names and their built-in defaults in the committed `packages/domain/policy.env`, with an installation-wide override left open; no database default for any setting; a kind of unit rate work taken off a project by archiving; the window never ending before it starts, the limits 0–100 and the sizes at least 1 as database checks; REQ-105d and 105j left unticked until the worker's ROE checks and the "project not active" flag exist); ADR-305, contractors and contracts as built (the database, not only setup, refusing a contract or a sub whose prime isn't one of the project's primes, through `asPrimeId` on the prime's row; a contractor's kind with no default; a sub naming its prime at either tier; a merged contractor always archived; `contract` audited in the billing domain; no unique names or link format; REQ-106e left unticked until subs are created at certification; all seen by the user, "good to go", ADR-306); ADR-306, a contractor's contact as exactly the client's three fields, each optional, with no check of an email's or a phone number's form. Design tasks (ours): Q-166, Q-167.

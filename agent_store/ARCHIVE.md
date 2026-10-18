# Open ADMS — Archive

> **History moved out of the pages every agent reads, word for word, so nothing is lost** (ADR-532).
> **Never read this file whole: grep it** for a task's number, an ADR, a C-number or a phrase.
> Each section says where its text stood and when it moved. The headings inside a moved page are
> pushed three levels down so they never look like this file's own. Earlier moves (2026-10-02 to
> 2026-10-14) are in `DECISIONS.md`'s scratchpad, under "Moved …"; new bulk moves come here.

---

## Moved 2026-10-15 (ADR-532)

The harness cleanup at the user's word ("now would be a good time to do a cleanup … so you're able
to work on this the best you possibly can"). Each page below is as it stood at commit `da04755`
(ADR-531), before the cleanup rewrote it.


### From `agent_store/SUMMARY.md`, the whole page as it stood (through ADR-531)

#### Open ADMS — Current decisions and gaps, at a glance

**The present tense of the project on one page.** `DECISIONS.md` and `DEVIATIONS.md` are the full
history, with 531 ADRs and 79 KDs, many superseded. This page says what is true **now** and which
entries to cite. The reasons live in the ADRs and the skills.

- **Keep it current:** when you add, amend or supersede an ADR, or open or close a KD, update this
  page **in the same response** (`adms-decisions`).
- **If this page and a log entry disagree,** the newest ADR wins: fix this page and say so.
- **Updated 2026-10-15, through ADR-531** (the user's review of task 2.8.6: **a phone's standing decided once, at the door**; a phone marked lost or retired **only sends**, receiving nothing (no number blocks, no passcode check, no lists), the database cutting it no block; **nothing is sent with nobody signed in** (`PHONE_IN_USE`: a monitor's session, or the master user by the passcode beside the phone's proof); **a sign-in made offline proven to the server** by an HMAC keyed by the first slow hash of what was typed; **a monitor's sign-in lasts a day**, the firm's setting, an admin's. ADR-530 (15) superseded. Before it, 2.8.6 (ADR-530): a lost phone's key revoked after the firm's time, the firm's settings record, the viewers' two-step by the firm's choice. **Phase 2 is reopened at the user's word (ADR-519): Milestone 2.8, from 2.8.7 (every captured field correctable, and records made in the back office).** What the audit found, by REQ: REQ-210 ✅ (ADR-524); REQ-211 ✅ (ADR-525); REQ-212 ✅ (ADR-526); REQ-213 ✅ (ADR-527); REQ-214, 215 ✅ (ADR-530); captured fields not correctable (REQ-216; REQ-105g), the reads the register names (REQ-217).
- **Open deviations: none.** KD-78 (every hop encrypted) and KD-79 (every container hardened) were closed by ADR-517 (`DEVIATIONS.md`). `spec/acceptance/10-api-and-sync.md` and `spec/THREAT-MODEL.md` are approved by the user (ADR-386, 393).
- **The "Updated" line holds the latest session alone (ADR-516):** replace it, never add "Before it" after it; each session's record is its ADR and `DECISIONS.md`'s session log. What stood here moved word for word to `DECISIONS.md`'s scratchpad, "Moved 2026-10-14 (ADR-516)" (and before it, "Moved 2026-10-09 (ADR-445)").
- **Read this page by topic, never whole** (ADR-445): it is some 400 KB. Read this header, §4 (what
  waits on the user) when your task touches a default, and the `###` topics you are about to
  touch (`grep -n '^### ' agent_store/SUMMARY.md`).
- **Where things stand, the road and the next task:** `NEXT.md`. The roadmap in tables:
  `ROADMAP.md`. Names, examples and formats: `spec/CONVENTIONS.md`. The task-by-task record of
  Phase 1 that used to sit here: `DECISIONS.md`'s scratchpad, "Moved 2026-10-06 (ADR-375)".

---

##### 1. Current rules, by topic

Cite the ADRs in brackets. Each topic's detail is in the named skill.

###### Foundation, stack and security — `spec/ARCHITECTURE.md` (**approved in full**, §1–§18) [104, 139, 141, 143, 144]
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
  `PUBLIC` rights, row security on, `adms_owner` owns everything); connection logging and pgAudit
  wait for the demo deploy; **TLS to the database no longer waits: locally too (the user, ADR-513;
  built by ADR-517)**. *Agent defaults.* [276]
- **Every hop encrypted, every container hardened (task 2.7.3 part 5, 2026-10-14)** [517; 098, 099, 263, 385, 405, 455, 480, 511, 513, 514]: `pnpm local:up` makes **the stack's own root** and a certificate per service (`infra/local/src/certificates.ts`, written in DER and read back by OpenSSL; no new dependency) into `infra/local/.generated/`; **Caddy issues from that root** (`caddy-root.crt` keeps its name) and **reaches every service over TLS**, checked against it and the service's one name (`upstream_tls`). The API serves **HTTPS alone** (`ADMS_API_TLS_CERT_FILE`, `ADMS_API_TLS_KEY_FILE`; `listen` refuses none); the stories' API with the `host` certificate; the object store and the address server serve TLS; **Valhalla speaks none: it listens on its loopback behind `routing-tls`**, a Caddy in its container's network. **Postgres takes TLS alone** (`hostssl` and the container's own socket; no TCP trust); **every login's URL asks `sslmode=verify-full`** with the stack's root (`ADMS_DATABASE_CA_FILE` inside a container), any other refused by the services' settings; **Prisma's schema engine is handed `require` + `sslcert` + `sslaccept=strict`** (`packages/db/prisma.url.js`: it takes an unknown mode as `prefer`). **Mail requires TLS to every server, the catcher included** (`ADMS_SMTP_CA_FILE`; Mailpit requires STARTTLS). **Only a container's own loopback is plain** (agent default: it never leaves the container). **Every container: no capability, a read-only root, an unprivileged user, no new privileges, a digest**, three departures named (Caddy's binary's file capability, never held; Valhalla as root; the address server's sudo and writable root), held by `infra/local/test/compose.test.ts`. The installer amends an earlier URL (`EnvFile.amend`, the password kept). **15.3.2 and API10:** no backend request follows a redirect; the worker's map-server answers are bounded (256 KiB), timed whole and checked (a coordinate in range, a length a number of miles at zero or more); a mail server's refusal is answered as nothing. Tests: `infra/local/test/hops.test.ts`, `certificates.test.ts`, `compose.test.ts`, `packages/db/test/tls.test.ts`, `apps/worker/test/map-answers.test.ts`. AC-10-67…70. **On a Linux host** each key must be readable by its container's user.
- **The object store's own servers closed (task 2.8.3, 2026-10-14)** [525; 480, 517]: SeaweedFS runs as **`weed server`, every part of it (master, volume, filer, S3, each one's gRPC) bound to its container's loopback** (`-ip=127.0.0.1 -ip.bind=127.0.0.1`; S3 on 8334, plain there); `mini` had all ten ports on every interface, the filer's IAM gRPC unauthenticated, and kept its admin's gRPC open whatever it was told. **S3 is reached only through `objectstore-tls`**, a Caddy sharing that container's network (as `routing-tls` for Valhalla): TLS on 8333 with the `objectstore` certificate, **`X-Forwarded-Host` believed from the stack's proxy alone** (`trusted_proxies static 172.30.213.2/32`; S3 checks a signature against that name, and the proxy rewrites Host for a TLS upstream). `mini`'s data is read by `server` as it was. Held by `compose.test.ts` and `hops.test.ts` (13 ports refused from another container); AC-10-72. **AC-10-32's successful paths** (a real sign-in, a real enrolment) are read in the process's own log, never through the container (they would leave a person or a phone in this machine's installation that nothing may remove, which the API's tests rely on its not holding; the passcode is the firm's); door holds the container to log as a test's process does, but for where its lines go. Door's reset ask takes `429 LIMITED` as a pass (the running API's ten an hour per address). *Agent defaults.*
- **What the boundary reads, what an answer and a log line are, and what every endpoint takes (task 2.7.3 part 4, 2026-10-14)** [513; 385, 387, 424, 512]: only JSON and a part of a file are read (a form or plain text 415: the framework adds no parser, `bodyParser: false`, and Fastify's plain-text one is removed); a path and a query decoded once; `__proto__` refused; an answer is the serializer's JSON; a method not listed answered "not found"; the log one JSON object a line; **every refusal at the door logged** (`The door refused a request.`: the endpoint, the code, a person's or a phone's id where known; never a name, a Monitor ID or a token) **and at the boundary** (the endpoint and `BAD_REQUEST`, never what was sent); **every number an endpoint takes has a least and a most, a whole number one a column holds** (`columnInteger`; inside it a column's own check speaks, ADR-424); no secret in a path or query; the one address taken is a contract's HTTPS link, never fetched. AC-10-57…66; `spec/CHECKLIST-API.md` §3.1 approved whole by the user.
- **The cryptography the product uses, and the checklist's built items (task 2.7.3 part 4, second piece, 2026-10-14)** [514; 402, 412, 437, 454, 505, 513]: only `node:crypto`; HMAC-SHA-256, SHA-256, AES-256-GCM (a random nonce each time), ECDSA P-256 and Argon2id, every one ASVS 5.0 Appendix C's "approved"; **an authenticator's code is HMAC-SHA-1** (RFC 6238, as the authenticator apps read it), rated "legacy" there: **a departure, kept on the evidence (11.4.1; ADR-516)**: Microsoft Authenticator computes SHA-1 alone, and NIST keeps HMAC-SHA-1 generation until the end of 2030. No ECB, RSA or PKCS#1 anywhere. **Strict equality is a lint rule** (`eqeqeq`, `== null` alone kept). The object store not answering ends a photograph's part as the server's failure, nothing called kept, and the phone sends again (a test). **4.2.1 found short:** the proxy, Postgres, the object store and the address server keep their capabilities and a writable root; hardened in part 5 with a test of `compose.yaml` (KD-79). The page's table of primitives is `spec/CHECKLIST-API.md` V11. *Agent defaults.*
- **The security checklist's written answers (task 2.7.3 part 4, third piece, 2026-10-14)** [515; 399, 408, 411, 412, 428, 454, 482, 485, 504…506, 513, 514]: `spec/CHECKLIST-API.md` §5. **Every way in is one table, ARCHITECTURE §6 "Every way in"** (a person's sign-in, a session kept going, a reset by email, a password or authenticator an admin sets right, the server's own command, a phone enrolled, a phone's proof, a monitor on a phone, the master passcode on a phone, offline on the phone, and the two anybody may ask), held by `every-endpoint.test.ts`. Also written: where consistency rules and limits are held (the contracts' schemas, the domain, `FLAGS.md`, `policy.env`); the two uploads; the heavy functions with their bounds and measured figures; what each service talks to (**personal data only to the firm's own servers**, no telemetry); every key and its life; the log inventory (two JSON-line services on standard output, `security_event`, `audit_record`, no log file); **the data's four levels**: secrets, personal details, the firm's business, evidence. **Short, proposed:** a key (the signing secret, a service's password) can't be replaced in place with its data re-sealed: Phase 5a's operator's guide (REQ-517); **the worker reads the map servers' answers unbounded and unchecked** (API10): held as the address server's are, in part 5; the mail sender's answers read as they stand, tested in part 5. §2's 25 earlier built rows each cite their test. *Agent defaults.*
- **Every endpoint is held in one list and asked by every kind of caller (task 2.7.3 part 3, 2026-10-14)** [512; 415, 434]: `apps/api/test/every-endpoint.test.ts` lists the 120 endpoints, each with its access, roles and permission, so one added or opened wider fails until a person adds its line (C86's recipe); each is asked by nobody, an admin, a manager/analyst with no grant and with every grant, a client user, a contractor user, an auditor, a proven phone with nobody signed in and a monitor signed in on it, with a body or a query no schema takes: the door answers each as the list says, nothing is written, no answer is a 5xx, and no cookie, CSRF value, token, session, Monitor ID, name, password or the passcode reaches the log. **REQ-204 is ticked; "the back office same-origin through a proxy path" is the deploy's (REQ-517).** *Agent defaults.*
- **`pnpm security` holds REQ-205 and finds Phase 2's kinds of secret (task 2.7.3 part 1, 2026-10-14)** [508; 094, 266 (3)]:
  **who reaches Postgres**: of the product only `packages/db`, `apps/api` and `apps/worker`; three
  tools named by folder with their reasons (`tools/setup`, the installer; `packages/scenarios`, each
  story's own database; `infra/local`, the dev stack's accounts), any other workspace that reaches
  it through any package or workspace failing; no other committed source file imports a Postgres
  client or `packages/db`; the product's SQL only Prisma's tagged templates (never a call taking SQL
  as a plain string), none changing the schema; every table and view the migrations make declared
  in the Prisma schema (`prisma migrate diff`, on the shadow database). **The secrets scan's fourth
  rule:** a whole Argon2 hash (salt 16 bytes or more, tag 32 or more), an authenticator's secret in
  an `otpauth://` address, a private key as a JWK; a test's own vector marked on the line before
  with `secretlint-disable-next-line -- <why>`, never honoured without its reason. Phase 2's env
  secrets (the signing secret, the object store's keys, the read-only login) were already caught
  by name. Twelve checks. *Agent defaults.*
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
  for as long as it is merged; ⚠️ **since ADR-529 nothing merges or writes it**: the column is kept as history). **`ProjectContractor`** is a contractor's place on a project
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
  merge moves is the certification task's (C56; ⚠️ the merge is retired, ADR-529 (f)). Thirty-eight models, twenty-seven migrations.
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
  `SUB_PLACED_ELSEWHERE`**), `CertificationChanges` (a replacement and a revocation say why) and `ContractorMerge` (⚠️ **retired by ADR-529 (f)**, with `ContractorSetup.merge`: alike subs are flagged, `SUB_NAME_ALIKE`; the kept record took
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
  **Operations monitoring's Phase 2 part is built (ADR-507):** the API's liveness and readiness,
  the worker's and the queue's health, error reporting as the structured logs; alerts and the rest
  are the demo deploy's (5a, C38).

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
  `{"status":"ok"}`**, to anybody, nothing else: liveness, the process alone *(agent default; kept by ADR-507)*. **`GET /readiness`** (ADR-507) → the same while the database answers the API, else **503 `UNAVAILABLE`**, to anybody, one question at a time, bounded by `STATEMENT_TIMEOUT_MS`. Nothing
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
  whole; one limit for every endpoint today; **an installation may raise it, never state it
  under a mebibyte, the heaviest sync a phone may send (ADR-504)**. **Each service login is under a statement
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
  optional settings `ADMS_SMTP_ADDRESS` (the stack's `mail:1025`), `ADMS_MAIL_FROM` and
  `ADMS_SMTP_CA_FILE`; TLS required to every server, the local mail catcher included (ADR-517). Refusal codes: `PASSWORD_TOO_SHORT`, `_TOO_LONG`,
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
- **A request the database can't do in time is told to wait, never answered 500 (task 2.8.2, REQ-210).** **`503 BUSY`**, with `Retry-After` and `retryAfterSeconds` (`DATABASE_BUSY_RETRY_SECONDS` 5), on every endpoint, where no connection came free in `DATABASE_CONNECTION_WAIT_MS` (2000), a piece of work ran past `DATABASE_WORK_LONGEST_MS` (5000; both Prisma's own, now stated and passed to every `$write`, `$read` and `$viewed` of both services) or a statement past `STATEMENT_TIMEOUT_MS` (57014): nothing of that piece of work kept. A pool wait is a warning in the log; the other two an error line with frames. Every client reads a wait one way (`toldToWait`: `LIMITED` or `BUSY`) and sends everything again as it was (the suite's 18th check). **A turn-in holds its phone's row first; a top-up reads it under a share lock first**: a second turn-in at once, or a top-up after the turn-in, is `401 PHONE_NOT_PROVEN`, never a 500. `field_event` is indexed on `(project_id, cert_number)` and `(project_id, scale_receipt_id)` for the neighbour read. A shapefile's shape is read only where its outer rings times its holes are at most `MAP_FILE_RING_PAIRS_AT_MOST` (50 million). The story's API runs on the policy's pool. *Agent defaults (§4).* [524]
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
  and a run takes up waiting jobs, the oldest first, until their tickets come to it; **a job
  behind them whose tickets the run already works rides with it (ADR-506)**. Read apart: the
  API's is a job's most, the worker's a run's take past its first job (ADR-506 (c)). Tests:
  `packages/domain/test/neighbours.test.ts`, `packages/db/test/job-queue.test.ts`; the stories
  `p1-reviewed`, `p1-voided`, `p1-invoiced` (run from the queue), `p1-queued`, `p1-left-out`.
  AC-10-50 and 54 whole, AC-10-51 in part. **Not built, said:** a sync's job (2.6.2); a
  contractor merged, a contract, a prime added, a form's debris type and a list's value queue
  nothing. What it leaves: BACKLOG C96. *Agent defaults.*
- **The worker runs as a process (task 2.3.2, 2026-10-07)** [419, 418, 360, 352, 395]: `apps/worker/src/main.ts`, the local stack's eighth service (profile `worker`), started by `pnpm local:up` and `pnpm installer` after the API. **It looks at the queue every `JOB_QUEUE_POLL_SECONDS` (5) and hands each project with a job waiting to `Reconciliation.waitingJobs`, one project after another.** Under the project's lock (the claim) the run counts a try on each waiting job first, in its own piece of work; works the tickets they name and no other, each once; and finishes each job (`finishedAt`, its run) in the run's own closing piece of work. A try that fails whole writes `lastError`; a job is set aside (`setAsideAt`) after `JOB_TRIES_BEFORE_SET_ASIDE` (5) tries, also where the worker died each time without a word; a ticket that errors fails no job. With no job waiting nothing is written. **The run still reads the whole project** (a ticket's checks read its neighbours) and still checks the flags that sit on no ticket in every run. **A run asked for directly (`Reconciliation.run`, the stories' until 2.7.1) works every ticket of the project**, whatever tickets a review service names: a job must name the neighbours a change can move, which is 2.3.3's (C95). The run's trigger is the oldest job's, its person only where every job names the same one. Two projects' runs may go at once between two worker processes; one process works them in turn. **Settings** (a missing or malformed one stops the start, named, never shown): `DATABASE_URL`, `ADMS_ROUTING_URL`, `ADMS_ADDRESSES_URL`, `ADMS_MAP_EXTRACT_SHA256`, `ADMS_WORKER_HOST`, `ADMS_WORKER_PORT`; optional `ADMS_MAP_CA_FILE`, `ADMS_DATABASE_ADDRESS`, `ADMS_MAP_SERVERS_ADDRESS`. **Policy values added:** `JOB_TRIES_BEFORE_SET_ASIDE`, `RECONCILIATION_RUN_LONGEST_MINUTES` (10), `JOB_QUEUE_POLL_SECONDS`, `MAP_SERVER_ANSWER_SECONDS` (30), read by the worker alone, and `DATABASE_POOL_CONNECTIONS` (10, never under 2), read by each service for its own pool. **Log:** JSON lines, `service: worker`, ids only, never an error's message. **Health:** `GET /health` → `{"status":"ok","jobsWaiting":N,"jobsSetAside":N,"oldestJobWaitingSeconds":N}` on the container's own loopback; no port published, no proxy leads to it. **Since ADR-507 it is 503 `{"status":"unavailable","problem":…}`** when no look at the queue has been read yet (`NOT_YET_LOOKED`, figures `null`), the latest look failed (`QUEUE_NOT_READ`) or no sign of life came for `JobLoop.stalledAfterMs` (`STALLED`: twice `RECONCILIATION_RUN_LONGEST_MINUTES`, plus `MAP_SERVER_ANSWER_SECONDS` and `JOB_QUEUE_POLL_SECONDS`); the loop looks as each pass begins and ends. **The installer** writes the worker's map settings, adds them to an older installation's `apps/worker/.env` without touching a line that is there (`EnvFile.add`), starts the worker and checks it (27 `✓`). **After a change to `apps/worker`, `pnpm local:up` again** before the chain.
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

###### Product and scope
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

###### People and devices — `adms-domain`, `adms-field-app`, ARCHITECTURE §7–§8
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
- **An address looked up for a phone's GPS (task 2.5.3, part 5 of 5, 2026-10-10, ADR-455; agent defaults).** `POST /phones/current/address-lookups`, open to a signed-in monitor's proven phone (`MONITOR_ON_PHONE`), body `{ latitude, longitude }` as exact decimals on the earth: **the point is in the body, never in a URL**. Answered `{ address, noAddress }`: the street number and name our own address server finds ("25 The Green"), or none with `NO_STREET_THERE` or `NOT_ANSWERED`; **never a refusal for want of an address** (the monitor types it, ADR-111). Nothing is written or kept; **neither the point nor the address is logged**. The API alone asks the address server (`AddressServer`: the settings' own server over HTTPS, the path fixed, no redirect followed, `ADDRESS_LOOKUP_ANSWER_SECONDS` = 5 and 64 KiB at most); no phone and no browser reaches it (AC-04-24). **One reading of an answer for the API and the worker:** the domain's `lookedUpAddress`. The API's settings name the server (`ADMS_ADDRESSES_URL`, required; `ADMS_MAP_CA_FILE`, `ADMS_MAP_SERVERS_ADDRESS`), written and added by `pnpm installer`. Counted per phone like any call (ADR-490). **A field event's address sent as `LOOKED_UP` takes the phone's word** (nothing of a lookup is kept to check it; a reviewer corrects it like any field, ADR-051): an agent default of ADR-522 (3). [455, 490, 522]
- **An unplanned assignment arrives from the phone it was made on (task 2.5.4, part 1 of 4, 2026-10-10, ADR-456, 457; agent defaults).** `POST /phones/current/unplanned-assignments`, open to a phone that has proved itself (`PROVEN_PHONE`): **nobody need be signed in and the passcode is never sent** (the phone checked it against its own check, online or not; the server takes the phone's word and counts no try). Body: the id the phone made, the project, the monitor, the work as the board states it, the site, the unit rate pay items, `madeAt` (a UTC instant) and `deviceUtcOffsetMinutes`; never the day, the phone or who wrote it. Answered 200 `{ assignmentId, answer, reason }`: `SAVED`, `ALREADY_SAVED` (the same id from the phone that made it: kept once, **the first stands**), or `NOT_SAVED` with the domain's reason (`UNKNOWN_PROJECT`, `NOT_A_MONITOR`, `NOT_THE_PROJECTS_SITE`, `NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM`, `ID_ALREADY_HELD`). **Kept as reported, never refused over eligibility:** for a monitor archived since, a closed project, a phone out of service. **Its day is the day the phone's clock said, in the project's time zone.** **Three times are kept** (C46): `Assignment.madeAt`, `.deviceUtcOffsetMinutes`, `.receivedAt` (an unplanned one has all three, a planned one none) and `SecurityEvent.deviceUtcOffsetMinutes` (only where a phone reported the event; `occurredAt` is then the phone's own time). **Written as the master passcode's actor on that phone**, with two security events at the phone's time naming the phone and the monitor: `DEVICE_SETUP` and `MASTER_PASSCODE_USE`. **The database itself** lets an unplanned assignment be made only as that actor, with source `DEVICE`, naming the very phone stated; whether one was planned, and when an unplanned one was received, never change (`20261010142419_guard_what_a_phone_reports`). Code: `apps/api/src/phone/unplanned-assignments.ts` (`UnplannedAssignments.received`), the domain's `AssignmentRules.unplannedDay`, `.mayHoldUnplanned`, `.reportedAgain`. **No story or test writes one by hand:** `unplanned` in `stories/board.ts`. **What the standards ask is ADR-456:** ASVS 16.2.1, 16.2.2, 16.3.1, 16.3.3 and 63B §3.2.10; **a server taking a phone's word for an act done offline under a shared passcode is outside both**, the user's accepted risks (ADR-030, 095, 106, 120, 240) restated: what stands for it is the device key, the three times, and the clock difference kept at sync. **The task's cut (ADR-456 (4)):** part 2 a monitor switch and a site move reported; part 3 a session under the passcode with a connection and the temporary session; part 4 every other use a phone logged, REQ-202b whole. **Proposed for those parts (ADR-456 (5)), the user's to overturn:** a site move and a switch to a monitor with none are each a new unplanned assignment; the sign-in takes the assignment made on the phone last where several name it; a session under the passcode is a marked row. Left for later: C122. [456, 457]
- **A site move and a monitor switch, reported by the phone (task 2.5.4, part 2 of 4, 2026-10-10, ADR-458; agent defaults, built as ADR-456 (5)(a)…(c) proposed, no reply from the user being in the files).** Both are **a new unplanned assignment reported by the same call** (`POST /phones/current/unplanned-assignments`), whose body now must state **`occasion`: `SETUP` or `MONITOR_SWITCH`**. **A site move is a setup anew at another of the project's sites** (`SETUP`; `DEVICE_SETUP` and `MASTER_PASSCODE_USE`): the earlier assignment stands untouched with everything recorded under it, and **nothing the dispatcher planned is changed from a phone**; a move has no kind or mark of its own (it is told by the monitor's earlier assignment on that phone that day). **A switch to a monitor who has no assignment** is `MONITOR_SWITCH`: a new one for them, with `DEVICE_SWITCH` and `MASTER_PASSCODE_USE` at the phone's own time naming the monitor switched to. Kept as reported, as part 1's. **The sign-in's rule** (`AssignmentRules.takenAtSignIn`; the phone's lists and login list ask the same rule): where several of a monitor's assignments for the day name the phone they sign in on, **it takes the one made on it last, by the phone's clock (`madeAt`)**, whenever each arrived; none where none of them was made on the phone (two planned ones) or two were made at one instant. So for the rest of that day what was set up on a phone stands over the board's plan for that phone. Code: `securityEventsOf`, `unplannedOccasions` (domain); `unplanned-assignments.ts`, `phone-assignments.ts`. **Not built (C123):** a switch to a monitor who has their own assignment (the event alone, with an id of the phone's: part 4); whether a reported switch ends the earlier monitor's server session (part 3); the story (part 4); the hand-over and the move on the phone (Phase 3). **Confirmed by the user (ADR-459):** a move has no kind of its own, a switch names only the monitor switched to, and what was set up on a phone stands over the board's plan for that phone that day. [458, 459]
- **One master passcode per firm**, set at install, changed by the firm when it chooses; no
  reminders. [106]
- **Device data is encrypted**, **never backed up**, and bound to that phone; a device can be
  synced and turned in **without the monitor**, so the key never comes from a password. [096]
- **A phone taken out of service is received, never refused:** at its next sync it proves itself
  and uploads; what it made **after** its removal time arrives **flagged**; then its number block is
  retired and it's wiped (only then is it refused). [134]
- **A lost phone's key after the firm's time, and the firm's settings (task 2.8.6, 2026-10-15, ADR-530; the user's decision ADR-520, its design agent defaults).** **`FirmSettings`**, one row (`id` 1), written once by the seed from the release's values, changed by the API alone, audited (SECURITY), read by the worker: `phoneKeyRevokedAfterHours` (1…8,760 or null for off; starts at `PHONE_KEY_REVOKED_AFTER_HOURS`, 24, 0 for off) and `viewerTwoStepRequired` (false). `GET /firm-settings` and `PATCH /firm-settings/phone-key` take an admin or Setup; `PATCH /firm-settings/viewer-two-step` an admin alone. **A phone's mark** (`Device.outOfServiceMarkedAt`, set at each mark, cleared when put back) is what the firm's time counts from, never the removal time, which may now be stated by hand. **The worker's backstop** (`PhoneKeyBackstop`, at each pass of the job loop before the projects): every phone out of service, key standing, marked the firm's hours ago, revoked in its own piece of work as the system actor: blocks still issued retired whole, `keyRevokedAt` and `keyRevokedBy: FIRM_TIME`, a security event `DEVICE_KEY_REVOKED`; it never touches a session (sign-in's records stay the API's, AC-10-11: a session is dead with its key, the door reading the phone first). **The database** lets only that (the system actor, a phone out of service, the hours passed since the mark by its own clock, the record not off, no block issued), lets such a key be turned in once (`TURN_IN`, its time kept) and nothing else of the phone change, and lets it still answer a challenge. **Its proof:** `POST /phones/:deviceId/proofs` takes an optional `passcode`; a key the firm's time revoked, signed for, with none is told **`MASTER_PASSCODE_NEEDED`**; with it (the one check, wrong tries counted) gets a token of a second kind (`PhoneTokens` purpose `underPasscode`) the door lets through only to endpoints marked **`keyRevokedToo`** (the phone read, the sync, a photograph's file read and sent, the two reports, the turn-in); a sync of it tops up no number. **The back office's phone acts** (Dispatch): `PATCH /phones/:deviceId` renames; `POST /phones/:deviceId/removals` takes `outOfServiceAt` (never after now nor before enrolment) and `reasonId` (the reasons list's new use `PHONE_REMOVAL`), and makes a lost phone retired (mark now, removal time kept); `POST /phones/:deviceId/returns` (a note) puts a found one back; a revoked key's phone stays as it is (`KEY_REVOKED`), enrolled anew. **Two-step:** a viewer is `REQUIRED` where the firm says (`TwoStepRules.need(role, viewersRequired)`), read with the session on every request; `POST /two-step/removals` (`{ code }`) removes one's own authenticator (a wrong code a wrong try; other sessions end; mailed). **The master passcode's lengths** are policy values (`MASTER_PASSCODE_MINIMUM_LENGTH` 8, `…MAXIMUM_LENGTH` 128), read by the domain and by the installer from `policy.env`; `installer:check` names each service's policy values in force. **A proven phone with nobody signed in reads no lists** (agent default, C120, C133). Proven by the story `lost-phone-key`. [134, 488, 520, 530]
- **A phone's standing decided once, a phone out of service only sends, nothing sent with nobody signed in, a sign-in made offline proven, a monitor's sign-in a day (the user's review of 2.8.6, 2026-10-15, ADR-531; supersedes ADR-530 (9)'s `keyRevokedToo` and (15)).** **The door decides a phone's standing once a request** (`Admission`, from `PhoneProofs.proven`: `status`, `keyRevoked`, `withPasscode`): a phone taken out of service reaches only the endpoints marked **`outOfServiceToo`** (its read of itself, its sync, a photograph's file read and sent, its two reports, its turn-in) and is refused **`409 PHONE_OUT_OF_SERVICE`** everywhere else, whatever session it holds; a phone the firm's time revoked reaches those alone, as before. **A sync takes the door's read** (`Sync.received(phone, sent)`) and decides once, first: a phone out of service, or revoked by the firm's time, has its work received (ADR-134), each series answered with the blocks it holds (`toppedUp: false`), and is brought nothing (`masterPasscode`, `setupVersion` null: ADR-473's "gets none"); the allocator keeps its `FOR SHARE` lock and `401` for a revoked key and answers a phone marked out of service meanwhile as not topped up; **the database issues no new block to a phone out of service** (`number_block_key_standing_guard`, on insert). **What a phone sends** (sync, photo files, the two reports) **is `PHONE_IN_USE`**: the monitor's session beside the phone's token, or **the master user**, the passcode sent beside the phone's proof (any phone may now prove itself so; the use a security event; on a phone whose key stands, the key's proof with the master user besides); nobody signed in, `401 NOT_SIGNED_IN`. **A sign-in made offline** is reported at `POST /phones/current/offline-sign-ins` (`OfflineSignIns`; kinds `OWN_PASSWORD`, `AS_MONITOR`, `TEMPORARY`) with a proof, an HMAC-SHA256 over the domain's `OfflineSignInRules.signed`, keyed by the first slow hash of what was typed, which the server checks against the monitor's offline seed or its own hash of the passcode in force: never the phone's word. Taken, it is a session from when it was made (the firm's hours; a temporary one also the project's day), the session keeping its id, the phone's time and offset (all or none, never changed, unique), security event `OFFLINE_SIGN_IN`; refused by one code `401 SIGN_IN_REFUSED` with `OFFLINE_SIGN_IN_REFUSED` for the back office (no proof, a password or passcode changed since, a monitor not in service or locked, run out, a later sign-in on the phone, taken already). **A monitor's sign-in lasts the firm's hours**, `FirmSettings.monitorSessionHours` (1…24; 24 as shipped from `MONITOR_SESSION_HOURS`), changed by an admin alone (`PATCH /firm-settings/monitor-sessions`), read at every sign-in. Code: `apps/api/src/sign-in/admission.ts`, `apps/api/src/sync/sync.ts`, `apps/api/src/phone/offline-sign-ins.ts`. [531]
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

###### Time and photos — ARCHITECTURE §10–§11
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

###### Org model and project setup — `adms-data-model`, `adms-ticket-workflows` §4.0
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
  phone suggests known ones; ⚠️ since ADR-529 (f) the back office no longer merges duplicates: certifications naming alike subs are flagged `SUB_NAME_ALIKE`, and a person corrects the sub). [081, 108] **Built
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
  loaded from it by layer. **Since ADR-527 a KML file, and a KMZ, is a map's file too** (read by
  `@tmcw/togeojson` over `@xmldom/xmldom`, ADR-528; one holding a `<!DOCTYPE` refused before it is
  parsed), **and an Esri feature layer is fetched by the API** (`POST
  /projects/:projectId/esri-map-versions`, "Refresh from Esri" `POST
  /map-versions/:mapVersionId/esri-refreshes`, `POST /sites/:siteId/esri-shapes`): every feature as
  GeoJSON in WGS84 through the layer's own `query`, a page at a time, before any database work;
  each copy kept as a map's file, the version naming the layers' addresses (`sourceName`,
  `zones_source_name`, `zones_file_key`); **the request held against SSRF** (`EsriLayers`: a
  layer's own HTTPS address only, never `localhost`, a `.localhost` name or a private or reserved
  address, every resolved address checked where the connection is made, unless the firm lists the
  host in `ADMS_ESRI_PRIVATE_HOSTS`; no redirect followed; `ESRI_LAYER_ANSWER_SECONDS` and the map
  file's bound for the whole exchange); a secured layer's token sent in the body, never kept,
  logged or answered. A site's shape keeps where it came from too. The screen is Phase 4's
  (REQ-124b). [135, 141, 311, 484, 485, 523, 527, 528]
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
  on a project, archived ones included; ⚠️ `enabled` dropped by ADR-529 (d): the day's assignment says which forms a person may make, and a workflow's form's
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

###### Certification — `adms-certifications`
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

###### Field events — `adms-domain` §1.2 [236]
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

###### Tickets and numbers — `adms-ticket-workflows`, `adms-exceptions`
- **The sync contract's records (task 2.6.1, part 1 of 4, 2026-10-11, ADR-466; agent defaults).** `packages/contracts/src/sync-records.ts`: a field event (with its item lines and carried tickets), a scale receipt, an incident, a drop-off log, a survey and an ROE, each a strict schema, and `syncedRecordSchema` naming each by its kind. **A schema says what a record can be at all, never whether the work was right** (ADR-052): an unknown field is refused, every value is bounded by what the database keeps, a detail belongs to its kind (the domain's `FieldEventDetails`); a gap, an end before its start, a GPS fix that couldn't be one and a number that isn't digits are taken as sent. **No record names a conclusion, money or a certified capacity, nor which phone it is from** (`deviceId` and `source` are the server's to say, from the phone's proof). A time travels as a UTC instant with its offset and is read as a `Date`. **`Intake`'s types are these** (`apps/api/src/sync/sent.ts`), with the phone added; a photograph's record is still by hand (2.6.4). **A phone's field event carries `typedCapacityCy`** (KD-75, closed: intake had no way to take it). The task's other parts: the payload and its answers; a certification; the suite any client must pass. No endpoint yet (2.6.2). [466]
- **One sync, whole, and what it is answered (task 2.6.1, part 2 of 4, 2026-10-11, ADR-467; agent defaults).** `packages/contracts/src/sync.ts`. **Sent (`syncSentSchema`), read in this order:** the phone's clock (`clockAt`, `deviceUtcOffsetMinutes`), its unplanned assignments and the passcode's uses it logged (the schemas their own endpoints read, `phone-reports.ts`), its records, the last number it used of each series; never the phone, who is signed in or a conclusion. **Each record is read on its own by `recordRead`**, so one that isn't a record never refuses the sync or the others (AC-05-45). **At most** 200 records, 20 unplanned assignments, 100 uses, 20 series each once; a phone with more syncs again. **And by weight (ADR-504): a sync weighs a mebibyte at most as sent** (`syncBytesAtMost`, its JSON in UTF-8, `sentWeight`), **the least body any installation's API reads** (`REQUEST_BODY_LIMIT_BYTES` is never stated under it, `requestBodyBytesAtLeast`); a client fills a sync up to the counts and the weight, whichever comes first (`fitByWeight`), records then their photographs' records; **a record weighs 256 KiB at most** (`syncedRecordBytesAtMost`): `recordRead` reads one heavier as no record (`NOT_A_RECORD`, under its id), held for a person, never left on the phone; the heaviest reports leave room for three such records. The suite weighs every sync (its seventeenth check). **Answered (`syncAnsweredSchema`), one answer for each thing sent, in order:** a record is `SAVED` (with notes), `ALREADY_SAVED`, `QUARANTINED` (reason, words, the record that holds the number) or **`NOT_SAVED`** (**held on the server for a person once 2.6.2 builds its table: the user's decision, ADR-468, replacing 467 (5)'s "kept nowhere"; `quarantined_record` cannot hold it**), for one of three reasons the domain names (`NotSaved`): `NOT_A_RECORD`, `NAMES_NO_RECORD` (the database refuses what it names), `ASSIGNMENT_NOT_SAVED`. A record that isn't one is told which field and how, never a value that was sent (`notRead`, ADR-431's rule). A record under another monitor's assignment is saved as sent. For each series, the blocks held now and `toppedUp`. No endpoint yet (2.6.2); what it leaves: C128. [467, 468]
- **A certification made on a phone, as a synced record (task 2.6.1, part 3 of 4, 2026-10-11, ADR-469; agent defaults).** `syncedCertificationSchema`, the seventh kind of `syncedRecordSchema` (`CERTIFICATION`): what `Certifications.certify` takes and nothing else. **Never a capacity:** the boxes as measured (the primary first, 100 at most, whole inches 1 to 9,999), and the server works it out. Never a QC status, signatures on file, a revocation, who a typed sub is, or the phone. Its number as written, never blank; a sub typed by name; `replaces` names the replaced certification's id and why. The schema refuses only what isn't a certification at all (a field nobody named, a value past its bound, a vehicle type picked and typed, a crew type on a container, a feature on the primary box, a later box with none or two, a helper twice). **What `certify` itself refuses** (measurements that give no capacity, a replacement with no reason, a second tier with no first, a sub typed twice) **and a cert number its project already has are answered `NOT_SAVED` with a fourth reason, `CERTIFICATION_REFUSED`**, in the rule's own words (`NotSaved.certificationRefused`, `.certNumberHeld`); held on the server for a person (ADR-468), never quarantined. **Its photographs are photograph records that name it** (`owner.kind: 'CERTIFICATION'`, with the view); the certification lists none. One way in: `Certifications.received` hands the contract's shape to `certify`; the endpoint is 2.6.2's. [469]
- **A sync, the idempotency ledger and a held record, as tables (task 2.6.2, part 1 of 4, 2026-10-11, ADR-471; agent defaults).** **Task 2.6.2 is cut in four:** the schema (done); the service and the endpoint; what the answer carries besides the answers and the worker reading the clock's difference (`DEVICE_CLOCK_OFF`'s threshold a policy value); the harness's phones through it. **`Sync`** (`sync`): the phone, the server's clock when it began, the phone's clock with its offset, **the difference (the phone's less the server's, whole seconds, wide)** held by the database to the two instants, and the setup version sent, written once; nothing else of it ever changes. **`SyncedRecord`** (`synced_record`, key column `id`, `recordId` in code): one row for each record the server **stored**, `SAVED` or `QUARANTINED`, with its kind (the contract's word), its sync and its phone; written once, never changed. **A record the server could not save is not in the ledger: it is a `HeldRecord`** (`held_record`, ADR-468's table; `SyncAnswer` stays the two values, amending ADR-468 (3)'s last sentence): an id of its own, the phone and the sync, the record's id, project and monitor only as sent (no foreign key), what was sent as any JSON value with its SHA-256, the domain's reason, what the phone was told, and a resolution by a person. **The same thing sent again by the same phone is the same held record**; what was sent is never changed or deleted, and the audit log holds no second copy of it. Each of the three is written only for the phone it names (`sync_from_its_phone_guard`). The API writes them; **the worker reads `sync` and `synced_record` and holds nothing on `held_record`**; a viewer sees a held record as a quarantined one (what was sent only where the firm lets them see private citizens), and no sync or ledger row. No service writes them yet (part 2). `spec/DATA-MODEL.md` §4.5 has the as-built notes. [468, 471]
- **The sync service and its endpoint (task 2.6.2, part 2 of 4, 2026-10-11, ADR-472; agent defaults).** **`POST /phones/current/syncs` (`syncPhone`, `PROVEN_PHONE`; body `syncSentSchema`, answer `syncAnsweredSchema`), served by `Sync` (`apps/api/src/sync/sync.ts`).** A `Sync` row is written first as the device key's actor on the proven phone, with the phone's clock less the server's rounded to the second; one row a call. Then, in the payload's order, each its own piece of work and its own answer: unplanned assignments (`UnplannedAssignments.received`), passcode uses (`PasscodeUses.received`), records, numbers. **A record:** the ledger is asked first (an id held as `SAVED` under the same kind is `ALREADY_SAVED`; a quarantined one and one stored before the ledger are `Intake`'s own look); the server adds `source: 'DEVICE'` and the phone; `Intake.receive(sent, brought)` or `Certifications.received(sent, brought)` stores it **with its ledger row (`ledgerRow`) and its job in the same piece of work**, as the monitor from the phone. **What a sync queues (trigger `SYNC`, no person, one job a record):** a saved field event's ticket and its neighbours; an ROE's waiting tickets, else a job that names none; a survey, a job that names none; a certification as `certify` does; a scale receipt, an incident, a drop-off log and a quarantined record nothing. A record received with no sync named (a story's own intake) writes no row and no job. **Held (`HeldRecord`, by `Sync` alone, as the device key's actor):** what isn't a record; a record under an unplanned assignment this sync answered `NOT_SAVED` (not tried); what the database's constraints refuse or a form definition the server lacks (`NAMES_NO_RECORD`; never an error, never the database's words); a certification its rules refuse, whose number is held or that replaces one already replaced (`CERTIFICATION_REFUSED`, asked before `certify`). A unique refusal on any other record and anything else thrown stay the server's failure; a report answered `NOT_SAVED` is not held. **The fingerprint is the SHA-256, hex, of what was sent as canonical JSON in UTF-8 (keys sorted at every depth)**: the same thing again, in any field order, is the same held record. **The phone is told the domain's words plus "Held on the server for review." (`NotSaved.heldForReview`), only once it is held.** A held record whose record is later saved stays for a person. **Numbers:** `NumberAllocator.topUp` as the device key's actor, a lost race asked again; a refused report answered `toppedUp: false` with the blocks held before. A saved certification's warnings are not sent to the phone. The log carries the phone, the sync's id, the difference and counts by answer: never a record, its id or a message. **Not yet:** lists, a new passcode check and `setupVersionSent` in the answer, the worker reading the difference (part 3); the harness's phones through it and a database's refusal as a story (part 4); a per-phone limit (2.6.5).
- **What a sync holds for a person, read and resolved (task 2.8.4, 2026-10-14, ADR-526; agent defaults (a)…(g)).** **Reads, open to every admin and manager/analyst whatever they hold, a page at a time (50, at most 200), oldest first, by `projectId` and/or `deviceId`, `waiting` true or false:** `GET /held-records` (each exactly as sent, `sentAs` read from it by the contract's `heldSentAs`, why, the words its phone was told, its sync or none, the photographs kept with it, how resolved); `GET /set-aside-files` (each beside its photograph: what it belongs to, the fingerprint its phone gave, whether its own file came) and `GET /set-aside-files/:id/file` (its bytes as a photograph's are handed back: attachment, `nosniff`, sandboxed, never where kept); `GET /quarantined-records` (what the phone sent, its phone and monitor, and the holder read as a field event or an ROE). Services `HeldReads`, `HeldReview` (`apps/api/src/review/`), controller `HeldController`. **A held record is resolved once, by a person, with a reason (required):** *saved as corrected* (`POST /held-records/:id/savings`, **correct**): the record as it should be in the sync's own shape (`correctedRecordSchema`: the seven kinds or `{ record: 'PHOTO', photo }`), **under the id its phone made and the kind it was sent as** (refused `NO_ID_SENT`, `NOT_THE_ID_SENT`, `NOT_THE_KIND_SENT`; a report `CLOSED_ONLY`), written as the reviewer from the back office as the phone's record (its phone, assignment, setup version, the held record's received time) by `RecordWrite` (field event, ROE; a number held refused in the renumber's words), `Intake.savedIn` (scale receipt, forms, a photograph) or `Certifications.certifiedIn` (a number held refused, `NUMBER_HELD`); its photographs move to it; its tickets and neighbours queued as a correction's (a lock refuses it); *closed, never to be saved* (`POST /held-records/:id/closings`, **void**): nothing made. **A file set aside is closed only** (`POST /set-aside-files/:id/closings`, **void**): the photograph's own file won't come; it stays beside it, never the photograph's. **A photograph whose record is held is kept with it** (`photo.held_record_id`, the ninth owner: the newest record held from its own phone under the id it names, of its kind and project, still waiting), **answered saved, its files taken as any photograph's**; one whose record is nowhere is still held (`OWNER_NOT_SAVED`), closed only. **A report answered `NOT_SAVED` is held** (`REPORT_NOT_SAVED`, `NotSaved.reportNotSaved`'s words), at a sync and at its own endpoint (`held_record.sync_id` null only for those); the phone's answer is unchanged. Held writes go through `HeldThings` (`apps/api/src/sync/held.ts`). **Turn-in confirms** a report saved or held; a photograph saved with its files kept, or whose missing files each have a file set aside a person closed; a held photograph a person closed. A record the phone can't send readably stays the same held record however often sent; one held for what it named (its assignment, a pick) and saved as corrected is answered `ALREADY_SAVED` when the phone sends it again. **The database:** a held record's and a file set aside's resolution once, from the back office, by the person named on it (`resolved_once_guard`, after the tables' checks); a file set aside changed in nothing else; a photograph kept with a record held from its own phone and project, leaving it only for the record saved from it (`photo_held_record_guard`); a held certification's photographs keep their views. **Tried (C136):** SeaweedFS refuses (400) a put stating a SHA-256 its bytes don't have; `MediaStore` sends none (not every store takes it), the API checks every file against its fingerprint first. [526]
- **What a sync brings besides its answers, and the clock's flag (task 2.6.2, part 3 of 4, 2026-10-11, ADR-473; the lists staying out of the answer and the 5-minute limit confirmed by the user, ADR-474; the rest agent defaults).** **The phone says what it holds**, last in `syncSentSchema`: `holds: { masterPasscodeVersion, listsProjectId }`, each null where it holds none. **The answer gains two things, to a phone in service only (ADR-531; a sync needs somebody signed in since):** `masterPasscode: { version, check }` (the version in force; a check, the login list's own kind, only where the phone holds another, made by `PhoneLoginList.passcodeBrought`, and the version the phone's record holds moves then as the device key's actor) and `setupVersion: { projectId, version }` or null (that project's setup as its phones are shown it now, a new version made where it moved, `SetupVersions.numbered`; null for no lists held or a project the server doesn't have). **Never the lists or the login list:** those are an assignment's, read by a signed-in monitor's phone at `GET /phones/current/lists` and `POST /phones/current/login-list`; ARCHITECTURE §9 (6) is those reads beside the sync's call. **`Sync.setupVersionSent` is written once, by `Sync`, as the device key's actor**, where a version was sent. `syncAnswerRead` takes another project's setup version for no answer. The log says the passcode's version, whether a check went and the version sent, never a check. **The worker:** `project-read.ts` reads each phone-made field event's sync through `synced_record` (its id, `FIELD_EVENT`, `SAVED`) and hands `TicketChecks` the difference in whole minutes with the seconds dropped, signed; `WorkSettings.deviceClockOffLimitMinutes` is the policy value **`DEVICE_CLOCK_OFF_LIMIT_MINUTES=5`** (1 to 1,440; the worker's own settings may state another, ADR-395). **More than the limit's whole minutes off, ahead or behind, flags that sync's field events `DEVICE_CLOCK_OFF`** (6 m 00 s is, 5 m 59 s is not); a back-office record, or one no sync stored, has none. C53 is done with it. Proven by `apps/api/test/sync.test.ts` and the story `p1-queued`'s last step, which syncs through the API's own `Sync`; **every other story's phone still syncs through the stand-in, so its tickets have no sync to read until part 4.** **Raised, not built:** a phone that syncs with nobody signed in learns its lists moved and can't read them (2.6.5 decides whether a proven phone may read the lists of an assignment that names it).
- **The harness's phones sync through `Sync` (task 2.6.2, part 4 of 4, 2026-10-12, ADR-475; agent defaults).** A story's phone reaches the server only through **`story.server`** (`PhoneServer`: the API's `Sync` built as `api-process.ts` builds it, and the intake behind it for a photograph's record until 2.6.4; `story.serverOn(clock)` for field days told again). `SimulatedDevice.sync(server)` sends JSON, read by `syncSentSchema`, and reads the answer by `syncAnswerRead`; with its records it reports the last number used of each series it holds and takes in the blocks answered, the master passcode's version, and whether its lists are stale (`listsStale`). **What a phone sends apart from its day's records is a sync of its own** (`stories/board.ts`: `synced`, `firstBlocks`, `sentAlone`, `unplanned`, `loggedUse`); no story calls `Intake`, `NumberAllocator.topUp`, `UnplannedAssignments` or `PasscodeUses` for a phone, and **a top-up is audited as the device key's actor**. Held field days are whole syncs (`office.syncs`), replayed by `P1Syncs.arrive` with the phone's clock as it sends them. `p1-reviewed`, `p1-voided` and `p1-invoiced` settle the queue after each later sync; **the stories that ask for whole runs by hand, the golden mission among them, leave their syncs' jobs waiting** (Milestone 2.8, C134). The story **`held-for-review`**: two phones racing for one cert number, and a record the database's constraints refuse, each held exactly as sent and never answered "saved". `SyncStandIn`, `SyncIntake` and the context's `intake` are gone.
- **A story's phones go through the API's process over HTTPS (task 2.7.1, part 1 of 4, 2026-10-13, ADR-491, 492; agent defaults).** The task is cut in four (ADR-491): this part; every other request of a story's phone; the worker's own job loop draining each story's queue; the back office's acts and the viewers' reads. **A story's API is the API's process itself** (`ApiProcess` with `ApiModule`; `StoryApi`, `packages/scenarios/src/story-api.ts`) on the story's database, clock and store, started at its first request and stopped at its end, listening at 127.0.0.1:3180, and **reached only over HTTPS through the stack's proxy at `stories.adms.localhost`** (`OverHttps`; the certificate checked against the stack's own root alone, OWASP ASVS 5.0 12.3.2). The installation's own API can't run a story (it keeps `adms` and the real time). **One clock at a time:** `story.phonesOn(clock)` is every request of a story's phones on that clock, the story's API started again on it (ADR-493, in place of part 1's `serverOn`); two requests at once on two clocks stop the story. **A phone proves itself with its own key** and holds the token until it runs out by the clock in use (`story.proofs.proves`); a refused proof is told only `PHONE_NOT_PROVEN`. `story.server`'s sync, file parts and turn-in go through their endpoints; any answer but a 200 stops the story. **A story's setup stays on the setup services** (ADR-491). The golden mission's figures did not move.
- **Every request a story's phone makes goes through its endpoint (task 2.7.1, part 2 of 4, 2026-10-13, ADR-493; agent defaults).** `StoryApi.requests(clock)`: enrolment, a monitor created, a sign-in, a session and the setup's choices under the master passcode, the lists, and part 1's sync, file part and turn-in, each answer read by the contracts' schema. **A phone holds its monitor's session** (a sign-in's, or one opened under the passcode) and a monitor's request carries it in `x-adms-monitor-session` beside the phone's token (NIST SP 800-63B §7.1; ADR-443). The runner's in-process phone services and `phoneNow` are gone; a story is told what the endpoint answered (`TakenAtSignIn`, the contracts' answers). **`story.lists.held` stops the story where the phone takes another assignment than the one named**; the session opened under the passcode is found by phone, monitor and kind (its id isn't told to a phone). `p1-office`'s field days told again take every phone request on their own clock (`phonesOn`); their phones prove themselves in time order.
- **Every story's queue is drained by the worker's own job loop (task 2.7.1, part 3 of 4, 2026-10-13, ADR-494; its defaults confirmed by the user, ADR-495).** `QueueRuns` (`packages/scenarios/src/stories/p1-office.ts`) runs the worker's own `JobLoop` on the story's worker login, database and clock under the release's policy, as `apps/worker/src/main.ts` runs it; **no story calls `Reconciliation.run`**, so every run a story sees works only the tickets its jobs name. `JobLoop.pass()` answers what it did with each project (`ProjectPassed`: the run's own `JobsOutcome`, or the error), which the process ignores. A story settles the queue after a sync, an action or a setup change (`settle`, `settled`: one run's own answer, or the story stops), reads a whole project as it stands from its records (`standing`), and adds by hand only a reprocess a person asks for with nothing changed, or the job beside a correction it still writes by hand (`asked`; no endpoint queues one yet, C144). **The golden mission checks that every run on its two projects took up jobs, none waits and none was set aside** (exit criterion 1), its figures unmoved. ~~`Reconciliation.run` stays, called by nothing, until 2.7.1 closes (C144).~~ Taken out when 2.7.1 closed (ADR-503): every run is the queue's (`waitingJobs`), and `RunOutcome` is one shape, with no `ran`.
- **The back office and the viewers at their browsers (task 2.7.1, part 4, piece 4a, 2026-10-13, ADR-496; agent defaults).** **Part 4 is cut in four pieces:** 4a this; 4b voids, acceptances, corrections, renumbers (`p1-voided`, `p1-left-out`, `p1-reconciled`, `p1-priced`; C144's reprocess); 4c QC, the lock, a batch, the unlock (`p1-invoiced`, `golden-mission`); 4d quarantine, back-office records, a certification's measurement and revocation (`p1-reviewed`, `certification`…), then 2.7.1 closes. **`OfficeBrowser`** (`packages/scenarios/src/office-browser.ts`) is a person at their browser over HTTPS to the story's API on the story's clock: signed in with email, password and the code their authenticator shows now (good once a step: the story stops rather than give a step's code twice, NIST SP 800-63B §5.1.4); a password an admin set changed at once; an admin's or a manager/analyst's authenticator set up at once; **the session held only as the cookies the API sets**, the CSRF value sent past a GET (ASVS 3.5.1); answered `NOT_SIGNED_IN` (the clock moved on), it refreshes, else signs in again, and sends once more. `asked` gives any answer; `answered` a 200 by the endpoint's schema or stops the story. **`story.backOffice`:** `admin(person)` (the first admin's password set on the server, `ServerAdmin.letBackIn`, as `pnpm installer:admin`), `person(by, person)` (the first password set by that admin at `setPersonPassword`), `signedOut`; one browser per person. **No story writes a credential by hand.** Dana and Luis are written with their sign-in addresses (`p1.ts`). **`p1-viewed`:** viewers created, given P1 and their first passwords at the people endpoints; every read at `/viewer/…`, a ticket not shown answered 404; AC-10-30's nobody is the door's refusals (401 signed out, 403 for an admin). `story.viewed` is gone from the context.
- **Voids, acceptances, corrections and renumbers at Luis's browser (task 2.7.1, part 4, piece 4b, 2026-10-13, ADR-497; agent defaults).** `p1-voided`, `p1-left-out`, `p1-reconciled` and `p1-priced` make every void, unvoid, acceptance, correction and renumber at its endpoint as Luis, signed in (`voidTicket`, `unvoidTicket`, `acceptFlag`, `correctFieldEvent`, `renumberFieldEvent`); **no story writes a correction or its job by hand**: the endpoint queues its own, neighbours too. **`p1BackOffice(story, office)`** (`p1-office.ts`): `danas()`, `luiss()`, and `grantLuis(...)`, Dana reading Luis at `readPerson` and stating the whole set at `setPermissions`. **`refusalOf(answer)`** (`over-https.ts`): `403 NOT_ALLOWED` (the door, no words) or `422 NOT_SAVED · CODE: plain words`. An act's answer is `{ record, warnings, queued? }` (`queued`: job ids, a count of tickets, of locked ones), never the service's `reprocess`. ~~**A reprocess a person asks for with nothing changed has no endpoint in Phase 2**~~ (overturned by the user, ADR-498: it has one since 4b2, ADR-499; `QueueRuns.asked` is gone). Still written by hand: `p1-priced`'s and `p1-reviewed`'s locks (4c, 4d).
- **A reprocess a person asks for, and a job set aside (the user, 2026-10-13, ADR-498; built in 2.7.1 piece 4b2, ADR-499).** (1) **A reprocess endpoint:** a back-office person names tickets of a project (at most `JOB_TICKETS_AT_MOST`) and asks for them to be worked again, nothing changed; an admin, or a manager/analyst holding *correct* (no new permission); it changes no record, only queues one `REPROCESS` job naming the person, audited; a ticket locked as invoiced is left as it is by the worker and counted in the answer. It is how a ticket flagged "could not be processed" is fixed once the cause is gone. (2) **A job set aside** (after `JOB_TRIES_BEFORE_SET_ASIDE` whole-run failures) **is logged as an error with the code `JOB_SET_ASIDE`**: what queued it, how many tickets, how many tries, the kind of failure; never the error's text, a name or a ticket's contents. No alert yet. (3) **It is put back through the reprocess endpoint** (its tickets, or the job's id); the old job stays set aside as the record of what failed.
- **The reprocess endpoint and the set-aside line, as built (2026-10-13, ADR-499; agent defaults (a)…(f)).** `POST /projects/:projectId/reprocesses` (`reprocessTicketsEndpoint`, `Reprocesses`): `{ tickets }` or `{ setAsideJobId }`, with a note kept in the audit record; one `REPROCESS` job naming the person, **the tickets alone, never neighbours**; **a ticket locked as invoiced is left off the job and counted** (as `WorkQueue` does everywhere; the worker's own look for a lock is proven by a job queued before the lock, `p1-priced`); refused (`ReprocessAsking`): `TOO_MANY_TICKETS` (over `JOB_TICKETS_AT_MOST`, each counted once), `NOT_A_TICKET` (a named number with no field event of the project in its workflow; not asked of a set-aside job's), `NOT_ON_THIS_PROJECT`, `NOT_SET_ASIDE`; an unknown job is 404. A set-aside job that named no ticket is put back as a job for the project's own records; the job set aside never changes, and nothing links the new job to it but the answer and the audit record. **The worker's line:** one error (level 50) a job set aside, `code: 'JOB_SET_ASIDE'`, `projectId`, `jobId`, `trigger`, `tickets` (a count), `tries`, `failure` (`RUN_FAILED` with `failureKind` and `failureCode`, or `STOPPED_WITHOUT_A_WORD`); never `lastError`, a number or a name.
- **QC, the lock, a batch and the unlock at their endpoints (task 2.7.1, part 4, piece 4c, 2026-10-13, ADR-500; agent defaults).** `p1-invoiced` and `golden-mission` make every QC mark, lock, batch, batch change and unlock at its endpoint (`setQcStatus`, `lockAsInvoiced`, `createInvoiceBatch`, `setLockBatch`, `unlockInvoiced`), as Luis at his browser and the unlocks as Dana at hers, and their voids, acceptances, corrections and renumbers too; their grants are Dana's request at `setPermissions` (`grantLuis`). `p1-priced`'s lock of 101004 is Luis's QC Approved and lock at the endpoints between his reprocess request and the run, which leaves it as it is (the worker's own look for a lock, C147). A lock's or a mark's answer names a unit rate ticket `unitRateTicketId`; the unlock's answer says what it queued (`queued`: one job, one ticket). No exact audit list moved. **Only `p1-reviewed` still makes review acts in process** (4d). What it leaves: C148.
- **`p1-reviewed`'s review acts at their endpoints (task 2.7.1, part 4, piece 4d1, 2026-10-13, ADR-501; agent defaults).** Piece 4d is cut in three: 4d1 `p1-reviewed`; 4d2 the story `certification`'s and `p1-left-out`'s measurement and revocations, `Certifications.measure` out, `first-admin`'s own sign-in parts decided; 4d3 the export trims as 2.7.1 closes. `p1-reviewed` makes every correction, renumber, photograph mark, item line, ROE scope pick, quarantine resolution, back-office record and certification box at its endpoint as Luis at his browser, 101001's QC mark and lock as Luis (no lock written by hand) and the unlock as Dana; every grant is Dana's request at `setPermissions`. **One correction stays in process on purpose:** AC-10-50's, its job queue made to fail over the API's client, which no request can do. An act's answer counts what it queued, so a story reads a job's tickets from its rows (`jobTickets`); a correction to a certification leaves a locked ticket off its job and counts it. AC-08-24's audit count became an exact list, the browser's own `session` refresh left out by name. What it leaves: C149.
- **The two server apps export only what their readers take, and 2.7.1 closes (task 2.7.1, part 4, piece 4d3, 2026-10-13, ADR-503; agent defaults).** `apps/api`'s and `apps/worker`'s indexes are read by two workspaces alone, `packages/scenarios` and `infra/local` (`pnpm local:accounts`: `Settings`, `PasswordHasher`, `TwoStepSecrets`, `OneTimeCodes`), and export what those read and nothing more; `packages/scenarios/test/app-exports.test.ts` fails on any other name, and on an `export *` or a constant. Nothing is kept "as the app's surface": the apps' surface is their endpoints (`openapi.json`). Kept in process on purpose: `Corrections` (AC-10-50's failing queue, ADR-501 (b)), `first-admin`'s sign-in parts (ADR-502 (d)), the setup services, `Certifications`, `NumberAllocator`, `Assignments`, `Phones`. `Reconciliation.run` is gone; every run is the queue's. REQ-206 ticked. What it leaves: C151.
- **A certification's measurement and revocations at their endpoints (task 2.7.1, part 4, piece 4d2, 2026-10-13, ADR-502; agent defaults).** The story `certification`: Dana and Luis at their browsers, his Setup and *correct* her request at `setPermissions`, 730423's sideboards his request at `correctCertificationBox`, 88120's revocation hers at `revokeCertification`; `p1-left-out`'s revocation of 730499 hers too. **`Certifications.measure` is gone**: a measuring mistake is corrected only through `Corrections.certification` (*correct*), which calls `Certifications.measured` in its own piece of work. A height of 0 and a blank revocation reason are the schema's `400` now, before any rule; the story's refused correction is one the rule refuses (`NOTHING_HELD`). **`first-admin` keeps its own `PasswordHasher`, `SessionTokens`, `WrongTries`, `Sessions` and `TwoStepCheck`**: it tells the server's own command, built in process as `apps/api/src/admin.ts` builds it, and its checks read why a sign-in failed (ADR-409: the API answers one `SIGN_IN_REFUSED`).
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
  numbers at every sync, however few it used. **A top-up that loses the race for its series at
  each of its three tries is not taken at that sync** (`SeriesMovedOn`): the phone is answered
  `toppedUp: false` with the blocks it holds, its records saved all the same, and is topped up at
  a later sync; any other failure stays the server's (ADR-505, agent default; the burst found 50
  phones' top-ups at once answered `500`).
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

###### Reconciliation and review — `adms-validation`, `adms-exceptions`
- **The worker's run is built, unpriced (task 1.5.9, 2026-10-05; ⚠️ its `run`, a whole project asked directly, was taken out by ADR-503: a run is now only `waitingJobs`', on the tickets its jobs name, and answers `{ runId, ticketsDone, ticketsFailed, tickets, pending }`):** `new Reconciliation(db, clock, { crewItemHoursLimit, longestRunMs }, mileages).run({ projectId, trigger, requestedById? })` (`apps/worker/src/reconciliation/`) answers `{ ran: true, runId, ticketsDone, ticketsFailed, tickets, pending }` or `{ ran: false, reason: 'RUN_UNDER_WAY' }`. **One run per project at a time**, by a Postgres advisory lock held in a transaction for the length of the run (a run needs two connections). **It reads the whole project once** (`ProjectRead`: every field event that isn't void, the setup, what was concluded before) and **works every ticket**: no queue record exists; what starts a run is Phase 2's job queue. **One ticket is one `db.$write` as the system actor** (`TicketWork` concludes, `TicketWrite` writes): the worker's columns on its field events, its completed load or haul-out with a row for each collection (updated in place; marked dissolved, with its rows, while the ticket isn't whole, and un-marked when it is again), its flags through `Flags.compared`, the run's decision. **Only what differs is written**: a run over unchanged input writes its run and decisions and not one other audit record. **A ticket that errors** gets `NOT_PROCESSED` (once) and a decision with the error, in a piece of work of their own; its status and earlier conclusions stay; the flag clears when it is next worked. **The worker never states a person:** who asked for a reprocess is the run's `requestedById`. **A kept mileage stands until the audit log says an end moved** (the collection's end GPS, the disposal's site, the site's GPS; `MileageStanding`). **Flags on no ticket** (a certification's views, a site's permit, a survey's) are checked for every such record in every run. **A flag on a number no field event is under any longer is cleared.** A load bills from the certification its disposal scanned; a haul-out from the one scanned at the loading end. `reconciledAt` is when the worker last changed its conclusions on the field event. No acceptance is read yet (1.8.x), void field events are left out (1.6.3, 1.8.x), and nothing is priced (1.6). *Agent defaults.* [352]
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

###### Pricing and the ledger — `adms-ledger-audit`
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
- **Setup's endpoints, part 3 of 4: sites, the map, the merge, the setup check and the lookup (task 2.4.2, 2026-10-08, ADR-426).** Six requests more that take `SETUP`: `POST /projects/:projectId/sites`, `PATCH /sites/:siteId` (its name, short code, type, facts, permit, GPS and **its dates**, the close date emptied with `null`), `POST /sites/:siteId/shapes` (GeoJSON, the next version), `POST /sites/:siteId/tipping-fees`, `POST /projects/:projectId/map-versions` (GeoJSON boundary and zones, the next version) and `POST /contractors/:contractorId/merges` (⚠️ retired by ADR-529 (f); the path named the second spelling, the body's `intoContractorId` the one kept). **Three reads take no permission and are open to every admin and manager/analyst:** `GET /projects/:projectId/setup-check`, `GET /projects/:projectId/quantity-lookup`, `GET /sites/:siteId/quantity-lookup`; a read-only viewer is refused (2.4.5), and a project or site nobody has is not found. **A merge queues, per project, the tickets not locked as invoiced and not void whose field events carry a certification it moved** (`ContractorSetup` is made with `(db, clock, policy)`); the worker then writes the contractor kept on their lines. A map or a shape `MapShapes` can't read is `NOT_SAVED` with the reason `MAP_NOT_READ` or `SITE_SHAPE_NOT_READ`; a shapefile is not read yet (2.6.4, C100). A site's GPS travels as a string of exact decimals. An answer says the version saved, never the shapes. Nine more of the database's refusals have plain words (a site closing before it is activated among them). Not built, no service: a site's label, archiving a site or a link, reading sites or maps (BACKLOG C100).
- **Setup's endpoints, part 4 of 4: the firm's people (task 2.4.2, 2026-10-08, ADR-427). Task 2.4.2 is done.** Four requests more on `People`: **`GET /people`** (an admin or a manager/analyst; those in service, or `archived=true`; one `role`; in the order added; `limit` 50 unless said, 200 at most; `next` is the `after` of the page that follows; a monitor's phone number in an admin's answer only; never the system actor), **`PATCH /people/:userId`** (an admin; only what is stated: name, phone (null clears it), email (changed, never cleared), and on a read-only viewer the kind, the contractor and `seesPrivateCitizens`; nothing written where nothing differs; `EMAIL_HELD`, `NOT_A_VIEWER`, `UNKNOWN_CONTRACTOR`; an archived person is not found), **`PUT /people/:userId/role`** (an admin; **between admin and manager/analyst only**, else 422 `NOT_BACK_OFFICE`: a monitor who joins the back office is created there; the only admin stays one, 409 `LAST_ADMIN`; the next request is asked as the new role; what a manager/analyst was granted stays beside them and is theirs again if made one again) and **`POST /people/:userId/unarchivings`** (an admin; the person they were, with what they held and no session; `EMAIL_HELD` while somebody in service signs in with their address; one in service is not found). **Where a sign-in address changes, the old one is told if the firm has mail, never the new one** (ASVS 5.0 6.3.7). **The database's last-admin guard answering in a race is now 409 `LAST_ADMIN`** on an archive and a change of role, not an internal error. People's endpoints stay an admin's alone but for the two reads. Tests: `apps/api/test/people-changes.test.ts`, `packages/domain/test/people.test.ts`. What it leaves: BACKLOG C101. *Agent defaults.*
- **Every setup record changed (task 2.8.5, 2026-10-15, ADR-527; its defaults answered by the user, ADR-529).** Requests each taking `SETUP` (but the people's and the board's, which take an admin and `DISPATCH`; a project's close, closing check and reopening, an admin's alone), each audited by the database with the value before, each queueing what it moves (ADR-420): **a client, a declaration event and a contractor** `PATCH`ed (contacts and notes cleared with null; **a prime's name is changed on its contractor record**); **a contract**'s name and link (**its prime never changes**: a contract has one prime, a project may have several, ADR-529 (c)); **searches paged** in name order (`after`, `limit` 50/200, `next`; no `archived`); **a form** `PATCH /forms/:formId` (name, GPS required on the ROE form, an incident's offers; **no Enabled**: the day's assignment says which forms a person may make, ADR-529 (d)); **a debris type's entry** changed (its form's workflow queued); **every list's value** (`/lists/:list/values/:valueId`, the firm's 17 lists and a project's field tags) renamed, archived, put back, **and added** (`POST /lists/:list/values`, each list's own settings stated) — a built-in value never archived (`BUILT_IN_KEPT`); archiving one archived, or putting back one in service, writes nothing; **a pay item**'s band asked again on a change; **a crew day's steps** `PUT` whole (two sharing an hour refused, `CREW_DAY_STEPS_OVERLAP`); **a site's labels** given (`PUT /sites/:siteId/labels/:siteLabelId`) and **removed** (`…/removals`), **its tipping fee link** linked and **removed** (`…/tipping-fees/:payItemId/removals`), both audited, never deleted; **people**: an employer and its ID set and cleared, an email cleared only on a monitor (`EMAIL_SIGNS_IN`); **dispatch**: a withdrawal's note, `POST /assignments/:assignmentId/reinstatements`. **Archiving is only where something must stop being offered (ADR-529 (g)): a person who left, and a list's value**; a client, a declaration event, a contractor, a contract, a debris type's entry, a pay item, a rate, a rule and a site are not archived at the API (each has its own switch, or is history). **The contractor merge is retired (ADR-529 (f), amends ADR-108):** two subs on a project whose names are alike once case, spaces, punctuation and a company ending are set aside flag each certification naming either (`SUB_NAME_ALIKE`, raised by the worker, bills untouched); a person corrects the sub (task 2.8.7) or accepts the flag. **A closed project is closed (ADR-529 (b), amends ADR-367):** an admin reads what is still open (`GET /projects/:projectId/closing-check`: phones not turned in, tickets not QC Approved or not invoiced, held and quarantined records) and closes it, those items said with the close and never stopping it; only jobs the worker still has for it refuse it (`PROJECT_WORK_UNDER_WAY`); at the close its assignments are withdrawn ("Project closed.") and its issued number blocks retired; **the database refuses every change to the project's records after** (`project_open_guard()` on its tables and the records under them; `422 REFUSED_BY_THE_DATABASE`, "Not saved: the project is closed, and nothing in it changes."), but for a viewer's grant, a held record, a file set aside and a photograph kept with a held record; **field work for it arriving later is held** (`PROJECT_CLOSED`, "… was closed on 12-Oct-2026, before this arrived. Held on the server for review."); a second close answers as it stands; **an admin reopens it with a reason** (`POST /projects/:projectId/reopenings`, `PROJECT_NOT_CLOSED` if it isn't), audited, and the database lets only `closed_at` change then, with a reason. A close is a deliberate exception to "flag, never block", which is about eligibility. Services: the setup services, `ListSetup` and `FormSetup` queueing, `SetupService.asAdmin`; rules: the domain's `ListValues`, `CrewDaySteps`, `ProjectClosing`, `SubNames`, `CertificationChecks.subs`, `AssignmentRules.putBackRefusal`, `NotSaved.projectClosed`. Migrations: `setup_records_changed` and its guard (ADR-527); `before_a_forms_enabled_is_dropped`, `projects_closed_and_sub_names_alike`, `guard_a_closed_project_stays_closed` and `guard_a_closed_projects_check_names_its_project_plainly` (ADR-529). [527, 528, 529]
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

###### Agent tooling and terms
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
- **Phase 2 is reopened (ADR-519), Milestone 2.8; Phase 3 waits on its exit again.** An exit never moves the phase's own server work to a later phase by agent default, and never leaves a "no task yet" standing (ADR-519). **The register was swept by task 2.8.1 (ADR-522):** each of 2.8.2…2.8.8 names its full list on its line in `BACKLOG.md` ("Filed by the sweep"); the viewers' reads of the records 2.8.8 reads are in it; a `LOOKED_UP` address takes the phone's word. [519, 522] *What stood here, ADR-518's, kept until 2.8.9:* ~~No phase is active: Phase 3 (the field app) is the user's to open (ADR-518).~~ Phase 2's exit
  was met on 2026-10-14: 13 of its 14 REQs ticked and REQ-006 moved to Phase 3; 119 of 119
  scenarios with a Phase 2 part proven at the API; the checklist with none to do (6.3.3 owned by
  Phase 4, REQ-408); the chain green, the golden mission unmoved. Phase 3's REQs are refreshed
  against what was built (each says what the server already does), with REQ-322 (certifying on a
  phone), 323 (the field app's MASVS checklist) and 324 (accessibility, its standard the user's to
  pick before the first screen) new; the register is mapped to them (BACKLOG, "For Phase 3"). A
  phase exit moves a requirement whose rest is a later phase's, never ticks it (ADR-371). [518]
- **Phase 2 (API and sync) was opened by the user on 2026-10-06 and met its exit on 2026-10-14
  (ADR-518)** ("phase 2 is open, begin working on the next task"). **It adds no rule: it wraps, signs in, queues and
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

##### 2. Superseded — never cite these for a current rule

| Old | Replaced by | What changed |
|---|---|---|
| 497 (4), "a reprocess a person asks for with nothing changed has no endpoint in Phase 2" | 498 | It gets one in Phase 2 (an admin, or a manager/analyst with *correct*; it queues a `REPROCESS` job and changes nothing); a set-aside job is put back through it |
| 481 (agent default (d)), "a photograph whose record the server doesn't have saved is held, never tried" | 526 (4) | A photograph whose record is held for a person is saved and kept with it (`held_record_id`), its files taken; only one whose record is nowhere is held |
| 464 and 472 (agent default), "a report answered `NOT_SAVED` is not held" | 526 (5) | Held for a person (`REPORT_NOT_SAVED`), at a sync or at its own endpoint, so a phone holding one can be turned in |
| 488 (3), what turn-in confirms | 526 (6) | It also confirms a report held, a photograph a person closed where held, and one whose missing file has a file set aside a person closed |
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
| 530 (9)'s `keyRevokedToo` and "only a phone the firm's time revoked proves itself with the passcode"; 530 (15) "a proven phone with nobody signed in reads no lists" (all it decided); 473 (1) "a sync is open to a proven phone with nobody signed in"; 472 (1) "nobody need be signed in"; 443 / `MONITOR_SESSION_HOURS` 12 | 531 | `outOfServiceToo`: a phone out of service or with the passcode at its proof reaches only what it sends, its turn-in and its read of itself; any phone may prove itself with the passcode; **nothing is sent with nobody signed in** (`PHONE_IN_USE`); a sign-in made offline is proven to the server; a monitor's sign-in lasts the firm's hours, 24 as shipped (the user) |

---

##### 3. Open gaps — code that doesn't match the rules yet (build work)

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

##### 4. Waiting on the user

**Live today (2026-10-07, ADR-376…420):**
- **Agent defaults of the API's first code (ADR-380, 385), moved here from `ROADMAP.md` (ADR-516):** NestJS 12 (six weeks old then) rather than 11; the health check says only that the server answers; an error says a plain code and a request id.
- **Phase 2 is reopened at your word (ADR-519); the next task is 2.8.7** (2.8.6, a lost phone's key after the firm's time and the firm's settings, done: ADR-530; 2.8.1, the sweep, done: ADR-522; 2.8.2, a sync told to wait, done: ADR-524; 2.8.3, the object store's own servers closed, done: ADR-525; 2.8.4, what is held for a person resolved, done: ADR-526; 2.8.5, setup records changed and a map from KML or Esri, done: ADR-527, 528). ~~Nothing blocks, and no build task is open: Phase 3 is yours to open (ADR-518).~~ Phase 3's first question for you, when it opens: the accessibility standard and level (REQ-324, C41).
- ✅ **Answered by the user 2026-10-14 (ADR-520), kept for the record: the clock starts when the phone was marked lost or retired (the later mark), its last sync not counted; the recommendation below taken.** ~~ADR-519 (7), for you to confirm before task 2.8.6 builds it~~: your #4 as read. A phone's key is revoked at its turn-in, as now. **The backstop covers a phone taken out of service (lost or retired) whose own turn-in hasn't revoked its key; a phone in service is never revoked for going quiet** (it is enrolled once and may sit idle for days). **By default 24 hours after the later of its last sync and the moment it was marked out of service**; a firm-wide setting in hours, or off, changed by an admin or anyone holding Setup, audited; the worker revokes it, retires its numbers and writes a security event. **Open:** records still on a phone revoked this way can't reach the server; *recommended:* such a phone may still sync and be turned in under the master passcode, what it made after its removal flagged as today.
- ✅ **Confirmed by the user (ADR-520):** ~~ADR-519 (3), an agent reading:~~ the reads the register names ("no task yet") are built in Phase 2 (task 2.8.8), not with their screens in Phase 4.
- **Agent defaults of ADR-531 to confirm or overturn:** (a) **a sign-in made offline is taken once**: reported again (an answer lost), it is refused and the monitor signs in online; (b) **how long a monitor's sign-in lasts is changed by an admin alone** (sign-in policy, as the viewers' two-step), not by Setup; (c) **a sign-in made offline under the passcode is taken only by the version in force**: one made under a passcode changed since is refused; (d) **any phone may prove itself with the passcode beside its key** (the master user at it): on a phone whose key stands its token is the key's proof with the master user besides (key and passcode never less than the key alone); a phone the firm's time revoked reaches only what it sends and its turn-in, as before.
- **Agent defaults of 2.8.6 to confirm or overturn (ADR-530):** (a) **a phone revoked by the firm's time proves itself with its key and the passcode together**, its token opening only its sync, its files, its reports and its turn-in; (b) **the firm's hours run to a year at most**; (c) **the viewers' two-step changed by an admin alone**, the hours by an admin or Setup; (d) **a viewer is sent to set one up at their very next request**, not only at their next sign-in; (e) **a phone whose key is revoked is never put back in service** (enrolled anew); (f) **the phone-removal reasons shipped**: Lost in the field, Stolen, Broken, Replaced (a new installation's); (g) ~~a proven phone with nobody signed in reads no lists or login list~~ **answered by the user, ADR-531: wider: a phone with nobody signed in sends nothing either** (no sync, no file, no report); lists stay a monitor's online; (h) **the worker never ends a revoked phone's sessions** (sign-in's records stay the API's; they are dead with the key).
- **Agent defaults of 2.8.2 to confirm or overturn (ADR-524):** (a) **the database busy is `503 BUSY` with `Retry-After`, not `429`** (RFC 9110: 503 is the server's temporary overload, 429 a caller over its own rate); (b) **a piece of work that ran past its time, or a statement stopped by its limit, is told to wait too** (nothing of it was kept), and logged as an error so a piece of work that always runs too long is seen; (c) **the 2 s wait for a connection and the 5 s a piece of work may run stay Prisma's own**, now stated (the burst never came near them at the pool of 10); (d) **a caller told busy waits 5 s**, the same for everyone, not a time drawn at random; (e) **a shape of a shapefile with more than fifty million pairs of outer rings and holes isn't read** (`MAP_FILE_RING_PAIRS_AT_MOST`, a policy value); (f) **a boundary of 100,000 corners costs a run about 2.3 s, once**: left as it is; (g) **a second turn-in at once, and a top-up after the turn-in, are told the phone is proven no more** (`401 PHONE_NOT_PROVEN`), the phone's own sign that it was turned in.
- **ADR-527's agent defaults, answered by the user (ADR-529):** (a), (b) archiving trimmed to a person and a list value (archiving one archived writes nothing); **a closed project is closed** (read-only, held by the database; late field work held; an admin closes, seeing what is open, and reopens with a reason); (c) a contract's prime never changes, a prime's name is changed on its contractor; (d) a form's Enabled dropped; (e) kept; (f) the merge retired for the flag `SUB_NAME_ALIKE`; (g) moot (contractors aren't archived); (h) an Esri token never kept (the agent's call, deferred to by the user); (i) kept; (j) confirmed. **Agent defaults within ADR-529 to confirm or overturn:** (1) **a close is refused only while the worker still has jobs waiting for the project** (its open records never stop it); (2) **a viewer's grant to a closed project still changes** (an auditor given it later), and a held record, a file set aside and a photograph kept with a held record are still written, being no records of the project; (3) **a sub's names are alike** once case, spaces, punctuation and a company ending (LLC, Inc, Co, Corp, Company, Ltd…) are set aside.
- **Agent defaults of 2.8.4 to confirm or overturn (ADR-526):** (a) the three reads open to every admin and manager/analyst, whatever they hold; (b) **correct** to save a held record as corrected, **void** to close one or a file set aside, a reason required for each; (c) a record saved from a held one keeps the id its phone made, never one without (that is entered in the back office and the held one closed); (d) a report and a file set aside are closed only, never saved; (e) **a photograph whose record is held is kept with it and answered saved**, so its file reaches the server; (f) **a report the server can't keep is held**; (g) a held photograph closed lets its phone be turned in and wipe its file.
- **Agent defaults of 2.8.3 to confirm or overturn (ADR-525):** (a) **the object store's servers on its container's loopback behind a TLS Caddy of its own**, rather than the store on a network of its own with Caddy alone (which would leave all ten ports open to Caddy); (b) **`weed server` in place of `weed mini`** (only `server` binds S3 apart from the rest; `mini` keeps its admin's gRPC on every interface); (c) **S3 plain on the loopback**, its own TLS dropped (the sidecar's is the hop, as for Valhalla); (d) **the sidecar believes the forwarded name only from the stack's proxy**, by its fixed address; (e) **door takes a reset limited (`429 LIMITED`) as a pass**; (f) **AC-10-32's real sign-in and enrolment are read in the API process's own log**, the container held to log the same, never made through the container.
- **Agent readings and a default of 2.8.1, the sweep (ADR-522), to confirm or overturn (with the rest at 2.8.9):** (a) **the viewers' reads are built in 2.8.8 beside the back office's** (ADR-520 (3) read as reaching the portal's reads ADR-434, 435 had left to Phase 4); the exports and a page's filters stay Phase 4's; (b) **an address a phone sends as looked up is taken at its word**: nothing of a lookup is kept to check it, and a reviewer corrects it like any field; (c) **left named rather than built in Phase 2:** the harness's tower phone asking its site's quantity lookup (the phone's, REQ-124f). ~~and an Esri layer fetched by the server, kept with KML under REQ-124b~~ ✅ **answered by the user (ADR-523): KML and an Esri layer link move into 2.8.5.**
- **Agent defaults of 2.7.4, Phase 2's exit (ADR-518): (b) and (c) overturned by the user, and (a) only for the web apps (ADR-519): C157 and C162 (a), (c) are Phase 2's again.** Was: (a) **REQ-006 moved to Phase 3, not ticked**: it says "every service", and the web apps aren't built; it is ticked when the field app's browser build is served through Caddy, and the object store's own servers stop listening in plain HTTP on the stack's network first (C162 (a)); (b) **the firm's choice of two-step for read-only viewers (your answer, ADR-511) is built with the read-only portal in Phase 4 (REQ-408)**, not now: no viewer signs in to a page before the portal exists (ASVS 6.3.3 is now owned by Phase 4); (c) **a sync that waits too long for a database connection under a burst, answered 500 today, is Phase 3's with the sync queue (REQ-308)**, the server's half first with its own ADR (C162 (c)); (d) **three Phase 3 requirements added**: certifying on a phone (REQ-322), the field app's security checklist, OWASP MASVS (REQ-323), and accessibility (REQ-324); (e) 32 scenario rows still reading "in part" though later Phase 2 tasks had built their rest were read and marked whole at the exit, each with its test.
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
- **Agent defaults of 2.7.3 part 1 (ADR-508):** (a) **2.7.3 cut in three** (the checks; the checklist by number; AC-10-27 and REQ-204 read whole); (b) **REQ-205 read as the running product**: three tools reach Postgres by name and reason (the installer, the scenario harness, the dev stack's accounts), as ADR-266 (3) read §18 for the installer; (c) **"no hand-written SQL for modelling" held as** the product's SQL only tagged templates changing no schema, and the migrations' tables all declared in the Prisma schema; (d) **the secrets scan's new kinds**: a whole Argon2 hash, an authenticator's secret, a private key as a JWK; a session's or phone's token left out (signed by the checked secret, minutes long); (e) **a test's vector marked by a reasoned `secretlint-disable-next-line`**, six marked.
- **Agent defaults of 2.7.3 part 5 (ADR-517):** (a) **the stack makes its own root** (P-256, ten years; each service's certificate a year, its exact names) and Caddy issues from it, written by our own few lines of DER rather than a new dependency or the machine's `openssl`; (b) **a container's own loopback is not a hop** (a health check inside it; Valhalla behind its own Caddy); (c) **Valhalla gets a Caddy of its own** in its container's network, since it speaks no TLS; (d) **Postgres keeps the image's `local … trust`** on its own socket (inside the container alone) and drops its TCP trust; (e) **three hardening departures** as each image needs (Caddy's file capability, Valhalla as root, the address server's sudo and writable root); (f) **a map-server answer may be 256 KiB**; (g) **the API's certificate paths are written into `apps/api/.env`** beside the other roots' (paths, not secrets).
- **Agent defaults of 2.7.3 part 4, third piece (ADR-515):** (a) **the written answers live on the checklist's own page** (§5), only every way in in ARCHITECTURE §6, as §3.1 said; (b) **the data's four levels** (secrets, personal details, the firm's business, evidence) and what protects each; ~~(c)~~ **settled (ADR-516): the user left it to the agent's judgment, and replacing a key in place stays Phase 5a's** (REQ-517: how a key is replaced depends on where the deploy keeps it); ~~(d)~~ **agreed by the user (ADR-516): the map servers' answers held as the address server's are, the mail sender's tested**, both built in part 5; (e) **the 25 earlier built items cite a test, not a file 10 row each**.
- **Agent defaults of 2.7.3 part 4, second piece (ADR-514):** ~~(a)~~ **researched at the user's word and kept (ADR-516): Microsoft Authenticator, Authy and Duo compute SHA-1 whatever the link says; NIST SP 800-131A Rev. 3 (draft) keeps HMAC-SHA-1 generation until 31 December 2030; read again before 2031 (REQ-517).** Was: an authenticator's code stays HMAC-SHA-1, proposed as 11.4.1's departure: authenticator apps read the algorithm an `otpauth` link names unevenly, and many take SHA-1 alone; the code is a 160-bit random seed's, good once and for thirty seconds; (b) **`eqeqeq` with `== null` kept**, the one loose comparison, meaning "null or undefined"; (c) **4.2.1's local half moved to part 5**, which reworks those containers for its certificates anyway; (d) **part 4 cut again**: this piece the marks (not used, a phase, built); the next the 14 written answers, §2's 25 built rows and API10's answers.
- **Agent defaults of 2.7.3 part 4, first piece (ADR-513):** (a) **the door logs its refusals at `warn` with a person's or a phone's id** (an id is not personal; a name, a Monitor ID, a session's id and a token never), the boundary its own at `info` with the endpoint alone; (b) **a whole number is held to Postgres's `integer` by its schema**, not to the column's own rule, which keeps its plain words (ADR-424); (c) **only JSON and a file part are read**, the framework's form parser and Fastify's plain-text parser off; (d) **AC-10-27, 30, 35 and AC-04-24 read as answering 6.3.4, 8.1.1, 8.1.2 and 1.2.2**, and 1.3.6 and API7:2023 as answered whole with AC-10-64; (e) **15.3.2's test moved to part 5**, where the stack's own certificates give a test an HTTPS server of its own; (f) **part 5 added to 2.7.3** for KD-78, before 2.7.4.
- **Agent defaults of 2.7.3 part 3 (ADR-512):** (a) **a fourth part added to 2.7.3**: the 78 open items as the user answers them, the approved scenarios built with their tests; (b) **REQ-204 ticked with its same-origin clause moved to REQ-517** (no web app in Phase 2; the clause is how the deploy serves the back office); (c) **the endpoint list held exact in a test**, so opening an endpoint wider is a change a person reads; (d) **every request asked with a body or query no schema takes**, so the door's verdict is tested apart from each service (what each caller is shown stays each endpoint's own test); (e) **a story stopped on a 5xx ends with its API's last five error lines**; (f) **the 78 proposed answers** (`spec/CHECKLIST-API.md` §3.1): the user approves or changes each; (g) **KD-78 recommended (b)**: reword ARCHITECTURE §4 for the local stack, and 5a encrypts every hop that crosses hosts.
- **Agent defaults of 2.7.2 part 4 (ADR-507):** (a) **`/health` stays liveness**, the process alone, so a database away never marks the API's container unhealthy; (b) **`GET /readiness` to anybody**, up or down only (503 `UNAVAILABLE`), callers sharing one question; (c) **its bound is `STATEMENT_TIMEOUT_MS`**, no new value; (d) **the worker's answer is 503 with `NOT_YET_LOOKED`, `QUEUE_NOT_READ` or `STALLED`**, figures `null` before a first look, and adds `oldestJobWaitingSeconds`; (e) **the stall bound derived** (twice a run's longest, a map answer, a wait: 20 min 35 s); (f) **a backlog is a figure, never a verdict** (no threshold added); (g) **`installer:check` asks `/readiness`**; (h) **C38 split**, its rest (alerts, the worker's answer from outside its host, sync failures as a rate, backups, storage) re-filed to 5a.
- **Agent defaults of 2.7.2 part 3 (ADR-506):** (a) **200 tickets a run stays** (a run of 200 took 1.2 to 1.7 s, 0.2 s of it what every run does; larger saves little and holds the project's lock longer); (b) **a job a run already covers is taken up with it** (the burst: 5 runs and 1,000 tickets worked instead of 19 and 3,800); (c) the API's and the worker's `JOB_TICKETS_AT_MOST` keep one name, read apart in `policy.env`'s note; (d) the neighbour read's scans by certification number and scale receipt stay unindexed until a project's size is measured to need it (C154); (e) what it took written down, never a threshold.
- **Agent defaults of 2.7.2 part 2 (ADR-505):** (a) **the burst's size (05-sync's open point 12): a day of one project at its peak, a thousand loads** (ten by each of a hundred trucks), fifty collection monitors and four towers, every field event photographed and the towers' with a depth file, all 54 phones syncing at once from one address, the story's clock standing still while the API answers; (b) **a phone answered `429 LIMITED` waits the seconds the answer says, from when it sent, and sends the same again under the same ids**; ten waits in a row for one request is a fault, not a busy server (the field app's rule too, Phase 3); (c) **a top-up that loses the race for its series at all three tries is answered not topped up**, the phone keeping its block until a later sync, where before the sync was answered `500`; (d) what the burst took is written down (ADR-505), never asserted as a threshold.
- **Agent defaults of 2.7.2 part 1 (ADR-504):** (a) **task 2.7.2 cut in four**: the weight, the burst (a story at a real project's size), the queue at that size, health; (b) **a sync weighs a mebibyte at most, and no installation's body limit is under it** (one stating less doesn't start); (c) **a record weighs 256 KiB at most as sent**, a heavier one read as no record and held for a person; the field app (Phase 3) keeps a record under it as it is made.
- **Agent defaults of 2.7.1 part 1 (ADR-491, 492):** (a) the task's cut in four, and **a story's setup left on the setup services**; (b) **a story's API is the API's process run by the stories on this machine**, on the story's database and clock, not the installation's container, reached through the stack's proxy at `stories.adms.localhost` (port 3180, `host.docker.internal`); the hop from the proxy to it plain HTTP on the machine, as the hop to the API's container is on the stack's network; (c) one clock a process: `serverOn` starts the story's API again on its clock (since ADR-493 `phonesOn`, every phone request on it); (d) a story's phone holds its token until it runs out and proves again once when told it isn't proven; (e) the API's log in a story goes nowhere, no proxy believed, no browser origin; (f) a refused proof is checked by the API's one code, the reason read from the database instead.
- **Agent defaults of 2.7.1 part 2 (ADR-493):** (a) **`story.lists.held` checks** that the phone takes the assignment named, and stops the story otherwise; (b) **`phonesOn(clock)`** in place of `serverOn(clock)`: every phone request of a story on one clock; (c) a session opened under the passcode found by its phone, monitor and kind, since a phone is told only its token; (d) `apps/api`'s index keeps exporting the phone services the stories no longer call, until 2.7.1 closes.
- **Agent defaults of 2.7.1 part 4a (ADR-496):** (a) **part 4 cut in four pieces** (4a…4d); (b) **the first admin's password set on the server** by `ServerAdmin.letBackIn` in process (the server's own command; no endpoint makes a first admin), every other person's first password by an admin at its endpoint; (c) a story's passwords made up, never shown; (d) a browser renews on `NOT_SIGNED_IN` (refresh, else sign in again) and sends the request once more; (e) one browser per person in a story; (f) AC-10-30's "nobody reads nothing" checked as the door's refusals (401 for a browser nobody signed in at, 403 for Dana) where the service answered nothing; (g) `story.viewed` taken out of the story's context.
- **Agent defaults of 2.7.1 piece 4c (ADR-500):** (a) `p1-invoiced`'s and the golden mission's voids, acceptance, correction and renumber moved with their QC and locks, so neither calls a review service in process; (b) the golden mission's grants are Dana's request at `setPermissions`, not written by hand; (c) the checks that moved say what the endpoint answers (the door's 403 with no words for a missing grant, a rule's 422 with its words, ISO times, `unitRateTicketId` with the lock's kind read from its row, the unlock's job read from the queue), none loosened; (d) no exact audit list moved.
- **Agent defaults of 2.7.1 piece 4d3 (ADR-503):** (a) nothing kept "as the app's surface": each server app's index exports only what `packages/scenarios` and `infra/local` read, held by a test; (b) `Corrections` stays exported for AC-10-50 rather than that check moving to an API test; (c) the `workspace` constant goes from the two apps; (d) `Reconciliation.run` taken out rather than kept, and REQ-206 ticked on it.
- **Agent defaults of 2.7.1 piece 4d2 (ADR-502):** (a) the story's refused box correction is the dog box typed 3,000 long (`NOTHING_HELD`), a height of 0 being the schema's `400` now; (b) a blank revocation reason checked as the schema's `400 BAD_REQUEST` with 88120 left unrevoked, the rule's words proven in the domain's tests; (c) AC-03-51's exact audit list is Luis's rows after he signs in, `session` left out by name; (d) `first-admin` keeps its own sign-in parts, and so they stay exported.
- **Agent defaults of 2.7.1 piece 4d1 (ADR-501):** (a) piece 4d cut in three (4d1 `p1-reviewed`; 4d2 `certification`'s and `p1-left-out`'s measurement and revocations, `measure` out, `first-admin`; 4d3 the trims); (b) AC-10-50's failing job queue stays an in-process call of `Corrections`, and its refused correction is a request whose fix the schema reads and the rule refuses; (c) P2's setup, the merge and the certifications stay setup and phone services in process, as in every story; (d) the checks that moved say what the endpoint answers (the door's 403, a rule's 422 with its words, a job's tickets from its rows, a back-office record's maker, phone and status from its insert's audit record, `takenOffAt`), none loosened; (e) AC-08-24's count became an exact list, the browser's `session` refresh left out by name.
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
- **Agent defaults of 2.4.4 part 4 to confirm or overturn (ADR-433):** **(a) overturned by the user (ADR-521): the back office enters a certification from the paper sheet when a phone failed (task 2.8.7).** Was: (a) **the back office can't make a certification or replace one by a request**: certifying is a monitor's, on a phone, and arrives by sync; say so if the back office should be able to enter one from a paper sheet when a phone failed, as it can a field event (ADR-156); (b) **marking signatures on file takes the *QC* permission** (it is marked at QC, ADR-080), not one of its own; (c) a measuring correction's request changes a box's measurements only: never its shape, its add/subtract mark or its feature, and no box is added or taken off (no service does; a box entered wrong that way has no fix yet short of certifying again); (d) the answer leaves out the driver's phone and licence number; (e) revoking again states the day and reason anew, and nothing un-revokes.
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
  two are placed differently on one project (⚠️ retired by ADR-529 (f): a flag, `SUB_NAME_ALIKE`, instead); **"replaced on" is the day the new certification was
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


### From `agent_store/BACKLOG.md`, from Milestone 2.0 to the end as it stood (every task's full tick, Phases 1 and 0, the carry-forward register C1…C170 with its struck items, the historical H1 closeout)

###### Milestone 2.0 — Open the phase
- [x] **2.0.1** ✅ **done 2026-10-06 (ADR-376, 377):** the phase opened at the user's word; this
  plan; Phase 2's 14 REQs moved into `REQUIREMENTS.md`; the state files turned to Phase 2.

###### Milestone 2.1 — The answer and the foundation (ARCHITECTURE §6, §16)
- [x] **2.1.1 The threat model and the API's scenarios** ✅ **done 2026-10-07 (ADR-379):**
  `spec/THREAT-MODEL.md` (36 threats over six layers) and `spec/acceptance/10-api-and-sync.md`
  (56 scenarios, AC-10-01…56; the 48 earlier ones each with its task; 17 points left to the tasks
  that build them, register C84). Both are drafts for the user's approval. The `pnpm-workspace.yaml`
  step was not due (12:07 UTC): it is the first step of 2.1.2. *(docs; for the user's approval, building
  doesn't wait, ADR-230)*. `spec/THREAT-MODEL.md`: who attacks what, over the layers of
  ARCHITECTURE §2 (a guessed monitor password, a copied phone, a stolen session, a contractor's
  login reaching another prime's tickets, a replayed sync, a forged load call, a poisoned upload,
  a leaked log), each with the control that answers it and where it is tested (C40 (a), "before
  Phase 2's API is built"). `spec/acceptance/10-api-and-sync.md`: scenarios for what ARCHITECTURE
  §6, §7.4, §9 and §13 decide and no scenario states yet (sessions and cookies, CSRF, back-off and
  lockout, the CORS list, rate limits, validation at the boundary, what an error says, headers,
  logs, the job queue), written as `spec/acceptance/README.md` says; plus **the list by ID of
  every existing scenario with a Phase 2 part** (48 rows name Phase 2 today, 37 of them as "API
  (Phase 2)") and the task that proves each. Each scenario names the checklist item it answers
  (OWASP ASVS Level 2, API Security Top 10, NIST SP 800-63B). A scenario never states a rule
  nothing records: what isn't settled is listed for the task that decides it. **Done when:** both
  pages exist, every Phase 2 scenario has a task, the README's table has file 10's row.
- [x] **2.1.2 The API as a process** ✅ **done 2026-10-07 (ADR-380…385):** NestJS 12.1.2 on Fastify 5.12.5, the seventh service of the local stack (Node 24.21.0's own image, the built code mounted read-only, no port published), reached at `https://api.adms.localhost` through Caddy; `Settings` (a missing or malformed key stops the start, named, never its value); the structured log (a request as its method and path, an error as its kind, the server's own request id); one error filter (`{ code, requestId }`); `GET /health` → `{"status":"ok"}`; `pnpm local:up` builds and starts it once the installer has run, `pnpm installer` starts it, `installer:check` asks it. Seen: the health answer over HTTPS, the 308 from plain HTTP, 84 files and 1,792 tests, AC-10-01, 02, 03, 33, 55 passing and AC-10-32 in part. ADR-372's owed step done first. What it leaves: C85. Was: NestJS on the Fastify adapter (ARCHITECTURE §3; versions by
  ADR), `apps/api` gets a `main` beside its services; its settings read once from its env file and
  checked (a missing or malformed one stops the start, naming the key, never the value);
  structured logs with a request id and no secret, token, password or full personal detail (a test
  reads them); a health answer; one error filter, so no stack trace or internal error leaves the
  server. Served only through Caddy at `https://api.adms.localhost` (C24), no port published;
  `pnpm local:up` and the installer take it in. The API test layer joins the one Vitest run.
  **REQ-006** re-checked for the API (it is ticked when the last web app has joined: Phase 4).
  **Done when:** the health answer is seen over HTTPS through Caddy, plain HTTP is redirected,
  and the chain is green with the new counts.
- [x] **2.1.3 The boundary** ✅ **done 2026-10-07 (ADR-387…392):** every endpoint said once in `packages/contracts` (`endpoints.ts`), served only through `@Serves`, its path, query and body read by its schemas at `Boundary` before any controller runs (an unnamed field, a part the endpoint doesn't name, a route no endpoint names: refused); `ADMS_CORS_ORIGINS`, exact origins matched whole; the API's own headers on every answer and `X-Request-Id`; a body of one mebibyte at most, the policy value `REQUEST_BODY_LIMIT_BYTES`; the request id stated on every write through the API's database client; `pnpm openapi` → `apps/api/openapi.json`, held current by a test. No dependency added. Seen: 87 files and 1,852 tests, AC-10-04…08, 34, 36, 39, 43 passing, 21 loosenings caught. What it leaves: C86. Was: Every body, query and path validated by its schema from
  `packages/contracts` (unknown fields refused, size limits); plain error codes; HSTS and the
  security headers; **the CORS allow-list of exact origins from configuration**, tested with an
  origin on it, one off it and a look-alike (no wildcard, no pattern; ADR-098); the request id
  carried into `db.$write`; **OpenAPI generated from the contracts** by one command and checked
  current in the chain (C23). **REQ-004** starts here and is ticked when the last payload has its
  schema (2.6.1). **REQ-204** in part.
- [x] **2.1.4 Time limits and policy for the services** ✅ **done 2026-10-07 (ADR-394, 395):** the policy value `STATEMENT_TIMEOUT_MS=30000`, set by `pnpm installer` on `adms_api`, `adms_worker` and `adms_readonly` (never the owner) on a first run and a rerun, read by `installer:check` signed in as each login (25 `✓` with the owner's line, ADR-396), asserted by `configuration.test.ts` and `actor.test.ts`; an installation may state its own value for any policy value in a service's own settings (C53 decided). No dependency, no migration. Seen: 88 files and 1,865 tests, AC-10-42 passing, a 40-second statement stopped at 30.0 s as each login, four loosenings caught; REQ-208 ticked. What it leaves: C87. Was: A statement timeout for `adms_api` and
  `adms_worker`, set by the installer from a policy value, checked by `installer:check`, asserted
  by `configuration.test.ts` (**REQ-208**, C34); whether a value of the same name in a service's
  own env file overrides a built-in policy default (C53), decided here with the API's
  configuration.

###### Milestone 2.2 — Sign-in, sessions and permissions (ARCHITECTURE §6, §7.0; Part 2)
- [x] **2.2.1 Sign-in's records** *(schema)* ✅ **done 2026-10-07 (ADR-397…399):** three tables, each with its own guards and read by the API alone: `user_credential` (a person's password hash, authenticator secret and locked-until, **apart from `user`**, which the worker reads), `session` (the SHA-256 of the one refresh token in force, rotated in place, final once revoked) and `security_event` (added, never edited, copied by the database into the audit log's security domain); the three secret columns named on their audit triggers. Seen: 89 files and 1,885 tests, `guard_gaps()` empty, AC-10-10 and 11 passing at the database and AC-10-19 in part, 23 loosenings caught; eighty-two migrations. **ADR-400 (no unsigned write at all) was built and withdrawn the same day, uncommitted (ADR-401).** What it leaves: C88. Was: The columns `spec/DATA-MODEL.md` §2.2 leaves to this
  phase (`passwordHash`, `twoStepSecret`, `lockedUntil`…), a session's refresh token kept only as
  a hash and revocable, and **where a security event is kept** (decided here: every sign-in,
  failure, lockout, device setup and master-passcode use must be one, REQ-202b); each guarded,
  each secret column kept out of the audit log (C21); no viewer reads any of it. `DATA-MODEL.md`
  gains what is decided.
- [x] **2.2.2 Passwords** ✅ **done 2026-10-07 (ADR-402…406):** the rules in `packages/domain` (`PasswordRules`: NIST SP 800-63B-4 and ASVS 5.0; 15 to 128 characters as policy values, no composition rule, no age; a monitor's exempt, ADR-105); the release's own list of 46,483 known breached passwords, checked whole with no outside service, for a person and for the installer's master passcode (C35); Argon2id at 19 MiB, 2 passes, 1 lane by Node's own crypto; `Passwords` in `apps/api`: an admin sets anybody's (the service; its endpoint with 2.2.5), a back-office or outside user resets theirs by email through two endpoints with a signed code that is good once for 60 minutes and stores nothing; `nodemailer` 10.0.13; mail never required. Seen: 92 files and 1,940 tests, AC-10-20, 21, 23, 24 passing and AC-10-25 in part (the admin's endpoint: 2.2.5), 25 loosenings caught. What it leaves: C89. Was: Argon2id with OWASP's parameters set in an ADR (the installer already
  hashes the master passcode that way, ADR-281); the rules of NIST SP 800-63B in `packages/domain`
  (length over complexity, no forced rotation); **breached-password screening** for every password
  a person sets and for the master passcode (C35), in a way that needs no outside service (the
  firm runs its own installation, ADR-197); an admin sets and resets a password; reset by email
  where the firm has mail (Mailpit locally), never required (ADR-170).
- [x] **2.2.3 Sessions** ✅ **done 2026-10-07 (ADR-407…411):** a back-office or outside user signs in with their email address and password and out again (`POST /sessions`, `/sessions/refreshes`, `/sessions/sign-outs`, `GET /sessions/current`, `/sessions/csrf`, `POST /password-changes`); the access token (5 minutes, signed with `node:crypto`) and the refresh token (rotated in place, good once, its reuse ending the session) only in `__Host-` cookies marked `HttpOnly; Secure; SameSite=Strict`; a call that isn't a GET carries the session's CSRF value; every endpoint says who may call it (`access`), asked before its schemas read anything; a session ends after 30 quiet minutes and 12 hours at most; wrong tries counted on the person's sign-in record, a wait from the 5th (30 s, doubling) and a lock at the 10th until the password is set anew, each a security event, a try at a name nobody has writing nothing; a monitor and the system actor refused; a password somebody else set changed by its owner first; a new password ending the person's sessions; the password hash keyed. Seven policy values, two migrations, no dependency. Seen: 95 files and 2,000 tests, AC-10-09, 12…19 passing, AC-02-39 in part, 56 of 57 loosenings caught (the 57th matters only when two calls race). What it leaves: C90. Was: Sign in and out; a short-lived access token and a rotating refresh token
  in `HttpOnly; Secure; SameSite` cookies, never in a response body the page keeps; CSRF protection
  on cookie-authenticated writes; a refresh token used twice ends its family; back-off and lockout;
  **role `SYSTEM` never signs in** (C21) and **a monitor's credentials are refused here** (AC-02-39,
  the web half); each sign-in, failure and lockout a security event. `ADMS_TOKEN_SIGNING_SECRET`
  gets its use (C23). **REQ-202** in part, **REQ-202b** in part.
- [x] **2.2.4 Two-step sign-in** ✅ **done 2026-10-07 (ADR-412, 413):** an authenticator app's code (RFC 6238, `node:crypto`), required for an admin and a manager/analyst (their session opens nothing but setting one up until they have one), optional for a read-only viewer, none for a monitor; `POST /sessions` takes the code, a right password without one answers `TWO_STEP_CODE_NEEDED`, a wrong or spent code is a wrong try; a code is good once; set up by proving a code, nothing kept before that; the secret sealed at rest; an admin clears another person's (their sessions end, a security event); the dev stack's accounts by `pnpm local:accounts`, in no shipped folder. Two policy values, two migrations, no dependency. Seen: 99 files and 2,048 tests, AC-10-26 and AC-02-14 passing and AC-02-74's sign-in half, 32 of 33 loosenings caught. What it leaves: C91. Was: An authenticator-app code, required for an admin and a
  manager/analyst, optional for a read-only viewer, none for a monitor (ADR-170; AC-02-14, 74);
  setting it up, and an admin clearing it for someone who lost their phone (a security event);
  seeded dev accounts with known secrets in the dev stack only, never in a shipped build.
- [x] **2.2.5 Permissions on every request, and people** ✅ **done 2026-10-07 (ADR-415):** every `SIGNED_IN` endpoint names its `roles` and may name one `permission` (`packages/contracts`; one with no role can't be defined); `Admission` asks them on each request, the person's role and live grants read with their session, the rule the domain's (`Access`); seven endpoints of the firm's people (create a back-office or outside user, never a monitor; read one, a monitor's phone number an admin's alone; the permissions and a viewer's projects a person holds from now on; an admin sets a password; ends sessions; archives); only an admin gives a permission; one email address a person who signs in and the firm's last admin, each refused by the service and by the database (the 87th migration, a guard: an exclusion and a trigger); `pnpm installer:admin` on the server makes the first admin and lets an admin back in (the user's decision, ADR-413 (2), 414 (2)); a refused password's plain words reach the caller. No dependency. Seen: 101 files and 2,091 tests, sixteen stories (`first-admin`, 32 checks), AC-02-08, 12, 13, 72, AC-10-25 passing at the API, AC-02-83 and 84 added, AC-09-18 and AC-10-27 in part; of 76 loosenings tried, 75 caught. **REQ-202** not ticked: a viewer's reads scoped to their projects (2.4.5) and a monitor's sign-in on a phone (2.5.2) are still to come. What it leaves: C92. Was: The guard reads the caller's role and
  grants from the database on each request, so a revoke bites at once (AC-02-12, AC-09-18); an
  admin creates back-office and outside users, gives and takes grants and a viewer's projects
  (AC-02-08); nobody grants what they don't hold, and the last admin can't be removed or locked
  out (AC-02-13); a manager/analyst never reads a monitor's phone number (AC-02-72). **REQ-202**
  ticked when seen whole.
- [x] **2.2.6 Rate limits** ✅ **done 2026-10-07 (ADR-416):** a caller over a limit is answered 429 `LIMITED` with `Retry-After` and `retryAfterSeconds`; six limits on nine policy values: every request by address (3,000 a minute) and by signed-in person (600), refused tries at a secret by address (30 an hour) and by address at one login (4, always under the login's own wait), resets by email by who asks (10) and who is asked for (3); a try stopped by a limit never reaches the login; the counts in the API's own memory, bounded, never in the database; a caller's address taken from a proxy only where the installation lists it (`ADMS_TRUSTED_PROXIES`; the local stack's Caddy at a fixed address), an IPv6 caller counted by its network; no address logged or stored. No dependency. Seen: 103 files and 2,134 tests, AC-10-40 passing, the limit through the real proxy. **REQ-204** noted in part (per device: 2.6.5). What it leaves: C93. Was: Per IP and per account (per device comes with 2.6.5), the numbers
  policy values, never literals; what a limited caller is told. **REQ-204** in part.

###### Milestone 2.3 — Jobs and the worker's process (ARCHITECTURE §13)
- [x] **2.3.1 The job queue** ✅ **done 2026-10-07 (ADR-418):** two guarded tables of our own written through Prisma, `reconciliation_job` and `reconciliation_job_ticket`, and no library (pg-boss weighed and not taken: its own schema by its own SQL outside the migration history and `guard_gaps()`, hard deletes, writes with no actor, raw SQL to reach Prisma's transaction); a job names its project, what asked for it and who, and its tickets as the worker groups one; **added only inside the piece of work of the change that asks for it**, by `ReconciliationJobs.queue` in `packages/db`; the API adds and changes nothing, the worker writes how a job went, nobody deletes, no viewer reads, audited in operations; what was asked never changes, and a job once finished or set aside is history; a job that fails whole is tried again and set aside after five tries (point 14). Two migrations (eighty-nine), no dependency. Seen: 105 files and 2,149 tests, `guard_gaps()` empty, AC-10-50 in part (the review services' own calls: 2.3.3), 23 of 23 loosenings caught on part of the database tests. What it leaves: C94. Was: The choice by ADR (ARCHITECTURE §3 names a Postgres-backed queue, "e.g. pg-boss"; weigh it against a guarded table of our own written through Prisma: grants, audit, no hand-written SQL, what each login may do to it). A job names its project and its tickets; **it is queued in the same piece of work as the change that asks for it**, so neither exists without the other.
- [x] **2.3.2 The worker as a process** ✅ **done 2026-10-07 (ADR-419):** `apps/worker/src/main.ts` drains the queue: under a project's lock it takes up the waiting jobs (a try counted on each first), works the tickets they name and no other, each once, and finishes each job in the run's own closing piece of work; a try that fails whole keeps its reason on the job, and a job is set aside after `JOB_TRIES_BEFORE_SET_ASIDE` (5); one process works its projects one after another and looks every five seconds; its settings stop the start when off, named and never shown; a JSON log by ids; a health answer with the queue's two counts, on its own loopback; the stack's eighth service; the installer writes its map settings (adding them to an older installation's file), starts it and checks it; five policy values (the pool's size for both services among them). No dependency, no migration. Seen: 107 files and 2,178 tests, 17 stories (`p1-queued`, 12 checks), AC-10-52 and 53 passing, AC-10-54 in part, AC-10-55 whole, six of six loosenings caught. **REQ-206** in part. What it leaves: C95. Was: `apps/worker` gets a `main`: it drains the queue, one run per project at a time under the database lock, **working only the tickets a job names** (C71; the user's rule, ADR-360: a settled ticket stays off the queue until it or its setup changes, C75); a group that errors is flagged and skipped; its settings (both map servers' addresses, the certificate authority, the extract's SHA-256, the longest a run holds its lock) in its env file, written by the installer; a health answer. **REQ-206** in part.
- [x] **2.3.3 What queues work** ✅ **done 2026-10-07 (ADR-420):** each change queues its own job in its own piece of work, and no caller asks the worker: a correction, a renumber, a quarantined record resolved, a back-office record, a void, an unvoid, an acceptance and an unlock (`ReviewService`); a rule, a pay item, **a rate (`PayItemSetup.rate`, new)**, a "Pays when", a project's settings, a control range, a map version, a site and its tipping fee (the setup services); a certification made (its number's field events linked, its tickets queued), measured again or revoked. **A job names the tickets touched and their neighbours**, the other tickets whose conclusions read them (the domain's `TicketNeighbours`: an overlap on one truck, a crew's day, one scale receipt, a carried ticket), asked before a change and after it; never a ticket locked as invoiced, never a settled void. A change to a record that is no ticket's queues a job that names none. **`JOB_TICKETS_AT_MOST=200`** cuts a change into jobs and caps what a run takes up. The stories `p1-reviewed`, `p1-voided` and `p1-invoiced` run from the queue. No dependency, no migration. Seen: 108 files and 2,191 tests, 17 stories, AC-10-50 and 54 whole, AC-10-51 in part, AC-06-36 whole, eight of nine loosenings caught. **REQ-206** not ticked: a sync's job is 2.6.2's. What it leaves: C96. Was: A correction, a renumber, a void, an unvoid, an acceptance and an
  unlock hand their `reprocess` to the queue (today the caller asks the worker; C79…C81); a rate
  or rule change queues the project's un-invoiced tickets it touches (ADR-090); **a certification
  made after a field event scanned its number is linked to that field event again and its tickets
  queued** (C83, C62; AC-06-36); AC-06-02, 03 and AC-05-53. No endpoint reconciles while the
  caller waits. **REQ-206** ticked when seen whole.

###### Milestone 2.4 — The back office's endpoints (REQ-201, 207)
- [x] **2.4.1 The services Phase 1 left to a story's hand** ✅ **done 2026-10-08 (ADR-423):** `SetupStanding` in `apps/api` answers the setup check and the sites' quantity lookup from one read-only reading of the project's setup, kept nowhere; `PayItemSetup.change` (unit, crew-time conversion, capture settings), `ProjectSetup.changeWindow`, `SiteSetup.shape` (GeoJSON, the next version) and a site's GPS on `SiteSetup.change`, each queueing the tickets it moves; `p1-left-out`, `p1-priced`, `golden-mission` and `p1-reconciled` call the services, and no story writes a setup change by hand. No dependency, no migration, no endpoint. Seen: 108 files and 2,191 tests, 17 stories (`p1-left-out` 31 checks), AC-01-69, 70, 72, 74, 75, 77 asked of the service on a real database, five of five loosenings caught. **REQ-207** in part (a certification's photographs: 2.6.4). What it leaves: C97. Was: (**REQ-207**; C74, C83): the setup
  check and a site's quantity lookup as services in `apps/api` (rules in `packages/domain` today,
  called only by tests); a rate added or changed, a pay item's unit, a project's active window, a
  site's own shape. The stories that wrote these as the person call the service instead.
- [x] **2.4.2 Setup's endpoints.** ✅ **done 2026-10-08 (ADR-424…427).** **In four parts (ADR-424): part 1 ✅ done 2026-10-08** (the shared ground: `SETUP` at the door and again in the service, `NOT_SAVED` with the rule's code and words, the database's refusals answered plainly by the error filter; eighteen requests for the client, declaration event, project, number series, control ranges, field tags, contractors, primes, contracts and the two lists; seen: 110 files, 2,211 tests, 17 stories, nine loosenings caught). **Part 2 ✅ done 2026-10-08 (ADR-425):** nine requests for forms (a form, a debris type on it, the firm's own fields), pay items (entered, changed, a prime's rate, "Pays when") and rules (written, stated anew); a pay item's code, description and band may now change, its rules renamed with it; AC-10-38 passing on its own case; nine loosenings, nine caught. **Part 3 ✅ done 2026-10-08 (ADR-426):** six requests taking Setup for sites (entered, changed, a site's own shape, its tipping fee pay item), the map and a contractor merge, which now queues the tickets of the certifications it moved (story `p1-reviewed`, 35 checks); the setup check and the two lookups by a request open to every admin and manager/analyst; 112 files, 2,241 tests; twelve loosenings, twelve caught. **Part 4 ✅ done 2026-10-08 (ADR-427):** four requests for the firm's people (a page of them, a person changed, a role changed between admin and manager/analyst, out of the archive); the old sign-in address told by mail; the last-admin guard answered plainly in a race; 113 files, 2,257 tests; twelve loosenings, eleven caught and one with nothing to see. What the parts leave: C98, C99, C100, C101. The task: Each `setup/` service behind its request, schema and grant
  (C60): the client, declaration event and project, contractors and contracts, lists, forms, pay
  items and their "Pays when", sites and the map, rules; a refusal answered in the domain's own
  words; a refusal by the database's constraints answered plainly, never as an internal error.
- [x] **2.4.3 Dispatch and phones, from the back office.** ✅ **done 2026-10-08 (ADR-428, 429).** **In two parts (ADR-428): part 1 ✅ done 2026-10-08** (`DISPATCH` at the door and again in the service; the firm's phones a page at a time; a phone taken out of service as lost or retired, from the moment it is marked; the master passcode changed by an admin who gives their own password again, a new version, every admin told by mail; 115 files, 2,271 tests; eighteen loosenings caught). **Part 2 ✅ done 2026-10-08 (ADR-429):** a day's assignments written, changed and withdrawn through `Assignments` and three requests that take `DISPATCH`, the day's board read by project and day; a monitor or one of the back office assigned, never a viewer; a phone out of service not named; one made on a phone left to the phone; nine stories writing their boards through the service; 117 files, 2,290 tests; twenty-four loosenings caught. What it leaves: C103. The task: A day's assignments written and
  withdrawn (ADR-240; the board's screen is Phase 4); a phone taken out of service with its
  removal time; the master passcode changed (a new version, each phone's check moving at its next
  sync; C47). Whether a service for assignments exists is read first: the stories write them.
- [x] **2.4.4 Certifications and review.** ✅ **done 2026-10-08 (ADR-430…433).** **In four parts (ADR-430): part 1 ✅ done 2026-10-08** (review's marks: a void, an unvoid, a flag's acceptance, a QC status, an invoice batch, a lock as invoiced, its batch and its unlock, eight requests each taking its own permission at the door and again in the service; AC-10-28 passing, AC-02-12 and AC-09-18 on the real calls; 118 files, 2,304 tests; twenty-five loosenings caught; what it leaves: C104). **Part 2 ✅ done 2026-10-08 (ADR-431):** corrections to a ticket's own records (`Corrections.fieldEvent`, `renumber`, `itemLine`, `carriedTicket`, `photograph`, `scaleReceipt` behind six requests, five taking *correct* and the renumber *renumber*; a schema's refusal says which field in plain words, AC-10-37 passing; AC-04-102, 103 at the API; 119 files, 2,319 tests; what it leaves: C105). **Part 3 ✅ done 2026-10-08 (ADR-432):** an ROE, its scope, a survey, an incident and a drop-off log corrected, a quarantined record renumbered or marked a second copy, a field event created in the back office (eight requests: six taking *correct*, the two of quarantine *renumber*; AC-08-19, 21, 25, 26 at the API; 120 files, 2,332 tests; fifteen loosenings caught; **built no new service**: an ROE's number, a form's own answers and a form created in the back office still wait, C106). **Part 4 ✅ done 2026-10-08 (ADR-433):** a certification's measuring mistake corrected (*correct*), its signatures on file (*QC*) and its revocation (an admin's alone, AC-03-55 at the API), three requests; 121 files, 2,342 tests; six loosenings caught; **a certification made or replaced stays the phone's, for 2.6.2** (C107); the merge is done, ADR-426. The task: `Certifications` (only an admin revokes, AC-03-55;
  `measure`, `signaturesOnFile`, a merge), `Corrections`, `QuarantineReview`, `BackOfficeRecords`,
  voids, unvoids, acceptances, `QcMarks`, `InvoiceLocks` and batches: **each call checks its own
  grant again on the request** (`CORRECT`, `VOID`, `ACCEPT_FLAG`, `QC`, `LOCK_INVOICED`,
  `UNLOCK_INVOICED`…; C78…C81), states the request id, and queues its `reprocess`; a correction
  to an ROE or a form behind its request too (C66); a load call past
  100 or a blank label is refused in plain words by the request's schema (C79); who may mark a
  photograph removed or label one (`Corrections.photograph`; AC-04-102, 103).
- [x] **2.4.5 The read-only viewer's path.** ✅ **done 2026-10-08 (ADR-434, 435): Milestone 2.4 is done.** **Part 2 ✅ (ADR-435):** `GET /viewer/projects/:projectId/tickets`, `…/tickets/:workflow/:ticketNumber` and `…/roes`; the owner's views declared in `viewer.prisma`; a ticket that isn't the viewer's is 404; the story `p1-viewed` (15 checks) as the client user, an auditor, three contractor users and nobody; AC-10-29 and 30 passing, AC-02-74 in part (reports: Phase 4); REQ-201 ticked; 123 files, 2,361 tests; 18 stories; five loosenings caught; what it leaves: C109. **In two parts (ADR-434): part 1 ✅ done 2026-10-08** (the one place that states the viewer, `ViewerDatabase.$viewed` in `packages/db`; the API's read-only database; `GET /viewer/projects`, a viewer's alone; every request that isn't a GET refused to a viewer but their own password and authenticator, AC-10-31 passing; AC-10-30 and AC-02-74 in part; 123 files, 2,357 tests; eight loosenings caught, two of them by tests added for them; what it leaves: C108). **Part 2:** a project's tickets and one ticket with its field events, completed record and lines; the money joined from `viewer_transaction_money` (C76); an ROE's owner by the viewer's own setting (C67 (d)); a story on the mission's tickets read as a client user, a prime's and a sub's contractor user, an auditor and nobody (AC-10-29, 30; AC-02-74); REQ-201. The task: `adms.viewer_id` stated from one shared place on
  every `adms_readonly` request, as `$write` states the actor (C22, C59); a viewer's money read
  joined from `viewer_transaction_money` (C76); private citizens by the viewer's own setting
  (C67 (d)); the reads this phase's scenarios need (AC-02-74), each tried as a client user, a
  prime's and a sub's contractor user, an auditor, and nobody. **REQ-201** ticked when 2.4.2…2.4.5
  are seen.

###### Milestone 2.5 — Phones: enrolment, sign-in, the lists (ARCHITECTURE §7, §7.4, §7.5; Part 2)
- [x] **2.5.1 Enrolment and a phone's proof of itself.** ✅ **done 2026-10-09 (ADR-436, 437, 439, 440). In three parts (ADR-436): part 1 ✅ done 2026-10-09 (ADR-437):** the key's kind (ECDSA P-256, SHA-256), what a phone signs (`PhoneProofRules`), `DeviceKeys` and `PhoneChallenges` in `apps/api/src/phone/`, the policy value `PHONE_CHALLENGE_SECONDS`; 125 files, 2,378 tests; five of six loosenings caught, the sixth a check that changes nothing; no endpoint, no table; what it leaves: C110. **Part 2 ✅ done 2026-10-09 (ADR-439):** the master passcode's own actor seeded and guarded, `master_passcode_tries`, two security event kinds, `POST /phones/enrolments` (AC-10-44 passing; AC-10-22 and AC-02-18 in part; AC-10-32's enrolment); 127 files, 2,402 tests; nine of nine and thirteen of thirteen loosenings caught; what it leaves: C111. **Part 3 ✅ done 2026-10-09 (ADR-440):** the device key's own actor seeded and guarded, `Device.lastAnsweredChallengeMadeAt` held by the database, the device key's shape checked, `POST /phones/:deviceId/challenges` and `/proofs`, `GET /phones/current`, the access `PROVEN_PHONE`, the policy value `PHONE_TOKEN_MINUTES`, the harness's software key and every story and API test enrolling through the API (AC-10-45 passing; AC-02-18 whole at the API; AC-05-03 and AC-10-46 in part); 129 files, 2,429 tests; twelve of twelve and twelve of fourteen loosenings caught; what it leaves: C112. The task: The key's kind by ADR (what iOS's Secure
  Enclave and Android's Keystore both make and Node verifies without a dependency); the master
  passcode checked with back-off; the phone's public key kept; a server challenge signed on every
  later call (AC-02-18, AC-05-03). **Who the record names for an act under the master passcode**
  (C45, REQ-209) is decided here: the passcode isn't a person, and `$write` needs one. The
  harness's phone holds a software key; real secure hardware is Phase 3's.
- [x] **2.5.2 Monitors on phones.** ✅ **done 2026-10-09 (ADR-441…444).** **In three parts (ADR-441, which says what the standards ask of a monitor's sign-in): part 1 ✅ done 2026-10-09 (ADR-442):** a monitor created by `POST /phones/current/monitors` from a proven phone in service under the master passcode; the Monitor ID the database's; the records the master passcode's actor's, on that phone; `MasterPasscodeCheck` shared with enrolment; no migration, no dependency. AC-02-07 passing at the API. What it leaves: C113. **Part 2 ✅ done 2026-10-09 (ADR-443; ADR-441 (6) built as proposed):** a monitor signs in on a proven phone in service (`POST /phones/current/sign-ins`); the device's session a row of `session` naming the phone (`device_id`, a migration and its guard), good for `MONITOR_SESSION_HOURS` (12) and never ended by quiet, sent as `x-adms-monitor-session` beside the phone's token; the access `MONITOR_ON_PHONE` and two endpoints on it (`GET /phones/current/monitor`, `POST /phones/current/sign-outs`); wrong tries on the monitor's own record, written from the phone; AC-02-39 passing at the API. What it leaves: C114. **Part 3 ✅ done 2026-10-09 (ADR-444):** the sign-in's answer carries the assignment the phone takes (the project's own day; the one naming this phone, else the monitor's only one; none where several are left or there is none), read by `PhoneAssignments`, the rule the domain's `AssignmentRules.takenAtSignIn`; no migration, no new endpoint; every story's monitors created through `PhoneMonitors` and signed in through `PhoneSignIns` (`story.monitor`, `story.signedIn`, `taken`). AC-02-35 passing at the API. What it leaves: C115. *The task as planned:* A monitor created on a phone, online, under the master passcode
  (ARCHITECTURE §7.0); a monitor signing in online on any enrolled phone and **the phone taking
  their assignment** with no passcode and no picking (AC-02-35); the same Monitor ID and password
  refused everywhere but a phone's calls (AC-02-39); the device's session token.
- [x] **2.5.3 The lists a phone takes.** ✅ **done 2026-10-10 (all five parts, ADR-449…451, 453…455).** **In five parts (ADR-449, which says what the standards ask of a login list kept on a device): part 1 ✅ done 2026-10-09 (ADR-450):** `GET /phones/current/lists` for a signed-in monitor's phone: the assignment it takes now and that assignment's lists (number blocks, debris types without those *Hidden on phones*, field tags, typed-number reasons, the unit rate pay items the assignment names, the incident and survey lists), read by `PhoneLists`; the harness's `phone-lists.ts` gone and five stories reading through the service; AC-01-26 passing at the API, AC-02-37 and AC-07-91 in part; no migration, no dependency; seven loosenings caught; what it leaves: C117. **Part 2 ✅ done 2026-10-09 (ADR-451):** every certification of the project (number, kind, capacity, prime and subs; never the driver), the live sites, the ROEs with whether the pre-work survey is done (never the owner; only to a phone whose work names one), the control ranges, each unit rate pay item's capture settings and the assignment's site's quantity lookup; a certifying phone's cert-number block is one of its blocks; AC-02-37 but for the login list and the setup version, AC-03-09's refresh; no migration, no dependency; thirteen loosenings accounted for; what it leaves: C118. **Part 3 ✅ done 2026-10-09 (ADR-453):** `SetupManifest` and the setup version: a version numbers the project's setup as its phones are shown it (never its certifications, ROEs or blocks), is made when a phone is first sent lists that differ, as the device key's actor on that phone, and is numbered and kept by the database (two migrations); the lists say which version they are; the back office asks a site's quantity lookup as a version held it (REQ-124f's server half); no story states a version; sixteen loosenings of the services and eleven of the guard accounted for; what it leaves: C119. **Part 4 ✅ done 2026-10-09 (ADR-454):** the login list and the master passcode's check, by `POST /phones/current/login-list`: the cost of an entry measured first (11.8 ms), so the phone says what it holds and is made only what it lacks, a bounded number a call; a monitor's offline seed kept sealed beside their password; the passcode's check with its version, the phone's record moved as the device key's actor (two migrations; the database keeps a seed with its password and the version to the phone's own word); AC-02-41 and AC-02-17 at the API; twenty loosenings of the services and eight of the guard accounted for; what it leaves: C120. **Part 5 ✅ done 2026-10-10 (ADR-455):** `POST /phones/current/address-lookups`: a signed-in monitor's proven phone sends a GPS point in the body and is answered the street number and name our own address server finds, or none with why; never refused for want of one; nothing written, neither the point nor the address logged; the API alone asks the address server (its own settings' server over HTTPS, five seconds, 64 KiB), by a setting the installer writes and adds; one reading of an answer for the API and the worker, in the domain; AC-04-24 at the API; no migration, no dependency; 25 loosenings caught of 25; what it leaves: C121. *The task as planned:* `SetupManifest` and its version (DATA-MODEL §4.5); the
  harness's `phone-lists.ts` gives way to a service in `apps/api` (C68): certifications, sites,
  ROEs, the number block or control ranges, the forms' debris types without those *Hidden on
  phones* (AC-01-26), field tags, the unit rate pay items the assignment names, the site's
  quantity lookup by setup version (REQ-124f's server half), **the login list, each entry a slow
  hash salted for that phone** (AC-02-41), the master passcode's check; **never a rate, a code on
  a load, a rule or a transaction** (AC-02-37, AC-07-91: a test reads every list for one); a phone
  refreshes its lists at any time (AC-03-09); an address looked up for a phone's GPS, the address
  server staying private to the API (AC-04-24).
- [x] **2.5.4 What a phone reports besides field events.** ✅ **done 2026-10-10 (ADR-456…458, 462…464); REQ-202b is not ticked: the passcode's use at turn-in is task 2.6.5's.** An unplanned assignment, a monitor
  switch, a site move, a temporary session and each use of the master passcode, each with the
  phone's instant, its offset and the server's received time (C46; AC-02-38, AC-05-40), each use
  a security event. **REQ-202b** ticked when seen whole.
  **Cut in five (ADR-456, 462), one a response:** ✅ **part 1, an unplanned assignment arrives**
  (ADR-457: `POST /phones/current/unplanned-assignments`, the phone's three times, the guard on
  who makes one; AC-02-38's and AC-05-40's arrival) · ✅ **part 2, a monitor switch and a site
  move reported** (ADR-458: each a new unplanned assignment by the same call, stating
  `occasion`; a switch is `DEVICE_SWITCH`; the sign-in takes the one made on the phone last) · ✅ **part 3, a session under the master passcode with a connection, and the temporary
  session** (ADR-462: `POST /phones/current/passcode-sessions`, the session marked by a column
  and its guard, ending as the domain's `PasscodeSessionRules` says; a reported switch ends the
  earlier monitor's session) · ✅ **part 4, what setup under the passcode reads online before
  anybody is signed in** (ADR-463: `POST /phones/current/setup-choices`, the passcode in the
  body; open projects, monitors in service, one open project's live sites and unit rate pay
  items in service; each read a use of the passcode) · ✅ **part 5, every other use of the passcode a phone logged and its wrong
  tries there** (ADR-464: `POST /phones/current/passcode-uses`, a switch to a monitor with their own assignment, a session opened with no connection, a wrong try that moves no count on the server; the guard on what a phone reported; REQ-202b read whole and left open for 2.6.5; the story `under-the-passcode`). What it leaves: C126.

###### Milestone 2.6 — Sync (ARCHITECTURE §9, §11; Part 5) ✅ complete 2026-10-13 (2.6.3 withdrawn, ADR-477)
- [x] **2.6.1 The sync contract.** ✅ done 2026-10-11 (ADR-466, 467, 469, 470). Every payload and every answer as schemas in
  `packages/contracts`, with **the test suite any client must pass** (the harness now, the field
  app in Phase 3). **REQ-004** ticked when OpenAPI covers every endpoint.
  **In four parts (ADR-466): part 1 ✅ done 2026-10-11** (the records a phone sends: six strict
  schemas in `sync-records.ts`, `Intake` typed from them, a typed capacity carried, KD-75
  closed; what it leaves: C127) · **part 2 ✅ done 2026-10-11** (ADR-467: one sync and its answer,
  `sync.ts`; each record read on its own; `NOT_SAVED` with three reasons; 200 records a sync;
  what it leaves: C128) · **part 3 ✅ done 2026-10-11** (ADR-469: a certification made on a
  phone, the seventh kind; its boxes and never a capacity; `certify`'s refusals answered
  `NOT_SAVED`, `CERTIFICATION_REFUSED`; what it leaves: C129) · **part 4 ✅ done 2026-10-11** (ADR-470: `syncClientSuite`, eight
  checks; `syncAnswerRead`; the harness's phone a client of the contract and held to the suite;
  what it leaves: C130). **REQ-004 stays open** until a photograph's record and
  turn-in have their schemas (2.6.4, 2.6.5; the edit log is withdrawn, ADR-477).
- [x] **2.6.2 Records.** ✅ **closed 2026-10-12 (ADR-475). In four parts (ADR-471): part 1 ✅ done 2026-10-11** (the schema: `sync`, `synced_record` and `held_record`, each with its own guards; the ledger holds only what was stored; what it leaves: C131) · **part 2 ✅ done 2026-10-11** (ADR-472: `POST /phones/current/syncs`, `Sync`; the sync kept first, each thing its own piece of work and answer, the ledger row and the job written with the record, what can't be saved held once by fingerprint; REQ-016 ticked; what it leaves: C132) · **part 3 ✅ done 2026-10-11** (ADR-473: the answer brings the master passcode's check and a setup version number, never the lists; `setupVersionSent` written once; the worker reads the clock's difference through the ledger, `DEVICE_CLOCK_OFF_LIMIT_MINUTES=5`; what it leaves: C133) · **part 4 ✅ done 2026-10-12** (ADR-475: every story's phone through `Sync` by `story.server`; the stand-in gone; the story `held-for-review`; what it leaves: C134). `Sync` and `SyncedRecord` *(schema)*; the endpoint in front of `Intake`:
  the phone proves itself and reports its clock, **the difference kept with the sync** and
  `DEVICE_CLOCK_OFF`'s threshold a policy value (AC-05-04, AC-06-58; C53, C70); the idempotency
  ledger answers a retry "already saved" and never quarantines it (**REQ-016**, AC-05-16); each
  record its own answer (AC-05-20, 45); **what a record the database's constraints refuse is
  answered** (an unknown project, phone, monitor or assignment, a pick that isn't the project's:
  C69, 05-sync.md point 11), never an internal error and never "saved"; number blocks topped up
  from each series' last used number (C64); fresh lists and any new passcode check returned;
  reconciliation queued, never waited for (AC-05-05); a certification made on a phone arrives
  through `Certifications.certify` (C62).
- [x] **2.6.3 The edit log.** ✅ **withdrawn 2026-10-12 at the user's word (ADR-477): once a monitor submits a record on the phone it is sealed for them, so no phone sends an edit and there is no edit log.** Its part 1 (ADR-476: the table `field_event_edit`) was built and taken out again the same day, never committed. What the server owes the rule was already built by 2.6.2 and is now proven by name: a submitted record sent again changed is answered "already saved" and changes nothing (`apps/api/test/sync.test.ts`; AC-02-45, AC-05-08, AC-08-06 rewritten). What it leaves: C135. *As planned, struck:* ~~`FieldEventEdit` *(schema, its fields decided here)*: a monitor's own
  reopen before their shift ends, sent for a field event already synced, written under the monitor
  and audited, the ticket queued; refused once the shift has ended (AC-02-45, AC-05-08, AC-08-06;
  REQ-105g's server half).~~
- [x] **2.6.4 Photographs.** ✅ **closed 2026-10-12 with its fifth part (ADR-485).** **Cut in five (ADR-478):** **part 1 ✅ done 2026-10-12** (ADR-479,
  480: the store's client `@aws-sdk/client-s3`, the media bucket and the API's identity at it,
  `Settings.media`, `MediaStore`; AC-10-49 in part; what it leaves: C136) · **part 2 ✅ done
  2026-10-12** (ADR-481: `photos`, a sync's own part after the records; both fingerprints the
  phone's, never a place; the server's place `projects/<project>/photos/<photograph>`;
  `OWNER_NOT_SAVED`, one migration; the ledger and a job; the harness's phones and every
  story's certification sending their photographs in their syncs; 150 files, 2,708 tests, 20
  stories; twenty loosenings caught; what it leaves: C137) · **part 3 ✅ done 2026-10-12** (ADR-482: the media endpoint, `GET`/`PATCH /phones/current/photos/:photoId/files/:file`, the one that takes a file; parts that go on where the last ended, held only in the API's memory; size, kind by first bytes and the whole file's SHA-256 checked; kept once with its upload time, by the phone; a file not fingerprinted set aside, `set_aside_file`; the depth file's own fingerprint, `depthSha256`; three migrations; 152 files, 2,734 tests, 20 stories; 39 loosenings of the code and 16 of the guards caught; what it leaves: C138) · **part 4 ✅ done 2026-10-12** (ADR-483: the harness's phone makes a real file for each photograph and sends it after the sync that saved its record, in parts, until kept; `syncClientSuite` 13 checks, five new, each catching a fault no other does; the story `interrupted-upload` (AC-05-09); a story's files in a store of its own, in memory; the back office's read, `GET /photographs/:photoId/files/:file`, a download never run, never a file that isn't the one fingerprinted (AC-10-48); 152 files, 2,750 tests, 21 stories; 14 loosenings caught; what it leaves: C139) · **part 5 ✅ done 2026-10-12** (ADR-484, 485: the map's files; `shpjs`, `but-unzip`, `proj4` pinned, two faults of theirs guarded; `POST /projects/:projectId/map-files`, the whole file as bytes up to 16 MiB by the route's own limit, its kind by its first bytes, read (a projected shapefile converted, a zip bounded unzipped and in files) and kept once by its SHA-256 under its project only when it holds a shape; a map version (`uploadedFileKey`) or a site's next shape loaded from the file as kept; `MapShapes`' box position by position; KD-76 opened (AC-10-47); REQ-207 ticked; what it leaves: C140).
  *As planned:* Who makes a photograph's place in storage (C65); a resumable upload
  after the records; the fingerprint checked against the one taken at capture; type and size
  checked, stored outside the web root, never executed; the API's store identity without
  bucket-delete (C24, ADR-263); **a certification sent with its five photographs** (C82), so
  `CERTIFICATION_PHOTO_MISSING` stops standing on every story's certifications (AC-05-09,
  AC-04-77). The store's client by ADR.
- [x] **2.6.5 A phone out of service, and turn-in.** ✅ **closed 2026-10-13 in three parts (ADR-487: the standards said first, and the cut).** **Part 1** (ADR-488): `POST /phones/current/turn-ins` (`TurnIns`), the phone and the master passcode; told to wipe only when everything it still holds is on the server from that phone, otherwise named back and nothing changed; then in one piece of work the blocks ended (reported: rest handed back; not reported, or a lost phone: retired), out of service, sessions ended, the key revoked, `MASTER_PASSCODE_USE` and the new `DEVICE_TURN_IN`; the database lets only the turn-in revoke a key, only once no block is issued, and issues no block to a phone turned in (two migrations); 28 + 10 loosenings caught. **Part 2** (ADR-489): the sync contract's suite 16 checks (three for turn-in), `sentCanonical`, `turnInAnswerRead`; the harness's phone turns in (`story.underPasscode.turnIn`); the story `sync` turns in the lost tower phone and Ana's phone (51 checks). **Part 3** (ADR-490): `REQUESTS_BY_PHONE` (`RATE_LIMIT_REQUESTS_PER_PHONE`, 600 a minute); REQ-004, 202a, 202b, 203, 209 read whole and ticked; KD-77 for the user (the key revoked when the wipe is ordered). 156 files, 2,805 tests, 21 stories. What it leaves: C141. *As planned:* A lost or retired phone still proves itself
  and is **received**: what it made after its removal time arrives flagged, nothing refused
  (AC-02-60); "Sync and turn in" confirms every record, takes back the unused numbers, and only
  then is the phone told to wipe (AC-02-58); its blocks retired or reclaimed (C64); **then its key
  is revoked and the server refuses it** (`Device.keyRevokedAt`; C47). Rate limits per device.
  **REQ-202a**, **REQ-202b** (the master passcode's use at turn-in a security event, ADR-464 (5); C126), **REQ-203**, **REQ-209** ticked when seen whole.

###### Milestone 2.7 — Prove it
- [x] **2.7.1 The stories sync through the real endpoints.** ✅ **done 2026-10-13 (ADR-491…503).** The harness's phones enrol, sign in,
  take their lists and sync over HTTPS (C31); the worker's process drains the queue; **the golden
  mission comes out with the approved numbers** and every story still passes.
  **Cut in four (ADR-491). Part 1 done (ADR-492):** a story's own API, the API's process on the
  story's database and clock behind the stack's proxy (`stories.adms.localhost`); every story's
  phone proves itself, syncs, sends its files and is turned in over HTTPS. **Part 2 done
  (ADR-493):** every other request a story's phone makes (enrolment, a monitor created, a sign-in,
  the passcode's session and choices, its lists) through its endpoint; the runner's in-process
  phone services gone. **Part 3 done (ADR-494):** the worker's own job loop (`JobLoop`) drains
  every story's queue on its database and clock (`QueueRuns`); no story asks for a run; the golden
  mission's figures unmoved, and it checks that every run on its projects finished jobs. **Part 4
  is cut in four pieces (ADR-496); 4a done:** the back office and the viewers at their browsers,
  signed in as real people are (`OfficeBrowser`, `story.backOffice`), and every read of
  `p1-viewed` through `/viewer/…`. **4b done (ADR-497):** every void, unvoid, acceptance,
  correction and renumber of `p1-voided`, `p1-left-out`, `p1-reconciled` and `p1-priced` is
  Luis's request at his browser; the by-hand corrections and their jobs gone; a reprocess asked
  with nothing changed stayed without one, overturned by the user (ADR-498). **4b2 done
  (ADR-499):** the reprocess endpoint (`POST /projects/:projectId/reprocesses`, *correct*:
  tickets named, or a set-aside job's id; one `REPROCESS` job, nothing changed; a locked ticket
  left off and counted), every story's by-hand reprocess job moved onto it (`QueueRuns.asked`
  gone), and the worker's set-aside line an error a job, coded `JOB_SET_ASIDE`. **4c done
  (ADR-500):** every QC mark, lock, batch, batch change and unlock of `p1-invoiced` and the golden
  mission (its thirteen lock requests on P1, 102001's on P2) at Luis's or Dana's browser, with
  those stories' voids, acceptances, corrections and renumbers and their grants; `p1-priced`'s
  lock of 101004 QC'd and locked at the endpoints between Luis's reprocess request and the run.
  **4d is cut in three (ADR-501); 4d1 done:** every review act of `p1-reviewed` (corrections,
  renumbers, a photograph's marks, an item line, an ROE's scope, the quarantined disposal
  renumbered and its second copy refused, 101029 created in the back office, 730415's box, 101001's
  QC mark, lock and unlock) at Luis's or Dana's browser, every grant at `setPermissions`; AC-10-50's
  failing job queue kept in process on purpose. **4d2 done (ADR-502):** the story
  `certification`'s measurement and revocation and `p1-left-out`'s revocation at Luis's and Dana's
  browsers (`correctCertificationBox`, `revokeCertification`), his grants at `setPermissions`;
  `Certifications.measure` taken out; `first-admin`'s own sign-in parts kept (the server's command,
  and its checks read why a sign-in failed). **4d3 done (ADR-503), and 2.7.1 with it:** the two
  server apps' indexes export only what their readers take (the harness, `infra/local`'s
  accounts), held by `app-exports.test.ts`; `Reconciliation.run` taken out, every run the queue's;
  REQ-206 ticked.
- [x] **2.7.2 A burst, and knowing it is well.** ✅ **done 2026-10-13 (ADR-504…507).** Every phone of a project syncing at once: each
  record stored once, none lost, no limit dropping work (AC-05-51); health answers for the API,
  the worker and the queue, and what of C38 this layer settles (the rest is the demo deploy's).
  **Cut in four (ADR-504):** 1, what a sync weighs; 2, the burst (a story at a real project's
  size, from the office's one address, the harness's phone waiting out a `429 LIMITED`, the
  worker draining it in more than one run, `settle`'s count read; what it took measured, never
  asserted; 05-sync's open point 12 answered); 3, the queue at that size (C96's 2.7.2 line); 4,
  health (C38's part, the rest re-filed to 5a). **Part 1 done (ADR-504):** a sync weighs a
  mebibyte at most as sent and a client fills one by weight as well as by count (`fitByWeight`,
  the suite's seventeenth check); a record weighs 256 KiB at most, a heavier one read as no
  record and held for a person; `REQUEST_BODY_LIMIT_BYTES` never under a mebibyte. What it
  leaves: C152. **Part 2 done (ADR-505):** the story `burst` (05-sync's open point 12 answered:
  a thousand loads of P1's peak day, 54 phones, 2,000 field events, 2,000 photographs, 3,000
  files) syncs at once from the office's one address over HTTPS, every record and file stored
  once, none lost; the harness's phone answered `429 LIMITED` waits the seconds it is told, on
  the story's clock, and sends the same again (`ToldToWait`); the burst found a sync answered
  `500` where 50 phones' top-ups raced for one series: a top-up that loses every try is now
  answered not topped up (`SeriesMovedOn`); the worker drained it in 19 runs, read from
  `settle`. Measured, not asserted: 58 syncs and 3,001 parts in about 25 s, one wait of 60 s;
  4,631 jobs in about 58 s. What it leaves: C153. **Part 3 done (ADR-506):** on the burst's
  project, measured and written down by the story, never asserted: 4,631 jobs of 0 or 1 ticket
  (the API's cut bit on none), 19 runs working 3,800 tickets for 1,000; a run of 200 1.2 to 1.7
  s, of one 0.2 s, of 1,000 about 7 s; the neighbour read about 4 ms a record (scans by
  certification number and scale receipt); a setup change's read of every ticket under 10 ms.
  200 tickets a run kept; **a job a run already covers is taken up with it** (`WaitingJobs`):
  the burst in 5 runs, 1,000 worked; the API's and the worker's `JOB_TICKETS_AT_MOST` read apart,
  one name kept. What it leaves: C154. **Part 4 done (ADR-507), and 2.7.2 with it:** the API's
  `GET /health` stays liveness (the process alone); `GET /readiness`, new, to anybody, is 200 when
  its database answers it and 503 `UNAVAILABLE` otherwise (one question at a time, bounded by
  `STATEMENT_TIMEOUT_MS`); the worker's health answer is 503 with its problem when it hasn't
  looked yet, can't read its queue or has stalled (twice a run's longest, a map answer and a
  wait: 20 min 35 s), and says how long the oldest job has waited; `installer:check` asks the
  readiness answer. C38 split: what this layer settles is built, the rest re-filed to 5a. What it
  leaves: C155.
- [x] **2.7.3 The security checklist, item by item.** Each item of 2.1.1's list with the test that
  proves it, or the phase that owns it; **REQ-205** held by a check that only `packages/db` and
  the two server apps reach Postgres; **REQ-204** ticked whole; `pnpm security` extended where the
  phase added a kind of secret. **Cut in three (ADR-508); a fourth part added (ADR-512).** **Part 1 done (ADR-508):** `pnpm security`
  holds REQ-205: of the product only `packages/db`, `apps/api` and `apps/worker` reach Postgres
  (three tools named with their reasons: `tools/setup`, `packages/scenarios`, `infra/local`),
  found through any package and any workspace, and by every source file's imports; the
  product's SQL only Prisma's tagged templates, none changing the schema; every table the
  migrations make in the Prisma schema (`prisma migrate diff`). The secrets scan's fourth rule:
  a whole slow hash, an authenticator's secret, a private key as a JWK, a test's own vector marked
  with its reason. `Security checks: 12 passed`; REQ-205 ticked; AC-10-56 passing. What it leaves:
  C156. **Part 2 done (ADR-509; checked against the full ASVS 5.0.0 text and corrected by ADR-510: V1, V9 added, V10 and V17 not used, 25 built, 2 departures, 1 conflict, 78 open, four for the user first):** the checklist item by item: ASVS 5.0 Level 2 and the API Security Top
  10 (2023) read from their published texts; file 10's chapter marks replaced by numbered
  requirements; each item for the API's layer with the test that proves it or the phase that owns
  it, on a page for the user's approval; C155's `/readiness` item; T-51's wording. **Part 3 done
  (ADR-512):** AC-10-27 read whole: `apps/api/test/every-endpoint.test.ts` holds the 120 endpoints
  as one list (who may call each, its roles, its permission) and asks every one as nine kinds of
  caller (nobody, an admin, a manager/analyst with no grant and with every grant, a client user,
  a contractor user, an auditor, a proven phone, a monitor on it): 1,080 answers as the list
  says, nothing written, no secret in the log; 4 loosenings caught. REQ-204 read whole and
  ticked (its same-origin clause moved to REQ-517). C155: a story stopped on a 5xx now says what
  its API logged. The 78 open items each given a proposed answer (`spec/CHECKLIST-API.md` §3.1)
  for the user; KD-78 found (12.3.3: plain hops inside the stack's network). What it leaves:
  C158. **Part 4 (added by ADR-512):** the 78 as the user answers them: each approved scenario
  a file 10 row and its test, each docs answer written, each phase's brief told; the 25 built
  items' rows or cited tests. **The user approved §3.1 whole and chose to encrypt every hop
  (ADR-513).** **Part 4, first piece done (ADR-513):** 21 items answered by a scenario:
  AC-10-57…66 (a path or query decoded once, a key once; `__proto__` refused; a form or plain
  text refused 415; an answer written by the serializer; `TRACE` not found; the log one JSON
  object a line; every number held to its column; no secret in a path or query, no address a
  caller can steer; one email address, kept whole; the door's and the boundary's refusals
  logged), and AC-10-27, 30, 35 and AC-04-24 read as answering 6.3.4, 8.1.1, 8.1.2, 1.2.2.
  Found and fixed: a form's body read like JSON; a setting past its column answered 500. 8
  loosenings caught. What it leaves: C159. **Part 4, second piece done (ADR-514):** 40 of the 57
  marked: 8 not used (grep), 7 a phase's (told in REQUIREMENTS-LATER), 25 built with their tests,
  V11's table of primitives; strict equality made a lint rule (`eqeqeq`), the object store away
  tested (16.5.2); 4.2.1 found short (KD-79) and moved to part 5; an authenticator's HMAC-SHA-1
  proposed as 11.4.1's departure. What it leaves: C160. **Part 4, third piece done, and part 4
  with it (ADR-515):** the 14 written answers (`spec/CHECKLIST-API.md` §5; every way in as one
  table, ARCHITECTURE §6); §2's 25 earlier built rows each read against its test, 4 now citing
  one; API10's last two answers proposed. Found short: a key can't be replaced in place (11.2.2,
  to 5a, REQ-517); the worker reads the map servers' answers unbounded and unchecked (API10, to
  part 5). What it leaves: C161.
  **Part 5 (added by ADR-513; KD-78):** every hop of the local stack encrypted (the proxy to the
  API, the stories' API, the object store, the mail catcher, the routing and address servers;
  Postgres with `verify-full`; SMTP with TLS), and 15.3.2's test on an HTTPS server of its own;
  and 4.2.1's containers hardened with a test of `compose.yaml` (KD-79, ADR-514); API10's two
  answers as proposed (the map servers' answers bounded, timed whole and checked; a mail
  server's refusal tested; ADR-515, agreed, ADR-516), on the same HTTPS test server as
  15.3.2's; done whole, not cut ahead of time (ADR-516). **Part 5 done, and 2.7.3 with it
  (ADR-517):** the stack's own root and a certificate per service (`infra/local/src/certificates.ts`),
  Caddy issuing from it and reaching every service over TLS checked by name; the API and the
  stories' API serving HTTPS alone; Postgres `hostssl` alone, every login `verify-full` (Prisma's
  engine handed its own words); SMTP after STARTTLS alone; Valhalla behind its own Caddy; every
  container hardened, three departures named (`compose.test.ts`); 15.3.2 and API10 built
  (AC-10-67…70); the installer amends an earlier URL. KD-78, KD-79 closed; the checklist has none to
  do; C155, C156 closed. What it leaves: C162.
- [x] **2.7.4 The phase exit.** ✅ **done 2026-10-14 (ADR-518), whole.** The 14 REQs: 13 ticked
  (REQ-202 read whole: its last clause, the assignment taken at sign-in, was built by 2.5.2 part 3,
  ADR-444), REQ-006 moved to Phase 3 with what Phase 2 delivered. The scenario count: file 10 70 of
  70, the Phase 2 part of section M's 49 proven at the API (28 whole, 21 with a Phase 3 or 4 part);
  32 rows still reading "in part" though built were read and marked; AC-07-91 given a test of its
  own (every answer to a phone's call, three loosenings caught). Phase 3's REQs refreshed (each
  says what the server already does), REQ-006 carried, REQ-322…324 new (certifying on a phone,
  the field app's MASVS checklist, accessibility); C157 re-filed to Phase 4 (REQ-408), C162 (a)
  and (c) to Phase 3 (REQ-006, 308); the register mapped to Phase 3's REQs (below, "For Phase 3").
  The state files turned to "Phase 3 is the user's to open". What it leaves: C163.
  *As planned:* The 14 REQs ticked or re-filed with an ADR (REQ-006 can only be
  finished by the web apps); the scenario count by part; Phase 3's REQs in `REQUIREMENTS-LATER.md`
  refreshed against what was built; the state files turned to "Phase 3 is the user's to open".

###### Milestone 2.8 — What the audit found, closed *(reopened by the user 2026-10-14, ADR-519)*

**Why.** The audit of 2026-10-14 (ADR-519 (1)) found Phase 2's own server work moved on by
ADR-518's agent defaults or left "no task yet" in the register as tasks closed. The user: all of
it is Phase 2's. **The brief above holds for every task here**, with one change (ADR-519 (3)): the
reads the register names are built now, not with their screens. **At every task's close, no
"no task yet" of the server's is left standing:** each is filed under a task here or a named later
REQ in the same response (ADR-519's lesson).

- [x] **2.8.1 The register swept.** ✅ **done 2026-10-14 (ADR-522):** 228 unstruck lines aimed at
  Phase 2 tasks, or holding one of the four phrases, read against the code and the ADRs: 170 struck
  with the ADR that built them, 13 built in part and their rest re-filed, 45 re-filed whole; with
  every "no task yet", "not built", "not tried" and "found, no task" item that is the
  server's, struck and re-filed into 2.8.2…2.8.8 (each line below names its full list); two left
  to a later REQ by name (the harness's tower phone asking its lookup, REQ-124f; the exports'
  columns and a page's filters, REQ-408, 412), and an Esri layer moved into 2.8.5 with KML at the
  user's word (ADR-523); one decided (a
  `LOOKED_UP` address takes the phone's word, ADR-522 (3)); the "For Phase 3" map redone. *(docs)*
  Was: every entry C1…C164 read: each unstruck line aimed at a Phase 2 task read against the code, and
  struck with the ADR that built it, or re-filed; every "no task yet", "not built", "not tried" and
  "found, no task" item that is the server's (a service, an endpoint, a guard, a read, a test)
  written into the line of the 2.8 task that takes it, and what is the phone's or a screen's alone
  filed under a named Phase 3 or 4 REQ; the "For Phase 3" map redone. **Done when:** a search for
  unstruck Phase 2 task lines and for those four phrases finds none unfiled, and each of 2.8.4…2.8.8
  names its full list.
- [x] **2.8.2 A sync told to wait, never a 500** ✅ **done 2026-10-14 (ADR-524):** `503 BUSY` with `Retry-After` on every endpoint for a pool wait, an expired piece of work and a stopped statement; four policy values; the suite's 18th check and the harness's wait; a turn-in and a top-up ordered by the phone's row, both races and two parts at once held by tests; the neighbour read indexed (the measure asked); a shapefile's ring pairs bounded (the measure asked); the burst measured whole; three full `pnpm scenarios` in a row passed, `burst` with no 500 (C166 says what it leaves). *Was:* (**REQ-210**; C155, C162 (c)). Prisma's `P2028` (a
  transaction that couldn't start in time) and the pool's wait answered as a "wait" (503 or 429
  with `Retry-After`, decided in its ADR) on every endpoint, never 500; where it was seen:
  `NumberAllocator.writeAs` from `Sync.toppedUp`, `Sync.setupVersion`,
  `PhoneLoginList.passcodeBrought`; the phone (the harness's, and the suite's rule for any client)
  waits it out as it does a `429`; the pool's size and wait measured at the burst; AC-05-51's
  "never a server error" held by a test, and a file 10 row. **Filed by the sweep (2.8.1, ADR-522):** what a caller is told when its
  statement was stopped by the timeout (SQLSTATE 57014 is `INTERNAL` today, T-17, AC-10-40, 41;
  C87); a story's API keeping its error lines (kind and frames only, as the log is), so a 500 a
  story meets says why (C155); measured at the burst and written down: a sync's read of the
  project's setup to number it (`SetupVersions.shownIn`, C133), a phone's first sync's passcode
  check (C134), a turn-in naming 10,000 records and photographs and the count per phone against
  200 records a call (C141), a large map file's read and a map version's boundary read at each run
  (C140), two worker containers at once (C95), the neighbour read's scans by `cert_number` and
  `scale_receipt_id` (an index only if the measure asks for one, C154); tried and held by a test:
  two parts of one file sent at once (`PhotoFiles.oneAtATime`, C138), the share lock that orders a
  block cut against a turn-in, and two turn-ins of one phone at once (C141). **Done when:** three
  full runs of `pnpm scenarios` in a row pass, `burst` with no 500 in its API's log.
- [x] **2.8.3 The object store's own servers closed** ✅ **done 2026-10-14 (ADR-525):** `weed server` with every part on the container's loopback, S3 behind `objectstore-tls` (a Caddy in its network, the stack's proxy's forwarded name believed); thirteen ports refused from another container (`hops.test.ts`), the command and the sidecar held (`compose.test.ts`); AC-10-72; door's reset stands `429 LIMITED`; AC-10-32's real sign-in and enrolment read in the process's own log, the container held to log the same (C167 says what it leaves). *Was:* (**REQ-211**; C162 (a)). An ADR first:
  SeaweedFS's master, volume and filer (and their gRPC) bound to the container's own loopback, or
  the store on a network of its own with Caddy alone, read against ASVS 4.2.1 and 12.3.3; held by
  `compose.test.ts`, and each port tried from another container of the stack and refused
  (`hops.test.ts`); a file 10 row. **Filed by the sweep (2.8.1, ADR-522):** door's AC-10-32 reading the container's log after
  a real sign-in and an enrolment, not only a reset (C85); and its fourth run in an hour meeting
  the running API's reset limit (3 an hour, in memory) as `429`: the test or the container made to
  stand it (C161 (b)).
- [x] **2.8.4 What is held for a person, resolved** ✅ **done 2026-10-14 (ADR-526):** the held records, files set aside and quarantined records read by the back office (`GET /held-records`, `/set-aside-files` and a file's bytes, `/quarantined-records`); a held record saved as corrected (correct) or closed (void), a file set aside closed (void), each once, by a person, with a reason, audited, the database holding it; a photograph whose record is held kept with it, saved; a report the server can't keep held too; turn-in confirms what a person resolved; the story `held-for-review` grown to it; the sweep's four done (C168 says what it leaves). *Was:* (**REQ-212**; C106, C141; ADR-468). The held
  records, held photographs and files set aside that wait, read by project and phone with what was
  sent; each resolved by a person with a reason (saved as corrected, or closed as never to be
  saved: decided in its ADR), audited, its permission named; the quarantined records that wait
  read with what the phone sent and the record holding the number; a phone whose held things are
  resolved then turned in (the story `held-for-review` grows to it). **Filed by the sweep (2.8.1, ADR-522):** a file set aside read
  beside its photograph (`set_aside_file`, C139); the store's own SHA-256 check of a kept file
  tried (C136); held by a test: a phone's upper-case UUID given a lower-case place (`photoPlaces`,
  C137), and a file whose bytes no longer agree with the type it was kept under refused by
  `PhotographFiles` (C139).
- [x] **2.8.5 Setup records changed and archived at the API** ✅ **done 2026-10-15 (ADR-527, 528, 529):** 35 endpoints: the firm-wide records, contracts, forms, debris types' entries, every list's values (added too), pay items, rates, a crew day's steps, rules, sites, their labels and tipping fee links changed, archived and put back, each audited, queueing what it moves; searches paged; a project's first close kept; a merge says what still names the duplicate; a person's employer and an address cleared; a withdrawn assignment put back with its note; a map version or a site's shape from KML (and KMZ) or an Esri layer (its request held against SSRF, AC-10-77…80); a site's shape keeps its file's key; one migration and its guard (122); 3,091 tests, 22 stories, 12 security checks. **Then the user's answers to its defaults (ADR-529), built in the same task:** a closed project is closed (read-only, held by the database on its tables and the records under them; its assignments withdrawn and number blocks retired at the close; field work arriving later held, `PROJECT_CLOSED`; an admin reads what is open, closes, and reopens with a reason, audited; refused only while the worker has its jobs); archiving trimmed to a person and a list value (17 archive and put-back requests retired; a site's label and tipping fee link removed); a form's Enabled dropped; the contractor merge retired for the flag `SUB_NAME_ALIKE`; four migrations (126); 3,092 tests, 22 stories (`certification` 28 checks, the merge's gone), 12 security checks; 33 loosenings tried, all caught. What it leaves: C169. *Was:* (**REQ-213**; REQ-105e; C98…C100
  and what 2.8.1 adds). A client, a declaration event, a contractor, a contract: their fields
  changed, archived, put back; a form (its name, enabled, "GPS required", what an incident offers)
  and a debris type on it archived; a list value archived and put back; a pay item archived and
  put back; a prime's rate; a rule archived; a site's label, the site archived, its tipping fee
  link archived; a search paged; a project closed twice keeps its first close. Each behind Setup,
  audited, queueing what it moves. **Filed by the sweep (2.8.1, ADR-522):** a form's debris type, a pay item, a prime's rate and a
  rule each put back as well as archived, and a crew day's steps given a service
  (`pay_item_crew_day_step` has none: a `PER_DAY_STEPS` pay item can be entered and its steps
  can't, C99); a site's shape version keeping its file's key (a column, C140); a contractor merge
  that finds rule picks, employers or viewers naming the duplicate says so (today it moves
  certifications and places only, C62); a person's employer and the employer's ID for them set by
  a request (AC-02-03; `PATCH /people/:userId` changes neither, C101, C113, C115); a person's email
  address cleared, and a contractor user whose contractor is archived brought out of the archive as
  they were (C101); a withdrawn assignment put back, and a note on a withdrawal (C103).
  **Moved in by the user (ADR-523; from REQ-124b, where ADR-485 had left both for Phase 4):** a map
  version or a site's next shape loaded **from a KML file**, on the map file's own route beside the
  zipped shapefile and GeoJSON (ADR-485; its reader pinned by its own ADR, or written in the
  domain), and **from an Esri feature layer link**: the API reads the layer through Esri's REST
  query asking for GeoJSON in WGS84, keeps that copy as a version naming the layer's address, and
  "Refresh from Esri" takes a new one (ARCHITECTURE §3); a secured layer's token kept as a secret
  (§4); the server's own request to the firm's address held against server-side request forgery
  (HTTPS only, no redirect followed, bounded and timed whole as `AddressServer` is, never one of the
  stack's own names or private addresses unless the firm states it: its ADR, read against OWASP
  API7:2023 and ASVS 5.0's SSRF item), each refusal answered in plain words. The screen stays
  Phase 4's (REQ-124b).
- [x] **2.8.6 A lost phone's key revoked after the firm's time, and the firm's settings** ✅ **done 2026-10-15 (ADR-530):** the firm's settings record (one row, seeded from `PHONE_KEY_REVOKED_AFTER_HOURS`, 24; the hours by an admin or Setup, the viewers' two-step by an admin alone, each audited); a phone's mark; the worker's backstop at each pass, revoking as the system actor once the firm's hours have passed since the mark, its blocks retired whole, `DEVICE_KEY_REVOKED`; the database's guard amended (`keyRevokedBy`: `TURN_IN` · `FIRM_TIME`; the firm's time checked by its own clock; such a key turned in once, its time kept; it still answers a challenge); such a phone proves itself with its key and the passcode together, its token opening only what `keyRevokedToo` marks (seven endpoints), its sync topping up nothing; ARCHITECTURE §7.4's note; the viewers' two-step at their very next request. **The sweep's list, all of it:** `installer:check` names the policy values in force (C53); the passcode's 8 and 128 policy values, read by the installer too; a phone renamed, a removal time stated, a reason from the list (`PHONE_REMOVAL`), a lost phone made retired, a found one put back (C102); a proven phone with nobody signed in reads no lists, decided (C120, C133); a person removes their own authenticator with a code from it (C91); the authenticator's mail found built and tested since ADR-412 (C101). Three migrations (129; the third takes back a `session` grant the second gave the worker, AC-10-11 caught it); the story `lost-phone-key` (14 checks); AC-10-83…87. What it leaves: C170. *Was:* (**REQ-214**, **REQ-215**; the user's #4, ADR-519 (7), **answered by ADR-520**; C157). **Decided
  (ADR-520):** only a phone marked lost or retired; its clock from that mark (the later, where it
  has both), never its last sync; 24 hours by default, or off; a phone revoked so may still sync
  and be turned in under the master passcode (its after-removal work flagged), a turn-in's
  revocation staying final. Built: a firm-wide settings record (its guard migration, audit, read by the API and the worker); its
  endpoint, open to an admin or a person holding Setup; the built-in default (24 hours, or off) a
  policy value; the worker's look for phones out of service past the firm's time, revoking as the
  system actor, retiring their blocks whole, with a security event; the database's guard on
  `keyRevokedAt` amended to allow that and nothing else, the two kinds of revocation told apart;
  how a phone revoked by the timer proves itself to sync and turn in under the passcode (its ADR); ARCHITECTURE §7.4's text; and the firm's
  choice of two-step for viewers on the same record (C157: a viewer with none set up sent to set
  one up at their next sign-in). **Filed by the sweep (2.8.1, ADR-522):** `installer:check` reporting the policy values in force
  (C53); the master passcode's 8 and 128 as policy values, read by the installer too (two
  constants today); a phone renamed, a found phone put back in service, a removal time stated by
  hand, a lost phone made retired, a list of reasons for a removal (C102); whether a proven phone
  with nobody signed in may read the lists and the login list of an assignment that names it (an
  access rule, API1, with its own test of every assignment that is not the phone's; left by ADR-473,
  474 to 2.6.5, which did not decide it: C120, C133); a person replacing or removing their own
  authenticator by a code from it (today an admin clears it; the page is Phase 4's, C91); a new
  authenticator and one cleared told to the person by mail (ASVS 6.3.7, C101).
- [ ] **2.8.7 Every captured field correctable, and records made in the back office**
  (**REQ-216**; REQ-105g; C79, C80, C106, C107). An ROE's number (its records re-pointed); the
  answers to a form's own fields; a certification's driver, tag, vehicle type, prime and subs; a
  box's shape, sign and feature, a box added or taken off; un-revoking; an acceptance taken back;
  an ROE, a survey, an incident and a drop-off log created in the back office; **a certification
  created (or a replacing one) in the back office from the paper sheet when the phone failed (the
  user, ADR-521: "Yes")**, its source, person and reason recorded, reconciling as one made on a
  phone. ADR-521 (2) leaves to this task's ADR: its permission, its certifier, its cert number's
  source, and how its five photographs reach the store from the back office. **Filed by the sweep (2.8.1, ADR-522):** a guard at
  the database on a locked ticket's field events (today the review services refuse the change, C81);
  AC-10-16 tried on the void's own endpoint without its CSRF value (a test's own write stands in,
  C90); a field event made in a session under the passcode opened as the phone's monitor
  (`AS_MONITOR`) marked as ARCHITECTURE §7.2 and AC-02-42 say (`temporarySession` is the one mark
  today: a second column, or one saying which; asked of the user if it changes what a reviewer
  sees, C124).
- [ ] **2.8.8 The back office's reads and bulk acts** (**REQ-217**; C98…C107, C148 and what 2.8.1
  adds). Each read a request of its own, tested as every kind of caller (`every-endpoint.test.ts`):
  the review queue, a ticket with its flags and marks, a field event with its lines, carried
  tickets and photographs, a scale receipt, certifications with their boxes, a project's sites and
  map versions, invoice batches and what each holds, ROEs, surveys, incidents and drop-off logs,
  the board searched; QC and a lock for many tickets in one request. **Filed by the sweep (2.8.1, ADR-522):** a project's forms,
  its pay items with their rates (a read taking Setup; a viewer never a rate) and its rules, and
  "what it would change" before a setup save (ADR-229, C99); a project's sites, its map versions
  and their shapes, and a kept map's file read back (C100, C140); people searched and ordered by
  name (C101); the board searched by person or phone across days and projects, with its warnings
  (a second assignment for one person or phone on a day, a date outside the project's window, a
  closed project, pay items named with no unit rate work, a site not yet active or closed: C103,
  C115); an invoice batch renamed or archived (C81, C104); a certification read with what it was
  saved with (a sub placed elsewhere, ADR-472 (12); C107); a query's repeated key refused unless
  its schema names an array (C86); **and the viewers' reads of the same records** (ADR-520 (3);
  C67, C100, C108, C109, C139), through `ViewerReads` and the viewer views, each kind of viewer's
  sight as built: a ticket's flags, photographs (whether a viewer may read a file is decided here),
  scale receipt, item lines, carried tickets, lock and batch; certifications; surveys, incidents and
  drop-off logs (`viewer_drop_off_log_citizen` declared); an ROE's parcel, address and scope;
  setup, the setup check and the lookups for a client user and an auditor. The exports and a
  page's filters stay Phase 4's (REQ-408, REQ-412).
- [ ] **2.8.9 Phase 2's exit, again.** ADR-376's seven criteria and ADR-519's three (`NEXT.md`):
  the register holds no server "no task yet"; **`SUMMARY.md` §4's agent defaults put to the user on
  one page**, each confirmed or overturned; three full `pnpm scenarios` runs in a row; the 22 REQs
  ticked or re-filed with an ADR; the scenario count again; the state files turned.

**Every one of Phase 2's 22 REQs is named by a task:** 004 → 2.1.3, 2.6.1 · 006 → 2.1.2, 2.7.4 ·
016 → 2.6.2 · 201 → 2.4.2…2.4.5 · 202 → 2.2.3…2.2.5 · 202a → 2.5.1, 2.6.5 · 202b → 2.2.3, 2.5.4, 2.6.5 ·
203 → 2.5.3, 2.6.1…2.6.5 · 204 → 2.1.3, 2.2.6, 2.6.5, 2.7.3 · 205 → 2.7.3 · 206 → 2.3.1…2.3.3 ·
207 → 2.4.1, 2.6.4 · 208 → 2.1.4 · 209 → 2.5.1, 2.6.5 · 210 → 2.8.2 · 211 → 2.8.3 · 212 → 2.8.4 ·
213 → 2.8.5 · 214, 215 → 2.8.6 · 216 → 2.8.7 · 217 → 2.8.8.

---

##### Done — Phase 1: Data core and engine, rebuilt *(opened by the user 2026-10-01, ADR-299; its plan is ADR-300; exit met 2026-10-06, ADR-371, 372)*

**What Phase 1 is.** The whole product without a screen or an endpoint: every setup record, the
certification and its capacity, field events and their numbers, sync intake with quarantine,
reconciliation, the rule engine, the ledger and audit, review, QC and the invoice lock. **Done when
the golden mission runs from a terminal and comes out with the statuses, review queue, ledger and
audit trail the user signed off** (`spec/golden/MISSION.md`: P1 $5,548.25 on 19 lines, P2 $324.00),
every Phase 1 scenario in `spec/acceptance/` passes at the engine, and all 98 Phase 1 REQs are
ticked from runs that were seen. Exit criteria: `NEXT.md`.

**The order** is `ROADMAP.md` §4's: setup records → certifications and capacity → tickets and
numbers → sync intake with quarantine → reconciliation → the rule engine → the ledger and audit →
review, QC, invoice lock and batches → the golden mission. Each milestone builds one part of
`spec/INDEX.md`'s book.

###### Brief for every Phase 1 task (ADR-300)

- **One task per response.** Each ends with real observed output (`adms-verify`), the close-out
  (`adms-close-out`) and the user's git block with named paths. Don't tick a box on "should work".
- **Read first:** the task's part page and its acceptance file (`spec/acceptance/`); the records in
  **`spec/DATA-MODEL.md`** (every model, field and enum name comes from it, never from memory or
  prose); the owning skill; the flag wording in `spec/FLAGS.md`; the task's carried items in the
  register below. Examples, fixtures and seeds: `spec/CONVENTIONS.md` §6 and the golden mission.
- **Inside a milestone:** the part's acceptance scenarios first, then the schema, then the rules,
  then the story. **No milestone's code starts before its part's scenarios are written.**
- **A schema task:** the model in the right `.prisma` file (by kind of record) → Prisma writes the
  migration (`prisma migrate dev --create-only --name <what>` in `packages/db`; never hand-written
  SQL for a table, column, index or relation) → a guard migration in its own empty `--create-only`
  stub: `SELECT guard_table('<table>', '<CONFIGURATION|MARK|EVIDENCE|DERIVED>', '<domain>'[, …]);`
  and any check the model needs (ADR-113, 271) → applied by `pnpm installer` → the exact lists in
  `grants.test.ts` and `catalog.test.ts` extended → **a row-level-security decision** for each table
  a viewer sees (C18, C22; since ADR-315 one line, `SELECT guard_viewer(…)`, and a row in
  `test/support/viewers.ts`, C59) → the example world (`packages/db/test/support/example-world.ts`)
  extended → tests named by scenario ID → each new guard's removal shown caught on a throw-away
  copy (as ADR-272). `prisma migrate dev` wants a terminal when a migration carries a warning
  (`adms-verify`, "The schema").
- **A provisional model that changes shape** takes its tests and both stories with it in the same
  task. A test is rewritten for the new shape, never loosened; a threshold or a unique key is never
  relaxed to pass.
- **A rule task** (`packages/domain`): plain classes, no Postgres, no dependency; unit tests named
  by scenario ID, their numbers from the golden mission or a skill's worked example; thresholds from
  settings, never literals (invariant 16).
- **Where the code lives** (ARCHITECTURE §2, §18; settled for each kind of code by the ADR of the
  first task that writes it): every rule in `packages/domain`; the reconciliation run in
  `apps/worker`, as `adms_worker`; what a phone or a person writes (intake, setup, corrections,
  marks) as plain service classes in `apps/api`, as `adms_api`, with no HTTP until Phase 2 wraps
  them; all through `db.$write(actor, …)`. The scenario harness drives both.
- **Every dependency and every Postgres extension gets an ADR first** (exact version, licence,
  maintenance; `pnpm licences` and `pnpm security` after).
- **Not Phase 1's:** endpoints, sign-in columns and the sync contract (Phase 2); the phone (Phase
  3); screens, exports and the time clock's tables (Phases 3–4). Don't build ahead.
- **A REQ is ticked, and a scenario marked passing, only from a run you saw.**
- Docker's disk here is 8 GB (`NEXT.md`, Tools and housekeeping); stop the stack at close-out.

###### Milestone 1.0 — Open the phase
- [x] **1.0.1** ✅ **done 2026-10-01 (ADR-299, 300):** the phase opened at the user's word; this
  plan; `spec/acceptance/README.md` (how a scenario is written and proven).

###### Milestone 1.1 — Setup records (Part 1; DATA-MODEL §2, §3)

> **2026-10-02, the user's correction (ADR-301), done outside the task order because a Phase 0 test
> stated the old reading:** a pay item's code is unique on its project and it has a description, no
> name (one Prisma migration, the test now AC-01-41, the story `dispatch-monday`); every page and
> skill that said codes may repeat, or "the contract's words and line number", corrected; an exact
> duplicate of a rule is to be refused before save (built in 1.1.8).

Carried: C36, C42, C52, and C18's first part; C54 (1.1.10) and C53's first part (1.1.11), filed
by ADR-303 (named here by ADR-307). Closes the behaviour of KD-14, 16, 17, 18, 29, 39, 47.

- [x] **1.1.1** ✅ **done 2026-10-01 (ADR-300):** `spec/acceptance/01-setup.md`, 80 scenarios (81 since ADR-301, 82 since ADR-306) from
  Part 1, each naming its source, where Phase 1 proves it and the task that does; six points nothing
  settles are listed for the task that decides each.
- [x] **1.1.2** ✅ **done 2026-10-02 (ADR-302):** eighteen list models and three enums, two
  migrations (`the_firms_lists`, `guard_the_firms_lists`: 22 in all), `builtInKeys` in
  `packages/domain`, `guard_list` (one line per list), the seed's 94 starting values; AC-01-31, 32,
  34…38 pass at the database (and AC-01-78 for these tables); `guard_gaps()` empty; 29 loosenings
  each caught; chain 28 files, 485 tests. **The firm's lists.** The eighteen list tables of DATA-MODEL §2.3 (one table per
  list, §12 default 1, approved), each with its own columns and its three enums (`CountShape`,
  `ReasonUse`, and `VehicleType.certifies`); the built-in keys as one closed set in
  `packages/domain`; the seed values of `spec/LISTS.md` written by the installer's seed, so an
  upgrade can add a built-in value without touching the firm's own (the ADR settles the seeds
  LISTS.md leaves open: `01-setup.md`, point 6). A built-in value can't be archived. **Done when:**
  AC-01-31, 32, 34…38 pass as database tests; `guard_gaps()` is empty; the chain is green.
  *REQ-106c; REQ-101 (the library).*
- [x] **1.1.3** ✅ **done 2026-10-02 (ADR-303):** `Client`, `DeclarationEvent`, `TicketNumberSource`,
  the project's fifteen new columns and `ProjectKindOfWork`; two migrations
  (`client_declaration_event_project`, `guard_client_declaration_event_project`: 24 in all);
  `Policy` and `NewProjectSettings` in `packages/domain`, the release's built-in defaults in
  `packages/domain/policy.env`; no setting has a database default; a new project's time clock
  starts switched off, not offered to its workers until the firm switches it on (`01-setup.md`,
  point 2; confirmed by the user, ADR-304); AC-01-02…08 and 11…14 pass (06 and 11 at the domain, the
  rest at the database); `guard_gaps()` empty; 55 loosenings each caught; chain 31 files, 562 tests;
  stories 16 and 16 checks. REQ-105b, 105c, 105f, 124d ticked; **REQ-105d and 105j not ticked**
  (their checks and flag: 1.5.7, 1.5.5; C55). **Client, declaration event, and the project in full.** `Client`,
  `DeclarationEvent`; `Project` gains its client, declaration event, program type, *Allow split
  loads*, window, ticket-number source, workflows and settings; `ProjectKindOfWork`; the settings'
  defaults in `packages/domain`, read from policy values. The example world and both stories move to
  the new shape. **Done when:** AC-01-02…08 and 11…14 pass. *REQ-105b, 105c, 105d, 105f, 105j, 124d;
  REQ-105k's source (its series: 1.3.2).*
- [x] **1.1.4** ✅ **done 2026-10-02 (ADR-305):** `ContractorKind` and `ContractorPosition`,
  `Contractor.kind` (no default) and `mergedIntoId`, `ProjectContractor` (with `asPrimeId`, the key
  "the prime" points at) and `Contract`; two migrations (`contractors_on_a_project_and_contracts`,
  `guard_contractors_on_a_project_and_contracts`: 26 in all); `01-setup.md`'s point 1 settled: the
  database refuses a contract, or a sub, whose prime isn't one of the project's primes, by a
  two-column foreign key; AC-01-15…18, 20, 21 pass at the database (and AC-01-78 for these tables);
  `guard_gaps()` empty; 51 loosenings each caught; stories 16 and 17 checks. **At the user's word
  the same day (ADR-306): a contractor holds contact details** (`contactName`, `contactEmail`,
  `contactPhone`, as a client; the migration `contractor_contact`, 27 in all; AC-01-82 added and
  passing). Chain 32 files, 604 tests. **REQ-106e not ticked** (its subs at certification and what
  a merge moves: 1.2.3, C56).
  **Contractors on a project, and contracts.** `Contractor.kind` and its merge link,
  `ProjectContractor` (prime, tier 1, tier 2; one place per project), `Contract`. **Done when:**
  AC-01-15…18, 20, 21 pass. *REQ-106e's tiers (its subs at certification: 1.2.3).*
- [x] **1.1.5** ✅ **done 2026-10-02 (ADR-308):** `FormDocumentType`, `Form`, `FormDebrisType`,
  `FormDefinition` and `Assignment.formDocumentTypes`; two migrations
  (`forms_debris_types_definitions`, `guard_forms_debris_types_definitions`: 29 in all); KD-66's six
  points settled as agent defaults (a definition per project form; the database refuses a definition
  on any form but an ROE, survey, incident or drop-off log form, and a debris type on any form but a
  load or haul-out one, by a two-column foreign key to the form and its document type; versions from
  1, unique per form, never edited by anyone: `refuse_edit`; `Form.enabled` read only on the forms
  that aren't a workflow's; an assignment names only those four forms); `DebrisTypeEntries` in
  `packages/domain` (what a phone's list offers; the unreduced warning) and `formDefinitionFields`
  in `packages/contracts`. AC-01-22…26 and 28…30 pass (25 and 26 at the domain, the rest at the
  database), AC-01-27 in part (the field events still pointing at an archived entry: 1.3.4); AC-01-80
  gains the two new refusals; `guard_gaps()` empty; 28 loosenings each caught. REQ-105a ticked; REQ-101
  and REQ-107 not (a field event's pick, 1.3.4; the records, 1.3.6).
  **Forms, debris types, field tags, the firm's own fields.** `Form`,
  `FormDebrisType`, `FormDefinition` (a version never edited or deleted, guarded like
  `MasterPasscode`), `FieldTag`'s project list in use, `Assignment.formDocumentTypes` (C42). **Done
  when:** AC-01-22…30 pass. *REQ-101, 105a; C36's definition.*
- [x] **1.1.6** ✅ **done 2026-10-02 (ADR-309):** `BillingUnit` and `CrewTimeConversion`;
  `PayItem`'s every field, `PayItemRate` (one per prime, the prime held by ADR-305's key; `id`,
  `projectId`, `createdAt`, `archivedAt` besides §3's three) and `PayItemCrewDayStep`;
  `AssignmentPayItem.kindOfWorkId`, so an assignment names only unit rate pay items (C42's pay item
  done); two migrations (`pay_items_in_full`, `guard_pay_items_in_full`: 31 in all); `SizeBands`
  in `packages/domain` (an overlap refused, naming each band; a gap warned) and the policy value
  `CREW_DAY_HOURS=12`. AC-01-39…47 and 49…51 pass (45 and 46 at the domain, the rest at the
  database), AC-01-48 in part (the worker's checks: 1.5.7); `guard_gaps()` empty; 26 loosenings
  each caught; chain 37 files, 687 tests; stories 16 and 18 checks. REQ-102 and REQ-112d ticked;
  REQ-112e in part (billing the highest item's hours: 1.7.1).
  **Pay items in full.** `PayItem`'s every other field (its code, unique on its
  project, and its description are built, ADR-301; AC-01-41 passes), `PayItemRate` (one per prime),
  `PayItemCrewDayStep`; the size-band rule in `packages/domain` (bands of one payable type can't
  overlap; a gap warns). `AssignmentPayItem` and `dispatch-monday` follow. **Done when:**
  AC-01-39…51 pass. *REQ-102, 112d; C42's pay item.*
- [x] **1.1.7** ✅ **done 2026-10-02 (ADR-310, 311):** `DisposalSite` in full (type and the type's
  key, four facts, permit, GPS, dates, short code), `DisposalSiteLabel`, `DisposalSiteTippingFee`
  (several per site, in place of DATA-MODEL's one link: KD-67, confirmed by the user, ADR-312), `SiteAreaVersion`, `MapVersion`,
  `Zone` (never edited or deleted; a zone only with its version); `SiteAreaSource`, `MapSource`;
  the database refuses *Haul-outs leave here* off a TDSR/DMS site (C52 settled), and setup says so
  first (`SiteFacts` in `packages/domain`); shapes as GeoJSON (point 5 settled); and, at the user's
  word, `btree_gist` and the database's refusal of overlapping size bands (ADR-310). Four migrations
  (`disposal_sites_and_the_project_map`, its guard, `guard_size_bands_never_overlap`,
  `guard_map_shapes_hold_their_type`: 35 in all). AC-01-52, 53, 56…59 pass at the database, 54 at
  the domain and the database, 55 in part (its flag: 1.5.6); AC-01-45 at the database too.
  *REQ-104, 105q ticked; C42's site done.* **Disposal sites in full, and the project map.**
- [x] **1.1.8** ✅ **done 2026-10-03 (ADR-313):** the five models with their guards (two migrations, `rules` and `guard_rules`: 37 in all; 53 models); a rule held to a ticket form and a contract of its own project, a picked value to the rule's own project and form, an operator to its criterion's kind, by foreign keys and checks; in `packages/domain`, `RuleCriteria`, `RuleValidity`, `ProjectRules` (the copy refused, the overlap warned, a "Pays when" rule changed only from its pay item) and `PaysWhen`. AC-01-60 passes at the database, 61…67 and 81 at the domain, 64 at both, and AC-01-78 for every setup table; `guard_gaps()` empty; 35 loosenings each caught; chain 41 files, 834 tests. *REQ-125a ticked; REQ-131c's storage built (it stays open for its rates, 1.6.3).* **Rules.** `Rule`, `RuleCriterion`, `RuleCriterionPick`, `RuleAction`,
  `RuleActionItem` with `RuleCriterionKey`, `RuleOperator`, `RuleActionKind`, `QuantityFrom`; in
  `packages/domain`: which criteria and operators a form takes (`spec/RULES.md` §4, §4a), "Is valid"
  (§7), the overlap warning, **the refusal of an exact duplicate of a rule before it is saved**
  (ADR-301), and the rules a pay item's "Pays when" writes. **Done when:** AC-01-60…67 and 81 pass. *REQ-125a; REQ-131c's storage (its rates: 1.6.3).*
- [x] **1.1.9** ✅ **done 2026-10-03 (ADR-314):** 74 scenarios; 28 are what Phase 0 built (and ADR-286, 308, 309), each naming the test that proves it, seen passing that day (six test files, 136 tests; the story `dispatch-monday`, 18 checks), and AC-02-38 and 49 in part; seven (and two in part) are 1.1.10's; 28 are for Phases 2–4 only; ten points nothing settles are listed for the task that decides each. `spec/acceptance/02-people-and-devices.md`, from Part 2: what Phase 0 built is
  marked as built; what waits for Phases 2–4 names its phase.
- [x] **1.1.10** ✅ **done 2026-10-03 (ADR-315):** `UserPermission`, `ViewerProject` (table `user_viewer_project`), `User.viewerKind`, `email`, `phone`, `Device.keyRevokedAt` (two migrations, `permissions_and_viewers` and `guard_permissions_and_viewers`: 39 in all; 55 models); the viewer of a request read from their own record (`adms.viewer_id`); `guard_viewer`, one line per table, on 41 setup tables and lists, with `viewer_project_setup` for the project's settings; a contractor user sees no setup, no viewer a contact or a person. AC-02-05, 06, 09, 10, 11, 69 and 70 pass at the database, with the database's part of 61 and 71; the 28 Phase 0 scenarios carry their IDs; `guard_gaps()` empty; 35 loosenings each caught (one only after a test gained its case: a project written against a person who is no viewer); chain 43 files, 859 tests. *C54 done; C18's first part done; C47's column built.* **People's permissions and viewers.** `UserPermission`, `ViewerProject`,
  `User.viewerKind` and contact fields, `Device.keyRevokedAt` (its refusal is Phase 2's, C47);
  row-level security for every setup table a viewer sees (C18). **Done when:** the Part 2 scenarios
  marked for the database pass (AC-02-05, 06, 09, 10, 11, 69, 70, and the database's part of 61 and
  71), **and the 28 scenarios Phase 0 built carry their IDs in their tests' names** (ADR-314: the
  file names each test; a rename, never a loosening). It decides the file's points 1…6 (how a
  permission is taken away, what a contractor user sees of setup, contact details, a contractor
  user with no contractor, the audit domain, `ViewerProject`'s table name).
- [x] **1.1.11** ✅ **done 2026-10-03 (ADR-316):** seven setup services in `apps/api/src/setup/` and the policy loader; `MapShapes` in `packages/domain`; the story `setup` (51 checks: P1 by Dana, P2 by Luis, every record as the mission's §1, one audit record per row, thirteen refusals); a map version's loaded time stamped by the database (the fortieth migration; KD-68 closed); AC-01-01 and 79 pass, AC-01-80 in part; REQ-105e, 108 ticked; chain 44 files, 867 tests; stories 16, 18, 51. **The example world's setup as a story.** The golden mission's §1, P1 and P2,
  written in the spine's order through the API's setup services as the people who make it; every
  record asserted, one audit record per write. **Done when:** `pnpm scenarios` runs it (AC-01-01,
  78…80). *REQ-105e, 108; REQ-142's setup part; C30's first part.*

###### Milestone 1.2 — Certifications and capacity (Part 3)

Carried: C56 (1.2.3), filed by ADR-305 (named here by ADR-307). Closes the behaviour of KD-10, 11,
45, 46, 48.

- [x] **1.2.1** ✅ **done 2026-10-03 (ADR-317):** `spec/acceptance/03-certification.md`, from Part 3 and `adms-certifications`, the
  capacity examples taken from §3A.3 and the paper form, never from `development/`. 60 scenarios;
  fourteen points nothing settles listed for the task that decides each (1.2.2: two; 1.2.3: most);
  KD-69 raised (the mission's 102001 scans `730416` on P2; a copy gets a new number) and closed
  by the user the same day (ADR-318: the mission stands; a cert number is unique per project only).
- [x] **1.2.2** ✅ **done 2026-10-03 (ADR-320):** `Capacity` in `packages/domain/src/capacity.ts`, exact
  hundredths, 24 tests (AC-03-21…29, 31, 32 by ID); the three containers' boxes in
  `spec/CONVENTIONS.md` §6; C61's two points decided as agent defaults. **Capacity math in `packages/domain`**, exactly `adms-certifications` §3A.3: whole
  inches, the primary box and boxes 1…N, each shape, add or subtract, hundredths at each step,
  ÷ 46,656, a whole CY half up; no override. **Done when:** every worked example of §3A.3
  passes as a unit test, and the example world's three containers are given measured boxes that work
  out to their 65, 48 and 110 CY (recorded in `spec/CONVENTIONS.md` §6; the mission states only the
  capacities); a crew has none. *REQ-106d; REQ-003's first rule.*
- [x] **1.2.3** ✅ **done 2026-10-03 (ADR-321):** `Certification`, `CertificationBox`,
  `CertificationHelper`, `BoxShape`, `BoxSign`; three migrations (`certifications`, its guard, and
  `map_version_loaded_at_default_prisma_reads_back`, KD-70: 43 in all); a box repeats its
  certification's kind, so only a container holds one, and two deferred constraint triggers hold a
  container to its primary box; a sub held to its own prime's place by a three-column foreign key;
  `guard_viewer` on all three, the driver's phone and licence number hidden; `CertificationSubs`,
  `CertificationChanges` and `ContractorMerge` in `packages/domain` (17 tests); the service
  `Certifications` (`apps/api/src/certification/`), `SubPlaces` and `ContractorSetup.merge`; the
  story `certification` (27 checks). 25 scenarios pass, and AC-03-22, 26, 29 in full (36 of 60);
  AC-01-19 passes; `guard_gaps()` empty; 41 loosenings each caught; chain 47 files, 956 tests.
  REQ-106, 106b, 106d, 106e ticked; REQ-106a and 106f in part (blocks: 1.3.2; flags: 1.5.5).
  **The certification's records.** `Certification` (container or crew; unique per
  project by cert number; prime and subs; driver, tag; who certified; replaces, copied from, revoked
  from), `CertificationBox`, `CertificationHelper`; a sub typed in at certification becomes a
  `ProjectContractor` row under its prime (AC-01-19). **Done when:** Part 3's database scenarios
  pass. *REQ-106, 106b, 106e; REQ-106a's uniqueness; REQ-106f's records (its flags: 1.5.5).*

###### Milestone 1.3 — Tickets and numbers (Part 4, the data)

Carried: C43, C44, C36's answers. Closes the behaviour of KD-13, 22, 23, 24, 27, 37, 41, 43, 44.

- [x] **1.3.1** ✅ **done 2026-10-03 (ADR-322):** 98 scenarios of what is recorded; none marked
  passing (nothing was run; seven restate a guard Phase 0 built and are marked when 1.3.3 names the
  test by its ID); eighteen points nothing settles listed for the task that decides each (C63).
  `spec/acceptance/04-field-capture.md`, from Part 4, `adms-ticket-workflows`
  §4.0a–§4.6 and `adms-field-app`: what each field event records; the phone's screens name Phase 3.
- [x] **1.3.2** ✅ **done 2026-10-03 (ADR-323):** the two records, `ROE`, a block cut only from a series its project has; `number_blocks_never_overlap` (a reclaimed block holds only what its phone used) and `control_ranges_never_overlap`; `packages/domain`'s `numbers.ts`; `apps/api`'s `NumberAllocator`, and `Certifications.copy` numbered by it; the story `numbering` (15 checks). 20 loosenings each caught; chain 49 files, 1,018 tests; AC-04-01, 04…09, 13, 14, AC-03-06, AC-01-09 pass; REQ-105k, 106a, 114 ticked. **Numbering.** `ProjectNumberSeries`, `ControlRange`, `NumberSeries` gains `ROE`;
  blocks of one series never overlap (an exclusion constraint needs the `btree_gist` extension: its
  ADR first, C43); the number rules in `packages/domain` (100,001 to 9,999,999, 1,000-number ticket
  blocks, 100-number cert blocks, issued in order, reclaimed, retired); the server's allocator.
  **Done when:** two phones can never hold the same number, proven as a database test. *REQ-105k,
  106a, 114.*
- [x] **1.3.3** ✅ **done 2026-10-03 (ADR-324):** the shared columns of §4.1 (1), none with a database default; one check tells a phone's record from a back-office one (C44); a reason only on a typed number, a typed capacity only on a truck keyed in by hand, a GPS end whole and on the earth, an address with its source; the certification found and the site held to the field event's own project; `guard_table` rerun; `guard_viewer('field_event', 'PROJECT')` and `viewer_field_event_monitor` (who recorded it: name and Monitor ID); `packages/db/test/field-events.test.ts`, 21 tests by scenario ID; 16 loosenings each caught; the example world, the harness's phone and both early stories follow. AC-04-02, 03, 12, 15, 16, 18…31, 44, 94 and AC-03-40 pass. REQ-105i and REQ-115 stay open for 1.3.6 and 1.3.4. **`FieldEvent`, what every kind records.** The shared columns of DATA-MODEL §4.1
  (1): the source, a back-office-created record's person and reason with no phone, assignment or
  setup version (C44, with its check), the typed number and its reason, the certification as scanned
  and as found, the site, both GPS ends, the address. `guard_table` rerun; both stories follow.
  *REQ-105i, 115.*
- [x] **1.3.4** ✅ **done 2026-10-03 (ADR-325):** the columns of §4.1 (2) but the scale receipt and the ROE found (1.3.5, 1.3.6), none required; each held to its kinds by a check; a debris type held to its own project's form for its workflow, a field tag and a pay item to its project; a suffix only on a collection or a haul-out collection, capital letters; a split's suffix and estimate both or neither; `FieldEventItem` and `CarriedTicket`, each on its kind only; `guard_table` and `guard_viewer` rerun, the two tables seen with their field event; `packages/domain`'s `FieldEventDetails`, `packages/contracts`' `fieldEventDetailsSchema`; `packages/db/test/field-event-kinds.test.ts`, 38 tests by scenario ID, one trying every detail on every kind against the domain's table; 31 loosenings each caught; chain 53 files, 1,089 tests. AC-04-32…37, 40, 41, 43, 45…51, 53…58, 60…69 and AC-01-27 pass; AC-04-38, 52, 82 in part. REQ-103 and 112a ticked; REQ-105o, 110, 111, 111a, 112, 112b, 112e and 115 stay open for the worker, the phone and the two links. **`FieldEvent`, what each kind records.** (AC-01-27's other half: a field event
  that points at a debris type's entry still does once the entry is archived, ADR-308.) The kind-specific columns of §4.1 (2),
  each empty on every other kind by a check; a split load's suffix and estimate both or neither; a
  haul-out collection's suffix with its running call; `FieldEventItem`, `CarriedTicket`; the same
  both-or-neither rule in `packages/contracts`. *REQ-103, 105o, 110, 111, 111a, 112, 112a, 112b;
  REQ-112e's capture.*
- [x] **1.3.5** ✅ **done 2026-10-04 (ADR-326):** `ScaleReceipt` (the site's number as written, once per project, **never unique since ADR-331**; its site its own project's; every weight optional and none worked out; a gross or tare below nought refused) and `Photo` (exactly one owner of its own project: a field event, a certification or a scale receipt today, the other five joining with their tables in 1.3.6 and 1.4.2; a view only on a certification's; two fingerprints and two unique places in storage, written once); `FieldEvent.scaleReceiptId`, only on a disposal and a haul-out disposal, its own project's; `guard_table` and `guard_viewer` rerun on `field_event`, both new tables guarded and seen with their project (a photograph without where its file is kept); `packages/domain`'s `fieldEventDetails` and `packages/contracts`' schema gain the link; `packages/db/test/scale-receipts-and-photos.test.ts`, 16 tests by scenario ID; 31 loosenings tried. AC-04-71…78, 38, 39, 52 and AC-03-34 pass. REQ-126a ticked. **Scale receipts and photos.** `ScaleReceipt` (unique per project by receipt
  number; never confusable with a ticket number), `Photo` (exactly one owner). *REQ-126a.*
- [x] **1.3.6** ✅ **done 2026-10-04 (ADR-327):** `Roe` and `RoeScopeItem` (configuration, records domain: a number once per project; a phone's or the back office's; scope picked from its own project's load form or the payable types, each once) and `Survey`, `Incident`, `DropOffLog` (evidence: where each came from held by one check, as a field event's; a survey's ROE and a drop-off log's site its own project's); each record's answers with the definition answered, of its own project's form of its kind, or `{}` with none; `packages/contracts`' `formAnswersSchema` made from a definition's version (C36); `FieldEvent.roeId`, only on a collection and a unit rate event, its own project's; `Photo`'s four new owners; `guard_table` and `guard_viewer` rerun on `field_event` and `photo`, the five new tables guarded and seen with their project; `packages/db/test/roes-and-forms.test.ts`, 19 tests by scenario ID; 59 loosenings each caught; chain 56 files, 1,139 tests. AC-04-80…90 pass (82 now whole). REQ-105i ticked; REQ-107 stays open for the QC mark (1.8.2). **ROEs and forms.** `Roe`, `RoeScopeItem`, `Survey`, `Incident`, `DropOffLog`, each
  with its answers and the definition version answered; the answers' schema made from the definition
  in `packages/contracts` (C36). *REQ-107.*
- [x] **1.3.7** ✅ **done 2026-10-04 (ADR-332: Milestone 1.3 is done):** the one rule that works a unit rate pay item out from the size bands, `SizeBands.payItemFor` and `SizeBands.diameter` in `packages/domain` (a circumference ÷ 3.14, half up to a tenth; one pay item on the payable type is that pay item; several, the band that holds the diameter, else none); the harness's phone (`packages/scenarios/src/device.ts`) holds its assignment's lists (`phone-lists.ts`, read from the server: never a rate, a rule or a load's pay item), scans the badge at New, picks by name, makes the number last from its own block (`PhoneNumbers`), scans it at the second end, has it entered again (a mismatch saves nothing), types one with a reason, chains a split's number, keeps the working crew, cancels, and records a scale receipt, an incident, a drop-off log and an ROE; the stand-in intake writes each kind's details, its item lines and carried tickets, the receipt and the two forms, reading a debris type's form from the project and workflow; the story `p1-field-days` (35 checks): P1's Monday and Tuesday, 25 field events, one scale receipt, an incident and a drop-off log, every field event `PENDING`; `ticket-101001` and `dispatch-monday` moved to the new phone; chain 56 files, 1,160 tests; six stories. AC-04-10, 11, 17, 42, 59, 70, 91, 92, 93 pass (93 of 98). REQ-112g and 120a ticked; REQ-112f's phone part proven. **The harness's phones capture every kind.** Badge first, the number last and
  re-entered; a unit rate pay item worked out from the bands by the one rule the phone and the
  server share. Story: a day of P1's field events, every kind, landing `PENDING`. *REQ-112g, 120a;
  REQ-112f's phone part.*

###### Milestone 1.4 — Sync intake with quarantine (Part 5)

Carried: C31's first part. Closes the behaviour of KD-56.

- [x] **1.4.1** ✅ **done 2026-10-04 (ADR-333):** 56 scenarios, AC-05-01…56: what a phone sends, a retry stored once, a duplicate quarantined in full, what is not a duplicate, nothing else refused, what intake fills in, what the phone is told and receives, any order and bursts, a phone taken out of service; 39 are 1.4.2's, 6 built already, 3 later Phase 1 tasks', 8 for Phases 2–4; sixteen points left to the task that builds them, with C31, C63…C68's parts for 1.4.2 listed in the file. `spec/acceptance/05-sync.md`, from Part 5 and `adms-exceptions` §4.3a: what Phase
  1's intake does; the endpoint, the idempotency ledger and the manifest name Phase 2.
- [x] **1.4.2** ✅ **done 2026-10-04 (ADR-338):** `Intake` in `apps/api` (`src/sync/`): each record answered saved, already saved or not saved; `QuarantinedRecord` (a duplicate field event, and an ROE whose number is taken, kept whole; what the phone sent never changed or deleted; its resolution written later); `Photo.quarantinedRecordId`; `FieldEvent.unreadableGps` (C67 (f)); the domain's `GpsFix` and `Quarantine`; the certification and the ROE a number finds; a retry known by its phone-made id; the stand-in deleted and the harness's phone on the API's record types; stories `sync` (47 checks) and `p1-any-order` (4); `quarantined-records.test.ts` (10), twelve loosenings caught. 43 of the 56 sync scenarios pass, two in part. REQ-120b ticked; REQ-120h and 124c's intake halves seen. **Milestone 1.4 is done.** **Intake.** `QuarantinedRecord`; every field event received, in any order, in
  bursts; a second event of one kind on one ticket quarantined in full, never dropped, merged or
  acknowledged as saved; a retry of the same phone-made id is the same record; an out-of-service
  phone's work received. The harness's stand-in (`packages/scenarios/src/intake.ts`) gives way to
  it. *REQ-120b, 120h; REQ-124c's receiving part.*

###### Milestone 1.5 — Reconciliation (Part 6)

Carried: C16, C20, C50, C52's scenarios; C53's second part (1.5.5) and C55 (1.5.5, 1.5.7), filed by
ADR-303 (named here by ADR-307). Closes the behaviour of KD-02, 04, 05, 06, 12, 19, 28, 35, 42, 50,
55.

- [x] **1.5.1** ✅ **done 2026-10-05 (ADR-339):** 162 scenarios, AC-06-01…162: what starts a run, grouping, shape and status, every flag of the catalogue (66 today: 67 less the one ADR-328 withdrew) word for word, each thing never flagged, the quantities to the digit, how a flag behaves, what the worker writes and the run's guarantees, and the eight things ADR-329 keeps and flags that have no words yet; 152 are Milestone 1.5's, nine wait for the rules, one for a correction; eighteen points left to the tasks that build them (C70); KD-71 opened. `spec/acceptance/06-reconciliation.md`, from Part 6, `adms-validation` and
  `spec/FLAGS.md`: one scenario at least for each of the 67 flags and each thing never flagged.
- [x] **1.5.2** ✅ **done 2026-10-05 (ADR-340):** the seven tables and five closed sets below, built as `spec/DATA-MODEL.md` §5 has them, in three migrations (the sixty-sixth to sixty-eighth); only the worker's login writes them; a disposal has one completed record, a collection is a live row of one, a number is one live record's (six exclusions `WHERE dissolved_at IS NULL`, which Prisma doesn't try to drop, where a partial unique index would be); each thing a derived record names is its own project's; `FlagCode` is the catalogue's 66 codes, held to `spec/FLAGS.md` by a test; a client user and an auditor see the completed records, their rows and the flags, nobody a run; `packages/db/test/derived-records.test.ts`, 17 tests by scenario ID (AC-06-06, 144, 145, 146 whole; 19, 21, 137, 138, 148, 152 the database's half); fifty loosened guards each caught. `Transaction`, `InvoiceLock` and `guard_transaction_delete` are unchanged (1.7.1, 1.8.2). REQ-113 ticked; REQ-116 waits for the worker. Was:
  **The derived records.** `CompletedLoad` and `CompletedLoadCollection`,
  `CompletedHaulOut` and `CompletedHaulOutCollection` (one disposal each; one live row per
  collection event, the partial unique key in a guard migration; `dissolvedAt`), `Flag` with
  `FlagCode` and `FlagBilling`, `ReconciliationRun`, `ReconciliationDecision`; the worker's columns
  on a field event (zone, map version, worked-out pay item). Today's `CompletedLoad`, its tests and
  `guard_transaction_delete` follow. *REQ-113, 116.*
- [x] **1.5.3** ✅ **done 2026-10-05 (ADR-341):** `packages/domain/src/tickets.ts` (`Tickets`, `Ticket`, `workerStatuses`), 24 tests; AC-06-07, 08, 09, 11, 12, 15, 19, 20, 21, 22, 142 pass and nine more in part; REQ-120, 120e, 120f ticked (120b1, 127, 129 wait for the flag, 1.5.5, and the run, 1.5.9); chain 62 files, 1,246 tests. **Grouping and status, in `packages/domain`.** A ticket's events grouped on project
  + workflow + bare number, ordered by field time, the kind never used to find a partner; the
  group's shape (a split's suffixes); an event missing → `PENDING`, listed, never flagged, never
  expiring. *REQ-120, 120b1, 120e, 120f, 127, 129.*
- [x] **1.5.4** ✅ **done 2026-10-05 (ADR-343):** `packages/domain/src/quantities.ts` (`LoadQuantities`, `HaulOutQuantities`, `ScaleWeight`, `StumpQuantities`, `CarriedTickets`, `quantityFor`), 25 tests; AC-06-73…77, 79, 81, 82, 84, 128 pass and 78, 83, 90, 162 in part; the mission's quantities come out to the digit; REQ-126 ticked (120i, 120j, 126b in part; 126d, 126e wait for the lookup and the flag); chain 63 files, 1,271 tests. **Quantities, in `packages/domain`** (`adms-validation` §5.5). Capacity × load
  call; a split load's shares by estimate; a split haul-out's piles by what each added; a tandem's
  one weight by certified capacity; the carried tickets' count and a load of stumps' CY; a
  circumference to a diameter; the stump's fill; each summing exactly. **Done when:** the mission's
  quantities come out to the digit (52.0, 36.0, 62.4, 24.0, 45.5, 28.8, 99.0 CY; 14.4 and 21.6 CY;
  2.82, 7.06 and 14.12 tons; 18.0 in; 4.8 CY). *REQ-120i, 120j, 126, 126b, 126d, 126e.*
- [x] **1.5.5** ✅ **done 2026-10-05 (ADR-344):** `packages/domain/src/flags.ts` (`Flags`, `flagCodes`, the 66 messages, the facts' hash, `Flags.compared`), `checks.ts` (`TicketChecks`, `CertificationChecks`), `project-clock.ts`, `sha256.ts`; 44 tests at the domain and 67 in `packages/scenarios/test/flag-catalogue.test.ts`, which holds every message to `spec/FLAGS.md`; AC-06-25…35, 37…40, 49, 50, 59…64, 117, 130, 131, 133, 136 pass, AC-06-17, 137, 138 are whole, 41 and 58 in part; REQ-105j, 120d, 122a, 129a ticked (106f, 120b1, 122, 124c in part); chain 66 files, 1,382 tests. **Section O's flags and three backup catches: built 2026-10-05 at the user's word (ADR-345): `spec/FLAGS.md` §3.10, nine `FlagCode` values (the sixty-ninth migration), 75 flags; AC-06-155…157, 159…161, 163…165; chain 66 files, 1,401 tests.** **Checks and flags, between events and on the certification.** The flag catalogue as
  one closed set with each message word for word from `spec/FLAGS.md`; `FLAGS.md` §3.1, §3.2 and the
  time flags of §3.3; the facts a flag keeps and their hash. *REQ-105j, 120d, 122, 122a, 129a;
  REQ-106f's flags; REQ-124c's flag.*
- [x] **1.5.6** ✅ **done 2026-10-05 (ADR-346):** `packages/domain/src/geodesic.ts` (`Distance`; `geographiclib-geodesic` 2.2.0, the package's first dependency), `ShapeArea` in `map-shapes.ts`, `place.ts` (`PlaceChecks`, `SiteChecks`); 38 tests; AC-06-43…47, 51, 52, 65…67, 72, 118, 126, 127, 134 pass, 42 and 68 in part; REQ-123, 105n ticked (124b, 124e, 128 in part); chain 68 files, 1,439 tests. **Checks on place.** The one geodesic module; a point in a circle, a shape, the
  boundary, a zone; `FLAGS.md` §3.3's place flags and §3.4 (where the debris went; a haul-out that
  left a landfill, or was dumped at a TDSR: C52); a site's dates and permit. Any library needs its
  ADR. *REQ-123, 124b, 124e, 128; REQ-105n's flag.*
- [x] **1.5.7** ✅ **done 2026-10-05 (ADR-347):** `packages/domain/src/quantity-checks.ts` (`QuantityChecks`), `unit-rate-checks.ts` (`UnitRateChecks`, with the worker's own pay item), `roe-checks.ts` (`RoeChecks`); 65 tests; AC-06-80, 83, 85…90, 92…104, 107…116, 129, 132, 135 pass, 106 in part; AC-01-33, 48 and AC-04-59 whole; REQ-105d and 126b ticked (112c, 112f, 120j in part); chain 71 files, 1,504 tests. **AC-06-158 and 162's two flags were approved by the user and built the same day (ADR-348): `SCALE_NET_DISAGREES`, `TWO_QUANTITIES`, the seventieth migration, 77 flags; chain 71 files, 1,511 tests.** **Checks on quantity, the pay item's settings, unit rate work and forms.**
  `FLAGS.md` §3.5…§3.7: the load-call limits, the pay item worked out again from the bands, the
  stump checks, crew hours across a day, the ROE flags. A renamed built-in value changes nothing
  (AC-01-33). *REQ-112c; REQ-112f's engine part.*
- [x] **1.5.8** ✅ **done 2026-10-05 (ADR-349):** `packages/domain/src/mileage.ts` (`Mileage`: what is kept, the straight line, when a kept mileage stands, the flag) and the worker's first code, `apps/worker/src/mileage/` (`MapServers`, `Mileages`); 11 tests at the domain and 12 at the worker against the local stack's map servers; AC-06-54, 55 pass, 53 and 56 in part; the example world's stand-in points on the pinned extract are in `spec/CONVENTIONS.md` §6 (14 Heron St: 6.2050 road miles from Marsh Road TDSR); REQ-126f waits for the run; chain 73 files, 1,534 tests. **Mileage.** What the worker asks Valhalla and Nominatim (C50): the snap to the
  nearest road, the shortest route on public roads, the address of the snapped point; stored
  unrounded with the map data's date and hash; no route → the straight line, flagged; recomputed
  only when an end moves. The mission's GPS points are picked from the pinned extract here.
  *REQ-126f.*
- [x] **1.5.8a** ✅ *(done 2026-10-05, ADR-351: the picked points are in `spec/CONVENTIONS.md` §6; chain 73 files, 1,533 tests, eight stories)* **The example world on the pinned map extract** *(the user, 2026-10-05, ADR-350 (1))*. Every fixture that holds the made-up GPS points of ADR-311 (round 27.98° N, 82.40° W: the sites, 14 Heron St and the other addresses, P1's boundary and three zones, the site shapes, the points 250 m and 150 m from Marsh Road TDSR and every figure worked from them) moves to the stand-ins of `spec/CONVENTIONS.md` §6 on Delaware's roads: `packages/db/test/support/example-world.ts` and the database tests, `packages/domain`'s tests, the stories and `p1.ts`, the acceptance files' and `spec/CONVENTIONS.md` §6's rows. The remaining addresses (40 Birch Ln, 22 Elm St, 412 and 416 Cedar Ct), Bayline Transfer Station and P1's boundary and zones are picked here, each P1 load within 15.0 road miles of its site, as the mission's ledger needs. A test is rewritten for the new points, never loosened. **Done when:** no fixture holds a point off the extract (a grep), and the chain is green with the same counts.
- [x] **1.5.9** ✅ **done 2026-10-05 (ADR-352): Milestone 1.5 is done.** `apps/worker/src/reconciliation/` (`Reconciliation`, `ProjectRead`, `TicketWork`, `TicketWrite`, `MileageStanding`) and the ninth story, `p1-reconciled` (39 checks): P1's Monday and Tuesday reconciled, unpriced; AC-06-01, 04, 13, 14, 16, 18, 23, 41, 42, 48, 56, 119, 124, 147, 149…153 pass, 02, 03, 53, 141, 148, 154 in part; REQ-015, 126f, 127, 129, 132 ticked; chain 73 files, 1,534 tests, nine stories; no migration. Left: C71. Was: **The worker's run.** One ticket, one database transaction; one run per project at
  a time, by a database lock; a ticket that errors flagged and skipped; unchanged input changes
  nothing; each decision recorded; whether the worker states a person for a reprocess they asked for
  (C20). Story: P1's loads and haul-outs reconciled, unpriced, with their statuses and flags.
  *REQ-015, 121, 132.*

###### Milestone 1.6 — The rule engine (Part 7, the rules)

Closes the behaviour of KD-15, 36, 38, 54.

- [x] **1.6.1** ✅ **done 2026-10-05 (ADR-353):** `spec/acceptance/07-pricing-ledger-audit.md`, 114 scenarios (AC-07-01…114) from Part 7, `adms-ledger-audit`,
  `spec/RULES.md` and `spec/RATE-SHEET.md`: 35 are task 1.6.2's, 48 task 1.6.3's, 4 task 1.7.1's, 12 task 1.7.2's, 10 restate guards Phase 0 built, 3 the golden mission's, 2 later phases'; none passing yet. Eighteen points nothing settles: C72.
- [x] **1.6.2** ✅ **done 2026-10-05 (ADR-354):** `packages/domain/src/ticket-rules.ts` (`TicketReadings`, `CriterionCheck`, `TicketRules`), `Mileage.inTenths`, `CheckedSite.siteTypeId`; 41 tests; AC-07-01…09, 12…37 and AC-06-57 pass; the user's answer on an empty reading (it never passes); chain 74 files, 1,575 tests. REQ-125 and 125b wait for 1.6.3 and 1.6.4. Was: **Criteria, in `packages/domain`.** Each criterion reading its named field event,
  each operator, BETWEEN with both ends, mileage in tenths half up; only the active, valid rules of
  the ticket's form whose contract's prime is the ticket's, or with no contract. *REQ-125, 125b.*
- [x] **1.6.3** ✅ **done 2026-10-05 (ADR-355):** `packages/domain/src/ticket-pricing.ts` (`TicketPricing`); 56 tests; AC-07-10, 11, 38…83 and AC-06-70, 71, 91, 105, 120…123 pass at the domain; the user's three answers on money (cents a half up; a crew day to four decimals; hours in no step bill nothing, flagged); chain 75 files, 1,631 tests. REQ-112e, 112f, 124e, 125, 126e, 131a, 131c, 131d ticked. Was: **Actions to lines, in `packages/domain`.** Every passing rule found; adds in #
  order, then removes, then voids; one line per add; two adds of one # and no line at all flagged;
  the quantity by the pay item's unit (crew time's highest item, an itemised ticket's chosen items,
  the fill CY, TBN); the rate of the rule's contract's prime, a $0 line where it has none; per
  property on a split, per pile on a split haul-out; the same answer every time, proven by running
  it twice. *REQ-112e, 112f, 131a, 131c, 131d.*
- [x] **1.6.4** ✅ **done 2026-10-05 (ADR-357): `packages/domain/src/setup-check.ts` (`SetupCheck`, seven kinds of gap) and `quantity-lookup.ts` (`QuantityLookup`: load call, scale weight, a count, or nothing more), `RuleReach`, `SizeBands.standing()`; a rule naming an archived form, contract or pay item is not valid and is listed; 31 tests; AC-01-69…77 pass; REQ-125b ticked, REQ-124f and 125c in part; chain 76 files, 1,662 tests. Milestone 1.6 is done.** Was: **The setup check, and what each site's phones ask for.** AC-01-69…77; the two
  points `01-setup.md` leaves to it. *REQ-124f, 125c.*

###### Milestone 1.7 — The ledger and audit (Part 7, the money)

Carried: C16, C17, C18. Closes the behaviour of KD-01, 26, 49, 52, 53.

- [x] **1.7.1** ✅ **done 2026-10-06 (ADR-358): `Transaction` in full**, as `spec/DATA-MODEL.md` §5
  has it, in two migrations (the seventy-first and seventy-second): a line on exactly one kind of
  ticket, a load or a haul-out always with the property or pile it prices; its project, #, rule,
  pay item, contract, prime, operating sub, unit and run, each held to its own project, the prime
  to the project's primes and the operating sub to a place under that prime; a # once per
  property, pile and unit rate ticket; `InvoiceLock`'s two other targets (exactly one), and the
  lock followed through all three by the delete's guard and by a new insert guard (C17); a
  contractor user sees its own contractor's lines, as the prime or as the sub that did the work.
  In `packages/domain`, `TicketRead.operatingSubId` (the lowest tier of sub the certification
  names). The example world keeps one priced line, 101001's $390.00; its 101002 is on Rivera's
  self-loader at the Landfill, as the mission has it. `packages/db/test/transactions.test.ts`, 12
  tests by scenario ID; `test/support/priced-tickets.ts`. AC-07-85…90, 96, 97, 104…109 and
  AC-03-15 pass; AC-02-66 in part. REQ-106g, 130, 133 ticked. Was: **`Transaction` in full.** Its
  three kinds of ticket (exactly one), the property or pile, slot, rule, pay item, contract, prime
  and operating sub, unit; a # once per ticket and property or pile; the delete guard following
  the invoice lock through all three; what a contractor viewer sees (its own prime's lines, its
  subs' included). *REQ-106g, 130, 133.*
- [x] **1.7.2** ✅ **done 2026-10-06 (ADR-359): the worker prices.** `apps/worker` runs the
  firm's rules inside each ticket's one piece of work and writes its lines with its completed
  record, flags and status; only what differs is written, each removed line copied to the audit
  log by the database first; a ticket that is pending again, voided or "not billed" loses its
  lines; a ticket locked as invoiced is left as it is; a rate or rule change is a run of the
  whole project; a rule's void stays until a person unvoids it and the ticket is out of the run
  (the user, ADR-360, who also closed KD-73: the flag `NOT_PROCESSED_LINES_STAND`). `packages/db`'s `RuleRows` (the one
  reading of the rules) and `$read`. The story `p1-priced` (28 checks): 17 lines, $4,879.00 on
  Tuesday night; 19 lines, $5,400.25 after Wednesday's sync (AC-07-112 corrected); two primes.
  AC-07-84, 92…94, 98, 99, 101…103, 110, 112 and AC-01-68 pass; AC-07-95 in part. REQ-105l, 131,
  131b ticked. KD-73 opened. Was: **The worker prices.** A ticket's lines regenerated: each removed row copied in
  full to the audit log first, then the new ones written, in the ticket's one transaction; a void
  removes them; a rate or rule change queues every un-invoiced ticket it touches; a `COMPLETED`
  ticket reprocessed in place. Story: P1's Monday and Tuesday priced; two primes (AC-01-68).
  *REQ-105l, 131, 131b.*
- [x] **1.7.3** ✅ **done 2026-10-06 (ADR-361): Milestone 1.7 is done.** The user's answer first:
  a sub's contractor user sees no rate and no amount. The seventy-fourth migration, a guard, no
  model changed: `guard_viewer`'s `own` (the question that makes a row a contractor user's own);
  a contractor user's sight of the certifications that name its contractor, the field events that
  found them, the completed loads and haul-outs with their rows, scale receipts, photographs, and
  its own and its subs' places on the project; `viewer_transaction_money` (rate and amount: a
  client user, an auditor, the line's own prime); `viewer_pay_item_name`,
  `viewer_disposal_site_name`, `viewer_debris_type_name`. Tests: `contractor-users.test.ts`
  (AC-02-78…82), and the viewer, catalog, grant and row-level-security files in the new shape;
  sixteen loosenings each caught. AC-02-66 passes whole. Left: C76. Was: *(filed 2026-10-06, ADR-358)* **What a contractor user sees of its own tickets.**
  Task 1.7.1 gave a contractor user its own lines, and those hold ids: it still reads no field
  event, completed load or haul-out, collection row, flag, certification, scale receipt or
  photograph, and none of setup (C18, C59, C62, C65, C66, C70; AC-02-66's other half, AC-04-31).
  This task: its own tickets, told by the certification's prime and subs (a prime its subs' too),
  through the owner's-rights questions the viewers' guard uses; the names it needs of setup to
  read them (a debris type's, a site's, a pay item's code and description), and nothing more of
  setup; ROEs and forms stay unseen unless the user says otherwise. A schema task with no new
  model: guard migrations, `test/support/viewers.ts`, tests by scenario ID. **Put to the user
  first:** whether a sub's contractor user sees the rate and amount on its lines (it does today,
  as AC-02-66 reads; they are the prime's rate with the client).

###### Milestone 1.8 — Review, QC, invoice lock and batches (Parts 8 and 9)

Carried: C17, C19, C75, C76, C77 (filed by ADR-362), C78 (filed by ADR-363), C79 (filed by ADR-364), C80 (filed by ADR-365), C81 (filed by ADR-367). Closes the behaviour of KD-25, 40.

- [x] **1.8.1** ✅ **done 2026-10-06 (ADR-362):** `spec/acceptance/08-review-and-corrections.md`
  (65 scenarios, AC-08-01…65) and `09-invoice-deliver-closeout.md` (31, AC-09-01…31), from Parts 8
  and 9 and `adms-exceptions`; each row names the task of this milestone that first proves it; none
  passing; twenty-two points nothing settles are C77's; KD-74 found (docs, the user's).
- [x] **1.8.2** ✅ **done 2026-10-06 (ADR-363):** the five mark tables in `packages/db/prisma/schema/marks.prisma` and the closed set `QcStatus`, the seventy-fifth migration (Prisma's) and the seventy-sixth (the guard); each mark its own record with its project, written by the API (`guard_table`, `MARK`), read by the worker; a QC mark on one of eight things, a field event only as a unit rate ticket; the lock's unlock on its own row, one lock in force for a ticket (three exclusions), the two guards on a transaction and the worker asking only about a lock in force; a batch's name once per project; a flag accepted once; a person's void keyed as a ticket is, one in force; what a mark is on, who made it and when never changed (`refuse_edit()`); a client user and an auditor see every mark, a contractor user its own tickets' locks and their batches; `packages/db/test/marks.test.ts`, 19 tests by scenario ID; 109 loosened guards written, each tried on its own throw-away copy against the nine test files that hold these tables' guards: 108 applied and 105 were caught (two of them, the haul-out's own-project key on a QC mark and on a lock, only after a refusal was added to the tests for each); three are not caught by construction (the bare project foreign key on a QC mark, a lock and an acceptance, which the two-column key to what the mark is on already implies); one could not be applied (a lock's viewer view written again with the unlock's note in it: Postgres won't add a column mid-view), and the grant of that column alone was caught; chain 79 files, 1,710 tests. AC-08-09, 33, 48, 49, 53, 55…59 and AC-09-01, 07, 09, 10, 17 pass at the database; AC-03-38 whole. REQ-107 ticked; REQ-105h and 105m wait for the services (1.8.5). Was: **People's marks.** `QcMark`, `InvoiceLock` in full (the unlock kept on its row),
  `InvoiceBatch`, `FlagAcceptance`, `TicketVoid`; each written by the API, never touching a derived
  row. *REQ-105m's record; REQ-105h's lock.*
- [x] **1.8.3** ✅ **done 2026-10-06 (ADR-364):** the review services in `apps/api/src/review/` (`Corrections`, `QuarantineReview`, `BackOfficeRecords`, on `ReviewService`) and their rules in `packages/domain/src/review.ts`; a person's grant read by the service itself; each call answering the run to ask the worker for; a line and a carried ticket taken off by a mark (`archivedAt`, the seventy-seventh and seventy-eighth migrations); intake's row-writing shared as `RecordWrite`; the story `p1-reviewed`, 30 checks: AC-08-05 and 07 (the *correct* and *renumber* halves), 10…30, 66, AC-09-16, AC-03-52; four loosened guards, each caught; chain 80 files, 1,727 tests. REQ-105g, 120c ticked. Was: **Corrections and renumbering.** Any captured field corrected in place by
  permission, the prior value kept; a renumber of real work; a quarantined record resolved, keeping
  its phone-made id and its photos; each reprocessing the ticket. *REQ-105g, 120c.*
- [x] **1.8.4** ✅ **done 2026-10-06 (ADR-365):** KD-74 answered by the user (two separate grants) and closed; `apps/api/src/review/voids.ts` and `acceptances.ts` on `ReviewService`, their rules in `packages/domain/src/review.ts` (`TicketVoiding`, `FlagAccepting`) and `flags.ts` (`Flags.accepted`); the worker reads `TicketVoid` and `FlagAcceptance` (a person's void written as void, its lines removed, its flags cleared, read by no other ticket's checks; an unvoided ticket read back in; the status from the accepted flags); the story `p1-voided`, 27 checks: AC-08-31, 32, 34…47, 50…52, the story halves of 33 and 48, the *void* and *accept flags* halves of 05 and 07; six loosenings, each caught by the story; no migration; chain 80 files, 1,737 tests, twelve stories. REQ-105p, 120g, 129b ticked. **The user approved its defaults and added one rule the same day (ADR-366): every unvoid writes a `TicketUnvoid`, audited under the person, read by the worker; the seventy-ninth and eightieth migrations; AC-08-67; fifteen loosened guards each caught; chain 80 files, 1,739 tests, 80 migrations.** Was: **Void, unvoid, accept.** A person's void with a reason; a rule's void, which wins
  on every reprocess; an unvoid; a flag accepted with a reason, not raised again unless its facts
  change; every flag fixed or accepted → `COMPLETED`. *REQ-105p, 120g, 129b.*
- [x] **1.8.5** ✅ **done 2026-10-06 (ADR-367): Milestone 1.8 is done.** `apps/api/src/review/qc-marks.ts` and `invoice-locks.ts` on `ReviewService`, their rules in `packages/domain/src/review.ts` (`InvoiceLocking`, `LockedTicket`, `TicketOnItsOwn`, `BatchName`); only a whole, `COMPLETED`, QC Approved ticket locks; a change to a locked ticket's own records refused by every review service until its unlock; the unlock answers its run; `ProjectSetup.close`; the story `p1-invoiced`, 26 checks: AC-08-54, 60…62, AC-09-02…04, 06, 15, 19…22, 29, the story halves of AC-08-57, 58 and AC-09-01, 09, 17, AC-09-05, 13, 14 by the service, the *QC* halves of AC-08-05 and 07; ten loosenings, each caught by the story; no migration; chain 80 files, 1,750 tests, thirteen stories. REQ-105h, 105m ticked. Was: **QC, the lock and batches.** QC set by people only, on the completed load or
  haul-out, a unit rate ticket, a form, a certification; only QC Approved locks; a named batch; a
  locked ticket untouched by a reprocess until an audited unlock. *REQ-105h, 105m.*

###### Milestone 1.9 — Prove it: the golden mission

Carried: C28, C29, C30 (✅), C51's two scenarios (✅ ADR-369), C82 (filed by ADR-368), C83 (filed by ADR-369).

- [x] **1.9.1** ✅ **done 2026-10-06 (ADR-368):** the fourteenth story, `golden-mission` (`packages/scenarios/src/stories/golden-mission.ts`), 27 checks: both projects set up, P1's two field days and the late sync, P2's split load on real harness phones with its ROEs and surveys, the accepted flag, the renumber, the two voids, the weighed split haul-out, QC (30 marks), the lock and the batch of thirteen, a rate change that regenerates nothing, and a line walked back years after closeout; P1 $5,548.25 on 19 lines, P2 $324.00, every status and audit row; AC-07-111, 113, 114, AC-08-01, 02, 63…65, AC-09-11, 30, 31 and the story halves of twenty-four earlier rows; no production code changed, no figure of the mission changed; REQ-017, 142, 143 ticked; what it leaves: C82. Was: **The golden mission as a story**, whole: its setup, both days, the late sync, the
  renumber, the accepted flag, the two voids, the split load, the weighed split haul-out, QC, the
  lock and batch; the exact statuses, review queue, ledger and audit rows. A change to an approved
  number needs the user's word. *REQ-017, 142, 143.*
- [x] **1.9.2** ✅ **done 2026-10-06 (ADR-369):** the fifteenth story, `p1-left-out` (`packages/scenarios/src/stories/p1-left-out.ts`), 25 checks: any arrival order (AC-06-05), the split haul-out paid by the CY, six lines, $850.85, and the pile whose call isn't higher (C51), a certification made later, revoked and replaced, a tandem's one weight, a load that carries a ticket, three flags cleared by setup, a new map version, a site's own shape, a load after the window; **the count: 760 scenarios, 691 proven whole, 17 in part, 52 for Phases 2–4** (`spec/acceptance/README.md`); no production code changed; REQ-111a, 120h, 120j ticked; what it leaves: C83. Was: **The scenarios the mission leaves out, as stories**, and a count: how many
  scenario IDs have a passing test, by part. Among them the split haul-out paid by the CY (six
  lines, $850.85) and the pile whose call isn't higher (C51).
- [x] **1.9.3** ✅ **done 2026-10-06 (ADR-371, 372): `pnpm security` `7 passed, 0 failed` after the `source-map-js` 1.2.2 override, let past the seven-day rule by name at the user's word (ADR-372); Phase 1's seven exit criteria are met; Phase 2 is the user's to open. Before that line:** all but one line done 2026-10-06 (ADR-371): 98 REQs = 93 ticked + 5 moved to the phase that finishes them (REQ-112b, 124c, 124f, 125c → Phase 3; 124b → Phase 4); REQ-003, 105, 128, 140, 141 ticked from the final run (80 files, 1,753 tests, fifteen stories, typecheck and lint clean, 358 licences allowed); 44 rebuild-lesson KDs closed with their scenarios, KD-30 re-filed to REQ-518; `guard_gaps()` empty over 82 tables; the CIS tests cover every table by reading the catalog (`configuration.test.ts`, in the 921 database tests); AC-03-50 and AC-05-47 given their own test (693 of 708 whole, 15 in part); `REQUIREMENTS-LATER.md`'s Phase 2 refreshed (REQ-207…209 new). **Left, and why the box is open: `pnpm security` reads `6 passed, 1 failed` until ADR-356's override (C74), due from 2026-10-07 14:08 UTC. Then: the override, `pnpm security` → `7 passed, 0 failed`, tick this box, and offer Phase 2 to the user.** Was: **Phase exit.** Every Phase 1 REQ ticked or re-filed with an ADR; REQ-003, 105,
  128, 140 and 141 from the final run; each KD named above closed in `DEVIATIONS.md`; `guard_gaps()`
  empty; `pnpm security` passing; the CIS items for the new tables; `REQUIREMENTS-LATER.md`'s Phase
  2 refreshed against `SUMMARY.md` before Phase 2 is offered to the user.

---

##### Done — Phase 0: Foundation *(ADR-103)*

> **2026-10-01 (ADR-282…287): every Phase 0 task below is done**, and the user made the first commits
> the same day (REQ-002 ticked, ADR-288) and approved `spec/DATA-MODEL.md` and `spec/FLAGS.md`
> (ADR-289, 290). The data model's thirteen points were settled the same day (KD-65 closed, ADR-292…295).
> **The user opened Phase 1 on 2026-10-01 (ADR-299).**

###### Milestone 0.1 — Approve the foundation (docs only) — ✅ done 2026-10-01
- [x] **0.1.1** ARCHITECTURE §1–§3 (principles, layers + write boundary, stack) approved 2026-09-26 (ADR-143); routing (ADR-119), project map (ADR-141). Only §3's site-area details wait (Q-136).
- [x] **0.1.2** ARCHITECTURE §4–§6 approved: §5 (ADR-113), §4 and §6 (ADR-139).
- [x] **0.1.3** ARCHITECTURE §7–§9 approved 2026-09-25 (ADR-104), with ADR-105/106. Follow-up **Q-115**.
- [x] **0.1.4** ARCHITECTURE §10–§13 approved 2026-09-25 (ADR-104). Q-94 closed; **Q-93** (check digit) still open.
- [x] **0.1.5** ARCHITECTURE §14–§16 and §18 approved 2026-09-25 (ADR-104); §17 approved 2026-09-26 (ADR-143).
- [x] **0.1.6** ✅ **done 2026-10-01 (ADR-283): the hook reviewed for the rebuilt layout and tightened (env files never read, written or printed; generated paths, the lockfile, the historical root compose file and README never hand-written; fails closed without `jq`; runs on `Read` too), with 57 tests in `tools/security/test/guard-hook.test.ts` and 14 loosenings each caught; `AGENTS.md`'s write boundaries list the same rules. REQ-023 ticked.** Guard hook and `AGENTS.md` updated together for the approved layout (ADR-043). The migration rule part is done (ADR-113); `AGENTS.md` opens `apps/`, `packages/`, `infra/`, `tools/` (ADR-143).

###### Milestone 0.2 — Scaffold — ✅ done 2026-09-29 (ADR-143, 231, 255…266)

**Brief for the agent who starts it.** Read ARCHITECTURE §3 (stack), §4 (install), §15 (testing),
§16 (security standards) and §18 (layout) first. Nothing in 0.2 models the product: no tickets,
pay items or rules yet (their names are in `spec/CONVENTIONS.md`, ADR-234; placeholders and
examples follow it too). **One sub-task per response**,
each ending with real observed output and the user's git block. What "done" means for each is below;
don't tick a box on "should work".

**Before starting:**
- **Node 24 LTS through fnm** (ADR-231, ADR-233). The user installed **fnm**, default Node
  **24.21.0**. An agent's shell doesn't load `~/.zshrc`, so a bare `node` still finds an old Homebrew
  25.2.1 (kept on purpose: `mongosh` depends on it; don't suggest removing it): start every Node
  command with `eval "$(fnm env --shell zsh)"` (then `node -v` → 24.x), and
  pin 24 in `.nvmrc` so `fnm use` picks it (done, ADR-255). If fnm doesn't give 24.x, stop and ask.
  Don't pin a non-LTS runtime.
- Tools seen on 2026-09-29: npm 11.6, pnpm 10.24, Docker 28 with Compose, `psql`, `jq`. No Caddy
  binary (it runs in a container).
- Root files you may write (ADR-231): `package.json`, the lockfile, the workspace file, base
  `tsconfig`, `.nvmrc` / `.node-version`, `.editorconfig`, `LICENSE`, `.gitignore`. Not `README.md`.
  Never touch `database/`, `development/` or the historical root `docker-compose.yml` (KD-59).
- **Every dependency gets an ADR** before it's added: exact version, licence (compatible with
  **AGPL-3.0**: permissive, LGPL, GPL-3.0, AGPL-3.0; refuse source-available and non-commercial,
  ADR-171) and maintenance (recent release, active repository). Check current facts online; don't
  trust memory for versions. Group small tooling deps into one ADR where sensible.

- [x] **0.2.1** ✅ **done 2026-09-29 (ADR-255…258): pnpm 11.27.1, TypeScript 6.0.3, ESLint 10 + typescript-eslint + Prettier, `pnpm licences`; clean install, typecheck, lint and licences (100 of 100 allowed) pass from a clean copy.** **The monorepo skeleton.** Workspace per §18 (`apps/api`, `apps/worker`,
  `apps/back-office`, `apps/field`, `packages/db`, `packages/domain`, `packages/contracts`,
  `packages/scenarios`, `infra/local`, `tools/setup`), each with a minimal `package.json` and a
  placeholder source file that compiles. Choose the workspace tool (npm or pnpm workspaces) in
  an ADR. TypeScript strict, one base `tsconfig`, project references; a linter and formatter;
  `LICENSE` (AGPL-3.0 text); root `.gitignore` rewritten for the new layout (keep the `.env` rules);
  Node pinned in `.nvmrc` and `engines`. Screens translatable from the start is a web-app concern
  (ADR-172): record the i18n library choice when the web apps get real screens, not now.
  **Done when:** a clean install from the committed lockfile, `typecheck` and `lint` across every
  workspace, all pass, and a licence report lists every installed package's licence with none
  refused. Paste the real output.
- [x] **0.2.2** ✅ **done 2026-09-29 (ADR-259…261): Vitest 5.0.1 on Vite 8.3.0, Zod 4.6.5 in `contracts` → `domain`, tests in `<workspace>/test/`, `adms-verify` rewritten (KD-57 closed), MPL-2.0 allowed (agent default, ADR-260); from a clean copy `pnpm test` reports 2 files, 4 tests passed, and install, typecheck, lint and licences (135/135) pass.** **`packages/domain` and `packages/contracts` with the test runner wired.** Pick the
  runner in an ADR. `domain` depends on nothing; `contracts` (Zod) depends on `domain` only; a test
  in each proves the wiring (a trivial one is fine; the capacity math comes in Phase 1 with its
  paper-form examples, `adms-certifications` §3A.3). Rewrite `adms-verify` for the new chain (the
  commands, what each proves, expected counts), keeping the historical chain under a History heading.
  **Done when:** `test` runs from the root and reports real counts.
- [x] **0.2.3** ✅ **done 2026-09-29 (ADR-263, 264): Postgres 18.6, SeaweedFS 4.47, Caddy 2.11.4, Mailpit 1.31.2, pinned by digest; `pnpm local:up` brings all four healthy and checks `https://adms.localhost/health` → `200 ok`; curl with Caddy's root gives 200, plain HTTP gets 308 to HTTPS; `local:down` leaves 0 containers and 0 networks; resume and `local:wipe` shown.** **`infra/local`: one command up, HTTPS only.** docker compose with Postgres (major
  version pinned), an S3-compatible object store (check the candidate's licence **and** that its
  images are still published and maintained; don't assume MinIO), Caddy with its internal CA serving
  `*.adms.localhost`, and a mail catcher for dev (ADR-170). Nothing exposes plain HTTP outside
  (Postgres bound to localhost only). Dev passwords are generated into a git-ignored env file,
  never committed. Valhalla and Nominatim (REQ-022) are **not** in this step; they get their own
  step later (large map data). **Done when:** `up` brings every service healthy, `curl` over HTTPS to
  a Caddy-served health page succeeds, plain HTTP is refused or redirected, and `down` cleans up.
- [x] **0.2.4** ✅ **done 2026-09-29 (ADR-265, 266): `pnpm installer`, `installer:check`, `installer:teardown`; `pg` 8.23.0; first run, rerun (secrets byte-identical), resume after `local:wipe`, a lost secret refused, teardown then first run, each shown with output; no secret in any output.** **`tools/setup`: the installer** (§4, REQ-007): an interview that writes local
  config, generates secrets, creates the database roles, runs migrations and seeds; on a rerun it
  re-checks what it knows and offers to resume; teardown makes the next run a first run; never prints
  a secret or password; never rotates keys on a resume. Roles and migrations can be stubs until 0.3.
  **Done when:** first run, rerun (resume) and teardown-then-run are each shown working, with output.

###### Milestone 0.2b — Spec pages before the schema (ADR-140, ADR-164) — ✅ done 2026-10-01: both pages approved by the user (ADR-289, 290); the data model changed at their word (ADR-292…295); KD-65 is closed
- [x] **0.2b.1** **Naming pass** (ADR-164, user 2026-09-27): a table of every record, field, rule
  criterion, status, type label and export column with a proposed plain name, for the user to
  approve before `spec/DATA-MODEL.md`; "plenty of details we're able to export for each type of thing
  the field is creating". ✅ **2026-09-29: `spec/CONVENTIONS.md`**, an agent default at the user's word
  (ADR-234, 235): the renames, code names, units, the pay item code convention, the example world and
  the retired examples. Export column names are settled with `DATA-MODEL.md` (0.2b.2), from it.
- [x] **0.2b.2** ✅ **drafted 2026-10-01 (ADR-284): `spec/DATA-MODEL.md`, 688 lines: every record and field, who writes it, what the database refuses, thirteen exports' column names, sixteen agent defaults listed for the user; answers C16–C19, C29, C36, C42–C44 on paper. Waits for the user's approval before Phase 1's schema.** ✅ **Approved by the user 2026-10-01 (ADR-289)**, all sixteen defaults; then laid out one way throughout and checked against the rest of the spec: thirteen points open (KD-65). `spec/DATA-MODEL.md` draft (after 0.2b.1; Q-176 answered, ADR-182; round 14–15's data-model
  answers are in, ADR-174…184; ADR-185 settles haul-out and split halves; ADR-191 the start list and a code's name shown to monitors; ADR-192 the load of stumps; ADR-195 one site per site-working phone; ADR-196 the stump ticket's root ball, its fields and fill: Q-189).
- [x] **0.2b.3** ✅ **drafted 2026-10-01 (ADR-285): `spec/FLAGS.md`, 67 flags in nine groups, one message shape, what each does to billing, the facts each keeps; four points for the user (which certification bills when the two cert numbers differ; no over-the-legal-limit weight test yet; six codes the agent worded; the date format). Waits for the user's approval of the wording.** ✅ **Approved by the user 2026-10-01 (ADR-290)**, its §5's four points included. `spec/FLAGS.md` draft: every flag's code, trigger, message, still-bills, accept
  behaviour (ADR-166), ADR.

###### Milestone 0.2c — Rewrite the skills in the present tense (ADR-138, ADR-232, ADR-233) ✅ done 2026-09-29 (ADR-242…253)

**Why.** Agents load skills to learn the rules, and 8 domain skills still teach the old system in
their body with the current rule only in ⚠️ notes (KD-58, KD-62). A smaller model built a demo from
those bodies (`MATCHED`, prefixed numbers, a Service on a load, old site options). The user: "it
should use what is in the skills, so if the skills are outdated we need to update them", and keep it
lean ("especially as it relates to bloat"). **The model for a finished rewrite is
`.claude/skills/adms-domain/SKILL.md`**: read it first.

**Brief for the agent who does one.**
1. **One skill per response**, in this order, for the user to read before the next.
2. **Before writing:** read the whole skill, then `SUMMARY.md` §1 (every topic the skill touches)
   and §2 (superseded), then each ADR in the skill's start list below (`grep -n "ADR-1NN\*\*"
   agent_store/DECISIONS.md`). An ADR row quotes the user and names its Q-ID; the user's full words
   are in that entry's `> **User, date …:**` quotes in `spec/QUESTIONS.md`. The start lists are a
   floor, not a ceiling: grep SUMMARY for the skill's terms too.
3. **Write today's rules, in the present tense, about the rebuild**: what the system does and why,
   each rule with its ADR. No "as implemented", "current implementation" or "gaps vs what's built"
   sections: nothing is built yet; gaps live in KDs and the part pages. The user's own words only
   **verbatim**, short, marked **User, date (Q-xx)**, where the words are the rule.
4. **No rule changes.** Where ADRs disagree, the newest wins and SUMMARY breaks ties. If something is
   truly unsettled, use the shot-clock (ADR-230): record an agent default ADR, or ask (at most three
   questions) only if it changes money, evidence or what a monitor does.
5. **Lean.** One topic, one home (ownership table below): link to the owning skill instead of
   restating it. Don't repeat `adms-domain`'s glossary. Aim for **shorter than today**. Keep the old
   **section numbers** (other docs cite them, e.g. `adms-ticket-workflows` §4.5); new subsections
   are fine. Cross-references name their skill (`adms-exceptions` §4.3a), which closes KD-33.
6. **End with a History list** (≤ ~15 bullets): what the body used to say → what replaced it (ADR).
   Put `<!-- skill-status: current (ADR-138, rewritten <date>, ADR-NNN) -->` under the front matter;
   update the `description:` if the scope changed.
7. **Words and examples: `spec/CONVENTIONS.md`** (ADR-234, 235, 236, 237). Today's terms: **pay item**
   (`PayItem`; never "Service" or "service code"), **field event** (never "half"), its **code**, **payable type** (never "Classification"), **debris type** (never
   "debris class"), **site type** and the site facts **Takes loads · Haul-outs leave here · Charges a
   tipping fee · Ineligible site**, **field tag**, *Add / Remove transaction #n*, completed load `CLT` /
   `CHO`, set up, installation. The old words appear only in the History list. **Every example comes
   from the example world** (CONVENTIONS §6, the golden mission) with codes in the §5 convention:
   replace the skill's retired examples (`54A`, `90A`, TFR, Charlotte County Landfill…), and never
   quote a user answer just for its example.
8. **After writing:** check `spec/golden/MISSION.md` against the skill (fix the mission if it's
   wrong; it's a draft); note stale lines you saw in part pages, `RULES.md`, `LISTS.md` or
   `RATE-SHEET.md` in KD-62 (don't fix them in the same response); record the rewrite as an ADR
   (method is ADR-138, so one short row), update SUMMARY ("Agent tooling": which skills are done),
   KD-58/KD-33/KD-62, and this checklist; close out (`adms-close-out`).
9. **Write in field events (ADR-236; model: `adms-domain` §1.2).** What a monitor records under a
   ticket number is a **field event** (`COL`, `DIS`, `HOC`, `HOD`, `URT`); a ticket is its number and
   its events; the completed load / haul-out, statuses, flags, zone, mileage and transactions are
   **conclusions the worker draws from the events** and draws again on every reprocess. Describe each
   workflow as its events, the one that makes the number and the one that takes the quantity; a
   check compares events; a correction changes an event in place, audited (event-driven, not
   event-sourced); forms and certifications are records, not a ticket's events. Never a bare
   "event" for the disaster (*declaration event*). Say "unpartnered event", not "lone half".

**Superseded ideas that leak most** (each must appear only in the History list):
`MATCHED`/`FAILED` statuses; `LoadTicket`/`HaulOutTicket` and prefixed numbers (`COL-…`); a load's
"halves" and "service code" (now field events and pay items, ADR-236, 237); correction events or a
replayed event log; pairing on
a composite key; a monitor-recorded zone; the 5 km route check and route drift; mileage to the
disposal's end GPS; a monitor picking a pay item for a load, a Service on a load, codes copied per
prime, "shown to monitors" codes; the site options Disposal · Haul-out · Staging · Citizen drop-off ·
HHW and an HHW site type; a "requires weight" box, asking for both a load call and a weight, a
weight-vs-load-call check; paying a stump from its CY, or its root ball as 3.6 × D for the fill;
citizen drop-off as a ticket type; QC on a load's halves; "only a person voids"; the fee-kind
conflict check (now the # slot) and fee kinds at all (ADR-246); the "ticket's own contract"; a 4-photo limit; a GPS accuracy check;
a ticket list on disposal phones; ageing or grace periods; work orders and purchase orders; the
historical files (`database/src/services/`, `queries.py`, `validators.py`, `gps.py`,
`compute_volume`, `writeAudit`, FastAPI on port 8001, `pytest`).

**Who owns what** (so nothing is written twice):

| Skill | Owns | Points elsewhere for |
|---|---|---|
| `adms-domain` ✅ | what an ADMS is, who's who, a ticket's life in brief, glossary, invariants | everything in detail |
| `adms-ticket-workflows` ✅ | the setup spine and what each setup record holds; each workflow's field events (which makes the number, which takes the quantity); how every capture starts (badge first, number last); workflows A (loads, splits, loads carrying tickets), B (haul-outs), C (each unit rate kind: hangers, leaners, stumps, white goods, crew time, HHW), D (ROE, surveys, incidents, drop-off logs); numbers; the order of a reconciliation run | checks and flags (validation), pricing (ledger), duplicates (exceptions), phone screens (field-app) |
| `adms-validation` ✅ | statuses; every check and its flag and message style; accepting a flag; how rules run (criteria read only the ticket, # order, creates → deletes → voids, a rule's void wins); quantity math (capacity × call, split shares, diameter from circumference, stump and fill CY, crew hours) | the flag catalogue, later (`spec/FLAGS.md`) |
| `adms-data-model` | the records and their links (target model: `FieldEvent`, the completed records drawn from it), reference vs evidence vs ledger, fixed vs firm-extendable lists (`spec/LISTS.md`), which package touches what (ARCHITECTURE §18) | field names (naming pass, `spec/DATA-MODEL.md`) |
| `adms-exceptions` | duplicates and quarantine; renumber vs void; corrections and reprocessing; orphans and preloads; back-office-created records; an out-of-service phone | flags (validation) |
| `adms-ledger-audit` | Services and rates per prime; transactions and regeneration; rule actions and pricing (with `spec/RULES.md`); the audit log; QC status; the invoice lock and batches; the client package | the rule builder screens (`spec/RULES.md`) |
| `adms-certifications` | containers and crews, the one number, capacity math (§3A.3, user-confirmed, never changed), photos, attestation, lifecycle, copies, number blocks, a truck keyed by hand | |
| `adms-field-app` | enrolment and the day's assignment on the phone (ADR-240), setup when unassigned, sign-in, switching monitors, the time clock on the phone (ADR-241), encryption, turn-in and out of service; what a phone holds (lists, the site lookup); capture screens and order; printing; GPS and photos on the phone | workflows (ticket-workflows) |
| `adms-scale-receipts` | when a receipt exists, what it is, transcription, one quantity from the paying Service, a tandem's shared weight | |

**Start lists** (ADRs to read before writing; superseded ones only for the History list; 007, 016
and 030 are superseded in part, so read the row's ⚠️ note first):

| # | Skill (lines today) | Start from | History only |
|---|---|---|---|
| 0.2c.1 ✅ | `adms-ticket-workflows` (665 → 513, done 2026-09-29, ADR-242) | 006 013 019 027 030 032 040 041 046 053 055 056 062 063 065 088 124 126 127 128 131 132 137 145 146 148 149 150 158 159 160 161 162 173 176 177 178 183 184 186 187 188 189 192 195 196 198 199 200 203 204 205 207 208 209 211 213 214 215 216 217 218 219 220 221 222 223 226 227 228 229 | 010 047 180 182 185 191 193 201 |
| 0.2c.2 ✅ | `adms-validation` (323 → 358, done 2026-09-29, ADR-244) | 019 028 033 048 052 053 060 079 083 086 100 111 116 118 130 131 135 136 141 142 154 161 164 166 167 177 181 203 205 210 213 215 217 222 223 226 239 240 243 | 010 011 012 029 |
| 0.2c.3 ✅ | `adms-data-model` (438 → 343, done 2026-09-29, ADR-245) | 023 024 026 050 070 074 075 081 093 094 097 100 105 107 108 145 146 148 160 164 168 173 194 206 211 214 216 221 227 233 236 239 240 241 243; ARCHITECTURE §5, §18; `spec/LISTS.md` | 001 009 |
| 0.2c.4 ✅ | `adms-exceptions` (464 → 342, done 2026-09-29, ADR-248) | 022 028 033 039 051 052 053 055 086 134 155 156 166 167 236 240 | 020 025 029 |
| 0.2c.5 ✅ | `adms-ledger-audit` (210 → 211, done 2026-09-29, ADR-249) | 007 057 061 067 068 081 084 085 089 090 097 107 109 117 118 121 122 123 125 126 128 130 131 132 146 147 168 174 202 206 212 222 228 229 239; `spec/RULES.md` | 054 |
| 0.2c.6 ✅ | `adms-certifications` (320 → 264, done 2026-09-29, ADR-250) | 015 016 017 045 048 073 076 078 079 080 082 087 102 (Q-96) 108 151 152 153 154 157 179 228 240 | |
| 0.2c.7 ✅ | `adms-field-app` (321 → 252, done 2026-09-29, ADR-251) | 031 056 071 072 083 095 096 099 101 105 106 115 120 134 145 151 157 170 172 176 186 195 207 209 213 223 227 240 241 243; ARCHITECTURE §7–§11; `spec/FROM-BUILD-1.md` | 193 |
| 0.2c.8 ✅ | `adms-scale-receipts` (256 → 177, done 2026-09-29, ADR-252) | 034 035 036 037 038 069 165 175 202 221 223 227 243 | |

`adms-verify` is rewritten by the scaffold (0.2.2); `adms-decisions` and `adms-close-out` are process
skills, checked and marked when they next change.

**Done when** (each skill), shown with real output:
- `grep -c '^> ⚠️' SKILL.md` is **0** (every note absorbed into the body);
- the leak list above appears only below `## History`. This command must print **0** (it gave 25
  on the old `adms-ticket-workflows` and gives 0 on the rewritten `adms-domain`, `adms-ticket-workflows`, `adms-validation` and `adms-data-model`); read the rest of the
  leak list by eye, since some of it can't be grepped:
  ```bash
  leak='MATCHED|FAILED|LoadTicket|HaulOutTicket|\b(COL|DIS|LDT|HOT)-[0-9]|TDRS|ROUTE_DRIFT|route drift|requires weight|drop-off (ticket|ticket type)|database/src|queries\.py|validators\.py|gps\.py|compute_volume|writeAudit|FastAPI|pytest|port 8001|[Ss]ervice codes?|ServiceCode|\bhalves\b|ticket half|lone half|[Ff]ee.kinds?'
  awk '/^## History/{exit} {print}' .claude/skills/<skill>/SKILL.md | grep -c -E "$leak"
  ```
- the **retired examples and old names** appear only below `## History` too: both commands print
  **0** (`spec/CONVENTIONS.md` §7; the same checks for any spec page rewritten):
  ```bash
  retired='\b(1A|1B|2A|2B|2C|6A|7A|7B|8A|8B|8C|54A|56A|56B|90A|99A|P1A|V1)\b|`(3A|4A)`|(3A|4A)-|\bBobs\b|\bToms\b|\bTFR\b|Ceres|Alachua|Charlotte County|Hwy 20|Private pit|Don Pedro|Oak Ave|OPERATION OF TDMA|BDR Load|M00349[0-4]|61081[0-4]|104499|DR-4673|Greene County|Sweeps Away'
  old='\bServices\b|\bService( [^cC]|[^ a-zC]|$)|Classification|[Dd]ebris class|Location Type|Allow (Collection|Disposal)|Disposal Fee|Special Class|Create Transaction|Delete Transaction'
  awk '/^## History/{exit} {print}' .claude/skills/<skill>/SKILL.md | grep -c -E "$retired"
  awk '/^## History/{exit} {print}' .claude/skills/<skill>/SKILL.md | grep -v '^> \*\*User' | grep -c -E "$old"
  ```
  (a user quote keeps its own words; a line naming the legacy term to explain it, e.g. "the legacy
  'Service'", is fine: say so in the report);
- the marker is there, and the session hook lists the skill as current;
- line count before → after is reported (shorter, or say why not);
- SUMMARY, KD-58/33/62, this checklist and the golden mission are updated in the same response.

###### Milestone 0.3 — The database enforces the rules ✅ done 2026-09-30 (ADR-267…273)

**Builds on the installer (ADR-266):** the four login roles and the database `adms` exist after `pnpm installer`, and each role's URL is in its service's env file (`packages/db/.env` holds `adms_owner`'s). Migrations run as `adms_owner`; the installer's `migrate()` and `seed()` stubs (`tools/setup/src/installer.ts`) are where `prisma migrate deploy` and the seed are called. Grants on tables, the guards and row-level security are migrations, not the installer's.
- [x] **0.3.1** ✅ **done 2026-09-29 (ADR-267, 268): Prisma 7.10.0; nine provisional models in `packages/db/prisma/schema/` (CompletedLoad, InvoiceLock, Contractor added for REQ-009/013/014); migration `20260930024320_hardening_models` applied by `pnpm installer` on a resume and a fresh install, at head on a rerun; the installer makes the shadow database `adms_shadow` and checks `prisma migrate status`.** Prisma multi-file schema: the minimum models to test hardening (project, a field event, `AuditRecord`, `Transaction`, device, user). Named per `spec/CONVENTIONS.md` §3; final until `spec/DATA-MODEL.md` (0.2b.2) says otherwise; the hardening, not the product model, is what 0.3 proves.
- [x] **0.3.2** ✅ **done 2026-09-30 (ADR-270): nine guard migrations (checks, grants, no delete, audit capture, append-only audit, transaction delete, row-level security, and two fixes forward), applied by `pnpm installer` on a re-created database and each shown in psql.** **How (ADR-113, 266, 268):** the four **login roles already exist** (the installer makes them with their passwords); the guard migrations **grant** to them, never create them. Make each stub with `prisma migrate dev --create-only --name <guard>` in `packages/db` (the hook lets SQL be written only into that empty stub), then apply with `pnpm installer`. Quote the tables named by SQL keywords: `"user"`, `"transaction"`. Ids default to `uuidv7()` in the database, so trigger-written rows need none. Guard migrations (ADR-113): roles, grants, delete refusal, audit trigger with required actor, `AuditRecord` insert-only, transaction-delete copy-to-audit and invoice-lock refusal, row-level security.
- [x] **0.3.3** ✅ **done 2026-09-30 (ADR-272): 94 database tests in `packages/db/test` (Vitest, `pg`, the local stack's administrator with `SET LOCAL ROLE`, each test rolled back); every grant and refusal, the catalog read exactly, `guard_table` and `guard_gaps()`; 26 guard mutations on a throw-away copy, each caught; `guard_gaps()` fixed forward (`guard_gaps_trigger_kinds`). Chain 12 files, 106 tests.** Tests asserting every grant and every refusal (REQ-009…014).
- [x] **0.3.4** ✅ **done 2026-09-30 (ADR-273): `db.$write(actor, work)` in `packages/db` (`@prisma/client` + `@prisma/adapter-pg` 7.10.0; the client generated by `pnpm generate`); the system actor (`User` role `SYSTEM`) seeded by the installer through `prisma db seed`; 9 tests as the services' own logins, each undone; three extension faults each caught. Chain 13 files, 115 tests.** A Prisma client extension that states the actor at the start of every write transaction.

###### Milestone 0.4 — Prove it end to end ✅ done 2026-10-01 (ADR-275, 276, 281)
- [x] **0.4.1** ✅ **done 2026-09-30 (ADR-275): `packages/scenarios`, `pnpm scenarios` (`list`, `clean`, `--keep`); each story on its own `adms_story_…` database, locked down, migrated through `packages/db/prisma.story.config.js`, seeded, dropped afterwards; a story clock, simulated offline phones, a stand-in for the API's sync; story `ticket-101001` (14 checks). 12 tests; nine harness faults each caught. Chain 15 files, 127 tests.** Scenario harness: runner, a controllable clock, a simulated offline device, and one trivial story (REQ-017). Carry-forward C1–C3 done.
- [x] **0.4.2** ✅ **done 2026-09-30 (ADR-276): the system actor's guard (migration `guard_system_actor`: only the worker and the seed write as it or with source `SYSTEM`, no runtime login changes it, `SYSTEM` is one id and never a person; `installer:check` 20 ✓); `pnpm security` (`tools/security`): the dependency audit (3 Prisma-CLI advisories accepted by id), secretlint 13.0.5 plus the installation's own secrets and password-like settings, the env files, the grant tests; `migrations.test.ts`, `configuration.test.ts` (CIS), `system-actor.test.ts`. Twelve guard and five configuration loosenings each caught. Chain 19 files, 162 tests. `pnpm security` 6 passed, 1 failed: the historical root `docker-compose.yml` (KD-59), the user's to retire.** Security checks wired into the test run (REQ-018). **Before starting, read the carry-forward register below, items C4–C11; C4 (the system actor's guard) is in 0.4.2's scope at the user's word (ADR-274).**
- [x] **0.4.3** ✅ **done 2026-10-01 (ADR-281): three migrations (`monitor_number_issuer`, `dispatch_models`, `guard_dispatch_models`); `MasterPasscode`, `NumberBlock`, a provisional `DisposalSite`, `Assignment`; `Device` with its name, unique key, status and passcode version; `User` with an employer and a database-issued Monitor ID; `FieldEvent` with its assignment and setup version; `Project`'s time zone checked to be an IANA name; the master passcode's hash moved from `packages/db/.env` into the database, kept out of the audit log. Database tests 189 in 16 files; 39 loosenings each caught; story `dispatch-monday` (12 checks). Chain 23 files, 234 tests. C12–C15 and C37 done; C42–C47 filed.** Time zone, device, **assignment** and Monitor ID models (REQ-019…021; ADR-240).

###### 📌 Carry-forward register: known later concerns (ADR-274)

Everything a Phase 0 ADR (255…273) left for later, filed under the task that picks it up. **Rule for
every agent:** at the start of a task, read its items and either do them, or say in the task's ADR why
each waits and move it to a later heading. At close-out, a new "later" in an ADR gets a line here in
the same response. An item leaves only when done (struck through, with its ADR) or re-filed; never
delete one.

**For 0.4.1, the scenario harness**
- ~~**C1. A database a story may leave rows in.** Nothing can be deleted, so a story can't run in the
  installation's own `adms` and clean up. ADR-272's mutation runs used a throw-away copy
  (`CREATE DATABASE <name> TEMPLATE adms OWNER adms_owner`; the owner must own it, or its owner's-rights
  triggers can't see the schema's types; no service may be connected to `adms` while it's copied).
  **Postgres doesn't copy a database's access list with its template** (seen 2026-09-30: a copy of
  `adms` had an empty list, the default, under which **anyone may connect**), so revoke `PUBLIC`'s
  connect and grant `CONNECT` to the logins on the copy, as the installer does for `adms` (its
  `publicCanConnect` check). Decide in the ADR who makes and drops the copy, and that a story never
  writes to `adms` itself. (ADR-272 (1), 273 (6))~~ **Done (ADR-275 (1)):** a new database per story from `template0`, locked down and checked, migrated and seeded, dropped afterwards; not a `TEMPLATE adms` copy.
- ~~**C2. Writes go through `@open-adms/db`**: `openDatabase` + `db.$write(actor, …)` as the services' own
  logins (URLs from `apps/*/.env`, never printed; the pattern and `ADMS_TEST_DATABASE` are in
  `packages/db/test/support/service.ts`), the worker as `systemActor`. Prisma's interactive
  transaction defaults to a **5 s timeout and 2 s wait**; `$write` passes no options yet. If a story or
  the worker needs more, add an options argument to `$write` in its own ADR, never a global raise.
  (ADR-273 (3))~~ **Done (ADR-275 (2)):** no story needed more than the default; the options argument still waits for the worker (C20).
- ~~**C3. Seed data for stories** (REQ-142) and the golden mission (`spec/golden/MISSION.md`) are Phase 1's;
  0.4.1's story stays trivial, from the example world (`spec/CONVENTIONS.md` §6).~~ **Done (ADR-275 (4)):** ticket 101001 only; the seed data and the golden mission stay Phase 1's (C30).

**For 0.4.2, the security checks (REQ-018; ARCHITECTURE §15, §16)**
- ~~**C4. The system actor can be claimed and changed by the API. User, 2026-09-30: make sure the API is
  unable to.** Today the database checks only that `adms.actor_id` is a `User` row (ADR-270 (4)), so:
  (a) `adms_api` can **state the system actor** (and source `SYSTEM`) on its own writes; (b) `adms_api`
  has UPDATE on `user`, so it can **rename it, change its role or archive it**; (c) nothing stops a
  **second `User` with role `SYSTEM`**; (d) the seed notices a change only on the next `pnpm installer`,
  and **`installer:check` doesn't look at the system actor at all**. Proposed, to be settled in 0.4.2's
  ADR and written as a guard migration in its `--create-only` stub (ADR-113), proven as ADR-272 did
  (each guard's removal caught on a throw-away copy):
  - the audit capture refuses `adms.actor_id` = the system actor's id
    (`00000000-0000-7000-8000-000000000001`) unless `current_user` is `adms_worker` or `adms_owner`
    (the seed), and refuses source `SYSTEM` from `adms_api`;
  - the system actor's `user` row can't be updated by any runtime login (a row trigger on `user`);
  - role `SYSTEM` only on that id (a check constraint: `role <> 'SYSTEM' OR id = '…0001'`);
  - `installer:check` gains a ✓ line for the system actor (the 20th); `adms-verify`'s counts follow;
  - **also decide:** may the worker state a person's id (a reprocess a person asked for), or only the
    system actor, with the person's request in `adms.reason` / `adms.request_id`? ARCHITECTURE §5.3 says
    "a real person, or the system actor for the worker"; don't restrict the worker without an ADR.
  - **A test to rewrite then:** `packages/db/test/actor.test.ts`, "the device it came from", states
    `systemActor` with source `DEVICE` through `adms_api`, only to prove the device id reaches the audit
    record. Under the new guard, write it as Ana Brooks on her phone: Dana creates Dana, Ana and the
    phone in one `$write`, the work then re-states the settings (a test-only `set_config`), then Ana's
    field event is written.~~ **Done (ADR-276 (1)):** the guard migration `guard_system_actor` (`writing_login()` in `audit_write`, the `user_system_actor` trigger, the `user_system_actor_check`); `installer:check`'s 20th ✓; `actor.test.ts` rewritten as asked. The worker may still state a person: Phase 1's worker decides (C20).
- ~~**C5. Migrations edited by a shell command.** The guard hook stops the Edit and Write tools from
  touching a migration unless it's still Prisma's empty stub, but **a `sed` or `python` edit isn't seen**
  (ADR-270 (8), flagged then). Add a test that each applied migration's `migration.sql` still matches
  its `_prisma_migrations.checksum` (the file's SHA-256; seen matching for `system_role`), so an edited applied migration fails
  the run.~~ **Done (ADR-276 (2)):** `packages/db/test/migrations.test.ts`.
- ~~**C6. Dependency audit** (`pnpm audit`, built in; the severity that fails the run is an ADR's call),
  beside `pnpm licences` (ADR-258: it "runs with the security checks"). Prisma Studio's `elkjs@0.11.1`
  and `@visx/vendor@4.0.0-alpha.0` are allowed by name and version (ADR-267): a Prisma upgrade makes
  them undecided again. Prisma 8 only when 8.x is stable, in its own ADR (ADR-267 (1)).~~ **Done (ADR-276 (3)):** every advisory fails unless accepted by id in `pnpm-workspace.yaml`; three accepted (C32).
- ~~**C7. Secrets scan**: its tool needs an ADR first (pinned, licence, at least 7 days old). It must
  **never print a secret it finds** (redacted output only). Expect it to find the historical root
  **`docker-compose.yml`** (KD-59: a plain-text password, Postgres on every interface at 5432).
  **Nothing is committed yet and that file is untracked**, so staging the whole folder would commit it;
  retiring it is the user's call: raise it. Check too that every `.env` file is ignored by git and
  untracked.~~ **Done (ADR-276 (4), (9)):** secretlint 13.0.5 in `tools/security`, with the installation's own secrets and password-like settings; the env files checked; `docker-compose.yml` raised with the user (KD-59, C27).
- ~~**C8. The grant tests** already run in `pnpm test` (ADR-272); REQ-018 wants them reported with the
  security checks, with real counts.~~ **Done (ADR-276 (5)):** inside `pnpm security`, counts reported.
- ~~**C9. CIS PostgreSQL Benchmark** for the database's configuration (ARCHITECTURE §16: "each phase's exit
  includes the checklist items for its layer"): pick the items that apply to the local stack's Postgres
  18.6 and the four logins, test what can be tested, list what waits for the cloud.~~ **Done (ADR-276 (6)):** `packages/db/test/configuration.test.ts`; the cloud's items filed as C33.
- ~~**C10. Connections (ARCHITECTURE §5.7)**: `openDatabase` sets only the pool size. **No statement
  timeout and no TLS yet.** TLS is required outside the local stack; the statement timeout (per login,
  `ALTER ROLE … SET statement_timeout`, or per connection) is a policy value in `.env`, never a literal.
  Decide in 0.4.2, or file it under the demo deploy (C25).~~ **Re-filed (ADR-276 (7)):** decided (a per-login statement timeout set by the installer from a policy value in `.env`; TLS outside the local stack) and moved to C34 (Phase 2) and C33 (the demo deploy).
- ~~**C11. The master passcode** is 8–128 characters with **no breached-list screening yet** (ADR-266;
  NIST SP 800-63B asks for it): Phase 2's sign-in at the latest; list it in 0.4.2's NIST/ASVS notes.~~ **Re-filed (ADR-276 (8)):** as C35 (Phase 2).

**For 0.4.3, the time zone, device, assignment and Monitor ID models (REQ-019…021)**
- ~~**C12. The master passcode's hash moves into the database** with the device model and its verifier
  version (REQ-020): the seed writes it (through `$write` as `systemActor`) and it leaves
  `packages/db/.env` (ADR-266, 273 (5)); the installer's re-check follows it.~~ **Done (ADR-281 (6)):** `master_passcode` (version, Argon2id hash; insert-only for the API, unreadable by the worker, kept out of the audit log); the installer hands the hash to the seed in memory; an earlier installation's copy is moved and the line removed; a lost database asks for the passcode again.
- ~~**C13. What already exists, provisional (ADR-268):** `Project.timeZone` (IANA); a field event's UTC
  instants, device offset and `receivedAt` (REQ-019 in part); `User.monitorNumber` (the Monitor ID);
  `Device` (public key, enrolled, out of service). Extend them; don't duplicate them.~~ **Done (ADR-281 (1)–(4)):** each extended in place.
- ~~**C14. Every new table**: its model in the right `.prisma` file by kind of record, a one-line
  `guard_table` guard migration (ADR-271), its grants added to the exact lists in `grants.test.ts` and
  `catalog.test.ts`, and **a deliberate row-level-security decision** (a table viewers see needs its own
  policy and view; `guard_table` doesn't do it). An evidence model that gains a column reruns
  `guard_table`.~~ **Done (ADR-281 (6), (10)):** three guarded in one line each, the master passcode with its own tighter guards, `field_event` rerun; no viewer sees any of the four, so no policy yet.
- ~~**C15. The system actor is never a person:** no assignment, device, Monitor ID or password for role
  `SYSTEM`; say so in the models (C4's guard may enforce it). *ADR-276 enforces the `user` part:
  `user_system_actor_check` (no Monitor ID, no contractor on role `SYSTEM`); the device and assignment
  models add theirs (no assignment or device for the system actor).*~~ **Done (ADR-281 (3), (4), (8), (9)):** checks on `assignment`, `field_event` and `user` (no employer); a device links to no person. The password is Phase 2's (C21).
- ~~**C37. Does `Device` carry a details column?** (ADR-278) The promo graphic claims "device
  metadata" as flexible data; `Device` holds only a public key and two dates today. Decide with the
  device model: what the phone reports about itself, if anything, and whether it's fixed columns or
  one JSONB details column. If JSONB, ADR-278 (1) holds: nothing the engine, a rule or a flag reads.
  Fields from `adms-field-app` and ARCHITECTURE §7; never invented.~~ **Done (ADR-281 (4)):** no details column; no rule has a phone report anything but its key and, at a sync, its clock.

**For `spec/DATA-MODEL.md` (0.2b.2) and Phase 1** — *2026-10-01: the draft (ADR-284) answers C16–C19, C29, C36 and C42–C44 on paper (its §12); each stays here until Phase 1 builds it.*
*2026-10-01 (ADR-300), Phase 1 open: the task that picks each up: C36 → 1.1.5 (the definition), 1.3.6 (the answers); C42 → 1.1.5, 1.1.6, 1.1.7; C52 → 1.1.7 (setup) ✅, 1.5.6 (the flags); C18 → 1.1.10, 1.7.1; C43 → 1.3.2; C44 → 1.3.3; C16 → 1.5.2, 1.7.1; C50 → 1.5.8; C20 → 1.5.9; C17 → 1.7.1, 1.8.2; C19 → 1.8.2; C29, C30 → 1.9.1; C51's two scenarios → 1.9.2; C28 → 1.9.3; C31's stand-in → 1.4.2. Filed since (ADR-303, 305; added here by ADR-307): C53 →
1.1.11, 1.5.5 (and Phase 2); C54 → 1.1.10; C55 → 1.5.5, 1.5.7; C56 → 1.2.3. Filed by ADR-311: C57 → 1.1.11, 1.5.6. Filed by ADR-313: C58 → 1.1.11, 1.6.1, 1.6.4. Filed by ADR-353: C72 → 1.6.2, 1.6.3, 1.6.4, 1.7.1, 1.7.2. Filed by ADR-355: C73 → 1.6.4, 1.7.1, 1.7.2. Filed by ADR-361: C76 → Phases 2 and 4, every later schema task. Filed by ADR-358: C18, C59, C62, C65, C66, C70's contractor-sight points → 1.7.3 (✅ done, ADR-361); C16 → 1.7.2, 1.8.2. Filed by ADR-356, 357: C74 → the first session from 2026-10-07, 1.7.2, 1.9.1, Phases 2…4. Filed by ADR-359: C75 → 1.8.2, 1.8.3, 1.8.4, 1.9.1, 1.9.2, Phases 2 and 4. Filed by ADR-315: C59 → every schema task, 1.2.3, 1.3.3, 1.7.1, Phase 2. Filed by ADR-317: C61 → 1.2.2, 1.2.3, 1.5.5, 1.8.2, 1.9.1. Filed by ADR-321: C62 → 1.3.2, 1.3.3, Milestone 1.3, 1.5.5, 1.7.1, 1.8.2, 1.8.3, Phase 2. Filed by ADR-322: C63 → 1.3.2…1.3.7, 1.4.2, 1.5.5, 1.5.7. Filed by ADR-323: C64 → 1.3.6, 1.3.7, 1.4.2, 1.5.5, Phases 2 and 4. Filed by ADR-325 (under C63): → 1.3.5, 1.3.6, 1.3.7, 1.5.4, 1.5.5, 1.5.7, 1.8.3. Filed by ADR-326: C65 → 1.3.6, 1.4.2, 1.5.4, 1.5.5, 1.5.7, 1.7.1, 1.8.3, Phases 2 and 4. Filed by ADR-327: C66 → 1.3.7, 1.4.2, 1.5.7, 1.6.4, 1.7.1, 1.8.2, 1.8.3, Phases 2, 3 and 4. Filed by ADR-332: C68 → 1.4.2, 1.5.7, 1.9.1, Phases 2 and 3.*
- **C36. The storage shape of the firm's added fields** (ADR-278, at the user's word): a versioned
  form definition per record kind, one JSONB answers column per record keyed by field ID plus the
  definition version, a schema generated from the definition in `packages/contracts`, Prisma's `Json`
  type, audited like any field; nothing the engine, a rule or a flag reads lives in JSONB. The draft
  settles the model and field names, the guard for the definition's versions (never edited or
  deleted) and how exports name the columns; it may overturn the details, with an ADR.
- **C16.** Every model and field is provisional (ADR-268). ~~`CompletedLoad` links one collection (a split's
  several are DATA-MODEL's); `CompletedHaulOut` is still to come;~~ ✅ built, ADR-340 (1.5.2). ~~**Task 1.7.1:** `Transaction` lacks pay item, rule,
  contract and operating sub, and its links to a property (`completedLoadCollectionId`), a haul-out and its pile, and a unit rate ticket; its viewer policy still finds its project through `viewer_sees_load_project`.~~ ✅ built, ADR-358 (the function is gone: a line carries its project). ~~**Left by 1.7.1 for 1.7.2:** the worker writes each line with its project, the property's or pile's row id, the rule's contract, `TicketRead.operatingSubId` and the run; it removes and writes a ticket's lines in the ticket's one piece of work and never on a locked ticket (the database refuses both).~~ ✅ ADR-359. ~~**For 1.8.2:** the lock's unlock columns and batch, and the two guards then asking only about live locks; `InvoiceLock` holds no project and doesn't hold its field event to a unit rate one.~~ ✅ built, ADR-363.
- **C17.** ~~A transaction **insert** on an invoice-locked load isn't refused by the database (it's the
  worker's "regenerate only un-invoiced tickets", ADR-090);~~ ✅ refused since ADR-358, on a load, a haul-out and a unit rate ticket (`transaction_refuse_on_locked_ticket`). ~~**Task 1.8.2:** unlocking needs an unlock column, since an
  `InvoiceLock` can't be deleted (ADR-270 (6)); both guards then read only locks not unlocked.~~ ✅ built, ADR-363.
- **C18.** ✅ **done (ADR-361): a contractor user sees its own tickets, told by the certification.** ~~Field events and completed loads carry no contractor yet, so **a contractor viewer sees none
  of them** (fail closed): **task 1.7.3** (ADR-358).~~ ~~a prime's view of its subs' transactions comes with the operating sub
  (ADR-270 (7)).~~ ✅ built, ADR-358: a line carries its prime and its operating sub, and a contractor user sees its own contractor's lines as either.
- **C19.** ~~Where a person's **void** is recorded (the status column is the worker's today; ADR-270 (2)).~~ ✅ `TicketVoid`, its own record (ADR-363); the worker reading it is task 1.8.4's (C78).
- **C29. Times the database stamps itself** (`audit_record.occurred_at`; **not** `created_at` or `enrolled_at`, which Prisma's client fills with the app's clock, KD-68) use its own clock, not the story's (ADR-275): a story asserts the audit log's order, not its times. If the golden mission must assert them, decide then (e.g. the API stating the time it writes).
- ~~**C30. The golden mission as a story**~~ ✅ done, ADR-368 (REQ-017 stays open until it runs; REQ-142, REQ-143): its setup, days, reviews, ledger and audit rows asserted exactly; the worker's writes through the `worker` client as `systemActor`; add stories to `packages/scenarios/src/stories/index.ts`.
- **C42. The assignment's forms; the real pay item and site** (ADR-281 (8)). **The site done
  (ADR-311)**; what is left is a field event's own site and a contractor's kind (below). ~~REQ-020's "work: … unit rate
  pay items"~~ **done (ADR-286): a provisional `PayItem` (project, code, name; since ADR-301 its code is unique on its project and it has a description, not a name) and `AssignmentPayItem`;
  REQ-020 ticked.** ~~The forms an assignment names~~ **done (ADR-308): `formDocumentTypes`, held to
  ROEs, surveys, incidents and drop-off logs.** ~~`PayItem`'s real fields and its rate per prime
  (REQ-102, DATA-MODEL §3); the check that a named pay item is a unit rate one~~ **done (ADR-309):
  every field, a rate per prime, and a three-column foreign key that names only a unit rate pay
  item.** ~~`DisposalSite` is
  provisional (project and name): its site type, facts, permit, GPS, area and dates are DATA-MODEL's~~
  **done (ADR-311).** Still to come: a field event's own site (each record keeps the site it was made at, ADR-195). A
  contractor's kind (hauler, monitoring, crew, other; Q-97) comes with `Contractor`'s real shape.
- **C43. Numbering** (ADR-281 (5)) — **done by task 1.3.2 (ADR-323)** but for where a firm's Monitor ID series starts if it isn't `M000001` (no task needs it yet; Phase 4's setup screens): `NumberBlock` holds only a block's range, last used number and
  how it ended. Still to come with tickets and numbers: the project's series and control ranges, the
  allocator (the server is the only one, ADR-065), **a database refusal of overlapping blocks** (an
  exclusion constraint; **`btree_gist` is in since ADR-310**, in the schema `extensions`, so no ADR
  of its own is needed: `pay_item_bands_never_overlap` is the idiom), which block an ROE's number comes
  from (ADR-181), and where a firm's Monitor ID series starts if it isn't `M000001`.
- **C44. Back-office-created field events** — **built by task 1.3.3 (ADR-324)**: `field_event_source_check`. **Flagged since ADR-345, at the user's word: `ASSIGNMENT_ON_ANOTHER_PROJECT`.** Was: (ADR-156; ADR-281 (9)): they have no phone and no
  assignment, so `FieldEvent.deviceId`, `assignmentId` and `setupVersion` become optional for them (with
  a check that a phone's record still carries all three). The engine flags an event whose project
  differs from its assignment's (the database doesn't refuse it).
- ~~**C50.**~~ **Done (ADR-349, task 1.5.8): the three questions are `apps/worker`'s `MapServers`; left: private roads under `shortest` (for the user), and where a mileage's two ends are kept (1.5.9).** Was: **What the worker asks the map servers, and where the answer is kept** (ADR-282 (11); REQ-126f):
  Valhalla's request for "the shortest route on public roads open to ordinary traffic" (`shortest`,
  and how private roads are left out, ADR-163), the snap to the nearest road (`locate`), Nominatim's
  reverse lookup of the snapped point; each mileage stored with the map data's date and the extract's
  hash (DATA-MODEL §5). The golden mission's GPS points come from the pinned extract (with C30): the
  example world's Bayline County is made up, and its roads stand in from Delaware's until the user
  names another region.
- ~~**C51. Split haul-outs have no requirement and no golden-mission ticket** (ADR-295). The rule is
  recorded (`adms-ticket-workflows` §4.4a, `adms-validation` §5.5, DATA-MODEL §5) with an example
  (ticket 201004), but `REQUIREMENTS.md` has no REQ for it and `spec/golden/MISSION.md` covers
  only an ordinary haul-out. With Phase 1's milestones: add the REQ beside the split-load ones, and
  propose a split haul-out for the mission (the user signs off its numbers; never invent coverage).~~
  **Done (ADR-296, 297):** REQ-111a and REQ-120j; golden mission ticket 201004, weighed at the
  user's word (three piles, 24.00 tons at Cypress Creek Landfill, three lines, $480.00; P1's ledger
  $5,548.25 on 19 lines); **the mission is approved, numbers included (ADR-297).** **Left for the
  tasks that pick them up:** **two acceptance scenarios** for `spec/acceptance/`, since neither is
  in the mission: a split haul-out paid by the CY (the same piles dumped at Bayline County Landfill:
  11.0, 27.5, 55.0 CY, six lines, $850.85) and a pile whose call isn't higher than the one before
  (`PILE_CALL_NOT_HIGHER`); as a story (C30), the haul-out phone's numbers run 201001 then 201004
  (201002 and 201003 are the flag catalogue's examples), which a story states itself, as today's
  stories do, and the story seeds the mission's second landfill, its per-ton pay item and its sixth
  monitor (`spec/CONVENTIONS.md` §6).
- **C52. *Haul-outs leave here* only on a TDSR/DMS site** (ADR-298). **Setup half done (ADR-311):**
  the database refuses it too, and refuses changing a marked site's type (`siteTypeKey`, a check);
  `SiteFacts` says so in setup. ~~The two flags are 1.5.6's.~~ **The two flags are built (ADR-346: AC-06-67, 68); C52 is done but for 1.6.3's "no lines".** With `DisposalSite`'s real
  model (C42): setup refuses the mark on any other site type and refuses changing a marked site's
  type; decide whether the database refuses it too (the type is a list row acted on by its fixed
  key, so a plain check constraint can't see it; a guard needs its own migration and test). An
  acceptance scenario: a haul-out that left a landfill is flagged `SITE_NOT_FOR_HAUL_OUTS`; one
  dumped back at the TDSR it left is flagged `HAUL_OUT_DUMPED_AT_TDSR` and not priced.
- **C53 (first part ✅ done, ADR-316: `apps/api/src/policy.ts`, handed to `ProjectSetup`; the override ✅ decided, ADR-395: a service's own settings win, by the same name; what is left is the worker's thresholds, 2.6.2: ✅ done, ADR-473, `DEVICE_CLOCK_OFF_LIMIT_MINUTES`). Where a server app reads the policy values, and whether an installation may override one**
  (ADR-303 (3)). The release's built-in defaults are `packages/domain/policy.env`; today only the
  scenario harness reads it (`packages/scenarios/src/policy.ts`). **Task 1.1.11:** the API's setup
  service that creates a project takes the `Policy` (the harness hands it over; the loader moves
  beside the service). **Task 1.5.5: none added (ADR-344 (13)): the clock threshold has no recorded number and nothing to read until Phase 2's sync record, and the other time checks have no tolerance. Phase 2:** ✅ *(ADR-473, as this entry's heading says; swept by ADR-522)* the worker's own thresholds (ARCHITECTURE §10: the clock
  difference at a sync, and the time checks) join `policyNames` and `policy.env`, each with its ADR.
  ~~**Phase 2, with the API's configuration:**~~ *(ADR-522: the override ✅ ADR-395; `installer:check` reporting the values in force ✅ ADR-530 (14): each service's, by name and value)* decide whether a value of the same name in a service's
  own env overrides the built-in default for the installation, and have `installer:check` report
  the values in force.
- **C54. ✅ done (ADR-315): a client user and an auditor see the whole setup, a contractor user none; the table is `user_viewer_project`.** ~~A viewer and the project's setup~~ (ADR-303 (5)). Task 1.1.10: what a client user, a
  contractor user and an auditor see of `client`, `declaration_event`, `project_kind_of_work` and
  the project's new columns (the viewer view shows five columns today), each with its
  row-level-security decision. **The model `ViewerProject` can't take the table name
  `viewer_project`: that is already the project's viewer view** (the row-level security guard,
  ADR-270); 1.1.10 names its table otherwise (`@@map`) and says so in `spec/DATA-MODEL.md`.
- **C55. Two REQs this plan said 1.1.3 ticks, left open** (ADR-303 (8)): **REQ-105d** is ticked
  with task 1.5.7 (the ROE flags a program type's *Requires ROE* drives); **REQ-105j** with task
  1.5.5 (the "project not active" flag, which that task already names).
- **C56 (✅ done, ADR-321: a typed sub's place, `SubPlaces`; the merge, `ContractorSetup.merge`; a certification's prime and subs held by foreign keys). What a contractor merge moves, and who names a prime next** (ADR-305 (2), (4)). **Task
  1.2.3:** a sub typed in at certification is written as a `ProjectContractor` row under its prime
  (`subOn`'s shape: tier 1 or 2, `primeId` the prime at either tier; which tier 1 a tier 2 works
  under is the certification's `firstTierSubId`); decide there what merging two spellings of a sub
  does to the duplicate's place on each project and to the certifications that name it (today only
  the link exists: `mergedIntoId`, never itself, the merged row archived), and whether a merge into
  an already-merged contractor is refused; **REQ-106e is ticked there**, not before. **Tasks 1.1.6
  and 1.2.3:** `PayItemRate.primeId` (✅ built, ADR-309) and `Certification.primeId` point at the same key as a
  contract's prime, a two-column foreign key to `project_contractor (project_id, as_prime_id)`, so
  a rate or a certification can't name a contractor that isn't one of the project's primes.
  **Task 1.1.11:** the API's setup service is the one place that adds a prime to a project and
  writes `asPrimeId` with it. **Task 1.1.10 (C18):** a prime's sight of its subs' tickets reads
  `project_contractor`; and whether any read-only viewer sees a contractor's contact details
  (ADR-306; ADR-169 keeps personal phone numbers from them).
- **C57 (✅ done: the reader, ADR-316, `MapShapes`; point-in-polygon, ADR-346, `ShapeArea`). Reading a shape, its bounding box, and point-in-polygon** (ADR-311 (6)). The database
  keeps a GeoJSON `Polygon` or `MultiPolygon` and four bounding-box columns, and checks only that the
  shape holds its type and coordinates and that the box is on the earth; **whoever writes a shape
  works out its box**. **Task 1.1.11** (the setup story through the API's services, which load P1's
  map): a `packages/domain` reader that takes a GeoJSON geometry, Feature or FeatureCollection,
  refuses anything but closed polygon rings in WGS84 ranges, merges features of one zone name into a
  MultiPolygon, and gives the bounding box (no dependency, or one pinned by an ADR). **Task 1.5.x
  (the zone and site-area checks):** point-in-polygon in the same module, a point on an edge
  inside (ARCHITECTURE §3), the box as a quick first test. A shapefile, KML and an Esri layer link
  are REQ-124b's import in the back office (Phase 4), with their libraries' ADRs.
- **C58 (task 1.1.11's part ✅ done, ADR-316). What the rules' build left for later** (ADR-313 (8), (10)). **Task 1.1.11** (the setup
  story through the API's services): the service that saves a rule calls `ProjectRules.check` first
  and saves nothing on a refusal; the pay item service matches `PaysWhen.rules(…)` to the rules the
  pay item already keeps (change, add, archive), and gives each picked value its `gone` (archived,
  or a zone name the current map lacks). ~~**Task 1.6.1** (the engine): an *Item* line compares the
  count of its one picked item, IS EMPTY / IS NOT EMPTY ask whether the ticket lists it; the same #
  added twice by one rule is flagged like two rules adding it.~~ ✅ written as AC-07-36 and AC-07-78 (ADR-353); built by 1.6.2 and 1.6.3. ~~**Task 1.6.4** (the setup check):
  decide what an archived pay item, contract or form does to a rule that names it (`spec/RULES.md`
  §7 speaks only of a criterion's value), and list it.~~ ✅ ADR-357 (2): the rule is not valid, never runs, and is listed.
- **C59. What the viewers' build left for later** (ADR-315 (1), (2), (3), (8)). **Every later
  schema task:** a new table a client user or an auditor should see gets `SELECT guard_viewer(…)`
  in its guard migration and a row in `packages/db/test/support/viewers.ts`; one nobody should see
  goes in that file's `unseenTables`; a viewed table that gains a column reruns `guard_viewer`.
  ~~**Task 1.2.3** (certifications): a certification's viewer sight, without the driver's licence
  number (AC-02-71's other half).~~ ✅ done, ADR-321 (a contractor user's sight of its own
  certifications: 1.7.3). ~~**Task 1.3.3** (field events in full): who recorded a ticket, by
  name and Monitor ID, for a client user and an auditor (no viewer reads `user` today), and the
  ticket's viewer view in its real shape.~~ ✅ done, ADR-324 (`viewer_field_event_monitor`; a back-office creator's name for a viewer is left to the task that gives viewers the back office's records). **Tasks 1.2.3 and 1.7.3** (C18; moved from 1.7.1 by ADR-358): what a contractor user
  needs of setup to read its own tickets and transactions (a debris type's, a site's, a pay item's
  name), and a prime's sight of its subs' through `project_contractor`; it sees no setup today.
  ~~**Phase 2:**~~ ✅ *(ADR-412, 434, 435; swept by ADR-522)* the API states `adms.viewer_id` on every `adms_readonly` request (C22); it reads a
  manager/analyst's permissions that aren't archived, and only on a manager/analyst (the database
  doesn't tie a grant to a role); it never gives a viewer a project or a kind the admin didn't.
- **C60. What the setup services left for later** (ADR-316 (2), (9)). ~~**Phase 2:**~~ ✅ *(ADR-424…427; swept by ADR-522)* the endpoints
  read who may do setup (an admin, or a manager/analyst granted Setup) before a call, map a
  refusal by the database's constraints to an answer, and add people's own services. **The task
  that first sets up a crew-day pay item:** its day length starts at the policy value
  `CREW_DAY_HOURS` in `PayItemSetup` (today the caller states it). **Each later list a firm adds
  to** gets its method on `ListSetup` with the task that needs it. ~~**Task 1.2.3:** a sub typed in
  at certification is written by a service beside `ContractorSetup.addPrime`.~~ ✅ done, ADR-321
  (`SubPlaces`). **Task 1.9.x (the
  golden mission):** whether P2 has a map (102001's zone), and the phones, people and viewers of
  §1, written through services. **Any guard that tells "the same piece of work" by a time**
  needs that column stamped by the database (`dbgenerated`), never `@default(now())` (KD-68).
- **C61. What the certification scenarios left for the tasks that build them** (ADR-317;
  `spec/acceptance/03-certification.md`, "Left to the task that builds it", fourteen points).
  ~~**Task 1.2.2:** a zero or missing measurement, boxes that subtract more than the primary holds;
  which roundings are "a step" inside one shape's formula; and the measured boxes of `730415`,
  `730416` and `730419` recorded in `spec/CONVENTIONS.md` §6.~~ ✅ done, ADR-320 (no capacity and a
  plain reason; every operation a step). **Task 1.2.3 ✅ done, ADR-321** (and from ADR-320: what its service does
  with measurements that give no capacity, whether the database takes a 0 CY container, and the
  example world's boxes written into `example-world.ts` from CONVENTIONS §6): **also** how the database
  holds "a container has boxes"; a certification's subs held to its own prime's; a typed sub that
  is another prime's; what a merge moves (C56); a vehicle type's *certifies* against the kind;
  whether a certifying assignment or a helper's assignment is checked; the date "replaced on" is;
  a contractor user's sight (C59); the audit domain; a copy's photographs; and the example world's
  certifying assignment (Sam Grant, Saturday 10 October 2026, with Lee Morgan), Tidewater Hauling
  and `730420`. **Task 1.5.5:** whether a tag is expired on its expiry date or the day after, and
  which of a field event's times is the work time. **Task 1.8.2:** what QC Void on a certification
  does to its tickets. ~~**Task 1.9.1 (KD-69):** ticket 102001's cert number on P2 needs the user's
  word~~ **answered (ADR-318):** P2 has its own certification `730416` (Rivera's self-loader, 48
  CY), which task 1.2.3 writes into the example world.
- **C62. What the certification's records left for later** (ADR-321). ~~**Task 1.3.2** (numbering)~~ **done (ADR-323): `copy` takes the other project's next number from the allocator; `certify`'s is the phone's, from its block.** Was:
  the cert number is the caller's today; the allocator issues it from the project's series, in
  100-number blocks per certifying phone (REQ-106a), and `Certifications.copy` takes the other
  project's next number from it. ~~**Task 1.3.3** (field events in full): a field event's
  `certificationId` and its own copy of the number (AC-03-40); no driver column on it (AC-03-16's
  other half).~~ ✅ done, ADR-324. **Tasks 1.4.2 and 1.5.2:** who fills `certificationId` (intake looks the scanned number up on the project; the worker again when the certification arrives later); the harness's phones send the number only. ~~**Milestone 1.3, with `Photo`:** a certification's five views, and whether a copy
  points at the original's photographs or holds its own (C61 point 14).~~ **Done (ADR-326):** `PhotoView` on a certification's photograph; a copy's photographs are the original's, through `copiedFromId`. **Task 1.5.5** (the
  flags): tag expired, revoked, replaced ("replaced on" is the new certification's certified time
  as a day in the project's time zone; whether work on that same day is flagged is decided there),
  no certification, typed capacity, a missing photograph; nothing flags a certification made
  without a certifying assignment. ~~**Task 1.7.1:** a transaction's prime and operating sub from the
  certification (the lowest tier filled)~~ ✅ ADR-358 (`TicketRead.operatingSubId`; the worker hands it to pricing in 1.7.2); **task 1.7.3:** a contractor user's sight of its own certifications
  (C18). **Task 1.8.2:** the QC mark; `signaturesOnFile` is set by `Certifications.signaturesOnFile`
  today. **Task 1.8.3:** after `Certifications.measure`, every ticket on the certification
  reprocesses, an invoiced one unlocked first (AC-03-52); a corrected copy flags its original
  (AC-03-57). ~~**Phase 2:**~~ *(ADR-522: only an admin revokes ✅ ADR-432; the sync wraps `certify` ✅ ADR-469; a merge saying so ✅ ADR-527 (11): it says what still names the duplicate, as warnings)* only an admin revokes; the sync endpoint wraps `certify`; a merge that
  finds rule picks, employers or viewers naming the duplicate says so (today they are left as they
  are). **Any later migration:** `prisma migrate dev --create-only` must give an empty stub; if it
  carries a line nobody asked for, a `dbgenerated` default is being read back differently (KD-70).
- **C63. What the capture scenarios left for the tasks that build them** (ADR-322;
  `spec/acceptance/04-field-capture.md`, "Left to the task that builds it", eighteen points).
  ~~**Task 1.3.2:** what a reclaimed block's unused numbers become; the ROE series' block size and
  the look of an issued ROE number; whether control ranges may overlap.~~ **Decided (ADR-323).** ~~**Task 1.3.3:** whether
  the database requires a typed number's reason; "keyed in by hand" and the typed capacity both or
  neither; a load on a crew's certification (or a unit rate event on a container's).~~ **Decided (ADR-324):** a reason only on a typed number, and a typed number without one taken; a typed capacity only when keyed in by hand; either kind of certification taken. **Task 1.5.5:** how `TYPED_TICKET_NUMBER` reads with no reason; whether a load on a crew's certification is flagged. **Each of
  1.3.3…1.3.6:** a client user's and an auditor's sight of each new evidence table, and its audit
  domain (C59). ~~**Task 1.3.4:** whether a picked debris type, field tag, ROE, payable type and pay
  item are held to the event's own project (a debris type to its workflow's form); a suffix off a
  collection, and what a suffix may be; a suffixed collection on a project that doesn't allow
  split loads; a disposal with two quantities; an itemised event's own count, quarter hours, a
  stump "as a circumference".~~ **Decided (ADR-325):** a debris type held to its own project's form for its workflow, a field tag and a pay item to its project; a suffix only on a collection or a haul-out collection, capital letters; the rest taken, for a flag. ~~**Task 1.3.5:** `FieldEvent.scaleReceiptId` joins with `ScaleReceipt` (only on a disposal and a haul-out disposal; `guard_table` and `guard_viewer` rerun; AC-04-38, 39, 52, 75), and whether a count and a scale receipt together are taken.~~ **Done (ADR-326): joined; a count, or a load call, beside a scale receipt is taken.** ~~**Task 1.3.6:** `FieldEvent.roeId` joins with `Roe` (AC-04-82's other half).~~ **Done (ADR-327).** ~~**Task 1.3.7:** the harness's phone sends the kind-specific details (`RecordedEvent` has none yet), and its intake reads the debris type's form from the project and workflow.~~ **Done (ADR-332).** **Tasks 1.5.5 and 1.5.7:** no flag exists for a unit rate ticket with no kind of work, payable type or count, a pile with no load call, an item that isn't its kind of work's, a pay item that isn't its payable type's, hours that aren't quarter hours, or a stump read as a circumference; each is decided there. **Task 1.5.4:** which quantity bills on a disposal that holds both a load call and a count. **Task 1.8.3:** how a correction takes an item line or a carried ticket off (nothing is deleted), and that a field event with lines can't change kind. ~~**Task 1.3.5:** a ticket's photographs (each event's own; where
  eight is counted), a copied certification's (C61 point 14), and how a tandem's two disposals send
  one receipt.~~ **Decided (ADR-326):** each field event's own, the database counts none; a copy holds none of its own; one receipt whose id both disposals carry. **Task 1.4.2:** a disposal
  whose scale receipt's number is already on the project (the receipt is refused; the monitor's record must not be lost). ~~**Task 1.3.6:** where an incident keeps the truck it concerns; an ROE's setup
  version and what a monitor may change on one after their shift.~~ **Decided (ADR-327):** in its parties and description, no certification named; no setup version, edited freely and audited (what a phone offers after the shift: Phase 3). ~~**Task 1.3.7:** the harness's
  cancelled field event and a re-entered number that doesn't match.~~ **Decided (ADR-332):** a mismatch saves nothing and uses no number; a cancelled field event stays on the phone, unsent, with no number. **Tasks 1.5.5 and 1.5.7:**
  the catalogue has no flag for a control ticket scanned outside its ranges, a certification of
  the wrong kind, a split on a project that doesn't allow one, or a count of 2 where *Count is
  always 1*: each is decided there, a new flag needing its ADR.
- ~~**C20.**~~ **Done (ADR-352): one `$write` per ticket; the worker never states a person, who asked is on the run.** Was: The worker's one transaction per group, one run per project, and flagged-and-skipped groups
  (REQ-015, KD-55) use one `$write` per group (ADR-273 (3)).
- **C65. What scale receipts and photographs left for later** (ADR-326). ✅ **Task 1.3.6's part done (ADR-327).** ~~**Task 1.3.6** (ROEs and
  forms):~~ `Photo` gains `roeId`, `surveyId`, `incidentId` and `dropOffLogId`, each held to the
  photograph's own project; `photo_owner_check` is dropped and written again with them, and
  `guard_table('photo', 'EVIDENCE', 'RECORDS')` and `guard_viewer('photo', 'PROJECT', hidden =>
  ARRAY['object_key', 'depth_object_key'])` are rerun; the exact lists follow (`correctable` in
  `grants.test.ts`, the check in `catalog.test.ts`, AC-04-76's column list). **Task 1.4.2**
  (intake): `quarantinedRecordId` the same way; intake writes a scale receipt before the
  disposals that point at it, takes a tandem's second disposal with the receipt already there (the
  same id); ~~and decides what it does with a disposal whose receipt's number is already on the
  project under another id (C63 point 14)~~ (falls away, ADR-331: a number is never unique, so
  both receipts are kept); it writes a photograph's record with its fingerprints
  and key. **Tasks 1.5.4, 1.5.5 and 1.5.7** (quantities and flags): a tandem's shares; a weight
  needed but missing; a net that isn't its gross less its tare, a net of nought or below; a
  receipt whose site isn't the disposal's, or isn't a Final Disposal site; a receipt on two
  trips; a certification's missing view (`CERTIFICATION_PHOTO_MISSING`); fewer photographs than
  a pay item requires. **Task 1.7.3** (moved from 1.7.1, ADR-358): a contractor user's sight of its own tickets' scale
  receipts and photographs (C18). **Task 1.8.3:** a correction that moves a photograph to another
  owner; nothing corrects a fingerprint or a key. ~~**Phase 2:**~~ ✅ *(ADR-481…483; swept by ADR-522)* who makes `objectKey`, the upload
  that sets `uploadedAt`, and the check of the uploaded file against `uploadedSha256`. **Phase
  4:** a copied certification shows its original's photographs (through `copiedFromId`) to a
  viewer given only the copy's project; the review of photographs inside a ticket.
- **C66. What ROEs and forms left for later** (ADR-327). ~~**Task 1.3.7** (the harness's phones): a
  phone makes an ROE with the next number of its ROE block and sends a collection's `roeNumber`.~~ **Done on the phone (ADR-332); writing the ROE is intake's (C68).**
  **Task 1.4.2** (intake): it looks the ROE up by number on the field event's and the survey's
  project and writes `roeId` (and again when a later ROE arrives with that number); it runs
  `formAnswersSchema` on a form's answers against the version answered, and decides what it does
  with answers that don't fit (the monitor's record must not be lost); an ROE whose number is
  already on the project. **Task 1.5.7** (flags): `ROE_MISSING`, `ROE_NOT_ON_PROJECT`, an unsigned
  ROE, `ROE_OUT_OF_SCOPE` from the scope lines, `NO_PRE_WORK_SURVEY`; whether an ROE with a signed
  date but not marked signed, or a scope line's payable type that no unit rate pay item of the
  project has, is flagged. **Task 1.6.4** (the setup check) or the ROE's setup service: offering
  only the project's unit rate payable types as scope. **Task 1.7.3** (moved from 1.7.1, ADR-358): a contractor user's sight
  (none today). **Task 1.8.2:** the QC mark on an ROE and on each form (REQ-107's last part).
  **Task 1.8.3:** a correction to a form; taking a scope line off. ~~**Phase 2:**~~ *(ADR-522: a form taken in ✅ ADR-467; an ROE corrected ✅ ADR-431; an ROE made in the back office → **2.8.7**)* the endpoints
  that make and edit an ROE and take a form in. **Phase 3:** what a phone lets a monitor change
  on an ROE after their shift; "GPS required" asked by the phone; a photo field's capture.
  **Phase 4:** the exports' columns for the firm's fields; whether an incident should name the
  certification it concerns as a real column (today its parties and description).
- **C67. What the user's replies of 2026-10-04 changed** (ADR-328). Each is built as its own
  task, before the task that would otherwise build on the old shape: ✅ **(a) done 2026-10-04
  (ADR-330)**, certifications are never copied: take out `Certifications.copy`, `CertificationChanges`' copy rule, the
  allocator's use in it, `copiedFromId` (a new migration, never an edit), the story
  `certification`'s copy, AC-03's copy scenarios, `adms-certifications`' copy lines,
  DATA-MODEL and C65's copied-photographs point; ✅ **(b) done 2026-10-04 (ADR-331)**, a scale receipt's number isn't unique:
  drop `@@unique([projectId, receiptNumber])` by a new migration, its test, AC-04's scenario,
  DATA-MODEL §8, `adms-scale-receipts` ("unique per project", "the same receipt number on a
  later trip"); C63 point 14 falls away; ✅ **(c) done 2026-10-04 (ADR-334)**, an incident's optional contractor, cert number
  and ROE number, and the project's setting of which are offered (on its incident form:
  `Form.incidentOffers`; **left for 1.4.2:** intake looks up the certification and the ROE an
  incident's numbers find; **Phase 3:** the phone's incident screen shows only what is offered;
  **Phase 4:** the setting on the form's setup screen, and the back office adding any of the
  three to an incident); ✅ **(d) done 2026-10-04 (ADR-336)**, a viewer's sight of
  private citizens' names, set per viewer (`User.seesPrivateCitizens`; an ROE's owner and a
  drop-off log's resident and address are shown only by `viewer_roe_citizen` and
  `viewer_drop_off_log_citizen`; ~~**left for Phase 2:**~~ *(ADR-522: the setting stated ✅ ADR-434; the ROE's citizen view read ✅ ADR-435; the drop-off log's → **2.8.8**)* the API states the setting from
  `ViewerSettings.starting()` when a viewer is added, and the portal reads the citizen views;
  **Phase 4:** the box on the viewer's screen, and the exports' columns for a marked viewer;
  **1.7.3** (moved from 1.7.1, ADR-358): a contractor user's sight of either table; **for the user to say:** whether free
  text, the firm's own form fields, a signed ROE form's photograph and an ROE's address count as
  naming a private citizen: none is hidden today). (a) and (b) came before
  1.3.7's story and 1.4.2's intake; (c) and (d) before 1.4.2 takes forms in.
  **From ADR-329:** ✅ **(e) done 2026-10-04 (ADR-337)**, a photograph's archive mark and label
  (`Photo.archivedAt`, `Photo.label`; two migrations; corrected by the API, audited; AC-04-102,
  103; **left for 1.4.2:** intake writes neither from a phone; **decided by the user (ADR-345): a removed photograph counts for nothing a record must have** (a certification's views built, ADR-344; a pay item's photographs: 1.5.7); **1.8.3:** the corrections' service removes, puts back and labels; ~~**Phase 2:**~~ ✅ *(ADR-431: *correct*; swept by ADR-522)*
  which permission may; **Phase 4:** the screen, and what a viewer's screen and the exports do
  with a removed photograph); **(f) task 1.4.2's intake** keeps a
  field event whose GPS fix is impossible, without the fix, and flags it; **(g) new flags to
  word with the user** (1.5.5, 1.5.7): two quantities on one disposal, GPS unreadable, not a
  valid ticket number, the wrong kind of badge, a detail the phone should have required.
- **C68. What the harness's phones left for later** (ADR-332). **Task 1.4.2** (intake): the stand-in (`packages/scenarios/src/intake.ts`) gives way to the real intake, which also writes an ROE a phone made (the stand-in throws on one), looks up the certification and the ROE a number finds, runs a form's answers against its definition (the harness's phone sends `{}`: its lists hold no form definition yet), and takes each series' last used number (`SimulatedDevice.lastUsedNumber`) for the top-up. **Task 1.5.7** (the worker's own answer): `SizeBands.payItemFor` again, from the project's pay items of the payable type, kept beside the phone's (AC-04-59's second half); whether a payable type with several pay items, some with no band, needs a flag of its own (today: no band holds it, no pay item). **Task 1.9.1** (the golden mission's story): **201004 follows 201001 on one phone**; the harness passes Sam's phone over 201002 and 201003 (`passOver`, the harness's own), since the mission says they are the flag catalogue's examples: the golden story either keeps that or tells what took them; the mission's GPS fixes (only 101001 has one today), its certifications looked up, its photographs (Phase 2 for the file). ~~**Phase 2:**~~ ✅ *(ADR-449…453, 466; swept by ADR-522)* the lists a phone takes become the sync contract's manifest (`phone-lists.ts` is its stand-in). **Phase 3:** the phone's screens, its own duplicate check, what a cancelled field event shows, whether a typed number is entered twice, and whether hand re-entry stays (ADR-209).
- **C64. What numbering left for later** (ADR-323). **Task 1.3.6** (ROEs): a phone-made ROE's number is the next of its phone's ROE block, written by `NumberSeriesRules('ROE').written` (`R-0007`); a typed paper number kept as typed. *(ADR-327: `roe.roe_number` keeps either as written; the phone that takes the next of its block is the harness's, 1.3.7, and intake's, 1.4.2.)* ~~**Task 1.3.7** (the harness's phones): a phone gives its field event the next number of its block (`PhoneNumbers.next`), and a certifying phone its cert number.~~ **Done (ADR-332: `SimulatedDevice.complete` with `made`, `takeCertNumber`).** **Task 1.4.2 / Phase 2** (sync): the sync carries each series' last used number and calls `NumberAllocator.topUp`; a top-up thrown because the series moved on is asked again; a lost phone's blocks are retired after its last sync and wipe (ADR-134), a reset phone's reclaimed. **Task 1.5.5:** whether a control ticket scanned outside the entered ranges is flagged after sync (no such flag in the catalogue). **Phase 4:** setup's screen suggests a cert-number seed "that doesn't look made up" (Q-96); today the firm states it, and a project without one types its cert numbers. **Not guarded, on purpose:** a series' next number going back (the exclusion constraint then refuses the block).

**For Phase 2 (API, worker, apps) and the demo deploy**
*Mapped to Phase 2's tasks by ADR-377:* ~~C21 → 2.2.1, 2.2.3~~ ✅ (ADR-397, 409) · C93 → 2.5.1, 2.6.5, every task that adds an endpoint · C92 → ~~2.2.6~~, 2.4.1, 2.4.4, 2.4.5, 2.5.2, every task that adds an endpoint · C91 → ~~2.2.5~~, ~~2.2.6~~, 2.5.1, every task that adds an endpoint · C90 → ~~2.2.4~~, ~~2.2.5~~, ~~2.2.6~~, 2.4.4, 2.5.1, every task that adds an endpoint · C88 → 2.2.2, ~~2.2.3~~, 2.2.4, ~~2.2.6~~, 2.5.1, 2.5.4 · C22 → 2.4.5 · ~~C23 → 2.1.3, 2.2.3~~ ✅ (ADR-388, 408) · C24 → 2.1.2, 2.6.4 · C31 → 2.7.1 · ~~C34 → 2.1.4~~ ✅ (ADR-394) · C87 → 2.3.2, 2.4.4, 2.6.2, 2.6.5 · ~~C35 → 2.2.2~~ ✅ (ADR-403) · C89 → ~~2.2.3~~, ~~2.2.5~~, ~~2.2.6~~, 2.4.3, 2.5.2, 2.5.3 · ~~C38 → 2.7.2~~ ✅ (ADR-507; its rest → 5a) · ~~C40 (a) → 2.1.1~~ ✅ (ADR-379) · C84 → the tasks it names · C94 → ~~2.3.2, 2.3.3~~, 2.6.2, 2.6.4 · C96 → ~~2.4.1~~, 2.4.2, 2.4.4, 2.6.2, 2.7.1, 2.7.2 · C97 → 2.4.2, 2.6.4, 2.6.x, 2.7.1 · C86 → every task that adds an endpoint, 2.1.4, 2.2.3, ~~2.2.6~~, 2.4.4, 2.6.x · C85 → every task that changes `apps/api`, ~~2.1.3~~, 2.1.4, 2.2.1, 2.2.3, ~~2.2.6~~, 2.3.2, 2.5.1, 2.7.2 · C45 → 2.5.1 · C46 → 2.5.4 · C47 → 2.4.3, 2.6.5 · C53 → 2.1.4, 2.6.2 · ~~C59, C67 (d), C76, C108 → 2.4.5~~ ✅ (ADR-434, 435) · C109 → 2.7.1, every task that adds a viewer's read, Phase 4 · C60 → 2.4.2 · C62 → 2.3.3, 2.4.4, 2.6.2 · ~~C83 → 2.3.3, 2.4.1~~ ✅ (ADR-420, 423) · C64 → 2.6.2, 2.6.5 · C65, C82 → 2.6.4 · C66 → 2.4.4 · C70 → 2.6.2 · C68 → 2.5.3 · C69 → 2.6.2 · C71, C75 → 2.3.2, 2.3.3 · C74 → ~~2.4.1~~ ✅ (ADR-423; the lookup with a phone's lists: C97) (and its owed line, the first step of 2.1.2: it was not yet due when 2.1.1 ran) · C78…C81 → 2.3.3, 2.4.4. **Not Phase 2's, the demo deploy's (5a):** C25, C33, C38's rest (ADR-507), C39, C40 (b) and (c), C48, C49. *Swept 2026-10-14 (task 2.8.1, ADR-522): every line this map names is struck as built or re-filed into 2.8.2…2.8.8; the standing rules ("every task that adds an endpoint", "every later schema task") hold for 2.8's tasks as for any.*
- **C21.** ~~Sign-in refuses role `SYSTEM` (**2.2.3**)~~ ✅ ADR-409 (AC-10-17); ~~the system actor never gets a password (ADR-273 (4)). A
  password hash or an authenticator secret on `user` is named on its audit trigger, so it's kept out
  of the audit log as the master passcode's hash is (ADR-281 (7))~~ ✅ ADR-397: they are `user_credential`'s, named on its trigger, and the system actor can have no row.
- **C22. Nothing states the viewer yet.** `$write` states the actor; the read-only portal must state
  **`adms.viewer_id`, the viewer's own id** (since ADR-315; no longer their projects and contractor,
  which the database now reads from their record) on every `adms_readonly` request, from one
  shared place like `$write` (ADR-270 (7)). Unstated, a viewer sees nothing.
- **C69. What intake left for later** (ADR-338). **Task 1.5.2, 1.5.3** (the worker): it never reads `quarantined_record`; how reconciliation is queued (05-sync.md point 13); a certification that arrives after the field events that scanned its number (C62). **Task 1.5.5, 1.5.7** (the flags, their wording with the user, C67 (g)): `FieldEvent.unreadableGps` raises "GPS unreadable"; a ticket number that isn't digits pairs with nothing; whether a form's dropped fix (kept only in its insert's audit reason) needs anything more; a form whose answers don't fit its definition (saved as sent today, told only to the sender); `DEVICE_CLOCK_OFF` without `Sync` (point 15). **Task 1.8.x** (review): resolving a quarantined record (it becomes a field event, or an ROE, that keeps its phone-made id; its photographs move; `resolvedById`, `resolvedAt`, `resolution` written, the resolution's words decided then); a quarantined disposal's scale receipt, saved and pointed at by nothing until then; a quarantined ROE (renumber it, or void it). **Phase 2** (the API): the endpoint, the phone's proof of itself, `Sync` and `SyncedRecord`, the edit log; **what a record the database's constraints refuse is answered** (today intake throws and it stays on the phone: an unknown project, phone, monitor or assignment, a pick that isn't the project's, a detail on the wrong kind, a photograph before its owner); the photograph's upload, its real place in storage and uploaded fingerprint (the phone states them today); a survey's, an ROE's and a certification's photographs; an unplanned assignment's own arrival; the cert numbers' top-up at a sync told as a story (AC-05-47's other half); a lost phone that held blocks, retired after its last sync (AC-05-56's other half; `numbering` retires one without the sync); the burst under load. **Phase 3:** the phone shows a record "not saved"; a reset phone's blocks reclaimed (`NumberAllocator.reclaim`); the phone's form definitions (the harness's phone holds none: the story sends answers by hand). **For the user, when they read ADR-338:** the quarantine of an ROE; first received holds the number; the wording; a viewer's sight of a quarantined record.
- **C31. The sync stand-in goes** (ADR-275 (3)): ~~first part~~ **done (ADR-338: the stories sync through `apps/api`'s `Intake`; the endpoint in front of it is Phase 2's).** `packages/scenarios/src/intake.ts` writes straight through `$write`; once the API's sync endpoint exists, stories sync through it (duplicates, quarantine, the idempotency ledger). The UUIDv7 maker (`packages/scenarios/src/ids.ts`) moves to `packages/domain` when the field app needs it, so phone and harness share one.
- **C45. Who the API states for an act under the master passcode** (ADR-281 (11)): enrolment, creating
  a monitor, and an unplanned assignment are done by whoever holds the passcode, which isn't a user;
  `$write` needs a `User`. Decide with Phase 2's device endpoints (the stories state an admin for
  enrolment and the monitor for the unplanned assignment), and log every use as a security event
  (ARCHITECTURE §7.5).
- **C46. Times a phone makes besides a field event's** (ADR-281 (11); REQ-019): an unplanned
  assignment, a monitor switch, a site move, a clock entry carry the phone's instant, its offset and
  the server's received time, in the sync contract; the manifest's numbering behind
  `FieldEvent.setupVersion` is the sync's too.
- **C47. A device key's revocation** (ARCHITECTURE §7.4; ADR-281 (11)): once a lost or retired phone
  has synced, been confirmed and wiped, its key is revoked and the server refuses it; `Device` has no
  column for that yet (**built, ADR-315: `keyRevokedAt`, only on a phone out of service; the refusal is still Phase 2's**). The same goes for changing the master passcode from the back office (a new
  `master_passcode` version) and each phone's `masterPasscodeVersion` moving at its next sync.
- **C23.** `ADMS_TOKEN_SIGNING_SECRET`'s use is Phase 2's (ADR-266); OpenAPI from the Zod schemas comes
  with the API (ADR-261); the server apps add `@types/node` when they get real code (ADR-256).
- **C24.** Media: the object store's CORS allow-list widens when the web apps arrive; the API's S3
  identity never gets bucket-delete (ADR-263). The API and web apps get their own `*.adms.localhost`
  hostnames.
- **C48. The demo deploy's map servers** (ADR-282 (11), 287; REQ-517): Valhalla and Nominatim in the
  demo, each with the project region's extract, **private to the API and the worker** (neither has
  any sign-in of its own), TLS between them; Nominatim's own Postgres stays closed as the local
  wrapper leaves it. A machine sized for the region: the address import of a whole state needs far
  more disk and memory than the local Delaware one (about 350 MB).
- **C49. The rest of Q-166, map data for each region** (ADR-282 (11)): several regions in one
  installation (a firm with projects in Florida and Texas); how a firm names its region at install
  (today two settings, `ADMS_MAP_EXTRACT_URL` and `ADMS_MAP_EXTRACT_SHA256`); refreshing to a newer
  dated extract without changing a billed mileage; the back office's base map file (ARCHITECTURE §3,
  Phase 4). The local stack's Docker disk must fit the images (2.5 GB) and the import.
- **C33. CIS items for the cloud's Postgres** (ADR-276 (6)): TLS to the database required; connection and disconnection logging with a log line naming user and database; pgAudit; the server's file permissions and patch level (a managed Postgres's own). Tested in the demo deploy's own checks.
- ~~**C34. A statement timeout per login**~~ ✅ **done (ADR-394, task 2.1.4).** (ADR-276 (7), was C10): the installer sets `ALTER ROLE … SET statement_timeout` for `adms_api` and `adms_worker` from a policy value in `.env` (never a literal), when the services have their settings; `installer:check` checks it; `configuration.test.ts` asserts it.
- **C35. ✅ done by task 2.2.2 (ADR-403); the master passcode changed through the API: 2.4.3 (C89).** ~~Breached-password screening~~ (ADR-276 (8), was C11; NIST SP 800-63B, OWASP ASVS 5 V6): the master passcode and every password a person sets, at Phase 2's sign-in at the latest.
- **C25.** The installer extends to the demo deploy (Railway), which runs `migrate deploy` and the seed,
  never `migrate dev` or the shadow database (ADR-266, 268).
- **C38. Operations monitoring** (ADR-279; the plan is silent). *Have:* structured logs with a
  request ID (ARCHITECTURE §6), security audit events for sign-ins and device setup (§6), the local
  health page (ADR-264). *Missing:* how a running installation tells its firm something is wrong:
  health checks for the API, the worker and the job queue; error reporting; alerts (e.g. the worker
  stalled, jobs backing up, sync failing, a backup failing, storage or the database filling); what's
  measured. *Raise:* with Phase 2's API and worker; proven in the demo deploy. It must work with a
  firm's own tools and need no outside service (the firm installs and runs it, ADR-197). **✅ Phase 2's part (ADR-507):** the API's
  liveness (`/health`) and readiness (`/readiness`, 503 `UNAVAILABLE` when its database doesn't
  answer); the worker's health answer, 503 with `NOT_YET_LOOKED`, `QUEUE_NOT_READ` or `STALLED`, and
  the queue's figures (`jobsWaiting`, `jobsSetAside`, `oldestJobWaitingSeconds`); error reporting as
  the structured logs already are. **Re-filed to the demo deploy (5a):** alerts (who is told, by
  what, on which figure: a monitor polling `/readiness`, Docker's health status, a log filter on
  `INTERNAL_ERROR` and `JOB_SET_ASIDE`); reaching the worker's answer from outside its host (it is
  on the container's loopback); sync failures as a rate; a backup failing; storage or the database
  filling; figures kept over time. Still no outside service.
- **C39. Availability** (ADR-279; the plan is silent). *Have:* phones work offline and sync later, so
  field capture survives a server outage (ADR-030); server backups with point-in-time recovery and
  rehearsed restores, the object store versioned or replicated (ARCHITECTURE §4). *Missing:* what
  happens to the back office, sync and the worker when the database or the API goes down: a standby
  or failover, restarts, and the targets (how long down, how much lost), which are policy, never
  literals. *Raise:* with the demo deploy (C25) and the installer's cloud steps.
- **C40. Independent security testing** (ADR-279; the plan is silent). *Have:* the checklists each
  phase tests against (ARCHITECTURE §16), `pnpm security` (ADR-276). *Missing:* (a) a written threat
  model over the layers of ARCHITECTURE §2, before Phase 2's API is built; (b) a penetration test by
  someone outside the build, once the API, sync and web apps run in the demo deploy and before a
  firm's first live mission; (c) how a vulnerability is reported and a fix reaches installations (a
  root security policy file, the user's to approve like the README; ties to upgrades, Q-167), before
  the repository is public.

**For Phases 3–4 (the field app, the back office and the read-only portal)**
*For Phase 3, mapped to its REQs (redone by task 2.8.1, ADR-522, from every unstruck "Phase 3" line; each is what the field app owes the server's side):* C24, C86 → REQ-006 · C110, C112, C114, C115, C117, C120, C122, C125, C133, C143, C151 → REQ-311 · C113 → REQ-311a · C123, C124, C126 → REQ-312 · C141 → REQ-313 · C69, C141 → REQ-124c · C74, C97, C100 → REQ-124f · C127, C128, C130, C133, C139, C152, C153, C166 → REQ-308 · C69, C128, C132, C137 → REQ-308c · C68 → REQ-308a, REQ-319 · C68, C83, C135 → REQ-303, 304 (C135: every flow, REQ-303…306) · C66, C67, C69, C118 → REQ-307 · C137, C138 → REQ-316 · C121 → REQ-318 · C96, C127 → REQ-317 · C118, C129 → REQ-322 · C156 → REQ-323 · C41 → REQ-324. *Back to Phase 2 (ADR-519):* C157 → REQ-215, C162 (a) → REQ-211, C162 (c) → REQ-210. *Was (ADR-518):* ~~C24, C86 → REQ-006 · C110, C112, C114, C115, C117, C120, C125, C151 → REQ-311 · C113 → REQ-311a · C123, C124, C126, C135 → REQ-312 · C127, C128, C130, C132, C133, C139, C152, C153 → REQ-308 · C128, C132, C137 → REQ-308c · C141 → REQ-313, REQ-124c · C137, C138 → REQ-316 · C121 → REQ-318 · C96, C127 → REQ-317 · C97, C100 → REQ-124f · C118, C129 → REQ-322 · C156 → REQ-323 · C41 → REQ-324 · C66, C67 → REQ-307 · C68, C69, C83 → REQ-303, 304, 308a; for Phase 4: C157 → REQ-408~~.
- **C41. Accessibility** (ADR-279; the plan is silent). *Have:* every screen translatable from day
  one (ADR-172). *Missing:* a named standard and level for the web apps and the field app, how it's
  checked (e.g. automated checks beside the browser end-to-end tests, ARCHITECTURE §15), and whether a
  conformance statement ships; public clients commonly ask for one in procurement. *Raise:* before the
  first screen is designed, so it's built in, not retrofitted; the standard is the user's to pick.

**Housekeeping, any time**
- **C26.** pnpm 12 when the global pnpm is 11+; Node 26 once it's LTS (ADR-255).
- **C27.** ~~KD-59: the historical root `docker-compose.yml`~~ **retired by the user, with its volume, 2026-10-01 (ADR-291; `pnpm security` 7 passed, 0 failed).** Left, harmless: the `.gitignore` section for `database/`, the user's to drop. *History:* the file and the `.gitignore` sections for `database/`
  and the placeholder folders were the user's to retire (see C7). **2026-09-30 (ADR-277):** its
  container is stopped (the user ran `compose down`); left: the file, its data volume
  `debrismonitor_kiro_postgres_data` (created 2026-09-23, the historical database's data), and an
  unattached anonymous volume (`428a2944…`, an empty object-store folder from a throw-away container
  an agent ran on 2026-09-30, 428 KB); removing volumes needs the user's go-ahead. **2026-10-01 (ADR-281):** that anonymous volume is gone and the stack was down at the start of the session (`docker volume ls`: only the local stack's four volumes and `debrismonitor_kiro_postgres_data`).
- **C32. The accepted audit advisories** (ADR-276 (3)): `GHSA-ggr8-5vv4-36mx` (`deepmerge-ts` 7.1.5), `GHSA-3f6p-5ww8-9rcr` and `GHSA-rgwj-5xj2-c3m3` (`mysql2` 3.15.3), all in the Prisma CLI 7.10.0. At every Prisma upgrade: run `pnpm audit`, drop each id the upgrade fixes from `pnpm-workspace.yaml`, and say so in that upgrade's ADR. Also secretlint's seven dev-tool licences, allowed by exact version (ADR-276 (10)): a secretlint upgrade makes them undecided again.
- **C28. `pnpm installer:teardown` doesn't know story databases** (ADR-275): one left behind (a killed
  run, or `--keep`) is owned by `adms_owner`, so teardown's `DROP ROLE adms_owner` fails. Teardown
  should drop `adms_story_…` databases first (or stop and name `pnpm scenarios clean`).

---

- **C70. What the reconciliation scenarios left for the tasks that build them** (ADR-339;
  `spec/acceptance/06-reconciliation.md`, "Left to the task that builds it", eighteen points).
  ~~**Task 1.5.2:** how reconciliation is queued (with 1.5.9); who points a field event at a
  certification made later.~~ **1.5.2's half is decided (ADR-340): it added no queue record, and the worker has no right to write `certification_id`. Task 1.5.9:** how the worker finds the tickets to work (a record of its own, or what was received or changed since its last run). **Task 1.5.5:** who points a field event at a certification made later (the API, which writes that column), and what queues its tickets. **Left by 1.5.2 (ADR-340): task 1.5.3**, the kind of field event a completed record names is the grouping's to keep (the database holds the project and the uniqueness); **tasks 1.5.4, 1.5.5**, which figures a completed record carries when a check fails (nothing ties them to `quantitySource`; `pileLoadCall` has no range); **task 1.7.3** (moved from 1.7.1, ADR-358), a contractor user's sight of completed records and flags (C18); **task 1.8.x**, a flag's acceptance as a mark, and whether a viewer is ever shown a run. **Left by 1.5.3 (ADR-341): task 1.5.5**, `SPLIT_SUFFIX_GAP` from `Ticket.splitShape` (its words for a bare collection, point 6); the flag, the status and the billing of a field event whose number isn't digits (`Tickets.notTicketNumbers`: in no ticket today, a unit rate event included; with the user, C67 (g)); a unit rate ticket's time and the day in the project's time zone; **task 1.5.9**, reading a ticket's field events and its raised flags from the database, the run's list from `Tickets.pending`, a `Ticket` that throws on a second field event of one kind (`NOT_PROCESSED`); **tasks 1.6.3, 1.8.x**, how a voided ticket is kept from the worker's three statuses. ~~**Task 1.5.4:** who takes the remainder of rounded shares; which
  quantity bills beside a count.~~ **Decided (ADR-343): the largest share, the last of equals; the paying pay item says which quantity bills. Left by 1.5.4: task 1.5.5**, a flag's words for a split load whose shares can't be worked out (an estimate missing, every estimate nought: `LoadQuantitiesWorked.sharesNotWorkedOut`; none in the catalogue), and a net read from one figure that disagrees with another on the receipt (`ScaleWeight.net` takes tons as written first); **task 1.5.7**, `PILE_CALL_NOT_HIGHER` from `pileCallNotHigher`, a pile with no call (`pileCallMissing`), `SHARED_SCALE_WEIGHT` and `SCALE_WEIGHT_UNUSABLE` from `ScaleWeight`, a shared weight where a container has no capacity (no share is given to either); **task 1.5.9**, finding the disposals that share one receipt and handing each its share, reading a carried ticket's stump diameter and item count, writing the figures (a pile row's `pile_load_call` is nought when no pile is shared out); **task 1.6.3**, `quantityFor` for each line, a unit rate ticket's count, pounds and crew time, `QUANTITY_MISSING_FOR_PAY_ITEM` when it answers none; **task 1.6.4**, the site's lookup of what a tower asks for (not read by `quantitySource`, which says what the tower took). **Task 1.5.5: decided (ADR-344, agent defaults), all but section O's words, which were put to the user. Left by 1.5.5:** ~~with the user (C67 (g)), the codes and words of six flags~~ **answered and built (ADR-345), with three backup catches. Left by ADR-345: task 1.5.7**, `PHOTOS_MISSING` counts only photographs not removed (the user's rule), and a scale receipt's net that isn't its gross less its tare and two quantities on one disposal are still to word with the user (AC-06-158, 162); **task 1.5.9**, the worker hands `TicketChecks` the project's *Allow split loads*, its live control ranges, each certification's kind, and a field event's load call, scale receipt, kind of work, unreadable fix and assignment's project, and raises `notATicketNumber` for each of `Tickets.notTicketNumbers`; **task 1.8.3**, removing a photograph or putting it back, and taking an item line or a carried ticket off, queues its ticket's (or its certification's) reprocess, a locked ticket unlocked first; **for the user**, whether a pay item's *photos required* should take a number; **task 1.5.6, 1.5.7**, every new check raises through `Flags.raise`, saying told and facts apart, and takes its dates from `ProjectClock`; **task 1.5.9**, reading what `TicketChecks` is handed (the project's certifications with what replaced each, a field event's phone, reason and person by name, the collections of the project's other loads that aren't void, how many tickets a collection lists and the word for what the tower counted), writing a `FlagRaised` as a `Flag` (a ticket's subject as its workflow and number), `Flags.compared` against the flags standing, checking the project's certifications' views in a run, and queueing the tickets that scanned a certification made later; **Phase 2**, the sync's record with the clock difference, and the threshold's policy value (`DEVICE_CLOCK_OFF`; C53). **What 1.5.5 was left:** the work time; a tag's last day; work on the day
  a certification was replaced; the checks on a lone field event; `OVERLAPPING_LOADS` while a
  disposal hasn't synced and after the phantom is voided (both tickets flagged is settled, ADR-342; the agent recommends the flag clears once the phantom is voided); a bare collection's words; the
  flags of ADR-329 (section O) and the gaps with no flag, worded with the user (C67 (g));
  `DEVICE_CLOCK_OFF` in Phase 1; the worker's thresholds as policy values (C53); when a flag on
  a certification is raised. ~~**Task 1.5.6:** a project with no map; a haul-out collection's zone; a site with no GPS; a disposal on the close date; when a site's flag is raised.~~ **Decided (ADR-346, agent defaults). Left by 1.5.6: task 1.5.8**, the flagged straight-line mileage from `Distance`; **task 1.5.9**, handing `PlaceChecks` the newest map version (zones in the version's order), each site with its current shape version and the project's circle, writing each `ZoneAttached`, checking the sites' permits in a run, and a new map version, circle or site shape reprocessing un-invoiced tickets; **task 1.6.3**, `TIPPING_FEE_RULE_MISSING` and no lines after `HAUL_OUT_DUMPED_AT_TDSR`; **for the user**, the four points in ADR-346 (5), (7), (10) and (1). **What 1.5.6 was left:** a project with no map; a haul-out collection's zone;
  a site with no GPS; a disposal on the close date; when a site's flag is raised. ~~**Task 1.5.7:**
  whether a ticket's ROE flag puts it in review; a removed photograph against the required ones;
  `301005`'s second flag; the crew-hours limit as a policy value and the tickets it is raised on.~~ **Decided (ADR-347, agent defaults). Left by 1.5.7:** ~~with the user, the code and words of two flags (AC-06-158, 162)~~ **approved and built (ADR-348); task 1.5.9**, the worker hands `QuantityChecks` the project's limits, each receipt with every disposal that points at it (their capacities and debris types) and the carried tickets as found, `UnitRateChecks` the unit rate pay items, the stump switch, the policy value `CREW_DAY_HOURS` and the project's other crew-time field events, `RoeChecks` the program type's *requires ROE*, each ROE found with its live scope, and the project's surveys; writes `workedOutPayItemId`; counts a ticket's ROE flags in its status; **task 1.6.3**, `QUANTITY_MISSING_FOR_PAY_ITEM`, `FILL_WITHOUT_EXPOSED_ROOT_BALL` (the second stump switch), *Count is always 1* making the count 1; **for the user**, the points in ADR-347 marked raised (24 in as FEMA's fixed test; the crew's day; which ticket carries the crew-hours flag; both loads flagged for one carried ticket; a blank receipt not "unusable").
  **Left by 1.5.8 (ADR-349): task 1.5.9**, the worker's map settings read from its env file and written by the installer (both servers' addresses, the certificate authority, the map extract's SHA-256); handing `Mileages.between` each collection's end GPS and its site's GPS (a load's disposal site, a haul-out's), with the mileage the row already holds; **how the run knows an end moved since a mileage was written, with no new column** (the user, ADR-350 (3): the correction that queued the ticket, or the audit records of the collection's end GPS and the site's GPS), handing `Mileages.between` the row's mileage as `standing` only while neither has; a collection with no fix (no mileage, the row's columns empty); writing the mileage and `Mileage.noRoadRoute`'s flag; a map server that doesn't answer as an errored ticket; the stories that reconcile on the stand-in points of `spec/CONVENTIONS.md` §6; ~~**for the user**, private roads under `shortest`, and whether every fixture and P1's map move to the pinned extract~~ **answered (ADR-350): built, and task 1.5.8a; task 1.7.1** ✅ (ADR-358, AC-07-89), a transaction names its property's or pile's collection row, so its mileage is read beside it; **Phase 4**, the Transactions export's `mileage, mileage_source, map_data_date`.
  ~~**Task 1.5.9:** an errored ticket's status; the person stated for a reprocess (C20); how a
  pending ticket is listed.~~ **Decided and built (ADR-352), with every "task 1.5.9" point above but those in C71.** **For the user:** the file's approval (KD-71 (1) answered, ADR-342).
- **C71. What the worker's run left** (ADR-352). ~~**Phase 2 (the job queue and the worker's process):**~~ ✅ *(ADR-419; the certification made later, ADR-420; swept by ADR-522)* what starts a run and for which project; working only the tickets a job names instead of the whole project (the run reads every field event of the project each time); the worker's map settings in its env file, written by the installer (both servers' addresses, the certificate authority, the map extract's SHA-256: C70 left it to 1.5.9, and nothing reads them until the worker has a process), and the longest a run may hold its lock as a setting; the queueing of tickets that scanned a certification made later (AC-06-36). **Task 1.6.3:** the rules run inside the ticket's one piece of work, after the quantity; no lines after `HAUL_OUT_DUMPED_AT_TDSR`; what an errored ticket's `NOT_PROCESSED` ("not billed") does to lines it already has. **Tasks 1.6.3, 1.8.x:** a voided ticket (the run leaves void field events out today); a ticket locked as invoiced left as it is (AC-06-03). **Task 1.8.x:** a flag's acceptance read by the run (`TicketWork` takes none as accepted), and kept when its field event is renumbered (the run clears the flag under the old number and raises it anew, ADR-352 (9)); AC-06-139, 140. **Tasks 1.9.1, 1.9.2:** stories for what the run reads and no story tells yet: a load that carries tickets, a tandem's shared weight, P2's split load, control ranges, a site's own shape, a new map version, a replaced or revoked certification, surveys; AC-06-05 (any arrival order, the worker's half) and AC-06-36. **✅ Phase 2's part done in 2.3.2 (ADR-419):** jobs start a run, for their project, and it works only the tickets they name; the map settings are in the worker's env file, written by the installer; the longest a run holds its lock is the policy value `RECONCILIATION_RUN_LONGEST_MINUTES`. ~~Still 2.3.3's: queueing the tickets that scanned a certification made later.~~ ✅ ADR-420 (`Certifications` links and queues them, AC-06-36; swept by ADR-522).
- **C72. What the pricing scenarios left for the tasks that build them** (ADR-353; `spec/acceptance/07-pricing-ledger-audit.md`, "Left to the task that builds it", eighteen points). **Put to the user first if the task can't settle it from a record, because it could change money:** how an amount is rounded to the cent (point 1, task 1.6.3); a crew day's decimals and hours that fall in no step (2, 1.6.3); ~~what a criterion does when what it reads is empty (3, 1.6.2)~~ ✅ the user, 2026-10-05: it never passes (ADR-354); which lines stay under a flag that says "not billed" (4, 1.6.3). ~~**Task 1.6.2:** *Contractor* with a sub picked, text and case, a typed number against a figure of more decimals (11); *Zone* by name across map versions, an archived rule (12); *Unit count* and *Item* on other itemised tickets (13).~~ ✅ agent defaults, ADR-354. **Left by 1.6.2 for 1.6.3:** the worker reads the rules (as `RuleEntry`s), the contracts with their primes, each certification's prime, every zone of every map version by name, and a field event's `fieldTag` and `address`, and calls `TicketReadings` and `TicketRules.passing` inside the ticket's piece of work; a ticket whose prime isn't known is run on only by rules with no contract (which pricing flag it gets is point 5); a rule whose contract is archived or missing runs on nothing (1.6.4 lists it). **Task 1.6.3:** which pricing flags join a ticket whose rules don't run (5); a removed tipping fee line, a ticket whose only line was removed, a *Remove* of nothing (6); a $0 pay item and `NO_RATE_FOR_PRIME` (7); a TBN line and its ticket's status (8); `QUANTITY_MISSING_FOR_PAY_ITEM` on a fill line and on a load that carries nothing (9); the other slots when one # is added twice (10); *Quantity from* off white goods (13); white goods as `spec/RULES.md` §9's rules (14); a voided ticket and where a rule's void is kept (18). ~~**Task 1.6.4:** an archived pay item, contract or form under a rule (12; C58).~~ ✅ ADR-357 (2). ~~**Task 1.7.1:** the operating sub on a second-tier sub's truck and on mismatched cert numbers; a transaction held to its own project (15); the ten Phase 0 tests take their AC-07 IDs (AC-07-88, 90, 96, 97, 104…109).~~ ✅ ADR-358. ~~**Task 1.7.2:** whether an unchanged reprocess rewrites the lines, and a ticket that is pending again (16); finding the tickets a rate or rule change affects, and Show matches' count (17); its story's figure, $5,059.00 on 18 lines (AC-07-112).~~ ✅ ADR-359 (the figure corrected: 17 lines, $4,879.00, then 19 lines, $5,400.25). **For the user:** the file's approval.
- **C74. What ADR-356 and task 1.6.4 left** (ADR-356, 357). **✅ The override is in since 2026-10-06 (ADR-372, the user: the one version let past the seven-day rule by name).** ~~Still owed, the first session on or after 2026-10-07 14:08 UTC: delete the `minimumReleaseAgeExclude` entry in `pnpm-workspace.yaml` (the override stays), `pnpm install --frozen-lockfile` → the lockfile passes the policy.~~ ✅ done 2026-10-07 14:09 UTC (ADR-385 (0)): `✓ Lockfile passes supply-chain policies (382 entries)`. Was: **The first session on or after 2026-10-07 14:08 UTC, before its task:** the `source-map-js` fix: `overrides:` → `source-map-js: 1.2.2` in `pnpm-workspace.yaml` (a comment naming ADR-356), `pnpm install`, the clean-copy check (`adms-verify` §1.1), `pnpm licences`, `pnpm security` → `7 passed, 0 failed`; then `adms-verify`'s security row and `NEXT.md` say so. ~~**Task 1.7.2 (the worker prices):** read the rules with their archive marks (as `RuleBook.entries()` does: `formArchived`, `contract.archived`, an action's `payItem.archived`), so a rule naming something archived doesn't run; hand pricing every pay item, archived ones too.~~ ✅ ADR-359 (`packages/db`'s `RuleRows`, the one reading). ~~**Task 1.9.1 (the golden mission's story) or Phase 2:**~~ *(ADR-522: `SetupStanding` ✅ ADR-423; the harness's tower phone asking its site's lookup → **REQ-124f**, the phone's)* a service in `apps/api` that reads a project's setup into `SetupChecked` and `LookupSetup` (live primes, contracts, forms, debris types and sites; every pay item and rule) and answers the check and a site's lookup; the harness's tower phone asking from its site's lookup instead of being told. ~~**Phase 2/3:**~~ ✅ *(ADR-449: the lookup in the lists; swept by ADR-522)* the lookup with a phone's lists, by setup version. **Phase 4:** the check's screen and the lookup on the site's page. **For the user:** ADR-357 (2) (an archived pay item, contract or form stops its rule); whether the check should also list "two debris types that look alike" (ADR-229 named it; no approved page does) and a prime with a contract and no rule for a debris type.
- **C75. What task 1.7.2 left** (ADR-359). ~~**Task 1.8.2 (the lock in full):** the worker's `lockedAsInvoiced` counts any `InvoiceLock` row; once a lock can be lifted it asks only about live locks, like the two database guards (C16); an unlocked ticket is then worked by the next run with no more done.~~ ✅ ADR-363. ~~**Task 1.8.3 (corrections):** the story `p1-priced` writes a correction, a rate change and a lock as the API's login may; the services take them over.~~ ✅ ADR-364: a correction goes through `Corrections` in the story `p1-reviewed`; `p1-priced` keeps its direct write, which shows only what the worker does; a rate change is setup's, a lock 1.8.5's. ~~**Task 1.8.4 (voids; the user, ADR-360):** a void stays until a person unvoids it, whoever voided it: the run leaves every `VOID` field event out. The unvoid must lift a rule's void too (no `TicketVoid` row stands behind one: the worker set the status), put the ticket back in the run, and the rule voids it again if it still passes; a person's void needs its lines removed when it is made; whether a voided ticket's check flags are cleared or kept out of the review queue; AC-07-95's person's half and AC-07-45's unvoid.~~ ✅ ADR-365: `Voids.lift` lifts a person's void and puts a rule-voided ticket back in the run; the lines go in the run the void asks for; a void ticket's flags are cleared. **Tasks 1.9.1, 1.9.2:** AC-07-63's reprocess (a TBN pay item's rate agreed), a split load priced by the worker (P2's 102001), a load that carries tickets, a `NO_RATE_FOR_PRIME` and a `TIPPING_FEE_RULE_MISSING` cleared by setup, each as a story. ~~**Phase 2 (the user's rule, ADR-360):**~~ ✅ *(ADR-419, 420; swept by ADR-522)* the queue holds only what is active or was changed; a settled ticket (voided, or worked and unchanged) stays off it until it or its setup is edited. The job queue names the tickets a sync, a correction or a setup change touches, and the run works only those: today a run still works out every ticket that isn't void. **Phase 4:** *Show matches*' counts. ~~**For the user:** KD-73; ADR-359 (5), (2), (8), (9); the corrected AC-07-112.~~ ✅ answered 2026-10-06 (ADR-360).
- **C76. What task 1.7.3 left** (ADR-361). **Every later schema task:** a rerun of `guard_viewer`
  on `certification`, `project_contractor`, `field_event`, a completed table, `scale_receipt` or
  `photo` repeats its `own` (copy the line from the seventy-fourth migration; `catalog.test.ts`
  fails otherwise); a new table that is part of a ticket says whether a contractor user sees its
  own rows (`own`, and `projectOrOwn` in `test/support/viewers.ts`); a new money column on
  `transaction` joins `viewer_transaction_money`, never `viewer_transaction`. ~~**Task 1.8.2 (QC
  marks, the lock in full):** whether a contractor user sees its tickets' QC status and lock.~~ ✅ ADR-363: the lock and its batch, never the QC status.
  ~~**Phase 2:**~~ ✅ *(ADR-435; swept by ADR-522)* the portal's reads join `viewer_transaction` with `viewer_transaction_money` and
  the three name views. **Phase 4 (the read-only portal):** which more names a contractor's
  screen needs (a vehicle type, a field tag, a zone, a payable type, a kind of work are ids to
  it today); the exports' columns for a sub's login, with no rate or amount. **For the user, any
  time:** whether a contractor user sees its tickets' flags; whether a first-tier sub above a
  second-tier sub sees that ticket's lines.
- **C77. What the review and closeout scenarios left for the tasks that build them** (ADR-362; `spec/acceptance/08-review-and-corrections.md` and `09-invoice-deliver-closeout.md`, "Left to the task that builds it", fourteen and eight points). ~~**Task 1.8.2 (people's marks):** each mark's audit domain and what a client user, an auditor and a contractor user see of a QC status, an acceptance, a void's reason, a lock and a batch (08 point 13, 09 point 7; C76); a QC mark on a record that is dissolved or voided under it, and QC Void on a certification (08 point 12); a batch's own rules (09 point 3); whether an unlock asks for a note (09 point 4).~~ ✅ each an agent default of ADR-363. ~~**Task 1.8.3 (corrections and renumbering):** where a permission is checked in Phase 1, which is how KD-25 closes at the engine (08 point 1); which corrections ask for a reason (4); the service that creates a record in the back office, which no task names (9); resolving a quarantined record any way but a renumber, a quarantined ROE, and the resolution's words (10); a renumber of a split's collection and of a whole ticket (11); what starts the reprocess after a reviewer's action (14); AC-03-52 and AC-09-16.~~ ✅ each an agent default of ADR-364. ~~**Task 1.8.4 (void, unvoid, accept):** KD-74, whether *correct* carries *accept flags* (08 point 2; the user's); the mission's words against the firm's list of reasons (3; also 1.9.1); what a person's void does to a whole load's completed record, flags and lines (5; C75); a correction to a void ticket (6); an acceptance through a renumber and on a pending ticket (7); taking an acceptance back (8).~~ ✅ each settled by ADR-365 (point 2 by the user). **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** where a change to a locked ticket is refused (09 point 1); what else a lock holds still (2); locking a ticket that bills nothing (5); what closing a project does besides the mark (6); what starts the run after an unlock (8). **Each task:** name its tests and story steps by AC-08 and AC-09 ID, and fill the earlier files' waiting rows the two files list. **For the user:** the two files' approval; KD-74.
- **C78. What task 1.8.2 left** (ADR-363). ~~**Task 1.8.3 (corrections and renumbering):** the service that puts a photograph back or removes it (C67 (e)).~~ ✅ `Corrections.photograph` (ADR-364). ~~**Carried to 1.8.4 (C79):** a renumber leaves a person's void on the number it was written for (a void names a number, not a field event): say what a renumber of a voided ticket does. **Task 1.8.4 (void, unvoid, accept):** the services `void`, `unvoid` and `accept` in `apps/api`; **the worker reads `TicketVoid`** (a void in force: `liftedAt` empty) and sets `VOID`; the unvoid lifts a rule's void too, which has no row (C75); the API checks that a reason is one offered for its use (`Reason.uses` holds `VOID` or `ACCEPT_FLAG`; the database can't, the uses are a list) and that a void's number is a ticket's; an acceptance of a flag already cleared, or taken back (08 points 7, 8: `FlagAcceptance` has no column for either), and how the worker reads an acceptance when a flag's facts change (a new flag row has no acceptance, by the unique key on the old one's).~~ ✅ ADR-365 (9), and its services and worker. **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** the services that set a QC mark (an upsert of the one row), lock (only a QC Approved record, ADR-121: the service's check, nothing in the database holds it), put a lock in a batch and unlock; what a QC mark changed after its ticket is locked means; the story's halves of AC-08-57, 58 and AC-09-01, 09, 17. **Task 1.9.1:** the mission's lock and batch through those services; `lockedAt` is stamped by the database's default unless stated (C29). ~~**Phase 2:**~~ ✅ *(ADR-430; swept by ADR-522)* each permission (`QC`, `LOCK_INVOICED`, `UNLOCK_INVOICED`, `VOID`, `ACCEPT_FLAG`) checked where its service is called. **Phase 4:** the report a contractor pulls by a batch's name (it reads `viewer_invoice_batch` and `viewer_invoice_lock` today); the QC columns of the exports. **For the user, any time:** ADR-363's agent defaults (`SUMMARY.md` §4), first a batch's name used once on a project and what a contractor's login sees of the marks.
- **C79. What task 1.8.3 left** (ADR-364). ~~**Task 1.8.4 (void, unvoid, accept):** the services `void`, `unvoid` and `accept` go on `ReviewService` (`VOID`, `ACCEPT_FLAG`; `PickedReason.refusal` for the reason's use); **a field event of a voided ticket that is corrected or renumbered** (08 point 6; C78): today the service changes it and answers its ticket for a run that leaves `VOID` field events out, so say what happens to it; whether an acceptance follows a field event through a renumber (08 point 7).~~ ✅ ADR-365. **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** whether a correction to a ticket locked as invoiced is refused by the service (09 point 1): today it is saved and the run leaves the ticket as it is, named in `reprocess.lockedAsInvoiced`; the unlock as a service (the story `p1-reviewed` writes it as the API's login may). **Task 1.9.1:** the mission's review through these services; its back-office reason and the catalogue's example say "Phone failed", which the shipped list doesn't hold ("Device failed" does): the firm adds it, or the page changes (08 point 3). ~~**Phase 2:**~~ ✅ *(ADR-420, 430, 431; the edit log fell away, ADR-477; swept by ADR-522)* each review call behind a request that checks the grant again and states the request id; the job queue takes a call's `reprocess` (today its caller asks the worker); a monitor's own reopen as the phone's edit log (`FieldEventEdit`); request schemas that refuse a load call past 100 or a blank label in plain words (today the database's check throws). **Phase 4:** the review queue reads a quarantined record's `resolution`; a line taken off shown as taken off. ~~**No task yet:**~~ **→ 2.8.7 (ADR-522):** *(a field event's kind or workflow stays not offered, ADR-364)* an ROE's number corrected (its records re-pointed); the answers to a form's own fields corrected; a survey, an incident, a drop-off log or an ROE created in the back office (only a field event is built); a field event's kind or workflow changed (not offered: made again and the wrong one voided). **For the user, any time:** ADR-364's agent defaults (`SUMMARY.md` §4), first that a grant is checked in the service itself and the two ways a quarantined record is resolved.
- **C80. What task 1.8.4 left** (ADR-365). **Task 1.8.5 (QC, the lock and batches), ✅ done, ADR-367; it was:** a void or an acceptance on a ticket locked as invoiced is saved today and the run leaves the ticket as it is (named in `reprocess.lockedAsInvoiced`), like a correction (09 point 1 decides for all three); whether a voided ticket may be locked, and what QC Void on one means (the mission sets it by hand). **Task 1.9.1:** the mission's voids and acceptances through `Voids` and `Acceptances`, with its words as notes; AC-08-51 on Marsh Road TDSR itself if the mission leaves its permit outstanding (the story used Old Quarry Pit). ~~**Phase 2:** the job queue carries `reprocess.unvoided` with the job, so the unvoid of a rule's void can't be lost between the service and the run~~ ✅ ADR-366: the unvoid is a record the worker reads. ~~**Phase 2:**~~ ✅ *(ADR-430; swept by ADR-522)* each call behind a request that checks the grant again. **Phase 4:** the review queue shows an accepted flag as accepted and leaves a void ticket's cleared flags out; bulk accept. ~~**No task yet:** a record of its own for the unvoid of a rule's void~~ ✅ `TicketUnvoid` (the user, ADR-366). ~~**No task yet:**~~ **→ 2.8.7 (ADR-522):** taking an acceptance back. ~~**For the user:** ADR-365's agent defaults~~ ✅ approved 2026-10-06, with the rule of ADR-366.
- **C81. What task 1.8.5 left** (ADR-367). **Task 1.9.1:** the mission's QC, lock and batch through `QcMarks` and `InvoiceLocks` (thirteen tickets in "Bayline ROW, week of 12 Oct", AC-09-11, 31; QC Void by hand on `301003` and `301005`, AC-08-63); P2's split load `102001` QC'd and locked as one, and ROEs `R-0007`, `R-0008` and their surveys QC'd on their own (the story halves of AC-08-57, 58 and AC-09-05 that `p1-invoiced` leaves). ~~**Phase 2:**~~ ✅ *(ADR-420, 430; swept by ADR-522)* each call behind a request that checks the grant again; the job queue takes an unlock's `reprocess`. **Phase 4:** for a set of tickets, the list of those that can't be locked and why (AC-09-08: the service refuses one at a time, in the same words); the report by a batch's name; what the screens do with a closed project, and reopening one. ~~**No task yet:**~~ **→ 2.8.7 (the guard), 2.8.8 (the batch renamed) (ADR-522):** a guard at the database on a locked ticket's field events (today the review services refuse the change and the database holds the lines); a batch renamed through a service (the database allows it, ADR-363). **For the user, any time:** ADR-367's agent defaults (`SUMMARY.md` §4).
- **C82. What task 1.9.1 left** (ADR-368). **Done by it, of what earlier items gave it:** C30; C68's (the story keeps `passOver` for `201002` and `201003`; the fixes and the certifications looked up are there; a photograph with each unit rate ticket, each ROE and each certification, none on the incident, the drop-off log or the towers' loads); C75's split load priced by the worker; C78…C81's review, QC, lock and batch through the services, and AC-09-05's P2 half. **Task 1.9.2 (✅ ADR-369, but control ranges and AC-08-51 on Marsh Road TDSR itself, C83):** C75's others (AC-07-63's reprocess, a load that carries tickets, a `NO_RATE_FOR_PRIME` and a `TIPPING_FEE_RULE_MISSING` cleared by setup), C71's (a tandem's shared weight, control ranges, a site's own shape, a new map version, a replaced or revoked certification, AC-06-05, AC-06-36), C51's two, AC-08-51 on Marsh Road TDSR itself (the mission's permit is not outstanding: `p1-voided` keeps Old Quarry Pit), and the count of scenario IDs with a passing test, by part. ~~**Phase 2 or 3 (the certifying screen and the sync contract):**~~ ✅ *(ADR-481: a certification's photographs; ADR-423; ADR-420, 472; swept by ADR-522)* a service that takes a certification's five photographs with it (the story writes them as Sam's phone would; every other story leaves `CERTIFICATION_PHOTO_MISSING` standing on each certification); the setup check and a site's lookup as a service in `apps/api` (C74); AC-05-53's queue. **Phase 4:** what each viewer sees of the mission, as a browser test; the client package. **For the user, any time:** ADR-368 (5): the mission's audit excerpt puts `301003`'s `COMPLETED` → `VOID` on Luis's row; the engine keeps Luis's void as his record and the status change under the system (ADR-365). Say if the page should read that way.
- **C83. What task 1.9.2 left** (ADR-369). ~~**Phase 2 (the job queue; with C71's AC-06-36):**~~ ✅ *(ADR-420; swept by ADR-522)* when a certification is made after a field event scanned its number, **find the field event's `certificationId` again** (intake writes it only on arrival; the worker reads certifications by number, so the ticket bills, but a contractor user's sight hangs on the link, ADR-361), and queue the tickets that scanned it. ~~**Phase 2 or 4 (setup services):**~~ ✅ *(ADR-423; swept by ADR-522)* a rate added or changed, a pay item's unit, a project's window and a site's own shape each as a service (the story writes them as the person through the API's login). **Phase 3 (the tower's screen):** it asks for the number of **tickets** the load carries (the user, ADR-370: "the tower counts the tickets"), as the worker compares. **For the user:** `CARRIED_COUNT_MISMATCH`'s approved words name the kind of work ("tower counted 2 white goods, the collection lists 1"); say if it should read "tickets". **Not told by any story:** a project numbered from control tickets (AC-06-164, proven at the domain); ~~an expired tag on a lone collection (AC-03-50) and a certifying phone's cert numbers topped up to 100 (AC-05-47), each without a test of its own~~ (✅ each has one, ADR-371). ~~**Task 1.9.3:** count the scenarios again (`spec/acceptance/README.md`) after anything it proves.~~ ✅ ADR-371: AC-03-50 and AC-05-47 have their own test now; 693 whole, 15 in part, 52 later.
- **C84. What task 2.1.1 left** (ADR-379). `spec/acceptance/10-api-and-sync.md`, "Left to the task that builds it", seventeen points nothing recorded settles, each decided in its task's ADR: ~~**2.1.2** the health answer (17)~~ ✅ ADR-385 (5); 2.7.2 looks at it again · ~~**2.1.3** the size limits, which headers an API answer carries (1, 16)~~ ✅ ADR-389, 392 · ~~**2.1.4** the statement timeout's value (1)~~ ✅ ADR-394 · ~~**2.2.1** where a security event is kept (8)~~ ✅ ADR-399 (the actor of one written when nobody is signed in: C88) · ~~**2.2.2** the revision of NIST SP 800-63B, the shortest password, Argon2id's parameters, and a monitor's password read as exempt from the rules (3, 4)~~ ✅ ADR-402 · ~~**2.2.3**~~ ✅ *(ADR-408…411; swept by ADR-522)* token lifetimes, the counts before back-off and lockout, how a locked login opens and the last admin, CSRF's mechanism, what a failed sign-in is told, what ends a session (1, 2, 5, 6, 7) · ~~**2.2.6** the rate limits and what a limited caller is told (1, 13)~~ ✅ ADR-416 (what a phone does with it: 2.6.5) · ~~**2.3.1** the queue's retries (14)~~ ✅ ADR-418 · ~~**2.3.2**~~ ✅ *(ADR-419, 507; swept by ADR-522)* whether two projects' runs go at once (15) · ~~**2.5.1, 2.5.2**~~ ✅ *(ADR-439…443; swept by ADR-522)* a challenge's lifetime, the key's kind, the actor under the master passcode (10, 11) · ~~**2.6.1, 2.6.2**~~ ✅ *(ADR-467; swept by ADR-522)* a record that disagrees with who sent it or fails its schema (9) · ~~**2.6.4** a file that fails its check (12)~~ ✅ ADR-482 (5): set aside for a person, the phone told to send again. ~~**2.7.3**~~ ✅ *(ADR-509; swept by ADR-522)* replaces each scenario's checklist chapter with the numbered requirement of the published text (the chapters were written from memory). Every Phase 2 task reads its rows of `spec/THREAT-MODEL.md` §4 first.
- **C85. What task 2.1.2 left** (ADR-380…385). **Every task that changes `apps/api`:** `pnpm local:up` again before the chain, since the API's container runs what was built when it started and `door.test.ts` asks that container; a task that adds a refusal adds its code to `packages/contracts`' `errorCodes` and the filter's table; a controller joins `ApiModule`; a class that needs another names it with `@Inject(…)` (no `emitDecoratorMetadata`, ADR-380). ~~**2.1.3:** the first use of `Settings.databaseUrl`; the request id into `db.$write`; the body limit as a policy value; the headers an API answer carries, and the request id as one; Caddy's `Via`~~ ✅ ADR-389, 390, 392. ~~**2.1.4:** C53 beside `Settings` (a key in the environment already wins over the file)~~ ✅ ADR-395. ~~**2.2.1, 2.2.3, 2.5.1:**~~ *(ADR-522: the log read on a reset ✅ ADR-416; on a real sign-in and enrolment → **2.8.3**, ✅ ADR-525: read in the process's own log, the container held to log the same; never made through the container, which would leave a person or a phone in the installation)* ~~AC-10-32's second half~~ (a password, a code, a token, a cookie, the master passcode in a real sign-in and enrolment: `door.test.ts` reads the container's log). ~~**2.2.6:** a caller's address is not logged and the server does not trust the proxy's forwarded address yet; rate limits per IP need both decided.~~ ✅ ADR-416 (8), (9): a listed proxy's word only (`ADMS_TRUSTED_PROXIES`); still logged nowhere. ~~**2.3.2:**~~ ✅ *(ADR-419, 507; swept by ADR-522)* the worker's process the same way (its own `Settings`, its container, its profile), and AC-10-55's worker half. ~~**2.7.2:** whether the health answer says the database answers.~~ ✅ ADR-507: the readiness answer does; the health answer stays the process's. **Phase 5a:** an image a firm deploys (the local container mounts this checkout); the uid the container runs as reading the owner-only settings file on a Linux host (seen working on Docker Desktop for macOS only); Node's own crash output and warnings are not JSON (a deprecation would be one plain line: `door.test.ts` fails on it). **For the user:** NestJS 12 is six weeks old (ADR-380); `spec/THREAT-MODEL.md` still waits for approval (ADR-386). **✅ 2.3.2 (ADR-419):** the worker's own `Settings`, container and profile; AC-10-55's worker half.
- **C86. What task 2.1.3 left** (ADR-387…392). **Every task that adds an endpoint:** define it with `endpoint()` in `packages/contracts/src/endpoints.ts` and name it in `endpoints` and add its line to `apps/api/test/every-endpoint.test.ts`'s list (ADR-512); give every number it takes a least and a most (a whole number one a column holds), name no secret in its path or query and take no address the server would ask, or `packages/contracts/test/endpoints.test.ts`'s "what every endpoint takes" fails (ADR-513); serve it with `@Serves(…)` on a controller named in `ApiModule` (a route mapped any other way answers 500, and `boundary.test.ts` holds the routes to the list); `pnpm openapi` and commit `apps/api/openapi.json`; a controller that writes names the database with `@Inject(apiDatabase)` and states no request id (the client does); a test of the API that needs a shape borrows one from the contracts (`apps/api` has no Zod of its own). ~~**2.1.4:** whether `REQUEST_BODY_LIMIT_BYTES` may be overridden by an installation (C53)~~ ✅ it may (ADR-395). ~~**2.2.3:**~~ ✅ ADR-408 (credentials allowed to a listed origin, `x-adms-csrf` among the allowed headers, `SameSite=Strict`, who may call asked before the schemas) `Access-Control-Allow-Credentials` and the cookies' `SameSite` with CSRF; `authorization` (or whatever a write must carry) joins the allowed request headers with the task that sends it; whether the boundary runs before or after sign-in's check. ~~**2.2.6:** the forwarded address (C85) before any per-IP limit.~~ ✅ ADR-416 (8). ~~**2.4.4:** which field was refused, in plain words (AC-10-37): the answer is a code only today.~~ ✅ ADR-431. ~~**2.6.1, 2.6.4:**~~ *(ADR-522: the routes' own limits ✅ ADR-482, 484; a query's repeated key → **2.8.8**)* an endpoint's own size limit (a sync's batch, ~~a photograph~~ ✅ ADR-482: the media route's own body limit, `MEDIA_PART_BYTES_AT_MOST`; a map's shapes); a query's repeated key is refused unless its schema names an array. **Phase 3, Phase 4:** each web app's origin and the field app's native origins (`capacitor://localhost`, `https://localhost`) join `ADMS_CORS_ORIGINS` (the local stack lists `https://adms.localhost` only); the page headers are the web apps'. **Phase 5a:** the installer or the deploy writes `ADMS_CORS_ORIGINS`, `ADMS_API_HOST` and `ADMS_API_PORT` for a firm (locally they are compose's). **For the user:** the agent defaults of ADR-387…392, listed in `SUMMARY.md` §4.
- **C87. What task 2.1.4 left** (ADR-394, 395). ~~**2.3.2:**~~ ✅ *(ADR-419; swept by ADR-522)* the worker's process reads its policy as the API does (the release's file, then its own env file and environment; `installationPolicy` is `apps/api`'s today, so the reading moves where both apps reach it, or the worker has its own), and its container is started afresh after the installer like the API's; pool limits for both services (ARCHITECTURE §5.7's other half); whether a lock timeout or an idle-in-transaction timeout joins the policy values once a run holds locks for long. ~~**2.4.4, 2.6.5:**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: `503 BUSY`, `database-busy.test.ts`)* what a caller is told when its statement was stopped (SQLSTATE 57014 is `INTERNAL` today, nothing saved; a phone must keep its records and send them again, T-17, AC-10-40, 41). ~~**2.6.2:**~~ ✅ *(ADR-473: `policy.env` says "read by the worker alone"; swept by ADR-522)* each of the worker's thresholds that joins `policyNames` says which service reads it, since a value both read could be stated differently in the two env files (ADR-395 (5)). **Phase 4:** an export or a report through `adms_readonly` that needs longer than thirty seconds states so with its task (a `SET LOCAL` inside its own transaction can only be shorter unless the login's is raised). **Phase 5a:** a firm's deploy sets the logins' timeouts the same way (the installer, or the deploy's own step), and documents the override. ~~**Not seen in this task:** a first run after a teardown; an override written into the local installation's env file~~ ✅ both seen in real runs (ADR-396). **For the user:** the agent defaults of ADR-394, 395, listed in `SUMMARY.md` §4. **✅ 2.3.2 (ADR-419):** the worker reads its policy as the API does (its own copy of the reading); its container is made afresh after the installer; the pool's size is the policy value `DATABASE_POOL_CONNECTIONS` for both services; no lock or idle-in-transaction timeout was added (nothing asks for one).
- **C88. What task 2.2.1 left** (ADR-397…399, 401). **The standard for all of it (the user, ADR-401): NIST SP 800-63B and ASVS Level 2; lockout state in the database, a failed sign-in and a lockout in the audit log's security domain; a try at a name nobody has writes no row, nothing a stranger typed is stored, writes for a real account bounded by the lockout (2.2.3 builds and tests each); a departure is said, with what the standard asks, before it is built.** ~~**2.2.2:** a password is written to `user_credential.passwordHash`; whether a monitor's password is held there the same way and to which rules; whether "when it was set" is needed~~ ✅ ADR-402 (the same hash, exempt from the rules; no column: nothing knows a password's age). **2.2.3, all done ✅ ADR-408, 409** (the actor of a wrong try is the person whose login was tried; the count is `user_credential.failed_sign_ins`; a lock opens by a new password; the email address; two tabs refreshing at once sign the person out, so the page takes a lock: C90)**:** **who is stated as the actor of a security event, and of a lock, when nobody is signed in** (a wrong try at a name nobody has, a wrong password for a person: every write needs `adms.actor_id`, only the worker may state the system actor, ADR-276; `security_event.userId` is who it is about, apart from the actor); the refresh token says which session it is (ADR-398 (2)), so one used twice revokes that row; a rotation is an update of `refresh_token_hash`, a sign-out or a reuse sets `revoked_at`, after which the database refuses every change; the session's lifetime (`expires_at`) and the access token's are policy values; where the count of wrong tries lives (counted from `security_event` by its `(user_id, occurred_at)` index, or a column added then); how a lock opens (`lockedUntil`); what a back-office user signs in with (`user.email` is optional and not unique); `door.test.ts` reads the log after a real sign-in (AC-10-32); two tabs refreshing at once. ~~**2.2.4:** how `twoStepSecret` is kept at rest; whether "confirmed" needs a column; an admin clearing it and a `SecurityEventKind` of its own.~~ ✅ ADR-412 (sealed with a key the database never holds; no column: nothing is kept before a code proves it; `TWO_STEP_CLEARED`). ~~**2.2.6:** whether a security event keeps the caller's address (none today; C85).~~ ✅ ADR-416 (9): it doesn't; no address is stored. ~~**2.5.1, 2.5.4:**~~ ✅ *(ADR-439, 456, 464; swept by ADR-522)* the actor under the master passcode (REQ-209); a wrong master passcode (a kind to add, or an outcome); a phone's logged uses arriving at sync with the phone's own `occurredAt`, and whether their id is the phone's (a retried sync must not write one twice). **Phase 4:** who in the back office is shown security events, and the screen. **Every later table of sign-in** follows the same recipe: its own guards (API alone), secret columns named on the audit trigger, a line in `unseenTables`, `keptOut` and the grant list of the tests. **For the user:** the agent defaults of ADR-397…399, listed in `SUMMARY.md` §4.
- **C89. What task 2.2.2 left** (ADR-402…406). **2.2.3 (sign-in), all done ✅ ADR-408…411** (`verify` and the hash made again at sign-in; a person's own change; the change of an admin-set password first; the keyed hash, for passwords; a new password ends the sessions and opens a lock; the email address is what a person signs in with)**:** check a password with `PasswordHasher.verify` (it reads the hash's own settings; hash again at a sign-in when `PasswordHasher.cost` has been raised); a person changes their own password giving the current one (ASVS 6.2.2, 6.2.3: an endpoint that needs a session); **whether a password somebody else set must be changed by its owner at their next sign-in** (ADR-406 (4): recommended; a column on `user_credential` set by `Passwords.setByAdmin`, cleared by the person's own change or reset); **whether a password is also run through a keyed hash** with a secret kept apart from the database (ADR-402 (6): the standard's SHOULD; one more secret for the installer to make and keep, the master passcode's hash the same); whether setting or resetting a password ends the person's open sessions and opens a lock (`lockedUntil`), with file 10's point 7; what a person signs in with, since two people may share an address and reset by email then sends nothing (ADR-404 (3)); `ADMS_TOKEN_SIGNING_SECRET` already keys the reset codes, each purpose drawing its own key from it (`reset-codes.ts`). ~~**2.2.5:** the endpoint for `Passwords.setByAdmin` (AC-10-25's admin half at the API), with creating a person; the reason a password was refused, in plain words, reaches the caller~~ ✅ ADR-415 (5), (13). ~~**2.2.6:** `POST /password-resets` and `/password-resets/completions` are unlimited: a limit per address asked for and per caller (ADR-404 (9)).~~ ✅ ADR-416 (3). ~~**2.4.3:**~~ ✅ *(ADR-428; swept by ADR-522)* changing the master passcode through the API screens it with the domain's `BreachedPasswords` (AC-10-24's API half); the installer's own copy of the rule is `tools/setup`'s `BreachedList`. ~~**2.5.2:**~~ ✅ *(ADR-442; swept by ADR-522)* a monitor's password set on a phone goes through `PasswordRules` with `monitor: true` and `PasswordHasher`. ~~**2.5.3:**~~ ✅ *(ADR-454; swept by ADR-522)* the login list's entries are their own slow hashes, salted for the phone (ARCHITECTURE §7.2), not `user_credential`'s. **Phase 4:** the reset page, and a link in the message instead of a code to type (ADR-404 (7)); `PasswordProblem.message` on the screen; the field's paste, show and password-manager behaviour (ASVS 6.2.6, 6.2.7). **Phase 5a:** the installer asks a real firm for its mail server's URL and sender (`SMTP_URL`, `ADMS_MAIL_FROM`; only the mail catcher or none today); a newer breached-password list is a release's work (ADR-403 (5)). **Every later test of the API that must write** uses `apps/api/test/support/database.ts` (`undone`: one piece of work on the installation's database as `adms_api`, rolled back) and may hand the process its database, mail and clock (`ProcessParts`). **For the user:** the agent defaults of ADR-402…406, listed in `SUMMARY.md` §4.
- **C90. What task 2.2.3 left** (ADR-407…411). **Every task that adds an endpoint:** its definition states `access` (`ANYBODY`, `SIGNED_IN`, `REFRESH_TOKEN`; ADR-408 (3)); a controller reads its caller with `callerOf(request)` (`apps/api/src/sign-in/admission.ts`); a test of a signed-in endpoint starts the process on its own piece of work and signs in as `apps/api/test/sessions.test.ts`'s `Served` does (move it to `test/support/` when a second file needs it); `apps/api/test/session-tokens.test.ts` holds the list of endpoints nobody need be signed in for, and fails when one joins it unnoticed. ~~**2.2.4 (two-step):** sign-in becomes two steps for an admin and a manager/analyst; a wrong code is a wrong try; clearing a person's two-step ends their sessions; AC-10-32's "an authenticator code" joins the log's test.~~ ✅ ADR-412 (`SIGN_IN_FAILED`, no kind of its own). ~~**2.2.5 (permissions and people):** the last admin's way in and the first admin's creation; one email address a person; `Admission` asking a role and a grant per endpoint; the endpoint of `Passwords.setByAdmin`; an admin ending anybody's sessions; archiving a person ending theirs~~ ✅ ADR-415. ~~**2.2.6 (rate limits):** `POST /sessions`, `POST /password-changes` and `GET /sessions/csrf` are unlimited but for the login's own wait and lock: a limit per caller's address is what keeps a stranger from holding a known login in its wait (ADR-409 (5)).~~ ✅ ADR-416 (3), (5), and ADR-417: the lock at fifty wrong tries, so one address needs about forty hours. ~~**2.4.4:**~~ **→ 2.8.7 (ADR-522):** *(the void's own endpoint still untried without its CSRF value)* AC-10-16 names a void: its own endpoint is tried without the CSRF value there (a test's own write stands in today). ~~**2.5.1:**~~ ✅ *(ADR-439; unkeyed, ADR-454 (8); swept by ADR-522)* whether the master passcode's hash is keyed too (ADR-411 (5): the installer makes it and phones carry its check); the actor under the master passcode (ADR-409 (9) decided only a wrong try at a person's login). **Phase 4 (the back office's and the portal's pages):** the CSRF value is kept in the page's memory, from the sign-in or refresh answer or `GET /sessions/csrf`, and sent as `x-adms-csrf`; calls go with credentials; **one lock across the page's tabs before a refresh** (two tabs refreshing with one token sign the person out, ADR-408 (5)); a sign-in page that says the same to every failure and where to reset; the change-your-password page a marked person is sent to (`passwordChangeRequired`); a person's own sessions listed and ended (ASVS 7.5.2); sign-out on every page (7.4.4). **Phase 5a (the demo deploy):** the back office and the API must be one site for `SameSite=Strict` cookies (the API behind the web app's own address, a proxy path; ADR-408 (6)); a key for password hashes of its own, kept apart from the signing secret, or in hardware (ADR-411 (4)); the runbook says that losing `ADMS_TOKEN_SIGNING_SECRET` means every password is set anew. **For the user:** the agent defaults of ADR-408…411, listed in `SUMMARY.md` §4; AC-10-24's example, changed at their word (ADR-407 (3)).
- **C91. What task 2.2.4 left** (ADR-412, 413). **Every task that adds an endpoint:** a `SIGNED_IN` endpoint is closed to a person who must first set an authenticator up unless its definition says `beforeTwoStepSetup` (only what setting one up takes); its test signs in through `apps/api/test/support/served.ts` (`worldOn`, `served.signedIn`), whose Dana and Luis have authenticators. ~~**2.2.5 (permissions and people):** the server command (the first admin, an admin's password, an admin's authenticator); the role check of `TwoStep.clearByAdmin` at the door too; a created person with no authenticator~~ ✅ ADR-415 (whether an admin may require a viewer to have an authenticator: still not asked, ADR-170 says optional). ~~**2.2.6 (rate limits):** `POST /sessions` with a code, and `/two-step/setups/confirmations`, are limited only by the login's own wait and lock.~~ ✅ ADR-416 (3). ~~**2.5.1:**~~ ✅ *(ADR-439; swept by ADR-522)* the master passcode's uses stay without a second step (a phone's protection is the phone, ADR-170). **Phase 4:** the sign-in page asks for the code when it is answered `TWO_STEP_CODE_NEEDED` and sends email, password and code together (it keeps the password in the page's memory for that moment only); the setup page shows the QR code from `uri` and the text from `secret`, once; **a person replaces or removes their own authenticator giving a code from it** (✅ ADR-530 (11): `POST /two-step/removals` with a code from it; the page is Phase 4's); recovery codes, if the user wants them (the standard's lookup secrets; ASVS 6.5.2 says how they are kept); who is shown `TWO_STEP_SET_UP` and `TWO_STEP_CLEARED` events. **A later candidate, not planned (ADR-414 (4)):** a passkey or hardware key offered beside the code (phishing-resistant; ASVS Level 3), raised with the user before any work. **Phase 5a:** the runbook says that losing `ADMS_TOKEN_SIGNING_SECRET` means every authenticator is set up again as well as every password; a key for sealed secrets of its own (the `v1` in the string is there for it); `pnpm local:accounts` is never part of a deploy. **For the user:** the agent defaults of ADR-412, listed in `SUMMARY.md` §4.
- **C92. What task 2.2.5 left** (ADR-415). **Every task that adds an endpoint:** a `SIGNED_IN` definition names its `roles` (`adminOnly`, `backOfficeRoles`, `signedInRoles`) and, where it is a reviewer's or a setup action, its `permission`; `apps/api/test/people.test.ts` holds the exact lists of what is an admin's alone and of what takes a permission (none yet), so a new one is added there on purpose; its service still asks inside its own piece of work (ADR-364); its test tries it as an admin, a manager/analyst with and without the grant, a read-only viewer and nobody (AC-10-27; `served.ts` has two endpoints of the tests' own that take *void* and *unlock*). **The API's test files run one at a time**; a test that archives Dana gives the firm another admin first; what needs a firm with no admin is a story. ~~**2.2.6 (rate limits):** the seven endpoints of the firm's people and `POST /people/:userId/two-step-clearings` are unlimited.~~ ✅ ADR-416 (3): by address and by person, as every signed-in endpoint is. ~~**2.4.1 (setup's endpoints):** a list of people, with paging; editing a person (name, address, phone, a viewer's kind, contractor and `seesPrivateCitizens`, AC-02-75's "then or later"); **changing a role** (the database already refuses unmaking the last admin and a second holder of an address; grants a person held stay until cleared); taking a person out of the archive; whether `SETUP` or `DISPATCH` opens any of it to a manager/analyst (not asked: only an admin today).~~ ✅ ADR-427 (task 2.4.2, part 4; still an admin's alone but for the two reads). ~~**2.4.4:**~~ ✅ *(ADR-430, 431; swept by ADR-522)* each review endpoint names its permission, so AC-02-12, AC-09-18 and AC-10-28 pass on the real calls; which field was refused in plain words (AC-10-37) may use the error answer's `message`, which today carries only why a password wasn't taken. ~~**2.4.5:**~~ ✅ *(ADR-434, 435; swept by ADR-522)* a viewer's reads scoped to their projects and contractor (`adms.viewer_id`), with which REQ-202 can be seen whole but for the phone. ~~**2.5.2:**~~ ✅ *(ADR-442; swept by ADR-522)* a monitor is created on a phone under the master passcode (AC-02-07), never through `POST /people`; an admin already sets a monitor's password through `POST /people/:userId/passwords`. **Phase 4:** the people page (create, permissions as ticks, a viewer's projects, archive, end sessions, set a password, clear an authenticator); the session answer or a call of its own tells the page what the person may do, so it hides what would be refused; a person seeing and ending their own sessions (ASVS 7.5.2); REQ-415's bundles, bulk changes and history. **Phase 5a:** the runbook names `pnpm installer:admin` as the first step after the installer and as the way back in, and says who may run it (whoever holds the server); in a container deploy it is run inside the API's image (`node apps/api/dist/admin.js`). **For the user:** the agent defaults of ADR-415, listed in `SUMMARY.md` §4; AC-02-83 and 84 and the note under ARCHITECTURE §7.0, for their approval.
- **C93. What task 2.2.6 left** (ADR-416). **Every task that adds an endpoint:** it is limited by address and, where somebody is signed in, by person, with nothing to do; one that tries a secret (a password, a code, a passcode) asks `limits.mayTry(request.ip, …)` before it and tells `limits.wrongTry` of a refusal, as `sessions.controller.ts` does; a test that makes more than four wrong tries at one login moves `served.from` (`apps/api/test/support/served.ts`), and one that needs other numbers hands `worldOn` a policy from `installationPolicy({ … })`. ~~**2.5.1:**~~ ✅ *(ADR-439; swept by ADR-522)* a wrong master passcode at enrolment is a refused try by address (AC-10-22's growing wait is its own, C90). ~~**2.6.5:**~~ ✅ *(ADR-490: counted for the phone and its address; swept by ADR-522)* the limit per device; what a phone does when it is answered `LIMITED` (file 10's point 13; AC-10-41: nothing is lost, it sends again after `Retry-After`); **whether a proven phone's sync is counted against its address's limit** (an office's phones share one address in the evening: 3,000 a minute for all of them and the back office together may be too few, and the number is the firm's to state meanwhile). **Phase 4:** the sign-in page says "try again in N minutes" from `retryAfterSeconds`, and points to the reset. **Phase 5a:** the deploy writes `ADMS_TRUSTED_PROXIES` for the firm's proxy (left out, every caller looks like the proxy and shares one count); more than one API process each keeps its own counts (a shared store is a new service, by ADR); the proxy's or the network's own limits are what meet a flood from very many addresses; the runbook says the proxy's access log is where a firm sees who is flooding it (the API logs no address). ~~**A later candidate, not planned:** a count of wrong tries that fades with time~~ **settled by the user (ADR-417):** the lock comes at fifty wrong tries instead; a fading count and a memory of known addresses are not built (the user's word, ADR-417: nothing to file). ~~**For the user:** the agent defaults of ADR-416~~ ✅ confirmed (ADR-417).
- **C94. What task 2.3.1 left** (ADR-418). ~~**Task 2.3.2 (the worker's process):**~~ ✅ *(ADR-419; swept by ADR-522)* it takes up a project's *waiting* jobs (`finishedAt` and `setAsideAt` both empty) under the project's advisory lock, which is the claim (no `SKIP LOCKED`, no raw SQL); works the union of the tickets they name, each once, and no other (the run reads the whole project today: `ProjectRead` and `Reconciliation.run` take the tickets); adds one to `attempts` when it takes a job up, writes `finishedAt` with `reconciliationRunId` when its tickets are worked (in the run's own writing, as the system actor), `lastError` when a try fails whole, and `setAsideAt` after **`JOB_TRIES_BEFORE_SET_ASIDE` (5), a new policy value** (`policy.env`, the three whole maps in `packages/domain/test/`, `project-settings.test.ts`, `packages/scenarios/test/policy.test.ts`); a job set aside is in its log and its health answer; what a run with no job does about the flags on no ticket (a certification's views, a site's permit: checked in every run today); whether a run's `trigger` and `requestedById` are the first job's when it works several; the stories still call `Reconciliation.run` directly until 2.7.1. ~~**Task 2.3.3 (what queues work):**~~ ✅ *(ADR-420; swept by ADR-522)* `ReviewService.review` already holds the open piece of work and the `Reprocess` it answers: it calls `new ReconciliationJobs(tx).queue(…)` there, and so do `InvoiceLocks`' unlock, `Corrections`' measure and a setup change (whose tickets it must name: the un-invoiced ones the change touches); a ticket locked as invoiced that a change names (queued and left by the run, or left off the job); AC-10-50 whole, on Luis's correction; whether the worker ever adds a job of its own (it holds no INSERT). ~~**Task 2.6.2:**~~ ✅ *(ADR-472; swept by ADR-522)* a sync's job (`trigger` `SYNC`, no person), one for a batch or one for each ticket. ~~**Task 2.6.4:**~~ ✅ *(ADR-481; swept by ADR-522)* media jobs are not this table's. **Phase 4:** a screen that shows the waiting and set-aside jobs to the back office. **For the user:** ADR-418's agent defaults  (`SUMMARY.md` §4). **✅ Task 2.3.2's part done (ADR-419):** the waiting jobs taken up under the lock, the union of their tickets worked, the try counted first, finished in the run's closing write, `lastError`, set aside after the policy's five; the flags on no ticket still checked in every run; the run's trigger the oldest job's and its person only where all agree; `ProjectRead` still reads the whole project (C95).
- **C95. What task 2.3.2 left** (ADR-419). ~~**Task 2.3.3 (what queues work):** **a job must name every ticket the change can move, not only the one changed**: the queue's run works only named tickets, and a change to one ticket moves what stands on others (voiding 101031 clears the overlap flag on 101030, AC-08-34; a corrected receipt moves the other container's share of a tandem's weight, which is money; a carried ticket, a split's other properties, a renumber's two numbers). Either the review services and a setup change name those neighbours when they queue, or the run widens a named ticket to the ones whose checks read it: decide it with the domain's checks in hand, and move `p1-reviewed`, `p1-voided` and `p1-invoiced` onto `waitingJobs` to prove it (today they call `Reconciliation.run`, which works the whole project whatever `reprocess.tickets` says); a setup change that touches many tickets is cut into jobs a run can finish inside `RECONCILIATION_RUN_LONGEST_MINUTES`, or the run finishes the jobs whose tickets it reached (today a job too large fails whole five times and is set aside).~~ ✅ ADR-420: the change names them, before and after; the three stories run from the queue; a change is cut into jobs of `JOB_TICKETS_AT_MOST` and a run takes up that many. ~~**Task 2.6.2:**~~ ✅ *(ADR-472; swept by ADR-522)* a sync's job, and the same question of neighbours for a field event that arrives (its partner, a duplicate's holder, a load that carries it). ~~**Task 2.7.1:**~~ ✅ *(ADR-494; swept by ADR-522)* the stories onto the queue. ~~**Task 2.7.2:**~~ *(ADR-522: the database's answer ✅ ADR-507; the read measured ✅ ADR-506, C154; two worker containers at once ✅ ADR-524, measured at the burst)* whether the worker's health answer says the database answers; the read narrowed to what the named tickets need, measured at a real project's size; two worker containers at once. **Every task that changes `apps/worker`:** `pnpm local:up` again before the chain (its container runs what was built when it started; `apps/worker/test/container.test.ts` asks that container). **Phase 4:** a screen that shows waiting and set-aside jobs. **Phase 5a:** as C85 (an image, the uid, a firm's own map servers and their certificate authority in the worker's settings). **For the user:** ADR-419's agent defaults (`SUMMARY.md` §4).
- **C96. What task 2.3.3 left** (ADR-420). ~~**Task 2.4.1 (the services a story's hand still does):**~~ ✅ *(ADR-423; swept by ADR-522)* each new setup service (a pay item's unit, a project's active window, a site's own shape) queues its tickets as the others do (`QueueingService.setupChanged`); the stories that still write a rate by hand (`p1-priced`, `golden-mission`) may call `PayItemSetup.rate`. ~~**Task 2.4.2 (setup's endpoints):**~~ ✅ *(ADR-424…426; swept by ADR-522)* every service that queues is made with the installation's policy (`(db, clock, policy)`); a contractor merged, a contract or a prime added to a project, a form's debris type and a list's value queue nothing today: decide each when its endpoint is written (a merge changes whose rate a ticket bills at). ~~**Task 2.4.4 (review's endpoints):**~~ ✅ *(ADR-431, 501; swept by ADR-522)* the answer's `reprocess` now says what was queued (`neighbours`, `jobs`); a locked ticket a shared record's correction touched is left off the job (one loosening of this is caught by no story: add the case, a scale receipt corrected with one of its tickets locked). ~~**Task 2.6.2 (a sync's job):**~~ ✅ *(ADR-472; swept by ADR-522)* a field event that arrives queues its ticket and its neighbours through `WorkQueue` (its partner is the same ticket; a duplicate's holder; a load that carries it), trigger `SYNC`, no person; a certification that arrives by sync goes through `Certifications.certify`, which already queues. ~~**Task 2.7.1:**~~ ✅ *(ADR-494, 506; swept by ADR-522)* the stories' sync and setup runs still asked for directly (`p1-reconciled`, `p1-priced`, `p1-left-out`, `golden-mission`, and the sync runs of the three moved) go onto the queue; a site's GPS and a new map version worked from the queue as a story. ~~**Task 2.7.2:** the neighbour read (by certification number, scale receipt and carried number) and a setup change's read of every ticket, measured at a real project's size; whether 200 tickets a run is right; the API's and the worker's `JOB_TICKETS_AT_MOST` read apart.~~ ✅ ADR-506 (C154). **Phase 3 (the user, ADR-421; REQ-317):** a number at New that the phone's list of certifications doesn't hold: the phone warns, asks to refresh its lists where it has a connection, and otherwise lets the monitor key the truck in by hand. **Phase 4:** the review queue shows that a ticket was queued because a neighbour changed; **(the user, ADR-422)** a saved setup change shows "N tickets queued, M locked as invoiced left as they are" from `Outcome.queued`, and a locked ticket carries a mark that the setup it was priced under has changed since, so unlocking it will move its amount. ~~**No task yet:**~~ **→ 2.8.7 (ADR-522):** taking an acceptance back. **For the user:** ADR-420's other agent defaults (`SUMMARY.md` §4); the locked ticket is decided (ADR-422).
- **C97. What task 2.4.1 left** (ADR-423). ~~**Task 2.4.2 (setup's endpoints):**~~ ✅ *(ADR-424…426; swept by ADR-522)* `SetupStanding` is made with the database client alone (it writes nothing and queues nothing): its three reads each get an endpoint, a back-office role's, and a viewer's sight of them is 2.4.5's; ~~`PayItemSetup.change` takes the unit, the crew-time conversion and the capture settings only: decide with the endpoint whether a description, a code, a payable type, a kind of work or a band may change (a band through `SizeBands.check`, the pay item itself left out of its others), and whether a change of description alone should queue nothing~~ ✅ ADR-425 (2): the code, the description and the band may, the payable type and the kind of work may not; every change queues; ~~a site's activation and close dates have no change yet (`SiteChanges`)~~ ✅ ADR-426 (4); an end before the start, and a conversion on a pay item that isn't by the hour or the crew day, are still the database's refusal thrown: answer each plainly (the conversion: ✅ ADR-425, plain words; a site's dates: part 3); ~~`SITE_SHAPE_NOT_READ` and `MAP_NOT_READ` are refusal codes of the services, not yet in `packages/contracts`; a shapefile is read to GeoJSON before `SiteSetup.shape` and `ProjectSetup.loadMap` (ADR-311: Phase 1 took GeoJSON only)~~ ✅ ADR-426 (5): answered as `NOT_SAVED` reasons; the shapefile is C100's; **C92's line headed "2.4.1 (setup's endpoints)" (a list of people, editing a person, changing a role, out of the archive) is endpoint work and is 2.4.2's**. ~~**Task 2.6.x and Phase 3 (C74):**~~ *(ADR-522: the lookup in the lists ✅ ADR-449; the harness's tower phone → **REQ-124f**)* the lookup sent with a phone's lists, by setup version; the harness's tower phone asking from its site's lookup instead of being told. ~~**Task 2.6.4:**~~ ✅ *(ADR-481; swept by ADR-522)* a certification's five photographs through a service (REQ-207's last part). ~~**Task 2.7.1:**~~ ✅ *(ADR-494; swept by ADR-522)* the stories' setup changes now each leave a job waiting while the run is still asked for directly; when the runs move onto the queue, `p1-left-out`'s check of what each change queued (20, 14, 26) stays as it is. **Phase 4:** the check's screen, the lookup on the site's page, a shape drawn on the map. **For the user:** the agent defaults of ADR-423 (`SUMMARY.md` §4).
- **C98. What task 2.4.2's first part left** (ADR-424). **Every part that adds a setup endpoint:** spread `setup` in `endpoints.ts` (roles and `SETUP`); write through `this.setup(person, …)` in the service; answer with `answered(request, outcome, record, done)` and the endpoint's own `answer.parse`; a record's shape goes in `packages/contracts/src/setup-answers.ts` and its mapper in `apps/api/src/setup/setup-records.ts`; **add the plain words for each constraint the new requests can reach to `process/database-refusal.ts`** (list a table's with `pg_constraint`; one with no words is still answered by its kind); add the endpoint to `setupEndpoints` in `apps/api/test/setup-endpoints.test.ts` (or its part's own file with the same door test); a refusal by the database ends a test's piece of work, so it is the test's last request; a service's read goes through `this.db.$read` (a test's database has nothing else). ~~**Part 2 (forms, pay items, "Pays when", rules):** `FormSetup`, `PayItemSetup`, `RuleSetup` are handed to the process (`PayItemSetup` and `RuleSetup` with the policy); AC-10-38's own case, a second rate for Coastline on `VEG-HAUL-CY-15` (`PayItemSetup.rate` upserts, so the constraint is reached by a pay item entered with one prime's rate twice: say which request shows it); C97's points on `PayItemSetup.change`; `FormSetup.ownFields` throws a Zod error on a bad shape (the endpoint's body schema is `formDefinitionFields`, so it never should); a form's debris type queues nothing today (decide).~~ ✅ ADR-425 (the pay item entered with Coastline's rate twice shows AC-10-38; a form's debris type queues nothing). ~~**Part 3 (sites, the map, the merge, the standing):** `ContractorSetup` becomes a queueing service (`(db, clock, policy)`; five stories construct it) and **`merge` queues, per project, the tickets not locked as invoiced whose field events carry a certification it moved**, proven in a story with tickets (P1's Rivera truck 730416 has them), with `POST /contractors/:contractorId/merges`; `SITE_SHAPE_NOT_READ` and `MAP_NOT_READ` are answered as `NOT_SAVED` reasons with nothing more to do; a shapefile read to GeoJSON (ADR-311); a site's dates; `SetupStanding`'s three reads (back-office roles; whether they take `SETUP` or are open to every back-office user is decided there, since a reviewer may want the setup check).~~ ✅ ADR-426 (the standing reads are open to both back-office roles without Setup; a shapefile is 2.6.4's, C100). ~~**Part 4 (people):**~~ ✅ *(ADR-427; swept by ADR-522)* C92's line. ~~**No task yet:**~~ ~~**→ 2.8.5 (ADR-522):**~~ ✅ *(ADR-527 (1)…(3))* changing a client's, a declaration event's, a contractor's or a contract's own fields (AC-01-02 is proven at the database only; no service exists), archiving one, and paging a search (each answers every record not archived); closing a project twice rewrites its close time. **Seen, not chased:** `pg` warns "client.query() when the client is already executing a query" once in a piece of work that queues a job (`setupChanged`; the stories show it too): a deprecation notice of the driver's, to be found before `pg` 9 (task 2.7.2 measures those reads anyway). **Phase 4:** the setup screens read `reason` to mark the field, and `queued` for "N tickets queued" (ADR-422). **For the user:** ADR-424's agent defaults (`SUMMARY.md` §4).
- **C99. What task 2.4.2's second part left** (ADR-425). ~~**Part 3 (sites, the map, the merge, the standing):** the tests' shared helpers are `apps/api/test/support/setup.ts` (`ask`, `saved`, `told`, `plainly`, `p1`, `viewerSignsIn`), and a part's own test file starts from them; **`setup-endpoints.test.ts` keeps the one list of every endpoint that takes `SETUP`** and its door test, so each new endpoint joins `setupEndpoints` there and its behaviour goes in its part's file (`setup-pricing-endpoints.test.ts` is part 2's); `apps/api` reads the contracts' and the domain's built code, so after a changed endpoint `tsc --build` (or `pnpm typecheck`) before its tests.~~ ✅ ADR-426. ~~**No task yet (each has no service; C98's list grows):**~~ **→ ~~2.8.5 (archives, puts back, a form changed, a crew day's steps)~~ ✅ ADR-527 (4)…(8), 2.8.8 (the reads) (ADR-522):** *(a pay item's payable type and kind of work stay as entered, ADR-425)* archiving a form's debris type (AC-01-27), a pay item, a prime's rate or a rule, and putting one back; changing a form (its name, enabled, "GPS required", what an incident offers: AC-01-83's change is proven at the database only); a pay item's payable type or kind of work (they stay as entered); **reading** a project's forms, pay items with their rates, and rules (the setup screens need them; whether a read takes `SETUP` is decided with it, as for `SetupStanding`'s in part 3; a read-only viewer never sees a rate); a crew day's steps (`pay_item_crew_day_step` has no service: a `PER_DAY_STEPS` pay item can be entered and its steps can't). **Seen, left as it is:** `RuleSetup.save` with an id the project doesn't hold writes a new rule (the stories never do; the endpoint goes through `RuleSetup.change`, which answers not found); a form or a payable type named in a body that isn't on record is answered 404 `NOT_FOUND` (the service looks it up by id), where a foreign key would answer 422 `UNKNOWN_RECORD`: both plain, not the same. **Phase 4:** the pay item screen shows a rate only from a read that takes Setup; the rule builder reads `valid` and `reasons` from the save's answer; "what it would change" before a save (ADR-229) has no service (**→ 2.8.8, ADR-522**). **For the user:** ADR-425's agent defaults (`SUMMARY.md` §4).
- **C100. What task 2.4.2's third part left** (ADR-426). ~~**Part 4 (people):** C92's line headed "2.4.1 (setup's endpoints)": a list of people with paging, editing a person, changing a role, out of the archive; its test file starts from `apps/api/test/support/setup.ts` (which now holds `p1Priced`, `notSaved` and `unticked` too), and an endpoint open to both back-office roles with no permission joins the exact list in `people.test.ts`.~~ ✅ ADR-427. ~~**Task 2.4.5 (the viewer's path):**~~ **→ 2.8.8 (ADR-522):** whether a client user or an auditor sees the setup check or the lookup (refused today). ~~**Task 2.6.4 (uploads):**~~ ✅ *(ADR-484, 485; swept by ADR-522)* a shapefile read to GeoJSON before `ProjectSetup.loadMap` and `SiteSetup.shape` (a new dependency, its ADR first), a map file larger than a request's body (1 MiB today), `MapVersion.uploadedFileKey`, and an endpoint's own size limit (C86). ~~**Task 2.6.x and Phase 3 (C74):**~~ ✅ *(ADR-449; swept by ADR-522)* the site's lookup sent with a phone's lists. ~~**No task yet (each has no service; C98's and C99's list grows):**~~ **→ ~~2.8.5 (a label, archives)~~ ✅ ADR-527 (9), 2.8.8 (the reads); ~~an Esri layer: 2.8.5, with KML~~ ✅ ADR-527 (14), (15) (the user, ADR-523) (ADR-522):** a site's own label (AC-01-58, proven at the database only), archiving a site or a site's link to a tipping fee pay item, reading a project's sites, its map versions and their shapes (the setup screens and the map need them), an Esri layer fetched by the server (`ESRI_LAYER` is kept as a word today). **Seen, left as it is:** a merge whose certifications have no ticket still writes no job, and one that moves certifications with none answers `queued` with zero tickets; a site type, a pay item or a contractor named by an id nobody has is answered 404 `NOT_FOUND` where the service looks it up, 422 `UNKNOWN_RECORD` where a foreign key does. **Phase 4:** the setup check's page open to reviewers; "N tickets queued" after a merge (ADR-422); a shape drawn on the map posted as GeoJSON. **For the user:** ADR-426's agent defaults (`SUMMARY.md` §4).
- **C101. What task 2.4.2's fourth part left** (ADR-427). **Every task that adds an endpoint:** the contracts' `endpoints` list is in path order (two methods of one path sit together), or `packages/contracts/test/endpoints.test.ts` fails on the OpenAPI listing. ~~**Task 2.4.3 (dispatch and phones):**~~ ✅ *(ADR-428; swept by ADR-522)* `GET /people?role=MONITOR` is the board's list of monitors; a list that pages copies it (`after` the last id, `limit`, `next`; one row more than the page is read to know whether another follows). ~~**Task 2.5.2 (a monitor created on a phone):**~~ ~~**→ 2.8.5 (ADR-522):**~~ ✅ *(ADR-527 (12): `PATCH /people/:userId` sets and clears both)* a monitor's employer and the employer's own ID for them (AC-02-03) have no request: `PATCH /people/:userId` changes neither. ~~**Task 2.7.3 (the security checklist):**~~ *(ADR-522: ✅ ADR-509…514; an authenticator's change told by mail: ✅ found built and tested since ADR-412, the sweep's reading wrong, ADR-530 (12))* ASVS 5.0 6.3.7 is answered for a password and a sign-in address (`people-changes.test.ts`, `password-set.test.ts`); a new authenticator and one cleared are told to nobody by mail yet. ~~**No task yet:**~~ **→ ~~2.8.5 (an address cleared, a contractor user out of the archive)~~ ✅ ADR-527 (12), 2.8.8 (the search) (ADR-522):** *(one person record: ADR-427 (4), with §4 at 2.8.9)* a search of people by name and an order by name; clearing an email address; a monitor made a back-office user as one person record (today a second record, ADR-427 (4), the user's to overturn); a contractor user whose contractor is archived comes out of the archive as they were. **Phase 4:** the people page reads `next` to page, shows the archived apart, and says which permissions a person made an admin still has beside them. **For the user:** ADR-427's agent defaults (`SUMMARY.md` §4).
- **C102. What task 2.4.3's first part left** (ADR-428). ~~**Part 2 (assignments):**~~ ✅ *(ADR-429; swept by ADR-522)* ✅ done, ADR-429 (its three questions decided there: changed at any time while it stands; a monitor or one of the back office; a phone out of service not named). Was: no service exists and the stories write them by hand (`dispatch-monday`, `sync`, `p1-field-days`, `certification`…): build `Assignments` in `apps/api/src/dispatch/` beside `Phones` (extend `SetupService`; ask `DispatchRights` inside the piece of work as `Phones.mayDispatch` does: lift that into a shared base when the second service needs it), spread `dispatch` in `endpoints.ts`, add each request to `phones.test.ts`'s list of what takes `DISPATCH` (or a file of its own with the same door test); an assignment is `PLANNED` with `madeById` the caller, never `UNPLANNED` (that is a phone's, 2.5.x); person, work date, project, `fieldEventKinds`, `certifying`, `formDocumentTypes` (four only), an optional site of the project's own, an optional phone, and its unit rate pay items (`AssignmentPayItem` repeats the pay item's `kindOfWorkId`; named once; taken off by archiving and put back); withdrawn by archiving; no uniqueness on person or phone and day (AC-02-29); a day's board read by project and date; whether an assignment may be changed after a phone took it, whether a monitor only may be assigned, and whether a phone out of service may be named, are decided there; the plain words for the constraints its requests reach go in `process/database-refusal.ts` (`assignment_origin_check`, `assignment_system_actor_check`, `assignment_form_document_types_check`, the two-column foreign keys, `assignment_pay_item`'s unique key); the stories then write the board through the service (C97's rule: no story writes by hand what a service does); copying a day to the next (AC-02-33) is Phase 4's unless it falls out. **A test that signs in then moves the clock** past five minutes loses its access token: set `served.clock.at` before `signedIn` (seen here). ~~**Task 2.5.1 / 2.5.x (enrolment and sync):**~~ ✅ *(ADR-454, 462, 473, 488; swept by ADR-522)* whether the master passcode's hash is keyed (today not, `hashWithoutKey`, so the installer still reads it back); each phone's `masterPasscodeVersion` moves at its sync (AC-02-23's other half), and a use of the passcode on a phone is a `MASTER_PASSCODE_USE` security event; revoking a key (`keyRevokedAt`) and refusing it (C47). ~~**Task 2.6.2 (reconciliation after a sync):**~~ ✅ *(ADR-472; swept by ADR-522)* a ticket already received from a phone whose clock ran ahead of the server's, with a work time after the removal, is not queued by the removal: it gets `PHONE_OUT_OF_SERVICE` at its next reprocess. ~~**Task 2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ASVS 5.0 7.5.1 is answered for the master passcode (`phones.test.ts`); 6.3.7 for it too. ~~**No task yet:**~~ ~~**→ 2.8.6 (ADR-522):** the passcode's 8 and 128 as policy values in `policy.env`, read by the installer too (two constants today, the domain's and `tools/setup`'s own); a phone renamed; a found phone put back in service; a removal time stated by hand; a lost phone made retired; a list of reasons for a removal.~~ ✅ ADR-530 (5), (13). **Phase 4:** the phones page shows which phones still hold an old passcode. **For the user:** ADR-428's agent defaults (`SUMMARY.md` §4), and Luis's *dispatch* grant in the golden mission's §1 and AC-02-10.
- **C103. What task 2.4.3's second part left** (ADR-429). **Every task that adds an endpoint taking `DISPATCH`** adds it to the exact list in `apps/api/test/phones.test.ts`; one open to the whole back office with no permission to the list in `people.test.ts`. **A service asks everything before it writes anything:** a test's piece of work has no savepoint, so a refusal thrown after a write leaves the row behind in the test (seen here), though never in the process. **A story writes a planned assignment with `assigned` (`packages/scenarios/src/stories/board.ts`)**, and a new P1 story has Luis's *dispatch* from `p1-field-days`. **Task 2.5.x (enrolment and sync):** an unplanned assignment received at a sync (its actor, C45; its id the phone's), and the phone's own amendments to it (a site move, a monitor switch); recording that a phone took an assignment, and how a change or a withdrawal made on the board reaches a phone that already holds it; the phone's lists for an assignment read its pay items named now (`archivedAt: null`). ~~**Task 2.4.5 (the viewer's path):**~~ ✅ *(ADR-434; swept by ADR-522)* no viewer reads the board (refused today). ~~**No task yet:**~~ **→ ~~2.8.5 (put back, a note)~~ ✅ ADR-527 (13), 2.8.8 (the search, the warnings) (ADR-522):** putting a withdrawn assignment back; a note on a withdrawal; a search of the board by person or phone across days and projects; a warning for a second assignment of one person or phone on a day, for a date outside the project's active window, for a closed project, for pay items named with no unit rate work, and for a site not yet activated or closed (none is judged today). **Phase 4:** the board's screen (planned against actual, AC-02-34; copying a day, AC-02-33, by reading it and writing each anew; the withdrawn apart; `GET /people?role=MONITOR` and `GET /phones` for its pick lists; a read of a project's sites and unit rate pay items is still owed, C99, C100). **For the user:** ADR-429's agent defaults (`SUMMARY.md` §4).
- **C104. What task 2.4.4's first part left** (ADR-430). ~~**Parts 2 to 4 of 2.4.4:**~~ ✅ *(ADR-431…433; swept by ADR-522)* a reviewer's endpoint spreads `reviewer` in `endpoints.ts` and names its one permission (`CORRECT`, `RENUMBER`; a certification's revocation is an admin's alone, `adminOnly`); it answers through `reviewed(request, outcome, shown, done)` (`apps/api/src/review/review-answered.ts`), which answers the service's `NOT_PERMITTED` as 403 with no words; a record's shape goes in `packages/contracts/src/review-answers.ts`; its test starts from `apps/api/test/review-marks.test.ts` (`p1WithTickets` makes field events through `BackOfficeRecords` as Dana, since a test has no phone; `luisHolds`; `jobsFor`), and **`people.test.ts` holds the list of every permission an endpoint takes** (`CORRECT` and `RENUMBER` join it on purpose). `review()` refuses a ticket locked as invoiced after the work has written (it must know the tickets touched): never reached in a test, which can't lock (below), and undone whole in the process. ~~**Part 2:** AC-10-37 wants the schema's refusal in plain words: the boundary answers `BAD_REQUEST` with a code only today (C86), so say which field with the error answer's `message` and nothing a caller sent.~~ ✅ ADR-431 (`notTaken`). ~~**Task 2.7.1 (the stories through the real endpoints):**~~ ✅ *(ADR-497, 499; swept by ADR-522)* a flag accepted, a completed load QC'd, locked as invoiced, put in a batch and unlocked through their requests, after the worker's run: the API's login writes no flag, status or completed load, so no test on the installation's database reaches them (proven at the services by `p1-reviewed`, `p1-voided`, `p1-invoiced`). ~~**Task 2.4.5 (the viewer's path):**~~ ✅ *(ADR-434; swept by ADR-522)* no viewer calls any of these (refused today). ~~**No task yet:**~~ **→ 2.8.8 (ADR-522):** reading the review queue, a ticket with its flags and marks, a project's invoice batches and what each holds (Phase 4's screens need these reads; none exists); renaming or archiving an invoice batch; QC or a lock for many tickets in one request (the mission locks thirteen: thirteen requests today). **Phase 4:** the screens read `reason` to say why, and `queued` for "N tickets queued". **For the user:** ADR-430's agent defaults (`SUMMARY.md` §4).
- **C105. What task 2.4.4's second part left** (ADR-431). ~~**Parts 3 and 4 of 2.4.4:**~~ ✅ *(ADR-431…433; swept by ADR-522)* a correction's endpoint follows `apps/api/src/review/corrections.controller.ts` (a body of `changes` with at least one stated and the note beside it; `stated(body.changes)` hands on only what was sent; a time arrives as text and is made a `Date` in the controller); its test starts from `apps/api/test/support/review.ts` (`p1WithTickets(...).created(kind, number, more)` makes any field event; `luisHolds`; `jobsFor`) and `corrections.test.ts` (`notTaken`, `audited`, `photographOf`); **a refusal by one of the database's checks ends the test's piece of work, so it is that test's last request**; each new constraint a request can reach gets its words in `process/database-refusal.ts`; `CORRECT`'s exact list of endpoints is in `corrections.test.ts` and grows on purpose. **Every task that adds an endpoint:** a schema's refusal is asserted by its words (`notTaken`), and a refine with no path reads "isn’t taken as it stands": give a refine a `path` where one field is to blame. ~~**Task 2.7.1 (the stories through the real endpoints):**~~ ✅ *(ADR-501; swept by ADR-522)* a correction refused for a ticket locked as invoiced, a corrected cert number finding its certification, a scale receipt two tickets share with one of them locked, and what the run concludes after each correction, through these requests (proven at the service by `p1-reviewed` and `p1-invoiced`). ~~**No task yet:**~~ **→ 2.8.8 (ADR-522):** *(a photograph's file ✅ ADR-483)* reading a field event with its lines, carried tickets and photographs, and a scale receipt (Phase 4's review screens need these reads; none exists); a photograph's file (2.6.4). **Phase 4:** the screens show `message` beside the field it names; an export leaves a removed photograph out or marks it (AC-04-102). **For the user:** ADR-431's agent defaults (`SUMMARY.md` §4).
- **C106. What task 2.4.4's third part left** (ADR-432). ~~**Part 4 of 2.4.4 (certifications):**~~ ✅ *(ADR-433; swept by ADR-522)* a new controller is named in `ApiModule` and its service handed over in `api-process.ts`; the helpers `notTaken`, `audited` and `newId` are `apps/api/test/support/review.ts`'s now; a body with a field the request doesn't take **and nothing else stated** is told both things, so a test of an unnamed field states one real field beside it; two tickets of one truck at overlapping times are neighbours and are queued together (a test that wants one ticket queued gives it another day); the lists of what takes *correct* and *renumber* are `corrections.test.ts`'s. ~~**No task yet (C79's three, still):**~~ **→ 2.8.7; the quarantined records' read 2.8.4; the forms' reads 2.8.8 (ADR-522):** an ROE's number corrected (its records re-pointed); the answers to a form's own fields corrected; an ROE, a survey, an incident or a drop-off log created in the back office: each needs a service first, then its request. ~~Also no task yet (**→ 2.8.4, ADR-522**): reading the quarantined records that wait, with what the phone sent and the record that holds the number~~ ✅ *(ADR-526: `GET /quarantined-records`)*; also no task yet (→ 2.8.8, ADR-522): reading an ROE, a survey, an incident and a drop-off log. ~~**Task 2.7.1 (the stories through the real endpoints):**~~ ✅ *(ADR-501; swept by ADR-522)* the mission's quarantined disposal renumbered, 101029 created in the back office and R-0008's scope corrected through these requests, with what the run concludes (proven at the services by `p1-reviewed`). ~~**Task 2.6.2 (sync):**~~ ✅ *(ADR-472; swept by ADR-522)* the sync endpoint is what quarantines; a test here makes a quarantined record by `Intake` directly. **For the user:** ADR-432's agent defaults (`SUMMARY.md` §4), first that a fix typed in the back office that can't be one is refused.
- **C107. What task 2.4.4's fourth part left** (ADR-433). ~~**Task 2.6.2 (sync):**~~ ✅ *(ADR-469; swept by ADR-522)* a certification made on a phone, and a modified truck certified again naming the one it replaces, arrive through `Certifications.certify` (C62): no back-office request makes or replaces one, and `certify` asks no permission of its own (whether the monitor's assignment includes certifying is flagged, never refused). ~~**Task 2.4.5 (the viewer's path):**~~ ✅ *(ADR-434, 502; swept by ADR-522)* no viewer calls any of the three (refused today); a viewer's read of a certification never shows the driver's phone or licence number (the database's view already leaves them out). ~~**Task 2.7.1 (the stories through the real endpoints):** the mission's corrected measurement and a revocation through these requests, with what the run concludes (proven at the services by `p1-reviewed`, `p1-left-out` and `certification`); the story `certification` still calls `Certifications.measure`, which asks no permission and is behind no request: move it to `Corrections.certification` there, then take `measure` out.~~ ✅ ADR-501, 502. ~~**No task yet:**~~ **→ 2.8.8 (the reads, with what a certification was saved with, ADR-472 (12)), 2.8.7 (the rest) (ADR-522):** reading a certification with its boxes, helpers and photographs, and a project's certifications (Phase 4's screens need these reads; none exists); a box's shape, sign or feature corrected, a box added or taken off (no service does); the rest of a certification corrected (its driver, tag, vehicle type, prime and subs: no service does); un-revoking. **A service that works through another service's queueing** says what was queued with `QueueingService.keep`. **For the user:** ADR-433's agent defaults (`SUMMARY.md` §4), ~~first whether the back office should be able to enter a certification from paper when a phone failed~~ answered "Yes" (ADR-521; task 2.8.7).
- **C108. What task 2.4.5's first part left** (ADR-434). ~~**Part 2 of 2.4.5:**~~ ✅ ADR-435. It was: every read is a method of `ViewerReads` (`apps/api/src/viewer/`) inside `this.viewed.$viewed(viewerId, …)`, its endpoint a GET that spreads `roles: viewerOnly` under `/viewer/…` and joins the exact list in `apps/api/test/viewer-reads.test.ts`; **a select names only columns the read-only login is granted** (`packages/db/test/support/viewers.ts` says which are hidden; the test "as the database's read-only login itself" calls each new read with a made-up viewer, so an ungranted column fails there); **the money, the private citizens' columns and the three names of setup are views the Prisma schema doesn't hold** (`viewer_transaction_money`, `viewer_roe_citizen`, `viewer_drop_off_log_citizen`, `viewer_pay_item_name`, `viewer_disposal_site_name`, `viewer_debris_type_name`, `viewer_field_event_monitor`): decide by ADR whether they are read with `$queryRaw` inside `$viewed` or declared in the schema as views (try `prisma migrate diff` stays empty first); a contractor user is refused `pay_item`, `disposal_site` and `form_debris_type` outright, so a ticket's names come from the three name views for every viewer; **what each viewer is shown through the API is proven by a story on its own database** (the read-only login sees nothing a test hasn't committed): `StoryDatabase.open` takes `'api' | 'worker'` and reads `DATABASE_URL`; the viewer's database needs `READONLY_DATABASE_URL` from `apps/api/.env`, pointed at the story's database; the mission's viewers must be issued and given P1 in the story (Bayline's client user, the auditor, Coastline's, Rivera's and Summit's contractor users); AC-10-29's "by its own id" is to be read (a ticket is its project, workflow and bare number; a field event and a completed load have ids). ~~**Task 2.7.1:**~~ ✅ *(ADR-496: signed in at a story's API; the container's door signs in no viewer while none is installed; swept by ADR-522)* the viewer's reads through the real endpoints in the container, where `door.test.ts` can sign a viewer in only if the installation holds one (`pnpm local:accounts` writes one; it has never been run for real here). ~~**Phase 4 (the portal):**~~ **→ 2.8.8 for the reads; the exports' columns and the page: REQ-408, REQ-412 (ADR-522):** a client user's and an auditor's read of setup, the setup check and the lookups (the database shows them setup already; no endpoint does), certifications, flags, the review queue, the exports' columns for a viewer marked not to see private citizens, and what a session tells the page about the viewer's kind. **Seen, left as it is:** the read-only pool is as large as the API's own (ten), so the two together may hold twenty connections; an admin who asks `/viewer/projects` is refused, not shown every project. **For the user:** ADR-434's agent defaults (`SUMMARY.md` §4).
- **C109. What task 2.4.5's second part left** (ADR-435). **Every later task that adds a read for a viewer:** a method of `ViewerReads` inside `$viewed`, its endpoint under `/viewer/…` open to `viewerOnly`, joining `viewer-reads.test.ts`'s exact list and its "read-only login itself" test; **money, a private citizen, a monitor and a name of setup only from a view declared in `packages/db/prisma/schema/viewer.prisma`** (a new one joins `viewer.test.ts`'s two lists; after declaring one, `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code` must still say `No difference detected.`); what each kind of viewer is answered is checked on the story `p1-viewed` (`story.viewed`), never on the installation's database. **Every later Prisma upgrade:** `views` is a preview feature of 7.10.0; if it changes, the fallback is `$queryRaw` inside `$viewed`, in `packages/db` only. ~~**Task 2.7.1:** the three reads through the real endpoints in the container, signed in as a viewer (the 404 for another contractor's ticket among them).~~ ✅ ADR-496 (`p1-viewed`, every read at `/viewer/…`, signed in at the viewer's browser). ~~**Phase 4 (the portal):**~~ **→ 2.8.8 for the reads (ADR-520 (3)); the exports and the page's filters: REQ-408, REQ-412 (ADR-522):** a ticket's flags, photographs, scale receipt, item lines, carried tickets, lock and batch; certifications; surveys, incidents and drop-off logs with `viewer_drop_off_log_citizen` (not declared yet); an ROE's parcel, address and scope; setup, the setup check and the lookups for a client user and an auditor; the exports; whether a page of tickets should cross workflows or filter by status or day. **Seen, left as it is:** a mistyped number (101060) is a ticket of its own to a viewer until a reviewer renumbers it; a `pg` deprecation warning printed from Prisma's adapter by several tests and stories (pg 9 will remove the call: look at it when `@prisma/adapter-pg` is next upgraded). **For the user:** ADR-435's agent defaults (`SUMMARY.md` §4), first whether a sub's contractor user should read its prime's name.

- **C110. What task 2.5.1's first part left** (ADR-436…438). ~~**Part 2:**~~ ✅ *(ADR-439; swept by ADR-522)* ADR-438 is a proposal: read the user's reply before building it; `DeviceKeys.kept` is what enrolment writes to `device.public_key` (never what was sent), and the stories' `story-key-…` strings are no keys, so they give way to software keys with part 3's harness phone; a wrong master passcode is a refused try by address (C93). ~~**Part 3:**~~ ✅ *(ADR-440; swept by ADR-522)* `PhoneProofRules.unspent` needs the made-at of the last challenge a phone answered on its own record (a column, written in the piece of work that takes the proof, compared and written under the row's lock so two answers to one challenge can't both pass); the token a proof gives and its lifetime (63B §5.1: made in answer to the proof, at least 64 random bits, timing out); a phone whose key is revoked (`keyRevokedAt`) is refused, one merely out of service is not (AC-10-46); a challenge is asked for by phone id by anybody, limited by address only. ~~**2.5.3:**~~ ✅ *(ADR-454; swept by ADR-522)* what a phone's own check of the master passcode is made from, and with it whether the server's hash is keyed (C90). **Phase 3:** the key in real secure hardware (the Secure Enclave hands over a 65-byte point: the app puts the fixed 26-byte header before it; Android's Keystore hands over SubjectPublicKeyInfo as it is); both sign in DER; **the browser test build's WebCrypto signs in the other form and must write DER**; attestation stays declined (ADR-240). **For the user:** ADR-438's two choices and ADR-437's defaults, in `SUMMARY.md` §4.
- **C113. What task 2.5.2's first part left** (ADR-441, 442). ~~**Part 2 (the monitor's sign-in):**~~ ✅ ADR-443: the reply read (none; built as proposed), a phone's try `DEVICE` on that phone, the session a row, `MONITOR_SESSION_HOURS`, the list of open endpoints unchanged, the log read; what it leaves is C114. Was: the user's reply to ADR-441 (6) read first; `WrongTries.wrong` writes with source `BACK_OFFICE` and no phone: a try on a phone states `DEVICE` and the phone; whether the monitor's session is a row (so that it ends at once, ASVS 7.4.1, 7.4.2) or a token read against the person on every request; a new policy value for its hours; `Sessions.signIn` already refuses a monitor (AC-02-39's web half), and `session-tokens.test.ts`'s list of open endpoints is unchanged by a `PROVEN_PHONE` one; AC-10-32's log read for a monitor's sign-in. ~~**Part 3:**~~ ✅ *(ADR-444; swept by ADR-522)* the assignment answered at sign-in by the project's own day (its time zone); the stories still write monitors by hand with the example world's IDs (`M004127`…): through `PhoneMonitors` the database issues the next of the series, so a story sets the series first or reads the ID it was given; `story.monitor(name)` beside `story.enrolled`. **Every later act under the master passcode** (2.5.4: a temporary session, a switch, an unplanned assignment, a monitor's password set anew on a phone) asks `MasterPasscodeCheck.check(passcode, now, deviceId)` and writes `used(tx, …)` in its own piece of work, counts the address under `atThePasscode`, and refuses by `MASTER_PASSCODE_REFUSED`. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ADR-441 (3) is the list of departures to carry into it (63B §3.1.1.2; ASVS 6.2.1, 6.2.4, 6.2.12, 6.4.1), each the user's accepted risk. **Phase 3:** the field app's "Create monitor" proves the phone first, then sends the passcode; it shows the Monitor ID it is answered. ~~**Phase 4:**~~ **→ ~~2.8.5 for the request~~ ✅ ADR-527 (12); the people page: REQ-415 (ADR-522):** a monitor's employer and the employer's ID have no request yet (the people page). **For the user:** the proposals of ADR-441 (6) and the agent defaults of ADR-442, in `SUMMARY.md` §4.
- **C114. What task 2.5.2's second part left** (ADR-443). ~~**Part 3:** the assignment answered at sign-in (`POST /phones/current/sign-ins`' answer grows, or a call open to `MONITOR_ON_PHONE` gives it), read by the project's own day; a monitor with no assignment told there is none; the stories make their monitors through `PhoneMonitors` and sign them in through `PhoneSignIns` (`story.monitor(name)`, `story.signedIn(monitor, phone)`).~~ ✅ ADR-444 (the answer grows); what it leaves is C115. **Every task that adds an endpoint a monitor calls on a phone:** its definition says `access: 'MONITOR_ON_PHONE'`, its controller reads `monitorOf(request)` (and `phoneOf` is the same phone), it joins the exact list in `phone-sign-ins.test.ts`, and its test signs in as that file does (`created`, `signedIn`; `served.ask(…, { bearer, monitorSession })`). ~~**2.6.2:**~~ ✅ *(ADR-467 (7), 472 (1); swept by ADR-522)* a monitor's records held to the monitor signed in on the phone that sends them (a record naming another monitor is the phone's own act under the master passcode, 2.5.4), and whether a sync needs a monitor signed in at all (a supervisor syncs a phone its monitor walked away from: ARCHITECTURE §8). ~~**2.5.4:**~~ ✅ *(ADR-462; swept by ADR-522)* a temporary session and a monitor switch under the master passcode end the phone's session as a sign-in does. ~~**2.6.5:**~~ ✅ *(ADR-488; swept by ADR-522)* a phone's monitor session after turn-in (revoking the key already stops it). ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ASVS 7.2.2…7.2.4, 7.3.1, 7.3.2, 7.4.1, 7.4.2 and 63B §2.2.3 for a monitor's session are answered by `phone-sign-ins.test.ts` and `sign-in.test.ts`; the hour of quiet not ending it is the departure ADR-441 (6)(b) names. **Phase 3:** the field app keeps the monitor's token in secure storage beside the phone's, sends both, signs in again when told `NOT_SIGNED_IN`, and keeps its own lock after inactivity (AC-02-40). **Phase 4:** a monitor locked online is shown to an admin (no mail tells anybody). **For the user:** the agent defaults of ADR-443, in `SUMMARY.md` §4.
- **C122. What task 2.5.4's first part left** (ADR-456, 457). ~~**Part 2 (a switch and a site move):** the user's reply to ADR-456 (5) read first; (5)(a)…(c) are proposals: a site move and a switch to a monitor with no assignment each a new unplanned assignment reported as part 1's is (`UnplannedAssignments.received`), a `DEVICE_SWITCH` event, and `AssignmentRules.takenAtSignIn` taking the one made on the phone last where several name it (today a planned one and an unplanned one on one phone for one day answer `SEVERAL_THAT_DAY`); a phone never changes an assignment by reporting it anew (the first stands), so an amendment is a new record or a call of its own.~~ ✅ (ADR-458; what it leaves is C123) ~~**Part 3 (under the passcode with a connection):**~~ ✅ *(ADR-462, 463; swept by ADR-522)* `MasterPasscodeCheck.check` and `used` as C113 says; the session a row marked as the passcode's (a column and its guard: ADR-443's guard lets a monitor's session be opened only as that monitor); the temporary session ending at the end of the project's day; what a phone being set up online picks from before anybody is signed in (projects, their sites and unit rate pay items, monitors) has no read yet. ~~**Part 4 (every other use the phone logged):**~~ ✅ *(ADR-464; swept by ADR-522)* a security event reported on its own needs an id of the phone's so a retried report writes none twice (part 1's ride on the assignment's id); which version of the passcode's check the phone used; wrong tries at the passcode on a phone and what the phone does after them offline (63B §3.2.10's ten; ADR-456 (3)(e): the field app proposes, Phase 3); REQ-202b and REQ-209's unplanned assignment ticked from what was seen. **Every later record a phone reports** carries the phone's instant, its offset and the server's received time, and where it is an act under the passcode is written with `underMasterPasscode(deviceId)` and guarded in the database to that actor and that phone, as `assignment_unplanned` is. **Every later endpoint open to a proven phone** joins `phone-proofs.test.ts`'s exact list. ~~**2.6.1, 2.6.2 (sync):**~~ ✅ *(ADR-467, 472; swept by ADR-522)* the sync may carry an unplanned assignment in its own payload by calling `UnplannedAssignments.received`, **before the records made under it** (a field event names its assignment by a foreign key); one answered `NOT_SAVED` leaves its field events with nothing to name: decide there what the phone is told of them. ~~**2.6.5:**~~ ✅ *(ADR-490; swept by ADR-522)* no limit of its own per phone (C93). ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ASVS 16.2.1, 16.2.2, 16.3.1 and 16.3.3 for what a phone reports are answered by `phone-unplanned-assignments.test.ts`, `packages/db/test/assignments.test.ts` and `sign-in.test.ts`; ADR-456 (3) is the list of departures to carry into it. **Phase 3 (the field app):** after setup under the passcode the phone keeps the report until it is answered `SAVED` or `ALREADY_SAVED`, sends it before the records made under it, and sends `madeAt` as a UTC instant with the clock's offset beside it. **Phase 4:** the board shows when an unplanned assignment was made and received (the answer doesn't carry them yet); who is shown the two security events. **For the user:** ADR-456 (5)'s proposals and ADR-457's agent defaults, in `SUMMARY.md` §4.
- **C127. What task 2.6.1's first part left** (ADR-466). ~~**Part 2 (the payload and its answer):** the batch takes each record as it comes and reads it with `syncedRecordSchema` on its own, so one that fails its schema gets its own answer and never refuses the others (AC-05-45); a schema's refusal may quote what was sent (the split suffix, four characters at most): decide whether the phone is told the domain's words or a code; a record whose monitor, project or assignment the server doesn't know, or whose assignment is another monitor's or was answered `NOT_SAVED` (C69, C84 (9), C122); the phone's clock; the last used numbers and the blocks answered; the batch's own size limit (C86); the answers `SAVED`, `ALREADY_SAVED`, `QUARANTINED` and `IntakeNote` as schemas (`sent.ts`'s `SyncAnswer` is still by hand).~~ ✅ (ADR-467; what it leaves is C128) ~~**Part 3:**~~ ✅ *(ADR-469; swept by ADR-522)* a certification as a synced record through `Certifications.certify`, with its photographs' records. ~~**Part 4:**~~ ✅ *(ADR-470; swept by ADR-522)* the harness's phones send what `syncedRecordSchema` reads (their records as JSON, without `source` and `deviceId`). ~~**2.6.2:**~~ ✅ *(ADR-472; swept by ADR-522)* the endpoint adds `source: 'DEVICE'` and the proven phone's id to each record read; a kept quarantine payload made before ADR-466 has no `typedCapacityCy` and is written with none. ~~**2.6.4:**~~ ✅ *(ADR-481; swept by ADR-522)* the photograph's record joins `syncedRecordSchema` once who makes its place in storage is decided; `SentPhoto` leaves `sent.ts` then. **Phase 3 (the field app):** a truck keyed in by hand sends the capacity typed; every nullable detail is sent, `null` where not recorded. **For the user:** ADR-466's agent defaults, in `SUMMARY.md` §4.
- **C126. What task 2.5.4's fifth part left** (ADR-464, 465). ~~**2.6.1, 2.6.2 (sync):**~~ ✅ *(ADR-467, 472, 488, 490; swept by ADR-522)* the sync may carry the uses a phone logged in its own payload by calling `PasscodeUses.received`, one a use, after the unplanned assignments and before the records; a report answered `NOT_SAVED` stays on the phone for a person to see. **2.6.5 (turn-in): the master passcode's use to sync and turn a phone in is a security event; REQ-202b is ticked there once it is seen** (a use with a connection is written by `MasterPasscodeCheck.used`; one the phone logged offline joins the domain's `loggedPasscodeUses` and `PasscodeLogRules.securityEventsOf`, the contract's `use` and the refusals in `phone-passcode-uses.test.ts`). ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-490, 509…514; swept by ADR-522)* ASVS 16.2.1, 16.2.2, 16.3.1 and 16.3.3 for a phone's own log are answered by `phone-passcode-uses.test.ts`, `packages/db/test/sign-in.test.ts` and the story `under-the-passcode`; nothing limits how often a proven phone may report (C125's question covers this call too); ADR-456 (3) stays the list of departures. **Every later security event a phone reports** carries its offset and is written with `underMasterPasscode(deviceId)`: the database refuses any other writer (`security_event_a_phone_reported`); one that is no act under the passcode needs that guard widened first. **Every later endpoint open to a proven phone** joins `phone-proofs.test.ts`'s exact list. **Phase 3 (the field app):** it logs each use with an id of its own and the phone's clock and offset, keeps it until answered `SAVED` or `ALREADY_SAVED`, never sends the passcode or what was typed; what it does after ten wrong tries offline (63B §3.2.10) is its to propose, and the passcode opening a sign-in locked by a monitor's wrong tries (ARCHITECTURE §7.2) is one more logged use. **Phase 4:** who is shown the security log, and a session opened offline shown as "authorised by the master passcode, for M004127" from the event's `masterPasscodeSession`. **Tooling:** `pnpm lint` runs ESLint with a 4 GB heap (ADR-465); if it outgrows that, split the run by workspace. **For the user:** ADR-464's agent defaults, in `SUMMARY.md` §4.
- **C128. What task 2.6.1's second part left** (ADR-467). ~~**Part 3 (a certification made on a phone):** it joins `syncedRecordSchema` as a seventh kind, so `recordRead`, the 200 and `recordAnswerSchema` take it as they stand; whether `Certifications.certify`'s own refusals need a fourth `NOT_SAVED` reason is decided there.~~ ✅ (ADR-469; what it leaves is C129) ~~**Part 4 (the suite):**~~ ✅ *(ADR-470; swept by ADR-522)* a client sends `SyncSent` and reads `SyncAnswered`; the suite holds that every part is sent (empty where there is nothing), that the answers are as many as what was sent and in its order, and that a phone keeps what was answered `QUARANTINED` or `NOT_SAVED`; the example records are `packages/contracts/test/support/synced.ts`. ~~**2.6.2 (the endpoint):**~~ ✅ *(ADR-472; swept by ADR-522)* its body is `syncSentSchema` and its answer `syncAnsweredSchema` with whatever it adds (fresh lists, a new passcode check); it reads the parts in the payload's order, each unplanned assignment through `UnplannedAssignments.received` and each use through `PasscodeUses.received`; each record through `recordRead`, then `source: 'DEVICE'` and the proven phone's id, then `Intake.receive`; **a record `Intake` throws on for the database's constraints (a foreign key, a check) is answered `NotSaved.namesNoRecord()`, never a 500 and never the database's words**, each record in its own piece of work so one refusal undoes nothing else; a record whose `assignmentId` is one this sync answered `NOT_SAVED` is answered `NotSaved.assignmentNotSaved()` without being tried; any other throw is still an error; the clock's difference kept on `Sync` from `clockAt`; `Intake.topUp` throws on a report it can't take today: the endpoint answers that series `toppedUp: false` with the blocks held before; the answer's `message` for `NOT_A_RECORD` is said to the phone, never logged with the record (ASVS V16). ~~**2.6.3…2.6.5:**~~ ✅ *(ADR-477, 481, 488; swept by ADR-522)* the edit log, a photograph's record and turn-in each add their own part to `syncSentSchema` or their own endpoint, decided there; an endpoint's own body limit was not needed (200 ordinary records are under half a mebibyte): look again when a photograph's record or a map's shapes ride a request (C86). **Phase 3 (the field app):** it splits what it holds into syncs of at most 200 records, 20 unplanned assignments, 100 uses and 20 series; it shows a record answered `NOT_SAVED` as not saved, with the message, and keeps it (AC-05-46); it never drops one because the server could not read it. **2.6.2, at the user's word (ADR-468): a record answered `NOT_SAVED` is held on the server for a person, in a table of its own** (`quarantined_record` cannot hold it: ADR-468 (3)); its fields, guard and viewer rule are decided there beside `Sync` and `SyncedRecord`; `SyncAnswer` gains its third value in `spec/DATA-MODEL.md` §4.5; the words `NotSaved` tells the phone and the comments in `sync.ts` and the domain's `intake.ts` ("kept nowhere on the server") change with it; it must not rely on a per-phone limit, which is 2.6.5's. **Phase 4:** the review queue shows a held record and who resolves it. **For the user:** ADR-467's agent defaults, in `SUMMARY.md` §4.

- **C129. What task 2.6.1's third part left** (ADR-469). ~~**Part 4 (the suite):** a certifying phone sends a `CERTIFICATION` record as any other (the examples are `certification` and `crew` in `packages/contracts/test/support/synced.ts`); the harness's phone certifies through the contract's shape, no capacity sent.~~ ✅ (ADR-470; the examples are now `packages/contracts/src/sync-examples.ts`; what it leaves is C130) ~~**2.6.2 (the endpoint):**~~ ✅ *(ADR-472; swept by ADR-522)* a record read as `CERTIFICATION` is given the proven phone's id and handed to `Certifications.received`, never `Intake`; `saved: false` is answered `NotSaved.certificationRefused(refusal.message)`; **`certify` does not ask whether the number is held or the replaced certification already replaced: the database's unique refusal is what it meets today**, to be answered `NotSaved.certNumberHeld(certNumber)` (ask before the write, or read the refusal: decided there, each record in its own piece of work); a foreign key or a check is `NotSaved.namesNoRecord()` as for any record (the prime not one of the project's primes among them: `certify` reads the prime with `findUniqueOrThrow`, which is neither); **a retry of a certification already saved is answered `ALREADY_SAVED` by its id before `certify` is tried** (`certify` would meet the primary key); a saved one's warnings (`SUB_PLACED_ELSEWHERE`) are the back office's to see, not an `IntakeNote` code today: decide there; the held table's reason takes `CERTIFICATION_REFUSED`; the driver's phone and licence number never in a log (ASVS V16). ~~**2.6.4 (photographs):**~~ ✅ *(ADR-481; swept by ADR-522)* the photograph's schema names `CERTIFICATION` among what a photograph belongs to, with its view only there (`Intake.photo` writes it today; `SentPhoto` is still by hand); a photograph may arrive before its certification is saved or while it is held: decide what it belongs to then. **Phase 3 (the field app):** it certifies with the domain's `Capacity` and sends the boxes, every measurement its shape doesn't hold as `null`; it shows a certification answered `NOT_SAVED` with the words and keeps it. **For the user:** ADR-469's agent defaults, in `SUMMARY.md` §4, first whether a duplicate cert number should be quarantined as a duplicate ticket number is.
- **C131. What task 2.6.2's first part left** (ADR-471). ~~**Part 2 (the service and the endpoint):** the service writes a `Sync` first, for the proven phone (`source: 'DEVICE'` and the phone stated: the database refuses any other writer for all three tables), with `clockDifferenceSeconds` the phone's clock less the server's in whole seconds (a `bigint` in Prisma; the database holds it within a second of the two instants); a ledger row (`SyncedRecord`: `recordId`, the contract's `record` word as `recordKind`, the sync, the phone, `SAVED` or `QUARANTINED`) in the piece of work that stores the record, never changed after; a retry found there first and answered `ALREADY_SAVED` (or `QUARANTINED` again), with `Intake`'s own look by id kept for records stored before the ledger; a record answered `NOT_SAVED` written as a `HeldRecord` (its payload exactly as sent, any JSON value; `sentId`, `projectId`, `sentMonitorId` only where they could be read; **the fingerprint's exact form decided there**, and the same phone and fingerprint again is the same row: read it or meet the unique key, never a second row); what becomes of a held record when the same record is sent again and saved (the database lets only a person resolve one); `NotSaved`'s words to the phone and the comments that say "kept nowhere on the server" (`packages/contracts/src/sync.ts`, the domain's `intake.ts`) change when a record is really held; a report answered `NOT_SAVED` is not held (ADR-468 speaks of records; C126).~~ ✅ (ADR-472; what it leaves is C132) ~~**Part 3:**~~ ✅ *(ADR-473; swept by ADR-522)* `setupVersionSent` is written once, after the lists are made (an update of that column alone passes; a second is refused); the worker reads a field event's sync through `synced_record` (`id` = the field event's id) and hands `clockOffAtSyncMinutes` and the policy value's `deviceClockOffLimitMinutes` to `TicketChecks` (both null today, `project-read.ts`, `reconciliation.ts`, `ticket-work.ts`); a record entered by the back office has no sync and no flag. ~~**Part 4:**~~ ✅ *(ADR-475; swept by ADR-522)* as C130. ~~**2.6.3…2.6.5:**~~ ✅ *(ADR-477, 481, 488; swept by ADR-522)* an edit, a photograph's record and turn-in each say whether they join the ledger (a new `recordKind` needs no migration). **Phase 4:** the review queue shows a held record (`viewer_held_record` for a viewer) and resolves one; who may, and the resolution's words, are decided there. **Every later test run moves `adms`'s Monitor ID series past 999,999:** a test asks for "M" and six digits or more, never exactly six (ADR-471 (8)). **For the user:** ADR-471's agent defaults, in `SUMMARY.md` §4.
- **C130. What task 2.6.1's fourth part left** (ADR-470). ~~**2.6.2 (the endpoint):**~~ ✅ *(ADR-472, 475; swept by ADR-522)* `Sync` takes the place of the harness's `SyncStandIn` (`packages/scenarios/src/sync-stand-in.ts`): a story's phone then syncs through the service (`SimulatedDevice.sync` hands `sends()` to it and what comes back to `answered()`), the stand-in and `SyncIntake` go, and the two stories that hold a phone's sync back (`p1-office`, `p1-any-order`) hold whole syncs or keep their own intake; **the harness's phone then sends its reports and its numbers in the sync** (`hold` carries them today only for the suite: `stories/board.ts`'s `unplanned` and `loggedUse` and each story's `Intake.topUp` are what it replaces, and a phone must then take in the blocks answered); the stand-in answers neither `ALREADY_SAVED` for a certification sent again nor a database's refusal (C128, C129 stand); **the endpoint's own tests answer what `syncAnswerRead` reads** (one answer for each thing sent, in its place, under its id: an API test may call it on the real answer); a held record's answer still says `NOT_SAVED`, so the suite stands as it is. ~~**2.6.3…2.6.5:**~~ ✅ *(ADR-477, 481…483, 489; swept by ADR-522)* a part added to `syncSentSchema` (the edit log, a photograph's record, turn-in) joins `SyncClientHolds`, `syncAnswerRead`'s places and a check of the suite; `SentPhoto` and the phone's by-hand photograph loop go with 2.6.4. **Phase 3 (the field app):** it runs `syncClientSuite` against its own store through a `SyncClient` of its own (the suite awaits `make` and `answered`); it reads an answer only with `syncAnswerRead`; whether a kept record is sent again by itself, by the monitor or only at "Sync and turn in" is its to propose (ADR-470 (3)). **For the user:** ADR-470's agent defaults, in `SUMMARY.md` §4.
- **C132. What task 2.6.2's second part left** (ADR-472). ~~**Part 3 (the answer's other parts, the worker):** `syncAnsweredSchema` gains what the answer carries besides the answers (fresh lists, a new passcode check), and `Sync.received` then writes `setupVersionSent` once on its own row as the device key's actor (`Synced.syncId` is there for it); the worker reads a field event's sync through `synced_record` (written for every record a sync stores since this part; **a record stored by a story's own intake has none**, so the flag has nothing to read there until part 4).~~ ✅ (ADR-473; what it leaves is C133) ~~**Part 4 (the harness):**~~ ✅ *(ADR-475; swept by ADR-522)* as C130, through `Sync` (`new Sync(db, { intake, certifications, unplanned, uses, numbers, clock })`, as `apps/api/src/process/api-process.ts` builds it); **every story's exact audit lists and job counts move then**, since a record a sync brings writes a `sync`, a `synced_record` and a job of its own (trigger `SYNC`), and the stories that call `Reconciliation.run` after a sync find those jobs waiting; **a database's refusal answered `NAMES_NO_RECORD` and held is told there as a story on its own database** (the API's test reaches it only behind a savepoint); two phones racing for one cert number (the unique refusal read by `Sync.refused`) can be told there too. ~~**2.6.3…2.6.5:**~~ ✅ *(ADR-477, 481, 490; swept by ADR-522)* a new kind of record names its `recordKind` to `ledgerRow` and says what it queues in `Intake`; a photograph's record still writes no ledger row (`Intake.photo`); **nothing limits how often a proven phone may sync or how many held records it may make by changing what it sends** (each changed thing is another held record, a mebibyte a call): the per-phone limit is 2.6.5's (ADR-468 (4)); turn-in confirms every record by these answers. ~~**2.7.2 (load):**~~ ✅ *(ADR-505, 506; swept by ADR-522)* a sync of 200 field events is 200 pieces of work, each with a neighbours read and a job: measure it; one job a sync is the alternative if it is slow (ADR-472 (6)). ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* `sync.test.ts` answers API1/API5 (the phone is the proven one, never stated), API4 (the limits, the held record once by fingerprint), ASVS V16 (the log's contents); a report's database refusal failing the whole call (ADR-472 (3)) is listed there. **Phase 3 (the field app):** it shows `NOT_SAVED` with the words, which now end "Held on the server for review."; it may send a kept record again (same fingerprint, nothing added). **Phase 4:** the review queue shows held records, tells one whose `sentId` has since been saved, and resolves one. **Every later endpoint open to a proven phone** joins `phone-proofs.test.ts`'s exact list. **For the user:** ADR-472's agent defaults, in `SUMMARY.md` §4.
- **C133. What task 2.6.2's third part left** (ADR-473). ~~**Part 4 (the harness):**~~ ✅ *(ADR-475; swept by ADR-522)* a story's phone already sends `holds` (`device.ts`: no passcode version, its project's lists) and the stand-in answers `masterPasscode: { version, check: null }` and no setup version; through `Sync` a phone that holds no passcode version is made a check (the story's `OfflineChecks` needs a signing secret; `p1-queued`'s last step states the version in force instead), and each sync that names its project writes `setup_version_sent` and may make a setup version (an audit row each, the device key's actor); the phone's `answered` could take the setup version in and say its lists are stale; every ticket a sync brings then has a difference to read, so **a story whose phone's clock is off the server's by more than five minutes gains `DEVICE_CLOCK_OFF` flags** (the harness's phones stamp the story's clock, so none should). ~~**2.6.5 (turn-in, per-phone limits):**~~ ~~**→ 2.8.6 (ADR-522):**~~ ✅ *decided no, ADR-530 (15), an agent default: it reads them at its next online sign-in* *(left by ADR-473, 474; 2.6.5 did not decide it)* **a phone that syncs with nobody signed in is told its lists moved and can't read them** (`GET /phones/current/lists` and `POST /phones/current/login-list` are `MONITOR_ON_PHONE`): decide whether a proven phone may read the lists of an assignment that names it (an unplanned one always does; a board's only where it names the phone), which is a rule about access (API1) and wants its own test of every assignment that is not that phone's. ~~**2.7.2 (load):**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: half 25 ms or less, the slowest 82 ms, at the burst)* each sync that names a project reads that project's whole setup to number it (`SetupVersions.shownIn`), as a read of the lists does: measure it with the 200 records. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* `sync.test.ts`'s two new tests answer NIST SP 800-63B-4 §3.1.1.2 for the check a sync brings and ASVS V16 for its log. **Phase 3 (the field app):** it says what it holds in every sync, takes a check in when one comes, and reads its lists when the setup version answered is not the one its lists are, and at each sync it can besides (a new certification or ROE moves no version). **Phase 4:** the review queue shows `DEVICE_CLOCK_OFF` with the difference; the firm may want the limit on the project rather than the installation (it is the installation's today). **A new policy value** joins `policy.env`, `policy.ts` (name, range, field, read), the four whole maps in `packages/domain/test/`, `project-settings.test.ts`'s list of names, `packages/scenarios/test/policy.test.ts`, and for the worker's own `apps/worker/test/process.test.ts`. **For the user:** ADR-473's agent defaults, in `SUMMARY.md` §4.
- **C135. What ADR-477 left** (the user's hard rule: a submitted record is sealed for its monitor). ~~**Whatever C128, C130, C131, C132 and C134 left "for 2.6.3" or "for edits" falls away:**~~ ✅ *(ADR-477; swept by ADR-522)* `syncSentSchema` gains no part for edits, the ledger no `recordKind` for one, and the harness's phone sends none. ~~**2.6.4, 2.6.5:**~~ ✅ *(ADR-481, 488; swept by ADR-522)* nothing a phone sends may change a record the server already has; a photograph's record and turn-in keep to that. **Phase 3 (the field app):** a record is sealed for its monitor at submit (Complete), before it syncs as after: no reopen, no edit, no "undo", and the app never sends a record again under its id with anything changed; one opened and not yet submitted stays on the phone, theirs to adjust across sign-outs and days (which monitor may then finish it after a switch is the app's to propose); a cancelled one stays on the phone (ADR-056). **Phase 4:** the back office's correction is the only way a submitted record changes (`Corrections`, ADR-364). **Open, not asked:** whether a field event that stood open for days should ever be flagged; today nothing flags it, and `OVERLAPPING_LOADS` may still catch a truck whose long-open collection spans its other loads.
- **C136. What task 2.6.4's first part left** (ADR-478…480). ~~**Part 2 (a photograph's record):**~~ ✅ *(ADR-481; swept by ADR-522)* the place the server makes must pass `MediaStore`'s form (segments of lower-case letters, digits, `.`, `_`, `-`, each beginning with a letter or a digit; 512 characters): a UUID in lower case does. ~~**Part 3 (the media endpoint):**~~ ✅ *(ADR-482; the store's own SHA-256 check, not tried → **2.8.4**; swept by ADR-522)* hand `MediaStore` to the process (`ProcessParts.media`, built in `api-process.ts` from `settings.media` and `policy.mediaStoreAnswerSeconds`, closed when the process stops; `ProcessSettings` gains `media`, and `support/process.ts`'s `madeUpSettings` with it); `keep` takes a file whole, in memory: a resumable upload needs more of the store (parts kept until the file is whole), and **each call it adds widens the identity's policy in `infra/local/compose.yaml` by exactly that and joins the identity's test**; `ALREADY_THERE` says only that something is kept under the key: the endpoint compares what is there with the record's fingerprint before it calls a retry done; ~~the store's own check of a file's SHA-256 was not tried (**→ 2.8.4, ADR-522**)~~ ✅ *(ADR-526: tried, `media-store.test.ts`; SeaweedFS refuses a put stating another SHA-256, and `MediaStore` sends none)*; `spec/THREAT-MODEL.md` T-25's proofs gain `media-store.test.ts` with the endpoint's. **Any task that changes who the store knows:** compose makes the store's container again only for `ensureStoreIdentities`' one case (the API's identity missing): a changed policy or key is picked up by `pnpm local:down`, then `up` (close-out always leaves it down). **A test of the store** tidies up as the stack's administrator (`test/support/media.ts`: `tidied`), since the API's identity can't; the bucket holds nothing after a run. **Phase 5a (the demo deploy):** the firm's own bucket with versioning or Object Lock, an identity with put and get alone, a deny on a put without `If-None-Match` where the store knows that condition (SeaweedFS 4.47 doesn't), path or host addressing (`forcePathStyle` is on today), and the region. **An installation made before part 1** needs `pnpm local:up`, then `pnpm installer --yes`, once (`pnpm ready` shows the `✗`). **For the user:** ADR-478's cut and ADR-480's defaults, in `SUMMARY.md` §4.
- **C137. What task 2.6.4's second part left** (ADR-481; C134's 2.6.4 line, C129's and C127's 2.6.4 lines and C82's photographs are done by it). ~~**Part 3 (the media endpoint):**~~ ✅ *(ADR-482; swept by ADR-522)* a file is taken by its photograph's id (the phone never names a place; the record holds `objectKey` and `depthObjectKey`, made by `photoPlaces`), only for a photograph the server has saved and that phone sent (a held one has no place); the uploaded file's SHA-256 against `uploadedSha256`; `uploadedAt` written once when the file is kept; the depth file beside it at `depthObjectKey`, where one was promised (`depthFile`), and **whether its own fingerprint needs a column** (none today); C136's points on `MediaStore`. ~~**Part 4 (the harness and the stories):**~~ ✅ *(ADR-483; swept by ADR-522)* the phone's `photograph` makes no file today (its fingerprints are of words): the harness's phone then uploads one, and `syncClientSuite` gains the photographs' own checks (a photograph never in a sync ahead of its record's; one answered `NOT_SAVED` kept and shown), each with a fault only it catches; `P1Syncs.photosArrive` sends the field days' photographs one per sync. **Phase 3 (the field app):** it sends a photograph's record in the sync that carries its record or a later one; one answered `OWNER_NOT_SAVED` it keeps and may send again once its record is saved; it says `depthFile` only where a depth file will be uploaded. **Phase 4:** the review queue shows a held photograph beside its held record, and one whose record was since saved. ~~**Not tried:** **→ 2.8.4 (ADR-522):** a phone that sends an upper-case UUID is given a lower-case place (`photoPlaces`), held by no test.~~ ✅ *(ADR-526: `held.test.ts`)* **For the user:** ADR-481's agent defaults, in `SUMMARY.md` §4.
- **C138. What task 2.6.4's third part left** (ADR-482; C136's and C137's part 3 lines and C84 (12) are done by it). ~~**Part 4 (the harness and the stories):**~~ ✅ *(ADR-483; swept by ADR-522)* the harness's phone makes a real file for each photograph it takes (its fingerprints are of words today, so `uploadedSha256` must become the SHA-256 of bytes the phone then sends) and sends it through `sendPhotoFilePartEndpoint` after the sync that saved its record, in parts, keeping it until it is answered `KEPT`; `NOT_MATCHED` sends it again from the first byte; `RECEIVING` with `received: 0` after a let-go starts it again; `syncClientSuite` gains the photographs' checks, each with a fault only it catches; an interrupted upload continued, as a story (AC-05-09); **the back office's read of a photograph's file** (AC-10-48's asked-for half): an endpoint for a signed-in reviewer that answers the bytes kept under the type they were kept under, with `X-Content-Type-Options: nosniff` and `Content-Disposition: attachment` or a sandboxing CSP, never run, and whether a client user or an auditor may ask (the viewer views hide where a file is kept); the answer is bytes, which the contracts' `answer` has no shape for yet. **Phase 3 (the field app):** a phone sends a part no larger than `MEDIA_PART_BYTES_AT_MOST`, smaller on a poor signal; asks `photoFileEndpoint` after a restart; says `depthSha256` only where it will send a depth file; the kinds of image (`photoFileTypes`) and the sizes are measured on real phones and may change. **Phase 4:** the review queue shows a file set aside (`set_aside_file`) beside its photograph, read from the store at its place; a person's resolution of one has no columns yet (as `held_record`'s). **Phase 5a:** several API processes each hold their own unfinished parts (a phone's parts reach one process, or start again): the deploy routes a phone to one, or accepts the re-sends; a lifecycle rule is not needed (nothing unfinished reaches the store). ~~**Not tried:**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: `photo-files.test.ts`, the last part sent twice at once)* two parts of one file sent at once to one process are taken one at a time (`PhotoFiles.oneAtATime`), held by no test. **For the user:** ADR-482's agent defaults, in `SUMMARY.md` §4.
- **C139. What task 2.6.4's fourth part left** (ADR-483; C138's part 4 line and C137's part 4 line are done by it). ~~**Part 5 (the map's files):**~~ ✅ *(ADR-484, 485; swept by ADR-522)* a map file larger than a request's body goes by its own route, as a photograph's does: `answersFile` and `file` are each one endpoint's today, and `endpoints.test.ts` holds both lists exactly. ~~**2.6.5 (turn-in):**~~ ✅ *(ADR-489; swept by ADR-522)* "Sync and turn in" waits for every file to be answered `KEPT` as it does for every record (`SimulatedDevice.holdsFiles`); a file set aside, or one whose photograph was not saved, stays on the phone and is named at turn-in; the per-phone limit counts parts already (`FILE_PARTS_BY_PHONE`). ~~**2.7.1 (the stories over HTTPS):**~~ ✅ *(ADR-492; swept by ADR-522)* a story's files then go to the stack's own bucket under the API's identity, which can't tidy them: a story tidies as the stack's administrator, as `photo-files.test.ts` does, or keeps `StoryMedia` for the stories that aren't about the store. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* `photo-files.test.ts`'s read tests answer ASVS V3.2.1, V3.4, V5.4, API1 and API3 for a file handed back; T-25's proofs gain the swapped file never handed back. **Phase 3 (the field app):** it runs `syncClientSuite`'s thirteen checks against its own store; it may ask `photoFileEndpoint` where a file stands after a restart, which the suite neither asks for nor forbids; part sizes and the kinds of image are measured on real phones. **Phase 4 (the back office):** it shows a photograph by fetching its file with the session's cookies and showing the bytes it was given (an attachment never opens as a page); a photograph whose file hasn't arrived says so; a file set aside is shown beside its photograph from `set_aside_file` (~~no endpoint reads one yet: **→ 2.8.4, ADR-522**~~ ✅ *ADR-526: `GET /set-aside-files`*). ~~**Open, not asked:**~~ **→ 2.8.8, with the viewers' reads of photographs (ADR-522):** whether a client user, a contractor user (its own tickets' photographs) or an auditor may read a file: the viewer views hide where a file is kept, so a viewer's read would be checked through `$viewed` and the file read as the API; decided when a viewer's screen needs one (agent default (d)). ~~**Not tried:** **→ 2.8.4 (ADR-522):** a type kept under that its bytes no longer agree with is refused by `PhotographFiles` and held by no test (the store keeps what `PhotoFiles` said).~~ ✅ *(ADR-526: `held.test.ts`)* **For the user:** ADR-483's agent defaults, in `SUMMARY.md` §4.
- **C140. What task 2.6.4's fifth part left** (ADR-484, 485). ~~**KD-76, for the user:** AC-10-47's "only the media endpoint takes a file"~~ ✅ the user kept the map's own route (ADR-486); the contracts' test and `photo-files.test.ts` hold the two exactly, and a third endpoint that takes a file is an ADR and those lists. ~~**2.6.5 (turn-in):**~~ ✅ *(ADR-489; swept by ADR-522)* nothing of the map's. ~~**2.7.2 (a burst, knowing it is well):**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: a GeoJSON of 15.9 MB read in 232 ms; a shapefile's ring pairs quadratic, bounded by `MAP_FILE_RING_PAIRS_AT_MOST`; a boundary of 100,001 corners about 2.3 s a run, left as it is)* how long a large map's file takes to read (`shpjs` compares every outer ring with every inner one of a shape: a file of hundreds of thousands of rings is slow, though bounded by the unzipped size), and how large a map version's boundary may be before the worker's reading of it at every run is felt; a time limit on reading a file, if one is needed. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* `map-files.test.ts` and `map-file-reader.test.ts` answer ASVS V5.2.1, 5.2.2, 5.2.3, 5.3.1, 5.3.2 and API4 for the map's file; T-25 gains a map's file swapped at the store. **Phase 4 (the back office's map screen, REQ-124b):** KML and an Esri layer's link; the preview of what a file holds on a map before it is loaded (the answer gives each layer's features, fields and problem; the shapes would need a read of their own); picking the zones' name field from `fields`; a drawn shape as GeoJSON in the request as today. ~~**Not built, no task yet:**~~ **→ 2.8.8 (the read), ~~2.8.5 (the column)~~ ✅ ADR-527 (10) (ADR-522):** a read of a kept map's file back; a site's shape version keeping its file's key (no column). **Seen, not chased:** a malformed `.shp` whose record says a negative length throws rather than loops (`shpjs`), checked by reading; both faults guarded here (ADR-484 (5)) are the libraries' own, and reporting them upstream is the user's call. **For the user:** ADR-484's and ADR-485's agent defaults (`SUMMARY.md` §4).
- **C141. What task 2.6.5 left** (ADR-487…490; KD-77). ~~**For the user:** KD-77~~ ✅ closed by the user, as built (ADR-495); the agent defaults of ADR-488…490 (`SUMMARY.md` §4). ~~**2.7.1 (the stories over HTTPS):**~~ ✅ *(ADR-492; swept by ADR-522)* a story's turn-in then goes through `POST /phones/current/turn-ins` with the phone's token; `story.underPasscode.turnIn` keeps the passcode out of every story. ~~**2.7.2 (a burst):**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: answered in 288 ms; the most one phone sent, 2 syncs and 501 parts, written down)* a turn-in names up to 10,000 records and 10,000 photographs: measure the confirmation's reads at that size; the per-phone count (600 a minute) against a phone syncing 200 records a call and its parts (`FILE_PARTS_BY_PHONE` is apart). ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* `phone-turn-ins.test.ts`, `devices.test.ts` and the suite's checks 14…16 answer NIST SP 800-63B's prompt invalidation, ASVS V16.3 for the passcode's use and the turn-in, API1 (a phone confirms only what it sent), API2, API4 (the bounds; the limit per phone) and API6; **REQ-204** is read whole there. ~~**Not tried:**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: both held by `story-api.test.ts`, the requests made to meet; both were 500s, now `401 PHONE_NOT_PROVEN`)* the share lock that orders a block cut against a turn-in at the same moment, and two turn-ins of one phone at once (each by reading). **Phase 3 (the field app):** it runs the suite's sixteen checks; it names held things by the SHA-256 of `sentCanonical`; on `wipe: true` it erases its store's data key (NIST SP 800-88 cryptographic erase) and its device key; a refusal of its proof right after asking to be turned in means it was turned in (nothing else revokes a key); it shows a supervisor the server's words and what is not on the server; ~~a report answered not saved keeps a phone from being turned in until a person resolves it (no resolution exists yet: Phase 4)~~ a report answered not saved is held on the server and confirmed at turn-in; a photograph held, or one whose file never came right, keeps the phone until a person closes it (✅ ADR-526). **Phase 4 (the back office):** the phones list shows when a key was revoked (it does); a held record, a held photograph or a file set aside resolved by a person is what lets such a phone be turned in (✅ the server's half, ADR-526; the screens stay Phase 4's); who sees `DEVICE_TURN_IN` in the security log.
- **C142. What task 2.7.1's first part left** (ADR-491, 492; C31 is done by it, and C139's and C141's 2.7.1 lines: a story's files stay in `StoryMedia`, its turn-in goes through the endpoint). ~~**Part 2 (a story's phone's other requests):** `story.enrolled`, `story.monitor`, `story.signedIn`, `story.underPasscode.choices` and `.session`, `story.lists`, and `board.ts`'s `taken`, `unplanned`, `loggedUse`, `sentAlone`, `synced` through their endpoints on `StoryApi` (a monitor's requests carry `x-adms-monitor-session` beside the phone's token); the runner's in-process services and `phoneNow` go; every exact audit list then gains what a request writes that the service didn't (a proof's `device` row before each); **a phone answers only a challenge made after its last**: a story that tells field days again on an earlier clock (`p1-office`'s `serverOn(fieldClock)`) must prove its phones in time order, or be re-told.~~ ✅ ADR-493 (the field days are told after their stories' start, so in time order; `board.ts`'s helpers already went through the endpoints). ~~**Part 3 (the worker drains the queue):**~~ ✅ *(ADR-493, 494; swept by ADR-522)* the worker's own job loop (`apps/worker/src/process/job-loop.ts`) run on the story's database and clock in place of each `Reconciliation.run` (`QueueRuns.settle`); C96's, C97's and C134's lines. ~~**Part 4:**~~ ✅ *(ADR-496…503; swept by ADR-522)* C104…C107's 2.7.1 lines and C109's (a viewer's reads through a story's API, signed in; ✅ ADR-496, the rest is C145's pieces). **Linux (a cloud session):** a process on the host's loopback can't be reached from a container there; `host-gateway` names the host, and the stories' API must then listen where the stack's network reaches it (its address a setting, never `0.0.0.0` on a shared machine): not seen; decide when a cloud session runs the stories. ~~**2.7.2:**~~ ✅ *(ADR-505: seen, left as it is; swept by ADR-522)* a story's API runs one at a time on one port, so stories can't run side by side. **For the user:** ADR-491's cut and ADR-492's agent defaults (`SUMMARY.md` §4).
- **C143. What task 2.7.1's second part left** (ADR-493; C142's part 2 line is done by it). ~~**Part 3 (the worker drains the queue):**~~ ✅ *(ADR-494; swept by ADR-522)* as C142 says; a story's phones are now wholly the API's, so only the runs and the back office's acts are still called in process. ~~**Part 4 (the back office's acts and the viewers' reads):**~~ ✅ *(ADR-496…503; swept by ADR-522)* as C142 says; ~~`first-admin` still makes its own `PasswordHasher`, `SessionTokens` and `WrongTries` (the server's command, not a phone's request: decide there whether it stays).~~ ✅ kept, ADR-502 (d). ~~**When 2.7.1 closes:** `apps/api`'s index still exports the phone services the stories no longer call (`Enrolment`, `PhoneMonitors`, `PhoneSignIns`, `SetupChoices`, `PasscodeSessions`, `PhoneLists`, `OfflineChecks`): trim what nothing outside `apps/api` reads, or keep it as the API's surface, by ADR.~~ ✅ trimmed, ADR-503. **No story reads a phone's login list** (`POST /phones/current/login-list`; the API's `phone-login-list.test.ts` proves it): a story of signing in offline is Phase 3's, with the field app. **A story that moves its clock back** before a phone's last proof is now stopped at that phone's next request of any kind, not only its sync: tell it again in time order. **For the user:** ADR-493's agent defaults (`SUMMARY.md` §4).
- **C144. What task 2.7.1's third part left** (ADR-494; C142's and C143's part 3 lines and C96's, C97's and C134's 2.7.1 lines are done by it: no story asks for a run, and `p1-left-out`'s 20, 14 and 26 stand). ~~**Part 4 (the back office's acts):** the corrections `p1-priced` and `p1-reconciled` still write by hand (`correct(…)`, an `api.$write` as Luis) go through their endpoints, and each by-hand job beside them (`queue.asked(…, 'CORRECTION')`) goes with them: the endpoint queues its own, neighbours too. **A reprocess a person asks for with nothing changed has no endpoint**: decide in part 4 whether it is an endpoint of Phase 2 or the review screen's in Phase 4 (C96's Phase 4 line).~~ ✅ ADR-497 (no endpoint in Phase 2: `QueueRuns.asked` adds a `REPROCESS` job; the review screen's in Phase 4). The lock `p1-priced` writes by hand (`invoiceLock.create`) is C146's 4c line. ~~**When 2.7.1 closes:** `Reconciliation.run`, the whole-project branch of `locked` and `RunOutcome`'s `ran: false` are called by nothing but the stories' `last.run` placeholders: trim them with C143's exports, or keep them, by ADR.~~ ✅ trimmed, ADR-503. ~~**2.7.2 (a burst):** `QueueRuns.settled` stops a story whose jobs took more than one run (over `JOB_TICKETS_AT_MOST` tickets); a burst reads `settle`'s count of runs instead.~~ ✅ ADR-505 (19 runs). ~~**For the user:** ADR-494's agent defaults~~ ✅ confirmed by the user (ADR-495); `Reconciliation.run` stays until 2.7.1 closes, as this line says.
- **C145. What task 2.7.1's part 4a left** (ADR-496; C109's 2.7.1 line is done by it). ~~**Pieces 4b to 4d (each moves a story's review acts onto `story.backOffice`):**~~ ✅ *(ADR-497…502; swept by ADR-522)* a person's act is `browser.answered(endpoint, …)` (or `asked`, for a refusal a story checks), signed in as `story.backOffice.admin({ id, email })` for Dana or `.person(danas, { id, email })` for anyone she created or wrote; **a person written by hand needs the address they sign in with** (`p1.ts`'s `danasEmail`, `luissEmail`; other stories' Dana and Luis have none yet); a grant a story still writes by hand (`tx.userPermission.create`) can stay or become `setPermissions` (Dana's request), and a manager/analyst's grant taken away refuses their very next request. **What changes in a check:** the door refuses a person without the grant as 403 `NOT_ALLOWED` with no words, before the service (the service's `NOT_PERMITTED` and its plain words are never sent); a domain refusal is 422 `NOT_SAVED` with the rule's own `reason` and `message`; a saved act answers `{ record, warnings, queued? }`, never the service's `reprocess`, so a story names its project itself; every act now writes a session's and a sign-in's rows (`session`, `user_credential` on a first password, a security event on an authenticator set up): **an exact audit list counting by table or by person moves** (the golden mission's `byPeople`, `p1-invoiced`'s, `p1-priced`'s): say why in the ADR, never loosen it. **An authenticator's code is good once a step:** a person whose sessions end (an admin ends them, their password set anew) signs in again only after the story's clock moves thirty seconds. ~~**4b:** C104's acceptance and C105's corrections; `p1-priced`'s and `p1-reconciled`'s by-hand corrections and jobs (C144); decide whether a reprocess asked with nothing changed is an endpoint now (C144).~~ ✅ ADR-497 (what it leaves: C146). **4c:** C104's QC, lock, batch and unlock (thirteen lock requests in the mission). **4d:** C106's quarantine, records made in the back office and R-0008's scope; C107's measurement and revocation (`certification`'s `Certifications.measure` moved to its endpoint, then `measure` out); `first-admin`'s own sign-in parts (C143); then C143's and C144's trims as 2.7.1 closes. ~~**Seen, left as it is:** `ViewerReads` is no longer called by any story (`apps/api`'s index still exports it: trimmed with C143's, or kept as the API's surface, by ADR).~~ ✅ trimmed, ADR-503. **For the user:** ADR-496's agent defaults (`SUMMARY.md` §4).
- **C146. What task 2.7.1's part 4b left** (ADR-497; C144's part 4 line and C145's 4b line are done by it; C104's acceptance and C105's corrections at the stories). ~~**4c (QC, the lock, a batch, the unlock):** `p1-priced`'s lock of 101004 written by hand (`invoiceLock.create`) goes through `lockAsInvoiced`, which locks only a ticket whole, `COMPLETED` and QC Approved: QC it at `setQcStatus` first (a QC mark writes an audit row and a `qc_mark`: say so where a check counts them); C104's QC, lock, batch and unlock in `p1-invoiced` and `golden-mission`. **The helpers to use:** `p1BackOffice(story, office)` (`danas()`, `luiss()`, `grantLuis(...)`, at `readPerson` and `setPermissions`) for a P1 story; `refusalOf(answer)` for a refusal (`403 NOT_ALLOWED`, or `422 NOT_SAVED · CODE: words`); `golden-mission` writes its own grants by hand (`tx.userPermission.create`) and needs Dana's and Luis's addresses if it doesn't read P1's.~~ ✅ ADR-500 (what it leaves: C148). **4d:** `p1-reviewed`'s by-hand lock (`invoiceLock.create`, line ~1431) and its grants, with C106's and C107's acts. ~~**When 2.7.1 closes:** `Voids`, `Acceptances` and `Corrections` are then made in process only by `p1-reviewed` (`p1-invoiced`'s and `golden-mission`'s moved in 4c, ADR-500) until 4d moves them: trim `apps/api`'s index exports with C143's, or keep them as the API's surface, by ADR.~~ ✅ ADR-503 (`Voids`, `Acceptances` trimmed; `Corrections` kept for AC-10-50). ~~**Phase 4:** whether the review screen offers "reprocess" with nothing changed, and with which grant.~~ The user decided (ADR-498): an endpoint now, *correct*'s, built in **4b2** ✅ ADR-499 (what it leaves: C147): ~~`POST` a project's tickets (or a set-aside job's id) to reprocess, one `REPROCESS` job, nothing changed, its answer `{ record, warnings, queued }` as a reviewer's; its test beside `review-marks.test.ts`; `CORRECT`'s exact list of endpoints (`corrections.test.ts`) and `people.test.ts`'s list grow on purpose; `pnpm openapi`; the stories' `queue.asked(…)` (`p1-voided` ×2, `p1-reconciled` ×4, `p1-priced` ×3) become Luis's requests (Luis holds *correct* first: `grantLuis`), and `p1-queued`'s by-hand job is read for whether it moves too; the worker's set-aside line (`apps/worker/src/process/job-loop.ts`) raised to `error` with `code: 'JOB_SET_ASIDE'` and, per job, its trigger, its tickets' count, its tries and the failure's kind (never `lastError`'s text), held by the worker's own test.~~ **Phase 4:** the review screen's "reprocess" button calls it. **For the user:** ADR-497's agent defaults (`SUMMARY.md` §4).
- **C147. What task 2.7.1's piece 4b2 left** (ADR-499; C146's 4b2 line is done by it). ~~**4c:** `p1-priced`'s lock of 101004, still by hand (`invoiceLock.create`), now comes after Luis's request for 101004 and before the run that takes it up, which leaves the locked ticket as it is: moved to `lockAsInvoiced`, it needs 101004 QC Approved at `setQcStatus` first, and must stay between the request and the run (the only story proving the worker's own look for a lock in its run).~~ ✅ ADR-500. **Kept by hand on purpose:** `p1-queued`'s setup-change jobs (`queued(dana, 'SETUP_CHANGE', …)`) and its records job, to show the worker's side alone; no setup endpoint names tickets that way. **Phase 4:** the review screen's "reprocess" button calls `reprocessTickets`; **nothing lists the set-aside jobs yet**: a person finds one's id in the worker's log (`JOB_SET_ASIDE`); a page or a read of them is the back office's (Phase 4), or 2.7.2's health answers (C38) if the queue's state belongs there. **Later (ADR-498):** an alert to an admin for a job set aside. ~~**When 2.7.1 closes:**~~ ✅ *(ADR-503; swept by ADR-522)* nothing of 4b2's is exported for the stories alone. **For the user:** ADR-499's agent defaults (`SUMMARY.md` §4).
- **C148. What task 2.7.1's piece 4c left** (ADR-500; C146's and C147's 4c lines are done by it). ~~**4d:** `p1-reviewed` is the last story making review acts in process (`QcMarks`, `InvoiceLocks`, `Voids`, `Acceptances`, `Corrections`, and its by-hand lock, `invoiceLock.create`, and grants); move them onto their endpoints with C106's and C107's acts, as `p1-invoiced` now does (`byLuis`/`byDana`, `qcing`, `locking`, `refusal` over `refusalOf`). **A lock's or a QC mark's answer names a unit rate ticket `unitRateTicketId`** (the service's row says `fieldEventId` and `fieldEventKind`): read the kind from the row where a check states it, and a check of "no key names money" must not take that id for a rate.~~ ✅ ADR-501 (4d1, `p1-reviewed`; what it leaves: C149). ~~**When 2.7.1 closes:** `QcMarks` and `InvoiceLocks` join `Voids`, `Acceptances` and `Corrections` in C146's line: called by no story once 4d moves `p1-reviewed`'s; trim `apps/api`'s index exports with C143's, or keep them as the API's surface, by ADR.~~ ✅ trimmed, ADR-503. ~~**No task yet (C104's, still):**~~ **→ 2.8.8 (ADR-522):** QC or a lock for many tickets in one request (the mission makes thirteen lock requests and thirty QC requests). **For the user:** ADR-500's agent defaults (`SUMMARY.md` §4).
- **C149. What task 2.7.1's piece 4d1 left** (ADR-501; C148's 4d line, C106's 2.7.1 line and C107's measurement on `p1-reviewed` are done by it). ~~**4d2:** the story `certification` still calls `Certifications.measure` (×2, one refused for a height of 0) and `Certifications.revoke` (×2, one refused with no reason), and `p1-left-out` `revoke` (730499, "Tailgate missing"): move them to `correctCertificationBox` (`ids: { certificationId, position }`, `json: { changes, note }`; box 0 is the primary) and `revokeCertification` (an admin's alone: Dana's browser; `json: { from, reason }`), then take `measure` out of `Certifications` (C107); a refusal becomes `refusalOf`'s `422 NOT_SAVED · CODE: words` (a blank reason may be the schema's `400` before the rule: say so in the ADR, never loosen the check); an act's answer counts what it queued, so read a job's tickets from its rows as `p1-reviewed`'s `jobTickets` does; then decide `first-admin`'s own `PasswordHasher`, `SessionTokens` and `WrongTries` (C143), by ADR.~~ ✅ ADR-502 (what it leaves: C150). ~~**4d3 (2.7.1 closes):** C143's, C144's, C146's and C148's trims;~~ ✅ ADR-503. **`Corrections` is still called in process by one check, on purpose** (`p1-reviewed`'s AC-10-50, its job queue made to fail over the API's client, which no request can do): keep it exported for that, or move that check to an API test that hands the process a failing queue, by ADR. **Seen, left as it is:** P2's setup by Luis, the contractor merge and every certification in the stories are setup and phone services in process (`ContractorSetup`, `FormSetup`, `PayItemSetup`, `SiteSetup`, `Certifications.certify`); no task of 2.7.1 names them, and a certification made on a phone arrives with its sync (C107). **For the user:** ADR-501's agent defaults (`SUMMARY.md` §4).
- **C150. What task 2.7.1's piece 4d2 left** (ADR-502; C149's 4d2 line, C107's 2.7.1 line and C143's `first-admin` line are done by it). ~~**4d3 (2.7.1 closes):** C143's, C144's, C146's, C148's and C149's trims;~~ ✅ ADR-503 (`Corrections` kept, ADR-503 (b)). **`first-admin` keeps its own `PasswordHasher`, `SessionTokens`, `WrongTries`, `Sessions`, `TwoStepCheck` and `People`, by ADR-502 (d)**, and `office-browser.ts` reads `ServerAdmin`, `PasswordHasher` and `OneTimeCodes`: those stay exported. `Certifications` stays exported (every story certifies through it, C149's seen line); its `revoke` and `measured` are now called by no story, only by the controller and `Corrections.certification`. **Seen, left as it is:** five stories still write a grant by hand in their opening world (`p1-field-days`, `dispatch-monday`, `under-the-passcode`, `sync`: Luis's *dispatch*; `setup`: a person's Setup); they are setup, not review acts, and no task of 2.7.1 names them. **For the user:** ADR-502's agent defaults (`SUMMARY.md` §4).
- **C151. What task 2.7.1 left as it closed** (ADR-503; C143's, C144's, C145's, C146's, C148's, C149's and C150's trims are done by it). **The rule now held by a test:** `apps/api`'s and `apps/worker`'s indexes export only what `packages/scenarios` and `infra/local` read (`packages/scenarios/test/app-exports.test.ts`): a story that stops calling a service takes it out of the index in the same task, and a new reader of either app joins the test's folders on purpose. **Kept in process on purpose:** `Corrections` for AC-10-50 (ADR-501 (b)); `first-admin`'s sign-in parts (ADR-502 (d)); the setup services, `Certifications`, `NumberAllocator`, `Assignments` and `Phones` (every story's opening world and board). ~~**2.7.2 (a burst):** C144's line stands: `QueueRuns.settled` stops a story whose jobs took more than one run; a burst reads `settle`'s count of runs.~~ ✅ ADR-505. **Phase 3:** a story of signing in offline (the login list, C143). **For the user:** ADR-503's agent defaults (`SUMMARY.md` §4).
- **C152. What task 2.7.2's part 1 left** (ADR-504). ~~**Part 2 (the burst):** the harness's phone answered `429 LIMITED` stops the story today (`answered` throws on anything but a 200): it waits the seconds it is told, on the story's clock, and sends again what it holds; a burst's phones each fill their syncs by weight now, so a phone with a day's records typed in full sends several.~~ ✅ ADR-505. **Phase 3 (the field app):** a record kept under `syncedRecordBytesAtMost` as it is made, a form's own answers bounded as a whole as they are typed, so nothing a monitor submits is held for its weight; the field app fills its syncs with `fitByWeight` and passes the suite's seventeenth check. **Phase 4:** a record held for its weight shows the person why in the review queue's words (`NOT_A_RECORD`, "it weighs more than a record may"). **For the user:** ADR-504's agent defaults (`SUMMARY.md` §4).
- **C153. What task 2.7.2's part 2 left** (ADR-505; C152's part 2 line and C144's and C151's 2.7.2 lines are done by it). ~~**Part 3 (the queue at that size, C96's 2.7.2 line):** the burst's own project is the one to time it on: its 1,000 tickets came as 4,631 jobs (a field event's and a photograph's each, with neighbours) and took 19 runs of at most 200 tickets, about 58 s on the user's Mac (a ticket worked several times over as its jobs come in different runs); read the neighbour read and whether 200 is right there, never assert a time.~~ ✅ ADR-506. ~~**Part 4 (health):**~~ ✅ *(ADR-507; swept by ADR-522)* C38's line stands. **Phase 3 (the field app):** it waits out `429 LIMITED` as the harness's phone does (the seconds the answer says, then the same again under the same ids; ten in a row is a fault, not a busy server) and a top-up not taken leaves it its block, topped up at a later sync; propose a check of the sync contract's suite for it when the field app is built. **Not measured here:** photographs at their real size (4 KiB files: the requests are counted, not the bytes) and a network's own time (all on one machine); the story's clock stands still while the API answers, so a wait is every phone's and the measured waits are the fewest a burst can meet. **For the user:** ADR-505's agent defaults (`SUMMARY.md` §4).
- **C154. What task 2.7.2's part 3 left** (ADR-506; C153's part 3 line and C96's 2.7.2 line are done by it). ~~**Part 4 (health):** C38's line stands; the worker's health answer already counts jobs waiting and set aside.~~ ✅ ADR-507 (C155). ~~**When a project's size is measured to need it (no task yet; the demo deploy's load, 5a, is the first real size):**~~ ~~**→ 2.8.2, measured at the burst; the index only if the measure asks (ADR-522):**~~ ✅ *(ADR-524: the plan was a sequential scan of every field event; both indexes added, an index scan now)* the neighbour read scans `field_event` by `cert_number` and by `scale_receipt_id` (no index; about 4 ms a record over 2,000 field events, growing with every field event of the installation) and the void tickets by `status`; an index on `(project_id, cert_number)` and `(project_id, scale_receipt_id)` is a migration with its ADR then. Every run reads the whole project before its tickets (0.2 s here, the most of a run of one ticket); at a mission's size that read, not the run's 200 tickets, is what to measure next. **Not measured here:** a first working's own time apart from the drain's (the map server asked for each mileage: about 7.5 s a run of 200 against 1.3 s re-worked), a burst where neighbours are found (no two loads of a truck overlap in the burst; the carried-number and scale-receipt reads found nothing to read), and anything over a network. **For the user:** ADR-506's agent defaults (`SUMMARY.md` §4).
- **C155. What task 2.7.2's part 4 left** ✅ **closed by ADR-517** (the third full `pnpm scenarios` passed whole, `burst` among them; the pool-wait proposal moved to C162) (ADR-507; C38's Phase 2 part, C85's 2.7.2 line and C154's part 4 line are done by it). ~~**Task 2.7.3 (the security checklist):**~~ ✅ ADR-509 (`spec/CHECKLIST-API.md` §1) `/readiness` is a second `ANYBODY` endpoint that touches the database: its item is that it answers only up or down, is counted by address, and asks the database once at a time (`health.test.ts`). **The demo deploy (5a):** C38's rest (its entry says what); a deploy's proxy or monitor asks `/readiness`, never `/health`, for whether to send the API work; the worker's answer reached from outside its host if the firm's monitor needs it. ~~**A finding to look into (no task yet; raise it with 2.7.3 or before 5a's load):**~~ ~~**→ 2.8.2 (C162 (c)); the story's API keeping its error lines with it (ADR-522):**~~ ✅ *(ADR-524: told to wait, `503 BUSY`; the error lines were ADR-512's already; the cause, the story's API on a pool of 2)* once, in a full `pnpm scenarios` run (2026-10-13), the story `burst` stopped at `syncPhone was answered 500 INTERNAL_ERROR`, one of 54 phones' syncs at once; `burst` alone, and a second full run with the story API's error lines captured, passed with no error line. The story's API logs nowhere (`story-api.ts`), so the next time it is seen nothing says why: **a story run could keep its API's error lines** (kind and frames only, as the log is) to read when a story stops on a 500. ADR-505 found one race of this shape (`SeriesMovedOn`); this may be another. **For the user:** ADR-507's agent defaults (`SUMMARY.md` §4). **Seen again, its cause named (2026-10-14, ADR-513's run):** in the full `pnpm scenarios`, `burst` stopped on `syncPhone` answered 500; the stories' API logged (ADR-512's lines working) Prisma's `P2028` three times, a transaction that couldn't start in time (the pool's wait), from `NumberAllocator.writeAs` in `Sync.toppedUp`, `Sync.setupVersion` and `PhoneLoginList.passcodeBrought`; `burst` then passed alone three runs of three. **A sync under a burst can wait longer for a connection than Prisma's transaction allows, and is answered 500 where it should be told to wait** (a phone sends again, so nothing is lost). For a task (proposed: a pool wait answered 503 or 429 with `Retry-After`, as a limit is, and the pool's size and wait measured at the burst; ADR to come); not changed by ADR-513.
- **C156. What task 2.7.3's part 1 left** ✅ **closed by ADR-517** (the third full `pnpm test` passed whole, its output kept; the field app's own checklist stays Phase 3's, as written below) (ADR-508; REQ-205 and AC-10-56 done by it). ✅ ADR-509 (T-51 reworded; the layer items named): T-51 said the dev stack's seeded accounts are "named on the scan's allow-list"; there is no such list: they are held out of what ships by `infra/local/test/dev-accounts.test.ts` (AC-10-26), and their values match no rule of the scan. Reword T-51's row with the checklist. ASVS 5.0's V1 (encoding and sanitization) and V15's items on reaching data through one layer are what part 1's check answers: name them by number there. ~~**Part 3, or with C155's finding:**~~ ✅ *(ADR-517; swept by ADR-522)* in the first full `pnpm test` of 2026-10-14, two tests of `packages/scenarios/test/story-api.test.ts` failed ("a phone the story enrolled proves itself there…" and "a request on the story's clock and one on another, at once…"); the file alone (14 of 14) and the next full run (2,907 of 2,907) passed. Their text was not kept. Like C155's `burst` 500, it was seen once in a full run beside other projects; the next time, keep the run's whole output (`pnpm test > <scratchpad>/test.log 2>&1`). **Phase 3:** a phone's private key never leaves its secure hardware, so the JWK rule guards only against a test's or a developer's key; the field app's own checklist (MASVS) is Phase 3's. **For the user:** ADR-508's agent defaults (`SUMMARY.md` §4).
- **C157. What ADR-511 left** (the user's four answers to the checklist). ✅ **Built by task 2.8.6 (ADR-530 (1), (3), (10)): the firm's settings record, `PATCH /firm-settings/viewer-two-step` (an admin alone), a viewer with none sent to set one up at their very next request.** **Back to Phase 2, task 2.8.6, REQ-215 (ADR-519): the firm-wide settings record is built there for the user's #4 anyway.** ~~Re-filed at Phase 2's exit to Phase 4, the read-only portal's sign-in (REQ-408; ADR-518, an agent default): no viewer signs in to a page before the portal exists.~~** ~~A task of its own, Phase 2 (before 2.8, or the first of Phase 4's sign-in work if the user prefers):~~ **the firm chooses whether read-only viewers must use two-step** (ASVS 6.3.3; the user, 2026-10-14: "let the firm choose"; shipped default optional, as ADR-170 has it). Today `packages/domain/src/two-step.ts` fixes `READ_ONLY_VIEWER: 'OPTIONAL'` and there is no firm-wide settings record, so it needs: where a firm-wide setting lives (a record and its guard migration, its audit), the sign-in reading it (a viewer with none set up is then sent to set one up, as staff are), an admin's endpoint to change it (who may: an admin alone, proposed), and what happens to a viewer already signed in when it is turned on. Its ADR decides each. **The demo deploy (5a):** its proxy refuses plain HTTP at the API's name, unanswered, and sends HSTS with `includeSubDomains`, as the local stack's does (ADR-511; C38's 5a line).
- **C158. What task 2.7.3's part 3 left** (ADR-512; AC-10-27, REQ-204, C155's 2.7.3 line and C156's part 3 line are done by it). ~~**For the user, first:** the 78 proposed answers, and KD-78.~~ ✅ ADR-513 (§3.1 approved whole; every hop encrypted, part 5). ~~**Part 4:**~~ ✅ *(ADR-513; swept by ADR-522)* build what the user approves; each scenario's test asked as `every-endpoint.test.ts` asks (a body or a query no schema takes, so nothing is written); ~~16.3.2's row first finds whether the door's refusals are logged today (not read in part 3).~~ ✅ ADR-513 (they weren't; now they are, AC-10-66). **C155's 500 in `burst`:** not seen again (this run's `burst` passed); a story stopped on a 5xx now ends with its API's last five error lines (`StoryApi.kept`, the log's own kind and frames), a path no test drives, since nothing in a story makes the API fail on purpose. **C156's two `story-api.test.ts` failures:** not seen again in a full `pnpm test` with its output kept. Both stay open as findings, closed if three more full runs pass. **The endpoint list:** a new endpoint now fails `every-endpoint.test.ts` until its line is added there (C86's recipe gains that step). **For the user:** ADR-512's agent defaults (`SUMMARY.md` §4).
- **C159. What task 2.7.3's part 4, first piece, left** (ADR-513; C158's user answers and 16.3.2 line are done by it). ~~**Part 4, next piece (the other 57 of §3.1)**~~ ✅ in part, ADR-514: the phase, not-used and §3.1 built items done; the docs, §2's built rows and API10 carried to C160. Was: each **docs** answer written where §3.1 says (ARCHITECTURE §6's ways in, for 6.1.3; the keys and their lives, 11.1.1, 11.2.2; the log inventory, 16.1.1; the uploads, 5.1.1; the heavy functions, 15.1.3; what the API talks to, 13.1.1, 14.2.3; the data's levels, 14.1.1, 14.1.2; 2.1.2, 2.1.3); each **phase** item told in its brief or REQ (1.3.3, 3.5.4, 7.5.2 to Phase 4; 15.1.1, 15.2.1, 16.4.2 and 4.2.1's, 12.1.2's, 13.4.1's, 14.2.2's deploy halves to 5a; 5.4.3's scan to 5a as the firm's option); each **not used** confirmed by grep and marked (1.3.5, 1.3.7, 1.3.10, 6.4.2, 6.5.2, 6.5.4, 7.6.2, 13.4.3); every **built** row of §3.1 and the 25 built items of §2 each a file 10 row or a cited test (15.3.5 with `eqeqeq` confirmed in the lint config); API10:2023's map servers' and mail sender's answers proposed. Then §2's counts. ~~**Part 5:**~~ ✅ *(ADR-517; swept by ADR-522)* KD-78 (BACKLOG 2.7.3), 12.3.3 and 15.3.2. **For the user:** ADR-513's agent defaults (`SUMMARY.md` §4). **C155, C156** stay open until three more full runs pass.
- **C160. What task 2.7.3's part 4, second piece, left** (ADR-514; C159's phase, not-used and §3.1 built items done by it). ~~**Part 4, next piece:**~~ ✅ *(ADR-515; swept by ADR-522)* the 14 **docs** answers where §3.1 says: 6.1.3 (every way in, one table, ARCHITECTURE §6); 11.1.1, 11.2.2 (each key, its life, how it is replaced and data re-encrypted: the signing secret, the two-step sealing key, the offline checks' seed, a phone's key, the passcode's versions; NIST SP 800-57's terms); 16.1.1, 16.2.3, 16.2.4 (the log inventory: one JSON line per event on standard output, per service, and the security events' table); 5.1.1 (the two uploads); 15.1.3 (a sync, a map's file, a run, with ADR-504, 506's figures); 13.1.1, 14.2.3 (what the API and the worker talk to, and that personal data goes only to the firm's own servers); 14.1.1, 14.1.2 (the data's levels); 2.1.2, 2.1.3. Then §2's 25 built items (those before ADR-514) each a file 10 row or a cited test, read again (some name a test already: confirm each), and API10:2023's map servers' and mail sender's answers proposed. ~~**Part 5:**~~ ✅ *(ADR-517; swept by ADR-522)* KD-78, KD-79 (4.2.1: Caddy, Postgres, the object store and the address server hardened as far as each image allows, a test of `compose.yaml`), 12.3.3, 15.3.2. **For the user:** ADR-514's agent defaults, first 11.4.1's departure (`SUMMARY.md` §4). **C155, C156:** this session's full `pnpm test` (2,923 of 2,923, output kept) and `pnpm scenarios` (22 of 22, `burst` among them) passed: one of the three more full runs each. **The local stack's volumes were found new this session** (all six made at 13:07 on 2026-10-14, `infra/local/.env` and the env files kept): the installation was resumed by `pnpm installer` with a new random master passcode. If the user wiped them on purpose, nothing is lost; if not, Docker's disk (8 GB) is the first suspect.
- **C161. What task 2.7.3's part 4, third piece, left** ✅ **done by ADR-517**, but for what it gives Phase 5a (REQ-517, below) and finding (a), carried to C162 (ADR-515; C160's docs, built-rows and API10 lines done by it). ~~**Part 5:**~~ ✅ *(ADR-517; swept by ADR-522)* KD-78, KD-79 (4.2.1), 12.3.3, 15.3.2, and **API10's two answers as proposed** (`spec/CHECKLIST-API.md` §5.9): the worker's `MapServers` holds an answer to a size in bytes, times the whole exchange (`AbortSignal.timeout`, as `AddressServer` does), and checks each value before taking it (a road point's two coordinates finite and in range, written as exact decimals; a route's length a finite number of miles at zero or more), anything else a fault so the job waits; a test on an HTTPS server that answers wrongly (too large, too slow, a length that is a string, negative or `NaN`); and a test that a mail server's refusal leaves a reset asked for answered as one that wasn't, with no word of the server's in the log. **Phase 5a (REQ-517):** a key replaced in place with its data re-sealed (the signing secret's purposes kept apart by `keyid` and `v1.`, a new one beside the old until each hash and seed is re-made; a service's password changed without a new installation), in the operator's guide, with the key in hardware ADR-411 (4) leaves to the deploy. **For the user:** ADR-515's agent defaults and ADR-514's, first 11.4.1's departure (`SUMMARY.md` §4). **C155, C156:** this session's full `pnpm test` (2,923 of 2,923, output kept, on its second run) and `pnpm scenarios` (22 of 22, `burst` among them) passed: the second of the three more full runs each; one more each closes them. ~~**Two findings of the stack (ADR-515 (iv), (v)), no task yet:**~~ **→ (a) an observation, as C162 (b); (b) 2.8.3 (ADR-522):** (a) after `pnpm ready`, plain HTTP through Docker Desktop's forward of 127.0.0.1:80 was reset (door's AC-10-02 redirect test, `ECONNRESET`) while Caddy answered 308 inside its container; `docker restart open-adms-local-caddy-1` put it right; if seen again, part 5's rework of Caddy is where to look (a `local:up` that checks the redirect from the host); ~~(b) `apps/api/test/door.test.ts`'s AC-10-32 asks a real reset of the running API, whose per-login limit (3 an hour, in memory) a fourth run in the hour meets as `429`: restart the API container, or let the test take `429` as the same answer too (part 5, with the container's rework).~~ ✅ ADR-525: the limit met is the address's (ten an hour; each run's login is its own), and door takes `429 LIMITED` as the answer.
- **C162. What task 2.7.3's part 5 left** (ADR-517; KD-78, KD-79, C155, C156 and C161 done by it). **Back to Phase 2 (ADR-519): (a) task 2.8.3, REQ-211; (c) task 2.8.2, REQ-210; (b) stays an observation.** ~~Re-filed at Phase 2's exit (ADR-518): (a) to Phase 3 with REQ-006; (c) to Phase 3 with REQ-308.~~ ~~**Found, no task yet:**~~ **→ (a) 2.8.3, (c) 2.8.2, (b) an observation (ADR-522):** ✅ *(a) ADR-525* ~~(a) **SeaweedFS's master, volume and filer listen on the stack's network in plain HTTP with no identity** (ports 9333, 8080, 8888 and their gRPC): no hop of ours uses them (the store is asked by S3 alone, through Caddy), but any container of the stack could read or write the store's files there; proposed: bind them to the container's own loopback (`-ip.bind`) if the S3 gateway can keep the network, or put the object store on a network of its own with Caddy alone, read against 4.2.1 and 12.3.3 (an ADR first).~~ (b) **Docker Desktop's forward to Caddy reset connections from the host** once, after Caddy's container had crash-looped, until `docker restart open-adms-local-caddy-1` (C161 (a) seen again; a clean `up` since showed nothing): if seen again, `local:up` could restart Caddy once when its host check is reset. (c) ~~**C155's proposal, not built:**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524)* a sync whose transaction waits past Prisma's limit for a connection (`P2028`) is answered 500 where it should be told to wait (503 or 429 with `Retry-After`), the pool's size and wait measured at the burst; a task of its own (ADR to come). **For a Linux host (a cloud session):** each key under `infra/local/.generated/tls/` must be readable by its container's user (Postgres 999, the mail catcher 65534, the address server's `nominatim`, Caddy and the object store 1000), as the env files and Caddy's root already must (NEXT's handoff). **Phase 5a (REQ-517):** the deploy's own hardening and its TLS between hosts; how a certificate is issued there is the provider's. **For the user:** ADR-517's agent defaults (`SUMMARY.md` §4).
- **C165. What task 2.8.1 (the sweep) left** (ADR-522). **Each of 2.8.2…2.8.8:** its line's "Filed by the sweep" list is part of the task, read with its REQ; at its close those items are struck in their own entries with its ADR, as C164 asks. **2.8.8:** the viewers' reads of the records it reads for the back office are in it (ADR-520 (3) read as reaching the portal's reads, ADR-522 (2)); a viewer's sight of each follows the viewer views as built, a new view declared where one is missing. **Left named, not filed to 2.8:** the harness's tower phone asking its site's lookup (REQ-124f, the phone's); the exports' columns and a page's filters (REQ-408, REQ-412). ~~an Esri layer fetched by the server, with KML (REQ-124b, where ADR-485 put both)~~ moved into 2.8.5 by the user (ADR-523). **For the user:** ADR-522's readings (2) and (3), and (4)'s first half, in `SUMMARY.md` §4, put with the rest at 2.8.9 ((4)'s Esri half answered, ADR-523).
- **C166. What task 2.8.2 left** (ADR-524; its sweep list, C87, C95, C133, C134, C138, C140, C141, C154, C155 and C162 (c), struck with it). **2.8.3…2.8.8 (every task that adds an endpoint):** nothing to add: a `BUSY` comes from the one error filter, whatever the endpoint; a new piece of work that is meant to run longer than `DATABASE_WORK_LONGEST_MS` (a large import, 2.8.5's KML) states its own limits with its ADR, as the worker's run does. **Phase 3 (the field app, REQ-308):** it reads a wait with the contracts' `toldToWait` and passes the suite's 18th check; it spreads its own retries (the server says the same 5 s to every phone); a refusal of its proof right after a turn-in it sent, or a sync answered `PHONE_NOT_PROVEN` while it was being turned in, means it was turned in. **Phase 4 (REQ-124b):** the map screen shows the ring pairs' refusal in its own words; a firm's own map files are measured then, as `policy.env` already says. **Phase 5a (REQ-517):** a deploy's pools against the database's `max_connections` (the API's own pool and its viewer pool and the worker's, ten each, again for each process); the two waits and the burst measured on the deploy's own hosts, over a network. **Left as it is (agent default (f)):** a boundary of 100,000 corners costs a run about 2.3 s, once; nothing kept between runs. **For the user:** ADR-524's agent defaults (a)…(g), in `SUMMARY.md` §4.
- **C168. What task 2.8.4 left** (ADR-526; its sweep list, C106's quarantined read, C136's store check, C137's case, C139's two, struck with it). **Phase 3 (the field app):** a photograph whose record is held is answered saved, and its files go as any photograph's; the phone shows the record as not saved all the same; a report answered not saved stays shown as not saved and is confirmed at turn-in; whether it sends again what it shows as not saved is still its own (a record held for what it named and since saved is answered `ALREADY_SAVED`). **Phase 4 (the back office):** the review queue's held records, files set aside and quarantined records, from the three reads; saving one as corrected starts from what was sent (`sent`), changed only where it must be; a closing's reason is the person's. **Every later task that makes a photograph's owner:** a tenth owner widens `photo_owner_check`, `photo_held_record_guard`'s `moved_to` and the held review's `ownerColumn`. **A held record with no id the server could read** is entered in the back office as a record of its own (2.8.7 makes the forms' and a certification's) and closed. **For the user:** ADR-526's agent defaults (a)…(g), in `SUMMARY.md` §4, put with the rest at 2.8.9. **Seen, not a finding:** five migrations, not two: the guard's resolution trigger first ran before the tables' checks and an applied migration is never edited (ADR-113); the house names each "never a system actor" check per column; a held certification's photographs keep their views. No "no task yet" of the server's is left by this task.
- **C170. What task 2.8.6 left** (ADR-530; its sweep list, C53's, C91's, C101's, C102's, C120's, C133's and C157's lines, struck with it). **2.8.8 (the reads):** a phone's record read with its mark, its reason's name and which revoked its key (the list answers ids today); the firm's settings are read already (`GET /firm-settings`). **Phase 3 (the field app, REQ-311):** a phone told `MASTER_PASSCODE_NEEDED` at its proof asks whoever holds the passcode, sends it beside its signature, then syncs and turns in; it knows from `GET /phones/current`'s `keyRevoked` that it may do nothing else; a phone synced with nobody signed in reads its lists at the next online sign-in (ADR-530 (15)). **Phase 4 (the back office, REQ-412):** the firm's settings page (the hours, off, the viewers' two-step, each with a note); the phones page's rename, removal (a time and a reason), made retired and put back; a person's own page removes their authenticator with a code. **Seen, left as it is:** the two guard migrations' header comments cite `AC-10-81…84` and `AC-10-11, 81`, numbers task 2.8.5 had already taken: read AC-10-83…86 and AC-10-11, 83 (an applied migration is never edited, ADR-113); ~~a phone out of service whose key stands is still topped up at a sync~~ **a defect against ADR-065, 134 and 473, found by the user's review and fixed by ADR-531**: a phone out of service only sends, its standing read once at the door, the database cutting it no block. `NumberAllocator.retire` is called by nothing (a lost phone's blocks end at its turn-in or the firm's time, ADR-488, 530): left, a later task's to remove or use. **For the user:** ADR-530's agent defaults (a)…(h) ((g) answered by ADR-531) and ADR-531's (a)…(d), in `SUMMARY.md` §4, put with the rest at 2.8.9. **ADR-531 leaves, for Phase 3 (REQ-311):** the app syncs only while somebody is signed in; reaching signal it reports its offline sign-in first (`POST /phones/current/offline-sign-ins`, the proof an HMAC keyed by the first slow hash, kept never, the proof dropped at sign-out); the master user syncs by typing the passcode beside the phone's proof; a refused offline sign-in asks for an online one. **For Phase 4 (REQ-412):** the firm's settings page gains the monitor's sign-in hours (an admin's); the security log shows `OFFLINE_SIGN_IN_REFUSED`. **For 2.8.8 (the reads):** a phone's sessions read with whether each came from a sign-in made offline. ARCHITECTURE §7.2's and §7.4's ADR-531 notes await the user's approval. **No server "no task yet" left unfiled** (ADR-519's lesson).
- **C169. What task 2.8.5 left** (ADR-527, 528, 529; its sweep list, C62's merge, C98…C101's, C103's, C113's, C115's and C140's column struck with it). **2.8.8 (the reads):** every list's values read (a list's page, the archived apart, for the setup screens and the board's pick lists), a pay item's crew day steps read with it (archived ones apart), a site's labels, a map version's zones' layer and copy, and a site's shape version's source and file read back; the searches' paging (`after`, `limit`, `next`) copied by every read it adds. **2.8.6 (the firm's settings):** nothing of this task's; `ADMS_ESRI_PRIVATE_HOSTS` and `ADMS_ESRI_CA_FILE` are the API's settings, not the firm's record (a host on its network is the installation's to state, agent default (i)). **Phase 4 (the back office's map screen, REQ-124b):** the preview of what a KML file or an Esri layer holds on a map before a load; the token asked for at each fetch and refresh, never remembered by the page; the setup screens read `queued` for "N tickets queued"; the close screen reads the closing check's items and asks the admin to confirm (ADR-529 (b)); a reopening asks its reason. **Phase 5a (REQ-517, the demo deploy):** an Esri layer on ArcGIS Online asked from the deploy's own host over the internet, measured (`ESRI_LAYER_ANSWER_SECONDS` was measured only on this machine's test server). **Seen, left as it is:** an Esri layer's address is held to its pattern in the contracts (`z.url().regex(…)`), so the OpenAPI description says its pattern and not `format: uri`; the contracts' test counts it as an address by the pattern. Archiving a site label value (the list) leaves the sites that carry it carrying it, as a field event keeps an archived entry. **2.8.7 (captured fields correctable, REQ-216):** a certification's sub is correctable, audited, so `SUB_NAME_ALIKE` has its fix (ADR-529 (f)); the correction queues the project's tickets that name the certification. **2.8.8 (the reads):** a project's closed state and closing check are read on the project's page; a closed project's records are read as any other's (read-only is the database's). **Seen, left as it is (ADR-529):** `contractor.merged_into_id` is kept as history and written by nothing now; the guard's refusal is recognised by its message (`project_open_guard()` raises with no constraint name the driver passes on), in `apps/api/src/process/database-refusal.ts`. ~~**For the user:** ADR-527's agent defaults (a)…(j)~~ ✅ answered (ADR-529); ADR-529's own agent defaults (1)…(3), in `SUMMARY.md` §4, put with the rest at 2.8.9.
- **C167. What task 2.8.3 left** (ADR-525; its sweep list, C85's AC-10-32 item, C161 (b) and C162 (a), struck with it). **Every task that changes the local stack:** a sidecar's Caddyfile (`routing/`, `objectstore/`) is a mounted file, so `pnpm local:up` doesn't make its container afresh when only that file changed: `docker restart` it, or `pnpm local:down` first (seen while trying the loosenings); SeaweedFS logs at each start that it loaded no IAM configuration for STS (temporary credentials, none used: the identities and the API's policy hold, `media-store.test.ts`). **Phase 5a (REQ-517):** the deploy's object store is the provider's or the firm's (ARCHITECTURE §4), its own servers closed there as here: a deploy that runs SeaweedFS runs it as `server` on its loopback, or with its gRPC under `security.toml`'s mutual TLS; the operator's guide says so. **For the user:** ADR-525's agent defaults (a)…(f), in `SUMMARY.md` §4. **No server "no task yet" left unfiled** (ADR-519's lesson).
- **C164. What the audit and the reopening left** (ADR-519). **Every task of Milestone 2.8:** at its close, no "no task yet" of the server's stands: each is filed under a 2.8 task or a named later REQ in the same response. ~~**2.8.1:** the sweep (its line).~~ ✅ ADR-522. **2.8.6:** ~~the user's answers to ADR-519 (7) read first~~ answered, ADR-520 (its line says what). **2.8.7:** ~~ADR-433 (a) asked first~~ answered "Yes", ADR-521 (its line says what). **2.8.9:** `SUMMARY.md` §4 put to the user on one page. **Seen, a design point the user answered (ADR-519 (7)):** a phone's key is revoked only by its own turn-in (ARCHITECTURE §7.4), so a phone never seen again keeps proving itself and syncing (a sync needs nobody signed in, ADR-472 (a)), its records flagged; the backstop is task 2.8.6.
- **C163. What task 2.7.4 (Phase 2's exit) left** (ADR-518; C157 and C162 re-filed by it; **its "whether to open Phase 3" waits on Phase 2's exit again, ADR-519**). **For the user:** whether to open Phase 3, and its first questions: the accessibility standard and level (REQ-324, C41) before the first screen is designed; ADR-518's agent defaults (`SUMMARY.md` §4): REQ-006 to Phase 3, C157 to Phase 4, REQ-322…324 added. **Phase 3's first task** writes its plan from `REQUIREMENTS-LATER.md`'s Phase 3 and the map above, as ADR-377 did, and its acceptance scenarios for the phone (the 21 rows of file 10's section M with a later part name what is the field app's and the back office's). **Seen, left as it is:** the cells of files 01…09 carry each task's history; a row is now marked whole at the API by the phase exit's line at its end.
- **C134. What task 2.6.2's fourth part left** (ADR-475; C130's, C132's and C133's part 4 are done by it). ~~**2.6.3 (edits):**~~ ✅ *(ADR-477: fell away; swept by ADR-522)* a story's phone sends an edit in its sync once `syncSentSchema` carries one (`SimulatedDevice.sends`, `answered`, the suite's `SyncClientHolds`); `sentAlone` and `synced` (`stories/board.ts`) send what a story makes by hand. ~~**2.6.4 (photographs):**~~ ✅ *(ADR-483; swept by ADR-522)* `PhoneServer.receive`, `SentPhoto` and the phone's by-hand photograph loop go; `P1Syncs.crewPhotographs` with them. ~~**2.6.5 (turn-in):**~~ ✅ *(ADR-489; swept by ADR-522)* the harness's phone takes the setup version in (`listsStale`) but reads no lists by itself: a story signs the monitor in again. **Milestone 2.8 (the golden mission at the API):** `p1-reconciled`, `p1-priced`, `p1-left-out`, `p1-viewed` and `golden-mission` still ask the worker for whole runs by hand (`Reconciliation.run`), so the jobs their syncs queue wait unworked; exit criterion 1 wants the mission reconciled by queued jobs alone (`QueueRuns.settle` in place of each run, the run's outcome read from the queue's), and its figures must not move. `p1-left-out` and `p1-any-order` send each record in a sync of its own. ~~**2.7.2 (load):**~~ ~~**→ 2.8.2 (ADR-522):**~~ ✅ *(ADR-524: 24 ms, 54 at once 311 ms, outside any piece of work)* a story's first sync of each phone makes a master passcode check (the phone holds none): measure it with the 200 records. **Any new story:** a phone's first block is `firstBlocks`, never a by-hand top-up; a top-up's audit actor is the device key's; a sync that carries a record writes `sync`, the record, `synced_record`, a job and its tickets, then `sync` again (the setup version sent). **For the user:** ADR-475's agent defaults, in `SUMMARY.md` §4.
- **C125. What task 2.5.4's fourth part left** (ADR-463). ~~**Part 5 (every other use the phone logged):**~~ ✅ *(ADR-464; swept by ADR-522)* as C122…C124 say; a setup done online is two or more `MASTER_PASSCODE_USE` events the server wrote itself (each read of `POST /phones/current/setup-choices`) before the unplanned assignment's own, reported, pair: the story should show them together, and REQ-202b read whole says whether a read under the passcode counts among "every use". ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-490, 509…514; swept by ADR-522)* ASVS 8.2.1, 8.2.2, 14.2.1, 14.2.6, 6.3.1, 16.3.1 and API1…API5 for this read are answered by `phone-setup-choices.test.ts` and the contracts' `api-answers.test.ts`; **nothing limits how often a proven phone holding the right passcode may ask** (one slow hash and one security event a call), here or at `…/monitors` and `…/passcode-sessions`: decide a limit per phone there (API4). **Every later endpoint open to a proven phone** joins `phone-proofs.test.ts`'s exact list. **Phase 3 (the field app):** it keeps the typed passcode in memory only for the setup, asks first with `projectId: null`, then again with the project picked, asks on while `moreMonitorsAfter` isn't null, and offline sets up only on the project whose lists it holds (AC-02-38). **For the user:** ADR-463's agent defaults, in `SUMMARY.md` §4.
- **C124. What task 2.5.4's third part left** (ADR-462). ~~**Part 4 (what setup under the passcode reads online):** the projects that are open, each one's live sites and unit rate pay items, and the monitors in service, for a phone nobody is signed in on; proposed (ADR-462 (4)(f)): the request carries the master passcode, checked by `MasterPasscodeCheck.check` and written with `used` as C113 says, since a phone's proof alone would list the firm's monitors to a lost phone; what a unit rate pay item is shown as follows `PhoneLists` (never a rate).~~ ✅ (ADR-463) ~~**Part 5 (every other use the phone logged):**~~ ✅ *(ADR-464; swept by ADR-522)* as C122 and C123 say; a session opened with no connection is the phone's own and is reported there (which kind, for whom, the phone's three times); a wrong try on a phone doesn't count toward the server's lock (ADR-456 (5)(e)). ~~**2.6.2 (sync):**~~ **→ 2.8.7 (ADR-522):** *(not decided at 2.6.2)* a field event has one mark, `temporarySession`; one made in a session opened as the phone's monitor (`AS_MONITOR`) has none of its own, though ARCHITECTURE §7.2 and AC-02-42 say every record in a master-passcode session is marked: decide there (a second column, or one column saying which) and ask the user if it changes what a reviewer sees; `monitorOf(request).masterPasscodeSession` says which session a call is in, so a record synced online can be held to it. ~~**2.6.5:**~~ ✅ *(ADR-488; swept by ADR-522)* a phone turned in ends its sessions (a revoked key already stops them). ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ASVS 6.3.1, 7.2.4, 7.4.1 and 16.3.1 for a passcode's session are answered by `phone-passcode-sessions.test.ts` and `packages/db/test/sign-in.test.ts`; that it authenticates nobody is ADR-456 (3)(d)'s departure. **Every later endpoint open to a proven phone** joins `phone-proofs.test.ts`'s exact list. **Phase 3 (the field app):** it sends the monitor's id from its lists, never a typed Monitor ID; it shows that a session is the passcode's (`masterPasscodeSession`), signs in again when told `NOT_SIGNED_IN`, and ends its own temporary session at the project's midnight offline. **Phase 4:** the back office shows a session and its records as "authorised by the master passcode, for M004127". **For the user:** ADR-462's agent defaults and its proposal for part 4, in `SUMMARY.md` §4.
- **C123. What task 2.5.4's second part left** (ADR-458). ~~**Part 3 (under the passcode with a connection):**~~ ✅ *(ADR-462; swept by ADR-522)* whether a switch a phone reports also ends the earlier monitor's session on the server (today only the next monitor's online sign-in does, ADR-443; a reported switch happened earlier by the phone's clock, so a session opened after it must not be ended by it); a session under the passcode and a temporary session answer the assignment by `PhoneAssignments.taken`, which now takes the one made on the phone last. ~~**Part 4 (every other use the phone logged):**~~ ✅ *(ADR-464; swept by ADR-522)* **a switch to a monitor who has their own assignment is the `DEVICE_SWITCH` event alone**, reported with an id of the phone's (C122); the story of a site move and of a switch (AC-02-46, 47; `unplanned` in `stories/board.ts` takes `occasion`); REQ-202b read whole. **Every later occasion a phone reports an unplanned assignment at** joins the domain's `unplannedOccasions` and `securityEventsOf`, and the request's refusals in `phone-unplanned-assignments.test.ts`. ~~**2.6.2 (sync):**~~ ✅ *(ADR-472; swept by ADR-522)* a field event names the assignment it was made under, so after a move the earlier assignment's events and the later one's each keep their own site; the sync sends every unplanned assignment before the records made under it (C122). **Phase 3 (the field app):** a move and a switch are done under the passcode on the phone, offline if need be, and each makes the new assignment's id there; a switch to a monitor the phone holds an assignment for makes none; the earlier monitor's unsynced work is hidden from the next (AC-02-46). **Phase 4:** the board shows a monitor's several assignments on one phone for a day in the order they were made, so a move reads as one; a dispatcher is told that what was set up on a phone stands over the plan for that phone that day (ADR-458 (7)). **For the user:** ADR-458's agent defaults, in `SUMMARY.md` §4.
- **C121. What task 2.5.3's fifth part left** (ADR-455). ~~**2.5.4 (the master passcode on a phone):**~~ ✅ *(ADR-462; swept by ADR-522)* a lookup needs a monitor's session and no assignment, so a phone set up under the passcode asks the same call. ~~**2.6.2 (sync):**~~ ✅ *(ADR-522 (3): the phone's word stands; swept by ADR-522)* a field event arrives with its address and `addressSource`; the server takes the phone's word for `LOOKED_UP` (nothing of a lookup is kept to hold it against: decide there whether that matters). ~~**2.6.5:**~~ ✅ *(ADR-490; swept by ADR-522)* the per-device limit (C93) covers a lookup as any call. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* API7 and API10 are answered by `phone-address-lookups.test.ts` and `packages/domain/test/addresses.test.ts`; that no redirect is followed is by construction (Node's `https.request` follows none; a 3xx is a status that isn't 200) and has no test of its own; `spec/THREAT-MODEL.md`'s map-servers row already says the API asks on a phone's behalf. **Every later setting the API needs** joins `apps/api/test/settings.test.ts`'s `good`, `passwords.test.ts`'s hand-built settings, `madeUpSettings`, the installer's keys (written on a first run, added on a rerun, a line in the check: CHAIN.md's `✓` count) and `infra/local/src/index.ts`'s wait. **Phase 3 (the field app):** "Look up address" sends the captured GPS as two decimal strings of at most eight places; on `NOT_ANSWERED` it may ask once more, then the monitor types; an address taken from the answer is `LOOKED_UP`, one typed or edited is `TYPED`. **Phase 5a (the demo deploy, REQ-517):** the address server reachable by the API and the worker only, its proxy keeping no access log (the point is in Nominatim's request line); the installer or the deploy writes `ADMS_ADDRESSES_URL` for a firm's own server. **For the user:** ADR-455's agent defaults, in `SUMMARY.md` §4.
- **C120. What task 2.5.3's fourth part left** (ADR-454). ~~**Part 5:** the address lookup is `MONITOR_ON_PHONE`'s too and joins the two exact lists (`phone-lists.test.ts` by name, `phone-sign-ins.test.ts` with roles) **and the contracts' `endpoints` list**.~~ ✅ (ADR-455) ~~**2.5.4 (the master passcode on a phone):**~~ ✅ *(ADR-457, 462; swept by ADR-522)* an unplanned assignment's phone reads its login list by `PhoneLoginList.taken` as any does; a temporary session and a monitor switch pick from the list's names; a sign-in under the master passcode is checked online by `MasterPasscodeCheck`, never by the phone's check. ~~**2.6.2 (sync):**~~ *(ADR-522: decided otherwise ✅ ADR-473, 474, the lists read beside the sync; a proven phone with nobody signed in reading them: ✅ decided no, ADR-530 (15))* the sync hands a phone its login list and the passcode's check by `PhoneLoginList.taken` with what the phone says it holds, also with nobody signed in (the list's project is then the phone's last assignment's: decide there); `Sync.masterPasscodeVersionSent` is what that answers. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-454: sealed, on the trigger's list; ADR-490; swept by ADR-522)* `offline_seed` is a secret column (sealed, out of the audit log) and joins the list of what `pnpm security` knows as one; the departures stay ADR-449 (3)'s; a call that makes slow hashes is bounded by `LOGIN_LIST_ENTRIES_PER_CALL` and by the request limits only: whether it wants a limit of its own per phone. **Phase 3 (the field app):** a phone checks a typed password by Argon2id of it in Unicode's composed form under `first`'s salt and settings (no key), then Argon2id of those bytes against `check` (a PHC string); it keeps each entry with its mark, sends the marks at each read, drops the entry of anybody the answer doesn't name, and asks again while `more`; the 5 and 10 wrong tries are the phone's own (AC-02-40); the browser test build needs an Argon2 that takes raw bytes as the message. **Phase 4:** the dispatch board's "holds the current passcode" now moves when a phone is sent the check, not at enrolment alone. **For the user:** ADR-454's agent defaults and ADR-449 (5)'s proposals as built, in `SUMMARY.md` §4.
- **C119. What task 2.5.3's third part left** (ADR-453). ~~**Part 4:** a login list and the master passcode's check are no part of a setup version (`setupShownSchema` is strict and its test names what no key may carry); whether a phone says which version it holds, so an unchanged read sends less, is measured there with the login list's cost.~~ ✅ (ADR-454: the login list is its own call and the phone says what it holds of it; the other lists are still sent whole at each read, cheap beside a slow hash, and whether a phone states its setup version is 2.6.2's with the sync) ~~**2.5.4:**~~ ✅ *(ADR-457; swept by ADR-522)* an unplanned assignment's lists are read by `PhoneLists.held`, which makes a version as the device key's actor on that phone. ~~**2.6.2 (sync):**~~ ✅ *(ADR-473; swept by ADR-522)* `Sync.setupVersionSent` is the version `PhoneLists.taken` answers at the sync; a sync with nobody signed in makes a version the same way. **Every later list a phone is shown** joins `SetupVersions.shownIn` and `setupShownSchema` where it is the project's setup, or `PhoneLists.held` alone where it is a record (as certifications and ROEs are). **A story's phone** takes its version from the lists it read: `story.phone({ …, lists })`, never a number. **Phase 4:** a page of a project's setup versions and what each held (only the lookup is asked by version today); a view of field events whose version the project never had, if a reviewer wants one. **For the user:** ADR-453's agent defaults, in `SUMMARY.md` §4.
- **C118. What task 2.5.3's second part left** (ADR-451). ~~**Part 3:** the version numbers what part 2 now sends too (certifications, ROEs and the lookup change often: a version that moves with each new ROE, or one for the setup alone); whether a phone says what it already holds, for a project of thousands of ROEs or certifications.~~ ✅ (ADR-453: the setup alone; what a phone already holds is part 4's to measure, C119) ~~**2.6.2 (sync):**~~ ✅ *(ADR-472; swept by ADR-522)* a certification and an ROE a phone made arrive with its sync and are in every phone's next read; a certifying phone's cert-number block is topped up there (`NumberAllocator.topUp`, as the test does by hand). **Phase 3 (certifying on a phone):** its pick lists are in no list yet and §4A.2a names none: the primes and the subs known under each, vehicle types, vehicle features, crew types, the helpers assigned with the monitor. **Phase 3 (the field app):** a site carries no GPS or area, so a phone cannot say "you are not at this site" by itself: ask for them only if a screen wants that advisory check; a post-work survey picks from `roes` where `preWorkSurveyDone`. **For the user:** ADR-451's agent defaults, in `SUMMARY.md` §4.
- **C117. What task 2.5.3's first part left** (ADR-449, 450). ~~**Part 2:** `PhoneLists.held` reads inside one `$read`; each list it gains joins `phoneListsSchema` (strict) and the exact expectation in `phone-lists.test.ts`, whose "never" list and field-name pattern are how AC-07-91 is asked (a value like `UNIT_RATE` and the field `contractors` are why it reads field names, not words); a certification's prime and subs are names a monitor sees, a pay item's description is not sent; an ROE carries a private citizen's name and address: send what picking one needs and no more (ASVS 14.2.6).~~ ✅ (ADR-451) ~~**Part 3:** a story's phones still state `setupVersion: 1` by hand; whether a version numbers the project's lists or one assignment's, when a new `SetupManifest` row is made (a read that writes, or each setup change) and which actor its record names (the monitor signed in, or the device key's); the lookup by setup version.~~ ✅ (ADR-453) ~~**Part 4:** ADR-449 (5) is a proposal: read the user's reply first; a new secret column on `user_credential` joins its audit trigger's secret columns (C21) and `pnpm security` where it is a kind of secret (2.7.3); the cost of Argon2id for every monitor of a project at each read is measured before it is built.~~ ✅ (ADR-454) ~~**Part 5:** the address server is asked by the API alone (AC-04-24).~~ ✅ (ADR-455) ~~**2.5.4:**~~ ✅ *(ADR-457; swept by ADR-522)* an unplanned assignment received names its phone and day, so `GET /phones/current/lists` answers its lists by the same rule. ~~**2.6.2:**~~ ✅ *(ADR-473: decided otherwise, the lists read beside the sync; swept by ADR-522)* the sync's answer hands a phone its fresh lists by calling `PhoneLists.taken`, and tops up its blocks first. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ADR-449 (3) is the list of departures for a login list (63B §3.1.1, §3.2.10; ASVS 14.2.6, 14.3.1, 14.3.3). **Phase 3:** the field app keeps what it holds when told `noAssignment`, shows how stale its lists are (AC-02-44), and asks for them again whenever it has a connection. **For the user:** ADR-449 (5)'s proposals and ADR-450's agent defaults, in `SUMMARY.md` §4.
- **C116. What the housekeeping of 2026-10-09 left** (ADR-445…448). **Any task:** counts go in `agent_store/CHAIN.md` alone; a lesson about a layer's tests goes in its page beside the `adms-verify` skill; loosenings go through `loosen.mjs` in one list. **Not done, for the user to ask for if wanted:** `SUMMARY.md` (300 KB) is read by topic but is not itself cut; no one command runs the whole chain and prints one summary (it would take the chain from seven turns to one); `pnpm security` can't see a change made to the database by hand with no file changed inside thirty minutes of `pnpm test` (`--fresh` is for that). **A cloud session (Linux):** `infra/local/.generated/<service>.started` is written by whoever runs `local:up`; nothing in a container reads it.
- **C115. What task 2.5.2's third part left** (ADR-444). ~~**2.5.3 (the lists):**~~ ✅ *(ADR-449, 450; swept by ADR-522)* the lists are read for the assignment the sign-in answered (its id), with the unit rate pay items it names now (`archivedAt: null`, C103) and its site's quantity lookup; whether a call open to `MONITOR_ON_PHONE` also reads the assignment again (a phone whose monitor is still signed in the next morning, or after the board changed), and whether taking one is recorded (C103: the board's `deviceId` is the dispatcher's plan and is not written by a sign-in); the harness's `phone-lists.ts` still reads the lists by hand for the assignment `taken` answered. ~~**2.5.4:**~~ ✅ *(ADR-457; swept by ADR-522)* an unplanned assignment received from a phone names that phone and its day, so the monitor's next sign-in on it takes it by the same rule (the story `sync` shows it with one written by hand); a monitor switch and a temporary session answer the assignment as a sign-in does. ~~**2.6.2:**~~ ✅ *(ADR-467; swept by ADR-522)* a field event's assignment held against the one its monitor's sign-in was answered is a view, never a refusal (AC-02-34). **A story that tells of a monitor on a phone** creates them with `story.monitor(name, onPhone)` and takes the assignment with `taken(story, monitor, phone)`, which signs in on the clock the story is told on; a story told inside another (`p1FieldDaysHeld`) has a clock of its own, which is why `story.signedIn` takes `at`. A monitor's sign-in writes a security event and a session as the monitor from the phone: a story's exact audit list holds them. **Phase 3:** the field app shows "no assignment today" or "more than one assignment today: ask your supervisor" from `noAssignment`, and offers the master passcode's setup. **Phase 4:** the board warns (its read **→ 2.8.8, ADR-522**) of a second assignment for one person on a day with no phone named on each (C103), since such a monitor's phone takes none; a monitor's employer and its ID ~~still have no request (**→ 2.8.5, ADR-522**)~~ ✅ have their request (ADR-527 (12)) (the story `dispatch-monday` writes Kim's by hand). **For the user:** the agent defaults of ADR-444, in `SUMMARY.md` §4.
- **C112. What task 2.5.1's third part left** (ADR-440). **Every later table that names a user:** its guard adds two checks, `<table>_<column>_not_master_passcode_check` and `<table>_<column>_not_device_key_check` (`…0003`), and the column joins `packages/db/test/support/master-passcode-actor.ts`. **Every later write a phone makes with nobody signed in** (its clock reported, its passcode version moved, its block retired, its key revoked) is written with `byDeviceKey(deviceId)`; the database lets that actor through only from the API, for a phone, naming it. **Every task that adds an endpoint for a phone:** its definition says `access: 'PROVEN_PHONE'`, its controller reads `phoneOf(request)`, it joins the exact list in `phone-proofs.test.ts`, and its test enrols and proves with `apps/api/test/support/phones.ts` (`enrolledPhone`, `proven`; `served.ask(…, { bearer })`); a story enrols with `story.enrolled(name, at?)` (an `at` before the phone's first work, or its tickets are flagged as made before enrolment) and proves with `story.proofs`. ~~**2.5.2:**~~ the signed-in monitor beside the proven phone (whether one token names both, or a monitor's session rides on the phone's token: part 2, C113); ~~a wrong master passcode there counts as at enrolment~~ ✅ ADR-442. ~~**2.5.3:**~~ ✅ *(ADR-454; swept by ADR-522)* the manifest tells the phone the passcode's new check; `GET /phones/current` already says a newer version is in force. ~~**2.6.2:**~~ ✅ *(ADR-472, 473; swept by ADR-522)* the phone's clock reported with its sync (AC-05-03's second half, AC-05-04's difference kept); the sync's calls behind `PROVEN_PHONE`, each record held to the phone that proved itself (file 10's point 9). ~~**2.6.5:**~~ ✅ *(ADR-488, 490; swept by ADR-522)* `keyRevokedAt` set once a lost or retired phone has synced, been confirmed and wiped (nothing sets it yet; the refusal is built and tested); the limit per device and whether a proven phone's calls count against its address (C93); AC-10-46's "nothing it sends is taken" at the sync's own endpoints. ~~**2.7.3 (the security checklist):**~~ ✅ *(ADR-509…514; swept by ADR-522)* ASVS 6.7.2, 11.2.3, 11.5.1, 11.6.1 and 63B §3.1.6, §3.2.7, §5.1 are answered by `phone-proofs.test.ts` and `phone-proof.test.ts`; that a refused proof is logged and not a security event (ADR-440 (6)) is said there as a reading. **Phase 3:** the field app keeps the token in the phone's secure storage and proves again when it is refused `PHONE_NOT_PROVEN`; the browser test build sends `Authorization` across origins (the CORS answer allows it). **Phase 4:** who is shown a phone's proofs (they are audit records of `device` in the security domain). **Phase 5a:** the runbook says `pnpm installer` must be rerun after an upgrade so the seed makes the device key's actor (Q-167). **For the user:** the agent defaults of ADR-440, in `SUMMARY.md` §4.
- **C111. What task 2.5.1's second part left** (ADR-439). **Every later table that names a user:** its guard adds `CHECK (<column> IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid)` named `<table>_<column>_not_master_passcode_check`, and the column joins `packages/db/test/support/master-passcode-actor.ts` (the test reads the catalog and fails otherwise). **Every later act under the master passcode** (2.5.2 a monitor created, 2.5.4 a temporary session, an unplanned assignment, a switch) is written with `underMasterPasscode(deviceId)` and names the monitor it is for as who the record is about, never as its actor; a wrong passcode there counts on the same `master_passcode_tries` row ~~(`Enrolment.wrong` moves to a class of its own when a second caller needs it)~~ ✅ ADR-442 (`MasterPasscodeCheck`). ~~**Part 3:**~~ ✅ *(ADR-440; swept by ADR-522)* the stories and the API's tests still write a phone by hand with a made-up key (`story-…`, `test-…`): the harness's software-key phone enrols through `Enrolment`; whether the database then holds `device.public_key` to base64 by a check; the challenge is asked for by phone id. ~~**2.5.3:**~~ ✅ *(ADR-454; swept by ADR-522)* the phone's own check of the passcode and whether the server's hash is keyed (C90, C110). ~~**2.6.5:**~~ ✅ *(ADR-464, 490; swept by ADR-522)* uses of the passcode logged on a phone arrive at sync with the phone's own time. **Phase 4:** the back office shows that enrolment is locked and offers the change; who is shown the three security events. **Phase 5a:** the runbook says a locked passcode is opened by changing it, and that `pnpm installer` must be rerun after an upgrade so the seed makes the master passcode's actor (Q-167). **For the user:** the agent defaults of ADR-439, in `SUMMARY.md` §4.
- **C73. What task 1.6.3 left** (ADR-355). ~~**Task 1.7.2 (the worker prices):** read the rules as `RuleEntry`s, the contracts with their primes, each pay item with its rates, crew conversion and steps, each certification's prime and operating sub, every zone by name, a field event's `fieldTag`, `address`, items and `rootBallHalfExposed`, each site's *Charges a tipping fee* and its fee pay items, the project's `stumpCheckFillNeedsExposure`; build each piece from `TicketReadings` and hand `TicketPricing` the checks' flags; write a `PricingFlagRaised`'s `slot` and `payItemId` to the flag's columns; count the pricing flags in the status; `voidedBy` as the ticket's void, its reason the rule (point 18; 1.8.4); a throw from pricing as `NOT_PROCESSED`, and what that does to lines the ticket already has (point 4's last part); **the name a message gives a prime** (the catalogue says "Summit", the contractor's record "Summit Debris Services": which one is handed to `primes`).~~ ✅ ADR-359 (the name is the contractor's as recorded; an errored ticket keeps its lines: KD-73). ~~**Task 1.6.4:** an archived pay item under a rule (pricing prices it today if it is handed; throws if it isn't); the setup check's warning for crew-day steps that leave gaps.~~ ✅ ADR-357: the rule is not valid and never runs; the gaps are listed. ~~**Task 1.7.1:** the operating sub on a second-tier sub's truck (point 15).~~ ✅ ADR-358: the lowest tier the certification names. **For the user:** KD-72 (a TBN ticket: in the review queue, or complete); the agent defaults of ADR-355 (6)…(14); **`pnpm security` fails on a new advisory**, GHSA-68fv-2mgg-jv7q (high, `source-map-js@1.2.1`, reached only through the test runner: `vitest` → `vite` → `postcss`): seen 2026-10-05 with no dependency changed; a fixed version to pin, or an acceptance by id with its ADR, is a dependency decision and wasn't made in a rule task. **Decided 2026-10-05 (ADR-356): the fixed 1.2.2, by an override, once it is seven days old (2026-10-07 14:08 UTC); C74.**

##### Historical — Phase 1 closeout on `database/`: struck 2026-10-06 (ADR-375)

Milestones H1.1…H1.3 were the task list for the historical code (ADR-093), kept as the lessons the
rebuild must satisfy. The rebuild satisfied them: every KD they name is closed with its scenarios
(ADR-371), and the folder itself is gone. The section moved word for word to `DECISIONS.md`'s
scratchpad, "Moved 2026-10-06 (ADR-375)". Nothing in it is work to do.


### From `agent_store/NEXT.md`, the whole page as it stood

#### Open ADMS — Next

> **This file defines the immediate scope of work.** If asked for something outside this phase,
> say which phase it belongs to and ask before proceeding. Keep the Next Atomic Task pointer at
> the bottom accurate. Milestone detail lives in `agent_store/BACKLOG.md`.


##### Active Phase — **Phase 2, reopened 2026-10-14 at the user's word** *(ADR-519; Milestone 2.8)*

An audit of Phase 2 (ADR-519 (1)) found its own server work moved to later phases or left "no
task yet". The user: "all 3 of these are part of phase 2", "these should be part of phase 2".
ADR-518's exit is withdrawn; **Milestone 2.8 (`BACKLOG.md`), nine tasks, is the work.** Phase 3
stays the user's to open, after Phase 2's exit is met again.

##### Phase 2 — `API AND SYNC`: reopened 2026-10-14 *(opened by the user 2026-10-06, ADR-376; its exit of ADR-518 withdrawn, ADR-519)*

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

##### Exit criteria for Phase 2 *(ADR-376, and 8…10 by ADR-519; agent default, the user may change them)* — the seven were met 2026-10-14 (ADR-518); **met again only with 8…10, at task 2.8.9**

All observed and reported, not assumed. **How each was met (task 2.7.4, ADR-518):** (1) `pnpm
scenarios`: 22 stories passed, every phone through the real endpoints over HTTPS and every run
the worker's job loop's; the golden mission P1 $5,548.25 on 19 lines, P2 $324.00. (2) 119 of 119
at the API: file 10's 70, and the Phase 2 part of the 49 earlier scenarios (`spec/acceptance/README.md`).
(3) 13 of 14 ticked, REQ-006 moved to Phase 3 (`REQUIREMENTS.md`). (4) The checklist has none to
do: 6.3.3, the firm's choice of two-step for viewers, owned by Phase 4 (REQ-408); the threat
model approved (ADR-393); `pnpm security` 12 passed. (5) `installer:check` 35 `✓`: every table
guarded, each service login under its statement timeout; the grant tests 1,060 passed. (6) The
chain green with its counts (`CHAIN.md`); the API only at `https://api.adms.localhost` (AC-10-01…03).
(7) No zod schema in the apps' sources (every shape in `packages/contracts`, REQ-004), every rule
taken from `packages/domain`, and only `packages/db` and the two server apps reach Postgres
(REQ-205, `pnpm security`).

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

8. **No "no task yet" of the server's stands in the register**, and every line aimed at a Phase 2
   task is struck with its ADR or re-filed (ADR-519; task 2.8.1, held at every task's close).
9. **`SUMMARY.md` §4's agent defaults put to the user on one page**, each confirmed or overturned
   (the user's #3, ADR-519).
10. **Three full runs of `pnpm scenarios` in a row**, `burst` passing with no 500 in its API's log
    (REQ-210).

Only then is **Phase 3 (the field app)** offered to the user to open. ~~Offered 2026-10-14 (ADR-518).~~ Withdrawn: Phase 2 reopened (ADR-519).

---

##### Phases 0 and 1 and the spec track: done *(the record moved 2026-10-02, ADR-307, and 2026-10-06, ADR-375)*

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

##### 🔁 Handoff — read this first in a new session (rewritten 2026-09-28, ADR-225; updated 2026-10-02)

Everything decided is in the files; nothing lives only in an old chat. This block says **where
things stand, where the product ends up, the road there, and what is still to be asked**. What is
true now, topic by topic, is `SUMMARY.md`; the round-by-round history is the session log at the end
of `DECISIONS.md`.

###### Where things stand (2026-10-15, through ADR-531)
- **Phase 2 is reopened at the user's word (ADR-519): Milestone 2.8, nine tasks; 2.8.1 done (the register swept, ADR-522), 2.8.2 done (a request the database can't do in time told `503 BUSY`, ADR-524), 2.8.3 done (the object store's own servers on its loopback, S3 behind a Caddy of its own, ADR-525), 2.8.4 done (what a sync holds for a person read and resolved, a phone with held things turned in once they are, ADR-526), 2.8.5 done (every setup record changed at the API; a map from KML or an Esri layer, its request held against SSRF, ADR-527, 528; the user's answers to its defaults built: a closed project read-only, held by the database, archiving trimmed, a form's Enabled dropped, the merge retired for a flag, ADR-529), 2.8.6 done (a lost phone's key revoked by the worker after the firm's time, the firm's settings record, the viewers' two-step by the firm's choice, ADR-530), and the user's review of it built (ADR-531: a phone's standing decided once, at the door; a phone out of service only sends; nothing sent with nobody signed in; a sign-in made offline proven to the server; a monitor's sign-in a day, the firm's setting), from 2.8.7.** An audit found a sync answered 500 under a burst (C162 (c)), the object store's own servers open on the stack's network (C162 (a)), held things nobody can resolve (so such a phone is never turned in), REQ-105e and 105g not whole at the API (the register's "no task yet"), REQ-202's box unticked (now ticked), and a lost phone's key revoked only by its own turn-in (the user's backstop: task 2.8.6). REQ-210…217 are new. The line below is ADR-518's, kept until 2.8.9.
- ~~**Phase 2's exit is met (task 2.7.4, ADR-518): Phase 3 is the user's to open.**~~ All 32 tasks closed (2.6.3 withdrawn); 13 of 14 REQs ticked, REQ-006 moved to Phase 3; 119 of 119 scenarios with a Phase 2 part proven at the API; Phase 3's REQs refreshed, REQ-322…324 new. What it leaves: C163 (the user's first question for Phase 3: the accessibility standard, REQ-324). Each task's ADRs are on its tick in `BACKLOG.md`, "Active — Phase 2"; what it leaves is the carry-forward register. The lines that stood here, one a finished task, moved word for word to `DECISIONS.md`'s scratchpad, "Moved 2026-10-14 (ADR-516)". **This block says where things stand now, in a few lines; a finished task gets no line of its own here (ADR-516).**
- **Where each thing is written, so nothing is read twice:** a rule as it stands, with its ADR:
  `SUMMARY.md`, by topic (grep its `###` headings; never read it whole). What a finished task left
  for a later one: `BACKLOG.md`'s carry-forward register (C85…C161). How a layer's tests are
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
  by the user (ADR-386, 393). Phase 2's 14 REQs are in `REQUIREMENTS.md`: thirteen ticked, REQ-006 moved to Phase 3 (ADR-518).
- **`pnpm lint` runs ESLint under a 4 GB heap** (ADR-465): the whole-tree run had outgrown Node's default on this 8 GB Mac. If it stops with "heap out of memory" again, split it by workspace.
- **Phones today (what 2.5.3 builds on).** A phone enrols under the master passcode (`POST
  /phones/enrolments`), proves itself by signing a challenge and gets a fifteen-minute token
  (`access: 'PROVEN_PHONE'`, read with `phoneOf(request)`); a monitor is created on it under the
  master passcode and signs in with Monitor ID and password (`access: 'MONITOR_ON_PHONE'`: the
  phone's token and `x-adms-monitor-session`, read with `monitorOf(request)`); the sign-in's own
  answer carries the assignment the phone takes, or `noAssignment`; **the phone reads its lists by
  `GET /phones/current/lists`** (`PhoneLists`, `apps/api/src/phone/phone-lists.ts`: the sign-in's rule
  asked again, then that assignment's lists and the setup version they are, `SetupVersions`,
  ADR-453), **and its login list and the master passcode's check by `POST /phones/current/login-list`**
  (`PhoneLoginList`, `OfflineChecks`, ADR-454: the phone says what it holds and is made only what it lacks). **It looks up a GPS point's address by `POST
  /phones/current/address-lookups`** (`AddressLookups`, `AddressServer`, ADR-455: the API alone
  asks the address server; a test hands the process its own through `ProcessParts.addresses`). **It reports an unplanned assignment by `POST
  /phones/current/unplanned-assignments`** (`UnplannedAssignments`, ADR-457: `PROVEN_PHONE`, nobody signed in, no passcode sent; kept once and as reported, with the phone's instant, its offset and the server's received time; **a site move and a switch to a monitor with none are the same report, stating `occasion`**, ADR-458; a switch saved ends the earlier monitor's session on that phone, ADR-462). **A session is opened under the master passcode by `POST /phones/current/passcode-sessions`** (`PasscodeSessions`, ADR-462: `PROVEN_PHONE`, the passcode sent and checked; the row marked `masterPasscodeSession`, read on every request by `PhoneSignIns.onPhone` as a monitor's own is, so `monitorOf(request).masterPasscodeSession` says which). **What a phone being set up under the passcode picks from is read by `POST /phones/current/setup-choices`** (`SetupChoices`, ADR-463: `PROVEN_PHONE`, the passcode in the body; open projects, monitors in service, one open project's live sites and unit rate pay items in service; each read one `MASTER_PASSCODE_USE`). **Every other use of the passcode a phone logged with no connection is reported by `POST /phones/current/passcode-uses`** (`PasscodeUses`, ADR-464: `PROVEN_PHONE`, no passcode sent; a switch to a monitor with their own assignment, a session opened offline, a wrong try, which moves no count on the server; the first event takes the phone's id; the database lets only the passcode's actor write a security event a phone reported). What is written under the
  master passcode names its own actor (`underMasterPasscode`), a proof's the device key's
  (`byDeviceKey`). The code is `apps/api/src/phone/`. **No story and no test writes a phone or a
  monitor by hand:** a story uses `story.enrolled`, `story.proofs`, `story.monitor`,
  `story.signedIn`, `taken`, `unplanned` and `loggedUse` (`stories/board.ts`), `story.underPasscode` for a read or a session with a connection, and `story.lists.held` for a phone's lists; an API test `enrolledPhone`, `proven`
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
- **The chain** was seen whole on 2026-10-14 at the phase exit (ADR-518). Its counts
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
- **Open deviations:** none (KD-78 and KD-79 closed by ADR-517). KD-30 is re-filed to Phase 5 (REQ-518).
- **After a change to `apps/api` or `apps/worker`, `pnpm local:up` again** before the chain: each
  container runs what was built when it started, and `apps/api/test/door.test.ts` and
  `apps/worker/test/container.test.ts` ask those containers (BACKLOG C85, C95). Docker Desktop may be closed at the start of a session: `open -a Docker`, and
  quit it at close-out if you opened it. **If it answers 500, `docker desktop restart`** (seen 2026-10-09: quitting it by `osascript` left its backend running).

###### The model as it stands now (today's words; `SUMMARY.md` has each rule and its ADR)
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

###### Where it ends up
Done is proven, not ticked (`spec/VISION.md` §8, approved, ADR-269): approved part pages →
**acceptance scenarios** (`spec/acceptance/`, `AC-…`) → a **golden mission** (`spec/golden/`: several
messy field days, with the exact statuses, review queue and ledger **signed off by the user**) →
the same scenarios passing at each layer (engine, API, apps). The finished surfaces are `VISION.md` §7.

###### The road to done
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
| 8 | **Phases 2–5**: **Phase 2 reopened 2026-10-14 (ADR-519), Milestone 2.8**; opened 2026-10-06 (ADR-376), its plan in `BACKLOG.md` (ADR-377); its exit of ADR-518 withdrawn; Phase 3 the user's to open after it | API and sync → field app (browser, iPhone, Android) → back office (setup screens with the setup check, rule builder, review queue, exports, viewers) → later features and the demo deploy | Each phase's REQs refreshed before it opens |

###### What is still to be asked (so nothing is guessed later)
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

###### How the user works
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

###### Tools and housekeeping
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
  **Seen 2026-10-10 (ADR-458's session):** after `pnpm test`, `pnpm scenarios` and two more runs
  of the database tests, Docker's disk was full (7 MB free) and Postgres restarted in a loop
  ("No space left on device" writing its write-ahead log, which stood at 608 MB and did not
  shrink at a checkpoint). `pnpm security`'s own run of the grant tests then says `✗ no report`.
  The routing server's volume was removed (49 MB) and Postgres recovered by itself, `adms`
  intact (`installer:check`: every `✓`). **The next `pnpm local:up` rebuilds the routing tiles
  and needs that space back: with under 50 MB free it will fail** until the user clears the
  build cache (`docker builder prune`, about 0.9 GB, theirs to clear) or raises the disk limit.
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

##### 📍 Next Atomic Task

**New session? Read the "🔁 Handoff" block above first**, then `agent_store/SUMMARY.md`'s header
and the topic you are touching. Product discovery is closed (ADR-230): don't open new rounds of
questions.

**Phase 2 is reopened at the user's word (ADR-519). The next task is 2.8.7, every captured field
correctable, and records made in the back office** (`BACKLOG.md`, Milestone 2.8; REQ-216;
REQ-105g): its ADR first (ADR-521 (2) leaves it the certification's permission, certifier, cert
number's source and how its five photographs reach the store), then **its whole line, its "Filed
by the sweep" list included**. Then 2.8.8 and 2.8.9 in order, one a response. 2.8.6 is done
(ADR-530), with the user's review of it (ADR-531); what they leave is C170. A new piece of work meant to run past 5 s states its own
limits (C166). **2.8.7's question is answered (ADR-521: the back office enters a certification
from paper)**; its sweep's one open point (a field event made under the passcode as the phone's
monitor marked apart) is asked only if it changes what a reviewer sees. No task of 2.8 waits on
the user. **At every task's close, no server "no task yet" is left unfiled** (ADR-519's lesson).
**When Phase 2's exit is met again and the user opens Phase 3:** task 3.0.1 writes its plan
(`REQUIREMENTS-LATER.md`'s Phase 3 and the register's map); ask first, before any screen is
designed, the accessibility standard and level (REQ-324, C41).
**What the user may still overturn:** the agent defaults in `SUMMARY.md` §4; never copy that list here (ADR-516).
**Docker's disk is 8 GB and was full once on 2026-10-10** (Tools and housekeeping): if `pnpm ready` fails for space, stop and ask the user to free some; never work around it.
**Before the chain, `pnpm ready`** (the stack up, then `installer:check`): a `✗` at the migrations
or at a setting means one was made elsewhere, and `pnpm installer --yes` applies it. **After a
change to `apps/api` or `apps/worker`, `pnpm local:up` again; if Docker answers 500, `docker
desktop restart`; if `local:up` meets `ECONNRESET` or a container whose layer is gone, `pnpm
local:down` and `up` once more.** **On a Linux host (a cloud session), the containers run as uid
1000:** after `pnpm installer` the two service env files, and after each `local:up` the copied
Caddy root, must be readable by it (`chown 1000:1000`); and since ADR-517 each key under
`infra/local/.generated/tls/` by its own container's user (Postgres 999, the mail catcher 65534,
the address server's `nominatim`; the rest 1000), or that service fails to start.

**Every command starts with** `eval "$(fnm env --shell zsh)"`. The checks are `adms-verify`'s
(read the page for the layer you touch, beside it; skip the others); the counts to compare with
are `agent_store/CHAIN.md`'s; loosenings go in one list through its `loosen.mjs`. The stack is
stopped at close-out (ADR-277). Names and examples: `spec/CONVENTIONS.md`. Field
names: `spec/DATA-MODEL.md`. Flag wording: `spec/FLAGS.md`.

**Keep this section short (ADR-375):** the session hook prints all of it into every session. It
holds the next task and what that task needs, never a list of finished ones; what a finished task
leaves for a later one goes in BACKLOG's carry-forward register.


### From `agent_store/ROADMAP.md`, its "Last updated" line as it stood

> **Last updated:** 2026-10-15 (**Your review of task 2.8.6, built (ADR-531): a phone's standing is now read once, at the door, and everything else takes it from there. A phone marked lost or retired only sends its records and photos and can be turned in: it gets no new ticket numbers (it used to be topped up at every sync, against your rule that a lost phone's block is retired), no check of the master passcode and no lists, whatever session it still holds; the database itself refuses it a new block. Nothing is sent from a phone with nobody signed in: a sync needs the monitor signed in, or the master user (the passcode typed beside the phone's proof). A monitor who signed in with no signal is proven to the server when the phone finds signal: the phone sends a stamp only the right password could make, the server checks it against what it keeps, and a bad one is refused and shown to the back office. A monitor's sign-in now lasts 24 hours, your firm's setting, changed by an admin. Four new choices of mine wait in `SUMMARY.md` §4.** Before it: **Task 2.8.6 done (ADR-530): a phone marked lost or retired that isn't turned in has its key revoked by the worker 24 hours after it was marked (your firm-wide setting, in hours or off, changed by an admin or anyone with Setup); its unused ticket numbers are retired with it. If it turns up, it can still sync and be turned in, but only with the master passcode typed beside its key, and it can do nothing else. Your firm can now require two-step sign-in for read-only viewers (an admin's switch; a viewer with none is sent to set one up at once). A phone can be renamed, marked with when it went missing and why (from your reasons list), changed from lost to retired, or put back in service if found before its key was revoked. A person can remove their own authenticator with a code from it. Eight new choices of mine wait for you in `SUMMARY.md` §4, put to you on one page at 2.8.9.** Before it: **Your answers to task 2.8.5's choices, built (ADR-529): a closed project is now closed for good: an admin closes it by hand, seeing first what is still open (phones not turned in, tickets not QC'd or not invoiced, records waiting for a person), and from then on the database itself refuses any change to it; its assignments are withdrawn and its phones' unused ticket numbers retired; anything a phone sends for it later is held for a person, never added; an admin can reopen it with a reason, recorded. Archiving now covers only a person who left and a list's value; a site's label or fee link given by mistake is removed; the rest is changed, never archived. A contract keeps its prime (rename the prime itself). The form on/off switch is gone. Two spellings of one sub are no longer merged: each certification naming a sub whose name looks like another's is flagged (`SUB_NAME_ALIKE`) for a person to correct. An Esri layer's password (token) is never kept.** **Task 2.8.5 done (ADR-527, 528): every setup record can now be changed, taken off (archived) and put back by a request, each audited and re-checking the tickets it moves: clients, disasters, contractors, contracts, forms and their debris types, every list's values, pay items and their rates and crew-day steps, rules, sites, their labels and tipping fee links; searches come a page at a time; a project closed twice keeps its first close; a merge of two spellings says what still names the old one; a monitor's employer and its ID for them; a withdrawn assignment put back, with a note on why it was withdrawn; and a project's map, or a site's shape, loaded from a KML file (or KMZ) or straight from an Esri feature layer, the server's own request to that address held so it can never be pointed at the installation's own machines; the next task is 2.8.6, a lost phone's key revoked after the firm's time.** **Task 2.8.4 done (ADR-526): what a phone sent that the server couldn't save, a photo file that came across wrong, and a record whose ticket number another already holds can now be read by the back office and resolved: saved as it should have been, or closed with a reason, once, by a person, audited; photos of a record that waits now reach the server at once; a phone holding such things is turned in once a person has resolved them; the next task is 2.8.5, setup records changed and archived by a request.** **Task 2.8.3 done (ADR-525): the photo store's own internal servers, which had been open to every other container of the local stack with no password and no encryption, now answer only inside their own container; the photo store is reached only over HTTPS through the stack's proxy, as before; the next task is 2.8.4, resolving what a sync held for a person.** **Task 2.8.2 done (ADR-524): when the database is too busy to answer in time, every request is told to wait and ask again in 5 seconds (`503 BUSY`), never given a server error, and a phone sends everything again; a phone turned in at the same moment as another of its requests is never an error either; two indexes and a bound on how complex a map file's shapes may be came out of measuring a busy day.** **At your word (ADR-523), loading a map from a KML file or an Esri layer link moves into task 2.8.5** (it was Phase 4's). **Task 2.8.1 done (ADR-522): every carry-forward note aimed at Phase 2 read against the code; 170 were built, the rest written into the 2.8 tasks that build them, so nothing of the server's is left "no task yet".** **Phase 2 is reopened at your word (ADR-519).** A full check of Phase 2 found server work that was moved to later phases or marked "no task yet": a sync answered with a server error under a burst, the photo store's own servers open inside the stack, held records nobody can resolve, setup records the API can't change or archive, captured fields nobody can correct, and the reads those notes named. Eight new requirements (210…217) and nine tasks, Milestone 2.8, close them, with your backstop for a lost phone's key as a firm setting. The check chain was green the same day; the golden mission unmoved.)


### From `AGENTS.md` (`CLAUDE.md`), the whole page as it stood

#### Open ADMS — Agent Operating System

Offline-capable debris management and field reconciliation for disaster recovery. A truckload is
recorded as **two field events by two monitors who cannot see each other** (a collection event at
the curb, a disposal event at the dump) under one ticket number; only the server joins them, and
flags what disagrees.

**Nothing about this domain is guessable. Never infer a domain fact — load the skill that owns
it, or ask.** Confidently wrong code is the default failure mode here.

##### What we're building

**Who's who:** a **firm** (usually a monitoring firm) installs Open ADMS and runs its own
**installation**; its **users** are its back office (admins, managers/analysts) and field monitors,
plus read-only viewers it issues. A **client** (the jurisdiction paying), contractors and property
owners are **records**; a **client user** is a viewer login. Detail: `adms-domain` §1.4.

The system of record for a debris mission, from declaration to audit:
- The **back office** sets up a project: client → declaration event → project, then pay items
  and rules read off the contract, certifications, sites and ROEs.
- The back office **dispatches** each day: an **assignment** says who works where, on what.
- **Field monitors** capture collections, disposals, haul-outs, unit-rate work and forms on
  enrolled phones that take their assignment (never "provisioned"), offline, syncing whenever
  there's signal.
- **The engine** joins each ticket's field events by ticket number, validates them, writes the
  completed record and its transactions as conclusions from the events, and flags anything wrong.
- **Reviewers** correct, renumber or void (audited) and reprocess.
- **The ledger** always shows the current truth. The back office assembles the client package
  from it by hand.

##### Start here

| To… | Read |
|---|---|
| Understand the system, then find the part you're touching | **`spec/INDEX.md`**, the book: what it is, nine parts, a step-by-step page each |
| Know what's decided **now**, and which ADRs to cite | **`agent_store/SUMMARY.md`**: its header, then the `###` topics you touch (grep them; never read it whole, ADR-445) |
| Know the next task, where the product ends up, and the road there | `agent_store/NEXT.md` (the Handoff, then the Next Atomic Task) |
| Know how a layer is built and secured (install, database, API, devices, sync, storage, tests) | **`spec/ARCHITECTURE.md`** |
| Know the rules for a topic, and why | the skill (table below) |
| Answer "how does it behave?" | `SUMMARY.md`, then the skill, then `spec/QUESTIONS.md` |
| Explain, demo or test the domain | **`spec/golden/MISSION.md`**: one mission, every kind of record, each one's life. Never invent coverage |
| Name anything, or write an example, a test fixture or a seed | **`spec/CONVENTIONS.md`**: today's words, code names, the pay item code convention, the example world, the retired examples |

**Security first, at every layer.** The platform is rebuilt, TypeScript end to end with Prisma
(ADR-093/094); the old code is gone and is never a source. `spec/VISION.md` and the
other spec pages are approved (ADR-269). Phases are the build order; the spec is the target.

##### Load the right skill before you work

| About to touch — or answer a question about | Load |
|---|---|
| Anything — first task of the conversation; what an ADMS is, glossary, invariants | `adms-domain` |
| Schema, models, enums and lists, org hierarchy, which service owns what | `adms-data-model` |
| Certifications, cert numbers, capacity math, containers, crews | `adms-certifications` |
| Creating/matching tickets, the four workflows, the project setup spine | `adms-ticket-workflows` |
| Duplicates, quarantine, renumber vs void, corrections, splits | `adms-exceptions` |
| Weights, tonnage, scale receipts, apportionment, FDS loads | `adms-scale-receipts` |
| Validators, rules engine, statuses, flag messages, volume math | `adms-validation` |
| Pricing, `Transaction`, `AuditRecord`, the ledger | `adms-ledger-audit`; the rule builder: `spec/RULES.md` |
| Phone setup, sign-in, devices (Phase 0); field capture screens (later phases) | `adms-field-app` |
| An architectural call, or code/docs that disagree with a skill | `adms-decisions` |
| Any code, config, install, auth, device, sync or storage work | read **`spec/ARCHITECTURE.md`** first (not a skill) |
| Running the checks | `adms-verify` |
| Closing out a response that changed files | `adms-close-out` |

**What to trust, in order — for every answer, explanation or demo, not only code:** the newest ADR
→ `SUMMARY.md` → a skill marked current (`<!-- skill-status: current -->`; the session hook lists
them) → in any other skill, **only its ⚠️ notes: its body describes the old system** (KD-58) →
spec drafts. A term, status or field you can't find in `SUMMARY.md` is probably superseded
(`SUMMARY.md` §2 lists what replaced it). The user's Build 1 answers are verbatim in
`spec/FROM-BUILD-1.md`; Build 1 code is never a source (ADR-102).

**Unknown behaviour?** Load the owning skill, then check `spec/QUESTIONS.md` (✅: answer from it).
**Product discovery is closed (ADR-230):** ask only when the answer changes money, evidence or what
a monitor must do, it blocks your task, and nothing recorded covers it: at most three questions,
each standing alone (plain words, a story, refs at the end) with your recommendation. Otherwise pick
the option that keeps the firm's choice open, record an ADR marked "agent default", and carry on.

##### State files — `agent_store/`

| File | What | Yours to edit? |
|---|---|---|
| `SUMMARY.md` | Current rules by topic, superseded ADRs, open gaps. **Keep it current** | ✅ update |
| `NEXT.md` | Active phase, exit criteria, next atomic task | ✅ tick |
| `CHAIN.md` | The chain's counts today, the only place they are written (ADR-445) | ✅ replace |
| `BACKLOG.md` | Milestone detail for the active phase | ✅ tick |
| `DECISIONS.md` | Full ADR log + session log. Append-only, never renumber | ✅ append |
| `DEVIATIONS.md` | Full code-vs-skill gap log | ✅ append |
| `REQUIREMENTS.md` / `-LATER.md` | The active and finished phases' checklist (none active: Phase 2's exit is met, Phase 3 is the user's to open, ADR-518) / the gated phases, 3–5 | ✅ tick |
| `ROADMAP.md` | The user's one-page roadmap, start to finish, in tables (ADR-280). Summarises the files above | ✅ update at close-out |

##### Working loop

1. **ORIENT** — read `NEXT.md`, and `SUMMARY.md`'s header and the topics your task touches (never
   the whole page); load `adms-domain` on the first task; find your part in `spec/INDEX.md`. No
   task given? `NEXT.md`'s Next Atomic Task is it.
2. **SCOPE** — does this belong to the active phase and a permitted directory? If not, say which
   phase it belongs to and ask. Never silently widen scope.
3. **GROUND** — read the actual files before editing. Never infer a field name, enum value or
   model name from prose; the schema is the source of truth.
4. **EXECUTE** — minimal edits. No adjacent refactors, no building ahead. Every dependency is
   pinned; a new one needs an ADR. Answer in the form asked for (chat text, a file, an artifact).
   Do the whole task: never cut it into parts ahead of time (ADR-516).
5. **VERIFY** — load `adms-verify` (`pnpm ready` first; counts against `CHAIN.md`). Report real
   observed output, never "should pass".
6. **CLOSE** — load `adms-close-out`.

##### Write boundaries

| Path | Access |
|---|---|
| `agent_store/` | ✅ all files |
| `.claude/skills/` | ⚠️ domain content came from the user — record their decisions (marked with the ADR), never "correct" it; log a KD instead |
| `spec/` | ⚠️ agent drafts, user approves; approved content is treated like a skill (ADR-043) |
| `.claude/settings.json`, `.claude/hooks/` | ⚠️ enforcement — never weaken without the user asking; the hook's rules are tested (`tools/security/test/guard-hook.test.ts`): change hook, test and this table together (ADR-283) |
| `development/` | ❌ read-only reference. Its truck-capacity section is **wrong**; never use it |
| `apps/`, `packages/`, `infra/`, `tools/` (ARCHITECTURE §18) | ✅ open for the scaffold (ADR-143), built in `BACKLOG.md` order; every dependency pinned by an ADR, lockfiles committed |
| Root monorepo files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json` + `tsconfig.base.json`, `eslint.config.js`, `vitest.config.js`, `.nvmrc`, `.editorconfig`, `LICENSE`, `.gitignore` | ✅ for the scaffold (ADR-231, 255, 259) |
| `pnpm-lock.yaml`; `README.md`; the root `docker-compose.yml` | ❌ by hand: pnpm writes the lockfile; the README is the user's; a root compose file was the historical stack, retired by the user (KD-59, closed): never recreate one, the local stack is `infra/local/compose.yaml` |
| `database/`, `api/`, `field-webapp/`, `back-office-webapp/` | 🔒 the old code and its placeholders, gone from the working folder (ADR-093): never recreate them or port from a copy; the hook refuses a write under `database/`. The layout is ARCHITECTURE §18 |
| `**/node_modules/`, `**/.venv/`, `**/.pytest_cache/`, `**/__pycache__/`, `.git/`; generated: `**/dist/`, `**/src/generated/`, `**/.generated/`, `**/.cache/`, `**/.state/` | ❌ never (change the source, rerun the tool) |
| `**/prisma/migrations/*.sql` | ❌ never edit a generated or applied migration; a guard migration is written only into Prisma's empty `--create-only` stub, reviewed and tested (ADR-113, enforced by the hook) |
| `**/.env*`, secrets | ❌ never read, write or print an env file (the hook blocks it; `.env.example` is fine): reference keys by name, load one in a subshell, compare `shasum`s; never echo, log or commit a secret |

##### Git — the agent does not write to git

**Never run a git command that mutates state** (`init` `add` `commit` `push` `checkout` `switch`
`merge` `rebase` `restore` `reset` `stash` `clean` `rm`). Read-only inspection is expected:
`status`, `diff`, `log --oneline`, `branch --show-current`. Enforced by `.claude/hooks/guard.sh`;
a block is the rule working (ADR-008). A missing file is intentional: report it, never restore
it. End any file-changing response with a copy-paste git block for the user. Never commit to `main`.

##### Non-negotiables

One line each. Details and the ADRs to cite: `agent_store/SUMMARY.md`. Reasons: the skill named.

- **The firm's setup decides; hardcode as little as possible.** Ship defaults tailored to debris work
  that the firm can change. Before proposing a new ticket type, unit, criterion or behaviour, or
  asking how a contract line works, check whether projects, names, codes, rules and lists already
  express it. Which price a contract means is the firm's call, never ours. *(ADR-197)*
- **Two sides.** The monitor enters only the main ticket, fast; fees, pricing, zones, mileage and
  checks are the system's work. The back office sees everything, laid out to review, fix and QC many
  tickets quickly. The rules are the firm's own tool: enable options, never hardcode its rules. The
  user answers as a firm, a monitor or the back office: note which hat. *(ADR-224)*
- **Flag, never block.** After setup nothing refuses field work or a record over eligibility.
  Problems get a plain message: "Ticket 101008: debris type mismatch. Flagged for review." *`adms-validation`*
- **Security first.** Best practice at every layer (ARCHITECTURE §16); HTTPS between services, locally
  too; CORS by exact allow-list, never disabled; never log or print a secret. *(ADR-093/098)*
- **The database enforces the rules itself** — roles, grants, constraints, triggers — not only the
  code. *(ADR-097, ARCHITECTURE §5)*
- **Nothing is lost.** No hard deletes (archive, close, void). **`AuditRecord` is append-only**, one
  per change, with a real actor. Transactions are **regenerated, never reversed**; each removed row
  is first copied in full to `AuditRecord`. *`adms-ledger-audit`*
- **Records are correctable by permission** (any captured field, audited, prior value kept), then
  reprocessed, completed tickets included. Monitors never edit in the field. *`adms-exceptions`*
- **Renumber real work; void what never happened.** Renumbering a phantom double-bills. *`adms-exceptions`*
- **Statuses: `PENDING | COMPLETED | MANUAL_REVIEW | VOID`.** Review still bills; a person (with a
  reason) or a rule's *Void ticket* action voids. `FAILED` is gone. *`adms-validation`*
- **Field events are the evidence; everything the system writes is drawn from them.** A ticket is its
  number and its events (`COL` `DIS` · `HOC` `HOD` · `URT`); the completed load and haul-out (`CLT` /
  `CHO`) are not events and are system-written only. Never a bare "event" for the disaster (the
  *declaration event*). *`adms-domain` §1.2 (ADR-236)*
- **Pairs group on the bare ticket number** (per project and workflow; split suffix stripped).
  Never parse meaning from a number; type labels are display only. *`adms-validation`*
- **Offline is normal.** Arrival order means nothing; order by field time; an unpartnered event
  never expires. *`adms-exceptions`*
- **A phone is enrolled once and "set up", never "provisioned"**: its work comes from the day's
  **assignment** (dispatch board); one project at a time; master passcode (one per firm) for
  enrolment and the offline fallback; offline sign-in from a login list; syncs whenever there's
  signal; data encrypted, never backed up. *(ADR-095/096/105/106/240)*
- **Every project has a time zone**; the device clock is the recorded time; odd times are flagged. *(ADR-100)*
- **A certification certifies a container or a crew, never a vehicle.** Cert number = placard =
  badge. Capacity follows `adms-certifications` §3A.3 **exactly**. *`adms-certifications`*
- **Monitors never see a rate or a code**; they pick by name. Rules match tickets on criteria; their
  **actions** add numbered transactions (a pay item); a rule names one contract and runs only on
  its prime's tickets. *`adms-ledger-audit` (ADR-239)*
- **Names and examples follow `spec/CONVENTIONS.md`**: the industry's keyword or plain English, never
  a legacy screen label; examples from its example world, never the retired ones (`1A`, `54A`, TFR,
  Hwy 20 TDSR…), which live only in the history files. *(ADR-234/235)*
- **QC status is separate** (QC Review / Approved / Issues / Void), set only by people. *(ADR-107)*
- **Pick-lists a firm uses are extendable, not hard-coded** (`spec/LISTS.md`); values are picked,
  never typed. *`adms-data-model`*
- **Scale receipts are conditional** (FDS only, contract decides), hand-transcribed, never
  inferred. *`adms-scale-receipts`* **There is no USACE mode.** *`adms-domain`*
- **Never relax a threshold or a unique constraint to pass a test.** Thresholds are policy (`.env`).

##### Recording decisions

Made a judgment call? Append an ADR to `DECISIONS.md` **in the same response**, update
`SUMMARY.md`, and update the `spec/parts/` page if a step changed. Found code *or docs* that
disagree with a skill? Don't silently reconcile: append a KD to `DEVIATIONS.md`, update
`SUMMARY.md`, and raise it. *`adms-decisions`*

---

## Moved 2026-10-17 (ADR-538)

The user answered `spec/DEFAULTS-REVIEW.md` (all confirmed but D1, overturned by ADR-539; D39's note,
ADR-540). Each table below is as it stood in `agent_store/SUMMARY.md` §4 at commit `7e92fa7`
(ADR-537): every row answered, so it left §4.

### From `agent_store/SUMMARY.md` §4, its two tables of open agent defaults

###### Agent defaults to confirm or overturn: Phase 2 (newest first)
| ADR (task) | Open defaults |
|---|---|
| 536 (C172) | (1) a ticket's run decisions a read of their own, newest first, open to the whole back office; (2) whether a ticket could be processed is answered, never the error's own text (the server's log keeps it) |
| 535 (2.8.8) | (1) every back-office read open to the whole back office, whatever they hold; (2) a ticket's lines read with their rate and amount by every reader; (3) a pay item's rates a read of their own taking Setup; (4) a preview is the save run and undone; (5) bulk acts each item its own piece of work, never all-or-nothing, 200 at most; (6) a batch never archived (the sweep's "or archived" read as withdrawn); (7) a viewer reads a photograph's file wherever its record is shown; (8) the setup check and the lookup shown to a client user and an auditor; (9) the board's six warnings and the 62-day search; (10) a phone's sessions read by the whole back office; (11) a certification's "what it was saved with" read as its flags |
| 534 (2.8.7) | (1) a sheet from paper takes *correct*, names the monitor on the sheet as certifier and the sheet's own number, never one issued by the back office; (2) its photographs (and any back-office record's) through one endpoint, only onto a record made in the back office, fingerprinted by the server; (3) an ROE's number corrected unlinks what named the old number; (4) a form's answers given at the back office refused where they don't fit (a phone's are kept as sent); (5) a revocation taken back clears its three columns, the audit log keeping them and the reason; (6) an acceptance taken back is marked on its own row and accepting again is a new one; (7) the database holds a locked ticket's field events but the links a number finds; (8) a field event says which way its passcode session was opened in a column of its own, the phone sending it in place of `temporarySession`; (9) an ROE entered in the back office names the person who entered it and asks no reason (it is configuration) |
| 531 (the user's review of 2.8.6) | (a) a sign-in made offline is taken once (reported again, refused; the monitor signs in online); (b) a monitor's sign-in hours changed by an admin alone, not Setup; (c) an offline sign-in under the passcode taken only by the version in force; (d) any phone may prove itself with the passcode beside its key (the master user at it) |
| 530 (2.8.6) | (a) a phone revoked by the firm's time proves itself with key and passcode together, reaching only its sync, files, reports and turn-in; (b) the firm's hours run to a year at most; (c) the viewers' two-step changed by an admin alone, the hours by an admin or Setup; (d) a viewer sent to set one up at their very next request; (e) a phone whose key is revoked is never put back (enrolled anew); (f) the phone-removal reasons shipped (Lost in the field, Stolen, Broken, Replaced); (h) the worker never ends a revoked phone's sessions |
| 529 (the user's answers to 2.8.5) | (1) a close refused only while the worker still has jobs for the project; (2) a viewer's grant, a held record, a file set aside and a held record's photograph still written on a closed project; (3) sub names alike once case, spaces, punctuation and a company ending are set aside |
| 526 (2.8.4) | (a) the three reads open to every admin and manager/analyst; (b) *correct* to save a held record, *void* to close one or a file set aside, a reason required; (c) a record saved from a held one keeps its phone's id; (d) a report and a file set aside closed only; (e) a held record's photograph kept with it and answered saved; (f) a report the server can't keep is held; (g) a held photograph closed lets its phone be turned in |
| 525 (2.8.3) | (a) the object store's servers on its loopback behind its own TLS Caddy; (b) `weed server`, not `mini`; (c) S3 plain on the loopback; (d) the forwarded name believed only from the stack's proxy; (e) door takes a reset's `429 LIMITED` as a pass; (f) AC-10-32's real sign-in and enrolment read in the process's own log |
| 524 (2.8.2) | (a) the database busy is `503 BUSY` with `Retry-After`, not 429; (b) a piece of work past its time, or a statement stopped, told to wait too, logged as an error; (c) Prisma's 2 s and 5 s kept, now stated; (d) a fixed 5 s wait for everyone; (e) a shapefile shape over 50 million ring pairs not read; (f) a 100,000-corner boundary's 2.3 s left as it is; (g) a second turn-in at once, or a top-up after it, is `401 PHONE_NOT_PROVEN` |
| 522 (2.8.1, the sweep) | (a) the viewers' reads built in 2.8.8 beside the back office's (exports and filters stay Phase 4's); (b) an address sent as looked up taken at the phone's word; (c) the harness's tower phone asking its site's lookup left named, not built |
| 517 (2.7.3 part 5) | (a) the stack's own root (P-256, ten years; a year a service), our own DER lines; (b) a container's own loopback is not a hop; (c) Valhalla behind a Caddy of its own; (d) Postgres keeps `local … trust` on its own socket; (e) the three hardening departures; (f) a map-server answer 256 KiB at most; (g) the API's certificate paths written into `apps/api/.env` |
| 515 (2.7.3 part 4, third piece) | (a) the written answers on the checklist's page (§5); (b) the data's four levels; (e) the 25 earlier built items each cite a test |
| 514 (2.7.3 part 4, second piece) | (b) `eqeqeq` with `== null` kept; (c) 4.2.1's local half moved to part 5; (d) part 4 cut again |
| 513 (2.7.3 part 4, first piece) | (a) the door logs refusals at `warn` with a person's or phone's id; (b) a whole number held to Postgres's `integer` by its schema; (c) only JSON and a file part read; (d) AC-10-27, 30, 35, AC-04-24 read as answering 6.3.4, 8.1.1, 8.1.2, 1.2.2; (e) 15.3.2's test in part 5; (f) part 5 added for KD-78 |
| 512 (2.7.3 part 3) | (a) a fourth part added; (b) REQ-204 ticked, its same-origin clause moved to REQ-517; (c) the endpoint list held exact in a test; (d) every request asked with a body no schema takes; (e) a story stopped on a 5xx ends with its API's last five error lines; (f) the 78 proposed answers of `spec/CHECKLIST-API.md` §3.1 (approved whole since); (g) KD-78's (b) |
| 508 (2.7.3 part 1) | (a) 2.7.3 cut in three; (b) REQ-205 read as the running product (three tools reach Postgres by name and reason); (c) "no hand-written SQL for modelling" held as tagged templates changing no schema; (d) the secrets scan's new kinds; (e) a test's vector marked by a reasoned disable line |
| 507 (2.7.2 part 4) | (a) `/health` stays liveness; (b) `GET /readiness` to anybody; (c) its bound `STATEMENT_TIMEOUT_MS`; (d) the worker's 503 reasons and `oldestJobWaitingSeconds`; (e) the stall bound derived; (f) a backlog a figure, never a verdict; (g) `installer:check` asks `/readiness`; (h) C38's rest re-filed to 5a |
| 506 (2.7.2 part 3) | (a) 200 tickets a run; (b) a job a run already covers taken up with it; (c) one name for both `JOB_TICKETS_AT_MOST`; (d) the neighbour scans unindexed until measured (C154); (e) what it took written down, never a threshold |
| 505 (2.7.2 part 2) | (a) the burst's size (a thousand loads, 54 phones at once); (b) a phone told `429` waits the seconds said and sends the same again; (c) a top-up losing its race thrice answered not topped up; (d) figures written down, never a threshold |
| 504 (2.7.2 part 1) | (a) 2.7.2 cut in four; (b) a sync a mebibyte at most, no body limit under it; (c) a record 256 KiB at most |
| 503, 502, 501, 500, 499, 497, 496, 493, 491, 492 (2.7.1) | the harness's shape: how the stories reach the real API, phones, browsers and job loop; what stays in process on purpose (each ADR's list) |
| 498 (the user's) and 499 | (a) a reprocess names the tickets alone; (b) a locked ticket left off and counted; (c) `NOT_A_TICKET` only for numbers a person names; (d) a set-aside job with no ticket put back as a records job; (e) a bound of 100,000 tickets |
| 518 (2.7.4, Phase 2's exit) | (d) REQ-322, 323, 324 added to Phase 3; (e) 32 scenario rows read whole at the exit. ((a)…(c) overturned by ADR-519.) |
| 487…490 (2.6.5) | (a) the cut in three; (b) a held record counts as on the server, the rest keeps a phone from turn-in; (c) a series not reported, or a lost phone's blocks, retired whole; (d) turning in a phone in service makes it `RETIRED`; (e) `DEVICE_TURN_IN`; (f) the turn-in's bounds; (g) the passcode's use logged when not turned in; (h) 600 requests a minute per phone, still per address; (i) an unread record named by the SHA-256 of `sentCanonical` |
| 478, 480, 481…485 (2.6.4) | the object store identity (put and get only), bucket and region names, 30 s answers, the vendor's S3 client; a photograph's record as the sync's own part; the server's places; parts held in memory (256 MiB), 32 MiB a file, 4 MiB a part, the image kinds; a file not matching set aside; 300 parts a minute; the back office's read open to every admin and manager/analyst; a map's file: the three libraries, 16 MiB, unzipped 64 MiB and 1,000 files, kept by SHA-256, only when a layer is a shape, no `.prj` taken as longitude and latitude |
| 471, 472, 473, 475 (2.6.2) | the ledger holds only stored records; the same thing sent again is the same held record; one job a record; "Held on the server for review."; a held record later saved stays for a person; a top-up the device key's act; a saved certification's warnings not sent to the phone; 473 (b) the phone says what passcode version and project's lists it holds, (c) a setup version made by a sync that only tells its number |
| 466, 467, 469, 470 (2.6.1) | a synced record never names its phone; a time as a UTC instant with its offset; the bounds (467 (c): 200 records, 20 unplanned assignments, 100 uses, 20 series; the user: "seems like a rather large payload… but sure"); a certification with a held number held, not quarantined; its photographs separate records; the suite never decides whether a phone resends a "not saved" record |
| 455…464 (2.5.4, 2.5.3 part 5) | the address lookup's shape (a POST, the street alone, 200 with no address, 5 s, nothing logged); an unplanned assignment with no passcode sent, kept as reported, a monitor only, the phone's day, the first report stands; 458 (a) a move and a switch by the same call, (d) the server doesn't hold a move to the project or work, (f) two planned or simultaneous assignments on one phone take none; a session under the passcode marked, a temporary one to the day's end or twelve hours; setup choices (every open project, every monitor in service, only live sites and pay items, each read a use); a wrong try offline never counts on the server; a reported switch or session signs out the earlier one |
| 449…454 (2.5.3) | a phone's lists by their own call, the sign-in's rule asked again; none with no assignment; a pay item's code sent, its description not; every certification sent (nothing of its driver); a site by name, type and two facts; an ROE's number, address and parcel, never its owner, only where needed; "pre-work survey done" by a survey carrying its number; no Unit of Measure sent; the setup version (whole project, made when first sent different, the device key's actor, no viewer); the login list's shape (only what the phone lacks, 50 a call, its own call, no offline seed left off, the passcode's check sent whatever the assignment, an entry naming id, Monitor ID and name, its version moved only forward by the phone) |
| 436…442 (2.5.1, 2.5.2 part 1) | ECDSA P-256; a two-minute challenge, once; a token per sync, 15 minutes; "Device key" and "Master passcode" as actors that are no person; a failed proof logged, not kept; a challenge for any id; a passcode refusal one code; a phone's name 1–80 characters; a monitor created only from a proven phone with the passcode; nobody types a Monitor ID |
| 430…435 (2.4.4, 2.4.5) | review's permissions (no new one), "not allowed" never says who holds what, a count of what was queued, notes of 500; a refused schema says which field; a correction's answer without conclusions; a back-office record's impossible fix refused; 100 item lines and carried tickets a request; a quarantined record's answer never what was sent; signatures on file take *QC*; a measuring correction changes measurements only; revoking again restates day and reason; a viewer's reads under `/viewer/…`, never filtered by the API, a ticket by project, workflow and number, 404 where not shown; a sub's user reads its own name, not its prime's; the owner's views under Prisma's `views` |
| 423…429 (2.4.1…2.4.3) | what may change on a pay item (code, description, band, unit, conversion, settings; never payable type or kind of work); the setup check reading every live form; worked out when asked; what queues every ticket; every setup request takes Setup; a contract's link `https`; the database's refusals' codes and words; a rate told only to whoever set it; "Pays when" and a rule stated whole; the check and lookups open without Setup; site dates changeable; a role between admin and manager/analyst only; a manager/analyst reads people; an unarchived person returns with what they held; changing a sign-in address keeps sessions, tells the old one; dispatch takes *dispatch*; phones read by any admin or manager/analyst; only an admin changes the passcode, with their own password; an assignment for a monitor, admin or manager/analyst, never on a phone out of service, changed or withdrawn while it stands; an unplanned one shown, never changed (its "nothing warns of a second assignment" overturned by ADR-535 (9): the board warns) |
| 418, 419, 420 (2.3) | the queue as two tables of our own, not pg-boss; set aside after five tries, no flag; only the API adds a job; one worker process works projects in turn; the worker's policy numbers; a run checks the flags on no ticket; the run's reason the oldest job's; the health answer's two counts; what queues every ticket; 200 a job; a certification from a phone queues as a sync's job; a change on no ticket queues a job naming none |
| 412, 415 (2.2.4, 2.2.5) | a right password with no code told "a code is needed"; a wrong code a wrong try; no admin clears their own authenticator; setup ends other sessions and finishes in ten minutes; the dev accounts; only an admin manages people; any admin or manager/analyst reads a person; no Monitor ID in the back office; an archived person's email free; `installer:admin` lets any admin back in |
| 376, 377, 380, 385 | Phase 2's exit criteria and plan; NestJS 12 rather than 11; the health check says only that the server answers; an error a plain code and a request id |

###### Agent defaults to confirm or overturn: Phase 1 and the spec
| ADR (task) | Open defaults |
|---|---|
| 300, 314, 315 (Phase 1's plan; 1.1.10) | scenarios written part by part before each milestone's code; one task per response; a contractor user sees none of a project's setup; no viewer sees contact details or a client's notes; a permission or a viewer's project taken away by archiving; a contractor user must name a contractor; grants audited in security; `user_viewer_project` |
| 316 (1.1.11) | P2's setup beyond the mission's words; the fill and freon pay items with no kind of work; each pay item's capture settings; Cypress Creek Landfill's GPS and permit; AC-01-80 names three refusals where setup has five |
| 317, 320, 321 (1.2) | what `03-certification.md` added to the example world; capacity: a zero or blank measurement gives none, every operation a step, under half a CY is 0 CY, the made-up boxes; a sub placed elsewhere saved apart with a warning; a new sub a hauler or a crew by kind; "replaced on" the new one's day; 0 CY saved; nothing checks a certifying assignment or a helper's; a vehicle type not required |
| 323…327 (1.3) | `R-0007`; 100 ROE numbers a phone; control ranges never share a number; a cert series only once seeded; a typed number with no reason received; a typed capacity only on a hand-keyed truck; half a GPS fix refused; no detail of a field event required; a disposal with both a load call and a count received; suffix letters; carried tickets as written; a receipt's weights as written; no database limit of 8 photographs; viewers see a photograph's record, never its place; an ROE carries no setup version; no definition, empty answers; a photograph field's answer its id |
| 214, 215, 205, 208, 209, 227…229, 236, 239, 241, 243…245, 247, 255, 262, 263, 266, 268, 273, 275, 276, 278, 280…286, 296…298, 301…303, 305, 306, 308…311 | the older defaults and readings (each ADR's own list; ADR-240's reopenable field event is overturned by ADR-477) |
| 234 | `spec/CONVENTIONS.md`'s names are agent defaults; overturn any |

## Moved 2026-10-17 (ADR-552)

Phase 2 reopened a second time (ADR-552); the Handoff's "Where things stand" took its new first
bullet, and this one was cut to a line to keep `NEXT.md` under its 20 KB (ADR-532). As it stood
at commit `1cf915f`:

### From `agent_store/NEXT.md`, the Handoff's "Where things stand"

- **The independent check of Phases 0–2** (`AUDIT-2026-10-17-PHASE-2.md`) **is answered whole** at
  the user's word "resolve all of these" (ADR-541…550): the passcode can't be held shut by a
  stranger, bursts are counted try by try, one key a purpose with the passcode's own sealed seed, a
  record naming somebody who didn't hold the phone flagged, the audit log and the jobs set aside
  read, a phone's held budget, sign-in by one indexed equality, map files read in a thread, an
  untrusted proxy logged; the threat model read again whole. The user answered its three
  questions (ADR-551): the new flags kept, no second thing to enrol, the firm's own passcode.

## Moved 2026-10-17 (ADR-554)

Task 2.9.2 closed (ADR-554); this bullet of the Handoff's "Where things stand", a finished piece of
housekeeping, was taken out to keep `NEXT.md` under its 20 KB (ADR-532). As it stood at commit
`e7a5b74`:

### From `agent_store/NEXT.md`, the Handoff's "Where things stand"

- **Housekeeping, 2026-10-15 (ADR-532), at the user's word:** `SUMMARY.md` cut by topic (432 → 202
  KB, every rule kept with its ADRs), `BACKLOG.md`'s register live-only and its done phases one
  line a task (452 → 54 KB), this page trimmed; the text that left each moved word for word to
  `agent_store/ARCHIVE.md`, "Moved 2026-10-15 (ADR-532)". No product rule changed.

## Moved 2026-10-18 (ADR-566)

Task 3.1.3 closed (ADR-566); the brief of a finished phase was taken out to keep `BACKLOG.md` under
its 80 KB (ADR-532). As it stood at commit `af1d46d`:

### From `agent_store/BACKLOG.md`, Phase 2's "Brief for every Phase 2 task (ADR-377)"

- **One task per response.** Each ends with real observed output (`adms-verify`), the close-out
  (`adms-close-out`) and the user's git block with named paths. Don't tick a box on "should work".
- **Don't cut a task ahead of time (the user, 2026-10-14; ADR-516).** Take the whole task and do as
  much of it as the response holds. Cut only when the work truly can't go on (a question only the
  user can answer, or the context runs out), and then say what was left in the task's tick line,
  never in an ADR of its own or a list of defaults to overturn. Never write "cut it when started"
  into the next pointer, and never cut a piece again.
- **Read first:** `spec/ARCHITECTURE.md` §6…§9, §13, §16 and the ⚠️ ADR-240 notes in §7 and §9;
  the task's scenarios (`spec/acceptance/`, the rows that name Phase 2, and file 10 once task
  2.1.1 has written it); `spec/THREAT-MODEL.md` once written; `spec/DATA-MODEL.md` §2.2 and §4.5
  for every model and field name; the task's carried items in the register below; the owning
  skill (`adms-field-app` for a phone's side, `adms-exceptions` for quarantine and a phone out of
  service).
- **No new rule.** An endpoint calls one service of `apps/api/src/<part>/`, which calls
  `packages/domain`. If a task finds it needs a rule nothing records, that is an ADR (agent
  default, or a question under ADR-230), written into `packages/domain`, never into a controller.
- **Every payload is a Zod schema in `packages/contracts`,** never a shape written by hand in a
  controller, a test or the harness; unknown fields are refused; OpenAPI is generated from them.
- **Every endpoint, in the same task that adds it:** who may call it (role and grant, read from
  the database on that request), tested as each kind of caller, the refusals included; its rate
  limit; its request id stated to `db.$write`; the security event it writes, if any; nothing
  secret or personal in its logs or its errors (a test reads them).
- **A schema task** follows Phase 1's brief unchanged (the model in its `.prisma` file → Prisma's
  migration → a one-line guard migration → the installer → the exact lists in the grant and
  catalog tests → a row-level-security decision → each new guard's removal shown caught). **A
  column that holds a secret's hash or an authenticator's secret is named on its audit trigger**,
  so the audit log says it changed and never what to (C21).
- **Every dependency gets an ADR first** (exact version, at least seven days old, licence,
  maintenance; `pnpm licences` and `pnpm security` after, and the clean-copy check). Phase 2 brings
  the first big ones: the web framework, the job queue, the object store's client, whatever signs
  tokens and checks authenticator codes. Prefer what Node 24 and Postgres already give.
- **A secret never appears** in a log, an error, a test's output, a fixture committed to git or
  this conversation. Dev-only seeded accounts and authenticator secrets live in the dev stack only
  (ADR-170) and are named in the secrets scan's allow-list with a reason.
- **Tests are the API layer of ARCHITECTURE §15**, named by scenario ID, run from the terminal
  against the local stack over HTTPS; the harness's stories move onto the real endpoints in
  Milestone 2.7, not before.
- **Not Phase 2's:** any screen, the phone's own store, keys in real secure hardware, printing and
  scanning (Phase 3); the back office's screens, the dispatch board's screen, exports, the portal's
  pages, the time clock's tables (Phases 3–4); the demo deploy, TLS to a cloud database, pgAudit,
  the outside penetration test (Phase 5a; C25, C33, C40 (b)). A read endpoint that only a screen
  needs comes with that screen. Don't build ahead.
- **A REQ is ticked, and a scenario marked passing, only from a run you saw.**
- Docker's disk here is 8 GB (`NEXT.md`, Tools and housekeeping); stop the stack at close-out.

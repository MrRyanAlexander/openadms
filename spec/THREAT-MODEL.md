# Open ADMS — Threat model

✅ **Approved**: agent-written (task 2.1.1, ADR-379); the user approves. Building doesn't wait
(ADR-230).

← [Index](INDEX.md) · How each layer is built and secured: [ARCHITECTURE](ARCHITECTURE.md) · The
scenarios that prove the API's controls: [acceptance file 10](acceptance/10-api-and-sync.md)

> **What this page is.** Who would attack Open ADMS, what they would go for, and what stops them,
> layer by layer over ARCHITECTURE §2. It was owed "before Phase 2's API is built" (BACKLOG C40
> (a), ADR-279).
>
> **It decides nothing.** Every control here is one a recorded decision already made; the source
> is named. Where nothing recorded settles how a control works, the row says which task decides
> it. If this page and its source disagree, the source wins (the newest ADR, then
> `agent_store/SUMMARY.md`, then the skill): fix this page and log a KD.
>
> **How to read "Tested".** A file name is a test that passes today. **AC-…** is an acceptance
> scenario; a Phase 2 task number (2.x.y, `agent_store/BACKLOG.md`) is where its test is written.
> Nothing on this page is marked proven that no run has shown.

---

## 1. What is worth attacking

| # | What | Why it matters |
|---|---|---|
| A1 | **The evidence**: field events, forms, certifications, photographs, scale receipts | It is what a federal audit or a fraud case reads years later (`adms-domain` §1.5). A forged, altered or lost record is the whole harm |
| A2 | **The money**: transactions, drawn by the worker from the evidence and the firm's rules | The contractor is paid per unit and reports the units (`adms-domain` §1.1). Every extra cubic yard is public money |
| A3 | **The audit log** (`AuditRecord`) | It proves who changed what. If it can be edited, nothing else can be trusted |
| A4 | **Secrets**: the master passcode, passwords, authenticator secrets, the token signing secret, each phone's device key, the database logins, the object store's keys | Each one lets an attacker act as somebody else |
| A5 | **Personal details**: a monitor's phone number, a driver's licence number, a private citizen's name and address | Shown only to those the firm lets see them (ADR-169, 336) |
| A6 | **One contractor's business**: its tickets and its transactions | Never shown to another prime (ADR-169) |
| A7 | **Being there**: the server taking the evening's syncs | Work that can't arrive piles up on phones in the field (ADR-030) |

## 2. Who attacks

| # | Who | What they want | What they start with |
|---|---|---|---|
| P1 | **A hauler** (a driver, a prime or a sub) | More units billed: a load recorded twice, a higher load call, a bigger truck, debris from outside the area | A truck, a badge, time alone with one monitor |
| P2 | **A dishonest monitor**, alone | To favour a hauler, or to pad their own work | An enrolled phone, their own sign-in, the records they make |
| P3 | **A coworker** | To make records as somebody else | Another monitor's ID and phone number (the firm's practice for a monitor's password, ADR-105) |
| P4 | **Whoever finds or steals a phone** | The data on it, or to keep making records | The phone, locked or not |
| P5 | **An outsider on the internet** | Anything: data, a foothold, an outage | The API's address |
| P6 | **A read-only viewer**, most of all a contractor user | Another prime's tickets and rates; to change something | A real login, scoped to their own projects |
| P7 | **A back-office user past their grants** | To void, correct, unlock or approve what they weren't given | A real login with some permissions |
| P8 | **A dishonest admin** | To change evidence or money without trace | Every permission |
| P9 | **A hostile web page** open in a signed-in person's browser | To act as that person | Their cookies, sent by their browser |
| P10 | **A poisoned dependency or build** | Secrets, or a quiet change to the code | A package we install |
| P11 | **Whoever reads a log, a backup or a screen share** | Secrets and personal details | A copy of something written down |

**Two monitors who agree to lie, or a monitor and a hauler who do, are not stopped by software.**
The design makes one person unable to fabricate a billable load alone (`adms-domain` §1.2) and
leaves the rest in the evidence: two GPS fixes, two times, photographs, each under a named monitor
on a named phone. §5 lists what else the system only records.

## 3. The layers and the lines between them

From ARCHITECTURE §2. A **line** is where one side must not trust the other.

| Layer | Trusts | Is not trusted by |
|---|---|---|
| **The phone** (field app, encrypted store) | Its own secure hardware; the lists it was sent | The server: a phone proves itself at every sync (§7.4), and nothing it sends is taken as money or as a conclusion |
| **A browser** (back office, read-only portal) | Nothing | The server: every request is checked from the database (§6) |
| **The API** | The database's answers; `packages/domain` for every rule | The database: its login can't write a derived record, delete, or touch the audit log (§5.1) |
| **The worker** | The evidence and the setup as the database holds them | The database: its login writes derived records only, plus the reconciliation columns (§5.1) |
| **PostgreSQL** | Only its own roles, grants, constraints and triggers | — it is the last line (ARCHITECTURE §1 (5)) |
| **The object store** | The API, which alone writes to it | Everybody else; a stored file is never run (§6, §11) |
| **The map servers** (routing, addresses) | Their pinned extract | A phone: it never asks them itself. The worker asks for a route; the API asks for an address on a phone's behalf (ADR-119; AC-04-24) |
| **The install and the build** | The lockfile and the pinned versions | Every dependency: seven days old, no install scripts, audited (`pnpm-workspace.yaml`, ADR-255, 276) |

---

## 4. The threats, layer by layer

### 4.1 The phone and the people who hold it

| ID | Threat | What answers it | Source | Tested |
|---|---|---|---|---|
| T-01 | **A guessed monitor password.** P3 or P5 tries a monitor's ID with seven-digit numbers | The password is not what protects a monitor (ADR-105). (1) The same ID and password are **refused everywhere but a phone's calls**: nothing on the web opens. (2) On the phone, tries back off after 5 and the phone locks after 10 until the master passcode is entered. (3) Every record names its phone as well as its monitor, and a monitor's work comes only from the day's assignment | ARCHITECTURE §7.2 (1), (3); ADR-240 | AC-02-39 (web half: 2.2.3; a phone's calls: 2.5.2); AC-02-40 (field app, Phase 3) |
| T-02 | **A copied phone.** P4 copies a phone's storage, or its login list, onto another device | The phone's key is made in its secure hardware and can't be exported, and every sync signs the server's challenge with it: a copy can't prove itself. The login list lives only in the encrypted store, each entry a slow hash salted for that phone, so a copy is useless elsewhere. The store's key is this-device-only and never backed up | ARCHITECTURE §7.2 (2), §7.4, §8 | AC-02-18, AC-05-03, AC-10-44…46 (2.5.1); AC-02-41 (2.5.3); AC-02-19 (field app, Phase 3; real secure hardware is Phase 3's) |
| T-03 | **A lost or stolen phone keeps working.** P4 makes field events on it | The back office takes it out of service with a removal time. Its next sync is **still received**; what it made after that time arrives flagged ("Ticket 101008: made on a phone taken out of service.") and is never billed silently. Once every record is confirmed and the phone wiped, its key is revoked and the server refuses it | ADR-134; ARCHITECTURE §7.2 (4), §7.4 | The flag: `packages/domain/test/checks.test.ts` (AC-06-62). AC-02-60, 61, AC-05-56 (2.6.5) |
| T-04 | **The master passcode leaks.** It is one value, shared with supervisors (ADR-106) | The server keeps only a slow hash, a phone only a slow-hash check; it never reaches the audit log; every use is logged on the phone and synced as a security event; a session opened with it and every record made in it are marked; the firm changes it when it chooses and each phone takes the new check at its next sync. At enrolment the server checks it with back-off | ARCHITECTURE §7.2, §7.5; ADR-281 | `packages/db/test/devices.test.ts` (AC-02-20…22); the mark: `field-events.test.ts` (AC-04-28). AC-02-23, AC-10-22 (2.4.3, 2.5.1, 2.5.4) |
| T-05 | **A monitor rewrites the day afterwards.** P2 edits a field event once they know what the other end recorded | Once a monitor submits a record on their phone it is sealed for them: the app never reopens one, and the server takes no second version of a record, so one sent again under its id with anything changed is answered "already saved" and nothing changes. Only a permitted back-office person corrects, in place, prior value kept | ADR-051, 472, 477 | AC-02-45, AC-05-08, AC-08-06: `apps/api/test/sync.test.ts` (ADR-477); the app's half is Phase 3's |
| T-06 | **One monitor fabricates a load.** P1 with P2: a collection that never happened, or a disposal with no collection | A load needs two field events by two monitors who can't see each other, joined only by the server. One alone stays `PENDING`, bills nothing and never expires; a second field event of one kind on a number is quarantined whole for a person | `adms-domain` §1.2; ADR-022, 053 | The stories `sync`, `p1-any-order`, `golden-mission`; `packages/db/test/quarantined-records.test.ts` |
| T-07 | **A bigger truck, or an inflated load call.** P1 leans on the tower monitor, or presents another truck's badge | Capacity comes only from the certification, never from a number that arrives with a record. A call is a whole number 0–100; extreme calls and a 0 are flagged; a certification that is revoked, replaced, expired or of another project is flagged; a difference between the two ends is flagged. Each still bills where an amount can be computed, and waits in one review queue | `adms-domain` §1.3; ADR-116, 164; `adms-certifications`; ARCHITECTURE §17 | `packages/domain/test/checks.test.ts`, `quantity-checks.test.ts`, `capacity.test.ts`; the stories `p1-reconciled`, `p1-reviewed` |

### 4.2 Between the phone or the browser and the server

| ID | Threat | What answers it | Source | Tested |
|---|---|---|---|---|
| T-10 | **Listening in, or standing in the middle.** P5 on the same network | HTTPS only, TLS 1.2 or newer, HSTS with its subdomains, plain HTTP redirected for a web page and refused unanswered at the API's address (ADR-511); the same between services, locally too | ARCHITECTURE §4, §6; ADR-098 | The six local services: `pnpm security` and the installer's check today. AC-10-01…04 (2.1.2, 2.1.3). Every hop inside the local stack over TLS, its certificate checked by name: AC-10-67 (2.7.3 part 5, ADR-517). Cloud certificates: the demo deploy (Phase 5a) |
| T-11 | **A replayed sync.** P5 or P2 sends a captured sync again, or a phone retries after a dropped connection | Every record carries an id the phone made; the idempotency ledger answers a record seen before "already saved" and stores nothing twice; a retry is never taken for a duplicate ticket number. A signed answer to an old challenge doesn't prove a phone again | ARCHITECTURE §9 (1), (3); KD-56 | The story `sync` (AC-05-12…15). The ledger's own tables: AC-05-16 (2.6.2). AC-10-45 (2.5.1) |
| T-12 | **A forged load call, or forged money.** P2 or P5 sends a record made by hand: a call of 140, a capacity, a rate, an amount, a completed load | **The server never accepts money, a conclusion or a capacity from a client.** Each payload is checked against its schema and unknown fields are refused; the database refuses a call outside 0–100; no endpoint and no person writes a completed load, a flag or a transaction: the API's database login can't. What a phone may send is a field event, which the worker then checks against the certification, the site and the other end | ARCHITECTURE §2, §5.1, §5.4, §6; VISION §5.7; invariant 4 | `packages/db/test/grants.test.ts`, `derived-records.test.ts`, `field-event-kinds.test.ts`. AC-10-34…38 (2.1.3, 2.4.4, 2.6.1) |
| T-13 | **A record sent as somebody else.** A phone names another monitor, another phone or another project in what it sends | The phone has proved which phone it is, and the signed-in monitor is part of its session. **What the server does when a record disagrees with the phone and monitor that sent it is not recorded** | ARCHITECTURE §6 (device sessions), §7.4; `05-sync.md` point 11 | Decided and tested by 2.6.2 (file 10, "Left to the task that builds it", point 9) |
| T-14 | **A stolen session.** P5 or P11 gets a back-office user's token | Tokens live only in `HttpOnly; Secure; SameSite` cookies, never where a page's script can read them; the access token is short-lived; the refresh token rotates, is kept by the server only as a hash and can be revoked; one used twice ends its whole family. Admins and manager/analysts need an authenticator code. **Permissions are read from the database on every request**, so taking a grant or archiving a person bites at once, whatever a token says | ARCHITECTURE §6; ADR-170 | `apps/api/test/sessions.test.ts`, `session-tokens.test.ts`, `packages/db/test/sign-in.test.ts` (AC-10-09…17; ADR-408). AC-02-14, AC-10-26: `apps/api/test/two-step.test.ts` (ADR-412). AC-02-12, 13: `apps/api/test/people.test.ts`, `packages/domain/test/people.test.ts` (ADR-415: the role and the permission asked at the door on each request; an admin ends anybody's sessions) |
| T-15 | **A hostile page acts as a signed-in person.** P9 posts a void from another site | CSRF protection on every cookie-authenticated write; `SameSite` cookies; **CORS answers only the exact origins on the configured list**: no wildcard, no pattern, so a look-alike or a neighbour on a hosting domain gets nothing (Build 1 allowed any `*.netlify.app`) | ARCHITECTURE §6, §17; ADR-098 | `apps/api/test/boundary.test.ts`, `sessions.test.ts` (AC-10-05…08, AC-10-16; ADR-391, 408) |
| T-16 | **Guessing a back-office password.** P5 tries Dana's login again and again | Sign-in backs off and locks out; rate limits per IP and per account; passwords hashed with Argon2id, long rather than complex, screened against known breached passwords; every failure and lockout is a security event; an authenticator code is still needed | ARCHITECTURE §6; NIST SP 800-63B; C35 | `packages/domain/test/sign-in-tries.test.ts`, `passwords.test.ts`, `apps/api/test/sessions.test.ts`, `password-set.test.ts` (AC-10-18…21, 23, 24; ADR-402, 403, 409). AC-10-22, 25, 26, 40 (2.2.5, 2.2.6, 2.5.1); AC-02-14: `apps/api/test/two-step.test.ts`, a wrong code counted and locking as a wrong password does (ADR-412). AC-10-40: `apps/api/test/limits.test.ts`: refused tries limited by address, and by address at one login under the login's own wait, so one address is stopped before it spends a login's tries and its owner signs in from elsewhere (how a malicious lockout is narrowed, ASVS 6.1.1; what it doesn't close: ADR-416 (5)) |
| T-17 | **Flooding the server.** P5 sends requests without end, or one enormous body | Rate limits per IP, account and device, their numbers policy values; a size limit on every body; a statement timeout on each service's database login. A limit must never lose field work: a phone told nothing was saved keeps its records and sends them again | ARCHITECTURE §5.7, §6; REQ-204, 208; ADR-030 | AC-10-39…42 (2.1.3, 2.1.4, 2.2.6, 2.6.5); AC-05-51 (2.7.2). AC-10-40: `packages/domain/test/rate-limits.test.ts`, `apps/api/test/limits.test.ts` (by address and by signed-in person, 429 `LIMITED` with `Retry-After`; the counts in the API's memory, bounded; only a listed proxy believed about a caller's address; ADR-416). Per device: 2.6.5; AC-10-71 (2.8.2, ADR-524): a request the database can't do in time (no connection free, its work or a statement past its time) is told `503 BUSY` with `Retry-After`, never a 500, so a flood that fills the pool loses no field work (`apps/api/test/database-busy.test.ts`); a shapefile's shape whose ring pairs would hold the API's process for minutes is refused before it is read (`MAP_FILE_RING_PAIRS_AT_MOST`, `map-file-reader.test.ts`) |

### 4.3 The API

| ID | Threat | What answers it | Source | Tested |
|---|---|---|---|---|
| T-20 | **A contractor's login reaches another prime's tickets.** P6, Coastline's contractor user, asks for Summit's ticket `101044` by its id | A contractor user sees only its own tickets and transactions (a prime with its subs'). The API checks it, **and the database checks it again**: every read by the read-only login is filtered by row-level security on the viewer's own record, and a request that states no viewer sees nothing. A viewer's money is read only through its own view | ADR-169; ARCHITECTURE §5.5; C22, C76 | `packages/db/test/row-level-security.test.ts`, `viewers.test.ts`, `contractor-users.test.ts`. AC-02-69, 74, AC-10-29…31 (2.4.5) |
| T-21 | **A viewer changes something.** P6 sends a write | A read-only viewer has no write of any kind: the role is refused at the API, and the read-only database login holds only `SELECT` | ADR-050; ARCHITECTURE §5.1 | `packages/db/test/grants.test.ts`. AC-10-31 (2.4.5) |
| T-22 | **Acting past one's grants.** P7, Luis without *unlock*, unlocks an invoiced ticket; or grants himself *void* | Every action has its own grant, checked on the request and again by the service inside the piece of work; nobody grants what they don't hold; the last admin can't be removed | ARCHITECTURE §6; ADR-050, 364 | The services' own check: the stories `p1-reviewed`, `p1-voided`, `p1-invoiced`. **At the door, ✅ 2.2.5 (ADR-415):** `apps/api/test/people.test.ts` (AC-02-12, 13; the last admin at the database too, `packages/db/test/people.test.ts`). AC-08-05, AC-09-18, AC-10-27, 28 on the real review calls: 2.4.4 |
| T-23 | **A dishonest admin, or anybody, edits the record quietly.** P8 changes a load call, or tidies the audit log | Not prevented: an admin may correct. **But never without trace.** Every write states its actor or is refused; the database's own trigger writes the audit record with the prior value; no login can update or delete an audit record, or delete anything; a removed transaction is first copied whole; an invoiced ticket must be unlocked first, itself audited | ARCHITECTURE §5.2, §5.3; invariants 1…3 | `packages/db/test/actor.test.ts`, `audit.test.ts`, `no-delete.test.ts`, `transaction-delete.test.ts`, `marks.test.ts` |
| T-24 | **Sign-in as the system.** P5 tries the worker's own actor, which may write derived records | Role `SYSTEM` is never a login: it has no password and sign-in refuses it | ADR-273 (4); C21 | `packages/db/test/system-actor.test.ts`; `apps/api/test/sessions.test.ts` (AC-10-17; ADR-409) |
| T-25 | **A poisoned upload.** P2 or P5 sends a file that isn't a photograph, an enormous one, or one swapped after capture | Files come only through the media endpoint: type and size checked, the fingerprint checked against the one the phone took at capture, stored outside the web root, one immutable object each, never overwritten, never run. The API's store identity can't delete a bucket | ARCHITECTURE §6, §11; ADR-101, 263 | The photograph's record: `packages/db/test/scale-receipts-and-photos.test.ts`. The store and its identity: `apps/api/test/media-store.test.ts` (ADR-480). The media endpoint (ADR-482): `apps/api/test/photo-files.test.ts` (size, kind, fingerprint, kept once, a swapped file set aside for a person, only the phone that took it, its own rate limit), `packages/domain/test/photo-files.test.ts`. A file read back by the back office (ADR-483): the bytes kept, a download never run, and a file swapped at the store by somebody with its keys never handed back as the photograph's (`photo-files.test.ts`); a phone's file changed after it was fingerprinted, set aside, as a story (`interrupted-upload`). AC-05-09, AC-04-77, AC-10-47…49 |
| T-26 | **A leaked log.** P11 reads the API's logs, an error message or the audit log | Logs are structured, carry a request id, and never hold a secret, a token, a password or a full personal detail. An answer never carries a stack trace or an internal error. A password hash, an authenticator secret and the master passcode's hash are kept out of the audit log: it says they changed, never what to. The installer never prints a secret | ARCHITECTURE §4, §6; ADR-281 (7); C21 | `packages/db/test/devices.test.ts` (AC-02-22); `tools/setup/test/secrets.test.ts`; the secrets scan in `pnpm security`. AC-10-32, 33, AC-10-11 (2.1.2, 2.2.1) |
| T-27 | **A rate or a rule reaches a phone.** P2 reads the phone's lists to learn what pays best | A phone's lists never carry a rate, a rule, a transaction or a load's pay item code; monitors pick by name | ADR-207, 224; invariant 20 | AC-02-37, AC-07-91 (2.5.3: a test reads every list) |
| T-28 | **An endpoint nobody listed.** P5 finds a route with no check on it | Every payload is a schema in `packages/contracts` and OpenAPI is generated from them, checked current in the chain; each endpoint is tested as each kind of caller, the refusals included, in the task that adds it | REQ-004; C23; BACKLOG, Phase 2's brief | AC-10-36, AC-10-27 (2.1.3, then every endpoint's task); the item-by-item list: 2.7.3 |

### 4.4 The worker and the queue

| ID | Threat | What answers it | Source | Tested |
|---|---|---|---|---|
| T-30 | **Billing the same load twice.** Two syncs reconcile one group at once, or a job runs twice | One run per project at a time under a database lock; a pair's links on its completed record are unique; a run over unchanged input changes nothing | ARCHITECTURE §13; invariant 17 | `packages/db/test/derived-records.test.ts`; the worker's stories. AC-10-52, 53 ✅ 2.3.2 (ADR-419): the story `p1-queued` |
| T-31 | **A half-written result.** The worker dies between writing a load and its transactions | One group, one transaction: the completed record, its transactions and their audit rows commit together or not at all; a job is queued in the same piece of work as the change that asks for it | ARCHITECTURE §13; KD-55 | The worker's stories. AC-10-50: **the job with its change, ✅ 2.3.1 (ADR-418):** `packages/db/test/job-queue.test.ts`, `reconciliation-jobs.test.ts`; the review services' own calls, ✅ 2.3.3 (ADR-420): the story `p1-reviewed` (a job that can't be written undoes Luis's correction) |
| T-32 | **One bad ticket stops the night.** A record the worker can't work | A group that errors is flagged and skipped; the rest of the run goes on | ARCHITECTURE §13 | The worker's stories (`spec/FLAGS.md` `NOT_PROCESSED`). The process, 2.3.2 (ADR-419): a ticket that errors fails no job; a try that fails whole is counted and the job set aside after five (the story `p1-queued`) |
| T-33 | **A request that makes the caller wait on reconciliation**, so a burst of syncs ties the API up | No endpoint reconciles: a sync, a correction, a void or a setup change queues work and answers | ARCHITECTURE §9 (7), §13; REQ-206 | AC-05-53, AC-10-51: in part, 2.3.3 (ADR-420): every review and setup service queues its job in its own piece of work and no caller asks the worker; a sync's job: 2.6.2 |
| T-34 | **Settled work reopened by the machine.** A run re-decides a voided or accepted ticket | A void stays until a person unvoids it; a run works only the tickets a job names, and a settled ticket stays off the queue until it or its setup changes | ADR-360 | The story `p1-voided`. AC-10-54 in part, 2.3.2 (ADR-419): the queue's run works only the tickets its jobs name (the story `p1-queued`); which tickets a change names, ✅ 2.3.3 (ADR-420): its own and their neighbours, never a void ticket among a setup change's or the neighbours (the stories `p1-voided`, `p1-reviewed`) |

### 4.5 The database and the object store

| ID | Threat | What answers it | Source | Tested |
|---|---|---|---|---|
| T-40 | **Application code is wrong, or taken over.** P5 through a flaw in the API | The database holds the rules itself: a login per service with the least it needs; the API can't write a derived record and the worker can't write evidence; no deletes; append-only audit; constraints. Every new table of Phase 2 is guarded the same way | ARCHITECTURE §5; ADR-097 | `packages/db/test/grants.test.ts`, `catalog.test.ts`, `guard-table.test.ts`, `checks.test.ts`; `guard_gaps()` empty. Each Phase 2 schema task adds its own |
| T-41 | **Injected SQL.** P5 puts SQL in a field | Every query goes through Prisma; no hand-written SQL for modelling; input is checked against its schema first | ADR-094; invariant 12; ARCHITECTURE §6 | ✅ REQ-205's check, 2.7.3 part 1 (ADR-508): `pnpm security`'s "Who reaches Postgres": the product's SQL only Prisma's tagged templates, never a call that takes SQL as a plain string, none changing the schema; only the database package and the two server apps reach Postgres (AC-10-56) |
| T-42 | **A long query holds the database.** By accident or on purpose | A statement timeout on each service login, set by the installer from a policy value; pool limits | ARCHITECTURE §5.7; REQ-208 | AC-10-42 (2.1.4) |
| T-43 | **The database or a backup is copied.** P11 | TLS to the database outside local runs; a separate credential per role; secrets outside the repository. Passwords, the master passcode and refresh tokens are held only as hashes | ARCHITECTURE §4, §5.7, §6 | Hashes: `devices.test.ts` (AC-02-20); AC-10-10, 20 (2.2.1, 2.2.2). TLS to a cloud database and backups: the demo deploy (Phase 5a; C25, C33) |

### 4.6 The install, the build and the repository

| ID | Threat | What answers it | Source | Tested |
|---|---|---|---|---|
| T-50 | **A poisoned dependency.** P10 | Exact versions only; nothing younger than seven days; no install script unless named; no git or tarball dependency pulled in by another; a lockfile; every advisory fails the run unless accepted by name in an ADR; a licence check; each new dependency its own ADR | ADR-255, 276; ARCHITECTURE §16, §18 | `pnpm security` (7 passed, 0 failed, seen 2026-10-06); `pnpm licences`; the clean-copy check (`adms-verify`) |
| T-51 | **A secret committed or printed.** By a person or an agent | Secrets are generated at install, kept in git-ignored env files, never printed, never rotated on a resume; a secrets scan runs with the tests; dev-only seeded accounts live in the dev stack only and are held out of what ships by `infra/local/test/dev-accounts.test.ts` (AC-10-26), whose values match no rule of the scan | ARCHITECTURE §4; ASVS 13.3.1 (`spec/CHECKLIST-API.md`); ADR-170, 276, 509 | `tools/security/test/checks.test.ts`, `tools/setup/test/secrets.test.ts`; `pnpm security`. Phase 2's kinds (2.7.3 part 1, ADR-508): a whole slow hash, an authenticator's secret and a private key as a JWK found in any file a commit would take, a test's own vector named with its reason |
| T-52 | **A guard quietly removed.** A later change drops a trigger or a grant | Guards are their own migrations, never edited once applied; the catalogue test lists every table's guards exactly; each guard's removal has been shown to be caught | ADR-113; ARCHITECTURE §5.6 | `packages/db/test/catalog.test.ts`, `migrations.test.ts`, `guard-table.test.ts` |

---

## 5. What the software records but does not stop

Said plainly, so nobody reads more into the controls than is there.

1. **People who agree to lie.** Two monitors, or a monitor and a hauler, can record a load that
   didn't happen as told. The system leaves two GPS fixes, two times, photographs and two named
   people on two named phones, and flags what disagrees.
2. **An honest load call that is wrong.** A call is a person's judgment. Only extremes are flagged
   (ADR-164).
3. **An admin.** An admin may do everything, setup and corrections included. Nothing they change
   is hidden (T-23), and nothing is checked by a second person unless the firm's own QC does.
4. **The master passcode's reach.** One value for the firm, shared with supervisors, changed when
   the firm chooses (ADR-106). Whoever holds it can sign in as a phone's monitor; every use is
   marked and logged, none is stopped.
5. **A monitor's password.** By the firm's practice it is seven digits a coworker may know
   (ADR-105). The controls of T-01 stand in for it.
6. **A phone with no screen lock.** The encrypted store's protection rests on the phone's own
   lock, which is the firm's device management (ARCHITECTURE §7.2 (5), §8).
7. **The firm's own hosting.** Open ADMS is installed and run by the firm (ADR-099): its
   network, its backups and its operators are its own to secure.

## 6. Not this phase's

| What | Whose |
|---|---|
| A penetration test by someone outside the build | Before a firm's first live mission, on the demo deploy (C40 (b), Phase 5a) |
| How a vulnerability is reported and a fix reaches installations | A root security policy file, the user's to approve, before the repository is public (C40 (c); Q-167) |
| The field app's own checklist (OWASP MASVS): the store, the key in real secure hardware, the wipe | Phase 3 |
| The web apps' page headers (CSP, `frame-ancestors`) and their end-to-end tests | Phase 4 |
| TLS to a cloud database, pgAudit, the CIS PostgreSQL items a cloud host decides, monitoring and alerts | The demo deploy (Phase 5a; C25, C33, C38) |

**This page is read again** whenever a phase opens and whenever a layer is added, and each
Phase 2 task reads its rows before it builds (BACKLOG, Phase 2's brief).

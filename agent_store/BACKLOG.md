# Open ADMS — Backlog

> Milestone detail for the active phase. Read when picking up new work; the single active task
> is in `agent_store/NEXT.md`. Tick boxes as you complete them.

## Active — Phase 3: Field app *(opened by the user 2026-10-17, ADR-557; this plan is ADR-558)*

**What Phase 3 is.** Phase 2 built the server every phone screen calls: enrolment and a phone's
proof, a monitor's sign-in and the assignment it takes, the lists, the login list, the master
passcode's check, the address lookup, the sync (records, then photographs by a resumable upload),
turn-in, and **the sync contract's suite any client must pass** (`syncClientSuite`). **Phase 3
builds the phone against that contract and adds no rule**: the browser build first, then the
iPhone, then Android (ADR-099), one codebase (`apps/field`, React + Vite + Capacitor, ARCHITECTURE
§3, §18). The one server half that is Phase 3's own is the time clock's records (REQ-310;
ADR-519's rule: a phase's own server work never moves to a later phase by agent default). **Done
when** the golden mission's field events are captured through the field app's screens and come out
with the numbers the user approved, every scenario with a Phase 3 part passes at its layer
(`spec/acceptance/11-field-app.md`: 123), and its 33 REQs are ticked from runs that were seen. Exit
criteria: `NEXT.md`.

**The order** (ADR-558): the answer and the foundation → the phone's store, identity and sign-in →
the master passcode on the phone → **sync from the phone, before any capture screen**, so every
screen is proven through to the server and nothing against a stand-in (as Phase 2 built jobs before
the endpoints that queue them, ADR-377 (2)) → capture → photographs, printing and scanning → the
time clock → iPhone → Android → prove it.

### Brief for every Phase 3 task (ADR-558)

- **One task per response**, whole (ADR-516). Each ends with real observed output (`adms-verify`),
  the close-out (`adms-close-out`) and the user's git block with named paths. Don't tick a box on
  "should work".
- **Read first:** `spec/acceptance/11-field-app.md` (the task's rows, and section L's); ARCHITECTURE
  §7…§12, §15, §16 and the ⚠️ notes in them; `adms-field-app` §4A (every capture rule); the
  owning skill for the workflow (`adms-ticket-workflows`, `adms-certifications`, `adms-exceptions`);
  `spec/CHECKLIST-FIELD.md` once 3.1.1 has written it; the task's carried items in the register.
- **No new rule.** The phone works out a capacity, a split's share, a pay item from its bands, a
  number from its block with `packages/domain`, and speaks only the payloads of
  `packages/contracts`. A rule nothing records is an ADR (agent default, or a question under
  ADR-230), written into `packages/domain`, never into a screen. **The phone warns and never
  blocks** (ADR-052); it holds no rate, rule or load's pay item (invariant 20).
- **The phone reaches the server only through the API**, over HTTPS, as `PROVEN_PHONE` or
  `MONITOR_ON_PHONE`; a call it needs that the API doesn't serve is a Phase 3 server task with the
  endpoint recipe (the register's standing rules), never a workaround.
- **Every screen, in the task that adds it:** its words from the translation file (ADR-172); a
  browser end-to-end test named by its scenario IDs, against the local stack over HTTPS; **the
  WCAG 2.2 AA automated check with no violation** (ADR-559); it works with the network off; **it
  is built from 3.1.4's components and tokens, in ADR-561's direction**.
- **Every dependency gets an ADR first** (exact version, at least seven days old, licence
  compatible with AGPL-3.0, maintenance; `pnpm licences` and `pnpm security` after, the clean-copy
  check). Phase 3 brings React, Vite, the browser end-to-end tool, the accessibility checker,
  React Aria (ADR-561), Capacitor and its plugins (SQLCipher storage, secure storage, camera, the Zebra printer); Zebra's
  SDK licence is read before it is taken.
- **A secret never appears** in a log, a crash report, the web layer's storage, a test's output or
  this conversation; the master passcode is held in memory only for the act it opens.
- **On-device runs need the user** (a real iPhone and Android phone, a Zebra ZQ printer, Xcode and an
  Apple developer account): the task says what it needs before it starts, runs it with the user,
  and records what was seen. Never tick an on-device row from a simulator alone.
- **Not Phase 3's:** the back office's and the portal's screens, the time clock's approval screen
  and export, the receipt batch (Phase 4); the demo deploy and the app stores (Phase 5a). Don't
  build ahead.
- **A REQ is ticked, and a scenario marked passing, only from a run you saw.**
- Docker's disk here is 8 GB (`NEXT.md`, Tools and housekeeping); stop the stack at close-out.

### Milestone 3.0 — Open the phase
- [x] **3.0.1 Open the phase** ✅ done 2026-10-17 (ADR-557…560): the plan; the 33 REQs moved; the
  phone's scenarios written (`spec/acceptance/11-field-app.md`, 60 new and 50 listed); the
  accessibility standard asked first and answered (WCAG 2.2 AA; a conformance report per app at
  its phase's end). C163 done; C41's question answered.

### Milestone 3.1 — The answer and the foundation (ARCHITECTURE §3, §15, §16, §18)
- [x] **3.1.1 The field app's security checklist** (REQ-323 in part; C156): `spec/CHECKLIST-FIELD.md`,
  OWASP MASVS control by control, its version and profile said with what the standard asks before
  choosing (ADR-401), each control answered by a named scenario or test or the phase that owns it;
  file 11's Answers column given each control's number; the threat model's phone rows (§4.1, §6)
  read again; certificate pinning and the app-switcher snapshot proposed (file 11, left 1).
  ✅ done 2026-10-18 (ADR-562): MASVS v2.1.0's 24 controls and MASWE v1.0.0's 78 weaknesses
  answered; MAS-L2 + MAS-P proposed, MAS-R not taken; pinning and the app-switcher cover proposed
  to the user; AC-11-61…73 added and put on their tasks' lines below; T-08, T-09 added. C156's
  checklist part done. What it leaves: the page answered whole at 3.10.2; the user's word on §1.3,
  §4.1, §4.2.
- [x] **3.1.2 The shell, its door and the browser end-to-end layer** (REQ-006, REQ-301 in part;
  C24, C86, C31, C112 in part; AC-11-01…04, 06, 61, 69, 72, AC-10-08): `apps/field` as React + Vite and the
  browser end-to-end tool (ARCHITECTURE §15 names Playwright as an example), each by ADR, the tool
  a step of `pnpm chain` with its counts in `CHAIN.md`; the browser build served
  over HTTPS through Caddy at `https://field.adms.localhost`; its origin and the native origins on
  `ADMS_CORS_ORIGINS`, the object store's CORS list widened as C24 says; the page's headers; the API
  called with `Authorization` across origins; the translation file from the first screen; the
  UUIDv7 maker moved to `packages/domain`; a check that `apps/field` holds no rule and no payload
  shape.
  ✅ done 2026-10-18 (ADR-563…565): React 19.3.0 on the Vite already pinned, no plugin; Playwright
  1.64.0 on Chromium's headless shell, `pnpm e2e` a step of `pnpm chain`; the shell's first screen
  served at `https://field.adms.localhost`, its policy and headers said once (`apps/field/page.ts`);
  the CORS list the field app's three origins; the API's address the build's
  (`ADMS_FIELD_API_ORIGIN`); the translation file; the UUIDv7 maker in `packages/domain`; the
  checks of what `apps/field` holds; the secrets scan over the built bundle. C24, C31 done; C86's
  and C112's parts done. **The object store's CORS list was not widened** (no page reaches it:
  ADR-565 (5)). What it leaves: C175, C176; C86's back office part (Phase 4).
- [ ] **3.1.3 The accessibility check** (REQ-324 in part; C41; AC-11-51): an automated WCAG 2.2
  A/AA checker by ADR, run on every screen the browser end-to-end tests reach, against the local
  stack; a screen they don't reach fails the chain; counts in `CHAIN.md`.
- [ ] **3.1.4 The look, the components and the prototype** (REQ-301, 324 in part; ADR-561;
  file 11, left 2 and 8): React Aria by ADR; the look as tokens (the light theme first, the dark
  theme, type, spacing, the main button's height); the components ADR-561 (6) lists, each through
  3.1.3's check; the status strip and the home screen built on them, the shell's first screen put
  in the look. **Then the key screens shown to the user as a clickable prototype** (home, a
  collection, the tower, unit rate, sync), with the open designs put to them, each with ADR-561
  (7)'s recommendation: a confirmation after each value, a monitor scorecard, the bottom menu, the
  number typed again by hand. Their answers are ADRs and scenarios in file 11; none is built
  before them.

### Milestone 3.2 — The phone's store, identity and sign-in (ARCHITECTURE §7.1, §7.2, §7.4, §8)
- [ ] **3.2.1 The encrypted store** (REQ-302's browser half; AC-02-19, AC-11-07, 08, 10): one store
  for records, the photographs waiting, the lists, the login list, archived queues and kept answers;
  the browser build's IndexedDB under a WebCrypto key that can't be exported, made from no password;
  the interface the native SQLCipher store implements in 3.8.1 and 3.9.1.
- [ ] **3.2.2 Enrolment and the phone's proof** (REQ-311 in part, REQ-311a; C110, C111, C112, C113;
  AC-02-07, 18, AC-11-11…13): the device key (ECDSA P-256, DER), enrolment under the master passcode,
  the token in secure storage, proving again on `PHONE_NOT_PROVEN`; "Create monitor".
- [ ] **3.2.3 Online sign-in and the assignment** (REQ-311, 308b, 125c; C114, C115, C117, C133;
  AC-02-35, 36, AC-07-91, AC-11-14…18, 54, 63): the monitor's token beside the phone's; `noAssignment`'s
  words; the lists and the menu from the assignment; how stale the lists are; read again when the
  setup version differs.
- [ ] **3.2.4 The login list and signing in offline** (REQ-311; C120, C141 in part, C143, C151;
  AC-02-39…41, AC-11-19…21, 63, 64): the login list asked and kept; the two-step check (an Argon2 that
  takes raw bytes in the browser build, by ADR); tries backed off after 5, locked after 10 until
  the passcode; the inactivity lock and its warning; an offline sign-in reported first; a story of
  signing in offline.

### Milestone 3.3 — The master passcode on the phone (ARCHITECTURE §7.3, §7.5)
- [ ] **3.3.1 Setup with no assignment** (REQ-311; C122, C125; AC-02-38, AC-11-23…25, 63): the passcode in
  memory only; the project, then the work, site and monitor, paged; offline only on the project
  whose lists it holds; the unplanned assignment's report kept until saved and sent first.
- [ ] **3.3.2 Switching, moving and passcode sessions** (REQ-312; C123, C124, C126, C171; AC-02-42,
  46, 47, AC-11-26, 27, 64): a switch (the earlier monitor's unsynced work archived, hidden, synced in
  the background) and a move, offline if need be; sessions as the phone's monitor and temporary,
  marked, ended at the project's midnight; `masterPasscodeSession` on every field event; each use
  logged; what ten wrong tries offline does, proposed by ADR (file 11, left 3).

### Milestone 3.4 — Sync from the phone (ARCHITECTURE §8, §9, §11)
- [ ] **3.4.1 The phone's `SyncClient`** (REQ-308, 308c; C127, C128, C130, C132, C133, C139, C152,
  C153, C166, C168; AC-05-01, 06, 07, 08, 20, 46, AC-11-22, 28…31): `syncClientSuite` passed against
  the app's own store; splits by weight and count; waits waited out; `NOT_SAVED` shown and kept, a
  kept record resent with its fingerprint (when: by ADR, ADR-470 (3)); syncs only while somebody is
  signed in; what it holds said in every sync.
- [ ] **3.4.2 Photographs' files** (REQ-316's sync half; C137, C138; AC-11-32, 33): parts no larger
  than `MEDIA_PART_BYTES_AT_MOST`, smaller on a poor signal; `photoFileEndpoint` after a restart;
  `OWNER_NOT_SAVED` kept and resent; a held record's photographs.
- [ ] **3.4.3 Sync and turn in, and the wipe** (REQ-313, 124c; C69, C141, C170; AC-02-58, AC-05-56,
  AC-11-08, 34, 35): turn-in under the passcode, the server's words and what's missing shown; the
  wipe only on `wipe: true` (the data key and the device key erased, NIST SP 800-88);
  `MASTER_PASSCODE_NEEDED` at a proof; held things named by `sentCanonical`'s SHA-256; a reset
  phone's blocks reclaimed.

### Milestone 3.5 — Capture (`adms-field-app` §4A; `adms-ticket-workflows`)
- [ ] **3.5.1 The collection, and what every capture shares** (REQ-303, 308a, 309, 317 in part, 318,
  319; C68, C96, C121, C135; AC-02-44, 45, AC-04-08, 11, 24, 91, 92, 95, 96, 98, AC-08-06,
  AC-11-05, 36…39, 68): badge first, number last; a badge not in the lists warned, refreshed or keyed by
  hand; the debris type and field tag by name; GPS and waypoints; the address looked up or typed;
  normal or split, and the split chain; the number scanned or shown and entered again, a typed one
  with its reason; the phone's own duplicate check; cancel; sealed at submit. The number entered
  twice as the user answered it at 3.1.4's prototype (WCAG 3.3.7; file 11, left 2).
- [ ] **3.5.2 The tower and the haul-out** (REQ-304, 305, 124f, 321; C74, C83, C97, C100; AC-04-38,
  44, AC-11-40, 41): the site from the assignment; the debris type picked on its own; one quantity
  from the site's lookup (the load call typed 0–100, the scale weight and receipt, or the count of
  tickets carried); no ticket list; the haul-out's call at its loading end, split piles; a
  handwritten disposal receipt on a control-ticket project; a load turned away gets nothing.
- [ ] **3.5.3 Unit rate** (REQ-306, 320, 112b; AC-04-70, AC-11-43): the crew badge kept and
  confirmed; the crew photo; the payable type by name; each kind of work's screen (a count, a
  measurement, a stump, items, items with hours); the pay item from the domain's bands; ineligible
  where the pay item allows; one GPS point; the number generated and entered again.
- [ ] **3.5.4 Forms** (REQ-307; C66, C67, C69, C118's last part; AC-04-101): the ROE (a number from
  the block or typed), pre- and post-work surveys (the post-work picks from ROEs whose pre-work
  survey is done), the incident (type, sub-type, what its form offers), the citizen drop-off log,
  the firm's own fields, "GPS required", photo fields.
- [ ] **3.5.5 Certifying on a phone, and the truck keyed in by hand** (REQ-322, 317; C118, C127,
  C129; AC-03-09, 14, 36, AC-11-42): the prime, the vehicle or crew type, each box's feature and the
  helpers picked from the lists, a sub typed with suggestions; the capacity from `Capacity`, shown
  and never typed; five views; the cert number from the block or the pre-printed sheet; the boxes
  sent; a hand-keyed truck's typed capacity, every detail not recorded `null`.

### Milestone 3.6 — Photographs, printing and scanning, in the browser build (ARCHITECTURE §11, §12)
- [ ] **3.6.1 Photographs** (REQ-316's browser half; AC-04-79, AC-11-44, 68): from the camera only, at
  most 8 per ticket and a certification's five views; SHA-256 at capture; the native shrink's
  interface (the browser build keeps the original).
- [ ] **3.6.2 Receipts** (REQ-314's browser half, 315 in part, 321; AC-04-97, AC-11-46…48, 50): one
  receipt content model (its package by ADR: the back office's receipt batch reads it too), to PDF
  and ZPL; Code 128 of the bare number; every project prints; reprinted at any time, never
  recorded; the printable control-ticket test set.
- [ ] **3.6.3 Scanning** (REQ-315's browser half; AC-11-49): a keyboard-style scanner and the camera
  where the browser allows; anything printed scans back and an existing ticket says so; a scan
  outside the control ranges questioned.

### Milestone 3.7 — The time clock (REQ-310; ADR-241)
- [ ] **3.7.1 The time clock's records** (REQ-310's server half; AC-02-54, 55): the clock's records
  (in, breaks, out, activity lines, the day approved and unlocked), their guards and audit, the
  sync's kind that carries them (a contract change), a manager's approve and unlock by the endpoint
  recipe, the read its export needs; a viewer never sees hours; never related to crew time.
- [ ] **3.7.2 The phone's clock** (REQ-310; AC-02-50…52): clock in, breaks and out by hand on the
  assignment; the two nudges; activity lines pre-filled from the day's field events, extra lines
  from the firm's list, approved by the worker. *The approval screen and the export: Phase 4.*

### Milestone 3.8 — iPhone (ARCHITECTURE §3, §8, §11, §12, §15)
- [ ] **3.8.1 The iOS build, its store and its key** (REQ-301, 302; C110, C111, C156; AC-10-44,
  AC-11-03, 07, 09, 11, 13, 61, 62, 65…67, 69…73): Capacitor by ADR; the SQLCipher store, its data key in the Keychain
  this-device-only; left out of backups; the device key in the Secure Enclave (the 65-byte point
  under its fixed header), DER signatures; tokens in secure storage. From the checklist
  (`spec/CHECKLIST-FIELD.md`, ADR-562): the key's accessibility class; HTTPS only and the pins as
  the user answers §4.1; the app-switcher cover (§4.2); other makers' keyboards refused; no link,
  scheme or extension; release builds without debugging; the minimum iOS and the newest SDK; the
  oldest app version's server half (§4.5, by the endpoint recipe); the native libraries audited;
  the screen-lock notice.
- [ ] **3.8.2 The native camera and scanning** (REQ-316, 315; C137; AC-11-44, 45, 49, 68): full
  resolution; the shrink at the original resolution keeping location, time and depth (or depth
  linked); both hashes; sizes measured on a real iPhone into configuration; the camera scanner.
- [ ] **3.8.3 Printing to a Zebra ZQ** (REQ-314, 315; AC-11-47, 50): the native plugin on Zebra's
  SDK, ZPL over Bluetooth; the test set scanned off paper.
- [ ] **3.8.4 On a real iPhone** (ARCHITECTURE §15; AC-11-05, 10, 34, 56, 57): airplane mode through
  a day, printing, scanning, the camera, encryption, turn-in, VoiceOver and the largest text; run
  with the user, what was seen recorded.

### Milestone 3.9 — Android
- [ ] **3.9.1 The Android build** (REQ-301, 302, 314…316; C110; AC-10-44, AC-11-03, 07, 09, 11, 13,
  44, 45, 47, 49, 50, 61, 62, 65…70, 72, 73): the Keystore key (SubjectPublicKeyInfo); backups off and the data-extraction
  rules; the SQLCipher store; the camera and shrink; the Zebra plugin; the scanner. From the
  checklist (ADR-562): as 3.8.1's list for Android, no component exported but the launcher, and
  the submit and passcode controls ignoring touches under another app's overlay where the minimum
  Android doesn't stop it (MASWE-0039).
- [ ] **3.9.2 On a real Android phone** (AC-11-05, 10, 34, 56, 57): as 3.8.4, TalkBack in place of
  VoiceOver; run with the user.

### Milestone 3.10 — Prove it
- [ ] **3.10.1 The golden mission through the field app**: the browser end-to-end tests capture every
  field event of the mission's phones through the screens and sync it through the real endpoints;
  the approved statuses, review queue and ledger (P1 $5,548.25 on 19 lines; P2 $324.00).
- [ ] **3.10.2 The checklist and accessibility, whole** (REQ-323, 324; AC-11-55, 57…60): MASVS
  answered whole; every screen reviewed by hand against WCAG 2.2 AA and the review recorded; the
  field app's Accessibility Conformance Report (VPAT format) written (ADR-559).
- [ ] **3.10.3 The phase exit**: the chain green; three full runs in a row of the browser end-to-end
  tests and `pnpm scenarios`; every Phase 3 scenario counted N of M; the REQs ticked or moved; the
  register swept (no "no task yet" of the field app's).

**Every one of Phase 3's 33 REQs is named by a task:** 006 → 3.1.2 · 112b → 3.5.3 · 124c → 3.4.3 ·
124f → 3.5.2 · 125c → 3.2.3 · 301 → 3.1.2, 3.8.1, 3.9.1 · 302 → 3.2.1, 3.8.1, 3.9.1 · 303 → 3.5.1 ·
304, 305 → 3.5.2 · 306 → 3.5.3 · 307 → 3.5.4 · 308, 308c → 3.4.1 · 308a → 3.5.1 · 308b → 3.2.3 ·
309 → 3.5.1…3.5.5 · 310 → 3.7.1, 3.7.2 · 311 → 3.2.2…3.2.4, 3.3.1 · 311a → 3.2.2 · 312 → 3.3.2 ·
313 → 3.4.3 · 314 → 3.6.2, 3.8.3, 3.9.1 · 315 → 3.6.2, 3.6.3, 3.8.2, 3.8.3, 3.9.1 · 316 → 3.4.2,
3.6.1, 3.8.2, 3.9.1 · 317 → 3.5.1, 3.5.5 · 318, 319 → 3.5.1 · 320 → 3.5.3 · 321 → 3.5.2, 3.6.2 ·
322 → 3.5.5 · 323 → 3.1.1, 3.10.2 · 324 → 3.1.3, 3.10.2.

---

## Done — Phase 2: API and sync *(opened by the user 2026-10-06, ADR-376; this plan is ADR-377; its exit of 2026-10-14, ADR-518, withdrawn: reopened the same day, ADR-519, Milestone 2.8; its exit of 2026-10-17, ADR-537…540, withdrawn: reopened the same day, ADR-552, Milestone 2.9; exit met a third time 2026-10-17, ADR-555; Phase 3 opened, ADR-557)*

**What Phase 2 is.** Phase 1 built everything a request will call, with no HTTP. Phase 2 puts the
server in front of it: the API as a running process over HTTPS, sign-in and permissions, a phone's
enrolment and its proof of itself, the sync endpoints, and reconciliation as queued jobs drained by
the worker's own process. **It adds no rule: it wraps, signs in, queues and hardens**
(`REQUIREMENTS.md`, Phase 2). **Done when the golden mission syncs through the real endpoints, is
reconciled by queued jobs, and comes out with the numbers the user approved** (P1 $5,548.25 on 19
lines, P2 $324.00), every scenario with a Phase 2 part passes at the API, and its 14 REQs are
ticked from runs that were seen. Exit criteria: `NEXT.md`.

**The order** is `ROADMAP.md` §4's, with jobs moved ahead of the endpoints that queue them: the
answer and the foundation → sign-in, sessions and permissions → jobs and the worker's process → the
back office's endpoints → phones (enrolment, sign-in, the lists) → sync → prove it.

### Brief for every Phase 2 task (ADR-377)

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


*Each finished task in one line; its full tick is in `agent_store/ARCHIVE.md`, "Moved 2026-10-15 (ADR-532)", and its ADRs.*

### Milestone 2.0 — Open the phase
- [x] **2.0.1 Open the phase** ✅ done (ADR-376, 377)

### Milestone 2.1 — The answer and the foundation (ARCHITECTURE §6, §16)
- [x] **2.1.1 The threat model and the API's scenarios** ✅ done (ADR-379)
- [x] **2.1.2 The API as a process** ✅ done (ADR-380…385)
- [x] **2.1.3 The boundary** ✅ done (ADR-387…392)
- [x] **2.1.4 Time limits and policy for the services** ✅ done (ADR-394, 395)

### Milestone 2.2 — Sign-in, sessions and permissions (ARCHITECTURE §6, §7.0; Part 2)
- [x] **2.2.1 Sign-in's records** ✅ done (ADR-397…399)
- [x] **2.2.2 Passwords** ✅ done (ADR-402…406)
- [x] **2.2.3 Sessions** ✅ done (ADR-407…411)
- [x] **2.2.4 Two-step sign-in** ✅ done (ADR-412, 413)
- [x] **2.2.5 Permissions on every request, and people** ✅ done (ADR-415)
- [x] **2.2.6 Rate limits** ✅ done (ADR-416)

### Milestone 2.3 — Jobs and the worker's process (ARCHITECTURE §13)
- [x] **2.3.1 The job queue** ✅ done (ADR-418)
- [x] **2.3.2 The worker as a process** ✅ done (ADR-419)
- [x] **2.3.3 What queues work** ✅ done (ADR-420)

### Milestone 2.4 — The back office's endpoints (REQ-201, 207)
- [x] **2.4.1 The services Phase 1 left to a story's hand** ✅ done (ADR-423)
- [x] **2.4.2 Setup's endpoints.** ✅ done (ADR-424…427)
- [x] **2.4.3 Dispatch and phones, from the back office.** ✅ done (ADR-428, 429)
- [x] **2.4.4 Certifications and review.** ✅ done (ADR-430…433)
- [x] **2.4.5 The read-only viewer's path.** ✅ done (ADR-434, 435)

### Milestone 2.5 — Phones: enrolment, sign-in, the lists (ARCHITECTURE §7, §7.4, §7.5; Part 2)
- [x] **2.5.1 Enrolment and a phone's proof of itself.** ✅ done (ADR-436, 437, 439, 440)
- [x] **2.5.2 Monitors on phones.** ✅ done (ADR-441…444)
- [x] **2.5.3 The lists a phone takes.** ✅ done (all five parts, ADR-449…451, 453…455)
- [x] **2.5.4 What a phone reports besides field events.** ✅ done (ADR-456…458, 462…464)

### Milestone 2.6 — Sync (ARCHITECTURE §9, §11; Part 5) ✅ complete 2026-10-13 (2.6.3 withdrawn, ADR-477)
- [x] **2.6.1 The sync contract.** ✅ done (ADR-466, 467, 469, 470)
- [x] **2.6.2 Records.** ✅ closed (ADR-471…475)
- [x] **2.6.3 The edit log.** ✅ withdrawn (ADR-477)
- [x] **2.6.4 Photographs.** ✅ closed (ADR-478…485)
- [x] **2.6.5 A phone out of service, and turn-in.** ✅ closed (ADR-487…490)

### Milestone 2.7 — Prove it
- [x] **2.7.1 The stories sync through the real endpoints.** ✅ done (ADR-491…503)
- [x] **2.7.2 A burst, and knowing it is well.** ✅ done (ADR-504…507)
- [x] **2.7.3 The security checklist, item by item.** ✅ done (ADR-508, 509, 512…517)
- [x] **2.7.4 The phase exit.** ✅ done (ADR-518)

### Milestone 2.8 — What the audit found, closed *(reopened by the user 2026-10-14, ADR-519)*

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
- [x] **2.8.2 A sync told to wait, never a 500** ✅ **done 2026-10-14 (ADR-524):** `503 BUSY` with `Retry-After` on every endpoint for a pool wait, an expired piece of work and a stopped statement; four policy values; the suite's 18th check and the harness's wait; a turn-in and a top-up ordered by the phone's row, both races and two parts at once held by tests; the neighbour read indexed (the measure asked); a shapefile's ring pairs bounded (the measure asked); the burst measured whole; three full `pnpm scenarios` in a row passed, `burst` with no 500 (C166 says what it leaves).
- [x] **2.8.3 The object store's own servers closed** ✅ **done 2026-10-14 (ADR-525):** `weed server` with every part on the container's loopback, S3 behind `objectstore-tls` (a Caddy in its network, the stack's proxy's forwarded name believed); thirteen ports refused from another container (`hops.test.ts`), the command and the sidecar held (`compose.test.ts`); AC-10-72; door's reset stands `429 LIMITED`; AC-10-32's real sign-in and enrolment read in the process's own log, the container held to log the same (C167 says what it leaves).
- [x] **2.8.4 What is held for a person, resolved** ✅ **done 2026-10-14 (ADR-526):** the held records, files set aside and quarantined records read by the back office (`GET /held-records`, `/set-aside-files` and a file's bytes, `/quarantined-records`); a held record saved as corrected (correct) or closed (void), a file set aside closed (void), each once, by a person, with a reason, audited, the database holding it; a photograph whose record is held kept with it, saved; a report the server can't keep held too; turn-in confirms what a person resolved; the story `held-for-review` grown to it; the sweep's four done (C168 says what it leaves).
- [x] **2.8.5 Setup records changed and archived at the API** ✅ **done 2026-10-15 (ADR-527, 528, 529):** 35 endpoints: the firm-wide records, contracts, forms, debris types' entries, every list's values (added too), pay items, rates, a crew day's steps, rules, sites, their labels and tipping fee links changed, archived and put back, each audited, queueing what it moves; searches paged; a project's first close kept; a merge says what still names the duplicate; a person's employer and an address cleared; a withdrawn assignment put back with its note; a map version or a site's shape from KML (and KMZ) or an Esri layer (its request held against SSRF, AC-10-77…80); a site's shape keeps its file's key; one migration and its guard (122); 3,091 tests, 22 stories, 12 security checks. **Then the user's answers to its defaults (ADR-529), built in the same task:** a closed project is closed (read-only, held by the database on its tables and the records under them; its assignments withdrawn and number blocks retired at the close; field work arriving later held, `PROJECT_CLOSED`; an admin reads what is open, closes, and reopens with a reason, audited; refused only while the worker has its jobs); archiving trimmed to a person and a list value (17 archive and put-back requests retired; a site's label and tipping fee link removed); a form's Enabled dropped; the contractor merge retired for the flag `SUB_NAME_ALIKE`; four migrations (126); 3,092 tests, 22 stories (`certification` 28 checks, the merge's gone), 12 security checks; 33 loosenings tried, all caught. What it leaves: C169.
- [x] **2.8.6 A lost phone's key revoked after the firm's time, and the firm's settings** ✅ **done 2026-10-15 (ADR-530):** the firm's settings record (one row, seeded from `PHONE_KEY_REVOKED_AFTER_HOURS`, 24; the hours by an admin or Setup, the viewers' two-step by an admin alone, each audited); a phone's mark; the worker's backstop at each pass, revoking as the system actor once the firm's hours have passed since the mark, its blocks retired whole, `DEVICE_KEY_REVOKED`; the database's guard amended (`keyRevokedBy`: `TURN_IN` · `FIRM_TIME`; the firm's time checked by its own clock; such a key turned in once, its time kept; it still answers a challenge); such a phone proves itself with its key and the passcode together, its token opening only what `keyRevokedToo` marks (seven endpoints), its sync topping up nothing; ARCHITECTURE §7.4's note; the viewers' two-step at their very next request. **The sweep's list, all of it:** `installer:check` names the policy values in force (C53); the passcode's 8 and 128 policy values, read by the installer too; a phone renamed, a removal time stated, a reason from the list (`PHONE_REMOVAL`), a lost phone made retired, a found one put back (C102); a proven phone with nobody signed in reads no lists, decided (C120, C133); a person removes their own authenticator with a code from it (C91); the authenticator's mail found built and tested since ADR-412 (C101). Three migrations (129; the third takes back a `session` grant the second gave the worker, AC-10-11 caught it); the story `lost-phone-key` (14 checks); AC-10-83…87. What it leaves: C170.
- [x] **2.8.7 Every captured field correctable, and records made in the back office** ✅ **done 2026-10-15 (ADR-534):** 11 endpoints new and 6 widened: a certification entered from its paper sheet (*correct*; the monitor on the sheet its certifier, the sheet's number, who entered it and a reason kept, a replacing sheet; it reconciles as a phone's) and its photographs through `POST /photographs`, the third endpoint that takes a file (only onto a record made in the back office; its fingerprints the server's); an ROE, a survey, an incident and a drop-off log entered in the back office; an ROE's number corrected (a number finds its record); a form's own answers corrected against their version; a certification's driver, tag, vehicle type, prime and subs (the fix for `SUB_NAME_ALIKE`), a box's shape, sign and feature, a box added or taken off; a revocation taken back (an admin); an acceptance taken back (`p1-voided`, 30 checks); **the register's two:** the sub correctable (C169), a held record with no id entered as a record of its own and closed (C168); **the sweep's three:** a locked ticket's field events held by the database (C81), AC-10-16 on the void's own endpoint (C90), a field event made in a session under the passcode says which way (`masterPasscodeSession`, C124: the approved spec already asks it, so nothing was asked). Five migrations (137: the third moves the lock's question into its triggers after the first guard's function proved uncallable by the API; the fourth and fifth hold a locked ticket's lines by its own records, so a late field event under its number writes its own; the services ask about a lock before they write); AC-03-61…65, AC-08-68…73, AC-10-92; 37 loosenings caught (22 of the services at the API, 4 on `p1-voided`, 11 of the guards on copies of `adms`, two of them caught only once the test named its check, another guard answering with the same code). What it leaves: C171.
- [x] **2.8.8 The back office's reads and bulk acts** ✅ **done 2026-10-16 (ADR-535):** 44 endpoints and three widened: the review queue by cause, a project's flags, a ticket whole (its lines with their money, flags, marks), a field event, a scale receipt, certifications, ROEs, surveys, incidents, drop-off logs, invoice batches (and one renamed), the board searched with its warnings (`BoardWarnings`), a phone's sessions and its reason by name, people by name; setup's reads (projects, forms, pay items, rates taking Setup, rules, sites and shapes, map versions, list values, a kept map's file) and five previews of a save, run and undone; QC and locks for many, each answered; the viewers' reads of the same (a ticket's records beside it, an ROE's place and scope, certifications, the forms, setup with its check and lookup for a client user and an auditor, a photograph's file); AC-10-93…105; the golden mission's QC and locks in two requests. What it left, C172, was done by ADR-536 (the run decisions read; the queue's and a batch's counts and a batch name's own check proven; its screen work filed under Phase 4).
- [x] **2.8.9 Phase 2's exit, again.** ADR-376's seven criteria and ADR-519's three (`NEXT.md`):
  the register holds no server "no task yet"; **`SUMMARY.md` §4's agent defaults put to the user on
  one page**, each confirmed or overturned; three full `pnpm scenarios` runs in a row; the 22 REQs
  ticked or re-filed with an ADR; the scenario count again; the state files turned.
  ✅ **done 2026-10-17 (ADR-537…540): Phase 2's exit met.** The user answered `spec/DEFAULTS-REVIEW.md`: all confirmed but D1 (ADR-538); D1 built inside the task as three view permissions, an act needing its area's view (ADR-539, AC-10-107); D39's note confirms what is built (ADR-540). 169 of 169 scenarios at the API; the chain green and three full `pnpm scenarios` runs in a row after the change. What it leaves: none (C164 done).

- [x] **2.8.10 The independent check's findings answered** (`agent_store/AUDIT-2026-10-17-PHASE-2.md`,
  at the user's word "resolve all of these"): F1…F11 and R1…R5.
  ✅ **done 2026-10-17 (ADR-541…550):** AC-10-108…116 written and passing; the threat model read
  again whole; the user's three answers recorded (ADR-551).

### Milestone 2.9 — What the diagnostic found, closed *(reopened by the user 2026-10-17, ADR-552)*

**Why.** The diagnostic of 2026-10-17 (ADR-552 (1)) found the phone's lists missing everything a
certification picks, so a phone could certify only by typing or by ids it was never sent; every
story passed because the harness's phone was handed those ids from the database. The user: "this
should be a task in phase 2 clearly", and every recommendation taken. **The brief above holds for
every task here**, with ADR-519's rule at each close: no "no task yet" of the server's left standing.

- [x] **2.9.1 What a phone needs to pick, sent with its lists** (REQ-218; C118; ADR-552 (3)). ✅ done 2026-10-17 (ADR-553): the truck lists to a phone that certifies or takes disposals, the helpers to a certifying one, each site's GPS and area to every phone, the truck lists and places in the setup version; the harness's phone certifies by name and sends no id it wasn't sent; the sync suite's check 19; AC-10-117…120. What it leaves: C118's phone part (Phase 3, as filed).
  - **The truck lists** to a phone whose assignment certifies or takes disposals (`DIS`, `HOD`):
    the firm's vehicle types and vehicle features, its crew types, and the project's primes, each
    with the subs under it (`ProjectContractor.primeId`); by id and name, never a rate or a code.
    A sub stays typed by name (ADR-108): the prime's subs are offered, any other typed.
  - **Who may be picked as a helper:** the people with an assignment on the same project that day,
    by id and name alone (ADR-294), with a certifying assignment.
  - **Each site's place:** its GPS and its area as it stands (`siteCircleMeters` round the GPS, or
    its newest `SiteAreaVersion`), for the phone's advisory "not at this site", never blocking.
  - **The setup version** takes in the firm's lists the phones are sent: a change to one makes a
    new version (ADR-453 widened).
  - **The harness's phone certifies by name from its lists**, as it does every other record (the
    stories that certify fail before the lists and pass after); a check that every id a story's
    phone sends is one it was sent; `syncClientSuite` and the `certification` story widened.
  - Its acceptance scenarios in file 10 first; `pnpm openapi`; ARCHITECTURE §7.1's lists note,
    `adms-field-app` §4A.2a and `SUMMARY.md`'s lists bullet brought to what is built.
- [x] **2.9.2 Three faults put right** (ADR-552 (4); C174). ✅ done 2026-10-17 (ADR-554): a lock made between a review act's question and its write told in the act's own words (`ReviewService.mark`, `lockedTicketOf`), never a 500; the four review reads two queries a page, one after the other; gunicorn with `--no-control-socket`, its log read again; AC-10-121, 122. What it leaves: nothing (`pg` stays on 8: the warning left is Prisma's own engine's, the standing upgrade rule).
  - **A lock between a review service's check and its write** is answered as a refusal in words
    (the services' own "locked as invoiced"), never a 500; a test that makes the race.
  - **The four review reads** (ROEs, surveys, incidents, drop-off logs) take a page's QC marks and
    photographs in one query each, never two a row; none of our code puts two queries on one
    connection at once. `pg` stays on 8 until a run shows no deprecation warning.
  - **The address server's gunicorn** started with `--no-control-socket` (`infra/local/compose.yaml`
    and `compose.test.ts` together); its start-up log read again for the error gone.
- [x] **2.9.3 Phase 2's exit, a third time, and the records put right.** ✅ done 2026-10-17 (ADR-555): every criterion checked again from runs that were seen (the chain green, three full story runs in a row, 184 of 184 scenarios recounted whole, AC-02-84's story checks named, 23 REQs); REQ-006's row ten containers, `.nvmrc` 24.21.0, SUMMARY's topics all under budget. **Phase 2's exit is met; offered to the user.** What it leaves: nothing (Phase 3's own lines stand below). The ten criteria (`NEXT.md`),
  three full `pnpm scenarios` runs in a row, the 23 REQs; and the stale lines the diagnostic named:
  `REQUIREMENTS.md`'s REQ-006 row (ten containers), `SUMMARY.md`'s "Phases and their exits" topic
  split under its 15 KB, `.nvmrc` pinned whole (`24.21.0`, as the engines and the containers).

**Every one of Phase 2's 23 REQs is named by a task:** 004 → 2.1.3, 2.6.1 · 006 → 2.1.2, 2.7.4 ·
016 → 2.6.2 · 201 → 2.4.2…2.4.5 · 202 → 2.2.3…2.2.5 · 202a → 2.5.1, 2.6.5 · 202b → 2.2.3, 2.5.4, 2.6.5 ·
203 → 2.5.3, 2.6.1…2.6.5 · 204 → 2.1.3, 2.2.6, 2.6.5, 2.7.3 · 205 → 2.7.3 · 206 → 2.3.1…2.3.3 ·
207 → 2.4.1, 2.6.4 · 208 → 2.1.4 · 209 → 2.5.1, 2.6.5 · 210 → 2.8.2 · 211 → 2.8.3 · 212 → 2.8.4 ·
213 → 2.8.5 · 214, 215 → 2.8.6 · 216 → 2.8.7 · 217 → 2.8.8 · 218 → 2.9.1.

---

## Done — Phase 1: Data core and engine, rebuilt *(opened by the user 2026-10-01, ADR-299; its plan ADR-300; exit met 2026-10-06, ADR-371, 372)*

The whole product without a screen or an endpoint, proven by the golden mission run from a terminal with the figures the user signed off. One line a milestone; each task's full tick, and the phase's brief, are in `agent_store/ARCHIVE.md`, "Moved 2026-10-15 (ADR-532)"; grep the task's number there or read its ADR.

| Milestone | Tasks (ADR) |
|---|---|
| 1.0 Open the phase | 1.0.1 (299, 300) |
| 1.1 Setup records (Part 1) | 1.1.1 scenarios (300) · 1.1.2 the firm's lists (302) · 1.1.3 client, declaration event, project (303) · 1.1.4 contractors and contracts (305, 306) · 1.1.5 forms (308) · 1.1.6 pay items (309) · 1.1.7 sites and the map (310, 311) · 1.1.8 rules (313) · 1.1.9 people's scenarios (314) · 1.1.10 permissions and viewers (315) · 1.1.11 the setup services (316) |
| 1.2 Certifications and capacity (Part 3) | 1.2.1 scenarios (317) · 1.2.2 `Capacity` (320) · 1.2.3 the records and services (321) |
| 1.3 Tickets and numbers (Part 4) | 1.3.1 scenarios (322) · 1.3.2 numbering (323) · 1.3.3 a field event's shared columns (324) · 1.3.4 each kind's columns (325) · 1.3.5 scale receipts and photographs (326) · 1.3.6 ROEs and forms (327) · 1.3.7 the harness's phones and `SizeBands.payItemFor` (332) |
| 1.4 Sync intake with quarantine (Part 5) | 1.4.1 scenarios (333) · 1.4.2 `Intake` and quarantine (338) |
| 1.5 Reconciliation (Part 6) | 1.5.1 scenarios (339) · 1.5.2 derived records (340) · 1.5.3 grouping and status (341) · 1.5.4 quantities (343) · 1.5.5 flags and the first checks (344, 345) · 1.5.6 place (346) · 1.5.7 quantity, unit rate, ROE checks (347, 348) · 1.5.8 mileage (349, 350) · 1.5.8a the example world on the map extract (351) · 1.5.9 the worker's run (352) |
| 1.6 The rule engine (Part 7) | 1.6.1 scenarios (353) · 1.6.2 which rules run (354) · 1.6.3 what they write (355) · 1.6.4 the setup check and quantity lookup (357) |
| 1.7 The ledger and audit (Part 7) | 1.7.1 `Transaction` (358) · 1.7.2 the worker prices (359, 360) · 1.7.3 a contractor user's tickets (361) |
| 1.8 Review, QC, invoice lock and batches (Parts 8, 9) | 1.8.1 scenarios (362) · 1.8.2 people's marks (363) · 1.8.3 corrections and renumbers (364) · 1.8.4 void, unvoid, accept (365, 366) · 1.8.5 QC, the lock, batches (367) |
| 1.9 Prove it: the golden mission | 1.9.1 `golden-mission` (368) · 1.9.2 `p1-left-out` (369, 370) · 1.9.3 the exit (371, 372) |

## Done — Phase 0: Foundation *(ADR-103; closed 2026-10-01, ADR-281…288)*

| Milestone | Tasks (ADR) |
|---|---|
| 0.1 Approve the foundation (docs) | 0.1.1…0.1.5 ARCHITECTURE §1–§18 approved (104, 113, 139, 143) · 0.1.6 the hook for the rebuilt layout (283) |
| 0.2 Scaffold | 0.2.1 the workspace and toolchain (255…258) · 0.2.2 tests and contracts (259…261) · 0.2.3 the local stack (263, 264) · 0.2.4 the installer (265, 266) |
| 0.2b Spec pages before the schema | 0.2b.1 the naming pass, `spec/CONVENTIONS.md` (164, 234) · 0.2b.2 `spec/DATA-MODEL.md` (284, 289, 292…295) · 0.2b.3 `spec/FLAGS.md` (285, 290) |
| 0.2c The skills rewritten in the present tense | (138, 232, 233, 242…253) |
| 0.3 The database enforces the rules | 0.3.1 Prisma (267, 268) · 0.3.2 the guard migrations (270, 271) · 0.3.3 the database tests (272) · 0.3.4 `db.$write` and the system actor (273) |
| 0.4 Prove it end to end | 0.4.1 the scenario harness (275) · 0.4.2 the security checks (276) · 0.4.3 the Phase 0 models (281) |

The historical Phase 1 closeout on `database/` (H1.x, struck 2026-10-06 by ADR-375) is in `agent_store/ARCHIVE.md`, "Moved 2026-10-15 (ADR-532)".

---

### 📌 Carry-forward register: known later concerns (ADR-274; rewritten live-only by ADR-532)

What a task's ADRs leave for later, filed under the task or phase that picks it up, each line named
by its C-number (the numbers never change and are never reused; the next is **C177**). **Rule for
every agent:** at a task's start, read the standing rules below and the items under its heading,
and do each or say in the task's ADR why it waits and move it. At close-out, a new "later" in an
ADR gets a line here in the same response, under the task or phase that takes it (**a server
"no task yet" is never left unfiled**, ADR-519). **A line leaves when it is done, in that same
response, and the ADR that did it names its C-number;** never strike one through. Everything that
stood here before 2026-10-15, done items and their history included, is in `agent_store/ARCHIVE.md`, "Moved 2026-10-15 (ADR-532)": grep a C-number there for its past.

#### Standing rules for every task (they never leave)
**Any change to code**
- **After a change to `apps/api` or `apps/worker`, `pnpm local:up` again** before the chain: each container runs what was built when it started, and `door.test.ts` and `container.test.ts` ask them. (C85, C95)
- **A sidecar's Caddyfile** (`routing/`, `objectstore/`) is a mounted file: `local:up` doesn't remake its container when only that changed; `docker restart` it, or `local:down` first. A changed object-store policy or key is picked up by `local:down` then `up`. **On a Linux host** each key under `infra/local/.generated/tls/` must be readable by its container's user. (C136, C162, C167)
- **A new piece of work meant to run longer than `DATABASE_WORK_LONGEST_MS`** states its own limits with its ADR. (C166)
- **Counts go in `CHAIN.md` alone; a lesson about a layer's tests in its page beside `adms-verify`; loosenings through `loosen.mjs` in one list.** (C116)

**Every task that adds an endpoint** (the recipe; the API page beside `adms-verify` has the helpers)
- Define it with `endpoint()` in `packages/contracts/src/endpoints.ts`, in `endpoints` **in path order**, and add its line to `apps/api/test/every-endpoint.test.ts`; give every number it takes a least and a most (a whole number one a column holds), no secret in its path or query, no address the server would ask (`endpoints.test.ts`, "what every endpoint takes"). (C86, C101)
- Serve it with `@Serves(…)` on a controller named in `ApiModule` (and its service handed over in `api-process.ts`); a class that needs another names it with `@Inject(…)`; a writing controller names the database with `@Inject(apiDatabase)` and states no request id; `pnpm openapi` and commit `apps/api/openapi.json`; a new refusal adds its code to `errorCodes` and the filter's table. (C85, C86, C106)
- Its definition states `access`; a `SIGNED_IN` one names its `roles` (`adminOnly`, `backOfficeRoles`, `signedInRoles`) and, for a reviewer's or setup act, its one `permission` (`people.test.ts` holds the exact lists of what is an admin's alone and what takes a permission; `DISPATCH`'s is `phones.test.ts`'s, *correct*'s `corrections.test.ts`'s); it is closed to a person who must set up an authenticator unless marked `beforeTwoStepSetup`; its service asks again inside its own piece of work. (C90, C91, C92, C103, C105)
- It is limited by address and person with nothing to do; one that tries a secret asks `const underWay = limits.mayTry(request.ip, …)` first, tells `limits.wrongTry` of a refusal, and ends the try in a `finally` (`underWay.over()`); its service checks the guess inside `tries.inTurn(…)` (ADR-541). (C93)
- **A setup endpoint** spreads `setup`, writes through `this.setup(person, …)`, answers with `answered(request, outcome, record, done)`; its record's shape in `packages/contracts/src/setup-answers.ts`, its mapper in `apps/api/src/setup/setup-records.ts`; **the plain words for each constraint its requests can reach go in `process/database-refusal.ts`** (list a table's with `pg_constraint`); a read goes through `this.db.$read`. **A reviewer's** spreads `reviewer`, answers through `reviewed(…)`, its shape in `review-answers.ts`. A schema's refusal is asserted by its words (`notTaken`); give a refine a `path`. A service working through another's queueing says what was queued with `QueueingService.keep`. **A paged list** copies `GET /people` (`after`, `limit`, `next`, one row more read). (C98, C101, C104, C105, C107)
- **For a phone:** `access: 'PROVEN_PHONE'` (`phoneOf`) or `'MONITOR_ON_PHONE'` (`monitorOf`), joining the exact list in `phone-proofs.test.ts` or `phone-sign-ins.test.ts`; its test enrols and proves with `test/support/phones.ts` (`enrolledPhone`, `proven`). **An act under the master passcode** asks `MasterPasscodeCheck.check(passcode, now, deviceId)`, writes `used(tx, …)` in its own piece of work, counts the address under `atThePasscode`, refuses `MASTER_PASSCODE_REFUSED`, is written with `underMasterPasscode(deviceId)` and names the monitor as who it is about, never its actor. **A write a phone makes with nobody signed in** is written with `byDeviceKey(deviceId)`. **A record a phone reports** carries the phone's instant, its offset and the received time, guarded in the database to that actor and phone; **a security event a phone reports** carries its offset (`security_event_a_phone_reported`). **A new occasion of an unplanned assignment** joins `unplannedOccasions`, `securityEventsOf` and the refusals in `phone-unplanned-assignments.test.ts`. **A new list a phone is shown** joins `SetupVersions.shownIn` and `setupShownSchema` (the project's setup) or `PhoneLists.held` alone (a record). A fourth endpoint that takes a file is an ADR and the two exact lists (the third, ADR-534 (2)). (C111…C114, C119, C122, C123, C126, C140)
- **A viewer's read:** a method of `ViewerReads` inside `$viewed`, under `/viewer/…`, `viewerOnly`, in `viewer-reads.test.ts`'s exact list and its read-only-login test; **money, a private citizen, a monitor or a name of setup only from a view declared in `packages/db/prisma/schema/viewer.prisma`** (it joins `viewer.test.ts`'s lists; `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code` still says `No difference detected.`); what each viewer is answered is checked on the story `p1-viewed`. (C109)

**Every schema task**
- A table a client user or an auditor should see gets `guard_viewer(…)` in its guard migration and a row in `packages/db/test/support/viewers.ts`; one nobody sees goes in `unseenTables`; **a rerun of `guard_viewer` on `certification`, `project_contractor`, `field_event`, a completed table, `scale_receipt` or `photo` repeats its `own`** (copy the line from the seventy-fourth migration); a new table that is part of a ticket says whether a contractor user sees its own rows; **a new money column on `transaction` joins `viewer_transaction_money`, never `viewer_transaction`.** (C59, C76)
- **A table that names a user:** its guard adds `<table>_<column>_not_master_passcode_check` and `_not_device_key_check`, and the column joins `packages/db/test/support/master-passcode-actor.ts`. **A table of sign-in:** its own guards (the API alone), secret columns named on the audit trigger, a line in `unseenTables`, `keptOut` and the tests' grant list. **A tenth photograph owner** widens `photo_owner_check`, `photo_held_record_guard`'s `moved_to` and the held review's `ownerColumn`. (C88, C111, C112, C168)
- **`prisma migrate dev --create-only` must give an empty stub**; a line nobody asked for means a `dbgenerated` default read back differently; any guard that tells "the same piece of work" by a time needs the column stamped by the database, never `@default(now())`. (C60, C62; KD-68, KD-70)
- **A new policy value** joins `policy.env`, `policy.ts` (name, range, field, read), the four whole maps in `packages/domain/test/`, `project-settings.test.ts`'s names, `packages/scenarios/test/policy.test.ts`, and for the worker's own `apps/worker/test/process.test.ts`, saying which service reads it. **A new setting of the API** joins `settings.test.ts`'s `good`, `passwords.test.ts`'s settings, `madeUpSettings`, the installer's keys (first run and rerun, a line in the check: `CHAIN.md`'s `✓` count) and `infra/local/src/index.ts`'s wait. (C121, C133)

**Every test and story**
- **A test of the API that must write** uses `apps/api/test/support/database.ts` (`undone`) and may hand the process its database, mail and clock; **the API's test files run one at a time**; a test that archives Dana gives the firm another admin first; a refusal by one of the database's checks ends the test's piece of work, so it is that test's last request; a service asks everything before it writes (a test's piece of work has no savepoint). (C89, C92, C98, C103, C105)
- **A test asks for a Monitor ID as "M" and six digits or more,** never exactly six (every run moves `adms`'s series on). (C131)
- **A story** writes nothing a service does by hand: a planned assignment with `assigned`; a monitor with `story.monitor(name, onPhone)` and `taken(story, monitor, phone)`; a phone with `story.enrolled(name, at?)` (an `at` before its first work) and `story.proofs`; a phone's first block with `firstBlocks`; a person's act with `browser.answered(endpoint, …)` signed in as `story.backOffice.admin` or `.person` (a person written by hand needs their sign-in address); its phone takes its setup version from the lists it read. A story that moves its clock back before a phone's last proof is stopped at that phone's next request: tell it in time order. A person whose sessions end signs in again only after the clock moves thirty seconds. **An exact audit list that moves when acts sign in, sync or queue says why in the ADR, never loosens.** (C103, C113, C115, C119, C134, C143, C145)
- **Stories assert the audit log's order, never its times** (the database stamps its own clock). The server apps' indexes export only what `packages/scenarios` and `infra/local` read (`app-exports.test.ts`): a story that stops calling a service takes it out; kept in process on purpose: `Corrections` (AC-10-50), `first-admin`'s sign-in parts, the setup services, `Certifications`, `NumberAllocator`, `Assignments`, `Phones`. A test of the object store tidies up as the stack's administrator (`tidied`). (C29, C136, C151)
- **Every later Prisma upgrade:** `views` is a preview feature (fallback: `$queryRaw` inside `$viewed`, in `packages/db` only); run `pnpm audit` and drop each accepted advisory the upgrade fixes (C32), saying so in its ADR; look at the `pg` deprecation warnings from the adapter (`client.query()` while executing; pg 9 removes the call): **`pg` stays on 8 until a run shows none**; since ADR-554 our own code puts no two queries on one connection at once, so one still seen is Prisma's engine's (trace it with `NODE_OPTIONS=--trace-deprecation`). (C32, C98, C109)

#### For Milestone 2.9 (Phase 2, reopened 2026-10-17, ADR-552)
- *None left: C174 (a) done by task 2.9.2 (ADR-554). 2.9.3's work is its own line above.*

#### For Phase 3 (the field app)
*Mapped to their tasks (task 3.0.1, ADR-558; by REQ before it, task 2.8.1, ADR-522):* C175 → the task that runs from 2026-10-21 · C176 → 3.5.1, 3.6.1 · C41 → 3.1.3, 3.10.2 · C156 → 3.8.1 (its checklist part done by 3.1.1, ADR-562) · C110 → 3.2.2, 3.8.1, 3.9.1 · C111, C112 → 3.2.2 (C112's `Authorization` across origins done by 3.1.2, ADR-565) · C113 → 3.2.2 · C114, C115, C117, C133 → 3.2.3 · C120, C143, C151 → 3.2.4 · C122, C125 → 3.3.1 · C123, C124, C126, C171 → 3.3.2 · C127, C128, C130, C132, C139, C152, C153, C166, C168 → 3.4.1 · C137, C138 → 3.4.2, 3.8.2 · C69, C141, C170 → 3.4.3 (C141's offline sign-in report, 3.2.4) · C68, C96, C121, C135 → 3.5.1 · C74, C83, C97, C100 → 3.5.2 · C66, C67 → 3.5.4 · C118 → 3.5.5 (its post-work survey, 3.5.4) · C127, C129 → 3.5.5.
- **C171.** The phone sends `masterPasscodeSession` (`AS_MONITOR`, `TEMPORARY` or `null`) on every field event, in place of `temporarySession` (ADR-534 (11); REQ-312).
- **C41. Accessibility** (ADR-279). *The standard, the user's (ADR-559):* **WCAG 2.2 AA** on every screen, the field app's and later the back office's and the portal's; **a conformance report (VPAT format) for each app at its phase's end**. *Have:* every screen translatable (ADR-172). *Left:* the automated check beside the browser end-to-end tests (3.1.3) and each screen's own check in its task; the hand review and the field app's report (3.10.2); the web apps' checks and their report: Phase 4 (its line below).
- **C175.** React 19.3.1 (published 2026-10-14 on every React line at once) and Playwright 1.64.1 (2026-10-14) are read again once seven days old, from 2026-10-21: an advisory against 19.3.0 or 1.64.0 published by then, or what 19.3.1 fixes, decides whether to take them (ADR-563, 564). Whichever task runs then (3.1.3's checker ADR is a good moment).
- **C176.** The field app's `Permissions-Policy` turns the camera and the phone's place off until a screen needs one (`apps/field/page.ts`, `servedHeaders`; ADR-565): the place opens to `(self)` with the first capture screen that stamps GPS (3.5.1), the camera with the photographs (3.6.1), each in its task, with its scenario (AC-11-68). The microphone, payment and USB stay off.
- **C66, C67 (c).** What a phone lets a monitor change on an ROE after their shift; "GPS required" asked by the phone; a photo field's capture; the incident screen shows only what the form offers.
- **C68.** The phone's screens, its own duplicate check, what a cancelled field event shows, whether a typed number is entered twice, whether hand re-entry stays (ADR-209).
- **C69.** The phone shows a record "not saved"; a reset phone's blocks reclaimed (`NumberAllocator.reclaim`); the phone's form definitions (the harness's phone holds none).
- **C83.** The tower asks for the number of **tickets** the load carries (the user, ADR-370), as the worker compares.
- **C96.** A number at New the phone's list of certifications doesn't hold: warn, refresh the lists where connected, else key the truck in by hand (the user, ADR-421; REQ-317).
- **C110, C111, C112.** The device key in real secure hardware (the Secure Enclave's 65-byte point needs the fixed 26-byte header; Android's Keystore gives SubjectPublicKeyInfo); both sign DER; the browser test build's WebCrypto must write DER; attestation stays declined (ADR-240); the token kept in secure storage, proving again on `PHONE_NOT_PROVEN`. *(The browser build sending `Authorization` across origins: done, task 3.1.2, ADR-565.)*
- **C113, C114, C115, C117.** "Create monitor" proves the phone first, then sends the passcode, and shows the Monitor ID answered; the monitor's token kept in secure storage beside the phone's, both sent, signing in again on `NOT_SIGNED_IN`, its own lock after inactivity (AC-02-40); "no assignment today" or "more than one assignment today: ask your supervisor" from `noAssignment`, offering the passcode's setup; keeping what it holds on `noAssignment`, showing how stale its lists are (AC-02-44), asking again whenever connected.
- **C118 (the phone's part; the server's was 2.9.1, done by ADR-553).** Certifying on a phone picks the prime, a vehicle type or crew type, each box's feature and any helper from its lists (a sub typed, the prime's offered), and a tower monitor finds a truck from the same truck lists; the advisory "not at this site" from the site's place in the lists; a post-work survey picks from ROEs where `preWorkSurveyDone`.
- **C120.** A typed password checked as Argon2id in NFC under `first`'s salt (no key), then Argon2id of those bytes against `check`; each entry kept with its mark, the marks sent, anyone not named dropped, asked again while `more`; the 5 and 10 wrong tries the phone's own (AC-02-40); the browser build needs an Argon2 that takes raw bytes.
- **C121.** "Look up address" sends GPS as two decimal strings of at most eight places; on `NOT_ANSWERED` it may ask once more, then the monitor types; `LOOKED_UP` or `TYPED`.
- **C122, C123, C124, C125, C126.** After setup under the passcode the report is kept until `SAVED`/`ALREADY_SAVED` and sent before the records made under it; a move and a switch done under the passcode, offline if need be, each making the new assignment's id (a switch to a monitor the phone holds an assignment for makes none; the earlier monitor's unsynced work hidden, AC-02-46); the monitor's id sent from the lists, never typed; a session shown as the passcode's, ended at the project's midnight offline; the typed passcode kept in memory only for the setup, asked with `projectId: null` then the project, paged by `moreMonitorsAfter`, offline only on the project whose lists it holds (AC-02-38); each passcode use logged with its own id, clock and offset, never the passcode; what it does after ten wrong tries offline (63B §3.2.10) is its to propose; the passcode opening a locked sign-in is one more logged use.
- **C127, C128, C129, C130, C132, C152, C153, C166.** A hand-keyed truck sends the capacity typed, every nullable detail `null` where not recorded; syncs split at 200 records, 20 unplanned assignments, 100 uses, 20 series and a mebibyte (`fitByWeight`; a record kept under `syncedRecordBytesAtMost` as made, a form's answers bounded as typed); `NOT_SAVED` shown with the words ("… Held on the server for review.") and kept, never dropped; a kept record may be sent again (same fingerprint); certifying with the domain's `Capacity`, the boxes sent, every measurement a shape doesn't hold `null`; `syncClientSuite` run against its own store through a `SyncClient` of its own, answers read only with `syncAnswerRead`; whether a kept record is resent by itself, by the monitor or only at turn-in is its to propose (ADR-470 (3)); a wait (`toldToWait`: `429`, `503`) waited out and sent again as it was, its own retries spread (ten in a row is a fault); a top-up not taken leaves its block.
- **C133, C135, C137, C138, C139, C168.** It says what it holds in every sync, takes a check in, reads its lists when the setup version answered isn't its lists'; **a record sealed at submit** (no reopen, edit or undo, never resent changed; an unsubmitted one stays the monitor's across sign-outs and days; a cancelled one stays on the phone); a photograph's record sent in the sync carrying its record or later (`OWNER_NOT_SAVED` kept and resent once the record is saved; `depthSha256` only where a depth file will go); parts no larger than `MEDIA_PART_BYTES_AT_MOST`, smaller on a poor signal; `photoFileEndpoint` asked after a restart; image kinds and sizes measured on real phones; a photograph whose record is held is answered saved and its files go, the record still shown not saved.
- **C141, C170.** The suite's turn-in checks; held things named by the SHA-256 of `sentCanonical`; on `wipe: true` its store's data key erased (NIST SP 800-88) and its device key; a refused proof right after a turn-in ask means it was turned in; a supervisor shown the server's words and what's missing; `MASTER_PASSCODE_NEEDED` at its proof: ask whoever holds the passcode, send it beside the signature, then sync and turn in (`keyRevoked` says nothing else is open); **it syncs only while somebody is signed in** (ADR-531); reaching signal it reports its offline sign-in first (`POST /phones/current/offline-sign-ins`, the proof an HMAC keyed by the first slow hash, kept never, dropped at sign-out); the master user syncs by typing the passcode beside the proof; a refused offline sign-in asks for an online one.
- **C143, C151.** A story of signing in offline (the login list) comes with the field app.
- **C156.** A phone's private key never leaves its secure hardware (3.8.1). *The field app's own checklist (OWASP MASVS, REQ-323) is written: `spec/CHECKLIST-FIELD.md`, task 3.1.1, ADR-562.*

#### For Phase 4 (the back office's and the portal's screens, exports)
- **Accessibility** (C41; ADR-559): every web app screen meets WCAG 2.2 AA, checked automatically beside its browser end-to-end tests as the field app's are (3.1.3's checker), reviewed by hand; the back office's and the portal's conformance reports (VPAT format) at Phase 4's end.
- **Setup screens:** the check's page (open to reviewers) and the lookup on the site's page (C74, C97, C100); the screens read `reason`/`message` beside the field and `queued` ("N tickets queued, M locked as invoiced left as they are", ADR-422) (C96, C98, C99, C104, C105, C169); the pay item screen shows a rate only from a read taking Setup, the rule builder reads `valid` and `reasons`, *Show matches*' counts, "what it would change" (C75, C99); the map screen: a preview of a file's or an Esri layer's contents before a load, the zones' name field from `fields`, a drawn shape as GeoJSON, the ring pairs' refusal in its words, the Esri token asked at each fetch and never remembered (C140, C166, C169; REQ-124b); a setup version's page and field events whose version the project never had (C119); the close screen reads the closing check and asks to confirm, a reopening asks its reason (C81, C169); setup suggests a cert-number seed that doesn't look made up (C64, Q-96); where a firm's Monitor ID series starts if not `M000001` (C43); the crew-day pay item's day length defaulting from `CREW_DAY_HOURS` (C60). A save shown beside its preview, from the five preview requests: "N tickets would be queued, M locked as invoiced passed by" (C172).
- **Review screens:** the review queue shows a held record (`viewer_held_record` for a viewer), one whose `sentId` was since saved, held photographs beside their records, files set aside beside their photographs, quarantined records' `resolution`, `DEVICE_CLOCK_OFF` with its difference (the firm may want the limit per project), a ticket queued because a neighbour changed, an accepted flag as accepted with a void ticket's cleared flags left out, a line taken off as taken off, a record held for its weight and why; saving a held record as corrected starts from `sent`; bulk accept; for many tickets, those that can't be locked and why (AC-09-08); the report by a batch's name (also a contractor's, from `viewer_invoice_batch`/`viewer_invoice_lock`); "reprocess" calls `reprocessTickets`; a page of waiting and set-aside jobs; the back office's correction is the only way a submitted record changes; a photograph shown by fetching its file with the session's cookies (never opened as a page), one not arrived says so; the removal of a photograph and what a viewer's screen and the exports do with a removed one (C67 (e), C78…C81, C94, C96, C128, C131…C133, C135, C137…C139, C146, C147, C152, C168). The queue's screen reads `GET /projects/:projectId/review-queue` a workflow at a time with its cause counts, and `?cause=` for one; **bulk accept and bulk fix are the screen's loop over the single acts** (only QC and a lock take many in one request, ADR-535 (4)); a ticket's run decisions shown from `GET …/tickets/:workflow/:ticketNumber/decisions` (ADR-536); a batch's report read by its name (C172).
- **Records made in the back office, and corrections** (C171; ADR-534): the sheet's entry screen (boxes measured with capacity shown as the server answers it, helpers picked, the reason picked), its five views sent one by one through `POST /photographs`; the forms' entry screens and a form's answers edited against the version they answer, `ANSWERS_DO_NOT_FIT`'s words beside the fields; an ROE's number corrected shows what it found and what it let go; an acceptance taken back from the flag's line; a revocation taken back on the certification's page (an admin's); a field event shows "authorised by the master passcode, for M004127" and which way.
- **People, phones, board, security:** the people page (create, permissions as ticks, a viewer's projects, archive, end sessions, set a password, clear an authenticator; paging, the archived apart, permissions a person made admin still holds; REQ-415's bundles, bulk changes and history); the session answer tells the page what the person may do; the firm's settings page (the phone-key hours or off, the viewers' two-step, the monitors' sign-in hours, each with a note); the phones page (rename, removal with a time and reason, made retired, put back, which phones hold an old passcode, enrolment locked and the change offered); the board's screen (planned against actual, AC-02-34; copying a day, AC-02-33; the withdrawn apart; a monitor's several assignments on a phone in the order made; what was set up on a phone stands over the plan that day; when an unplanned assignment was made and received; warnings for a second assignment); a monitor locked online shown to an admin; who sees which security events (`TWO_STEP_SET_UP`/`CLEARED`, the passcode's three, a phone's proofs, `DEVICE_TURN_IN`, `OFFLINE_SIGN_IN_REFUSED`), a session opened offline shown as "authorised by the master passcode, for M004127" (C88, C91, C92, C101…C103, C111, C112, C114, C115, C120, C122…C124, C126, C141, C170). The board's warnings (`GET /assignments`'s `BoardWarnings`) beside each row; a phone's sessions on its page (C172).
- **The back office's own name and origin** (C86's rest; ADR-565): the back office served through Caddy at a hostname of its own, its origin joining `ADMS_CORS_ORIGINS` only where it isn't served same-origin, and its page's policy and headers said once as the field app's are (`apps/field/page.ts`), held by its browser tests; REQ-006 re-checked for it and the portal.
- **Sign-in pages** (C86, C89…C91, C93): the CSRF value kept in page memory and sent as `x-adms-csrf`; calls with credentials; one lock across tabs before a refresh; one message for every failed sign-in and where to reset; "try again in N minutes" from `retryAfterSeconds`; the code asked on `TWO_STEP_CODE_NEEDED`; the setup page shows the QR from `uri` and the secret once; the change-your-password page (`passwordChangeRequired`); the reset page (a link rather than a code, ADR-404 (7)); `PasswordProblem.message`; the password field's paste, show and manager behaviour (ASVS 6.2.6, 6.2.7); a person's own sessions listed and ended (ASVS 7.5.2); sign-out on every page; a person removes their own authenticator with a code; recovery codes if the user wants them. *A later candidate, not planned:* a passkey or hardware key beside the code (ASVS Level 3), raised with the user first (ADR-414 (4)).
- **The portal and exports** (C70, C76, C78, C82, C87, C108, C109; REQ-408, 412): which more names a contractor's screen needs (vehicle type, field tag, zone, payable type, kind of work are ids today); the exports' columns: a sub's login with no rate or amount, the QC columns, the firm's own fields, the Transactions export's `mileage`, `mileage_source`, `map_data_date`, a viewer marked not to see private citizens; whether a page of tickets crosses workflows or filters by status or day; what a session tells the page about a viewer's kind; what each viewer sees of the mission, as a browser test; the client package; an export or report through `adms_readonly` needing more than thirty seconds states so with its task; the incident offers on the form's setup screen and the back office adding a contractor, cert number or ROE number to an incident; the viewer's private-citizen box; whether an incident names the certification it concerns as a real column (C66, C67).

#### For Phase 5a (the demo deploy, REQ-517)
- **The installer and the deploy** (C25, C85, C86, C89, C92, C95, C121): Railway runs `migrate deploy` and the seed, never `migrate dev` or the shadow database; an image a firm deploys (locally the container mounts this checkout) and the uid that reads the owner-only settings on a Linux host; Node's own crash output isn't JSON; the deploy writes `ADMS_CORS_ORIGINS`, `ADMS_API_HOST`, `ADMS_API_PORT`, `ADMS_TRUSTED_PROXIES`, `ADMS_ADDRESSES_URL` and the worker's map servers and their CA; the installer asks a real firm for its mail server (`SMTP_URL`, `ADMS_MAIL_FROM`); a newer breached-password list is a release's work.
- **Security in the cloud** (C33, C40, C90, C91, C93, C157, C161, C162): CIS items for the cloud's Postgres (TLS required; connection logging naming user and database; pgAudit; file permissions and patch level), tested in the deploy's checks; the back office and the API one site for `SameSite=Strict` (a proxy path, ADR-408 (6)); the proxy refuses plain HTTP at the API's name and sends HSTS with `includeSubDomains`; the deploy's own hardening and TLS between hosts; a key for password hashes and one for sealed secrets apart from the signing secret, or in hardware (ADR-411 (4)); a key replaced in place with its data re-sealed, in the operator's guide; several API processes each keep their own rate-limit counts and unfinished file parts (a shared store is a new service, by ADR; or route a phone to one); the proxy's or network's own limits meet a flood; `pnpm local:accounts` never part of a deploy; **an outside penetration test** before a firm's first live mission (C40 (b)); **how a vulnerability is reported and a fix reaches installations** (a root security policy file, the user's to approve), before the repository is public (C40 (c)). From the Phase 2 audit (ADR-541, 542, 549): tries taken in turn, tries under way and the addresses refused at the master passcode shared by several API processes (today each process's own); the password and sealing keys held in hardware and replaced in place with what they keyed made again; the operator's guide saying to name every proxy in `ADMS_TRUSTED_PROXIES`.
- **Operations** (C38, C39, C87, C138, C147, C155, C166): alerts (who is told, by what, on which figure: `/readiness` polled, never `/health`; Docker's health; a log filter on `INTERNAL_ERROR` and `JOB_SET_ASIDE`, an admin told of a job set aside); the worker's answer from outside its host; sync failures as a rate; a backup failing; storage or the database filling; figures kept over time; no outside service. Availability: standby or failover, restarts, targets (how long down, how much lost) as policy. The deploy's pools against `max_connections` (each service's pool and the viewer pool, per process); the logins' timeouts set the same way; the two waits and the burst measured over a network.
- **Storage and maps** (C48, C49, C136, C167, C169): the firm's own bucket with versioning or Object Lock, an identity with put and get alone, a deny on a put without `If-None-Match` where the store knows it, path or host addressing, the region; a SeaweedFS deploy runs as `server` on its loopback or with gRPC under mutual TLS; the demo's Valhalla and Nominatim with the region's extract, private to the API and the worker, TLS between, sized for the region, their proxy keeping no access log; the rest of Q-166 (several regions in one installation, how a firm names its region, refreshing to a newer extract without changing a billed mileage, the back office's base map file); an Esri layer on ArcGIS Online asked from the deploy's host, measured.
- **The runbook** (C90…C92, C111, C112): losing `ADMS_TOKEN_SIGNING_SECRET` means every password and authenticator is set anew; `pnpm installer:admin` is the first step after the installer and the way back in (`node apps/api/dist/admin.js` in a container deploy); a locked passcode is opened by changing it; `pnpm installer` rerun after an upgrade (Q-167).

#### Housekeeping and observations (no task; look when it comes up)
- **C26.** pnpm 12 when the global pnpm is 11+; Node 26 once it's LTS (ADR-255).
- **C27.** The `.gitignore` section for `database/` is harmless; the user's to drop.
- **C28.** `pnpm installer:teardown` doesn't know story databases: one left behind (a killed run, or `--keep`) is owned by `adms_owner`, so `DROP ROLE adms_owner` fails. Teardown should drop `adms_story_…` databases first, or stop and name `pnpm scenarios clean`.
- **C32.** The accepted audit advisories, all in the Prisma CLI: `GHSA-ggr8-5vv4-36mx` (`deepmerge-ts` 7.1.5), `GHSA-3f6p-5ww8-9rcr` and `GHSA-rgwj-5xj2-c3m3` (`mysql2` 3.15.3); secretlint's seven dev-tool licences allowed by exact version (an upgrade makes them undecided).
- **C116.** `pnpm security` can't see a change made to the database by hand within thirty minutes of `pnpm test` (`--fresh`; `pnpm chain --fresh` passes it on). (The one command and its summary: `pnpm chain`, ADR-533.)
- **C135.** Open, not asked: whether a field event that stood open for days should ever be flagged (nothing flags it; `OVERLAPPING_LOADS` may catch a long-open collection).
- **C174 (b), (c) (seen, left as they are; numbered C171 until ADR-552, which C171 already was; its (a), the lock race, done by ADR-554):** (b) a certification entered from its sheet is reconciled by the same path as one a phone made after its load (`certifiedIn`; `p1-left-out`'s `730499`): the API test proves the link and the job, and no story runs one from paper. (c) The un-revoke's own admin check is doubled by the door's (`adminOnly`), as the revocation's is.
- **C140, C142, C153, C154, C162, C163, C167, C169, C170 (seen, left as they are):** a malformed `.shp` with a negative record length throws (reporting the libraries' faults upstream is the user's call); on a Linux host a process on the host's loopback can't be reached from a container (`host-gateway`; the stories' API must listen where the stack's network reaches it, never `0.0.0.0` on a shared machine); not measured: photographs at real size, a network's time, a first working's own time (about 7.5 s a run of 200 for its map server asks), a burst where neighbours are found; Docker Desktop's forward to Caddy once reset connections from the host after a crash loop (`docker restart open-adms-local-caddy-1`); acceptance files 01…09 carry each task's history in their cells; SeaweedFS logs that it loaded no IAM configuration for STS (none used); an Esri layer's address is held by a pattern (OpenAPI says the pattern); archiving a site label value leaves sites carrying it; `contractor.merged_into_id` kept as history; `project_open_guard()`'s refusal is recognised by its message; two applied guard migrations' comments cite AC-10-81…84 and AC-10-11, 81 (read AC-10-83…86 and AC-10-11, 83); `NumberAllocator.retire` is called by nothing (a later task's to remove or use).

# Acceptance scenarios — The field app, on the phone

✅ ** Approved**: agent-written (task 3.0.1, ADR-560); the user approves. Building doesn't wait
(ADR-230).

← [Acceptance scenarios](README.md) · What they prove: [ARCHITECTURE](../ARCHITECTURE.md) §3,
§7, §8, §9, §11, §12, §15, §16 · [`adms-field-app`](../../.claude/skills/adms-field-app/SKILL.md)
§4A · Who attacks what: [the threat model](../THREAT-MODEL.md) §4.1

> Each scenario restates a recorded rule; **From** names it. Values are the example world's
> (`spec/CONVENTIONS.md` §6). How to read the columns: [README](README.md).
>
> **This file has no part page.** Files 01…09 say what the product does for a firm, a monitor and
> the back office, and 48 of their rows (with two of file 10's) name the field app as a layer
> still to come. This file says how the phone itself behaves: the app and its door, the store on
> the phone, its identity, signing in, the master passcode on the phone, sync from the phone's side,
> what every capture shares, photographs, printing and scanning, accessibility and the field app's
> security checklist. **It adds no rule to the domain**: the phone builds against the sync contract
> and the lists Phase 2 serves (BACKLOG, Phase 3's brief).
>
> **Two parts.** Sections A…K are the new scenarios, `AC-11-01`…`AC-11-73`. Section L lists, by ID,
> every scenario of files 01…10 with a field app part, with the task that proves it.

**One more column: Answers.** The checklist item a scenario answers (ARCHITECTURE §16; ADR-559):

| Written | Means |
|---|---|
| **MASVS-…-n** | OWASP MASVS v2.1.0, the control's number; the profile followed is MAS-L2 + MAS-P (`spec/CHECKLIST-FIELD.md` §1, task 3.1.1, ADR-562), read from the published text as task 2.7.3 read ASVS's |
| **WCAG n.n.n** | WCAG 2.2, the success criterion's number, level A or AA (the user, ADR-559) |
| **API8:2023** | OWASP API Security Top 10 (2023), as file 10 writes it |

| Mark in **Proven at** | Meaning |
|---|---|
| **browser (3.x.y)** | A browser end-to-end test of the field app's browser build (ARCHITECTURE §15), named by this ID, run from the terminal against the local stack over HTTPS; the task is `agent_store/BACKLOG.md`'s |
| **suite (3.x.y)** | The sync contract's suite (`syncClientSuite`, `packages/contracts`) run against the field app's own `SyncClient` and store |
| **API (3.x.y)** · **database (3.x.y)** · **domain (3.x.y)** | As file 10 uses them, for the server's half a Phase 3 task builds (the time clock's records, the CORS list) |
| **iPhone (3.8.x)** · **Android (3.9.x)** | The on-device layer (ARCHITECTURE §15): run on a real phone with the user, the run and what was seen recorded in the task's ADR |
| **hand review (3.10.2)** | A person's review against WCAG 2.2 AA, recorded screen by screen; what no automated check can see |

**Throughout:** a number that is policy (a lifetime, a count of tries, a limit, a size) is a policy
value or the server's answer, never a literal, and never relaxed to pass a test (invariant 16). The
phone **warns and never blocks** (ADR-052): no scenario here has the phone refuse a monitor's work.

---

## A. The app and its door

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-01 | **Given** the local stack, **then** the field app's browser build is served only over HTTPS, at a name of its own, `https://field.adms.localhost`, through Caddy; plain HTTP there is never answered with the app; the app reaches the API at `https://api.adms.localhost` and nothing else of the stack's | ARCHITECTURE §4, §6; ADR-098; C24, C86 · REQ-006, 301 | MASVS-NETWORK-1 | browser (3.1.2) | ✅ 3.1.2 (ADR-565): `apps/field/e2e/door.e2e.ts` |
| AC-11-02 | **Given** the API's configuration, **then** its CORS list holds the browser build's origin and the native apps' origins, `capacitor://localhost` and `https://localhost`, each exactly; a page from `https://evil.example` or `https://field.adms.localhost.evil.example` is answered nothing it can read | ARCHITECTURE §6 (CORS); AC-10-08; C86 · REQ-006 | MASVS-NETWORK-1 · API8:2023 | API (3.1.2) | ✅ 3.1.2 (ADR-565): `apps/api/test/door.test.ts` (each origin by name, the look-alikes), `apps/field/e2e/door.e2e.ts` (from the browser) |
| AC-11-03 | **Given** the field app, **then** one codebase is the browser build, the iPhone app and the Android app; the browser build is for testing, and its store, which isn't device-grade, never holds real work | ARCHITECTURE §3, §8, §12; ADR-099 · REQ-301 | MASVS-STORAGE-1 | browser (3.1.2); iPhone (3.8.1); Android (3.9.1) | 🟡 its browser part, 3.1.2 (ADR-565): `apps/field/e2e/door.e2e.ts`; iPhone 3.8.1, Android 3.9.1 |
| AC-11-04 | **Given** any screen, **then** every word on it comes from the app's translation file, English first, in US units; no screen's words are written into its code | ADR-172; `adms-field-app` §4A.0 · REQ-301 | WCAG 3.1.1 | browser (3.1.2) | ✅ 3.1.2 (ADR-565): `apps/field/test/words.test.ts`, `apps/field/e2e/door.e2e.ts` (each screen added later joins both) |
| AC-11-05 | **Given** `P1-COL-1` has no connection from 07:00 to 17:30 on Monday, **then** every capture screen works all day: nothing a monitor does waits on the server, and nothing asks them to find signal to finish a record | ADR-030; `adms-field-app` §4A.1 · REQ-301, 302 | — | browser, the network off (3.5.1…3.5.5); iPhone (3.8.4); Android (3.9.2) | |
| AC-11-06 | **Given** the phone works out a capacity, a pay item from its bands, a split's share or its next number, **then** it does so with `packages/domain`'s rule, the one the server runs; `apps/field` holds no rule of its own, and a check in the chain says so as "Rules live once" does for the server | Invariant 11; ARCHITECTURE §18 · REQ-301 | — | a test (3.1.2) | ✅ 3.1.2 (ADR-565): `apps/field/test/what-it-holds.test.ts` |

## B. The store on the phone

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-07 | **Given** `P1-COL-1` holds three days of Ana's tickets, her photographs waiting to go, its lists, its login list and an archived queue of Sam's, **then** all of it is in one encrypted store whose random data key is held in the phone's secure storage, this-device-only; none of it is in a plain file, the web layer's storage (`localStorage`, cookies) or a cache | ARCHITECTURE §8, §17; ADR-096; AC-02-19 · REQ-302 | MASVS-STORAGE-1 · MASVS-CRYPTO-1, 2 | browser (3.2.1: IndexedDB, a WebCrypto key that can't be exported); iPhone (3.8.1); Android (3.9.1) | |
| AC-11-08 | **Given** that store, **then** its key is made from neither a monitor's password nor the master passcode: with Ana gone home, a supervisor syncs and turns in her phone, and every record of hers arrives | ARCHITECTURE §8; ADR-096; AC-02-19 · REQ-302, 313 | MASVS-STORAGE-1 · MASVS-CRYPTO-2 | browser (3.2.1, 3.4.3) | |
| AC-11-09 | **Given** an iPhone or an Android phone, **then** the app's data is left out of iCloud and Google backups and out of a move to a new phone (the iOS "exclude from backup" flag and this-device-only Keychain items; Android's backups off and its data-extraction rules); a phone restored from a backup holds none of it | ARCHITECTURE §8; ADR-096 · REQ-302 | MASVS-STORAGE-2 | iPhone (3.8.1); Android (3.9.1) | |
| AC-11-10 | **Given** any failure, **then** nothing secret reaches the phone's logs or a crash report: no password, master passcode, token, key or login-list entry | ARCHITECTURE §16; non-negotiable "never log a secret" · REQ-323 | MASVS-STORAGE-2 | browser (3.2.1); iPhone (3.8.4); Android (3.9.2) | |

## C. The phone's identity

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-11 | **When** `P1-COL-1` is enrolled, **then** its device key is made inside the phone's secure hardware (the Secure Enclave on an iPhone, the Keystore on Android) and can't be exported; the browser build's is a WebCrypto key that can't be exported; each signs in DER and sends the server its public key alone | ARCHITECTURE §7.4; AC-02-18, AC-10-44; C110 · REQ-311 | MASVS-CRYPTO-1, 2 | browser (3.2.2); iPhone (3.8.1); Android (3.9.1) | |
| AC-11-12 | **Given** the token a proof answered, **then** the phone keeps it in its secure storage, never the web layer's; **when** a request is answered `PHONE_NOT_PROVEN`, **then** the phone proves itself again and carries on, asking the monitor nothing | ADR-437…440; C111 · REQ-311 | MASVS-AUTH-1 · MASVS-STORAGE-1 | browser (3.2.2) | |
| AC-11-13 | **Given** any phone, **then** it asks no attestation service of Apple's or Google's, and nothing it sends depends on one | ADR-240; C110 · REQ-311 | MASVS-PRIVACY-1 · MASVS-RESILIENCE-1 (not taken) | browser (3.2.2); iPhone (3.8.1); Android (3.9.1) | |

## D. Signing in on the phone

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-14 | **Given** Kim Nguyen signed in online on `P1-TWR-TDSR`, **then** her token is kept in the phone's secure storage beside the phone's, and both go with every request; **when** one is answered `NOT_SIGNED_IN`, **then** the phone asks her to sign in again and keeps every record she hasn't submitted or synced | ADR-441…444; C114 · REQ-311 | MASVS-AUTH-1 | browser (3.2.3) | |
| AC-11-15 | **Given** Tariq Patel has no assignment on Monday, **when** he signs in online, **then** the phone says "No assignment today: ask your supervisor" and offers the master passcode's setup; **given** two assignments that day, **then** it says "More than one assignment today: ask your supervisor" | ADR-449, 450; C115 · REQ-311 | — | browser (3.2.3) | |
| AC-11-16 | **Given** `P1-COL-1` last read its lists on Saturday, **when** Ana signs in on Monday and the server answers she has no assignment, **then** the phone keeps the lists it holds, shows "Last synced: 2 days ago", and asks again whenever it has a connection | ADR-450; C117; AC-02-44; `adms-field-app` §4A.2 · REQ-311 | — | browser (3.2.3) | |
| AC-11-17 | **Given** the setup version a sync or a lists read answers isn't the one the phone's lists are, **then** the phone reads its lists again; every field event it makes records the setup version of the lists it was made from | ADR-453; C133 · REQ-311 | — | browser (3.2.3) | |
| AC-11-18 | **Given** Kim's assignment on Monday is disposals at Marsh Road TDSR, **then** her phone's menu offers a disposal, the drop-off log and the forms P1 gives a phone at a site, and no collection, haul-out or unit rate work; the site is the assignment's and no screen asks for it | ADR-195, 211, 240; KD-14; `adms-field-app` §4A.6 · REQ-308b, 125c | — | browser (3.2.3) | |
| AC-11-19 | **Given** `P1-COL-1` has no connection, **when** Ana signs in, **then** the phone checks her password against her login-list entry in two steps (Argon2id of the password in NFC under the entry's first salt, then Argon2id of those bytes against its check); the phone keeps no password and no hash the server could reuse | ADR-454; C120; AC-02-41 · REQ-311 | MASVS-AUTH-2 · MASVS-CRYPTO-1 | browser (3.2.4) | |
| AC-11-20 | **Given** a signed-in phone left alone, **when** its inactivity lock is near, **then** the phone warns and one tap keeps the session; a lock loses nothing not yet submitted | ADR-139, 559; AC-02-40 · REQ-311, 324 | WCAG 2.2.1 · MASVS-AUTH-2 | browser (3.2.4) | |
| AC-11-21 | **Given** Ana signed in offline at 07:00, **when** the phone reaches signal at 12:05, **then** it reports that sign-in first, before any record, by `POST /phones/current/offline-sign-ins`, its proof an HMAC keyed by the first slow hash, kept only until she signs out; **when** that report is refused, **then** the phone asks her to sign in online | ADR-531; C141 · REQ-311 | MASVS-AUTH-1, 2 · MASVS-CRYPTO-1 | browser (3.2.4) | |
| AC-11-22 | **Given** nobody is signed in on `P1-COL-1`, **then** it doesn't sync; it syncs when a monitor is signed in, or when the master passcode's holder syncs it | ADR-531; C141 · REQ-308 | MASVS-AUTH-1 | browser (3.4.1) | |

## E. The master passcode on the phone

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-23 | **When** a supervisor types the master passcode, **then** it is held in memory only for the act it opens, never written to the store, a log or a report; each use is kept on the phone with its own id, the phone's clock and offset, never the passcode, and reported at the next sync | ADR-462; C122, C126; AC-02-42 · REQ-311, 312 | MASVS-AUTH-3 · MASVS-STORAGE-2 | browser (3.3.1) | |
| AC-11-24 | **Given** Tariq has no assignment, **when** a supervisor sets up his phone online, **then** it asks the project first, then the work, the site and the monitor, Tariq picked from the project's monitors (a long list paged); **given** no connection, **then** the setup is offered only on the project whose lists the phone already holds | ADR-240, 457; C125; AC-02-38 · REQ-311 | — | browser (3.3.1) | |
| AC-11-25 | **Given** that unplanned assignment, **then** the phone keeps its report until the server answers it saved (or already saved), and sends it before any record made under it | ADR-456, 457; C122 · REQ-311 | — | browser (3.3.1) | |
| AC-11-26 | **Given** a session under the master passcode (as the phone's monitor, or a temporary one for a monitor picked from the roster), **then** every screen shows it as the passcode's, it ends at midnight in the project's time zone even offline, and every field event made in it says so (`masterPasscodeSession`: `AS_MONITOR` or `TEMPORARY`) | ADR-462, 534 (11); C126, C171; AC-02-42 · REQ-312 | MASVS-AUTH-3 | browser (3.3.2) | |
| AC-11-27 | **When** a phone is moved to another site or switched to another monitor under the passcode, offline if need be, **then** the phone makes the new assignment's id itself; a switch to a monitor it already holds an assignment for that day makes none | ADR-458; C123, C124; AC-02-46, 47 · REQ-312 | — | browser (3.3.2) | |

## F. Sync from the phone

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-28 | **Given** the field app's own `SyncClient` over its own store, **then** it passes every check of `syncClientSuite`, reading answers only through `syncAnswerRead` | ADR-470, 475; C130 · REQ-308 | MASVS-CODE-4 · MASVS-NETWORK-1 | suite (3.4.1) | |
| AC-11-29 | **Given** `P1-COL-1` holds 450 records, **then** it sends them in syncs that each keep within the contract's limits (records, unplanned assignments, passcode uses, series and bytes, weighed by `fitByWeight`); each record is kept within `syncedRecordBytesAtMost` as it is made | ADR-470, 504; C128, C166 · REQ-308 | — | suite (3.4.1) | |
| AC-11-30 | **When** a sync is answered `429 LIMITED` or `503 BUSY`, **then** the phone waits the time it is told and sends the same sync again, unchanged | ADR-524; C152, C153 · REQ-308 | — | suite (3.4.1) | |
| AC-11-31 | **Given** a record answered `NOT_SAVED`, **then** it stays on the phone, shown as not saved with the server's words ("… Held on the server for review."); it is never dropped, and sent again it carries the same fingerprint | ADR-467, 468, 472; C128, C132; AC-05-46 · REQ-308c | — | suite and browser (3.4.1) | |
| AC-11-32 | **Given** a sync, **then** its records go first and photographs' files after; a photograph answered `OWNER_NOT_SAVED` is kept and sent again once its record is saved | ADR-481…483; C137 · REQ-308, 316 | — | suite (3.4.2) | |
| AC-11-33 | **Given** a photograph's file, **then** it goes in parts no larger than `MEDIA_PART_BYTES_AT_MOST` (smaller on a poor signal); **when** the app restarts mid-file, **then** it asks the server where the file stands and goes on from there | ADR-479…483; C137, C138 · REQ-316 | — | suite (3.4.2) | |
| AC-11-34 | **When** a supervisor turns in `P1-COL-1` and the server answers `wipe: false`, **then** the phone shows the server's words and what it still lacks, and wipes nothing; **when** it answers `wipe: true`, **then** the phone erases its store's data key and its device key, so nothing it held can be read (a cryptographic erase, NIST SP 800-88), and opens at enrolment | ARCHITECTURE §8; ADR-488…490; C141, C170; AC-02-58 · REQ-313 | MASVS-STORAGE-1 · MASVS-CRYPTO-2 | browser (3.4.3); iPhone (3.8.4); Android (3.9.2) | |
| AC-11-35 | **Given** `P1-TWR-LF` was marked lost and its key's time has run, **when** its proof is answered `MASTER_PASSCODE_NEEDED`, **then** the phone asks whoever holds the passcode, sends it beside its signature, and then syncs and turns in | ADR-530; C141 · REQ-313, 124c | MASVS-AUTH-3 | browser (3.4.3) | |

## G. What every capture shares

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-36 | **Given** any field event, **then** it records the phone's assignment, its lists' setup version, and the phone's clock with its offset; its times are shown in the project's time zone | ADR-100, 240, 453 · REQ-303…306 | MASVS-AUTH-3 | browser (3.5.1) | |
| AC-11-37 | **Given** a poor GPS fix, **then** the phone records whatever fix it has, never judges its accuracy and never holds a field event for a better one | ADR-083; `adms-field-app` §4A.4 · REQ-303 | — | browser (3.5.1) | |
| AC-11-38 | **Given** the number on a badge scanned at New isn't in the phone's certifications, **then** it warns; with a connection it asks to refresh its lists; otherwise, or still not found, it lets the monitor key the truck in by hand, marked manual. Never a refusal | ADR-154, 421 (user); C96 · REQ-317 | — | browser (3.5.1) | |
| AC-11-39 | **Given** a barcode that won't read, **when** Ana types `101001` instead, **then** she picks a reason from the firm's list ("Barcode damaged") and the field event is marked typed, for the back office's flag | ADR-111, 173; AC-04-11 · REQ-319 | MASVS-CODE-4 | browser (3.5.1) | |
| AC-11-40 | **Given** the tower takes a load call, **then** it is typed as a whole number 0–100 on a number keypad: no picker, no steps, no suggestion; 0 is accepted | ADR-111, 116; `adms-field-app` §4A.4 · REQ-304, 319 | MASVS-CODE-4 | browser (3.5.2) | |
| AC-11-41 | **Given** the site's lookup says a load is paid from the tickets it carries, **then** the tower asks for the number of tickets the load carries, never a load call | ADR-243, 370 (user); C83 · REQ-304, 124f | — | browser (3.5.2) | |
| AC-11-42 | **Given** Sam Grant measures `730415`'s boxes on `P1-HO-TDSR`, **then** the phone works out 65 CY with the domain's `Capacity` and shows it; it is never typed; the sync sends the boxes, never a capacity; a certification the server refuses is shown with its words and kept | ADR-320, 469; C129; `adms-certifications` §3A.3 · REQ-322 | — | browser (3.5.5) | |
| AC-11-43 | **Given** Jo Kim's hanger on `301001`, **then** the phone works out its pay item from the payable type and the measurement with the domain's bands, and shows neither its code nor a rate | ADR-207, 213; invariant 20 · REQ-306 | MASVS-PLATFORM-3 | browser (3.5.3) | |

## H. Photographs

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-44 | **When** Ana takes a photograph, **then** the phone records the SHA-256 of the original at capture, shrinks it natively at the original resolution keeping its location, time and depth data (or the depth as a linked file, hashed too), and sends both fingerprints; the browser build keeps the original | ARCHITECTURE §11; ADR-101 · REQ-316 | MASVS-CRYPTO-1 | browser (3.6.1); iPhone (3.8.2); Android (3.9.1) | |
| AC-11-45 | **Given** the shrink's size and quality, **then** they come from configuration, set from what was measured on real phones, never from code | ARCHITECTURE §11; C137 · REQ-316 | — | iPhone (3.8.2); Android (3.9.1) | |

## I. Printing and scanning

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-46 | **Given** collection `101001`, **then** one receipt content model renders it two ways, ZPL for the Zebra and PDF, carrying the same fields; its Code 128 barcode carries the bare number `101001`, never a label | ARCHITECTURE §12; ADR-062; Q-95 · REQ-314 | — | browser (3.6.2) | |
| AC-11-47 | **Given** the browser build, **then** it prints a receipt to PDF or the screen; **given** an iPhone or an Android phone, **then** it prints ZPL over Bluetooth to a Zebra ZQ printer through a native plugin built on Zebra's published SDK | ARCHITECTURE §12 · REQ-314 | — | browser (3.6.2); iPhone (3.8.3); Android (3.9.1) | |
| AC-11-48 | **When** Ana reprints `101001`'s receipt the next day, **then** it prints again; printing writes no record, no audit row and no count | ARCHITECTURE §12; Q-95 · REQ-314 | — | browser (3.6.2) | |
| AC-11-49 | **When** a monitor scans a receipt their phone printed, **then** the phone says the ticket exists; a scan reads by the camera or by a Bluetooth scanner that types like a keyboard, wherever a number is scanned | ARCHITECTURE §12; Q-95, Q-105 · REQ-315 | — | browser (3.6.3); iPhone (3.8.2); Android (3.9.1) | |
| AC-11-50 | **Given** the printable test set of control tickets for "Bayline County PARKS, Hurricane Delphine" (`400001`–`400050`, real Code 128 barcodes), **then** each scans back off paper on each phone | ARCHITECTURE §12 (user, Build 1) · REQ-315 | — | browser (3.6.2, the set); iPhone (3.8.3); Android (3.9.1) | |

## J. Accessibility: WCAG 2.2 AA (the user, ADR-559)

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-51 | **Given** every screen of the field app, **then** the browser end-to-end run checks it against WCAG 2.2's automatable A and AA rules and finds no violation; a screen the run doesn't reach fails the chain | ADR-559; ARCHITECTURE §15; C41 · REQ-324 | WCAG 2.2 A, AA | browser (3.1.3, then each screen's task) | ✅ 3.1.3 (ADR-566): `apps/field/e2e/accessible.ts` on every browser test, `e2e/screens.ts` failing an unreached screen, `apps/field/test/screens.test.ts` (each screen added later is checked in the test that reaches it); 3.1.4 (ADR-568): seven screens, the app's and its prototype's, light and dark |
| AC-11-52 | **Given** any control a monitor taps, **then** its target is at least 24 by 24 CSS pixels, or spaced as WCAG allows | ADR-559 · REQ-324 | WCAG 2.5.8 | browser (each screen's task) |  🟡 the look and the components, 3.1.4 (ADR-568): `apps/field/test/look.test.ts` (the main button, a row and a key 56 px and more), axe-core's `target-size` on every component in `e2e/prototype.e2e.ts`; each screen in its task |
| AC-11-53 | **Given** any action, **then** a single tap does it; nothing needs a drag | ADR-559 · REQ-324 | WCAG 2.5.7 | browser (each screen's task) | |
| AC-11-54 | **Given** a sign-in or the master passcode, **then** the field takes a paste, and no step asks a puzzle or a memory test | ADR-559 · REQ-324 | WCAG 3.3.8 · MASVS-AUTH-1 | browser (3.2.3, 3.2.4, 3.3.1) | |
| AC-11-55 | **Given** any screen, **then** its text meets 4.5:1 contrast (3:1 for large text), and each control's edges, state and focus 3:1 | ADR-559 · REQ-324 | WCAG 1.4.3, 1.4.11 | browser (each screen's task); hand review (3.10.2) |  🟡 the look and the components, 3.1.4 (ADR-568): every colour pair in both themes, `test/look.test.ts`; axe-core's `color-contrast` on every component, light and dark, `e2e/prototype.e2e.ts`; each screen in its task, the hand review 3.10.2 |
| AC-11-56 | **Given** any screen, **then** it works with text at 200% and at the phone's largest text setting, upright or on its side, 320 CSS pixels wide without scrolling sideways | ADR-559 · REQ-324 | WCAG 1.4.4, 1.4.10, 1.3.4 | browser (each screen's task); iPhone (3.8.4); Android (3.9.2) |  🟡 the components, 3.1.4 (ADR-568): every kind of prototype screen at 320 CSS px and 200% text with no sideways scroll, `e2e/prototype.e2e.ts`; each screen in its task, the phones 3.8.4, 3.9.2 |
| AC-11-57 | **Given** VoiceOver or TalkBack, **then** every control says its name, role and state, and "Saved", "Not saved" and "Syncing" are announced as they change | ADR-559 · REQ-324 | WCAG 4.1.2, 4.1.3 | hand review (3.10.2); iPhone (3.8.4); Android (3.9.2) | |
| AC-11-58 | **Given** the keyboard or a bar is open, **then** the control with focus is never hidden behind it | ADR-559 · REQ-324 | WCAG 2.4.11 | browser (each screen's task); hand review (3.10.2) | |
| AC-11-59 | **At** Phase 3's end, **then** every screen has been reviewed by hand against WCAG 2.2 AA, the review recorded, and the field app's Accessibility Conformance Report (VPAT format) is written from the checks and that review | ADR-559 (user) · REQ-324 | WCAG 2.2 AA | hand review (3.10.2) | |

## K. The field app's security checklist

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-60 | **Given** `spec/CHECKLIST-FIELD.md`, **then** every OWASP MASVS control is answered by a named scenario or test, or by the phase that owns it, and the threat model's phone rows (§4.1) have been read again against what was built | ARCHITECTURE §16; C156 · REQ-323 | MASVS v2.1.0, all 24 controls | the checklist (3.1.1, answered whole at 3.10.2) | |

*AC-11-61…73: written by task 3.1.1 (ADR-562), so every control of the checklist's profile (MAS-L2 + MAS-P) has a scenario. Each restates a recorded rule or one of ADR-562's agent defaults; AC-11-65, 67 and 71's update are proposed to the user (`spec/CHECKLIST-FIELD.md` §4).*

| ID | Scenario | From | Answers | Proven at | Passing |
|---|---|---|---|---|---|
| AC-11-61 | **Given** the field app on any phone, **then** its WebView loads only the app's own files: it never shows, frames or goes to a page of any other origin (a link out opens in the phone's browser), its content security policy lets in no script but the app's own and no connection but to the API, no screen makes HTML from data, nothing calls `eval`, and no code arrives after install (an update is a new build); only the native plugins the app uses are installed | ARCHITECTURE §3, §6; ADR-562 · REQ-323 | MASVS-PLATFORM-2 · MASVS-CODE-4 | browser (3.1.2, the page's policy); iPhone (3.8.1); Android (3.9.1) | 🟡 the page's policy, 3.1.2 (ADR-565): `apps/field/test/page.test.ts`, `what-it-holds.test.ts`, `apps/field/e2e/door.e2e.ts`; the WebView and its plugins 3.8.1, 3.9.1 |
| AC-11-62 | **Given** an installed field app, **then** no other app can reach into it: it registers no link, URL scheme or share target, exports no component but its launcher (Android), and refuses other makers' keyboards (iPhone); a test reads the built app's manifest and settings | ADR-562 · REQ-323 | MASVS-PLATFORM-1 · MASVS-AUTH-1 | iPhone (3.8.1); Android (3.9.1) | |
| AC-11-63 | **Given** a password or the master passcode being typed, **then** the field is masked, with no autocorrect, suggestion or keyboard learning; it takes a paste and a password manager (AC-11-54); **and** the app writes nothing to the clipboard, ever | ADR-559, 562; `CHECKLIST-API.md` 6.2.6, 6.2.7 (the phone's half) · REQ-311, 323 | MASVS-PLATFORM-3 · MASVS-STORAGE-2 · MASVS-AUTH-1 | browser (3.2.3, 3.2.4, 3.3.1) | |
| AC-11-64 | **When** Ana signs out, the inactivity lock closes or a supervisor switches `P1-COL-1` to Sam, **then** her session and her offline sign-in's proof are dropped and the next screen shows nothing of her records; the records stay in the store until they are synced | ARCHITECTURE §7.3, §8; ADR-531, 562; AC-02-46 · REQ-311, 312 | MASVS-AUTH-3 | browser (3.2.4, 3.3.2) | |
| AC-11-65 | **When** the field app goes to the background, **then** the app switcher shows a plain cover with the app's name, never the screen (*proposed*, `CHECKLIST-FIELD.md` §4.2); screenshots and screen recording stay allowed; **and** the app sends no system notification (the time clock's nudges are on its own screen) | `adms-field-app` §4A (13); ADR-561, 562 · REQ-323 | MASVS-PLATFORM-3 · MASVS-STORAGE-2 | iPhone (3.8.1); Android (3.9.1) | |
| AC-11-66 | **Given** a native build, **then** it speaks only HTTPS, with no exception allowed (iOS App Transport Security, Android with plain traffic off), the certificate checked by the platform and never switched off; a release build trusts no root a person added, nor the local stack's (a build for the on-device runs may trust the local root, never a release) | ARCHITECTURE §4, §16; ADR-098, 562 · REQ-323 | MASVS-NETWORK-1 | iPhone (3.8.1); Android (3.9.1) | |
| AC-11-67 | **Given** a native build and its installation's pins (*proposed*, `CHECKLIST-FIELD.md` §4.1: the public-key hashes of at least two certificate authorities' keys, one a backup, set beside the API's address), **when** a connection's chain holds none of them, **then** the phone sends nothing over it, keeps every record and says "Can't reach the server safely. Your work is kept on this phone."; the browser build doesn't pin | ADR-030, 562 · REQ-323 | MASVS-NETWORK-2 | iPhone (3.8.1); Android (3.9.1) | |
| AC-11-68 | **Given** the field app, **then** it asks the phone for the camera, its location while the app is in use and Bluetooth (the printer and a scanner), each when first needed, with its reason from the translation file, and nothing else (no photo library, contacts, microphone or background location); it reads a location only when a monitor captures one; a photograph goes only into its store, never the phone's shared library; **when** a permission is refused, **then** the work goes on without it, warned, never stopped | ARCHITECTURE §11; ADR-052, 083, 562 · REQ-303, 316, 323 | MASVS-PRIVACY-1 · MASVS-STORAGE-1 | browser (3.5.1, 3.6.1); iPhone (3.8.2); Android (3.9.1) | |
| AC-11-69 | **Given** the field app, **then** it holds no analytics, crash-reporting, advertising or other outside SDK and reads no advertising or hardware identifier; the phone is known by its enrolment alone, and nothing leaves it but to the firm's own API (as AC-11-01); a test reads `apps/field`'s dependencies and the native builds' | ARCHITECTURE §6; `CHECKLIST-API.md` §5.5 (14.2.3, the phone's half); ADR-562 · REQ-323 | MASVS-PRIVACY-1, 2 | a test (3.1.2); iPhone (3.8.1); Android (3.9.1) | 🟡 its test's part, 3.1.2 (ADR-565): `apps/field/test/what-it-holds.test.ts`; the native builds 3.8.1, 3.9.1 |
| AC-11-70 | **Given** a release build, **then** debugging is off (the app's and the WebView's), it ships no source map, test hook or debug log, and the platform's compiler protections are on, none turned off; the browser build is a test build | ADR-562 · REQ-323 | MASVS-CODE-3 · MASVS-PLATFORM-2 · MASVS-RESILIENCE-3, 4 (two items taken) | iPhone (3.8.1); Android (3.9.1) | |
| AC-11-71 | **Given** a native build, **then** it targets the newest platform version its store takes and states a minimum, by its task's ADR; **and** (*proposed*, `CHECKLIST-FIELD.md` §4.5) **given** the installation's oldest app version it takes, a policy value, **when** an older phone proves itself, **then** it is told "Update the app to send your work" and sends nothing until it is updated; capture goes on and the update keeps its store, so nothing is lost | ADR-030, 052, 562 · REQ-301, 323 | MASVS-CODE-1, 2 | API (3.8.1); iPhone (3.8.1); Android (3.9.1) | |
| AC-11-72 | **Given** `pnpm security`, **then** its dependency audit covers the native builds' own libraries beside the JavaScript ones, each pinned, and its secrets scan reads the built app as well as the source: the app ships no key, password, token or secret of the server's | ADR-276, 562 · REQ-323 | MASVS-CODE-3 · MASVS-STORAGE-1 | security (3.1.2, the bundle; 3.8.1, 3.9.1, the native libraries) | 🟡 the bundle's part, 3.1.2 (ADR-565): `pnpm security`'s scan of `apps/field/dist/web/` (`tools/security/test/checks.test.ts`); the native libraries 3.8.1, 3.9.1 |
| AC-11-73 | **Given** a phone with no screen lock, **when** it is enrolled and at each sign-in, **then** it says "This phone has no screen lock. Set one to keep its data safe." and the work goes on | ARCHITECTURE §7.2 (5), §8; ADR-052, 562 · REQ-302, 323 | MASVS-CRYPTO-2 | iPhone (3.8.1); Android (3.9.1) | |

---

## L. Every earlier scenario with a field app part, and the task that proves it

48 rows of files 02…08 and 2 of file 10 name the field app (Phase 3) as a layer still to come
(counted by `| AC-` rows whose **Proven at** names the field app, 2026-10-17). Each is proven at
the layer its own row names; the field app's part by the task below, under a test named by its ID.

| Task | Scenarios |
|---|---|
| 3.1.2 the shell and its door | AC-10-08 (the native origins on the CORS list) |
| 3.2.1 the store | AC-02-19 |
| 3.2.2 enrolment and the phone's proof | AC-02-07, AC-02-18 |
| 3.2.3 online sign-in and the assignment | AC-02-35, AC-02-36, AC-07-91 |
| 3.2.4 the login list and signing in offline | AC-02-39, AC-02-40, AC-02-41 |
| 3.3.1 setup with no assignment | AC-02-38 |
| 3.3.2 switching, moving, passcode sessions | AC-02-42, AC-02-46, AC-02-47 |
| 3.4.1 the phone's `SyncClient` | AC-05-01, AC-05-06, AC-05-07, AC-05-08, AC-05-20, AC-05-46 |
| 3.4.3 sync and turn in, the wipe | AC-02-58, AC-05-56 |
| 3.5.1 the collection, and what every capture shares | AC-02-44, AC-02-45, AC-04-08, AC-04-11, AC-04-24, AC-04-91, AC-04-92, AC-04-95, AC-04-96, AC-04-98, AC-08-06 |
| 3.5.2 the tower and the haul-out | AC-04-38, AC-04-44 |
| 3.5.3 unit rate | AC-04-70 |
| 3.5.4 forms | AC-04-101 |
| 3.5.5 certifying on a phone | AC-03-09, AC-03-14, AC-03-36 |
| 3.6.1 photographs | AC-04-79 |
| 3.6.2 receipts | AC-04-97 |
| 3.7.1 the time clock's records | AC-02-54, AC-02-55 |
| 3.7.2 the phone's clock | AC-02-50, AC-02-51, AC-02-52 |
| 3.8.1, 3.9.1 the key in real secure hardware | AC-10-44 (and AC-02-18 on each phone) |

## The count

| | Scenarios | Passing |
|---|---|---|
| Sections A…K, new | 73 (AC-11-61…73 by task 3.1.1, ADR-562) | 5 whole (AC-11-01, 02, 04, 06, task 3.1.2, ADR-565; AC-11-51, task 3.1.3, ADR-566), 7 in part (AC-11-03, 61, 69, 72, task 3.1.2; AC-11-52, 55, 56, task 3.1.4, ADR-568) |
| Section L, a field app part of files 02…10 | 50 | 0 (each still passes at the layers it already does) |
| **Phase 3's** | **123** | **5, and 7 in part** |

## Left to the task that builds it

1. ✅ **MASVS's version, profile and each control's number**: answered by task 3.1.1 (ADR-562):
   MASVS v2.1.0, profile MAS-L2 + MAS-P with MAS-R not taken, the numbers in the Answers column;
   certificate pinning and the app-switcher cover proposed (`spec/CHECKLIST-FIELD.md` §1, §4;
   AC-11-61…73), for the user.
2. 🟡 **The ticket number entered twice and WCAG 3.3.7, Redundant Entry** (3.1.4, put to the user with the prototype, ADR-561; built by 3.5.1). **Read by task 3.1.4 (ADR-569 (4)):** essential where a person copied the number (one the phone made, one typed because the barcode won't read), not after a scan; the choice is put to the user as **Q-218**, the agent recommending re-entry only where a person copied it. The number scanned
   or shown and then typed again by hand (ADR-209, an agent default) asks for information already
   given in the same process. WCAG lets that stand where entering it again is essential. The task
   says whether this case is essential and, if it isn't, puts the choice to the user. The user
   already listed whether to keep hand re-entry as a Phase 3 design question (`adms-field-app`
   §4A.7).
3. **What the phone does after ten wrong tries of the master passcode offline** (3.3.2; NIST SP
   800-63B §3.2.10; C126).
4. **When a kept record is sent again**: by itself, by the monitor, or only at turn-in (3.4.1;
   ADR-470 (3)).
5. **A refused proof right after a turn-in ask** read as turned in, and what the phone shows then
   (3.4.3; C141).
6. **What the time clock's records are**, the sync's kind that carries them, and the manager's
   approval (3.7.1; ADR-241): each its ADR, the scenarios of file 02 restated there.
7. **Where the receipt content model lives** (3.6.2): it renders on the phone and, for the
   receipt batch (REQ-414), in the back office, so it is shared; which package is its ADR.
8. 🟡 **Put to the user by task 3.1.4 (ADR-569) as Q-215, Q-216, Q-217, with the prototype.** **The Build 1 board's open designs** (`adms-field-app` §4A.7): a confirmation after each
   captured value, a monitor scorecard, a bottom menu. All are put to the user with 3.1.4's
   prototype, each with ADR-561 (7)'s recommendation, and none is built without the user's word.

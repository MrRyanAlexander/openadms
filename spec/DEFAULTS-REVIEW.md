# Open ADMS — Agent defaults, for you to confirm or overturn

*(Task 2.8.9, Phase 2's exit, criterion 9; ADR-519, ADR-537. Written 2026-10-16 from
`agent_store/SUMMARY.md` §4. Each row's full wording is the ADR in brackets.)*

**What this page is.** These are choices the agents made on their own because nothing you had said
covered them and they didn't change money, evidence or what a monitor has to do (ADR-230). Each one
is built and working today. Phase 2 closes once you have confirmed or overturned them.

**How to answer, fastest first:**
1. Write **`ALL CONFIRMED`** under this line, or **`ALL CONFIRMED EXCEPT D12, D40 …`**, and put a
   note in the **Your answer** cell of each row you're overturning, saying what you want instead.
2. Or work through it row by row: write **OK** or what you want instead in each **Your answer** cell.

99% APPROVAL - SEE 1 note, labelled as *NOTE*

Your answer for the whole page:

> **Recorded 2026-10-17 (ADR-538).** Every row confirmed but **D1, overturned** (your 1a note, and
> your answers in chat: new view permissions; a ticket's money kept as it is): built as three view
> permissions, ADR-539, with **D8, D10, D12, D48 and D78** following it. **D39:** your note confirms
> what is built (nothing flags a move or a setup made under the master passcode), ADR-540. Phase 2's
> exit is met. This page is now a record; `agent_store/SUMMARY.md` §4 holds no open default.

**Where to spend your time.** Part 1 is what a firm, a monitor or the back office would notice. Part 2
is about sign-in and security. Parts 3–5 are how the server is built (limits, timeouts, internal
shapes) and earlier phases; you can confirm those as a block. Part 6 lists questions that are
still open to you; they are **not** needed to close Phase 2.

An overturned row becomes its own task. Nothing changes until you answer.

---

## Part 1 — What a firm, a monitor or the back office would notice

### 1a. What the back office can see and do

*NOTE* Everyone in the back office should not have access to everything. Permissions should get settings and details that otherwise do not pertain to the other user. For instance an A

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D1 | Everyone in the back office (admins and managers/analysts) can **read** everything in the back office, whatever permissions they hold. Permissions only gate *acts* (correct, void, QC, lock…) | 535 (1) | **Overturned** (your note): a manager/analyst reads an area only with its view (view review, view setup, view dispatch); an act needs its area's view too. ADR-539 |
| D2 | A ticket's transaction lines show their **rate and amount** to every back-office reader | 535 (2) | Confirmed (you: "keep as is"): whoever reads the ticket, with view review. ADR-539 |
| D3 | A pay item's **rates** are a separate read that needs the **Setup** permission | 535 (3) | |
| D4 | **Previewing a setup save** (e.g. "what would changing this rate re-price?") works by actually running the save and undoing it, so the preview is exactly what the save would do | 535 (4) | |
| D5 | **QC or locking many tickets at once**: each ticket succeeds or is refused on its own (one bad ticket doesn't stop the rest); at most **200** tickets per request | 535 (5) | |
| D6 | An **invoice batch is never archived** | 535 (6) | |
| D7 | The **dispatch board** warns of six things beside a row (the same person twice that day, the same phone twice that day, outside the project's active window, the project closed, unit rate pay items without unit rate work, and the site not active that day). A board search covers **62 days** at most. *(This replaces ADR-429's "nothing warns of a second assignment".)* | 535 (9) | |
| D8 | A phone's **sign-in sessions** can be read by anyone in the back office | 535 (10) | Follows D1: with view dispatch. ADR-539 |
| D9 | For a certification, "what it was saved with" is read as **its flags** | 535 (11) | |
| D10 | For any ticket, the back office can read **what each reconciliation run decided and why**, newest first, open to the whole back office | 536 (1) | Follows D1: with view review. ADR-539 |
| D11 | When a run **couldn't process** a ticket, the back office is told that it couldn't. The technical error text stays in the server's log | 536 (2) | |
| D12 | The **held records, files set aside and quarantined records** are readable by every admin and manager/analyst | 526 (a) | Follows D1: with view review. ADR-539 |
| D13 | **Reprocess** names just the tickets. A ticket locked as invoiced is left out and counted ("N queued, M locked left as they are"). Asking about a number that isn't a ticket is answered `NOT_A_TICKET` only for numbers a person typed. At most 100,000 tickets per request | 498, 499 | |
| D14 | Review acts take **no new permission** (each uses the one it always had). "Not allowed" never says who does hold it. A note is up to **500** characters | 430…435 | |
| D15 | A refused request says **which field** was wrong. A correction's answer doesn't wait for the re-run's results. An impossible fix to a back-office record is refused | 430…435 | |
| D16 | **Signatures on file** take the *QC* permission. A measuring correction changes measurements only. Revoking a certification a second time restates the day and the reason | 430…435 | |

### 1b. Records made or corrected in the back office

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D17 | A **certification entered from its paper sheet** needs the *correct* permission, names the monitor on the sheet as its certifier, and keeps the **sheet's own number**. The back office never issues a cert number for it | 534 (1) | |
| D18 | **Photos for records made in the back office** go through one upload, only onto records made in the back office; the server works out each file's fingerprint itself | 534 (2) | |
| D19 | **Correcting an ROE's number**: refused if another ROE has that number. Field events, surveys and incidents that carry the new number get linked to the ROE; ones linked to it that carry a different number get unlinked. What each record captured never changes, and the tickets on both sides are re-run | 534 (3) | |
| D20 | A form's answers typed **in the back office** are refused if they don't fit the form. A phone's are kept exactly as sent | 534 (4) | |
| D21 | **Taking back a revocation** clears its date, reason and who revoked; the audit log keeps them and the reason for taking it back | 534 (5) | |
| D22 | **Taking back a flag's acceptance** is marked on that acceptance. Accepting it again is a new acceptance | 534 (6) | |
| D23 | The database refuses changes to a **locked ticket's field events**, except the link a ticket number makes | 534 (7) | |
| D24 | A field event made under the **master passcode** records, in a column of its own, which way the session was opened (as the monitor, or a temporary one) | 534 (8) | |
| D25 | An **ROE entered in the back office** records who entered it and asks no reason (it's setup, not a correction) | 534 (9) | |
| D26 | **Saving a held record** needs *correct*; **closing** one (or a file set aside) needs *void*; a reason is required either way | 526 (b) | |
| D27 | A record saved from a held one **keeps the id the phone gave it** | 526 (c) | |
| D28 | A held **report** and a **file set aside** can only be closed, never saved | 526 (d) | |
| D29 | A pay item can change its code, description, size band, unit, conversion and capture settings, **never its payable type or kind of work** | 423…429 | |
| D30 | A contract's link must be `https`. A rate is reported back only to whoever set it. A site's dates can be changed | 423…429 | |
| D31 | The **setup check** and the quantity lookups are open without the Setup permission. Every setup *change* takes Setup | 423…429 | |

### 1c. Phones, monitors and the master passcode

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D32 | A **sign-in made offline** is accepted once. If it's reported again it's refused, and the monitor signs in online | 531 (a) | |
| D33 | Only an **admin** (not someone with Setup) changes how long a monitor's sign-in on a phone lasts | 531 (b) | |
| D34 | An offline sign-in under the master passcode is accepted only if it used **the passcode in force now** | 531 (c) | |
| D35 | Any phone can prove itself with **the master passcode beside its key** (the supervisor at it) | 531 (d) | |
| D36 | A **monitor is created only from an enrolled phone, with the master passcode**; nobody ever types a Monitor ID | 436…442 | |
| D37 | A phone's name is 1–80 characters | 436…442 | |
| D38 | **An unplanned assignment** (set up on the phone with the master passcode): kept as the phone reported it; for a monitor only; on the phone's own day; the first report stands | 455…464 | |
| D39 | A **move to another site and a switch of monitor** go through the same request. The server doesn't refuse a move to another project or other work (it flags, never blocks). **Two planned assignments for one phone at the same time**: the phone takes neither, and the monitor asks their supervisor | 455…464 | Confirmed (your note): a move or setup under the passcode is never flagged. ADR-540 |
*NOTE* through the same request...which requires the master passcode. There would be no reason to flag this move or setup on a user as the master passcode was used. 

| D40 | A session under the passcode is marked as such; a **temporary one lasts to the day's end or 12 hours** | 455…464 | |
| D41 | What setup by passcode offers: every open project, every monitor in service, only live sites and pay items; each read is logged as a use of the passcode | 455…464 | |
| D42 | A **wrong password tried offline** never counts against the monitor on the server. A switch or session reported later signs out the earlier one | 455…464 | |
| D43 | **Address lookup** from the phone's GPS: the street only; "no address" is a normal answer; 5 seconds at most; nothing about it is logged | 455 | |
| D44 | **What a phone's lists carry**: a pay item's code but not its description (the monitor picks by name); every certification of the project but nothing about its driver; a site by name, type and two facts; an ROE's number, address and parcel but **never its owner**, and only where needed; "pre-work survey done" from a survey carrying the ROE's number; no Unit of Measure | 449…454 | |
| D45 | The **login list** (offline sign-in): only what the phone lacks, 50 at a time; the passcode's check always sent | 449…454 | |
| D46 | A phone tells the server which passcode version and which lists it holds; a setup version is made only when the phone first gets something different | 471…475 | |
| D47 | A **planned assignment** is for a monitor, admin or manager/analyst; never on a phone out of service; it can be changed or withdrawn while it stands. An unplanned one is shown, never changed | 423…429 | |
| D48 | Dispatch takes the *dispatch* permission. Any admin or manager/analyst can read phones | 423…429 | Follows D1: phones read with view dispatch. ADR-539 |

### 1d. Held records, turn-in and lost phones

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D49 | A **photo whose record is held** stays with it, and the phone is told it's saved | 526 (e) | |
| D50 | A **report the server can't keep** is held for a person | 526 (f) | |
| D51 | **Closing a held photo** lets its phone be turned in | 526 (g) | |
| D52 | At **turn-in**, a held record counts as "on the server". Anything else not received keeps the phone from being turned in | 487…490 (b) | |
| D53 | **Number blocks**: a series the phone never reported, or a lost phone's blocks, is retired whole | 487…490 (c) | |
| D54 | **Turning in a phone that's still in service** makes it **Retired** | 487…490 (d) | |
| D55 | The passcode's use at turn-in is logged even when the turn-in doesn't finish | 487…490 (g) | |
| D56 | A phone revoked by **the firm's time limit** can still prove itself with key + master passcode together, reaching only its sync, files, reports and turn-in | 530 (a) | |
| D57 | The firm's phone-key time can be set up to **one year** at most | 530 (b) | |
| D58 | A phone whose key is revoked is **never put back**; it is enrolled again | 530 (e) | |
| D59 | The phone-removal reasons shipped: **Lost in the field, Stolen, Broken, Replaced** (the firm can add its own) | 530 (f) | |
| D60 | The worker doesn't end a revoked phone's sessions (the door already refuses it everything but sending) | 530 (h) | |
| D61 | Something sent again unchanged gets the same held record. A held record saved later still waits for a person. "Held on the server for review." is the phone's message | 471…475 | |
| D62 | A saved certification's warnings aren't sent to the phone | 471…475 | |
| D63 | A synced record never says which phone it came from (the sync does). A certification whose number is held is **held, not quarantined**; its photos are separate records | 466…470 | |

### 1e. Closed projects, firm settings and viewers

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D64 | **Closing a project** is refused only while the worker still has jobs for it | 529 (1) | |
| D65 | On a **closed project** these can still be written: a viewer's access, a held record, a file set aside, a held record's photo | 529 (2) | |
| D66 | **Sub names that look alike** (the `SUB_NAME_ALIKE` flag): compared after ignoring case, spaces, punctuation and company endings (Inc, LLC…) | 529 (3) | |
| D67 | The **viewers' two-step setting** is changed only by an admin. The phone-key hours by an admin or someone with Setup | 530 (c) | |
| D68 | When two-step becomes required, a viewer is sent to set it up at **their very next request** | 530 (d) | |
| D69 | A **viewer can open a photo's file** wherever its record is shown to them | 535 (7) | |
| D70 | **Client users and auditors** can see the setup check and the site's quantity lookup | 535 (8) | |
| D71 | Viewers' reads are built now beside the back office's. Exports and page filters stay with Phase 4 | 522 (a) | |
| D72 | An **address the phone says it looked up** is taken at the phone's word | 522 (b) | |
| D73 | A viewer reads a ticket by project, workflow and number; one they may not see is "not found". A sub's user sees its own name, not its prime's | 430…435 | |
| D74 | Only an **admin** changes the master passcode, with their own password | 423…429 | |
| D75 | A person brought back from archive returns with what they held. Changing a sign-in address keeps their sessions and tells the old address. A role change is only between admin and manager/analyst | 423…429 | |

---

## Part 2 — Sign-in and security

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D76 | A right password with no two-step code is told "a code is needed"; a wrong code counts as a wrong try | 412 | |
| D77 | **No admin clears their own authenticator** (another admin does). Setting one up ends the person's other sessions and must be finished in 10 minutes | 412 | |
| D78 | **Only an admin manages people**; any admin or manager/analyst can read a person; no Monitor ID in the back office; an archived person's email can be used again | 412, 415 | Follows D1: a person read with view dispatch. ADR-539 |
| D79 | `pnpm installer:admin` lets any admin back in (the way back if every admin is locked out) | 415 | |
| D80 | A phone's key is **ECDSA P-256**; a sign-in challenge lasts 2 minutes and works once; a phone's token lasts **15 minutes**, one per sync | 436…442 | |
| D81 | "Device key" and "Master passcode" appear in the audit log as actors that are no person. A failed phone proof is logged, not stored. A wrong passcode always gets the same one refusal | 436…442 | |
| D82 | A phone may make **600 requests a minute**, still also limited per address | 487…490 (h) | |
| D83 | A refusal is logged at warning level with the person's or phone's id | 513 (a) | |
| D84 | An error answer is a plain code and a request id, never internal detail | 385 | |
| D85 | The checklist's written answers (`spec/CHECKLIST-API.md` §5) and its four levels of data | 515 (a), (b) | |
| D86 | The stack's own certificate authority: P-256, the root for ten years, a year for each service | 517 (a) | |
| D87 | The three containers that can't be fully locked down keep only what they need (Caddy's one capability, the routing server running as root inside its own container, the address server's own needs), each with its reason | 517 (e) | |
| D88 | The same-origin part of REQ-204 (the back office and the API as one site) moves to the demo deploy, REQ-517 | 512 (b) | |

---

## Part 3 — Engineering limits and how the server is built *(safe to confirm as a block)*

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D89 | **When the database is busy**, a request is told `503 BUSY`, "try again in 5 seconds", never an error. The same for a piece of work that ran out of time. A fixed 5-second wait for everyone | 524 (a)…(d) | |
| D90 | A shapefile shape over 50 million ring pairs isn't read. A 100,000-corner boundary takes 2.3 s and is left that way | 524 (e), (f) | |
| D91 | A second turn-in at once, or a top-up after a turn-in, is refused as "phone not proven" | 524 (g) | |
| D92 | **Sync sizes**: one sync at most 1 MiB; one record at most 256 KiB; at most 200 records, 20 unplanned assignments, 100 passcode uses and 20 series per sync (you said "seems like a rather large payload… but sure") | 504, 467 | |
| D93 | **Photo uploads**: 32 MiB a file, 4 MiB a part, 256 MiB held in memory, 300 parts a minute; a file whose fingerprint doesn't match is set aside; the usual image kinds | 478…485 | |
| D94 | **Map files**: 16 MiB, unzipped at most 64 MiB and 1,000 files; kept by fingerprint; a file with no projection is read as longitude/latitude only when it can be | 478…485 | |
| D95 | Answers from the map servers at most **256 KiB**; the object store answers within 30 s | 517 (f), 478 | |
| D96 | The **job queue** is two tables of our own (not a library). A job is set aside after **five tries** (no flag on the ticket). Only the API adds a job. One worker process works projects in turn. **200 tickets** per job | 418…420, 506 | |
| D97 | `/health` says only that the server answers; `/readiness` (open to anybody) says whether it can do its work; the worker's backlog is a figure, never a verdict | 507 | |
| D98 | The load test: **1,000 loads from 54 phones at once**. A phone told to wait does, then sends the same again. Its timings are written down, never a pass/fail threshold | 505 | |
| D99 | The object store's internals on its own loopback behind its own TLS (`weed server`); S3 plain only on that loopback | 525 | |
| D100 | Postgres trusts only its own socket inside its container; a container's own loopback isn't counted as a network hop; the routing server sits behind its own TLS proxy | 517 (b)…(d) | |
| D101 | The API's certificate paths are written into its settings file | 517 (g) | |
| D102 | NestJS 12 rather than 11 | 380 | |
| D103 | Whole numbers held to what Postgres's `integer` holds; only JSON and a file part are read from a request | 513 (b), (c) | |
| D104 | Lint uses strict equality (`== null` kept) | 514 (b) | |
| D105 | The scan for secrets looks for three more kinds (a whole password hash, an authenticator's secret, a private key); a test's own example is marked on its line | 508 (d), (e) | |
| D106 | Only Prisma's tagged SQL templates are allowed, and none changes the schema. REQ-205 read as the running product (three tools reach Postgres by name and reason) | 508 (b), (c) | |
| D107 | The list of endpoints is held exact in a test; every request is tried with a body it doesn't take; a story stopped by a server error prints the API's last five error lines | 512 (c)…(e) | |
| D108 | The worker's re-run: a job another run already covers is taken with it; a project's neighbouring tickets are found by an indexed read (measured in 2.8.2) | 506 | |
| D109 | How the test stories reach the real API, phones, browsers and job loop, and the few steps kept in-process on purpose | 491…503 | |
| D110 | A set-aside job with no ticket is put back as a records job | 498, 499 (d) | |
| D111 | A ledger of what was received holds only stored records; one job per record; a phone's top-up is the device key's act | 471…475 | |
| D112 | A time is a UTC instant with its offset; the sync's checks for any client never decide whether a phone resends a "not saved" record | 466…470 | |
| D113 | An unread record is named by a fingerprint of what was sent; turn-in's sizes; `DEVICE_TURN_IN` as its security event | 487…490 (e), (f), (i) | |
| D114 | The planning choices: how tasks were cut into parts; the exit's 32 rows read whole; REQ-322, 323 and 324 added to Phase 3; the checklist's 25 earlier items each citing a test | 504 (a), 508 (a), 512 (a), 513 (d)…(f), 514 (c), (d), 515 (e), 518 (d), (e), 487 (a) | |
| D115 | The harness's tower phone asking its site's lookup is left named, not built (Phase 3 builds the real phone) | 522 (c) | |
| D116 | The door test counts a reset's `429` as a pass; AC-10-32's sign-in log is read in the process's own log | 525 (e), (f) | |
| D117 | Phase 2's exit criteria and plan (ADR-376, 377), with ADR-519's three added | 376, 377 | |
| D118 | Setup's database refusals answered with their own codes and words; "Pays when" and a rule shown whole; the setup check reads every live form; what queues every ticket | 423…429 | |
| D119 | The dev stack's sign-in accounts (`pnpm local:accounts`) | 412, 415 | |

---

## Part 4 — Phase 1 and the spec

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D120 | Scenarios written part by part before each milestone's code; one task per response | 300 | |
| D121 | **A contractor user sees none of a project's setup.** No viewer sees contact details or a client's notes. Archiving takes away a permission or a viewer's project. A contractor user must name a contractor. Grants are audited as security events | 314, 315 | |
| D122 | P2's setup beyond the mission's words; the fill and freon pay items have no kind of work; each pay item's capture settings; Cypress Creek Landfill's GPS and permit; AC-01-80 names three refusals where setup has five | 316 | |
| D123 | What the certification scenarios added to the example world | 317 | |
| D124 | **Capacity**: a zero or blank measurement gives no capacity; every operation rounds as its own step; under half a CY is 0 CY (and 0 CY is saved); the made-up example boxes | 320, 321 | |
| D125 | A sub placed under another prime is saved apart, with a warning; a new sub is a hauler or a crew by kind; "replaced on" is the new certification's day; nothing checks a certifying assignment or a helper's; vehicle type isn't required | 321 | |
| D126 | ROE number format `R-0007`; **100 ROE numbers per phone**; control ranges never share a number; a cert series only once seeded | 323 | |
| D127 | A **typed number with no reason is received** (and flagged); a typed capacity only on a hand-keyed truck; half a GPS fix is refused; no detail of a field event is required; a disposal with both a load call and a count is received | 324, 325 | |
| D128 | Split suffix letters; carried tickets and a scale receipt's weights kept as written | 325, 326 | |
| D129 | No database limit of 8 photos; **viewers see a photo's record, never where it was taken**; an ROE carries no setup version; a form's empty answers; a photo field's answer is the photo's id | 326, 327 | |
| D130 | `spec/CONVENTIONS.md`'s names (the example world, the words) | 234 | |

---

## Part 5 — Older defaults, one line each *(safe to confirm as a block)*

| # | What we chose | ADR | Your answer |
|---|---|---|---|
| D131 | Setup lists every active site for any work; a phone set up at a site without the matching fact still works and its tickets are flagged | 205 | |
| D132 | A corrected site GPS recomputes the mileage of un-invoiced tickets there | 208 | |
| D133 | The re-entered ticket number must match before the ticket saves; the tower's order is badge, load call (or weight), then the number *(the order since amended by the user: the number at New, right after the badge, ADR-571)* | 209 | |
| D134 | *Reduced* joins the debris type criterion; setup **warns** (never refuses) when an entry not marked *Reduced* is added to the haul-out form | 214, 308 | |
| D135 | Drop-off logs aren't checked against the site's facts | 215 | |
| D136 | The tower may offer a scale receipt number, optional, at Final Disposal sites | 227 | |
| D137 | **Event-driven, not event-sourced**: a correction changes the field event in place, the prior value kept in the audit log. Forms and certifications are records, not a ticket's events | 236 | |
| D138 | A rule with only *Remove transaction* / *Void ticket* may leave its contract blank and runs on every ticket of its form; each criterion names the field event it reads | 239 | |
| D139 | The time clock holds hours only, no pay or hourly rates; viewers don't see anyone's hours | 241 | |
| D140 | The site's quantity lookup reads the paying pay items' capture settings (weight / count / load call); the tower phone holds no ticket list, and the worker compares the count after sync | 243 | |
| D141 | A rule's *Debris type* criterion reads the **collection's** debris type | 244 | |
| D142 | People's marks (QC, lock, batch, acceptance) are records of their own beside what they mark | 245 | |
| D143 | `spec/RULES.md` §7 "Is valid" adopted, the setup check listing invalid rules; the white goods 40-mile example code | 247 | |
| D144 | Licence `Apache-2.0` (the user, 2026-10-23, superseding ADR-171); `pnpm licences` checks every installed package, refusing GPL, LGPL and AGPL | 255, 262 | |
| D145 | The local stack's hostnames, port 55432, `down` keeping data; the installer's command names and three questions; **a master passcode of 8 to 128 characters**; the database name `adms` | 263, 266 | |
| D146 | Database ids are UUIDv7 made by the database (a field event's id made by the phone); foreign keys restrict deletes | 268 | |
| D147 | Prisma's client and adapter versions; each test story on its own throw-away database; the system actor's guard; `pnpm security` | 273, 275, 276 | |
| D148 | Flexible form fields only where the engine, rules and flags never read them; anything they read becomes a real column | 278 | |
| D149 | `ROADMAP.md`'s place, and Phase 5 drawn as two rows | 280 | |
| D150 | The Phase 0 models, map server images and hook rules | 281, 282, 283 | |
| D151 | The data model page's sixteen defaults (one table per list, no ticket table…) | 284 | |
| D152 | **When the two cert numbers on a load differ, the certification on the field event that took the quantity bills it** (the disposal for a load; the haul-out collection for a haul-out) | 285 | |
| D153 | The pay item's first shape, later rebuilt (ADR-301, 309) | 286 | |
| D154 | The golden mission's split haul-out is paid by the CY; `MULCH-HO-TN` at a made-up $20.00 a ton and the two haul-out rules by disposal site | 296, 297 | |
| D155 | *Haul-outs leave here* offered only on a TDSR/DMS site | 298 | |
| D156 | **Pay item codes**: an archived pay item keeps its code; codes compared exactly as typed; another project may reuse a code; a description is required and may repeat; an exact duplicate rule is refused, naming the one it duplicates | 301 | |
| D157 | The firm's lists as eighteen tables with built-in keys; the project's starting settings from policy values; a kind of unit rate work taken off a project by archiving | 302, 303 | |
| D158 | Contractors on a project and contracts; the database holds "the prime" to one of the project's primes; contractors keep contact details | 305, 306 | |
| D159 | Forms, debris types on them, field tags and the firm's own fields; the haul-out form's *Reduced* warning's words | 308 | |
| D160 | Pay items in full: payable type, unit (`CY` `TN` `EA` `LB` `HR` `CREW_DAY` `TBN`), size bands, a rate for each prime, a crew day's steps | 309 | |
| D161 | Disposal sites in full, the project map as versions never edited, shapes from GeoJSON first | 311 | |
| D162 | The rest of the older decisions' small choices, each in its ADR: 228, 229, 310 | 228, 229, 310 | |

---

## Part 6 — Not defaults: questions still open to you *(not needed to close Phase 2)*

Answer any time, or leave for later. They're in `SUMMARY.md` §4 and stay there until you do.

- **Photos required:** should *photos required* take a number (e.g. "at least 2")? (ADR-345)
- **A contractor's login:** does a contractor user see its tickets' flags? Does a first-tier sub see the lines of a ticket its own second-tier sub worked? (ADR-361, C76)
- **Private citizens:** do free text, the firm's own form fields, a signed ROE form's photo and an ROE's address count as naming a private citizen (and so hidden from viewers told not to see them)? Today none is hidden. (C67 (d))
- **The setup check:** should it also list two debris types that look alike, and a prime with a contract but no rule for a debris type? (ADR-229, C74)
- **A flag's words:** should `CARRIED_COUNT_MISMATCH` say "tickets" rather than the kind of work? (C83)
- **The golden mission's audit excerpt:** it puts `301003`'s `COMPLETED` → `VOID` on Luis's row; the engine keeps his void as his record and the status change under the system. Fine as built? (ADR-368 (5), C82)
- **Luis's *dispatch* permission** in the mission's §1 and AC-02-10 (C102).
- **Notes awaiting approval:** ARCHITECTURE §7.2's and §7.4's ADR-531 notes (C170); the ADR-240 notes in ARCHITECTURE §7–§10; AC-02-83, 84 and the note under §7.0 (ADR-415); `spec/CONVENTIONS.md` read as approved whole (ADR-378); the six REQs moved between phases (ADR-287); Delaware's map extract standing in for Bayline County (ADR-282).
- **Your own master passcode** (this machine has a throw-away one: `pnpm installer:teardown`, then `pnpm installer`), and **a README** when you want one (KD-34).
- **Phase 3's first question**, when you open it: the accessibility standard and level (REQ-324).

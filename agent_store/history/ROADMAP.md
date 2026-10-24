# Open ADMS — Roadmap

> **The one page to see where the build is, start to finish.** It **summarises**; it decides
> nothing. Since 2026-10-22 the live task, what is settled and the defaults taken are
> `agent_store/BUILD.md`; the plan before it was `history/PLAN-TRACK1.md` (ADR-599, 600), and before
> that `NEXT.md` and `BACKLOG.md` by phase. If this page disagrees with `BUILD.md`, `BUILD.md` wins.
>
> **Last updated:** 2026-10-23: brought up to date with the code on `main` (8df35ab). Phase 3's
> browser build and all of Phase 4 are built; the golden mission runs through every screen to the
> approved numbers; the phones are paused; a firm installs on its own server with `./adms`. Where
> the build left this roadmap is §2a.

**Key:** ✅ done · 🟡 in part · ⏸ paused · ⬜ not started · ➡ replaced (see §2a)

---

## 1. Where we are

| | |
|---|---|
| **Start** | 2026-09-25: the rebuild decision (ADR-093). Security first, the plan is the core, TypeScript end to end with Prisma, the old `database/` code is history |
| **Now** | **The web platform is built and proven (2026-10-22), and installable (2026-10-23).** One command (`pnpm start`) brings up a fresh test installation: the stack, the API, the worker, the field app at `field.adms.localhost`, the back office at `office.adms.localhost` and the read-only viewer portal under `/viewer/…`, each over HTTPS. The golden mission is set up on the back office's screens, captured on the field app, reviewed, QC'd and locked on the back office, and the ledger reads **P1 $5,548.25 on 19 lines, P2 $324.00 on 2**; a viewer reads what the story `p1-viewed` says. A firm installs on its own Linux server with Docker alone (`./adms install`). The iPhone and Android builds are paused until there are devices to test on (ADR-600) |
| **Next** | Nothing is planned. `BUILD.md`'s task is done; what's left is listed under "Not in this build" there and in §4 here, and the user picks what opens next. The one open item from the build: `pnpm chain` was last recorded green at 2026-10-23 05:34 UTC, before the day's later commits (the sample's fixes, the test and production installs, the xlsx and PDF exports, the Windows 95 desktop); those were proven by their own targeted runs, and the whole chain should be run once on 8df35ab |
| **Finish line** | A firm installs Open ADMS, and its back office and its monitors run a real mission on it: every app built, tested and working |
| **How "done" is judged** | Not boxes ticked. A deliberately messy mission (the **golden mission**) comes out with the exact statuses, review queue and ledger the user signed off, at every layer: engine, then API, then the apps (`spec/VISION.md` §8). Met at every layer but the native phones |

---

## 2. The road, start to finish

| # | Stage | When it's done, you can… | Status |
|---|---|---|---|
| — | **Design** | Read the whole product on paper: the rules, the spec, the architecture, all approved | ✅ done 2026-09-29 (26 rounds of questions, ADR-001…279) |
| **0** | **Foundation** | Start the whole local stack with one command over HTTPS, the mileage and address servers included; watch the database itself refuse what the rules forbid; run a ticket's story from a terminal | ✅ done 2026-10-01: 17 of 17 requirements (§3c) |
| — | **The answer key** | Hold the golden mission's signed-off numbers and the acceptance scenarios every later phase must pass | ✅ the golden mission approved with its numbers (2026-10-01, ADR-297: P1 $5,548.25 on 19 lines, P2 $324.00); 11 scenario files (760 in files 01…09, the API's file 10, the phone's file 11), all approved (`BUILD.md` settled 9). **No back-office file 12:** the back office's browser tests are its proof (§2a) |
| **1** | **Data core and engine** | Run a whole messy mission from a terminal, no screens, and see the right statuses, flags, ledger and audit trail come out | ✅ exit met 2026-10-06 (ADR-371, 372): 49 of 49 tasks; 93 of 98 requirements, 5 moved to Phases 3 and 4 (§3b) |
| **2** | **API and sync** | Have phones and the back office talk to the server: sign-in, permissions, device enrolment, sync, background jobs, all hardened | ✅ exit met a third time 2026-10-17 (ADR-555): 44 of 44 tasks; 22 of 23 requirements, REQ-006 moved to Phase 3 and met there (§3a) |
| **3** | **Field app** | Hand a monitor a phone: enrol it, take the day's assignment, capture every kind of field event offline for days, scan, print, sync | 🟡 **the browser build is done** (2026-10-22): every capture, sync and turn-in, the time clock, photos, receipts as PDFs, scanning, the golden mission through its screens, the WCAG 2.2 AA review and the MASVS checklist. **The iPhone and Android builds are paused** (ADR-600; `BUILD.md` "Not in this build") (§3) |
| **4** | **Back office and read-only portal** | Set up a project, dispatch the day, review and correct, QC, lock as invoiced, export; clients, contractors and auditors see their own projects | ✅ **built 2026-10-22** as `BUILD.md`'s parts, never opened as a gated phase (§3, §2a) |
| **5a** | **Install and go-live checks** | Install it for a real firm, with the scenario suite passing, load tests and an outside security test done | 🟡 **re-scoped** (§2a): the Railway + Netlify demo deploy is replaced by a firm's own server (`./adms install`, built 2026-10-23) and a fresh test install (`pnpm start`); `SECURITY.md` written. Still open: monitoring and alerts, backups rehearsed, an outside penetration test before a first live mission, how upgrades reach an installation (Q-167), map data per region (Q-166) |
| 🏁 | **Finish line** | **A firm can install it and people use it on a real mission** | 🟡 installable and proven in the browser; the native phones and the go-live checks remain |
| **5b** | **Later features** | Add the candidate features a project may want (daily report set, parcels, live scales, the HHW trail…), each confirmed by the user first | ⬜ after the finish line; the daily report PDF and email summary arrived early with Phase 4 (§2a) |

**No dates.** Nothing in the plan sets one, and none is guessed here.

---

## 2a. Where the build left this roadmap

What happened that the roadmap above (as it stood 2026-10-20) didn't say, and how the plan was
changed to fit. Each is the user's word or a decision on record; none is undone here.

| # | Planned | What happened instead | Why, and on whose word | How the roadmap reads now |
|---|---|---|---|---|
| 1 | **Task by task**, an ADR for each, phases opened and closed at gates with exit criteria, REQs ticked one by one | **ADR-599 (2026-10-21)**: one plan by milestone (`PLAN-TRACK1.md`), ADRs only for real decisions. **2026-10-22** (`BUILD.md`): one final build task with a fixed list of parts, no gates, no ADRs or KDs; a decision is said in the code and the commit, one that touches money, evidence or what a monitor must do gets a line under "Defaults taken" | The user: "the tasks we have planned are starting to miss the mark … I want us to move faster" (ADR-599); "finish the web platform in one run" (2026-10-22) | The ADRs stop at 606. Phase 3's and 4's requirement counts were not kept after 2026-10-20 (Phase 3 stood at 20 of 33): the parts in `BUILD.md`, the browser tests and the golden mission are the proof instead |
| 2 | **Phase 3 in order:** the browser build, then the iPhone (3.8), then Android (3.9), then the phase's exit (3.10), before Phase 4 opens | The browser build finished (3.7 the time clock, ADR-598, 601; 3.10.1 the golden mission through the field app, ADR-603; 3.10.2 accessibility and MASVS, ADR-606; the two settled items, 2026-10-22). **The phones paused**; Phase 4 started without Phase 3's exit | The user, 2026-10-21: "I dont have an iphone or android we can test on just yet, so let's pause those 2 parts" (ADR-600) | Phase 3 is 🟡: browser ✅, phones ⏸. Its exit criterion 9 (on device) waits with the phones |
| 3 | **Phase 4 gated** behind Phase 3's exit, with its own plan, its acceptance file `12-back-office.md` for approval, and its REQs | All of Phase 4 built in one day (2026-10-22) as `BUILD.md`'s parts on the branch `phase4-back-office`, now on `main`. No file 12 was drafted | `BUILD.md` settled 9: "its browser tests are the proof" | Phase 4 is ✅, proven by the browser tests and the golden mission through every screen |
| 4 | **The portal** as its own app | The viewer portal lives inside the back office's app, under `/viewer/…`, on the same sign-in | Fewer apps to host and secure; one shared look (`packages/look`) | Phase 4 counts the portal as part of `apps/back-office` |
| 5 | **The back office's layout:** a sidebar closed by default, Tickets / Reports and Forms / Billings, one paged table | A **desktop**: a menu bar, folder icons per area, every screen in a window, a taskbar (2026-10-22); restyled as a classic **Windows 95** desktop with a Start menu, a clock and wallpapers (2026-10-23). The address stays the truth, so every deep link still works | The user asked for the back office to work like a classic desktop program | Phase 4's look is the desktop |
| 6 | **Phase 5a's demo deploy:** Railway (API, worker, Postgres, map servers) + Netlify (web apps), the firm hosting in its own cloud | Two shapes instead (`BUILD.md` settled 11): a **test install** (`pnpm start`: fresh every time, the sample loaded, every part checked; `pnpm start --keep`, `pnpm stop`, `pnpm logs`) and a **production install** on one Linux server with Docker Engine alone (`./adms install`, then `start`, `stop`, `status`, `logs`, `admin`, `root`, `licences`): images built on the server, the firm's answers asked once, Let's Encrypt where the internet reaches it | The user, 2026-10-23: "this replaces ARCHITECTURE §4's Railway + Netlify target" | 5a is 🟡: the install is built; REQ-517's cloud rows (Railway's `migrate deploy`, Netlify's same-origin proxy) no longer apply as written; the hardening, operations and go-live rows still do (§4) |
| 7 | **The licence:** AGPL-3.0 (ADR-171) | **Apache-2.0** with a NOTICE; `pnpm licences` now refuses GPL, LGPL and AGPL in what ships | The user, 2026-10-23, superseding ADR-171 | Every dependency is checked against Apache-2.0 |
| 8 | **Not on the roadmap** | Built alongside: the **sample projects** (`pnpm sample`: P1, P2 and a messy Wednesday, through the real paths); the **firm's brand** (what the firm calls its ADMS, "Built on Open ADMS"); a **documentation site** (`apps/docs`, Astro Starlight, 29 pages, Markdown twins and `llms.txt`); a **README** with a one-line install; the tests in a database of their own (`adms_test`) | To make the platform something a firm can install, try and read about | Listed with Phase 4 and 5a in §3 |
| 9 | **The daily QC and expenditure reports** in 5b (REQ-513) | A **daily report PDF** and an **email summary** arrived with Phase 4's reports, with debris totals and exports as CSV, Excel (.xlsx), JSON and PDF | `BUILD.md`'s "Reports and exports" part | REQ-513's fixed 0700 / 0900 schedule stays in 5b |
| 10 | **Waiting on the user** (§6 as it stood): photos required as a number, C185, KD-80, the HHW trail, `RULES.md` §7, the map region, approvals, a security policy file | Settled 2026-10-22 ("take your recommendation on every open question", `BUILD.md` settled 1…10); `SECURITY.md` written | The user | §6 holds only what is left |
| 11 | **Agents don't write to git**; the user commits each response | Agents commit their own work on a work branch, one branch per phase; the user merges | The user, 2026-10-22 (`CLAUDE.md` "Git") | §6's commit row is gone |

---

## 3. Phase 3, Field app, and Phase 4, Back office and portal

### Phase 3: the browser build done; the phones paused

Opened 2026-10-17 (ADR-557). The browser build came first and whole (ADR-558), on the API Phase 2
serves; its one server half was the time clock's records.

| Milestone | What it is | Status |
|---|---|---|
| 3.0 | Open the phase: the plan, the requirements moved, the phone's scenarios | ✅ 2026-10-17 (ADR-557…560) |
| 3.1 | The phone's security checklist; the field app's shell over HTTPS; every screen checked for accessibility on every run; the look, the components and the prototype | ✅ 2026-10-18 (ADR-562…569) |
| 3.2 | The phone's encrypted store, enrolment, signing in online and offline | ✅ 2026-10-18 (ADR-570, 572, 574, 575) |
| 3.3 | The master passcode on the phone: setup with no assignment, switching, moving, the ten-tries lock | ✅ (ADR-576, 577) |
| 3.4 | Sync from the phone, photographs a piece at a time, "Sync and turn in" | ✅ (ADR-578…580) |
| 3.5 | Capture: collections and splits, the tower and haul-outs, unit rate, forms, certifying | ✅ 2026-10-19 (ADR-581…585) |
| 3.6 | Photographs, receipts printed as PDFs in the browser, scanning by scanner and camera | ✅ 2026-10-20 (ADR-586, 590, 595, 596) |
| 3.7 | The time clock: its records on the server; clock in and out on the phone, the day's activity filled in from the field events | ✅ 2026-10-21 (ADR-598, 601) |
| — | The field app finished (`BUILD.md`'s first part): a stretch past midnight counts on the next day; the scanner-keys setting (WCAG 2.1.4); "Pick one to go on." (3.2.2) | ✅ 2026-10-22 |
| 3.8 | iPhone: the iOS build and its key in the phone's vault, the native camera and scanning, a Zebra ZQ printer, a day in airplane mode | ⏸ paused until the user has the hardware (ADR-600; `PLAN-TRACK1.md` §P) |
| 3.9 | Android: the same on a real Android phone | ⏸ paused, as 3.8 |
| 3.10 | Prove it: the golden mission through the phone's screens; the security checklist and the accessibility review | ✅ in the browser (ADR-603, 606; conformance note `spec/ACCESSIBILITY-FIELD.md`); the on-device runs wait with 3.8 and 3.9 |

### Phase 4: built 2026-10-22, as `BUILD.md`'s parts

Never opened as a gated phase (§2a, 1 and 3). Each part was committed as it landed, on
`phase4-back-office`, and is on `main`.

| Part | What you can do | Status |
|---|---|---|
| Back office foundation | The shared look as a workspace package (`packages/look`: tokens, components, the accessibility helpers, the translation layer) used by both apps; the back office at `office.adms.localhost` with its own page policy; sign-in, two-step, password change and reset, your own sessions, sign-out | ✅ 2026-10-22 |
| Setting up a project | Clients, declaration events, projects; contractors, primes, contracts; forms, debris types, the firm's lists; pay items with a rate per prime; the rule builder; sites and their quantity lookup; the project map; certification intake; ROEs from paper with their scope; the setup check | ✅ 2026-10-22 |
| People, phones, the board, the clock | People and permissions; the firm's settings; phones and the master passcode; the dispatch board; the time clock's approval, unlock and hours | ✅ 2026-10-22 |
| Review and correct | The review queue by workflow and cause; a ticket's page (field events side by side, photos, history); corrections, renumber, void, accept; quarantine; held records and jobs; records made in the back office | ✅ 2026-10-22 |
| Money, the lock, the close | The ledger; QC; invoice locks and batches; the audit trail; closing and reopening a project | ✅ 2026-10-22 |
| Reports and exports | Debris totals; the daily report PDF and the email summary; exports (CSV, Excel, JSON; the tickets list also as .xlsx and PDF, 2026-10-23); photo PDFs; the receipt batch | ✅ 2026-10-22 |
| The viewer portal | A viewer's projects, tickets and history, read-only, under `/viewer/…` | ✅ 2026-10-22 |
| Up and proven | `pnpm start`; the golden mission through every screen (`apps/field/playwright.mission.config.ts`: 7 tests); the chain green and recorded; `SECURITY.md`; the conformance notes (`spec/ACCESSIBILITY-FIELD.md`, `spec/ACCESSIBILITY-OFFICE.md`) | ✅ 2026-10-22 |
| The desktop | The back office and the portal as a desktop: a menu bar, folder icons, windows and a taskbar; then the Windows 95 look (§2a, 5) | ✅ 2026-10-22, restyled 2026-10-23 |
| Beyond the plan | The sample projects; the firm's brand; the documentation site; the README; test and production installs (§2a, 6 and 8) | ✅ 2026-10-22…23 |

**Test state** (`CHAIN.md`, recorded 2026-10-23 05:34 UTC, 10 of 10 steps green): 239 test files,
3,883 tests; 25 stories; 71 browser tests over 60 screens with 0 accessibility findings; 1,127
grant tests; 20 security checks; 470 licensed packages. The commits after that run are not in it
(§1, "Next").

---

## 3a. Phase 2, API and sync: exit met a third time 2026-10-17 (ADR-555)

Opened 2026-10-06 at your word (ADR-376). The plan is `BACKLOG.md`'s (ADR-377). It adds no rule to
what Phase 1 built: it puts the server in front of it. The first task writes the threat model and
the scenarios the API must pass, so the answer exists before the code.

| Milestone | What it is | When it's done, you can… | Tasks | Status |
|---|---|---|---|---|
| 2.0 | Open the phase: the plan | Read every Phase 2 task, with the requirements each one meets | 1 of 1 | ✅ 2026-10-06 |
| 2.1 | The answer and the foundation | Read who could attack what and what stops them; reach the API over HTTPS on your own machine, refusing anything malformed or from a site not on its list | 4 of 4 | ✅ 2026-10-07: 2.1.1 (ADR-379); 2.1.2 (ADR-380…385); 2.1.3 (ADR-387…392); 2.1.4 (ADR-394, 395) |
| 2.2 | Sign-in, sessions and permissions | Sign in to the server as an admin with an authenticator code; take a permission from someone and see their very next request refused | 6 of 6 | ✅ 2.2.1 (ADR-397…399), 2.2.2 (ADR-402…406), 2.2.3 (ADR-407…411), 2.2.4 (ADR-412), 2.2.5 (ADR-415), 2.2.6 (ADR-416) |
| 2.3 | Jobs and the worker's process | Change a ticket and watch the worker pick up just that ticket by itself, with nothing asked to wait | 3 of 3 | ✅ 2.3.1 the job queue (ADR-418); 2.3.2 the worker as a process (ADR-419); 2.3.3 what queues work (ADR-420) |
| 2.4 | The back office's endpoints | Do everything the back office does (setup, dispatch, corrections, void, QC, lock) by a request, each checked against the person's permissions; see a contractor's login read only its own tickets | 5 of 5 | ✅ 2.4.1 the services a story still did by hand (ADR-423); 2.4.2 setup's endpoints: ✅ part 1, the client, project, contractors, contracts and lists (ADR-424); ✅ part 2, forms, pay items, "Pays when" and rules (ADR-425); ✅ part 3, sites, the map, a contractor merge, the setup check (ADR-426); ✅ part 4, the firm's people (ADR-427). ✅ 2.4.3 dispatch and phones: part 1, phones and the master passcode (ADR-428); part 2, a day's assignments (ADR-429); ✅ 2.4.4 certifications and review, in four parts: ✅ part 1, void, unvoid, accept a flag, QC, invoice batches, lock and unlock (ADR-430); ✅ part 2, corrections to a ticket, and which field a refused request got wrong (ADR-431); ✅ part 3, ROEs, forms, quarantine and back-office records (ADR-432); ✅ part 4, a certification's measuring mistake, signatures on file and revocation (ADR-433); ✅ 2.4.5 the read-only viewer's path, in two parts: ✅ part 1, the one place that tells the database who is looking, and a viewer's own projects (ADR-434); ✅ part 2, their tickets, the money and an ROE's owner by each viewer's setting, proven as a client user, a prime's and a sub's contractor user, an auditor and nobody (ADR-435) |
| 2.5 | Phones: enrolment, sign-in, the lists | Enrol a phone with the master passcode, sign a monitor in on it and have it take the day's assignment and its lists, with never a rate among them | 4 of 4 ✅ | ✅ 2.5.1 (ADR-436, 437, 439, 440); ✅ 2.5.2 (ADR-441…444); ✅ 2.5.3, in five parts (ADR-449…451, 453…455); **2.5.4, what a phone reports besides field events, in five parts (ADR-462): part 1 ✅ (an unplanned assignment arrives, ADR-456, 457); part 2 ✅ (a site move and a monitor switch reported, ADR-458); part 3 ✅ (a session under the master passcode with a connection, ADR-462); part 4 ✅ (what setup under the passcode reads online, ADR-463); part 5 ✅ (every other use of the passcode a phone logged, ADR-464). ✅ 2.5.4** |
| 2.6 | Sync | Sync a phone's day: records first, photographs after, a retry answered "already saved", a duplicate held for a person, a lost phone's work received and flagged; turn a phone in | 4 of 5, 2.6.3 withdrawn ✅ | ✅ 2.6.1 the sync contract (ADR-466, 467, 469, 470); 2.6.2 the endpoint (ADR-471…473, 475); 2.6.3 withdrawn at your word (ADR-477); 2.6.4 photographs and the map's files (ADR-478…485); **2.6.5 a phone out of service and turn-in, in three parts (ADR-487…490): the turn-in at the API, held to the sync contract and in the stories, and a limit per phone** |
| 2.7 | Prove it | Run the golden mission through the real endpoints and get the numbers you approved; read the security checklist with a test beside each item | 4 of 4 (2.7.1, ADR-491…503; 2.7.2, ADR-504…507; 2.7.3, ADR-508…517; 2.7.4 the phase exit, ADR-518) | ✅ 2026-10-14 |
| 2.8 | What the full check found, closed | Sync a burst with every phone told to wait, never an error; resolve what a sync held for a person; change, archive and correct any setup record or captured field by a request; load a map from KML or an Esri layer link; have a lost phone's key revoked after the firm's time, a setting you change | 9 of 9 (2.8.1, the register swept, ADR-522; 2.8.2, told to wait, ADR-524; 2.8.3, the photo store's servers closed, ADR-525; 2.8.4, what a sync held resolved, ADR-526; 2.8.5, setup records changed, a map from KML or Esri, ADR-527; 2.8.6, a lost phone's key after the firm's time and the firm's settings, ADR-530; 2.8.7, every captured field correctable and records made in the back office, ADR-534; 2.8.8, the back office's reads and bulk acts and the viewers' reads, ADR-535; 2.8.9, the exit, with your answers and the view permissions, ADR-537…540) | ✅ 2026-10-17 |
| 2.9 | What the diagnostic found, closed | Certify a truck on a phone by picking from lists it was sent (truck types, features, crew types, primes and their subs, helpers, each site's place); be told in words, never a server error, when a ticket is locked mid-review | 3 of 3 (2.9.1, a phone's lists for certifying and disposal, ADR-553; 2.9.2, three faults, ADR-554; 2.9.3, the exit a third time, ADR-555) | ✅ 2026-10-17 |

**Phase 2's exit criteria** (`NEXT.md`; the agent's, yours to change): the golden mission through
the real endpoints and the job queue with the approved numbers; every scenario with a Phase 2 part
passing at the API; all 14 requirements ticked from real runs; the security checklist answered
item by item; every new table guarded; the whole check chain green over HTTPS; every rule and every
payload shape in one shared place.

**Scenarios with a Phase 2 part:** 48 rows in the nine approved files name Phase 2 (37 as "API
(Phase 2)"); the tenth file, `spec/acceptance/10-api-and-sync.md` (ADR-379), adds 56 for what the
architecture decides about the API itself and lists the 48 beside their tasks: 104 in all.
**At the phase exit (ADR-518): 119 of 119 proven at the API**: the tenth file's 70 (14 were added
by the security checklist's tasks) and the Phase 2 part of the 49 earlier ones; 21 of those 49 have
a part that is the field app's or the back office's (`spec/acceptance/README.md`). **At the third exit (ADR-555): 184 of 184**, recounted whole: the tenth file's 122, the 49, and 13 Phase 2's tasks wrote into files 02, 03 and 08.

**The requirements at the phase exit (ADR-518): 13 of 14 ticked, REQ-006 moved** to Phase 3 (every
service over HTTPS: the web apps aren't built yet). ~~Phase 2's exit criteria, all seven met.~~ **Reopened (ADR-519): REQ-210…217 new, 22 in all; three exit criteria added (no "no task yet" left, the agent defaults put to you, three clean full runs of the stories).** **REQ-218 new (ADR-552), 23 in all. At the third exit (ADR-555): 22 ticked, REQ-006 moved, all ten criteria met.**

**Test state, seen 2026-10-17 at the third exit:** see `CHAIN.md` (the one place the counts live).

---

## 3b. Phase 1, Data core and engine: exit met 2026-10-06

Opened 2026-10-01 at your word (ADR-299). The plan is `BACKLOG.md`'s (ADR-300). Each milestone
starts by writing its part's acceptance scenarios, so the answer exists before the code.

| Milestone | What it is | When it's done, you can… | Tasks | Status |
|---|---|---|---|---|
| 1.0 | Open the phase: the plan | Read every Phase 1 task, with the requirements each one meets | 1 of 1 | ✅ 2026-10-01 |
| 1.1 | Setup records | See a whole project's setup in the database: client, declaration event, project, contractors and contracts, forms and debris types, pay items with a rate per prime, sites, the map, rules | 11 of 11 | ✅ 2026-10-03: every setup record is built (ADR-302…315) and the whole setup of P1 and P2 runs as a story through the API's setup services (ADR-316). Setup scenarios: 64 of 82 passing; people and devices: 35 of 74. The rest wait for the tasks that build their parts (numbering, the setup check, flags) |
| 1.2 | Certifications and capacity | Give it a container's measured boxes and get the paper form's capacity, to the cubic yard | 3 of 3 | ✅ 2026-10-03: the scenarios (ADR-317), the capacity math (ADR-320) and the certification's records with the service that certifies (ADR-321). Certification scenarios: 36 of 60 passing; the rest wait for numbering, photographs, the flags and QC |
| 1.3 | Tickets and numbers | Record every kind of field event, with numbers no two phones can share | 7 of 7 | ✅ done 2026-10-04 (ADR-332): the phones' day as a story; its scenarios are written (ADR-322); numbering is built (ADR-323); what every field event records (ADR-324), what each kind records (ADR-325), scale receipts and photographs (ADR-326) and ROEs and forms (ADR-327) are built |
| 1.4 | Sync intake with quarantine | Send a day's field events in any order; a duplicate is held in full for a person, never lost | 2 of 2 | ✅ done 2026-10-04: the 56 scenarios (1.4.1, ADR-333) and intake (1.4.2, ADR-338); 43 of the 56 pass at the engine, two in part, the rest wait for the worker and Phases 2–4 |
| 1.5 | Reconciliation | Watch tickets pair up on their number and come out pending, completed or flagged for review, each flag in the catalogue's own words | 10 of 10 | ✅ done 2026-10-05: the worker's run is built and P1's two field days reconcile as a story, unpriced (1.5.9, ADR-352); mileage is built (1.5.8, 2026-10-05, ADR-349, 350), and the example world is on the test map (1.5.8a, ADR-351); its 162 scenarios are written (1.5.1, 2026-10-05, ADR-339); the worker's records are built (1.5.2, 2026-10-05, ADR-340); grouping and status are built (1.5.3, 2026-10-05, ADR-341); the quantities are built (1.5.4, 2026-10-05, ADR-343); the flag catalogue and the checks between field events, on the certification and on times are built (1.5.5, 2026-10-05, ADR-344); nine more flags at your word (ADR-345): the checks on place are built (1.5.6, 2026-10-05, ADR-346): the checks on quantity, the pay item's settings, unit rate work and forms are built (1.5.7, 2026-10-05, ADR-347): two more flags at your word (ADR-348): 116 of 165 scenarios pass and 15 more in part; next mileage (1.5.8) |
| 1.6 | The rule engine | Have the firm's rules pick the pay items, the same way every time; see the setup check list the gaps | 4 of 4 | ✅ done 2026-10-05: its scenarios (1.6.1, ADR-353), the criteria (1.6.2, ADR-354), the passing rules turned into priced lines and flags (1.6.3, ADR-355: 83 of 114 scenarios pass, at the rules; the ledger itself is Milestone 1.7), and the setup check with what each site's phones ask for (1.6.4, ADR-357) |
| 1.7 | The ledger and audit | See every billed line, regenerated when a ticket changes, the old one kept in the audit log | 3 of 3 | ✅ done 2026-10-06: the line as a record (1.7.1, 2026-10-06, ADR-358); the engine prices every ticket and keeps the ledger current, each removed line kept in the audit log (1.7.2, 2026-10-06, ADR-359: 108 of 114 pricing scenarios pass; P1's Monday and Tuesday to the cent); what a contractor's login sees of its own tickets, and no money for a sub at your word (1.7.3, 2026-10-06, ADR-361) |
| 1.8 | Review, QC, the invoice lock and batches | Correct, renumber, void, accept a flag, QC and lock, each audited, each reprocessing the ticket | 5 of 5 | ✅ done 2026-10-06: QC, the lock as invoiced, the named batch and the unlock work end to end (1.8.5, ADR-367: 75 of the 98 review and invoicing scenarios pass; the rest are the golden mission's and the later phases'); before it: void, unvoid and accept work end to end (1.8.4, 2026-10-06, ADR-365, 366: 58 of the 98 review and invoicing scenarios pass now); before it: its acceptance scenarios are written (1.8.1, 2026-10-06, ADR-362: 65 for review, 31 for invoicing and closeout), the records a reviewer's actions are kept in are built (1.8.2, 2026-10-06, ADR-363) and corrections and renumbering work end to end (1.8.3, 2026-10-06, ADR-364: 38 of those scenarios passed then); next 1.8.5, QC, the lock and batches |
| 1.9 | The golden mission | Run the mission you approved from a terminal and get its numbers: P1 $5,548.25 on 19 lines, P2 $324.00 | 3 of 3 | ✅ done 2026-10-06 (ADR-372: the security check passes). The phase exit (1.9.3, 2026-10-06, ADR-371): every requirement ticked or moved, the old code's lessons closed, 693 scenarios proven whole; it waits only for the security fix due from 7 October. Before it: the mission runs as a story and gets those numbers (1.9.1, 2026-10-06, ADR-368); the cases it leaves out run too, and 691 of 760 scenarios are proven whole (1.9.2, 2026-10-06, ADR-369); next the phase exit (1.9.3) |

**The requirements at the phase exit (ADR-371): 93 of 98 ticked, 5 moved** to the phase that
finishes them: REQ-112b, 124c, 124f and 125c to Phase 3, REQ-124b to Phase 4 (`REQUIREMENTS.md` says
what Phase 1 built for each).

**Phase 1's exit criteria** (`NEXT.md`), all seven met: the golden mission as a story; every Phase 1 scenario
passing; all 98 requirements ticked from real runs; the old code's lessons closed; every new table
guarded and tested; the whole check chain green; every rule in one shared place.

**Scenarios** (the measure of done, `spec/VISION.md` §8; `spec/acceptance/README.md` has the table):
760 written in nine files, all approved by you (ADR-335, 374). 693 are proven whole at the engine,
15 in part (the rest of each is a later phase's), 52 belong to Phases 2–4 only.

**Test state, seen 2026-10-06:** 80 test files, 1,753 tests passing; fifteen stories pass, the golden
mission among them (27 checks); `pnpm security` 7 passed, 0 failed; 358 licences allowed.

---

## 3c. Phase 0, Foundation: done 2026-10-01

| Milestone | What it is | Tasks | Status |
|---|---|---|---|
| 0.1 | Approve the architecture, section by section; the agents' guard hook for the new layout | 6 of 6 | ✅ 2026-10-01 |
| 0.2 | Scaffold: the monorepo, the test runner, the local HTTPS stack, the installer | 4 of 4 | ✅ 2026-09-29 |
| 0.2b | Spec pages before the schema: naming, `DATA-MODEL.md`, `FLAGS.md` | 3 of 3 | ✅ 2026-10-01: all three approved (ADR-289, 290); the data model changed at your word (ADR-292…295); its thirteen points are all settled |
| 0.2c | Rewrite every skill in today's rules | all | ✅ 2026-09-29 |
| 0.3 | The database enforces the rules: roles, grants, no deletes, audit by trigger, row-level security | 4 of 4 | ✅ 2026-09-30 |
| 0.4 | Prove it end to end: scenario harness, security checks, the device and assignment models | 3 of 3 | ✅ 2026-10-01 |
| — | Closing out (ADR-282…287): the mileage and address servers in the local stack; an assignment's pay items; the requirement list | all | ✅ 2026-10-01 |

**Phase 0's exit criteria** (`NEXT.md`): all seven are met (2026-10-01, ADR-281). You opened Phase 1 the same day (ADR-299).

**Recorded test state** (2026-10-01, ADR-287, run that day): 26 test files, 317 tests passing; two
stories pass (`ticket-101001` 15 checks, `dispatch-monday` 13 checks); `pnpm security` 7 checks
passed, 0 failed (run again 2026-10-01, after you retired the old root `docker-compose.yml`, ADR-291).

**Phase 0's requirements, after the close-out (ADR-287):**

| | REQs | Where they stand |
|---|---|---|
| Ticked | 001, 002, 005, 007…014, 018…023 (17) | Met and proven by tests or by the approvals on record; 002 by your first commits, the lockfile among them (ADR-288) |
| Moved to Phase 1 | 003, 015, 017 | The shared rules package fills up as rules are built; reconciliation; the golden mission as the harness's story |
| Moved to Phase 2 | 004, 006, 016 | A schema for every API payload; every service (the API and apps too) over HTTPS; the sync's "already saved" ledger |

The moves are a default you may overturn: each of the six can only be finished by that phase's own
work, and what Phase 0 delivered for each is listed in `REQUIREMENTS.md`.

---

## 4. What is left, by stage

| Stage | The pieces | Status |
|---|---|---|
| **3. The phones** (`PLAN-TRACK1.md` §P) | The iOS build, its store and its key; the native camera and scanning; printing to a Zebra ZQ; on a real iPhone; the Android build; on a real Android phone; the field app's conformance report for the native builds | ⏸ until the user has the devices; ADR-600 expects it to be taken as one piece of work |
| **5a. Install and go-live checks** (`PLAN-TRACK1.md`, "The demo deploy", read against §2a, 6) | Done: the production install on a firm's server (`./adms`), Let's Encrypt or the installation's own root, lean logs, licence notices shipped; `SECURITY.md`. Left: monitoring and alerts (`/readiness`, a job set aside, a backup failing, storage filling); availability, restarts and backups rehearsed; the hardening rows of the API's checklist for a server on the internet; an outside penetration test before a firm's first live mission; how upgrades reach an installation (Q-167); map data per region (Q-166); load tests over a real network | 🟡 |
| **5b. Later features** (each confirmed by the user first) | "USACE approved" flag on the load call · hazard tree workflow · Esri feature service · parcel lifecycle · live scale-house link · volume-reduction tracking · the daily QC and expenditure reports on their schedule · voided tickets in live exports · the HHW trail (not in this build, `BUILD.md` settled 5) | ⬜ |
| **Ideas, nothing decided** (`PLAN-TRACK1.md`, "Tracks 2…4", 2026-10-21) | A light installation (one small server a firm can stop between missions); a setup agent drafting a project from the firm's contracts, a person approving; a view per audience (mission center, contractor, client, a public map) | ⬜ the user's to open |

---

## 5. The six layers of testing

"Tested and working" means all six, each run from a terminal (`spec/ARCHITECTURE.md` §15).

| Layer | What it proves | Arrives in | Today |
|---|---|---|---|
| Unit | The shared rules: capacity math, volume, split shares, checks, pricing, time, number blocks | Phase 1 | ✅ (counts: `CHAIN.md`) |
| Database | Every grant and every refusal; audit can't be forged or edited | Phase 0 | ✅ 1,127 grant tests, growing with each table |
| Scenario harness | Whole missions told as stories; exact statuses, queue and ledger | Phases 0–1 | ✅ 25 stories, every phone through the real endpoints, the sample projects among them |
| API | Sign-in, permissions, CORS, rate limits, the sync contract | Phase 2 | ✅ every endpoint asked as nine kinds of caller (ADR-539) |
| Browser end-to-end | The field app's browser build, the back office and the portal | Phases 3–4 | ✅ 71 browser tests over 60 screens, each with the WCAG 2.2 AA check; the golden mission through every screen (7 tests, its own config) |
| On device | iPhone, then Android: airplane mode, printing, scanning, camera, encryption, turn in | Phase 3 | ⏸ with the phones |

---

## 6. What waits on the user

Nothing blocks what is built. A row goes when it is done.

| What | Why it's yours | Matters by |
|---|---|---|
| **The hardware for the phones** | A real iPhone and a real Android phone, a Zebra ZQ printer, a Bluetooth scanner if the firm's monitors use one, Xcode and an Apple developer account (ADR-600) | Before the phones open |
| **What opens next** | `BUILD.md`'s task is done; the phones, the go-live checks, 5b's features and the ideas in §4 are each the user's to open | Any time |
| **The defaults taken** | One list to overturn: `BUILD.md` "Defaults taken", then `SUMMARY.md` §4 and `history/DECISIONS-599-606.md` | Any time; nothing waits on it |
| **An outside penetration test** | A test by someone else, before a firm's first live mission (C40 (b)) | Before a real mission |
| **Merging work branches** | Agents commit on a work branch and never merge or push (`CLAUDE.md` "Git") | After each piece of work |
| **Spotlight and `.cache/`** | Excluding the repository's `.cache/` from Spotlight on the user's Mac (seen 2026-10-21: it slowed the browser runs) | When runs feel slow |

---

## 7. Keeping this page true

This page is history now: the live record is `BUILD.md` and the git log. When a new piece of work
opens (the phones, the go-live checks, a 5b feature), change its row in §2 and §4, add a line to
§2a where it leaves the plan, and change the "Last updated" line. Never add a date estimate the
user didn't give.

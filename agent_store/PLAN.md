# Open ADMS — Plan

> **The one plan (ADR-599, 600).** Milestones of checklist items, in order. **The next item is the
> first `- [ ]` below** (the session hook prints it with its milestone). The user says **"work on
> it"** and the `adms-work` skill runs the items, milestone by milestone, to each gate.
>
> - **Ticking.** An item becomes `- [x]` only from a run that was seen, with one line under it:
>   `✅ <date> (ADR-…, if any): what now exists, in plain words.` No file lists, test lists or counts.
> - **What an item leaves** becomes a `- [ ]` line under the milestone that takes it, in the same
>   work, never "no task yet". Nothing is struck through. When a milestone's gate passes, its words
>   move to `agent_store/history/PLAN-DONE.md` and its section here shrinks to one line under **Done**.
> - **Carried words.** Lines marked *carried* are word for word from the files in
>   `agent_store/history/` (`BACKLOG.md`'s register, `REQUIREMENTS.md`, `REQUIREMENTS-LATER.md`);
>   their C- and REQ-numbers are kept so the history can be grepped for their past. A carried line
>   is done when the item that takes it is ticked, and the tick names its number.
> - **Where the rest lives.** Rules: the skills and the approved spec. Decisions: `DECISIONS.md`
>   (ADR-599 on), then `SUMMARY.md` (frozen at ADR-598, read by topic). How code is built here:
>   `adms-build`. How it is proven: `adms-verify`. Counts: `CHAIN.md`.
> - Keep this page under 80 KB (the session hook warns); read only the milestone you are in.

## Where we are (2026-10-21)

| | |
|---|---|
| **Done** | Phase 0, the foundation (2026-10-01) · Phase 1, the data core and engine (2026-10-06) · Phase 2, the API and sync (2026-10-17) · the field app's browser build through task 3.7.1 (Milestones 3.0…3.6, 3.7.1) |
| **Now** | **Track 1, the web apps (ADR-600).** W0 finishes the field app in the browser; W1…W7 build the back office and the read-only portal on the API that exists; W8 brings the whole system up with one command and runs the golden mission through every screen |
| **Paused** | **P, the phones** (iPhone and Android as one milestone), until the user has the devices (ADR-600) |
| **Track 1's finish line** | The whole system up locally with one command, every web app working, and the golden mission (P1 $5,548.25 on 19 lines; P2 $324.00) set up, captured, reviewed and locked through the screens, coming out with the numbers the user approved |

## Every item, in every milestone

This carries the Phase 3 brief (ADR-558) to every app. `adms-build` holds the recipes.

- **Read first:** the item's acceptance rows (`spec/acceptance/`: each row's layer column names
  the app that proves it), the owning skill, ARCHITECTURE's sections for the layer, `adms-build`'s
  recipe for what you touch, the carried lines under the milestone, and the actual files.
- **No rule in a screen.** A rule lives once in `packages/domain`, a payload once in
  `packages/contracts`, and an app reaches the server only through the API, over HTTPS. A call a
  screen needs that the API doesn't serve is built in the same item by the endpoint recipe
  (`adms-build`), never worked around (ADR-519: a milestone's own server work never moves on).
- **Every screen:** its words through the translation layer (ADR-172); US units; a browser
  end-to-end test named by its scenario IDs against the local stack over HTTPS; the WCAG 2.2 AA
  automated check with no violation, in the light theme and the dark, at 320 CSS px and at 200%
  text (ADR-559); built from the shared components and tokens.
- **Done right, not convenient (ADR-599 (5)).** Shared code is shared properly: a workspace
  package with its own tests and one direction of dependency, never copied between apps and never
  imported from inside another app. No shortcut that bends the design to save work. Class-style
  code where it reads better (ARCHITECTURE §3). A reader of the code should see it was done right.
- **Every dependency gets an ADR first** (exact version, at least seven days old, licence
  compatible with AGPL-3.0, maintained); `pnpm licences` and `pnpm security` after.
- **A secret never appears** in a log, a test's output, a page's storage or this conversation.
- **The back office never blocks field work** (ADR-052). Corrections, voids, renumbering, QC, locks
  and money follow `adms-exceptions`, `adms-validation` and `adms-ledger-audit` exactly; monitors
  never see a rate or a code.

---

## Track 1 — the web apps

### W0 — The field app's browser build, finished

**Goal:** every web screen of the phone done, and the golden mission's field events captured
through them. It carries Phase 3's exit criteria (ADR-557) for the browser build; criterion 9 (on
device) is P's.

- [x] **3.7.2 The phone's clock** ✅ 2026-10-21 (ADR-601): Time in the menu where the project has the time clock on, clock-in, breaks and clock-out by hand offering only what comes next, both nudges never stopping work, and the day pre-filled a line an hour from the field events, lines added from the firm's list, approved at clock-out (AC-02-50…52, `e2e/clock.e2e.ts`); C177 finished; REQ-310's phone half done (the approval and export: W3).
- [x] **C175, read again** ✅ 2026-10-21 (ADR-602): Playwright 1.64.1 taken (it fixes a Chromium cross-origin preflight regression the browser tests are near); React stays on 19.3.0 (19.3.1 fixes only Server Components, which no app uses).
- [x] **3.10.1 The golden mission through the field app** ✅ 2026-10-21 (ADR-603, 604): every field event of the mission's eight phones, its ROEs, surveys, incident and drop-off log captured on the field app's screens in a world of the mission's own (`MissionWorld`), synced each evening through the real endpoints, reviewed by Luis at the endpoints: statuses, review queue and ledger as approved (P1 $5,548.25 on 19 lines; P2 $324.00 on 2), the outcomes in one home (`stories/golden-outcomes.ts`) shared with the story; its own Playwright run, second in `pnpm e2e` (both always run). Found and fixed on the way: the lock after inactivity counted no button press; a run overtaken by a handover or sign-out said "Your sign-in has ended" (`SignedInRuns`); the barcode camera stand-in starving the page. Phase 3's exit criterion 1, but for the audit rows (below).
- [x] **A stump with no root ball asks no exposure question** ✅ 2026-10-22 (ADR-605): the phone asks "half or more exposed?" only of a measured root ball, the rule the domain's (`PhoneUnitRate.asksExposure`); 301005 captured straight in the mission; pricing unchanged (AC-11-92).
- [x] **The golden mission's audit rows** ✅ 2026-10-22: 101003's, 101006's, 301003's and 301005's histories read through `readTicketHistory` at Luis's browser, against one home (`goldenOutcomes.reviewed.p1.audit`) shared by the story and the browser test: each field event by its phone, the typed number and its reason, the renumber, the acceptances and voids with their reasons, 301003's removed line copied whole (AC-07-111, AC-08-65). Phase 3's exit criterion 1 finished.
- [x] **The browser runs steady for the gate's three in a row** ✅ 2026-10-22: the API's close ends a connection the proxy pooled unused (`ConnectionsAtClose`, the real API's shutdown too); the photo files test awaits its cut instead of polling; `pnpm e2e` three times in a row green (60 + 5 each).
- [x] **3.10.2, the browser's part: the checklist and accessibility** ✅ 2026-10-22 (ADR-606): MASVS answered for the browser build by named tests, every native control P's, the threat model's phone rows read again; all 60 screens reviewed against WCAG 2.2 AA and recorded (`spec/ACCESSIBILITY-FIELD.md`, **an agent's review** driving the browser build: 41 supported, 2 partly, 12 n/a); four failures fixed (titles take the focus, busy buttons keep it, held actions give way at large text, a focused control never hidden) and the keyboard's walk added to every check (AC-11-55, 60, 93 whole; 57, 58, 59 in part).
- [ ] **A stretch still open past midnight on the phone** (AC-02-55's phone part; from 3.7.2): a clock-out goes on the assignment it was clocked in on and the hours count only what fell inside that day (ADR-598 (6)); whether Time also says "your day ended at midnight". **Asked at the gate with C185** (it changes the hours a client is billed: REQ-310 says later work goes on the next day, and today the hours count only what fell inside the day, so time after midnight is counted nowhere). *Recommended:* the hours read counts a stretch past midnight on the next day, its record unchanged.
- [ ] **C185, asked at the gate** (carried below): whether the user wants an ROE's scope picked on
  the phone; built in W0 if so.
- [x] **REQ-309** ✅ 2026-10-22 (every capture picks from its lists, 3.5.1…3.5.5; the clock's added lines from the firm's list, 3.7.2): Values are **picked from lists, never typed**, anywhere a list exists (debris types, payable types, field tags, reasons…). *(invariant 6)* *(revised 2026-09-29, ADR-247)* *Task 3.5.1 (ADR-581): the collection's debris type, field tag, reason for a typed number and ROE picked from the lists (an ROE also typed off its paper); the other captures 3.5.2…3.5.5.* *Task 3.5.2 (ADR-582): the tower's and the haul-out's debris types and field tags, a typed number's reason and a tandem's receipt picked from lists.* *Task 3.5.4 (ADR-584): a survey's work type, an incident's type, sub-type and contractor, an ROE on a survey, and the firm's own yes-or-no and pick fields picked from lists (an ROE number, a cert number and a survey number also typed off their paper).*
- [x] **REQ-310, 323, 324: the field app's browser halves** ✅ 2026-10-22: done (3.7.2, 3.10.2); REQ-310's back-office half moved to W3, REQ-323's and 324's native halves to P.
- [ ] **W0's gate**: the whole chain green, its counts recorded (`pnpm chain record`); three full
  runs in a row of `pnpm e2e` and `pnpm scenarios`; every scenario of
  `spec/acceptance/11-field-app.md` with a browser part counted N of M; each REQ above ticked, or
  its native half named under P; no rule in `apps/field`, no payload shape outside
  `packages/contracts`.

*Carried:*
- **C41. Accessibility** (ADR-279). *The standard, the user's (ADR-559):* **WCAG 2.2 AA** on every screen, the field app's and later the back office's and the portal's; **a conformance report (VPAT format) for each app at its phase's end**. *Have:* every screen translatable (ADR-172); the automated check beside the browser end-to-end tests (3.1.3, ADR-566); the review of every screen against WCAG 2.2 AA (3.10.2, ADR-606: `spec/ACCESSIBILITY-FIELD.md`, an agent's, driving the browser build) and the keyboard's walk in every browser check. *Left:* the field app's conformance report, written from that review and the native screens' (P); whether a person reviews too before it, the user's call; 2.1.4 and 3.2.2, partly met, the user's (P's lines); the web apps' checks and their report: W1…W7.
- **C175.** *(Done, ADR-602.)* React 19.3.1 (published 2026-10-14 on every React line at once) and Playwright 1.64.1 (2026-10-14) are read again once seven days old, from 2026-10-21: an advisory against 19.3.0 or 1.64.0 published by then, or what 19.3.1 fixes, decides whether to take them (ADR-563, 564). Whichever task runs then (3.1.3's checker ADR is a good moment).
- **C177.** *(Done, 3.7.2, ADR-601.)* *(The user's answers to Q-215…Q-218 recorded, ADR-573, AC-11-79…82; the collection's, the tower's and the haul-out's and unit rate's parts done, tasks 3.5.1…3.5.3, ADR-581…583; the bottom menu's Sync, 3.4.1; **the prototype gone** with the last screens it showed, its checks on every screen a test reaches, ADR-583.)* Left: the bottom menu's Time, where the project has the time clock on (3.7.2; the phone is told by its lists' `timeClock`, ADR-598).
- **C185.** *(Agent default, ADR-584 (6): an ROE made on a phone carries no scope; the back office enters it from the paper, `correctRoeScope`.)* Should the user want the scope picked on the phone (ADR-293), it is Phase 3's own work, never moved on (ADR-519): the sync's ROE takes its scope picks (a debris type of the load form or a payable type, each with an optional count), intake writes `RoeScopeItem`, and the lists carry the project's payable types to a phone that makes ROEs. Asked with the phase exit's defaults (3.10.3); built in Phase 3 if it is wanted.

### W1 — The back office's foundation

**Goal:** the back office as an app of its own, at its own HTTPS name, signed into, laid out,
translatable and accessible, on a look it shares properly with the field app; its scenarios
written before its screens.

- [ ] **W1.1 The back office's scenarios, first** (as task 3.0.1 wrote file 11, ADR-560):
  `spec/acceptance/12-back-office.md`, a draft for the user's approval: every scenario of files
  01…10 whose layer is the back office or the portal, listed by the item that proves it; the
  screens' own (sign-in pages, the layout, the page's policy and headers, accessibility, what each
  viewer sees), each naming its source. Beside it, the web apps' items of `spec/CHECKLIST-API.md`
  (3.2.x, 3.4.3, 3.4.5, 3.4.6, 3.5.4, 3.5.5, 3.7.x, 6.2.6, 6.2.7, 7.4.4, 7.5.2, 14.3.3) and
  `spec/THREAT-MODEL.md` §6's rows, each mapped to the item that answers it.
- [ ] **W1.2 The shared look, as a package** (ADR first; a note in ARCHITECTURE §18): the tokens
  and the React Aria components both apps use move from `apps/field/src/look/` into a workspace
  package of their own, with their own tests; the field app imports it and its tests stay green
  unchanged. The browser tests' accessibility helpers (`apps/field/e2e/accessible.ts`, `wcag.ts`)
  and the translation layer are shared the same way where both apps use them. What only one app
  needs stays in that app.
- [ ] **W1.3 The app and its door** (REQ-006 for it): `apps/back-office`, React + Vite at the
  versions the field app's ADRs pin; served by Caddy at a name of its own; its page's policy and
  headers said once, as `apps/field/page.ts` says the field app's, held by its browser tests; its
  own Playwright tests in the chain's `e2e` step.
- [ ] **W1.4 Signing in** (carried "Sign-in pages"): sign-in, the two-step code and setting up an
  authenticator, the password change and reset, a person's own sessions listed and ended, sign-out
  on every page; the session's answer telling the page what the person may do.
- [ ] **W1.5 The layout** (REQ-416; `spec/FROM-BUILD-1.md` §8–§13): the sidebar closed by default
  with a header toggle; Tickets, Reports and Forms, Billings; the project picker; one paged table
  every list uses (`GET /people`'s paging), inside the viewport; stacking cleanly on a phone.
- [ ] **REQ-416** **Layout**: sidebar closed by default with a header toggle; tables stay inside the viewport; dashboards stack cleanly on mobile; no explanatory banners; dashboard period options fit the project's length. Billable tickets under **Tickets**, incidents/surveys/ROEs under **Reports and Forms**, money under **Billings**. *(Q-100, Q-103)*
- [ ] **W1's gate**: the chain green and recorded; every screen so far passing its tests and the
  accessibility check; the field app's tests unchanged and green on the shared package.

*Carried:*
- **Accessibility** (C41; ADR-559): every web app screen meets WCAG 2.2 AA, checked automatically beside its browser end-to-end tests as the field app's are (3.1.3's checker), reviewed by hand; the back office's and the portal's conformance reports (VPAT format) at Phase 4's end.
- **The back office's own name and origin** (C86's rest; ADR-565): the back office served through Caddy at a hostname of its own, its origin joining `ADMS_CORS_ORIGINS` only where it isn't served same-origin, and its page's policy and headers said once as the field app's are (`apps/field/page.ts`), held by its browser tests; REQ-006 re-checked for it and the portal.
- **Sign-in pages** (C86, C89…C91, C93): the CSRF value kept in page memory and sent as `x-adms-csrf`; calls with credentials; one lock across tabs before a refresh; one message for every failed sign-in and where to reset; "try again in N minutes" from `retryAfterSeconds`; the code asked on `TWO_STEP_CODE_NEEDED`; the setup page shows the QR from `uri` and the secret once; the change-your-password page (`passwordChangeRequired`); the reset page (a link rather than a code, ADR-404 (7)); `PasswordProblem.message`; the password field's paste, show and manager behaviour (ASVS 6.2.6, 6.2.7); a person's own sessions listed and ended (ASVS 7.5.2); sign-out on every page; a person removes their own authenticator with a code; recovery codes if the user wants them. *A later candidate, not planned:* a passkey or hardware key beside the code (ASVS Level 3), raised with the user first (ADR-414 (4)).

### W2 — Setting up a project

**Goal:** a firm sets a whole project up through the screens, in the real order, with the setup
check: the golden mission's projects included.

- [ ] **W2.1 Clients, declaration events and projects** (REQ-401's start): the onboarding order;
  a project's program type, settings, active window, time zone, ticket-number source, number
  series and control ranges, field tags.
- [ ] **W2.2 Contractors, primes and contracts** (REQ-402).
- [ ] **W2.3 Forms, debris types, payable types and the firm's lists** (`spec/LISTS.md`): values
  added, archived and restored, never typed where a list exists; a form's definitions.
- [ ] **W2.4 Pay items** (REQ-404's pay item half): a rate per prime, shown only from a read taking
  Setup; "Pays when" writing its own rules; crew-day steps; each save beside its preview.
- [ ] **W2.5 The rule builder** (REQ-404; `spec/RULES.md`): criteria and operators, the three
  actions, Active, *Show matches*, "what it would change", a duplicate refused naming the rule it
  copies; reprocess.
- [ ] **W2.6 Sites**: facts, labels, shapes, tipping fees, the quantity lookup on the site's page.
- [ ] **W2.7 The project map** (REQ-124b's screen, REQ-411): the base map served by the
  installation (a regional extract; the map library and the extract each by ADR), map versions from
  a file or an Esri layer with a preview before a load, zones named from the file's fields, a
  drawn shape as GeoJSON, sites on the map.
- [ ] **W2.8 Certification intake** (REQ-403): the sheet's entry screen, boxes measured with
  capacity as the server answers it, crews, the five views, QC, revoke and its undoing. No placard
  or badge printing.
- [ ] **W2.9 ROEs** from paper, with their scope.
- [ ] **W2.10 The setup check's page** (REQ-125c's last part), a setup version's page, and the firm
  library with copy from a past project (REQ-401's end; its server half by the endpoint recipe if
  the API doesn't serve it).
- [ ] **W2.11 The golden mission's projects set up through the screens** by a browser test, the
  setup compared with the seed's, field for field.
- [ ] **REQ-125c** What a phone may make comes from its **assignment**; work outside it is never refused, and the setup check lists gaps before the field day. *(ADR-052, 229, 240)* *In part (ADR-357): the setup check is built at the domain, AC-01-69…73; the assignment's half is Phases 2 and 3.* — *what Phase 1 delivered (ADR-371): work outside an assignment is never refused at intake or by the worker; the setup check lists gaps at the domain, AC-01-69…73. Left: the phone's menu from its assignment (REQ-308b) and the check as a service and a screen (Phases 2 and 4).* — *Phase 2 built the check as a service and its endpoint (REQ-207, ADR-423, 426) and the assignment a phone takes at sign-in (ADR-444). Left: the phone's menu (REQ-308b), the check's screen (Phase 4).* — *Phase 3 (task 3.2.3, ADR-574): the phone's menu from its assignment (REQ-308b, ticked). Left: the check's screen (Phase 4).*
- [ ] **REQ-124b** *(part proven 2026-10-05, ADR-346: the boundary flag, the zone and map version attached, in no zone flagged, AC-06-42…45 at the domain; the worker writes them, 1.5.9; a new version reprocessing, and the imports, are still to come)* Project map (boundary + zones): a collection's end GPS, or a unit rate event's GPS, outside the boundary is flagged; the worker attaches the zone it lies in and the map version used; in no zone → flagged; maps come in by upload (shapefile, GeoJSON, KML) or an Esri layer link, as dated versions; a new version reprocesses un-invoiced tickets. *(ADR-135, 141)* — *what Phase 1 delivered (ADR-371): the map as dated versions, never edited, AC-01-59 (database); the boundary flag, the zone and map version attached by the worker, in no zone flagged, AC-06-42…45 (domain, story `p1-reconciled`); a new version worked by the next run (story `p1-left-out`). Left: the imports (shapefile, KML, an Esri layer link; GeoJSON is taken today) and the job that queues the reprocess (Phase 2, REQ-206).* *2026-10-12 (task 2.6.4 part 5, ADR-484, 485): a zipped shapefile (converted from its `.prj`) and a GeoJSON file are taken by the server, whole, up to 16 MiB, and a map version or a site's shape loaded from one, the file kept (`map-files.test.ts`); left for Phase 4: ~~KML, an Esri layer link, and~~ the screen.* *2026-10-14 (the user, ADR-523): KML and an Esri layer link moved to Phase 2, task 2.8.5 (REQ-213).* *2026-10-15 (task 2.8.5, ADR-527, 528): built at the API: a KML file and a KMZ are a map's file; an Esri feature layer fetched as GeoJSON in WGS84, kept as a version naming its layers, "Refresh from Esri"; a site's shape from either. Left for Phase 4: the screen, and the preview on a map before a load.*
- [ ] **REQ-401** Onboarding flow in the real order: select-or-create client → declaration event → project (program type, settings, map) → then contractors and contracts, forms and debris types, pay items (a rate per prime, "Pays when"), sites, rules, certifications and ROEs in any order; the setup check; a firm library and copy from a past project. *(`adms-ticket-workflows` §4.0, ADR-023, 228, 229)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-402** Contractor and contract management (`PRIME` / `SUB`).
- [ ] **REQ-403** Certification intake: the form's fields, measured boxes and computed capacity (`adms-certifications` §3A.3/§3A.8), crew certs, photos, QC step. **No placard or badge printing**: firms have their own. *(ADR-045/080/088)*
- [ ] **REQ-404** Rule builder per `spec/RULES.md`: a rule per form naming one contract; criteria picked or typed as its §4 table says, with the §4a operators; actions *Add transaction #n* (a pay item), *Remove transaction #n*, *Void ticket*; Active, Is valid (§7), Show matches, Reprocess; the pay item screen's "Pays when" writing its own rules; an exact duplicate of a rule refused on save, with an error naming the rule it copies. *(ADR-109, 118, 125, 229, 239, 301; revised 2026-09-29, ADR-247)*
- [ ] **REQ-411** Maps use OpenStreetMap data **served by the install** (e.g. a regional `.pmtiles` extract), never the public OSM tile servers; no licence fees; attribution shown. *(Q-100)*
- [ ] **W2's gate**: the chain green and recorded; every scenario with a back office part in
  files 01 and 03 counted N of M.

*Carried:*
- **Setup screens:** the check's page (open to reviewers) and the lookup on the site's page (C74, C97, C100); the screens read `reason`/`message` beside the field and `queued` ("N tickets queued, M locked as invoiced left as they are", ADR-422) (C96, C98, C99, C104, C105, C169); the pay item screen shows a rate only from a read taking Setup, the rule builder reads `valid` and `reasons`, *Show matches*' counts, "what it would change" (C75, C99); the map screen: a preview of a file's or an Esri layer's contents before a load, the zones' name field from `fields`, a drawn shape as GeoJSON, the ring pairs' refusal in its words, the Esri token asked at each fetch and never remembered (C140, C166, C169; REQ-124b); a setup version's page and field events whose version the project never had (C119); the close screen reads the closing check and asks to confirm, a reopening asks its reason (C81, C169); setup suggests a cert-number seed that doesn't look made up (C64, Q-96); where a firm's Monitor ID series starts if not `M000001` (C43); the crew-day pay item's day length defaulting from `CREW_DAY_HOURS` (C60). A save shown beside its preview, from the five preview requests: "N tickets would be queued, M locked as invoiced passed by" (C172).

### W3 — People, phones, the dispatch board and the time clock

**Goal:** the back office runs its people and its days.

- [ ] **W3.1 People** (REQ-415): create, permissions as ticks and bundles, a viewer's projects,
  archive, end sessions, set a password, clear an authenticator; bulk changes over a filtered set;
  a profile with history; nobody grants what they don't hold; the last admin never locked out.
- [ ] **W3.2 The firm's settings**: the phone-key hours or off, the viewers' two-step, the
  monitors' sign-in hours, each with its note.
- [ ] **W3.3 Phones and the master passcode**: rename, removal with a time and reason, retired, put
  back, which phones hold an old passcode, enrolment locked and the change offered; a phone's
  sessions; the security events each person may see.
- [ ] **W3.4 The dispatch board** (REQ-417): each day's assignments, copy yesterday's, planned
  against actual as views, unplanned assignments marked, the board's warnings beside each row.
- [ ] **W3.5 The time clock's screens** (C186): approval and unlock on the project's hours; the
  export (payroll, client billing, ICS-214's columns); a manager's correction by permission;
  back-office staff clocking in at the back office (its server half by the endpoint recipe).
- [ ] **REQ-415** **Worker administration**: see and change each worker's permissions directly; bundles of permissions when adding users or assigning projects; bulk grant/revoke over a filtered set; a worker profile page with history; every change audited and undoable as a batch; nobody grants what they don't hold; the last admin can't be locked out. *(Q-100, `FROM-BUILD-1.md` §11)*
- [ ] **REQ-417** **Dispatch board** (ADR-240): write each day's assignments (person, project, work, site, optional phone), copy yesterday's, see planned against actual (assigned with no field events; a site with field events and nobody assigned) as views, never ticket flags; unplanned assignments made on phones appear after sync, marked. Replaces the dispatch spreadsheet.
- [ ] **W3's gate**: the chain green and recorded; every scenario with a back office part in file
  02 counted N of M.

- [ ] **REQ-310** **Time clock** (optional per project), on the **assignment**, for **anyone with one** (phone, or back office for office staff): clock in/out and breaks **by hand**, with simple nudges only (starting a field event while not clocked in; signing out while clocked in); hourly activity lines pre-filled from the day's field events for the worker to update and approve, extra lines from a firm list; **a manager approves the day** (locked, unlock audited); **export** for payroll and client billing, no rates or pay held; viewers don't see hours; holds ICS-214 activity-log data (no form generation); never blocks. Start, a 30-minute break when working 6+ hours, clock-out; a day ends before midnight (later work goes on the next day); **no cap on monitor hours**; times in the project's time zone (ADR-100). **Separate from crew-day billing**, never linked. Back-office review of it in Phase 4. *(ADR-063, 241)* *Task 3.7.2 (ADR-601): **the phone's half built**: Time, clock-in, breaks and out by hand, both nudges, the day pre-filled and approved by the worker. Left: the back office's clock for office staff, a manager's approval screen and the export (W3).*

*Carried:*
- **People, phones, board, security:** the people page (create, permissions as ticks, a viewer's projects, archive, end sessions, set a password, clear an authenticator; paging, the archived apart, permissions a person made admin still holds; REQ-415's bundles, bulk changes and history); the session answer tells the page what the person may do; the firm's settings page (the phone-key hours or off, the viewers' two-step, the monitors' sign-in hours, each with a note); the phones page (rename, removal with a time and reason, made retired, put back, which phones hold an old passcode, enrolment locked and the change offered); the board's screen (planned against actual, AC-02-34; copying a day, AC-02-33; the withdrawn apart; a monitor's several assignments on a phone in the order made; what was set up on a phone stands over the plan that day; when an unplanned assignment was made and received; warnings for a second assignment); a monitor locked online shown to an admin; who sees which security events (`TWO_STEP_SET_UP`/`CLEARED`, the passcode's three, a phone's proofs, `DEVICE_TURN_IN`, `OFFLINE_SIGN_IN_REFUSED`), a session opened offline shown as "authorised by the master passcode, for M004127" (C88, C91, C92, C101…C103, C111, C112, C114, C115, C120, C122…C124, C126, C141, C170). The board's warnings (`GET /assignments`'s `BoardWarnings`) beside each row; a phone's sessions on its page (C172).
- **C186.** The time clock's screens and what they need (ADR-598 (8)): the approval screen on `GET /projects/:projectId/hours` with approve/unlock; the export of hours (payroll, client billing, ICS-214's columns); a manager's correction of an entry or a line by permission (the database refuses it while the day is approved: unlock first) and its endpoint; back-office staff clocking in at the back office (ADR-241 (1): a source and no phone on `clock_entry`, the guard's rule widened), built with its screen; a held time-clock entry shown as closed-only; whether a worker was signed in on the phone when their entry arrived is not asked.

### W4 — Review and correct

**Goal:** one review queue a reviewer works fast, and every correction the rules allow.

- [ ] **W4.1 The review queue** (REQ-405): by workflow with its cause counts, `?cause=` for one;
  flags grouped by cause; bulk accept and bulk fix as the screen's loop over the single acts; QC
  many at once; pending tickets listed, never aged.
- [ ] **W4.2 A ticket's page**: its field events side by side, photographs fetched with the
  session's cookies, its run decisions and history; correct any captured field by permission,
  renumber, void with a reason and undo it, accept a flag and take it back; reprocess.
- [ ] **W4.3 Quarantine resolution** (REQ-405a): every record sharing a number side by side with
  the evidence, and the audited number correction.
- [ ] **W4.4 Held records, set-aside files and jobs**: saved as corrected from `sent`, closed; a
  page of waiting and set-aside jobs.
- [ ] **W4.5 Records made in the back office** (carried): the certification sheet's entry, forms'
  entry and answers edited against their version, an ROE's number corrected, an acceptance or a
  revocation taken back, a field event's master-passcode authority shown.
- [ ] **REQ-405** **One review queue**: flags grouped by cause; correct, renumber, void with a reason, accept a flag, QC, unlock, with bulk actions; photos reviewed inside the ticket; pending tickets listed, never aged. *(ADR-051, 053, 166, 228)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-405a** **Quarantine resolution UI** — show every record sharing a ticket number side by side with the evidence a reviewer deduces from (cert number, load/disposal times, GPS, zone, photos), and offer the audited ticket-number correction. *(`adms-exceptions` §4.3a, ADR-020)*
- [ ] **W4's gate**: the chain green and recorded; every scenario with a back office part in files
  04…08 counted N of M.

*Carried:*
- **Review screens:** the review queue shows a held record (`viewer_held_record` for a viewer), one whose `sentId` was since saved, held photographs beside their records, files set aside beside their photographs, quarantined records' `resolution`, `DEVICE_CLOCK_OFF` with its difference (the firm may want the limit per project), a ticket queued because a neighbour changed, an accepted flag as accepted with a void ticket's cleared flags left out, a line taken off as taken off, a record held for its weight and why; saving a held record as corrected starts from `sent`; bulk accept; for many tickets, those that can't be locked and why (AC-09-08); the report by a batch's name (also a contractor's, from `viewer_invoice_batch`/`viewer_invoice_lock`); "reprocess" calls `reprocessTickets`; a page of waiting and set-aside jobs; the back office's correction is the only way a submitted record changes; a photograph shown by fetching its file with the session's cookies (never opened as a page), one not arrived says so; the removal of a photograph and what a viewer's screen and the exports do with a removed one (C67 (e), C78…C81, C94, C96, C128, C131…C133, C135, C137…C139, C146, C147, C152, C168). The queue's screen reads `GET /projects/:projectId/review-queue` a workflow at a time with its cause counts, and `?cause=` for one; **bulk accept and bulk fix are the screen's loop over the single acts** (only QC and a lock take many in one request, ADR-535 (4)); a ticket's run decisions shown from `GET …/tickets/:workflow/:ticketNumber/decisions` (ADR-536); a batch's report read by its name (C172).
- **Records made in the back office, and corrections** (C171; ADR-534): the sheet's entry screen (boxes measured with capacity shown as the server answers it, helpers picked, the reason picked), its five views sent one by one through `POST /photographs`; the forms' entry screens and a form's answers edited against the version they answer, `ANSWERS_DO_NOT_FIT`'s words beside the fields; an ROE's number corrected shows what it found and what it let go; an acceptance taken back from the flag's line; a revocation taken back on the certification's page (an admin's); a field event shows "authorised by the master passcode, for M004127" and which way.

### W5 — Money, the lock and the close

- [ ] **W5.1 The ledger** (REQ-406): transactions by ticket, pay item, prime and contract, as the
  session may see money.
- [ ] **W5.2 QC, invoice locks and batches**: one and many, those that can't be locked and why
  (AC-09-08), a batch's report by its name.
- [ ] **W5.3 The audit-trail viewer** (REQ-407): read-only, filtered by domain.
- [ ] **W5.4 Closing and reopening a project**: the closing check, a confirm, a reopening's reason.
- [ ] **REQ-406** Financial ledger views; lock/unlock QC Approved tickets as invoiced, optionally in named **invoice batches** (no invoice record, ADR-228); **data exports** the back office uses to assemble the client package by hand. The system does not generate the package. *(ADR-057/061/088)*
- [ ] **REQ-407** Audit-trail viewer (read-only; the audit log is evidence), filterable by domain (security · billing · operations · records).
- [ ] **W5's gate**: the chain green and recorded; every scenario with a back office part in file
  09 counted N of M.

### W6 — Reports, exports, photo PDFs and the receipt batch

- [ ] **W6.1 Reports** (REQ-409): debris totals, never costs, by period and filter; not stored.
- [ ] **W6.2 The daily report PDF and the email summary** (REQ-410).
- [ ] **W6.3 Exports** (REQ-412): one Exports place and every list; CSV, Excel-compatible, JSON,
  PDF; a cell beginning `=`, `+`, `-`, `@`, a tab or a carriage return written as text (ASVS
  1.3.3); the columns carried under W7.
- [ ] **W6.4 Photo PDFs** (REQ-413).
- [ ] **W6.5 The receipt batch** (REQ-414) on `packages/receipts`.
- [ ] **REQ-409** **Reports**: by day, week, month or range, filtered by debris stream, ticket type, site or contractor; **debris totals, never costs**; not stored (generated like a printout). *(Q-100, `FROM-BUILD-1.md` §9)*
- [ ] **REQ-410** **Daily report PDF** in landscape: title page; an unlabelled index page repeating the email outline; one page per operation (ROW, haul-out, unit rate) with details and a map; additional project stats; estimates and objectives; an end page (Open ADMS centred, Open Recover small bottom right, the operator's contact email). Plus the **email summary** in the user's format, with headings and debris lines from the project's own ticket and debris types. *(Q-100, `FROM-BUILD-1.md` §9)*
- [ ] **REQ-412** **Exports** from one Exports place and from every list: CSV, Excel-compatible, JSON, PDF; for tickets, transactions, certifications and audit history. *(Q-100, `FROM-BUILD-1.md` §10)*
- [ ] **REQ-413** **Photo PDFs** in two standard layouts: several items per page (photos in a row with the item's details), and one item per page with its receipt; images never shrunk past being readable on a phone or desktop; certifications are an item kind. *(Q-100)*
- [ ] **REQ-414** **Receipt batch**: paste one or more ticket numbers (any separator) and get a PDF of just the receipts, or the full record with photos and the receipt; unknown numbers are named, never dropped. *(Q-95/100)*
- [ ] **W6's gate**: the chain green and recorded.

*Carried:*
**Carried from the API's security checklist** *(task 2.7.3, ADR-514; `spec/CHECKLIST-API.md`, the ASVS 5.0 items named)*: the exports write a cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return as text (1.3.3, REQ-412); each web app on a hostname of its own, apart from the API's (3.5.4, with REQ-517); a person sees their own sessions and ends one, an endpoint and its screen (7.5.2). The web apps' own items (3.2.x, 3.4.3, 3.4.5, 3.4.6, 3.5.5, 3.7.x, 6.2.6, 6.2.7, 7.4.4, 14.3.3) are the checklist's, by THREAT-MODEL §6.

### W7 — The read-only portal

- [ ] **W7.1 Its shape** (ADR; ARCHITECTURE §14 allows either): a restricted view of the back office
  or a small app of its own, at a name of its own (ASVS 3.5.4).
- [ ] **W7.2 A viewer's screens** over `/viewer/…`: projects, tickets and their history,
  certifications, ROEs, surveys, incidents, drop-off logs, the setup and its check, the quantity
  lookup, photographs; a contractor's invoice batches; the two-step the firm asks of viewers.
- [ ] **W7.3 What each viewer sees of the mission**, as a browser test (the story `p1-viewed`'s
  answers): a client, a prime, a sub, an auditor.
- [ ] **REQ-408** Read-only web access for clients, contractors and auditors to their own projects' tickets and reports. *(ADR-050)* — *Phase 2 built the reads (ADR-434, 435) and their sign-in (ADR-408, 412). ~~**Added at Phase 2's exit (ADR-518)**~~ **The setting itself is Phase 2's again, REQ-215 (ADR-519); the portal shows it here. It was: the firm chooses whether read-only viewers must use two-step** (the user, ADR-511: "let the firm choose"; shipped default optional; ASVS 6.3.3): a firm-wide setting with its record, guard and audit, an admin's endpoint to change it, and a viewer with none set up sent to set one up at their next sign-in (C157).*
- [ ] **W7's gate**: the chain green and recorded.

*Carried:*
- **The portal and exports** (C70, C76, C78, C82, C87, C108, C109; REQ-408, 412): which more names a contractor's screen needs (vehicle type, field tag, zone, payable type, kind of work are ids today); the exports' columns: a sub's login with no rate or amount, the QC columns, the firm's own fields, the Transactions export's `mileage`, `mileage_source`, `map_data_date`, a viewer marked not to see private citizens; whether a page of tickets crosses workflows or filters by status or day; what a session tells the page about a viewer's kind; what each viewer sees of the mission, as a browser test; the client package; an export or report through `adms_readonly` needing more than thirty seconds states so with its task; the incident offers on the form's setup screen and the back office adding a contractor, cert number or ROE number to an incident; the viewer's private-citizen box; whether an incident names the certification it concerns as a real column (C66, C67).

### W8 — The whole system, up and proven

- [ ] **W8.1 One command brings it all up** (its name by ADR): the stack, the API, the worker, the
  field app, the back office and the portal, a fresh installation and its first admin, and where
  each app is printed; how to try every app by hand, written for the user.
- [ ] **W8.2 The golden mission end to end through the screens**: the back office sets it up
  (W2.11) and dispatches its days; the phones capture it through the field app (W0); the back
  office reviews, corrects, voids, QCs and locks; the approved statuses, review queue, ledger (P1
  $5,548.25 on 19 lines; P2 $324.00) and audit rows; each viewer sees what they should.
- [ ] **W8.3 Every scenario with a back office or portal part** counted N of M
  (`spec/acceptance/12-back-office.md`).
- [ ] **W8.4 Security**: the web apps' checklist items (W1.1's list) answered; the threat model's
  web rows read again; every new table guarded and `guard_gaps()` empty; `pnpm security` passing.
- [ ] **W8.5 Accessibility**: every web screen reviewed by hand against WCAG 2.2 AA; the back
  office's and the portal's conformance reports (VPAT format).
- [ ] **W8's gate, Track 1's finish line**: the chain green and recorded; three full runs in a row of
  `pnpm e2e` and `pnpm scenarios`; the user tries it.

---

## P — The phones: iPhone and Android, one milestone *(paused, ADR-600)*

**Opens at the user's word, when they have** a real iPhone and a real Android phone, a Zebra ZQ
printer, a Bluetooth scanner if their monitors use one, Xcode and an Apple developer account. Taken
whole, back to back; its first act lists what it needs and checks each is there. It ends Phase 3:
criterion 9 (on device), the field app's conformance report (VPAT format), and the REQs' native
halves.

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
- [ ] **3.9.1 The Android build** (REQ-301, 302, 314…316; C110; AC-10-44, AC-11-03, 07, 09, 11, 13,
  44, 45, 47, 49, 50, 61, 62, 65…70, 72, 73): the Keystore key (SubjectPublicKeyInfo); backups off and the data-extraction
  rules; the SQLCipher store; the camera and shrink; the Zebra plugin; the scanner. From the
  checklist (ADR-562): as 3.8.1's list for Android, no component exported but the launcher, and
  the submit and passcode controls ignoring touches under another app's overlay where the minimum
  Android doesn't stop it (MASWE-0039).
- [ ] **3.9.2 On a real Android phone** (AC-11-05, 10, 34, 56, 57): as 3.8.4, TalkBack in place of
  VoiceOver; run with the user.
- [ ] **The field app's conformance report** (VPAT format; ADR-559), from the hand review of W0 and
  the native screens.
- [ ] **REQ-301** One field app codebase: a browser build for testing first, then iPhone, later Android (proposed: React wrapped with Capacitor). Usable with no connectivity all day. *(ADR-094/099, ARCHITECTURE §3)* — *in part (2026-10-18, ADR-563…565): one codebase, `apps/field`, React 19.3.0 on Vite; its browser build served and tested (AC-11-01…04, 06); the native builds (3.8.1, 3.9.1) and a day with no connection (the capture tasks) to come.* *Task 3.1.4 (ADR-567, 568): the look as tokens and the components on React Aria Components 1.22.1 every screen is built from; home and the status strip; the key screens as a clickable prototype outside the app.*
- [ ] **REQ-302** An **encrypted** local store holding **multiple days** of tickets offline; its key in the phone's secure storage, this-device-only, not derived from any password; app data excluded from device backups (ADR-096) — a full operation, not a short outage. A device may stay disconnected across a weekend or a shift rotation. *(ADR-030)* — *in part (2026-10-18, ADR-570): the browser build's half: one store, `PhoneStore` (`apps/field/src/store/`), in IndexedDB under AES-256-GCM and HMAC-SHA-256 keys WebCrypto makes non-exportable from no password, kept across the app closing and opening (AC-11-07, 08 in part, `apps/field/e2e/store.e2e.ts`); the key in the phone's secure storage and the backups left out, 3.8.1, 3.9.1*
- [ ] **REQ-311** **Enrol a phone once, then the day's assignment** (ADR-240): enrolment (online, master passcode) makes its device key. A monitor signing in online on an enrolled phone receives **their assignment**, the project's **login list**, its manifest (with its setup version: the debris types and field tags, the unit rate pay items the assignment names, and for a phone at a site **that site's quantity lookup**, ARCHITECTURE §7.1 note) and number block. **Unassigned:** the master passcode opens setup (choose the project, the ticket types, the site and the monitor from a list), recorded as an unplanned assignment; offline only on the project whose lists the phone holds. Monitors sign in offline with their ID and password; the master passcode can also sign in as them; tries back off and lock; monitor credentials work only on set-up phones; the username is the Monitor ID; changing the monitor needs the master passcode first, or a master-passcode temporary session for a roster monitor that ends at day end. *(ADR-095/105/106/120/240/243)* — *the server's half so far (Phase 2): enrolment (ADR-439, 440), the monitor's online sign-in (ADR-443) and the assignment it is answered (ADR-444); the lists are 2.5.3's.* — *Phase 2 built the rest of the server's half (ADR-449…455, 457, 462…464): the lists and their setup version, the login list (a slow hash per entry, salted for that phone) and the master passcode's check, setup under the passcode online (its choices) and its report, a session under the passcode. Left: the app, its tokens in secure storage, its key in secure hardware (the browser build's WebCrypto writing DER), signing in offline and its own lock (C110, C112, C114, C115, C117, C120, C125; a story of signing in offline, C151).* — *Phase 3 (task 3.2.2, ADR-572): the browser build enrols and proves itself through its screens (its WebCrypto key writing DER, its token in memory alone, proven again on `PHONE_NOT_PROVEN`). Left: the native keys and keyrings (3.8.1, 3.9.1), signing in online and offline (3.2.3, 3.2.4), setup under the passcode (3.3.1).* — *Task 3.2.3 (ADR-574): signing in online through the screens, the session beside the phone's token (the browser build's in memory alone), the assignment and its lists taken and kept, `NOT_SIGNED_IN` asking for a sign-in again (AC-11-14…18). Left: signing in offline and the login list (3.2.4), setup and sessions under the passcode (3.3.1, 3.3.2), the native keyrings (3.8.1, 3.9.1).* — *Task 3.2.4 (ADR-575): the login list read and kept sealed, signing in offline from it (the phone's monitor alone), its tries backing off from the 5th and locking at the 10th until the passcode, the lock after inactivity, the sign-in made offline reported first (AC-02-39…41, AC-11-19…21). Left: setup and sessions under the passcode (3.3.1, 3.3.2), the native keyrings (3.8.1, 3.9.1).* — *Task 3.3.1 (ADR-576): setup under the master passcode with no assignment, online (the project, the work, the site, the monitor paged) and on the project whose lists the phone holds with no signal, the unplanned assignment's report kept until saved and sent first, seen in the browser build (AC-02-38, AC-11-23…25). Left: sessions under the passcode and changing the monitor (3.3.2), the native keyrings (3.8.1, 3.9.1).* — *Task 3.3.2 (ADR-577): the master passcode signing in as the phone's monitor or opening the temporary session, online and offline, and changing the monitor under it, seen in the browser build (AC-02-42, 46, AC-11-26, 27, 64). Left: the native keyrings (3.8.1, 3.9.1).*
- [ ] **REQ-312** **Switching monitors offline** with the master passcode, to a monitor on the project roster (name + Monitor ID); the previous monitor's unsynced records are archived, stay theirs, are hidden from the new monitor, and sync in the background; the switch is recorded on the phone's assignment. **The phone syncs whenever it has a connection** (records, then photos); a record the monitor submitted is sealed for them, synced or not: no reopen, no edit (ADR-477); one not yet submitted stays open and theirs to adjust. *(ADR-095, 240, Q-86, Q-90)* — *Phase 2 built (ADR-458, 462, 464, 477): a switch and a site move reported as an unplanned assignment, a use of the passcode logged offline reported and kept as a security event, a submitted record sent again changed answered "already saved" and changing nothing. Left: the phone (C123, C124, C126, C135).* — *Task 3.3.2 (ADR-577): the switch on the phone under the passcode, offline too, to a monitor from the roster (the login list offline, the server's with signal), the earlier monitor's unsent records archived under their id and hidden from the next, the switch recorded as an unplanned assignment or the use `MONITOR_SWITCH`; a move; seen in the browser build (AC-02-46, 47, AC-11-27, 64). Left: the archived queues sent in the background and the sync (3.4.1), a submitted record sealed on the phone (3.5.1), C135.*
- [ ] **REQ-314** **Printing** to a Zebra ZQ printer on every project: two collection copies (or control ticket + stub); a disposal copy at disposal, haul-out and final disposal; unit rate always; an itemised certification receipt. Barcode (Code 128) = the bare ticket number; receipts are generated on the fly, never recorded or counted, reprintable. One receipt content model renders to ZPL and PDF; the browser build prints to PDF. *(Q-95, ARCHITECTURE §12)*
- [ ] **REQ-315** **Scanning** with the phone camera or a keyboard-style Bluetooth scanner; anything printed scans back, and an existing ticket just says it exists. A printable control-ticket test set with real barcodes. *(Q-95, Q-105)* *(2026-10-20, task 3.6.3, ADR-596: the browser half built: scanner and camera at every scan box, home's Scan a barcode, `e2e/scanning.e2e.ts`. Not ticked: scanning printed paper with each phone's camera and a real scanner is 3.8.2, 3.8.3 and 3.9.1's.)*
- [ ] **REQ-316** **Photos** captured natively at full resolution, SHA-256 at capture, shrunk natively at original resolution keeping location, time and depth data (or depth as a linked file); sizes measured on real phones and set in configuration. *(ADR-101, ARCHITECTURE §11)* — *Phase 2 built (ADR-479…483): a photograph's record in the sync with both fingerprints, the media endpoint (parts that go on where the last ended; size, kind by first bytes and the whole file's SHA-256 checked), each file kept once. Left: native capture, part sizes and kinds of image measured on real phones (C137, C138).* *(2026-10-18, task 3.4.2, ADR-579: **the sync half built**: the field app sends each photograph's files after its records, a part at a time within the server's limit and smaller on a poor signal, asking where a file stands when it opens again mid-file; `test/photo-files.test.ts`, `e2e/photo-files.e2e.ts`, AC-11-32, 33. Not ticked: the native capture and the sizes measured on real phones are 3.8.2's.)* *(2026-10-19, task 3.6.1, ADR-586: **the browser build's half built**: from the camera only, never a file or the gallery; the original's SHA-256 at capture, then the shrink through `PhotoShrink`, each file and a depth file fingerprinted, the browser build keeping the original; taken again in its place or removed before submitting; `e2e/photographs.e2e.ts`, `test/tickets.test.ts`. Not ticked: the native camera and shrink, and the sizes measured, are 3.8.2's and 3.9.1's.)*
- [ ] **REQ-323** **The field app's security checklist**: OWASP MASVS (storage, crypto, authentication, network, platform; ARCHITECTURE §16), item by item, each answered by a named test or the phase that owns it, as `spec/CHECKLIST-API.md` does for the API (*written: `spec/CHECKLIST-FIELD.md`, MASVS v2.1.0 at MAS-L2 + MAS-P, task 3.1.1, ADR-562; answered whole at 3.10.2*); the threat model's phone rows read again. *(ARCHITECTURE §16; C156)* *Item 3.10.2 (ADR-606): **the browser build's half answered** by named tests, the threat model's phone rows read again. Left: the native controls (P).*
- [ ] **REQ-324** **Accessibility**: every screen of the field app meets the standard and level the user picks before the first screen is designed, checked automatically beside the browser end-to-end tests (ARCHITECTURE §15); whether a conformance statement ships is the user's call too. *(C41; ADR-172, every screen translatable)* — ***The user's answers, 2026-10-17 (ADR-559):*** *the standard is **WCAG 2.2 AA**; a conformance report (VPAT format) ships for each app at its phase's end, the field app's at Phase 3's (task 3.10.2).* — *Task 3.1.3 (ADR-566): the automated check, axe-core's WCAG 2.0–2.2 A and AA rules on every screen the browser tests reach, an unreached screen failing the chain (AC-11-51).* *Task 3.1.4 (ADR-568): the tokens' colour pairs AA in both themes, every component checked in the light and the dark theme and at 320 px with text at 200% (AC-11-52, 55, 56 in part); WCAG 3.3.7 read for the number typed again and put to the user (Q-218, ADR-569). Left: each screen's own check in its task, the hand review and the report (3.10.2).* *Item 3.10.2 (ADR-606): **the browser build's half done**: every screen reviewed against WCAG 2.2 AA (`spec/ACCESSIBILITY-FIELD.md`, an agent's review), four failures fixed, the keyboard's walk in every check. Left: the conformance report and the native screens (P).*
- [ ] **WCAG 2.1.4, a scan field's keys taken anywhere on its screen** (ADR-596, 606; `spec/ACCESSIBILITY-FIELD.md` §5): a phone setting "Take a scanner's keys anywhere on the screen", on by default, so the report can say Supports; or kept as built and the report says why. *Recommended:* the setting. The user's.
- [ ] **WCAG 3.2.2, a pick that moves straight on** (ADR-573 (1), 606): the question's own line says "Pick one to go on." on those questions (debris type, a typed number's reason, survey, incident type, unit rate work), or the report says partly. *Recommended:* the line. The user's.
- [ ] **VoiceOver and TalkBack keep their place** when the pressed control goes but the screen stays (`spec/ACCESSIBILITY-FIELD.md` §4), on the real phones (3.8.4, 3.9.2).
- [ ] **P's gate**: what was seen on each phone recorded; the chain green and recorded.

*Carried:*
- **C110, C111, C112.** The device key in real secure hardware (the Secure Enclave's 65-byte point needs the fixed 26-byte header; Android's Keystore gives SubjectPublicKeyInfo); both sign DER; the native `Keyring`s (`apps/field/src/store/keyring.ts`, ADR-572) on the Secure Enclave or Keystore and the Keychain or Keystore, this device only, their secrets kept there; attestation stays declined (ADR-240). *(The browser build: its WebCrypto key writing DER, its token in memory alone, proving again on `PHONE_NOT_PROVEN`, no attestation: done, task 3.2.2, ADR-572; `Authorization` across origins: task 3.1.2, ADR-565.)*
- **C137, C138, C139, C168.** *(Task 3.4.1, ADR-578: what it holds said in every sync, the passcode's check taken in, the lists read again when the setup version answered isn't theirs (C133), and a kept record never changed by the phone: done. Task 3.4.2, ADR-579: `OWNER_NOT_SAVED` kept and sent again once the record is saved; no depth file kept without its `depthSha256`; parts no larger than `MEDIA_PART_BYTES_AT_MOST`, smaller on a poor signal; `photoFileEndpoint` asked after a restart, one file's bytes read at a time; a held record's photograph answered saved and its files sent, the record still shown not saved: done.)* *(A record sealed at submit, an unsubmitted one the monitor's across sign-outs, a cancelled one never in the outbox: done for the collection, task 3.5.1, ADR-581; each later capture keeps them through `PhoneTickets`.)* Left: the capture giving `depthSha256` exactly where it takes a depth file, and image kinds and sizes measured on real phones (3.8.2). *(Held things named by `sentCanonical`'s SHA-256 at turn-in, and the master user's sync of the files before it: done, task 3.4.3, ADR-580.)*
- **C178.** The native stores implement `PhoneStore` (`apps/field/src/store/phone-store.ts`, ADR-570): SQLCipher's whole-database encryption under a random key in the Keychain or Keystore, this device only (no AES layer of the browser build's); ids may stay plain inside it; changes together or not at all, answered once on disk; the erase takes the key first; `e2e/store.e2e.ts`'s checks run against it on the phone (3.8.1, 3.9.1).
- **C156.** A phone's private key never leaves its secure hardware (3.8.1). *The field app's own checklist (OWASP MASVS, REQ-323) is written: `spec/CHECKLIST-FIELD.md`, task 3.1.1, ADR-562.*

---

## Later — not started; the user opens each

### Tracks 2…4, from the conversation of 2026-10-21 *(ideas, nothing decided)*

- **Track 2, a light installation.** One small server a firm can stop between missions; the API and
  worker as one process; photographs to S3 and mail through a provider; measured on the golden
  mission before anything is decided. Would change ADR-513 (TLS between processes on one host) and
  ADR-119 (Nominatim replaced by the county's address points; Valhalla built for the project's
  region only): the user's calls.
- **Track 3, the setup agent.** A firm drops in its contracts, rate sheets and permits; an agent,
  acting through the API as an audited actor, drafts the setup with each value citing its page, and
  a person approves before anything is saved; shapefiles found or asked for; a nightly review
  brief. Uploaded files are untrusted.
- **Track 4, a view per audience.** A mission center for the back office; a contractor's view for
  invoicing; a client's progress; a public progress map for residents; each with a scoped way for
  their own assistants to ask. Would change VISION §6 (not the GIS system of record) and §4.7 (the
  client package by hand): the user's calls.

### The demo deploy *(Phase 5a)*

- [ ] **REQ-517** The shipped **demo deploy**: Railway (API, worker, Postgres, **the routing server and the address server**, each with the project region's map extract, private to the API and the worker: REQ-022's other half, ADR-282, 287) + Netlify (web apps), documented, passing the scenario suite and load tests; **the back office calls the API through a same-origin proxy path** (`/api/*` rewritten to the API, ARCHITECTURE §4), so its cookies stay first-party (moved from REQ-204, ADR-512). Firms host in their own cloud and may extend it. *(ADR-099; re-scoped 2026-09-25)* **From the API's security checklist** *(task 2.7.3, ADR-513, 514; `spec/CHECKLIST-API.md`, the ASVS 5.0 items named)*: every container hardened, the proxy included (4.2.1, its local half in 2.7.3 part 5); the deploy's cipher suites (12.1.2); the image holds the built code and its dependencies only, no source control or tests (13.4.1, 15.2.3); no CDN or cache keeps a sensitive answer (14.2.2); each web app on its own hostname (3.5.4); how quickly a dependency's fix is taken up, in the operator's guide (15.1.1, 15.2.1); logs where only the operator reads them (16.4.2), sent to a separate system (16.4.3); publicly trusted certificates (12.2.2); a malware scan of uploads the firm may add (5.4.3, an accepted risk until then); a key replaced in place with its data re-sealed, in the operator's guide: the signing secret (each hash and seed re-made under the new one, the old kept beside it until then) and each service's password, without a new installation (11.2.2, ADR-515); and before 2031, when NIST SP 800-131A Rev. 3 (draft) disallows HMAC-SHA-1 generation, an authenticator's algorithm read again: the apps' support then (Microsoft Authenticator took SHA-1 alone on 2026-10-14) and a way to move each person to SHA-256 at their next setup (11.4.1, ADR-516). The deploy's object store with its own servers closed as the local stack's are (ADR-525, C167): a SeaweedFS the firm runs as `server` on its loopback behind TLS, or its gRPC under `security.toml`'s mutual TLS; the operator's guide says which.

*Carried:*
- **The installer and the deploy** (C25, C85, C86, C89, C92, C95, C121): Railway runs `migrate deploy` and the seed, never `migrate dev` or the shadow database; an image a firm deploys (locally the container mounts this checkout) and the uid that reads the owner-only settings on a Linux host; Node's own crash output isn't JSON; the deploy writes `ADMS_CORS_ORIGINS`, `ADMS_API_HOST`, `ADMS_API_PORT`, `ADMS_TRUSTED_PROXIES`, `ADMS_ADDRESSES_URL` and the worker's map servers and their CA; the installer asks a real firm for its mail server (`SMTP_URL`, `ADMS_MAIL_FROM`); a newer breached-password list is a release's work.
- **Security in the cloud** (C33, C40, C90, C91, C93, C157, C161, C162): CIS items for the cloud's Postgres (TLS required; connection logging naming user and database; pgAudit; file permissions and patch level), tested in the deploy's checks; the back office and the API one site for `SameSite=Strict` (a proxy path, ADR-408 (6)); the proxy refuses plain HTTP at the API's name and sends HSTS with `includeSubDomains`; the deploy's own hardening and TLS between hosts; a key for password hashes and one for sealed secrets apart from the signing secret, or in hardware (ADR-411 (4)); a key replaced in place with its data re-sealed, in the operator's guide; several API processes each keep their own rate-limit counts and unfinished file parts (a shared store is a new service, by ADR; or route a phone to one); the proxy's or network's own limits meet a flood; `pnpm local:accounts` never part of a deploy; **an outside penetration test** before a firm's first live mission (C40 (b)); **how a vulnerability is reported and a fix reaches installations** (a root security policy file, the user's to approve), before the repository is public (C40 (c)). From the Phase 2 audit (ADR-541, 542, 549): tries taken in turn, tries under way and the addresses refused at the master passcode shared by several API processes (today each process's own); the password and sealing keys held in hardware and replaced in place with what they keyed made again; the operator's guide saying to name every proxy in `ADMS_TRUSTED_PROXIES`.
- **Operations** (C38, C39, C87, C138, C147, C155, C166): alerts (who is told, by what, on which figure: `/readiness` polled, never `/health`; Docker's health; a log filter on `INTERNAL_ERROR` and `JOB_SET_ASIDE`, an admin told of a job set aside); the worker's answer from outside its host; sync failures as a rate; a backup failing; storage or the database filling; figures kept over time; no outside service. Availability: standby or failover, restarts, targets (how long down, how much lost) as policy. The deploy's pools against `max_connections` (each service's pool and the viewer pool, per process); the logins' timeouts set the same way; the two waits and the burst measured over a network.
- **Storage and maps** (C48, C49, C136, C167, C169): the firm's own bucket with versioning or Object Lock, an identity with put and get alone, a deny on a put without `If-None-Match` where the store knows it, path or host addressing, the region; a SeaweedFS deploy runs as `server` on its loopback or with gRPC under mutual TLS; the demo's Valhalla and Nominatim with the region's extract, private to the API and the worker, TLS between, sized for the region, their proxy keeping no access log; the rest of Q-166 (several regions in one installation, how a firm names its region, refreshing to a newer extract without changing a billed mileage, the back office's base map file); an Esri layer on ArcGIS Online asked from the deploy's host, measured.
- **The runbook** (C90…C92, C111, C112): losing `ADMS_TOKEN_SIGNING_SECRET` means every password and authenticator is set anew; `pnpm installer:admin` is the first step after the installer and the way back in (`node apps/api/dist/admin.js` in a container deploy); a locked passcode is opened by changing it; `pnpm installer` rerun after an upgrade (Q-167).

### Later features *(Phase 5b; each confirmed by the user before it is built)*

- [ ] **REQ-501** `TaskOrder` + `TaskOrder_CLIN` hierarchy under `Project`; tickets map to a CLIN by sector and debris category. ⚠️ *Conflicts with a project per kind of work (ADR-148) and work orders being out (ADR-228); not planned unless the user reopens it.*
- [ ] **REQ-502** Optional **"USACE approved" flag** on the load call, available on every project. *(ADR-077; replaces the dual QC/QA load call)*
- ~~**REQ-503**~~ Removed 2026-09-24 — capacity is REQ-106d (`adms-certifications` §3A.3). *(ADR-077)*
- ~~**REQ-504**~~ Moved into the core: the stump CY and fill CY formulas (ADR-178, 183, 198; `adms-validation` §5.5).
- [ ] **REQ-505** Attachment 4 Hazard Tree Removal workflow — barcode scan, pre-cut <24h evidence, stump photos.
- [ ] **REQ-506** Attachment 3 LOADM 20-field point feature service published in Esri REST format; SDSFIE 4.0.5.1 conformance. Its `Truck Placard Number` field serializes **from** `certNumber` — no second identifier enters the core schema. *(ADR-016)*
- [ ] **REQ-507** PPDR / CPDR parcel lifecycle polygon service and ROE legal-package ingestion.
- [ ] **REQ-508** **Live** scale-house integration (IP/RS232) for sites that have it: gross / tare / net ingest, tons to 2 dp. The manual receipt path (REQ-126a/d/e) is Phase 1 and covers the common case — a connex box and a receipt book. *(ADR-038)*
- ~~**REQ-509**~~ Moved into the core 2026-09-25 as **REQ-126f** (road-route mileage, ADR-110).
- [ ] **REQ-510** Crew time: items with hours to the quarter hour; bills **the highest item's hours, once**, through the pay item's conversion (per hour, ÷ the day length, or steps); more than 12 hours on one item in the crew's day (01:00–24:00, project time) is flagged. *(ADR-068, 084, 087, 126; revised 2026-09-29, ADR-247)*
- [ ] **REQ-511** TDSR volume-reduction ratio tracking — grinding 4:1, incineration 95%, C&D compaction 2:1.
- [ ] **REQ-512** 75% Task Order NTE automated burn-rate alert (trailing 3-day average, 30-day projection). ⚠️ *A contract holds no not-to-exceed amount (ADR-146); not planned unless the user reopens it.*
- [ ] **REQ-513** Daily QC report (0700) and Daily Expenditure Report (0900), printable 8.5"×11".
- ~~**REQ-514**~~ Not planned (ADR-050 keeps roles simple). Was: expanded RBAC roles: `USACE_KO`, `USACE_COR`, `USACE_QA`, `PRIME_QCM`, `CONTRACTOR_QC`, `DISPOSAL_TOWER_OPERATOR`, `FIELD_MONITOR`, `ARBORIST_RPF`, `SCALE_CLERK`, `ADMIN`.
- [ ] **REQ-515** Voided tickets retained in live exports with their flags intact. *(Four statuses, ADR-060; ineligible work is flagged, not a status, ADR-210)* *(revised 2026-09-29, ADR-247)*
- ~~**REQ-516**~~ Moved into Phase 3: printing on every project, the tower included (REQ-314).
- [ ] **REQ-518** **HHW trail** (KD-30; design not yet discussed). The user's account (Q-186, ADR-193): at an HHW site a trailer pulls up, the items are taken off and prepared for disposal, loaded onto another container and disposed of elsewhere; once they leave, the firm gets back a **receipt from the company that prepared them**, noting they were disposed of, **uploaded and saved like a contract's signed copy** (a PDF online). "HHW basically has to be broken down into its parts." When it is designed, the behaviour it needs becomes a built-in value in a release, with an ADR (ADR-194); the HHW site option is gone (ADR-215).

---

## Waiting on the user

Nothing blocks W0…W8 (ADR-230).
- **For P:** the hardware above.
- **To approve:** `spec/acceptance/11-field-app.md` (ADR-560), and `12-back-office.md` once W1.1
  writes it; the ADR-240 notes in ARCHITECTURE §7–§10; a security policy file before the
  repository is public (C40).
- **The agent's defaults you may overturn:** `SUMMARY.md` §4 (D1…D162, through ADR-598) and every
  row marked **agent default** in `DECISIONS.md`.
- **Open questions:** KD-80 (whether the field tag list goes too); whether *photos required*
  should take a number (ADR-345); C185 (asked at W0's gate); the HHW trail (KD-30, REQ-518) and
  `RULES.md` §7 "Is valid", not asked yet.
- **The map region for examples:** the local stack's extract is Delaware, standing in for the
  made-up Bayline County (ADR-282); Florida's needs more disk than Docker has here (8 GB).
- **Ours, with the deploy:** design tasks Q-166 (map data for each region) and Q-167 (upgrading an
  installation).

### Housekeeping and observations *(carried; no item; look when it comes up)*

- **C26.** pnpm 12 when the global pnpm is 11+; Node 26 once it's LTS (ADR-255).
- **C27.** The `.gitignore` section for `database/` is harmless; the user's to drop.
- **C28.** `pnpm installer:teardown` doesn't know story databases: one left behind (a killed run, or `--keep`) is owned by `adms_owner`, so `DROP ROLE adms_owner` fails. Teardown should drop `adms_story_…` databases first, or stop and name `pnpm scenarios clean`.
- **C32.** The accepted audit advisories, all in the Prisma CLI: `GHSA-ggr8-5vv4-36mx` (`deepmerge-ts` 7.1.5), `GHSA-3f6p-5ww8-9rcr` and `GHSA-rgwj-5xj2-c3m3` (`mysql2` 3.15.3); secretlint's seven dev-tool licences allowed by exact version (an upgrade makes them undecided).
- **C116.** `pnpm security` can't see a change made to the database by hand within thirty minutes of `pnpm test` (`--fresh`; `pnpm chain --fresh` passes it on). (The one command and its summary: `pnpm chain`, ADR-533.)
- **C174 (b), (c) (seen, left as they are; numbered C171 until ADR-552, which C171 already was; its (a), the lock race, done by ADR-554):** (b) a certification entered from its sheet is reconciled by the same path as one a phone made after its load (`certifiedIn`; `p1-left-out`'s `730499`): the API test proves the link and the job, and no story runs one from paper. (c) The un-revoke's own admin check is doubled by the door's (`adminOnly`), as the revocation's is.
- **A headless-shell renderer crash** (SIGSEGV at a null address, "Target crashed") seen once in the mission run's Tuesday step: Chromium's, its report kept; looked at again if it comes back. (seen 2026-10-22, W0)
- **pg's `DeprecationWarning`** "client.query() when the client is already executing a query" at every world's start (removed in pg@9): find the caller before pg 9 (seen 2026-10-22, W0).
- **Spotlight on the user's Mac** indexing the runs' `.cache/` loaded the machine (load 10–14) and stretched the screens' run from 1 to 3.5 min; excluding the repo's `.cache/` from Spotlight is the user's call (seen 2026-10-21, W0).
- **C140, C142, C153, C154, C162, C163, C167, C169, C170 (seen, left as they are):** a malformed `.shp` with a negative record length throws (reporting the libraries' faults upstream is the user's call); on a Linux host a process on the host's loopback can't be reached from a container (`host-gateway`; the stories' API must listen where the stack's network reaches it, never `0.0.0.0` on a shared machine); not measured: photographs at real size, a network's time, a first working's own time (about 7.5 s a run of 200 for its map server asks), a burst where neighbours are found; Docker Desktop's forward to Caddy once reset connections from the host after a crash loop (`docker restart open-adms-local-caddy-1`); acceptance files 01…09 carry each task's history in their cells; SeaweedFS logs that it loaded no IAM configuration for STS (none used); an Esri layer's address is held by a pattern (OpenAPI says the pattern); archiving a site label value leaves sites carrying it; `contractor.merged_into_id` kept as history; `project_open_guard()`'s refusal is recognised by its message; two applied guard migrations' comments cite AC-10-81…84 and AC-10-11, 81 (read AC-10-83…86 and AC-10-11, 83); `NumberAllocator.retire` is called by nothing (a later task's to remove or use).

---

## Done

- **Phase 0, the foundation:** 2026-10-01 (ADR-281…288).
- **Phase 1, the data core and engine:** 2026-10-06 (ADR-371, 372); 93 of 98 REQs, the rest moved.
- **Phase 2, the API and sync:** 2026-10-17 (ADR-555), after two reopenings (ADR-519, 552).
- **Phase 3, the field app's browser build, Milestones 3.0…3.6 and task 3.7.1:** 2026-10-17…20
  (ADR-557…598).

Their tasks, ticks and register: `agent_store/history/BACKLOG.md`; their requirements:
`history/REQUIREMENTS.md`.

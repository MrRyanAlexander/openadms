# Open ADMS — Requirements, gated phases

> **2026-09-25:** Phase 0 (Foundation) now comes first (ADR-103); how each phase is built and
> secured is `spec/ARCHITECTURE.md`. Device wording is **setup**, never provisioning (ADR-095).

Phases 2–5. **Do not build from these until `agent_store/NEXT.md` says the phase has opened.**
The active phase's checklist is `agent_store/REQUIREMENTS.md`.

## Phase 2 — HTTP API (Railway) 🔒 gated

**Carried from Phase 0** *(ADR-287)*
- [ ] **REQ-004** One shared **contracts** package: Zod schemas for every API and sync payload; OpenAPI generated from them; nothing hand-writes a payload shape. *(ADR-094)* — the package and its dependency direction exist (ADR-261).
- [ ] **REQ-006** The local stack starts with one command and serves every service over **HTTPS** (a reverse proxy with a local CA); nothing listens on plain HTTP to the outside. *(ADR-098/099)* — met for the six services that exist (ADR-263, 282); re-checked as the API, the worker and each web app join through Caddy, and ticked when the last one has.
- [ ] **REQ-016** Every synced record carries an ID made on the device; the server's idempotency ledger answers a retry "already saved" and never quarantines it as a duplicate number. *(KD-56, ARCHITECTURE §9)* — the phone-made id exists on every field event (ADR-268); the ledger is the sync endpoint's.

- [ ] **REQ-201** The API (`apps/api`) wraps the `domain` and `db` packages: zero new domain logic, zero duplicated validation. *(ARCHITECTURE §18; revised 2026-09-29, ADR-247)*
- [ ] **REQ-202** Authentication and roles: `ADMIN` (full), manager/analyst (granted permissions), `MONITOR` (on an enrolled phone holding their assignment, ADR-240), and read-only client / contractor / auditor logins scoped to their projects. Back office: short-lived access tokens + rotating, server-revocable refresh tokens in `HttpOnly; Secure; SameSite` cookies (never `localStorage`), CSRF protection; permissions checked from the database on every request so a revoke is immediate; Argon2id password hashing; NIST SP 800-63B password rules. *(ADR-050/093/095, ARCHITECTURE §6)*
- [ ] **REQ-202a** Device authentication: a device key pair made at **enrolment** in the phone's secure hardware; each sync signs a server challenge. A phone taken out of service is still **received** at its next sync: what it made after its removal time arrives flagged, then its number block is retired and it's wiped, and only then is it refused. *(ADR-095, 134, 240; ARCHITECTURE §7.4; revised 2026-09-29, ADR-247)*
- [ ] **REQ-202b** Every sign-in, failure, lockout, device setup, device switch and master-passcode use is a security audit event. *(ADR-095/097)*
- [ ] **REQ-203** Sync endpoints per ARCHITECTURE §9: records before photos; an idempotency ledger on device-made record IDs (REQ-016); a per-record answer (saved / already saved / quarantined); resumable photo upload with hash check; device clock reported; fresh manifest, number-block top-up and master passcode verifier returned. *(ADR-022/065/095/100)*
- [ ] **REQ-204** HTTPS only with HSTS; an explicit CORS allow-list of exact origins (no wildcards or hosting-domain patterns; the back office same-origin through a proxy path); rate limits per IP, account and device; sign-in back-off and lockout; security headers; no internal errors in responses; logs without secrets or personal details. *(ADR-098, ARCHITECTURE §6)*
- [ ] **REQ-205** Only `packages/db` and the two server apps touch Postgres; no hand-written SQL for modelling. *(invariant 12, ADR-094)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-206** Reprocessing is **jobs, not requests**: a sync, a correction or a back-office "Reprocess" queues worker jobs; there is no synchronous reconcile endpoint. *(ARCHITECTURE §13)* *(revised 2026-09-29, ADR-247)*

---

## Phase 3 — Field app (browser build, then iPhone, then Android) 🔒 gated

- [ ] **REQ-301** One field app codebase: a browser build for testing first, then iPhone, later Android (proposed: React wrapped with Capacitor). Usable with no connectivity all day. *(ADR-094/099, ARCHITECTURE §3)*
- [ ] **REQ-302** An **encrypted** local store holding **multiple days** of tickets offline; its key in the phone's secure storage, this-device-only, not derived from any password; app data excluded from device backups (ADR-096) — a full operation, not a short outage. A device may stay disconnected across a weekend or a shift rotation. *(ADR-030)*
- [ ] **REQ-303** Collection flow: **New** scans the driver's badge (the cert loads); GPS start/end and waypoints as the truck loads; **Complete**: the debris type picked by name (and an optional field tag), the address, then the number scanned or shown and **re-entered by hand**; at most 8 photos per ticket. **No pay item, rate or code on the screen** (monitors never pick pricing). *(ADR-056/157/207/209/218)*
- [ ] **REQ-304** Disposal flow: the site comes from the phone's **assignment**, never picked; **New** scans the badge; **Complete**: the debris type picked independently, then **one quantity from the site's lookup** for that debris type and prime (the load call typed 0–100, or the scale weight, or a count of the tickets the load carries), then the number scanned and re-entered; at most 8 photos (the empty bed); no ticket list on the phone. *(ADR-071/195/209/223/227/240/243)*
- [ ] **REQ-305** Haul-out flows, with load call correctly on the **collection** screen, always; the haul-out disposal takes the scale weight only where its site's lookup says the haul-out is paid by weight. *(ADR-013/223/227/243)*
- [ ] **REQ-306** Unit rate flow: the crew badge; the crew photo; the payable type picked by name; the measurement (circumference or diameter), count, items or hours as the kind of work asks; the phone works out and prints the pay item from the bands; one GPS point; at most 8 photos; the number shown and re-entered. *(ADR-157, 177, 207, 209, 213)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-307** Forms: ROE, pre-work survey, post-work survey (linked by ROE number), incident (type, then sub-type), citizen drop-off log; the firm's added fields. *(ADR-149, 150, 160, 184, 188)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-308** Background sync queue that drains on reconnect without duplicating tickets.
- [ ] **REQ-308a** Disposal capture scans the barcode carrying the **collection-issued ticket number**; the number is never re-generated at disposal. *(ADR-019, ADR-021)*
- [ ] **REQ-308c** A sync rejection is surfaced to the monitor as unsaved, never silently swallowed. *(ADR-022)*
- [ ] **REQ-308b** The phone's menu is built from its **assignment** (the work it names) and the project's forms. *(ADR-211, 240, KD-14)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-309** Values are **picked from lists, never typed**, anywhere a list exists (debris types, payable types, field tags, reasons…). *(invariant 6)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-311** **Enrol a phone once, then the day's assignment** (ADR-240): enrolment (online, master passcode) makes its device key. A monitor signing in online on an enrolled phone receives **their assignment**, the project's **login list**, its manifest (with its setup version: the debris types and field tags, the unit rate pay items the assignment names, and for a phone at a site **that site's quantity lookup**, ARCHITECTURE §7.1 note) and number block. **Unassigned:** the master passcode opens setup (choose the project, the ticket types, the site and the monitor from a list), recorded as an unplanned assignment; offline only on the project whose lists the phone holds. Monitors sign in offline with their ID and password; the master passcode can also sign in as them; tries back off and lock; monitor credentials work only on set-up phones; the username is the Monitor ID; changing the monitor needs the master passcode first, or a master-passcode temporary session for a roster monitor that ends at day end. *(ADR-095/105/106/120/240/243)*
- [ ] **REQ-311a** **Create a field monitor on a phone** (online): the master user chooses "Create monitor", sets username and password, saves to the server, and may go straight on to setup. *(ADR-105)*
- [ ] **REQ-312** **Switching monitors offline** with the master passcode, to a monitor on the project roster (name + Monitor ID); the previous monitor's unsynced records are archived, stay theirs, are hidden from the new monitor, and sync in the background; the switch is recorded on the phone's assignment. **The phone syncs whenever it has a connection** (records, then photos); a finished field event stays reopenable until the monitor ends the shift, later edits sent as the edit log. *(ADR-095, 240, Q-86, Q-90)*
- [ ] **REQ-313** **Sync and turn in** under the master passcode, without the monitor present: upload every queue, wait for the server's confirmation of each record, return unused numbers, then wipe. *(ADR-096, ARCHITECTURE §8)*
- [ ] **REQ-314** **Printing** to a Zebra ZQ printer on every project: two collection copies (or control ticket + stub); a disposal copy at disposal, haul-out and final disposal; unit rate always; an itemised certification receipt. Barcode (Code 128) = the bare ticket number; receipts are generated on the fly, never recorded or counted, reprintable. One receipt content model renders to ZPL and PDF; the browser build prints to PDF. *(Q-95, ARCHITECTURE §12)*
- [ ] **REQ-315** **Scanning** with the phone camera or a keyboard-style Bluetooth scanner; anything printed scans back, and an existing ticket just says it exists. A printable control-ticket test set with real barcodes. *(Q-95, Q-105)*
- [ ] **REQ-316** **Photos** captured natively at full resolution, SHA-256 at capture, shrunk natively at original resolution keeping location, time and depth data (or depth as a linked file); sizes measured on real phones and set in configuration. *(ADR-101, ARCHITECTURE §11)*
- [ ] **REQ-318** Collection completion: **Get GPS**, then **Get address info** (looked up through our API and Nominatim when online, else street number and street name typed); waypoints marked during the load. *(ADR-111, Q-104)*
- [ ] **REQ-319** A typed ticket number (barcode unreadable) is flagged for the back office and needs a reason; the load call is typed as a whole number, never prompted. *(ADR-111, Q-105, Q-106)*
- [ ] **REQ-320** Unit rate: a crew badge scanned once stays the working crew on the phone until changed; shown clearly and confirmed on each completion; the monitor may mark work **ineligible** only where the pay item allows it (flagged). *(ADR-111, 210, Q-107)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-321** On control-ticket projects, the disposal receipt may be handwritten on the back of the control ticket; haul-out prints at the collection side. *(ADR-115)*
- [ ] **REQ-317** A truck keyed in by hand is allowed and marked manual; it bills the **certification's** capacity, and a typed capacity that differs is flagged. *(Q-98, ADR-154)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-310** **Time clock** (optional per project), on the **assignment**, for **anyone with one** (phone, or back office for office staff): clock in/out and breaks **by hand**, with simple nudges only (starting a field event while not clocked in; signing out while clocked in); hourly activity lines pre-filled from the day's field events for the worker to update and approve, extra lines from a firm list; **a manager approves the day** (locked, unlock audited); **export** for payroll and client billing, no rates or pay held; viewers don't see hours; holds ICS-214 activity-log data (no form generation); never blocks. Start, a 30-minute break when working 6+ hours, clock-out; a day ends before midnight (later work goes on the next day); **no cap on monitor hours**; times in the project's time zone (ADR-100). **Separate from crew-day billing**, never linked. Back-office review of it in Phase 4. *(ADR-063, 241)*

---

## Phase 4 — Back-Office Web App (Netlify) 🔒 gated

- [ ] **REQ-401** Onboarding flow in the real order: select-or-create client → declaration event → project (program type, settings, map) → then contractors and contracts, forms and debris types, pay items (a rate per prime, "Pays when"), sites, rules, certifications and ROEs in any order; the setup check; a firm library and copy from a past project. *(`adms-ticket-workflows` §4.0, ADR-023, 228, 229)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-402** Contractor and contract management (`PRIME` / `SUB`).
- [ ] **REQ-403** Certification intake: the form's fields, measured boxes and computed capacity (`adms-certifications` §3A.3/§3A.8), crew certs, photos, QC step. **No placard or badge printing**: firms have their own. *(ADR-045/080/088)*
- [ ] **REQ-404** Rule builder per `spec/RULES.md`: a rule per form naming one contract; criteria picked or typed as its §4 table says, with the §4a operators; actions *Add transaction #n* (a pay item), *Remove transaction #n*, *Void ticket*; Active, Is valid (§7), Show matches, Reprocess; the pay item screen's "Pays when" writing its own rules. *(ADR-109, 118, 125, 229, 239; revised 2026-09-29, ADR-247)*
- [ ] **REQ-405** **One review queue**: flags grouped by cause; correct, renumber, void with a reason, accept a flag, QC, unlock, with bulk actions; photos reviewed inside the ticket; pending tickets listed, never aged. *(ADR-051, 053, 166, 228)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-405a** **Quarantine resolution UI** — show every record sharing a ticket number side by side with the evidence a reviewer deduces from (cert number, load/disposal times, GPS, zone, photos), and offer the audited ticket-number correction. *(`adms-exceptions` §4.3a, ADR-020)*
- [ ] **REQ-406** Financial ledger views; lock/unlock QC Approved tickets as invoiced, optionally in named **invoice batches** (no invoice record, ADR-228); **data exports** the back office uses to assemble the client package by hand. The system does not generate the package. *(ADR-057/061/088)*
- [ ] **REQ-408** Read-only web access for clients, contractors and auditors to their own projects' tickets and reports. *(ADR-050)*
- [ ] **REQ-407** Audit-trail viewer (read-only; the audit log is evidence), filterable by domain (security · billing · operations · records).
- [ ] **REQ-409** **Reports**: by day, week, month or range, filtered by debris stream, ticket type, site or contractor; **debris totals, never costs**; not stored (generated like a printout). *(Q-100, `FROM-BUILD-1.md` §9)*
- [ ] **REQ-410** **Daily report PDF** in landscape: title page; an unlabelled index page repeating the email outline; one page per operation (ROW, haul-out, unit rate) with details and a map; additional project stats; estimates and objectives; an end page (Open ADMS centred, Open Recover small bottom right, the operator's contact email). Plus the **email summary** in the user's format, with headings and debris lines from the project's own ticket and debris types. *(Q-100, `FROM-BUILD-1.md` §9)*
- [ ] **REQ-411** Maps use OpenStreetMap data **served by the install** (e.g. a regional `.pmtiles` extract), never the public OSM tile servers; no licence fees; attribution shown. *(Q-100)*
- [ ] **REQ-412** **Exports** from one Exports place and from every list: CSV, Excel-compatible, JSON, PDF; for tickets, transactions, certifications and audit history. *(Q-100, `FROM-BUILD-1.md` §10)*
- [ ] **REQ-413** **Photo PDFs** in two standard layouts: several items per page (photos in a row with the item's details), and one item per page with its receipt; images never shrunk past being readable on a phone or desktop; certifications are an item kind. *(Q-100)*
- [ ] **REQ-414** **Receipt batch**: paste one or more ticket numbers (any separator) and get a PDF of just the receipts, or the full record with photos and the receipt; unknown numbers are named, never dropped. *(Q-95/100)*
- [ ] **REQ-415** **Worker administration**: see and change each worker's permissions directly; bundles of permissions when adding users or assigning projects; bulk grant/revoke over a filtered set; a worker profile page with history; every change audited and undoable as a batch; nobody grants what they don't hold; the last admin can't be locked out. *(Q-100, `FROM-BUILD-1.md` §11)*
- [ ] **REQ-417** **Dispatch board** (ADR-240): write each day's assignments (person, project, work, site, optional phone), copy yesterday's, see planned against actual (assigned with no field events; a site with field events and nobody assigned) as views, never ticket flags; unplanned assignments made on phones appear after sync, marked. Replaces the dispatch spreadsheet.
- [ ] **REQ-416** **Layout**: sidebar closed by default with a header toggle; tables stay inside the viewport; dashboards stack cleanly on mobile; no explanatory banners; dashboard period options fit the project's length. Billable tickets under **Tickets**, incidents/surveys/ROEs under **Reports and Forms**, money under **Billings**. *(Q-100, Q-103)*

---

## Phase 5 — Later features & Deploy 🔒 gated

Sourced from `development/Automated Debris Management System (ADMS).md` and
`development/OPEN ADMS_ System Architecture & Data Structure Specification.md`. Each of these is
a genuine schema expansion, not a feature toggle.

> ⚠️ **No USACE mode (ADR-077).** These are candidate features any project may use once the user
> confirms each one; none switches on a separate rule set. Changed 2026-09-24: **REQ-502**
> replaced by an optional "USACE approved" flag on the load call; **REQ-503 removed** (capacity
> is REQ-106d, `adms-certifications` §3A.3); **REQ-510** crew time is itemised and its hours→quantity is set per pay
> item (ADR-084, 087, Q-81); **REQ-514** roles aren't planned (ADR-050 keeps roles simple).

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
- [ ] **REQ-517** The shipped **demo deploy**: Railway (API, worker, Postgres, **the routing server and the address server**, each with the project region's map extract, private to the API and the worker: REQ-022's other half, ADR-282, 287) + Netlify (web apps), documented, passing the scenario suite and load tests. Firms host in their own cloud and may extend it. *(ADR-099; re-scoped 2026-09-25)*
- [ ] **REQ-518** **HHW trail** (KD-30; design not yet discussed). The user's account (Q-186, ADR-193): at an HHW site a trailer pulls up, the items are taken off and prepared for disposal, loaded onto another container and disposed of elsewhere; once they leave, the firm gets back a **receipt from the company that prepared them**, noting they were disposed of, **uploaded and saved like a contract's signed copy** (a PDF online). "HHW basically has to be broken down into its parts." When it is designed, the behaviour it needs becomes a built-in value in a release, with an ADR (ADR-194); the HHW site option is gone (ADR-215).

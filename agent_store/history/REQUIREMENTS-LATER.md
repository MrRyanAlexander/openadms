# Open ADMS — Requirements, gated phases

> **2026-09-25:** Phase 0 (Foundation) now comes first (ADR-103); how each phase is built and
> secured is `spec/ARCHITECTURE.md`. Device wording is **setup**, never provisioning (ADR-095).

Phases 4–5 (Phase 3 opened 2026-10-17 and moved out, ADR-557; Phase 2 opened 2026-10-06 and moved out; its exit of 2026-10-14, ADR-518, was withdrawn when the user reopened it the same day, ADR-519). **Do not build from these until `agent_store/NEXT.md` says the phase has opened.**
The active phase's checklist is `agent_store/REQUIREMENTS.md`.

## Phase 2 — API and sync: reopened 2026-10-14 (ADR-519)

Its 14 REQs moved to `REQUIREMENTS.md` word for word: 13 ticked there, REQ-006 moved to Phase 3 below. **Reopened at the user's word (ADR-519):** REQ-210…217 are new, in `REQUIREMENTS.md`.

---

## Phase 3 — Field app (browser build, then iPhone, then Android): **opened by the user 2026-10-17 (ADR-557)**

Its 33 REQs moved to `REQUIREMENTS.md` word for word (REQ-324 with the user's answer beside it, ADR-559).

---

## Phase 4 — Back-Office Web App (Netlify) 🔒 gated

**Carried from Phase 1** *(ADR-371)*
- [ ] **REQ-124b** *(part proven 2026-10-05, ADR-346: the boundary flag, the zone and map version attached, in no zone flagged, AC-06-42…45 at the domain; the worker writes them, 1.5.9; a new version reprocessing, and the imports, are still to come)* Project map (boundary + zones): a collection's end GPS, or a unit rate event's GPS, outside the boundary is flagged; the worker attaches the zone it lies in and the map version used; in no zone → flagged; maps come in by upload (shapefile, GeoJSON, KML) or an Esri layer link, as dated versions; a new version reprocesses un-invoiced tickets. *(ADR-135, 141)* — *what Phase 1 delivered (ADR-371): the map as dated versions, never edited, AC-01-59 (database); the boundary flag, the zone and map version attached by the worker, in no zone flagged, AC-06-42…45 (domain, story `p1-reconciled`); a new version worked by the next run (story `p1-left-out`). Left: the imports (shapefile, KML, an Esri layer link; GeoJSON is taken today) and the job that queues the reprocess (Phase 2, REQ-206).* *2026-10-12 (task 2.6.4 part 5, ADR-484, 485): a zipped shapefile (converted from its `.prj`) and a GeoJSON file are taken by the server, whole, up to 16 MiB, and a map version or a site's shape loaded from one, the file kept (`map-files.test.ts`); left for Phase 4: ~~KML, an Esri layer link, and~~ the screen.* *2026-10-14 (the user, ADR-523): KML and an Esri layer link moved to Phase 2, task 2.8.5 (REQ-213).* *2026-10-15 (task 2.8.5, ADR-527, 528): built at the API: a KML file and a KMZ are a map's file; an Esri feature layer fetched as GeoJSON in WGS84, kept as a version naming its layers, "Refresh from Esri"; a site's shape from either. Left for Phase 4: the screen, and the preview on a map before a load.*

**Carried from the API's security checklist** *(task 2.7.3, ADR-514; `spec/CHECKLIST-API.md`, the ASVS 5.0 items named)*: the exports write a cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return as text (1.3.3, REQ-412); each web app on a hostname of its own, apart from the API's (3.5.4, with REQ-517); a person sees their own sessions and ends one, an endpoint and its screen (7.5.2). The web apps' own items (3.2.x, 3.4.3, 3.4.5, 3.4.6, 3.5.5, 3.7.x, 6.2.6, 6.2.7, 7.4.4, 14.3.3) are the checklist's, by THREAT-MODEL §6.

- [ ] **REQ-401** Onboarding flow in the real order: select-or-create client → declaration event → project (program type, settings, map) → then contractors and contracts, forms and debris types, pay items (a rate per prime, "Pays when"), sites, rules, certifications and ROEs in any order; the setup check; a firm library and copy from a past project. *(`adms-ticket-workflows` §4.0, ADR-023, 228, 229)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-402** Contractor and contract management (`PRIME` / `SUB`).
- [ ] **REQ-403** Certification intake: the form's fields, measured boxes and computed capacity (`adms-certifications` §3A.3/§3A.8), crew certs, photos, QC step. **No placard or badge printing**: firms have their own. *(ADR-045/080/088)*
- [ ] **REQ-404** Rule builder per `spec/RULES.md`: a rule per form naming one contract; criteria picked or typed as its §4 table says, with the §4a operators; actions *Add transaction #n* (a pay item), *Remove transaction #n*, *Void ticket*; Active, Is valid (§7), Show matches, Reprocess; the pay item screen's "Pays when" writing its own rules; an exact duplicate of a rule refused on save, with an error naming the rule it copies. *(ADR-109, 118, 125, 229, 239, 301; revised 2026-09-29, ADR-247)*
- [ ] **REQ-405** **One review queue**: flags grouped by cause; correct, renumber, void with a reason, accept a flag, QC, unlock, with bulk actions; photos reviewed inside the ticket; pending tickets listed, never aged. *(ADR-051, 053, 166, 228)* *(revised 2026-09-29, ADR-247)*
- [ ] **REQ-405a** **Quarantine resolution UI** — show every record sharing a ticket number side by side with the evidence a reviewer deduces from (cert number, load/disposal times, GPS, zone, photos), and offer the audited ticket-number correction. *(`adms-exceptions` §4.3a, ADR-020)*
- [ ] **REQ-406** Financial ledger views; lock/unlock QC Approved tickets as invoiced, optionally in named **invoice batches** (no invoice record, ADR-228); **data exports** the back office uses to assemble the client package by hand. The system does not generate the package. *(ADR-057/061/088)*
- [ ] **REQ-408** Read-only web access for clients, contractors and auditors to their own projects' tickets and reports. *(ADR-050)* — *Phase 2 built the reads (ADR-434, 435) and their sign-in (ADR-408, 412). ~~**Added at Phase 2's exit (ADR-518)**~~ **The setting itself is Phase 2's again, REQ-215 (ADR-519); the portal shows it here. It was: the firm chooses whether read-only viewers must use two-step** (the user, ADR-511: "let the firm choose"; shipped default optional; ASVS 6.3.3): a firm-wide setting with its record, guard and audit, an admin's endpoint to change it, and a viewer with none set up sent to set one up at their next sign-in (C157).*
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
- [ ] **REQ-517** The shipped **demo deploy**: Railway (API, worker, Postgres, **the routing server and the address server**, each with the project region's map extract, private to the API and the worker: REQ-022's other half, ADR-282, 287) + Netlify (web apps), documented, passing the scenario suite and load tests; **the back office calls the API through a same-origin proxy path** (`/api/*` rewritten to the API, ARCHITECTURE §4), so its cookies stay first-party (moved from REQ-204, ADR-512). Firms host in their own cloud and may extend it. *(ADR-099; re-scoped 2026-09-25)* **From the API's security checklist** *(task 2.7.3, ADR-513, 514; `spec/CHECKLIST-API.md`, the ASVS 5.0 items named)*: every container hardened, the proxy included (4.2.1, its local half in 2.7.3 part 5); the deploy's cipher suites (12.1.2); the image holds the built code and its dependencies only, no source control or tests (13.4.1, 15.2.3); no CDN or cache keeps a sensitive answer (14.2.2); each web app on its own hostname (3.5.4); how quickly a dependency's fix is taken up, in the operator's guide (15.1.1, 15.2.1); logs where only the operator reads them (16.4.2), sent to a separate system (16.4.3); publicly trusted certificates (12.2.2); a malware scan of uploads the firm may add (5.4.3, an accepted risk until then); a key replaced in place with its data re-sealed, in the operator's guide: the signing secret (each hash and seed re-made under the new one, the old kept beside it until then) and each service's password, without a new installation (11.2.2, ADR-515); and before 2031, when NIST SP 800-131A Rev. 3 (draft) disallows HMAC-SHA-1 generation, an authenticator's algorithm read again: the apps' support then (Microsoft Authenticator took SHA-1 alone on 2026-10-14) and a way to move each person to SHA-256 at their next setup (11.4.1, ADR-516). The deploy's object store with its own servers closed as the local stack's are (ADR-525, C167): a SeaweedFS the firm runs as `server` on its loopback behind TLS, or its gRPC under `security.toml`'s mutual TLS; the operator's guide says which.
- [ ] **REQ-518** **HHW trail** (KD-30; design not yet discussed). The user's account (Q-186, ADR-193): at an HHW site a trailer pulls up, the items are taken off and prepared for disposal, loaded onto another container and disposed of elsewhere; once they leave, the firm gets back a **receipt from the company that prepared them**, noting they were disposed of, **uploaded and saved like a contract's signed copy** (a PDF online). "HHW basically has to be broken down into its parts." When it is designed, the behaviour it needs becomes a built-in value in a release, with an ADR (ADR-194); the HHW site option is gone (ADR-215).

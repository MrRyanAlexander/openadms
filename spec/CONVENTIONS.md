# Open ADMS — Names, codes and examples

> **Agent default (ADR-234, ADR-235, ADR-236, ADR-237), 2026-09-29.** This page is the naming pass (`BACKLOG.md`
> 0.2b.1), done at the user's word; the user may overturn any name. It **decides what things are
> called**, not what they do: what a thing *is* stays with the newest ADR, `agent_store/SUMMARY.md`
> and the skills. It replaces `development/Open_ADMS_Initial_Conventions.md` as the place agents
> take names from; that file stays in `development/` as read-only background, and §8 says what we
> took from it and what it gets wrong.

← [Index](INDEX.md)

**Why this page exists.** User, 2026-09-29, verbatim: "we need to make sure that in all of the final
docs we share and code we create that references to examples are not cookie cutter to what is in the
QUESTIONS and elsewhere.. So when the agent encounters examples like 1A Hanger or 1B Leaner, those
already provided examples of servide codes or Service names or Service descriptions, whereever they
may appear need to be modified. We also do not want to use the same naming conventions for things
like Services or anything that is not clearly idetified by keyword."

---

## 1. The two rules

1. **Names.** Use the industry's keyword where one exists (FEMA, the USACE work statement, the
   contract: *load call*, *TDSR*, *ROE*, *haul-out*, *tipping fee*, *CY*). Otherwise use plain English.
   **Never copy a legacy product's screen label** (the legacy app's "Services", "Service
   Classifications", "Document Formats", "Locations", "Special Classes", its rule-editor buttons). In a
   few places this takes us back to our own earlier words (debris type, payable type, site type).
   **Pay item** (ADR-237) and **field event** (ADR-236) are the user's later calls.
2. **Examples.** Every doc we share, every test, seed, fixture and demo uses **the example world**
   (§6) and the **pay item code convention** (§5). It never uses the **retired examples** (§7).
   `spec/QUESTIONS.md`, `agent_store/DECISIONS.md` and `spec/FROM-BUILD-1.md` keep them, because they
   are the record and the user's words are never edited. Everywhere else they are replaced: in a
   skill or a spec page when it is rewritten, and at once in a new page or in code.

**Reading history.** Older ADRs, questions and quotes use the old words and codes. Read them through
§2 (old word → today's word) and §7 (retired example → its stand-in). Never copy them forward.

---

## 2. Renamed (old word → what we say now)

| Old word (where it came from) | Say now | In code | Why |
|---|---|---|---|
| **Service** (legacy "Project Service", ADR-206), then **service code** (ADR-234) | **pay item** | `PayItem` | The public-works word for this row: an item's code, description, unit and unit price (the USACE work statement's "CLIN/Pay Item"). Pairs with *payable type*; ends "the service code's code". The user's pick (ADR-237). Only the name changed: pay items and rules stay separate records (ADR-229's merge stays withdrawn) |
| `service_code`, the string on a Service | the pay item's **code** | `PayItem.code` | One name for the record, one for its field |
| a load's **half** / **halves**, a ticket half, a lone half | a **field event** (a collection event, a disposal event…); an **unpartnered event** | `FieldEvent` | What each monitor records is one event under the ticket number (ADR-236) |
| **Classification** (legacy "Service Classification", ADR-207) | **payable type** | `PayableType` | ADR-173's own word. Seeded from USACE's umbrella debris types (§4) |
| **debris class** (legacy "Debris Classes", ADR-211/214) | **debris type** | `DebrisType` | FEMA/USACE keyword; ADR-233 says they are one thing |
| Is Reduced / Reduction Method / Is Disabled (on a debris class) | **Reduced** / **reduction method** / **Hidden on phones** | `reduced`, `reductionMethod`, `hiddenOnPhones` | Reduction method is a keyword; the others are plain |
| **Special Class** (legacy, ADR-216/218) | **field tag** | `FieldTag` | Plain: an optional mark the collecting or unit rate monitor picks from the project's list |
| Document Format (legacy) | **form** (already ours) | `Form` | The user's "everything is a form" |
| Location / **Location Type** (legacy) | **disposal site** / **site type** | `DisposalSite.siteType` | ADR-190's word; USACE site roles |
| Allow Disposal (site box) | **Takes loads** | key `TAKES_LOADS` | Plain |
| Allow Collection (site box) | **Haul-outs leave here** | key `HAUL_OUTS_LEAVE` | Plain |
| Disposal Fee (site box), the fee Service | **Charges a tipping fee**; the site's **tipping fee** pay item | key `TIPPING_FEE` | Industry keyword |
| Ineligible (site box) | **Ineligible site** | key `INELIGIBLE` | Plain |
| measure min / max (a Service's band) | **size band** (from, to) | `bandFrom`, `bandTo` | Plain |
| force unit count to 1 | **Count is always 1** | `countIsAlwaysOne` | Plain |
| require GPS / require measurement | **GPS required** / **Measurement required** | `gpsRequired`, `measurementRequired` | Plain |
| use decimal accuracy | **Decimals allowed** | `decimalsAllowed` | Plain |
| use eligibility flag | **Monitor may mark ineligible** | `monitorMayMarkIneligible` | Says what it does |
| Rule actions *Create Transaction #n* / *Delete Transaction #n* / *Void Ticket* | ***Add transaction #n*** / ***Remove transaction #n*** / ***Void ticket*** | `ADD_TRANSACTION`, `REMOVE_TRANSACTION`, `VOID_TICKET` | Plain; not the legacy buttons |
| Rule screen *Is Valid* / *Get Statistics* / *Reapply* | ***Check*** / ***Show matches*** / ***Reprocess*** | | Plain |
| Criterion *Load Location* | ***Collection address*** | | Says which end |
| Criteria *Debris class*, *Special class* | ***Debris type***, ***Field tag*** | | Follow the renames |
| Field buttons "Get GPS", "Get address info" | **Capture GPS**, **Look up address** | | Plain |
| Billing unit keys `TON`, `EACH` | `TN`, `EA` (§4) | | USACE unit abbreviations |

**Field events** (ADR-236). A ticket is its **number and the events recorded under it**. Say
**field event**, or its kind: **collection event** (`COL`), **disposal event** (`DIS`), **haul-out
collection event** (`HOC`), **haul-out disposal event** (`HOD`), **unit rate event** (`URT`). The
completed load and haul-out (`CLT`, `CHO`) are **not events**: the system concludes them from the
events. **Never write a bare "event"** where a reader could take it for the disaster: the disaster is
always the **declaration event**, in full, and in code `DeclarationEvent` vs `FieldEvent`.

**Kept as they are** (keywords, or already ours): client, declaration event, project, program type,
contractor, prime, sub, contract, certification, cert number = placard = badge, load, collection,
disposal, completed load, haul-out, unit rate ticket, kind of work, crew time, load call, scale
receipt, TDSR/DMS, FDS, transfer station, ROE, pre-work and post-work survey, incident, citizen
drop-off log, project boundary, zone, mileage, rule, criteria, actions, transaction (the ledger line
only), audit log (`AuditRecord`), the statuses `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID`, QC
Review · QC Approved · QC Issues · QC Void, flag, accept, correct, renumber, void, reprocess, invoice
lock, invoice batch, client package, master passcode, phone **setup**, installation, Monitor ID, TBN,
the type labels `COL` `DIS` `CLT` `HOC` `HOD` `CHO` `URT`, time clock.

**New words (ADR-240, 241):** a phone is **enrolled** once (`Device`); a person's day of work is an
**assignment** (`Assignment`: planned from the **dispatch board**, or **unplanned**, made on a phone
with the master passcode); a phone's lists carry a **setup version**; the time clock's rows are
**clock entries** (`ClockEntry`) and a manager's **approved day**. Say "time clock" for workers' own
hours and "crew time" for a unit rate ticket's item hours: never mix the two.

---

## 3. Names in code

For code we create (ARCHITECTURE §18). Each is an agent default unless an ADR already says it.

- **Prisma models** are PascalCase and singular (`PayItem`, `DebrisType`, `DisposalSite`,
  `Certification`), with fields in camelCase. **Tables and columns are snake_case** through `@@map` /
  `@map` (`pay_item`, `disposal_site_id`).
- **Field events** (ADR-236, an agent default `spec/DATA-MODEL.md` may refine): one `FieldEvent`
  model with a `kind` key, `COLLECTION` · `DISPOSAL` · `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` ·
  `UNIT_RATE` (displayed `COL` `DIS` `HOC` `HOD` `URT`), shared columns for what every event records
  (project, workflow, bare ticket number, split suffix, monitor, device, cert, site, times, GPS) and
  kind-specific columns checked by the kind. The system's records drawn from events are
  `CompletedLoad` and `CompletedHaulOut` (never `LoadTicket` / `HaulOutTicket`).
- **Built-in keys and closed sets** are UPPER_SNAKE (`TAKES_LOADS`, `MANUAL_REVIEW`, `ADD_TRANSACTION`).
  Code tests the key, never the name (`spec/LISTS.md`, ADR-194).
- **No unclear abbreviations**: `disposalSiteId`, never `dsId`; `collectionEndedAt`, never `collDt`.
  Keywords are fine (`roeNumber`, `tdsr`).
- **Say which end**: `collectionLatitude`, `disposalEndedAt`, `disposalSiteId`. Never a bare
  `location` or `time`.
- **Three kinds of identifier, never mixed up.** An **internal ID** (UUIDv7, made on the phone for
  field records, so a retried sync is the same record, KD-56) is the key. A **business number** is
  what people read and scan: ticket number, cert number, Monitor ID, ROE number. It is never a key.
  A **display label** (`CLT`, `-A`) is never stored as part of a number (ADR-062).
- **API**: REST with plural kebab-case nouns (`/pay-items`, `/disposal-sites`), and actions as
  sub-resources (`POST /tickets/{id}/void`). JSON fields are camelCase, the same types end to end
  (`packages/contracts`).
- **Files** are kebab-case, classes PascalCase, functions camelCase.
- **Time** is stored in UTC and shown in the project's time zone (ADR-100). Exports use ISO 8601 with
  the offset. Printed receipts, PDFs and reports use `12-Oct-2026 14:35` (24-hour, the USACE work
  statement's format).
- **"Transaction"** means only the ledger line. Never use it for a ticket or a sync.

---

## 4. Units and payable types

**Billing unit keys** (fixed in code, `spec/LISTS.md` Group 2):

| Key | Label | Quantity |
|---|---|---|
| `CY` | Cubic yard | capacity × load call; split shares; stump and fill CY |
| `TN` | Ton | the scale weight, apportioned where a tandem shares it |
| `EA` | Each | a count (hangers, leaners, stumps, white goods removed) |
| `LB` | Pound | HHW pounds |
| `HR` | Hour | crew time, per hour |
| `CREW_DAY` | Crew day | crew time ÷ the pay item's day length, or its steps |
| `TBN` | To be negotiated | bills nothing until a rate is agreed |

**Payable type seeds** (a firm list, ADR-173; the firm renames, archives and adds): USACE's twelve
umbrella debris types, **C&D · Vegetative · Metals · Concrete · White Goods · Titled Property (vehicles
and vessels) · HHW · RACM · Soil · Leaners · Hangers · Stumps**, plus **Crew time** and **Tipping fee**.
A firm adds what its contract needs (e.g. *Stump fill*, *Freon recovery*). Exported as the type column,
so exports line up with USACE's general debris type without a USACE mode (ADR-077).

---

## 5. Pay item code convention

**A default, never forced.** The firm may type any code its contract uses (ADR-147 stands: setup
takes any string). But Open ADMS now **offers a published standard**, as the user first asked for in
Build 1 (`spec/FROM-BUILD-1.md` §6: "Make up a standard we can use over and over on projects and
publish so others can adopt it easily"). Setup suggests a code from it. Every example, seed and test
uses it. This amends ADR-109's "no convention" (ADR-235).

**The code:** `TYPE-WORK-UNIT[-DETAIL]`, in capital letters, digits and hyphens, at most 24
characters.

| Part | Values |
|---|---|
| **TYPE**: what is paid for | `VEG` Vegetative · `CD` C&D · `MIX` Mixed · `MULCH` · `ASH` · `METAL` · `CONC` Concrete · `WG` White goods · `HHW` · `SOIL` · `TREE` Hazardous trees · `HNG` Hangers · `LNR` Leaners · `STP` Stumps · `CREW` Crew time · `TIP` Tipping fee |
| **WORK**: what was done | `HAUL` a load, curb to site · `HO` a haul-out · `RDC` reduction and site management at a TDSR · `RMV` removal (unit rate) · `FILL` a stump hole filled · `FRN` freon recovered · `TIME` crew time · `FEE` a site's fee · for trees priced by method, the method (`CLIMB`, `MECH`, …) |
| **UNIT** | a billing unit key (§4) |
| **DETAIL**: only when needed | a distance band's top mile (`15` = up to 15.0 mi) · a size band's top inch (`24` = up to 24 in) · a site's short code (`BCL`) · a place (`OUT` = outside the county) · a state (`STG` = staged) |

**The name** is what people read on screens, receipts and exports. It is short and readable, with the
program where the firm runs more than one: "ROW VEG haul 0–15 mi", "Leaner removal 6–24 in", "Tipping
fee, Bayline County Landfill". **The description** carries the contract's own words and line number
("Line 3: vegetative debris, curbside pickup and haul, 0–15 miles"), so every rate traces back to the
contract.

**The example set** (also the golden mission's, `spec/golden/MISSION.md` §1):

| Code | Name | Payable type | Unit |
|---|---|---|---|
| `VEG-HAUL-CY-15` / `VEG-HAUL-CY-30` | ROW VEG haul 0–15 mi / 15.1–30 mi | Vegetative | CY |
| `VEG-HAUL-TN-15` | ROW VEG haul 0–15 mi, by weight | Vegetative | TN |
| `CD-HAUL-CY-15` | ROW C&D haul 0–15 mi | C&D | CY |
| `MULCH-HO-CY` / `MULCH-HO-TN` | Mulch haul-out to FDS / by weight | Vegetative | CY / TN |
| `TIP-FEE-CY-BCL` / `TIP-FEE-TN-BCL` | Tipping fee, Bayline County Landfill (per CY / per ton) | Tipping fee | CY / TN |
| `HNG-RMV-EA` | Hanger removal | Hangers | EA |
| `LNR-RMV-EA-24` / `LNR-RMV-EA-99` | Leaner removal 6–24 in / 24.1–99 in | Leaners | EA |
| `STP-RMV-EA-36` / `STP-RMV-EA-48` | Stump removal 24–36 in / 36.1–48 in | Stumps | EA |
| `STP-FILL-CY` | Stump hole fill | Stump fill | CY |
| `WG-RMV-EA` | White good removed | White Goods | EA |
| `WG-FRN-EA` / `WG-FRN-EA-STG` | Freon recovered / Freon staged ($0) | Freon recovery | EA |
| `CREW-TIME-HR` | Crew time, skid steer crew | Crew time | HR |
| `VEG-HAUL-CY` | PPDR VEG haul (one rate) | Vegetative | CY |

---

## 6. The example world

One made-up mission for every doc, test, seed and demo, the same one the golden mission tells in
full. Draw every example from it. Add to it where you need more, and record the additions here.

| What | Example |
|---|---|
| Firm (installs Open ADMS) | **Gates Disaster Recovery**. Back office: Dana Reyes (admin), Luis Ortega (manager/analyst) |
| Client and client user | **Bayline County**; its debris manager has a read-only login |
| Declaration event | **Hurricane Delphine**, `DR-9001-FL` (fictional) |
| Projects | **P1** "Bayline County ROW, Hurricane Delphine" (ROW); **P2** "Bayline County PPDR, Hurricane Delphine" (PPDR, ROE required) |
| Primes and subs | **Coastline Haulers LLC**, sub **Rivera Trucking**; **Summit Debris Services**, sub **Pinewood Hauling** (the second prime, for two-prime examples) |
| Contracts | "Coastline, Bayline ROW 2026"; "Summit, Bayline ROW 2026"; "Coastline, Bayline PPDR 2026" |
| Sites | **Marsh Road TDSR** (TDSR/DMS: takes loads, haul-outs leave here) · **Bayline County Landfill** (Final Disposal: takes loads, charges a tipping fee, short code `BCL`) · **Bayline Transfer Station** (Transfer Station: takes loads) · **Old Quarry Pit** (Other: an ineligible site) · **Cypress Creek Landfill** (Final Disposal: takes loads, no tipping fee, short code `CCL`; it has a scale house and mulch hauled there is paid by the ton, scale receipt `CCL-51207`; added 2026-10-01 for the golden mission's weighed split haul-out, ADR-297) |
| Forms and debris types | P1 load form: Vegetative, C&D. P1 haul-out form: Mulch (reduced, grinding). Field tag list: Mixed; and Zone 1 pile, Zone 2 pile, Zone 3 pile (a TDSR's piles, for the split haul-out example; added 2026-10-01, ADR-295) |
| Certifications (series from `730415`) | `730415` Coastline dump trailer 65 CY · `730416` Rivera self-loader 48 CY · `730417` Coastline bucket truck crew · `730418` Coastline skid steer crew · `730419` Coastline walking floor 110 CY · `730421` Coastline tandem truck body 30 CY and `730422` its trailer 40 CY (added 2026-09-29 for the tandem example, `adms-scale-receipts`) |
| Monitors | Ana Brooks `M004127` · Kim Nguyen `M004128` · Tariq Patel `M004129` · Jo Kim `M004130` · Sam Grant `M004131` · Lee Morgan `M004132` (added 2026-10-01, ADR-297) |
| Monitoring sub (an employer of monitors) | **Harbor Staffing**, a temp agency; its own ID for Kim Nguyen is `HS-0417` (added 2026-10-01 for the employer example, ADR-281) |
| Phones | `P1-COL-1` · `P1-TWR-TDSR` · `P1-TWR-LF` · `P1-HO-TDSR` · `P1-TWR-CCL` · `P1-UR-1` · `P2-COL-1` · `P2-TWR-TDSR` (the golden mission's dispatch board) |
| Master passcode (tests and stories only) | `heron-marsh-delphine`, made up; no installation uses it (added 2026-10-01, ADR-281) |
| Ticket numbers | P1 loads `101001`…; haul-outs `201001`… (a split haul-out: `201004-A`, `201004-B`, `201004-C`, with split loads allowed on P1 for the example; added 2026-10-01, ADR-295; dumped and weighed at Cypress Creek Landfill, 24.00 tons, ADR-297); unit rate `301001`…; P2 loads `102001`… (a split: `102001-A`, `102001-B`); ROEs `R-0007`, `R-0008` |
| Addresses | 14 Heron St, 40 Birch Ln, 22 Elm St, 412 and 416 Cedar Ct |

**Flag messages built from it** (the style; `spec/FLAGS.md` owns the wording, ADR-290):
- "Ticket 101008: debris type mismatch. Flagged for review."
- "Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review."
- "Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review."
- "Ticket 101011: dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this
  project gives it one. Flagged for review."
- "Ticket 101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight. Flagged for
  review."
- "Pay item VEG-HAUL-CY-15 has no rate for Summit."
- "Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced."

---

## 7. Retired examples: never reuse them

They stay in the history files as the user's words. Anywhere else, use the stand-in.

| Retired | Came from | Use instead |
|---|---|---|
| **Digit-and-letter codes**: `1A`, `1B`, `2A`, `2B`, `2C`, `3A`, `4A`, `6A`, `7A`, `8A`…, `12`, `40`, `54A`, `56A`, `56B`, `90A`, `99A`, `P1A`, `V1`, and codes with a contractor tag (`V1-CRS`, `3A-TFR`, `2A-CRS`) | the legacy screens, `spec/QUESTIONS.md`, `FROM-BUILD-1.md` §6, the first golden draft | §5 codes |
| Service names "Bobs 1A Hanger", "Toms 1B Leaner", "6A - OPERATION OF TDMA", "2A ROW Vegetative" | the same | §5 names |
| Contractors Bobs, Toms, TFR, Ceres (CRS); the contract "FDEP - TFR - Hurricane" | the same | Coastline, Summit, Rivera, Pinewood; §6 contracts |
| Alachua County; the Alachua/Ceres rate sheet's names | `spec/RATE-SHEET.md` (a real contract) | Bayline County, Coastline. The sheet's *shape* (distance bands, per CY and per ton, size bands) is still a good pattern |
| Charlotte County Landfill, Hwy 20 TDSR, Private pit, Don Pedro, Oak Ave | `spec/QUESTIONS.md` | §6 sites and addresses |
| "BDR Load Ticket", "Marine based – Veg/Woody" | the legacy screens | "P1 load form"; the firm's own debris types |
| Monitor IDs `M003490`…`M003494`; cert numbers `610810`…`610814` | `FROM-BUILD-1.md`, the first golden draft | `M004127`…; `730415`… |
| Ticket numbers `104499`, `10477`, `10092`, `30551`, `30552`, `0002` | QUESTIONS and SUMMARY flag examples | §6 numbers and flag messages |
| `DR-4673-FL`, "DR-4879 Greene County" | `adms-domain`, `FROM-BUILD-1.md` §9 | `DR-9001-FL`, Bayline County |
| "Sweeps Away Recovery" | `development/Open_ADMS_Initial_Conventions.md` | Gates Disaster Recovery |

The formats stay: a Monitor ID is `M` + six digits, and a cert series starts from a number that
doesn't look made up (ADR-102). Only the example values change.

**Check** (run on any page or code you write). Outside a History section it should print nothing but
a citation of a real source document (`spec/RATE-SHEET.md` names the contract it walks) or a line
that lists what is retired:

```bash
retired='\b(1A|1B|2A|2B|2C|6A|7A|7B|8A|8B|8C|54A|56A|56B|90A|99A|P1A|V1)\b|`(3A|4A)`|(3A|4A)-|\bBobs\b|\bToms\b|\bTFR\b|Ceres|Alachua|Charlotte County|Hwy 20|Private pit|Don Pedro|Oak Ave|OPERATION OF TDMA|BDR Load|M00349[0-4]|61081[0-4]|104499|DR-4673|Greene County|Sweeps Away'
old='\bServices\b|\bService( [^cC]|[^ a-zC]|$)|Classification|[Dd]ebris class|Location Type|Allow (Collection|Disposal)|Disposal Fee|Special Class|Create Transaction|Delete Transaction|[Ss]ervice codes?|ServiceCode|\bhalves\b|ticket half|lone half'
grep -nE "$retired" <file>
grep -v '^> \*\*User' <file> | grep -nE "$old"   # a user quote keeps its words; "the legacy 'Service'" is fine
```

(`3A` and `4A` only count in code form: bare, they are also section numbers, `adms-certifications`
§3A and `adms-field-app` §4A.)

---

## 8. From `development/Open_ADMS_Initial_Conventions.md`

The user had another agent draft that file from the USACE work statement (Section C, November 2025)
and the Alachua/Ceres rate sheet. The user: it "has some errors and is missing some key details about
how you know the ADMS needs to operate, but it lays out a solid groundwork for the renaming and makes
us pivot back in a few places." The ADRs win where they differ (KD-63).

**Taken from it:**
- Names come from the contract and the industry before internal shorthand, and screens speak the
  field's language (§1).
- Snake_case in the database, no unclear abbreviations, names that say which end (§3).
- An internal ID, a business number and a display label are three different things (§3).
- Debris is typed on two levels: the contract's **debris type** and a general **payable type**
  seeded from USACE's umbrella list (§4).
- USACE unit abbreviations (`CY`, `TN`, `EA`) (§4).
- A keyword **pay item code** convention, taking us back to the user's own Build 1 ask (§5).
- "Transaction" only for the ledger line.
- Mileage says how it was measured: the road route, or a flagged straight line (ADR-163).
- Business status and sync state are kept apart, and a sync retry is never a second record (KD-56).
- Evidence is never overwritten; a correction keeps the prior value (ADR-051).
- REST nouns; UTC plus the project's time zone; the report date format (§3).
- Every price traces back to the contract line (the description, §5) and to the rule that made it.

**Where it's wrong for Open ADMS** (doc section → what's decided):

| The doc says | Open ADMS |
|---|---|
| Mission → Task Order → CLIN/Pay Item (§4, §41, §73) | Client → declaration event → project; a contract is a name, a prime and a link. A USACE task order is set up as a project, its CLIN goes in a pay item's description (ADR-023/026/146) |
| Ticket numbers with a mission prefix, `SAR-001284` (§7) | Bare numbers per project and workflow, 100,001–9,999,999; `COL`, `CLT`, `-A` are display only (ADR-046/062) |
| Statuses ELIGIBLE · INELIGIBLE · VOID, and a DRAFT → ISSUED → RECEIVED lifecycle (§8, §44) | `PENDING` · `COMPLETED` · `MANUAL_REVIEW` · `VOID`; QC status is separate; ineligible work is a flag (ADR-060/107/210) |
| "Vehicle certification"; the vehicle is the identity (§17–§19) | A certification certifies a **container or a crew, never a vehicle**; cert number = placard = badge; capacity only by `adms-certifications` §3A.3 (ADR-015/045/076) |
| HARD BLOCK in the field, e.g. an uncertified truck (§90) | **Flag, never block** (ADR-052, invariant 19) |
| A separate Disposal Site App (§59–§60; its §104 corrects this) | One field app; a phone holds one assignment at a time: one project, its work, one site where it works at one (ADR-095/195/240) |
| A "Mission Package" that devices are "provisioned" with (§62, §124) | A phone is **enrolled** once and gets its lists with the day's **assignment** (ADR-095/151/240); never "provisioned" |
| A `load_id` UUID in a signed QR "handoff artifact"; a "Recovery Mode" (§105–§114) | The two events pair on the **bare ticket number**, printed as the barcode and scanned at the tower. A typed number is flagged with a reason, and a reviewer renumbers (ADR-019/111/051) |
| A "Receiving Receipt" record; receipts ACCEPTED · REJECTED · CONDITIONALLY_ACCEPTED (§69–§70, §108) | The disposal is a field event, not a receipt. A refused load isn't recorded (ADR-155). "Receipt" means the printed paper, never a record (Q-95), or an FDS scale receipt |
| Material lineage, processing batches, Material Flow Rules, an expected destination (§116–§123) | Not modelled. A haul-out is its own load leaving the TDSR; the system checks where debris went, never where it was headed (ADR-205/226) |
| Versioned Rate Books with approval states; never recalculate history (§74, §79, §81, §86) | Transactions are regenerated for un-invoiced tickets; each removed line is copied to the audit log first; the invoice lock freezes; a dated rate change is the firm's own *Ticket date* rule (ADR-085/090/147/228) |
| A Rate Determination record with UNMATCHED · AMBIGUOUS states (§78) | Flags ("no rule created anything", two adds to one #) and the rule named on each transaction (ADR-118/212) |
| Pricing methods and "included work" flags (§75, §85) | The firm's pay items and rules express them; nothing is hardcoded (ADR-197/202) |
| Sixteen roles, SYSTEM_ADMIN … READ_ONLY (§48) | Admin, manager/analyst with granted permissions, monitor, read-only viewer (ADR-050/169) |
| Person, role and mission assignment; credentials (§15) | A system Monitor ID plus an optional employer ID; the **assignment** (dispatch board) is the mission assignment, one person per day (Q-97, ADR-105, 240) |
| Crews as work-group records with personnel (§14) | A crew is its certification (ADR-228) |
| Eligibility status and eligibility decision records (§40) | Flags and QC; "Monitor may mark ineligible" on a pay item (ADR-210) |
| A full crew day is 12 hours (§30) | Crew time converts as its pay item says; the 12-hour flag is on crew hours only (ADR-084/087/100) |
| PPDR property stages and holds, LOADM export, live GIS feature services, crew check-in, 30 ft accuracy (§13, §31, §36) | Not in scope now: no USACE mode (ADR-077), exports only, no GPS accuracy check (ADR-083) |
| "Sweeps Away Recovery" as the firm | Any firm installs Open ADMS; examples use §6 |

**What it's missing** (and where it lives): the two witnesses and the load call (`adms-domain`
§1.2–§1.3); capacity math (`adms-certifications` §3A.3); rules per form with numbered slots
(`spec/RULES.md`); one pay item holding a rate for each prime (ADR-206); badge first, number last
(ADR-209); preloads, and an unpartnered event that never expires (ADR-053); splits shared by estimate
(ADR-162); one quantity per load (ADR-223); the setup check (ADR-229); the invoice lock and batches
(ADR-228).

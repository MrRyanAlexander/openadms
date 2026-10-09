# Open ADMS — Names, codes and examples

✅ **Approved**

> **Agent default (ADR-234, ADR-235, ADR-236, ADR-237), 2026-09-29.** This page is the naming pass (`BACKLOG.md`
> 0.2b.1), done at the user's word; the user may overturn any name. It **decides what things are
> called**, not what they do: what a thing *is* stays with the newest ADR, `agent_store/SUMMARY.md`
> and the skills. It replaces `development/Open_ADMS_Initial_Conventions.md` as the place agents
> take names from; that file stays in `development/` as read-only background, and §8 says what we
> took from it and what it gets wrong. **The user, 2026-10-06: "not approved yet; but mostly seems
> good"**; the "In code" column of §2 was filled and corrected against the schema that day, and
> the formats gathered under §3 (ADR-375). **The user then marked the page approved (the mark
> above; recorded 2026-10-06, ADR-378): the whole page, §8 with it, and KD-63 is closed.**

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
| **debris class** (legacy "Debris Classes", ADR-211/214) | **debris type** | `DebrisType` (the firm's list); on a form, `FormDebrisType` | FEMA/USACE keyword; ADR-233 says they are one thing |
| Is Reduced / Reduction Method / Is Disabled (on a debris class) | **Reduced** / **reduction method** / **Hidden on phones** | `FormDebrisType.reduced`, `.reductionMethodId` (the list `ReductionMethod`), `.hiddenOnPhones` | Reduction method is a keyword; the others are plain |
| **Special Class** (legacy, ADR-216/218) | **field tag** | `FieldTag` | Plain: an optional mark the collecting or unit rate monitor picks from the project's list |
| Document Format (legacy) | **form** (already ours) | `Form` | The user's "everything is a form" |
| Location / **Location Type** (legacy) | **disposal site** / **site type** | `DisposalSite`; `SiteType` (the list), `DisposalSite.siteTypeId` | ADR-190's word; USACE site roles |
| Allow Disposal (site box) | **Takes loads** | `DisposalSite.takesLoads` | Plain |
| Allow Collection (site box) | **Haul-outs leave here** | `DisposalSite.haulOutsLeaveHere` | Plain |
| Disposal Fee (site box), the fee Service | **Charges a tipping fee**; the site's **tipping fee** pay item | `DisposalSite.chargesTippingFee`; `DisposalSiteTippingFee` (the fee pay items) | Industry keyword |
| Ineligible (site box) | **Ineligible site** | `DisposalSite.ineligibleSite` | Plain |
| measure min / max (a Service's band) | **size band** (from, to) | `PayItem.bandFrom`, `.bandTo` | Plain |
| force unit count to 1 | **Count is always 1** | `countIsAlwaysOne` | Plain |
| require GPS / require measurement | **GPS required** / **Measurement required** | `gpsRequired`, `measurementRequired` | Plain |
| use decimal accuracy | **Decimals allowed** | `decimalsAllowed` | Plain |
| use eligibility flag | **Monitor may mark ineligible** | `monitorMayMarkIneligible` | Says what it does |
| Rule actions *Create Transaction #n* / *Delete Transaction #n* / *Void Ticket* | ***Add transaction #n*** / ***Remove transaction #n*** / ***Void ticket*** | `RuleActionKind`: `ADD_TRANSACTION`, `REMOVE_TRANSACTION`, `VOID_TICKET` | Plain; not the legacy buttons |
| Rule screen *Is Valid* / *Get Statistics* / *Reapply* | ***Check*** / ***Show matches*** / ***Reprocess*** | Screen labels (Phase 4); nothing stored. What *Check* shows is worked out by `RuleValidity` in `packages/domain`, which still says "Is valid" as `spec/RULES.md` §7 does | Plain |
| Criterion *Load Location* | ***Collection address*** | `RuleCriterionKey.COLLECTION_ADDRESS` | Says which end |
| Criteria *Debris class*, *Special class* | ***Debris type***, ***Field tag*** | `RuleCriterionKey.DEBRIS_TYPE`, `.FIELD_TAG` | Follow the renames |
| Field buttons "Get GPS", "Get address info" | **Capture GPS**, **Look up address** | Screen labels (Phase 3, the field app); nothing stored | Plain |
| Billing unit keys `TON`, `EACH` | `TN`, `EA` (§4) | `BillingUnit.TN`, `.EA` | USACE unit abbreviations |

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

**Formats, in one place** (added 2026-10-06, ADR-375; each is decided where the last column says,
this table only gathers them):

| What | Format | Example | Decided in |
|---|---|---|---|
| Internal ID | UUIDv7; made on the phone for anything a phone makes | | `spec/DATA-MODEL.md` §1 |
| Ticket number | Digits only, bare, from a series per project and workflow, 100,001 to 9,999,999; pre-printed control tickets keep the printer's own numbers | `101001` | DATA-MODEL, Numbering (ADR-046, 056, 062) |
| Split suffix | A hyphen and a letter, kept beside the number, never in it | `102001-A` | ADR-055, 062 |
| Type label | Three letters, display only, never stored in a number | `COL` `DIS` `CLT` `HOC` `HOD` `CHO` `URT` | §2 |
| Cert number (= placard = badge) | Digits, from the project's series or a pre-printed sheet; unique on its project | `730415` | `adms-certifications` |
| Monitor ID | `M` and six digits, issued by the database | `M004127` | DATA-MODEL §2.2 (ADR-281) |
| ROE number | From the project's series, written `R-` and four digits when a phone makes it; a paper one as typed | `R-0007` | DATA-MODEL, Numbering (ADR-323) |
| Pay item code | Capitals, digits and hyphens, at most 24 characters, `TYPE-WORK-UNIT[-DETAIL]`; the firm may type any other | `VEG-HAUL-CY-15` | §5 |
| Built-in key, closed set | UPPER_SNAKE | `MANUAL_REVIEW` | §3 |
| Money | A rate `decimal(14,4)`; an amount `decimal(14,2)`, to the cent, half up. Never a float | `$352.63` | DATA-MODEL §1 (ADR-268, 355) |
| Quantities | A line's quantity `decimal(14,4)`; a volume in CY to hundredths; tons to four places; a crew day to four places; hours to the quarter hour | `52.00 CY` · `17.1000 TN` · `9.75 h` | DATA-MODEL §1, §4, §5 |
| Measurements | Whole inches for a container; a diameter or circumference to a tenth of an inch | `360 × 96 × 72` · `24.0 in` | DATA-MODEL §1 (ADR-076, 177) |
| Coordinates | Latitude and longitude, WGS84, eight decimal places. Never a float | `39.09000000, −75.62000000` | DATA-MODEL §1 (ADR-005) |
| Mileage | Road miles, stored unrounded, compared in tenths | `6.2050` → 6.2 mi | ADR-125, 208 |
| Time | Stored UTC, shown in the project's time zone; exports ISO 8601 with the offset; print `12-Oct-2026 14:35` | | above (ADR-100) |
| Table, column / model, field | snake_case / PascalCase, camelCase | `disposal_site_id` / `DisposalSite.id` | above |
| API path / JSON field | Plural kebab-case / camelCase | `/pay-items` | above |

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

**A default, never forced.** The firm may type any code its contract uses: setup takes any string,
as long as no other pay item on the project already has it (**a code is unique on its project**,
ADR-301). But Open ADMS now **offers a published standard**, as the user first asked for in
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

**The description** is the pay item's only other text (ADR-301; there is no separate name): what the
work is, in the firm's own words, shown with the code wherever a pay item is listed or exported. The
examples keep it short and readable, with the program where the firm runs more than one: "ROW VEG haul
0–15 mi", "Leaner removal 6–24 in", "Tipping fee, Bayline County Landfill". The firm may write
whatever it wants there; nothing reads it.

**A rate that changes from a date** is a second pay item with a code of its own, the firm's choice
(ADR-301). The examples use `VEG-HAUL-CY-15-B`.

**The example set** (also the golden mission's, `spec/golden/MISSION.md` §1):

| Code | Description | Payable type | Unit |
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
| Sites' GPS, permits and P1's map (stand-ins on the pinned map extract, Delaware of 1 January 2026, ADR-282: Bayline County is made up, so its roads are the extract's; added 2026-10-02, ADR-311; moved onto the extract 2026-10-05, ADR-349…351; agent defaults) | Marsh Road TDSR 39.09000000, −75.62000000, permit `FDEP-DMS-2026-0117`; Bayline County Landfill 39.00000000, −75.58000000, permit `FDEP-SW-0098`; Bayline Transfer Station 39.16000000, −75.57000000, permit `FDEP-TS-2026-0412`; each active from 12 October 2026. P1's map: a boundary from 75.80° W to 75.40° W and 38.90° N to 39.30° N, in three zones, **Zone 1**, **Zone 2**, **Zone 3**, west to east (Zone 1 to 75.67° W, Zone 2 to 75.53° W); the file `bayline-row-zones-v1.geojson`, its zone name field `ZONE_NAME` |
| The addresses' GPS and the road miles between the example world's places (2026-10-05, ADR-349, 351; stand-ins on the same extract, agent defaults; **every fixture, test and story uses these points since task 1.5.8a, and none holds the older made-up points round 27.98° N, 82.40° W**) | **14 Heron St** 39.13850000, −75.55370000, in Zone 2; its nearest road point is 39.13844300, −75.55388800 and **6.2050 road miles** from Marsh Road TDSR's own GPS (ticket 101001's 6.2 mi). **Where ticket 101002 is collected** (the mission names no address): 39.15000000, −75.52000000, in Zone 3, road point 39.14989000, −75.51996400, **11.4419 road miles** from Bayline County Landfill's own GPS (its 11.4 mi). **22 Elm St** 39.15000000, −75.54000000, in Zone 2, 7.8200 mi from the TDSR. **40 Birch Ln** 39.17000000, −75.69000000, in Zone 1, 8.1665 mi from the TDSR. **412 Cedar Ct** 39.12000000, −75.56000000, 4.8283 mi from the TDSR, and **416 Cedar Ct** next door, 39.12020000, −75.56030000, 4.8495 mi (P2, which has no map). The TDSR to Bayline County Landfill 8.1167 mi (haul-out 201001), to Cypress Creek Landfill 13.9746 mi, to Bayline Transfer Station 7.2160 mi. **The tower at Marsh Road TDSR**, where a disposal there ends: 39.09030000, −75.62020000, 38 m from the site's GPS. A point no road is near, out at sea: 38.50000000, −73.00000000. The street names the address server gives are the real map's ("Wyoming Mill Road" at 14 Heron St's road point), not the example world's |
| What the setup story adds (2026-10-03, ADR-316; agent defaults) | **Cypress Creek Landfill** 39.24000000, −75.60000000, permit `FDEP-SW-0131`. **P1's forms:** Load, Haul-out, Unit rate, Incident, Drop-off log. **Capture settings:** a hauling, haul-out, fee, fill or freon pay item ticks none; a unit rate one a monitor picks (hangers, leaners, stumps) is *Count is always 1* with photos required, and *Measurement required* where it has a band; `WG-RMV-EA` photos required; `CREW-TIME-HR` per hour, decimals allowed, photos required. `STP-FILL-CY` and `WG-FRN-EA` have **no kind of work**: a rule adds them, no monitor picks them. **P2:** loads only; forms Load (Vegetative), ROE (GPS required) and Survey; Marsh Road TDSR entered again with the same GPS and permit; one rule, *Debris type = Vegetative* → Add #1 `VEG-HAUL-CY`; no map. **Who sets up:** Dana Reyes P1 on Thursday 8 October 2026; Luis Ortega, granted Setup, P2 on Friday 9 October |
| A second client | **Town of Egret Point**, with its own project "Egret Point ROW, Hurricane Delphine" under the same declaration event: for examples of one declaration event shared by two clients (added 2026-10-01 for the acceptance scenarios, ADR-300) |
| Setup records for the tests of steps 1–3 | Bayline County's contact: "Bayline County debris manager", phone `555-0100`, changed to `555-0142`. A local declaration: "Bayline County flooding, March 2026", reference `Res. 2026-17 (Bayline Co.)`, type Local. A later declaration event: "Tropical Storm Calder", `BC-EM-2027-01`, with "Bayline County ROW, Tropical Storm Calder" (one client, two disasters). A third Delphine project: "Bayline County PARKS, Hurricane Delphine". The firm's own program type: **MARINE** (added 2026-10-02 for the project's tests, ADR-303) |
| A firm's own form field | "Police report number" (text), added to P1's incident form (added 2026-10-01 for the acceptance scenarios, ADR-300) |
| What the certification scenarios add (2026-10-03, ADR-317; agent defaults) | **Who certifies:** Sam Grant `M004131`, assigned to certify on P1 on Saturday 10 October 2026, on `P1-HO-TDSR`, with Lee Morgan `M004132` assigned to P1 with him that day (the helper he picks). **A tier 2 sub:** **Tidewater Hauling**, under Rivera Trucking, under Coastline. **A pre-printed certification sheet's number:** `88120`. **A replaced certification:** `730420` replaces `730416` (sideboards added, 14 October 2026). **A copy on P2:** `880112`, copied from `730416` (`spec/FLAGS.md`'s number). **P2's own `730416`** (the user, ADR-318: a cert number is unique per project only): Rivera's self-loader, 48 CY, certified on P2 in its own right, the one ticket 102001 scans. The capacity examples' boxes are made up on `spec/acceptance/03-certification.md` itself; the boxes of `730415`, `730416` and `730419` are in the next row |
| The three containers' measured boxes (2026-10-03, ADR-320; made up, whole inches; the golden mission states only the capacities) | **`730415`** Coastline dump trailer: primary 360 × 96 × 72 = 2,488,320; box 1, Sideboards, a rectangle 360 × 96 × 16 = 552,960, added; total 3,041,280.00 cu in ÷ 46,656 = 65.19 → **65 CY**. **`730416`** Rivera self-loader: primary 264 × 92 × 96 = 2,331,648; box 1, Dog Box, a triangle (÷2) 36 × 92 × 48 = 79,488, subtracted; total 2,252,160.00 ÷ 46,656 = 48.27 → **48 CY**. **`730419`** Coastline walking floor: primary 576 × 96 × 93 = 5,142,528; box 1, Curved/Angled Sides/Floor, radius corners R 6, run 576, 2 corners = 8,916.48, subtracted; total 5,133,611.52 ÷ 46,656 = 110.03 → **110 CY** |
| What the certification records add (2026-10-03, ADR-321; made up, agent defaults) | **Vehicle types:** `730415` Hydraulic Dump Trailer, `730416` Self-Loading Truck, `730419` typed "Walking floor trailer"; the crews' types Bucket Truck and Skid Steer. **`730416`'s driver and tag:** Marco Rivera, licence `R160-542-80-112-0` FL to 31 March 2028, tag `RVT 4821` FL to 31 March 2027. **Certified** on Saturday 10 October 2026 between 09:10 and 10:50 on `P1-HO-TDSR`; P2's own `730416` on Sunday 11 October. **In the story `certification` only:** a Tidewater truck `730423` (36 CY as mistyped, 32 CY corrected: AC-03-51's boxes), a Summit truck on the pre-printed `88120` (28 CY), `730420` replacing `730416` (55 CY with its sideboards), its copy `880112` on P2, and `730425` with its sub typed "Rivera Trucking Inc" |
| What the capture scenarios add (2026-10-03, ADR-322; made up, agent defaults) | **Number blocks:** `P1-COL-1` holds `101001`–`102000` of P1's load series, `P1-HO-TDSR` `201001`–`202000` of its haul-out series, `P1-UR-1` `301001`–`302000` of its unit rate series; a tower's phone holds none. **A control-ticket project:** "Bayline County PARKS, Hurricane Delphine", its loads numbered from pre-printed stock, range `400001`–`405000`. **Ticket 101001's collection** was loaded from 08:20 to 08:40. **A load that carries stump tickets:** `101014` (the flag catalogue's). **An HHW ticket's items:** Paint cans 40 · Propane tanks 15 (pounds, entered as the count). **A back-office-created record's reason:** "Phone failed" (the flag catalogue's, on `101029`). **White goods ticket `301006`'s items** are `spec/RULES.md` §9's: Washer 2 · Dryer 1 · Fridge, freon recovered 2 · Fridge, no freon 1 |
| What ROEs and forms add (2026-10-04, ADR-327; made up, agent defaults) | **Property owners:** Rosa Delgado at 412 Cedar Ct (parcel `APN 14-0321-007`, ROE `R-0007`), Ben Whitaker at 416 Cedar Ct (`APN 14-0321-008`, `R-0008`). **A paper ROE typed in the back office:** `ROE 2026-0412`. **The incident's police report number** (the firm's own field): `BCSO-26-104417`. **The drop-off log's resident:** Carl Jensen, from 14 Heron St |
| What the sync scenarios add (2026-10-04, ADR-333; made up, agent defaults) | **The quarantine example** is `adms-exceptions` Scenario A's: Rivera's self-loader `730416`; collections `101020` at 22 Elm St (loaded by 09:40) and `101021` at 40 Birch Ln (loaded by 11:05), both Ana's on `P1-COL-1`; Kim's disposals at Marsh Road TDSR at 10:22 and 11:40, both scanned `101020`. **The lost phone's work:** `P1-TWR-LF`, marked lost at 6:10 pm on Monday 12 October, holds a disposal recorded at 5:40 pm and one at 6:30 pm, and syncs on Wednesday. **A phone that changes hands:** `P1-COL-1` passes from Ana to Sam on Monday afternoon with Ana's morning collections unsent. **A dropped sync:** 25 field events, cut after the twelfth |
| What numbering adds (2026-10-03, ADR-323; made up, agent defaults) | **Series starts:** P1's ROEs from `1` (an ROE number made on a phone is written `R-0007`); P2's loads from `102001`, haul-outs `202001`, unit rate `302001`, cert numbers from `730416`, ROEs from `1`; the PARKS project's unit rate tickets from `100001`. **More collection phones on P1:** `P1-COL-2` (holds `102001`–`103000`; lost on Tuesday 13 October, its block retired), `P1-COL-3` and `P1-COL-4`. **A reset:** `P1-COL-1` used `101001`–`101006` on Monday and is reset on Tuesday; `P1-COL-3` is cut `101007`–`102000`. **The PARKS project's unit rate phone:** `PARKS-UR-1`. In the story `certification` only, P2's cert numbers are seeded at `880112` |
| What the reconciliation scenarios add (2026-10-05, ADR-339; made up, agent defaults) | The flag examples' tickets are `spec/FLAGS.md`'s own (`101008`…`101035`, `201002`, `201003`, `301008`…`301021`, `102002`…`102005`). **A collection outside P1's boundary:** ended at 38.85° N, 75.60° W. **Disposals 250 m and 150 m** from Marsh Road TDSR's GPS, and P1's site circle changed to 300 m. **A close date** for Marsh Road TDSR: 30 November 2026. **A preload over the end of P1's window:** collected 31 January 2027, dumped 1 February. **Crew `730418`'s second crew-time ticket on Tuesday:** `301019`, Skid Steer 3.50 h (with `301007`'s 9.75 h, 13.25 h). **A stump load's three stumps:** 4.8, 7.8 and 12.0 CY (`adms-validation` §5.5's). **`R-0008` with a scope of C&D only**, for the out-of-scope example |
| What the worker's run adds (2026-10-05, ADR-352; measured on the same extract, agent defaults) | **Where a haul-out is loaded at Marsh Road TDSR:** by its tower, 39.09030000, −75.62020000; from there **8.1397 road miles** to Bayline County Landfill's own GPS (haul-out 201001) and **13.9516** to Cypress Creek Landfill's (201004's three piles). **Marsh Road TDSR's GPS corrected 11 m north**, 39.09010000: 14 Heron St is then 6.2112 road miles from it. **P1's site circle changed to 30 m** flags ticket 101001's disposal, 38 m from the site's GPS. **A number that isn't one:** `10A040` (the flag catalogue's). **A disposal renumbered by mistake:** 101005's to `101050` |
| What the place checks add (2026-10-05, ADR-346; on the extract since ADR-351; agent defaults) | **The disposals 250 m and 150 m from Marsh Road TDSR:** 39.09225190 and 39.09135114, −75.62000000, due north of its GPS. **Old Quarry Pit** at 39.20000000, −75.65000000. **Marsh Road TDSR's own shape**, for the example of a site with one: 75.63° W to 75.61° W, 39.085° N to 39.105° N. **Straight-line distances** (the geodesic): Marsh Road TDSR to Bayline County Landfill 10,574.5 m |
| What the pricing scenarios add (2026-10-05, ADR-353; made up, agent defaults) | **Summit's truck:** `88120` (28 CY, on the pre-printed sheet; the story `certification`'s), on Summit's load `101044`, called 50% = 14.0 CY. **Summit's rate on `VEG-HAUL-CY-15`:** $7.80 (Coastline's is the mission's $7.50), so 14.0 × $7.80 = $109.20. **A rate change:** Coastline's `VEG-HAUL-CY-15` from $7.50 to $7.75 (101001: 52.0 × $7.75 = $403.00); a dated one, `VEG-HAUL-CY-15-B` from 15 October 2026. **A correction:** 101001's load call from 80% to 70% (45.5 CY, $341.25). **Crew-day steps:** 1.5–4.5 h = 0.25, 4.75–8.5 h = 0.5, 8.75–12 h = 1. **A Coastline Vegetative load 31.0 road miles** from Marsh Road TDSR (past the mission's bands). **A C&D load collected on 2 December 2026**, for `spec/RULES.md` §9's rule 4. **A leaner 24.0 in across**, which two overlapping rules both meet. **An HHW ticket of 55 pounds.** **A load whose two cert numbers differ:** collected on `730415`, its disposal scanned `88120` |
| What task 1.6.3's tests add (2026-10-05, ADR-355; made up, agent defaults) | **Pay items and rates of the tests' own:** `TIP-FEE-TN-BCL` $6.00 a ton; `VEG-HAUL-TN` $21.00 (the tandem `101050`, `101051`: 7.33 × $21.00 = $153.93, 9.77 × $21.00 = $205.17); `STP-HAUL-CY` $9.00 and `WG-HAUL-EA-60` $12.00, each *quantity from the tickets it carries*; `HHW-RMV-LB` $1.85 a pound (55 lb = $101.75); `CREW-TIME-DAY` (by exact division, a 12 h day) and `CREW-TIME-DAY-STP` (in steps: 1.5–4.5 h = 0.25, 4.75–8.5 h = 0.5, 8.75–12 h = 1), each $1,800.00 a crew day; a TBN pay item `HNG-SPECIAL-TBN`. **Tickets:** `101045` (31.0 road miles: no band), `101046` (30.04 mi, `VEG-HAUL-CY-30`), `101047` (a split, one property in no band), `101090` (C&D, collected 2 December), `301022` (white goods with two fridges' freon staged), `301024`…`301032` (crew time and odd amounts). **In a message a prime is told by the name pricing is handed**: the tests hand "Coastline" and "Summit", as the catalogue's messages say them |
| What task 1.6.4's tests add (2026-10-05, ADR-357; made up, agent defaults) | **Ash** on P1's haul-out form (a debris type no rule pays) and **Stumps** on its load form (a load paid from the tickets it carries). **Pay items of the tests' own:** `LNR-RMV-EA-30` (20–30 in, overlapping both Leaners bands) and `STP-RMV-EA-72` (60–72 in, leaving 48.1–59.9 in in no band); `HHW-HAUL-LB` $1.85 a pound; `VEG-HAUL-TN`, `STP-HAUL-CY`, `WG-FRN-EA-STG`, `HNG-SPECIAL-TBN` and `CREW-TIME-DAY-STP` as above. **Rules:** "Summit VEG haul 0–15 mi" on "Summit, Bayline ROW 2026"; "Old C&D rule" (not valid). **Old Quarry Pit** as a site that charges a tipping fee with no fee pay item linked |
| What the priced story adds (2026-10-06, ADR-359; made up, agent defaults) | **Where the mission's later loads are collected** (it names no address for them): `101003` and `101005`, the dump trailer `730415`, at 14 Heron St's point again (6.2050 road miles from Marsh Road TDSR); `101004` and `101006`, Rivera's self-loader `730416`, at 22 Elm St's point (7.8200 mi); each records its fix and no address. **Summit on P1:** added on Friday 9 October with "Summit, Bayline ROW 2026"; its truck `88120` certified on Saturday (a Hydraulic Dump Trailer, 240 × 90 × 60 in, 28 CY); its load `101044` on Wednesday 14 October from Heron St to Marsh Road TDSR. **`101009`** on the same Wednesday: `730415`, Vegetative, from Heron St to **Old Quarry Pit** (site type Other, *Ineligible site*, no permit), called 60% = 39.0 CY, $292.50, until the rule "Old Quarry Pit: void" voids it; it stays void. **Figures after a change:** `101003` at $7.75 is $483.60, `101005` $352.63 (45.5 × $7.75 = $352.625, a half up). **The ledger before any review:** 17 lines, $4,879.00 on Tuesday night; 19 lines, $5,400.25 after Wednesday's sync |
| What the reviewed story adds (2026-10-06, ADR-364; made up, agent defaults) | **Wednesday 14 October on P1:** `101008`, collected as Vegetative on the dump trailer `730415` and dumped as C&D under `730416`'s badge, called 80% (52 CY, $390.00 once both are corrected); Scenario A's `101020` (called 50%) and `101021` (the quarantined 11:40 disposal, called 75%: 36 CY, $270.00) on Rivera's `730416`; `101029`, C&D to the Landfill, its tower disposal created in the back office for Tariq Patel with the shipped reason "Device failed", called 50% (24 CY: $198.00 and the $96.00 tipping fee); Scenario B's `101030` and its phantom `101031`, both loaded 14:10–14:40 on `730415`, the phantom wrongly renumbered to `101035`; haul-out `201002`, recorded at Marsh Road TDSR and corrected to the Landfill (99 CY: $504.90 and $396.00). **P2:** `102005` from 416 Cedar Ct, called 50% (24 CY × $9.00 = $216.00), on ROE `R-0008`, entered with a scope of C&D only until Vegetative is added; the split `102001`, whose second collection came in as `-C`. **Corrections:** `101001`'s call 80% → 70% (note: "Tower photo shows 70%"); `101003`'s 96% → 90% ($438.75); `301006`'s Dryer line taken off (5 × $40.00 = $200.00) and put back; certification `730415`'s sideboards 16 in → 12 in, 65 CY → 62 CY (`101003` then 55.8 CY, $418.50; `101001` and `101005` 43.4 CY, $325.50). **The photograph's label:** "Hanger, before the cut" |
| What the voided story adds (2026-10-06, ADR-365; made up, agent defaults) | **Wednesday 14 October on P1** (the story `p1-voided`, its own database): `101008` as the reviewed story has it, both flags accepted instead of corrected; `101009` to Old Quarry Pit as the priced story has it (39 CY, $292.50), voided by the rule "Old Quarry Pit: void", unvoided three times; Scenario B's `101030` (called 70%: 45.5 CY, $341.25) and its phantom `101031`, voided "Work never happened"; **`101032`**, the dump trailer `730415` to Marsh Road TDSR, called 0%, its flag accepted; `101003`'s call corrected to 97% (63.05 CY, $472.88); a second hanger ticket synced under the voided `301003`, quarantined; Old Quarry Pit's "permit outstanding" accepted. The reasons picked are the shipped list's; the mission's words are the notes |
| What the left-out story adds (2026-10-06, ADR-369; made up, agent defaults) | **The tandem's boxes:** `730421` primary 240 × 90 × 65 = 1,404,000 cu in ÷ 46,656 = 30.09 → **30 CY**; `730422` primary 240 × 96 × 81 = 1,866,240 ÷ 46,656 = **40 CY**. In the story the tandem dumps at **Cypress Creek Landfill**, which has the scale, on receipt **`CCL-51310`** (62,800 lb gross, 28,600 tare, 34,200 net, 17.10 tons; the scenarios' `BCL-88241` is the same weight), as debris type **"Vegetative to FDS"** on P1's load form, paid by `VEG-HAUL-TN` $21.00. **White Goods** on P1's load form, paid by `WG-HAUL-EA-60` $12.00 from the tickets a load carries (load `101014` carries `301006`: 6 × $12.00 = $72.00). **A truck certified after its load:** `730499`, Coastline's, 240 × 90 × 60 → 28 CY, certified Wednesday 14 October 13:00 (load `101015`, 14.0 CY, $105.00), revoked from 15 October, "Tailgate missing" (load `101018`). **`730420`**, which replaces `730416` on 14 October: the same boxes with Sideboards 264 × 92 × 12 added → **55 CY** (load `101019` on the old badge, 15 October). **Haul-outs:** `201005`, 201004's three piles dumped at Bayline County Landfill (six lines, $850.85); `201006`, piles called 35% then 30%, corrected to 60% (38.5 and 27.5 CY, $600.60). **`HNG-SPECIAL-TBN`**, "Hanger over a road, special handling", agreed at **$85.00** each. **P1's map version 2:** the line between Zone 2 and Zone 3 at 75.56° W. **Marsh Road TDSR's own shape:** version 1 from 75.62° W to 75.61° W (the tower outside), version 2 from 75.63° W; both 39.085° N to 39.095° N. **Load `101023`**, collected 3 February 2027 (32.5 CY, $243.75) |
| What the API's scenarios add (2026-10-07, ADR-379; made up, agent defaults) | **Addresses on the local stack:** the API at `https://api.adms.localhost`; the back office's origin `https://adms.localhost` (the stack's own, `infra/local`). **An origin off the CORS list:** `https://evil.example`; **look-alikes:** `https://adms.localhost.evil.example` and `http://adms.localhost`. **Passwords, in tests only:** `marsh heron delphine ferry` (long, taken) and `password1234` (a known breached one, refused); no account anywhere uses either. **A void sent by another site's page:** of ticket `101031`. **A job's tickets:** `101001` and `101003` |
| What the viewers' story adds (2026-10-08, ADR-435; made up, agent defaults) | **Viewers' logins:** Bayline County's debris manager `debris@baylinecounty.example`; the auditor `auditor@stateaudit.example`; the contractor users `office@coastlinehaulers.example`, `office@riveratrucking.example`, `office@summitdebris.example`, and a second Coastline one given no project, `yard@coastlinehaulers.example`. **Rosa Delgado's ROE `R-0007`** (412 Cedar Ct) is written on P1 in that story, signed 9 October 2026, only so that an owner's name is there to read: P1 is a ROW project and asks for no ROE |
| The firm's own list values | Debris type **Marine-Vegetative** (the user's own example, `spec/LISTS.md`), renamed "Marine Vegetative"; incident sub-type **Mailbox struck** under Property damage; reason **Barcode damaged** (a typed ticket number). For tests of a list's own columns: a reason "Monitor's mistake", a kind of work "Fencing", an item "Chainsaw", vehicle types "Bucket truck" (a crew) and "Flatbed" (added 2026-10-02 for the lists' tests, ADR-302) |

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
| GPS points round 27.98° N, 82.40° W (Marsh Road TDSR at 27.98150000, −82.39720000 and the rest of ADR-311's made-up points), the boundary 82.60° W to 82.20° W | the fixtures before task 1.5.8a | §6's stand-ins on the pinned map extract (ADR-351) |
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

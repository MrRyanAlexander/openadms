# The golden mission

✅ **Approved**

> **Approved by the user, 2026-10-01 (ADR-297):** "the mission page has an approved mark and the
> 201004 scenario (adapted like noted above) is how we do want to go. After that is updated as done
> on the page my approval mark stands." The split haul-out, ticket 201004 (§2), is told that way:
> weighed at a scale house, the scale's tons shared out by the piles' load calls.
> Agent-written from `agent_store/SUMMARY.md` (ADR-232). The names and rates are the example world's,
> made up; `spec/FLAGS.md` owns the exact flag messages (approved, ADR-290). If this page and SUMMARY
> disagree, SUMMARY wins.
> **Names, codes and example values follow `spec/CONVENTIONS.md`** (ADR-234, ADR-235): this mission
> *is* the example world (§6 there), and its pay items follow the convention (§5).

**What it's for.** One small mission that shows every kind of record and each one's life, from setup
to the client package, with the statuses, flags and ledger the system must produce. **To explain,
demo or test the domain, use this mission; don't invent coverage.** It becomes the scenario harness's
golden story (`packages/scenarios`, ARCHITECTURE §18). The rules behind each step are in the skills
(`adms-domain` §1.6 is the short version).

**It covers:** a load to a TDSR and to a landfill that charges a tipping fee; a sub's truck; a flagged
load call accepted; a preload; an event that syncs a day late; a mistyped number renumbered; a haul-out
paid by the CY; a split haul-out loaded from three piles and paid by the scale's weight; unit rate hangers, a leaner, stumps with fill, an under-size stump voided, a duplicate voided, white
goods with freon, crew time; an incident; a citizen drop-off log; ROEs, surveys and a split load on a
PPDR project; QC, the invoice lock and batch, and what each viewer sees.

---

## 1. Who and what is set up

**The firm:** **Gates Disaster Recovery**, which installs and runs its own installation of Open ADMS
and holds the master passcode. Back office: **Dana Reyes** (admin), **Luis Ortega** (manager/analyst:
review, correct, renumber, void, accept flags, QC, lock).

**Client:** Bayline County (a record). Its debris manager has a **client user** login (read-only).
**Event:** Hurricane Delphine, `DR-9001-FL` (fictional). **Prime:** Coastline Haulers LLC, with a
**contractor user** login. **Sub:** Rivera Trucking, typed in under Coastline when its truck was
certified.

| | Project P1 | Project P2 |
|---|---|---|
| Name | Bayline County ROW, Hurricane Delphine | Bayline County PPDR, Hurricane Delphine |
| Program type | ROW (no ROE) | PPDR (ROE required; split loads allowed by default) |
| Allow split loads | ticked by the firm, for haul-outs loaded from more than one pile | ticked (the default where ROEs are required) |
| Time zone, window | America/New_York, 2026-10-12 → 2027-01-31 | same |
| Numbers | generated, 1,000-number blocks per phone | generated |
| Contract | "Coastline, Bayline ROW 2026" (prime Coastline) | "Coastline, Bayline PPDR 2026" |

**P1 sites** (each project enters its own):

| Site | Site type | Facts |
|---|---|---|
| Marsh Road TDSR | TDSR/DMS | Takes loads ✓ · Haul-outs leave here ✓ |
| Bayline County Landfill (`BCL`) | Final Disposal | Takes loads ✓ · **Charges a tipping fee** ✓ (the firm wrote pay item `TIP-FEE-CY-BCL` from it) |
| Cypress Creek Landfill (`CCL`) | Final Disposal | Takes loads ✓ · no tipping fee on this contract. It has a scale house, and the contract pays mulch hauled there by the ton |

**P1 forms and debris types:** load form: Vegetative, C&D. Haul-out form: Mulch (Reduced, grinding).

**P1 field tags** (the firm's own list): Mixed; Zone 1 pile, Zone 2 pile, Zone 3 pile. Marsh Road
keeps its mulch apart by the zone the debris came from, and the firm tells the piles apart with
these.

**P1 pay items** (Coastline's rate on each; one pay item holds a rate per prime):

| Code | Description | Payable type | Unit | Size band | Coastline rate |
|---|---|---|---|---|---|
| `VEG-HAUL-CY-15` | ROW VEG haul 0–15 mi | Vegetative | CY | | $7.50 |
| `VEG-HAUL-CY-30` | ROW VEG haul 15.1–30 mi | Vegetative | CY | | $8.90 |
| `CD-HAUL-CY-15` | ROW C&D haul 0–15 mi | C&D | CY | | $8.25 |
| `MULCH-HO-CY` | Mulch haul-out to FDS | Vegetative | CY | | $5.10 |
| `MULCH-HO-TN` | Mulch haul-out to FDS, by weight | Vegetative | TN | | $20.00 |
| `TIP-FEE-CY-BCL` | Tipping fee, Bayline County Landfill | Tipping fee | CY | | $4.00 |
| `HNG-RMV-EA` | Hanger removal | Hangers | EA | | $68.00 |
| `LNR-RMV-EA-24` / `LNR-RMV-EA-99` | Leaner removal 6–24 in / 24.1–99 in | Leaners | EA | 6–24 / 24.1–99 in | $95.00 / $185.00 |
| `STP-RMV-EA-36` / `STP-RMV-EA-48` | Stump removal 24–36 in / 36.1–48 in | Stumps | EA | 24–36 / 36.1–48 in | $110.00 / $175.00 |
| `STP-FILL-CY` | Stump hole fill | Stump fill | CY | | $22.00 |
| `WG-RMV-EA` | White good removed | White Goods | EA | | $40.00 |
| `WG-FRN-EA` | Freon recovered | Freon recovery | EA | | $25.00 |
| `CREW-TIME-HR` | Crew time, skid steer crew | Crew time | HR | | $150.00 |

(The fill and freon codes have payable types of their own, the firm's additions, so each unit rate
payable type the monitor picks from holds only the codes its bands tell apart.)

**P1 rules** (each rule names the Coastline contract once and runs only on Coastline's tickets,
Rivera's included, ADR-239; the pay item screen writes most of them, ADR-229):

| Form | If | Then |
|---|---|---|
| Load | Debris type = Vegetative, Mileage AT MOST 15.0 | Add #1 `VEG-HAUL-CY-15` |
| Load | Debris type = Vegetative, Mileage BETWEEN 15.1 and 30.0 | Add #1 `VEG-HAUL-CY-30` |
| Load | Debris type = C&D, Mileage AT MOST 15.0 | Add #1 `CD-HAUL-CY-15` |
| Load | Disposal site = Bayline County Landfill | Add #2 `TIP-FEE-CY-BCL` (the site's tipping fee) |
| Haul-out | Disposal site = Bayline County Landfill | Add #2 `TIP-FEE-CY-BCL` (the same fee; a rule belongs to one form) |
| Haul-out | Debris type = Mulch, Disposal site = Bayline County Landfill | Add #1 `MULCH-HO-CY` |
| Haul-out | Debris type = Mulch, Disposal site = Cypress Creek Landfill | Add #1 `MULCH-HO-TN` |
| Unit rate | Pay item = `HNG-RMV-EA` (and one rule each for `LNR-RMV-EA-24`, `LNR-RMV-EA-99`, `STP-RMV-EA-36`, `STP-RMV-EA-48`, `CREW-TIME-HR`) | Add #1 that pay item |
| Unit rate | Pay item IS ONE OF `STP-RMV-EA-36`, `STP-RMV-EA-48` | Add #2 `STP-FILL-CY`, quantity from the fill CY |
| Unit rate | Pay item = `WG-RMV-EA` | Add #1 `WG-RMV-EA` (items removed), #2 `WG-FRN-EA` (Item = freon recovered) |

**A haul-out is paid either way, and the firm's setup picks** (ADR-202, 297): the contract prices
mulch hauled out per CY and per ton, the firm entered both pay items, and its two rules pick by
where the haul-out is dumped. From those rules the system works out ahead what each site's phone
asks for at a haul-out disposal: at Bayline County Landfill nothing more (the load call taken at
the TDSR is the quantity); at Cypress Creek Landfill **the scale weight**, off the scale receipt.
The load call is taken at the TDSR either way.

**Certifications:** `730415` Coastline dump trailer, 65 CY · `730416` Rivera self-loader, 48 CY ·
`730419` Coastline walking floor, 110 CY · `730417` Coastline bucket truck crew · `730418` Coastline
skid steer crew.

**Phones and the dispatch board** (ADR-240): each phone was **enrolled** once. Luis writes each day's
**assignments** on the dispatch board (Monday's, then copies them to Tuesday); each monitor signs in
at the yard, online, and the phone takes their assignment: one project, their work, one site where
it's at one.

| Phone | Monitor | Assignment |
|---|---|---|
| P1-COL-1 | Ana Brooks `M004127` | collections (no site) |
| P1-TWR-TDSR | Kim Nguyen `M004128` | disposals and drop-off logs at Marsh Road TDSR |
| P1-TWR-LF | Tariq Patel `M004129` | disposals and haul-out disposals at the Landfill |
| P1-HO-TDSR | Sam Grant `M004131` | haul-out collections at Marsh Road TDSR |
| P1-TWR-CCL | Lee Morgan `M004132` | haul-out disposals at Cypress Creek Landfill (Tuesday) |
| P1-UR-1 | Jo Kim `M004130` | unit rate: Hangers, Leaners, Stumps, White Goods, Crew time; incidents |
| P2-COL-1, P2-TWR-TDSR | Ana Brooks, Kim Nguyen | P2 collections, ROEs and surveys; P2 disposals (a second assignment and phone each: one project per phone) |

---

## 2. P1, Monday 12 and Tuesday 13 October 2026

Every phone syncs whenever it finds signal, mostly back at the yard each evening, except P1-TWR-TDSR on
Tuesday (flat battery; it syncs Wednesday).
Times are project time. "Lines" are the transactions in the ledger at the end.

### Loads and the haul-outs

| Ticket | In the field | At reconciliation and review | Ends | Lines |
|---|---|---|---|---|
| **101001** | Mon. COL 08:40, cert 730415, Vegetative, 14 Heron St. DIS 09:25 at Marsh Road TDSR, Vegetative, call 80% | Pair; zone and mileage (6.2 mi) attached; no flags | `COMPLETED` | #1 `VEG-HAUL-CY-15` 52.0 CY × $7.50 = **$390.00** |
| **101002** | Mon. COL 10:10, cert 730416 (Rivera), C&D. DIS 10:50 at the Landfill, C&D, call 75% | 11.4 mi; the Landfill's tipping fee rule matches | `COMPLETED` | #1 `CD-HAUL-CY-15` 36.0 × $8.25 = **$297.00**; #2 `TIP-FEE-CY-BCL` 36.0 × $4.00 = **$144.00**; recorded as prime Coastline + sub Rivera |
| **101003** | Mon. COL 11:30, cert 730415, Vegetative. DIS 12:05 at the TDSR, call **96%** | Flagged: "Ticket 101003: load call 96%. Flagged for review." Still bills. Luis checks the tower photos and **accepts** the flag ("Heaped; photos confirm") | `MANUAL_REVIEW` → `COMPLETED` | #1 `VEG-HAUL-CY-15` 62.4 × $7.50 = **$468.00** |
| **101004** | **Preload.** COL Mon 17:50, cert 730416, Vegetative. DIS **Tue** 07:15 at the TDSR, call 50% | Not flagged: a preload is normal. The load's time is Monday (its collection's end) | `COMPLETED` | #1 `VEG-HAUL-CY-15` 24.0 × $7.50 = **$180.00** |
| **101005** | Tue. COL 10:05, cert 730415, Vegetative. DIS 10:40 at the TDSR, call 70%, on the phone that dies | Tue night: the collection waits alone, `PENDING`, no flag (an unpartnered event never expires). Wed: the disposal syncs and pairs | `PENDING` → `COMPLETED` | #1 `VEG-HAUL-CY-15` 45.5 × $7.50 = **$341.25** |
| **101006** | Tue. COL 11:30, cert 730416, Vegetative. At the TDSR the barcode won't scan; Kim **types 101060** by mistake (reason "Barcode damaged"), call 60% | Two unpartnered events: COL 101006 `PENDING`; DIS 101060 `PENDING`, flagged "typed ticket number". Luis matches cert, times and photos and **renumbers** the disposal to 101006 (real work: renumber, never void), then accepts the typed-number flag | → `COMPLETED` | #1 `VEG-HAUL-CY-15` 28.8 × $7.50 = **$216.00** |
| **201001** | Tue. **Haul-out.** HOC 13:00 at Marsh Road TDSR, cert 730419, Mulch, **call 90% at the loading end**. HOD 14:10 at the Landfill, Mulch, **no call** | Pair; mileage from the TDSR to the Landfill's own GPS; Marsh Road is marked "Haul-outs leave here"; the tipping fee rule matches | `COMPLETED` | #1 `MULCH-HO-CY` 99.0 × $5.10 = **$504.90**; #2 `TIP-FEE-CY-BCL` 99.0 × $4.00 = **$396.00** |
| **201004** | Tue. **Split haul-out**, three piles, one trailer, one dump, **weighed** (below) | Grouped on 201004; the scale's 24.00 tons shared out by the piles' load calls; priced once per pile | `COMPLETED` | three lines, **$480.00** (below) |

**The split haul-out, 201004** (ADR-295, 297). The same walking floor, cert 730419 (110 CY), comes
back to Marsh Road TDSR and is loaded from three piles. P1 allows split loads, so Sam Grant answers
"split" and records **one haul-out collection per pile**, each with its field tag and **the load
call so far**: how full the trailer is after that pile. No estimate is taken. The truck goes to
Cypress Creek Landfill and over its scale. There Lee Morgan records the one haul-out disposal at
17:15: Mulch, and **the scale weight** the phone asks for, copied by hand from scale receipt
`CCL-51207`: gross 79,600 lb, tare 31,600 lb, **net 48,000 lb = 24.00 tons**.

| Event | In the field | Load call so far | The pile added | Its share of the weight (24.00 × part ÷ 85) | Line |
|---|---|---|---|---|---|
| HOC **201004-A** | Tue 15:30, Mulch, Zone 1 pile | 10% | 10 | 2.82 tons | #1 `MULCH-HO-TN` 2.82 × $20.00 = **$56.40** |
| HOC **201004-B** | Tue 15:45, Mulch, Zone 2 pile | 35% | 35 − 10 = 25 | 7.06 tons | #1 `MULCH-HO-TN` 7.06 × $20.00 = **$141.20** |
| HOC **201004-C** | Tue 16:05, Mulch, Zone 3 pile | **85%** | 85 − 35 = 50 | 14.12 tons | #1 `MULCH-HO-TN` 14.12 × $20.00 = **$282.40** |
| HOD **201004** | Tue 17:15 at Cypress Creek Landfill, Mulch, receipt `CCL-51207` | | | **24.00 tons** weighed | |

At reconciliation the three collections and the disposal are grouped on 201004. The last call, 85%,
is the haul-out's. Each pile's part is what it added to the call (10, 25, 50), and its share of the
scale's weight is its part ÷ 85: 2.82, 7.06 and 14.12 tons, which add up to the 24.00 tons weighed
exactly. Only the 24.00 was weighed; the three shares are worked out by the system and kept apart
from it. The rules run once per pile, on its share: the Cypress Creek rule adds one `MULCH-HO-TN`
line per pile, each naming its pile, so the firm can see what each zone's pile cost. The load calls
also give each pile's CY (11.0, 27.5 and 55.0, 93.5 CY in all), which is kept and not billed.
Nothing is flagged: every call is higher than the one before, and the load-call limits judge only
the last call. It ends `COMPLETED`, one completed haul-out with three piles. Had it gone to Bayline
County Landfill instead, the same piles would have been paid by the CY, on those CY figures, with
the tipping fee. (201002 and 201003 are the flag catalogue's examples, not
tickets of this mission; gaps in a series are normal.)

### Unit rate (P1-UR-1: crew badge, crew photo, then the monitor picks by payable type)

| Ticket | In the field | At reconciliation and review | Ends | Lines |
|---|---|---|---|---|
| **301001** | Mon. Crew 730417, **Hangers**, one tree, 3 in limb | The phone worked out `HNG-RMV-EA` | `COMPLETED` | #1 `HNG-RMV-EA` 1 × $68.00 = **$68.00** |
| **301002** | Mon. Crew 730417, **Leaners**, measured as circumference 56.5 in | Diameter 56.5 ÷ 3.14 = 18.0 in → band 6–24 → `LNR-RMV-EA-24` | `COMPLETED` | #1 `LNR-RMV-EA-24` 1 × $95.00 = **$95.00** |
| **301003** | Mon. Crew 730417, Hangers, **the same tree as 301001** (same photos) | Priced `HNG-RMV-EA` $68.00 at first. At QC Luis sees the duplicate and **voids** it ("Duplicate of 301001"); the line is removed, copied in full to the audit log first. Renumbering it would double-bill | `COMPLETED` → **`VOID`**, QC Void | none |
| **301004** | Tue. Crew 730418, **Stumps**: 30 in two feet up, root ball 96 in, half or more exposed, survey number typed | Band 24–36 → `STP-RMV-EA-36`. Fill = 0.7854 × 96² × 31 ÷ 46,656 = **4.8 CY**. Both stump checks pass | `COMPLETED` | #1 `STP-RMV-EA-36` **$110.00**; #2 `STP-FILL-CY` 4.8 × $22.00 = **$105.60** |
| **301005** | Tue. Crew 730418, Stumps, **20 in** two feet up | Flagged: under 24 in, and no band fits, so no pay item and nothing to bill. Luis voids it ("Under 24 in; goes out as vegetative debris") | `MANUAL_REVIEW` → **`VOID`** | none |
| **301006** | Tue. Crew 730417, **White Goods** at 40 Birch Ln: 2 washers, 1 dryer, 3 fridges, all removed; freon recovered from 2 | Items removed = 6; freon recovered = 2 | `COMPLETED` | #1 `WG-RMV-EA` 6 × $40.00 = **$240.00**; #2 `WG-FRN-EA` 2 × $25.00 = **$50.00** |
| **301007** | Tue. Crew 730418, **Crew time**: Skid Steer 9.75 h, Truck 8.50 h | Bills the highest item's hours, once | `COMPLETED` | #1 `CREW-TIME-HR` 9.75 h × $150.00 = **$1,462.50** |

### Forms (never priced)

| Record | What happens |
|---|---|
| Incident, Tue 11:50 | Jo Kim records type Property damage, sub-type "Mailbox struck" (the firm added it), 22 Elm St, truck 730416, photos. Records only; nothing stops. QC'd on its own |
| Citizen drop-off log, Tue 15:20 | Kim Nguyen logs a resident's drop-off at Marsh Road TDSR: name and origin address (optional), photos. No quantity, number or cost; the pile is billed when it leaves on a haul-out |

---

## 3. P2, the split load

| Record | What happens | Ends | Lines |
|---|---|---|---|
| ROE R-0007, R-0008 | Made on P2-COL-1: 412 and 416 Cedar Ct, parcels, owners, signed 9 Oct, photo of each signed form | QC Approved | none |
| Pre-work surveys | One per ROE, linked by ROE number | QC Approved | none |
| **102001-A**, **102001-B** | Mon. One truck (cert 730416) loads at both properties: `-A` on R-0007, estimate 12 CY; `-B` on R-0008, estimate 18 CY; Vegetative | Grouped on 102001 | |
| **102001** | DIS at P2's Marsh Road TDSR, call 75% → 36.0 CY | Shares by estimate: 12 ÷ 30 → 14.4 CY, 18 ÷ 30 → 21.6 CY. Rules run per property (its own address, zone, mileage) | `COMPLETED` | `-A` #1 `VEG-HAUL-CY` 14.4 × $9.00 = **$129.60**; `-B` #1 `VEG-HAUL-CY` 21.6 × $9.00 = **$194.40** |
| Post-work surveys | One per ROE, linked to the pre-work survey by ROE number | QC Approved | none |

(`VEG-HAUL-CY` is P2's own "PPDR VEG haul" pay item, $9.00 for Coastline.)

---

## 4. The ledger, QC, the lock and the package

**P1 ledger at the end: $5,548.25** (19 lines: $5,068.25 on 16 lines before the split haul-out,
plus 201004's $480.00 on three). 301003 and 301005 bill nothing. **P2: $324.00.**
The ledger is the current truth: 301003's removed `HNG-RMV-EA` line survives only in the audit log.

**QC:** Luis sets QC Approved on each **completed load** (`CLT` 101001…101006, `CHO` 201001 and 201004, the split
102001, never a single event, and never one pile of a split haul-out), the live unit rate tickets, the forms and the certifications. The voided
tickets get QC Void.

**Invoice lock:** the QC Approved tickets are locked as invoiced in the batch **"Bayline ROW, week of
12 Oct"**. A later rate change would regenerate only un-invoiced tickets.

**Client package:** Dana exports the batch's tickets, photos and transactions and zips them by hand.

**What each person sees:** the Bayline County user sees everything on P1 and P2 except personal phone
and licence numbers. The Coastline user sees Coastline's tickets and transactions, Rivera's included,
and nothing of any other prime. Monitors see only their own phone's work, and never a rate or a code.

**Audit log (excerpt):** every step above writes a row with its actor, for example:

| Actor | What | Prior → new |
|---|---|---|
| Kim Nguyen `M004128` (phone) | DIS 101060 created, typed number, reason "Barcode damaged" | → 101060 |
| Luis Ortega | DIS renumbered | 101060 → 101006 |
| Luis Ortega | Flag accepted on 101003, "Heaped; photos confirm" | open → accepted |
| System (worker) | Transaction `HNG-RMV-EA` on 301003 removed on void, full row copied here first | $68.00 line → none |
| Luis Ortega | 301003 voided, "Duplicate of 301001" | `COMPLETED` → `VOID` |

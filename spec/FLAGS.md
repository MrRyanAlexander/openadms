# Open ADMS — The flag catalogue

✅ **Approved** With the user's approval of the wording - 10.01.2026-1345 *(BACKLOG 0.2b.3; ADR-285; the approval is ADR-290; changed since, at the user's word, by ADR-293, 294 and 295)*

← [Index](INDEX.md)

> **What this page is.** Every flag Open ADMS can raise: its code, what raises it, the message a
> reviewer reads, whether the ticket still bills, and the facts it keeps so it isn't raised twice.
> **It decides codes and wording, never rules**: each check is `adms-validation` §5.1–§5.2's, with its
> ADR. The engine's flag code is a closed set (`FlagCode`, `spec/DATA-MODEL.md` §9): a flag that isn't
> on this page doesn't exist, and a new one is a code change with an ADR. Examples come from the
> example world (`spec/CONVENTIONS.md` §6).

---

## 1. How every flag works

- **Flag, never block.** After setup nothing refuses field work or a record over eligibility: the
  problem becomes a flag on the ticket and the ticket goes to the one review queue (ADR-052, 228).
  The only thing sync turns away is a second field event of one kind on one ticket, which is
  **quarantined**, not flagged (ADR-022): it has no row on this page.
- **A flag says the ticket and the problem, plainly, and nothing else** (ADR-052). It never guesses a
  cause and never tells the reviewer what to do.
  ✅ "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review."
  ❌ "Ticket 101008 has a mismatch, which probably means the monitor picked the wrong type."
- **One shape for every message:** `Ticket <number>: <the facts>. Flagged for review.` A flag that
  stops a line or the ticket from billing ends `Flagged for review; not billed.` instead. A flag on a
  record that isn't a ticket names it: `Certification 730416: …`, `Marsh Road TDSR: …`.
- **Every flag is one kind of thing.** None is "harder" than another. Any open flag makes the ticket
  `MANUAL_REVIEW`, and **review still bills** wherever an amount can be computed (ADR-060). The
  *Bills* column says what each flag does to the money:
  - **yes**: the ticket bills as if the flag weren't there;
  - **that line no**: one line can't be computed and bills nothing; the ticket's other lines bill;
  - **no**: nothing can be computed, so the ticket bills nothing until it's corrected.
- **A reviewer fixes it or accepts it** (ADR-166). Whoever may correct may **accept** any flag that
  is right as it is, with a reason from the firm's list, audited. **Accepting never changes what
  bills**: a flag whose *Bills* is "no" still bills nothing once accepted. When every flag on a
  ticket is fixed or accepted, the worker marks it `COMPLETED`.
- **A flag keeps the facts it was raised on** (the *Facts kept* column). On a reprocess the worker
  compares them: the same facts keep the same flag, with its acceptance; changed facts clear it and,
  if the problem is still there, raise a new one that must be looked at again (ADR-166). A cleared
  flag stays in the ticket's history; nothing is deleted.
- **A `PENDING` ticket shows the flags of the field event it has** (a typed number, a
  certification), so the queue can act on them; it stays `PENDING` until it's whole (ADR-244).
- **Thresholds are policy**: built-in defaults in `.env`, project settings where the firm may change
  them; never a number in code, never relaxed to pass a test (invariant 16).

---

## 2. Never flagged

As important as the catalogue: an agent must not add these (`adms-validation` §5.2a).

A field event **waiting for its partner**, however long; a **preload**, or a haul-out from a prior
date (ADR-053, 205) · the **distance a collection covers** (ADR-136) · **GPS accuracy** (ADR-083) ·
**split estimates against the load call** (ADR-064) · **a scale weight against a load call**
(ADR-165) · a **driver's licence** (ADR-153) · a tandem's **trailer swap** (ADR-114) · "hauling paid
twice" on a load of stumps (ADR-199) · work under an **unplanned assignment**, and planned against
actual on the dispatch board (ADR-240) · a citizen drop-off log against its site's facts (ADR-215) ·
a monitor's own hours (ADR-100).

---

## 3. The catalogue

`<…>` is filled from the ticket. Every message ends "Flagged for review." unless shown otherwise.

### 3.1 Between a ticket's field events

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `DEBRIS_TYPE_MISMATCH` | The disposal's debris type isn't the exact entry the collection picked (each property's on a split; a haul-out's two the same way) | "Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D)." | yes: rules read the collection's | both entries | 207, 226, 244 |
| `CERT_NUMBER_MISMATCH` | The cert numbers on the ticket's events differ, compared exactly | "Ticket 101008: truck number doesn't match (collection 730415, disposal 730416)." | yes, from the certification on the event that took the quantity (§5, 1) | both numbers | 019, 033 |
| `DISPOSAL_BEFORE_COLLECTION_ENDED` | The disposal started before its collection ended | "Ticket 101008: disposal started 09:12, before its collection ended 09:40." | yes | both times | 053, 100 |
| `OVERLAPPING_LOADS` | Two collections on one certification with overlapping loading times and no disposal between; raised on both tickets | "Ticket 101031: loading 09:10–09:40 overlaps ticket 101030 on truck 730415." | yes | both tickets' times, the cert number | 027, 053 |
| `SPLIT_SUFFIX_GAP` | A bare collection beside suffixed ones, or a gap in the suffixes: a split load's properties, or a split haul-out's piles | "Ticket 102001: collections -A and -C, no -B." | yes | the suffixes present | 033, 173, 295 |
| `CARRIED_COUNT_MISMATCH` | On a load that carries tickets, the tower's count differs from the tickets the collection lists | "Ticket 101014: tower counted 3 stumps, the collection lists 4." | yes, from the tickets carried | both counts | 192, 243 |

### 3.2 The certification

Judged at the **work time**, never "now" (ADR-048).

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `NO_CERTIFICATION` | No certification with that number on the project | "Ticket 101015: no certification 730499 on this project. Flagged for review; not billed." | no, until one exists | the number | 154 |
| `TYPED_CAPACITY_DIFFERS` | A truck keyed in by hand, its typed capacity unlike the certification's | "Ticket 101016: capacity typed 60, certified 65." | yes, at the certified capacity | both capacities | 154 |
| `TAG_EXPIRED` | The certification's tag had expired at the work time | "Ticket 101017: review certification 730416 (tag expired 30-Sep-2026)." | yes | the expiry, the work time | 079, 153 |
| `CERTIFICATION_REVOKED` | The work time is on or after the date the certification was revoked from | "Ticket 101018: review certification 730416 (revoked from 14-Oct-2026)." | yes | the date, the work time | 079 |
| `CERTIFICATION_REPLACED` | The work time is after the certification was replaced by a new one | "Ticket 101019: review certification 730416 (replaced by 730420 on 14-Oct-2026)." | yes | both numbers, the date | 082 |

### 3.3 Place and time

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `OUTSIDE_PROJECT_BOUNDARY` | A collection's end GPS, or a unit rate event's GPS, is outside the project boundary | "Ticket 101020: collected outside the project boundary." | yes | the GPS, the map version | 135, 141 |
| `NO_ZONE` | Inside the boundary but in no zone (the zone is left empty) | "Ticket 101021: not inside any zone." | yes | the GPS, the map version | 141 |
| `OUTSIDE_SITE_AREA` | A disposal's (or either haul-out end's) end GPS is outside its site's area: the project's circle or the site's own shape | "Ticket 101022: dumped outside Marsh Road TDSR's area." | yes | the GPS, the site's GPS, the circle size or shape version | 136, 142 |
| `PROJECT_NOT_ACTIVE` | The load's time (its collection's end) is outside the project's active window | "Ticket 101023: project not active on 03-Feb-2027." | yes | the load's date, the window | 057, 161 |
| `SITE_NOT_YET_ACTIVE` | A disposal before its site's activation date | "Ticket 101024: Marsh Road TDSR not yet active on 10-Oct-2026." | yes | the date, the activation date | 181 |
| `SITE_CLOSED` | A disposal after its site's set close date | "Ticket 101025: Marsh Road TDSR closed on 01-Dec-2026." | yes | the date, the close date | 173 |
| `NO_ROAD_ROUTE` | The routing server found no road route | "Ticket 101026: no road route found; straight-line distance used." | yes, at the straight-line miles | both points, the map data's date | 163 |
| `DEVICE_CLOCK_OFF` | The phone's clock differed from the server's at sync by more than the threshold (`.env`) | "Ticket 101008: device clock was 2 h 14 m off at sync." | yes | the difference | 100 |
| `WORK_TIME_AFTER_RECEIVED` | A work time later than the server received the record | "Ticket 101008: work time 21:40 is after it was received at 20:15." | yes | both times | 100 |
| `WORK_TIME_BEFORE_ENROLMENT` | A work time before its phone was enrolled | "Ticket 101027: work time 08:05 is before its phone was enrolled." | yes | both times | 100, 240 |
| `DEVICE_TIME_ZONE_DIFFERS` | The phone's time zone offset isn't the project's at the work time | "Ticket 101028: phone was on UTC−05:00; the project is on UTC−04:00." | yes | both offsets | 100 |
| `PHONE_OUT_OF_SERVICE` | Made on a phone after it was taken out of service | "Ticket 101008: made on a phone taken out of service." | yes | the work time, the removal time | 134 |
| `TYPED_TICKET_NUMBER` | The ticket number was typed instead of scanned (a reason was picked) | "Ticket 101060: typed ticket number (Barcode damaged)." | yes | the reason | 111, 173 |
| `BACK_OFFICE_RECORD` | The back office created the record (person and reason kept) | "Ticket 101029: record created in the back office by Luis Ortega (Phone failed)." | yes | the person, the reason | 156 |

### 3.4 Where the debris went

The system checks where debris went, never where it was headed (ADR-205).

A haul-out is reduced debris leaving a TDSR for a different site (ADR-298). Setup lets *Haul-outs
leave here* be ticked only on a TDSR/DMS site, so the two haul-out flags below, unchanged, catch
every other trip: one that left a landfill or any site that isn't a TDSR (`SITE_NOT_FOR_HAUL_OUTS`),
and one dumped at a TDSR, the site it left included (`HAUL_OUT_DUMPED_AT_TDSR`).

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `SITE_DOES_NOT_TAKE_LOADS` | A load dumped at a site not marked *Takes loads* | "Ticket 101013: dumped at Old Quarry Pit, which isn't marked Takes loads." | yes | the site, the fact | 205, 215 |
| `SITE_NOT_FOR_HAUL_OUTS` | A haul-out leaving a site not marked *Haul-outs leave here* | "Ticket 201003: left Bayline Transfer Station, which isn't marked Haul-outs leave here." | yes | the site, the fact | 205, 215 |
| `INELIGIBLE_SITE` | A load dumped at an *Ineligible site* | "Ticket 101009: dumped at Old Quarry Pit, an ineligible site." | yes | the site, the fact | 215 |
| `TIPPING_FEE_RULE_MISSING` | A load or haul-out **dumped** at a site that *Charges a tipping fee*, with no line for that site's tipping fee pay item. A missing rule, never a mismatch | "Ticket 101011: dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this project gives it one." | yes, its other lines | the site, its tipping fee pay item | 222, 226 |
| `HAUL_OUT_DUMPED_AT_TDSR` | A haul-out dumped at a site whose type is the built-in TDSR/DMS | "Ticket 201002: a haul-out dumped at Marsh Road TDSR, a TDSR. Flagged for review; not priced." | no: the rules are skipped until it's corrected | the site, its type | 226 |

### 3.5 Quantity

On a split haul-out the load-call flags judge **the last pile's call**, which is the haul-out's; a
pile's running call is never judged by the limits (ADR-295).

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `LOAD_CALL_ZERO` | A load call of 0%, whatever the limits | "Ticket 101032: load call 0%. Flagged for review; not billed." | no: 0 CY | the call | 116, 181 |
| `LOAD_CALL_LOW` | A load call at or under the project's low limit (5% unless changed or off) | "Ticket 101033: load call 4%." | yes | the call, the limit | 164 |
| `LOAD_CALL_HIGH` | A load call at or over the project's high limit (95% unless changed or off) | "Ticket 101003: load call 96%." | yes | the call, the limit | 164 |
| `PILE_CALL_NOT_HIGHER` | On a split haul-out, a pile's load call isn't higher than the call of the pile before it, so what it added can't be worked out | "Ticket 201004: pile -B's load call 30% is not higher than pile -A's 35%. Flagged for review; not billed." | no: the piles' shares can't be worked out | every pile's call | 295 |
| `QUANTITY_MISSING_FOR_PAY_ITEM` | A rule's pay item needs a quantity the ticket doesn't have (per ton, no scale weight; a zero net) | "Ticket 101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight." | that line no | the pay item, its unit | 223 |
| `SHARED_SCALE_WEIGHT` | One scale receipt on two containers' disposals: the weight is split by certified capacity. Raised on both tickets | "Ticket 101050: one scale weight shared by two containers, split by certified capacity (7.33 of 17.10 tons)." | yes, at its share | the receipt, both capacities, the net | 175 |
| `RECEIPT_TWO_DEBRIS_TYPES` | The tickets on one scale receipt carry different debris types. Raised on both | "Ticket 101052: scale receipt BCL-88241 covers two debris types (Vegetative, C&D). Flagged for review; its weight is not used." | weight lines no | the receipt, both entries | 069 |
| `SCALE_WEIGHT_UNUSABLE` | A receipt's net is below zero, or its gross or tare is missing where the net must be worked out | "Ticket 101053: scale receipt BCL-88250 has no usable net weight. Flagged for review; its weight is not used." | weight lines no | the receipt's figures | 038 |
| `CARRIED_TICKET_NOT_FOUND` | A carried ticket number (a stump or white goods ticket) matches no ticket | "Ticket 101014: carried ticket 301099 not found." | yes, from the tickets found | the number | 192 |
| `CARRIED_TICKET_ON_ANOTHER_LOAD` | A carried ticket is already on another load | "Ticket 101014: carried ticket 301004 is already on load 101007." | yes | both loads | 192 |

### 3.6 The pay item's settings, and unit rate work

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `MEASUREMENT_MISSING` | The pay item has *Measurement required* and the ticket has none | "Ticket 301010: no measurement." | yes | the pay item | 158 |
| `GPS_MISSING` | The pay item has *GPS required* and the ticket has no GPS | "Ticket 301011: no GPS." | yes | the pay item | 157 |
| `PHOTOS_MISSING` | The pay item requires photos and the ticket has none | "Ticket 301012: no photos." | yes | the pay item, the photo count | 157, 181 |
| `DECIMAL_COUNT` | A count with decimals where the pay item doesn't have *Decimals allowed* | "Ticket 301013: count 2.5; HNG-RMV-EA takes whole counts." | yes, at the count entered | the count, the pay item | 207 |
| `NO_SIZE_BAND` | A measurement in no size band of its payable type: saved with no pay item | "Ticket 301009: 4.5 in fits no Leaners pay item. Flagged for review; not billed." | no | the diameter, the bands | 213, 217 |
| `OUTSIDE_SIZE_BAND` | A payable type's **only** pay item, measured under or over its band | "Ticket 301014: 30.0 in is over HNG-RMV-EA's band (2–24 in)." | yes | the diameter, the band | 210, 217 |
| `MARKED_INELIGIBLE` | The monitor marked the work ineligible (where the pay item allows it) | "Ticket 301015: marked ineligible by the monitor." | yes | | 210 |
| `STUMP_UNDER_24` | A stump under 24 in two feet up | "Ticket 301005: not an eligible stump (20 in, under 24 in)." | as its band says; with no band, no | the diameter | 187, 189 |
| `ROOT_BALL_NOT_WIDER` | A stump's root ball isn't wider than the stump (a project check, on by default) | "Ticket 301008: root ball (20 in) is not wider than the stump (30 in)." | yes | both diameters | 203 |
| `FILL_WITHOUT_EXPOSED_ROOT_BALL` | A fill line is paid but the root ball isn't half exposed (a project check, on by default) | "Ticket 301016: fill paid, but the root ball is not half exposed." | yes | the fill line, the answer | 203 |
| `ROOT_BALL_MISSING` | A blank root ball where the stump's pay item requires the measurement | "Ticket 301017: no root ball measurement." | yes; no fill line | the pay item | 203 |
| `NO_SURVEY` | A stump ticket with no survey number | "Ticket 301018: no survey." | yes | | 198 |
| `CREW_ITEM_OVER_12_HOURS` | One crew item over 12 hours in the crew's day, its hours added across the day's tickets (project time) | "Ticket 301019: Skid Steer 13.25 h on 13-Oct-2026 for crew 730418 (over 12 h)." | yes | the item, the day's hours, the tickets | 068, 159 |
| `CREW_TIME_OVERLAP` | Two crew-time tickets for one crew overlap | "Ticket 301020: crew time 07:00–11:00 overlaps ticket 301007 for crew 730418." | yes | both tickets' times | 159 |

### 3.7 Forms, certifications and sites

A flag here sits on the record it's about; it never touches a ticket's status.

| Code | Raised when | Message | Facts kept | ADR |
|---|---|---|---|---|
| `ROE_MISSING` | On an ROE project, a collection, unit rate ticket or survey with no ROE | "Ticket 102002: no ROE." | the program type's setting | 149 |
| `ROE_NOT_ON_PROJECT` | Its ROE isn't one of the project's | "Ticket 102003: ROE R-0099 is not on this project." | the ROE number | 149 |
| `ROE_UNSIGNED` | Its ROE isn't signed | "Ticket 102004: ROE R-0008 is not signed." | the ROE | 149 |
| `ROE_OUT_OF_SCOPE` | Its ROE has a scope and the work isn't in it: a collection's debris type, or a unit rate ticket's payable type, isn't among the ROE's scope picks. An ROE with no scope picked is never flagged for scope | "Ticket 102005: outside the scope of ROE R-0008." | the ROE's scope, the work | 055, 149, 293 |
| `NO_PRE_WORK_SURVEY` | A post-work survey with no pre-work survey on its ROE | "Survey on ROE R-0008: no pre-work survey." | the ROE | 150 |
| `CERTIFICATION_PHOTO_MISSING` | A certification without one of its five views | "Certification 730416: no left side photo." | the views present | 179 |
| ~~`REVIEW_ORIGINAL_CERTIFICATION`~~ | Withdrawn (ADR-328): a certification is never copied, so there is no copy whose correction could flag an original | | | 152 → 328 |
| `PERMIT_OUTSTANDING` | A disposal site with no permit | "Marsh Road TDSR: permit outstanding." | | 111 |

A ticket's ROE flags still bill.

**Retired:** `HELPER_NOT_FOUND` (ADR-294). A certification's helper is picked from the people assigned
to the project, never typed, so an ID that matches no user can't happen.

**Added:** `PILE_CALL_NOT_HIGHER` (§3.5, ADR-295; the agent's wording). The catalogue is 67 flags.

### 3.8 Pricing

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `NO_PRICING_RULE` | No rule of the ticket's prime creates a line | "Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review; not billed." | no | the prime | 239 |
| `DUPLICATE_TRANSACTION_NUMBER` | Two rules create the same # on one ticket | "Ticket 301009: two rules create transaction 1 (LNR-RMV-EA-24, LNR-RMV-EA-99). Flagged for review; not billed." | neither line | the #, both rules | 118 |
| `NO_RATE_FOR_PRIME` | The pay item has no rate for the prime: a $0 line | "Ticket 101034: pay item VEG-HAUL-CY-15 has no rate for Summit." | that line $0 | the pay item, the prime | 212 |
| `RATE_TO_BE_NEGOTIATED` | The pay item's unit is TBN | "Ticket 301021: rate to be negotiated. Not billed yet." | that line no | the pay item | 068 |

### 3.9 The engine

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `NOT_PROCESSED` | The worker hit an error on this ticket: it is flagged and skipped, and the run goes on | "Ticket 101035: could not be processed. Flagged for review; not billed." | no | the run | ARCHITECTURE §13 |

### 3.10 A record that should not have been possible

The phone stops each of these before a monitor can finish the record, and setup stops the last
three. One that reaches the server anyway is **kept and flagged, never thrown away** (the user,
2026-10-04, ADR-329). The first six were worded by the agent and approved by the user on
2026-10-05 ("Yes to all", ADR-345). The last three are backup catches the user asked for the same
day: "If there is even a chance those could be created make them flag, but it really should be
impossible if we build things the right way"; their wording is the agent's.

| Code | Raised when | Message | Bills | Facts kept | ADR |
|---|---|---|---|---|---|
| `DETAIL_MISSING` | A field event arrived without a detail its kind always records: a load's or a haul-out's debris type at either end; a disposal with no load call, no scale receipt and no count; a haul-out collection's load call; a unit rate event's kind of work | "Ticket 101036: collection has no debris type." | yes, where an amount can be computed | the detail | 329, 345 |
| `TYPED_NUMBER_NO_REASON` | The ticket number was typed instead of scanned and no reason was picked | "Ticket 101037: typed ticket number (no reason picked)." | yes | | 329, 345 |
| `WRONG_KIND_OF_BADGE` | A load or a haul-out recorded on a crew's certification, or unit rate work on a container's | "Ticket 101038: a load recorded on crew certification 730417." | yes, where an amount can be computed | the cert number, its kind | 329, 345 |
| `GPS_UNREADABLE` | The phone sent a GPS fix that can't be one (half a fix, a latitude past 90); the field event was saved without it | "Ticket 101039: GPS unreadable." | yes | the fix as sent | 329, 338, 345 |
| `NOT_A_TICKET_NUMBER` | The ticket number isn't digits: the field event pairs with nothing until a person renumbers it | "Ticket 10A040: not a valid ticket number. Flagged for review; not billed." | no | the number as sent | 329, 345 |
| `ENDED_BEFORE_STARTED` | A field event's end is before its start | "Ticket 101041: collection ended 09:10, before it started 09:40." | yes | both times | 329, 345 |
| `SPLIT_NOT_ALLOWED` | A collection with a split suffix on a project whose *Allow split loads* is off | "Ticket 101042: a split load on a project that doesn't allow split loads." | yes | the suffixes | 137, 345 |
| `OUTSIDE_CONTROL_RANGES` | On a project numbered from control tickets, a load's or a haul-out's number is in none of the ranges entered for its series | "Ticket 109999: number is in none of the project's control ticket ranges." | yes | the number, the ranges | 056, 345 |
| `ASSIGNMENT_ON_ANOTHER_PROJECT` | A field event's assignment belongs to a different project from the field event | "Ticket 101043: recorded under an assignment on another project." | yes | both projects | 156, 345 |

**Added:** the nine flags of §3.10 (ADR-345). The catalogue is 75 flags: 66 after ADR-328 withdrew
one, and these nine.

---

## 4. What a reviewer does with one

| The evidence says | The reviewer | What happens to the flag |
|---|---|---|
| A captured value is wrong | **corrects** the field event, in place, audited | the ticket reprocesses; the flag clears if its facts no longer raise it |
| The setup is wrong (a missing rule, a site's fact, a rate) | fixes the setup | every un-invoiced ticket it touches reprocesses (ADR-090) |
| The work never happened | **voids** the ticket, with a reason | the ticket is `VOID`; its flags stay in its history |
| The flag is right as it is | **accepts** it, with a reason | it stays in the history, accepted; it isn't raised again unless its facts change |

Reasons come from the firm's list (ADR-173). Nothing technically stops a wrong choice; the audit
trail is the backstop (ADR-051).

---

## 5. Decided with the approval (ADR-290)

The user approved this page on 2026-10-01 without changing a word, so the wording above stands, and
so do these four points, each of which was more than wording:

1. **When the two cert numbers on a load differ, which certification bills it.** Nothing recorded
   says. This page's default: the certification on the field event that took the quantity (the
   disposal for a load, the haul-out collection for a haul-out), for its capacity and its prime;
   the ticket is flagged either way, and a reviewer corrects the wrong number. It changes money;
   approved with the page.
2. **`SCALE_WEIGHT_UNUSABLE` has no "over the vehicle's legal limit" test.** `adms-scale-receipts`
   names a net "beyond the vehicle's legal limit" as an error to flag, but no limit is recorded
   anywhere, and a threshold is policy. This page flags only a net below zero or one that can't be
   worked out, until a limit is given.
3. **Codes added from the rules that had no wording yet:** `OVERLAPPING_LOADS`, `DECIMAL_COUNT`,
   `REVIEW_ORIGINAL_CERTIFICATION`, `HELPER_NOT_FOUND` (since retired, ADR-294), `WORK_TIME_BEFORE_ENROLMENT` ("before the
   device was set up" in ARCHITECTURE §10, read as enrolment since ADR-240), `NOT_PROCESSED`. Their
   messages are the agent's.
4. **Dates and times in a message** follow the report format of `spec/CONVENTIONS.md` §3
   (`03-Feb-2027`, 24-hour `21:40`, in the project's time zone). The earlier style examples in the
   skills and ARCHITECTURE §10 ("2027-02-03", "9:40 pm") follow this page (changed with the approval, ADR-290).

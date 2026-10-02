---
name: adms-certifications
description: Open ADMS certifications, in today's rules. Read before touching any certification code. Covers why a certification certifies a container or a crew and never a vehicle (a crew is its certification), why both share one base, the exact capacity math (whole inches, a primary box plus add/subtract boxes with optional ÷2, a two-length hoist, a round bottom, a radius corner, rounded to hundredths each step, ÷46,656, then a whole CY half up), why the cert number IS the placard and badge number (system-issued from the project's series in phone blocks, or pre-printed; unique per project), how it reaches a field event, the lifecycle (tag expiry, revoke, replace, copy to another project, a truck keyed in by hand; never ends on its own), attestation and QC, five photos, and the real paper form. Use when working on certifications, placards, badges, cert numbers, containers, crews or capacity.
---
<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-250; the driver shown from the certification, ADR-289; helpers picked, ADR-294) -->

> **This page states today's rules** (through ADR-249). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). The worked example
> is `spec/golden/MISSION.md`; names and examples follow `spec/CONVENTIONS.md` (its example world's
> certifications run from `730415`). **The capacity math in §3A.3 is user-confirmed and never
> changes without the user.**

# PART 3A — CERTIFICATIONS (READ THIS BEFORE TOUCHING CERT CODE)

Certifications are the most misunderstood part of this domain, because the everyday word ("truck
cert") names the wrong noun. **A certification is a record, not a ticket's field event** (ADR-236):
it is made once and every field event that scans its badge refers to it.

## 3A.1 A certification certifies a CONTAINER or a CREW, never a vehicle (ADR-015)

**What is certified is the thing that holds the debris**, because its volume becomes money
(capacity × load call = billed CY, `adms-domain` §1.3). The vehicle that moves it is incidental.
Configurations that each get **one container certification**:

| Configuration | The container | The vehicle |
|---|---|---|
| Tandem dump truck | the integral dump bed | the same chassis |
| Pickup pulling a trailer | **the trailer** | the pickup: motive power, uncertified |
| Truck with a built-in bed | the built-in bed | the same chassis |
| Self-loader with an integral box | the built-in box | the same chassis, with its loading arm |

> **The corollary agents get wrong:** a certification is not per truck. Swapping which pickup tows a
> certified trailer changes nothing; one chassis that can carry two certified boxes needs **two**
> certifications. A tandem's truck and trailer are two certifications, usually but not always with
> consecutive numbers; a trailer swap isn't flagged (ADR-114).

**Crew certifications** cover equipment whose work isn't billed by container volume: a **bucket
truck crew** (hangers, leaners), a **skid steer crew** (pushing debris, clearing), billed per each
or per hour through unit rate tickets. **A crew is its certification**: there is no separate crew
list; the crew certification holds its prime and sub, its equipment, its photos and the number on
its badge, and unit rate work starts by scanning that badge (ADR-228).

## 3A.2 Why both share one base

Both answer the same questions (whose equipment, what number, who certified it, when, photos,
attestation, QC), so they share one base record; they differ in **exactly one thing: whether the
subject is measured** (ADR-009, 015):

```
                       Certification (the base)
   the cert number (§3A.4) · project · prime · sub and its tier (1 or 2) ·
   driver (name, phone, licence: recorded, never checked) · tag, state, expiry ·
   vehicle type and features · date and time · five photos · certifying monitor,
   helpers, representatives' names · QC status · replaces / copied-from links ·
   revoked-from date and reason
              │                                   │
              ▼                                   ▼
      Container part                        Crew part
      the measured boxes (§3A.3),           crew type
      the capacity computed from them       NO MEASUREMENT (invariant 10)
```

A crew certification has **no capacity**: not a missing value to backfill, there is no box to
measure. Field names are `spec/DATA-MODEL.md`'s; the model is `adms-data-model` §3.3.

## 3A.3 Capacity: how a container is measured (ADR-076, 078, 082, 087)

> **This math has to be exact.** It is the firm's own paper form (§3A.8). **User, 2026-09-24
> (Q-68, in `spec/LISTS.md`):** "In fact after the primary , box 1-N can be additions or
> deductions. That's where we list a feature with its measurement and mark if its an addition or
> subtration and what kinda math used to calculate it (divided by 2 or not?). … That math and
> understanding has to be perfect."

```
  All measurements in WHOLE INCHES.

  PRIMARY      V₁ = L × W × H                              (the main interior box)

  BOX i        a shape, labelled by its feature (sideboards, tail gate extension,
   (1…N)       dog box, wheel wells, other), marked ADD or SUBTRACT:
                 rectangle      L × W × H
                 triangle       L × W × H ÷ 2               (the "÷2" mark)
                 hoist / dog house, two lengths:
                                (L₁ + L₂) ÷ 2 × W × H        (the monitor enters both)
                 round bottom   [3.14 × (D ÷ 2)² × L] ÷ 2    (a half cylinder)
                 radius corner  (R × R − 3.14 × R × R ÷ 4) × run × corners,
                                always subtracted
               N has no fixed limit.

  V_total  = V₁ ± every box                                (cubic inches)
  CY       = V_total ÷ 46,656                              (46,656 = 36³)

  ROUND TO HUNDREDTHS AFTER EACH STEP (every box, every subtotal, V_total, CY)
  CAPACITY = CY to the nearest WHOLE cubic yard, .5 rounds UP
  π is 3.14, to match a hand-calculated sheet. NO MANUAL OVERRIDE: a wrong capacity
  is fixed by fixing the measurements.
```

- **Worked example** (made-up numbers): primary 240 × 90 × 60 = 1,296,000 · sideboards 240 × 90 × 12
  = 259,200 **added** · dog box 30 × 90 × 40 = 108,000, **÷2** = 54,000, **subtracted** → 1,501,200
  ÷ 46,656 = 32.18 → **32 CY**.
- **Rounding each step can move a boundary**, and that is right: 32.495 → 32.50 → **33**; 32.4 →
  **32** (ADR-082).
- **Radius corner** (the rounded corners of a bed, not a round bottom): measure L, W and H as if
  square; R = from the imaginary square corner to where the curve starts; run = how far the corner
  goes. R 12, run 60, 2 corners → **3,715.20 cu in** removed (ADR-087).
- **The official USACE example sheet agrees** (user-supplied): bed L × W × H, deductions for radius
  corners and a hoist, a triangle in the bed bottom, and "Round to hundredths after each step"
  (ADR-078).
- **Store the boxes, not just the answer**: each box's dimensions, feature, sign and shape are data,
  so the capacity can always be recomputed and audited.
- **It lives once, in `packages/domain`**, shared by the certifying phone and the server, with unit
  tests from the paper-form examples (ADR-094; REQ-003, REQ-106d).
- **Billing** multiplies the whole-CY capacity by the load call (`adms-validation` §5.5).

> ⛔ **This is the only capacity method.** The truck-capacity section of the `development/` target
> architecture document is **wrong** (user, 2026-09-24). Never use it, and never compare against it.

## 3A.4 ★ THE CERT NUMBER IS THE PLACARD NUMBER IS THE BADGE NUMBER ★

**One identifier, never two** (ADR-016, 045; invariant 9). Any design that carries a "placard
number" beside a "certification number" is wrong for this system.

- **Where it comes from** (ADR-045, 151; Q-96): **system-issued** from the project's cert-number
  series, set at project creation, seeded with a number that doesn't look made up (`730415`) and
  counting up by one; a certifying phone holds a **block of 100** from the series, topped up at sync
  and reclaimed on reset, like ticket blocks. **Or taken from pre-printed certification paper**
  (usually 6 digits; no length enforced), typed in. **User, 2026-09-27 (Q-142):** "Block of numbers
  unless using control tickets in which case we can assume the cert will have its own unique number
  as well and they can manually type it in".
- **Unique within the project**; another project may use the same number, which is not our concern
  (ADR-045).
- **The placard** is blank laminated stock; the monitor writes the number on it and it goes on the
  container: its public identity for the project, readable from thirty feet at a dump gate. It holds
  no data and has no record. There is **no placard printing** (ADR-088).
- **The driver's badge carries the same number** and is what every monitor scans at **New** (ADR-056,
  209). The paper's own barcode isn't used (ADR-080).
- **Exports** that want a "Truck Placard Number" (the USACE LOADM layer, a later candidate) populate it
  **from** the cert number; never a second identifier in the model.

```
 1. A monitor on a phone assigned to certify measures the container.
 2. The number: the phone's next from the project's series (730419), or the pre-printed paper's.
 3. 730419 is written on the placard; the placard goes on the container.
 4. The driver's badge carries 730419; every monitor scans it at New.
 5. Every field event that truck makes records 730419; reports and the ledger show it.
```

## 3A.5 How the cert number reaches a field event (ADR-017)

Every field event records **both** the certification's internal ID (the link) and **a copy of its
number** as scanned: a point-in-time snapshot of the identity the monitor saw. Field events are
evidence and must not change silently because the certification was later edited.

The worker compares the two events' cert numbers **exactly**, never fuzzily; a difference means the
two monitors scanned **different certifications**, a wrong-container problem, and is flagged
(`adms-validation` §5.1). A number scanned that matches no certification on the project leaves the
load **unbilled and flagged** until one exists (ADR-154).

**A truck keyed in by hand** (no badge to scan): the monitor types the number and the capacity they
read; **the certification's capacity bills**, and a typed capacity that differs is flagged ("capacity
typed 60, certified 65") (ADR-154).

## 3A.6 Lifecycle

1. **Certifying happens where there is signal**, on a phone whose **assignment** includes certifying
   (ADR-151, 240), so the project knows the certification exists. The phone suggests subs already
   known under the prime; the monitor types a new one into **tier 1 or 2**, never shared between
   primes (ADR-108).
2. **Five photos**: operator with the placard; interior (rear) or back view; right side; left side;
   front. A missing view is flagged, never blocked (ADR-179).
3. **A certification never ends on its own** (ADR-079). What flags later field events, judged at
   **work time** (ADR-048), still billing:
   - an **expired tag**: "a flag to review the certification". **User, 2026-09-27 (Q-144):** "If the
     trucks tag is exipred we want to know about that, but its just a flag to review the
     certification, which means we flag the ticket with a message about the certication issue."
   - **revoked from a date**, by an admin, with a reason;
   - **replaced** by a new certification (below).
   **A driver's licence flags nothing** (ADR-153): the driver is recorded on the certification only;
   a ticket shows and exports its certification's driver, and no copy is stored on the field event
   (`spec/DATA-MODEL.md` §12, default 12, approved by ADR-289); there is no driver list.
4. **Changes** (ADR-079, 082, 152):
   - **A measurement mistake** → correct the certification in place (audited); its tickets
     reprocess; invoiced ones are unlocked first.
   - **The truck modified** (sideboards added) → a **new certification with a new number** and a
     **replaces** link (the old number, the date, the reason), shown on both ("replaces 730416
     (sideboards added, 14 Oct)" / "replaced by 730420 on 14 Oct"); a **MOD** label may show beside the
     number, display only, **never a prefix**. The old number's field events after that date are
     flagged.
   - **The same truck on another project** → **copy** it: a new number from that project's series and
     a reference to the original. **User, 2026-09-27 (Q-143):** "Copy the cert. Give the new cert a
     number. Created a reference to the old. If a mistake is later found in the copied version, the
     older version is flagged for review."
   - **Never deleted**: it is the evidence that a measurement was taken (invariant 1).
5. **Attestation and QC** (ADR-080, 107): the certifying monitor, who makes and
   measures it, is recorded automatically; a **helper is picked** from the people assigned to the
   project with them, or left blank (never typed, so nothing is flagged; ADR-294, amending ADR-080);
   the **client and contractor
   representatives are names only**. The certification starts at **QC Review**; a back-office user
   sets QC Approved / QC Issues / QC Void, is recorded as **checked by**, and marks whether
   **signatures are on file** (kept elsewhere). **It is usable before QC** (ADR-052). It is QC'd on
   its own, never with a ticket (ADR-168).
6. **Project-scoped**: a container working two projects has a certification on each (the second may
   be a copy). A field event whose number matches no certification on its project is flagged, never
   refused (ADR-052, 154).

## 3A.7 Where it will live

The capacity math and the number blocks in `packages/domain` (shared by the phone and the server);
the certification records in `packages/db`; certifying on the phone in `apps/field` (Phase 3); the
certification screens and QC in `apps/back-office` (Phase 4, REQ-403). The requirements are REQ-106,
106a, 106b, 106d, 106e, 106f. Nothing is built yet (ADR-093).

---

## 3A.8 The paper certification form (user-supplied, 2026-09-24; ADR-073, amended by ADR-080)

The user attached a real **Truck Certification** form (cert 718554, a crew bucket truck, a real
city's disaster; cited as the source document). What it records, and what the system keeps:

| Section | On the form | What the system keeps |
|---|---|---|
| Header | a pre-printed barcode and number; **Capacity** (whole CY, or "Ø CREW"); **Vehicle I.D.** = the same number | the number is the cert number (§3A.4); **the paper's barcode isn't used**, the driver's badge is scanned (ADR-056, 080) |
| General | Applicant (client) · Disaster # · Contractor · 1st tier sub · 2nd tier sub · Date · Time | the client and declaration event come from the project; **the monitor picks the prime and types the sub into tier 1 or 2** (ADR-108); date and time kept |
| Driver | Name · Phone · Licence # · State · Expiration | kept on the certification and shown on its tickets from there (ADR-289); **the licence flags nothing** (ADR-153) |
| Vehicle | Tag # (plate) · State · Expiration | kept; **tag expiry flags** later field events (ADR-079, 153) |
| Vehicle type / features | checklists with "Other" (typed) | the firm's extendable lists (ADR-070); features label the measured boxes |
| Measurement | whole inches; primary box; add/deduct boxes typed A–F with ÷2; round bottom; ÷ 46,656 | exactly §3A.3 |
| Sketch | side and end views, one per box | the five photos (ADR-179) |
| Attestation | measured / calculated / checked by (I.D. #s); applicant rep (name, I.D., signature); contractor rep (name, signature) | the certifying monitor (+ any helper, picked: ADR-294), back-office **QC = checked by** (the audit), the representatives' **names only**, "signatures on file" yes/no (ADR-080) |
| Copies | white / green / yellow / pink / gold | **not kept**: paper-era practice (ADR-080) |

**A crew truck uses the same form**: vehicle type Other ("Bucket"), capacity **Ø CREW**, measurements
and sketches struck through: the crew part, with no measurement. **Not captured, by decision
(Q-76):** truck number, VIN, make, year, colour, tare weight.

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- `BaseCertification` / `ContainerCertificate` / `CrewCertificate` field lists, `containerType
  SELF_LOADER | TRAILER`, `crewType` enums, one box with a unit → a shared base with a container or
  crew part; the firm's lists; the boxes stored (ADR-009, 070, 076; KD-11, KD-45, KD-46).
- `compute_volume()` treating the box as feet, never rounding, returning nothing for a crew → the
  §3A.3 method, in `packages/domain` (ADR-076, 078).
- "The system issues a number, never caller-supplied" → system-issued or pre-printed, unique per
  project (ADR-016 → 045).
- The operator's licence expiry (`operatorLicenseExpDate`) as the only check, `CERT_EXPIRED` →
  `FAILED`, compared to "now", checked at creation too → tag expiry, revocation and replacement flag,
  at work time; the licence flags nothing; nothing refused (ADR-048, 052, 079, 153; KD-35).
- `CERT_WRONG_PROJECT` rejecting cross-project use → flagged; the copy to another project (ADR-052,
  152).
- `ticketService.ts` copying `certNumber`, `assertCertForProject()`, `validate_ticket_pair_cert`,
  `isCertValid()` → the rebuild's field events and checks (ADR-093).
- The contract giving the prime and the tiers → typed at certification under the prime (ADR-081 →
  108).
- Four photos, then "up to 8" → five views (ADR-157 → 179). Colour copies, reps' IDs, the paper's
  barcode → dropped (ADR-073 → 080).
- Crews as records apart from their certifications → the crew certification is the crew (ADR-228).
- "Radius corners: Q-78" → settled (ADR-087).
- "Set up for certifying" on the phone → the assignment includes certifying (ADR-151 → 240).
- Retired examples (placard `10090`, "replaces 718554 … 718601") → the example world (ADR-235).
- Round 13–14 ⚠️ notes stacked on the historical body → absorbed; rewritten in the present tense
  (ADR-138, 250).

# Part 3 — Certify containers and crews

✅ **Approved**

← [Part 2 — People & devices](02-people-and-devices.md) · [Index](../INDEX.md) · Next: [Part 4 — Capture](04-field-capture.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement. Names and examples: `spec/CONVENTIONS.md`.

## What it does

Establishes, once, what each container can carry, so no truck is re-measured on every trip. **A
certification certifies a container or a crew, never a vehicle** (ADR-015). A **container** is
measured and given a capacity in whole cubic yards; capacity × the load call is the billed CY. A
**crew** (a bucket truck crew, a skid steer crew) is certified on the same form with no
measurements; its work bills per item or per hour. **A crew is its certification**: there is no
separate crew list (ADR-228). Each certification has **one number**: cert = placard = badge, never
a second field, unique per project, copied onto every field event that scans it (ADR-016, 017, 045).

**Who:** a monitor on a phone assigned to certify measures and photographs; the system computes the
capacity; the client's and the contractor's representatives are named. **Where:** where there is
signal, so the project knows the certification exists (ADR-151). **When:** before the equipment
works on the project.

**The reference is the real paper form**: `adms-certifications` §3A.8 transcribes it field by field.

## Step by step

1. **The number.** A pre-printed certification sheet's number is typed in, or the phone issues the
   next one from its **block of cert numbers** (100, topped up at sync), taken from the project's
   series (`730415`…); unique within the project. The sheet's barcode isn't used (ADR-045, 080, 151,
   181).
2. **General information:** the client and declaration event come from the project; date and time.
3. **Whose truck:** pick the **prime** it works for, then either the prime itself or a **sub**, typed
   into **tier 1 or tier 2** (the phone suggests subs already known under that prime; the back office
   merges duplicates, audited). The firm doesn't know the subs before they turn up; the prime is on
   site to approve them (ADR-108).
4. **Driver and vehicle:** the driver's name, phone and licence (recorded on the cert only, carried
   onto its tickets; there is no driver list, and **a driver's licence flags nothing**); the vehicle
   **tag** (plate), state and expiry (ADR-153).
5. **Vehicle type** and **features**, picked from the firm's lists (Dump Truck, Semi-Trailer,
   Hydraulic / Non-Hydraulic Dump Trailer, Self-Loading Truck, Other; Sideboards, Tail Gate
   Extension, Dog Box, Wheel Wells, Curved/Angled Sides/Floor, Other) (ADR-070, 076).
6. **A crew?** Mark it a crew: no measurements (invariant 10). Skip to step 9.
7. **Measure, in whole inches:** the primary box (L × W × H), then **boxes 1…N**, each labelled by a
   feature and marked **add or subtract** and **÷2 or not**: a rectangle, a ÷2 triangle, a hoist box
   with **two lengths** (averaged), a **round bottom** (π = 3.14), a **radius corner** (ADR-076, 078,
   087).
8. **Capacity, computed by the system:** round to hundredths at **every step**, total the cubic
   inches, ÷ 46,656, then round to the nearest whole cubic yard (.5 up). **No override**: a wrong
   capacity is fixed by fixing the measurements. The exact method and worked example:
   `adms-certifications` §3A.3 (ADR-076, 078, 082, 087).
9. **Photographs: five** (operator with the placard; interior or back; right side; left side;
   front) (ADR-179).
10. **Attest:** the certifying monitor, who makes and measures it, is recorded automatically; a
    **helper is picked** from the people assigned to the project with them, or left blank (ADR-294);
    the **client and contractor representatives' names** are typed (names only) (ADR-080). The back
    office audits it at QC.
11. **Placard and badge:** the number goes on the placard on the container and on the driver's
    **badge**, which monitors scan at **New** on every field event (ADR-056, 209).
12. **QC (back office, later):** the certification starts at **QC Review**; a back-office user sets
    **QC Approved / QC Issues / QC Void**, is recorded as **checked by**, and marks whether
    **signatures are on file**. The certification is usable before QC (ADR-080, 107).
13. **At reconciliation** the certification is judged at **work time**: a field event after the tag
    expired, after the certification was **revoked** or after it was **replaced** is flagged for a
    certification review and still bills. Nothing is blocked; **a certification never ends on its
    own** (ADR-048, 079, 082).
14. **Later changes:**
    - **Measurement mistake** → correct the certification in place (audited); its tickets
      reprocess; invoiced ones are unlocked first (ADR-079).
    - **Truck modified** (sideboards added) → a **new certification and number**, with a
      **replaces** link to the old one, shown on both (ADR-082).
    - **Pulled from work** → an admin **revokes** it from a date, with a reason (ADR-079).
    - **The same truck on another project** → it is **certified there from scratch**: measured
      and photographed again, with that project's own number. A certification is never copied
      (the user, ADR-328, 329).
15. **A truck keyed in by hand** at a tower (no badge to scan) bills the **certification's**
    capacity; a typed capacity that differs is flagged; no such certification → unbilled and
    flagged until one exists (ADR-154).

## Rules it follows

- Container or crew, the one number, capacity math, lifecycle, copies → `adms-certifications`
- Checks at work time and the flags → `adms-validation` §5.2
- The certification record and its shape → `adms-data-model` §3.1c, §3.3
- A certifying phone and its number block → `adms-field-app` §4A.0

## Where it will live

The capacity math in `packages/domain` (shared by the phone and the server, ADR-094); the
certification records in `packages/db`; certifying on the phone in `apps/field` (Phase 3); the
certification screens and QC in `apps/back-office` (Phase 4, REQ-403). Not built yet: Phase 0 has only a provisional database schema (ADR-268).

## Open questions

None (ADR-230). Radius corners were settled by ADR-087 (Q-78).

---
title: Certifications
description: A certification certifies a container or a crew, never a vehicle. How capacity is measured exactly, why the cert number is the placard and badge number, and how a certification lives and changes.
---

A **certification** is a one-time inspection that fixes what a truck's container holds, or who a crew
is. It is a record, not a ticket's field event: it is made once, and every field event that scans
its badge refers to it.

## A container or a crew, never a vehicle

**What is certified is the thing that holds the debris**, because its volume becomes money
(capacity × load call). The vehicle that moves it is incidental.

| Configuration                    | The container certified | The vehicle                            |
| -------------------------------- | ----------------------- | -------------------------------------- |
| Tandem dump truck                | The integral dump bed   | The same chassis                       |
| Pickup pulling a trailer         | **The trailer**         | The pickup: motive power, uncertified  |
| Truck with a built-in bed        | The built-in bed        | The same chassis                       |
| Self-loader with an integral box | The built-in box        | The same chassis, with its loading arm |

- A certification is not per truck. Swapping which pickup tows a certified trailer changes nothing;
  a tandem's truck body and trailer are **two** certifications.
- **A crew certification** covers equipment whose work isn't billed by volume: a bucket truck crew
  (hangers, leaners) or a skid steer crew, billed through unit rate tickets. **A crew is its
  certification**: there is no separate crew list, and a crew certification has **no measurement**.

## Capacity: measured, never typed

A container's capacity is computed from its measured boxes, exactly as the firm's paper form does
it:

```text
All measurements in whole inches.

Primary box   L × W × H
Each further box, labelled by its feature (sideboards, tail gate extension, dog box, wheel wells…),
marked ADD or SUBTRACT:
  rectangle      L × W × H
  triangle       L × W × H ÷ 2
  hoist          (L1 + L2) ÷ 2 × W × H
  round bottom   [3.14 × (D ÷ 2)² × L] ÷ 2
  radius corner  (R × R − 3.14 × R × R ÷ 4) × run × corners, always subtracted

Total cubic inches = primary ± every box
Cubic yards        = total ÷ 46,656
Round to hundredths after each step; capacity = cubic yards to the nearest whole, .5 rounds up.
```

**Worked example:** certification `730415`, Coastline's dump trailer. Primary 360 × 96 × 72 =
2,488,320; sideboards 360 × 96 × 16 = 552,960, added; total 3,041,280.00 cu in ÷ 46,656 = 65.19 →
**65 CY**.

- There is **no manual override**: a wrong capacity is fixed by fixing the measurements, and the
  boxes are kept so the capacity can always be recomputed and audited.
- The rule lives once, in the shared domain package, so the certifying phone and the server give the
  same answer.

## One number: cert, placard and badge

**The cert number is the placard number is the badge number.** One identifier, never two.

1. A monitor on a phone assigned to certify measures the container.
2. The number is the phone's next from the project's series (`730419`), or taken from pre-printed
   certification paper.
3. `730419` is written on the placard, which goes on the container: readable from thirty feet at a
   dump gate.
4. The driver's badge carries `730419`; every monitor scans it at **New**.
5. Every field event that truck makes records `730419`; reports and the ledger show it.

The number is **unique within its project**. Each field event keeps both the link to the
certification and a copy of the number as scanned, and the worker compares a load's two numbers
exactly: a difference means two different containers, and is flagged.

## Lifecycle

- **Certifying happens where there is signal**, on a phone whose assignment includes certifying.
- **Five photographs**: the operator with the placard, the interior or back, the right side, the
  left side, the front. A missing view is flagged, never blocked.
- **A certification never ends on its own.** These flag later tickets, judged at work time, and the
  tickets still bill: an **expired tag**, a certification **revoked** from a date (by an admin, with a
  reason), or one **replaced** by a new certification. A driver's licence flags nothing.
- **A measurement mistake** is corrected in place, audited, and its tickets reprocess.
- **A modified truck** (sideboards added) gets a **new certification with a new number** and a
  _replaces_ link, shown on both: "replaces 730416 (sideboards added, 14 Oct)".
- **The same truck on another project** is certified there from scratch, with that project's own
  number. A certification is never copied.
- **It is usable before QC.** It starts at QC Review; a back-office user sets QC Approved, QC Issues
  or QC Void, recorded as _checked by_.
- **Never deleted**: it is the evidence that a measurement was taken.

## A truck keyed in by hand

Where there is no badge to scan, the monitor types the number and the capacity they read. **The
certification's capacity bills**, and a typed capacity that differs is flagged ("capacity typed 60,
certified 65"). A number the phone's lists don't hold makes the phone warn and ask to refresh its
lists; nothing is refused. A number with no certification on the project leaves the load unbilled
and flagged until one exists.

## Related

- [The load call](/concepts/load-call/)
- [Flags reference](/reference/flags/#the-certification)

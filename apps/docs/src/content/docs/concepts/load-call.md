---
title: The load call
description: The percentage a tower monitor calls is the number the money hangs on. How billable volume is worked out, which calls are flagged, when a scale weight is taken instead, and the loads that have no call at all.
---

A container is **certified once** (measured, photographed, given a cert number) to fix its capacity
in cubic yards. Nobody re-measures a truck per trip. At the tower, the monitor looks into the bed
and enters **what percentage of that capacity is filled**: the **load call**, a whole number from 0
to 100.

```text
billable CY = certified capacity × load call %
```

For example, certification `730415` is a 65 CY dump trailer. Called at 80%, the load is
65 × 0.80 = **52.0 CY**.

:::caution[A load call is a money decision, not data entry]
Ten points on a 40 CY truck is 4 CY of public money, every trip. That is why the call is taken by
an independent monitor at the tower, why it is photographed, and why extreme calls are flagged.
:::

## Calls that are flagged

Extreme calls are **flagged, never refused**:

| Call                                                         | What happens                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| **0%**                                                       | Always flagged, whatever the limits, and bills nothing (0 CY) |
| At or under the project's **low limit** (5% unless changed)  | Flagged, still bills                                          |
| At or over the project's **high limit** (95% unless changed) | Flagged, still bills                                          |

The two limits are a **project setting** the firm changes or turns off, audited; they start from the
release's built-in defaults (`LOAD_CALL_LOW_LIMIT`, `LOAD_CALL_HIGH_LIMIT`). A reviewer who checks
the tower's photographs and finds a heaped load really was 96% **accepts** the flag with a reason;
nothing about the money changes.

## One quantity, never both

When the pay item the firm's rules pay a load at is measured **by weight** (its unit of measure is
tons), the tower enters the **scale weight instead of a load call**, transcribed by hand from the
scale receipt. The back office works out ahead, from its rules, what each site's phones ask for, so
the monitor never has to know.

- A scale receipt comes only from a final disposal site that weighs, and it matters only where the
  contract pays by weight. It is hand-transcribed, never inferred.
- A weight and a load call are **never compared**: there is no "weight against load call" check.
- A disposal that arrives with both is flagged, and the paying pay item decides which bills.
- One scale weight shared by a tandem's two containers is split by their certified capacities, and
  both tickets are flagged.

## Where the call is taken

- **A load:** at the tower, on the disposal.
- **A haul-out:** at the loading end, the TDSR, on the haul-out collection. The haul-out disposal
  only confirms the truck dumped and left empty.
- **A split haul-out** loaded from several piles: each pile's collection gives the call so far; what
  each pile added is the difference, so a pile's call that isn't higher than the one before it is
  flagged.

## Loads with no call

Some loads take their quantity from **the tickets they carry**, a setting on the pay item: a load of
stumps, or of white goods, is paid from the unit rate tickets it carries, not from a call. A count
at the tower that differs from the tickets the collection lists is flagged.

## Related

- [Certifications](/concepts/certifications/): how capacity is measured
- [Flags reference](/reference/flags/): `LOAD_CALL_ZERO`, `LOAD_CALL_LOW`, `LOAD_CALL_HIGH` and the
  quantity flags
- [The ledger and the audit trail](/concepts/ledger-and-audit/): how a quantity becomes money

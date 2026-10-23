---
title: Flags, never blocks
description: After setup nothing refuses field work. Every problem becomes a flag with a plain message, the ticket goes to one review queue, and a person fixes it or accepts it with a reason.
---

**Flag, never block.** After a project is set up, nothing refuses field work or a record over
eligibility. A truck at the wrong site, a load call of 96%, a certification whose tag has expired:
each becomes a **flag** on the ticket, and the ticket goes to the one review queue.

Monitors work offline and fast; they cannot be asked to resolve a disagreement they cannot see. So
the field never stops, and the back office reviews after the fact, with every piece of evidence in
front of it.

## How a flag reads

A flag states **the ticket and the problem, plainly, and nothing else**. It never guesses a cause
and never tells the reviewer what to do.

```text
Ticket 101008: debris type mismatch (collection Vegetative, disposal C&D). Flagged for review.
Ticket 101009: dumped at Old Quarry Pit, an ineligible site. Flagged for review.
Ticket 101003: load call 96%. Flagged for review.
Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review; not billed.
```

- Every message has one shape: `Ticket <number>: <the facts>. Flagged for review.`
- A flag that stops a line or the ticket from billing ends `Flagged for review; not billed.`
- A flag on a record that isn't a ticket names it: `Certification 730416: …`,
  `Marsh Road TDSR: permit outstanding.`

## What a flag does to the money

Every flag is one kind of thing; none is "harder" than another. Any open flag makes the ticket
`MANUAL_REVIEW`, and **review still bills** wherever an amount can be computed. Each flag says what it
does to the money:

| Bills            | Meaning                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| **yes**          | The ticket bills as if the flag weren't there                               |
| **that line no** | One line can't be computed and bills nothing; the ticket's other lines bill |
| **no**           | Nothing can be computed, so the ticket bills nothing until it is corrected  |

## What a reviewer does with one

| The evidence says                                          | The reviewer                                    | What happens to the flag                                                          |
| ---------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| A captured value is wrong                                  | **Corrects** the field event, in place, audited | The ticket reprocesses; the flag clears if its facts no longer raise it           |
| The setup is wrong (a missing rule, a site's fact, a rate) | Fixes the setup                                 | Every un-invoiced ticket it touches reprocesses                                   |
| The work never happened                                    | **Voids** the ticket, with a reason             | The ticket is `VOID`; its flags stay in its history                               |
| The flag is right as it is                                 | **Accepts** it, with a reason                   | It stays in the history, accepted, and isn't raised again unless its facts change |

- **Accepting never changes what bills.** A flag that bills nothing still bills nothing once accepted.
- **Accepting flags is a grant of its own**: a person granted _correct_ can't accept a flag unless
  also granted _accept flags_.
- Reasons are picked from the firm's own list. Nothing technically stops a wrong choice; the audit
  trail is the backstop.

## A flag keeps its facts

Each flag keeps the facts it was raised on. On a reprocess the worker compares them: the same facts
keep the same flag, with its acceptance; changed facts clear it and, if the problem is still there,
raise a new one that must be looked at again. A cleared flag stays in the ticket's history.

## Never flagged

As important as the catalogue: these are never flags.

- A field event **waiting for its partner**, however long; a **preload**.
- The distance a collection covers, or GPS accuracy.
- Split estimates against the load call; a scale weight against a load call.
- A driver's licence; a tandem's trailer swap.
- Work under an **unplanned assignment**, and planned against actual on the dispatch board.
- A monitor's own hours on the time clock.

## The only thing sync turns away

A **second field event of one kind on one ticket** (two disposals on `101020`, say) is not flagged:
it is **quarantined** at sync, kept in full, and shown in the review queue beside the record that
holds the number, for a person to resolve. A quarantined record is never dropped. See
[Review and correct](/guides/back-office/review-and-correct/).

## Related

- [Flags reference](/reference/flags/): every flag's code, what raises it and whether it bills
- [Statuses and QC status](/concepts/statuses/)

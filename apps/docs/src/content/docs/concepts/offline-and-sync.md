---
title: Offline and sync
description: Phones work all day without a connection and sync whenever there is signal, in any order. How a sync proves who sent it, never stores a record twice, and quarantines a duplicate number instead of dropping it.
---

**Offline is normal.** Curb and dump alike usually have no signal, so nothing in the working day
depends on a connection. A phone keeps everything in its encrypted store and syncs **whenever it
finds signal**: a phone with a monitor signed in tries every few minutes on its own (five by
default), besides signing in, finding a connection and the monitor asking.

## What a sync does

1. **The phone proves who it is**, by signing the server's challenge with its device key, and
   reports its clock.
2. **Records first, photographs second.** Records are small and photographs aren't, so a slow
   photograph never holds up the records behind it.
3. **Every record carries an id the phone made** when it was created. The server keeps an
   idempotency ledger on it: a record sent twice is answered "already saved", never stored twice,
   and never mistaken for a duplicate ticket number.
4. **Each record gets its own answer**: saved, already saved, or quarantined with the reason. The
   phone is told "saved" only for what was stored.
5. **Photographs upload resumably.** An interrupted upload continues where it stopped, and the
   server checks each file's hash against the one the phone recorded.
6. **The phone gets its fresh lists** for its assignment (certifications, sites, its unit rate pay
   items, debris types, the login list), and its block of numbers is topped up.
7. **The server queues reconciliation** for what arrived. The sync doesn't wait for it.

## Arrival order means nothing

Field events arrive in any order, on any day. A disposal may sync a day before its collection; a
phone with a flat battery may sync on Wednesday what it recorded on Tuesday. The worker orders field
events by **field time**, never by arrival, and a ticket waiting for its partner is `PENDING` and
**never expires**.

## The only rejection: a duplicate number

A second field event **of one kind on one ticket** (a barcode scanned twice at the tower, say) is
the only thing a sync turns away. It is **quarantined in full**, with the reason and the record that
holds the number, and shown in the review queue for a person. The phone shows it as **not saved**.

A quarantined record is never dropped: it is a monitor's sworn observation of real work. A reviewer
reads the evidence it carries (the cert number, the times, the site, the photographs) and decides
whether it belongs to another ticket (renumber it), never happened (void it), or something else.
See [Review and correct](/guides/back-office/review-and-correct/).

## Sealed once submitted

Until a monitor submits a field event it is open and theirs to adjust, for days if the work takes
days. **Once submitted on the phone it is sealed for them**: no reopen and no edit, synced or not.
After that only permitted people in the back office correct it, audited.

## Time

The phone's clock is the recorded time. The server compares it with its own at each sync, and a
phone whose clock was off by more than a threshold (`DEVICE_CLOCK_OFF_LIMIT_MINUTES`) has its tickets
flagged, as are work times later than the server received them, or earlier than the phone was
enrolled. Which day a ticket belongs to is the **project's time zone**.

## Related

- [Two field events, one ticket](/concepts/two-field-events/)
- [Assignments and phones](/concepts/assignments-and-phones/)

# Part 5 — Sync

✅ **Approved**

← [Part 4 — Capture](04-field-capture.md) · [Index](../INDEX.md) · Next: [Part 6 — Reconcile](06-reconciliation.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement. Protocol and security: `spec/ARCHITECTURE.md` §9.

## What it does

Moves the field events and records from the phones to the server, **without losing any and without
admitting any twice**. Phones sync **whenever there's a connection** (ADR-240), in whatever order they
find it, some carrying days of work; a phone needn't be handed in for its work to arrive.

## Step by step

1. **A phone connects**, whenever it has a data connection (ADR-099, 240). A phone can stay dark for
   days; its work still arrives, whole.
2. **It proves which phone it is** with its device key, made at enrolment (ARCHITECTURE §7.4), and
   **reports its clock**; a big difference from the server's flags that sync's records (ADR-100).
3. **Records first, photos second.** It sends its field events, ROEs, surveys, incidents, drop-off
   logs and time-clock entries, including an **earlier monitor's** queue on a phone that changed
   hands (ADR-095). **It never sends a change to a record it already sent**: what a monitor
   submitted is sealed for them, and a record sent again is answered "already saved" as it was
   stored (ADR-477). Cancelled field events stay on the phone.
   ⚠️ *ADR-578 (task 3.4.1, agent default): a record the server didn't store (quarantined, or not
   saved and held for a person) stays on the phone, shown to the monitor in the server's words, and
   the phone sends it again by itself once each time it syncs, the same, so it learns when a person
   resolved it ("already saved"); a report not saved is never sent again. The phone's unplanned
   assignments and logged uses of the master passcode go in the sync, ahead of its records.*
   Photos follow: first each photograph's **record**, in the same sync as its record or a later
   one, with the hash taken at capture and the hash of the file it will upload, **never where the
   file goes** (the server makes that place, and holds a photograph whose record it doesn't have
   saved for a person, ADR-481); then each **file**, its upload **resumable**, its hash checked
   against the record's (ADR-101). ⚠️ *ADR-482: the file goes to the media endpoint by the
   photograph's id, in parts that go on where the last one ended; once whole and the one the
   phone fingerprinted, it is kept and its upload time written; a whole file that isn't is set
   aside on the server for a person, and the phone sends it again. The phone keeps every file
   until it is told the file is kept. A depth file has its own fingerprint in the record.*
   ⚠️ *ADR-483: a file goes only once its photograph's record is answered saved (one not saved
   keeps its file with it); an interrupted upload goes on from where the server says the file
   stands, and starts again where the server holds none of it. The back office reads a kept file
   back as a download, never run, and never one that isn't the one fingerprinted.*
4. **The server stores each record once.** Every record carries an ID the phone made; a retried
   upload is answered "already saved" and is **never** mistaken for a duplicate number (KD-56).
5. **A duplicate?** A second field event of the **same kind on the same ticket** (project + workflow
   + bare number + split suffix) from a *different* record is **quarantined in full**, with the reason
   and the record that holds the number: never dropped, never merged, never saved as a field event.
   It appears in the review queue ([Part 8](08-review-and-corrections.md); ADR-022, 236).
6. **Nothing else is refused.** An expired tag, a date outside the active window, an odd time, work
   from a phone taken out of service: all come in and are **flagged** at reconciliation (ADR-052,
   134).
7. **The phone is told the truth, record by record**: saved, already saved, or not saved
   (quarantined). A quarantined record shows as **not saved**.
   ⚠️ *ADR-526: what the server can't save (a record, a photograph whose record it has nowhere,
   an unplanned assignment or a use of the passcode) is held on the server exactly as sent; a
   photograph whose record is held is saved and kept with it, so its file comes. The back office
   reads what is held, every file set aside and every quarantined record, and resolves each once,
   with a reason: a held record **saved as corrected** (under the id its phone made) or **closed**;
   a file set aside closed. A phone whose held things are resolved is turned in.*
8. **The phone receives** its assignment's lists, freshly numbered as a setup version (the certified
   trucks and crews, sites and each site's lookup, ROEs, the roster and login list, control ranges),
   its **number blocks topped up** (ticket numbers and, for certifying, cert numbers), and any new
   master passcode check (ADR-065, 151, 227, 240). Any phone with a connection can refresh its lists
   at any time (ADR-151).
   ⚠️ *As built (ADR-473; confirmed by the user, ADR-474): the sync's own answer carries the blocks, the passcode
   check and the setup version's number; the lists and the login list are read beside it by the
   signed-in monitor's phone.*
9. **Reconciliation is queued** for every ticket the new or changed records touch
   ([Part 6](06-reconciliation.md)); the sync doesn't wait for it (ARCHITECTURE §13).

## What to expect

- **Arrival order means nothing.** Disposals land before their collections, and Monday's work can
  arrive after Wednesday's. Order by field time, never by arrival (ADR-030).
- **The load is bursty.** Quiet for hours, then thousands of field events and their photos in a short
  window. Size for the spike.
- **Unpartnered field events are normal** after a sync and never expire (ADR-053).

## Rules it follows

- Offline, arrival order → `adms-exceptions` Scenario C (ADR-030)
- Duplicates quarantined, never dropped, never acknowledged as saved → `adms-exceptions` §4.3a
  (ADR-021, 022)
- Flag, never block → `adms-validation` (ADR-052); no ageing (ADR-053)
- Identifiers made on the phone; one field event per kind per ticket → `adms-data-model` §3.4
- The phone side of sync → `adms-field-app` §4A.0

## Where it will live

The sync endpoints and quarantine in `apps/api` (Phase 2, REQ-203), the payloads in
`packages/contracts`, the phone's queue and "not saved" display in `apps/field` (Phase 3). Not built yet: Phase 0 has only a provisional database schema (ADR-268).

## Open questions

None (ADR-230).

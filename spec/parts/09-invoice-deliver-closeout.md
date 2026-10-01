# Part 9 — Invoice, deliver & close out

✅ **Approved**

← [Part 8 — Review & correct](08-review-and-corrections.md) · [Index](../INDEX.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement: `adms-ledger-audit` (the lock, batches, the client package).

## What it does

Turns a project's tickets into what the client receives. Open ADMS moves no money and has **no
invoice record**: "invoicing" is the back office checking a set of tickets and **locking them as
invoiced**, optionally grouped in a named **invoice batch**, so they can go to the client and the
contractor can close them out (ADR-057, 061, 228). At the end the back office assembles the **client
package** by hand from the exports (ADR-088).

**Who:** an admin or a manager/analyst with permission. **Viewers:** client users, contractor users
and auditors see their projects through their read-only logins at any time (ADR-169).

## Step by step: invoicing

1. **Pick a set of tickets**, e.g. weeks 1–2 in week 4 of a 10-week project. **Only QC Approved
   tickets can be locked**: QC Review, QC Issues and QC Void all block, and the screen lists them
   (ADR-067, 117, 121). For a load or haul-out what's locked is the **completed load** (a split as
   one), never a single field event; unit rate tickets lock on their own (ADR-168).
2. **Lock them as invoiced** (who, when), optionally in a named **batch** ("Bayline ROW, week of 12
   Oct"): a name and its tickets, no amounts, reportable by name (ADR-228). A locked ticket can't
   change: its transactions can't be regenerated, and a rate or rule change passes it by (ADR-090).
3. **A small fix before the package goes out** (common): **unlock** (audited), correct
   ([Part 8](08-review-and-corrections.md)), let it reprocess (its lines regenerated, the old ones
   kept in the audit log), QC it again and lock it again (ADR-057, 085).
4. People are trusted not to unlock after final closeout without good reason; the audit trail
   records it if they do.

## Step by step: closeout and delivery

1. **The project's end date passes.** Nothing is refused: a field event whose load time (its
   collection's end) falls outside the window still comes in, **flagged "project not active"**.
   Extending the window is an ordinary, audited edit (ADR-052, 057, 161).
2. **Clear what's left.** Review the flags; decide the pending tickets (they never expire on their
   own, ADR-053).
3. **The back office builds the client package by hand** from the exports: the project's final
   tickets with their photos and receipts, the transactions, and the other records (surveys,
   incidents, certifications), zipped. It must let the client match the hauler's invoice and the
   landfills' records. The system doesn't generate it (ADR-088). Reports are fixed exports plus saved
   filters (ADR-228).
4. **Hand it to the client.**
5. **Close the project.** Nothing is deleted. Years later any transaction can still be walked back to
   its field events, certification, photos, GPS and every audited change (invariants 1–3).

## Rules it follows

- The invoice lock, batches, QC, the client package → `adms-ledger-audit`
- The active window by a load's time → `adms-validation` §5.2, §5.4a (ADR-161)
- Regeneration, audit copies, locked tickets untouched → `adms-ledger-audit` (ADR-085, 090)
- No hard deletes; close, never delete → `adms-domain` §1.5

## Where it will live

The lock, batches and exports through `apps/api`, the screens in `apps/back-office` (Phase 4,
REQ-406); the database refuses a transaction delete on a locked ticket (ARCHITECTURE §5.3). Not built yet: Phase 0 has only a provisional
database schema (ADR-268).

## Open questions

None (ADR-230).

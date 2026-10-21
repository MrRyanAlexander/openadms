# Part 2 — People & devices

✅ **Approved**

← [Part 1 — Set up](01-setup.md) · [Index](../INDEX.md) · Next: [Part 3 — Certify](03-certification.md)

> **Approved by the user 2026-09-29** (ADR-269), in today's rules (rewritten 2026-09-29, ADR-247). Sequence here; rules in the
> skills, which win on disagreement. How it's built and secured: `spec/ARCHITECTURE.md` §6–§8.
> **The word is "setup", never "provisioning"** (ADR-095).

## What it does

Decides who can do what, and on which phone:
- **People are added once** and reused across projects; each field worker has a system-issued
  **Monitor ID** (`M004127`) (ADR-105, 120).
- **A phone is enrolled once.** Each day the back office writes **assignments** on the **dispatch
  board** (who works where, on what); a monitor signs in on any enrolled phone and it takes their
  assignment (ADR-240).
- **Back-office staff** work in the web app; **clients, contractors and auditors** get read-only
  views (ADR-050, 169).

## The people

| Who | How they get in | What they can do |
|---|---|---|
| **Admin** | Back-office login, two-step sign-in required | Everything, setup included |
| **Manager / analyst** | Back-office login, two-step sign-in required | What they're granted: review, correct, renumber, void, accept flags, QC, lock as invoiced, unlock |
| **Field monitor** | Monitor ID + password on an **enrolled phone**, online or offline from the phone's login list | Record field events for their assignment's **one** project; adjust one until they submit it; never reopen or edit one they submitted (ADR-477); never see a rate or a code |
| **Supervisor holding the master passcode** | The firm's one master passcode, on a phone | Enrol a phone; create monitors; set a phone up when its monitor has no assignment; sign in as its monitor; switch its monitor; move its site; sync and turn it in |
| **Client user / contractor user / auditor** | Read-only web login issued by the firm, two-step optional | Clients and auditors: the whole project except personal phone and licence numbers. A contractor: only its own tickets and transactions (a prime with its subs'). Nobody's hours |

(ADR-050, 105, 106, 120, 169, 170, 240, 241)

## Step by step

1. **Add a person once** (ADR-105). **Field monitors** are created **on a phone, online**, by the
   master user ("Create monitor": username and password, saved on the server). **Back-office and
   outside users** are created by an admin in the back office. For every person: name, contact,
   role; the system issues the **Monitor ID** (an employer's own ID may be added); their employer is
   a contractor record, and a subcontracted monitoring firm or temp agency is a contractor of the
   monitoring kind (Q-97).
2. **Grant permissions** to a manager/analyst: correct, renumber, void, accept flags, QC, lock and
   unlock as invoiced (ADR-050), setup, dispatch, approve hours, and **what they may see**: view
   review, view setup, view dispatch. A manager/analyst reads a part of the back office only with
   its view, and an act needs its part's view beside it (the user, ADR-539). Each is its own grant;
   one is taken away by archiving it, never deleted, and every grant and removal is audited
   (*agent default*, ADR-315).
3. **Enrol a phone, once** (online, master passcode): it makes its **device key** and joins the
   firm's phones, with no project and no monitor (ADR-240; ARCHITECTURE §7.4). Its data is
   **encrypted** and **never backed up**, bound to that phone (ADR-096).
4. **Dispatch, each day.** The back office writes each person's **assignment** on the dispatch
   board: date, project, their work (ticket types, the unit rate pay items they do, certifying), **one
   site** where the work is at one (a tower, either haul-out end, a drop-off log), optionally a
   phone. Yesterday's board can be copied. The board shows planned against actual (assigned with no
   field events; a site with field events and nobody assigned) as views, never ticket flags; an
   assignment never expires and never stops work (ADR-240).
5. **Start of day.** The monitor signs in on any enrolled phone with their **Monitor ID** and
   password (the firm's practice: their phone number without the area code). Online, the server
   signs them in on that phone for the shift (twelve hours, one monitor at a time; ⚠️ ADR-443, an
   agent default awaiting approval) and the phone receives **their assignment** for the project's
   own day (the one that names this phone, else the only one they have; where two projects are
   left and nothing says which is this phone's, none, and the phone says so; ⚠️ ADR-444, an agent
   default awaiting approval) and its project's lists (the certified trucks and crews, sites,
   ROEs, the roster and **login list**, number blocks or control ranges, the unit rate pay items and
   their settings for unit rate work, and **for a site, what it asks for**, ADR-227, 243). One
   assignment on a phone at a time, so **one project** (ADR-145). A disposal phone holds **no ticket
   list**; it trusts the scan (ADR-071).
6. **No assignment?** The master passcode opens **setup on the phone**: project, work, site, and the
   monitor from the login list; online, or offline on the project whose lists the phone already
   holds. It's recorded as an **unplanned assignment**, marked (not flagged), and appears on the
   board at sync (ADR-240).
7. **Offline sign-in** checks the phone's login list. Monitor credentials work only on enrolled
   phones, never on the web; sign-in attempts back off and lock until the master passcode
   (ARCHITECTURE §7.2, ADR-139). The master passcode may open a **temporary session** for a roster
   monitor, marked on every record and ending at day end (ADR-120).
8. **The monitor works** ([Part 4](04-field-capture.md)); the lists go stale and the phone warns,
   never blocks. **Once the monitor submits a record it is sealed for them**: no reopen and no
   edit, synced or not; only the back office changes it, once the server has it. One not yet
   submitted stays open and theirs to adjust, for days where the work takes days (ADR-477).
9. **Switching monitors** on a phone: the master passcode first, then the new monitor signs in with
   their own ID and password (same project). An earlier monitor's unsynced work stays theirs and
   syncs in the background (ADR-095, 120). **Moving site** works the same way and is recorded; each
   record keeps the site it was made at (ADR-195). *(ADR-458, agent defaults, awaiting approval:
   a move, and a switch to a monitor who has no assignment, each make a new unplanned assignment
   on the phone, reported at its next connection; the earlier assignment stands as it was, and
   the monitor's sign-in on that phone takes the one made on it last.)*
10. **The time clock** (where the project has it on): anyone with an assignment clocks in, takes a
    break and clocks out **by hand**, with simple nudges ("You're not clocked in. Clock in now?");
    activity lines are pre-filled from the day's field events; a **manager approves the day**
    (locked, unlock audited); hours are exported for payroll and client billing. It's never related
    to crew-time billing (ADR-100, 241).
    *(Built on the server, task 3.7.1, ADR-598: each entry syncs as the worker's own from their
    phone, the day's lines with the clock-out; the phone is told whether the clock is on; a
    manager, never the worker, approves the day and unlocks it with a note; the export reads each
    day's entries, lines and hours, the day ending before midnight in the project's time zone,
    no cap. The phone's screens: task 3.7.2; the approval screen and the export: Phase 4.)*
11. **Sync whenever there's a connection**, records first, photos after ([Part 5](05-sync.md)); the
    phone is topped up with numbers and fresh lists. A phone needn't be handed in for its work to
    arrive (ADR-240).
12. **Taking a phone out of service:** with the master passcode, **sync and turn in**, even without
    the monitor: it uploads every queue, waits for the server to confirm each record, returns its
    unused numbers and wipes itself (ADR-096, 134). ⚠️ *As built (ADR-488): it is told to wipe only
    when the server has everything it still holds; its key is revoked in the same step, so it is
    refused from then on (the user kept that moment: KD-77 closed, ADR-495).* ⚠️ *As built in the
    field app (ADR-580): "Sync and turn in" is on the sign-in screen, in Settings and on Sync; the
    phone is erased (its keys first) only on the server's word, and a turn-in whose answer was lost
    is known done when the server then refuses the phone's key alone; if the server lacks
    anything, the phone keeps everything and shows what is missing.*
13. **A lost or broken phone** is marked in the back office. If it turns up and syncs, everything on
    it is received: what it made **after** its removal time arrives **flagged**; then its number
    block is retired and it's wiped, and only then refused (ADR-065, 134). ⚠️ *As built (ADR-488):
    it is turned in like any other phone; every block of a phone marked lost is retired whole,
    whatever it reports.* ⚠️ *As built (ADR-520, 530): the removal may say when it went (stated by
    hand) and why (the firm's reasons list); a lost phone may later be made retired, and a found
    one put back in service while its key stands. **If it isn't turned in within the firm's time
    (24 hours from its last mark as shipped, a firm setting in hours or off), the worker revokes
    its key** and retires its blocks; it may still sync and be turned in, but only with the master
    passcode typed beside its key.*
14. **Issue read-only logins** to a client, contractor or auditor for their projects (ADR-169).
    The admin says what kind of viewer it is, which projects it sees, and a contractor user's
    contractor; a project is taken away by archiving. A client user and an auditor see their
    projects' whole setup too; **a contractor user sees none of it** (only the project's name and
    dates), and no viewer sees a client's or a contractor's contact details (*agent defaults*,
    ADR-315).

Every record says who made it and on which phone, under which assignment and setup version; a
back-office-created record says who and why; a temporary session says so (ADR-156, 240).

## Rules it follows

- Who's who, roles and the master passcode → `adms-domain` §1.4
- Enrolment, the assignment on the phone, sign-in, switching, the time clock on the phone,
  encryption, turn-in → `adms-field-app` §4A.0
- `Device`, `Assignment`, `ClockEntry`, `User` → `adms-data-model` §3.1c
- Nothing can be validated in the field; an out-of-service phone → `adms-exceptions`
- The one master passcode per firm → ADR-106; two-step sign-in → ADR-170

## Where it will live

Users, devices, assignments and clock entries in `packages/db`; sign-in and device checks in
`apps/api` (Phase 2); the phone side in `apps/field` (Phase 3); the dispatch board and time approval
in `apps/back-office` (Phase 4); the read-only portal in Phase 4 (REQ-408). The Phase 0 model covers
time zone, device, assignment and Monitor ID (REQ-019…021; built 2026-10-01, ADR-281: the database
issues the Monitor ID and keeps the master passcode's slow hash; an assignment names its unit rate
pay items, ADR-286).

## Open questions

None (ADR-230).

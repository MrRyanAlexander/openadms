---
name: adms-field-app
description: Open ADMS field app and phones, in today's rules. Covers enrolling a phone once, the day's assignment it takes at sign-in, setup by master passcode when there's no assignment (an unplanned assignment), offline sign-in from the login list and its safeguards, switching monitors and moving site, encryption, the time clock on the phone, syncing whenever there's signal, sync and turn in, an out-of-service phone (the Phase 0 part, ARCHITECTURE §7–§8); what a phone holds for its assignment (lists, the site's quantity lookup, never rates or rules); and the later-phase capture notes: offline as the only mode, advisory on-device checks, badge first and number last, every start list, the split chain, printing, scanning, GPS and photos. Use when touching enrolment, sign-in, the phone's lists, sync from the phone's side, or anything a monitor captures. The workflows themselves are adms-ticket-workflows.
---
<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-251; the Phase 0 device and assignment models built, ADR-281; split haul-outs, ADR-295; a badge's number the phone's list doesn't hold, ADR-421; enrolment through the API, ADR-439; the assignment taken at sign-in, ADR-444; the lists read by the phone, ADR-450) -->

> **This page states today's rules** (last changed by ADR-295, as its status line lists). Each rule cites its ADR; what changed is in
> the History list at the end. The user's own words are quoted and marked **User**. If this page and
> `agent_store/SUMMARY.md` disagree, SUMMARY wins: log a KD (`adms-decisions`). How each piece is
> built and secured: `spec/ARCHITECTURE.md` §7–§12. The worked example is `spec/golden/MISSION.md`
> §2 (its phones and assignments); names and examples follow `spec/CONVENTIONS.md`.
> **The word is "setup", never "provisioning", "provision" or "provisioned"** (ADR-095), in docs,
> screens and code.

# PART 4A — THE FIELD APP AND THE PHONE

**Scope.** §4A.0 (enrolment, the assignment, sign-in, the phone itself) is **Phase 0** scope: its
models are REQ-019…021 and BACKLOG 0.4.3 (built 2026-10-01, ADR-281). The rest is **Phase 3** (the capture screens): build it
when `NEXT.md` opens that phase, from these notes and the ADRs they cite. **Each monitor records a
field event** on the phone (`adms-domain` §1.2; ADR-236); **the monitor enters only the main ticket,
fast**; fees, pricing, zones, mileage and checks are the system's work, after sync (ADR-224).

## 4A.0 Enrolment, the assignment, sign-in and the phone itself

**User, 2026-09-29 (ADR-240, in chat):** "i love this because its way smarter than doing all the
mental gymnastics and backend math we imagined before, and it solves a lot of the headaches at
nightly checkout. It also solves natively a big issue with daily dispatching of users for work which
gets tracked on a spreadsheet."

1. **Enrol a phone once** (online, master passcode): it makes its **device key** in its secure
   hardware (iOS Secure Enclave / Android Keystore; never exportable, so a phone can't be copied or
   swapped) and joins the firm's phones. No project, no monitor (ADR-240; ARCHITECTURE §7.4).
   **The key is ECDSA on P-256; the phone proves itself by signing the server's challenge with
   SHA-256, the text to sign being the domain's `PhoneProofRules.signed`; the server is sent the
   public half only** (ADR-437). **It enrols by `POST /phones/enrolments` (its name on the
   dispatch board, the master passcode, the public key) and is answered its id and the version of
   the master passcode it was enrolled under; the record names the master passcode itself, never a
   person. A wrong passcode is refused by one code; from the fifth wrong try in a row the next
   must wait, and the fiftieth locks enrolment until an admin changes the passcode** (ADR-438, 439).
2. **Create field monitors on a phone, online**: the master passcode → "Create monitor" → the
   username is the system **Monitor ID** (`M004127`); the password is, by the firm's practice, the
   monitor's phone number without the area code (ADR-105, 120).
3. **The day's assignment** comes from the back office's **dispatch board**: person, date, project,
   their work (ticket types, the unit rate pay items they do, certifying), **one site** where the
   work is at one (a tower, either haul-out end, a drop-off log), optionally a phone (ADR-240).
4. **Start of day**: the monitor signs in on **any enrolled phone** with Monitor ID + password.
   **Online, the phone receives their assignment** and its lists (§4A.2a) and number blocks. No
   master passcode, no picking. **The sign-in's own answer carries it** (`POST
   /phones/current/sign-ins`, ADR-444, an agent default): theirs for the project's own day, the
   one that names this phone, else the only one they have; where several are left (two projects
   and a phone neither names) the phone takes none and says so, and with none that day the
   monitor is signed in all the same and told there is none. **One assignment on a phone at a time, so one project**; a tower
   monitor working two projects carries two phones (ADR-145).
5. **No assignment?** The master passcode opens **setup on the phone**: project, work, site, and the
   monitor from the login list; online, or offline on the project whose lists the phone already holds
   (a new project needs a connection). It's recorded as an **unplanned assignment**, marked, not
   flagged, and appears on the board at sync (ADR-240).
6. **Offline sign-in** checks the phone's **login list**, a sign-in check for each monitor enabled on
   its project (ADR-105). The safeguards, because a phone-number password is easy to guess
   (ARCHITECTURE §7.2, ADR-139):
   - **monitor credentials work only on enrolled phones**, never on the web or any API but device
     sync;
   - the login list lives **only inside the encrypted store**, each entry a slow Argon2id hash with a
     salt unique to that phone;
   - sign-in **backs off after 5 wrong tries and locks after 10** until the master passcode;
   - a phone taken out of service is **received**, what it made after its removal time **flagged**
     (ADR-134);
   - a screen-lock passcode on every phone is strongly recommended.
   The app locks after inactivity. Monitors' sign-in has no two-step code (ADR-170).
7. **The master passcode** (one per firm, set at install, changed only when the firm chooses; the
   server and each phone keep only a slow hash) can also **sign in as the phone's monitor**; that
   session and every record in it are marked. Every use is logged on the phone and synced as a
   security event (ADR-106).
8. **Switching monitors** needs **the master passcode first**; then the next monitor signs in with
   their own Monitor ID and password, so the server knows it's them. **Shortcut:** the master passcode
   opens a **temporary session** for a monitor picked from the roster, marked on every record and
   ending at day end. An earlier monitor's unsynced work is **archived on the phone, still theirs,
   hidden from the next monitor**, and synced in the background (ADR-095, 120).
9. **Moving site** is done on the phone, offline, with the master passcode, from the project's sites
   it holds, and is recorded; each record keeps the site it was made at (ADR-195). Switching and
   moving amend the phone's assignment.
10. **Data on the phone** (ADR-096; ARCHITECTURE §8): an **encrypted database** whose random key is
    held this-device-only in the Keychain / Keystore, **never backed up** (excluded from iCloud and
    Google backups); the monitor's password gates *using the app*, not *decrypting the data*, so a
    supervisor can sync a phone its monitor walked away from. The browser test build uses IndexedDB
    with a non-exportable WebCrypto key: fine for testing, never for real work.
11. **Sync whenever there's a connection**: records first, photos after, the phone told the truth
    record by record (saved, already saved, not saved); topped up with numbers and fresh lists; any
    phone with a connection may refresh its lists at any time (ADR-151, 240; ARCHITECTURE §9).
    **A phone needn't be handed in for its work to arrive.**
12. **Sync and turn in** (taking a phone out of service), with the master passcode, even without the
    monitor: it proves itself, uploads every queue (archived ones too), waits for the server to
    confirm each record, returns its unused numbers, then wipes. Nothing is wiped before the server
    confirms it; cancelled field events are the only thing never synced (ADR-056, 096, 134).
13. **The time clock** (where the project has it on), on the **assignment**: clock in, a break
    (start and end) and clock out **by hand**. **Simple nudges only**: "You're not clocked in. Clock
    in now?" on starting a field event; "Clock out?" on signing out. Activity lines are pre-filled
    from the day's field events for the worker to edit and approve at clock-out, with lines the app
    can't know (travel, standby, training) picked from the firm's list. A day ends before midnight in
    the project's time zone; no cap on hours. **Never related to crew time** (ADR-063, 100, 241).
    **User, 2026-09-29 (ADR-241, in chat):** "to start just make it manual makes sense, but suggest
    like if they start work but aren't time in right? simple stuff nothing complex".

**Phones:** the firm issues **iPhones or Androids**; testing goes **browser first, then iPhone, later
Android** (ADR-099). Every screen is translatable, English first; US units (ADR-172).

## 4A.1 Offline is the only mode (ADR-030)

Everything below assumes the phone is disconnected through the working day, at the curb **and** at
the tower, syncing whenever it finds signal, perhaps days later. Not "offline-tolerant": offline is
the normal case. Every control that matters runs **after the fact**, on the server.

## 4A.2 On-device checks: advisory, never blocking (ADR-031, 052)

- **Its own duplicate check**: the phone checks its own records before accepting a scan. This catches
  the common case, the same monitor scanning one barcode twice in a shift (`adms-exceptions` §4.3a
  Scenario A), before it becomes a quarantine. Its limit: it knows only what *this* phone has seen.
- **Its lists are stale by construction**: a certification revoked this morning still looks active on
  a phone that synced yesterday. So a mismatch **prompts the monitor** ("this certification isn't in
  your list: continue?") and **never blocks**; blocking on stale data strands honest work in the field.
  The phone shows its own staleness ("Last synced: 2 days ago").
- **The one check that must match before a field event saves** is the re-entered number (below):
  data entry, not eligibility (agent default, ADR-209).

### 4A.2a What a phone holds for its assignment (ADR-207, 213, 223, 227, 240, 243)

For its current assignment (or unplanned assignment) a phone's lists carry: the project's
**certifications** (numbers, capacities, primes and subs), **sites**, **ROEs** (with the ROEs whose
pre-work survey is done), its **control ranges or number block** (and a **cert-number block** when
certifying); the **forms' debris types** (without those *Hidden on phones*) and **field tags**; the
lists its start menus need (incident types and sub-types, survey work types, reasons); for unit rate
work, **the unit rate pay items the assignment names**, with their settings, size bands, payable type
and kind of work; for a phone at a site, **that site's quantity lookup**; the login list; the master
passcode check; and the **setup version** every field event records. **The phone asks for them by `GET
/phones/current/lists` whenever it has a connection, its monitor signed in** (ADR-450, an agent
default): the server answers the assignment the phone takes now and its lists, or says there is
none, and then the phone keeps what it holds. Built so far: the number blocks, debris types,
field tags, reasons, the unit rate pay items and the incident and survey lists (ADR-449's cut);
and (ADR-451, agent defaults) the certifications (never the driver), the sites by name and use,
the ROEs by number, address and parcel with whether the pre-work survey is done (never the
owner; only for a phone whose work names an ROE), the control ranges, the pay items' capture
settings and the site's quantity lookup; and (ADR-453, agent defaults) **the setup version**:
the lists say which version of the project's setup they are (`setupVersion`, from 1). A version
numbers what the project's phones are shown of its setup, never its certifications, ROEs or a
phone's numbers; a new one is made only when a phone is first sent lists that differ; the back
office can ask a site's quantity lookup as any version held it. Still to come: the login list
and the master passcode's check.

- **Never on a phone: rates, rules, or a load's pay items.** No phone knows which pay item a load is
  paid at: its mileage, so its pay item, is known only after sync (ADR-221, 223).
- **The site's quantity lookup** is worked out ahead by the back office from the rules that could match
  at the site, per debris type and prime: all paying pay items per ton or pound → **the scale weight**
  instead of a load call; all "quantity from the tickets it carries" → **a count**; anything else →
  **the load call** (ADR-227, 243). A phone that hasn't refreshed asks from the lookup it holds; the
  event's setup version explains it.
- **A badge's number that isn't in the phone's certifications** (the user, ADR-421): the phone
  warns, asks to refresh its lists if it has a connection, and otherwise still lets the monitor
  key the truck in by hand (ADR-154). **User, 2026-10-08:** "when a cert is hand keyed the phone should warn, request refresh if avail, fallback to hand keyeed still". Never a refusal. Phase 3 builds it (REQ-317).
- **The tower holds no ticket list** (ADR-071): it trusts the scan and records what it's given.

## 4A.3 The split chain

On a project that **allows split loads** (ADR-137), a collection first asks **"normal or split?"**.
The first collection of a split is **`-A`**, never bare (ADR-173). A **split** button, working much
like the waypoint button, starts the next collection event in the chain, `-B`, `-C`…, pre-filled from
the current one, with fresh time and location; each asks **"what ROE is this ticket for?"** and the
monitor's **estimate** in CY for that property (ADR-032, 055). The chain closes out the way any
collection does. **The driver carries one barcode, the base number**; the tower never sees the
suffixes (`adms-exceptions` Scenario D). **A haul-out collection splits the same way** (ADR-295): each
pile is the next event in the chain, with its own debris type and field tag, and instead of an
estimate the monitor gives **the load call so far**; the last is the haul-out's.

## 4A.4 Capture rules

| Rule | Source |
|---|---|
| **Badge first, number last** on every phone: **New** scans the badge (the certification loads, capacity included; **the certification says whose work it is**, ADR-186); **Complete** takes the details, then the number: the control ticket scanned or a generated number shown, then **re-entered by hand**, generated numbers too | ADR-209 |
| **Picked by name, never a code or a rate**: a load's or haul-out's **debris type** on Complete, at both ends; on unit rate, the **payable type** after the crew photo, and the phone works out the pay item from the bands and prints it | ADR-207, 213 |
| **One quantity, never both**, at the tower: the load call, the scale weight or a count, as the site's lookup says; at a haul-out's loading end, **always the load call**; a Final Disposal tower may also offer the scale receipt number | ADR-013, 223, 227, 243 |
| The **load call is typed** as a whole number 0–100: no picker, no steps, no suggestion; 0 is accepted (and flagged later) | ADR-111, 116 |
| **The site comes from the assignment**; no start list shows sites; a curb collection has no site | ADR-195, 240 |
| **No zone, no destination**: the worker attaches the zone; the system checks where debris went | ADR-135, 205 |
| **Collection address**: "Capture GPS", then "Look up address" (our API asks our Nominatim server when online), else the street number and name typed | ADR-111, 119 |
| A number **typed** because the barcode won't read is flagged, with a reason from the firm's list | ADR-111, 173 |
| **A load that carries tickets**: the loading monitor adds each carried ticket by its number (painted on a stump, or the white goods ticket's); the tower counts | ADR-192, 204, 243 |
| **Field tag**: optional, right after the debris type (collection, haul-out's loading end, unit rate); the tower doesn't take one | ADR-216, 218 |
| **Unit rate**: a crew badge scanned once stays the working crew until the monitor changes it; shown clearly and confirmed on each completion; where the pay item allows it the monitor may **mark the work ineligible** (flagged) | ADR-111, 210 |
| **Measurement**: at chest height, the monitor says whether it's a **circumference or a diameter**; a stump is its diameter two feet up, never a circumference; the stump screen also takes the root ball's diameter, "half or more exposed" and the survey number | ADR-177, 187, 198 |
| **Crew time**: items with hours to the quarter hour, the same screen shape as white goods | ADR-084 |
| **Photos** from the camera only, never the gallery; fingerprinted (SHA-256) at capture; shrunk natively keeping location, time and depth data; **at most 8 per ticket**; "required" is a pay item setting; a certification takes **five** set views | ADR-101, 157, 179 |
| **GPS**: the phone sends whatever fix it has and never judges its accuracy; the back office adjusts drift | ADR-083 |
| **Times** are the phone's clock, shown in the project's time zone; the server checks they make sense | ADR-100 |
| **A finished field event is reopenable until the monitor ends the shift**; an edit to one already sent travels as the edit log (field, prior, new, time), audited under the monitor; never after the shift | ADR-240 |
| **A sync rejection** (a quarantined duplicate) shows the monitor **"not saved"**, never swallowed | ADR-022 |
| **Certifying**: pick the prime, type the sub into tier 1 or 2 (the phone suggests known subs of that prime); the five photos; the capacity computed, never typed | ADR-108, 179, `adms-certifications` |
| A load **turned away** at the tower gets nothing | ADR-155 |

## 4A.5 Numbers, printing and scanning

| Project source | The number |
|---|---|
| **Control tickets** | Pre-printed barcoded stock; the ranges are entered at setup and sent with the phone's lists; the monitor **scans** the control ticket at the end of Complete. A scan outside the ranges is questioned, never refused |
| **Generated** | The phone issues the next number from its **1,000-number block** of the project's series (topped up at sync, the unused rest reclaimed on reset, a lost phone's block retired; it warns at two days' worth left) and shows it at the end of Complete. **Unit rate tickets are always generated** |

(ADR-056, 065.) Disposal phones issue nothing. Numbers are bare; `COL` `DIS` `HOC` `HOD` `URT` labels are
display only, and the barcode carries the bare number (ADR-062).

- **Printing on every project** (a Zebra ZQ printer): two collection copies, or the control ticket and
  its stub; a disposal copy for the driver at the tower, the haul-out's loading end and the final
  site; unit rate always; an itemised certification receipt. The barcode (Code 128) is the bare
  number; **receipts are never records**, are generated on the fly and can be reprinted. On a
  control-ticket project the tower may instead write the load call, their details and the truck
  number **on the back of the control ticket**; a haul-out prints at its loading end (ADR-102, 115;
  ARCHITECTURE §12). No placard or badge printing (ADR-088).
- **Scanning**: the phone's camera or a keyboard-style Bluetooth scanner; anything printed scans back.
- **Cancelling**: a field event started by mistake can be cancelled; it's never synced and stays on
  the phone until it's set up again, so it can be extracted if needed (ADR-056).
- **Never block the monitor**: the phone warns, the server flags, nothing refuses work (ADR-052).

## 4A.6 Every start: start → a list → maybe a sub-list → the details (ADR-127, 129)

Each list is built from the project's setup and the firm's own values, trimmed to the phone's
assignment:
- **Collection**: "normal or split?" first where the project allows split loads; then the badge; on
  Complete the load form's **debris types** (ADR-137, 209).
- **Disposal, haul-out collection and disposal**: the badge; on Complete the form's debris types.
- **Unit rate**: the crew badge, the crew photo, then the **payable types** the assignment's unit
  rate pay items cover, each once; then the kind of work's screen (a number, a measurement, items, or
  items with hours) (ADR-207, 213).
- **Surveys and ROEs**: the work type (Pre-work survey · Post-work survey · ROE); a phone-made ROE
  takes a number from the block unless the paper ROE has one (typed) (ADR-149, 181).
- **Incident**: its type, then the firm's sub-types if any; then whichever of the contractor
  involved (picked by name), a cert number and an ROE number the project's incident form offers,
  each optional; it records and never stops work (ADR-052, 137, 328, 334).
- **Citizen drop-off log** (a phone at a site): the site from the assignment, the resident's name and
  origin address (optional), photos (optional), notes, the firm's fields; no quantity, number or cost
  (ADR-184, 188, 215).

## 4A.7 From the user's Build 1 field-app board

Kept so they aren't rediscovered (`spec/FROM-BUILD-1.md` §15). Settled: the collection address
suggested at the end of the load (Q-104), "skip barcode" with a reason (Q-105), the load call typed,
not a stepped picker (Q-106), a crew badge that stays active (Q-107). **Phase 3 design, not yet
decided** (`NEXT.md` lists them as later-phase): a confirmation after each captured value ("You have
selected 55%. Is that correct?"); a monitor scorecard; a bottom menu of Time, Map, Work, Chats,
Settings; whether to keep hand re-entry of the number (ADR-209) once the app is built.

---

## History

What this page used to say, and why it changed. Never build from the left-hand side.

- Setup at the office each day, online, picking project, ticket types and monitor; phones handed in
  at the end of the day to sync → **enrolled once**; the day's **assignment** from the dispatch board;
  setup by passcode only when unassigned; sync whenever there's signal (ADR-095 → 240).
- "Only the set-up monitor can sign in" → any enrolled phone, the login list for its project; the
  master passcode first to change monitor (ADR-095 → 105, 120).
- Every ticket starting from a pay item picked from "shown to monitors" codes, by code and name, only
  the badge's prime's codes, a name shown to monitors; pay items and their settings (with "requires
  weight") pushed to every phone for every ticket type → the monitor picks a debris type or a payable
  type by name; no pay items on a load's phone; one quantity from the site's lookup (ADR-175, 176,
  182, 185, 191 → 207, 213, 223, 227, 243).
- Number, badge, then pick, all at the start → badge first, number last, re-entered (ADR-191 → 209).
- The tower seeing the list of a load's stumps and confirming → the tower counts; the worker compares
  after sync (ADR-192 → 243).
- Site options (haul-out, citizen drop-off, HHW) deciding which sites a phone lists; citizen drop-off
  as a ticket type → the site from the assignment; a drop-off log (ADR-180, 190, 193 → 184, 195, 215,
  240).
- Photo caps of 4 per ticket and 2 per hazard item; "GPS accuracy captured" → at most 8 per ticket, five
  for a certification; no accuracy check (ADR-083, 157, 179).
- "Capacity is never typed" → a truck keyed in by hand bills the certification's capacity (Q-98 →
  ADR-154). "No eligibility marking by the monitor" → allowed where the pay item says (ADR-210).
- "Reopenable until it syncs" → until the monitor ends the shift (ADR-072 → 240). A stale phone's
  "24-hour re-check" → dropped: phones sync whenever there's signal (ADR-240).
- The split button only where the program type requires ROEs → "Allow split loads" per project; the
  first collection `-A` (ADR-024 → 137, 173).
- The time clock for monitors only → anyone with an assignment, by hand with nudges (ADR-063 → 241).
- "Setup lists every active site for any work" and the stump screen's open questions (Q-183, Q-185,
  Q-187, Q-189) → answered (ADR-195, 198, 205).
- `field-webapp/` as the app's home → `apps/field` (ARCHITECTURE §18). Round 13–22 and ADR-138, 240,
  243 ⚠️ notes → absorbed; rewritten in the present tense (ADR-138, 251).

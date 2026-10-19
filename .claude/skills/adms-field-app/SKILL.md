---
name: adms-field-app
description: Open ADMS field app and phones, in today's rules. Covers enrolling a phone once, the day's assignment it takes at sign-in, setup by master passcode when there's no assignment (an unplanned assignment), offline sign-in from the login list and its safeguards, switching monitors and moving site, encryption, the time clock on the phone, syncing whenever there's signal, sync and turn in, an out-of-service phone (the Phase 0 part, ARCHITECTURE §7–§8); what a phone holds for its assignment (lists, the site's quantity lookup, never rates or rules); and the later-phase capture notes: offline as the only mode, advisory on-device checks, badge then number at New and open tickets, every start list, the split chain, printing, scanning, GPS and photos. Use when touching enrolment, sign-in, the phone's lists, sync from the phone's side, or anything a monitor captures. The workflows themselves are adms-ticket-workflows.
---
<!-- skill-status: current (ADR-138, rewritten 2026-09-29, ADR-251; the Phase 0 device and assignment models built, ADR-281; split haul-outs, ADR-295; a badge's number the phone's list doesn't hold, ADR-421; enrolment through the API, ADR-439; the assignment taken at sign-in, ADR-444; the lists read by the phone, ADR-450; the login list, ADR-454; an unplanned assignment reported, ADR-457; a site move and a monitor switch reported, ADR-458; every other use of the master passcode a phone logged, ADR-464; the open designs put to the user with task 3.1.4's prototype, ADR-561; put as Q-215…Q-218, ADR-569; the number at New, open tickets, waypoints and photos, ADR-571; Q-215…Q-218 answered, ADR-573; the field app's sign-in and its lists, ADR-574; signing in offline and the lock after inactivity, ADR-575) -->

> **This page states today's rules** (last changed by ADR-574, as its status line lists). Each rule cites its ADR; what changed is in
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
   monitor working two projects carries two phones (ADR-145). **On the field app** (ADR-574, agent
   defaults): their session is kept in the keyring beside the phone's token and sent beside it
   (the browser build holds it in memory alone); `NOT_SIGNED_IN` asks them to sign in again,
   nothing the phone holds lost; told there is none (or several), the phone says "No assignment
   today: ask your supervisor." (or "More than one assignment today…"), keeps the lists it holds,
   shows "Last synced: …" and asks again whenever it finds a connection.
5. **No assignment?** The master passcode opens **setup on the phone**: project, work, site, and the
   monitor from the login list; online, or offline on the project whose lists the phone already holds
   (a new project needs a connection). It's recorded as an **unplanned assignment**, marked, not
   flagged, and appears on the board at sync (ADR-240). **The phone reports it by `POST
   /phones/current/unplanned-assignments` once it has proved itself, with nobody signed in and
   no passcode sent** (ADR-457, agent defaults): the id the phone made, the project, the monitor,
   their work, the site, and when it was made by the phone's clock with that clock's offset. The
   server keeps it as reported (its day is the phone's clock's, in the project's time zone) and
   answers saved, already saved, or not saved with why; the record names the master passcode
   itself, on that phone, and is two security events at the phone's own time. **Online, what
   the supervisor picks from is read by `POST /phones/current/setup-choices`** (ADR-463, agent
   defaults): the passcode typed, sent in the body with `projectId` (null until a project is
   picked) and `monitorsAfter`; answered the open projects, the monitors in service (asked on
   from `moreMonitorsAfter` while it isn't null) and the picked project's live sites and unit
   rate pay items in service. Never a rate. Each read is a use of the master passcode.
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
   **On the field app (ADR-575, agent defaults):** the login list is read with every read of the
   lists and kept sealed in the store (an entry whose mark moved dropped at once); a sign-in tries
   the server first and, with no signal, checks the password in the two slow hashes against the
   entry; **only the phone's monitor (whose lists it holds) signs in offline**, anybody else after
   the passcode hands the phone over; the phone's own wrong tries wait from the 5th and lock the
   screen at the 10th until the master passcode (online refusals are the server's to count); **the
   lock after 30 quiet minutes, warned a minute before**, signs the monitor out as at Settings; the
   sign-in made offline is reported before anything else of theirs.
7. **The master passcode** (one per firm, set at install, changed only when the firm chooses; the
   server and each phone keep only a slow hash) can also **sign in as the phone's monitor**; that
   session and every record in it are marked. Every use is logged on the phone and synced as a
   security event (ADR-106). **With a connection it is `POST /phones/current/passcode-sessions`
   (ADR-462, agent defaults): the monitor's id from the phone's lists, `kind: 'AS_MONITOR'` and
   the passcode, which the server checks itself. The answer is a sign-in's, with the session's
   token and `masterPasscodeSession`; the server keeps the session marked, written as the
   master passcode itself, and it lasts a monitor's own twelve hours.** **What the phone logged
   with no connection it reports by `POST /phones/current/passcode-uses` (ADR-464, agent
   defaults), once it has proved itself, with nobody signed in and no passcode sent: an id the
   phone made, `use` (`MONITOR_SWITCH`, `SESSION_AS_MONITOR`, `TEMPORARY_SESSION`,
   `WRONG_TRY`), the monitor it was for (nobody, for a wrong try), and when by the phone's
   clock with its offset. A session opened offline is a use of the passcode that says which
   way, never a sign-in, and the server opens none for it. A wrong try typed on a phone is
   kept in the security log and never counts toward the server's lock. Each is kept once and
   answered saved, already saved, or not saved with why. A setup, a move and a switch that
   made an assignment are (5)'s report, never this one.**
8. **Switching monitors** needs **the master passcode first**; then the next monitor signs in with
   their own Monitor ID and password, so the server knows it's them. **Shortcut:** the master passcode
   opens a **temporary session** for a monitor picked from the roster, marked on every record and
   ending at day end (**online, the same call with `kind: 'TEMPORARY'`: it ends at the end of
   the project's day, by the project's time zone, or after twelve hours, whichever comes first;
   ADR-462**). An earlier monitor's unsynced work is **archived on the phone, still theirs,
   hidden from the next monitor**, and synced in the background (ADR-095, 120). **A switch to a
   monitor who has no assignment makes a new unplanned assignment for them on the phone, reported
   as (5)'s is with `occasion: 'MONITOR_SWITCH'`** (ADR-458, agent defaults): the server records
   a phone switched and a use of the master passcode, naming the monitor switched to, at the
   phone's own time. **A switch the server saves signs out whoever was signed in on that phone
   before it, by the phone's clock, never the monitor switched to (ADR-462).** A switch to a
   monitor who has their own assignment makes none: **the phone reports it as (7)'s
   `MONITOR_SWITCH`, a phone switched and a use of the passcode naming them, and their own
   sign-in takes their assignment (ADR-464)**.
9. **Moving site** is done on the phone, offline, with the master passcode, from the project's sites
   it holds, and is recorded; each record keeps the site it was made at (ADR-195). Switching and
   moving amend the phone's assignment. **A move makes a new unplanned assignment at the new
   site, reported as (5)'s is with `occasion: 'SETUP'`; the earlier assignment stands as it was,
   and nothing the dispatcher planned is changed from a phone. Where several of a monitor's
   assignments for a day name the phone they sign in on, it takes the one made on it last**
   (ADR-458, agent defaults).
10. **Data on the phone** (ADR-096; ARCHITECTURE §8): an **encrypted database** whose random key is
    held this-device-only in the Keychain / Keystore, **never backed up** (excluded from iCloud and
    Google backups); the monitor's password gates *using the app*, not *decrypting the data*, so a
    supervisor can sync a phone its monitor walked away from. The browser test build uses IndexedDB
    with a non-exportable WebCrypto key: fine for testing, never for real work.
11. **Sync whenever there's a connection**: records first, photos after, the phone told the truth
    record by record (saved, already saved, not saved); topped up with numbers and fresh lists; any
    phone with a connection may refresh its lists at any time (ADR-151, 240; ARCHITECTURE §9).
    **A phone needn't be handed in for its work to arrive.**
    ⚠️ **User, 2026-10-15 (ADR-531):** "a phone that is not signed in should not be trying to
    sync … When NO user is signed in at all, the app should not try to sync. In addition the
    server should be smart enough to know that the user is not signed in". **The app syncs only
    while somebody is signed in on it**, a monitor or the master user (the passcode typed, sent
    beside the phone's proof); the server refuses a sync with nobody (`401 NOT_SIGNED_IN`). **A
    sign-in made offline is reported first when the phone finds signal**
    (`POST /phones/current/offline-sign-ins`) with a proof: an HMAC-SHA256 over what
    `OfflineSignInRules.signed` says, keyed by the first slow hash of what was typed (made anyway
    to check it against the login list). The phone keeps the proof, never the hash, and drops it
    at sign-out; refused, it asks the monitor to sign in online and keeps everything. A monitor's
    sign-in lasts the firm's hours, a day as shipped. **A phone taken out of service only sends**:
    it is topped up with nothing and brought nothing (no lists, no check of the passcode).
12. **Sync and turn in** (taking a phone out of service), with the master passcode, even without the
    monitor: it proves itself, uploads every queue (archived ones too), waits for the server to
    confirm each record, returns its unused numbers, then wipes. Nothing is wiped before the server
    confirms it; cancelled field events are the only thing never synced (ADR-056, 096, 134).
    ⚠️ *Built at the server (ADR-488…490, agent defaults): `POST /phones/current/turn-ins`; the
    phone names everything it still holds and is answered `wipe: true` only when the server has
    all of it; the same step ends its blocks and revokes its key, as the phone is told to wipe
    (the user, KD-77 closed, ADR-495). The field app wipes only on
    `wipe: true` (the sync contract's suite, checks 14…16).*
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
- **The one check that must match before a field event saves** is a number typed again (below), only
  where a person copied it: data entry, not eligibility (agent default, ADR-209; when, the user,
  ADR-573).

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
office can ask a site's quantity lookup as any version held it. **The login list and the master
passcode's check are their own call** (ADR-454; ADR-449 (5) as proposed, the rest agent
defaults), `POST /phones/current/login-list`: the phone says what it holds (a mark for each
entry, the passcode's version) and is made only what it lacks, a bounded number a call; on the
list are the monitors in service with an assignment that stands on its project for today or
later; an entry is a slow hash made for that phone from a seed the server keeps sealed, checked
on the phone in two steps; the server keeps no entry. **And (ADR-553, task 2.9.1; the user's
choices in ADR-552 (3), the rest agent defaults) what certifying and a tower pick from:** to a
phone that certifies or takes disposals (`DIS`, `HOD`), **the truck lists** (the firm's vehicle
types, each saying whether it certifies a container or a crew; its vehicle features and crew
types; the project's primes, each with the subs placed under it and their tier; by id and name);
to a certifying phone, **the helpers** it may pick (the others with an assignment on the project
that day, id and name alone); to every phone, **each site's GPS and its area as it stands** (its
newest own shape, or the project's circle round its GPS), for the advisory "not at this site".
The truck lists and the sites' places are part of the setup version; the helpers are not.

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
| **Badge, then the number, at New** on every phone (the user, ADR-571, amending ADR-209): **New** scans the badge (the certification loads, capacity included; **the certification says whose work it is**, ADR-186), then takes the number: the control ticket scanned, or the phone's next generated number shown, then **typed again by hand only when a person copied it**: a number the phone made, or one typed because the barcode won't read; never after a scan (the user, Q-218, ADR-573; WCAG 3.3.7 allows the copy check as essential). The ticket opens and waits in home's **open list**; **Complete** takes the details; the receipt prints at submit. **User, 2026-10-18:** "Paper tickets would be scan at New. If a project is using paper tickets the monitor starts the ticket by scanning the drivers badge (which gets the truck number, same as the placard) and then they scan the printed ticket. If the project is generating number, they'd generate the ticket number at that time." *Agent readings (ADR-571):* the tower and the haul-out's disposal scan the driver's ticket at New; unit rate takes its generated number at New after the crew badge | ADR-209, 571 |
| **Leave it and come back** (the user, ADR-571): a ticket is left at any step and finished later from the open list, where the monitor left off, what they entered kept on the phone across sign-outs and restarts; a phone holds several open tickets, each shown by its truck and number; nothing open is sent. **User, 2026-10-18:** "tickets should absolutely have the save/pause option so you can work on it, puase and come back to finish it later. That's how work happens in reality. It's never a straight line." | ADR-477, 571 |
| **One open ticket per truck on a phone** (the user, ADR-571): a badge, or a truck keyed in by hand, whose truck already has an open ticket opens that one rather than a second; the monitor finishes or cancels it. Data entry, never an eligibility check; across phones the server flags overlap (ADR-027). **User:** "we still want to prevent the phone from making 2 tickets for the same truck number at the same time." *Agent defaults:* a split chain is its truck's one open ticket; a unit rate crew isn't held to one | ADR-027, 571 |
| **Waypoints** (the user, ADR-571; Q-104): **"Mark waypoint"** while a collection is open records the phone's time and whatever fix it has, in order. *Agent defaults:* collections only (each of a split's); at most a policy number; nothing in the engine reads them | ADR-083, 111, 571 |
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
| **Photos** from the camera only, never the gallery; fingerprinted (SHA-256) at capture; shrunk natively keeping location, time and depth data; **at most 8 per ticket**; "required" is a pay item setting; a certification takes **five** set views. **Taken at any step while the ticket is open**, New included (the debris before loading); **the review shows the photos themselves**, never only a count; before submitting one may be retaken or removed, a removed one never sent (*agent defaults* from the user's notes, ADR-571) | ADR-101, 157, 179, 571 |
| **GPS**: the phone sends whatever fix it has and never judges its accuracy; the back office adjusts drift | ADR-083 |
| **Times** are the phone's clock, shown in the project's time zone; the server checks they make sense | ADR-100 |
| **A record the monitor submitted is sealed for them**: no reopen and no edit, synced or not, even to undo a mistake; the back office corrects it once the server has it. One not yet submitted stays open and theirs to adjust, for days where the work takes days, kept across sign-outs | ADR-477 |
| **A sync rejection** (a quarantined duplicate) shows the monitor **"not saved"**, never swallowed | ADR-022 |
| **Certifying**: pick the prime, type the sub into tier 1 or 2 (the phone suggests known subs of that prime); the five photos; the capacity computed, never typed | ADR-108, 179, `adms-certifications` |
| A load **turned away** at the tower gets nothing | ADR-155 |

## 4A.5 Numbers, printing and scanning

| Project source | The number |
|---|---|
| **Control tickets** | Pre-printed barcoded stock; the ranges are entered at setup and sent with the phone's lists; the monitor **scans** the control ticket at New, right after the badge (ADR-571). A scan outside the ranges is questioned, never refused |
| **Generated** | The phone issues the next number from its **1,000-number block** of the project's series (topped up at sync, the unused rest reclaimed on reset, a lost phone's block retired; it warns at two days' worth left) and shows it at New, right after the badge (ADR-571). **Unit rate tickets are always generated** |

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
  the phone until it's set up again, so it can be extracted if needed (ADR-056). It keeps the number
  taken at New; a generated one is never issued again, and a cancelled ticket is left out of the
  phone's own duplicate check, so a control ticket started by mistake can be scanned again
  (*agent default*, ADR-571).
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
not a stepped picker (Q-106), a crew badge that stays active (Q-107). **The board's four Phase 3
designs:** a confirmation after each captured value ("You have
selected 55%. Is that correct?"); a monitor scorecard; a bottom menu of Time, Map, Work, Chats,
Settings; whether to keep hand re-entry of the number (ADR-209) once the app is built. **All four
are put to the user with task 3.1.4's prototype, each with a recommendation (ADR-561); the field
app's look is ADR-561's.** **Answered by the user 2026-10-18, every recommendation approved
(Q-215…Q-218, ADR-573):** **no confirmation after each value**, the review screen shows everything
once; **the monitor's own count of today's tickets on home**, nothing ranked or compared; **the
bottom menu is Work, Time (only where the project has the time clock on), Sync and Settings**; **the
number is typed again only when a person copied it** (one the phone made, one typed because the
barcode won't read), never after a scan. The components and tokens every
screen is built from are `apps/field/src/look/` (ADR-567, 568).

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
- The number re-entered after every scan or generation, and the four Build 1 designs open → typed
  again only when a person copied it; no confirmation per value; today's own count on home; the menu
  Work, Time, Sync, Settings (the user, Q-215…Q-218, ADR-209, 571 → 573).
- The tower seeing the list of a load's stumps and confirming → the tower counts; the worker compares
  after sync (ADR-192 → 243).
- Site options (haul-out, citizen drop-off, HHW) deciding which sites a phone lists; citizen drop-off
  as a ticket type → the site from the assignment; a drop-off log (ADR-180, 190, 193 → 184, 195, 215,
  240).
- Photo caps of 4 per ticket and 2 per hazard item; "GPS accuracy captured" → at most 8 per ticket, five
  for a certification; no accuracy check (ADR-083, 157, 179).
- "Capacity is never typed" → a truck keyed in by hand bills the certification's capacity (Q-98 →
  ADR-154). "No eligibility marking by the monitor" → allowed where the pay item says (ADR-210).
- "Reopenable until it syncs" → until the monitor ends the shift (ADR-072 → 240) → **never once
  submitted; there is no edit log** (ADR-477, the user, 2026-10-12). A stale phone's
  "24-hour re-check" → dropped: phones sync whenever there's signal (ADR-240).
- The split button only where the program type requires ROEs → "Allow split loads" per project; the
  first collection `-A` (ADR-024 → 137, 173).
- The time clock for monitors only → anyone with an assignment, by hand with nudges (ADR-063 → 241).
- Badge first, **number last** (scanned or shown at the end of Complete) → **badge, then the number,
  at New**; tickets left at any step and resumed, one open per truck on a phone; waypoints spelled
  out; photos at any step, shown on the review (the user, ADR-209 → 571).
- "Setup lists every active site for any work" and the stump screen's open questions (Q-183, Q-185,
  Q-187, Q-189) → answered (ADR-195, 198, 205).
- `field-webapp/` as the app's home → `apps/field` (ARCHITECTURE §18). Round 13–22 and ADR-138, 240,
  243 ⚠️ notes → absorbed; rewritten in the present tense (ADR-138, 251).

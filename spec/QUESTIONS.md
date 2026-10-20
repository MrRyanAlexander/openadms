# Open ADMS — Question Register

Every question an agent has asked about **how Open ADMS behaves**, with its status. This is the
one place product questions live; `VISION.md` §9 points here.

**Before asking the user how the system works:**

1. **Load the skill that owns the topic.** No permission needed; never ask whether to load one.
   Knowing that an answer is *in* a skill isn't the same as having read it.
2. **Find the question here**, and act on its status:

| Status | Meaning | What you do |
|---|---|---|
| ✅ **Answered** | Settled by the user | Use the answer; don't re-ask. If this summary disagrees with its cited source, the source wins — log a KD |
| 🔨 **Decided, not built** | Settled; the gap is code | Cite the KD; it's build work |
| 🛠 **Design task** | The domain answer is settled; the *mechanism* is ours to design | Propose the mechanism as an ADR for the user to approve when the work comes up. Don't ask it as an open question; don't guess it silently into code |
| ❓ **User decision** | Only the user can answer | Cite the ID; don't re-ask it as if new; **never guess an answer into code**. Where the entry carries an **Agent proposal**, the user has asked for one: point them to it rather than re-asking |

3. **Not here?** Append it as ❓ (or 🛠 if only the mechanism is missing) with what you do know
   and what it blocks, then ask.

**Asked "what don't you know about the system?"** Answer from this register: summarise the ✅
entries in a line each, and list the ❓ and 🛠 entries by ID. Anything you'd add beyond those is
new — append it.

When the user answers a ❓, record it in the owning skill or an ADR, then flip the entry here and
keep the user's words in a `> **User, <date>:**` quote under the summary. The quote is the source.
IDs are never reused. *The session-start hook reads these headings, so keep the format
`### <status> Q-NN — question`.*

---

## A. The product and its users *(from `VISION.md` §9)*

### ✅ Q-01 — Who operates Open ADMS?
**One organisation, usually a monitoring firm**, occasionally something like a non-profit doing
like-kind labour work. Clients, program types, contractors and users are entered once and reused
across projects. A monitor, once added, can work any active project, through a device
set up for **one** active project at a time (ADR-088). *(ADR-050)* Not covered: one organisation per installation, or a hosted install serving
many (**Q-58**).

> **User, 2026-09-24:** Usually a monitoring firm, but we can imagine cases where non-profits might use it for like-kind labor work. Many details like clients are reused across disasters (clients, programs (ROW, PARKS, WATERWAY), contractors, and other things that we know are entered and might be resuable... Monitors for example... Once they are added they can work on any project that exists, if its active and they have a device provisioned for it.)

### ✅ Q-02 — Who logs in, and what can each see?
- **Monitors:** through their device, as it's set up.
- **Back office:** admin (full access) and manager/analyst (granted permissions) — see Q-40.
- **Clients, contractors and auditors:** **read-only web access to their own projects**, with
  logins the monitoring firm issues. Clients look up ticket data and pull reports.

*(ADR-050)* 🔨 `User` has only `MONITOR | ADMIN` and four flags — **KD-25**.

> **User, 2026-09-24:** Monitors based on their device provisioning. Reviewers and admins - given scope/full. Clients, contractors, auditors are give read access to their projects. How? We give them a webpage.
>
> *(in `VISION.md` §3)* a client would want a way to login and see ticket data and be able to pull up reports for their projects. they would need to be given a special login provided by the monitoring firm. … [contractors] yes like clients.

### ✅ Q-03 — What is the deliverable?
**The client package:** a project's final tickets with their photos and receipts, its
transactions and other records, packaged as a **zip file** and handed to the client. The invoice
is part of it (Q-05). *(ADR-057)* Package contents and layout are build work for later.

> **User, 2026-09-24:** A projects final tickets w/photos and reciepts, transactions and other records are packaged up into a zipfile and handed over to the client.

### ✅ Q-04 — Is USACE compliance (Phase 5) part of "done", or a mode for USACE missions only?
**Neither: there is no USACE mode** *(ADR-077, superseding ADR-058)*. Every project uses the same
rules, and USACE needs are met with ordinary project options. The only USACE-specific capture is
an **optional "USACE approved" flag on the load call**, available on any project. (The notes this
answer first referred to never reached the file and are no longer needed.)

> **User, 2026-09-24:** If by part of done you mean the application isnt done without it, then I guess yes? Aspects of it are driven by a mode we would want to optionally run projects under. Then we get the special behavior around disposal where we get the load call and USACE approval. I added notes in this section to review. Check them out to get the full context around my response to this.
>
> **User, 2026-09-24 (round 6, under Q-75):** I'm revoking the idea of a MODE. There isn't any need to think about it like this.

### ✅ Q-05 — Does the system invoice, or only produce the ledger something else invoices from?
**Neither, strictly: there is no invoice in the system.** "Invoicing" is what the back office
calls checking a set of tickets and **locking them as invoiced**. Example: on a 10-week project,
in week 4 they check weeks 1–2 and lock those tickets, so the tickets can go to the client and the
contractor can close them out as invoiced. The system moves no money. It only needs the lock.
*(ADR-057, ADR-061)* 🔨 **KD-40**.

> **User, 2026-09-24:** The system produces the records that are used to generate an invoice. The invoice is for the tickets and is part of the package for clients. Does that answer this or do you need more detail?
>
> **User, 2026-09-24 (round 2):** An invoice in the systems since is non-existent actually. Think about this.. Say you have project A over 10 weeks with load tickets. At week 4 the backend team invoices weeks 1-2 and locks those tickets. When they "invoice" those tickets all it means is they have checked everything and are ready to send those tickets to the client so the contractor can close them out on their end as invoiced. We call that act invoicing. But its arbitrary in our systems case other than we create a way to lock tickets beause they have been invoiced. Does that make sense?

### ✅ Q-06 — What is mission closeout?
**When the project stops taking tickets.** A project is active between dates set when it's
created. After the end date, tickets still come in but are flagged "project not active" (Q-15).
The dates can be changed. *(ADR-052, ADR-057)* 🔨 No dates on `Project` — **KD-39**. Work time
or sync time: **Q-60**.

> **User, 2026-09-24:** Its when we stop making tickets for it basically. I mean you might let it sit for a little while, but it needs to be active (within a range set during project creation)

### ✅ Q-07 — Is the monitoring firm's own time billed through the system?
**No.** There's no service code for monitor time. Separately, a **time keeper app built into
Open ADMS** is wanted. It isn't described anywhere yet → **Q-59**. *(ADR-058)*

> **User, 2026-09-24:** Billed through it? As in do we make a service code for monitors time? If that's what you mean then no. However we do want to implement a time keeper app built into this adms (isnt that outlined somewhere or is that new info? I can explain the thinking on it if you dont already know)

### ✅ Q-08 — How big is a big mission?
- **~10,000 loads a day**, so ~20,000 load halves.
- **As many unit rate tickets again, or double that**, all with photos. Plus incidents and time
  records.
- **100+ monitors, each with a device**; many carry printers for generated tickets.
- Back-office users making changes while web viewers check near-real-time data.
- Devices normally **sync the night of the work**. A device holding unsynced work older than 24
  hours still syncs it, but the device's setup should be re-checked.

The goal is simple: set up the phone, and get it synced by the end of the day. Size for this
spike (ADR-030 (d)).

> **User, 2026-09-24:** A big mission... Maybe 10k loads per day... 100+ monitors all with devices, many have printers for printed tickets we generate. Generally most devices sync the night of work as that helps ensure data is cleared, and outside a 24 hour period on the device we'd wanna let any pending stuff sync, but make sure we know we need to verify the provisioned state or something. Keep it simple. The main goal is just to be able tp provision the phone and get it synced by the end of day. Those are just loads though.. Imagine having as many or double the number of unit rate tickets in the same day.. and they all have photos.. and you have incidents and time and more.. back-office linked into things making changes...others with webviews checking info (near real time) and more.

### ✅ Q-09 — Which ticket fields can a privileged reviewer correct?
**Every captured field**, GPS, times, photos and load call included, as long as each change is
audit-logged with its prior value and who made it. *(ADR-051; resolves KD-31)* 🔨 No edit paths
or edit permission yet — **KD-25**.

> **User, 2026-09-24:** Every detail needs to be editable as far as captured data goes. BUt when its modified we need to audit log it. So think about what the monitor captures on a ticket and then imagine we needed to edit some of those fields...

---

## B. Tickets and the reconciliation lifecycle

### ✅ Q-10 — What happens to half a load whose partner hasn't arrived?
It stays `PENDING` and is re-examined every run. It is **never** auto-failed, never expired and
never flagged just for its age: loads collected one day and dumped the next (**preloads**) are
common. It's listed as pending, not flagged. What *is* flagged is timing that can't be true
(Q-18). *(REQ-127; ADR-053, which supersedes the grace period in ADR-029)*

### ✅ Q-11 — After a reviewer fixes a record, what happens next?
The reviewer repairs the record (e.g. renumbers a quarantined disposal, or corrects a field) and
it's **reprocessed**: it goes back to the queue as `PENDING` and **the engine decides again on the
next run.** A reviewer never forces a match and never writes a reconciled record. The fix writes
an `AuditRecord` under the reviewer's own id, with the prior value. *(`adms-exceptions` "How a
human resolves it"; ADR-020/039/051; invariant 4)* The review-queue UI is Phase 4 (REQ-405/405a).

### ✅ Q-12 — How does a reviewer decide: correct, renumber or void?
**Establish the scenario from the evidence on the records first.** The reviewer reads what the
monitors captured, not abstract rules:

| Evidence | What it settles |
|---|---|
| Same cert number throughout | One container, so a keying error, not two trucks |
| Different disposal start times | Two separate trips; real work was done twice |
| Each collection's `loadEndTime` | Which collection each disposal plausibly follows |
| Disposal GPS and site | Both dumps were real, at a registered site |
| Zone, address, debris type | Which route the truck was running |
| Empty-bed and pile photos | Visual confirmation of distinct loads |

Then:
- Real work with the wrong identifier → **renumber** (Scenario A).
- Real work with a mistyped detail → **correct** the field.
- A record of work that never happened (e.g. two open collections on one cert with overlapping
  load windows and no disposal between) → **void**, with a reason (Scenario B). A void keeps the
  record and is locked; editing it again needs an audited override (ADR-051). **Never renumber a
  phantom — that double-bills.** Nothing technically stops it; the audit trail is the backstop.
- A split member (Scenario D) or a late-syncing record (Scenario C) → **touch nothing**.

*(`adms-exceptions` §4.3a, "Correction versus void"; ADR-027/028/051)*

### ✅ Q-13 — Is `FAILED` terminal? *(now: the status set)*
**Four statuses, and review doesn't stop billing:**

| Status | Set by | Meaning | Bills? |
|---|---|---|---|
| `PENDING` | device submit; any correction | Waiting for its partner or the next run | Not yet |
| `COMPLETED` *(was `MATCHED`)* | engine | Every check passed | Yes |
| `MANUAL_REVIEW` | engine, or a person | Something needs resolving; a reason code + short plain message says what. Editable | **Yes**, but must be resolved |
| `VOID` | a person, reason required | Known bad, or the work never happened. Locked; unlock by audited override | **No**: all billing stops |

`FAILED` is gone. Nothing is terminal except void, and even a void can be unlocked. After a
correction the ticket is reprocessed to get the all clear. "Invoiced" is a lock, not a status.
**What the agent found could go wrong, and how it's handled** *(ADR-060)*:
1. Some flagged tickets have no amount to bill (no partner, an ambiguous group, no pricing rule
   or two). They simply have no ledger row until fixed, and the message says "not billed".
2. Fixing a ticket that already billed is now everyday work. ~~Reversal rows~~, superseded by
   ADR-085: its transactions are cleared (copied to the audit log) and regenerated.
3. Voiding a billed ticket clears its transactions (copied to the audit log first).
4. When a fix breaks up a pair (a disposal renumbered to a different collection), the joined
   load record is corrected or voided in place, so a ticket can never bill twice.
5. Reports split "billed, clear" from "billed, open issue".
One thing needs you: **Q-62**. 🔨 **KD-42**.

> **User, 2026-09-24:** having all these confusing states might be a bad idea... pending makes sense for the initial ticket state, completed makes sense for all cleared, void makes sense when we know it has major issues and manual review when we're not sure but know something is off and it needs to be reviewed. In void and review cases we dont want to block editing, but if voided it needs some override to unlcok it and edit it. we for sure need to be able to make corrections and then reprocess it after to get the all clear
>
> **User, 2026-09-24 (round 2):** We do need to think about this a bit more. We want to be able to show a list of tickets needing review and in some cases we want to stop all billing on a ticket due to the issue type and others we just let bill but with an issue that needs to be resolved. I've suggested it this way based on how I worked on things like this before, but in truth that setup just created more issues and what you have suggested here tends to make more sense. Things that need manual review are not blocked in billing, but they need to be resolved. Voided items stop all billing. If you don't see any issues now or that would come up later with this setup then I think we are good to go. If not tell me what you think might go wrong and suggest a way to handle it now. … [on dropping `FAILED`] Confirmed dropped. Reason codes + description in natural language (short message)

### ✅ Q-14 — Are a project's enabled ticket types a hard gate?
Yes. Ticket creation **and** rule authoring are constrained to the declared set; the field app's
menu is built from it; `UNIT_RATE` enablement carries a sub-type set. *(ADR-018/041, REQ-125c,
REQ-308b)* A ticket of a non-enabled type reaching the server is flagged, not rejected
(ADR-052). 🔨 Not built — **KD-14**, **KD-27**.

### ✅ Q-15 — Do incident reports stop work?
**No, never.** Incident reports only capture what happened; stopping work is a decision made
outside the system. **After setup, nothing in Open ADMS blocks work.** The one limit is the
project's end date: tickets outside the active window still come in, **flagged** "project not
active". Human-remains recovery, when it happens, is ordinary unit rate work, with a service code
and rule named for later invoicing. **Flag messages are plain facts**: "Ticket 104499: debris type
mismatch. Flagged for review." Never a guess at the cause. *(ADR-052; closes KD-21; withdraws the
human-remains protocol in `adms-data-model` §3.1a)*

> **User, 2026-09-24:** human remains are sometimes tracked using unit rate tickets. its not very common but when that happens it isnt a special case. its just a ticket and we track the work done. We name the service code and rules to what makes since for later invoicing so when the work is all done and we export the records for the client they have something that matches up to the hauller invoice records and other details like the landfills and more. Incident reports to capture things that happen during work are just used to capture it. They never stop work on their own no matter what. A choice to stop work happens outside of the system. So in our system we never make something that blocks work after the project is setup and things are create to allow work to start, except for when the project end date arrives. Unless that is changed, tickets will come through flagged with an error indicating the project isnt active and the tickets are not conencted to an active project. BTW/thats the sorta simple language we need around all errors that come back about things. If its not processing we need a good error message to indicate whats going on. But the message shouldn't be like .. we have ticket issue XYZ and that probably means ABC... Instead we just want.. we have ticket ### with issue ... flagged for review. Or something about truck number issue. Or debris mismatch or what not. Get it?

### ✅ Q-16 — Is cert validity judged at the time of the work, or at reconciliation?
**At the time of the work.** A load worked on a valid licence is eligible even if the licence
lapsed before sync or reconciliation, but it is **flagged for review** (it still bills, and a
person must resolve it — ADR-060). Expired at the time of the work → flagged `CERT_EXPIRED`
(today's code says `FAILED`, which is being removed — KD-42). The check at sync follows the same rule and **flags, never rejects**
(ADR-022, ADR-052). *(ADR-048)* 🔨 Code still compares to the server clock — **KD-35**.

### ✅ Q-17 — What stops a record billing twice?
- `ticketNumber` is unique per project in each stage table, so a duplicate is rejected at sync and
  quarantined. (Today the constraint is global — KD-43.)
- Control-ticket duplicates found at reconcile are flagged (ADR-056).
- Reconciled records have unique FKs to both source tickets.
- The run reads only `PENDING` rows (idempotent by status).
- Phantoms are voided, never renumbered; a void clears anything already billed (ADR-085).
- A scale receipt can be used only once per project. *(Its **number** is never unique: a receipt book starts again at 001; the user, 2026-10-04, ADR-328, 331.)*

*(ADR-021/022/028/034/056, `adms-ticket-workflows` §4.7, invariant 17)* ⚠️ `Transaction` has
**no** uniqueness on its source record, so the ledger write path KD-01 adds must itself be
idempotent.

### ✅ Q-18 — What is the orphan grace period, and where is it configured?
**There isn't one.** No grace period, no expiry, no age-based signal. Preloads (loaded one day,
dumped the next) are common on almost every debris type and mission, and configured expiry times
would mislead. **What is flagged, with a plain message:** timing that can't be true, such as
overlapping loads on one cert or a collection ending after its disposal started. *(ADR-053;
supersedes ADR-029; closes KD-20)*

> **User, 2026-09-24:** cut out this orphaned grace period all together. we dont want to assume just because a ticket was collected a while ago and just now dumped that its expired. nor do we want to think that a load that stayed overnight to dump the next day (preloads) are expired, as those are very commong on all debris types and missions, save for a few. if we try to configure expire times well get mixed up. but overlapping times, collection after disposal, things we know dont make sense, all of those need to get flagged with a good error message

### ✅ Q-19 — What does reconciliation write to the audit log?
When the engine creates the reconciled ticket, that creation is written to the `AuditRecord`
ledger **attributed to the system**. Every reconciliation outcome — success or failure, in all
three workflows — is audited with the **true** resulting status. If an admin later edits the
reconciled ticket, each changed field is **appended** with its prior value and who changed it.
Nothing in the audit log is ever edited. *(User 2026-09-24; ADR-007/039; REQ-132)* 🔨 Haul-out
and unit-rate outcomes aren't audited, and failures are mislabelled — **KD-04**, **KD-05**.

---

## C. Money (Accounting)

### ✅ Q-20 — How does a reconciled load find its rate, contract and contractor?
**Approved as proposed** *(ADR-089)*:
- The firm types the contract's **line items** in by hand as **service codes with rates**, writes
  **rules**, and attaches them to the contract. Monitors never choose pricing.
- A rule has **match** conditions (ticket type, prime, debris type, unit rate sub-type, item,
  zone) and optional **require** conditions (e.g. minimum load call), which are checked only on
  the tickets it matches. That fixes KD-38.
- Each service code has a **fee kind** (Hauling, TDSR fee, Tipping fee…). A ticket gets **one
  transaction per rule it matches**; two rules of the same fee kind → flagged; no rule at all →
  "no pricing rule matches". The system never picks one.
- Split loads: one transaction per property. Itemised tickets: priced line by line.
- The prime's rate applies, and the transaction records prime and sub (ADR-081).

🔨 **KD-01**, **KD-36**, **KD-38**, **KD-54**.

> **User, 2026-09-24** *(under Q-23)*: Make sense now how we can use the service code+rate+rule to make tickets transact things?
> **User, 2026-09-24 (round 9):** [each point of the proposal] this is spot on... / YES... / YEs... / Yes... / Yes...

### ✅ Q-21 — What quantity bills, and how does tonnage interact with the load call?
The service code's `billingUnit` decides.
- **CY:** `finalVolume = certified capacity × load call`, computed server-side. A scale receipt,
  if present, is corroboration only.
- **TON:** the scale **net** is split across the tickets on that receipt **by load-called
  volume**. Each ticket's share is its `capacity × load call` divided by the sum of those shares,
  times the net. Example: a 30 CY body at 90% (27.0) and a 40 CY trailer at 85% (34.0) on a
  17.10-ton receipt get 7.57 and 9.53 tons. Allocate to 2 dp, give the rounding remainder to one
  ticket deterministically so the parts sum exactly to the net, and store derived figures
  separately from the observed net.
- **EACH:** the ticket's count (Q-22). **Pounds:** the pounds the monitor entered (Q-23).
- A receipt exists only for FDS loads, and matters only when the contract bills by TON.

*(`adms-domain` §1.3; `adms-scale-receipts` "Apportionment"; ADR-035/036/054)* 🔨 TON isn't
built (KD-24).

### ✅ Q-22 — What quantity bills for `EACH`, `CREW_DAY` and `TBN`?
- **`EACH`**: the ticket's count × the service code's rate. *(ADR-054)*
- **`CREW_DAY`**: crew time is itemised, **item + hours** to the nearest quarter hour (Skid Steer
  10.25). Hours ÷ 12 (10.25 → 0.854 crew days) is the usual conversion, but it varies by
  contract, so it's set on the service code (Q-81). **More than 12 hours for one item in one day
  is flagged for review** (it still bills). *(ADR-064/066/068/084)*
- **`TBN` ("to be negotiated")**: the admin makes a `TBN` service code with no rate. Tickets
  complete but bill nothing, showing "Ticket 104499: rate to be negotiated. Not billed yet.", and
  appear on a "to be negotiated" list. When the price is agreed, the admin sets the real unit and
  rate (audited) and every ticket under that code is reprocessed and billed. *(ADR-068)*

🔨 **KD-29**, **KD-44**.

> **User, 2026-09-24:** crew_day is a 12 hour shift of time in a 24 hour period from 0100-2400. We log the time the crew spent working. im confused about tbn myself and not fully sure what the best approach is miplementing this or crew-day above, but we know EACH as stated above. we can circle back on the other two next. Propose your suggestion based on what you know we're building.
>
> **User, 2026-09-24 (round 2):** A) to nearest quarter hour, b) it would be on the crews unit rate ticket logged as a count, which we allow to include decimals so we're able to insert in the quarter hour times. These are created by a monitor in the field like other tickets. … TBN= to be negotiated and needs to be included not dropped. Now that you know what this is called you should be able to deeduce how we are needing to use it. If not ask for a follow up or propose what you think it looks like.
> **User, 2026-09-24 (round 3):** [on crew-day] That is right, it is not applied per hour. But neither of those matter because when we create the service code we set the rate to whatever we want. If we want to make it per hour we can. But normally it is per day at a given daily rate. Then in the count we put the amount for the crew day, but in this case we calculate it based on the hours the monitors puts in. So we take that and do the math to get 0.854 and use that against the crew_day rate. Make sense now?
> **User, 2026-09-24 (round 4):** A/b yes/flag for review like other tickets-you got the shape of this.

### ✅ Q-23 — HHW bills by the pound: where does the weight come from?
**The monitor enters it.** The pounds, e.g. read off a scale ticket (400 lb), go on the unit rate
ticket as its count. The service code carries the per-pound rate, the rule recognises the ticket,
and cost = 400 × rate. *(ADR-054)* 🔨 No `LB` billing unit yet — **KD-29**.

> **User, 2026-09-24:** It's really simple actually. We put the count of lbs on the ticket and then make a service code that has the 1lb rate on it. Then in the rule when it detects the right ticket and we get unit count. Say there were 400lbs on the scale ticket? Monitor marks 400 and then we get 400xrate and good to go. Make sense now how we can use the service code+rate+rule to make tickets transact things?

### ✅ Q-24 — Can rates differ by contractor for the same service code on one project?
**No. Each contractor gets its own service code.** With two contractors (Bobs and Toms) doing
hangers and leaners: `Bobs 1A Hanger` 45 and `Bobs 1B Leaner` 125, each with a rule "contractor is
Bobs"; `Toms 1A Hanger` 55 and `Toms 1B Leaner` 130, each with a rule "contractor is Toms".
*(ADR-054)* 🔨 No contractor rule condition yet — **KD-38**.

> **User, 2026-09-24:** No. We would make a separate service code for each contractor. So if we have 2 contractors (Bobs and Toms) removing hangers and leaners we dont name the service code 1A Hanger and 1B Leaner. Bobs 1A Hanger and Bobs 1B Leaner rates 45/125 -> rule isContractor Bobs -> etc... Toms 1A Hanger and Toms 1B Leaner rates 55/130 -> rule isContractor Toms -> etc...

### ✅ Q-25 — Does a successful reconciliation write a `Transaction`, and how?
Yes: one ledger row per billable reconciled event, **for every workflow, unit rate included**.
It is written through `transactionService.createTransaction`, the only ledger write path.
*(User 2026-09-24; `adms-ledger-audit` §6.1; REQ-131)* 🔨 Nothing writes one today — **KD-01**.
🛠 How the Python engine reaches the TypeScript service is an engineering choice to record as an
ADR when KD-01 is built. The amount depends on **Q-20/Q-22**.

### ✅ Q-26 — Correcting a ticket that has already billed
**Regenerate, don't reverse.** *(ADR-085/086)*
- Tickets are **locked as invoiced**, and editing one needs an audited unlock.
- When any ticket that has transactions is corrected and reprocessed, **its transactions are
  cleared and generated again**; a void clears them. There are **no reversal rows**: the ledger
  shows the current truth, and a ticket may carry several intended transactions (hauling, TDSR,
  tipping fees).
- **Agent safeguard (your "better idea" request):** each removed transaction is first copied in
  full to the audit log, so nothing is lost.
- A corrected **completed** ticket returns to `PENDING`, and the engine updates its existing load
  record instead of creating another.

Follow-ups: **Q-82**, **Q-83**. 🔨 **KD-26**, **KD-40**, **KD-52**, **KD-53**.

> **User, 2026-09-24:** Tickets don't "bill" on their own. But we do want to be able to "locK" them as being invoiced so no more changes are made after that point - unless we unlock the invoices ticket and allow the edit. So we treat the edit the same we would as an other with audit entry. We basically just trust that the invoice once locked wont be unlocked unless for a good reason and whoever is doing it wouldnt do so if the project was fully closed out and all invoicing completed. There are a lot of instances where you might lock tickets as being invoiced and later need to make a small change before you actually send the final packet to the client.
> **User, 2026-09-24 (round 8, in `VISION.md` §4.7):** Actually... the transaction ledger needs to be "clean"... We don't want multiple transactions for any ticket unless that is the desired behavior... Load ticket hauling fee, TDRS fee, tipping fee - those are 3 separate transactions for a single ticket. If we have to update a rule or maybe change like 10 tickets for some reason, we'd end up creating a bloat load of transaction reversals and end up having to equery that to infinity. We need a better way to handle this. That's why we need to overrite transactions. Again, we wouldn't be making changes like this to "invoiced" tickets. And we want the transaction ledger to show the final truth the firm using the system is reporting so we delete the old transaction from the record and process it again. That's the rule. When we edit something that has a transaction, those transactions are cleared and new ones are generated in their place. We could append the old records to a hitory table elsewhere, but we don't want to use the model you proposed. Think you will get the reaosn for that now. If you have a better idea how to handle this suggest it. Ask follow ups if needed please.
>
> **User, 2026-09-24 (round 8, in `VISION.md` §4.6):** this does introduce the issue of a COMPLETED TICKET with a PENDING status. How? Imagine a pair passed all of the checks or a unit ticket did the same right. We need to make sure reconcile is built to handle this case where we are editing and existing completed ticket and sending that to be reprocessed. Also, we want to be able to edit COLLECTION and DISPOSAL with PENDING status. The real world produces lots of mistakes and we need ways to fix them on the fly. All creating audit records so we have a trail though.

---

## D. PPDR splits and ROEs

### ✅ Q-30 — What shape is a split load, and how is it grouped?
N collections (`10095-A`…`-E`, one per property) → **one** disposal carrying the base number.
Group on the base number with the suffix stripped; N collections + exactly one disposal is valid.
Two disposals on a base, suffix gaps, or orphan chains → `MANUAL_REVIEW`. Offered only where
`programType` requires ROEs. *(ADR-032/033; `adms-exceptions` Scenario D)* 🔨 **KD-19**.

### ✅ Q-31 — What is the monitor-estimated CY on a split?
An **observation** by the monitor at each property of how much came off it: testimony, not a
derivation, and usually well off. It's used only for the **relative** size of each property's
share of the bill (Q-32). Correctable by permission like any captured field. **No cross-check
against the gate volume** — the shares absorb any difference *(ADR-064; the earlier tolerance
check is withdrawn)*. 🔨 **KD-22**.

### ✅ Q-32 — How does a split load bill?
**The load's billed quantity is shared across its properties in proportion to the monitor's
estimates.** Share = property estimate ÷ Σ estimates. The user's example: estimates 5, 10, 1,
15 and 30 CY total **61**, so the 5 CY property gets 5 ÷ 61 = **8.20%**. (The answer says "total
= 65", but its own arithmetic uses 61, the correct sum.) Each property is billed that share of
the load's quantity (capacity × gate load call), **or of its tonnage** on a TON-billed load.
*(ADR-055, ADR-064)* The ledger shape is part of the Q-20 proposal (one row per property).

> **User, 2026-09-24:** Simple.. The monitor gave us their estimate CY for each ticket right.. Say we have 5 tickets. So 5 properties.. P1=5CY P2=10CY P3=1CY P4=15CY P5=30CY total est CY = 65 avg % per property (Property Volume ÷ Total Volume) × 100 P1 5 ÷ 61 = 0.08196 0.08196 × 100 = 8.20% Now we know the % for each to apply the billing to for each property. Make sense?

### ✅ Q-33 — How is a split's ROE chosen, and what catches a wrong one?
The monitor **picks the ROE from a list or types its number**. After reconciliation, the ticket
is **flagged for review** if no matching ROE is found, or if the ROE isn't marked signed or is out
of scope. **No address or parcel lookup**: trust the captured data. *(ADR-055)* 🔨 No `roeId` on
tickets — **KD-23**.

> **User, 2026-09-24:** They have a list to select from, or manually type in the ROE number.. If after reconcile no matching ROE is found we flag the ticket for review. If the ROE is not marked signed or out-of-scope we flag for review as well. We dont try to lookup the address or anything complex in the code. We want to trust the data if that makes sense.

---

## E. People and permissions

### ✅ Q-40 — Who may correct, renumber or void, and with what checks?
Two back-office roles, kept simple: **admin** (full) and **manager/analyst** (granted
permissions). Both may correct, renumber and **void, with a reason attached**. No second-person
approval. Nothing technically stops a reviewer renumbering a phantom instead of voiding it; the
**always-on audit trail** is the backstop, because not every case can be foreseen. A monitor
still never edits their own submitted ticket in the field. *(ADR-050, ADR-051)* 🔨 **KD-25**.

> **User, 2026-09-24:** Nothing stops it really and thats why we have the audit trail. Because we can't imagine everything we have to have some flex built in with the always on audit trail backup. the back office roles need to be kept simple and really its like admin full permission vs manager/analyst with permissions. We actually want to allow these back office roles the option to void tickets as well with a reason attached. how else will they void an issue they discover that needs to be voided?

---

## F. Identifiers and field capture

### ✅ Q-54 — What can a field device do, and does a monitor ever pick pricing?
A device is **set up only for its monitor's role**. A collection device starts collection
tickets, completes them, and cancels ones started by mistake (a cancelled ticket stays on the
device and isn't synced, Q-53). It starts a ticket by taking a number and scanning the driver's
badge (Q-52), after which the ticket is populated with the truck's info. **Monitors never select
a service code, rate or contract**; that's system configuration (Q-20). *(ADR-047, ADR-056)*

### ✅ Q-55 — What does a ticket number look like?
**A bare number**, e.g. `104499`. No project, ticket-type, device or date prefix is stored in it
or parsed out of it. Project, type and creating device are **row data** and come out in exports.
A split member adds only its `-A`..`-Z` suffix. Generated numbers run from 100,001 per project
and series. People see a type label (`CLT 104499`) that is display only (Q-51). *(ADR-046,
ADR-062)* 🔨 Today's generator emits `COL-YYYYMMDD-xxxxxx` — **KD-13**, **KD-43**.

### ✅ Q-56 — Where does a cert number come from, and how unique is it?
Either **issued by the system** or **taken from the pre-printed certification paper** (usually 6
digits; don't enforce a length). Either way it's the one number on the placard and on the
driver's badge (ADR-056), **unique within the project** — other projects may reuse it.
*(ADR-045)* 🔨 No per-project unique constraint and no system issuer yet — **KD-10**.

### ✅ Q-57 — Is the creating device recorded?
Yes, as **row data** on every ticket, form and incident: the id of the device that created it,
or a back-office / system marker when a record is created off-device by an approved user or a
system process. Never part of the number. *(ADR-047)* 🔨 No such field exists — **KD-37**.

### ✅ Q-50 — How do offline devices avoid minting the same ticket number?
**Each device gets a block of numbers from the project's series, and unused numbers are taken
back.** *(ADR-065, accepting the agent's proposal)*
1. A device set up for a project and a numbering role (collection, haul-out collection, unit rate)
   gets the next **1,000 numbers** from that project's series (e.g. 104,001–105,000) and issues
   them in order, offline.
2. At every nightly sync it reports the last number used and is topped back up to 1,000 unused.
3. When a device is reset for someone else, it syncs first and the server **takes back the unused
   numbers** for the next device that needs a block.
4. A lost or broken device's block is **retired**, never reissued.
5. Disposal devices issue nothing; they scan.
6. The device warns when two days' worth are left.

Series run 100,001 → 9,999,999 per project per numbered workflow (ADR-062). 🔨 **KD-13**,
**KD-41**, **KD-43**.

> **User, 2026-09-24:** using device numbers wont stop it either as we cannot bloat the field with lots of prefix characters unless we scoped devices to a given project and never went over 999 devices, which might never happen but i dont wanna build something that breaks when you get to 1000 devices. If having the prefix helps this much then lets keep it somehow, but we have to plan around the reality of what is to come. Circle back on this with me. propose what makes the most sense...
>
> **User, 2026-09-24 (round 2):** Im still not sure. Let me give yuo more info about real world and then maybe you can adjust your propsal somewhat to account for the changes this helps you understand about things... You have N monitors and potentially N tickets issued under project X. Generated ranges always start at the same spot on each new project so things remain consistent. We want to expect any ticket type to have over 1 million tickets. So we start the range in the 100th-thousands 100,001 in time we reach 7 digits 1,000,001 up to 9,999,999. that is one project with 1 ticket type. That is more than enough for any project this system will handle as far as ranges go. devices are provisioned each night if needed, or they stay set for a while, maybe to the end of the project. devices need to sync tickets each night at a minimum, even though we build in later expectations, 99% of the time nightly results. devices are often reprovisioned (basically reset) for someone else to do a different job, but on the same project. devices dont jump between projects during the day or else they need to be reporvisioned. so how we set the ranges on each device to avoid collisions matters. say we have 100 monitors all with diff devices and each is making 100 tickets per day. thats what we are building for and some.
> **User, 2026-09-24 (round 3):** The proposed above is YES. Confirmed

### ✅ Q-51 — What number does the reconciled record carry? *(and do type prefixes come back?)*
**Store the bare number; show a type label.** Numbers are stored and grouped bare. The completed
load record carries **the load's own number**. Wherever a person reads a number (screens,
printouts, exports) it shows a label from the row's type: `COL`, `DIS`, **`CLT`** (completed
load), `HOC`, `HOD`, **`CHO`** (completed haul-out), `URT`. The label is never stored in or parsed
out of the number, and the barcode carries only the bare number. *(ADR-062; `CLT`/`CHO` are the
user's, the rest are the earlier code's prefixes)* 🔨 **KD-13**, **KD-43**.

> **User, 2026-09-24:** above I reintroduce prefixes based on the bug that came up removing them. And so we will also want to bring back the ticket type prefixes we had before noted above in Q-51 as withdrawn in ADR-046, now unwithdrawn if you agree with the reasons for reintro it. The load would for sure carry the the loads own number as we drew it out originally, but alas we arrive back at the point of not know which side of the prefix to carry into the final load ticket, which was the reason we introduced completed load ticket CLT and completed haul out CHO.
>
> **User, 2026-09-24 (round 2):** You got this one the way I imagine it. Lock it in!

### ✅ Q-52 — Which barcode(s) does a collection monitor scan to start a ticket, and when more than one?
**It depends on the project's ticket source** *(ADR-056)*:
- **Control tickets** (pre-printed, with a barcode): the series is entered in the system as a
  range and sent to every set-up device, and the device won't take a scan outside it. The
  monitor starts a ticket and **scans the control ticket** to fill in the number. A duplicate that
  shows up at reconcile is flagged for review.
- **Generated tickets:** the monitor starts a new ticket, the device issues the number, and the
  **portable printer** prints it like a receipt, with a barcode the disposal monitor scans.

Then, either way, the monitor **scans the truck driver's badge**, which carries the same number
as the placard, and the truck's certification loads. Disposal and haul-out scan the same way.
**Unit rate tickets are always generated.** 🔨 **KD-41**.

> **User, 2026-09-24:** It depends on whether the project is using control tickets otherwise mentioned as preprinted tickets, vs system generated tickets that rely on a portable printer a monitor has to print them out like reciepts that have a barcode on them that can be scanned at disposal. Control tickets contain a barcode and when using those the ticket series needs to be pre-entered into the system as a range. Goes on all provisioned devices so the monitor can't scan outside the range. And we'd assume none of those control tickets are duplicates, but if a duplicate shows up on reconcile we flag it for review. If generating a ticket they simply start anew ticket. If control tickets, start a ticket and scan barcode to popuulate ticket number. Then monitor scans truck drivers badge(which has the same number as the placard) and that pulls up the truck info. Then continues with tickets. Disposal side scans in the same way depending on control tickets vs generated and haul out the same. unit rates are always generated

### ✅ Q-53 — What happens to a ticket cancelled on the device?
**It isn't synced.** It stays on the device until the device is set up again, so it can
be extracted if needed. This is the one deliberate exception to "every field record reaches the
server". *(ADR-056)*

> **User, 2026-09-24:** This is one edge case where you dont sync their data actually. But we do keep it on device until its provisioned again in case we need to extract it for some reason.

---

## G. Raised 2026-09-24 from the answers above

### ✅ Q-58 — One organisation per installation, or one hosted install serving many?
**One organisation per installation.** Open ADMS is being open-sourced ("Open"), and for now it's
built for each firm to install and run itself. No multi-tenancy. *(ADR-063)*

> **User, 2026-09-24 (round 2):** For now we are only building this so they can install it themselves. Hence the name Open ADMS (we are open sourcing this)

### ✅ Q-59 — What is the time keeper?
**An optional add-on, switched on per project, for tracking the workers' own time with the same
tool.** Monitors on the field app clock in, clock out, take breaks, and note what they did each
hour. Done well, much of it is **pre-filled from the work they already did in the app that day**,
for them to update and approve. It replaces the separate timesheet apps firms use today, and
holds the data that goes on the daily **ICS-214 activity log** (written "IS 214" in the answer),
without generating the form itself. It never blocks anything. **It is wholly separate from
crew-day billing** (crew hours on unit rate tickets, Q-22). Never confuse the two. *(ADR-063;
REQ-310)*

> **User, 2026-09-24 (round 2):** A time keeper built into the app would allow the monitoring firm or whoever is using the ADMS system a way to also track their workers times using the same tool. Most of them already use a separate app to track times that requires the monitor to manually type in hourly activities. We wouldn't want this to be a blocking thing just a simple add-on option built into project setups. If it's enabled monitors wusing field apps would have a way to clock in and clock out and take a break, and add in some details about what they did each hour, and if we did it right some of that detail would be pre-filled for them to update and approve based on work they already did using the app for the day. In this field workers file daily IS 214 logs tracking their work, and having this build into the system saves time. We aren't trying to generate a 214 doc though, just the data that would go on it. CREW-DAY tracking via unit rate tickets is a wholly sepearte type of time tracking. Never confuse these two.

### ✅ Q-60 — Is "project not active" judged by when the work happened, or when it synced?
**By the ticket's end (close) time**, when the ticket is cut. The start time is logged when the
ticket is first opened. Projects generally aren't closed with tickets like this still lingering.
*(ADR-064)* 🔨 **KD-39**.

> **User, 2026-09-24 (round 2):** A tickets close time or end time is what we use. Generally we wont close a project with tickets like this stuck lingering. So use the end work time as that's when the ticket would be cut anyway. We log the start time when the ticket was first opened to create it.

### ✅ Q-61 — Split loads: large disagreements and tonnage
**The estimates only set percentages.** Monitors' per-property estimates are usually well off,
and that's fine: what matters is the attested ballpark ("house A had more than B, C more than
both"). The percentages divide the load's final **CY or tonnage**. A big gap between the
estimates and the gate volume isn't flagged; the shares absorb it. *(ADR-064)*

> **User, 2026-09-24 (round 2):** A few too many references to other docs for me to follow your full line of thinking here, but here is what I can say if it helps. their estimates are only used to get a percentage that we then use to calcuate the final CY or tonnage. We dont actually think their estimates are perfect at all. In fact they are usually way off. But the ballpark idea of house A had more than B and C was more than both is what we are after. That way there is something attested we can attached to it. Then we have the info we need to process the cost. Make sense yet?

### ✅ Q-62 — Can a ticket that still needs review be locked as invoiced?
**No.** A ticket in review must be resolved (corrected and cleared, or voided) before it can be
locked as invoiced. The locking screen lists the unresolved ones so they aren't missed. This is a
back-office step, not field work, so it doesn't break "never block work". *(ADR-067)* 🔨 **KD-40**.

> **User, 2026-09-24 (round 3):** Approved recommendation.

---

## H. Swept in 2026-09-24 — open decisions that lived outside this register

### ✅ Q-63 — A scale receipt covering two debris types: who voids it?
**The system flags, a person voids.** Both tickets are flagged for review and the receipt's weight
is treated as **unusable**, so neither bills by weight until a person fixes the receipt or voids a
ticket. The system never voids on its own. *(ADR-069)*

> **User, 2026-09-24 (round 4):** Yes this makes sense. Lock it in.

### ✅ Q-64 — Which container types should the system know?
**The paper certification form's lists, extendable by the firm** *(ADR-070, ADR-073)*:
- **Vehicle type:** Dump Truck · Semi-Trailer · Hydraulic Dump Trailer · Non-Hydraulic Dump Trailer
  · Self-Loading Truck · Other (typed). A crew truck is certified on the same form as "Other"
  (e.g. "Bucket") with capacity **0 / CREW** and no measurements.
- **Features:** Sideboards · Tail Gate Extension · Dog Box · Wheel Wells · Curved/Angled
  Sides/Floor · Other (typed).

The two attached form images (a crew truck, cert 718554) raised the follow-ups **Q-68 … Q-71**.
🔨 **KD-11**, **KD-45**.

> **User, 2026-09-24 (round 4):** Vehicle Type: Dump Truck, Semi-Trailer, Hydraulic Dump Trailer, Non- Hydraulic Dump Trailer, Self-loading truck, Other - user entry. Features: Sideboards, Tail Gate Extension, Dog Box, Wheel Whells, Cuved/Angled Sides/Floor, Other - user entry. also see attached images in chat for a full understanding...if this doesn't explain things fully for certifications please ask follow ups

### ✅ Q-65 — Should program types be a fixed list, or a list admins manage?
**Admin-managed, and the same goes for the other lists like it.** Fixed lists are too rigid. A
firm must be able to add to them, globally, after it installs Open ADMS. Program types start with
ROW, PARKS, PPDR and WATERWAY, each with a "requires ROE" box. The catalogue of every such list
(which are extendable, what each starts with, and which must stay fixed) is **`spec/LISTS.md`**.
*(ADR-070)* Debris types: **Q-72**.

> **User, 2026-09-24 (round 4):** Flexibility always so we would want the firm to be able to add what they needed. Fixed lists are too ridgid. These lists need to be able to be added to at the global level. So even if we start out with ROW, PARKS, etc we wanna be able to add others. Some with debris types and other types like variables that lead to a list of things like this. Might be a good time to make a list of these variable lists that are able to be extended once a firm installs this.

### ✅ Q-66 — Disposal: the scanned number isn't on the device's list
**Disposal devices don't carry a ticket list at all.** They don't issue numbers, so they have no
reason to know them. The monitor scans the ticket and the system trusts it; reconciliation sorts
it out later. The device does try to keep a **truck (cert) list** in sync, but it works with old
data too. *(ADR-071)* No follow-up needed: a scan the device can't recognise is simply recorded.

> **User, 2026-09-24 (round 4):** Disposal doesn't issue ticket numbers and so we aren't trying to get a list of tickets to generate like we do on the collection side. We simply trust that the tickets should be valid and then try to reconcile. That can lead to some issues, but we cannot expect the disposal side to already need a truck list (which it does try to sync, but works even with old data), but the tickets would just be more info and that's not needed on disposal. Does that make sense or open more questions? Follow up if needed please.

### ✅ Q-67 — Can a monitor reopen a closed split chain before syncing?
**No: once submitted on the phone it is sealed for the monitor, synced or not; one not yet submitted stays open and theirs to adjust, for days if need be.** *(ADR-477, 2026-10-12, replacing the answer below, ADR-072, and ADR-240's "until the shift ends")*

> **User, 2026-10-12 (as a firm, speaking of its monitors):** Once she submitted the ticket on her phone the record is sealed and she cannot edit it again. That must be a hard rule. Ana is a field monitor. When she is doing work and she completes a ticket or an incident or a cert or something else, and presses submit on her device that item is to be locked for her to make changes. Even if she notices an error and needs to undo it, after she has submitted it she will not be able to make any changes. The backoffice can make changes one the server gets what she sent, but that's it.
>
> Now it you meant a case where she opened a ticket and started working on it. Say 101001 was opened on 10/2 and marked for stuff being done. Then it wasn't closed until 10/4 but Ana closed it. We don't want to flag that if it makes sense. We also wouldn't want to prevent Ana from making adjustments to it between 10/2 and 10/4 since she didn't submit it yet.

*The earlier answer, superseded:* **Yes, until it syncs.** A ticket that isn't finished is still open anyway. A finished ticket that
**has synced** can't be reopened on the device. A finished ticket **waiting to sync** can be
reopened: the device holds it back from syncing while it's being edited. Agent's addition, to
keep the audit trail whole: the device keeps a log of what changed and when, and sends it with
the ticket so the changes appear in the audit record. *(ADR-072)*

> **User, 2026-09-24 (round 4):** If they haven't completed the ticket and submitted it, then they should be able to open it. But if they already completed it and synced then no. If they are waiting to sync we might be able to pause sync attempts to allow an edit, but only if that doesn't break things.

---

## I. Raised 2026-09-24 from the certification form images (cert 718554, a crew truck)

### ✅ Q-68 — Capacity math: the last details
**The form's method, exactly** *(ADR-076, ADR-078; `adms-certifications` §3A.3)*:
- Whole inches. Primary box L × W × H, then boxes 1…N, each labelled with a feature, **added or
  subtracted**, and **÷2 or not**, plus a round bottom **[3.14 × (D ÷ 2)² × L] ÷ 2**.
- **Round to hundredths after each step**, as on the official USACE example sheet.
- Capacity = total ÷ 46,656 → **nearest whole CY, .5 rounds up**.
- **No manual override**: fix the measurements instead.

The hoist and radius shapes on the USACE sheet: **Q-78**. Double rounding at .5: **Q-79**.

> **User, 2026-09-24 (round 5, in `spec/LISTS.md`):** Yes! In fact after the primary , box 1-N can be additions or deductions. That's where we list a feature with its measurement and mark if its an addition or subtration and what kinda math used to calculate it (divided by 2 or not?). I thhought this was clearly outlined in the certifications. If not we need to be clear on the primary and box measurement details. That math and understanding has to be perfect.
> **User, 2026-09-24 (round 6):** 1) Exactly right. 2) 3.14 to follow hand calculations. 3) Up is right. 4) The spec is flat out wrong. My way is correct. Ive attached an image in the chat of the offical USACE example truck cert that shows their measurement requriements. We've taken ours further to include more details, but in general we have the same. Note how they are rounding in the example? We must follow the same.

### ✅ Q-69 — Which expiry date makes a certification expired?
**A certification never expires on the project.** If the **driver's licence** or the vehicle's
**tag** expires during the project, tickets worked after that date are **flagged, never blocked**.
*(ADR-079)* 🔨 **KD-50**.

> **User, 2026-09-24 (round 6):** Cert never expires on the project. If driver license or tag expires during then we would wanna flag it, but not block tickets.

### ✅ Q-70 — Which contractor does a pricing rule mean?
**The prime.** *(ADR-081)*
- **The contract** names the prime and its subs, in tiers (subs of subs included). That's set
  when a contract is added and its contractors selected.
- **A service code** is priced for a prime ("the rate for prime XYZ").
- **A rule** ties a service code to a contract and the order it bills under.
- **A certification** says whose truck it is (e.g. sub ABC), and the contract says ABC works under
  prime XYZ.
- A ticket that passes the rule makes **one transaction at the prime's rate, recording both the
  prime and the sub**. Subs have no rates of their own; the prime pays them outside the system.

🔨 **KD-48**, **KD-49**.

> **User, 2026-09-24 (round 5, in `spec/LISTS.md`):** Exactly.. We want to have 1st and 2nd tier subs.. Often you have a Prime hauler and under them are various subs, sometimes you even have subs under subs.
> **User, 2026-09-24 (round 6):** The contract names who the prime and sub(s) and in what tiers. When we add a contract and select or add contractors, we are at that point setting those details. Later when we add a service code and select a contractor we are saying (this is the rate for prime XYZ), and then in the rule we are saying, this rule is for this service code, which has rate N for contractor ABC, and to use transaction order 1 under contract 123. Then when a truck is certified and we say, this truck is for contractor ABC, we know its under Prime XYZ and what CY it has. So when a ticket is made that hits and passes a rule that links to that service code, we get a transaction for that Prime+Sub link in the data table. It's not a sepearate transaction for each though, and we aren't setting separate rates for the prime and subs. We simply notate who the parties are, but the subs all work under the Primes rate. The prime pays them separate from our system and we dont care nor do any of the firms or non profits that may ever use this system. Its about having the data show the links between things. A below is correct.

### ✅ Q-71 — Signatures, copies and the driver's badge
*(ADR-080)*
- The **certifying monitor's ID** is recorded automatically. If others helped, their user IDs can
  be typed in, and an ID that matches no user is flagged.
- A back-office user **QCs** the cert later and is recorded as **checked by**.
- **Client and contractor representatives: names only**, typed in, with no IDs.
- At QC, mark whether **signatures are on file** somewhere (digital or paper, kept elsewhere for
  now).
- **No colour copies.**
- **The barcode on the certification paper isn't used.** The driver's badge is what's scanned.

🔨 **KD-45**, **KD-50**.

> **User, 2026-09-24 (round 6):** Ignore color copies all together.. That is a feature of USACE paper stuff from the past. As far as which ID we put on the cert, its the certified monitor only to start, unless they had help and can put the other users ID manually. Flag no matches. Later when the cert is QC'd that ID is attached as checked by..admin or manager or other back office user. We aren't trying to have client and rep ID's. We just allow for their names to be manually entered. When we QC it, we denote if there are signatures on file somewhere - digital or paper somewhere else for now is all we need ot denote. … Ignore the barcode on the certification paper. We do not use that for anything.

### ✅ Q-72 — Debris types: fixed or extendable?
**Extendable, and each project picks the ones it uses.** A firm can add types a contract names,
e.g. **Marine-Vegetative** or **Marine-Construction**. The 12 USACE categories are the starting
values. Monitors still pick from the list and never type, which keeps reports clean.
*(ADR-074, superseding ADR-001)* 🔨 **KD-47**. USACE mapping: **Q-73**.

> **User, 2026-09-24 (round 5, in `spec/LISTS.md`):** we want to be able to add more debris_types and we want to be able to select whatever we need on a project, not be forced into a set type. Say we want to define Marine-Vegetative or Marine-Construction, because the contract specifices removal of a given debris type that isn't listed.

---

## J. Raised 2026-09-24 from the architecture spec review (`development/OPEN ADMS_ System Architecture…md`)

### ✅ Q-73 — Should each debris type say which USACE category it belongs to?
**No.** If the debris type exists in the list, it can be selected and used on a USACE job. No
mapping or notice is needed. *(ADR-081)*

> **User, 2026-09-24 (round 6):** No. As long as the type exists we can select it and use it as needed on USACE missions. We don't need to actually put a notice anywhere saying that though. Make sense?

### ✅ Q-74 — Re-certifying, and taking a truck off the job
*(ADR-079)*
- **Wrong measurements (a mistake):** correct the cert in place (audited) and reprocess its
  tickets. Invoiced tickets are unlocked first.
- **Truck modified** (e.g. sideboards added): a **new certification with a new number**. The old
  one is kept, and the two are linked so the modification can be traced. How to link them (the
  user asked for feedback on a prefix): **Q-77**.
- **Pulled from work:** an admin **revokes** the cert from a date, with a reason. Tickets after
  that date are flagged.
- **Nothing else ends a certification.** Dates only lead to flags.

🔨 **KD-50**.

> **User, 2026-09-24 (round 6):** 1) re-measured because of a mistake? tickets not invoiced yet? fix cert and reprocess tickets 2) recertified because of a modification... new number and cert all together... mark references in notes about old truck cert and new so we have a reference saved of the modification. Possible we could prefix these instead to denote a mod version on the project? That's interesting to consider? Give me some feedback on this. … [revoking] We could build something like that in. Admin can go into a cert and revoke going ahead with reason. … Nothing should "end" it. Just dates that lead to flags and such. If a project is inactive we shouldn't be making any tickets for it anyway so lets not worry about this too much being simple stuff.

### ✅ Q-75 — Is there a USACE mode?
**No.** *(ADR-077)* Every project uses the same rules. What a USACE job needs is set up with
ordinary project options.
- **Load call:** an optional **"USACE approved"** flag that any project can use. There is no
  separate contractor-proposed / QA-approved pair.
- **Truck capacity:** always the firm's method (`adms-certifications` §3A.3). The other method is
  deleted from our records at the user's instruction.
- **GPS:** ~~accurate to 30 feet or better~~, withdrawn by Q-80 / ADR-083: the device sends
  what it has, and the back office checks it.

Leftovers: **Q-80**.

> **User, 2026-09-24 (round 6):** I'm revoking the idea of a MODE. There isn't any need to think about it like this. Apart from having a flag on the load call to allow a monitor to mark that USACE approved it, there isn't anything else we can't setup inside a new project to accomodate this by using the options we expect to have. And we could easily just make the flag optional so any projet can use it by default. So lets take that approach so we avoid all the extra stuff invovled in trying to make this work. Truck cap idea is still busted. Not sure where you are getting that buts its wrong and its not what the USACE docs say. So stick to my way and scrub the other way from references here so we aren't getting conufsed. Literally delete it from the records. GPS is always within that accuracy or better.

### ✅ Q-76 — More truck details?
**No.** What's already captured covers what USACE expects. Truck number, VIN, make, year, colour
and tare weight are not recorded.

> **User, 2026-09-24 (round 6):** Ignore all of that. What we have already handles what USACE expects. These other details are just extra things we dont need to worry about.

---

## K. Raised 2026-09-24 from the certification answers and the USACE example sheet

### ✅ Q-77 — How should a modified truck's new certification point to its old one?
**A "replaces" link, never a prefix.** The new cert records the old number, the date and the
reason. Both show it: "replaces 718554 (sideboards added, 10/3)" and "replaced by 718601 on 10/3".
Tickets on the old number after that date are flagged. A **MOD** label may show beside the number,
display only. *(ADR-082)* 🔨 **KD-50**.

> **User, 2026-09-24 (round 7):** Yes this is simple and it works.

### ✅ Q-78 — Radius corners: how they're measured and computed
**Locked** *(ADR-087)*. A radius corner is a rounded bed corner (drawn on the USACE sheet's plan
view), not a round bottom.
- **Measure:** L, W and H as if the corners were square. **R** = the distance from the imaginary
  square corner (where straightedges along the two walls cross) to where the curve starts.
  **Run** = how far the corner goes (the bed's height seen from above, or its length for a
  rounded floor edge). Count the corners.
- **Compute:** (R × R − 3.14 × R × R ÷ 4) × run × corners, always subtracted, rounded to
  hundredths each step. R 12", run 60", 2 corners → 3,715.20 cu in.
- A hoist / dog house box takes two lengths (ADR-082).

> **User, 2026-09-24 (round 7):** Pretty sure this is used for "round bottom" type containers. Can you make heads or tails out of using it for that? If you are measuring it in person with a tape measure, how do measure it and what are do you input vs a rectangular shape? … [hoist] Your recommendation is solid.. Lock it in.
> **User, 2026-09-24 (round 8):** YES... this is exactly right.. lock it in now.

### ✅ Q-79 — Rounding twice at the boundary
**Round each step to hundredths first, then to a whole CY with .5 up.** 32.495 → **32.50** → **33**.
Had it come to 32.4, it would round down to 32. *(ADR-082)*

> **User, 2026-09-24 (round 7):** We want to round to 32.50 and then since it was not 32.4 (which we would round down to 32), we round up to 33. Make sense?

### ✅ Q-80 — GPS accuracy, and crew days
1. **GPS:** the system doesn't judge accuracy. The device sends whatever fix it gets, often
   offline and on older hardware. The **back office** checks whether the GPS makes sense and
   **adjusts drift** on a map when it doesn't; that's normal work. Automated drift calculations
   come later. No 30-ft check. *(ADR-083)*
2. **Crew days:** billing **varies by contract**, so it's configured through service codes, rates
   and rules. Crew time is captured as an **itemised unit rate ticket**: item name + hours, e.g.
   **Skid Steer 10.25 · Truck 10.25 · Sign 8**, the same shape as white goods (Washer 2 ·
   Dryer 1). *(ADR-084)* How a service code turns hours into a billed quantity: **Q-81**.

> **User, 2026-09-24 (round 7):** [GPS] The system wont know a ticket is 30 feet or less or more accurate. How would it? When a monitor submits a ticket their device grabs whatever GPS it can and sends that. It's the job of someone in the back office to confirm if that GPS in fact makes sense. We will eventually add in some drift calculations, but for now lets not worry about that. Assume the device is not trying to verify its own GPS in this manner. Plus if they are working offline their GPS is not using data and wont have anyway to verify things like this. Assume older devices and such. So we have a busy back office crew looking at maps adjusting drift in some case. That is normal.
>
> [crew days] It can always vary. Hence why we use the options avail between service codes, rates and rules to create this behavior with unit rate tickets. Also, because we arent going to use a MODE for USACE ops, we need to be able to use a unit rate ticket in a unique way to get hour like how we handle white goods and other variable types that need add'l user input. Like how a unit rate can take in a Washer and Count, and Dryer and Count... We can take in it like this ticket is cut for given crew... Skid Steer and hours, Truck and hours, Sign and hours... It takes in item name and hours as a count.. Same exact shape as we use for other unit rate options. SO pretty sure you can deduce how we can resuse that for this. If not ask follow ups.

---

## L. Raised 2026-09-24 from the crew-time answer

### ✅ Q-81 — How does a crew service code turn hours into a billed quantity?
**One of three methods, chosen on the service code** *(ADR-087)*:
- **per hour** (quantity = hours);
- **per day, exact** (hours ÷ day length, default 12: 10.25 → 0.854);
- **per day, in steps** (bands the admin sets, e.g. 1.5–4.5 h = 0.25 … 10.5+ = 1).

> **User, 2026-09-24 (round 8):** Yes.. this will cover what we need. Lock it in.

---

## M. Raised 2026-09-24 from the ledger change (transactions regenerated, not reversed)

### ✅ Q-82 — Where old transactions live, and what a rate change does
1. **No history table.** A ticket bills once per transaction line, and nobody asks what a ticket
   cost last month. The audit log already holds every removed line in full (ADR-085).
2. **A rate or rule change regenerates the transactions of every affected ticket that isn't
   locked as invoiced**, unlocked ones included, so a wrong rate can be fixed in minutes before
   the final package goes out. Invoiced tickets are left alone. *(ADR-090)*

> **User, 2026-09-24 (round 9):** What did this ticket bill last month? Im not sure what you are thinking about here...A ticket bills something only once per transaction. We are never going to ask, what did this single ticket cost last month? … Tickets that are not in an invoiced state should be able to be re-processed or otherwise have transactions regneerated on them when a rate or rule change is made in this way. Unlocked tickets... the same. Imagine if you could never unlock some tickets that hadn't actually been invoiced that all had the wrong rate and you need to fix it in 30 min to actually send the final package to the client that has all of the ticket logs with transactions? You wouldnt' want that at all. Make sense?

### ✅ Q-83 — Several fees on one ticket
**Locked as proposed** *(ADR-089)*: each fee is its own service code and rule, a ticket gets one
transaction per rule it matches, and each service code carries a **fee kind**. Two rules of the
same kind matching one ticket → flagged. **Who a fee is for:** it's simply a contract line item,
and the transaction belongs to the contract its rule names. The system records what's owed per
the contract; it doesn't model a separate payee. **Terminology** *(ADR-091)*: TDSR = Temporary
Debris **Staging** and Reduction Site; DMS means the same thing; use "TDSR".

> **User, 2026-09-24 (round 9):** Perfect. Lock this in now! … its billed. all we are doing is generating the record that says, these payer items need to be paid back per the data here in this package.. think about it... we are tracking working being done that is paid based on contract line items. we put those into service codes+rates, make rules and attached them to the contract. to be clear, the "line items" are literal lines on a paper document the firm reads off of and manually enters into the system to create the service codes, rates, rules and so on. … Also thanks for correcting me on the TDSR.. I often write TSRS by mistake, even though I know the correct term is TDSR which stands for Temporary Debris Staging and Reduction Site. Allow me to also take this moment to note that a DMS is functionally the same thing. So we can literally say TDSR/DMS as in this industry both are used interchangeably often but if we want to be to spec we just stick to TDSR.


---

## N. Raised 2026-09-25 — the stack, devices, security, time and photos

### ✅ Q-84 — What phones do monitors carry, and how is the field app tested?
**Monitors are issued Android phones or iPhones**, set up for them, and hand them in at the end of
the day. **Testing goes: browser first** (make it work in a browser as far as possible), **then
iPhone, later Android.** *(ADR-099)* Because iPhone web pages can't reach a Bluetooth printer,
the field app is proposed as one React codebase wrapped with Capacitor (`spec/ARCHITECTURE.md`
§3, §12).

> **User, 2026-09-25:** for testing we want to make things mostly work in a browser to the extant possible, then for further testing we target iphone and later android. Monitors will be issued either Androids or Iphones in the field provisioned to them as described. They turn those devices in at the EOD.

### ✅ Q-85 — Where does a firm's server run?
**In the firm's own cloud, on its own servers.** A device syncs whenever it has a data connection; that's
what "sync" means. **Railway + Netlify is the one deploy we ship**, as the demo and a development
test option; firms extend it to host wherever they want. *(ADR-099; amends ADR-004)*

> **User, 2026-09-25:** we can assume firms run this in their own cloud instance(s), and to sync one must have some data connection (that is what we mean by sync). The deploy on railway / netlify is just a dev testing option we want to ship this with initially. In the long run it would be ideal if it was easy for a firm to just pick where they want to have it setup but as this is going to be shared as open source, we only want to make it working for the demo case. They can extend it to work where they want.

### ✅ Q-86 — One monitor per device? What happens when another monitor takes it?
**One monitor at a time.** A device set up for a project and certain ticket types can **switch to
another monitor on the same project, offline, with the master passcode**, for a monitor the
project already knows by name and **Monitor ID** (e.g. `M003490`). If the previous monitor's
work hasn't synced, it's **archived on the device and pushed in the background** when a connection
comes; work never stops. *(ADR-095)* How the new monitor proves who they are offline is **Q-90**.

> **User, 2026-09-25:** One monitor at a time. If they logout and the device is provisioned offline we havent synced prior work, we dont want to stop work so we archive the former for when sync is avail and push it in the background. The new user is able to login. (but how did we provision offline? The device was already setup for projet XYZ and knew it could make tickets ABC. All we needed was to give the device to a new worker who would use it for unit rate tickets, while the former used it for collection tickets, both monitors are working the same project so the device was able to just change users with the authorization of the master password setup for a new user (since that user would already be known by Name & Monitor ID (a record we create on each new user, e.g., M003490).

### ✅ Q-87 — Which clock do we trust, and how do monitor hours work?
- **Project time zone.** Tickets and time-clock entries use the project's time zone (a Texas
  project is in Texas time).
- **Offline, the device's clock is the only time it knows**, and that's what goes on the ticket.
- **Reconciliation compares the times** to make sure they make sense, and flags the ticket for
  review with a message about the time issue if they don't.
- **Time clock (monitors' own hours):** start (e.g. 0600), a 30-minute break when working 6+ hours
  (e.g. 1300–1330), clock-out (e.g. 1850). A day starts early and ends **before midnight**; past
  midnight goes on a new day. **No limit on monitor hours**, as long as it's honest work.
- **The 12-hour rule is contractor crew hours only** (ADR-068), never monitors.

*(ADR-100)* Mechanism proposed in `spec/ARCHITECTURE.md` §10.

> **User, 2026-09-25:** Are you asking for the Time clock or for Crew Hours here? Because these are very different. It sounds like you are talking about monitor work time, which is NOT limited to 12 hours shifts. That is contractor ruling. For monitors using Time clock it is simple. When did you start? 0600. When was your 30min break (assuming you worked 6+ hrs or more). 1300-1330. Are you clocking out now? 1850. A monitors day can start early (4,5,6,7 am) and end late, but before 12AM midnight. If someone runs over 12AM, they need to log time on a new day. So there is your answer, worker hours use the 24 hour timeclock and we dont limit how mnay hours it can have, so long as it is for honest work. But I think your bigger question is which devices time do we trust? The project_timezone should match tickets and worker hours. If someone is working in TX their times on Time clock and tickets should be in TX time based on the projects timezone. But when a device is offline and its creating tickets the only time is knows is the device time and that is what it will have to submit on the ticket. So on the reconcile side we need to be comparing the times to make sure it "makes sense" otherwise flag for review with a message about the time issue. Make sense?

### ✅ Q-88 — Photos: shrink them? keep them how long?
**Shrink carefully:** keep the quality as close to the original as possible, reduce the size by a
fraction, and **keep any depth data** the phone captured (LiDAR or other built-in depth), possibly
as a separate linked item. **Keep them indefinitely**; clients don't make data-handling demands.
*(ADR-101)* Mechanism proposed in `spec/ARCHITECTURE.md` §11.

> **User, 2026-09-25:** We do want to use downsizing in the code to reduce the file size, but carefully to preserve data captured from the device such as an depth info (lidar, or other built in depth data the device may support in the image the phone is able to capture).. we may even just want to extract it and make it a separate item but that sounds complicated. In any case the goal is to keep the image quality as close to original as possible while reducing the size by a fractional amount and preseving the depth field info (if any). Clients do not make requests like this but the retention period is indefinite or so we should assume.

### ✅ Q-89 — How is a device set up, and who can sign in on it?
- **It's called "setup"**, never "provisioning".
- **Setup must be online.** The **master passcode** opens it; then the project, the ticket types,
  and **the monitor, picked from a list**. The monitor already has a password; the app takes the
  secure verifier it needs and sets the monitor up locally.
- The monitor then **signs in offline** with username and password, checked against what's
  stored.
- **Nobody else can sign in** until the device is set up for them.
- **The master passcode can also sign in as that monitor.**
- A monitor **can't sign in on a device not set up for them**.
- **No device backups.** **A phone can't be swapped.**
- **Data on the device is encrypted**, but a device must still be **taken out of service and synced
  even if the monitor who signed in isn't around**.

*(ADR-095, ADR-096)* Mechanism proposed in `spec/ARCHITECTURE.md` §7–§8.
**Amended 2026-09-25:** the phone gets a **login list** for the project's monitors, and monitors are
created on a phone by the master user (Q-90, ADR-105); one master passcode per firm (Q-91,
ADR-106); who exactly may sign in on a set-up phone is **Q-115**.

> **User, 2026-09-25:** A device has to be provisioned right? When that provisioning happens the device is setup for a project and ticketing type right? Okay so then a monitor is able to login using their username and password... The device even offline will need to allow them to login and we must trust that this login can only happen if the phone was already provisioned and this user username and password were stored, with the password hashed so the user can type in a regular password and validate their access even while offline. Provisioning is everything here. We dont want to acually call it provisioning or provision or provisioned though.. We want to call it setup. Data on the device should be encrypted, but we have to be careful because we need to be able to take that device out of service and sync it even if somehow the monitor who logged in isn't around. We need to be able to login as that user using a master passcode, just like we need to be able to use a master passcode to setup the device (otherwise called provision it before). We can't do backups on device. A phone cannot be swapped. The user that is logged in cannot login to another device if it wasn't provisioned for them. The master password opens the setup (which must be online) and is able to select the user from a list. User should already hae a pass setup. App grabs secure hash info and sets the user locally. Now the user can login to make tickets offline. If someone else tries to login they cannot until device is setup for a new user.

### ✅ Q-90 — Signing in offline, and how the server knows a monitor is who they say
**The user's model** *(ADR-105)*:
- A monitor signs in with **their ID** (Monitor ID or employer ID, see Q-115) and **their phone
  number without the area code** as the password: easy to remember in the field, easy to tell a
  worker who forgets, and easy for an admin to sign in as them.
- When a phone is set up for a project, it receives a **login list**: a hashed sign-in check for
  each monitor enabled on that project. Any of them can then sign in with their own ID and password.
  That is how the server knows it's James and not someone else.
- The risk is accepted: someone holding a lost phone who knows a worker's ID and phone number
  could sign in. The mitigations are that firms keep strict PII rules, phones are handed in
  nightly, a missing phone is removed from service in the admin panel, and tickets it makes
  afterwards are held for review.

**Agent assessment** (the user asked for one): it's workable **if** the protection rests on the
phone rather than on the password. A 7-digit number can be guessed by anyone who gets the hashes
out. The safeguards, proposed in `spec/ARCHITECTURE.md` §7.2:
1. monitor credentials work only on set-up phones, never on the web;
2. the login list sits only inside the encrypted store, with a per-phone salt;
3. sign-in tries are limited and then locked until the master passcode;
4. tickets from a removed phone arrive flagged;
5. a screen lock on every phone.

The one genuinely different option: monitors carry a **printed badge with a QR code** and scan it,
plus a short PIN. It is faster in gloves and nothing to remember, but it's a new badge to
issue; it can be kept for later. Creating monitors on a phone, and the other two kinds of user, is
recorded in ADR-105.

> **User, 2026-09-25 (inline answer):** I wrote in 7.5 Architecture... some on this but it didnt answer the question. So we still arrive back at the same issue
> How does the server know James is legit. It has his info but as pointed out if we store everyone on the project
> to the device it creates issues. You may also note we have a monitor_id or employee_id we capture for
> each. That's what we use as their login so it is easier for them to remember. Then we use their phone
> number without the area code as their password. I know this isn't very secure, but its the only was
> that works in the field going fast with workers who can't remember things easily. So if they forget
> you just tell them, lookup your ID and you know your own phone number. It also makes it easier in
> case the admin actually needs to login as that user. The reality is that we really do kinda have to
> do this in a "bad way" but that bad way can be the "least bad" as possible. My proposal and please
> suggestion your own totally different way if this is too bad to move ahead with.
>
> In the data we push to the device we do give it a login_list of sorts with the hashed stuff against
> the right key so when the phone is setup for their project, they can just login using that username
> and password on any project they are enabled on. Yes this means that technically if a device is lost
> someone could use it to do stuff if they figured out the persons ID and phone number combo. But firms
> keeps strit PII rules and dont share this stuff. Workers dont have each others info like that listed
> easily. And moreover phones are turned in each night. If one is missing we can remove it from service
> in the admin panel. If it makes more tikets we block them for review. Thats my idea.
>
> **User, 2026-09-25 (in `ARCHITECTURE.md` §7.3, "PROBLEM"):** - This is an obvious issue. And it proves that how we handle this matters-alot. So take what I write
> here and think about how it applies elsewhere, make changes and follow up if needed.
> - To create a new user we have choices and it depends on what we are making them for.
> - 1) a new field monitor //used for monitors in the field
> - 2) a new back office user //used for analysts, managers and others
> - 3) a new outside user //used for clients, contractors and others
>
> - 1) the master user must login and select the option to create monitor
> - 1) the master user sets a username and password, then logs out. This hits the server to create the new user.
>
>    *NOTE* that wasn't a provionion step and the master user logged out. If they wanted to provision
>    they should be able to simple finish user creation and see an option to setup device to a project
>    and then once that is done save it. So now you see user creation and setup both need to be online.
>
>    Making 2&3 is done by the admin in the back office.

### ✅ Q-91 — The master passcode
**One per firm:** a single value for the whole system, set by the firm installing Open ADMS. It
covers every project and is shared with whoever needs it. **The firm changes it manually whenever
it chooses, or never.** There are no reminders or alerts. *(ADR-106)*

> **User, 2026-09-25 (inline answer):** It is set on the system itself (global value) set by the firm installing this. It can be changed.
> It applies to all projects, and it is shared with who needs it.
>
> Per firm. […]
>
> Manually by the firm at their choice. Leave it forever or change it. No warnings or alerts about it.

### ✅ Q-92 — Database guards: is "Prisma plus a little SQL" the right long-term design?
**Approved as recommended** *(ADR-113)*:
- **Keep Prisma.**
- **No business logic in the database.** Pricing, capacity math and reconciliation live in the
  TypeScript domain package.
- **The database holds only the guards:** roles and grants, no deletes, audit capture with a
  required actor, an append-only audit log, the copy-before-delete on transactions, row-level
  security for viewers, and constraints.
- The guards are written as **their own migrations**: created with Prisma's "create only" step,
  reviewed, and proven by tests.
- **The rule is now:** never edit a generated or applied migration. The guard hook enforces it: a
  migration file can be written only while it's still Prisma's empty "create only" stub.

Research and sources: `spec/ARCHITECTURE.md` §5.6.

> **User, 2026-09-25 (round 3, inline):** APPROVED
>
> **User, 2026-09-25 (inline answer):** Is this the way you would do it or at a high level to scale is there a better approach? Say you had a blank slate?
> If SQL like proposed is the BEST (not the fastest) way for the long haul as a fully developed platform, then okay.
> But I really feel like if a senior developer was working on this why might take a different approach.
>
> Unapproved and needs more thinking and review. Go do some digging and get back.
>
> **User, 2026-09-25 (in `ARCHITECTURE.md` §5.6):** Is there another way? We really dont want to have Primsa and "something else". Better question. Is Prisma right for what you know I want to do here?
> Maybe there is something that supersedes Prisma that's even better for this? Check the web see what you find.

### ✅ Q-93 — Should generated ticket numbers carry a check digit?
**No.** *(ADR-114)* Numbers stay bare (ADR-062). Along with it, you gave these facts:
- **A tandem's truck and trailer are two tickets with unrelated numbers.** Example: the truck on
  100100 and the trailer on a control ticket 200500. The system must never expect the halves or
  the two containers of a tandem to have related numbers, although it's nice when they do.
- **Tandem cert numbers are usually consecutive when certified together** (typically a
  self-loading trailer and a non-hydraulic dump trailer), **but not always.** A driver may drop a
  trailer and pull a different one already certified for the project. That is **not flagged**, as
  long as everything else makes sense.
- **Haul-out prints at the collection side**, with the load call; that ticket goes with the driver
  to the haul-out complete end.
- **On a control-ticket project, the disposal receipt can be handwritten.** The disposal monitor
  scans the control ticket and writes the load call (e.g. 60%), their own details and the truck
  number on its back in pen. The driver takes it to their office as a reference, and the sub
  compares it with our records at the invoice stage (ADR-115).

> **User, 2026-09-25 (round 3, inline):** I think NO, and here is why. Say a truck was loaded using ticket 100100 and the monitor for whatever reason using control
> tickets uses ticket 200500 for the trailer. When we use control tickets we set the range wide and aren't issuing numbers
> for collection side work the same way, at least in the case of load tickets. Haul out is reversed as usual so we print a
> ticket during haul out collection with the load call and that goes with the driver to haul out complete.
>
> We can also scan
> a control ticket for that disposal load and just write the percentage on the back of the ticket with a pen. The driver just
> uses it for a reference to turn into his office, and then they compare it to our records later at the invoice stage. I know
> it is wild but literally the sub will take the pre printed ticket with 60% written on the back in pen that has the monitor
> details also written on it and their truck number. The monitor uses the blank back side of the ticket of the front - so long
> as they write the info for the driver.
>
> So if you are trying to use that method above you will right away see these two tickets as having some kinda issue. We dont ever
> want to expect the pairing to match up on tickets like that, although it is nice when they do.
>
> Also on a related note about pairing.. I vaguely remember a note somewhere about how a "tandem" would have consecutive numbers.
> Usually when they are certified (typically a self-loading trailer and non-hydraulic dump trailer) are issues consecutive cert numbers
> but not always. And the driver might drop the trailer and get a different one already certs for the project. We dont stop the work or
> flag those tickets so long as everything makes sense.
>
> **User, 2026-09-25 (inline answer):** Explain your thinking on this more.. Show some examples here so I can approve it or suggest another way.

### ✅ Q-94 — What happens when a device runs out of ticket numbers?
**Not an issue; cancelled.** A 1,000-number block lasts far longer than the 2–3 days a phone
goes between syncs, and each sync tops it up (ADR-065). Checked for clashes: a phone that makes two
kinds of numbered ticket (e.g. collection and unit rate) holds a block for each, and even a busy
unit rate monitor at 100–200 tickets a day has 5+ days in a block. **No clash found.** The
"two days left" warning stays as a quiet safety net.

> **User, 2026-09-25 (inline answer):** 1000 numbers will never get used up by a monitor in 2-3 days and in that time they will sync. Cancel this as an issue
> unless those params clash somewhere else in which case explain it here please.

---

## O. Carried forward 2026-09-25 from your Build 1 answers (`spec/FROM-BUILD-1.md`)

Each ✅ below is **your own answer from Build 1**, kept word for word in `spec/FROM-BUILD-1.md`,
or a new answer you gave on 2026-09-25. *(ADR-102)*

### ✅ Q-95 — Receipts and printing *(Build 1 answer — carried forward)*
- **Zebra ZQ series** printers, on every project.
- Collection prints **two** copies, or uses a control ticket plus its stub.
- Disposal, haul-out and final disposal each print a **disposal copy** for the driver, who leaves
  with both halves.
- **Unit rate always prints.**
- **The barcode is the ticket number.**
- Anything printed can be **scanned back**; if the ticket exists, the device just says so.
- **Receipts are never records**: no audit entries, no print counts, reprinted any time.
- Certifications print an itemised receipt.
- Pre-printed ranges are set at project setup, and a printable test set is needed.

*(`FROM-BUILD-1.md` §1; ADR-102)*

### ✅ Q-96 — How the system issues certification numbers *(Build 1 answer — carried forward)*
- A **per-project series set at project creation**, starting from a seed that doesn't look made
  up (not a round number, not all zeros, e.g. `610810`), counting up by one.
- A **tandem** truck and trailer get consecutive numbers (`610810`, `610811`).
- Alongside ADR-045: a cert number may still come from pre-printed paper instead. Either way it's
  unique within the project.

Fills KD-10's missing issuer. *(`FROM-BUILD-1.md` §2; ADR-102)*

### ✅ Q-97 — Monitoring firms, temp agencies and Monitor IDs *(Build 1 answer — carried forward)*
- The operating firm is itself a contractor record.
- A subcontracted monitoring firm or temp agency is a contractor of the **monitoring** kind.
  Contractor kinds: hauler, monitoring, crew, other. Never typed free text.
- Every worker has a **system-issued Monitor ID** (e.g. `M003490`) plus an optional ID their own
  employer uses.
- Monitors from different firms work the same loads, so **each half of a ticket records its own
  monitor**.
- Monitor time is never billed through service codes.

*(`FROM-BUILD-1.md` §3; ADR-102)*
**Amended 2026-09-25** by Q-108: a project may have **several primes**.

### ✅ Q-98 — Capacity is never typed; a truck keyed in by hand is flagged *(Build 1 answer — carried forward)*
- The certified capacity comes from the truck list the device downloaded, filled in when the badge
  or placard is scanned. **A monitor never enters capacity.**
- If the truck isn't on the device and must be typed in, that's allowed, marked as manual, and the
  capacity field shows a warning to check it against the placard. The back office verifies it
  after sync (flagged, never blocked; ADR-071).

*(`FROM-BUILD-1.md` §4; ADR-102)*

### ✅ Q-99 — Permits for disposal sites
**Every disposal site requires a permit.** Work isn't stopped when a permit hasn't been issued
yet, but the site is **flagged as outstanding** until it has one. Tracking permit requests and
the like comes later, gradually. *(ADR-111)*

> **User, 2026-09-25 (inline answer):** All disposal sites require a permit. We dont stop work if a permit hasn't been issued yet, but we do
> flag it so that we know it is outstanding.
>
> *Note* In Build 1 we were doing all sorta magic tracing if we had requested it and so on. For this we
> do want to eventually get to that point but gradually. The mistake we made in build 1 was trying to do
> it all in 1 shot vs build out the plans and details, and then develop the system in phases testing each
> part out the right way.

### ✅ Q-100 — Reports, exports, worker admin and back-office layout *(Build 1 answers — carried forward)*
**Kept for Phase 4.** They are quoted in full in `FROM-BUILD-1.md` §9–§13 and recorded as REQ-409…REQ-416:
- the daily report (landscape PDF, title, index page, one page per operation with a map, estimates,
  end page with a contact email);
- the email summary format;
- **no costs in reports**;
- maps from self-served OpenStreetMap data, with no licence fees;
- reports aren't stored;
- exports in standard formats from one Exports place;
- photo PDFs in two standard layouts (several per page, or one per page with the receipt);
- granular worker permissions with bundles, bulk changes, a profile page and undo;
- a collapsible sidebar, no explanatory banners, and dashboard ordering.

*(ADR-102)*

### ✅ Q-101 — Service codes are named by the firm, freely
**No naming convention is offered or suggested.** A service code is whatever the firm types from
the contract's line items: `6A`, `90A`, `40`, `35`, `7A`, `57A`, `12`, `54A` in the legacy tool.
The system lists them wherever a code is picked: as a rule's criterion value on unit rate tickets,
and as the service in a rule's action. A rule's name often starts with its code
("6A - OPERATION OF TDMA"), by the firm's choice. **Supersedes** the Build 1 idea of a published
convention (`FROM-BUILD-1.md` §6). *(ADR-109)*

> **User, 2026-09-25:** carefully note the service code names like 1A and so on, how they show up as options in a couple places and how that relates to one of my responses about not forcing a convention. The service codes in the images were custom named by the firm using the older tool, and we want ours to mirror that.

### ✅ Q-102 — Distance: loads and haul-outs only, by road
- Only hauled loads (loads and haul-outs) have a distance. Unit rate work is never priced by it.
- **The distance is the road route, not a straight line:** the shortest legal route a truck would
  take between the collection's end GPS and the disposal's end GPS, from our own routing server
  loaded with OpenStreetMap data (ADR-110; engine choice Q-114).
- Rules can test it ("Mileage"), so a mileage band can pick a service code.
- A rule condition that can't apply to a ticket type isn't offered for it.

*(`FROM-BUILD-1.md` §7; ADR-102, ADR-110)*

> **User, 2026-09-25 (in `ARCHITECTURE.md` §3):** - woth considering for geography.. PostGIS for some data storage to get native routing distance calcs? Or is rolling our own code using haversign math faster and more efficient?
>
> We do a lot of distance calculations,, A LOT! Like a tone really. Think about it. We have unit rate tickets with gps that doesnt need much checking and isn't using distance for billing. But loads? We always use the distance, and we do not use a straight line eighter. We literally take the gps for collection when the ticket ended right, and then we get the gps from disposal when that ticket ended right? Then we take those 2 GPS and get he distance travelled on a road using that to get the mileage. So we actually have to find the shortest route the truch would take between those 2 points on a legal roadway. Does that make sense?
>
> So the question I have is given how many tickets we could have..say a firm is using this and has 40 active projects and each might have 50-100 people working on it at a time. Each of them is making load tickets that will need distance calculated. We need to think about hosting our own OSRM (Open Source Routing Machine) server and load it with OpenStreetMap (OSM) data. That would be a separate server/service we run. So in our case we would test this using Railway so now that is 3 services there (db, api, osrm).

### ✅ Q-103 — Everything is a form; billable or not decides where it's listed *(Build 1 answer — carried forward)*
- Tickets, certifications, surveys, ROEs and incidents are all forms a monitor fills in; what
  differs is whether the result bills.
- In the back office, billable tickets are under **Tickets**; incidents, surveys and ROEs are
  under **Reports and Forms**; money is under **Billings**.

*(`FROM-BUILD-1.md` §8; ADR-102)*

### ✅ Q-104 — The collection address
- When **completing a collection ticket** (not a haul-out collection), the monitor presses
  **"Get GPS"**; the phone gets a fix and shows it. They'll already have used **"Mark waypoint"**
  while working the ticket.
- Then **"Get address info"**: with a connection, the address is looked up through our own
  service; without one, the monitor types **street number and street name only**.

*(ADR-111)* **Agent note:** a routing engine returns the nearest **street name** but not a house
number. A full address needs a reverse geocoder alongside it (Q-114). Also, the lookup usually
won't have a connection in the field, so typing will be the common case.

> **User, 2026-09-25 (inline answer):** When completing a collection ticket (not haul out collection) the app will show a place to click
> "get gps". They would have already seen a "mark waypoint" button while working the ticket right.
> Now they click this other gps button and the phone attempts to get the GPS. If it successful it
> populates in the app. It then prompts them to "get address info". If they have a connection it
> tries to get it using our OSRM and if success it populates that in the app too. Else it prompts
> them to enter the address street # and street name only, manually. make sense? ask follow up if needed

### ✅ Q-105 — When a barcode won't scan
**Yes to both:** a typed ticket number is **flagged** so the back office knows ("Ticket 104499:
number typed, not scanned"), and the monitor is **asked for a reason** when skipping a scan.
*(ADR-111)*

> **User, 2026-09-25 (inline answers):** (1) yes flag is so back office knows (2) yes ask for a reason

### ✅ Q-106 — Load call: typed, never prompted
The load call is **typed by the monitor as a whole number**. There are no steps, no picker and no
suggestion of any kind. *(ADR-111)* Whether **0** is accepted is **Q-109**.

> **User, 2026-09-25 (inline answer):** It has to be manually entered as a whole number from 0-100. We cannot prompt them at all on what to
> enter. So that makes this one easier.

### ✅ Q-107 — Unit rate: the crew badge, the phases, and QC
1. **The crew badge is only a phone convenience.** For unit rate work the monitor scans a crew's
   badge to start, then keeps making tickets for that crew until they change crews or the phone is
   set up for new work. The system doesn't track "active" crews. The phone shows the current crew
   clearly, including as a confirm step when completing each ticket (Phase 3 UI note).
2. **Monitors document eligible work only.** They don't mark anything ineligible. The phases
   (pre-work, measure, post-work) are just where the monitor adds details, then completes and
   attests: "this should be paid per FEMA rules". Finding problems is the back office's **QC
   review**.
3. **New: a QC status on everything a monitor makes** (tickets, certifications, incidents,
   etc.): **QC Review** (the start), **QC Approved**, **QC Issues**, **QC Void**. It's changed by
   hand in the back office and **triggers no action on the record**. Example: of 100 tickets
   audited, 2 get QC Issues and 1 QC Void. All stay valid. When someone locks tickets as invoiced,
   any of those 3 in the selection are **flagged**. *(ADR-107)* How QC Void relates to voiding is
   **Q-110**.

> **User, 2026-09-25 (inline answer, part 1):** Yes that is how it must work.
>
> Let me get thsi straight. By being active we do not mean somehow the system sees Crew 123 as active
> because the monitor scanned their badge. The system doesnt care at all about it. Its just their phone
> locally. Unit rate work begins a little different in the app than collection/disposal/haul out loading
> type of work. Because each load changes trucks, the work scans the new badge each time. But with unit
> rate work they scan the badge to start work for a given crew. And then they keep stating tickets for
> that crew until they change crews, or their phone is setup for new work. They want to see what crew
> they are working on easily in the app and as a confirm step when completing tickets. Mistake happen too
> often not to remind about this in multiple places (couple notes for later UI stuff).
>
> **User, 2026-09-25 (inline answer, part 2):** A lot of assumptions here. Glad you mentioned so I can point out a couple things.. You are thinking
> too far ahead into UI stuff right here. You're also imagining the worker doing a bit more in this role
> than they do. Their job is to document eligible work, not inneligble work. So anything they submit is
> something they believe to be eligble. The back-office is where audits happen as QC reviews which flag
> issues that need to be resolved - beyond the scope of what reconcilliation is meant to handly automatically.
> As the ticket moves through the 3 phases in this case, the monitor simply adds the details needed and when
> done completes the ticket. By completing and attesting they are saying, this should be paid back per FEMA rules.
> Later the back office doing QC reviews find issues and changes the ticket status.
>
> Sure just dropped a bigone.. Statuses..
> Everything a monitor makes in the field.. tickets, certs, incidents, etc... all of that needs to be QC reviewed.
> That is a columun on each object and each can have a status of (QC Approved, QC Void, QC Issues, QC Review)
> All begin with the status QC Review meaning it needs to be reviewed.
> When these status are manually changed in the back-office, it doesn't mean we take additional actions on the ticket or
> other item directly though. Allow me to explain..
>
> Say a back office worker audits 100 complete load tickets and flags 2 for QC Issues and 1 for QC Void.
> Those tickets remain valid in the system, but when you go to lock tickets as "invoiced" you see these
> 3 tickets flaggegd if they are selected to be locked. If they aren't in the ticket list then it doesn't
> matter for whoever is doing their work at the time.

### ✅ Q-108 — Primes and subs
- **A project can have more than one prime.** (Build 1 was wrong.)
- **Each prime has its own subs, in tiers**, and **subs are never shared between primes**.
- **Two sub tiers at most.**
- **Subs are created at certification:**
  - nobody knows who the subs are until they turn up to be certified (the prime is on site to
    approve them);
  - the certifying monitor **selects the prime** and **types the sub's name** into tier 1 or
    tier 2;
  - the back office doesn't add them beforehand.

*(ADR-108)* **Agent proposal (mechanism, in ADR-108):** so one sub doesn't become three spellings
("ABC Hauling", "ABC Hauling LLC", "A.B.C."), the phone suggests subs already known under that
prime as the monitor types, and the back office can merge duplicates (audited). ⚠️ **Replaced by the user, 2026-10-15 (ADR-529 (f)):** no merge; certifications naming alike subs are flagged (`SUB_NAME_ALIKE`) and a person corrects the sub.

> **User, 2026-09-25 (inline answer):** Projects can have more than one prime.. Build 1 was wrong. And not only that but primes can have their own subs tiered. But
> subs are never shared by Primes. Also and this is important, the creation of these subs happens during certification. The firm
> has no way of knowing who the subs are until they show up and want to get certed. The Prime is on site to approve them and such,
> but never says beforehand who it is. So you cant wait for the backoffice to add them one by one. That means when we get a new cert
> we are checking that info. The worker would have had to select the Prime, but the sub would be typed in manually into the tier they are working under 1 or 2 (we dont need more than 2 sub tiers).

---

## P. Raised 2026-09-25 — from the answers above and the legacy rule editor

### ✅ Q-109 — Can a load call be 0?
**Yes: 0 is accepted and flagged**, and it bills nothing: "Ticket 104499: load call 0%. Flagged
for review." It is never refused. The load call is a whole number from **0 to 100**. *(ADR-116;
amends `adms-domain` §1.3)*

> **User, 2026-09-25 (round 3, inline):** #2 is more flexible and non blocking...APPROVE 2

### ✅ Q-110 — QC status vs VOID, and locking as invoiced
- **QC status is not reconciliation.** Reconciliation is the engine's automatic checks. QC status
  is the back office's own review mark on **everything monitors create**, non-billable items like
  incidents included. It tracks internal review work and what needs correcting. Setting a QC
  status **never updates the record or makes it reconcile again**; it only records where the
  record is in review.
- **Voiding is a separate, deliberate act:** a **Void ticket** button, in the review window or on
  the ticket's detail view, **always with a reason** (ADR-051/060).
- **QC status does stop invoicing:** open issues must be resolved before tickets are locked as
  invoiced. Which QC statuses block the lock exactly: **Q-116**.

*(ADR-117; amends ADR-107's "shown flagged at lock")*

> **User, 2026-09-25 (round 3, inline):** QC status is different from reconciliation. That is done by the system engine running all
> of its auto checks. QC status applies to all objects monitors create, even non-billable items like
> incidents. These are used to do internal work and to track what internally needs correction, etc.
> So when we mark something QC xyz, we aren't telling the system to update the ticket or reconcile
> it again. We are simply changing the tickets QC status to notate where it as in the review stage.
>
> Does that help explain things better across the areas it impacts?
>
> If a reviewer looks up a phantom load and needs to void the ticket manually the would do so by
> actually clicking a VOID TICKET button on their review window or when opening a ticket to review
> all of its details. Both cases require a reason.
>
> Does the QC status stop invoicing? Yes! Because open issues need to be resolved before you mark
> the tickets invoiced.
>
> Does this make sense now? Ask follow ups if not 100% clear.

### ✅ Q-111 — The legacy rule editor is the admin's rule builder
**Correction taken.** The screenshots are the **back office's rule builder**, not the field app.
The options they show are what the firm has already set up. The firm set up:
- the **service codes**, added **one by one by hand, each with its rate and its contractor**;
- the **contracts**;
- the contractors, disposal sites and other lists.

A rule is then built in this order:
1. the **ticket type** ("document format");
2. a **name**;
3. the **ifs** (criteria);
4. the **actions**: transaction, **order** (the #), **service code** and **contract**.

That is how our back-office rule builder works (ADR-118). What value the unit rate criterion
"Service Code" tests on a ticket: **Q-117**.

> **User, 2026-09-25 (round 3, inline):** WOAH!!! Those images where from the admin setup screen, not the field user screen. You thought about
> those images of the old rule editor all wrong. You are literally looking at the options a firm has
> based on other options already setup and things created in their system. So when you see the list
> of service codes those were already added 1 by 1 manually with rates attached and contractor selected.
> Then in the rule builder the rule is set to ticket type (doc type) and a name is given, then ifs,
> then trans action, order, service code and contract. You should be seeing it like that looking at the
> images now and be able to see how we need to think about making our rule builder for the back office.

### ✅ Q-112 — Rule actions
1. **Create Transaction #n.** The number is the transaction's slot on the ticket. **Two rules
   creating the same # on one ticket is the conflict that's flagged.** This replaces the "same fee
   kind" check.
2. **Delete Transaction #n** is used, e.g. "if the disposal site is the county landfill, delete
   transaction 2 (no tipping fee there)", and cases like it.
3. **Void Ticket: a rule may actually void the ticket.** The void names the rule as its reason.

*(ADR-118; amends ADR-060/069's "only a person voids" and ADR-089's fee-kind check)*

> **User, 2026-09-25 (round 3, inline):** (1) YES (2) YES..used for things just like and others like it too. (3) Allow a rule to be created that actually voids the ticket based on the rule.

### ✅ Q-113 — "Load Location" in a rule
**It's the address on the ticket** (street number and name). A rule can test it, e.g. *Load
Location EQUALS "Main St"*. *(ADR-118)*

> **User, 2026-09-25 (round 3, inline):** Its the actuall address info on the ticket.

### ✅ Q-114 — The routing server and addresses
**Valhalla** for road mileage and **Nominatim** for address lookup are both approved. Each is its
own server that we run, loaded with OpenStreetMap data for the project's region. *(ADR-119)*

> **User, 2026-09-25 (round 3, inline):** Approve Valhalla
> Approve Nominatim
> Sounds like these are separate servers we run which is how we want to make things work.

### ✅ Q-115 — Who can sign in on a set-up phone, and with which ID?
- **Option 2:** a phone changes monitors only with the **master passcode first**; then the new
  monitor signs in with **their own ID and password**. Monitors can't switch roles or phones on
  their own, and the server knows exactly who worked.
- **The username is the system Monitor ID** (e.g. `M003490`).
- **Allowed shortcut in the field:** the master passcode opens a **temporary session for a
  monitor picked from the roster**, with no personal password needed. At sync the server sees
  "authorised by the master passcode, for M003512" and knows who worked. The session ends at the
  end of that day, so the monitor must sign in properly (or the phone be set up again) next time.

*(ADR-120)*

> **User, 2026-09-25 (round 3, inline), switching:** 2. as we dont want monitors switching roles on their own, and it solves the issue of not knowing who it is.
>    but if it is easier on the field device to use the master passcode and default temp (so they dont need to make
>    a passcode each time), then in the server when it syncs later we see the master code link or w/e and
>    know it came from XYZ monitor authorized. Then we log them out or something. Whatever make sense to force them
>    to login again the next day or setup the devie again.
>
> **User, 2026-09-25 (round 3, inline), username:** Agent recommend approved here.

---

## Q. Raised 2026-09-25 (round 3)

### ✅ Q-116 — Which QC statuses stop a ticket being locked as invoiced?
**Anything that isn't QC Approved.** Every ticket must be audited and approved in QC before it can
be locked as invoiced; QC Review, QC Issues and QC Void all block the lock. *(ADR-121)*

> **User, 2026-09-25 (round 4, inline):** #3 all day.

### ✅ Q-117 — The "Service Code" criterion, and what a service code is
- **A service code is the thing that denotes payable work.** It is "work in digital form". There
  is **no separate "work item"** in the system; the agent's question had invented one.
- The firm sets up the project, then its contractor and contract, then its **service codes**, one by
  one. Each gets a unique name the firm chooses (`1A`, `2A`…), a rate, and its other options, and
  is saved on the project.
- **In the rule builder**, the back office picks a criterion (e.g. *Service Code* for unit rate
  tickets); the system fills the options on the right with that criterion's values, which for a
  service code means the codes that exist on the project. They choose an operator (equal, not
  equal…) and add the check, then more checks the same way, then the **action**: order #, the
  service code the transaction runs on (its rate), and the contract.

*(ADR-122; the whole builder is written up in `spec/RULES.md`)* How a unit rate **ticket** comes to
carry a service code, so the criterion has something to test, is **Q-118**. The operator list is
**Q-119**.

> **User, 2026-09-25 (round 4, inline):** Think about how this works..
> We have a project we already created and are setting up right.
> We added a contractor
> We added a contract
> Then we made some service codes and gave them rates. Those service codes got unique names like 1A, 2A etc... we named those when
> we created the service codes (also where we selected the other service code options). Then we saved those so they exist on the project.
> In the rule builder we already know what options we want a unit rate ticket to get as its criterion so we have service code as an
> option someone in the back office can select. They select it and the system populate the options field on the right (as shown in the image you
> saw before). We selet the equal, notequal etc and add it to the rule checks. Then we can do the same again to make another check inside that same rule and so on until we are done. Then we set the action, order, attached a service code to run on the rate and the contract.
>
> So if we wanted to say (For unit rate tickets, we want service code criterion option and add it to builder)
> then in builder we have the codes that exist on the project as choices. And again to attached to the rule itself.
>
> Im explaining this in detail because you described a "work item" in the system that doesn't exist. The service code is the THING that we say denotes
> payable work (like work in digital form), rules to make sure the work fits into the criteron needed and so on.
>
> Does this make sense? Follow up as needed please. And make changes so agents know what they are making and so on please
>
> **User, 2026-09-25 (round 4, inline), operators:** How we actually need to build the rule check - can you think of more we need besides: equal, notequal, inbetween?
>
> Criterion (value list) contractor, distance, disposal_site, etc...
> [equal, notequal, inbetweetn]
> Options from criterion

---

## R. Raised 2026-09-25 (round 4) — for the next session

### ✅ Q-118 — How does a unit rate ticket carry its service code?
- **The monitor picks it when starting the ticket.** On a phone set up for unit rate work, "Start
  new ticket" shows a list of the kinds of work the phone is set up for, **by name and code**
  (e.g. hangers, leaners, stumps, white goods, crew time). The monitor taps the one they think is
  right, then completes the ticket in its phases, or whatever that kind needs; each kind flows
  differently but starts the same way. **They never see a rate**; the rules still decide what
  transaction is created, at what rate, on which contract. *(ADR-124)*
- **One unit rate ticket carries one service code.** Itemised details are **not** service codes:
  a white goods ticket with three items is one code (e.g. `54A`); a crew time ticket with two items
  is one code (e.g. `99A`). The items (washer, dryer…) sit inside the kind of work; White Goods is
  its own debris type, and washer, dryer and the rest are inside it. Crew time is a different unit
  rate ticket. *(ADR-124)*
- Follow-ups: how an itemised ticket bills under its one code (**Q-120**); how a code knows which
  screen to show, and which codes a phone gets (**Q-121**).

> **User, 2026-09-25 (round 5, inline):** You are right and I missed a detail describing how this system works here. When a unit rate monitor has a phone
> setup for this they are actually presented with a list of types after they click "start new ticket". So if they
> are setup for hangers, leaners and stumps, when they pull up that list they see those names and codes. They click
> the one they think is right then complete the ticket in the 3 phases or whatever else is needed, as other unit rate
> types flow different but still have a simliar startup set of options.
>
> **User, 2026-09-25 (round 5, inline), itemised:** for example we might name the service codes like the follow, but only need 2 to handle all of that.
>
> white goods X 3 (details) 1 servie code = 54A
> crew time X 2 (details) 1 Service Code = 99A
>
> We would mix details like this first off, but that isnt answering you question. But agents must know this. White Goods
> is its own debris class type right.. Inside that are washer, dryer, etc.. Crew Time is a different unit rate ticket
> but if the monitor is setup for hangers, leaners, stumps, white goods and crew time...in theory they would see all of those
> ticket type options to start off with.
>
> Follow up if needed on this please.

### ✅ Q-119 — Rule operators: the full list, BETWEEN's ends, and mileage rounding
**Approved as proposed** *(ADR-125)*:

| Kind of value | Criteria | Operators |
|---|---|---|
| A pick from a list | contractor, debris class, zone, disposal site, site type, service code | EQUALS · NOT EQUALS · IS ONE OF · IS NOT ONE OF |
| A number | weight, volume, mileage, unit count, measurement | EQUALS · NOT EQUALS · BETWEEN · AT LEAST · AT MOST · MORE THAN · LESS THAN |
| A date | ticket date | ON · NOT ON · BETWEEN · ON OR BEFORE · ON OR AFTER |
| Text | load location (address) | EQUALS · NOT EQUALS · CONTAINS · STARTS WITH |
| Any | all | IS EMPTY · IS NOT EMPTY |

- **BETWEEN includes both ends**, and the builder **warns** when two rules' ranges overlap on the
  same transaction # (option 1).
- **Mileage is rounded to tenths of a mile, half up** (10.04 → 10.0; 10.05 → 10.1), before any
  rule compares it. You left this one to the agent; reasons: contract mileage bands are written in
  whole miles or tenths, a road route isn't accurate beyond about a tenth of a mile anyway, and
  tenths is what people read off an odometer. The unrounded distance is kept as well.

> **User, 2026-09-25 (round 5, inline):** 1. what agent recommends on this one makes the most sense. APPROVED.

---

## S. Raised 2026-09-25 (round 5) — follow-ups on unit rate tickets

### ✅ Q-120 — What does an itemised unit rate ticket bill, under its one service code?
*(ADR-126)*
- **White goods:** the quantity is the **total of the payable items**. `54A` at $40 each with
  Washer 2, Dryer 1 → 3 × $40 = $120.
- **Crew time:** the quantity is the **highest hours among the items**, once. Skid Steer 10.25 h and
  Truck 5.0 h → 10.25 h, then the service code's hours conversion (per hour, ÷ day length, or steps).
- **Freon recovery:** the system must support **both**, whichever the project is set up for:
  1. **extra transactions on the same ticket**, driven by what the monitor recorded in the item
     list; or
  2. **a separate unit rate ticket** with its own code.
  The items tell the system what's payable. A fridge whose freon was **extracted on site** is a
  payable fridge and a payable extraction. A fridge whose freon is **staged** isn't payable yet (it
  waits for more work later) and is counted under its own code. Your example:

  | Codes on the project | Ticket A: 2 fridges' freon extracted on site | Ticket B: 2 fridges' freon staged |
  |---|---|---|
  | `54A` $40 white good removal fee | ~~× 3~~ **× 6** (ADR-132: every white good removed; "× 3" withdrawn) | **× 4** (ADR-131: every white good removed) |
  | `56A` $30 freon extraction fee | **× 2** | × 0 |
  | `56B` freon staged | — | **× 2** |

  Ticket A: 3 fridges were removed; 2 had freon, and both had it extracted on site. Ticket B: 3
  fridges; 1 was removed, and the 2 with freon are left staged on site. How the washers and dryer
  count toward `54A` was **Q-124**: ⚠️ *they do (ADR-131/132): every white good removed counts, so A = 2 washers + 1 dryer + 3 fridges = × 6.*
- **Never mixed:** one ticket is one kind of work with one service code; white goods and crew time
  never share a ticket.

> **User, 2026-09-25 (round 6, inline), white goods:** 100% correct. APPROVED.
>
> **User, 2026-09-25 (round 6, inline), crew time:** 1. We take the highest number and use that. So if the Skid steer was 10.25 and the truck was say 5.0
> we take the time from the skid steer and apply that to the count.
>
> **User, 2026-09-25 (round 6, inline), freon:** 1. or 2. depending on how the project was configured. Both of these examples should be plausible with the system.
> 1. can work if when the monitor has selected white goods or whatever gives them a list to build
> say they marked
>
> 54A $40 white good removal fee
> 56A $30 freon extraction fee
> 56B     freon staged
>
> 2 washers
> 1 dryer
> 3 fridges (2/wfreon, 2/freon extracted on-site) this tells the system 3 fridges are payable and 2 freon extractions are payable.
>
> **User, 2026-09-25 (round 7, correction inline):** litereally means there were 3 friges
> 3 friges were removed
> 2 of them had freon
> 2 of them had freon extracted
> 54A * 3...correction*
>
> *(round 6 continues)*
> 56A * 2
>
> 2 washers
> 1 dryer
> 3 fridges (2/wfreon, 2/freon staged on-site) this tell the system 1 fridge is payable and 2 are staged for more work later
>
> **User, 2026-09-25 (round 7, correction inline):** litereally means there were 3 friges
> 1 fridge was removed
> 2 fridges are staged on site
> which literally means...
> 2 of them had freon
> 2 of them are left as freon staged on site
>
> *(round 6 continues)*
> 54A * 4
> 56A * 0
> 56B * 2
>
> **User, 2026-09-25 (round 6, inline), mixing:** Good catch. I meant to write, **not**.

### ✅ Q-121 — How does a service code know which screen to show, and which codes does a phone get?
**Approved as proposed** *(ADR-127)*:
1. **Each unit rate service code names its kind of work**, picked from the firm's list (Hangers,
   Leaners, Stumps, HHW, White Goods, Crew time, and any the firm adds). The kind decides the
   screen and, for itemised kinds, the item names offered. `54A` set up as "White Goods" opens the
   white goods item list.
2. **At setup, the phone gets the unit rate codes chosen for it** from the project's codes;
   "Start new ticket" lists exactly those, as code and name.

**And it's how everything on the phone starts, not only unit rate:** the monitor presses the
button to start something (a ticket, an incident…), **picks from a list** to say what kind it is,
maybe **a sub-list**, and then fills in the details. An incident: start one → pick its type → maybe
a sub-type → the details. What the lists hold for each kind of ticket and form is **Q-123**.

> **User, 2026-09-25 (round 6, inline):** YES. Approved. Also consider how this same thinking maps to all ticket types that a phone might be setup
> to create. Think about collection. I made the mistake of saying only unit rate tickets select from a list
> after clicking "start new ticket". In fact that is how it all works. Even when you want to create an incident
> you click the button in the app to start one and then select from a list to note the type, then maybe another
> sublist and then finally the incident details.

---

## T. Raised 2026-09-25 (round 6) — freon arithmetic, and the start lists

### ✅ Q-122 — White goods: a code with no rate, and where the item-to-code link lives
*(ADR-128)*
1. **The `54A` count in ticket A:** your correction is recorded under Q-120; the washers and dryer
   question that's left is **Q-124**.
2. **A code with no rate is an ordinary service code at $0.** Ticket B writes "56B × 2 = $0.00", so
   the ledger shows the 2 staged fridges and what happens to them later can be traced. This is not
   TBN ("a price is coming").
3. **The rules say which items count toward which code**, never a setting on the item. The white
   goods list is flat (*Washer 2 · Dryer 1 · Fridge, no freon 1 · Fridge, freon extracted on site 2 ·
   Fridge, freon staged 0*), and the rule builder gains:
   - a criterion, **Item**, e.g. *Item "Fridge, freon extracted on site" AT LEAST 1*;
   - a field on *Create Transaction*, **Quantity from**: **all items** (the default) or **chosen
     items**.

   Ticket A: *Create Transaction 1, 54A*, from the chosen items; *Item "Fridge, freon extracted"
   AT LEAST 1* → *Create Transaction 2, 56A*, from that item; *Item "Fridge, freon staged" AT LEAST
   1* → *Create Transaction 3, 56B*, from that item.

> **User, 2026-09-25 (round 7, inline), the count:** NOPE..see corrections above.. lmk if that helps explain things please.
>
> **User, 2026-09-25 (round 7, inline), $0 code:** Correct. APPROVED.
>
> **User, 2026-09-25 (round 7, inline), item link:** 3. correct. APPROVED. … PROPOSAL ABOVE, not this other way here.

### ✅ Q-123 — What does each "start" list hold, for every kind of ticket and form?
*(ADR-129)* Every list after "start" is **built from what was selected when the project was set up,
or added as custom values** to the firm's lists, trimmed to what the phone is set up for. Adding a
value never needs new code.

| Starting | The list(s) | Then |
|---|---|---|
| **Unit rate ticket** | The unit rate service codes the phone is set up for (`6A Hanger`, `54A White Goods`…); for itemised kinds, the item list | Scan the crew badge (once per crew), phases, details |
| **Collection** | The **debris types set up on the project**. On a project that allows split loads: first **normal load or split load**, then the debris type | Number (scan control ticket, or generated), scan the driver's badge, details |
| **Disposal** | The **debris types set up on the project**, so the monitor picks what they see | Number, badge, load call, details |
| **Haul-out collection / disposal** | The **debris types set up on the project** | Number, badge, details (load call on the collection side) |
| **Surveys and ROE** | The **work type** the phone is set up for: **Pre-work survey · Post-work survey · ROE**. Example: a monitor on PPDR survey work records property details while gathering ROEs from homeowners, so they see all three | Details |
| **Incident** | The incident type; then, if the firm has added any, its **sub-types** | Details |

*Agent's reading, flagged:* you didn't fill in incident sub-types, and "or by what is added custom"
suggests the firm adds its own. So incident sub-types are a firm-extendable list, empty at install.
"Split load" is offered only where the project's program type requires ROEs (the setting that
turns split tickets on, `spec/LISTS.md`).

> **User, 2026-09-25 (round 7, inline), in the table:** [Collection] (c) a only or b before a, based on project
> [Disposal] the debris type setup on the project, so as the monitor sees it they can easily select it..
> [Haul-out, sub-list column] the debris type setup on the project, so as the monitor sees it they can easily select it..
> [Surveys, ROE] Work type [pre work / post work] add ROE … suppose they are setup on PPDR survey work and are capturing propeorty details while also gathering ROE's from homeowners. The'd have a few options.
>
> **User, 2026-09-25 (round 7, inline), how it's built:** Exactly and built out the options selected setting up the project or by what is added custom to various fields.

---

> 2 washers
> 1 dryer
> 3 fridges (2/wfreon, 2/freon extracted on-site) this tells the system 3 fridges are payable and 2 freon extractions are payable.
>
> 3 friges were removed
> 2 of them had freon & both of them had freon extracted
> 54A * 3+3=6 (wow how did I not notice this before)
> 56A * 2
>
> 2 washers
> 1 dryer
> 3 fridges (2/wfreon, 2/freon staged on-site) this tell the system 1 fridge is payable and 2 are staged for more work later
>
> 1 fridge was removed + 2 washers + 1 dryer = (4)
> 2 fridges are staged on site because they have freon in them
> which literally means...if we break that down
> 2 of them had freon and so....
> BOTH of them are left as freon staged on site
>
> 54A * 4
> 56A * 0
> 56B * 2


## U. Raised 2026-09-25 (round 7)

### ✅ Q-124 — Do the washers and dryer count toward `54A`?
*(ADR-130)*
- ⚠️ *Withdrawn by ADR-132: ticket A is `54A × 6`.* **Ticket A is `54A × 3`**: the fridges removed. So in the worked example, `54A`'s rule takes its
  quantity from the **fridges removed** (*Quantity from*, ADR-128). Under that same rule ticket B
  (1 fridge removed, 2 staged) is **`54A × 1`**, `56B × 2`. *(Agent's reading, ⚠️ **withdrawn by
  ADR-131**: the hauler is paid per white good removed, so B is `54A × 4`; ticket A is `54A × 6`, ADR-132.)* A firm that also bills washers and
  dryers would choose them in *Quantity from* or give them their own rule.
- **The # on a transaction is its slot, and the order it's made in.** When a ticket is reconciled,
  it's checked against the rules; every rule that matches creates its transaction in its slot,
  **#1 first, then #2, and so on**. In tickets A and B the `54A` transaction (#1) comes first, then
  `56A` or `56B`. The engine must be smart about the order so results **never flip-flop**: the
  same ticket and the same rules always give the same transactions, however many times it runs.
  Tickets that match and pass their checks go on to QC review; anything else is flagged.

> **User, 2026-09-25 (round 8, inline), in the table:** [Ticket A] (3) is correct
>
> **User, 2026-09-25 (round 8, inline):** It's possible there was confusion around when a transaction order is processes attached to a rule and its causing confusion here... And even how
> im writing it sounds werid... when we put a # on transcation in the rule as we are creating it.. we are telling the system.. when this rule runs
> and it passes, this is the order it should be for the transaction... We can think if it like a slot. When we are reconcilling a ticket we are checking
> a bunch of values to see which rule applies to the ticket right? So we literally have this big list of tickets running in batches being checked against
> a bunch of things all the time during ops. And when matches are found and other checks pass those tickets are cleared for QC review or else flaggged. The
> key here though is that when a rule match is found we first need to check which order # it was given. We should be being smart about it so we check order
> so we aren't flip flopping but anyway when we get order #1 rule match for ticket XYZ, that creates transaction #1.. Then when another rule is found to match we
> get another transaction. So in our ticket A & B case we get 54A tarnsactions first.. Then on another pass we get 56A.
>
> Does that answer things or create more questions? Think broadly across the system and follow up as needed please.

---

## V. Raised 2026-09-25 (round 8) — rule order, across the system

### ✅ Q-125 — Rule order: can a rule see another rule's transaction, and when do deletes and voids happen?
*(ADR-131)*
1. **Yes: a rule's checks read only the ticket**, never another rule's transaction. The slot order
   decides which transaction is processed first: when ticket 01234 is reconciled, the engine finds
   **all** the rules that pass on it (e.g. disposal, TDSR maintenance, tipping) and creates their
   transactions **in # order**. This is how you've used the order before for invoicing.
2. **Yes: deletes and voids come after every create.** They extend what can be done with the
   results of the rules.
3. **White goods: the hauler is paid per item removed, not by type.** `54A` counts **every white
   good removed**. Freon is a separate billing item altogether:
   - an item **removed** → `54A`; if its freon was extracted, also `56A` per extraction;
   - a fridge with freon that is **not removed** (staged) gets **no** `54A`; it gets `56B`, a $0
     non-payer line noting the items were staged (when, where, with freon);
   - when the staged fridges are **removed later**, the freon extraction and removal are confirmed
     and they get `54A` and `56A`: the hauler is paid for removing 2 more fridges and for extracting
     freon from both. **That is not double billing**; they are two separate pieces of work, and the
     setup allows several ways to configure it.

   So ticket B (2 washers, 1 dryer, 1 fridge removed; 2 fridges staged) is **`54A × 4`, `56B × 2`**.
   Ticket A under the same rule: **`54A × 6`, `56A × 2`** (Q-126, ADR-132).

> **User, 2026-09-25 (round 9, inline), 1:** Yes? I think so, "yes"?
>
> Slot order decides which transaction is able to be processed first. So if #1 dosn't exist, we should
> be looking for that first. So when we have 3 codes on a ticket: disposal, tdrs maintenance, tipping for ticket 01234
> when the ticket is in reconcile we should be able to find all 3 rules that would pass on this ticket,
> and through that create the transactions we need in the right order.
>
> im pretty sure i have my thinking around what we are using this order for here. This maps to how I have used
> it before for invoicing. And i doubt you're going to know about it from anywhere else even if you search the web
> feel free to give it a try though.
>
> Does this help answer things?
>
> **User, 2026-09-25 (round 9, inline), 2:** You have the basic shape of these, they extend what we can do with he results of rules. This
> also suggests you understtood things in #1 well and what I replied with shouldnt confuse
>
> **User, 2026-09-25 (round 9, inline), 3:** Ticket B would include all of the white goods that were removed that did not have freon.
> Hence why I included the washer and dryer in the count. The hauler is paid per item removed, not by type. For freon that is a separate billing item all together. So if the fridge has freon and it is
> not removed we do NOT give them a removal ticket (54A) instead we give the 56B tickets noting the items
> were stages (when and where and with freon), non payer item. When they are removed later, we confirm
> the freon extraction and fridges are removed and issue tickets for 54A and 56A noting the hauler should
> be paid for removing 2 more fridges and for removing freon from both frides. That is not double billing
> it is 2 separate work items, but with our setup we have several ways we're able to configure things to
> allow for this.
>
> Does this help?

---

## W. Raised 2026-09-25 (round 9) — for the next session

### ✅ Q-126 — Ticket A: is it `54A × 6`?
*(ADR-132)*
**Yes. Ticket A is `54A × 6`, `56A × 2`**: 2 washers + 1 dryer + 3 fridges, all removed, and 2 of
the fridges had their freon extracted on site. The per-item rule (ADR-131) gives the example's
numbers with no exceptions. The earlier "× 3" was a slip, now withdrawn.

| Ticket | Items | `54A` $40 per white good removed | `56A` $30 per freon extraction | `56B` $0 freon staged |
|---|---|---|---|---|
| A | 2 washers, 1 dryer, 3 fridges, all removed; 2 fridges' freon extracted on site | **× 6** = $240 | **× 2** = $60 | — |
| B | 2 washers, 1 dryer, 1 fridge removed; 2 fridges with freon left staged | **× 4** = $160 | × 0 | **× 2** = $0 |

Your question, as asked: ticket A has 2 washers, 1 dryer and **3 fridges, all removed** (2 had
their freon extracted on site). Under the per-item rule that is **2 + 1 + 3 = `54A × 6`**, plus
`56A × 2`. Earlier you wrote `54A × 3` for ticket A. Was that the fridges only, and is ticket A
really **`54A × 6`, `56A × 2`**?

> **User, 2026-09-25 (round 10, inline):** Yes and Idk what has gotten into me.. Ticket A had 2 washer, 1 dryer & 3 fridge - all removed... idk why I put 3-6 is 100% correct..
>
> I can see how that forced your hand thinking about things wrong. Im sorry about that. Please lock this in now.

*Blocks:* only the worked example in `spec/RULES.md` and the golden mission; the rule itself is
settled (ADR-131). *Refs:* ADR-126, ADR-128, ADR-130, ADR-131, Q-124, Q-125.

---

## X. Raised 2026-09-25 (round 10) — housekeeping pass over the agent docs

The biggest problem, not fixed because it's your call (KD-58): most skills still describe the old database/ code in their main text, with today's rule only in a ⚠️ note on top. For example, adms-validation's tables still say FAILED. A new agent reading quickly could build the old system. For now CLAUDE.md tells agents that the ⚠️ note wins.

What does the agent recommend to clean this up so we are following the AGENTS.md/CLAUDE.md and SKILL.md documentation and best practices today in 2026?

 Also logged:
  - KD-59: the root docker-compose.yml is the old, unhardened one (password in the file, open port, no TLS).
  - KD-60: agents are blocked from loading adms-field-app, but its phone setup and sign-in notes are Phase 0 work now.


Found while checking every skill, spec page and hook against each other. Q-127…Q-130 are about
how the system behaves; Q-131…Q-133 are about the agent docs themselves. Answer inline, as usual.

### ✅ Q-127 — A phone taken out of service: is its later work refused, or received and flagged?
*(ADR-134)*
**Received and flagged, never refused.** The phone still proves who it is and uploads; what it made
before its removal time comes in normally, what it made after comes in flagged; then it's wiped.

When a phone goes missing, the back office takes it **out of service**. Two places in the plan
disagreed about what happens if that phone syncs later:
- the architecture page said the server **refuses** the phone at its next sync;
- the same page also said everything it made after that time **arrives flagged for review**.

Say a phone goes missing Monday at 3 pm, is taken out of service at 5 pm, and turns up Wednesday
with 12 tickets from Monday 3–5 pm and 4 tickets made Tuesday.

1. **Receive everything, flag what came after** (agent's recommendation): the phone still proves who
   it is and uploads. The 12 Monday tickets come in normally; the 4 Tuesday tickets come in flagged:
   "Ticket 104499: made on a phone taken out of service. Flagged for review." Then the phone is
   wiped. Nothing is lost, which matches "flag, never block" and "nothing is lost".
2. **Refuse the phone**: nothing on it reaches the server. The 12 real Monday tickets would be lost
   unless someone pulls them off the phone by hand.

Which one?

> **User, 2026-09-26 (round 11, inline):** (1) APPROVED.

*Blocks:* the sync design (ARCHITECTURE §7.2 point 4, §7.4, §9). *Refs:* ADR-052, ADR-095,
ADR-096, ADR-105, ARCHITECTURE §7.2, §7.4.

### ✅ Q-128 — What is a zone, and who records it on each half of a load?
*(ADR-135; the design is the agent's proposal, Q-134)*
**Every ticket can carry a zone, and no monitor records it.** Each project has a **boundary** (an
Esri-style shape); reconciliation tests each ticket's end GPS (or a unit rate ticket's GPS) against
it and **attaches** the zone to the ticket. A rule criterion's value is either **picked** from a list
or **typed** (e.g. a distance), and `spec/RULES.md` §4 lists which, for every criterion. The user
asked the agent to propose the map design: ARCHITECTURE §3 "Project boundary and zones", Q-134.

"Zone" appears all over the plan: every ticket carries one, reconciliation flags a load whose
collection and disposal zones differ, and rules can test it (*Zone EQUALS North*). But nobody had
said what a zone is or how it gets onto a ticket. For example, on a county ROW project split
into zones North, South and Beach:
1. **What is a zone?** A name on a list the project sets up (North · South · Beach), a shape drawn
   on a map, or something else?
2. **On the collection:** does the monitor pick the zone from the list, or does the phone work it
   out from the GPS?
3. **On the disposal:** the disposal monitor at the TDSR never saw where the load came from. Do they
   pick a zone too (so a mismatch is a real second opinion), or does the zone come across from the
   collection ticket's barcode or printout, or does the disposal half not carry a zone at all?
4. If a disposal has no zone of its own, should the "zones differ" check be dropped?

> **User, 2026-09-26 (round 11, inline):** Correction* every ticket can potentially have a zone. But where does it come from.. That is a good
> question. And this is a good time to point at something. We can attach details inside of reconcillation
> to the ticket. And this is one of those times. At least that makes sense to me.
> A zone does not just magically appear. Zones are used for a lot of different things, but as you have
> seen they show up as criteron creating rules right? Okay so when you go in and selext ZONE, EQUALS,
> that options field doesn't just have to be a selection from inside the system already. Think about it
> How else would we set the distance BETWEEN or EQUALS or whatever we want if we can't manual enter a value
> as the option. Sometimes we want to the options to be a selection, other times we want them to be manually
> entered. We should have a place somewhere that lists all of these out so no agent is ever confused.
>
> But where does the zone come from, and in reconcilliation? Okay how?
>
> Each project has a boundary. So here is how I wanna describe the shape of it. Imagine an Esri based map hosted
> on a private server where ARCGIS pro had been used to build out a shapefile or whatever is needed that can then
> be used by a service sorta like what we need to make for addresses and distance work, but in the boundary case we
> test each end gps or unit gps against that to make sure it is inside the sharefile or whatever that data needs to
> be that we setup for each project. ideally we keep our version simple while still be able to plug into an Esri setup
> like what I just described. Propose something for this based on our system.

*Blocks:* the ticket fields, the pair checks and the *Zone* rule criterion. *Refs:* `adms-domain`
glossary "Zone"; `adms-validation` §5.1 check 1; `spec/RULES.md` §4; ADR-129 (the disposal start
list is debris type only).

### ✅ Q-129 — The disposal-site distance check, and the collection route check
*(ADR-136; the window's size is Q-135)*
**Keep the disposal-site check** (the site's GPS is entered when it's added; a disposal's end GPS
outside a small window around it is flagged). **Drop the 5 km collection route check**: collections
often cover long distances; a collection **outside the project boundary** is flagged instead
(ADR-135).

Two GPS checks carried over from the earliest design had defaults nobody had confirmed:
- **Disposal site distance:** a disposal is flagged when its GPS is more than **200 m** from the
  site's registered point.
- **Collection route:** a collection is flagged when its start and end GPS are more than **5 km**
  apart.

Example: a county landfill is 800 m across and its registered point is the scale house. A truck
dumping at the far cell, 600 m away, would be flagged every time.
1. Keep the disposal-site check? If yes, should **each site have its own distance** (set when the
   site is added, e.g. 200 m for a TDSR, 1,000 m for a big landfill), with a firm-wide default?
2. Keep the 5 km collection check? Or drop it, since the back office already reviews and adjusts
   GPS (ADR-083)?
3. If kept, are 200 m and 5 km the right defaults?

> **User, 2026-09-26 (round 11, inline):**
> 1. With what we have proposed to build for addresses and distance calculations,
> it seems logical that we'd know the gps for the disposal sites actual location right. Like when we add it to
> the system we input that sites gps right. And then when we get the disposal tickets end gps we make sure that is
> close to what we said it should be. So having a small window around that site to flag tickets outside it makes sense
> 2. This actually doesnt make any sense because often times collcetion occurs over long distances. if colletion was outside
> the boundary though, that would flag it for sure.
> 3. n/a

*Blocks:* the disposal site's fields and two reconciliation flags. *Refs:* ADR-083, ADR-005;
`adms-exceptions` §4.3 (the two rows); `spec/parts/06-reconciliation.md` step 4.

### ✅ Q-130 — Two readings from the start lists (Q-123) to confirm
*(ADR-137)*
**Both right, with one addition:** incident sub-types start empty; and **"Allow split loads" is a
setting on every project**, chosen when it's created. *Agent reading, flagged:* it starts ticked
where the program type requires ROEs (PPDR by default), and an admin can change it either way.

When you answered Q-123 the agent made two readings and flagged them:
1. **Incident sub-types start empty.** A fresh install has incident types but no sub-types; the
   firm adds sub-types under a type if it wants them. Example: under *Equipment failure* a firm
   might add *Flat tyre* and *Hydraulic leak*; until it does, picking *Equipment failure* goes
   straight to the details.
2. **"Split load" appears only where ROEs are required.** The collection start asks "normal or
   split?" only on projects whose program type requires ROEs (PPDR by default). A ROW project
   never shows it.

Both right?

> **User, 2026-09-26 (round 11, inline):** 1. exactly.. this allow the firm to "make Open ADMS their own"
>
> 2. Correct, but we should allow there to be a flag creating any project to allow for this or not. That way the system is flexible. Lock this in.

*Refs:* ADR-129, `spec/LISTS.md`, `adms-field-app` §4A.3.

### ✅ Q-131 — (agent docs) May the agent rewrite the skills so each one states today's rules plainly?
*(ADR-138)*
**Yes, all three.** One skill per response, starting with `adms-validation`; KD-33 fixed along the
way; `adms-field-app` is loadable now.

Most skills were written against the old code in `database/`. As decisions came in, the agent added
⚠️ notes on top rather than changing your text. So a skill often **teaches the old behaviour in its
body** and gives the current rule only in a note. Examples:
- `adms-validation` lists the checks with the outcome `FAILED`, then a note says `FAILED` is gone;
- `adms-ticket-workflows` draws the lifecycle with `MATCHED` and `FAILED`, then a note corrects it;
- `adms-data-model` names the eight files in `database/src/services/` as where every change goes.

A new agent reading quickly can build the old thing. The proposal:
1. **Rewrite each skill in the present tense**: today's rule, its reason and the ADR, in one place.
   Your own words (the split-load description, the capacity quote, the scale receipt story) stay
   verbatim and marked as yours. What changed and when moves to a short "History" list at the end
   of each skill, pointing to the ADRs. No rule changes: anything unclear becomes a question.
2. **Fix KD-33**, the old section-number cross-references, at the same time.
3. **Let agents load `adms-field-app`.** It is switched off for agents "until Phase 3", but its
   phone setup, sign-in and offline notes are Phase 0 work now (ARCHITECTURE §7–§8 are approved).
   Its later-phase screen notes would stay marked as later.

One skill per response, each for you to read before the next. Go ahead?

> **User, 2026-09-26 (round 11, inline):** ✅ **Approved** 1-3.

*Refs:* KD-33, KD-57, KD-58, KD-60; CLAUDE.md "`.claude/skills/` — record decisions, never
correct"; ADR-042, ADR-043.

### ✅ Q-132 — (agent docs) Do the "⚠️ PROPOSED" blocks inside approved architecture sections count as approved?
*(ADR-139)*
**The user relabelled them in the page.** Every inner block in §7–§16 and §18 is now ✅ Approved,
and so are §4, §6 and §7.2's five safeguards. Still unmarked: §1, §2, §3's stack table, §17.

You marked ARCHITECTURE §8–§16 and §18 APPROVED (ADR-104). Inside several of them, the agent's
detailed proposals were still labelled "⚠️ PROPOSED", for example §9 (the sync protocol), §10
(UTC plus the device's offset; the clock-drift flag), §13 (one group, one transaction) and §18 (the
tree). The page's own key says ⚠️ means "needs a yes/no".
1. **Yes, approved with their sections**: the agent changes those labels to ✅ (ADR-104).
2. **No**: say which ones still need a look, and the rest become ✅.

> **User, 2026-09-26 (round 11, inline):** I updated the page there with ✅ **Approved** as needed. Please review.

(§7.2's five safeguards for phone-number passwords were added **after** ADR-104; the user marked
them ✅ Approved too.)

*Refs:* ADR-104, `spec/ARCHITECTURE.md` status key.

### ✅ Q-133 — (agent docs) Write the rebuild's data model and flag list as spec pages before the scaffold?
*(ADR-140)*
**Yes, both**, after the approvals already waiting.

Two things an agent needs to build Phase 1 exist only in pieces today:
1. **The data model.** `adms-data-model` describes the **old** schema in `database/`; the decisions
   since are spread across dozens of ADRs. Proposal: `spec/DATA-MODEL.md`, every record and field
   the rebuild needs, who writes it, and the ADR behind it, for you to approve section by section
   before the Prisma schema is written.
2. **Every flag the system raises**, in one table: its code, when it fires, the exact message
   ("Ticket 104499: load call 0%. Flagged for review."), whether it still bills, and its ADR.
   Proposal: `spec/FLAGS.md`, which also becomes the scenario harness's checklist.

Write both drafts next (after the approvals already waiting)?

> **User, 2026-09-26 (round 11, inline):** 1. ✅ **Approved** 2. ✅ **Approved** — Write both drafts next? yes

*Refs:* ADR-043, ADR-052, ADR-093, ADR-103; KD-57, KD-58; `spec/INDEX.md`; ARCHITECTURE §15, §18.

---

## Y. Raised 2026-09-26 (round 11) — the project map, and the disposal-site window

### ✅ Q-134 — Project maps: the boundary and zones (the agent's proposal, as you asked)
*(ADR-141)*
**Approved as proposed, 1–6.** The design is ARCHITECTURE §3 "Project boundary and zones".

You said each project has a **boundary**, built in ArcGIS Pro and hosted on an Esri server, that
every ticket's GPS is tested against it, and that reconciliation attaches the zone to the ticket.
Here is the proposal: simple on our side, able to plug into an Esri setup. Example: a Bay County
ROW project whose map has the county line as its boundary and three zones, North, South and Beach.

1. **Getting the shapes in** (back office, project setup), either way:
   - **upload a file**: a zipped shapefile, GeoJSON or KML (what ArcGIS Pro exports); or
   - **link an Esri layer**: paste the feature layer's address on your ArcGIS server; Open ADMS
     reads it and keeps its own copy. A **"Refresh from Esri"** button takes a new copy.

   You pick which field holds the zone name (e.g. `ZONE_NAME`), and the screen shows what it found
   ("1 boundary, 3 zones: North, South, Beach") on a map before you save. Each upload or refresh is
   a new, dated **map version**; nothing is overwritten.
2. **Checking**, by the worker at reconciliation, never the phone. Collection 104499's end GPS is
   inside the county line, and inside the Beach shape, so the ticket gets **zone Beach**. A unit
   rate ticket's GPS is checked the same way. GPS outside the boundary → "Ticket 104499: collected
   outside the project boundary. Flagged for review." It still bills (flag, never block). Monitors
   never pick a zone, and the phone never carries the map.
3. **Disposals are checked against their site, not the boundary**, because the landfill is often in
   the next county (Q-135). Haul-outs run TDSR → FDS, so both ends are checked against their sites.
   So **a load's zone is its collection's zone**, and two old checks are **dropped**: "collection
   and disposal zones must match", and "every part of a split must share a zone" (a split's
   properties can sit either side of a zone line; each part is already priced on its own).
4. **Inside the boundary but in no zone** (a gap between the zone shapes): the zone stays empty and
   the ticket is flagged "Ticket 104499: not inside any zone. Flagged for review."
5. **A new map version is treated like a rule change** (ADR-090): every ticket not yet locked as
   invoiced is reprocessed with it; locked tickets keep the zone they had. Each ticket records the
   map version it was checked against, the way mileage records its map date.
6. **Rules** offer the zone names from the project's current map (*Zone EQUALS Beach*, *Zone IS
   EMPTY*).

> **User, 2026-09-26 (round 12, inline):** ✅ **Approved** 1–6.

*Blocks:* the project map records, the zone on every ticket, the boundary and no-zone flags, the
*Zone* rule criterion, REQ-120d. *Refs:* ADR-135, ADR-136; ARCHITECTURE §3 "Project boundary and
zones"; `spec/RULES.md` §4; ADR-090, ADR-110.

### ✅ Q-135 — How close to its site must a disposal be?
*(ADR-142; the details are Q-136)*
**Two options per site: standard and advanced.** *Standard:* a circle round the site's GPS, built-in
default 200 m, changeable in the project's GIS settings. *Advanced:* the site's own shape, drawn on
the map in Open ADMS or loaded from a shapefile, as with the boundary.

You decided to keep the check: a site's GPS is entered when it's added, and a disposal whose end
GPS is outside "a small window around that site" is flagged (ADR-136). How big a window?

Example: Bay County Landfill's registered point is its scale house. The far cell is 600 m away. A
truck dumps there, and its disposal GPS reads 640 m from the point.
- With one firm-wide window of 200 m, **every** load at the far cell is flagged: "Ticket 104500:
  disposal GPS 640 m from Bay County Landfill. Flagged for review."
- With the landfill set to 1,000 m, it isn't; a TDSR on a small lot keeps 200 m.

Proposal:
1. **A firm-wide default of 200 m**, kept in the settings file like every threshold.
2. **Each site may set its own window** when it's added or edited (audited), e.g. 1,000 m for a big
   landfill. Blank means the default.
3. The same check for **haul-outs**: each end (the TDSR it left, the FDS it reached) against its own
   site.

Yes, or change?

> **User, 2026-09-26 (round 12, inline, under point 3):** Could we use a shapefile for the sites too? Like draw it on the map ourselves and get the shapefile?
> We are already doing it with the boundary..
> and we could make that an option
> and also just have a standard option
> say there is a default setting built in like 200m as the size
> but in the project settings for gis you can easily update that
> which just drawys a circle around the center point of the given gps?
> or do "advanced" and use my earlier idea?
>
> Yes, or change? See my thoughts above...

*Blocks:* the disposal site's fields, the site-distance flag. *Refs:* ADR-136, ADR-005, ADR-083;
`adms-exceptions` §4.3.

---

## Z. Raised 2026-09-26 (round 12) — site areas and drawing on the map

### ✅ Q-136 — Site areas and drawing on the map: the details of your two options
*(ADR-144)*
**Approved as proposed, 1–6.** The design is ARCHITECTURE §3 "Disposal site areas".

You chose two options for how close a disposal must be to its site (ADR-142): **standard**, a
circle round the site's GPS (built-in 200 m, changed in the project's GIS settings), and
**advanced**, the site's own shape, drawn in Open ADMS or loaded from a shapefile. Here's how the
agent would build it. Example: Bay County project, two sites: *Hwy 20 TDSR* (a small lot) and *Bay
County Landfill* (800 m across, GPS at the scale house).

1. **Standard: one circle size per project.** The built-in 200 m is the starting size. In the
   project's **GIS settings** an admin changes it for that project, e.g. to 300 m, and every
   standard site on the project gets that circle. Hwy 20 TDSR uses it: a disposal 250 m from its
   GPS is fine at 300 m. A site that needs something different (the landfill) uses advanced.
2. **Advanced: the site's own shape.** An admin draws the landfill's outline on the map (click
   round its edge), or uploads or links a shape, the same ways as the project map. A disposal's end
   GPS must be **inside** the shape: "Ticket 104500: disposal GPS outside Bay County Landfill's
   area. Flagged for review." A site with a shape ignores the circle.
3. **Drawing works for the project map too.** A firm without ArcGIS can draw its boundary and zones
   in Open ADMS. Anything drawn can be **downloaded** as a zipped shapefile or GeoJSON, to open in
   ArcGIS Pro.
4. **The map you draw on is our own**: a map file of the project's region kept in our own storage,
   the way we run our own routing and address servers. No outside map company, no account key.
5. **Haul-outs:** both ends checked against their own sites (the TDSR it left, the FDS it reached),
   circle or shape. You didn't say on Q-135 point 3; this is the agent's reading.
6. **Changes are kept and reprocess:** a new circle size or a new site shape is dated and kept; every
   ticket at that site not yet locked as invoiced is reprocessed, as with a new map version
   (ADR-141).

> **User, 2026-09-26 (round 12, inline):** ✅ **Approved** 1–6

*Blocks:* the disposal site's fields, the project's GIS settings, the drawing screen, the
site-area flag. *Refs:* ADR-136, ADR-141, ADR-142; ARCHITECTURE §3 "Project boundary and zones".

---

## AA. Raised 2026-09-26 (round 13) — the full sweep before the scaffold

You asked for a full check, before the scaffold, of how an ADMS works: each part, inside and out.
The agent re-read every skill, every spec page, the architecture, this whole register, the decision
log and the requirements, walking a mission from setup to closeout. These are the questions nothing
answers yet. Each one has an example and, where the agent has one, a **proposal** you can simply
approve or change. Answer inline, as usual.

> **Answered 2026-09-27** (ADR-145…173). Your answers are kept verbatim below as `User` quotes, each
> with a **Decided** line on top. What they opened is in §AB (Q-168…Q-175).

### ✅ Q-137 — One disposal site, trucks from several projects
*(ADR-145)* **Decided:** one phone, one project, disposal phones included; a tower monitor working
two projects carries two phones. A disposal site is entered on each project separately. The
agent's proposal is not taken.

A phone is set up for **one** project, and ticket numbers and cert numbers are only unique
**within** a project (every project's generated numbers start at 100,001). But one TDSR or landfill
often takes trucks from several projects at once.

Example: Bay County has a ROW project and a PPDR project under the same hurricane, and both haul to
Hwy 20 TDSR. The tower monitor's phone is set up for the ROW project. A PPDR truck pulls in with
ticket 100245 and cert 610812. Both numbers may also exist on the ROW project. Recorded on the ROW
phone, the disposal lands in the wrong project and never pairs with its collection.
1. What does the tower monitor do today with a truck from another project: carry a second phone,
   or something else?

   > **User, 2026-09-27 (round 13, inline):** The tower monitor is working one single project at a
   > time. If for some reason they are working on more than one project it would be because the firm
   > has multiple projects, and thus the monitor will have to have multiple phones setup for each
   > project.

2. Is a disposal site **one record shared** by every project that uses it (one GPS, one permit), or
   entered separately on each project?

   > **User:** Separately per project.

**Agent proposal:** a disposal site is one shared record, like a client, which each project
attaches. A **disposal phone** may be set up for **every project that uses its site** (this relaxes
"one project per phone" for disposal phones only). The monitor picks the project first on the start
list, then works as today, so each disposal is stored under the right project and pairs normally.

> **User:** A disposal phone must be setup for one project and one project only.

*Refs:* ADR-045, ADR-062, ADR-088, ADR-095, ADR-142.

### ✅ Q-138 — Contracts: what one holds, and "the ticket's own contract"
*(ADR-146)* **Decided:** a contract is a name, its prime contractor and an optional link to the
signed copy, created in the project after the contractor is added. The service code's rate is
entered with a contractor; the rule links the contract to the transaction. Follow-up on "Ticket
Contract": **Q-168**.

A rule's *Create Transaction* names a contract, or **"Ticket Contract"** (the ticket's own). Nothing
yet says what a contract record holds, or how a ticket finds its own.

> **User:** A contract is simple object really. It doesn't do anything more than hold a little data.
> A name who the contractor prime for it is, and a link pointing to whereever the signed contract is
> located typically stored online somewhere as a PDF.

Example: Bay County ROW has two primes, TFR and Ceres. TFR has **two** contracts on the project:
the original ROW contract and a later haul-out contract.
1. What does a contract hold? Agent's guess, to confirm or correct: number, name (e.g. "FDEP - TFR -
   Hurricane"), client, prime, start and end dates, a copy of the signed paper. Anything else, such
   as a not-to-exceed amount?
2. A ticket's own contract is its prime's contract (the prime comes from the certification). When
   that prime has two contracts on the project, which one is it?

**Agent proposal:** each prime has one contract per project marked as its **default**; "Ticket
Contract" means that one; a rule that bills to the other contract names it.

> **User:** We need to keep this really simple. A contract is needed when we create a rule right.
> That contract needs to be created in the project, and a contractor needs to be selected for it.
> That means we need to add at least that contractor to the project first. Then once we give it a
> name and maybe a link we are able to select the contractor as an option when we create a service
> code and add a rate-which is where we link the contractor to the rate, then in a rule we link
> the contract to the transaction that results when rules pass right? So we aren't worried about
> the Prime having one or many contractors or whether there are 2,3 or 20 primes with subs under
> them. We add what we need and use the service codes and rules to ensure transactions are only
> processed on the tickets expected for the Prime(s).

*Refs:* ADR-081, ADR-108, ADR-109, ADR-118; `spec/RULES.md` §5.

### ✅ Q-139 — A rate that changes from a date
*(ADR-147, corrected by ADR-301)* **Decided:** the firm sets this up however it needs (e.g. a
second pay item, with a code of its own that the firm chooses, plus *Ticket date* criteria); nothing
forces a pattern or a name; **a code is unique on its project** (ADR-147 had read the "Yes" below
the wrong way round, as "two codes may share a name"). An exact duplicate of a rule is refused
before it's saved, and two rules writing the same slot on a ticket stays flagged (ADR-118, 301).

Changing a service code's rate reprices every ticket not locked as invoiced. That's right for
fixing a wrong rate. It isn't right for a contract change that raises a rate **from a date**.

Example: `3A` is $8.50/CY. A contract change makes it $9.25/CY for work on or after 15 October.
Tickets from 1–14 October aren't invoiced yet. Editing `3A`'s rate would reprice them at $9.25.

**Agent proposal:** for a dated change, the firm adds a second code (`3A`, $9.25) and uses the
*Ticket date* criterion (`ON OR AFTER 15 Oct` on the new rule, `ON OR BEFORE 14 Oct` on the old one).
Editing a rate stays the way to fix a mistake. That needs one answer from you: **may two service
codes on a project share the name `3A`**, or should the second be named e.g. `3A-2`?

> **User, 2026-10-02 (the corrected answer, as they wrote it into this entry; ADR-301):** Yes (the
> second should be named e.g. `3A-2`) but we don't want to make anything that forces this onto the
> firm - we dont want to force this `3A-2` prefix naming - we want to let them decide what to nme it.
> We would however want to flag if there are two rules matching the same thing (same details, same
> name, i.e., a duplicate rule). So if we already have a transaction in slot 1 a ticket and then we
> get another for it in the same slot, we'd know it's likely an issue and flag it. This way allows
> for more flexibility on the firm side to set things up how they need to use it, vs ridgid setup on
> on dev side.

> **User, 2026-09-27 (the first answer, which ADR-147 read as "yes, they may share a name"):** Yes
> but we don't want to make anything that forces this onto the firm. We would however want to flag
> if there are two rules matching the same thing. So if we already have a transaction in slot 1 a
> ticket and then we get another for it in the same slot, we'd know it's likely an issue and flag
> it. This way allows for more flexibility on the firm side to set things up how they need to use
> it, vs ridgid setup on on dev side.

*Refs:* ADR-090, ADR-109, ADR-125, ADR-301; `spec/RULES.md` §4.

### ✅ Q-140 — Work paid by different funders
*(ADR-148)* **Decided:** a separate project per funder or kind of work; no funder field.

The old model had a "funding programme" (FEMA Public Assistance, FEMA HMGP) that no longer has a
home. It matters in the field. On a county ROW mission, debris on **federal-aid highways** is
usually reimbursed by FHWA Emergency Relief, not FEMA, so the county needs those loads kept apart.
Other funders include NRCS for waterways and state-only money.

Example: two loads on the Bay County ROW project, one from US-98 (federal-aid) and one from a
county road.
1. How do you keep them apart today: (a) a **separate project** per funder; (b) a **zone** on the
   project map covering the federal-aid roads, used in reports and rules; or (c) something else?

   > **User:** (a) and that's how we always segregate things like this. Say Bay count has a ROW,
   > PARKS and WATERWAY need. We create separate projects for each of those. If we comingle the data
   > FEMA will regect it.

2. Should a project (or a declaration event) record its funder, e.g. "FEMA PA", for reports?

   > **User:** No.

*Refs:* `adms-data-model` §3.1a ("Where today's Program fits"); ADR-023, ADR-135.

### ✅ Q-141 — ROEs: where they come from, what they hold, and which tickets carry one
*(ADR-149)* **Decided:** an ROE is a record like a ticket, made on a phone (offline) or in the back
office. It holds the listed data; its scope is a simple form (choices, counts, GPS). On a project
that requires ROEs, every collection, unit rate ticket and survey carries one. Follow-up: **Q-175**
(where the scope choices and GPS setting live; where the number comes from).

ROEs show up in three places that don't yet join up: the back office enters them at setup, monitors
can start an "ROE" form on the phone, and split collections pick one.

Example: a PPDR project where the county signs up 400 homeowners over three weeks. ROE 3045 is for
900 Mill St.
1. **Where do ROE records come from?** A list the client sends (imported by the back office), a form
   a monitor fills in with the homeowner, or both? If both, how does a phone-made ROE 3045 become
   the one other phones can pick?

   > **User:** They can be created in the system. They are an object like a ticket right. A monitor
   > can make it offline like anything else they run up against. And just like a ticket, when needed
   > the back-office can manually create it.

2. **What does an ROE hold?** Agent's guess: number, parcel ID, address, owner's name, signed (yes/no
   and date), **scope**, and a photo of the signed form. What does "in scope" mean in practice: the
   kinds of work allowed (debris, hazardous trees, demolition), the debris types, or something else?

   > **User:** All that data, scope simpe form like we use for unit rate tickets (like with white
   > goods how we get the count and the can select options). So we give them choices to select,
   > count and GPS. GPS is option unless denoted as required when the tickets service code is
   > created-smae place any other tickets GPS option is denoted.

3. **Which tickets carry one?** Splits do. On a project that requires ROEs, does an **ordinary**
   collection? A unit rate ticket (a hazardous tree on private land)? The pre- and post-work surveys?

   > **User:** All of them if the project requires an ROE.

**Agent proposal for 3:** on a project that requires ROEs, every collection, unit rate ticket and
survey carries one (picked or typed), and a missing, unsigned or out-of-scope ROE is flagged.

*Refs:* ADR-055, ADR-129, Q-33; `adms-ticket-workflows` §4.6.

### ✅ Q-142 — Certifying a truck on a phone
*(ADR-151)* **Decided:** on a field phone set up for certifying, done where there's signal; the
phone gets a block of cert numbers unless the numbers are pre-printed (typed in); a phone with a
connection can refresh its lists at any time. Block size: **Q-175**.

The certifying monitor selects the prime and types the sub on the phone, and Build 1 listed
"disposal certification" as a monitor role, so certification is field work. Three things follow
that nobody has decided:
1. **Where is it done?** On a phone set up for certifying (like a ticket type), in the back office,
   or both?

   > **User:** On a field phone setup for certs

2. **System-issued numbers offline.** The cert series is per project. Two phones certifying offline
   at two staging areas would both issue 610812. Should certifying phones get a **block of cert
   numbers** the way they get ticket numbers, or are system-issued numbers only given online?

   > **User:** Block of numbers unless using control tickets in which case we can assume the cert
   > will have its own unique number as well and they can manually type it in.

3. **A truck certified this morning** is on nobody else's phone until the phones sync, so its first
   day's tickets are keyed in by hand and flagged "manual". Is that normal, or is certifying usually
   done where there's signal, so other phones can pick up new trucks before work starts?

   > **User:** Certs are done where there is a signal so that the project knows they exist.

**Agent proposal:** a phone can be set up for certifying; it gets a small block of cert numbers
(e.g. 100), topped up at sync; and any phone with a connection can refresh its truck list at any
time, not only at the nightly sync.

> **User:** The parts here about syncing and updating the lists are truthful.

*Refs:* ADR-065, ADR-108, Q-96, Q-98; `spec/FROM-BUILD-1.md` §11.

### ✅ Q-143 — The same truck on two projects
*(ADR-152)* **Decided:** copy the certification to the other project with a **new number** and a
reference to the old one; if a mistake is later found in the copy, the original is flagged for
review. **Superseded by the user, 2026-10-04 (ADR-328, 329): a certification is never copied; a
truck that moves to a second project is certified there from scratch, with that project's own
number.**

A certification belongs to one project, so a truck working two projects needs one on each.

Example: truck 610812 is certified on Bay County ROW. The next week it also works the Bay County
PPDR project. Its placard and badge say 610812.
1. Must it be **measured again** for the PPDR project, or can the back office **copy** the
   certification (same number, measurements and photos) to the other project, audited?

   > **User:** If the truck was certified on the firms project and it hasn't been modifed they could
   > copy it and this circles back to making the platform flexible. In fact we should anticipate the
   > back office needing extensive flexiblilty as it relates to making changes. Pretty sure that is
   > clear with the many changes we have made to the design.

2. If copied, and one copy is later corrected (a measuring mistake), should the fix go to both?

   > **User:** It should, but it also introduces what sometimes happens copying these. But we have
   > to allow mistakes like it because that is in part the job of the back office, to manually catch
   > these types of issues.

**Agent proposal:** copy it, keeping the number (it's on the placard); each copy is its own record;
correcting one asks whether to apply the fix to the other copies.

> **User:** Copy the cert. Give the new cert a number. Created a reference to the old. If a mistake
> is later found in the copied version, the older version is flagged for review.

*Refs:* ADR-045, ADR-079; `adms-certifications` §3A.6.

### ✅ Q-144 — A different driver in a certified truck
*(ADR-153)* **Decided:** the driver is on the certification and carried onto its tickets; no
driver list; a driver's licence flags nothing; an expired truck tag flags the ticket with a
certification message for the back office to resolve.

The certification records the driver's name, phone and licence, and a ticket worked after that
licence expired is flagged. Drivers change often.

Example: truck 610812 is certified with Joe driving on Monday. On Thursday Maria drives it. Joe's
licence expires Friday.
1. Is the driver recorded on each **ticket**, or only on the certification?

   > **User:** On the cert, which transfers to the ticket.

2. When the driver changes, does the back office **replace** the driver on the certification
   (audited, Joe kept in the history) or **add** Maria alongside him?

   > **User:** Neither. The back office just needed to know the original driver. They don't need to
   > compare driver info for matches, dups or anything.

3. Saturday's tickets: flagged for Joe's licence, even though Maria is driving?

   > **User:** Joes license shouldn't flag anything. If the trucks tag is exipred we want to know
   > about that, but its just a flag to review the certification, which means we flag the ticket
   > with a message about the certication issue. A back office worker can then work on resolving the
   > cert issue.

**Agent proposal:** the certification holds a **dated list of drivers**; the back office (or the
certifying monitor) adds a driver with a start date; the licence check uses whoever was the driver
at the ticket's work time. Tickets don't record the driver.

> **User:** NO. See my responses in 1-3.

*Refs:* ADR-079; `adms-certifications` §3A.8.

### ✅ Q-145 — A truck keyed in by hand: which capacity bills?
*(ADR-154)* **Decided (marked "✅ Approved" by the user):** billing uses the certification's
capacity, with a flag when the typed one differs; no certification → unbilled and flagged until one
exists.

When the truck isn't on the phone, the monitor keys it in and the capacity field shows a "check it
against the placard" warning, so the monitor does type a capacity in that case.

Example: the disposal monitor types cert 610812 and 32 CY off the placard. The certification says
30 CY.
1. Does billing always use the **certification's** capacity (30), with a flag when the typed one
   differs ("capacity typed 32, certified 30")?

   > **User:** Yes.

2. If no certification with that number exists, is the load left unbilled and flagged until one
   does?

   > **User:** Yes.

**Agent proposal:** yes to both. The typed capacity is kept as the monitor's claim and is never
billed.

*Refs:* Q-98, ADR-078; ARCHITECTURE §17.

### ✅ Q-146 — A load turned away at the tower
*(ADR-155)* **Decided:** nothing is recorded for a refusal; a load dumps once and gets exactly one
disposal. The "load refused" proposal is not taken.

Sometimes the tower monitor refuses a load: C&D mixed into vegetative debris, hazardous material, or
the wrong site. The truck leaves and dumps somewhere else.

Example: ticket 104499 is refused at Hwy 20 TDSR at 10:05, then dumped at Bay County Landfill at
10:50.
1. What does the TDSR monitor record for the refusal, if anything: a disposal marked "refused", an
   incident, or nothing?

   > **User:** Nothing.. If a truck shows up and isn't going to get a ticket the firm doesnt care.
   > Drivers usually dont drive to the wrong site, but if they do they are turned away and nothing
   > about that is tracked the tracking for the load is still from the end collection to the correct
   > disposal site as well. It is the haulers fault the driver went to the wrong place and they'll
   > get it right next time.

2. If both sites record a **disposal** on 104499, the second one is quarantined as a duplicate
   number. Should a refusal be something **other** than a disposal, so the real one still pairs?

   > **User:** Both wront record a disposal because the load can only dump once and will only ever
   > get one dispoal ticket.

**Agent proposal:** a **"load refused"** record at the tower (number, badge, a reason picked from a
list, photos, GPS, time). It isn't a disposal: it never pairs or bills, but it's attached to the load
and shown in review. The real disposal pairs normally.

> **User:** (NO) read my responses and lock them in.

*Refs:* ADR-022, ADR-052; `adms-exceptions` §4.3a.

### ✅ Q-147 — When a phone or printer fails, and loads with no monitor at one end
*(ADR-156)* **Decided:** every load has a monitor at both ends; everything ends up in the system
(no paper records); the back office can create any record when, say, a device fails, marked and
flagged; a monitor's paper log is only their own backup. Citizen drop-off sites: **Q-174**.

Records "created off-device by an approved user" are allowed (Q-57), but nothing says when.

> **User:** A truck cannot load or unload with a monitor issuing a ticket, otherwise they wont get
> paid for the work because nobody could verify/attest for it.
>
> Records can be created offline. No off device, outside the system. All data must at some point
> move into the system and we do not record paper logs. Any paper backups may or may not exist.

1. **Paper backup.** A collection monitor's phone dies at noon. Do monitors carry paper tickets as a
   backup, with the back office typing them in later? If so, for which ticket types, and are they
   marked or flagged "entered in the back office"?
2. **No monitor at the site.** Do some of your loads end at a landfill with no monitor, where only
   the scale receipt comes back? If so, who records the disposal half?
3. **Citizen drop-off sites**, where residents bring their own debris: in scope?

**Agent proposal:** any ticket type may be entered in the back office from paper, marked with the
person and a reason, and flagged for review. It pairs like any other half.

> **User:** The agent proposal makes sense in that it would be what we want to be able to do as a
> back office user correcting an issue. Say a monitor device did fail and they needed to manually
> create it. The back office needs to be able to create it.
>
> A monitor carrying a paper log is simply logging down the same work they mark in the phone right.
> So if there is a need to backup some work that failed on device there is some record to use.

*Refs:* Q-57, ADR-047, ADR-052.

### ✅ Q-148 — Photos: how few, and how many
*(ADR-157)* **Decided:** photo requirements are set on the service code ("required" or not); a
ticket holds at most 8 (not per phase); a hazardous tree takes 1 pre, 1 measure, 1 post; limits
are settings; too few is flagged, never blocked. Follow-ups: **Q-173** (a certification's photos),
**Q-170** (how a load meets its code's settings).

Tickets take up to 4 photos (an old limit). Nothing sets a minimum.
1. Should a ticket with **no** photos be flagged (a collection with no pile photo, a disposal with no
   empty-bed photo)?

   > **User:** Photo requirements need to be set when the service is created. Simple check
   > indicating required or not leaving the limit at 8, and only tickets were we expect certain
   > photos we'd be checking for that minimum and capping at 8 now.

2. A hazardous tree ticket goes through pre-work, measure and post-work. Are 4 photos enough, or does
   each phase get its own?

   > **User:** 1 pre, 1 measure, 1 post.. The limit is still 8 for the ticket, not each phase. A
   > cert only gets 4 operator+placard (1), interior (rear view) or back view (1), right side view,
   > left side view front view.

3. Should the limits be **settings** (per ticket type, or per kind of unit rate work) rather than
   fixed?

   > **User:** Yes...

**Agent proposal:** minimum and maximum as settings with defaults (at least 1, at most 4; unit rate
at most 4 per phase); a ticket under the minimum is flagged "no photos", never blocked.

> **User:** Proposal is perfect..Approved.

> **User, 2026-10-19 (after trying the field app; ADR-590):** "Unit Rates are missing the details
> needed. There are no pre work, measurement or post work flows. … This is for leaners, hangers and
> stumps. No other unit rates have these specific requirements. We want to have buttons for these
> things in the flow … So work that is incomplete, button is one color. When work is done, another.
> … The review page should clearly show what part of the work photos were for. This way we show
> pre,measure,post in the review page. And for these we want to make sure they are large enough to
> see them." **Built (ADR-590):** a photograph's stage, one each of pre-work, measurement and
> post-work, on the kinds of work the firm marks (Hangers, Leaners, Stumps as shipped), within the 8.

*Refs:* ADR-101, Q-107; `adms-field-app` §4A.4.

### ✅ Q-149 — What each kind of unit rate work measures
*(ADR-158)* **Decided:** measured at chest height using circumference; one measurement per ticket
(a hanger's measure: limbs of 2 inches or more); "require measurement" is a service code setting.
Follow-ups: **Q-171** (circumference or diameter recorded), **Q-172** (stumps and extraction).

A unit rate ticket has one "measurement" (e.g. a diameter) that rules can test. Your Build 1 example
priced leaners by size: `1B` 6–23 in, `2B` 23.1–36 in, `2C` over 36 in.
1. For each kind you use (hangers, leaners, stumps, others), **what** is measured, **where**, and in
   **what unit**? Agent's guesses: a leaner's trunk diameter at chest height, in inches; a stump's
   diameter a set height above the ground, in inches; a hanger's limb diameter at the break.

   > **User:** Measured at chest height using circumference.

2. Is **one** measurement per ticket enough? (A hanger ticket with 12 limbs: one number, or one per
   limb? A stump with fill dirt in CY?)

   > **User:** Yes because in that hanger example any branch at least 2 inches or more is used as
   > the masure. The stumps that are taken as an extraction event so lets not get it confused with
   > this. That's a different measurement itself. If you aren't sure about that ask specifically
   > about stumps and extraction. Or related to how they are taken to disposal as CY later. Thought
   > we had covered this part in depth though.

3. Is a measurement **required** for some kinds (a stump with no diameter flagged)?

   > **User:** No, but this is also a service code setting. Require measurement? Simple addition.
   > And it allows a lot of flexiblity for how one is able to configure projects.

*Refs:* ADR-124, ADR-127; `spec/RULES.md` §4; `spec/FROM-BUILD-1.md` §6.

### ✅ Q-150 — Crew time: one ticket a day per crew?
*(ADR-159)* **Decided: approved as proposed.**

A crew-time ticket bills its highest item's hours, once, and more than 12 hours for one item in a day
is flagged.

Example: the monitor writes one crew-time ticket for 06:00–11:00 (Skid Steer 5 · Truck 5) and
another for 12:00–18:00 (Skid Steer 6 · Truck 6) for the same crew.
1. One crew-time ticket per crew per day, or several?
2. If several, do they bill separately (5 + 6 = 11 hours) and does the 12-hour check add them up for
   the day?

**Agent proposal:** several are allowed; each bills its own highest hours; the 12-hour check adds up
each item's hours for that crew over the project's day, across tickets; overlapping crew-time
tickets for one crew are flagged.

> **User:** Proposal makes sense. Approved.

*Refs:* ADR-068, ADR-084, ADR-087, ADR-126.

### ✅ Q-151 — Forms: fixed fields, or can a firm add its own?
*(ADR-160)* **Decided: approved as proposed.**

"Everything is a form" (Q-103), and how forms are defined was left as a design task that nothing
has settled. It shapes the data model more than anything else left.

Example: a firm wants its pre-work survey to also ask "Pool on the property? yes/no", and its
incident report to ask for a police report number.
1. Are the fields of each ticket, survey, ROE and incident **fixed in the code** (a firm extends the
   pick-lists, not the fields), or can a firm **add its own fields** to a form (text, number, yes/no,
   pick from a list, photo)?

2. If firms can add fields: only to forms that never bill (surveys, ROEs, incidents), or to tickets
   too? Can a rule test an added field?

**Agent proposal:** fixed fields on anything that bills (tickets, certifications), because the
engine reads them; firm-added fields on surveys, ROE forms and incidents, kept with each record and
exported, never read by the engine or rules; a free-text notes field on everything.

> **User:** Proposal makes sense. Approved.

*Refs:* Q-103; `spec/FROM-BUILD-1.md` §8; ADR-070.

### ✅ Q-152 — How a post-work survey finds its pre-work survey
*(ADR-150)* **Decided: approved as proposed.**

Every post-work survey belongs to one pre-work survey.

Example: on Monday, monitor A does a pre-work survey at 900 Mill St on phone 1. On Thursday, monitor
B does the post-work survey on phone 2, which has never seen Monday's survey.
1. How does B's survey link to A's: by **ROE number**, by **address**, or **picked from a list** on
   the phone?
2. If no pre-work survey is found, is the post-work survey flagged?

**Agent proposal:** link them by ROE number; the phone's manifest lists the ROEs whose pre-work
survey is done, so B can pick one; the server joins them; a post-work survey with no pre-work survey
on its ROE is flagged.

> **User:** Proposal makes sense. Approved.

*Refs:* `adms-ticket-workflows` §4.6; ADR-129.

### ✅ Q-153 — Which time is a load's date?
*(ADR-161)* **Decided:** a load's time is when its collection closed (the collection's end); a
disposal's time is when its disposal closed. The agent's lean (the disposal's end) is not taken.
The agent's reading of what that means for the active window, the *Ticket date* criterion and the
daily count is in **Q-175** to confirm.

A load has two halves at two times. The project's active window uses "the ticket's end time", rules
have a *Ticket date* criterion, and reports go by day.

Example: a preload collected Monday at 17:10 and dumped Tuesday at 07:20. The project's end date is
Monday. A rate change starts Tuesday.
For a completed load, which time counts: the **collection's end** (the curb work) or the
**disposal's end** (the load completed and called)? Is it the same for the active window, the
*Ticket date* criterion and the daily report?

> **User:** load time is when the collection ticket closed, so end collection
> disposal time is when disposal ticket closed..., so end disposal

**Agent's lean, to confirm or change:** the **disposal's end**, for all three: that's when the load
call is made and the load exists, and it's what a tower's daily count shows. Under that answer,
the Monday preload above is flagged "project not active" and priced at Tuesday's rate.

*Refs:* Q-60, ADR-064, ADR-100; `spec/RULES.md` §4.

### ✅ Q-154 — Split loads: mileage and rules per property
*(ADR-162)* **Decided: approved as proposed.**

A split load is several collections (one per property) and one disposal. Each property is billed its
share, and each keeps its own zone.

Example: 10095-A at 900 Mill St (zone North), then 10095-E at 940 Mill St (zone South, 3 miles on),
then the TDSR.
1. **Mileage:** measured from which collection's end GPS: the **last** one (-E), or **each
   property's own**?
2. **Rules:** run **once per property** (so -A's share can price at the North rate and -E's at the
   South rate), or once for the whole load? If once, with which zone and address?
3. **Volume** criterion on a split: the whole load's CY, or the property's share?

**Agent proposal:** rules run once per property, on its share: its own zone, address and mileage
(from its own end GPS to the disposal), the load's cert, disposal and load call, and Volume = its
share. Each property gets its own transactions, as already decided (one row per property).

> **User:** Proposal makes sense. Approved.

*Refs:* ADR-055, ADR-089, ADR-110, ADR-141.

### ✅ Q-155 — When no road route can be found
*(ADR-163)* **Decided:** mileage is always the truck's road trip. From the collection's GPS, take
the nearest point on a road and its address, and route from there to the disposal's end GPS on
ordinary public roads (no truck size). If no route is found, use the straight line, flagged. The
agent's proposal is not taken.

Mileage is the road route between the collection's end GPS and the disposal's end GPS.

Example: a collection's GPS lands in a field 400 m from any road, or on water (a waterway project's
barge landing), or on a road newer than the map. The routing server finds no route.
1. What then? (a) Flag "no road route found" and leave mileage empty, so rules with a *Mileage*
   criterion don't match; (b) use the straight-line distance, flagged; or (c) start the route at the
   nearest road, flagged if that road is far away.

   > **User:** (b) as a fallback as perfect and using the flag helps figure things out better.

2. **Waterways:** is debris ever billed by distance moved over water, or is mileage always the
   truck's road trip?

   > **User:** always the trucks road tris. Your example above isn't plausible in case 2 (over
   > water), but I have seen a lot of cases where a ticket pings off a road...actually a good time to
   > note how I imagine the actual code to work around distance and exactly how we should do it.
   >
   > So we have a GPS right... Say it's 400m from the [nearest] road, and a straight line from the
   > given gps to that point on the road yields the nearest address as [123 nope street] so we start
   > the distance from 123 nope street and get the shortest route to [disposal_end_gps]. That's how
   > we get it.

3. "Legal truck route" needs a truck size (height, weight). Is one standard dump-truck size per
   project enough (in its GIS settings)?

   > **User:** We just assume all available roads are the legal road for the truck.. Regular
   > traffice routes that is, not private roads or things we know traffice isn't allowed to
   > navigate.

**Agent proposal:** (c) within a set distance (a GIS setting, e.g. 500 m), otherwise (a); one
standard truck size per project.

> **User:** (NO, not at all, see my responses above)...

*Refs:* ADR-110, ADR-119, ADR-125; ARCHITECTURE §3.

### ✅ Q-156 — Rule criteria and actions that may be missing
*(ADR-164)* **Decided:** (1) no *Load call* criterion: a project setting flags load calls at or
under 5% and at or over 95% by default, changeable or off; (2) no *Flag* action; (3) on a
haul-out, *Disposal site* is the FDS, and a criterion for the TDSR it left is added (names to be
settled); (4) nothing else. Plus: a **naming pass** over criteria, codes and export columns before
the build.

The criteria come from the legacy editor. Four gaps show up against earlier answers:
1. **Load call.** "A 3% call and a 98% call both mean a human must look at this" (`adms-domain`
   §1.3), and early drafts had "minimum load call" checks. Rules can't test the load call. Add *Load
   call* as a criterion?

   > **User:** NO! In the project settings we want to have an admin setting that defaults to flag 5%
   > and under and 95% and over, but it can be changed to off or whatever is selected. My way is
   > better because your way forces each rule to either test for it or ignore it.

2. **A "Flag for review" action.** Rules can create, delete or void, but not flag. Example: a leaner
   on code `2B` (23.1–36 in) measured at 40 in, or a load call under 10%. Should a rule be able to
   **flag** a ticket with its own message (it still bills), instead of voiding it?

   > **User:** No. Because doing that creates ridgid system stuff like making us handle load call
   > flags through rules and that scale poorly. We'd want the same setting over the entire project
   > where it applies.

3. **Haul-outs:** does *Disposal site* mean the FDS it went to? Do you need a criterion for the
   **TDSR it left**?

   > **User:** Yes, but we can name these criteron whatever makes the most sense. A lot of the
   > examples I have given throughout comes from a legacy setup where names and codes often didn't
   > make a lot of sense. So at some point in this planning before we build it would help to go
   > through some of these conventions we're outlining and make them into whatever makes the most
   > sense for this work, thinking from the angle of how many people will touch details about the
   > final data that gets output, down to even column names and making sure we have plenty of
   > details we're able to export for each type of thing the field is creating.

4. Anything else you've needed: vehicle type (self-loader or dump truck), the time of day?

   > **User:** No, not that makes sense right now anyway.

**Agent proposal:** yes to 1, 2 and 3 (a *From site* criterion on haul-outs); nothing else unless
you name it.

> **User:** See my responses.

*Refs:* ADR-109, ADR-116, ADR-118; `spec/RULES.md` §4–§5.

### ✅ Q-157 — Checking load calls against scale weights
*(ADR-165)* **Decided:** no check of weights against load calls. When a load is billed by weight,
the tower monitor enters the scale weight instead of a load call; the service code has a setting
for how its quantity is measured, which says what the ticket must have (flagged at reconciliation
if missing or wrong). Follow-up: **Q-169**.

When a load has a real scale weight, it can be checked against the load call. The scale receipt
notes call a load call that drifts from the scales "the single most useful fraud signal", with a
tons-per-CY factor per debris type agreed in the contract. Nobody has decided whether to build it.

Example (made-up factor): 30 CY at 90% = 27 CY. If the agreed factor for that debris were 0.5
tons/CY, the load should weigh about 13.5 tons. The scale says 6.1 tons.
1. Do you want this check: a flag when a load's tons per CY is further than a set tolerance from the
   agreed factor for its debris type? ("Later" is a fine answer.)
2. If yes: factors per debris type on each project (from its contract), and the tolerance a setting?

> **User:** No/No... We do not want to check scale weights against CY...
>
> When a contract is actually for weight or otherwise that is how the client wants to have it setup,
> then when the load is disposed, The monitor in the tower doesn't need to issue a load call because
> they are going to enter the scale weight from the scale themselves when they see it on a papwer
> form. And there is a setting for this in the servie code otions as well. Think about it When we go
> to make a service code we know what type of work it is going to be for right? So we we setup one
> for ROW collection we have an option for how to calculate CY/Vol and that sets up what we expect on
> the ticket or flag for in reconcilliation if its missing or wrong, ect...

*Refs:* `adms-scale-receipts` "The cross-check it unlocks"; ADR-035, ADR-038.

### ✅ Q-158 — Clearing a flag that's right as it is
*(ADR-166)* **Decided: approved as proposed.**

**The biggest gap found.** A flagged ticket is in review until it's fixed, and a ticket in review
**can't be locked as invoiced** (Q-62). A fix reprocesses it. But many flags are right as they
stand, with nothing to fix.

Example: disposal 104500 is 250 m outside its site's circle because the truck dumped at the overflow
area; ticket 104501's number was typed because the barcode was wet; ticket 104502's driver's licence
expired yesterday and the client accepted it. Nothing needs changing, and reprocessing raises the
same flags again, so these tickets can never be locked.

How does a reviewer clear a flag without changing the record?

**Agent proposal:** an **Accept** action on each flag, with a reason, audited. An accepted flag
stays in the ticket's history and isn't raised again on reprocess **unless the facts it was about
change** (e.g. the GPS is corrected, or the site's shape changes). When every flag on a ticket is
fixed or accepted, the engine marks it `COMPLETED`. The people who may correct may also accept.

> **User:** Approved agent proposal.

*Refs:* ADR-052, ADR-060, ADR-067, Q-40.

### ✅ Q-159 — A rule voids a ticket, and a person unvoids it
*(ADR-167)* **Decided:** the rule always wins. To keep such a ticket unvoided, the reviewer
corrects the data (e.g. the disposal site) or the rule, and it reprocesses.

A rule's *Void Ticket* action can void a ticket; unvoiding is a person's audited action.

Example: a rule says "Disposal site EQUALS Old Landfill → Void Ticket". A reviewer finds ticket
104499 dumped there on a day it was allowed, and unvoids it. At the next reprocess (any edit, a map
change, a rule change) the rule voids it again.

> **User:** The person who unvoided that ticket that went to the Old Landfill will not work very
> long. If a rule like this were to exist the tickets being voided would not be unvoided, unless the
> Old Landfill had actually not taken those loads and they went to Right Landfill, in which case we
> want to be able to unvoid, change the disposal site location and save them so they can be
> processed and COMPLETD (assuming there are no other issues).

Should a person's unvoid **stick** (the rule doesn't void that ticket again unless the rule or the
ticket changes), or does the rule **always win** (the reviewer must change the rule or the data)?

**Agent proposal:** it sticks, the same way an accepted flag does (Q-158).

> **User:** the rule **always win**

*Refs:* ADR-051, ADR-118, ADR-131.

### ✅ Q-160 — For a load, which record is QC'd and locked?
*(ADR-168)* **Decided:** a load (and a haul-out) is QC'd once, as the completed load, after both
halves are joined; it's the completed load that's locked as invoiced, never a half. Halves are
flagged and corrected by the back office before the merge, but not QC'd. Unit rate tickets,
incidents, certifications and everything else are QC'd on their own.

Everything a monitor makes starts at QC Review, and only QC Approved tickets can be locked as
invoiced. A load is **three** records: the collection, the disposal, and the completed load (`CLT`)
the system makes.

> **User:** A load is 1 QC review as we are only concerned that the final payer items are reviewed.
> Plus, when the merger of collection and disposal happens we see both sides of the data on a
> single ticket, so when the QC happens it makes sense to happen after both sides are done.
> Unit rates, incidents, certs, everything else is one off. but loads..haul outs are loads.. that
> have these 3 parts and we only QC the merged result.
>
> But we do flag issues with tickets that have them prior to merger and allow corrections by the
> back office, which can push it through (either side if its multi stage) or single for units and
> else.

Example: load 104499: a collection by monitor A, a disposal by monitor B, and `CLT 104499`. The back
office reviews 100 loads a day.
1. Does the back office QC **each half**, or the **completed load** as one?
2. What gets **locked as invoiced**: the completed load (locking both halves with it), or each half?
3. A split: one QC and one lock for the whole load, all its collections included?

> **User:** Why would we ever think to invoice half of a ticket? We wont ever do that. PERIOD!

**Agent proposal:** QC and lock the **completed load** as one unit; its halves follow it (a half with
no partner yet is QC'd on its own). A split is one unit. A unit rate ticket is its own unit.

> **User:** (see my responses)

*Refs:* ADR-061, ADR-107, ADR-117, ADR-121.

### ✅ Q-161 — What read-only viewers can see
*(ADR-169)* **Decided: approved as proposed.**

Clients, contractors and auditors get read-only logins to their own projects. **Which** projects is
decided; what they see inside them isn't.
1. **Money:** can a client see transactions and rates? A contractor? Reports show debris totals,
   never costs; does that go for viewers' screens too?

   > **User:** Yes, but only their own related work and stakeholders.

2. **Other contractors:** on a project with two primes, does TFR see Ceres's tickets and rates, or
   only its own and its subs'?

   > **User:** No, only their own.

3. **Personal details:** drivers' phones and licence numbers, homeowners' names on ROEs, and
   monitors' phone numbers (which are also their passwords). Who sees these?

   > **User:** Employees, clients. Contractors and others only see ticket (payer) related data they
   > need for invoicing.

**Agent proposal:** clients and auditors see the whole project except personal phone and licence
numbers; a contractor sees only its own tickets and transactions (a prime with its subs'), never
another prime's; monitors' phone numbers are shown only to admins.

> **User:** Agent proposal makes sense.. Approved!

**Asked again for a sub, 2026-10-06 (task 1.7.3, ADR-361; the back office's hat).** Ticket 101002 on
P1: Rivera Trucking's truck `730416`, working as a sub under Coastline Haulers, hauls C&D to the
Landfill. The ledger holds two lines for it: #1 `CD-HAUL-CY-15`, 36.0 CY × $8.25 = $297.00, and #2
`TIP-FEE-CY-BCL`, 36.0 CY × $4.00 = $144.00. The $8.25 and $4.00 are Coastline's rates with Bayline
County; what Coastline pays Rivera is not in the system. When Rivera's own read-only login opens
ticket 101002, what should it see of those two lines? Options: *No money (Recommended)* · *Rate and
amount too* · *The firm picks per login*.

> **User, 2026-10-06:** "No money (Recommended)": "Rivera sees its ticket, the pay item and the
> quantity (36.0 CY), but not the rate ($8.25) or the amount ($297.00). The prime's price with the
> client stays between the prime, the client and the firm."

**Decided (ADR-361):** a sub's contractor user reads its lines' pay item and quantity and no rate or
amount; its prime's contractor user, a client user and an auditor read the money.

*Refs:* ADR-050, ADR-105, ADR-361, Q-02, Q-100; ARCHITECTURE §5.5.

### ✅ Q-162 — Two-step sign-in, and email
*(ADR-170)* **Decided: approved as proposed**, with local development testing kept workable.

The security checklist we test against (OWASP ASVS Level 2, NIST 800-63B) expects a second sign-in
step for people who can change records or see personal details.
1. **Two-step sign-in** (a code from an authenticator app) for back-office users: required,
   optional, or not needed? For outside viewers?

2. **Email:** does an installation send email at all, e.g. a "forgot password" link or the daily
   report? Without email, an admin resets passwords by hand.

**Agent proposal:** required for admins and managers/analysts, optional for viewers; monitors
unchanged (their protection is the phone). Email optional: the installer sets it up if the firm has
a mail server; otherwise admins reset passwords.

> **User:** Agent proposal makes sense.. Approved! But make sure we can perform local dev testing if
> this creates issues for that.

*Refs:* ARCHITECTURE §6, §16; ADR-105.

### ✅ Q-163 — Open ADMS's own licence
*(ADR-171)* **Decided: AGPL-3.0.**

Open ADMS will be open source. The scaffold checks every dependency's licence before pinning it, but
a licence only "passes" relative to Open ADMS's own, and the repository needs its licence file.

Two common choices:
- **Apache-2.0** (or MIT): anyone may use, change and sell it, closed versions included. Apache adds
  a patent grant.
- **AGPL-3.0**: anyone may use and change it, but whoever offers a changed version to others over
  the web must publish their changes.

Which one? The agent would pick **Apache-2.0** for the widest use, or **AGPL-3.0** if you want every
hosted change shared back. (Running Nominatim, which is GPL, as its own server is fine under either.)

> **User:** **AGPL-3.0** so firms can't take this from, go customize it and keep it internally to
> use in future work as "proprietary". thats the idea anyway.

*Refs:* ADR-063, ADR-093, ADR-143.

### ✅ Q-164 — Languages and units
*(ADR-172)* **Decided: approved as proposed.**

1. Does the field app need languages besides English, e.g. **Spanish**, for monitors who'd rather
   work in it? Building every screen ready for translation from the start is cheap; adding it later
   means touching every screen.
2. **US units only** (inches, cubic yards, miles, pounds, tons)?

**Agent proposal:** every screen translatable from day one, English only at first; US units only.

> **User:** Agent proposal makes sense.. Approved!

*Refs:* ARCHITECTURE §3, §14.

### ✅ Q-165 — Small confirmations
*(ADR-173)* **Decided:** (1) reasons are picked from a firm list (the firm sets it up or uses the
defaults); (2) a disposal site has an activation date and an optional close date, and a disposal
after a set close date is flagged at reconciliation; (3) the rule binds the debris type, not the
service code, and a service code picks **what the payable is** from a firm-extendable list, shown
as a type column in exports; (4) a split's first collection is `-A`. Readings to confirm: **Q-175**.

1. **Reasons** (voiding, a typed ticket number, accepting a flag): typed freely, or picked from a
   firm list with optional text?

   > **User:** picked from a firm list (firm can setup os use defaults)

2. **Sites opening and closing:** does a disposal site have open and close dates (a TDSR closes when
   its permit ends), with a disposal at a closed site flagged?

   > **User:** We do want to have a site activation date and a site close date, but close is
   > optional. If close is set and has lapsed when we try to reconcile then that's a flag.

3. **A service code's debris type:** the glossary says a service code binds a debris type. Does it,
   or does only the rule decide (the *Debris class* criterion)?

   > **User:** The rule binds it, not the service code. However, and this may help make something
   > more clear or open a new question. When we setup the service code, we actually do want to
   > select from a list of things the payable actually is. Most things have common names for the
   > type of work but there are quite a few and they need to be able to be added by the firm using
   > the system. This also show up as a type column on the data so that (imagine we exported all of
   > the load ticket -complete) data we'd see a column that has these names. Which means say there
   > were 100 unit rate tickets for hangers and 20 for trees (leaners) and we also had 15
   > vegetative/woody row tickets. When we pulled the data we'd see leaners and hangers in the unit
   > rate export, and vegetative/woody in the load ticket export.

4. **The first collection of a split:** always `10095-A` (as in the split examples), never a bare
   `10095`? One line in the exceptions skill talks about "an unsuffixed sibling".

   > **User:** (-A)

**Agent proposal:** (1) a firm list plus optional text; (2) yes, flagged "site closed"; (3) the code
keeps an optional debris type for display and reports, and only rules decide pricing; (4) `-A`.

> **User:** See my responses

*Refs:* ADR-051, ADR-111, ADR-070; `adms-domain` glossary; `adms-exceptions` Scenario D.

### 🛠 Q-166 — Map data for each region (design task, not a question)
The routing server, the address server and the base map each need OpenStreetMap data for the
project's region. A firm with projects in Florida and Texas needs both. How the installer downloads,
stores and refreshes regional map data, and how each mileage records the map date it used, is ours to
design. It will be proposed as an ADR when those services are scaffolded.

> **Agent, 2026-10-01 (ADR-282), the local stack's part:** both servers read **one extract, named by
> a URL and a SHA-256 together** (`ADMS_MAP_EXTRACT_URL`, `ADMS_MAP_EXTRACT_SHA256`), downloaded once
> and checked against its hash on every start; each server rebuilds its data when the hash changes;
> **the extract's date is the map's date**, which a mileage will record with the extract's hash.
> The built-in extract is Delaware's dated copy of 1 January 2026. Still to design (BACKLOG C48, C49):
> several regions in one installation, how a firm names its region at install, refreshing the map,
> the demo deploy's servers, the back office's base map.

*Refs:* ADR-110, ADR-119, ADR-144, ADR-282; ARCHITECTURE §3, §4.

### 🛠 Q-167 — Upgrading an installation (design task, not a question)
A firm runs its own installation. A new Open ADMS version must upgrade its database (migrations and
guard migrations) without losing a record, and phones still running the old app must be able to sync
to the new server. Versioning the sync contract, and the installer's upgrade steps, are ours to
design. It will be proposed as an ADR at the scaffold.

*Refs:* ADR-113, ADR-143; ARCHITECTURE §4, §9.

---

## AB. Raised 2026-09-27 (round 14) — follow-ups from your round 13 answers

Eight short follow-ups. Each stands alone. **If you only have time for three:** Q-169, Q-170, Q-175.

> **Answered 2026-09-27** (ADR-174…181). What they opened is in §AC (Q-176…Q-178).

**What each one holds up:** the data model draft (`spec/DATA-MODEL.md`): Q-168, Q-170, Q-173, Q-175;
the engine and pricing: Q-169, Q-171, Q-172; scope: Q-174.

### ✅ Q-168 — "Ticket Contract" in a rule: keep it?
*(ADR-174)* **Decided:** "Ticket Contract" was only the legacy label for the contract field: a
picker of the project's contracts. There is no "ticket's own contract"; each prime gets its own
rules (firms often copy codes and rules per prime, with a 3-letter contractor acronym in the name).

You said a contract is just a name, its prime and a link, and "in a rule we link the contract to the
transaction". The legacy rule builder also offered **"Ticket Contract"** instead of a named
contract, meaning "whatever contract this ticket belongs to", and our worked examples use it.

Example: Bay County ROW has two primes, TFR and Ceres, each with one contract. One rule, "Create
Transaction 1, Service = 3A, Contract = Ticket Contract", bills TFR's loads to TFR's contract and
Ceres's loads to Ceres's. Without it, the firm writes two rules, one naming each contract.

1. Keep "Ticket Contract" as an option?
2. If yes, and the ticket's prime has **two** contracts on the project (e.g. TFR's ROW contract and
   its haul-out contract), which does it mean?

**Agent proposal:** keep it; it means **the one contract of the ticket's prime** on the project. If
that prime has two or more, the rule must name one, and the rule builder's *Is Valid* says so; a
ticket that still reaches "Ticket Contract" with two to choose from is flagged "which contract?" and
not billed on that line.

> **User, 2026-09-27 (round 14, inline):** NO - ticket contract is just the name the legacy build
> used instead of contract. What we are calling contract the same. In the legacy build when you click
> ticket contract you see a list of options. Each is a different contract (if more than one prime),
> and a different rule must be created for the different primes. Often times  you end up with more
> than one prime and both are making the same types of tickets thus needing the same service codes
> and rules, but with the names for each with the a 3 letter acronym for the contractor added to the
> name field on each.

*Refs:* ADR-109, ADR-118, ADR-146; `spec/RULES.md` §5.

### ✅ Q-169 — Loads billed by weight: how the tower knows, and tandems
*(ADR-175)* **Decided:** (1) a service code has a "requires weight" setting, set up on the phone,
which makes the disposal ask for the weight; (2) a tandem's shared weight is split by certified
capacity and flagged for review; weighing truck and trailer separately avoids it. How a load's code
is picked on the phone: **Q-176**.

You said that when a contract bills by weight, the tower monitor **doesn't give a load call**; they
enter the scale weight off the paper, and the service code has a setting for how the quantity is
measured.

Two things follow:
1. **How does the tower phone know to ask for a weight?** A load's service code comes from the rules,
   after sync, so the phone doesn't know it while the truck is at the tower. Example: Bay County
   Landfill (an FDS) bills C&D by the ton, but vegetative debris by the CY on the same project.
   Options: (a) the phone looks at the project's codes: if the debris type picked on the start list
   is billed by weight at this site, it asks for the weight; (b) a setting on the **disposal site**,
   "bills by weight", optionally per debris type; (c) the monitor always has both fields and fills
   the one they know is right; (d) something else.
   > **User:** (a) the phone was setup with the project details and knows what types of tickets the
   > user is able to make. If they are setup for disposal and a service code was properly setup with
   > a flag marked stating that this service code should require a weight.
   >
   > Note how when service codes are setup it impacts what the downstream user device shows as
   > options to the user. This follows how other service codes impact the details required.

2. **Tandems.** One scale receipt, 17.10 tons, covers a truck (30 CY) and its trailer (40 CY), two
   certified containers with two tickets. Today the weight is shared out **by load call** (truck
   90%, trailer 85% → 7.57 t and 9.53 t). With no load call, how is it split? (a) The monitor still
   gives both load calls, only for sharing the weight; (b) by certified capacity (7.33 t / 9.77 t);
   (c) the monitor types each container's share; (d) something else.

   > **User:** (b). The weight is the load call and we know how much CY each started with based on
   > their cert so we can do the math and divde the weight. this method is not perfectly even. the
   > better option is for the truck and trailer to be weight separate. So when we do end up with a
   > split ticket like this that uses weight of each and we dont need to do any special math.
   >
   > if tandem and weight, flag it for review since this is messy math. that makes sense to me unless
   > we can lock down a method with the math that is 100% reliable at scale.

**Agent proposal:** 1 (a), so the phone asks for exactly what the code will bill, and reconciliation
flags a mismatch; 2 (a).

> **User:** (see responses)

*Refs:* ADR-035, ADR-038, ADR-165; `adms-scale-receipts` "Apportionment".

### ✅ Q-170 — Service code settings on a load: checked where?
*(ADR-176)* **Decided:** setup pushes the service codes and their settings to every phone, for every
ticket type, not only unit rate; the phone shows options and asks for required details from them.
The agent's proposal is not taken. How a load's start list, its code and its debris type fit
together: **Q-176**.

You've put several settings on the service code: photos required (Q-148), GPS required (Q-141),
measurement required (Q-149), and how the quantity is measured (Q-157). A **unit rate** ticket
carries its code from the start, so its phone knows them. A **load** gets its codes from the rules
only after sync, and one load can get two or three codes (hauling, a TDSR fee, a tipping fee).

Example: code `3A` (ROW hauling) is set "photos required". A load reaches `3A` through a rule. Its
collection has no photo.

**Agent proposal:** the phone can only check what it knows (unit rate codes, and the weight rule of
Q-169); everything else is checked at **reconciliation**, against every code the rules gave the load:
"Ticket 104499: no photos (required by 3A). Flagged for review." If two of a load's codes disagree,
the stricter setting wins. Is that right?

> **User:** setup must push these details to each phone, we do not just want unit rate tickets to
> have these details else when a monitor needs to select a debris type code, they have no options at
> the start. this changes things but it also explains some of what you are mistaken on here so far.
> s]

*Refs:* ADR-157, ADR-158, ADR-165; `spec/RULES.md`.

### ✅ Q-171 — A tree's measurement: circumference, or diameter?
*(ADR-177)* **Decided:** (b). The monitor selects whether they measured the circumference or the
diameter; a circumference is converted to a diameter for rules. A standing tree is measured at chest
height before it's cut; an already-cut tree's diameter is documented with photos and is eligible.
QC checks the photo matches the number.

You said trees are "measured at chest height using circumference". Your Build 1 example prices
leaners by **diameter** ranges: `1B` 6–23 in, `2B` 23.1–36 in, `2C` over 36 in.

Example: a leaner's trunk measures **75 inches round** at chest height. That's about **23.9 inches
across** (75 ÷ 3.14). As a circumference it looks like `2C`; as a diameter it's `2B`.

Which number does the monitor enter, and which do rules test?
(a) the monitor wraps a **diameter tape** (reads inches across directly) and enters the diameter;
(b) the monitor enters the **circumference** and the system works out the diameter (÷ 3.14, rounded
to a tenth) for rules; (c) the circumference, and the firm writes its code ranges in circumference.

> **User:** (B) we must measure the tree before it is cut and it must be measured at chest height.
> if the tree was already cut, the monitor is able to document the diameter and take photos like
> normal and complete the ticket as normal and it is eligble. Not all work is done the same.
>
> The monitor needs to select whether they measured the circumference or diameter. The photos prove
> what they measured and the QC revier confirms the photo matches the meausurement on file.

*Refs:* ADR-124, ADR-158; `spec/FROM-BUILD-1.md` §6.

### ✅ Q-172 — Stumps and extraction
*(ADR-178)* **Decided:** a stump's CY comes from its diameter (measured two feet up) by the formula
below, with L = 24 inches. Points 1–3 weren't answered directly; they're in **Q-177**.

You said stumps are "taken as an extraction event… a different measurement", and asked the agent to
ask specifically if unsure. It is: nothing in the skills or earlier answers describes it.

Example: a 30-inch stump is pulled from a ROW shoulder, the hole is filled, and the stump goes to the
TDSR on a truck later.
1. What does the monitor record at the stump: one unit rate ticket (a stump extraction), with what
   measurement (the diameter a set height above ground? in inches?) and any fill dirt (CY)?
2. How is it paid: per stump by size range, per CY of fill, or both?
3. How does the stump later reach disposal: as an ordinary load of stumps measured in CY (the load
   call), or does the stump ticket follow it?

> **User:**
> ```
> CY = [ (D^2 x 0.7854) x L  +  (RBD^2 x 0.7854) x RBH ] / 46656
> ```
> where D = stump diameter in inches measured two feet up, RBD = D x 3.6 (the 1:3.6 ratio), RBH = 31
> inches, 0.7854 = pi/4, 46656 = cubic inches per cubic yard.
>
> **Finding:** the attachment never states `L`, and its lookup table is indexed by diameter alone.
> Solving `L` back out of the published values gives **L = 24 inches**, which reproduces all 17
> sampled table rows (D = 6 through 84) to 1 decimal with zero mismatches. Record this in the
> implementation; it is not in the document.

*Refs:* ADR-124, ADR-158; `adms-ticket-workflows` §4.5.

### ✅ Q-173 — A certification's photos: 4 or 5?
*(ADR-179)* **Decided:** all five.

You wrote "A cert only gets 4", then listed:

| # | View |
|---|---|
| 1 | Operator with the placard |
| 2 | Interior (rear view) or back view |
| 3 | Right side |
| 4 | Left side |
| 5 | Front |

That's five. Is it (a) all five, (b) four, with one of these dropped (which?), or (c) "front" was
meant as part of another?

> **User:** all 5

*Refs:* ADR-157; `adms-certifications` §3A.8.

### ✅ Q-174 — Citizen drop-off sites: in scope?
*(ADR-180)* **Decided:** in scope, as its own ticket type, priced with service codes and rules,
without the truck-load requirements (certification, collection). What it captures: **Q-178**.

Some missions run sites where residents bring their own debris in cars and trailers. There's no
contractor truck, no certification, and no collection monitor at the curb.

Example: Bay County opens a drop-off at the fairgrounds; a resident unloads a trailer of branches.

In scope for Open ADMS, and if so, what does the monitor there record? Or out of scope for now?

> **User:** we just make services and rules to handle it using the config options we already have,
> but we would want to be able to mark the ticket type as this, and then not require all the extra
> stuff as noted.

*Refs:* ADR-156, Q-147.

### ✅ Q-175 — Readings to confirm
*(ADR-181)* **Decided:** all seven readings confirmed.

The agent read your answers this way. Say "yes" or correct any line.
1. **A load's date (Q-153).** "Load time = collection end" governs the project's active window, the
   *Ticket date* rule criterion and the daily load count. A preload collected Monday 17:10 and dumped
   Tuesday 07:20 is **Monday's** load, priced at Monday's rate, and not flagged "project not active"
   if the project ends Monday. A haul-out's date is likewise its collection end.
2. **Site dates (Q-165).** A disposal **before** a site's activation date is flagged too ("site not
   yet active"), like one after its close date.
3. **"What the payable is" (Q-165).** The new service code list (Leaners, Hangers, Vegetative/Woody…)
   is the **same list** as a unit rate code's "kind of work" (Hangers, White Goods, Crew time…),
   widened to every code. For unit rate codes it still picks the phone's screen.
4. **Cert number blocks (Q-142).** 100 numbers per certifying phone, topped up at sync.
5. **Load-call limits (Q-156).** A 0% load call is still flagged even when a project turns the
   5%/95% limits off (it bills nothing).
6. **ROEs (Q-141).**
   (a) An ROE made on a phone gets its number the way tickets do (from the phone's block), unless
       the county's paper ROE already has a number, which is typed.
   (b) An ROE's scope choices (e.g. "Vegetative debris", "Hazardous tree", "C&D") and its counts are
       set by the firm as the ROE form's own fields (the firm-added fields you approved in Q-151).
   (c) "GPS required" for an ROE is a setting on the ROE form, since an ROE has no service code.
7. **Photos (Q-148).** The limit is **8 per ticket** (your number), not the proposal's 4; there is no
   minimum unless a service code marks photos required, and then it's 1 (a hazardous tree: 1 pre,
   1 measure, 1 post).

> **User:** yese 1-7

*Refs:* ADR-149, ADR-151, ADR-157, ADR-161, ADR-164, ADR-173.

---

## AC. Raised 2026-09-27 (round 15) — three follow-ups from round 14

> **Answered 2026-09-27** (ADR-182…184). What they opened is in §AD (Q-179…Q-181).

**If you only have time for one:** Q-176. It decides how a collection and a disposal start on the
phone, so it holds up `spec/DATA-MODEL.md` and the field screens.

### ✅ Q-176 — On a load, does the monitor pick a service code?
*(ADR-182)* **Decided:** (a), as proposed. Every ticket starts from a service code: "Start ticket"
shows the codes set up on the phone for that ticket type, by code and name (`2A ROW Vegetative`); the
monitor picks one once and is never asked for a debris type separately. Enabling ticket types and
debris types on a project only marks them allowed; a service code is what makes a ticket possible.
Follow-ups (haul-outs, splits, what "disagree" means): **Q-179**.

You said setup must push the service codes and their settings to every phone, "else when a monitor
needs to select a debris type code, they have no options at the start", and that this explains some
of what the agent had wrong. The agent had it this way: for a **unit rate** ticket the monitor picks
a service code at the start (e.g. `6A Hanger`); for a **load**, the monitor picks a **debris type**
(e.g. Vegetative), and the rules pick the service codes after sync.

Example: Bay County ROW, one prime (TFR). Its load codes are `2A ROW Vegetative` ($8.50/CY),
`3A ROW C&D` ($9.00/CY) and `90A Tipping fee` ($4.00/CY, landfill only). `3A` is set "requires
weight" at the landfill. A C&D truck is loaded on Mill St, then dumped at the landfill.

Which is right?
- **(a) Loads work like unit rate.** The collection's start list is the phone's load codes by code
  and name (`2A ROW Vegetative`, `3A ROW C&D`); the monitor taps `3A`. The disposal monitor also
  taps a code at the tower, and because `3A` requires weight, the phone asks for the scale weight.
  Each code carries its debris type, so the halves disagreeing (collection `2A`, disposal `3A`) is
  the "debris type mismatch" flag. Rules test *Service code* on loads too (`Service code EQUALS 3A →
  Create Transaction 1, 3A`), and fee codes like `90A` never appear on the start list; rules add
  them.
- **(b) The monitor still picks a debris type**, but the list comes from the codes set up on the
  phone (only debris types that some load code covers), and the phone applies the settings of the
  codes for that debris type. The rules still choose the code after sync.
- **(c)** Something else.

**Agent proposal:** (a). It matches unit rate, it lets the tower phone know "requires weight"
exactly (your Q-169 answer), and reconciliation can check the halves agree. The one change it makes
to earlier answers: a load code then does carry a debris type (Q-165 said the rule binds it); the
code's **payable type** could simply be that debris type (Vegetative/Woody, C&D…). Which codes show
on the start list would be a code setting, "shown to monitors", so fee codes stay off it.

> **User, 2026-09-27 (round 15, inline):** **Agent proposal APPROVED:** this is exactly right, and
> when the monitor sees 2A ROW Vegetative and selects it, they dont have to select it again. So
> literally when a collection moniotor clicks, "start ticket", they first see a list of "debris
> types" which I really meant to mean a list of the service code names and such that are linked to
> tickets allowed on the project. When we enable ticket types and debris types on a project, we are
> just denoting that those are allowed. You couldn't actually make a ticket though because the system
> would need to know what to do with those types of tickets, and that is how the service codes set
> those up. Making more sense now?

*Refs:* ADR-047, ADR-124, ADR-127, ADR-129, ADR-165, ADR-173, ADR-175, ADR-176.

### ✅ Q-177 — Stumps: what the ticket records, and how it's paid
*(ADR-183)* **Decided from the guide you pointed to** (USACE Stump Conversion Guide, Attachment 5):
(1) the monitor records **one number, the stump's diameter two feet up**; the root ball is never
measured (the guide fixes it at 3.6 × the diameter and 31 in high), and the guide records nothing
else, so no fill dirt; (2) the CY is **rounded half up to one decimal**: the agent checked **all 79
rows** of the guide's table (6–84 in) against the formula with L = 24 in, with zero mismatches (30 in
→ 6.450 → **6.5 CY**). The guide doesn't say how a stump is paid or how it reaches disposal (3, 4):
**Q-180**.

Your formula gives a stump's CY from its diameter (thanks: the agent checked it: D = 30 in →
6.45 CY). Three things it doesn't say.

Example: a stump measured **30 inches across, two feet up**, pulled from a ROW shoulder.
1. **The ticket:** one unit rate ticket per stump, with the diameter two feet up (the monitor picks
   circumference or diameter, as for trees), and the system computes the CY? Anything else recorded,
   such as fill dirt?
2. **Rounding:** the CY rounded half up to one decimal (6.45 → 6.5), as the table you matched does?
3. **Paid how:** per CY from the formula (6.5 CY × the rate), per stump by diameter range, or either,
   set on the service code?
4. **Disposal:** the pulled stumps later go to the TDSR as an ordinary load (load call × capacity),
   billed as hauling like any other load, separate from the stump ticket?

**Agent proposal:** 1 yes, nothing else; 2 yes; 3 either, set by the code's quantity method ("stump
CY" or count) and the rules; 4 yes.

> **User, 2026-09-27 (round 15, inline):** Look at the file I shared in the chat on this one. It is
> the USACE guidelines on stumps and extractions. Are you able to deduce from that how we need to
> handle this part?

*Refs:* ADR-158, ADR-177, ADR-178.

### ✅ Q-178 — Citizen drop-off tickets: what the monitor records
*(ADR-184)* **Decided:** a citizen drop-off is **not a ticket**. It is a **reference log**, like an
incident or a survey: the monitor notes that a drop-off happened, marks simple details (e.g. pickup,
trailer), and tries to get the resident's name and the address the debris came from (not required).
No quantity, no ticket number, no receipt, no service code, no cost. The logs can be looked up later.
When drop-off ends, the pile is reduced and **hauled out like any other haul-out**; that is where the
quantity is measured and billed. Follow-ups: **Q-181**.

A drop-off ticket is its own type, priced by service codes and rules, with no certification and no
collection.

Example: at the fairgrounds drop-off, a resident unloads a pickup and a small trailer of branches.
1. **Quantity:** how is the volume measured with no certified capacity? (a) the monitor estimates CY
   and types it; (b) a count of vehicles by kind (pickup, trailer…), each worth a set CY on the
   service code; (c) something else.
   > **User, 2026-09-27 (round 15, inline):** Quantity is measured when citizen drop off begins haul
   > out. A monitor is present to mark things like (b), but they are just arbitrary and do not link to
   > anything else to process in the system. They are like surveys more than tickets and kinda like
   > incident reports but the monitor needs to be able to mark simple details not quantity.. just need
   > to not a drop off occured, try to collect name and address where it originated, but not
   > required. These are just reference logs.

2. **Details:** debris type (or code, per Q-176), photos, GPS and time from the phone; anything about
   the resident (address or ZIP, to prove they live in the county)?
   > **User:** see #1 response.

3. **Numbering:** does each drop-off get a ticket number from the phone's block like any ticket, and
   a printed receipt?
   > **User:** Not when they drop it off, but we do create a record like we do for incidents and need
   > to be able to look it up later when the debris hauls out. However there is no direct link for
   > costs. Once all drop off is completed, the pile is reduced and hauled out like other debris. And
   > we treat it just like we would any other haul out of debris.
   >
   > Does that make senese?

**Agent proposal:** 1 (a), a whole number of CY; 2 the code, photos, GPS, time, and the resident's
street address typed (eligibility); 3 yes to both.

> **User:** See my responses.

*Refs:* ADR-156, ADR-180.

---

## AD. Raised 2026-09-27 (round 16) — follow-ups from round 15

> **Answered 2026-09-27** (ADR-185…188). What they opened is in §AE (Q-182…Q-184).

Three short follow-ups. Each stands alone. **If you only have time for one:** Q-179. It finishes
the start screens and the data model's ticket halves.

### ✅ Q-179 — Starting from a service code: haul-outs, splits, and halves that disagree
*(ADR-185, ADR-186)* **Decided:** 1, 2 and 4 as proposed: a haul-out starts from a code at both
ends; a split load's code is picked once on `-A` and the rest of the chain takes it; a load or
haul-out code's payable type **is** its debris type (one setting). **3 is not taken:** the truck's
scanned information, not the monitor's pick, must decide whose work a load is and which rule
applies, and a monitor must never have to tell contractors' codes apart. The agent's new proposal
for how every ticket starts: **Q-182**.

You approved it: every ticket starts from a service code. The monitor taps "Start ticket", sees the
codes set up for that ticket type by code and name, taps one, and is never asked for a debris type
separately. Four details.

Example: Bay County ROW has two primes, TFR and Ceres, each with its own copies of the codes:
`2A-TFR ROW Vegetative`, `3A-TFR ROW C&D`, `2A-CRS ROW Vegetative`, `3A-CRS ROW C&D`.

1. **Haul-outs.** At the TDSR, the haul-out collection monitor taps a code (e.g. a haul-out
   vegetative code), and at the landfill the haul-out disposal monitor taps one too, just like a load?
2. **Split loads.** A split load is one truck with collections `-A`, `-B`, `-C`, one per property.
   Does the monitor pick the code once on `-A`, with `-B` and `-C` taking the same code without
   being asked? Or does each property's collection pick its own?
3. **Halves that disagree.** A TFR truck is loaded on Mill St. The collection monitor taps
   `2A-TFR ROW Vegetative`. Which of these should be flagged at the tower?
   - (i) the tower taps `3A-TFR ROW C&D`: different debris type;
   - (ii) the tower taps `2A-CRS ROW Vegetative`: same debris type, but Ceres's code on a TFR truck.
4. **A load code's type.** You said a code picks "what the payable is" (Leaners, Hangers,
   Vegetative/Woody…), exported as a type column. For a load code, is that the same thing as its debris
   type (one setting, picked from the project's debris types), or does a load code have both?

**Agent proposal:** 1 yes. 2 picked once on `-A`; the rest of the chain takes it (one truck, one
load). 3 both flagged: (i) "debris type mismatch (collection Vegetative, disposal C&D)"; (ii)
"service code is for Ceres, truck is certified under TFR". Any other pair of different codes is
flagged "service codes differ", naming both. 4 one setting: a load or haul-out code's type is one of
the project's debris types; a unit rate code's type is its kind of work (Hangers, White Goods…).

> **User, 2026-09-27 (round 16, inline):** 1,2,4 all make sense as the agent proposed for the most
> part, but 3 raises an issue I see now. We do not actually want to confuse the monitor. When they
> scan the barcode to get the truck info that info itself needs to be what we use later to decide
> which rule to apply thus creating the appropriate transaction. If the monitor accidently selected
> the wrong debris type for the wrong code, it will flag. That's too much for them to think about. SO
> we have to find a better way. Popose a way to solve this that works across the rest of our setup
> to make this be how the ticket start behavior works.

*Refs:* ADR-124, ADR-127, ADR-129, ADR-137, ADR-173, ADR-174, ADR-181, ADR-182.

### ✅ Q-180 — Stumps: how they're paid, and how they reach disposal
*(ADR-187)* **Decided:** (1) a stump is **two pieces of paid work**, extraction and debris removal,
each set up with the firm's own service codes and rules (so either per CY or per stump by size);
(2) answered by (1): the later load of stumps to the TDSR is paid as ordinary hauling, on top of the
extraction (agent reading, confirm in Q-183); (3) **under 24 in is not an eligible stump** (flagged,
never refused); no maximum; the formula is the same for every size; (4) **no circumference for
stumps**. Your answer to 4 says the monitor measures **the root ball**, where the guide (ADR-183) has
them measure the stump two feet up: **Q-183**.

The USACE guide settled what's measured (the diameter two feet up) and the rounding (one decimal:
a 30-inch stump is **6.5 CY**). It doesn't say how a stump is paid or what happens to it after.

Example: a 30-inch stump is pulled from a ROW shoulder on Monday. On Thursday it and nine others go to
the TDSR on a certified truck, called at 60% of 40 CY.

1. **Paid how?** (a) per CY from the guide (6.5 CY × the stump rate); (b) per stump, by size range
   (e.g. "24 to 47.9 in: $X each"); (c) either, set on the service code.
   > **User, 2026-09-27 (round 16, inline):** Its 2 parts. Extraction (paid work), debris removal
   > (paid work). We use the config options we have with services codes and rules to handle it. So
   > (c).

2. **The truck to the TDSR.** Is Thursday's load paid as ordinary hauling (60% × 40 CY = 24 CY), on
   top of what the stump tickets paid for pulling the stumps out? Or does the stump's CY already cover
   hauling it, so the load of stumps shouldn't bill again?
   > **User:** first response answers this.

3. **Outside the guide's table** (under 6 in or over 84 in): compute the CY by the same formula, with
   no flag?
   > **User:** Under 24 is not an eligible stump. There is no max. Formula does not change.

4. **Circumference.** As with trees, may the monitor measure the circumference and mark it so (the
   system reads the diameter as circumference ÷ 3.14, then uses the formula)?
   > **User:** Not for extraction no. They must measure the diamamter of the entire rootball area.
   > The objective is to capture the size the roots and dirt being removed so when they backfill it
   > with dirt they are paid properlly since they pay for that dirt.

**Agent proposal:** 1 (c): the code's quantity method is "stump CY" or a count; size ranges are
rules on the diameter (*Measurement BETWEEN 24 and 47.9*). 2 **no proposal**: this is money, and the
guide doesn't say. 3 yes. 4 yes.

> **User:** See my responses.

*Refs:* ADR-165, ADR-177, ADR-178, ADR-183.

### ✅ Q-181 — Drop-off logs: what they hold, and where they live
*(ADR-188)* **Decided:** (1) as proposed; (2) **not** a new site kind: a disposal site gets a
**"takes citizen drop-off"** setting, like the site's other options; (3) as proposed. The other site
options you named (TDSR, "just a staging site", "used for haul out"): **Q-184**.

You said a citizen drop-off is a reference log, like an incident, not a ticket. Three details.

Example: at the fairgrounds, a resident unloads a pickup and a small trailer of branches. Three weeks
later the pile is ground and hauled out to the landfill.

1. **What the log holds.** Fixed: the site, the monitor, the phone's time and GPS, the resident's
   name and the address the debris came from (both optional), up to 8 photos (optional) and notes.
   Anything else ("pickup", "trailer", how many) is the firm's own fields on the drop-off form, the
   way incidents and surveys get firm-added fields. The back office can search logs by site, dates,
   name or address. Right?
   > **User, 2026-09-27 (round 16, inline):** Yes

2. **The site.** The fairgrounds is entered on the project as a disposal site. Is its kind a new
   default "Citizen drop-off" in the firm's site-type list, or is it a TDSR? Either way, the later
   haul-out leaves from it the way it would leave a TDSR.
   > **User:** A new site, with a flag that it takes citizen-drop off. Just like we have options to
   > denote of a site is setup as a TDRS or just a staging site or if it will be used for haul out.

3. **The phone and review.** "Drop-off log" is switched on for a project and a phone like incidents,
   and a log is reviewed on its own (QC Review → QC Approved…) like an incident?
   > **User:** Yes.

**Agent proposal:** 1 yes. 2 a new default kind, "Citizen drop-off", which haul-outs can leave from.
3 yes to both.

*Refs:* ADR-160, ADR-164, ADR-168, ADR-184; `spec/LISTS.md` (disposal site types).

---

## AE. Raised 2026-09-27 (round 17) — follow-ups from round 16

> **Answered 2026-09-27:** Q-183 and Q-184 (ADR-189, ADR-190; follow-ups Q-185, Q-186 in §AF), then
> Q-182 (ADR-191).

Three questions. Each stands alone. **If you only have time for one:** Q-182. It is the proposal you
asked for, and it decides how every ticket starts on the phone.

### ✅ Q-182 — Starting a ticket: the badge decides whose codes the monitor sees
*(ADR-191)* **Decided: mostly (a).** Number, badge, then only the truck's prime's shown codes. Your
change: the monitor sees a short name, never "TFR" or "ROW": each code gets a **name shown to
monitors** that the firm sets ("2A Vegetative", or just "Vegetative"). Points 3–7 as proposed.

You said the monitor shouldn't have to think about whose code to pick: the truck information from
the badge scan should decide which rule applies later. Here is a way to make that how every ticket
starts. Nothing new is set up; it uses what the phone already has.

Example: Bay County ROW has two primes, TFR and Ceres, each with its own copies of the codes:
`2A-TFR ROW Vegetative`, `3A-TFR ROW C&D`, `2A-CRS ROW Vegetative`, `3A-CRS ROW C&D`. A TFR truck,
placard `10090`, is loaded with branches on Mill St and dumped at the TDSR.

**Agent proposal: the badge narrows the list; the monitor only says what they see.**

1. **One start, everywhere.** Take a number, scan the badge, then pick. The badge loads the truck's
   certification, which already says whose truck it is (a sub's truck is certified under its prime).
   The start list then shows only the codes for this ticket type that are "shown to monitors" **and
   belong to that prime**. Truck `10090` shows two choices: `2A-TFR ROW Vegetative` and
   `3A-TFR ROW C&D`. The monitor taps what's in the truck. A Ceres code can't be picked for a TFR
   truck, so the monitor never thinks about contractors.

   > **User, 2026-09-27 (round 17, inline):** The monitor needs to only see 2A-Vegetative or 3A-C&D so
   > it is dead simple.. TDR and ROW distract and in fact we ideally want to be able to scope some of
   > these (when I say we Im thinkinf like a firm would think about things here) such that in cases
   > where we only want to show them Vegetative and C&D that is all they see.

2. **At the tower, the same.** Scan the number, scan the badge, the same two TFR choices; the monitor
   taps what they see in the bed. A code set "requires weight" still makes the phone ask for the
   scale weight.

   > **User:** Same as the first response here.

3. **The same start for every kind of ticket:** haul-outs at both ends (the truck's badge); unit rate
   (the crew badge scanned at the start, kept until the monitor changes crew); split loads (picked
   once on `-A`, after the badge). On a project with one prime nothing looks different.
4. **What's flagged:** only a real disagreement between the two witnesses: the curb picked
   Vegetative and the tower picked C&D, "debris type mismatch (collection Vegetative, disposal C&D)".
   That is two people who saw the same truck disagreeing about what was in it, which is what the two
   halves are for, not a monitor mis-reading a list.
5. **Whose work it is comes from the truck, never the pick.** A rule's *Contractor* reads the prime
   on the truck's certification. One set of rules per prime, as you set them up: *Contractor EQUALS
   TFR* and *Service code EQUALS 2A-TFR* → Create Transaction 1, `2A-TFR`, contract TFR.
6. **When the phone doesn't know the truck** (the truck was keyed in by hand, or a disposal phone's
   truck list is out of date): the phone can't tell whose truck it is, so it shows every shown code,
   grouped under each prime's name. If reconciliation then finds the code belongs to a different
   prime from the truck's certification, it is flagged: "service code 2A-CRS is Ceres's; truck 10090
   is certified under TFR". This is the only way a wrong-contractor code can happen.
7. **One code per debris type per prime on the list.** If a prime has two shown codes for the same
   debris type (say a second `3A-TFR` added for a new rate), the firm turns "shown to monitors" off on
   the one monitors shouldn't start from; rules still pick the transaction (e.g. by *Ticket date*). If
   the halves still end up with two different codes of the same debris type, it's flagged "service
   codes differ (collection …, disposal …)". Rules testing *Service code* on a load read the
   **collection's** code, the way a load's date is its collection's (ADR-161).

**The alternative:** the list shows debris types only (Vegetative, C&D) and the phone chooses the
prime's code for it. On a well set-up project it looks the same to the monitor; the proposal keeps
your round 15 answer that the list is the codes by name.

Which is right: (a) the proposal, (b) the alternative, or (c) something else?

> **User:** Thinking its mostly A,, a tiny bit of b&c.. see my response

*Refs:* ADR-056 (number then badge), ADR-071 (the disposal phone's truck list), ADR-081 and ADR-108
(a rule's contractor is the prime; subs are certified under a prime), ADR-111 (crew badge), ADR-147
(a dated rate change is the firm's own setup; its "two codes may share a name" is corrected by ADR-301), ADR-154 (a keyed-in truck), ADR-174 (one set of rules per prime),
ADR-175, ADR-182, ADR-185, ADR-186.

### ✅ Q-183 — Stumps: what exactly does the monitor measure?
*(ADR-189)* **Decided,** from the snippet of your older work: (1) **the stump, two feet up**: the
formula's root-ball term is what pays for the roots and dirt; (2) **24 in is the stump's diameter
two feet up**; under it, the stump goes out as ordinary vegetative debris; (4) **not as the agent
read it:** a load of stumps is never called; its CY is **the sum of its stumps' CY** from their
extraction measurements. (3) backfill dirt wasn't answered. How a load knows its stumps, and the
rest: **Q-185**.

Two answers point different ways, and it's money, so the agent asks once.

- **The USACE guide (recorded in round 15):** the monitor measures **the stump's diameter two feet
  up**. The formula works the root ball out from it: 3.6 × the diameter across, 31 in deep.
- **This round you said:** "They must measure the diamamter of the entire rootball area… so when
  they backfill it with dirt they are paid properlly", "Under 24 is not an eligible stump", and
  "Formula does not change."

Example: a stump 30 in across two feet up. By the guide, its root ball is 3.6 × 30 = **108 in**
across.

| What the monitor measures | Number typed | Goes into the formula as | CY |
|---|---|---|---|
| (a) the stump, two feet up | 30 in | D = 30 | **6.5** |
| (b) the root ball, across | 108 in | D = 108 ÷ 3.6 = 30 | **6.5** |
| (c) the root ball, used as D unchanged | 108 in | D = 108 | **83.6** |

(c) pays about 13 times too much, so if the root ball is what's measured, the system has to divide
by 3.6 first, as in (b). The formula itself doesn't change either way.

1. **Which is measured:** (a) the stump, (b) the root ball, or both (the stump to decide it's
   eligible, the root ball for the dirt)?
2. **The 24 in minimum:** the stump's diameter (a 24 in stump has a root ball about 86 in across), or
   the root ball's?
3. **Backfill dirt:** is it paid on the same stump CY, through its own service code and rule (e.g.
   Transaction 1 extraction, Transaction 2 backfill, both from one stump ticket)?
4. **A reading to confirm:** from "Its 2 parts… Extraction (paid work), debris removal (paid work)",
   the agent reads that Thursday's load of ten stumps to the TDSR (60% × 40 CY = 24 CY) bills as
   ordinary hauling, on top of what the stump tickets paid for extraction. Right?

**Agent proposal:** 1 and 2 **no proposal**: the guide and your answer differ, and this is money.
3 yes. 4 yes.

> **User, 2026-09-27 (round 17, inline), verbatim:**
>
> Skipping your examples and question 1-4 above this time to prove a snippet from some python code I have
> in another folder (don't try to go find it or anything)
>
> from .stumps import qualifies_for_extraction, stump_cy
>
> ```
> def _stump_volume(
>     collection: _CollectionHalf,
> ) -> tuple[Decimal, int, tuple[str, ...]]:
>     """Cubic yards for a stump haul, from the extraction measurements.
>
>     This is the whole of the stump pipeline's quantity derivation, and there is
>     no load call anywhere in it. Each stump on the trailer carries the diameter
>     measured two feet up when it came out of the ground; the published table's
>     formula turns each one into cubic yards and they are summed. USACE requires
>     the worksheet rather than a visual call, so a monitor is never asked for
>     one and has nowhere to put one.
>     """
>     flags: list[str] = []
>     total = Decimal(0)
>     refs = collection.stumps()
>     if not refs:
>         return Decimal(0), 0, ("capacity_unavailable",)
>     with localcontext() as ctx:
>         ctx.prec = WORK_PREC
>         for ref in refs:
>             result = stump_cy(ref.diameter_in)
>             flags.extend(result.flags)
>             total = +(total + Decimal(result))
>     # One flag per condition, not one per stump.
>     return total, len(refs), tuple(sorted(set(flags)))
> ```
>
> STUMP     the extraction measurements, through the published table's
>               formula. Never a load call, because there is not one to use.
>
> I dropped a folder in development from some older work that has some of this answered
> but dont drift off taking things from the rest of the code and thinking it means we need to make a
> bunch of changes to what we have planned and outlined. Yet if something does stand out, follow up.
>
> I will delete the folder after this round.

*Refs:* ADR-177 (circumference for trees), ADR-178 (the formula, L = 24 in), ADR-183 (the guide),
ADR-187.

### ✅ Q-184 — A disposal site's options: TDSR, staging, haul-out, drop-off
*(ADR-190)* **Decided:** site types are **TDSR/DMS · Final Disposal · Transfer Station · Other**
(no HHW type). Each site has options, picked: **haul-out, citizen drop-off, HHW**. There is **no
separate staging site**. The agent's "Loads dumped here" option isn't taken. What each option does,
and whether a firm can add its own: **Q-186**.

You said a drop-off site is a site "with a flag that it takes citizen-drop off. Just like we have
options to denote of a site is setup as a TDRS or just a staging site or if it will be used for haul
out." Today the docs give a site **one type** from a list (TDSR, FDS, transfer station, HHW, Other),
plus its permit, dates and area. There is no "staging site" or "used for haul-out" option yet, so the
agent wants to get them right.

> **User, 2026-09-27 (round 17, inline):** That list is wrong... The list is to be TDSR/DMS, Final
> Disposal, Transfer Station, other (no HHW) and for each we have the option to denote things like
> haul-out, citizen-drop-off, HHW (this is an) selector option. Does this make sense?

Example: Bay County has three sites. The **Hwy 20 TDSR**, where loads are dumped, ground, then
hauled out. The **fairgrounds**, where residents drop off and the pile is hauled out later. The
**county landfill**, an FDS, where haul-outs end.

1. **What is "just a staging site"** in your setup? For example: loads are dumped there and hauled
   out again without being ground or burned? Anything else different about it?

   > **User:** see above...

2. **Agent proposal:** a site keeps its one type and gets yes/no options, each with a default by type:
   - **"Loads dumped here"**: on for a TDSR and an FDS;
   - **"Haul-outs leave from here"**: on for a TDSR;
   - **"Takes citizen drop-off"**: off unless ticked (the fairgrounds).

   > **User:** See my responses above.

   A staging site would then be a TDSR with its own options set, or a type of its own, depending on
   your answer to 1.

   > **User:** We are not creating a separate "staging site"

   The options decide which sites a phone offers: a haul-out collection phone lists the sites haul-outs
   leave from, a drop-off log lists the drop-off sites. A ticket at a site without the option is
   flagged, never refused (e.g. "haul-out left a site not set for haul-outs"). Right?

*Refs:* ADR-111 (permits), ADR-142 (a site's area), ADR-145 and ADR-173 (sites per project, dates),
ADR-184, ADR-188; `spec/LISTS.md` (disposal site types).

---

## AF. Raised 2026-09-27 (round 18) — follow-ups from round 17

> **Answered 2026-09-27** (ADR-192…194). What they opened is in §AG (Q-187, Q-188).

Two questions. Each stands alone. **Q-182** (how every ticket starts, §AE) is still open too: it had
no answer in the file. **If you only have time for one:** Q-182, then Q-185.

### ✅ Q-185 — A load of stumps: how it knows its stumps
*(ADR-192)* **Decided: all six proposals approved.** The painted stump ticket number, an ordinary
load with quantity "from the stumps", the tower counts and confirms, each stump rounded then added,
backfill its own code and rule, under 24 in flagged. One thing from your older work: **Q-188**.

Your snippet settled the money: a load of stumps is never called. Its cubic yards are the stumps'
own, from the diameter measured two feet up when each came out, added together. What's left is how
the load knows which stumps are on it. Your older work had an answer, and it stood out, so the agent
asks rather than copies it.

Example: on Monday a crew pulls three stumps on Mill St, each on its own stump ticket: 26 in, 33 in
and 41 in across two feet up (4.8, 7.8 and 12.0 CY). On Thursday all three go to the Hwy 20 TDSR on
TFR truck `10090`.

1. **Linking the stumps.** In your older work, the monitor paints an ID on each stump when it's
   pulled and types it on the stump ticket; on Thursday the loading monitor reads each painted ID and
   adds it to the load. **Agent proposal:** paint the **stump ticket's own number** (no new
   identifier). On Thursday, after the badge scan, the monitor adds each stump by typing that number.
   A number that matches no stump ticket, or a stump already on another load, is flagged, never
   refused.
2. **What kind of ticket.** Your older work made a load of stumps its own kind of ticket, the way a
   haul-out is. **Agent proposal:** keep it an **ordinary load** (collection and disposal, one
   number), started from a stump-hauling service code whose quantity is measured **"from the
   stumps"**, a third choice beside "load call" and "scale weight". The tower phone then asks for no
   load call and no weight, as a "requires weight" code already changes what it asks. Or should it
   be its own kind of ticket?
3. **At the tower.** **Agent proposal:** the monitor sees the list of stumps, counts the stumps on
   the truck and confirms they match. A different count, or "don't match", is flagged. Photos per the
   code's setting.
4. **Adding them up.** Round each stump to a tenth first, as the guide's table does, then add
   (4.8 + 7.8 + 12.0 = **24.6 CY**)? Or add the exact figures, then round (**24.7 CY**)?
   **Agent proposal:** each stump rounded, then added (24.6), so the load always equals its stump
   tickets.
5. **Backfill dirt** (question 3 last round, not answered). If a firm pays for backfill, is it its
   own service code and rule on the stump ticket, using the same stump CY (Transaction 1 extraction,
   Transaction 2 backfill)? **Agent proposal:** yes.
6. **A stump ticket under 24 in.** Today it's flagged "not an eligible stump", never refused. Your
   older work voided it automatically. **Agent proposal:** keep the flag; a firm that wants it voided
   adds a rule (*Measurement LESS THAN 24* → Void Ticket).

> **User, 2026-09-27 (round 18, inline):** Approved agent proposals...

*Refs:* ADR-165 (how a code's quantity is measured), ADR-175 ("requires weight"), ADR-178 and
ADR-183 (the formula and rounding), ADR-187, ADR-189; ADR-052 (flag, never block).

### ✅ Q-186 — A disposal site's options: what each one does
*(ADR-193, ADR-194)* **Decided:** (1) "haul-out" means haul-outs leave from the site; a phone shows
only the one site it's set up for; **no flag** for a haul-out from a site not marked. (2) A drop-off
log has the phone's one site. (3) **HHW does nothing yet**; your description of an HHW site is kept
for later. (4) **Firms may add options**; the pattern is written in `spec/LISTS.md`. Setup for one
site: **Q-187**.

You set it: a site's type is TDSR/DMS, Final Disposal, Transfer Station or Other, and each site can
be marked haul-out, citizen drop-off or HHW. That makes sense. The agent wants to get what each
option **does** right.

Example: Bay County has four sites. The **Hwy 20 TDSR/DMS**, marked haul-out. The **fairgrounds**
(Other), marked citizen drop-off and haul-out. The **county landfill** (Final Disposal), with no
options. A **county HHW collection point** (Other), marked HHW.

1. **Haul-out.** Does it mean haul-outs **leave from** this site (the TDSR and the fairgrounds)? A
   haul-out collection phone then lists only those sites.

   > **User, 2026-09-27 (round 18, inline):** (They'd only see the site they are setup for and a
   > monitor cant be in two places at one time)

   A haul-out from a site not marked is flagged "haul-out left a site not set for haul-outs", never refused. Right?

   > **User:** Yes, but they dont need to be flagged like this. Pre loads are common. A truck might load
   > on a Friday and then dump on Monday since the site is closed over the weekend.

2. **Citizen drop-off.** A drop-off log lists only the sites marked for it. Right?

   > **User:** It would only list one site for the work that was done at that site that the one person
   > logged.

3. **HHW.** What does it change? For example: a load or unit rate ticket for HHW dumped at a site not
   marked HHW is flagged? Or is it a label the back office searches and exports by, changing nothing
   else?
   > **User:** nothing for now.. we just want to have it in there so we can extend it... HHW basically
   > has to be broken down into its parts... If you can learn more on it from the files I shared (i
   > haven't removed them yet) on this part, see what you can learn.

4. **More options.** You said "things like". May a firm add options of its own (e.g. "burn site",
   "grinding")?
   > **User:** Ideally yes. If we can make sure the agent knows how this needs to be done on all side,,
   > coding it, maintaining it and being able to discuss the work about it and such as if you needed to
   > teach someone else about it.


**Agent proposal:** 1 and 2 yes. 3 **no proposal**: nothing in the docs says what HHW sites do.
4 yes, as labels to search and export by; only haul-out, citizen drop-off and HHW change what phones
show or what's flagged.

> **User:** An hhw site typically has a trailer that pulls up. They take the items off and prepare them
> for disposal. They they load them onto some other container and dispose them at a site somewhere.
> After the items leave the site the firm is current monitoring (once they prepare it and load it, it
> leaves this current site) the firm will get back a reciept from that company who did the prepartion
> noting they disposed it. This doc is uploaded and saved simliar to a contract (pdf online).

*Refs:* ADR-052 (flag, never block), ADR-145 and ADR-173 (sites per project), ADR-184, ADR-188,
ADR-190; KD-30 (the HHW trail, not yet designed); `spec/LISTS.md` (disposal site types).

---

## AG. Raised 2026-09-27 (round 19) — follow-ups from round 18

> **Answered 2026-09-28** (ADR-195, ADR-196). What they opened is in §AH (Q-189…Q-193).

Two short questions. Each stands alone. **If you only have time for one:** Q-188. It's money.

### ✅ Q-187 — Phones set up for one site
*(ADR-195)* **Decided:** every phone that works **at** a site is set up for that one site: the
tower, the haul-out collection at the TDSR, the haul-out disposal at the FDS, and the drop-off log.
The site fills in on every record; **no start list shows sites**; the monitor picks only the type of
work (the codes by their name shown to monitors). A phone **moves to another site offline**, on the
phone; what it still holds syncs whenever it can and is always received. **Agent readings, to confirm
by correcting them:** setup offers the project's active sites (the options don't narrow the list);
the move takes the master passcode and is recorded, like changing monitor.

You said a monitor at a site only sees the site their phone is set up for: "a monitor cant be in two
places at one time". Today the docs have the tower monitor **pick** the disposal site on each ticket,
so the agent wants to apply your rule everywhere it fits.

Example: Bay County has the Hwy 20 TDSR/DMS (marked haul-out), the fairgrounds (marked citizen
drop-off and haul-out) and the county landfill (Final Disposal). Dana works the Hwy 20 tower on
Monday and the fairgrounds on Tuesday.

1. **Which phones.** Is every phone that works **at** a site set up for that one site: the tower
   (disposal), the haul-out collection at the TDSR, the haul-out disposal at the landfill, and the
   drop-off log? The site then fills in on every ticket, and the monitor never picks one.

   > **User, 2026-09-28 (round 19, inline):** YES.

2. **What setup offers.** Setting up a haul-out collection phone lists only sites marked haul-out;
   a drop-off log phone, only sites marked citizen drop-off; a tower phone, every site on the project.
   Right?

   > **User:** collection has no knowledge about disposal...so a haul out collection wont list any
   > sites, and neither will a drop off log,
   >
   > a disposal phone will not list the site like you are saying here because the monitor phone is
   > already checked into that one site and thus they do not need to keep re-selecting it.
   >
   > the start sequence to select during creation for both collection and disposal is to select the
   > type of work to be done. so when you are doing collection you are selecting the debris to be
   > collected. on disposal what debris to be disposed. same with haul out. and when you keep
   > going-think about white goods and how when a unit rate monitor setup for white goods would select
   > white goods from their list and so on.

3. **Moving to another site.** On Tuesday, Dana's phone changes to the fairgrounds the way a phone
   changes monitor: on the phone, from the project's sites it already holds, with the master
   passcode, and recorded. Or must the phone be set up again (online)?

   > **User:** Dona's phone should be able to do that offline. However consider that this phone would
   > round trip to get synced at the end of work each day (most likely)...and if it had not synced by
   > EOD (whatever was still on the device would have been marked or resolved internally already, but
   > when the data or if the data can ome through we still want it

**Agent proposal:** 1 yes, all four. 2 yes. 3 on the phone with the master passcode, recorded, like
changing monitor; no new setup needed.

*Refs:* ADR-095 and ADR-120 (setup, master passcode, changing monitor), ADR-145 (one phone, one
project), ADR-188, ADR-190, ADR-193; `spec/parts/04-field-capture.md` (the disposal records its site).

### ✅ Q-188 — Stump extraction by the CY, then hauling by the CY: paying twice?
*(ADR-196)* **Decided: no, the agent's reading isn't right.** A stump ticket is paid as the contract
says: in your example, **extraction EACH by the size class** of the diameter two feet up, and **fill
per CY** as transaction #2, with rule tests that the details make sense. The monitor records the
diameter two feet up (FEMA's 24 in test) **and the root ball's diameter**, maybe its depth; the fill
is measured from it. One stump, one ticket, two codes. Your rate sheet is walked line by line in
**`spec/RATE-SHEET.md`**. Open: the stump ticket and the fill formula (**Q-189**), and whether the
load of stumps still bills its CY (**Q-190**).

Your older work had a note on this, and it stood out. Its extraction ticket paid for pulling the
stump and the backfill **by the stump's size range**, and never produced cubic yards: "the cubic yards
arrive later, on the stump haul… Issuing them here would pay for the same material twice."

Today's decisions allow a firm to pay **extraction per CY** (ADR-187) and **backfill from the same
CY** (ADR-192), while the load of stumps also bills that CY (ADR-189).

Example: one 30 in stump, **6.5 CY**. Extraction at $X/CY on Monday pays on 6.5 CY; the load to the
TDSR on Thursday pays hauling on the same 6.5 CY.

| Ticket | What it pays for | Quantity |
|---|---|---|
| Stump ticket (Monday) | extraction, and backfill if the firm pays it | 6.5 CY |
| Load of stumps (Thursday) | hauling | 6.5 CY |

1. Is that right: the two are **different work at different rates** (pulling vs hauling), so the
   same 6.5 CY on both is not double billing? Or should extraction be paid **per stump by size only**,
   never per CY, as in your older work?

**Agent proposal:** none. It's money, and your older work and your answer to Q-180 point different
ways. Either way the setup stays in the firm's codes and rules; the question is only whether a
per-CY extraction code should be allowed at all.

> **User, 2026-09-28 (round 19, inline):** No this is not right. To try to help I have attached Prime
> Contractor Rate Sheet Example.pdf in the development folder. We in fact do need to capture the
> stump diamter 2ft up as previously noted, as that is a FEMA requirement that the stump must be 24
> inches or larger. But we also need to measure the rootball diameter and maybe the height (check
> online)...
>
> Image you are a firm who has been using Open ADMS. You've setup a new project and the contract
> includes stump removal, and there are going to be tickets for that type of work. Using the surveys
> you had field monitors capture details for 20 stumps that were sent for eligiblity reviews. They
> were all approved and now the contractor is going to extract them. The monitor documents the stump
> diameter 2ft up the stump enters that into the ticket...Then they measure the rootball and enter
> that. Because the contract states payment for the stump extraction as EACH based on the size over
> 24 inches, and a separate payment for the backfilled dirt (see example in development now). As a
> firm setting this up you're going to make 2 service codes to handle this and then in the rules the
> backfill dirt will be transaction slot 2 with tests to make sure the info makes sense. Then as this
> firm your field monitors can simply open 1 ticket for a stump, enter what is needed and submit it.
>
> Im not sure what is a better... A specicif "stump removal ticket" type or a unit rate ticket with
> special fields, but given how we plan to make the unit rates across the project it seems to make
> sense to use it for that, but idk.
>
> Also at this point what makes sense is to have to think carefully about the rates on the example
> sheet and cross examine how as a firm you would setup various types of projects and how you would
> need Open ADMS to be able to be configured so the choices it makes avail give you the options
> needed to set things up for the broad scope the rates outline.

*Refs:* ADR-187 (two paid parts), ADR-189 (load of stumps by CY), ADR-192 (backfill from the stump
CY).

---

## AH. Raised 2026-09-28 (round 20) — stumps, and the rate sheet

> **Answered 2026-09-28** (ADR-197…202). Q-191 was answered in round 21 (ADR-202). Q-194
> was withdrawn and deleted at your request. What the answers opened is in §AI (Q-195…Q-197).

Five questions. Each stands alone. Q-189 and Q-190 finish stumps; Q-191…Q-193 come from walking your
Alachua County / Ceres rate sheet line by line, as a firm setting it up (`spec/RATE-SHEET.md`, a
draft for you to correct). Most of the sheet already works with codes and rules; these are the parts
that don't. **If you only have time for one:** Q-190. It's money.

### ✅ Q-189 — The stump ticket: what the monitor records, and how the fill is measured
*(ADR-198)* **Decided:** a unit rate ticket, kind of work **Stumps** (built in). The monitor records
the diameter two feet up, the root ball's diameter and "half or more exposed"; **no hole depth**. Fill
CY = the root ball as a cylinder **31 in deep** (the USACE guide's root-ball height, so your condition
holds), rounded half up to a tenth: 96 in → **4.8 CY**. A rule pays from the stump (1 each) or the
fill CY, never the stump CY. **No new rule criteria.** The survey number is picked or typed; none is
flagged. Open: how the fill rule knows when to pay without the criteria, and whether 31 in is a
setting (**Q-195**).

You said: one ticket per stump; the monitor records the stump's diameter two feet up and the root
ball's diameter, maybe its height; extraction is paid each by size, the fill per CY.

**What the agent found online (FEMA, IS-1000 Category A, "Stump Removal"):** FEMA pays per stump
only when the stump is **2 ft or more across, measured 2 ft above the ground**, and extraction is
part of the job. A stump with **half or more of its root ball exposed** may be eligible for removal
and filling the hole. The per-stump cost is meant to cover "extraction, transport, disposal, and
filling the root-ball hole". Smaller stumps are paid by volume or weight. **Nothing the agent found
says how the fill is measured.**

Example: a 30 in stump on Mill St. Its root ball is 96 in across and the hole is 30 in deep. Your
sheet pays fill at $24 per CY.

| Way to work out the fill | Fill CY | At $24 |
|---|---|---|
| (a) root ball across **and** hole depth measured, as a cylinder: 0.7854 × 96² × 30 ÷ 46,656 = 4.654 | **4.7** | $112.80 |
| (b) root ball across measured, depth fixed at the USACE guide's 31 in: 4.809 | **4.8** | $115.20 |
| (c) nothing measured, the USACE guide's root ball (3.6 × 30 = 108 in across, 31 in deep): 6.087 | **6.1** | $146.40 |

> **User, 2026-09-28 (round 20, inline):** (b) makes the most sense, especially if I overlooked a
> detail the USACE put out stating a standard 31 in depth. If that is the case then we absolutely
> want to use that as our standard built into Open ADMS.

1. **What kind of ticket?** **Agent proposal:** a **unit rate ticket** whose kind of work is
   **Stumps**, made a built-in kind of work (a fixed key, like the built-in site options, ADR-194)
   so the phone knows to show the stump screen. Unit rate already gives one ticket, one picked code,
   a measurement, photos and a printed ticket; a new ticket type would need its own number series,
   rule target, screens and exports for no gain.
2. **What the stump screen records.** **Agent proposal:** the diameter two feet up (the ticket's
   *Measurement*, FEMA's 24 in test), the root ball's diameter, the hole's depth, and "half or more
   of the root ball exposed" (yes/no), all in inches; photos per the code. Anything to add or drop?
3. **How the fill CY is worked out:** (a), (b), (c), or your contract's own way? **Agent proposal:**
   (a), rounded half up to a tenth like the stump CY, if a monitor can measure the depth.
4. **What a rule can pay from on a stump ticket.** **Agent proposal:** *Create Transaction* can
   take its quantity from **the stump (1 each)** or **the fill CY**, and **never the stump's CY**,
   which belongs to the load of stumps (Q-190), so the same CY can't be paid twice. New rule
   criteria: *Root-ball diameter*, *Hole depth*, *Fill CY*, *Root ball half exposed*. Your example
   becomes: #1 `H31-CRS` when *Measurement AT LEAST 24* and *LESS THAN 48*; #2 `I33-CRS`, quantity
   from the fill CY, when *Root ball half exposed = Yes* and *Root-ball diameter MORE THAN* the
   stump's. Is that the kind of "tests to make sure the info makes sense" you meant?
5. **The survey.** Your 20 stumps were surveyed and approved before extraction. Should the stump
   ticket point at its survey? **Agent proposal:** the monitor picks or types the survey's number
   when starting the ticket; a stump ticket with none is flagged, never refused.

   > **User:**
   > 1. agree
   > 2. see my response about (b).
   > 3. I think (b) makes the most sense
   > 4. All makes sense until we get to add'l new rule criteron as that seems to add complexity
   > 5. agree

*Refs:* ADR-124, ADR-127 (a unit rate code names its kind of work), ADR-177, ADR-178, ADR-183 (the
stump CY), ADR-187, ADR-189, ADR-192, ADR-194, ADR-196; `spec/RATE-SHEET.md` (lines H 29–32, I 33);
FEMA IS-1000, Category A: Stump Removal (emilms.fema.gov/is_1000/groups/84.html).

### ✅ Q-190 — A stump paid by the each, then its load paid by the CY: is hauling paid twice?
*(ADR-199, ADR-197)* **Decided:** it depends on the contract, and **the firm's setup decides**. This
contract pays hauling separately, so the load of stumps bills its CY through the firm's rules; a
contract that doesn't would use a $0 code. Nothing new is built. You stressed the principle behind it:
the firm configures, Open ADMS hardcodes as little as possible and ships defaults tailored to debris
work (ADR-197, now in the agents' operating rules).

FEMA says a per-stump price is meant to cover **extraction, transport, disposal and filling the
hole**. Your rate sheet pays stumps each (lines 29–32) and fill per CY (line 33), and has no line for
hauling stumps. Today a load of stumps to the TDSR bills **the sum of its stumps' CY** (ADR-189,
ADR-192).

Example: Monday, three stumps pulled on Mill St, 26, 33 and 41 in across two feet up (4.8, 7.8 and
12.0 CY). Thursday, all three go to the Hwy 20 TDSR on truck `10090`.

| Ticket | What it pays | Amount |
|---|---|---|
| Three stump tickets (Monday) | 3 × $300 (24–48 in), plus fill | $900 + fill |
| Load of stumps (Thursday) | 24.6 CY × $8.85 (line 1, 0–15 miles) | $217.71 |

1. Does the load of stumps still bill its CY? (a) **Yes**, the contract pays hauling separately;
   (b) **No**, it's recorded (the tower counts the stumps, the trail stays) at a **$0 code**, because
   the per-stump price covers transport; (c) **It depends on the contract**, so the firm's rules
   decide: a hauling code where the contract pays it, a $0 code where it doesn't.

   > **User, 2026-09-28 (round 20, inline):** (a) Yes the contract pays hauling separately, but it
   > does depend on the contract and the rules the firm sets up ultimately decides things. I want to
   > stress that last line again and again...
   >
   > What the firm using Open ADMS sets up, ultimately decides how things play out. The agents goal
   > needs to be to hardcode as little as possible to give the end user (a firm, a non profit,
   > whoever) the flexiblilty and configuration. The system should have default setup that are
   > tailored to debris removal monitoring work, which is why we are doing all of these questions back
   > and forth to build out your complete understanding of what an ADMS is, how it all works, what it
   > need to be making and so on.
   >
   > So agents have to be able to understand this position too. To understand clearly that a firm or
   > someone else is going to be the one setting things up to their own liking wtih a variety of
   > mission work and so on that they can configure/cusomtize to their needs.

**Agent proposal:** none on the money. On the mechanism: (c) needs nothing new, since rules already
choose the code and a $0 code already exists (ADR-128). Which does this contract mean?

> **User:** See my notes above...

*Refs:* ADR-128 ($0 code), ADR-189, ADR-192 (a load of stumps), ADR-196; `spec/RATE-SHEET.md`.

### ✅ Q-191 — One line priced per CY and per ton: how does a project choose?
*(ADR-202)* **Decided:** neither choice matters to Open ADMS. A contract almost always prices a line
both per CY and per ton, so the prime can later work with various landfills; the firm sets up the
prices it needs as codes, and its own setup decides which one a load bills at. Nothing new is built.
Read a rate sheet as a set of choices the contract allows, not one price per line to pin down.

Every vegetative and C&D line on the sheet has **both** a price per CY and a price per ton (line 1:
$8.85 per CY or $88 per ton). Today a code measures its quantity one way: capacity × load call, or a
scale weight ("requires weight", ADR-165, ADR-175).

Example: truck `10090` (40 CY) called at 75% is 30 CY: 30 × $8.85 = **$265.50**. The same load
weighed at 3.0 tons: 3.0 × $88 = **$264.00**.

1. Who chooses CY or ton, and when? (a) **the project**: the county picks one for the whole
   mission; (b) **the site**: loads dumped where there's a scale go by the ton, the rest by CY; (c)
   **the load**, some other way.

**Agent proposal:** if (b), the tower phone is set up for one site (ADR-195), so a site that weighs
loads asks for the weight on every load and the rules pick the per-ton code by *Disposal site*. If
(a), the firm simply enters only one of the two prices. No proposal on which one is right.

> **User, 2026-09-28 (round 21, inline):** Neither of these choices matter. The option on which rate to use is setup by the firm using Open ADMS
> based on the agreed contract pricing. Contracts alomst always have a per CY and per TON rate schedule
> like this which allows options later for the Prime to work with various landfills. Agents must understand
> this aspect of contracts to understand how a firm is thinking when setting up a project. This is another
> example of you seeing details and trying to smash them together vs thinking more broadly about how
> the contract is laid out with choices on what to charge based on more choices.

*Refs:* ADR-165, ADR-175 (weight instead of a load call), ADR-195; `spec/RATE-SHEET.md` (vegetative
1–24, C&D 1–10).

### ✅ Q-192 — White goods priced by where they go and how far
*(ADR-201)* **Decided in part:** (b), as the firm sets it up, and rare: a unit rate white goods ticket
at the curb (freon extraction when needed), then a collection ticket when they're loaded for the other
site; a white goods debris type, a code with it and a rule by distance; the other site added as a
disposal site with **"staging"** checked. **Site options exist to tell the system how to handle
tickets at the site**, so the engine never guesses. Your answer stops mid-sentence ("the firm was able
to"); the rest is **Q-196**, and what each site option does is **Q-197**.

The sheet pays white goods **$40 each to the DDMS**, **$40 each to the county transfer station**, and
**$50 to $95 each to a site outside the county**, by miles (lines 1–7). A white goods ticket today is
a unit rate ticket filled in at the curb: it counts the items but doesn't know where they went, and
only loads and haul-outs have mileage (Q-102).

Example: six fridges picked up on Oak Ave go to a white goods site 40 miles away, outside the county:
6 × $65 = **$390**. To the DDMS they'd be 6 × $40 = **$240**.

1. How does the ticket learn where they went? (a) **setup**: each project's white goods go one known
   way, so the phone is set up with that code; (b) **they ride a load**: the white goods travel on a
   truck with a collection and a disposal, and the load's site and mileage pick the price, counted
   each from the items; (c) another way you use.

   > **User, 2026-09-28 (round 20, inline):** Typically a firm would setup (b) in this case, and
   > honestly it is very rare to see this. But yes in this case the monitor would make a unit rate
   > ticket for the fridges (following freon extraction processes if needed too). And then when they
   > are loaded to be hauled to the "other site" they are given a collection ticket. The firm would
   > setup the "debris types" with a special debris class. I think in previous notes we might have
   > stuck that out from the legacy design. Maybe now we can see a need to have it? Because with that
   > special class the firm is able to define "white goods debris" and then create a service code with
   > that new type as an option, which later they are able to make a rule for that gets a distance.
   > They would add a disposal site. Say they called it, "White goods outside county DMS" then check the box marking it a
   > "staging site". Because this site wont require a load call, the firm was able to set this 
   option when setting up the project.
   >
   > so in the option when you add a dispoal site right.. we already have things setup but they need
   > to be right.. the point of selecting something like "dispsoal", "haul out", "staging",
   > "drop-off" is to make the system aware of how to handle tickets that are processed at the site.
   > Without that info the reconcile engine is doing to much guessing to figure things out. And the
   > other parts of the system dont link the right way.

**Agent proposal:** none. (a) is simplest but can't price lines 3–7 by miles; (b) prices them but
adds a load to every white goods pickup.

   > **User:** see my notes above.

*Refs:* ADR-126, ADR-131 (white goods pay per item removed), Q-102 (distance only on loads and
haul-outs); `spec/RATE-SHEET.md` (white goods).

### ✅ Q-193 — Demolition by the square foot
*(ADR-200)* **Decided: no.** Demolition is ordinary debris work: the structure comes down and its
debris is removed and billed by the CY like any other ticketed work, on a project the firm names to
match the contract. No demolition kind of work, no square-foot unit.

The sheet pays to **demolish and secure** a structure **per square foot**: single story frame $6.50,
two story frame $7.50, single story block $9.00, two story block $10.00, and $12.00 for each story
from the third up (lines 1–5). Open ADMS has no demolition work and no square-foot unit: its billing
units are fixed in code (CY, ton, each, pound, crew time, TBN).

Example: a two-story frame house with a 40 × 30 ft footprint. Is it 1,200 sq ft × $7.50 = **$9,000**,
or both floors, 2,400 sq ft × $7.50 = **$18,000**?

1. Is demolition work Open ADMS should monitor and price? If not, the rest doesn't matter.
2. If yes: a unit rate kind of work "Demolition" whose screen records the construction (frame or
   block), the stories and the square feet. Does the monitor measure the square feet on site, or do
   they come from the parcel records?
3. Which square feet: the footprint, or every floor (the example)?

**Agent proposal:** none until 1. A square-foot unit would be a new built-in billing unit, a code
change with an ADR. The debris itself goes out as ordinary C&D loads.

> **User, 2026-09-28 (round 20, inline):** No. Im not even sure why you asked this. This is
> demolition work for debris removal. They knock down the structure and remove the debris as CY, just
> like any other ticketed work. That is it. See how flexible Open ADMS is to handle various types of
> work?
>
> Create a project, name things in ways the match the contract and document the work. QC it up and
> done.

*Refs:* ADR-148 (a project per kind of work), `spec/LISTS.md` (billing units fixed in code);
`spec/RATE-SHEET.md` (demolition).

---

## AI. Raised 2026-09-28 (round 21) — follow-ups from round 20

> **Answered 2026-09-28** (ADR-203…205), with Q-191 (ADR-202). Nothing in this round is still open.

Three short questions, and **Q-191** (per CY or per ton) is still waiting from round 20. Each stands
alone. The agent kept to what your answers left open and proposes only what the firm's own setup
can't already do (ADR-197).

### ✅ Q-195 — Stump fill: how the fill rule knows when to pay, and is 31 in a setting?
*(ADR-203)* **Decided, as proposed:** the fill is one ordinary rule (*Service code = the stump code* →
*Create Transaction #2*, quantity from the fill CY); two built-in stump checks, each switched on or off
per project; a blank root ball is flagged when the code requires the measurement; the 31 in is a
project setting that starts at 31 in.

You approved the stump ticket (the diameter two feet up, the root ball's diameter, and "half or more
of the root ball exposed", yes/no) and the fill as the root ball 31 in deep. You turned down new rule
criteria for the root ball, which were how the agent's example decided when to pay the fill.

Example, on the Alachua / Ceres sheet: four stumps on Mill St, each 30 in two feet up.

| Stump | Root ball | Half exposed | Fill CY | What should happen |
|---|---|---|---|---|
| 1 | 96 in | Yes | 4.8 | #1 `H31-CRS` $300, #2 `I33-CRS` 4.8 × $24 = $115.20 |
| 2 | 20 in (a typo? it's smaller than the stump) | Yes | 0.2 | ? |
| 3 | 96 in | **No** | 4.8 | ? (FEMA: fill may be eligible only when half or more is exposed) |
| 4 | left blank | Yes | none | ? |

1. **The fill rule.** **Agent proposal:** one ordinary rule, *Service code = the stump code* → *Create
   Transaction #2* `I33-CRS`, quantity from the fill CY. It runs on every stump ticket, so stumps 1–3
   all get a fill line. Stump 4 has no fill CY, so no fill line is created.
2. **"Tests to make sure the info makes sense"**, without criteria. **Agent proposal:** two built-in
   flags on a stump ticket, each switched on or off by the firm per project (like the load-call flags):
   "Ticket 20502: root ball (20 in) is not wider than the stump (30 in). Flagged for review." and
   "Ticket 20503: fill paid, but the root ball is not half exposed. Flagged for review." Both still
   bill; a reviewer corrects, accepts the flag or voids. Stump 4, blank, is flagged "no root-ball
   diameter" when the stump code's photos-and-measurements settings say it's required.
3. **The 31 in.** It is the USACE Stump Conversion Guide's root-ball height, so it's the built-in
   standard. **Agent proposal:** a project setting that starts at 31 in and that a firm can change for a
   contract that says otherwise, like the 200 m site circle. Or should it be fixed at 31 in?

   > **User, 2026-09-28 (round 21, inline):** All agent poposals here make sense. APPROVED.

*Refs:* ADR-052 (flag, never block), ADR-142, ADR-157, ADR-164 (settings a firm can change), ADR-166
(accepting a flag), ADR-178, ADR-183 (the USACE guide's 31 in), ADR-197, ADR-198; `spec/RATE-SHEET.md`
(lines H 29–32, I 33).

### ✅ Q-196 — White goods to a site outside the county: the rest of your answer
*(ADR-204)* **Decided:** the sentence was finished in your Q-192 answer ("the firm was able to set this
option when setting up the project"). The fridges are paid **once, on the load**: `54A` 6 × $65, the
rate reconciliation picks from the load's mileage (not $40 at the curb plus $65); the count comes from
the white goods ticket the load carries. "Special debris class" is a debris type the firm adds.

Your answer stops mid-sentence: "They would add a disposal site "White goods outside county DMS" and
check the box marking it a "staging site". Because this site wont require a load call, the firm was
able to". The agent hasn't guessed the rest.

Example: six fridges on Oak Ave. The white goods monitor writes unit rate ticket **20417** (six
fridges, two freon extractions). The fridges go onto truck `10090`, collection ticket **30551**, debris
type White Goods, and are dumped at "White goods outside county DMS", 40 road miles away. The sheet
pays $40 each to the DDMS, or $65 each to this site (lines 1 and 3–7).

1. **Please finish the sentence.** What was the firm able to do because the site needs no load call?
2. **What pays what?** (a) ticket 20417 pays `54A` 6 × $40 at the curb and the load pays the distance
   line 6 × $65 on top; (b) ticket 20417 pays only the freon (the pickup is in the $65, which the load
   pays); (c) the firm's rules decide per contract. The agent reads it as (c), set up the way you
   described, and only needs to know **where the load's count of 6 comes from**. **Agent proposal:**
   the same way as a load of stumps: the loading monitor adds the white goods ticket (20417) to the
   collection by its number, the tower counts and confirms, and the load's quantity is the items on
   the tickets it carries. No load call, no weight.

   > **User, 2026-09-28 (round 21, inline):** 54A pays $65 6 times for the 6 friges because they travelled N distance and the $65 rate is what reconcile
   > captured based on the mileage.

3. **"A special debris class."** (a) **a debris type the firm adds**, "White Goods", exactly as a firm
   adds Marine-Vegetative today; the rule criterion called *Debris class* already tests it; or (b) a
   **grouping above debris types** from the legacy design, e.g. a class "White Goods" holding the types
   Fridge, Washer, Dryer. **Agent proposal:** (a), since it needs nothing new. Which did you mean?

   > **User, 2026-09-28 (round 21, inline):** (a) I meant A, my goal explaining is to clarify for an agent to understand things enough to do it on its own

*Refs:* ADR-074 (debris types a firm adds), ADR-126, ADR-131 (white goods per item removed), ADR-192
(a load of stumps), ADR-197, ADR-201; `spec/RATE-SHEET.md` (white goods).

### ✅ Q-197 — What each site option tells the system
*(ADR-205)* **Decided:** the five built-in options below are the list, each line as written. A ticket
at a site without the matching option **is** flagged, never refused: tickets never say where debris is
headed, the system doesn't guess ahead, it checks that the debris was allowed to go where it went. Only
a haul-out from a prior date (a preload) is not flagged by default. Master setup can set a phone up for
any work on the project, and its monitor then has access only to that work. *Agent reading, to
confirm:* setup lists every active site for any work (nothing hidden); a phone set up at a site
without the matching option still works, and its tickets are flagged.

You said site options exist "to make the system aware of how to handle tickets that are processed at
the site", and named **disposal, haul out, staging, drop-off**. Today a site has a type (TDSR/DMS,
Final Disposal, Transfer Station, Other) and built-in options (haul-out, citizen drop-off, HHW), and
the docs say the options change almost nothing and never flag.


Example: Bay County's Hwy 20 TDSR/DMS takes loads and haul-outs leave from it; the fairgrounds take
citizen drop-off; "White goods outside county DMS" takes white goods loads only.

**Agent proposal**, for you to correct line by line:

| Option (built in) | What it tells the system |
|---|---|
| **Disposal** | Loads end here. Tower phones can be set up for it, and a load ending here is judged by a load call (or a weight, or "from the stumps", as its code says) |
| **Haul-out** | Haul-outs leave from here. Haul-out collection phones can be set up for it; a haul-out's From site |
| **Staging** | Loads end here **without a load call**; the quantity comes from the tickets the load carries (your sentence stopped here, Q-196) |
| **Citizen drop-off** | Drop-off log phones can be set up for it |
| **HHW** | Nothing yet, kept to extend later (as decided) |

1. Is that the full list of built-in options, and is each line right? 

   > **User, 2026-09-28 (round 21, inline):** YES

2. Should setup then offer only the sites with the matching option (a tower phone lists only
   "Disposal" sites)? Today it offers every active site. 

   > **User, 2026-09-28 (round 21, inline):** Master setup? That should allow the master
   > user to fully setup the phone for any project and thus any work on that given project must be
   > able to be setup to a given monitor who only has access to that work.

3. When a ticket ends at a site without the matching option (a load dumped at a haul-out-only site),
   is it flagged? You said earlier a haul-out from a site not marked haul-out must **not** be flagged,
   because preloads are common.

   > **User, 2026-09-28 (round 21, inline):** I said a haul-out from a prior date must not be flagged by default. If I wrote that a haul out ticket from a site
   > not marked to accept haul outs - that is a mistake. I remember clarifying that a ticket coming from collection
   > does not indicate where it is headed, and that might have confused you. Technically you can get an idea of where
   > the debris should go. Say you have a project with only 1 disposal site. Or a project with only 1 veg site. And the
   > load is a veg load. The monitor themselves and anyone on the project basically knows where the debris is going to end
   > up, or rather where it should end up. But they don't mark that on the ticket. They mark what the work being done is. It
   > is the hualers job to take it where it needs to go next, not our job to mark that for them. But it is our (the firms)
   > job to make sure the data collected reads back to match the contract so their work is easy to read, and accurate. Hence
   > why there are lots of ways to configure the backend.
   >
   > So when the monitor closes out the collection ticket. Or when haul out collection closes a ticket with a load call. Neither side
   > needs to say where the debris head heading and the system doesn't try to guess ahead. The system simply verifies that the
   > debris was allowed to go where it went and so on to make sure things all make sense. That is what the systems job is. Take
   > configuration details and give back results. 

*Refs:* ADR-190, ADR-193, ADR-194 (built-in values plus the firm's own), ADR-195 (phones set up for one
site), ADR-201; `spec/LISTS.md` (site options).

## AJ. Raised 2026-09-28 (round 22) — the legacy screens: Services, debris classes, sites

> **Answered 2026-09-28** (ADR-212…216), inline below, in your words. What the answers opened, and
> the agent's proposals you asked for, are in §AK (Q-204…Q-208).

Your round 22 answers are recorded as ADR-206…211: **Services** hold several primes' rates (206);
**the monitor picks by name, never a code** (207); **mileage** ends at the site's own GPS (208); **badge
first, number last** with re-entry (209); **measure min/max and the eligibility flag** (210);
**Document Format = Form**, and Special Class back (211). These six questions are what those answers
leave open. Each stands alone.

### ✅ Q-198 — One Service, several primes' rates: which rate does a transaction take?
*(ADR-212)* **Decided, as proposed:** the rate of the named contract's prime; a truck of another prime
is priced at that rate and flagged; no rate for the prime → a $0 line, flagged.

Now one Service holds a rate for each prime, and a rule's *Create Transaction* still names a contract
(ADR-174, ADR-206).

Example: Service `V1` "Vegetative 0–15 mi" has **Ceres $8.85** and **TFR $9.10**. The project has two
contracts, "Ceres – Alachua" and "TFR – Alachua". Rule: *Contractor = Ceres*, *Debris class =
Vegetative*, *Mileage* 0–15 → *Create Transaction 1*, Service `V1`, contract "Ceres – Alachua". Ceres
truck 10090 brings 30 CY: 30 × $8.85 = **$265.50**.

1. **Agent proposal:** the transaction takes the Service's rate for **the prime of the contract the
   action names** (here Ceres, $8.85).
2. A rule written without *Contractor = Ceres* names Ceres's contract but also matches a **TFR** truck.
   **Agent proposal:** the transaction is still made, at Ceres's rate, and flagged: "Ticket 30551: TFR
   truck priced on a Ceres contract. Flagged for review."
3. A Service with **no rate for that prime** (TFR's rate never entered). **Agent proposal:** the line is
   written at $0 and flagged "Service V1 has no rate for TFR", like a code waiting on a price (TBN).

   1-3 are right given the scenario. Id approve that workthrough!

*Refs:* ADR-054 (superseded), ADR-081, ADR-146, ADR-174, ADR-186, ADR-206; `spec/RULES.md` §5.

### ✅ Q-199 — What the monitor's list shows, and which Services are on it
*(ADR-213)* **Decided:** the list shows each Classification once; the phone works out the payable
Service from the measurement and the Services' bands (min/max), prints it on the receipt, and
reconciliation matches rules on it. What a Classification holds (your A-or-B): **Q-204**; the band
details: **Q-205**.

You said the monitor sees "the service name, not the code", and that the **Classification** "is what
maps over to the name shown on the field app in the list the monitor sees" (ADR-207).

Example, from the Ceres sheet: tree removal by **climbing** has **four prices by diameter** (lines A
1–4). A firm could set that up two ways:

- **(a)** Four Services, A1…A4, all with the Classification "Tree, climbing". The phone shows "Tree,
  climbing" **once**. But the ticket has to record one Service: which of the four, and when?

  In a rule we have the measurement.. Test if it is greater than or less than 4 different ways in 4 
  separate rules. 

  Then the monitor is making tickets for the service "Tree climbing" and when we a rule matches "measurement"
  greater than or less than we are able to generate the right transaction beause the rule processed it. 

- **(b)** **One** Service "Tree, climbing" that the monitor picks (minimum 6 in, so a smaller tree is
  flagged, ADR-210), plus four priced Services A1…A4 that only rules add, by *Measurement*. The four
  must then stay **off** the phone.

1. Which is it, (a) or (b), or something else? 

   (b) as my comments also align with...

2. How does the phone know which Services to list? (In (b), what keeps A1…A4 off it?)

   (b) is the right way...what keeps it off is there is no need for it right? The project has
   N services setup...The project also has N Service "Classifications". So you have all of these
   customized "classifications right"... imagine what those are given what you know thus far.. you 
   are likely partially right... When a phone is setup for (LHS - leaning trees, hangers, stumps), 
   the monitor only sees what you know they see (Leaner, Hanger, Stump) in a list of options. They 
   measure it. When they complete the ticket they print out a reciept and that shows the work details. 
   It also shows the payable unit details, which means the field-app (in the background) was able to 
   take the measurement the monitor provided and decide the right code. And that is where the measuremnet
   max/min you saw on the legacy Service. A firm can set the upper and lower band right there in the Service
   thereby creating a data that is able to be pushed the device on sync. 

   Say Monintor#321 submits TK#123 for a 4.5" Hanger....

   After they submit it the reconcile engine gets the measurement and service which it is able to use to 
   find a matching rule for unit rate ticket along with contractor and other details as needed to ensure
   it is a match (as deemed needed by the firm setting things up themselves). 

3. When two Services share a Classification, does the list show the Classification once, or each
   Service's name?

   See comments above.. 

4. The lost "Service Classifications" screen held "a list of the classifications in the system with
   their project. Among other details." Did any of those details change what the system does (not
   only labels)?

   Yes... Think about it... As we have gone through things we have tried to find ways to make sense out of 
   how Services (what I kept calling service codes) somehow contained a rate, and then in a rule we had various
   checks that then in a given order would create a transaction linking a rate to a contract for billable work. 
   And while that all is close to lining up, we have had a few details we've been circling back around again
   and again... But what exactly would a Service Classification change or be able to individually carry with or
   or otherwise identify is a unique variable (imagine the options on the service code )...

   In most cases we wouldn't even need the measurement min/max field (which the Legacy app incorrectly implemented)
   In fact in the legacy app almost every Service Classification is just a label and most of the time the description
   for the Service matches the label, and that is what is shown as the Service Description in data exports along with 
   a column for the service code (typically just a 1-2 digit number and 1-2 alphanumerical characters)but there are a 
   few specific classifications in the legacy app that do something like this. For example in the legacy app when we 
   select a service that is always used only for loads, and when I say loads I specifically mean any classification that
   would get a ticket for debris hauled. So because we cannot see the page for classification creation, what do you think? In the Legacy app: A) creating a classification includes selecting either or both the Document Format and the Debris Class. B) just another label that changed nothing or created no other reference to make things make sense between this option, the Service
   it defines the class for, or the service code that we know will later pull up through a rule that creates a tranasction when all
   the right variables are met? 


*Refs:* ADR-124, ADR-173 (3), ADR-191 (superseded), ADR-207, ADR-210; `spec/RATE-SHEET.md` (tree lines).

   

### ✅ Q-200 — A load no longer carries a Service: where do its settings live?
*(ADR-213)* **Decided:** both halves pick the debris class, and a difference is flagged. The settings
stay on the Service; the phone knows the Service though the monitor doesn't pick it. How a debris
class leads to its Services: **Q-204**.

A load's monitors now pick a **debris class**, and nobody on a load picks a Service (ADR-207). Until
now the load's code told the phones three things:

1. **"Requires weight":** the tower enters the scale weight **instead of** a load call (ADR-165).
2. **"From the stumps":** a load of stumps is counted from the stump tickets it carries, never called
   (ADR-192); white goods riding a load work the same way (ADR-204).
3. **Photos and GPS required** for each half (ADR-157).

Example: truck 10090 arrives at the TDSR with **three stumps** (tickets 20501–20503). How does the
tower phone know to count the stumps instead of asking for a load call? And at a landfill with a
scale, how does it know to ask for the weight?

Where should each live? (a) on the **debris class** the collection monitor picked; (b) on the
**disposal site** (e.g. a site with a scale asks for weight); (c) on the **form**. The legacy app had
**Stump Collection** as its own entry form (the Entry Forms ribbon), which would make a load of stumps
(c). Or (d), what legacy did.

Also: **does the tower monitor pick the debris class too**, so the halves are compared and a
difference is flagged ("Ticket 104499: debris type mismatch. Flagged for review."), as today?
**Agent reading:** yes, both halves pick it. (Agent reading here is right)

But on 1-3 above the thinking is wrong because the phone will know the service code, but the monitor isn't picking it like 
we had mapped earlier.. See other notes in questions above. See how that changes this. If it answers
up here as needed.



*Refs:* ADR-157, ADR-165, ADR-175, ADR-192, ADR-204, ADR-207, ADR-211.

### ✅ Q-201 — Debris classes on a form: how mulch and ash are told apart
*(ADR-214)* **Decided:** Mulch and Ash are two classes on the haul-out form; Is Reduced is a helper
for rules, reports and checks; Reduction Method is a firm list; Is Disabled as read. *To confirm:* a
*Reduced* criterion, and a setup warning (not a refusal) for an unreduced class on the haul-out form.

From the legacy screen: on a project, each debris class is **added to a form** (on "BDR Load Ticket":
Marine based – C&D, Marine based – Veg/Woody), with **Is Reduced**, **Reduction Method** and **Is
Disabled**. The monitor's list on that form is the project's classes for it. The agent's reading: the
firm keeps one list of debris classes (the Project Setup menu's "Debris Class"), and each project adds
the ones it uses **to each form**.

Example: Alachua's TDSR grinds vegetative debris and also burns some. A haul-out truck leaves with
**ash**. The contract pays **mulch** (lines 12–15) and **ash** (lines 17–24) differently, so a rule has
to tell them apart.

1. On the **haul-out form**, does the firm add Vegetative/Woody **twice**, once Is Reduced with method
   Grinding and once with method Incineration, so the haul-out monitor picks one? Or does it add two
   classes named "Mulch" and "Ash"?

   If I was that firm I would add two classes named Mulch and Ash as those are likely different contracted
   worked items. 

2. Does **Is Reduced** change anything the system does (for example, flag an unreduced class on a
   haul-out), or does it only help rules and reports tell loads apart?

   It tells the system that the debris class is already reduced. Used for rules and reports, but it also
   helps like you said to do things like flag a load of vegetative not reduced that ends up at a haul out
   collection somehow or otherwise scanned as a load that should be reduced but isn't. Shouldn't even accept
   in our system. A firm shouldn't make that kinda of mistake. So is reduced is likely a helper. 

3. Is **Reduction Method** a list the firm can add to (grinding, incineration, compaction…)?

   Yes

4. **Is Disabled**: the class stops showing on phones for that form, and tickets that already have it
   keep it? *(agent reading)*

   Yes

*Refs:* ADR-074 (debris types, selected per project), ADR-204, ADR-207, ADR-211; `spec/RATE-SHEET.md`
(lines 11–24).

### ✅ Q-202 — Site options: the legacy five instead of ours?
*(ADR-215)* **Decided:** a Location Type plus Allow Collection, Allow Disposal, Disposal Fee and
Ineligible replace our options; a Disposal Fee site flags a load without a disposal fee line; an
Ineligible site's loads are flagged and still bill. How a line is known to be a disposal fee:
**Q-206**; the Critical box: **Q-207**.

Legacy site (a "Location"): a **Location Type** plus five boxes, **Allow Collection · Allow Disposal
· Disposal Fee · Ineligible · Critical**. Ours (ADR-205): Disposal · Haul-out · Staging · Citizen
drop-off · HHW. You asked the agent to work out why the legacy set is more flexible.

**The agent's reading.** Legacy's boxes are **facts about the site** that hold for every ticket type;
ours are named after **activities**, and each one needed its own engine behaviour.

- Two facts cover every flow: **can a collection happen here** (loads leave from it: a haul-out) and
  **can a load end here**. A TDSR ticks both; a landfill ticks Allow Disposal; a transfer station or a
  white goods site ticks Allow Disposal, plus Allow Collection if loads later leave it. So our
  **Haul-out** = Allow Collection and our **Disposal** = Allow Disposal.
- **Staging** existed only because a load's quantity (a load call, or "from the tickets it carries")
  came from its code. Once that has its own home (Q-200), it isn't a fact about the site.
- **Citizen drop-off** is a log like an incident (ADR-184): a form a phone is set up for, not a site
  behaviour. **HHW** had no behaviour yet.
- **Disposal Fee** and **Ineligible** are facts reconciliation can use for every ticket at the site,
  without the firm naming each site in a rule.
- The **Location Type** stays descriptive, and it's what the *Disposal site type* criterion tests.

Example: Hwy 20 TDSR (Allow Collection, Allow Disposal, Disposal Fee); Charlotte County Landfill
(Allow Disposal); a private pit the contract excludes (Allow Disposal, Ineligible).

1. Is that reading right, and do the legacy five **replace** ours? Yes if the agent agrees.
2. **Disposal Fee:** what does it do? Every load dumped there gets the site's fee (line 11's $4.25)
   with no rule, or a rule tests "the site charges a fee"? System would then expect a any
   tickets coming from that site to have a service for a disposal fee, and if they are missing on it 
   flags them so the right service and rules can be created. 
3. **Ineligible:** a load dumped there is flagged "dumped at an ineligible site" and still bills, like
   every flag? *(agent reading)* I think so.
4. **Critical:** what does it mean, and what does the system do with it? The agent can't work this one
   out. 

   4. What is IT? Idk what you are refereing to as it relates to "it" here. 

*Refs:* ADR-184, ADR-190, ADR-194, ADR-201, ADR-205; `spec/RULES.md` §4 (*Disposal site type*);
`development/legacy_app(back-office …)/edit_location(site).PNG`.

### ✅ Q-203 — Special Class: what is it?
*(ADR-216)* **Decided in part:** a list the firm creates for the ones it needs, picked by a monitor
much as a debris class. The rest is the agent's proposal in **Q-208**.

The legacy collection review shows a **Special Class** line under Debris Type; the project menu has
**Special Classes**, and the legacy rule builder offered it as a criterion. It comes back (ADR-211).
In round 21 you chose "a special debris class is a debris type the firm adds" (ADR-204 (3)).

Example: a load of Vegetative/Woody from Oak Ave. What would its Special Class be, and who sets it?

1. What values did firms use, and what does a Special Class mean? idk and i think we can assume it means a special debris classification. 
2. Who sets it: the collection monitor on Complete (optional?), or the back office? Sets it? Idk what you mean. It would need
to be created by the firm installing this once they have Open ADMS setup. They'd create the ones they need and then later
when a monitor is making tickets they would select it some point similiar to how they select debris type id imagine. What does the agent think would make the most sense give what it knows thus far? Im honestly not sure at what point this was selected.
3. What uses it: a rule criterion, reports, both? We know some criteron will use it and we can now get a better idea as well as to 
how the criteron are formed in the rules. Earlier there was a question about how criteron came to being. I stated that when a (debris type) was selected it impacted these criteron. We also know the options can take a selection list as well so the rule can have up to 2 input types and the ands/ors/betweens/contains/containedIn/greaterThan/LessThan plus whatever else we agreed makes sense. So where does the agent think the rules get the critereon from now? Between how we can see the Legacy app has things in its
old menu the other images also show settings we missed or skipped... How does the agent think these come together? 
4. Does it change ADR-204: is "White Goods" a **Special Class** on a load rather than a debris type?idk... any thoughts after answering things before this? 

*Refs:* ADR-109, ADR-201, ADR-204, ADR-211; `development/legacy_app(field-app …)/LEGACY APP DESIGN.pdf`
(collection review).

## AK. Raised 2026-09-28 (round 23) — how Services, Classifications, forms and sites fit together

Your round 22 answers are recorded as ADR-212…216. You asked the agent to think some of them through
(what a Service Classification holds, where a Special Class is picked, how the criteria come
together); those are the proposals below. Each question stands alone.

### ✅ Q-204 — What a Service Classification holds, and how a pick reaches a Service
*(Closed into **Q-209**, 2026-09-28.)* Lines 1–4 made sense to you; your point 5 asked whether a
disposal phone needs the Service at all, and you asked the agent to work out the rest. The agent
thinks you're right for loads and haul-outs: its reasoning and proposal are **Q-209**. The unit rate
half stands (ADR-213, ADR-217). Nothing here is recorded for loads until Q-209 is answered.

You asked: when the legacy app created a Service Classification, did it **(A)** pick a Document Format
(what we call a Form) and/or a Debris Class, or **(B)** was it only a label?

**The agent thinks (A).** The phone has to know which Services sit behind what the monitor picks, on
every form. On a unit rate ticket the monitor picks the Classification itself, so the link is direct.
On a load the monitor picks only a debris class, and nothing else could lead from "Vegetative" to the
Services that hold the load's settings (a weight instead of a load call, photos, GPS, a quantity from
the tickets it carries). A label alone can't do that. It also explains why most Classifications looked
like plain labels to you: on unit rate the Classification *is* what the monitor sees, so its name
usually matches the Service's.

**Proposal**, for you to correct line by line:

1. A **Service Classification** is a firm list (legacy: Project Setup → Service Classifications,
   beside Debris Class), used per project. Each one names **the form it shows on** (load, haul-out,
   unit rate…) and, on a form that hauls debris, **the debris class it stands for**.
2. Every Service has one Classification. `A1`…`A4` → "Tree, climbing" (unit rate form). `V1`…`V5` →
   "Vegetative" (load form, debris class Vegetative/Woody).
3. **What the monitor sees:** on unit rate, the Classifications the phone is set up for, each once; on
   a load or haul-out, the debris classes added to that form (Q-201).
4. **What the phone knows:** the pick leads to its Classification, then to that Classification's
   Services on the phone, then to their settings. A rule's action can still name **any** Service,
   whatever its Classification.
5. **Setup warns** when a debris class on a load or haul-out form has no Service behind it (the phone
   wouldn't know what to ask for), and when one phone would get Services for the same pick that
   disagree on how the quantity is measured (a load call, or a weight?).

   1. - 4. all make sense
   5. to answer: does a disposal phone really have to know the service code too? Think about it now...
   What if the legacy app works because it actually doesn't check the service on disposal and instead 
   that phone is just setup for a specific debris class since it is only taking in disposal? or am I
   confusing things more? Just wondering about this more since it would make sense that the legacy app
   is doing things differently than id imagined somehow making it possible to have some of the info a 
   disposl side phone would need setup on it, but allowing for flexiblity so the rest of this works in 
   a way that makes sense I might be missing. What are the agent thoughts? 

Example: truck 10090 brings **three stumps** (tickets 20501–20503). The firm has a Classification
"Stumps" (load form, debris class Stumps) with one Service, "Stumps hauled", whose quantity comes from
the tickets it carries. The collection monitor picks **Stumps**, so the phone asks for the stump ticket
numbers. The tower monitor picks **Stumps**, so the phone asks them to count and confirm, not for a
load call. The firm's rules still price the load at the vegetative hauling rates by miles (lines 1–5):
24.6 CY × $8.85 = **$217.71**. And at Charlotte County Landfill the tower phone is set up with the
**per-ton** Vegetative Services, so picking Vegetative there asks for the scale weight (ADR-202).

1. Is (A) right, and is each line of the proposal right?
2. The legacy **Edit Project Service** screen also shows a **Project Service Categories** panel (a
   "Service Category Name" list) under the contract rates. Do you remember what it did? (Q-206 asks
   whether it marked a disposal fee.)

   1. & 2. are hard for me to answer here.. The example makes sense in practice, but if im being honest
   this gets into an area where im reaching. It would be really helpful to have AGENTIC help on this part
   since I know you are able to see the bigger picture of what this all completely is that I can. At least
   in some ways you're able to piece things together I struggle with. What would want it to be like as a firm
   using this so that you have the greatest flexibility?

*Refs:* ADR-157, ADR-165, ADR-175, ADR-192, ADR-202, ADR-207, ADR-211, ADR-213; `development/legacy_app(back-office …)/edit_service(service code).PNG`, `menu_open_project_setup_selected.PNG`.

### ✅ Q-205 — A unit rate Service worked out from the measurement: the details
*(ADR-217)* **Decided, as proposed:** the ticket keeps the pick and the Service; reconciliation works
the Service out again from the bands, so a corrected measurement moves it; no band → no Service,
flagged; bands in one Classification can't overlap (setup refuses) and a gap warns; a lone Service's
min/max only flag; rules test *Service code*, one per band.

In Q-199 you picked (b), then described the phone working out "the right code" from the measurement and
printing it on the receipt, with the bands set on the Service's measure min and max. The agent reads
that as: **the list shows the Classification once, and the band picks the Service.** (Under (b) as the
agent had written it, the receipt couldn't show the payable Service, because only rules on the server
would know it.) ADR-213 records it that way; these are the details.

Example: monitor M321 makes ticket 123 for a **Hanger**, 4.5 in. The firm set Hanger's four Services by
band (numbers only for the example): `G25` 2–5.9 in, `G26` 6–11.9, `G27` 12–23.9, `G28` 24 and up. The
phone works out `G25` and prints "G25 Hanging limbs, 1 each" on the receipt. The rule *Service code =
G25* → *Create Transaction 1*, `G25`, "Ceres – Alachua" prices it.

**Agent proposal:**
1. The ticket keeps **what the monitor picked** (Hanger) **and the Service** worked out. Reconciliation
   works the Service out again from the same bands, so a reviewer who corrects the measurement to 6.2
   in moves the ticket to `G26` when it's reprocessed. The phone's answer is what printed; the
   engine's is what bills.
2. A measurement **in no band** (1.5 in): the ticket saves with no Service and is flagged: "Ticket 123:
   1.5 in fits no Hanger service. Flagged for review." The receipt shows Hanger and the measurement.
3. **Bands within one Classification can't overlap:** setup won't save them (setup may refuse; only
   field work is never refused) and warns about a gap. With decimal accuracy on, the contract's shared
   12 in is written 6–11.9 and 12–23.9.
4. A Classification with **one** Service keeps ADR-210: its min and max only flag out-of-range work,
   and the Service still applies.
5. So the firm's rules test *Service code*, one rule per band Service; *Measurement* stays available
   for anything else.

Is that what you meant, line by line? YES 100%... Now see if this helps figure out the other parts here
im obviously struggling with please. 

*Refs:* ADR-124, ADR-125, ADR-210, ADR-213; `spec/RATE-SHEET.md` (tree lines, "The contract's classes
overlap and leave a gap").

### ✅ Q-206 — A site's Disposal Fee: how the system knows a line is a disposal fee
*(ADR-220)* **Decided in part:** neither (a) nor (b). The site's Disposal Fee box is what tells the
system that every ticket coming to the site should also carry a fee line; the fee line comes only
from the firm's own rule. The agent's Category list is withdrawn. How the check tells the fee line
apart from a hauling line, the agent's answer: **Q-210**.

*(Rewritten 2026-09-28.)* Your note on the first version, kept word for word: "TOO MUCH PARAPHRASING
FOR ME TO UNDERSTAND THE EXAMPLE EASILY.... i dont even want to try to guess at what you really meant
here. Please just try making this easier to read. I need to understand the story better."; "see my
message above i do not get your example here."

**The story.** Charlotte County Landfill charges the contractor a fee for what is dumped there, and
the county pays that fee back under the contract. So the firm sets up:

- a Service for the fee: "Landfill tipping fee", code `TF1`;
- a rule: *Disposal site = Charlotte County Landfill* → *Create Transaction 2*, `TF1`;
- on the landfill's site record, the **Disposal Fee** box ticked. It means: every load dumped here
  should also have a disposal fee line.

Later the firm adds a second landfill, Sarasota County Landfill, and ticks Disposal Fee there too,
but **forgets to write the fee rule** for it.

On Monday two trucks dump:

| Load | Dumped at | Lines the rules write | What the system does |
|---|---|---|---|
| 30551 | Charlotte County Landfill | 1: hauling · 2: tipping fee `TF1` | Nothing: the fee line is there |
| 30552 | Sarasota County Landfill | 1: hauling only | Flags it: "Ticket 30552: dumped at Sarasota County Landfill, which charges a disposal fee, but has no disposal fee line. Flagged for review." |

The firm sees the flag, writes the missing rule, reprocesses, and load 30552 gets its fee line.

**The question.** To notice that 30552 is missing a fee, the system has to tell a **fee line**
(`TF1`) apart from a **hauling line**. How should it know which Services are disposal fees?

- **(a)** A **Disposal fee** tick on the Service. `TF1` is ticked; the hauling Services aren't.
- **(b)** A **Category** on the Service, from a firm list that starts with *Hauling* and *Disposal
  fee*, and the firm adds its own (*Grinding*, *Equipment*, *Tree work*…). `TF1` is in *Disposal
  fee*. The category is also a column in exports. It would replace the "fee kind" list we agreed
  earlier (ADR-089), so there's one list, not two. It may be what the legacy **Project Service
  Categories** panel on the Edit Project Service screen held; the panel is empty in the screenshot,
  so the agent can't tell. That panel is a list, so a Service could have more than one category.

**The agent recommends (b).** It does the same job as the tick, gives reports and exports a way to
group Services, and is a list the firm extends, not a box with one use.

I would think neither a or b, but think it through and correct me if wrong here.. Because Neither because
when "disposal fee" is selected on a disposal site, that tells the system any tickets that come to the site
should also have an additional service for a fee. Remember the edit_service(service code).PNG in the legacy_app(back-ffoce...) folder and how it has options. That is where im thinking about this right now. If you are somewhere else
help me understand. And to be clear in a lot of cases, along with thinking like a firm, I am describing
things from the perspective of the implemented app in working setup. But I think that much is clear. 

Two smaller points:
1. Which tickets are checked: the loads and haul-outs **dumped** at the site, not the haul-outs that
   **leave** it? *(Agent reading: dumped there.)*

   It would be any ticket because no site would be setup with that option selected unless the expected
   behavior is what we are talking about here. 

2. The legacy Services list has one starting "CHARLOTTE COUNTY…" (the rest is cut off). Was that
   the landfill's fee? If so, it's exactly this story.

   There are multiple services after that and you'd be right to guess one of them would be a landfill
   fee. And guess what was in the rules? 

   I added 2 new photos to the back-office legacy_app folder.. tickets...tipping...see if that helps you 
   think things over again. Remember, we aren't trying to hard code the rules a firm makes, just enable 
   the options so Open ADMS is able to do at least the same things. 



*Refs:* ADR-089, ADR-118, ADR-194, ADR-215; `spec/RATE-SHEET.md` line 11 (a fee the firm may also
count as a disposal fee: its call); `development/legacy_app(back-office …)/edit_service(service code).PNG`.

### ✅ Q-207 — The "Critical" box on a site
*(ADR-219)* **Decided:** left out until a firm needs it; a firm can mark a site with its own labels.

The legacy **Edit Location** screen (Charlotte County Landfill) has five tick boxes under the address:
Allow Collection, Allow Disposal, Disposal Fee, Ineligible, **Critical**. You explained the first four.
Round 22's "it" meant this fifth box.

Do you remember what **Critical** did? If not, the agent proposes leaving it out until a firm needs it;
a firm can still mark a site with its own labels.

I'd say leave it out unless someone needs it like you said. 

*Refs:* ADR-194, ADR-215; `development/legacy_app(back-office …)/edit_location(site).PNG`.

### ✅ Q-208 — Special Class: the agent's proposal
*(ADR-218)* **Decided, as proposed, plus unit rate:** a project list the firm fills, starting empty;
picked optionally on Complete by the monitor who collects (right after the debris class), and on a
unit rate ticket too; read by one *Special class* criterion and by exports; White Goods stays a
debris class; criteria are built in, their values come from setup.

You said a Special Class is a special debris classification the firm creates, picked by a monitor much
as a debris type is, and asked what makes most sense. From the legacy screens: the collection review
shows **Special Class** right under Debris Type; the project menu has **Special Classes**; the rule
builder offered it as a criterion.

**Proposal:**
1. **A project list the firm fills**, starting empty.
2. **Picked by the collection monitor on Complete, right after the debris class, and optional** (most
   loads have none). The tower doesn't pick it: like the address, it's what the curb monitor sees.
3. **Read by one rule criterion, *Special class*** (picked from the project's special classes; loads
   and haul-outs), and by exports. Nothing else reads it; the firm decides what each one means.
4. **White Goods stays a debris class** (ADR-204 (3)). Q-201 settled that a firm names its debris
   classes after the contracted work (Mulch, Ash), so a Special Class is for a mark that cuts
   **across** debris classes. An illustration, not a known use: a firm adds "Mixed"; the Oak Ave
   Vegetative/Woody load has some C&D in it, so the monitor marks it Mixed, and the firm's reports
   (and a rule, if it wants one) can pick those loads out.

**How the criteria come together** (you asked where rules get their criteria now): the **criteria** are
built in, per ticket type (`spec/RULES.md` §4); the **values** come from the firm's setup. Adding a
debris class, a Service or a special class adds a value to pick, never a new criterion. Every
criterion takes one of two kinds of input, **picked** from a setup list or **typed** (a number, a date,
text), with the operators agreed in ADR-125. Round 22 changes the list this way: on loads and
haul-outs *Service code* goes (nobody picks one there) and *Debris class* reads the monitor's pick;
*Special class* comes back; *Reduced* joins, if you confirm ADR-214's reading.

1. Is each line right? they all make sense, but ill admit we are in a territory outside my normal lanes
2. Is the collection the only place it's picked, or does a unit rate ticket take one too? it seems reasonable 
that it would take one too or otherwise could. 

*Refs:* ADR-109, ADR-125, ADR-135, ADR-204, ADR-211, ADR-214, ADR-216; `spec/RULES.md` §3–4;
`development/legacy_app(field-app …)/LEGACY APP DESIGN.pdf` (collection review).

## AL. Raised 2026-09-28 (round 24) — what a load's phones need, and where it lives

Your round 23 answers are recorded as ADR-217 (the unit rate bands, Q-205) and ADR-218 (Special
Class, Q-208). Q-206 is rewritten as a plain story; Q-207 is unchanged. You asked the agent to work
out the rest of Q-204 as a firm would want it: that is Q-209.

### ✅ Q-209 — Does a load's phone need to know the Service?
*(ADR-221)* **Decided in part:** (1) yes, no phone needs to know which Service a load is paid at;
(2) the agent was wrong to limit a Classification to unit rate: **every Service, on every form, has
a Classification**; (3) whether a load is weighed is set **on the Service, by its Unit of Measure**,
not on a debris class or a site. The table's three homes are withdrawn; the Service's own settings
stand. How the phone then knows what to ask for, the agent's answer: **Q-211**.

You asked (Q-204, point 5) whether the tower phone really has to know the Service, or whether the
legacy app worked because it didn't. **The agent thinks you're right: on a load or a haul-out,
neither phone needs the Service, at either end.** In round 22 we wrote that the phone knows a load's
Service (ADR-213). The agent now thinks that was wrong, for three reasons.

**1. The phone can't know it.** Vegetative hauling on the rate sheet is priced by miles: lines 1–5,
one Service per band (0–15 mi, 16–30 mi…). The miles are worked out on the server after sync, from
the collection's GPS to the site's (ADR-208). At the tower, offline, nobody knows the miles yet, so
neither the monitor nor the phone can know whether a load is the 0–15 mi Service or the 16–30 mi one.
Only reconciliation can. The same is true of a price chosen by contractor or by landfill.

**2. The legacy screens agree.** A legacy Service's settings are: measure min and max, "force unit
count to 1 (i.e. per tree contract)", require GPS, require measurement, "use decimal accuracy
(required for stump type services)", and "use eligibility flag". Every one is about unit rate work;
none is about a load call or a weight. The load form's choices sat on the **Debris Class** screen
(form, debris class, Is Reduced, Reduction Method, Is Disabled).

**3. Unit rate is different, and that's fine.** There, the monitor picks the Classification and
measures, and the measurement picks the Service's band, so the phone can work the Service out and
print it on the receipt (ADR-213, ADR-217). Nothing there depends on miles.

**So the agent's proposal, as a firm would want it: the phone asks from what it already knows; a
load's Service is only what's paid, chosen by the rules on the server.** What a phone knows at the
moment of capture is the form, the debris class the monitor picked, the site it's set up for
(ADR-195) and the truck's certification. Each setting a load needs goes on one of those:

| What the phone has to know | Where it goes | Why there |
|---|---|---|
| Ask for a **load call**, or **count the tickets the load carries** (a load of stumps; white goods to an outside site) | The **debris class on the form**: a new column beside Is Reduced, *Quantity from* = **Load call** (default) or **Tickets it carries** | It depends on what the debris is: a load of Stumps counts its stump tickets at any site |
| Ask for the **scale weight** instead of a load call | The **site**: a new box, **Scale weight** (off by default) | Only a site with a scale can give a weight, and the tower phone is set up for that one site |
| **Photos** (how many are required) and **GPS required** | The **debris class on the form** | A firm might want a photo of every White Goods load but not of every Vegetative one |

**What the phone does.** Three trucks, Monday, all Ceres:

| Truck | Dumped at | Debris class picked | The tower phone asks for |
|---|---|---|---|
| 10090 | Hwy 20 TDSR | Stumps (*Tickets it carries*) | A count of stumps 20501–20503, and a confirm; no load call |
| 10091 | Hwy 20 TDSR | Vegetative (*Load call*) | A load call |
| 10092 | Charlotte County Landfill (*Scale weight* ticked) | Vegetative | The scale weight, no load call |

After sync the rules price all three exactly as today: the miles band picks the per-CY Service for
10090 and 10091, and *Disposal site = Charlotte County Landfill* picks the per-ton Service for 10092.
Nothing about price is on any phone. Reconciliation flags a load missing what its site or debris
class asks for ("Ticket 10092: dumped at a scale site with no scale weight. Flagged for review.").

**On a haul-out** *(agent reading)*: the load call is still taken where it's loaded (the haul-out
exception); at a *Scale weight* site the dumping end adds the weight.

**What a Service Classification then holds** (your Q-204, line 1): **its name, and the unit rate
screen it uses** (Tree work, Stumps, White Goods, Crew time…: today that sits on each Service,
ADR-127; the Services in one Classification must share a screen, so it belongs on the
Classification). **No debris class.** A Classification of load Services ("Vegetative hauling"), or of
fees, is only the label in reports and exports, which is why most looked like labels to you.

**What this changes:** "requires weight" and the quantity method leave the Service (ADR-165,
ADR-175; your words then were "a setting for this in the service code options", back when we thought
monitors picked a Service on a load, which ADR-207 changed); a load of stumps' "from the stumps"
moves to the debris class (ADR-192); ADR-213's "a load's settings stay on the Service" is withdrawn;
Q-204's line 5 warnings go (a load no rule prices is already flagged, ADR-089). ADR-202 said "no site
setting CY or ton": still true for **price**. *Scale weight* says what the tower records, not which
price is paid.

1. Is the agent right that a load's phones never need the Service, and do the three homes in the
   table work for you?
   I believe so.
2. A Classification = a name plus its unit rate screen, with no debris class: right? If  classification is limied to a unit
rate then how can we set a classifcation for a load ticket that needs  service? This thinking the agent has is wrong. Think harder. 
3. At a site with a scale, is **every** load weighed, or do some debris classes there still take a
   load call? If some, the *Scale weight* box would list the debris classes it covers (all, unless the
   firm unticks some). Whether or not a debris class takes a weight isn't set on the class itself. It is set in the Service. In 
   the legacy app screenshot for the edit_service(service code) there is an option for Unit of measure: where in the image Unit is selected and while that might seem odd for a service used as a operations charge, but the contract for the project in the legacy screenshots would have had something for it setup which we can see it an 800.00 charge. We dont know the timeframe, we just know in that case it was going to be a unit rate ticket because of the choices selected. This also shows how the legacy app creates a lot of flexible options. 

*Refs:* ADR-127, ADR-157, ADR-165, ADR-175, ADR-192, ADR-195, ADR-202, ADR-207, ADR-208, ADR-213,
ADR-217; `spec/RATE-SHEET.md` lines 1–5; `adms-domain` §4.4 (haul-out load call);
`development/legacy_app(back-office …)/edit_service(service code).PNG`, `debris_types(classes) and details.PNG`.

## AM. Raised 2026-09-28 (round 25) — the two things you asked the agent to work out

Your round 23 and 24 answers are recorded as ADR-219 (Critical left out, Q-207), ADR-220 (the
Disposal Fee box, Q-206) and ADR-221 (Classifications and weight, Q-209). Your two new screenshots
helped: the legacy **Tickets** screen links each Service to its ticket type (Load Ticket → `90A`
Charlotte County Landfill tipping fees, `55A`, `54A`; Unit Rate Ticket → `6A`, `40`, `35`, `12`,
`7A`), and a load rule's criteria include both **Weight** and **Volume**.

### ✅ Q-210 — Disposal Fee: the site names its fee Service
*(ADR-222)* **Decided in part: "Nope."** The site doesn't *pick* a fee Service from the project's
Services: **ticking Disposal Fee leads the firm to write the site's fee Service** (code, name,
Classification, Unit of Measure) and **add its rate** for each prime ("add rate" on the open
Service), then write the fee rule (Create Transaction #2, after the main line). **A load at a
Disposal Fee site that no fee rule matches is flagged as exactly that** ("no rule set up for this
project matches the ticket"), never as a debris class mismatch. Still open, re-asked in **Q-212**:
which tickets are checked (point 2 had no answer), and a check on the story's 30551.

You said the site's **Disposal Fee** box is what tells the system, not anything on the Service. The
agent agrees, and adds one thing the box can't do on its own: **tell which line on a ticket is the
fee.** "Has a second line" isn't enough. Split load 10095 (-A, -B, -C, three properties) dumped at a
landfill with no fee rule has three hauling lines, one per property, and would look as if it had
its fee.

Your screenshot shows the answer: the legacy fee Service is named after its site,
"90A – CHARLOTTE COUNTY LANDFILL TIPPING FEES". The fee belongs to the site. So:

**When the firm ticks Disposal Fee on a site, it also picks that site's fee Service** (one or more)
from the project's Services. The firm still writes the rule that creates the line, as in legacy.

The story. Charlotte County Landfill: Disposal Fee ticked, fee Service `90A`. The firm's rule:
*Disposal site = Charlotte County Landfill* **and** *Debris class = Marine based – Veg/Woody* →
*Create Transaction 2*, `90A`. (It meant to leave out the debris class, but didn't.)

| Load | Dumped at | Lines the rules write | What the system does |
|---|---|---|---|
| 30551 | Charlotte County Landfill, Veg/Woody | 1: hauling `54A` · 2: fee `90A` | Nothing: the fee line is there |
| 30552 | Charlotte County Landfill, C&D | 1: hauling `55A` only | Flags it: "Ticket 30552: dumped at Charlotte County Landfill, which charges a disposal fee (90A), but has no 90A line. Flagged for review." |

The firm sees the flag, drops the debris class from the rule, reprocesses, and 30552 gets its `90A`
line. A site ticked with **no** fee Service picked yet flags its tickets the same way ("… which
charges a disposal fee, but has no fee Service set up"), so the firm knows to create one.

1. Is that right?
2. You said "any ticket" comes to the site. The agent reads that as **every load and haul-out
   dumped there**. A haul-out that **leaves** Hwy 20 TDSR for the landfill isn't checked for Hwy
   20's fee (that fee was paid when the debris came in), and a unit rate ticket worked at the site
   (`6A` Operation of TDMA) isn't either. Right?

> **User, 2026-09-28** (numbered "3."; the agent reads it as the answer to 1; point 2 had no
> answer): "Nope.
> **When the firm ticket Disposal Fee on a site, it also WRITES a Service and fills in the details needed, including
> to link the rule to a Rate, which as a user for a firm would appear like you are "adding" a Rate to a servive, which 
> in the workflow means having the service selected/open and clicking an "add rate" option**Then in the rule your example
> shows because the FEE rule has Debris Class = Marine Based - Veg/Woody and neither ticket matches that pattern. 551/552 should
> both alert that there is no rule setup for the project matching the ticket details or whatever makes the most sense. Its not
> actually a debris class mismatch, but the system should know neither of those tickets would get a fee since the rule clearly
> states the debris class it needed to match was "marine...". "

*Refs:* ADR-089, ADR-162 (a split's lines per property), ADR-215, ADR-220;
`development/legacy_app(back-office …)/tickets_and_services.png`, `tipping_fee_rule_start_setup.png`,
`edit_location(site).PNG`.

### ✅ Q-211 — What the tower phone asks for, from the Services set up on it
*(ADR-223, ADR-224)* **Decided in part.** (a) **The monitor enters only the main ticket; fees are
the system's work** and never make a phone ask for anything (224). (b) **A tower asks for one
quantity, never both.** If the hauling Service is per CY and the site's fee is per ton, the tower
asks for the load call, and processing flags the fee line so the firm fixes its setup or operations;
set up to match the contract, the two agree. (c) **After sync, a line whose Service needs a quantity
the load doesn't have is flagged** ("makes sense"). (d) **No separate "requires weight" box**: the
Service's **Unit of Measure** (a picked list) says it; the Q-204 "disagree" warning goes. (e)
**Phone setup stays basic**; which Services apply is not ticked on the phone: the user asked for
a back-office way. (f) **The site doesn't own weighing**: the firm's **rule** (per form, testing the
site, debris class, contractor…) links to a Service whose Unit of Measure is per ton. (g) The
agent's story was wrong: a load to Charlotte County Landfill in Don Pedro is a **haul-out** from
the TDSR (its own number), with its load call at the loading end. Still open, the agent's worked
answer: **Q-213** (the back office works out what each site's phone asks for, from the rules).

You corrected the agent twice in Q-209: every Service has a Classification, loads and fees too; and
whether a load is weighed is set on the Service by its **Unit of Measure**. You also agreed that no
phone needs to know which Service a load is paid at. Put together with the Tickets screen, the agent
now reads the legacy tower phone this way:

1. **Each Service names its form** (Load Ticket, Haul-out Ticket, Unit Rate Ticket), as on the
   Tickets screen, and **has a Classification**. On a load or haul-out form, a Classification stands
   for a debris class (Q-204 line 1); a fee's Classification ("Tipping fees") stands for none.
2. **A tower phone gets the Services chosen for it at setup**, as a unit rate phone does (ADR-127),
   and as you said for weight in round 14: "when service codes are setup it impacts what the
   downstream user device shows" (ADR-175).
3. **When the monitor picks a debris class, the phone asks for whatever any of its Services behind
   that class needs, plus the Services that stand for no class** (the fees): a per-CY Service → a
   load call; a per-ton or per-pound Service → the scale weight; a Service "from the tickets it
   carries" → the stump count; Require GPS and photos as those Services say. **It never works out
   which one pays.** All five mileage bands of a hauling line are per CY, so the phone just asks for
   a load call, and the rules pick the band after sync.

   > **User, 2026-09-28:** "**NOTE:A monitor only handles the main ticket stuff. Things like FEEs are automated by the system. This 
   > applies across things. But think carefully about it. We have two sides who are working on things. 
   > One side is working in the field moving fast inputing only what is needed. The rest of the "magic"
   > is going on behind the scene. That's why a fee rule has the transaction order as #2. It would only
   > run "after" a ticket with the same debris class, site, contractor, etc. That is the legacy setup. 
   > Now if we flipped the table and put on the back-office hat, you wouldn't expect the same minimal 
   > data to show up when you wanted to review a ticket, and even more when you needed to edit it/go 
   > deeper. So as someone on that side you wanna see all of the tickets info in the easist way possible
   > to make changes, and to look at as many as you can as quickly as you can doing QC review work to 
   > mark those. I'm only sharing this aspect to make you think about things clearly on the two sides. 
   > Because above you seem to be hinting at the monitor being foced to enter too many details.**"

4. **Both can be asked.** If hauling is per CY and the landfill's fee is per ton, the tower at the
   landfill asks for a load call **and** the scale weight. That fits the legacy load rules offering
   both *Weight* and *Volume*.

   > **User, 2026-09-28:** "**NOTE: This is note how it should work. If the Service is setup with a Unit of Measure as CY
   > and it hauls debris to a landfill with a fee that requires scale weight, it shouldn't work**
   > Only 1 **would** be asked in this case because they should only be setup for Disposal at XYZ site
   > which the system tells the phone requires a fee and accepts disposal. Then when a ticket is processed
   > the system has to flag it which forces the firm to make operations adjust. Assuming the service and
   > rules were setup to match the contract, this is the behavior we would expect."

5. **After sync**, a line whose Service needs a quantity the load doesn't have is flagged: "Ticket
   10092: 90A is priced per ton, but the load has no scale weight. Flagged for review."

   > **User, 2026-09-28:** "This makes sense."

6. So the separate "requires weight" box (ADR-175) isn't needed: a per-ton Unit of Measure says it,
   as on the legacy Service. And the Q-204 setup warning about Services that "disagree" goes:
   asking for both is fine.

   > **User, 2026-09-28:** "This also seems to make sense." *(Agent note: "asking for both" is
   > withdrawn by the answer to 4; the box and the warning go.)*

The story, with the Don Pedro Services (the units are only for the example): `54A` Veg debris
removal from waterway (per CY, Classification for *Marine based – Veg/Woody*), `55A` C&D debris
removal from waterway (per CY, *Marine based – C&D*), `90A` Charlotte County Landfill tipping fees
(per ton, a fee: no debris class).

| Tower phone at | Set up with | Truck 10091 picks Veg/Woody; the phone asks for |
|---|---|---|
| Hwy 20 TDSR | `54A`, `55A` | A load call |
| Charlotte County Landfill | `54A`, `55A`, `90A` | A load call **and** the scale weight |

After sync at the landfill: line 1 `54A` = capacity × load call; line 2 `90A` = the tons.

1. Is that how it works, line by line?
2. **Which Services does setup tick for a tower phone to start with?** The agent proposes: the
   project's Services on that form that stand for a debris class, plus the fee Service(s) its site
   names (Q-210); the admin unticks any that don't apply there (for example, per-ton hauling on a
   phone at a TDSR with no scale).

> **User, 2026-09-28:** "Setup must be basic only, all but the per ton option make sense
>    That would ideally somehow not be on the phone if possible. Think about if there is another way 
>    to make this a back-office setup step. 
> 1-2 above I can't agree with how this story is shaped because the County Landfill load doesn't have
> a different ticket # and nothing clearly stated that it was a haul out load from the TDSR. I realize
> you didn't give these ticket numbers so lets say Line 1 is ticket #0001, so #0002 is next right. 
> Okay that means we can assume #0002 was a haul out load. That means it needs a haul out collection
> which itself issues a load call in most cases, but we have discussed how to handle cases where haul
> out is going to a site setup for tonnage, but we never outlined exactly how that part works. Clearly 
> we can see now that it happens in the Service set as a Unit of measure (which are themselves options
> in a list because they are being selected). 
>
> If a load were to go straight to a FDS, where you would expect to be able to obtain a scale ticket if the FDS
> in fact has one, but that is clearly not an option on the site.. Because a site doesn't own whether or not
> it needs to be weighed or contain a scale ticket number right? Can you guess where that would be handled? 
> That would happen in a rule that is linked to a (legacy app called it a Document Format) which we know the
> legacy app links to individual "debris classes" that are added to each project with a Custom name (possibly
> resuable between projects). So you get that setup where you have:
>
> Format = Load ticket     -> Marine VEG
> Format = Load ticket     -> Marine C&D
> Format = Haul out ticket -> Water Based Mulch
> Format = Haul out ticket -> Water Based Reduced C&D
>
> Service:
> servoce_code=54A 
> description= Marine based – Veg/Woody
> Classification=Marine Vegetative Debris
> unit_of_measure=Cubic Yards
> rate=contractor+value
>
> Rule: 
> DocType=Load Ticket
> Name= 54A - Marine based – Veg/Woody
> Criterion=
> disposal_site EQUALS [selection:Hwy 20 TDSR ]
> debris_class EQUALS [Marine based – Veg/Woody]
> contractor EQUALS [Don Pedro Services]
> ..etc...
>
> Action=create transaction
> Transction # 1
> etc...
>
> These are just rough examples that may or may not even be helpful. Im trying to illstrate that we uses this combination
> to decide (thinking as a firm right now) how we want to set things up per the projects needs as it evolves over time. 
> Like Action in the rule option: create/delete transactions and void. Imagine as a firm you needed to delete transactions
> and made a special rule on a given project that when created we added a criterion that took some details and a date range
> ...or imagine you as a firm needed to do something along those lines to void some others. It's a weird setup, but that is 
> how the legacy system was built. I want you to understand that so you're able to think about it deeply. "

*Refs:* ADR-127, ADR-157, ADR-165, ADR-175, ADR-176, ADR-192, ADR-202, ADR-213, ADR-221;
`development/legacy_app(back-office …)/tickets_and_services.png`, `edit_service(service code).PNG`,
`tipping_fee_rule_start_setup.png`.

## AN. Raised 2026-09-28 (round 26) — what's left of Q-210 and Q-211, and a sweep for scope

Your round 25 answers are recorded as ADR-222 (the fee Service is written from the site, Q-210),
ADR-223 (one quantity, from the Unit of Measure, Q-211) and ADR-224 (the two sides: the monitor
enters only the main ticket; the system and the back office do the rest). Three things are left:
the part of Q-210 that had no answer, your "think about another way" in Q-211, and a sweep of the
legacy screens we've never talked about, so nothing in the finished product is a surprise later.

### ✅ Q-212 — Disposal Fee: which tickets are checked, and one check on the story
*(ADR-226)* **Decided.** In chat, 2026-09-29: "212-read correctly". **A rule's debris class
matches only the exact entry the monitor picked, no exceptions** ("Veg" is not "Marine based –
Veg/Woody"), so both 30551 and 30552 are flagged when the monitor picked plain "Veg". The fee
Service's own rule tests *Disposal site = the landfill*; the hauling line is a different Service.
**A haul-out never dumps at a TDSR, only leaves one**: one that does is flagged and priced no
further. Checked for a site's fee: loads, and haul-outs, **dumped** there; not a haul-out leaving it,
not unit rate work done there. *(The capitals in the next paragraph are the user's own edits,
2026-09-29.)*

The agent now has it this way (ADR-222): when the firm ticks **Disposal Fee** on Charlotte County
Landfill, THE FIRM writes the CREATES A NEW fee Service (`90A` Charlotte County Landfill tipping
fees, per ton, with Don Pedro Services' rate added), and THEN ALSO writes the fee rule AND SETS IT
as Transaction #2. Because THE RULE FOR `90A` HAS A CRITERON **DISPOSAL_SITE EQUALS ...LANDFILL**, 
the system knows `90A` is that site's fee, and that is how it tells the fee line apart from a 
hauling line, WHICH HAS A TOTALLY DIFFERENT SERVICE. 

The fee rule, as in the old story:
*Disposal site = Charlotte County Landfill* **and** *Debris class = Marine based – Veg/Woody* →
*Create Transaction #2*, `90A`.

**One check on the story.** The old table shortened the class names. In full:

| Ticket | What it is | Debris class | Lines the rules write | What the system does |
|---|---|---|---|---|
| 30551 | a load dumped at the landfill | Marine based – Veg/Woody | 1: `54A` · 2: `90A` | Nothing: the fee rule matches, the fee line is there |
| 30552 | a load dumped at the landfill | Marine based – C&D | 1: `55A` | Flags it: "Ticket 30552: dumped at Charlotte County Landfill, which charges a disposal fee, but no rule on this project gives it one. Flagged for review." |

You wrote that **both** should be flagged. The agent thinks only 30552 is, because 30551's class is
exactly the one the fee rule names. If you meant something else (for example, that a fee rule
shouldn't test the debris class at all), say so.

> **User, 2026-09-29:** "I SAID BOTH BECAUES THE MONITOR DIDN'T SELECT 'MARINE' VEG, ONLY VEG... DEBRIS CLASS MUST BE EXACTLY THE SAME. NO EXCEPTION."

**Which tickets are checked.** Four tickets touch Hwy 20 TDSR, which also has Disposal Fee ticked
(its own fee Service, say `TF1`):

| Ticket | What happened at Hwy 20 TDSR | Checked for `TF1`? *(agent's reading)* |
|---|---|---|
| 0001 | A load from the curb **dumped** there | **Yes** |
| 0002 | A haul-out **dumped** there from another TDSR | **Yes** |
| 0003 | A haul-out that **left** Hwy 20 for the landfill | **No**: the fee was charged when the debris came in (as 0001) |
| 0004 | A unit rate ticket worked there (`6A` Operation of TDMA) | **No**: nothing was dumped |

> **User, 2026-09-29**, on 0002 (written in the table row): "A HAUL OUT SHOULD NEVER GO TO A TDSR, ONLY LEAVE ONE. SHOULD BE FLAGGED AND NOT PROCESSED MORE."

1. Only 30552 flagged, 30551 fine: right? *(User: "READ MY NOTES ABOVE")*
2. Is the "Checked" column right: only loads and haul-outs **dumped** at the site? *(User: "NO SEE MY NOTES")*

> **User, in chat, 2026-09-29:** "212-read correctly"

*Refs:* ADR-215, ADR-220, ADR-222; Q-210; `development/legacy_app(back-office …)/edit_location(site).PNG`,
`tickets_and_services.png`.

### ✅ Q-213 — What a site's phones ask for, worked out in the back office
*(ADR-227)* **Decided.** (1) Yes, "in a nutshell". (2) **Follow the prime**: the phone gets, with its
lists, what to ask for by site, debris class and prime, as collection and unit rate phones get what
they need. (3) Where the rules don't give one clear answer, or give none, **the load call**. (4) Yes.
(5) The tower **may offer** the receipt number as an optional field where it makes sense. The
user's chat question on (3), answered in ADR-227: this is worked out **ahead**, from the rules as
written, not when tickets are processed.

You asked for phone setup to stay basic, and for "another way to make this a back-office setup
step". You also showed where weighing really lives: **not on the site, but in the firm's rules**
(form + disposal site + debris class + contractor → a Service), and the **Unit of Measure** of the
Service the rule pays. The agent's proposal follows straight from that.

**Setting up the phone stays as it is:** the project, the work (tower, haul-out loading end,
haul-out dumping end), the one site (ADR-195), the monitor. **No Services are ticked on a phone.**

**The back office works out what each site's phones ask for, from the project's rules**, and shows
it on the site's page as a small read-only table. Nobody fills it in. For each debris class on the
form (and each prime, see 2), it looks at the active rules on that form that could match a load
dumped at this site (they test this site, or no site; this class, or no class; this prime, or no
contractor), **leaves out the site's own fee Services** (the system's work, ADR-222, ADR-224), and
reads the Unit of Measure of the Services those rules pay:

| The rules that could match pay… | The phone asks for |
|---|---|
| per CY (every mileage band included) | a **load call** |
| per ton or per pound | the **scale receipt**: its number and weight, **instead of** a load call (ADR-165) |
| nothing yet (no rule) | a **load call**; after sync the load is flagged "no rule matches" anyway |
| per CY **and** per ton, for the same class | see question 3 |

Phones get the table with their lists (any connection, ADR-151). A rule change updates it; a phone
that hasn't refreshed yet asks for the old thing, and processing flags what's missing ("Ticket 0002:
90A is priced per ton, but the load has no scale weight. Flagged for review.", ADR-223).

**The story, Don Pedro, with your ticket numbers.** Services (the per-ton haul-out Service `HO1` is
invented for the example): `54A` Veg debris removal from waterway (per CY), `55A` C&D (per CY),
`HO1` haul-out of Water Based Mulch to final disposal (per ton), `90A` Charlotte County Landfill
tipping fees (per ton, the landfill's fee Service).

| Phone | Debris class picked | Rules that could match (fee Services left out) | Asks for |
|---|---|---|---|
| Tower at Hwy 20 TDSR (load form) | Marine VEG | `54A` per CY | a load call |
| Haul-out loading end at Hwy 20 TDSR | Water Based Mulch | *doesn't matter* | a load call, always (see 4) |
| Haul-out dumping end at the landfill | Water Based Mulch | `HO1` per ton (`90A` left out) | the scale receipt: number and weight |

- **#0001**, a load: curb → Hwy 20 TDSR, load call 80%. Line 1 `54A` = capacity × 80%.
- **#0002**, a haul-out: Hwy 20 TDSR → the landfill, load call 90% at loading, 12.4 t on the
  receipt. Line 1 `HO1` = 12.4 t; line 2 `90A` = 12.4 t.
- **If the firm had set `HO1` up per CY instead**, the landfill end asks for nothing extra, `90A`
  has no tons, and #0002 is flagged: the firm fixes its setup or its operations (your answer to 4).
- **A load straight from the curb to the landfill** works the same at the landfill's tower (load
  form): the rules there pay per ton, so it asks for the scale receipt instead of a load call.

1. Is that the back-office step you meant: nothing ticked on the phone, the system works it out from
   the rules and shows it on the site's page? 

   > **User, 2026-09-29:** "In a nutshell yes."

2. The phone knows the truck's prime from the badge scan. Should the answer follow **the prime**
   (Ceres per ton at the landfill, TFR per CY), or be **one answer per debris class** for everyone?

   > **User, 2026-09-29:** "Doesn't it make more sense to follow the prime or otherwise expect to have disposal phones setup
   > such that they have info about what they are selecting like collection and unit rate work?"

3. When the rules for one class at one site pay **per CY and per ton** (a mistake, or two primes if
   the answer to 2 is "one answer"), which should the phone ask for: **the load call** (the agent's
   pick, with a warning on the site's page for the firm), or **the scale receipt**? 

   > **User, 2026-09-29:** "A load call becaues
   > once they scan the badge and complete the ticket the system will workout which contractor the rule
   > will go to which means any transactions slated to follow after it #2, #3, etc can continue when 
   > they have the right configuration."

4. The haul-out's loading end can't know where the truck is going (no ticket says where debris is
   headed, ADR-205), so it **always takes the load call**, as today (the haul-out exception). On a
   haul-out paid by weight, that load call is kept on the record and not billed. Right?

   > **User, 2026-09-29:** "Yes."

5. At a final disposal site whose rules pay **per CY**, the scale receipt number only proves the load
   arrived (`adms-scale-receipts`: "optional"). Should that tower **offer** the receipt number as an
   optional field, or not show it at all?

   > **User, 2026-09-29:** "The tower COULD BE OFFERED this optional field if it makese sense."

> **User, in chat, 2026-09-29:** "213-2nd bullet issue, when rules disagree? Or you mean no matches?
> rules process well after the fact so a phone will have moved on to the next ticket"

*Refs:* ADR-151, ADR-165, ADR-175, ADR-195, ADR-205, ADR-221, ADR-223; Q-211; `adms-scale-receipts`
"When does a scale receipt exist at all?"; `adms-domain` §4.4 (haul-out load call);
`development/legacy_app(back-office …)/tipping_fee_rule_start_setup.png`, `edit_service(service code).PNG`.

### ✅ Q-214 — Legacy screens we've never talked about: in the product or not?
*(ADR-228)* **Decided.** Out: WorkOrder, PO Management. Time and Material = our crew time (a unit
rate ticket). Stump Collection = our load of stumps. **No separate crew list: the crew
certification is the crew** (the agent's explanation is in ADR-228). Invoices = **invoice batches**
(a named set of tickets locked as invoiced, which a contractor can pull a report on). The rest, as
the agent proposed ("makes sense from mostly an admin POV"): one review queue replaces QC Error
Report, the queues and WorkFlow Management; photos are reviewed inside a ticket; reports are fixed
exports plus saved filters (a query builder later); a firm library plus "copy from a past project"
replaces Standard Services and the imports; no Service Categories (the Classification is the report
label).

You asked the agent to make sure the whole scope is in the picture. The legacy screenshots show
menus that no question has touched yet. For each, the agent wrote what it **guesses** the screen
did; the guess is only there so you can correct it. Please fill in the last column: **In** (and a
line on what it does), **Later**, or **Out**.

| Legacy screen (where it sits) | The agent's guess | In / Later / Out, and what it does |
|---|---|---|
| **WorkOrder** no idea what this was ever even for
| **Time and Material** we have this as a unit rate ticket for crew time
| **Stump Collection** (Entry Forms → New Tickets) | Our load of stumps (ADR-192)
| **WorkFlow Management** (project menu) | Steps a record moves through in the back office (review, QC, approve) | |
| **QC Error Report** (project menu) | A list of every flagged ticket, i.e. our review queue | |
| **Image Management** (top tab) | Browsing and checking photos across tickets | |
| **Project Queue / Document Queue** (top tab) | Records waiting to be processed or reviewed | |
| **Query Builder**, **Report Specifications**, **Reports** (top tab and project menu) | The firm builds its own searches and report layouts (Q-100 covers the fixed exports) | |
| **Import Services from Project**, **Import from Standard Services**, **Edit Service Rates** (Services screen); **Standard Service**, **Debris Class**, **Service Classifications** (Project Setup → System Management) | Firm-wide starter lists kept outside any project; a project copies Services from them, or from another project, then sets rates. You said debris classes may be "reusable between projects" too | |
| **Crew** (Project Setup → Crew Management, beside **Monitor**) | A firm-wide list of crews, separate from the crew certifications we have (ADR-015), or the same thing? | | The legacy app has them separated... Takes forever to handle setup linking each part together too. 
| **PO Management → List** No idea what this ever was for (outside my scope of work maybe)
| **Project Service Categories** (right side of the Service screen, empty in the screenshot) | A label group for Services in reports (the agent's own "Category" idea was withdrawn in ADR-220) | |
| **Invoices** (top tab) | We decided there is no invoice record, only locking as invoiced (ADR-061, ADR-088): is this tab anything more? | | Maybe it does contain or did contain invoiced ticket records. Would be like just a long list of all the tickets "locked" for invoiceing. A contractor could then pull up an invoice report with a given name and see those tickets noted as "invoiced", and the system would lock them for editing. 

*Refs:* `development/legacy_app(back-office …)/edit_service(service code).PNG`,
`menu_open_project_setup_selected.PNG`, `debris_types(classes) and details.PNG`; Q-05, Q-100,
Q-103; ADR-061, ADR-088.

> **User, in chat, 2026-09-29:** "214-crews are merged into their certs? Explain... The rest makes
> sense from mostly an admin POV.."

## ⏱️ Scope reached — 2026-09-29 (ADR-230)

The rounds of product questions are **closed**. Everything above, through ADR-231, is the scope for
Phases 0 and 1. An agent adds a question here only when the answer changes money, evidence or what a
monitor must do, it blocks the task at hand, and no recorded rule, setting or default covers it: at
most three at once, each with the agent's recommended answer. Anything else is decided as an **agent
default** (an ADR the user can overturn later), never guessed silently. The agent readings still
waiting (ADR-205 (2), 208, 209, 214, 215, 218) stand as agent defaults.


## AO. Raised 2026-10-18 — the field app's four open designs, with the clickable prototype (ADR-561, 569)

Four designs from your Build 1 field-app board were left open for Phase 3 (`adms-field-app` §4A.7).
They are put to you now with **the clickable prototype** (task 3.1.4): the field app's key screens
built from its real components, with each design below as a switch you can flip and try:
**https://claude.ai/artifact/6LF95TjGATDpL2VLGAHyVb** (private to you; it is also
`apps/field/dist/prototype/prototype.html` after `pnpm e2e`). Nothing below is built into the app
until you answer. Each has the agent's recommendation; the other choice is yours to keep. Answer
under each one, as you do.

### ✅ All recommendations approved

> **User, 2026-10-18,** written above the four: "✅ All recommendations approved". **In chat, the
> same day:** "All recommendations approved" for Q-215…Q-218 in spec/QUESTIONS.md this is not
> recorded yet. Record it." Recorded as **ADR-573**: the recommended choice of each.

### ✅ Q-215 — A confirmation after each value the monitor enters?
Your board showed "You have selected 55%. Is that correct?" after every pick. Here is a load at the
tower, Kim Nguyen at Marsh Road TDSR, ticket 101001:

| Step | With a confirmation after each value | Without (recommended) |
|---|---|---|
| Debris type: C&D | tap C&D, then "Yes, that's right" | tap C&D |
| Load call: 80% | type 80, Next, then "Yes, that's right" | type 80, Next |
| Before the number | the review screen shows it all | the review screen shows it all, once |

**The question:** should the phone ask "Is that right?" after each value, or only show everything
once on the review screen before the number? **Recommended: only the review screen.** Each
confirmation is one more tap per value, on many trucks an hour, and the review screen already does
that work. *(Prototype switch 1. ADR-561 (7), ADR-569 (1); `FROM-BUILD-1.md` §15.)*

**Decided (ADR-573):** only the review screen; no confirmation after each value.

### ✅ Q-216 — A monitor scorecard on the phone?
Your board mentioned a monitor scorecard. The prototype shows the agent's suggestion on home:
"Today: 6 tickets made on this phone", the monitor's own count, nothing ranked or compared with
other monitors.

**The question:** what should a monitor see of their own day on the phone: **their own count of
today's tickets on home (recommended)**, nothing, or something more (say what a scorecard showed)?
Reports on monitors, compared and ranked, would be the back office's (Phase 4). *(Prototype switch 2.
ADR-561 (7), ADR-569 (2).)*

**Decided (ADR-573):** the monitor's own count of today's tickets on home, nothing ranked or compared.

### ✅ Q-217 — The bottom menu
Your board had a bottom menu of Time, Map, Work, Chats and Settings. No phase's requirements put a
map or chats on the phone.

**The question:** which menu? **Recommended: Work, Time (only where the project has the time clock
on), Sync and Settings.** The other choices on the prototype: your board's five, or no menu (home
and the status strip only). *(Prototype switch 3. ADR-561 (7), ADR-569 (3).)*

**Decided (ADR-573):** Work, Time (only where the project has the time clock on), Sync and Settings.

### ✅ Q-218 — When is the ticket number typed again by hand?
Today the monitor types the number again after a scan, and after a number the phone makes (your
answer in round 22: "We'd want manual re-entry still on generated to confirm the logged it down
correct", ADR-209). The accessibility standard you chose, WCAG 2.2 AA, has a rule against asking for
the same thing twice in one task (3.3.7, Redundant Entry), **unless typing it again is essential**:
when filling it in for the person would defeat the check, as in a memory test.

| Ticket | How the number came | Typed again today | Typed again, recommended | WCAG 3.3.7 |
|---|---|---|---|---|
| Collection 101001, Ana Brooks | the phone made it; Ana notes it | yes | **yes** | essential: it checks Ana's copy |
| Disposal 101001, Kim Nguyen | scanned off the driver's ticket | yes | **no** | not essential: nobody copied it, so it fails 3.3.7 |
| Disposal 101060, Kim Nguyen | typed: the barcode was damaged | yes | **yes** | essential: it checks what Kim typed (101060 was a mistype in the golden mission) |

**The question:** type the number again **only when a person copied it** (a number the phone made,
or one typed because the barcode won't read), **recommended**, or **always**, after a scan too, as
today? Either way the typed-again number must match before the ticket is submitted. If you keep
"always", the field app's accessibility conformance report says 3.3.7 is partly supported, and why.
*(Prototype switch 4. ADR-209, 559, 561 (7), ADR-569 (4); file 11, left 2.)*

**Agent note, 2026-10-18 (ADR-571):** your notes on the prototype moved the number to **New**, right
after the badge; the question stands as asked, and the typing again happens there.

**Decided (ADR-573):** typed again only when a person copied it (a number the phone made, or one
typed because the barcode won't read); never after a scan. Each typed-again number must match
before the ticket opens.

> **User, 2026-10-19 (after trying the field app; ADR-589):** "It feels very blocking to enter the
> ticket number at the start to verify it, but in the test case that mihgt be due to the choice to
> be generated ticket numbers, vs scanned pre printed tickets. Thing is though, if we are generating
> the ticket number, we really don't want to block work re-entering it like we are right now. The
> only time it makes sense to block at the start to enter the number is when its scanned from
> pre-printed."

**Amended (ADR-589):** a number the phone makes opens the ticket at once, never typed again; only a
pre-printed number typed because its barcode won't read is typed again (*agent reading* of "scanned
from pre-printed", since a scan itself was never typed again). ROE and cert numbers are still typed
again until you say otherwise.

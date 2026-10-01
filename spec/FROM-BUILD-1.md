# Open ADMS — Your answers from Build 1, kept

> **What this is.** On 2026-09-25 the user put a copy of an earlier version of Open ADMS ("Build 1",
> folder `old_openadms(do not copy)/`) in the repo **for one response only**, so the agent could
> find answers to open questions and things that version had settled that this one hadn't. The
> folder is being removed. This file keeps **the user's own words** from it, so nothing they said
> is lost. *(ADR-102)*
>
> **What this is not.** No code, schema or design from Build 1 is carried over. Build 1 is
> historical. Its *lessons* are in `spec/ARCHITECTURE.md` §17. Never go looking for the folder,
> and never port from it.
>
> **How to use an entry.** Each topic quotes the user verbatim (the quote is the source), says in
> one line what it means now, and points to the register entry that records it. Where a newer
> decision in this build differs, **the newer decision wins** and the entry says so. Entries the
> user hasn't reconfirmed in this build are marked *(Build 1 answer — carried forward)* in
> `spec/QUESTIONS.md`.

---

## 1. Receipts and printing — **Q-95**

The field printer is a **Zebra ZQ series** mobile receipt printer. Printing is mandatory on every
project. Collection prints two copies (or a control ticket plus its stub). Disposal prints its
own copy for the driver. Unit rate always prints. Receipts are generated on the fly and are
never records.

> **User, Build 1 (issue 06, Q1):** Zebra ZQ series type mobile receipt printers. I also added an untest JS file (untested_js_ticketRecieptModule.js) related to connected over low power bluetooth via the browser. Idk if this method will work, but it might.
>
> **(Q2):** Exactly the right thinking. The driver is handed a ticket at the end of collection and leaves with a load. They take it to disposal and hand it to another monitor who scans it. That initiates the disposal on their device. They should click a "start disposal" ticket button and then be prompted to scan that tickets barcode. When they finish giving a load call (assuming we are talking about regular disposal not haul out), and complete the ticket they print out a disposal version of the ticket and give that to the driver along with the collection ticket they scanned earlier. The collection monitor would have printed 2 tickets, or when using a pre-printed control ticket had a stub leftover. That stub acts the exact same as a 2nd printed ticket. So to be clear when we have pre-printed tickets they have a stub and that acts like printing 2 tickets when we scan the main ticket. In cases where we print the ticket we always print 2 on each side so the monitor keeps a backup and the drive has both a collection and disposal ticket to show the total history of their work. But it also needs to be noted that no project is actually ever without a printer. Unit rate always needs one, no matter the project, and even when control tickets are used, at disposal and end haul out and final disposal sites (basically the same as regular disposal) a printed disposal ticket is needed to give the driver proof of their work. Control tickets dont work because there is no way to pre print collection and disposal without monitors mixing things up or tickets going to the wrong sites. So to avoid that we simply as an industry use it like stated.
>
> **(Q3):** The reciept is the barecode number so when we scan it, the number we get in a form field is the exact number we see printed on the ticket as the ticket #. I should also note that for certifications we also print a reciept itemized …
>
> **(Q4):** Yes … When it comes to all pre-printed tickets, we need to define those range values at setup and that means when we begin setting up a project we need to be able to select this option and others based on the choices made. And this also means we need to have a better test case to run against a set of pre-printed control tickets we're able to actually print out on paper and use to test things.
>
> **(Q5):** 100%.. In fact, anything that was printed needs to be scannable back. If the ticket already exists it should simply tell the monitor it exists, not try to fetch all of the data back to them. Unless that was the need like you noted above. Sometimes a monitor somewhere may need to scan a barcode to verify some data for someone and if they have syned it could help them.
>
> **(Q6):** No. We do not need to count reciept prints at all. We do not need to put reciepts in any audit records. Creation or anything need not be a factor. Reciepts are non entities non items, generated on the fly and sent outside of devices away from out surfaces. We simply contain the data to generate them at anytime needed. There are many cases where a monitors device will glitch out or for whatever reason a ticket will get damaged and they will need to reprint it.
>
> **Receipt content, in the user's order:** Ticket number at the top, followed by truck info, load details (load call, who made it, times, and so on), and it always has the collection and disposal side printed on the ticket, or hand written on the control ticket. Hand written notes are not something we actually care about.

**Now:** stands, with one addition (ADR-115): on a control-ticket project the disposal receipt may be
handwritten on the back of the control ticket (load call, monitor details, truck number). It
doesn't conflict with ADR-088 ("no placard printing"): a placard isn't a receipt.
A certification receipt (itemised) is a receipt. How the app reaches the printer on iPhone is
`spec/ARCHITECTURE.md` §12.

## 2. Certification number series — **Q-96**

> **User, Build 1 (issue 06, Q3):** Say a grapple self loading truck and a trailer are tandem. This is very very commong. Say the truck is given the number 610810 and the trailer is 610811 - those are issued certification numbers based on a series defined at project creation, which impacts data on devices in the field (the field app) and others when they go to make a ticket scan a barcode or what not. Hence why we also mentioned elsewhere that when working offline sometimes we don't know the truck at disposal and need to allow the monitor to key it in manually but then we need to flag that item so the backend can put add'l focus on it.
>
> **User, Build 1 (round three):** Start with a number that is not a whole number and all zeros. Something with a number at the front and in the middle, and the sequence follows after that.

**Now:** stands alongside ADR-045 (a cert number is system-issued **or** taken from pre-printed
paper, unique per project). The system issuer draws from a per-project series with a seed that
doesn't look synthetic, counting up by one; a tandem certified together usually gets consecutive
numbers, **but not always**, and a trailer swap isn't flagged (ADR-114). Fills KD-10's "missing
issuer".

## 3. Monitoring firms, monitor IDs, and who did the work — **Q-97**

> **User, Build 1 (issue 02):** So we have a client, the one who put out an RFP and who at the end of the day owns all of this project data. Then we have a monitoring firm who would have been contracted by them they are using our Open ADMS system to setup, run and closeout a project. They added in their existing workers and all of the project details. They put the Prime hauler in then added a contract from the client signed with line items. Thats when they linked in the contractor from before. Now they can take those line items and build out the service codes and rules and begin the project certificying things and doing work. Now suppose the client requested 1/3 of monitoring labor be handled by a local temp agency and thus added in a sub monitoring firm with workers. That firm is a contractor right? But they are not a hauler. And they are not a crew (our 3rd type) which is how we notate contractors who are not haulers or monitors and there is always other.
>
> **(Q1, the operator as a contractor):** I think so, so billing wise we can easily show the running total costs given say we loop in time keeping at a later point here.
>
> **(Q2, sub under sub):** It could be sub -> sub like this. But probably once in a blue moon. However it might be helpful to just allow for it in case its useful.
>
> **(Q3, monitor IDs):** You made good points here. We should keep the setup we have generating uniquie ID internally and using the other field for custom IDs employers give their own employees.
>
> **(Q4, mixed firms on one load):** Yes they for sure can and it happens a lot. Imagine a project with 400 monitors and 1/3 are from a temp agency but on the groud nobody is treated any different and ends up mixed up working on lots of things together.
>
> **(Q5, monitor time and service codes):** … We wouldn't make codes like this to bill for time using the ADMS ticketing system. Thats just for loads and thats all we ever need to think about service codes linking into. But for tracking who monitored the work, when and where, and under what contract and so on.. That stuff. That is why we are tracking the monitors. So we know what they did you know?
>
> **(Q6, staffing agencies as free text):** No and it should not be setup like that. We dont want to type in free floating text for named entities like this.
>
> **(Q8, do the monitoring and hauling chains cross):** No. The hauler is independent of the monitor 100% of the time. The hauler prime will always be listed on the project (and there can only be one prime hauler), then subs under. All we are doing here is tracking the hauler>subs work as monitors. That's it.

**Now:** the operating firm is itself a contractor record; a subcontracted monitoring firm or temp
agency is a contractor of the **monitoring** kind (kinds: hauler, monitoring, crew, other); each
monitor has a system-issued **Monitor ID** (e.g. `M003490`, restated by the user 2026-09-25) plus
an optional employer-issued ID; each ticket half records its own monitor. Monitor time never has a
service code (consistent with ADR-063). **"Only one prime hauler" is corrected** (Q-108, ADR-108):
a project may have several primes, each with its own subs in up to two tiers, and subs are typed in
at certification.

## 4. Capacity is never typed; manual truck entry is flagged — **Q-98**

> **User, Build 1 (issue 05):** Certified capacity is a number baked into the moment an item is certified in the field. From that point forward(unless we override it with and approved update) that number in CY is what is used against the load call a monitor inputs on their device. They will NEVER put in the CAP themselves. Their device must pull from the truck list it downloaded. And when they scan the badge or placard it will populate their device with the equip info. If they have to type it in manually we mark that and allow it (sometimes equip info doesn't sync in time and they have to type it in manually) and in those cases where they do type it in, the CAP field should show with a cavaet to verify the CAP on the placeard matches what they are putting in. This should alert the back-office code to verify manual entry is accurate on submit.

**Now:** stands, and fits ADR-071 (an unknown truck never blocks). "Unless we override it with an
approved update" is the audited certification correction of ADR-079, not a monitor override
(ADR-078 still forbids an override of the computed capacity).

## 5. Disposal site permits — **Q-99**

> **User, Build 1 (issue 08):** Disposal sites always require permits.

**Now:** a fact to model (a site's permit, its status and documents). Build 1 left open whether
it applies to **every** kind of site (e.g. a municipal landfill that holds its own permits) →
**Q-99**.

## 6. Service code naming — **Q-101**

> **User, Build 1 (issue 07, the ask):** 1A for hanger tickets. 2A for larger hanger tickets. 1B for leaner 6-23 inches, 2B for leaner 23.1 to 36 inches, 2C for leaners over 36. Visually we need to map the service code to a name that people can identify, because when we report on things or invoice, people in this space have a common naming convention. And when there are things like distance or multiple contractors on a project we put it in the name for the code, so you end up with "0-10 miles to DMS", "10-20 miles to DMS". Service code and rule naming being alike is very common. That service code 1A, 1B, 3A used mostly for veg, 4A used mostly for C&D. We like to follow a very common nomenclature on these. … Make up a standard we can use over and over on projects and publish so others can adopt it easily.
>
> **User, Build 1 (on the proposed table — digit = class, letter = band):** These codes above look great. If we have the codes like this and the naming readable like the more verbose examples it will work great. But we dont need to use long namings like vegetative collection and haul.. It would read easier as (ROW VEG 0-10 miles to DMS)

**Now (2026-09-25, Q-101, ADR-109): no convention.** The user showed the legacy rule editor, where the
firm named its own codes (`6A`, `90A`, `40`, `12` …), and said "we want ours to mirror that". Service
codes are whatever the firm types from its contract; the system just lists them wherever a code is
picked. The Build 1 request for a published standard is superseded.

## 7. Distance belongs only to hauled loads — **Q-102**

> **User, Build 1 (issue 07):** It seems we got confused on which ticket types usually track distance. Unit rate work is always billed per the ticket details, not distance. Unit rate work is paid on the unit of work done. We do allow the option for a unit rate ticket to have items in it that are each payer items, but this is not very common. The only tickets that have distance attached are load-related tickets where something was hauled from one place to another. That distance is what we captured using the end collection GPS and the disposal GPS. So those ticket types are the only ones where distance is a factor. And we should see this when we add rules in the rules page and elsewhere.

**Now:** stands, with one refinement (2026-09-25, ADR-110): the distance is the **road route**, the
shortest legal truck route between the two end GPS points from our own routing server, not a
straight line. Rule conditions only offer what applies to the rule's ticket type.

## 8. "Everything is a form" — **Q-103**

> **User, Build 1 (issue 07):** … I would argue that everything is a form because if you really think about it, we have a monitor on one end using a field app to collect data by inputing it into an app that has a form built into it that they are filling out. Doesn't matter if they are making a ticket, a certification, a survey, an ROE, or even an incident. What makes a different is whether or not the result leads to a billable transaction. … We are literally building and destorying it over and over again just for testing and thats exactly what we want to do each setup and teardown until we nail this down to a science.
>
> **User, Build 1 (issue 07, the ask):** As I look at the list of tickets I notice we are putting incident reports, survey reports and ROE in there, when those Reports and Forms belong together in a list outside of tickets. … The section named "Money" needs to be named Billings. Money does not look right.

**Now:** stands as a UI rule for Phase 4: billable tickets in **Tickets**; incidents, surveys and ROEs
in **Reports and Forms**; the money section is **Billings**. How capture forms are defined is a
Phase 0 design task (`spec/ARCHITECTURE.md`).

## 9. Reporting (Phase 4) — kept for later

> **User, Build 1 (issue 05, the ask):** Each project will want to be able to report its work by day, week, month or some given date range, and often they will want to report only a specific debris stream, ticket type, site or contractor or some other detail. Reports are basically a big query turned into a pretty page. *(Requirements as recorded: easy to use in the back office; modern graphics; a map of where the data came from; not overly complicated; **totals for debris, not costs or billable amounts**; easy PDF export; a summary in a standard format for pasting into an email.)*
>
> **(The daily report):** For the daily report we really just want to think about like a pretty dashboard that we convert to a PDF. Each page is a presentation in landscape view showing detailed project info. To match the report outlined in the email the pdf starts with a full title page centered content, then a page that is basically the same body of the email outline repeated, but without stats. It is the index for the report but doesnt say that. Next page is the first item on the list in the previos page. So like the example email below, it would be ROW operations for this date. This one page breakdown shows all the details and a map summary of the debris or whatever was done on a map view (right side) Then we have Haul Out operations page, a Unit rate ops page, an Add'l Proj stats page, a project estimates and objectives reached, a page with the days ticket info like a table separated by type like a summary of ticket info and goals. But since we just had the estimates page this might not be needed. The last page is a end page like the cover page but it has Open ADMS centered with Open Recover small in the bottom right of the doc. And under the middle content an email from whoever setup this version of the ADMS to contact to be added to their distro for the report they are seeing. This way clients can share the PDF and others can easily request access. Later we can even build in something a little more automated with a human approval loop.
>
> **(The map):** WeasyPrint is not the only option out there. Lets not limit ourselves here. We can 100% make a beautiful PDF that shows a map view that has the days info on it as a heatmap or dots. That map can be a real map with real info and look great with no need to have licenses. Think outside of the box on this if needed but id imagine we can use something found on github that is regularly updated for it.
>
> **(The email summary):** edited the shape above to be how he images it. You'll need to adapt it so users are able to have it adapt to their projects and naming conventions easily. The above structure is sound.
>
> **(Remembering reports):** scratch this line from your thinking. We dont need to remember reports that are generated. Think of them like when we generated a PDF to print, nothing more

The email shape the user approved (section headings and debris lines come from the project's own
ticket types and debris types, not fixed text):

```
DR-4879 Greene County Debris Removal
Current Operations / Monitoring - September 4-5, 2026

ROW Debris Removal Operations:
• ROW Truck/Trailer Count       (8)trucks (7)trailers
• Vegetative        3,412 CY    (78 loads)
• C&D               1,206 CY    (31 loads)
• Mixed               340 CY    ( 9 loads)
  ------------------------------------------
  ROW Total         4,958 CY    118 loads

Haul Out Operations:
• Haul Out Truck/Trailer Count  (2)trailers
• Road FDS          2,100 CY    (14 loads)
  ------------------------------------------
  Haul Out Total    2,100 CY     14 loads

Unit Rate Operations:
• LHS Crew Count       (1)crew
• Hangers               35
• Leaners under 26"     4
• Leaners above 26"     2
  ------------------------------------------
  Total LHS            41 units

Add'l Project Stats:
• Incidents               1 filed, 0 open
• Monitors on shift      11

All figures in this report are pending final reconciliation
```

**Settled in Build 1 as engineering, still sound:** maps use OpenStreetMap data **served by the
install itself** (e.g. a regional `.pmtiles` extract), never the public OSM tile servers, whose
usage policy forbids offline use, bulk fetching and headless rendering; attribution in the footer.
→ `REQUIREMENTS-LATER.md` REQ-409…REQ-411.

## 10. Exports and photo PDFs (Phase 4) — kept for later

> **User, Build 1 (issue 03, the ask, as recorded):** Transactions need to be exportable. CSV, PDF, Excel-compatible, JSON, some standard web format. And the same for everything else: tickets, certifications, audit history, invoices. … One place to do it. An Exports tab … Photo PDFs built for an auditor. For items with photos, the PDF has to group photos differently depending on the item type … Multiple items per page where possible. But the images cannot be cropped or shrunk so far that they stop being viewable on a phone or a desktop during a quick audit review.
>
> **(Layout):** we can likely fit 2-3 ticket sets per page and still have enough detail in the images. That would crop them to about 50x50px and then we can stack 3 rows high and 3 across with the ticket details as a row the 3 images for each. Can then find creative ways to add the other details into the page. Can do it like that for regular PDF views. For the one with a reciept just do one per page. That should make it so everything has standard views and we have 2 main standard formats for the ticket/incidents/certications items with photos
>
> **(Receipts in the back office, issue 06):** When we are done I should be able to type in one or more ticket numbers, paste in a comma-separated list, and get back a PDF that has either just those receipts, or a full report with photos and all the ticket details with that receipt on the page …

**Now:** Phase 4 requirements (REQ-412…REQ-414). Certifications are an item kind with photos too.
"Invoices" here predates ADR-061 (there is no invoice record now).

## 11. Worker administration and permissions (Phase 2/4) — kept for later

> **User, Build 1 (issue 09):** As an admin, when I review workers I need to be able to see their permissions as a list and make changes to them directly. Right now we have several permission roles, but sometimes I need to be able to give granular permissions to workers so they can do certain things.
>
> There are multiple types of monitor roles: row-collection, haul-out collection, unit-rate-collection, row-disposal, haul-out disposal, disposal certification (allowed to certify equipment). Everyone can make incidents. Making ROEs or Surveys is assigned. Some of these might make sense as bundle options when creating users or adding to projects.
>
> I want to be able to easily give permissions to sets of workers, or take them away, and filter based on details.
>
> When I click on a monitor I should see their history and permissions and details, like a profile card of sorts, similar to the review page. If I need to edit some details I should be able to do it on that page by clicking an edit button or selecting permission options or projects. Basically this should make it so I can easily give or take away things from workers at the press of a button, and have that recorded so if I mess up I can undo what I did. Or be held accountable later.

**Now:** feeds REQ-202 and REQ-415. The monitor roles map onto what a device is set up for
(ADR-095): a device is set up for a project and the ticket types its user may make.

## 12. Installer behaviour — kept for Phase 0

> **User, Build 1 (issue 01):** If I run teardown then setup should run like a new run. If I already ran setup it should run like it is restarting from before, knowing the state, not asking me for things it already knows except to confirm what it knows is truthful and to ask if I want to resume.

**Now:** a requirement on the installer (REQ-007). Also: never print a database URL's password, and
never rotate the system's secrets (such as token signing keys) on a resume.

## 13. Back-office layout (Phase 4) — kept for later

> **User, Build 1 (issue 08):** The sidebar should not take up space when we do not need it. We should be able to easily close it. I think if we made it closed by default and then had an always-visible button in the top header on the left side that always allows us to click it to open or close the sidebar, and when we click away from it onto the page, or click something on it, it auto closes. On mobile this will also really help with navigation …
>
> Several table elements are not staying inside the view box. … On mobile the dashboard elements, some of them try to stay side by side, forcing the text content to grow outside the view box and look weird. … On the Org view outside project I still see a message above the table that is not needed. … We do not need these types of messages in the system.
>
> **User, Build 1 (issue 04, the dashboard):** The top of the dashboard is way too busy … Project Readiness belongs at the top … A five-day project should offer Today, Yesterday, This Week. A month-long project might add a month option. A year-long project might add the longer one …

**Now:** Phase 4 UI requirements (REQ-416).

## 14. How Build 1 went wrong — the user's read (process lessons)

Recorded in Build 1's own plan as "Ryan's read is correct", five points:

1. We never designed. We built a working system and then edited it. Every correction cost a
   migration, an API change, a UI change and a test change, at once.
2. We never made the field reality the foundation. Offline, printing, barcode scanning and the
   device's downloaded data are the four things a monitor touches every load, and all four were
   gaps.
3. We spent real time making Netlify and Railway spin up cleanly. Good outcome, wrong moment.
4. The repo was one undifferentiated thing. Nothing enforced a boundary, so nothing held one.
5. We proved the system by clicking it. There was never a way to run a whole project's worth of
   conditions as a script and read the result.

**Now:** these shape Phase 0 (`agent_store/NEXT.md`) and `spec/ARCHITECTURE.md` §15 (scenario
tests run from a terminal before any screen), §2 (boundaries the database enforces) and §4 (the
demo deploy comes last).

## 15. From the user's Daily Field Ops board — **needs confirming**

Build 1 read these off the user's Excalidraw board of the field app. They were drawings, not
answers; the user answered each on 2026-09-25:

| What the board showed | Question |
|---|---|
| The collection address is **auto-detected at the end** of the load and confirmed | **Q-104** ✅ "Get GPS", then "Get address info" (looked up if online, else typed) |
| "Skip ticket barcode" and "Skip badge barcode" buttons | **Q-105** ✅ typed numbers flagged; a reason is asked |
| A load call picker in steps (0, 5, 10, 15 …) | **Q-106** ✅ no picker: typed as a whole number, never prompted |
| Unit rate: a crew badge that stays active across tickets; Pre-work → Measure → Post-work chips per ticket; "Eligible Hanger" / "Ineligible Leaner" | **Q-107** ✅ crew kept on the phone only; no eligibility marking; QC status instead |
| A confirmation after every step ("You have selected 55%. Is that correct?") and a monitor scorecard | Phase 3 design; noted in `adms-field-app` §4A.7 |
| A bottom menu of Time, Map, Work, Chats, Settings | Phase 3 design; noted in `adms-field-app` §4A.7 |

**Superseded by this build:** the board showed one device working several projects in a shift.
The user has since decided a device is set up for **one** project (ADR-088, ADR-095).

# Sprint 3: the review workflow and the certification workflow

Source: "Review Workflow and Certification Measurement Requirements" plus the
v3 back office notes. Two workflows, related but separate. Certifications end up
in the review process, so the review spine has to exist before a certification
can be reviewed, but the two are designed on their own terms and neither is
collapsed into a generic approval flow.

Standing constraints from the last sprint still apply. The database is rebuilt
rather than migrated forward, so a correction to an existing table is folded
into the migration that defines it. `npm run setup` is untouched. No em dashes
or en dashes anywhere, interface copy included.

---

## 1. What is actually in the build today

Read before designing anything, so the plan separates what can move inside the
current architecture from what needs a structural change.

### Certification, as it exists

`database/migrations/0019_equipment_certifications.sql` and
`backend/app/routers/certifications.py`.

What is right and stays:

- Certification is per project, never copied between declarations.
- Nothing is edited. A new row supersedes the one before it, and the chain is
  the evidence.
- `method` separates a correction, which inherits `applies_from` and reaches
  back over tickets already priced, from a recertification, which counts
  forward. The trigger enforces the inheritance rather than trusting the caller.
- `adms_certification_in_force` resolves which measurement governs a service
  date; `trg_tickets_stamp_certification` snapshots it onto the ticket.
- `/certifications/{id}/impact` prices a correction before it is written.

What is wrong, and is the whole point of this sprint:

- `certified_capacity_cy numeric(10,2) NOT NULL` is typed by a human. There is
  no record of how the number was reached. The entire defence of a load ticket
  rests on a figure somebody keyed into a box.
- One number per unit. Real equipment is measured in several sections, with
  additions and deductions.
- Nothing captures container type, intended use or interior geometry.
- There is no certification evidence. No front, side, interior or placard
  photo, no measurement photos, and no required set to check against.
- A certification is `active` the moment it is written. There is no field
  submission and no review before it starts pricing work.

### Review, as it exists

`database/migrations/0021_ticket_review.sql`, `backend/app/routers/review.py`,
`frontend/src/pages/Review.jsx`, and the `TicketDrawer` in
`frontend/src/pages/Tickets.jsx`.

What is right and stays:

- The split between `ticket_flags`, which is what a detector noticed, and
  `ticket_reviews`, which is what a person decided. The decision is the record
  that matters, and a closeout package asserting loads were monitored is really
  asserting somebody looked at them.
- `adms_flag_ticket` is idempotent and clears a flag that has stopped being
  true, so re-running after a morning of corrections reports what the
  corrections fixed.
- Flags never block billing. A flagged ticket still invoices, it is just
  visible.
- Detector detail carries the numbers, so the queue can say what was seen
  rather than which rule fired.
- `monitor_accuracy` is a rate over reviewed work rather than a volume.
- Bulk decisions, worst first ordering, and the queue defaulting to unreviewed.

What is wrong:

- The whole spine is keyed on `ticket_id`. A certification, a permit, a
  contract or a survey cannot enter the queue at all.
- Reviewing one item means opening a drawer and clicking five tabs. Detail,
  Lifecycle, Images, Transactions, Audit. The evidence is behind a tab, the
  location is behind a tab, and the times are behind a different tab, which is
  exactly the navigation the requirements say to remove.
- The drawer's action row is `Correct`, `Re-run rules` or `Reprice`, `Void`,
  next to the close control. Void is destructive and sits one slip away from
  the X. Re-run rules is rare and sits next to the two common actions. Correct
  is the wrong word for what it does.
- Images render as a thumbnail grid with a lightbox, which was last sprint's
  fix for "the images are just icons". It is better, but the reviewer still
  cannot see which stage each photo belongs to, and nothing states what was
  supposed to be collected.
- Location is a normalised SVG polyline of waypoints with no basemap. It shows
  the shape of a route and answers nothing about whether an address is real.
  The GeoPortal comparison happens in another browser window.
- There is no age on a review item, no assignment, no alert, no escalation, and
  no way to see that the same issue keeps coming back from the same monitor.
- `ticket_reviews` has one row per ticket that is overwritten on each decision.
  There is no history of the review itself.

### What the rest of the system already gives us

- `ticket_types.stage_schema` and `field_schema` drive the field app from the
  database. That is where "what was supposed to be collected" already lives, so
  required evidence can be derived rather than reinvented.
- `ticket_media` carries `stage_code`, `captured_at`, latitude and longitude.
  Photos already know which stage they belong to. The reviewer just cannot see
  it.
- `ticket_waypoints` carries a GPS trail with timestamps, accuracy and speed.
- `documents` holds links, never files. Photo and document storage in this
  system is a URL, and certification media will follow the same rule.
- `project_sites.permit_status` is a permit. There is no permits table, so a
  permit enters review as a subject keyed on the project site row.
- Surveys do not exist yet as a record type. The spine will accept one without
  a schema change when they do.
- `adms_queue_reprocess`, transaction supersede, and the reprice path already
  handle money moving under a corrected measurement.

---

## 2. Certification workflow

### The principle

Do not record the answer. Record the measurements that produced the answer.

If someone asks how we determined a trailer is 30 CY, the certification has to
show the sections, the dimensions, the formula and the arithmetic. A manually
typed capacity with no measurement behind it becomes a reviewable defect
rather than a normal state.

### Why geometry matters, in money

A high side end dump with a rounded bottom. Interior length 288 in, interior
width 96 in, straight side height 60 in, bottom curve depth 14 in.

- Measured properly: vertical sides on a circular segment bottom. Segment
  radius 89.29 in, segment area 911.1 sq in, cross section 6671.1 sq in,
  volume 1,921,267 cu in, which is 41.18 CY.
- Measured as a box, height taken as 74 in floor to rail: 2,045,952 cu in,
  which is 43.85 CY.

That is 2.67 CY per load, 6.5 percent, on every load that trailer hauls. At
1,500 loads called at 80 percent it is roughly 3,200 CY of volume that was
never in the trailer. This is the same class of error as the tare read as 3
instead of 1 that put 40 CY on a trailer for five days, and it is why the
shape catalog is a fixed set of correct formulas rather than a free text field.

### Data model

Five new tables plus changes folded into 0019.

**`container_types`** (catalog, seeded, extendable per instance)

What is being measured, and what is expected of it. Fields: `code`, `label`,
`category` (truck body, trailer, rolloff box, other), `typical_use`,
`default_sections` jsonb (a starting worksheet template so the field user is
not building from nothing), `required_photo_slots` text array,
`typical_min_cy` and `typical_max_cy` for the sanity check, `diagram_key`,
`notes`, `is_active`, `sort_order`.

Seeded from the four families in `/EquipmentTypes` plus the common rest:
rolloff box, rolloff trailer, grapple truck body, high side end dump, round
bottom end dump, aluminum live floor trailer, walking floor, tandem dump
trailer, pup trailer, custom dump trailer, hooklift box, self loader.

**`measurement_shapes`** (catalog, seeded, fixed set)

The controlled set of calculation methods. This is deliberately not a CAD
system. Fields: `code`, `label`, `description`, `dimension_schema` jsonb
naming each dimension with its label and help text, `formula_note` in words,
`diagram_key`, `is_active`.

| code | what it is | dimensions | volume |
|---|---|---|---|
| `rectangular` | plain box | L, W, H | L x W x H |
| `tapered_sides` | sides slope, top wider than floor | L, H, W top, W bottom | L x H x (W top + W bottom) / 2 |
| `tapered_end` | headboard or tailgate rakes | W, H, L top, L bottom | W x H x (L top + L bottom) / 2 |
| `prismatoid` | all four walls slope | L and W top, L and W bottom, H | prismatoid rule, H/6 x (A bottom + 4 A mid + A top) |
| `round_bottom` | vertical sides on a curved floor | L, W, straight height, curve depth | L x (W x straight height + circular segment area) |
| `half_cylinder` | half round trough | L, diameter | L x pi x d squared / 8 |
| `cylinder` | round container | diameter, H | pi x (d/2) squared x H |
| `triangular_prism` | wedge section | L, W, H | L x W x H / 2 |
| `manual_volume` | computed off system | cubic inches, required note | as entered, always raises a review flag |

Circular segment area is computed exactly from the chord and the sagitta:
R = (W squared / 8s) + s/2, theta = 2 arcsin(W / 2R), area = (R squared / 2) x
(theta - sin theta). No approximation, because the number prices loads.

**`certification_measurements`** (one worksheet per certification)

`certification_id` unique, `container_type_code`, `intended_use`,
`measurement_method` (tape, laser, manufacturer drawing, other),
`measured_by`, `measured_by_name`, `measured_on`, `interior_only` and
`door_included` flags with the door rule stated in the interface,
`paper_form_number` so the digital record ties to the paper one the monitor
carries, `rounding_rule`, and the computed totals `total_cubic_inches`,
`total_cubic_feet`, `total_cubic_yards`, plus `device_notes`.

**`certification_sections`** (the shapes)

`measurement_id`, `sequence`, `label` ("main body", "side extension", "wheel
well intrusion"), `shape_code`, `role` in (`base`, `addition`, `deduction`),
`quantity` (two wheel wells is one row with quantity 2), `dimensions` jsonb in
inches, `computed_cubic_inches` written by trigger, `media_id` for the tape
measure photo of that dimension, `notes`.

Base plus additions minus deductions equals the total. The components are kept
so a reviewer can see how the number was produced.

**`certification_media`** (the evidence)

Mirrors `ticket_media`. `certification_id`, `slot` in (`front`, `rear`,
`side_left`, `side_right`, `interior`, `placard`, `measurement`, `paper_form`,
`other`), `storage_url`, `thumbnail_url`, `captured_at`, latitude, longitude,
`description`, `uploaded_by`. Required slots come from the container type, so
what is required is data rather than a hardcoded list.

**Folded into 0019**

- `status` gains `draft`, `submitted` and `rejected`. The partial unique index
  for one live certification per truck per project narrows to approved states,
  so two drafts never collide.
- `adms_certification_in_force` ignores anything not approved. A draft can
  never price a ticket.
- `certified_capacity_cy` stays on the row, because the ticket stamping path
  and the impact preview both read it, but when a worksheet exists it is
  written by the engine and refused from the API.

### The engine

Two SQL functions, so the field app, the back office, the reprice path and the
tests all compute the same number.

- `adms_shape_volume(shape_code text, dims jsonb) returns numeric` in cubic
  inches. Every formula lives here once. Unknown shape raises.
- `adms_certification_volume(measurement_id uuid)` sums the sections by role,
  writes the three totals onto the worksheet and the derived capacity onto the
  certification, and returns the breakdown.

A section trigger recomputes on insert and update, so the total can never drift
from its parts.

`POST /measurements/preview` runs `adms_shape_volume` over a worksheet that has
not been saved and returns cubic inches, cubic feet and cubic yards per section
and in total. That endpoint is what the field app calls while the monitor is
still holding the tape, which is how the device gives back the totals for the
paper form.

### Lifecycle

Field certification and data review are different stages.

    draft -> submitted -> approved (active) -> superseded or revoked
                       -> rejected

The field user identifies the equipment, takes the required photos, measures
the interior, enters the sections, reads the calculated volume, completes and
submits. Nothing prices a ticket until a reviewer approves. Approval is what
moves a row to `active` and runs the existing supersede and reprice path,
which means the impact preview a correction already shows now happens at
approval rather than at entry.

### Certification issue kinds

New detector, same shape as `adms_flag_ticket`, raising into the shared flag
table with `subject_kind = 'certification'`:

- `capacity_not_measured`: a capacity with no worksheet behind it. Every
  existing row starts here, which is the honest answer to how the current
  numbers were produced.
- `manual_volume_used`: a section bypassed the shape catalog.
- `capacity_outside_type_range`: computed CY is outside the container type's
  expected band.
- `deduction_share_high`: deductions remove more than a quarter of the base.
- `photo_slot_missing`: a slot the container type requires is empty.
- `placard_mismatch`: the certification number does not match the unit's
  placard code.
- `dimension_implausible`: interior width over 102 in, height over 144 in,
  length over 636 in, or any dimension at or below zero.
- `capacity_moved_materially`: a correction or recertification moves capacity
  more than 10 percent, cross referenced to the tickets it reprices.
- `measured_long_before_use`: measured date far behind the date it applies from.

---

## 3. Review workflow

### The spine

Generalise the two tables that exist, keyed on a subject rather than a ticket.

- `review_subject_kinds`: the registry. `code`, `label`, the permission that
  governs it, the source view that supplies its summary row, whether escalation
  applies. Seeded with ticket, incident, certification, permit, contract, and
  survey registered but inactive until surveys exist. Invoices are deliberately
  absent. They belong to an invoice analyst and are not data review work.
- `review_items`: one row per reviewable record, unique on
  (`subject_kind`, `subject_id`). Carries `project_id`, `state`, `issue_code`,
  notes, who decided and when, resolution, `assigned_to`, `first_seen_at` so
  age is real, `escalation_level` and `escalated_at`.
- `review_issue_kinds`: what a detector can raise, now with a `subject_kinds`
  array so certification checks never appear in a ticket filter.
- `review_flags`: what a detector noticed, keyed on the subject, unique on
  (`subject_kind`, `subject_id`, `issue_code`), still idempotent, still
  cleared with a reason when it stops being true.
- `review_events`: append only. Opened, flagged, noted, alerted, escalated,
  approved, reopened. This is what makes "how long has it waited" and "has this
  been escalated" answerable, and it is the history `ticket_reviews`
  overwrote.
- `review_alerts`: an issue sent to a person or a role, with acknowledgement.
  In app only for now, with the channel column present so email is an addition
  rather than a rewrite.
- `project_review_policy`: per project thresholds. Age before an item is
  overdue, repeat count and window before a pattern is called, who a kind
  escalates to.

`ticket_review_queue` and `monitor_accuracy` are rebuilt over the spine and
keep their names and columns, so the existing screens and the existing API
tests keep working while the new surfaces are built.

### The queue

Still a list, because a list is still useful. It answers the eight questions
the requirements ask for, in columns: what needs review, what kind of record it
is, why it needs review, the record information, how long it has waited,
whether there are existing issues, whether it has been reviewed or escalated,
and whether the same issue is recurring.

The recurrence signal comes from `review_issue_patterns`, a view grouping open
and recently closed flags by kind, issue code and the party involved (monitor,
contractor, unit) over the policy window. A row reading "fourth time this week
from this monitor" is a different decision from a row reading "first time", and
the queue says which.

### The detail

One scrollable view, no tabs, adapting to record kind. The conceptual sequence
from the requirements, in order:

1. Identity: record number, kind, project, state, age, value.
2. Why it is here: each flag with the numbers that raised it.
3. Location: satellite map, the recorded address against the GPS point with
   the distance between them named, origin and destination, haul line, and the
   same monitor, truck and trailer's other tickets that day as context.
4. Time: the event sequence with every gap labelled in minutes, and the day's
   sequence for that unit, so the question is whether the story is believable
   rather than whether a timestamp exists.
5. Relationships: monitor, driver, truck, trailer, contractor, and the
   certification in force with its measured capacity, linked.
6. Measurements: the arithmetic shown. Certified capacity times load call
   equals billable volume for a load ticket. The full worksheet with per
   section math for a certification.
7. Evidence: photos at a size a person can judge, grouped by stage or slot,
   each labelled with what it is and when it was captured. Required versus
   collected is stated, derived from `stage_schema` and `requires_photo` for a
   ticket and from the container type for a certification. A missing required
   photo renders as a labelled gap, not as an absence.
8. Notes: what the monitor wrote.
9. Rule compliance: what this project and this ticket type allow. Debris
   streams enabled, site active on this declaration, rate in force, evidence
   the type demands. The system surfaces the rule; it does not decide for the
   reviewer.
10. Related records: the previous and next ticket for that unit, and other
    records carrying the same issue from the same monitor.
11. Decision: approve, flag with an issue, update, alert, escalate.

Incidents lead with images, because that is the first thing wanted on an
incident. Certifications lead with the worksheet and the four required photos.
Load tickets lead with location and time. Same spine, different order.

### Action safety

- `Correct` becomes `Update`.
- `Void` leaves the action row and moves into an overflow menu, still behind
  its reason dialog.
- `Re-run rules` and `Reprice` join it there, since they are rare.
- `Approve`, `Flag` and `Update` are the only exposed actions, and the close
  control moves away from anything destructive.
- Keyboard: A approves, F flags, U updates, J and K move through the queue
  without leaving the view. A reviewer working three weeks of tickets should
  not be opening and closing a modal for each one.

### Outcomes

Approve. Flag with an issue and a note. Update the record. Alert the person or
team who has to act. Escalate.

Escalation is suggested, never automatic, and it is suggested for the reasons
the requirements give: too much time has passed, the same problem keeps
occurring, a pattern is developing, or the thing needs management rather than
another correction. `adms_review_escalation_candidates(project)` returns the
items that qualify and why, against the project policy thresholds. A person
decides.

Waiting review work surfaces on the dashboard and in the alerts feed that
already exists, so the queue is not the only place a person learns there is
work.

### Location, honestly

Leaflet with a configurable basemap tile URL, defaulting to Esri World
Imagery, which needs no key and matches the ArcGIS imagery already in use. The
URL is an instance setting so a self hosted or air gapped install can point at
an internal tile server. With no tile URL the panel degrades to plotted points
and the haul line on a plain ground, which is worse but never broken.

This does not replace the GeoPortal. It removes the second browser window for
the common case: does this address, this GPS point and this sequence of the
day's tickets make sense together.

---

## 4. Phase order

Each phase leaves the build working and all three suites green.

| # | Phase | Leaves working |
|---|---|---|
| 1 | Review spine schema. Generalise the tables, rebuild the queue views over them, move the ticket detectors across unchanged. | Existing review screens and API unchanged, now on a spine that accepts other kinds. |
| 2 | Certification measurement model and engine. Catalogs, worksheet, sections, the two SQL functions, the sanity rules. | Capacity derivable from measurements, old rows still priced from their typed number and flagged for it. |
| 3 | Certification lifecycle and evidence. Draft to submitted to approved, photo slots, the certification detector. | Certifications are reviewable records. Only approved ones price tickets. |
| 4 | Measurement and certification API, including the stateless preview. | Both clients can compute and save a worksheet. |
| 5 | Unified review API. Queue across kinds, per kind review bundle in one read, decision, alert, escalate. | The data the new screens need, in one call per record. |
| 6 | Certification worksheet screen. | A measurement can be built and read in the back office. |
| 7 | Review queue list across kinds. | One morning queue instead of several. |
| 8 | Review detail rebuild, including action safety. | The tab drawer is gone for review work. |
| 9 | Location and time panels. | The GeoPortal comparison happens in the review view. |
| 10 | Alerts, escalation, repeat detection. | The outcomes the requirements list. |
| 11 | Field app worksheet. | The monitor with the tape measure enters it where the work happens. |
| 12 | Demo seed, tests, docs. | Everything above is demonstrable and verified. |

## 5. Verification

Same three gates as last sprint, run at the end of every phase.

- Schema: `./database/setup.sh --with-demo --test`. New assertions for the
  volume functions against hand computed figures, for the one live
  certification per unit rule under drafts, for a draft never pricing a ticket,
  and for flag idempotency on the shared spine.
- API: `cd backend && python3 -m pytest`. New tests for preview arithmetic
  matching saved arithmetic, worksheet submit and approve, the certification
  detectors, and the cross kind queue.
- Browser: `npm run test:ui`. Steps for building a worksheet, submitting it,
  reviewing it, and working the queue by keyboard.

The volume engine gets its own assertions computed by hand and checked in, both
the rolloff and the round bottom examples above, because a formula that is
silently wrong is the failure mode that costs the most here.

## 6. Out of scope, recorded so nobody reopens them

Invoices in the review queue. Surveys as a record type, beyond the spine
accepting one. Automated GPS drift correction. Replacing the GeoPortal. A CAD
geometry editor. Email or SMS alert channels. The demo versus production
volume work in the v3 notes, which is a separate pass.

---

# Progress

## Shipped, phases 1 to 6

The whole data model and API for both workflows, verified from an empty
database. 206 schema assertions and 177 API tests, green on a fresh build and
green again on a re-run against the same database.

### Migrations

- `0021_review.sql` replaces `0021_ticket_review.sql`. The file was renamed
  because it no longer describes tickets: `review_items`, `review_flags`,
  `review_issue_kinds`, `review_events`, `review_alerts`,
  `review_subject_kinds` and `project_review_policy`, all keyed on a subject
  rather than a ticket. `ticket_review_queue`, `ticket_flag_kinds` and
  `monitor_accuracy` are kept as views over the spine so nothing that already
  read them had to move. `review_subjects` is the seam a new record kind is
  added at; `review_queue` above it never changes. `review_issue_patterns`
  counts a run of the same issue from the same monitor, and
  `adms_review_escalation_candidates` names what qualifies and why.
- `0019_equipment_certifications.sql` gains the lifecycle: draft, submitted,
  rejected alongside active, superseded and revoked. Capacity is nullable
  because a draft exists before the tape comes out.
  `adms_certification_in_force` now only sees approved rows, so a draft can
  never price a ticket, and a new BEFORE UPDATE trigger does the supersede
  handover at approval and refuses an edit to a certification in force.
- `0024_certification_measurement.sql` is the measurement model:
  `measurement_shapes`, `container_types`, `certification_measurements`,
  `certification_sections`, `adms_shape_volume`, `adms_certification_volume`
  and `adms_round_capacity`. Nine shapes, eleven container types. The capacity
  is written by the engine and refused from anywhere else.
- `0025_certification_review.sql` is the evidence and the detector:
  `certification_media` with photograph slots, `certification_evidence` for
  required against collected, `adms_flag_certification` with nine checks, and
  the certification branch of `review_subjects`.
- `0026_review_evidence.sql` makes ticket evidence data driven.
  `ticket_evidence` reads the photographs a ticket type declares in
  `field_schema` and compares them to what came back, `adms_flag_ticket` uses
  it instead of counting, and `review_evidence` answers the same question for
  any kind of record.
- Folded in: `ticket_media.slot` in 0007, so a photograph knows which required
  one it is. The demo seed names them, and a measurement photograph is declared
  on unit rate work.

### API

- `measurements.py` is new. The catalogs, the stateless
  `POST /measurements/preview` the field app calls while the tape is still out,
  worksheet create and replace, sections, and the certification photographs.
- `certifications.py` gains the lifecycle. Posting without a capacity opens a
  draft to be measured; submit, approve and reject are the review stages, and
  the supersede plus reprice now happens at approval rather than at entry.
  A capacity that is still typed directly is allowed and flagged, never
  silently accepted.
- `review.py` gains the unified surface: `/review/queue` across kinds with the
  repeat signal attached per page, `/review/overview`, `/review/patterns`,
  `/review/escalations`, the one read `/review/{kind}/{id}` bundle, and the
  outcomes: decision, note, alert, escalate, inbox, acknowledge. One button
  re-checks tickets and certifications together.

### What the detectors found in the demo data

Running the checks over the seeded project, before any of the new screens
exist:

- 20 certifications carrying a capacity with no measurements behind it, which
  is every certification the demo ever had.
- 18 haul out tickets missing `destination_photo`. The type asks for a
  photograph at the DMS and one at final disposal; the demo only ever had the
  first. The flag names the missing one rather than saying "not enough photos".
- 5 tickets with no photograph at all, 2 with weight against volume outside
  the stream density, 1 with no coordinates.
- One certification whose capacity moved more than ten percent, cross
  referenced to the tickets it reprices.

## Remaining, phases 7 to 12

The screens, the field app, and the demo seed. Nothing below is blocked: the
data and the endpoints they read are in and tested.

7. Certification worksheet screen.
8. Review queue list across kinds.
9. Review detail rebuild, including moving Void into an overflow menu, renaming
   Correct to Update, and the keyboard path through a queue.
10. Location and time panels, with a configurable satellite basemap.
11. Alerts and escalation surfaced outside the queue.
12. Field app worksheet, demo seed with measured certifications, and the
    browser walk.

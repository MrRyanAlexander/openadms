# Open ADMS — Current decisions and gaps, at a glance

**The present tense of the project on one page.** `DECISIONS.md` and `DEVIATIONS.md` are the full
history, with 352 ADRs and 71 KDs, many superseded. This page says what is true **now** and which
entries to cite. The reasons live in the ADRs and the skills.

- **Keep it current:** when you add, amend or supersede an ADR, or open or close a KD, update this
  page **in the same response** (`adms-decisions`).
- **If this page and a log entry disagree,** the newest ADR wins: fix this page and say so.
- Updated 2026-10-05, through ADR-355 / KD-72. **Task 1.6.3, actions to lines, is done (ADR-355): `packages/domain/src/ticket-pricing.ts` turns the passing rules into priced lines and raises the pricing flags; the user answered three money points (an amount to the cent a half up; a crew day to four decimals; hours in no step bill nothing, flagged); 83 of 114 pricing scenarios pass at the domain; the worker doesn't price yet (1.7.2); see "Pricing and the ledger"; next 1.6.4, the setup check.** **Task 1.6.2, criteria, is done (ADR-354): `packages/domain/src/ticket-rules.ts` says which rules may run on a ticket and which pass; a line that compares with something the ticket doesn't have never passes (the user); 35 of 114 pricing scenarios pass; see "Pricing and the ledger".** **Task 1.6.1 is done (ADR-353): pricing's acceptance scenarios, `spec/acceptance/07-pricing-ledger-audit.md`, 114 (AC-07-…), a draft for the user; see "Pricing and the ledger".** **Task 1.5.9, the worker's run, is done (ADR-352; see "Reconciliation and review"): `apps/worker/src/reconciliation/` draws every ticket of a project again from its field events and setup and writes its status, zone, mileage, quantity, completed record and flags, one ticket in one piece of work, one run per project at a time; the story `p1-reconciled` shows P1's Monday and Tuesday reconciled, unpriced; 137 of the 165 reconciliation scenarios pass, fourteen more in part; Milestone 1.5 is done; next 1.6.1, the acceptance scenarios for pricing.** Before it: **Task 1.5.8a is done (ADR-351): the example world stands on the pinned map extract everywhere (every fixture, test, story, P1's map and the spec rows); the points picked for Bayline Transfer Station, Old Quarry Pit, the four addresses and ticket 101002's property are in `spec/CONVENTIONS.md` §6, each measured by road; the made-up points round 27.98° N, 82.40° W are retired; next 1.5.9, the worker's run.** Before it: **The user answered task 1.5.8's four points (ADR-350): a route never crosses a private road (the worker now asks for the route by distance as a car drives it; the server's plain `shortest` was seen cutting along dirt farm tracks); nothing more is stored for a mileage's two ends; mileage is shown with the transactions in every export; and the example world moves onto the pinned map extract in a task of its own, 1.5.8a, which is next.** Before it: **Task 1.5.8, mileage, is done (ADR-349; see "Reconciliation and review"): the worker asks our routing and address servers for the road point nearest a collection's end GPS, its address and the shortest road route to the site's own GPS (`apps/worker/src/mileage/`), and `packages/domain`'s `mileage.ts` says what is kept, the flagged straight line, and when a kept mileage stands; 118 of the 165 reconciliation scenarios pass, seventeen more in part; next 1.5.9, the worker's run.** Before it: **The user approved the last two flags' words (ADR-348): `SCALE_NET_DISAGREES` (a scale receipt's net isn't its gross less its tare) and `TWO_QUANTITIES` (a disposal with a load call and a scale weight) are in the catalogue, now 77 flags, and built; 116 of the 165 reconciliation scenarios pass, fifteen more in part; next 1.5.8, mileage.** Before it: **Task 1.5.7 is done (ADR-347; see "Reconciliation and review"): the checks on quantity (`quantity-checks.ts`), on the pay item's settings, unit rate work and a crew's hours (`unit-rate-checks.ts`, which also gives the worker's own pay item) and on ROEs and surveys (`roe-checks.ts`); 114 of the 165 reconciliation scenarios pass, sixteen more in part; two flags (AC-06-158, 162) were then put to the user (answered, ADR-348).** Before it: **Task 1.5.6, checks on place, is done (ADR-346; see "Reconciliation and review"): the one geodesic module (`geodesic.ts`, through `geographiclib-geodesic` 2.2.0, the domain package's first dependency), a point in a shape (`ShapeArea`), and `place.ts`'s checks against the boundary, the zones, a site's area, dates and facts, and a site's permit; 80 of the 165 reconciliation scenarios pass, seventeen more in part; next 1.5.7.** Before it: **The user answered task 1.5.5's flags (ADR-345): the six wordings stand ("Yes to all"), three backup catches flag what should be impossible, and a photograph removed from a record never counts towards what the record must have. The catalogue is 75 flags (`spec/FLAGS.md` §3.10); all nine are built; 65 of the 165 reconciliation scenarios pass, fifteen more in part; next 1.5.6, checks on place.** **Task 1.5.5 is done (ADR-344; see "Reconciliation and review"): the flag catalogue is one closed set in `packages/domain` (`flags.ts`), every message held word for word to `spec/FLAGS.md` by a test, and the checks between a ticket's field events, on the certification and on its times are `checks.ts`; a flag keeps its facts and their SHA-256; 56 of the 162 reconciliation scenarios pass, sixteen more in part; the six flags of ADR-329 that fall to this task wait for the user's words; next 1.5.6, checks on place.** **Task 1.5.4 is done (ADR-343; see "Reconciliation and review"): the quantities are one module of `packages/domain`, `quantities.ts`, in exact decimals: capacity × load call, a split's shares, a split haul-out's piles, a tandem's one weight, the carried tickets, the stump's CY and fill, each to the digit of the golden mission; 25 of the 162 reconciliation scenarios pass, seventeen more in part; next 1.5.5, checks and flags between events and on the certification.** **The user answered KD-71 (1) (ADR-342): two collections on one certification with overlapping loading times flag both tickets; the one the truck dumped under still bills, in review, and can't be locked as invoiced until its flag is fixed or accepted.** **Task 1.5.3 is done (ADR-341; see "Reconciliation and review"): grouping and status are one module of `packages/domain`, `tickets.ts`: field events are gathered into tickets on project, workflow and number and nothing else, a ticket missing a field event is `PENDING`, a whole one `MANUAL_REVIEW` while a flag is open and `COMPLETED` otherwise; 15 of the 162 reconciliation scenarios pass, thirteen more in part; next 1.5.4, quantities.** **Task 1.5.2 is done (ADR-340; see "Reconciliation and review"): the derived records are built as `spec/DATA-MODEL.md` §5 has them, all but `Transaction`: the completed load and haul-out with a row for each collection, `Flag` with the catalogue's 66 codes, the worker's runs and decisions, and the zone, map version and worked-out pay item on a field event; only the worker's login writes them; a disposal has one completed record, a collection is a live row of one; next 1.5.3, grouping and status.** **Task 1.5.1 is done (ADR-339): `spec/acceptance/06-reconciliation.md`, 162 scenarios, decides nothing: every flag of the catalogue (66 today) word for word, each thing never flagged, the quantities, how a flag behaves, what the worker writes; eighteen points left to the tasks that build them (BACKLOG C70); KD-71 open for the user; next 1.5.2, the derived records.** **Task 1.4.2, intake, is built (ADR-338; see "Tickets and numbers"): `apps/api`'s `Intake` takes each record a phone sends and answers it saved, already saved or not saved; a second field event of one kind on one ticket, and an ROE whose number is taken, are kept whole in `QuarantinedRecord`; an impossible GPS fix is kept as sent in `FieldEvent.unreadableGps` and the record saved without it; 43 of the 56 sync scenarios pass; Milestone 1.4 is done; next 1.5.1, the acceptance scenarios for reconciliation.** **C67 (e) is built (ADR-337): a photograph's record holds the back office's two marks, removed from the record (`Photo.archivedAt`, a mark: nothing is deleted, cleared to put it back) and a label (`Photo.label`, free text, never blank), each corrected by the API and audited, both shown to a client user and an auditor; next 1.4.2, intake.** **C67 (d) is built (ADR-336): every read-only viewer's record says whether they see private citizens by name (`User.seesPrivateCitizens`, default yes, the domain's); an ROE's owner and a drop-off log's resident and origin address are granted to no viewer and shown only by `viewer_roe_citizen` and `viewer_drop_off_log_citizen`; next C67 (e), then 1.4.2.** **C67 (c) is built (ADR-334): an incident may name the contractor involved, a cert number and an ROE number, each optional, and the project's incident form's `incidentOffers` says which a phone shows; next C67 (d), (e), then 1.4.2. The user approved acceptance files 01…05 (ADR-335).** **Task 1.4.1 is done (ADR-333): `spec/acceptance/05-sync.md`, 56 scenarios, decides nothing; sixteen points are left to the tasks that build them (1.4.2 mostly); next C67 (c), (d), (e), then 1.4.2.** Task 1.3.7 is done (ADR-332): Milestone 1.3 is done. **C67 (a) and (b) are built: certification copying is out of the schema, the service, the domain and the story (ADR-330), and a scale receipt's number is no longer unique (ADR-331: the key dropped by the fifty-seventh migration); C67 (c)…(g) are not.** **The user answered the agent defaults of 1.3.2…1.3.6 (ADR-328; §4): certifications are never copied, a scale receipt's number is never unique, an incident may name a contractor, cert number and ROE number, a viewer's sight of private citizens' names is the firm's choice. The first two are built (ADR-330, 331); the others not yet (BACKLOG C67).** **Task 1.3.6, ROEs and forms, is done (ADR-327; see "Field events").** Task 1.3.5, scale receipts and photographs, is done (ADR-326). Task 1.3.4, what each kind of field event records, is done (ADR-325). Task 1.3.3, what every field event records, is done (ADR-324). Task 1.3.2, numbering, is done (ADR-323; see "Tickets and numbers"). Rounds 13–26 are answered (ADR-145…228).
  **Phase 1 (data core and engine, rebuilt) is open, at the user's word (ADR-299).** Its plan is
  `BACKLOG.md`'s ten milestones and 47 tasks, one task per response, each milestone opening with
  its part's acceptance scenarios in `spec/acceptance/` (ADR-300). Done: the plan,
  `spec/acceptance/01-setup.md` (82 scenarios) and **1.1.2, the firm's lists** (ADR-302: eighteen
  list tables, the six built-in keys in `packages/domain`, their guards and starting values) and
  **1.1.3, the client, the declaration event and the project in full** (ADR-303: the project's
  settings start in `packages/domain` from policy values, whose built-in defaults are
  `packages/domain/policy.env`) and **1.1.4, contractors on a project, and contracts** (ADR-305,
  306: a contractor's kind, contact details and merge link, its one place on a project, the
  contract; the database holds "the prime" to one of the project's primes) and **1.1.5, forms, the
  debris types on them, field tags and the firm's own fields** (ADR-308: at most one form of each
  document type on a project; debris types only on a load or haul-out form; the firm's own fields
  only on an ROE, survey, incident or drop-off log form, versioned per form, never edited; KD-66
  closed) and **1.1.6, pay items in full** (ADR-309: payable type, Unit of Measure, kind of work,
  size band, capture settings, crew time's conversion; a rate for each of the project's primes; a
  crew day's steps; an assignment names only unit rate pay items; size bands checked in
  `packages/domain`) and **1.1.7, disposal sites in full, and the project map** (ADR-311: a site's
  type, facts, GPS, dates, labels, tipping fee pay items, own shapes; map versions and zones, never
  edited; the database refuses *Haul-outs leave here* off a TDSR/DMS site; shapes as GeoJSON) and,
  at the user's word, **the `btree_gist` extension** (ADR-310: the database refuses overlapping size
  bands) and **1.1.8, rules** (ADR-313: a rule on one of its project's ticket forms, naming one of
  its contracts; its criteria, picked values, actions and chosen items; the database holds a picked
  value to the rule's own project and an operator to its criterion's kind; `packages/domain` says
  which criteria a form takes, works out "Is valid", refuses an exact copy, warns of an overlap and
  writes a pay item's "Pays when" rules). 62 of the 82 scenarios pass, and AC-01-27, 48 and 55 in
  part. **1.1.9, the acceptance scenarios for people and devices** (ADR-314:
  `spec/acceptance/02-people-and-devices.md`, 74 scenarios; 28 are what Phase 0 built, each naming
  the test that proves it, and take their IDs in 1.1.10; seven and two in part are 1.1.10's; 28 wait
  for Phases 2–4; ten points nothing settles are listed for the task that decides each).
  **1.1.10, people's permissions and viewers** (ADR-315: a manager/analyst's permissions, each
  its own grant, taken away by archiving; a read-only viewer's kind, contractor and projects; the
  database reads what a viewer may see from their own record, the API stating only who is looking;
  a client user and an auditor see their projects' whole setup, a contractor user none of it; no
  viewer a contact or a person; a phone's revoked key's time). 35 of Part 2's 74 scenarios pass at
  the database, four more in part, each under a test named by its ID.
  **1.1.11, the example world's setup as a story** (ADR-316: the first services in `apps/api`,
  one class per group of setup records, each call one `$write` as the person; the story `setup`
  writes P1 and P2 in the spine's order, 51 checks; `MapShapes` in `packages/domain`; a map
  version's loaded time is the database's, KD-68 closed). **Milestone 1.1 is done.**
  **1.2.1, the acceptance scenarios for certifications** (ADR-317:
  `spec/acceptance/03-certification.md`, 60 scenarios, none passing yet; 11 are the capacity math's
  (1.2.2), 25 the records' (1.2.3); every capacity example is `adms-certifications` §3A.3's or worked
  on the page; fourteen unsettled points listed for the task that decides each, C61; **KD-69 closed by the
  user, ADR-318**: the golden mission's 102001 scanning `730416` on P2 stands, since a cert number
  is unique per project only).
  **1.2.2, the capacity math** (ADR-320: `Capacity` in `packages/domain`, exact hundredths, 24
  tests; AC-03-21, 23, 24, 25, 27, 28, 31, 32 pass and 22, 26, 29 in part; the three containers'
  boxes in `spec/CONVENTIONS.md` §6).
  **1.2.3, the certification's records** (ADR-321: `Certification`, `CertificationBox`,
  `CertificationHelper`; a container holds boxes and a capacity, a crew neither; one number,
  unique on its project; a sub typed at certification placed under its prime; replaced, copied,
  revoked, never deleted; the service `Certifications` and the story `certification`; 36 of Part
  3's 60 scenarios pass; KD-70 found and closed). **Milestone 1.2 is done.**
  **1.3.1, the acceptance scenarios for tickets and numbers** (ADR-322:
  `spec/acceptance/04-field-capture.md`, 98 scenarios, none marked passing yet; it covers what is
  recorded, never what the worker concludes; 9 are numbering's (1.3.2), 21 and 36 the field
  event's (1.3.3, 1.3.4), 8 scale receipts' and photographs' (1.3.5), 10 the forms' (1.3.6), 9 the
  day's story (1.3.7); eighteen unsettled points listed for the task that decides each, C63).
  **1.3.2, numbering** (ADR-323), **1.3.3, what every field event records** (ADR-324) and
  **1.3.4, what each kind records** (ADR-325: 62 of Part 4's 98 scenarios pass, three more in
  part; 67 of Part 1's 82) and **1.3.5, scale receipts and photographs** (ADR-326: 73 of Part 4's
  98 pass, one more in part; 39 of Part 3's 60) and **1.3.6, ROEs and forms** (ADR-327: 84 of Part
  4's 98 pass, none in part). **Next: task 1.3.7, the harness's phones capture every kind.**
  **Corrected by the user 2026-10-02 (ADR-301):** a pay item's **code is unique on its project**
  (ADR-147 had it backwards); a pay item is its code and its **description**, with no separate name
  and no "line number"; **an exact duplicate of a rule is refused before it is saved**.
  **The golden mission (`spec/golden/MISSION.md`) is approved by the user, numbers included
  (ADR-297):** P1's ledger is $5,548.25 on 19 lines, P2's $324.00.
  **Phase 0's tasks are all done (ADR-282…287):** the map servers in the local stack, the guard hook
  tested, `spec/DATA-MODEL.md` and `spec/FLAGS.md` drafted, an assignment's pay items, the REQ list
  closed out (17 of 17: REQ-002 ticked with the user's first commits, nine on branch
  `phase0-foundation`, ADR-288; a git block stages named paths, never `git add .`). **`spec/DATA-MODEL.md` and
  `spec/FLAGS.md` are approved (ADR-289, 290); all thirteen of the data model's points are settled
  (KD-65 closed, ADR-292…295); the user opened Phase 1 the same day (ADR-299).**
  **The roadmap, start to finish, in tables: `agent_store/ROADMAP.md`** (ADR-280), the user's page;
  it summarises the state files and is updated at every close-out.
  **Agents leave nothing running** (ADR-277): the local stack is started for a task (`pnpm local:up`)
  and stopped at its close-out (`pnpm local:down`, `adms-close-out` §0), with throw-away databases,
  containers and volumes gone; something stays up only with a line in `NEXT.md` saying why.
  **Newest (ADR-239…241):** a rule names one contract and runs only on its prime's tickets; a phone
  is **enrolled once** and each day's **assignment** (from the back office's **dispatch board**) says
  who works where on what; phones sync whenever there's signal; the **time clock** hangs on the
  assignment.
  **Docs truth-up done (ADR-247…253):** every spec page and REQ is in today's rules, and **every
  skill is current**, `adms-verify` included (rewritten for the new chain by 0.2.2, ADR-259).
  **Each monitor's record under a ticket number is a field event** (ADR-236): the system's records
  are conclusions drawn from events.
  **Names and examples follow `spec/CONVENTIONS.md`** (ADR-234, 235, 237): **pay item** (not
  "Service" or "service code"), field event (not "half"), payable type (not "Classification"), debris type (not "debris class"), site type and
  the plain site facts, field tag, tipping fee. Examples come from its example world, never from the
  retired list.
  **Product discovery is closed (ADR-230, the question shot-clock)**: no questions are open; the
  former agent readings (ADR-205 (2), 208, 209, 214, 215, 218) stand as agent defaults; two design
  tasks (Q-166, Q-167) are ours. **Milestone 0.2 (scaffold) is done:** the monorepo skeleton (0.2.1, ADR-255…258), the test runner (0.2.2, ADR-259…261), the local stack (0.2.3, ADR-263, 264) and the installer (0.2.4, ADR-265, 266). **0.3.1 is done** (ADR-267, 268: Prisma 7.10.0; nine provisional models; the first migration applied by `pnpm installer`). **0.3.2 is done** (ADR-270: nine guard migrations), **and 0.3.3** (ADR-272: 94 database tests, every grant and refusal, each guard's removal caught), **and 0.3.4** (ADR-273: the actor extension `$write`, the seeded system actor); **Milestone 0.3 is done**, **and 0.4.1** (ADR-275: the scenario harness, `pnpm scenarios`), **and 0.4.2** (ADR-276: the system actor's guard and `pnpm security`), **and 0.4.3** (ADR-281: the time zone, device, assignment and Monitor ID models; the master passcode's hash in the database); **Milestone 0.4 is done and Phase 0's seven exit criteria are met.** **Milestones 0.1 and 0.2b are done too** (ADR-283…285). **Next:** Phase 1, open since 2026-10-01 (ADR-299): task 1.1.5 (`NEXT.md`).
  **Where the product ends up and the road there:** `NEXT.md`, "Handoff" (ADR-225).

---

## 1. Current rules, by topic

Cite the ADRs in brackets. Each topic's detail is in the named skill.

### Foundation, stack and security — `spec/ARCHITECTURE.md` (**approved in full**, §1–§18) [104, 139, 141, 143, 144]
- **Security first, at every layer.** The plan (skills, spec, ADRs) is the core; **`database/` is
  historical** (read-only), and the engine is rebuilt 100%. **Phase 0 (Foundation)** came first:
  approve the architecture, answer the foundation questions, scaffold, prove the database
  hardening, run the scenario harness. Then the rebuild: **Phase 1, open since 2026-10-01**. [093,
  103, 299]
- **TypeScript on Node end to end, Prisma** (multi-file schema, readable class-style code, no
  hand-written SQL for modelling). Rules that must match on phone and server live once, in a shared
  domain package. Python leaves the core. The §3 stack table is approved (NestJS on Fastify, Zod contracts, a Postgres job queue, React + Vite, Capacitor, encrypted SQLite, Caddy…); each exact package and version is pinned by an ADR when added. **Milestone 0.2 (scaffold) is done.** [143, 266] **The skeleton (0.2.1):** a **pnpm 11.27.1** workspace, settings in `pnpm-workspace.yaml`: no version younger than 7 days, no install scripts unless an ADR allows one by name, exotic sub-dependencies refused, engines strict, exact versions; **Node 24 LTS** (`.nvmrc` 24, `engines` `>=24.21.0 <25`); eleven private `@open-adms/…` workspaces (§18 plus `tools/licences`), licence field `AGPL-3.0-only` (agent default) [255]. **TypeScript 6.0.3** strict (not 7: typescript-eslint supports only <6.1), one `tsconfig.base.json`, project references, `pnpm typecheck` = `tsc --build` [256]. **ESLint 10 + typescript-eslint (strict, type-checked) + Prettier**, `pnpm lint`; Prettier never touches `spec/`, `agent_store/` or `.claude/` [257]. **`pnpm licences`** fails on any licence refused or undecided [258]. **Tests (0.2.2):** **Vitest 5.0.1 on Vite 8.3.0**, one run from the root, `pnpm test` = `tsc --build && vitest run`; tests in `<workspace>/test/` with their own tsconfig (typechecked and linted, never in `dist/`); a workspace joins `vitest.config.js` with its first test [259]. **`contracts` (Zod 4.6.5) depends on `domain` only; `domain` on nothing**; both hold only a wiring probe until Phase 1 [261]. **The local stack (0.2.3):** `infra/local`, one compose project run by `pnpm local:up` / `local:down` / `local:wipe` / `local:status`: **Postgres 18.6**, **SeaweedFS 4.47** as the S3 store (MinIO's repository is archived), **Caddy 2.11.4** with its internal CA on `*.adms.localhost` (health page `https://adms.localhost/health`; `s3.` and `mail.` beside it), **Mailpit 1.31.2**; every image pinned by tag and digest [264]. Every port on 127.0.0.1 (Postgres on **55432**); plain HTTP redirected to HTTPS; dev passwords generated into a git-ignored `infra/local/.env` (mode 0600), handed to containers as files, never printed; `down` keeps data, `wipe` makes the next run a first run. SeaweedFS lets a non-empty *versioned* bucket be deleted, so the API's S3 identity will never hold bucket-delete [263]. **The installer (0.2.4):** **`pnpm installer`** (`pnpm setup` is pnpm's own command), `installer:check`, `installer:teardown`. A first run asks three things (the firm's name; email through the local mail catcher or none; the master passcode, twice, unseen), makes every secret once, and writes **one owner-only, git-ignored env file per service with only its own logins** (`packages/db/.env`: `adms_owner` only; the master passcode's **Argon2id** hash is kept in the database alone, ADR-281; `apps/api/.env`: `adms_api`, `adms_readonly`, the token signing secret, `SMTP_URL`; `apps/worker/.env`: `adms_worker`), plus a secret-free record in `tools/setup/.state/`. It creates the four login roles of §5.1 (no superuser, create, replication or RLS-bypass rights) from **SCRAM verifiers it makes itself**, so no password reaches the server, and database **`adms`** owned by `adms_owner`, open only to the logins. A rerun says what it knows, re-checks it, asks once to resume, puts back what it can with the secrets it has, and **stops rather than remake a lost secret**; teardown drops the database and logins and removes the files. Migrations and the seed are stubs until 0.3. Talks to Postgres through **`pg` 8.23.0** (the driver Prisma 7's adapter uses). *Agent defaults:* the names, the questions, a passcode of 8–128 characters [265, 266]. Each run also creates the shadow database **`adms_shadow`** (owner only, for `prisma migrate dev`), runs **`prisma migrate deploy`** as `adms_owner`, and the re-check includes `prisma migrate status`; a stray `DATABASE_URL` in the shell is ignored [268]. **Prisma (0.3.1):** the **`prisma` CLI 7.10.0** (stable; npm's `latest` is an 8.0 release candidate), a dev dependency of `packages/db`; its install scripts refused (`allowBuilds: false`), the schema engine fetched and SHA-256-checked on first use; Prisma Studio's `elkjs` (EPL-2.0) and `@visx/vendor` allowed **by name and version** as dev-only (ADR-262); `@prisma/client` and `@prisma/adapter-pg` join when code first queries [267]. `packages/db/prisma.config.js` reads `packages/db/.env`. **The schema is provisional** until `spec/DATA-MODEL.md`: nine models (thirteen since 0.4.3, ADR-281, below) in five files by kind of record (`Project`, `Contractor`, `User`, `Device`; `FieldEvent`; `CompletedLoad`, `Transaction`, `InvoiceLock`; `AuditRecord`), ids UUIDv7 made by the database (`uuidv7()`, a field event's from the phone), every foreign key `RESTRICT` on delete and update, ticket numbers as text, an empty split suffix when not split (so the unique key holds) [268]. The chain and its expected counts: `adms-verify`. Prisma
  was re-checked against Drizzle and Atlas and **kept**: **no business logic in the database**; the
  database holds only guards, each written as its own reviewed, tested migration. **Never edit a
  generated or applied migration** (the hook allows writing only into Prisma's empty stub). [094, 113]
- **The database enforces the rules itself**: per-service roles and least-privilege grants, no
  deletes, audit written by triggers with a required actor, `AuditRecord` insert-only, transaction
  deletes copied to audit first. Approved (§5). [097, 113] **Built (0.3.2):** nine guard migrations
  in `packages/db/prisma/migrations/`: kind-in-workflow and load-call checks (0–100, DIS and HOC
  only, missing allowed); least-privilege grants, column-level on evidence (the API corrects captured
  columns, the worker writes only `status`, `reconciled_at`), nothing by default; delete and truncate
  refused for everyone; audit by trigger with **`adms.actor_id` and `adms.source` required**
  (transaction-local settings; device, reason, request optional; domains per table); audit
  append-only; a transaction delete copied to audit first and refused on an invoice-locked load;
  row-level security with `viewer_*` views, the viewer stated per request (since ADR-315 as
  `adms.viewer_id` alone; the two settings ADR-270 named are gone), fail closed. The worker's system
  actor is a `User` row (ADR-273 below). [270] **A new table is guarded in one
  line** (the user wants hand-written SQL near zero): its model in the right `.prisma` file, then a
  guard migration `SELECT guard_table('<table>', '<CONFIGURATION|MARK|EVIDENCE|DERIVED>',
  '<domain>'[, ARRAY[<worker columns>]]);` (rerun when an evidence model gains a column); the
  installer stops while `guard_gaps()` lists any unguarded table. Row-level security for a table
  viewers see stays its own decision. [271] **Proven (0.3.3):** 94 tests in `packages/db/test`
  (Vitest, `pg`, as the local stack's administrator with `SET LOCAL ROLE`, each test's work rolled
  back on a fresh example world; they need `pnpm local:up` and `pnpm installer` at head). They read
  every grant, trigger, check and policy exactly and try each write as each login; 26 loosened or
  removed guards, each on a throw-away copy, were all caught. `guard_gaps()` now asks what a trigger
  fires on (a dropped delete refusal had gone unseen; fixed forward). [272] **Every service write goes
  through `db.$write(actor, (tx) => …)`** (`packages/db`, a Prisma client extension over
  `@prisma/adapter-pg`, both 7.10.0): one database transaction whose first statement states the
  actor, source and, when known, device, reason and request, as transaction-local settings; a write
  outside it states no actor and the database refuses it. The client is generated into
  `packages/db/src/generated/` (git-ignored) by `pnpm generate`, which typecheck, test and lint run
  first. **The worker's system actor:** `User` role **`SYSTEM`** (never a login), id
  `00000000-0000-7000-8000-000000000001` in every installation, "Open ADMS (system)", seeded by the
  installer (`prisma db seed`, as `adms_owner`, with itself as actor), which stops if it finds it
  changed. *Agent defaults.* [273] **Only the worker writes as the system actor:** a write stating
  it, or source `SYSTEM`, is refused unless the writing login is `adms_worker` or `adms_owner` (the
  seed); no login but `adms_owner` changes its row, makes it or gives role `SYSTEM` to anyone;
  `SYSTEM` is that one id, with no Monitor ID and no contractor. The worker may still state a person
  (a reprocess a person asked for) until Phase 1's worker decides. `installer:check` looks at it (its
  20th ✓). [276] **An applied migration is never edited:** a test checks each `migration.sql` against
  the checksum Prisma recorded. [276] [274] **The scenario harness (0.4.1):** `packages/scenarios`, run by **`pnpm scenarios`**
  (`[name…]`, `--keep`, `list`, `clean`; exit 1 on any failed check). **Each story runs on its own
  database**, never `adms`: `adms_story_…`, made by the local stack's administrator from `template0`,
  owned by `adms_owner`, open only to the logins (checked), migrated through
  **`packages/db/prisma.story.config.js`** (same migrations and owner login; it can reach only an
  `adms_story_…` database, named by `ADMS_STORY_DATABASE`), seeded, and **dropped afterwards**. Every
  row goes through `$write` as the services' own logins. A **story clock** (never the machine's);
  **simulated offline phones** that stamp their own clock and offset, make each field event's UUIDv7
  id at the badge scan and keep it until they sync; a **stand-in for the API's sync** (`adms_api`,
  actor the monitor, source `DEVICE`, the phone's id, received time from the story clock). First story:
  **`ticket-101001`**, the golden mission's first load, synced out of order, ending `PENDING` (the
  engine is Phase 1's). *Agent defaults.* [275]
- **The security checks run with one command, `pnpm security`, with real counts** (REQ-018): the
  **dependency audit** (`pnpm audit`: **every advisory, at any severity, fails**, unless accepted by
  its GitHub advisory id in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas`, each with an ADR saying
  why it can't be reached; today three inside the Prisma CLI, looked at again at every Prisma
  upgrade); the **secrets scan** over exactly the files git would commit (secretlint 13.0.5's
  recommended rules, the installation's own secrets from its env files, and password-like settings
  with a literal value), printing **file, line and rule only, never a secret**; every inline
  `secretlint-disable-next-line` carries its reason and is named on every run; **every `.env` file
  ignored by git and untracked**; the **grant tests**. The database's configuration is tested against
  the **CIS PostgreSQL Benchmark** items for this layer (SCRAM only from outside the container, no
  `PUBLIC` rights, row security on, `adms_owner` owns everything); TLS, connection logging and pgAudit
  wait for the demo deploy. *Agent defaults.* [276]
- **The Phase 0 models (0.4.3), all provisional until `spec/DATA-MODEL.md`:** thirteen models then (fifteen with ADR-286's pay item, below).
  **`MasterPasscode`**: a version and its slow hash (a check holds it to an Argon2id PHC string); a
  change is a new version, never an edit; the API reads and inserts, the worker and viewers can't
  read it; **the seed writes version 1 from a hash the installer hands it in memory, never through a
  file**; an installation made earlier has it moved out of `packages/db/.env` on its next run; **a
  database that lost it asks for the passcode again** (the firm's own secret). **The audit capture
  leaves named columns out** (`audit_capture('SECURITY', 'hash')`: the record says the column changed,
  never its value), the path for password hashes in Phase 2. **`NumberBlock`**: device, project,
  series (`LOAD · HAUL_OUT · UNIT_RATE · CERTIFICATION`), first, last, last used, `ISSUED · RECLAIMED ·
  RETIRED`; the series, the allocator and the refusal of overlapping blocks are built (ADR-323).
  **`DisposalSite`** (project and name only, built in full since ADR-311) so an assignment's site
  can only be its own project's.
  **`Assignment`**: person, work date, project, the kinds of field event they may record, certifying,
  an optional site and phone, `PLANNED` (with its author) or `UNPLANNED` (no author, always its phone,
  its id from the phone), withdrawn by archiving; no uniqueness on person or phone and day; **its forms
  join in Phase 1** (C42; its unit rate pay items are built, ADR-286). **Every field event carries `assignmentId` and
  `setupVersion`**, corrected by permission like any captured field. **No read-only viewer sees any
  of the four new tables** (no view, no grant, so no policy yet). The system actor is never assigned,
  never writes the board, never records a field event and has no employer. *Agent defaults.* [281]
- **An assignment names its unit rate pay items (REQ-020 met in full):** a provisional **`PayItem`**
  (its project, the firm's code, unique on its project, and its description; ADR-301) and **`AssignmentPayItem`**, tied
  to the assignment's own project by two two-column foreign keys; a pay item is taken off by
  archiving, never deleted; an assignment that names pay items stays on its project. `pay_item` is
  audited in the billing domain. Fifteen provisional models, twenty migrations (the twentieth:
  ADR-301). Whether a named pay item is a unit rate one is Phase 1's to check. *Agent defaults.* [286, 301]
- **The firm's lists are built (Phase 1, task 1.1.2):** eighteen tables, **one per list**
  (`ProgramType`, `DeclarationReferenceType`, `DebrisType`, `ReductionMethod`, `PayableType`,
  `KindOfWork`, `ItemName`, `VehicleType`, `VehicleFeature`, `CrewType`, `SiteType`, `SiteLabel`,
  `IncidentType`, `IncidentSubType`, `Reason`, `SurveyWorkType`, `ClockActivity`, `FieldTag`), each
  with a key, a name, a position and its own columns; three more closed sets (`CountShape`,
  `ReasonUse`, `CertificationKind`). **The built-in keys are one closed set in `packages/domain`**
  (`builtInKeys`: `STUMPS`; `TDSR`, `FINAL_DISPOSAL`; `PRE_WORK`, `POST_WORK`, `ROE`), and
  `packages/db` depends on `domain` for its types only, so the seed can write no other key and the
  installer still needs no build. **The database keeps two rules itself:** only a release
  (`adms_owner`: the migrations and the seed) writes a key, so a firm's own value never has one and a
  built-in value's never changes; and a value with a key is never archived, by anyone. **A new list
  is guarded in one line:** `SELECT guard_list('<table>', '<domain>');` (`guard_table` plus those
  two). Audited in the operations domain; no read-only viewer sees a list yet, so no row-level
  security (since ADR-315 a client user and an auditor read the lists; a contractor user none). **The seed writes a list's starting values once, into an empty list**, as
  the system actor (94 values in 15 lists; site labels, incident sub-types and field tags start
  empty); a list that holds anything is the firm's and gets only a built-in value it lacks, which is
  how a release adds one. Thirty-three models, twenty-two migrations. The starting values where
  `spec/LISTS.md` gave none are in its "What ships" section. *Agent defaults.* [302]
- **The client, the declaration event and the project are built in full (Phase 1, task 1.1.3):**
  `Client` and `DeclarationEvent` (its reference as written, its reference type picked from the
  firm's list), firm-wide; `Project` with its client, declaration event, program type, *Allow split
  loads*, active window (calendar days; the end optional, never before the start), ticket-number
  source (`CONTROL` · `GENERATED`), ticket types and settings; `ProjectKindOfWork` (a kind is taken
  off by archiving). **No setting has a default in the database:** what a new project's settings
  start as is one rule in `packages/domain`, `NewProjectSettings`: *Allow split loads* from the
  program type's *Requires ROE*, both stump checks on, **the time clock switched off** (the project
  doesn't offer its workers the option to log their hours until the firm switches it on; confirmed
  by the user, ADR-304), and the numbers from
  the **policy values**. **A policy value** has a name the domain owns (`LOAD_CALL_LOW_LIMIT`,
  `LOAD_CALL_HIGH_LIMIT`, `DISPOSAL_SITE_PROXIMITY_M`, `STUMP_FILL_DEPTH_INCHES`); the domain's
  `Policy` refuses one that is missing or out of range and never stands a number in for it; **the
  release's built-in defaults are the committed env file `packages/domain/policy.env`** (5, 95,
  200, 31), read by a server app and handed to the domain (invariant 16 as built). Whether an
  installation may override a built-in default for every new project is left open (C53). The
  database itself refuses a project with no ticket-type list, a window that ends before it starts,
  a load-call limit outside 0–100, and a fill depth or site circle under 1. The three new tables
  are guarded in one line each, in the operations domain; no read-only viewer sees them, and the
  project's viewer view shows none of the new columns (since ADR-315 a client user and an auditor see
  them all; a contractor user still the five). Thirty-six models,
  twenty-four migrations. *Agent defaults.* [303]
- **Contractors on a project, and contracts, are built (Phase 1, task 1.1.4):** `Contractor` has
  a **kind** (`ContractorKind`: `HAULER` · `MONITORING` · `CREW` · `OTHER`; no default, whoever adds
  it says which), **contact details** (a contact name, email and phone, each optional, edited
  freely and audited, the same three a client holds: the user's word, ADR-306) and a merge link (`mergedIntoId`: never itself; a merged contractor is archived
  for as long as it is merged). **`ProjectContractor`** is a contractor's place on a project
  (`ContractorPosition`: `PRIME` · `SUB_TIER_1` · `SUB_TIER_2`): **one place per project**, so a
  sub is never shared by two primes; a sub names its prime, tier 1 and tier 2 alike, and a prime
  names none; taken off a project by archiving. **`Contract`**: its project, a name, its prime, an
  optional link, nothing else; a prime may hold one or several. **The database itself holds "the
  prime" to one of the project's primes:** a prime's row carries its own contractor again as
  `asPrimeId`, unique with the project, and a sub's prime and a contract's prime are two-column
  foreign keys to it. So a sub under a sub, a prime borrowed from another project and a contract
  written before its prime is on the project are refused, and a prime that a sub or a contract
  names can't be made a sub; no trigger does it. **Whoever adds a prime writes `asPrimeId`**; a
  rate's prime and a certification's prime will point at the same key (C56). `project_contractor`
  is audited in the operations domain, `contract` in billing; no read-only viewer sees either
  (since ADR-315 a client user and an auditor see both, never a contact detail). What a
  merge moves is the certification task's (C56). Thirty-eight models, twenty-seven migrations.
  *Agent defaults, seen by the user ("the rest of this is good to go", ADR-306).* [305, 306]
- **Forms, debris types on them, field tags, the firm's own fields (built 2026-10-02, task 1.1.5):**
  `Form`, `FormDebrisType`, `FormDefinition` and `Assignment.formDocumentTypes`, as the "Forms:"
  bullet below states them; a row that belongs only on some kinds of form repeats its form's document type,
  held by a check and a two-column foreign key to `form (id, document_type)`; a definition version
  is never edited by anyone (`refuse_edit()`). Forty-one models, twenty-nine migrations. *Agent
  defaults.* [308]
- **Pay items in full (built 2026-10-02, task 1.1.6):** `PayItem`'s every field of DATA-MODEL §3
  (payable type required; `BillingUnit`; kind of work on a unit rate one; band from and to, inches
  to a tenth, both ends included, either open; the seven capture settings, each stated, no default;
  `CrewTimeConversion` only on an `HR` or `CREW_DAY` pay item, the day length only on an exact one,
  starting at the policy value **`CREW_DAY_HOURS=12`**); `PayItemRate` (one per prime, the prime held
  by ADR-305's key, so never a sub or a contractor off the project; archived, never deleted; a
  change's prior value is the audit log's); `PayItemCrewDayStep` (hours to the quarter within a
  day, a quantity); `AssignmentPayItem` repeats the pay item's kind of work, so **only a unit rate
  pay item can be named** (C42, a three-column foreign key). **`SizeBands` (`packages/domain`)**
  refuses a band that overlaps another of its payable type, naming each, and warns of a gap; the
  database refuses an overlap too since ADR-310 (an exclusion constraint; `btree_gist` in a schema of
  its own, `extensions`, that no runtime login may use). Forty-three models, thirty-one
  migrations. *Agent defaults.* [309]
- **Disposal sites in full, and the project map (built 2026-10-02, task 1.1.7):** `DisposalSite`
  (site type, and the type's built-in key again as `siteTypeKey`; the four facts, none with a
  default; permit; GPS `decimal(38,8)` on the earth; activation and close dates, never closing
  before it opens; short code); `DisposalSiteLabel`; **`DisposalSiteTippingFee`, several per site**
  (per CY and per ton, and more where a contract needs them; ADR-222's "Service(s)", in place of DATA-MODEL's one link, KD-67; **confirmed by the user, ADR-312**), held to
  the site's own project's pay items and audited in billing; `SiteAreaVersion`, `MapVersion` and
  `Zone`, **never edited or deleted**, versions from 1, and **a zone written only with its
  version**. **The database refuses *Haul-outs leave here* off a TDSR/DMS site, and a marked site's
  type changing** (C52: a check on the repeated key, held by a two-column foreign key; no trigger);
  setup says so first (`SiteFacts` in `packages/domain`). **Shapes are GeoJSON** `Polygon` or
  `MultiPolygon` in longitude and latitude, as JSONB, checked to hold their type and coordinates,
  each with a bounding box of four `decimal(38,8)` columns; **Phase 1 takes shapes in as GeoJSON
  only** (a shapefile, KML and an Esri layer: REQ-124b, Phase 4); reading a shape and its box, and
  point-in-polygon, are the domain's later (C57). The site circle stays one project setting. Forty-eight
  models, thirty-five migrations. *Agent defaults, except the several fee links, which the user confirmed.* [310, 311, 312]
- **Rules (built 2026-10-03, task 1.1.8):** `Rule` (its project, **one of that project's load,
  haul-out or unit rate forms**, held by one foreign key with the form's document type repeated; a
  name; **one of the project's contracts**, or none; Active, with no default; the pay item whose
  "Pays when" wrote it), `RuleCriterion` (its place, criterion, operator, a typed number, date or
  text), `RuleCriterionPick`, `RuleAction` (*Add transaction* # and pay item, *Remove transaction* #,
  *Void ticket*; *Quantity from* stated on every Add) and `RuleActionItem`; every line is taken off
  by archiving. **The database refuses** an operator that isn't its criterion's kind's, a value that
  isn't its operator's (BETWEEN lower end first), a pick that doesn't fill the one column its
  criterion picks from, and **a picked value that isn't the rule's own project's** (a contractor on
  the project; a debris type of the rule's own form; a field tag, site or pay item of the project);
  a zone is picked by name. **What `spec/RULES.md` §7 calls not valid is saved and never runs**
  ("Is valid" is no column). **In `packages/domain`:** `RuleCriteria` (the criteria a form takes,
  each one's kind of value and operators), `RuleValidity` (§7, every reason in plain words),
  `ProjectRules.check` (refuses an exact copy, "Not saved: this rule is the same as "…"."; refuses a
  change in the rule builder to a rule a pay item wrote; **warns**, code `RULES_OVERLAP`, when two
  rules of one form and contract add the same # and nothing in their criteria keeps them apart,
  naming where a shared range overlaps) and `PaysWhen` (one rule per form the pay item pays on and
  per contract whose prime has a rate, named "`<code> - <description>`"). **An *Item* line is one
  picked item and a number operator on its count**; the list operators aren't taken on *Item*.
  Audited in billing; since ADR-315 a client user and an auditor see their projects' rules. Not decided: what an archived
  pay item, contract or form does to a rule naming it (the setup check, 1.6.4). Fifty-three models,
  thirty-seven migrations. *Agent defaults.* [313]
- **People's permissions and read-only viewers (built 2026-10-03, task 1.1.10):** `UserPermission`
  (a person and one of the ten permissions, once; **taken away by archiving, given back by clearing
  it**, never a second row; never the system actor's; the database doesn't tie it to the role
  manager/analyst, which is the API's to read); `ViewerProject`, **table `user_viewer_project`** (a
  project once per viewer, taken away by archiving); `User.viewerKind` (`CLIENT · CONTRACTOR ·
  AUDITOR`: every read-only viewer states it and nobody else does; **a contractor user names its
  contractor and nobody else does**), `email`, `phone`; `Device.keyRevokedAt` (only on a phone out
  of service, never before its removal time; the refusal is Phase 2's). Both tables audited in the
  **security** domain. **The viewer of a request is read from their own record:** the API states
  only `adms.viewer_id`; `viewer_sees_project`, `viewer_sees_every_ticket` and
  `viewer_is_contractor` read the person (a read-only viewer, not archived), the projects given and
  not taken away, the kind and the contractor, with the owner's rights; anyone else, or nobody,
  sees nothing. **A table gets its viewer sight in one line:** `SELECT guard_viewer('<table>',
  '<PROJECT|PART_OF|NAMED_BY|FIRM>'[, relation, column][, hidden]);` (row-level security, the
  services' policy, the viewer's policy, the view `viewer_<table>`, exactly its columns granted).
  **A client user and an auditor see** their projects' whole setup (21 project tables), the
  project's settings (`viewer_project_setup`, the one view run with the owner's rights, since
  row-level security can't tell columns apart), the client, declaration event and contractors
  their projects name, and the firm's lists. **A contractor user sees** the project's name, time
  zone and dates, and no setup at all. **No viewer reads** a contact name, email or phone, a
  client's notes, a map's uploaded file key, or any person, permission, phone, assignment, number
  block or the master passcode. Fifty-five models, thirty-nine migrations. Left for later: C59.
  *Agent defaults.* [315]
- **Whether a viewer sees private citizens by name is the firm's choice for each viewer (the
  user, ADR-328 (4); built 2026-10-04, C67 (d)):** `User.seesPrivateCitizens`, stated on every
  read-only viewer and on nobody else (a check), no database default; **a new viewer starts at
  yes** (`packages/domain`, `ViewerSettings.starting()`); changed at any time, audited (security).
  **The columns that name a private citizen** *(agent default)*: an ROE's `owner_name`, a
  drop-off log's `resident_name` and `origin_address`. They are in no `viewer_<table>` view and
  the read-only login holds no grant on them; `viewer_roe_citizen` and
  `viewer_drop_off_log_citizen` (id, project, those columns), run with the owner's rights behind
  a security barrier, show a row only to a client user or an auditor of its project whose record
  says yes (`viewer_sees_private_citizens()`, the viewer's fourth question). **One line says
  it:** `SELECT guard_viewer('roe', 'PROJECT', citizen => ARRAY['owner_name']);`. Not hidden,
  for the user to say: an ROE's address and parcel, free text, the firm's own form fields, a
  photograph of a signed form. A migration that writes a row states its actor inside one `DO`
  block. Sixty-one migrations; 58 test files, 1,173 tests. [328, 336]
- **The API's setup services, and where services live (built 2026-10-03, task 1.1.11):**
  `apps/api/src/<part>/`, plain classes, no HTTP, no sign-in, each given the API's database client,
  a clock and, where needed, the policy values (read by `apps/api/src/policy.ts`). `setup/`:
  `ProjectSetup`, `ContractorSetup`, `ListSetup`, `FormSetup`, `PayItemSetup`, `SiteSetup`,
  `RuleSetup`. **One call is one thing a person does and one `db.$write` as that person**; it
  answers saved (the record, any warnings) or refused (the domain's code and message; nothing
  saved); a refusal by the database's own constraints throws. **Permissions aren't read yet**
  (Phase 2). Every rule stays in `packages/domain` and is called before a save. `addPrime` is the
  one place that writes `asPrimeId`. A pay item's "Pays when" is matched to the rules it keeps
  (archive, add, change, leave); a changed rule's lines are archived and written anew, never
  edited. **`MapShapes`** (`packages/domain`) reads GeoJSON into a Polygon or MultiPolygon with its
  bounding box, and refuses the rest. **A map version's `loadedAt` is the database's own time**
  (40 migrations): Prisma's client fills `@default(now())` itself, so no guard compares such a
  column with `now()` (KD-68). The story `setup` runs it all: `pnpm scenarios` runs three stories
  (16, 18, 51 checks). *Agent defaults.* [316]
- **Certifications are built (2026-10-03, task 1.2.3):** `Certification` (every field of
  DATA-MODEL §3; its id the phone's; **no archive**: replaced, revoked or QC Void, it stays),
  `CertificationBox` and `CertificationHelper` (each taken off by archiving). **The database
  refuses:** a second certification of one number on a project (the same number on another
  project is fine, ADR-318); a blank number; a container with no capacity or a negative one (**0 CY
  is taken**), a crew with a capacity, a crew type on a container; **a box on a crew** (the box
  repeats its certification's kind, held by a foreign key) and **a container with no primary box**
  (two deferred constraint triggers, asked when the piece of work ends); a primary that isn't a
  rectangle that adds, or is archived; a box after it with no feature or with both a picked and a
  typed one; a radius corner that adds; a shape holding another shape's measurements, or one under
  1 (integers, so no fraction of an inch); a prime that isn't one of the project's primes; **a sub
  that isn't placed on that project under that prime** (three-column foreign keys to
  `project_contractor (project_id, contractor_id, prime_id)`, a new unique key), a second tier
  with no first, one contractor in both; a "replaces" with no reason, of another project's
  certification, of itself, or of one already replaced; a revocation without its date, reason and
  person; the system actor as certifier, revoker or helper; a helper twice. **Not held by the
  database:** which tier a sub's place is, a vehicle type's *certifies* against the kind, a
  certifying assignment, a helper's assignment (flag, never block). Audited in **billing** (the
  capacity is what loads bill by), helpers in operations. **A client user and an auditor see**
  their projects' certifications, boxes and helpers, never the driver's phone or licence number; a
  contractor user none yet (1.7.1). **In `packages/domain`:** `CertificationSubs` (a typed name is
  matched to the firm's contractors ignoring case and spacing; placed as typed it is named, known
  elsewhere in the firm it is placed, unknown it is a new contractor, a hauler on a container and
  a crew on a crew; **a name that already has another place on the project is never moved: the
  certification is saved under a separate contractor of that name, with the warning
  `SUB_PLACED_ELSEWHERE`**), `CertificationChanges` (a replacement and a revocation say why) and `ContractorMerge` (the kept record takes
  the duplicate's place on each project; refused into itself, of a merged record, into an archived
  one, of a prime, or where the two are placed differently on one project). **In `apps/api`:**
  `Certifications` (`src/certification/`): `certify`, written as the certifying monitor from their
  phone (source `DEVICE`), the capacity worked out by `Capacity` and never typed, **measurements
  that give no capacity refused with nothing saved**; `measure` (a box corrected in place, the
  capacity worked out again); `signaturesOnFile`; `revoke`; **no copy** (a certification is never copied, ADR-328, 330); `SubPlaces` and
  `ContractorSetup.merge` (the certifications that named the duplicate name the kept one). **"Replaced on" is the new certification's certified time**, as a day in the project's time
  zone. A certification's number is the phone's (the next of its block, or the pre-printed
  sheet's). The story
  `certification` runs it: `pnpm scenarios` runs six stories (16, 18, 52, 25, 15, 35 checks since ADR-332). Sixty
  models, forty-five migrations. **`MapVersion.loadedAt`'s default is `transaction_timestamp()`** (KD-70:
  Prisma read `CURRENT_TIMESTAMP` back as its own `now()` and wrote it into every later
  migration). Left for later: C62. *Agent defaults.* [321]
- **The map servers are in the local stack (REQ-022):** `routing` (**Valhalla 3.9.0**) and
  `addresses` (**Nominatim 5.3.2**, mediagis's image), pinned by tag and digest, reached **only
  through Caddy over HTTPS** (`https://routing.adms.localhost`, `https://addresses.adms.localhost`),
  no port published. **One OpenStreetMap extract, named by a URL and a SHA-256 together**
  (`ADMS_MAP_EXTRACT_URL`, `ADMS_MAP_EXTRACT_SHA256`; built in: Delaware, Geofabrik's dated copy of
  1 January 2026), downloaded once by `pnpm local:up` into the git-ignored `infra/local/.cache/maps/`
  and checked against its hash every run; each server rebuilds its data when the hash changes. **The
  extract's date is the map's date.** Valhalla answers only `locate`, `route` and `status`, with no
  capabilities and a read-only root filesystem. Nominatim is **address lookup only** (no search), and
  **its own Postgres is closed to everything outside its container** by our wrapper (the image leaves
  it open with a public password); we set no password of ours on it. The example world's Bayline
  County is made up, so its roads stand in from Delaware's. The demo deploy's half is REQ-517's.
  *Agent defaults.* [282]
- **HTTPS between every service, locally too**; CORS by explicit origin allow-list, never
  disabled. [098]
- **Local first.** Test in a browser, then iPhone, then Android. Firms host in **their own cloud**;
  **Railway + Netlify is the shipped demo deploy**. Sync needs a data connection. [099]
- **Mileage is the road route**: the shortest route on **public roads open to ordinary traffic**
  (no truck size) from the collection's end GPS (a load's or a haul-out's collection) to **the
  disposal site's own GPS**, entered with the site (ADR-208), from **our own routing
  server** with OpenStreetMap data (a third service). The worker **snaps** the collection's GPS to
  the nearest road point (its address from Nominatim) and routes from there; if no route is found,
  mileage is the **straight line, flagged** "no road route found". Always the truck's road trip,
  never water. A split's mileage is per property. The worker computes it before pricing.
  **Valhalla** (mileage) and **Nominatim** (address lookup) are separate servers we run. [110,
  119, 162, 163]
- The user's Build 1 answers are kept verbatim in `spec/FROM-BUILD-1.md` and bind unless a newer
  ADR differs; Build 1 code is never a source. [102]
- An install is an **installation** (or "the system"), never an "instance". [112]
- **Licence: AGPL-3.0.** Every dependency's licence must be compatible (permissive, LGPL, GPL-3.0,
  AGPL-3.0; **MPL-2.0 too**, which names AGPL-3.0 as a Secondary License, unless the package carries Exhibit B). **The rule is about what ships** (user, ADR-262): tools that only build, test or lint are outside it. Checked before pinning (`pnpm licences`, ADR-258, which still checks every installed package); `LICENSE` (the AGPL-3.0 text) is at the root. [171, 255, 260, 262]
- **Two-step sign-in** (authenticator code) is **required for admins and managers/analysts**,
  optional for viewers; monitors unchanged. **Email is optional** (installer sets it up if the firm
  has a mail server; otherwise admins reset passwords). Local dev must work with both (a mail catcher,
  seeded dev secrets, dev stack only). [170]
- **Every screen translatable** from day one, English only at first; **US units only**. [172]
- **Enterprise readiness, carried forward (nothing decided about how):** the plan is silent on
  **operations monitoring**, **availability**, **independent security testing** (a threat model, a
  penetration test, how a vulnerability is reported) and **accessibility**. Each is in `BACKLOG.md`'s
  carry-forward register (C38…C41) with what exists, what's missing and when to raise it: the first
  three with Phase 2 and the demo deploy, accessibility before the first screen. Server backups
  (ARCHITECTURE §4) and upgrades (Q-167) were already recorded; single sign-on is not planned. [279]

### Product and scope
- **The firm's setup decides how things play out.** Hardcode as little as possible; ship defaults
  tailored to debris work that the firm can change. Before proposing a new ticket type, unit,
  criterion or behaviour, or asking how a contract line works, check whether projects, names, codes,
  rules and lists already express it; which price a contract means is the firm's call. Work the prime
  bills outside Open ADMS isn't set up. Also in `CLAUDE.md` / `AGENTS.md`. [197]
- **Two sides.** The monitor enters **only the main ticket**, fast; fees, pricing, zones, mileage and
  checks are the system's work, from the firm's setup. The back office sees **everything** about a
  ticket, laid out to review, correct and QC many quickly. Before asking a monitor for something,
  check whether the system or the back office can supply it. The **rules are the firm's own tool**
  (create / delete transactions, void, any criteria, date ranges included): enable the options, never
  hardcode a firm's rules. The user answers wearing different hats (firm setting up, monitor, back
  office): design each side for its own user. Also in `AGENTS.md`. [224]
- **Scope settled from the legacy screens (ADR-228):** out: work orders, purchase orders, Service
  Categories; Time and Material = crew time; Stump Collection = the load of stumps; **no separate
  crew list, the crew certification is the crew**; **one review queue** (replaces the QC error
  report, queues, workflow screens), photos reviewed inside a ticket; reports = fixed exports plus
  saved filters (a query builder later); a **firm library plus "copy from a past project"**;
  **invoice batches**: a named set of tickets locked as invoiced, reportable by name. [228]
- **Question shot-clock (ADR-230):** product discovery is closed. Ask the user only when the answer
  changes money, evidence or the monitor's work, blocks the task, and nothing covers it (at most
  three, each with a recommendation); otherwise record an **agent default** ADR and carry on. Spec
  page approvals don't block building. Also in `AGENTS.md`. [230]
- One organisation runs it, usually a monitoring firm. It is **self-installed open source**: one
  organisation per installation, no multi-tenancy. [050, 063]
- **No USACE mode.** Every project runs the same rules, plus an optional "USACE approved" flag on
  the load call. [077]
- The deliverable is the **client package**, assembled **by hand** by the back office from the
  system's data. There is **no invoice record**: "invoicing" means locking tickets as invoiced, and
  a ticket in review can't be locked. No placard printing. [057, 061, 067, 088]
- **A separate project per funder or kind of work** (ROW, PARKS, WATERWAY, federal-aid roads…):
  commingled data is rejected by FEMA. No funder field. [148]
- **Every load has a monitor at both ends**; no unmonitored disposal sites. Everything comes into the
  system; paper logs are only a monitor's own backup. The back office may **create any record** (e.g.
  a device failed), marked with the person and a reason, flagged, pairing normally. [156]
- **Citizen drop-off sites are in scope**, but a drop-off is **a reference log, like an incident,
  not a ticket**: the monitor notes that it happened, simple details, and (optionally) the resident's
  name and where the debris came from. No quantity, ticket number, receipt, pay item or cost; logs
  can be looked up later. The pile is billed only when it's **hauled out as an ordinary haul-out**.
  A log holds the site, monitor, phone time and GPS, the resident's name and origin address
  (optional), up to 8 photos (optional), notes, plus the firm's own form fields; searchable by site,
  dates, name, address. A drop-off log is **a form a phone is set up for at a site** (ADR-215; no
  longer a site setting); drop-off logs are switched on for a project and phone like incidents and
  **QC'd on their own**. [184, 188, 215]
- **Disposal sites** (the legacy "Location"): a **site type**, one of **TDSR/DMS · Final Disposal
  (FDS) · Transfer Station · Other** (firm-extendable; **HHW is not a type**; descriptive, and what
  *Disposal site type* tests), plus **facts about the site** that hold for every ticket type:
  **Haul-outs leave here** (haul-outs leave from it), **Takes loads** (loads end there), **Charges a tipping
  fee** (the box is what tells the system, nothing on the pay item, ADR-220; ticking it leads the firm
  to **write the site's tipping fee pay item** there and then, with its rate for each prime, and then the fee
  rule, Add transaction #2; the site keeps the link, which is how a fee line is told from a hauling
  line (**a site may keep several**, per CY and per ton and beyond, ADR-311, confirmed by the user, ADR-312); a load dumped there with no line for its tipping fee pay item is flagged as a **missing rule**, never a
  mismatch, ADR-222; checked on loads and haul-outs **dumped** there, never on a haul-out leaving it or
  unit rate work there; **a haul-out dumped at a TDSR** is flagged and priced no further, since a
  haul-out only leaves a TDSR, ADR-226; **a haul-out is reduced debris leaving a TDSR for a
  different site, never back to the site it left and never from one final disposal site to another:
  *Haul-outs leave here* can be ticked only on a site of the built-in TDSR/DMS type** (setup refuses
  it elsewhere, and so does the database, which also refuses changing a marked site's type, agent
  defaults, ADR-298, 311), so a haul-out that left anything else is always flagged, ADR-298),
  **Ineligible site** (a load dumped there is flagged and still bills); plus the firm's own labels. The
  legacy **Critical** box is left out (ADR-219). These **replace** the options Disposal · Haul-out · Staging ·
  Citizen drop-off · HHW: a load that needs no load call measures its quantity **from the tickets it
  carries**, a setting on the pay item (stumps, white goods); a **citizen drop-off log** is a form a
  phone is set up for at a site; HHW is no longer an option. *Agent reading, to confirm:* drop-off
  logs aren't checked against the site's facts. [201, 205, 215]
  **A ticket at a site without the matching fact is flagged**, never refused ("Ticket 101013: dumped
  at Old Quarry Pit, which isn't marked Takes loads. Flagged for review."; "Ticket 101009: dumped at
  Old Quarry Pit, an ineligible site. Flagged for review."). Tickets never say
  where debris is headed and the system never guesses ahead: it checks that the debris was allowed
  to go where it went. Halves on different days (a preload, a haul-out from a prior date) are **not**
  flagged by default. [205] **Master setup** can set a phone up for any work on the project; its
  monitor then has access only to that work. *Agent reading, to confirm:* setup lists every active
  site for any work, nothing hidden. [205] **Every phone that works at a site is set up for that one site**: the tower, the
  haul-out collection at the TDSR, the haul-out disposal at the FDS, the drop-off log. The site fills
  in on every record; **no start list shows sites**. A curb collection phone has no site. A phone
  **moves site offline**, on the phone; each record keeps its site; what it still holds syncs later
  and is always received. *Agent readings to confirm:* setup offers the project's active sites; the
  move takes the master passcode and is recorded. The user's account of an HHW site is kept for the
  HHW trail (KD-30, REQ-518). [188, 190, 193, 194, 195, 201, 205]
- **Lists with built-in values plus the firm's own** (site options first): the system acts only on a
  built-in value's **fixed key**, never its name; built-in values can be renamed, not archived; the
  firm's values are labels, added, renamed and archived (audited, never deleted); new behaviour means
  a new built-in value in a release with an ADR. How to code, keep and explain it: `spec/LISTS.md`.
  **Built (ADR-302):** the keys are `packages/domain`'s closed set; the database lets only a release
  write a key and refuses archiving a value that has one. [194, 302]
- **Time clock:** an optional per-project add-on for workers' own hours (ICS-214 data), on the
  **assignment**: **anyone with an assignment** clocks in, takes a break and clocks out **by hand**;
  **simple nudges** only ("You're not clocked in. Clock in now?" on starting a field event; "Clock
  out?" on signing out); activity lines pre-filled from the day's field events, edited and approved
  by the worker; a **manager approves the day** (locked, unlock audited); **exported** for payroll and
  for billing the client. *Agent defaults:* no hourly rates or pay in Open ADMS; viewers don't see
  hours. It is **never** related to crew-day billing (no shared field, no cross-check). [063, 100, 241]

### People and devices — `adms-domain`, `adms-field-app`, ARCHITECTURE §7–§8
- Roles: **admin**, **manager/analyst** (granted permissions), **monitor** (through a device),
  and **read-only viewers** (clients, contractors, auditors) for their own projects. [050]
- **Enrol once, dispatch daily (ADR-240).** A phone is **enrolled** once (online, master passcode:
  its device key; no project, no monitor). The back office writes each day's **assignments** on a
  **dispatch board** (replacing the spreadsheet): person, date, project, their work (ticket types,
  unit rate pay items, certifying), **one site** where the work is at one, optionally a phone; copy
  yesterday's. The monitor signs in on any enrolled phone; **online, the phone gets their assignment**,
  the project's lists and numbers: no passcode, no picking. **One assignment, so one project, on a
  phone at a time** (ADR-145). **Unassigned**, the master passcode sets the phone up as below
  (offline only on the project whose lists it already holds), recorded as an **unplanned
  assignment** (marked, not flagged). **Phones sync whenever there's
  a connection** (records, then photos); hand-in is only for taking a phone out of service. *Agent
  default:* a finished field event is **reopenable until the monitor ends the shift**, a later edit
  sent as the edit log, audited under the monitor. Every field event records its **assignment** and
  the **setup version** of the phone's lists. The board shows planned against actual as views, never
  ticket flags; an assignment never expires or stops work. Not taken: passkeys, attestation,
  personal phones, per-supervisor keys. [240]
- **"Setup", never "provisioning".** Setup on the phone (now the unassigned fallback, ADR-240) is opened by the **master passcode**:
  one project, its ticket types, and **one monitor** picked from a list. That monitor signs in
  **offline** against a stored verifier; nobody else can; the master passcode can also sign in as
  them. A device can **switch monitors offline** with the master passcode (same project, a monitor
  known by name and **Monitor ID**, e.g. `M004127`); the previous monitor's unsynced work is
  archived and synced in the background. Devices sync whenever there's a connection; hand-in is for turning a phone in (ADR-240). How the
  switched-in monitor proves identity: the login list (ADR-105/120, below); master passcode scope:
  one per firm (ADR-106). [095]
- **Sign-in:** a monitor's **ID** + password (the firm's practice: phone number without area code).
  A set-up phone gets a **login list** for its project's monitors, so the server knows who signed in.
  Monitor credentials work only on set-up phones (five safeguards approved, ARCHITECTURE §7.2, ADR-139). The
  username is the **system Monitor ID**. **Changing the monitor on a phone needs the master passcode
  first**; a master-passcode temporary session for a roster monitor is an allowed shortcut, marked
  and ending at day end. [105, 120]
- **One phone, one project, disposal phones included** (one assignment at a time, ADR-240); a tower monitor working two projects
  carries two phones. [145]
- **Certifying** is done on a field phone **set up for certifying**, where there is signal. It gets a
  **block of cert numbers** (unless pre-printed numbers are typed). **Any phone with a connection can
  refresh its lists** at any time, outside the nightly sync. [151]
- **What read-only viewers see:** clients and auditors the whole project except personal phone and
  licence numbers; a contractor only its own tickets and transactions (a prime with its subs'),
  never another prime's; monitors' phone numbers only admins. Enforced by row-level security. [169]
  **Built for setup (ADR-315):** a client user and an auditor see their projects' whole setup; a
  contractor user none of it (the project's name and dates only); no viewer a client's or a
  contractor's contact, or any person's record. An admin issues a viewer its kind, its projects
  and, for a contractor user, its contractor; a project or a permission is taken away by
  archiving. *Agent defaults.* [315]
- **Creating users:** field monitors are created **on a phone, online**, by the master user (then
  optionally set up); back-office and outside users by an admin in the back office. [105]
- **One master passcode per firm**, set at install, changed by the firm when it chooses; no
  reminders. [106]
- **Device data is encrypted**, **never backed up**, and bound to that phone; a device can be
  synced and turned in **without the monitor**, so the key never comes from a password. [096]
- **A phone taken out of service is received, never refused:** at its next sync it proves itself
  and uploads; what it made **after** its removal time arrives **flagged**; then its number block is
  retired and it's wiped (only then is it refused). [134]
- A device records its id on every record it creates. **Monitors never pick pricing** (never see a rate; rules create every transaction) and **never see a code**: they pick **by name**, a unit rate **pay item** (shown by its payable type) after the crew photo, a load's or haul-out's **debris type** on Complete; a load carries no pay item. Setup pushes the unit rate pay items and their settings to the phones that do that work (ADR-176); a load's phones get none (ADR-223). [088, 124, 176, 207, 223]
- **The database issues the Monitor ID** (`M` and six or more digits, the next of one series from
  `M000001`): a person written without one gets one; every monitor has one; a writer may leave it off
  anyone else; unique; never the system actor's. A worker's **employer** is a contractor record
  (`User.employerId`), with the employer's own ID for them (`employerNumber`), kept apart from a
  viewer's contractor. **A device** has a name (the dispatch board's, `P1-COL-1`), a unique public
  key, a status (`ACTIVE · LOST · RETIRED`, out of service exactly from its removal time), the version
  of the master passcode's check it holds, and its number blocks; **no details column** (no rule has a
  phone report anything but its key and, at a sync, its clock). *Agent defaults.* [281]
- Workers have a **system Monitor ID** plus an optional employer ID; subcontracted monitoring
  firms and temp agencies are contractors (monitoring kind); each field event records its own
  monitor. (Q-97, Build 1 answer) [102]
- Disposal devices carry **no ticket list**; they trust the scan. Cancelled tickets stay on the
  device, unsynced. A finished field event can be reopened **until the monitor ends the shift**
  (agent default, ADR-240; was "until it syncs"), and the device sends its change log, audited
  under the monitor. [056, 071, 072, 240]
- The device sends whatever GPS fix it has. The **back office** checks it and adjusts drift.
  There is no accuracy check. [083]
- **Printing on every project** (Zebra ZQ): two collection copies (or control ticket + stub), a
  disposal copy at disposal, haul-out and final disposal, unit rate always; barcode = the ticket
  number; receipts are never records. **Capacity is never typed**, except for a truck keyed in by
  hand, which is flagged and bills the cert's capacity (ADR-154). (Q-95, Q-98, Build 1 answers) [102] On a control-ticket project the disposal receipt may
  be **handwritten on the back of the control ticket**; haul-out prints at the collection side. [115]
- **No check digit.** A tandem's truck and trailer carry unrelated ticket numbers; tandem cert
  numbers are usually, not always, consecutive, and a trailer swap isn't flagged. [114]

### Time and photos — ARCHITECTURE §10–§11
- **Each project has a time zone**; tickets and time-clock entries use it. **The database checks it's an IANA name** (an area and a location, or `UTC`, known to the server's time zone data; never an abbreviation or an offset), and no column anywhere is a time without its zone; a field event's own times and offset are never checked, only flagged later [281]. Offline, the **device
  clock** is the recorded time; reconciliation checks times make sense and **flags** with a time
  message. Time clock: start, 30-min break at 6+ hours, clock-out, day ends before midnight, **no
  cap on monitor hours**. The 12-hour flag is **crew hours only**. [100]
- **Photos:** shrink carefully at near-original quality, **keep depth data** (or store it
  linked), hash at capture, **keep indefinitely**. [101] **At most 8 per ticket** (not per phase);
  whether photos are **required** is a **pay item** setting; too few is flagged, never blocked
  (a hazardous tree: 1 pre, 1 measure, 1 post); no minimum unless required, then 1. **A
  certification takes five photos**: operator with placard, interior/back, right, left, front. [157,
  179, 181] **The record is built (ADR-326; see "Field events"):** one owner, two fingerprints,
  the file's place written once; the 8 is the phone's rule, never the database's.
- **A load's time is its collection's end** (haul-outs too); a disposal's time is its disposal's
  end. The active window, the *Ticket date* criterion and daily counts use the load's time: a Monday
  preload dumped Tuesday is Monday's, at Monday's rate. [161, 181]

### Org model and project setup — `adms-data-model`, `adms-ticket-workflows` §4.0
- `Client` → `DeclarationEvent` → `Project`. Clients and events are shared global records.
  [023, 026] **Built (ADR-303):** a project names one client, one declaration event and one program
  type; "every project under this declaration" is one query across clients. [303]
- **Pick-lists are firm-extendable**: program types (with "requires ROE"), debris types
  (**added to a project's forms**), vehicle types, features, payable types, and others; **no fee
  kinds** [246]. They are picked,
  never typed. **Fixed in code:** ticket types, statuses, billing units, roles.
  Catalogue: `spec/LISTS.md`. [024, 070, 074]
- A project has an **active window**, judged by each ticket's **end time** (a completed load: its
  collection's end, ADR-161); tickets outside it
  are flagged. It also has a **ticket-number source**, control or generated, plus enabled ticket
  types and unit rate sub-types. [018, 041, 056, 057, 064]
- **Several primes per project** are allowed. Each prime has its own subs, **at most two tiers**,
  never shared between primes. **Subs are typed in at certification** under the chosen prime (the
  phone suggests known ones; the back office can merge duplicates). [081, 108] **Built
  (ADR-305):** a contractor has one place on a project (prime, tier 1 or tier 2); the prime a sub
  names is one of that project's own primes, never a sub; the merge is a link on the duplicate,
  which is archived, audited, never deleted. **A contractor holds contact details** (name, email,
  phone; optional), as a client does. [305, 306]
- **A disposal site is entered on each project that uses it** (never shared) [145]. It has an
  **activation date** and an optional **close date**; a disposal after a set close date is flagged
  "site closed" [173].
- **Every disposal site requires a permit**; a missing one is flagged outstanding, never blocking. [111]
  Its **GPS is entered when it's added**, and it has an **area**: **standard**, a circle round the
  GPS (built-in 200 m, changed in the project's **GIS settings**), or **advanced**, its own shape,
  drawn in Open ADMS or from a shapefile. A disposal whose end GPS is outside it is flagged. **One
  circle size per project**; a site with a shape ignores it; both haul-out ends are checked the same
  way; a changed size or shape is dated, kept and reprocesses un-invoiced tickets at that site.
  **Drawing** works for site shapes and the project boundary and zones; anything drawn downloads as
  a zipped shapefile or GeoJSON; the base map is **our own** (a regional map file in our storage, no
  outside map company). [136, 142, 144]
- **Project map:** each project has a **boundary** and optional **zones** (Esri-style shapes). **No
  monitor records a zone**: reconciliation tests the ticket's GPS against the map and **attaches**
  the zone; a collection (or unit rate ticket) outside the boundary is flagged, and one inside it but
  in no zone. Maps come in by **upload** (shapefile, GeoJSON, KML) or an **Esri layer link**, as dated
  **map versions**; the worker checks at reconciliation, never the phone; a new version reprocesses
  un-invoiced tickets; each ticket records the version used. **A version and its zones are never
  edited, and a zone is written only with its version** (the database refuses both); shapes are
  stored as GeoJSON with a bounding box, and **Phase 1 takes them in as GeoJSON only** (ADR-311).
  [135, 141, 311]
- **Contracts** are simple: a **name, the prime contractor, an optional link** to the signed copy.
  The contractor is added to the project first (**the database refuses a contract whose prime
  isn't one of the project's primes**, ADR-305); the contract is created in the project; **a
  pay item holds a rate for each of several primes** (the legacy "Contract Service Rates"), never a
  copy per prime. **A rule names one contract, once** (picked from the project's contracts; "Ticket
  Contract" was only the legacy label), and **runs only on tickets whose prime holds it**, so a
  pricing rule needs no *Contractor* criterion; **each prime still gets its own rules**. A rule with
  only *Remove transaction* / *Void ticket* may leave the contract blank and runs on every ticket of
  its form (*Contractor* stays a criterion for it; agent default). **A transaction takes the pay
  item's rate for the rule's contract's prime**; a ticket no rule of its prime prices is flagged
  ("Ticket 101010: no pricing rule on a Summit contract matches. Flagged for review."); a pay item with
  no rate for that prime writes a **$0 line**, flagged ("Pay item VEG-HAUL-CY-15 has no rate for
  Summit"). **The payable type is the work; each pay item is a priced line of it** (same work at two
  rates by distance = two pay items, mileage rules). [146, 174, 206, 212, 239]
- **Load-call limits** are a **project setting**: flag at or under **5%** and at or over **95%** by
  default (built-in defaults in `.env`: the release's `packages/domain/policy.env`, ADR-303),
  changeable or off. Not a rule criterion. [164, 303]
- **Pick-list reasons:** voiding, a typed ticket number, accepting a flag, a back-office-created
  record: **picked from a firm list** (defaults, extendable). [173]
- **Forms:** fixed fields on anything that bills (tickets, certifications); **firm-added fields**
  (text, number, yes/no, list, photo) on surveys, ROE forms and incidents, exported, never read by
  the engine or rules; free-text notes on everything. [160] **How they're stored (the path for
  flexible data):** a versioned form definition per record kind (a change is a new version, never
  an edit); each record holds **one JSONB answers column keyed by field ID** and the definition
  version it answered; checked by one schema generated from the definition (`packages/contracts`);
  corrected and audited like any captured field; through Prisma's `Json` type, no hand-written SQL.
  **Nothing the engine, a rule or a flag reads lives in JSONB**: a value they must read is promoted
  to a real column by a migration. A new field or field type is a definition change, not a
  migration. The direction is the user's; the details are an agent default `spec/DATA-MODEL.md`
  settles. [278] **A legacy "Document Format" is a Form**
  ("everything is a form", Q-103): a project picks a form for each document type (load, haul-out,
  unit rate ticket, truck certificate…), and **debris types are added to a form** (with Reduced,
  reduction method, Hidden on phones). **Debris types are named as the contract names the work**: Mulch
  and Ash are two debris types on the haul-out form. **Reduced** says the debris type is already reduced, a
  helper for rules, reports and checks; **reduction method** is a firm list (starts Grinding,
  Incineration, Compaction); **Hidden on phones** takes the debris type off that form's list on phones, and
  tickets that have it keep it. *Agent readings, to confirm:* a *Reduced* criterion on loads and
  haul-outs; setup **warns** (never refuses) when an unreduced class is added to the haul-out form,
  since C&D, metals and white goods often leave unreduced. [211, 214] **Field tags** (the legacy "Special Classes", ADR-234) come back:
  a project list the firm fills, starting empty; the collecting monitor picks one **optionally** on
  Complete, right after the debris type, and a unit rate ticket can take one too (the tower
  doesn't); read only by the *Field tag* criterion and exports; the firm decides what each
  means. *Agent readings, to confirm:* picked at a haul-out's loading end; on unit rate, on the
  review before the number. [211, 216, 218] **Built (ADR-308):** `Form` (one per document type
  on a project, archived ones included; `enabled` read only on forms that aren't a workflow's, whose
  use is `Project.workflows`'; "GPS required" stated on the ROE form alone), `FormDebrisType` (only on
  a load or haul-out form; archived, never deleted), `FormDefinition` (**per project form**, only on
  an ROE, survey, incident or drop-off log form; versions from 1, unique per form; never edited or
  deleted by anyone, a trigger refuses an edit; its fields' shape in `packages/contracts`),
  `Assignment.formDocumentTypes` (those four only). Setup's warning for an unreduced debris type on
  the haul-out form, and what a phone's list offers (not archived, not hidden), are `packages/domain`'s
  `DebrisTypeEntries`. [308]
- **Disposal site dates:** a disposal **before** the activation date ("site not yet active") or
  after a set close date ("site closed") is flagged. [173, 181]
- **Cert-number blocks:** 100 per certifying phone, topped up at sync. **A 0% load call is always
  flagged**, even with the 5%/95% limits off. [181]
- **"Allow split loads"** is a project setting (ticked by default where the program type requires
  ROEs). **Incident sub-types start empty**; the firm adds them. [137]

### Certification — `adms-certifications`
- It certifies a **container or a crew, never a vehicle**. **One number:** cert = placard =
  badge, pre-printed or system-issued, unique per project. Tickets copy it. [015, 016, 017, 045,
  056] **Unique per project only** (the user, ADR-318): the same number on two projects is
  ordinary, never flagged or refused; the golden mission's P2 has its own `730416`. A certification is never copied (ADR-328, below). [318]
- **System-issued cert numbers** come from a per-project series set at project creation, seeded
  with a number that doesn't look made up (e.g. `730415`), counting up by one; a tandem gets
  consecutive numbers. (Q-96, Build 1 answer) [102]
- **Capacity:** whole inches; a primary box plus boxes 1…N (rectangle, ÷2 triangle, two-length
  hoist, round bottom with 3.14, radius corner), each added or subtracted; round to hundredths at
  **each step**; ÷ 46,656; then a whole CY with .5 up. **No override.** Exactly §3A.3, and never
  the `development/` spec's truck section. [076, 078, 082, 087] **Built** as `packages/domain`'s
  `Capacity` (kind and boxes in; the whole CY and the sheet's lines out), in exact hundredths:
  **every single operation of a shape's formula is a step**, rounded half up; a zero, missing or
  fractional measurement, a radius corner marked add, or boxes that subtract as much as the primary
  holds give **no capacity and a plain reason, never a guess**; a crew has none. Whether such a
  certification is saved is its service's (1.2.3). *(agent default)* [320]
- A certification **never ends on its own**. **Tag expiry**, **revoked from a date** (admin, with a
  reason) and **replaced** (a modified truck gets a new cert and a "replaces" link) only flag later
  tickets, with a message to review the certification. **A driver's licence flags nothing**; the
  driver is recorded on the cert only and carried onto its tickets (no driver list). A measuring
  mistake is corrected in place and its tickets reprocess. [079, 082, 153]
- **A certification is never copied** (the user, 2026-10-04): a truck that moves to a second
  project is **certified there from scratch**, measured and photographed again, with that
  project's own number, as tickets, incidents and surveys are never copied (configuration is:
  pay items, rules). Supersedes ADR-152 (Q-143) and `REVIEW_ORIGINAL_CERTIFICATION`. **Built
  (ADR-330):** `Certifications.copy`, the domain's copy rule, `NumberAllocator.next` and
  `Certification.copiedFromId` are gone (three migrations: the viewers' view dropped, the
  column dropped, the view written again; 56 in all). [328, 329, 330]
- **A truck keyed in by hand** bills the **certification's** capacity; the typed capacity is only
  the monitor's claim, flagged if it differs; no such cert → unbilled and flagged until one exists.
  [154]
- **Attestation:** the certifying monitor makes and measures it; a helper is **picked** from the
  people assigned to the project with them, or left blank (never typed; `HELPER_NOT_FOUND` is retired,
  ADR-294, amending 080); then
  a back-office **QC** as "checked by", with a "signatures on file" yes/no. Representatives are
  names only. The paper's barcode isn't used. [080]

### Field events — `adms-domain` §1.2 [236]
- **A field event** is one monitor's record of one thing witnessed at one place and time, under a
  ticket number: collection `COL`, disposal `DIS`, haul-out collection `HOC`, haul-out disposal `HOD`,
  unit rate `URT`. **A ticket is its number and the events under it** (project + workflow + bare
  number). The first event makes the number and the truck carries it to the second.
- **Each workflow, fixed in code:** load `COL` → `DIS` (quantity at the disposal; a split has one
  `COL` per suffix); haul-out `HOC` → `HOD` (quantity at the TDSR end, the disposal confirms it
  dumped and left empty); unit rate, one `URT`. One event of each kind per ticket; another is the
  duplicate quarantined at sync.
- **The completed load and haul-out, statuses, flags, zone, mileage and transactions are not
  events**: the worker draws them from the ticket's current events and setup, alone, and again on
  every reprocess. A synced, back-office-created or corrected event, and a setup change, queue
  reconciliation of the tickets they touch (ARCHITECTURE §13).
- **Event-driven, not event-sourced** (agent default): corrections stay in place with the prior value
  in `AuditRecord`; no correction events, no replayed log. **Forms and certifications are records,
  not a ticket's events** (agent default).
- **Words:** "field event" or its kind; never a bare "event" where the declaration event could be
  meant. **Code** (agent default): `FieldEvent` with `kind` `COLLECTION` · `DISPOSAL` ·
  `HAUL_OUT_COLLECTION` · `HAUL_OUT_DISPOSAL` · `UNIT_RATE`; derived `CompletedLoad`,
  `CompletedHaulOut`.
- **What every kind records, as built (task 1.3.3)** [324]: `FieldEvent` holds
  `spec/DATA-MODEL.md` §4.1 (1)'s columns. **Where it came from** (`source`: `DEVICE` ·
  `BACK_OFFICE`): a phone's record carries its phone, assignment and setup version and no
  back-office person or reason; one created in the back office carries the person and the reason
  (from the firm's list) and no phone, assignment or setup version, and was made in no temporary
  session; the system actor creates none (one check, C44). **The number:** whether it was typed,
  and the reason picked; a reason on a scanned number is refused, **a typed number with no reason
  is taken**. **The certification:** the number as scanned, always there, a snapshot; the
  certification found, one of the field event's own project, empty until one has that number;
  keyed in by hand, with the capacity typed (**only on a truck keyed in by hand**, nought or
  more; a crew keyed in has none). **The site** is one of its own project's; a curb collection
  has none. **GPS at both ends**: a latitude and a longitude together, on the earth, or neither;
  no accuracy. **The address** with whether it was looked up or typed. Notes; made in a temporary
  session. **No new required column has a database default.** **Not checked, on purpose:** that
  a number is digits, that times are in order, that the certification found bears the number
  scanned, that a load is on a container's certification, that the site is the assignment's
  (flags, or nothing). No driver, contractor, zone, destination or rate on a field event.
  **Viewers:** a client user and an auditor see every column of their projects' field events
  (`guard_viewer`), and **who recorded each through `viewer_field_event_monitor`** (id, name,
  Monitor ID, nothing else of a person; owner's rights behind a security barrier, as
  `viewer_project_setup`); a contractor user none until 1.7.1. Who looks the certification up
  by its number is intake's and the worker's (1.4.2, 1.5.2). Sixty models, forty-seven
  migrations. *Agent defaults, but for the C44 check, which DATA-MODEL §8 approved.*
- **What each kind records, as built (task 1.3.4)** [325]: `spec/DATA-MODEL.md` §4.1 (2)'s
  columns, but for the ROE found, which joins with its own table (1.3.6; the scale receipt
  joined in 1.3.5, ADR-326). **None is required, on any kind**: a pick that didn't reach the server is a flag's.
  **The database refuses a detail on a kind that doesn't record it**: a debris type on unit rate
  work; a field tag at a tower or a haul-out's final site; an ROE number off a collection or unit
  rate work; an estimate off a collection; a carried count off a disposal; a kind of work,
  payable type, pay item, count, measurement, root ball, survey number or "marked ineligible"
  off unit rate work. **A debris type is the entry on the field event's own project's form for
  its workflow** (the field event repeats the entry's form and document type; foreign keys, no
  trigger); **a field tag and a pay item are its own project's**. **A split suffix is capital
  letters (`A`… `AA`), only on a collection or a haul-out collection**; a collection has its
  suffix and its estimate both or neither; a pile gives a load call, never an estimate. A
  measurement says whether it was read as a circumference or a diameter (`MeasuredAs`), both or
  neither; numbers are nought or more. **`FieldEventItem`** (an itemised unit rate event's
  lines: an item once, a count or hours) and **`CarriedTicket`** (the numbers a load's
  collection lists, as written, each once, never a link) sit only on the kind they belong to,
  are evidence audited in the records domain, and are seen by a client user and an auditor with
  their field event. **Not checked, on purpose:** a suffixed collection on a project that
  doesn't allow split loads; a pile with no load call; a disposal with both a load call and a
  count; a pay item against the kind of work or payable type beside it; an itemised event with a
  count of its own; quarter hours; a stump "as a circumference"; an ROE or survey number against
  the project (flags, or nothing). **The rule lives once:** `packages/domain`'s
  `fieldEventDetails` and `FieldEventDetails`; `packages/contracts`' `fieldEventDetailsSchema`
  asks it; a database test holds the database to the same table. How a correction takes an item
  line or a carried ticket off is task 1.8.3's. Sixty-two models, forty-nine migrations. *Agent
  defaults.*
- **Scale receipts and photographs, as built (task 1.3.5)** [326]: **`ScaleReceipt`**
  (`spec/DATA-MODEL.md` §4.2): its own record, apart from any ticket; the site's number **exactly
  as written**, **never unique** (the user, ADR-328; the key taken off, ADR-331: a receipt book
  starts again at 001, so two receipts of one number are both kept; a duplicate *record* is the
  worker's to flag, 1.5.x); its site one of its own project's; who entered it (never the
  system actor), when, on which phone if any. **Every weight is what the paper says**: all four
  may be missing (a receipt-book slip), none is worked out from another, a net of nought or
  below nought is kept for a flag; only a gross or a tare below nought is refused.
  **`FieldEvent.scaleReceiptId`**: only on a disposal and a haul-out disposal, only a receipt of
  its own project; **a load call or a count beside it is taken** (which bills: 1.5.4). **A
  tandem weighed once is one receipt both disposals point at**; no field event holds a weight
  and no share sits on the receipt. **`Photo`** (§4.4): the record only, the file is storage's;
  **exactly one owner, of its own project**: a field event, a certification or a scale receipt
  today (an ROE, a survey, an incident and a drop-off log join in 1.3.6, a quarantined record in
  1.4.2, C65); a **view** (`PhotoView`, the five) only on a certification's photograph, never
  required; when and where it was taken, the phone; **two fingerprints (SHA-256, 64 lower-case
  hex digits) and two places in storage, each place unique, all four written once** (a trigger
  refuses any change to them, by anyone); its owner, time, place and `uploadedAt` are corrected
  as evidence is. **The back office's two marks (ADR-329 (9), 337):** `archivedAt`, removed from
  the record (a mark with its time; the row, the file and its fingerprints stay; cleared to put
  it back; who did it is the audit record's actor), and `label`, the firm's own words (never
  blank; read by no check); both empty as a phone sends a photograph, both corrected by the API
  and audited, both in `viewer_photo`. **A removed photograph counts for nothing a record must have (the user, ADR-345)**: a certification's views (built), a pay item's required photographs (1.5.7); the service call is 1.8.3's. **The database counts no photographs** ("at most 8" stays the phone's rule;
  each belongs to the field event that took it). A certification is never copied (ADR-328), so each holds its own photographs. Both tables are
  evidence, audited in the records domain; a client user and an auditor see their projects'
  receipts and photographs' records, **never where a file is kept**; a contractor user none
  until 1.7.1. **Not checked, on purpose** (flags, 1.5.x): net against gross less tare; the
  receipt's site against the disposal's, or its type; one trip per receipt; a missing view.
  `fieldEventDetails` and `fieldEventDetailsSchema` hold the new link. No service, intake or
  story yet (1.4.2, 1.3.7). Sixty-four models, fifty-one migrations. *Agent defaults.*
- **ROEs and forms, as built (task 1.3.6)** [327]: **`Roe`** is configuration (ADR-294), in the
  records domain: edited freely by the API, audited, never deleted, no archive. Its number
  (issued, `R-0007`, or typed off the paper) is not blank and once per project; only the number,
  `signed`, `answers` and `source` are required, so one can be set up with its number alone. A
  phone's says who made it, the phone, the assignment and the phone's time; a back-office one
  has no phone, assignment or offset. **No setup version.** **`RoeScopeItem`**: exactly one of
  a debris type (an entry of its own project's **load** form, held by foreign keys) and a
  payable type, each once per ROE; a count of 1 or more, never checked; taken off by archiving.
  That a payable type is among the project's unit rate pay items isn't held by the database.
  **`Survey`, `Incident`, `DropOffLog`** are evidence in the records domain, with no status and
  no worker column: "its time" is `madeAt`; one check tells a phone's (phone, assignment, setup
  version) from one created in the back office (person, reason); a whole fix on the earth, or
  none. A survey's ROE and a drop-off log's site are its own project's; a survey has no unique
  key; **an incident may name the contractor involved, a cert number and an ROE number**, each
  optional (ADR-328 (3), built ADR-334: the contractor one on its own project, the
  certification and the ROE found its own project's, each only with its number; the project's
  incident form's `incidentOffers` says which a monitor is offered, never a refusal on the
  record); its sub-type isn't held to its type. **The firm's own fields:** `answers` is an object;
  the definition answered comes with its form and document type, all three or none, of its own
  project's form of the record's kind; **no definition means `{}`** (`formDefinitionId` is
  optional: a form with no added field has no definition). **The answers' schema is
  `packages/contracts`' `formAnswersSchema(fields)`**, made from the version answered (text
  not blank, a number, yes or no, one of a pick's choices, a photograph's id; required fields
  answered; no unknown field); the database doesn't run it. **`FieldEvent.roeId`** only on a
  collection and a unit rate event, its own project's, not held to match `roeNumber`.
  **`Photo`** has seven owners (the four new ones of its own project). A client user and an
  auditor see all five tables with their project, every column; a contractor user none.
  **Not checked, on purpose** (flags, 1.5.7): an unsigned or missing ROE, work out of scope, a
  post-work survey with no pre-work survey. No service, intake or story yet (1.4.2, 1.3.7).
  Sixty-nine models, fifty-three migrations. *Agent defaults.*
- **An outside design review** (contract-first templates, a state machine replacing rules, a billing
  matrix, hard field checks) was weighed: only the event idea is taken; each other point is already
  ours or declined, with the reason, in ADR-238. [238]
- **The harness's phones capture every kind (built, ADR-332).** **The pay item a unit rate
  measurement falls to is one rule**, `SizeBands.payItemFor` in `packages/domain`, for the phone
  and the worker: a payable type with one pay item is that pay item, measured or not (ADR-210);
  with several, the one whose band holds the diameter (a circumference ÷ 3.14, half up to a
  tenth), else **no pay item** (*agent default:* several pay items and nothing measured is no pay
  item too). The harness's phone (`packages/scenarios`) holds its assignment's lists, read from
  the server (never a rate, a rule or a load's pay item), scans the badge at New, picks by name,
  and takes the number last: the first field event's from its own block, the second's scanned,
  either entered again. *Agent defaults (the phone's own, Phase 3 may overturn):* **a number
  entered again that doesn't match saves nothing, the field event stays open and no number is
  used up; a cancelled field event stays on the phone, unsent, with no number; a typed number
  isn't entered twice; the next of a split chain carries its chain's number.** The story
  `p1-field-days` records P1's Monday and Tuesday: 25 field events, a scale receipt, an incident
  and a drop-off log, every field event `PENDING`. The stand-in intake writes them; the real one
  is 1.4.2 (C68). [332]

### Tickets and numbers — `adms-ticket-workflows`, `adms-exceptions`
- **Intake and quarantine are built (2026-10-04, task 1.4.2):** `Intake` (`apps/api/src/sync/`), a
  plain service with no endpoint (Phase 2 wraps it): `receive(record)` answers **`SAVED`** (with
  notes), **`ALREADY_SAVED`** or **`QUARANTINED`** (the reason, a plain message, the record that
  holds the number); `topUp(phone, reports)` fills the phone's number blocks, asked again when it
  loses a race. Each record is written as the monitor who made it, from their phone, with the
  server's received time. **A retry is known by the phone-made id** already being a record of
  its kind or a quarantined record; `Sync` and `SyncedRecord` wait for Phase 2. **A duplicate**
  (a second field event of one kind on one project, workflow, bare number and split suffix) goes
  whole into **`QuarantinedRecord`**: its phone-made id, project, phone, monitor, the record as
  sent (`payload`), the reason (`DUPLICATE_FIELD_EVENT` · `DUPLICATE_ROE_NUMBER`), what holds the
  number (`holdingEventId` or `holdingRoeId`, exactly the one the reason names) and the received
  time; later its resolution (who, when, what: free text until 1.8.x). **The first received
  holds the number**, a voided ticket's field event included. **An ROE made on a phone whose
  number the project already has is quarantined the same way.** What the phone sent is never
  changed (a trigger, any login) and never deleted; audited in the records domain; the worker
  never reads it. **A client user and an auditor see that a record waits; the record as sent
  only through `viewer_quarantined_record_citizen`**, where the firm lets them see private
  citizens. **`Photo.quarantinedRecordId`** is a photograph's eighth owner. **Intake fills in**
  the certification a cert number finds, the ROE a number finds (and points earlier records at
  an ROE when it arrives), and a debris type's form; **it refuses nothing else**: a record with
  a gap is saved as sent, `PENDING`. **An impossible GPS fix isn't written: the field event is
  saved without it and the fix kept as sent in `FieldEvent.unreadableGps`** (the domain's
  `GpsFix`; a form's, an ROE's and a photograph's is kept in the insert's audit reason). A
  form's answers are run against the version answered and saved as sent either way. A record
  the database's own constraints refuse throws and stays on the phone (the sync contract's,
  Phase 2). The words a phone is told are the domain's `Quarantine`: "Ticket 101020: this ticket
  already has a disposal. Not saved: kept in quarantine for review." Stories `sync` and
  `p1-any-order`; sixty-five migrations; 60 test files, 1,199 tests. Left for later: C69.
  *Agent defaults, for the user: an ROE's quarantine, first received holds the number, the
  wording, a viewer's sight, where an unreadable fix is kept.* [338]
- Two field events per load, two witnesses. The load call is on the **disposal** for a standard load
  and on the **collection** for a haul-out. One truck has one open load at a time. [013, 027]
- Numbers are **bare**, in a **per-project series per workflow** (load, haul-out, unit rate),
  from 100,001 to 9,999,999, unique per project. `COL`/`DIS`/`CLT`/`HOC`/`HOD`/`CHO`/`URT` labels
  are **display only**. Generated numbers come from **1,000-number device blocks**, reclaimed on
  reset. Control tickets use pre-entered ranges. [046, 056, 062, 065]
- **Numbering as built** [323]: `ProjectNumberSeries` (one per project and series: `LOAD ·
  HAUL_OUT · UNIT_RATE · CERTIFICATION · ROE`; first number, next number never handed out) and
  `ControlRange` (loads and haul-outs only; two of one series, neither taken off, never share a
  number). A generated project has a series per workflow; a control-ticket project only the unit
  rate series; either an ROE series from 1, and a cert-number series once the firm seeds it
  (without one, cert numbers are typed). **Two phones never hold the same number:** the database's
  `number_blocks_never_overlap` keeps apart what blocks *hold* (an issued or retired block its
  whole run; **a reclaimed block only what its phone used, so its unused rest is cut again for the
  next phone, once**: ADR-065's own words). A block is cut only from a series its project has;
  ticket series and their blocks lie inside 100,001–9,999,999 by checks. The rules are
  `packages/domain`'s `numbers.ts` (`NumberSeriesRules`, `NumberSeriesBook`, `PhoneNumbers`,
  `ControlRanges`, `NewProjectNumbers`); the allocator is `apps/api`'s `NumberAllocator`
  (`topUp`, `reclaim`, `retire`, `next`). **Block sizes are policy values:** 1,000 ticket
  numbers, 100 cert numbers, 100 ROE numbers. *Agent defaults:* **a phone-made ROE's number is
  written `R-0007`** (`R-` and at least four digits; written, never parsed); ROE blocks of 100;
  control ranges of one series never overlap; a top-up brings a phone to a full block of unused
  numbers at every sync, however few it used.
- **Splits:** N collections → 1 disposal, grouped on the base number; the first is **`-A`**, never
  bare. Each property's share = its estimate ÷ Σ estimates, applied to CY or tonnage. There is no
  divergence check. **Rules run once per property**, on its share (its own zone, address, mileage;
  the load's cert, disposal and load call; *Volume* = its share). [032, 033, 055, 064, 162, 173]
- **Split haul-outs** (where the project allows split loads): N haul-out collections → 1 haul-out
  disposal, one collection per **pile** at the TDSR (debris kept apart by the area it came from),
  `-A`, `-B`… Each gives the **load call so far**; the last is the haul-out's. A pile's part is what
  it added (10%, 35%, 85% → 10, 25, 50); its CY = capacity × its part, its share of a scale weight =
  its part ÷ the last call. **Rules run once per pile.** *Agent defaults:* a pile is told by its
  debris type and field tag; a call not higher than the one before is flagged
  (`PILE_CALL_NOT_HIGHER`) and nothing bills; the load-call limits judge only the last call. A truck
  and trailer hauled out and weighed once are split by capacity, flagged and marked as shares, as
  loads are. [295] **Paid by the CY or by the scale's weight, as the firm's setup says** (the user, as a
  firm): the pay item's Unit of Measure decides and the firm's rules pick it, exactly as a split
  load's shares apply to its CY or its tonnage; a haul-out usually ends at a scale house, so the
  weight is the common case; the load calls are taken either way and set the shares. [297]
  **Required and in the golden mission:** REQ-111a (the shape) and REQ-120j (the shares); mission
  ticket **201004**, approved: 110 CY, calls 10%, 35%, 85%, dumped at Cypress Creek Landfill and
  weighed at 24.00 tons → 2.82, 7.06 and 14.12 tons, one `MULCH-HO-TN` line per pile at $20.00,
  three lines, $480.00; its CY (11.0, 27.5, 55.0) kept, unbilled. P1 ticks *Allow split loads* and
  holds both `MULCH-HO-CY` and `MULCH-HO-TN`, its haul-out rules picking by *Disposal site* (201001,
  to Bayline County Landfill, stays by the CY). *Agent defaults:* the second landfill, its per-ton
  rate and its monitor; no flagged pile; numbered 201004. A split haul-out paid by the CY and one
  with a pile that isn't higher are acceptance scenarios, not mission tickets. [296, 297]
- **A refused load is not recorded**; a load dumps once and has **one** disposal. [155]
- **ROEs** are records like tickets: made on a phone (offline) or in the back office; number,
  parcel ID, address, owner, signed + date, **scope** (choices, counts, GPS), photo of the signed
  form. On an ROE-required project **every collection, unit rate ticket and survey carries one**. A
  **post-work survey links to its pre-work survey by ROE number** (flagged if none). A phone-made ROE
  takes a number from the phone's block unless the paper ROE has one (typed); its **scope** is
  picked from what the project already has (its load form's debris types, its unit rate payable
  types, each with an optional count that is recorded, never checked), and a ticket whose debris
  type or payable type isn't among them is flagged; no picks, no scope check (ADR-293, amending
  ADR-181 (6)); "GPS required" is a setting on the ROE form. [149, 150, 181]
- **Unit rate:** after the crew badge and crew photo, the monitor picks the **pay item** being done
  (the legacy "hazard type") **by name**, never a code: the list shows **each payable type once**
  (Leaners, Hangers, Stumps), the monitor measures, and **the phone works out the payable pay item** in
  the background from the pay items' size bands, printing it on the receipt with the work
  details; reconciliation matches rules on that pay item, the measurement and the contractor. So
  **each unit rate ticket carries one pay item**. The ticket keeps **the pick and the pay item**;
  reconciliation works the pay item out again from the bands, so a corrected measurement moves it on
  reprocess (the phone's answer printed, the engine's bills); **no band → no pay item, flagged**;
  bands in one payable type **can't overlap** (setup refuses) and a gap warns; rules test *Service
  code*, one per band. [207, 213, 217] Itemised details (washer, dryer; skid steer, truck) sit inside that one code and are **not**
  pay items. Capture shape ≠ billing basis. Itemised lists (white goods, HHW, **crew time as
  item + hours**). HHW pounds are entered as the count. **Each unit rate code names its kind of
  work** (Hangers, White Goods, Crew time…, the sub-type list), which picks the screen and the item
  names; a phone gets the unit rate codes chosen for it at setup. White goods bill the **total of
  payable items**; crew time bills the **highest item's hours**, once; freon recovery is either
  extra transactions from the item list or its own ticket, per project; kinds never mix on a ticket.
  **Rules** say which items count toward which code (*Item* criterion, *Quantity from*); a code with
  no rate is a **$0 code** that still writes a line (staged freon). White goods pay **per item
  removed, not by type**; a staged freon fridge gets only the $0 line, then `WG-RMV-EA` + `WG-FRN-EA` when removed
  later (not double billing). Worked example: ticket A = `WG-RMV-EA × 6`, `WG-FRN-EA × 2`; ticket B = `WG-RMV-EA × 4`,
  `WG-FRN-EA-STG × 2` (`spec/RULES.md` §9). [040, 054, 084, 124, 126, 127, 128, 131, 132]
  **Measurement:** a standing tree at chest height before it's cut; the monitor records **whether
  they measured the circumference or the diameter**; rules test the **diameter** (circumference ÷ 3.14,
  half up to a tenth); an already-cut tree's diameter, with photos, is eligible; QC checks the photo.
  One per ticket (a hanger: limbs of 2 in or more); "Measurement required" is a pay item setting. A
  pay item's **size band** (from, to) sets its place among the pay items of one payable type (the
  phone and the engine pick the pay item by it), and on a payable type's only pay item they **flag**
  a ticket measured under or over them. A pay item with **"Monitor may mark ineligible"** lets the monitor
  mark the work **ineligible**, and the ticket is flagged. [210, 213]
  **Stumps:** CY = [(D² × 0.7854) × 24 + ((3.6 D)² × 0.7854) × 31] ÷ 46,656, D = diameter two feet up
  (L = 24 in recorded from the user). From the USACE Stump Conversion Guide: the ticket records **only
  the diameter** (root ball fixed by the guide, no fill dirt); CY **rounded half up to one decimal**
  (30 in → 6.5 CY; all 79 table rows match). A stump is **two pieces of paid work, extraction and
  debris removal**, each with the firm's own codes and rules. **Paid as the contract says, never from
  the stump's CY:** in the user's example, extraction **EACH by size class** of the diameter two feet
  up (#1) and **fill per CY** (#2), one ticket per stump, two codes (ADR-196). **Under
  24 in is not an eligible stump** (flagged, never refused; FEMA pays per stump only from 24 in two
  feet up); no maximum; the same formula at every size; **no circumference** for stumps. The monitor
  measures **the stump two feet up** (the *Measurement*, the 24 in test) **and the root ball's
  diameter**, for the fill; a root-ball reading never goes into the stump CY formula as D. **The stump
  ticket is a unit rate ticket, kind of work Stumps** (built in): diameter two feet up, root-ball
  diameter, "half or more exposed" (yes/no), **no hole depth**; the survey number picked or typed
  (none: flagged). **Fill CY = 0.7854 × root ball² × 31 ÷ 46,656**, half up to a tenth (31 in is the
  USACE guide's root-ball height; 96 in → 4.8 CY). A rule pays from **the stump (1 each) or the fill
  CY, never the stump CY**; **no root-ball rule criteria**. The fill is an ordinary rule
  (*Pay item = the stump code* → #2 from the fill CY); no root ball, no fill CY, no fill line.
  **Two built-in stump checks**, each on by default and switched per project: root ball not wider
  than the stump; fill paid but the root ball not half exposed (both still bill). A blank root ball
  is flagged when the code requires the measurement. **The 31 in is a project setting**, default 31.
  [198, 203]
  A smaller stump goes out as ordinary vegetative debris. **A load of stumps is an
  ordinary load whose code measures quantity "from the stumps"**: never called or weighed; the stump
  ticket's number is painted on each stump and the loading monitor adds each by that number (no match,
  or already on another load: flagged); the tower counts and confirms (mismatch flagged); CY = each
  stump's CY rounded to a tenth, then added. **Backfill** is the firm's own code and rule on the stump
  ticket, measured from the **root ball** (not the stump CY); a stump ticket under 24 in stays flagged
  (a firm's rule may void it). **Whether the load of stumps bills its CY is the firm's rules**: a
  hauling code where the contract pays hauling (the sheet in `spec/RATE-SHEET.md` does), a $0 code where the
  per-stump price covers transport; nothing checks for "paid twice". [177, 178, 183, 187, 189, 192,
  196, 198, 199] **Demolition** is ordinary debris work billed by the CY on a project named for it; no
  kind of work, no square-foot unit. [200] **White goods priced by destination** ride a load: the curb
  unit rate ticket, then a collection when loaded, a white goods debris type, a code and a distance
  rule; the load needs no load call because its pay item's quantity comes **from the tickets it
  carries** (ADR-215; no longer a "staging" site); rare. The items are **paid once, on the load**, at the mileage
  band's rate (six fridges 40 miles away, `WG-HAUL-EA-60` 6 × $65, not $40 at the curb plus $65); the count comes from the
  white goods ticket the load carries (added by its number, counted at the tower, like a load of
  stumps); the curb ticket's own lines (e.g. freon) are the firm's rules. "White Goods" is a **debris
  type the firm adds**; nothing groups types (field tag doesn't change that, ADR-218). [201, 204, 215] **Crew time:** several tickets a day per crew allowed; the 12-hour check adds each
  item's hours over the crew's day; overlapping crew-time tickets are flagged. [158, 159]
  The crew badge is kept on the
  phone until the monitor changes crew (the system doesn't track it); monitors document only work
  they believe eligible, except that a pay item with "Monitor may mark ineligible" lets them mark work
  ineligible (flagged). [111, 210]
- **Every start on the phone** (ticket, incident, form) is **start → pick from a list → maybe a
  sub-list → details**, each list built from project setup and custom values. **The legacy order**
  (ADR-209): every phone opens on the same home screen; **New** takes the **badge scan** and opens
  the ticket, which waits in the phone's open list while the truck loads; **Complete** takes the
  details and then **the ticket number**: the control ticket scanned, or a generated number shown at
  that same point, then **re-entered by hand** to confirm, generated numbers too. The tower follows
  the same pivot. **What the monitor picks, by name, never a code** (ADR-207): a load's or haul-out's
  **debris type** on Complete, from the project's debris types on that form (ADR-211, Q-201); a
  unit rate **pay item** after the crew photo. **The truck's scanned information, not the monitor's
  pick, decides whose work it is** (ADR-186). **Both events pick the debris type** and a difference
  is flagged "debris type mismatch". A load's capture settings (weight instead of a load call, a
  quantity from the tickets it carries, photos, GPS) **stay on the pay item** (ADR-213, ADR-221). **No
  phone knows which pay item a load is paid at** (its miles, so its pay item, are known only after
  sync) (ADR-221). **A load asks for one quantity, never both**: a load call, or the scale weight
  when the pay item the firm's rules pay it at is by weight (its **Unit of Measure**); **the site
  doesn't own weighing**; **no pay items are ticked on a phone**, whose setup stays basic; a haul-out
  takes its load call at the loading end as always. Fees never make a phone ask for anything (ADR-224).
  **What a site's phones ask for is worked out ahead by the back office** from the rules on that
  form that could match there (tipping fee pay items left out) and **follows the truck's prime**: all per ton
  or pound → the scale receipt instead of a load call; all "quantity from the tickets it carries" → a
  **count** of the stumps or items on the truck (agent default, ADR-243); anything else (per CY, a mix,
  no rule) → the load call. **The phone's assignment names its site, and its lists carry that site's
  lookup** (ADR-240, 243); it's shown on the site's page. The tower holds no ticket list: the worker
  compares its count with the collection's carried tickets after sync (ADR-243). A weight-paid
  haul-out keeps its loading-end load call, unbilled. A Final Disposal tower offers the receipt
  number as an optional field (agent default). [213, 221, 223, 227, 243] Where "normal or
  split" is asked in the new order: not yet placed. Surveys/ROE start with the **work type** (Pre-work · Post-work · ROE); incidents with
  **type, then sub-type** (firm-added, empty at install). "Normal or split" is asked only on projects
  that **allow split loads**. [127, 137, 186, 207, 209]
- **Capture:** the collection address comes from "Get GPS" then "Get address info" (looked up if
  online, else street number and name typed); a typed ticket number is flagged and needs a reason;
  the load call is **typed** as a whole number 0–100, never prompted; **0 is accepted and flagged**
  and bills nothing. [111, 116]

### Reconciliation and review — `adms-validation`, `adms-exceptions`
- **The worker's run is built, unpriced (task 1.5.9, 2026-10-05):** `new Reconciliation(db, clock, { crewItemHoursLimit, longestRunMs }, mileages).run({ projectId, trigger, requestedById? })` (`apps/worker/src/reconciliation/`) answers `{ ran: true, runId, ticketsDone, ticketsFailed, tickets, pending }` or `{ ran: false, reason: 'RUN_UNDER_WAY' }`. **One run per project at a time**, by a Postgres advisory lock held in a transaction for the length of the run (a run needs two connections). **It reads the whole project once** (`ProjectRead`: every field event that isn't void, the setup, what was concluded before) and **works every ticket**: no queue record exists; what starts a run is Phase 2's job queue. **One ticket is one `db.$write` as the system actor** (`TicketWork` concludes, `TicketWrite` writes): the worker's columns on its field events, its completed load or haul-out with a row for each collection (updated in place; marked dissolved, with its rows, while the ticket isn't whole, and un-marked when it is again), its flags through `Flags.compared`, the run's decision. **Only what differs is written**: a run over unchanged input writes its run and decisions and not one other audit record. **A ticket that errors** gets `NOT_PROCESSED` (once) and a decision with the error, in a piece of work of their own; its status and earlier conclusions stay; the flag clears when it is next worked. **The worker never states a person:** who asked for a reprocess is the run's `requestedById`. **A kept mileage stands until the audit log says an end moved** (the collection's end GPS, the disposal's site, the site's GPS; `MileageStanding`). **Flags on no ticket** (a certification's views, a site's permit, a survey's) are checked for every such record in every run. **A flag on a number no field event is under any longer is cleared.** A load bills from the certification its disposal scanned; a haul-out from the one scanned at the loading end. `reconciledAt` is when the worker last changed its conclusions on the field event. No acceptance is read yet (1.8.x), void field events are left out (1.6.3, 1.8.x), and nothing is priced (1.6). *Agent defaults.* [352]
- Offline all day; arrival order means nothing; order by field time; load comes in bursts. [030]
- Group by **project + workflow + base number**; type is never used to *find* a pair. [019, 033,
  062]
- **Flag, never block.** Messages are plain facts ("Ticket 101008: debris type mismatch. Flagged
  for review."). The only sync rejection is a duplicate number, quarantined in full. [021, 022,
  052]
- **Statuses:** `PENDING | COMPLETED | MANUAL_REVIEW | VOID`. **Review still bills**. A void stops
  billing; it's made by a person with a reason (a **Void ticket** button) or by a rule's **Void
  ticket** action, which names the rule. [060, 118]
- **QC status, separate:** QC Review → **QC Approved / QC Issues / QC Void**, set by hand. It's the
  back office's own review mark: it never changes the record or re-runs reconciliation. **Only QC
  Approved tickets can be locked as invoiced** (QC Review, Issues and Void all block). **For loads
  and haul-outs only the completed load (`CLT`/`CHO`, a split included) is QC'd and locked; never a
  single event.** Events are flagged and corrected before the merge. Unit rate tickets, incidents, certs and
  forms are QC'd on their own. [107, 117, 121, 168] *Agent default:* QC status, the invoice lock and
  a flag's acceptance are **their own records**, written by the API and keyed to the record they
  mark, so the API never updates a derived row (ARCHITECTURE §5.1) and a reprocess can't lose one. [245]
- **Accepting a flag:** a reviewer **accepts** a flag that's right as it is, with a reason, audited;
  it isn't raised again unless the facts it was about change. All flags fixed or accepted →
  `COMPLETED`. Those who may correct may accept. [166]
- **A rule's void always wins:** an unvoid lasts until the next reprocess; to keep it, correct the
  data or the rule. [167]
- **No ageing:** an unpartnered event never expires, and preloads are normal. Only impossible
  timing is flagged. [053] *Agent default:* a `PENDING` ticket shows the flags of the field event it
  has (a typed number, a certification) so the review queue can act on them; it stays `PENDING`
  until whole. [244]
- Cert validity is judged at **work time**, and a failure flags. [048, 079]
- **Reconciliation's acceptance scenarios are `spec/acceptance/06-reconciliation.md`** (162, AC-06-…; a draft for the user). **The flag catalogue is 66 flags** (67 less `REVIEW_ORIGINAL_CERTIFICATION`, ADR-328). The things ADR-329 keeps and flags have no code or words yet: worded with the user by tasks 1.5.5 and 1.5.7. **`OVERLAPPING_LOADS` is raised on both tickets** (the catalogue, and the user, ADR-342: the ticket the truck dumped under is `MANUAL_REVIEW`, still bills, and can't be locked as invoiced until its flag is fixed or accepted; the phantom stays `PENDING`, flagged, until voided. The same flag covers two loads that both happened on one cert number, a wrong badge scanned. Whether voiding the phantom clears the other's flag is 1.5.5's; KD-71 (1) closed). [339, 342]
- **The derived records are built (ADR-340):** `CompletedLoad` (one per disposal event, for its life: quantity source, capacity, load call, volume, weight and whether it is a share, carried count, `dissolvedAt`), `CompletedLoadCollection` (a row for each collection: suffix, share, volume, weight, mileage with its source, road point and map data), `CompletedHaulOut` and `CompletedHaulOutCollection` (the same, with `pileLoadCall`), `Flag` (`FlagCode`, the catalogue's 66 codes held to `spec/FLAGS.md` by a test; message; facts with their SHA-256; `FlagBilling`; the # and pay item of a line; raised and cleared), `ReconciliationRun` and `ReconciliationDecision` (one for a ticket in a run); on a field event the worker's `zoneId`, `mapVersionId`, `workedOutPayItemId`. **Only the worker's login writes them** (the API reads; nobody deletes); on a field event the worker writes those three, the status and the run time, and nothing captured. **A load can't be concluded twice:** one completed record per disposal, dissolved or not; a collection a live row of one; a ticket number one live completed load's and one live completed haul-out's per project; a suffix once among a record's live rows. **The live rules are exclusion constraints `WHERE dissolved_at IS NULL`**, never partial unique indexes (Prisma would drop those in its next migration). **Whatever a derived record or a worker's column names is its own project's**; a zone is one of the map version used. *Agent defaults:* a collection row's own `id` and repeated `projectId`; `mileageSource` only with a mileage; the kind of field event a completed record names is the grouping's to keep, not the database's; no check ties the quantity columns to `quantitySource`; a client user and an auditor see the completed records, their rows and the flags, **no viewer a run or its decisions**; audit domains `BILLING` (completed records and rows) and `OPERATIONS` (flag, run, decision). **Not decided here:** how the worker finds the tickets to work (no queue record exists; 1.5.9), and who points a field event at a certification made later (not the worker: it can't write `certification_id`; 1.5.5). `Transaction` and `InvoiceLock` are unchanged until 1.7.1 and 1.8.2. Tests: `packages/db/test/derived-records.test.ts`. [340]
- **Mileage is built (ADR-349, 350):** `packages/domain/src/mileage.ts`: `new Mileage({ from, to }, mapData)` (the collection's end GPS, the site's own GPS; the extract's date and SHA-256) gives `.byRoad(roadPoint, routeMiles)` and `.straightLine(roadPoint | null)`, each a `MileageMeasured` (`miles` as text at four places, `source`, `ends`, `snapped`, `snappedAddress`, `mapData`); `Mileage.noRoadRoute(flags, subject, collectionEventId, measured)` is the `NO_ROAD_ROUTE` flag, or none. **The asking is the worker's** (`apps/worker/src/mileage/`, its first code): `new MapServers({ routing, addresses, caFile, mapDataSha256, timeoutMs })` has `nearestRoad`, `shortestRouteMiles`, `addressOf` and `mapData`; `new Mileages(servers).between(ends, standing?)` is the step for one collection: `standing` is the row's mileage, handed in only while neither end has been corrected since, and then no server is asked. **The route is asked by distance as a car drives it, never the server's plain `shortest`, so it crosses no private road and no farm track (the user, ADR-350).** **Nothing keeps a mileage's two ends** (ADR-350): they are the collection's end GPS and the site's GPS on the records. **A map server that doesn't answer throws; only "no road" and "no path" are the straight line.** The tests (`packages/domain/test/mileage.test.ts`; `apps/worker/test/mileages.test.ts`, which needs `pnpm local:up`) use **the example world's stand-in points on the pinned extract** (`spec/CONVENTIONS.md` §6: Marsh Road TDSR 39.09000000, −75.62000000; 14 Heron St 39.13850000, −75.55370000, 6.2050 road miles away); **every fixture stands on those points since task 1.5.8a (ADR-351)**, and the made-up points round 27.98° N, 82.40° W are retired. **Mileage is shown with the transactions** (the user, ADR-350 (4)): each exported line of a load or a haul-out shows its mileage and how it was measured; a transaction stores no second copy and reads it from its property's or pile's collection row (agent default; 1.7.1, Phase 4). **Left:** how the run knows an end moved (1.5.9). REQ-126f waits for the run.
- **The checks on quantity, the pay item's settings, unit rate work and forms are built (ADR-347):** `QuantityChecks` (`quantity-checks.ts`): the load call that is the ticket's (a load's disposal's; a haul-out's loading-end call, the last pile's on a split, read once the ticket is whole) against 0% and the project's limits; `PILE_CALL_NOT_HIGHER`; a scale receipt handed with every disposal that points at it: unusable (a net below nought, or no net and only one of gross and tare; **a receipt with no weight at all is a lineage token, not flagged**), two debris types (its weight unused, no share said), one weight shared (each ticket at its share); a carried ticket not found, or on another load (**both loads flagged**). `UnitRateChecks` (`unit-rate-checks.ts`): **the worker's own pay item**, from the live pay items of the payable type picked, by `SizeBands.payItemFor`; `NO_SIZE_BAND`, `OUTSIDE_SIZE_BAND`; several pay items and nothing measured is "no measurement"; the settings of the worked-out pay item (measurement, GPS at the end fix, at least one photograph not removed, whole counts); `MARKED_INELIGIBLE` wherever the record says so; ***Count is always 1* raises nothing** (it makes the count 1 at pricing, 1.6.3); the stump checks on the key `STUMPS` (under 24 in, FEMA's fixed test; **`301005` carries `STUMP_UNDER_24` alone**; root ball not wider, by the project's switch; root ball missing; no survey); crew time (a kind of work counted in items by hours): each item's hours over the crew's project day against a limit handed in, **the policy value `CREW_DAY_HOURS`**, flagged on the ticket that takes it over and each later one that day; overlapping crew-time tickets flagged on each. `RoeChecks` (`roe-checks.ts`): missing, not on the project, unsigned, out of scope, only where the program type requires ROEs, on a collection and a unit rate event; **a ticket's ROE flag puts it in review like any other, and it still bills**; a survey's ROE flags and `NO_PRE_WORK_SURVEY` sit on the survey. Left for 1.6.3: `QUANTITY_MISSING_FOR_PAY_ITEM`, `FILL_WITHOUT_EXPOSED_ROOT_BALL`. **Approved by the user and built (ADR-348):** `SCALE_NET_DISAGREES`, a receipt with a gross, a tare and a net whose net isn't the gross less the tare (pounds to the pound, tons to the hundredth; kept as typed, still bills from the net as written), and `TWO_QUANTITIES`, a load's disposal with a load call and a usable scale weight (still bills; the pay item says which; never compared); **the catalogue is 77 flags** (`spec/FLAGS.md` §3.10; seventy migrations). *Agent defaults but for those two flags' words.* [347, 348]
- **The checks on place are built (ADR-346):** `packages/domain/src/geodesic.ts` is the one home of distance (`new Distance(from, to).meters()`, `.isWithin(m)`: the WGS84 geodesic by Karney's algorithm, `geographiclib-geodesic` 2.2.0, MIT; a point on the circle is inside); `ShapeArea` in `map-shapes.ts` says whether a point is in a shape (an edge inside, a hole outside); `place.ts`'s `PlaceChecks.of(ticket)` judges a collection and a unit rate event against the boundary then the zones and answers the zone and map version to attach, a disposal and both haul-out ends against their own site's shape or the project's circle, a disposal (a haul-out's too) against the site's dates, a load's disposal against *Takes loads* and *Ineligible site*, a haul-out's collections against *Haul-outs leave here* (once for each site) and its disposal against the TDSR key; `SiteChecks.permit(site)` is the site's own flag. **Agent defaults:** no map, nothing raised and no zone; a map with no zones never says "not inside any zone"; outside the boundary is one flag and no zone; a point in two zones is in the first the version names; a haul-out's collection takes no zone; a field event with no fix or no site is not placed and nothing is raised for it here; a site is open on its activation and close dates themselves, and a haul-out's collection isn't judged by them; a haul-out dumped at a site not marked *Takes loads* or at an ineligible one isn't flagged (the catalogue says "a load"); a flag judged against a site's shape keeps the shape's version, one judged against the circle the site's GPS and the metres. `TIPPING_FEE_RULE_MISSING` is 1.6.3's. [346]
- **The flag catalogue and the first checks are built (ADR-344):** `packages/domain/src/flags.ts`: `flagCodes` (75 since ADR-345, the page's order), `flagBillings`, and `new Flags(timeZone).raise(code, subject, told, facts[, fieldEventId])`, which gives a `FlagRaised` (code, subject, field event, message, billing, facts, `factsSha256`). **A new check raises a flag only through it**, saying what the message is *told* (names, times) apart from the *facts* kept (ids, numbers, days, ISO instants): a renamed site changes no flag. **A flag is the same flag when its code, field event and facts' hash are** (`Flags.compared(standing, now)` → kept, cleared, raised). `packages/scenarios/test/flag-catalogue.test.ts` raises each flag with the page's example and compares it with `spec/FLAGS.md`: **a new flag is a row on the page, a code in `flagCodes` and `FlagCode` (a migration), an entry in `flags.ts` and an example in that test.** `checks.ts`: `new TicketChecks({ timeZone, activeFrom, activeTo, certifications, deviceClockOffLimitMinutes }).of(ticket, { otherLoads, carried })` raises §3.1, §3.2 and §3.3's time rows; `new CertificationChecks(timeZone).views(certNumber, photographs)` the certification's missing views. `ProjectClock` (`project-clock.ts`) answers every day, date and time in the project's time zone. *Agent defaults:* **the work time is the field event's end**; a tag is good through its expiry date; replaced means after the new certification's certified instant; certification flags are per field event; `NO_CERTIFICATION` not on the end that didn't take the quantity when the other end found its certification; `OVERLAPPING_LOADS` reads only loads that aren't void (voiding the phantom clears the other's flag), loads only; `SPLIT_SUFFIX_GAP` once the ticket is whole; the window never judged on a disposal; no time-zone check on a back-office record; a removed photograph is no view; **`DEVICE_CLOCK_OFF`'s threshold is handed in and its policy value waits for Phase 2's sync record**; nothing flags a suffixed collection on a project without split loads, a control ticket outside its ranges, or a field event whose project isn't its assignment's. **§3.10, a record that should not have been possible (ADR-345, the user's "Yes to all" and "make them flag"):** `DETAIL_MISSING` (no debris type; a haul-out collection with no load call; a unit rate event with no kind of work; a load's disposal with no load call, no scale receipt and no count), `TYPED_NUMBER_NO_REASON`, `WRONG_KIND_OF_BADGE`, `GPS_UNREADABLE`, `NOT_A_TICKET_NUMBER` (`TicketChecks.notATicketNumber(event)`; not billed; in no ticket), `ENDED_BEFORE_STARTED`, and the backup catches `SPLIT_NOT_ALLOWED`, `OUTSIDE_CONTROL_RANGES` (only where ranges were entered for the series), `ASSIGNMENT_ON_ANOTHER_PROJECT`. **Whatever a record must have is counted from what is on it now (the user, ADR-345): a photograph the back office removed counts for nothing**, towards a certification's five views (built), the photographs a pay item requires (1.5.7) or any required count; removing one or putting it back reprocesses its ticket or certification (1.8.3). [344, 345]
- **Quantities are built (ADR-343):** `packages/domain/src/quantities.ts`, plain classes over exact decimals (no floating point; figures are text at their column's scale). `new LoadQuantities({ capacityCy, loadCall, weightTons, weightIsShare, collections, carried }).work()` and `new HaulOutQuantities({ capacityCy, piles, weightTons, weightIsShare }).work()` give the completed record's figures and a row for each property or pile; `new ScaleWeight(receipt).net()` reads a receipt (net tons as written, else net pounds, else gross less tare; **usable only above nought**) and `.sharedBy(containers)` splits one weight by certified capacity, each marked a share; `new StumpQuantities(diameter, rootBall).stumpCy()` and `.fillCy(projectFillDepth)`; `new CarriedTickets(found).quantities()`; `quantityFor(payItem, figures)`. **Shares are rounded a half up and what is left goes to the largest, the last of equals** *(agent default)*. **Which figure bills is the paying pay item's to say** (its Unit of Measure, its *quantity from the tickets it carries*), for a load call beside a weight and beside a count alike *(agent default)*; `quantitySource` only describes what the tower took. Where shares can't be worked out (an estimate missing, a pile's call missing or not higher) the whole keeps its figures and no property or pile gets one *(agent default)*. It raises no flag and compares no two quantities. [343]
- **Grouping and status are built (ADR-341):** `packages/domain/src/tickets.ts`. `new Tickets(fieldEvents)` gathers them into `tickets` on **project, workflow and the number as recorded** (the suffix is its own column), in the same order whatever order they came in, and lists `pending` (each missing a field event). A `Ticket` has its `events` in field order (a disposal's start, any other's end), `collections`, `disposal` or `unitRate`, `missing`, `isWhole`, `isSplit`, `splitShape` (the suffixes present, each skipped, a bare collection beside suffixed ones: read here, flagged by 1.5.5), `timeOf(suffix)` (that collection's end, ADR-161) and **`status(raisedFlags)`**: `PENDING` while a field event is missing, whatever its flags; whole, `MANUAL_REVIEW` while any raised flag isn't accepted, else `COMPLETED`. The worker's statuses are a closed set of three (`workerStatuses`); `VOID` is never its. *Agent defaults:* whole is at least one collection and the disposal (a unit rate ticket its one field event); a second field event of one kind on a ticket is an error thrown, never a pick (the worker's errored-ticket path); suffixes run A…Z, AA…; **a field event whose ticket number isn't digits is in no ticket** (`notTicketNumbers`), pairing with nothing, a unit rate event included, and its flag, status and billing are 1.5.5's with the user; what a flag does to the money is never read for the status; nothing in the module takes a clock or a received time. Tests: `packages/domain/test/tickets.test.ts` (24). [341]
- **GPS checks:** a disposal's end GPS against its site (kept); the **5 km collection route check is
  dropped** (collections cover long distances); the project **boundary** check replaces it. The
  pair's "zones differ" and the split's "same zone" checks are **dropped**: a load's zone is its
  collection's. [135, 136, 141]
- **Where it went:** a load dumped at a site not marked Takes loads, or a haul-out leaving one not
  marked Haul-outs leave here, is flagged; a load at an ineligible site is flagged and bills; a load at a
  site that charges a tipping fee with no line for the site's tipping fee pay item is flagged as a missing rule ("Ticket
  101011: dumped at Bayline County Landfill, which charges a tipping fee, but no rule on this project
  gives it one. Flagged for review.", ADR-222); a line whose pay item needs a quantity the load
  doesn't have is flagged ("Ticket 101012: TIP-FEE-TN-BCL is priced per ton, but the load has no scale weight.",
  ADR-223). The system checks where debris went, never
  where it was headed. [205, 215] **Stump checks** (on by default,
  per project): root ball not wider than the stump; fill paid with the root ball not half exposed.
  [203]
- **Corrections:** a permitted user may fix **any captured field** in place (audited), including
  renumbering. Void is for work that never happened (never renumber a phantom), and unvoid is an
  audited override. Any ticket, **completed ones included**, is then reprocessed; the engine
  updates its existing reconciled record. Reconciled records are system-only. [028, 039, 051,
  086]

### Pricing and the ledger — `adms-ledger-audit`
- **What the passing rules write is `packages/domain/src/ticket-pricing.ts`** [355]: `new TicketPricing({ timeZone, rules, contracts, primes, payItems, stumpCheckFillNeedsExposure }).of({ ticketNumber, form, primeId, operatingSubId, pieces, dumpedAt, raised })` answers `{ voidedBy, lines, flags }`. A ticket is priced a piece at a time (a load or each property, a haul-out or each pile, a unit rate ticket): every passing rule found, every *Add transaction* in # order, then every *Remove*, then any *Void*; the same answer whatever order the rules are in. **The user, 2026-10-05:** an amount is rounded **to the cent a half up**, and is the quantity as the line keeps it (four decimals) × the rate; **a crew day by exact division keeps four decimals** (10.25 h ÷ 12 = 0.8542); **hours in no step of a crew day paid in steps bill nothing on that line, and the ticket is flagged**. A ticket under a check's flag that says "not billed" gets no lines, accepted or not (`spec/FLAGS.md` §1), though a rule's void still runs; a haul-out dumped at a TDSR skips every rule. The pricing flags (`NO_PRICING_RULE`, `DUPLICATE_TRANSACTION_NUMBER`, `NO_RATE_FOR_PRIME`, `RATE_TO_BE_NEGOTIATED`, `QUANTITY_MISSING_FOR_PAY_ITEM`, `TIPPING_FEE_RULE_MISSING`, `FILL_WITHOUT_EXPOSED_ROOT_BALL`) are raised only where the rules ran, each keeping the # and pay item of its line where it is about one. Agent defaults: two creates of one # stop that # only; a removed fee isn't a missing rule; a pay item with no rate at all is a $0 pay item, not flagged; TBN writes no line; a stump with no root ball gets no fill line and no flag from pricing; a rule naming a pay item the project doesn't have throws. **Nothing writes a transaction yet**: the worker reads none of this until 1.7.2 (BACKLOG C73). KD-72: a TBN ticket is `MANUAL_REVIEW` until its flag is accepted (the catalogue), where the skill says it completes.
- **Which rules may run on a ticket, and which pass, is `packages/domain/src/ticket-rules.ts`** [354]: `TicketReadings` (what the criteria read, one reading for each property or pile; the prime from the certification on the field event that took the quantity), `CriterionCheck` (one line on one reading), `TicketRules` (`mayRunOn`, `passing`). **A line that compares with something the ticket doesn't have never passes, however it is worded; only IS EMPTY does (the user, 2026-10-05).** Mileage is compared through `Mileage.inTenths`, every other number by its exact value; text without regard to capitals (*agent default*). The worker calls it from task 1.6.3.
- **Pricing's acceptance scenarios are `spec/acceptance/07-pricing-ledger-audit.md`** (114, AC-07-01…114; a draft for the user; 83 passing at the domain after task 1.6.3, ADR-355; 35 after 1.6.2). They decide nothing: the rules that may run, each criterion and operator, actions and their order, the quantity by unit, the rate and amount, the pricing flags, what a transaction holds, regeneration and the audit trail, the mission's ledger. **P1's Monday and Tuesday priced before any review is $5,059.00 on 18 lines** (worked from the mission's lines; task 1.7.2's story). Ten restate guards Phase 0 built. White goods follow `spec/RULES.md` §9's rules 5…7. **Eighteen points nothing settles** are in its last table (BACKLOG C72); four could change money and go to the user if no record settles them: how an amount is rounded to the cent; a crew day's decimals and hours in no step; what a criterion does when what it reads is empty; which lines stay under a "not billed" flag. [353]
- **Pay items** (ADR-206 to ADR-233 said "Services", the legacy word; ADR-234): a pay item
  has a **code**, a string the firm types; setup **suggests one from the published convention**
  (`VEG-HAUL-CY-15`, `TIP-FEE-CY-BCL`, `spec/CONVENTIONS.md` §5), never forces it (ADR-235); **a code is
  unique on its project** (the user, 2026-10-02: "The "code" is the number+chars you assign it. This
  must be unique per project."), enforced by the database, archived pay items included. A rate that
  changes from a date is the firm's own setup: a second pay item with a code of its own, whatever
  the firm calls it (the examples use `VEG-HAUL-CY-15-B`), plus *Ticket date* criteria; nothing
  forces a pattern. They appear as options wherever a pay item is picked. *Agent defaults:* an
  archived pay item keeps its code; codes are compared exactly as typed. [109, 206, 235, 301]
- **A pay item's fields** (ADR-207, amended by 301; named per `spec/CONVENTIONS.md` §2): **code**,
  **description** (what the work is, in the firm's own words: "The code should be unique, but the
  decription should be whatever the firm wants to make it"; required, *agent default*; nothing reads
  it; **there is no separate name, and no "line number"**: that phrase was an agent's), **payable type**,
  unit of measure, **size band** (from, to; band and
  flag, ADR-210, ADR-213), "Count is always 1",
  "GPS required", "Measurement required", "Decimals allowed", **"Monitor may mark ineligible"** (ADR-210),
  and **its rates, one per prime** (ADR-206). The **payable type** comes from a firm list (the
  legacy "Service Classifications", kept with its project; seeded from USACE's umbrella debris types,
  ADR-234), is what the monitor's list shows, each
  once, and is the "payable type" of ADR-173 (exported as a type column: leaners and hangers in the
  unit rate export); exports also carry the pay item's description and code. **Every
  pay item, on every form (loads, haul-outs, fees), has a payable type** (ADR-221); on a hauling
  form it stands for a debris type (Q-204 lines 1–4). The legacy **Tickets** screen links each
  pay item to its ticket type. Photos required,
  GPS required and the quantity method (ADR-157, 165, 192) **stay pay item settings**, loads included;
  **whether a load is weighed is set by the pay item's Unit of Measure**, a picked list; there is **no
  "requires weight" box** (ADR-221, ADR-223). **Setup pushes the unit rate pay items and their
  settings to the phones that do that work** (ADR-176, ADR-213); a load's phones get no pay items
  (ADR-223; they get the lookup of ADR-227); reconciliation checks every pay item's settings. **A load carries no
  pay item**: its *Debris type* is the one the monitor picked, and *Pay item* no longer applies to
  loads and haul-outs (the legacy load operands). [157, 158, 165, 173, 175, 176, 181, 206, 207, 210, 213, 221]
- **Rules have no *Load call* criterion and no *Flag* action** (project settings do that). On a
  haul-out, *Disposal site* is the FDS; a criterion for **the TDSR it left** is added. A **naming
  pass** over criteria, codes and export columns comes before the build. [164]
- **A rule's *Debris type* matches only the exact entry the monitor picked, no exceptions** ("Veg"
  is not "Marine based – Veg/Woody"). [226]
- **Setup made easier, model unchanged (ADR-229):** the back office's pay item screen has a "Pays
  when" part; saving it **writes and keeps its own rule**, one per contract whose prime has a rate (ADR-239), marked "from
  pay item HNG-RMV-EA" and edited only there; free-standing rules stay for everything else (delete, void,
  date ranges). A **setup check** lists gaps before the field day, and every change shows **what it
  would change** first. The agent's "pay items" (pay item and rule as one record) is withdrawn. [229]
- **The back office's rule builder:** ticket type → name → **contract** (once, ADR-239) → criteria ("ifs", operand · operator ·
  value from a list, all must hold; each criterion names the field event it reads, agent default) → **actions**: *Add transaction #n* (order #, pay item;
  the rule's contract), *Remove transaction #n*, *Void ticket*; Active; Check; Show matches; Reprocess. **Each criterion's value is either picked from a list or typed**; `spec/RULES.md`
  §4 is the one place that says which [135]. Actions apply creates → deletes → voids. **Two creates of the same # on one
  ticket → flagged** (replaces the fee-kind check). **Collection address** = the ticket's address.
  Pay items are entered one by one, each with its rates per prime (ADR-206). **A pay item is the
  payable-work thing itself; there is no separate "work item".** Build spec: **`spec/RULES.md`**.
  *Agent default:* a rule's *Debris type* reads **the collection event's** (each property's own on a
  split; a haul-out's collection); a mismatch is flagged anyway [244]. **Operators** (ADR-125): lists EQUALS · NOT EQUALS · IS ONE OF · IS NOT ONE OF; numbers add BETWEEN
  (both ends included) · AT LEAST · AT MOST · MORE THAN · LESS THAN; dates ON · NOT ON · BETWEEN ·
  ON OR BEFORE · ON OR AFTER; text CONTAINS · STARTS WITH; any IS EMPTY · IS NOT EMPTY. The builder
  **warns** on overlapping ranges for the same #, and **refuses an exact duplicate of a rule before it
  is saved** (same form, contract, criteria and actions in any order; the name and Active ignored;
  compared with every rule not archived; the error names the rule it copies; the user, 2026-10-02;
  the details an agent default; ADR-301). A rule's name is the firm's free text, usually matched to
  its pay item. **Mileage is compared in tenths, half up.** A unit
  rate ticket's *Pay Item* is the one the monitor picked (ADR-124). Itemised tickets add an
  **Item** criterion and **Quantity from** (all items or chosen items) on Add transaction (ADR-128).
  **The # is a slot and the creation order**: #1 first, then #2…; the same ticket and rules always
  give the same transactions (never flip-flop). The engine finds **all** passing rules, creates in #
  order, then deletes, then voids; **criteria read only the ticket**, never another transaction.
  [109, 118, 122, 123, 124, 125, 128, 130, 131]
- The firm types in the **paper contract's line items** as pay items with a rate per prime,
  writes **rules** (criteria + actions, ADR-109), each naming its contract (ADR-239). **There are
  no fee kinds**: the # slot keeps a load's lines apart, the site's link to its tipping fee pay item
  tells a fee line (ADR-220, 222), and the payable type groups lines in exports (ADR-246). A real rate sheet walked line by line: **`spec/RATE-SHEET.md`** (approved, ADR-269; mileage bands,
  site fees, in/out of county and size classes all come from rules; its codes-per-prime and
  moved onto the example world, ADR-247) [196…204]. **A contract usually
  prices a line per CY and per ton**, so the prime can work with various landfills: the firm enters
  the codes it needs and its setup picks; Open ADMS never chooses. Read a rate sheet as the choices
  it allows. [202] **Each Add transaction action writes one transaction.** Two creates of the same #
  (ADR-118), or no rule creating anything, are flagged. Splits are priced per property. ~~Itemised tickets priced per line~~: withdrawn by ADR-124,
  one unit rate ticket has one code; its quantity is ADR-126. [089, 124, 126]
- The **prime's rate** applies: **one pay item holds a rate for each prime**, never a copy per prime
  (the rate of the named contract's prime, ADR-212). The transaction records
  **prime + operating sub**. [081, 206, 212]
- **Quantity** (unit keys per `spec/CONVENTIONS.md` §4): CY = capacity × load call; TN = apportioned net; EA = count; LB = pounds; crew
  time uses the **highest item's hours** through the code's conversion (per hour, ÷ day length, or steps); TBN bills nothing until a
  rate is agreed. More than 12 crew hours a day is flagged. [035, 054, 068, 084, 087, 126]
- **Transactions are the current truth:** when a ticket changes, its transactions are
  **regenerated**, and each removed row is **first copied in full to `AuditRecord`**. No reversals.
  A rate or rule change regenerates every **un-invoiced** ticket it affects. [085, 090]
- **`AuditRecord` is append-only, absolutely.** It is the only history. [007, 085]
- **Scale receipts:** only at an FDS, only when the contract asks. Hand-transcribed, consumed
  once. A receipt with two debris types is flagged and its weight unused. [034, 035, 036, 037, 038,
  069] **When a load is billed by weight the tower monitor enters the scale weight instead of a load
  call**; it is set on the pay item the rules pay, by its Unit of Measure, never on the site; **one
  quantity is asked, never both** (ADR-175, ADR-221, ADR-223; how a site's phones learn which: ADR-227);
  there is **no weight-vs-load-call check**. **One weight shared by a tandem** is split **by certified capacity**
  (derived, stored apart, summing exactly) and **both tickets are flagged**; weighing each container
  separately avoids it. [165, 175] **The record is built (ADR-326; see "Field events"):** its
  own table, the number never unique (ADR-328, 331), weights as written, pointed at by disposals.

### Agent tooling and terms
- Front door `spec/INDEX.md`; rules in skills; product questions in `spec/QUESTIONS.md`; the
  hooks enforce the no-git rule and the write boundaries. [042, 043, 044, 049, 059]
- **This page** is the present tense; keep it current with every ADR/KD change. `AGENTS.md` stays
  about 150 lines of one-line rules. [092]
- **No state-changing git** by agents. [008] **The guard hook is tested** (`tools/security/test/
  guard-hook.test.ts`, 57 tests) and covers the rebuilt layout: no git writes; `development/` and
  `database/` read-only; a migration written only into its empty stub; **an env file never read,
  written or printed**; generated paths (`dist/`, the Prisma client, `.generated/`, `.cache/`,
  `.state/`), the lockfile, the historical root `docker-compose.yml` and `README.md` never
  hand-written; it fails closed without `jq`. Hook, test and `AGENTS.md` change together. [283]
- **`agent_store/ROADMAP.md` is the user's one-page roadmap** (markdown tables: start, now, the
  finish line, every phase's status and requirement count, the test layers, what waits on the user).
  It summarises and decides nothing; `NEXT.md`, `BACKLOG.md` and the requirements files win. Update
  it at close-out when a task, milestone or phase closes, a REQ is ticked, or what waits on the user
  changes. No date estimates the user didn't give. [280]
- **Every skill is current** (ADR-232, 242, 244, 245, 248…253; `adms-verify` ADR-259): each is written in
  the present tense, in field events and today's words, user words verbatim, history at the end,
  and carries `<!-- skill-status: current -->`; the session hook lists them. **Trust a current
  skill's body**; this page breaks ties. `adms-verify` holds the rebuild's check chain, the historical
  one under its History (ADR-259). The Build 1 copy (`old_openadms(do not copy)/`) was removed by the user;
  never port from it if it reappears. **The trust order holds for every answer, explanation or demo,
  not only code.** To explain or demo the domain, use **`spec/golden/MISSION.md`** (approved, ADR-297). **The
  spec pages** (`spec/parts/01…09`, `RULES.md`, `RATE-SHEET.md`, `INDEX.md`, `LISTS.md`) and the
  REQs are in today's rules too (ADR-246, 247). [102, 133, 138, 232, 233, 247]
- **Debris type** is the word (ADR-234); "debris class" (the legacy's word, ADR-233) is the same one
  picked value. [074, 214, 233, 234]
  `adms-field-app` is loadable (its §4A.0 is Phase 0 scope). [138]
- **Names and examples: `spec/CONVENTIONS.md`** (the naming pass, BACKLOG 0.2b.1, done as an agent
  default at the user's word). **Names:** the industry's keyword where there is one, else plain
  English; never a legacy product's screen label. Service → service code → **pay item** (`PayItem`,
  ADR-237, the user's pick), a load's halves → **field events** (ADR-236), `service_code` → its
  **code**, Classification → **payable type** (seeded from USACE's umbrella debris types), debris
  class → **debris type**, Location Type → **site type**, the site boxes → **Takes loads · Haul-outs
  leave here · Charges a tipping fee · Ineligible site**, Special Class → **field tag**, rule actions →
  ***Add transaction #n* · *Remove transaction #n* · *Void ticket***, billing units `CY` `TN` `EA` `LB`
  `HR` `CREW_DAY` `TBN`; code, identifier, API and time conventions in its §3. **Examples:** every
  shared doc, test, seed and demo uses its **example world** (the golden mission) and its **service
  code convention** (`TYPE-WORK-UNIT[-DETAIL]`, a default the firm may ignore, ADR-235); the
  **retired examples** (`1A`, `54A`, `90A`, Bobs, TFR, Ceres, Charlotte County Landfill, Hwy 20 TDSR,
  `M003490`, `610810`…) stay only in `QUESTIONS.md`, `DECISIONS.md` and `FROM-BUILD-1.md` as history,
  and each skill or spec page drops them when it's rewritten. `development/Open_ADMS_Initial_Conventions.md`
  is read-only background; its errors are listed in CONVENTIONS §8 (KD-63). [234, 235]
- **`NEXT.md`'s Handoff** is where a new agent learns where the product ends up and the road there
  (state, road to done, open areas, how the user works); round history lives in `DECISIONS.md`'s
  session log. [225]
- **`spec/DATA-MODEL.md` and `spec/FLAGS.md` are approved by the user (2026-10-01, ADR-289, 290).** The first is the
  schema on paper (every record and field, who writes it, what the database refuses, thirteen
  exports' columns), with sixteen agent defaults in its §12: one table per list; no ticket table; a
  completed load tied to its disposal event with a row per collection and `dissolvedAt` instead of a
  delete; the zone on the field event and mileage on the completed record's collection row; a
  person's void as `TicketVoid`; QC status only in `QcMark`; an unlock that keeps the lock's row; a
  flag's facts as JSON written by the worker alone; subs as contractors placed on a project; the
  form's own debris type entry on a field event; typed rule criteria; no driver copy on events; an
  ROE number series; the permissions list; a site's short code; the export column names. The second
  is the catalogue of **67 flags** (67 as approved; `HELPER_NOT_FOUND` retired, ADR-294; `PILE_CALL_NOT_HIGHER` added, ADR-295) (code, trigger, message, whether it still bills, the facts it
  keeps), one message shape ("Ticket 101008: … Flagged for review."), accepting never changes what
  bills. **Approved with FLAGS §5 (ADR-290):** when a load's two cert numbers differ, the certification
  on the field event that took the quantity bills it (the disposal; a haul-out's collection), flagged
  either way; no "over the legal limit" weight test until a limit is given; a message's dates and
  times are `03-Feb-2027` and 24-hour `21:40`, project time. **Approved with DATA-MODEL (ADR-289):**
  the driver is on the certification only and a ticket shows it from there, no copy stored on the
  field event. Field names and flag codes come from these two pages; what a record *means* stays
  with the skills. **Changed on DATA-MODEL at the user's word (ADR-292):** a pay item names no form (a
  rule does, so a site's tipping fee can be added by a Load rule and a Haul-out rule; "Pays when"
  says which forms); the numbering model is `ProjectNumberSeries` (`NumberSeries` is the enum); a
  field event and a survey keep `roeNumber` as picked or typed beside `roeId`; a unit rate event
  keeps its `kindOfWorkId`; a quarantined record owns its photos and its field event keeps the
  phone-made id; a transaction's contract is required. **An ROE's scope (ADR-293)** is rows picked
  from the project's own setup (`RoeScopeItem`: the load form's debris types, the unit rate payable
  types, an optional count); a ticket whose debris type or payable type isn't among them is
  flagged `ROE_OUT_OF_SCOPE`; no rows, no scope check. **Also settled (ADR-294):** a flag carries `billing` (`BILLS` ·
  `LINE_NOT_BILLED` · `NOT_BILLED`) and the line it is about; an ROE is setup, like a certification
  (set up, then filled in by a monitor or the back office); a survey's number is typed as written,
  usually the property's legal identifier, never issued; a scale receipt names the disposal monitor
  who entered it. **KD-65 is closed (ADR-295):** a completed haul-out has a completed
  load's shape (a row per collection event) and carries the tandem's `weightIsShare` mark. [140, 284,
  285, 289, 290, 292, 293, 294, 295]
- **Phase 1 is the active phase, opened by the user on 2026-10-01** ("phase 1 is open, begin working
  on the next task"). **Its exit:** the golden mission running as a story with the approved statuses,
  queue, ledger and audit rows; every Phase 1 acceptance scenario passing at the engine (N of M); all
  98 REQs ticked from runs that were seen; the rebuild-lesson KDs closed; every new table guarded and
  tested; the chain green; no rule outside `packages/domain`. Phase 2 opens only on the user's word
  after that. [299] **Its plan** (`BACKLOG.md`, "Active — Phase 1"): ten milestones (1.0 open · 1.1
  setup records · 1.2 certifications and capacity · 1.3 tickets and numbers · 1.4 sync intake with
  quarantine · 1.5 reconciliation · 1.6 the rule engine · 1.7 the ledger and audit · 1.8 review, QC,
  the lock and batches · 1.9 the golden mission), 47 tasks, **one per response**; every one of the
  98 REQs is named by a task. **Each milestone opens with its part's acceptance scenarios**
  (`spec/acceptance/`, one file per part page; `README.md` says how one is written): `AC-<part>-<number>`,
  given/when/then in the example world, the decision it restates, where Phase 1 proves it (database,
  domain, story) and the task; **a test's name starts with the scenario ID it proves**; a scenario
  never states a rule nothing records. **Where Phase 1's code lives** (each first task confirms it in
  its ADR): rules in `packages/domain`; the run in `apps/worker`; what a phone or a person writes as
  service classes in `apps/api` with no HTTP until Phase 2. Not Phase 1's: endpoints, sign-in, the
  sync records Phase 2 settles, the time clock's tables, exports, screens. `BACKLOG.md`'s historical
  list is numbered H1.x. *Agent default.* [300]
- **Status marks** (✅ / ⚠️ / ❓) are changed only by the user, or recorded from their words. [133, 139]
- **TDSR** = Temporary Debris *Staging* and Reduction Site; DMS means the same thing. [091]

---

## 2. Superseded — never cite these for a current rule

| Old | Replaced by | What changed |
|---|---|---|
| 270 (7), the API stating a viewer's projects and contractor (`adms.viewer_project_ids`, `adms.viewer_contractor_id`) | 315 | The API states only who is looking (`adms.viewer_id`); the database reads their projects, kind and contractor from their record |
| 305 (5), "no contact details on a contractor" | 306 | A contractor holds a contact name, email and phone |
| 001 | 074 | Debris types are extendable, not a closed 12-value enum |
| 007 (Transaction part) | 085 | Transactions regenerate; only `AuditRecord` is append-only |
| 010 | 019 | Pairing is by ticket number, not composite attributes |
| 011, 012 | 060 | No `FAILED`; four statuses |
| 014 | 042 | Agent files restructured |
| 016 (part) | 045 | Cert number may be pre-printed; unique per project |
| 020, 025 (part) | 039, 051 | Every captured field is correctable |
| 021 (part) | 046, 062 | No `LDT-`/`HOT-`; bare per-project numbers |
| 029, 030 (b) | 053 | No grace period |
| 031 (part) | 071 | No ticket list on disposal devices |
| 048 (part) | 060, 079 | Review still bills; licence/tag expiry |
| 050 (part) | 088 | One active project per device |
| 057 (part) | 061, 088 | No invoice record; package assembled by hand |
| 058 | 077 | No USACE mode |
| 060 (2)–(3) | 085 | No reversal rows |
| 064, 066 (part) | 084, 087 | Crew time itemised; conversion configured |
| 073 (part) | 080 | Attestation simplified; no copies; paper barcode unused |
| 075 (part) | 081 | Tiers live on the contract |
| 077 (GPS) | 083 | No GPS accuracy check |
| 004 (part) | 099 | Railway/Netlify is the shipped demo deploy, not *the* production target |
| 005 (part) | 094 | Geodesic math lives in one TypeScript module, not `gps.py` |
| 047, 050, 088 (wording) | 095 | "Provisioned" is now "set up" |
| 075 (depth), 081 (tiers on the contract) | 108 | Two sub tiers at most; subs recorded at certification; several primes |
| 080 (QC part) | 107 | QC is the general QC status |
| 089 (part) | 109 | Pricing written as rule actions; "the ticket's contract" allowed |
| 095 (part) | 105, 106 | Login list for the project; monitors created on a phone; one master passcode per firm |
| 060, 069 ("only a person voids") | 118 | A rule's Void ticket action may void too |
| 089 (fee-kind conflict) | 118 | The transaction # is the conflict key |
| 089, 109 (fee kinds on pay items, a firm list of them) | 246 | No fee kinds: the # slot, the site's tipping fee link and the payable type do their jobs |
| 047 ("never choose a service code") | 124 | Unit rate: the monitor picks the code that names the work, never a rate |
| 084 (agent reading: each item line priced by its own rule/code), 089 ("itemised priced line by line") | 124 | One unit rate ticket, one service code; its quantity per ADR-126 |
| 130 (agent reading: ticket B = `WG-RMV-EA × 1`) | 131 | White goods pay per item removed; B = `WG-RMV-EA × 4` |
| 128, 130 (ticket A = `WG-RMV-EA × 3`) | 132 | Ticket A = `WG-RMV-EA × 6`: every white good removed counts |
| 107 (lock only "flagged") | 117, 121 | Only QC Approved tickets can be locked |
| 105 (who signs in) | 120 | Master passcode first; username = Monitor ID |
| `adms-domain` §1.3 (0 refused) | 116 | A 0 load call is accepted and flagged |
| ARCHITECTURE §7.2/§7.4 ("refused at its next sync") | 134 | An out-of-service phone is received; its later work flagged |
| 005 / invariant 16 (`MAX_ROUTE_DRIFT_M`, route drift) | 136 | No collection route check; the project boundary replaces it |
| Monitor-recorded zone; "zones differ" (skills, part 04) | 135 | Zone attached by reconciliation from the project map |
| 129 ("split only where ROEs are required") | 137 | "Allow split loads" per project, defaulting from the program type |
| 079 (driver-licence expiry flags) | 153 | Licence flags nothing; tag expiry still flags |
| 107 ("everything a monitor makes starts QC Review") | 168 | Loads and haul-outs: only the completed load is QC'd and locked |
| 110 ("shortest legal truck route") | 163 | Public roads, no truck size; snap to nearest road; flagged straight-line fallback |
| 064 (active window by each ticket's end, for a load) | 161 | A completed load's time is its collection's end |
| `adms-scale-receipts` "cross-check it unlocks" | 165 | No weight-vs-load-call check |
| Glossary "service code binds a debris type" | 173 | Rules bind debris type; the code picks what the payable is |
| Old 4-photo limit | 157 | At most 8 per ticket; "required" on the service code |
| 109, 118, 146 ("Ticket Contract" = the ticket's own contract) | 174 | Always a named contract; one set of rules per prime |
| 035 (apportion by load-called volume) | 175 | Split by certified capacity, flagged |
| 047 ("monitors never choose a service code") for what the phone knows | 176 | Codes and settings pushed to every phone; load pick: ADR-182 |
| 158 ("circumference") | 177 | Circumference or diameter, chosen; rules test diameter |
| 047 ("monitors never choose a service code"), 129 (load start lists = debris types) | 182 | Every ticket starts from a picked service code; never a rate |
| 173 (3) ("the code does not bind a debris type"), for load codes | 182 | A load code a monitor starts from carries its debris type |
| 180 (citizen drop-off is a priced ticket type) | 184 | A drop-off is a reference log; billed only through the later haul-out |
| 187 (agent reading: the later load of stumps bills as ordinary hauling at a load call) | 189 | A load of stumps bills the sum of its stumps' CY; no load call; the stump, not the root ball, is measured |
| Site types with `HHW`; ADR-188's "takes citizen drop-off" as a lone setting | 190 | Types TDSR/DMS · Final Disposal · Transfer Station · Other; haul-out, drop-off, HHW are site options |
| 182 (start list = all the phone's shown codes for the ticket type, by code and name) | 191 | Only the badge's prime's shown codes, by the firm's name shown to monitors |
| 165 (quantity is a load call or a scale weight) | 192 | Also "from the stumps", for a load of stumps |
| Part 04 (the tower monitor records the disposal site) | 193, 195 | Every phone working at a site (tower included) is set up for one site; no start list shows sites |
| 187 (extraction "per CY from the formula"), 189 ("never the root ball"), 192 (5) (backfill from the same stump CY) | 196 | Extraction by size class in the example; the root ball is measured, for the fill |
| 196 ("maybe the hole's depth"; the stump ticket's kind and fill formula open) | 198 | Unit rate, kind of work Stumps; no hole depth; fill = root ball × 31 in; no root-ball criteria |
| 190 ("no staging site", as a type or an option), 193 (site options are labels that change nothing) | 201 | Staging is a built-in site option (not a type); built-in options tell the engine how to handle tickets at the site |
| 193 ("haul-out" flags nothing; no option flags anything) | 205 | A ticket at a site without the matching option is flagged; only a preload isn't flagged by default |
| 054 (a separate service code per contractor), 174 (codes and rules copied per prime with an acronym) | 206 | One service code holds a rate for each prime; rules still test *Contractor* |
| 182, 185, 191 (every ticket starts from a picked code; shown codes of the badge's prime; a load code carries its debris type) | 207 | The monitor picks by name, never a code: a load's debris type on Complete, a unit rate service code after the crew photo |
| 191 (number, badge, then code, all at the start) | 209 | Badge at New; details and the number at Complete, re-entered by hand |
| 110, 163 (mileage to the disposal's end GPS) | 208 | Mileage ends at the disposal site's own GPS |
| 107 ("monitors document only work they believe eligible"), for a service code with the eligibility flag | 210 | Ineligible work can be recorded, marked and flagged |
| 109 ("document format" = the ticket type; "field tag not needed") | 211 | A Document Format is a Form; field tag comes back |
| 201 (staging as a site option), 205 (options Disposal · Haul-out · Staging · Citizen drop-off · HHW), 188/190 (drop-off and HHW as site options) | 215 | A site is a site type plus Haul-outs leave here · Takes loads · Charges a tipping fee · Ineligible; "no load call" is the service code's quantity from the tickets it carries |
| 210 (min/max are checks, not price classes) | 213 | Min/max set a service code's band within its payable type; the phone works out the service code |
| 175 ("requires weight" box; service codes set up on the tower phone), 221 (agent's Q-211: fees make a phone ask; both quantities asked) | 223 | One quantity, from the paying service code's Unit of Measure; no service codes ticked on a phone; after-sync flag when a quantity is missing |
| Agent's Q-210 proposal (the site picks its tipping fee service code) | 222 | The firm writes the tipping fee service code from the site; a load no fee rule matches is flagged as a missing rule |
| 061 ("no invoice record" in full) | 228 | Locked tickets may be grouped in a named invoice batch (no amounts) |
| "Unknown behaviour → append ❓ and ask" (`AGENTS.md`) | 230 | Question shot-clock: ask only for money / evidence / monitor-work blockers; otherwise an agent default ADR |
| 206, 207, 211, 214–216, 233 (the **names** "Service", `service_code`, "Classification", "debris class", "Location Type", Allow Collection / Allow Disposal / Disposal Fee / Ineligible, "Special Class"; "debris class is the word in use") | 234 | Names only, the rules stand: service code, code, payable type, debris type, site type, Takes loads · Haul-outs leave here · Charges a tipping fee · Ineligible site, field tag (`spec/CONVENTIONS.md` §2) |
| 109, 147 ("no convention is offered" for codes), `FROM-BUILD-1.md` §6's "superseded" note | 235 | A published service code convention is offered and used in every example; the firm may still type any code |
| 234 (the word *service code*) | 237 | Now **pay item**; rules unchanged |
| 174, 206 (a pricing rule tests *Contractor*; the contract named on each action), 212 (2) (a truck priced on another prime's contract) | 239 | The contract is named once on the rule, which runs only on its prime's tickets |
| 095 (setup at the phone picks project, work, site and monitor, every day), "devices are handed in at the end of the day" to sync | 240 | Enrol once; the day's assignment from the dispatch board; setup on the phone is the unassigned fallback; sync whenever there's a connection |
| 072 ("reopened until it syncs") | 240 | Reopened until the monitor ends the shift (agent default) |
| 063 (time clock for monitors only; details open) | 241 | Anyone with an assignment; manual with nudges; manager approval; export for payroll and client billing |
| 281 (8) (an assignment's unit rate pay items left for Phase 1) | 286 | Built: a provisional `PayItem` and `AssignmentPayItem` |
| 263 (2) (four services in the local stack) | 282 | Six: the routing and address servers joined |
| 266 (3), (5) (the master passcode's hash in `packages/db/.env`; a lost database put back with nothing asked) | 281 | The hash is kept only in the database; a resume after a lost database asks for the passcode again |
| 153 (the driver "carried onto" a ticket read as a stored copy) | 289 | No copy is stored on a field event; a ticket shows and exports its certification's driver |
| 181 (6) (an ROE's scope choices and counts are the firm's own ROE form fields) | 293 | Scope is picked from the project's own setup: the load form's debris types and the unit rate payable types; a count is recorded, never checked |
| 296 (a) (the golden mission's split haul-out paid by the CY: six lines, $850.85; P1 $5,919.10 on 22 lines) | 297 | Paid by the scale's weight: three lines, $480.00; P1 $5,548.25 on 19 lines; the mission approved |
| 080 (helpers' IDs typed, flagged when they match no user) | 294 | A helper is picked from the people assigned to the project, or left blank; no flag |
| 147 ("two service codes may share a name"; codes and names not unique), 207 (a pay item's separate name), 235 ("the description carries the contract's words and line number") | 301 | A pay item's code is unique on its project; its texts are its code and its description, the firm's own words. ADR-147's "nothing forces a pattern" and the same-slot flag stand |
| 125 (the builder only ever warns) for an exact copy | 301 | An exact duplicate of a rule is refused before it is saved; overlapping ranges still only warn |

---

## 3. Open gaps — code that doesn't match the rules yet (build work)

> **2026-09-25:** the code these KDs point at is **historical** (ADR-093). They are now the list of
> behaviours and lessons the **rebuild** must get right, closed when the rebuilt layer is verified.
> New: **KD-55** (engine writes weren't atomic; one bad group blocked a project), **KD-56** (no
> device-made IDs, so retries would quarantine as duplicates), **KD-57** (docs still describe the
> historical code as where things live).

Full text: `DEVIATIONS.md`.

| Area | KDs | The gist |
|---|---|---|
| **Ledger and pricing** | **01**, 26, 36, 38, 49, 52, 54 | No transaction is ever written; rules can't select prices; no prime + sub; no regenerate path |
| **Reconciliation engine** | 02, 04, 05, 06, **12**, **13**, 15, 19, 35, 42, 43, 53 | Pairs on a composite key, not the number; numbers are prefixed and globally unique; some outcomes are unaudited or mislabelled; old statuses; three rule types never run; cert checked against "now"; can't reprocess a completed ticket |
| **Setup and org** | 14, 16, 17, 18, 39, 41, 47, 48 | No enabled ticket types, declaration event, program-type list, reference-data updates, active window, ticket-number source, debris-type list or contract tiers |
| **Certification** | 10, 11, 45, 46, 50 | No per-project uniqueness or issuer; thin model; wrong capacity math; no revoke, replace or QC |
| **Unit rate** | 27, 28, 44, 30 | No itemised counts or sub-types; unit-count flag ignored; no decimals; HHW disposition trail (low priority, design not yet discussed) |
| **Splits and scale receipts** | 22, 23, 24, 29 | No estimate or ROE on collections; no scale receipts; no `LB` unit |
| **Permissions and records** | 25, 37, 40 | No edit permissions; no creating-device field; no invoice lock |
| **Docs and tooling** | 34, 63, 65, 66, **71** | **71 (open, for the user, ADR-339):** the flag catalogue raises `OVERLAPPING_LOADS` on both tickets of a phantom pair, `adms-exceptions` Scenario B shows the real one `COMPLETED`; and the catalogue's count says 67 where it lists 66.  69 closed 2026-10-03 by the user (ADR-318): the golden mission's P2 ticket 102001 scanning cert `730416` stands, a cert number being unique per project only. README test count (34); 66 closed 2026-10-02 (ADR-308): task 1.1.5's six open points settled as agent defaults, as recommended; 65 closed 2026-10-01: `spec/DATA-MODEL.md`'s thirteen points settled at the user's word (ADR-292…295). 59 closed 2026-10-01: the user retired the root `docker-compose.yml` and its volume, `pnpm security` 7 passed, 0 failed (ADR-291); **63**: the `development/` conventions draft is read-only background, its errors listed in CONVENTIONS §8. 33, 58, 61 and 62 closed by the rewrites and the truth-up (ADR-247…253); 57 closed by the `adms-verify` rewrite (ADR-259) |

**Known later concerns from the Phase 0 build** (not KDs: nothing disagrees with a rule yet) are the
**carry-forward register** in `BACKLOG.md` (C1…C56, by the task that picks each up; ADR-274; C1–C3
done by ADR-275; C4–C9 by ADR-276; C42's pay items by ADR-286; C51, the split haul-out's requirements and mission ticket, filed by ADR-295 and done by ADR-296, 297; C48–C50 filed by ADR-282: the demo's map servers, the rest of Q-166, what the worker asks the map servers; C12–C15 and C37 by ADR-281, which filed C42–C47: the assignment's pay items and forms, numbering, back-office-created events, the actor for a master-passcode act, a phone's other times, a device key's revocation). Among them: `installer:teardown` doesn't drop a leftover story database (C28); no statement timeout or TLS yet (C10: a
per-login timeout with Phase 2, TLS with the demo deploy); nothing states the viewer yet (C22). Read a task's items before starting it.

**Phase 0 exit** was met (`NEXT.md`). **Phase 1 exit** (the rebuild; `NEXT.md`, ADR-299) needs, at
minimum, the behaviour of **01, 04, 05, 10, 12, 13, 15, 55, 56** right and verified. `BACKLOG.md`'s
Phase 1 milestones name the KDs each closes (ADR-300).

**Closed:** 03, 07, 08, 09, 20, 21, 31, 32, 33, 51, 57, 58, 60, 61, 62, 64, 65, 66, 68, 69, 70
(70, 2026-10-03, ADR-321: Prisma wrote `map_version.loaded_at`'s default again into every later
migration; the default is now `transaction_timestamp()`). **Milestone 1.2 built the behaviour
of KD-11, 45, 46 and 48, and KD-10's uniqueness** (its issuer: 1.3.2), each under a test named by
its scenario.

---

## 4. Waiting on the user

**Nothing blocks the next task (1.6.4, the setup check, and what each site's phones ask for); `spec/acceptance/07-pricing-ledger-audit.md` waits for the user's approval; its four money points are settled (points 1 and 2 by the user, ADR-355; 3 by the user, ADR-354; 4 from `spec/FLAGS.md` §1, ADR-355).** **Yours from task 1.6.3 (ADR-355):** *KD-72:* should a ticket waiting only on a negotiated (TBN) rate sit in the review queue until its flag is accepted (the flag catalogue, built), or be complete and only listed (Q-22)? *`pnpm security` fails on a new advisory* (GHSA-68fv-2mgg-jv7q, high, `source-map-js@1.2.1`, reached only through the test runner); nothing was changed for it: pinning a fixed version or accepting it by id is yours to say (BACKLOG C73). *Agent defaults you may overturn:* (a) a ticket under a "not billed" flag gets no lines at all, and no pricing flag joins the one it has; (b) when two rules add the same #, the ticket's other lines still bill; (c) a tipping fee a rule added and another rule removed isn't flagged as a missing rule, and a ticket whose only line a rule removed has no lines and no flag; (d) a pay item with no rate for any prime is a $0 pay item and isn't flagged, while one with another prime's rate and none for this prime is; (e) a TBN pay item writes no line (the flag keeps its # and pay item); (f) a load paid from the tickets it carries, carrying none, is flagged and that line bills nothing; (g) a rule's void voids a whole split ticket; (h) *Quantity from* chosen items on crew time bills the highest of the chosen items' hours; (i) a split is flagged "no pricing rule" for the one property the rules missed, and its other property bills; (j) the wording of the quantity flag beyond its own message ("…but the haul-out has no scale weight", "…but 13.25 h falls in no step"). **Agent defaults of task 1.6.2 the user may overturn (ADR-354):** a rule's text line ignores capitals and the spaces at either end; a *Contractor* line that picks a sub finds no ticket (it reads the prime); *Zone* reads the name on the map version the ticket was placed with; *Unit count* on any itemised ticket but crew time is the total of its items; a ticket whose cert number is on no certification is run on only by rules that name no contract. **Agent defaults of task 1.5.9 the user may overturn (ADR-352):** a run works every ticket of its project, with no queue record until Phase 2; an errored ticket keeps its status and its earlier conclusions and gains only the flag; the worker always writes as the system actor, the person who asked named on the run; a flag on a renumbered field event is cleared under the old number and raised anew under the new one (so an acceptance wouldn't follow it, for 1.8.x); a haul-out bills from the certification scanned at the loading end; a tower that took no quantity leaves a completed record marked `LOAD_CALL` with no figure; the word for what a tower counted is the carried tickets' kind of work. **Not proven yet, though named for 1.5.9:** AC-06-05, 36, 139, 140. **Agent defaults of task 1.5.8a the user may overturn (ADR-351):** where each example place stands on the Delaware extract (`spec/CONVENTIONS.md` §6), P1's boundary and zones moved there, and ticket 101002 collected at a property the mission gives no address, 11.4419 road miles from the Landfill. **Task 1.5.8's four points are answered (ADR-350).** *Read back, say if wrong:* "mileage on the final transactions" was taken as shown beside every exported line, read from the line's collection row, with no second stored copy. *Not a ban:* the routing server has no switch that forbids a private road; the worker sets its private-road penalties to the most it takes, so one is entered only to reach an end that lies on it, and where a private road is the only way between two public ends a route is still found. **Yours from task 1.5.7 (ADR-347; its two flags are answered, ADR-348):** *Agent defaults you may overturn:* (a) a ticket's ROE flag puts it in review; (b) the crew-hours flag sits on the ticket that takes an item over 12 h and each later one that day, not on every ticket of the day; (c) the crew's day is the project's calendar day (ADR-068's "01:00–24:00" read as that); (d) the 12 is the policy value `CREW_DAY_HOURS`; (e) a stump's 24 in is a fixed figure, FEMA's, not a setting; (f) one carried ticket on two loads flags both; (g) a scale receipt with no weight at all isn't flagged "no usable net weight" unless a per-ton line needs it; (h) *Count is always 1* with a count of 2 raises no flag. **Yours from task 1.5.6 (ADR-346), each an agent default you may overturn:** (a) a haul-out dumped at a site not marked *Takes loads*, or at an *Ineligible site*, isn't flagged, since the catalogue words both for "a load"; (b) a disposal with no GPS fix passes the site-area check unseen unless a pay item asks for GPS; (c) `OUTSIDE_SITE_AREA` reads "dumped outside …'s area" on a haul-out's collection (the loading end), and `OUTSIDE_PROJECT_BOUNDARY` reads "collected outside the project boundary" on a unit rate ticket; (d) `packages/domain` now has one outside dependency, `geographiclib-geodesic`, reading ARCHITECTURE §18's "`domain` depends on nothing" as "on no other workspace"; also a map with no zones never raises "not inside any zone", and a site is open on its close date itself. **Answered 2026-10-05 (ADR-345):** the six flags' words, the three backup catches, and a removed photograph never counting. **Yours from ADR-345, each an agent default you may overturn:** the words of the three backup catches; a load's disposal is flagged for a missing detail only when it took no quantity at all; a project numbered from control tickets with no range entered for a series flags nothing for that series. **To say if you want it:** *photos required* on a pay item is yes or no today (at least one); a required number would be a new setting. **Offered, not done:** a second try in `pnpm local:up`'s HTTPS check. **Yours from task 1.5.5 (ADR-344), each an agent default you may overturn:** a field event's work time is its end; a tag counts as expired from the day after its expiry date; work on an old certification is flagged from the moment its replacement was certified, not from the next day; a load whose two ends scanned different trucks, where only the collection's number is unknown, is flagged for the difference alone and bills from the tower's truck; voiding a phantom clears the overlap flag on the ticket the truck dumped under; a split's missing letter is flagged only once its disposal is in; the wording "a collection with no suffix beside -A"; (a removed photograph not counting is now your rule, ADR-345); the device-clock threshold gets its number with Phase 2's sync. **Yours from task 1.5.4 (ADR-343), each an agent default you may overturn:** when rounded shares don't add up to the whole, the largest share takes the difference (the last of them where several are as large); where a tower gave two quantities, the pay item that pays the line says which one bills, and a pay item marked *quantity from the tickets it carries* bills the carried tickets whatever load call stands beside them; a scale weight is used only when its net is above nought; a split whose shares can't be worked out keeps the load's own figures and gives no property or pile a share. **Yours from task 1.5.3 (ADR-341), each an agent default you may overturn:** a field event whose ticket number isn't digits is in no ticket until a person renumbers it, a unit rate one included (its flag's words, and whether anything of it bills meanwhile, are put to you by task 1.5.5); if two field events of one kind ever reach one ticket despite quarantine, the worker treats the ticket as errored rather than picking one; a split's suffixes run A…Z, then AA. **Yours from task 1.5.2 (ADR-340), each an agent default you may overturn:** a client user and an auditor see their project's completed loads and haul-outs and its flags, and no viewer sees the worker's runs; a collection row carries its own id and its project (two columns the data model page didn't list); a mileage's source is recorded only where there is a mileage. **Yours from task 1.5.1 (ADR-339):** `spec/acceptance/06-reconciliation.md` is a draft until you approve it (162 scenarios); KD-71 (1) is answered (ADR-342); its (2), the catalogue's count line saying 67 where 66 are listed, is still open; the flags ADR-329 asked for have no words yet and will be put to you by tasks 1.5.5 and 1.5.7; the eighteen points at the end of the file are each a later task's default. **Yours to approve or overturn from task 1.4.2 (ADR-338):** an ROE made on a phone whose number the project already has is quarantined like a duplicate field event (never lost, never saved under a taken number); of two records with one number the first to reach the server holds it, even on a voided ticket; a quarantined record's words ("Ticket 101020: this ticket already has a disposal. Not saved: kept in quarantine for review."); a client user and an auditor see that a record waits, and what the phone sent only if they may see private citizens; an impossible GPS fix is kept as sent on the field event (`unreadableGps`) and a form's in its audit reason; a retry that differs from the saved record changes nothing. **Yours to approve or overturn from C67 (e) (ADR-337):** a removed photograph can be put back; removing takes no reason; a client user and an auditor still see a removed photograph's record, with its mark (hiding it on a screen or in an export is Phase 4's); nothing stops a later phone screen from captioning a photograph; scenarios AC-04-102 and 103, added after your approval of the file. **Yours to approve or overturn from C67 (d) (ADR-336):** which columns name a private citizen (an ROE's owner; a drop-off log's resident and origin address; not an ROE's address, free text, the firm's own fields or a signed form's photograph); scenarios AC-02-75…77, added after your approval of the file. **Yours to approve or overturn from C67 (c) (ADR-334):** the setting lives on the project's incident form; a new incident form starts offering the contractor and a cert number, and an ROE number where the program type requires ROEs; scenarios AC-01-83 and AC-04-99…101, added after your approval of the files (ADR-335).
- **Decided by the user 2026-10-04 (ADR-328), not built yet (BACKLOG C67) but for the first; the
  lines above and below that say otherwise are superseded:** **a certification is never copied**
  (configuration is: pay items, rules; **built, ADR-330**); **a scale receipt's number is never unique** (a receipt book restarts
  at 001; only a duplicate *record* matters; **built, ADR-331**); **an incident may name a contractor, a cert number
  and an ROE number**, each optional, offered as the project's setup says; **a viewer sees
  private citizens by name unless the firm said otherwise for that viewer**, set when it adds
  them (**built, ADR-336**). Confirmed as built: loose ROE scope and incident sub-type; no database limit of 8
  photographs; `MeasuredAs`; 0 CY; `formDefinitionId` optional.
- **The user's second round, 2026-10-04 (ADR-329), not built yet (C67):** **the phone prevents a
  broken record; one that reaches the server anyway is kept and flagged** (a missing kind of
  work, debris type or load call; a typed number with no reason; a load on a crew's badge; a
  net that isn't gross less tare; a ticket number that isn't digits; an end before a start).
  **An impossible GPS fix is dropped at intake with a flag and the record kept** (1.4.2). **A
  disposal with two quantities is flagged.** **A truck on a second project is certified there
  from scratch.** **The back office can archive and label a photograph.** A load of white goods
  never has a load call (`adms-ticket-workflows` §4.2b, unchanged). Nothing waits on the user.
- **From task 1.3.6 (ADR-327), yours to overturn:** ~~an incident names no certification~~
  (overturned, ADR-328 (3); built, ADR-334); **an ROE carries no setup
  version**, and the database lets the back office and a phone edit one freely, audited;
  **a record on a form with no fields of the firm's own has no definition** and empty answers;
  **a photograph field's answer is that photograph's id**; an incident's sub-type isn't held to
  its type, nor an ROE's payable type to the project's unit rate pay items, by the database;
  ~~a client user and an auditor see an ROE's owner and a drop-off log's resident by name~~ (the firm's choice per viewer, ADR-328 (4); built, ADR-336).
- **From task 1.3.5 (ADR-326), yours to overturn:** **a scale receipt's weights are kept as
  written and none is required or worked out** (a net that isn't its gross less its tare, or is
  nought or below, is received and left for a flag; only a gross or tare below nought is
  refused); **a load call or a count beside a scale receipt is received**; **the database holds
  no limit of 8 photographs a ticket** (the phone's rule); **a certification copied to another
  project holds no photographs of its own and shows its original's**; a photograph's
  fingerprints and its file's place can never be changed, by anyone; a certification's
  photograph may have no view (a crew's); **a client user and an auditor see a photograph's
  record but not where its file is kept**.
- **From task 1.3.4 (ADR-325), yours to overturn:** **no detail of a field event is required**
  (a unit rate ticket with no kind of work or count, a load with no debris type, a pile with no
  load call are all received and left for a flag); **a disposal that arrives with both a load
  call and a count is received**, and which one bills is read from the pay item; **a split
  suffix is capital letters only (`A`… `Z`, then `AA`)** and only on a collection or a haul-out
  collection; a split collection without its estimate, or an estimate without a suffix, is
  refused; a measurement must say whether it is a circumference or a diameter; a debris type,
  a field tag and a pay item of another project are refused; a carried ticket is kept as the
  number written, with no link to the ticket; an item appears once on a ticket.
- **From task 1.3.3 (ADR-324), yours to overturn:** **a typed ticket number with no reason picked
  is still received** (a reason on a scanned number is refused); **a typed capacity is taken only
  on a truck keyed in by hand, and a truck or crew keyed in by hand may have none**; **half a GPS
  fix, or one off the earth, is refused, and no fix at all is taken**; an address always says
  whether it was looked up or typed; the database takes a load on a crew's certification and
  unit rate work on a container's; it doesn't check that a ticket number is digits or that times
  are in order; a client user and an auditor see every column of a field event and its monitor's
  name and Monitor ID; AC-04-19's reason is "Device failed", as the list ships.
- **From task 1.3.2 (ADR-323), yours to overturn:** **a phone-made ROE's number is written `R-0007`** (ticket and cert numbers stay bare); **a phone holds 100 ROE numbers**; **two control ranges of one series on a project can't share a number**; a project has a cert-number series only once the firm seeds it.
- **From task 1.2.3 (ADR-321), yours to overturn:** **a sub typed at certification whose name
  already has another place on the project** (another prime's sub, or the other tier) is saved as
  a separate contractor of that name under the prime picked, with a warning, never refused and
  never moved; **a new sub is a hauler** where a container was certified and **a crew** where a
  crew was; **a merge** moves the certifications to the kept contractor and is refused where the
  two are placed differently on one project; **"replaced on" is the day the new certification was
  made**, and a certification is replaced once; **a 0 CY container is saved**; measurements that
  give no capacity are refused when certifying; **nothing checks that the certifying monitor's
  assignment includes certifying**, or that a helper was assigned that day; a vehicle type isn't
  required, and isn't held to container or crew; a certification's changes are read with
  **billing**'s; a contractor user sees no certification yet.
- **From task 1.2.2 (ADR-320), yours to overturn:** in the capacity math, **a measurement of zero
  or left blank gives no capacity** and names the box (it is never read as nought), and so do boxes
  that subtract as much as the primary holds; **every operation is "a step"** for the hundredths
  rounding (it only matters in a round bottom, a radius corner and the ÷ 46,656); a container
  under half a cubic yard works out to 0 CY; and the made-up measured boxes of `730415`, `730416`
  and `730419` (`spec/CONVENTIONS.md` §6).
- **From task 1.2.1 (ADR-317), yours to overturn:** `spec/acceptance/03-certification.md` is a
  draft until you approve it; what it added to the example world (Sam Grant certifying on Saturday
  10 October 2026 with Lee Morgan as helper; a tier 2 sub, Tidewater Hauling; a pre-printed number
  `88120`); and its fourteen unsettled points, each to be a default of the task named there.
- **From task 1.1.11 (ADR-316), yours to overturn:** what the story added to the example world
  (`spec/CONVENTIONS.md` §6): **P2's setup beyond the mission's words** (loads only; a load, an ROE
  and a survey form, the ROE form with GPS required; one rule; no map), **the fill and freon pay
  items have no kind of work** (no monitor picks them), each pay item's capture settings, Cypress
  Creek Landfill's GPS and permit. And **AC-01-80 names three things setup refuses; setup refuses
  five** (also a change in the rule builder to a rule a pay item wrote, ADR-313, and a map file
  it can't read): the scenario's wording is yours to extend.
What was answered or done moved word for word to `DECISIONS.md`'s scratchpad, "Moved from
SUMMARY.md, 2026-10-02" (ADR-307). Yours whenever you like; none of it blocks building (ADR-230):

- **Phase 1's plan is yours to overturn (ADR-300):** the acceptance scenarios are written **part by
  part, each before its milestone's code**, not all nine before any code (say so and all nine are
  written first); one task per response; the setup points nothing settles, listed at the end of
  `spec/acceptance/01-setup.md`, are decided as agent defaults by the tasks named there.
  `spec/acceptance/` is a draft for you to approve (`01-setup.md` you marked partially approved;
  `02-people-and-devices.md`, 74 scenarios, is new, ADR-314: its last table lists ten points
  nothing settles; **six were decided as agent defaults by task 1.1.10 (ADR-315), yours to
  overturn: a contractor user sees none of a project's setup** (only its name and dates; say so
  and it sees its pay items, rates or sites), **no viewer sees a client's or a contractor's contact
  details or a client's notes, a permission or a viewer's project is taken away by archiving, the
  database refuses a contractor user with no contractor, grants are audited in the security
  domain, and the table is `user_viewer_project`**).
- **Approval:** the ADR-240 notes in ARCHITECTURE §7–§10 (the approved sections now say "enrol once,
  assignment daily").
- **The REQ moves (ADR-287):** REQ-003, 015, 017 now sit in Phase 1 and REQ-004, 006, 016 in Phase
  2, because only that phase's work can finish them.
- **The map region (ADR-282):** the local stack's built-in extract is Delaware (small, dated, in the
  mission's time zone), standing in for the made-up Bayline County. Say if another region should
  stand in; Florida's needs more disk than Docker has here (8 GB).
- **Your own master passcode:** the local installation was re-made on 2026-10-01 with a throw-away
  random one nobody knows. To set yours: `pnpm installer:teardown`, then `pnpm installer`.
- **Git:** a `main` branch and a remote, when you want them (the history is two local branches,
  `phase0-foundation` and `phase1-data-coreh`). **A README** (it's missing; KD-34).
- **Names:** `spec/CONVENTIONS.md`'s names are agent defaults (ADR-234); overturn any.
- **Agent defaults the user may overturn any time** (formerly readings to confirm): ADR-214, a
  *Reduced* criterion and a setup warning for an unreduced class on the haul-out form; ADR-215,
  drop-off logs not checked against site facts; ADR-205 (2), setup lists every active site for any
  work; ADR-208, a corrected site GPS recomputes mileage; ADR-209, the re-entered number must match;
  ADR-227, the optional receipt number at Final Disposal towers; ADR-228, crews as certifications;
  ADR-229, the pay item screen writing its rules; ADR-236, field events are event-driven, not
  event-sourced (corrections in place), forms aren't a ticket's events, and the `FieldEvent` model
  shape; ADR-239, a remove/void-only rule may leave its contract blank, and each criterion names the
  field event it reads; **ADR-240, a finished field event is reopenable until the monitor ends the
  shift** (the one that touches the monitor's work and the evidence); ADR-241, no hourly rates or pay
  in Open ADMS, and viewers don't see hours; ADR-243, the site's lookup also answers "count the carried
  tickets", and the worker (not the tower phone) compares the count with the collection's list; ADR-244, a rule's *Debris type* reads the collection's, and a `PENDING` ticket shows its one event's flags; ADR-309, a crew day's length starts at 12 h as a policy value and a band holds both its ends in tenths of an inch (an overlap of bands is refused by the database too since ADR-310, at your word); **ADR-311, task 1.1.7's agent defaults** (the database refusing *Haul-outs leave here* off a TDSR/DMS site through the type's key repeated on the site; a bounding box as four columns; a zone's name once per version, and a zone written only with its version; Phase 1 taking shapes as GeoJSON only); ADR-310, `btree_gist` in its own schema, and Prisma's `externalTables` flag switched on so its shadow database can be prepared; ADR-245, people's marks on derived records (QC status, the invoice lock, a flag's acceptance) are their own records keyed to the record they mark; ADR-278, the details of how firm-added fields are stored (one JSONB answers column per record, a versioned form definition); **ADR-308, task 1.1.5's agent defaults** (a form definition per project form; the database refuses a definition on a load, haul-out, unit rate or certification form, and a debris type on any form but a load or haul-out one; `Form.enabled` read only on the forms that aren't a workflow's; an assignment names only ROE, survey, incident and drop-off log forms; the unreduced warning's wording); ADR-280, the roadmap page's place and name, its finish line drawn after the deploy and before the later features, and no dates; ADR-255, the licence field `AGPL-3.0-only` rather than `-or-later`; ADR-262, `pnpm licences` still checks every installed package, not only shipped ones; ADR-263, the local stack's hostnames, Postgres on port 55432, `local:down` keeping the data and the helper's command names; ADR-268, the provisional schema's shapes (database-made UUIDv7 ids, RESTRICT foreign keys, text ticket numbers, an empty split suffix, `User.monitorNumber` for the Monitor ID, the `UserRole` keys); ADR-273, the system actor (role `SYSTEM`, its fixed id and the name "Open ADMS (system)", seeded by the installer) and the tests reaching a login through the service's own env file; ADR-275, a new database per story (not a copy of `adms`), dropped afterwards, the `pnpm scenarios` command and the story's names; ADR-282, the map servers (the images, Delaware as the built-in extract, address lookup only, the hostnames, the two settings); ADR-283, the hook's new rules (env files unreadable to agents, generated paths, failing closed without `jq`); ADR-284, `spec/DATA-MODEL.md`'s sixteen defaults; ADR-285, `spec/FLAGS.md`'s codes and wording; ADR-286, the provisional pay item and an assignment that names pay items staying on its project; ADR-287, the six moved REQs; ADR-298, *Haul-outs leave here* tickable only on a TDSR/DMS site, refused in setup elsewhere; ADR-296, 297, the golden mission's split haul-out with no flagged pile and numbered 201004, and what P1's setup gained for it (Cypress Creek Landfill, `MULCH-HO-TN` at $20.00, the haul-out rules picking by disposal site, a sixth monitor); ADR-281, the Phase 0 models' shapes (a Monitor ID issued to every person written without one, from `M000001`; the device's name and no details column; an unplanned assignment with no author; no uniqueness on person or phone and day; the provisional `DisposalSite`; the number block's series and statuses; the time zone checks; the master passcode asked again when the database is lost); ADR-276, the worker still free to state a person, every audit advisory failing the run unless accepted by id, secretlint as the scanner (with our own two checks), the three accepted Prisma-CLI advisories and seven dev-tool licences allowed by version; ADR-266, the installer's command names (`pnpm installer`…), its three questions, **a master passcode of 8 to 128 characters** (NIST's floor, no breached-list screening yet), the env file locations, the database name `adms`, and stopping rather than remaking a lost secret; ADR-247, `spec/RULES.md` §7 "Is valid" (with the setup check listing every invalid active rule) and the white goods example code `WG-HAUL-EA-60`; ADR-301, the details on your correction (an archived pay item keeps its code; codes compared exactly as typed; a description is required; what makes two rules "the same" and the error's wording; a "Pays when" rule named from its pay item); ADR-300, Phase 1's plan (its milestones and their order, the acceptance scenarios written part by part, where the code lives, the scenario format, the example world's second client); ADR-302, the firm's lists as built (one table per list; only PPDR starting with *Requires ROE*; the item names and the default reasons each list starts with; "Other (typed)" not a list value; the seed never touching a list the firm has changed except to add a missing built-in value; names not unique in a list; `packages/db` depending on `packages/domain` for its types); ADR-303, the project as built (the policy values' names and their built-in defaults in the committed `packages/domain/policy.env`, with an installation-wide override left open; no database default for any setting; a kind of unit rate work taken off a project by archiving; the window never ending before it starts, the limits 0–100 and the sizes at least 1 as database checks; REQ-105d and 105j left unticked until the worker's ROE checks and the "project not active" flag exist); ADR-305, contractors and contracts as built (the database, not only setup, refusing a contract or a sub whose prime isn't one of the project's primes, through `asPrimeId` on the prime's row; a contractor's kind with no default; a sub naming its prime at either tier; a merged contractor always archived; `contract` audited in the billing domain; no unique names or link format; REQ-106e left unticked until subs are created at certification; all seen by the user, "good to go", ADR-306); ADR-306, a contractor's contact as exactly the client's three fields, each optional, with no check of an email's or a phone number's form. Design tasks (ours): Q-166, Q-167.

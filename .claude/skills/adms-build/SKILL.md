---
name: adms-build
description: How code is built in Open ADMS, as recipes that earlier work learned the hard way. Covers adding or changing an API endpoint (contracts, controller, access and permissions, rate limits, setup and reviewer answers, phones, viewer reads), a table or column (guards, viewers, names of users, the empty create-only stub, policy values and settings), a test or a story (the API's test database, Monitor IDs, what a story may write, audit order, exports of the server apps, Prisma upgrades), and a web screen (shared components, translation, accessibility, browser tests). Use before writing code in apps/, packages/ or infra/, alongside adms-verify for how it is proven.
---
<!-- skill-status: current (ADR-599: the carry-forward register's standing rules moved here word for word, C-numbers kept; the web screen section is ADR-599 (5) and PLAN.md's "Every item") -->

> **Done right, not convenient (ADR-599 (5)).** Shared code is shared properly: a workspace
> package with its own tests and one direction of dependency (ARCHITECTURE §18), never copied
> between apps and never imported from inside another app. No shortcut that bends a design to save
> work. A rule lives once in `packages/domain`; a payload once in `packages/contracts`; only `db`
> and the two server apps touch Postgres. A reader of the code should see it was done right.
>
> These recipes are **how**, never **what**: the domain's rules are the `adms-*` skills'. A C-number
> in brackets is the register item the recipe came from; grep `agent_store/history/` for its past.
> When work teaches a new recipe, add it here under its heading, in the same work.

## A web screen (the back office, the portal, the field app)

- **Read first:** the screen's acceptance rows (each row's layer column names its app), the owning
  skill, ARCHITECTURE §6 (cookies, CSRF, CORS), §14 and §15, and the carried lines under its
  milestone in `agent_store/PLAN.md`.
- **Built from the shared components and tokens** (React Aria Components under our own set); a
  component only one app needs stays in that app; one both need goes in the shared package with its
  tests. **A screen names itself** in `src` (as the field app's do) so the checks find it.
- **Its words through the translation layer** (ADR-172), English first, US units.
- **Its browser end-to-end test** (Playwright, against the local stack over HTTPS, in the run's own
  world, `adms-verify`'s `browser-tests.md`), named by its scenario IDs; **the WCAG 2.2 AA check with
  no violation**, light and dark, at 320 CSS px and at 200% text (ADR-559).
- **It reads what the server answers, never works it out:** a capacity, a preview's counts, a
  setup check's gaps, `reason` and `message` beside a field, `queued` counts. A refusal's words come
  from the API's error, shown beside the field it names.
- **Money only from a read that takes it**; a viewer's screen only from `/viewer/…`.
- **A photograph is fetched with the session's cookies** and shown, never opened as a page.
- **A field app screen's title is `ScreenTitle`, its actions `ScreenActions`, and a button busy with
  what its press began is `busy`, never `isDisabled`** (item 3.10.2, ADR-606): the title takes the
  focus as the screen or its next question comes; the actions are held at the foot only while they
  take at most 40% of the height and scroll a keyboard-focused control clear of them; a busy button
  keeps the focus (`aria-disabled`). Not React Aria's `isPending`: its announcement names the button
  by id and outlives it, which axe-core catches. `accessible.ts` walks the keyboard round every
  screen; `checkScreen(page, { keyboard: false })` only where a key pressed would end the moment
  checked (the warning before the lock).
- **A time of day is typed in the platform's own time field** (the field app's `TimeEntry`, a
  native `type="time"` input: no date library) and read as an instant only by the domain's
  `ProjectClock.instantAt` on the project's day and time zone, never by `new Date(…)` in a screen
  (task 3.7.2, ADR-601).
- **A listener on the document for "anything done" hears events as they come down**
  (`addEventListener(…, true)`): a React Aria button stops its press's `pointerdown` rising, so a
  bubbling listener never hears a monitor working by buttons alone (the phone's lock after
  inactivity did, until item 3.10.1, ADR-603).
- **A whole mission told on the screens shares the stories' setup, never a copy**: the back
  office's part is the scenario harness's shared steps (`p1-field-setup.ts`, `p1-office.ts`,
  `p2.ts`, `golden-review.ts`) on a `StoryStage`, reached from the browser test through a process
  of its own; its outcomes are `stories/golden-outcomes.ts`'s (ADR-603; `adms-verify`'s
  `browser-tests.md`, "The golden mission's run").

## Standing rules (from the register, word for word)

**Any change to code**
- **After a change to `apps/api` or `apps/worker`, `pnpm local:up` again** before the chain: each container runs what was built when it started, and `door.test.ts` and `container.test.ts` ask them. (C85, C95)
- **A sidecar's Caddyfile** (`routing/`, `objectstore/`) is a mounted file: `local:up` doesn't remake its container when only that changed; `docker restart` it, or `local:down` first. A changed object-store policy or key is picked up by `local:down` then `up`. **On a Linux host** each key under `infra/local/.generated/tls/` must be readable by its container's user. (C136, C162, C167)
- **A new piece of work meant to run longer than `DATABASE_WORK_LONGEST_MS`** states its own limits with its ADR. (C166)
- **A server the proxy reaches ends its connections as it closes** (`apps/api`'s
  `ConnectionsAtClose`, in Fastify's `preClose`): one over HTTPS that has carried no request is
  never idle to Node, so a connection the proxy pooled unused held the close until Caddy hung up,
  two minutes (the browser tests' worlds, W0); one whose request is under way is answered with
  `Connection: close`, or ended once its answer is sent. Never `forceCloseConnections: true`,
  which cuts answers under way.
- **Counts go in `CHAIN.md` alone, written by `pnpm chain record` (ADR-594); a lesson about a layer's tests in its page beside `adms-verify`; loosenings through `loosen.mjs` in one list.** (C116)

**Every task that adds an endpoint** (the recipe; the API page beside `adms-verify` has the helpers)
- Define it with `endpoint()` in `packages/contracts/src/endpoints.ts`, in `endpoints` **in path order**, and add its line to `apps/api/test/every-endpoint.test.ts`; give every number it takes a least and a most (a whole number one a column holds), no secret in its path or query, no address the server would ask (`endpoints.test.ts`, "what every endpoint takes"). (C86, C101)
- Serve it with `@Serves(…)` on a controller named in `ApiModule` (and its service handed over in `api-process.ts`); a class that needs another names it with `@Inject(…)`; a writing controller names the database with `@Inject(apiDatabase)` and states no request id; `pnpm openapi` and commit `apps/api/openapi.json`; a new refusal adds its code to `errorCodes` and the filter's table. (C85, C86, C106)
- Its definition states `access`; a `SIGNED_IN` one names its `roles` (`adminOnly`, `backOfficeRoles`, `signedInRoles`) and, for a reviewer's or setup act, its one `permission` (`people.test.ts` holds the exact lists of what is an admin's alone and what takes a permission; `DISPATCH`'s is `phones.test.ts`'s, *correct*'s `corrections.test.ts`'s); it is closed to a person who must set up an authenticator unless marked `beforeTwoStepSetup`; its service asks again inside its own piece of work. (C90, C91, C92, C103, C105)
- It is limited by address and person with nothing to do; one that tries a secret asks `const underWay = limits.mayTry(request.ip, …)` first, tells `limits.wrongTry` of a refusal, and ends the try in a `finally` (`underWay.over()`); its service checks the guess inside `tries.inTurn(…)` (ADR-541). (C93)
- **A setup endpoint** spreads `setup`, writes through `this.setup(person, …)`, answers with `answered(request, outcome, record, done)`; its record's shape in `packages/contracts/src/setup-answers.ts`, its mapper in `apps/api/src/setup/setup-records.ts`; **the plain words for each constraint its requests can reach go in `process/database-refusal.ts`** (list a table's with `pg_constraint`); a read goes through `this.db.$read`. **A reviewer's** spreads `reviewer`, answers through `reviewed(…)`, its shape in `review-answers.ts`. A schema's refusal is asserted by its words (`notTaken`); give a refine a `path`. A service working through another's queueing says what was queued with `QueueingService.keep`. **A paged list** copies `GET /people` (`after`, `limit`, `next`, one row more read). (C98, C101, C104, C105, C107)
- **For a phone:** `access: 'PROVEN_PHONE'` (`phoneOf`) or `'MONITOR_ON_PHONE'` (`monitorOf`), joining the exact list in `phone-proofs.test.ts` or `phone-sign-ins.test.ts`; its test enrols and proves with `test/support/phones.ts` (`enrolledPhone`, `proven`). **An act under the master passcode** asks `MasterPasscodeCheck.check(passcode, now, deviceId)`, writes `used(tx, …)` in its own piece of work, counts the address under `atThePasscode`, refuses `MASTER_PASSCODE_REFUSED`, is written with `underMasterPasscode(deviceId)` and names the monitor as who it is about, never its actor. **A write a phone makes with nobody signed in** is written with `byDeviceKey(deviceId)`. **A record a phone reports** carries the phone's instant, its offset and the received time, guarded in the database to that actor and phone; **a security event a phone reports** carries its offset (`security_event_a_phone_reported`). **A new occasion of an unplanned assignment** joins `unplannedOccasions`, `securityEventsOf` and the refusals in `phone-unplanned-assignments.test.ts`. **A new list a phone is shown** joins `SetupVersions.shownIn` and `setupShownSchema` (the project's setup) or `PhoneLists.held` alone (a record). A fourth endpoint that takes a file is an ADR and the two exact lists (the third, ADR-534 (2)). (C111…C114, C119, C122, C123, C126, C140)
- **A viewer's read:** a method of `ViewerReads` inside `$viewed`, under `/viewer/…`, `viewerOnly`, in `viewer-reads.test.ts`'s exact list and its read-only-login test; **money, a private citizen, a monitor or a name of setup only from a view declared in `packages/db/prisma/schema/viewer.prisma`** (it joins `viewer.test.ts`'s lists; `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code` still says `No difference detected.`); what each viewer is answered is checked on the story `p1-viewed`. (C109)

**Every schema task**
- A table a client user or an auditor should see gets `guard_viewer(…)` in its guard migration and a row in `packages/db/test/support/viewers.ts`; one nobody sees goes in `unseenTables`; **a rerun of `guard_viewer` on `certification`, `project_contractor`, `field_event`, a completed table, `scale_receipt` or `photo` repeats its `own`** (copy the line from the seventy-fourth migration); a new table that is part of a ticket says whether a contractor user sees its own rows; **a new money column on `transaction` joins `viewer_transaction_money`, never `viewer_transaction`.** (C59, C76)
- **A table that names a user:** its guard adds `<table>_<column>_not_master_passcode_check` and `_not_device_key_check`, and the column joins `packages/db/test/support/master-passcode-actor.ts`. **A table of sign-in:** its own guards (the API alone), secret columns named on the audit trigger, a line in `unseenTables`, `keptOut` and the tests' grant list. **A tenth photograph owner** widens `photo_owner_check`, `photo_held_record_guard`'s `moved_to` and the held review's `ownerColumn`. (C88, C111, C112, C168)
- **`prisma migrate dev --create-only` must give an empty stub**; a line nobody asked for means a `dbgenerated` default read back differently; any guard that tells "the same piece of work" by a time needs the column stamped by the database, never `@default(now())`. (C60, C62; KD-68, KD-70)
- **A new policy value** joins `policy.env`, `policy.ts` (name, range, field, read), the four whole maps in `packages/domain/test/`, `project-settings.test.ts`'s names, `packages/scenarios/test/policy.test.ts`, and for the worker's own `apps/worker/test/process.test.ts`, saying which service reads it. **A new setting of the API** joins `settings.test.ts`'s `good`, `passwords.test.ts`'s settings, `madeUpSettings`, the installer's keys (first run and rerun, a line in the check: `CHAIN.md`'s `✓` count) and `infra/local/src/index.ts`'s wait. (C121, C133)

**Every test and story**
- **A test of the API that must write** uses `apps/api/test/support/database.ts` (`undone`) **on the installation's test database, `adms_test`, never `adms`** (`testSettings()`, `openTestDatabase`: the installer's logins with the database's name swapped by `packages/db`'s `test-database.ts`; `adms` is the firm's, with its own people and the sample projects), so a test starts from the seed alone and may count and list exactly; it may hand the process its database, mail and clock; **the API's test files run one at a time**; a test that archives Dana gives the firm another admin first; a refusal by one of the database's checks ends the test's piece of work, so it is that test's last request; a service asks everything before it writes (a test's piece of work has no savepoint). (C89, C92, C98, C103, C105)
- **A test asks for a Monitor ID as "M" and six digits or more,** never exactly six (every run moves `adms_test`'s series on). (C131)
- **A story** writes nothing a service does by hand: a planned assignment with `assigned`; a monitor with `story.monitor(name, onPhone)` and `taken(story, monitor, phone)`; a phone with `story.enrolled(name, at?)` (an `at` before its first work) and `story.proofs`; a phone's first block with `firstBlocks`; a person's act with `browser.answered(endpoint, …)` signed in as `story.backOffice.admin` or `.person` (a person written by hand needs their sign-in address); its phone takes its setup version from the lists it read. A story that moves its clock back before a phone's last proof is stopped at that phone's next request: tell it in time order. A person whose sessions end signs in again only after the clock moves thirty seconds. **An exact audit list that moves when acts sign in, sync or queue says why in the ADR, never loosens.** (C103, C113, C115, C119, C134, C143, C145)
- **A browser test awaits what it makes happen; it never polls for it inside expect's few
  seconds**: a cut the test's route makes is a promise the route resolves, an answer the page waits
  for is `page.waitForResponse`, and a poll is left only for what the test reads after it. The
  photo files test's cut came at the end of a whole sync, seen to take 0.3 s to 8 s under load
  (W0, "the browser runs steady").
- **The golden mission's audit rows are read through the API**, a ticket's history at a
  reviewer's browser (`stories/golden-audit.ts`'s `MissionAudit`, `readTicketHistory`), in the
  outcomes' words (`auditLines`) against their one home (`goldenOutcomes.reviewed.p1.audit`), by
  the story and the browser test alike.
- **Stories assert the audit log's order, never its times** (the database stamps its own clock). The server apps' indexes export only what `packages/scenarios` and `infra/local` read (`app-exports.test.ts`): a story that stops calling a service takes it out; kept in process on purpose: `Corrections` (AC-10-50), `first-admin`'s sign-in parts, the setup services, `Certifications`, `NumberAllocator`, `Assignments`, `Phones`. A test of the object store tidies up as the stack's administrator (`tidied`). (C29, C136, C151)
- **Every later Prisma upgrade:** `views` is a preview feature (fallback: `$queryRaw` inside `$viewed`, in `packages/db` only); run `pnpm audit` and drop each accepted advisory the upgrade fixes (C32), saying so in its ADR; look at the `pg` deprecation warnings from the adapter (`client.query()` while executing; pg 9 removes the call): **`pg` stays on 8 until a run shows none**; since ADR-554 our own code puts no two queries on one connection at once, so one still seen is Prisma's engine's (trace it with `NODE_OPTIONS=--trace-deprecation`). (C32, C98, C109)

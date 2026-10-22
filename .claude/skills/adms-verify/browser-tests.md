# The browser end-to-end tests (`pnpm e2e`; ADR-564, 565)

The field app's browser build as the local stack serves it: `https://field.adms.localhost`, over
HTTPS through Caddy, in Playwright 1.64.1's Chromium headless shell, as a phone (`devices['Pixel
7']`). **Needs `pnpm ready`.** `pnpm e2e` typechecks and builds the field app (`tsc --build && vite
build` into `apps/field/dist/web/`, which Caddy serves as it is: a build is live at once), fetches
the browser if it is missing (`playwright install --only-shell chromium`, into the person's own
cache), then runs `apps/field/e2e/*.e2e.ts`, each screen they reach checked for WCAG 2.2 A and AA. A step of `pnpm chain` after the stories; its count is
`CHAIN.md`'s. Only these: `cd apps/field && node_modules/.bin/playwright test` (`-g <words>` for
some, with `ADMS_E2E_SOME=1`). Their output and any failure's context: `.cache/adms/e2e/`.

## The accessibility check (ADR-566; AC-11-51)

**Every browser test imports `test` and `expect` from `e2e/accessible.ts`, never from
`@playwright/test`.** Its fixture checks the screen a test ends on with axe-core 4.14.0's WCAG
2.0–2.2 A and AA rules (`e2e/wcag.ts`, 70 with its experimental ones), put into the page through
DevTools so the page's policy is untouched. A test that moves through several screens calls
`checkScreen(page)` before it leaves each. **A screen is the element with `data-screen="…"`** in
`apps/field/src`, a literal, once: a new screen gets one, and the chain fails until a browser test
reaches it. A violation or an `incomplete` fails, with axe-core's own words and the element; fix
the screen, or name the one finding in `accessible.ts` with its reason, never turn a rule off.
The run's last line, `Accessibility: N of M screens checked, in K checks; F found.`, is the
reporter's (`e2e/screens.ts`), and its `✗` lines fail the run: a screen no test reached, anything
found, a screen the app lacks. **A run of some tests alone** (`-g`) sets `ADMS_E2E_SOME=1`, or it
fails for the screens it skipped. A loosening of a screen proves the check: a button with no name,
faint text, a target under 24 px and a role that isn't one are each caught (task 3.1.3).

## Both themes and 320 CSS px, on every screen (ADR-568, 583)

**`accessible.ts` checks each screen a test reaches as the phone may show it**: axe-core's rules in
the theme the page shows, then the other (`page.emulateMedia({ colorScheme })`, put back after),
each finding named `(light)` or `(dark)`; then **held 320 CSS px wide, and again with its text at
200%** (the root's font size), any sideways scroll a `reflow` finding; the viewport and the font size
put back. This took the place of the prototype's own tests (`e2e/prototype.e2e.ts`, gone with the
prototype in task 3.5.3, C177): every screen of the app is held to what the prototype's seven were.
A reflow finding is fixed in `src/look/components.css` (a grid's columns `minmax(0, 1fr)`, an item's
`min-width: 0`), never by turning the check off. React Aria writes an inline `<style>` unless
`index.html` holds `<meta id="react-aria-pressable-style">` (its rule is in
`src/look/components.css`), and its spin button and modals write HTML or styles the policy refuses:
none is used. A radio is clicked by its words (`getByText`), React Aria hiding its input; the
keypad's point is named by its unseen words (`getByRole('button', { name: 'Decimal point' })`, not
exact).

## The keyboard's walk and the hand review's instrument (item 3.10.2, ADR-606)

**`accessible.ts` also walks the keyboard round each screen** (`e2e/focus-walk.ts`), as it shows and
again at 320 CSS px with text at 200%: Tab from where the screen left the focus until it comes round,
every enabled control reached (`keyboard`), each stop ringed 2 px at 3:1 against what lies behind it
(`focus-visible`), none wholly hidden (`focus-not-obscured`, naming what covers it); then the focus is
put back (to the page's body, held a moment, where nothing had it: a Tab past the last control leaves
the document, and a test's `navigator.clipboard` then refuses). It also holds the screen **on its
side** (839 × 412). A key pressed is something done, so a screen whose moment ends at one (the
warning before the lock after inactivity) is checked with `checkScreen(page, { keyboard: false })`.
**The hand review's instrument** (`e2e/review.ts`) runs only when asked: `ADMS_E2E_REVIEW=<file>
node_modules/.bin/playwright test` appends each check's readings as a line of JSON (the focus as the
screen came, titles and headings, live regions and banners, the menu's order, buttons' words, hover
content, fields marked wrong, the text spacing raised, how much of the height the held actions
take); what was found is `spec/ACCESSIBILITY-FIELD.md`. Chrome leaves a focused control where it is
when the viewport already shows it, behind a sticky footer or not: a scroll padding is not enough
(`ScreenActions` scrolls it clear). A scroll under a tap undoes the tap, so that scroll is only for a
focus the browser shows (`:focus-visible`).

## The run's own world (ADR-572)

**A browser test that writes (a phone enrolled, a monitor created) never writes the installation's
database.** `e2e/world-setup.ts` (Playwright's global setup) has the harness make, once a run, in
a process of its own (`node packages/scenarios/src/cli.ts world <origin>`, ended by closing its
standard input; `apps/field` never depends on the harness, or "Who reaches Postgres" fails), a
database as a story's is (`BrowserWorld`: migrated, seeded, the stories' made-up master passcode), serves it by the API's own process at `https://stories.adms.localhost` (the
stories' port, so never while `pnpm scenarios` runs), and serves `dist/world` (the field app built
with `ADMS_FIELD_API_ORIGIN=https://stories.adms.localhost`, which `pnpm e2e` builds) from this
machine's loopback under the app's own policy; the world's API takes that origin alone on its CORS
list. A test reaches it by `e2e/world.ts` (`worldOrigin()`, `worldPasscode()`, `worldCast()`: handed on through
the environment, so read inside a test, never at a module's top). **The world's cast** (ADR-574):
P1 and its sites, monitors created at the API (Kim on disposals and the drop-off log at Marsh
Road TDSR, Ana on collections and incidents, Lee on two assignments, Tariq on none, for the
project's today and tomorrow), each signed in on a test's own phone with `worldCast()`'s Monitor
ID and password; a test needing other work adds it to `BrowserWorld.cast`, never by hand in the
test. **The time clock is on for P2 alone** (task 3.7.2, ADR-601), with Omar Haddad on its
collections: a test of the clock works there, never on P1, where every capture test would meet its
nudge; P1's clock stays off. **What one test writes, every other test on that project reads**: the test files run side by
side in one world, so an ROE synced on P1 would put an ROE step into every other test's collection
and unit rate ticket there. The forms' test makes its ROEs and surveys on **P2**, for a monitor it
creates and sets up under the passcode as the setup tests do (ADR-584); a test that writes a
record other phones' lists carry puts it where no other test's capture reads it. **And `P1-TWR-LF`** (ADR-580): lost, its key revoked by the worker's pass after the firm's
hours (enrolled and marked on the cast's clock set back that long: the database holds a
revocation to its own `now()`), its key handed on by `worldLostPhone()` for the bench's
`plantedPhone` to put in the browser's keyring (the private half not extractable) with its
enrolment; a page opened again then is that phone. The bench (`e2e/outbox-bench.ts`) also keeps a
record the contract can't read (`keptUnreadable`). What a page's own requests write lands after their answer: wait for it (`rawlyHeld`'s
`storeRows` polled), never read it at the answer. The page's helpers are `e2e/phone-page.ts`; the API's error lines go to the
run's standard error. The database is dropped then; a run stopped short leaves one for `pnpm
scenarios clean`. The root `pnpm e2e` generates and builds the workspaces first (the world needs the
harness's `dist`). **A loosening of the app tried on these tests rebuilds `dist/world`**:
`"run": ["sh", "-c", "cd apps/field && ADMS_FIELD_API_ORIGIN=https://stories.adms.localhost
node_modules/.bin/vite build --outDir dist/world >/dev/null 2>&1 && ADMS_E2E_SOME=1
node_modules/.bin/playwright test e2e/enrolment.e2e.ts"]`. A request with no signal
(`context.setOffline`) is still a `request` event, with no answer. **The browser build loads its
page over the network**: a page opened again (`reload`) with no signal fails, so a test reloads with
signal and cuts it again (ADR-575). A request's `status` is recorded before its body is read: poll
on its `answer` before reading it. `page.clock.setFixedTime` moves the phone's clock (the screen's
waits, the lock after inactivity) while its timers keep running.

## The golden mission's run (ADR-603)

**A run of its own, after the screens' run** (`playwright.mission.config.ts`, one worker, its
file `e2e/golden-mission.mission.ts`, its tests serial: Saturday, Monday, Tuesday, Wednesday, the
review). `pnpm e2e` runs it second, **whether or not the screens' run passed** (the field app's
`e2e` script), and fails if either did: the chain's e2e step then counts and lists both runs'
tests. The stories' address serves one world at a time, and the mission's numbers, ledger and
clock are its own. Alone: `cd apps/field &&
node_modules/.bin/playwright test --config playwright.mission.config.ts` (it needs `dist/world`
and the harness's source; nothing else may hold the stories' port). Its screens reporter runs as
`{ run: 'the golden mission' }`: each screen it reaches is checked once (`MissionPhone.look`) and
said on its own line, `Accessibility, the golden mission: …`; a screen it doesn't reach is the
screens' run's to check.

- **Its world** is `MissionWorld` (`packages/scenarios/src/mission-world.ts`), made by the test
  itself (`e2e/mission-world.ts` spawns `cli.ts mission <origin>` and asks it a JSON line at a
  time: `at`, `board`, `worker`, `review`, `read`, `audit`; the last the audit rows the mission
  names, each ticket's history read at Luis's browser, W0). It is the mission's back office and worker,
  built from the stories' own shared steps (`p1-field-setup.ts`, `p1-office.ts`, `p2.ts`,
  `golden-review.ts`) on a `StoryStage` (the runner's story context, its API's CORS list the
  page's). **The outcomes come from their one home**, `stories/golden-outcomes.ts`, handed on in
  the ready line; the story `golden-mission` checks against the same.
- **Two clocks kept together.** The world's (`at`) before a phone reaches it; each phone's
  (`MissionPhone.at`, `page.clock.setFixedTime`) before each thing its monitor does. Forward only.
  Each phone's context is on the project's time zone (`timezoneId: 'America/New_York'`), else
  every ticket is flagged for the phone's offset; a context made in a test takes the config's
  `use` (the Pixel 7) as the `page` fixture's does.
- **Load shows a race, it never makes one** (seen in 3.10.1's checks, with Spotlight indexing
  the run's output, the screens' run between 1.1 and 3.5 minutes). A test that counts what goes
  once the signal is back first waits out the try the phone's run made with none
  (`reportTriedOffline`, from `phone-page.ts`): a try still in flight then goes through as it is,
  before the test's cut. A page's stand-ins stay cheap: the barcode camera paints only while a
  stream is open, else its canvas held the page's main thread for the whole test. Reproduce one
  with `--repeat-each 6 --workers 3` on the test alone, never with a longer timeout; a test that
  writes the world once (`photo-files.e2e.ts` enrols its own phone and saves its own numbers)
  fails a repeat in the same world, so time its requests instead (`request.timing()` on
  `requestfinished`, in a throwaway copy of the test) over whole runs, under load (`--workers 8`
  beside a few `yes > /dev/null`). Seen so in W0: the cut it waited for came at the end of a whole
  sync, the server's answer to it 0.3 s quiet and 1.4 s to 8 s loaded; it is now awaited as the
  event it is (`adms-build`).
- **A world's close waits on nothing** (W0): a run that sat about two minutes after its last
  test, the screens' or the mission's, was its world's API holding one connection Caddy had pooled
  unused (seen with `lsof -nP -a -p <pid> -i TCP` every two seconds: the listener gone, one
  connection from the proxy left until Caddy's two-minute idle timeout). The API's process now
  ends such a connection as it closes (`ConnectionsAtClose`).
- **A check that something did not happen waits for the tick that would do it**: the lock checks
  once a second, so an assertion right after a clock move passes before it fires. Assert what
  shows only if the press counted (the warning a minute before the lock), never "still signed in".
- **The lock after inactivity is honoured**, from `packages/domain/policy.env` as the build reads
  it: a phone left past the lock signs its monitor out and they sign in again (offline from the
  login list, or online at the yard); past the warning, "Stay signed in". Never shortened.
- **No signal all day, deterministic syncs**: each morning the phone signs in online and goes
  offline; each evening it is signed out first (a phone signed out never syncs on finding signal),
  goes online, and its monitor signs in, which syncs; it waits for "Everything made on this phone
  is on the server" with no file left to send.
- **Every capture starts at New and is left**, then completed from home's open list (a load or a
  tower ticket), so a lock in between costs nothing; unit rate work is done in one sitting, as its
  gaps are short.

## What earlier tasks learned

- **The stack's root is trusted by checked keys, never by "take any certificate".** The config
  (`playwright.config.ts`) asks `e2e/stack.ts`'s `trustedKeys` first: Node connects to each name
  the page reaches, checks the chain against `infra/local/.generated/caddy-root.crt` and the name,
  and Chromium is told only those certificates' SPKI hashes (`--ignore-certificate-errors-spki-list`).
  `ignoreHTTPSErrors` is never used. A new name the page reaches joins the config's list. Node-side
  requests (Playwright's `page.request` doesn't hold the root) go through `servedOverHttps`.
- **A page of another origin is served from this machine's loopback** (`anotherOrigin()`: plain
  HTTP on `127.0.0.1`, a made-up port). Chromium's local network access check refuses a public page
  reaching `*.localhost` before our headers are read (`net::ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`):
  a page made up at `https://evil.example` by `page.route` "proves" CORS and framing whatever the
  stack sends (seen, task 3.1.2). The exact look-alike origins of AC-11-02 are held at the API
  (`apps/api/test/door.test.ts`, by their `Origin` header).
- **A refusal is read by its cause.** A refused frame is `requestfailed` with
  `net::ERR_BLOCKED_BY_RESPONSE` (the headless shell logs nothing to the console for it); a CORS
  refusal is a `TypeError` while the same request in `no-cors` mode reaches the API (opaque).
- **DevTools lets a test's own script past the page's policy** (`page.evaluate`: eval and
  `new Function` run). A try that must meet the policy as the page's own code would goes through a
  CDP session's `Runtime.evaluate` with `allowUnsafeEvalBlockedByCSP: false`.
- **The page's own `connect-src` names the API alone**: the page can't fetch its own files, so a
  header of the bundle is read from Node.
- **Every console error or warning is a failure** of the first test: Zod's probe for `new Function`
  was one (two "requires 'TrustedScript'" errors), answered in `packages/contracts/src/on-a-page.ts`.
- **A change to `infra/local/Caddyfile`** needs `docker restart open-adms-local-caddy-1` (a mounted
  file). A loosening of it, or of the app, runs with
  `"build": ["sh", "-c", "pnpm --filter @open-adms/field build >/dev/null 2>&1 && docker restart open-adms-local-caddy-1 >/dev/null && sleep 3"]`
  and `"run": ["sh", "-c", "cd apps/field && node_modules/.bin/playwright test"]`; `loosen.mjs`
  can't name the failed test from Playwright's output, so read each loosening's log for its `✘`.
- **A test's name starts with the scenario IDs it proves**, as Vitest's do.

**Since ADR-585 (certifying):** Jo Kim's assignment certifies too, so her phones take a cert block in
the same sync as their unit rate block; a test never assumes a phone got a series' first number by
run order (read the number the phone shows, or its sync's answer). **Wait for an answer, never only
a request**: poll a recorded request's `status` or `answer`, not the count of requests (two older
tests once read an answer still in flight). Labels that contain one another ("Tier 1 sub" inside
"Tier 2 sub, under the tier 1 sub") are found by role with `exact: true`. `pnpm field:try` starts
the same world by hand, at the same address: never beside a run.

# Open ADMS — The build (one task)

> The user, 2026-10-22: one final task wraps up the build, iOS and Android skipped; no more plans
> that grow, no gates, no ADR ceremony; the agent builds it as it knows it should be and decides
> without asking. This page is the brief and a progress note so a fresh context can pick up. **Its
> list of parts is fixed: it never grows.** Something found on the way is done in the run, or, if
> it isn't needed to ship, one line under "Not in this build".

## The task

**Finish the web platform and bring it up with one command:** the field app's browser build
finished; the back office (setting up a project, people and phones, the dispatch board and the
time clock, review and correct, money, the lock and the close, reports and exports, photo PDFs and
the receipt batch); the read-only viewer portal; all of it on the API, engine and worker that
exist; and the golden mission run through the screens to the approved numbers.

**Done when:**
1. One command brings the whole system up locally (stack, API, worker, field app, back office,
   portal), each at its own HTTPS name.
2. A browser test sets up P1 and P2 in the back office, captures the mission on the field app,
   reviews and locks it in the back office, and the ledger shows **P1 $5,548.25 on 19 lines, P2
   $324.00 on 2** (`packages/scenarios/src/stories/golden-outcomes.ts`); a viewer sees what the
   story `p1-viewed` says.
3. `pnpm chain` green on the final code, counts recorded (`pnpm chain record`).
4. Every web screen translatable, WCAG 2.2 AA automated check passing in light and dark, at 320 px
   and 200% text; a short conformance note per app (from the agent's review).
5. `SECURITY.md` (how to report a vulnerability) written.

## The parts, in order (tick as done; the list doesn't grow)

- [x] **Field app finished:** the two settled items below (past midnight; WCAG 2.1.4's setting and
      3.2.2's line).
- [x] **Back office foundation:** the shared look as a workspace package (tokens, components, the
      a11y test helpers, the translation layer) used by both apps; `apps/back-office` (React +
      Vite, the field app's versions) at `office.adms.localhost` behind Caddy with its own page
      policy; sign-in, two-step, password change and reset, own sessions, sign-out; the layout
      (sidebar closed by default, Tickets / Reports and Forms / Billings, the project picker, one
      paged table).
- [x] **Setting up a project:** clients, declaration events, projects; contractors, primes,
      contracts; forms, debris types, payable types, the firm's lists; pay items (a rate per
      prime); the rule builder; sites and their quantity lookup; the project map; certification
      intake; ROEs from paper with their scope; the setup check's page.
- [x] **People, phones, the board, the clock:** people and permissions; the firm's settings; phones
      and the master passcode; the dispatch board; the time clock's approval, unlock and hours.
- [x] **Review and correct:** the review queue by workflow and cause; a ticket's page (field events
      side by side, photos, history); corrections, renumber, void, accept; quarantine resolution;
      held records and jobs; records made in the back office.
- [x] **Money, the lock, the close:** the ledger; QC; invoice locks and batches; the audit trail
      viewer; closing and reopening a project.
- [x] **Reports and exports:** debris totals; the daily report PDF and email summary; exports (CSV,
      Excel-compatible, JSON); photo PDFs; the receipt batch.
- [x] **The viewer portal:** a viewer's projects, tickets and history, read-only, over `/viewer/…`.
- [x] **Up and proven:** the one command; the golden mission through every screen (done when 2);
      the chain green and recorded; SECURITY.md; the conformance notes.

## Where the build stands (progress note, 2026-10-22)

**Every part is done.** The one command is `pnpm start` (the installer, then `local:up`, then where
each part answers). The golden mission through every screen
(`cd apps/field && npx playwright test --config playwright.mission.config.ts`) passes whole: 7
tests in 3.3 minutes. P1 and P2 are set up on the back office's screens, captured on the field app,
reviewed, QC'd and locked on the back office, and the ledger reads P1 $5,548.25 on 19 lines and P2
$324.00 on 2. A viewer reads 101002 in the portal. 22 screens passed with 0 accessibility findings.
`pnpm chain` is green on commit 6ca71e4: 10 of 10 steps, 60 of 60 screens with 0 findings, and the
field app's `certify.e2e.ts` passed under load this time. The counts are recorded
(`pnpm chain record`, `agent_store/CHAIN.md`). `SECURITY.md` is written, and so are the conformance
notes (`spec/ACCESSIBILITY-FIELD.md`, `spec/ACCESSIBILITY-OFFICE.md`).

## How the agent works

- `AGENTS.md` (= `CLAUDE.md`) holds the rules that stay. The domain skills are the domain; the
  spec pages are names, fields, flags and lists. `adms-build` and `adms-verify` are how-to
  references; their bits about ADRs, plan ticks and gates no longer apply.
- A decision is said in the code and the commit message. One that touches money, evidence or what
  a monitor must do also gets one line under "Defaults taken" below, for the user to overturn.
- Targeted tests while building; the whole chain at the end. Never loosen a test or a threshold
  to get green.
- Commits as each part lands, one branch per phase: "Field app finished" on `phase3-field-app`;
  every part after it on `phase4-back-office`, started from it. Never on main, never pushed.

## Settled (the user, 2026-10-22: "take your recommendation on every open question")

1. **A stretch past midnight:** the record is unchanged (the clock-out stays on the assignment it
   was clocked in on); the hours read counts the part after midnight on the next day. Time says
   nothing extra.
2. **C185, an ROE's scope on the phone:** no; an ROE made on a phone carries no scope and the back
   office enters it from the paper (`correctRoeScope`).
3. **KD-80, field tags:** kept as a back-office-only label, set by correction, read by the rule
   criterion and the exports; phones never take one.
4. **Photos required:** stays yes/no (at least one); no count.
5. **The HHW trail (KD-30, REQ-518):** not in this build.
6. **`spec/RULES.md` §7 "Is valid":** approved as written.
7. **WCAG 2.1.4:** a phone setting "Take a scanner's keys anywhere on the screen", on by default.
   **WCAG 3.2.2:** the question's line says "Pick one to go on." where a pick moves straight on.
8. **Accessibility review:** the agent's review is enough; a short conformance note per app.
9. **Approvals:** `spec/acceptance/11-field-app.md`, the ARCHITECTURE §7–§10 notes, the agent
   defaults (`SUMMARY.md` §4, `history/DECISIONS-599-606.md`) all stand. No separate back office
   acceptance file is drafted for approval; its browser tests are the proof.
10. **Map region:** Delaware stands in for Bayline County.

## Defaults taken

*(one line each: what, and where it lives in the code)*

- The daily report's map is drawn as plain lines, no map tiles: the project's boundary and zones
  from its newest map, its sites, and each field event where it was recorded, so nothing leaves the
  installation (`apps/api/src/reports/daily-report.ts`).
- Debris totals count a load or a haul-out once its completed record stands, on its collection's
  day, at its properties' or piles' CY and tons (a split is one load); a unit rate ticket on its own
  day; a void ticket nowhere; hours (crew time) are never added to units; an incident is "open"
  until someone sets QC Approved or QC Void on it (`apps/api/src/reports/debris-totals.ts`).
- The address printed on the daily report's last page is a firm setting, `reportContactEmail`, set
  by whoever holds Setup; with none set, the page says to ask whoever sent the report
  (`apps/api/src/firm/firm-settings.ts`).
- A held record is saved as corrected by editing what its phone sent, as the sync's own JSON,
  checked against the sync contract before it is sent (`apps/back-office/src/review/waiting.tsx`).
- An address a reviewer types or corrects on a field event is marked typed, never looked up
  (`apps/back-office/src/review/field-event-form.tsx`).

## Not in this build

- iOS and Android (`history/PLAN-TRACK1.md`, section P), the demo deploy, Phase 5b features, the
  HHW trail, map data per region (Q-166), upgrading an installation (Q-167).

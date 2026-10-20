# Open ADMS — Next

> **The active phase: what it is, its scope and its exit, and where things stand in a few lines.**
> It changes when the phase, its scope or its exit changes, or what waits on the user does; never
> per task (ADR-594). **The next task is not written here:** it is the first unticked box of
> `BACKLOG.md`'s active phase, which the session hook prints. Keep this page under 10 KB.

## Active Phase — **Phase 3 (the field app): opened by the user 2026-10-17 (ADR-557)**

**User, 2026-10-17:** "phase 2 is complete and phase 3 is approved to start working... Mark the
fiels ready and begin opening phase 3". Task 3.0.1 opened it (ADR-557…560): the plan, the 33 REQs
moved, the phone's scenarios, and the accessibility standard asked first (WCAG 2.2 AA, ADR-559).

**What Phase 3 is.** The phone, built against the contract Phase 2 serves (enrolment and proof,
sign-in and the assignment, the lists, the login list, the passcode's check, the address lookup,
sync and photographs, turn-in, `syncClientSuite`). **It adds no rule.** One codebase, `apps/field`
(React + Vite + Capacitor): the browser build first and whole, then the iPhone, then Android
(ADR-099). Its one server half is the time clock's records (REQ-310). Its plan is `BACKLOG.md`,
one task per response (ADR-558); read its brief before any task.

**Scope boundary.**
- **In:** `apps/field`; `packages/domain` (a rule a task's ADR records, the UUIDv7 maker),
  `packages/contracts` (the time clock's kind of record, a payload a phone needs), `packages/db`
  and `apps/api` for the time clock's records and any call a phone needs that the API doesn't
  serve (the endpoint recipe), `packages/scenarios`, `infra/local` (the browser build's name and
  origins), `tools/`, `spec/acceptance/11-field-app.md`, `spec/CHECKLIST-FIELD.md`,
  `spec/THREAT-MODEL.md`.
- **Not Phase 3's:** the back office's and portal's screens, the time clock's approval screen and
  export, the receipt batch (Phase 4); the demo deploy and the app stores (Phase 5a). Say which
  phase and ask; never widen silently. **A phase's own server work never moves to a later phase
  by agent default** (ADR-519).
- `development/` stays read-only reference.

## Exit criteria for Phase 3 *(ADR-557; agent default, the user may change them)*

1. **The golden mission's field events captured through the field app's browser build** by its
   end-to-end tests, synced through the real endpoints, reconciled by queued jobs, with the
   approved statuses, review queue, ledger (P1 $5,548.25 on 19 lines; P2 $324.00) and audit rows;
   every story still passing.
2. **Every acceptance scenario with a Phase 3 part passes at its layer**, reported as N of M
   (`spec/acceptance/11-field-app.md`: 138).
3. **All 33 REQs** ticked from runs that were seen, or moved with an ADR (ADR-371).
4. **The field app's security checklist** (OWASP MASVS, `spec/CHECKLIST-FIELD.md`) answered
   control by control; the threat model's phone rows read again; `pnpm security` passing.
5. **Every screen meets WCAG 2.2 AA**: the automated check with no violation, a hand review
   recorded, and the field app's conformance report (VPAT format) written (ADR-559).
6. **The database still enforces the rules:** every new table guarded, every grant and refusal
   tested, `guard_gaps()` empty.
7. **The chain is green** with real counts, the browser end-to-end layer in it, and the browser
   build reached only over HTTPS through Caddy.
8. **Rules and shapes live once:** no rule in `apps/field`, no payload shape outside
   `packages/contracts`, the phone reaching the server only through the API.
9. **On device:** the on-device layer (airplane mode, printing, scanning, camera, encryption,
   turn-in) run on a real iPhone and a real Android phone with the user, what was seen recorded.
10. **No "no task yet" of the field app's in the register**, and three full runs in a row of the
    browser end-to-end tests and `pnpm scenarios` after a green chain.

Only then is **Phase 4 (the back office and portal)** offered to the user to open.


## Where things stand (2026-10-20, through ADR-594)

- **Phases 0–2 are done** (Phase 0 2026-10-01; Phase 1 2026-10-06; Phase 2's exit met 2026-10-17,
  ADR-555). **Phase 3 is open**: Milestones 3.0…3.5 done, 3.6 under way (photographs done,
  ADR-586; the user's notes from `pnpm field:try` built, ADR-587…593). The tasks and what each
  left: `BACKLOG.md`; the user's view: `ROADMAP.md`; the rules now: `SUMMARY.md` by topic.
- **The harness was reshaped (ADR-594):** runs of tasks (`/adms-run`), Haiku and Sonnet agents for
  the cheap work (`.claude/agents/`), the counts recorded by `pnpm chain record`, no session log,
  this page and the hook cut down.
- **This machine's installation holds no person but the seed's actors** (`pnpm local:accounts` and
  `pnpm installer:admin` are never run for real here; the API's tests rely on it). Its master
  passcode is a throw-away random value.
- **Git:** `main`, a branch per phase (`phase0-foundation`, `phase1-data-coreh`,
  `phase2-api-sync`, the current one) and the remote `openadms_dev`, all the user's (ADR-008).
- **Gone on purpose:** `database/`, the placeholder folders and the Build 1 copy (never recreate or
  port from them); `README.md` is missing (the user's, KD-34). `pdftoppm` isn't installed, so the
  legacy field-app PDFs can't be read here (they were reviewed in round 22).

## Waiting on the user

- **Nothing blocks** (ADR-230). The defaults they may overturn: `SUMMARY.md` §4. Open: KD-80
  (whether the field tag list goes too).
- **For the on-device milestones (3.8, 3.9):** a real iPhone and Android phone, a Zebra ZQ printer,
  Xcode and an Apple developer account (`ROADMAP.md` §6).
- **Later phases, not asked now:** the HHW trail (KD-30, REQ-518); the time clock's screens (rules
  settled, ADR-241); which phase the read-only portal lands in (`VISION.md` §7); each Phase 5
  candidate; `RULES.md` §7 "Is valid". Ours: design tasks Q-166 and Q-167.

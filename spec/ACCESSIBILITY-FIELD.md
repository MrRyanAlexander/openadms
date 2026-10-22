# Open ADMS — The field app's accessibility review (WCAG 2.2 AA)

✏️ **Draft**: agent-written (item 3.10.2, ADR-606); the user approves. Building doesn't wait (ADR-230).

← [Index](INDEX.md) · The rows it answers: [acceptance file 11](acceptance/11-field-app.md) §J (AC-11-51…60, 93) · The standard: the user's, WCAG 2.2 AA (ADR-559) · How the checks run: `adms-verify`'s `browser-tests.md` · The field app's security checklist: [CHECKLIST-FIELD](CHECKLIST-FIELD.md)

> **What this page is.** The review of every screen of the field app's browser build against WCAG 2.2 at levels A and AA that AC-11-59 asks for, screen by screen, and what it found and fixed. It is what the field app's Accessibility Conformance Report (VPAT format) is written from, in P, once the native screens exist (ADR-559, 600).
>
> **Who reviewed, said plainly.** This review is **an agent's** (Claude, 2026-10-22), **not a person's**. It drove the browser build in a real browser: Playwright 1.64.1's Chromium headless shell as a phone (Pixel 7: 412 × 839 CSS px, touch), against the local stack over HTTPS, through the 61 browser tests (`pnpm e2e`'s first run), which reach all 60 screens; at each screen they reach it read what an automated rule can't settle with an instrument of its own (below), and it read the source. **What only a person or a phone can judge is left, named in §6**: whether a person reviews too before the report is the user's call.
>
> **Nothing is marked met that no run showed.** Every ✓ below is the last full run's (2026-10-22: 61 passed, 60 of 60 screens checked in 265 checks, 0 found), or a reading of the source named beside it.

---

## 1. How each criterion was checked

| Mark | How | Where |
|---|---|---|
| **A** | axe-core 4.14.0's WCAG 2.0–2.2 A and AA rules (70, its experimental ones included: `target-size`, `label-content-name-mismatch`, `css-orientation-lock`…), on every screen a test reaches, **in the light theme and the dark**; a violation or an unsettled result fails the run (AC-11-51) | `apps/field/e2e/accessible.ts`, `wcag.ts`, `screens.ts` |
| **R** | Held **320 CSS px wide**, then with its **text at 200%**, then **on its side** (839 × 412): any sideways scroll fails (1.4.10, 1.4.4, 1.3.4) | `accessible.ts` |
| **K** | **The keyboard's walk**, as the screen shows and again at 320 px with text at 200%: Tab pressed from where the screen left the focus until it comes round; at every stop a ring of 2 px or more at 3:1 or better against what lies behind it (2.4.7, 1.4.11), the control not wholly hidden (2.4.11), and every enabled control reached (2.1.1); the focus put back. Fails the run (item 3.10.2) | `accessible.ts`, `focus-walk.ts` |
| **I** | **The review's instrument**, only when asked (`ADMS_E2E_REVIEW=<file>`): where the focus was as the screen came (2.4.3), the page's title and the headings (2.4.2, 2.4.6), what announces itself (4.1.3) and whether each banner is announced, the bottom menu's order (3.2.3), every button's words (3.2.4), anything shown on hover (1.4.13), a field marked wrong and its description (3.3.1), whether a focus alone changed the screen (3.2.1), the text spacing raised to 1.4.12's values at 320 px (sideways scroll, anything clipped), and how much of the height the actions held at the foot take (1.4.10) | `apps/field/e2e/review.ts`; its readings, one line of JSON a check |
| **T** | Every colour pair the tokens use, in both themes: words 4.5:1, a control's edge, a state and the focus ring 3:1 (1.4.3, 1.4.11) | `apps/field/test/look.test.ts` |
| **S** | The source read, 2026-10-22: no drag, swipe, path or multi-point gesture, no device motion, no link, no audio or video, no `title` tooltip, no `autoFocus`, no timer but the lock after inactivity and a passcode session's end | `apps/field/src/` |
| **D** | A recorded decision says how the screen behaves | the ADR named |

---

## 2. The criteria, across the app

**55 criteria** (WCAG 2.2: 31 at A, 24 at AA; 4.1.1 is gone from 2.2). Result in the conformance report's own words: **Supports**, **Partially supports**, **Does not support**, **Not applicable**. *The browser build* is what was seen here; *P* is what the phones add.

| Criterion | Level | Result | How | What was seen |
|---|---|---|---|---|
| 1.1.1 Non-text content | A | Supports | A, I, S | Every icon is hidden from a screen reader beside the word it draws (ADR-561); a photograph is named by what it shows; the camera's live view is an image named "What the camera sees"; the keypad's Delete is named |
| 1.2.1 Audio-only and video-only (prerecorded) | A | Not applicable | S | No audio or video |
| 1.2.2 Captions (prerecorded) | A | Not applicable | S | As 1.2.1 |
| 1.2.3 Audio description or media alternative | A | Not applicable | S | As 1.2.1 |
| 1.2.4 Captions (live) | AA | Not applicable | S | The camera's view is a viewfinder, not media; no sound |
| 1.2.5 Audio description (prerecorded) | AA | Not applicable | S | As 1.2.1 |
| 1.3.1 Info and relationships | A | Supports | A, I | One `main` and one `h1` on every screen, sections by `h2`, a record's facts a description list, every field's label and help tied to it, lists picked from as list boxes, the menu a `nav` |
| 1.3.2 Meaningful sequence | A | Supports | K | The order read and the order Tab takes are the order drawn: the strip, the work, the actions, the menu |
| 1.3.3 Sensory characteristics | A | Supports | S | No instruction by shape, place or colour alone ("type its digits again below" is beside a field named "Type it again") |
| 1.3.4 Orientation | AA | Supports | A, R | Nothing locks the orientation; every screen holds on its side. *P:* the phones turned |
| 1.3.5 Identify input purpose | AA | Supports | A, S | The sign-in's Monitor ID and password are `username` and `current-password` (AC-11-63); the only other personal fields are another person's (a monitor created, a resident, a driver), which the criterion doesn't cover |
| 1.4.1 Use of color | A | Supports | S, D | A state is an icon and a word, never colour alone (ADR-561, 590): a picked row's tick, the menu's current item underlined and edged, a stage's "to do" and "done" |
| 1.4.2 Audio control | A | Not applicable | S | No sound |
| 1.4.3 Contrast (minimum) | AA | Supports | A, T | Both themes. Nothing sits over a photograph |
| 1.4.4 Resize text | AA | Supports | R, K | Text at 200% at 320 px: nothing sideways, every control reached and seen. *P:* the phones' largest text (AC-11-56) |
| 1.4.5 Images of text | AA | Supports | S | No image of text; a receipt is a PDF the browser saves, not shown |
| 1.4.10 Reflow | AA | Supports | R, K, I | **Fixed here** (§3, fix 3): at 320 px with text at 200% the actions held at the foot covered up to the whole height on 29 screens, so the work under them could not be seen |
| 1.4.11 Non-text contrast | AA | Supports | T, K | Edges, the picked row, the menu's current item and the focus ring 3:1 in both themes; the ring measured at every Tab stop. A disabled or busy button is exempt, and still says so in words |
| 1.4.12 Text spacing | AA | Supports | I | At 320 px with the spacing raised, nothing scrolls sideways and nothing is clipped; a long answer in a one-line field scrolls inside it, as a field does |
| 1.4.13 Content on hover or focus | AA | Not applicable | I, S | Nothing appears on hover or focus |
| 2.1.1 Keyboard | A | Supports | K | Every enabled control on every check reached by Tab; a list's rows by the arrow keys (React Aria); the number on the keypad's own keys; a time in the platform's time field |
| 2.1.2 No keyboard trap | A | Supports | K | Tab comes round on every screen; the camera and the scanner's camera open as modal dialogs, closed by Escape or their own button |
| 2.1.4 Character key shortcuts | A | Supports | S, D | §5 (1): a scan field takes keys typed anywhere on its screen, outside another field (ADR-596), unless the phone's setting "Take a scanner's keys anywhere on the screen" (on by default) is turned off (BUILD.md, settled 7; `e2e/scanning.e2e.ts`) |
| 2.2.1 Timing adjustable | A | Supports | D, browser test | The lock after inactivity (30 minutes, the policy's) warns 60 seconds before and one tap keeps the session (AC-11-20, `e2e/offline-sign-in.e2e.ts`), nothing not yet submitted lost. A temporary passcode session ends at the project's midnight (AC-11-26): the day is its scope, a security limit the criterion's essential exception covers |
| 2.2.2 Pause, stop, hide | A | Supports | S | Nothing moves, blinks or scrolls by itself; the camera's live view is the photograph being taken (essential) |
| 2.3.1 Three flashes or below threshold | A | Supports | S | Nothing flashes |
| 2.4.1 Bypass blocks | A | Supports | A, K | The status strip holds no control; Tab reaches the work first on every screen |
| 2.4.2 Page titled | A | Supports | I, D | The browser build is one page, titled the app's name; each screen names itself by its title, which takes the focus as it comes (fix 1). *P:* the native screens |
| 2.4.3 Focus order | A | Supports | K, I, browser test | **Fixed here** (§3, fixes 1, 2). What is left is §4 |
| 2.4.4 Link purpose (in context) | A | Not applicable | S | No links |
| 2.4.5 Multiple ways | AA | Not applicable | D | One page; its screens are a step of a process or one of the menu's four places |
| 2.4.6 Headings and labels | AA | Supports | I | Each title asks its question ("Scan the truck's badge"), each label names its field |
| 2.4.7 Focus visible | AA | Supports | K | A ring at every Tab stop; a screen's title, which takes the focus but is no control, draws none |
| 2.4.11 Focus not obscured (minimum) | AA | Supports | K | **Fixed here** (§3, fixes 3, 4). *P:* the phone's own keyboard over a field (AC-11-58) |
| 2.5.1 Pointer gestures | A | Supports | S | One tap does everything (AC-11-53) |
| 2.5.2 Pointer cancellation | A | Supports | S | React Aria's press acts on release, and not if the finger slides off |
| 2.5.3 Label in name | A | Supports | A | Every control's name holds its words; the keypad's point is "." with "Decimal point" |
| 2.5.4 Motion actuation | A | Not applicable | S | Nothing answers the phone's motion |
| 2.5.7 Dragging movements | AA | Supports | S | Nothing needs a drag |
| 2.5.8 Target size (minimum) | AA | Supports | A, T | Buttons and rows 56 px tall, keys 64 px |
| 3.1.1 Language of page | A | Supports | A | The page names the build's language |
| 3.1.2 Language of parts | AA | Not applicable | S | One language a build, every word the translation file's (ADR-172) |
| 3.2.1 On focus | A | Supports | I | No focus changed a screen |
| 3.2.2 On input | A | Supports | S, D | §5 (2): where a pick moves straight on (ADR-573 (1)), the question's line says "Pick one to go on." first, and the list is described by it (BUILD.md, settled 7) |
| 3.2.3 Consistent navigation | AA | Supports | I | The menu is Work, (Time), Sync, Settings in that order wherever it is (ADR-573 (3)) |
| 3.2.4 Consistent identification | AA | Supports | I | One word for one act: Back, Next, Submit, Cancel this…, Leave it for now |
| 3.2.6 Consistent help | A | Not applicable | S | No screen offers help or a contact |
| 3.3.1 Error identification | A | Supports | I, S | Each problem said in words beside its field, in an announced banner or status line ("That doesn't match. Type the number again.", "A load call is a whole number from 0 to 100."). Nothing is flagged as an error that stops work (ADR-052) |
| 3.3.2 Labels or instructions | A | Supports | A | Every field labelled; help beneath it tied to it |
| 3.3.3 Error suggestion | AA | Supports | S | Each says what to do next |
| 3.3.4 Error prevention (legal, financial, data) | AA | Supports | D | Every record ends in a review of everything entered before Submit, with Back until then (ADR-573 (1), 477) |
| 3.3.7 Redundant entry | A | Supports | D | A number is typed again only where a person copied it (a pre-printed number typed by hand, the number the phone made written on the paper ROE or the placard): the second typing checks the copy, the criterion's essential exception (ADR-569, 573, 589). Nothing else is asked twice |
| 3.3.8 Accessible authentication (minimum) | AA | Supports | browser tests | No puzzle or memory test; a password manager fills the sign-in and every secret field takes a paste (AC-11-54: `e2e/offline-sign-in.e2e.ts`, `e2e/setup.e2e.ts`) |
| 4.1.2 Name, role, value | A | Supports | A, I | React Aria's components; the busy state said as unavailable (fix 2). *P:* heard on VoiceOver and TalkBack (AC-11-57) |
| 4.1.3 Status messages | AA | Supports | I | What waits and sends in the strip (polite), a banner that appears as the monitor works announced, the sync's, the clock's and the passcode's outcomes in status lines, the keypad's value an output. *P:* heard as they change (AC-11-57) |

**In all:** 43 supported, 12 not applicable, none partially supported or unsupported, in the browser build (2.1.4 and 3.2.2 were partly met until the user took the recommendations below, BUILD.md, settled 7).

---

## 3. Found and fixed

Each fix is in the shared components (`apps/field/src/look/`), and each has a check that fails without it (the loosenings tried, every one caught).

1. **The focus fell to the page when a screen came** (2.4.3, 4.1.2). Pressing a button that changes the screen took the button away, and the focus with it: before the fix, on 148 of 261 checks (50 of the 60 screens) the focus was on nothing as the screen was checked, and the next Tab went on from wherever the button had been (the menu, the middle of a list); a screen reader heard nothing of the new screen. **Now a screen's title takes the focus** as the screen comes and again as a record's next question comes (`ScreenTitle`, every screen's `h1`). Proved by `e2e/keyboard.e2e.ts` (AC-11-93).
2. **A busy button dropped the focus** (2.4.3). A button pressed to begin something that takes a moment (Sync now, Next past a passcode, Submit) was disabled while the phone worked, which drops the focus. **Now the buttons wait instead** (`Button`'s `busy`): no press taken, the disabled look and `aria-disabled`, the focus kept. Not React Aria's `isPending`: its announcement names the button by id and outlives it once the screen moves on (axe-core caught the dangling name). Proved by `e2e/keyboard.e2e.ts` (Sync now keeps the focus).
3. **The actions held at the foot covered the work** (1.4.10, 2.4.11). At 320 px with text at 200% they took more than 40% of the height on 29 screens and all of it on two (Settings, New certification), so the work scrolled under them unseen; on its side, more than 40% on 17. **Now they are held at the foot only while they take at most 40% of the screen's height** (`ScreenActions`), and after the work otherwise, the screen scrolling as one; upright at the phone's own text size every screen's actions are held as before. Proved by the keyboard's walk at 320 px with 200% text (`accessible.ts`).
4. **A focused field could sit behind the held actions** (2.4.11). The root's scroll padding (room for two buttons) left a field where it was whenever some of the viewport already showed it, and a box's Length or Width on `certify-box` was seen hidden behind three buttons. **Now a control the keyboard focuses behind the held actions is scrolled to stand clear above them** (`ScreenActions`; never under a tap on a button, which a scroll beneath it would undo); the scroll padding is gone. Proved by the keyboard's walk (`accessible.ts`).

---

## 4. Seen, and left as it is

- **The focus falls to the page when the control pressed goes but the screen stays** (9 of 264 readings, on 7 screens): Clock in giving way to Start a break; Sign in waiting out a back-off; Next unpressable once a refused passcode empties its field; a number typed again that doesn't match; a button of home's pressed in the lock's own test. In each the outcome is announced (a status line or banner) and Chromium's next Tab goes on from where the control was (seen on each). Left for the phones: whether VoiceOver and TalkBack keep their place there is P's to see (AC-11-57).

---

## 5. Partly supported: for the user

Neither is built, because each changes what a monitor sees or does; both are the plan's lines under P, where the conformance report is written.

1. **2.1.4, a scan field's keys taken anywhere on its screen** (`ScanField`, ADR-596). A keyboard-style Bluetooth scanner types a number and Enter; so the monitor needn't tap the field, a printable key typed anywhere on the screen outside another field goes into it. WCAG asks that a shortcut of single character keys can be turned off, remapped, or works only where the field has the focus. A phone's dictation types only into a focused field, and nothing is taken until Enter, so the risk is small; but as built the criterion is only partly met. *Recommended:* a setting on the phone, **"Take a scanner's keys anywhere on the screen"**, on by default, which makes it "Supports"; or keep it and the report says why. **Taken** (the user, 2026-10-22; BUILD.md, settled 7): built, in Settings.
2. **3.2.2, a pick that moves straight on** (ADR-573 (1): no confirmation after a value; the review checks everything once). Picking a debris type, a reason for a typed number, a survey, an incident's type or a unit rate ticket's work goes on to the next question at once, with nothing said beforehand. The next question's title now takes the focus (fix 1), so a screen reader hears the change, but WCAG asks that a change of context on input be said before it happens. *Recommended:* the question's own line beneath its title says so ("Pick one to go on."), in the translation file, on those questions only. **Taken** (the user, 2026-10-22; BUILD.md, settled 7): `ListPicker`'s `movesOn`.

---

## 6. What only a person or a phone can judge

- **VoiceOver and TalkBack** (AC-11-57): each control's name, role and state heard; "Saved", "Not saved" and "Syncing" announced as they change; the place kept when a control goes (§4). P, on the real phones.
- **The phones' own largest text, and turned on their side** (AC-11-56). P.
- **The phone's own keyboard over a field** (AC-11-58): the browser can't open it; the keypad keeps it closed for numbers, and every other field's view under it is the platform's. P.
- **A real Bluetooth scanner and Zebra printer** (2.1.4's risk in practice). P.
- **Whether the words are plain and the screens easy at a glance in sun and gloves**: no criterion of AA asks it, but a person's review would. The user's call whether one is made before the report.

---

## 7. Every screen

All 60 screens of `apps/field/src` (each names itself, `data-screen`), in the order a phone meets them. **On every check of every screen** the automated rules found nothing in either theme (A), nothing scrolled sideways at 320 px, at 200% text or on its side (R), every enabled control was reached by Tab, ringed and seen as shown and at 320 px with 200% text (K), and the text spacing raised clipped nothing (I). The columns say what else each holds and what applies to it. **Checks** is how many times the last full run checked it and which browser tests (`apps/field/e2e/*.e2e.ts`) reached it; **Tab** the most stops one round took; **Announced** whether, beside the status strip on every screen, it has a status line of its own.

| Screen | What it asks | Checks (browser tests) | What it holds | Tab (K) | Announced (4.1.3) | What else applies |
|---|---|---|---|---|---|---|
| `enrol` | Enrolment: the phone's name, the master passcode | 58 (camera-refused, certify, clock, collection, door, enrolment, forms, keyboard, offline-sign-in, photo-files, photographs, receipts, scanning, setup, sign-in, store, switching, sync, sync-client, tower, turn-in, unit-rate) | fields | ✓ 3 stops | the strip; a status line | 3.3.8: the passcode takes a paste; a refusal said in an announced banner (3.3.1) |
| `phone` | Sign-in: Monitor ID and password, online or from the login list; the supervisor's ways in | 16 (enrolment, offline-sign-in, sign-in, switching, sync, turn-in) | fields | ✓ 7 stops; 2 of 16 after a control went (see §4) | the strip; a status line | 3.3.8: a password manager fills Monitor ID and password, a paste taken (AC-11-54); wrong tries said, each wait shown (3.3.1); 2.4.3: Sign in waiting out a back-off drops the focus (§4) |
| `phone-locked` | Sign-in locked after ten wrong tries: the master passcode | 1 (switching) | fields | ✓ 1 stops | the strip; a status line | 3.3.8: the master passcode takes a paste |
| `create-monitor` | Create monitor (master passcode) | 2 (enrolment) | fields | ✓ 6 stops | the strip; a status line | 1.3.5: the fields are another person's, so none is marked for autofill (n/a) |
| `monitor-created` | Monitor created: their Monitor ID | 2 (enrolment) | buttons | ✓ 3 stops | the strip | the Monitor ID shown as text, never only read out |
| `setup-passcode` | Set up this phone: the master passcode | 4 (setup, switching) | fields | ✓ 2 stops; 2 of 4 after a control went (see §4) | the strip; a status line | 3.3.8; 2.4.3: a refused passcode empties its field and Next can't be pressed, so the focus falls to the page (§4) |
| `setup-project` | Setup: which project | 1 (setup) | list | ✓ 4 stops | the strip | 3.2.2: a pick, then Next (met) |
| `setup-work` | Setup: what work | 2 (setup) | fields, list | ✓ 5 stops | the strip | 3.2.2: picks, then Next (met) |
| `setup-site` | Setup: which site | 1 (setup) | list | ✓ 4 stops | the strip | 3.2.2: a pick, then Next (met) |
| `setup-pay-items` | Setup: which unit rate work | 1 (setup) | buttons | ✓ 3 stops | the strip | 3.2.2: picks, then Next (met) |
| `setup-monitor` | Setup: who works on this phone | 1 (setup) | list | ✓ 4 stops | the strip | 3.2.2: a pick, then Next (met) |
| `setup-hand-over` | Setup: their own assignment today? | 1 (switching) | list | ✓ 3 stops | the strip | 3.2.2: a pick, then Next (met) |
| `setup-handed` | Phone handed over | 1 (switching) | buttons | ✓ 1 stops | the strip; a status line | — |
| `setup-made` | Phone set up | 2 (setup) | buttons | ✓ 1 stops | the strip; a status line | — |
| `session-passcode` | A passcode session: the master passcode | 1 (switching) | fields | ✓ 2 stops | the strip | 3.3.8 |
| `session-monitor` | A passcode session: as whom | 1 (switching) | list | ✓ 4 stops | the strip | 3.2.2: a pick, then Next (met) |
| `home` | Today's work (Work) | 28 (clock, collection, forms, offline-sign-in, receipts, scanning, setup, sign-in, switching, sync, tower, unit-rate) | buttons; the menu | ✓ 9 stops; 1 of 28 after a control went (see §4) | the strip | 3.2.3: the menu Work, (Time), Sync, Settings in the same order on every screen that has it; the works' buttons held at the foot |
| `no-assignment` | No assignment today (Work) | 3 (sign-in, switching) | buttons; the menu | ✓ 5 stops | the strip; a status line | 3.2.3 |
| `sync` | Sync | 14 (certify, clock, collection, keyboard, photo-files, photographs, sign-in, sync) | buttons; the menu | ✓ 5 stops | the strip; a status line | 4.1.3: Syncing, Synced and what wasn't saved in a status line; Sync now keeps the focus while it syncs (AC-11-93) |
| `settings` | Settings | 5 (offline-sign-in, sign-in, switching) | buttons; the menu | ✓ 7 stops | the strip | 3.2.3; its four actions after the work at 200% text |
| `move-passcode` | Move to another site: the master passcode | 1 (switching) | fields | ✓ 2 stops | the strip | 3.3.8 |
| `move-site` | Move: which site | 1 (switching) | list | ✓ 4 stops | the strip | 3.2.2: a pick, then Next (met) |
| `move-made` | Moved | 1 (switching) | buttons | ✓ 1 stops | the strip; a status line | — |
| `turn-in` | Sync and turn in: the master passcode | 4 (turn-in) | fields | ✓ 2 stops; 1 of 4 after a control went (see §4) | the strip; a status line | 3.3.8; 2.4.3: as setup-passcode (§4) |
| `turned-in` | Turned in and erased | 2 (turn-in) | buttons | ✓ 1 stops | the strip; a status line | — |
| `time` | Time (the time clock) | 2 (clock) | buttons; the menu | ✓ 6 stops; 1 of 2 after a control went (see §4) | the strip; a status line | 2.4.3: Clock in gives way to Start a break, the focus falling to the page; Tab goes on from there (§4) |
| `clock-in-nudge` | Not clocked in: clock in now? | 1 (clock) | buttons | ✓ 2 stops | the strip | never stops work: both answers go on (ADR-601) |
| `clock-out-nudge` | Clock out? (at sign-out) | 1 (clock) | buttons | ✓ 3 stops | the strip | — |
| `clock-out` | Clock-out: the day's activity | 1 (clock) | buttons | ✓ 4 stops | the strip | 3.3.4: the day checked before it is approved |
| `activity-line` | An activity line: times, activity, note | 2 (clock) | fields, list | ✓ 6 stops | the strip; a status line | times typed in the phone's own time field (4.1.2 by the platform); a time that ends before it starts said (3.3.1, 3.3.3) |
| `new-collection` | New collection: normal or split, the badge, the number | 6 (collection, scanning) | scan, fields | ✓ 5 stops | the strip; a status line | 2.1.4: the scan field takes a scanner's keys typed anywhere on the screen, unless the phone's setting is off (met, settled 7); 3.3.7: a typed number typed again (essential, ADR-569, 573, 589); 3.2.2: the reason for a typed number picked goes straight on (met: the phone's setting, settled 7) |
| `new-disposal` | New disposal: the badge, the driver's ticket | 3 (keyboard, tower) | fields, scan | ✓ 5 stops | the strip | 2.1.4 (met: the phone's setting, settled 7); 3.3.7 as new-collection |
| `new-haul-out` | New haul-out | 1 (tower) | buttons | ✓ 3 stops | the strip | 2.1.4 (met: the phone's setting, settled 7) |
| `new-unit-rate` | New unit rate ticket: the crew's badge | 2 (unit-rate) | scan, fields | ✓ 4 stops | the strip | 2.1.4 (met: the phone's setting, settled 7) |
| `open-ticket` | An open ticket: waypoints, photographs, Complete | 6 (camera-refused, collection, photographs, tower) | camera | ✓ 6 stops | the strip; a status line | the camera opens in a modal dialog: the page behind it out of reach, Escape or Put the camera away closes it (2.1.2); its live view the photograph's own (2.2.2) |
| `complete-collection` | Complete a collection: debris type, ROE, estimate, review | 7 (camera-refused, collection) | list, fields, keypad | ✓ 15 stops | the strip | 3.2.2: a debris type picked goes straight on (met: "Pick one to go on.", settled 7); 3.3.4: the review before Submit; the keypad keeps the phone's keyboard closed (2.4.11) |
| `complete-disposal` | Complete a disposal: debris type, load call or weight, receipt, review | 8 (tower) | list, keypad, fields | ✓ 14 stops | the strip; a status line | 3.2.2 (met: "Pick one to go on.", settled 7); 3.3.1, 3.3.3: 101 said as no load call; 3.3.4: the review |
| `complete-haul-out` | Complete a haul-out: load call, review | 2 (tower) | keypad | ✓ 15 stops | the strip | 3.2.2 (met: "Pick one to go on.", settled 7); 3.3.4 |
| `complete-unit-rate` | A unit rate ticket: its stages, measurement, review | 14 (unit-rate) | list, fields, keypad | ✓ 15 stops | the strip; a status line | 3.2.2: the work picked goes straight on (met: "Pick one to go on.", settled 7); each stage's state a word and an icon, never colour alone (1.4.1); 3.3.4 |
| `photo` | A ticket's photograph, large | 2 (collection, photographs) | buttons | ✓ 3 stops | the strip | 1.1.1: the photograph named by what it shows and when |
| `submitted` | Submitted: the receipt printed | 4 (collection, receipts) | buttons | ✓ 3 stops | the strip; a status line | 4.1.3: the receipt printed, announced |
| `cancel-ticket` | Cancel this ticket? | 1 (collection) | buttons | ✓ 2 stops | the strip | — |
| `receipts` | Print a receipt again | 1 (receipts) | buttons | ✓ 2 stops | the strip | — |
| `scan-back` | Scan a barcode: what the phone holds under it | 2 (scanning) | fields, scan | ✓ 3 stops | the strip; a status line | 2.1.4 (met: the phone's setting, settled 7); what the phone holds under the number in a status line |
| `new-roe` | New ROE: its number | 2 (forms) | keypad | ✓ 16 stops; 1 of 2 after a control went (see §4) | the strip; a status line | 3.3.7: the number the phone made is written on the paper, then typed again (essential: it checks the copy) |
| `new-survey` | New survey: which survey | 1 (forms) | list | ✓ 3 stops | the strip | 3.2.2: the survey picked goes straight on (met: "Pick one to go on.", settled 7) |
| `new-incident` | New incident: its type | 2 (forms) | list | ✓ 3 stops | the strip | 3.2.2: the type picked goes straight on (met: "Pick one to go on.", settled 7) |
| `fill-roe` | An ROE: parcel, owner, signed, address, review | 4 (forms) | fields, list | ✓ 7 stops | the strip; a status line | a day typed that isn't one said (3.3.1); 3.3.4: the review |
| `fill-survey` | A survey: ROE, notes, photos, review | 6 (forms) | list, fields | ✓ 5 stops | the strip | 3.3.4 |
| `fill-incident` | An incident: sub-type, parties, contractor, cert number, review | 5 (forms) | fields, list, scan | ✓ 6 stops | the strip | 2.1.4: the cert number's scan field (met: the phone's setting, settled 7); 3.3.4 |
| `fill-drop-off-log` | A drop-off log: resident, origin, the firm's own fields, review | 4 (forms) | fields, list, camera | ✓ 9 stops | the strip; a status line | the firm's own fields by their type; a required one unanswered holds Next and says so (3.3.1, 3.3.2) |
| `form-photo` | A form's photograph, large | 1 (forms) | buttons | ✓ 3 stops | the strip | 1.1.1 |
| `form-submitted` | A form submitted | 5 (forms) | buttons | ✓ 2 stops | the strip; a status line | 4.1.3 |
| `cancel-form` | Cancel this form? | 1 (forms) | buttons | ✓ 2 stops | the strip | — |
| `new-certification` | New certification: its number | 2 (certify) | keypad, fields | ✓ 16 stops; 1 of 2 after a control went (see §4) | the strip; a status line | 3.3.7: the placard's number typed again (essential, as new-roe) |
| `certify` | Certify: kind, prime, subs, driver, tag, photos, review | 7 (certify) | list, fields | ✓ 14 stops | the strip; a status line | a capacity worked out and shown as text, never typed (AC-11-42); 3.3.4: the review |
| `certify-box` | A box measured | 1 (certify) | list, fields | ✓ 9 stops | the strip; a status line | 2.4.11: the focused measurement scrolled clear of the actions (§3, fix 4) |
| `certification-photo` | A certification's photograph, large | 1 (certify) | buttons | ✓ 1 stops | the strip | 1.1.1 |
| `certification-submitted` | Certification submitted | 1 (certify) | buttons | ✓ 3 stops | the strip; a status line | 4.1.3 |
| `cancel-certification` | Cancel this certification? | 1 (certify) | buttons | ✓ 2 stops | the strip | — |
---

## 8. How the review is run again

`ADMS_E2E_REVIEW=<a file> node_modules/.bin/playwright test` in `apps/field` (the stack up, `pnpm e2e` built once): each check appends its readings. The checks A, R and K run in every `pnpm e2e`; I only when asked. The back office's and the portal's screens are reviewed the same way when they exist (C41).

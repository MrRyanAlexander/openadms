# Open ADMS — The back office's and the viewer portal's conformance note (WCAG 2.2 AA)

✏️ **Draft**: agent-written (BUILD.md, "Up and proven"; settled 8: the agent's review is enough, a
short note per app). The field app's is [ACCESSIBILITY-FIELD](ACCESSIBILITY-FIELD.md).

← [Index](INDEX.md) · The standard: WCAG 2.2 AA (ADR-559) · How the checks run: `adms-verify`'s
`browser-tests.md` · The checks themselves: `packages/look/testing` (`accessible.ts`,
`focus-walk.ts`, `screens.ts`), shared with the field app

> **Who reviewed, said plainly.** This note is **an agent's** (Claude, 2026-10-22), **not a
> person's**, written from the browser tests' runs and a reading of the source
> (`apps/back-office/src`). Nothing below is marked met that no run showed.

## 1. What was checked, and how

`apps/back-office` is one web app with two faces: **the back office** (admins and
managers/analysts) and **the read-only viewer portal** (client users, contractor users, auditors),
chosen by who signs in. Every screen names itself (`data-screen`); a screen no browser test reaches
fails the run.

| Mark | How |
|---|---|
| **A** | axe-core 4.14.0's WCAG 2.0–2.2 A and AA rules on every screen a test reaches, **in the light theme and the dark**; a violation or an unsettled result fails the run |
| **R** | Each screen held **320 CSS px wide**, then with its **text at 200%**: any sideways scroll of the page fails (1.4.10, 1.4.4) |
| **K** | **The keyboard's walk**, as shown and again at 320 px with text at 200%: every enabled control reached by Tab (2.1.1), a visible ring of 3:1 or better at each stop (2.4.7, 1.4.11), the focused control never wholly hidden (2.4.11); fails the run |
| **S** | The source read: React Aria's components under the look's own (`@open-adms/look`), every word through the translation file (`src/words/en.json`), no `autoFocus`, no timer on a screen, no hover-only content, no drag |

**The last runs (2026-10-22):** the screens' run, 24 tests, **50 of 50 screens checked in 73
checks, 0 found**; the golden mission's run, 5 tests, 6 screens in 13 checks, 0 found.

## 2. What was found and fixed while building

1. **A focused pick in a wide table was scrolled out of view** (2.4.11): a check's visually hidden
   input sat at the top of its table's own scrolling region. A check now holds its input beside its
   box (`look/office.css`, `.check`).
2. **The email summary's text block named itself with `aria-label` on a `pre`** (4.1.2): it is a
   named, focusable region now, so its long lines scroll by keyboard too.
3. **Two buttons shared the words "QC status"** in the QC dialog: the status picked is "Set it
   to", so each control's name is its own (2.4.6, 3.3.2).

## 3. Across the app

- **Structure** (1.3.1, 2.4.6): one `main` and one `h1` per screen, sections by `h2` with their
  headings, a record's facts a description list, every list the one paged table with its caption,
  column headers and row headers; a table wider than its screen scrolls inside its own named,
  focusable region and the page never does (1.4.10).
- **Forms** (3.3.1, 3.3.2, 4.1.2): every field labelled, its help tied to it, a pick-list's values
  picked from a list box, never typed (invariant 6); what the API refused is said at the top of the
  dialog in the API's own words, and nothing is closed until the API has saved it. Sign-in fields
  carry their `autocomplete` (1.3.5).
- **Dialogs** (2.1.2, 2.4.3): React Aria's modal: the focus held inside and given back to the
  button that opened it; Escape closes it, saving nothing.
- **The menu** (2.4.1, 2.4.11, 3.2.3): closed by default, opened from the header's button, closed
  on Escape, a press outside it or a link chosen; a skip link leads past the header; the header
  stays in view only where the screen has room for it.
- **Status and change** (4.1.3): what an act saved, and what was refused, is announced; a list read
  again after an act keeps what it showed until the new answer comes.
- **Colour** (1.4.1, 1.4.3, 1.4.11): the look's tokens in both themes; a state is a word, never a
  colour alone.
- **Photographs** (1.1.1): each named by what it shows and when it was taken; shown larger on a
  press, never opened as a page.
- **Time** (2.2.1): no screen has a time limit of its own; a session that ends is refreshed once
  with the refresh token, and only an ended session returns a person to the sign-in.

## 4. Partially supported, said plainly

- **The files the server makes** (the daily report, photo PDFs, the receipt batch) are untagged
  PDFs: a screen reader reads their words in order but not their structure. Everything they hold is
  on a screen too (Reports, a ticket's page, the ledger), and the exports are plain CSV and JSON.
- **The project's map** is drawn as lines with no names on it; its zones and sites are listed in
  tables beside it.
- **A held record is saved as corrected by editing the JSON its phone sent**: labelled, checked and
  explained, but an expert's tool.

## 5. Left for a person

What no automated rule settles and this review could not judge from a headless browser: a screen
reader read through end to end (VoiceOver, NVDA), speech input, and a person at 400% zoom on a
desktop. Whether a person reviews before a conformance report is published is the user's call.

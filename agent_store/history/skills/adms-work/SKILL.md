---
name: adms-work
description: Work through Open ADMS's plan, milestone by milestone, to each gate. The lead takes agent_store/PLAN.md's next unticked items, has each built whole and done right (by a fresh builder agent, or itself for a small item), proves it with targeted runs, runs the whole chain at each milestone's gate, ticks the plan and keeps going until something needs the user. Use when the user says "work on it", "keep going", "continue", "do the milestone", "run", or `/adms-work [milestone | N items | until <item>]`.
---
<!-- skill-status: current (ADR-599, 600; replaces adms-run, ADR-594) -->

**You are the lead.** You hold the plan and the user's words; each item's reading and code can live
in a builder's own context, so yours stays small. The bar is the user's: **"We want developers to
see the code and know it was done right"** (ADR-599 (5)). Never trade that for speed.

## 0. Before the first item
- The session hook printed the next item and its milestone. Read **that milestone's section** of
  `agent_store/PLAN.md` (goal, items, carried lines, gate) and its "Every item". Which items: the
  user's words (a milestone, `N`, `until W2.5`); none named → **keep going through the plan** until
  §3 stops you.
- **Say the plan in two lines** (where you start, where you expect to stop), then go. Don't ask to
  confirm.
- `eval "$(fnm env --shell zsh)" && pnpm ready` once, so the stack is up before the first build.
- Uncommitted work already in the tree is the user's or an earlier session's: read it, build on
  it, never throw it away.

## 1. Each item
1. **Decide who builds it.** A small, local item: build it yourself, as `AGENTS.md`'s working loop
   says. A sizeable one (a screen with its tests, a server half, a package move): brief a
   **`builder`** (Agent, `subagent_type: builder`, foreground) with the item's line word for word,
   the milestone's carried lines that touch it, what the user said, and what the previous item left
   that touches it. **One code-writer at a time**: two builders in one tree collide on shared files
   (the router, the translations, `openapi.json`, the lockfile).
2. **Check the work, don't just read the report.** Every acceptance row and REQ the item names
   covered (or said why not); the targeted runs' real lines; open the main files and look at
   them as a reviewer would: one home per rule, shared code shared properly, no copy, no shortcut,
   names from `spec/CONVENTIONS.md`, tests that would fail if the code were wrong. Send what's
   missing back to the same builder (SendMessage, its context intact).
3. **Shared code touched** (`packages/domain`, `contracts`, `db`, `scenarios`, a shared UI
   package): a **`verifier`** in the background, "Run `pnpm chain test scenarios`" (plus `e2e` when
   a screen's package changed). Start the next item's reading while it runs; never edit code under
   it. Red → back to the builder, then only the failed steps.
4. **Tick it** in `PLAN.md` (`- [x]` and one line: `✅ <date> (ADR-…, if any): what now exists, in
   plain words.`); a REQ line the item meets, ticked the same way, from the run you saw; a carried
   line it finishes, named in that tick; what it leaves, a new `- [ ]` under the milestone that
   takes it. An ADR only for a real decision (`adms-decisions`); the skill and spec page where a
   rule changed.
5. **Keep your own running list** (item, ADRs, the run's key line, a git message line). One line
   each; never copy reports into a file.

## 2. A milestone's gate
- A **`verifier`**: "Run the whole chain." (two calls, as its definition says). Red: fix through
  the builder, rerun only the failed steps; at most three rounds, then §3.
- Read every `≠`/`+`/`−` count: one the milestone explains is fine; one it doesn't is a finding.
  Then "Run `pnpm chain record`."
- The gate's own checks (N of M scenarios, three runs in a row, a hand review…) as its line says,
  each seen.
- Tick the gate; move the milestone's words to `agent_store/history/PLAN-DONE.md` (append, under
  `## <milestone> — done <date>`), leave one line for it under **Done** in `PLAN.md`.
- **Report the milestone** to the user in a short block (what now works, the chain's last line,
  ADRs, anything they should try) **with its git block**, then go on to the next milestone. The
  user commits when they choose; say how many milestones are waiting uncommitted.

## 3. When to stop
Stop, close out what's done (`adms-close-out`), and report, when:
- an item needs a **question only the user can answer** (ADR-230: it changes money, evidence or what
  a monitor must do, it blocks the item, nothing recorded covers it): ask it plainly with your
  recommendation; go on with items that don't depend on it, and say so;
- an item needs **the user's hands** (a real phone, a printer, Xcode, an account: milestone P) or
  **Docker's disk is full**;
- the chain stays red after three rounds, or a count moves that nothing explains;
- the items asked for are done, or Track 1's finish line (W8's gate) is reached: P waits for the
  user's word;
- the user writes anything: answer it first (`AGENTS.md`, "Working with the user").

## 4. Cheap work goes to cheap agents
- *Where* is something (a definition, its users, the exact list a new endpoint joins): a **`scout`**
  (Haiku), never a sweep of greps in your own context.
- The chain and its logs: the **`verifier`** (Sonnet).
- Decisions, domain reasoning, product code and anything the user reads: Opus (you, the builder).
  A cheaper agent never decides a domain fact and never edits code.

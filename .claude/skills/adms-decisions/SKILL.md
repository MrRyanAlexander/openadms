---
name: adms-decisions
description: How to record an Open ADMS decision (ADR) or a known deviation (KD), when one is needed at all, and where the existing ones live. Use when making a real decision — about the product, money, evidence, what a monitor must do, security, a dependency or the architecture — when recording the user's answer or an agent default, when you find code or a doc that disagrees with a spec skill, or when you need to check what has already been decided so you do not contradict it.
---
<!-- skill-status: current (checked 2026-09-29, ADR-253; how to read and append, ADR-532; no session log, ADR-594; ADRs only for real decisions, the new file, SUMMARY frozen, ADR-599) -->

## Where the record lives

| File | Contents |
|---|---|
| `agent_store/DECISIONS.md` | **Start here.** ADR-599 on: short rows, the newest wins. Its header says when an ADR is written |
| `agent_store/SUMMARY.md` | What was true at ADR-598, by topic, with the ADRs to cite (an index in its header); §2 superseded ADRs, §4 the agent's defaults the user may overturn. **Frozen** (ADR-599): read the topic you touch; a later row in `DECISIONS.md` overrides it |
| `agent_store/history/DECISIONS-001-598.md` | ADR-001…598 in full, with the old scratchpad and session log. **2.4 MB: never read it whole.** Grep it for the ADRs a `SUMMARY.md` topic cites (`grep -n '^| \*\*ADR-519' agent_store/history/DECISIONS-001-598.md`); for a sweep, ask a `scout` |
| `agent_store/DEVIATIONS.md` | Known Deviations — every place code **or a doc** disagrees with a spec skill. KD-80 is open |

**Append, never rewrite. Never renumber existing entries.**

## When an ADR is written (ADR-599)

- A decision about **the product, money, evidence, what a monitor must do, security, a new
  dependency, or the architecture** (a new package, a layer's shape, a pattern every later piece
  follows).
- **The user's answer** to a question, quoted.
- **An agent default** the user may overturn, marked so.
- A rule a skill states changing: the ADR, and the skill updated in the same work, marked with it.

**Not** an ADR: ordinary engineering inside an approved design (a component's name, a refactor, a
test helper, which file a function lives in). Say it in the code and the commit message. A recipe
worth repeating goes in `adms-build`.

**A row is short**: the decision, why, and the rule it leaves, in a few sentences (numbered points
where it decides several things). Never a build log, a file list, a test list or a count.

**Appending:** the last row is the file's last line (`tail -3 agent_store/DECISIONS.md`); add the
next number after it with Edit. Format:

```
| **ADR-6XX** | YYYY-MM-DD | Area | Decision & rationale | Invariant it creates |
```

An ADR that replaces or amends an earlier one says so at its start ("Supersedes ADR-…" /
"Amends ADR-…"); the earlier row is never edited.

## Finding a disagreement

If you find code **or a doc** that disagrees with a spec skill, do **not** silently reconcile it in
either direction. Never change an approval or status mark (✅ / ⚠️ / ❓) yourself: record the
user's words, or ask (ADR-133). Append a row to the Known Deviations table in
`agent_store/DEVIATIONS.md` and raise it to the user in your ⚠️ Flags section.

A deviation is a defect to report, not a spec to rewrite. The spec skills carry domain truth
that came from the user; code drift does not overrule them.

## The user's answers, and how to ask (moved from `NEXT.md`'s Handoff, ADR-594)

- They answer **inline** in the docs (usually `spec/QUESTIONS.md`), sometimes inside tables, as
  corrections above earlier quotes, or numbered oddly; they write "APPROVED" under sections. Read the
  changed section in full; move each answer into a dated `> **User, …:**` quote, verbatim; record an
  ADR in the same response; update the owning skill, `spec/RULES.md` and the part pages.
- They answer wearing **different hats**: a firm setting up, a monitor in the field, the back office
  (ADR-224). Note which, and design each side for its own user.
- **A "yes" to an either-or question is read back before it is recorded** (Q-139 → ADR-147 → 301:
  a misread "Yes" stood five days). Say which half you understood, in one line, and never ask two
  things in one question. An acceptance scenario is where the user catches a misreading: write
  them plainly.
- Write questions that stand alone: plain words, **a story told as a table of what happens to each
  ticket**, then the question, refs at the end. No paraphrase ("TOO MUCH PARAPHRASING"). Give ticket
  numbers that make sense. When their numbers don't add up, show the arithmetic and ask once.
  Never guess money.

## When nothing settles it: the question shot-clock (ADR-230)

Product discovery is closed. Before asking the user anything, check `DECISIONS.md`, `SUMMARY.md`,
the current skills and `spec/QUESTIONS.md` (✅ entries answer it). **Ask only when the answer changes
money, evidence or what a monitor must do, it blocks your work, and nothing recorded covers it**: at
most three questions, each standing alone (plain words, a story, refs at the end) with your
recommendation. Otherwise pick the option that keeps the firm's choice open, **record an ADR marked
"agent default"**, and carry on; `PLAN.md`'s "Waiting on the user" points the user at every row
so marked.

## Open KDs

KDs against the historical code (`database/`) are **rebuild lessons**, closed when the rebuilt layer
is verified. A docs KD is fixed in the docs and closed. Neither blocks on the user unless the KD
itself says so.

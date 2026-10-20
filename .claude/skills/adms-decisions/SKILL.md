---
name: adms-decisions
description: How to record an Open ADMS architectural decision (ADR) or a known deviation (KD), and where the existing ones live. Use when making a senior engineering judgment call — naming, an architectural pattern, a schema tradeoff, a deliberate deviation — or when you find code that disagrees with a spec skill, or when you need to check what has already been decided so you do not contradict it.
---
<!-- skill-status: current (checked 2026-09-29, ADR-253; how to read and append, ADR-532; no session log, ADR-594) -->

## Where the record lives

| File | Contents |
|---|---|
| `agent_store/SUMMARY.md` | **Start here.** What's true now: current rules by topic with the ADRs to cite (an index in its header), superseded ADRs never to cite, open gaps, what waits on the user |
| `agent_store/DECISIONS.md` | Full ADR log + the scratchpad (history moved out of other pages) + the session log up to 2026-10-20 (retired by ADR-594: the git commit is the record of a session). **Over 2 MB: never read it whole.** Before deciding anything architectural, grep it for the ADRs your `SUMMARY.md` topic cites (`grep -n '^| \*\*ADR-519' agent_store/DECISIONS.md`) and read those rows; for a sweep, ask a `scout`. |
| `agent_store/DEVIATIONS.md` | Known Deviations — every place code **or a doc** disagrees with a spec skill. The KDs against `database/` are rebuild lessons now (ADR-093). `SUMMARY.md` §3 lists the open ones; read a KD's row when your task touches it. |

**Append, never rewrite. Never renumber existing entries.**

## Making a decision

If you make a senior engineering judgment call — table naming, an architectural pattern, a
schema tradeoff, a deliberate deviation — append an ADR to `agent_store/DECISIONS.md` **in the
same response that makes the change**. An undocumented decision will be contradicted by the
next agent.

**Then update `agent_store/SUMMARY.md` in the same response:** add or change the rule under its
topic, and if the new ADR replaces or amends an old one, mark the old one "SUPERSEDED BY" or
"AMENDED BY" at the start of its row and add it to the summary's superseded table. When you open
or close a KD, update the summary's §3 (open deviations). A stale summary is worse than none.

**Keep a row to the decision, its reasons and the invariant it creates** (a few sentences to a
short paragraph; numbered points where it decides several things). The build's detail (files,
classes, tests, counts, what was seen in a run) belongs in the code, the BACKLOG tick and
`CHAIN.md`, never restated in the row (ADR-532).

**Appending:** the ADR table ends just before `## 📝 Operational scratchpad`. Find the last row
(`grep -n '^| \*\*ADR-' agent_store/DECISIONS.md | tail -1`), read a few lines there (offset and
limit), and insert the new row after it with Edit. **No session-log line** (ADR-594): the commit
message the close-out gives the user says what a session did.

ADR row format:

```
| **ADR-0XX** | YYYY-MM-DD | Area | Decision & rationale | Invariant it creates |
```

## Finding a disagreement

If you find code **or a doc** that disagrees with a spec skill, do **not** silently reconcile it in
either direction. Never change an approval or status mark (✅ / ⚠️ / ❓) yourself: record the
user's words, or ask (ADR-133). Append a row to the Known Deviations table in `agent_store/DEVIATIONS.md` and raise
it to the user in your ⚠️ Flags section.

A deviation is a defect to report, not a spec to rewrite. The spec skills carry domain truth
that came from the user; code drift does not overrule them.

## The user's answers, and how to ask (moved from `NEXT.md`'s Handoff, ADR-594)

- They answer **inline** in the docs (usually `spec/QUESTIONS.md`), sometimes inside tables, as
  corrections above earlier quotes, or numbered oddly; they write "APPROVED" under sections. Read the
  changed section in full; move each answer into a dated `> **User, …:**` quote, verbatim; record an
  ADR in the same response; update `SUMMARY.md`, the owning skill, `spec/RULES.md` and the part pages.
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

Product discovery is closed. Before asking the user anything, check the newest ADR, `SUMMARY.md`,
the current skills and `spec/QUESTIONS.md` (✅ entries answer it). **Ask only when the answer changes
money, evidence or what a monitor must do, it blocks your task, and nothing recorded covers it**: at
most three questions, each standing alone (plain words, a story, refs at the end) with your
recommendation. Otherwise pick the option that keeps the firm's choice open, **record an ADR marked
"agent default"**, list it in `SUMMARY.md` §4 (the defaults the user may overturn), and carry on.

## Open KDs

KDs against the historical code (`database/`) are **rebuild lessons**: the rebuild closes them when
the rebuilt layer is verified (`SUMMARY.md` §3). A docs KD is fixed in the docs and closed. Neither
blocks on the user unless the KD itself says so.

---
name: adms-decisions
description: How to record an Open ADMS architectural decision (ADR) or a known deviation (KD), and where the existing ones live. Use when making a senior engineering judgment call — naming, an architectural pattern, a schema tradeoff, a deliberate deviation — or when you find code that disagrees with a spec skill, or when you need to check what has already been decided so you do not contradict it.
---
<!-- skill-status: current (checked 2026-09-29, ADR-253) -->

## Where the record lives

| File | Contents |
|---|---|
| `agent_store/SUMMARY.md` | **Start here.** What's true now: current rules by topic with the ADRs to cite, superseded ADRs never to cite, open gaps by area |
| `agent_store/DECISIONS.md` | Full ADR log + the dated session log. **Read it before deciding anything architectural.** |
| `agent_store/DEVIATIONS.md` | Known Deviations — every place code **or a doc** disagrees with a spec skill. The KDs against `database/` are rebuild lessons now (ADR-093). Read at orientation. |

**Append, never rewrite. Never renumber existing entries.**

## Making a decision

If you make a senior engineering judgment call — table naming, an architectural pattern, a
schema tradeoff, a deliberate deviation — append an ADR to `agent_store/DECISIONS.md` **in the
same response that makes the change**. An undocumented decision will be contradicted by the
next agent.

**Then update `agent_store/SUMMARY.md` in the same response:** add or change the rule under its
topic, and if the new ADR replaces or amends an old one, mark the old one "SUPERSEDED BY" or
"AMENDED BY" at the start of its row and add it to the summary's superseded table. When you open
or close a KD, update the summary's gaps table. A stale summary is worse than none.

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

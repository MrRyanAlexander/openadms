---
name: adms-close-out
description: Close out an Open ADMS response that changed files. Covers leaving nothing running, where each fact of a finished task is written once (most of it by the recorder agent while the verifier runs), the counts recorded by `pnpm chain record`, the report's shape, and the copy-paste git block the user runs. Use as the final step of any task, or run, that modified files.
---
<!-- skill-status: current (ADR-253; leave nothing running, ADR-277; the roadmap, ADR-280; each fact once, ADR-532; the recorder, the recorded counts, the session log retired, the roadmap at a milestone's close, ADR-594) -->

## 0. Leave nothing running (ADR-277)

After the last verification run, and before the report:
- **Stop the local stack:** `pnpm local:down` (containers and network only; volumes, `infra/local/.env`
  and Caddy's root are kept, so the next `pnpm local:up` resumes).
- **Drop your throw-away databases:** no `adms_story_…` (`pnpm scenarios clean`, before `down`) and
  no `adms_mutation` or other copy you made; only `adms` and `adms_shadow` stay.
- **No stray containers or volumes you made:** `docker ps -a` shows nothing you started;
  `docker volume ls -f dangling=true` nothing you created.
- Keep something running only with a written reason (a line in `NEXT.md`: what, why, who stops it).
- A refused stop or removal goes in Flags with the command for the user. Never stop or remove what
  you didn't start.

## 1. Where each fact goes, once (ADR-532, 594)

**Start this while the verifier runs the chain** (`adms-verify`, the loop): hand the mechanical
part to the **`recorder`** agent (Sonnet) with a brief, and write only what needs judgment yourself.

| Fact | Where | Who |
|---|---|---|
| A judgment call: the decision, why, its invariant | an ADR row in `DECISIONS.md` (`adms-decisions`), in the same work as the change | you |
| A rule or a step that changed | the owning skill; the `spec/parts/` page; `SUMMARY.md`'s topic bullet (the rule in a few lines, its ADRs) | you write the words; the recorder may place the bullet |
| Code or a doc disagreeing with a skill | a KD in `DEVIATIONS.md`, `SUMMARY.md` §3, raised in Flags | you |
| The task is done | its BACKLOG line ticked: `✅ done <date> (ADR-…): one or two lines. What it leaves: C… / nothing of its own.` | recorder |
| A later concern an ADR leaves / one it finished | the register: a line under the task or phase that takes it (next C-number) / the line removed, its C-number named in the ADR | recorder, from your brief |
| A REQ now satisfied, seen in a run | `REQUIREMENTS.md` ticked | recorder |
| An ADR superseded or amended; a new agent default | `SUMMARY.md` §2 row; §4 row; header `**Updated <date>, through ADR-<n>.**` | recorder |
| The chain's counts | `agent_store/CHAIN.md`, by **`pnpm chain record`** after you read the `≠` lines; never by hand | the verifier, at your word |
| A milestone or phase closed; what waits on the user changed | `ROADMAP.md`'s rows and its "Last updated" line (never per task) | recorder |
| Where things stand, the next task | **nothing to write**: the session hook reads the next `- [ ]` from `BACKLOG.md`. `NEXT.md` changes only when the phase, its scope or its exit changes | — |
| What was done this session | **the git commit** (its message lists the tasks and ADRs). The session log at the end of `DECISIONS.md` is retired (ADR-594) | the user commits |
| A lesson about a layer's tests | that layer's page beside `adms-verify` | you |

Never restate a build log in a second file, never add a "Before it…" chain, never strike text
through to keep it: what leaves a page goes word for word to `ARCHIVE.md` under a dated "Moved"
heading. Then **look at the recorder's answer** and fix what it says it didn't do.

## 2. The report

````markdown
### 📋 Done
- **Task(s):** [id and title · ADRs] (one line each)
- **Verification:** [the chain's last line as printed, and the counts that moved and why; or the docs checks actually run]
- **Left running:** [nothing, or what and the NEXT.md line saying why]

### ⚠️ Flags
- [a KD, a deviation, something skipped, a question for the user — or "none"]

### ⏭️ Next
- [the next `- [ ]` task in BACKLOG.md]

### 💻 Git — run these yourself
```bash
git status
git add <named paths>          # never `git add .`
git commit -m "type(phase3): ADR-…, task …: …"
```
````

Never fabricate verification output; a docs-only change says which checks it ran. Changed nothing
→ no git block. Never run a git write: that is the user's (ADR-008).

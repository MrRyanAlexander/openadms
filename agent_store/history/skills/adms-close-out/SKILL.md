---
name: adms-close-out
description: Close out an Open ADMS response that changed files. Covers leaving nothing running, where each fact of finished work is written once (the plan's tick, an ADR only for a real decision, the skill or spec page where a rule changed, the counts by `pnpm chain record`), the report's shape, and the copy-paste git block the user runs. Use as the final step of any item, milestone or run that modified files.
---
<!-- skill-status: current (ADR-253; leave nothing running, ADR-277; each fact once, ADR-532; cut to the plan, ADR-599) -->

## 0. Leave nothing running (ADR-277)

After the last verification run, and before the report:
- **Stop the local stack:** `pnpm local:down` (containers and network only; volumes, `infra/local/.env`
  and Caddy's root are kept, so the next `pnpm local:up` resumes). In a run that goes on to the
  next milestone, keep it up and stop it at the run's end.
- **Drop your throw-away databases:** no `adms_story_…` (`pnpm scenarios clean`, before `down`) and
  no `adms_mutation` or other copy you made; only `adms` and `adms_shadow` stay.
- **No stray containers or volumes you made:** `docker ps -a` shows nothing you started;
  `docker volume ls -f dangling=true` nothing you created.
- A refused stop or removal goes in Flags with the command for the user. Never stop or remove what
  you didn't start.

## 1. Where each fact goes, once (ADR-599)

| Fact | Where |
|---|---|
| An item is done (seen in a run) | its `PLAN.md` line ticked: `- [x]` and `✅ <date> (ADR-…, if any): what now exists, in plain words.` A REQ line it meets, ticked the same way; a carried line it finishes, named in that tick |
| Something an item leaves for later | a new `- [ ]` line under the milestone that takes it, in the same work |
| A real decision (product, money, evidence, a monitor's work, security, a dependency, the architecture, the user's answer, an agent default) | a short ADR row in `DECISIONS.md` (`adms-decisions`) |
| A rule or a step that changed | the owning skill (marked with the ADR) and the `spec/parts/` page |
| A new recipe learned (how an endpoint, table, test or screen is done here) | `adms-build`, under its heading; a lesson about a layer's tests, its page beside `adms-verify` |
| Code or a doc disagreeing with a skill | a KD in `DEVIATIONS.md`, raised in Flags |
| The chain's counts | `CHAIN.md`, by **`pnpm chain record`** after you read the `≠` lines; never by hand |
| A milestone's gate passed | its words appended to `agent_store/history/PLAN-DONE.md`; one line for it under **Done** in `PLAN.md` |
| What was done this session | **the git commit**: its message lists the items and ADRs |

Never restate a build log in a second file; never strike text through. Ordinary engineering is said
in the code and the commit message, not an ADR.

## 2. The report

````markdown
### 📋 Done
- **Items:** [id and title · ADRs] (one line each), or the milestone and what now works
- **Verification:** [the chain's last line as printed, and the counts that moved and why; or the targeted runs and their real lines]
- **Left running:** [nothing, or what and why]

### ⚠️ Flags
- [a KD, something skipped, a question for the user — or "none"]

### ⏭️ Next
- [the next `- [ ]` in PLAN.md]

### 💻 Git — run these yourself
```bash
git status
git add <named paths>          # never `git add .`
git commit -m "type(scope): ADR-…, items …: …"
```
````

Never fabricate verification output; a docs-only change says which checks it ran. Changed nothing
→ no git block. Never run a git write: that is the user's (ADR-008).

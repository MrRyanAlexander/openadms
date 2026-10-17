---
name: adms-close-out
description: Close out an Open ADMS response that changed files. Covers leaving nothing running (the local stack stopped, throw-away databases, containers and volumes gone), the required execution summary format, which agent_store state files to tick, the flags section, the next atomic task pointer, and the copy-paste git block the user runs themselves. Use as the final step of any task that modified files.
---
<!-- skill-status: current (checked 2026-09-29, ADR-253; leave nothing running, ADR-277; the roadmap, ADR-280; each fact once, ADR-532) -->

## 0. Leave nothing running (ADR-277)

After the last verification run, and before the summary:
- **Stop the local stack:** `pnpm local:down` (it removes containers and network only; the data
  volumes, `infra/local/.env` and Caddy's root are kept, so the next `pnpm local:up` resumes).
- **Drop your throw-away databases:** no `adms_story_…` (`pnpm scenarios clean`, before `down`) and
  no `adms_mutation` or other copy you made; only `adms` and `adms_shadow` stay.
- **No stray containers or volumes you made:** `docker ps -a` empty for anything you started;
  `docker volume ls -f dangling=true` shows nothing you created. Run any one-off container with
  `--rm` (and no anonymous volume it doesn't need).
- **Keep something running only with a written reason:** a line in `NEXT.md`'s Handoff saying what,
  why, and who stops it. Otherwise the next agent starts it with `pnpm local:up`.
- If the permission check refuses a stop or a removal, say so in Flags and give the user the
  command; never leave it unmentioned.
- Never stop or remove what you didn't start (the user's own containers): report it in Flags instead.

## 1. Update state first

**Each fact has one home; write it there once, briefly** (ADR-445, 516, 532). Never restate a
build log in a second file, never add a "Before it…" chain, never strike text through to keep it:
what leaves a page is gone from it (history is the ADRs and git; a bulk move goes word for word
to `agent_store/ARCHIVE.md`, under a dated "Moved" heading).


- `agent_store/NEXT.md` — tick the completed task; keep the Next Atomic Task pointer accurate.
  Its "Where things stand" says where things stand in a few lines: a finished task's detail is
  its ADR, its BACKLOG tick and the carry-forward register, never a new paragraph there.
- `agent_store/BACKLOG.md` — tick the task: `✅ done <date> (ADR-…):` and a line or two of what
  it built, then "What it leaves: C…". The detail is the ADR's, not the tick's.
- `agent_store/DECISIONS.md` — append an ADR if you made a judgment call (see `adms-decisions`), and
  one session-log line at the end of the file (what was done, its ADRs, the chain's result).
- `agent_store/DEVIATIONS.md` — append a KD if you found code disagreeing with a skill.
- `agent_store/REQUIREMENTS.md` — tick any REQ now satisfied.
- `agent_store/SUMMARY.md` — reflect any ADR added or superseded and any KD opened or closed:
  change the topic's bullet in place (the rule as it now stands, in a few lines, with its ADRs; no
  counts, file lists, dates seen or history), add a §2 row for what it supersedes, list a new
  agent default in §4 (one row per ADR), and replace the header's "Updated" line. Edit by topic,
  never read it whole; a topic past about 15 KB is split (the session hook warns).
- `agent_store/CHAIN.md` — **the only place the chain's counts are written** (ADR-445): replace
  the numbers that changed (tests by project, a story's checks, migrations, licences) with
  today's. Never restate a count in `NEXT.md`, `SUMMARY.md` or a skill; never keep a "before it…".
- **A new lesson about a layer's tests** (a helper, an exact list, what a loosening is tried on)
  goes in that layer's page beside the `adms-verify` skill, not in the skill's own page.
- `agent_store/BACKLOG.md` **carry-forward register** — anything your ADRs leave for later gets a
  line (the next C-number) under the task or phase that picks it up, a new standing rule under
  "Standing rules"; **remove the lines you did, naming their C-numbers in your ADR** (ADR-274,
  532). No server "no task yet" is left unfiled (ADR-519).
- `agent_store/ROADMAP.md` — the user's one-page roadmap (ADR-280): when a task, milestone or phase
  closed, a REQ was ticked, or what waits on the user changed, update its rows and **replace** its
  "Last updated" line with this session's, in plain words (never "Before it…"). Its §7 says which
  row. Never add a date estimate.
- `agent_store/NEXT.md` stays under about 20 KB: its "Where things stand" changes a line, never
  gains a paragraph per task.

## 2. Then close with exactly this structure

````markdown
### 📋 Execution Summary
- **Phase:** Phase X — [name, from NEXT.md]
- **Task:** [the atomic task completed]
- **Files changed:** [paths]
- **Verification:** [real observed output, e.g. "typecheck clean across every workspace; tests 42 passed" with the real counts]
- **Left running:** [`docker ps -a` after `pnpm local:down`: "nothing", or what and the NEXT.md line saying why]

### 🧠 State Updates
- NEXT.md: [task ticked, or "no change"]
- DECISIONS.md: [ADR-0XX added, or "no change"]
- DEVIATIONS.md: [KD-XX added/closed, or "no change"]
- REQUIREMENTS.md: [REQ-1XX ticked, or "no change"]

### ⚠️ Flags
- [anything contradicting a skill, skipped, or needing a decision — or "none"]

### ⏭️ Next
- [the next atomic task from NEXT.md]

### 💻 Git — run these yourself
```bash
git status
git checkout -b <branch-name>   # only when on main: never commit to main
git add <files>
git commit -m "feat(scope): message"
```
````

**Docs-only work** (Phase 0 until the scaffold): "Verification" is the consistency checks you
actually ran (e.g. a grep showing no stale reference remains, `diff CLAUDE.md AGENTS.md` empty),
never a test result.

If you changed nothing, skip the git block. Never fabricate verification output.
Never run a git command that mutates state — that is the user's to run.

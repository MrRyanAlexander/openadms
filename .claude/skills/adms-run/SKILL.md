---
name: adms-run
description: Run Open ADMS tasks back to back as a pipeline, each task built by a fresh builder agent while the lead stays small, then verified (Sonnet) and recorded (Sonnet) in parallel, with the same per-task ADRs, ticks and real chain output as one task at a time. Use when the user says "run", "keep going", "do the milestone", "the next N tasks", or `/adms-run [N | milestone | until <task>]`.
---
<!-- skill-status: current (ADR-594) -->

**You are the lead.** You hold the plan and the user's words; each task's reading and code live in
a builder's own context, so yours stays small and each task starts clean. Every task still gets
its own ADRs, its own BACKLOG tick and a chain run that was seen (ADR-516, 558 held).

## 0. Before the first task
- `NEXT.md` (short) and the session hook's next task. Which tasks: the user's words (`N`, a
  milestone, `until 3.6.3`); none named → the rest of the current milestone.
- **Say the plan in two lines** (the tasks, the stops below), then go. Don't ask to confirm.
- `eval "$(fnm env --shell zsh)" && pnpm ready` once, so the first builder doesn't wait on Docker.

## 1. Each task: the pipeline
1. **Brief a `builder`** (Agent, `subagent_type: builder`, foreground): the task's BACKLOG line
   word for word, its register items (`grep -n 'C1[0-9][0-9]\b' …` for the C-numbers on its line,
   and the standing rules' heading names), what the user said about it, and what the previous
   task left that touches it. Nothing else: it reads the rest itself.
2. **Read its report.** `needs input` → §3. `stuck` → §3. `built` → check the report against the
   task's line (every AC and REQ it names covered, or said why not). Ask the builder (SendMessage)
   for anything missing before going on.
3. **In parallel, in the background:**
   - a **`verifier`**: "Run the whole chain." (plus the loosening plan's path if there is one);
   - a **`recorder`**: the builder's CLOSE-OUT BRIEF word for word, with today's date.
   Don't edit code while the verifier runs.
4. **Verifier red:** send its FAILURES to the same builder (SendMessage, its context intact):
   "Fix these; rerun the targeted runs." Then a verifier for **only the failed steps** (and
   `test scenarios e2e` together if the fix touched `packages/domain`, `contracts`, `db` or
   `scenarios`). At most three rounds; then §3.
5. **Green:** read the COUNTS lines. Each `≠`/`+`/`−` the task explains (tests it added) is fine;
   one it doesn't is a finding: send it to the builder, never record it away. Then a verifier
   (foreground, short): "Run `pnpm chain record`." Check the recorder's answer: anything it
   didn't do, do it yourself.
6. **Log the task in your own running list** (task, ADRs, the chain's last line, the git message
   line), and go to the next task. One line each; never copy reports into a file.

## 2. Haiku and Sonnet do the cheap work
- A question of *where* (a definition, its users, the exact list a new endpoint joins): a
  **`scout`** (Haiku), never a sweep of greps in your own context.
- The chain and its logs: the **verifier** (Sonnet). Bookkeeping: the **recorder** (Sonnet).
- Decisions, domain reasoning, product code and anything the user reads: Opus (you, the builder).
- The cheaper agents never decide a domain fact and never edit code; if one's answer says how the
  product behaves, check it in the skill or ADR it cites before you use it.

## 3. When to stop the run
Stop, finish the close-out of what's done, and report, when:
- a builder returns a **question for the user** (ADR-230): ask it in your report, plainly, with the
  recommendation; the next task waits unless it doesn't depend on the answer (then go on and say so);
- a task needs **the user's hands** (a real phone, a printer, Xcode, an account: Milestones 3.8,
  3.9) or **Docker's disk is full**;
- the chain stays red after three rounds, or a count moves that nothing explains;
- the **milestone ends** and the next needs the user to open it, or the tasks asked for are done;
- the user writes anything: answer it first (`AGENTS.md`, "Working with the user").

## 4. The run's close-out (`adms-close-out`, once for the run)
- `pnpm local:down`; nothing of yours left running (`adms-close-out` §0).
- The report: one block per task (task · ADRs · the chain's last line · what it leaves), then
  flags, questions, next. **One git block for the run** (the state files are shared by every task,
  so per-task commits can't be separated after the fact): named paths, and a message listing each
  task with its ADRs.

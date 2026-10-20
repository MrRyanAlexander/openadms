#!/usr/bin/env bash
# SessionStart orientation for Open ADMS (ADR-044, 049, 232, 375, 532, 594). Stdout is added to the
# agent's context, so every line lands in every session: it says only what changes between sessions.
# The next task is read from BACKLOG.md itself (the first unticked box of the active phase), so no
# page keeps a pointer to it (ADR-594).
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
next="$root/agent_store/NEXT.md"
backlog="$root/agent_store/BACKLOG.md"
summary="$root/agent_store/SUMMARY.md"
qs="$root/spec/QUESTIONS.md"

echo "## Open ADMS (session-start hook)"
if [ -f "$next" ]; then
  phase=$(grep -m1 '^## Active Phase' "$next" | sed -E 's/^## Active Phase — //')
  [ -n "$phase" ] && echo "**Phase:** $phase"
fi

if [ -f "$backlog" ]; then
  task=$(awk '/^## Active/{f=1;next} f&&/^## /{exit}
              f&&!t&&/^- \[ \]/{t=1;print;next}
              t&&/^  /{print;next} t{exit}' "$backlog")
  echo
  if [ -n "$task" ]; then
    echo "**Next task** (the first unticked box of BACKLOG.md's active phase; do it when no other task is given):"
    echo "$task"
    id=$(printf '%s' "$task" | head -1 | sed -nE 's/^- \[ \] \*\*([0-9]+\.[0-9]+\.[0-9]+).*/\1/p')
    if [ -n "$id" ]; then
      items=$(awk '/Carry-forward register/{f=1} f' "$backlog" | grep -F -- "$id" | grep -v '^#' | cut -c1-240)
      [ -n "$items" ] && { echo; echo "Register lines naming $id:"; echo "$items"; }
    fi
  else
    echo "**Next task:** none unticked in the active phase: the phase's exit (NEXT.md), or ask the user."
  fi
fi

echo
echo "**Ways to work** (AGENTS.md): one task (the working loop), or \`/adms-run\` for tasks back to back. Cheap work goes to the \`scout\` (Haiku), \`verifier\` and \`recorder\` (Sonnet) agents."

# Size budgets (ADR-532): a page every agent reads that outgrows its budget costs every session.
over=""
if [ -f "$summary" ]; then
  # §2 (the superseded table) is grepped by ADR number, never read whole, so it has no budget.
  over=$(LC_ALL=C awk '/^##+ /{ if (name != "" && name !~ /^## 2\./ && bytes > 15360) printf "%s (%d KB); ", name, bytes/1024; name=substr($0,1,60); bytes=0 }
              { bytes += length($0) + 1 }
              END { if (name != "" && name !~ /^## 2\./ && bytes > 15360) printf "%s (%d KB); ", name, bytes/1024 }' "$summary")
fi
if [ -f "$next" ] && [ "$(wc -c < "$next")" -gt 10240 ]; then over="${over}NEXT.md ($(( $(wc -c < "$next") / 1024 )) KB, budget 10); "; fi
if [ -f "$backlog" ] && [ "$(wc -c < "$backlog")" -gt 81920 ]; then over="${over}BACKLOG.md ($(( $(wc -c < "$backlog") / 1024 )) KB, budget 80); "; fi
if [ -n "$over" ]; then
  echo
  echo "**⚠️ Over budget (ADR-532; trim it at this task's close, moving the words to agent_store/ARCHIVE.md):** ${over}SUMMARY.md topics' budget is 15 KB."
fi

if [ -f "$qs" ]; then
  waiting=$(grep -E "^### ❓ Q-" "$qs" | sed -E "s/^### ❓ /- /")
  design=$(grep -E "^### 🛠 Q-" "$qs" | sed -E "s/^### 🛠 /- /")
  echo
  echo "**Product questions** (spec/QUESTIONS.md; discovery is closed, ADR-230): grep the topic and read the entry before answering; never re-ask an answered one."
  [ -n "$waiting" ] && { echo "❓ Waiting on the user (cite the ID, never guess):"; echo "$waiting"; }
  [ -n "$design" ] && { echo "🛠 Design tasks, ours (propose an ADR when the work comes up):"; echo "$design"; }
fi
exit 0

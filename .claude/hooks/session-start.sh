#!/usr/bin/env bash
# SessionStart orientation for Open ADMS (ADR-044, 049, 232, 375, 532, 594, 599). Stdout is added to
# the agent's context, so every line lands in every session: it says only what changes between
# sessions. The next item is read from PLAN.md itself (its first unticked box, with the milestone
# heading above it), so no page keeps a pointer to it (ADR-599).
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
plan="$root/agent_store/PLAN.md"
qs="$root/spec/QUESTIONS.md"

echo "## Open ADMS (session-start hook)"

if [ -f "$plan" ]; then
  # The first "- [ ]" line and its indented continuation, and the last ##/### heading before it.
  found=$(awk '/^##+ /{ heading=$0 }
               !t && /^- \[ \]/{ t=1; print "MILESTONE\t" heading; print; next }
               t && /^  /{ print; next }
               t { exit }' "$plan")
  echo
  if [ -n "$found" ]; then
    milestone=$(printf '%s\n' "$found" | head -1 | cut -f2 | sed -E 's/^#+ //')
    echo "**Milestone:** $milestone"
    echo "**Next item** (agent_store/PLAN.md's first unticked box; read that milestone's section and the plan's \"Every item\"):"
    printf '%s\n' "$found" | tail -n +2
  else
    echo "**Next item:** none unticked in agent_store/PLAN.md: ask the user what opens next."
  fi
  if [ "$(wc -c < "$plan")" -gt 81920 ]; then
    echo
    echo "**⚠️ PLAN.md is over 80 KB ($(( $(wc -c < "$plan") / 1024 )) KB):** move a finished milestone's words to agent_store/history/PLAN-DONE.md at this close."
  fi
fi

echo
echo "**How to work** (AGENTS.md): the user says \"work on it\" and \`adms-work\` runs the plan, milestone by milestone, to each gate. Builds go to a \`builder\` (Opus) in a clean context; \"where is it\" to a \`scout\` (Haiku); the chain to the \`verifier\` (Sonnet). Done right, not convenient (ADR-599)."

if [ -f "$qs" ]; then
  waiting=$(grep -E "^### ❓ Q-" "$qs" | sed -E "s/^### ❓ /- /")
  design=$(grep -E "^### 🛠 Q-" "$qs" | sed -E "s/^### 🛠 /- /")
  if [ -n "$waiting" ] || [ -n "$design" ]; then
    echo
    echo "**Product questions** (spec/QUESTIONS.md; discovery is closed, ADR-230): grep the topic and read the entry before answering; never re-ask an answered one."
    [ -n "$waiting" ] && { echo "❓ Waiting on the user (cite the ID, never guess):"; echo "$waiting"; }
    [ -n "$design" ] && { echo "🛠 Design tasks, ours (propose an ADR when the work comes up):"; echo "$design"; }
  fi
fi
exit 0

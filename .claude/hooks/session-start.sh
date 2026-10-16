#!/usr/bin/env bash
# SessionStart orientation for Open ADMS (ADR-044, ADR-049, ADR-232). Stdout is added to the agent's context.
# Makes the ORIENT step deterministic: what to trust, which skills are current, the next task, and the
# product questions that aren't answered yet. Kept short on purpose: every line lands in every session.
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
next="$root/agent_store/NEXT.md"
qs="$root/spec/QUESTIONS.md"

echo "## Open ADMS orientation (session-start hook)"
echo
echo "**Trust, in order (every answer, explanation or demo, not only code):** the newest ADR → agent_store/SUMMARY.md → a skill marked current → in any other skill only its ⚠️ notes (its body describes the old system, KD-58). To explain or demo the domain: spec/golden/MISSION.md. Front door: spec/INDEX.md."

current=""; layered=""
for f in "$root"/.claude/skills/*/SKILL.md; do
  [ -f "$f" ] || continue
  name=$(basename "$(dirname "$f")")
  if grep -q "skill-status: current" "$f"; then current="$current $name"; else layered="$layered $name"; fi
done
echo
echo "**Skills current (trust the body):**${current:- none}"
echo "**Skills still layered (body is historical; check SUMMARY.md):**${layered:- none}"

if [ -f "$next" ]; then
  echo
  echo "**Next atomic task** (agent_store/NEXT.md; do this when no other task is given):"
  awk '/^## 📍 Next Atomic Task/{f=1;next} f&&/^## /{exit} f&&NF' "$next"
fi
# Size budgets (ADR-532): every agent reads these pages, so a page that outgrows its budget costs every
# session. Silent when all is well; one line per page over budget otherwise.
summary="$root/agent_store/SUMMARY.md"
backlog="$root/agent_store/BACKLOG.md"
over=""
if [ -f "$summary" ]; then
  # §2 (the superseded table) is grepped by ADR number, never read whole, so it has no budget.
  over=$(LC_ALL=C awk '/^##+ /{ if (name != "" && name !~ /^## 2\./ && bytes > 15360) printf "%s (%d KB); ", name, bytes/1024; name=substr($0,1,60); bytes=0 }
              { bytes += length($0) + 1 }
              END { if (name != "" && name !~ /^## 2\./ && bytes > 15360) printf "%s (%d KB); ", name, bytes/1024 }' "$summary")
fi
if [ -f "$next" ] && [ "$(wc -c < "$next")" -gt 20480 ]; then over="${over}NEXT.md ($(( $(wc -c < "$next") / 1024 )) KB, budget 20); "; fi
if [ -f "$backlog" ] && [ "$(wc -c < "$backlog")" -gt 81920 ]; then over="${over}BACKLOG.md ($(( $(wc -c < "$backlog") / 1024 )) KB, budget 80); "; fi
if [ -n "$over" ]; then
  echo
  echo "**⚠️ Over budget (ADR-532; split or trim it at this task's close, moving the words to agent_store/ARCHIVE.md):** ${over}SUMMARY.md topics' budget is 15 KB."
fi

if [ -f "$qs" ]; then
  answered=$(grep -cE "^### ✅ Q-" "$qs")
  echo
  echo "**Product questions** (spec/QUESTIONS.md; discovery is closed, ADR-230): $answered answered — grep the topic and read the entry before answering; never re-ask."
  for st in "🛠:Design tasks — ours; propose an ADR when the work comes up" "❓:Waiting on the user — cite the ID, never guess"; do
    icon="${st%%:*}"; label="${st#*:}"
    list=$(grep -E "^### $icon Q-" "$qs" | sed -E "s/^### $icon /- /")
    echo
    echo "$icon $label:"
    if [ -n "$list" ]; then echo "$list"; else echo "- none"; fi
  done
fi
exit 0

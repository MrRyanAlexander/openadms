#!/usr/bin/env bash
# SessionStart orientation for Open ADMS. Stdout is added to the agent's context, so it says only
# what changes between sessions: the one build task's parts still open, from agent_store/BUILD.md.
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
build="$root/agent_store/BUILD.md"

echo "## Open ADMS (session-start hook)"
echo
if [ -f "$build" ]; then
  open=$(awk '/^- \[ \]/{ t=1; print; next } t && /^      /{ print; next } { t=0 }' "$build")
  done=$(grep -c '^- \[x\]' "$build")
  if [ -n "$open" ]; then
    echo "**The one build task** (agent_store/BUILD.md; $done part(s) done). Parts still open, the first is next:"
    printf '%s\n' "$open"
  else
    echo "**The one build task:** every part in agent_store/BUILD.md is ticked. Check its \"Done when\" and report to the user."
  fi
  echo
  echo "**How to work** (AGENTS.md): build it as you know it should be, decide without asking (BUILD.md \"Settled\"), commit on the work branch as each part lands, targeted tests as you go, the whole chain at the end. **When the user says go** (AGENTS.md \"When the user says go\", \"Runs\"): the lead (Opus) splits what's left across agents working at the same time, each at the model and effort its work needs; every run once per change, after a fix only what failed."
else
  echo "**No agent_store/BUILD.md:** ask the user what the work is."
fi
exit 0

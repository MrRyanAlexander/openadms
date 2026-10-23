#!/usr/bin/env bash
# PreToolUse guard for Open ADMS. Enforces the git rule and the write boundaries in AGENTS.md.
# Exit 2 blocks the call and returns stderr to the agent.
# This is the enforcement layer; AGENTS.md is the explanation. Keep the two in sync.
# Its rules are tested: tools/security/test/guard-hook.test.ts. Change both together.
set -u

block() { echo "BLOCKED by .claude/hooks/guard.sh: $1" >&2; exit 2; }

# Fail closed: without jq nothing below can read the call, and an unread call is never allowed.
command -v jq >/dev/null 2>&1 || block "jq is not installed, so the guard can't read the tool call. Install jq (brew install jq)."

input=$(cat)
tool=$(printf '%s' "$input" | jq -r '.tool_name // empty')

# The repository root: Claude Code's, or two folders up from this file.
root=${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}

# An env file holds secrets: .env or .env.<anything> but .env.example, at any depth.
is_env_file() {
  case "$(basename "$1")" in
    .env.example) return 1 ;;
    .env|.env.*)  return 0 ;;
    *)            return 1 ;;
  esac
}

case "$tool" in
  Bash)
    cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
    # Git (AGENTS.md, "Git"; the user, 2026-10-22): the agent commits its own work on a branch
    # that isn't main. It may add, commit, move a file and start a branch (checkout -b, switch -c);
    # nothing that rewrites, discards or publishes history, and never a commit on main or master.
    # Each `git <global-opts> <subcommand> <first-arg>` in a compound command is judged on its own.
    callre='(^|[;&|(`[:space:]])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:];&|]*)?)*[[:space:]]+[a-z-]+([[:space:]]+[^[:space:];&|)]+)?'
    makes_branch=no
    commits=no
    while IFS= read -r call; do
      [ -n "$call" ] || continue
      # Drop the separator and `git`, then the global options (-C <dir> and -c <k=v> take a value).
      set -f; set -- ${call#*git}; set +f
      while [ $# -gt 0 ] && [ "${1#-}" != "$1" ]; do
        case "$1" in -C|-c) [ $# -gt 1 ] && shift ;; esac
        shift
      done
      sub=${1:-}; arg=${2:-}
      case "$sub" in
        add|mv) ;;
        commit) commits=yes ;;
        checkout)
          [ "$arg" = "-b" ] || block "git checkout can discard work or leave the branch; only 'git checkout -b <new-branch>' is allowed (AGENTS.md, Git)."
          makes_branch=yes ;;
        switch)
          [ "$arg" = "-c" ] || block "only 'git switch -c <new-branch>' is allowed (AGENTS.md, Git)."
          makes_branch=yes ;;
        branch)
          case "$arg" in
            -[dDmMcCf]*|--delete|--move|--copy|--force) block "deleting, renaming or forcing a branch is the user's (AGENTS.md, Git)." ;;
          esac ;;
        init|push|pull|fetch|merge|rebase|restore|reset|stash|clean|rm|cherry-pick|revert|am|apply|tag|worktree|update-ref|filter-branch|replace|gc|prune|reflog)
          block "git $sub rewrites, discards or publishes history, so it is the user's (AGENTS.md, Git). Commit on the work branch and tell the user what to run." ;;
      esac
    done <<CALLS
$(printf '%s' "$cmd" | grep -Eo "$callre")
CALLS
    # A commit is never made on main: the branch it would land on is the checkout's, unless the
    # same command starts a branch first.
    if [ "$commits" = yes ] && [ "$makes_branch" = no ]; then
      branch=$(git -C "$root" branch --show-current 2>/dev/null)
      case "$branch" in
        main|master) block "never commit on $branch (AGENTS.md, Git): start a work branch first (git checkout -b <name>)." ;;
      esac
    fi
    # Printing an env file puts its secrets in the transcript (AGENTS.md: never echo a secret).
    # Loading one in a subshell (`set -a; . infra/local/.env`) and `shasum` are fine.
    printers='cat|less|more|head|tail|bat|nl|tac|strings|xxd|od|hexdump|base64|open'
    envre="(^|[;&|(\`[:space:]])($printers)[[:space:]]([^;&|]*[[:space:]/\"'=])?\.env(\.[A-Za-z0-9_.-]+)?([[:space:]\"';&|)]|\$)"
    if printf '%s' "$cmd" | sed -E 's/\.env\.example//g' | grep -Eq "$envre"; then
      block "printing an env file would put its secrets in the transcript. Reference keys by name; load it in a subshell (set -a; . <file>) or compare shasums."
    fi
    ;;
  Read)
    p=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
    if is_env_file "$p"; then
      block "an env file holds secrets; reading it would put them in the transcript. Reference keys by name (AGENTS.md write boundaries)."
    fi
    ;;
  Edit|Write|NotebookEdit)
    p=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.notebook_path // empty')
    if is_env_file "$p"; then
      block "env files are written by the tools that own them (pnpm local:up, pnpm installer), never by hand (AGENTS.md write boundaries)."
    fi
    case "$p" in
      "$root/docker-compose.yml") block "the root docker-compose.yml is the historical stack, the user's to retire. The local stack is infra/local/compose.yaml." ;;
      "$root/pnpm-lock.yaml")     block "the lockfile is written by pnpm only (pnpm install)." ;;
    esac
    case "$p" in
      */development/*|development/*) block "development/ is read-only reference (AGENTS.md write boundaries)." ;;
      */prisma/migrations/*.sql)

        # Never edit a generated or applied migration. A database-guard migration may be written
        # only into Prisma's empty "create only" stub (comments and blank lines only).
        if [ "$tool" = "Write" ] && [ -f "$p" ] && ! grep -qvE '^[[:space:]]*(--.*)?$' "$p"; then
          :
        else
          block "never edit a generated or applied migration. A guard migration is written only into an empty stub made by prisma migrate dev --create-only."
        fi ;;
      */node_modules/*|*/.venv/*|*/.pytest_cache/*|*/__pycache__/*|*/.git/*) block "generated/vendored path; never write here." ;;
      */dist/*|*/src/generated/*|*/.generated/*|*/.state/*|*/.cache/*) block "generated by the build or a tool (tsc, pnpm generate, pnpm local:up, pnpm installer); change its source and rerun the tool." ;;
    esac
    ;;
esac
exit 0

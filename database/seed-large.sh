#!/usr/bin/env bash
# =============================================================================
# Open ADMS :: optional volume seed
#
#   ./seed-large.sh              25,000 tickets on the demo project
#   ./seed-large.sh 50000        a specific number
#   ./seed-large.sh 50000 --yes  no confirmation prompt (for CI)
#
# This is a separate target on purpose. `npm run setup` is unchanged and still
# builds exactly the database the Railway and Netlify path expects; nothing in
# here runs unless somebody asks for it by name.
#
# Requires: psql on PATH, DATABASE_URL in the environment, and a database that
# already carries the demo project.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL is not set. Example: postgresql://user:pass@host:5432/openadms}"

COUNT="${ADMS_LARGE_TICKETS:-25000}"
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y)      ASSUME_YES=1 ;;
    --help|-h)     sed -n '2,14p' "$0"; exit 0 ;;
    ''|*[!0-9]*)   echo "Unknown option: $arg" >&2; exit 2 ;;
    *)             COUNT="$arg" ;;
  esac
done

b=$'\033[1m'; d=$'\033[2m'; g=$'\033[32m'; y=$'\033[33m'; x=$'\033[0m'
step() { printf '\n%s==>%s %s%s%s\n' "$g" "$x" "$b" "$*" "$x"; }
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

printf '\n%sOpen ADMS volume seed%s\n%s%s%s\n' "$b" "$x" "$d" "${DATABASE_URL%%\?*}" "$x"

step "Checking the database"
"${PSQL[@]}" -tAc "SELECT 'connected to ' || current_database()"
present=$("${PSQL[@]}" -tAc \
  "SELECT count(*) FROM projects WHERE project_code = 'STL-2026-ROW'" | tr -d '[:space:]')
if [[ "$present" != "1" ]]; then
  echo "  The demo project is not here. Run ./setup.sh --with-demo first." >&2
  exit 1
fi
existing=$("${PSQL[@]}" -tAc "SELECT count(*) FROM tickets" | tr -d '[:space:]')

# Said plainly before anything is written. A seed that takes several minutes and
# leaves tens of thousands of rows behind should never be a surprise.
printf '\n%sThis adds %s ticket(s) to the demo project and prices every one of\n' "$y" "$COUNT"
printf 'them through the rules engine. There are %s ticket(s) now.\n' "$existing"
printf 'Expect a few minutes, and a database several hundred megabytes larger.\n'
printf 'Nothing here is undone by re-running setup.sh; rebuild from empty for that.%s\n' "$x"

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "  Type the number of tickets to confirm: " confirm
  [[ "$confirm" == "$COUNT" ]] || { echo "  Aborted."; exit 1; }
fi

step "Generating"
# Passed as a psql variable rather than a -c SET, so the value and the file are
# unambiguously in the same session.
"${PSQL[@]}" -v tickets="$COUNT" -f "$HERE/seeds/large/001_volume.sql"

step "Summary"
"${PSQL[@]}" -c "
  SELECT
    (SELECT count(*) FROM tickets WHERE deleted_at IS NULL)  AS tickets,
    (SELECT count(*) FROM transactions)                      AS transactions,
    (SELECT count(*) FROM audit_events)                      AS audit_events,
    pg_size_pretty(pg_database_size(current_database()))      AS database_size;"

printf '\n%sVolume seed complete.%s\n\n' "$g$b" "$x"

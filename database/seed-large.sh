#!/usr/bin/env bash
# =============================================================================
# Open ADMS :: optional volume seed
#
#   ./seed-large.sh                       25,000 tickets across the demo
#                                         projects already in the database
#   ./seed-large.sh 250000                a specific number
#   ./seed-large.sh 250000 --projects=10  build 10 more demo projects first and
#                                         split the 250,000 across them
#   ./seed-large.sh 1000000 -p 20 --yes   no confirmation prompt (for CI)
#
# The ticket number is a TOTAL, not a per project figure: ask for 250,000 across
# 10 projects and you get 250,000 tickets, weighted so the projects are not all
# the same size. Up to 1,000,000 tickets and 50 projects.
#
# Every project it builds is a DEMO project with an invented storm name, in an
# invented county, in state XX. Nothing it writes can be mistaken for real data.
#
# This is a separate target on purpose. `npm run setup` is unchanged and still
# builds exactly the database the Railway and Netlify path expects; nothing in
# here runs unless somebody asks for it by name.
#
# Requires: psql on PATH, DATABASE_URL in the environment, and a database that
# already carries the worked demo project.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL is not set. Example: postgresql://user:pass@host:5432/openadms}"

COUNT="${ADMS_LARGE_TICKETS:-25000}"
PROJECTS="${ADMS_LARGE_PROJECTS:-0}"
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)          ASSUME_YES=1 ;;
    --help|-h)         sed -n '2,22p' "$0"; exit 0 ;;
    --projects=*)      PROJECTS="${1#*=}" ;;
    --projects|-p)     shift; PROJECTS="${1:-}" ;;
    ''|*[!0-9]*)       echo "Unknown option: $1" >&2; exit 2 ;;
    *)                 COUNT="$1" ;;
  esac
  shift
done

for pair in "tickets:$COUNT" "projects:$PROJECTS"; do
  value="${pair#*:}"
  [[ "$value" =~ ^[0-9]+$ ]] || { echo "${pair%%:*} must be a whole number, not '$value'" >&2; exit 2; }
done
(( COUNT >= 1 && COUNT <= 1000000 )) || { echo "tickets must be between 1 and 1000000" >&2; exit 2; }
(( PROJECTS <= 50 ))                 || { echo "projects must be 50 or fewer" >&2; exit 2; }

b=$'\033[1m'; d=$'\033[2m'; g=$'\033[32m'; y=$'\033[33m'; x=$'\033[0m'
step() { printf '\n%s==>%s %s%s%s\n' "$g" "$x" "$b" "$*" "$x"; }
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

printf '\n%sOpen ADMS volume seed%s\n%s%s%s\n' "$b" "$x" "$d" "${DATABASE_URL%%\?*}" "$x"

step "Checking the database"
"${PSQL[@]}" -tAc "SELECT 'connected to ' || current_database()"
present=$("${PSQL[@]}" -tAc \
  "SELECT count(*) FROM projects WHERE project_code ~ '^DEMO-[0-9]+-'" | tr -d '[:space:]')
if [[ "$present" == "0" ]]; then
  echo "  There are no demo projects here. Run ./setup.sh --with-demo first." >&2
  exit 1
fi
existing=$("${PSQL[@]}" -tAc "SELECT count(*) FROM tickets" | tr -d '[:space:]')

# Said plainly before anything is written, with numbers rather than adjectives.
# Measured on a local Postgres 16: 25,000 tickets take about a hundred seconds
# and leave about 230 MB behind, most of it the audit trail and the transactions
# the rules engine writes. A hosted database is commonly two to three times
# slower than that, so the estimate is deliberately the pessimistic end.
minutes=$(awk -v n="$COUNT" 'BEGIN { printf "%.0f", (n / 25000.0) * 4 }')
gigabytes=$(awk -v n="$COUNT" 'BEGIN { printf "%.1f", (n / 25000.0) * 0.23 }')

printf '\n%sThis adds %s ticket(s) in total and prices every one of them through\n' "$y" "$COUNT"
if (( PROJECTS > 0 )); then
  printf 'the rules engine, spread across %s NEW demo project(s) it builds first.\n' "$PROJECTS"
else
  printf 'the rules engine, spread across the %s demo project(s) already here.\n' "$present"
fi
printf 'There are %s ticket(s) now.\n' "$existing"
printf 'Allow up to %s minutes and about %s GB of database growth.\n' "$minutes" "$gigabytes"
printf 'Nothing here is undone by re-running setup.sh; rebuild from empty for that.%s\n' "$x"

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "  Type the number of tickets to confirm: " confirm
  [[ "$confirm" == "$COUNT" ]] || { echo "  Aborted."; exit 1; }
fi

step "Generating"
# The kit first, the driver second, the cleanup last. Passed as psql variables
# rather than -c SET, so the values and the file are unambiguously in the same
# session.
"${PSQL[@]}" -f "$HERE/seeds/large/000_demo_kit.sql"
"${PSQL[@]}" -v tickets="$COUNT" -v projects="$PROJECTS" \
             -f "$HERE/seeds/large/001_volume.sql"
"${PSQL[@]}" -f "$HERE/seeds/large/099_cleanup.sql"

step "Summary"
"${PSQL[@]}" -c "
  SELECT
    (SELECT count(*) FROM projects WHERE deleted_at IS NULL) AS projects,
    (SELECT count(*) FROM tickets WHERE deleted_at IS NULL)  AS tickets,
    (SELECT count(*) FROM transactions)                      AS transactions,
    (SELECT count(*) FROM audit_events)                      AS audit_events,
    pg_size_pretty(pg_database_size(current_database()))      AS database_size;"

"${PSQL[@]}" -c "
  SELECT p.project_code, p.name,
         count(t.id) FILTER (WHERE t.deleted_at IS NULL) AS tickets
    FROM projects p LEFT JOIN tickets t ON t.project_id = p.id
   WHERE p.deleted_at IS NULL
   GROUP BY p.project_code, p.name
   ORDER BY p.project_code;"

printf '\n%sVolume seed complete.%s\n\n' "$g$b" "$x"

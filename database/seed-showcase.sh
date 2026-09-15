#!/usr/bin/env bash
# =============================================================================
# Open ADMS :: showcase seed
#
#   ./seed-showcase.sh                 20 projects, 6 declarations, 10,000 tickets
#   ./seed-showcase.sh 4000            the same 20 projects, fewer tickets
#   ./seed-showcase.sh 10000 --seed=7  a different random spread of the work
#   ./seed-showcase.sh --yes           no confirmation prompt (for CI)
#
# The small one. It fits a free Postgres, it finishes in a couple of minutes,
# and it is the better demonstration of what the system does:
#
#   two hurricanes, a flood, a wildfire, an ice storm, and a state river flood
#   six of the seven programs, five kinds of client, seven ticket types
#   per cubic yard, per ton, per unit, per hour and banded pricing
#   projects in setup, active, paused, closeout and closed
#   a contract shared by two projects and decided separately on each
#   an approved invoice that locks its tickets, and a correction that reprices
#   permits verified, pending and expired, and loads still out in the field
#
# For volume rather than variety, seed-large.sh goes to a million tickets.
#
# Requires: psql on PATH, DATABASE_URL in the environment, and a database that
# already carries the worked demo project.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL is not set. Example: postgresql://user:pass@host:5432/openadms}"

COUNT="${ADMS_SHOWCASE_TICKETS:-10000}"
SEED="${ADMS_SHOWCASE_SEED:-0.42}"
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)      ASSUME_YES=1 ;;
    --help|-h)     sed -n '2,29p' "$0"; exit 0 ;;
    --seed=*)      SEED="${1#*=}" ;;
    --seed|-s)     shift; SEED="${1:-}" ;;
    ''|*[!0-9]*)   echo "Unknown option: $1" >&2; exit 2 ;;
    *)             COUNT="$1" ;;
  esac
  shift
done

[[ "$COUNT" =~ ^[0-9]+$ ]] || { echo "tickets must be a whole number, not '$COUNT'" >&2; exit 2; }
(( COUNT >= 500 && COUNT <= 10000 )) || {
  echo "tickets must be between 500 and 10000. For more than that use ./seed-large.sh" >&2
  exit 2; }
[[ "$SEED" =~ ^-?[0-9]+([.][0-9]+)?$ ]] || { echo "seed must be a number, not '$SEED'" >&2; exit 2; }
# setseed wants -1 to 1, and a whole number like 7 is the obvious thing to type.
SEED=$(awk -v s="$SEED" 'BEGIN { if (s > 1 || s < -1) { s = (s % 1000) / 1000 } printf "%.6f", s }')

b=$'\033[1m'; d=$'\033[2m'; g=$'\033[32m'; y=$'\033[33m'; x=$'\033[0m'
step() { printf '\n%s==>%s %s%s%s\n' "$g" "$x" "$b" "$*" "$x"; }
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

printf '\n%sOpen ADMS showcase seed%s\n%s%s%s\n' "$b" "$x" "$d" "${DATABASE_URL%%\?*}" "$x"

step "Checking the database"
"${PSQL[@]}" -tAc "SELECT 'connected to ' || current_database()"
present=$("${PSQL[@]}" -tAc \
  "SELECT count(*) FROM projects WHERE project_code ~ '^DEMO-[0-9]+-'" | tr -d '[:space:]')
if [[ "$present" == "0" ]]; then
  echo "  There are no demo projects here. Run ./setup.sh --with-demo first." >&2
  exit 1
fi
existing=$("${PSQL[@]}" -tAc "SELECT count(*) FROM tickets" | tr -d '[:space:]')

# Measured on a local Postgres 16: the whole thing is about two minutes and
# a hundred and twenty megabytes at ten thousand tickets. A hosted database is
# commonly two to three times slower, so the estimate is the pessimistic end.
minutes=$(awk -v n="$COUNT" 'BEGIN { printf "%.0f", (n / 10000.0) * 6 + 1 }')
megabytes=$(awk -v n="$COUNT" 'BEGIN { printf "%.0f", (n / 10000.0) * 130 + 20 }')

printf '\n%sThis builds 20 more demo projects across 6 declarations and spreads\n' "$y"
printf '%s ticket(s) across them, pricing every one through the rules engine.\n' "$COUNT"
printf 'There are %s ticket(s) and %s demo project(s) now.\n' "$existing" "$present"
printf 'Allow up to %s minutes and about %s MB of database growth.\n' "$minutes" "$megabytes"
printf 'Nothing here is undone by re-running setup.sh; rebuild from empty for that.%s\n' "$x"

if [[ $ASSUME_YES -eq 0 ]]; then
  read -r -p "  Type yes to continue: " confirm
  [[ "$confirm" == "yes" ]] || { echo "  Aborted."; exit 1; }
fi

step "Generating"
"${PSQL[@]}" -f "$HERE/seeds/large/000_demo_kit.sql"
"${PSQL[@]}" -v tickets="$COUNT" -v seed="$SEED" \
             -f "$HERE/seeds/large/002_showcase.sql"
"${PSQL[@]}" -f "$HERE/seeds/large/099_cleanup.sql"

step "Summary"
"${PSQL[@]}" -c "
  SELECT
    (SELECT count(*) FROM projects WHERE deleted_at IS NULL) AS projects,
    (SELECT count(*) FROM disasters)                         AS declarations,
    (SELECT count(*) FROM tickets WHERE deleted_at IS NULL)  AS tickets,
    (SELECT count(*) FROM transactions)                      AS transactions,
    (SELECT count(*) FROM invoices)                          AS invoices,
    pg_size_pretty(pg_database_size(current_database()))      AS database_size;"

"${PSQL[@]}" -c "
  SELECT p.project_code,
         d.name                                   AS declaration,
         pr.label                                 AS program,
         p.status,
         count(t.id) FILTER (WHERE t.deleted_at IS NULL) AS tickets,
         COALESCE(round(sum(x.amount)), 0)        AS billable
    FROM projects p
    LEFT JOIN disasters d ON d.id = p.disaster_id
    LEFT JOIN programs pr ON pr.code = p.program_code
    LEFT JOIN tickets t   ON t.project_id = p.id
    LEFT JOIN transactions x ON x.ticket_id = t.id
                            AND x.superseded_at IS NULL AND NOT x.is_reversal
   WHERE p.deleted_at IS NULL
   GROUP BY p.project_code, d.name, pr.label, p.status
   ORDER BY p.project_code;"

printf '\n%sShowcase seed complete.%s\n\n' "$g$b" "$x"

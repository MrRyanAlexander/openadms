#!/usr/bin/env bash
# =============================================================================
# Open ADMS :: database setup
#
#   ./setup.sh                       migrate + reference seed
#   ./setup.sh --with-demo           migrate + reference seed + demo project
#   ./setup.sh --reset --with-demo   drop and rebuild from empty, then seed
#   ./setup.sh --test                run the schema test suite when finished
#
# Requires: psql on PATH and DATABASE_URL in the environment.
# PostGIS is used when available and skipped cleanly when it is not.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
: "${DATABASE_URL:?DATABASE_URL is not set. Example: postgresql://user:pass@host:5432/openadms}"

WITH_DEMO=0
RESET=0
RUN_TESTS=0
for arg in "$@"; do
  case "$arg" in
    --with-demo) WITH_DEMO=1 ;;
    --reset)     RESET=1 ;;
    --test)      RUN_TESTS=1 ;;
    --help|-h)   sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

b=$'\033[1m'; d=$'\033[2m'; g=$'\033[32m'; r=$'\033[31m'; x=$'\033[0m'
step() { printf '\n%s==>%s %s%s%s\n' "$g" "$x" "$b" "$*" "$x"; }
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

printf '\n%sOpen ADMS database setup%s\n%s%s%s\n' "$b" "$x" "$d" "${DATABASE_URL%%\?*}" "$x"

step "Checking connectivity"
"${PSQL[@]}" -tAc "SELECT 'connected to ' || current_database() || ' as ' || current_user"

if [[ $RESET -eq 1 ]]; then
  step "Resetting public schema"
  read -r -p "  This DROPS every table in the public schema. Type 'reset' to continue: " confirm
  [[ "$confirm" == "reset" ]] || { echo "  Aborted."; exit 1; }
  "${PSQL[@]}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
  echo "  Schema dropped and recreated."
fi

step "Applying migrations"
"$HERE/migrate.sh"

# A half-migrated schema must never reach the seeds: the failure mode is a
# confusing "relation does not exist" thirteen files later.
step "Verifying the schema is complete"
expected=$(find "$HERE/migrations" -maxdepth 1 -name '*.sql' | wc -l | tr -d '[:space:]')
applied=$("${PSQL[@]}" -tAc "SELECT count(*) FROM schema_migrations" | tr -d '[:space:]')
if [[ "$applied" != "$expected" ]]; then
  echo "  ${r}xx${x}  $applied of $expected migrations applied. Not seeding an incomplete schema." >&2
  exit 1
fi
echo "  $applied of $expected migrations applied."

step "Seeding reference data"
for f in "$HERE"/seeds/00[12]_*.sql; do
  printf '  %s\n' "$(basename "$f")"
  "${PSQL[@]}" -f "$f" >/dev/null
done

if [[ $WITH_DEMO -eq 1 ]]; then
  step "Seeding the demo project"
  "${PSQL[@]}" -f "$HERE/seeds/003_demo_project.sql"
fi

# Measured, not assumed. See the note in backend/app/db.py: every list in this
# application reads a wide view whose estimated cost crosses jit_above_cost
# while its actual work is an index scan that stops after one page. At 25,000
# tickets the first page took 2.2 seconds, of which 2.1 was Postgres compiling
# a query that runs in 10 milliseconds. Turn it back on with:
#   ALTER DATABASE <name> RESET jit;
step "Turning off JIT for this database"
if "${PSQL[@]}" -tAc "ALTER DATABASE \"$("${PSQL[@]}" -tAc 'SELECT current_database()')\" SET jit = off" >/dev/null 2>&1; then
  echo "  JIT off. Lists stay fast as ticket counts grow."
else
  echo "  Could not set it at the database level, which needs ownership of the"
  echo "  database. The API turns JIT off per connection anyway, so this is a"
  echo "  note rather than a problem."
fi

step "Provisioning the instance key"
"${PSQL[@]}" -tAc "
  INSERT INTO instance (instance_key, display_name, organization)
  SELECT encode(gen_random_bytes(32), 'hex'),
         COALESCE(NULLIF('${ADMS_INSTANCE_NAME:-}', ''), 'Open ADMS'),
         NULLIF('${ADMS_ORGANIZATION:-}', '')
  WHERE NOT EXISTS (SELECT 1 FROM instance);
  SELECT 'INSTANCE_UNIQUE_KEY ' || instance_key FROM instance LIMIT 1;"

if [[ $RUN_TESTS -eq 1 ]]; then
  step "Running the schema test suite"
  "${PSQL[@]}" -f "$HERE/tests/schema_tests.sql"
fi

step "Summary"
"${PSQL[@]}" -c "
  SELECT
    (SELECT count(*) FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
    (SELECT count(*) FROM information_schema.views
      WHERE table_schema='public')                             AS views,
    (SELECT count(*) FROM ticket_types)                        AS ticket_types,
    (SELECT count(*) FROM projects WHERE deleted_at IS NULL)   AS projects,
    (SELECT count(*) FROM tickets WHERE deleted_at IS NULL)    AS tickets,
    (SELECT count(*) FROM transactions)                        AS transactions,
    (SELECT count(*) FROM audit_events)                        AS audit_events;"

printf '\n%sDatabase ready.%s\n\n' "$g$b" "$x"

#!/usr/bin/env bash
# =============================================================================
# Open ADMS :: migration runner
# Applies every unapplied file in migrations/ in lexical order, inside a
# transaction, and records the version and checksum in schema_migrations.
#
#   ./migrate.sh                 apply pending migrations
#   ./migrate.sh --status        list applied and pending
#   ./migrate.sh --verify        fail if an applied file has changed on disk
#
# Requires: psql on PATH, DATABASE_URL in the environment.
# =============================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$HERE/migrations"

: "${DATABASE_URL:?DATABASE_URL is not set. Example: postgresql://user:pass@host:5432/openadms}"

PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)

c_reset=$'\033[0m'; c_dim=$'\033[2m'; c_grn=$'\033[32m'
c_yel=$'\033[33m'; c_red=$'\033[31m'; c_bld=$'\033[1m'

log()  { printf '%s\n' "$*"; }
ok()   { printf '%s  ok%s  %s\n' "$c_grn" "$c_reset" "$*"; }
skip() { printf '%s  --%s  %s %s(already applied)%s\n' "$c_dim" "$c_reset" "$*" "$c_dim" "$c_reset"; }
warn() { printf '%s  !!%s  %s\n' "$c_yel" "$c_reset" "$*"; }
die()  { printf '%s  xx%s  %s\n' "$c_red" "$c_reset" "$*" >&2; exit 1; }

# sha256sum is GNU coreutils; macOS ships shasum instead. Resolve once.
if command -v sha256sum >/dev/null 2>&1; then
  checksum() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
  checksum() { shasum -a 256 "$1" | cut -d' ' -f1; }
elif command -v openssl >/dev/null 2>&1; then
  checksum() { openssl dgst -sha256 "$1" | awk '{print $NF}'; }
else
  die "No sha256 tool found. Install coreutils, or ensure shasum or openssl is on PATH."
fi

# `date +%s%3N` is a GNU extension. BSD date (macOS) does not understand %N and
# returns the epoch seconds followed by the literal characters "3N", which then
# blows up the arithmetic below and silently aborts the migration loop.
now_ms() {
  local t
  t=$(date +%s%3N 2>/dev/null)
  case "$t" in
    ''|*[!0-9]*) ;;                 # not purely numeric: BSD date leaked a literal
    *) printf '%s' "$t"; return 0 ;;
  esac
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time() * 1000))'
    return 0
  fi
  if command -v perl >/dev/null 2>&1; then
    perl -MTime::HiRes=time -e 'printf "%d", time() * 1000'
    return 0
  fi
  printf '%s000' "$(date +%s)"
}

bootstrap() {
  "${PSQL[@]}" -tAc "
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        runtime_ms integer
    );" >/dev/null
}

applied_checksum() {
  "${PSQL[@]}" -tAc \
    "SELECT checksum FROM schema_migrations WHERE version = '$1'" 2>/dev/null | tr -d '[:space:]'
}

mode="apply"
[[ "${1:-}" == "--status" ]] && mode="status"
[[ "${1:-}" == "--verify" ]] && mode="verify"

bootstrap

printf '\n%sOpen ADMS migrations%s  %s%s%s\n\n' \
  "$c_bld" "$c_reset" "$c_dim" "${DATABASE_URL%%\?*}" "$c_reset"

pending=0
drifted=0

for file in "$MIGRATIONS_DIR"/*.sql; do
  version="$(basename "$file" .sql)"
  sum="$(checksum "$file")"
  have="$(applied_checksum "$version")"

  if [[ -n "$have" ]]; then
    if [[ "$have" != "$sum" ]]; then
      drifted=$((drifted + 1))
      warn "$version checksum drift (applied ${have:0:8}, on disk ${sum:0:8})"
    else
      [[ "$mode" == "apply" ]] && skip "$version"
    fi
    continue
  fi

  pending=$((pending + 1))

  if [[ "$mode" != "apply" ]]; then
    printf '%s  ..%s  %s %s(pending)%s\n' "$c_yel" "$c_reset" "$version" "$c_dim" "$c_reset"
    continue
  fi

  start=$(now_ms)
  if ! "${PSQL[@]}" --single-transaction -f "$file" >/dev/null; then
    die "$version failed. Nothing was committed for this file."
  fi
  elapsed=$(( $(now_ms) - start )) || elapsed=0

  "${PSQL[@]}" -tAc "
    INSERT INTO schema_migrations (version, checksum, runtime_ms)
    VALUES ('$version', '$sum', $elapsed)
    ON CONFLICT (version) DO UPDATE
        SET checksum = EXCLUDED.checksum, applied_at = now(),
            runtime_ms = EXCLUDED.runtime_ms;" >/dev/null

  ok "$version ${c_dim}${elapsed}ms${c_reset}"
done

if [[ "$mode" == "verify" && $drifted -gt 0 ]]; then
  die "$drifted applied migration(s) changed on disk. Add a new migration instead of editing history."
fi

# The loop above can be cut short by a shell-level error without tripping
# `set -e`, which would leave the database half-migrated while this script still
# exited 0. Compare what is on disk against what the ledger recorded, so that
# can never be reported as success again.
if [[ "$mode" == "apply" ]]; then
  on_disk=$(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | wc -l | tr -d '[:space:]')
  recorded=$("${PSQL[@]}" -tAc "SELECT count(*) FROM schema_migrations" | tr -d '[:space:]')
  if [[ "$recorded" != "$on_disk" ]]; then
    die "Only $recorded of $on_disk migration(s) are recorded. The schema is incomplete; do not seed it."
  fi
fi

echo
if [[ "$mode" == "apply" ]]; then
  [[ $pending -eq 0 ]] && log "Schema is up to date." || log "Applied $pending migration(s)."
else
  log "$pending pending, $drifted drifted."
fi
echo

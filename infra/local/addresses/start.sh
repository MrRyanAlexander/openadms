#!/usr/bin/env bash
# Open ADMS local stack: the address server (Nominatim; ARCHITECTURE §3, REQ-022, ADR-282).
# Nominatim keeps its own Postgres inside this container, apart from the evidence database.
# This wrapper does three things before handing over to the image's own start script:
#   1. closes that Postgres to everything outside the container. The image listens on every
#      interface and lets any address in with a password that is printed in its public scripts;
#      Nominatim itself talks to it over the local socket, so nothing needs the network.
#   2. imports the map extract again when it changed (its SHA-256 is kept beside the data);
#   3. never sets a password of ours, so the image's own tracing has no secret to print.
set -euo pipefail

pg_conf=/etc/postgresql/16/main
data=/var/lib/postgresql/16/main
imported="$data/imported-from.sha256"

sed -i -E "s/^listen_addresses[[:space:]]*=.*/listen_addresses = 'localhost'/" "$pg_conf/postgresql.conf"
sed -i -E '/^host[[:space:]]+all[[:space:]]+all[[:space:]]+0\.0\.0\.0\/0/d' "$pg_conf/pg_hba.conf"
if grep -Eq "^listen_addresses[[:space:]]*=[[:space:]]*'\*'" "$pg_conf/postgresql.conf" ||
  grep -Eq '^host.*0\.0\.0\.0/0' "$pg_conf/pg_hba.conf"; then
  echo "Nominatim's own Postgres is still open to the network; not starting." >&2
  exit 1
fi

if [ -f "$data/import-finished" ] && [ "$(cat "$imported" 2>/dev/null || true)" != "$ADMS_MAP_SHA256" ]; then
  echo "The map extract changed (${ADMS_MAP_NAME}): importing it again."
  rm -f "$data/import-finished"
fi

# Written before the import: a run that dies half-way leaves no import-finished, so it starts over.
if [ -f "$data/PG_VERSION" ]; then
  printf '%s' "$ADMS_MAP_SHA256" >"$imported"
fi

exec /app/start.sh

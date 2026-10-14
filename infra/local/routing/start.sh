#!/usr/bin/env bash
# Open ADMS local stack: the routing server (Valhalla; ARCHITECTURE §3, REQ-022, ADR-282).
# Builds the road tiles from the map extract once, and again whenever the extract changes: the
# SHA-256 of the extract the tiles were built from is kept beside them. Then it serves on :8002,
# on its container's loopback alone: Valhalla speaks no TLS, so the only way to it is its own
# Caddy, which shares this container's network and takes TLS on 8443 (KD-78; ADR-517). Only what
# the worker asks is switched on: the nearest road point, a route, and the status.
set -euo pipefail

built=/data/built-from.sha256

# Written afresh on every start, so where it listens is always this file's word.
# No admin or time zone database: neither changes a shortest road distance (ADR-163).
config() {
  valhalla_build_config \
    --mjolnir-tile-dir /data/tiles \
    --mjolnir-tile-extract "" \
    --mjolnir-traffic-extract "" \
    --mjolnir-admin /data/admins.sqlite \
    --mjolnir-timezone /data/timezones.sqlite \
    --loki-actions locate,route,status \
    --httpd-service-listen 'tcp://127.0.0.1:8002' \
    >/data/valhalla.json
}

if [ ! -f "$built" ] || [ "$(cat "$built")" != "$ADMS_MAP_SHA256" ]; then
  echo "Building road tiles from the map extract ${ADMS_MAP_NAME}."
  rm -rf /data/tiles /data/valhalla.json "$built"
  config
  valhalla_build_tiles -c /data/valhalla.json /maps/region.osm.pbf
  printf '%s' "$ADMS_MAP_SHA256" >"$built"
else
  config
fi

echo "Serving routes from the map extract ${ADMS_MAP_NAME}."
exec valhalla_service /data/valhalla.json "${ADMS_ROUTING_THREADS:-2}"

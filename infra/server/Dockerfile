# syntax=docker/dockerfile:1
# Open ADMS on a firm's server: its images, built on the server from the release it holds (the
# user, 2026-10-23; agent_store/BUILD.md, Settled 11). `./adms install` builds them through
# infra/server/compose.yaml; nothing here is run by hand. The build context is the repository's
# root (.dockerignore keeps out every secret, every build's output and an installation's files).
#
# - `setup`: the whole built release, every dependency: the installer's server mode
#   (tools/setup/src/server.ts) runs here, on demand, never as a service.
# - `app`: the API and the worker, their built code and production dependencies alone.
# - `web`: Caddy with the field app's and the back office's minified builds, made for the firm's
#   own API address, and the licence notices.
#
# Lean on purpose (production, the user): no dev dependency, no source map, no test, no story,
# no sample in `app` or `web`. Every image is pinned by tag and digest, as the local stack's are.
ARG NODE_IMAGE=node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2
ARG CADDY_IMAGE=caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b

# --- the release, built -------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /src
ENV CI=true
# pnpm, at the version package.json pins.
RUN corepack enable
COPY . .
# Everything but the documentation site, which no image serves (its build tools never ship).
RUN pnpm install --frozen-lockfile --filter '!@open-adms/docs'
RUN pnpm generate && pnpm exec tsc --build
# Prisma's schema engine, fetched once here (checked against its SHA-256 by the CLI), never at
# the firm's first migration.
RUN cd packages/db && node node_modules/prisma/build/index.js --version
# Every licence of what ships checked against the Apache-2.0 list (`pnpm licences`), and the
# notices written: each package, its version, its licence and its licence's own text.
# A licence refused or not yet decided stops the build, and is named.
RUN pnpm licenses list --prod --json --filter '!@open-adms/docs' > /tmp/licences.json \
  && { node tools/licences/src/index.ts < /tmp/licences.json > /tmp/licences.txt \
    || { grep -v '^allowed' /tmp/licences.txt; exit 1; }; } \
  && node tools/licences/src/notices.ts < /tmp/licences.json > THIRD-PARTY-NOTICES.md

# --- the installer's server mode ----------------------------------------------------------------
FROM build AS setup
ENV NODE_ENV=production
ENTRYPOINT ["node", "tools/setup/src/index.ts"]

# --- the API and the worker -----------------------------------------------------------------------
FROM build AS pruned
# Every dev dependency taken out, from the store the install above filled.
RUN pnpm install --prod --frozen-lockfile --offline --filter '!@open-adms/docs'

FROM ${NODE_IMAGE} AS app
ENV NODE_ENV=production
WORKDIR /srv/open-adms
COPY --from=pruned /src/package.json /src/LICENSE /src/NOTICE /src/THIRD-PARTY-NOTICES.md ./
COPY --from=pruned /src/node_modules ./node_modules
COPY --from=pruned /src/apps/api/package.json ./apps/api/package.json
COPY --from=pruned /src/apps/api/node_modules ./apps/api/node_modules
COPY --from=pruned /src/apps/api/dist ./apps/api/dist
COPY --from=pruned /src/apps/worker/package.json ./apps/worker/package.json
COPY --from=pruned /src/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=pruned /src/apps/worker/dist ./apps/worker/dist
COPY --from=pruned /src/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=pruned /src/packages/contracts/node_modules ./packages/contracts/node_modules
COPY --from=pruned /src/packages/contracts/dist ./packages/contracts/dist
COPY --from=pruned /src/packages/db/package.json ./packages/db/package.json
COPY --from=pruned /src/packages/db/node_modules ./packages/db/node_modules
COPY --from=pruned /src/packages/db/dist ./packages/db/dist
COPY --from=pruned /src/packages/domain/package.json ./packages/domain/package.json
COPY --from=pruned /src/packages/domain/node_modules ./packages/domain/node_modules
COPY --from=pruned /src/packages/domain/dist ./packages/domain/dist
COPY --from=pruned /src/packages/domain/policy.env /src/packages/domain/breached-passwords.txt ./packages/domain/
COPY --from=pruned /src/packages/receipts/package.json ./packages/receipts/package.json
COPY --from=pruned /src/packages/receipts/node_modules ./packages/receipts/node_modules
COPY --from=pruned /src/packages/receipts/dist ./packages/receipts/dist
# The image's own unprivileged `node` user; compose runs it read-only, with no capability.
USER 1000:1000

# --- the web apps ---------------------------------------------------------------------------------
FROM build AS web-build
# The API the pages talk to, the firm's own (https://api.<its domain>): written into each page's
# policy and bundle at build time, so the images are built on the server, after its answers.
ARG ADMS_OFFICE_API_ORIGIN
ARG ADMS_FIELD_API_ORIGIN
RUN test -n "$ADMS_OFFICE_API_ORIGIN" && test -n "$ADMS_FIELD_API_ORIGIN" \
  && pnpm --filter @open-adms/field build && pnpm --filter @open-adms/back-office build

FROM ${CADDY_IMAGE} AS web
COPY --from=web-build /src/apps/field/dist/web /srv/field
COPY --from=web-build /src/apps/back-office/dist/web /srv/office
COPY --from=build /src/LICENSE /src/NOTICE /src/THIRD-PARTY-NOTICES.md /srv/licences/
COPY infra/server/caddy/ /etc/caddy/

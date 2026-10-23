---
title: Commands
description: Every command run from the repository's root - bringing an installation up, the installer, the local stack, the sample projects, the checks and the documentation site.
---

Every command runs from the repository's root, after `eval "$(fnm env --shell zsh)"` (Node 24) and
`pnpm install`.

## On a firm's server

Run from the release's folder on the server, with Docker alone ([Install on a server](/get-started/server/)):

| Command           | What it does                                                                                                                                                                                                                                   |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `./adms install`  | The firm's seven answers, its database and settings, its first admin, every service built and started, checked, and its addresses printed. Once per server; `--port`, `--http-port` and `--bind` listen elsewhere than `0.0.0.0:443` and `:80` |
| `./adms start`    | Start it again, its certificates renewed where they end, then check every part                                                                                                                                                                 |
| `./adms stop`     | Stop it; every record and file is kept                                                                                                                                                                                                         |
| `./adms status`   | Each service's state, every part checked, the addresses                                                                                                                                                                                        |
| `./adms logs`     | Its logs, warnings and errors; `-f` follows, a service's name narrows them                                                                                                                                                                     |
| `./adms admin`    | Make the firm's first admin, or let an admin back in                                                                                                                                                                                           |
| `./adms root`     | The installation's own root certificate, where its addresses use it                                                                                                                                                                            |
| `./adms licences` | The licences of everything it is built on                                                                                                                                                                                                      |

## The test install, on a developer's computer

| Command      | What it does                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm start` | A fresh test installation every time: the one already here cleared (the map data and certificates kept), the installer's five questions, everything built and started, the sample loaded, every part checked, then the addresses, the field app's sign-ins and an offer to follow the logs. `--keep` carries on with the one here; `--no-sample` (`pnpm start:blank`) leaves the sample out |
| `pnpm stop`  | Stop it; its data is kept for `pnpm start --keep`                                                                                                                                                                                                                                                                                                                                           |
| `pnpm logs`  | Follow the API's, the worker's, Caddy's and Postgres's logs (at debug)                                                                                                                                                                                                                                                                                                                      |
| `pnpm ready` | Start the local stack and check the installation, changing nothing                                                                                                                                                                                                                                                                                                                          |

## The installer

| Command                   | What it does                                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm installer`          | First run: five questions (the first admin's among them), the secrets, the database, the sample projects. A rerun checks what it knows, asks to confirm and resume, and never makes a secret twice. Add `--no-sample` to skip the sample projects, `--yes` to answer yes to confirmations |
| `pnpm installer:check`    | Check what it knows; change nothing (exit 1 if something is off)                                                                                                                                                                                                                          |
| `pnpm installer:teardown` | Drop the database and its logins; remove the settings and the installer's record                                                                                                                                                                                                          |
| `pnpm installer:admin`    | Make the firm's first admin, or let an admin back in, on the machine that holds the API's settings                                                                                                                                                                                        |

## The local stack

| Command               | What it does                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm local:up`       | Make the stack's certificates where missing, fetch and check the map extract, build the field app and the back office, start every service, wait until each answers over HTTPS; then build and start the API and the worker once the installer has made their settings |
| `pnpm local:down`     | Stop and remove the containers; the data is kept                                                                                                                                                                                                                       |
| `pnpm local:wipe`     | Down, plus the data volumes, the generated settings and the certificates (the downloaded map extract is kept)                                                                                                                                                          |
| `pnpm local:status`   | Each service and its health                                                                                                                                                                                                                                            |
| `pnpm local:accounts` | Write the dev stack's own accounts (Dana Reyes, Luis Ortega, Bayline County's debris manager) and show how to sign in; `--show` only shows, `--codes` shows each authenticator's code now. Local only, never shipped                                                   |

## Sample projects and stories

| Command                      | What it does                                                                                                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm sample`                | Load the two sample projects into the installation                                                                                                                                  |
| `pnpm scenarios`             | Run the scenario harness: whole projects told as stories, the golden mission among them, each asserting exact statuses, review queues and ledgers                                   |
| `pnpm field:control-tickets` | Make the printable control-ticket test set (`400001`–`400050`, a PDF to print and scan with each phone)                                                                             |
| `pnpm field:try`             | Try the field app's current build by hand, in a world of its own with P1 and P2 set up, in a phone-sized browser; nothing goes into the installation's database. Needs the stack up |

## Checks

| Command          | What it does                                                                                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` | Generate the Prisma client and type-check every workspace                                                                                                                              |
| `pnpm test`      | Type-check, then every Vitest project (the database tests need the stack up)                                                                                                           |
| `pnpm e2e`       | The browser tests                                                                                                                                                                      |
| `pnpm lint`      | ESLint and Prettier, with no warnings allowed                                                                                                                                          |
| `pnpm format`    | Format with Prettier                                                                                                                                                                   |
| `pnpm licences`  | Check every installed package's licence is compatible with Apache-2.0 for what ships                                                                                                   |
| `pnpm security`  | The dependency audit, the secrets scan and the database's grant tests                                                                                                                  |
| `pnpm openapi`   | Generate `apps/api/openapi.json` from the shared contracts                                                                                                                             |
| `pnpm chain`     | The whole verification chain, in order: the stack, the installer's check, install, typecheck, test, scenarios, e2e, security, lint, licences. `pnpm chain <step>` runs the steps named |
| `pnpm clean`     | Remove TypeScript's build output                                                                                                                                                       |

## The documentation site

| Command                                 | What it does                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm --filter @open-adms/docs dev`     | Serve this site locally with live reload                                                             |
| `pnpm --filter @open-adms/docs build`   | Build it to static files in `apps/docs/dist/` and check every link, Markdown twin and llms.txt entry |
| `pnpm --filter @open-adms/docs preview` | Serve the built site                                                                                 |

---
title: Contributing
description: How to contribute to Open ADMS - field knowledge as much as code - the development setup, the workspace's rules, how changes are proven, and where the spec lives.
---

Field experience counts as much as code. A monitor who can describe exactly why a load call gets
disputed, or a data manager who knows which report a reviewer asks for first, is contributing
something a developer can't supply. The full guide is the repository's
[CONTRIBUTING.md](https://github.com/MrRyanAlexander/openadms/blob/main/CONTRIBUTING.md); this page is
the short version.

## Without writing code

- **Describe how the work really goes**: how a contract prices a line, how a site runs its tower,
  what a reviewer asked for. Most of it lands as the firm's own setup (pay items, rules, lists), not
  as code.
- **Describe a real dispute**: a load call argument, a scale receipt that didn't match.
- **Correct the domain**: words, practice that differs by state, county or contract.
- **Try an install** on a machine nobody has tried, and report exactly where it stopped.
- **Improve these docs**: every page has an _Edit page_ link at its foot.

## Development setup

You need Node 24 (through fnm), pnpm 11 (through Corepack) and Docker. Then follow the
[Quick start](/get-started/quick-start/).

## The rules of the workspace

- **Shared code is shared properly**: a workspace package with its own tests, never copied between
  apps or imported from inside another.
- **A rule lives once, in `packages/domain`; a payload once, in `packages/contracts`.**
- **Apps reach the server only through the API**, over HTTPS.
- **The firm's setup decides; hardcode as little as possible.** Before a new ticket type, unit or
  behaviour, check whether projects, names, pay items, rules and lists already express it.
- **Flag, never block.** Nothing after setup refuses field work.
- **Never relax a threshold or a unique constraint to pass a test.** Thresholds are policy.
- **The schema is the source of truth** for every field, enum and model name; schema changes go
  through Prisma migrations, never edits to an applied one.
- **Every screen is translatable and accessible** (WCAG 2.2 AA), and tested in the browser.
- **Names and examples follow the example world** (Gates Disaster Recovery, Bayline County,
  Hurricane Delphine, Coastline Haulers LLC…), never real firms or places.
- A new dependency: an exact version at least seven days old, a licence compatible with Apache-2.0,
  maintained; say why in the commit message.

## Proving a change

Prove each change with the **smallest run that covers it** (one Vitest file, one story, one
Playwright test), then run the whole chain once before you open a pull request:

```bash
pnpm chain
```

It runs, in order: the stack, the installer's check, install, typecheck, test, scenarios, the
browser tests, security, lint and licences. See [Commands](/reference/commands/).

## Where things are explained

- [Architecture](/reference/architecture/): the layers, the write boundary, the workspaces.
- The repository's `spec/` folder: how each part works, step by step, starting at `spec/INDEX.md`.
- The golden mission, `spec/golden/MISSION.md`: one worked mission with every kind of record and its
  exact ledger.

## Licence

By contributing you agree that your contribution is licensed under the
[Apache License 2.0](/licence/).

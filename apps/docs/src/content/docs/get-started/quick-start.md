---
title: Quick start
description: Bring a whole Open ADMS installation up on one machine with one command, over HTTPS, with the two sample projects loaded, and sign in.
---

This brings up everything on one machine: the database, the object store, the road-routing and
address servers, the API, the worker, the back office with the viewer portal, and the field app's
browser build, each at its own HTTPS name under `*.adms.localhost`.

## Before you start

You need:

- **Node 24**, through [fnm](https://github.com/Schniz/fnm) (the repository's `.nvmrc` names the
  version);
- **pnpm 11**, through Corepack;
- **Docker**, with room for the stack's images and the map extract.

## 1. Get the code and install

```bash
git clone https://github.com/MrRyanAlexander/openadms.git
cd openadms
eval "$(fnm env --shell zsh)" && fnm use
corepack enable
pnpm install
```

`pnpm install` refuses any dependency version published less than seven days ago and any install
script the workspace hasn't allowed by name: that is the supply-chain policy, not an error.

## 2. Bring it up

```bash
pnpm start
```

`pnpm start` is the one command. It runs the installer, then starts the local stack:

1. **The installer** asks four questions on a first run: the firm's name, what the firm calls its
   ADMS, whether to send email through the local mail catcher, and the **master passcode** (one per
   firm; it opens phone setup and the supervisor's actions). It then makes the secrets, the database
   and its logins, migrates and hardens the database, and loads the **two sample projects** (a few
   minutes). Run again, it checks what it knows and asks to resume; it never makes a secret twice.
2. **The local stack** makes its own certificate authority and a certificate for every service,
   downloads the pinned map extract once and checks it, builds the field app and the back office,
   starts every service and waits until each answers over HTTPS.

When it finishes it prints where each part answers:

| Part                                  | Address                         |
| ------------------------------------- | ------------------------------- |
| The back office and the viewer portal | `https://office.adms.localhost` |
| The field app (its browser build)     | `https://field.adms.localhost`  |
| The API                               | `https://api.adms.localhost`    |

:::caution[Trust the stack's certificate]
Every hop is HTTPS, locally too. Trust `infra/local/.generated/caddy-root.crt` in your browser (or
your system's keychain) before you open the pages. A phone on the same network needs that root
certificate installed and trusted as well.
:::

## 3. Sign in

The installer creates **nobody who can sign in**. Choose one:

- **The firm's first admin**, as a real installation does it:

  ```bash
  pnpm installer:admin
  ```

  It runs on the machine that holds the API's settings, asks for the admin's name, email address and
  password, and never prints a setting. The admin sets up an authenticator app at their first
  sign-in.

- **The dev stack's own accounts**, for trying things by hand on this machine only:

  ```bash
  pnpm local:accounts          # write them and show how to sign in
  pnpm local:accounts --codes  # the authenticator codes right now, without an app
  ```

  They are three people from the example world: Dana Reyes (admin), Luis Ortega (manager/analyst)
  and Bayline County's debris manager (a read-only viewer). They exist only on a local stack and
  never ship.

## 4. Look round

The sample projects are the example world's mission: **Bayline County ROW, Hurricane Delphine** and
**Bayline County PPDR, Hurricane Delphine**, with their contracts, pay items, rules, sites,
certifications, tickets, flags and ledger. Open the back office and pick a project; then read
[Two field events, one ticket](/concepts/two-field-events/) to see what you are looking at.

## Stop, start again, start afresh

```bash
pnpm local:status   # each service and its health
pnpm local:down     # stop the containers; the data is kept
pnpm local:up       # start them again
pnpm local:wipe     # down, plus the data, the generated settings and the certificates
```

`pnpm installer:teardown` drops the database and its logins and removes the installer's settings,
so the next `pnpm start` runs like a first run. Every command is listed in
[Commands](/reference/commands/).

## Next steps

- [Install an installation](/get-started/install/): what each step sets up, and running it for real.
- [Set up a project](/guides/back-office/set-up-a-project/): your own project, from the client down.

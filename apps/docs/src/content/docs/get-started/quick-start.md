---
title: Quick start
description: Try Open ADMS on your own computer with one command, over HTTPS, fresh every time, with the two sample projects loaded, and sign in.
---

This is the **test install**, for trying Open ADMS on your own computer. For a firm's real work, on
its own server, see [Install on a server](/get-started/server/).

It brings up everything on one machine: the database, the object store, the road-routing and
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

`pnpm start` is the one command, and **it starts fresh every time**: a test installation already
on this machine (its database, its files, its settings) is cleared first, so each run is like the
first install. The downloaded map data and the stack's certificates are kept, so nothing is
rebuilt and there is nothing new to trust. Then:

1. **The installer** asks five questions: the firm's name, what the firm calls its ADMS, whether
   to send email through the local mail catcher, the **master passcode** (one per firm; it opens
   phone setup and the supervisor's actions) and **the firm's first admin** (email address, name,
   password). It makes the secrets, the database and its logins, migrates and hardens the
   database, makes the admin, and loads the **two sample projects** (a few minutes).
2. **The local stack** makes its own certificate authority and a certificate for every service,
   downloads the pinned map extract once and checks it, builds the field app and the back office,
   starts every service and waits until each answers over HTTPS.
3. **Every part is checked**, line by line (the database, its logins and guards, the API, the
   worker, the sample and a monitor's sign-in), with the logs at their most detailed.

When it finishes it prints where each part answers, how to sign in to the field app, and offers to
follow the logs:

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

- **The back office**: as the first admin you named, with their email address and password. They
  set up an authenticator app at their first sign-in.
- **The field app**: the end of `pnpm start` lists the sample's six monitors, each with a Monitor
  ID, a password and that day's work, and the badges to scan. Open the field app, enrol the phone
  (any name, your master passcode), then sign in as one. On a later day, a monitor with no work on
  the board sets the phone up with the master passcode.
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
pnpm stop             # stop it; its data is kept
pnpm start --keep     # bring it back as it was
pnpm start            # start afresh, as a first install
pnpm logs             # follow its logs (Ctrl-C stops following)
pnpm local:status     # each service and its health
pnpm local:wipe       # everything gone, the certificates too
```

Every command is listed in [Commands](/reference/commands/).

## Next steps

- [Install on a server](/get-started/server/): a firm's real installation.
- [Install an installation](/get-started/install/): what each step of the installer sets up.
- [Set up a project](/guides/back-office/set-up-a-project/): your own project, from the client down.

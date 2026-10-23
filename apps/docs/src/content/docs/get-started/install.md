---
title: Install an installation
description: What the installer asks and sets up, how a rerun resumes safely, how secrets are kept, and what a firm's own cloud needs.
---

A firm installs Open ADMS and runs its own **installation**: one organisation, its own database,
its own master passcode. This page explains what the installer does, so you can run it with
confidence and run it again safely. For the shortest path, see the [Quick start](/get-started/quick-start/).

## Where an installation runs

| Environment            | What runs                                                                                                                                                                                | HTTPS                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Local**              | One Docker Compose stack: Postgres, an S3-compatible object store, the API, the worker, Valhalla (road routing), Nominatim (addresses) and Caddy, with the web apps served through Caddy | The stack's own certificate authority; names under `*.adms.localhost`; every hop inside the stack over TLS too |
| **A firm's own cloud** | The same containers, on the firm's servers                                                                                                                                               | The firm's certificates                                                                                        |

Everything runs and is tested locally, over HTTPS, before anything moves to a cloud. A firm's own
cloud is documented, not scripted: it runs the same containers with its own certificates, secret
store and backups.

## The installer

```bash
pnpm installer          # the questions on a first run; a check and a resume after
pnpm installer:check    # check what it knows, change nothing (exit 1 if something is off)
pnpm installer:teardown # drop the database and its logins, remove its settings and its record
```

`pnpm start` runs `pnpm installer` and then `pnpm local:up`.

### A first run

The installer asks four questions:

1. **The firm** that runs this installation (its name).
2. **What the firm calls its ADMS**, shown across the back office (it defaults from the firm's name;
   About still says which Open ADMS release it is built on).
3. **Email through the local mail catcher** (dev only). Email is optional: without it, an admin
   resets people's passwords.
4. **The master passcode**: one per firm. It opens phone enrolment and setup and the supervisor's
   actions on a phone. A passcode that is too short, too long or on the list of known breached
   passwords is refused; only its slow hash is kept, in the database.

It then confirms and:

- generates every secret and writes each service's settings to its own git-ignored env file,
  created once and never replaced;
- creates the database and **a login role per service** (the API, the worker, read-only), so the
  database itself enforces who may write what;
- runs the migrations and the database's hardening (roles, grants, constraints, triggers);
- seeds the firm's lists (program types, debris types, payable types, reasons and the rest; see
  [Lists](/reference/lists/));
- loads the **two sample projects**, unless you add `--no-sample` (`pnpm sample` loads them later).

### A rerun

Run again, the installer **checks that what it remembers is still true** (the database answers,
migrations are at head), shows you what it knows, and asks whether to resume. It never asks again
for what it already knows except to confirm it, **never prints a secret**, and **never rotates its
secrets** on a resume. After `pnpm installer:teardown`, the next run behaves like a first run.

Add `--yes` to answer yes to its confirmations in a scripted run (a first run still needs its four
answers, one per line on standard input).

## The first admin

The installer seeds **nobody who can sign in**. Make the firm's first admin on the machine that
holds the API's settings:

```bash
pnpm installer:admin
```

It asks for the admin's email address, their name and a password, prints no setting, and works only
on that machine, never over the API. The same command lets an admin back in when no other admin can.
Admins and managers/analysts must set up an authenticator app at their first sign-in.

## Secrets and backups

- Secrets are generated at setup, stored outside the repository (git-ignored env files locally, the
  provider's secret store in a cloud) and never logged or echoed.
- Each service has **its own database login**.
- The token signing keys and the master passcode's verifier are secrets too.
- **Evidence is kept indefinitely**, so the database needs automated backups with point-in-time
  recovery where the host offers it, and the object store needs versioning or replication. Restores
  are rehearsed.
- **Phones are never backed up**: their store is encrypted and holds only the work not yet synced.

## Built-in defaults and project settings

Thresholds are **policy**, never numbers in code. A release ships its built-in defaults in
`packages/domain/policy.env`; a project starts from them and the firm changes what its contract
needs, on the project, audited. See [Configuration](/reference/configuration/) for every setting by
name.

## Next steps

- [Set up a project](/guides/back-office/set-up-a-project/)
- [Security](/security/): how sign-in, sessions and the database are protected

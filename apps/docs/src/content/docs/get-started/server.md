---
title: Install on a server
description: Run Open ADMS for real work on the firm's own Linux server, with Docker alone, and get back its addresses.
---

A firm runs Open ADMS on **its own server**: one Linux machine (a cloud VM or one in its office)
with Docker. The install builds everything on that server from the release, asks the firm's
answers, starts with **no data**, and ends by printing the addresses the firm's people use.

For trying Open ADMS on your own computer, with the sample projects, use the
[Quick start](/get-started/quick-start/) (`pnpm start`) instead.

## Before you start

- **A Linux server** with [Docker Engine and its Compose plugin](https://docs.docker.com/engine/install/).
  Nothing else: no Node, no database, no web server. 4 CPUs, 8 GB of memory and 50 GB of disk suit a
  county-sized region (the map data for a large state needs more).
- **A domain** for it, such as `adms.yourfirm.com`, with three DNS records pointing at the server:
  `office.`, `field.` and `api.` under it.
- **Ports 80 and 443 open** to the internet, so Let's Encrypt can issue the certificates. A server
  on a private network can use the installation's own certificates instead (the install asks).
- **A mail server** the installation may send through (optional): password resets and the daily
  report.

## Install

```bash
git clone https://github.com/MrRyanAlexander/openadms.git
cd openadms
./adms install
```

It builds the installer's image, then asks **seven questions**:

1. **The firm** that runs this installation.
2. **What the firm calls its ADMS**, shown across the back office and on the phones.
3. **The domain**: the back office answers at `office.<domain>`, the field app at `field.<domain>`,
   the API at `api.<domain>`.
4. **Certificates**: Let's Encrypt's, where the internet reaches the server (it asks for an address
   to write to about them); otherwise the installation's own root, which each browser and phone
   trusts once (`./adms root` prints it).
5. **Email**: the mail server's address with its login (`smtps://user:password@host:465`), and the
   address mail comes from; or none, and an admin resets people's passwords.
6. **Map data** for the firm's region: an OpenStreetMap extract (`.osm.pbf`) from
   [download.geofabrik.de](https://download.geofabrik.de), for road miles and address lookup. It
   is downloaded once and pinned by its SHA-256.
7. **The master passcode**: one per firm. It enrols the monitors' phones and opens the supervisor's
   actions on a phone.

Then it sets the database up (a login for each service, the migrations, the database's own
guards, the firm's lists), writes each service's settings, builds the web apps for the firm's
addresses, and asks for **the firm's first admin**: their email address, name and password. They
sign in to the back office and set everything else up, the firm's own clients, contracts and
projects first. Last, it starts every service, checks each one, and prints the addresses:

```text
✓ the database answers, and the API's login opens it
✓ the migrations are at head
✓ the API answers over TLS (200)
…
Gates Disaster Recovery on this server:
  the back office and the viewer portal  https://office.adms.yourfirm.com
  the field app                           https://field.adms.yourfirm.com
  the API                                 https://api.adms.yourfirm.com
```

The first start builds the map data from the extract: from a few minutes for a small state to an
hour for a large one.

## Run it

| Command           | What it does                                                                     |
| ----------------- | -------------------------------------------------------------------------------- |
| `./adms start`    | Starts it again, its certificates renewed where they end, then checks every part |
| `./adms stop`     | Stops it; every record and file is kept                                          |
| `./adms status`   | Each service's state, every part checked, the addresses                          |
| `./adms logs`     | Its logs (warnings and errors); `./adms logs -f api` follows the API's           |
| `./adms admin`    | Makes the firm's first admin, or lets an admin back in when no other admin can   |
| `./adms root`     | The installation's own root certificate, where its addresses use it              |
| `./adms licences` | The licences of everything it is built on (also at `office.<domain>/licences/`)  |

## What it is, on the server

- **Lean**: the images hold the built code and its production dependencies alone; the web apps are
  minified; the API and the worker log warnings and errors only.
- **Empty at the start**: no sample, no test database, no account but the admin the firm made.
- **Only Caddy is reachable** from outside, on ports 80 and 443. The database, the file store and
  the map servers answer on the installation's own network alone, and every hop inside it is over
  TLS from the installation's own root.
- **Secrets stay on the server**, each in a Docker volume of its own, readable by the one service
  that needs it. Nothing prints one.

## Backups

Evidence is kept indefinitely, so back up the two volumes that hold it, `open-adms_pg_data` (the
database) and `open-adms_objectstore_data` (photos and files), and the setup's own volume,
`open-adms_setup_state` (the secrets that open them). Rehearse a restore.

# Open ADMS — Architecture and Security

> **Status: approved by the user, section by section, 2026-09-25/26** (ADR-043, ADR-103, ADR-104,
> ADR-139, ADR-143, ADR-144): **every section, in full**. Written 2026-09-25 from the
> user's decisions (ADR-093…112) and the agent's engineering proposals. **No code is written
> against a section until it is marked ✅ Approved.**
>
> | Approved (ADR-104, ADR-139, ADR-141, ADR-143, ADR-144) | Waiting |
> |---|---|
> | **Every section, §1–§18**, each with the blocks inside it: §3's stack table, routing (ADR-119) and project boundary and zones (Q-134, ADR-141); §5 (ADR-113); §7 with §7.2's five safeguards; §3 disposal site areas (Q-136, ADR-144); §17 (informational) | Nothing |
>
> | Mark | Meaning |
> |---|---|
> | ✅ **Decided** *(ADR-xxx)* | The user said so. Build to it |
> | ⚠️ **PROPOSED** | The agent's engineering recommendation. Needs a yes/no |
> | ❓ **Q-NN** | Waiting on the user's answer (`spec/QUESTIONS.md`) |
>
> **What this chapter is.** `spec/INDEX.md` and the part pages say *what* Open ADMS does. This
> page says *how it's built and secured*: every layer, what it owns, how the layers connect, and
> the security rules each must meet. The domain skills still own every domain rule. If this page
> and a skill disagree on behaviour, the skill wins: log a KD.

---

## 1. Principles

✅ **Approved** *(ADR-093, user 2026-09-25)*

1. **Security first, at every layer.** Best current practice and published standards (§16) apply
   to the install, the database, the API, the worker, storage, the devices and both web apps.
2. **The plan is the core; code is historical.** The skills, the spec and the ADRs define Open
   ADMS. The code in `database/` was early scaffolding. It is not a base to extend, and the
   reconciliation engine is rebuilt from scratch. Nothing is ported from Build 1 (§17).
3. **One firm per installation.** A firm installs and runs its own copy (ADR-063).
4. **Offline is the normal case** in the field. Only device setup needs a connection, and a sync
   needs one to happen (ADR-030, ADR-095).
5. **The database is the last line of defence.** Rules that protect the record are enforced by
   Postgres itself (roles, grants, constraints, triggers), not only by application code (ADR-097).
6. **Local first, then the cloud.** Everything runs and passes locally, over HTTPS, before any
   cloud deploy (ADR-004, ADR-099).
7. **Design before code.** Every workflow is a scenario that runs in a terminal before it has a
   screen (§15), because Build 1 was proved by clicking and wasn't designed (`FROM-BUILD-1.md` §14).

---

## 2. The system, layer by layer

✅ **Approved** *(shape)* — built on ✅ ADR-093/094/097

```
  FIELD (offline all day)                      THE FIRM'S OWN CLOUD (or a laptop, for local testing)
 ┌─────────────────────────┐                  ┌──────────────────────────────────────────────────┐
 │ Field app on a set-up   │   sync (HTTPS)   │  API                        Worker                │
 │ iPhone / Android        │ ───────────────▶ │  • device sync endpoints    • reconciliation      │
 │ • encrypted local store │ ◀─────────────── │  • back-office endpoints    • pricing / ledger    │
 │ • number block          │   manifest,      │  • read-only portal         • repricing jobs      │
 │ • printer, scanner      │   number blocks  │  writes: evidence + config  • media processing    │
 └─────────────────────────┘                  │           │                 writes: derived only   │
                                              │           ▼                        ▼             │
 ┌─────────────────────────┐                  │  ┌──────────────────────────────────────────┐    │
 │ Back office (web)       │ ──── HTTPS ────▶ │  │ PostgreSQL — the source of truth         │    │
 │ Read-only portal (web)  │                  │  │ roles · grants · constraints · triggers  │    │
 └─────────────────────────┘                  │  │ audit written by the database itself     │    │
                                              │  └──────────────────────────────────────────┘    │
                                              │  Object storage (S3-compatible): photos, docs     │
                                              └──────────────────────────────────────────────────┘
```

### Who writes what: the write boundary

The one boundary that matters is **who may write which kind of record**. The database enforces
it with a login role per service (§5).

| Kind of record | Examples | Written by | Never written by |
|---|---|---|---|
| **Evidence** (what a monitor saw) | field events (collection, disposal, haul-out collection and disposal, unit rate), forms, incidents, photo metadata, time-clock entries | the API: device sync (insert), and back-office corrections (update, audited) | the worker, except the reconciliation columns (`reconStatus`, notes, time) |
| **Configuration** | clients, declaration events, projects, contracts, pay items, rules, sites, certifications, users, devices, assignments | the API (back office), audited | the worker |
| **Derived** | the completed load and haul-out (`CompletedLoad` / `CompletedHaulOut`), transactions, flags, reconciliation runs | **the worker only** | the API, any person (invariant 4) |
| **Audit** | `AuditRecord` | **the database's own triggers only** | anyone directly, ever |

A person never writes a derived record. Correcting evidence queues a reprocess, and the worker
decides again (ADR-086).

> **Words, ADR-236/237/246 (2026-09-29; no rule in this section changes):** the evidence rows of a
> ticket are its **field events** (`FieldEvent`); the derived records are conclusions drawn from
> them. Event-driven, not event-sourced: corrections stay in place, audited (ADR-051). The marks
> people set on a derived record (QC status, the invoice lock, a flag's acceptance) are their own
> records written by the API, so the API still never writes a derived row (ADR-245).

---

## 3. The stack

✅ **Decided** *(ADR-094, user 2026-09-25)*: **one language, TypeScript on Node**, end to end:
device, API, worker, web apps and shared rules. **Prisma** for the database: readable,
object-style models, a schema split into several files that together produce the migrations,
and no hand-written SQL for ordinary modelling. The user leans towards class-style code, where
you can look at one object and see what it is and what it does.

Why one language: the field app has to run JavaScript on the phone, and some rules must give the
**same answer on the phone and on the server**, for example capacity math (§3A.3), the load-call
volume shown to the monitor, and number-block arithmetic. One shared TypeScript package gives
one implementation. With two languages, every rule is written twice and can drift.

| Concern | ✅ **Approved** choice | Why | Alternatives considered |
|---|---|---|---|
| Runtime | Node.js, current LTS, pinned | One runtime for API, worker, tooling | — |
| Database | PostgreSQL (current major), pinned | Relational truth, roles, triggers, row-level security | — |
| ORM / migrations | **Prisma**, multi-file schema folder (generally available since Prisma 6.7, carried into Prisma 7 via `prisma.config.ts`; pin the version at scaffold) | User preference (ADR-094); reviewed against the alternatives in §5.6 | Drizzle, TypeORM, Atlas |
| Validation / contracts | **Zod** schemas in one shared package, used by device, API and web; OpenAPI generated from them | One definition of every payload | — |
| API framework | **NestJS** on the Fastify adapter | Class-based modules, controllers, services and guards match the user's preferred style; built-in guards and pipes suit auth and validation | Plain Fastify (lighter, less structure) |
| Background jobs | A **Postgres-backed job queue** (e.g. pg-boss) | No extra infrastructure; jobs are transactional with the data | Redis-based queues (adds a service) |
| Web apps | **React + Vite**, TypeScript | Widely known; one toolchain for both web apps and the field app | — |
| Field app | The same React code, wrapped with **Capacitor** for iPhone and Android; a plain browser build for testing | Native camera, secure storage, Bluetooth printing on iOS (§12) | Fully native apps (two codebases); PWA only (can't print on iPhone) |
| Local device store | Encrypted SQLite on the phone (SQLCipher, e.g. the community Capacitor SQLite plugin); IndexedDB with WebCrypto in the browser test build | Encrypted at rest (§8) | — |
| Object storage | Any **S3-compatible** store; for local runs, a container chosen at scaffold after checking its licence and maintenance status | Photos never go in the database | — |
| Local HTTPS | **Caddy** as the reverse proxy with its internal certificate authority | HTTPS locally with no manual certificates (§4) | mkcert + nginx |
| Geodesic math | One TypeScript module using Karney's algorithm (e.g. `geographiclib-geodesic`, the method geopy uses) | ADR-005: geodesic only, one home | PostGIS geography (reconsider when maps arrive) |
| Tests | A TypeScript test runner, the scenario harness (§15) and a browser end-to-end tool (e.g. Playwright) | Local first | — |

| Road routing and addresses | ✅ **Valhalla** (road mileage) and **Nominatim** (address lookup), each its own self-hosted server with OpenStreetMap data for the project's region (ADR-119) | Mileage on every load is the road route, not a straight line (ADR-110) | OSRM (faster, but fastest-by-time and hand-built truck rules) |

### Road distance and addresses

✅ **Decided** *(ADR-110, user 2026-09-25)*:
- **Every load and haul-out uses a mileage.** It is **not a straight line**. It is the road
  distance of the **shortest legal route** from the collection's end GPS to **the disposal site's
  own GPS**, entered with the site (ADR-208; it once said the disposal's end GPS).
- The volume is large. For example, a firm with 40 active projects, each with 50–100 people making
  load tickets.
- **We run our own routing server with OpenStreetMap data**, as a separate service. On the Railway
  demo that makes three services: database, API (with the worker), routing.

✅ **Decided** *(ADR-163, user 2026-09-27, Q-155)*: **how the route is found.**
- "Legal" means **public roads open to ordinary traffic**, not private roads; there is **no truck
  size** or truck profile.
- **Start at the nearest road.** The worker takes the point on a road nearest the collection's end
  GPS (a straight line from the GPS to the road), looks up that point's address (Nominatim), and
  routes from there to the disposal site's own GPS (ADR-208). The address is kept with the mileage.
- **No route found** → mileage is the **straight-line** (geodesic) distance from the collection's end GPS
  to the site's GPS, flagged "no road route found; straight-line distance used".
- Always the truck's road trip, never distance over water. A split's mileage is **per property**,
  from each collection's end GPS (ADR-162).

✅ **Approved** *(ADR-119, Q-114)*: **Valhalla** and **Nominatim**, separate servers we run. The
reasoning, kept for the record:
- **Neither PostGIS nor hand-written haversine math can do this.** Both measure a straight line
  over the earth. Road distance needs a routing engine working over the road network. (A
  straight-line geodesic distance is still used for the disposal-site proximity check, ADR-005.)
  PostGIS has a routing add-on (pgRouting), but running routes inside the database that holds the
  evidence is slower and loads the wrong server. **PostGIS isn't needed now**; reconsider it when
  zone polygons and maps arrive (reconsidered below: still not needed).
- **Which engine.** Both OSRM and Valhalla are free, open source and self-hosted from an OSM
  extract of the project's state or region:

  | | OSRM | Valhalla |
  |---|---|---|
  | Speed | Fastest (a precomputed graph) | Fast |
  | "Shortest" route | Default is **fastest by time**; shortest by distance needs a custom profile and a rebuild | A per-request option (`shortest`) |
  | Trucks | Truck rules (weight, height) must be hand-written in its Lua profile | Built-in truck costing: weight, height, length, axle load, set per request |
  | Memory | High for big regions | Lower (tiled graph) |

  **Chosen: Valhalla**, because "shortest route" is a per-request option (ADR-163 later dropped
  the truck size, so no truck costing is used).
- **Addresses need a different tool.** A routing engine gives the **street name** nearest a point
  (OSRM's "nearest" service), not a house number. The address step in Q-104 ("get address info")
  needs a **reverse geocoder**: **Nominatim** (self-hosted, OSM data, its own database kept apart
  from the evidence database). The phone asks our API, and the API asks Nominatim. Offline, the
  monitor types street number and name (ADR-111).
- **When it runs.** The **worker** computes each load's mileage once, at reconciliation, before
  pricing. A phone never does. It stores the distance **with the map data's date**, so a later map
  update never silently changes a billed mileage. It recomputes only when the collection's end GPS or the site's GPS is corrected (ADR-208).
- **Load.** At 100k routes a day, a routing engine answers each in milliseconds. The size to plan
  for is the map extract's memory, not the request rate.

### Project boundary and zones

✅ **Decided** *(ADR-135, ADR-136, user 2026-09-26)*:
- **Every ticket can carry a zone. No monitor records it:** reconciliation attaches it to the
  ticket.
- **Each project has a boundary.** The user's picture: an Esri map on a private server, the shapes
  built in ArcGIS Pro. **Each end GPS, or a unit rate ticket's GPS, is tested against it.** A
  collection outside it is flagged (this replaces the old 5 km route check).
- A disposal's end GPS is checked against its **site's area**, round the site's GPS entered when the
  site is added (standard circle or advanced shape, ADR-142, below).
- "Keep our version simple while still being able to plug into an Esri setup."

✅ **Approved** *(Q-134)*:
- **What's stored.** A **project map**: the **boundary** (one or more polygons) and optional
  **zones** (named polygons). Kept in the database as GeoJSON geometry in longitude/latitude
  (WGS84), with a bounding box, as **map versions**: each import is a new version with its date, who
  loaded it and where from (the file name, or the Esri layer's address). A version is never edited
  or deleted. The file as uploaded is also kept in object storage (§11).
- **Getting shapes in** (back office only):
  1. **Upload** a zipped shapefile (`.shp`, `.shx`, `.dbf`, `.prj`), GeoJSON or KML: what ArcGIS
     Pro, QGIS and Google Earth export. A shapefile in projected coordinates (e.g. State Plane, read
     from its `.prj`) is converted to longitude/latitude at import.
  2. **Link an Esri feature layer** (ArcGIS Enterprise on the firm's own server, or ArcGIS Online).
     The API reads it through Esri's standard REST query, asking for GeoJSON in WGS84, and stores
     that copy as a version. **"Refresh from Esri"** takes a new one; nothing changes behind the
     firm's back. A token for a secured layer is a secret (§4).

  Either way, the admin picks the field holding the zone name (e.g. `ZONE_NAME`). The import checks
  every shape is a valid polygon and shows what it found on a map ("1 boundary, 3 zones: North,
  South, Beach") before saving.
- **The check.** One TypeScript module in the domain package, next to the geodesic math (ADR-005):
  point-in-polygon on longitude/latitude, where a point on an edge counts as inside. **The worker**
  runs it at reconciliation, before the rules, as it does mileage (§13):
  - a collection's end GPS, and a unit rate ticket's GPS, against the boundary, then the zones;
  - outside the boundary → flagged; inside the boundary but in no zone → zone empty, flagged;
  - disposals and both ends of a haul-out are checked against their **sites**, not the boundary, so
    a load's zone is its collection's zone.

  The zone and the map version used are stored on the ticket's reconciliation fields (§2: the
  worker writes only those). The phone never runs the check and never carries the map.
- **A new map version is treated like a rule change** (ADR-090): every ticket not yet locked as
  invoiced is reprocessed with it; a locked ticket keeps the zone it had.
- **Why not PostGIS** (reconsidered, as the road-distance note promised): still not needed. Testing
  a point against a few hundred polygon corners takes microseconds in memory. The rule stays in the
  tested domain package (no business logic in the database, ADR-113), and the evidence database
  needs no extension. Reconsider if the back office needs map queries at scale (Phase 4 maps).
- **Esri.** GeoJSON in WGS84 is what ArcGIS's REST API, ArcGIS Pro and QGIS all read and write, so a
  firm with an Esri server links its layer and a firm without one uploads a file. Tickets can later
  be exported the same way for ArcGIS (Phase 5 reports).
- **Libraries** (each pinned by an ADR at scaffold, after checking licence and maintenance): e.g.
  Turf's point-in-polygon, a shapefile reader, and proj4 for converting coordinates.

#### Disposal site areas

✅ **Decided** *(ADR-142, user 2026-09-26)*: each site's area is one of two:
- **Standard:** a circle round the site's GPS. The size is built in (200 m, `DISPOSAL_SITE_PROXIMITY_M`)
  and changed in the **project's GIS settings**.
- **Advanced:** the site's own shape, like the boundary: drawn on the map in Open ADMS, or from a
  shapefile.

A disposal whose end GPS is outside its site's area is flagged, never refused.

✅ **Approved** *(Q-136, ADR-144, user 2026-09-26: "Approved 1–6")*:
- **One circle size per project**, audited when changed; a site that needs something else uses a
  shape. The circle check is the geodesic distance to the site's GPS (ADR-005); the shape check is
  the same point-in-polygon as the boundary.
- **Drawing in the back office** for site shapes, and for the project boundary and zones too (for a
  firm without ArcGIS). A drawn shape is saved as a new version, like an import, and anything drawn
  can be **downloaded** as a zipped shapefile or GeoJSON for ArcGIS Pro.
- **Our own base map** behind the drawing: a map file of the project's region (OpenStreetMap data,
  e.g. a single PMTiles file) kept in object storage and shown with a web map library (e.g.
  MapLibre GL JS with a drawing plug-in). No outside map service and no account key, the same stance
  as Valhalla and Nominatim.
- **Haul-outs:** both ends against their own sites' areas.
- **Changes are kept and reprocess:** a new circle size or site shape is dated and kept; tickets at
  that site not locked as invoiced are reprocessed (as a new map version, ADR-141).

**Python** isn't part of the core. If a later feature is easier in Python (for example a report
renderer), it runs as a separate tool that reads through the API and never writes to the database.

Every dependency is pinned. Adding one needs an ADR (ADR-093), and the lockfiles are committed.

---

## 4. Environments and install

✅ **Decided** *(ADR-099, user 2026-09-25)*:
- **Local first.** Every piece runs on one machine for development and testing, then moves to
  the cloud.
- **A firm runs Open ADMS in its own cloud**, on its own servers. Devices sync
  whenever they have a data connection.
- **Railway (API, worker, database) + Netlify (web apps)** is the one deploy target we ship,
  as the demo and for development testing. Firms can extend it to host wherever they like; we make
  the demo case work and document it.
- **Services talk to each other over HTTPS, locally too.** CORS is handled properly, never
  switched off (§6).

✅ **Approved** — how:

| Environment | What runs | HTTPS | Notes |
|---|---|---|---|
| **Local** | One `docker compose` stack: Postgres, object storage, API, worker, Valhalla, Nominatim (§3), Caddy; web apps served through Caddy | Caddy's internal CA; hostnames under `*.adms.localhost` | A phone on the same network needs Caddy's root certificate installed and trusted, or a tunnel |
| **Demo cloud** | Railway: Postgres, API with worker, Valhalla, Nominatim; Netlify: back office and field web build; an S3-compatible bucket | Provider certificates; HSTS on | The back office calls the API **through a same-origin proxy path** (e.g. `/api/*` rewritten to the API), so browser cookies stay first-party and CORS isn't needed for it |
| **A firm's cloud** | The same containers | The firm's certificates | Documented, not scripted |

**The installer** (`pnpm installer`; `pnpm setup` is pnpm's own command, ADR-266): an interview that writes local configuration, generates
secrets, creates the database roles, runs migrations and hardening, and seeds. It follows the
user's rule: *"If I run teardown then setup should run like a new run. If I already ran setup it
should run like it is restarting from before, knowing the state, not asking me for things it
already knows except to confirm what it knows is truthful and to ask if I want to resume."*
(`FROM-BUILD-1.md` §12).
- It checks that what it remembers is still true (the database answers, migrations are at head).
- It never prints a secret or a database password.
- It never rotates its secrets (such as the token signing keys) on a resume.

**Secrets:**
- Generated at setup, stored outside the repo (git-ignored env files locally, the provider's
  secret store in the cloud), and never logged or echoed.
- **Each service gets its own database login** (§5).
- The token signing keys and the master passcode verifiers (§7) are secrets too.

**Backups (server, not device):** evidence is kept indefinitely (ADR-101), so the database needs
automated backups with point-in-time recovery where the host offers it, and the object store needs
versioning or replication. Restores are rehearsed. **Devices are never backed up** (§8).

---

## 5. The database: hardening, and what it enforces by itself

✅ **Approved 2026-09-25** *(ADR-097, ADR-113, Q-92)*: the database enforces strict rules itself,
with the mechanisms below, written as reviewed and tested guard migrations (§5.6).

### 5.1 Roles and grants: least privilege

| Login role | Used by | May do |
|---|---|---|
| `adms_owner` | migrations and the installer only; **never a running service** | Owns the schema |
| `adms_api` | the API | `SELECT` broadly; `INSERT` evidence, sync and quarantine records; `INSERT`/`UPDATE` configuration; `UPDATE` evidence **for audited corrections**; **no** access to derived tables beyond `SELECT`; **no** `DELETE` anywhere |
| `adms_worker` | the worker | `UPDATE` **only** the reconciliation columns on evidence (column-level grants); `INSERT`/`UPDATE` completed loads and haul-outs, flags and runs; `INSERT` transactions, and `DELETE` them **only** through the regeneration path (§5.3) |
| `adms_readonly` | reporting and the read-only portal's queries | `SELECT` on views, filtered by project with row-level security (§5.5) |

Nobody gets `TRUNCATE`, `DROP` or schema-changing rights except `adms_owner`. A test asserts every
grant (§15): for example, that `adms_api` cannot insert a `CompletedLoad`.

### 5.2 Nothing is hard-deleted

- No runtime role has `DELETE` on operational tables.
- A `BEFORE DELETE` trigger refuses deletes there anyway, except on `Transaction` (§5.3).
- Archive, close and void are updates, and are audited (invariant 1).

### 5.3 Audit is written by the database, and can't be forged or edited

- **Every insert and update on a tracked table is captured by a trigger**, which writes an
  `AuditRecord` with:
  - the prior value, the new value and the fields that changed;
  - who made the change, and on which device;
  - the source (device, back office or system), the reason and the request ID.
- The API and the worker **start every write transaction by stating the actor** (a transaction-local
  setting), through one shared Prisma client extension. **A write with no actor is refused**, so an
  unattributed change is impossible, not merely a bug.
- `AuditRecord` has **no** grants for any runtime role except `SELECT`. Only the capture trigger
  (running with the owner's rights) inserts. A trigger also refuses any `UPDATE` or `DELETE` on it.
  *Append-only, absolutely* (ADR-007/085).
- **Regenerating transactions** (ADR-085): a `BEFORE DELETE` trigger on `Transaction` copies the
  whole row into `AuditRecord` before the row goes, so the "copy it first" rule can't be skipped.
  It also refuses the delete if the ticket is **locked as invoiced** (ADR-090).
- Audit entries carry a domain (security · billing · operations · records) so a billing reviewer
  isn't reading login attempts.

### 5.4 Constraints carry the rules

- One field event per **project + workflow + bare number + split suffix + kind** (ADR-062, 236).
- Unique links from a completed load or haul-out to its field events (invariant 17).
- Load call a whole number 0–100 (a 0 is accepted and flagged, ADR-116).
- Both-or-neither split fields.
- Foreign keys everywhere.
- Coordinates as decimals, never floats (ADR-005).
- Check constraints for closed value sets.

**Never relaxed to pass a test.**

### 5.5 Row-level security for read-only viewers

Clients, contractors and auditors see **only their own projects** (ADR-050). The API enforces it,
and row-level security on the `adms_readonly` views enforces it again, keyed on the viewer's
project list set for each request (defence in depth).

✅ **Decided** *(ADR-169, user 2026-09-27, Q-161)*: **what they see inside a project.** Clients and
auditors: the whole project except personal phone and licence numbers. A contractor: **only its own
tickets and transactions** (a prime with its subs'), never another prime's. Monitors' phone numbers:
admins only. Row-level security keys on the viewer's contractor as well as their projects.

### 5.6 How the guards get into the database — ✅ approved (ADR-113, Q-92)

The user asked:
- whether "Prisma plus some SQL" is really the best long-term approach;
- what a senior developer would do from a blank slate;
- whether something supersedes Prisma.

**What the research found:**
- **Roles, grants, triggers and row-level security are Postgres features.** Every tool that
  manages them either writes SQL or generates it. No ORM removes it.
- **Prisma** declares models, relations, indexes and enums, and generates migrations. It **can't
  declare** triggers, functions, roles or row-level security. Its documented route for those is
  a customised migration: `prisma migrate dev --create-only`, then add the SQL. The multi-file
  schema has been generally available since Prisma 6.7 and carries into Prisma 7.
- **Drizzle** can declare **roles and row-level-security policies in TypeScript**, and drizzle-kit
  writes them into migrations. It **still can't declare triggers or functions**, so those stay
  SQL. Its tables are function calls (`pgTable(...)`), and its query builder reads close to SQL.
- **Atlas** (schema-as-code) can merge a Prisma schema and SQL objects into one diffed migration
  plan, but its row-level-security and trigger support is in the **paid Pro tier**. That's wrong for
  a free, self-installed product.
- **Build 1's plan** (the user's Prisma diagram) re-applied a `sql/` folder after every migrate. It
  held 56 functions, 28 triggers and 28 views, because the billing engine and the certification
  math lived in SQL.

**✅ Approved: the blank-slate answer:**
1. **No business logic in the database.** Pricing, capacity math, reconciliation and time rules
   live in the TypeScript domain package. There they are readable, tested, and shared with the
   phone. That is what made Build 1's SQL big, and it's the part to avoid.
2. **The database holds only the guards**: the few rules that must hold even if application code
   is wrong. These are roles and grants, no deletes, audit capture with a required actor,
   append-only audit, the transaction-delete copy, row-level security for viewers, and
   constraints. That's about six small files, written once and rarely changed.
3. **Guards go in the normal migration history**, created with `--create-only`, reviewed, and
   proven by the database tests (§15). Not a separate folder re-applied after each migrate: one
   ordered history is easier to audit, and nothing drifts.
4. **Keep Prisma.** Nothing replaces it for what was asked: readable class-like models, a
   multi-file schema, generated migrations, and no SQL in day-to-day work. Switching to Drizzle
   would move roles and policies into TypeScript, but triggers still need SQL, and its code reads
   closer to SQL. It moves about a third of the SQL, not all of it.

**The rule now** (ADR-113): *never edit a generated or applied migration; database guards are written
as their own migration (created with `--create-only`), reviewed, and tested.* The guard hook blocks
every edit of a migration file and allows a write only while the file is still Prisma's empty stub.

### 5.7 Connections

- TLS to the database in every non-local environment.
- A separate credential per role.
- Pool limits, and a statement timeout.

---

## 6. The API: hardening

✅ **Decided**:
- HTTPS everywhere.
- CORS handled correctly, not disabled (ADR-098).
- Monitors never choose pricing, and the server never accepts money from a client (VISION §5.7).
- ✅ **Two-step sign-in and email** *(ADR-170, user 2026-09-27, Q-162)*: an authenticator-app code
  is **required** for admins and managers/analysts, **optional** for read-only viewers; monitors are
  unchanged (the phone is their protection). **Email is optional**: the installer sets it up if the
  firm has a mail server; otherwise an admin resets passwords. **Local development must work with
  both**: a local mail catcher and seeded dev accounts with known authenticator secrets, in the dev
  stack only, never in a shipped build.

✅ **Approved**

| Area | Rule |
|---|---|
| Transport | HTTPS only; TLS 1.2+ (1.3 preferred); HSTS; HTTP redirected |
| CORS | **An explicit allow-list of exact origins** from configuration: the back-office origin (if not served same-origin) and the field app's native origins (Capacitor's `capacitor://localhost` on iOS, `https://localhost` on Android) plus the browser test build. **No wildcards, no pattern-matching whole hosting domains** (Build 1 allowed any `*.netlify.app`; §17) |
| Back-office sessions | Short-lived access token plus a rotating refresh token, held in `HttpOnly; Secure; SameSite` cookies, **never** in `localStorage`; refresh tokens stored server-side only as hashes and revocable; CSRF protection on cookie-authenticated writes |
| Device sessions | A device credential (§7.4) plus the signed-in monitor; bearer tokens held in the device's secure storage |
| Authorization | Checked on the server on every request, from the database, so **a revoke takes effect immediately** (not when a token expires); a user can never grant a permission they don't hold; the last admin can't be removed or locked out |
| Passwords | Hashed with **Argon2id** (OWASP parameters, set in an ADR at build); rules per NIST SP 800-63B (length over complexity, breached-password screening, no forced rotation) |
| Abuse | Rate limits per IP, account and device; sign-in back-off and lockout; every sign-in, failure, lockout, device setup and master-passcode use is a **security** audit event |
| Input | Every request body validated by the shared Zod schema at the boundary; size limits; unknown fields rejected |
| Output | No stack traces or internal errors in responses; plain error codes; security headers (CSP, `frame-ancestors 'none'`, `nosniff`, referrer policy) on the web apps |
| Logs | Structured, with a request ID; never secrets, tokens, passwords or full personal details |
| Uploads | Media only through the media endpoint (§11): type and size checked, hash verified, stored outside the web root, never executed |

---

## 7. People, device setup and sign-in

✅ **Approved 2026-09-25** (ADR-104), with the changes in ADR-105 (sign-in, user creation),
ADR-106 (master passcode) and ADR-120 (changing monitors, username). **The word is "setup"**, never "provisioning" or "provisioned"
(ADR-095). Setup is the root of trust for everything a device does.

> ⚠️ **ADR-240 (2026-09-29, at the user's word; this note awaits approval, building doesn't wait):
> enrol once, dispatch daily.** What below is "setting up a phone" splits in two:
> 1. **Enrolment, once per phone** (online, master passcode): the device key of §7.4 is made and the
>    phone joins the firm's phones. No project, no monitor.
> 2. **The day's assignment**, written in the back office on a **dispatch board**: a person, a date,
>    a project, their work (ticket types, unit rate pay items, certifying), one site where the work
>    is at one, optionally a phone. The monitor signs in on any enrolled phone (§7.2); **online, the
>    phone receives their assignment**, its project's manifest and numbers. No master passcode, no
>    picking. One assignment, so one project, on a phone at a time (ADR-145).
>
> **§7.1 below becomes the unassigned fallback**, recorded as an *unplanned assignment* (marked, not
> flagged): online, or offline on the project whose lists the phone already holds. §7.3 (switching)
> and the temporary session amend the phone's assignment the same way. The manifest carries a
> **setup version**, and every field event records its assignment and that version. §7.2's safeguards,
> §7.4 and §7.5 stand. Declined: per-person passkeys or biometrics (phones pass between monitors),
> attestation, personal phones, per-supervisor keys (ADR-106 stands).

> ⚠️ **ADR-456, 457 (2026-10-10; agent defaults, this note awaits approval, building didn't
> wait): what a phone reports of an act under the master passcode.** An unplanned assignment
> is made on the phone, with or without a connection, and the phone checks the passcode against
> its own check. When it next has a connection the phone, having proved itself with its device
> key (§7.4), **reports the assignment**; nobody need be signed in and the passcode is never
> sent. The server takes the phone's word and keeps the assignment as reported: marked
> unplanned, on the board, never flagged, for a monitor archived since and from a phone out of
> service too. Its day is the day the phone's clock said, in the project's time zone. It keeps
> **the phone's instant, that clock's offset and when the server received it** (§10), and is
> recorded as done by **"Master passcode"** on that phone, about the monitor, with two security
> events at the phone's own time: a phone set up, and a use of the master passcode (§7.5).
> Reported twice, it is kept once. Still to build (ADR-456's cut): a monitor switch and a site
> move reported; a session under the passcode and the temporary session; every other use of the
> passcode a phone logged. **Neither NIST SP 800-63B nor ASVS provides for a server taking a
> device's word for what was done offline under a shared secret** (ADR-456): what stands
> against it is the device key, the three times kept, and the clock difference kept at sync.

### 7.0 Creating people

✅ **Decided** *(ADR-105, user 2026-09-25)*:
- **Three kinds of user:**
  1. **field monitors**;
  2. **back-office users** (analysts, managers and others);
  3. **outside users** (clients, contractors, auditors).
- **Back-office and outside users** are created by an admin in the back office.
- **A field monitor is created on a phone, online**, by the **master user**:
  - they sign in with the master passcode and choose **"Create monitor"**;
  - they set the monitor's username and password;
  - saving creates the user on the server.
  They may go straight on to **set the phone up** for a project, or sign out. **Creating a user and
  setting up a phone both need a connection.**
- **A monitor's username is their system Monitor ID** (e.g. `M004127`), unique in the system
  (ADR-120). **Their password is, by the firm's practice, their phone number
  without the area code**, so a worker who forgets it is told "your ID, and your own phone number",
  and an admin can sign in as them.

> ⚠️ **ADR-441, 442 (2026-10-09; agent defaults, this note awaits approval, building didn't
> wait): creating a monitor takes the phone and the passcode together.** The request comes from
> an enrolled phone that has proved itself with its device key (§7.4) and carries the master
> passcode; the passcode typed anywhere else creates nobody. Nobody types the Monitor ID: the
> system issues it and the phone shows it. The record says it was done under the master passcode,
> on that phone. A phone taken out of service creates nobody. What NIST SP 800-63B and ASVS ask of
> a monitor's sign-in, and where the phone-number password departs from them (the accepted risk of
> ADR-105 and §7.2), is ADR-441.

> ⚠️ **ADR-415 (2026-10-07; the server command is the user's decision, ADR-413 (2), 414 (2); this
> note awaits approval, building didn't wait):** the installer seeds nobody who can sign in, so
> **the firm's first admin is made on its own server by `pnpm installer:admin`**, which also lets
> an admin back in who has no other admin to ask (a login locked by wrong tries, a forgotten
> password where the firm has no mail, a lost authenticator). It never makes a second admin. A
> person signs in with their email address, so no two back-office or outside users share one;
> and the database itself keeps the firm's last admin from being archived or made anything else.

### 7.1 Setting up a phone (online only)

> ⚠️ **What a phone's lists carry, today (ADR-207, 213, 223, 227, 240, 243; this note awaits
> approval, building doesn't wait).** The two "Decided" paragraphs below (ADR-176, ADR-182) are
> **superseded**: loads don't start from a pay item and a load's phone holds **no pay items**
> (ADR-207, 223). For the phone's current **assignment** (or unplanned assignment), its lists carry:
> the project's certifications, sites, ROEs, control ranges or number block; **the forms' debris
> types** (without those *Hidden on phones*) and **field tags**; for unit rate work, **the unit rate
> pay items the assignment names**, with their settings, size bands, payable type and kind of work,
> never a rate (ADR-127, 213); for a phone at a site (a tower, either haul-out end), **that site's
> quantity lookup**: per debris type and prime, **load call, scale weight or a count of the tickets
> the load carries**, worked out ahead from the rules (ADR-227, 243); the login list; the **setup
> version** every field event records (ADR-240). Rules and rates never go to a phone.

> ⚠️ **ADR-449, 450, 451 (2026-10-09; agent defaults, this note awaits approval, building didn't
> wait): how a phone gets its lists.** A phone whose monitor is signed in asks for its lists
> whenever it has a connection. The server works out again which assignment the phone takes
> (§7.2's rule) and answers that assignment's lists; with no assignment that day it sends none
> and the phone keeps what it holds. Built so far: the number blocks, debris types, field tags,
> the unit rate pay items the assignment names with their capture settings, what its incidents
> and surveys pick from, and (ADR-451) the project's certifications (number, kind, capacity,
> prime and subs: never the driver), its sites by name and use, its ROEs by number, address and
> parcel with whether the pre-work survey is done (never the owner; only for a phone whose work
> names an ROE), the control ranges and the phone's own site's quantity lookup; the setup
> version (ADR-453); and, by a call of their own, the login list and the master passcode's
> check (ADR-454, below). **A login list on a phone is outside what NIST SP 800-63B and ASVS provide
> for** (ADR-449): anyone who reads a phone's list out can guess a seven-digit password, so the
> protection is §7.2's five safeguards, as approved.

> ⚠️ **ADR-454 (2026-10-09; ADR-449 (5) built as proposed, the rest agent defaults; this note
> awaits approval, building didn't wait): the login list and the master passcode's check.** A
> phone whose monitor is signed in asks for them whenever it has a connection, saying what it
> already holds. **On its list:** the monitors in service with an assignment that stands on its
> project for today or later. **An entry** is a slow hash made for that phone alone from a seed
> the server keeps sealed beside the monitor's password; the phone is told how to make the first
> half from what is typed and holds the second, and nothing sent is what the server itself
> checks a sign-in against. Each entry costs the server about a hundredth of a second, so it
> makes only those the phone doesn't hold, a bounded number a call; a password set anew
> replaces its entry at the phone's next read. **The master passcode's check** is made the same
> way and sent with its version; the phone's record says which version it was sent (§7.5). The
> server keeps no entry.

✅ **Decided** *(ADR-176, user 2026-09-27, Q-170)*: the setup manifest carries the project's **service
codes and their settings** (photos, GPS, measurement and weight required; payable type) for **every
ticket type** the phone is set up for, not only unit rate; the phone builds its options and required
details from them. How a load's start list uses them: Q-176.

✅ **Decided** *(ADR-182, user 2026-09-27, Q-176)*: every ticket, loads included, starts from a
pay item the monitor picks from the phone's codes for that ticket type (those set "shown to
monitors"); the manifest carries each code's debris type so the phone never asks for one separately.

1. At the office or staging area, **with a connection**, someone enters the **master passcode** to
   open setup.
2. They choose the **project** and the **ticket types** the phone may make (for unit rate, which
   unit rate pay items, ADR-127), and **pick the monitor from a list** (by name and ID).
3. The phone receives its manifest:
   - the project's certified trucks and crews;
   - sites, ROEs, and control ranges or its number block;
   - its chosen unit rate pay items (code, description and kind of work, never a rate; ADR-301)
     and the lists its start menus need (ADR-127);
   - the master passcode check;
   - **the login list**: a sign-in check for each monitor enabled on that project (ADR-105, Q-90).
4. Now monitors can sign in and make tickets, offline.

### 7.2 Signing in

✅ **Decided**:
- Sign in with **ID + password, offline**, checked against the login list.
- **The master passcode can also sign in as the set-up monitor.**
- **One monitor at a time.**
- **Devices are handed in at the end of the day**, which is normally when they sync. ⚠️ *ADR-240:
  phones sync whenever there's a connection (§9); handing in is no longer needed for the work to
  arrive.*
- A missing phone is **removed from service** in the back office; tickets it makes afterwards are
  held for review.
- **A different monitor signs in only after the master passcode hands them the phone**
  (ADR-120): monitors can't switch phones or roles on their own.

✅ **Approved:**
- A master-passcode session is marked, and so is every record made in it.
- Sign-in failures back off and eventually lock the phone until the master passcode is entered.
- The app locks after inactivity.

✅ **Approved** — making the user's "least bad" as safe as possible (ADR-105):

A 7-digit phone number is easy to guess by anyone who has the hashes, and coworkers may know it.
So the protection can't rest on the password. It rests on these:
1. **Monitor credentials only work on set-up phones.** The server refuses them for the back
   office, the portal and every API except device sync, so a guessed monitor password opens
   nothing on the web.
2. **The login list lives only inside the encrypted store** (§8), whose key is held in the phone's
   secure hardware. On a locked, modern phone it can't be read out. Each entry is a slow Argon2id
   hash with a salt unique to that phone, so a copy from one phone is useless on another.
3. **Tries at the sign-in screen are limited:** back off after 5 wrong tries, and lock after 10
   until the master passcode is entered. Guessing 10 million numbers by hand is impossible.
4. **A phone removed from service** still proves itself with its device key at its next sync and
   uploads everything (ADR-134, Q-127). What it made **before** its removal time comes in
   normally; everything made **after** arrives **flagged for review** ("Ticket 101008: made on a
   phone taken out of service. Flagged for review."), never billed silently. Then its number block
   is retired and, once the server has confirmed every record, the phone is wiped (§8).
5. **A screen-lock passcode on every phone** (the firm's device management) is strongly
   recommended, because it's what makes point 2 hold.

✅ **Approved:** **ADR-441, 443 (2026-10-09; agent defaults, this note awaits approval, building didn't
> wait): signing in online.** With a connection, a monitor signs in on an enrolled phone that has
> proved itself and is in service, with Monitor ID and password; the server answers with the
> monitor's own session, which the phone's calls carry beside the phone's proof. It lasts twelve
> hours from the sign-in and quiet doesn't end it; it ends at once when the monitor signs out,
> another monitor signs in on the phone, an admin sets their password anew or archives them, or
> the phone's key is revoked. Wrong tries online wait from the fifth and lock the login at the
> fiftieth until an admin sets the password anew (the phone's own screen keeps its 5 and 10).
> A phone taken out of service signs nobody in. The database itself lets a monitor's session be
> opened on a phone only (point 1).
>
✅ **Approved:** **ADR-444 (2026-10-09; agent defaults, this note awaits approval, building didn't wait):
> the phone takes the assignment at that sign-in.** The sign-in's answer carries the monitor's
> assignment for the day, the day being the project's own (its time zone): the one that names
> this phone; with none naming it, the only one they have, whichever phone the board named.
> Where several are left (two projects that day and a phone neither names), the phone takes none
> and says so: nobody picks a project on a phone and the server never picks one for them; the
> dispatcher names the phone, or the master passcode sets it up (§7.1). With none that day the
> monitor is signed in all the same and told there is none. The phone is told the assignment's
> project, day, work and site, never a rate or a code; its lists are their own read.

### 7.3 Switching monitors on a phone

✅ **Decided**:
- One monitor at a time.
- When a monitor signs out with unsynced work, it's **archived on the phone, still theirs, and
  pushed in the background** once there's a connection. Work never stops.
- **The master passcode comes first**; then the next monitor signs in with their own ID and
  password from the login list, so **the server knows it's them** (ADR-105/120).
- **Allowed shortcut:** the master passcode opens a **temporary session for a monitor picked from
  the roster**, with no personal password. Every record in it is marked "authorised by the master
  passcode, for M004127", and the session ends at the end of the day, so the monitor signs in
  properly next time (ADR-120).

✅ **Approved:** archived records are hidden from the next monitor and can't be edited by them.

### 7.4 The device's own identity

✅ **Approved:**
- At setup the phone makes a **key pair in its secure hardware** (iOS Secure Enclave / Android
  Keystore). The private key can't be exported, so a set-up phone can't be copied or swapped.
- Every sync proves the phone's identity by signing a server challenge.
- A lost or retired phone is marked in the back office. If it syncs again, the server still takes
  its records, flagging what it made after its removal (§7.2 point 4, ADR-134), then retires its
  number block (ADR-065) and has it wiped. Once wiped, its device key is revoked and the server
  refuses it.

> ⚠️ **ADR-436, 437, 440 (2026-10-09; agent defaults, this note awaits approval, building didn't
> wait): how a phone proves itself.** The key is ECDSA P-256. Before a sync the phone asks for a
> challenge by its id, signs it, and is given a token good for fifteen minutes that its calls
> carry as `Authorization: Bearer`; a challenge is good for two minutes and once. Nobody need be
> signed in on the phone, so what the proof writes is recorded as done by **"Device key"**, an
> actor that is not a person, on that phone. A phone out of service still proves itself; one
> whose key is revoked is refused at once, whatever token it holds.

### 7.5 The master passcode

✅ **Decided** *(ADR-106, user 2026-09-25)*:
- **One per firm:** a single value for the whole system, set by the firm when it installs Open
  ADMS.
- It covers every project, and is shared with whoever needs it.
- **The firm changes it when it chooses**, or never. There are no reminders or alerts.
- It opens setup, creates field monitors, signs in as a phone's monitor, authorises changing the
  monitor (and the temporary-session shortcut), and syncs and turns a phone in.

✅ **Approved:**
- The server keeps only a slow hash of it, and each phone only a slow-hash check.
- Every use is logged on the phone and synced as a security event.
- A change reaches each phone at its next sync.

## 8. Data on the device

✅ **Decided** *(ADR-096, user 2026-09-25)*:
- **Encrypted at rest.**
- **No device backups.**
- **A phone can't be swapped.**
- The device can be **taken out of service and synced even when the monitor who signed in isn't
  there**. So the encryption key must **not** come from the monitor's password.

✅ **Approved**
- **The local store** (tickets, photos queue, manifest, archived queues) is an encrypted database.
  Its random data key is held in the iOS Keychain or Android Keystore, marked **this-device-only**,
  so it never travels to a backup or a new phone.
- The app's data is **excluded from iCloud and Google backups** (on iOS, the "exclude from backup"
  file flag and device-only Keychain items; on Android, backups switched off and data-extraction
  rules). The monitor's password gates *using the app*, not *decrypting the data*. That lets a
  supervisor sync a device the monitor has walked away from.
- **Taking a device out of service:**
  1. Enter the master passcode, then "Sync and turn in".
  2. The device proves itself with its device key and uploads every queue, the current monitor's
     and any archived ones.
  3. It waits for the server to confirm each record.
  4. It returns its unused numbers (ADR-065), then wipes its data.

  Nothing is wiped before the server confirms it. Cancelled tickets are the only exception to
  syncing: they stay on the device until it is set up again (ADR-056).
- **Browser test build:** IndexedDB, encrypted with a WebCrypto key that can't be exported. It's
  good enough for testing, but it isn't device-grade, so real work never uses it.
- **Device management software** (MDM) is the firm's choice. We recommend it (a passcode on the
  phone, remote wipe), but Open ADMS doesn't require it.

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 9. Sync

✅ **Decided**:
- Arrival order means nothing (ADR-030).
- A duplicate number is quarantined in full, never dropped (ADR-022).
- The device is told "saved" only for what was stored (REQ-308c).
- Cancelled tickets don't sync (ADR-056).
- Sync needs a data connection (ADR-099).

✅ **Approved**: the protocol.

1. **The device proves who it is** (§7.4) and reports its clock (§10).
2. **Records first, photos second.** Records are small and photos aren't. A slow photo never holds
   up the records behind it.
3. **Every record carries an ID the device made** when it was created. The server keeps an
   **idempotency ledger** keyed on it:
   - a record sent twice is recognised and answered "already saved", never stored twice;
   - it is never mistaken for a duplicate ticket number, which was the flaw in today's historical
     code (KD-56).
4. **Each record gets its own answer:** saved, already saved, or quarantined (with the reason).
   The device marks each one accordingly, and a quarantined record shows as **not saved**.
   ⚠️ *ADR-240: the device syncs **whenever it has a connection**, not only at the end of the day;
   a finished field event stays reopenable until the monitor ends the shift (agent default), and an
   edit to one already sent travels by step 8.*
5. **Photos upload resumably.** An interrupted upload continues from where it stopped. The server
   checks each file's hash against the one the device recorded (§11).
6. **The device gets a fresh manifest** (certs, sites, ROEs, roster, control ranges), its number
   block topped up (ADR-065), and any new master passcode verifier. ⚠️ *ADR-240, 243: the manifest
   is the one for the phone's current assignment, as listed in the §7.1 note (debris types, field
   tags, its unit rate pay items, its site's quantity lookup), with a new setup version whenever
   any of it changed.*
7. **The server queues reconciliation** for what arrived (§13). The sync doesn't wait for it.
8. The device records its **ticket edit log** for anything reopened before sync (ADR-072), and the
   server writes those edits to the audit log under the monitor's ID.

The sync contract (every payload and every answer) is written once as shared Zod schemas, with a
test suite that any client, including the scenario harness, must pass.

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 10. Time

✅ **Decided** *(ADR-100, user 2026-09-25)*:
- **Every project has a time zone.** Tickets and time-clock entries are shown and judged in it.
  For example, a project in Texas uses Texas time.
- **An offline device only knows its own clock**, and that is the time it records on a ticket.
- **Reconciliation checks that the times make sense.** When they don't, the ticket is flagged
  with a plain message about the time.
- **The time clock** (workers' own hours, ADR-063):
  - it records a start (e.g. 0600), a 30-minute break when the day runs 6 hours or more
    (e.g. 1300–1330), and a clock-out (e.g. 1850);
  - a monitor's day can start early and end late, but **ends before midnight**; work past midnight
    is logged on the next day;
  - **there is no cap on a monitor's hours**, so long as it is honest work.
- **The 12-hour limit is only for contractor crew hours** (ADR-068). It never applies to monitors.
- ⚠️ *ADR-241 (2026-09-29):* the time clock belongs to an **assignment** (§7 note): anyone with one
  clocks in, breaks and clocks out by hand, with simple nudges; activity is pre-filled from the
  day's field events; a manager approves the day (locked, unlock audited); the hours are exported
  for payroll and client billing. No rates or pay held; never linked to crew time.

✅ **Approved**:
- **Store every time as a UTC instant, and also keep the device's own offset** at capture, and
  the **server's received time**.
- Display and "which day" questions use the **project's time zone** (an IANA name such as
  `America/Chicago`), including:
  - the active window (ADR-064);
  - crew hours in a day;
  - time-clock days.
- **The device reports its clock at every sync.** The server compares it with its own, records the
  difference on the sync, and if it's beyond a threshold (in `.env`), flags that sync's records:
  "Ticket 101008: device clock was 2 h 14 m off at sync. Flagged for review."
- **Checks that flag, never block** (thresholds in `.env`):
  - a work time **after** the server received the record ("Ticket 101008: work time 21:40 is
    after it was received at 20:15": the times as `spec/FLAGS.md` words them, ADR-290);
  - a work time before the device was set up;
  - a device time zone different from the project's;
  - the existing contradictions (a disposal before its collection ended, overlapping loads on one
    cert, ADR-053).

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 11. Photos and media

✅ **Decided** *(ADR-101, user 2026-09-25)*:
- **Reduce file size, carefully.** Keep quality as close to the original as possible, and shrink
  by only a fraction.
- **Keep any depth data** the phone captures (LiDAR or other depth information), even if that
  means storing it as a separate linked item.
- **Keep everything indefinitely.**

✅ **Approved**:
- **Capture** through the phone's native camera, at full resolution. Never pick from the gallery
  for evidence.
- **Fingerprint at capture:** the device records a SHA-256 hash of the original file when it's
  taken.
- **Shrink natively, not in the web layer.** Re-encoding in the browser layer strips depth and
  location data. A small native step re-encodes at high quality **at the original resolution**
  (e.g. HEIC on iPhone), copies the location and time data, and carries the depth data along.
- **Where depth can't travel inside the smaller file,** it's saved as a **separate linked file**.
  The device hashes the file it uploads too. Both hashes are kept, so anyone can show the
  uploaded file came from the captured one.
- **The actual sizes and quality settings are measured on real phones** before they're fixed.
  They go in configuration, not code.
- **Storage:**
  - object storage, one immutable object per file, never overwritten;
  - the database holds only metadata: hashes, capture time and place, device, and the record it
    belongs to;
  - **nothing is ever deleted**; older files may move to cheaper storage tiers.
- **Sizing** (Q-08 scale): up to about 160,000 photos a day on a big mission, so storage and
  upload are sized for that, and measured.

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 12. Printing and scanning

✅ **Decided** *(user, Build 1, carried forward: Q-95, `FROM-BUILD-1.md` §1)*:
- The printer is a **Zebra ZQ series** mobile receipt printer.
- Collection prints **two** copies (or uses a control ticket plus its stub).
- Disposal, haul-out and final disposal each print a disposal copy for the driver.
- Unit rate always prints.
- **No project is without a printer.**
- **The barcode is the ticket number.**
- Anything printed can be scanned back; if the ticket exists, the device just says so.
- **Receipts are never records.** There are no audit entries and no print counts, and they can be
  reprinted at any time.
- Certifications print an itemised receipt.
- **Haul-out prints at the collection side**, with the load call; that ticket travels to the
  haul-out complete end (ADR-115).
- **On a control-ticket project, the disposal receipt may be handwritten**: the monitor scans the
  control ticket and writes the load call, their details and the truck number on its back
  (ADR-115).

✅ **Decided** *(ADR-099)*: browser first for testing, then iPhone, later Android.

✅ **Approved**:
- **iPhone has no Bluetooth access from web pages** (Safari supports neither Web Bluetooth nor
  Web Serial, and every iOS browser uses Safari's engine). So printing goes through a small
  **native Capacitor plugin** on both phones, using Zebra's published SDKs, sending ZPL over
  Bluetooth.
- **The browser test build prints to PDF or the screen.**
- **One receipt content model** (structured data) renders two ways: **ZPL** for the Zebra, and
  **PDF** for the back office and testing.
- **Code 128** barcodes carrying the bare number.
- **Scanning:** the phone camera through a native plugin, or a Bluetooth scanner that types like
  a keyboard; the browser build uses a keyboard or the camera where the browser supports it.
- A **printable test set** of control tickets with real, scannable barcodes is a deliverable, so
  scanning is tested against paper (user, Build 1).

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 13. The worker: reconciliation, pricing and background jobs

✅ **Decided**: the engine is **rebuilt from scratch** (ADR-093). Its behaviour is the skills'
(`adms-validation`, `adms-ticket-workflows`, `adms-exceptions`, `adms-ledger-audit`).

✅ **Approved**:
- **Jobs, not requests.** A sync, a correction, a rate or rule change (ADR-090) or a void each
  **queues work**, and the worker drains the queue. This handles the end-of-day spike (ADR-030).
- **One group, one transaction.** Validating a group, writing or updating its completed load or haul-out,
  regenerating its transactions and the audit capture all commit together, or none of it does.
  This was the flaw in the historical code (KD-55).
- **One run per project at a time**, with a database lock, so two syncs can't reconcile the same
  group twice.
- **A group that errors is flagged and skipped.** It never stops the rest of the run.
- **Idempotent.** Running it again over unchanged input changes nothing.
- **Deterministic and recorded.** Each run records what it decided and why, so "why did these two
  become one load" can be answered years later.
- **Existing records are updated, never duplicated** (ADR-086).
- **Rule actions in a fixed order** (ADR-118, ADR-130, ADR-131): the engine finds **all** active,
  valid rules whose criteria hold on the ticket (criteria read only the ticket, never another
  transaction), then runs every *Add transaction* **in # order** (#1, #2…), then every *Remove
  transaction*, then any *Void ticket* (action names per `spec/CONVENTIONS.md`, ADR-234). The result never depends on the order rules were written,
  and the same ticket and rules always give the same transactions. Two creates of the same # on
  one ticket → flagged. A rule's void names the rule as its reason. Full spec: `spec/RULES.md` §6.
- **Mileage before pricing.** For loads and haul-outs, the worker asks the routing service for the
  road distance (§3, ADR-110) and stores it, with the map data's date, before rules run.

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 14. Back office and the read-only portal

✅ **Approved**:
- One React app for the back office, and the read-only portal for clients, contractors and
  auditors as a restricted view of it or a separate small app (VISION §7). Both go through the
  API; neither touches the database.
- ✅ **Languages and units** *(ADR-172, user 2026-09-27, Q-164)*: every screen (back office, portal,
  phone) is **translatable from day one** through one translation layer, English only at first;
  **US units only** (inches, cubic yards, miles, pounds, tons).
- Served same-origin with the API in the cloud (§4), with cookie sessions (§6).
- The UI preferences the user gave in Build 1 are kept for Phase 4 (`FROM-BUILD-1.md` §8–§13).

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 15. Testing: local first, then the cloud

✅ **Decided** *(ADR-099)*:
- Everything runs and is tested locally, then in the demo cloud.
- Devices are tested in the browser first, then on iPhone, then on Android.

✅ **Approved** — layers, all runnable from a terminal:

| Layer | What it proves |
|---|---|
| **Unit** (shared domain package) | Capacity math against the paper-form examples; volume, apportionment and split shares sum exactly; time rules; number blocks |
| **Database** | Every grant and refusal: e.g. the API can't write a completed load; nobody can update `AuditRecord`; a delete is refused; the transaction delete copies to audit first |
| **API** | Auth, permissions, the CORS allow-list, rate limits, validation, the sync contract |
| **Scenario harness** (the golden mission, VISION §8) | Whole projects told as stories: set up, enrol devices, a shift offline, break things, sync out of order, reconcile, price, correct, lock. Assert the exact statuses, review queue and ledger. **Runs before any screen exists** |
| **Browser end-to-end** | The web apps and the field app's browser build |
| **On device** | iPhone, then Android: airplane mode, printing, scanning, camera, encryption, turn-in |

Test runs report real counts. A phase is done when its scenarios pass at its layer (VISION §8).
Security checks run with the tests: a dependency audit, a secrets scan, and the grant tests.

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 16. Security standards

✅ **Approved** — the checklists we test against:
- **OWASP ASVS** (current release), **Level 2**, for the API and web apps.
- **OWASP MASVS** for the field app (storage, crypto, authentication, network, platform).
- **OWASP API Security Top 10.**
- **NIST SP 800-63B** for passwords and authenticators.
- **CIS PostgreSQL Benchmark** for database configuration.

Each phase's exit includes the checklist items for its layer.

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 17. Lessons carried forward — not code
✅ **Approved** but no approval was needed here as this is just informational.

From Build 1 (`FROM-BUILD-1.md` §14) and from this build's historical code:

| Lesson | Where it's answered |
|---|---|
| Build 1 was never designed; it was built, then edited | Phase 0 and §1.7 |
| The field reality (offline, printing, scanning, downloaded data) wasn't the foundation | §7–§12 |
| Nothing enforced a boundary, so nothing held one | §2, §5 |
| It was proved by clicking | §15 |
| An offline queue of raw HTTP calls can't replay a create followed by an update | §9: records with device-made IDs and an idempotency ledger |
| Tokens and the queue were kept in `localStorage` | §6, §8 |
| CORS allowed any `*.netlify.app` site to call the API | §6 |
| A certified capacity could be overridden by whatever number arrived | §3 (capacity from the certification only), Q-98 |
| This build's engine wrote each step as its own commit, so a crash left half a result that blocked the project forever | §13, KD-55 |
| This build's tickets had server-made IDs, so a retried upload would look like a duplicate number | §9, KD-56 |
| No database rule backed "audit everything" or "append-only" | §5 |

---

## 18. Repository layout

✅ **Approved**. It replaces the empty `api/`, `field-webapp/` and `back-office-webapp/`
placeholders. `database/` stays as historical reference.

✅ **Licence** *(ADR-171, user 2026-09-27, Q-163)*: Open ADMS is **AGPL-3.0**. A `LICENSE` file at the
repository root is added at scaffold (0.2.1). A dependency is pinned only if its licence is
compatible (permissive, LGPL, GPL-3.0 or AGPL-3.0); source-available and non-commercial licences are
refused.

```
apps/
  api/            NestJS: device sync + back-office + portal endpoints
  worker/         reconciliation, pricing, repricing, media jobs
  back-office/    React + Vite
  field/          React + Vite + Capacitor (browser build for testing; iOS, then Android)
packages/
  db/             Prisma schema folder, migrations, hardening SQL (§5.6), seed data
  domain/         the rules as classes: capacity, volume, pricing, time, numbering (shared by phone and server)
  contracts/      Zod schemas for every API and sync payload; generated OpenAPI
  scenarios/      the scenario harness and the golden mission
infra/local/      docker compose, Caddy
tools/setup/      the installer (local + demo deploy)
```

Each package has one owner and one direction of dependency:
- `domain` depends on nothing.
- `contracts` depends on `domain`.
- The apps depend on both.
- **Only `db` and the two server apps touch Postgres.**

**Section status:** ✅ Approved 2026-09-25 (ADR-104)

---

## 19. What's waiting on the user

| Item | Where |
|---|---|
| Nothing: the page is approved in full (ADR-143, ADR-144) | — |

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs/assets/banner-light.svg">
  <img alt="Open ADMS" src="docs/assets/banner-dark.svg" width="100%">
</picture>

# Contributing

**[Repository](README.md)** · [Documentation](docs/) · [Code of conduct](CODE_OF_CONDUCT.md) · [Security](SECURITY.md)

</div>

---

Field experience counts as much as code here. A monitor who can describe exactly why a load call gets disputed, or a data manager who knows which report a reviewer asks for first, is contributing something a developer cannot supply.

<br>

## Ways to contribute that are not code

| | |
|---|---|
| **Propose a ticket type** | Your contract needs a form this catalog does not have. Open a [ticket type proposal](../../issues/new?template=ticket_type.yml) with the stages, the fields, and how it bills. Most of these ship as a seed row and nothing else |
| **Describe a real dispute** | A load call argument, a deobligation, a scale ticket mismatch. What the reviewer asked for and what was missing is design input |
| **Correct the domain** | Terminology, PAPPG references, state or county practice that differs from what is written here |
| **Test an install** | Run the installer on a platform nobody has tried and report exactly where it stopped |
| **Improve the docs** | The [documentation](docs/) is twelve pages and every one of them can be clearer |

<br>

## Development setup

```bash
git clone https://github.com/MrRyanAlexander/openadms.git
cd openadms
docker compose up -d db                      # Postgres 16 + PostGIS on :5432

export DATABASE_URL=postgresql://adms:adms@localhost:5432/openadms
./database/setup.sh --with-demo --test       # schema, demo data, 106 assertions

cd backend  && pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload --port 8080    # API + /docs

cd frontend && npm install && npm run dev    # back office → :5173
cd mobile   && npm install && npm run dev    # field app   → :5174
```

Demo accounts are `admin`, `manager`, `analyst`, `monitor1`, `monitor2`, `monitor3`, `monitor4`, all with password `openadms`.

<br>

## Before you open a pull request

```bash
./database/migrate.sh --verify           # no applied migration has drifted
./database/setup.sh --test               # 106 schema assertions
cd backend && python3 -m pytest          # 96 API tests
npm run build                            # both frontends compile
npm run test:ui                          # the back office actually runs
```

CI runs all of it. Running it locally first is faster than waiting for the red X.

<br>

## The rules that are not negotiable

> [!IMPORTANT]
> **Migrations are forward only.** Each file records its `sha256`. Editing a migration that has already been applied is schema drift, and `./database/migrate.sh --verify` is what catches it. Add a new numbered file instead.

> [!IMPORTANT]
> **Guarantees go in the database.** If a property has to hold under audit, a constraint or a trigger enforces it. Application level validation on top of that is welcome. Application level validation instead of it is not, because a script with a `DATABASE_URL` routes around it.

> [!IMPORTANT]
> **Transactions and audit events are append only.** Never add a code path that updates or deletes either one. A correction is a reversal row plus a fresh computation, and both stay in the ledger.

> [!IMPORTANT]
> **A new ticket type is data.** If a feature needs a code change to support one more kind of ticket, the design is wrong. Extend `stage_schema`, `field_schema`, `rule_operands` or `unit_types` instead.

<br>

## Conventions

### Database

| | |
|---|---|
| Migrations | `database/migrations/NNNN_short_name.sql`, next number in sequence, one transaction per file |
| Tables | Plural, snake case. Join tables read parent first: `project_contractors` |
| Triggers | `trg_<table>_<what_it_does>` |
| Functions | `adms_<verb>_<noun>` |
| Audit | Attach with `adms_attach_audit('table_name')` rather than writing the trigger by hand |
| Timestamps | `timestamptz`, always. A debris program crosses a daylight saving boundary |
| Money | `numeric`, never float |
| Coordinates | Plain `numeric` lat and lon. PostGIS is layered on top in `0013` and stays optional |

### Backend

| | |
|---|---|
| Router per domain, under `/api/v1` | `backend/app/routers/` |
| Errors | Raise from `app/errors.py` so the envelope stays consistent |
| Actor context | Set before every write so the audit trigger can attribute it |
| Queries | Parameterised. No exceptions, and the query builder is the place that proves it |
| Async | `asyncpg` throughout. No sync database calls in a request path |

### Frontend

| | |
|---|---|
| Render from the catalog | Never hardcode a ticket type, a stage, or a field |
| Offline first in `mobile/` | Every write goes through the queue, never straight to `fetch` |
| One environment variable | `VITE_API_URL`. Anything else belongs on the server |

### Commits

Conventional commits, because the history is read later.

```
feat(billing): add per_square_foot unit type
fix(mobile): stop the offline queue retrying a 422
docs(federation): document the nonce window
test(rules): assert a rule with no effective rate records why
```

<br>

## What a good pull request looks like

- [ ] One concern. A schema change plus a UI change plus a refactor is three reviews wearing a trenchcoat
- [ ] A test that fails without the change. For a database guarantee, a `check_raises` that attempts the thing you are refusing
- [ ] Test names written as the sentence you want to be true. `test_a_rate_cannot_be_negative`, not `test_rate_validation`
- [ ] Documentation updated in the same PR when behavior changed
- [ ] No new dependency without a sentence on why the standard library or what is already here does not do it
- [ ] `--verify` clean, both suites green, both frontends building

<br>

## Reporting things

| | |
|---|---|
| [Bug report](../../issues/new?template=bug_report.yml) | Something is broken |
| [Feature request](../../issues/new?template=feature_request.yml) | Something is missing |
| [Ticket type proposal](../../issues/new?template=ticket_type.yml) | Your contract needs a form this does not have |
| [Security policy](SECURITY.md) | Data exposure, authentication, or the peer signing scheme. **Do not open a public issue** |

<br>

## Licensing of contributions

This project is [MIT licensed](LICENSE). Opening a pull request means you agree your contribution ships under the same terms. There is no CLA to sign.

<br>

<div align="center">
<sub>

**[Repository](README.md)** · **[Documentation](docs/)** · **[OpenRecover](https://openrecover.com)**

</sub>
</div>

<div align="center">
<sub>

[Docs index](README.md) · [Architecture](ARCHITECTURE.md) · [Data model](DATA_MODEL.md) · [ERD](ERD.md) · [Ticket types](TICKET_TYPES.md) · [Rules](RULES_ENGINE.md) · [Access](ACCESS_CONTROL.md) · [Federation](FEDERATION.md) · [API](API.md) · [Deploy](DEPLOYMENT.md) · **Testing** · [Troubleshooting](TROUBLESHOOTING.md)

</sub>
</div>

# Testing

Three suites, each aimed at a different failure.

| Suite | Count | Runs against | Proves |
|---|---|---|---|
| **Schema** | 219 assertions | A live Postgres | The database refuses what it should refuse, with no application in the way |
| **API** | 186 tests | A live API on a seeded database | The endpoints behave, end to end, including two instances federating |
| **UI walk** | 71 scripted steps | A built frontend and a running API | The back office actually runs, not just compiles |

```bash
./database/setup.sh --with-demo --test    # schema
cd backend && python3 -m pytest           # API
npm run build && npm run test:ui          # UI walk
```

> [!NOTE]
> The walk is clean from a freshly seeded database. Three of its invoice steps
> walk one draft invoice through submit, reject and reopen, so running the walk
> twice against the same database, or running it after the API suite, finds that
> invoice in a state those steps did not leave it in. Rebuild before walking.

> [!IMPORTANT]
> Nothing here is mocked. The rules engine and the audit trail live in the database, so stubbing the database out would test nothing at all. Every suite runs against real Postgres.

<br>

## The schema suite

[`database/tests/schema_tests.sql`](../database/tests/schema_tests.sql). Plain SQL, no pgTAP dependency. Every assertion raises on failure, so the whole file fails loudly under `psql -v ON_ERROR_STOP=1`.

Two helpers do the work:

| Helper | Asserts |
|---|---|
| `pg_temp.check_that(name, condition, detail)` | The condition holds. 167 of these |
| `pg_temp.check_raises(name, sql, fragment)` | The SQL raises, and the message contains the fragment. 52 of these |

`check_raises` is the interesting half. Most of the guarantees in this system are things the database **refuses**, and the only honest way to test a refusal is to attempt it.

<details>
<summary><b>What it covers</b></summary>
<br>

| Area | Assertions about |
|---|---|
| Creation gate | A ticket on an unready project is refused. A ticket from an unassigned creator is refused. Both messages name the reason |
| Rule save gates | A rule without a service code is refused. Without a contract, refused. With a code or contract not on the project, refused |
| Service code scope | A code whose contractor is not on the project is refused. Same for its contract |
| System ticket types | `PENDING_COLLECTION` and `PENDING_DISPOSAL` cannot be added to a project |
| Quantity derivation | Every unit type resolves to the right column, and to 1 where there is nothing to measure |
| Multi rule matching | One completed ticket matching three rules produces three transactions |
| Idempotence | Re-processing an already processed ticket writes nothing |
| Transaction immutability | `UPDATE` raises. `DELETE` raises |
| Audit immutability | Same, on `audit_events` |
| Reversal arithmetic | The negating row nets to zero and the original is untouched |
| Effective dating | A new rate does not rewrite a computed transaction |
| Extensibility | A brand new ticket type bills through the same engine with no code change |
| Estimates | `UPDATE` and `DELETE` are refused. Revisions are new rows |
| Permits | A permit cannot be verified with no document behind it |

</details>

### Running it

```bash
export DATABASE_URL=postgresql://adms:adms@localhost:5432/openadms
./database/setup.sh --with-demo --test     # apply schema, seed, then assert
./database/setup.sh --test                 # assert against what is already there
npm run test:db                            # the same file, directly
```

<br>

## The API suite

[`backend/tests/`](../backend/tests). 141 tests in `test_api.py`, 10 in `test_names.py`. Session scoped fixtures log in as each demo role once and reuse the tokens.

```bash
export DATABASE_URL=postgresql://adms:adms@127.0.0.1:5432/openadms
cd backend && python3 -m pytest
cd backend && python3 -m pytest -k peer        # just federation
cd backend && python3 -m pytest -k "manager"   # just rank escalation
```

The test names are written to be read as a specification. A representative slice:

```
test_health_reports_a_live_database
test_the_field_app_can_run_a_load_ticket_end_to_end
test_scanning_an_unknown_barcode_is_a_clean_404
test_voiding_reverses_the_ledger
test_a_rule_cannot_be_saved_without_a_contract_on_the_project
test_rule_dry_run_reports_matches_without_writing
test_a_new_rate_supersedes_the_old_one_without_rewriting_history
test_transactions_are_immutable_through_the_api
test_reversal_requires_a_reason
test_invoices_roll_up_uninvoiced_transactions
test_every_edit_leaves_an_audit_artifact
test_query_builder_rejects_injected_columns
test_export_records_itself_in_the_audit_trail
test_a_new_ticket_type_is_added_as_data
test_a_stage_schema_without_a_completing_stage_is_rejected
test_system_ticket_types_cannot_be_added_to_a_project
test_a_manager_cannot_grant_admin_rank
test_a_contract_without_a_document_link_is_refused
test_the_expiring_sweep_is_right_at_the_boundary
test_a_pending_permit_never_blocks_a_ticket
test_forty_rows_dry_run_then_commit_atomically
test_the_manifest_says_what_is_unverified_rather_than_hiding_it
test_the_package_is_a_real_zip
test_a_restricted_project_needs_a_valid_signature
test_a_peer_read_is_written_to_the_audit_trail
```

<details>
<summary><b>Federation, proven with two live instances</b></summary>
<br>

Peer isolation cannot be tested against one database, so it is not.

```bash
# Two databases, two DATABASE_URLs, both seeded
./database/setup.sh --with-demo
cd backend && python3 -m pytest -k peer
```

`test_a_restricted_project_needs_a_valid_signature` registers Beta on Alpha, restricts a project to Beta's key, then asserts that Beta reads it, that a replayed nonce is refused, that a forged signature is refused, that an unregistered third party receives 403, and that an unsigned request receives 403.

See [Federation](FEDERATION.md).

</details>

<details>
<summary><b>test_names.py, and why it exists separately</b></summary>
<br>

Ten tests for the parser that turns pasted human input into records. A crew list copied out of Excel, a table copied out of an email, and a bare list of names all have to land as the same structure, because that is how the list actually arrives on a project.

```
test_a_crew_list_copied_out_of_excel_parses
test_a_table_copied_out_of_an_email_parses
test_a_bare_list_of_names_parses
test_the_same_row_twice_in_one_paste_is_flagged
test_two_people_with_the_same_name_at_different_firms_both_land
```

</details>

<br>

## The UI walk

[`e2e/uiwalk.mjs`](../e2e/uiwalk.mjs). Playwright walks the back office the way a data manager would and fails loudly on any console error, page error, 5xx, or missing screen.

A build passing proves the code parses. This proves it runs.

```bash
npm run dev:api

cd frontend && VITE_API_URL=http://127.0.0.1:8080/api/v1 npm run build \
  && npx vite preview --port 4173

node e2e/uiwalk.mjs           # or: npm run test:ui
node e2e/uiwalk.mjs --shots   # write screenshots to e2e/shots
```

| Variable | Purpose |
|---|---|
| `UI_BASE` | Override the frontend URL |
| `UI_SHOTS` | Override the screenshot directory |
| `PW_CHROMIUM` | Point at a Chromium binary where Playwright's own download is unavailable |

<br>

## Adding a test

<details open>
<summary><b>A new database guarantee</b></summary>
<br>

If you added a trigger, add a `check_raises` for the thing it refuses. A `check_that` alone proves the happy path and says nothing about the guarantee.

```sql
SELECT pg_temp.check_raises(
    'a rate cannot be negative',
    $$INSERT INTO rates (service_code_id, amount, unit_type_code, effective_from)
      VALUES ('...', -1, 'per_ton', current_date)$$,
    'rates_amount_positive');
```

</details>

<details>
<summary><b>A new endpoint</b></summary>
<br>

Name the test as the sentence you want to be true. `test_a_rate_cannot_be_negative` beats `test_rate_validation`, because six months later the failure output is the specification.

Use the session fixtures rather than logging in again. `client`, `admin`, `manager`, `analyst`, `monitor` are all available.

</details>

<details>
<summary><b>Migrations</b></summary>
<br>

Migrations are forward only and each file records its `sha256`.

```bash
./database/migrate.sh --status    # what is applied, what is pending
./database/migrate.sh             # apply pending, one transaction per file
./database/migrate.sh --verify    # fail if an applied file changed on disk
```

Editing a migration that has already been applied is schema drift. `--verify` is what catches it in CI. Add a new file instead.

</details>

<br>

## In CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs a Postgres service container, applies the schema with the test suite attached, runs pytest, verifies no applied migration has drifted, and builds both frontends. A pull request that breaks any of it says so before review.

<br>

<div align="center">
<sub>

**[Docs index](README.md)** · **[Contributing](../CONTRIBUTING.md)** · **[Repository](../README.md)**

</sub>
</div>

<br>

## What the measurement assertions hold

The volume formulas are the most expensive thing in this system to get quietly
wrong: certified capacity times the monitor's load call is the billable volume
on every load a truck hauls. So the figures are computed by hand and checked in
rather than derived by the same code under test.

| Assertion | Figure |
|---|---|
| A rectangular box measures to the hand figure | 264 by 96 by 54 inches is 1,368,576 cubic inches, 792 cubic feet, 29.33 CY |
| A curved floor measures to the hand figure | 288 long, 96 wide, 60 inches of straight side on a 14 inch curve is 41.18 CY |
| Measuring that trailer as a box overstates it | 43.85 CY against 41.18, so 2.67 CY on every load |
| A half circle floor matches the closed form | Segment volume equals length times pi r squared over two |
| A floor with no curve is just a box | The round bottom shape degenerates correctly at zero |
| A taper with equal ends is a box | So does the sloped side shape |

Each of those has an API test behind it as well, because the arithmetic a
monitor sees on the device comes back over `/measurements/preview` and has to be
the same arithmetic the certification is saved with.

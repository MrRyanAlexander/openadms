# Open ADMS — The chain's counts, today

> **The one place the chain's numbers are written** (ADR-445), **and only `pnpm chain` writes them**
> (ADR-594): every run keeps what each step saw (`.cache/adms/chain/seen.json`, the newest run of
> each step), `pnpm chain` holds it against the table below (`≠` differs, `+` not here, `−` here and
> not seen), and **`pnpm chain record`** writes it here once the lead has read each difference.
> A count that moved without a reason is a finding, not noise: say why each moved in the task's
> report. Never edit the table by hand. What each command proves and what a pass looks like:
> `adms-verify` and `chain-reference.md` beside it. The words that stood here until ADR-594 (which
> tests need the stack, each count's history) are in `ARCHIVE.md`, "Moved 2026-10-20 (ADR-594)".

**Seen whole before ADR-594:** 2026-10-19, the user's notes on trying the field app (ADR-587…590),
on the user's Mac: `pnpm chain` 10 of 10 in 13 min 38 s, and after ADR-591…593 every count as
below (51 browser tests). The table was carried over from the hand-written page as it stood.

<!-- counts: written by `pnpm chain record`, never by hand -->
| Step | Its newest run | Took | Passed |
|---|---|---|---|
| `local:up` | 2026-10-23 00:12 UTC | 11s | ✓ |
| `installer:check` | 2026-10-23 00:12 UTC | 2s | ✓ |
| `install` | 2026-10-23 00:12 UTC | 0s | ✓ |
| `typecheck` | 2026-10-23 00:12 UTC | 5s | ✓ |
| `test` | 2026-10-23 00:12 UTC | 5m 02s | ✓ |
| `scenarios` | 2026-10-23 00:17 UTC | 3m 51s | ✓ |
| `e2e` | 2026-10-23 00:21 UTC | 4m 44s | ✓ |
| `security` | 2026-10-23 00:26 UTC | 10s | ✓ |
| `lint` | 2026-10-23 00:26 UTC | 1m 03s | ✓ |
| `licences` | 2026-10-23 00:27 UTC | 1s | ✓ |

| Step | Count | Today |
|---|---|---|
| `installer:check` | installer:check ✓ | 38 |
| `installer:check` | migrations at head | 152 |
| `test` | test files | 229 |
| `test` | tests | 3822 |
| `test` | tests in apps/api | 793 |
| `test` | files in apps/api | 64 |
| `test` | tests in apps/back-office | 64 |
| `test` | files in apps/back-office | 2 |
| `test` | tests in apps/field | 257 |
| `test` | files in apps/field | 21 |
| `test` | tests in apps/worker | 51 |
| `test` | files in apps/worker | 6 |
| `test` | tests in infra/local | 77 |
| `test` | files in infra/local | 6 |
| `test` | tests in packages/contracts | 102 |
| `test` | files in packages/contracts | 9 |
| `test` | tests in packages/db | 1113 |
| `test` | files in packages/db | 50 |
| `test` | tests in packages/domain | 942 |
| `test` | files in packages/domain | 51 |
| `test` | tests in packages/look | 17 |
| `test` | files in packages/look | 2 |
| `test` | tests in packages/receipts | 37 |
| `test` | files in packages/receipts | 3 |
| `test` | tests in packages/scenarios | 168 |
| `test` | files in packages/scenarios | 8 |
| `test` | tests in tools/chain | 20 |
| `test` | files in tools/chain | 1 |
| `test` | tests in tools/security | 161 |
| `test` | files in tools/security | 3 |
| `test` | tests in tools/setup | 20 |
| `test` | files in tools/setup | 3 |
| `scenarios` | story migrations | 152 |
| `scenarios` | checks in ticket-101001 | 16 |
| `scenarios` | checks in dispatch-monday | 22 |
| `scenarios` | checks in setup | 52 |
| `scenarios` | checks in certification | 29 |
| `scenarios` | checks in numbering | 16 |
| `scenarios` | checks in p1-field-days | 35 |
| `scenarios` | checks in sync | 51 |
| `scenarios` | checks in p1-any-order | 4 |
| `scenarios` | checks in p1-reconciled | 39 |
| `scenarios` | checks in p1-priced | 29 |
| `scenarios` | checks in p1-reviewed | 36 |
| `scenarios` | checks in p1-voided | 32 |
| `scenarios` | checks in p1-invoiced | 27 |
| `scenarios` | checks in golden-mission | 36 |
| `scenarios` | checks in p1-left-out | 31 |
| `scenarios` | checks in first-admin | 32 |
| `scenarios` | checks in p1-queued | 20 |
| `scenarios` | checks in p1-viewed | 26 |
| `scenarios` | checks in under-the-passcode | 9 |
| `scenarios` | checks in offline-sign-in | 5 |
| `scenarios` | checks in held-for-review | 16 |
| `scenarios` | checks in interrupted-upload | 8 |
| `scenarios` | checks in burst | 8 |
| `scenarios` | checks in lost-phone-key | 14 |
| `scenarios` | stories | 24 |
| `e2e` | browser tests | 69 |
| `e2e` | screens | 60 |
| `security` | grant test files | 50 |
| `security` | grant tests | 1113 |
| `security` | security checks | 20 |
| `licences` | licensed packages | 470 |
<!-- end of counts -->

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
| `local:up` | 2026-10-21 00:41 UTC | 9s | ✓ |
| `installer:check` | 2026-10-21 00:42 UTC | 1s | ✓ |
| `install` | 2026-10-21 00:42 UTC | 0s | ✓ |
| `typecheck` | 2026-10-21 00:42 UTC | 2s | ✓ |
| `test` | 2026-10-21 00:42 UTC | 4m 26s | ✓ |
| `scenarios` | 2026-10-21 00:46 UTC | 5m 29s | ✓ |
| `e2e` | 2026-10-21 00:52 UTC | 1m 07s | ✓ |
| `security` | 2026-10-21 00:53 UTC | 9s | ✓ |
| `lint` | 2026-10-21 00:53 UTC | 1m 12s | ✓ |
| `licences` | 2026-10-21 00:54 UTC | 1s | ✓ |

| Step | Count | Today |
|---|---|---|
| `installer:check` | installer:check ✓ | 38 |
| `installer:check` | migrations at head | 151 |
| `test` | test files | 216 |
| `test` | tests | 3676 |
| `test` | tests in apps/api | 772 |
| `test` | files in apps/api | 59 |
| `test` | tests in apps/field | 255 |
| `test` | files in apps/field | 20 |
| `test` | tests in apps/worker | 51 |
| `test` | files in apps/worker | 6 |
| `test` | tests in infra/local | 77 |
| `test` | files in infra/local | 6 |
| `test` | tests in packages/contracts | 102 |
| `test` | files in packages/contracts | 9 |
| `test` | tests in packages/db | 1113 |
| `test` | files in packages/db | 50 |
| `test` | tests in packages/domain | 928 |
| `test` | files in packages/domain | 50 |
| `test` | tests in packages/receipts | 32 |
| `test` | files in packages/receipts | 2 |
| `test` | tests in packages/scenarios | 163 |
| `test` | files in packages/scenarios | 7 |
| `test` | tests in tools/chain | 20 |
| `test` | files in tools/chain | 1 |
| `test` | tests in tools/security | 143 |
| `test` | files in tools/security | 3 |
| `test` | tests in tools/setup | 20 |
| `test` | files in tools/setup | 3 |
| `scenarios` | story migrations | 151 |
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
| `scenarios` | checks in golden-mission | 32 |
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
| `e2e` | browser tests | 55 |
| `e2e` | screens | 55 |
| `security` | grant test files | 50 |
| `security` | grant tests | 1113 |
| `security` | security checks | 16 |
| `licences` | licensed packages | 472 |
<!-- end of counts -->

# Open ADMS Final Product Specification

This directory is the source of truth for what Open ADMS must be at v1.0. It
is not a design sketch and not a backlog. It is the definition of correct
against which the running system is measured.

Nothing here describes how something is implemented. Every statement describes
observable behavior a person or a test can check.

## Why this exists

Debris monitoring data is read years after the work, by someone looking for a
reason to deobligate a reimbursement. The system that holds it has to be right,
and "right" has to be written down before it can be verified. Three source
documents held that knowledge in prose. This spec turns them into numbered,
testable requirements and connects each one to the code that satisfies it.

## The documents

| File | Covers | ID prefix |
|---|---|---|
| `README.md` | This file. How to read the spec, the rules of the spec itself. | none |
| `01-product-definition.md` | What Open ADMS is, the industry it sits in, every actor, v1.0 scope boundary, glossary. | none |
| `02-domain-model.md` | Entities, relationships, ticket archetypes, every state machine, the numbering and measurement models. | none |
| `03-user-stories.md` | Every story by actor, each with acceptance criteria, each citing its requirements. | `US-` |
| `04-field-app.md` | The mobile field surface. | `FR-FLD-` |
| `05-back-office.md` | The desktop back office surface. | `FR-BO-` |
| `06-billing-engine.md` | Rules, service codes, rates, transactions, invoices. | `FR-BIL-` |
| `07-access-control.md` | Roles, permissions, project scoping, authentication, device policy. | `FR-ACC-` |
| `08-integrity-and-exceptions.md` | Audit, the exception and anomaly engine, pending reconciliation. | `FR-INT-` |
| `09-geospatial.md` | Maps, layers, geofencing, spatial query, portal integration. | `FR-GEO-` |
| `10-design-system.md` | State colors, interaction patterns, field ergonomics, copy rules. | `DS-` |
| `11-non-functional.md` | Offline, sync SLAs, performance, security, portability, hardware. | `NFR-` |
| `12-conformance-matrix.md` | Every ID mapped to build status, code location, verification method. | none |
| `diagrams/` | Excalidraw source for the two presentation maps. | none |

## Requirement format

Every requirement is a row in a table. Prose around a table is context, never
a requirement. If it is not in a row with an ID, it does not bind.

| Column | Rule |
|---|---|
| `ID` | Prefix plus a zero padded number, unique forever. Numbers are never reused, never renumbered. A withdrawn requirement is marked `Withdrawn`, not deleted. |
| `Lvl` | `MUST`, `SHOULD`, or `MAY`. See below. |
| `Requirement` | One sentence, present tense, describing behavior. No implementation detail. |
| `Acceptance` | How it is proven. Observable by a test or visible in a screenshot. A requirement with no acceptance criterion does not go in the spec. |
| `Src` | Where it came from. See below. |
| `Status` | `Built`, `Partial`, `Missing`, or `Withdrawn`, assessed against the actual code. |

## Conformance levels

| Level | Meaning |
|---|---|
| `MUST` | Required for the v1.0 release. A `MUST` at `Missing` or `Partial` blocks release. |
| `SHOULD` | Targeted for v1.0. May slip to a point release with a written reason recorded in the conformance matrix. |
| `MAY` | Post 1.0. Recorded so it is not lost or rediscovered later. Never blocks anything. |

The level is the scope lever. To move the release date, change levels. Do not
delete requirements: a deleted requirement is knowledge lost, a downgraded one
is a decision recorded.

## Source tags

Every requirement declares where it came from, so its authority is auditable.

| Tag | Meaning |
|---|---|
| `[SN §x]` | `SYSTEM_NEEDS.md`, named section. Derived from eight production systems observed in the field. |
| `[RN]` | `RunNotes.md`. Working session observations. |
| `[ADMS]` | `What is an ADMS.docx`. The original domain reasoning and the legacy Open Recover field inventory. |
| `[BUILT]` | Already implemented and working. Recorded here to lock it in as intended behavior so a later change is a deliberate decision rather than an accident. |
| `[PROPOSED]` | Not present in any source. Written from judgment about what the system needs to be coherent or complete. |

`[PROPOSED]` is the accountability tag. Everything carrying it is listed in one
register at the end of this file. Review that register and accept, downgrade,
or withdraw each item. Nothing enters the spec from judgment without appearing
there.

## Status values

| Status | Meaning |
|---|---|
| `Built` | Implemented and working today. The conformance matrix names the file. |
| `Partial` | Something exists but does not meet the acceptance criterion. The matrix names what is missing. |
| `Missing` | Nothing exists. |
| `Withdrawn` | Was in the spec, removed by decision. The row stays with the reason so the decision is not relitigated. |

Status is assessed against the code, not assumed. A `Built` claim that a
reviewer cannot verify from the named file is a defect in the spec.

## Verification methods

The conformance matrix assigns each requirement one method.

| Method | Meaning |
|---|---|
| `schema-test` | An assertion in `database/tests/schema_tests.sql`. Invariants enforced by the database belong here. |
| `api-test` | A case in `backend/tests/`. Request and response behavior. |
| `ui-test` | A browser driven case. Interaction and gating behavior. |
| `visual` | A screenshot judged against a named `DS-` requirement. Used only where appearance is the requirement. |
| `manual` | Human inspection. Every `manual` on a `MUST` is a gap in the test suite and is tracked as one. |

## The v1.0 release gate

The release is met when all of the following hold.

1. Every `MUST` requirement has status `Built`.
2. Every `MUST` requirement has a verification method that is not `manual`, or
   a recorded exception naming why automation is not possible.
3. Every `SHOULD` requirement is `Built`, or is downgraded with a written
   reason in the conformance matrix.
4. The conformance matrix reconciles: total requirements equals the sum of the
   status counts, and no requirement lacks a code location or a verification
   method.

## Changing the spec

The spec changes before the code does, not after. When implementation reveals
that a requirement is wrong, the requirement is amended and the amendment is
dated in the conformance matrix. Code that diverges from an unamended
requirement is a defect in the code.

Amendments follow the same rules as the original: an observable acceptance
criterion, a source tag, a status.

## Register of proposed requirements

Populated as the functional documents are written. Every `[PROPOSED]`
requirement in the spec appears here for review.

_Pending. This register is completed at the end of Phase B._

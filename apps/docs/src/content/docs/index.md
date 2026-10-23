---
title: Open ADMS documentation
description: Open-source debris management and field reconciliation for disaster recovery. Set it up, run a mission, and understand every rule it applies.
template: splash
hero:
  title: Open ADMS documentation
  tagline: The system of record for a debris mission, from declaration to audit. Two monitors record every load, the server joins them on the ticket number, and every dollar traces back to its evidence.
  actions:
    - text: Quick start
      link: get-started/quick-start/
      icon: right-arrow
    - text: What is Open ADMS?
      link: get-started/what-is-open-adms/
      variant: minimal
---

## Start here

- **[What is Open ADMS?](/get-started/what-is-open-adms/)** The problem it solves, who uses it, and
  what it deliberately is not.
- **[Quick start](/get-started/quick-start/)** Bring a whole installation up on one machine with one
  command, with the sample projects loaded.
- **[Install an installation](/get-started/install/)** What the installer asks, what it sets up, and
  how to run it again safely.

## Understand the model

- **[Two field events, one ticket](/concepts/two-field-events/)** Why every load is recorded twice,
  by two monitors who cannot see each other, and joined only on the server.
- **[The load call](/concepts/load-call/)** The number the money hangs on.
- **[Flags, never blocks](/concepts/flags/)** How every problem becomes a plain message for review.
- **[The ledger and the audit trail](/concepts/ledger-and-audit/)** Pay items, rules, transactions
  that are regenerated, and an audit log that is append-only.

## Guides by role

| You are                                            | Start with                                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Back office** (admin, manager/analyst)           | [Set up a project](/guides/back-office/set-up-a-project/), then [Dispatch](/guides/back-office/dispatch/) and [Review and correct](/guides/back-office/review-and-correct/) |
| **Field monitor**                                  | [Field monitors](/guides/field-monitors/): sign in, capture, sync                                                                                                           |
| **Read-only viewer** (client, contractor, auditor) | [Viewers](/guides/viewers/)                                                                                                                                                 |
| **Developer or operator**                          | [Architecture](/reference/architecture/), [API reference](/reference/api/), [Commands](/reference/commands/)                                                                |

## For agents and assistants

Every page has a **Copy page** button and a menu to view it as Markdown or open it in Claude or
ChatGPT. Every page is also served as Markdown at its own address with `.md` in place of the
trailing slash, [llms.txt](/llms.txt) indexes them all, and [llms-full.txt](/llms-full.txt) holds
the whole documentation in one file.

Open ADMS is open source under the [Apache License 2.0](/licence/). A firm installs it and runs its
own installation; the source is on [GitHub](https://github.com/MrRyanAlexander/openadms).

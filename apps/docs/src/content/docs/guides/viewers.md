---
title: Viewers
description: What a client user, a contractor user or an auditor sees in the read-only viewer portal, how they sign in, and what is kept from them.
---

The firm issues **read-only viewer** logins to the people who need to see the work but never change
it: a **client user** (such as Bayline County's debris manager), a **contractor user** (such as
Coastline Haulers LLC's office), or an **auditor**. Each reaches the **viewer portal** in the browser,
over the API like every other screen; nothing in it changes a record.

## Signing in

An admin creates the login, picks the kind of viewer and the projects it sees. The viewer signs in
with their email address and password at the back office's address. **Two-step sign-in is optional
for viewers**, unless the firm requires it in its settings.

## What each viewer sees

| Viewer              | Sees                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------- |
| **Client user**     | Their whole project, except people's personal phone and licence numbers                      |
| **Auditor**         | The same: the whole project, except personal phone and licence numbers                       |
| **Contractor user** | **Only its own tickets and transactions**; a prime sees its subs' too, never another prime's |

Whether a viewer sees **private citizens by name** (an ROE's property owner, a drop-off log's
resident and their address) is the firm's choice for each viewer, changed at any time, audited. The
database enforces what each viewer may read, not only the screens.

## In the portal

- **Your projects**: the projects you are given, open or closed, with their time zones.
- **Tickets**: by workflow, each with its status and its field events. A ticket's page shows its
  field events, flags (open, accepted or cleared), QC status, invoice lock and its history.
- **Certifications**, **ROEs and forms**, and the project's **setup**, read only.

The portal shows the same current truth the back office sees: corrections, voids and reprocessing
show as they happen, and any ledger row a viewer may see can be walked back to its evidence.

## Related

- [What is Open ADMS?](/get-started/what-is-open-adms/)
- [Security](/security/)

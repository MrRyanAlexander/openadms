---
title: Assignments and phones
description: A phone is enrolled once; each day's work comes from the monitor's assignment on the dispatch board; the master passcode is the supervisor's fallback; offline sign-in is protected by the phone itself.
---

A field monitor's phone never asks them to pick a project or a site. **The phone is enrolled once**,
and each day it takes the **assignment** the back office wrote for whoever signs in on it.

## Enrolment, once

A phone is **enrolled** once, online, with the **master passcode**. It makes its own **device key**
in its secure hardware, a key that can't be exported, so a phone can't be copied or swapped, and it
joins the firm's phones under a name such as `P1-COL-1`. Enrolment gives no project and no monitor.

## The day's assignment

The back office's **dispatch board** writes each person's **assignment** for a day:

- one **project**;
- their **work**: which ticket types, which unit rate pay items, whether they certify;
- **one site** where the work is at one (a tower, either end of a haul-out, a drop-off log);
- optionally, a phone.

At the start of the day the monitor signs in on **any enrolled phone** with their Monitor ID and
password. Online, the phone receives their assignment, the lists that go with it and its blocks of
ticket numbers. No master passcode, no picking.

- **One assignment, so one project, on a phone at a time.** A tower monitor working two projects
  carries two phones.
- An assignment never expires and never stops work.

### No assignment?

With no assignment, the **master passcode** opens setup on the phone: project, work, site and
monitor. It works online, or offline on a project whose lists the phone already holds. It is
recorded as an **unplanned assignment**: marked, never flagged, and shown on the dispatch board at
the next sync.

## The master passcode

There is **one master passcode per firm**, set at install and changed only when the firm chooses.
The server and each phone keep only a slow hash of it. Whoever holds it, usually a supervisor, can:

- enrol a phone and set one up when its monitor has no assignment;
- create field monitors on a phone (each gets a system **Monitor ID**, such as `M004127`);
- sign in as the phone's monitor, or open a temporary session for a monitor from the roster;
- switch the phone to another monitor;
- sync a phone and turn it in.

Every use is recorded as a security event, and a session opened with it marks every record made
in it.

## Signing in offline

A phone that has been set up holds a **login list**: a sign-in check for each monitor of its project,
each a slow hash with a salt unique to that phone, kept only inside the encrypted store. The
safeguards:

- monitor credentials work **only on enrolled phones**, never on the web;
- sign-in waits after the 5th wrong try in a row and **locks after the 10th** until the master
  passcode;
- the app locks after a period with nothing touched (30 minutes by default), warning first;
- a screen-lock passcode on every phone is strongly recommended.

## Switching monitors

Switching needs the master passcode first; then the next monitor signs in with their own Monitor ID
and password. An earlier monitor's work not yet synced is kept on the phone, still theirs, hidden
from the next monitor, and synced in the background.

## Data on the phone

- **Encrypted at rest**, with a key held in the phone's secure storage, never derived from a
  password, so a supervisor can sync a phone whose monitor has walked away.
- **Never backed up** to iCloud or Google.
- **Taken out of service** with the master passcode and _Sync and turn in_: the phone uploads every
  queue, the server confirms it holds all of it, the phone's unused numbers go back and its key is
  revoked, and only then does the phone wipe. Nothing is wiped before the server confirms it.

:::note[The browser build]
The field app runs today as a browser build, for testing, with its store encrypted by keys the
browser can't export. The native iPhone and Android builds (the same code wrapped with Capacitor,
the device key in the Secure Enclave or the Android Keystore) are planned.
:::

## The time clock

An optional per-project add-on: anyone with an assignment clocks in, takes breaks and clocks out by
hand, with simple nudges; activity is pre-filled from their field events; a manager approves the
day, and hours are exported for payroll and client billing. It is never related to crew-time
billing.

## Related

- [Dispatch](/guides/back-office/dispatch/)
- [Field monitors](/guides/field-monitors/)
- [Offline and sync](/concepts/offline-and-sync/)

---
title: Dispatch
description: People and their permissions, phones, the dispatch board that gives each person the day's assignment, and the time clock's approval.
---

Dispatch replaces the spreadsheet. Each day the back office writes on the **dispatch board** who
works where, on what; each monitor's phone takes that assignment when they sign in. Nothing on the
board stops work.

## People and permissions

**The firm → People** lists the firm's back office, its field monitors and the read-only viewers it
issues. Nobody is deleted: a person who left is archived, and everything they made still names them.

| Role               | Created by                                                      | Notes                                                                                                          |
| ------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Admin              | An admin                                                        | Holds every permission                                                                                         |
| Manager or analyst | An admin                                                        | Holds only the permissions granted                                                                             |
| Field monitor      | **A supervisor, on a phone, online, under the master passcode** | Gets a system Monitor ID such as `M004127`; an employer (such as a temp agency) and its own ID may be recorded |
| Read-only viewer   | An admin                                                        | A client user, a contractor user or an auditor; see [Viewers](/guides/viewers/)                                |

A manager or analyst's **permissions** are granted one by one: _View review_, _Correct records_,
_Renumber_, _Void_, _Accept a flag_, _QC_, _Lock as invoiced_, _Unlock an invoiced ticket_, _View
setup_, _Set up_, _View dispatch_, _Dispatch_, _Approve hours_. An act needs its area's view beside
it, and a permission taken away refuses their very next request. An admin also chooses which
projects each person sees, can set a password for them (they choose their own at their next
sign-in), clear their two-step sign-in, or end their sessions.

## Phones

**The firm → Phones** lists every enrolled phone, such as `P1-COL-1` or `P1-TWR-TDSR`. A phone is
enrolled once, on the phone, with the master passcode. From here you rename a phone, see who signed
in on it, and **take it out of service** (lost, stolen, broken, replaced) or return it. Work a phone
made after it was taken out of service is still received, and flagged. A lost phone's key can be
revoked after a set time (a firm setting).

## The dispatch board

**Dispatch and hours → Dispatch board.** Pick a day and **assign someone**:

| Field                      | Example: Monday 12 October 2026                                                         |
| -------------------------- | --------------------------------------------------------------------------------------- |
| Person                     | Kim Nguyen (`M004128`)                                                                  |
| Work                       | Disposals; drop-off logs                                                                |
| Site                       | Marsh Road TDSR (one site, where the work is at one: a tower, either end of a haul-out) |
| Phone                      | `P1-TWR-TDSR`, or any phone                                                             |
| Unit rate work             | For unit rate monitors: the pay items they do (hangers, leaners, stumps…)               |
| Certifies trucks and crews | For a monitor who certifies                                                             |

- **One project per assignment, one assignment per phone.** A tower monitor working two projects
  carries two phones, with an assignment on each.
- **Copy this day to another** to repeat a day's plan; **withdraw** or **reinstate** an assignment.
- The board shows what is **worth a look** beside an assignment: a second assignment for the person
  or phone that day, a day outside the project's active window, a closed project, unit rate pay items
  named with no unit rate work, a site not yet active or closed. A warning never stops anything.
- An assignment a supervisor made on a phone with the master passcode, because there was none, shows
  as **made on the phone, under the master passcode**: an _unplanned assignment_, marked, never
  flagged.

## The time clock

Where a project uses it, **Dispatch and hours → Time clock** shows workers' own hours by their
assignment: worked, on a break, still clocked in. The day ends before midnight in the project's time
zone; what is worked past it counts on the next day. A manager with _Approve hours_ approves a
worker's day, which then is locked until it is unlocked with a note. Hours are exported for payroll
and for billing the client. The time clock is never related to crew-time billing.

## Related

- [Assignments and phones](/concepts/assignments-and-phones/)
- [Field monitors](/guides/field-monitors/)

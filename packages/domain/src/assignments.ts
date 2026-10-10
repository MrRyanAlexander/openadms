// A day's assignments, as the back office writes them on the dispatch board (ARCHITECTURE §7;
// spec/parts/02-people-and-devices.md step 4; spec/acceptance/02-people-and-devices.md AC-02-24…32;
// ADR-127, 240, 241, 281, 286, 308, 429).
//
// - **Who is given one.** A monitor, or one of the firm's own back office (anyone with an
//   assignment may clock in, ADR-241); never a read-only viewer, who is an outside party's user,
//   never the system actor, never somebody archived.
// - **The forms it names** are the four that are no ticket's: an ROE, a survey, an incident, a
//   drop-off log (ADR-308). A ticket's work is named by the kinds of field event; certifying is
//   its own tick.
// - **A phone it names is in service.** No phone need be named: the monitor signs in on any
//   enrolled phone.
// - **Its pay items are unit rate pay items**: only one with a kind of work can be named.
// - **It is withdrawn once**, and a withdrawn one is changed no more. **One made on a phone under
//   the master passcode (unplanned) is the phone's**: the board reads it and changes nothing of it.
//
// - **A phone takes one at sign-in** (ADR-240, 444): of the monitor's assignments that stand, those
//   whose day is today in their own project's time zone. The one that names this phone; with
//   none naming it, the only one there is, whichever phone the board named (a monitor signs in
//   on any enrolled phone). Where that leaves several, the phone takes none and says so: nobody
//   picks a project on a phone, and the server never picks one for them.
//
// Nothing here stops a second assignment for one person or one phone on a day (AC-02-29), judges
// a date, or says an assignment has run out: it never expires and never stops work (ADR-240).
import { ProjectClock } from './project-clock.ts';

// The forms an assignment may name, as the database's check holds them.
export const assignmentFormDocumentTypes = ['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG'] as const;

export type AssignmentFormDocumentType = (typeof assignmentFormDocumentTypes)[number];

// Who an assignment may be for.
export const assignableRoles = ['MONITOR', 'ADMIN', 'MANAGER_ANALYST'] as const;

export type AssignmentRefusalCode =
  | 'PERSON_NOT_ASSIGNABLE'
  | 'PERSON_ARCHIVED'
  | 'PHONE_OUT_OF_SERVICE'
  | 'NOT_A_UNIT_RATE_PAY_ITEM'
  | 'ALREADY_WITHDRAWN'
  | 'MADE_ON_A_PHONE';

export interface AssignmentRefusal {
  readonly code: AssignmentRefusalCode;
  readonly message: string;
}

// One of a person's assignments that stand, as a sign-in reads it.
export interface StandingAssignment {
  readonly id: string;
  // The day, in the project's time zone: 2026-10-12.
  readonly workDate: string;
  // The project's time zone, an IANA name.
  readonly timeZone: string;
  // The phone the board named, if it named one.
  readonly deviceId: string | null;
}

// Why a phone took no assignment at a sign-in.
export const noAssignmentReasons = ['NONE_THAT_DAY', 'SEVERAL_THAT_DAY'] as const;

export type NoAssignmentReason = (typeof noAssignmentReasons)[number];

export type AssignmentTaken =
  | { readonly taken: true; readonly id: string }
  | { readonly taken: false; readonly why: NoAssignmentReason };

export class AssignmentRules {
  // Which of a monitor's standing assignments the phone they sign in on takes, now.
  takenAtSignIn(
    now: Date,
    deviceId: string,
    standing: readonly StandingAssignment[],
  ): AssignmentTaken {
    const today = standing.filter(
      (assignment) => new ProjectClock(assignment.timeZone).day(now) === assignment.workDate,
    );
    const here = today.filter((assignment) => assignment.deviceId === deviceId);
    const [only, ...others] = here.length > 0 ? here : today;
    if (only === undefined) return { taken: false, why: 'NONE_THAT_DAY' };
    if (others.length > 0) return { taken: false, why: 'SEVERAL_THAT_DAY' };
    return { taken: true, id: only.id };
  }

  // Why this person can't be given an assignment, or nothing.
  personRefusal(person: {
    readonly name: string;
    readonly role: string;
    readonly archived: boolean;
  }): AssignmentRefusal | null {
    if (!assignableRoles.some((role) => role === person.role)) {
      return {
        code: 'PERSON_NOT_ASSIGNABLE',
        message: `${person.name} can’t be given an assignment: one is for a monitor or one of the firm’s back office. Nothing was saved.`,
      };
    }
    if (person.archived) {
      return {
        code: 'PERSON_ARCHIVED',
        message: `${person.name} is archived, and can’t be given an assignment. Nothing was saved.`,
      };
    }
    return null;
  }

  // Why this phone can't be named on an assignment, or nothing.
  phoneRefusal(phone: {
    readonly name: string;
    readonly outOfServiceAt: Date | null;
  }): AssignmentRefusal | null {
    if (phone.outOfServiceAt === null) return null;
    return {
      code: 'PHONE_OUT_OF_SERVICE',
      message: `${phone.name} was taken out of service. Name another phone, or none. Nothing was saved.`,
    };
  }

  // Why this pay item can't be named on an assignment, or nothing.
  payItemRefusal(payItem: {
    readonly code: string;
    readonly kindOfWorkId: string | null;
  }): AssignmentRefusal | null {
    if (payItem.kindOfWorkId !== null) return null;
    return {
      code: 'NOT_A_UNIT_RATE_PAY_ITEM',
      message: `${payItem.code} is no unit rate pay item: an assignment names only the unit rate pay items a person does that day. Nothing was saved.`,
    };
  }

  // Why the board can't change or withdraw this assignment, or nothing.
  changeRefusal(assignment: {
    readonly personName: string;
    readonly origin: string;
    readonly withdrawn: boolean;
  }): AssignmentRefusal | null {
    if (assignment.origin !== 'PLANNED') {
      return {
        code: 'MADE_ON_A_PHONE',
        message: `${assignment.personName}’s assignment was made on a phone under the master passcode: the board shows it and changes nothing of it. Nothing was changed.`,
      };
    }
    if (assignment.withdrawn) {
      return {
        code: 'ALREADY_WITHDRAWN',
        message: `${assignment.personName}’s assignment was already withdrawn. Nothing was changed.`,
      };
    }
    return null;
  }
}

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
// Nothing here stops a second assignment for one person or one phone on a day (AC-02-29), judges
// a date, or says an assignment has run out: it never expires and never stops work (ADR-240).

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

export class AssignmentRules {
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

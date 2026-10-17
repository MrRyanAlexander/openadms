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
//   picks a project on a phone, and the server never picks one for them. **But where several
//   name this phone, it takes the one made on it last** (ADR-458): one made on a phone under the
//   master passcode is what was last decided there, after the board's plan and after any made
//   on it earlier that day (the phone moved to another site, or passed to this monitor).
//
// - **One made on a phone under the master passcode is received as the phone reports it**
//   (ADR-240, 457; AC-02-38, AC-05-40): its day is the day its phone's clock said, in the
//   project's time zone; it is for a monitor, the only people a phone's login list names,
//   archived since or not (the work was done: nothing is refused over eligibility). Reported
//   again by the phone that made it, it is already saved; an id another record holds is not.
//   **It says what it was made at** (ADR-458): a phone set up (also at another of the project's
//   sites: a site move is a setup anew, and the earlier assignment stands), or a phone passed
//   to a monitor who had no assignment it could take. Each is a use of the master passcode.
//
// Nothing here stops a second assignment for one person or one phone on a day (AC-02-29), or
// says an assignment has run out: it never expires and never stops work (ADR-240). **The board
// warns** of what a person reading it would want to see (`BoardWarnings`, ADR-535): warnings are
// read beside an assignment, never stop a write, and are worked out from the board as it stands.
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
  | 'NOT_WITHDRAWN'
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
  // The phone the board named, if it named one; an unplanned one's is the phone it was made on.
  readonly deviceId: string | null;
  // An unplanned one only: when it was made, by its phone's clock.
  readonly madeAt: Date | null;
}

// What an unplanned assignment was made at, as its phone reports it: the phone set up under
// the master passcode (at a first site or, moved, at another), or passed to another monitor.
export const unplannedOccasions = ['SETUP', 'MONITOR_SWITCH'] as const;

export type UnplannedOccasion = (typeof unplannedOccasions)[number];

// The security events one saved is: what was done, then what opened it.
export type UnplannedSecurityEvent = 'DEVICE_SETUP' | 'DEVICE_SWITCH' | 'MASTER_PASSCODE_USE';

// Why what a phone reported as an unplanned assignment can't be kept as one: something it
// names is no record of the kind it must be, or its id is another record's. Never a judgement
// of the work.
export const unplannedAssignmentRefusals = [
  'UNKNOWN_PROJECT',
  'NOT_A_MONITOR',
  'NOT_THE_PROJECTS_SITE',
  'NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM',
  'ID_ALREADY_HELD',
  // Its project was closed before it arrived (ADR-529 (b)).
  'PROJECT_CLOSED',
] as const;

export type UnplannedAssignmentRefusal = (typeof unplannedAssignmentRefusals)[number];

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
    if (others.length === 0) return { taken: true, id: only.id };
    // Several name this phone: the one made on it last, if one alone was.
    const made = here.flatMap(({ id, madeAt }) => (madeAt === null ? [] : [{ id, madeAt }]));
    const last = Math.max(...made.map(({ madeAt }) => madeAt.getTime()));
    const [lastMade, ...asLate] = made.filter(({ madeAt }) => madeAt.getTime() === last);
    if (lastMade === undefined || asLate.length > 0) {
      return { taken: false, why: 'SEVERAL_THAT_DAY' };
    }
    return { taken: true, id: lastMade.id };
  }

  // The security events an unplanned assignment saved is, by what it was made at.
  securityEventsOf(occasion: UnplannedOccasion): readonly UnplannedSecurityEvent[] {
    return [
      occasion === 'MONITOR_SWITCH' ? 'DEVICE_SWITCH' : 'DEVICE_SETUP',
      'MASTER_PASSCODE_USE',
    ];
  }

  // The day an unplanned assignment is for: the day its phone's clock said it was made, in the
  // project's time zone. The device's clock is the recorded time (ADR-100).
  unplannedDay(madeAt: Date, timeZone: string): string {
    return new ProjectClock(timeZone).day(madeAt);
  }

  // Whether an unplanned assignment may be for them: a phone sets itself up for a monitor from
  // its login list. One archived since is still who did the work.
  mayHoldUnplanned(person: { readonly role: string } | null): boolean {
    return person?.role === 'MONITOR';
  }

  // An id the server already holds, reported as an unplanned assignment by that phone: the same
  // report sent again, or another record's id.
  reportedAgain(
    held: { readonly origin: string; readonly deviceId: string | null },
    deviceId: string,
  ): 'ALREADY_SAVED' | 'ID_ALREADY_HELD' {
    return held.origin === 'UNPLANNED' && held.deviceId === deviceId
      ? 'ALREADY_SAVED'
      : 'ID_ALREADY_HELD';
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

  // Why the board can't put this withdrawn assignment back, or nothing (ADR-527 (13)): one made
  // on a phone is never the board's, and one that stands has nothing to put back. Its person
  // and its phone are asked as a new one's are.
  putBackRefusal(assignment: {
    readonly personName: string;
    readonly origin: string;
    readonly withdrawn: boolean;
  }): AssignmentRefusal | null {
    if (assignment.origin !== 'PLANNED') return this.changeRefusal(assignment);
    if (!assignment.withdrawn) {
      return {
        code: 'NOT_WITHDRAWN',
        message: `${assignment.personName}’s assignment stands: there is nothing to put back. Nothing was changed.`,
      };
    }
    return null;
  }
}

// What the board warns of beside an assignment (BACKLOG C103, C115; ADR-535 (1)): each a plain
// sentence a person reads, never a refusal and never a ticket's flag (ADR-240). Worked out from
// the assignment, its project and site as they stand, and the other assignments that stand that
// day for the same person or the same phone.
export const boardWarningCodes = [
  // Another assignment that stands for the same person that day (AC-02-29).
  'PERSON_TWICE_THAT_DAY',
  // Another assignment that stands naming the same phone that day.
  'PHONE_TWICE_THAT_DAY',
  // The day is before the project's active window opens or after it closes (ADR-057, 161).
  'OUTSIDE_THE_ACTIVE_WINDOW',
  // The project is closed (ADR-529 (b)).
  'PROJECT_CLOSED',
  // Unit rate pay items are named where no unit rate work is.
  'PAY_ITEMS_WITHOUT_UNIT_RATE_WORK',
  // Its site isn't yet active that day, or was closed by then.
  'SITE_NOT_ACTIVE',
] as const;

export type BoardWarningCode = (typeof boardWarningCodes)[number];

export interface BoardWarning {
  readonly code: BoardWarningCode;
  readonly message: string;
}

// An assignment as the board's warnings read it.
export interface AssignmentOnTheBoard {
  readonly id: string;
  readonly personName: string;
  // 2026-10-12, in the project's time zone.
  readonly workDate: string;
  readonly withdrawn: boolean;
  readonly deviceId: string | null;
  readonly deviceName: string | null;
  readonly personId: string;
  readonly fieldEventKinds: readonly string[];
  readonly payItemCount: number;
  readonly project: {
    readonly name: string;
    // Calendar days, the end optional.
    readonly activeFrom: string;
    readonly activeTo: string | null;
    readonly closed: boolean;
  };
  readonly site: {
    readonly name: string;
    // Calendar days, either optional.
    readonly activeFrom: string | null;
    readonly closedOn: string | null;
  } | null;
}

export class BoardWarnings {
  // The warnings beside one assignment; `others` are the other assignments that stand that day
  // for its person or its phone, on any project. A withdrawn assignment is warned of nothing.
  of(
    assignment: AssignmentOnTheBoard,
    others: readonly {
      readonly id: string;
      readonly personId: string;
      readonly deviceId: string | null;
      readonly projectName: string;
    }[],
  ): BoardWarning[] {
    if (assignment.withdrawn) return [];
    const day = assignment.workDate;
    const who = assignment.personName;
    const warnings: BoardWarning[] = [];
    const elsewhere = others.filter((other) => other.id !== assignment.id);
    const samePerson = elsewhere.filter((other) => other.personId === assignment.personId);
    if (samePerson.length > 0) {
      warnings.push({
        code: 'PERSON_TWICE_THAT_DAY',
        message: `${who} has ${BoardWarnings.count(samePerson.length, 'other assignment')} on ${day} (${BoardWarnings.projects(samePerson)}). A phone takes one assignment at a time.`,
      });
    }
    const samePhone =
      assignment.deviceId === null
        ? []
        : elsewhere.filter((other) => other.deviceId === assignment.deviceId);
    if (samePhone.length > 0) {
      warnings.push({
        code: 'PHONE_TWICE_THAT_DAY',
        message: `${assignment.deviceName ?? 'This phone'} is named on ${BoardWarnings.count(samePhone.length, 'other assignment')} on ${day} (${BoardWarnings.projects(samePhone)}).`,
      });
    }
    const { project } = assignment;
    if (day < project.activeFrom || (project.activeTo !== null && day > project.activeTo)) {
      warnings.push({
        code: 'OUTSIDE_THE_ACTIVE_WINDOW',
        message: `${day} is outside ${project.name}’s active window (${project.activeFrom} to ${project.activeTo ?? 'no end'}): its tickets will be flagged "project not active".`,
      });
    }
    if (project.closed) {
      warnings.push({
        code: 'PROJECT_CLOSED',
        message: `${project.name} is closed: field work sent for it is held for a person.`,
      });
    }
    if (assignment.payItemCount > 0 && !assignment.fieldEventKinds.includes('UNIT_RATE')) {
      warnings.push({
        code: 'PAY_ITEMS_WITHOUT_UNIT_RATE_WORK',
        message: `${who}’s assignment names ${BoardWarnings.count(assignment.payItemCount, 'unit rate pay item')} but no unit rate work: the phone won’t offer them.`,
      });
    }
    const { site } = assignment;
    if (
      site !== null &&
      ((site.activeFrom !== null && day < site.activeFrom) ||
        (site.closedOn !== null && day > site.closedOn))
    ) {
      warnings.push({
        code: 'SITE_NOT_ACTIVE',
        message:
          site.activeFrom !== null && day < site.activeFrom
            ? `${site.name} isn’t active until ${site.activeFrom}.`
            : `${site.name} was closed on ${site.closedOn ?? ''}.`,
      });
    }
    return warnings;
  }

  private static count(n: number, what: string): string {
    return `${String(n)} ${what}${n === 1 ? '' : 's'}`;
  }

  private static projects(others: readonly { readonly projectName: string }[]): string {
    return [...new Set(others.map((other) => other.projectName))].join(', ');
  }
}

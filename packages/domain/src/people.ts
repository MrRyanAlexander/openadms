// Who may do what at the back office, and the rules of the firm's people (ARCHITECTURE §6,
// Authorization, §7.0; spec/acceptance/02-people-and-devices.md AC-02-08, 11, 12, 13, 72;
// spec/acceptance/10-api-and-sync.md AC-10-27; spec/THREAT-MODEL.md T-14; ADR-050, 105, 169, 315,
// 415). OWASP ASVS 5.0 V8; API Security Top 10, API5.
//
// - **Who may call.** An endpoint names the roles it is open to and, where it is a reviewer's or
//   a setup action or a read of the back office, the one permission it takes. An admin holds
//   every permission; a manager/analyst holds the ones granted and not taken away; nobody else
//   holds any. The API asks this of the person as the database has them at that moment, on every
//   request.
// - **What the back office sees is granted too (the user, ADR-539).** Three view permissions,
//   granted apart from the acts: `VIEW_REVIEW` (the review queue, tickets and their lines with
//   rate and amount, field events, flags, certifications, the forms' records, a ticket's run
//   decisions, held, quarantined and set-aside records, invoice batches), `VIEW_SETUP` (setup's
//   records, the setup check, the quantity lookup, maps and shapes) and `VIEW_DISPATCH` (the
//   board, phones and their sessions, people). **An act needs its area's view beside its own
//   grant**: QC without `VIEW_REVIEW` is no QC.
// - **Who is created in the back office.** An admin, a manager/analyst and a read-only viewer; a
//   monitor is created on a phone under the master passcode, and the system actor by the seed.
// - **Who gives a permission.** An admin, who holds them all: so nobody gives one they don't
//   hold. A permission is given to a manager/analyst only: on anybody else it would grant nothing.
// - **The last admin stays.** A firm always has one admin who isn't archived: the only one can't
//   be archived or made anything else.
// - **A monitor's phone number** is read by admins only (by the firm's practice it is their
//   password, ADR-105).
// - **A role is changed between admin and manager/analyst only** (ADR-427): a monitor signs in
//   on a phone with a Monitor ID and a password the password rules don't read, and a read-only
//   viewer's record says whose user they are, so neither is made a back-office user by a
//   change of role, nor the other way.

// The permissions a manager/analyst can be granted, as the database's Permission keeps them: one
// closed set (spec/DATA-MODEL.md §2.2).
export const permissions = [
  'CORRECT',
  'RENUMBER',
  'VOID',
  'ACCEPT_FLAG',
  'QC',
  'LOCK_INVOICED',
  'UNLOCK_INVOICED',
  'APPROVE_HOURS',
  'SETUP',
  'DISPATCH',
  'VIEW_REVIEW',
  'VIEW_SETUP',
  'VIEW_DISPATCH',
] as const;

export type PermissionName = (typeof permissions)[number];

// What a manager/analyst is let see of the back office, each granted on its own (ADR-539).
export const viewPermissions = ['VIEW_REVIEW', 'VIEW_SETUP', 'VIEW_DISPATCH'] as const;

export type ViewPermission = (typeof viewPermissions)[number];

// The view an act needs beside its own grant: none for a view itself. Approving hours reads the
// people's days of the dispatch board, so it takes "view dispatch" (ADR-598).
const viewOfAct: Record<PermissionName, ViewPermission | null> = {
  CORRECT: 'VIEW_REVIEW',
  RENUMBER: 'VIEW_REVIEW',
  VOID: 'VIEW_REVIEW',
  ACCEPT_FLAG: 'VIEW_REVIEW',
  QC: 'VIEW_REVIEW',
  LOCK_INVOICED: 'VIEW_REVIEW',
  UNLOCK_INVOICED: 'VIEW_REVIEW',
  APPROVE_HOURS: 'VIEW_DISPATCH',
  SETUP: 'VIEW_SETUP',
  DISPATCH: 'VIEW_DISPATCH',
  VIEW_REVIEW: null,
  VIEW_SETUP: null,
  VIEW_DISPATCH: null,
};

// A permission as the back office's refusals name it.
export const permissionInWords: Record<PermissionName, string> = {
  CORRECT: 'correct',
  RENUMBER: 'renumber',
  VOID: 'void',
  ACCEPT_FLAG: 'accept flags',
  QC: 'QC',
  LOCK_INVOICED: 'lock as invoiced',
  UNLOCK_INVOICED: 'unlock',
  APPROVE_HOURS: 'approve hours',
  SETUP: 'setup',
  DISPATCH: 'dispatch',
  VIEW_REVIEW: 'view review',
  VIEW_SETUP: 'view setup',
  VIEW_DISPATCH: 'view dispatch',
};

// What a manager/analyst must be granted to hold that permission, as a refusal says it: the
// permission and, for an act, its area's view (`"QC" and "view review"`).
export function grantsInWords(permission: PermissionName): string {
  const view = viewOfAct[permission];
  return view === null
    ? `"${permissionInWords[permission]}"`
    : `"${permissionInWords[permission]}" and "${permissionInWords[view]}"`;
}

// Who signs in at the back office and the portal, and so who an admin creates there.
export const backOfficeCreated = ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] as const;

export type BackOfficeCreated = (typeof backOfficeCreated)[number];

// The three users that are no person and never a login: the worker's own actor, the actor an
// act under the master passcode is written as, and the actor a phone's own act is written as
// (ADR-273, 438, 440). Nobody reads, changes or signs in as any of them.
export const actorsOnly = ['SYSTEM', 'MASTER_PASSCODE', 'DEVICE_KEY'] as const;

export type ActorOnly = (typeof actorsOnly)[number];

export function actorOnly<Role extends string>(role: Role): role is Role & ActorOnly {
  return actorsOnly.some((actor) => actor === role);
}

// A person as these rules read them: their role, whether they have been archived, and the
// permissions they hold now (one taken away isn't among them).
export interface Holder {
  readonly role: string;
  readonly archived: boolean;
  readonly granted: readonly string[];
}

// What an endpoint asks of whoever calls it.
export interface Asked {
  readonly roles: readonly string[];
  readonly permission?: PermissionName | undefined;
}

export class Access {
  private readonly person: Holder;

  constructor(person: Holder) {
    this.person = person;
  }

  // An admin holds every permission and needs no grant; a manager/analyst the ones granted, an
  // act only with its area's view granted too (ADR-539); a monitor, a read-only viewer, the system
  // actor and anyone archived none.
  holds(permission: PermissionName): boolean {
    const { role, archived, granted } = this.person;
    if (archived) return false;
    if (role === 'ADMIN') return true;
    const view = viewOfAct[permission];
    return (
      role === 'MANAGER_ANALYST' &&
      granted.includes(permission) &&
      (view === null || granted.includes(view))
    );
  }

  // Whether this person reads the back office's records of that area (ADR-539): an admin, or a
  // manager/analyst granted its view; `null` for what every one of them reads (the projects, the
  // lists' values). Nobody else, and nobody archived.
  sees(view: ViewPermission | null): boolean {
    const { role, archived } = this.person;
    if (archived || (role !== 'ADMIN' && role !== 'MANAGER_ANALYST')) return false;
    return view === null || this.holds(view);
  }

  // Whether this person may call what asks for those roles and that permission. What names no
  // role is open to nobody.
  allowed(asked: Asked): boolean {
    const { role, archived } = this.person;
    if (archived || !asked.roles.includes(role)) return false;
    return asked.permission === undefined || this.holds(asked.permission);
  }
}

// Who may change the firm's setup (ARCHITECTURE §6, Authorization; ADR-050, 316, 424): an admin, or
// a manager/analyst who holds the permission Setup now; nobody else. A setup service asks this
// inside its own piece of work, before anything is changed, whatever the door already asked.
export interface SetupRightsRefusal {
  readonly code: 'NOT_ALLOWED';
  readonly message: string;
}

export class SetupRights {
  private readonly name: string;
  private readonly access: Access | null;

  // `person`: whoever asks, as the database has them now; null where it has nobody of that id.
  constructor(person: (Holder & { readonly name: string }) | null) {
    this.name = person?.name ?? 'Somebody the firm has no record of';
    this.access = person === null ? null : new Access(person);
  }

  // Why this person may not change the setup, or nothing.
  refusal(): SetupRightsRefusal | null {
    if (this.access?.holds('SETUP') === true) return null;
    return {
      code: 'NOT_ALLOWED',
      message: `${this.name} may not change the setup: it takes an admin, or a manager/analyst granted ${grantsInWords('SETUP')}. Nothing was changed.`,
    };
  }
}

// Who may dispatch (ARCHITECTURE §6, Authorization; ADR-050, 240, 428): write and withdraw a day's
// assignments, and take a phone out of service. An admin, or a manager/analyst who holds the
// permission Dispatch now; nobody else. Asked inside the service's own piece of work, as Setup is.
export interface DispatchRightsRefusal {
  readonly code: 'NOT_ALLOWED';
  readonly message: string;
}

export class DispatchRights {
  private readonly name: string;
  private readonly access: Access | null;

  // `person`: whoever asks, as the database has them now; null where it has nobody of that id.
  constructor(person: (Holder & { readonly name: string }) | null) {
    this.name = person?.name ?? 'Somebody the firm has no record of';
    this.access = person === null ? null : new Access(person);
  }

  // Why this person may not dispatch, or nothing.
  refusal(): DispatchRightsRefusal | null {
    if (this.access?.holds('DISPATCH') === true) return null;
    return {
      code: 'NOT_ALLOWED',
      message: `${this.name} may not dispatch: it takes an admin, or a manager/analyst granted ${grantsInWords('DISPATCH')}. Nothing was changed.`,
    };
  }
}

// Who may approve a worker's day and unlock it (REQ-310; ADR-241 (4), 598): an admin, or a
// manager/analyst who holds "approve hours" and "view dispatch" now; nobody else. Asked inside the
// service's own piece of work, as Dispatch is.
export class HoursRights {
  private readonly name: string;
  private readonly access: Access | null;

  // `person`: whoever asks, as the database has them now; null where it has nobody of that id.
  constructor(person: (Holder & { readonly name: string }) | null) {
    this.name = person?.name ?? 'Somebody the firm has no record of';
    this.access = person === null ? null : new Access(person);
  }

  // Why this person may not approve hours, or nothing.
  refusal(): DispatchRightsRefusal | null {
    if (this.access?.holds('APPROVE_HOURS') === true) return null;
    return {
      code: 'NOT_ALLOWED',
      message: `${this.name} may not approve hours: it takes an admin, or a manager/analyst granted ${grantsInWords('APPROVE_HOURS')}. Nothing was changed.`,
    };
  }
}

export type PeopleRefusalCode =
  'NOT_ALLOWED' | 'NOT_A_MANAGER_ANALYST' | 'NOT_A_VIEWER' | 'LAST_ADMIN' | 'NOT_BACK_OFFICE';

// The two roles of the back office itself: a role is changed from one to the other only.
export const backOfficeRolesChanged = ['ADMIN', 'MANAGER_ANALYST'] as const;

export type BackOfficeRole = (typeof backOfficeRolesChanged)[number];

export class PeopleRules {
  // Whether a person of that role is created by an admin in the back office: never a monitor,
  // never the system actor.
  createdHere(role: string): role is BackOfficeCreated {
    return backOfficeCreated.some((here) => here === role);
  }

  // Why this person may not give that permission to that one, or nothing. Only an admin gives a
  // permission, and an admin holds each: so nobody gives what they don't hold, a manager/analyst
  // who holds it included.
  grantRefusal(
    grantor: Holder,
    to: Pick<Holder, 'role' | 'archived'>,
    permission: PermissionName,
  ): PeopleRefusalCode | null {
    if (grantor.archived || grantor.role !== 'ADMIN' || !new Access(grantor).holds(permission)) {
      return 'NOT_ALLOWED';
    }
    if (to.archived || to.role !== 'MANAGER_ANALYST') return 'NOT_A_MANAGER_ANALYST';
    return null;
  }

  // A project is given to a read-only viewer only: nobody else's sight is read from it.
  viewerProjectRefusal(
    grantor: Holder,
    to: Pick<Holder, 'role' | 'archived'>,
  ): PeopleRefusalCode | null {
    if (grantor.archived || grantor.role !== 'ADMIN') return 'NOT_ALLOWED';
    if (to.archived || to.role !== 'READ_ONLY_VIEWER') return 'NOT_A_VIEWER';
    return null;
  }

  // Whether taking this person out (archiving them, or making them anything but an admin) would
  // leave the firm with no admin: they are an admin in service and no other is.
  lastAdmin(person: Pick<Holder, 'role' | 'archived'>, otherAdminsInService: number): boolean {
    return person.role === 'ADMIN' && !person.archived && otherAdminsInService < 1;
  }

  // Whether a person of that role signs in with their email address, so that it is theirs alone
  // among the people in service who do (ADR-409): everybody created in the back office.
  signsInByEmail(role: string): boolean {
    return this.createdHere(role);
  }

  // Why that person's role may not be changed to that one, or nothing: from admin to
  // manager/analyst or back, on a person in service, and never the firm's only admin.
  roleChangeRefusal(
    person: Pick<Holder, 'role' | 'archived'>,
    to: string,
    otherAdminsInService: number,
  ): PeopleRefusalCode | null {
    const backOffice = (role: string): boolean =>
      backOfficeRolesChanged.some((here) => here === role);
    if (person.archived || !backOffice(person.role) || !backOffice(to)) return 'NOT_BACK_OFFICE';
    if (to !== 'ADMIN' && this.lastAdmin(person, otherAdminsInService)) return 'LAST_ADMIN';
    return null;
  }

  // Whether the reader is shown that person's phone number: an admin always; a manager/analyst
  // never a monitor's; nobody else anybody's.
  readsPhoneOf(reader: Pick<Holder, 'role' | 'archived'>, personRole: string): boolean {
    if (reader.archived) return false;
    if (reader.role === 'ADMIN') return true;
    return reader.role === 'MANAGER_ANALYST' && personRole !== 'MONITOR';
  }
}

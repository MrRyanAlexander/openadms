// The firm's people (ARCHITECTURE §6, Authorization, §7.0; spec/acceptance/02-people-and-devices.md
// AC-02-08, 12, 13, 72; spec/THREAT-MODEL.md T-14; ADR-050, 105, 169, 315, 409, 415). OWASP ASVS
// 5.0 V8, 7.4.5.
//
// - **An admin creates** an admin, a manager/analyst or a read-only viewer; never a monitor (who
//   is created on a phone under the master passcode) and never the system actor. The person signs
//   in with their email address, so no second one who signs in here is given an address somebody
//   has: this service refuses it, and so does a key of the database's.
// - **An admin gives and takes** a manager/analyst's permissions and a read-only viewer's
//   projects. Nothing is deleted: one taken away is archived, one given back has its archive
//   cleared (ADR-315). Sign-in reads them on every request, so the change bites at once.
// - **An admin archives** a person who left, and their sessions end; **the firm's only admin
//   can't be archived**. The database refuses that too, whoever asks.
// - **An admin ends** anybody's sessions.
// - **A person is read** by an admin or a manager/analyst, one or a page at a time; a monitor's
//   phone number is in an admin's answer only.
// - **An admin changes** a person's name, address and phone, and a read-only viewer's kind,
//   contractor and sight of private citizens; makes a manager/analyst an admin or an admin a
//   manager/analyst (never the only admin, never a monitor or a viewer); and takes a person out
//   of the archive (BACKLOG C92; ADR-427). Where the address a person signs in with changes, the
//   old one is told, if the firm has mail (ASVS 6.3.7): a change they didn't ask for is noticed.
//
// Who is an admin is read here, inside the same piece of work as the change (ADR-364), whatever
// the door already asked. The rules are the domain's (`PeopleRules`).
import type { Database, Prisma } from '@open-adms/db';
import {
  PeopleRules,
  ViewerSettings,
  actorOnly,
  actorsOnly,
  type BackOfficeCreated,
  type BackOfficeRole,
  type Holder,
  type PermissionName,
} from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { Mail } from '../sign-in/mail.ts';
import type { Sessions } from '../sign-in/sessions.ts';

type Tx = Prisma.TransactionClient;

export type PeopleRefused =
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'EMAIL_HELD'
  | 'LAST_ADMIN'
  | 'NOT_A_MANAGER_ANALYST'
  | 'NOT_A_VIEWER'
  | 'NOT_BACK_OFFICE'
  | 'UNKNOWN_CONTRACTOR'
  | 'UNKNOWN_PROJECT'
  | 'EMAIL_SIGNS_IN';

// A person as an answer says them. `phone` is undefined where the reader may not read it.
export interface PersonRead {
  readonly id: string;
  readonly name: string;
  readonly role: 'ADMIN' | 'MANAGER_ANALYST' | 'MONITOR' | 'READ_ONLY_VIEWER';
  readonly viewerKind: 'CLIENT' | 'CONTRACTOR' | 'AUDITOR' | null;
  readonly contractorId: string | null;
  readonly seesPrivateCitizens: boolean | null;
  readonly monitorId: string | null;
  readonly email: string | null;
  readonly phone?: string | null;
  readonly employerId: string | null;
  readonly employerNumber: string | null;
  readonly archived: boolean;
  readonly permissions: readonly string[];
  readonly projectIds: readonly string[];
}

export type PersonOutcome =
  | { readonly done: true; readonly person: PersonRead }
  | { readonly done: false; readonly code: PeopleRefused };

export type SessionsEnded =
  | { readonly done: true; readonly sessions: number }
  | { readonly done: false; readonly code: PeopleRefused };

export interface NewPerson {
  readonly name: string;
  readonly role: BackOfficeCreated;
  readonly email: string;
  readonly phone?: string | undefined;
  readonly viewerKind?: 'CLIENT' | 'CONTRACTOR' | 'AUDITOR' | undefined;
  readonly contractorId?: string | undefined;
  readonly seesPrivateCitizens?: boolean | undefined;
}

// What an admin changes of a person: only what is stated. A phone number, an employer and its ID
// are cleared with null; an email address only on a person who doesn't sign in with it.
export interface PersonChanges {
  readonly name?: string | undefined;
  readonly email?: string | null | undefined;
  readonly employerId?: string | null | undefined;
  readonly employerNumber?: string | null | undefined;
  readonly phone?: string | null | undefined;
  readonly viewerKind?: 'CLIENT' | 'CONTRACTOR' | 'AUDITOR' | undefined;
  readonly contractorId?: string | undefined;
  readonly seesPrivateCitizens?: boolean | undefined;
}

// Which people a page holds: those in service or the archived ones, of one role where one is
// named, after the last person of the page before, `limit` at most.
export interface PeopleAsked {
  readonly role?: PersonRead['role'] | undefined;
  readonly archived: boolean;
  readonly after?: string | undefined;
  readonly limit: number;
}

export type PeoplePage =
  | { readonly done: true; readonly people: readonly PersonRead[]; readonly next: string | null }
  | { readonly done: false; readonly code: PeopleRefused };

export interface PeopleParts {
  readonly clock: Clock;
  readonly sessions: Pick<Sessions, 'endAll'>;
  readonly mail: Mail;
}

const personRead = {
  id: true,
  name: true,
  role: true,
  viewerKind: true,
  contractorId: true,
  seesPrivateCitizens: true,
  monitorNumber: true,
  email: true,
  phone: true,
  employerId: true,
  employerNumber: true,
  archivedAt: true,
  permissions: {
    where: { archivedAt: null },
    select: { permission: true },
    orderBy: { permission: 'asc' },
  },
  viewerProjects: {
    where: { archivedAt: null },
    select: { projectId: true },
    orderBy: { projectId: 'asc' },
  },
} as const;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personRead }>;

// The key of the database's that keeps two who sign in here from one email address.
const emailKey = 'user_sign_in_email_once';

function refusedByTheEmailKey(error: unknown): boolean {
  return error instanceof Error && error.message.includes(emailKey);
}

// The database's own guard of the last admin answered (the trigger `user_last_admin`): two
// admins each took the other out at one moment, and each was the other's "another admin" when
// this service asked. Known by the guard's own words, which never leave the server.
export function refusedAsTheLastAdmin(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const meta = (error as { meta?: { driverAdapterError?: { cause?: unknown } } }).meta;
  const cause = meta?.driverAdapterError?.cause as { originalMessage?: unknown } | undefined;
  const said = cause?.originalMessage;
  return typeof said === 'string' && said.startsWith("The firm's last admin");
}

const holder = (row: PersonRow): Holder => ({
  role: row.role,
  archived: row.archivedAt !== null,
  granted: row.permissions.map(({ permission }) => permission),
});

type Step<T> = { readonly refused: PeopleRefused } | { readonly kept: T };

export class People {
  private readonly db: Database;
  private readonly parts: PeopleParts;
  private readonly rules = new PeopleRules();

  constructor(db: Database, parts: PeopleParts) {
    this.db = db;
    this.parts = parts;
  }

  // An admin creates a back-office or an outside user. They have no password until an admin
  // sets one, and no authenticator until they set one up at their first sign-in (ADR-412).
  async create(adminId: string, person: NewPerson): Promise<PersonOutcome> {
    const email = person.email.trim();
    try {
      return await this.asAdmin(adminId, async (tx): Promise<Step<string>> => {
        if (!this.rules.createdHere(person.role)) return { refused: 'NOT_ALLOWED' };
        if (await this.held(tx, email)) return { refused: 'EMAIL_HELD' };
        const viewer = person.role === 'READ_ONLY_VIEWER';
        if (viewer !== (person.viewerKind !== undefined)) return { refused: 'NOT_A_VIEWER' };
        const contractorId = person.viewerKind === 'CONTRACTOR' ? person.contractorId : undefined;
        if ((person.viewerKind === 'CONTRACTOR') !== (contractorId !== undefined)) {
          return { refused: 'UNKNOWN_CONTRACTOR' };
        }
        if (contractorId !== undefined) {
          const contractor = await tx.contractor.findUnique({
            where: { id: contractorId },
            select: { archivedAt: true },
          });
          if (contractor?.archivedAt !== null) return { refused: 'UNKNOWN_CONTRACTOR' };
        }
        const made = await tx.user.create({
          data: {
            name: person.name.trim(),
            role: person.role,
            email,
            ...(person.phone === undefined ? {} : { phone: person.phone.trim() }),
            // A Monitor ID is a monitor's: nobody created here is issued one.
            monitorNumber: null,
            ...(viewer
              ? {
                  viewerKind: person.viewerKind ?? null,
                  seesPrivateCitizens:
                    person.seesPrivateCitizens ?? ViewerSettings.starting().seesPrivateCitizens,
                  ...(contractorId === undefined ? {} : { contractorId }),
                }
              : {}),
          },
          select: { id: true },
        });
        return { kept: made.id };
      });
    } catch (error) {
      // Two admins adding one address at the same moment: the database's key answered.
      if (refusedByTheEmailKey(error)) return { done: false, code: 'EMAIL_HELD' };
      throw error;
    }
  }

  // One person, as the reader may see them.
  async read(readerId: string, userId: string): Promise<PersonOutcome> {
    return this.db.$read(async (tx) => {
      const reader = await tx.user.findUnique({ where: { id: readerId }, select: personRead });
      if (
        reader?.archivedAt !== null ||
        (reader.role !== 'ADMIN' && reader.role !== 'MANAGER_ANALYST')
      ) {
        return { done: false, code: 'NOT_ALLOWED' };
      }
      const row = await tx.user.findUnique({ where: { id: userId }, select: personRead });
      if (row === null || actorOnly(row.role)) return { done: false, code: 'NOT_FOUND' };
      return { done: true, person: this.shown(row, holder(reader)) };
    });
  }

  // A page of the firm's people as the reader may see them, in the order they were added; never
  // the system actor.
  async list(readerId: string, asked: PeopleAsked): Promise<PeoplePage> {
    return this.db.$read(async (tx): Promise<PeoplePage> => {
      const reader = await tx.user.findUnique({ where: { id: readerId }, select: personRead });
      if (
        reader?.archivedAt !== null ||
        (reader.role !== 'ADMIN' && reader.role !== 'MANAGER_ANALYST')
      ) {
        return { done: false, code: 'NOT_ALLOWED' };
      }
      const rows = await tx.user.findMany({
        where: {
          role: asked.role ?? { notIn: [...actorsOnly] },
          archivedAt: asked.archived ? { not: null } : null,
          ...(asked.after === undefined ? {} : { id: { gt: asked.after } }),
        },
        orderBy: { id: 'asc' },
        // One more than the page, to know whether another follows.
        take: asked.limit + 1,
        select: personRead,
      });
      const page = rows.slice(0, asked.limit);
      return {
        done: true,
        people: page.map((row) => this.shown(row, holder(reader))),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // An admin changes what the firm holds of a person: only what is stated, and nothing is
  // written where nothing differs. Whose user a viewer is, and whether they see private citizens
  // by name, are a read-only viewer's alone; a contractor user always names a contractor the
  // firm has, and nobody else names one.
  async change(adminId: string, userId: string, changes: PersonChanges): Promise<PersonOutcome> {
    let toldAt: { readonly name: string; readonly email: string } | undefined;
    let outcome: PersonOutcome;
    try {
      outcome = await this.asAdmin(adminId, async (tx): Promise<Step<string>> => {
        const person = await this.inService(tx, userId);
        if (person === undefined) return { refused: 'NOT_FOUND' };
        const data: Prisma.UserUncheckedUpdateInput = {};
        if (changes.name !== undefined && changes.name.trim() !== person.name) {
          data.name = changes.name.trim();
        }
        if (changes.phone !== undefined && (changes.phone?.trim() ?? null) !== person.phone) {
          data.phone = changes.phone?.trim() ?? null;
        }
        // An address is cleared only on somebody who doesn't sign in with it (ADR-527 (12)).
        if (changes.email === null) {
          if (this.rules.signsInByEmail(person.role)) return { refused: 'EMAIL_SIGNS_IN' };
          if (person.email !== null) data.email = null;
        }
        // Who employs them, a contractor the firm has in service, and the ID it gives them; an
        // ID with no employer is the database's to refuse (AC-02-03).
        if (changes.employerId !== undefined && changes.employerId !== person.employerId) {
          if (changes.employerId !== null) {
            const employer = await tx.contractor.findUnique({
              where: { id: changes.employerId },
              select: { archivedAt: true },
            });
            if (employer?.archivedAt !== null) return { refused: 'UNKNOWN_CONTRACTOR' };
          }
          data.employerId = changes.employerId;
        }
        const employerNumber =
          changes.employerNumber === undefined
            ? undefined
            : (changes.employerNumber?.trim() ?? null);
        if (employerNumber !== undefined && employerNumber !== person.employerNumber) {
          data.employerNumber = employerNumber;
        }
        const email = changes.email?.trim();
        if (email !== undefined && email !== person.email) {
          if (this.rules.signsInByEmail(person.role)) {
            if (await this.held(tx, email, userId)) return { refused: 'EMAIL_HELD' };
            // The same address in other capitals is the same address: nobody is told.
            if (
              person.email !== null &&
              person.email.trim().toLowerCase() !== email.toLowerCase()
            ) {
              toldAt = { name: person.name, email: person.email };
            }
          }
          data.email = email;
        }
        if (
          changes.viewerKind !== undefined ||
          changes.contractorId !== undefined ||
          changes.seesPrivateCitizens !== undefined
        ) {
          if (person.role !== 'READ_ONLY_VIEWER') return { refused: 'NOT_A_VIEWER' };
          const kind = changes.viewerKind ?? person.viewerKind;
          const contractorId =
            kind === 'CONTRACTOR' ? (changes.contractorId ?? person.contractorId) : null;
          if ((kind === 'CONTRACTOR') !== (contractorId !== null)) {
            return { refused: 'UNKNOWN_CONTRACTOR' };
          }
          if (kind !== 'CONTRACTOR' && changes.contractorId !== undefined) {
            return { refused: 'UNKNOWN_CONTRACTOR' };
          }
          if (contractorId !== null && contractorId !== person.contractorId) {
            const contractor = await tx.contractor.findUnique({
              where: { id: contractorId },
              select: { archivedAt: true },
            });
            if (contractor?.archivedAt !== null) return { refused: 'UNKNOWN_CONTRACTOR' };
          }
          if (kind !== person.viewerKind) data.viewerKind = kind;
          if (contractorId !== person.contractorId) data.contractorId = contractorId;
          if (
            changes.seesPrivateCitizens !== undefined &&
            changes.seesPrivateCitizens !== person.seesPrivateCitizens
          ) {
            data.seesPrivateCitizens = changes.seesPrivateCitizens;
          }
        }
        if (Object.keys(data).length > 0) await tx.user.update({ where: { id: userId }, data });
        return { kept: userId };
      });
    } catch (error) {
      // Two admins giving one address at the same moment: the database's key answered.
      if (refusedByTheEmailKey(error)) return { done: false, code: 'EMAIL_HELD' };
      throw error;
    }
    if (outcome.done && toldAt !== undefined) await this.tellOfNewAddress(toldAt);
    return outcome;
  }

  // An admin makes a manager/analyst an admin, or an admin a manager/analyst; the firm's only
  // admin stays one (the database refuses that too, whoever asks). Nothing else of the person
  // changes: what a manager/analyst was granted stays beside them, and sign-in reads the role
  // on every request, so their very next one is asked as the new role.
  async setRole(adminId: string, userId: string, role: BackOfficeRole): Promise<PersonOutcome> {
    return this.keepingTheLastAdmin(adminId, async (tx): Promise<Step<string>> => {
      const person = await this.inService(tx, userId);
      if (person === undefined) return { refused: 'NOT_FOUND' };
      const others = await tx.user.count({
        where: { role: 'ADMIN', archivedAt: null, id: { not: userId } },
      });
      const refusal = this.rules.roleChangeRefusal(holder(person), role, others);
      if (refusal !== null) return { refused: refusal };
      if (person.role !== role) await tx.user.update({ where: { id: userId }, data: { role } });
      return { kept: userId };
    });
  }

  // Out of the archive: the person they were, with what they held, and no session. Whoever
  // signs in with an email address comes back only while nobody in service has taken theirs.
  async unarchive(adminId: string, userId: string): Promise<PersonOutcome> {
    try {
      return await this.asAdmin(adminId, async (tx): Promise<Step<string>> => {
        const person = await tx.user.findUnique({ where: { id: userId }, select: personRead });
        if (person === null || actorOnly(person.role) || person.archivedAt === null) {
          return { refused: 'NOT_FOUND' };
        }
        // A contractor user comes back only while their contractor is in service: put it back
        // first (ADR-527 (12)), as creating one for an archived contractor is refused.
        if (person.contractorId !== null) {
          const contractor = await tx.contractor.findUnique({
            where: { id: person.contractorId },
            select: { archivedAt: true },
          });
          if (contractor?.archivedAt !== null) return { refused: 'UNKNOWN_CONTRACTOR' };
        }
        if (
          this.rules.signsInByEmail(person.role) &&
          person.email !== null &&
          (await this.held(tx, person.email.trim(), userId))
        ) {
          return { refused: 'EMAIL_HELD' };
        }
        await tx.user.update({ where: { id: userId }, data: { archivedAt: null } });
        return { kept: userId };
      });
    } catch (error) {
      if (refusedByTheEmailKey(error)) return { done: false, code: 'EMAIL_HELD' };
      throw error;
    }
  }

  // The whole of what a manager/analyst holds from now on: one named and not held is given, one
  // held and not named is taken away. Taking away asks nothing of the person's role, so what a
  // person held before their role changed can always be cleared.
  async setPermissions(
    adminId: string,
    userId: string,
    wanted: readonly PermissionName[],
  ): Promise<PersonOutcome> {
    return this.asAdmin(adminId, async (tx, admin): Promise<Step<string>> => {
      const person = await this.inService(tx, userId);
      if (person === undefined) return { refused: 'NOT_FOUND' };
      const rows = await tx.userPermission.findMany({
        where: { userId },
        select: { id: true, permission: true, archivedAt: true },
      });
      const now = this.parts.clock.now();
      for (const permission of new Set(wanted)) {
        const row = rows.find((held) => held.permission === permission);
        if (row?.archivedAt === null) continue;
        const refusal = this.rules.grantRefusal(admin, holder(person), permission);
        if (refusal !== null) return { refused: refusal };
        if (row === undefined) await tx.userPermission.create({ data: { userId, permission } });
        else await tx.userPermission.update({ where: { id: row.id }, data: { archivedAt: null } });
      }
      for (const row of rows) {
        if (row.archivedAt !== null || wanted.includes(row.permission)) continue;
        await tx.userPermission.update({ where: { id: row.id }, data: { archivedAt: now } });
      }
      return { kept: userId };
    });
  }

  // The whole of the projects a read-only viewer sees from now on, the same way.
  async setViewerProjects(
    adminId: string,
    userId: string,
    wanted: readonly string[],
  ): Promise<PersonOutcome> {
    return this.asAdmin(adminId, async (tx, admin): Promise<Step<string>> => {
      const person = await this.inService(tx, userId);
      if (person === undefined) return { refused: 'NOT_FOUND' };
      const rows = await tx.viewerProject.findMany({
        where: { userId },
        select: { id: true, projectId: true, archivedAt: true },
      });
      const now = this.parts.clock.now();
      for (const projectId of new Set(wanted)) {
        const row = rows.find((held) => held.projectId === projectId);
        if (row?.archivedAt === null) continue;
        const refusal = this.rules.viewerProjectRefusal(admin, holder(person));
        if (refusal !== null) return { refused: refusal };
        if (row !== undefined) {
          await tx.viewerProject.update({ where: { id: row.id }, data: { archivedAt: null } });
          continue;
        }
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (project === null) return { refused: 'UNKNOWN_PROJECT' };
        await tx.viewerProject.create({ data: { userId, projectId } });
      }
      for (const row of rows) {
        if (row.archivedAt !== null || wanted.includes(row.projectId)) continue;
        await tx.viewerProject.update({ where: { id: row.id }, data: { archivedAt: now } });
      }
      return { kept: userId };
    });
  }

  // A person who left: archived, never deleted, and signed out everywhere. The firm's only
  // admin stays.
  async archive(adminId: string, userId: string): Promise<PersonOutcome> {
    return this.keepingTheLastAdmin(adminId, async (tx): Promise<Step<string>> => {
      const person = await this.inService(tx, userId);
      if (person === undefined) return { refused: 'NOT_FOUND' };
      const others = await tx.user.count({
        where: { role: 'ADMIN', archivedAt: null, id: { not: userId } },
      });
      if (this.rules.lastAdmin(holder(person), others)) return { refused: 'LAST_ADMIN' };
      await tx.user.update({
        where: { id: userId },
        data: { archivedAt: this.parts.clock.now() },
      });
      await this.parts.sessions.endAll(tx, userId);
      return { kept: userId };
    });
  }

  // An admin ends every session a person has open: their own too, the one this call came in on
  // included (ASVS 7.4.5).
  async endSessions(adminId: string, userId: string): Promise<SessionsEnded> {
    return this.db.$write({ actorId: adminId, source: 'BACK_OFFICE' }, async (tx) => {
      const admin = await tx.user.findUnique({ where: { id: adminId }, select: personRead });
      if (admin?.role !== 'ADMIN' || admin.archivedAt !== null) {
        return { done: false, code: 'NOT_ALLOWED' };
      }
      const person = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (person === null || actorOnly(person.role)) return { done: false, code: 'NOT_FOUND' };
      return { done: true, sessions: await this.parts.sessions.endAll(tx, userId) };
    });
  }

  // One piece of work written as the admin, who is read in it; what it answers is the person as
  // an admin reads them, once the work is done.
  private asAdmin(
    adminId: string,
    work: (tx: Tx, admin: Holder) => Promise<Step<string>>,
  ): Promise<PersonOutcome> {
    return this.db.$write(
      { actorId: adminId, source: 'BACK_OFFICE' },
      async (tx): Promise<PersonOutcome> => {
        const admin = await tx.user.findUnique({ where: { id: adminId }, select: personRead });
        if (admin?.role !== 'ADMIN' || admin.archivedAt !== null) {
          return { done: false, code: 'NOT_ALLOWED' };
        }
        const step = await work(tx, holder(admin));
        if ('refused' in step) return { done: false, code: step.refused };
        const row = await tx.user.findUniqueOrThrow({
          where: { id: step.kept },
          select: personRead,
        });
        return { done: true, person: this.shown(row, holder(admin)) };
      },
    );
  }

  // The same, for a change that may take an admin out: where the database's guard answers
  // instead of this service's own asking, the answer is the same plain one.
  private async keepingTheLastAdmin(
    adminId: string,
    work: (tx: Tx, admin: Holder) => Promise<Step<string>>,
  ): Promise<PersonOutcome> {
    try {
      return await this.asAdmin(adminId, work);
    } catch (error) {
      if (refusedAsTheLastAdmin(error)) return { done: false, code: 'LAST_ADMIN' };
      throw error;
    }
  }

  // A person who isn't archived, and never the system actor.
  private async inService(tx: Tx, userId: string): Promise<PersonRow | undefined> {
    const row = await tx.user.findUnique({ where: { id: userId }, select: personRead });
    return row?.archivedAt !== null || actorOnly(row.role) ? undefined : row;
  }

  // Whether somebody who signs in here, and isn't archived, has that address. Compared whole and
  // without regard to capitals, never as a pattern in the database, as sign-in compares it.
  private async held(tx: Tx, email: string, but?: string): Promise<boolean> {
    const typed = email.toLowerCase();
    const people = await tx.user.findMany({
      where: {
        email: { not: null },
        archivedAt: null,
        ...(but === undefined ? {} : { id: { not: but } }),
        role: { in: ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] },
      },
      select: { email: true },
    });
    return people.some((person) => person.email?.trim().toLowerCase() === typed);
  }

  // Tells the address a person signed in with that it is no longer theirs to sign in with, and
  // never says the new one. A message that can't be sent undoes nothing: email is never required.
  private async tellOfNewAddress(old: { name: string; email: string }): Promise<void> {
    if (!this.parts.mail.available) return;
    const paragraphs = [
      `${old.name},`,
      'The email address of your Open ADMS login was just changed by an admin of your firm. You no longer sign in with this one.',
      'If you didn’t ask for it, tell an admin of your firm now.',
    ];
    try {
      await this.parts.mail.send({
        to: old.email,
        subject: 'Your Open ADMS sign-in address was changed',
        text: `${paragraphs.join('\n\n')}\n`,
      });
    } catch {
      // Nothing to undo.
    }
  }

  private shown(row: PersonRow, reader: Holder): PersonRead {
    if (actorOnly(row.role)) throw new Error('An actor that is no person is nobody’s to read.');
    return {
      id: row.id,
      name: row.name,
      role: row.role,
      viewerKind: row.viewerKind,
      contractorId: row.contractorId,
      seesPrivateCitizens: row.seesPrivateCitizens,
      monitorId: row.monitorNumber,
      email: row.email,
      ...(this.rules.readsPhoneOf(reader, row.role) ? { phone: row.phone } : {}),
      employerId: row.employerId,
      employerNumber: row.employerNumber,
      archived: row.archivedAt !== null,
      permissions: row.permissions.map(({ permission }) => permission),
      projectIds: row.viewerProjects.map(({ projectId }) => projectId),
    };
  }
}

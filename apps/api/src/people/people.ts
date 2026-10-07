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
// - **A person is read** by an admin or a manager/analyst; a monitor's phone number is in an
//   admin's answer only.
//
// Who is an admin is read here, inside the same piece of work as the change (ADR-364), whatever
// the door already asked. The rules are the domain's (`PeopleRules`).
import type { Database, Prisma } from '@open-adms/db';
import {
  PeopleRules,
  ViewerSettings,
  type BackOfficeCreated,
  type Holder,
  type PermissionName,
} from '@open-adms/domain';

import type { Clock } from '../setup/setup-service.ts';
import type { Sessions } from '../sign-in/sessions.ts';

type Tx = Prisma.TransactionClient;

export type PeopleRefused =
  | 'NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'EMAIL_HELD'
  | 'LAST_ADMIN'
  | 'NOT_A_MANAGER_ANALYST'
  | 'NOT_A_VIEWER'
  | 'UNKNOWN_CONTRACTOR'
  | 'UNKNOWN_PROJECT';

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

export interface PeopleParts {
  readonly clock: Clock;
  readonly sessions: Pick<Sessions, 'endAll'>;
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
      if (row === null || row.role === 'SYSTEM') return { done: false, code: 'NOT_FOUND' };
      return { done: true, person: this.shown(row, holder(reader)) };
    });
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
    return this.asAdmin(adminId, async (tx): Promise<Step<string>> => {
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
      if (person === null || person.role === 'SYSTEM') return { done: false, code: 'NOT_FOUND' };
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

  // A person who isn't archived, and never the system actor.
  private async inService(tx: Tx, userId: string): Promise<PersonRow | undefined> {
    const row = await tx.user.findUnique({ where: { id: userId }, select: personRead });
    return row?.archivedAt !== null || row.role === 'SYSTEM' ? undefined : row;
  }

  // Whether somebody who signs in here, and isn't archived, has that address. Compared whole and
  // without regard to capitals, never as a pattern in the database, as sign-in compares it.
  private async held(tx: Tx, email: string): Promise<boolean> {
    const typed = email.toLowerCase();
    const people = await tx.user.findMany({
      where: {
        email: { not: null },
        archivedAt: null,
        role: { in: ['ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER'] },
      },
      select: { email: true },
    });
    return people.some((person) => person.email?.trim().toLowerCase() === typed);
  }

  private shown(row: PersonRow, reader: Holder): PersonRead {
    if (row.role === 'SYSTEM') throw new Error('The system actor is nobody’s to read.');
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
      archived: row.archivedAt !== null,
      permissions: row.permissions.map(({ permission }) => permission),
      projectIds: row.viewerProjects.map(({ projectId }) => projectId),
    };
  }
}

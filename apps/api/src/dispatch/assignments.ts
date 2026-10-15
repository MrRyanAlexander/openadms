// A day's assignments, written on the dispatch board (ARCHITECTURE §7;
// spec/parts/02-people-and-devices.md step 4; spec/acceptance/02-people-and-devices.md
// AC-02-24…32; BACKLOG 2.4.3, C102; ADR-127, 195, 240, 281, 286, 308, 429).
//
// - **One is written** for a person, a day and a project by an admin or a manager/analyst who
//   holds Dispatch now, read inside the same piece of work (ADR-364): planned, and it says who
//   wrote it. Their work, one site where the work is at one, optionally a phone, and the unit rate
//   pay items they do that day, each with the pay item's own kind of work (C42).
// - **One is changed** while it stands: its work, site, phone and pay items, only what is stated.
//   A pay item no longer named is taken off by archiving; one named again is put back. Its
//   person, day and project never change: it is withdrawn and written anew.
// - **One is withdrawn** by archiving, from this moment, once, with a note if the dispatcher
//   writes one. It is kept, and everything recorded under it still names it.
// - **One withdrawn is put back** as it was (ADR-527 (13)), its note cleared (the audit keeps
//   it): never one made on a phone, and its person and its phone asked as a new one's are.
// - **A day's board is read** by an admin or a manager/analyst, by project and day, a page at a
//   time. One made on a phone under the master passcode is on it, marked unplanned: the board
//   changes nothing of it.
//
// Nothing here stops a second assignment for one person or one phone on a day (AC-02-29), and
// none ever expires or stops work. A change queues no reconciliation: of an assignment the
// worker reads its project only, which never changes. What the database's own constraints
// refuse (a site or a pay item of another project) is answered plainly by the error filter.
import type { Prisma } from '@open-adms/db';
import {
  AssignmentRules,
  type AssignmentFormDocumentType,
  type FieldEventKindName,
} from '@open-adms/domain';

import { Refused, day, type Outcome } from '../setup/setup-service.ts';
import { DispatchService } from './dispatch-service.ts';

type Tx = Prisma.TransactionClient;

const named = { select: { id: true, name: true } } as const;

const assignmentRead = {
  id: true,
  projectId: true,
  workDate: true,
  fieldEventKinds: true,
  certifying: true,
  formDocumentTypes: true,
  origin: true,
  archivedAt: true,
  withdrawalNote: true,
  person: { select: { id: true, name: true, monitorNumber: true } },
  site: named,
  device: named,
  madeBy: named,
  // The pay items named now: one taken off stays on record, archived.
  payItems: {
    where: { archivedAt: null },
    orderBy: { payItem: { code: 'asc' } },
    select: { payItem: { select: { id: true, code: true, description: true } } },
  },
} as const;

type AssignmentRow = Prisma.AssignmentGetPayload<{ select: typeof assignmentRead }>;

interface UnitRatePayItem {
  readonly id: string;
  readonly kindOfWorkId: string;
}

interface Named {
  readonly id: string;
  readonly name: string;
}

// An assignment as an answer says it.
export interface AssignmentRead {
  readonly id: string;
  readonly projectId: string;
  readonly person: Named & { readonly monitorId: string | null };
  readonly workDate: string;
  readonly fieldEventKinds: readonly FieldEventKindName[];
  readonly certifying: boolean;
  readonly formDocumentTypes: readonly AssignmentFormDocumentType[];
  readonly site: Named | null;
  readonly phone: Named | null;
  readonly payItems: readonly { id: string; code: string; description: string }[];
  readonly origin: 'PLANNED' | 'UNPLANNED';
  readonly madeBy: Named | null;
  readonly withdrawnAt: string | null;
  readonly withdrawalNote: string | null;
}

// A person's work for a day, as the board states it.
export interface AssignedWork {
  readonly fieldEventKinds: readonly FieldEventKindName[];
  readonly certifying: boolean;
  readonly formDocumentTypes: readonly AssignmentFormDocumentType[];
  readonly siteId: string | null;
  readonly deviceId: string | null;
  readonly payItemIds: readonly string[];
}

export interface NewAssignment extends Partial<AssignedWork> {
  readonly projectId: string;
  readonly personId: string;
  // The day, in the project's time zone: 2026-10-12.
  readonly workDate: string;
}

// Which assignments a page holds: one project's for one day, those that stand or the withdrawn
// ones, after the last of the page before, `limit` at most.
export interface AssignmentsAsked {
  readonly workDate: string;
  readonly withdrawn: boolean;
  readonly after?: string | undefined;
  readonly limit: number;
}

export type AssignmentsPage =
  | {
      readonly done: true;
      readonly assignments: readonly AssignmentRead[];
      readonly next: string | null;
    }
  | { readonly done: false; readonly code: 'NOT_ALLOWED' | 'NOT_FOUND' };

export class Assignments extends DispatchService {
  private readonly rules = new AssignmentRules();

  // A page of one project's board for one day, in the order the assignments were written.
  async list(
    readerId: string,
    projectId: string,
    asked: AssignmentsAsked,
  ): Promise<AssignmentsPage> {
    return this.db.$read(async (tx): Promise<AssignmentsPage> => {
      const reader = await tx.user.findUnique({
        where: { id: readerId },
        select: { role: true, archivedAt: true },
      });
      if (
        reader?.archivedAt !== null ||
        (reader.role !== 'ADMIN' && reader.role !== 'MANAGER_ANALYST')
      ) {
        return { done: false, code: 'NOT_ALLOWED' };
      }
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      if (project === null) return { done: false, code: 'NOT_FOUND' };
      const rows = await tx.assignment.findMany({
        where: {
          projectId,
          workDate: day(asked.workDate),
          archivedAt: asked.withdrawn ? { not: null } : null,
          ...(asked.after === undefined ? {} : { id: { gt: asked.after } }),
        },
        orderBy: { id: 'asc' },
        // One more than the page, to know whether another follows.
        take: asked.limit + 1,
        select: assignmentRead,
      });
      const page = rows.slice(0, asked.limit);
      return {
        done: true,
        assignments: page.map((row) => this.shown(row)),
        next: rows.length > asked.limit ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  // The person's assignment for that day on that project, planned by whoever writes it.
  async assign(person: string, assignment: NewAssignment): Promise<Outcome<AssignmentRead>> {
    return this.dispatch(person, async (tx) => {
      await tx.project.findUniqueOrThrow({
        where: { id: assignment.projectId },
        select: { id: true },
      });
      const assigned = await tx.user.findUniqueOrThrow({
        where: { id: assignment.personId },
        select: { name: true, role: true, archivedAt: true },
      });
      const refusal = this.rules.personRefusal({
        name: assigned.name,
        role: assigned.role,
        archived: assigned.archivedAt !== null,
      });
      if (refusal !== null) throw new Refused(refusal);
      if (assignment.deviceId != null) await this.phoneInService(tx, assignment.deviceId);
      // Everything is asked before anything is written.
      const payItems = await this.unitRatePayItems(tx, assignment.payItemIds ?? []);
      const made = await tx.assignment.create({
        data: {
          personId: assignment.personId,
          workDate: day(assignment.workDate),
          projectId: assignment.projectId,
          fieldEventKinds: [...(assignment.fieldEventKinds ?? [])],
          certifying: assignment.certifying ?? false,
          formDocumentTypes: [...(assignment.formDocumentTypes ?? [])],
          siteId: assignment.siteId ?? null,
          deviceId: assignment.deviceId ?? null,
          origin: 'PLANNED',
          madeById: person,
        },
        select: { id: true, projectId: true },
      });
      await this.payItemsNamed(tx, made, payItems);
      return this.read(tx, made.id);
    });
  }

  // What is stated of its work, site, phone and pay items changes; nothing else does.
  async change(
    person: string,
    assignmentId: string,
    changes: Partial<AssignedWork>,
  ): Promise<Outcome<AssignmentRead>> {
    return this.dispatch(person, async (tx) => {
      const standing = await this.changeable(tx, assignmentId);
      if (changes.deviceId != null && changes.deviceId !== standing.deviceId) {
        await this.phoneInService(tx, changes.deviceId);
      }
      // Everything is asked before anything is written.
      const payItems =
        changes.payItemIds === undefined
          ? undefined
          : await this.unitRatePayItems(tx, changes.payItemIds);
      await tx.assignment.update({
        where: { id: assignmentId },
        data: {
          ...(changes.fieldEventKinds === undefined
            ? {}
            : { fieldEventKinds: [...changes.fieldEventKinds] }),
          ...(changes.certifying === undefined ? {} : { certifying: changes.certifying }),
          ...(changes.formDocumentTypes === undefined
            ? {}
            : { formDocumentTypes: [...changes.formDocumentTypes] }),
          ...(changes.siteId === undefined ? {} : { siteId: changes.siteId }),
          ...(changes.deviceId === undefined ? {} : { deviceId: changes.deviceId }),
        },
      });
      if (payItems !== undefined) await this.payItemsNamed(tx, standing, payItems);
      return this.read(tx, assignmentId);
    });
  }

  // Withdrawn from the board from now, with the dispatcher's note if they wrote one; kept, with
  // everything recorded under it.
  async withdraw(
    person: string,
    assignmentId: string,
    note?: string,
  ): Promise<Outcome<AssignmentRead>> {
    return this.dispatch(person, async (tx) => {
      await this.changeable(tx, assignmentId);
      await tx.assignment.update({
        where: { id: assignmentId },
        data: { archivedAt: this.clock.now(), withdrawalNote: note?.trim() ?? null },
      });
      return this.read(tx, assignmentId);
    });
  }

  // A withdrawn assignment put back on the board, as it was; its note cleared, the audit keeping
  // it. Its person and its phone are asked as a new one's are.
  async reinstate(person: string, assignmentId: string): Promise<Outcome<AssignmentRead>> {
    return this.dispatch(person, async (tx) => {
      const withdrawn = await tx.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: {
          origin: true,
          archivedAt: true,
          deviceId: true,
          person: { select: { name: true, role: true, archivedAt: true } },
        },
      });
      const refusal =
        this.rules.putBackRefusal({
          personName: withdrawn.person.name,
          origin: withdrawn.origin,
          withdrawn: withdrawn.archivedAt !== null,
        }) ??
        this.rules.personRefusal({
          name: withdrawn.person.name,
          role: withdrawn.person.role,
          archived: withdrawn.person.archivedAt !== null,
        });
      if (refusal !== null) throw new Refused(refusal);
      if (withdrawn.deviceId !== null) await this.phoneInService(tx, withdrawn.deviceId);
      await tx.assignment.update({
        where: { id: assignmentId },
        data: { archivedAt: null, withdrawalNote: null },
      });
      return this.read(tx, assignmentId);
    });
  }

  // A dispatch change by a person at the back office: refused, with nothing changed, to anybody
  // who may not dispatch now.
  private dispatch<T>(person: string, work: (tx: Tx) => Promise<T>): Promise<Outcome<T>> {
    return this.write(person, async (tx) => {
      await this.mayDispatch(tx, person);
      return work(tx);
    });
  }

  // The assignment, where the board may change or withdraw it.
  private async changeable(
    tx: Tx,
    assignmentId: string,
  ): Promise<{ id: string; projectId: string; deviceId: string | null }> {
    const standing = await tx.assignment.findUniqueOrThrow({
      where: { id: assignmentId },
      select: {
        id: true,
        projectId: true,
        deviceId: true,
        origin: true,
        archivedAt: true,
        person: { select: { name: true } },
      },
    });
    const refusal = this.rules.changeRefusal({
      personName: standing.person.name,
      origin: standing.origin,
      withdrawn: standing.archivedAt !== null,
    });
    if (refusal !== null) throw new Refused(refusal);
    return standing;
  }

  private async phoneInService(tx: Tx, deviceId: string): Promise<void> {
    const phone = await tx.device.findUniqueOrThrow({
      where: { id: deviceId },
      select: { name: true, outOfServiceAt: true },
    });
    const refusal = this.rules.phoneRefusal(phone);
    if (refusal !== null) throw new Refused(refusal);
  }

  // The pay items named, each with its own kind of work: refused where one is no unit rate pay
  // item, not found where the firm has none of that id.
  private async unitRatePayItems(
    tx: Tx,
    payItemIds: readonly string[],
  ): Promise<UnitRatePayItem[]> {
    const payItems: UnitRatePayItem[] = [];
    for (const id of payItemIds) {
      const payItem = await tx.payItem.findUniqueOrThrow({
        where: { id },
        select: { code: true, kindOfWorkId: true },
      });
      const refusal = this.rules.payItemRefusal(payItem);
      if (refusal !== null) throw new Refused(refusal);
      // The rule has refused a pay item with no kind of work.
      if (payItem.kindOfWorkId !== null) payItems.push({ id, kindOfWorkId: payItem.kindOfWorkId });
    }
    return payItems;
  }

  // The assignment names exactly these pay items now: one new to it is added with the pay
  // item's own kind of work, one taken off before is put back, one no longer named is archived.
  private async payItemsNamed(
    tx: Tx,
    assignment: { readonly id: string; readonly projectId: string },
    payItems: readonly UnitRatePayItem[],
  ): Promise<void> {
    const kept = await tx.assignmentPayItem.findMany({
      where: { assignmentId: assignment.id },
      select: { id: true, payItemId: true, archivedAt: true },
    });
    for (const row of kept) {
      const named = payItems.some(({ id }) => id === row.payItemId);
      if (named === (row.archivedAt === null)) continue;
      await tx.assignmentPayItem.update({
        where: { id: row.id },
        data: { archivedAt: named ? null : this.clock.now() },
      });
    }
    for (const payItem of payItems) {
      if (kept.some((row) => row.payItemId === payItem.id)) continue;
      // Named as the assignment's own project's: another project's is refused by the database.
      await tx.assignmentPayItem.create({
        data: {
          assignmentId: assignment.id,
          projectId: assignment.projectId,
          payItemId: payItem.id,
          kindOfWorkId: payItem.kindOfWorkId,
        },
      });
    }
  }

  private async read(tx: Tx, assignmentId: string): Promise<AssignmentRead> {
    return this.shown(
      await tx.assignment.findUniqueOrThrow({
        where: { id: assignmentId },
        select: assignmentRead,
      }),
    );
  }

  private shown(row: AssignmentRow): AssignmentRead {
    return {
      id: row.id,
      projectId: row.projectId,
      person: { id: row.person.id, name: row.person.name, monitorId: row.person.monitorNumber },
      workDate: row.workDate.toISOString().slice(0, 10),
      fieldEventKinds: row.fieldEventKinds,
      certifying: row.certifying,
      formDocumentTypes: row.formDocumentTypes as AssignmentFormDocumentType[],
      site: row.site,
      phone: row.device,
      payItems: row.payItems.map(({ payItem }) => payItem),
      origin: row.origin,
      madeBy: row.madeBy,
      withdrawnAt: row.archivedAt?.toISOString() ?? null,
      withdrawalNote: row.withdrawalNote,
    };
  }
}

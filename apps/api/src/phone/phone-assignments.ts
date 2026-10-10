// The assignment a phone takes when its monitor signs in, online (ARCHITECTURE §7, the ADR-240
// note; spec/acceptance/02-people-and-devices.md AC-02-29, 35, 36; BACKLOG 2.5.2, C103, C114;
// ADR-145, 240, 429, 441 (6)(d), 444).
//
// - **Read, never written.** The board's assignments that stand for the monitor are read, and
//   the domain's `AssignmentRules.takenAtSignIn` says which the phone takes: the day is each
//   project's own (its time zone), the one that names this phone first, and none where several
//   are left. Nobody enters the master passcode and nobody picks a project.
// - **None is an answer, not a refusal** (ADR-441 (6)(d)): the monitor is signed in all the
//   same, and the phone is told why it took none.
// - **What the phone is told of it**: the assignment's id, its day, its project (with its time
//   zone), the work and the one site where the work is at one. Never a rate or a code; the lists
//   an assignment needs are their own read (task 2.5.3).
import type { Database } from '@open-adms/db';
import {
  AssignmentRules,
  type AssignmentFormDocumentType,
  type FieldEventKindName,
  type NoAssignmentReason,
} from '@open-adms/domain';

const dayMs = 86_400_000;

// A monitor's assignment, as their phone is told it.
export interface PhoneAssignment {
  readonly id: string;
  // The day, in the project's time zone: 2026-10-12.
  readonly workDate: string;
  readonly project: { readonly id: string; readonly name: string; readonly timeZone: string };
  readonly fieldEventKinds: readonly FieldEventKindName[];
  readonly certifying: boolean;
  readonly formDocumentTypes: readonly AssignmentFormDocumentType[];
  readonly site: { readonly id: string; readonly name: string } | null;
}

export type AssignmentAtSignIn =
  | { readonly taken: true; readonly assignment: PhoneAssignment }
  | { readonly taken: false; readonly why: NoAssignmentReason };

export class PhoneAssignments {
  private readonly db: Database;
  private readonly rules = new AssignmentRules();

  constructor(db: Database) {
    this.db = db;
  }

  // The assignment the phone takes for that monitor, at that moment.
  async taken(personId: string, deviceId: string, now: Date): Promise<AssignmentAtSignIn> {
    // Every time zone's day now is the UTC day, the one before or the one after.
    const utcDay = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
    const rows = await this.db.$read((tx) =>
      tx.assignment.findMany({
        where: {
          personId,
          archivedAt: null,
          workDate: { gte: new Date(utcDay - dayMs), lte: new Date(utcDay + dayMs) },
        },
        orderBy: { id: 'asc' },
        select: {
          id: true,
          workDate: true,
          deviceId: true,
          fieldEventKinds: true,
          certifying: true,
          formDocumentTypes: true,
          project: { select: { id: true, name: true, timeZone: true } },
          site: { select: { id: true, name: true } },
        },
      }),
    );
    const standing = rows.map((row) => ({
      ...row,
      workDate: row.workDate.toISOString().slice(0, 10),
    }));
    const taken = this.rules.takenAtSignIn(
      now,
      deviceId,
      standing.map((row) => ({
        id: row.id,
        workDate: row.workDate,
        timeZone: row.project.timeZone,
        deviceId: row.deviceId,
      })),
    );
    if (!taken.taken) return taken;
    const row = standing.find(({ id }) => id === taken.id);
    if (row === undefined) throw new Error('The assignment taken is none of those read.');
    return {
      taken: true,
      assignment: {
        id: row.id,
        workDate: row.workDate,
        project: row.project,
        fieldEventKinds: row.fieldEventKinds,
        certifying: row.certifying,
        formDocumentTypes: row.formDocumentTypes as AssignmentFormDocumentType[],
        site: row.site,
      },
    };
  }
}

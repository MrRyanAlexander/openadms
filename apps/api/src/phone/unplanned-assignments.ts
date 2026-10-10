// An unplanned assignment, received from the phone it was made on (ARCHITECTURE §7's note,
// §7.5, §9 (3), (4), §10; adms-field-app §4A.0 (5); spec/acceptance/02-people-and-devices.md
// AC-02-38; spec/acceptance/05-sync.md AC-05-40; BACKLOG 2.5.4, C46, C111, C115; ADR-100, 240,
// 438, 456, 457; REQ-202b, 209). OWASP ASVS 5.0 16.2.1, 16.2.2, 16.3.1, 16.3.3.
//
// - **The phone's word, and its device key's.** A monitor had no assignment, and whoever holds
//   the master passcode set the phone up on the spot, with or without a connection. The phone
//   checked the passcode against its own check; the server is never sent it here and checks
//   nothing but that the phone proved itself. So this counts no wrong try and opens no lock.
// - **Written as the master passcode's own actor, on that phone** (ADR-438): whoever held the
//   passcode is not known. The monitor is who the records are about, never who made them. The
//   database lets an unplanned assignment be made by nobody else, and only naming that phone.
// - **Kept as reported** (flag, never block): for a monitor archived since, on a project closed
//   since, at a site or with a pay item taken off since, and from a phone out of service. It is
//   not saved only where something it names is no record of the kind it must be (the domain's
//   `unplannedAssignmentRefusals`): the field events made under it could name nothing.
// - **Its day is the phone's**: the day its clock said, in the project's time zone (ADR-100).
// - **The id is the phone's**, so a report sent again is answered "already saved" and nothing
//   is written twice (KD-56), its security events neither. Two of one report at the same
//   moment: the database keeps one and refuses the other (409), which sent again is saved.
// - **Three times**: the phone's instant, its clock's offset and when the server received it,
//   on the assignment and on each security event (`occurredAt` is the phone's).
// - **Two security events with each one saved**, at the phone's own time, naming the phone and
//   the monitor: what was done, and `MASTER_PASSCODE_USE` (what opened it).
// - **A site move and a monitor switch arrive the same way** (ARCHITECTURE §7.3; adms-field-app
//   §4A.0 (8), (9); AC-02-46, 47; ADR-456 (5), 458). A phone moved to another of its project's
//   sites is set up anew there: a new unplanned assignment, `DEVICE_SETUP`, and the earlier one
//   stands with everything recorded under it. A phone passed to a monitor who has no assignment
//   it could take is a new one for them: `DEVICE_SWITCH`, naming the monitor switched to.
//   Nothing the board planned is changed from a phone; the monitor's sign-in then takes the one
//   made on the phone last (the domain's `takenAtSignIn`).
import { underMasterPasscode, type Database, type Prisma } from '@open-adms/db';
import {
  AssignmentRules,
  type AssignmentFormDocumentType,
  type FieldEventKindName,
  type UnplannedAssignmentRefusal,
  type UnplannedOccasion,
} from '@open-adms/domain';

import { day, type Clock } from '../setup/setup-service.ts';

type Tx = Prisma.TransactionClient;

// An unplanned assignment as its phone reports it.
export interface ReportedUnplannedAssignment {
  readonly id: string;
  readonly projectId: string;
  readonly personId: string;
  readonly fieldEventKinds: readonly FieldEventKindName[];
  readonly certifying: boolean;
  readonly formDocumentTypes: readonly AssignmentFormDocumentType[];
  readonly siteId: string | null;
  readonly payItemIds: readonly string[];
  // What it was made at: the phone set up, or passed to this monitor.
  readonly occasion: UnplannedOccasion;
  // The phone's clock when it was made, and how far that clock stood from UTC, in minutes.
  readonly madeAt: Date;
  readonly deviceUtcOffsetMinutes: number;
}

export type UnplannedAssignmentReceived =
  | { readonly answer: 'SAVED'; readonly workDate: string }
  | { readonly answer: 'ALREADY_SAVED' }
  | { readonly answer: 'NOT_SAVED'; readonly reason: UnplannedAssignmentRefusal };

export interface UnplannedAssignmentsParts {
  readonly clock: Clock;
  // The request the work now running is for, if any.
  readonly requestNow: () => string | undefined;
}

export class UnplannedAssignments {
  private readonly rules = new AssignmentRules();
  private readonly db: Database;
  private readonly parts: UnplannedAssignmentsParts;

  constructor(db: Database, parts: UnplannedAssignmentsParts) {
    this.db = db;
    this.parts = parts;
  }

  // What the phone that proved itself reported: kept once, or why it can't be kept.
  async received(
    deviceId: string,
    reported: ReportedUnplannedAssignment,
  ): Promise<UnplannedAssignmentReceived> {
    return this.db.$write(underMasterPasscode(deviceId), (tx) => this.kept(tx, deviceId, reported));
  }

  private held(tx: Tx, id: string) {
    return tx.assignment.findUnique({ where: { id }, select: { origin: true, deviceId: true } });
  }

  private again(
    held: { readonly origin: string; readonly deviceId: string | null },
    deviceId: string,
  ): UnplannedAssignmentReceived {
    const answer = this.rules.reportedAgain(held, deviceId);
    return answer === 'ALREADY_SAVED' ? { answer } : { answer: 'NOT_SAVED', reason: answer };
  }

  // Everything is asked before anything is written.
  private async kept(
    tx: Tx,
    deviceId: string,
    reported: ReportedUnplannedAssignment,
  ): Promise<UnplannedAssignmentReceived> {
    const held = await this.held(tx, reported.id);
    if (held !== null) return this.again(held, deviceId);
    const project = await tx.project.findUnique({
      where: { id: reported.projectId },
      select: { timeZone: true },
    });
    if (project === null) return { answer: 'NOT_SAVED', reason: 'UNKNOWN_PROJECT' };
    const person = await tx.user.findUnique({
      where: { id: reported.personId },
      select: { role: true },
    });
    if (!this.rules.mayHoldUnplanned(person))
      return { answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' };
    if (reported.siteId !== null) {
      const site = await tx.disposalSite.findFirst({
        where: { id: reported.siteId, projectId: reported.projectId },
        select: { id: true },
      });
      if (site === null) return { answer: 'NOT_SAVED', reason: 'NOT_THE_PROJECTS_SITE' };
    }
    const payItems = await tx.payItem.findMany({
      where: { id: { in: [...reported.payItemIds] }, projectId: reported.projectId },
      select: { id: true, kindOfWorkId: true },
    });
    const unitRate = payItems.flatMap(({ id, kindOfWorkId }) =>
      kindOfWorkId === null ? [] : [{ id, kindOfWorkId }],
    );
    if (unitRate.length !== reported.payItemIds.length) {
      return { answer: 'NOT_SAVED', reason: 'NOT_THE_PROJECTS_UNIT_RATE_PAY_ITEM' };
    }
    const workDate = this.rules.unplannedDay(reported.madeAt, project.timeZone);
    const { deviceUtcOffsetMinutes } = reported;
    await tx.assignment.create({
      data: {
        id: reported.id,
        personId: reported.personId,
        workDate: day(workDate),
        projectId: reported.projectId,
        fieldEventKinds: [...reported.fieldEventKinds],
        certifying: reported.certifying,
        formDocumentTypes: [...reported.formDocumentTypes],
        siteId: reported.siteId,
        deviceId,
        origin: 'UNPLANNED',
        madeAt: reported.madeAt,
        deviceUtcOffsetMinutes,
        receivedAt: this.parts.clock.now(),
      },
      select: { id: true },
    });
    for (const payItem of unitRate) {
      await tx.assignmentPayItem.create({
        data: {
          assignmentId: reported.id,
          projectId: reported.projectId,
          payItemId: payItem.id,
          kindOfWorkId: payItem.kindOfWorkId,
        },
        select: { id: true },
      });
    }
    // What was done, and what opened it: each at the phone's own time, about the monitor.
    const requestId = this.parts.requestNow();
    for (const kind of this.rules.securityEventsOf(reported.occasion)) {
      await tx.securityEvent.create({
        data: {
          kind,
          userId: reported.personId,
          deviceId,
          occurredAt: reported.madeAt,
          deviceUtcOffsetMinutes,
          ...(requestId ? { requestId } : {}),
        },
        select: { id: true },
      });
    }
    return { answer: 'SAVED', workDate };
  }
}

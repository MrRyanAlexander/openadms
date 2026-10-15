// One sync from a phone, whole (ARCHITECTURE §9 (1), (3), (4), (6), (7), §10;
// spec/parts/05-sync.md steps 2…8; spec/acceptance/05-sync.md AC-05-03, 04, 15, 16, 20, 45, 47;
// spec/acceptance/10-api-and-sync.md AC-10-35, 46, 51; spec/DATA-MODEL.md §4.5; BACKLOG 2.6.2,
// C64, C69, C122, C126…C132; ADR-022, 052, 065, 100, 420, 453, 454, 457, 464, 466…473; KD-56;
// REQ-016, 203, 308c). OWASP ASVS 5.0 V2, V16; API Security Top 10 API1, API3, API4.
//
// - **The phone is the one that proved itself.** Nothing sent says which phone it is: every
//   record read is given `source: 'DEVICE'` and that phone's id here.
// - **A `Sync` is written first**, as the device key's actor on that phone, with the server's
//   clock, the phone's, and the phone's less the server's in whole seconds (ADR-100, 471).
//   One row a call, a retry too: it is the record that the phone connected.
// - **Read in the payload's order, each thing after what it may name:** the unplanned
//   assignments (`UnplannedAssignments.received`), the uses of the master passcode
//   (`PasscodeUses.received`), the records, the photographs' records, the numbers. Each is its
//   own piece of work, so one
//   refusal undoes nothing else, and each gets its own answer in the order sent (AC-05-45).
// - **A record is stored once.** The idempotency ledger is asked first: an id it holds as
//   saved is answered "already saved" and nothing is tried. Otherwise the record goes to
//   `Intake` (a certification to `Certifications.received`), which stores it with its ledger
//   row and queues the reconciliation its arrival asks for, in one piece of work. Nobody waits
//   for the run (AC-10-51).
// - **What could not be saved is held for a person, exactly as sent** (ADR-468, 471): what
//   isn't a record, what names something the server doesn't have (the database's own
//   constraints refuse it: never an internal error, and never the database's words), what was
//   made under an unplanned assignment this sync answered "not saved" (not tried), a
//   certification its own rules refuse or whose number its project already has, and a
//   photograph whose record the server doesn't have saved (not tried; ADR-481). The phone is
//   answered `NOT_SAVED` with the reason and plain words that say it is held; never "saved".
//   The same thing sent again by the same phone is the same held record: nothing is added.
//   **A report answered `NOT_SAVED` is held too** (ADR-526 (5)): a phone holding one could
//   otherwise never be turned in. Its phone is answered with the report's own reason, as before.
// - **A photograph whose record is held is kept with it** (ADR-526 (4)), answered saved, so its
//   files reach the server while its record waits for a person: intake's to find.
// - **Nothing is refused over eligibility** (ADR-052), and nothing here concludes anything.
// - **The numbers:** for each series reported, the phone is topped up to a full block and
//   answered the blocks it holds now; where the report can't be taken (no such series, none
//   left), `toppedUp: false` and the blocks it held before (ADR-065, 467 (8)).
// - **What a sync brings besides** (§9 (6); AC-02-23, AC-05-48; ADR-473), last, and only what
//   needs nobody signed in: the master passcode's version in force, with its check where the
//   phone says it holds another (`PhoneLoginList.passcodeBrought`, the login list's own); and
//   the setup version of the project whose lists the phone says it holds, as that project's
//   phones are shown it now (`SetupVersions`), written once on the sync's own row. A number,
//   never the lists: those are an assignment's, read by a signed-in monitor's phone.
import {
  photoNames,
  photoRead,
  recordNames,
  recordRead,
  reportNames,
  type PhotoAnswer,
  syncedRecordAssignment,
  syncedRecordId,
  syncedRecordProject,
  type ReceivedCertification,
  type ReceivedRecord,
  type RecordAnswer,
  type RecordNames,
  type SeriesHeld,
  type SyncAnswered,
  type SyncReceived,
} from '@open-adms/contracts';
import { byDeviceKey, deviceKeyActorId, type Database, type NumberBlock } from '@open-adms/db';
import { NotSaved, ProjectClock, type NotSavedNotice } from '@open-adms/domain';

import type { Certifications } from '../certification/certifications.ts';
import { SeriesMovedOn, type NumberAllocator } from '../numbering/number-allocator.ts';
import type { PasscodeUses } from '../phone/passcode-uses.ts';
import type { PhoneLoginList } from '../phone/phone-login-list.ts';
import type { UnplannedAssignments } from '../phone/unplanned-assignments.ts';
import { databaseRefusalOf } from '../process/database-refusal.ts';
import type { Clock } from '../setup/setup-service.ts';
import { SetupVersions } from '../setup/setup-versions.ts';
import type { HeldThings } from './held.ts';
import type { Intake } from './intake.ts';
import type { Brought } from './ledger.ts';
import { NamesNothing } from './record-write.ts';
import type { SentRecord } from './sent.ts';

export interface SyncParts {
  readonly intake: Intake;
  readonly certifications: Certifications;
  readonly unplanned: UnplannedAssignments;
  readonly uses: PasscodeUses;
  readonly numbers: NumberAllocator;
  // Whose `passcodeBrought` makes the master passcode's check for a phone.
  readonly loginList: PhoneLoginList;
  // Where what can't be saved is held for a person.
  readonly held: HeldThings;
  readonly clock: Clock;
}

export { sentFingerprint } from './held.ts';

// What one sync came to: the server's row for it, and what the phone is answered.
export interface Synced {
  readonly syncId: string;
  // The phone's clock less the server's, in whole seconds.
  readonly clockDifferenceSeconds: number;
  // The setup version it sent, where it sent one.
  readonly setupVersionSent: number | null;
  readonly answered: SyncAnswered;
}

// A top-up that lost a race for its series is asked again (ADR-065, 323); one that loses every
// time is not taken at this sync (ADR-505).
const topUpAttempts = 3;

// A record as the server read it, with what the server says of it: that a phone made it, and
// which (ADR-466).
export function fromPhone(
  deviceId: string,
  read: Exclude<ReceivedRecord, { record: 'CERTIFICATION' }>,
): SentRecord {
  const phone = { source: 'DEVICE', deviceId } as const;
  switch (read.record) {
    case 'FIELD_EVENT':
      return { record: read.record, fieldEvent: { ...read.fieldEvent, ...phone } };
    case 'SCALE_RECEIPT':
      return { record: read.record, scaleReceipt: { ...read.scaleReceipt, deviceId } };
    case 'INCIDENT':
      return { record: read.record, incident: { ...read.incident, ...phone } };
    case 'DROP_OFF_LOG':
      return { record: read.record, dropOffLog: { ...read.dropOffLog, ...phone } };
    case 'SURVEY':
      return { record: read.record, survey: { ...read.survey, ...phone } };
    case 'ROE':
      return { record: read.record, roe: { ...read.roe, ...phone } };
  }
}

const blocksOf = (held: readonly NumberBlock[]): SeriesHeld['blocks'] =>
  held.map(({ firstNumber, lastNumber, lastUsedNumber }) => ({
    firstNumber,
    lastNumber,
    lastUsedNumber,
  }));

export class Sync {
  private readonly db: Database;
  private readonly parts: SyncParts;
  private readonly versions: SetupVersions;

  constructor(db: Database, parts: SyncParts) {
    this.db = db;
    this.parts = parts;
    this.versions = new SetupVersions(db);
  }

  // One sync from the phone that proved itself.
  async received(deviceId: string, sent: SyncReceived): Promise<Synced> {
    const startedAt = this.parts.clock.now();
    const clockDifferenceSeconds = Math.round(
      (sent.clockAt.getTime() - startedAt.getTime()) / 1000,
    );
    const brought = await this.db.$write(byDeviceKey(deviceId), async (tx): Promise<Brought> => {
      const sync = await tx.sync.create({
        data: {
          deviceId,
          startedAt,
          deviceClockAt: sent.clockAt,
          deviceUtcOffsetMinutes: sent.deviceUtcOffsetMinutes,
          clockDifferenceSeconds: BigInt(clockDifferenceSeconds),
        },
        select: { id: true },
      });
      return { syncId: sync.id };
    });

    // The unplanned assignments go first: a record names the one it was made under.
    const unplannedAssignments: SyncAnswered['unplannedAssignments'] = [];
    const notSavedAssignments = new Set<string>();
    for (const report of sent.unplannedAssignments) {
      const received = await this.parts.unplanned.received(deviceId, {
        ...report,
        madeAt: new Date(report.madeAt),
      });
      const reason = received.answer === 'NOT_SAVED' ? received.reason : null;
      if (received.answer === 'NOT_SAVED') {
        notSavedAssignments.add(report.id);
        await this.parts.held.held(
          deviceId,
          brought.syncId,
          report,
          NotSaved.reportNotSaved('UNPLANNED_ASSIGNMENT', received.reason),
          reportNames(report),
        );
      }
      unplannedAssignments.push({ assignmentId: report.id, answer: received.answer, reason });
    }

    const passcodeUses: SyncAnswered['passcodeUses'] = [];
    for (const report of sent.passcodeUses) {
      const received = await this.parts.uses.received(deviceId, {
        ...report,
        loggedAt: new Date(report.loggedAt),
      });
      const reason = received.answer === 'NOT_SAVED' ? received.reason : null;
      if (received.answer === 'NOT_SAVED') {
        await this.parts.held.held(
          deviceId,
          brought.syncId,
          report,
          NotSaved.reportNotSaved('PASSCODE_USE', received.reason),
          reportNames(report),
        );
      }
      passcodeUses.push({ useId: report.id, answer: received.answer, reason });
    }

    const records: RecordAnswer[] = [];
    for (const one of sent.records) {
      records.push(await this.record(deviceId, brought, one, notSavedAssignments));
    }

    // After the records: a photograph names the record it belongs to (§9 (2)).
    const photos: PhotoAnswer[] = [];
    for (const one of sent.photos) photos.push(await this.photo(deviceId, brought, one));

    const numbers: SeriesHeld[] = [];
    for (const report of sent.lastUsed) numbers.push(await this.toppedUp(deviceId, report));

    const masterPasscode = await this.parts.loginList.passcodeBrought(
      deviceId,
      sent.holds.masterPasscodeVersion,
    );
    const setupVersion = await this.setupVersion(deviceId, brought, sent.holds.listsProjectId);

    return {
      syncId: brought.syncId,
      clockDifferenceSeconds,
      setupVersionSent: setupVersion?.version ?? null,
      answered: {
        unplannedAssignments,
        passcodeUses,
        records,
        photos,
        numbers,
        masterPasscode,
        setupVersion,
      },
    };
  }

  // The setup version of the project whose lists the phone holds, as that project's phones are
  // shown it now: a new one where the setup moved since the newest (ADR-453). Written once on
  // the sync's own row, as the device key's actor on that phone. None for a phone that holds
  // no lists, or for a project the server doesn't have: that refuses nothing.
  private async setupVersion(
    deviceId: string,
    brought: Brought,
    projectId: string | null,
  ): Promise<SyncAnswered['setupVersion']> {
    if (projectId === null) return null;
    const shown = await this.db.$read(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true, closedAt: true },
      });
      // A closed project, like one not found, shows its phones nothing new (ADR-529 (b)).
      return project?.closedAt !== null ? null : SetupVersions.shownIn(tx, projectId);
    });
    if (shown === null) return null;
    const version = await this.versions.numbered(projectId, shown, deviceId);
    await this.db.$write(byDeviceKey(deviceId), (tx) =>
      tx.sync.update({
        where: { id: brought.syncId },
        data: { setupVersionSent: version },
        select: { id: true },
      }),
    );
    return { projectId, version };
  }

  // Whatever stood in one record's place: its own answer.
  private async record(
    deviceId: string,
    brought: Brought,
    sent: unknown,
    notSavedAssignments: ReadonlySet<string>,
  ): Promise<RecordAnswer> {
    const read = recordRead(sent);
    if (!read.read) return this.held(deviceId, brought, sent, read.notice);
    const { record } = read;
    const id = syncedRecordId(record);
    // A retry is known from the ledger and never taken for a duplicate number (KD-56). One it
    // holds as quarantined is `Intake`'s to answer, with the reason and the holder; so is a
    // record stored before the ledger was kept.
    const before = await this.db.$read((tx) =>
      tx.syncedRecord.findUnique({ where: { recordId: id } }),
    );
    if (before?.answer === 'SAVED' && before.recordKind === record.record) {
      return { answer: 'ALREADY_SAVED', id };
    }
    const assignmentId = syncedRecordAssignment(record);
    if (assignmentId !== null && notSavedAssignments.has(assignmentId)) {
      return this.held(deviceId, brought, sent, NotSaved.assignmentNotSaved());
    }
    // Nothing is written to a closed project (ADR-529 (b)): what arrives for one waits for a
    // person, who closes it so its phone can be turned in.
    const closed = await this.closed(syncedRecordProject(record));
    if (closed !== null) return this.held(deviceId, brought, sent, closed);
    try {
      if (record.record === 'CERTIFICATION') {
        return await this.certification(deviceId, brought, sent, record.certification);
      }
      return await this.parts.intake.receive(fromPhone(deviceId, record), brought);
    } catch (error) {
      const notice = Sync.refused(record, error);
      // Anything else is the server's own failure, and stays one.
      if (notice === null) throw error;
      return this.held(deviceId, brought, sent, notice);
    }
  }

  // Whatever stood in one photograph's place: its own answer (ADR-481). A retry is known from
  // the ledger. Where its files are kept is made by intake as it is saved; a photograph whose
  // record isn't saved is held, never tried.
  private async photo(deviceId: string, brought: Brought, sent: unknown): Promise<PhotoAnswer> {
    const names = photoNames(sent);
    const read = photoRead(sent);
    if (!read.read) return this.held(deviceId, brought, sent, read.notice, names);
    const { id } = read.photo;
    const before = await this.db.$read((tx) =>
      tx.syncedRecord.findUnique({ where: { recordId: id } }),
    );
    if (before?.answer === 'SAVED' && before.recordKind === 'PHOTO') {
      return { answer: 'ALREADY_SAVED', id };
    }
    try {
      const taken = await this.parts.intake.photo({ ...read.photo, deviceId }, brought);
      if (taken.answer === 'OWNER_NOT_SAVED') {
        return await this.held(deviceId, brought, sent, NotSaved.ownerNotSaved(), names);
      }
      return taken;
    } catch (error) {
      // What it names that the server doesn't have (its project, who took it, a record of
      // another project): the database's own constraints. Anything else stays an error.
      const refusal = databaseRefusalOf(error);
      if (refusal === undefined || refusal.code === 'ALREADY_HELD') throw error;
      return this.held(deviceId, brought, sent, NotSaved.namesNoRecord(), names);
    }
  }

  // Why nothing is written for this project, where it is closed: its name and the day it closed,
  // in its own time zone. None for one open, or one the server doesn't have (its constraints say
  // so, as before).
  // Whether the phone's key is revoked: by the firm's time, since a phone turned in syncs no more.
  private async keyRevoked(deviceId: string): Promise<boolean> {
    const phone = await this.db.$read((tx) =>
      tx.device.findUnique({ where: { id: deviceId }, select: { keyRevokedAt: true } }),
    );
    return phone?.keyRevokedAt != null;
  }

  private async closed(projectId: string): Promise<NotSaved | null> {
    const project = await this.db.$read((tx) =>
      tx.project.findUnique({
        where: { id: projectId },
        select: { name: true, closedAt: true, timeZone: true },
      }),
    );
    if (project?.closedAt == null) return null;
    return NotSaved.projectClosed(
      project.name,
      new ProjectClock(project.timeZone).date(project.closedAt),
    );
  }

  // A certification made on a phone: `Certifications.received` is the one way one is made.
  // What the database would refuse on sight is asked first, in plain words; two phones racing
  // for one number still meet the database's refusal, read by `refused`.
  private async certification(
    deviceId: string,
    brought: Brought,
    sent: unknown,
    certification: ReceivedCertification,
  ): Promise<RecordAnswer> {
    const { id, projectId, certNumber, replaces } = certification;
    const found = await this.db.$read(async (tx) => ({
      saved: await tx.certification.findUnique({ where: { id }, select: { id: true } }),
      holder: await tx.certification.findUnique({
        where: { projectId_certNumber: { projectId, certNumber } },
        select: { id: true },
      }),
      replacedBy:
        replaces === null
          ? null
          : await tx.certification.findFirst({
              where: { projectId, replacesId: replaces.replacedId },
              select: { id: true },
            }),
    }));
    if (found.saved !== null) return { answer: 'ALREADY_SAVED', id };
    if (found.holder !== null) {
      return this.held(deviceId, brought, sent, NotSaved.certNumberHeld(certNumber));
    }
    if (found.replacedBy !== null) {
      return this.held(deviceId, brought, sent, NotSaved.replacedAlready());
    }
    const outcome = await this.parts.certifications.received(
      { ...certification, deviceId },
      brought,
    );
    if (!outcome.saved) {
      return this.held(
        deviceId,
        brought,
        sent,
        NotSaved.certificationRefused(outcome.refusal.message),
      );
    }
    // What `certify` warns of (a sub placed elsewhere) is the back office's to see, not the
    // certifying monitor's: no note is sent for it.
    return { answer: 'SAVED', id, notes: [] };
  }

  // What a thrown error is, where the record is why it was thrown: the notice its phone is
  // given. Null for anything else.
  private static refused(record: ReceivedRecord, error: unknown): NotSavedNotice | null {
    if (error instanceof NamesNothing) return NotSaved.namesNoRecord();
    const refusal = databaseRefusalOf(error);
    if (refusal === undefined) return null;
    if (refusal.code !== 'ALREADY_HELD') return NotSaved.namesNoRecord();
    if (record.record !== 'CERTIFICATION') return null;
    if (refusal.constraint === 'certification_project_id_cert_number_key') {
      return NotSaved.certNumberHeld(record.certification.certNumber);
    }
    if (refusal.constraint === 'certification_project_id_replaces_id_key') {
      return NotSaved.replacedAlready();
    }
    return null;
  }

  // Holds what was sent for a person, once for this phone and this fingerprint, and answers
  // its phone: not saved, why, and that it is held.
  private async held(
    deviceId: string,
    brought: Brought,
    sent: unknown,
    notice: NotSavedNotice,
    names: RecordNames = recordNames(sent),
  ): Promise<Extract<RecordAnswer, { answer: 'NOT_SAVED' }>> {
    const told = await this.parts.held.held(deviceId, brought.syncId, sent, notice, names);
    return { answer: 'NOT_SAVED', id: names.id, reason: told.reason, message: told.message };
  }

  // The phone's blocks of one series after its report: topped up to a full block, or, where
  // the report isn't taken, what it held before.
  private async toppedUp(
    deviceId: string,
    report: SyncReceived['lastUsed'][number],
  ): Promise<SeriesHeld> {
    const { projectId, series } = report;
    // A closed project's numbers were retired at its close: none is issued again (ADR-529 (b)).
    // Nor to a phone whose key the firm's time revoked: its blocks were retired then (ADR-530).
    if ((await this.closed(projectId)) !== null || (await this.keyRevoked(deviceId))) {
      return { projectId, series, toppedUp: false, blocks: [] };
    }
    for (let attempt = 1; ; attempt += 1) {
      try {
        // The phone's own act: whoever is signed in on it, if anyone, did not ask for it.
        const outcome = await this.parts.numbers.topUp(
          { person: deviceKeyActorId, deviceId },
          report,
        );
        if (outcome.saved) {
          return { projectId, series, toppedUp: true, blocks: blocksOf(outcome.record) };
        }
        const before = await this.parts.numbers.held(deviceId, report);
        return { projectId, series, toppedUp: false, blocks: blocksOf(before) };
      } catch (error) {
        if (!(error instanceof SeriesMovedOn)) throw error;
        // Every phone of a project syncing at once tops up from one series: one that loses the
        // race every time keeps the blocks it holds, its report not taken, and is topped up at
        // a later sync (ADR-505). Its records are saved all the same.
        if (attempt === topUpAttempts) {
          const before = await this.parts.numbers.held(deviceId, report);
          return { projectId, series, toppedUp: false, blocks: blocksOf(before) };
        }
      }
    }
  }
}

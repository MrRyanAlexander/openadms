// Intake: what the server does with each record a phone sends, on arrival (spec/parts/05-sync.md
// steps 3–8; spec/acceptance/05-sync.md; ARCHITECTURE §9, §10; adms-exceptions §4.3a; ADR-022,
// 030, 052, 236, 240, 292, 329, 338, 420, 471, 472; KD-56). A plain service: the sync endpoint in
// front of it is `Sync` (sync.ts).
//
// Every record is received, in whatever order it comes, and written as the monitor who made it,
// from the phone that made it, so the database audits it with them as its actor. Each is stored
// once: the id its phone made is the record's own, and the same id sent again is answered
// "already saved". The one thing not saved is a record whose number another record holds: a
// second field event of one kind on one ticket, or an ROE whose number the project already has.
// That record is kept whole in quarantine for a person, never dropped, never merged into the one
// that holds the number, and never answered "saved".
//
// Nothing is refused over eligibility, and nothing here concludes anything: a field event lands
// PENDING, and its flags, zone, mileage and money are the worker's. Intake fills in only what a
// number finds (the certification, the ROE) and keeps the server's received time.
//
// A record the database's own constraints refuse (a pick that isn't the project's, a detail on a
// kind that doesn't record it) isn't caught here: the call throws and nothing is saved. `Sync`
// answers it "not saved" and holds it for a person (ADR-468, 472).
//
// **A record a sync brought** (`brought`) **is stored with two things more, in its own piece of
// work:** its row in the idempotency ledger, and the reconciliation its arrival asks for,
// queued and never waited for (ARCHITECTURE §9 (7); AC-10-51): a field event's ticket and its
// neighbours, the tickets an ROE's number was waiting on, a survey's own flags. A record kept
// in quarantine is in the ledger and queues nothing: the worker never reads it.
import type { Database, NumberBlock, Prisma } from '@open-adms/db';
import { GpsFix, type Policy, Quarantine, type QuarantineNotice } from '@open-adms/domain';

import { WorkQueue, type WorkAsked } from '../jobs/work-queue.ts';
import { type LastUsed, NumberAllocator, type PhoneAtSync } from '../numbering/number-allocator.ts';
import type { Clock } from '../setup/setup-service.ts';
import { type Brought, ledgerRow } from './ledger.ts';
import { gpsNote, RecordWrite } from './record-write.ts';
import { photoPlaces } from '../media/photo-places.ts';
import type {
  IntakeNote,
  PhotoTaken,
  SentDropOffLog,
  SentFieldEvent,
  SentForm,
  SentIncident,
  SentPhoto,
  SentRecord,
  SentRoe,
  SentScaleReceipt,
  SentSurvey,
  SyncAnswer,
} from './sent.ts';

type Tx = Prisma.TransactionClient;

// Two records racing for one number: the database lets one through, and the other is asked
// again, when it finds the first holding the number.
const attempts = 3;

// The record exactly as sent, as JSON: times in ISO 8601, everything else as it came.
const asSent = (sent: SentRecord): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify(sent)) as Prisma.InputJsonObject;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class Intake {
  private readonly db: Database;
  private readonly clock: Clock;
  private readonly allocator: NumberAllocator;
  private readonly ticketsAJob: number;

  constructor(db: Database, clock: Clock, policy: Policy) {
    this.db = db;
    this.clock = clock;
    this.allocator = new NumberAllocator(db, clock, policy);
    this.ticketsAJob = policy.jobTicketsAtMost;
  }

  // One record, one answer. The received time is the server's clock, never the phone's.
  // `brought` is the sync that brought it, where one did.
  async receive(sent: SentRecord, brought?: Brought): Promise<SyncAnswer> {
    const receivedAt = this.clock.now();
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.take(sent, receivedAt, brought);
      } catch (error) {
        if (attempt === attempts || !isUniqueViolation(error)) throw error;
      }
    }
  }

  // At a sync the phone reports the last number it used of each series it makes numbers from,
  // and is topped up to a full block of each (ADR-065, 323). A top-up that lost a race for the
  // series is asked again. Answers the blocks the phone holds now.
  async topUp(phone: PhoneAtSync, reports: readonly LastUsed[]): Promise<NumberBlock[]> {
    const held: NumberBlock[] = [];
    for (const report of reports) {
      for (let attempt = 1; ; attempt += 1) {
        try {
          const outcome = await this.allocator.topUp(phone, report);
          if (!outcome.saved) throw new Error(outcome.refusal.message);
          held.push(...outcome.record);
          break;
        } catch (error) {
          if (attempt === attempts) throw error;
        }
      }
    }
    return held;
  }

  private take(sent: SentRecord, receivedAt: Date, brought?: Brought): Promise<SyncAnswer> {
    switch (sent.record) {
      case 'FIELD_EVENT':
        return this.fieldEvent(sent, sent.fieldEvent, receivedAt, brought);
      case 'SCALE_RECEIPT':
        return this.scaleReceipt(sent.scaleReceipt, receivedAt, brought);
      case 'INCIDENT':
        return this.incident(sent.incident, receivedAt, brought);
      case 'DROP_OFF_LOG':
        return this.dropOffLog(sent.dropOffLog, receivedAt, brought);
      case 'SURVEY':
        return this.survey(sent.survey, receivedAt, brought);
      case 'ROE':
        return this.roe(sent, sent.roe, receivedAt, brought);
    }
  }

  // The reconciliation a stored record asks for, queued in its own piece of work: no person
  // asked, and nobody waits for the run (ADR-418, 420).
  private async queued(
    tx: Tx,
    brought: Brought | undefined,
    asked: Omit<WorkAsked, 'trigger'>,
  ): Promise<void> {
    if (brought === undefined) return;
    await new WorkQueue(tx, this.ticketsAJob).queue({ ...asked, trigger: 'SYNC' });
  }

  // A field event with its item lines and the tickets it carries, in one piece of work; or, when
  // another field event of its kind holds its ticket, the whole record into quarantine.
  private fieldEvent(
    sent: SentRecord,
    event: SentFieldEvent,
    receivedAt: Date,
    brought?: Brought,
  ): Promise<SyncAnswer> {
    const notice = Quarantine.duplicateFieldEvent(
      event.kind,
      event.ticketNumber,
      event.splitSuffix,
    );
    return this.db.$write(
      { actorId: event.monitorId, source: 'DEVICE', deviceId: event.deviceId },
      async (tx): Promise<SyncAnswer> => {
        const saved = await tx.fieldEvent.findUnique({ where: { id: event.id } });
        if (saved !== null) return { answer: 'ALREADY_SAVED', id: event.id };
        const waiting = await Intake.waiting(tx, event.id, notice);
        if (waiting !== null) return waiting;
        // Whichever record reached the server first holds the number, whatever its ticket's
        // status: a reviewer's renumber puts either right (ADR-022, 028).
        const holder = await tx.fieldEvent.findUnique({
          where: {
            projectId_workflow_ticketNumber_splitSuffix_kind: {
              projectId: event.projectId,
              workflow: event.workflow,
              ticketNumber: event.ticketNumber,
              splitSuffix: event.splitSuffix,
              kind: event.kind,
            },
          },
        });
        if (holder !== null) {
          await tx.quarantinedRecord.create({
            data: {
              id: event.id,
              projectId: event.projectId,
              deviceId: event.deviceId,
              monitorId: event.monitorId,
              payload: asSent(sent),
              reason: notice.reason,
              holdingEventId: holder.id,
              receivedAt,
            },
          });
          await ledgerRow(tx, brought, {
            recordId: event.id,
            recordKind: 'FIELD_EVENT',
            deviceId: event.deviceId,
            answer: 'QUARANTINED',
          });
          return Intake.notSaved(event.id, notice, holder.id);
        }

        const notes = await new RecordWrite(tx, receivedAt).fieldEvent(event);
        await ledgerRow(tx, brought, {
          recordId: event.id,
          recordKind: 'FIELD_EVENT',
          deviceId: event.deviceId,
          answer: 'SAVED',
        });
        // Its ticket, and the tickets whose conclusions read it as the records now stand: its
        // partner is the same ticket; an overlap on one truck, a shared scale receipt and a
        // load that carries it are its neighbours.
        if (brought !== undefined) {
          const ticket = { workflow: event.workflow, ticketNumber: event.ticketNumber };
          await this.queued(tx, brought, {
            projectId: event.projectId,
            tickets: [ticket],
            others: await new WorkQueue(tx, this.ticketsAJob).neighbours(event.projectId, [ticket]),
          });
        }
        return { answer: 'SAVED', id: event.id, notes };
      },
    );
  }

  // A scale receipt is its own record, sent before the disposals that point at it; a tandem's
  // second disposal finds it there under the same id (ADR-034, 326). Its number is never unique
  // and never quarantines anything (ADR-331).
  private scaleReceipt(
    receipt: SentScaleReceipt,
    receivedAt: Date,
    brought?: Brought,
  ): Promise<SyncAnswer> {
    return this.db.$write(
      { actorId: receipt.enteredById, source: 'DEVICE', deviceId: receipt.deviceId },
      async (tx): Promise<SyncAnswer> => {
        const saved = await tx.scaleReceipt.findUnique({ where: { id: receipt.id } });
        if (saved !== null) return { answer: 'ALREADY_SAVED', id: receipt.id };
        await tx.scaleReceipt.create({
          data: {
            id: receipt.id,
            projectId: receipt.projectId,
            receiptNumber: receipt.receiptNumber,
            siteId: receipt.siteId,
            grossWeightLb: receipt.grossWeightLb,
            tareWeightLb: receipt.tareWeightLb,
            netWeightLb: receipt.netWeightLb,
            netWeightTons: receipt.netWeightTons,
            enteredById: receipt.enteredById,
            deviceId: receipt.deviceId,
            enteredAt: receipt.enteredAt,
            deviceUtcOffsetMinutes: receipt.deviceUtcOffsetMinutes,
            receivedAt,
          },
        });
        // Nothing points at it yet (it is sent ahead of its disposals), so it queues nothing.
        await ledgerRow(tx, brought, {
          recordId: receipt.id,
          recordKind: 'SCALE_RECEIPT',
          deviceId: receipt.deviceId,
          answer: 'SAVED',
        });
        return { answer: 'SAVED', id: receipt.id, notes: [] };
      },
    );
  }

  private incident(
    incident: SentIncident,
    receivedAt: Date,
    brought?: Brought,
  ): Promise<SyncAnswer> {
    return this.form(incident, 'INCIDENT', brought, async (tx, shared, notes) => {
      const saved = await tx.incident.findUnique({ where: { id: incident.id } });
      if (saved !== null) return false;
      const certification =
        incident.certNumber === null
          ? null
          : await tx.certification.findUnique({
              where: {
                projectId_certNumber: {
                  projectId: incident.projectId,
                  certNumber: incident.certNumber,
                },
              },
            });
      await tx.incident.create({
        data: {
          ...shared,
          ...(await new RecordWrite(tx, receivedAt).answersOf(incident, notes)),
          incidentTypeId: incident.incidentTypeId,
          incidentSubTypeId: incident.incidentSubTypeId,
          description: incident.description,
          parties: incident.parties,
          address: incident.address,
          contractorId: incident.contractorId,
          certNumber: incident.certNumber,
          certificationId: certification?.id ?? null,
          roeNumber: incident.roeNumber,
          roeId: await new RecordWrite(tx, receivedAt).roeOf(
            incident.projectId,
            incident.roeNumber,
          ),
          receivedAt,
        },
      });
      return true;
    });
  }

  private dropOffLog(
    log: SentDropOffLog,
    receivedAt: Date,
    brought?: Brought,
  ): Promise<SyncAnswer> {
    return this.form(log, 'DROP_OFF_LOG', brought, async (tx, shared, notes) => {
      const saved = await tx.dropOffLog.findUnique({ where: { id: log.id } });
      if (saved !== null) return false;
      await tx.dropOffLog.create({
        data: {
          ...shared,
          ...(await new RecordWrite(tx, receivedAt).answersOf(log, notes)),
          siteId: log.siteId,
          residentName: log.residentName,
          originAddress: log.originAddress,
          receivedAt,
        },
      });
      return true;
    });
  }

  private survey(survey: SentSurvey, receivedAt: Date, brought?: Brought): Promise<SyncAnswer> {
    return this.form(survey, 'SURVEY', brought, async (tx, shared, notes) => {
      const saved = await tx.survey.findUnique({ where: { id: survey.id } });
      if (saved !== null) return false;
      await tx.survey.create({
        data: {
          ...shared,
          ...(await new RecordWrite(tx, receivedAt).answersOf(survey, notes)),
          workTypeId: survey.workTypeId,
          surveyNumber: survey.surveyNumber,
          roeNumber: survey.roeNumber,
          roeId: await new RecordWrite(tx, receivedAt).roeOf(survey.projectId, survey.roeNumber),
          receivedAt,
        },
      });
      return true;
    });
  }

  // What a survey, an incident and a drop-off log share: written as the monitor from their
  // phone, with whatever fix the phone had. A form has no flag of its own, so a fix that
  // couldn't be one is kept in the audit record's reason, as sent.
  private form(
    form: SentForm,
    kind: 'INCIDENT' | 'DROP_OFF_LOG' | 'SURVEY',
    brought: Brought | undefined,
    save: (
      tx: Tx,
      shared: {
        id: string;
        projectId: string;
        source: 'DEVICE';
        monitorId: string;
        deviceId: string;
        assignmentId: string;
        setupVersion: number;
        madeAt: Date;
        deviceUtcOffsetMinutes: number;
        latitude: string | null;
        longitude: string | null;
        notes: string | null;
      },
      notes: IntakeNote[],
    ) => Promise<boolean>,
  ): Promise<SyncAnswer> {
    const fix = new GpsFix(form).read();
    const notes: IntakeNote[] = [];
    if (fix.unreadable !== null) notes.push(gpsNote('', fix.unreadable));
    const [note] = notes;
    return this.db.$write(
      {
        actorId: form.monitorId,
        source: 'DEVICE',
        deviceId: form.deviceId,
        ...(note === undefined ? {} : { reason: note.message }),
      },
      async (tx): Promise<SyncAnswer> => {
        const saved = await save(
          tx,
          {
            id: form.id,
            projectId: form.projectId,
            source: form.source,
            monitorId: form.monitorId,
            deviceId: form.deviceId,
            assignmentId: form.assignmentId,
            setupVersion: form.setupVersion,
            madeAt: form.madeAt,
            deviceUtcOffsetMinutes: form.deviceUtcOffsetMinutes,
            latitude: fix.fix?.latitude ?? null,
            longitude: fix.fix?.longitude ?? null,
            notes: form.notes,
          },
          notes,
        );
        if (!saved) return { answer: 'ALREADY_SAVED', id: form.id };
        await ledgerRow(tx, brought, {
          recordId: form.id,
          recordKind: kind,
          deviceId: form.deviceId,
          answer: 'SAVED',
        });
        // A survey's flags sit on the survey, on no ticket: the run checks them by themselves.
        if (kind === 'SURVEY') {
          await this.queued(tx, brought, {
            projectId: form.projectId,
            tickets: [],
            projectRecords: true,
          });
        }
        return { answer: 'SAVED', id: form.id, notes };
      },
    );
  }

  // An ROE made on a phone. Its number is held once on its project: one whose number another ROE
  // has is kept whole in quarantine, as a field event is. Saved, it is what every record that
  // arrived before it with its number was waiting for: each now points at it (ADR-149, 292).
  private roe(
    sent: SentRecord,
    roe: SentRoe,
    receivedAt: Date,
    brought?: Brought,
  ): Promise<SyncAnswer> {
    const notice = Quarantine.duplicateRoeNumber(roe.roeNumber);
    const fix = new GpsFix({ latitude: roe.latitude, longitude: roe.longitude }).read();
    const notes: IntakeNote[] = [];
    if (fix.unreadable !== null) notes.push(gpsNote('', fix.unreadable));
    const [note] = notes;
    return this.db.$write(
      {
        actorId: roe.madeById,
        source: 'DEVICE',
        deviceId: roe.deviceId,
        ...(note === undefined ? {} : { reason: note.message }),
      },
      async (tx): Promise<SyncAnswer> => {
        const saved = await tx.roe.findUnique({ where: { id: roe.id } });
        if (saved !== null) return { answer: 'ALREADY_SAVED', id: roe.id };
        const waiting = await Intake.waiting(tx, roe.id, notice);
        if (waiting !== null) return waiting;
        const holder = await tx.roe.findUnique({
          where: { projectId_roeNumber: { projectId: roe.projectId, roeNumber: roe.roeNumber } },
        });
        if (holder !== null) {
          await tx.quarantinedRecord.create({
            data: {
              id: roe.id,
              projectId: roe.projectId,
              deviceId: roe.deviceId,
              monitorId: roe.madeById,
              payload: asSent(sent),
              reason: notice.reason,
              holdingRoeId: holder.id,
              receivedAt,
            },
          });
          await ledgerRow(tx, brought, {
            recordId: roe.id,
            recordKind: 'ROE',
            deviceId: roe.deviceId,
            answer: 'QUARANTINED',
          });
          return Intake.notSaved(roe.id, notice, holder.id);
        }
        await new RecordWrite(tx, receivedAt).roe(roe, fix.fix, notes);
        await ledgerRow(tx, brought, {
          recordId: roe.id,
          recordKind: 'ROE',
          deviceId: roe.deviceId,
          answer: 'SAVED',
        });
        // The tickets whose field events were waiting for this number point at it now, and
        // so may a survey, whose flags are no ticket's.
        if (brought !== undefined) {
          await this.queued(tx, brought, {
            projectId: roe.projectId,
            tickets: [],
            others: await new WorkQueue(tx, this.ticketsAJob).ticketsWith(roe.projectId, {
              roeId: roe.id,
            }),
            projectRecords: true,
          });
        }
        return { answer: 'SAVED', id: roe.id, notes };
      },
    );
  }

  // A photograph's record, sent after the records (ARCHITECTURE §9 (2); ADR-101, 481), with the
  // fingerprint taken at capture and the one of the file its phone will upload, each as the
  // phone said it, written once. It belongs to the record its phone made it for; while that
  // record waits in quarantine, to the quarantined record and nothing else (ADR-292 (5)).
  // **Where its files are kept is made here**, from its own id and its project's, never sent
  // (`photoPlaces`). Its file is uploaded after, on its own (task 2.6.4, part 3): `uploadedAt`
  // stays empty until then. Intake writes neither of the back office's marks.
  //
  // A record the server doesn't have saved (held for a person, not yet sent, or not of the
  // kind the photograph says) is no record it can belong to: nothing is tried, and `Sync`
  // holds the photograph for a person (ADR-481). Sent again once its record is saved, it is
  // saved. Saved, it queues what reads it: a field event's ticket (a pay item may require a
  // photograph), or a certification's views, which the run checks by themselves.
  async photo(photo: SentPhoto, brought?: Brought): Promise<PhotoTaken> {
    const receivedAt = this.clock.now();
    const fix = new GpsFix(photo).read();
    const notes: IntakeNote[] = [];
    if (fix.unreadable !== null) notes.push(gpsNote('', fix.unreadable));
    const [note] = notes;
    return this.db.$write(
      {
        actorId: photo.takenById,
        source: 'DEVICE',
        deviceId: photo.deviceId,
        ...(note === undefined ? {} : { reason: note.message }),
      },
      async (tx): Promise<PhotoTaken> => {
        const saved = await tx.photo.findUnique({ where: { id: photo.id } });
        if (saved !== null) return { answer: 'ALREADY_SAVED', id: photo.id };
        const quarantined = await tx.quarantinedRecord.findUnique({
          where: { id: photo.owner.id },
        });
        const ownerEvent =
          quarantined === null && photo.owner.kind === 'FIELD_EVENT'
            ? await tx.fieldEvent.findUnique({ where: { id: photo.owner.id } })
            : null;
        if (quarantined === null && ownerEvent === null) {
          if (!(await Intake.ownerSaved(tx, photo.owner))) return { answer: 'OWNER_NOT_SAVED' };
        }
        const owner = (kind: SentPhoto['owner']['kind']): string | null =>
          quarantined === null && photo.owner.kind === kind ? photo.owner.id : null;
        const places = photoPlaces(photo.projectId, photo.id, photo.depthSha256 !== null);
        await tx.photo.create({
          data: {
            id: photo.id,
            projectId: photo.projectId,
            fieldEventId: owner('FIELD_EVENT'),
            certificationId: owner('CERTIFICATION'),
            scaleReceiptId: owner('SCALE_RECEIPT'),
            roeId: owner('ROE'),
            surveyId: owner('SURVEY'),
            incidentId: owner('INCIDENT'),
            dropOffLogId: owner('DROP_OFF_LOG'),
            quarantinedRecordId: quarantined?.id ?? null,
            view: photo.view,
            capturedAt: photo.capturedAt,
            deviceUtcOffsetMinutes: photo.deviceUtcOffsetMinutes,
            receivedAt,
            latitude: fix.fix?.latitude ?? null,
            longitude: fix.fix?.longitude ?? null,
            originalSha256: photo.originalSha256,
            uploadedSha256: photo.uploadedSha256,
            objectKey: places.objectKey,
            depthObjectKey: places.depthObjectKey,
            depthSha256: photo.depthSha256,
            deviceId: photo.deviceId,
          },
        });
        await ledgerRow(tx, brought, {
          recordId: photo.id,
          recordKind: 'PHOTO',
          deviceId: photo.deviceId,
          answer: 'SAVED',
        });
        if (ownerEvent !== null) {
          await this.queued(tx, brought, {
            projectId: photo.projectId,
            tickets: [{ workflow: ownerEvent.workflow, ticketNumber: ownerEvent.ticketNumber }],
          });
        } else if (quarantined === null && photo.owner.kind === 'CERTIFICATION') {
          await this.queued(tx, brought, {
            projectId: photo.projectId,
            tickets: [],
            projectRecords: true,
          });
        }
        return { answer: 'SAVED', id: photo.id, notes };
      },
    );
  }

  // Whether the record a photograph names is saved, as the kind it says.
  private static async ownerSaved(tx: Tx, owner: SentPhoto['owner']): Promise<boolean> {
    const where = { where: { id: owner.id }, select: { id: true } } as const;
    switch (owner.kind) {
      case 'FIELD_EVENT':
        return (await tx.fieldEvent.findUnique(where)) !== null;
      case 'SCALE_RECEIPT':
        return (await tx.scaleReceipt.findUnique(where)) !== null;
      case 'ROE':
        return (await tx.roe.findUnique(where)) !== null;
      case 'SURVEY':
        return (await tx.survey.findUnique(where)) !== null;
      case 'INCIDENT':
        return (await tx.incident.findUnique(where)) !== null;
      case 'DROP_OFF_LOG':
        return (await tx.dropOffLog.findUnique(where)) !== null;
      case 'CERTIFICATION':
        return (await tx.certification.findUnique(where)) !== null;
    }
  }

  // A record already waiting in quarantine under this id: sent again, it is the same quarantined
  // record, and still not saved (AC-05-15).
  private static async waiting(
    tx: Tx,
    id: string,
    notice: QuarantineNotice,
  ): Promise<SyncAnswer | null> {
    const waiting = await tx.quarantinedRecord.findUnique({ where: { id } });
    if (waiting === null) return null;
    return Intake.notSaved(id, notice, waiting.holdingEventId ?? waiting.holdingRoeId ?? id);
  }

  private static notSaved(id: string, notice: QuarantineNotice, heldBy: string): SyncAnswer {
    return { answer: 'QUARANTINED', id, reason: notice.reason, message: notice.message, heldBy };
  }
}

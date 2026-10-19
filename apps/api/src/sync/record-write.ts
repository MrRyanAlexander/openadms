// How a record a phone made becomes a row (spec/parts/05-sync.md steps 3–8; ADR-022, 149, 292,
// 325, 329, 338, 364). One way of writing it, used wherever one is written: by intake as the
// record arrives, by the back office when it creates a field event because a phone failed
// (ADR-156), and by a reviewer who resolves a quarantined record, which becomes the record its
// phone sent, under the number it should have had.
//
// Nothing here decides whether a record is saved: its caller does, inside its own piece of work,
// as whoever it states. Nothing is concluded either: a field event lands PENDING, and only what
// a number finds (the certification, the ROE) is filled in.
import { formAnswersSchema, formDefinitionFields } from '@open-adms/contracts';
import type { FormDocumentType, Prisma } from '@open-adms/db';
import { fieldEventDetails, GpsFix, type ReadableFix, type SentFix } from '@open-adms/domain';

import type { IntakeNote, SentAnswers, SentFieldEvent, SentRoe } from './sent.ts';

type Tx = Prisma.TransactionClient;

const day = (date: string): Date => new Date(`${date}T00:00:00Z`);

const quoted = (half: unknown): string => (half === null ? 'none' : JSON.stringify(half));

// A field event to write: as a phone sends it, or as the back office creates one, which names
// who created it and the reason picked, and has no phone, assignment, list version or typed
// capacity (ADR-156, 432).
export type FieldEventToWrite = Omit<
  SentFieldEvent,
  'source' | 'deviceId' | 'assignmentId' | 'setupVersion' | 'typedCapacityCy'
> &
  (
    | {
        readonly source: 'DEVICE';
        readonly deviceId: string;
        readonly assignmentId: string;
        readonly setupVersion: number;
        // The capacity read off a truck keyed in by hand: a phone's alone to say (ADR-154).
        readonly typedCapacityCy: number | null;
      }
    | {
        readonly source: 'BACK_OFFICE';
        readonly createdById: string;
        readonly createdReasonId: string;
      }
  );

// The firm's own fields as a record keeps them: the answers, and the definition answered with its
// form, all three or none.
interface AnswersKept {
  readonly answers: Prisma.InputJsonObject;
  readonly formDefinitionId: string | null;
  readonly formId: string | null;
  readonly formDocumentType: FormDocumentType | null;
}

// A fix a phone sent that couldn't be one: what its sender is told. Where: a field event's start
// or end, a waypoint by its place in the order (ADR-581), or a form's one fix.
export function gpsNote(end: 'start' | 'end' | '' | number, sent: SentFix): IntakeNote {
  const where =
    end === '' ? '' : typeof end === 'number' ? ` at waypoint ${String(end)}` : ` at the ${end}`;
  return {
    code: 'GPS_UNREADABLE',
    message: `GPS unreadable${where}: latitude ${quoted(sent.latitude)}, longitude ${quoted(sent.longitude)} as sent. Kept without that fix.`,
  };
}

// Thrown where a record names something the server doesn't have and no constraint of the
// database's says so first: nothing is saved, and `Sync` answers it as it does the database's
// own refusal (ADR-467 (5), 472).
export class NamesNothing extends Error {}

// Writes inside the caller's piece of work, with the time the server received the record.
export class RecordWrite {
  private readonly tx: Tx;
  private readonly receivedAt: Date;

  constructor(tx: Tx, receivedAt: Date) {
    this.tx = tx;
    this.receivedAt = receivedAt;
  }

  // A field event with its item lines, the tickets it carries and its waypoints. Answers what the
  // sender should know: a fix that couldn't be one is kept as sent, the record saved without it.
  async fieldEvent(event: FieldEventToWrite): Promise<IntakeNote[]> {
    const { tx, receivedAt } = this;
    const notes: IntakeNote[] = [];
    const start = new GpsFix({
      latitude: event.startLatitude,
      longitude: event.startLongitude,
    }).read();
    const end = new GpsFix({
      latitude: event.endLatitude,
      longitude: event.endLongitude,
    }).read();
    const unreadable = {
      ...(start.unreadable === null ? {} : { start: start.unreadable }),
      ...(end.unreadable === null ? {} : { end: end.unreadable }),
    };
    if (start.unreadable !== null) notes.push(gpsNote('start', start.unreadable));
    if (end.unreadable !== null) notes.push(gpsNote('end', end.unreadable));

    const certification = await tx.certification.findUnique({
      where: {
        projectId_certNumber: { projectId: event.projectId, certNumber: event.certNumber },
      },
    });
    const findsRoe = (fieldEventDetails.roeId as readonly string[]).includes(event.kind);
    const roe = findsRoe ? await this.roeOf(event.projectId, event.roeNumber) : null;
    // The debris type's form is the entry's own: a load's the load form, a haul-out's the
    // haul-out form (ADR-325).
    const entry =
      event.formDebrisTypeId === null
        ? null
        : await tx.formDebrisType.findUnique({ where: { id: event.formDebrisTypeId } });

    await tx.fieldEvent.create({
      data: {
        id: event.id,
        projectId: event.projectId,
        workflow: event.workflow,
        kind: event.kind,
        ticketNumber: event.ticketNumber,
        splitSuffix: event.splitSuffix,
        monitorId: event.monitorId,
        source: event.source,
        deviceId: event.source === 'DEVICE' ? event.deviceId : null,
        assignmentId: event.source === 'DEVICE' ? event.assignmentId : null,
        setupVersion: event.source === 'DEVICE' ? event.setupVersion : null,
        createdById: event.source === 'BACK_OFFICE' ? event.createdById : null,
        createdReasonId: event.source === 'BACK_OFFICE' ? event.createdReasonId : null,
        // A temporary session's mark is the one the field event kept before it said which way
        // (ADR-534 (11)); the database holds the two to agree.
        temporarySession: event.masterPasscodeSession === 'TEMPORARY',
        masterPasscodeSession: event.masterPasscodeSession,
        numberTyped: event.numberTyped,
        numberTypedReasonId: event.numberTypedReasonId,
        certNumber: event.certNumber,
        certificationId: certification?.id ?? null,
        certKeyedByHand: event.certKeyedByHand,
        typedCapacityCy: event.source === 'DEVICE' ? event.typedCapacityCy : null,
        siteId: event.siteId,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        deviceUtcOffsetMinutes: event.deviceUtcOffsetMinutes,
        receivedAt,
        startLatitude: start.fix?.latitude ?? null,
        startLongitude: start.fix?.longitude ?? null,
        endLatitude: end.fix?.latitude ?? null,
        endLongitude: end.fix?.longitude ?? null,
        ...(Object.keys(unreadable).length === 0
          ? {}
          : { unreadableGps: unreadable as Prisma.InputJsonObject }),
        address: event.address,
        addressSource: event.addressSource,
        notes: event.notes,
        formDebrisTypeId: event.formDebrisTypeId,
        formId: entry?.formId ?? null,
        formDocumentType: entry?.documentType ?? null,
        fieldTagId: event.fieldTagId,
        roeNumber: event.roeNumber,
        roeId: roe,
        estimateCy: event.estimateCy,
        loadCall: event.loadCall,
        scaleReceiptId: event.scaleReceiptId,
        carriedCount: event.carriedCount,
        kindOfWorkId: event.kindOfWorkId,
        payableTypeId: event.payableTypeId,
        payItemId: event.payItemId,
        unitCount: event.unitCount,
        measurementInches: event.measurementInches,
        measuredAs: event.measuredAs,
        rootBallInches: event.rootBallInches,
        rootBallHalfExposed: event.rootBallHalfExposed,
        surveyNumber: event.surveyNumber,
        markedIneligible: event.markedIneligible,
      },
    });
    for (const item of event.items) {
      await tx.fieldEventItem.create({
        data: {
          itemNameId: item.itemNameId,
          quantity: item.quantity,
          fieldEventId: event.id,
          fieldEventKind: event.kind,
        },
      });
    }
    for (const carriedTicketNumber of event.carriedTickets) {
      await tx.carriedTicket.create({
        data: { carriedTicketNumber, fieldEventId: event.id, fieldEventKind: event.kind },
      });
    }
    // A collection's waypoints, in the order marked, each kept as recorded (ADR-581).
    for (const [index, waypoint] of event.waypoints.entries()) {
      const position = index + 1;
      const read = new GpsFix({
        latitude: waypoint.latitude,
        longitude: waypoint.longitude,
      }).read();
      if (read.unreadable !== null) notes.push(gpsNote(position, read.unreadable));
      await tx.fieldEventWaypoint.create({
        data: {
          fieldEventId: event.id,
          fieldEventKind: event.kind,
          position,
          markedAt: waypoint.markedAt,
          latitude: read.fix?.latitude ?? null,
          longitude: read.fix?.longitude ?? null,
          ...(read.unreadable === null
            ? {}
            : { unreadableGps: read.unreadable as unknown as Prisma.InputJsonObject }),
        },
      });
    }
    return notes;
  }

  // An ROE, and what was waiting for it: every record that arrived before it with its number
  // now points at it (ADR-149, 292).
  async roe(roe: SentRoe, fix: ReadableFix | null, notes: IntakeNote[]): Promise<void> {
    const { tx, receivedAt } = this;
    await tx.roe.create({
      data: {
        id: roe.id,
        projectId: roe.projectId,
        roeNumber: roe.roeNumber,
        parcelId: roe.parcelId,
        address: roe.address,
        ownerName: roe.ownerName,
        signed: roe.signed,
        signedDate: roe.signedDate === null ? null : day(roe.signedDate),
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        ...(await this.answersOf(roe, notes)),
        source: roe.source,
        madeById: roe.madeById,
        deviceId: roe.deviceId,
        assignmentId: roe.assignmentId,
        madeAt: roe.madeAt,
        deviceUtcOffsetMinutes: roe.deviceUtcOffsetMinutes,
        receivedAt,
      },
    });
    const awaited = { projectId: roe.projectId, roeNumber: roe.roeNumber, roeId: null };
    await tx.fieldEvent.updateMany({
      where: { ...awaited, kind: { in: [...fieldEventDetails.roeId] } },
      data: { roeId: roe.id },
    });
    await tx.survey.updateMany({ where: awaited, data: { roeId: roe.id } });
    await tx.incident.updateMany({ where: awaited, data: { roeId: roe.id } });
  }

  // The ROE a number finds on the project, if it has reached the server (ADR-292).
  async roeOf(projectId: string, roeNumber: string | null): Promise<string | null> {
    if (roeNumber === null) return null;
    const roe = await this.tx.roe.findUnique({
      where: { projectId_roeNumber: { projectId, roeNumber } },
    });
    return roe?.id ?? null;
  }

  // The firm's own fields: kept as sent, with the definition answered and its form. The answers
  // are run against that version's fields; ones that don't fit are still the monitor's record,
  // so they are kept and the sender told (ADR-052, 327).
  async answersOf(sent: SentAnswers, notes: IntakeNote[]): Promise<AnswersKept> {
    const { tx } = this;
    const answers = (sent.answers ?? {}) as Prisma.InputJsonObject;
    if (sent.formDefinitionId === undefined) {
      return { answers, formDefinitionId: null, formId: null, formDocumentType: null };
    }
    const definition = await tx.formDefinition.findUnique({
      where: { id: sent.formDefinitionId },
    });
    if (definition === null) {
      throw new NamesNothing(
        `No form definition ${sent.formDefinitionId}: the record was not saved.`,
      );
    }
    const fields = formDefinitionFields.safeParse(definition.fields);
    if (!fields.success || !formAnswersSchema(fields.data).safeParse(answers).success) {
      notes.push({
        code: 'ANSWERS_DO_NOT_FIT',
        message: `Its answers don't fit the form's own fields as version ${String(definition.version)} has them: kept as sent.`,
      });
    }
    return {
      answers,
      formDefinitionId: definition.id,
      formId: definition.formId,
      formDocumentType: definition.documentType,
    };
  }
}

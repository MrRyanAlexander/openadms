// What a sync held for a person, resolved (spec/parts/05-sync.md step 6;
// spec/parts/08-review-and-corrections.md, "One review queue"; AC-05-46; AC-10-74…76; BACKLOG
// 2.8.4; ADR-022, 051, 364, 468, 471, 481, 482, 526). OWASP ASVS 5.0 V8 and V16; API Security
// Top 10 API1 and API5.
//
// What a phone sent that the server couldn't save is real work as often as not (a field app's
// bug, a server restored from a backup: ADR-468 (2)). A person reads it and decides, once, with
// a reason, as they are, from the back office, the database naming them on it:
// - **Saved as corrected** (correct): the record as it should be, in the sync's own shape, keeps
//   the id its phone made and the kind it was sent as; it is written by the code every record of
//   its kind is written by (`RecordWrite`, `Intake`, `Certifications`), as the phone's record it
//   was (its phone, its assignment, its setup version) with the time the server received it,
//   and the photographs kept with it move to it. Its tickets are queued as a correction's are;
//   one locked as invoiced refuses it. A report is never saved so: the back office writes an
//   assignment on the dispatch board.
// - **Closed, never to be saved** (void: what never happened): nothing is made from it, and what
//   was sent stays, with its photographs.
// - **A file set aside is closed** (void): the photograph's own file won't come, and this one
//   stays beside it, never the photograph's (its fingerprint is the phone's word, ADR-481).
// Either way what was sent is still there exactly as sent: the database refuses any change to it,
// and a second resolution.
import { heldSentAs, type CorrectedRecord } from '@open-adms/contracts';
import type { HeldRecord, Prisma, SetAsideFile } from '@open-adms/db';
import {
  GpsFix,
  HeldResolution,
  QuarantineResolution,
  Renumber,
  type HeldSentAs,
} from '@open-adms/domain';

import { Certifications } from '../certification/certifications.ts';
import { type Outcome, Refused } from '../setup/setup-service.ts';
import type { Intake } from '../sync/intake.ts';
import { RecordWrite } from '../sync/record-write.ts';
import type { IntakeNote, SentPhoto } from '../sync/sent.ts';
import { fromPhone } from '../sync/sync.ts';
import {
  ReviewService,
  type Reviewed,
  type TicketNamed,
  ticketOf,
  type Tx,
} from './review-service.ts';

// A held record with the photographs kept with it, by id.
export interface HeldShown {
  readonly held: HeldRecord;
  readonly photos: readonly string[];
}

export interface HeldReviewParts {
  readonly intake: Intake;
  readonly certifications: Certifications;
}

// Where a photograph kept with a held record goes when the record is saved: the column of the
// kind it was sent as.
const ownerColumn = {
  FIELD_EVENT: 'fieldEventId',
  SCALE_RECEIPT: 'scaleReceiptId',
  INCIDENT: 'incidentId',
  DROP_OFF_LOG: 'dropOffLogId',
  SURVEY: 'surveyId',
  ROE: 'roeId',
  CERTIFICATION: 'certificationId',
} as const satisfies Record<
  Exclude<HeldSentAs, 'PHOTO' | 'REPORT'>,
  keyof Prisma.PhotoUncheckedUpdateManyInput
>;

const idOf = (corrected: CorrectedRecord): string => {
  switch (corrected.record) {
    case 'FIELD_EVENT':
      return corrected.fieldEvent.id;
    case 'SCALE_RECEIPT':
      return corrected.scaleReceipt.id;
    case 'INCIDENT':
      return corrected.incident.id;
    case 'DROP_OFF_LOG':
      return corrected.dropOffLog.id;
    case 'SURVEY':
      return corrected.survey.id;
    case 'ROE':
      return corrected.roe.id;
    case 'CERTIFICATION':
      return corrected.certification.id;
    case 'PHOTO':
      return corrected.photo.id;
  }
};

const projectOf = (corrected: CorrectedRecord): string => {
  switch (corrected.record) {
    case 'FIELD_EVENT':
      return corrected.fieldEvent.projectId;
    case 'SCALE_RECEIPT':
      return corrected.scaleReceipt.projectId;
    case 'INCIDENT':
      return corrected.incident.projectId;
    case 'DROP_OFF_LOG':
      return corrected.dropOffLog.projectId;
    case 'SURVEY':
      return corrected.survey.projectId;
    case 'ROE':
      return corrected.roe.projectId;
    case 'CERTIFICATION':
      return corrected.certification.projectId;
    case 'PHOTO':
      return corrected.photo.projectId;
  }
};

// A warning a certification's own write gives (a sub placed elsewhere) is the back office's to
// see on the certification: saving it here answers none.
const unwarned = (): void => undefined;

export class HeldReview extends ReviewService {
  private readonly parts: HeldReviewParts;

  constructor(
    db: ConstructorParameters<typeof ReviewService>[0],
    clock: ConstructorParameters<typeof ReviewService>[1],
    policy: ConstructorParameters<typeof ReviewService>[2],
    parts: HeldReviewParts,
  ) {
    super(db, clock, policy);
    this.parts = parts;
  }

  save(
    person: string,
    heldRecordId: string,
    corrected: CorrectedRecord,
    note: string,
  ): Promise<Outcome<Reviewed<HeldShown>>> {
    return this.review(person, 'CORRECT', note, async (tx) => {
      const { held, resolution } = await HeldReview.waiting(tx, heldRecordId);
      const id = idOf(corrected);
      const kind = corrected.record;
      const refusal = resolution.savingRefusal(
        { sentId: held.sentId, sentAs: heldSentAs(held.payload, held.reason) },
        { id, kind },
      );
      if (refusal !== null) throw new Refused(refusal);
      const projectId = projectOf(corrected);
      const kept = await tx.photo.findMany({
        where: { heldRecordId: held.id },
        select: { id: true },
      });
      // Its photographs are of the project it was sent for, and stay so.
      if (kept.length > 0 && projectId !== held.projectId) {
        throw new Refused(resolution.notInTheProjectSent());
      }
      // The record first, refused before anything is written where its number is held; then
      // the resolution, since a photograph leaves a held record only once a person resolved it.
      const { tickets, projectRecords } = await this.written(tx, held, corrected);
      await this.resolved(tx, person, held.id, resolution.saved(kind));
      if (kind !== 'PHOTO' && kept.length > 0) {
        await tx.photo.updateMany({
          where: { heldRecordId: held.id },
          data: { heldRecordId: null, [ownerColumn[kind]]: id },
        });
      }
      return {
        record: await HeldReview.shown(tx, held.id),
        projectId,
        tickets,
        projectRecords,
      };
    });
  }

  close(person: string, heldRecordId: string, note: string): Promise<Outcome<HeldShown>> {
    return this.mark(person, 'VOID', note, async (tx) => {
      const { held, resolution } = await HeldReview.waiting(tx, heldRecordId);
      await this.resolved(tx, person, held.id, resolution.closed());
      return HeldReview.shown(tx, held.id);
    });
  }

  closeSetAside(
    person: string,
    setAsideFileId: string,
    note: string,
  ): Promise<Outcome<SetAsideFile>> {
    return this.mark(person, 'VOID', note, async (tx) => {
      const file = await tx.setAsideFile.findUniqueOrThrow({ where: { id: setAsideFileId } });
      const resolution = new HeldResolution(file.resolution, 'SET_ASIDE_FILE');
      const refusal = resolution.refusal();
      if (refusal !== null) throw new Refused(refusal);
      return tx.setAsideFile.update({
        where: { id: setAsideFileId },
        data: {
          resolvedById: person,
          resolvedAt: this.clock.now(),
          resolution: resolution.closed(),
        },
      });
    });
  }

  // The record written as the reviewer, as the phone's record it was: what its kind's own code
  // writes, and the tickets that read it.
  private async written(
    tx: Tx,
    held: HeldRecord,
    corrected: CorrectedRecord,
  ): Promise<{ tickets: TicketNamed[]; projectRecords: boolean }> {
    const { deviceId, receivedAt } = held;
    switch (corrected.record) {
      case 'FIELD_EVENT': {
        const sent = fromPhone(deviceId, corrected);
        if (sent.record !== 'FIELD_EVENT') throw new Error('A field event read as another kind.');
        const event = sent.fieldEvent;
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
          select: { id: true },
        });
        if (holder !== null) throw new Refused(new Renumber(event.kind, event, event).held());
        await new RecordWrite(tx, receivedAt).fieldEvent(event);
        return { tickets: [ticketOf(event)], projectRecords: false };
      }
      case 'ROE': {
        const sent = fromPhone(deviceId, corrected);
        if (sent.record !== 'ROE') throw new Error('An ROE read as another kind.');
        const { roe } = sent;
        const roeNumber = roe.roeNumber.trim();
        const holder = await tx.roe.findUnique({
          where: { projectId_roeNumber: { projectId: roe.projectId, roeNumber } },
          select: { id: true },
        });
        if (roeNumber === '' || holder !== null) {
          throw new Refused(new QuarantineResolution(null).roeNumberHeld(roeNumber));
        }
        const fix = new GpsFix({ latitude: roe.latitude, longitude: roe.longitude }).read();
        const notes: IntakeNote[] = [];
        await new RecordWrite(tx, receivedAt).roe({ ...roe, roeNumber }, fix.fix, notes);
        // The records that were waiting for an ROE of that number point at it now.
        return {
          tickets: await ReviewService.ticketsOf(tx, { roeId: roe.id }),
          projectRecords: true,
        };
      }
      case 'CERTIFICATION': {
        const { certification } = corrected;
        const holder = await tx.certification.findUnique({
          where: {
            projectId_certNumber: {
              projectId: certification.projectId,
              certNumber: certification.certNumber,
            },
          },
          select: { id: true },
        });
        if (holder !== null) {
          throw new Refused(new HeldResolution(null).certNumberHeld(certification.certNumber));
        }
        await this.parts.certifications.certifiedIn(
          tx,
          unwarned,
          Certifications.asNew({ ...certification, deviceId }),
          { receivedAt, queued: false },
        );
        return {
          tickets: await ReviewService.ticketsOf(tx, {
            projectId: certification.projectId,
            certNumber: certification.certNumber,
          }),
          projectRecords: true,
        };
      }
      case 'PHOTO': {
        const photo: SentPhoto = { ...corrected.photo, deviceId };
        const taken = await this.parts.intake.savedIn(tx, { record: 'PHOTO', photo }, receivedAt);
        if (taken.answer === 'OWNER_NOT_SAVED') {
          throw new Refused(new HeldResolution(null).notInTheProjectSent());
        }
        return {
          tickets:
            photo.owner.kind === 'FIELD_EVENT'
              ? await ReviewService.ticketsOf(tx, { id: photo.owner.id })
              : [],
          projectRecords: photo.owner.kind === 'CERTIFICATION',
        };
      }
      case 'SCALE_RECEIPT':
      case 'INCIDENT':
      case 'DROP_OFF_LOG':
      case 'SURVEY': {
        const sent = fromPhone(deviceId, corrected);
        if (
          sent.record !== 'SCALE_RECEIPT' &&
          sent.record !== 'INCIDENT' &&
          sent.record !== 'DROP_OFF_LOG' &&
          sent.record !== 'SURVEY'
        ) {
          throw new Error('A form read as another kind.');
        }
        await this.parts.intake.savedIn(tx, sent, receivedAt);
        // A survey's flags sit on the survey, on no ticket: the run checks them by themselves.
        return { tickets: [], projectRecords: sent.record === 'SURVEY' };
      }
    }
  }

  // The held record, still waiting: one already resolved is refused, and stays as it was.
  private static async waiting(
    tx: Tx,
    id: string,
  ): Promise<{ held: HeldRecord; resolution: HeldResolution }> {
    const held = await tx.heldRecord.findUniqueOrThrow({ where: { id } });
    const resolution = new HeldResolution(held.resolution);
    const refusal = resolution.refusal();
    if (refusal !== null) throw new Refused(refusal);
    return { held, resolution };
  }

  private resolved(tx: Tx, person: string, id: string, resolution: string): Promise<HeldRecord> {
    return tx.heldRecord.update({
      where: { id },
      data: { resolvedById: person, resolvedAt: this.clock.now(), resolution },
    });
  }

  static async shown(tx: Tx, id: string): Promise<HeldShown> {
    const held = await tx.heldRecord.findUniqueOrThrow({ where: { id } });
    const photos = await tx.photo.findMany({
      where: { heldRecordId: id },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    return { held, photos: photos.map((photo) => photo.id) };
  }
}

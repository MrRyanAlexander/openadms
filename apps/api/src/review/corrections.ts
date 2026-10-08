// Corrections and renumbering (spec/parts/08-review-and-corrections.md steps 2…4;
// spec/acceptance/08-review-and-corrections.md sections C and D; adms-exceptions "Corrections:
// in place, by permission", "Correct, void or accept"; ADR-028, 039, 051, 086, 236, 337, 345,
// 364; invariant 5).
//
// Any captured field of a field event, and of the records beside it (its item lines and the
// tickets it carries, a scale receipt, a photograph's two marks, an ROE and its scope, a survey,
// an incident, a drop-off log), is corrected in place by a permitted person: the same record,
// its id unchanged, no replacement and no "correction event". The database keeps the value
// before in the audit log, under that person. Nothing is deleted: a line, a carried ticket, a
// scope pick or a photograph taken off is marked with the time, and put back by clearing the
// mark.
//
// What a number finds is found again: a corrected cert number its certification, a corrected
// ROE number its ROE, a corrected debris type its form. Nothing here judges the correction or
// the renumber: renumbering a phantom is saved like any other (ADR-028, 051).
//
// Not corrected here: a record's id, its project, its workflow and its kind; the server's
// received time; anything the worker concludes; the audit log. A record under a void, and one
// locked as invoiced, are tasks 1.8.4's and 1.8.5's to say (ADR-364).
import type {
  AddressSource,
  CarriedTicket,
  Certification,
  DropOffLog,
  FieldEvent,
  FieldEventItem,
  Incident,
  Photo,
  Roe,
  RoeScopeItem,
  ScaleReceipt,
  Survey,
} from '@open-adms/db';
import { Prisma } from '@open-adms/db';
import { fieldEventDetails, GpsFix, type MeasuredAs, Renumber } from '@open-adms/domain';

import { type BoxMeasurements, Certifications } from '../certification/certifications.ts';
import { day, type Outcome, Refused } from '../setup/setup-service.ts';
import { ReviewService, type Reviewed, ticketOf, type Tx } from './review-service.ts';

// A fix as a reviewer corrects one: both halves as exact decimal text, or none.
export type CorrectedFix = { readonly latitude: string; readonly longitude: string } | null;

// What a reviewer may correct on a field event; each is changed only where it is stated. Its
// number and split suffix are a renumber's.
export interface FieldEventCorrection {
  readonly monitorId?: string;
  readonly startedAt?: Date;
  readonly endedAt?: Date;
  readonly deviceUtcOffsetMinutes?: number;
  readonly start?: CorrectedFix;
  readonly end?: CorrectedFix;
  readonly address?: string | null;
  readonly addressSource?: AddressSource | null;
  readonly notes?: string | null;
  readonly certNumber?: string;
  readonly certKeyedByHand?: boolean;
  readonly typedCapacityCy?: number | null;
  readonly numberTyped?: boolean;
  readonly numberTypedReasonId?: string | null;
  readonly siteId?: string | null;
  readonly formDebrisTypeId?: string | null;
  readonly fieldTagId?: string | null;
  readonly roeNumber?: string | null;
  readonly estimateCy?: number | null;
  readonly loadCall?: number | null;
  readonly scaleReceiptId?: string | null;
  readonly carriedCount?: number | null;
  readonly kindOfWorkId?: string | null;
  readonly payableTypeId?: string | null;
  readonly payItemId?: string | null;
  readonly unitCount?: number | null;
  readonly measurementInches?: number | null;
  readonly measuredAs?: MeasuredAs | null;
  readonly rootBallInches?: number | null;
  readonly rootBallHalfExposed?: boolean | null;
  readonly surveyNumber?: string | null;
  readonly markedIneligible?: boolean | null;
}

// The fields written as they are stated: nothing else is found from them.
const plain = [
  'monitorId',
  'startedAt',
  'endedAt',
  'deviceUtcOffsetMinutes',
  'address',
  'addressSource',
  'notes',
  'certKeyedByHand',
  'typedCapacityCy',
  'numberTyped',
  'numberTypedReasonId',
  'siteId',
  'fieldTagId',
  'estimateCy',
  'loadCall',
  'scaleReceiptId',
  'carriedCount',
  'kindOfWorkId',
  'payableTypeId',
  'payItemId',
  'unitCount',
  'measurementInches',
  'measuredAs',
  'rootBallInches',
  'rootBallHalfExposed',
  'surveyNumber',
  'markedIneligible',
] as const satisfies readonly (keyof FieldEventCorrection)[];

export interface RoeCorrection {
  readonly parcelId?: string | null;
  readonly address?: string | null;
  readonly ownerName?: string | null;
  readonly signed?: boolean;
  // A calendar day, 2026-10-09.
  readonly signedDate?: string | null;
  readonly notes?: string | null;
}

// One pick of an ROE's scope: a debris type of the project's load form, or a payable type.
export type ScopePick =
  | { readonly formDebrisTypeId: string; readonly count?: number | null }
  | { readonly payableTypeId: string; readonly count?: number | null };

export interface SurveyCorrection {
  readonly workTypeId?: string;
  readonly surveyNumber?: string | null;
  readonly roeNumber?: string | null;
  readonly notes?: string | null;
}

export interface IncidentCorrection {
  readonly incidentTypeId?: string;
  readonly incidentSubTypeId?: string | null;
  readonly description?: string | null;
  readonly parties?: string | null;
  readonly address?: string | null;
  readonly contractorId?: string | null;
  readonly certNumber?: string | null;
  readonly roeNumber?: string | null;
  readonly notes?: string | null;
}

export interface DropOffLogCorrection {
  readonly siteId?: string;
  readonly residentName?: string | null;
  readonly originAddress?: string | null;
  readonly notes?: string | null;
}

export interface ScaleReceiptCorrection {
  readonly receiptNumber?: string;
  readonly siteId?: string;
  readonly grossWeightLb?: number | null;
  readonly tareWeightLb?: number | null;
  readonly netWeightLb?: number | null;
  readonly netWeightTons?: number | null;
  readonly notes?: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

// A fix a reviewer typed that can't be one is refused: nobody is waiting at the curb for it.
function fixOf(end: 'start' | 'end', corrected: CorrectedFix): CorrectedFix {
  if (corrected === null) return null;
  const read = new GpsFix(corrected).read();
  if (read.fix === null) {
    throw new Refused({
      code: 'GPS_UNREADABLE',
      message: `The ${end} GPS can’t be a fix: latitude ${JSON.stringify(corrected.latitude)}, longitude ${JSON.stringify(corrected.longitude)}. Nothing was changed.`,
    });
  }
  return read.fix;
}

export class Corrections extends ReviewService {
  // A detail keyed wrong on a field event: corrected in place.
  fieldEvent(
    person: string,
    fieldEventId: string,
    changes: FieldEventCorrection,
    note?: string,
  ): Promise<Outcome<Reviewed<FieldEvent>>> {
    return this.review(person, 'CORRECT', note, async (tx, moves) => {
      const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: fieldEventId } });
      const { projectId } = event;
      // Its certification, its times or its scale receipt may be what is corrected: the
      // tickets that read it as it stands are queued with it.
      await moves(projectId, ticketOf(event));
      const data: Prisma.FieldEventUncheckedUpdateInput = {};
      for (const field of plain) {
        if (changes[field] !== undefined) Object.assign(data, { [field]: changes[field] });
      }
      // A fix that couldn't be one was kept as sent: once a person gives that end its fix, the
      // record has one, and what was sent stays in the audit log (ADR-329 (5)).
      const unreadable = { ...((event.unreadableGps ?? {}) as Record<string, unknown>) };
      if (changes.start !== undefined) {
        const fix = fixOf('start', changes.start);
        data.startLatitude = fix?.latitude ?? null;
        data.startLongitude = fix?.longitude ?? null;
        delete unreadable['start'];
      }
      if (changes.end !== undefined) {
        const fix = fixOf('end', changes.end);
        data.endLatitude = fix?.latitude ?? null;
        data.endLongitude = fix?.longitude ?? null;
        delete unreadable['end'];
      }
      if (event.unreadableGps !== null && (changes.start ?? changes.end) !== undefined) {
        data.unreadableGps =
          Object.keys(unreadable).length === 0
            ? Prisma.DbNull
            : (unreadable as Prisma.InputJsonObject);
      }
      if (changes.certNumber !== undefined) {
        const certification = await tx.certification.findUnique({
          where: { projectId_certNumber: { projectId, certNumber: changes.certNumber } },
        });
        data.certNumber = changes.certNumber;
        data.certificationId = certification?.id ?? null;
      }
      if (changes.roeNumber !== undefined) {
        const findsRoe = (fieldEventDetails.roeId as readonly string[]).includes(event.kind);
        const roe =
          changes.roeNumber === null || !findsRoe
            ? null
            : await tx.roe.findUnique({
                where: { projectId_roeNumber: { projectId, roeNumber: changes.roeNumber } },
              });
        data.roeNumber = changes.roeNumber;
        data.roeId = roe?.id ?? null;
      }
      if (changes.formDebrisTypeId !== undefined) {
        // The debris type's form is the entry's own (ADR-325).
        const entry =
          changes.formDebrisTypeId === null
            ? null
            : await tx.formDebrisType.findUniqueOrThrow({
                where: { id: changes.formDebrisTypeId },
              });
        data.formDebrisTypeId = entry?.id ?? null;
        data.formId = entry?.formId ?? null;
        data.formDocumentType = entry?.documentType ?? null;
      }
      const record = await tx.fieldEvent.update({ where: { id: fieldEventId }, data });
      return { record, projectId, tickets: [ticketOf(event)] };
    });
  }

  // Real work under the wrong number: the field event's number, or a split collection's suffix,
  // is changed and nothing else. No partner is named and no completed load written: the worker
  // pairs by the number in its own run (ADR-019, 028). A number another field event of its kind
  // holds is refused by the database's own key, and nothing changes (invariant 17).
  async renumber(
    person: string,
    fieldEventId: string,
    to: { readonly ticketNumber: string; readonly splitSuffix?: string },
    note?: string,
  ): Promise<Outcome<Reviewed<FieldEvent>>> {
    const asked: { renumber?: Renumber } = {};
    try {
      return await this.review(person, 'RENUMBER', note, async (tx, moves) => {
        const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: fieldEventId } });
        // What read it under the number it leaves (a load that lists it as carried).
        await moves(event.projectId, ticketOf(event));
        const renumber = new Renumber(event.kind, event, {
          ticketNumber: to.ticketNumber,
          splitSuffix: to.splitSuffix ?? event.splitSuffix,
        });
        asked.renumber = renumber;
        const refusal = renumber.refusal();
        if (refusal !== null) throw new Refused(refusal);
        const record = await tx.fieldEvent.update({
          where: { id: fieldEventId },
          data: renumber.to,
        });
        return {
          record,
          projectId: event.projectId,
          tickets: [ticketOf(event), ticketOf(record)],
        };
      });
    } catch (error) {
      if (asked.renumber === undefined || !isUniqueViolation(error)) throw error;
      return { saved: false, refusal: asked.renumber.held() };
    }
  }

  // A line of an itemised unit rate event: its count or hours corrected, a line added, or one
  // taken off (the row stays, marked) and put back by stating its quantity again.
  itemLine(
    person: string,
    fieldEventId: string,
    itemNameId: string,
    quantity: number | 'TAKEN_OFF',
    note?: string,
  ): Promise<Outcome<Reviewed<FieldEventItem>>> {
    return this.review(person, 'CORRECT', note, async (tx) => {
      const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: fieldEventId } });
      const line = { fieldEventId_itemNameId: { fieldEventId, itemNameId } };
      const record =
        quantity === 'TAKEN_OFF'
          ? await tx.fieldEventItem.update({
              where: line,
              data: { archivedAt: this.clock.now() },
            })
          : await tx.fieldEventItem.upsert({
              where: line,
              create: { fieldEventId, fieldEventKind: event.kind, itemNameId, quantity },
              update: { quantity, archivedAt: null },
            });
      return { record, projectId: event.projectId, tickets: [ticketOf(event)] };
    });
  }

  // A ticket a load's collection lists as carried: added, taken off (the row stays, marked) or
  // put back.
  carriedTicket(
    person: string,
    fieldEventId: string,
    carriedTicketNumber: string,
    carried: boolean,
    note?: string,
  ): Promise<Outcome<Reviewed<CarriedTicket>>> {
    return this.review(person, 'CORRECT', note, async (tx, moves) => {
      const event = await tx.fieldEvent.findUniqueOrThrow({ where: { id: fieldEventId } });
      // Another load that lists the same ticket is flagged for it until this one stops.
      await moves(event.projectId, ticketOf(event));
      const listed = { fieldEventId_carriedTicketNumber: { fieldEventId, carriedTicketNumber } };
      const record = carried
        ? await tx.carriedTicket.upsert({
            where: listed,
            create: { fieldEventId, fieldEventKind: event.kind, carriedTicketNumber },
            update: { archivedAt: null },
          })
        : await tx.carriedTicket.update({
            where: listed,
            data: { archivedAt: this.clock.now() },
          });
      return { record, projectId: event.projectId, tickets: [ticketOf(event)] };
    });
  }

  // A photograph's two marks: removed from the record (its row, its file and its fingerprints
  // stay; it counts for nothing a record must have, ADR-345) or put back, and its label.
  photograph(
    person: string,
    photoId: string,
    marks: { readonly removed?: boolean; readonly label?: string | null },
    note?: string,
  ): Promise<Outcome<Reviewed<Photo>>> {
    return this.review(person, 'CORRECT', note, async (tx) => {
      const record = await tx.photo.update({
        where: { id: photoId },
        data: {
          ...(marks.removed === undefined
            ? {}
            : { archivedAt: marks.removed ? this.clock.now() : null }),
          ...(marks.label === undefined ? {} : { label: marks.label }),
        },
      });
      const tickets =
        record.fieldEventId === null
          ? []
          : await ReviewService.ticketsOf(tx, { id: record.fieldEventId });
      return { record, projectId: record.projectId, tickets };
    });
  }

  scaleReceipt(
    person: string,
    scaleReceiptId: string,
    changes: ScaleReceiptCorrection,
    note?: string,
  ): Promise<Outcome<Reviewed<ScaleReceipt>>> {
    return this.review(
      person,
      'CORRECT',
      note,
      async (tx) => {
        const record = await tx.scaleReceipt.update({
          where: { id: scaleReceiptId },
          data: changes,
        });
        // Every disposal that points at it: a tandem's two share the one receipt (ADR-034).
        const tickets = await ReviewService.ticketsOf(tx, { scaleReceiptId });
        return { record, projectId: record.projectId, tickets };
      },
      'PASSED_BY',
    );
  }

  roe(
    person: string,
    roeId: string,
    changes: RoeCorrection,
    note?: string,
  ): Promise<Outcome<Reviewed<Roe>>> {
    return this.review(
      person,
      'CORRECT',
      note,
      async (tx) => {
        const { signedDate, ...rest } = changes;
        const record = await tx.roe.update({
          where: { id: roeId },
          data: {
            ...rest,
            ...(signedDate === undefined
              ? {}
              : { signedDate: signedDate === null ? null : day(signedDate) }),
          },
        });
        return {
          record,
          projectId: record.projectId,
          tickets: await ReviewService.ticketsOf(tx, { roeId }),
        };
      },
      'PASSED_BY',
    );
  }

  // An ROE's scope: a pick added, taken off (the row stays, marked) or put back.
  roeScope(
    person: string,
    roeId: string,
    pick: ScopePick,
    inScope: boolean,
    note?: string,
  ): Promise<Outcome<Reviewed<RoeScopeItem>>> {
    return this.review(
      person,
      'CORRECT',
      note,
      async (tx) => {
        const roe = await tx.roe.findUniqueOrThrow({ where: { id: roeId } });
        const { projectId } = roe;
        const standing = await tx.roeScopeItem.findFirst({
          where:
            'formDebrisTypeId' in pick
              ? { roeId, formDebrisTypeId: pick.formDebrisTypeId }
              : { roeId, payableTypeId: pick.payableTypeId },
        });
        const count = pick.count === undefined ? {} : { count: pick.count };
        let record: RoeScopeItem;
        if (standing !== null) {
          record = await tx.roeScopeItem.update({
            where: { id: standing.id },
            data: { ...count, archivedAt: inScope ? null : this.clock.now() },
          });
        } else if (!inScope) {
          throw new Error(`ROE ${roe.roeNumber} has no such pick in its scope to take off.`);
        } else if ('formDebrisTypeId' in pick) {
          const entry = await tx.formDebrisType.findUniqueOrThrow({
            where: { id: pick.formDebrisTypeId },
          });
          record = await tx.roeScopeItem.create({
            data: {
              projectId,
              roeId,
              formDebrisTypeId: entry.id,
              formId: entry.formId,
              formDocumentType: entry.documentType,
              ...count,
            },
          });
        } else {
          record = await tx.roeScopeItem.create({
            data: { projectId, roeId, payableTypeId: pick.payableTypeId, ...count },
          });
        }
        return { record, projectId, tickets: await ReviewService.ticketsOf(tx, { roeId }) };
      },
      'PASSED_BY',
    );
  }

  survey(
    person: string,
    surveyId: string,
    changes: SurveyCorrection,
    note?: string,
  ): Promise<Outcome<Reviewed<Survey>>> {
    return this.review(person, 'CORRECT', note, async (tx) => {
      const survey = await tx.survey.findUniqueOrThrow({ where: { id: surveyId } });
      const { projectId } = survey;
      const record = await tx.survey.update({
        where: { id: surveyId },
        data: {
          ...changes,
          ...(changes.roeNumber === undefined
            ? {}
            : { roeId: await Corrections.roeOf(tx, projectId, changes.roeNumber) }),
        },
      });
      // A survey's flags sit on the survey, on no ticket: the run checks them by themselves.
      return { record, projectId, tickets: [], projectRecords: true };
    });
  }

  incident(
    person: string,
    incidentId: string,
    changes: IncidentCorrection,
    note?: string,
  ): Promise<Outcome<Reviewed<Incident>>> {
    return this.review(person, 'CORRECT', note, async (tx) => {
      const incident = await tx.incident.findUniqueOrThrow({ where: { id: incidentId } });
      const { projectId } = incident;
      const certification =
        changes.certNumber === undefined || changes.certNumber === null
          ? null
          : await tx.certification.findUnique({
              where: { projectId_certNumber: { projectId, certNumber: changes.certNumber } },
            });
      const record = await tx.incident.update({
        where: { id: incidentId },
        data: {
          ...changes,
          ...(changes.certNumber === undefined
            ? {}
            : { certificationId: certification?.id ?? null }),
          ...(changes.roeNumber === undefined
            ? {}
            : { roeId: await Corrections.roeOf(tx, projectId, changes.roeNumber) }),
        },
      });
      return { record, projectId, tickets: [] };
    });
  }

  dropOffLog(
    person: string,
    dropOffLogId: string,
    changes: DropOffLogCorrection,
    note?: string,
  ): Promise<Outcome<Reviewed<DropOffLog>>> {
    return this.review(person, 'CORRECT', note, async (tx) => {
      const record = await tx.dropOffLog.update({ where: { id: dropOffLogId }, data: changes });
      return { record, projectId: record.projectId, tickets: [] };
    });
  }

  // A measuring mistake on a certification: its box corrected, its capacity worked out again
  // (Certifications.measured), and every ticket that scanned it queued to reprocess at the new
  // capacity, all in one piece of work. One locked as invoiced is named, left off the job, and
  // waits for its unlock (ADR-057, 079).
  certification(
    person: string,
    certificationId: string,
    position: number,
    measurements: BoxMeasurements,
  ): Promise<Outcome<Reviewed<Certification>>> {
    return this.mark(person, 'CORRECT', undefined, async (tx) => {
      const { record, queued } = await new Certifications(
        this.db,
        this.clock,
        this.policy,
      ).measured(tx, person, certificationId, position, measurements);
      const asked = await ReviewService.asked(
        tx,
        person,
        record.projectId,
        await ReviewService.ticketsOf(tx, {
          projectId: record.projectId,
          certNumber: record.certNumber,
        }),
      );
      const touched = new Set(asked.tickets.map((ticket) => JSON.stringify(ticket)));
      return {
        record,
        reprocess: {
          ...asked,
          neighbours: queued.tickets.filter((ticket) => !touched.has(JSON.stringify(ticket))),
          jobs: queued.jobs,
        },
      };
    });
  }

  private static async roeOf(
    tx: Tx,
    projectId: string,
    roeNumber: string | null,
  ): Promise<string | null> {
    if (roeNumber === null) return null;
    const roe = await tx.roe.findUnique({
      where: { projectId_roeNumber: { projectId, roeNumber } },
    });
    return roe?.id ?? null;
  }
}

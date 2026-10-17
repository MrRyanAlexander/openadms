// A record created in the back office (spec/parts/08-review-and-corrections.md step 9;
// spec/acceptance/08-review-and-corrections.md AC-08-21; adms-exceptions §4.3 "A phone failed";
// ADR-156, 173, 364).
//
// A phone failed, and the work still has to reach the system: paper is never the record. A
// permitted person enters the field event the monitor would have made, naming that monitor, and
// picks the reason from the firm's list. It is a field event like any other: it lands PENDING,
// pairs by its number in the worker's run, and is flagged as created in the back office, with
// the person and the reason. It has no phone, assignment or list version.
//
// What is refused is a number another field event of its kind already holds, and a fix the
// person typed that can't be one (ADR-432): the person is right there to be told, so nothing
// goes to quarantine and nothing is kept "as sent".
//
// The forms too (ADR-534 (9)): a survey, an incident and a drop-off log made on paper are
// entered as their monitor would have made them, naming that monitor, with a reason from the
// firm's list; an ROE, which is configuration as much as field work (ADR-294), names the person
// who made it and its number off the paper. What a number finds is found, answers are checked
// against the version they answer, and an ROE links what was waiting for its number. A
// certification from the paper sheet is `Certifications.fromTheSheet`.
import type { DropOffLog, FieldEvent, Incident, Roe, Survey } from '@open-adms/db';
import { fieldEventDetails, PickedReason, QuarantineResolution, Renumber } from '@open-adms/domain';

import { day, type Outcome, Refused } from '../setup/setup-service.ts';
import { type AnswersGiven, answersKept } from './answers-given.ts';
import { RecordWrite } from '../sync/record-write.ts';
import type { SentFieldEvent } from '../sync/sent.ts';
import { type CorrectedFix, fixOf } from './corrections.ts';
import { ReviewService, type Reviewed, ticketOf, type Tx } from './review-service.ts';

// What the person enters: everything a phone would have recorded but the phone itself. The
// number was never scanned, so it isn't a typed one either.
export type NewBackOfficeFieldEvent = Omit<
  SentFieldEvent,
  | 'id'
  | 'source'
  | 'deviceId'
  | 'assignmentId'
  | 'setupVersion'
  | 'masterPasscodeSession'
  | 'numberTyped'
  | 'numberTypedReasonId'
  | 'typedCapacityCy'
> & {
  // Picked from the firm's reasons for a record created in the back office.
  readonly reasonId: string;
};

// What every form entered in the back office says: whose work it was, when by the paper, where,
// the answers to the form's own fields, and the reason picked.
export interface NewBackOfficeForm {
  readonly projectId: string;
  readonly monitorId: string;
  readonly madeAt: Date;
  readonly deviceUtcOffsetMinutes: number;
  readonly fix: CorrectedFix;
  readonly notes: string | null;
  readonly answers: AnswersGiven;
  readonly reasonId: string;
}

export interface NewBackOfficeSurvey extends NewBackOfficeForm {
  readonly workTypeId: string;
  readonly surveyNumber: string | null;
  readonly roeNumber: string | null;
}

export interface NewBackOfficeIncident extends NewBackOfficeForm {
  readonly incidentTypeId: string;
  readonly incidentSubTypeId: string | null;
  readonly description: string | null;
  readonly parties: string | null;
  readonly address: string | null;
  readonly contractorId: string | null;
  readonly certNumber: string | null;
  readonly roeNumber: string | null;
}

export interface NewBackOfficeDropOffLog extends NewBackOfficeForm {
  readonly siteId: string;
  readonly residentName: string | null;
  readonly originAddress: string | null;
}

export interface NewBackOfficeRoe {
  readonly projectId: string;
  // Off the paper, as written.
  readonly roeNumber: string;
  readonly parcelId: string | null;
  readonly address: string | null;
  readonly ownerName: string | null;
  readonly signed: boolean;
  // A calendar day.
  readonly signedDate: string | null;
  readonly fix: CorrectedFix;
  readonly madeAt: Date | null;
  readonly notes: string | null;
  readonly answers: AnswersGiven;
}

export class BackOfficeRecords extends ReviewService {
  fieldEvent(
    person: string,
    input: NewBackOfficeFieldEvent,
  ): Promise<Outcome<Reviewed<FieldEvent>>> {
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const { reasonId, ...entered } = input;
      await BackOfficeRecords.offered(tx, reasonId);
      const holder = await tx.fieldEvent.findUnique({
        where: {
          projectId_workflow_ticketNumber_splitSuffix_kind: {
            projectId: entered.projectId,
            workflow: entered.workflow,
            ticketNumber: entered.ticketNumber,
            splitSuffix: entered.splitSuffix,
            kind: entered.kind,
          },
        },
      });
      if (holder !== null) {
        throw new Refused(
          new Renumber(entered.kind, { ticketNumber: '', splitSuffix: '' }, entered).held(),
        );
      }
      await ReviewService.refusedIfLocked(tx, entered.projectId, [ticketOf(entered)]);
      const ends = [
        ['start', entered.startLatitude ?? null, entered.startLongitude ?? null],
        ['end', entered.endLatitude, entered.endLongitude],
      ] as const;
      for (const [end, latitude, longitude] of ends) {
        if (latitude === null && longitude === null) continue;
        fixOf(end, { latitude: latitude ?? '', longitude: longitude ?? '' });
      }
      // The database makes the id a phone would have made (spec/DATA-MODEL.md §1, Keys).
      const [made] = await tx.$queryRaw<{ id: string }[]>`SELECT uuidv7()::text AS id`;
      if (made === undefined) throw new Error('The database made no id.');
      const now = this.clock.now();
      await new RecordWrite(tx, now).fieldEvent({
        ...entered,
        id: made.id,
        source: 'BACK_OFFICE',
        createdById: person,
        createdReasonId: reasonId,
        masterPasscodeSession: null,
        numberTyped: false,
        numberTypedReasonId: null,
      });
      const record = await tx.fieldEvent.findUniqueOrThrow({ where: { id: made.id } });
      return { record, projectId: record.projectId, tickets: [ticketOf(record)] };
    });
  }

  // An ROE made on paper (ADR-149, 534 (9)): its number off the paper, once a project; the
  // records already naming that number point at it now, and their tickets are queued.
  roe(person: string, input: NewBackOfficeRoe): Promise<Outcome<Reviewed<Roe>>> {
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const { projectId, roeNumber } = input;
      const held = await tx.roe.findUnique({
        where: { projectId_roeNumber: { projectId, roeNumber } },
        select: { id: true },
      });
      if (held !== null) throw new Refused(new QuarantineResolution(null).roeNumberHeld(roeNumber));
      const fix = fixOf(null, input.fix);
      const record = await tx.roe.create({
        data: {
          projectId,
          roeNumber,
          parcelId: input.parcelId,
          address: input.address,
          ownerName: input.ownerName,
          signed: input.signed,
          signedDate: input.signedDate === null ? null : day(input.signedDate),
          latitude: fix?.latitude ?? null,
          longitude: fix?.longitude ?? null,
          ...(await answersKept(
            tx,
            { projectId, kind: 'ROE', formDefinitionId: null },
            input.answers,
          )),
          source: 'BACK_OFFICE',
          madeById: person,
          madeAt: input.madeAt,
          receivedAt: this.clock.now(),
          notes: input.notes,
        },
      });
      const awaited = { projectId, roeNumber, roeId: null };
      await tx.fieldEvent.updateMany({
        where: { ...awaited, kind: { in: [...fieldEventDetails.roeId] } },
        data: { roeId: record.id },
      });
      await tx.survey.updateMany({ where: awaited, data: { roeId: record.id } });
      await tx.incident.updateMany({ where: awaited, data: { roeId: record.id } });
      return {
        record,
        projectId,
        tickets: await ReviewService.ticketsOf(tx, { roeId: record.id }),
        projectRecords: true,
      };
    });
  }

  survey(person: string, input: NewBackOfficeSurvey): Promise<Outcome<Reviewed<Survey>>> {
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const record = await tx.survey.create({
        data: {
          ...(await this.formMade(tx, person, input, 'SURVEY')),
          workTypeId: input.workTypeId,
          surveyNumber: input.surveyNumber,
          roeNumber: input.roeNumber,
          roeId: await BackOfficeRecords.roeOf(tx, input.projectId, input.roeNumber),
        },
      });
      // A survey's flags sit on the survey, on no ticket: the run checks them by themselves.
      return { record, projectId: record.projectId, tickets: [], projectRecords: true };
    });
  }

  incident(person: string, input: NewBackOfficeIncident): Promise<Outcome<Reviewed<Incident>>> {
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const { projectId, certNumber } = input;
      const certification =
        certNumber === null
          ? null
          : await tx.certification.findUnique({
              where: { projectId_certNumber: { projectId, certNumber } },
              select: { id: true },
            });
      const record = await tx.incident.create({
        data: {
          ...(await this.formMade(tx, person, input, 'INCIDENT')),
          incidentTypeId: input.incidentTypeId,
          incidentSubTypeId: input.incidentSubTypeId,
          description: input.description,
          parties: input.parties,
          address: input.address,
          contractorId: input.contractorId,
          certNumber,
          certificationId: certification?.id ?? null,
          roeNumber: input.roeNumber,
          roeId: await BackOfficeRecords.roeOf(tx, projectId, input.roeNumber),
        },
      });
      return { record, projectId, tickets: [] };
    });
  }

  dropOffLog(
    person: string,
    input: NewBackOfficeDropOffLog,
  ): Promise<Outcome<Reviewed<DropOffLog>>> {
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const record = await tx.dropOffLog.create({
        data: {
          ...(await this.formMade(tx, person, input, 'DROP_OFF_LOG')),
          siteId: input.siteId,
          residentName: input.residentName,
          originAddress: input.originAddress,
        },
      });
      return { record, projectId: record.projectId, tickets: [] };
    });
  }

  // What every form made in the back office is written with: no phone, assignment or setup
  // version; the person and the reason; a fix that can be one; answers that fit.
  private async formMade(
    tx: Tx,
    person: string,
    input: NewBackOfficeForm,
    kind: 'SURVEY' | 'INCIDENT' | 'DROP_OFF_LOG',
  ) {
    await BackOfficeRecords.offered(tx, input.reasonId);
    const fix = fixOf(null, input.fix);
    return {
      projectId: input.projectId,
      source: 'BACK_OFFICE' as const,
      monitorId: input.monitorId,
      createdById: person,
      createdReasonId: input.reasonId,
      madeAt: input.madeAt,
      deviceUtcOffsetMinutes: input.deviceUtcOffsetMinutes,
      receivedAt: this.clock.now(),
      latitude: fix?.latitude ?? null,
      longitude: fix?.longitude ?? null,
      notes: input.notes,
      ...(await answersKept(
        tx,
        { projectId: input.projectId, kind, formDefinitionId: null },
        input.answers,
      )),
    };
  }

  // A reason the firm offers for a record made in the back office (ADR-156, 173).
  private static async offered(tx: Tx, reasonId: string): Promise<void> {
    const reason = await tx.reason.findUniqueOrThrow({ where: { id: reasonId } });
    const refusal = new PickedReason({
      name: reason.name,
      uses: reason.uses,
      archived: reason.archivedAt !== null,
    }).refusal('BACK_OFFICE_RECORD');
    if (refusal !== null) throw new Refused(refusal);
  }

  // The ROE a number finds on the project, if one has it (ADR-292).
  private static async roeOf(
    tx: Tx,
    projectId: string,
    roeNumber: string | null,
  ): Promise<string | null> {
    if (roeNumber === null) return null;
    const roe = await tx.roe.findUnique({
      where: { projectId_roeNumber: { projectId, roeNumber } },
      select: { id: true },
    });
    return roe?.id ?? null;
  }
}

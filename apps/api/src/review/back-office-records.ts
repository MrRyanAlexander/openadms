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
// The one thing refused is a number another field event of its kind already holds: the person
// is right there to be told, so nothing goes to quarantine.
import type { FieldEvent } from '@open-adms/db';
import { PickedReason, Renumber } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import { RecordWrite } from '../sync/record-write.ts';
import type { SentFieldEvent } from '../sync/sent.ts';
import { ReviewService, type Reviewed, ticketOf } from './review-service.ts';

// What the person enters: everything a phone would have recorded but the phone itself. The
// number was never scanned, so it isn't a typed one either.
export type NewBackOfficeFieldEvent = Omit<
  SentFieldEvent,
  | 'id'
  | 'source'
  | 'deviceId'
  | 'assignmentId'
  | 'setupVersion'
  | 'temporarySession'
  | 'numberTyped'
  | 'numberTypedReasonId'
> & {
  // Picked from the firm's reasons for a record created in the back office.
  readonly reasonId: string;
};

export class BackOfficeRecords extends ReviewService {
  fieldEvent(
    person: string,
    input: NewBackOfficeFieldEvent,
  ): Promise<Outcome<Reviewed<FieldEvent>>> {
    return this.review(person, 'CORRECT', undefined, async (tx) => {
      const { reasonId, ...entered } = input;
      const reason = await tx.reason.findUniqueOrThrow({ where: { id: reasonId } });
      const refusal = new PickedReason({
        name: reason.name,
        uses: reason.uses,
        archived: reason.archivedAt !== null,
      }).refusal('BACK_OFFICE_RECORD');
      if (refusal !== null) throw new Refused(refusal);
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
        temporarySession: false,
        numberTyped: false,
        numberTypedReasonId: null,
      });
      const record = await tx.fieldEvent.findUniqueOrThrow({ where: { id: made.id } });
      return { record, projectId: record.projectId, tickets: [ticketOf(record)] };
    });
  }
}

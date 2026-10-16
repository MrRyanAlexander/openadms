// Accepting a flag that is right as it is (spec/parts/08-review-and-corrections.md step 5;
// spec/acceptance/08-review-and-corrections.md section F; adms-validation §5.4b; spec/FLAGS.md
// §1; spec/DATA-MODEL.md §6 `FlagAcceptance`; ADR-166, 173, 245, 365).
//
// An acceptance is a mark of its own beside the flag: the flag, a reason picked from the ones
// the firm offers for accepting a flag, the reviewer's own note, who and when. The flag itself
// is the worker's and isn't touched. Any flag that stands may be accepted, a ticket's or one on
// a certification, a site or a survey, once. The grant is its own, "accept flags": the grant to
// correct doesn't carry it (the user, 2026-10-06, KD-74).
//
// It changes nothing that bills. On the run of the job it queues, the worker reads the
// acceptance: a ticket whose every flag is fixed or accepted is COMPLETED, and the flag isn't
// raised again while its facts stand. Changed facts clear it and raise another, which nobody
// has accepted.
//
// **An acceptance is taken back** (ADR-534 (8)) by a person holding the same grant, with a note:
// who and when are written on its own row, which is history after; the flag stands again on the
// next run, and accepting it again is an acceptance of its own. One acceptance is in force for a
// flag at most, held by the database.
import type { FlagAcceptance } from '@open-adms/db';
import { AcceptanceWithdrawal, FlagAccepting, PickedReason } from '@open-adms/domain';

import { type Outcome, Refused } from '../setup/setup-service.ts';
import { ReviewService, type Reviewed } from './review-service.ts';

export class Acceptances extends ReviewService {
  flag(
    person: string,
    flagId: string,
    reasonId: string,
    note?: string,
  ): Promise<Outcome<Reviewed<FlagAcceptance>>> {
    return this.review(
      person,
      'ACCEPT_FLAG',
      note,
      async (tx) => {
        const reason = await tx.reason.findUniqueOrThrow({ where: { id: reasonId } });
        const notOffered = new PickedReason({
          name: reason.name,
          uses: reason.uses,
          archived: reason.archivedAt !== null,
        }).refusal('ACCEPT_FLAG');
        if (notOffered !== null) throw new Refused(notOffered);
        const flag = await tx.flag.findUniqueOrThrow({
          where: { id: flagId },
          include: { acceptances: { where: { withdrawnAt: null }, select: { id: true } } },
        });
        const refusal = new FlagAccepting({
          message: flag.message,
          cleared: flag.clearedAt !== null,
          accepted: flag.acceptances.length > 0,
        }).refusal();
        if (refusal !== null) throw new Refused(refusal);
        const written = note?.trim() ?? '';
        const record = await tx.flagAcceptance.create({
          data: {
            projectId: flag.projectId,
            flagId,
            reasonId,
            note: written === '' ? null : written,
            acceptedById: person,
            acceptedAt: this.clock.now(),
          },
        });
        const { workflow, ticketNumber } = flag;
        // A flag on a certification, a site or a survey is on no ticket: the run that reads its
        // acceptance is one for those records alone.
        return workflow === null || ticketNumber === null
          ? { record, projectId: flag.projectId, tickets: [], projectRecords: true }
          : { record, projectId: flag.projectId, tickets: [{ workflow, ticketNumber }] };
      },
      'REFUSED',
      // An acceptance changes nothing another ticket reads: only the flag's own ticket is
      // worked again.
      'LEFT',
    );
  }

  withdraw(
    person: string,
    acceptanceId: string,
    note: string,
  ): Promise<Outcome<Reviewed<FlagAcceptance>>> {
    return this.review(
      person,
      'ACCEPT_FLAG',
      note,
      async (tx) => {
        const acceptance = await tx.flagAcceptance.findUniqueOrThrow({
          where: { id: acceptanceId },
          include: { flag: { select: { message: true, workflow: true, ticketNumber: true } } },
        });
        const refusal = new AcceptanceWithdrawal({
          message: acceptance.flag.message,
          withdrawn: acceptance.withdrawnAt !== null,
        }).refusal();
        if (refusal !== null) throw new Refused(refusal);
        const record = await tx.flagAcceptance.update({
          where: { id: acceptanceId },
          data: { withdrawnById: person, withdrawnAt: this.clock.now(), withdrawNote: note.trim() },
        });
        const { workflow, ticketNumber } = acceptance.flag;
        return workflow === null || ticketNumber === null
          ? { record, projectId: record.projectId, tickets: [], projectRecords: true }
          : { record, projectId: record.projectId, tickets: [{ workflow, ticketNumber }] };
      },
      'REFUSED',
      'LEFT',
    );
  }
}

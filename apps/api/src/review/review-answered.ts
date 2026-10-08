// How a reviewer's endpoint answers what its service said (ARCHITECTURE §6, Authorization,
// Output; AC-10-28, 33; ADR-364, 422, 424, 430): a saved action with its record and what it
// queued, as a setup change is answered; an action the domain's rules refuse as `NOT_SAVED`, with
// the rule's own code and its plain words; a person who may not do it as `NOT_ALLOWED`, the
// service having asked inside its own piece of work whatever the door already asked. What the
// database's own constraints refuse is thrown past here and answered plainly by the error filter
// (process/database-refusal.ts). The log says what was done or why not, by code: never a name, a
// number or a note.
import type {
  FlagAcceptance,
  InvoiceBatch,
  InvoiceLock,
  QcMark,
  TicketUnvoid,
  TicketVoid,
} from '@open-adms/db';
import type {
  FlagAcceptanceRecord,
  InvoiceBatchRecord,
  InvoiceLockRecord,
  QcMarkRecord,
  TicketUnvoidRecord,
  TicketVoidRecord,
} from '@open-adms/contracts';
import type { FastifyRequest } from 'fastify';

import { Refusal } from '../process/refusal.ts';
import { answered, type SavedAnswer } from '../setup/setup-answered.ts';
import type { Outcome } from '../setup/setup-service.ts';

export function reviewed<T, A>(
  request: FastifyRequest,
  outcome: Outcome<T>,
  shown: (record: T) => A,
  done: string,
): SavedAnswer<A> {
  if (!outcome.saved) {
    const { code, message } = outcome.refusal;
    request.log.info({ why: code }, 'A reviewer’s action was refused.');
    if (code === 'NOT_PERMITTED') throw new Refusal('NOT_ALLOWED', 403);
    throw new Refusal('NOT_SAVED', 422, message, code);
  }
  return answered(request, outcome, shown, done);
}

const time = (at: Date | null): string | null => at?.toISOString() ?? null;

export const ticketVoidRecord = (made: TicketVoid): TicketVoidRecord => ({
  id: made.id,
  projectId: made.projectId,
  workflow: made.workflow,
  ticketNumber: made.ticketNumber,
  reasonId: made.reasonId,
  note: made.note,
  voidedById: made.voidedById,
  voidedAt: made.voidedAt.toISOString(),
  liftedById: made.liftedById,
  liftedAt: time(made.liftedAt),
  liftNote: made.liftNote,
});

export const ticketUnvoidRecord = (made: TicketUnvoid): TicketUnvoidRecord => ({
  id: made.id,
  projectId: made.projectId,
  workflow: made.workflow,
  ticketNumber: made.ticketNumber,
  note: made.note,
  unvoidedById: made.unvoidedById,
  unvoidedAt: made.unvoidedAt.toISOString(),
});

export const flagAcceptanceRecord = (made: FlagAcceptance): FlagAcceptanceRecord => ({
  id: made.id,
  projectId: made.projectId,
  flagId: made.flagId,
  reasonId: made.reasonId,
  note: made.note,
  acceptedById: made.acceptedById,
  acceptedAt: made.acceptedAt.toISOString(),
});

// A unit rate ticket is named by its one field event.
export const qcMarkRecord = (mark: QcMark): QcMarkRecord => ({
  id: mark.id,
  projectId: mark.projectId,
  completedLoadId: mark.completedLoadId,
  completedHaulOutId: mark.completedHaulOutId,
  unitRateTicketId: mark.fieldEventId,
  certificationId: mark.certificationId,
  roeId: mark.roeId,
  surveyId: mark.surveyId,
  incidentId: mark.incidentId,
  dropOffLogId: mark.dropOffLogId,
  status: mark.status,
  setById: mark.setById,
  setAt: mark.setAt.toISOString(),
  note: mark.note,
});

export const invoiceBatchRecord = (batch: InvoiceBatch): InvoiceBatchRecord => ({
  id: batch.id,
  projectId: batch.projectId,
  name: batch.name,
  createdById: batch.createdById,
  createdAt: batch.createdAt.toISOString(),
});

export const invoiceLockRecord = (lock: InvoiceLock): InvoiceLockRecord => ({
  id: lock.id,
  projectId: lock.projectId,
  completedLoadId: lock.completedLoadId,
  completedHaulOutId: lock.completedHaulOutId,
  unitRateTicketId: lock.fieldEventId,
  invoiceBatchId: lock.invoiceBatchId,
  lockedById: lock.lockedById,
  lockedAt: lock.lockedAt.toISOString(),
  unlockedById: lock.unlockedById,
  unlockedAt: time(lock.unlockedAt),
  unlockNote: lock.unlockNote,
});

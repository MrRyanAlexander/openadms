// A client's half of one sync, said once (ARCHITECTURE §9 (3), (4); spec/parts/05-sync.md steps
// 2…8; AC-05-15, 20, 45, 46; BACKLOG 2.6.1 part 4, C128, C129; ADR-022, 467, 468, 470; REQ-203,
// 308c): what any client reads of what it was answered, and what an answer lets it do. The
// harness's phones use it now and the field app in Phase 3; the suite that holds a client to it
// is `sync-client-suite.ts`.
import type { SyncedRecord } from './sync-records.ts';
import { syncAnsweredSchema, type SyncAnswered, type SyncSent } from './sync.ts';

// The id its phone made for a record, whatever its kind.
export function syncedRecordId(record: SyncedRecord): string {
  switch (record.record) {
    case 'FIELD_EVENT':
      return record.fieldEvent.id;
    case 'SCALE_RECEIPT':
      return record.scaleReceipt.id;
    case 'INCIDENT':
      return record.incident.id;
    case 'DROP_OFF_LOG':
      return record.dropOffLog.id;
    case 'SURVEY':
      return record.survey.id;
    case 'ROE':
      return record.roe.id;
    case 'CERTIFICATION':
      return record.certification.id;
  }
}

// The assignment a record was made under; a scale receipt names none. An unplanned assignment
// goes no later than the records made under it (ADR-457).
export function syncedRecordAssignment(record: SyncedRecord): string | null {
  switch (record.record) {
    case 'FIELD_EVENT':
      return record.fieldEvent.assignmentId;
    case 'SCALE_RECEIPT':
      return null;
    case 'INCIDENT':
      return record.incident.assignmentId;
    case 'DROP_OFF_LOG':
      return record.dropOffLog.assignmentId;
    case 'SURVEY':
      return record.survey.assignmentId;
    case 'ROE':
      return record.roe.assignmentId;
    case 'CERTIFICATION':
      return record.certification.assignmentId;
  }
}

// The only answers that say the server stored what was sent (REQ-308c). Anything else, and the
// client keeps it: a quarantined record and one not saved are shown as not saved, never dropped
// (AC-05-20, 46).
export const storedAnswers = ['SAVED', 'ALREADY_SAVED'] as const;

export const stored = (answered: { readonly answer: string }): boolean =>
  (storedAnswers as readonly string[]).includes(answered.answer);

const inPlace = <S, A>(
  sent: readonly S[],
  answers: readonly A[],
  same: (one: S, answer: A) => boolean,
): boolean =>
  sent.length === answers.length &&
  sent.every((one, index) => {
    const answer = answers[index];
    return answer !== undefined && same(one, answer);
  });

// What came back for one sync, read: the answer, or null where it is no answer to what was
// sent. It is one only when it is the contract's own shape and has an answer for each thing
// sent, each in the place of what it answers and under its id (a record the server couldn't
// read may be answered under none). On null a client marks nothing and keeps everything, as it
// does when nothing came back at all: it never takes a record for saved on an answer it can't
// match to it.
export function syncAnswerRead(sent: SyncSent, answered: unknown): SyncAnswered | null {
  const read = syncAnsweredSchema.safeParse(answered);
  if (!read.success) return null;
  const { unplannedAssignments, passcodeUses, records, numbers } = read.data;
  const fits =
    inPlace(
      sent.unplannedAssignments,
      unplannedAssignments,
      (one, a) => a.assignmentId === one.id,
    ) &&
    inPlace(sent.passcodeUses, passcodeUses, (one, a) => a.useId === one.id) &&
    inPlace(
      sent.records,
      records,
      (one, a) => a.id === syncedRecordId(one) || (a.id === null && a.answer === 'NOT_SAVED'),
    ) &&
    inPlace(
      sent.lastUsed,
      numbers,
      (one, a) => a.projectId === one.projectId && a.series === one.series,
    );
  return fits ? read.data : null;
}

// What stands where the sync endpoint will (task 2.6.2), so that a story's phone already syncs
// by the contract (BACKLOG 2.6.1 part 4, C127…C129; ADR-466, 467, 469, 470): it reads one sync
// off the wire with `syncSentSchema`, each record on its own with `recordRead`, says what a
// phone never says (that a phone made it, and which: the one that synced), and hands each to
// what receives it: intake, or for a certification `Certifications.received`.
//
// It is not the endpoint and decides nothing of its own. What 2.6.2 decides is not here: the
// phone's proof, the reports a sync carries and its numbers (a story's go by their own
// services until then), a record the database refuses, and what is held for a person.
import type { Outcome, SentCertification } from '@open-adms/api';
import {
  recordRead,
  syncSentSchema,
  type ReceivedRecord,
  type RecordAnswer,
  type SyncAnswered,
} from '@open-adms/contracts';
import type { Certification } from '@open-adms/db';
import { NotSaved } from '@open-adms/domain';

import type { HeldRecord, SyncIntake } from './device.ts';

// Where a certification made on a phone goes: the API's `Certifications`.
export interface CertificationsReceived {
  received(sent: SentCertification): Promise<Outcome<Certification>>;
}

export class SyncStandIn {
  private readonly intake: SyncIntake;
  private readonly certifications: CertificationsReceived | undefined;

  constructor(intake: SyncIntake, certifications?: CertificationsReceived) {
    this.intake = intake;
    this.certifications = certifications;
  }

  // A record as the server read it, with what the server says of it: that a phone made it, and
  // which.
  static fromPhone(
    deviceId: string,
    read: ReceivedRecord,
  ): Exclude<HeldRecord, { record: 'PHOTO' }> {
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
      case 'CERTIFICATION':
        return { record: read.record, certification: { ...read.certification, deviceId } };
    }
  }

  // One sync, off the wire, from the phone that proved itself: each record's own answer, in
  // the order sent. A body that isn't a sync throws, as the boundary refuses it.
  async answered(deviceId: string, body: unknown): Promise<SyncAnswered> {
    const sync = syncSentSchema.parse(body);
    if (sync.unplannedAssignments.length + sync.passcodeUses.length + sync.lastUsed.length > 0) {
      throw new Error('A sync’s reports and its numbers are the endpoint’s to take (task 2.6.2).');
    }
    const records: RecordAnswer[] = [];
    for (const sent of sync.records) {
      const read = recordRead(sent);
      if (read.read) {
        records.push(await this.received(SyncStandIn.fromPhone(deviceId, read.record)));
      } else {
        const { reason, message } = read.notice;
        records.push({ answer: 'NOT_SAVED', id: read.id, reason, message });
      }
    }
    return { unplannedAssignments: [], passcodeUses: [], records, numbers: [] };
  }

  private async received(record: Exclude<HeldRecord, { record: 'PHOTO' }>): Promise<RecordAnswer> {
    if (record.record !== 'CERTIFICATION') return this.intake.receive(record);
    if (this.certifications === undefined) {
      throw new Error('This sync carries a certification, and nothing was named to receive it.');
    }
    const { id } = record.certification;
    const outcome = await this.certifications.received(record.certification);
    if (outcome.saved) return { answer: 'SAVED', id, notes: [] };
    const { reason, message } = NotSaved.certificationRefused(outcome.refusal.message);
    return { answer: 'NOT_SAVED', id, reason, message };
  }
}

// A stand-in for the API's sync endpoint (ARCHITECTURE §9; Phase 2): writes each record a phone
// sends as the API's own login, through $write, attributed to the phone's monitor from that
// phone, so the database audits it as it will audit a real sync. The server's received time is the
// story's clock (ARCHITECTURE §10), never the machine's. Duplicate numbers, quarantine, the
// idempotency ledger, the certification and the ROE a number finds, a form's answers against its
// definition and an ROE's own record are the real intake's (BACKLOG 1.4.2); a second copy of a
// record is refused here.
import type { Database } from '@open-adms/db';

import type { StoryClock } from './clock.ts';
import type { PhoneRecord, RecordedEvent, SyncIntake } from './device.ts';

export class ApiSyncIntake implements SyncIntake {
  private readonly api: Database;
  private readonly clock: StoryClock;

  constructor(api: Database, clock: StoryClock) {
    this.api = api;
    this.clock = clock;
  }

  async receive(sent: PhoneRecord): Promise<void> {
    const receivedAt = this.clock.now();
    switch (sent.record) {
      case 'FIELD_EVENT':
        return this.fieldEvent(sent.fieldEvent, receivedAt);
      case 'SCALE_RECEIPT': {
        const receipt = sent.scaleReceipt;
        await this.api.$write(
          { actorId: receipt.enteredById, source: 'DEVICE', deviceId: receipt.deviceId },
          (tx) => tx.scaleReceipt.create({ data: { ...receipt, receivedAt } }),
        );
        return;
      }
      case 'INCIDENT': {
        const incident = sent.incident;
        await this.api.$write(
          { actorId: incident.monitorId, source: 'DEVICE', deviceId: incident.deviceId },
          (tx) => tx.incident.create({ data: { ...incident, answers: {}, receivedAt } }),
        );
        return;
      }
      case 'DROP_OFF_LOG': {
        const log = sent.dropOffLog;
        await this.api.$write(
          { actorId: log.monitorId, source: 'DEVICE', deviceId: log.deviceId },
          (tx) => tx.dropOffLog.create({ data: { ...log, answers: {}, receivedAt } }),
        );
        return;
      }
      case 'ROE':
        throw new Error(
          `ROE ${sent.roe.roeNumber}: an ROE made on a phone is taken in by the real intake (BACKLOG 1.4.2).`,
        );
    }
  }

  // A field event with its item lines and the tickets it carries, in one piece of work. Its
  // debris type's form is read from its project and workflow: a load's from the load form, a
  // haul-out's from the haul-out form (ADR-325).
  private async fieldEvent(event: RecordedEvent, receivedAt: Date): Promise<void> {
    const { items, carriedTickets, ...columns } = event;
    await this.api.$write(
      { actorId: event.monitorId, source: 'DEVICE', deviceId: event.deviceId },
      async (tx) => {
        const form =
          event.formDebrisTypeId === null
            ? null
            : await tx.form.findFirstOrThrow({
                where: {
                  projectId: event.projectId,
                  documentType: event.workflow === 'HAUL_OUT' ? 'HAUL_OUT' : 'LOAD',
                },
              });
        await tx.fieldEvent.create({
          data: {
            ...columns,
            formId: form?.id ?? null,
            formDocumentType: form?.documentType ?? null,
            receivedAt,
          },
        });
        for (const item of items) {
          await tx.fieldEventItem.create({
            data: { ...item, fieldEventId: event.id, fieldEventKind: event.kind },
          });
        }
        for (const carriedTicketNumber of carriedTickets) {
          await tx.carriedTicket.create({
            data: { carriedTicketNumber, fieldEventId: event.id, fieldEventKind: event.kind },
          });
        }
      },
    );
  }
}

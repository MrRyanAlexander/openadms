// The sample's back office on Thursday 15 October (sample-projects.ts): what Luis Ortega (sample)
// and Dana Reyes (sample) do at their browsers once the field days are in, each act at its
// endpoint, by their grants, each followed by the worker's run of what it queued. What the
// sample leaves for the firm to do itself is left on purpose: the load dumped at Old Quarry Pit
// stands in review, flagged; the disposal scanned twice waits in quarantine, and the load it
// belongs to waits for it.
//
// - **Review** (golden mission §2): 101003's 96% call accepted, "Heaped; photos confirm"; Kim's
//   typed 101060 renumbered to 101006 (real work: renumber, never void) and its typed-number flag
//   accepted; 301003 voided, a duplicate of 301001; 301005 voided, under 24 in.
// - **QC**: QC Approved on every completed load and haul-out, the live unit rate tickets, the
//   forms and the certifications; QC Void on the two voided tickets; QC Issues on the load dumped
//   at Old Quarry Pit; QC Review on the HHW ticket, still being looked at.
// - **The invoice lock**: P1's QC Approved tickets locked in the batch "Bayline ROW, week of 12
//   Oct"; P2's split load locked on its own.
// - **The time clock**: Dana approves Ana Brooks (sample)'s Wednesday; Kim Nguyen (sample)'s
//   waits for approval.
import {
  acceptFlagEndpoint,
  approveDayEndpoint,
  createInvoiceBatchEndpoint,
  lockSeveralAsInvoicedEndpoint,
  renumberFieldEventEndpoint,
  setQcStatusesEndpoint,
  voidTicketEndpoint,
  type Endpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';

import type { AskedWith } from '../over-https.ts';
import type { OfficeBrowser } from '../office-browser.ts';
import { sample } from './sample-names.ts';
import type { SampleSetUp } from './sample-setup.ts';
import type { SampleWorker } from './sample-worker.ts';

type Ticket =
  | { readonly completedLoadId: string }
  | { readonly completedHaulOutId: string }
  | { readonly unitRateTicketId: string };
type Marked =
  | Ticket
  | { readonly certificationId: string }
  | { readonly roeId: string }
  | { readonly surveyId: string }
  | { readonly incidentId: string }
  | { readonly dropOffLogId: string };

export class SampleOffice {
  private readonly api: Database;
  private readonly luis: OfficeBrowser;
  private readonly set: SampleSetUp;
  private readonly worker: SampleWorker;

  constructor(api: Database, luis: OfficeBrowser, set: SampleSetUp, worker: SampleWorker) {
    this.api = api;
    this.luis = luis;
    this.set = set;
    this.worker = worker;
  }

  async reviewed(): Promise<void> {
    const { p1 } = this.set;
    await this.accepting('101003', 'Heaped; photos confirm');
    const typed = await this.api.fieldEvent.findFirstOrThrow({
      where: { projectId: p1, ticketNumber: '101060', kind: 'DISPOSAL' },
      select: { id: true },
    });
    await this.acted(renumberFieldEventEndpoint, {
      ids: { fieldEventId: typed.id },
      json: { ticketNumber: '101006', note: 'Cert, times and photos match 101006' },
    });
    await this.accepting('101006', 'Cert, times and photos match 101006');
    await this.voiding('301003', 'Duplicate ticket', 'Duplicate of 301001');
    await this.voiding('301005', 'Not eligible work', 'Under 24 in; goes out as vegetative debris');
  }

  async qcd(): Promise<void> {
    const { p1, p2 } = this.set;
    const approved: Marked[] = [];
    for (const ticketNumber of [
      '101001',
      '101002',
      '101003',
      '101004',
      '101005',
      '101006',
      '101008',
    ]) {
      approved.push(await this.loadOf(p1, ticketNumber));
    }
    approved.push(await this.loadOf(p2, '102001'));
    for (const ticketNumber of ['201001', '201004']) {
      approved.push(await this.haulOutOf(p1, ticketNumber));
    }
    for (const ticketNumber of ['301001', '301002', '301004', '301006', '301007']) {
      approved.push(await this.unitRateOf(ticketNumber));
    }
    const projects = { projectId: { in: [p1, p2] } };
    for (const { id } of await this.api.certification.findMany({ where: projects })) {
      approved.push({ certificationId: id });
    }
    for (const { id } of await this.api.roe.findMany({ where: projects })) {
      approved.push({ roeId: id });
    }
    for (const { id } of await this.api.survey.findMany({ where: projects })) {
      approved.push({ surveyId: id });
    }
    for (const { id } of await this.api.dropOffLog.findMany({ where: projects })) {
      approved.push({ dropOffLogId: id });
    }
    const damage = await this.api.incident.findFirstOrThrow({
      where: { projectId: p1, incidentType: { name: 'Property damage' } },
      select: { id: true },
    });
    approved.push({ incidentId: damage.id });
    const marks = [
      ...approved.map((record) => ({ record, status: 'QC_APPROVED' })),
      ...[await this.unitRateOf('301003'), await this.unitRateOf('301005')].map((record) => ({
        record,
        status: 'QC_VOID',
      })),
      {
        record: await this.loadOf(p1, '101007'),
        status: 'QC_ISSUES',
        note: 'Dumped at Old Quarry Pit, an ineligible site: ask Coastline why.',
      },
      {
        record: await this.unitRateOf('301008'),
        status: 'QC_REVIEW',
        note: 'Checking the pounds against the HHW drop-off sheet.',
      },
    ];
    const { outcomes } = await this.luis.answered(setQcStatusesEndpoint, { json: { marks } });
    const refused = outcomes.filter((outcome) => !outcome.saved);
    if (refused.length > 0) {
      throw new Error(
        `QC marks refused: ${refused.map((outcome) => JSON.stringify(outcome)).join('; ')}`,
      );
    }
  }

  async locked(): Promise<void> {
    const { p1, p2 } = this.set;
    const batch = await this.luis.answered(createInvoiceBatchEndpoint, {
      ids: { projectId: p1 },
      json: { name: sample.batch },
    });
    const tickets: Ticket[] = [];
    for (const ticketNumber of [
      '101001',
      '101002',
      '101003',
      '101004',
      '101005',
      '101006',
      '101008',
    ]) {
      tickets.push(await this.loadOf(p1, ticketNumber));
    }
    for (const ticketNumber of ['201001', '201004']) {
      tickets.push(await this.haulOutOf(p1, ticketNumber));
    }
    for (const ticketNumber of ['301001', '301002', '301004', '301006', '301007']) {
      tickets.push(await this.unitRateOf(ticketNumber));
    }
    const lock = async (several: readonly Ticket[], invoiceBatchId?: string) => {
      const { outcomes } = await this.luis.answered(lockSeveralAsInvoicedEndpoint, {
        json: { tickets: several, ...(invoiceBatchId === undefined ? {} : { invoiceBatchId }) },
      });
      const refused = outcomes.filter((outcome) => !outcome.saved);
      if (refused.length > 0) {
        throw new Error(
          `Locks refused: ${refused.map((outcome) => JSON.stringify(outcome)).join('; ')}`,
        );
      }
    };
    await lock(tickets, batch.record.id);
    await lock([await this.loadOf(p2, '102001')]);
  }

  // Dana approves a worker's day on the time clock.
  async approved(dana: OfficeBrowser, assignmentId: string): Promise<void> {
    await dana.answered(approveDayEndpoint, { ids: { assignmentId } });
  }

  // The first flag standing on the ticket, accepted with Photos confirm and Luis's note.
  private async accepting(ticketNumber: string, note: string): Promise<void> {
    const flag = await this.api.flag.findFirstOrThrow({
      where: { projectId: this.set.p1, ticketNumber, clearedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    await this.acted(acceptFlagEndpoint, {
      ids: { flagId: flag.id },
      json: { reasonId: await this.reasonId('Photos confirm'), note },
    });
  }

  private async voiding(ticketNumber: string, reason: string, note: string): Promise<void> {
    await this.acted(voidTicketEndpoint, {
      ids: { projectId: this.set.p1 },
      json: { workflow: 'UNIT_RATE', ticketNumber, reasonId: await this.reasonId(reason), note },
    });
  }

  // Luis's act at his browser, then the worker's run of what it queued.
  private async acted(served: Endpoint, more: AskedWith): Promise<void> {
    await this.luis.answered(served, more);
    await this.worker.settled([this.set.p1]);
  }

  // A reason the firm offers, by its name: the shipped list's.
  private async reasonId(name: string): Promise<string> {
    return (
      await this.api.reason.findFirstOrThrow({
        where: { name, archivedAt: null },
        select: { id: true },
      })
    ).id;
  }

  private async loadOf(projectId: string, ticketNumber: string): Promise<Ticket> {
    const load = await this.api.completedLoad.findFirstOrThrow({
      where: { projectId, ticketNumber },
      select: { id: true },
    });
    return { completedLoadId: load.id };
  }

  private async haulOutOf(projectId: string, ticketNumber: string): Promise<Ticket> {
    const haulOut = await this.api.completedHaulOut.findFirstOrThrow({
      where: { projectId, ticketNumber },
      select: { id: true },
    });
    return { completedHaulOutId: haulOut.id };
  }

  private async unitRateOf(ticketNumber: string): Promise<Ticket> {
    const event = await this.api.fieldEvent.findFirstOrThrow({
      where: { projectId: this.set.p1, ticketNumber, kind: 'UNIT_RATE' },
      select: { id: true },
    });
    return { unitRateTicketId: event.id };
  }
}

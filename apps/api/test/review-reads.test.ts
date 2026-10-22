// The back office's reads and bulk acts through their endpoints, against the database (spec/
// parts/08, "One review queue"; spec/parts/09; spec/acceptance/10-api-and-sync.md AC-10-93…103;
// BACKLOG 2.8.8; ADR-535, 539). OWASP API1, API3, API4; ASVS V8. The real process, in this test's own
// memory, on the installation's database as `adms_api`: it needs `pnpm local:up` after `pnpm
// installer`. Each test's work is undone (support/database.ts).
//
// The API's login writes no flag, status, completed load or line: those are the worker's, so a
// ticket here is field events still PENDING, made in the back office. A ticket's flags, its
// completed record, its lines with their money, a flag's acceptances, a lock, and a preview's
// piece of work undone (this test's own piece of work has no savepoint) are the stories'
// (`p1-reviewed`, `p1-invoiced`, `p1-priced`).
import { randomUUID } from 'node:crypto';

import {
  addPrimeEndpoint,
  addSiteShapeEndpoint,
  createContractorEndpoint,
  createDropOffLogEndpoint,
  createIncidentEndpoint,
  createInvoiceBatchEndpoint,
  createPayItemEndpoint,
  createRoeEndpoint,
  createRuleEndpoint,
  createSiteEndpoint,
  createSurveyEndpoint,
  listCertificationsEndpoint,
  listDropOffLogsEndpoint,
  listFlagsEndpoint,
  listFormsEndpoint,
  listIncidentsEndpoint,
  listInvoiceBatchesEndpoint,
  listListValuesEndpoint,
  listMapVersionsEndpoint,
  listPayItemRatesEndpoint,
  listPayItemsEndpoint,
  listPeopleEndpoint,
  listPhoneSessionsEndpoint,
  listPhonesEndpoint,
  listProjectsEndpoint,
  listRoesEndpoint,
  listRulesEndpoint,
  listSiteShapesEndpoint,
  listSitesEndpoint,
  listSurveysEndpoint,
  loadMapEndpoint,
  monitorCreatedAnswerSchema,
  lockSeveralAsInvoicedEndpoint,
  mapVersionFileEndpoint,
  previewPayItemRateEndpoint,
  previewRuleChangeEndpoint,
  readCertificationEndpoint,
  readFieldEventEndpoint,
  readInvoiceBatchEndpoint,
  readMapVersionEndpoint,
  readProjectEndpoint,
  readScaleReceiptEndpoint,
  readTicketDecisionsEndpoint,
  readTicketEndpoint,
  reviewNamesEndpoint,
  removePhoneEndpoint,
  renameInvoiceBatchEndpoint,
  reviewQueueEndpoint,
  savePaysWhenEndpoint,
  searchBoardEndpoint,
  setQcStatusesEndpoint,
  siteShapeFileEndpoint,
  writeAssignmentEndpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Certifications } from '../src/certification/certifications.ts';
import { Assignments } from '../src/dispatch/assignments.ts';
import { Phones } from '../src/dispatch/phones.ts';
import { HeldReads } from '../src/review/held-reads.ts';
import { InvoiceLocks } from '../src/review/invoice-locks.ts';
import { QcMarks } from '../src/review/qc-marks.ts';
import { ReviewReads } from '../src/review/review-reads.ts';
import { SetupReads } from '../src/setup/setup-reads.ts';
import { Voids } from '../src/review/voids.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { jpeg, kimsPhone, Kept } from './support/kims-phone.ts';
import { passcode } from './support/phones.ts';
import { p1Boundary, p1Zones } from './support/map-files.ts';
import { shippedPolicy } from './support/process.ts';
import { luisHolds, newId, p1WithTickets, reasonNamed } from './support/review.ts';
import { danasEmail, long, worldOn, type Served } from './support/served.ts';
import { ask, p1Priced, saved, told, viewerSignsIn, type Browser } from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

// A GET with a query string.
const read = (
  api: Served,
  signed: Browser,
  endpoint: Parameters<typeof ask>[2],
  more: {
    ids?: Readonly<Record<string, string>>;
    query?: string;
  } = {},
) => ask(api, signed, endpoint, more);

describe('the review queue and a ticket whole', () => {
  it('AC-10-93 one workflow’s tickets waiting for a person, by number a page at a time, each pending ticket listed as pending with its open flags (none here: the worker raises them); the open flags counted by cause; narrowed to one cause, only its tickets; a project nobody has is not found, and a viewer is refused at the door', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      await p.created('COLLECTION', '101033');
      const luis = await luisHolds(served, tx, who.luis);
      const first = saved(
        reviewQueueEndpoint,
        await read(served, luis, reviewQueueEndpoint, {
          ids: p.ids,
          query: '?workflow=LOAD&limit=1',
        }),
      );
      expect(first).toEqual({
        causes: [],
        tickets: [
          {
            workflow: 'LOAD',
            ticketNumber: '101031',
            statuses: ['PENDING'],
            flags: [],
            waitingOnSetAsideJob: false,
          },
        ],
        waitingOnSetAsideJobs: 0,
        next: '101031',
      });
      expect(
        saved(
          reviewQueueEndpoint,
          await read(served, luis, reviewQueueEndpoint, {
            ids: p.ids,
            query: '?workflow=LOAD&after=101031',
          }),
        ).tickets.map((ticket) => ticket.ticketNumber),
      ).toEqual(['101033']);
      expect(
        saved(
          reviewQueueEndpoint,
          await read(served, luis, reviewQueueEndpoint, {
            ids: p.ids,
            query: '?workflow=UNIT_RATE',
          }),
        ).tickets.map((ticket) => ticket.ticketNumber),
      ).toEqual(['301001']);
      expect(
        saved(
          reviewQueueEndpoint,
          await read(served, luis, reviewQueueEndpoint, {
            ids: p.ids,
            query: '?workflow=LOAD&cause=DEBRIS_TYPE_MISMATCH',
          }),
        ),
      ).toEqual({ causes: [], tickets: [], waitingOnSetAsideJobs: 0, next: null });
      expect(
        saved(
          listFlagsEndpoint,
          await read(served, luis, listFlagsEndpoint, { ids: p.ids, query: '?open=true' }),
        ),
      ).toEqual({ flags: [], next: null });
      expect(
        told(
          await read(served, luis, reviewQueueEndpoint, {
            ids: { projectId: randomUUID() },
            query: '?workflow=LOAD',
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      expect(
        told(
          await read(served, viewer, reviewQueueEndpoint, { ids: p.ids, query: '?workflow=LOAD' }),
        ),
      ).toEqual([403, 'NOT_ALLOWED']);
    });
  });

  it('AC-10-94, AC-10-106 a ticket whole: its field events in field time as recorded, with their status and which way a passcode session was opened; no completed record, line or run’s decision until the worker writes one; its QC mark and its voids, kept when lifted; a number nobody has is not found', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const ticket = (workflow: string, ticketNumber: string) =>
        read(served, luis, readTicketEndpoint, {
          ids: { projectId: p.project.id, workflow, ticketNumber },
        });
      const load = saved(readTicketEndpoint, await ticket('LOAD', '101031'));
      expect(load).toMatchObject({
        projectId: p.project.id,
        workflow: 'LOAD',
        ticketNumber: '101031',
        statuses: ['PENDING'],
        completed: null,
        lines: [],
        flags: [],
        qcMark: null,
        locks: [],
        voids: [],
        unvoids: [],
      });
      expect(load.fieldEvents.map((event) => [event.id, event.kind, event.status])).toEqual([
        [p.collection.id, 'COLLECTION', 'PENDING'],
      ]);
      expect(load.fieldEvents[0]).toMatchObject({
        source: 'BACK_OFFICE',
        createdById: who.dana,
        masterPasscodeSession: null,
        deviceId: null,
        reconciledAt: null,
      });
      const reasonId = await reasonNamed(tx, 'Work never happened');
      const voids = new Voids(within, served.clock, shippedPolicy);
      const voided = await voids.ticket(
        who.dana,
        p.project.id,
        { workflow: 'LOAD', ticketNumber: '101031' },
        reasonId,
      );
      expect(voided.saved).toBe(true);
      expect(
        saved(readTicketEndpoint, await ticket('LOAD', '101031')).voids.map((made) => [
          made.voidedById,
          made.liftedAt,
        ]),
      ).toEqual([[who.dana, null]]);
      const qc = await new QcMarks(within, served.clock, shippedPolicy).set(
        who.dana,
        { unitRateTicketId: p.unitRate.id },
        'QC_ISSUES',
        'Photo of the stump missing',
      );
      expect(qc.saved).toBe(true);
      expect(saved(readTicketEndpoint, await ticket('UNIT_RATE', '301001')).qcMark).toMatchObject({
        unitRateTicketId: p.unitRate.id,
        status: 'QC_ISSUES',
        setById: who.dana,
      });
      // What each run decided (ADR-536; C172): none until the worker runs, which is the
      // stories' (`p1-voided`).
      const decisions = (ticketNumber: string) =>
        read(served, luis, readTicketDecisionsEndpoint, {
          ids: { projectId: p.project.id, workflow: 'LOAD', ticketNumber },
          query: '?limit=10',
        });
      expect(saved(readTicketDecisionsEndpoint, await decisions('101031'))).toEqual({
        decisions: [],
        next: null,
      });
      expect(told(await decisions('109999'))).toEqual([404, 'NOT_FOUND']);
      // Past the door, as if it had let a viewer in: the read asks who reads itself.
      await expect(
        new ReviewReads(within).ticketDecisions(who.viewer, p.project.id, 'LOAD', '101031', {
          limit: 10,
        }),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      const nobodys = await ticket('LOAD', '109999');
      expect(told(nobodys)).toEqual([404, 'NOT_FOUND']);
      expect(Object.keys(nobodys.body as object).sort()).toEqual(['code', 'requestId']);
    });
  });
});

describe('the names a reviewer reads a ticket by', () => {
  it('ADR-224, 539 a project’s names for its tickets: its people (a monitor with their Monitor ID), the firm’s payable types and kinds of work, and its reasons with where each is offered; read with view review alone, a viewer refused', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const names = saved(
        reviewNamesEndpoint,
        await read(served, luis, reviewNamesEndpoint, { ids: { projectId: p.project.id } }),
      );
      expect(names.people.find((person) => person.id === who.dana)).toMatchObject({
        name: 'Dana Reyes',
        monitor: false,
        archived: false,
      });
      expect(names.people.find((person) => person.id === who.kim)?.monitorNumber).toMatch(
        /^M[0-9]{6,}$/,
      );
      expect(names.payableTypes.map((type) => type.name)).toContain('Vegetative');
      expect(names.kindsOfWork.map((kind) => kind.name)).toContain('Stumps');
      expect(names.reasons.find((reason) => reason.name === 'Photos confirm')?.uses).toContain(
        'ACCEPT_FLAG',
      );
      await expect(
        new ReviewReads(within).reviewNames(who.viewer, p.project.id),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
    });
  });
});

describe('a field event, a scale receipt and the records beside a ticket', () => {
  it('AC-10-95 a field event a phone sent, with its photographs’ records (each with its view, when it was taken and when its file reached storage, never where it is kept); a scale receipt nobody has is not found', async () => {
    await world(
      async (served, tx, who) => {
        const p = await kimsPhone(served, tx, who);
        const collection = p.collection();
        const pile = jpeg();
        const photo = p.photographOf(collection, pile);
        await p.sync({
          records: [{ record: 'FIELD_EVENT', fieldEvent: collection }],
          photos: [photo],
        });
        await p.upload(photo.id, pile);
        const read1 = saved(
          readFieldEventEndpoint,
          await read(served, p.dana, readFieldEventEndpoint, {
            ids: { fieldEventId: collection.id },
          }),
        );
        expect(read1.fieldEvent).toMatchObject({
          id: collection.id,
          source: 'DEVICE',
          deviceId: p.phone.id,
          masterPasscodeSession: null,
          status: 'PENDING',
        });
        expect(read1.itemLines).toEqual([]);
        expect(read1.carriedTickets).toEqual([]);
        expect(read1.scaleReceipt).toBeNull();
        expect(read1.photographs).toHaveLength(1);
        expect(read1.photographs[0]).toMatchObject({ id: photo.id, fieldEventId: collection.id });
        expect(read1.photographs[0]?.uploadedAt).not.toBeNull();
        expect(JSON.stringify(read1)).not.toMatch(/objectKey|projects\//);
        expect(
          told(
            await read(served, p.dana, readFieldEventEndpoint, {
              ids: { fieldEventId: randomUUID() },
            }),
          ),
        ).toEqual([404, 'NOT_FOUND']);
        expect(
          told(
            await read(served, p.dana, readScaleReceiptEndpoint, {
              ids: { scaleReceiptId: randomUUID() },
            }),
          ),
        ).toEqual([404, 'NOT_FOUND']);
      },
      undefined,
      undefined,
      { media: new Kept() },
    );
  });

  it('AC-10-96 a project’s certifications by cert number, each whole: its boxes, its helpers, photographs, QC mark and own flags, where it came from and any revocation; never the driver’s phone or licence number', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const coastline = saved(
        createContractorEndpoint,
        await ask(served, p.dana, createContractorEndpoint, {
          payload: { name: 'Coastline Haulers LLC', kind: 'HAULER' },
        }),
      ).record.id;
      saved(
        addPrimeEndpoint,
        await ask(served, p.dana, addPrimeEndpoint, {
          ids: p.ids,
          payload: { contractorId: coastline },
        }),
      );
      const certifications = new Certifications(within, served.clock, shippedPolicy);
      for (const certNumber of ['730415', '730402']) {
        const outcome = await certifications.certify({
          projectId: p.project.id,
          primeId: coastline,
          certifiedById: who.kim,
          certifiedAt: new Date('2026-10-10T13:10:00Z'),
          deviceUtcOffsetMinutes: -240,
          certNumber,
          kind: 'CONTAINER',
          driverName: 'Ray Booker',
          driverPhone: '302-555-0177',
          boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 240, width: 90, height: 60 }],
        });
        if (!outcome.saved) throw new Error(outcome.refusal.message);
      }
      const luis = await luisHolds(served, tx, who.luis);
      const page = saved(
        listCertificationsEndpoint,
        await read(served, luis, listCertificationsEndpoint, { ids: p.ids, query: '?limit=1' }),
      );
      expect(page.certifications.map((each) => each.certification.certNumber)).toEqual(['730402']);
      const rest = saved(
        listCertificationsEndpoint,
        await read(served, luis, listCertificationsEndpoint, {
          ids: p.ids,
          query: `?after=${page.next ?? ''}`,
        }),
      );
      expect(rest.certifications.map((each) => each.certification.certNumber)).toEqual(['730415']);
      const id = rest.certifications[0]?.certification.id ?? '';
      // A second box, taken off: it stays, marked (ADR-534 (6)).
      await tx.certificationBox.create({
        data: {
          certificationId: id,
          kind: 'CONTAINER',
          position: 1,
          shape: 'RECTANGLE',
          sign: 'ADD',
          featureId: (await tx.vehicleFeature.findFirstOrThrow({ where: { name: 'Dog Box' } })).id,
          length: 20,
          width: 90,
          height: 10,
          archivedAt: new Date('2026-10-11T12:00:00Z'),
        },
      });
      const whole = saved(
        readCertificationEndpoint,
        await read(served, luis, readCertificationEndpoint, { ids: { certificationId: id } }),
      );
      expect(whole).toMatchObject({
        certification: {
          certNumber: '730415',
          kind: 'CONTAINER',
          certifiedById: who.kim,
          driverName: 'Ray Booker',
          deviceId: null,
          createdById: null,
          revokedFrom: null,
        },
        helperIds: [],
        photographs: [],
        qcMark: null,
        flags: [],
      });
      expect(
        whole.boxes.map((box) => [box.position, box.shape, box.length, box.takenOffAt]),
      ).toEqual([
        [0, 'RECTANGLE', 240, null],
        [1, 'RECTANGLE', 20, '2026-10-11T12:00:00.000Z'],
      ]);
      expect(JSON.stringify(whole)).not.toMatch(/driverPhone|302-555-0177|driverLicenceNumber/);
    });
  });

  it('AC-10-97 a project’s ROEs (with their scope), surveys (with their own flags), incidents and drop-off logs, a page each in the order they were made, each with its photographs’ records and its QC mark', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const entered = (endpoint: Parameters<typeof ask>[2], payload: object) =>
        ask(served, luis, endpoint, { ids: p.ids, payload });
      const roe = saved(
        createRoeEndpoint,
        await entered(createRoeEndpoint, {
          roeNumber: 'R-0011',
          parcelId: 'APN 14-0321-011',
          address: '420 Cedar Ct',
          ownerName: 'Rosa Delgado',
          signed: true,
          signedDate: '2026-10-13',
          fix: { latitude: '39.0891', longitude: '-75.6012' },
          madeAt: null,
          notes: null,
          answers: { answers: {} },
        }),
      ).record;
      const shared = {
        monitorId: who.kim,
        madeAt: '2026-10-14T13:30:00Z',
        deviceUtcOffsetMinutes: -240,
        fix: null,
        notes: null,
        answers: { answers: {} },
        reasonId: await reasonNamed(tx, 'Device failed'),
      };
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      saved(
        createSurveyEndpoint,
        await entered(createSurveyEndpoint, {
          ...shared,
          workTypeId: preWork.id,
          surveyNumber: null,
          roeNumber: 'R-0011',
        }),
      );
      const damage = await tx.incidentType.findFirstOrThrow({ where: { name: 'Property damage' } });
      saved(
        createIncidentEndpoint,
        await entered(createIncidentEndpoint, {
          ...shared,
          incidentTypeId: damage.id,
          incidentSubTypeId: null,
          description: 'Mailbox clipped by the trailer',
          parties: null,
          address: '420 Cedar Ct',
          contractorId: null,
          certNumber: null,
          roeNumber: null,
        }),
      );
      const siteType = await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } });
      const landfill = saved(
        createSiteEndpoint,
        await ask(served, p.dana, createSiteEndpoint, {
          ids: p.ids,
          payload: {
            name: 'Bayline County Landfill',
            shortCode: 'BCL',
            siteTypeId: siteType.id,
            takesLoads: true,
            haulOutsLeaveHere: false,
            chargesTippingFee: false,
            ineligibleSite: false,
            permitNumber: null,
            latitude: '39.12',
            longitude: '-75.7',
            activationDate: '2026-10-12',
          },
        }),
      ).record;
      saved(
        createDropOffLogEndpoint,
        await entered(createDropOffLogEndpoint, {
          ...shared,
          siteId: landfill.id,
          residentName: 'Carl Jensen',
          originAddress: '14 Heron St',
        }),
      );
      const roes = saved(
        listRoesEndpoint,
        await read(served, luis, listRoesEndpoint, { ids: p.ids }),
      );
      expect(
        roes.roes.map((each) => [each.roe.id, each.roe.roeNumber, each.scope, each.qcMark]),
      ).toEqual([[roe.id, 'R-0011', [], null]]);
      const surveys = saved(
        listSurveysEndpoint,
        await read(served, luis, listSurveysEndpoint, { ids: p.ids }),
      );
      expect(
        surveys.surveys.map((each) => [each.survey.roeId, each.flags, each.photographs]),
      ).toEqual([[roe.id, [], []]]);
      const incidents = saved(
        listIncidentsEndpoint,
        await read(served, luis, listIncidentsEndpoint, { ids: p.ids }),
      );
      expect(incidents.incidents.map((each) => each.incident.description)).toEqual([
        'Mailbox clipped by the trailer',
      ]);
      const logs = saved(
        listDropOffLogsEndpoint,
        await read(served, luis, listDropOffLogsEndpoint, { ids: p.ids }),
      );
      // The back office sees everything: the resident's name too.
      expect(
        logs.dropOffLogs.map((each) => [each.dropOffLog.siteId, each.dropOffLog.residentName]),
      ).toEqual([[landfill.id, 'Carl Jensen']]);
    });
  });
});

// A read's piece of work that keeps every query our code asks of a model, in order, and the
// most it ever had under way at once on the read's one connection.
function counted(tx: Tx) {
  const asked: string[] = [];
  let running = 0;
  let mostAtOnce = 0;
  const models = new Proxy(tx, {
    get(target, model, receiver) {
      const delegate: unknown = Reflect.get(target, model, receiver);
      if (typeof model !== 'string' || model.startsWith('$')) return delegate;
      if (typeof delegate !== 'object' || delegate === null) return delegate;
      return new Proxy(delegate, {
        get(of, method) {
          const call: unknown = Reflect.get(of, method);
          if (typeof call !== 'function') return call;
          return async (...args: unknown[]) => {
            asked.push(`${model}.${String(method)}`);
            running += 1;
            mostAtOnce = Math.max(mostAtOnce, running);
            try {
              return await (call as (...a: unknown[]) => Promise<unknown>).apply(of, args);
            } finally {
              running -= 1;
            }
          };
        },
      });
    },
  });
  const within = { $read: <T>(inner: (read: Tx) => Promise<T>) => inner(models) };
  return {
    reads: new ReviewReads(within as unknown as Database),
    asked,
    mostAtOnce: () => mostAtOnce,
  };
}

describe('a page of forms, read in two queries beside it', () => {
  it('AC-10-122 a page of ROEs, surveys, incidents and drop-off logs takes all its photographs in one query and all its QC marks in another, one after the other: never two a row, never two at once on the read’s one connection; each record is shown its own', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const entered = (endpoint: Parameters<typeof ask>[2], payload: object) =>
        ask(served, p.dana, endpoint, { ids: p.ids, payload });
      const roes = [];
      for (const [roeNumber, parcelId, address] of [
        ['R-0011', 'APN 14-0321-011', '420 Cedar Ct'],
        ['R-0012', 'APN 14-0321-012', '14 Heron St'],
        ['R-0013', 'APN 14-0321-013', '9 Bayline Ave'],
      ]) {
        roes.push(
          saved(
            createRoeEndpoint,
            await entered(createRoeEndpoint, {
              roeNumber,
              parcelId,
              address,
              ownerName: 'Rosa Delgado',
              signed: true,
              signedDate: '2026-10-13',
              fix: { latitude: '39.0891', longitude: '-75.6012' },
              madeAt: null,
              notes: null,
              answers: { answers: {} },
            }),
          ).record,
        );
      }
      const shared = {
        monitorId: who.kim,
        madeAt: '2026-10-14T13:30:00Z',
        deviceUtcOffsetMinutes: -240,
        fix: null,
        notes: null,
        answers: { answers: {} },
        reasonId: await reasonNamed(tx, 'Device failed'),
      };
      const preWork = await tx.surveyWorkType.findUniqueOrThrow({ where: { key: 'PRE_WORK' } });
      const damage = await tx.incidentType.findFirstOrThrow({ where: { name: 'Property damage' } });
      const siteType = await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } });
      const landfill = saved(
        createSiteEndpoint,
        await entered(createSiteEndpoint, {
          name: 'Bayline County Landfill',
          shortCode: 'BCL',
          siteTypeId: siteType.id,
          takesLoads: true,
          haulOutsLeaveHere: false,
          chargesTippingFee: false,
          ineligibleSite: false,
          permitNumber: null,
          latitude: '39.12',
          longitude: '-75.7',
          activationDate: '2026-10-12',
        }),
      ).record;
      for (const roe of roes.slice(0, 2)) {
        saved(
          createSurveyEndpoint,
          await entered(createSurveyEndpoint, {
            ...shared,
            workTypeId: preWork.id,
            surveyNumber: null,
            roeNumber: roe.roeNumber,
          }),
        );
        saved(
          createIncidentEndpoint,
          await entered(createIncidentEndpoint, {
            ...shared,
            incidentTypeId: damage.id,
            incidentSubTypeId: null,
            description: `Mailbox clipped at ${roe.address ?? ''}`,
            parties: null,
            address: roe.address,
            contractorId: null,
            certNumber: null,
            roeNumber: null,
          }),
        );
        saved(
          createDropOffLogEndpoint,
          await entered(createDropOffLogEndpoint, {
            ...shared,
            siteId: landfill.id,
            residentName: 'Carl Jensen',
            originAddress: roe.address,
          }),
        );
      }
      // A photograph of the first ROE, and a QC mark on the second.
      const [first, second, third] = roes.map((roe) => roe.id);
      const fingerprint = 'a'.repeat(64);
      const photo = await tx.photo.create({
        data: {
          id: await newId(tx),
          projectId: p.project.id,
          roeId: first ?? '',
          capturedAt: new Date('2026-10-13T15:00:00Z'),
          deviceUtcOffsetMinutes: -240,
          originalSha256: fingerprint,
          uploadedSha256: fingerprint,
          objectKey: `photographs/${first ?? ''}/signed`,
        },
      });
      const qc = await new QcMarks(within, served.clock, shippedPolicy).set(
        who.dana,
        { roeId: second ?? '' },
        'QC_APPROVED',
      );
      expect(qc.saved).toBe(true);

      const asked = { limit: 50 };
      const reads = [
        ['roes', 3, (r: ReviewReads) => r.roes(who.luis, p.project.id, asked)],
        ['surveys', 2, (r: ReviewReads) => r.surveys(who.luis, p.project.id, asked)],
        ['incidents', 2, (r: ReviewReads) => r.incidents(who.luis, p.project.id, asked)],
        ['dropOffLogs', 2, (r: ReviewReads) => r.dropOffLogs(who.luis, p.project.id, asked)],
      ] as const;
      for (const [name, rows, readOf] of reads) {
        const reading = counted(tx);
        const answer = (await readOf(reading.reads)) as unknown as Record<string, unknown[]>;
        expect(answer[name]?.length, name).toBe(rows);
        expect(
          reading.asked.filter((one) => /^(photo|qcMark)\./.test(one)),
          name,
        ).toEqual(['photo.findMany', 'qcMark.findMany']);
        expect(reading.mostAtOnce(), name).toBe(1);
      }
      const shown = await new ReviewReads(within).roes(who.luis, p.project.id, asked);
      expect(
        shown.roes.map((each) => [
          each.roe.id,
          each.photographs.map((one) => one.id),
          each.qcMark?.status ?? null,
        ]),
      ).toEqual([
        [first, [photo.id], null],
        [second, [], 'QC_APPROVED'],
        [third, [], null],
      ]);
    });
  });
});

describe('invoice batches and many at once', () => {
  it('AC-10-98 a project’s invoice batches by name, each with how many locks in force it holds; one batch with its locks and their tickets; a batch renamed by whoever may lock as invoiced, never blank, and never to a name another batch of the project holds', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const batch = async (name: string) =>
        saved(
          createInvoiceBatchEndpoint,
          await ask(served, p.dana, createInvoiceBatchEndpoint, { ids: p.ids, payload: { name } }),
        ).record;
      const week = await batch('Bayline ROW, week of 12 Oct');
      await batch('Bayline ROW, week of 5 Oct');
      const luis = await luisHolds(served, tx, who.luis);
      expect(
        saved(
          listInvoiceBatchesEndpoint,
          await read(served, luis, listInvoiceBatchesEndpoint, { ids: p.ids }),
        ).batches.map((each) => [each.batch.name, each.locksInForce]),
      ).toEqual([
        ['Bayline ROW, week of 12 Oct', 0],
        ['Bayline ROW, week of 5 Oct', 0],
      ]);
      expect(
        saved(
          readInvoiceBatchEndpoint,
          await read(served, luis, readInvoiceBatchEndpoint, { ids: { invoiceBatchId: week.id } }),
        ),
      ).toMatchObject({ batch: { id: week.id }, locks: [] });
      const rename = (signed: Browser, name: string) =>
        ask(served, signed, renameInvoiceBatchEndpoint, {
          ids: { invoiceBatchId: week.id },
          payload: { name },
        });
      expect(told(await rename(luis, 'Bayline ROW, Oct 12–18'))).toEqual([403, 'NOT_ALLOWED']);
      const locker = await luisHolds(served, tx, who.luis, 'LOCK_INVOICED');
      expect(
        saved(renameInvoiceBatchEndpoint, await rename(locker, '  Bayline ROW, Oct 12–18 ')).record,
      ).toMatchObject({ id: week.id, name: 'Bayline ROW, Oct 12–18' });
      expect(told(await rename(locker, '   '))).toEqual([400, 'BAD_REQUEST']);
      // Past the request's schema, which trims a name and refuses a blank one first: the service
      // asks the same itself (ADR-536; C172).
      const locks = new InvoiceLocks(within, served.clock, shippedPolicy);
      const blank = await locks.rename(who.dana, week.id, '   ');
      const untrimmed = await locks.rename(who.dana, week.id, '  Bayline ROW, Oct 12–18 (2) ');
      expect([
        blank.saved ? 'saved' : blank.refusal.code,
        untrimmed.saved ? untrimmed.record.name : untrimmed.refusal.code,
      ]).toEqual(['BATCH_NAME_BLANK', 'Bayline ROW, Oct 12–18 (2)']);
      // The database's own key refuses a name used twice: a test's last request.
      const twice = await rename(locker, 'Bayline ROW, week of 5 Oct');
      expect([told(twice), (twice.body as { reason?: string }).reason]).toEqual([
        [422, 'NOT_SAVED'],
        'BATCH_NAME_USED',
      ]);
    });
  });

  it('AC-10-99 QC and a lock for many tickets in one request, each its own act in the order sent and each answered: one refused (a record nobody has, a ticket not yet completed) never stops the rest; a person without the act’s grant is refused it whole', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis);
      const marks = {
        marks: [
          { record: { unitRateTicketId: p.unitRate.id }, status: 'QC_APPROVED' },
          { record: { certificationId: randomUUID() }, status: 'QC_APPROVED' },
        ],
      };
      expect(told(await ask(served, luis, setQcStatusesEndpoint, { payload: marks }))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      const qc = await luisHolds(served, tx, who.luis, 'QC', 'LOCK_INVOICED');
      const several = saved(
        setQcStatusesEndpoint,
        await ask(served, qc, setQcStatusesEndpoint, { payload: marks }),
      );
      expect(
        several.outcomes.map((outcome) =>
          outcome.saved ? ['saved', outcome.record.status] : ['refused', outcome.reason],
        ),
      ).toEqual([
        ['saved', 'QC_APPROVED'],
        ['refused', 'NOT_FOUND'],
      ]);
      expect(await tx.qcMark.count({ where: { fieldEventId: p.unitRate.id } })).toBe(1);
      const locks = saved(
        lockSeveralAsInvoicedEndpoint,
        await ask(served, qc, lockSeveralAsInvoicedEndpoint, {
          payload: { tickets: [{ unitRateTicketId: p.unitRate.id }] },
        }),
      );
      expect(locks.outcomes).toHaveLength(1);
      const [refused] = locks.outcomes;
      expect(refused?.saved).toBe(false);
      if (refused?.saved === false) {
        expect(refused.message).toContain('301001');
      }
      expect(await tx.invoiceLock.count({ where: { projectId: p.project.id } })).toBe(0);
      expect(
        told(await ask(served, qc, setQcStatusesEndpoint, { payload: { marks: [] } })),
      ).toEqual([400, 'BAD_REQUEST']);
    });
  });
});

describe('the board, phones and people', () => {
  it('AC-10-100 the board searched by person across days and projects, each assignment with what the board warns of beside it: a second assignment for the person that day, a day outside the project’s active window; a warning stopped neither write', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const write = async (workDate: string) =>
        saved(
          writeAssignmentEndpoint,
          await ask(served, p.dana, writeAssignmentEndpoint, {
            ids: p.ids,
            payload: {
              personId: who.kim,
              workDate,
              fieldEventKinds: ['COLLECTION'],
              certifying: false,
              formDocumentTypes: [],
              siteId: null,
              deviceId: null,
              payItemIds: [],
            },
          }),
        ).record;
      await write('2026-10-14');
      await write('2026-10-14');
      // Another day: a second assignment that day only warns of that day's.
      await write('2026-10-15');
      await write('2020-01-06');
      const luis = await luisHolds(served, tx, who.luis);
      const found = saved(
        searchBoardEndpoint,
        await read(served, luis, searchBoardEndpoint, {
          query: `?userId=${who.kim}&from=2026-10-01&to=2026-10-31`,
        }),
      );
      expect(found.assignments.map((each) => each.warnings.map((warning) => warning.code))).toEqual(
        [['PERSON_TWICE_THAT_DAY'], ['PERSON_TWICE_THAT_DAY'], []],
      );
      const old = saved(
        searchBoardEndpoint,
        await read(served, luis, searchBoardEndpoint, {
          query: `?userId=${who.kim}&from=2020-01-01&to=2020-01-31`,
        }),
      );
      expect(old.assignments.map((each) => each.warnings.map((warning) => warning.code))).toEqual([
        ['OUTSIDE_THE_ACTIVE_WINDOW'],
      ]);
      // Named by nobody, or over 62 days: refused in words.
      expect(
        told(
          await read(served, luis, searchBoardEndpoint, {
            query: '?from=2026-10-01&to=2026-10-02',
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
      expect(
        told(
          await read(served, luis, searchBoardEndpoint, {
            query: `?userId=${who.kim}&from=2026-01-01&to=2026-10-02`,
          }),
        ),
      ).toEqual([400, 'BAD_REQUEST']);
    });
  });

  it('AC-10-101 a phone’s record says when it was marked lost and why, by its reason’s name; its sessions are read newest first, each whose and when, with whether it came from a sign-in made offline and which way one under the master passcode was opened, never a token; a phone nobody has is not found', async () => {
    await world(
      async (served, tx, who) => {
        const p = await kimsPhone(served, tx, who);
        // A monitor made on the phone, as a real one is, signs in on it (ADR-442, 443).
        const made = await served.ask('POST', '/phones/current/monitors', {
          bearer: p.token,
          payload: { name: 'Ana Brooks', password: '3025550142', passcode },
        });
        expect(told(made)).toEqual([200, undefined]);
        const ana = monitorCreatedAnswerSchema.parse(made.body);
        const signedIn = await served.ask('POST', '/phones/current/sign-ins', {
          bearer: p.token,
          payload: { monitorNumber: ana.monitorNumber, password: '3025550142' },
        });
        expect(told(signedIn)).toEqual([200, undefined]);
        const sessions = saved(
          listPhoneSessionsEndpoint,
          await read(served, p.dana, listPhoneSessionsEndpoint, { ids: { deviceId: p.phone.id } }),
        );
        expect(
          sessions.sessions.map((each) => [
            each.userId,
            each.offlineSignIn,
            each.masterPasscodeSession,
            each.revokedAt,
          ]),
        ).toEqual([[ana.userId, false, null, null]]);
        expect(JSON.stringify(sessions)).not.toMatch(/token|Token|hash/);
        const stolen = await tx.reason.create({
          data: { name: 'Stolen from the truck', position: 900, uses: ['PHONE_REMOVAL'] },
        });
        saved(
          removePhoneEndpoint,
          await ask(served, p.dana, removePhoneEndpoint, {
            ids: { deviceId: p.phone.id },
            payload: { status: 'LOST', reasonId: stolen.id },
          }),
        );
        const lost = saved(
          listPhonesEndpoint,
          await read(served, p.dana, listPhonesEndpoint, { query: '?outOfService=true' }),
        ).phones.find((phone) => phone.id === p.phone.id);
        expect([lost?.status, lost?.outOfServiceReasonId, lost?.outOfServiceReason]).toEqual([
          'LOST',
          stolen.id,
          'Stolen from the truck',
        ]);
        expect(
          told(
            await read(served, p.dana, listPhoneSessionsEndpoint, {
              ids: { deviceId: randomUUID() },
            }),
          ),
        ).toEqual([404, 'NOT_FOUND']);
      },
      undefined,
      undefined,
      { media: new Kept() },
    );
  });

  it('AC-10-102 people searched by what their name holds, in any case, and ordered by name; a query that names one key twice is refused, which field, since no query takes a list', async () => {
    await world(async (served) => {
      const dana = await served.signedIn(danasEmail, long);
      const lu = saved(
        listPeopleEndpoint,
        await read(served, dana, listPeopleEndpoint, { query: '?name=ORTE' }),
      );
      expect(lu.people.map((person) => person.name)).toEqual(['Luis Ortega']);
      const byName = saved(
        listPeopleEndpoint,
        await read(served, dana, listPeopleEndpoint, { query: '?order=NAME&limit=200' }),
      ).people.map((person) => person.name);
      expect(byName).toEqual(
        [...byName].sort((one, other) => (one < other ? -1 : one > other ? 1 : 0)),
      );
      const twice = await read(served, dana, listPeopleEndpoint, {
        query: '?role=ADMIN&role=MONITOR',
      });
      expect(told(twice)).toEqual([400, 'BAD_REQUEST']);
    });
  });
});

describe('setup as the back office reads it', () => {
  it('AC-10-103 a project’s list and its page, its forms, its pay items without a rate, its rates only to whoever may set one, its rules whole and whether each is valid, its sites with their newest shape and each shape version, its map versions and one with its shapes, and every list’s values with the archived apart; a drawn shape has no file to read back', async () => {
    await world(async (served, tx, who, within) => {
      served.clock.at = new Date('2026-10-12T12:00:00Z');
      const dana = await served.signedIn(danasEmail, long);
      const priced = await p1Priced(served, dana, tx);
      saved(createPayItemEndpoint, await priced.veg15());
      const luis = await luisHolds(served, tx, who.luis);
      const ids = priced.ids;
      expect(
        saved(listProjectsEndpoint, await read(served, luis, listProjectsEndpoint)).projects.map(
          (project) => project.id,
        ),
      ).toContain(priced.project.id);
      const page = saved(
        readProjectEndpoint,
        await read(served, luis, readProjectEndpoint, { ids }),
      );
      expect(page.contractors.map((place) => [place.name, place.position])).toEqual([
        ['Coastline Haulers LLC', 'PRIME'],
      ]);
      expect(page.contracts.map((contract) => contract.name)).toEqual([
        'Coastline, Bayline ROW 2026',
      ]);
      expect(
        saved(listFormsEndpoint, await read(served, luis, listFormsEndpoint, { ids }))
          .forms.map((form) => form.form.documentType)
          .sort(),
      ).toEqual(['HAUL_OUT', 'LOAD', 'UNIT_RATE']);
      const payItems = saved(
        listPayItemsEndpoint,
        await read(served, luis, listPayItemsEndpoint, { ids }),
      );
      expect(payItems.payItems.map((each) => each.payItem.code)).toEqual(['VEG-HAUL-CY-15']);
      expect(JSON.stringify(payItems)).not.toContain('7.5');
      expect(told(await read(served, luis, listPayItemRatesEndpoint, { ids }))).toEqual([
        403,
        'NOT_ALLOWED',
      ]);
      // Past the door, as if it had let him in: the read asks Setup itself.
      await expect(
        new SetupReads(within, { media: new Kept(), fileBytesAtMost: 1 }).rates(
          who.luis,
          priced.project.id,
          { limit: 50 },
        ),
      ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
      const rates = saved(
        listPayItemRatesEndpoint,
        await read(served, dana, listPayItemRatesEndpoint, { ids }),
      );
      expect(rates.rates.map((rate) => [rate.primeId, rate.rate])).toEqual([
        [priced.coastline, '7.50'],
      ]);
      const payItemId = payItems.payItems[0]?.payItem.id ?? '';
      const written = saved(
        createRuleEndpoint,
        await ask(served, dana, createRuleEndpoint, {
          ids,
          payload: {
            formId: priced.forms.load,
            name: 'Vegetative haul, 0–15 mi',
            contractId: priced.contract,
            active: true,
            criteria: [],
            actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId }],
          },
        }),
      );
      const rules = saved(listRulesEndpoint, await read(served, luis, listRulesEndpoint, { ids }));
      // Whole as stated, and "Is valid" as the domain works it out now: what the save answered.
      expect(
        rules.rules.map((rule) => [
          rule.id,
          rule.name,
          rule.contractId,
          rule.actions.map((action) => [action.kind, action.slot, action.payItemId]),
          rule.valid,
          rule.reasons,
        ]),
      ).toEqual([
        [
          written.record.id,
          'Vegetative haul, 0–15 mi',
          priced.contract,
          [['ADD_TRANSACTION', 1, payItemId]],
          written.record.valid,
          written.record.reasons,
        ],
      ]);
      const siteType = await tx.siteType.findUniqueOrThrow({ where: { key: 'FINAL_DISPOSAL' } });
      const site = saved(
        createSiteEndpoint,
        await ask(served, dana, createSiteEndpoint, {
          ids,
          payload: {
            name: 'Bayline County Landfill',
            shortCode: 'BCL',
            siteTypeId: siteType.id,
            takesLoads: true,
            haulOutsLeaveHere: false,
            chargesTippingFee: false,
            ineligibleSite: false,
            permitNumber: null,
            latitude: '39.12',
            longitude: '-75.7',
            activationDate: '2026-10-12',
          },
        }),
      ).record;
      const square = {
        type: 'Polygon',
        coordinates: [
          [
            [-75.71, 39.11],
            [-75.69, 39.11],
            [-75.69, 39.13],
            [-75.71, 39.13],
            [-75.71, 39.11],
          ],
        ],
      };
      saved(
        addSiteShapeEndpoint,
        await ask(served, dana, addSiteShapeEndpoint, {
          ids: { siteId: site.id },
          payload: { source: 'DRAWN', shape: square },
        }),
      );
      const sites = saved(listSitesEndpoint, await read(served, luis, listSitesEndpoint, { ids }));
      expect(
        sites.sites.map((each) => [each.site.name, each.shape?.version, each.shape?.fileKept]),
      ).toEqual([['Bayline County Landfill', 1, false]]);
      const shapes = saved(
        listSiteShapesEndpoint,
        await read(served, luis, listSiteShapesEndpoint, { ids: { siteId: site.id } }),
      );
      expect(
        shapes.versions.map((version) => [version.version, version.source, version.shape]),
      ).toEqual([[1, 'DRAWN', square]]);
      const drawn = await read(served, luis, siteShapeFileEndpoint, {
        ids: { siteAreaVersionId: shapes.versions[0]?.id ?? '' },
      });
      expect(told(drawn)).toEqual([404, 'NOT_FOUND']);
      const zones = {
        type: 'FeatureCollection',
        features: p1Zones.map((zone) => ({
          type: 'Feature',
          properties: zone.fields,
          geometry: { type: 'Polygon', coordinates: zone.rings },
        })),
      };
      saved(
        loadMapEndpoint,
        await ask(served, dana, loadMapEndpoint, {
          ids,
          payload: {
            source: 'DRAWN',
            sourceName: null,
            boundary: { type: 'Polygon', coordinates: [p1Boundary] },
            zones,
            zoneNameField: 'ZONE_NAME',
          },
        }),
      );
      const maps = saved(
        listMapVersionsEndpoint,
        await read(served, luis, listMapVersionsEndpoint, { ids }),
      );
      expect(
        maps.mapVersions.map((map) => [map.version, map.zones.map((zone) => zone.name)]),
      ).toEqual([[1, ['Zone 1', 'Zone 2', 'Zone 3']]]);
      const map = saved(
        readMapVersionEndpoint,
        await read(served, luis, readMapVersionEndpoint, {
          ids: { mapVersionId: maps.mapVersions[0]?.id ?? '' },
        }),
      );
      expect(map.boundary).toEqual({ type: 'Polygon', coordinates: [p1Boundary] });
      expect(map.zones).toHaveLength(p1Zones.length);
      expect(
        told(
          await read(served, luis, mapVersionFileEndpoint, {
            ids: { mapVersionId: map.mapVersion.id, file: 'map' },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      const debrisTypes = saved(
        listListValuesEndpoint,
        await read(served, luis, listListValuesEndpoint, { ids: { list: 'debris-types' } }),
      );
      expect(debrisTypes.values.map((value) => value.name)).toContain('Vegetative');
      expect(debrisTypes.values.every((value) => !value.archived)).toBe(true);
      const reasons = saved(
        listListValuesEndpoint,
        await read(served, luis, listListValuesEndpoint, { ids: { list: 'reasons' } }),
      );
      expect(reasons.values.find((value) => value.name === 'Device failed')?.uses).toContain(
        'BACK_OFFICE_RECORD',
      );
      expect(
        saved(
          listListValuesEndpoint,
          await read(served, luis, listListValuesEndpoint, {
            ids: { list: 'debris-types' },
            query: '?archived=true',
          }),
        ).values.every((value) => value.archived),
      ).toBe(true);
    });
  });

  it('AC-10-104 what a setup save would change, before it is saved: a prime’s rate previewed says the rate it would hold and what it would queue; a rule "Pays when" wrote is previewed as refused, in its words; a manager/analyst without Setup is refused at the door', async () => {
    await world(async (served, tx, who) => {
      served.clock.at = new Date('2026-10-12T12:00:00Z');
      const dana = await served.signedIn(danasEmail, long);
      const priced = await p1Priced(served, dana, tx);
      const item = saved(createPayItemEndpoint, await priced.veg15()).record.id;
      const luis = await luisHolds(served, tx, who.luis);
      const ratePreview = (signed: Browser) =>
        ask(served, signed, previewPayItemRateEndpoint, {
          ids: { payItemId: item, primeId: priced.coastline },
          payload: { rate: '8.25' },
        });
      expect(told(await ratePreview(luis))).toEqual([403, 'NOT_ALLOWED']);
      const preview = saved(previewPayItemRateEndpoint, await ratePreview(dana));
      expect(preview).toMatchObject({ wouldSave: true, record: { rate: '8.25' } });
      saved(
        savePaysWhenEndpoint,
        await ask(served, dana, savePaysWhenEndpoint, {
          ids: { payItemId: item },
          payload: { pays: [{ formId: priced.forms.load, slot: 1, criteria: [] }] },
        }),
      );
      const written = await tx.rule.findFirstOrThrow({ where: { fromPayItemId: item } });
      const refused = saved(
        previewRuleChangeEndpoint,
        await ask(served, dana, previewRuleChangeEndpoint, {
          ids: { ruleId: written.id },
          payload: {
            formId: priced.forms.load,
            name: 'Renamed',
            contractId: priced.contract,
            active: true,
            criteria: [],
            actions: [{ kind: 'ADD_TRANSACTION', slot: 1, payItemId: item }],
          },
        }),
      );
      expect(refused).toEqual({
        wouldSave: false,
        reason: 'RULE_FROM_PAY_ITEM',
        message: 'Not saved: this rule is from pay item VEG-HAUL-CY-15. Change it on the pay item.',
      });
    });
  });
});

describe('what the back office is let see', () => {
  it('AC-10-107 each read asks its view again inside itself: past the door, Luis without “view review”, “view setup” or “view dispatch” reads none of that area, Setup or Dispatch held or not; given the view, he reads it; the projects and the lists stay his', async () => {
    await world(async (served, tx, who, within) => {
      const nobodysProject = randomUUID();
      const reads = new ReviewReads(within);
      const setupReads = new SetupReads(within, { media: new Kept(), fileBytesAtMost: 1 });
      const held = new HeldReads(within);
      const phones = new Phones(within, served.clock);
      const board = new Assignments(within, served.clock);
      const page = { limit: 10 };
      const refusedOrRead = async (work: () => Promise<unknown>) => {
        try {
          const answer = await work();
          const said = answer as { done?: boolean; code?: string } | null;
          return answer === null || said?.done === false ? 'NOT_ALLOWED' : 'read';
        } catch (error) {
          const { code } = error as { code?: string };
          // A project nobody has is past the reader's check.
          return code === 'NOT_FOUND' ? 'read' : (code ?? 'thrown');
        }
      };
      const areas = async () => ({
        review: [
          await refusedOrRead(() => reads.invoiceBatches(who.luis, nobodysProject, page)),
          await refusedOrRead(() => held.heldRecords(who.luis, page)),
        ],
        setup: [await refusedOrRead(() => setupReads.forms(who.luis, nobodysProject))],
        dispatch: [
          await refusedOrRead(() => phones.list(who.luis, { outOfService: false, ...page })),
          await refusedOrRead(() =>
            board.search(who.luis, {
              userId: who.kim,
              from: '2026-10-12',
              to: '2026-10-12',
              withdrawn: false,
              ...page,
            }),
          ),
        ],
        everyone: [await refusedOrRead(() => setupReads.projects(who.luis, page))],
      });
      // The test world lets him see all three.
      expect(await areas()).toEqual({
        review: ['read', 'read'],
        setup: ['read'],
        dispatch: ['read', 'read'],
        everyone: ['read'],
      });
      // Each view taken away, the acts of its area held: he reads none of it.
      await tx.userPermission.updateMany({
        where: { userId: who.luis },
        data: { archivedAt: new Date() },
      });
      for (const permission of ['QC', 'SETUP', 'DISPATCH'] as const) {
        await tx.userPermission.create({ data: { userId: who.luis, permission } });
      }
      expect(await areas()).toEqual({
        review: ['NOT_ALLOWED', 'NOT_ALLOWED'],
        setup: ['NOT_ALLOWED'],
        dispatch: ['NOT_ALLOWED', 'NOT_ALLOWED'],
        everyone: ['read'],
      });
      // "View setup" given back alone: setup, and nothing else.
      await tx.userPermission.update({
        where: { userId_permission: { userId: who.luis, permission: 'VIEW_SETUP' } },
        data: { archivedAt: null },
      });
      expect(await areas()).toEqual({
        review: ['NOT_ALLOWED', 'NOT_ALLOWED'],
        setup: ['read'],
        dispatch: ['NOT_ALLOWED', 'NOT_ALLOWED'],
        everyone: ['read'],
      });
      // An admin reads every area with no grant at all; a read-only viewer none, whatever it holds.
      const danaReads = await refusedOrRead(() =>
        reads.invoiceBatches(who.dana, nobodysProject, page),
      );
      expect(danaReads).toBe('read');
      await tx.userPermission.create({ data: { userId: who.viewer, permission: 'VIEW_REVIEW' } });
      expect(
        await refusedOrRead(() => reads.invoiceBatches(who.viewer, nobodysProject, page)),
      ).toBe('NOT_ALLOWED');
    });
  });
});

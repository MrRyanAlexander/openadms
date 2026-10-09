// Corrections to a ticket's own records through their endpoints, against the database
// (spec/parts/08 steps 2…4; spec/acceptance/04 AC-04-102, 103; 08 sections C and D; 10 AC-10-27,
// 28, 33, 37; BACKLOG 2.4.4; ADR-028, 051, 337, 364, 431). OWASP ASVS 5.0 V2, V8. The real
// process, in this test's own memory, on the installation's database as `adms_api`: it needs
// `pnpm local:up` after `pnpm installer`, and fails saying so. Each test's work is undone
// (support/database.ts).
//
// The API's login writes no status, flag or completed load: those are the worker's. So what is
// asked here is the record corrected in place, its audit record and the job queued; what the run
// then concludes from a corrected record is the stories' (`p1-reviewed`). What the database's own
// checks refuse ends a test's piece of work, so each such refusal is its test's last request.
import { createHash, randomUUID } from 'node:crypto';

import {
  backOfficeRoles,
  correctCarriedTicketEndpoint,
  correctFieldEventEndpoint,
  correctItemLineEndpoint,
  correctScaleReceiptEndpoint,
  createSiteEndpoint,
  endpoints,
  errorAnswerSchema,
  markPhotographEndpoint,
  renumberFieldEventEndpoint,
  type Endpoint,
} from '@open-adms/contracts';
import type { Database } from '@open-adms/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Corrections } from '../src/review/corrections.ts';
import { installationSettings, openInstallation, type Tx } from './support/database.ts';
import { shippedPolicy } from './support/process.ts';
import { audited, jobsFor, luisHolds, newId, notTaken, p1WithTickets } from './support/review.ts';
import { worldOn } from './support/served.ts';
import {
  ask,
  notSaved,
  plainly,
  saved,
  told,
  viewerSignsIn,
  type Browser,
} from './support/setup.ts';

let db: Database;

beforeAll(() => {
  db = openInstallation(installationSettings());
});
afterAll(async () => {
  await db.$disconnect();
});

const world = worldOn(() => db);

const corrections = [
  [correctFieldEventEndpoint, 'CORRECT'],
  [renumberFieldEventEndpoint, 'RENUMBER'],
  [correctItemLineEndpoint, 'CORRECT'],
  [correctCarriedTicketEndpoint, 'CORRECT'],
  [markPhotographEndpoint, 'CORRECT'],
  [correctScaleReceiptEndpoint, 'CORRECT'],
] as const;

const evidence = ['field_event', 'field_event_item', 'carried_ticket', 'photo', 'scale_receipt'];

// The changes made to the evidence so far, by anybody.
const changed = (tx: Tx): Promise<number> =>
  tx.auditRecord.count({ where: { tableName: { in: evidence }, operation: 'UPDATE' } });

// A photograph of a field event, as its phone would have sent its record.
async function photographOf(tx: Tx, event: { id: string; projectId: string; endedAt: Date }) {
  const fingerprint = createHash('sha256').update(event.id).digest('hex');
  return tx.photo.create({
    data: {
      id: await newId(tx),
      projectId: event.projectId,
      fieldEventId: event.id,
      capturedAt: event.endedAt,
      deviceUtcOffsetMinutes: -240,
      originalSha256: fingerprint,
      uploadedSha256: fingerprint,
      objectKey: `photographs/${event.id}/pile`,
    },
  });
}

describe('who may ask', () => {
  it('AC-10-27 a correction is open to an admin and to a manager/analyst who holds correct; a renumber to one who holds renumber', () => {
    for (const [served, permission] of corrections) {
      const { access, roles, permission: asked } = served as Endpoint;
      expect([access, roles, asked], served.name).toEqual([
        'SIGNED_IN',
        backOfficeRoles,
        permission,
      ]);
    }
    const taking = (permission: string) =>
      endpoints.filter((one) => one.permission === permission).map(({ name }) => name);
    // Part 3's (review-records.test.ts) follow part 2's.
    expect(taking('CORRECT')).toEqual([
      'correctFieldEvent',
      'correctItemLine',
      'correctCarriedTicket',
      'markPhotograph',
      'correctScaleReceipt',
      'correctRoe',
      'correctRoeScope',
      'correctSurvey',
      'correctIncident',
      'correctDropOffLog',
      'createFieldEvent',
    ]);
    expect(taking('RENUMBER')).toEqual([
      'renumberFieldEvent',
      'renumberQuarantinedRecord',
      'markSecondCopy',
    ]);
  });

  it('AC-10-27 each is refused to nobody, to a read-only viewer and to a manager/analyst who holds every permission but its own, before anything sent is read; nothing is changed', async () => {
    await world(async (served, tx, who, within) => {
      const viewer = await viewerSignsIn(served, tx, who.viewer, within);
      const before = await changed(tx);
      // A body no schema would take: the door answers first, and says nothing of it.
      const nonsense = { payload: { nonsense: true } };
      for (const [endpoint] of corrections) {
        expect(told(await ask(served, undefined, endpoint, nonsense)), endpoint.name).toEqual([
          401,
          'NOT_SIGNED_IN',
        ]);
        const refused = await ask(served, viewer, endpoint, nonsense);
        expect(told(refused), endpoint.name).toEqual([403, 'NOT_ALLOWED']);
        expect(Object.keys(refused.body as object).sort()).toEqual(['code', 'requestId']);
      }
      const every = [
        'SETUP',
        'DISPATCH',
        'VOID',
        'ACCEPT_FLAG',
        'QC',
        'LOCK_INVOICED',
        'UNLOCK_INVOICED',
        'CORRECT',
        'RENUMBER',
      ];
      const grants = new Map<string, string>();
      for (const permission of every) {
        const grant = await tx.userPermission.create({
          data: { userId: who.luis, permission: permission as 'VOID' },
        });
        grants.set(permission, grant.id);
      }
      const luis = await luisHolds(served, tx, who.luis);
      for (const [endpoint, permission] of corrections) {
        // Dana takes this one away: his very next request is refused, with the same session.
        await tx.userPermission.update({
          where: { id: grants.get(permission) ?? '' },
          data: { archivedAt: new Date() },
        });
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          403,
          'NOT_ALLOWED',
        ]);
        await tx.userPermission.update({
          where: { id: grants.get(permission) ?? '' },
          data: { archivedAt: null },
        });
        // Given back, the door lets him through to the schema, which refuses the nonsense.
        expect(told(await ask(served, luis, endpoint, nonsense)), endpoint.name).toEqual([
          400,
          'BAD_REQUEST',
        ]);
      }
      expect(await changed(tx)).toBe(before);
    });
  });

  it('AC-10-28 Luis holds correct and not renumber: his renumber of 101031 is refused at the door, and the service refuses him again inside its own piece of work; every correction called as a manager/analyst without the grant, a read-only viewer or a monitor changes nothing', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const photo = await photographOf(tx, p.collection);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const before = await changed(tx);
      const refused = await ask(served, luis, renumberFieldEventEndpoint, {
        ids: { fieldEventId: p.collection.id },
        payload: { ticketNumber: '101013' },
      });
      expect(told(refused)).toEqual([403, 'NOT_ALLOWED']);
      expect(Object.keys(refused.body as object).sort()).toEqual(['code', 'requestId']);
      const service = new Corrections(within, served.clock, shippedPolicy);
      expect(await service.renumber(who.luis, p.collection.id, { ticketNumber: '101013' })).toEqual(
        {
          saved: false,
          refusal: {
            code: 'NOT_PERMITTED',
            message:
              'Luis Ortega may not renumber a record: it takes an admin, or a manager/analyst granted "renumber". Nothing was changed.',
          },
        },
      );
      await tx.userPermission.updateMany({
        where: { userId: who.luis },
        data: { archivedAt: new Date() },
      });
      for (const person of [who.luis, who.viewer, who.kim]) {
        const refusals = [
          await service.fieldEvent(person, p.collection.id, { notes: 'Seen' }),
          await service.itemLine(person, p.unitRate.id, randomUUID(), 2),
          await service.carriedTicket(person, p.collection.id, '301001', true),
          await service.photograph(person, photo.id, { removed: true }),
          await service.scaleReceipt(person, randomUUID(), { notes: 'Seen' }),
        ];
        expect(refusals.map((outcome) => (outcome.saved ? 'saved' : outcome.refusal.code))).toEqual(
          refusals.map(() => 'NOT_PERMITTED'),
        );
      }
      expect(await changed(tx)).toBe(before);
    });
  });
});

describe('what the request’s schema refuses, in plain words', () => {
  it('AC-10-37 Luis sends a correction of 101001’s load call to 140, and a photograph’s label that is blank: each is refused by its schema before any service runs, saying which field and how, and nothing he sent', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const disposal = await p.created('DISPOSAL', '101001', { loadCall: 80 });
      const photo = await photographOf(tx, p.collection);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const before = await changed(tx);
      const correct = (changes: object, more: object = {}) =>
        ask(served, luis, correctFieldEventEndpoint, {
          ids: { fieldEventId: disposal.id },
          payload: { changes, ...more },
        });
      const label = (marks: object) =>
        ask(served, luis, markPhotographEndpoint, {
          ids: { photoId: photo.id },
          payload: { marks },
        });

      const tooFull = await correct({ loadCall: 140 });
      expect(notTaken(tooFull)).toBe(
        'Not taken: changes.loadCall in the body can’t be more than 100.',
      );
      expect(tooFull.text).not.toContain('140');
      expect(notTaken(await label({ label: '   ' }))).toBe(
        'Not taken: marks.label in the body is blank.',
      );

      expect(notTaken(await correct({ loadCall: -1 }))).toBe(
        'Not taken: changes.loadCall in the body can’t be less than 0.',
      );
      expect(notTaken(await correct({ loadCall: 72.5 }))).toBe(
        'Not taken: changes.loadCall in the body isn’t the kind of value this request takes.',
      );
      expect(notTaken(await correct({ loadCall: '80' }))).toBe(
        'Not taken: changes.loadCall in the body isn’t the kind of value this request takes.',
      );
      expect(notTaken(await correct({ estimateCy: 12.55 }))).toBe(
        'Not taken: changes.estimateCy in the body is finer than the 0.1 it is kept to.',
      );
      expect(notTaken(await correct({ startedAt: 'Wednesday at ten' }))).toBe(
        'Not taken: changes.startedAt in the body isn’t written the way this request takes it.',
      );
      expect(notTaken(await correct({ end: { latitude: '39.12' } }))).toBe(
        'Not taken: changes.end.longitude in the body is missing.',
      );
      expect(notTaken(await correct({ measuredAs: 'GIRTH' }))).toBe(
        'Not taken: changes.measuredAs in the body isn’t one of the values this request takes.',
      );
      expect(notTaken(await correct({ loadCall: 70 }, { note: '' }))).toBe(
        'Not taken: note in the body is blank.',
      );
      // Nothing stated is nothing to correct; a correction never carries what the worker writes.
      expect(notTaken(await correct({}))).toBe(
        'Not taken: changes in the body isn’t taken as it stands.',
      );
      const unnamed = await correct({ loadCall: 70, certifiedCapacityCy: 60, status: 'COMPLETED' });
      expect(notTaken(unnamed)).toBe(
        'Not taken: changes in the body has a field this request doesn’t take.',
      );
      expect(unnamed.text).not.toMatch(/certifiedCapacityCy|status|COMPLETED/);
      expect(notTaken(await correct({ loadCall: 70, ticketNumber: '101002' }))).toBe(
        'Not taken: changes in the body has a field this request doesn’t take.',
      );
      // Several at once: each said once, three at most.
      expect(
        notTaken(await correct({ loadCall: 140, carriedCount: -2, notes: ' ', address: '' })),
      ).toBe(
        'Not taken: changes.address in the body is blank; changes.notes in the body is blank; changes.loadCall in the body can’t be more than 100; and 1 more.',
      );
      expect(
        notTaken(
          await ask(served, luis, correctFieldEventEndpoint, {
            ids: { fieldEventId: '101001' },
            payload: { changes: { loadCall: 70 } },
          }),
        ),
      ).toBe('Not taken: fieldEventId in the path isn’t written the way this request takes it.');

      expect(await changed(tx)).toBe(before);
      expect((await tx.fieldEvent.findUniqueOrThrow({ where: { id: disposal.id } })).loadCall).toBe(
        80,
      );
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([]);
    });
  });
});

describe('a field event corrected', () => {
  it('Luis corrects the load call of 101001’s disposal from 80 to 70 with his own note: the same record, the value before in the audit log under him, its ticket queued in the same request and nothing the worker writes touched; its time, its fix and its cert number are corrected the same way', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const disposal = await p.created('DISPOSAL', '101001', { loadCall: 80 });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const correct = (payload: object, fieldEventId = disposal.id) =>
        ask(served, luis, correctFieldEventEndpoint, { ids: { fieldEventId }, payload });

      const note = 'Tower sheet says 70';
      const answer = await correct({ changes: { loadCall: 70 }, note });
      const { record, queued } = saved(correctFieldEventEndpoint, answer);
      expect(record).toMatchObject({
        id: disposal.id,
        projectId: p.project.id,
        workflow: 'LOAD',
        kind: 'DISPOSAL',
        ticketNumber: '101001',
        source: 'BACK_OFFICE',
        loadCall: 70,
        certNumber: '730415',
        end: null,
      });
      expect(Object.keys(record)).not.toContain('status');
      expect(queued).toMatchObject({ tickets: 1, lockedAsInvoiced: 0 });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION', 'LOAD 101001']]);
      const [change] = await audited(tx, answer, 'field_event');
      expect([
        change?.operation,
        change?.actorId === who.luis,
        change?.source,
        change?.reason,
        change?.before?.['load_call'],
      ]).toEqual(['UPDATE', true, 'BACK_OFFICE', note, 80]);
      expect(served.lines.join('')).not.toContain(note);

      const more = saved(
        correctFieldEventEndpoint,
        await correct({
          changes: {
            endedAt: '2026-10-14T19:05:00.000Z',
            end: { latitude: '39.12', longitude: '-75.7' },
            certNumber: ' 730416 ',
            notes: 'Second truck of the tandem',
          },
        }),
      ).record;
      expect(more).toMatchObject({
        loadCall: 70,
        endedAt: '2026-10-14T19:05:00.000Z',
        end: { latitude: '39.12000000', longitude: '-75.70000000' },
        certNumber: '730416',
        // No certification on the project has that number yet (ADR-154).
        certificationId: null,
        notes: 'Second truck of the tandem',
      });
      // A detail that may be empty is emptied by stating it empty.
      expect(
        saved(
          correctFieldEventEndpoint,
          await correct({ changes: { loadCall: null, end: null, notes: null } }),
        ).record,
      ).toMatchObject({ loadCall: null, end: null, notes: null });

      // A fix that can't be one is the domain's to refuse, in its own words.
      expect(
        notSaved(await correct({ changes: { end: { latitude: '95', longitude: '-75.7' } } }))[0],
      ).toBe('GPS_UNREADABLE');
      const nobody = await correct({ changes: { loadCall: 70 } }, randomUUID());
      expect(told(nobody)).toEqual([404, 'NOT_FOUND']);
      expect(plainly(nobody)).toBe('Nothing with that id is on record.');
      expect((await tx.fieldEvent.findUniqueOrThrow({ where: { id: disposal.id } })).status).toBe(
        'PENDING',
      );
      expect((await jobsFor(tx, p.project.id, who.luis)).length).toBe(3);
    });
  });

  it('AC-10-33 a load call on a collection is the database’s own refusal, told plainly: only a disposal and a haul-out collection have one', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const answer = await ask(served, p.dana, correctFieldEventEndpoint, {
        ids: { fieldEventId: p.collection.id },
        payload: { changes: { loadCall: 70 } },
      });
      expect(told(answer)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(answer)).toBe(
        'Not saved: only a disposal and a haul-out collection have a load call, a whole number from 0 to 100.',
      );
    });
  });
});

describe('a renumber', () => {
  it('Luis renumbers 101031’s collection to 101013: the number changes and nothing else, the number before in the audit log under him, and the ticket it left and the one it joined are both queued; the number it already has and a suffix on unit rate work are refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'RENUMBER');
      const renumber = (fieldEventId: string, payload: object) =>
        ask(served, luis, renumberFieldEventEndpoint, { ids: { fieldEventId }, payload });

      const note = 'Barcode misread: the paper says 101013';
      const answer = await renumber(p.collection.id, { ticketNumber: '101013', note });
      const { record, queued } = saved(renumberFieldEventEndpoint, answer);
      expect(record).toMatchObject({
        id: p.collection.id,
        ticketNumber: '101013',
        splitSuffix: '',
        kind: 'COLLECTION',
        startedAt: p.collection.startedAt.toISOString(),
      });
      expect(queued).toMatchObject({ tickets: 2 });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([
        ['CORRECTION', 'LOAD 101013', 'LOAD 101031'],
      ]);
      const [change] = await audited(tx, answer, 'field_event');
      expect([
        change?.actorId === who.luis,
        change?.reason,
        change?.before?.['ticket_number'],
      ]).toEqual([true, note, '101031']);

      expect(notSaved(await renumber(p.collection.id, { ticketNumber: '101013' }))).toEqual([
        'NUMBER_UNCHANGED',
        'It is already numbered 101013. Nothing was changed.',
      ]);
      expect(
        notSaved(await renumber(p.unitRate.id, { ticketNumber: '301001', splitSuffix: 'A' }))[0],
      ).toBe('SUFFIX_NOT_ON_THIS_KIND');
      expect(
        notSaved(await renumber(p.collection.id, { ticketNumber: '101013', splitSuffix: 'a' }))[0],
      ).toBe('SUFFIX_NOT_LETTERS');
      expect(notTaken(await renumber(p.collection.id, { ticketNumber: ' ' }))).toBe(
        'Not taken: ticketNumber in the body is blank.',
      );
      expect(told(await renumber(randomUUID(), { ticketNumber: '101014' }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
      expect(await jobsFor(tx, p.project.id, who.luis)).toHaveLength(1);
    });
  });

  it('a number another collection holds is refused in plain words, by the database’s own key, and nothing changes: a ticket has one of each kind', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      await p.created('COLLECTION', '101032');
      const answer = await ask(served, p.dana, renumberFieldEventEndpoint, {
        ids: { fieldEventId: p.collection.id },
        payload: { ticketNumber: '101032' },
      });
      expect(notSaved(answer)).toEqual([
        'NUMBER_HELD',
        'Ticket 101032 already has a collection: a ticket has one of each kind. Nothing was changed.',
      ]);
      expect(answer.text).not.toMatch(/constraint|prisma|violates|_key/i);
    });
  });
});

describe('an item line and a carried ticket', () => {
  it('Luis adds a Dryer line to unit rate ticket 301001, corrects its count, takes it off and puts it back: one row all the while, marked with the time while it is off, each change audited under him and the ticket queued each time', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const dryer = await tx.itemName.findFirstOrThrow({ where: { name: 'Dryer' } });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const ids = { fieldEventId: p.unitRate.id, itemNameId: dryer.id };
      const line = (payload: object, at = ids) =>
        ask(served, luis, correctItemLineEndpoint, { ids: at, payload });

      const added = saved(correctItemLineEndpoint, await line({ quantity: 2 }));
      expect(added.record).toMatchObject({ ...ids, quantity: 2, takenOffAt: null });
      expect(added.queued).toMatchObject({ tickets: 1 });
      const three = await line({ quantity: 3, note: 'Three on the photograph' });
      expect(saved(correctItemLineEndpoint, three).record).toMatchObject({
        id: added.record.id,
        quantity: 3,
      });
      const [change] = await audited(tx, three, 'field_event_item');
      expect([change?.actorId === who.luis, change?.reason, change?.before?.['quantity']]).toEqual([
        true,
        'Three on the photograph',
        2,
      ]);
      const off = saved(correctItemLineEndpoint, await line({ quantity: 'TAKEN_OFF' })).record;
      expect([off.id, off.quantity, typeof off.takenOffAt]).toEqual([added.record.id, 3, 'string']);
      expect(saved(correctItemLineEndpoint, await line({ quantity: 1.25 })).record).toMatchObject({
        id: added.record.id,
        quantity: 1.25,
        takenOffAt: null,
      });
      expect(await tx.fieldEventItem.count({ where: { fieldEventId: p.unitRate.id } })).toBe(1);
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual(
        [1, 2, 3, 4].map(() => ['CORRECTION', 'UNIT_RATE 301001']),
      );

      expect(notTaken(await line({ quantity: -1 }))).toBe(
        'Not taken: quantity in the body can’t be less than 0.',
      );
      expect(notTaken(await line({}))).toBe('Not taken: quantity in the body is missing.');
      // A line the ticket never had can't be taken off.
      const washer = await tx.itemName.findFirstOrThrow({ where: { name: 'Washer' } });
      expect(
        told(await line({ quantity: 'TAKEN_OFF' }, { ...ids, itemNameId: washer.id })),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-10-33 an item line on a collection is the database’s own refusal, told plainly: only unit rate work has item lines', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const dryer = await tx.itemName.findFirstOrThrow({ where: { name: 'Dryer' } });
      const answer = await ask(served, p.dana, correctItemLineEndpoint, {
        ids: { fieldEventId: p.collection.id, itemNameId: dryer.id },
        payload: { quantity: 1 },
      });
      expect(told(answer)).toEqual([422, 'REFUSED_BY_THE_DATABASE']);
      expect(plainly(answer)).toBe('Not saved: only unit rate work has item lines.');
    });
  });

  it('Luis lists 301001 as carried by 101031’s collection, takes it off and puts it back: one row, marked while it is off, the load queued each time', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const carried = (payload: object, fieldEventId = p.collection.id) =>
        ask(served, luis, correctCarriedTicketEndpoint, { ids: { fieldEventId }, payload });

      const listed = saved(
        correctCarriedTicketEndpoint,
        await carried({ carriedTicketNumber: '301001', carried: true }),
      );
      expect(listed.record).toMatchObject({
        fieldEventId: p.collection.id,
        carriedTicketNumber: '301001',
        takenOffAt: null,
      });
      expect(listed.queued).toMatchObject({ tickets: 1 });
      const off = await carried({
        carriedTicketNumber: '301001',
        carried: false,
        note: 'Stump went on the next truck',
      });
      expect(typeof saved(correctCarriedTicketEndpoint, off).record.takenOffAt).toBe('string');
      const [change] = await audited(tx, off, 'carried_ticket');
      expect([change?.operation, change?.actorId === who.luis, change?.reason]).toEqual([
        'UPDATE',
        true,
        'Stump went on the next truck',
      ]);
      expect(
        saved(
          correctCarriedTicketEndpoint,
          await carried({ carriedTicketNumber: '301001', carried: true }),
        ).record,
      ).toMatchObject({ id: listed.record.id, takenOffAt: null });
      expect(await tx.carriedTicket.count({ where: { fieldEventId: p.collection.id } })).toBe(1);
      expect((await jobsFor(tx, p.project.id, who.luis)).map(([, ...tickets]) => tickets)).toEqual(
        [1, 2, 3].map(() => ['LOAD 101031']),
      );

      expect(notTaken(await carried({ carriedTicketNumber: '301001' }))).toBe(
        'Not taken: carried in the body is missing.',
      );
      // One it never listed can't be taken off.
      expect(told(await carried({ carriedTicketNumber: '301009', carried: false }))).toEqual([
        404,
        'NOT_FOUND',
      ]);
    });
  });
});

describe('a photograph’s two marks', () => {
  it('AC-04-102 Dana removes a photograph of 101031 from the record: it is marked removed with the time and nothing is deleted, its record, its fingerprints and where its file is kept all as they were, the audit log saying she did it; clearing the mark puts it back; the ticket is queued each time; a manager/analyst needs correct', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const photo = await photographOf(tx, p.collection);
      const other = await photographOf(tx, p.unitRate);
      const mark = (signed: Browser, marks: object, note?: string) =>
        ask(served, signed, markPhotographEndpoint, {
          ids: { photoId: photo.id },
          payload: { marks, ...(note === undefined ? {} : { note }) },
        });

      const luis = await luisHolds(served, tx, who.luis, 'VOID', 'QC', 'RENUMBER');
      expect(told(await mark(luis, { removed: true }))).toEqual([403, 'NOT_ALLOWED']);

      const answer = await mark(p.dana, { removed: true }, 'Another truck’s pile');
      const removed = saved(markPhotographEndpoint, answer);
      expect(removed.record).toMatchObject({
        id: photo.id,
        projectId: p.project.id,
        fieldEventId: p.collection.id,
        certificationId: null,
        label: null,
      });
      expect(typeof removed.record.removedAt).toBe('string');
      // Never where its file is kept.
      expect(answer.text).not.toContain('photographs/');
      expect(removed.queued).toMatchObject({ tickets: 1 });
      const kept = await tx.photo.findUniqueOrThrow({ where: { id: photo.id } });
      expect([kept.originalSha256, kept.uploadedSha256, kept.objectKey]).toEqual([
        photo.originalSha256,
        photo.uploadedSha256,
        photo.objectKey,
      ]);
      expect(kept.archivedAt?.toISOString()).toBe(removed.record.removedAt);
      expect((await tx.photo.findUniqueOrThrow({ where: { id: other.id } })).archivedAt).toBeNull();
      const [change] = await audited(tx, answer, 'photo');
      expect([
        change?.operation,
        change?.actorId === who.dana,
        change?.reason,
        change?.before?.['archived_at'],
      ]).toEqual(['UPDATE', true, 'Another truck’s pile', null]);

      const back = await mark(p.dana, { removed: false });
      expect(saved(markPhotographEndpoint, back).record.removedAt).toBeNull();
      expect((await audited(tx, back, 'photo'))[0]?.actorId).toBe(who.dana);
      expect(await tx.photo.count({ where: { projectId: p.project.id } })).toBe(2);
      expect(await jobsFor(tx, p.project.id, who.dana)).toEqual([
        // The two field events she created, then the two marks.
        ['CORRECTION', 'LOAD 101031'],
        ['CORRECTION', 'UNIT_RATE 301001'],
        ['CORRECTION', 'LOAD 101031'],
        ['CORRECTION', 'LOAD 101031'],
      ]);
      expect(
        told(
          await ask(served, p.dana, markPhotographEndpoint, {
            payload: { marks: { removed: true } },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
    });
  });

  it('AC-04-103 Dana labels a photograph "Pile at the curb before loading" in her own words, changes it and takes it off: each change is in the audit log with what the label said before; a blank isn’t a label; a removed photograph keeps its own; the log never holds a label', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
      const photo = await photographOf(tx, p.collection);
      const mark = (marks: object) =>
        ask(served, p.dana, markPhotographEndpoint, {
          ids: { photoId: photo.id },
          payload: { marks },
        });

      const first = 'Pile at the curb before loading';
      expect(saved(markPhotographEndpoint, await mark({ label: `  ${first} ` })).record.label).toBe(
        first,
      );
      const second = 'Pile at the curb, 22 Elm St';
      const changed = await mark({ label: second });
      expect(saved(markPhotographEndpoint, changed).record).toMatchObject({
        label: second,
        removedAt: null,
      });
      expect((await audited(tx, changed, 'photo'))[0]?.before?.['label']).toBe(first);
      // Removed, it keeps its label.
      expect(saved(markPhotographEndpoint, await mark({ removed: true })).record).toMatchObject({
        label: second,
      });
      expect(notTaken(await mark({ label: '' }))).toBe(
        'Not taken: marks.label in the body is blank.',
      );
      expect(notTaken(await mark({}))).toBe(
        'Not taken: marks in the body isn’t taken as it stands.',
      );
      expect(notTaken(await mark({ label: second, objectKey: 'photographs/other' }))).toBe(
        'Not taken: marks in the body has a field this request doesn’t take.',
      );
      const off = await mark({ label: null });
      expect(saved(markPhotographEndpoint, off).record.label).toBeNull();
      const [change] = await audited(tx, off, 'photo');
      expect([change?.actorId === who.dana, change?.before?.['label']]).toEqual([true, second]);
      expect(served.lines.join('')).not.toMatch(/Pile at the curb/);
    });
  });
});

describe('a scale receipt corrected', () => {
  it('Luis corrects the net weight copied off receipt 004417 from 12.5 to 12.35 tons: the same record, the weight before in the audit log under him, and the disposal that points at it queued; a blank number is refused in plain words', async () => {
    await world(async (served, tx, who, within) => {
      const p = await p1WithTickets(served, tx, within, who);
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
            chargesTippingFee: true,
            ineligibleSite: false,
            permitNumber: 'FDEP-SW-2019-0442',
            latitude: '39.12',
            longitude: '-75.7',
            activationDate: '2026-10-12',
          },
        }),
      ).record;
      const receipt = await tx.scaleReceipt.create({
        data: {
          id: await newId(tx),
          projectId: p.project.id,
          receiptNumber: '004417',
          siteId: landfill.id,
          netWeightTons: 12.5,
          enteredById: who.kim,
          enteredAt: new Date('2026-10-14T19:00:00Z'),
          deviceUtcOffsetMinutes: -240,
        },
      });
      await p.created('DISPOSAL', '101001', { siteId: landfill.id, scaleReceiptId: receipt.id });
      const luis = await luisHolds(served, tx, who.luis, 'CORRECT');
      const correct = (changes: object, note?: string) =>
        ask(served, luis, correctScaleReceiptEndpoint, {
          ids: { scaleReceiptId: receipt.id },
          payload: { changes, ...(note === undefined ? {} : { note }) },
        });

      const note = 'Misread a 3 as a 5';
      const answer = await correct(
        { netWeightTons: 12.35, notes: 'Copied from the yellow slip' },
        note,
      );
      const { record, queued } = saved(correctScaleReceiptEndpoint, answer);
      expect(record).toEqual({
        id: receipt.id,
        projectId: p.project.id,
        receiptNumber: '004417',
        siteId: landfill.id,
        grossWeightLb: null,
        tareWeightLb: null,
        netWeightLb: null,
        netWeightTons: 12.35,
        enteredById: who.kim,
        enteredAt: '2026-10-14T19:00:00.000Z',
        notes: 'Copied from the yellow slip',
      });
      expect(queued).toMatchObject({ tickets: 1, lockedAsInvoiced: 0 });
      expect(await jobsFor(tx, p.project.id, who.luis)).toEqual([['CORRECTION', 'LOAD 101001']]);
      const [change] = await audited(tx, answer, 'scale_receipt');
      expect([
        change?.operation,
        change?.actorId === who.luis,
        change?.reason,
        change?.before?.['net_weight_tons'],
      ]).toEqual(['UPDATE', true, note, 12.5]);

      expect(notTaken(await correct({ receiptNumber: '  ' }))).toBe(
        'Not taken: changes.receiptNumber in the body is blank.',
      );
      expect(notTaken(await correct({ grossWeightLb: -5 }))).toBe(
        'Not taken: changes.grossWeightLb in the body can’t be less than 0.',
      );
      expect(notTaken(await correct({ notes: 'Seen', enteredById: who.luis }))).toBe(
        'Not taken: changes in the body has a field this request doesn’t take.',
      );
      expect(
        told(
          await ask(served, luis, correctScaleReceiptEndpoint, {
            payload: { changes: { notes: 'Seen' } },
          }),
        ),
      ).toEqual([404, 'NOT_FOUND']);
      expect(errorAnswerSchema.parse((await correct({})).body).code).toBe('BAD_REQUEST');
    });
  });
});

// The forms that are no ticket's begun on the phone (src/phone/forms.ts; BACKLOG 3.5.4, C66, C69,
// C118, C127; REQ-307; ADR-149, 150, 160, 477, 584): an ROE opened under the next number of the
// phone's ROE block, marked used at once, or the paper's own; kept in the store across a restart;
// cancelled kept unsent; submitted sealed in the outbox as the record the contract carries, with
// the firm's own fields answered against the version shown and its photographs after it; a submit
// cut short finished on opening again; the pre-work surveys this phone made, for a post-work
// survey's ROEs. Here over a store in memory; through the screens against the real API,
// e2e/forms.e2e.ts.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { PhoneForms, type FormBegun } from '../src/phone/forms.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import type { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneOutbox } from '../src/phone/outbox.ts';
import type { Json } from '../src/store/phone-store.ts';
import { noLists } from './checks.ts';
import { HeldStore } from './held.ts';
import { ana, kim, marshRoad, p1 } from './phone-world.ts';

const anasDay: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d41',
  workDate: '2026-10-19',
  project: p1,
  fieldEventKinds: ['COLLECTION'],
  certifying: false,
  formDocumentTypes: ['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG'],
  site: { id: marshRoad.id, name: marshRoad.name },
};
const preWork = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d51';
const postWork = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d52';
const propertyDamage = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d53';
const incidentFields = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d54';
const coastline = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d55';
const lists: PhoneListsRecord = {
  ...noLists,
  blocks: [
    { series: 'ROE', firstNumber: 1, lastNumber: 100, lastUsedNumber: null, status: 'ISSUED' },
  ],
  surveyWorkTypes: [
    { id: preWork, name: 'Pre-work survey', key: 'PRE_WORK' },
    { id: postWork, name: 'Post-work survey', key: 'POST_WORK' },
  ],
  incidentTypes: [{ id: propertyDamage, name: 'Property damage', subTypes: [] }],
  incidentOffers: ['CONTRACTOR', 'CERT_NUMBER'],
  contractors: [{ id: coastline, name: 'Coastline Haulers LLC' }],
  forms: [
    { documentType: 'ROE', gpsRequired: true, definition: null },
    {
      documentType: 'INCIDENT',
      gpsRequired: false,
      definition: {
        id: incidentFields,
        version: 1,
        fields: [
          { id: 'police-report', label: 'Police report number', type: 'TEXT', required: true },
          { id: 'damage', label: 'Photo of the damage', type: 'PHOTO', required: false },
        ],
      },
    },
  ],
};

// A phone holding Ana's lists, its outbox and its forms over one store, on a clock the test
// moves.
async function phone(store = new HeldStore()) {
  const clock = { now: new Date('2026-10-19T15:50:00Z') };
  const now = () => clock.now;
  if ((await store.read('lists', 'assignment')) === undefined) {
    await store.change([
      {
        shelf: 'lists',
        id: 'assignment',
        value: {
          assignment: anasDay,
          noAssignment: null,
          lists,
          monitorId: ana.id,
          readAt: '2026-10-19T11:00:00.000Z',
        } as unknown as Json,
      },
    ]);
  }
  const held = new PhoneLists(store, {} as MonitorOnPhone, now);
  const outbox = await PhoneOutbox.opened(store, {
    holding: async () => ({
      holds: { masterPasscodeVersion: null, listsProjectId: p1.id },
      lastUsed: await held.lastUsed(),
    }),
    filePartBytesAtMost: 4_194_304,
    wipe: () => store.erase(),
    now,
  });
  const forms = await PhoneForms.opened(store, held, outbox, {
    photoBytesAtMost: 33_554_432,
    now,
  });
  return { store, clock, lists: held, outbox, forms };
}

const begun = (more: Partial<FormBegun> = {}): FormBegun => ({
  kind: 'INCIDENT',
  monitorId: ana.id,
  projectId: p1.id,
  timeZone: p1.timeZone,
  assignmentId: anasDay.id,
  setupVersion: 3,
  siteId: null,
  formDefinitionId: incidentFields,
  step: 'details',
  start: { incidentTypeId: propertyDamage },
  ...more,
});

const damage = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8]);

describe('an ROE begun on the phone', () => {
  it('AC-11-84, AC-04-80 takes the next number of the phone’s ROE block, written R-0001, marked used at once: never made again, and reported at the next sync', async () => {
    const { forms, lists: held, outbox } = await phone();
    expect(await forms.nextRoeNumber()).toBe('R-0001');
    const roe = await forms.begin(
      begun({
        kind: 'ROE',
        formDefinitionId: null,
        step: 'property',
        start: {},
        roe: { number: 'R-0001', from: 'MADE' },
      }),
    );
    expect([roe.roeNumber, roe.numberFrom]).toEqual(['R-0001', 'MADE']);
    expect(await forms.nextRoeNumber()).toBe('R-0002');
    expect(await held.lastUsed()).toContainEqual(
      expect.objectContaining({ series: 'ROE', lastUsedNumber: 1 }),
    );
    // The paper's own number takes none of the block's.
    await forms.begin(
      begun({ kind: 'ROE', start: {}, roe: { number: 'ROE 2026-0412', from: 'TYPED' } }),
    );
    expect(await forms.nextRoeNumber()).toBe('R-0002');
    // Signed and its day, its GPS where the form asks for it, submitted as the contract carries
    // it: no notes on an ROE, a day only where it is signed.
    await forms.changed(roe.id, {
      parcelId: '07-1234-0412',
      ownerName: 'Maria Lopez',
      address: '412 Cedar Ct',
      signed: true,
      signedDate: '2026-10-09',
    });
    expect(
      await forms.submit(roe.id, { latitude: '39.10220000', longitude: '-75.58410000' }),
    ).toMatchObject({ kind: 'sealed' });
    expect(outbox.sends().records).toEqual([
      {
        record: 'ROE',
        roe: {
          id: roe.id,
          projectId: p1.id,
          roeNumber: 'R-0001',
          parcelId: '07-1234-0412',
          address: '412 Cedar Ct',
          ownerName: 'Maria Lopez',
          signed: true,
          signedDate: '2026-10-09',
          latitude: '39.10220000',
          longitude: '-75.58410000',
          madeById: ana.id,
          assignmentId: anasDay.id,
          madeAt: '2026-10-19T15:50:00.000Z',
          deviceUtcOffsetMinutes: roe.offset,
        },
      },
    ]);
  });

  it('AC-11-84 cancelled, stays on the phone, unsent, keeping its number: the next is never it', async () => {
    const { forms, outbox } = await phone();
    const roe = await forms.begin(
      begun({ kind: 'ROE', start: {}, roe: { number: 'R-0001', from: 'MADE' } }),
    );
    await forms.cancel(roe.id);
    expect([outbox.waiting(), forms.openOf(ana.id), await forms.nextRoeNumber()]).toEqual([
      0,
      [],
      'R-0002',
    ]);
    await expect(forms.changed(roe.id, { notes: 'later' })).rejects.toThrow(
      'Only an open form changes',
    );
  });
});

describe('a form', () => {
  it('AC-11-75 is kept where its monitor left it, read again by a phone opened afresh; another monitor never sees it', async () => {
    const { forms, store } = await phone();
    const incident = await forms.begin(begun());
    await forms.changed(incident.id, { description: 'Mailbox struck', step: 'place' });
    const again = await phone(store);
    expect(
      again.forms.openOf(ana.id).map(({ id, step, description }) => [id, step, description]),
    ).toEqual([[incident.id, 'place', 'Mailbox struck']]);
    expect(again.forms.openOf(kim.id)).toEqual([]);
  });

  it('AC-04-86, AC-04-87, AC-04-99, AC-11-86, C66, C69 is sealed in the outbox as the record the contract carries, with the firm’s own fields answered against the version shown, a photograph field’s answer its own photograph, sent after it; the phone changes it no more', async () => {
    const { forms, outbox, clock } = await phone();
    const incident = await forms.begin(begun());
    const photo = await forms.photographed(incident.id, damage, null);
    expect(photo).not.toBeNull();
    // An id that isn't one is the contract's to refuse: nothing is sealed.
    await forms.changed(incident.id, { contractorId: 'coastline' });
    expect(await forms.submit(incident.id, null)).toMatchObject({ kind: 'notKept' });
    expect(forms.form(incident.id)?.state).toBe('OPEN');
    await forms.changed(incident.id, {
      contractorId: coastline,
      certNumber: '730416',
      description: 'Mailbox struck by the loader',
      parties: 'Resident at 22 Elm St',
      address: '22 Elm St',
      addressSource: 'TYPED',
      answers: { 'police-report': 'BC-2026-1187', damage: photo ?? '' },
    });
    clock.now = new Date('2026-10-19T16:05:00Z');
    expect(await forms.submit(incident.id, null)).toMatchObject({ kind: 'sealed' });
    const sent = outbox.sends();
    expect(sent.records).toEqual([
      {
        record: 'INCIDENT',
        incident: {
          id: incident.id,
          projectId: p1.id,
          monitorId: ana.id,
          assignmentId: anasDay.id,
          setupVersion: 3,
          // When it was begun: its time.
          madeAt: '2026-10-19T15:50:00.000Z',
          deviceUtcOffsetMinutes: incident.offset,
          latitude: null,
          longitude: null,
          notes: null,
          formDefinitionId: incidentFields,
          answers: { 'police-report': 'BC-2026-1187', damage: photo },
          incidentTypeId: propertyDamage,
          incidentSubTypeId: null,
          description: 'Mailbox struck by the loader',
          parties: 'Resident at 22 Elm St',
          address: '22 Elm St',
          contractorId: coastline,
          certNumber: '730416',
          roeNumber: null,
        },
      },
    ]);
    expect(sent.photos.map(({ id, owner }) => [id, owner])).toEqual([
      [photo, { kind: 'INCIDENT', id: incident.id }],
    ]);
    expect(forms.form(incident.id)?.state).toBe('SUBMITTED');
    await expect(forms.changed(incident.id, { notes: 'later' })).rejects.toThrow(
      'Only an open form changes',
    );
  });

  it('a photograph taken off before submitting is never sent, and is no field’s answer any more', async () => {
    const { forms, outbox } = await phone();
    const incident = await forms.begin(begun());
    const photo = await forms.photographed(incident.id, damage, null);
    await forms.changed(incident.id, {
      answers: { 'police-report': 'BC-1', damage: photo ?? '' },
    });
    await forms.photoRemoved(incident.id, photo ?? '');
    expect(forms.form(incident.id)?.answers).toEqual({ 'police-report': 'BC-1' });
    await forms.submit(incident.id, null);
    expect(outbox.sends().photos).toEqual([]);
  });

  it('AC-11-78 a photograph taken again takes its place and answers the field the one before did; the one before is never sent', async () => {
    const { forms, outbox } = await phone();
    const incident = await forms.begin(begun());
    const first = (await forms.photographed(incident.id, damage, null)) ?? '';
    await forms.changed(incident.id, { answers: { 'police-report': 'BC-1', damage: first } });
    const again = await forms.photographed(
      incident.id,
      Uint8Array.from([...damage, 1]),
      null,
      first,
    );
    expect(again).not.toBeNull();
    expect(forms.form(incident.id)?.photos.map(({ id }) => id)).toEqual([again]);
    expect(forms.form(incident.id)?.answers).toEqual({ 'police-report': 'BC-1', damage: again });
    await forms.submit(incident.id, null);
    expect(outbox.sends().photos.map(({ id }) => id)).toEqual([again]);
  });

  it('AC-04-79 a form holding its eight still takes one again in its place, and takes no ninth', async () => {
    const { forms } = await phone();
    const incident = await forms.begin(begun());
    const taken: string[] = [];
    for (let photo = 0; photo < 8; photo += 1) {
      taken.push((await forms.photographed(incident.id, damage, null)) ?? '');
    }
    expect(await forms.photographed(incident.id, damage, null)).toBeNull();
    const again = await forms.photographed(incident.id, damage, null, taken[7]);
    expect(again).not.toBeNull();
    expect(forms.form(incident.id)?.photos.map(({ id }) => id)).toEqual([
      ...taken.slice(0, 7),
      again,
    ]);
  });

  it('a submit cut short is finished when the phone opens again: the record kept once, its photograph with it', async () => {
    const { forms, store, outbox } = await phone();
    const log = await forms.begin(
      begun({ kind: 'DROP_OFF_LOG', siteId: marshRoad.id, formDefinitionId: null, start: {} }),
    );
    await forms.photographed(log.id, damage, null);
    await outbox.keep(PhoneForms.record(log));
    const again = await phone(store);
    const sent = again.outbox.sends();
    expect([sent.records.length, sent.photos.length]).toEqual([1, 1]);
    expect(sent.records[0]).toMatchObject({
      record: 'DROP_OFF_LOG',
      dropOffLog: { id: log.id, siteId: marshRoad.id, residentName: null },
    });
    expect(again.forms.form(log.id)?.state).toBe('SUBMITTED');
  });

  it('AC-11-85, C118 the pre-work surveys this phone submitted on the project, by their ROE numbers, for a post-work survey’s ROEs; and the ROEs it submitted, for a survey to offer', async () => {
    const { forms } = await phone();
    const survey = async (workTypeId: string, roeNumber: string, submitted = true) => {
      const made = await forms.begin(
        begun({ kind: 'SURVEY', formDefinitionId: null, start: { workTypeId, roeNumber } }),
      );
      if (submitted) await forms.submit(made.id, null);
    };
    await survey(preWork, 'R-0007');
    await survey(postWork, 'R-0008');
    await survey(preWork, 'R-0009', false);
    expect(forms.preWorkHere(p1.id, lists)).toEqual(['R-0007']);
    // The ROEs submitted here, offered by a survey before the server has them; a cancelled one not.
    const roe = async (number: string, address: string, submitted = true) => {
      const made = await forms.begin(
        begun({ kind: 'ROE', start: { address }, roe: { number, from: 'MADE' } }),
      );
      if (submitted) await forms.submit(made.id, null);
      else await forms.cancel(made.id);
    };
    await roe('R-0001', '412 Cedar Ct');
    await roe('R-0002', '416 Cedar Ct', false);
    expect(forms.roesHere(p1.id)).toEqual([
      { roeNumber: 'R-0001', address: '412 Cedar Ct', preWorkSurveyDone: false },
    ]);
    expect(forms.preWorkHere('0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d99', lists)).toEqual([]);
  });
});

// Certifying on the phone (src/phone/certifications.ts; BACKLOG 3.5.5, C118, C127, C129;
// REQ-322; ADR-015, 045, 076, 179, 294, 320, 469, 477, 585): a certification opened under the next
// number of the phone's cert-number block, marked used at once, or the pre-printed sheet's own;
// kept in the store across a restart; cancelled kept unsent, keeping its number; its capacity
// worked out by the domain's `Capacity`, never kept or sent; submitted sealed in the outbox as the
// record the contract carries, its boxes each with the measurements its shape holds and `null` for
// the rest, a crew's none; its five views after it, one photograph each; a submit cut short
// finished on opening again. Here over a store in memory; through the screens against the real
// API, e2e/certify.e2e.ts.
import type { PhoneAssignmentAnswer, PhoneListsRecord } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import {
  capacityOf,
  emptyBox,
  PhoneCertifications,
  sentBox,
  type CertificationBegun,
} from '../src/phone/certifications.ts';
import { PhoneLists } from '../src/phone/lists.ts';
import type { MonitorOnPhone } from '../src/phone/monitor.ts';
import { PhoneOutbox } from '../src/phone/outbox.ts';
import type { Json } from '../src/store/phone-store.ts';
import { noLists } from './checks.ts';
import { HeldStore } from './held.ts';
import { ana, kim, marshRoad, p1 } from './phone-world.ts';

const kimsDay: PhoneAssignmentAnswer = {
  id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d61',
  workDate: '2026-10-19',
  project: p1,
  fieldEventKinds: ['DISPOSAL'],
  certifying: true,
  formDocumentTypes: [],
  site: { id: marshRoad.id, name: marshRoad.name },
};
const coastline = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d62';
const trailer = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d63';
const sideboards = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d64';
const bucketTruck = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d65';
const lee = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d66';
const held730416 = '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d67';
const lists: PhoneListsRecord = {
  ...noLists,
  numbering: { ticketNumberSource: 'GENERATED', series: ['LOAD', 'CERTIFICATION'] },
  blocks: [
    {
      series: 'CERTIFICATION',
      firstNumber: 730515,
      lastNumber: 730614,
      lastUsedNumber: null,
      status: 'ISSUED',
    },
  ],
  certifications: [
    {
      id: held730416,
      certNumber: '730416',
      kind: 'CONTAINER',
      capacityCy: 48,
      prime: { id: coastline, name: 'Coastline Haulers LLC' },
      firstTierSub: null,
      secondTierSub: null,
    },
  ],
  vehicleTypes: [{ id: trailer, name: 'Hydraulic Dump Trailer', kind: 'CONTAINER' }],
  vehicleFeatures: [{ id: sideboards, name: 'Sideboards' }],
  crewTypes: [{ id: bucketTruck, name: 'Bucket Truck' }],
  primes: [{ id: coastline, name: 'Coastline Haulers LLC', subs: [] }],
  helpers: [{ id: lee, name: 'Lee Morgan' }],
};

// A phone holding Kim's lists, its outbox and its certifications over one store, on a clock the
// test moves.
async function phone(store = new HeldStore()) {
  const clock = { now: new Date('2026-10-19T15:50:00Z') };
  const now = () => clock.now;
  if ((await store.read('lists', 'assignment')) === undefined) {
    await store.change([
      {
        shelf: 'lists',
        id: 'assignment',
        value: {
          assignment: kimsDay,
          noAssignment: null,
          lists,
          monitorId: kim.id,
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
  const certifications = await PhoneCertifications.opened(store, held, outbox, {
    photoBytesAtMost: 33_554_432,
    now,
  });
  return { store, clock, lists: held, outbox, certifications };
}

const begun = (
  number: CertificationBegun['number'] = { certNumber: '730515', from: 'MADE' },
): CertificationBegun => ({
  monitorId: kim.id,
  projectId: p1.id,
  timeZone: p1.timeZone,
  assignmentId: kimsDay.id,
  step: 'kind',
  number,
});

// 730415's boxes, as the golden mission measures them: 65 CY.
const boxes730415 = [
  { ...emptyBox, length: 360, width: 96, height: 72 },
  { ...emptyBox, featureId: sideboards, length: 360, width: 96, height: 16 },
];

const view = (fill: number) =>
  Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, fill, 6, 7, 8]);

describe('a certification’s number', () => {
  it('AC-11-42, REQ-322 is the next of the phone’s cert-number block, marked used at once: never made again, and reported at the next sync', async () => {
    const { certifications, lists: held } = await phone();
    expect(await certifications.nextCertNumber()).toBe('730515');
    const made = await certifications.begin(begun());
    expect([made.certNumber, made.numberFrom, made.state]).toEqual(['730515', 'MADE', 'OPEN']);
    expect(await certifications.nextCertNumber()).toBe('730516');
    expect(await held.lastUsed()).toContainEqual(
      expect.objectContaining({ series: 'CERTIFICATION', lastUsedNumber: 730515 }),
    );
    // A pre-printed sheet's own takes none of the block's (Q-142).
    const sheet = await certifications.begin(begun({ certNumber: '88120', from: 'TYPED' }));
    expect([sheet.certNumber, sheet.numberFrom]).toEqual(['88120', 'TYPED']);
    expect(await certifications.nextCertNumber()).toBe('730516');
  });

  it('is none where the phone holds no cert-number block: the sheet’s is typed', async () => {
    const store = new HeldStore();
    await store.change([
      {
        shelf: 'lists',
        id: 'assignment',
        value: {
          assignment: kimsDay,
          noAssignment: null,
          lists: { ...lists, blocks: [] },
          monitorId: kim.id,
          readAt: '2026-10-19T11:00:00.000Z',
        } as unknown as Json,
      },
    ]);
    const { certifications } = await phone(store);
    expect(await certifications.nextCertNumber()).toBeNull();
  });

  it('cancelled, stays on the phone, unsent, keeping its number: the next is never it', async () => {
    const { certifications, outbox } = await phone();
    const made = await certifications.begin(begun());
    await certifications.cancel(made.id);
    expect([
      outbox.waiting(),
      certifications.openOf(kim.id),
      await certifications.nextCertNumber(),
    ]).toEqual([0, [], '730516']);
    await expect(certifications.changed(made.id, { notes: 'later' })).rejects.toThrow(
      'Only an open certification changes',
    );
  });
});

describe('a certification', () => {
  it('is kept where its monitor left it, read again by a phone opened afresh; another monitor never sees it', async () => {
    const { certifications, store } = await phone();
    const made = await certifications.begin(begun());
    await certifications.changed(made.id, { kind: 'CONTAINER', primeId: coastline, step: 'subs' });
    const again = await phone(store);
    expect(
      again.certifications.openOf(kim.id).map(({ id, step, primeId }) => [id, step, primeId]),
    ).toEqual([[made.id, 'subs', coastline]]);
    expect(again.certifications.openOf(ana.id)).toEqual([]);
  });

  it('AC-11-42 has its capacity worked out by the domain’s Capacity from its boxes, never kept: 730415’s boxes are 65 CY; a crew has none', () => {
    expect(capacityOf({ kind: 'CONTAINER', boxes: boxes730415 })).toMatchObject({
      capacityCy: 65,
      cubicYards: '65.19',
      refusal: null,
    });
    expect(capacityOf({ kind: 'CONTAINER', boxes: [] }).refusal?.code).toBe('NO_PRIMARY_BOX');
    expect(capacityOf({ kind: 'CREW', boxes: boxes730415 })).toMatchObject({
      capacityCy: null,
      refusal: null,
    });
  });

  it('C129 sends each box with the measurements its shape holds and null for the rest, whatever an earlier shape left typed', () => {
    expect(
      sentBox({
        ...emptyBox,
        featureId: sideboards,
        shape: 'ROUND_BOTTOM',
        length: 240,
        width: 90,
        height: 12,
        diameter: 90,
        corners: 2,
      }),
    ).toEqual({
      ...emptyBox,
      featureId: sideboards,
      shape: 'ROUND_BOTTOM',
      length: 240,
      diameter: 90,
    });
  });

  it('AC-11-42, AC-03-36, REQ-322, C129 is sealed in the outbox as the record the contract carries: the boxes, never a capacity; the helper picked; its five views after it, one photograph each, a view taken again sending the last alone; the phone changes it no more', async () => {
    const { certifications, outbox, clock } = await phone();
    const made = await certifications.begin(begun());
    await certifications.changed(made.id, {
      kind: 'CONTAINER',
      primeId: coastline,
      firstTierSub: '  Rivera   Trucking ',
      vehicleTypeId: trailer,
      boxes: [boxes730415[0] ?? emptyBox, { ...(boxes730415[1] ?? emptyBox), diameter: 40 }],
      driverName: 'Marco Rivera',
      tagNumber: 'RVT 4821',
      tagExpiry: '2027-03-31',
      helperIds: [lee],
      contractorRepresentativeName: 'Marco Rivera',
    });
    const taken: string[] = [];
    for (const [fill, one] of [
      'OPERATOR_WITH_PLACARD',
      'INTERIOR_OR_BACK',
      'RIGHT',
      'LEFT',
      'FRONT',
    ].entries()) {
      const photo = await certifications.photographed(made.id, one as 'FRONT', view(fill), null);
      taken.push(photo?.id ?? '');
    }
    // The left side taken again: the first is let go, never sent.
    const left = await certifications.photographed(made.id, 'LEFT', view(9), null);
    expect(certifications.certification(made.id)?.photos).toHaveLength(5);
    clock.now = new Date('2026-10-19T16:20:00Z');
    expect(await certifications.submit(made.id)).toMatchObject({ kind: 'sealed' });
    const sent = outbox.sends();
    expect(sent.records).toEqual([
      {
        record: 'CERTIFICATION',
        certification: {
          id: made.id,
          projectId: p1.id,
          certNumber: '730515',
          kind: 'CONTAINER',
          primeId: coastline,
          firstTierSub: 'Rivera Trucking',
          secondTierSub: null,
          vehicleTypeId: trailer,
          vehicleTypeOther: null,
          crewTypeId: null,
          boxes: [
            { ...emptyBox, length: 360, width: 96, height: 72 },
            { ...emptyBox, featureId: sideboards, length: 360, width: 96, height: 16 },
          ],
          driverName: 'Marco Rivera',
          driverPhone: null,
          driverLicenceNumber: null,
          driverLicenceState: null,
          driverLicenceExpiry: null,
          tagNumber: 'RVT 4821',
          tagState: null,
          tagExpiry: '2027-03-31',
          // When it was begun.
          certifiedAt: '2026-10-19T15:50:00.000Z',
          deviceUtcOffsetMinutes: made.offset,
          certifiedById: kim.id,
          assignmentId: kimsDay.id,
          helperIds: [lee],
          clientRepresentativeName: null,
          contractorRepresentativeName: 'Marco Rivera',
          replaces: null,
          notes: null,
        },
      },
    ]);
    expect(JSON.stringify(sent.records)).not.toMatch(/capacity/i);
    expect(sent.photos.map(({ id, owner, view: one }) => [id, owner.kind, owner.id, one])).toEqual([
      [taken[0], 'CERTIFICATION', made.id, 'OPERATOR_WITH_PLACARD'],
      [taken[1], 'CERTIFICATION', made.id, 'INTERIOR_OR_BACK'],
      [taken[2], 'CERTIFICATION', made.id, 'RIGHT'],
      [taken[4], 'CERTIFICATION', made.id, 'FRONT'],
      [left?.id, 'CERTIFICATION', made.id, 'LEFT'],
    ]);
    expect(certifications.certification(made.id)?.state).toBe('SUBMITTED');
    await expect(certifications.changed(made.id, { notes: 'later' })).rejects.toThrow(
      'Only an open certification changes',
    );
  });

  it('of a crew sends no box and its crew type: a crew is never measured', async () => {
    const { certifications, outbox } = await phone();
    const made = await certifications.begin(begun());
    await certifications.changed(made.id, {
      kind: 'CREW',
      primeId: coastline,
      crewTypeId: bucketTruck,
      // Boxes typed before it was marked a crew go nowhere.
      boxes: boxes730415,
    });
    await certifications.submit(made.id);
    expect(outbox.sends().records[0]).toMatchObject({
      record: 'CERTIFICATION',
      certification: { kind: 'CREW', crewTypeId: bucketTruck, boxes: [] },
    });
  });

  it('a modified truck’s names the certification it replaces, and why, offered from the lists and from those this phone submitted', async () => {
    const { certifications, outbox } = await phone();
    const first = await certifications.begin(begun());
    await certifications.changed(first.id, { kind: 'CONTAINER', primeId: coastline });
    await certifications.submit(first.id);
    expect(certifications.replaceable(p1.id, lists).map(({ certNumber }) => certNumber)).toEqual([
      '730416',
      '730515',
    ]);
    const second = await certifications.begin(begun({ certNumber: '730516', from: 'MADE' }));
    await certifications.changed(second.id, {
      kind: 'CONTAINER',
      primeId: coastline,
      replaces: { replacedId: held730416, reason: 'Sideboards added' },
    });
    await certifications.submit(second.id);
    expect(outbox.sends().records[1]).toMatchObject({
      certification: { replaces: { replacedId: held730416, reason: 'Sideboards added' } },
    });
  });

  it('C127 one the contract doesn’t take is not sealed: it stays open, and the contract’s words are said', async () => {
    const { certifications, outbox } = await phone();
    const made = await certifications.begin(begun());
    // No prime picked yet.
    await certifications.changed(made.id, { kind: 'CONTAINER' });
    expect(await certifications.submit(made.id)).toMatchObject({ kind: 'notKept' });
    expect([certifications.certification(made.id)?.state, outbox.waiting()]).toEqual(['OPEN', 0]);
  });

  it('a submit cut short is finished when the phone opens again: the record kept once, its photograph with it', async () => {
    const { certifications, store, outbox } = await phone();
    const made = await certifications.begin(begun());
    const opened = await certifications.changed(made.id, {
      kind: 'CONTAINER',
      primeId: coastline,
    });
    await certifications.photographed(made.id, 'FRONT', view(1), null);
    await outbox.keep(PhoneCertifications.record(opened));
    const again = await phone(store);
    const sent = again.outbox.sends();
    expect([sent.records.length, sent.photos.map(({ view: one }) => one)]).toEqual([1, ['FRONT']]);
    expect(again.certifications.certification(made.id)?.state).toBe('SUBMITTED');
  });
});

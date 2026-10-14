// The harness's phone is a client of the sync contract: it passes the suite any client must
// (packages/contracts, `syncClientSuite`; ARCHITECTURE §9; BACKLOG 2.6.1 part 4, 2.6.2 part 4;
// ADR-470, 475; REQ-203), with no database. And what it sends and takes in besides its records
// when it syncs through the API's own `Sync`: never which phone it is, the last number it used
// of each series it holds, the master passcode's version, and the project its lists are of.
import { createHash } from 'node:crypto';

import {
  syncClientSuite,
  syncExamples,
  syncSentSchema,
  type FilePartSent,
  type SyncAnswered,
  type SyncClientHolds,
  type SyncReceived,
} from '@open-adms/contracts';
import { sentFingerprint } from '@open-adms/api';
import { describe, expect, it } from 'vitest';

import { StoryClock } from '../src/clock.ts';
import { SimulatedDevice, ToldToWait, type PhoneLists, type PhoneServer } from '../src/device.ts';

const lists: PhoneLists = {
  setupVersion: 3,
  blocks: [],
  debrisTypes: {},
  fieldTags: [],
  typedNumberReasons: [],
  payItems: [],
  itemNames: [],
  incidentTypes: [],
  incidentOffers: [],
  contractors: [],
  surveyWorkTypes: [],
};
const deviceId = syncExamples.made('97');
// The tower's phone at 17:30 on Monday, holding what the suite hands it; on a clock of its own
// where one is given.
const phone = (
  holds?: SyncClientHolds,
  holding: PhoneLists = lists,
  clock = new StoryClock('2026-10-12T17:30:00-04:00'),
): SimulatedDevice => {
  const made = new SimulatedDevice(
    {
      name: 'P1-TWR-TDSR',
      deviceId,
      monitorId: syncExamples.kim,
      assignmentId: syncExamples.assignment,
      projectId: syncExamples.p1,
      siteId: syncExamples.landfill,
      lists: holding,
      timeZone: 'America/New_York',
    },
    clock,
  );
  if (holds !== undefined) made.hold(holds);
  return made;
};

describe('the harness’s phone, held to the suite any client of the sync contract must pass', () => {
  for (const check of syncClientSuite) {
    it(check.name, async () => {
      await check.run((holds) => {
        const client = phone(holds);
        return {
          sends: () => client.sends(),
          answered: (answer) => {
            client.answered(answer);
          },
          holds: () => client.holds,
          notSaved: () => client.shownNotSaved,
          sendsFilePart: () => client.sendsFilePart(),
          filePartAnswered: (answer) => {
            client.filePartAnswered(answer);
          },
          holdsFiles: () => client.holdsFiles,
          turnsIn: (passcode) => client.turnsIn(passcode),
          turnInAnswered: (answer) => {
            client.turnInAnswered(answer);
          },
          wiped: () => client.wiped,
        };
      });
    });
  }

  it('AC-10-36 its sync states the phone’s own clock as a UTC instant and how far that clock stood from UTC', () => {
    const sync = phone().sends();
    expect([sync.clockAt, sync.deviceUtcOffsetMinutes]).toEqual(['2026-10-12T21:30:00.000Z', -240]);
    expect(syncSentSchema.safeParse(sync).success).toBe(true);
  });
});

describe('the harness’s phone, syncing through the API’s own service', () => {
  const records: SyncClientHolds = {
    unplannedAssignments: [],
    passcodeUses: [],
    records: syncExamples.records.filter((record) => record.record === 'FIELD_EVENT'),
    photos: [],
    lastUsed: [],
    files: [],
    filePartBytesAtMost: 1000,
  };
  // A server in memory that answers every record "saved" and keeps each sync it was sent, as
  // the endpoint's boundary read it, with the phone its proof named.
  const server = (brings: Partial<SyncAnswered> = {}) => {
    const syncs: { deviceId: string; sent: SyncReceived }[] = [];
    const made: PhoneServer = {
      received: (from, sent) => {
        syncs.push({ deviceId: from, sent });
        return Promise.resolve({
          answered: {
            unplannedAssignments: [],
            passcodeUses: [],
            records: sent.records.map((one) => ({
              answer: 'SAVED' as const,
              id: (one as { fieldEvent: { id: string } }).fieldEvent.id,
              notes: [],
            })),
            photos: [],
            numbers: [],
            masterPasscode: { version: 1, check: null },
            setupVersion: null,
            ...brings,
          },
        });
      },
      filePart: () => Promise.reject(new Error('No file is sent here.')),
    };
    return { made, syncs };
  };

  it('ADR-488 "Sync and turn in": it syncs and sends its files first, then names by the API’s own fingerprint a record answered under no id, and wipes only when answered to; with a server that turns no phone in, it stops', async () => {
    const first = { record: 'FIELD_EVENT' as const, fieldEvent: syncExamples.collection };
    const second = { record: 'FIELD_EVENT' as const, fieldEvent: syncExamples.disposal };
    const client = phone({ ...records, records: [first, second] });
    const turnIns: unknown[] = [];
    const answers: unknown[] = [
      {
        turnedIn: false,
        wipe: false,
        message: 'Not turned in.',
        notOnTheServer: {
          unplannedAssignments: [],
          passcodeUses: [],
          records: [],
          held: [],
          photos: [],
        },
      },
      { turnedIn: true, wipe: true, numbers: [] },
    ];
    const made: PhoneServer = {
      received: (_from, sent) =>
        Promise.resolve({
          answered: {
            unplannedAssignments: [],
            passcodeUses: [],
            // The second can't be read, the server says: under no id.
            records: sent.records.map((one, place) =>
              place === 0
                ? {
                    answer: 'SAVED' as const,
                    id: (one as { fieldEvent: { id: string } }).fieldEvent.id,
                    notes: [],
                  }
                : {
                    answer: 'NOT_SAVED' as const,
                    id: null,
                    reason: 'NOT_A_RECORD' as const,
                    message: 'Not saved: this record can’t be read.',
                  },
            ),
            photos: [],
            numbers: [],
            masterPasscode: { version: 1, check: null },
            setupVersion: null,
          },
        }),
      filePart: () => Promise.reject(new Error('No file is sent here.')),
      turnIn: (from, sent) => {
        expect(from).toBe(deviceId);
        turnIns.push(sent);
        return Promise.resolve(answers.shift());
      },
    };
    expect(await client.turnIn(made, 'osprey-landing-marsh')).toMatchObject({ turnedIn: false });
    expect(client.wiped).toBe(false);
    expect(turnIns[0]).toMatchObject({
      passcode: 'osprey-landing-marsh',
      holds: { records: [], held: [sentFingerprint(second)] },
    });
    expect(client.holds).toHaveLength(1);
    expect(await client.turnIn(made, 'osprey-landing-marsh')).toEqual({
      turnedIn: true,
      wipe: true,
      numbers: [],
    });
    expect([client.wiped, client.holds, client.shownNotSaved]).toEqual([true, [], []]);
    await expect(phone().turnIn(server().made, 'osprey-landing-marsh')).rejects.toThrow(
      'P1-TWR-TDSR: this server turns no phone in.',
    );
  });

  it('AC-05-09, ADR-483 each photograph it takes is a real file, the depth file beside it where one is taken; the record carries the SHA-256 of the very bytes it sends, after the sync that saved the record, in parts no larger than it was told', async () => {
    const client = phone({ ...records, records: [], filePartBytesAtMost: 1500 });
    const [first] = records.records;
    if (first?.record !== 'FIELD_EVENT') throw new Error('The examples have no field event.');
    const pile = client.photograph({ of: { kind: 'FIELD_EVENT', id: first.fieldEvent.id } });
    const bed = client.photograph({
      of: { kind: 'FIELD_EVENT', id: first.fieldEvent.id },
      depthFile: true,
      bytes: 2000,
    });
    const sha256Of = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    const parts: FilePartSent[] = [];
    const kept = new Map<string, Buffer>();
    const made: PhoneServer = {
      received: (_from, sent) =>
        Promise.resolve({
          answered: {
            unplannedAssignments: [],
            passcodeUses: [],
            records: [],
            photos: sent.photos.map((one) => ({
              answer: 'SAVED' as const,
              id: (one as { id: string }).id,
              notes: [],
            })),
            numbers: [],
            masterPasscode: { version: 1, check: null },
            setupVersion: null,
          },
        }),
      filePart: (from, part) => {
        expect(from).toBe(deviceId);
        expect(client.waitingPhotos).toEqual([]);
        parts.push(part);
        const name = `${part.photoId} ${part.file}`;
        const now = Buffer.concat([kept.get(name) ?? Buffer.alloc(0), part.bytes]);
        kept.set(name, now);
        return Promise.resolve(
          now.length === part.length
            ? { upload: 'KEPT' }
            : { upload: 'RECEIVING', received: now.length, length: part.length },
        );
      },
    };
    expect(client.holdsFiles).toEqual([`${pile.id} photo`, `${bed.id} photo`, `${bed.id} depth`]);
    expect(await client.sync(made)).toBe(2);
    expect(client.holdsFiles).toEqual([]);
    expect(
      parts.map(({ file, offset, length, bytes }) => [file, offset, length, bytes.length]),
    ).toEqual([
      ['photo', 0, 4096, 1500],
      ['photo', 1500, 4096, 1500],
      ['photo', 3000, 4096, 1096],
      ['photo', 0, 2000, 1500],
      ['photo', 1500, 2000, 500],
      ['depth', 0, 1024, 1024],
    ]);
    expect([
      sha256Of(kept.get(`${pile.id} photo`) ?? Buffer.alloc(0)),
      sha256Of(kept.get(`${bed.id} photo`) ?? Buffer.alloc(0)),
      sha256Of(kept.get(`${bed.id} depth`) ?? Buffer.alloc(0)),
    ]).toEqual([pile.uploadedSha256, bed.uploadedSha256, bed.depthSha256]);
    // A JPEG by its first bytes, the depth file a PNG; never the fingerprint of the original.
    expect([...(kept.get(`${pile.id} photo`) ?? Buffer.alloc(0)).subarray(0, 3)]).toEqual([
      0xff, 0xd8, 0xff,
    ]);
    expect([...(kept.get(`${bed.id} depth`) ?? Buffer.alloc(0)).subarray(0, 4)]).toEqual([
      0x89, 0x50, 0x4e, 0x47,
    ]);
    expect(pile.originalSha256).not.toBe(pile.uploadedSha256);
  });

  it('AC-10-35 what it sends never says which phone it is or that a phone made it: the server is told the phone by its proof', async () => {
    const client = phone(records);
    const wire = JSON.stringify(client.sends());
    expect(wire).not.toContain(deviceId);
    expect(wire).not.toContain('"source"');
    const { made, syncs } = server();
    expect(await client.sync(made)).toBe(records.records.length);
    expect(syncs.map((each) => each.deviceId)).toEqual([deviceId]);
    expect(client.waitingRecords).toEqual([]);
  });

  it('AC-05-51, ADR-505 told to wait (429 LIMITED), it waits the seconds it was told on the story’s clock and sends the same sync, then the same part, again under the same ids; told again and again, it stops holding everything', async () => {
    const clock = new StoryClock('2026-10-15T18:00:00-04:00');
    const client = phone({ ...records, filePartBytesAtMost: 4096 }, lists, clock);
    const [first] = records.records;
    if (first?.record !== 'FIELD_EVENT') throw new Error('The examples have no field event.');
    const photo = client.photograph({ of: { kind: 'FIELD_EVENT', id: first.fieldEvent.id } });
    const idOf = (one: unknown) => (one as { fieldEvent: { id: string } }).fieldEvent.id;
    const syncs: { at: string; records: string[]; photos: unknown[] }[] = [];
    const parts: string[] = [];
    const told = { syncs: 1, parts: 1 };
    const made: PhoneServer = {
      received: (_from, sent) => {
        syncs.push({
          at: clock.now().toISOString(),
          records: sent.records.map(idOf),
          photos: sent.photos.map((one) => (one as { id: string }).id),
        });
        if (told.syncs-- > 0) return Promise.reject(new ToldToWait(42));
        return Promise.resolve({
          answered: {
            unplannedAssignments: [],
            passcodeUses: [],
            records: sent.records.map((one) => ({
              answer: 'SAVED' as const,
              id: idOf(one),
              notes: [],
            })),
            photos: sent.photos.map((one) => ({
              answer: 'SAVED' as const,
              id: (one as { id: string }).id,
              notes: [],
            })),
            numbers: [],
            masterPasscode: { version: 1, check: null },
            setupVersion: null,
          },
        });
      },
      filePart: (_from, part) => {
        parts.push(`${clock.now().toISOString()} ${part.photoId} ${String(part.offset)}`);
        if (told.parts-- > 0) return Promise.reject(new ToldToWait(7));
        return Promise.resolve({ upload: 'KEPT' });
      },
    };
    const ids = records.records.map((one) => idOf(one));
    expect(await client.sync(made)).toBe(ids.length + 1);
    expect(syncs).toEqual([
      { at: '2026-10-15T22:00:00.000Z', records: ids, photos: [photo.id] },
      { at: '2026-10-15T22:00:42.000Z', records: ids, photos: [photo.id] },
    ]);
    expect(parts).toEqual([
      `2026-10-15T22:00:42.000Z ${photo.id} 0`,
      `2026-10-15T22:00:49.000Z ${photo.id} 0`,
    ]);
    expect([client.toldToWait, client.holds, client.holdsFiles]).toEqual([[42, 7], [], []]);

    // A server that only ever says to wait: the phone stops after ten waits in a row, holding
    // all it held.
    const held = phone(records, lists, new StoryClock('2026-10-15T18:00:00-04:00'));
    await expect(
      held.sync({
        received: () => Promise.reject(new ToldToWait(1)),
        filePart: () => Promise.reject(new Error('No file is sent here.')),
      }),
    ).rejects.toThrow('was told to wait 11 times in a row');
    expect([held.toldToWait.length, held.waitingRecords.length]).toEqual([10, ids.length]);
  });

  it('AC-05-47 it reports the last number it used of each series it holds a block of, and holds the blocks a sync answers from then on', async () => {
    const block = { firstNumber: 101001, lastNumber: 102000, lastUsedNumber: null } as const;
    const client = phone(records, {
      ...lists,
      blocks: [{ ...block, series: 'LOAD', status: 'ISSUED' }],
    });
    client.passOver('LOAD', 101022);
    const load = { projectId: syncExamples.p1, series: 'LOAD' } as const;
    const { made, syncs } = server({
      numbers: [
        {
          ...load,
          toppedUp: true,
          blocks: [
            { ...block, lastUsedNumber: 101022 },
            { firstNumber: 102001, lastNumber: 102022, lastUsedNumber: null },
          ],
        },
      ],
    });
    await client.sync(made);
    expect(syncs.map((each) => each.sent.lastUsed)).toEqual([
      [{ ...load, lastUsedNumber: 101022 }],
    ]);
    expect(client.blocks.map((each) => [each.series, each.firstNumber, each.lastNumber])).toEqual([
      ['LOAD', 101001, 102000],
      ['LOAD', 102001, 102022],
    ]);
    expect(client.nextNumber('LOAD')).toBe(101023);
    // A series whose report wasn't taken: it holds what it held.
    const tower = phone(records, {
      ...lists,
      blocks: [{ ...block, series: 'LOAD', status: 'ISSUED' }],
    });
    await tower.sync(server({ numbers: [{ ...load, toppedUp: false, blocks: [] }] }).made);
    expect(tower.blocks.map((each) => [each.firstNumber, each.lastNumber])).toEqual([
      [101001, 102000],
    ]);
  });

  it('AC-02-23, AC-05-48 it says which version of the master passcode’s check it holds and the project its lists are of, and takes in the version and the setup version a sync brings', async () => {
    const client = phone(records);
    const first = client.sends();
    expect(first.holds).toEqual({ masterPasscodeVersion: null, listsProjectId: syncExamples.p1 });
    const { made } = server({
      masterPasscode: { version: 2, check: null },
      setupVersion: { projectId: syncExamples.p1, version: lists.setupVersion + 1 },
    });
    client.answered(undefined);
    expect([client.masterPasscodeVersion, client.listsStale]).toEqual([null, false]);
    await client.sync(made);
    expect([client.masterPasscodeVersion, client.listsStale]).toEqual([2, true]);
    client.hold(records);
    expect(client.sends().holds.masterPasscodeVersion).toBe(2);
  });
});

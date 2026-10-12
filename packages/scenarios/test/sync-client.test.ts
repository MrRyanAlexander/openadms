// The harness's phone is a client of the sync contract: it passes the suite any client must
// (packages/contracts, `syncClientSuite`; ARCHITECTURE §9; BACKLOG 2.6.1 part 4, 2.6.2 part 4;
// ADR-470, 475; REQ-203), with no database. And what it sends and takes in besides its records
// when it syncs through the API's own `Sync`: never which phone it is, the last number it used
// of each series it holds, the master passcode's version, and the project its lists are of.
import {
  syncClientSuite,
  syncExamples,
  syncSentSchema,
  type SyncAnswered,
  type SyncClientHolds,
  type SyncReceived,
} from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { StoryClock } from '../src/clock.ts';
import { SimulatedDevice, type PhoneLists, type PhoneServer } from '../src/device.ts';

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
// The tower's phone at 17:30 on Monday, holding what the suite hands it.
const phone = (holds?: SyncClientHolds, holding: PhoneLists = lists): SimulatedDevice => {
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
    new StoryClock('2026-10-12T17:30:00-04:00'),
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
    };
    return { made, syncs };
  };

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

// The harness's phone is a client of the sync contract: it passes the suite any client must
// (packages/contracts, `syncClientSuite`; ARCHITECTURE §9; BACKLOG 2.6.1 part 4; ADR-470;
// REQ-203), with no database. And what stands where the endpoint will reads what the phone
// sends by the contract, and says of each record what a phone never says.
import type { SyncAnswer } from '@open-adms/api';
import {
  syncClientSuite,
  syncExamples,
  syncSentSchema,
  type SyncClientHolds,
} from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { StoryClock } from '../src/clock.ts';
import {
  forIntake,
  heldId,
  SimulatedDevice,
  type PhoneLists,
  type PhoneRecord,
} from '../src/device.ts';
import { SyncStandIn } from '../src/sync-stand-in.ts';

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
const phone = (holds?: SyncClientHolds): SimulatedDevice => {
  const made = new SimulatedDevice(
    {
      name: 'P1-TWR-TDSR',
      deviceId,
      monitorId: syncExamples.kim,
      assignmentId: syncExamples.assignment,
      projectId: syncExamples.p1,
      siteId: syncExamples.landfill,
      lists,
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

describe('what stands where the sync endpoint will', () => {
  const holds: SyncClientHolds = {
    unplannedAssignments: [],
    passcodeUses: [],
    records: syncExamples.records.filter((record) => record.record !== 'CERTIFICATION'),
    lastUsed: [],
  };

  it('AC-10-35 reads each record off the wire by the contract and says what a phone never says: that a phone made it, and which', async () => {
    const client = phone(holds);
    const taken: PhoneRecord[] = [];
    const intake = {
      receive: (record: PhoneRecord): Promise<SyncAnswer> => {
        taken.push(record);
        return Promise.resolve({ answer: 'SAVED', id: heldId(record), notes: [] });
      },
    };
    const sync: unknown = JSON.parse(JSON.stringify(client.sends()));
    expect(JSON.stringify(sync)).not.toContain(deviceId);
    expect(JSON.stringify(sync)).not.toContain('"source"');
    const answer = await new SyncStandIn(intake).answered(deviceId, sync);
    expect(answer.records.map((each) => each.answer)).toEqual(holds.records.map(() => 'SAVED'));
    expect(taken).toEqual(client.waitingRecords.map(forIntake));
    const [first] = taken;
    if (first?.record !== 'FIELD_EVENT') throw new Error('No field event.');
    expect([first.fieldEvent.source, first.fieldEvent.deviceId, first.fieldEvent.endedAt]).toEqual([
      'DEVICE',
      deviceId,
      new Date('2026-10-12T13:40:00Z'),
    ]);
  });

  it('AC-05-45 a record that isn’t one is answered "not saved" in its place, and the records sent with it reach intake', async () => {
    const [first, second] = syncExamples.records;
    const intake = {
      receive: (record: PhoneRecord): Promise<SyncAnswer> =>
        Promise.resolve({ answer: 'SAVED', id: heldId(record), notes: [] }),
    };
    const sync = {
      ...phone().sends(),
      records: [first, { record: 'COMPLETED_LOAD', load: { id: syncExamples.made('9') } }, second],
    };
    const answer = await new SyncStandIn(intake).answered(deviceId, sync);
    expect(answer.records.map((each) => [each.answer, each.id])).toEqual([
      ['SAVED', syncExamples.made('1')],
      ['NOT_SAVED', syncExamples.made('9')],
      ['SAVED', syncExamples.made('3')],
    ]);
  });

  it('C128 a sync that isn’t one is refused whole, and a certification goes only where one was named to receive it', async () => {
    const intake = { receive: () => Promise.reject(new Error('Never asked.')) };
    const standIn = new SyncStandIn(intake);
    await expect(standIn.answered(deviceId, { records: [] })).rejects.toThrow();
    const certifying = phone({
      ...holds,
      records: [{ record: 'CERTIFICATION', certification: syncExamples.certification }],
    });
    await expect(standIn.answered(deviceId, certifying.sends())).rejects.toThrow(
      'nothing was named to receive it',
    );
    const received: string[] = [];
    const refused = new SyncStandIn(intake, {
      received: (sent) => {
        received.push(`${sent.certNumber} from ${sent.deviceId}`);
        return Promise.resolve({
          saved: false,
          refusal: {
            code: 'NO_CAPACITY',
            message: 'Not saved: these measurements give no capacity.',
          },
        });
      },
    });
    expect([await refused.answered(deviceId, certifying.sends()), received]).toEqual([
      {
        unplannedAssignments: [],
        passcodeUses: [],
        records: [
          {
            answer: 'NOT_SAVED',
            id: syncExamples.made('8'),
            reason: 'CERTIFICATION_REFUSED',
            message: 'Not saved: these measurements give no capacity.',
          },
        ],
        numbers: [],
        masterPasscode: { version: 1, check: null },
        setupVersion: null,
      },
      [`730416 from ${deviceId}`],
    ]);
  });
});

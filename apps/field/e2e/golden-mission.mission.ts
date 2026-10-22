// The golden mission through the field app (spec/golden/MISSION.md; PLAN item 3.10.1; ADR-603):
// every field event of the mission's phones captured on the field app's screens, as each of its
// monitors would, and synced through the real phone endpoints over HTTPS; the worker reconciles
// what each evening's syncs queued; Luis Ortega reviews; and what stands is read through the API:
// the statuses, the review queue and the ledger, against the outcomes the user approved (P1
// $5,548.25 on 19 lines; P2 $324.00), handed on from their one home with the mission's world.
//
// The mission's own world (e2e/mission-world.ts), never the run's other world: its numbers, its
// ledger and its clock are the mission's alone. What the mission makes in the back office (its
// setup, the board, the review) the world makes as the stories make it; every phone's work is the
// browser's. Eight phones, a browser context each, enrolled through their first screen on the
// Saturday; each morning at the yard their monitors sign in online and the phone takes the
// day's assignment; all day there is no signal; each evening at the yard they sync, but the
// Marsh Road tower's on Tuesday, whose battery is flat: Wednesday.
//
// Each step is the mission's, at the mission's time (America/New_York, Monday 12 and Tuesday 13
// October 2026). One thing the screens do their own way, said where it happens: the gap
// 201002…201003 in Sam's haul-out numbers is two haul-outs begun by mistake and cancelled, as a
// real phone leaves one.
import { test, expect } from './accessible.ts';
import { MissionPhone, type Place } from './mission-phone.ts';
import { MissionWorld, type MissionMonitorName } from './mission-world.ts';

const on = (day: string, time: string): string => `2026-10-${day}T${time}:00-04:00`;
const saturday = (time: string) => on('10', time);
const sunday = (time: string) => on('11', time);
const monday = (time: string) => on('12', time);
const tuesday = (time: string) => on('13', time);
const wednesday = (time: string) => on('14', time);

const p1 = 'Bayline County ROW, Hurricane Delphine';
const p2 = 'Bayline County PPDR, Hurricane Delphine';

// The example world's points (spec/CONVENTIONS.md §6).
const places = {
  heronSt: { latitude: 39.1385, longitude: -75.5537 },
  where101002: { latitude: 39.15, longitude: -75.52 },
  elmSt: { latitude: 39.15, longitude: -75.54 },
  birchLn: { latitude: 39.17, longitude: -75.69 },
  cedarCt412: { latitude: 39.12, longitude: -75.56 },
  cedarCt416: { latitude: 39.1202, longitude: -75.5603 },
  marshRoadTower: { latitude: 39.0903, longitude: -75.6202 },
  landfill: { latitude: 39.0, longitude: -75.58 },
  cypressCreek: { latitude: 39.24, longitude: -75.6 },
} as const satisfies Record<string, Place>;

// The mission's phones (golden mission §1), by name, each with its monitor.
const phoneNames = {
  'P1-COL-1': 'Ana Brooks',
  'P1-TWR-TDSR': 'Kim Nguyen',
  'P1-TWR-LF': 'Tariq Patel',
  'P1-HO-TDSR': 'Sam Grant',
  'P1-TWR-CCL': 'Lee Morgan',
  'P1-UR-1': 'Jo Kim',
  'P2-COL-1': 'Ana Brooks',
  'P2-TWR-TDSR': 'Kim Nguyen',
} as const satisfies Record<string, MissionMonitorName>;
type PhoneName = keyof typeof phoneNames;

let world: MissionWorld;
const phones = new Map<PhoneName, MissionPhone>();
const phone = (name: PhoneName): MissionPhone => {
  const found = phones.get(name);
  if (found === undefined) throw new Error(`${name} isn't enrolled.`);
  return found;
};
const monitorOf = (name: PhoneName) => world.cast[phoneNames[name]];

// At the yard each evening: each phone named syncs, its monitor signed in again with signal.
async function syncedAtTheYard(at: string, names: readonly PhoneName[]): Promise<void> {
  await world.at(at);
  for (const name of names) {
    await phone(name).at(at);
    await phone(name).syncedAtTheYard(monitorOf(name));
  }
}

// At the yard each morning: each phone named takes its monitor's assignment for the day, then
// goes out with no signal.
async function outForTheDay(
  at: string,
  names: readonly (readonly [PhoneName, number])[],
): Promise<void> {
  await world.at(at);
  for (const [name, firstBlocks] of names) {
    await phone(name).at(at);
    await phone(name).outForTheDay(monitorOf(name), name.startsWith('P1') ? p1 : p2, firstBlocks);
  }
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  world = await MissionWorld.opened();
});

// The phones put away, then the world closed and its process ended, so the stories' address is
// free before anything else runs there: its API's shutdown is waited out, never cut short.
test.afterAll(async () => {
  test.setTimeout(120_000);
  for (const each of phones.values()) await each.close();
  await world.close();
});

test('the golden mission §1: on Saturday at the yard its eight phones are enrolled through their first screen, online, under the master passcode; Luis writes the boards on Sunday', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  await world.at(saturday('12:00'));
  for (const name of Object.keys(phoneNames) as PhoneName[]) {
    phones.set(name, await MissionPhone.enrolled(browser, world, name, saturday('12:00')));
  }
  await world.at(sunday('18:00'));
  await world.boards();
});

test('AC-06-87, AC-04-47, AC-07-68: Monday on P1 and P2, captured on the phones’ screens with no signal and synced at the yard: 101001 and 101002 COMPLETED, 101003 in review for its 96% call, the preload 101004 waiting, three unit rate tickets COMPLETED: 7 lines, $1,530.00; P2’s split load 102001 COMPLETED, $324.00 on two lines', async () => {
  test.setTimeout(240_000);
  await outForTheDay(monday('06:30'), [
    ['P1-COL-1', 1],
    ['P1-TWR-TDSR', 0],
    ['P1-TWR-LF', 0],
    ['P1-UR-1', 1],
    ['P2-COL-1', 1],
    ['P2-TWR-TDSR', 0],
  ]);

  // Ana Brooks on P1-COL-1: four collections, each opened at New under the phone's next number.
  const ana = phone('P1-COL-1');
  await ana.placed(places.heronSt);
  expect(await ana.opened(monday('08:15'), 'collection', '730415')).toBe('101001');
  await ana.completed(
    monday('08:40'),
    { truck: '730415', number: '101001' },
    { debris: 'Vegetative', place: { typedAddress: '14 Heron St' } },
  );
  await ana.placed(places.where101002);
  expect(await ana.opened(monday('09:50'), 'collection', '730416')).toBe('101002');
  await ana.completed(
    monday('10:10'),
    { truck: '730416', number: '101002' },
    { debris: 'C&D', place: {} },
  );
  await ana.placed(places.heronSt);
  expect(await ana.opened(monday('11:12'), 'collection', '730415')).toBe('101003');
  await ana.completed(
    monday('11:30'),
    { truck: '730415', number: '101003' },
    { debris: 'Vegetative', place: {} },
  );
  await ana.placed(places.elmSt);
  expect(await ana.opened(monday('17:30'), 'collection', '730416')).toBe('101004');
  await ana.completed(
    monday('17:50'),
    { truck: '730416', number: '101004' },
    { debris: 'Vegetative', place: {} },
  );

  // Kim Nguyen at Marsh Road TDSR's tower: the badge, then the driver's ticket scanned.
  const kim = phone('P1-TWR-TDSR');
  await kim.placed(places.marshRoadTower);
  await kim.scanned(monday('09:05'), 'disposal', '730415', '101001');
  await kim.completed(
    monday('09:25'),
    { truck: '730415', number: '101001' },
    { debris: 'Vegetative', call: '80' },
  );
  await kim.scanned(monday('11:50'), 'disposal', '730415', '101003');
  await kim.completed(
    monday('12:05'),
    { truck: '730415', number: '101003' },
    { debris: 'Vegetative', call: '96' },
  );

  // Tariq Patel at Bayline County Landfill's tower.
  const tariq = phone('P1-TWR-LF');
  await tariq.placed(places.landfill);
  await tariq.scanned(monday('10:35'), 'disposal', '730416', '101002');
  await tariq.completed(
    monday('10:50'),
    { truck: '730416', number: '101002' },
    { debris: 'C&D', call: '75' },
  );

  // Jo Kim's unit rate work: the bucket truck crew's badge, then the working crew kept.
  const jo = phone('P1-UR-1');
  await jo.placed(places.heronSt);
  expect(
    await jo.unitRate(monday('09:40'), monday('09:55'), { scan: '730417' }, 'Hangers', {}),
  ).toBe('301001');
  expect(
    await jo.unitRate(monday('10:55'), monday('11:10'), { same: '730417' }, 'Leaners', {
      measured: { way: 'around', inches: '56.5' },
    }),
  ).toBe('301002');
  expect(
    await jo.unitRate(monday('13:00'), monday('13:10'), { same: '730417' }, 'Hangers', {}),
  ).toBe('301003');

  // P2: Ana on P2-COL-1 makes the ROEs from their signed papers, the surveys, and the split
  // load from 412 and 416 Cedar Ct; Kim on P2-TWR-TDSR calls it.
  const anaP2 = phone('P2-COL-1');
  await anaP2.placed(places.cedarCt412);
  await anaP2.roe(monday('13:05'), {
    number: 'R-0007',
    parcel: 'APN 14-0321-007',
    owner: 'Rosa Delgado',
    address: '412 Cedar Ct',
    signedDay: '2026-10-09',
  });
  await anaP2.survey(monday('13:10'), 'Pre-work survey', 'R-0007');
  expect(await anaP2.opened(monday('13:15'), 'collection', '730416', 'split')).toBe('102001');
  await anaP2.completed(
    monday('13:35'),
    { truck: '730416', number: '102001', suffix: 'A' },
    {
      debris: 'Vegetative',
      roe: 'R-0007',
      estimate: '12',
      place: { typedAddress: '412 Cedar Ct' },
      then: 'next',
    },
  );
  await anaP2.survey(monday('13:40'), 'Post-work survey', 'R-0007');
  await anaP2.placed(places.cedarCt416);
  await anaP2.roe(monday('13:45'), {
    number: 'R-0008',
    parcel: 'APN 14-0321-008',
    owner: 'Ben Whitaker',
    address: '416 Cedar Ct',
    signedDay: '2026-10-09',
  });
  await anaP2.survey(monday('13:50'), 'Pre-work survey', 'R-0008');
  await anaP2.completed(
    monday('14:05'),
    { truck: '730416', number: '102001', suffix: 'B' },
    {
      debris: 'Vegetative',
      roe: 'R-0008',
      estimate: '18',
      place: { typedAddress: '416 Cedar Ct' },
    },
  );
  await anaP2.survey(monday('14:10'), 'Post-work survey', 'R-0008');
  const kimP2 = phone('P2-TWR-TDSR');
  await kimP2.placed(places.marshRoadTower);
  await kimP2.scanned(monday('14:40'), 'disposal', '730416', '102001');
  await kimP2.completed(
    monday('14:55'),
    { truck: '730416', number: '102001' },
    { debris: 'Vegetative', call: '75' },
  );

  // Back at the yard: the tower's syncs first, then the others'; the worker runs.
  await syncedAtTheYard(monday('18:30'), [
    'P1-TWR-TDSR',
    'P1-TWR-LF',
    'P1-UR-1',
    'P1-COL-1',
    'P2-COL-1',
    'P2-TWR-TDSR',
  ]);
  await world.worker();
  const standing = await world.standing();
  const { mondayNight } = world.outcomes;
  expect(standing.p1.tickets).toEqual(mondayNight.p1.tickets);
  expect(standing.p1.total).toEqual(mondayNight.p1.ledger);
  expect(standing.p2.tickets).toEqual(mondayNight.p2.tickets);
  expect(standing.p2.ledger).toEqual(world.outcomes.reviewed.p2.ledger);
  expect(standing.p2.total).toEqual(mondayNight.p2.ledger);
});

test('AC-05-52, AC-06-103, AC-06-154: Tuesday on P1, the Marsh Road tower’s phone flat from the morning: 101004, 101005 and 101006 wait alone, PENDING, not flagged; the haul-out 201001 and the weighed split haul-out 201004 COMPLETED; the under-size stump 301005 in review: 17 lines, $4,879.00', async () => {
  test.setTimeout(240_000);
  await outForTheDay(tuesday('06:30'), [
    ['P1-COL-1', 0],
    ['P1-TWR-TDSR', 0],
    ['P1-TWR-LF', 0],
    ['P1-HO-TDSR', 1],
    ['P1-TWR-CCL', 0],
    ['P1-UR-1', 0],
  ]);

  // Kim's tower phone: yesterday's preload, two more loads, a number typed by mistake off a
  // barcode that won't read, and a resident's drop-off; its battery is flat from tonight.
  const kim = phone('P1-TWR-TDSR');
  await kim.scanned(tuesday('06:45'), 'disposal', '730416', '101004');
  await kim.completed(
    tuesday('07:15'),
    { truck: '730416', number: '101004' },
    { debris: 'Vegetative', call: '50' },
  );
  await kim.scanned(tuesday('10:25'), 'disposal', '730415', '101005');
  await kim.completed(
    tuesday('10:40'),
    { truck: '730415', number: '101005' },
    { debris: 'Vegetative', call: '70' },
  );
  await kim.scanned(tuesday('11:55'), 'disposal', '730416', {
    typed: '101060',
    reason: 'Barcode damaged',
  });
  await kim.completed(
    tuesday('12:10'),
    { truck: '730416', number: '101060' },
    { debris: 'Vegetative', call: '60' },
  );
  await kim.dropOff(tuesday('15:20'), { residentName: 'Carl Jensen', origin: '14 Heron St' });

  // Jo's day: two stumps with the skid steer crew, white goods with the bucket truck crew at 40
  // Birch Ln, an incident at 22 Elm St, and the skid steer crew's time.
  const jo = phone('P1-UR-1');
  expect(
    await jo.unitRate(tuesday('08:30'), tuesday('08:50'), { scan: '730418' }, 'Stumps', {
      stump: {
        inches: '30',
        rootBall: { inches: '96', halfOrMore: true },
        survey: 'APN 14-0321-007',
      },
    }),
  ).toBe('301004');
  // 20 in across and no root ball, so no question whether half of it is exposed (ADR-605); no
  // survey number.
  expect(
    await jo.unitRate(tuesday('09:10'), tuesday('09:20'), { same: '730418' }, 'Stumps', {
      stump: { inches: '20', rootBall: null, survey: null },
    }),
  ).toBe('301005');
  await jo.placed(places.birchLn);
  expect(
    await jo.unitRate(tuesday('10:50'), tuesday('11:15'), { scan: '730417' }, 'White Goods', {
      items: [
        ['Washer', '2'],
        ['Dryer', '1'],
        ['Fridge, freon recovered', '2'],
        ['Fridge, no freon', '1'],
      ],
      typedAddress: '40 Birch Ln',
    }),
  ).toBe('301006');
  await jo.placed(places.elmSt);
  await jo.incident(tuesday('11:50'), {
    type: 'Property damage',
    subType: 'Mailbox struck',
    certNumber: '730416',
    typedAddress: '22 Elm St',
  });
  await jo.placed(places.heronSt);
  expect(
    await jo.unitRate(tuesday('16:50'), tuesday('17:05'), { scan: '730418' }, 'Crew time', {
      hours: [
        ['Skid Steer', '9.75'],
        ['Truck', '8.5'],
      ],
    }),
  ).toBe('301007');

  // Ana's two loads.
  const ana = phone('P1-COL-1');
  await ana.placed(places.heronSt);
  expect(await ana.opened(tuesday('09:45'), 'collection', '730415')).toBe('101005');
  await ana.completed(
    tuesday('10:05'),
    { truck: '730415', number: '101005' },
    { debris: 'Vegetative', place: {} },
  );
  await ana.placed(places.elmSt);
  expect(await ana.opened(tuesday('11:10'), 'collection', '730416')).toBe('101006');
  await ana.completed(
    tuesday('11:30'),
    { truck: '730416', number: '101006' },
    { debris: 'Vegetative', place: {} },
  );

  // Sam Grant at Marsh Road TDSR: the haul-out 201001, called at its loading end; then the
  // walking floor back for three piles, one haul-out collection each, each with the call so
  // far. The mission's gap in his numbers (201002 and 201003 are the flag catalogue's): two
  // haul-outs begun by mistake and cancelled, kept on the phone and never sent.
  const sam = phone('P1-HO-TDSR');
  await sam.placed(places.marshRoadTower);
  expect(await sam.opened(tuesday('12:40'), 'haulOutCollection', '730419')).toBe('201001');
  await sam.completed(
    tuesday('13:00'),
    { truck: '730419', number: '201001' },
    { debris: 'Mulch', call: '90' },
  );
  expect(await sam.cancelled(tuesday('15:05'), '730419')).toBe('201002');
  expect(await sam.cancelled(tuesday('15:07'), '730419')).toBe('201003');
  expect(await sam.opened(tuesday('15:10'), 'haulOutCollection', '730419', 'split')).toBe('201004');
  await sam.completed(
    tuesday('15:30'),
    { truck: '730419', number: '201004', suffix: 'A' },
    { debris: 'Mulch', call: '10', then: 'next' },
  );
  await sam.completed(
    tuesday('15:45'),
    { truck: '730419', number: '201004', suffix: 'B' },
    { debris: 'Mulch', call: '35', then: 'next' },
  );
  await sam.completed(
    tuesday('16:05'),
    { truck: '730419', number: '201004', suffix: 'C' },
    { debris: 'Mulch', call: '85' },
  );

  // Tariq at the Landfill: 201001's haul-out disposal, nothing more to take.
  const tariq = phone('P1-TWR-LF');
  await tariq.scanned(tuesday('13:55'), 'haulOutDisposal', '730419', '201001');
  await tariq.completed(
    tuesday('14:10'),
    { truck: '730419', number: '201001' },
    { debris: 'Mulch' },
  );

  // Lee Morgan at Cypress Creek Landfill, over the scale: the weight off receipt CCL-51207.
  const lee = phone('P1-TWR-CCL');
  await lee.placed(places.cypressCreek);
  await lee.scanned(tuesday('17:00'), 'haulOutDisposal', '730419', '201004');
  await lee.completed(
    tuesday('17:15'),
    { truck: '730419', number: '201004' },
    {
      debris: 'Mulch',
      weighed: { receipt: 'CCL-51207', weights: ['79600', '31600', '48000', '24'] },
    },
  );

  // At the yard: five phones sync; the Marsh Road tower's battery is flat, its day stays on it.
  await syncedAtTheYard(tuesday('18:30'), [
    'P1-COL-1',
    'P1-TWR-LF',
    'P1-HO-TDSR',
    'P1-TWR-CCL',
    'P1-UR-1',
  ]);
  await world.worker();
  const standing = await world.standing();
  expect(standing.p1.tickets).toEqual(world.outcomes.tuesdayNight.p1.tickets);
  expect(standing.p1.total).toEqual(world.outcomes.tuesdayNight.p1.ledger);
});

test('AC-05-02, AC-06-16, AC-04-12, AC-08-01, AC-08-02, AC-10-93: Wednesday the Marsh Road tower’s phone, charged, syncs Tuesday’s work: the preload 101004 and 101005 pair; 101006 waits, its disposal typed as 101060 and flagged: 19 lines, $5,400.25; the review queue holds 101003, 101006, 101060 and 301005, each with its plain message', async () => {
  test.setTimeout(60_000);
  await syncedAtTheYard(wednesday('07:10'), ['P1-TWR-TDSR']);
  await world.at(wednesday('07:20'));
  await world.worker();
  const standing = await world.standing();
  const { wednesday: outcomes } = world.outcomes;
  expect(standing.p1.tickets.filter((line) => line.startsWith('10'))).toEqual(outcomes.p1.loads);
  expect(standing.p1.total).toEqual(outcomes.p1.ledger);
  expect(standing.p1.queue).toEqual(outcomes.p1.queue);
});

test('AC-08-64, AC-07-113, AC-07-111, AC-08-65: the mission’s review done (101003’s call accepted, 101060 renumbered to 101006 and its typed number accepted, 301003 and 301005 voided): every live ticket COMPLETED, the two voided VOID, nothing on the review queue; P1’s ledger line for line, $5,548.25 on 19 lines; P2’s $324.00 on two; the audit rows read through the API: each field event made on its monitor’s phone, Luis’s acts with his reasons and words, the value before kept, 301003’s removed line copied whole', async () => {
  test.setTimeout(60_000);
  await world.at(wednesday('08:00'));
  await world.review();
  const standing = await world.standing();
  const { reviewed } = world.outcomes;
  expect(standing.p1.statuses).toEqual(reviewed.p1.statuses);
  expect(standing.p1.queue).toEqual(reviewed.p1.queue);
  expect(standing.p1.ledger).toEqual(reviewed.p1.ledger);
  expect(standing.p1.total).toEqual({ lines: 19, total: '$5,548.25' });
  expect(standing.p1.total).toEqual(reviewed.p1.total);
  expect(standing.p2.statuses).toEqual(reviewed.p2.statuses);
  expect(standing.p2.ledger).toEqual(reviewed.p2.ledger);
  expect(standing.p2.total).toEqual({ lines: 2, total: '$324.00' });
  expect(await world.audit()).toEqual(reviewed.p1.audit);
});

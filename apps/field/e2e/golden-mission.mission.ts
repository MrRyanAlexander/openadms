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
import { OfficeDesk, officeOrigin, pick, tick, type } from './office-desk.ts';

const on = (day: string, time: string): string => `2026-10-${day}T${time}:00-04:00`;
const thursday = (time: string) => on('08', time);
const friday = (time: string) => on('09', time);
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
// Dana's and Luis's sign-ins at the back office, and the projects' ids its screens made.
let people: Awaited<ReturnType<MissionWorld['people']>>;
const projectIds = { p1: '', p2: '' };
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
  world = await MissionWorld.opened(officeOrigin);
});

// The phones put away, then the world closed and its process ended, so the stories' address is
// free before anything else runs there: its API's shutdown is waited out, never cut short.
test.afterAll(async () => {
  test.setTimeout(120_000);
  for (const each of phones.values()) await each.close();
  await world.close();
});

// P1's map as its file came: three zones side by side, which bound the project between them.
const zone = (name: string, west: number, east: number) => ({
  type: 'Feature',
  properties: { ZONE_NAME: name },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [west, 38.9],
        [east, 38.9],
        [east, 39.3],
        [west, 39.3],
        [west, 38.9],
      ],
    ],
  },
});
const p1Map = {
  name: 'bayline-row-zones-v1.geojson',
  geojson: JSON.stringify({
    type: 'FeatureCollection',
    features: [
      zone('Zone 1', -75.8, -75.67),
      zone('Zone 2', -75.67, -75.53),
      zone('Zone 3', -75.53, -75.4),
    ],
  }),
};

test('the golden mission §1 on the back office’s screens: on Thursday Dana Reyes sets P1 up (Bayline County, Hurricane Delphine, Coastline and its contract, three sites, the forms and debris types, field tags, the pay items with Coastline’s rates, the rules, the map) and grants Luis Ortega review; on Friday P2', async ({
  browser,
}) => {
  test.setTimeout(1_200_000);
  people = await world.people();
  await world.at(thursday('08:01'));
  let dana = await OfficeDesk.signedIn(browser, people.dana, thursday('08:01'));
  const coastline = 'Coastline Haulers LLC';
  const rates = { [coastline]: '' };
  const rate = (value: string) => ({ ...rates, [coastline]: value });

  await dana.client('Bayline County');
  await dana.declarationEvent('Hurricane Delphine', 'DR-9001-FL', 'FEMA disaster (DR)');
  await dana.contractor(coastline);
  await dana.listValue('Incident sub-types', 'Mailbox struck', 'Property damage');
  await dana.listValue('Payable types', 'Stump fill');
  await dana.listValue('Payable types', 'Freon recovery');

  const p1Id = await dana.project({
    name: p1,
    client: 'Bayline County',
    event: 'Hurricane Delphine (DR-9001-FL)',
    programType: 'ROW',
    activeTo: '2027-01-31',
    workflows: ['Loads', 'Haul-outs', 'Unit rate work'],
    kindsOfWork: ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'],
    numbersFrom: {
      Loads: '101001',
      'Haul-outs': '201001',
      'Unit rate tickets': '301001',
      Certifications: '730415',
    },
  });
  await dana.allowSplitLoads(p1Id);
  await dana.primeAndContract(p1Id, coastline, 'Coastline, Bayline ROW 2026');
  await dana.site(p1Id, {
    name: 'Marsh Road TDSR',
    type: 'TDSR/DMS',
    facts: ['Takes loads', 'Haul-outs leave here'],
    permit: 'FDEP-DMS-2026-0117',
    latitude: '39.09000000',
    longitude: '-75.62000000',
  });
  await dana.site(p1Id, {
    name: 'Bayline County Landfill',
    shortCode: 'BCL',
    type: 'Final Disposal',
    facts: ['Takes loads', 'Charges a tipping fee'],
    permit: 'FDEP-SW-0098',
    latitude: '39.00000000',
    longitude: '-75.58000000',
  });
  await dana.site(p1Id, {
    name: 'Cypress Creek Landfill',
    shortCode: 'CCL',
    type: 'Final Disposal',
    facts: ['Takes loads'],
    permit: 'FDEP-SW-0131',
    latitude: '39.24000000',
    longitude: '-75.60000000',
  });
  await dana.form(p1Id, 'Load', 'Load');
  await dana.form(p1Id, 'Haul-out', 'Haul-out');
  await dana.form(p1Id, 'Unit rate', 'Unit rate');
  await dana.form(p1Id, 'Incident', 'Incident', ['The contractor involved', 'A cert number']);
  await dana.form(p1Id, 'Citizen drop-off log', 'Drop-off log');
  await dana.debrisType(p1Id, 'Load', { library: 'Vegetative' });
  await dana.debrisType(p1Id, 'Load', { library: 'C&D' });
  await dana.debrisType(p1Id, 'Haul-out', { added: 'Mulch', reducedBy: 'Grinding' });
  await dana.fieldTags(p1Id, ['Mixed', 'Zone 1 pile', 'Zone 2 pile', 'Zone 3 pile']);

  // The unit rate work Jo's phone falls to, each with Coastline's rate (golden mission §1).
  const each = (
    code: string,
    description: string,
    work: string,
    value: string,
    band?: readonly [string, string],
  ) =>
    dana.payItem(p1Id, {
      code,
      description,
      payableType: work,
      kindOfWork: work,
      unit: 'Each',
      ...(band === undefined ? {} : { band }),
      flags: [
        'The count is always one',
        ...(band === undefined ? [] : ['A measurement required']),
        'Photos required',
      ],
      rates: rate(value),
    });
  await each('HNG-RMV-EA', 'Hanger removal', 'Hangers', '68.00');
  await each('LNR-RMV-EA-24', 'Leaner removal 6–24 in', 'Leaners', '95.00', ['6', '24']);
  await each('LNR-RMV-EA-99', 'Leaner removal 24.1–99 in', 'Leaners', '185.00', ['24.1', '99']);
  await each('STP-RMV-EA-36', 'Stump removal 24–36 in', 'Stumps', '110.00', ['24', '36']);
  await each('STP-RMV-EA-48', 'Stump removal 36.1–48 in', 'Stumps', '175.00', ['36.1', '48']);
  await dana.payItem(p1Id, {
    code: 'WG-RMV-EA',
    description: 'White good removed',
    payableType: 'White Goods',
    kindOfWork: 'White Goods',
    unit: 'Each',
    flags: ['Photos required'],
    rates: rate('40.00'),
  });
  await dana.payItem(p1Id, {
    code: 'CREW-TIME-HR',
    description: 'Crew time, skid steer crew',
    payableType: 'Crew time',
    kindOfWork: 'Crew time',
    unit: 'Hours',
    flags: ['Decimals allowed', 'Photos required'],
    crewTimePaid: 'By the hour',
    rates: rate('150.00'),
  });

  // The load, haul-out, fee, fill and freon pay items, Thursday at 08:40, with the map.
  // Her session went quiet while the clock moved on: she signs in again.
  await world.at(thursday('08:40'));
  await dana.close();
  dana = await OfficeDesk.signedIn(browser, people.dana, thursday('08:40'));
  await dana.map(p1Id, p1Map);
  const priced: readonly (readonly [string, string, string, string, string])[] = [
    ['VEG-HAUL-CY-15', 'ROW VEG haul 0–15 mi', 'Vegetative', 'Cubic yards', '7.50'],
    ['VEG-HAUL-CY-30', 'ROW VEG haul 15.1–30 mi', 'Vegetative', 'Cubic yards', '8.90'],
    ['CD-HAUL-CY-15', 'ROW C&D haul 0–15 mi', 'C&D', 'Cubic yards', '8.25'],
    ['MULCH-HO-CY', 'Mulch haul-out to FDS', 'Vegetative', 'Cubic yards', '5.10'],
    ['MULCH-HO-TN', 'Mulch haul-out to FDS, by weight', 'Vegetative', 'Tons', '20.00'],
    [
      'TIP-FEE-CY-BCL',
      'Tipping fee, Bayline County Landfill',
      'Tipping fee',
      'Cubic yards',
      '4.00',
    ],
    ['STP-FILL-CY', 'Stump hole fill', 'Stump fill', 'Cubic yards', '22.00'],
    ['WG-FRN-EA', 'Freon recovered', 'Freon recovery', 'Each', '25.00'],
  ];
  for (const [code, description, payableType, unit, value] of priced) {
    await dana.payItem(p1Id, { code, description, payableType, unit, rates: rate(value) });
  }
  await dana.tippingFee(
    p1Id,
    'Bayline County Landfill',
    'TIP-FEE-CY-BCL, Tipping fee, Bayline County Landfill',
  );

  // Every rule, each naming Coastline's contract (spec/RULES.md; golden mission §1).
  const contract = 'Coastline, Bayline ROW 2026';
  const named = Object.fromEntries(
    priced.map(([code, description]) => [code, `${code}, ${description}`]),
  );
  const unitRate: Readonly<Record<string, string>> = {
    'HNG-RMV-EA': 'HNG-RMV-EA, Hanger removal',
    'LNR-RMV-EA-24': 'LNR-RMV-EA-24, Leaner removal 6–24 in',
    'LNR-RMV-EA-99': 'LNR-RMV-EA-99, Leaner removal 24.1–99 in',
    'STP-RMV-EA-36': 'STP-RMV-EA-36, Stump removal 24–36 in',
    'STP-RMV-EA-48': 'STP-RMV-EA-48, Stump removal 36.1–48 in',
    'WG-RMV-EA': 'WG-RMV-EA, White good removed',
    'CREW-TIME-HR': 'CREW-TIME-HR, Crew time, skid steer crew',
  };
  const debris = (value: string) => ({ criterion: 'Debris type', test: 'is', value });
  const dumpedAt = (value: string) => ({ criterion: 'Disposal site', test: 'is', value });
  const payItemIs = (code: string) => ({
    criterion: 'Pay item',
    test: 'is',
    value: unitRate[code] ?? '',
  });
  const rule = (
    code: string,
    form: string,
    ifs: Parameters<OfficeDesk['rule']>[1]['ifs'],
    slot = 1,
    items?: readonly string[],
  ) =>
    dana.rule(p1Id, {
      name: `${code} on ${form}`,
      form,
      contract,
      ifs,
      then: {
        slot,
        payItem: named[code] ?? unitRate[code] ?? '',
        ...(items === undefined ? {} : { items }),
      },
    });
  await rule('VEG-HAUL-CY-15', 'Load', [
    debris('Vegetative'),
    { criterion: 'Mileage', test: 'is at most', number: '15' },
  ]);
  await rule('VEG-HAUL-CY-30', 'Load', [
    debris('Vegetative'),
    { criterion: 'Mileage', test: 'is between', number: '15.1', to: '30' },
  ]);
  await rule('CD-HAUL-CY-15', 'Load', [
    debris('C&D'),
    { criterion: 'Mileage', test: 'is at most', number: '15' },
  ]);
  await rule('TIP-FEE-CY-BCL', 'Load', [dumpedAt('Bayline County Landfill')], 2);
  await rule('TIP-FEE-CY-BCL', 'Haul-out', [dumpedAt('Bayline County Landfill')], 2);
  await rule('MULCH-HO-CY', 'Haul-out', [debris('Mulch'), dumpedAt('Bayline County Landfill')]);
  await rule('MULCH-HO-TN', 'Haul-out', [debris('Mulch'), dumpedAt('Cypress Creek Landfill')]);
  for (const code of [
    'HNG-RMV-EA',
    'LNR-RMV-EA-24',
    'LNR-RMV-EA-99',
    'STP-RMV-EA-36',
    'STP-RMV-EA-48',
    'CREW-TIME-HR',
  ]) {
    await rule(code, 'Unit rate', [payItemIs(code)]);
  }
  // White goods: the rules say which items count toward which pay item (spec/RULES.md §9).
  await rule('WG-RMV-EA', 'Unit rate', [payItemIs('WG-RMV-EA')], 1, [
    'Washer',
    'Dryer',
    'Fridge, freon recovered',
    'Fridge, no freon',
    'Oven',
    'Microwave',
  ]);
  await rule(
    'WG-FRN-EA',
    'Unit rate',
    [
      payItemIs('WG-RMV-EA'),
      { criterion: 'Item', test: 'is at least', item: 'Fridge, freon recovered', number: '1' },
    ],
    2,
    ['Fridge, freon recovered'],
  );
  await rule(
    'STP-FILL-CY',
    'Unit rate',
    [
      {
        criterion: 'Pay item',
        test: 'is one of',
        values: [unitRate['STP-RMV-EA-36'] ?? '', unitRate['STP-RMV-EA-48'] ?? ''],
      },
    ],
    2,
  );
  await dana.grant('Luis Ortega', [
    'View review',
    'Correct records',
    'Renumber',
    'Void',
    'Accept a flag',
    'QC',
    'Lock as invoiced',
  ]);

  // Friday: P2, Bayline County's private property debris removal, loads alone.
  await world.at(friday('09:00'));
  await dana.close();
  dana = await OfficeDesk.signedIn(browser, people.dana, friday('09:00'));
  const p2Id = await dana.project({
    name: p2,
    client: 'Bayline County',
    event: 'Hurricane Delphine (DR-9001-FL)',
    programType: 'PPDR',
    activeTo: '2027-01-31',
    workflows: ['Loads'],
    kindsOfWork: [],
    numbersFrom: { Loads: '102001', Certifications: '730416' },
  });
  await dana.primeAndContract(p2Id, coastline, 'Coastline, Bayline PPDR 2026');
  await dana.form(p2Id, 'Load', 'Load');
  await dana.form(p2Id, 'ROE', 'ROE');
  await dana.form(p2Id, 'Survey', 'Survey');
  await dana.debrisType(p2Id, 'Load', { library: 'Vegetative' });
  await dana.payItem(p2Id, {
    code: 'VEG-HAUL-CY',
    description: 'PPDR VEG haul',
    payableType: 'Vegetative',
    unit: 'Cubic yards',
    rates: rate('9.00'),
  });
  await dana.rule(p2Id, {
    name: 'VEG-HAUL-CY on Load',
    form: 'Load',
    contract: 'Coastline, Bayline PPDR 2026',
    ifs: [debris('Vegetative')],
    then: { slot: 1, payItem: 'VEG-HAUL-CY, PPDR VEG haul' },
  });
  await dana.site(p2Id, {
    name: 'Marsh Road TDSR',
    type: 'TDSR/DMS',
    facts: ['Takes loads', 'Haul-outs leave here'],
    permit: 'FDEP-DMS-2026-0117',
    latitude: '39.09000000',
    longitude: '-75.62000000',
  });
  projectIds.p1 = p1Id;
  projectIds.p2 = p2Id;
  await dana.close();

  // Saturday at the yard: the six monitors made on its phone, the trucks and crews certified.
  await world.adopt();
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

test('AC-08-64, AC-07-113, AC-07-111, AC-08-65: the mission’s review done by Luis Ortega on the back office’s screens (101003’s call accepted, 101060 renumbered to 101006 and its typed number accepted, 301003 and 301005 voided), the worker running what each act queued: every live ticket COMPLETED, the two voided VOID, nothing on the review queue; P1’s ledger line for line, $5,548.25 on 19 lines; P2’s $324.00 on two; the audit rows read through the API: each field event made on its monitor’s phone, Luis’s acts with his reasons and words, the value before kept, 301003’s removed line copied whole', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await world.at(wednesday('08:00'));
  const luis = await OfficeDesk.signedIn(browser, people.luis, wednesday('08:00'));
  const page = luis.page;
  const ticket = async (workflow: string, number: string) => {
    await luis.at(`/projects/${projectIds.p1}/tickets/${workflow}/${number}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(number);
  };
  // An act at a ticket's page; the worker runs what it queued.
  const acted = async (opener: RegExp | string, title: string, reason: string, note: string) => {
    await page.getByRole('button', { name: opener }).click();
    const form = page.getByRole('dialog', { name: title });
    await pick(form, 'Reason', reason);
    await type(form, 'Your note', note);
    await form.getByRole('button', { name: title, exact: true }).click();
    await expect(form).toBeHidden();
    await world.worker();
  };
  await ticket('LOAD', '101003');
  await acted(
    /^Accept the flag: Ticket 101003/,
    'Accept the flag',
    'Photos confirm',
    'Heaped; photos confirm',
  );
  await ticket('LOAD', '101060');
  await page
    .getByRole('region', { name: 'Disposal (DIS) 101060' })
    .getByRole('button', { name: 'Renumber', exact: true })
    .click();
  const renumbering = page.getByRole('dialog', { name: 'Renumber' });
  await type(renumbering, 'Ticket number', '101006');
  await renumbering.getByRole('button', { name: 'Renumber', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('101006');
  await world.worker();
  await ticket('LOAD', '101006');
  await acted(
    /^Accept the flag: Ticket 101006: typed ticket number/,
    'Accept the flag',
    'Photos confirm',
    'Cert, times and photos match 101006',
  );
  await ticket('UNIT_RATE', '301003');
  await acted('Void the ticket', 'Void the ticket', 'Duplicate ticket', 'Duplicate of 301001');
  await ticket('UNIT_RATE', '301005');
  await acted(
    'Void the ticket',
    'Void the ticket',
    'Not eligible work',
    'Under 24 in; goes out as vegetative debris',
  );
  await luis.close();
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

test('AC-09-11, AC-09-31, REQ-406, REQ-408: Luis QCs P1’s thirteen live tickets on the back office’s screens and locks them as invoiced in “Bayline ROW, week of 12 Oct”; its ledger reads $5,548.25 on 19 lines, P2’s $324.00 on 2; Bayline County’s debris manager, a client user Dana issues, reads 101002 in the viewer portal with its two lines', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  await world.at(wednesday('09:00'));
  const luis = await OfficeDesk.signedIn(browser, people.luis, wednesday('09:00'));
  const page = luis.page;
  await luis.at(`/projects/${projectIds.p1}/invoice-batches`);
  await page.getByRole('button', { name: 'Name a batch' }).click();
  const naming = page.getByRole('dialog', { name: 'Name a batch' });
  await type(naming, 'Name', 'Bayline ROW, week of 12 Oct');
  await naming.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(naming).toBeHidden();

  await luis.at(`/projects/${projectIds.p1}/qc`);
  let locked = 0;
  for (const workflow of ['Loads', 'Haul-outs', 'Unit rate']) {
    await page
      .getByRole('radiogroup', { name: 'Workflow' })
      .getByText(workflow, { exact: true })
      .click();
    await pick(page, 'Status', 'Completed');
    const table = page.getByRole('table', { name: `${workflow}: every ticket` });
    await expect(table.getByRole('row').nth(1)).toBeVisible();
    const tickAll = async () => {
      const names = await table
        .getByRole('checkbox')
        .evaluateAll((boxes) => boxes.map((box) => box.closest('label')?.textContent ?? ''));
      for (const name of names) await tick(table, name);
      return names.length;
    };
    const count = await tickAll();
    await page.getByRole('button', { name: 'Set the QC status' }).click();
    const qc = page.getByRole('dialog', { name: /^Set the QC status of/ });
    await pick(qc, 'Set it to', 'QC Approved');
    await qc.getByRole('button', { name: 'Set the QC status' }).click();
    await expect(table.getByText('QC Approved', { exact: true })).toHaveCount(count);
    await tickAll();
    await page.getByRole('button', { name: 'Lock as invoiced', exact: true }).click();
    const locking = page.getByRole('dialog', { name: /^Lock .* as invoiced$/ });
    await pick(locking, 'Invoice batch', 'Bayline ROW, week of 12 Oct');
    await locking.getByRole('button', { name: 'Lock as invoiced' }).click();
    await expect(
      table.getByText('Locked as invoiced, in Bayline ROW, week of 12 Oct', { exact: true }),
    ).toHaveCount(count);
    locked += count;
  }
  expect(locked).toBe(13);
  const p1Total = world.outcomes.reviewed.p1.total;
  await luis.at(`/projects/${projectIds.p1}/ledger`);
  await expect(
    page.getByText(`${String(p1Total.lines)} lines, ${p1Total.total} in all`),
  ).toBeVisible();
  await expect(page.getByText('19 lines, $5,548.25 in all')).toBeVisible();
  await luis.at(`/projects/${projectIds.p2}/ledger`);
  await expect(page.getByText('2 lines, $324.00 in all')).toBeVisible();
  await luis.close();

  // Dana issues Bayline County's debris manager a client user's login to P1.
  await world.at(wednesday('09:30'));
  const dana = await OfficeDesk.signedIn(browser, people.dana, wednesday('09:30'));
  const viewer = {
    email: 'debris.manager@baylinecounty.example',
    password: 'heron street marsh tower',
  };
  await dana.clientUser('Bayline County debris manager', viewer.email, p1, viewer.password);
  await dana.close();
  const reader = await OfficeDesk.viewerSignedIn(browser, viewer);
  await reader.at(`/projects/${projectIds.p1}/tickets/LOAD/101002`);
  const lines = reader.page.getByRole('table', { name: 'Lines' });
  await expect(lines).toContainText('$297.00');
  await expect(lines).toContainText('$144.00');
  await reader.close();
});

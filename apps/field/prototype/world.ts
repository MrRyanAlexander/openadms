// What the prototype shows: the example world's P1 on Monday 12 October 2026 (spec/CONVENTIONS.md
// §6; spec/golden/MISSION.md §1, §2), made up, with nothing saved or sent. The load call's limits
// and the most photos a ticket takes are the project's and the rules' (5% and 95%, ADR-164; eight,
// ADR-179), written here only as this example's values: the real screens read them from the
// phone's lists and the rules.
import prototypeWords from './words.json';

export const words = prototypeWords;

export const world = {
  timeZone: 'America/New_York',
  // Monday 12 October 2026, 12:30 p.m. in the project's time zone.
  now: new Date('2026-10-12T16:30:00Z'),
  lastSent: new Date('2026-10-12T11:02:00Z'),
  listsFrom: new Date('2026-10-12T10:58:00Z'),
  project: 'Bayline County ROW, Hurricane Delphine',
  site: 'Marsh Road TDSR',
  monitors: { collector: 'Ana Brooks', tower: 'Kim Nguyen', unitRate: 'Jo Kim' },
  certifications: [
    {
      number: '730415',
      prime: 'Coastline Haulers LLC',
      sub: null,
      kind: 'Hydraulic Dump Trailer',
      capacity: 65,
    },
    {
      number: '730416',
      prime: 'Coastline Haulers LLC',
      sub: 'Rivera Trucking',
      kind: 'Self-Loading Truck',
      capacity: 48,
    },
  ],
  crews: [
    { number: '730417', name: 'Coastline bucket truck crew' },
    { number: '730418', name: 'Coastline skid steer crew' },
  ],
  debrisTypes: ['Vegetative', 'C&D'],
  fieldTags: ['Mixed'],
  payableTypes: ['Hangers', 'Leaners', 'Stumps', 'White Goods', 'Crew time'],
  typedReasons: ['Barcode damaged', 'Scanner not working'],
  loadCallLimits: { low: 5, high: 95 },
  photosAtMost: 8,
  // The next number of each phone's block, and the driver's ticket at the tower.
  numbers: { collection: '101001', unitRate: '301001', driversTicket: '101001' },
  heron: { address: '14 Heron St', latitude: '39.13850', longitude: '-75.55370' },
  // What waits on each phone, and what the server says of each when it is sent.
  waiting: {
    collector: [
      { kind: 'collection', number: '101001', at: new Date('2026-10-12T12:40:00Z'), saved: true },
      { kind: 'collection', number: '101002', at: new Date('2026-10-12T14:10:00Z'), saved: true },
    ],
    tower: [
      { kind: 'disposal', number: '101020', at: new Date('2026-10-12T14:22:00Z'), saved: true },
      { kind: 'disposal', number: '101020', at: new Date('2026-10-12T15:40:00Z'), saved: false },
    ],
    unitRate: [
      { kind: 'unitRate', number: '301001', at: new Date('2026-10-12T13:05:00Z'), saved: true },
    ],
  },
  photosWaiting: { collector: 3, tower: 4, unitRate: 2 },
} as const;

export type Monitor = keyof typeof world.monitors;

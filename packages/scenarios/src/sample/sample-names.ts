// What the sample projects are called (sample-projects.ts): the golden mission's example world
// (spec/CONVENTIONS.md §6), every record a firm reads named so it is told from real work at a
// glance. Its client, declaration event and contractors are firm-wide records, so each says
// "(sample)"; its projects start "Sample:"; its people say "(sample)" and sign in at addresses
// of the sample's own; its phones start "Sample". No name here is one a firm's own records or a
// test's would take.
//
// The sample adds nothing to the firm's own lists: every debris type, payable type, kind of work,
// item, vehicle type, site type, incident type and reason it picks is one the installation ships
// (spec/LISTS.md, "What ships"). Where the golden mission adds its own (Mulch, Stump fill, Freon
// recovery, the incident sub-type Mailbox struck), the sample picks the shipped value nearest
// it: the haul-out form's Vegetative entry, Reduced by grinding; the fill and the freon under
// the payable types of the work they come with, Stumps and White Goods; no sub-type.
export const sample = {
  client: 'Bayline County (sample)',
  declarationEvent: { name: 'Hurricane Delphine (sample)', reference: 'DR-9001-FL' },
  projects: {
    row: 'Sample: Bayline County ROW, Hurricane Delphine',
    ppdr: 'Sample: Bayline County PPDR, Hurricane Delphine',
  },
  prime: 'Coastline Haulers LLC (sample)',
  sub: 'Rivera Trucking (sample)',
  contracts: { row: 'Coastline, Bayline ROW 2026', ppdr: 'Coastline, Bayline PPDR 2026' },
  batch: 'Bayline ROW, week of 12 Oct',
  timeZone: 'America/New_York',
} as const;

// The sample's back office: two managers/analysts, made on the server by whoever loads the sample
// (sample-people.ts), each granted what their part of the mission takes. Never an admin: the
// firm's own first admin is made on the server too, once, while it has none (ADR-415), and the
// sample never stands in its way.
export const sampleOffice = {
  dana: {
    name: 'Dana Reyes (sample)',
    email: 'dana.reyes@sample.gates.example',
    // Dana sets both projects up and approves the time clock's days.
    grants: ['SETUP', 'VIEW_SETUP', 'APPROVE_HOURS', 'VIEW_DISPATCH'],
  },
  luis: {
    name: 'Luis Ortega (sample)',
    email: 'luis.ortega@sample.gates.example',
    // Luis writes the dispatch board, reviews, QCs and locks.
    grants: [
      'DISPATCH',
      'VIEW_DISPATCH',
      'VIEW_REVIEW',
      'CORRECT',
      'RENUMBER',
      'VOID',
      'ACCEPT_FLAG',
      'QC',
      'LOCK_INVOICED',
    ],
  },
} as const;

// The sample's field monitors, created on its yard phone under the master passcode, as every
// monitor is (ADR-442): the golden mission's six.
export const sampleMonitors = {
  ana: 'Ana Brooks (sample)',
  kim: 'Kim Nguyen (sample)',
  tariq: 'Tariq Patel (sample)',
  jo: 'Jo Kim (sample)',
  sam: 'Sam Grant (sample)',
  lee: 'Lee Morgan (sample)',
} as const;
export type SampleMonitor = keyof typeof sampleMonitors;

// The sample's phones: the golden mission's dispatch board, each enrolled once.
export const samplePhones = {
  col: 'Sample P1-COL-1',
  tdsr: 'Sample P1-TWR-TDSR',
  landfill: 'Sample P1-TWR-LF',
  haulOut: 'Sample P1-HO-TDSR',
  cypress: 'Sample P1-TWR-CCL',
  unitRate: 'Sample P1-UR-1',
  p2Col: 'Sample P2-COL-1',
  p2Tdsr: 'Sample P2-TWR-TDSR',
} as const;
export type SamplePhone = keyof typeof samplePhones;

// When the sample happens, in project time: set up on Thursday 8 and Friday 9 October 2026,
// certified on Saturday, worked Monday 12 to Wednesday 14, reviewed, QC'd and locked on Thursday
// 15 (the golden mission's days, and one more for what the sample adds to it).
export const sampleDay = (date: '08' | '09' | '10' | '12' | '13' | '14' | '15', time: string) =>
  `2026-10-${date}T${time}:00-04:00`;

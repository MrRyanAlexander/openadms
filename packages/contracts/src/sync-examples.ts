// The example world's records as a phone sends them (ADR-466, 467, 470): one of each kind, from
// Monday on P1, and the two reports a sync carries. The contract's own tests send them, and so
// does the suite any client must pass (`sync-client-suite.ts`), which is why they are here and
// not beside the tests.
import { certificationViews } from '@open-adms/domain';

import type {
  SyncedCertification,
  SyncedFieldEvent,
  SyncedPhoto,
  SyncedRecord,
} from './sync-records.ts';
import type { SyncSent } from './sync.ts';

export const made = (last: string): string => `019a0000-0000-7000-8000-${last.padStart(12, '0')}`;
export const p1 = made('p1'.replace('p', 'a'));
export const ana = made('b1');
export const kim = made('b2');
export const assignment = made('c1');
export const vegetative = made('d1');
export const landfill = made('e1');
export const sam = made('b3');
export const lee = made('b4');
export const coastline = made('a2');
export const dogBox = made('f4');

// Ana's collection on 101001 at 14 Oak St, as her phone sends it.
export const collection: SyncedFieldEvent = {
  id: made('1'),
  projectId: p1,
  workflow: 'LOAD',
  kind: 'COLLECTION',
  ticketNumber: '101001',
  splitSuffix: '',
  monitorId: ana,
  assignmentId: assignment,
  setupVersion: 3,
  temporarySession: false,
  numberTyped: false,
  numberTypedReasonId: null,
  certNumber: '730415',
  certKeyedByHand: false,
  typedCapacityCy: null,
  siteId: null,
  startedAt: '2026-10-12T13:05:00.000Z',
  endedAt: '2026-10-12T13:40:00.000Z',
  deviceUtcOffsetMinutes: -240,
  startLatitude: '39.15650000',
  startLongitude: '-75.52330000',
  endLatitude: '39.15650000',
  endLongitude: '-75.52330000',
  address: '14 Oak St',
  addressSource: 'LOOKED_UP',
  notes: null,
  formDebrisTypeId: vegetative,
  fieldTagId: null,
  roeNumber: null,
  estimateCy: null,
  loadCall: null,
  scaleReceiptId: null,
  carriedCount: null,
  kindOfWorkId: null,
  payableTypeId: null,
  payItemId: null,
  unitCount: null,
  measurementInches: null,
  measuredAs: null,
  rootBallInches: null,
  rootBallHalfExposed: null,
  surveyNumber: null,
  markedIneligible: null,
  items: [],
  carriedTickets: [],
};

// Kim's disposal on it at the tower.
export const disposal: SyncedFieldEvent = {
  ...collection,
  id: made('2'),
  kind: 'DISPOSAL',
  monitorId: kim,
  siteId: landfill,
  startedAt: '2026-10-12T14:22:00.000Z',
  endedAt: '2026-10-12T14:26:00.000Z',
  address: null,
  addressSource: null,
  loadCall: 85,
};

export const form = {
  projectId: p1,
  monitorId: ana,
  assignmentId: assignment,
  setupVersion: 3,
  madeAt: '2026-10-12T15:10:00.000Z',
  deviceUtcOffsetMinutes: -240,
  latitude: '39.15650000',
  longitude: '-75.52330000',
  notes: null,
};

const unmeasured = {
  length: null,
  secondLength: null,
  width: null,
  height: null,
  diameter: null,
  radius: null,
  run: null,
  corners: null,
};

// Sam's certification of Rivera's self-loader as 730416, Lee helping (`spec/CONVENTIONS.md` §6):
// the primary box and a dog box, a triangle, subtracted. They work out to 48 CY, which the phone
// never sends.
export const certification: SyncedCertification = {
  id: made('8'),
  projectId: p1,
  certNumber: '730416',
  kind: 'CONTAINER',
  primeId: coastline,
  firstTierSub: 'Rivera Trucking',
  secondTierSub: null,
  vehicleTypeId: made('f5'),
  vehicleTypeOther: null,
  crewTypeId: null,
  boxes: [
    {
      ...unmeasured,
      featureId: null,
      featureOther: null,
      shape: 'RECTANGLE',
      sign: 'ADD',
      length: 264,
      width: 92,
      height: 96,
    },
    {
      ...unmeasured,
      featureId: dogBox,
      featureOther: null,
      shape: 'TRIANGLE',
      sign: 'SUBTRACT',
      length: 36,
      width: 92,
      height: 48,
    },
  ],
  driverName: 'Marco Rivera',
  driverPhone: null,
  driverLicenceNumber: 'R160-542-80-112-0',
  driverLicenceState: 'FL',
  driverLicenceExpiry: '2028-03-31',
  tagNumber: 'RVT 4821',
  tagState: 'FL',
  tagExpiry: '2027-03-31',
  certifiedAt: '2026-10-10T13:40:00.000Z',
  deviceUtcOffsetMinutes: -240,
  certifiedById: sam,
  assignmentId: assignment,
  helperIds: [lee],
  clientRepresentativeName: null,
  contractorRepresentativeName: null,
  replaces: null,
  notes: null,
};

// Coastline's bucket truck crew as 730417: nothing measured.
export const crew: SyncedCertification = {
  ...certification,
  id: made('9'),
  certNumber: '730417',
  kind: 'CREW',
  firstTierSub: null,
  vehicleTypeId: null,
  vehicleTypeOther: 'Bucket',
  crewTypeId: made('f6'),
  boxes: [],
  driverName: null,
  driverLicenceNumber: null,
  driverLicenceState: null,
  driverLicenceExpiry: null,
  tagNumber: null,
  tagState: null,
  tagExpiry: null,
  helperIds: [],
};

// A fingerprint as a phone takes one: of the example's own words, for a file the examples don't
// hold.
const fingerprint = (of: string): string => {
  const padded = of.padEnd(32, '.');
  let hex = '';
  for (let place = 0; place < 32; place += 1) {
    hex += (padded.charCodeAt(place) % 256).toString(16).padStart(2, '0');
  }
  return hex;
};

// The photograph Ana took of the pile at 14 Oak St with her collection; never where its file is
// kept, which the server makes (ADR-481).
export const pilePhoto: SyncedPhoto = {
  id: made('20'),
  projectId: p1,
  owner: { kind: 'FIELD_EVENT', id: collection.id },
  view: null,
  takenById: ana,
  capturedAt: '2026-10-12T13:38:00.000Z',
  deviceUtcOffsetMinutes: -240,
  latitude: '39.15650000',
  longitude: '-75.52330000',
  originalSha256: fingerprint('14 Oak St pile, as taken'),
  uploadedSha256: fingerprint('14 Oak St pile, as uploaded'),
  depthFile: false,
};

// Sam's five of 730416, one a view, taken as it was certified (ADR-179).
export const certificationPhotos: SyncedPhoto[] = certificationViews.map((view, place) => ({
  id: made(`2${String(place + 1)}`),
  projectId: p1,
  owner: { kind: 'CERTIFICATION', id: certification.id },
  view,
  takenById: sam,
  capturedAt: `2026-10-10T13:3${String(place)}:00.000Z`,
  deviceUtcOffsetMinutes: -240,
  latitude: null,
  longitude: null,
  originalSha256: fingerprint(`730416 ${view}, as taken`),
  uploadedSha256: fingerprint(`730416 ${view}, as uploaded`),
  depthFile: view === 'INTERIOR_OR_BACK',
}));

// One of each kind, as a phone sends them.
export const records: SyncedRecord[] = [
  { record: 'FIELD_EVENT', fieldEvent: collection },
  {
    record: 'SCALE_RECEIPT',
    scaleReceipt: {
      id: made('3'),
      projectId: p1,
      receiptNumber: 'BCL-88241',
      siteId: landfill,
      grossWeightLb: 61_240,
      tareWeightLb: 33_100,
      netWeightLb: 28_140,
      netWeightTons: 14.07,
      enteredById: kim,
      enteredAt: '2026-10-12T14:26:00.000Z',
      deviceUtcOffsetMinutes: -240,
    },
  },
  {
    record: 'INCIDENT',
    incident: {
      ...form,
      id: made('4'),
      incidentTypeId: made('f1'),
      incidentSubTypeId: null,
      description: 'Mailbox struck while loading',
      parties: null,
      address: '14 Oak St',
      contractorId: null,
      certNumber: '730415',
      roeNumber: null,
    },
  },
  {
    record: 'DROP_OFF_LOG',
    dropOffLog: {
      ...form,
      id: made('5'),
      siteId: landfill,
      residentName: null,
      originAddress: '22 Elm St',
    },
  },
  {
    record: 'SURVEY',
    survey: {
      ...form,
      id: made('6'),
      workTypeId: made('f2'),
      surveyNumber: null,
      roeNumber: 'R-0007',
      formDefinitionId: made('f3'),
      answers: { fence: 'Standing', photographed: true, gates: 2 },
    },
  },
  {
    record: 'ROE',
    roe: {
      id: made('7'),
      projectId: p1,
      roeNumber: 'R-0007',
      parcelId: null,
      address: '40 Birch Ln',
      ownerName: null,
      signed: true,
      signedDate: '2026-10-09',
      madeById: ana,
      assignmentId: assignment,
      madeAt: '2026-10-12T12:50:00.000Z',
      deviceUtcOffsetMinutes: -240,
    },
  },
  { record: 'CERTIFICATION', certification },
];

// Tariq had no assignment on Monday: the tower's phone was set up for him under the passcode.
export const unplanned: SyncSent['unplannedAssignments'][number] = {
  id: made('c2'),
  projectId: p1,
  personId: made('b3'),
  fieldEventKinds: ['DISPOSAL'],
  certifying: false,
  formDocumentTypes: [],
  siteId: landfill,
  payItemIds: [],
  occasion: 'SETUP',
  madeAt: '2026-10-12T11:50:00.000Z',
  deviceUtcOffsetMinutes: -240,
};

// The phone passed to Kim, who has her own assignment, with no connection.
export const switched: SyncSent['passcodeUses'][number] = {
  id: made('c3'),
  use: 'MONITOR_SWITCH',
  personId: kim,
  loggedAt: '2026-10-12T16:02:00.000Z',
  deviceUtcOffsetMinutes: -240,
};

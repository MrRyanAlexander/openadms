// The example world's records as a phone sends them, for the contract's own tests (ADR-466, 467):
// one of each kind, from Monday on P1.
import type { SyncedFieldEvent, SyncedRecord } from '../../src/index.ts';

export const made = (last: string): string => `019a0000-0000-7000-8000-${last.padStart(12, '0')}`;
export const p1 = made('p1'.replace('p', 'a'));
export const ana = made('b1');
export const kim = made('b2');
export const assignment = made('c1');
export const vegetative = made('d1');
export const landfill = made('e1');

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
];

// What each of the firm's lists starts with (spec/LISTS.md Group 1; ADR-070, 302). The installer's
// seed writes them once, into an empty list; from then on every value is the firm's to rename,
// reorder, archive and add to, and the seed never touches one again. A value with a key is a
// built-in value: the key's type is packages/domain's closed set, so no other key can be written
// here. Site labels, incident sub-types and every project's field tags start empty.
//
// Where LISTS.md leaves a list's values open (the reasons, the item names, which program types
// require an ROE), these are agent defaults, ADR-302: the firm's to change, the user's to overturn.
import type { BuiltInKey, ListWithBuiltInValues } from '@open-adms/domain';

import type { CertificationKind, CountShape, ReasonUse } from './generated/prisma/client.ts';

interface Value {
  readonly name: string;
}

// A value of a list that has built-in values: built in when it carries a key.
interface KeyedValue<List extends ListWithBuiltInValues> extends Value {
  readonly key?: BuiltInKey<List>;
}

interface ProgramTypeValue extends Value {
  readonly requiresRoe: boolean;
}

interface KindOfWorkValue extends KeyedValue<'kindOfWork'> {
  readonly countShape: CountShape;
  // The item names offered on a ticket of an itemised kind; none on a kind that counts a number.
  readonly items: readonly string[];
}

interface VehicleTypeValue extends Value {
  readonly certifies: CertificationKind;
}

interface ReasonValue extends Value {
  readonly uses: readonly ReasonUse[];
}

export interface StartingValues {
  readonly programTypes: readonly ProgramTypeValue[];
  readonly declarationReferenceTypes: readonly Value[];
  readonly debrisTypes: readonly Value[];
  readonly reductionMethods: readonly Value[];
  readonly payableTypes: readonly Value[];
  readonly kindsOfWork: readonly KindOfWorkValue[];
  readonly vehicleTypes: readonly VehicleTypeValue[];
  readonly vehicleFeatures: readonly Value[];
  readonly crewTypes: readonly Value[];
  readonly siteTypes: readonly KeyedValue<'siteType'>[];
  readonly incidentTypes: readonly Value[];
  readonly reasons: readonly ReasonValue[];
  readonly surveyWorkTypes: readonly KeyedValue<'surveyWorkType'>[];
  readonly clockActivities: readonly Value[];
}

const named = (...names: string[]): Value[] => names.map((name) => ({ name }));

// USACE's twelve umbrella debris types (spec/CONVENTIONS.md §4): what the debris type library and
// the payable types both start from.
const umbrellaTypes = [
  'C&D',
  'Vegetative',
  'Metals',
  'Concrete',
  'White Goods',
  'Titled Property (vehicles and vessels)',
  'HHW',
  'RACM',
  'Soil',
  'Leaners',
  'Hangers',
  'Stumps',
];

export const startingValues: StartingValues = {
  // PPDR is private property, so it requires an ROE (the golden mission's P2); the other three are
  // public property and don't.
  programTypes: [
    { name: 'ROW', requiresRoe: false },
    { name: 'PARKS', requiresRoe: false },
    { name: 'PPDR', requiresRoe: true },
    { name: 'WATERWAY', requiresRoe: false },
  ],
  declarationReferenceTypes: named(
    'FEMA disaster (DR)',
    'FEMA emergency (EM)',
    'State',
    'Local',
    'Internal',
  ),
  debrisTypes: named(...umbrellaTypes),
  reductionMethods: named('Grinding', 'Incineration', 'Compaction'),
  payableTypes: named(...umbrellaTypes, 'Crew time', 'Tipping fee'),
  // The item names are the ones the spec's own examples use (spec/RULES.md §9, the golden mission's
  // tickets 301006 and 301007, spec/LISTS.md); a firm adds its contract's.
  kindsOfWork: [
    { name: 'Hangers', countShape: 'NUMBER', items: [] },
    { name: 'Leaners', countShape: 'NUMBER', items: [] },
    { key: 'STUMPS', name: 'Stumps', countShape: 'NUMBER', items: [] },
    { name: 'HHW', countShape: 'ITEM_COUNTS', items: ['Paint cans', 'Propane tanks', 'Pesticide'] },
    {
      name: 'White Goods',
      countShape: 'ITEM_COUNTS',
      items: [
        'Washer',
        'Dryer',
        'Fridge, freon recovered',
        'Fridge, no freon',
        'Fridge, freon staged',
        'Oven',
        'Microwave',
      ],
    },
    { name: 'Crew time', countShape: 'ITEM_HOURS', items: ['Skid Steer', 'Truck', 'Sign'] },
  ],
  // Each of these is a measured container. "Other (typed)" is no value of the list: it is a text
  // beside the pick on the certification (spec/DATA-MODEL.md §2.3).
  vehicleTypes: [
    { name: 'Dump Truck', certifies: 'CONTAINER' },
    { name: 'Semi-Trailer', certifies: 'CONTAINER' },
    { name: 'Hydraulic Dump Trailer', certifies: 'CONTAINER' },
    { name: 'Non-Hydraulic Dump Trailer', certifies: 'CONTAINER' },
    { name: 'Self-Loading Truck', certifies: 'CONTAINER' },
  ],
  vehicleFeatures: named(
    'Sideboards',
    'Tail Gate Extension',
    'Dog Box',
    'Wheel Wells',
    'Curved/Angled Sides/Floor',
  ),
  crewTypes: named('Bucket Truck', 'Skid Steer'),
  siteTypes: [
    { key: 'TDSR', name: 'TDSR/DMS' },
    { key: 'FINAL_DISPOSAL', name: 'Final Disposal' },
    { name: 'Transfer Station' },
    { name: 'Other' },
  ],
  incidentTypes: named(
    'Property damage',
    'Personal injury',
    'Near miss',
    'Equipment failure',
    'Environmental',
    'Other',
  ),
  // A few for each use, each offered for that one use.
  reasons: [
    { name: 'Duplicate ticket', uses: ['VOID'] },
    { name: 'Work never happened', uses: ['VOID'] },
    { name: 'Not eligible work', uses: ['VOID'] },
    { name: 'Barcode damaged', uses: ['TYPED_NUMBER'] },
    { name: 'Scanner not working', uses: ['TYPED_NUMBER'] },
    { name: 'Photos confirm', uses: ['ACCEPT_FLAG'] },
    { name: 'Confirmed with the monitor', uses: ['ACCEPT_FLAG'] },
    { name: 'Device failed', uses: ['BACK_OFFICE_RECORD'] },
    { name: 'Device lost', uses: ['BACK_OFFICE_RECORD'] },
    { name: 'Lost in the field', uses: ['PHONE_REMOVAL'] },
    { name: 'Stolen', uses: ['PHONE_REMOVAL'] },
    { name: 'Broken', uses: ['PHONE_REMOVAL'] },
    { name: 'Replaced', uses: ['PHONE_REMOVAL'] },
  ],
  surveyWorkTypes: [
    { key: 'PRE_WORK', name: 'Pre-work survey' },
    { key: 'POST_WORK', name: 'Post-work survey' },
    { key: 'ROE', name: 'ROE' },
  ],
  clockActivities: named('Travel', 'Standby', 'Training'),
};

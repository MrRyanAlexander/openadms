// One receipt content model (ARCHITECTURE §12; REQ-314; Q-95; ADR-102, 115, 213, 595): what a
// receipt says, as structured data, made once from what was recorded and rendered two ways, ZPL
// for the Zebra and PDF for the browser build and the back office (`zpl.ts`, `pdf.ts`). The field
// app makes it from a ticket or a certification its phone holds; the back office's receipt batch
// (REQ-414, Phase 4) makes it from what it reads; both print the same words in the same order.
//
// - **A receipt is never a record** (the user, Q-95 (Q6)): made on the fly from the field event or
//   the certification, printed, and forgotten. Nothing here writes, counts or remembers anything,
//   so it is reprinted at any time, the next day too, exactly as it first printed.
// - **What it carries, in the user's order** (Q-95): the ticket number at the top with its barcode
//   (Code 128 of the bare number, never a label or a split's suffix: `code128.ts`), the truck, the
//   load's details, then who made it and when, in the project's time zone (ADR-100). A unit rate
//   ticket prints the pay item the phone worked out from the bands (ADR-213; REQ-306), by its code,
//   the one code a phone holds; **never a rate** (invariant 20). A certification's is itemised:
//   each box measured, and the capacity worked out (adms-certifications §3A.3), never typed. **A
//   driver's phone and licence numbers are left off** (*agent default*: paper handed over and lost
//   is a stranger's; a viewer never sees them either, ADR-169).
// - **Its copies** (ARCHITECTURE §12; AC-04-97): a collection two, the driver's and the monitor's,
//   or none where its number is a control ticket's (the control ticket is handed over and its stub
//   kept, the user, Q-95 (Q2)); the driver's at a disposal and at both ends of a haul-out (a
//   haul-out prints at its loading end even from control tickets, ADR-115); the crew's of unit
//   rate work; a certification's, the driver's or the crew's. **Printed again, the same copies**;
//   a control ticket's collection, the driver's alone (*agent default*: the control ticket
//   damaged). Every project prints: no setting turns it off.
import { Capacity, type BoxShape, type BoxSign, type MeasuredAs } from '@open-adms/domain';

import { Code128 } from './code128.ts';
import english from './words/en.json' with { type: 'json' };

export type ReceiptWords = typeof english;
export const printedWords: ReceiptWords = english;

export type TicketReceiptKind =
  'COLLECTION' | 'DISPOSAL' | 'HAUL_OUT_COLLECTION' | 'HAUL_OUT_DISPOSAL' | 'UNIT_RATE';
export type ReceiptKind = TicketReceiptKind | 'CERTIFICATION';
export type ReceiptCopy = 'DRIVER' | 'MONITOR' | 'CREW';

// One block of what prints: a line of words, at one of three sizes, or the barcode.
export type PrintedBlock =
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly size: 'small' | 'normal' | 'large';
      readonly bold: boolean;
    }
  | { readonly kind: 'barcode'; readonly data: string };

export interface ReceiptLine {
  readonly label: string;
  readonly value: string;
}

export interface ReceiptSection {
  readonly title: string;
  readonly lines: readonly ReceiptLine[];
}

// The receipt itself: every word it prints, in order, and the copies it prints at submit.
export interface Receipt {
  readonly kind: ReceiptKind;
  // "Collection", "Certification"…
  readonly title: string;
  readonly project: string;
  // "Ticket 101001-A", "Certification 730419": the number as the ticket shows it.
  readonly heading: string;
  // The barcode's data: the bare number.
  readonly barcode: string;
  readonly sections: readonly ReceiptSection[];
  readonly copies: readonly ReceiptCopy[];
}

// Who made it, by name and Monitor ID.
export interface ReceiptMonitor {
  readonly name: string;
  readonly monitorNumber: string;
}

// The truck or crew the badge loaded, as the phone holds its certification; a truck keyed in by
// hand has none, only its number and the capacity typed (ADR-153, C127).
export interface ReceiptTruck {
  readonly certNumber: string;
  readonly crew: boolean;
  readonly capacityCy: number | null;
  readonly prime: string | null;
  readonly sub: string | null;
  readonly keyedByHand: boolean;
  readonly typedCapacityCy: number | null;
}

export interface ReceiptScaleReceipt {
  readonly receiptNumber: string;
  readonly grossWeightLb: number | null;
  readonly tareWeightLb: number | null;
  readonly netWeightLb: number | null;
  readonly netWeightTons: number | null;
}

export interface ReceiptUnitRate {
  readonly payableType: string | null;
  // The pay item the phone worked out from the bands, by its code.
  readonly payItem: string | null;
  readonly count: number | null;
  readonly measurement: { readonly inches: number; readonly as: MeasuredAs } | null;
  readonly rootBallInches: number | null;
  readonly halfExposed: boolean | null;
  readonly surveyNumber: string | null;
  readonly ineligible: boolean | null;
  // Itemised work: each item with its count, or its hours.
  readonly items: readonly {
    readonly name: string;
    readonly quantity: number;
    readonly hours: boolean;
  }[];
}

// What a ticket's receipt is made from: its field event as its monitor recorded it, with the
// names the phone's lists give what was picked.
export interface TicketReceiptFacts {
  readonly kind: TicketReceiptKind;
  readonly project: string;
  readonly timeZone: string;
  readonly ticketNumber: string;
  readonly splitSuffix: string;
  // Whether its number is a pre-printed control ticket's, scanned or typed off it.
  readonly controlTicket: boolean;
  readonly truck: ReceiptTruck;
  readonly monitor: ReceiptMonitor;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly site: string | null;
  readonly debrisType: string | null;
  readonly estimateCy: number | null;
  readonly loadCall: number | null;
  readonly carriedCount: number | null;
  readonly scaleReceipt: ReceiptScaleReceipt | null;
  readonly roeNumber: string | null;
  readonly address: string | null;
  readonly end: { readonly latitude: string; readonly longitude: string } | null;
  readonly unitRate: ReceiptUnitRate | null;
}

export interface ReceiptBox {
  // The feature's name; none for the main box.
  readonly name: string | null;
  readonly shape: BoxShape;
  readonly sign: BoxSign;
  readonly length: number | null;
  readonly secondLength: number | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly diameter: number | null;
  readonly radius: number | null;
  readonly run: number | null;
  readonly corners: number | null;
}

// What a certification's itemised receipt is made from (adms-certifications §3A).
export interface CertificationReceiptFacts {
  readonly project: string;
  readonly timeZone: string;
  readonly certNumber: string;
  readonly crew: boolean;
  readonly prime: string | null;
  readonly sub: string | null;
  readonly driver: string | null;
  // The vehicle type or the crew type, by name.
  readonly vehicle: string | null;
  readonly tag: string | null;
  readonly boxes: readonly ReceiptBox[];
  readonly certifiedAt: Date;
  readonly monitor: ReceiptMonitor;
  readonly helpers: readonly string[];
}

const said = english;
const numbered = new Intl.NumberFormat(english.language);

// A word with its gaps filled; a gap nobody filled is a mistake here, never printed as `{name}`.
function say(word: string, filling: Readonly<Record<string, string | number>>): string {
  return word.replace(/\{(\w+)\}/g, (_gap, name: string) => {
    const value = filling[name];
    if (value === undefined) throw new Error(`"${word}" has a gap {${name}} nobody filled.`);
    return typeof value === 'number' ? numbered.format(value) : value;
  });
}

// A moment in the project's time zone, with the zone's own short name.
function when(moment: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(english.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  })
    .format(moment)
    .concat(' ', zoneName(moment, timeZone));
}

function zoneName(moment: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(english.language, {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(moment);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? timeZone;
}

const line = (label: string, value: string | null | undefined): ReceiptLine[] =>
  value === null || value === undefined || value === '' ? [] : [{ label, value }];

const yesOrNo = (value: boolean): string => (value ? said.lines.yes : said.lines.no);

function contractor(prime: string | null, sub: string | null): string | null {
  if (prime === null) return sub;
  return sub === null ? prime : say(said.lines.subOf, { sub, prime });
}

function truckLines(truck: ReceiptTruck): ReceiptLine[] {
  const capacity = truck.keyedByHand
    ? truck.typedCapacityCy === null
      ? null
      : say(said.lines.keyedCapacity, { capacity: truck.typedCapacityCy })
    : truck.capacityCy === null
      ? null
      : say(said.lines.capacityCy, { capacity: truck.capacityCy });
  return [
    { label: said.lines.certNumber, value: truck.certNumber },
    ...line(said.lines.capacity, truck.crew ? null : capacity),
    ...line(said.lines.contractor, contractor(truck.prime, truck.sub)),
    ...(truck.keyedByHand ? [{ label: said.lines.keyedByHand, value: said.lines.yes }] : []),
  ];
}

function loadLines(facts: TicketReceiptFacts): ReceiptLine[] {
  const receipt = facts.scaleReceipt;
  const pounds = (weight: number | null) =>
    weight === null ? null : say(said.lines.pounds, { weight });
  return [
    ...line(said.lines.site, facts.site),
    ...line(said.lines.debrisType, facts.debrisType),
    ...line(
      said.lines.estimate,
      facts.estimateCy === null ? null : say(said.lines.estimateCy, { estimate: facts.estimateCy }),
    ),
    ...line(
      said.lines.loadCall,
      facts.loadCall === null ? null : say(said.lines.loadCallPercent, { call: facts.loadCall }),
    ),
    ...line(
      said.lines.carried,
      facts.carriedCount === null ? null : numbered.format(facts.carriedCount),
    ),
    ...line(said.lines.scaleReceipt, receipt?.receiptNumber),
    ...line(said.lines.gross, pounds(receipt?.grossWeightLb ?? null)),
    ...line(said.lines.tare, pounds(receipt?.tareWeightLb ?? null)),
    ...line(said.lines.net, pounds(receipt?.netWeightLb ?? null)),
    ...line(
      said.lines.net,
      receipt?.netWeightTons === null || receipt?.netWeightTons === undefined
        ? null
        : say(said.lines.tons, { weight: receipt.netWeightTons }),
    ),
    ...line(said.lines.roe, facts.roeNumber),
    ...line(said.lines.address, facts.address),
    ...line(
      said.lines.gps,
      facts.end === null ? null : `${facts.end.latitude}, ${facts.end.longitude}`,
    ),
  ];
}

function workLines(facts: TicketReceiptFacts, work: ReceiptUnitRate): ReceiptLine[] {
  const inches = (value: number | null) =>
    value === null ? null : say(said.lines.inches, { inches: value });
  return [
    ...line(said.lines.payableType, work.payableType),
    ...line(said.lines.payItem, work.payItem),
    ...line(said.lines.count, work.count === null ? null : numbered.format(work.count)),
    ...(work.measurement === null
      ? []
      : line(
          work.measurement.as === 'CIRCUMFERENCE'
            ? said.lines.measuredAround
            : said.lines.measuredAcross,
          inches(work.measurement.inches),
        )),
    ...line(said.lines.rootBall, inches(work.rootBallInches)),
    ...line(said.lines.halfExposed, work.halfExposed === null ? null : yesOrNo(work.halfExposed)),
    ...line(said.lines.survey, work.surveyNumber),
    ...work.items.map((item) => ({
      label: item.name,
      value: item.hours
        ? say(said.lines.hours, { hours: item.quantity })
        : numbered.format(item.quantity),
    })),
    ...(work.ineligible === true ? [{ label: said.lines.ineligible, value: said.lines.yes }] : []),
    ...line(said.lines.roe, facts.roeNumber),
    ...line(said.lines.address, facts.address),
    ...line(
      said.lines.gps,
      facts.end === null ? null : `${facts.end.latitude}, ${facts.end.longitude}`,
    ),
  ];
}

function whoLines(
  monitor: ReceiptMonitor,
  timeZone: string,
  times: readonly (readonly [string, Date | null])[],
): ReceiptLine[] {
  return [
    { label: said.lines.monitor, value: `${monitor.name} (${monitor.monitorNumber})` },
    ...times.flatMap(([label, moment]) =>
      moment === null ? [] : [{ label, value: when(moment, timeZone) }],
    ),
  ];
}

// A ticket's copies at submit (ARCHITECTURE §12; AC-04-97).
function ticketCopies(facts: TicketReceiptFacts): readonly ReceiptCopy[] {
  switch (facts.kind) {
    case 'COLLECTION':
      return facts.controlTicket ? [] : ['DRIVER', 'MONITOR'];
    case 'UNIT_RATE':
      return ['CREW'];
    case 'DISPOSAL':
    case 'HAUL_OUT_COLLECTION':
    case 'HAUL_OUT_DISPOSAL':
      return ['DRIVER'];
  }
}

// Its barcode checked before anything prints: the bare number Code 128 can carry.
function checked(receipt: Receipt): Receipt {
  new Code128(receipt.barcode);
  return receipt;
}

export const Receipts = {
  // A ticket's receipt, from its field event.
  ofTicket(facts: TicketReceiptFacts): Receipt {
    const shown =
      facts.splitSuffix === '' ? facts.ticketNumber : `${facts.ticketNumber}-${facts.splitSuffix}`;
    const work = facts.unitRate;
    const ended = facts.endedAt ?? facts.startedAt;
    return checked({
      kind: facts.kind,
      title: said.titles[facts.kind],
      project: facts.project,
      heading: say(said.ticket, { number: shown }),
      barcode: facts.ticketNumber,
      sections: [
        {
          title: facts.truck.crew ? said.sections.crew : said.sections.truck,
          lines: truckLines(facts.truck),
        },
        {
          title: work === null ? said.sections.load : said.sections.work,
          lines: work === null ? loadLines(facts) : workLines(facts, work),
        },
        {
          title: said.sections.who,
          lines: whoLines(facts.monitor, facts.timeZone, [
            [said.lines.started, facts.startedAt],
            [said.lines.ended, ended],
          ]),
        },
      ],
      copies: ticketCopies(facts),
    });
  },

  // A certification's itemised receipt (adms-certifications §3A): each box as measured, and the
  // capacity the domain's `Capacity` works out from them.
  ofCertification(facts: CertificationReceiptFacts): Receipt {
    const reading = new Capacity(
      facts.crew ? 'CREW' : 'CONTAINER',
      facts.crew ? [] : facts.boxes.map((box, position) => ({ ...box, position })),
    ).work();
    const boxes = facts.crew
      ? [{ label: said.lines.crewNotMeasured, value: '' }]
      : facts.boxes.map((box, position) => ({
          label:
            position === 0
              ? said.lines.primary
              : `${box.name ?? ''} (${box.sign === 'ADD' ? said.lines.adds : said.lines.subtracts})`,
          value: measurementsOf(box),
        }));
    return checked({
      kind: 'CERTIFICATION',
      title: said.titles.CERTIFICATION,
      project: facts.project,
      heading: say(said.certification, { number: facts.certNumber }),
      barcode: facts.certNumber,
      sections: [
        {
          title: facts.crew ? said.sections.crew : said.sections.container,
          lines: [
            { label: said.lines.certNumber, value: facts.certNumber },
            ...line(
              said.lines.capacity,
              facts.crew || reading.capacityCy === null
                ? null
                : say(said.lines.capacityCy, { capacity: reading.capacityCy }),
            ),
            ...line(said.lines.contractor, contractor(facts.prime, facts.sub)),
            ...line(said.lines.driver, facts.driver),
            ...line(said.lines.vehicle, facts.vehicle),
            ...line(said.lines.tag, facts.tag),
          ],
        },
        { title: said.sections.boxes, lines: boxes },
        {
          title: said.sections.who,
          lines: [
            ...whoLines(facts.monitor, facts.timeZone, [[said.lines.certified, facts.certifiedAt]]),
            ...line(said.lines.helpers, facts.helpers.join(', ')),
          ],
        },
      ],
      copies: [facts.crew ? 'CREW' : 'DRIVER'],
    });
  },

  // What a receipt printed again gives: its copies again, or a control ticket's collection's
  // driver's copy, where it printed none.
  again(receipt: Receipt): readonly ReceiptCopy[] {
    return receipt.copies.length === 0 ? ['DRIVER'] : receipt.copies;
  },

  // A copy's name, as it prints.
  copyName(copy: ReceiptCopy): string {
    return said.copies[copy];
  },

  // What a copy prints, block by block, in order: both renderers lay out these and nothing else,
  // so the PDF and the ZPL carry the same words and the same barcode (AC-11-46).
  printed(receipt: Receipt, copy: ReceiptCopy): PrintedBlock[] {
    return [
      { kind: 'text', text: receipt.title, size: 'normal', bold: true },
      { kind: 'text', text: Receipts.copyName(copy), size: 'normal', bold: false },
      { kind: 'text', text: receipt.project, size: 'small', bold: false },
      { kind: 'text', text: receipt.heading, size: 'large', bold: true },
      { kind: 'barcode', data: receipt.barcode },
      { kind: 'text', text: receipt.barcode, size: 'small', bold: false },
      ...receipt.sections.flatMap((section): PrintedBlock[] => [
        { kind: 'text', text: section.title, size: 'normal', bold: true },
        ...section.lines.map(({ label, value }): PrintedBlock => ({
          kind: 'text',
          text: value === '' ? label : `${label}: ${value}`,
          size: 'small',
          bold: false,
        })),
      ]),
    ];
  },

  // Every line of words a copy prints, in order.
  wordsOf(receipt: Receipt, copy: ReceiptCopy): string[] {
    return Receipts.printed(receipt, copy).flatMap((block) =>
      block.kind === 'text' ? [block.text] : [],
    );
  },
} as const;

// A box's measurements as measured, in whole inches, only those its shape holds.
function measurementsOf(box: ReceiptBox): string {
  const kept = Capacity.measurementsOf(box.shape);
  const said = english.measurements;
  return kept
    .flatMap((name) => {
      const value = box[name];
      if (value === null) return [];
      return [
        name === 'corners'
          ? say(said.corners, { corners: value })
          : say(said[name], { inches: numbered.format(value) }),
      ];
    })
    .join(' × ');
}

// A line of words broken at spaces to at most so many characters a line; a word longer than a
// line is broken where the line ends. Both renderers wrap with it.
export function wrapped(text: string, characters: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter((part) => part !== '')) {
    let rest = word;
    while (rest.length > characters) {
      if (current !== '') lines.push(current);
      lines.push(rest.slice(0, characters));
      rest = rest.slice(characters);
      current = '';
    }
    if (current === '') current = rest;
    else if (current.length + 1 + rest.length <= characters) current = `${current} ${rest}`;
    else {
      lines.push(current);
      current = rest;
    }
  }
  if (current !== '') lines.push(current);
  return lines.length === 0 ? [''] : lines;
}

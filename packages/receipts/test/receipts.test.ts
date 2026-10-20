// One receipt content model, rendered to PDF and ZPL (ARCHITECTURE §12; REQ-314; AC-04-97,
// AC-11-46, 48, 50; ADR-115, 213, 595), in the example world's words (spec/CONVENTIONS.md §6):
// Ana Brooks's collection 101001 on P1 with Coastline's 730415, Kim Nguyen's disposal of it at
// Bayline County Landfill, Jo Kim's hanger 301001 for the crew 730417, Sam Grant's certification
// of 730415.
import { describe, expect, it } from 'vitest';

import {
  Code128,
  controlTicketSheet,
  receiptLabel,
  receiptPage,
  Receipts,
  receiptsPdf,
  receiptsZpl,
  printedWords,
  pdfOf,
  wrapped,
  zplText,
  type CertificationReceiptFacts,
  type Receipt,
  type ReceiptCopy,
  type TicketReceiptFacts,
} from '../src/index.ts';
import { pdfRead, scanned, zplRead } from './read.ts';

const timeZone = 'America/New_York';
const p1 = 'Bayline County ROW, Hurricane Delphine';
const ana = { name: 'Ana Brooks', monitorNumber: 'M004127' };
const coastline730415 = {
  certNumber: '730415',
  crew: false,
  capacityCy: 65,
  prime: 'Coastline Haulers LLC',
  sub: null,
  keyedByHand: false,
  typedCapacityCy: null,
};

const collection: TicketReceiptFacts = {
  kind: 'COLLECTION',
  project: p1,
  timeZone,
  ticketNumber: '101001',
  splitSuffix: '',
  controlTicket: false,
  truck: coastline730415,
  monitor: ana,
  startedAt: new Date('2026-10-12T12:41:00Z'),
  endedAt: new Date('2026-10-12T13:05:00Z'),
  site: null,
  debrisType: 'Vegetative',
  estimateCy: 40,
  loadCall: null,
  carriedCount: null,
  scaleReceipt: null,
  roeNumber: null,
  address: '14 Heron St',
  end: { latitude: '39.13850000', longitude: '-75.55370000' },
  unitRate: null,
};

const disposal: TicketReceiptFacts = {
  ...collection,
  kind: 'DISPOSAL',
  monitor: { name: 'Kim Nguyen', monitorNumber: 'M004128' },
  site: 'Bayline County Landfill',
  estimateCy: null,
  loadCall: 80,
  address: null,
  end: null,
};

const hangerWork = {
  payableType: 'Hangers',
  payItem: 'HNG-RMV-EA',
  count: 3,
  measurement: { inches: 8, as: 'DIAMETER' as const },
  rootBallInches: null,
  halfExposed: null,
  surveyNumber: null,
  ineligible: null,
  items: [],
};

const hanger: TicketReceiptFacts = {
  ...collection,
  kind: 'UNIT_RATE',
  ticketNumber: '301001',
  truck: { ...coastline730415, certNumber: '730417', crew: true, capacityCy: null },
  monitor: { name: 'Jo Kim', monitorNumber: 'M004130' },
  debrisType: null,
  estimateCy: null,
  unitRate: hangerWork,
};

const certification: CertificationReceiptFacts = {
  project: p1,
  timeZone,
  certNumber: '730415',
  crew: false,
  prime: 'Coastline Haulers LLC',
  sub: null,
  driver: 'Dale Price',
  vehicle: 'Hydraulic Dump Trailer',
  tag: 'TRL 4471 FL',
  boxes: [
    {
      name: null,
      shape: 'RECTANGLE',
      sign: 'ADD',
      length: 360,
      secondLength: null,
      width: 96,
      height: 72,
      diameter: null,
      radius: null,
      run: null,
      corners: null,
    },
    {
      name: 'Sideboards',
      shape: 'RECTANGLE',
      sign: 'ADD',
      length: 360,
      secondLength: null,
      width: 96,
      height: 16,
      diameter: null,
      radius: null,
      run: null,
      corners: null,
    },
  ],
  certifiedAt: new Date('2026-10-10T13:00:00Z'),
  monitor: { name: 'Sam Grant', monitorNumber: 'M004131' },
  helpers: ['Lee Morgan'],
};

const said = printedWords;
const lineOf = (receipt: Receipt, label: string) =>
  receipt.sections.flatMap((section) => section.lines).find((line) => line.label === label)?.value;

// What prints, its wrapped lines joined back: the same words either way.
const joined = (words: readonly string[]) => words.join(' ').replace(/\s+/g, ' ');

describe('the receipt content model', () => {
  it('AC-11-46, AC-04-97: collection 101001 says, in the user’s order, the number at the top, the truck, the load, then who made it and when, in the project’s time zone', () => {
    const receipt = Receipts.ofTicket(collection);
    expect(receipt.barcode).toBe('101001');
    expect(Receipts.wordsOf(receipt, 'DRIVER')).toEqual([
      'Collection',
      'Driver’s copy',
      p1,
      'Ticket 101001',
      '101001',
      'Truck',
      'Cert number: 730415',
      'Capacity: 65 CY',
      'Contractor: Coastline Haulers LLC',
      'Load',
      'Debris type: Vegetative',
      'Estimate: 40 CY',
      'Address: 14 Heron St',
      'GPS: 39.13850000, -75.55370000',
      'Monitor and times',
      'Monitor: Ana Brooks (M004127)',
      'Started: Oct 12, 2026, 8:41 AM EDT',
      'Ended: Oct 12, 2026, 9:05 AM EDT',
    ]);
  });

  it('AC-04-97, AC-11-46: a split’s property shows its suffix and its barcode carries the bare number, never the suffix or a label', () => {
    const receipt = Receipts.ofTicket({ ...collection, splitSuffix: 'B' });
    expect(receipt.heading).toBe('Ticket 101001-B');
    expect(receipt.barcode).toBe('101001');
    for (const label of ['COL', 'DIS', 'CLT']) expect(receipt.barcode).not.toContain(label);
  });

  it('AC-04-97: two copies of a collection, or none where its number is a control ticket’s (handed over, its stub kept), printed again as the driver’s', () => {
    expect(Receipts.ofTicket(collection).copies).toEqual(['DRIVER', 'MONITOR']);
    const control = Receipts.ofTicket({ ...collection, controlTicket: true });
    expect(control.copies).toEqual([]);
    expect(Receipts.again(control)).toEqual(['DRIVER']);
    expect(Receipts.again(Receipts.ofTicket(collection))).toEqual(['DRIVER', 'MONITOR']);
  });

  it('AC-04-97: the driver’s copy at a disposal and at both ends of a haul-out, from control tickets too (ADR-115); the crew’s of unit rate work', () => {
    for (const kind of ['DISPOSAL', 'HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL'] as const) {
      for (const controlTicket of [false, true]) {
        expect(Receipts.ofTicket({ ...disposal, kind, controlTicket }).copies, kind).toEqual([
          'DRIVER',
        ]);
      }
    }
    expect(Receipts.ofTicket(hanger).copies).toEqual(['CREW']);
  });

  it('AC-04-97: a disposal says its site and the load call; a scale receipt copied by hand, as the paper says it', () => {
    const receipt = Receipts.ofTicket({
      ...disposal,
      loadCall: null,
      site: 'Cypress Creek Landfill',
      scaleReceipt: {
        receiptNumber: 'CCL-51310',
        grossWeightLb: 52480,
        tareWeightLb: 33820,
        netWeightLb: null,
        netWeightTons: 9.33,
      },
    });
    expect(lineOf(receipt, said.lines.site)).toBe('Cypress Creek Landfill');
    expect(lineOf(receipt, said.lines.loadCall)).toBeUndefined();
    expect(lineOf(receipt, said.lines.scaleReceipt)).toBe('CCL-51310');
    expect(lineOf(receipt, said.lines.gross)).toBe('52,480 lb');
    expect(lineOf(receipt, said.lines.tare)).toBe('33,820 lb');
    expect(lineOf(receipt, said.lines.net)).toBe('9.33 tn');
    expect(lineOf(Receipts.ofTicket(disposal), said.lines.loadCall)).toBe('80%');
  });

  it('AC-04-97: a unit rate ticket prints the pay item the phone worked out, by its code, and never a rate; the crew, not a capacity', () => {
    const receipt = Receipts.ofTicket(hanger);
    expect(receipt.sections.map(({ title }) => title)).toEqual([
      'Crew',
      'Work',
      'Monitor and times',
    ]);
    expect(lineOf(receipt, said.lines.payableType)).toBe('Hangers');
    expect(lineOf(receipt, said.lines.payItem)).toBe('HNG-RMV-EA');
    expect(lineOf(receipt, said.lines.count)).toBe('3');
    expect(lineOf(receipt, said.lines.measuredAcross)).toBe('8 in');
    expect(lineOf(receipt, said.lines.capacity)).toBeUndefined();
    expect(Receipts.wordsOf(receipt, 'CREW').join(' ')).not.toMatch(/\$|\brate:/i);
    const crewTime = Receipts.ofTicket({
      ...hanger,
      unitRate: {
        ...hangerWork,
        payableType: 'Crew Time',
        payItem: 'CREW-HR',
        count: null,
        measurement: null,
        items: [
          { name: 'Skid Steer', quantity: 6.25, hours: true },
          { name: 'Truck', quantity: 2, hours: false },
        ],
        ineligible: true,
      },
    });
    expect(lineOf(crewTime, 'Skid Steer')).toBe('6.25 h');
    expect(lineOf(crewTime, 'Truck')).toBe('2');
    expect(lineOf(crewTime, said.lines.ineligible)).toBe('Yes');
  });

  it('a truck keyed in by hand says so, with the capacity typed; the sub with its prime', () => {
    const receipt = Receipts.ofTicket({
      ...disposal,
      truck: {
        ...coastline730415,
        certNumber: '88120',
        capacityCy: null,
        prime: null,
        keyedByHand: true,
        typedCapacityCy: 28,
      },
    });
    expect(lineOf(receipt, said.lines.capacity)).toBe('28 CY, typed');
    expect(lineOf(receipt, said.lines.keyedByHand)).toBe('Yes');
    const sub = Receipts.ofTicket({
      ...collection,
      truck: { ...coastline730415, sub: 'Rivera Trucking' },
    });
    expect(lineOf(sub, said.lines.contractor)).toBe('Rivera Trucking for Coastline Haulers LLC');
  });

  it('AC-04-97: a certification’s receipt is itemised: each box measured, the capacity worked out by the domain, never a driver’s phone or licence', () => {
    const receipt = Receipts.ofCertification(certification);
    expect(receipt.barcode).toBe('730415');
    expect(receipt.copies).toEqual(['DRIVER']);
    expect(lineOf(receipt, said.lines.capacity)).toBe('65 CY');
    expect(lineOf(receipt, said.lines.primary)).toBe('L 360 × W 96 × H 72');
    expect(lineOf(receipt, 'Sideboards (Adds)')).toBe('L 360 × W 96 × H 16');
    expect(lineOf(receipt, said.lines.helpers)).toBe('Lee Morgan');
    expect(lineOf(receipt, said.lines.certified)).toBe('Oct 10, 2026, 9:00 AM EDT');
    const crew = Receipts.ofCertification({
      ...certification,
      certNumber: '730417',
      crew: true,
      boxes: [],
    });
    expect(crew.copies).toEqual(['CREW']);
    expect(lineOf(crew, said.lines.capacity)).toBeUndefined();
    expect(lineOf(crew, said.lines.crewNotMeasured)).toBe('');
  });

  it('a box holding a measurement its shape no longer has (kept from an earlier shape) prints and counts only what its shape holds', () => {
    const [primary, sideboards] = certification.boxes;
    if (primary === undefined || sideboards === undefined) throw new Error('Two boxes.');
    const receipt = Receipts.ofCertification({
      ...certification,
      boxes: [{ ...primary, diameter: 40, radius: 12 }, sideboards],
    });
    expect(lineOf(receipt, said.lines.primary)).toBe('L 360 × W 96 × H 72');
    expect(lineOf(receipt, said.lines.capacity)).toBe('65 CY');
  });

  it('refuses a number Code 128 can’t carry before anything prints', () => {
    expect(() => Receipts.ofTicket({ ...collection, ticketNumber: '' })).toThrow();
  });
});

describe('to PDF and to ZPL', () => {
  const copies: readonly (readonly [Receipt, ReceiptCopy])[] = [
    [Receipts.ofTicket(collection), 'DRIVER'],
    [Receipts.ofTicket(collection), 'MONITOR'],
    [Receipts.ofTicket(disposal), 'DRIVER'],
    [Receipts.ofTicket(hanger), 'CREW'],
    [Receipts.ofCertification(certification), 'DRIVER'],
  ];

  it('AC-11-46: each copy renders two ways carrying the same words in the same order, and the same barcode, read back as the bare number', () => {
    for (const [receipt, copy] of copies) {
      const words = joined(Receipts.wordsOf(receipt, copy));
      const pdf = pdfRead(receiptsPdf([{ receipt, copy }]));
      expect(pdf.xrefHolds).toBe(true);
      expect(pdf.pages).toHaveLength(1);
      const [page] = pdf.pages;
      expect(joined(page?.words ?? []), receipt.heading).toBe(words);
      expect(scanned(page?.bars ?? [], 44), receipt.heading).toBe(receipt.barcode);
      const [label] = zplRead(receiptLabel(receipt, copy));
      expect(joined(label?.words ?? []), receipt.heading).toBe(words);
      const height = label?.bars[0]?.h ?? 0;
      expect(scanned(label?.bars ?? [], height), receipt.heading).toBe(receipt.barcode);
    }
  });

  it('AC-11-46: the PDF’s and the ZPL’s bars are Code 128’s own, bar for bar', () => {
    const receipt = Receipts.ofTicket(collection);
    const bars = new Code128('101001').bars();
    const [page] = pdfRead(receiptsPdf([{ receipt, copy: 'DRIVER' }])).pages;
    expect(page?.bars.map(({ w }) => w / 2)).toEqual(bars.map(({ width }) => width));
    const [label] = zplRead(receiptLabel(receipt, 'DRIVER'));
    expect(label?.bars.map(({ w }) => w / 3)).toEqual(bars.map(({ width }) => width));
  });

  it('AC-11-46: a collection’s two copies are two pages, two labels; the paper 72 mm wide, a ZQ620’s 576 dots', () => {
    const receipt = Receipts.ofTicket(collection);
    const prints = Receipts.again(receipt).map((copy) => ({ receipt, copy }));
    const pdf = pdfRead(receiptsPdf(prints));
    expect(pdf.pages.map(({ words }) => words[1])).toEqual(['Driver’s copy', 'Monitor’s copy']);
    expect(receiptPage(receipt, 'DRIVER').width).toBe(204);
    const zpl = receiptsZpl(prints);
    expect(zplRead(zpl).map(({ words }) => words[1])).toEqual(['Driver’s copy', 'Monitor’s copy']);
    expect(zpl).toMatch(/^\^XA\n\^CI28\n\^PW576\n\^LL\d+\n/);
  });

  it('AC-11-48: printed again the next day, the same receipt gives the same bytes: nothing of the print is in it, no date, no count', () => {
    const first = receiptsPdf([{ receipt: Receipts.ofTicket(collection), copy: 'DRIVER' }]);
    const again = receiptsPdf([{ receipt: Receipts.ofTicket(collection), copy: 'DRIVER' }]);
    expect(again).toEqual(first);
    expect(receiptLabel(Receipts.ofTicket(collection), 'DRIVER')).toBe(
      receiptLabel(Receipts.ofTicket(collection), 'DRIVER'),
    );
    const file = String.fromCharCode(...first);
    expect(file).not.toMatch(/CreationDate|ModDate|\/Info|JavaScript|\/JS|\/URI|AcroForm/);
  });

  it('nothing typed on a ticket reaches the printer as a command, or breaks the PDF out of its string', () => {
    const address = 'Lot 7) ^XZ^XA~JR (rear \\ _gate_ Peña';
    const receipt = Receipts.ofTicket({ ...collection, address });
    const label = receiptLabel(receipt, 'DRIVER');
    expect(zplText('^~_é')).toBe('_5E_7E_5F_C3_A9');
    expect(label.match(/\^XA/g)).toHaveLength(1);
    expect(label.match(/\^XZ/g)).toHaveLength(1);
    expect(label).not.toContain('~JR');
    expect(joined(zplRead(label)[0]?.words ?? [])).toContain(`Address: ${address}`);
    const pdf = pdfRead(receiptsPdf([{ receipt, copy: 'DRIVER' }]));
    expect(pdf.xrefHolds).toBe(true);
    expect(joined(pdf.pages[0]?.words ?? [])).toContain(`Address: ${address}`);
  });

  it('wraps a long line at its spaces, a word too long for a line where the line ends', () => {
    expect(wrapped('Debris type: Vegetative mixed with limbs', 16)).toEqual([
      'Debris type:',
      'Vegetative mixed',
      'with limbs',
    ]);
    expect(wrapped('ABCDEFGHIJ', 4)).toEqual(['ABCD', 'EFGH', 'IJ']);
    expect(wrapped('', 4)).toEqual(['']);
  });

  it('writes a PDF whose cross-reference table finds every object, a page or many', () => {
    expect(pdfRead(pdfOf([])).xrefHolds).toBe(true);
    expect(
      pdfRead(receiptsPdf(copies.map(([receipt, copy]) => ({ receipt, copy })))).pages,
    ).toHaveLength(5);
  });
});

describe('the printable test set of control tickets', () => {
  const set = {
    project: 'Bayline County PARKS, Hurricane Delphine',
    firstNumber: 400001,
    lastNumber: 400050,
  };

  it('AC-11-50: PARKS’s 400001–400050, five a page on ten pages, each ticket and its stub carrying its number and its Code 128, read back as the number', () => {
    const sheet = pdfRead(controlTicketSheet(set));
    expect(sheet.xrefHolds).toBe(true);
    expect(sheet.pages).toHaveLength(10);
    const numbers: string[] = [];
    for (const page of sheet.pages) {
      expect(page.words[0]).toBe('Test set 400001–400050: not for field use');
      for (const height of [50, 40]) {
        const bars = page.bars
          .filter((bar) => bar.h === height)
          .sort((a, b) => b.y - a.y || a.x - b.x);
        const rows = [...new Set(bars.map(({ y }) => y))];
        expect(rows).toHaveLength(5);
        for (const y of rows) {
          const read = scanned(
            bars.filter((bar) => bar.y === y),
            height,
          );
          if (height === 50 && read !== undefined) numbers.push(read);
          expect(read).toBeDefined();
        }
      }
      expect(page.words.filter((word) => word === set.project)).toHaveLength(5);
    }
    expect(numbers).toEqual(Array.from({ length: 50 }, (_none, at) => String(400001 + at)));
  });

  it('runs from its first number up to its last', () => {
    expect(() => controlTicketSheet({ ...set, lastNumber: 400000 })).toThrow();
  });
});

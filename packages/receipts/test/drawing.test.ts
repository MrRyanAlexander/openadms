// The PDF writer as the back office's documents use it (REQ-410, 413, 414): words measured in
// Helvetica's own widths, shapes in colour, a photograph drawn from its own bytes and turned the
// way its camera was held, and a receipt placed on a larger page. The photographs here are made
// by hand, header and all, as their cameras would write them: the writer reads only their
// headers and hands their bytes to the reader whole.
import { describe, expect, it } from 'vitest';

import {
  fitted,
  fittedIn,
  jpegImage,
  linesOf,
  PdfPage,
  pdfImageOf,
  pdfOf,
  pngImage,
  receiptPage,
  Receipts,
  shownSize,
  textWidth,
  type TicketReceiptFacts,
} from '../src/index.ts';
import { pdfRead } from './read.ts';

const bytesOf = (...parts: readonly (readonly number[])[]): Uint8Array =>
  Uint8Array.from(parts.flat());
const be16 = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff];
const be32 = (value: number): number[] => [...be16(value >>> 16), ...be16(value & 0xffff)];
const asciiOf = (text: string): number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

// A JPEG's markers: its start, an Exif segment saying how the camera was held (big-endian, one
// directory entry), a baseline frame of `width` × `height` with `components`, and its end.
function jpeg(width: number, height: number, orientation: number, components = 3): Uint8Array {
  const tiff = [...asciiOf('MM'), ...be16(42), ...be32(8), ...be16(1)];
  const entry = [...be16(0x0112), ...be16(3), ...be32(1), ...be16(orientation), 0, 0];
  const exif = [...asciiOf('Exif'), 0, 0, ...tiff, ...entry, ...be32(0)];
  return bytesOf(
    [0xff, 0xd8],
    [0xff, 0xe1, ...be16(exif.length + 2), ...exif],
    [0xff, 0xc0, ...be16(8 + components * 3), 8, ...be16(height), ...be16(width), components],
    Array.from({ length: components * 3 }, () => 0x11),
    [0xff, 0xd9],
  );
}

function png(colourType: number, more: readonly (readonly number[])[] = []): Uint8Array {
  const chunk = (type: string, body: readonly number[]): number[] => [
    ...be32(body.length),
    ...asciiOf(type),
    ...body,
    ...be32(0),
  ];
  return bytesOf(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    chunk('IHDR', [...be32(4), ...be32(2), 8, colourType, 0, 0, 0]),
    ...more,
    chunk('IDAT', [0x78, 0x9c, 1, 2]),
    chunk('IDAT', [3, 4]),
    chunk('IEND', []),
  );
}

const fileText = (bytes: Uint8Array): string => String.fromCharCode(...bytes);

describe('words measured', () => {
  it('Helvetica’s own widths: "Open ADMS" at 10 points, bold wider than regular; a line broken at spaces to fit its box; words cut with an ellipsis where they can’t fit', () => {
    expect(textWidth('Open ADMS', 10)).toBeCloseTo(56.13, 5);
    expect(textWidth('Open ADMS', 10, true)).toBeGreaterThan(textWidth('Open ADMS', 10));
    expect(linesOf('All figures in this report are pending final reconciliation', 10, 140)).toEqual(
      ['All figures in this report are', 'pending final reconciliation'],
    );
    expect(linesOf('All figures in this report', 10, 60)).toEqual([
      'All figures in',
      'this report',
    ]);
    expect(fitted('Bayline County Landfill', 10, 60)).toBe('Bayline Co…');
    expect(fitted('Marsh Road', 10, 200)).toBe('Marsh Road');
  });
});

describe('photographs', () => {
  it('a JPEG read from its own header: its size, its colour and the turn its camera asked for, shown upright', () => {
    const held = jpegImage(jpeg(4032, 3024, 6));
    expect(held).toMatchObject({
      width: 4032,
      height: 3024,
      colourSpace: 'DeviceRGB',
      filter: 'DCTDecode',
      turns: 1,
    });
    expect(held === null ? null : shownSize(held)).toEqual({ width: 3024, height: 4032 });
    expect(held === null ? null : fittedIn(held, 300, 200)).toEqual({ width: 150, height: 200 });
    expect(jpegImage(jpeg(640, 480, 1, 1))).toMatchObject({ colourSpace: 'DeviceGray', turns: 0 });
    expect(jpegImage(jpeg(640, 480, 3))?.turns).toBe(2);
    expect(jpegImage(jpeg(640, 480, 8))?.turns).toBe(3);
  });

  it('a PNG of eight-bit colour, not interlaced, its compressed rows as they were with PNG’s predictors; with a palette or transparency, or HEIC, none: shown as a named placeholder by whoever draws it', () => {
    expect(pngImage(png(2))).toEqual({
      width: 4,
      height: 2,
      colourSpace: 'DeviceRGB',
      filter: 'FlateDecode',
      decodeParms: '<< /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns 4 >>',
      bytes: Uint8Array.from([0x78, 0x9c, 1, 2, 3, 4]),
      turns: 0,
    });
    expect(pngImage(png(3))).toBeNull();
    expect(pngImage(png(6))).toBeNull();
    expect(pngImage(png(2, [[...be32(2), ...asciiOf('tRNS'), 0, 0, ...be32(0)]]))).toBeNull();
    const heic = bytesOf([0, 0, 0, 24], asciiOf('ftypheic'), [0, 0, 0, 0]);
    expect(pdfImageOf(heic)).toBeNull();
    expect(pdfImageOf(jpeg(10, 10, 1))?.filter).toBe('DCTDecode');
  });

  it('drawn on two pages, a photograph is kept once in the file, its bytes as they came; each page names it, turned upright in its box; the cross-reference table still points at every object', () => {
    const bytes = jpeg(400, 300, 6);
    const image = jpegImage(bytes);
    if (image === null) throw new Error('Not read.');
    const first = new PdfPage(792, 612);
    first.image(image, 36, 36, 150, 200);
    const second = new PdfPage(792, 612);
    second.fillColour({ r: 0.1, g: 0.2, b: 0.3 });
    second.rect(10, 10, 20, 20, 'both');
    second.image(image, 100, 100, 75, 100);
    const file = pdfOf([first, second]);
    const text = fileText(file);
    expect(pdfRead(file).xrefHolds).toBe(true);
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(1);
    expect(text).toContain(
      '/Width 400 /Height 300 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode',
    );
    expect(text).toContain(fileText(bytes));
    expect(text).toContain('q 0 -150 200 0 36 236 cm /Im1 Do Q');
    expect(text).toContain('0.1 0.2 0.3 rg');
    expect(text.match(/\/XObject << \/Im1 9 0 R >>/g)).toHaveLength(2);
  });
});

describe('a receipt on a larger page', () => {
  it('placed at a scale beside a ticket’s details, it prints the same words, the same barcode, as the phone’s own receipt', () => {
    const facts: TicketReceiptFacts = {
      kind: 'DISPOSAL',
      project: 'Bayline County ROW, Hurricane Delphine',
      timeZone: 'America/New_York',
      ticketNumber: '101001',
      splitSuffix: '',
      controlTicket: false,
      truck: {
        certNumber: '730415',
        crew: false,
        capacityCy: 65,
        prime: 'Coastline Haulers LLC',
        sub: null,
        keyedByHand: false,
        typedCapacityCy: null,
      },
      monitor: { name: 'Kim Nguyen', monitorNumber: 'M004128' },
      startedAt: new Date('2026-10-12T14:01:00Z'),
      endedAt: new Date('2026-10-12T14:05:00Z'),
      site: 'Bayline County Landfill',
      debrisType: 'Vegetative',
      estimateCy: null,
      loadCall: 80,
      carriedCount: null,
      scaleReceipt: null,
      roeNumber: null,
      address: null,
      end: null,
      unitRate: null,
    };
    const receipt = receiptPage(Receipts.ofTicket(facts), 'DRIVER');
    const page = new PdfPage(792, 612);
    page.text(300, 560, 14, true, 'Ticket 101001');
    page.place(receipt, 36, 36, 0.9);
    const own = pdfRead(pdfOf([receipt])).pages[0];
    const placed = pdfRead(pdfOf([page])).pages[0];
    expect(placed?.words).toEqual(['Ticket 101001', ...(own?.words ?? [])]);
    expect(placed?.bars).toEqual(own?.bars);
    expect(fileText(pdfOf([page]))).toContain('q 0.9 0 0 0.9 36 36 cm');
  });
});

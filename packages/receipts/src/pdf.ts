// A receipt as PDF (ARCHITECTURE §12; AC-11-46, 47; ADR-595): what the browser build prints, and
// what the back office's receipt batch gathers (REQ-414). Written here, with no dependency: a
// PDF 1.4 file of pages, each the receipt's paper (72 mm wide, as long as it prints), its words in
// the two fonts every PDF reader carries (Helvetica and Helvetica-Bold, WinAnsi, never embedded),
// its barcode as filled bars drawn from `Code128`, nothing else: no script, no form, no link, no
// date, so the same receipt gives the same bytes every time it prints.
//
// The same writer draws the back office's other documents (REQ-410, 413): a page of any size, in
// colour, with lines, shapes and photographs (`images.ts`), and another page placed on it at a
// scale (a receipt beside its ticket's photographs). Still nothing that runs: no script, no form,
// no link, no font but the two.
import { Code128, quietModules } from './code128.ts';
import { shownSize, type PdfImage } from './images.ts';
import { Receipts, wrapped, type Receipt, type ReceiptCopy } from './receipt.ts';

// A point is 1/72 inch. The receipt's paper: 72 mm, a Zebra ZQ's print width (ADR-595).
export const receiptPointsWide = 204;

const margin = 8;
const sizes = { small: 8, normal: 9, large: 16 } as const;
const leading = 1.3;
const barcodePoints = 44;
// The widest a character of Helvetica is on average, as a share of its size, with room to spare:
// what a line of words is wrapped to.
const characterShare = 0.6;

// A colour, each part from 0 to 1.
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

// A point on a page, in points from its foot-left corner.
export interface PagePoint {
  readonly x: number;
  readonly y: number;
}

// How a shape is drawn: filled, outlined, or both.
export type Drawn = 'fill' | 'stroke' | 'both';
const painted: Readonly<Record<Drawn, string>> = { fill: 'f', stroke: 'S', both: 'B' };
// A quarter of a circle drawn as a Bézier curve: how far its control points stand out.
const kappa = 0.5523;

// One page: its size in points, and what is drawn on it, as PDF's own operators.
export class PdfPage {
  readonly width: number;
  readonly height: number;
  private readonly drawn: string[] = [];
  // The photographs drawn on it, each under its own name: /Im1, /Im2…
  private readonly shown: PdfImage[] = [];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  // Words on a line whose baseline is `y` points from the page's foot.
  text(x: number, y: number, size: number, bold: boolean, words: string): void {
    this.drawn.push(
      `BT /${bold ? 'F2' : 'F1'} ${points(size)} Tf ${points(x)} ${points(y)} Td (${winAnsi(words)}) Tj ET`,
    );
  }

  // A filled rectangle, its foot-left corner at x, y.
  bar(x: number, y: number, width: number, height: number): void {
    this.drawn.push(`${points(x)} ${points(y)} ${points(width)} ${points(height)} re f`);
  }

  // A barcode's bars, its quiet zones left clear, the symbol's left edge at x.
  barcode(code: Code128, x: number, y: number, module: number, height: number): void {
    for (const bar of code.bars()) this.bar(x + bar.at * module, y, bar.width * module, height);
  }

  // The colour what is filled (words included) is drawn in from here on, and what is outlined.
  fillColour(colour: Rgb): void {
    this.drawn.push(`${rgb(colour)} rg`);
  }

  strokeColour(colour: Rgb): void {
    this.drawn.push(`${rgb(colour)} RG`);
  }

  lineWidth(width: number): void {
    this.drawn.push(`${points(width)} w`);
  }

  // What is drawn between `save` and `restore` changes nothing after: its colours, its clip.
  save(): void {
    this.drawn.push('q');
  }

  restore(): void {
    this.drawn.push('Q');
  }

  // Nothing drawn after it shows outside the rectangle, until the next `restore`.
  clip(x: number, y: number, width: number, height: number): void {
    this.drawn.push(`${points(x)} ${points(y)} ${points(width)} ${points(height)} re W n`);
  }

  rect(x: number, y: number, width: number, height: number, how: Drawn): void {
    this.drawn.push(
      `${points(x)} ${points(y)} ${points(width)} ${points(height)} re ${painted[how]}`,
    );
  }

  line(from: PagePoint, to: PagePoint): void {
    this.drawn.push(`${points(from.x)} ${points(from.y)} m ${points(to.x)} ${points(to.y)} l S`);
  }

  // Rings of points, each closed: a shape's outline and its holes, filled by the even-odd rule.
  rings(rings: readonly (readonly PagePoint[])[], how: Drawn): void {
    const path = rings
      .filter((ring) => ring.length > 1)
      .map((ring) =>
        ring
          .map((point, place) => `${points(point.x)} ${points(point.y)} ${place === 0 ? 'm' : 'l'}`)
          .join(' ')
          .concat(' h'),
      );
    if (path.length === 0) return;
    this.drawn.push(`${path.join(' ')} ${how === 'stroke' ? 'S' : `${painted[how]}*`}`);
  }

  circle(centre: PagePoint, radius: number, how: Drawn): void {
    const { x, y } = centre;
    const k = radius * kappa;
    const at = (a: number, b: number) => `${points(a)} ${points(b)}`;
    this.drawn.push(
      [
        `${at(x + radius, y)} m`,
        `${at(x + radius, y + k)} ${at(x + k, y + radius)} ${at(x, y + radius)} c`,
        `${at(x - k, y + radius)} ${at(x - radius, y + k)} ${at(x - radius, y)} c`,
        `${at(x - radius, y - k)} ${at(x - k, y - radius)} ${at(x, y - radius)} c`,
        `${at(x + k, y - radius)} ${at(x + radius, y - k)} ${at(x + radius, y)} c`,
        painted[how],
      ].join(' '),
    );
  }

  // A photograph, upright, filling the box whose foot-left corner is x, y: the box is the size
  // it is shown at, so whoever draws it keeps its proportions (`shownSize`).
  image(image: PdfImage, x: number, y: number, width: number, height: number): void {
    let place = this.shown.indexOf(image);
    if (place === -1) place = this.shown.push(image) - 1;
    // Drawn into the unit square, turned about its middle so it stands as its camera was held.
    const w = points(width);
    const h = points(height);
    const matrix = [
      `${w} 0 0 ${h} ${points(x)} ${points(y)}`,
      `0 -${w} ${h} 0 ${points(x)} ${points(y + height)}`,
      `-${w} 0 0 -${h} ${points(x + width)} ${points(y + height)}`,
      `0 ${w} -${h} 0 ${points(x + width)} ${points(y)}`,
    ][image.turns];
    this.drawn.push(`q ${matrix ?? ''} cm /Im${String(place + 1)} Do Q`);
  }

  // Another page drawn on this one at `scale`, its foot-left corner at x, y: its photographs
  // become this page's.
  place(other: PdfPage, x: number, y: number, scale: number): void {
    const renamed = other.content().replace(/\/Im(\d+) Do/g, (_all, number: string) => {
      const image = other.shown[Number(number) - 1];
      if (image === undefined) throw new Error('A page names a photograph it doesn’t hold.');
      let place = this.shown.indexOf(image);
      if (place === -1) place = this.shown.push(image) - 1;
      return `/Im${String(place + 1)} Do`;
    });
    this.drawn.push(
      `q ${points(scale)} 0 0 ${points(scale)} ${points(x)} ${points(y)} cm`,
      renamed,
      'Q',
    );
  }

  images(): readonly PdfImage[] {
    return this.shown;
  }

  content(): string {
    return this.drawn.join('\n');
  }
}

// A photograph's size as it is shown, fitted inside a box and kept in proportion.
export function fittedIn(
  image: PdfImage,
  width: number,
  height: number,
): { width: number; height: number } {
  const shown = shownSize(image);
  const scale = Math.min(width / shown.width, height / shown.height);
  return { width: shown.width * scale, height: shown.height * scale };
}

const rgb = ({ r, g, b }: Rgb): string =>
  [r, g, b]
    .map((part) => String(Math.round(Math.min(1, Math.max(0, part)) * 1000) / 1000))
    .join(' ');

const points = (value: number): string => String(Math.round(value * 100) / 100);

// The characters WinAnsi holds above ASCII outside Latin-1's own places.
// prettier-ignore
const winAnsiSpecial: Readonly<Record<string, number>> = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88,
  '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93,
  '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b,
  'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

// Words as a PDF string's inside: ASCII as it is (its three special characters escaped), WinAnsi's
// others as octal escapes, anything WinAnsi lacks as "?". The file stays ASCII.
export function winAnsi(words: string): string {
  let written = '';
  for (const character of words.normalize('NFC')) {
    const code = character.codePointAt(0) ?? 0x3f;
    if (character === '(' || character === ')' || character === '\\') written += `\\${character}`;
    else if (code >= 0x20 && code < 0x7f) written += character;
    else {
      const special = winAnsiSpecial[character];
      const byte = special ?? (code >= 0xa0 && code <= 0xff ? code : 0x3f);
      written += byte === 0x3f ? '?' : `\\${byte.toString(8).padStart(3, '0')}`;
    }
  }
  return written;
}

// The file: a catalogue, its pages, the two fonts, each page's content, the photographs its pages
// draw (each once, however many pages draw it), and the cross-reference table every reader finds
// them by. Everything but a photograph's own bytes is ASCII.
export function pdfOf(pages: readonly PdfPage[]): Uint8Array<ArrayBuffer> {
  const objects: (string | { readonly head: string; readonly bytes: Uint8Array })[] = [];
  const pageIds = pages.map((_page, place) => 5 + place * 2);
  const images: PdfImage[] = [];
  for (const page of pages) {
    for (const image of page.images()) if (!images.includes(image)) images.push(image);
  }
  const imageIds = images.map((_image, place) => 5 + pages.length * 2 + place);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((page, place) => {
    const id = 5 + place * 2;
    const content = page.content();
    const drawn = page.images();
    const xObjects =
      drawn.length === 0
        ? ''
        : ` /XObject << ${drawn
            .map(
              (image, at) =>
                `/Im${String(at + 1)} ${String(imageIds[images.indexOf(image)] ?? 0)} 0 R`,
            )
            .join(' ')} >>`;
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${points(page.width)} ${points(page.height)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xObjects} >> /Contents ${String(id + 1)} 0 R >>`;
    objects[id + 1] = `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`;
  });
  images.forEach((image, place) => {
    objects[imageIds[place] ?? 0] = {
      head:
        `<< /Type /XObject /Subtype /Image /Width ${String(image.width)} /Height ${String(image.height)} ` +
        `/ColorSpace /${image.colourSpace} /BitsPerComponent 8 /Filter /${image.filter}` +
        `${image.decodeParms === null ? '' : ` /DecodeParms ${image.decodeParms}`} /Length ${String(image.bytes.length)} >>\nstream\n`,
      bytes: image.bytes,
    };
  });
  const parts: Uint8Array[] = [];
  let length = 0;
  const put = (part: string | Uint8Array): void => {
    const bytes = typeof part === 'string' ? ascii(part) : part;
    parts.push(bytes);
    length += bytes.length;
  };
  put('%PDF-1.4\n');
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = length;
    const object = objects[id] ?? '';
    put(`${String(id)} 0 obj\n`);
    if (typeof object === 'string') {
      put(object);
    } else {
      put(object.head);
      put(object.bytes);
      put('\nendstream');
    }
    put('\nendobj\n');
  }
  const table = length;
  let tail = `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    tail += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  tail += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(table)}\n%%EOF\n`;
  put(tail);
  const file = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    file.set(part, at);
    at += part.length;
  }
  return file;
}

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let at = 0; at < text.length; at += 1) bytes[at] = text.charCodeAt(at);
  return bytes;
}

// One copy of a receipt as one page of its paper, laid out from its printed blocks.
export function receiptPage(receipt: Receipt, copy: ReceiptCopy): PdfPage {
  const usable = receiptPointsWide - margin * 2;
  const placed: { size: number; bold: boolean; text: string }[][] = [];
  let height = margin * 2;
  const blocks = Receipts.printed(receipt, copy);
  for (const block of blocks) {
    if (block.kind === 'barcode') {
      height += barcodePoints + 6;
      continue;
    }
    const size = sizes[block.size];
    const lines = wrapped(block.text, Math.floor(usable / (size * characterShare)));
    placed.push(lines.map((text) => ({ size, bold: block.bold, text })));
    height += lines.length * size * leading;
  }
  const page = new PdfPage(receiptPointsWide, Math.ceil(height));
  let y = page.height - margin;
  let texts = 0;
  for (const block of blocks) {
    if (block.kind === 'barcode') {
      const code = new Code128(block.data);
      const module = Math.min(2, usable / (code.modules() + quietModules * 2));
      const x = margin + (usable - code.modules() * module) / 2;
      y -= barcodePoints + 3;
      page.barcode(code, x, y, module, barcodePoints);
      y -= 3;
      continue;
    }
    for (const line of placed[texts] ?? []) {
      y -= line.size * leading;
      page.text(margin, y + line.size * (leading - 1), line.size, line.bold, line.text);
    }
    texts += 1;
  }
  return page;
}

// Copies of receipts, each its own page, in one file: what a print of them gives.
export function receiptsPdf(
  prints: readonly { readonly receipt: Receipt; readonly copy: ReceiptCopy }[],
): Uint8Array<ArrayBuffer> {
  return pdfOf(prints.map(({ receipt, copy }) => receiptPage(receipt, copy)));
}

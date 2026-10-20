// A receipt as PDF (ARCHITECTURE §12; AC-11-46, 47; ADR-595): what the browser build prints, and
// what the back office's receipt batch will gather (REQ-414). Written here, with no dependency: a
// PDF 1.4 file of pages, each the receipt's paper (72 mm wide, as long as it prints), its words in
// the two fonts every PDF reader carries (Helvetica and Helvetica-Bold, WinAnsi, never embedded),
// its barcode as filled bars drawn from `Code128`, nothing else: no script, no form, no link, no
// date, so the same receipt gives the same bytes every time it prints.
import { Code128, quietModules } from './code128.ts';
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

// One page: its size in points, and what is drawn on it, as PDF's own operators.
export class PdfPage {
  readonly width: number;
  readonly height: number;
  private readonly drawn: string[] = [];

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

  content(): string {
    return this.drawn.join('\n');
  }
}

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

// The file: a catalogue, its pages, the two fonts, each page's content, and the cross-reference
// table every reader finds them by.
export function pdfOf(pages: readonly PdfPage[]): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const pageIds = pages.map((_page, place) => 5 + place * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] =
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((page, place) => {
    const id = 5 + place * 2;
    const content = page.content();
    objects[id] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${points(page.width)} ${points(page.height)}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${String(id + 1)} 0 R >>`;
    objects[id + 1] = `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`;
  });
  let file = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = file.length;
    file += `${String(id)} 0 obj\n${objects[id] ?? ''}\nendobj\n`;
  }
  const table = file.length;
  file += `xref\n0 ${String(objects.length)}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    file += `${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  file += `trailer\n<< /Size ${String(objects.length)} /Root 1 0 R >>\nstartxref\n${String(table)}\n%%EOF\n`;
  const bytes = new Uint8Array(file.length);
  for (let at = 0; at < file.length; at += 1) bytes[at] = file.charCodeAt(at);
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

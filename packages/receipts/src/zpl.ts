// A receipt as ZPL, the Zebra ZQ's own language (ARCHITECTURE §12; AC-11-46, 47; ADR-595): what
// the iPhone's and Android's printing plugin sends over Bluetooth (3.8.3, 3.9.1), one label a copy.
// Laid out from the same printed blocks as the PDF, so it carries the same words in the same order
// and **the same bars**: each bar of `Code128` drawn as a filled box (`^GB`), never left to the
// printer's own encoder, whose choice of code sets could differ from the PDF's.
//
// - Words in UTF-8 (`^CI28`), every byte that isn't plain printable ASCII, and ZPL's own `^`, `~`
//   and `_`, written as a hex escape (`^FH_`), so nothing typed on a ticket can reach the printer
//   as a command.
// - The paper as the printer says it is: `dotsWide` dots across at `dotsPerInch`; until a printer
//   is asked (3.8.3), a ZQ620's 72 mm at 203 dots an inch (576), its label as long as it prints.
import { Code128, quietModules } from './code128.ts';
import { Receipts, wrapped, type Receipt, type ReceiptCopy } from './receipt.ts';

export interface ZebraPaper {
  readonly dotsWide: number;
  readonly dotsPerInch: number;
}

export const zq620Paper: ZebraPaper = { dotsWide: 576, dotsPerInch: 203 };

// Sizes in points, as the PDF's, turned to dots at the printer's resolution.
const pointSizes = { small: 8, normal: 9, large: 16 } as const;
const leading = 1.3;
const barcodePoints = 44;
const characterShare = 0.6;
const marginPoints = 8;

const dotsOf = (points: number, paper: ZebraPaper): number =>
  Math.round((points * paper.dotsPerInch) / 72);

// UTF-8's bytes of a string, without the platform's encoder (the receipts package needs none).
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text.normalize('NFC')) {
    const code = character.codePointAt(0) ?? 0x3f;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

// A field's data, every byte ZPL could read as a command escaped: what follows `^FH_^FD`.
export function zplText(text: string): string {
  return utf8(text)
    .map((byte) =>
      byte >= 0x20 && byte < 0x7f && byte !== 0x5e && byte !== 0x7e && byte !== 0x5f
        ? String.fromCharCode(byte)
        : `_${byte.toString(16).toUpperCase().padStart(2, '0')}`,
    )
    .join('');
}

// One copy of a receipt as one ZPL label.
export function receiptLabel(
  receipt: Receipt,
  copy: ReceiptCopy,
  paper: ZebraPaper = zq620Paper,
): string {
  const margin = dotsOf(marginPoints, paper);
  const usable = paper.dotsWide - margin * 2;
  const fields: string[] = [];
  let y = margin;
  for (const block of Receipts.printed(receipt, copy)) {
    if (block.kind === 'barcode') {
      const code = new Code128(block.data);
      const module = Math.max(
        1,
        Math.min(3, Math.floor(usable / (code.modules() + quietModules * 2))),
      );
      const height = dotsOf(barcodePoints, paper);
      const x = margin + Math.floor((usable - code.modules() * module) / 2);
      y += dotsOf(3, paper);
      for (const bar of code.bars()) {
        const width = bar.width * module;
        fields.push(
          `^FO${String(x + bar.at * module)},${String(y)}^GB${String(width)},${String(height)},${String(width)}^FS`,
        );
      }
      y += height + dotsOf(3, paper);
      continue;
    }
    const size = dotsOf(pointSizes[block.size], paper);
    const font = block.bold ? Math.round(size * 1.1) : size;
    for (const text of wrapped(block.text, Math.floor(usable / (font * characterShare)))) {
      fields.push(
        `^FO${String(margin)},${String(y)}^A0N,${String(font)},${String(font)}^FH_^FD${zplText(text)}^FS`,
      );
      y += Math.round(font * leading);
    }
  }
  const length = y + margin;
  return [
    '^XA',
    '^CI28',
    `^PW${String(paper.dotsWide)}`,
    `^LL${String(length)}`,
    '^LH0,0',
    ...fields,
    '^XZ',
  ].join('\n');
}

// Copies of receipts, one label each, in order: what is sent to the printer for them.
export function receiptsZpl(
  prints: readonly { readonly receipt: Receipt; readonly copy: ReceiptCopy }[],
  paper: ZebraPaper = zq620Paper,
): string {
  return prints.map(({ receipt, copy }) => receiptLabel(receipt, copy, paper)).join('\n');
}

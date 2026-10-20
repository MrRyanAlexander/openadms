// What a scanner and a reader of the paper see, read back from the bytes the renderers write:
// each PDF page's or ZPL label's words in order and its barcode's bars, the barcode read by
// `Code128.read`. For the tests alone.
import { Code128 } from '../src/index.ts';

export interface Read {
  readonly words: string[];
  readonly bars: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  }[];
}

// WinAnsi's places above ASCII back to their characters (the PDF writer's own map, inverted).
const fromWinAnsi: Readonly<Record<number, string>> = {
  0x92: '’',
  0x93: '“',
  0x94: '”',
  0x96: '–',
  0x97: '—',
};

function pdfString(written: string): string {
  return written.replace(/\\([0-7]{3}|.)/g, (_all, escaped: string) => {
    if (escaped.length === 1) return escaped;
    const byte = parseInt(escaped, 8);
    return fromWinAnsi[byte] ?? String.fromCharCode(byte);
  });
}

// A line of words' one string, read as a PDF reader reads it (ISO 32000 §7.3.4.2): from its "(" to
// the ")" that balances it, a backslash escaping the character after it; then nothing but "Tj ET".
function stringOf(line: string): string {
  const start = line.indexOf('(');
  let depth = 0;
  for (let at = start; at < line.length; at += 1) {
    const character = line[at];
    if (character === '\\') at += 1;
    else if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        if (line.slice(at + 1) !== ' Tj ET') throw new Error(`Not one string: ${line}`);
        return line.slice(start + 1, at);
      }
    }
  }
  throw new Error(`A string not closed: ${line}`);
}

// The pages of a PDF this package writes, and whether its cross-reference table points at its
// objects.
export function pdfRead(bytes: Uint8Array): { pages: Read[]; xrefHolds: boolean } {
  let file = '';
  for (const byte of bytes) file += String.fromCharCode(byte);
  const table = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(file)?.[1]);
  const rows = file.slice(table).split('\n').slice(3);
  let id = 1;
  let xrefHolds = file.slice(table).startsWith('xref\n');
  for (const row of rows) {
    if (!/^\d{10} 00000 n $/.test(row)) break;
    xrefHolds &&= file.startsWith(`${String(id)} 0 obj\n`, Number(row.slice(0, 10)));
    id += 1;
  }
  const pages = [...file.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(([, content = '']) => ({
    words: content
      .split('\n')
      .filter((line) => line.startsWith('BT '))
      .map((line) => pdfString(stringOf(line))),
    bars: [...content.matchAll(/^([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+) re f$/gm)].map(
      ([, x = '', y = '', w = '', h = '']) => ({ x: +x, y: +y, w: +w, h: +h }),
    ),
  }));
  return { pages, xrefHolds };
}

function utf8Of(escaped: string): string {
  return decodeURIComponent(
    escaped.replace(/_([0-9A-F]{2})|([^_]+)/g, (_all, hex: string | undefined, plain: string) =>
      hex === undefined ? encodeURIComponent(plain) : `%${hex}`,
    ),
  );
}

// The labels of ZPL this package writes.
export function zplRead(zpl: string): Read[] {
  return zpl
    .split('^XZ')
    .filter((label) => label.includes('^XA'))
    .map((label) => ({
      words: [...label.matchAll(/\^FH_\^FD(.*)\^FS/g)].map(([, text = '']) => utf8Of(text)),
      bars: [...label.matchAll(/\^FO(\d+),(\d+)\^GB(\d+),(\d+),(\d+)\^FS/g)].map(
        ([, x = '', y = '', w = '', h = '']) => ({ x: +x, y: +y, w: +w, h: +h }),
      ),
    }));
}

// The barcode drawn by bars of one height, read as a scanner reads it: the narrowest bar or gap
// is one module, each width a whole number of them.
export function scanned(bars: Read['bars'], height: number): string | undefined {
  const drawn = bars.filter((bar) => Math.abs(bar.h - height) < 0.01).sort((a, b) => a.x - b.x);
  const widths: number[] = [];
  drawn.forEach((bar, place) => {
    const before = drawn[place - 1];
    if (before !== undefined) widths.push(bar.x - (before.x + before.w));
    widths.push(bar.w);
  });
  const module = Math.min(...widths);
  return Code128.read(widths.map((width) => Math.round(width / module)));
}

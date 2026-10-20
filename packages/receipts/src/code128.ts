// Code 128, the barcode every receipt and control ticket carries (ARCHITECTURE §12; ADR-062,
// Q-95): **its data is the bare number**, never a label (`COL`, `DIS`…) and never a split's suffix,
// so a scan gives the number exactly as the ticket shows it and every field event of a ticket
// pairs on it (adms-validation). Written here from ISO/IEC 15417's table, with no dependency: the
// receipt's PDF and its ZPL draw the same bars from it, bar by bar, so what one prints the other
// prints too, and a scanner reads both back (3.6.3; AC-11-49).
//
// - **A number of two digits or more** is set C, two digits a symbol, from Start C; an odd count's
//   last digit after Code B (the shortest either way, as other writers make it).
// - **Anything else printable** (a pre-printed number with a letter in it) is set B, from Start B.
//   Nothing outside printable ASCII is taken: a receipt never carries it.
// - The check symbol is the start's value and each symbol's value times its place, modulo 103;
//   then Stop, and its final bar.

// Each symbol's widths in modules, bar first, from value 0 to 106 (Stop, with its final bar).
// prettier-ignore
const patterns: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const startB = 104;
const startC = 105;
const codeB = 100;
const codeC = 99;
const stop = 106;

// The quiet zone each side, in modules: ten, as the standard asks at the least.
export const quietModules = 10;

export class Code128 {
  // What it carries: the bare number.
  readonly data: string;
  // Its symbols' values, from the start to the stop, the check symbol before the stop.
  readonly values: readonly number[];

  constructor(data: string) {
    if (!/^[\x20-\x7e]+$/.test(data)) {
      throw new Error('A barcode carries printable ASCII, at least one character.');
    }
    this.data = data;
    const values = Code128.symbolsOf(data);
    const sum = values.reduce((total, value, place) => total + value * Math.max(place, 1), 0);
    this.values = [...values, sum % 103, stop];
  }

  private static symbolsOf(data: string): number[] {
    if (/^\d{2,}$/.test(data)) {
      const even = data.length - (data.length % 2);
      const values = [startC];
      for (let at = 0; at < even; at += 2) values.push(Number(data.slice(at, at + 2)));
      if (even < data.length) values.push(codeB, data.charCodeAt(even) - 32);
      return values;
    }
    return [
      startB,
      ...Array.from({ length: data.length }, (_none, at) => data.charCodeAt(at) - 32),
    ];
  }

  // The bars and spaces in order, each its width in modules, a bar first and a bar last.
  widths(): number[] {
    return this.values.flatMap((value) => (patterns[value] ?? '').split('').map(Number));
  }

  // How many modules wide it is, without its quiet zones.
  modules(): number {
    return this.widths().reduce((total, width) => total + width, 0);
  }

  // Each bar as where it starts and how wide it is, in modules from the symbol's left edge.
  bars(): { readonly at: number; readonly width: number }[] {
    const bars: { at: number; width: number }[] = [];
    let at = 0;
    this.widths().forEach((width, place) => {
      if (place % 2 === 0) bars.push({ at, width });
      at += width;
    });
    return bars;
  }

  // The barcode read back from its bars and spaces (module widths, a bar first): what a scanner
  // does, for the tests and for 3.6.3's. Undefined where they aren't a Code 128 this writes.
  static read(widths: readonly number[]): string | undefined {
    const symbols: number[] = [];
    for (let at = 0; at < widths.length; at += 6) {
      const last = at + 6 >= widths.length - 1;
      const pattern = widths.slice(at, last ? at + 7 : at + 6).join('');
      const value = patterns.indexOf(pattern);
      if (value === -1) return undefined;
      symbols.push(value);
      if (last) break;
    }
    if (symbols.at(-1) !== stop || symbols.length < 4) return undefined;
    const body = symbols.slice(0, -2);
    const sum = body.reduce((total, value, place) => total + value * Math.max(place, 1), 0);
    if (sum % 103 !== symbols.at(-2)) return undefined;
    let set: 'B' | 'C' | undefined =
      body[0] === startC ? 'C' : body[0] === startB ? 'B' : undefined;
    if (set === undefined) return undefined;
    let read = '';
    for (const value of body.slice(1)) {
      if (set === 'B' && value === codeC) set = 'C';
      else if (set === 'C' && value === codeB) set = 'B';
      else if (set === 'C') {
        if (value > 99) return undefined;
        read += String(value).padStart(2, '0');
      } else read += String.fromCharCode(value + 32);
    }
    return read;
  }

  // The barcode read off one line across an image, as a camera sees it (task 3.6.3; AC-11-49;
  // ADR-596): the light of each pixel along the line, dark low. Undefined where the line holds
  // no Code 128 this writes. See `readLine` below.
  static readRow(light: ArrayLike<number>): string | undefined {
    return readLine(light);
  }
}

// Reading a line of light (task 3.6.3, ADR-596), with no dependency, for the browser build's
// camera (the iPhone and Android read through their own, 3.8.2, 3.9.1):
//
// - **Where the light crosses dark**, found between two pixels to a fraction of one, against the
//   middle of the line's darkest and lightest; where the light changes across the line (a shadow),
//   against the light around each pixel instead.
// - **Each symbol measured on its own**: its six bars and spaces are eleven modules whatever their
//   width in pixels, so a barcode held at a slant or nearer at one end still reads. Each width is
//   rounded to whole modules, one to four, the rounding put right where the six don't make eleven.
// - **From a start (B or C) to the stop** and its final bar, then `Code128.read`, which checks the
//   check symbol: anything else is nothing read. Either way along the line, as a barcode upside
//   down reads backwards.

interface Element {
  readonly dark: boolean;
  readonly width: number;
}

function readLine(light: ArrayLike<number>): string | undefined {
  const length = light.length;
  let darkest = Infinity;
  let lightest = -Infinity;
  for (let at = 0; at < length; at += 1) {
    const value = light[at] ?? 0;
    darkest = Math.min(darkest, value);
    lightest = Math.max(lightest, value);
  }
  const middle = (darkest + lightest) / 2;
  const across = elementsOf(light, () => middle);
  const read = readEither(across);
  if (read !== undefined) return read;
  // The light around each pixel: the mean of a window as wide as a sixteenth of the line.
  const reach = Math.max(8, Math.round(length / 16));
  const sums = new Float64Array(length + 1);
  for (let at = 0; at < length; at += 1) sums[at + 1] = (sums[at] ?? 0) + (light[at] ?? 0);
  const around = (at: number) => {
    const from = Math.max(0, at - reach);
    const to = Math.min(length, at + reach + 1);
    return ((sums[to] ?? 0) - (sums[from] ?? 0)) / (to - from);
  };
  return readEither(elementsOf(light, around));
}

// The bars and spaces between the line's crossings, each as wide as it is in pixels, to a
// fraction of one; what lies before the first crossing and after the last is left out.
function elementsOf(light: ArrayLike<number>, threshold: (at: number) => number): Element[] {
  const crossings: { at: number; toDark: boolean }[] = [];
  for (let at = 0; at + 1 < light.length; at += 1) {
    const here = light[at] ?? 0;
    const next = light[at + 1] ?? 0;
    const line = (threshold(at) + threshold(at + 1)) / 2;
    if (here >= line !== next >= line) {
      crossings.push({ at: at + (here - line) / (here - next), toDark: next < line });
    }
  }
  const elements: Element[] = [];
  for (let place = 0; place + 1 < crossings.length; place += 1) {
    const from = crossings[place];
    const to = crossings[place + 1];
    if (from !== undefined && to !== undefined) {
      elements.push({ dark: from.toDark, width: to.at - from.at });
    }
  }
  return elements;
}

function readEither(elements: readonly Element[]): string | undefined {
  return readElements(elements) ?? readElements([...elements].reverse());
}

function readElements(elements: readonly Element[]): string | undefined {
  for (let at = 0; at + 6 <= elements.length; at += 1) {
    if (elements[at]?.dark !== true) continue;
    const read = readFrom(elements, at);
    if (read !== undefined) return read;
  }
  return undefined;
}

const widthOf = (group: readonly Element[]) => group.reduce((total, one) => total + one.width, 0);

// A symbol's widths in whole modules, one to four, making `total` between them; none where they
// can't be.
function modulesOf(group: readonly Element[], total: number): number[] | undefined {
  const unit = widthOf(group) / total;
  if (!(unit > 0)) return undefined;
  const measured = group.map((one) => one.width / unit);
  const modules = measured.map((width) => Math.min(4, Math.max(1, Math.round(width))));
  let off = total - modules.reduce((sum, width) => sum + width, 0);
  while (off !== 0) {
    let pick = -1;
    let most = -Infinity;
    modules.forEach((width, place) => {
      const short = (measured[place] ?? 0) - width;
      const by = off > 0 ? short : -short;
      if ((off > 0 ? width < 4 : width > 1) && by > most) {
        most = by;
        pick = place;
      }
    });
    if (pick === -1) return undefined;
    modules[pick] = (modules[pick] ?? 0) + Math.sign(off);
    off -= Math.sign(off);
  }
  return modules;
}

// From the bar at `at`: a start, symbols, the stop and its final bar, read as `Code128.read` reads.
function readFrom(elements: readonly Element[], at: number): string | undefined {
  const start = elements.slice(at, at + 6);
  const first = modulesOf(start, 11);
  if (first === undefined) return undefined;
  const begun = patterns.indexOf(first.join(''));
  if (begun !== startB && begun !== startC) return undefined;
  const widths = [...first];
  for (let place = at + 6; place + 6 <= elements.length; place += 6) {
    const group = elements.slice(place, place + 6);
    const modules = modulesOf(group, 11);
    if (modules === undefined) return undefined;
    const pattern = modules.join('');
    if (pattern === stopPattern) {
      if (elements[place + 6] === undefined) return undefined;
      return Code128.read([...widths, ...modules, 2]);
    }
    if (!patterns.includes(pattern)) return undefined;
    widths.push(...modules);
  }
  return undefined;
}

// The stop's first six bars and spaces, before its final bar: no symbol's pattern.
const stopPattern = (patterns[stop] ?? '').slice(0, 6);

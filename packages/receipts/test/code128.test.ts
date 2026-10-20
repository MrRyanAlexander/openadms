// Code 128 of the bare number (ARCHITECTURE §12; ADR-062, 595; AC-11-46, 50). The patterns are
// ISO/IEC 15417's; each symbol below was checked, module for module, against python-barcode 0.16.1,
// another writer of the standard, outside this repository on 2026-10-20 (ADR-595).
import { describe, expect, it } from 'vitest';

import { Code128, quietModules } from '../src/index.ts';

const modulesOf = (code: Code128): string =>
  code
    .widths()
    .map((width, place) => (place % 2 === 0 ? '1' : '0').repeat(width))
    .join('');

// As python-barcode 0.16.1 writes them.
const written: readonly (readonly [string, string])[] = [
  ['101001', '11010011100110010001001100100010011001101100100010001101100011101011'],
  ['400001', '11010011100110001010001101100110011001101100101110110001100011101011'],
  ['400050', '11010011100110001010001101100110011000101110110110111101100011101011'],
  ['730415', '11010011100100001101001001000110010111001100111001011001100011101011'],
  [
    '1234567',
    '110100111001011001110010001011000111000101101011110111011101101110100011011101100011101011',
  ],
  ['7', '1101001000011101101110111010011001100011101011'],
  [
    'AB-12',
    '110100100001010001100010001011000100110111001001110011011001110010101000111101100011101011',
  ],
];

describe('Code 128', () => {
  it('AC-11-46: 101001 is Start C, 10, 10, 01, its check symbol 35 and Stop: the bare number, two digits a symbol', () => {
    expect(new Code128('101001').values).toEqual([105, 10, 10, 1, 35, 106]);
  });

  it('AC-11-46, AC-11-50: each number is drawn module for module as another writer of the standard draws it', () => {
    for (const [data, modules] of written) expect(modulesOf(new Code128(data)), data).toBe(modules);
  });

  it('each of set C’s hundred symbols is eleven modules of three bars and three spaces, no two alike; Stop is thirteen', () => {
    const all = new Set<string>();
    for (let value = 0; value < 100; value += 1) {
      const data = String(value).padStart(2, '0');
      const symbol = new Code128(data).widths().slice(6, 12);
      expect(
        symbol.reduce((total, width) => total + width, 0),
        data,
      ).toBe(11);
      all.add(symbol.join(''));
    }
    expect(all.size).toBe(100);
    expect(new Code128('00').widths().slice(-7)).toEqual([2, 3, 3, 1, 1, 1, 2]);
  });

  it('AC-11-49: is read back from its bars, any number and a pre-printed one with a letter', () => {
    for (const [data] of written) expect(Code128.read(new Code128(data).widths())).toBe(data);
    expect(Code128.read(new Code128('101001-A').widths())).toBe('101001-A');
  });

  it('reads nothing from bars that are no Code 128, or whose check symbol is wrong', () => {
    const widths = new Code128('101001').widths();
    expect(Code128.read(widths.slice(6))).toBeUndefined();
    const wrong = [...widths];
    wrong.splice(18, 6, ...[2, 1, 2, 2, 2, 2]);
    expect(Code128.read(wrong)).toBeUndefined();
    expect(Code128.read([1, 1, 1])).toBeUndefined();
  });

  it('carries printable ASCII alone: nothing empty, no tab, nothing past it', () => {
    for (const data of ['', 'A\tB', 'é1']) expect(() => new Code128(data), data).toThrow();
  });
});

// One line across a barcode as a camera sees it: each pixel's light from how much of it the bars
// cover (paper 235, ink 30), each bar `spread` modules wider as ink spreads on paper, then blurred
// over `blur` pixels each side, a shadow across it, and noise of `noise` either way from a seeded
// sequence, so every run sees the same line.
function seen(
  data: string,
  {
    module = 3,
    left = 40,
    blur = 0,
    shadow = 0,
    noise = 0,
    spread = 0,
    length = 640,
  }: {
    module?: number;
    left?: number;
    blur?: number;
    shadow?: number;
    noise?: number;
    spread?: number;
    length?: number;
  } = {},
): number[] {
  const bars = new Code128(data).bars().map(({ at, width }) => ({
    from: left + (quietModules + at - spread / 2) * module,
    to: left + (quietModules + at + width + spread / 2) * module,
  }));
  const covered = Array.from({ length }, (_none, pixel) =>
    bars.reduce(
      (sum, { from, to }) => sum + Math.max(0, Math.min(to, pixel + 1) - Math.max(from, pixel)),
      0,
    ),
  );
  const sharp = covered.map((ink) => 235 - Math.min(1, ink) * 205);
  const blurred = sharp.map((_value, pixel) => {
    const near = sharp.slice(Math.max(0, pixel - blur), pixel + blur + 1);
    return near.reduce((sum, value) => sum + value, 0) / near.length;
  });
  let seed = 7;
  const next = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  return blurred.map(
    (value, pixel) => value * (1 - (shadow * pixel) / length) + next() * 2 * noise,
  );
}

describe('AC-11-49: Code 128 read off a line of an image, as a camera sees it', () => {
  it('reads each number at whole and broken module widths, a pre-printed one with a letter too', () => {
    for (const [data] of written) {
      for (const module of [1.5, 2, 2.6, 3, 4.3, 6]) {
        const length = Math.ceil((new Code128(data).modules() + 2 * quietModules) * module) + 80;
        expect(
          Code128.readRow(seen(data, { module, length })),
          `${data} at ${String(module)}`,
        ).toBe(data);
      }
    }
    expect(Code128.readRow(seen('101001-A'))).toBe('101001-A');
  });

  it('reads it backwards, as a barcode held upside down', () => {
    expect(Code128.readRow(seen('400033').reverse())).toBe('400033');
  });

  it('reads it blurred, with noise, and slanted so one end’s modules are wider than the other’s', () => {
    expect(Code128.readRow(seen('101001', { blur: 1, noise: 12 }))).toBe('101001');
    const slanted = seen('730415', { module: 4, length: 900 }).map(
      (_value, pixel, line) => line[Math.round(pixel * (0.85 + (0.3 * pixel) / 900))] ?? 235,
    );
    expect(Code128.readRow(slanted)).toBe('730415');
  });

  it('reads it under a shadow across the line, against the light around each pixel', () => {
    expect(Code128.readRow(seen('400033', { shadow: 0.9, module: 4 }))).toBe('400033');
  });

  it('reads it printed with ink spread, each bar four tenths of a module wider and blurred: each symbol’s widths put right to eleven modules', () => {
    for (const [data] of written) {
      expect(Code128.readRow(seen(data, { spread: 0.4, blur: 1, length: 900 })), data).toBe(data);
    }
  });

  it('reads nothing from a line with no barcode, plain paper, noise or a barcode cut short', () => {
    expect(Code128.readRow(new Array<number>(640).fill(235))).toBeUndefined();
    expect(Code128.readRow(seen('7', { noise: 0, left: 1000 }))).toBeUndefined();
    let seed = 11;
    const noise = Array.from({ length: 640 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return (seed / 2147483648) * 255;
    });
    expect(Code128.readRow(noise)).toBeUndefined();
    expect(Code128.readRow(seen('101001').slice(0, 200))).toBeUndefined();
    expect(Code128.readRow([])).toBeUndefined();
  });

  it('reads nothing where one bar was printed wrong: the check symbol doesn’t hold', () => {
    const module = 3;
    const drawn = (widths: readonly number[]): number[] => [
      ...new Array<number>(40 + quietModules * module).fill(235),
      ...widths.flatMap((width, place) =>
        new Array<number>(width * module).fill(place % 2 === 0 ? 30 : 235),
      ),
      ...new Array<number>(quietModules * module + 40).fill(235),
    ];
    const widths = new Code128('101001').widths();
    expect(Code128.readRow(drawn(widths))).toBe('101001');
    // Cut through the stop's final bar, where the line ends: no barcode yet.
    const whole = drawn(widths);
    expect(Code128.readRow(whole.slice(0, whole.length - quietModules * module - 40 - 3))).toBe(
      undefined,
    );
    widths.splice(18, 6, 2, 1, 2, 2, 2, 2);
    expect(Code128.readRow(drawn(widths))).toBeUndefined();
  });
});

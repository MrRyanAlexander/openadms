// The look as tokens (BACKLOG 3.1.4; ADR-561 (3), ADR-568): every colour a screen uses is defined
// for the light theme on the bare root and redefined, the same in both places, for the dark one
// (the phone's setting, and `data-theme` overriding it either way); every pair of colours a
// component puts together holds WCAG 2.2 AA in each theme; the main button and a row are 56 px
// tall. The browser tests check the same on the screens themselves, in both themes
// (e2e/accessible.ts).
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');

// The custom properties a block of tokens.css defines, by name.
function defined(block: string): Map<string, string> {
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name ?? '',
      (value ?? '').trim(),
    ]),
  );
}

function blockAfter(selector: string): string {
  const start = tokens.indexOf(`${selector} {`);
  expect(start, selector).toBeGreaterThanOrEqual(0);
  const open = tokens.indexOf('{', start);
  return tokens.slice(open + 1, tokens.indexOf('}', open));
}

const light = defined(blockAfter(':root'));
const darkByPhone = defined(blockAfter("  :root:not([data-theme='light'])"));
const darkByChoice = defined(blockAfter(":root[data-theme='dark']"));
const dark = new Map([...light, ...darkByPhone]);

// WCAG 2.2's contrast ratio of two sRGB colours written #rrggbb.
function luminance(colour: string): number {
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(colour.slice(at, at + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
}

function contrast(one: string, other: string): number {
  const [lighter, darker] = [luminance(one), luminance(other)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

// Words on what they sit on (4.5:1, 1.4.3), and a control's edge, a state or focus against what
// is beside it (3:1, 1.4.11). The focus ring is drawn clear of its control, on the page or a
// surface, so it is held against those.
const words = [
  ['words', 'page'],
  ['words', 'surface'],
  ['words-quiet', 'page'],
  ['words-quiet', 'surface'],
  ['main', 'page'],
  ['on-main', 'main'],
  ['on-main', 'main-pressed'],
  ['words', 'picked'],
  ['good', 'good-surface'],
  ['good', 'page'],
  ['problem', 'page'],
  ['notice', 'notice-surface'],
  ['problem', 'problem-surface'],
  ['info', 'info-surface'],
  ['words', 'good-surface'],
  ['words', 'notice-surface'],
  ['words', 'problem-surface'],
  ['words', 'info-surface'],
] as const;
const edges = [
  ['edge', 'page'],
  ['edge', 'surface'],
  ['focus', 'page'],
  ['focus', 'surface'],
  ['main', 'page'],
  ['picked-edge', 'picked'],
  ['picked-edge', 'page'],
  ['notice', 'page'],
  ['info', 'page'],
] as const;

describe('the look', () => {
  it('defines every colour for the light theme on the bare root, and the dark theme the same by the phone’s setting as by choice', () => {
    expect(light.size).toBeGreaterThan(20);
    expect([...darkByPhone]).toEqual([...darkByChoice]);
    for (const name of darkByPhone.keys()) expect(light.has(name), name).toBe(true);
    const colours = [...light.keys()].filter((name) => name.startsWith('colour-'));
    expect(colours.filter((name) => !darkByPhone.has(name))).toEqual([]);
    for (const [name, value] of [...light, ...darkByPhone]) {
      if (name.startsWith('colour-')) expect(value, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each([
    ['light', light],
    ['dark', dark],
  ] as const)(
    'AC-11-55: holds WCAG 2.2 AA in the %s theme: words 4.5:1, edges, states and focus 3:1',
    (_theme, theme) => {
      const colour = (name: string) => theme.get(`colour-${name}`) ?? '';
      const short = [
        ...words.filter(([one, other]) => contrast(colour(one), colour(other)) < 4.5),
        ...edges.filter(([one, other]) => contrast(colour(one), colour(other)) < 3),
      ].map(
        ([one, other]) => `${one} on ${other}: ${contrast(colour(one), colour(other)).toFixed(2)}`,
      );
      expect(short).toEqual([]);
    },
  );

  it('AC-11-52: the main button, a row and a key are at least 56 px tall, and type follows the phone’s text size', () => {
    const rem = (name: string) => Number.parseFloat(light.get(name) ?? '0');
    expect(rem('height-main') * 16).toBeGreaterThanOrEqual(56);
    expect(rem('height-row') * 16).toBeGreaterThanOrEqual(56);
    expect(rem('height-key') * 16).toBeGreaterThanOrEqual(56);
    for (const name of ['type-small', 'type-base', 'type-title', 'type-heading', 'type-number']) {
      expect(light.get(name), name).toMatch(/rem$/);
    }
    expect(rem('type-base') * 16).toBeGreaterThanOrEqual(17);
  });

  it('the check finds a pair that falls short', () => {
    expect(contrast('#767676', '#ffffff')).toBeGreaterThan(4.5);
    expect(contrast('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrast('#000000', '#ffffff')).toBe(21);
  });
});

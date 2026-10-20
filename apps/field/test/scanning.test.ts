// Scanning in the browser build (src/phone/scanning.ts, src/scan.tsx, src/look/scan-field.tsx;
// BACKLOG 3.6.3; AC-11-49; Q-95, Q-105; ADR-596): a barcode read from what the camera sees, two
// lines agreeing, held either way; what a certification scanned back finds; and every place a
// number is scanned taking the camera and a keyboard-style scanner alike, the ticket's number's
// field opening no keyboard. Through the screens against the real API, e2e/scanning.e2e.ts.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Code128, quietModules } from '@open-adms/receipts';
import { describe, expect, it } from 'vitest';

import type { Frame } from '../src/phone/camera.ts';
import type { PhoneCertification } from '../src/phone/certifications.ts';
import { barcodeIn, scannedBack } from '../src/phone/scanning.ts';
import { noLists } from './checks.ts';

// A frame the camera might give: grey paper, and the barcode's bars in near-black across the rows
// (or down the columns) from `from` to `to` of the frame, `module` pixels each, upside down where
// asked.
function frameOf(
  data: string | undefined,
  {
    width = 640,
    height = 480,
    module = 3,
    from = 0.3,
    to = 0.7,
    down = false,
    upsideDown = false,
  }: {
    width?: number;
    height?: number;
    module?: number;
    from?: number;
    to?: number;
    down?: boolean;
    upsideDown?: boolean;
  } = {},
): Frame {
  const pixels = new Uint8ClampedArray(width * height * 4).fill(228);
  if (data !== undefined) {
    const along = down ? height : width;
    const bars = new Code128(data).bars();
    for (const { at, width: barWidth } of bars) {
      const start = 40 + (quietModules + at) * module;
      for (let place = start; place < start + barWidth * module; place += 1) {
        const line = upsideDown ? along - 1 - place : place;
        const across = down ? width : height;
        for (let other = Math.round(across * from); other < Math.round(across * to); other += 1) {
          const pixel = down ? line * width + other : other * width + line;
          pixels.set([24, 24, 28], pixel * 4);
        }
      }
    }
  }
  return { width, height, data: pixels };
}

const source = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const screens = readdirSync(source, { recursive: true, encoding: 'utf8' })
  .filter((path) => path.endsWith('.tsx'))
  .map((path) => ({ path, text: readFileSync(join(source, path), 'utf8') }));

describe('AC-11-49: a barcode read from what the camera sees', () => {
  it('reads the bare number of a receipt’s barcode across the view, held upside down, or held down it', () => {
    expect(barcodeIn(frameOf('101001'))).toBe('101001');
    expect(barcodeIn(frameOf('400033', { upsideDown: true }))).toBe('400033');
    expect(barcodeIn(frameOf('730415', { down: true, width: 480, height: 640 }))).toBe('730415');
    expect(barcodeIn(frameOf('101001-A', { module: 2 }))).toBe('101001-A');
  });

  it('takes nothing that only one line reads, nothing from plain paper, and nothing from a frame too small to hold a line', () => {
    expect(barcodeIn(frameOf('101001', { from: 0.5, to: 0.505 }))).toBeUndefined();
    expect(barcodeIn(frameOf(undefined))).toBeUndefined();
    expect(barcodeIn({ width: 1, height: 1, data: [0, 0, 0, 255] })).toBeUndefined();
  });
});

describe('AC-11-49: a certification scanned back', () => {
  it('finds the monitor’s own certification made on this phone, whatever became of it, before the one in the lists', () => {
    const made = { certNumber: '610810', state: 'SUBMITTED' } as PhoneCertification;
    const lists = {
      ...noLists,
      certifications: [
        {
          id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d52',
          certNumber: '610810',
          kind: 'CONTAINER' as const,
          capacityCy: 65,
          prime: { id: '0199e0a4-7d1c-7b3a-9c2e-5f6a7b8c9d53', name: 'Coastline Haulers LLC' },
          firstTierSub: null,
          secondTierSub: null,
        },
      ],
    };
    expect(scannedBack('610810', { tickets: [], certifications: [made], lists })).toEqual([
      { kind: 'certification', certification: made },
      { kind: 'inLists' },
    ]);
    expect(scannedBack('610811', { tickets: [], certifications: [made], lists })).toEqual([]);
  });
});

describe('AC-11-49: wherever a number is scanned', () => {
  it('the scan field is the camera’s and a keyboard-style scanner’s alike: no screen but the scan module uses the bare field', () => {
    const bare = screens.filter(
      ({ path, text }) => /<ScanField\b/.test(text) && path !== join('look', 'scan-field.tsx'),
    );
    expect(bare.map(({ path }) => path)).toEqual(['scan.tsx']);
    const scanning = screens
      .filter(({ text }) => /<ScanEntry\b/.test(text))
      .map(({ path }) => path)
      .sort();
    expect(scanning).toEqual(['forms.tsx', 'new-ticket.tsx', 'scan.tsx']);
  });

  it('Q-105: the ticket’s number opens no keyboard (one typed by hand goes the way flagged with its reason); a badge’s and a cert number’s do', () => {
    const newTicket = screens.find(({ path }) => path === 'new-ticket.tsx')?.text ?? '';
    const entries = [...newTicket.matchAll(/<ScanEntry\b[\s\S]*?\/>/g)].map(([entry]) => entry);
    expect(entries.map((entry) => entry.includes('keyboard={false}'))).toEqual([false, true]);
    expect(entries[0]).toContain('said.badge.label');
    expect(entries[1]).toContain('scanWords.label');
    const field = screens.find(({ path }) => path === join('look', 'scan-field.tsx'))?.text ?? '';
    expect(field).toContain("inputMode={keyboard ? 'numeric' : 'none'}");
  });
});

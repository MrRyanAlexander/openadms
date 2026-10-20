// A receipt the browser build printed, read back from the PDF it saved (BACKLOG 3.6.2; ADR-595):
// each page's words in order and its barcode, read from its bars as a scanner reads them, the
// narrowest bar or gap one module (`Code128.read`, the receipts package's).
import { readFile } from 'node:fs/promises';

import type { Download } from '@playwright/test';
import { Code128 } from '@open-adms/receipts';

export interface PrintedPage {
  readonly words: string[];
  readonly barcode: string | undefined;
  // Its barcode's bars and spaces as printed, in modules, a bar first: what a scan is shown
  // (e2e/scanning.e2e.ts).
  readonly bars: number[];
}

// WinAnsi's places the receipts' words use above ASCII.
const winAnsi: Readonly<Record<number, string>> = { 0x92: '’', 0x96: '–', 0xd7: '×' };

function unescaped(written: string): string {
  return written.replace(/\\([0-7]{3}|.)/g, (_all, escaped: string) =>
    escaped.length === 1
      ? escaped
      : (winAnsi[parseInt(escaped, 8)] ?? String.fromCharCode(parseInt(escaped, 8))),
  );
}

export async function printedPages(
  download: Download,
): Promise<{ name: string; pages: PrintedPage[]; bytes: Buffer }> {
  const bytes = await readFile(await download.path());
  const file = bytes.toString('latin1');
  const pages = [...file.matchAll(/stream\n([\s\S]*?)\nendstream/g)].map(([, content = '']) => {
    const bars = [...content.matchAll(/^([\d.]+) [\d.]+ ([\d.]+) [\d.]+ re f$/gm)]
      .map(([, x = '', w = '']) => ({ x: Number(x), w: Number(w) }))
      .sort((one, other) => one.x - other.x);
    const widths: number[] = [];
    bars.forEach((bar, place) => {
      const before = bars[place - 1];
      if (before !== undefined) widths.push(bar.x - (before.x + before.w));
      widths.push(bar.w);
    });
    const module = Math.min(...widths);
    const modules = widths.map((width) => Math.round(width / module));
    return {
      words: [...content.matchAll(/\((.*)\) Tj ET$/gm)].map(([, text = '']) => unescaped(text)),
      barcode: Code128.read(modules),
      bars: modules,
    };
  });
  return { name: download.suggestedFilename(), pages, bytes };
}

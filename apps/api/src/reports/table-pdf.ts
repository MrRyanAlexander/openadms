// A table written as a PDF: US Letter landscape, a plain table (the header row repeated on every
// page), a title band on the first page naming what it holds, what narrows it and when it was
// made, and a page number at the foot. Drawn by `@open-adms/receipts`' PDF writer, no dependency.
import { fitted, PdfPage, pdfOf, textWidth, type Rgb } from '@open-adms/receipts';

import type { Column } from './table-file.ts';

export const pdfType = 'application/pdf';

const wide = 792;
const high = 612;
const margin = 36;
const size = 8;
const rowHigh = 15;
const ink: Rgb = { r: 0.11, g: 0.14, b: 0.2 };
const muted: Rgb = { r: 0.4, g: 0.44, b: 0.5 };
const rule: Rgb = { r: 0.82, g: 0.84, b: 0.87 };
const band: Rgb = { r: 0.95, g: 0.96, b: 0.97 };

export interface Heading {
  readonly title: string;
  // What narrows the table and when it was made: one line each.
  readonly lines: readonly string[];
  // The page number, as "{at} / {of}".
  readonly page: (at: number, of: number) => string;
}

// Each column as wide as its widest of the first rows, the whole shrunk (never stretched) to fit.
function widthsOf(headers: readonly string[], cells: readonly (readonly string[])[]): number[] {
  const wanted = headers.map((header, at) =>
    Math.min(
      180,
      Math.max(
        textWidth(header, size, true),
        ...cells.slice(0, 200).map((row) => textWidth(row[at] ?? '', size, false)),
      ) + 10,
    ),
  );
  const room = wide - margin * 2;
  const total = wanted.reduce((sum, each) => sum + each, 0);
  const scale = total > room ? room / total : 1;
  return wanted.map((each) => each * scale);
}

export function pdfTableOf<Row>(
  heading: Heading,
  columns: readonly Column<Row>[],
  rows: readonly Row[],
): Uint8Array {
  const headers = columns.map((column) => column.name);
  const cells = rows.map((row) =>
    columns.map((column) => {
      const cell = column.cell(row);
      return cell === null ? '' : typeof cell === 'boolean' ? (cell ? 'yes' : 'no') : String(cell);
    }),
  );
  const widths = widthsOf(headers, cells);
  const titleHigh = 26 + heading.lines.length * 13;
  const pages: PdfPage[] = [];
  let page = new PdfPage(wide, high);
  let y = 0;
  const start = (first: boolean) => {
    page = new PdfPage(wide, high);
    pages.push(page);
    y = high - margin;
    if (first) {
      page.fillColour(ink);
      page.text(margin, y - 12, 16, true, fitted(heading.title, 16, wide - margin * 2, true));
      page.fillColour(muted);
      heading.lines.forEach((line, at) => {
        page.text(margin, y - 28 - at * 13, 9, false, fitted(line, 9, wide - margin * 2, false));
      });
      y -= titleHigh + 8;
    }
    page.fillColour(band);
    page.bar(margin, y - rowHigh + 3, wide - margin * 2, rowHigh);
    page.fillColour(ink);
    let x = margin;
    headers.forEach((header, at) => {
      const width = widths[at] ?? 0;
      page.text(x + 3, y - 8, size, true, fitted(header, size, width - 6, true));
      x += width;
    });
    y -= rowHigh;
  };
  start(true);
  const perPage = (top: number) => Math.floor((top - 40) / rowHigh);
  let left = perPage(y);
  for (const row of cells) {
    if (left <= 0) {
      start(false);
      left = perPage(y);
    }
    page.fillColour(ink);
    let x = margin;
    row.forEach((cell, at) => {
      const width = widths[at] ?? 0;
      page.text(x + 3, y - 8, size, false, fitted(cell, size, width - 6, false));
      x += width;
    });
    page.strokeColour(rule);
    page.lineWidth(0.4);
    page.line({ x: margin, y: y - rowHigh + 3 }, { x: wide - margin, y: y - rowHigh + 3 });
    y -= rowHigh;
    left -= 1;
  }
  pages.forEach((each, at) => {
    const label = heading.page(at + 1, pages.length);
    each.fillColour(muted);
    each.text(wide - margin - textWidth(label, 8, false), 20, 8, false, label);
  });
  return pdfOf(pages);
}

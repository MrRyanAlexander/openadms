// A table written as a file to take away (REQ-412; spec/FROM-BUILD-1.md §10): CSV (RFC 4180, CRLF
// lines), the same opened by a spreadsheet as it is meant (Excel-compatible: UTF-8 with its byte
// order mark, so its accents and dashes read right), or JSON (an array of rows by column name).
// **A cell a spreadsheet would run as a formula is written as text** (OWASP ASVS 5.0 1.3.3): one
// beginning with `=`, `+`, `-`, `@`, a tab or a carriage return is led by an apostrophe, but a
// plain number (a negative quantity) is a number. An Excel workbook (`xlsx-file.ts`) and a landscape
// PDF table (`table-pdf.ts`) are written the same way. No dependency.
import type { exportFormats } from '@open-adms/contracts';

import { pdfTableOf, pdfType, type Heading } from './table-pdf.ts';
import { xlsxOf, xlsxType } from './xlsx-file.ts';

export type TableFormat = (typeof exportFormats)[number];

export type Cell = string | number | boolean | null;

export interface Column<Row> {
  readonly name: string;
  readonly cell: (row: Row) => Cell;
  // A decimal written as text (an exact amount) is a number in a workbook.
  readonly numeric?: boolean;
}

export interface TableFile {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly extension: string;
}

const formulaStart = /^[=+\-@\t\r]/;
const plainNumber = /^-?[0-9]+(\.[0-9]+)?$/;

// A cell as a spreadsheet will take it: never a formula.
export function safeCell(cell: Cell): string {
  if (cell === null) return '';
  const text = String(cell);
  return formulaStart.test(text) && !plainNumber.test(text) ? `'${text}` : text;
}

const quoted = (text: string): string =>
  /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

function csvOf<Row>(columns: readonly Column<Row>[], rows: readonly Row[]): string {
  const lines = [
    columns.map((column) => quoted(safeCell(column.name))).join(','),
    ...rows.map((row) => columns.map((column) => quoted(safeCell(column.cell(row)))).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function tableFile<Row>(
  format: TableFormat,
  columns: readonly Column<Row>[],
  rows: readonly Row[],
  // What a workbook's sheet and a PDF's title say; a CSV and JSON need none.
  heading?: Heading & { readonly sheet: string },
): TableFile {
  const encoder = new TextEncoder();
  switch (format) {
    case 'csv':
      return {
        bytes: encoder.encode(csvOf(columns, rows)),
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    case 'excel':
      return {
        bytes: encoder.encode(`\uFEFF${csvOf(columns, rows)}`),
        contentType: 'text/csv; charset=utf-8',
        extension: 'csv',
      };
    case 'xlsx':
      return {
        bytes: xlsxOf(heading?.sheet ?? 'Export', columns, rows),
        contentType: xlsxType,
        extension: 'xlsx',
      };
    case 'pdf':
      return {
        bytes: pdfTableOf(
          heading ?? {
            title: 'Export',
            lines: [],
            page: (at, of) => `${String(at)} / ${String(of)}`,
          },
          columns,
          rows,
        ),
        contentType: pdfType,
        extension: 'pdf',
      };
    case 'json':
      return {
        bytes: encoder.encode(
          `${JSON.stringify(
            rows.map((row) =>
              Object.fromEntries(columns.map((column) => [column.name, column.cell(row)])),
            ),
            null,
            2,
          )}\n`,
        ),
        contentType: 'application/json; charset=utf-8',
        extension: 'json',
      };
  }
}

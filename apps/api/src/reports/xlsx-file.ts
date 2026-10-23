// A table written as an Excel workbook (.xlsx, Office Open XML), with no dependency: one sheet,
// its header row first, every text an inline string (so a cell beginning `=` is text, never a
// formula), a number as a number. The package is a ZIP of stored (uncompressed) entries; a
// workbook this size doesn't need deflating, and the format asks for nothing more.
import { crc32 } from 'node:zlib';

import type { Cell, Column } from './table-file.ts';

export const xlsxType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const encoder = new TextEncoder();

// XML 1.0 allows no control characters but tab, line feed and carriage return.
// eslint-disable-next-line no-control-regex
const notXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const escaped = (text: string): string =>
  text
    .replace(notXml, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// A column's letters: A…Z, AA…
export function columnLetters(at: number): string {
  let letters = '';
  for (let rest = at + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function cellXml(at: number, row: number, cell: Cell, numeric: boolean): string {
  const place = `${columnLetters(at)}${String(row)}`;
  if (cell === null || cell === '') return '';
  if (typeof cell === 'number' && Number.isFinite(cell))
    return `<c r="${place}"><v>${String(cell)}</v></c>`;
  if (numeric && typeof cell === 'string' && /^-?[0-9]+(\.[0-9]+)?$/.test(cell)) {
    return `<c r="${place}"><v>${cell}</v></c>`;
  }
  const text = typeof cell === 'boolean' ? (cell ? 'TRUE' : 'FALSE') : String(cell);
  return `<c r="${place}" t="inlineStr"><is><t xml:space="preserve">${escaped(text)}</t></is></c>`;
}

function sheetXml<Row>(columns: readonly Column<Row>[], rows: readonly Row[]): string {
  const line = (number: number, cells: string[]) =>
    `<row r="${String(number)}">${cells.join('')}</row>`;
  const body = [
    line(
      1,
      columns.map((column, at) => cellXml(at, 1, column.name, false)),
    ),
    ...rows.map((row, place) =>
      line(
        place + 2,
        columns.map((column, at) =>
          cellXml(at, place + 2, column.cell(row), column.numeric === true),
        ),
      ),
    ),
  ];
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<sheetData>${body.join('')}</sheetData></worksheet>`
  );
}

// A sheet's name: at most 31 characters and none of : \ / ? * [ ].
const sheetNameOf = (name: string): string =>
  name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31) || 'Sheet1';

interface Entry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function zipped(entries: readonly Entry[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;
  // 1980-01-01 00:00: the same bytes for the same table.
  const time = 0;
  const date = 0x21;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const checksum = crc32(entry.bytes);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, checksum, true);
    local.setUint32(18, entry.bytes.byteLength, true);
    local.setUint32(22, entry.bytes.byteLength, true);
    local.setUint16(26, name.byteLength, true);
    local.setUint16(28, 0, true);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, checksum, true);
    central.setUint32(20, entry.bytes.byteLength, true);
    central.setUint32(24, entry.bytes.byteLength, true);
    central.setUint16(28, name.byteLength, true);
    central.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), name, entry.bytes);
    directory.push(new Uint8Array(central.buffer), name);
    offset += 30 + name.byteLength + entry.bytes.byteLength;
  }
  const size = directory.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...directory, new Uint8Array(end.buffer)];
  const bytes = new Uint8Array(all.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of all) {
    bytes.set(part, at);
    at += part.byteLength;
  }
  return bytes;
}

export function xlsxOf<Row>(
  sheet: string,
  columns: readonly Column<Row>[],
  rows: readonly Row[],
): Uint8Array {
  const xml = (text: string) =>
    encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${text}`);
  return zipped([
    {
      path: '[Content_Types].xml',
      bytes: xml(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '</Types>',
      ),
    },
    {
      path: '_rels/.rels',
      bytes: xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      path: 'xl/workbook.xml',
      bytes: xml(
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${escaped(sheetNameOf(sheet))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      path: 'xl/_rels/workbook.xml.rels',
      bytes: xml(
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '</Relationships>',
      ),
    },
    { path: 'xl/worksheets/sheet1.xml', bytes: encoder.encode(sheetXml(columns, rows)) },
  ]);
}

// A photograph as a PDF draws it (ISO 32000 §8.9), read from its own bytes with no dependency:
// a JPEG as it was kept, which PDF decodes itself (DCTDecode), turned the way its camera said it
// was held (EXIF orientation); a PNG of eight-bit grey or colour, not interlaced and with no
// transparency, its compressed rows as they were (FlateDecode with PNG's own predictors). Any
// other image (HEIC, TIFF, a PNG with a palette or transparency, a CMYK JPEG) is none: whoever
// draws it shows a named placeholder, never a picture made up of it.

export interface PdfImage {
  // As stored, before any turn.
  readonly width: number;
  readonly height: number;
  readonly colourSpace: 'DeviceGray' | 'DeviceRGB';
  readonly filter: 'DCTDecode' | 'FlateDecode';
  // A PNG's predictors, as the image dictionary says them.
  readonly decodeParms: string | null;
  readonly bytes: Uint8Array;
  // Quarter turns clockwise that stand it upright: 0, 1, 2 or 3.
  readonly turns: 0 | 1 | 2 | 3;
}

// Its size as it is seen, upright.
export const shownSize = (image: PdfImage): { width: number; height: number } =>
  image.turns % 2 === 1
    ? { width: image.height, height: image.width }
    : { width: image.width, height: image.height };

const u16 = (bytes: Uint8Array, at: number, little = false): number =>
  little
    ? (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
    : ((bytes[at] ?? 0) << 8) | (bytes[at + 1] ?? 0);
const u32 = (bytes: Uint8Array, at: number, little = false): number =>
  little
    ? (u16(bytes, at, true) | (u16(bytes, at + 2, true) << 16)) >>> 0
    : ((u16(bytes, at) << 16) | u16(bytes, at + 2)) >>> 0;

// The frame markers that say a JPEG's size: baseline, progressive, lossless, arithmetic.
const frames = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

// EXIF's orientation as quarter turns clockwise; a mirrored one is read as its nearest turn.
const turnsOf: Readonly<Record<number, 0 | 1 | 2 | 3>> = {
  1: 0,
  2: 0,
  3: 2,
  4: 2,
  5: 1,
  6: 1,
  7: 3,
  8: 3,
};

// The orientation an APP1 Exif segment holds, from its first image directory.
function exifTurns(bytes: Uint8Array, at: number, length: number): 0 | 1 | 2 | 3 {
  const exif = 'Exif\0\0';
  for (let place = 0; place < exif.length; place += 1) {
    if (bytes[at + place] !== exif.charCodeAt(place)) return 0;
  }
  const tiff = at + 6;
  const little = bytes[tiff] === 0x49;
  const directory = tiff + u32(bytes, tiff + 4, little);
  const entries = u16(bytes, directory, little);
  for (let entry = 0; entry < entries; entry += 1) {
    const place = directory + 2 + entry * 12;
    if (place + 12 > at + length) return 0;
    if (u16(bytes, place, little) === 0x0112) return turnsOf[u16(bytes, place + 8, little)] ?? 0;
  }
  return 0;
}

export function jpegImage(bytes: Uint8Array): PdfImage | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let at = 2;
  let turns: 0 | 1 | 2 | 3 = 0;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    const length = u16(bytes, at + 2);
    if (marker === 0xe1) turns = exifTurns(bytes, at + 4, length - 2);
    if (frames.has(marker)) {
      const height = u16(bytes, at + 5);
      const width = u16(bytes, at + 7);
      const components = bytes[at + 9];
      if (width === 0 || height === 0 || (components !== 1 && components !== 3)) return null;
      return {
        width,
        height,
        colourSpace: components === 1 ? 'DeviceGray' : 'DeviceRGB',
        filter: 'DCTDecode',
        decodeParms: null,
        bytes,
        turns,
      };
    }
    at += 2 + length;
  }
  return null;
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function pngImage(bytes: Uint8Array): PdfImage | null {
  if (!pngSignature.every((byte, place) => bytes[place] === byte)) return null;
  let at = 8;
  let header: { width: number; height: number; colours: 1 | 3 } | null = null;
  const data: Uint8Array[] = [];
  while (at + 8 <= bytes.length) {
    const length = u32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      const [depth, colourType, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || (colourType !== 0 && colourType !== 2)) return null;
      header = { width: u32(body, 0), height: u32(body, 4), colours: colourType === 0 ? 1 : 3 };
    } else if (type === 'tRNS') {
      return null;
    } else if (type === 'IDAT') {
      data.push(body);
    } else if (type === 'IEND') {
      break;
    }
    at += 12 + length;
  }
  if (header === null || data.length === 0) return null;
  const joined = new Uint8Array(data.reduce((sum, part) => sum + part.length, 0));
  let place = 0;
  for (const part of data) {
    joined.set(part, place);
    place += part.length;
  }
  return {
    width: header.width,
    height: header.height,
    colourSpace: header.colours === 1 ? 'DeviceGray' : 'DeviceRGB',
    filter: 'FlateDecode',
    decodeParms: `<< /Predictor 15 /Colors ${String(header.colours)} /BitsPerComponent 8 /Columns ${String(header.width)} >>`,
    bytes: joined,
    turns: 0,
  };
}

// A photograph's file as PDF draws it, or none for a kind it can't.
export const pdfImageOf = (bytes: Uint8Array): PdfImage | null =>
  jpegImage(bytes) ?? pngImage(bytes);

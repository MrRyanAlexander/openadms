// What a photograph's file may be (ARCHITECTURE §6 "Uploads", §11; spec/acceptance/10-api-and-
// sync.md AC-10-47; spec/THREAT-MODEL.md T-25; OWASP ASVS 5.0 V5; ADR-101, 482): an image, told
// by its own first bytes, its signature, and never by a name or a type anybody says. The same
// for the depth file beside a photograph, wherever the depth couldn't travel inside it.
//
// The kinds a phone's camera writes, or its depth data is commonly kept as: JPEG, the HEIF family
// (HEIC on an iPhone), PNG and TIFF. Which a phone actually sends is measured on real phones
// (Phase 3); a kind added here is a kind the media endpoint takes. Agent default (ADR-482).
export const photoFileTypes = [
  'image/jpeg',
  'image/heic',
  'image/heif',
  'image/png',
  'image/tiff',
] as const;

export type PhotoFileType = (typeof photoFileTypes)[number];

// The most photographs one ticket's field event takes on a phone (ADR-157): a product rule, not a
// threshold the firm tunes. A certification takes its five set views instead (ADR-179).
export const ticketPhotosAtMost = 8;

// How many of a file's first bytes tell its kind.
export const photoFileSignatureBytes = 12;

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean =>
  signature.every((byte, index) => bytes[at + index] === byte);

const text = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

// The ISO base media file's major brands of a HEIF image: an image or a sequence, coded by HEVC
// (HEIC) or by anything (HEIF).
const heicBrands = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx']);
const heifBrands = new Set(['mif1', 'msf1', 'heif']);

// The kind of image a file is, by its first bytes; none where it is no image of these kinds, or
// fewer bytes than tell one were given.
export function photoFileTypeOf(start: Uint8Array): PhotoFileType | null {
  if (startsWith(start, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(start, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(start, [0x49, 0x49, 0x2a, 0x00]) || startsWith(start, [0x4d, 0x4d, 0x00, 0x2a])) {
    return 'image/tiff';
  }
  // A file type box first: its size, "ftyp", then the major brand.
  if (start.length >= photoFileSignatureBytes && text(start, 4, 8) === 'ftyp') {
    const brand = text(start, 8, 12);
    if (heicBrands.has(brand)) return 'image/heic';
    if (heifBrands.has(brand)) return 'image/heif';
  }
  return null;
}

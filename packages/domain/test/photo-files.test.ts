// What a photograph's file may be (spec/acceptance/10-api-and-sync.md AC-10-47; T-25; ADR-482):
// an image, told by its own first bytes.
import { describe, expect, it } from 'vitest';

import { photoFileSignatureBytes, photoFileTypeOf, photoFileTypes } from '../src/photo-files.ts';

const bytes = (...values: (number | string)[]): Uint8Array =>
  Uint8Array.from(
    values.flatMap((value) =>
      typeof value === 'string'
        ? Array.from({ length: value.length }, (_, at) => value.charCodeAt(at))
        : [value],
    ),
  );

// A file type box: its size, "ftyp" and a major brand.
const ftyp = (brand: string): Uint8Array => bytes(0, 0, 0, 0x18, 'ftyp', brand, 0, 0, 0, 0);

describe('a photograph’s file', () => {
  it('AC-10-47 is one of the kinds of image a phone writes, told by its first bytes', () => {
    expect(photoFileTypes).toEqual([
      'image/jpeg',
      'image/heic',
      'image/heif',
      'image/png',
      'image/tiff',
    ]);
    expect(photoFileSignatureBytes).toBe(12);
    for (const [kind, start] of [
      ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe1, 0, 0x22, 'Exif', 0, 0)],
      ['image/png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d)],
      ['image/tiff', bytes('II', 0x2a, 0, 8, 0, 0, 0, 0, 0, 0, 0)],
      ['image/tiff', bytes('MM', 0, 0x2a, 0, 0, 0, 8, 0, 0, 0, 0)],
      ['image/heic', ftyp('heic')],
      ['image/heic', ftyp('heix')],
      ['image/heic', ftyp('hevc')],
      ['image/heif', ftyp('mif1')],
      ['image/heif', ftyp('heif')],
    ] as const) {
      expect(photoFileTypeOf(start), kind).toBe(kind);
    }
  });

  it('AC-10-47 is no other file, whatever it says it is', () => {
    for (const [what, start] of [
      ['nothing', bytes()],
      ['a web page', bytes('<!doctype html>')],
      ['a script', bytes('#!/bin/sh\nrm -rf')],
      ['a PDF', bytes('%PDF-1.7\n%âãÏÓ')],
      ['a ZIP', bytes('PK', 3, 4, 20, 0, 0, 0, 0, 0, 0, 0)],
      ['an SVG', bytes('<svg xmlns="')],
      ['a video', ftyp('mp42')],
      ['an AVIF', ftyp('avif')],
      [
        'a HEIC brand in a box that isn’t a file type box',
        bytes(0, 0, 0, 0x18, 'free', 'heic', 0, 0),
      ],
      ['a JPEG cut to two bytes', bytes(0xff, 0xd8)],
      [
        'a PNG with its line ending changed',
        bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0d, 0, 0, 0, 0),
      ],
      ['a file type box cut short', bytes(0, 0, 0, 0x18, 'ftyp', 'he')],
      ['a TIFF missing its magic number', bytes('II', 0x2b, 0, 8, 0, 0, 0, 0, 0, 0, 0)],
    ] as const) {
      expect(photoFileTypeOf(start), what).toBeNull();
    }
  });
});

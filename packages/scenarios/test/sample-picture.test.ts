// The sample projects' photographs (src/sample/sample-picture.ts): each a PNG the API takes as an
// image by its own first bytes, whole by its chunks' checks, and no two alike.
import { crc32, inflateSync } from 'node:zlib';

import { photoFileTypeOf } from '@open-adms/domain';
import { describe, expect, it } from 'vitest';

import { samplePicture } from '../src/sample/sample-picture.ts';

// Each chunk of a PNG after its signature: its type, its data, and whether its CRC is right.
function chunksOf(png: Buffer): { type: string; data: Buffer; whole: boolean }[] {
  const chunks = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const typed = png.subarray(at + 4, at + 8 + length);
    chunks.push({
      type: typed.subarray(0, 4).toString('ascii'),
      data: typed.subarray(4),
      whole: crc32(typed) === png.readUInt32BE(at + 8 + length),
    });
    at += 12 + length;
  }
  return chunks;
}

describe('a sample photograph', () => {
  it('is a PNG the media endpoint takes: its signature, IHDR, IDAT and IEND, each chunk whole', () => {
    const png = samplePicture('Sample P1-UR-1 301001 as uploaded', 160, 120);
    expect(photoFileTypeOf(png.subarray(0, 12))).toBe('image/png');
    const chunks = chunksOf(png);
    expect(chunks.map(({ type, whole }) => [type, whole])).toEqual([
      ['IHDR', true],
      ['IDAT', true],
      ['IEND', true],
    ]);
    const header = chunks[0]?.data ?? Buffer.alloc(0);
    expect([header.readUInt32BE(0), header.readUInt32BE(4), header[8], header[9]]).toEqual([
      160, 120, 8, 2,
    ]);
    // 120 rows, each its filter byte and 160 RGB pixels.
    expect(inflateSync(chunks[1]?.data ?? Buffer.alloc(0)).length).toBe(120 * (1 + 160 * 3));
  });

  it('is its own: two photographs never share a file, and one drawn again is the same', () => {
    const one = samplePicture('a');
    expect(samplePicture('a').equals(one)).toBe(true);
    expect(samplePicture('b').equals(one)).toBe(false);
  });
});

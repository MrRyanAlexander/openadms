// The sample projects' photographs (sample-projects.ts): each a picture of its own, so that the back
// office shows an image where a firm opens one, never a broken file. A small PNG, light grey with a
// band of colour, and a first row of pixels drawn from what it is a photograph of, so no two are
// alike. It shows nothing: the sample's monitors photographed no real debris.
//
// PNG as its specification has it (RFC 2083): the signature, an IHDR chunk (8-bit RGB), one IDAT
// chunk of the rows deflated, each row led by filter type 0, and IEND; each chunk's CRC-32 over
// its type and data.
import { createHash } from 'node:crypto';
import { crc32, deflateSync } from 'node:zlib';

const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, check]);
}

// A picture `width` × `height` pixels for the photograph `label` names.
export function samplePicture(label: string, width = 160, height = 120): Buffer {
  const drawn = createHash('sha256').update(label).digest();
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  // 8 bits a sample, colour type 2 (RGB), deflate, filter method 0, no interlace.
  header.set([8, 2, 0, 0, 0], 8);
  const band = { from: Math.floor(height / 3), to: Math.floor((2 * height) / 3) };
  const colour = [drawn[0] ?? 0, drawn[1] ?? 0, drawn[2] ?? 0].map((value) => 64 + (value % 128));
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const at = 1 + x * 3;
      const pixel =
        y === 0
          ? [drawn[x % drawn.length] ?? 0, drawn[(x + 11) % drawn.length] ?? 0, 230]
          : y >= band.from && y < band.to
            ? colour
            : [230, 230, 230];
      row.set(pixel, at);
    }
    rows.push(row);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

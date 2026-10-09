// SHA-256 of a text, as lower-case hex (FIPS 180-4). Written out here because this package
// depends on nothing and runs on the phone too (ARCHITECTURE §18): it is what a flag's facts are
// hashed with (spec/DATA-MODEL.md §5, `Flag.factsSha256`; ADR-166, 344), the same on every
// machine.

const roundConstants = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// The text as UTF-8 bytes.
function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x80) bytes.push(point);
    else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    else if (point < 0x10000) {
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 0x3f), 0x80 | (point & 0x3f));
    } else {
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return bytes;
}

const rotated = (word: number, by: number): number => (word >>> by) | (word << (32 - by));

export function sha256(text: string): string {
  const bytes = utf8(text);
  const bits = bytes.length * 8;
  // The message, a one bit, noughts to 56 bytes past a block, then its length in bits.
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bits / 0x100000000);
  const low = bits >>> 0;
  for (const part of [high, low]) {
    bytes.push((part >>> 24) & 0xff, (part >>> 16) & 0xff, (part >>> 8) & 0xff, part & 0xff);
  }

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let block = 0; block < bytes.length; block += 64) {
    for (let at = 0; at < 16; at += 1) {
      const from = block + at * 4;
      words[at] =
        (((bytes[from] ?? 0) << 24) |
          ((bytes[from + 1] ?? 0) << 16) |
          ((bytes[from + 2] ?? 0) << 8) |
          (bytes[from + 3] ?? 0)) >>>
        0;
    }
    for (let at = 16; at < 64; at += 1) {
      const before = words[at - 15] ?? 0;
      const after = words[at - 2] ?? 0;
      const small = rotated(before, 7) ^ rotated(before, 18) ^ (before >>> 3);
      const large = rotated(after, 17) ^ rotated(after, 19) ^ (after >>> 10);
      words[at] = ((words[at - 16] ?? 0) + small + (words[at - 7] ?? 0) + large) >>> 0;
    }

    let [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0] = hash;
    for (let at = 0; at < 64; at += 1) {
      const sumE = rotated(e, 6) ^ rotated(e, 11) ^ rotated(e, 25);
      const choice = (e & f) ^ (~e & g);
      const first = (h + sumE + choice + (roundConstants[at] ?? 0) + (words[at] ?? 0)) >>> 0;
      const sumA = rotated(a, 2) ^ rotated(a, 13) ^ rotated(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sumA + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    [a, b, c, d, e, f, g, h].forEach((word, at) => {
      hash[at] = ((hash[at] ?? 0) + word) >>> 0;
    });
  }
  return [...hash].map((word) => word.toString(16).padStart(8, '0')).join('');
}

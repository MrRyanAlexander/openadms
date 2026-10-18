// A phone-made id (src/ids.ts; C31; ADR-565): the field app and the scenario harness make it the
// same way, so it is held here, where the rule lives.
import { describe, expect, it, vi } from 'vitest';

import { uuidv7, uuidv7Time } from '../src/ids.ts';

describe('a phone-made id', () => {
  it('is a UUIDv7 holding the time it was made', () => {
    const at = new Date('2026-10-12T12:15:00.123Z');
    const id = uuidv7(at);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidv7Time(id).toISOString()).toBe('2026-10-12T12:15:00.123Z');
    expect(uuidv7(at)).not.toBe(id);
  });

  it('sorts by the time it was made', () => {
    const earlier = uuidv7(new Date('2026-10-12T12:15:00Z'));
    const later = uuidv7(new Date('2026-10-12T12:15:00.001Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('writes the time whole across its six bytes, the first instant and the last 48 bits hold', () => {
    expect(uuidv7(new Date(0)).slice(0, 13)).toBe('00000000-0000');
    expect(uuidv7(new Date(2 ** 48 - 1)).slice(0, 13)).toBe('ffffffff-ffff');
    const at = new Date('2026-10-18T09:30:00.007Z');
    expect(uuidv7(at).replaceAll('-', '').slice(0, 12)).toBe(
      at.getTime().toString(16).padStart(12, '0'),
    );
  });

  it('is refused a time it can’t hold, never written wrong', () => {
    for (const at of [new Date(-1), new Date(2 ** 48), new Date(Number.NaN)]) {
      expect(() => uuidv7(at)).toThrow(RangeError);
    }
  });

  // OWASP MASWE-0012 (spec/CHECKLIST-FIELD.md): never Math.random.
  it('takes its random bits from the platform’s cryptographic source, Web Crypto', () => {
    const { crypto } = globalThis as unknown as {
      readonly crypto: { getRandomValues(array: Uint8Array): Uint8Array };
    };
    const drawn = vi.spyOn(crypto, 'getRandomValues');
    try {
      const ids = Array.from({ length: 64 }, () => uuidv7(new Date('2026-10-18T09:30:00Z')));
      expect(drawn).toHaveBeenCalledTimes(64);
      expect(new Set(ids.map((id) => id.slice(-12))).size).toBe(64);
    } finally {
      drawn.mockRestore();
    }
  });
});

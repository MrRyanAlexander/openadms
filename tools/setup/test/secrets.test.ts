import { describe, expect, it } from 'vitest';

import { PasscodeHasher, ScramVerifier, SecretMaker } from '../src/secrets.ts';

describe('SecretMaker', () => {
  it('makes a URL-safe 256-bit password, new each time', () => {
    const maker = new SecretMaker();
    const first = maker.password();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(maker.password()).not.toBe(first);
  });
});

describe('ScramVerifier', () => {
  it('matches an independent SCRAM-SHA-256 computation (Python hashlib, RFC 7677 salt)', () => {
    const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
    expect(new ScramVerifier().make('pencil', salt)).toBe(
      'SCRAM-SHA-256$4096:W22ZaJ0SNY7soEsUEjb6gQ==$WG5d8oPm3OtcPnkdi4Uo7BkeZkBFzpcXkuLmtbsT4qY=:wfPLwcE6nTWhTAmQ7tl2KeoiWGPlZqQxSrmfPwDl2dU=',
    );
  });

  it('never contains the password, and salts each verifier afresh', () => {
    const verifier = new ScramVerifier();
    const first = verifier.make('pencil-pencil');
    expect(first).not.toContain('pencil');
    expect(verifier.make('pencil-pencil')).not.toBe(first);
  });
});

describe('PasscodeHasher', () => {
  const hasher = new PasscodeHasher();

  it('asks for 8 to 128 characters, counting code points', () => {
    expect(hasher.problem('1234567')).toBeDefined();
    expect(hasher.problem('12345678')).toBeUndefined();
    expect(hasher.problem('🌀'.repeat(8))).toBeUndefined();
    expect(hasher.problem('🌀'.repeat(7))).toBeDefined();
    expect(hasher.problem('x'.repeat(129))).toBeDefined();
  });

  it('keeps an Argon2id hash that accepts the passcode and nothing else', async () => {
    const phc = await hasher.hash('Delphine-2026');
    expect(phc).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(phc).not.toContain('Delphine');
    expect(hasher.wellFormed(phc)).toBe(true);
    expect(await hasher.verify('Delphine-2026', phc)).toBe(true);
    expect(await hasher.verify('Delphine-2027', phc)).toBe(false);
    expect(await hasher.hash('Delphine-2026')).not.toBe(phc);
  });
});

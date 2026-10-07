// The rules a password is held to when it is set (spec/acceptance/10-api-and-sync.md AC-10-21,
// 23, 24; spec/THREAT-MODEL.md T-16; ADR-402, 403): NIST SP 800-63B-4 §3.1.1.2, OWASP ASVS 5.0
// §6.2. That the release's own list (packages/domain/breached-passwords.txt) holds what these
// tests assume is held by apps/api's tests, which may read a file; this package's read none.
import { describe, expect, it } from 'vitest';

import {
  BreachedPasswords,
  PasswordRules,
  contextWords,
  passwordAsKept,
  passwordProblemCodes,
  policyNames,
} from '../src/index.ts';

// A few lines of the list, as its file holds them: whole passwords, lower case, one a line.
const breached = BreachedPasswords.from('password1234\nqwertyuiop123456\nletmein12345\r\n\n');
const rules = new PasswordRules(
  { passwordMinimumLength: 15, passwordMaximumLength: 128 },
  breached,
);

// Dana Reyes, an admin of Gates Disaster Recovery, and Kim Nguyen, a monitor (CONVENTIONS §6).
const dana = { monitor: false, words: ['Dana Reyes', 'dana.reyes@gates.example', null] };
const kim = { monitor: true, words: ['Kim Nguyen', 'M004127'] };

describe('a password a back-office or outside user sets', () => {
  it('AC-10-21 is taken when it is long: never refused for lacking a capital, a digit or a symbol', () => {
    expect(rules.problem('marsh heron delphine ferry', dana)).toBeUndefined();
    for (const taken of ['aaaaaaaaaaaaaaaa', 'correct horse battery staple', '               ']) {
      expect(rules.problem(taken, dana), taken).toBeUndefined();
    }
  });

  it('AC-10-21 of any characters: spaces, symbols and other alphabets, each code point one character', () => {
    expect(rules.problem('пароль для входа!', dana)).toBeUndefined();
    // Fifteen code points, thirty UTF-16 units.
    expect(rules.problem('🌊'.repeat(15), dana)).toBeUndefined();
    expect(rules.problem('🌊'.repeat(14), dana)?.code).toBe('PASSWORD_TOO_SHORT');
  });

  it('is refused under the policy’s shortest length and over its longest, saying which', () => {
    expect(rules.problem('marsh heron del', dana)).toBeUndefined();
    expect(rules.problem('marsh heron de', dana)).toEqual({
      code: 'PASSWORD_TOO_SHORT',
      message: 'A password needs at least 15 characters.',
    });
    expect(rules.problem('m'.repeat(128) + 'x', dana)).toEqual({
      code: 'PASSWORD_TOO_LONG',
      message: 'A password can have at most 128 characters.',
    });
    expect(rules.problem('marsh heron delphine ferry '.repeat(4), dana)).toBeUndefined();
  });

  it('follows the policy values, never a number in code', () => {
    const shorter = new PasswordRules(
      { passwordMinimumLength: 8, passwordMaximumLength: 64 },
      breached,
    );
    expect(shorter.problem('heron-42', dana)).toBeUndefined();
    expect(shorter.problem('heron-4', dana)?.message).toBe(
      'A password needs at least 8 characters.',
    );
    expect(shorter.problem('h'.repeat(65), dana)?.code).toBe('PASSWORD_TOO_LONG');
  });

  it('AC-10-24 is refused when it is a known breached password, whole and whatever its capitals; the check asks nothing outside', () => {
    const short = new PasswordRules(
      { passwordMinimumLength: 8, passwordMaximumLength: 128 },
      breached,
    );
    expect(short.problem('password1234', dana)).toEqual({
      code: 'PASSWORD_BREACHED',
      message: 'That password is on a list of passwords known from breaches. Choose another.',
    });
    expect(short.problem('PassWord1234', dana)?.code).toBe('PASSWORD_BREACHED');
    expect(rules.problem('qwertyuiop123456', dana)?.code).toBe('PASSWORD_BREACHED');
    // The whole password is compared, never a part of it or a word inside it.
    expect(rules.problem('password1234 on the marsh', dana)).toBeUndefined();
    expect(breached.size).toBe(3);
    expect(breached.has('letmein12345')).toBe(true);
    expect(breached.has('letmein1234')).toBe(false);
  });

  it('is refused when it is made only of their own name or address and the product’s words', () => {
    for (const guessed of [
      'Dana Reyes 2026!',
      'dana.reyes@gates.example',
      'openadms-password',
      'DanaReyesDanaReyes',
      'debris monitor 123',
    ]) {
      expect(rules.problem(guessed, dana), guessed).toEqual({
        code: 'PASSWORD_EASY_TO_GUESS',
        message:
          'That password is made only of your own name or address and words like “password”. Choose another.',
      });
    }
    // A word of theirs inside a longer password refuses nothing.
    expect(rules.problem('dana likes the marsh at dawn', dana)).toBeUndefined();
    expect(rules.problem('1234567890123456', dana)).toBeUndefined();
    expect(contextWords).toContain('open adms');
  });

  it('AC-10-23 nothing makes them change it because time has passed: no rule and no policy value knows a password’s age', () => {
    // The same password is judged the same whenever it is asked about: the rules take no date.
    expect(rules.problem.length).toBe(2);
    expect(rules.problem('marsh heron delphine ferry', dana)).toBeUndefined();
    expect(Object.values(policyNames).filter((name) => /AGE|EXPIR|ROTAT|DAYS/.test(name))).toEqual(
      [],
    );
    expect(passwordProblemCodes).toEqual([
      'PASSWORD_TOO_SHORT',
      'PASSWORD_TOO_LONG',
      'PASSWORD_BREACHED',
      'PASSWORD_EASY_TO_GUESS',
    ]);
  });

  it('is compared and hashed in Unicode’s composed form, and otherwise exactly as typed', () => {
    const composed = 'caf\u00e9 au lait marsh';
    const decomposed = 'cafe\u0301 au lait marsh';
    expect(passwordAsKept(decomposed)).toBe(composed);
    expect(passwordAsKept(' Marsh Heron ')).toBe(' Marsh Heron ');
    // Fourteen characters, not fifteen: the accent is not a character of its own.
    expect(Array.from('cafe\u0301 au lait m')).toHaveLength(15);
    expect(rules.problem('cafe\u0301 au lait m', dana)?.code).toBe('PASSWORD_TOO_SHORT');
  });
});

describe('a monitor’s password', () => {
  it('is the firm’s practice, their phone number without the area code (ADR-105): exempt from the length, the list and the words', () => {
    expect(rules.problem('5550142', kim)).toBeUndefined();
    expect(rules.problem('password1234', kim)).toBeUndefined();
    expect(rules.problem('kimnguyen', kim)).toBeUndefined();
  });

  it('is never empty, and never over the longest', () => {
    expect(rules.problem('', kim)).toEqual({
      code: 'PASSWORD_TOO_SHORT',
      message: 'A password can’t be empty.',
    });
    expect(rules.problem('5'.repeat(129), kim)?.code).toBe('PASSWORD_TOO_LONG');
  });
});

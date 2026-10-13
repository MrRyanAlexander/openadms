// The firm's phones and its master passcode, as the back office changes them (ARCHITECTURE §7.4,
// §7.5; AC-02-59; AC-10-24; ADR-106, 134, 403, 428), and who may dispatch (ADR-050, 240, 428).
import { describe, expect, it } from 'vitest';

import {
  BreachedPasswords,
  DispatchRights,
  MasterPasscodeRules,
  PhoneRules,
  phoneRemovals,
  TurnInRules,
  type Holder,
} from '../src/index.ts';

const dana: Holder = { role: 'ADMIN', archived: false, granted: [] };
const luis: Holder = { role: 'MANAGER_ANALYST', archived: false, granted: ['VOID', 'QC'] };

describe('who may dispatch', () => {
  const refusal = (person: Holder, name: string) =>
    new DispatchRights({ ...person, name }).refusal();

  it('an admin may, and a manager/analyst who holds Dispatch now; a manager/analyst without it is told who may, in plain words', () => {
    expect(refusal(dana, 'Dana Reyes')).toBeNull();
    expect(refusal({ ...luis, granted: [...luis.granted, 'DISPATCH'] }, 'Luis Ortega')).toBeNull();
    expect(refusal(luis, 'Luis Ortega')).toEqual({
      code: 'NOT_ALLOWED',
      message:
        'Luis Ortega may not dispatch: it takes an admin, or a manager/analyst granted "dispatch". Nothing was changed.',
    });
    // Setup is another permission: holding it opens nothing here.
    expect(refusal({ ...luis, granted: ['SETUP'] }, 'Luis Ortega')?.code).toBe('NOT_ALLOWED');
  });

  it('nobody else may, whatever is written beside them: a monitor, a read-only viewer, the system actor, an archived admin, somebody the firm has no record of', () => {
    for (const role of ['MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM']) {
      expect(refusal({ role, archived: false, granted: ['DISPATCH'] }, 'Somebody')?.code).toBe(
        'NOT_ALLOWED',
      );
    }
    expect(refusal({ ...dana, archived: true }, 'Dana Reyes')?.code).toBe('NOT_ALLOWED');
    expect(new DispatchRights(null).refusal()?.message).toBe(
      'Somebody the firm has no record of may not dispatch: it takes an admin, or a manager/analyst granted "dispatch". Nothing was changed.',
    );
  });
});

describe('a phone taken out of service', () => {
  it('AC-02-59 leaves as lost or retired, once: one already out of service is refused in plain words', () => {
    expect(phoneRemovals).toEqual(['LOST', 'RETIRED']);
    const rules = new PhoneRules();
    expect(rules.removalRefusal({ name: 'P1-TWR-LF', outOfServiceAt: null })).toBeNull();
    expect(
      rules.removalRefusal({
        name: 'P1-TWR-LF',
        outOfServiceAt: new Date('2026-10-12T22:10:00Z'),
      }),
    ).toEqual({
      code: 'ALREADY_OUT_OF_SERVICE',
      message: 'P1-TWR-LF was already taken out of service. Nothing was changed.',
    });
  });
});

describe('a phone turned in', () => {
  const rules = new TurnInRules();

  it('AC-02-58 a phone in hand that reports the last number it used of a series hands back the unused rest; a series it does not report is retired whole', () => {
    expect(rules.blocksEnd({ status: 'ACTIVE' }, true)).toBe('RECLAIMED');
    expect(rules.blocksEnd({ status: 'ACTIVE' }, false)).toBe('RETIRED');
    // Retired by the back office and turned in by hand: it is in hand, and its report is taken.
    expect(rules.blocksEnd({ status: 'RETIRED' }, true)).toBe('RECLAIMED');
    expect(rules.blocksEnd({ status: 'RETIRED' }, false)).toBe('RETIRED');
  });

  it('AC-02-61 a lost phone that turns up has its blocks retired whole, whatever it reports: nobody can be sure what it used', () => {
    expect(rules.blocksEnd({ status: 'LOST' }, true)).toBe('RETIRED');
    expect(rules.blocksEnd({ status: 'LOST' }, false)).toBe('RETIRED');
  });

  it('a phone holding what the server does not have is told so in plain words, and that nothing was wiped', () => {
    expect(rules.notConfirmed({ records: 1, files: 0 })).toBe(
      'Not turned in: the server doesn’t have 1 record this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.',
    );
    expect(rules.notConfirmed({ records: 0, files: 2 })).toBe(
      'Not turned in: the server doesn’t have 2 photographs’ files this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.',
    );
    expect(rules.notConfirmed({ records: 3, files: 1 })).toBe(
      'Not turned in: the server doesn’t have 3 records and 1 photograph’s file this phone holds yet. Nothing was wiped and nothing was changed. Sync the phone again, then turn it in.',
    );
  });
});

describe('the master passcode', () => {
  const rules = new MasterPasscodeRules(BreachedPasswords.from('password1234\nletmein12345\n'));

  it('AC-10-24 is 8 to 128 characters, each code point one, and never a password known from breaches, whatever its capitals', () => {
    expect(rules.problem('heron-marsh')).toBeUndefined();
    expect(rules.problem('12345678')).toBeUndefined();
    expect(rules.problem('1234567')).toEqual({
      code: 'PASSWORD_TOO_SHORT',
      message: 'The master passcode needs at least 8 characters.',
    });
    expect(rules.problem('é'.repeat(128))).toBeUndefined();
    expect(rules.problem('é'.repeat(129))).toEqual({
      code: 'PASSWORD_TOO_LONG',
      message: 'The master passcode can have at most 128 characters.',
    });
    expect(rules.problem('PassWord1234')).toEqual({
      code: 'PASSWORD_BREACHED',
      message: 'That is on a list of passwords known from breaches. Choose another.',
    });
    // A word of the list inside a longer passcode is no entry of the list.
    expect(rules.problem('password1234-marsh')).toBeUndefined();
  });

  it('has no composition rule: digits alone, or one word, are taken', () => {
    expect(rules.problem('4127 8850')).toBeUndefined();
    expect(rules.problem('delphine')).toBeUndefined();
  });
});

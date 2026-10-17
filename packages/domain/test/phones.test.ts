// The firm's phones and its master passcode, as the back office changes them (ARCHITECTURE §7.4,
// §7.5; AC-02-59; AC-10-24, 83…86; ADR-106, 134, 403, 428, 520, 530), and who may dispatch
// (ADR-050, 240, 428).
import { describe, expect, it } from 'vitest';

import {
  BreachedPasswords,
  DispatchRights,
  MasterPasscodeRules,
  PhoneKeyRules,
  PhoneRules,
  phoneKeyHoursAtMost,
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
    expect(
      refusal({ ...luis, granted: [...luis.granted, 'DISPATCH', 'VIEW_DISPATCH'] }, 'Luis Ortega'),
    ).toBeNull();
    // Dispatch without its view is no dispatch (ADR-539).
    expect(refusal({ ...luis, granted: [...luis.granted, 'DISPATCH'] }, 'Luis Ortega')?.code).toBe(
      'NOT_ALLOWED',
    );
    expect(refusal(luis, 'Luis Ortega')).toEqual({
      code: 'NOT_ALLOWED',
      message:
        'Luis Ortega may not dispatch: it takes an admin, or a manager/analyst granted "dispatch" and "view dispatch". Nothing was changed.',
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
      'Somebody the firm has no record of may not dispatch: it takes an admin, or a manager/analyst granted "dispatch" and "view dispatch". Nothing was changed.',
    );
  });
});

describe('a phone taken out of service', () => {
  const rules = new PhoneRules();
  const enrolledAt = new Date('2026-10-01T12:00:00Z');
  const now = new Date('2026-10-12T22:10:00Z');
  const inService = {
    name: 'P1-TWR-LF',
    status: 'ACTIVE',
    enrolledAt,
    outOfServiceAt: null,
    keyRevokedAt: null,
  } as const;
  const lost = { ...inService, status: 'LOST', outOfServiceAt: now } as const;
  const retired = { ...inService, status: 'RETIRED', outOfServiceAt: now } as const;

  it('AC-02-59 leaves as lost or retired, once: one already out of service is refused in plain words', () => {
    expect(phoneRemovals).toEqual(['LOST', 'RETIRED']);
    expect(rules.removalRefusal(inService, { status: 'LOST' }, now)).toBeNull();
    expect(rules.removalRefusal(retired, { status: 'LOST' }, now)).toEqual({
      code: 'ALREADY_OUT_OF_SERVICE',
      message: 'P1-TWR-LF was already taken out of service as retired. Nothing was changed.',
    });
    expect(rules.removalRefusal(lost, { status: 'LOST' }, now)).toEqual({
      code: 'ALREADY_OUT_OF_SERVICE',
      message: 'P1-TWR-LF was already taken out of service as lost. Nothing was changed.',
    });
  });

  it('AC-10-84 a lost phone may be made retired, keeping its removal time unless one is stated', () => {
    expect(rules.removalRefusal(lost, { status: 'RETIRED' }, now)).toBeNull();
    const later = new Date('2026-10-13T09:00:00Z');
    expect(rules.removedAt(lost, { status: 'RETIRED' }, later)).toEqual(now);
    expect(rules.removedAt(inService, { status: 'LOST' }, later)).toEqual(later);
  });

  it('AC-10-84 a removal time stated by hand is never after now nor before the phone was enrolled', () => {
    const earlier = new Date('2026-10-12T15:00:00Z');
    expect(
      rules.removalRefusal(inService, { status: 'LOST', outOfServiceAt: earlier }, now),
    ).toBeNull();
    expect(rules.removedAt(inService, { status: 'LOST', outOfServiceAt: earlier }, now)).toEqual(
      earlier,
    );
    const refused = {
      code: 'REMOVAL_TIME_REFUSED',
      message:
        'A removal time is never after now, nor before P1-TWR-LF was enrolled. Nothing was changed.',
    };
    for (const stated of [new Date('2026-10-12T22:10:01Z'), new Date('2026-09-30T12:00:00Z')]) {
      expect(
        rules.removalRefusal(inService, { status: 'LOST', outOfServiceAt: stated }, now),
      ).toEqual(refused);
    }
  });

  it('AC-10-84 a found phone goes back in service while its key stands; a revoked key never does, nor changes', () => {
    expect(rules.returnRefusal(lost)).toBeNull();
    expect(rules.returnRefusal(retired)).toBeNull();
    expect(rules.returnRefusal(inService)).toEqual({
      code: 'IN_SERVICE',
      message: 'P1-TWR-LF is in service. Nothing was changed.',
    });
    const revoked = { ...lost, keyRevokedAt: now };
    const told = {
      code: 'KEY_REVOKED',
      message:
        'P1-TWR-LF’s key is revoked, so it stays as it is. Wipe the phone and enrol it again to use it. Nothing was changed.',
    };
    expect(rules.returnRefusal(revoked)).toEqual(told);
    expect(rules.removalRefusal(revoked, { status: 'RETIRED' }, now)).toEqual(told);
  });
});

describe('a lost phone’s key after the firm’s time', () => {
  const rules = new PhoneKeyRules();
  const marked = new Date('2026-10-12T22:10:00Z');

  it('AC-10-83 is due the firm’s hours after its last mark, and never while the firm has it off', () => {
    expect(rules.dueAt(marked, 24)).toEqual(new Date('2026-10-13T22:10:00Z'));
    expect(rules.due(marked, 24, new Date('2026-10-13T22:09:59.999Z'))).toBe(false);
    expect(rules.due(marked, 24, new Date('2026-10-13T22:10:00Z'))).toBe(true);
    expect(rules.due(marked, null, new Date('2027-10-13T22:10:00Z'))).toBe(false);
    expect(rules.due(null, 24, new Date('2027-10-13T22:10:00Z'))).toBe(false);
    expect(rules.markedBy(new Date('2026-10-13T22:10:00Z'), 24)).toEqual(marked);
  });

  it('AC-10-83 starts at the policy’s hours, nought for off, a year at the most', () => {
    expect(PhoneKeyRules.startingHours({ phoneKeyRevokedAfterHours: 24 })).toBe(24);
    expect(PhoneKeyRules.startingHours({ phoneKeyRevokedAfterHours: 0 })).toBeNull();
    expect(phoneKeyHoursAtMost).toBe(8760);
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
  const rules = new MasterPasscodeRules(
    { masterPasscodeMinimumLength: 8, masterPasscodeMaximumLength: 128 },
    BreachedPasswords.from('password1234\nletmein12345\n'),
  );

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

  it('takes its lengths from the policy (ADR-530)', () => {
    const longer = new MasterPasscodeRules(
      { masterPasscodeMinimumLength: 12, masterPasscodeMaximumLength: 64 },
      BreachedPasswords.from(''),
    );
    expect(longer.problem('heron-marsh')?.message).toBe(
      'The master passcode needs at least 12 characters.',
    );
    expect(longer.problem('a'.repeat(65))?.message).toBe(
      'The master passcode can have at most 64 characters.',
    );
  });

  it('has no composition rule: digits alone, or one word, are taken', () => {
    expect(rules.problem('4127 8850')).toBeUndefined();
    expect(rules.problem('delphine')).toBeUndefined();
  });
});

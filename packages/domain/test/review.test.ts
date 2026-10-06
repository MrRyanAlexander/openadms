// Who may act on a record after the worker has looked at it, and what a renumber, a picked
// reason and a quarantined record's resolution are told (spec/acceptance/
// 08-review-and-corrections.md AC-08-05, 21, 26, 27, 29, 30; ADR-364).
import { describe, expect, it } from 'vitest';

import {
  PickedReason,
  QuarantineResolution,
  Renumber,
  Reviewer,
  reviewPermissions,
  type ReviewingPerson,
} from '../src/index.ts';

const luis: ReviewingPerson = {
  name: 'Luis Ortega',
  role: 'MANAGER_ANALYST',
  archived: false,
  granted: ['CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED'],
};
const dana: ReviewingPerson = { name: 'Dana Reyes', role: 'ADMIN', archived: false, granted: [] };

describe('who may do a reviewer’s action', () => {
  it('AC-08-05 an admin may do each, with no grant of her own', () => {
    for (const permission of reviewPermissions) {
      expect(new Reviewer(dana).refusal(permission), permission).toBeNull();
    }
  });

  it('AC-08-05 a manager/analyst may do each action he is granted, and no other: Luis, granted no unlock, can’t unlock', () => {
    const reviewer = new Reviewer(luis);
    for (const permission of luis.granted) {
      expect(reviewer.refusal(permission as (typeof reviewPermissions)[number])).toBeNull();
    }
    expect(reviewer.refusal('UNLOCK_INVOICED')).toEqual({
      code: 'NOT_PERMITTED',
      message:
        'Luis Ortega may not unlock an invoiced ticket: it takes an admin, or a manager/analyst granted "unlock". Nothing was changed.',
    });
  });

  it('AC-08-05 a manager/analyst without void can’t void, in plain words', () => {
    const withoutVoid = { ...luis, granted: luis.granted.filter((grant) => grant !== 'VOID') };
    expect(new Reviewer(withoutVoid).refusal('VOID')?.message).toBe(
      'Luis Ortega may not void or unvoid a ticket: it takes an admin, or a manager/analyst granted "void". Nothing was changed.',
    );
    expect(new Reviewer(withoutVoid).refusal('CORRECT')).toBeNull();
  });

  it('AC-08-06 a monitor, a read-only viewer and the system actor may do none, whatever a row says they are granted', () => {
    for (const role of ['MONITOR', 'READ_ONLY_VIEWER', 'SYSTEM'] as const) {
      const person = { name: 'Ana Brooks', role, archived: false, granted: [...reviewPermissions] };
      for (const permission of reviewPermissions) {
        expect(new Reviewer(person).refusal(permission)?.code, `${role} ${permission}`).toBe(
          'NOT_PERMITTED',
        );
      }
    }
    expect(
      new Reviewer({ name: 'Ana Brooks', role: 'MONITOR', archived: false, granted: [] }).refusal(
        'CORRECT',
      )?.message,
    ).toBe(
      'Ana Brooks may not correct a record: it takes an admin, or a manager/analyst granted "correct". Nothing was changed.',
    );
  });

  it('a person who has been archived may do none, an admin included', () => {
    expect(new Reviewer({ ...dana, archived: true }).refusal('CORRECT')?.code).toBe(
      'NOT_PERMITTED',
    );
    expect(new Reviewer({ ...luis, archived: true }).refusal('RENUMBER')?.code).toBe(
      'NOT_PERMITTED',
    );
  });
});

const bare = (ticketNumber: string) => ({ ticketNumber, splitSuffix: '' });

describe('a renumber', () => {
  it('AC-08-22 changes the number and nothing else, taken as typed but for the spaces around it', () => {
    const renumber = new Renumber('DISPOSAL', bare('101060'), bare(' 101006 '));
    expect(renumber.refusal()).toBeNull();
    expect(renumber.to).toEqual({ ticketNumber: '101006', splitSuffix: '' });
  });

  it('AC-08-27 onto a number another field event of its kind holds is told so, the number as written', () => {
    expect(new Renumber('DISPOSAL', bare('101021'), bare('101020')).held()).toEqual({
      code: 'NUMBER_HELD',
      message:
        'Ticket 101020 already has a disposal: a ticket has one of each kind. Nothing was changed.',
    });
    expect(
      new Renumber(
        'COLLECTION',
        { ticketNumber: '102001', splitSuffix: 'C' },
        { ticketNumber: '102001', splitSuffix: 'A' },
      ).held().message,
    ).toBe(
      'Ticket 102001-A already has a collection: a ticket has one of each kind. Nothing was changed.',
    );
  });

  it('AC-08-29 of a split’s collection changes its suffix on the same base number', () => {
    const renumber = new Renumber(
      'COLLECTION',
      { ticketNumber: '102001', splitSuffix: 'C' },
      { ticketNumber: '102001', splitSuffix: 'B' },
    );
    expect(renumber.refusal()).toBeNull();
    expect(renumber.to).toEqual({ ticketNumber: '102001', splitSuffix: 'B' });
  });

  it('AC-08-30 of a phantom is refused nothing: whether the work is real is never asked', () => {
    expect(new Renumber('COLLECTION', bare('101031'), bare('101035')).refusal()).toBeNull();
  });

  it('is refused only what can’t be a number: a blank, the number it has, a suffix that isn’t capital letters, a suffix on a kind that takes none', () => {
    const refusalOf = (
      kind: ConstructorParameters<typeof Renumber>[0],
      to: { ticketNumber: string; splitSuffix: string },
    ) => new Renumber(kind, bare('101006'), to).refusal()?.code;
    expect(refusalOf('COLLECTION', bare('  '))).toBe('NUMBER_BLANK');
    expect(refusalOf('COLLECTION', bare('101006'))).toBe('NUMBER_UNCHANGED');
    expect(refusalOf('COLLECTION', { ticketNumber: '101006', splitSuffix: 'b' })).toBe(
      'SUFFIX_NOT_LETTERS',
    );
    expect(refusalOf('HAUL_OUT_COLLECTION', { ticketNumber: '201004', splitSuffix: 'A' })).toBe(
      undefined,
    );
    for (const kind of ['DISPOSAL', 'HAUL_OUT_DISPOSAL', 'UNIT_RATE'] as const) {
      expect(refusalOf(kind, { ticketNumber: '101006', splitSuffix: 'A' }), kind).toBe(
        'SUFFIX_NOT_ON_THIS_KIND',
      );
    }
    expect(
      new Renumber('DISPOSAL', bare('101006'), {
        ticketNumber: '101006',
        splitSuffix: 'A',
      }).refusal()?.message,
    ).toBe('A disposal takes no split suffix: only a split’s collections do. Nothing was changed.');
  });
});

describe('a reason picked from the firm’s list', () => {
  const deviceFailed = { name: 'Device failed', uses: ['BACK_OFFICE_RECORD'], archived: false };

  it('AC-08-21 is one the firm offers for that use: "Device failed" for a record created in the back office', () => {
    expect(new PickedReason(deviceFailed).refusal('BACK_OFFICE_RECORD')).toBeNull();
  });

  it('AC-08-21 another list’s reason, or one the firm archived, is refused in plain words', () => {
    expect(
      new PickedReason({ name: 'Photos confirm', uses: ['ACCEPT_FLAG'], archived: false }).refusal(
        'BACK_OFFICE_RECORD',
      ),
    ).toEqual({
      code: 'REASON_NOT_OFFERED',
      message:
        '"Photos confirm" isn’t a reason the firm offers for a record created in the back office. Nothing was saved.',
    });
    expect(
      new PickedReason({ ...deviceFailed, archived: true }).refusal('BACK_OFFICE_RECORD')?.code,
    ).toBe('REASON_NOT_OFFERED');
    expect(new PickedReason(deviceFailed).refusal('VOID')?.message).toBe(
      '"Device failed" isn’t a reason the firm offers for voiding a ticket. Nothing was saved.',
    );
  });
});

describe('a quarantined record’s resolution', () => {
  it('AC-08-26 says how it was resolved, in words its record keeps', () => {
    const waiting = new QuarantineResolution(null);
    expect(waiting.refusal()).toBeNull();
    expect(waiting.renumbered('101021')).toBe(
      'Renumbered to 101021: saved as a record of its own, with its photographs.',
    );
    expect(waiting.secondCopy()).toBe(
      'A second copy of the record that holds its number: nothing was made from it.',
    );
  });

  it('AC-08-26 is made once: a record already resolved stays as it was resolved', () => {
    expect(
      new QuarantineResolution(
        'Renumbered to 101021: saved as a record of its own, with its photographs.',
      ).refusal(),
    ).toEqual({
      code: 'ALREADY_RESOLVED',
      message:
        'This quarantined record is already resolved (Renumbered to 101021: saved as a record of its own, with its photographs.). Nothing was changed.',
    });
  });

  it('an ROE’s new number is one no ROE of the project holds, and never blank', () => {
    const waiting = new QuarantineResolution(null);
    expect(waiting.roeNumberHeld('R-0007').message).toBe(
      'ROE R-0007: this project already has an ROE with that number. Nothing was changed.',
    );
    expect(waiting.roeNumberHeld('').code).toBe('NUMBER_BLANK');
  });
});

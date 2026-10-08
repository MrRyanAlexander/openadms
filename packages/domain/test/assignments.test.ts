// A day's assignments, as the back office writes them on the dispatch board (AC-02-24…32;
// ADR-240, 241, 308, 429).
import { describe, expect, it } from 'vitest';

import { AssignmentRules, assignableRoles, assignmentFormDocumentTypes } from '../src/index.ts';

const rules = new AssignmentRules();

describe('who is given an assignment', () => {
  it('a monitor, an admin or a manager/analyst in service; never a read-only viewer or the system actor, said in plain words', () => {
    expect(assignableRoles).toEqual(['MONITOR', 'ADMIN', 'MANAGER_ANALYST']);
    for (const role of assignableRoles) {
      expect(rules.personRefusal({ name: 'Ana Brooks', role, archived: false }), role).toBeNull();
    }
    for (const role of ['READ_ONLY_VIEWER', 'SYSTEM', 'SUPERVISOR']) {
      expect(rules.personRefusal({ name: 'Pat Lin', role, archived: false }), role).toEqual({
        code: 'PERSON_NOT_ASSIGNABLE',
        message:
          'Pat Lin can’t be given an assignment: one is for a monitor or one of the firm’s back office. Nothing was saved.',
      });
    }
  });

  it('never somebody archived', () => {
    expect(rules.personRefusal({ name: 'Ana Brooks', role: 'MONITOR', archived: true })).toEqual({
      code: 'PERSON_ARCHIVED',
      message: 'Ana Brooks is archived, and can’t be given an assignment. Nothing was saved.',
    });
  });
});

describe('what an assignment names', () => {
  it('AC-02-27 its forms are the four that are no ticket’s', () => {
    expect(assignmentFormDocumentTypes).toEqual(['ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG']);
  });

  it('a phone in service; one taken out of service is refused in plain words', () => {
    expect(rules.phoneRefusal({ name: 'P1-COL-1', outOfServiceAt: null })).toBeNull();
    expect(
      rules.phoneRefusal({ name: 'P1-TWR-LF', outOfServiceAt: new Date('2026-10-12T22:10:00Z') }),
    ).toEqual({
      code: 'PHONE_OUT_OF_SERVICE',
      message:
        'P1-TWR-LF was taken out of service. Name another phone, or none. Nothing was saved.',
    });
  });

  it('AC-02-31 unit rate pay items only: one with no kind of work is refused by its code', () => {
    expect(rules.payItemRefusal({ code: 'HNG-RMV-EA', kindOfWorkId: 'a-kind' })).toBeNull();
    expect(rules.payItemRefusal({ code: 'VEG-HAUL-CY-15', kindOfWorkId: null })).toEqual({
      code: 'NOT_A_UNIT_RATE_PAY_ITEM',
      message:
        'VEG-HAUL-CY-15 is no unit rate pay item: an assignment names only the unit rate pay items a person does that day. Nothing was saved.',
    });
  });
});

describe('an assignment changed or withdrawn on the board', () => {
  const kims = { personName: 'Kim Nguyen', origin: 'PLANNED', withdrawn: false };

  it('a planned one that stands may be; a withdrawn one is changed no more', () => {
    expect(rules.changeRefusal(kims)).toBeNull();
    expect(rules.changeRefusal({ ...kims, withdrawn: true })).toEqual({
      code: 'ALREADY_WITHDRAWN',
      message: 'Kim Nguyen’s assignment was already withdrawn. Nothing was changed.',
    });
  });

  it('AC-02-26 one made on a phone under the master passcode is the phone’s, withdrawn or not', () => {
    for (const withdrawn of [false, true]) {
      expect(
        rules.changeRefusal({ personName: 'Tariq Patel', origin: 'UNPLANNED', withdrawn }),
      ).toEqual({
        code: 'MADE_ON_A_PHONE',
        message:
          'Tariq Patel’s assignment was made on a phone under the master passcode: the board shows it and changes nothing of it. Nothing was changed.',
      });
    }
  });
});

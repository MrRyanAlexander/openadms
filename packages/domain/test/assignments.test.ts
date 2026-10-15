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

  it('ADR-527 (13) a withdrawn one is put back; one that stands has nothing to put back; one made on a phone is never the board’s', () => {
    expect(rules.putBackRefusal({ ...kims, withdrawn: true })).toBeNull();
    expect(rules.putBackRefusal(kims)).toEqual({
      code: 'NOT_WITHDRAWN',
      message: 'Kim Nguyen’s assignment stands: there is nothing to put back. Nothing was changed.',
    });
    expect(
      rules.putBackRefusal({ personName: 'Tariq Patel', origin: 'UNPLANNED', withdrawn: true })
        ?.code,
    ).toBe('MADE_ON_A_PHONE');
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

describe('the assignment a phone takes when its monitor signs in', () => {
  const bayline = 'America/New_York';
  // Monday 12 October 2026, 06:30 in Bayline County.
  const mondayMorning = new Date('2026-10-12T06:30:00-04:00');
  const kims = {
    id: 'kims',
    workDate: '2026-10-12',
    timeZone: bayline,
    deviceId: 'P1-TWR-TDSR',
    madeAt: null,
  };

  it('AC-02-35 the monitor’s assignment for the day, on the phone the board named and on any other', () => {
    expect(rules.takenAtSignIn(mondayMorning, 'P1-TWR-TDSR', [kims])).toEqual({
      taken: true,
      id: 'kims',
    });
    expect(rules.takenAtSignIn(mondayMorning, 'P1-COL-1', [kims])).toEqual({
      taken: true,
      id: 'kims',
    });
    expect(rules.takenAtSignIn(mondayMorning, 'P1-COL-1', [{ ...kims, deviceId: null }])).toEqual({
      taken: true,
      id: 'kims',
    });
  });

  it('none that day: the phone takes none, and another day’s is not the day’s', () => {
    const none = { taken: false, why: 'NONE_THAT_DAY' };
    expect(rules.takenAtSignIn(mondayMorning, 'P1-TWR-TDSR', [])).toEqual(none);
    for (const workDate of ['2026-10-11', '2026-10-13']) {
      expect(rules.takenAtSignIn(mondayMorning, 'P1-TWR-TDSR', [{ ...kims, workDate }])).toEqual(
        none,
      );
    }
  });

  it('the day is the project’s own: 23:30 on Monday in Bayline County is already Tuesday in UTC, and still Monday’s assignment', () => {
    const lateMonday = new Date('2026-10-12T23:30:00-04:00');
    expect(lateMonday.toISOString().slice(0, 10)).toBe('2026-10-13');
    expect(rules.takenAtSignIn(lateMonday, 'P1-TWR-TDSR', [kims])).toEqual({
      taken: true,
      id: 'kims',
    });
    // One instant, two projects, two days: each assignment is read by its own project’s day.
    const honolulu = { ...kims, id: 'west', timeZone: 'Pacific/Honolulu' };
    const earlyTuesday = new Date('2026-10-13T00:30:00-04:00');
    expect(rules.takenAtSignIn(earlyTuesday, 'P1-TWR-TDSR', [kims])).toEqual({
      taken: false,
      why: 'NONE_THAT_DAY',
    });
    expect(rules.takenAtSignIn(earlyTuesday, 'P1-TWR-TDSR', [kims, honolulu])).toEqual({
      taken: true,
      id: 'west',
    });
  });

  it('AC-02-29, 36 two that day, on P1 and P2: each phone takes the one that names it; a phone neither names takes none, and no project is picked for her', () => {
    const planned = { workDate: '2026-10-12', timeZone: bayline, madeAt: null };
    const p1 = { ...planned, id: 'p1', deviceId: 'P1-COL-1' };
    const p2 = { ...planned, id: 'p2', deviceId: 'P2-COL-1' };
    expect(rules.takenAtSignIn(mondayMorning, 'P1-COL-1', [p1, p2])).toEqual({
      taken: true,
      id: 'p1',
    });
    expect(rules.takenAtSignIn(mondayMorning, 'P2-COL-1', [p1, p2])).toEqual({
      taken: true,
      id: 'p2',
    });
    const several = { taken: false, why: 'SEVERAL_THAT_DAY' };
    expect(rules.takenAtSignIn(mondayMorning, 'P1-COL-2', [p1, p2])).toEqual(several);
    // Two that name one phone: one assignment on a phone at a time, so neither is picked.
    expect(
      rules.takenAtSignIn(mondayMorning, 'P1-COL-1', [p1, { ...p2, deviceId: 'P1-COL-1' }]),
    ).toEqual(several);
    // The one that names this phone is taken though another names none.
    expect(rules.takenAtSignIn(mondayMorning, 'P1-COL-1', [p1, { ...p2, deviceId: null }])).toEqual(
      { taken: true, id: 'p1' },
    );
  });
});

describe('several of a monitor’s assignments name the phone they sign in on', () => {
  const bayline = 'America/New_York';
  // Monday 12 October 2026, 14:30 in Bayline County.
  const mondayAfternoon = new Date('2026-10-12T14:30:00-04:00');
  const monday = { workDate: '2026-10-12', timeZone: bayline, deviceId: 'P1-TWR-TDSR' };
  const at = (time: string) => new Date(`2026-10-12T${time}:00-04:00`);
  // Kim's plan for the day, written on the board, naming the tower's phone.
  const plan = { ...monday, id: 'plan', madeAt: null };
  // The phone set up under the master passcode at 06:40, and moved to the Landfill at 13:10.
  const setUp = { ...monday, id: 'set-up', madeAt: at('06:40') };
  const moved = { ...monday, id: 'moved', madeAt: at('13:10') };
  const takes = (standing: Parameters<typeof rules.takenAtSignIn>[2], on = 'P1-TWR-TDSR') =>
    rules.takenAtSignIn(mondayAfternoon, on, standing);
  const several = { taken: false, why: 'SEVERAL_THAT_DAY' };

  it('AC-02-47 the phone takes the one made on it last: after a site move the new site’s, whatever order they are read in, and not the board’s plan', () => {
    expect(takes([plan, moved])).toEqual({ taken: true, id: 'moved' });
    expect(takes([setUp, moved])).toEqual({ taken: true, id: 'moved' });
    expect(takes([moved, setUp])).toEqual({ taken: true, id: 'moved' });
    expect(takes([moved, plan, setUp])).toEqual({ taken: true, id: 'moved' });
    // One made on the phone and the plan that names it: what was set up there stands.
    expect(takes([setUp, plan])).toEqual({ taken: true, id: 'set-up' });
  });

  it('two made on it at one instant, or none made on it at all: none is the last, so the phone takes none', () => {
    expect(takes([setUp, { ...moved, madeAt: at('06:40') }])).toEqual(several);
    expect(takes([plan, { ...plan, id: 'second plan' }])).toEqual(several);
  });

  it('only what names this phone is weighed: one made on another phone later is not this phone’s, and another day’s is not the day’s', () => {
    const onAnother = { ...moved, id: 'on another', deviceId: 'P1-COL-1', madeAt: at('14:00') };
    expect(takes([setUp, onAnother])).toEqual({ taken: true, id: 'set-up' });
    expect(takes([setUp, moved, onAnother])).toEqual({ taken: true, id: 'moved' });
    // On a phone neither names, two are still several: nobody picks for her.
    expect(takes([setUp, onAnother], 'P1-COL-2')).toEqual(several);
    const tuesdays = { ...moved, id: 'tuesday’s', workDate: '2026-10-13', madeAt: at('23:59') };
    expect(takes([setUp, tuesdays])).toEqual({ taken: true, id: 'set-up' });
  });
});

describe('an unplanned assignment a phone reports', () => {
  const bayline = 'America/New_York';

  it('REQ-202b what it was made at says its security events: a phone set up, or a phone switched, and always a use of the master passcode', () => {
    expect(rules.securityEventsOf('SETUP')).toEqual(['DEVICE_SETUP', 'MASTER_PASSCODE_USE']);
    expect(rules.securityEventsOf('MONITOR_SWITCH')).toEqual([
      'DEVICE_SWITCH',
      'MASTER_PASSCODE_USE',
    ]);
  });

  it('AC-02-38 its day is the day its phone’s clock said, in the project’s own time zone', () => {
    // Set up at 06:40 on Monday in Bayline County.
    expect(rules.unplannedDay(new Date('2026-10-12T06:40:00-04:00'), bayline)).toBe('2026-10-12');
    // Half past midnight on Tuesday there is still Monday in Honolulu.
    const earlyTuesday = new Date('2026-10-13T00:30:00-04:00');
    expect(rules.unplannedDay(earlyTuesday, bayline)).toBe('2026-10-13');
    expect(rules.unplannedDay(earlyTuesday, 'Pacific/Honolulu')).toBe('2026-10-12');
  });

  it('AC-02-38 it is for a monitor, whom a phone’s login list names, and for nobody else', () => {
    expect(rules.mayHoldUnplanned({ role: 'MONITOR' })).toBe(true);
    for (const role of ['ADMIN', 'MANAGER_ANALYST', 'VIEWER', 'SYSTEM', 'MASTER_PASSCODE']) {
      expect(rules.mayHoldUnplanned({ role }), role).toBe(false);
    }
    expect(rules.mayHoldUnplanned(null)).toBe(false);
  });

  it('AC-05-40 reported again by the phone that made it, it is already saved; an id that is another phone’s, or one written on the board, is held', () => {
    const tariqs = { origin: 'UNPLANNED', deviceId: 'P1-TWR-LF' };
    expect(rules.reportedAgain(tariqs, 'P1-TWR-LF')).toBe('ALREADY_SAVED');
    expect(rules.reportedAgain(tariqs, 'P1-COL-1')).toBe('ID_ALREADY_HELD');
    expect(rules.reportedAgain({ origin: 'PLANNED', deviceId: 'P1-TWR-LF' }, 'P1-TWR-LF')).toBe(
      'ID_ALREADY_HELD',
    );
    expect(rules.reportedAgain({ origin: 'PLANNED', deviceId: null }, 'P1-TWR-LF')).toBe(
      'ID_ALREADY_HELD',
    );
  });
});

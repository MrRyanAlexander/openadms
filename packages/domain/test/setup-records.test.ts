// What setup says as the firm's lists are added to and archived, a crew day's steps stated and a
// project closed (spec/LISTS.md; ADR-087, 194, 355, 527, 529): a built-in value is never
// archived, a crew day's steps never share an hour, and a close says what is still open.
import { describe, expect, it } from 'vitest';

import { CrewDaySteps, ListValues, ProjectClosing } from '../src/setup-records.ts';

describe('a list value archived', () => {
  it('ADR-527 (6) the firm’s own is archived; a built-in one is renamed, never archived', () => {
    expect(new ListValues().archiveRefusal({ name: 'Burn site', key: null })).toBeNull();
    expect(new ListValues().archiveRefusal({ name: 'Temporary site', key: 'TDSR' })).toEqual({
      code: 'BUILT_IN_KEPT',
      message:
        'Not archived: “Temporary site” comes with Open ADMS and the system acts on it. It can be renamed, never archived.',
    });
  });
});

describe('a crew day’s steps', () => {
  const stepped = { code: 'CREW-DAY-STEPS', crewTimeConversion: 'PER_DAY_STEPS' };
  const steps = [
    { fromHours: '4.75', toHours: '8.5', quantity: '0.5' },
    { fromHours: '1.5', toHours: '4.5', quantity: '0.25' },
    { fromHours: '8.75', toHours: '12', quantity: '1' },
  ];

  it('ADR-087, 355 steps that share no hour are saved, in any order, a gap between two left to the setup check', () => {
    expect(new CrewDaySteps(steps).check(stepped)).toEqual({ refusal: null, warnings: [] });
    expect(new CrewDaySteps([]).check(stepped)).toEqual({ refusal: null, warnings: [] });
  });

  it('ADR-527 (7) two steps that share an hour, both ends included, aren’t saved', () => {
    for (const shared of [
      { fromHours: '4.5', toHours: '6', quantity: '0.5' },
      { fromHours: '1.50', toHours: '2', quantity: '0.25' },
      { fromHours: '0', toHours: '1.5', quantity: '0.1' },
    ]) {
      expect(
        new CrewDaySteps([...steps, shared]).check(stepped).refusal?.code,
        shared.fromHours,
      ).toBe('CREW_DAY_STEPS_OVERLAP');
    }
    expect(
      new CrewDaySteps([
        { fromHours: '1.5', toHours: '4.5', quantity: '0.25' },
        { fromHours: '4.5', toHours: '6', quantity: '0.5' },
      ]).check(stepped).refusal?.message,
    ).toBe(
      'Not saved: two steps of pay item CREW-DAY-STEPS share hours (1.5–4.5 h and 4.5–6 h). An hour is in one step at most.',
    );
  });

  it('a step that ends before it starts isn’t saved', () => {
    expect(
      new CrewDaySteps([{ fromHours: '6', toHours: '4', quantity: '0.5' }]).check(stepped).refusal,
    ).toEqual({
      code: 'CREW_DAY_STEPS_INVALID',
      message: 'Not saved: a step of pay item CREW-DAY-STEPS ends (4 h) before it starts (6 h).',
    });
  });

  it('steps on a pay item not paid in them are kept and said to be read only once it is', () => {
    expect(
      new CrewDaySteps(steps).check({ code: 'CREW-DAY', crewTimeConversion: 'PER_DAY_EXACT' }),
    ).toEqual({
      refusal: null,
      warnings: [
        {
          code: 'CREW_DAY_STEPS_UNREAD',
          message:
            'Pay item CREW-DAY isn’t paid by the crew day in steps: its steps are kept, and read only once it is.',
        },
      ],
    });
  });
});

describe('a value added to one of the firm’s lists', () => {
  it('ADR-527 (6) states what its list asks beside its name, and nothing another list asks; a field tag is added on its project', () => {
    const lists = new ListValues();
    expect(lists.addRefusal('site-labels', [])).toBeNull();
    expect(lists.addRefusal('program-types', ['requiresRoe'])).toBeNull();
    expect(lists.addRefusal('kinds-of-work', ['countShape'])).toBeNull();
    expect(lists.addRefusal('reasons', ['uses'])).toBeNull();
    expect(lists.addRefusal('kinds-of-work', [])).toEqual({
      code: 'LIST_VALUE_SETTINGS',
      message: 'Not added: a value of this list states the shape of its count.',
    });
    expect(lists.addRefusal('site-labels', ['certifies', 'uses'])).toEqual({
      code: 'LIST_VALUE_SETTINGS',
      message: 'Not added: a value of this list takes no what it certifies, where it is offered.',
    });
    expect(lists.addRefusal('field-tags', [])?.message).toBe(
      'Not added: a field tag is added to its own project’s list.',
    );
  });
});

describe('a project closed (ADR-529 (b))', () => {
  const nothingOpen = {
    phonesNotTurnedIn: [],
    ticketsNotQcApproved: 0,
    ticketsNotInvoiced: 0,
    heldWaiting: 0,
    quarantinedWaiting: 0,
    jobsWaiting: 0,
  };

  it('says what is still open, in plain words, and never stops the close for it', () => {
    expect(new ProjectClosing(nothingOpen).items()).toEqual([]);
    const open = new ProjectClosing({
      phonesNotTurnedIn: ['P1-TWR-TDSR', 'P1-HO-TDSR'],
      ticketsNotQcApproved: 1,
      ticketsNotInvoiced: 3,
      heldWaiting: 1,
      quarantinedWaiting: 2,
      jobsWaiting: 0,
    });
    expect(open.items()).toEqual([
      {
        code: 'PHONES_NOT_TURNED_IN',
        message: '2 phones that took its work haven’t been turned in: P1-TWR-TDSR, P1-HO-TDSR.',
      },
      { code: 'TICKETS_NOT_QC_APPROVED', message: '1 ticket isn’t QC Approved.' },
      { code: 'TICKETS_NOT_INVOICED', message: '3 tickets aren’t locked as invoiced.' },
      { code: 'HELD_WAITING', message: '1 record a phone sent waits for a person.' },
      { code: 'QUARANTINED_WAITING', message: '2 quarantined records wait for a person.' },
    ]);
    expect(open.refusal('Bayline County ROW, Hurricane Delphine')).toBeNull();
    expect(new ProjectClosing({ ...nothingOpen, phonesNotTurnedIn: ['P1-COL-1'] }).items()).toEqual(
      [
        {
          code: 'PHONES_NOT_TURNED_IN',
          message: '1 phone that took its work hasn’t been turned in: P1-COL-1.',
        },
      ],
    );
  });

  it('waits only while the worker still has its tickets under way', () => {
    expect(
      new ProjectClosing({ ...nothingOpen, jobsWaiting: 1 }).refusal('Bayline County ROW'),
    ).toEqual({
      code: 'PROJECT_WORK_UNDER_WAY',
      message:
        'Not closed: the worker is still working Bayline County ROW’s tickets. Close it again in a moment.',
    });
  });

  it('is reopened only where it is closed', () => {
    expect(
      ProjectClosing.reopenRefusal({ name: 'Bayline County ROW', closedAt: new Date() }),
    ).toBeNull();
    expect(ProjectClosing.reopenRefusal({ name: 'Bayline County ROW', closedAt: null })).toEqual({
      code: 'PROJECT_NOT_CLOSED',
      message: 'Not reopened: Bayline County ROW isn’t closed.',
    });
  });
});

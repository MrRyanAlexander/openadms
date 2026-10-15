// What setup says as the firm's records are changed, archived and put back (spec/LISTS.md;
// ADR-087, 108, 194, 355, 527): a built-in value is never archived, a contractor merged into
// another is never put back, a crew day's steps never share an hour, and a merge says what still
// names the contractor it archived.
import { describe, expect, it } from 'vitest';

import { CrewDaySteps, FirmRecords, ListValues } from '../src/setup-records.ts';

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

describe('a contractor put back', () => {
  it('ADR-527 (1) one archived is put back; one merged into another never is', () => {
    expect(
      new FirmRecords().putBackRefusal({ name: 'Rivera Trucking', mergedIntoId: null }),
    ).toBeNull();
    expect(
      new FirmRecords().putBackRefusal({ name: 'Rivera Trucking Co', mergedIntoId: 'rivera' }),
    ).toEqual({
      code: 'CONTRACTOR_MERGED',
      message:
        'Not put back: Rivera Trucking Co was merged into another contractor, which is the one kept.',
    });
  });
});

describe('what a merge leaves naming the contractor it archived', () => {
  it('ADR-527 (11) each kind is said once, counted, and nothing where nothing is left', () => {
    expect(
      new FirmRecords().mergeLeftNaming('Rivera Trucking Co', 'Rivera Trucking', {
        rulePicks: 0,
        employees: 0,
        viewers: 0,
      }),
    ).toEqual([]);
    expect(
      new FirmRecords().mergeLeftNaming('Rivera Trucking Co', 'Rivera Trucking', {
        rulePicks: 2,
        employees: 1,
        viewers: 3,
      }),
    ).toEqual([
      {
        code: 'MERGE_LEFT_NAMING',
        message:
          'Merged into Rivera Trucking, but 2 rule picks still name Rivera Trucking Co: change them in the rule builder.',
      },
      {
        code: 'MERGE_LEFT_NAMING',
        message:
          'Merged into Rivera Trucking, but 1 person it employs still names Rivera Trucking Co: an admin changes their employer.',
      },
      {
        code: 'MERGE_LEFT_NAMING',
        message:
          'Merged into Rivera Trucking, but 3 contractor users still name Rivera Trucking Co: an admin changes whose user they are.',
      },
    ]);
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

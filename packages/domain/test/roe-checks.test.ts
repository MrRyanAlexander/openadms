// The checks on ROEs and surveys (spec/acceptance/06-reconciliation.md AC-06-112…116;
// spec/FLAGS.md §3.7; ADR-347). Each message is the catalogue's, word for word. The values are
// the example world's (spec/CONVENTIONS.md §6): P2, the PPDR project whose program type requires
// ROEs, with Rosa Delgado's R-0007 and Ben Whitaker's R-0008; P1 requires none.
import { describe, expect, it } from 'vitest';

import {
  RoeChecks,
  Tickets,
  type CheckedRoe,
  type CheckedSurvey,
  type FieldEventKindName,
  type FlagRaised,
  type Named,
  type RoeFieldEvent,
  type WorkflowName,
} from '../src/index.ts';

const p2 = '0199a000-0000-7000-8000-0000000000a2';

const at = (day: string, time: string): Date => new Date(`${day}T${time}:00-04:00`);
const mon = '2026-10-12';

const vegetative: Named = { id: 'entry-vegetative', name: 'Vegetative' };
const cAndD: Named = { id: 'entry-c-and-d', name: 'C&D' };
const leaners: Named = { id: 'payable-leaners', name: 'Leaners' };
const stumps: Named = { id: 'payable-stumps', name: 'Stumps' };

const roe = (roeNumber: string, more: Partial<CheckedRoe> = {}): CheckedRoe => ({
  id: `roe-${roeNumber.toLowerCase()}`,
  roeNumber,
  signed: true,
  scopeDebrisTypeIds: [],
  scopePayableTypeIds: [],
  ...more,
});
const r0007 = roe('R-0007');
const r0008 = roe('R-0008');

const workflowOf: Record<FieldEventKindName, WorkflowName> = {
  COLLECTION: 'LOAD',
  DISPOSAL: 'LOAD',
  HAUL_OUT_COLLECTION: 'HAUL_OUT',
  HAUL_OUT_DISPOSAL: 'HAUL_OUT',
  UNIT_RATE: 'UNIT_RATE',
};

let made = 0;
function recorded(
  kind: FieldEventKindName,
  written: string,
  more: Partial<RoeFieldEvent> = {},
): RoeFieldEvent {
  const [ticketNumber = '', splitSuffix = ''] = written.split('-');
  const end = at(mon, '09:40');
  made += 1;
  return {
    id: `0199f000-0000-7000-8000-${String(made).padStart(12, '0')}`,
    projectId: p2,
    workflow: workflowOf[kind],
    kind,
    ticketNumber,
    splitSuffix,
    startedAt: new Date(end.getTime() - 30 * 60_000),
    endedAt: end,
    roeNumber: null,
    roe: null,
    debrisType: kind === 'UNIT_RATE' ? null : vegetative,
    payableType: kind === 'UNIT_RATE' ? leaners : null,
    ...more,
  };
}
const on = (found: CheckedRoe): Partial<RoeFieldEvent> => ({
  roeNumber: found.roeNumber,
  roe: found,
});
const collection = (written: string, more: Partial<RoeFieldEvent> = {}) =>
  recorded('COLLECTION', written, more);
const unitRate = (written: string, more: Partial<RoeFieldEvent> = {}) =>
  recorded('UNIT_RATE', written, more);

const checks = (requiresRoe: boolean) =>
  new RoeChecks({ timeZone: 'America/New_York', requiresRoe });
function flagsOf(events: readonly RoeFieldEvent[], requiresRoe = true): readonly FlagRaised[] {
  const [ticket] = new Tickets(events).tickets;
  if (ticket === undefined) throw new Error('No ticket.');
  return checks(requiresRoe).of(ticket);
}
const messagesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.message);
const codesOf = (flags: readonly FlagRaised[]): string[] => flags.map((flag) => flag.code);

const survey = (
  id: string,
  workTypeKey: CheckedSurvey['workTypeKey'],
  named: CheckedRoe | null,
): CheckedSurvey => ({
  id,
  workTypeKey,
  roeNumber: named?.roeNumber ?? null,
  roe: named,
});

describe('a ticket’s ROE, on a project that requires ROEs', () => {
  it('AC-06-112 a collection on P2 with no ROE is flagged and still bills; a unit rate ticket the same', () => {
    const col = collection('102002');
    const flags = flagsOf([col]);

    expect(messagesOf(flags)).toEqual(['Ticket 102002: no ROE. Flagged for review.']);
    expect(flags[0]).toMatchObject({
      code: 'ROE_MISSING',
      billing: 'BILLS',
      fieldEventId: col.id,
      facts: { requiresRoe: true },
    });
    expect(messagesOf(flagsOf([unitRate('302002')]))).toEqual([
      'Ticket 302002: no ROE. Flagged for review.',
    ]);
    expect(codesOf(flagsOf([collection('102002', { roeNumber: '  ' })]))).toEqual(['ROE_MISSING']);
  });

  it('AC-06-112 on P1, which requires no ROE, nothing is flagged; nor on P2’s work that carries a signed ROE', () => {
    expect(flagsOf([collection('101001')], false)).toEqual([]);
    expect(flagsOf([collection('101001', { roeNumber: 'R-0099' })], false)).toEqual([]);
    expect(flagsOf([collection('102001', on(r0007))])).toEqual([]);
  });

  it('AC-06-112 a load’s disposal and a haul-out carry no ROE: only the collection is read, each property’s own on a split', () => {
    const a = collection('102001-A', on(r0007));
    const b = collection('102001-B');
    const flags = flagsOf([a, b, recorded('DISPOSAL', '102001')]);

    expect(messagesOf(flags)).toEqual(['Ticket 102001: no ROE. Flagged for review.']);
    expect(flags[0]?.fieldEventId).toBe(b.id);
    expect(
      flagsOf([recorded('HAUL_OUT_COLLECTION', '202001'), recorded('HAUL_OUT_DISPOSAL', '202001')]),
    ).toEqual([]);
  });

  it('AC-06-113 a collection naming R-0099, which P2 doesn’t have, is flagged and still bills', () => {
    const flags = flagsOf([collection('102003', { roeNumber: 'R-0099' })]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 102003: ROE R-0099 is not on this project. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ROE_NOT_ON_PROJECT',
      billing: 'BILLS',
      facts: { roeNumber: 'R-0099' },
    });
  });

  it('AC-06-114 a collection on R-0008 while it isn’t signed is flagged and still bills; a signed date alone signs nothing', () => {
    const flags = flagsOf([collection('102004', on({ ...r0008, signed: false }))]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 102004: ROE R-0008 is not signed. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ROE_UNSIGNED',
      billing: 'BILLS',
      facts: { roeId: 'roe-r-0008', signed: false },
    });
  });

  it('AC-06-115 R-0008’s scope is C&D only and the collection is Vegetative: flagged, and it still bills', () => {
    const cAndDOnly = { ...r0008, scopeDebrisTypeIds: [cAndD.id] };
    const col = collection('102005', on(cAndDOnly));
    const flags = flagsOf([col]);

    expect(messagesOf(flags)).toEqual([
      'Ticket 102005: outside the scope of ROE R-0008. Flagged for review.',
    ]);
    expect(flags[0]).toMatchObject({
      code: 'ROE_OUT_OF_SCOPE',
      billing: 'BILLS',
      fieldEventId: col.id,
      facts: { roeId: 'roe-r-0008', scope: ['entry-c-and-d'], work: 'entry-vegetative' },
    });
    expect(flagsOf([collection('102005', { ...on(cAndDOnly), debrisType: cAndD })])).toEqual([]);
  });

  it('AC-06-115 a unit rate ticket is read by its payable type; an ROE scoped only to debris types doesn’t cover it', () => {
    const stumpsOnly = { ...r0008, scopePayableTypeIds: [stumps.id] };

    expect(codesOf(flagsOf([unitRate('302005', on(stumpsOnly))]))).toEqual(['ROE_OUT_OF_SCOPE']);
    expect(flagsOf([unitRate('302005', { ...on(stumpsOnly), payableType: stumps })])).toEqual([]);
    expect(
      codesOf(flagsOf([unitRate('302005', on({ ...r0008, scopeDebrisTypeIds: [cAndD.id] }))])),
    ).toEqual(['ROE_OUT_OF_SCOPE']);
  });

  it('AC-06-115 an ROE with no scope picked is never flagged for scope; unsigned and out of scope are each said', () => {
    expect(flagsOf([collection('102005', on(r0008))])).toEqual([]);
    expect(
      codesOf(
        flagsOf([
          collection('102005', on({ ...r0008, signed: false, scopeDebrisTypeIds: [cAndD.id] })),
        ]),
      ),
    ).toEqual(['ROE_UNSIGNED', 'ROE_OUT_OF_SCOPE']);
  });
});

describe('a survey', () => {
  it('AC-06-116 a post-work survey on R-0008 with no pre-work survey on that ROE is flagged, on the survey', () => {
    const post = survey('survey-post', 'POST_WORK', r0008);
    const flags = checks(true).survey(post, [post, survey('survey-pre-7', 'PRE_WORK', r0007)]);

    expect(messagesOf(flags)).toEqual(['Survey on ROE R-0008: no pre-work survey.']);
    expect(flags[0]).toMatchObject({
      code: 'NO_PRE_WORK_SURVEY',
      subject: { surveyOnRoe: 'R-0008' },
      fieldEventId: null,
      facts: { roeNumber: 'R-0008' },
    });
  });

  it('AC-06-116 with its pre-work survey on the same ROE number it isn’t flagged; a pre-work survey needs none before it', () => {
    const post = survey('survey-post', 'POST_WORK', r0008);
    const pre = survey('survey-pre', 'PRE_WORK', r0008);

    expect(checks(true).survey(post, [pre, post])).toEqual([]);
    expect(checks(true).survey(pre, [pre])).toEqual([]);
    // The link is the ROE number, on a project that requires none too.
    expect(codesOf(checks(false).survey(post, [post]))).toEqual(['NO_PRE_WORK_SURVEY']);
  });

  it('AC-06-112 a survey on P2 with no ROE, an ROE P2 doesn’t have, or an unsigned one is flagged the same way, on the survey', () => {
    const none = survey('survey-none', 'PRE_WORK', null);
    const unknown: CheckedSurvey = { ...none, id: 'survey-unknown', roeNumber: 'R-0099' };
    const unsigned = survey('survey-unsigned', 'PRE_WORK', { ...r0008, signed: false });

    expect(messagesOf(checks(true).survey(none, []))).toEqual([
      'Survey: no ROE. Flagged for review.',
    ]);
    expect(messagesOf(checks(true).survey(unknown, []))).toEqual([
      'Survey on ROE R-0099: ROE R-0099 is not on this project. Flagged for review.',
    ]);
    expect(messagesOf(checks(true).survey(unsigned, []))).toEqual([
      'Survey on ROE R-0008: ROE R-0008 is not signed. Flagged for review.',
    ]);
    expect(checks(false).survey(none, [])).toEqual([]);
  });
});

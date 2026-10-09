// The answers to a form's own fields, checked against the version of the definition answered
// (spec/acceptance/04-field-capture.md AC-04-87; ADR-160, 278, 327; C36). The values are P1's
// incident form's "Police report number" and Jo Kim's incident of Tuesday 11:50.
import { describe, expect, it } from 'vitest';

import { formAnswersSchema, formDefinitionFields } from '../src/index.ts';

const policeReport = {
  id: 'police-report-number',
  label: 'Police report number',
  type: 'TEXT',
  required: false,
};
// The form's first version, and a second that adds a required pick and three more fields.
const versionOne = formDefinitionFields.parse([policeReport]);
const versionTwo = formDefinitionFields.parse([
  policeReport,
  { id: 'damage', label: 'Damage', type: 'PICK', required: true, choices: ['Mailbox', 'Fence'] },
  { id: 'estimate', label: 'Repair estimate', type: 'NUMBER', required: false },
  { id: 'owner-told', label: 'Owner told', type: 'YES_NO', required: false },
  { id: 'close-up', label: 'Close-up', type: 'PHOTO', required: false },
]);

const taken = (fields: typeof versionOne, answers: unknown): boolean =>
  formAnswersSchema(fields).safeParse(answers).success;

describe('the answers to a form’s own fields', () => {
  it('AC-04-87 an answer is kept under its field; a field the definition doesn’t have and text where a number is asked are refused', () => {
    const answers = { 'police-report-number': 'BCSO-26-104417' };
    expect(formAnswersSchema(versionOne).parse(answers)).toEqual(answers);
    expect(taken(versionOne, {})).toBe(true);
    expect(taken(versionOne, { 'insurance-claim': 'C-1' })).toBe(false);
    expect(taken(versionOne, { 'police-report-number': '' })).toBe(false);
    expect(taken(versionTwo, { damage: 'Mailbox', estimate: 'about forty dollars' })).toBe(false);
    expect(taken(versionTwo, { damage: 'Mailbox', estimate: 40 })).toBe(true);
  });

  it('AC-04-87 a later version changes nothing on an incident already made: its answers are read against the version they answered', () => {
    const answers = { 'police-report-number': 'BCSO-26-104417' };
    expect(taken(versionOne, answers)).toBe(true);
    // The same answers against the second version lack its required field.
    expect(taken(versionTwo, answers)).toBe(false);
  });

  it('takes each type of field as its own kind of answer, and requires only what the definition does', () => {
    expect(
      taken(versionTwo, {
        'police-report-number': 'BCSO-26-104417',
        damage: 'Fence',
        estimate: 40.5,
        'owner-told': true,
        'close-up': '019a0000-0000-7000-8000-000000000042',
      }),
    ).toBe(true);
    expect(taken(versionTwo, { damage: 'Gate' })).toBe(false);
    expect(taken(versionTwo, { damage: 'Fence', 'owner-told': 'yes' })).toBe(false);
    expect(taken(versionTwo, { damage: 'Fence', 'close-up': 'photographs/example-1' })).toBe(false);
    expect(taken(versionTwo, {})).toBe(false);
    expect(taken(versionTwo, ['Fence'])).toBe(false);
  });

  it('a form with no fields of the firm’s own takes no answers', () => {
    expect(taken([], {})).toBe(true);
    expect(taken([], { anything: 1 })).toBe(false);
  });
});

// A version of a form's added fields, as its `fields` hold it (spec/acceptance/01-setup.md AC-01-29;
// ADR-160, 278, 308; C36). The database holds that it is a list; each field's shape is held here.
import { describe, expect, it } from 'vitest';

import { formDefinitionFields } from '../src/index.ts';

const policeReport = {
  id: 'police-report-number',
  label: 'Police report number',
  type: 'TEXT',
  required: false,
};

describe('a form definition’s fields', () => {
  it('AC-01-29 "Police report number", then a second field: each version a list of fields, each with its id, label, type and whether it’s required', () => {
    expect(formDefinitionFields.parse([policeReport])).toEqual([policeReport]);
    const second = [
      policeReport,
      {
        id: 'damage',
        label: 'Damage',
        type: 'PICK',
        required: true,
        choices: ['Mailbox', 'Fence'],
      },
    ];
    expect(formDefinitionFields.parse(second)).toEqual(second);
  });

  it('takes the five field types and no other', () => {
    for (const type of ['TEXT', 'NUMBER', 'YES_NO', 'PHOTO']) {
      expect(formDefinitionFields.safeParse([{ ...policeReport, type }]).success, type).toBe(true);
    }
    expect(formDefinitionFields.safeParse([{ ...policeReport, type: 'DATE' }]).success).toBe(false);
  });

  it('a pick lists its choices, and no other field has any', () => {
    const pick = { ...policeReport, type: 'PICK' };
    expect(formDefinitionFields.safeParse([pick]).success).toBe(false);
    expect(formDefinitionFields.safeParse([{ ...pick, choices: [] }]).success).toBe(false);
    expect(formDefinitionFields.safeParse([{ ...policeReport, choices: ['A'] }]).success).toBe(
      false,
    );
  });

  it('refuses a field id used twice, an empty label, and anything it doesn’t know', () => {
    expect(formDefinitionFields.safeParse([policeReport, policeReport]).success).toBe(false);
    expect(formDefinitionFields.safeParse([{ ...policeReport, label: '' }]).success).toBe(false);
    expect(formDefinitionFields.safeParse([{ ...policeReport, hint: 'x' }]).success).toBe(false);
    expect(formDefinitionFields.safeParse(policeReport).success).toBe(false);
  });
});

// The debris types on a form, at the domain (spec/acceptance/01-setup.md AC-01-25, AC-01-26;
// ADR-214, 308). The entries are P1's as the golden mission §1 sets them up; what the phone does
// with its list is Phase 3's, and the list reaching it Phase 2's.
import { describe, expect, it } from 'vitest';

import { DebrisTypeEntries, type DebrisTypeEntry } from '../src/index.ts';

const entry = (id: string, name: string, more: Partial<DebrisTypeEntry> = {}): DebrisTypeEntry => ({
  id,
  name,
  reduced: false,
  hiddenOnPhones: false,
  archived: false,
  ...more,
});

const vegetative = entry('e1', 'Vegetative');
const cd = entry('e2', 'C&D');
const mulch = entry('e3', 'Mulch', { reduced: true });

describe('what a phone’s list offers', () => {
  it('AC-01-26 C&D hidden on phones on P1’s load form: the list is Vegetative alone', () => {
    const loadForm = new DebrisTypeEntries('LOAD', [vegetative, { ...cd, hiddenOnPhones: true }]);
    expect(loadForm.onPhones().map((offered) => offered.name)).toEqual(['Vegetative']);
  });

  it('AC-01-26 a field event that already carries C&D keeps it', () => {
    const loadForm = new DebrisTypeEntries('LOAD', [vegetative, { ...cd, hiddenOnPhones: true }]);
    expect(loadForm.carried('e2')).toEqual({ ...cd, hiddenOnPhones: true });
  });

  it('AC-01-27 an entry taken off the form is off the phones’ list, and kept for the field events that carry it', () => {
    const loadForm = new DebrisTypeEntries('LOAD', [vegetative, { ...cd, archived: true }]);
    expect(loadForm.onPhones()).toEqual([vegetative]);
    expect(loadForm.carried('e2')?.name).toBe('C&D');
  });

  it('every entry still on the form and not hidden is offered, in setup’s order', () => {
    expect(new DebrisTypeEntries('LOAD', [vegetative, cd]).onPhones()).toEqual([vegetative, cd]);
    expect(new DebrisTypeEntries('HAUL_OUT', []).onPhones()).toEqual([]);
  });
});

describe('the warning when a debris type is added', () => {
  it('AC-01-25 C&D, not marked Reduced, on the haul-out form: saved, with a warning', () => {
    const haulOutForm = new DebrisTypeEntries('HAUL_OUT', [mulch]);
    expect(haulOutForm.warningsFor(cd)).toEqual([
      {
        code: 'UNREDUCED_ON_HAUL_OUT',
        message:
          "C&D isn't marked Reduced. Haul-outs usually carry reduced debris; saved as it is.",
      },
    ]);
  });

  it('AC-01-25 no warning for Mulch, marked Reduced, nor for anything on the load form', () => {
    expect(new DebrisTypeEntries('HAUL_OUT', []).warningsFor(mulch)).toEqual([]);
    expect(new DebrisTypeEntries('LOAD', []).warningsFor(cd)).toEqual([]);
    expect(new DebrisTypeEntries('LOAD', []).warningsFor(mulch)).toEqual([]);
  });
});

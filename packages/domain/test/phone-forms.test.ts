// What a phone offers on a survey (BACKLOG 3.5.4, C118; spec/acceptance/11-field-app.md AC-11-85;
// ADR-150, 584).
import { describe, expect, it } from 'vitest';

import { PhoneSurveys } from '../src/index.ts';

const roe = (roeNumber: string, preWorkSurveyDone: boolean) => ({
  roeNumber,
  address: `${roeNumber} Cedar Ct`,
  preWorkSurveyDone,
});

describe('what a phone offers on a survey', () => {
  it('AC-11-85 a post-work survey picks from the ROEs whose pre-work survey the server has, in the lists’ order, each as the lists hold it', () => {
    const r0007 = roe('R-0007', true);
    const r0008 = roe('R-0008', false);
    const r0009 = roe('R-0009', true);
    expect(new PhoneSurveys([r0007, r0008, r0009]).postWork([])).toEqual([r0007, r0009]);
  });

  it('AC-11-85 and those whose pre-work survey this phone made and the server hasn’t told it of yet, found by the number as written, trimmed, as the server finds it', () => {
    const r0007 = roe('R-0007', false);
    const r0008 = roe('R-0008', false);
    expect(new PhoneSurveys([r0007, r0008]).postWork([' R-0008 ', null, ''])).toEqual([r0008]);
    // A different number is a different ROE: nothing reads one apart (ADR-323).
    expect(new PhoneSurveys([r0007]).postWork(['R-007', 'r-0007'])).toEqual([]);
  });

  it('AC-11-85 with no pre-work survey anywhere it offers none: the ROE is typed, and the server flags it', () => {
    expect(new PhoneSurveys([roe('R-0007', false)]).postWork([])).toEqual([]);
  });
});

// What a phone offers on a survey (adms-ticket-workflows §4.6; adms-field-app §4A.6; BACKLOG
// 3.5.4, C118; ADR-150, 584): one rule, so the field app holds none.
//
// **A post-work survey picks from the ROEs whose pre-work survey is done** (ADR-150): those the
// phone's lists say the server has one for, and those whose pre-work survey this phone made and
// hasn't heard of yet, found by the ROE number as `RoeChecks` finds it (as written, trimmed). It
// is an offer, never a refusal: an ROE typed by its number is taken, and one with no pre-work
// survey is the server's to flag (`NO_PRE_WORK_SURVEY`).
import { roeNumberNamed } from './roe-checks.ts';

export interface OfferedRoe {
  readonly roeNumber: string;
  readonly preWorkSurveyDone: boolean;
}

export class PhoneSurveys<Roe extends OfferedRoe> {
  private readonly roes: readonly Roe[];

  // The ROEs the phone offers, in the lists' order.
  constructor(roes: readonly Roe[]) {
    this.roes = roes;
  }

  // Those a post-work survey offers: `surveyedHere`, the ROE numbers of the pre-work surveys this
  // phone made.
  postWork(surveyedHere: readonly (string | null)[]): Roe[] {
    const here = new Set(surveyedHere.map(roeNumberNamed).filter((one) => one !== null));
    return this.roes.filter(
      (roe) => roe.preWorkSurveyDone || here.has(roeNumberNamed(roe.roeNumber) ?? ''),
    );
  }
}

// What an incident may name besides its type: the contractor involved, a certification by its
// cert number, an ROE by its number, each optional (spec/DATA-MODEL.md §3 "Form", §4.3;
// spec/acceptance/01-setup.md AC-01-83; ADR-328, 334). The project's incident form says which of
// them its monitors are offered; the firm changes the list at any time. What isn't offered isn't
// shown on a phone, and is never refused on a record: the back office may name any of the three.
import type { ProgramTypeSetting } from './project-settings.ts';

// The three, in the order a phone shows them. A closed set: each is a column of the record.
export const incidentOffers = ['CONTRACTOR', 'CERT_NUMBER', 'ROE_NUMBER'] as const;
export type IncidentOffer = (typeof incidentOffers)[number];

export class IncidentOffers {
  private readonly offered: readonly IncidentOffer[];

  constructor(offered: readonly IncidentOffer[]) {
    this.offered = offered;
  }

  // What a new incident form on a project of this program type starts with, before the firm
  // changes it: the contractor and a cert number everywhere, an ROE number where the program
  // type requires ROEs (ADR-334, agent default).
  static startingFor(programType: ProgramTypeSetting): IncidentOffers {
    return new IncidentOffers(
      incidentOffers.filter((offer) => offer !== 'ROE_NUMBER' || programType.requiresRoe),
    );
  }

  // Whether a monitor on the project is offered it.
  offers(offer: IncidentOffer): boolean {
    return this.offered.includes(offer);
  }

  // The list as the form keeps it: each once, in the phone's order.
  list(): IncidentOffer[] {
    return incidentOffers.filter((offer) => this.offered.includes(offer));
  }
}

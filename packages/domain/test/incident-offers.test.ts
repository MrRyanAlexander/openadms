// What an incident offers a project's monitors (spec/acceptance/01-setup.md AC-01-83;
// spec/acceptance/04-field-capture.md AC-04-101; ADR-328, 334).
import { describe, expect, it } from 'vitest';

import { IncidentOffers, incidentOffers } from '../src/index.ts';

// The program types of the example world: PPDR requires an ROE, ROW doesn't.
const row = { requiresRoe: false };
const ppdr = { requiresRoe: true };

describe('what an incident offers', () => {
  it('AC-01-83 is three things and no other: the contractor involved, a cert number, an ROE number', () => {
    expect(incidentOffers).toEqual(['CONTRACTOR', 'CERT_NUMBER', 'ROE_NUMBER']);
  });

  it('AC-01-83 a new incident form starts with the contractor and a cert number, and an ROE number where the program type requires ROEs', () => {
    expect(IncidentOffers.startingFor(row).list()).toEqual(['CONTRACTOR', 'CERT_NUMBER']);
    expect(IncidentOffers.startingFor(ppdr).list()).toEqual([
      'CONTRACTOR',
      'CERT_NUMBER',
      'ROE_NUMBER',
    ]);
  });

  it('AC-01-83 the firm’s list is kept each once, in the phone’s order; it may be empty', () => {
    expect(new IncidentOffers(['ROE_NUMBER', 'CONTRACTOR', 'ROE_NUMBER']).list()).toEqual([
      'CONTRACTOR',
      'ROE_NUMBER',
    ]);
    expect(new IncidentOffers([]).list()).toEqual([]);
  });

  it('AC-04-101 a monitor is offered only what the project’s incident form lists', () => {
    const p1 = new IncidentOffers(['CONTRACTOR', 'CERT_NUMBER']);
    expect(incidentOffers.map((offer) => p1.offers(offer))).toEqual([true, true, false]);
    expect(incidentOffers.map((offer) => new IncidentOffers([]).offers(offer))).toEqual([
      false,
      false,
      false,
    ]);
  });
});

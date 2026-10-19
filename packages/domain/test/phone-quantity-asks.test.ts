// What a phone at a site asks a load or a haul-out for, from the lookup it holds (adms-field-app
// §4A.4; adms-scale-receipts, "One quantity, never both"; spec/acceptance/04-field-capture.md
// AC-04-38; spec/acceptance/11-field-app.md AC-11-40, 41; ADR-013, 223, 227, 243, 582; C83,
// C182). The rows are Cypress Creek Landfill's as the story `p1-left-out` works them out for a
// phone there (spec/CONVENTIONS.md §6): Vegetative to FDS weighed for Coastline, White Goods
// counted from the tickets the load carries, Vegetative called; Mulch hauled out there weighed.
import { describe, expect, it } from 'vitest';

import { PhoneQuantityAsks, type HeldQuantityAsk } from '../src/index.ts';

const coastline = 'contractor-coastline';
const summit = 'contractor-summit';
const toFds = 'entry-vegetative-to-fds';
const whiteGoods = 'entry-white-goods';
const vegetative = 'entry-vegetative';
const mulch = 'entry-mulch';

const atCypress: HeldQuantityAsk[] = [
  { form: 'LOAD', debrisTypeId: toFds, primeId: coastline, asks: 'SCALE_WEIGHT' },
  { form: 'LOAD', debrisTypeId: toFds, primeId: summit, asks: 'LOAD_CALL' },
  { form: 'LOAD', debrisTypeId: whiteGoods, primeId: coastline, asks: 'CARRIED_COUNT' },
  { form: 'LOAD', debrisTypeId: whiteGoods, primeId: summit, asks: 'CARRIED_COUNT' },
  { form: 'LOAD', debrisTypeId: vegetative, primeId: coastline, asks: 'LOAD_CALL' },
  { form: 'LOAD', debrisTypeId: vegetative, primeId: summit, asks: 'LOAD_CALL' },
  { form: 'HAUL_OUT', debrisTypeId: mulch, primeId: coastline, asks: 'SCALE_WEIGHT' },
  { form: 'HAUL_OUT', debrisTypeId: mulch, primeId: summit, asks: 'SCALE_WEIGHT' },
];
const phone = new PhoneQuantityAsks(atCypress);

describe('what a phone at a site asks a load or a haul-out for', () => {
  it('AC-04-38 a Coastline truck of Vegetative to FDS, paid by weight there: the scale weight, never a load call; a Summit truck, whose contract has no such rule, the load call', () => {
    expect(phone.at('DISPOSAL', toFds, coastline)).toEqual({
      asks: 'SCALE_WEIGHT',
      from: 'LOOKUP',
    });
    expect(phone.at('DISPOSAL', toFds, summit)).toEqual({ asks: 'LOAD_CALL', from: 'LOOKUP' });
    expect(phone.at('DISPOSAL', vegetative, coastline).asks).toBe('LOAD_CALL');
  });

  it('AC-11-41, C83 a load of white goods paid from the tickets it carries: the count of them, never a load call', () => {
    expect(phone.at('DISPOSAL', whiteGoods, coastline)).toEqual({
      asks: 'CARRIED_COUNT',
      from: 'LOOKUP',
    });
  });

  it('REQ-305 a haul-out always takes its load call at the loading end; its disposal the weight where its site says it is weighed', () => {
    expect(phone.at('HAUL_OUT_COLLECTION', mulch, coastline)).toEqual({
      asks: 'LOAD_CALL',
      from: 'LOOKUP',
    });
    expect(phone.at('HAUL_OUT_DISPOSAL', mulch, coastline).asks).toBe('SCALE_WEIGHT');
  });

  it('REQ-317 a truck whose prime the phone doesn’t know: every prime’s row where they agree, else as where nothing is held', () => {
    expect(phone.at('DISPOSAL', whiteGoods, null)).toEqual({
      asks: 'CARRIED_COUNT',
      from: 'EVERY_PRIME',
    });
    expect(phone.at('HAUL_OUT_DISPOSAL', mulch, null)).toEqual({
      asks: 'SCALE_WEIGHT',
      from: 'EVERY_PRIME',
    });
    expect(phone.at('DISPOSAL', toFds, null)).toEqual({ asks: 'LOAD_CALL', from: 'NOT_HELD' });
  });

  it('C182 a phone holding no row for the site: the load call for a load, nothing more for a haul-out’s disposal, said as not held', () => {
    const elsewhere = new PhoneQuantityAsks([]);
    expect(elsewhere.at('DISPOSAL', toFds, coastline)).toEqual({
      asks: 'LOAD_CALL',
      from: 'NOT_HELD',
    });
    expect(elsewhere.at('HAUL_OUT_DISPOSAL', mulch, coastline)).toEqual({
      asks: 'NOTHING_MORE',
      from: 'NOT_HELD',
    });
    expect(elsewhere.at('HAUL_OUT_COLLECTION', mulch, coastline).asks).toBe('LOAD_CALL');
    expect(phone.at('DISPOSAL', null, coastline).from).toBe('NOT_HELD');
    expect(phone.at('DISPOSAL', 'entry-ash', coastline).from).toBe('NOT_HELD');
    // A known prime with no row of its own is never answered from another prime's row: rules
    // follow the truck's prime (ADR-239).
    const coastlineOnly = new PhoneQuantityAsks(
      atCypress.filter((row) => row.primeId === coastline),
    );
    expect(coastlineOnly.at('DISPOSAL', toFds, summit)).toEqual({
      asks: 'LOAD_CALL',
      from: 'NOT_HELD',
    });
  });

  it('AC-04-38, AC-11-41 one quantity, never both: the one asked and no other; the scale receipt offered beside a load call or nothing more', () => {
    const none = { loadCall: null, carriedCount: null, scaleReceiptId: null };
    expect(PhoneQuantityAsks.gives('SCALE_WEIGHT', { ...none, scaleReceiptId: 'receipt' })).toBe(
      true,
    );
    expect(
      PhoneQuantityAsks.gives('SCALE_WEIGHT', { ...none, loadCall: 80, scaleReceiptId: 'r' }),
    ).toBe(false);
    expect(PhoneQuantityAsks.gives('CARRIED_COUNT', { ...none, carriedCount: 1 })).toBe(true);
    expect(PhoneQuantityAsks.gives('CARRIED_COUNT', { ...none, loadCall: 50 })).toBe(false);
    expect(
      PhoneQuantityAsks.gives('CARRIED_COUNT', { ...none, carriedCount: 1, scaleReceiptId: 'r' }),
    ).toBe(false);
    expect(
      PhoneQuantityAsks.gives('LOAD_CALL', { ...none, loadCall: 0, scaleReceiptId: 'r' }),
    ).toBe(true);
    expect(PhoneQuantityAsks.gives('LOAD_CALL', { ...none, loadCall: 50, carriedCount: 1 })).toBe(
      false,
    );
    expect(PhoneQuantityAsks.gives('NOTHING_MORE', { ...none, scaleReceiptId: 'r' })).toBe(true);
    expect(PhoneQuantityAsks.gives('NOTHING_MORE', { ...none, loadCall: 90 })).toBe(false);
  });
});

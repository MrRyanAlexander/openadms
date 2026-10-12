// An address as the address server gives it (ARCHITECTURE §3; AC-04-24; ADR-111, 119, 455):
// street number and name, read from another program's answer and from nothing else in it.
import { describe, expect, it } from 'vitest';

import { lookedUpAddress, lookedUpAddressLongest } from '../src/addresses.ts';

describe('an address looked up for a GPS point', () => {
  it('is the street number and name, or the name alone where the map has no number', () => {
    expect(
      lookedUpAddress({
        address: { house_number: '25', road: 'The Green', city: 'Dover', postcode: '19901' },
        display_name: '25, The Green, Dover, Kent County, Delaware, 19901, United States',
      }),
    ).toBe('25 The Green');
    expect(lookedUpAddress({ address: { road: 'Wyoming Mill Road' } })).toBe('Wyoming Mill Road');
    expect(lookedUpAddress({ address: { house_number: ' 14 ', road: ' Heron St ' } })).toBe(
      '14 Heron St',
    );
  });

  it('is none where the address server knows no street there', () => {
    expect(lookedUpAddress({ error: 'Unable to geocode' })).toBeNull();
    expect(lookedUpAddress({ address: { city: 'Dover' } })).toBeNull();
    expect(lookedUpAddress({ address: { house_number: '25' } })).toBeNull();
    expect(lookedUpAddress({ address: { road: '  ' } })).toBeNull();
  });

  it('is none where what was answered is no address: never a guess from the rest of it', () => {
    for (const answer of [
      null,
      undefined,
      'The Green',
      25,
      [],
      { address: null },
      { address: 'The Green' },
      { address: { road: 25 } },
      { address: { road: { name: 'The Green' } } },
      { address: { road: ['The Green'] } },
      { display_name: '25, The Green, Dover' },
    ]) {
      expect(lookedUpAddress(answer), JSON.stringify(answer)).toBeNull();
    }
  });

  it('takes one line of plain text: a street’s name with a control character is no address, and a house number with one is left out', () => {
    for (const road of ['The Green\nDROP', 'The\tGreen', 'The Green\u0000', 'The\u2028Green']) {
      expect(lookedUpAddress({ address: { road } }), JSON.stringify(road)).toBeNull();
    }
    expect(lookedUpAddress({ address: { house_number: '2\n5', road: 'The Green' } })).toBe(
      'The Green',
    );
    expect(lookedUpAddress({ address: { house_number: 25, road: 'The Green' } })).toBe('The Green');
  });

  it('takes nothing longer than an address is', () => {
    const number = '25';
    const longest = 'a'.repeat(lookedUpAddressLongest - number.length - 1);
    expect(lookedUpAddress({ address: { house_number: number, road: longest } })).toHaveLength(
      lookedUpAddressLongest,
    );
    expect(lookedUpAddress({ address: { house_number: number, road: `${longest}a` } })).toBeNull();
  });
});

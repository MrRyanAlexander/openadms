// What is kept of a mileage (spec/acceptance/06-reconciliation.md AC-06-53…56; spec/FLAGS.md
// `NO_ROAD_ROUTE`; ADR-349). The places are the example world's as they stand on the pinned map
// extract (spec/CONVENTIONS.md §6): 14 Heron St, whose nearest road point is 6.2050 road miles
// from Marsh Road TDSR's own GPS. The asking itself is the worker's
// (`apps/worker/test/mileages.test.ts`).
import { describe, expect, it } from 'vitest';

import { Distance, Flags, Mileage, type GpsPoint, type MapData } from '../src/index.ts';

const point = (latitude: string, longitude: string): GpsPoint => ({ latitude, longitude });

const heronSt = point('39.13850000', '-75.55370000');
const marshRoad = point('39.09000000', '-75.62000000');
const landfill = point('39.00000000', '-75.58000000');
const mapData: MapData = {
  date: '2026-01-01',
  sha256: '08c07f96ad5863a267cb09c0921d9b6dd6904d8b2fe0704f67ec866af11d1888',
};
const roadPoint = {
  point: point('39.13844300', '-75.55388800'),
  address: 'Wyoming Mill Road',
};
const ends = { from: heronSt, to: marshRoad };
const flags = new Flags('America/New_York');

describe('a mileage by road', () => {
  it('AC-06-53 is kept as the routing server gave it, unrounded, with the road point routed from, its address and the map data’s date and hash', () => {
    expect(new Mileage(ends, mapData).byRoad(roadPoint, 6.205)).toEqual({
      miles: '6.2050',
      source: 'ROAD_ROUTE',
      ends,
      snapped: roadPoint.point,
      snappedAddress: 'Wyoming Mill Road',
      mapData,
    });
  });

  it('AC-06-53 is never rounded to the tenths a rule compares in', () => {
    const mileage = new Mileage(ends, mapData);
    expect(mileage.byRoad(roadPoint, 10.04).miles).toBe('10.0400');
    expect(mileage.byRoad(roadPoint, 10.05).miles).toBe('10.0500');
    expect(mileage.byRoad(roadPoint, 0).miles).toBe('0.0000');
  });

  it('keeps a road point the address server knows no street for', () => {
    const measured = new Mileage(ends, mapData).byRoad({ ...roadPoint, address: null }, 6.205);
    expect(measured.snapped).toEqual(roadPoint.point);
    expect(measured.snappedAddress).toBeNull();
  });

  it('raises no flag', () => {
    const measured = new Mileage(ends, mapData).byRoad(roadPoint, 6.205);
    expect(
      Mileage.noRoadRoute(flags, { ticketNumber: '101001' }, 'collection-1', measured),
    ).toBeNull();
  });

  it('is not a length below nought, or no number', () => {
    const mileage = new Mileage(ends, mapData);
    expect(() => mileage.byRoad(roadPoint, -0.1)).toThrow();
    expect(() => mileage.byRoad(roadPoint, Number.NaN)).toThrow();
  });
});

describe('no road route', () => {
  it('AC-06-55 the mileage is the straight line between the collection’s end GPS and the site’s own GPS, marked as such', () => {
    const measured = new Mileage(ends, mapData).straightLine(null);
    const meters = new Distance(heronSt, marshRoad).meters();

    expect(measured).toEqual({
      miles: (meters / 1609.344).toFixed(4),
      source: 'STRAIGHT_LINE',
      ends,
      snapped: null,
      snappedAddress: null,
      mapData,
    });
    // The geodesic, shorter than the 6.2050 miles by road.
    expect(measured.miles).toBe('4.8876');
  });

  it('AC-06-55 is measured from the GPS itself, and keeps the road point where one was found', () => {
    const mileage = new Mileage(ends, mapData);
    const measured = mileage.straightLine(roadPoint);

    expect(measured.miles).toBe(mileage.straightLine(null).miles);
    expect(measured.snapped).toEqual(roadPoint.point);
    expect(measured.snappedAddress).toBe('Wyoming Mill Road');
  });

  it('AC-06-55 the ticket is flagged in the catalogue’s words and still bills; the flag keeps both points and the map data’s date', () => {
    const measured = new Mileage(ends, mapData).straightLine(null);
    const flag = Mileage.noRoadRoute(flags, { ticketNumber: '101026' }, 'collection-1', measured);

    expect(flag).toMatchObject({
      code: 'NO_ROAD_ROUTE',
      message:
        'Ticket 101026: no road route found; straight-line distance used. Flagged for review.',
      billing: 'BILLS',
      fieldEventId: 'collection-1',
      facts: {
        from: { latitude: '39.13850000', longitude: '-75.55370000' },
        to: { latitude: '39.09000000', longitude: '-75.62000000' },
        mapDataDate: '2026-01-01',
      },
    });
  });

  it('AC-06-54 on a split, each property’s flag is its own collection’s', () => {
    const a = new Mileage(ends, mapData).straightLine(null);
    const b = new Mileage({ from: landfill, to: marshRoad }, mapData).straightLine(null);
    const subject = { ticketNumber: '102001' };
    const flagA = Mileage.noRoadRoute(flags, subject, 'collection-a', a);
    const flagB = Mileage.noRoadRoute(flags, subject, 'collection-b', b);

    expect(flagA?.fieldEventId).toBe('collection-a');
    expect(flagB?.fieldEventId).toBe('collection-b');
    expect(flagA?.factsSha256).not.toBe(flagB?.factsSha256);
  });
});

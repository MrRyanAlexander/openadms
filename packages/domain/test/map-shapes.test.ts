// Reading a shape off a map, at the domain (spec/acceptance/01-setup.md AC-01-56, 59; ADR-311;
// BACKLOG C57). The shapes are the example world's (spec/CONVENTIONS.md §6): P1's boundary from
// 75.80° W to 75.40° W and 38.90° N to 39.30° N, in three zones west to east, as the file
// bayline-row-zones-v1.geojson names them in its field ZONE_NAME.
import { describe, expect, it } from 'vitest';

import { MapShapes } from '../src/index.ts';

const shapeOf = (geojson: unknown) => new MapShapes(geojson).shape();
const zonesOf = (geojson: unknown, nameField: string) => new MapShapes(geojson).zones(nameField);

const rectangle = (west: number, south: number, east: number, north: number): number[][][] => [
  [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ],
];
const zone = (name: string, west: number, east: number) => ({
  type: 'Feature',
  properties: { ZONE_NAME: name },
  geometry: { type: 'Polygon', coordinates: rectangle(west, 38.9, east, 39.3) },
});
const boundary = { type: 'Polygon', coordinates: rectangle(-75.8, 38.9, -75.4, 39.3) };
const zones = {
  type: 'FeatureCollection',
  features: [
    zone('Zone 1', -75.8, -75.67),
    zone('Zone 2', -75.67, -75.53),
    zone('Zone 3', -75.53, -75.4),
  ],
};

describe('a shape', () => {
  it('AC-01-59 P1’s boundary is kept as a Polygon with its bounding box, exact to eight places', () => {
    expect(shapeOf(boundary)).toEqual({
      read: {
        geometry: boundary,
        box: {
          westLongitude: '-75.80000000',
          southLatitude: '38.90000000',
          eastLongitude: '-75.40000000',
          northLatitude: '39.30000000',
        },
      },
      problem: null,
    });
  });

  it('is read from a Feature or a FeatureCollection too: several polygons are one MultiPolygon', () => {
    expect(shapeOf({ type: 'Feature', properties: null, geometry: boundary }).read).toEqual(
      shapeOf(boundary).read,
    );
    const all = shapeOf(zones).read;
    expect(all?.geometry.type).toBe('MultiPolygon');
    expect(all?.geometry.coordinates).toHaveLength(3);
    expect(all?.box).toEqual(shapeOf(boundary).read?.box);
  });

  it('a height in a position isn’t kept', () => {
    const high = {
      type: 'Polygon',
      coordinates: [boundary.coordinates[0]?.map((at) => [...at, 12])],
    };
    expect(shapeOf(high).read?.geometry).toEqual(boundary);
  });

  it('anything but closed polygon rings on the earth is refused, in plain words', () => {
    const problems = [
      shapeOf({ type: 'Point', coordinates: [-75.6, 39.1] }),
      shapeOf({ type: 'Polygon', coordinates: [] }),
      shapeOf({
        type: 'Polygon',
        coordinates: [
          [
            [-75.8, 38.9],
            [-75.4, 38.9],
            [-75.4, 39.3],
            [-75.8, 39.3],
          ],
        ],
      }),
      // Latitude first: a file not in longitude and latitude.
      shapeOf({ type: 'Polygon', coordinates: rectangle(38.9, -175.8, 39.3, -175.4) }),
      shapeOf({ type: 'Polygon', coordinates: [[['a', 'b']]] }),
      shapeOf('bayline-row-zones-v1.geojson'),
      shapeOf({ type: 'FeatureCollection', features: [] }),
    ].map((reading) => [reading.read, reading.problem]);
    expect(problems).toEqual([
      [null, "A shape is a Polygon or a MultiPolygon: Point can't be kept."],
      [null, 'A polygon holds at least one ring.'],
      [null, "A ring isn't closed: its last position must be its first."],
      [
        null,
        'A position is off the earth: longitude 38.9, latitude -175.8. Shapes are in longitude and latitude, WGS84.',
      ],
      [null, 'A ring has at least four positions.'],
      [null, 'The file is not GeoJSON.'],
      [null, 'The shape holds no polygon.'],
    ]);
  });
});

describe('the zones of a map', () => {
  it('AC-01-59 are named by the field the admin picked, in the file’s order, each with its box', () => {
    const { read } = zonesOf(zones, 'ZONE_NAME');
    expect(read?.map((each) => [each.name, each.geometry.type, each.box])).toEqual([
      [
        'Zone 1',
        'Polygon',
        {
          westLongitude: '-75.80000000',
          southLatitude: '38.90000000',
          eastLongitude: '-75.67000000',
          northLatitude: '39.30000000',
        },
      ],
      [
        'Zone 2',
        'Polygon',
        {
          westLongitude: '-75.67000000',
          southLatitude: '38.90000000',
          eastLongitude: '-75.53000000',
          northLatitude: '39.30000000',
        },
      ],
      [
        'Zone 3',
        'Polygon',
        {
          westLongitude: '-75.53000000',
          southLatitude: '38.90000000',
          eastLongitude: '-75.40000000',
          northLatitude: '39.30000000',
        },
      ],
    ]);
  });

  it('features the file gives one name are one zone, a MultiPolygon', () => {
    const split = {
      type: 'FeatureCollection',
      features: [
        zone('Zone 1', -75.8, -75.7),
        zone('Zone 2', -75.7, -75.5),
        zone('Zone 1', -75.5, -75.4),
      ],
    };
    const { read } = zonesOf(split, 'ZONE_NAME');
    expect(
      read?.map((each) => [
        each.name,
        each.geometry.type,
        each.box.westLongitude,
        each.box.eastLongitude,
      ]),
    ).toEqual([
      ['Zone 1', 'MultiPolygon', '-75.80000000', '-75.40000000'],
      ['Zone 2', 'Polygon', '-75.70000000', '-75.50000000'],
    ]);
  });

  it('a zone with no name in that field, a bare geometry and an empty file are refused', () => {
    expect(zonesOf(zones, 'NAME').problem).toBe('A zone has no name in the field NAME.');
    expect(zonesOf(boundary, 'ZONE_NAME').problem).toBe(
      'Zones come as a GeoJSON Feature or FeatureCollection.',
    );
    expect(zonesOf({ type: 'FeatureCollection', features: [] }, 'ZONE_NAME').problem).toBe(
      'The file holds no zone.',
    );
  });
});

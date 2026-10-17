// A map file read apart from the API's own work, with no stack (ARCHITECTURE §3 "Project boundary
// and zones"; spec/acceptance/10-api-and-sync.md AC-10-115; ADR-548; the Phase 2 audit's F9): in a
// worker thread of its own, bounded in time and memory. What it reads is `MapFileReader`'s
// (map-file-reader.test.ts); this proves the thread answers the same, and that a reading stopped
// or failed is a file that can't be read, never a server held or stopped.
import { describe, expect, it } from 'vitest';

import { MapFileReadsApart } from '../src/setup/map-file-apart.ts';
import { MapFileReader } from '../src/setup/map-file-reader.ts';
import { geojsonFile, p1Zones } from './support/map-files.ts';

// P1's zones as GIS software writes them: one feature a zone.
const zonesFile = geojsonFile({
  type: 'FeatureCollection',
  features: p1Zones.map(({ rings, fields }) => ({
    type: 'Feature',
    properties: fields,
    geometry: { type: 'Polygon', coordinates: rings },
  })),
});

const bounds = {
  unzippedBytesAtMost: 64 * 1_048_576,
  entriesAtMost: 1000,
  ringPairsAtMost: 50_000_000,
};

describe('a map file read in a thread of its own (ADR-548)', () => {
  it('AC-10-115 reads what the reader reads in this thread, the same layers and the same shapes', async () => {
    const file = zonesFile;
    const apart = await new MapFileReadsApart({
      ...bounds,
      seconds: 60,
      memoryMebibytes: 512,
    }).read(file);
    expect(apart).toEqual(await new MapFileReader(bounds).read(file));
    expect(apart.read?.layers).toHaveLength(1);
  });

  it('AC-10-115 a reading that takes longer than the policy’s seconds is stopped and answered as a file that took too long, and the API goes on', async () => {
    const reading = await new MapFileReadsApart({
      ...bounds,
      seconds: 0.001,
      memoryMebibytes: 512,
    }).read(zonesFile);
    expect(reading).toEqual({
      read: null,
      problem: 'The file took too long to read. Nothing was kept.',
    });
  });

  it('AC-10-115 a file that isn’t one is answered in the reader’s own plain words; the thread is gone either way', async () => {
    const reading = await new MapFileReadsApart({
      ...bounds,
      seconds: 60,
      memoryMebibytes: 512,
    }).read(new TextEncoder().encode('not a map file at all'));
    expect(reading).toEqual({
      read: null,
      problem: 'The file is none of a zipped shapefile, GeoJSON and KML.',
    });
  });
});

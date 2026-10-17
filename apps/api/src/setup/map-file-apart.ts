// A map file is read apart from the API's own work (ARCHITECTURE §3 "Project boundary and zones";
// AC-10-115; ADR-524, 548; the Phase 2 audit's F9). Unzipping and parsing a shapefile, a GeoJSON
// file or a KML file is work nothing can stop part way once it has begun in this thread, and a file
// made to be slow or malformed would hold the event loop for every caller while it ran. So each file
// is read in a worker thread of its own (map-file-worker.ts), with its own heap bounded by the
// policy's `MAP_FILE_READ_MEMORY_MEBIBYTES` and stopped past `MAP_FILE_READ_SECONDS`; a file
// stopped, or one whose reading failed or ran out of memory, is answered as a file that can't be
// read, in plain words, and the thread is gone. The reading itself, and every bound inside it, is
// still `MapFileReader`'s.
import { Worker } from 'node:worker_threads';

import type { MapFileLimits, MapFileReader, MapFileReading } from './map-file-reader.ts';

export interface ApartLimits extends MapFileLimits {
  readonly seconds: number;
  readonly memoryMebibytes: number;
}

// The thread's own file, beside this one: built, or as written where the source is run (a test).
const workerFile = new URL(
  import.meta.url.endsWith('.ts') ? './map-file-worker.ts' : './map-file-worker.js',
  import.meta.url,
);

const tooLong = 'The file took too long to read. Nothing was kept.';
const notRead = 'The file can’t be read. Nothing was kept.';

export class MapFileReadsApart implements Pick<MapFileReader, 'read'> {
  private readonly limits: ApartLimits;

  constructor(limits: ApartLimits) {
    this.limits = limits;
  }

  read(bytes: Uint8Array): Promise<MapFileReading> {
    const { seconds, memoryMebibytes, ...bounds } = this.limits;
    return new Promise((resolve) => {
      let done = false;
      const answer = (reading: MapFileReading): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(reading);
        void worker.terminate();
      };
      const worker = new Worker(workerFile, {
        workerData: { bytes, limits: bounds },
        resourceLimits: {
          maxOldGenerationSizeMb: memoryMebibytes,
          maxYoungGenerationSizeMb: Math.max(16, Math.floor(memoryMebibytes / 8)),
        },
        // Nothing of the API's own settings or secrets reaches the thread.
        env: {},
        stdout: true,
        stderr: true,
      });
      const timer = setTimeout(() => {
        answer({ read: null, problem: tooLong });
      }, seconds * 1000);
      worker.on('message', (said: { reading?: MapFileReading; failed?: true }) => {
        answer(said.reading ?? { read: null, problem: notRead });
      });
      worker.on('error', () => {
        answer({ read: null, problem: notRead });
      });
      worker.on('exit', () => {
        answer({ read: null, problem: notRead });
      });
    });
  }
}

// A map file read in a worker thread of its own (map-file-apart.ts; ADR-548): what the thread
// runs. It is handed the file's bytes and the policy's bounds, reads it as `MapFileReader` does,
// and posts back what it read, or that it failed; it holds nothing else and touches nothing else.
import { parentPort, workerData } from 'node:worker_threads';

import { MapFileReader, type MapFileLimits } from './map-file-reader.ts';

interface Handed {
  readonly bytes: Uint8Array;
  readonly limits: MapFileLimits;
}

const handed = workerData as Handed;
new MapFileReader(handed.limits).read(handed.bytes).then(
  (reading) => {
    parentPort?.postMessage({ reading });
  },
  () => {
    parentPort?.postMessage({ failed: true });
  },
);

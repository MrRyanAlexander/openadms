// Scanning, in the browser build (ARCHITECTURE §12; REQ-315; BACKLOG 3.6.3; AC-11-49; Q-95, Q-105;
// ADR-062, 595, 596): a barcode read from what the camera sees, and what the phone holds under a
// number scanned back.
//
// - **Read from the camera's pixels** by the receipts package's own Code 128 reader, line by line
//   (`Code128.readRow`): across the middle of the view, then down it, for a barcode held either way.
//   **Two lines must read the same number** before it is taken, so one line misread is never a
//   scan. Every barcode Open ADMS prints is Code 128 of the bare number (ADR-595), so a scan gives
//   the number exactly as the ticket shows it. A keyboard-style scanner types into the scan field
//   instead, whatever its symbology (`look/scan-field.tsx`). The iPhone and Android read through
//   the platform's own camera (3.8.2, 3.9.1).
// - **Scanned back** (the user, Q-95: "If the ticket already exists it should simply tell the
//   monitor it exists, not try to fetch all of the data back to them"): what this phone holds of
//   the monitor's own under the number on the assignment's project, its tickets' field events and
//   its certifications, and whether the phone's lists hold a certification of that number. Read
//   from the phone alone: nothing is asked of the server, written, sent or counted.
import type { PhoneListsRecord } from '@open-adms/contracts';
import { Code128 } from '@open-adms/receipts';

import type { Frame } from './camera.ts';
import type { PhoneCertification } from './certifications.ts';
import type { PhoneTicket } from './tickets.ts';

// How many lines are read each way across the middle of the view, and how much of it they span.
const lines = 9;
const span = 0.4;

// The light of one line of pixels, dark low: across at row `at`, or down at column `at`.
function lineOf(frame: Frame, across: boolean, at: number): Float32Array {
  const length = across ? frame.width : frame.height;
  const light = new Float32Array(length);
  for (let along = 0; along < length; along += 1) {
    const pixel = across ? at * frame.width + along : along * frame.width + at;
    const red = frame.data[pixel * 4] ?? 0;
    const green = frame.data[pixel * 4 + 1] ?? 0;
    const blue = frame.data[pixel * 4 + 2] ?? 0;
    light[along] = 0.299 * red + 0.587 * green + 0.114 * blue;
  }
  return light;
}

// The number a barcode in view carries, where two lines read the same; none otherwise.
export function barcodeIn(frame: Frame): string | undefined {
  if (frame.width < 2 || frame.height < 2) return undefined;
  for (const across of [true, false]) {
    const size = across ? frame.height : frame.width;
    const counted = new Map<string, number>();
    for (let line = 0; line < lines; line += 1) {
      const at = Math.round(size * (0.5 - span / 2 + (span * line) / (lines - 1)));
      const read = Code128.readRow(lineOf(frame, across, Math.min(size - 1, at)));
      if (read === undefined) continue;
      const times = (counted.get(read) ?? 0) + 1;
      if (times >= 2) return read;
      counted.set(read, times);
    }
  }
  return undefined;
}

// What the phone holds under a number scanned back.
export type ScannedBack =
  | { readonly kind: 'ticket'; readonly ticket: PhoneTicket }
  | { readonly kind: 'certification'; readonly certification: PhoneCertification }
  | { readonly kind: 'inLists' };

// What this phone holds of the monitor's under the number on the project: each field event of a
// ticket and each certification they made here, the oldest first, and a certification in the
// lists. Empty where it holds nothing of it.
export function scannedBack(
  number: string,
  held: {
    readonly tickets: readonly PhoneTicket[];
    readonly certifications: readonly PhoneCertification[];
    readonly lists: PhoneListsRecord;
  },
): ScannedBack[] {
  const bare = number.trim();
  return [
    ...held.tickets
      .filter((ticket) => ticket.ticketNumber === bare)
      .map((ticket) => ({ kind: 'ticket' as const, ticket })),
    ...held.certifications
      .filter((one) => one.certNumber === bare)
      .map((certification) => ({ kind: 'certification' as const, certification })),
    ...(held.lists.certifications.some((one) => one.certNumber === bare)
      ? [{ kind: 'inLists' as const }]
      : []),
  ];
}

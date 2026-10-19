// What the tests of signing in and setting up with no connection share (ADR-575, 576): the lists of
// a project holding nothing, and the server's making of an offline check, as apps/api's
// OfflineChecks makes one.
import { argon2Sync, randomBytes } from 'node:crypto';

import type { OfflineCheckRecord, PhoneListsRecord } from '@open-adms/contracts';

export const noLists: PhoneListsRecord = {
  setupVersion: 3,
  blocks: [],
  numbering: { ticketNumberSource: 'GENERATED', series: ['LOAD', 'HAUL_OUT', 'UNIT_RATE', 'ROE'] },
  allowSplitLoads: false,
  controlRanges: [],
  debrisTypes: { LOAD: [], HAUL_OUT: [] },
  fieldTags: [],
  typedNumberReasons: [],
  certifications: [],
  sites: [],
  roes: [],
  payItems: [],
  itemNames: [],
  incidentTypes: [],
  incidentOffers: [],
  contractors: [],
  surveyWorkTypes: [],
  vehicleTypes: [],
  vehicleFeatures: [],
  crewTypes: [],
  primes: [],
  helpers: [],
  quantityLookup: [],
};

// The server's making of a check (apps/api's OfflineChecks): Argon2id of what is typed in NFC
// under a salt of its own, then Argon2id of those bytes under a salt for this phone. Cheap
// settings here but where a test says otherwise; the phone reads them from the check.
export const cheap = { memory: 64, passes: 1, parallelism: 1 };
const unpadded = (bytes: Buffer) => bytes.toString('base64').replace(/=+$/, '');
export function firstOf(typed: string, salt: Buffer, cost = cheap): Buffer {
  return argon2Sync('argon2id', {
    message: Buffer.from(typed.normalize('NFC')),
    nonce: salt,
    memory: cost.memory,
    passes: cost.passes,
    parallelism: cost.parallelism,
    tagLength: 32,
  });
}
export function checkOf(typed: string, cost = cheap): { check: OfflineCheckRecord; first: Buffer } {
  const [firstSalt, secondSalt] = [randomBytes(16), randomBytes(16)];
  const first = firstOf(typed, firstSalt, cost);
  const second = argon2Sync('argon2id', {
    message: first,
    nonce: secondSalt,
    memory: cost.memory,
    passes: cost.passes,
    parallelism: cost.parallelism,
    tagLength: 32,
  });
  const settings = `m=${String(cost.memory)},t=${String(cost.passes)},p=${String(cost.parallelism)}`;
  return {
    first,
    check: {
      first: { salt: unpadded(firstSalt), ...cost, bytes: 32 },
      check: `$argon2id$v=19$${settings}$${unpadded(secondSalt)}$${unpadded(second)}`,
    },
  };
}

// A phone of Kim Nguyen's on P1 as the API's tests drive one, and a store of a test's own
// (BACKLOG 2.6.5, 2.8.4; ADR-488, 526): moved word for word from phone-turn-ins.test.ts, so
// held.test.ts drives the same phone. P1 as Dana prices it; the phone enrolled and proven; Kim's
// Monday on P1, planned by Dana; what the phone sends, as it sends it; and a turn-in.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

import {
  filePartMediaType,
  syncAnsweredSchema,
  syncExamples,
  syncPhoneEndpoint,
  turnInAnswerSchema,
  turnInPhoneEndpoint,
  type SyncedFieldEvent,
  type SyncedPhoto,
  type SyncSent,
  type TurnInHolds,
} from '@open-adms/contracts';
import { expect } from 'vitest';

import type { KeptFile, Media } from '../../src/media/media-store.ts';
import type { Tx } from './database.ts';
import { enrolledPhone, proven } from './phones.ts';
import { danasEmail, long, type Answer, type People, type Served } from './served.ts';
import { p1Priced, told } from './setup.ts';

// Files kept in this test's memory, as the store keeps them: once, never overwritten.
export class Kept implements Media {
  readonly files = new Map<string, KeptFile>();

  keep(key: string, bytes: Uint8Array, contentType: string): Promise<'KEPT' | 'ALREADY_THERE'> {
    if (this.files.has(key)) return Promise.resolve('ALREADY_THERE');
    this.files.set(key, { bytes: Buffer.from(bytes), contentType });
    return Promise.resolve('KEPT');
  }

  sizeOf(key: string): Promise<number | null> {
    return Promise.resolve(this.files.get(key)?.bytes.length ?? null);
  }

  read(key: string): Promise<KeptFile | null> {
    return Promise.resolve(this.files.get(key) ?? null);
  }
}

// 6:30 pm on Monday in Bayline County: the phone is brought back to the office.
export const mondayEvening = new Date('2026-10-12T22:30:00Z');
export const refused = [401, 'MASTER_PASSCODE_REFUSED'];
export const notProven = [401, 'PHONE_NOT_PROVEN'];
export const nothingHeld: TurnInHolds = {
  unplannedAssignments: [],
  passcodeUses: [],
  records: [],
  held: [],
  photos: [],
};

// A photograph as a phone's camera writes it: a JPEG's first bytes, then its own.
export const jpeg = (): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0, 0x22]), randomBytes(2_000)]);
// A depth file kept as a PNG.
export const png = (): Buffer =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    randomBytes(1_000),
  ]);
export const sha256Of = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex');

// P1 as Dana prices it; the collection phone, enrolled and proven; Kim Nguyen's Monday on P1,
// planned by Dana; and what the phone sends, as it sends it.
export async function kimsPhone(served: Served, tx: Tx, who: People, name = 'P1-COL-1') {
  served.clock.at = mondayEvening;
  const dana = await served.signedIn(danasEmail, long);
  const priced = await p1Priced(served, dana, tx);
  const projectId = priced.project.id;
  return kimsOther(served, tx, who, projectId, name, dana);
}

// Another phone of Kim's on the same project.
export async function kimsOther(
  served: Served,
  tx: Tx,
  who: People,
  projectId: string,
  name: string,
  dana: Awaited<ReturnType<Served['signedIn']>>,
) {
  const phone = await enrolledPhone(served, tx, name);
  const token = await proven(served, phone);
  const assignment = await tx.assignment.create({
    data: {
      personId: who.kim,
      workDate: new Date('2026-10-12'),
      projectId,
      fieldEventKinds: ['COLLECTION', 'DISPOSAL'],
      origin: 'PLANNED',
      madeById: who.dana,
    },
  });
  const collection = (): SyncedFieldEvent => ({
    ...syncExamples.collection,
    id: randomUUID(),
    projectId,
    monitorId: who.kim,
    assignmentId: assignment.id,
    setupVersion: 1,
    formDebrisTypeId: null,
  });
  const photographOf = (owner: SyncedFieldEvent, file: Buffer, depth?: Buffer): SyncedPhoto => ({
    ...syncExamples.pilePhoto,
    id: randomUUID(),
    projectId,
    owner: { kind: 'FIELD_EVENT', id: owner.id },
    takenById: who.kim,
    uploadedSha256: sha256Of(file),
    depthSha256: depth === undefined ? null : sha256Of(depth),
  });
  const sync = async (more: Partial<SyncSent>) => {
    const answer = await served.ask('POST', syncPhoneEndpoint.path, {
      bearer: token,
      payload: {
        clockAt: served.clock.now().toISOString(),
        deviceUtcOffsetMinutes: -240,
        unplannedAssignments: [],
        passcodeUses: [],
        records: [],
        photos: [],
        lastUsed: [],
        holds: { masterPasscodeVersion: phone.masterPasscodeVersion, listsProjectId: null },
        ...more,
      },
    });
    expect(told(answer)).toEqual([200, undefined]);
    return syncAnsweredSchema.parse(answer.body);
  };
  // A photograph's file, or the depth file beside it, sent whole in one part.
  const upload = async (photoId: string, file: Buffer, which: 'photo' | 'depth' = 'photo') => {
    const answer = await served.ask(
      'PATCH',
      `/phones/current/photos/${photoId}/files/${which}?offset=0&length=${String(file.length)}`,
      { bearer: token, bytes: file, contentType: filePartMediaType },
    );
    expect(told(answer)).toEqual([200, undefined]);
  };
  return { dana, projectId, phone, token, collection, photographOf, sync, upload };
}

export const turnIn = (
  served: Served,
  bearer: string | undefined,
  payload: object,
): Promise<Answer> =>
  served.ask('POST', turnInPhoneEndpoint.path, {
    payload,
    ...(bearer === undefined ? {} : { bearer }),
  });

// A turn-in that must be answered: the answer, read by its schema.
export async function turnedIn(served: Served, bearer: string, payload: object) {
  const answer = await turnIn(served, bearer, payload);
  expect(told(answer)).toEqual([200, undefined]);
  return { ...turnInAnswerSchema.parse(answer.body), requestId: answer.requestId };
}

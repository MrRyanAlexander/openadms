// One sync, whole, at the contracts package (spec/acceptance/05-sync.md AC-05-03, 15, 20, 45…47;
// spec/acceptance/10-api-and-sync.md AC-10-35, 36, 37; T-12; BACKLOG 2.6.1 part 2, C69, C84 (9),
// C122, C126, C127, C136; ADR-022, 052, 065, 100, 457, 464, 467, 481; REQ-004, 203): what a phone
// sends and what it is answered, each record and each photograph's record read on its own.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  lastUsedSchema,
  photoAnswerSchema,
  photoNames,
  photoRead,
  recordAnswerSchema,
  recordNames,
  recordRead,
  syncAnsweredSchema,
  syncPasscodeUsesAtMost,
  syncPhotosAtMost,
  syncRecordsAtMost,
  syncSentSchema,
  syncSeriesAtMost,
  syncUnplannedAssignmentsAtMost,
  syncedPhotoSchema,
  type RecordAnswer,
  type SyncAnswered,
  type SyncSent,
} from '../src/index.ts';
import {
  ana,
  assignment,
  certification,
  certificationPhotos,
  collection,
  disposal,
  made,
  p1,
  pilePhoto,
  records,
  switched,
  unplanned,
} from '../src/sync-examples.ts';

// The tower's phone at 17:30 on Monday.
const sync: SyncSent = {
  clockAt: '2026-10-12T21:30:00.000Z',
  deviceUtcOffsetMinutes: -240,
  unplannedAssignments: [unplanned],
  passcodeUses: [switched],
  records,
  photos: [pilePhoto, ...certificationPhotos],
  lastUsed: [{ projectId: p1, series: 'LOAD', lastUsedNumber: 101006 }],
  holds: { masterPasscodeVersion: 3, listsProjectId: p1 },
};

const refusals = (schema: z.ZodType, payload: unknown): string[] => {
  const result = schema.safeParse(payload);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};
const taken = (payload: unknown): boolean => syncSentSchema.safeParse(payload).success;

describe('what a phone sends at a sync', () => {
  it('AC-05-03, AC-05-05, AC-10-36 the phone’s clock, its unplanned assignments, the passcode’s uses it logged, its records, its photographs’ records after them, the last number it used of each series and what it holds that a sync may bring anew: one schema, in that order', () => {
    expect(refusals(syncSentSchema, sync)).toEqual([]);
    expect(Object.keys(syncSentSchema.shape)).toEqual([
      'clockAt',
      'deviceUtcOffsetMinutes',
      'unplannedAssignments',
      'passcodeUses',
      'records',
      'photos',
      'lastUsed',
      'holds',
    ]);
    const read = syncSentSchema.parse(sync);
    expect(read.clockAt).toEqual(new Date('2026-10-12T21:30:00Z'));
    expect(read.records).toHaveLength(records.length);
    // A phone with nothing to report still says each part, empty.
    expect(
      taken({
        ...sync,
        unplannedAssignments: [],
        passcodeUses: [],
        records: [],
        photos: [],
        lastUsed: [],
      }),
    ).toBe(true);
    for (const part of Object.keys(sync)) {
      const rest = Object.fromEntries(Object.entries(sync).filter(([name]) => name !== part));
      expect(taken(rest), part).toBe(false);
    }
    // What it holds: the version of the passcode's check, none on a phone just enrolled, and
    // the project whose lists it holds, none on a phone with no lists. Never the lists, a
    // check, or the version it thinks the setup is.
    expect(taken({ ...sync, holds: { masterPasscodeVersion: null, listsProjectId: null } })).toBe(
      true,
    );
    for (const holds of [
      {},
      { masterPasscodeVersion: 3 },
      { masterPasscodeVersion: 0, listsProjectId: p1 },
      { masterPasscodeVersion: 3, listsProjectId: 'P1' },
      { masterPasscodeVersion: 3, listsProjectId: p1, setupVersion: 4 },
      { masterPasscodeVersion: 3, listsProjectId: p1, check: 'x' },
    ]) {
      expect(taken({ ...sync, holds }), JSON.stringify(holds)).toBe(false);
    }
    // The clock is an instant with its offset beside it, as every time a phone sends is.
    expect(taken({ ...sync, clockAt: '2026-10-12T17:30:00-04:00' })).toBe(false);
    expect(taken({ ...sync, deviceUtcOffsetMinutes: 900 })).toBe(false);
  });

  it('AC-10-35 a sync never says which phone it is from, who is signed in, or anything the server concludes: such a field is refused', () => {
    for (const forged of [
      { deviceId: made('97') },
      { monitorId: ana },
      { receivedAt: '2026-10-12T21:30:00.000Z' },
      { clockDifferenceSeconds: 0 },
      { blocks: [] },
    ]) {
      const [name] = Object.keys(forged);
      expect(refusals(syncSentSchema, { ...sync, ...forged }), name).toEqual([
        `: Unrecognized key: "${String(name)}"`,
      ]);
    }
    // The reports are the ones their own endpoints read: the passcode is never sent.
    expect(taken({ ...sync, unplannedAssignments: [{ ...unplanned, passcode: 'x' }] })).toBe(false);
    expect(taken({ ...sync, passcodeUses: [{ ...switched, personId: null }] })).toBe(false);
    expect(taken({ ...sync, passcodeUses: [{ ...switched, typed: '4417' }] })).toBe(false);
  });

  it('API4 every part is bounded: 200 records, 200 photographs’ records, 20 unplanned assignments, 100 uses of the passcode, 20 series, each series once', () => {
    expect([
      syncRecordsAtMost,
      syncPhotosAtMost,
      syncUnplannedAssignmentsAtMost,
      syncPasscodeUsesAtMost,
      syncSeriesAtMost,
    ]).toEqual([200, 200, 20, 100, 20]);
    const many = <T>(count: number, one: (index: number) => T): T[] =>
      Array.from({ length: count }, (_, index) => one(index));
    const record = (index: number): unknown => ({
      record: 'FIELD_EVENT',
      fieldEvent: { ...collection, id: made(String(1000 + index)) },
    });
    expect(taken({ ...sync, records: many(200, record) })).toBe(true);
    expect(refusals(syncSentSchema, { ...sync, records: many(201, record) })).toEqual([
      'records: Too big: expected array to have <=200 items',
    ]);
    // A full sync of ordinary records, and of photographs' records beside them, is well inside
    // the request's one mebibyte.
    const photo = (index: number): unknown => ({ ...pilePhoto, id: made(String(5000 + index)) });
    expect(taken({ ...sync, photos: many(200, photo) })).toBe(true);
    expect(refusals(syncSentSchema, { ...sync, photos: many(201, photo) })).toEqual([
      'photos: Too big: expected array to have <=200 items',
    ]);
    expect(
      JSON.stringify({ ...sync, records: many(200, record), photos: many(200, photo) }).length,
    ).toBeLessThan(655_360);
    const report = (index: number): unknown => ({ ...unplanned, id: made(String(2000 + index)) });
    expect(taken({ ...sync, unplannedAssignments: many(21, report) })).toBe(false);
    const use = (index: number): unknown => ({ ...switched, id: made(String(3000 + index)) });
    expect(taken({ ...sync, passcodeUses: many(101, use) })).toBe(false);
    const series = (index: number): unknown => ({
      projectId: made(String(4000 + index)),
      series: 'LOAD',
      lastUsedNumber: null,
    });
    expect(taken({ ...sync, lastUsed: many(20, series) })).toBe(true);
    expect(taken({ ...sync, lastUsed: many(21, series) })).toBe(false);
    const load = { projectId: p1, series: 'LOAD', lastUsedNumber: 101006 };
    expect(taken({ ...sync, lastUsed: [load, { ...load, lastUsedNumber: 101007 }] })).toBe(false);
    expect(taken({ ...sync, lastUsed: [load, { ...load, series: 'ROE' }] })).toBe(true);
    // A number of a series is a whole number from 1; a series is one the domain names.
    expect(lastUsedSchema.safeParse({ ...load, lastUsedNumber: 0 }).success).toBe(false);
    expect(lastUsedSchema.safeParse({ ...load, lastUsedNumber: 101006.5 }).success).toBe(false);
    expect(lastUsedSchema.safeParse({ ...load, series: 'TICKET' }).success).toBe(false);
  });
});

describe('each record of a sync, read on its own', () => {
  it('AC-05-45 one that isn’t a record never refuses the sync or the records sent with it: it is read as not saved, the others as they are', () => {
    const sent = [
      { record: 'FIELD_EVENT', fieldEvent: collection },
      { record: 'FIELD_EVENT', fieldEvent: { ...disposal, loadCall: 140 } },
      { record: 'COMPLETED_LOAD', load: { id: made('9') } },
      'not a record',
      null,
      { record: 'FIELD_EVENT', fieldEvent: disposal },
    ];
    expect(refusals(syncSentSchema, { ...sync, records: sent })).toEqual([]);
    const read = syncSentSchema.parse({ ...sync, records: sent }).records.map(recordRead);
    expect(read.map((each) => each.read)).toEqual([true, false, false, false, false, true]);
    expect(read.map((each) => (each.read ? each.record.record : each.notice.reason))).toEqual([
      'FIELD_EVENT',
      'NOT_A_RECORD',
      'NOT_A_RECORD',
      'NOT_A_RECORD',
      'NOT_A_RECORD',
      'FIELD_EVENT',
    ]);
    // A record read is the one its own schema reads: a time as a `Date`.
    const [first] = read;
    if (first?.read !== true || first.record.record !== 'FIELD_EVENT') throw new Error('Unread.');
    expect(first.record.fieldEvent.startedAt).toEqual(new Date('2026-10-12T13:05:00Z'));
    // The id it was sent under, where that much could be read.
    expect(read.map((each) => (each.read ? 'read' : each.id))).toEqual([
      'read',
      disposal.id,
      made('9'),
      null,
      null,
      'read',
    ]);
  });

  it('ADR-468, 472 what a thing sent in a record’s place names is read loosely, each on its own: its id, its project and its monitor, or nothing', () => {
    expect(
      recordNames({ record: 'FIELD_EVENT', fieldEvent: { ...disposal, loadCall: 140 } }),
    ).toEqual({ id: disposal.id, projectId: disposal.projectId, monitorId: disposal.monitorId });
    // Whatever the kind calls its monitor; a project that is no id is not read.
    expect(
      recordNames({ record: 'ROE', roe: { id: made('9'), projectId: 'P1', madeById: made('8') } }),
    ).toEqual({ id: made('9'), projectId: null, monitorId: made('8') });
    expect(recordNames({ record: 'COMPLETED_LOAD', load: { id: made('9') } })).toEqual({
      id: made('9'),
      projectId: null,
      monitorId: null,
    });
    for (const sent of [
      'not a record',
      null,
      7,
      [],
      {},
      { record: 'ROE', roe: { id: 'R-0007' } },
    ]) {
      expect(recordNames(sent)).toEqual({ id: null, projectId: null, monitorId: null });
    }
  });

  it('AC-10-37, C127 a record that isn’t one is told which field and how, in the contract’s own words: never a value that was sent, nor the name of a field nobody named', () => {
    const told = (fieldEvent: unknown): string => {
      const read = recordRead({ record: 'FIELD_EVENT', fieldEvent });
      if (read.read) throw new Error('Read.');
      return read.notice.message;
    };
    expect(told({ ...disposal, loadCall: 140 })).toBe(
      'Not saved: this record can’t be read: fieldEvent.loadCall in this record can’t be more than 100.',
    );
    expect(told({ ...disposal, zoneId: made('99'), amount: 1260 })).toBe(
      'Not saved: this record can’t be read: fieldEvent in this record has a field this request doesn’t take.',
    );
    const { endedAt, ...unfinished } = collection;
    expect([endedAt, told(unfinished)]).toEqual([
      '2026-10-12T13:40:00.000Z',
      'Not saved: this record can’t be read: fieldEvent.endedAt in this record is missing.',
    ]);
    // The domain's own words quote the suffix sent: the phone is told the field alone.
    const split = told({ ...collection, splitSuffix: 'a;1', estimateCy: 12.5 });
    expect(split).toBe(
      'Not saved: this record can’t be read: fieldEvent.splitSuffix in this record isn’t taken as it stands.',
    );
    expect(split).not.toContain('a;1');
    // No more than three are said.
    expect(
      told({ ...disposal, loadCall: 140, carriedCount: -1, typedCapacityCy: 0.5, siteId: 'x' }),
    ).toMatch(/; and 1 more\.$/);
    for (const sent of ['not a record', null, 7, [], {}, { record: 'COMPLETED_LOAD' }]) {
      const read = recordRead(sent);
      if (read.read) throw new Error('Read.');
      expect(read.notice.message, JSON.stringify(sent)).toMatch(
        /^Not saved: this record can’t be read: /,
      );
      expect(read.notice.message).not.toContain('COMPLETED_LOAD');
    }
  });
});

describe('what a phone is answered', () => {
  // A check as the login list's answer carries one: made up, in the shape a phone reads.
  const passcodeCheck = {
    first: { salt: 'c2FsdHNhbHRzYWx0c2FsdA', memory: 19456, passes: 2, parallelism: 1, bytes: 32 },
    check: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA',
  };
  const saved: RecordAnswer = { answer: 'SAVED', id: collection.id, notes: [] };
  const answered: SyncAnswered = {
    unplannedAssignments: [{ assignmentId: unplanned.id, answer: 'SAVED', reason: null }],
    passcodeUses: [{ useId: switched.id, answer: 'ALREADY_SAVED', reason: null }],
    photos: [
      { answer: 'SAVED', id: pilePhoto.id, notes: [] },
      { answer: 'ALREADY_SAVED', id: made('21') },
      {
        answer: 'NOT_SAVED',
        id: made('22'),
        reason: 'OWNER_NOT_SAVED',
        message:
          'Not saved: the record this photograph belongs to isn’t saved on the server. Held on the server for review.',
      },
    ],
    records: [
      saved,
      {
        answer: 'SAVED',
        id: made('5'),
        notes: [{ code: 'GPS_UNREADABLE', message: 'GPS unreadable: kept as sent.' }],
      },
      { answer: 'ALREADY_SAVED', id: made('3') },
      {
        answer: 'QUARANTINED',
        id: made('2'),
        reason: 'DUPLICATE_FIELD_EVENT',
        message:
          'Ticket 101020: this ticket already has a disposal. Not saved: kept in quarantine for review.',
        heldBy: made('8'),
      },
      {
        answer: 'NOT_SAVED',
        id: null,
        reason: 'NOT_A_RECORD',
        message: 'Not saved: this record can’t be read: this record is missing.',
      },
      {
        answer: 'NOT_SAVED',
        id: made('6'),
        reason: 'NAMES_NO_RECORD',
        message: 'Not saved: this record names something the server doesn’t have.',
      },
      {
        answer: 'NOT_SAVED',
        id: made('7'),
        reason: 'ASSIGNMENT_NOT_SAVED',
        message: 'Not saved: the assignment this record was made under was not saved.',
      },
    ],
    numbers: [
      {
        projectId: p1,
        series: 'LOAD',
        toppedUp: true,
        blocks: [
          { firstNumber: 101001, lastNumber: 102000, lastUsedNumber: 101006 },
          { firstNumber: 102001, lastNumber: 102006, lastUsedNumber: null },
        ],
      },
      { projectId: p1, series: 'ROE', toppedUp: false, blocks: [] },
    ],
    masterPasscode: { version: 4, check: passcodeCheck },
    setupVersion: { projectId: p1, version: 7 },
  };

  it('AC-05-20, 45, 47 each thing sent has its own answer: a record saved with its notes, already saved, quarantined with the reason and the record that holds the number, or not saved; the blocks held now', () => {
    expect(refusals(syncAnsweredSchema, answered)).toEqual([]);
    // Besides the answers (ADR-473): the passcode's version in force, with a check or none,
    // and a setup version or none. Never left out, and never the lists.
    expect(
      refusals(syncAnsweredSchema, {
        ...answered,
        masterPasscode: { version: 4, check: null },
        setupVersion: null,
      }),
    ).toEqual([]);
    const not = (more: object): boolean =>
      !syncAnsweredSchema.safeParse({ ...answered, ...more }).success;
    expect([
      not({ masterPasscode: null }),
      not({ masterPasscode: { version: 4 } }),
      not({ masterPasscode: { version: 4, check: 'osprey-landing-marsh' } }),
      not({ setupVersion: { projectId: p1, version: 0 } }),
      not({ setupVersion: 7 }),
      not({ setupVersion: { projectId: p1, version: 7, lists: {} } }),
      not({ lists: {} }),
    ]).toEqual([true, true, true, true, true, true, true]);
    expect(answered.records.map((each) => each.answer)).toEqual([
      'SAVED',
      'SAVED',
      'ALREADY_SAVED',
      'QUARANTINED',
      'NOT_SAVED',
      'NOT_SAVED',
      'NOT_SAVED',
    ]);
    // An unplanned assignment or a use not saved says why, as its own endpoint does.
    expect(
      refusals(syncAnsweredSchema, {
        ...answered,
        unplannedAssignments: [
          { assignmentId: unplanned.id, answer: 'NOT_SAVED', reason: 'UNKNOWN_PROJECT' },
        ],
        passcodeUses: [{ useId: switched.id, answer: 'NOT_SAVED', reason: 'NOT_A_MONITOR' }],
      }),
    ).toEqual([]);
  });

  it('AC-05-15, 20 “saved” is one answer and says nothing else: a quarantined record has its reason and its holder, one not saved has no holder, and only one that couldn’t be read has no id', () => {
    const not = (answer: unknown): boolean => !recordAnswerSchema.safeParse(answer).success;
    expect(not({ ...saved, reason: 'DUPLICATE_FIELD_EVENT' })).toBe(true);
    expect(not({ answer: 'SAVED', id: collection.id })).toBe(true);
    expect(not({ ...saved, id: null })).toBe(true);
    expect(not({ answer: 'ALREADY_SAVED', id: null })).toBe(true);
    expect(not({ answer: 'QUARANTINED', id: made('2'), reason: 'DUPLICATE_FIELD_EVENT' })).toBe(
      true,
    );
    const [, , , quarantined, unread] = answered.records;
    expect(not({ ...quarantined, reason: 'NOT_A_RECORD' })).toBe(true);
    expect(not({ ...quarantined, heldBy: null })).toBe(true);
    expect(not({ ...unread, heldBy: made('8') })).toBe(true);
    expect(not({ ...unread, reason: 'INELIGIBLE' })).toBe(true);
    expect(not({ answer: 'REFUSED', id: made('2') })).toBe(true);
    expect(not({ answer: 'FAILED', id: made('2') })).toBe(true);
  });

  it('AC-10-35 no answer carries a conclusion or money: a status, a flag, a zone, an amount or a rate is no field of it', () => {
    const names = new Set<string>();
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        node.forEach(walk);
      } else if (typeof node === 'object' && node !== null) {
        const { properties, ...rest } = node as { properties?: Record<string, unknown> };
        for (const [name, of] of Object.entries(properties ?? {})) {
          names.add(name);
          walk(of);
        }
        Object.values(rest).forEach(walk);
      }
    };
    walk(z.toJSONSchema(syncAnsweredSchema));
    expect([...names].sort()).toEqual([
      'answer',
      'assignmentId',
      'blocks',
      'bytes',
      'check',
      'code',
      'first',
      'firstNumber',
      'heldBy',
      'id',
      'lastNumber',
      'lastUsedNumber',
      'masterPasscode',
      'memory',
      'message',
      'notes',
      'numbers',
      'parallelism',
      'passcodeUses',
      'passes',
      'photos',
      'projectId',
      'reason',
      'records',
      'salt',
      'series',
      'setupVersion',
      'toppedUp',
      'unplannedAssignments',
      'useId',
      'version',
    ]);
    expect(assignment).not.toBe(unplanned.id);
  });
});

describe('a photograph’s record', () => {
  it('AC-05-05, ADR-101, 481 what it is of, who took it, when and where, and both fingerprints, the phone’s word: never where its file is kept, which the server makes; a certification’s five each say their view, and only a certification’s photograph has one', () => {
    for (const photo of [pilePhoto, ...certificationPhotos]) {
      expect(refusals(syncedPhotoSchema, photo), photo.id).toEqual([]);
    }
    const read = photoRead(pilePhoto);
    if (!read.read) throw new Error('The example is no photograph.');
    expect(read.photo.capturedAt).toEqual(new Date(pilePhoto.capturedAt));
    expect(certificationPhotos.map(({ owner, view }) => [owner.id, view])).toEqual(
      ['OPERATOR_WITH_PLACARD', 'INTERIOR_OR_BACK', 'RIGHT', 'LEFT', 'FRONT'].map((view) => [
        certification.id,
        view,
      ]),
    );
    // The place, the file, an upload's time, the phone: never the phone's to say.
    for (const forged of [
      { objectKey: 'projects/x/photos/y' },
      { depthObjectKey: 'y.depth' },
      { uploadedAt: '2026-10-12T21:30:00.000Z' },
      { deviceId: made('97') },
      { file: 'aGVsbG8' },
    ]) {
      const [name] = Object.keys(forged);
      expect(refusals(syncedPhotoSchema, { ...pilePhoto, ...forged }), name).toEqual([
        `: Unrecognized key: "${String(name)}"`,
      ]);
    }
    // A view is a certification's photograph's alone; a certification's may have none.
    expect(refusals(syncedPhotoSchema, { ...pilePhoto, view: 'LEFT' })).toEqual([
      'view: Only a certification’s photograph is one of its views.',
    ]);
    expect(refusals(syncedPhotoSchema, { ...certificationPhotos[0], view: null })).toEqual([]);
    expect(refusals(syncedPhotoSchema, { ...certificationPhotos[0], view: 'TOP' })).toHaveLength(1);
    // A fingerprint is a SHA-256 as 64 lower-case hexadecimal digits, as the database keeps one.
    for (const sha of ['', 'a'.repeat(63), 'A'.repeat(64), `${'a'.repeat(63)}g`, 'a'.repeat(65)]) {
      expect(refusals(syncedPhotoSchema, { ...pilePhoto, originalSha256: sha }), sha).toEqual([
        'originalSha256: is not a SHA-256 in hex',
      ]);
      expect(refusals(syncedPhotoSchema, { ...pilePhoto, uploadedSha256: sha }), sha).toHaveLength(
        1,
      );
    }
    // What it is of is a kind of record a phone makes, by that record's id.
    for (const owner of [
      { kind: 'COMPLETED_LOAD', id: collection.id },
      { kind: 'FIELD_EVENT', id: '101001' },
      { kind: 'FIELD_EVENT' },
      { kind: 'FIELD_EVENT', id: collection.id, ticketNumber: '101001' },
    ]) {
      expect(
        syncedPhotoSchema.safeParse({ ...pilePhoto, owner }).success,
        JSON.stringify(owner),
      ).toBe(false);
    }
    expect(refusals(syncedPhotoSchema, { ...pilePhoto, depthFile: 'yes' })).toHaveLength(1);
  });

  it('ADR-481 one that isn’t a photograph’s record is read as not saved, with what it names where that much can be read: its own id, its project and who took it, never what it is of', () => {
    const read = photoRead({ ...pilePhoto, objectKey: 'x' });
    expect(read.read).toBe(false);
    if (read.read) return;
    expect([read.id, read.notice.reason]).toEqual([pilePhoto.id, 'NOT_A_RECORD']);
    expect(photoNames(pilePhoto)).toEqual({ id: pilePhoto.id, projectId: p1, monitorId: ana });
    expect(photoNames({ owner: { id: collection.id } })).toEqual({
      id: null,
      projectId: null,
      monitorId: null,
    });
    for (const none of [null, 'photo', 7, [pilePhoto]]) {
      expect(photoNames(none)).toEqual({ id: null, projectId: null, monitorId: null });
    }
  });

  it('ADR-481 its answer is saved, already saved or not saved: never quarantined, and never where its file is kept', () => {
    const not = (answer: unknown): boolean => !photoAnswerSchema.safeParse(answer).success;
    expect(not({ answer: 'SAVED', id: pilePhoto.id, notes: [] })).toBe(false);
    expect(
      not({
        answer: 'QUARANTINED',
        id: pilePhoto.id,
        reason: 'DUPLICATE_FIELD_EVENT',
        message: 'Not saved.',
        heldBy: collection.id,
      }),
    ).toBe(true);
    expect(
      not({ answer: 'SAVED', id: pilePhoto.id, notes: [], objectKey: 'projects/x/photos/y' }),
    ).toBe(true);
  });
});

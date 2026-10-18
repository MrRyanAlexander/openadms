// The twentieth story (BACKLOG 2.6.2 part 4, C129, C132; ADR-468, 471, 472, 475;
// spec/acceptance/05-sync.md AC-05-15, 45, 46; spec/acceptance/10-api-and-sync.md AC-10-46;
// REQ-203, 308c): what a sync can't save is held on the server for a person, exactly as sent,
// and its phone is told so. Never "saved", never dropped, and nothing else the sync carried is
// undone. Each phone syncs through the API's own `Sync`, on the story's own database, so each
// thing a sync carries is its own piece of work, as it is in the process.
//
// Saturday 10 October 2026: Sam Grant and Lee Morgan each certify a truck on P1 under sheet
// number 730416, one number typed on two phones, and both phones find signal at the same
// moment. The database lets one certification hold the number; the other is held for a
// person. Which of the two is not the story's to say: whichever reached the database first.
//
// Monday 12 October: Ana Brooks's phone syncs two collections. The second names a debris type
// by an id the server doesn't have (the story makes the record so: a phone's lists come from
// the server). The database's own constraint refuses it; the first is saved all the same.
//
// Tuesday 13 October (task 2.8.4, ADR-526): Ana takes another photograph of 101001, whose file
// her phone's gallery wrote again after it was fingerprinted: it is set aside. Dana reads what
// waits for a person, saves the certification as corrected under the sheet number it should
// have had, and 101002 with the debris type Ana meant; the certifying phone is turned in. Ana's
// is not, until Dana closes the file set aside; then it is.
import {
  closeSetAsideFileEndpoint,
  listHeldRecordsEndpoint,
  listSetAsideFilesEndpoint,
  saveHeldRecordEndpoint,
  type RecordAnswer,
} from '@open-adms/contracts';
import { deviceKeyActorId, deviceKeyActorName } from '@open-adms/db';

import { made, onTheWire, type SimulatedDevice } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import type { Story } from '../runner.ts';
import { assigned, firstBlocks, synced, taken } from './board.ts';
import { danasEmail, p1TimeZone as timeZone, setUpP1 } from './p1.ts';

const on = (date: string, time: string): string => `2026-10-${date}T${time}:00-04:00`;
const saturday = (time: string): string => on('10', time);
const monday = (time: string): string => on('12', time);
const tuesday = (time: string): string => on('13', time);

const held = 'Held on the server for review.';

export const heldForReview: Story = {
  name: 'held-for-review',
  title:
    'What a sync can’t save is held for a person, exactly as sent, and its phone is told so: two phones certifying one number at once; a record that names what the server doesn’t have',
  timeZone,
  start: saturday('08:00'),

  async run(story) {
    const { api, clock } = story;

    story.at(
      saturday('08:00'),
      'Dana Reyes has set up P1 and enrolled three phones; Sam Grant and Lee Morgan certify today, each on a phone',
    );
    const phones = {
      sam: await story.enrolled('P1-HO-TDSR'),
      lee: await story.enrolled('P1-TWR-CCL'),
      ana: await story.enrolled('P1-COL-1'),
    };
    const dana = uuidv7(clock.now());
    const { p1 } = await api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({
        data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: danasEmail },
      });
      const made = await setUpP1(tx, story.policy);
      return { p1: made.project };
    });
    const sam = await story.monitor('Sam Grant', phones.sam.id);
    const lee = await story.monitor('Lee Morgan', phones.lee.id);
    const ana = await story.monitor('Ana Brooks', phones.ana.id);
    const names = new Map([
      [phones.sam.id, 'P1-HO-TDSR'],
      [phones.lee.id, 'P1-TWR-CCL'],
      [phones.ana.id, 'P1-COL-1'],
      [sam.id, 'Sam Grant'],
      [lee.id, 'Lee Morgan'],
      [ana.id, 'Ana Brooks'],
      [deviceKeyActorId, deviceKeyActorName],
      [dana, 'Dana Reyes'],
      [p1, 'P1'],
    ]);
    const named = (id: string | null): string | null =>
      id === null ? null : (names.get(id) ?? id);

    const certifying = async (monitor: typeof sam, deviceId: string): Promise<SimulatedDevice> => {
      const assignmentId = await assigned(api, clock, dana, {
        workDate: '2026-10-10',
        projectId: p1,
        personId: monitor.id,
        certifying: true,
        deviceId,
      });
      if ((await taken(story, monitor, deviceId)) !== assignmentId) {
        throw new Error(`${monitor.name}’s phone took another assignment.`);
      }
      return story.phone({
        name: names.get(deviceId) ?? deviceId,
        deviceId,
        monitorId: monitor.id,
        assignmentId,
        projectId: p1,
        lists: await story.lists.held({ assignmentId, deviceId }),
        timeZone,
      });
    };
    const samsPhone = await certifying(sam, phones.sam.id);
    const leesPhone = await certifying(lee, phones.lee.id);

    // What the server holds of what the phones sent, in plain words.
    const heldRecords = async () =>
      (await api.heldRecord.findMany({ orderBy: { receivedAt: 'asc' } })).map((each) => ({
        phone: named(each.deviceId),
        sentId: each.sentId,
        project: named(each.projectId),
        monitor: named(each.sentMonitorId),
        reason: each.reason,
        message: each.message,
        payload: each.payload,
        resolved: each.resolvedAt !== null,
      }));
    const ledger = async () =>
      (await api.syncedRecord.findMany({ orderBy: { recordId: 'asc' } })).map((row) => [
        row.recordId,
        row.recordKind,
        row.answer,
        named(row.deviceId),
      ]);
    const auditOf = async (tableName: string) =>
      (await api.auditRecord.findMany({ where: { tableName }, orderBy: { id: 'asc' } })).map(
        (record) => [
          record.operation,
          named(record.actorId),
          record.source,
          named(record.deviceId),
          (record.newValue as { payload?: unknown } | null)?.payload,
        ],
      );

    // ------------------------------------------------------------------------------------------
    story.at(
      saturday('09:40'),
      'Sam certifies Rivera’s self-loader and Lee a dump trailer, each typing sheet number 730416; both phones find signal at once and sync',
    );
    // Each picks from the lists his phone was sent (ADR-552 (3)).
    const sams = samsPhone.certify({
      kind: 'CONTAINER',
      paperNumber: '730416',
      prime: 'Coastline Haulers LLC',
      vehicleType: 'Self-Loading Truck',
      boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 264, width: 92, height: 96 }],
    });
    const lees = leesPhone.certify({
      kind: 'CONTAINER',
      paperNumber: '730416',
      prime: 'Coastline Haulers LLC',
      vehicleType: 'Hydraulic Dump Trailer',
      boxes: [{ shape: 'RECTANGLE', sign: 'ADD', length: 360, width: 96, height: 72 }],
    });
    const sheets = [
      { phone: samsPhone, record: sams.record },
      { phone: leesPhone, record: lees.record },
    ];
    const wires = new Map(
      sheets.map(({ record }) => [
        record.id,
        onTheWire({ record: 'CERTIFICATION', certification: record }),
      ]),
    );
    const sentAtOnce = await Promise.all(sheets.map(({ phone }) => phone.sync(story.server)));
    const told = sheets
      .map(({ phone }) =>
        phone.answers.filter((one) => one.sent.record === 'CERTIFICATION').map((one) => one.answer),
      )
      .flat();
    const photosTold = sheets
      .map(({ phone }) => phone.answers.filter((one) => one.sent.record === 'PHOTO'))
      .flat();
    const savedOnes = told.filter((one) => one.answer === 'SAVED');
    const notSavedOnes = told.filter((one) => one.answer === 'NOT_SAVED');
    const onServer = await api.certification.findMany({ where: { projectId: p1 } });
    story.check(
      'AC-05-45, ADR-526 each phone’s sync is answered, one certification and its five photographs each: one certification is saved and the other is not, never both and never neither; every photograph is saved, those of the one not saved kept with it where it is held, so their files reach the server',
      [
        sentAtOnce,
        told.map((one) => one.answer).sort(),
        photosTold.map(({ answer }) => answer.answer),
      ],
      [[6, 6], ['NOT_SAVED', 'SAVED'], Array<string>(10).fill('SAVED')],
    );
    const [notSaved] = notSavedOnes;
    story.check(
      'ADR-469, 472 the one not saved is told why in plain words, that P1 already has a certification 730416, and that it is held on the server for review; nothing of the database’s own words reaches the phone',
      notSavedOnes.map((one) => ('reason' in one ? [one.reason, one.message] : [])),
      [
        [
          'CERTIFICATION_REFUSED',
          `Not saved: this project already has a certification 730416. ${held}`,
        ],
      ],
    );
    story.check(
      'P1 has one certification 730416, the one answered "saved", with its five photographs; the idempotency ledger holds it and the ten photographs, a row written with each',
      [
        onServer.map((each) => each.certNumber),
        onServer.map((each) => each.id).join() === savedOnes.map((one) => one.id).join(),
        (await ledger())
          .map(([recordId, ...rest]) => [recordId === savedOnes[0]?.id, ...rest.slice(0, 2)])
          .sort((left, right) => String(left[1]).localeCompare(String(right[1]))),
        await api.photo.count({ where: { certificationId: savedOnes[0]?.id ?? '' } }),
      ],
      [
        ['730416'],
        true,
        [
          [true, 'CERTIFICATION', 'SAVED'],
          ...Array.from({ length: 10 }, () => [false, 'PHOTO', 'SAVED']),
        ],
        5,
      ],
    );
    const loser = sheets.find(({ record }) => record.id === notSaved?.id);
    const heldCertification = await api.heldRecord.findFirstOrThrow({
      where: { sentId: notSaved?.id ?? '' },
    });
    story.check(
      'ADR-468, 471, 526 the other is held for a person, exactly as its phone sent it: under the id its phone made, with its project, its phone, the monitor who certified, the reason and the words its phone was told; its five photographs are kept with it, their files on the server; nobody has resolved it',
      [
        await heldRecords(),
        (await api.photo.findMany({ where: { heldRecordId: heldCertification.id } })).map(
          (photo) => [photo.view !== null, photo.uploadedAt !== null],
        ),
      ],
      [
        [
          {
            phone: loser?.phone.name ?? null,
            sentId: notSaved?.id ?? null,
            project: 'P1',
            monitor: named(loser?.record.certifiedById ?? null),
            reason: 'CERTIFICATION_REFUSED',
            message: `Not saved: this project already has a certification 730416. ${held}`,
            payload: JSON.parse(JSON.stringify(wires.get(notSaved?.id ?? ''))) as unknown,
            resolved: false,
          },
        ],
        Array.from({ length: 5 }, () => [true, true]),
      ],
    );
    story.check(
      'AC-05-46, REQ-308c its phone shows it as not saved and keeps it; the other phone holds nothing more',
      sheets
        .map(({ phone, record }) => [
          record.id === notSaved?.id,
          phone.notSaved.length,
          phone.holds.length,
          phone.waitingRecords.length,
        ])
        .sort((left, right) => Number(left[0]) - Number(right[0])),
      [
        [false, 0, 0, 0],
        [true, 1, 1, 0],
      ],
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      monday('06:30'),
      'Monday at the yard: Ana signs in on P1-COL-1, which takes her assignment and a block of load numbers',
    );
    const collections = await assigned(api, clock, dana, {
      workDate: '2026-10-12',
      projectId: p1,
      personId: ana.id,
      fieldEventKinds: ['COLLECTION'],
      deviceId: phones.ana.id,
    });
    await firstBlocks(story, phones.ana.id, timeZone, p1, ['LOAD']);
    if ((await taken(story, ana, phones.ana.id)) !== collections) {
      throw new Error('P1-COL-1 took another assignment than Ana’s.');
    }
    const anasPhone = story.phone({
      name: 'P1-COL-1',
      deviceId: phones.ana.id,
      monitorId: ana.id,
      assignmentId: collections,
      projectId: p1,
      lists: await story.lists.held({ assignmentId: collections, deviceId: phones.ana.id }),
      timeZone,
    });
    story.at(monday('08:15'), 'Ana scans the truck’s badge at 14 Heron St, offline');
    const first = anasPhone.begin('LOAD', 'COLLECTION', '730416');
    story.at(monday('08:40'), 'She completes the collection: 101001');
    const completed = anasPhone.complete(first, { number: made });
    if (!completed.saved) throw new Error('The collection was not saved on the phone.');
    const good = onTheWire({ record: 'FIELD_EVENT', fieldEvent: completed.event });
    if (good.record !== 'FIELD_EVENT') throw new Error('Not a field event.');
    story.at(
      monday('10:10'),
      'A second collection, 101002, names a debris type by an id the server doesn’t have',
    );
    const nowhere = uuidv7(clock.now());
    const bad = {
      record: 'FIELD_EVENT',
      fieldEvent: {
        ...good.fieldEvent,
        id: uuidv7(clock.now()),
        ticketNumber: '101002',
        startedAt: new Date(monday('09:50')).toISOString(),
        endedAt: new Date(monday('10:10')).toISOString(),
        formDebrisTypeId: nowhere,
      },
    } as const;
    anasPhone.hold({
      unplannedAssignments: [],
      passcodeUses: [],
      records: [bad],
      photos: [],
      lastUsed: [],
      files: [],
      filePartBytesAtMost: story.policy.mediaPartBytesAtMost,
    });

    story.at(monday('17:30'), 'Ana’s phone finds signal at the yard and syncs both');
    const before = (await heldRecords()).length;
    const sentByAna = await anasPhone.sync(story.server);
    const anasAnswers = anasPhone.answers.map((one) => one.answer);
    const wordsOf = (answer: RecordAnswer | undefined): string =>
      answer !== undefined && 'message' in answer ? answer.message : '';
    story.check(
      'AC-05-45 each record gets its own answer, in the order sent: 101001 is saved; 101002 is not, and its phone is told why in the server’s own plain words and that it is held, never the database’s',
      [
        sentByAna,
        anasAnswers.map((one) => [one.answer, 'reason' in one ? one.reason : null]),
        wordsOf(anasAnswers[1]),
        /constraint|foreign|violat|prisma|field_event/i.test(wordsOf(anasAnswers[1])),
      ],
      [
        2,
        [
          ['SAVED', null],
          ['NOT_SAVED', 'NAMES_NO_RECORD'],
        ],
        `Not saved: this record names something the server doesn’t have: its project, its monitor, its assignment, or something picked from a list. ${held}`,
        false,
      ],
    );
    const jobs = await api.reconciliationJob.findMany({
      where: { projectId: p1, trigger: 'SYNC' },
      include: { tickets: true },
    });
    story.check(
      'the refusal undid nothing else: the server holds 101001 alone, PENDING, with its row in the ledger and the job its arrival queued; 101002 is no field event, has no row in the ledger and queued nothing',
      [
        (await api.fieldEvent.findMany()).map((event) => [event.ticketNumber, event.status]),
        (await ledger())
          .filter(([, kind]) => kind === 'FIELD_EVENT')
          .map(([recordId, , answer, phone]) => [recordId === completed.event.id, answer, phone]),
        jobs.flatMap((job) => job.tickets.map((ticket) => ticket.ticketNumber)),
      ],
      [[['101001', 'PENDING']], [[true, 'SAVED', 'P1-COL-1']], ['101001']],
    );
    const kept = (await heldRecords()).at(-1);
    story.check(
      'ADR-468, 472 101002 is held for a person, exactly as sent, with what could be read of it: the id its phone made, P1, Ana, her phone',
      [(await heldRecords()).length - before, kept],
      [
        1,
        {
          phone: 'P1-COL-1',
          sentId: bad.fieldEvent.id,
          project: 'P1',
          monitor: 'Ana Brooks',
          reason: 'NAMES_NO_RECORD',
          message: wordsOf(anasAnswers[1]),
          payload: JSON.parse(JSON.stringify(bad)) as unknown,
          resolved: false,
        },
      ],
    );
    story.check(
      'AC-05-46 Ana’s phone shows 101002 as not saved and keeps it; 101001 has left it',
      [
        anasPhone.notSaved.map((one) => one.answer.id),
        anasPhone.holds,
        anasPhone.waitingRecords.length,
      ],
      [[bad.fieldEvent.id], [bad.fieldEvent.id], 0],
    );

    story.at(monday('17:40'), 'The phone sends 101002 again, as it was');
    const again = await synced(story, phones.ana.id, timeZone, { records: [bad] });
    story.check(
      'AC-05-15 the same thing sent again by the same phone is the same held record: it is answered as before, nothing is added, and there is still no field event 101002',
      [
        again.records.map((one) => [one.answer, 'reason' in one ? one.reason : null]),
        (await heldRecords()).length - before,
        await api.fieldEvent.count({ where: { ticketNumber: '101002' } }),
      ],
      [[['NOT_SAVED', 'NAMES_NO_RECORD']], 1, 0],
    );
    story.check(
      'each held record was written once, as the device key’s actor on the phone that synced (the monitor a record names may be nobody the server knows), and what was sent is kept out of the audit log: it is in the held record itself',
      (await auditOf('held_record')).map(([operation, actor, source, , payload]) => [
        operation,
        actor,
        source,
        payload,
      ]),
      Array(2).fill(['INSERT', 'Device key', 'DEVICE', '[kept out of the audit]']),
    );

    // ------------------------------------------------------------------------------------------
    story.at(
      tuesday('08:20'),
      'Ana photographs 101001’s pile again; her phone’s gallery writes the file again after it was fingerprinted. At the yard it syncs',
    );
    const pile = anasPhone.photograph({ of: { kind: 'FIELD_EVENT', id: completed.event.id } });
    const rewritten = Buffer.from(anasPhone.fileOf(pile.id));
    rewritten[rewritten.length - 1] = (rewritten.at(-1) ?? 0) ^ 0xff;
    anasPhone.swapFile(pile.id, rewritten);
    await anasPhone.sync(story.server);
    const pileFile = await api.photo.findUniqueOrThrow({ where: { id: pile.id } });
    story.check(
      'ADR-482 the photograph is saved; the file that came isn’t the one fingerprinted, so it is set aside, never kept as the photograph’s',
      [pileFile.uploadedAt, await api.setAsideFile.count({ where: { photoId: pile.id } })],
      [null, 1],
    );

    story.at(tuesday('09:00'), 'Dana opens what waits for a person');
    const danas = await story.backOffice.admin({ id: dana, email: danasEmail });
    const waiting = await danas.answered(listHeldRecordsEndpoint, { query: { waiting: 'true' } });
    const setAside = await danas.answered(listSetAsideFilesEndpoint, { query: { projectId: p1 } });
    story.check(
      'AC-10-73 she reads the two records held, oldest first, each as sent and as what kind, the certification with its five photographs; and the file set aside beside its photograph, which belongs to 101001 and whose own file hasn’t come',
      [
        waiting.heldRecords.map((one) => [
          named(one.deviceId),
          one.sentAs,
          one.reason,
          one.photos.length,
        ]),
        setAside.setAsideFiles.map((one) => [
          one.photoId === pile.id,
          one.photograph.belongsTo.kind,
          one.photograph.belongsTo.id === completed.event.id,
          one.photograph.kept,
        ]),
      ],
      [
        [
          [loser?.phone.name ?? null, 'CERTIFICATION', 'CERTIFICATION_REFUSED', 5],
          ['P1-COL-1', 'FIELD_EVENT', 'NAMES_NO_RECORD', 0],
        ],
        [[true, 'FIELD_EVENT', true, false]],
      ],
    );

    story.at(
      tuesday('09:10'),
      'One sheet number typed on two phones: the second truck’s sheet is 730418. Dana saves it so, and 101002 with the debris type Ana meant',
    );
    const loserRecord = loser?.record;
    if (loserRecord === undefined) throw new Error('No certification was held.');
    const [certificationHeld, collectionHeld] = waiting.heldRecords;
    const savedCertification = await danas.answered(saveHeldRecordEndpoint, {
      ids: { heldRecordId: certificationHeld?.id ?? '' },
      json: {
        record: {
          record: 'CERTIFICATION',
          certification: {
            ...(
              onTheWire({ record: 'CERTIFICATION', certification: loserRecord }) as {
                certification: object;
              }
            ).certification,
            certNumber: '730418',
          },
        },
        note: 'Sheet 730416 was typed on both phones: this truck’s sheet is 730418',
      },
    });
    const savedCollection = await danas.answered(saveHeldRecordEndpoint, {
      ids: { heldRecordId: collectionHeld?.id ?? '' },
      json: {
        record: {
          ...bad,
          fieldEvent: { ...bad.fieldEvent, formDebrisTypeId: good.fieldEvent.formDebrisTypeId },
        },
        note: 'Vegetative, as on 101001',
      },
    });
    const certifications = await api.certification.findMany({
      where: { projectId: p1 },
      orderBy: { certNumber: 'asc' },
    });
    story.check(
      'AC-10-74 each is saved under the id its phone made, as its phone’s record, written as Dana: P1 has 730416 and 730418, each with five photographs, and 101002 is a field event, PENDING; each held record stays as sent, marked saved as corrected by her',
      [
        certifications.map((each) => [
          each.certNumber,
          named(each.deviceId),
          each.id === loserRecord.id,
        ]),
        await api.photo.count({ where: { certificationId: loserRecord.id } }),
        await api.photo.count({ where: { heldRecordId: { not: null } } }),
        (await api.fieldEvent.findMany({ orderBy: { ticketNumber: 'asc' } })).map((event) => [
          event.ticketNumber,
          event.status,
          named(event.deviceId),
        ]),
        [savedCertification.record, savedCollection.record].map((one) => [
          named(one.resolvedById),
          one.resolution,
        ]),
      ],
      [
        [
          [
            '730416',
            sheets.find(({ record }) => record.id !== loserRecord.id)?.phone.name ?? null,
            false,
          ],
          ['730418', loser?.phone.name ?? null, true],
        ],
        5,
        0,
        [
          ['101001', 'PENDING', 'P1-COL-1'],
          ['101002', 'PENDING', 'P1-COL-1'],
        ],
        [
          [
            'Dana Reyes',
            'Saved as corrected: a certification under the id its phone made, with its photographs.',
          ],
          [
            'Dana Reyes',
            'Saved as corrected: a field event under the id its phone made, with its photographs.',
          ],
        ],
      ],
    );

    story.at(tuesday('17:00'), 'Both phones are brought in and turned in with the master passcode');
    const certifyingTurnIn = await story.underPasscode.turnIn(loser?.phone ?? samsPhone);
    const anasFirstTry = await story.underPasscode.turnIn(anasPhone);
    story.check(
      'AC-02-58, ADR-526 the certifying phone is turned in; Ana’s is not: the server doesn’t have the pile’s own file',
      [
        certifyingTurnIn.turnedIn,
        anasFirstTry.turnedIn,
        anasFirstTry.turnedIn ? null : anasFirstTry.notOnTheServer.photos.length,
      ],
      [true, false, 1],
    );
    story.at(
      tuesday('17:05'),
      'Dana reads the file set aside: it is what the phone has, and the phone’s own will not come. She closes it, and Ana’s phone is turned in',
    );
    const closed = await danas.answered(closeSetAsideFileEndpoint, {
      ids: { setAsideFileId: setAside.setAsideFiles[0]?.id ?? '' },
      json: { note: 'The gallery wrote the file again: this is all the phone has' },
    });
    const anasTurnIn = await story.underPasscode.turnIn(anasPhone);
    story.check(
      'AC-10-75, AC-02-58 the file set aside is closed by Dana, kept beside its photograph; then Ana’s phone is turned in and told to wipe',
      [named(closed.record.resolvedById), anasTurnIn.turnedIn, anasTurnIn.wipe],
      ['Dana Reyes', true, true],
    );
  },
};

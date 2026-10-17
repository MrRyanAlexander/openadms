// The dispatch board, written as the back office writes it: through the API's `Assignments`
// (BACKLOG C97, C102; ADR-429). No story writes an assignment by hand: one made on a phone
// under the master passcode (unplanned) is received as the phone reports it (`unplanned`;
// ADR-457), and every other use of the passcode a phone logged likewise (`loggedUse`;
// ADR-464). A phone takes its monitor's assignment by signing them in (`taken`; ADR-444).
//
// **What a phone reports, it reports in a sync** (BACKLOG 2.6.2 part 4; ADR-475): `synced` is
// one sync of the contract's from an enrolled phone, through the API's own `Sync`, for what a
// phone sends before the story has built it, or apart from its day's records: an unplanned
// assignment, a use of the passcode, the first block of a series (`firstBlocks`), one record
// (`sentAlone`).
import {
  Assignments,
  type Clock,
  type NewAssignment,
  type ReportedPasscodeUse,
  type ReportedUnplannedAssignment,
} from '@open-adms/api';
import {
  syncAnswerRead,
  syncSentSchema,
  type PhotoAnswer,
  type RecordAnswer,
  type SyncAnswered,
  type SyncSent,
} from '@open-adms/contracts';
import type { Database, NumberSeries } from '@open-adms/db';

import { utcOffsetMinutes } from '../clock.ts';
import { onTheWire, type HeldRecord, type RecordedPhoto } from '../device.ts';
import { uuidv7 } from '../ids.ts';
import type { StoryContext, StoryMonitor } from '../runner.ts';

// The assignment's id, once the person who dispatches has written it; a refusal stops the story.
export async function assigned(
  api: Database,
  clock: Clock,
  by: string,
  assignment: NewAssignment,
): Promise<string> {
  const outcome = await new Assignments(api, clock).assign(by, assignment);
  if (!outcome.saved) throw new Error(outcome.refusal.message);
  return outcome.record.id;
}

// The monitor signs in on that phone, online, and the phone takes their assignment for the
// project's own day (AC-02-35; ADR-444): its id, as the server answered it. A story that tells of
// a monitor at work on a phone starts here; one answered no assignment stops.
export async function taken(
  story: StoryContext,
  monitor: StoryMonitor,
  onPhone: string,
): Promise<string> {
  // On the clock the story's phones are on, which a story told again inside another has of its
  // own (`phonesOn`).
  const answered = await story.signedIn(monitor, onPhone);
  if (!answered.taken) {
    throw new Error(`${monitor.name}’s phone took no assignment: ${answered.why}.`);
  }
  return answered.assignment.id;
}

// One sync from an enrolled phone, now by the story's clock, as the contract has it and through
// the API's own `Sync`: sent as JSON, read as the endpoint's boundary reads it, and what comes
// back read by the client's own rule. The phone states the version of the master passcode in
// force (it was enrolled under it) and no lists, so nothing more is brought. What comes back
// that is no answer to what was sent stops the story.
export async function synced(
  story: StoryContext,
  deviceId: string,
  timeZone: string,
  carries: Partial<
    Pick<SyncSent, 'unplannedAssignments' | 'passcodeUses' | 'records' | 'photos' | 'lastUsed'>
  >,
): Promise<SyncAnswered> {
  const now = story.clock.now();
  const inForce = await story.api.masterPasscode.findFirstOrThrow({
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const sent: SyncSent = {
    clockAt: now.toISOString(),
    deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, now),
    unplannedAssignments: [],
    passcodeUses: [],
    records: [],
    photos: [],
    lastUsed: [],
    ...carries,
    holds: { masterPasscodeVersion: inForce.version, listsProjectId: null },
  };
  const wire: unknown = JSON.parse(JSON.stringify(sent));
  const { answered } = await story.server.received(deviceId, syncSentSchema.parse(wire));
  const read = syncAnswerRead(sent, JSON.parse(JSON.stringify(answered)));
  if (read === null) throw new Error('What came back is no answer to the sync sent.');
  return read;
}

// A phone that makes numbers takes its first block of each series, at the yard, online: a sync
// that reports it has used none (ADR-065). A series not topped up stops the story.
export async function firstBlocks(
  story: StoryContext,
  deviceId: string,
  timeZone: string,
  projectId: string,
  series: readonly NumberSeries[],
): Promise<SyncAnswered['numbers']> {
  const { numbers } = await synced(story, deviceId, timeZone, {
    lastUsed: series.map((each) => ({ projectId, series: each, lastUsedNumber: null })),
  });
  const not = numbers.find(({ toppedUp }) => !toppedUp);
  if (not !== undefined) throw new Error(`The phone was given no block of ${not.series}.`);
  return numbers;
}

// One record a phone sends by itself, in a sync of its own: its answer.
export async function sentAlone(
  story: StoryContext,
  timeZone: string,
  record: HeldRecord,
): Promise<RecordAnswer> {
  const wire = onTheWire(record);
  const [answer] = (await synced(story, phoneOf(record), timeZone, { records: [wire] })).records;
  if (answer === undefined) throw new Error('The record was not answered.');
  return answer;
}

// One photograph's record a phone sends by itself, in a sync of its own, after its record's:
// its answer (ADR-481).
export async function photoSentAlone(
  story: StoryContext,
  timeZone: string,
  deviceId: string,
  photo: RecordedPhoto,
): Promise<PhotoAnswer> {
  const [answer] = (await synced(story, deviceId, timeZone, { photos: [photo] })).photos;
  if (answer === undefined) throw new Error('The photograph was not answered.');
  return answer;
}

// The phone that made a record, as the harness's own records say it.
function phoneOf(record: HeldRecord): string {
  switch (record.record) {
    case 'FIELD_EVENT':
      return record.fieldEvent.deviceId;
    case 'SCALE_RECEIPT':
      return record.scaleReceipt.deviceId;
    case 'INCIDENT':
      return record.incident.deviceId;
    case 'DROP_OFF_LOG':
      return record.dropOffLog.deviceId;
    case 'SURVEY':
      return record.survey.deviceId;
    case 'ROE':
      return record.roe.deviceId;
    case 'CERTIFICATION':
      return record.certification.deviceId;
  }
}

// What whoever holds the master passcode sets a phone up for, when its monitor has none.
export type SetUpOnPhone = Pick<ReportedUnplannedAssignment, 'projectId' | 'personId'> &
  Partial<
    Pick<
      ReportedUnplannedAssignment,
      'fieldEventKinds' | 'certifying' | 'formDocumentTypes' | 'siteId' | 'payItemIds' | 'occasion'
    >
  >;

// The phone is set up under the master passcode, now by the story's clock, and reports it in a
// sync: the unplanned assignment's id, which the phone made (AC-02-38, AC-05-40; ADR-457). A
// report that isn't saved stops the story. `madeAt`: when it was set up, where the phone had no
// connection then and reports it only now.
export async function unplanned(
  story: StoryContext,
  deviceId: string,
  timeZone: string,
  work: SetUpOnPhone,
  madeAt: Date = story.clock.now(),
): Promise<string> {
  const id = uuidv7(madeAt);
  const { unplannedAssignments } = await synced(story, deviceId, timeZone, {
    unplannedAssignments: [
      {
        projectId: work.projectId,
        personId: work.personId,
        fieldEventKinds: [...(work.fieldEventKinds ?? [])],
        certifying: work.certifying ?? false,
        formDocumentTypes: [...(work.formDocumentTypes ?? [])],
        siteId: work.siteId ?? null,
        payItemIds: [...(work.payItemIds ?? [])],
        occasion: work.occasion ?? 'SETUP',
        id,
        madeAt: madeAt.toISOString(),
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, madeAt),
      },
    ],
  });
  const [received] = unplannedAssignments;
  if (received?.answer !== 'SAVED') {
    throw new Error(`The unplanned assignment was answered ${JSON.stringify(received)}.`);
  }
  return id;
}

// The phone reports in a sync, now by the story's clock, a use of the master passcode it logged
// with no connection at `loggedAt`: a switch to a monitor who has their own assignment, a
// session opened on it, or a wrong try (AC-02-23; ADR-464). The id the phone gave it, and what
// the server answered.
export async function loggedUse(
  story: StoryContext,
  deviceId: string,
  timeZone: string,
  logged: Pick<ReportedPasscodeUse, 'use' | 'personId' | 'loggedAt'> & { readonly id?: string },
): Promise<{ readonly id: string; readonly answer: string }> {
  const id = logged.id ?? uuidv7(logged.loggedAt);
  const { passcodeUses } = await synced(story, deviceId, timeZone, {
    passcodeUses: [
      {
        use: logged.use,
        personId: logged.personId,
        id,
        loggedAt: logged.loggedAt.toISOString(),
        deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, logged.loggedAt),
      },
    ],
  });
  const [received] = passcodeUses;
  if (received === undefined) throw new Error('The use was not answered.');
  return { id, answer: received.answer };
}

// The dispatch board, written as the back office writes it: through the API's `Assignments`
// (BACKLOG C97, C102; ADR-429). No story writes an assignment by hand: one made on a phone
// under the master passcode (unplanned) is received as the phone reports it, through the API's
// `UnplannedAssignments` (`unplanned`; ADR-457). A phone takes its monitor's assignment by
// signing them in (`taken`; ADR-444).
import {
  Assignments,
  UnplannedAssignments,
  type Clock,
  type NewAssignment,
  type ReportedUnplannedAssignment,
} from '@open-adms/api';
import type { Database } from '@open-adms/db';

import { utcOffsetMinutes } from '../clock.ts';
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
  // On the clock the story is told on, which a story told again inside another has of its own.
  const answered = await story.signedIn(monitor, onPhone, story.clock.now());
  if (!answered.taken) {
    throw new Error(`${monitor.name}’s phone took no assignment: ${answered.why}.`);
  }
  return answered.assignment.id;
}

// What whoever holds the master passcode sets a phone up for, when its monitor has none.
export type SetUpOnPhone = Pick<ReportedUnplannedAssignment, 'projectId' | 'personId'> &
  Partial<
    Pick<
      ReportedUnplannedAssignment,
      'fieldEventKinds' | 'certifying' | 'formDocumentTypes' | 'siteId' | 'payItemIds' | 'occasion'
    >
  >;

// The phone is set up under the master passcode, now by the story's clock, and reports it: the
// unplanned assignment's id, which the phone made (AC-02-38, AC-05-40; ADR-457). A report that
// isn't saved stops the story.
export async function unplanned(
  api: Database,
  clock: Clock,
  deviceId: string,
  timeZone: string,
  work: SetUpOnPhone,
): Promise<string> {
  const madeAt = clock.now();
  const id = uuidv7(madeAt);
  const received = await new UnplannedAssignments(api, {
    clock,
    requestNow: () => undefined,
  }).received(deviceId, {
    fieldEventKinds: [],
    certifying: false,
    formDocumentTypes: [],
    siteId: null,
    payItemIds: [],
    occasion: 'SETUP',
    ...work,
    id,
    madeAt,
    deviceUtcOffsetMinutes: utcOffsetMinutes(timeZone, madeAt),
  });
  if (received.answer !== 'SAVED') {
    throw new Error(`The unplanned assignment was answered ${JSON.stringify(received)}.`);
  }
  return id;
}

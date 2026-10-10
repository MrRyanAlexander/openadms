// The dispatch board, written as the back office writes it: through the API's `Assignments`
// (BACKLOG C97, C102; ADR-429). No story writes a planned assignment by hand; one made on a
// phone under the master passcode (unplanned) is still written as the phone would send it, until
// the sync receives it (2.5.x). A phone takes its monitor's assignment by signing them in
// (`taken`; ADR-444).
import { Assignments, type Clock, type NewAssignment } from '@open-adms/api';
import type { Database } from '@open-adms/db';

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

// The dispatch board, written as the back office writes it: through the API's `Assignments`
// (BACKLOG C97, C102; ADR-429). No story writes a planned assignment by hand; one made on a
// phone under the master passcode (unplanned) is still written as the phone would send it, until
// the sync receives it (2.5.x).
import { Assignments, type Clock, type NewAssignment } from '@open-adms/api';
import type { Database } from '@open-adms/db';

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

// The sample's people, as whoever loads it makes them and puts them away (sample-projects.ts).
//
// **Made on the server**, as `pnpm installer:admin` makes the firm's first admin (ADR-415; the API's
// `ServerAdmin`): whoever loads the sample runs it on the firm's own server, beside the API's
// settings and keys, and that is its whole proof. Only the sample's two managers/analysts are
// made so (an admin creates every other person, and the firm may have none yet): each with their
// grants and a password made up here, held in this process's memory and nowhere else, never
// printed. Each write names the person themselves, with the reason said, as `ServerAdmin`'s do,
// so the audit log shows it was done on the server and for whom. They then sign in through the
// API, as anybody does, and set their authenticator up. Its monitors are created on its yard
// phone under the master passcode, as every monitor is (ADR-442), each with a password made up
// and never kept.
//
// **Put away on the server** once the sample is loaded: every one of its people archived, their
// sessions ended, so that nothing of the sample signs in again (an admin may take one out of the
// archive and set a password, as for anybody who left). Again each as themselves, with the
// reason said. Never an admin: the firm's last admin can't be archived (the database's own
// rule), and the sample makes none.
import type { Database } from '@open-adms/db';
import { uuidv7, type PermissionName } from '@open-adms/domain';

import { madeUpPassword, type OfficeBrowser } from '../office-browser.ts';
import type { StoryContext } from '../runner.ts';

export const sampleReason = 'Done on the server, by the sample projects’ loader.';
export const archivedReason =
  'The sample projects are loaded: their people are archived, by the sample projects’ loader.';

export interface SamplePerson {
  readonly name: string;
  readonly email: string;
  readonly grants: readonly PermissionName[];
}

// A manager/analyst of the sample's, made on the server with their grants and a password of
// their own, signed in at their browser through the API.
export async function madeOnTheServer(
  story: StoryContext,
  person: SamplePerson,
): Promise<OfficeBrowser> {
  const password = madeUpPassword();
  const passwordHash = await story.passwordHasher.hash(password);
  const id = uuidv7(story.clock.now());
  await story.api.$write(
    { actorId: id, source: 'BACK_OFFICE', reason: sampleReason },
    async (tx) => {
      await tx.user.create({
        data: { id, name: person.name, role: 'MANAGER_ANALYST', email: person.email },
      });
      for (const permission of person.grants) {
        await tx.userPermission.create({ data: { userId: id, permission } });
      }
      await tx.userCredential.create({ data: { userId: id, passwordHash } });
    },
  );
  return story.backOffice.signedIn({ id, email: person.email }, password);
}

// Every one of the sample's people archived and signed out everywhere, each as themselves.
export async function archived(api: Database, now: Date, people: readonly string[]): Promise<void> {
  for (const userId of people) {
    await api.$write(
      { actorId: userId, source: 'BACK_OFFICE', reason: archivedReason },
      async (tx) => {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.user.update({ where: { id: userId }, data: { archivedAt: now } });
      },
    );
  }
}

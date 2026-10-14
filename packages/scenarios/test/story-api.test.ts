// A story's own API and the way to it (BACKLOG 2.7.1 part 1; ADR-491): the API's process, on a
// story's database and clock, reached only over HTTPS through the local stack's proxy, under
// the stack's own authority. Needs the local stack and an installation, as the stories do.
import { request as overHttp } from 'node:http';
import { request as overHttps } from 'node:https';
import process from 'node:process';

import {
  challengePhoneEndpoint,
  createPersonEndpoint,
  currentSessionEndpoint,
  endPersonSessionsEndpoint,
  findClientsEndpoint,
  sendPhotoFilePartEndpoint,
  syncSentSchema,
  turnInSentSchema,
} from '@open-adms/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { uuidv7 } from '../src/ids.ts';
import { pathOf, storiesHostname } from '../src/over-https.ts';
import { Runner, type Story, type StoryContext } from '../src/runner.ts';
import { assigned } from '../src/stories/board.ts';
import { setUpP1 } from '../src/stories/p1.ts';
import { StoryTemplate } from '../src/story-database.ts';

const httpsPort = Number(process.env['ADMS_HTTPS_PORT'] ?? '443');
const httpPort = Number(process.env['ADMS_HTTP_PORT'] ?? '80');

let template: StoryTemplate;

beforeAll(async () => {
  template = await StoryTemplate.create();
});

afterAll(async () => {
  await template.drop();
});

const told = {
  timeZone: 'America/New_York',
  start: '2026-10-12T06:30:00-04:00',
};

async function run(story: Story) {
  const lines: string[] = [];
  const result = await new Runner((line) => lines.push(line), { template }).run(story);
  return { result, lines };
}

describe('a story’s API, over HTTPS through the stack’s proxy', () => {
  it('a phone the story enrolled proves itself there with its own key; the same signed answer sent again is refused by the one code; a second run while one holds the port is told so', async () => {
    let second: Awaited<ReturnType<typeof run>> | undefined;
    const { result, lines } = await run({
      ...told,
      name: 'proves',
      title: 'a phone proves itself over HTTPS',
      async run(story) {
        const phone = await story.enrolled('P1-COL-1');
        const proof = await story.proofs.proves(phone.id);
        story.check('proven', [proof.answer, await proof.again()], ['PROVEN', 'PHONE_NOT_PROVEN']);
        story.check(
          'the challenge it answered is kept on its record, as the device key’s own act',
          (await story.api.device.findUniqueOrThrow({ where: { id: phone.id } }))
            .lastAnsweredChallengeMadeAt,
          story.clock.now(),
        );
        second = await run({
          ...told,
          name: 'at-once',
          title: 'a second run while the first holds the port',
          async run(other) {
            const its = await other.enrolled('P1-COL-2');
            await other.proofs.proves(its.id);
          },
        });
      },
    });
    expect(lines.filter((line) => line.includes('✗'))).toEqual([]);
    expect(result).toMatchObject({ passed: 2, failed: 0, error: undefined });
    expect(second?.result.error).toMatch(
      /^The stories’ API could not listen at 127\.0\.0\.1:3180; another run of the stories may hold it/,
    );
  });

  it('a request on the story’s clock and one on another, at once, stop the story: its API has one clock; one after the other, each is answered, the second by the API started again', async () => {
    const empty = (at: Date) =>
      syncSentSchema.parse({
        clockAt: at.toISOString(),
        deviceUtcOffsetMinutes: -240,
        unplannedAssignments: [],
        passcodeUses: [],
        records: [],
        photos: [],
        lastUsed: [],
        holds: { masterPasscodeVersion: 1, listsProjectId: null },
      });
    let sentInTurn: unknown;
    const { result } = await run({
      ...told,
      name: 'two-clocks',
      title: 'two requests at once on two clocks',
      async run(story) {
        const phone = await story.enrolled('P1-COL-1');
        const later = { now: () => new Date('2026-10-12T17:30:00-04:00') };
        const yard = story.phonesOn(later).server;
        sentInTurn = [
          (await story.server.received(phone.id, empty(story.clock.now()))).answered.records,
          (await yard.received(phone.id, empty(later.now()))).answered.records,
        ];
        sentInTurn = [
          sentInTurn,
          (
            await story.api.sync.findMany({
              orderBy: { startedAt: 'asc' },
              select: { startedAt: true },
            })
          ).map(({ startedAt }) => startedAt.toISOString()),
        ];
        await Promise.all([
          story.server.received(phone.id, empty(story.clock.now())),
          yard.received(phone.id, empty(later.now())),
        ]);
      },
    });
    // Each sync kept with the server's clock it was sent on: the story's, then the yard's.
    expect(sentInTurn).toEqual([
      [[], []],
      ['2026-10-12T10:30:00.000Z', '2026-10-12T21:30:00.000Z'],
    ]);
    expect(result.error).toBe(
      'Two of the story’s requests at once on two clocks: its API has one.',
    );
  });

  it('ADR-505 one phone’s requests at once wait on its one proof, each answered; a request sent once the story has ended is refused, never served by an API started again', async () => {
    const empty = (at: Date) =>
      syncSentSchema.parse({
        clockAt: at.toISOString(),
        deviceUtcOffsetMinutes: -240,
        unplannedAssignments: [],
        passcodeUses: [],
        records: [],
        photos: [],
        lastUsed: [],
        holds: { masterPasscodeVersion: 1, listsProjectId: null },
      });
    let late: (() => Promise<unknown>) | undefined;
    const { result } = await run({
      ...told,
      name: 'one-phone-at-once',
      title: 'one phone’s syncs at once',
      async run(story) {
        const phone = await story.enrolled('P1-COL-1');
        const syncs = await Promise.all(
          [1, 2, 3, 4].map(() => story.server.received(phone.id, empty(story.clock.now()))),
        );
        story.check(
          'four syncs at once from one phone, each answered',
          [syncs.length, await story.api.sync.count({ where: { deviceId: phone.id } })],
          [4, 4],
        );
        const { server } = story;
        late = () => server.received(phone.id, empty(story.clock.now()));
      },
    });
    expect(result).toMatchObject({ passed: 1, failed: 0, error: undefined });
    await expect(late?.()).rejects.toThrow('The story has ended: its API takes no more requests.');
  });

  // P1, Dana, and Ana created on an enrolled phone at its endpoint, with her Monday on it.
  const anasMonday = async (story: StoryContext) => {
    const phone = await story.enrolled('P1-COL-1');
    const dana = uuidv7(story.clock.now());
    const p1 = await story.api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({ data: { id: dana, name: 'Dana Reyes', role: 'ADMIN' } });
      return (await setUpP1(tx, story.policy)).project;
    });
    const ana = await story.monitor('Ana Brooks', phone.id);
    const assignmentId = await assigned(story.api, story.clock, dana, {
      workDate: '2026-10-12',
      projectId: p1,
      personId: ana.id,
      fieldEventKinds: ['COLLECTION'],
      deviceId: phone.id,
    });
    return { phone: phone.id, ana, assignmentId };
  };

  it('a monitor created and signed in at their endpoints; the lists read with the session the phone holds for them, beside its own token, are the lists of the assignment it takes', async () => {
    let seen: unknown;
    const { result, lines } = await run({
      ...told,
      name: 'lists',
      title: 'a monitor signs in and the phone reads its lists',
      async run(story) {
        const { phone, ana, assignmentId } = await anasMonday(story);
        const took = await story.signedIn(ana, phone);
        const lists = await story.lists.held({ assignmentId, deviceId: phone });
        const sessions = await story.api.session.findMany({ select: { userId: true } });
        seen = [
          took.taken ? took.assignment.id === assignmentId : took.why,
          ana.monitorNumber.startsWith('M'),
          lists.setupVersion,
          sessions.map(({ userId }) => userId === ana.id),
        ];
      },
    });
    expect(lines.filter((line) => line.includes('✗'))).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(seen).toEqual([true, true, 1, [true]]);
  });

  it('a session opened under the master passcode is the one the phone holds: its monitor’s lists are read with it; a phone enrolled at a moment of its own is enrolled then', async () => {
    let seen: unknown;
    const { result, lines } = await run({
      ...told,
      name: 'passcode-session',
      title: 'a session under the passcode, then the lists',
      async run(story) {
        const { phone, ana, assignmentId } = await anasMonday(story);
        const took = await story.underPasscode.session(ana, phone, 'AS_MONITOR');
        const lists = await story.lists.held({ assignmentId, deviceId: phone });
        const evening = new Date('2026-10-11T17:00:00-04:00');
        const spare = await story.enrolled('P1-COL-2', evening);
        seen = [
          took.taken ? took.assignment.id === assignmentId : took.why,
          lists.setupVersion,
          (await story.api.device.findUniqueOrThrow({ where: { id: spare.id } })).enrolledAt,
        ];
      },
    });
    expect(lines.filter((line) => line.includes('✗'))).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(seen).toEqual([true, 1, new Date('2026-10-11T21:00:00.000Z')]);
  });

  it('lists asked on a phone nobody is signed in on, or for an assignment the phone doesn’t take, stop the story', async () => {
    const nobody = await run({
      ...told,
      name: 'nobody-signed-in',
      title: 'lists with nobody signed in',
      async run(story) {
        const { phone, assignmentId } = await anasMonday(story);
        await story.lists.held({ assignmentId, deviceId: phone });
      },
    });
    expect(nobody.result.error).toBe('phoneLists was asked on a phone nobody is signed in on.');
    let taken = '';
    const another = await run({
      ...told,
      name: 'another-assignment',
      title: 'lists of another assignment',
      async run(story) {
        const { phone, ana, assignmentId } = await anasMonday(story);
        taken = assignmentId;
        await story.signedIn(ana, phone);
        await story.lists.held({ assignmentId: uuidv7(story.clock.now()), deviceId: phone });
      },
    });
    expect(another.result.error).toBe(
      `The phone’s lists are of ${taken}, not of the assignment the story names.`,
    );
  });

  it('an answer that isn’t a 200 stops the story, saying what came back', async () => {
    const { result } = await run({
      ...told,
      name: 'refused',
      title: 'a turn-in under a passcode that isn’t the firm’s',
      async run(story) {
        const phone = await story.enrolled('P1-COL-1');
        await story.server.turnIn?.(
          phone.id,
          turnInSentSchema.parse({
            passcode: 'not-the-firms-passcode',
            holds: {
              unplannedAssignments: [],
              passcodeUses: [],
              records: [],
              held: [],
              photos: [],
            },
            lastUsed: [],
          }),
        );
      },
    });
    expect(result.error).toBe('turnInPhone was answered 401 MASTER_PASSCODE_REFUSED.');
  });

  it('a phone the story never enrolled can’t prove itself', async () => {
    const { result } = await run({
      ...told,
      name: 'stranger',
      title: 'a phone nobody enrolled',
      async run(story) {
        await story.proofs.proves('00000000-0000-7000-8000-00000000000a');
      },
    });
    expect(result.error).toBe('A phone the story never enrolled can’t prove itself.');
  });

  it('its name answers only over HTTPS, under the stack’s own authority: plain HTTP is sent to HTTPS, and the machine’s own authorities don’t know its certificate', async () => {
    const plain = await new Promise<{ status: number; location: string | undefined }>(
      (resolve, reject) => {
        const asked = overHttp(
          {
            host: '127.0.0.1',
            port: httpPort,
            path: '/health',
            headers: { host: storiesHostname },
          },
          (answer) => {
            answer.resume();
            resolve({ status: answer.statusCode ?? 0, location: answer.headers.location });
          },
        );
        asked.on('error', reject);
        asked.end();
      },
    );
    expect(plain).toEqual({ status: 308, location: `https://${storiesHostname}/health` });
    await expect(
      new Promise((resolve, reject) => {
        const asked = overHttps(
          { host: '127.0.0.1', port: httpsPort, path: '/health', servername: storiesHostname },
          resolve,
        );
        asked.on('error', reject);
        asked.end();
      }),
    ).rejects.toThrow();
  });
});

describe('the back office and the viewers at their browsers, over HTTPS (ADR-496)', () => {
  const danasEmail = 'dana.reyes@gates.example';
  const luissEmail = 'luis.ortega@gates.example';
  // Dana, the firm's first admin, and Luis, a manager/analyst, written as the stories write them.
  const people = async (story: StoryContext) => {
    const dana = uuidv7(story.clock.now());
    const luis = await story.api.$write({ actorId: dana, source: 'BACK_OFFICE' }, async (tx) => {
      await tx.user.create({
        data: { id: dana, name: 'Dana Reyes', role: 'ADMIN', email: danasEmail },
      });
      return (
        await tx.user.create({
          data: { name: 'Luis Ortega', role: 'MANAGER_ANALYST', email: luissEmail },
        })
      ).id;
    });
    return { dana: { id: dana, email: danasEmail }, luis: { id: luis, email: luissEmail } };
  };
  const credentialOf = async (story: StoryContext, userId: string) => {
    const held = await story.api.userCredential.findUniqueOrThrow({ where: { userId } });
    return [held.passwordHash !== null, held.twoStepSecret !== null, held.passwordChangeRequired];
  };
  const sessionsOf = (story: StoryContext, userId: string) =>
    story.api.session.count({ where: { userId, revokedAt: null } });

  it('the first admin’s password is set on the server and she sets her authenticator up; a manager/analyst she created takes his first password from her, sets his own and his authenticator; each is then served as themselves, and asked for again is the browser they hold', async () => {
    let seen: unknown;
    const { result, lines } = await run({
      ...told,
      name: 'office',
      title: 'Dana and Luis sign in at their browsers',
      async run(story) {
        const who = await people(story);
        const dana = await story.backOffice.admin(who.dana);
        const luis = await story.backOffice.person(dana, who.luis);
        seen = [
          await credentialOf(story, who.dana.id),
          await credentialOf(story, who.luis.id),
          (await dana.answered(currentSessionEndpoint)).user.name,
          (await luis.answered(currentSessionEndpoint)).user.role,
          [await sessionsOf(story, who.dana.id), await sessionsOf(story, who.luis.id)],
          (await story.backOffice.admin(who.dana)) === dana,
          (await story.backOffice.person(dana, who.luis)) === luis,
        ];
      },
    });
    expect(lines.filter((line) => line.includes('✗'))).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(seen).toEqual([
      [true, true, false],
      [true, true, false],
      'Dana Reyes',
      'MANAGER_ANALYST',
      [1, 1],
      true,
      true,
    ]);
  });

  it('the story’s clock moves on: past the access token’s minutes the browser takes a new one with its refresh token, in the same session; past the session’s quiet half hour the person signs in again with the next code', async () => {
    let seen: unknown;
    const { result } = await run({
      ...told,
      name: 'stale',
      title: 'Dana’s session through a morning',
      async run(story) {
        const who = await people(story);
        const dana = await story.backOffice.admin(who.dana);
        const asked = async (): Promise<unknown[]> => [
          (await dana.answered(currentSessionEndpoint)).user.name,
          await story.api.session.count({ where: { userId: who.dana.id } }),
        ];
        const first = await asked();
        story.at('2026-10-12T06:45:00-04:00', 'fifteen minutes on');
        const refreshed = await asked();
        story.at('2026-10-12T09:00:00-04:00', 'two hours and a quarter on');
        seen = [first, refreshed, await asked()];
      },
    });
    expect(result.error).toBeUndefined();
    expect(seen).toEqual([
      ['Dana Reyes', 1],
      ['Dana Reyes', 1],
      ['Dana Reyes', 2],
    ]);
  });

  it('a refusal is answered as it came where the story asks for any answer, and stops the story where it asks for a 200; a browser nobody signed in at is refused at the door', async () => {
    let seen: unknown;
    const { result } = await run({
      ...told,
      name: 'office-refused',
      title: 'Luis asks for what he isn’t granted',
      async run(story) {
        const who = await people(story);
        const dana = await story.backOffice.admin(who.dana);
        const luis = await story.backOffice.person(dana, who.luis);
        const refused = await luis.asked(findClientsEndpoint);
        const nobody = await story.backOffice.signedOut.asked(currentSessionEndpoint);
        seen = [
          [refused.status, refused.body],
          [nobody.status, (nobody.body as { code: string }).code],
        ];
        await luis.answered(createPersonEndpoint, {
          json: { name: 'Priya Shah', email: 'priya.shah@gates.example', role: 'ADMIN' },
        });
      },
    });
    expect(seen).toMatchObject([
      [403, { code: 'NOT_ALLOWED' }],
      [401, 'NOT_SIGNED_IN'],
    ]);
    expect(result.error).toBe('createPerson was answered 403 NOT_ALLOWED.');
  });

  it('a person whose sessions were ended signs in again, but not with a code their authenticator already gave: the story is stopped until its clock moves on', async () => {
    const { result } = await run({
      ...told,
      name: 'same-step',
      title: 'Luis signed out by Dana within his code’s thirty seconds',
      async run(story) {
        const who = await people(story);
        const dana = await story.backOffice.admin(who.dana);
        const luis = await story.backOffice.person(dana, who.luis);
        await dana.answered(endPersonSessionsEndpoint, { ids: { userId: who.luis.id } });
        await luis.answered(currentSessionEndpoint);
      },
    });
    expect(result.error).toBe(
      `${luissEmail}’s authenticator already gave this step’s code: the story’s clock must move on thirty seconds before they sign in again.`,
    );
  });
});

describe('an endpoint’s path, as a story asks it', () => {
  it('takes each parameter, escaped, and the query; a parameter not given stops the story', () => {
    expect(pathOf(challengePhoneEndpoint, { ids: { deviceId: 'a b' } })).toBe(
      '/phones/a%20b/challenges',
    );
    expect(
      pathOf(sendPhotoFilePartEndpoint, {
        ids: { photoId: 'p', file: 'photo' },
        query: { offset: '0', length: '12' },
      }),
    ).toBe('/phones/current/photos/p/files/photo?offset=0&length=12');
    expect(() => pathOf(challengePhoneEndpoint)).toThrow(
      'challengePhone is asked without its deviceId.',
    );
  });
});

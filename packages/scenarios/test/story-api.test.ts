// A story's own API and the way to it (BACKLOG 2.7.1 part 1; ADR-491): the API's process, on a
// story's database and clock, reached only over HTTPS through the local stack's proxy, under
// the stack's own authority. Needs the local stack and an installation, as the stories do.
import { request as overHttp } from 'node:http';
import { request as overHttps } from 'node:https';
import process from 'node:process';

import {
  challengePhoneEndpoint,
  sendPhotoFilePartEndpoint,
  syncSentSchema,
  turnInSentSchema,
} from '@open-adms/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { pathOf, storiesHostname } from '../src/over-https.ts';
import { Runner, type Story } from '../src/runner.ts';
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
        const yard = story.serverOn(later);
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

// The runner catches a wrong result, and a story's database copied from a run's template is what
// one migrated and seeded by itself is (BACKLOG 0.4.1; ADR-275, 447). Needs the local stack and
// an installation, as the database tests do. The stories themselves run once, in `pnpm
// scenarios` (ADR-446): this file no longer runs each of them again.
import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { Runner, type Story } from '../src/runner.ts';
import { StoryDatabase, StoryTemplate } from '../src/story-database.ts';
import { stories } from '../src/stories/index.ts';

// A story whose last check is wrong, and one that stops with an error.
const wrong: Story = {
  name: 'wrong',
  title: 'expects a field event that was never synced',
  timeZone: 'America/New_York',
  start: '2026-10-12T06:30:00-04:00',
  async run(story) {
    story.check(
      'the seed made only its three actors: the system actor, the master passcode’s and the device key’s',
      await story.api.user.count(),
      3,
    );
    story.check('a field event arrived', await story.api.fieldEvent.count(), 1);
  },
};
const stops: Story = {
  ...wrong,
  name: 'stops',
  async run(story) {
    story.at('2026-10-12T05:00:00-04:00', 'goes back in time');
    await Promise.resolve();
  },
};

async function run(story: Story, template?: StoryTemplate) {
  const lines: string[] = [];
  const result = await new Runner(
    (line) => lines.push(line),
    template === undefined ? {} : { template },
  ).run(story);
  return { result, lines };
}

// A story that only looks at what its database starts with.
const starts: Story = {
  ...wrong,
  name: 'starts',
  async run(story) {
    story.check('the seed’s three actors', await story.api.user.count(), 3);
  },
};

async function left(name: string | undefined): Promise<boolean> {
  return name !== undefined && (await StoryDatabase.list()).includes(name);
}

describe('the stories', () => {
  it('each have a name of their own, which `pnpm scenarios` runs them by', () => {
    const names = stories.map((story) => story.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(0);
  });
});

describe('a run’s template', () => {
  it('gives each story a copy that stands as a database migrated and seeded by itself: at head, every table guarded, adms_owner’s, open to the logins alone', async () => {
    const head = readdirSync(new URL('../../db/prisma/migrations/', import.meta.url), {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory()).length;
    const template = await StoryTemplate.create();
    const made: StoryDatabase[] = [];
    try {
      expect(template.name).toMatch(/^adms_story_template_\d{14}_[0-9a-f]{6}$/);
      expect(template.migrations).toBe(head);
      const alone = await StoryDatabase.create();
      made.push(alone);
      alone.migrate();
      await alone.seed();
      const copy = await StoryDatabase.create(template);
      made.push(copy);
      const expected = {
        owner: 'adms_owner',
        migrations: head,
        unguarded: [],
        mayConnect: ['adms_api', 'adms_owner', 'adms_readonly', 'adms_worker'],
        users: 3,
      };
      expect(await alone.standing()).toEqual(expected);
      expect(await copy.standing()).toEqual(expected);
    } finally {
      for (const database of made) await database.drop();
      await template.drop();
    }
    expect(await left(template.name)).toBe(false);
  }, 120_000);

  it('is what a story runs on when its runner is handed one, and the story’s copy is dropped', async () => {
    const template = await StoryTemplate.create();
    try {
      const first = await run(starts, template);
      const second = await run(starts, template);
      for (const { result, lines } of [first, second]) {
        expect([result.passed, result.failed, result.error], lines.join('\n')).toEqual([
          1,
          0,
          undefined,
        ]);
        expect(lines[1]).toMatch(/a copy of this run’s template/);
        expect(await left(result.database)).toBe(false);
      }
      expect(first.result.database).not.toBe(second.result.database);
      expect(await left(template.name)).toBe(true);
    } finally {
      await template.drop();
    }
  }, 120_000);
});

describe('the runner', () => {
  it('reports a wrong result as a failed check, and still drops the database', async () => {
    const { result, lines } = await run(wrong);
    expect([result.passed, result.failed, result.error]).toEqual([1, 1, undefined]);
    expect(lines).toContain('      ✗ a field event arrived');
    expect(lines).toContain('          expected 1');
    expect(lines).toContain('          got      0');
    expect(lines.at(-1)).toBe('  FAILED: 2 checks, 1 passed, 1 failed');
    expect(await left(result.database)).toBe(false);
  }, 60_000);

  it('reports a story that stops, and still drops the database', async () => {
    const { result, lines } = await run(stops);
    expect(result.error).toMatch(/can't go back/);
    expect(lines.at(-1)).toBe('  FAILED: 0 checks, 0 passed, 0 failed, stopped early');
    expect(await left(result.database)).toBe(false);
  }, 60_000);
});

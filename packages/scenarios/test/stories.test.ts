// Every story passes, each on its own database, and the runner catches a wrong result (BACKLOG
// 0.4.1; ADR-275). Needs the local stack and an installation, as the database tests do.
import { describe, expect, it } from 'vitest';

import { Runner, type Story } from '../src/runner.ts';
import { StoryDatabase } from '../src/story-database.ts';
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

async function run(story: Story) {
  const lines: string[] = [];
  const result = await new Runner((line) => lines.push(line)).run(story);
  return { result, lines };
}

async function left(name: string | undefined): Promise<boolean> {
  return name !== undefined && (await StoryDatabase.list()).includes(name);
}

describe('the stories', () => {
  for (const story of stories) {
    it(`${story.name} passes on its own database, dropped afterwards`, async () => {
      const { result, lines } = await run(story);
      expect(result.error, lines.join('\n')).toBeUndefined();
      expect(result.failed, lines.join('\n')).toBe(0);
      expect(result.passed).toBeGreaterThan(0);
      expect(result.database).toMatch(/^adms_story_\d{14}_[0-9a-f]{6}$/);
      expect(await left(result.database)).toBe(false);
    }, 60_000);
  }
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

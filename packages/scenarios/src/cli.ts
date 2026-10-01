// `pnpm scenarios`: runs the stories from a terminal (ARCHITECTURE §15; ADR-275).
//   pnpm scenarios                 every story
//   pnpm scenarios <name> …        the stories named
//   pnpm scenarios --keep …        keep each story's database to look at
//   pnpm scenarios list            the stories
//   pnpm scenarios clean           drop every story database left behind (none may be running)
// Exits 1 when a check fails or a story stops early.
import process from 'node:process';

import { Runner } from './runner.ts';
import { StoryDatabase } from './story-database.ts';
import { stories } from './stories/index.ts';

async function main(args: readonly string[]): Promise<number> {
  const [command] = args;
  if (command === 'list') {
    for (const story of stories) console.log(`${story.name}: ${story.title}`);
    return 0;
  }
  if (command === 'clean') {
    const dropped = await StoryDatabase.clean();
    console.log(
      dropped.length === 0 ? 'No story databases left behind.' : `Dropped ${dropped.join(', ')}.`,
    );
    return 0;
  }
  const keep = args.includes('--keep');
  const named = args.filter((arg) => arg !== '--keep');
  const unknown = named.filter((name) => !stories.some((story) => story.name === name));
  if (unknown.length > 0) {
    console.error(`No story named ${unknown.join(', ')}. \`pnpm scenarios list\` lists them.`);
    return 1;
  }
  const chosen =
    named.length === 0 ? stories : stories.filter((story) => named.includes(story.name));
  const runner = new Runner(
    (line) => {
      console.log(line);
    },
    { keep },
  );
  let failed = 0;
  for (const story of chosen) {
    const result = await runner.run(story);
    if (result.failed > 0 || result.error !== undefined) failed += 1;
  }
  console.log(`Stories: ${String(chosen.length - failed)} passed, ${String(failed)} failed.`);
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main(process.argv.slice(2));

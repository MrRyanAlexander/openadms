// `pnpm scenarios`: runs the stories from a terminal (ARCHITECTURE §15; ADR-275).
//   pnpm scenarios                 every story
// A run of more than one story migrates and seeds once, into a template each story's database is
// a copy of (ADR-447); the template is dropped when the run ends.
//   pnpm scenarios <name> …        the stories named
//   pnpm scenarios --keep …        keep each story's database to look at
//   pnpm scenarios list            the stories
//   pnpm scenarios clean           drop every story database left behind (none may be running)
//   node packages/scenarios/src/cli.ts world <origin>
//                                  the field app's browser tests' own world, for the page at that
//                                  origin, until stopped (ADR-572; apps/field/e2e/world-setup.ts)
// Exits 1 when a check fails or a story stops early.
import process from 'node:process';

import { BrowserWorld } from './browser-world.ts';
import { Runner } from './runner.ts';
import { StoryDatabase, StoryTemplate } from './story-database.ts';
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
  if (command === 'world') return world(args[1]);
  const keep = args.includes('--keep');
  const named = args.filter((arg) => arg !== '--keep');
  const unknown = named.filter((name) => !stories.some((story) => story.name === name));
  if (unknown.length > 0) {
    console.error(`No story named ${unknown.join(', ')}. \`pnpm scenarios list\` lists them.`);
    return 1;
  }
  const chosen =
    named.length === 0 ? stories : stories.filter((story) => named.includes(story.name));
  const template = chosen.length > 1 ? await StoryTemplate.create() : undefined;
  let failed = 0;
  try {
    if (template !== undefined) {
      console.log(
        `This run’s template, ${template.name}: ${String(template.migrations)} migrations applied; ` +
          `seed: ${template.seeded.join('; ')}`,
      );
    }
    const runner = new Runner(
      (line) => {
        console.log(line);
      },
      { keep, ...(template === undefined ? {} : { template }) },
    );
    for (const story of chosen) {
      const result = await runner.run(story);
      if (result.failed > 0 || result.error !== undefined) failed += 1;
    }
  } finally {
    await template?.drop();
  }
  console.log(`Stories: ${String(chosen.length - failed)} passed, ${String(failed)} failed.`);
  return failed === 0 ? 0 : 1;
}

// The browser tests' world (ADR-572): made, then one line on standard output saying it is ready,
// as JSON (its database's name, its made-up master passcode, no installation's, and its cast of
// monitors, ADR-574); held until the process is told to stop or its standard input ends, then
// closed and dropped. The API's error lines go to standard error.
async function world(pageOrigin: string | undefined): Promise<number> {
  if (pageOrigin === undefined || !URL.canParse(pageOrigin)) {
    console.error('world takes the origin of the page that tests it.');
    return 1;
  }
  const made = await BrowserWorld.opened(pageOrigin);
  try {
    console.log(
      JSON.stringify({
        ready: true,
        database: made.database,
        apiOrigin: BrowserWorld.apiOrigin,
        masterPasscode: BrowserWorld.masterPasscode,
        cast: made.cast,
        lostPhone: made.lostPhone,
      }),
    );
    await new Promise<void>((done) => {
      process.once('SIGTERM', done);
      process.once('SIGINT', done);
      process.stdin.once('end', done);
      process.stdin.resume();
    });
  } finally {
    await made.close();
    process.stdin.pause();
    for (const line of made.errors) console.error(`The world's API: ${line}`);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));

// `pnpm sample`: the sample projects (sample/sample-projects.ts), loaded into this installation once.
//   pnpm sample              loads them, asking the firm's master passcode (its phones are enrolled
//                            under it); loaded already, does nothing and says so
//   pnpm sample --status     whether they are loaded
//   pnpm sample --try        loads them into a database of their own on the local stack, made as
//                            the stories' are, through the installation's own API settings, to see
//                            it done; loads again (nothing); drops it (`--keep` keeps it)
//   node packages/scenarios/src/sample-cli.ts --offer <file>
//                            what `pnpm local:up` runs once the API and the worker answer: at a
//                            terminal, where the sample isn't loaded and hasn't been offered (the
//                            file remembers it was), asks once whether to load it; with no
//                            terminal, says how to
// The passcode is read at the terminal without being shown, or as one line of standard input
// where there is no terminal (a script, the installer): never from an argument or a setting, and
// never printed. Exits 1 when a load stops.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

import { installationStage } from './sample/installation.ts';
import { sample } from './sample/sample-names.ts';
import { loadSample, sampleStanding, type SampleLoaded } from './sample/sample-projects.ts';
import { StoryDatabase, storyMasterPasscode } from './story-database.ts';

const say = (line: string): void => void process.stdout.write(`${line}\n`);

// One answer from the terminal, or one line of standard input; a secret's typing never shown.
async function asked(question: string, secret: boolean): Promise<string> {
  let muted = false;
  const lines = createInterface({
    input: process.stdin,
    output: new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        if (!muted) process.stdout.write(chunk);
        done();
      },
    }),
    terminal: process.stdin.isTTY,
  });
  try {
    process.stdout.write(`${question}${secret ? ' (not shown)' : ''}: `);
    muted = secret;
    const [line] = await lines[Symbol.asyncIterator]()
      .next()
      .then((next) => (next.done === true ? [''] : [next.value]));
    return line ?? '';
  } finally {
    muted = false;
    lines.close();
    process.stdout.write('\n');
  }
}

// How the installation stands for the sample, read through the API's own login.
async function standing(): Promise<Awaited<ReturnType<typeof sampleStanding>>> {
  const stage = await installationStage({ passcode: '' });
  try {
    return await sampleStanding(stage.context.api);
  } finally {
    await stage.close();
  }
}

async function load(passcode: string, tryingOn?: string): Promise<SampleLoaded> {
  const stage = await installationStage({
    passcode,
    ...(tryingOn === undefined ? {} : { tryingOn }),
    logged: (line) => {
      process.stderr.write(`The sample's API: ${line}\n`);
    },
  });
  try {
    return await loadSample(stage.context);
  } finally {
    await stage.close();
  }
}

function told(loaded: SampleLoaded): number {
  if (loaded.loaded) {
    say(
      `Loaded the sample projects: “${sample.projects.row}” and “${sample.projects.ppdr}”, ` +
        `under the client “${sample.client}”. Their people are archived and their phones turned in.`,
    );
    return 0;
  }
  if (loaded.standing === 'LOADED') {
    say('The sample projects are loaded already: nothing was done.');
    return 0;
  }
  say(
    'Part of the sample projects is here already, from a load that stopped: nothing was done. ' +
      'Nothing it made can be taken away; the firm may archive what it finds.',
  );
  return 1;
}

async function main(args: readonly string[]): Promise<number> {
  if (args.includes('--status')) {
    const now = await standing();
    say(
      now === 'LOADED'
        ? 'The sample projects are loaded.'
        : now === 'NOT_LOADED'
          ? 'The sample projects are not loaded: `pnpm sample` loads them.'
          : 'Part of the sample projects is here, from a load that stopped.',
    );
    return 0;
  }
  if (args.includes('--try')) {
    const tried = await StoryDatabase.create();
    try {
      tried.migrate();
      await tried.seed();
      say(`Trying the sample on a database of its own, ${tried.name} …`);
      const started = Date.now();
      // The database is seeded with the stories' made-up passcode, no installation's.
      const first = await load(storyMasterPasscode, tried.name);
      say(
        `First load: ${JSON.stringify(first)} (${String(Math.round((Date.now() - started) / 1000))} s)`,
      );
      const again = await load(storyMasterPasscode, tried.name);
      say(`Second load: ${JSON.stringify(again)}`);
      return first.loaded && !again.loaded && again.standing === 'LOADED' ? 0 : 1;
    } finally {
      if (args.includes('--keep')) {
        await tried.keep();
        say(`Kept ${tried.name}; \`pnpm scenarios clean\` drops it.`);
      } else {
        await tried.drop();
      }
    }
  }
  const offer = args.indexOf('--offer');
  if (offer >= 0) {
    const remembered = args[offer + 1];
    if (remembered === undefined) throw new Error('--offer takes the file that remembers it.');
    const now = await standing();
    if (now !== 'NOT_LOADED' || existsSync(remembered)) return 0;
    if (!process.stdin.isTTY) {
      say(
        'The sample projects are not loaded: `pnpm sample` loads them (it asks the master passcode).',
      );
      return 0;
    }
    say('');
    say(
      'Open ADMS can load two sample projects (a ROW and a PPDR project of made-up work, every kind of',
    );
    say(
      'ticket, form and review in them) so you can look round before setting up your own. Their names',
    );
    say(
      'start “Sample:”. Load them into a database your tests run on and those tests will see them.',
    );
    const yes = /^y(es)?$/i.test(
      (await asked('Load the sample projects now? (y/N)', false)).trim(),
    );
    mkdirSync(dirname(remembered), { recursive: true });
    writeFileSync(remembered, `${yes ? 'loaded' : 'declined'} ${new Date().toISOString()}\n`, {
      mode: 0o600,
    });
    if (!yes) {
      say('Not loaded. `pnpm sample` loads them any time.');
      return 0;
    }
  }
  const passcode = await asked('The firm’s master passcode, to enrol the sample’s phones', true);
  if (passcode === '') {
    say('No passcode: nothing was done.');
    return 1;
  }
  say('Loading the sample projects (a few minutes) …');
  return told(await load(passcode));
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (problem) {
  // A setting's problem names its key, never its value; no connection URL is shown.
  const what = problem instanceof Error ? problem.message : String(problem);
  process.stderr.write(`${what.replace(/postgres(ql)?:\/\/\S+/g, '<connection URL>')}\n`);
  process.exitCode = 1;
}

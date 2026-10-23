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
//                            file remembers it was), or where a load of it stopped half-way, asks
//                            whether to load it; with no terminal, says how to
// The passcode is read at the terminal without being shown, or as one line of standard input
// where there is no terminal (a script, the installer): never from an argument or a setting, and
// never printed. Exits 1 when a load stops.
//
// A load into the installation ends with how to try the field app on it: the sample's monitors,
// each with the Monitor ID, the password made up for them and that day's work, and the badges to
// scan. It is printed, and written to `infra/local/.generated/sample-field-sign-ins.txt` (mode
// 0600, git-ignored), which `pnpm local:up` shows at the end of its report each time it runs
// (the user, 2026-10-23: "I shouldnt have to run pnpm field:try to get those details").
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { Database } from '@open-adms/db';

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

// Where a load into the installation leaves how to try the field app on it.
export const signInsFile = fileURLToPath(
  new URL('../../../infra/local/.generated/sample-field-sign-ins.txt', import.meta.url),
);

interface Loaded {
  readonly loaded: SampleLoaded;
  // How to try the field app on it, where it was loaded: lines to print.
  readonly tryIt: readonly string[];
}

async function load(passcode: string, tryingOn?: string): Promise<Loaded> {
  const stage = await installationStage({
    passcode,
    ...(tryingOn === undefined ? {} : { tryingOn }),
    logged: (line) => {
      process.stderr.write(`The sample's API: ${line}\n`);
    },
  });
  try {
    const loaded = await loadSample(stage.context);
    return { loaded, tryIt: loaded.loaded ? await tryIt(stage.context.api, loaded) : [] };
  } finally {
    await stage.close();
  }
}

// The field app's sign-ins and badges, as `pnpm local:up` shows them.
async function tryIt(
  api: Database,
  loaded: Extract<SampleLoaded, { loaded: true }>,
): Promise<string[]> {
  const badges = await api.certification.findMany({
    where: { projectId: { in: [loaded.p1, loaded.p2] } },
    orderBy: [{ projectId: 'asc' }, { certNumber: 'asc' }],
    select: { projectId: true, certNumber: true, kind: true, capacityCy: true },
  });
  const badgesOf = (projectId: string) =>
    badges
      .filter((badge) => badge.projectId === projectId)
      .map((badge) =>
        badge.kind === 'CREW'
          ? `${badge.certNumber} (crew)`
          : `${badge.certNumber} (${String(badge.capacityCy ?? '?')} CY)`,
      )
      .join(', ');
  const width = Math.max(...loaded.signIns.map(({ name }) => name.length));
  return [
    `Try the field app on the sample projects (their monitors’ work is on the board for ${loaded.workDate}):`,
    '  Enrol the phone first (any name, the firm’s master passcode), then sign in as a monitor:',
    ...loaded.signIns.map(
      (monitor) =>
        `    ${monitor.name.padEnd(width)}  ${monitor.monitorNumber}  ${monitor.password}  ${monitor.work}`,
    ),
    `  Badges to scan or type: ROW project ${badgesOf(loaded.p1)}; PPDR project ${badgesOf(loaded.p2)}.`,
    '  On another day, a monitor with no work on the board sets the phone up under the master passcode.',
    '  Archive these monitors in the back office once you have looked round.',
  ];
}

function told({ loaded, tryIt: lines }: Loaded): number {
  if (loaded.loaded) {
    if (loaded.putAway) {
      say(
        'A load of the sample that had stopped half-way was put away first: its projects closed, ' +
          'its records archived and named as a stopped load’s (nothing is deleted).',
      );
    }
    mkdirSync(dirname(signInsFile), { recursive: true });
    writeFileSync(signInsFile, `${lines.join('\n')}\n`, { mode: 0o600 });
    for (const line of lines) say(line);
    say(
      `Loaded the sample projects: “${sample.projects.row}” and “${sample.projects.ppdr}”, ` +
        `under the client “${sample.client}”. Their phones are turned in; their monitors are ready to sign in.`,
    );
    return 0;
  }
  say('The sample projects are loaded already: nothing was done.');
  return 0;
}

async function main(args: readonly string[]): Promise<number> {
  if (args.includes('--status')) {
    const now = await standing();
    say(
      now === 'LOADED'
        ? 'The sample projects are loaded.'
        : now === 'NOT_LOADED'
          ? 'The sample projects are not loaded: `pnpm sample` loads them.'
          : 'Part of the sample projects is here, from a load that stopped: `pnpm sample` puts it away and loads them afresh.',
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
      const { loaded: first, tryIt: lines } = await load(storyMasterPasscode, tried.name);
      const seconds = String(Math.round((Date.now() - started) / 1000));
      say(`First load: loaded ${String(first.loaded)} (${seconds} s)`);
      for (const line of lines) say(line);
      const { loaded: again } = await load(storyMasterPasscode, tried.name);
      say(`Second load: ${JSON.stringify(again)}`);
      return first.loaded && !again.loaded ? 0 : 1;
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
    // Offered once; a load that stopped half-way is offered again, since it never finished.
    if (now === 'LOADED' || (now === 'NOT_LOADED' && existsSync(remembered))) return 0;
    if (!process.stdin.isTTY) {
      say(
        now === 'NOT_LOADED'
          ? 'The sample projects are not loaded: `pnpm sample` loads them (it asks the master passcode).'
          : 'A load of the sample projects stopped half-way: `pnpm sample` puts it away and loads them afresh (it asks the master passcode).',
      );
      return 0;
    }
    say('');
    if (now === 'PARTLY_LOADED') {
      say('A load of the sample projects stopped half-way (often a mistyped master passcode).');
      say('Loading them again puts what it made away first (closed and archived, never deleted).');
    }
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

// Loading the sample projects at a first run (the user, 2026-10-22: a fresh installation already
// holds them). It is `pnpm sample` run as a child process, after the stack is up: the build it
// needs first, then packages/scenarios/src/sample-cli.ts. The master passcode the firm just typed
// reaches it as one line of its standard input, never as an argument, in its environment, in a
// file or in anything printed. A load that stops never stops the installation: it says why and
// how to load them later.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { join } from 'node:path';

// What runs a command: `spawnSync`, or a test's stand-in.
export type Run = (
  command: string,
  args: string[],
  options: { cwd: string; input?: string; encoding: 'utf8' },
) => Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'stderr'>;

export interface SampleResult {
  loaded: boolean;
  // The one line to tell the firm.
  line: string;
}

const later = 'Load them later with `pnpm sample`.';

// The last non-empty line of what a command said, with the passcode cut out should it appear.
function lastLine(text: string, passcode: string): string {
  const line = text
    .split('\n')
    .map((one) => one.trim())
    .filter((one) => one !== '')
    .pop();
  return (line ?? '').split(passcode).join('…');
}

export function loadSample(
  root: string,
  passcode: string,
  run: Run = (command, args, options) => spawnSync(command, args, options),
): SampleResult {
  const stopped = (why: string): SampleResult => ({
    loaded: false,
    line: `Sample projects not loaded: ${why} ${later}`,
  });
  // What `pnpm sample` builds first: the database client, then every package.
  for (const [command, args] of [
    ['pnpm', ['generate']],
    ['pnpm', ['exec', 'tsc', '--build']],
  ] as const) {
    const built = run(command, [...args], { cwd: root, encoding: 'utf8' });
    if (built.status !== 0) return stopped('the build did not finish.');
  }
  const loading = run(
    process.execPath,
    [join(root, 'packages/scenarios/src/sample-cli.ts')],
    // The passcode, on standard input alone (there is no terminal to ask it at).
    { cwd: root, input: `${passcode}\n`, encoding: 'utf8' },
  );
  if (loading.status !== 0) {
    const why = lastLine(loading.stderr, passcode) || lastLine(loading.stdout, passcode);
    return stopped(why === '' ? 'the load stopped.' : `${why}${/[.!?]$/.test(why) ? '' : '.'}`);
  }
  // Its last words: "Loaded the sample projects: …" or that they are loaded already.
  return { loaded: true, line: `Sample projects loaded: ${lastLine(loading.stdout, passcode)}` };
}

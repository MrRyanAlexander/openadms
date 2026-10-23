// Loading the sample at a first run (sample.ts): the passcode reaches the load's process on its
// standard input alone, and a load that stops says how to load it later.
import { describe, expect, it } from 'vitest';

import { loadSample, type Run } from '../src/sample.ts';

const passcode = 'correct horse battery staple 7491';

function stub(loading: { status: number; stdout?: string; stderr?: string }, buildStatus = 0) {
  const calls: { command: string; args: string[]; input: string | undefined }[] = [];
  const run: Run = (command, args, options) => {
    calls.push({ command, args, input: options.input });
    const loads = args.some((arg) => arg.endsWith('sample-cli.ts'));
    return loads
      ? { status: loading.status, stdout: loading.stdout ?? '', stderr: loading.stderr ?? '' }
      : { status: buildStatus, stdout: '', stderr: '' };
  };
  return { calls, run };
}

describe('the sample at a first run', () => {
  it('builds, then runs the sample CLI with the passcode on standard input only', () => {
    const { calls, run } = stub({
      status: 0,
      stdout: 'Loaded the sample projects: “Sample: ROW”, under the client “Sample County”.\n',
    });
    const result = loadSample('/repo', passcode, run);
    expect(result.loaded).toBe(true);
    expect(result.line).toBe(
      'Sample projects loaded: Loaded the sample projects: “Sample: ROW”, under the client “Sample County”.',
    );
    expect(calls.map(({ args }) => args.at(-1))).toEqual([
      'generate',
      '--build',
      '/repo/packages/scenarios/src/sample-cli.ts',
    ]);
    // The passcode is on stdin, one line, and in no command, argument or printed line.
    expect(calls.map(({ input }) => input)).toEqual([undefined, undefined, `${passcode}\n`]);
    expect(JSON.stringify(calls.map(({ command, args }) => [command, args]))).not.toContain(
      passcode,
    );
    expect(result.line).not.toContain(passcode);
  });

  it('a load that stops is told, with how to load it later, never with the passcode', () => {
    const { run } = stub({ status: 1, stderr: `The API said no to ${passcode}\n` });
    const result = loadSample('/repo', passcode, run);
    expect(result).toEqual({
      loaded: false,
      line: 'Sample projects not loaded: The API said no to …. Load them later with `pnpm sample`.',
    });
  });

  it('a build that stops never reaches the load', () => {
    const { calls, run } = stub({ status: 0 }, 1);
    const result = loadSample('/repo', passcode, run);
    expect(result.loaded).toBe(false);
    expect(result.line).toContain('`pnpm sample`');
    expect(calls).toHaveLength(1);
  });
});

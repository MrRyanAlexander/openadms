// The outbox's bench (outbox-bench.ts) built by the workspace's Vite into one script that sets
// `admsBench`, once a run, and handed to a page through DevTools (BACKLOG 3.4.1; ADR-578).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Page } from '@playwright/test';
import { build } from 'vite';

import type * as OutboxBench from './outbox-bench.ts';

const field = fileURLToPath(new URL('..', import.meta.url));

let built: Promise<string> | undefined;
function benchScript(): Promise<string> {
  built ??= build({
    configFile: false,
    root: field,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      emptyOutDir: false,
      lib: {
        entry: join(field, 'e2e/outbox-bench.ts'),
        formats: ['iife'],
        name: 'admsBench',
        fileName: () => 'bench.js',
      },
    },
  }).then((outputs) => {
    for (const output of Array.isArray(outputs) ? outputs : [outputs]) {
      if (!('output' in output)) continue;
      for (const chunk of output.output) if (chunk.type === 'chunk') return chunk.code;
    }
    throw new Error('The bench was built into no script.');
  });
  return built;
}

export interface Bench {
  admsBench: typeof OutboxBench;
}

// The bench handed to the page as it stands.
export async function benched(page: Page): Promise<void> {
  await page.evaluate(await benchScript());
}

// The field app's browser build (ARCHITECTURE §3; ADR-563, 565): `vite build` into dist/web/,
// which Caddy serves at https://field.adms.localhost (infra/local/Caddyfile). Vite compiles the
// TSX itself (React's automatic runtime): no plugin. The page states its own policy, title and
// language, written in from page.ts and the translation file, so no word of it is in the HTML.
// The policy values the phone reads (its own sign-in screen and its lock after inactivity,
// ADR-575) are the release's (packages/domain/policy.env), each one the build's environment states
// taking its place, held by the domain's Policy before anything is built (invariant 16).
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { parseEnv } from 'node:util';

import { Policy, policyNames } from '@open-adms/domain';
import { defineConfig, type Plugin } from 'vite';

import { apiOriginOf, pagePolicy } from './page.ts';

const words = JSON.parse(readFileSync(new URL('src/words/en.json', import.meta.url), 'utf8')) as {
  language: string;
  app: { name: string };
};
const apiOrigin = apiOriginOf(process.env);

const policy: Record<string, string> = parseEnv(
  readFileSync(new URL('../../packages/domain/policy.env', import.meta.url), 'utf8'),
) as Record<string, string>;
for (const name of Object.values(policyNames)) {
  const own = process.env[name]?.trim();
  if (own !== undefined && own !== '') policy[name] = own;
}
// A value missing or out of range stops the build, by name.
Policy.from(policy);

// What text a page holds is HTML's to escape: the translation file's words are plain text.
const escaped = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const page: Plugin = {
  name: 'open-adms-page',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html
        .replace('__ADMS_LANGUAGE__', escaped(words.language))
        .replace('__ADMS_PAGE_POLICY__', escaped(pagePolicy(apiOrigin)))
        .replace('__ADMS_TITLE__', escaped(words.app.name)),
  },
};

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  // Nothing of the environment reaches the bundle but what is named below.
  envPrefix: 'ADMS_FIELD_PAGE_',
  define: {
    'import.meta.env.ADMS_API_ORIGIN': JSON.stringify(apiOrigin),
    'import.meta.env.ADMS_POLICY': JSON.stringify(policy),
  },
  plugins: [page],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    // Every file its own, never a data: address the page's policy would refuse.
    assetsInlineLimit: 0,
    sourcemap: false,
    // One bundle, read from the phone's own files, never over the network: React DOM and Zod are
    // most of its half a megabyte, and splitting it would buy a phone nothing (ADR-565).
    chunkSizeWarningLimit: 1024,
  },
});

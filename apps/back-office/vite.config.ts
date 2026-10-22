// The back office's browser build (ARCHITECTURE §3, §14): `vite build` into dist/web/, which Caddy
// serves at https://office.adms.localhost (infra/local/Caddyfile), every path that names no file
// answered with the page, so a reload or a link keeps its place. Vite compiles the TSX itself
// (React's automatic runtime): no plugin. The page states its own policy, title and language,
// written in from page.ts and the translation file, so no word of it is in the HTML.
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { defineConfig, type Plugin } from 'vite';

import { apiOriginOf, pagePolicy } from './page.ts';

const words = JSON.parse(readFileSync(new URL('src/words/en.json', import.meta.url), 'utf8')) as {
  language: string;
  app: { name: string };
};
const apiOrigin = apiOriginOf(process.env);

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
  envPrefix: 'ADMS_OFFICE_PAGE_',
  define: {
    'import.meta.env.ADMS_API_ORIGIN': JSON.stringify(apiOrigin),
  },
  plugins: [page],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
    // Every file its own, never a data: address the page's policy would refuse.
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 1536,
  },
});

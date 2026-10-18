// The prototype's build (task 3.1.4): its own page, never the app's (vite.config.ts builds that
// into dist/web, which Caddy serves). Into dist/prototype: the page with the app's policy, talking
// to no server at all, for the browser tests (e2e/prototype.e2e.ts); and prototype.html, the same
// page in one file with its script and styles inside it, for publishing to the user. The words of
// the page's title and language are the prototype's translation file's.
import { readFileSync } from 'node:fs';

import { defineConfig, type Plugin } from 'vite';

import { prototypePolicy } from '../page.ts';

const words = JSON.parse(readFileSync(new URL('words.json', import.meta.url), 'utf8')) as {
  language: string;
  page: { title: string };
};

const escaped = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const page: Plugin = {
  name: 'open-adms-prototype-page',
  transformIndexHtml: {
    order: 'pre',
    handler: (html) =>
      html
        .replace('__ADMS_LANGUAGE__', escaped(words.language))
        .replace('__ADMS_PAGE_POLICY__', escaped(prototypePolicy))
        .replace('__ADMS_TITLE__', escaped(words.page.title)),
  },
};

// The one-file page: a title, the styles, the element React Aria looks for, the app's element and
// the script, with nothing in the script or styles able to end its own element early. The page it
// is published into supplies the document round it.
const oneFile: Plugin = {
  name: 'open-adms-prototype-one-file',
  apply: 'build',
  generateBundle(_options, bundle) {
    const files = Object.values(bundle);
    const scripts = files.flatMap((file) =>
      file.type === 'chunk' && file.isEntry ? [file.code] : [],
    );
    const styles = files.flatMap((file) =>
      file.type === 'asset' && file.fileName.endsWith('.css') ? [String(file.source)] : [],
    );
    if (scripts.length !== 1)
      throw new Error(`The prototype has ${String(scripts.length)} scripts, not one.`);
    const script = (scripts[0] ?? '')
      .replaceAll('</script', '<\\/script')
      .replaceAll('<!--', '<\\!--');
    const style = styles.join('\n').replaceAll('</style', '<\\/style');
    this.emitFile({
      type: 'asset',
      fileName: 'prototype.html',
      source: [
        `<title>${escaped(words.page.title)}</title>`,
        `<style>${style}</style>`,
        '<meta id="react-aria-pressable-style" name="react-aria-pressable-style" content="look" />',
        '<div id="app"></div>',
        `<script type="module">${script}</script>`,
        '',
      ].join('\n'),
    });
  },
};

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  envPrefix: 'ADMS_PROTOTYPE_PAGE_',
  plugins: [page, oneFile],
  build: {
    outDir: '../dist/prototype',
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 1024,
  },
});

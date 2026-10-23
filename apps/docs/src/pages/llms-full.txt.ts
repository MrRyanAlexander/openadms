// /llms-full.txt: every page's Markdown twin in one file, in the sidebar's order, for an agent that
// wants the whole documentation in one read. Written from the pages at build time.
import type { APIRoute } from 'astro';

import { markdownOf, pagesInOrder } from '../lib/pages.ts';
import { site } from '../site.ts';

export const GET: APIRoute = async () => {
  const pages = (await pagesInOrder()).map(markdownOf);
  const head = `# ${site.title} documentation, in full\n\n> ${site.description}\n`;
  return new Response([head, ...pages].join('\n---\n\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

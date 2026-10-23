// /llms.txt (https://llmstxt.org): the site's name, what it is, and every page's Markdown twin with
// what it holds, in the sidebar's sections and order. Written from the pages at build time.
import type { APIRoute } from 'astro';

import { pagesInOrder, where } from '../lib/pages.ts';
import { absolute, twinPath, underBase } from '../lib/urls.ts';
import { sectionOf, site } from '../site.ts';

export const GET: APIRoute = async () => {
  const { base, siteUrl } = where();
  const at = (path: string): string => absolute(siteUrl, path);
  const lines = [
    `# ${site.title}`,
    '',
    `> ${site.description}`,
    '',
    `Each link below is a page of the Open ADMS documentation as Markdown. Every page of the site has`,
    `such a twin at its own address with \`.md\` in place of the trailing slash. The whole`,
    `documentation in one file: [llms-full.txt](${at(underBase(base, 'llms-full.txt'))}). The API's`,
    `OpenAPI document: [openapi.json](${at(underBase(base, 'openapi.json'))}). Source code:`,
    `${site.repository} (${site.licence}).`,
  ];
  let section: string | undefined;
  for (const page of await pagesInOrder()) {
    const here = page.id === 'index' ? 'Start here' : (sectionOf(page.id) ?? 'More');
    if (here !== section) {
      section = here;
      lines.push('', `## ${here}`, '');
    }
    const description = page.data.description === undefined ? '' : `: ${page.data.description}`;
    lines.push(`- [${page.data.title}](${at(twinPath(base, page.id))})${description}`);
  }
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

// Every page's Markdown twin, at the page's own path with `.md` ('/concepts/statuses.md'), built
// to a static file beside the HTML page (https://llmstxt.org: "a Markdown version at the same URL").
import type { APIRoute, GetStaticPaths } from 'astro';

import { markdownOf, pagesInOrder, type DocsPage } from '../lib/pages.ts';

export const getStaticPaths = (async () =>
  (await pagesInOrder()).map((page) => ({
    params: { slug: page.id },
    props: { page },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute<{ page: DocsPage }> = ({ props }) =>
  new Response(markdownOf(props.page), {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });

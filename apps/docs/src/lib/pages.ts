// The site's pages as data, in the sidebar's order, for the build-time routes that hand them to
// agents: each page's Markdown twin, llms.txt and llms-full.txt.
import { getCollection, type CollectionEntry } from 'astro:content';

import { pageOrder } from '../site.ts';
import { twinDocument } from './twin.ts';
import { absolute, normaliseBase, pagePath } from './urls.ts';

export type DocsPage = CollectionEntry<'docs'>;

/** Every published page, the sidebar's order first, then any page the sidebar doesn't list. */
export async function pagesInOrder(): Promise<DocsPage[]> {
  const order = pageOrder();
  const rank = (id: string): number => {
    const at = order.indexOf(id);
    return at === -1 ? order.length : at;
  };
  const pages = await getCollection('docs', (page) => page.id !== '404' && !page.data.draft);
  return pages.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
}

/** Where the site is served: its base path and, where it is known, its own address. */
export function where(): { base: string; siteUrl: string | undefined } {
  const siteUrl = import.meta.env.SITE as string | undefined;
  return {
    base: normaliseBase(import.meta.env.BASE_URL),
    siteUrl: siteUrl === '' ? undefined : siteUrl,
  };
}

/** A page's Markdown twin, whole. */
export function markdownOf(page: DocsPage): string {
  const { base, siteUrl } = where();
  return twinDocument(
    {
      title: page.data.title,
      description: page.data.description,
      body: page.body ?? '',
      url: absolute(siteUrl, pagePath(base, page.id)),
    },
    base,
    siteUrl,
  );
}

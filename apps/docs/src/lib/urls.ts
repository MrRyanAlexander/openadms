// Where a page and its Markdown twin are served, under the site's base path. Pure functions: the
// remark plugin (at config time), the twins and llms.txt (at build time) and the link check all use
// them, so a page's address is worked out one way only.

/** The base path with one leading and one trailing slash: '/', '/docs/'. */
export function normaliseBase(base: string | undefined): string {
  const trimmed = (base ?? '/').replace(/^\/+|\/+$/g, '');
  return trimmed === '' ? '/' : `/${trimmed}/`;
}

/** A page's id as the collection keeps it: the home page is 'index' (a route may call it ''). */
function pageId(id: string): string {
  return id === '' ? 'index' : id;
}

/** The page's own address: '/' for the home page, '/concepts/statuses/' for the rest. */
export function pagePath(base: string, id: string): string {
  return pageId(id) === 'index' ? normaliseBase(base) : `${normaliseBase(base)}${id}/`;
}

/** The page's Markdown twin: '/index.md' for the home page, '/concepts/statuses.md' for the rest. */
export function twinPath(base: string, id: string): string {
  return `${normaliseBase(base)}${pageId(id)}.md`;
}

/** A root-relative path under the base: '/llms.txt' → '/docs/llms.txt'. */
export function underBase(base: string, path: string): string {
  return `${normaliseBase(base)}${path.replace(/^\/+/, '')}`;
}

/** The same path made absolute where the site's own address is known; root-relative otherwise. */
export function absolute(site: string | undefined, path: string): string {
  return site === undefined || site === '' ? path : new URL(path, site).href;
}

/**
 * The page id a root-relative link names, when it names a page: '/concepts/statuses/' or
 * '/concepts/statuses' → 'concepts/statuses', '/' → 'index'. A file ('/llms.txt') names none.
 */
export function pageIdOf(path: string): string | undefined {
  const bare = path.replace(/^\/+|\/+$/g, '');
  if (bare === '') return 'index';
  return /\.[a-z0-9]+$/i.test(bare) ? undefined : bare;
}

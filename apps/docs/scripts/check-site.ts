// After `astro build`: proves the static site in dist/ is whole, or exits 1 saying what isn't.
//   - every link and asset a page names inside the site exists, and every #fragment is on its page;
//   - every page has its Markdown twin, and every link in a twin resolves;
//   - llms.txt lists every page's twin, and llms-full.txt holds every page.
// Node 24 runs this file as-is (type stripping). Reads DOCS_SITE and DOCS_BASE as astro.config.ts.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normaliseBase } from '../src/lib/urls.ts';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const base = normaliseBase(process.env['DOCS_BASE']);
const siteUrl = process.env['DOCS_SITE'] === '' ? undefined : process.env['DOCS_SITE'];
const problems: string[] = [];

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory())
      return name === 'pagefind' || name === '_astro' ? [] : walk(path);
    return [path];
  });
}

/** The file in dist/ an address inside the site names, or undefined for one outside it. */
function fileFor(address: string, from: string): { file: string; hash: string } | undefined {
  let url: URL;
  try {
    url = new URL(address, new URL(`https://site.invalid${from}`));
  } catch {
    return undefined;
  }
  if (siteUrl !== undefined && address.startsWith(siteUrl)) {
    url = new URL(address.slice(new URL(siteUrl).origin.length), 'https://site.invalid');
  } else if (url.origin !== 'https://site.invalid') {
    return undefined;
  }
  if (!url.pathname.startsWith(base)) return { file: '', hash: url.hash };
  const path = decodeURIComponent(url.pathname.slice(base.length));
  const file =
    path === '' || path.endsWith('/') ? join(dist, path, 'index.html') : join(dist, path);
  return { file, hash: url.hash.slice(1) };
}

const ids = new Map<string, Set<string>>();
function idsOf(file: string): Set<string> {
  let found = ids.get(file);
  if (found === undefined) {
    found = new Set(
      [...readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1] ?? ''),
    );
    ids.set(file, found);
  }
  return found;
}

function check(address: string, page: string, from: string): void {
  if (address.startsWith('mailto:') || address.startsWith('data:')) return;
  const target = fileFor(address, from);
  if (target === undefined) return;
  if (target.file === '' || !existsSync(target.file)) {
    problems.push(`${page}: ${address} leads nowhere`);
    return;
  }
  if (target.hash !== '' && target.file.endsWith('.html') && !idsOf(target.file).has(target.hash)) {
    problems.push(`${page}: ${address} names #${target.hash}, which isn't on that page`);
  }
}

const files = walk(dist);
const pages = files.filter((file) => file.endsWith('.html') && !file.endsWith('404.html'));
const twins = new Set<string>();

for (const file of pages) {
  const page = relative(dist, file);
  const from = `${base}${page.replace(/index\.html$/, '')}`;
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
    const address = (match[1] ?? '').replaceAll('&amp;', '&');
    if (address !== '') check(address, page, from);
  }
  const twin = page === 'index.html' ? 'index.md' : `${page.replace(/\/index\.html$/, '')}.md`;
  twins.add(twin);
  if (!existsSync(join(dist, twin))) problems.push(`${page}: no Markdown twin at ${twin}`);
}

for (const twin of twins) {
  const path = join(dist, twin);
  if (!existsSync(path)) continue;
  const from = `${base}${twin.replace(/[^/]*$/, '')}`;
  for (const match of readFileSync(path, 'utf8').matchAll(/\]\(([^)\s]+)\)/g)) {
    check(match[1] ?? '', twin, from);
  }
}

const llms = existsSync(join(dist, 'llms.txt')) ? readFileSync(join(dist, 'llms.txt'), 'utf8') : '';
if (llms === '') problems.push('llms.txt is missing or empty');
for (const match of llms.matchAll(/\]\(([^)\s]+)\)/g)) check(match[1] ?? '', 'llms.txt', base);
for (const twin of twins) {
  const listed = siteUrl === undefined ? `${base}${twin}` : new URL(`${base}${twin}`, siteUrl).href;
  if (!llms.includes(`(${listed})`)) problems.push(`llms.txt doesn't list ${twin}`);
}
const full = existsSync(join(dist, 'llms-full.txt'))
  ? readFileSync(join(dist, 'llms-full.txt'), 'utf8')
  : '';
for (const twin of twins) {
  const page = `${base}${twin === 'index.md' ? '' : `${twin.slice(0, -3)}/`}`;
  if (!full.includes(`Source: ${siteUrl === undefined ? page : new URL(page, siteUrl).href}\n`)) {
    problems.push(`llms-full.txt doesn't hold ${twin}`);
  }
}

if (problems.length > 0) {
  console.error(`The site isn't whole (${String(problems.length)}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
} else {
  console.log(
    `Site checked: ${String(pages.length)} pages, ${String(twins.size)} Markdown twins, every link and fragment inside the site found, llms.txt and llms-full.txt whole.`,
  );
}

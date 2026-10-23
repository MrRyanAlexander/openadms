// A page's Markdown twin: the page as an agent reads it. Its source is the page's own Markdown, so
// the twin says exactly what the page says; three things change on the way:
// - Starlight's asides (`:::note[Title]` … `:::`) become GitHub-style alerts (`> [!NOTE]`), which
//   every Markdown reader understands;
// - a link to another page points at that page's twin, so an agent stays in Markdown;
// - a link under the site takes the site's base path, and its address where the site has one.
// Fenced code is left exactly as written.
import { absolute, pageIdOf, twinPath, underBase } from './urls.ts';

const alertKinds: Record<string, string> = {
  note: 'NOTE',
  tip: 'TIP',
  caution: 'WARNING',
  danger: 'CAUTION',
};

/** Starlight's asides as GitHub-style alerts, outside fenced code. */
export function asidesToAlerts(markdown: string): string {
  const out: string[] = [];
  let inFence = false;
  let inAside = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence) {
      const open = /^:::(note|tip|caution|danger)(?:\[(.*)\])?\s*$/.exec(line);
      if (open !== null && !inAside) {
        inAside = true;
        out.push(`> [!${alertKinds[open[1] ?? 'note'] ?? 'NOTE'}]`);
        if (open[2] !== undefined && open[2] !== '') out.push(`> **${open[2]}**`, '>');
        continue;
      }
      if (inAside && /^:::\s*$/.test(line)) {
        inAside = false;
        continue;
      }
    }
    out.push(inAside ? (line === '' ? '>' : `> ${line}`) : line);
  }
  return out.join('\n');
}

/** Links to the site's own pages pointed at their twins, under the base and the site's address. */
export function linksToTwins(markdown: string, base: string, siteUrl: string | undefined): string {
  const parts = markdown.split(/(^(?:```|~~~)[\s\S]*?^(?:```|~~~)\s*$)/m);
  return parts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/\]\((\/[^)\s#]*)(#[^)\s]*)?\)/g, (_match, path: string, hash?: string) => {
            const id = pageIdOf(path);
            const target = id === undefined ? underBase(base, path) : twinPath(base, id);
            return `](${absolute(siteUrl, target)}${hash ?? ''})`;
          }),
    )
    .join('');
}

export interface TwinPage {
  title: string;
  description: string | undefined;
  body: string;
  /** The page's own address (absolute where the site's address is known). */
  url: string;
}

/** The whole twin: the title, the summary, where the page lives, then its content. */
export function twinDocument(page: TwinPage, base: string, siteUrl: string | undefined): string {
  const head = [`# ${page.title}`, ''];
  if (page.description !== undefined && page.description !== '') {
    head.push(`> ${page.description}`, '');
  }
  head.push(`Source: ${page.url}`, '');
  const body = linksToTwins(asidesToAlerts(page.body.trim()), base, siteUrl);
  return `${head.join('\n')}\n${body}\n`;
}

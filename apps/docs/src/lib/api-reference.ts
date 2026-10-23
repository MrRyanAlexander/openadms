// The API reference page, written at build time from the API's own OpenAPI document
// (apps/api/openapi.json, which `pnpm openapi` makes from the shared Zod contracts). Nothing about an
// endpoint is typed here by hand: what each one does is the summary the API states for it.

interface OpenApiOperation {
  summary?: string;
  operationId?: string;
}

export interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; license?: { name: string } };
  paths: Record<string, Record<string, OpenApiOperation>>;
}

const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;

/** The first segment of a path, its group on the page: '/phones/current/sign-ins' → 'phones'. */
function groupOf(path: string): string {
  return path.split('/').find((segment) => segment !== '') ?? '';
}

/** A table cell's text, with nothing in it that would end the cell or the row. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

export const apiReferenceFrontmatter = {
  title: 'API reference',
  description:
    'Every endpoint of the Open ADMS API, grouped by path, with what each one does: generated at ' +
    'build time from the API’s own OpenAPI document.',
};

export function apiReferenceMarkdown(document: OpenApiDocument, openApiHref: string): string {
  const groups = new Map<string, { method: string; path: string; summary: string }[]>();
  let count = 0;
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of methods) {
      const operation = item[method];
      if (operation === undefined) continue;
      count += 1;
      const group = groupOf(path);
      const rows = groups.get(group) ?? [];
      rows.push({ method: method.toUpperCase(), path, summary: operation.summary ?? '' });
      groups.set(group, rows);
    }
  }

  const lines = [
    `The API is the only way into an installation: the field app, the back office and the viewer`,
    `portal all reach the server through it, over HTTPS. This page lists its ${String(count)}`,
    `endpoints, grouped by the first part of their path. Each line's description is the summary the`,
    `API itself states, so this page is generated, never edited by hand.`,
    '',
    ':::note[The full contract]',
    `The complete OpenAPI ${document.openapi} document, with every request and response schema, is`,
    `published beside these pages: [openapi.json](${openApiHref}) (${document.info.title},`,
    `version ${document.info.version}${document.info.license === undefined ? '' : `, ${document.info.license.name}`}).`,
    'Load it into any OpenAPI viewer or client generator.',
    ':::',
    '',
    '## How to call it',
    '',
    '- **Over HTTPS only.** Plain HTTP is refused at the API’s address. Locally the API answers at',
    '  `https://api.adms.localhost`.',
    '- **A person** (admin, manager/analyst, read-only viewer) signs in with `POST /sessions`; the',
    '  session is held in `__Host-` cookies, and every call that is not a `GET` carries the CSRF value',
    '  from `GET /sessions/csrf`.',
    '- **A phone** proves itself by signing a challenge with its device key and calls with a',
    '  short-lived bearer token; a monitor signs in on it beside that token.',
    '- **Browsers** may call it only from the exact origins on the installation’s CORS allow-list.',
    '- Every body is checked against the shared schema; unknown fields are refused, errors are plain',
    '  codes, and a caller over its rate limit is answered `429`.',
    '',
    'See [Security](/security/) for the sign-in rules and [Architecture](/reference/architecture/) for',
    'how the API sits beside the worker and the database.',
    '',
  ];

  for (const [group, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## /${group}`, '', '| Method | Path | What it does |', '| --- | --- | --- |');
    for (const row of rows.sort(
      (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    )) {
      lines.push(`| \`${row.method}\` | \`${cell(row.path)}\` | ${cell(row.summary)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

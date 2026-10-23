# Open ADMS documentation site

The public documentation for Open ADMS, built with [Astro Starlight](https://starlight.astro.build)
to **static files only**: no server, no database, nothing to run but a web server.

Every page also exists for agents and assistants:

- a **Copy page** button (the page as Markdown, to the clipboard) and a menu with **View as
  Markdown**, **Open in Claude** and **Open in ChatGPT**;
- a **Markdown twin** of every page at its own address with `.md` in place of the trailing slash
  (`/concepts/statuses/` → `/concepts/statuses.md`), named in each page's `<head>`;
- [`/llms.txt`](https://llmstxt.org) (every page's twin, by section) and `/llms-full.txt` (every
  page in one file), generated from the pages at build time;
- `/openapi.json`, the API's OpenAPI document, with the **API reference** page generated from it.

## Run it

From the repository's root, after `pnpm install`:

```bash
pnpm --filter @open-adms/docs dev       # live reload at http://localhost:4321
pnpm --filter @open-adms/docs build     # static site in apps/docs/dist/, then the site check
pnpm --filter @open-adms/docs preview   # serve the built site
pnpm --filter @open-adms/docs typecheck # astro sync, then tsc
```

The build ends with `scripts/check-site.ts`, which fails it when any link or `#fragment` inside the
site leads nowhere, a page has no Markdown twin, or `llms.txt` / `llms-full.txt` leave a page out.

## Deploy it

`apps/docs/dist/` is a plain static site: upload it to any static host (an S3 bucket behind a CDN,
Netlify, Cloudflare Pages, GitHub Pages, nginx, Caddy). Two optional settings, read at build time:

| Setting     | Example                    | What it changes                                                                                   |
| ----------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `DOCS_SITE` | `https://docs.example.org` | Canonical links, the sitemap, and absolute addresses in `llms.txt`, `llms-full.txt` and the twins |
| `DOCS_BASE` | `/docs`                    | The path the site is served under, when it isn't the host's root                                  |

```bash
DOCS_SITE=https://docs.example.org pnpm --filter @open-adms/docs build
```

Serve `.md` files as `text/markdown; charset=utf-8` and `.txt` as `text/plain; charset=utf-8` where
the host lets you set types. Search ([Pagefind](https://pagefind.app)) is built into `dist/pagefind/`
and needs no service.

## Write it

- Pages are Markdown in `src/content/docs/`; the sidebar's order is `src/site.ts`, which also feeds
  `llms.txt`. A new page gets a `title` and a one-sentence `description` (it becomes the page's lead
  for agents), and a place in `src/site.ts`.
- Link pages root-relative with a trailing slash (`/concepts/flags/`); the base path is added for
  you. Use Starlight's asides (`:::note`, `:::tip`, `:::caution`, `:::danger`); in the twins they
  become GitHub-style alerts.
- **Accurate before anything:** every statement is checked against the code, `spec/` and the domain
  skills; anything not built yet is marked planned. Words follow `spec/CONVENTIONS.md` (say
  _installation_ and _set up_), and every example comes from its example world.
- The API reference is generated from `apps/api/openapi.json` (`pnpm openapi` makes it); the flags
  reference follows `spec/FLAGS.md` and the schema's `FlagCode`; the configuration page names the
  settings in `packages/domain/policy.env`, never an installation's values.
- The look comes from the shared tokens (`@open-adms/look/tokens.css`) laid onto Starlight's
  variables in `src/styles/theme.css`.

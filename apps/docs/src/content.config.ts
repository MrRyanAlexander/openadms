// The docs collection: every page under src/content/docs, plus the API reference, which is written at
// build time from the API's OpenAPI document (src/lib/api-reference.ts) and joins the collection as
// an ordinary page, so it has a sidebar entry, a table of contents, search, a Markdown twin and a
// place in llms-full.txt like any other.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';

import {
  apiReferenceFrontmatter,
  apiReferenceMarkdown,
  type OpenApiDocument,
} from './lib/api-reference.ts';

const apiReferenceId = 'reference/api';

function withApiReference(pages: Loader): Loader {
  return {
    name: 'open-adms-docs',
    load: async (context) => {
      await pages.load(context);
      const source = fileURLToPath(new URL('../api/openapi.json', context.config.root));
      context.watcher?.add(source);
      const document = JSON.parse(await readFile(source, 'utf8')) as OpenApiDocument;
      // Root-relative, as every page writes its links: the base is put in front where pages render.
      const body = apiReferenceMarkdown(document, '/openapi.json');
      const data = await context.parseData({
        id: apiReferenceId,
        // Generated: there is no file to edit and no commit to date it by.
        data: { ...apiReferenceFrontmatter, editUrl: false, lastUpdated: false },
      });
      context.store.set({
        id: apiReferenceId,
        data,
        body,
        // Starlight places a page by its path in the collection; this one has no file of its own.
        filePath: `src/content/docs/${apiReferenceId}.md`,
        digest: context.generateDigest(body),
        rendered: await context.renderMarkdown(body),
      });
    },
  };
}

export const collections = {
  docs: defineCollection({ loader: withApiReference(docsLoader()), schema: docsSchema() }),
};

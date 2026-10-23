// The Open ADMS documentation site: Astro Starlight, built to static files only (no server).
// Two settings, both optional, set where the site is published (README.md):
//   DOCS_SITE  the site's own address, e.g. https://docs.example.org: canonical links, the sitemap,
//              and absolute addresses in llms.txt and the Markdown twins
//   DOCS_BASE  the path it is served under, e.g. /docs (default: the host's root)
import { unified } from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import { defineConfig, passthroughImageService } from 'astro/config';

import { remarkBase } from './src/lib/remark-base.ts';
import { normaliseBase } from './src/lib/urls.ts';
import { navigation, site } from './src/site.ts';

const siteUrl = process.env['DOCS_SITE'] === '' ? undefined : process.env['DOCS_SITE'];
const base = normaliseBase(process.env['DOCS_BASE']);

export default defineConfig({
  ...(siteUrl === undefined ? {} : { site: siteUrl }),
  base,
  trailingSlash: 'always',
  output: 'static',
  // The site holds no photographs: nothing to resize, so no image library runs at build.
  image: { service: passthroughImageService() },
  // Markdown through remark (Starlight's asides and anchors join it), with the base path put in
  // front of every root-relative link.
  markdown: { processor: unified({ remarkPlugins: [remarkBase({ base })] }) },
  integrations: [
    starlight({
      title: site.title,
      description: site.description,
      logo: {
        light: './src/assets/wordmark-light.svg',
        dark: './src/assets/wordmark-dark.svg',
        alt: site.title,
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'Source on GitHub', href: site.repository }],
      editLink: { baseUrl: `${site.repository}/edit/${site.branch}/apps/docs/` },
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ['@open-adms/look/tokens.css', './src/styles/theme.css'],
      components: {
        PageTitle: './src/components/PageTitle.astro',
      },
      routeMiddleware: './src/route-data.ts',
      head: [
        {
          tag: 'link',
          attrs: {
            rel: 'alternate',
            type: 'text/plain',
            title: 'llms.txt',
            href: `${base}llms.txt`,
          },
        },
      ],
      sidebar: navigation.map((group) => ({
        label: group.label,
        items: group.items.map((item) =>
          typeof item === 'string' ? item : { label: item.label, items: item.items },
        ),
      })),
      credits: false,
    }),
  ],
});

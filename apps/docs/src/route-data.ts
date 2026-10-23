// Every page names its Markdown twin in its <head>, so an agent that fetches the HTML page finds
// the Markdown one without guessing (<link rel="alternate" type="text/markdown">).
import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

import { twinPath } from './lib/urls.ts';

export const onRequest = defineRouteMiddleware((context) => {
  const route = context.locals.starlightRoute;
  if (route.entry.id === '404') return;
  route.head.push({
    tag: 'link',
    attrs: {
      rel: 'alternate',
      type: 'text/markdown',
      title: `${route.entry.data.title} (Markdown)`,
      href: twinPath(import.meta.env.BASE_URL, route.entry.id),
    },
  });
});

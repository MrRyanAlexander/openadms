// Which screen each address shows, and the menu that reaches them (ARCHITECTURE §14; FROM-BUILD-1
// §8, §13). A screen a person may not open isn't in their menu; asked for by its address, the API
// refuses it and the screen says so.
import type { ReactNode } from 'react';

import { matched } from './router.tsx';
import { Account } from './screens/account.tsx';
import { Home } from './screens/home.tsx';
import { NotFound } from './screens/not-found.tsx';
import { Project } from './screens/project.tsx';
import type { MenuSection } from './shell.tsx';
import { words } from './words.ts';

export function routeOf(path: string): ReactNode {
  if (path === '/' || path === '') return <Home />;
  if (path === '/account') return <Account />;
  const project = matched('/projects/:projectId', path);
  if (project !== null) return <Project projectId={project['projectId'] ?? ''} />;
  return <NotFound />;
}

export function sectionsOf(): readonly MenuSection[] {
  const said = words.shell;
  return [
    {
      label: said.sections.firm,
      links: [{ label: said.links.projects, href: '/', shown: true }],
    },
  ];
}

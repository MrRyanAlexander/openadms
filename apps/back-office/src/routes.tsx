// Which screen each address shows, and the menu that reaches them (ARCHITECTURE §14; FROM-BUILD-1
// §8, §13). A screen a person may not open isn't in their menu; asked for by its address, the API
// refuses it and the screen says so. The firm's records are the firm's; everything else is a
// project's, under /projects/<id>/.
import type { ReactNode } from 'react';

import { matched } from './router.tsx';
import { Account } from './screens/account.tsx';
import { Home } from './screens/home.tsx';
import { NotFound } from './screens/not-found.tsx';
import { Project } from './screens/project.tsx';
import { holds, type Signed } from './session.tsx';
import { DispatchBoard } from './people/dispatch.tsx';
import { FirmSettings } from './people/firm-settings.tsx';
import { Hours } from './people/hours.tsx';
import { People, PersonPage } from './people/people.tsx';
import { Phones } from './people/phones.tsx';
import { CertificationPage, Certifications } from './setup/certifications.tsx';
import { Clients, Contractors, DeclarationEvents } from './setup/firm-records.tsx';
import { Forms } from './setup/forms.tsx';
import { FirmLists } from './setup/lists.tsx';
import { PayItems } from './setup/pay-items.tsx';
import { ProjectMap } from './setup/project-map.tsx';
import { ProjectSetup } from './setup/project-setup.tsx';
import { Roes, SetupCheck } from './setup/roes.tsx';
import { RuleBuilder, Rules } from './setup/rules.tsx';
import { Sites } from './setup/sites.tsx';
import type { MenuSection } from './shell.tsx';
import { words } from './words.ts';

// The firm's own screens, by their address.
const firmScreens: Readonly<Record<string, () => ReactNode>> = {
  '/': () => <Home />,
  '/account': () => <Account />,
  '/clients': () => <Clients />,
  '/declaration-events': () => <DeclarationEvents />,
  '/contractors': () => <Contractors />,
  '/lists': () => <FirmLists />,
  '/people': () => <People />,
  '/phones': () => <Phones />,
  '/settings': () => <FirmSettings />,
};

// The firm's screens of one record, by their address.
const firmRecordScreens: readonly (readonly [
  string,
  (params: Readonly<Record<string, string>>) => ReactNode,
])[] = [['/people/:userId', (params) => <PersonPage userId={params['userId'] ?? ''} />]];

// A project's screens, by the rest of their address after /projects/<id>.
const projectScreens: readonly (readonly [
  string,
  (projectId: string, params: Readonly<Record<string, string>>) => ReactNode,
])[] = [
  ['', (projectId) => <Project projectId={projectId} />],
  ['/setup', (projectId) => <ProjectSetup projectId={projectId} />],
  ['/setup/forms', (projectId) => <Forms projectId={projectId} />],
  ['/setup/pay-items', (projectId) => <PayItems projectId={projectId} />],
  ['/setup/rules', (projectId) => <Rules projectId={projectId} />],
  ['/setup/rules/new', (projectId) => <RuleBuilder projectId={projectId} ruleId={null} />],
  [
    '/setup/rules/:ruleId',
    (projectId, params) => <RuleBuilder projectId={projectId} ruleId={params['ruleId'] ?? ''} />,
  ],
  ['/setup/sites', (projectId) => <Sites projectId={projectId} />],
  ['/setup/map', (projectId) => <ProjectMap projectId={projectId} />],
  ['/setup/check', (projectId) => <SetupCheck projectId={projectId} />],
  ['/certifications', (projectId) => <Certifications projectId={projectId} />],
  [
    '/certifications/:certificationId',
    (projectId, params) => (
      <CertificationPage projectId={projectId} certificationId={params['certificationId'] ?? ''} />
    ),
  ],
  ['/roes', (projectId) => <Roes projectId={projectId} />],
  ['/dispatch', (projectId) => <DispatchBoard projectId={projectId} />],
  ['/hours', (projectId) => <Hours projectId={projectId} />],
];

export function routeOf(path: string): ReactNode {
  const firm = firmScreens[path === '' ? '/' : path];
  if (firm !== undefined) return firm();
  for (const [pattern, screen] of firmRecordScreens) {
    const params = matched(pattern, path);
    if (params !== null) return screen(params);
  }
  for (const [rest, screen] of projectScreens) {
    const params = matched(`/projects/:projectId${rest}`, path);
    if (params !== null) return screen(params['projectId'] ?? '', params);
  }
  return <NotFound />;
}

export function sectionsOf(signed: Signed, projectId: string | null): readonly MenuSection[] {
  const said = words.shell;
  const { session } = signed;
  const setup = holds(session, 'SETUP');
  const viewSetup = holds(session, 'VIEW_SETUP');
  const viewReview = holds(session, 'VIEW_REVIEW');
  const viewDispatch = holds(session, 'VIEW_DISPATCH');
  const inProject = (rest: string) => `/projects/${projectId ?? ''}${rest}`;
  const firm: MenuSection = {
    label: said.sections.firm,
    links: [
      { label: said.links.projects, href: '/', shown: true },
      { label: said.links.clients, href: '/clients', shown: setup },
      { label: said.links.events, href: '/declaration-events', shown: setup },
      { label: said.links.contractors, href: '/contractors', shown: setup },
      { label: said.links.lists, href: '/lists', shown: setup },
      { label: said.links.people, href: '/people', shown: viewDispatch },
      { label: said.links.phones, href: '/phones', shown: viewDispatch },
      { label: said.links.firmSettings, href: '/settings', shown: setup },
    ],
  };
  if (projectId === null) return [firm];
  return [
    firm,
    {
      label: said.sections.forms,
      links: [
        { label: said.links.certifications, href: inProject('/certifications'), shown: viewReview },
        { label: said.links.roes, href: inProject('/roes'), shown: viewReview },
      ],
    },
    {
      label: said.sections.dispatch,
      links: [
        { label: said.links.dispatch, href: inProject('/dispatch'), shown: viewDispatch },
        { label: said.links.hours, href: inProject('/hours'), shown: viewDispatch },
      ],
    },
    {
      label: said.sections.setup,
      links: [
        { label: said.links.projectSetup, href: inProject('/setup'), shown: viewSetup },
        { label: said.links.forms, href: inProject('/setup/forms'), shown: viewSetup },
        { label: said.links.payItems, href: inProject('/setup/pay-items'), shown: viewSetup },
        { label: said.links.rules, href: inProject('/setup/rules'), shown: viewSetup },
        { label: said.links.sites, href: inProject('/setup/sites'), shown: viewSetup },
        { label: said.links.map, href: inProject('/setup/map'), shown: viewSetup },
        { label: said.links.setupCheck, href: inProject('/setup/check'), shown: viewSetup },
      ],
    },
  ];
}

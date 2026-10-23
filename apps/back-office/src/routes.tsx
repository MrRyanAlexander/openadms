// Every screen of the back office, as a place on the desktop (ARCHITECTURE §14; FROM-BUILD-1 §8,
// §13; desk/places.ts): its address, its title, its picture, and, where it belongs in the menus and
// on the desktop, its area and who may open it. A screen a person may not open isn't in their
// menus or folders; asked for by its address, the API refuses it and the screen says so. The
// firm's records are the firm's; everything else is a project's, under /projects/<id>/. The areas
// are the work's: the firm, then the project's Tickets, Reports and Forms, Billings (never
// "Money"), Dispatch and hours, and Setup.
import type { SessionAnswer } from '@open-adms/contracts';

import { ticketTitle, type Place, type Workplace } from './desk/places.ts';
import { Account } from './screens/account.tsx';
import { Home } from './screens/home.tsx';
import { NotFound } from './screens/not-found.tsx';
import { Project } from './screens/project.tsx';
import { holds, isAdmin } from './session.tsx';
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
import { AuditTrail } from './billings/audit.tsx';
import { InvoiceBatches } from './billings/batches.tsx';
import { Closing } from './billings/closing.tsx';
import { Ledger } from './billings/ledger.tsx';
import { QcAndLock } from './billings/tickets.tsx';
import { Exports } from './reports/exports.tsx';
import { Reports } from './reports/reports.tsx';
import { DropOffLogs, Incidents, Surveys } from './review/form-records.tsx';
import { ReviewQueue } from './review/queue.tsx';
import { TicketPage } from './review/ticket.tsx';
import { HeldRecords, Quarantine, SetAsideJobs } from './review/waiting.tsx';
import { words } from './words.ts';

const said = words.shell.links;
const titled = (title: string) => () => title;
const project = (params: Readonly<Record<string, string>>) => params['projectId'] ?? '';

// Who may open what (ADR-539): setup, review and dispatch each by their view.
const setup = (session: SessionAnswer) => holds(session, 'SETUP');
const viewSetup = (session: SessionAnswer) => holds(session, 'VIEW_SETUP');
const viewReview = (session: SessionAnswer) => holds(session, 'VIEW_REVIEW');
const viewDispatch = (session: SessionAnswer) => holds(session, 'VIEW_DISPATCH');
const everyone = () => true;

const places: readonly Place[] = [
  // The firm's.
  {
    at: '/',
    title: titled(said.projects),
    glyph: 'projects',
    screen: () => <Home />,
    area: 'firm',
    shown: everyone,
  },
  {
    at: '/clients',
    title: titled(said.clients),
    glyph: 'building',
    screen: () => <Clients />,
    area: 'firm',
    shown: setup,
  },
  {
    at: '/declaration-events',
    title: titled(said.events),
    glyph: 'storm',
    screen: () => <DeclarationEvents />,
    area: 'firm',
    shown: setup,
  },
  {
    at: '/contractors',
    title: titled(said.contractors),
    glyph: 'truck',
    screen: () => <Contractors />,
    area: 'firm',
    shown: setup,
  },
  {
    at: '/lists',
    title: titled(said.lists),
    glyph: 'list',
    screen: () => <FirmLists />,
    area: 'firm',
    shown: setup,
  },
  {
    at: '/people',
    title: titled(said.people),
    glyph: 'people',
    screen: () => <People />,
    area: 'firm',
    shown: viewDispatch,
  },
  {
    at: '/phones',
    title: titled(said.phones),
    glyph: 'phone',
    screen: () => <Phones />,
    area: 'firm',
    shown: viewDispatch,
  },
  {
    at: '/settings',
    title: titled(said.firmSettings),
    glyph: 'settings',
    screen: () => <FirmSettings />,
    area: 'firm',
    shown: setup,
  },
  {
    at: '/account',
    title: titled(words.shell.account),
    glyph: 'account',
    screen: () => <Account />,
  },
  {
    at: '/people/:userId',
    title: titled(words.desk.titles.person),
    glyph: 'account',
    screen: (params) => <PersonPage userId={params['userId'] ?? ''} />,
  },

  // A project's own page.
  {
    at: '/projects/:projectId',
    title: titled(words.desk.titles.project),
    glyph: 'folder',
    screen: (params) => <Project projectId={project(params)} />,
  },

  // Tickets.
  {
    at: '/projects/:projectId/review',
    title: titled(said.review),
    glyph: 'review',
    screen: (params) => <ReviewQueue projectId={project(params)} />,
    area: 'tickets',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/quarantine',
    title: titled(said.quarantine),
    glyph: 'quarantine',
    screen: (params) => <Quarantine projectId={project(params)} />,
    area: 'tickets',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/held',
    title: titled(said.held),
    glyph: 'held',
    screen: (params) => <HeldRecords projectId={project(params)} />,
    area: 'tickets',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/set-aside-jobs',
    title: titled(said.jobs),
    glyph: 'jobs',
    screen: (params) => <SetAsideJobs projectId={project(params)} />,
    area: 'tickets',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/tickets/:workflow/:ticketNumber',
    title: (params) => ticketTitle(params['workflow'], params['ticketNumber']),
    glyph: 'ticket',
    screen: (params) => (
      <TicketPage
        projectId={project(params)}
        workflow={params['workflow'] ?? ''}
        ticketNumber={params['ticketNumber'] ?? ''}
      />
    ),
  },

  // Reports and Forms.
  {
    at: '/projects/:projectId/reports',
    title: titled(said.reports),
    glyph: 'report',
    screen: (params) => <Reports projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/exports',
    title: titled(said.exports),
    glyph: 'export',
    screen: (params) => <Exports projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/certifications',
    title: titled(said.certifications),
    glyph: 'certification',
    screen: (params) => <Certifications projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/certifications/:certificationId',
    title: titled(words.desk.titles.certification),
    glyph: 'certification',
    screen: (params) => (
      <CertificationPage
        projectId={project(params)}
        certificationId={params['certificationId'] ?? ''}
      />
    ),
  },
  {
    at: '/projects/:projectId/roes',
    title: titled(said.roes),
    glyph: 'roe',
    screen: (params) => <Roes projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/surveys',
    title: titled(said.surveys),
    glyph: 'survey',
    screen: (params) => <Surveys projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/incidents',
    title: titled(said.incidents),
    glyph: 'incident',
    screen: (params) => <Incidents projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/drop-off-logs',
    title: titled(said.dropOffLogs),
    glyph: 'dropOff',
    screen: (params) => <DropOffLogs projectId={project(params)} />,
    area: 'forms',
    shown: viewReview,
  },

  // Billings.
  {
    at: '/projects/:projectId/ledger',
    title: titled(said.ledger),
    glyph: 'ledger',
    screen: (params) => <Ledger projectId={project(params)} />,
    area: 'billings',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/qc',
    title: titled(said.qc),
    glyph: 'qc',
    screen: (params) => <QcAndLock projectId={project(params)} />,
    area: 'billings',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/invoice-batches',
    title: titled(said.batches),
    glyph: 'batches',
    screen: (params) => <InvoiceBatches projectId={project(params)} />,
    area: 'billings',
    shown: viewReview,
  },
  {
    at: '/projects/:projectId/audit',
    title: titled(said.audit),
    glyph: 'audit',
    screen: (params) => <AuditTrail projectId={project(params)} />,
    area: 'billings',
    shown: (session) => viewReview(session) || viewSetup(session) || viewDispatch(session),
  },
  {
    at: '/projects/:projectId/closing',
    title: titled(said.closing),
    glyph: 'lock',
    screen: (params) => <Closing projectId={project(params)} />,
    area: 'billings',
    shown: isAdmin,
  },

  // Dispatch and hours.
  {
    at: '/projects/:projectId/dispatch',
    title: titled(said.dispatch),
    glyph: 'dispatch',
    screen: (params) => <DispatchBoard projectId={project(params)} />,
    area: 'dispatch',
    shown: viewDispatch,
  },
  {
    at: '/projects/:projectId/hours',
    title: titled(said.hours),
    glyph: 'clock',
    screen: (params) => <Hours projectId={project(params)} />,
    area: 'dispatch',
    shown: viewDispatch,
  },

  // Setup.
  {
    at: '/projects/:projectId/setup',
    title: titled(said.projectSetup),
    glyph: 'setup',
    screen: (params) => <ProjectSetup projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
  {
    at: '/projects/:projectId/setup/forms',
    title: titled(said.forms),
    glyph: 'form',
    screen: (params) => <Forms projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
  {
    at: '/projects/:projectId/setup/pay-items',
    title: titled(said.payItems),
    glyph: 'payItem',
    screen: (params) => <PayItems projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
  {
    at: '/projects/:projectId/setup/rules',
    title: titled(said.rules),
    glyph: 'rules',
    screen: (params) => <Rules projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
  {
    at: '/projects/:projectId/setup/rules/new',
    title: titled(words.desk.titles.newRule),
    glyph: 'rules',
    screen: (params) => <RuleBuilder projectId={project(params)} ruleId={null} />,
  },
  {
    at: '/projects/:projectId/setup/rules/:ruleId',
    title: titled(words.desk.titles.rule),
    glyph: 'rules',
    screen: (params) => <RuleBuilder projectId={project(params)} ruleId={params['ruleId'] ?? ''} />,
  },
  {
    at: '/projects/:projectId/setup/sites',
    title: titled(said.sites),
    glyph: 'site',
    screen: (params) => <Sites projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
  {
    at: '/projects/:projectId/setup/map',
    title: titled(said.map),
    glyph: 'map',
    screen: (params) => <ProjectMap projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
  {
    at: '/projects/:projectId/setup/check',
    title: titled(said.setupCheck),
    glyph: 'checklist',
    screen: (params) => <SetupCheck projectId={project(params)} />,
    area: 'setup',
    shown: viewSetup,
  },
];

export const office: Workplace = {
  areas: [
    { id: 'firm', label: words.shell.sections.firm, glyph: 'building' },
    { id: 'tickets', label: words.shell.sections.tickets, glyph: 'ticket' },
    { id: 'forms', label: words.shell.sections.forms, glyph: 'form' },
    { id: 'billings', label: words.shell.sections.billings, glyph: 'billings' },
    { id: 'dispatch', label: words.shell.sections.dispatch, glyph: 'dispatch' },
    { id: 'setup', label: words.shell.sections.setup, glyph: 'setup' },
  ],
  places,
  notFound: () => <NotFound />,
  notFoundTitle: words.notFound.title,
};

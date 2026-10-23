// The desktop's own workings, apart from a browser (shell.tsx; desk/): which address shows which
// place, which areas a person is shown, how the taskbar's windows open and close, which icon an
// arrow key moves to, and which menu item a letter moves to. The browser tests (e2e/layout.e2e.ts)
// prove the same on the screens.
import type { SessionAnswer } from '@open-adms/contracts';
import { describe, expect, it } from 'vitest';

import { nextIcon } from '../src/desk/icon-grid.tsx';
import { nextByLetter } from '../src/desk/menu-bar.tsx';
import {
  closed,
  mostOpen,
  onTaskbar,
  opened,
  windowKey,
  type OpenWindow,
} from '../src/desk/open-windows.ts';
import {
  areasFor,
  deskPlaceOf,
  desktopOf,
  placeOf,
  projectOfPath,
  ticketTitle,
  type Workplace,
} from '../src/desk/places.ts';
import { office } from '../src/routes.tsx';

const p1 = '0b8c2d1e-3f4a-4b5c-8d6e-7f8091a2b3c4';

const session = (
  role: SessionAnswer['user']['role'],
  granted: SessionAnswer['granted'] = [],
): SessionAnswer => ({
  user: { id: '1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f', name: 'Casey Ward', role, viewerKind: null },
  granted,
  passwordChangeRequired: false,
  twoStepSetUp: true,
  twoStepSetupRequired: false,
  csrf: 'csrf',
});

describe('the desktop’s places', () => {
  it('names the desktop, an area’s folder and About by their own addresses', () => {
    expect(deskPlaceOf('/desktop')).toEqual({ kind: 'desktop', projectId: null });
    expect(deskPlaceOf(`/projects/${p1}/desktop`)).toEqual({ kind: 'desktop', projectId: p1 });
    expect(deskPlaceOf('/areas/firm')).toEqual({ kind: 'area', projectId: null, area: 'firm' });
    expect(deskPlaceOf(`/projects/${p1}/areas/billings`)).toEqual({
      kind: 'area',
      projectId: p1,
      area: 'billings',
    });
    expect(deskPlaceOf('/about')).toEqual({ kind: 'about' });
    expect(deskPlaceOf(`/projects/${p1}/review`)).toBeNull();
    expect(desktopOf(null)).toBe('/desktop');
    expect(desktopOf(p1)).toBe(`/projects/${p1}/desktop`);
  });

  it('finds every screen by its address, the projects at the root as before', () => {
    expect(placeOf(office.places, '/')?.place.title({})).toBe('Projects');
    expect(placeOf(office.places, '')?.place.at).toBe('/');
    expect(placeOf(office.places, `/projects/${p1}/setup/rules/new`)?.place.at).toBe(
      '/projects/:projectId/setup/rules/new',
    );
    const ticket = placeOf(office.places, `/projects/${p1}/tickets/LOAD/101006`);
    expect(ticket?.place.title(ticket.params)).toBe('Loads ticket 101006');
    expect(placeOf(office.places, '/no/such/screen')).toBeNull();
    expect(projectOfPath(`/projects/${p1}/ledger`)).toBe(p1);
    expect(projectOfPath('/clients')).toBeNull();
    expect(ticketTitle('NOT_A_WORKFLOW', '101006')).toBe('Ticket 101006');
  });

  it('shows an admin every area, the project’s once a project is open', () => {
    const admin = session('ADMIN');
    expect(areasFor(office, admin, null).map(({ id }) => id)).toEqual(['firm']);
    const areas = areasFor(office, admin, p1);
    expect(areas.map(({ id, href }) => [id, href])).toEqual([
      ['firm', '/areas/firm'],
      ['tickets', `/projects/${p1}/areas/tickets`],
      ['forms', `/projects/${p1}/areas/forms`],
      ['billings', `/projects/${p1}/areas/billings`],
      ['dispatch', `/projects/${p1}/areas/dispatch`],
      ['setup', `/projects/${p1}/areas/setup`],
    ]);
    expect(areas.find(({ id }) => id === 'billings')?.links.map(({ label }) => label)).toEqual([
      'Ledger',
      'QC and invoice lock',
      'Invoice batches',
      'Audit trail',
      'Close the project',
    ]);
  });

  it('shows a manager only what they are granted: reviewing, no setup, dispatch or closing', () => {
    const areas = areasFor(office, session('MANAGER_ANALYST', ['VIEW_REVIEW']), p1);
    expect(areas.map(({ id }) => id)).toEqual(['firm', 'tickets', 'forms', 'billings']);
    expect(areas[0]?.links.map(({ label }) => label)).toEqual(['Projects']);
    expect(areas.find(({ id }) => id === 'billings')?.links.map(({ label }) => label)).toEqual([
      'Ledger',
      'QC and invoice lock',
      'Invoice batches',
      'Audit trail',
    ]);
  });

  it('shows a workplace’s area only where something in it may be opened', () => {
    const bare: Workplace = {
      ...office,
      places: office.places.filter(({ area }) => area !== 'setup'),
    };
    expect(areasFor(bare, session('ADMIN'), p1).map(({ id }) => id)).not.toContain('setup');
  });
});

describe('the taskbar’s windows', () => {
  const window_ = (pattern: string, projectId: string | null, href: string): OpenWindow => ({
    key: windowKey(projectId, pattern),
    href,
    title: pattern,
    glyph: 'document',
    projectId,
  });

  it('keeps one window for each kind of place in a project, where it was last', () => {
    const queue = window_('/projects/:projectId/review', p1, `/projects/${p1}/review`);
    const ticket = window_(
      '/projects/:projectId/tickets/:workflow/:ticketNumber',
      p1,
      `/projects/${p1}/tickets/LOAD/101006`,
    );
    let open = opened(opened([], queue), ticket);
    expect(open.map(({ href }) => href)).toEqual([queue.href, ticket.href]);
    const again = opened(open, ticket);
    expect(again).toBe(open);
    open = opened(open, { ...ticket, href: `/projects/${p1}/tickets/LOAD/101002` });
    expect(open.map(({ href }) => href)).toEqual([
      queue.href,
      `/projects/${p1}/tickets/LOAD/101002`,
    ]);
    expect(closed(open, queue.key).map(({ key }) => key)).toEqual([ticket.key]);
  });

  it('closes the oldest past the most kept open, never the one shown', () => {
    let open: readonly OpenWindow[] = [];
    for (let at = 0; at <= mostOpen; at += 1)
      open = opened(open, window_(`/place-${String(at)}`, null, `/place-${String(at)}`));
    expect(open).toHaveLength(mostOpen);
    expect(open[0]?.href).toBe('/place-1');
    expect(open.at(-1)?.href).toBe(`/place-${String(mostOpen)}`);
  });

  it('shows the firm’s windows and the open project’s', () => {
    const p2 = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d';
    const open = [
      window_('/clients', null, '/clients'),
      window_('/projects/:projectId/ledger', p1, `/projects/${p1}/ledger`),
      window_('/projects/:projectId/ledger', p2, `/projects/${p2}/ledger`),
    ];
    expect(onTaskbar(open, p1).map(({ href }) => href)).toEqual([
      '/clients',
      `/projects/${p1}/ledger`,
    ]);
    expect(onTaskbar(open, null).map(({ href }) => href)).toEqual(['/clients']);
  });
});

describe('moving by the keyboard', () => {
  // Three icons across, then two beneath.
  const grid = [0, 1, 2, 3, 4].map((at) => ({
    left: (at % 3) * 100,
    top: Math.floor(at / 3) * 100,
    width: 90,
    height: 90,
  }));

  it('moves an arrow to the nearest icon that way, and nowhere where none lies that way', () => {
    expect(nextIcon(grid, 0, 'right')).toBe(1);
    expect(nextIcon(grid, 1, 'down')).toBe(4);
    expect(nextIcon(grid, 4, 'up')).toBe(1);
    expect(nextIcon(grid, 3, 'left')).toBeNull();
    expect(nextIcon(grid, 2, 'right')).toBeNull();
    expect(nextIcon(grid, 2, 'down')).toBe(4);
  });

  it('moves a letter to the next item it begins, round to the start', () => {
    const labels = ['File', 'View', 'Tickets', 'Reports and Forms', 'Billings', 'Window'];
    expect(nextByLetter(labels, 0, 'w')).toBe(5);
    expect(nextByLetter(labels, 5, 'v')).toBe(1);
    expect(nextByLetter(labels, 1, 'q')).toBe(1);
  });
});

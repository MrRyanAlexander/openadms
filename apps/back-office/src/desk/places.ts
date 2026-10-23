// Where a person can go on the desktop, said once (the user, 2026-10-22; ARCHITECTURE §14): every
// screen is a **place** with its address, its title, its picture and the screen it shows; a place
// that belongs in the menus and on the desktop names its **area** and who may open it. The menu
// bar, the desktop's folders, the taskbar and the router all read the same list, so a screen's
// words and who sees it are written in one spot. The desktop's own places (the desktop itself, an
// area's folder, About) are the frame's, named here too, so the address always says what is shown.
import type { SessionAnswer } from '@open-adms/contracts';
import { workflows } from '@open-adms/domain';
import type { ReactNode } from 'react';

import { matched } from '../router.tsx';
import { say, words } from '../words.ts';
import type { GlyphName } from './glyphs.tsx';

export type Params = Readonly<Record<string, string>>;

export interface Place {
  // Its address: a firm's (`/clients`) or a project's (`/projects/:projectId/review`).
  readonly at: string;
  readonly title: (params: Params) => string;
  readonly glyph: GlyphName;
  readonly screen: (params: Params) => ReactNode;
  // In the menus and on the desktop, in this area, for a person who may open it.
  readonly area?: string;
  readonly shown?: (session: SessionAnswer) => boolean;
}

// An area of the work: a menu of the menu bar, and a folder on the desktop.
export interface Area {
  readonly id: string;
  readonly label: string;
  readonly glyph: GlyphName;
}

// What one face of the app offers (the back office, or the viewer portal).
export interface Workplace {
  readonly areas: readonly Area[];
  readonly places: readonly Place[];
  readonly notFound: () => ReactNode;
  readonly notFoundTitle: string;
}

// A place's address as a link, where it takes no record (a project's, inside that project).
export function hrefOf(place: Place, projectId: string | null): string | null {
  if (!place.at.startsWith('/projects/:projectId')) return place.at;
  if (projectId === null) return null;
  return place.at.replace(':projectId', projectId);
}

// The project an address is inside, if any: /projects/<id>/…
export function projectOfPath(path: string): string | null {
  const read = /^\/projects\/([0-9a-f-]{36})(?:\/|$)/.exec(path);
  return read?.[1] ?? null;
}

// The desktop of a project, or the firm's where no project is open.
export const desktopOf = (projectId: string | null): string =>
  projectId === null ? '/desktop' : `/projects/${projectId}/desktop`;

// An area's folder, inside the project where the area is a project's.
export const areaHref = (area: string, projectId: string | null): string =>
  projectId === null ? `/areas/${area}` : `/projects/${projectId}/areas/${area}`;

export const aboutHref = '/about';

// The frame's own places, read before the workplace's.
export type DeskPlace =
  | { readonly kind: 'desktop'; readonly projectId: string | null }
  | { readonly kind: 'area'; readonly projectId: string | null; readonly area: string }
  | { readonly kind: 'about' };

export function deskPlaceOf(path: string): DeskPlace | null {
  if (path === '/desktop') return { kind: 'desktop', projectId: null };
  if (path === aboutHref) return { kind: 'about' };
  const projectDesktop = matched('/projects/:projectId/desktop', path);
  if (projectDesktop !== null) {
    return { kind: 'desktop', projectId: projectDesktop['projectId'] ?? null };
  }
  const firmArea = matched('/areas/:area', path);
  if (firmArea !== null) return { kind: 'area', projectId: null, area: firmArea['area'] ?? '' };
  const projectArea = matched('/projects/:projectId/areas/:area', path);
  if (projectArea !== null) {
    return {
      kind: 'area',
      projectId: projectArea['projectId'] ?? null,
      area: projectArea['area'] ?? '',
    };
  }
  return null;
}

// The workplace's place an address names, and what the address gives it.
export function placeOf(
  places: readonly Place[],
  path: string,
): { readonly place: Place; readonly params: Params } | null {
  const at = path === '' ? '/' : path;
  for (const place of places) {
    const params = matched(place.at, at);
    if (params !== null) return { place, params };
  }
  return null;
}

// A link of a menu or a folder: its words, its address and its picture.
export interface PlaceLink {
  readonly label: string;
  readonly href: string;
  readonly glyph: GlyphName;
}

export interface AreaShown extends Area {
  // Its folder's address: inside the project where any of its places is a project's.
  readonly href: string;
  readonly links: readonly PlaceLink[];
}

// The areas a person may open, each with the places in it they may open: the firm's always, a
// project's only once a project is open. An area with nothing in it for them isn't shown.
export function areasFor(
  workplace: Workplace,
  session: SessionAnswer,
  projectId: string | null,
): readonly AreaShown[] {
  return workplace.areas
    .map((area) => {
      const inArea = workplace.places.filter(
        (place) => place.area === area.id && (place.shown === undefined || place.shown(session)),
      );
      const ofProject = inArea.some((place) => hrefOf(place, null) === null);
      return {
        ...area,
        href: areaHref(area.id, ofProject ? projectId : null),
        links: inArea.flatMap((place) => {
          const href = hrefOf(place, projectId);
          return href === null ? [] : [{ label: place.title({}), href, glyph: place.glyph }];
        }),
      };
    })
    .filter((area) => area.links.length > 0);
}

// A ticket's window's title: its workflow and number where the address names a workflow there is.
export function ticketTitle(
  workflow: string | undefined,
  ticketNumber: string | undefined,
): string {
  const known = workflows.find((each) => each === workflow);
  return known === undefined
    ? say(words.desk.titles.ticket, { number: ticketNumber ?? '' })
    : say(words.review.ticket.title, {
        workflow: words.review.workflows[known],
        number: ticketNumber ?? '',
      });
}

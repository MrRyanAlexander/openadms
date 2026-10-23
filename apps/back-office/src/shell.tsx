// The back office's frame, a desktop (the user, 2026-10-22: "like a classic desktop computer
// program … a real desktop with icons you can click on"; ARCHITECTURE §14):
//
// - **The menu bar** across the top (desk/menu-bar.tsx, WAI-ARIA's menubar): the firm's ADMS name;
//   File (the desktop, your account, sign out), View (the theme), the work's own menus, one per
//   area of the workplace (the firm's, then the project's Tickets, Reports and Forms, Billings,
//   Dispatch and hours, Setup), Window (the open windows; minimize, maximize, close) and Help
//   (About). Under it the project picker and the person's own link, always in view. Every item is
//   shown only to a person who may open it (desk/places.ts, `shown`).
// - **The desktop** behind the windows: a folder icon for each area the person may open (a
//   project's once a project is open); a folder opens as a window of the area's icons.
// - **Windows:** every screen is shown in one, its title bar naming it. **The address is the
//   truth**: the window shown is the screen the address names, the only routed screen mounted, so
//   deep links, Back and Forward and a test's `goto(url)` keep working; the other open windows are
//   the taskbar's, each opening its address again (desk/open-windows.ts). Minimize and close go back
//   to the desktop (close takes it off the taskbar too); maximize fills the desktop with it.
// - **The page scrolls as one**, the bars with it, a window as tall as its screen (a window
//   scrolling within itself would hide its words from a person zoomed in; bars held in view would
//   cover what scrolls beneath them).
// - **Small screens and large text:** where the menus don't fit across they fold into one; where
//   the desktop is narrow (320 px, text at 200%) every window is maximized (office.css; WCAG
//   1.4.10, 2.4.11).
//
// Signed out, the sign-in is a window on an empty desktop (`SignedOutDesk`).
import { listProjectsEndpoint, viewerProjectsEndpoint } from '@open-adms/contracts';
import { ScreenTitle } from '@open-adms/look';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-aria-components';

import { useBrand, type Brand } from './brand.tsx';
import { Glyph, type GlyphName } from './desk/glyphs.tsx';
import { IconGrid } from './desk/icon-grid.tsx';
import { MenuBar, type Menu, type MenuEntry } from './desk/menu-bar.tsx';
import {
  closed,
  kept,
  onTaskbar,
  opened,
  recalled,
  windowKey,
  type DeskMemory,
} from './desk/open-windows.ts';
import {
  aboutHref,
  areasFor,
  deskPlaceOf,
  desktopOf,
  placeOf,
  projectOfPath,
  type AreaShown,
  type Workplace,
} from './desk/places.ts';
import { useMaximized, useTheme, type Theme } from './desk/preferences.ts';
import { WindowFrame } from './desk/window-frame.tsx';
import { SelectField } from './look/fields.tsx';
import { useRead } from './reading.tsx';
import { navigate, useWhere } from './router.tsx';
import { About } from './screens/about.tsx';
import { useSigned } from './session.tsx';
import { say, words } from './words.ts';

// What the desktop shows: itself, or one window.
type Shown =
  | { readonly kind: 'desktop' }
  | {
      readonly kind: 'window';
      readonly key: string;
      readonly title: string;
      readonly glyph: GlyphName;
      readonly screen: ReactNode;
    };

export function Shell({ workplace }: { readonly workplace: Workplace }) {
  const signed = useSigned();
  const { session } = signed;
  const said = words.desk;
  const { path, query } = useWhere();
  const search = query.toString();
  const href = search === '' ? path : `${path}?${search}`;
  const userId = session.user.id;
  const [memory, setMemory] = useState<DeskMemory>(() => recalled(userId));
  const [maximized, setMaximized] = useMaximized();
  const [theme, setTheme] = useTheme();

  // The project open: the address's, or the one last open while a firm's window is shown.
  const desk = deskPlaceOf(path);
  const addressProject =
    desk === null ? projectOfPath(path) : desk.kind === 'about' ? null : desk.projectId;
  const projectId = addressProject ?? memory.projectId;
  const areas = areasFor(workplace, session, projectId);
  // What the firm calls its ADMS, and the Open ADMS it is built on (brand.tsx).
  const brand = useBrand();
  const shown = shownAt(workplace, path, desk, areas, brand);
  const live = shown.kind === 'window' ? shown.key : null;
  const liveTitle = shown.kind === 'window' ? shown.title : null;
  const liveGlyph = shown.kind === 'window' ? shown.glyph : null;

  // The window shown joins the taskbar, and the project open is remembered.
  useEffect(() => {
    setMemory((was) => {
      const windows =
        live === null || liveTitle === null || liveGlyph === null
          ? was.windows
          : opened(was.windows, {
              key: live,
              href,
              title: liveTitle,
              glyph: liveGlyph,
              projectId: projectOfPath(path),
            });
      const remembered = addressProject ?? was.projectId;
      return windows === was.windows && remembered === was.projectId
        ? was
        : { windows, projectId: remembered };
    });
  }, [href, path, live, liveTitle, liveGlyph, addressProject]);

  useEffect(() => {
    kept(userId, memory);
  }, [userId, memory]);

  const toDesktop = useCallback(() => {
    navigate(desktopOf(projectId));
  }, [projectId]);
  const close = useCallback(() => {
    if (live !== null) setMemory((was) => ({ ...was, windows: closed(was.windows, live) }));
    navigate(desktopOf(projectId));
  }, [live, projectId]);

  const taskbar = onTaskbar(memory.windows, projectId);
  const { name } = brand;

  const themes: readonly (readonly [Theme, string])[] = [
    ['computer', said.themeComputer],
    ['light', said.themeLight],
    ['dark', said.themeDark],
  ];
  const noWindow = live === null;
  const menus: readonly Menu[] = [
    {
      id: 'file',
      label: said.file,
      entries: [
        {
          kind: 'link',
          id: 'desktop',
          label: said.showDesktop,
          href: desktopOf(projectId),
          current: shown.kind === 'desktop',
        },
        {
          kind: 'link',
          id: 'account',
          label: words.shell.account,
          href: '/account',
          current: path === '/account',
        },
        { kind: 'line', id: 'file-line' },
        {
          kind: 'act',
          id: 'sign-out',
          label: words.shell.signOut,
          act: () => {
            void signed.signOut();
          },
        },
      ],
    },
    {
      id: 'view',
      label: said.view,
      entries: themes.map(([each, label]) => ({
        kind: 'pick' as const,
        id: `theme-${each}`,
        label,
        picked: theme === each,
        act: () => {
          setTheme(each);
        },
      })),
    },
    ...areas.map((area) => ({
      id: `area-${area.id}`,
      label: area.label,
      entries: area.links.map((link): MenuEntry => ({
        kind: 'link',
        id: `${area.id}:${link.href}`,
        label: link.label,
        href: link.href,
        current: path === link.href,
      })),
    })),
    {
      id: 'window',
      label: said.window,
      entries: [
        ...(taskbar.length === 0
          ? [
              {
                kind: 'act' as const,
                id: 'no-windows',
                label: said.noWindows,
                act: () => undefined,
                disabled: true,
              },
            ]
          : taskbar.map((open): MenuEntry => ({
              kind: 'link',
              id: `window:${open.key}`,
              label: open.title,
              href: open.href,
              current: open.key === live,
            }))),
        { kind: 'line', id: 'window-line' },
        { kind: 'act', id: 'minimize', label: said.minimize, act: toDesktop, disabled: noWindow },
        {
          kind: 'act',
          id: 'maximize',
          label: maximized ? said.restore : said.maximize,
          act: () => {
            setMaximized(!maximized);
          },
          disabled: noWindow,
        },
        { kind: 'act', id: 'close', label: said.close, act: close, disabled: noWindow },
      ],
    },
    {
      id: 'help',
      label: said.help,
      entries: [
        {
          kind: 'link',
          id: 'about',
          label: say(said.about, { name }),
          href: aboutHref,
          current: path === aboutHref,
        },
      ],
    },
  ];

  return (
    <div className={maximized ? 'desk-app desk-maximized' : 'desk-app'}>
      <a className="skip-link" href="#content">
        {words.common.skipToContent}
      </a>
      <header className="desk-top">
        <div className="menubar-row">
          <span className="desk-brand">{name}</span>
          <MenuBar label={said.menus} menus={menus} foldedLabel={words.shell.menu} />
        </div>
        <div className="desk-toolbar">
          <ProjectPicker projectId={projectId} addressProject={addressProject} />
          <nav className="desk-own" aria-label={words.shell.account}>
            <Link className="link" href="/account">
              {session.user.name}
            </Link>
          </nav>
        </div>
      </header>
      <div className="desk">
        <div className={shown.kind === 'window' ? 'desk-inside desk-with-window' : 'desk-inside'}>
          {shown.kind === 'desktop' ? (
            <main data-screen="desktop" className="desk-main" id="content">
              <div className="unseen">
                <ScreenTitle>{said.desktop}</ScreenTitle>
              </div>
              <IconGrid label={said.icons} icons={areas} className="desk-icons" />
            </main>
          ) : (
            <>
              <IconGrid label={said.icons} icons={areas} className="desk-icons desk-icons-beside" />
              <WindowFrame
                key={shown.key}
                title={shown.title}
                glyph={shown.glyph}
                acts={{
                  maximized,
                  onMinimize: toDesktop,
                  onMaximize: setMaximized,
                  onClose: close,
                }}
              >
                {shown.screen}
              </WindowFrame>
            </>
          )}
        </div>
      </div>
      <nav className="taskbar" aria-label={said.windows}>
        <ul className="taskbar-list">
          <li>
            <Link
              className="taskbar-button"
              href={desktopOf(projectId)}
              {...(shown.kind === 'desktop' ? { 'aria-current': 'page' as const } : {})}
            >
              <Glyph name="desktop" />
              <span>{said.showDesktop}</span>
            </Link>
          </li>
          {taskbar.map((open) => (
            <li key={open.key}>
              <Link
                className="taskbar-button"
                href={open.href}
                {...(open.key === live ? { 'aria-current': 'page' as const } : {})}
              >
                <Glyph name={open.glyph} />
                <span>{open.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// What an address shows: the desktop, an area's folder, About, or a workplace's screen (or Not
// found), each but the desktop in its window.
function shownAt(
  workplace: Workplace,
  path: string,
  desk: ReturnType<typeof deskPlaceOf>,
  areas: readonly AreaShown[],
  brand: Brand,
): Shown {
  const notFound: Shown = {
    kind: 'window',
    key: windowKey(null, 'not-found'),
    title: workplace.notFoundTitle,
    glyph: 'about',
    screen: workplace.notFound(),
  };
  if (desk?.kind === 'desktop') return { kind: 'desktop' };
  if (desk?.kind === 'about') {
    return {
      kind: 'window',
      key: windowKey(null, aboutHref),
      title: say(words.desk.about, { name: brand.name }),
      glyph: 'about',
      screen: <About name={brand.name} version={brand.version} />,
    };
  }
  if (desk?.kind === 'area') {
    const area = areas.find((each) => each.id === desk.area);
    if (area === undefined) return notFound;
    return {
      kind: 'window',
      key: windowKey(desk.projectId, `/areas/${area.id}`),
      title: area.label,
      glyph: 'folder',
      screen: <AreaFolder area={area} />,
    };
  }
  const routed = placeOf(workplace.places, path);
  if (routed === null) return notFound;
  return {
    kind: 'window',
    key: windowKey(projectOfPath(path), routed.place.window ?? routed.place.at),
    title: routed.place.title(routed.params),
    glyph: routed.place.glyph,
    screen: routed.place.screen(routed.params),
  };
}

// An area's folder: the places in it the person may open, as icons.
function AreaFolder({ area }: { readonly area: AreaShown }) {
  return (
    <main data-screen="area" className="page" id="content">
      <ScreenTitle>{area.label}</ScreenTitle>
      <p>{words.desk.areaAbout}</p>
      <IconGrid
        label={say(words.desk.areaIcons, { area: area.label })}
        icons={area.links}
        className="folder-icons"
      />
    </main>
  );
}

// Signed out (or yet to choose a password or set up two-step sign-in): the screen as a window on an
// empty desktop, under the bar with the firm's ADMS name.
export function SignedOutDesk({ children }: { readonly children: ReactNode }) {
  const { name } = useBrand();
  return (
    <div className="desk-app desk-signed-out">
      <header className="desk-top">
        <div className="menubar-row">
          <span className="desk-brand">{name}</span>
        </div>
      </header>
      <div className="desk">
        <div className="desk-inside desk-with-window">
          <WindowFrame title={name} glyph="account">
            {children}
          </WindowFrame>
        </div>
      </div>
    </div>
  );
}

// The project picker: the firm's open projects by name (a viewer's, theirs); picking one moves to
// the same screen of that project where the screen is a project's, to its desktop from the
// desktop, else to the project's own page.
function ProjectPicker({
  projectId,
  addressProject,
}: {
  readonly projectId: string | null;
  readonly addressProject: string | null;
}) {
  const viewer = useSigned().session.user.role === 'READ_ONLY_VIEWER';
  const [firm] = useRead(
    listProjectsEndpoint,
    viewer ? null : { query: { closed: 'false', limit: '200' } },
  );
  const [given] = useRead(viewerProjectsEndpoint, viewer ? { query: { limit: '200' } } : null);
  const read = viewer ? given : firm;
  const { path } = useWhere();
  const projects: readonly { readonly id: string; readonly name: string }[] =
    read.kind === 'answered' ? read.answer.projects : [];
  const known = projectId !== null && projects.some(({ id }) => id === projectId);
  return (
    <div className="project-picker">
      <SelectField
        label={words.shell.project}
        labelHidden
        placeholder={words.shell.noProject}
        options={projects.map(({ id, name }) => ({ id, label: name }))}
        value={known ? projectId : null}
        onChange={(id) => {
          if (id === null) return;
          if (addressProject !== null) {
            navigate(`/projects/${id}${path.slice(`/projects/${addressProject}`.length)}`);
          } else if (path === desktopOf(null)) navigate(desktopOf(id));
          else navigate(`/projects/${id}`);
        }}
      />
    </div>
  );
}

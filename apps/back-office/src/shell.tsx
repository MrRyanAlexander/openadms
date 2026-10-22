// The back office's frame (FROM-BUILD-1 §8, §13; ARCHITECTURE §14): a header always in view with,
// on its left, the button that opens and closes the menu; the firm's name; the project picker; and
// the person's own links. **The menu is closed by default** and takes no room while closed; opened,
// it lies over the page, and closes again on a link chosen, on Escape, or on a press outside it
// (the user's ask). Its sections are those of the work: the firm's, then the project's Tickets,
// Reports and Forms, and Billings (never "Money"), then Setup and People and phones, each link shown
// only to a person who may open it. The screen beneath is the one the address names.
import { listProjectsEndpoint, viewerProjectsEndpoint } from '@open-adms/contracts';
import { Button } from '@open-adms/look';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-aria-components';

import { SelectField } from './look/fields.tsx';

import { navigate, useWhere } from './router.tsx';
import { useRead } from './reading.tsx';
import { useSigned, type Signed } from './session.tsx';
import { words } from './words.ts';

// A link of the menu: its words, where it goes, and who may see it.
export interface MenuLink {
  readonly label: string;
  readonly href: string;
  readonly shown: boolean;
}

export interface MenuSection {
  readonly label: string;
  readonly links: readonly MenuLink[];
}

// The project a path is inside, if any: /projects/<id>/…
export function projectOfPath(path: string): string | null {
  const read = /^\/projects\/([0-9a-f-]{36})(?:\/|$)/.exec(path);
  return read?.[1] ?? null;
}

export function Shell({
  sections,
  children,
}: {
  readonly sections: (signed: Signed, projectId: string | null) => readonly MenuSection[];
  readonly children: ReactNode;
}) {
  const signed = useSigned();
  const { path } = useWhere();
  const projectId = projectOfPath(path);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const menu = useRef<HTMLElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const said = words.shell;

  // Closed on Escape and on a press outside it, its button given the focus back.
  useEffect(() => {
    if (!open) return;
    const pressed = (event: PointerEvent) => {
      const at = event.target;
      if (!(at instanceof Node)) return;
      if (menu.current?.contains(at) === true || toggle.current?.contains(at) === true) return;
      setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', pressed, true);
    document.addEventListener('keydown', key);
    menu.current?.querySelector<HTMLElement>('a')?.focus();
    return () => {
      document.removeEventListener('pointerdown', pressed, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  // A link chosen moves the page and closes the menu (one to the screen already shown closes it by
  // its press).
  useEffect(() => {
    setOpen(false);
  }, [path]);

  return (
    <div className="office">
      <a className="skip-link" href="#content">
        {words.common.skipToContent}
      </a>
      <header className="office-header">
        <button
          ref={toggle}
          type="button"
          className="menu-toggle"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => {
            setOpen((was) => !was);
          }}
        >
          <span className="menu-toggle-bars" aria-hidden="true" />
          <span>{said.menu}</span>
        </button>
        <span className="office-name">{words.app.name}</span>
        <ProjectPicker projectId={projectId} />
        <nav className="office-own" aria-label={said.account}>
          <Link className="link" href="/account">
            {signed.session.user.name}
          </Link>
        </nav>
      </header>
      <nav
        ref={menu}
        id={menuId}
        className="office-menu"
        aria-label={said.navigation}
        hidden={!open}
      >
        {sections(signed, projectId).map((section) => {
          const links = section.links.filter((link) => link.shown);
          if (links.length === 0) return null;
          return (
            <section key={section.label} className="menu-section">
              <h2 className="menu-heading">{section.label}</h2>
              <ul className="menu-links">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      className="menu-link"
                      href={link.href}
                      onPress={() => {
                        setOpen(false);
                      }}
                      {...(path === link.href ? { 'aria-current': 'page' as const } : {})}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        <div className="menu-foot">
          <Button
            onPress={() => {
              void signed.signOut();
            }}
          >
            {said.signOut}
          </Button>
        </div>
      </nav>
      {children}
    </div>
  );
}

// The project picker: the firm's open projects by name; picking one moves to the same screen of
// that project where the screen is a project's, else to the project's first screen.
function ProjectPicker({ projectId }: { readonly projectId: string | null }) {
  // A read-only viewer picks among the projects they are given, through their own read.
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
          const rest = projectId === null ? '' : path.slice(`/projects/${projectId}`.length);
          navigate(`/projects/${id}${rest}`);
        }}
      />
    </div>
  );
}

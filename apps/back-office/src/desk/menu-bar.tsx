// The menu bar across the top, as a desktop program has (the user, 2026-10-22), on WAI-ARIA's
// menubar pattern: one stop of Tab; Left and Right move between its menus (and carry an open menu
// along); Down, Enter or Space opens one at its first item, Up at its last; inside a menu Up and
// Down move (Home and End to the ends), a letter moves to the next item it begins, Enter or Space
// chooses, Escape closes it and gives the focus back to its menu's name, Tab closes it and moves
// on. A pointer opens a menu by its name and chooses by an item; a press anywhere else closes it.
// Where its menus don't fit across (a narrow screen, large text) they fold into one menu, each a
// group in it under its own name (WCAG 1.4.10). A link chosen moves the page, so the screen it
// opens takes the focus (its title, `ScreenTitle`).
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { navigate } from '../router.tsx';

export type MenuEntry =
  | {
      readonly kind: 'link';
      readonly id: string;
      readonly label: string;
      readonly href: string;
      readonly current?: boolean;
    }
  | {
      readonly kind: 'act';
      readonly id: string;
      readonly label: string;
      readonly act: () => void;
      readonly disabled?: boolean;
    }
  | {
      readonly kind: 'pick';
      readonly id: string;
      readonly label: string;
      readonly picked: boolean;
      readonly act: () => void;
    }
  | { readonly kind: 'line'; readonly id: string }
  | {
      readonly kind: 'group';
      readonly id: string;
      readonly label: string;
      readonly entries: readonly MenuEntry[];
    };

export interface Menu {
  readonly id: string;
  readonly label: string;
  readonly entries: readonly MenuEntry[];
}

const itemSelector = '[role="menuitem"], [role="menuitemradio"]';

// The entry a menu item stands for, found by its id among the menus.
function entryOf(entries: readonly MenuEntry[], id: string): MenuEntry | null {
  for (const entry of entries) {
    if (entry.id === id) return entry;
    if (entry.kind === 'group') {
      const found = entryOf(entry.entries, id);
      if (found !== null) return found;
    }
  }
  return null;
}

// Whether a key pressed is a letter or a number, for moving to the item it begins.
const isLetter = (event: KeyboardEvent): boolean =>
  event.key.length === 1 &&
  /\S/.test(event.key) &&
  !event.ctrlKey &&
  !event.metaKey &&
  !event.altKey;

// From `from`, the next of `labels` that begins with `letter`, round to the start.
export function nextByLetter(labels: readonly string[], from: number, letter: string): number {
  const wanted = letter.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const at = (from + step) % labels.length;
    if ((labels[at] ?? '').trim().toLocaleLowerCase().startsWith(wanted)) return at;
  }
  return from;
}

export function MenuBar({
  label,
  menus,
  foldedLabel,
}: {
  readonly label: string;
  readonly menus: readonly Menu[];
  // The one menu's name when the menus are folded together.
  readonly foldedLabel: string;
}) {
  const fit = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);

  // Folded when the menus' names, side by side, are wider than the room for them.
  useLayoutEffect(() => {
    const room = fit.current;
    const wanted = ruler.current;
    if (room === null || wanted === null) return;
    const measure = () => {
      setFolded(wanted.offsetWidth > room.clientWidth);
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(room);
    watching.observe(wanted);
    return () => {
      watching.disconnect();
    };
  }, []);

  const shown: readonly Menu[] = folded
    ? [
        {
          id: 'folded',
          label: foldedLabel,
          entries: menus.map((menu) => ({
            kind: 'group' as const,
            id: `group-${menu.id}`,
            label: menu.label,
            entries: menu.entries,
          })),
        },
      ]
    : menus;

  return (
    <div className={folded ? 'menubar-fit menubar-fit-folded' : 'menubar-fit'} ref={fit}>
      <Bar label={label} menus={shown} />
      <div className="menubar-measure" aria-hidden="true">
        <div className="menubar-ruler" ref={ruler}>
          {menus.map((menu) => (
            <span key={menu.id} className="menubar-name">
              {menu.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Bar({ label, menus }: { readonly label: string; readonly menus: readonly Menu[] }) {
  const barId = useId();
  const bar = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  // Each time a menu is asked open, and where the focus goes then: its first item, its last, or
  // staying on its name; and whether it is held to the screen's end edge to stay within it.
  const [asked, setAsked] = useState(0);
  const landing = useRef<'first' | 'last' | 'name'>('name');
  const [atEnd, setAtEnd] = useState(false);
  const at = Math.min(active, Math.max(menus.length - 1, 0));

  const names = () => [...(bar.current?.querySelectorAll<HTMLElement>('.menubar-name') ?? [])];
  const items = () => [
    ...(bar.current?.querySelectorAll<HTMLElement>(`.menu-drop ${itemSelector}`) ?? []),
  ];

  const focusName = useCallback((index: number) => {
    setActive(index);
    bar.current?.querySelectorAll<HTMLElement>('.menubar-name')[index]?.focus();
  }, []);

  const openAt = (index: number, land: 'first' | 'last' | 'name') => {
    landing.current = land;
    setActive(index);
    if (open !== index) setAtEnd(false);
    setOpen(index);
    setAsked((count) => count + 1);
    if (land === 'name') names()[index]?.focus();
  };

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(null);
      if (refocus) focusName(at);
    },
    [at, focusName],
  );

  // A menu opened: held to its name's end edge where it would pass the screen's; the focus to
  // where it was asked.
  useLayoutEffect(() => {
    if (open === null) return;
    const drop = bar.current?.querySelector<HTMLElement>('.menu-drop');
    if (drop?.classList.contains('menu-drop-end') === false) {
      if (drop.getBoundingClientRect().right > document.documentElement.clientWidth) {
        setAtEnd(true);
      }
    }
    const all = items();
    if (landing.current === 'first') all[0]?.focus();
    if (landing.current === 'last') all.at(-1)?.focus();
  }, [open, asked]);

  // Closed by a press outside the bar, or the focus leaving it.
  useEffect(() => {
    if (open === null) return;
    const pressed = (event: PointerEvent) => {
      if (event.target instanceof Node && bar.current?.contains(event.target) === true) return;
      setOpen(null);
    };
    document.addEventListener('pointerdown', pressed, true);
    return () => {
      document.removeEventListener('pointerdown', pressed, true);
    };
  }, [open]);

  const choose = (id: string) => {
    const menu = open === null ? undefined : menus[open];
    const entry = menu === undefined ? null : entryOf(menu.entries, id);
    if (entry === null) return;
    if (entry.kind === 'act' && entry.disabled === true) return;
    close(true);
    if (entry.kind === 'link') navigate(entry.href);
    if (entry.kind === 'act' || entry.kind === 'pick') entry.act();
  };

  const onName = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const count = menus.length;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        const next = (index + (event.key === 'ArrowRight' ? 1 : count - 1)) % count;
        if (open === null) focusName(next);
        else openAt(next, 'first');
        break;
      }
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        openAt(index, 'first');
        break;
      case 'ArrowUp':
        openAt(index, 'last');
        break;
      case 'Home':
        focusName(0);
        break;
      case 'End':
        focusName(count - 1);
        break;
      case 'Escape':
        if (open === null) return;
        close(true);
        break;
      default: {
        if (!isLetter(event)) return;
        const labels = menus.map((menu) => menu.label);
        focusName(nextByLetter(labels, index, event.key));
      }
    }
    event.preventDefault();
  };

  const onItem = (event: KeyboardEvent<HTMLElement>, id: string) => {
    const all = items();
    const here = all.findIndex((item) => item === event.currentTarget);
    const count = menus.length;
    switch (event.key) {
      case 'ArrowDown':
        all[(here + 1) % all.length]?.focus();
        break;
      case 'ArrowUp':
        all[(here - 1 + all.length) % all.length]?.focus();
        break;
      case 'Home':
        all[0]?.focus();
        break;
      case 'End':
        all.at(-1)?.focus();
        break;
      case 'ArrowRight':
      case 'ArrowLeft':
        if (count < 2) return;
        openAt((at + (event.key === 'ArrowRight' ? 1 : count - 1)) % count, 'first');
        break;
      case 'Escape':
        close(true);
        break;
      case 'Tab':
        setOpen(null);
        return;
      case 'Enter':
      case ' ':
        choose(id);
        break;
      default: {
        if (!isLetter(event)) return;
        const labels = all.map((item) => item.textContent);
        all[nextByLetter(labels, here, event.key)]?.focus();
      }
    }
    event.preventDefault();
  };

  // A link pressed by a pointer moves the page here; with a modifier key, the browser's own way
  // (a new tab or window).
  const pressedLink = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    choose(id);
  };

  const item = (entry: MenuEntry) => {
    switch (entry.kind) {
      case 'line':
        return <li key={entry.id} role="separator" className="menu-line" />;
      case 'group': {
        const groupId = `${barId}-${entry.id}`;
        return (
          <li key={entry.id} role="none" className="menu-group">
            <span id={groupId} className="menu-group-name">
              {entry.label}
            </span>
            <ul role="group" aria-labelledby={groupId} className="menu-group-items">
              {entry.entries.map((each) => item(each))}
            </ul>
          </li>
        );
      }
      case 'link':
        return (
          <li key={entry.id} role="none">
            <a
              role="menuitem"
              className="menu-item"
              href={entry.href}
              tabIndex={-1}
              {...(entry.current === true ? { 'aria-current': 'page' as const } : {})}
              onClick={(event) => {
                pressedLink(event, entry.id);
              }}
              onKeyDown={(event) => {
                onItem(event, entry.id);
              }}
            >
              <span className="menu-mark" />
              {entry.label}
            </a>
          </li>
        );
      case 'act':
      case 'pick':
        return (
          <li key={entry.id} role="none">
            <div
              role={entry.kind === 'pick' ? 'menuitemradio' : 'menuitem'}
              className="menu-item"
              tabIndex={-1}
              {...(entry.kind === 'pick' ? { 'aria-checked': entry.picked } : {})}
              {...(entry.kind === 'act' && entry.disabled === true
                ? { 'aria-disabled': true }
                : {})}
              onClick={() => {
                choose(entry.id);
              }}
              onKeyDown={(event) => {
                onItem(event, entry.id);
              }}
            >
              <span className="menu-mark" />
              {entry.label}
            </div>
          </li>
        );
    }
  };

  return (
    <ul ref={bar} role="menubar" aria-label={label} className="menubar">
      {menus.map((menu, index) => {
        const nameId = `${barId}-${menu.id}`;
        const isOpen = open === index;
        return (
          <li key={menu.id} role="none" className="menubar-slot">
            <span
              id={nameId}
              role="menuitem"
              className="menubar-name"
              tabIndex={index === at ? 0 : -1}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onFocus={() => {
                setActive(index);
              }}
              onClick={() => {
                if (isOpen) close(true);
                else openAt(index, 'name');
              }}
              onPointerEnter={() => {
                if (open !== null && !isOpen) openAt(index, 'name');
              }}
              onKeyDown={(event) => {
                onName(event, index);
              }}
            >
              {menu.label}
            </span>
            {isOpen ? (
              <ul
                role="menu"
                aria-labelledby={nameId}
                className={atEnd ? 'menu-drop menu-drop-end' : 'menu-drop'}
              >
                {menu.entries.map((entry) => item(entry))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

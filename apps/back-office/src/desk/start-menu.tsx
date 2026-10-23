// The Start button and its menu, at the taskbar's start (the user, 2026-10-23: the back office is
// "like their Disaster Recovery Monitoring OS", a classic desktop). The menu lists what the menu
// bar already offers, never a screen of its own: the desktop, each area of the workplace the person
// may open (a group that opens in place to its screens), the background to pick, the account, About
// and sign out. On WAI-ARIA's menu pattern: Enter, Space or a press opens it at its first item; Up
// and Down move (Home and End to the ends); Right opens a group and Left closes it; a letter moves
// to the next item it begins; Enter or Space chooses; Escape closes it and gives the focus back to
// the button; Tab or a press elsewhere closes it. Touch needs no more than a press.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Button } from 'react-aria-components';

import { navigate } from '../router.tsx';
import { Glyph } from './glyphs.tsx';
import { nextByLetter, type MenuEntry } from './menu-bar.tsx';

const itemSelector = '[role="menuitem"], [role="menuitemradio"]';

export function StartMenu({
  label,
  buttonLabel,
  entries,
}: {
  // The menu's name for a screen reader.
  readonly label: string;
  // The button's word.
  readonly buttonLabel: string;
  readonly entries: readonly MenuEntry[];
}) {
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const items = () => [
    ...(root.current?.querySelectorAll<HTMLElement>(`.start-menu ${itemSelector}`) ?? []),
  ];

  const close = (refocus: boolean) => {
    setOpen(false);
    setOpened(null);
    if (refocus) button.current?.focus();
  };

  // Opened: the focus goes to its first item.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  // Closed by a press outside it.
  useEffect(() => {
    if (!open) return;
    const pressed = (event: PointerEvent) => {
      if (event.target instanceof Node && root.current?.contains(event.target) === true) return;
      setOpen(false);
      setOpened(null);
    };
    document.addEventListener('pointerdown', pressed, true);
    return () => {
      document.removeEventListener('pointerdown', pressed, true);
    };
  }, [open]);

  const choose = (entry: MenuEntry) => {
    if (entry.kind === 'group') {
      setOpened((was) => (was === entry.id ? null : entry.id));
      return;
    }
    if (entry.kind === 'act' && entry.disabled === true) return;
    close(true);
    if (entry.kind === 'link') navigate(entry.href);
    if (entry.kind === 'act' || entry.kind === 'pick') entry.act();
  };

  const onItem = (event: KeyboardEvent<HTMLElement>, entry: MenuEntry) => {
    const all = items();
    const here = all.findIndex((each) => each === event.currentTarget);
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
        if (entry.kind !== 'group') return;
        setOpened(entry.id);
        break;
      case 'ArrowLeft':
        if (opened === null) return;
        setOpened(null);
        // Back to the group that was open.
        root.current?.querySelector<HTMLElement>('[aria-expanded="true"]')?.focus();
        break;
      case 'Escape':
        close(true);
        break;
      case 'Tab':
        close(false);
        return;
      case 'Enter':
      case ' ':
        choose(entry);
        break;
      default: {
        if (
          event.key.length !== 1 ||
          !/\S/.test(event.key) ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return;
        }
        const labels = all.map((each) => each.textContent);
        all[nextByLetter(labels, here, event.key)]?.focus();
      }
    }
    event.preventDefault();
  };

  // A link pressed by a pointer moves the page here; with a modifier key, the browser's own way.
  const pressedLink = (event: MouseEvent<HTMLAnchorElement>, entry: MenuEntry) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    choose(entry);
  };

  const item = (entry: MenuEntry, nested: boolean) => {
    switch (entry.kind) {
      case 'line':
        return <li key={entry.id} role="separator" className="start-line" />;
      case 'group': {
        const isOpen = opened === entry.id;
        return (
          <li key={entry.id} role="none">
            <div
              role="menuitem"
              className="start-item start-group"
              tabIndex={-1}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => {
                choose(entry);
              }}
              onKeyDown={(event) => {
                onItem(event, entry);
              }}
            >
              <span className="start-label">{entry.label}</span>
              <span className="start-arrow" aria-hidden="true" />
            </div>
            {isOpen ? (
              <ul role="menu" aria-label={entry.label} className="start-sub">
                {entry.entries.map((each) => item(each, true))}
              </ul>
            ) : null}
          </li>
        );
      }
      case 'link':
        return (
          <li key={entry.id} role="none">
            <a
              role="menuitem"
              className={nested ? 'start-item start-nested' : 'start-item'}
              href={entry.href}
              tabIndex={-1}
              {...(entry.current === true ? { 'aria-current': 'page' as const } : {})}
              onClick={(event) => {
                pressedLink(event, entry);
              }}
              onKeyDown={(event) => {
                onItem(event, entry);
              }}
            >
              <span className="start-label">{entry.label}</span>
            </a>
          </li>
        );
      case 'act':
      case 'pick':
        return (
          <li key={entry.id} role="none">
            <div
              role={entry.kind === 'pick' ? 'menuitemradio' : 'menuitem'}
              className={nested ? 'start-item start-nested' : 'start-item'}
              tabIndex={-1}
              {...(entry.kind === 'pick' ? { 'aria-checked': entry.picked } : {})}
              {...(entry.kind === 'act' && entry.disabled === true
                ? { 'aria-disabled': true }
                : {})}
              onClick={() => {
                choose(entry);
              }}
              onKeyDown={(event) => {
                onItem(event, entry);
              }}
            >
              {entry.kind === 'pick' ? <span className="start-mark" aria-hidden="true" /> : null}
              <span className="start-label">{entry.label}</span>
            </div>
          </li>
        );
    }
  };

  return (
    <div className="start" ref={root}>
      <Button
        ref={button}
        className="start-button"
        aria-haspopup="menu"
        aria-expanded={open}
        {...(open ? { 'aria-controls': menuId } : {})}
        onPress={() => {
          if (open) close(false);
          else setOpen(true);
        }}
      >
        <Glyph name="desktop" />
        <span>{buttonLabel}</span>
      </Button>
      {open ? (
        <ul id={menuId} role="menu" aria-label={label} className="start-menu">
          {entries.map((entry) => item(entry, false))}
        </ul>
      ) : null}
    </div>
  );
}

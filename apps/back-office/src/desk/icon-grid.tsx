// Icons in a grid, as on a desktop or in a folder's window: each a picture and its words, a link to
// the place it opens. **One press opens it**, by pointer, by touch or by Enter (never a
// double-click alone, WCAG 2.5.1, 2.5.7). Every icon is a stop of Tab, and the arrow keys move
// between them by where they stand on the screen (Home and End to the first and last), as on a
// desktop.
import type { KeyboardEvent } from 'react';
import { Link } from 'react-aria-components';

import { Glyph } from './glyphs.tsx';
import type { PlaceLink } from './places.ts';

type Direction = 'left' | 'right' | 'up' | 'down';

const directions: Readonly<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

// The icon an arrow moves to from the one at `from`: the nearest whose middle lies that way, the
// way itself counting less than the distance across it; none where nothing lies that way.
export function nextIcon(boxes: readonly Box[], from: number, direction: Direction): number | null {
  const here = boxes[from];
  if (here === undefined) return null;
  const middle = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
  const at = middle(here);
  let best: { readonly index: number; readonly score: number } | null = null;
  for (const [index, box] of boxes.entries()) {
    if (index === from) continue;
    const there = middle(box);
    const dx = there.x - at.x;
    const dy = there.y - at.y;
    const [along, across] =
      direction === 'left'
        ? [-dx, dy]
        : direction === 'right'
          ? [dx, dy]
          : direction === 'up'
            ? [-dy, dx]
            : [dy, dx];
    if (along < 1) continue;
    const score = along + 2 * Math.abs(across);
    if (best === null || score < best.score) best = { index, score };
  }
  return best?.index ?? null;
}

export function IconGrid({
  label,
  icons,
  className,
}: {
  readonly label: string;
  readonly icons: readonly PlaceLink[];
  readonly className?: string;
}) {
  const moved = (event: KeyboardEvent<HTMLUListElement>) => {
    const all = [...event.currentTarget.querySelectorAll<HTMLElement>('.desk-icon')];
    const from = all.findIndex((icon) => icon === document.activeElement);
    if (from < 0) return;
    const direction = directions[event.key];
    const to =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? all.length - 1
          : direction === undefined
            ? undefined
            : nextIcon(
                all.map((icon) => icon.getBoundingClientRect()),
                from,
                direction,
              );
    if (to === undefined) return;
    event.preventDefault();
    if (to !== null) all[to]?.focus();
  };
  return (
    <nav className={className === undefined ? 'icons' : `icons ${className}`} aria-label={label}>
      <ul className="icon-grid" onKeyDown={moved}>
        {icons.map((icon) => (
          <li key={icon.href}>
            <Link className="desk-icon" href={icon.href}>
              <span className="desk-icon-tile">
                <Glyph name={icon.glyph} />
              </span>
              <span className="desk-icon-label">{icon.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

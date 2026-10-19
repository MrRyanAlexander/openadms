// The bottom menu (the user, Q-217, ADR-573): Work, Time where the project has the time clock on,
// Sync and Settings, in thumb reach on every screen of a signed-in phone. Each is a button as tall
// as any other (WCAG 2.5.8); the one shown now is marked by its edge as well as its colour, never
// colour alone, and the screen's heading says where the monitor is.
import { Button as Pressable } from 'react-aria-components';

import { words } from '../words.ts';

export type MenuItem = 'work' | 'time' | 'sync' | 'settings';

export function BottomMenu({
  items,
  current,
  onPick,
}: {
  readonly items: readonly MenuItem[];
  readonly current: MenuItem;
  readonly onPick: (item: MenuItem) => void;
}) {
  return (
    <nav aria-label={words.menu.label} className="bottom-menu">
      {items.map((item) => (
        <Pressable
          key={item}
          className={item === current ? 'button menu-item menu-item-current' : 'button menu-item'}
          onPress={() => {
            onPick(item);
          }}
        >
          {words.menu[item]}
        </Pressable>
      ))}
    </nav>
  );
}

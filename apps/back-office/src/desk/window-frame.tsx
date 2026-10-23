// A window on the desktop (the user, 2026-10-22): a title bar with the window's picture and title,
// and its buttons, minimize (back to the desktop, kept on the taskbar), maximize or restore, and
// close (back to the desktop, off the taskbar); the screen inside, which keeps its own heading as
// its one `h1`. A window is a region a screen reader can move to, named "Window:" and its title,
// apart from the regions inside it (a table's, named by its caption). Every button is a press alone (WCAG 2.5.7: nothing is dragged), 44 px square, and
// named in words. A double-click on the title bar maximizes or restores too, as on a desktop: a
// shortcut, never the only way. Where the screen is narrow or its text large, every window is shown
// maximized and the button for it is not shown (office.css).
import type { ReactNode } from 'react';
import { Button } from 'react-aria-components';

import { say, words } from '../words.ts';
import { Glyph, type GlyphName } from './glyphs.tsx';

export interface WindowActs {
  readonly maximized: boolean;
  readonly onMinimize: () => void;
  readonly onMaximize: (maximized: boolean) => void;
  readonly onClose: () => void;
}

export function WindowFrame({
  title,
  glyph,
  acts,
  children,
}: {
  readonly title: string;
  readonly glyph: GlyphName;
  // Its buttons; a window with none (the sign-in's) is only shown.
  readonly acts?: WindowActs;
  readonly children: ReactNode;
}) {
  const said = words.desk;
  return (
    <section
      className={acts?.maximized === true ? 'window window-maximized' : 'window'}
      aria-label={say(said.windowNamed, { title })}
    >
      <div
        className="window-bar"
        onDoubleClick={
          acts === undefined
            ? undefined
            : () => {
                acts.onMaximize(!acts.maximized);
              }
        }
      >
        <Glyph name={glyph} className="window-glyph" />
        <span className="window-title">{title}</span>
        {acts === undefined ? null : (
          <div className="window-buttons">
            <Button
              className="window-button"
              aria-label={said.minimizeWindow}
              onPress={acts.onMinimize}
            >
              <Glyph name="minimize" />
            </Button>
            <Button
              className="window-button window-button-size"
              aria-label={acts.maximized ? said.restoreWindow : said.maximizeWindow}
              onPress={() => {
                acts.onMaximize(!acts.maximized);
              }}
            >
              <Glyph name={acts.maximized ? 'restore' : 'maximize'} />
            </Button>
            <Button className="window-button" aria-label={said.closeWindow} onPress={acts.onClose}>
              <Glyph name="close" />
            </Button>
          </div>
        )}
      </div>
      <div className="window-body">{children}</div>
    </section>
  );
}

// The button and the list row (ADR-561 (6)): React Aria's button, which answers a tap, a click,
// the keyboard and a screen reader alike, on the press alone (nothing needs a drag, WCAG 2.5.7).
// The main action is one per screen, at the bottom in thumb reach; every button is at least 56 px
// tall (tokens.css), far past WCAG 2.5.8's 24 px. **A step of work's own state** (ADR-590): a
// button may be marked to do, in the notice colour, or done, in the good colour, its words and
// icon saying which too, never the colour alone (WCAG 1.4.1). **While the phone is busy** with what
// a press began, its buttons wait (`busy`, item 3.10.2): none takes a press, each looks as a
// disabled one does and says to a screen reader that it is unavailable (`aria-disabled`), and **each
// keeps the focus**, which a disabled button would drop to the page (WCAG 2.4.3). Not React Aria's
// `isPending`, whose announcement names the button by id and outlives it once the screen moves on. `isDisabled` is for a button that can't be
// pressed yet (nothing typed).
import type { ReactNode } from 'react';
import { Button as Pressable, type ButtonProps } from 'react-aria-components';

import { Onward } from './icons.tsx';

type Pressing = Omit<ButtonProps, 'className' | 'style' | 'children'>;

// A step of work's state, where a button says it.
export type ButtonTone = 'toDo' | 'done';

const toneClass: Record<ButtonTone, string> = { toDo: 'button-to-do', done: 'button-done' };

export function Button({
  main = false,
  wide = false,
  tone,
  icon,
  busy = false,
  children,
  onPress,
  ...pressing
}: Pressing & {
  readonly busy?: boolean;
  readonly main?: boolean;
  readonly wide?: boolean;
  readonly tone?: ButtonTone | undefined;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}) {
  const className = [
    'button',
    main ? 'button-main' : '',
    wide ? 'button-wide' : '',
    tone === undefined ? '' : toneClass[tone],
  ]
    .filter((name) => name !== '')
    .join(' ');
  return (
    <Pressable
      {...pressing}
      {...(busy
        ? { 'aria-disabled': true, 'data-busy': true }
        : onPress === undefined
          ? {}
          : { onPress })}
      className={className}
    >
      {icon}
      {children}
    </Pressable>
  );
}

// A row that goes somewhere: its words, a line of detail, and the arrow that says so.
export function ListRow({
  label,
  detail,
  ...pressing
}: Pressing & { readonly label: string; readonly detail?: string }) {
  return (
    <Pressable {...pressing} className="list-row">
      <span className="list-row-words">
        <span className="list-row-label">{label}</span>
        {detail === undefined ? null : <span className="list-row-detail">{detail}</span>}
      </span>
      <Onward />
    </Pressable>
  );
}

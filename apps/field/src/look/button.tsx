// The button and the list row (ADR-561 (6)): React Aria's button, which answers a tap, a click,
// the keyboard and a screen reader alike, on the press alone (nothing needs a drag, WCAG 2.5.7).
// The main action is one per screen, at the bottom in thumb reach; every button is at least 56 px
// tall (tokens.css), far past WCAG 2.5.8's 24 px.
import type { ReactNode } from 'react';
import { Button as Pressable, type ButtonProps } from 'react-aria-components';

import { Onward } from './icons.tsx';

type Pressing = Omit<ButtonProps, 'className' | 'style' | 'children'>;

export function Button({
  main = false,
  wide = false,
  icon,
  children,
  ...pressing
}: Pressing & {
  readonly main?: boolean;
  readonly wide?: boolean;
  readonly icon?: ReactNode;
  readonly children: ReactNode;
}) {
  const className = ['button', main ? 'button-main' : '', wide ? 'button-wide' : '']
    .filter((name) => name !== '')
    .join(' ');
  return (
    <Pressable {...pressing} className={className}>
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

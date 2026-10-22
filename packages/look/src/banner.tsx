// Banners (ADR-561 (5), (6)): a calm notice with its icon and words. An on-device check says the
// record will be flagged and lets the work go on (ADR-052): never an error that stops. One that
// appears as the monitor works is announced politely (WCAG 4.1.3).
import type { ReactNode } from 'react';

import { Info, Notice, Problem, Tick } from './icons.tsx';

const icons = { info: Info, notice: Notice, good: Tick, problem: Problem } as const;

export function Banner({
  tone,
  announced = false,
  children,
}: {
  readonly tone: keyof typeof icons;
  readonly announced?: boolean;
  readonly children: ReactNode;
}) {
  const Drawn = icons[tone];
  return (
    <div className={`banner banner-${tone}`} role={announced ? 'status' : undefined}>
      <Drawn />
      <div className="banner-words">{children}</div>
    </div>
  );
}

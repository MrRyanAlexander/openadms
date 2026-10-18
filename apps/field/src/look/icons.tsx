// The icons beside the words (ADR-561 (3)): a state is always an icon and a word, never colour or
// an icon alone, so every icon is hidden from a screen reader, which reads the word. Drawn here in
// the words' colour: nothing is loaded for them.
import type { ReactNode } from 'react';

function Icon({
  className,
  children,
}: {
  readonly className?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export interface Drawn {
  readonly className?: string | undefined;
}

export const Tick = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M4.5 12.5l5 5L19.5 7" />
  </Icon>
);

export const Notice = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M12 3.5L2.5 20h19z" />
    <path d="M12 10v4.5M12 17.5v.01" />
  </Icon>
);

export const Info = ({ className }: Drawn) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.5v.01" />
  </Icon>
);

export const Problem = ({ className }: Drawn) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Icon>
);

export const Person = ({ className }: Drawn) => (
  <Icon className={className}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c1-4 3.8-6 7-6s6 2 7 6" />
  </Icon>
);

export const Waiting = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19.5h14" />
  </Icon>
);

export const Clock = ({ className }: Drawn) => (
  <Icon className={className}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const Onward = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M9 5l7 7-7 7" />
  </Icon>
);

export const Backward = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M15 5l-7 7 7 7" />
  </Icon>
);

export const Camera = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
);

export const Barcode = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M4 6v12M7 6v12M10.5 6v12M14 6v12M17 6v12M20 6v12" />
  </Icon>
);

export const Erase = ({ className }: Drawn) => (
  <Icon className={className}>
    <path d="M9 5h11v14H9l-6-7z" />
    <path d="M12 9l6 6M18 9l-6 6" />
  </Icon>
);

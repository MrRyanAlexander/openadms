// The four open designs ADR-561 (7) puts to the user with the prototype, each a switch the
// screens follow, the agent's recommendation first. None is built into the app before the user
// answers (spec/QUESTIONS.md, Q-215…Q-218).
export interface Designs {
  // Q-215: a confirmation after each captured value.
  readonly confirm: 'no' | 'yes';
  // Q-216: the monitor's own count of today's tickets on home, or nothing.
  readonly count: 'today' | 'none';
  // Q-217: the bottom menu.
  readonly menu: 'trimmed' | 'board' | 'none';
  // Q-218: when the ticket number is typed again by hand.
  readonly again: 'byHand' | 'always';
}

export const recommended: Designs = {
  confirm: 'no',
  count: 'today',
  menu: 'trimmed',
  again: 'byHand',
};

export const choices = {
  confirm: ['no', 'yes'],
  count: ['today', 'none'],
  menu: ['trimmed', 'board', 'none'],
  again: ['byHand', 'always'],
} as const satisfies { readonly [Design in keyof Designs]: readonly Designs[Design][] };

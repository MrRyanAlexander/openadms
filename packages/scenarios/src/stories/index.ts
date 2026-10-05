// Every story, in the order `pnpm scenarios` runs them. The golden mission joins in Phase 1 (C3).
import type { Story } from '../runner.ts';
import { certification } from './certification.ts';
import { dispatchMonday } from './dispatch-monday.ts';
import { numbering } from './numbering.ts';
import { p1AnyOrder } from './p1-any-order.ts';
import { p1FieldDays } from './p1-field-days.ts';
import { setup } from './setup.ts';
import { sync } from './sync.ts';
import { ticket101001 } from './ticket-101001.ts';

export const stories: readonly Story[] = [
  ticket101001,
  dispatchMonday,
  setup,
  certification,
  numbering,
  p1FieldDays,
  sync,
  p1AnyOrder,
];

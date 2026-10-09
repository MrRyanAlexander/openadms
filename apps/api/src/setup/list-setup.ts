// The firm's own values on its lists (spec/LISTS.md; ADR-070, 194, 302): a value the firm adds has
// a name and no key, and goes at the end of its list. Only the two lists the setup story's firm
// adds to are here; each other list's service comes with the task that first needs it.
import type { DebrisType, PayableType } from '@open-adms/db';

import { type Outcome, SetupService } from './setup-service.ts';

export class ListSetup extends SetupService {
  // A debris type in the firm's library, named as its contracts name the work: Mulch.
  debrisType(person: string, name: string): Promise<Outcome<DebrisType>> {
    return this.setup(person, async (tx) => {
      const last = await tx.debrisType.aggregate({ _max: { position: true } });
      return tx.debrisType.create({ data: { name, position: (last._max.position ?? 0) + 1 } });
    });
  }

  // A payable type, the work a pay item prices: Stump fill.
  payableType(person: string, name: string): Promise<Outcome<PayableType>> {
    return this.setup(person, async (tx) => {
      const last = await tx.payableType.aggregate({ _max: { position: true } });
      return tx.payableType.create({ data: { name, position: (last._max.position ?? 0) + 1 } });
    });
  }
}

// What the dispatch services share (ARCHITECTURE §6, Authorization; ADR-050, 240, 364, 428, 429):
// who may dispatch (an admin, or a manager/analyst who holds Dispatch now) is read inside the
// service's own piece of work and before anything is changed, whatever the door already asked.
import type { Prisma } from '@open-adms/db';
import { DispatchRights } from '@open-adms/domain';

import { Refused, SetupService } from '../setup/setup-service.ts';

export abstract class DispatchService extends SetupService {
  // Refuses, with nothing changed, anybody who may not dispatch now.
  protected async mayDispatch(tx: Prisma.TransactionClient, person: string): Promise<void> {
    const user = await tx.user.findUnique({ where: { id: person } });
    const granted =
      user === null
        ? []
        : await tx.userPermission.findMany({ where: { userId: person, archivedAt: null } });
    const refusal = new DispatchRights(
      user === null
        ? null
        : {
            name: user.name,
            role: user.role,
            archived: user.archivedAt !== null,
            granted: granted.map((grant) => grant.permission),
          },
    ).refusal();
    if (refusal !== null) throw new Refused(refusal);
  }
}

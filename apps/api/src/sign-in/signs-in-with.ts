// Who signs in with an address (ARCHITECTURE §6, Back-office sessions; AC-10-114; ADR-404, 409
// (7), 547; the Phase 2 audit's F8). Asked of the database by one equality, as its own rule holds
// the address (`user_sign_in_email_once`: whole, without regard to capitals or the spaces around
// it, among the people in service who sign in at the back office or the portal), so the rule's own
// index answers it: never a pattern, never every person read, and no credential read but the one
// person's. At most two are answered: where two share an address neither is meant.
import type { Prisma } from '@open-adms/db';

type Tx = Prisma.TransactionClient;

export async function signingInWith(tx: Tx, email: string): Promise<readonly string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"::text AS "id" FROM "user"
    WHERE lower(btrim("email")) = lower(btrim(${email}))
      AND "role" IN ('ADMIN', 'MANAGER_ANALYST', 'READ_ONLY_VIEWER')
      AND "archived_at" IS NULL
      AND "email" IS NOT NULL
    LIMIT 2`;
  return rows.map((row) => row.id);
}

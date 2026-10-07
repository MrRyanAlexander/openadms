-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "security_event_kind" ADD VALUE 'TWO_STEP_SET_UP';
ALTER TYPE "security_event_kind" ADD VALUE 'TWO_STEP_CLEARED';

-- AlterTable
ALTER TABLE "user_credential" ADD COLUMN     "two_step_last_step" INTEGER;

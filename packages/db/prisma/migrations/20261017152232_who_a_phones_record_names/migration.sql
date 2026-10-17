-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "flag_code" ADD VALUE 'MONITOR_NOT_SIGNED_IN';
ALTER TYPE "flag_code" ADD VALUE 'ASSIGNMENT_OF_ANOTHER_PERSON';

-- AlterTable
ALTER TABLE "synced_record" ADD COLUMN     "monitor_id" UUID,
ADD COLUMN     "monitor_signed_in" BOOLEAN;

-- AddForeignKey
ALTER TABLE "synced_record" ADD CONSTRAINT "synced_record_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

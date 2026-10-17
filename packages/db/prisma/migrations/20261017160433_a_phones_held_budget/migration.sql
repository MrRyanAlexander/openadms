-- AlterEnum
ALTER TYPE "security_event_kind" ADD VALUE 'PHONE_HELD_BUDGET_PASSED';

-- AlterTable
ALTER TABLE "held_record" ADD COLUMN     "sent_bytes" INTEGER;

-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'DEVICE_KEY';

-- AlterTable
ALTER TABLE "device" ADD COLUMN     "last_answered_challenge_made_at" TIMESTAMPTZ(3);

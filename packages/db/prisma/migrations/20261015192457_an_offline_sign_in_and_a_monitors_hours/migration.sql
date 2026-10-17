/*
  Warnings:

  - A unique constraint covering the columns `[offline_sign_in_id]` on the table `session` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "security_event_kind" ADD VALUE 'OFFLINE_SIGN_IN';
ALTER TYPE "security_event_kind" ADD VALUE 'OFFLINE_SIGN_IN_REFUSED';

-- AlterTable
ALTER TABLE "firm_settings" ADD COLUMN     "monitor_session_hours" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "offline_sign_in_id" UUID,
ADD COLUMN     "signed_in_at" TIMESTAMPTZ(3),
ADD COLUMN     "signed_in_utc_offset_minutes" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "session_offline_sign_in_id_key" ON "session"("offline_sign_in_id");

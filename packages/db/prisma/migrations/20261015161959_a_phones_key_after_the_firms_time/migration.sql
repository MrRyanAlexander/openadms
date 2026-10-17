-- CreateEnum
CREATE TYPE "device_key_revocation" AS ENUM ('TURN_IN', 'FIRM_TIME');

-- AlterEnum
ALTER TYPE "reason_use" ADD VALUE 'PHONE_REMOVAL';

-- AlterEnum
ALTER TYPE "security_event_kind" ADD VALUE 'DEVICE_KEY_REVOKED';

-- AlterTable
ALTER TABLE "device" ADD COLUMN     "key_revoked_by" "device_key_revocation",
ADD COLUMN     "out_of_service_marked_at" TIMESTAMPTZ(3),
ADD COLUMN     "out_of_service_reason_id" UUID;

-- CreateTable
CREATE TABLE "firm_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "phone_key_revoked_after_hours" INTEGER,
    "viewer_two_step_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "firm_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_out_of_service_reason_id_fkey" FOREIGN KEY ("out_of_service_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

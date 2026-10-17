-- DropIndex
DROP INDEX "flag_acceptance_flag_id_key";

-- AlterTable
ALTER TABLE "certification" ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "created_reason_id" UUID;

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "master_passcode_session" "master_passcode_session";

-- AlterTable
ALTER TABLE "flag_acceptance" ADD COLUMN     "withdraw_note" TEXT,
ADD COLUMN     "withdrawn_at" TIMESTAMPTZ(3),
ADD COLUMN     "withdrawn_by_id" UUID;

-- CreateIndex
CREATE INDEX "flag_acceptance_flag_id_idx" ON "flag_acceptance"("flag_id");

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_created_reason_id_fkey" FOREIGN KEY ("created_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_withdrawn_by_id_fkey" FOREIGN KEY ("withdrawn_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

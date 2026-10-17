-- AlterEnum
ALTER TYPE "not_saved_reason" ADD VALUE 'REPORT_NOT_SAVED';

-- AlterTable
ALTER TABLE "held_record" ALTER COLUMN "sync_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "held_record_id" UUID;

-- AlterTable
ALTER TABLE "set_aside_file" ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolved_at" TIMESTAMPTZ(3),
ADD COLUMN     "resolved_by_id" UUID;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_held_record_id_fkey" FOREIGN KEY ("held_record_id") REFERENCES "held_record"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "set_aside_file" ADD CONSTRAINT "set_aside_file_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

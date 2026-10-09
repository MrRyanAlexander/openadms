-- AlterTable
ALTER TABLE "session" ADD COLUMN     "device_id" UUID;

-- CreateIndex
CREATE INDEX "session_device_id_idx" ON "session"("device_id");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

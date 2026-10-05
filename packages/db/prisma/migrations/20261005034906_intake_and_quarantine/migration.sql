-- CreateEnum
CREATE TYPE "quarantine_reason" AS ENUM ('DUPLICATE_FIELD_EVENT', 'DUPLICATE_ROE_NUMBER');

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "unreadable_gps" JSONB;

-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "quarantined_record_id" UUID;

-- CreateTable
CREATE TABLE "quarantined_record" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "monitor_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "reason" "quarantine_reason" NOT NULL,
    "holding_event_id" UUID,
    "holding_roe_id" UUID,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" TEXT,

    CONSTRAINT "quarantined_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quarantined_record_project_id_id_key" ON "quarantined_record"("project_id", "id");

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_quarantined_record_id_fkey" FOREIGN KEY ("project_id", "quarantined_record_id") REFERENCES "quarantined_record"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_project_id_holding_event_id_fkey" FOREIGN KEY ("project_id", "holding_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "quarantined_record" ADD CONSTRAINT "quarantined_record_project_id_holding_roe_id_fkey" FOREIGN KEY ("project_id", "holding_roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

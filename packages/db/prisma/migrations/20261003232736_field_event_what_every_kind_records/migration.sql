/*
  Warnings:

  - Added the required column `cert_keyed_by_hand` to the `field_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `cert_number` to the `field_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `number_typed` to the `field_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source` to the `field_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `temporary_session` to the `field_event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "record_source" AS ENUM ('DEVICE', 'BACK_OFFICE');

-- CreateEnum
CREATE TYPE "address_source" AS ENUM ('LOOKED_UP', 'TYPED');

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "address" TEXT,
ADD COLUMN     "address_source" "address_source",
ADD COLUMN     "cert_keyed_by_hand" BOOLEAN NOT NULL,
ADD COLUMN     "cert_number" TEXT NOT NULL,
ADD COLUMN     "certification_id" UUID,
ADD COLUMN     "created_by_id" UUID,
ADD COLUMN     "created_reason_id" UUID,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "number_typed" BOOLEAN NOT NULL,
ADD COLUMN     "number_typed_reason_id" UUID,
ADD COLUMN     "site_id" UUID,
ADD COLUMN     "source" "record_source" NOT NULL,
ADD COLUMN     "start_latitude" DECIMAL(38,8),
ADD COLUMN     "start_longitude" DECIMAL(38,8),
ADD COLUMN     "temporary_session" BOOLEAN NOT NULL,
ADD COLUMN     "typed_capacity_cy" INTEGER,
ALTER COLUMN "device_id" DROP NOT NULL,
ALTER COLUMN "assignment_id" DROP NOT NULL,
ALTER COLUMN "setup_version" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "field_event_monitor_id_idx" ON "field_event"("monitor_id");

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_created_reason_id_fkey" FOREIGN KEY ("created_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_number_typed_reason_id_fkey" FOREIGN KEY ("number_typed_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_certification_id_fkey" FOREIGN KEY ("project_id", "certification_id") REFERENCES "certification"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_site_id_fkey" FOREIGN KEY ("project_id", "site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

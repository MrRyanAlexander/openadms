/*
  Warnings:

  - A unique constraint covering the columns `[project_id,id]` on the table `field_event` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "photo_view" AS ENUM ('OPERATOR_WITH_PLACARD', 'INTERIOR_OR_BACK', 'RIGHT', 'LEFT', 'FRONT');

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "scale_receipt_id" UUID;

-- CreateTable
CREATE TABLE "scale_receipt" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "receipt_number" TEXT NOT NULL,
    "site_id" UUID NOT NULL,
    "gross_weight_lb" DECIMAL(12,2),
    "tare_weight_lb" DECIMAL(12,2),
    "net_weight_lb" DECIMAL(12,2),
    "net_weight_tons" DECIMAL(12,4),
    "entered_by_id" UUID NOT NULL,
    "device_id" UUID,
    "entered_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "scale_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "field_event_id" UUID,
    "certification_id" UUID,
    "scale_receipt_id" UUID,
    "view" "photo_view",
    "captured_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(38,8),
    "longitude" DECIMAL(38,8),
    "original_sha256" TEXT NOT NULL,
    "uploaded_sha256" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "depth_object_key" TEXT,
    "device_id" UUID,
    "uploaded_at" TIMESTAMPTZ(3),

    CONSTRAINT "photo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scale_receipt_project_id_receipt_number_key" ON "scale_receipt"("project_id", "receipt_number");

-- CreateIndex
CREATE UNIQUE INDEX "scale_receipt_project_id_id_key" ON "scale_receipt"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "photo_object_key_key" ON "photo"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "photo_depth_object_key_key" ON "photo"("depth_object_key");

-- CreateIndex
CREATE UNIQUE INDEX "field_event_project_id_id_key" ON "field_event"("project_id", "id");

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_scale_receipt_id_fkey" FOREIGN KEY ("project_id", "scale_receipt_id") REFERENCES "scale_receipt"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_project_id_site_id_fkey" FOREIGN KEY ("project_id", "site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_entered_by_id_fkey" FOREIGN KEY ("entered_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "scale_receipt" ADD CONSTRAINT "scale_receipt_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_field_event_id_fkey" FOREIGN KEY ("project_id", "field_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_certification_id_fkey" FOREIGN KEY ("project_id", "certification_id") REFERENCES "certification"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_scale_receipt_id_fkey" FOREIGN KEY ("project_id", "scale_receipt_id") REFERENCES "scale_receipt"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

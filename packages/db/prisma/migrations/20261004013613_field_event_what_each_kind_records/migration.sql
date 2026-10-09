/*
  Warnings:

  - A unique constraint covering the columns `[id,kind]` on the table `field_event` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "measured_as" AS ENUM ('CIRCUMFERENCE', 'DIAMETER');

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "carried_count" INTEGER,
ADD COLUMN     "estimate_cy" DECIMAL(8,1),
ADD COLUMN     "field_tag_id" UUID,
ADD COLUMN     "form_debris_type_id" UUID,
ADD COLUMN     "form_document_type" "form_document_type",
ADD COLUMN     "form_id" UUID,
ADD COLUMN     "kind_of_work_id" UUID,
ADD COLUMN     "marked_ineligible" BOOLEAN,
ADD COLUMN     "measured_as" "measured_as",
ADD COLUMN     "measurement_inches" DECIMAL(8,1),
ADD COLUMN     "pay_item_id" UUID,
ADD COLUMN     "payable_type_id" UUID,
ADD COLUMN     "roe_number" TEXT,
ADD COLUMN     "root_ball_half_exposed" BOOLEAN,
ADD COLUMN     "root_ball_inches" DECIMAL(8,1),
ADD COLUMN     "survey_number" TEXT,
ADD COLUMN     "unit_count" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "field_event_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "field_event_id" UUID NOT NULL,
    "field_event_kind" "field_event_kind" NOT NULL,
    "item_name_id" UUID NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_event_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carried_ticket" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "field_event_id" UUID NOT NULL,
    "field_event_kind" "field_event_kind" NOT NULL,
    "carried_ticket_number" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carried_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "field_event_item_field_event_id_item_name_id_key" ON "field_event_item"("field_event_id", "item_name_id");

-- CreateIndex
CREATE UNIQUE INDEX "carried_ticket_field_event_id_carried_ticket_number_key" ON "carried_ticket"("field_event_id", "carried_ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "field_event_id_kind_key" ON "field_event"("id", "kind");

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_form_id_form_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "form_document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_form_id_form_debris_type_id_fkey" FOREIGN KEY ("form_id", "form_debris_type_id") REFERENCES "form_debris_type"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_field_tag_id_fkey" FOREIGN KEY ("project_id", "field_tag_id") REFERENCES "field_tag"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_kind_of_work_id_fkey" FOREIGN KEY ("kind_of_work_id") REFERENCES "kind_of_work"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_payable_type_id_fkey" FOREIGN KEY ("payable_type_id") REFERENCES "payable_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event_item" ADD CONSTRAINT "field_event_item_field_event_id_field_event_kind_fkey" FOREIGN KEY ("field_event_id", "field_event_kind") REFERENCES "field_event"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event_item" ADD CONSTRAINT "field_event_item_item_name_id_fkey" FOREIGN KEY ("item_name_id") REFERENCES "item_name"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "carried_ticket" ADD CONSTRAINT "carried_ticket_field_event_id_field_event_kind_fkey" FOREIGN KEY ("field_event_id", "field_event_kind") REFERENCES "field_event"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

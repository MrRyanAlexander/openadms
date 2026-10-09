/*
  Warnings:

  - You are about to drop the column `collection_event_id` on the `completed_load` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[project_id,id]` on the table `completed_load` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[project_id,id]` on the table `map_version` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[map_version_id,id]` on the table `zone` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `quantity_source` to the `completed_load` table without a default value. This is not possible if the table is not empty.
  - Added the required column `weight_is_share` to the `completed_load` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "quantity_source" AS ENUM ('LOAD_CALL', 'SCALE_WEIGHT', 'CARRIED_TICKETS');

-- CreateEnum
CREATE TYPE "mileage_source" AS ENUM ('ROAD_ROUTE', 'STRAIGHT_LINE');

-- CreateEnum
CREATE TYPE "reconciliation_trigger" AS ENUM ('SYNC', 'CORRECTION', 'SETUP_CHANGE', 'REPROCESS');

-- CreateEnum
CREATE TYPE "flag_billing" AS ENUM ('BILLS', 'LINE_NOT_BILLED', 'NOT_BILLED');

-- CreateEnum
CREATE TYPE "flag_code" AS ENUM ('DEBRIS_TYPE_MISMATCH', 'CERT_NUMBER_MISMATCH', 'DISPOSAL_BEFORE_COLLECTION_ENDED', 'OVERLAPPING_LOADS', 'SPLIT_SUFFIX_GAP', 'CARRIED_COUNT_MISMATCH', 'NO_CERTIFICATION', 'TYPED_CAPACITY_DIFFERS', 'TAG_EXPIRED', 'CERTIFICATION_REVOKED', 'CERTIFICATION_REPLACED', 'OUTSIDE_PROJECT_BOUNDARY', 'NO_ZONE', 'OUTSIDE_SITE_AREA', 'PROJECT_NOT_ACTIVE', 'SITE_NOT_YET_ACTIVE', 'SITE_CLOSED', 'NO_ROAD_ROUTE', 'DEVICE_CLOCK_OFF', 'WORK_TIME_AFTER_RECEIVED', 'WORK_TIME_BEFORE_ENROLMENT', 'DEVICE_TIME_ZONE_DIFFERS', 'PHONE_OUT_OF_SERVICE', 'TYPED_TICKET_NUMBER', 'BACK_OFFICE_RECORD', 'SITE_DOES_NOT_TAKE_LOADS', 'SITE_NOT_FOR_HAUL_OUTS', 'INELIGIBLE_SITE', 'TIPPING_FEE_RULE_MISSING', 'HAUL_OUT_DUMPED_AT_TDSR', 'LOAD_CALL_ZERO', 'LOAD_CALL_LOW', 'LOAD_CALL_HIGH', 'PILE_CALL_NOT_HIGHER', 'QUANTITY_MISSING_FOR_PAY_ITEM', 'SHARED_SCALE_WEIGHT', 'RECEIPT_TWO_DEBRIS_TYPES', 'SCALE_WEIGHT_UNUSABLE', 'CARRIED_TICKET_NOT_FOUND', 'CARRIED_TICKET_ON_ANOTHER_LOAD', 'MEASUREMENT_MISSING', 'GPS_MISSING', 'PHOTOS_MISSING', 'DECIMAL_COUNT', 'NO_SIZE_BAND', 'OUTSIDE_SIZE_BAND', 'MARKED_INELIGIBLE', 'STUMP_UNDER_24', 'ROOT_BALL_NOT_WIDER', 'FILL_WITHOUT_EXPOSED_ROOT_BALL', 'ROOT_BALL_MISSING', 'NO_SURVEY', 'CREW_ITEM_OVER_12_HOURS', 'CREW_TIME_OVERLAP', 'ROE_MISSING', 'ROE_NOT_ON_PROJECT', 'ROE_UNSIGNED', 'ROE_OUT_OF_SCOPE', 'NO_PRE_WORK_SURVEY', 'CERTIFICATION_PHOTO_MISSING', 'PERMIT_OUTSTANDING', 'NO_PRICING_RULE', 'DUPLICATE_TRANSACTION_NUMBER', 'NO_RATE_FOR_PRIME', 'RATE_TO_BE_NEGOTIATED', 'NOT_PROCESSED');

-- DropForeignKey
ALTER TABLE "completed_load" DROP CONSTRAINT "completed_load_collection_event_id_fkey";

-- DropForeignKey
ALTER TABLE "completed_load" DROP CONSTRAINT "completed_load_disposal_event_id_fkey";

-- DropIndex
DROP INDEX "completed_load_collection_event_id_key";

-- DropIndex
DROP INDEX "completed_load_project_id_ticket_number_key";

-- AlterTable
ALTER TABLE "completed_load" DROP COLUMN "collection_event_id",
ADD COLUMN     "capacity_cy" INTEGER,
ADD COLUMN     "carried_count" INTEGER,
ADD COLUMN     "dissolved_at" TIMESTAMPTZ(3),
ADD COLUMN     "load_call" INTEGER,
ADD COLUMN     "quantity_source" "quantity_source" NOT NULL,
ADD COLUMN     "volume_cy" DECIMAL(10,2),
ADD COLUMN     "weight_is_share" BOOLEAN NOT NULL,
ADD COLUMN     "weight_tons" DECIMAL(12,4);

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "map_version_id" UUID,
ADD COLUMN     "worked_out_pay_item_id" UUID,
ADD COLUMN     "zone_id" UUID;

-- CreateTable
CREATE TABLE "completed_load_collection" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "completed_load_id" UUID NOT NULL,
    "collection_event_id" UUID NOT NULL,
    "split_suffix" TEXT NOT NULL,
    "share_fraction" DECIMAL(9,8) NOT NULL,
    "volume_cy" DECIMAL(10,2),
    "weight_tons" DECIMAL(12,4),
    "mileage" DECIMAL(10,4),
    "mileage_source" "mileage_source",
    "snapped_latitude" DECIMAL(38,8),
    "snapped_longitude" DECIMAL(38,8),
    "snapped_address" TEXT,
    "map_data_date" DATE,
    "map_data_sha256" TEXT,
    "dissolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "completed_load_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completed_haul_out" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "disposal_event_id" UUID NOT NULL,
    "quantity_source" "quantity_source" NOT NULL,
    "capacity_cy" INTEGER,
    "load_call" INTEGER,
    "volume_cy" DECIMAL(10,2),
    "weight_tons" DECIMAL(12,4),
    "weight_is_share" BOOLEAN NOT NULL,
    "dissolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "completed_haul_out_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completed_haul_out_collection" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "completed_haul_out_id" UUID NOT NULL,
    "collection_event_id" UUID NOT NULL,
    "split_suffix" TEXT NOT NULL,
    "pile_load_call" INTEGER NOT NULL,
    "share_fraction" DECIMAL(9,8) NOT NULL,
    "volume_cy" DECIMAL(10,2),
    "weight_tons" DECIMAL(12,4),
    "mileage" DECIMAL(10,4),
    "mileage_source" "mileage_source",
    "snapped_latitude" DECIMAL(38,8),
    "snapped_longitude" DECIMAL(38,8),
    "snapped_address" TEXT,
    "map_data_date" DATE,
    "map_data_sha256" TEXT,
    "dissolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "completed_haul_out_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "workflow" "workflow",
    "ticket_number" TEXT,
    "field_event_id" UUID,
    "certification_id" UUID,
    "disposal_site_id" UUID,
    "survey_id" UUID,
    "code" "flag_code" NOT NULL,
    "message" TEXT NOT NULL,
    "facts" JSONB NOT NULL,
    "facts_sha256" TEXT NOT NULL,
    "billing" "flag_billing" NOT NULL,
    "slot" INTEGER,
    "pay_item_id" UUID,
    "raised_at" TIMESTAMPTZ(3) NOT NULL,
    "cleared_at" TIMESTAMPTZ(3),
    "reconciliation_run_id" UUID,

    CONSTRAINT "flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_run" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "trigger" "reconciliation_trigger" NOT NULL,
    "requested_by_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "finished_at" TIMESTAMPTZ(3),
    "tickets_done" INTEGER,
    "tickets_failed" INTEGER,

    CONSTRAINT "reconciliation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_decision" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "reconciliation_run_id" UUID NOT NULL,
    "workflow" "workflow" NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "status" "ticket_status" NOT NULL,
    "summary" JSONB NOT NULL,
    "error" TEXT,

    CONSTRAINT "reconciliation_decision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "completed_load_collection_completed_load_id_idx" ON "completed_load_collection"("completed_load_id");

-- CreateIndex
CREATE UNIQUE INDEX "completed_haul_out_disposal_event_id_key" ON "completed_haul_out"("disposal_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "completed_haul_out_project_id_id_key" ON "completed_haul_out"("project_id", "id");

-- CreateIndex
CREATE INDEX "completed_haul_out_collection_completed_haul_out_id_idx" ON "completed_haul_out_collection"("completed_haul_out_id");

-- CreateIndex
CREATE INDEX "flag_project_id_workflow_ticket_number_idx" ON "flag"("project_id", "workflow", "ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_run_project_id_id_key" ON "reconciliation_run"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_decision_reconciliation_run_id_workflow_tick_key" ON "reconciliation_decision"("reconciliation_run_id", "workflow", "ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "completed_load_project_id_id_key" ON "completed_load"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "map_version_project_id_id_key" ON "map_version"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "zone_map_version_id_id_key" ON "zone"("map_version_id", "id");

-- AddForeignKey
ALTER TABLE "completed_load" ADD CONSTRAINT "completed_load_project_id_disposal_event_id_fkey" FOREIGN KEY ("project_id", "disposal_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_project_id_completed_load_id_fkey" FOREIGN KEY ("project_id", "completed_load_id") REFERENCES "completed_load"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_load_collection" ADD CONSTRAINT "completed_load_collection_project_id_collection_event_id_fkey" FOREIGN KEY ("project_id", "collection_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_haul_out" ADD CONSTRAINT "completed_haul_out_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_haul_out" ADD CONSTRAINT "completed_haul_out_project_id_disposal_event_id_fkey" FOREIGN KEY ("project_id", "disposal_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_haul_out_collection" ADD CONSTRAINT "completed_haul_out_collection_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_haul_out_collection" ADD CONSTRAINT "completed_haul_out_collection_project_id_completed_haul_ou_fkey" FOREIGN KEY ("project_id", "completed_haul_out_id") REFERENCES "completed_haul_out"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_haul_out_collection" ADD CONSTRAINT "completed_haul_out_collection_project_id_collection_event__fkey" FOREIGN KEY ("project_id", "collection_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_field_event_id_fkey" FOREIGN KEY ("project_id", "field_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_certification_id_fkey" FOREIGN KEY ("project_id", "certification_id") REFERENCES "certification"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_disposal_site_id_fkey" FOREIGN KEY ("project_id", "disposal_site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_survey_id_fkey" FOREIGN KEY ("project_id", "survey_id") REFERENCES "survey"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag" ADD CONSTRAINT "flag_project_id_reconciliation_run_id_fkey" FOREIGN KEY ("project_id", "reconciliation_run_id") REFERENCES "reconciliation_run"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_run" ADD CONSTRAINT "reconciliation_run_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_run" ADD CONSTRAINT "reconciliation_run_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_decision" ADD CONSTRAINT "reconciliation_decision_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_run"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_map_version_id_fkey" FOREIGN KEY ("project_id", "map_version_id") REFERENCES "map_version"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_map_version_id_zone_id_fkey" FOREIGN KEY ("map_version_id", "zone_id") REFERENCES "zone"("map_version_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_worked_out_pay_item_id_fkey" FOREIGN KEY ("project_id", "worked_out_pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

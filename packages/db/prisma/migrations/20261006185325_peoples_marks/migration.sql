/*
  Warnings:

  - A unique constraint covering the columns `[project_id,id]` on the table `flag` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `project_id` to the `invoice_lock` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "qc_status" AS ENUM ('QC_REVIEW', 'QC_APPROVED', 'QC_ISSUES', 'QC_VOID');

-- DropForeignKey
ALTER TABLE "invoice_lock" DROP CONSTRAINT "invoice_lock_completed_haul_out_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_lock" DROP CONSTRAINT "invoice_lock_completed_load_id_fkey";

-- DropForeignKey
ALTER TABLE "invoice_lock" DROP CONSTRAINT "invoice_lock_field_event_id_fkey";

-- DropIndex
DROP INDEX "invoice_lock_completed_haul_out_id_key";

-- DropIndex
DROP INDEX "invoice_lock_completed_load_id_key";

-- DropIndex
DROP INDEX "invoice_lock_field_event_id_key";

-- AlterTable
ALTER TABLE "invoice_lock" ADD COLUMN     "field_event_kind" "field_event_kind",
ADD COLUMN     "invoice_batch_id" UUID,
ADD COLUMN     "project_id" UUID NOT NULL,
ADD COLUMN     "unlock_note" TEXT,
ADD COLUMN     "unlocked_at" TIMESTAMPTZ(3),
ADD COLUMN     "unlocked_by_id" UUID;

-- CreateTable
CREATE TABLE "qc_mark" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "completed_load_id" UUID,
    "completed_haul_out_id" UUID,
    "field_event_id" UUID,
    "field_event_kind" "field_event_kind",
    "certification_id" UUID,
    "roe_id" UUID,
    "survey_id" UUID,
    "incident_id" UUID,
    "drop_off_log_id" UUID,
    "status" "qc_status" NOT NULL,
    "set_by_id" UUID NOT NULL,
    "set_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "qc_mark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_batch" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flag_acceptance" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "flag_id" UUID NOT NULL,
    "reason_id" UUID NOT NULL,
    "note" TEXT,
    "accepted_by_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flag_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_void" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "workflow" "workflow" NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "reason_id" UUID NOT NULL,
    "note" TEXT,
    "voided_by_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(3) NOT NULL,
    "lifted_by_id" UUID,
    "lifted_at" TIMESTAMPTZ(3),
    "lift_note" TEXT,

    CONSTRAINT "ticket_void_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_completed_load_id_key" ON "qc_mark"("completed_load_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_completed_haul_out_id_key" ON "qc_mark"("completed_haul_out_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_field_event_id_key" ON "qc_mark"("field_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_certification_id_key" ON "qc_mark"("certification_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_roe_id_key" ON "qc_mark"("roe_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_survey_id_key" ON "qc_mark"("survey_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_incident_id_key" ON "qc_mark"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "qc_mark_drop_off_log_id_key" ON "qc_mark"("drop_off_log_id");

-- CreateIndex
CREATE INDEX "qc_mark_project_id_idx" ON "qc_mark"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_batch_project_id_name_key" ON "invoice_batch"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_batch_project_id_id_key" ON "invoice_batch"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "flag_acceptance_flag_id_key" ON "flag_acceptance"("flag_id");

-- CreateIndex
CREATE INDEX "flag_acceptance_project_id_idx" ON "flag_acceptance"("project_id");

-- CreateIndex
CREATE INDEX "ticket_void_project_id_workflow_ticket_number_idx" ON "ticket_void"("project_id", "workflow", "ticket_number");

-- CreateIndex
CREATE UNIQUE INDEX "flag_project_id_id_key" ON "flag"("project_id", "id");

-- CreateIndex
CREATE INDEX "invoice_lock_project_id_idx" ON "invoice_lock"("project_id");

-- CreateIndex
CREATE INDEX "invoice_lock_completed_load_id_idx" ON "invoice_lock"("completed_load_id");

-- CreateIndex
CREATE INDEX "invoice_lock_completed_haul_out_id_idx" ON "invoice_lock"("completed_haul_out_id");

-- CreateIndex
CREATE INDEX "invoice_lock_field_event_id_idx" ON "invoice_lock"("field_event_id");

-- CreateIndex
CREATE INDEX "invoice_lock_invoice_batch_id_idx" ON "invoice_lock"("invoice_batch_id");

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_completed_load_id_fkey" FOREIGN KEY ("project_id", "completed_load_id") REFERENCES "completed_load"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_completed_haul_out_id_fkey" FOREIGN KEY ("project_id", "completed_haul_out_id") REFERENCES "completed_haul_out"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_field_event_id_fkey" FOREIGN KEY ("project_id", "field_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_field_event_id_field_event_kind_fkey" FOREIGN KEY ("field_event_id", "field_event_kind") REFERENCES "field_event"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_certification_id_fkey" FOREIGN KEY ("project_id", "certification_id") REFERENCES "certification"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_roe_id_fkey" FOREIGN KEY ("project_id", "roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_survey_id_fkey" FOREIGN KEY ("project_id", "survey_id") REFERENCES "survey"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_incident_id_fkey" FOREIGN KEY ("project_id", "incident_id") REFERENCES "incident"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_project_id_drop_off_log_id_fkey" FOREIGN KEY ("project_id", "drop_off_log_id") REFERENCES "drop_off_log"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "qc_mark" ADD CONSTRAINT "qc_mark_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_batch" ADD CONSTRAINT "invoice_batch_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_batch" ADD CONSTRAINT "invoice_batch_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_project_id_completed_load_id_fkey" FOREIGN KEY ("project_id", "completed_load_id") REFERENCES "completed_load"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_project_id_completed_haul_out_id_fkey" FOREIGN KEY ("project_id", "completed_haul_out_id") REFERENCES "completed_haul_out"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_project_id_field_event_id_fkey" FOREIGN KEY ("project_id", "field_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_field_event_id_field_event_kind_fkey" FOREIGN KEY ("field_event_id", "field_event_kind") REFERENCES "field_event"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_project_id_invoice_batch_id_fkey" FOREIGN KEY ("project_id", "invoice_batch_id") REFERENCES "invoice_batch"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_unlocked_by_id_fkey" FOREIGN KEY ("unlocked_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_project_id_flag_id_fkey" FOREIGN KEY ("project_id", "flag_id") REFERENCES "flag"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "flag_acceptance" ADD CONSTRAINT "flag_acceptance_accepted_by_id_fkey" FOREIGN KEY ("accepted_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_reason_id_fkey" FOREIGN KEY ("reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_void" ADD CONSTRAINT "ticket_void_lifted_by_id_fkey" FOREIGN KEY ("lifted_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

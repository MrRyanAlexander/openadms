/*
  Warnings:

  - A unique constraint covering the columns `[project_id,id,person_id]` on the table `assignment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "clock_entry_kind" AS ENUM ('IN', 'BREAK_START', 'BREAK_END', 'OUT');

-- CreateTable
CREATE TABLE "clock_entry" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "kind" "clock_entry_kind" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clock_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clock_activity_line" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "clock_entry_id" UUID NOT NULL,
    "clock_entry_kind" "clock_entry_kind" NOT NULL,
    "position" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,
    "activity_id" UUID,
    "field_event_id" UUID,
    "note" TEXT,

    CONSTRAINT "clock_activity_line_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_approval" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "approved_by_id" UUID NOT NULL,
    "approved_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlocked_by_id" UUID,
    "unlocked_at" TIMESTAMPTZ(3),
    "unlock_note" TEXT,

    CONSTRAINT "day_approval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clock_entry_assignment_id_idx" ON "clock_entry"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "clock_entry_id_kind_key" ON "clock_entry"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "clock_activity_line_clock_entry_id_position_key" ON "clock_activity_line"("clock_entry_id", "position");

-- CreateIndex
CREATE INDEX "day_approval_assignment_id_idx" ON "day_approval"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_project_id_id_person_id_key" ON "assignment"("project_id", "id", "person_id");

-- AddForeignKey
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_project_id_assignment_id_worker_id_fkey" FOREIGN KEY ("project_id", "assignment_id", "worker_id") REFERENCES "assignment"("project_id", "id", "person_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clock_entry" ADD CONSTRAINT "clock_entry_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clock_activity_line" ADD CONSTRAINT "clock_activity_line_clock_entry_id_clock_entry_kind_fkey" FOREIGN KEY ("clock_entry_id", "clock_entry_kind") REFERENCES "clock_entry"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clock_activity_line" ADD CONSTRAINT "clock_activity_line_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "clock_activity"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_project_id_assignment_id_fkey" FOREIGN KEY ("project_id", "assignment_id") REFERENCES "assignment"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "day_approval" ADD CONSTRAINT "day_approval_unlocked_by_id_fkey" FOREIGN KEY ("unlocked_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

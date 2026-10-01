/*
  Warnings:

  - A unique constraint covering the columns `[public_key]` on the table `device` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `master_passcode_version` to the `device` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `device` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assignment_id` to the `field_event` table without a default value. This is not possible if the table is not empty.
  - Added the required column `setup_version` to the `field_event` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "device_status" AS ENUM ('ACTIVE', 'LOST', 'RETIRED');

-- CreateEnum
CREATE TYPE "number_series" AS ENUM ('LOAD', 'HAUL_OUT', 'UNIT_RATE', 'CERTIFICATION');

-- CreateEnum
CREATE TYPE "number_block_status" AS ENUM ('ISSUED', 'RECLAIMED', 'RETIRED');

-- CreateEnum
CREATE TYPE "assignment_origin" AS ENUM ('PLANNED', 'UNPLANNED');

-- AlterTable
ALTER TABLE "device" ADD COLUMN     "master_passcode_version" INTEGER NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "status" "device_status" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "assignment_id" UUID NOT NULL,
ADD COLUMN     "setup_version" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "employer_id" UUID,
ADD COLUMN     "employer_number" TEXT,
ALTER COLUMN "monitor_number" SET DEFAULT next_monitor_number();

-- CreateTable
CREATE TABLE "disposal_site" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "disposal_site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_passcode" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "version" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_passcode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_block" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "device_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "series" "number_series" NOT NULL,
    "first_number" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,
    "last_used_number" INTEGER,
    "status" "number_block_status" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "number_block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "person_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "project_id" UUID NOT NULL,
    "field_event_kinds" "field_event_kind"[] DEFAULT ARRAY[]::"field_event_kind"[],
    "certifying" BOOLEAN NOT NULL DEFAULT false,
    "site_id" UUID,
    "device_id" UUID,
    "origin" "assignment_origin" NOT NULL,
    "made_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disposal_site_project_id_id_key" ON "disposal_site"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "master_passcode_version_key" ON "master_passcode"("version");

-- CreateIndex
CREATE INDEX "number_block_device_id_idx" ON "number_block"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "number_block_project_id_series_first_number_key" ON "number_block"("project_id", "series", "first_number");

-- CreateIndex
CREATE INDEX "assignment_work_date_project_id_idx" ON "assignment"("work_date", "project_id");

-- CreateIndex
CREATE INDEX "assignment_person_id_work_date_idx" ON "assignment"("person_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "device_public_key_key" ON "device"("public_key");

-- AddForeignKey
ALTER TABLE "disposal_site" ADD CONSTRAINT "disposal_site_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_master_passcode_version_fkey" FOREIGN KEY ("master_passcode_version") REFERENCES "master_passcode"("version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_project_id_site_id_fkey" FOREIGN KEY ("project_id", "site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_made_by_id_fkey" FOREIGN KEY ("made_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

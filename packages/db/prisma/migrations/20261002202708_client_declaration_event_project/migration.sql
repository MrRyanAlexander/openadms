/*
  Warnings:

  - Added the required column `active_from` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `allow_split_loads` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `client_id` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `declaration_event_id` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `program_type_id` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `site_circle_meters` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stump_check_fill_needs_exposure` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stump_check_root_ball_wider` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stump_fill_depth_inches` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticket_number_source` to the `project` table without a default value. This is not possible if the table is not empty.
  - Added the required column `time_clock_enabled` to the `project` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ticket_number_source" AS ENUM ('CONTROL', 'GENERATED');

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "active_from" DATE NOT NULL,
ADD COLUMN     "active_to" DATE,
ADD COLUMN     "allow_split_loads" BOOLEAN NOT NULL,
ADD COLUMN     "client_id" UUID NOT NULL,
ADD COLUMN     "declaration_event_id" UUID NOT NULL,
ADD COLUMN     "load_call_high_limit" INTEGER,
ADD COLUMN     "load_call_low_limit" INTEGER,
ADD COLUMN     "program_type_id" UUID NOT NULL,
ADD COLUMN     "site_circle_meters" INTEGER NOT NULL,
ADD COLUMN     "stump_check_fill_needs_exposure" BOOLEAN NOT NULL,
ADD COLUMN     "stump_check_root_ball_wider" BOOLEAN NOT NULL,
ADD COLUMN     "stump_fill_depth_inches" INTEGER NOT NULL,
ADD COLUMN     "ticket_number_source" "ticket_number_source" NOT NULL,
ADD COLUMN     "time_clock_enabled" BOOLEAN NOT NULL,
ADD COLUMN     "workflows" "workflow"[];

-- CreateTable
CREATE TABLE "client" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_event" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reference_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "declaration_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_kind_of_work" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "kind_of_work_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_kind_of_work_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_kind_of_work_project_id_kind_of_work_id_key" ON "project_kind_of_work"("project_id", "kind_of_work_id");

-- CreateIndex
CREATE INDEX "project_declaration_event_id_idx" ON "project"("declaration_event_id");

-- CreateIndex
CREATE INDEX "project_client_id_idx" ON "project"("client_id");

-- AddForeignKey
ALTER TABLE "declaration_event" ADD CONSTRAINT "declaration_event_reference_type_id_fkey" FOREIGN KEY ("reference_type_id") REFERENCES "declaration_reference_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_declaration_event_id_fkey" FOREIGN KEY ("declaration_event_id") REFERENCES "declaration_event"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_program_type_id_fkey" FOREIGN KEY ("program_type_id") REFERENCES "program_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_kind_of_work" ADD CONSTRAINT "project_kind_of_work_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_kind_of_work" ADD CONSTRAINT "project_kind_of_work_kind_of_work_id_fkey" FOREIGN KEY ("kind_of_work_id") REFERENCES "kind_of_work"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

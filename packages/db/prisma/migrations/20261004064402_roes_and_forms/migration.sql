/*
  Warnings:

  - A unique constraint covering the columns `[form_id,id]` on the table `form_definition` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "field_event" ADD COLUMN     "roe_id" UUID;

-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "drop_off_log_id" UUID,
ADD COLUMN     "incident_id" UUID,
ADD COLUMN     "roe_id" UUID,
ADD COLUMN     "survey_id" UUID;

-- CreateTable
CREATE TABLE "roe" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "roe_number" TEXT NOT NULL,
    "parcel_id" TEXT,
    "address" TEXT,
    "owner_name" TEXT,
    "signed" BOOLEAN NOT NULL,
    "signed_date" DATE,
    "latitude" DECIMAL(38,8),
    "longitude" DECIMAL(38,8),
    "answers" JSONB NOT NULL,
    "form_definition_id" UUID,
    "form_id" UUID,
    "form_document_type" "form_document_type",
    "source" "record_source" NOT NULL,
    "made_by_id" UUID,
    "device_id" UUID,
    "assignment_id" UUID,
    "made_at" TIMESTAMPTZ(3),
    "device_utc_offset_minutes" INTEGER,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "roe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roe_scope_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "roe_id" UUID NOT NULL,
    "form_debris_type_id" UUID,
    "form_id" UUID,
    "form_document_type" "form_document_type",
    "payable_type_id" UUID,
    "count" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "roe_scope_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "source" "record_source" NOT NULL,
    "monitor_id" UUID NOT NULL,
    "device_id" UUID,
    "assignment_id" UUID,
    "setup_version" INTEGER,
    "created_by_id" UUID,
    "created_reason_id" UUID,
    "made_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(38,8),
    "longitude" DECIMAL(38,8),
    "answers" JSONB NOT NULL,
    "form_definition_id" UUID,
    "form_id" UUID,
    "form_document_type" "form_document_type",
    "notes" TEXT,
    "work_type_id" UUID NOT NULL,
    "survey_number" TEXT,
    "roe_number" TEXT,
    "roe_id" UUID,

    CONSTRAINT "survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "source" "record_source" NOT NULL,
    "monitor_id" UUID NOT NULL,
    "device_id" UUID,
    "assignment_id" UUID,
    "setup_version" INTEGER,
    "created_by_id" UUID,
    "created_reason_id" UUID,
    "made_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(38,8),
    "longitude" DECIMAL(38,8),
    "answers" JSONB NOT NULL,
    "form_definition_id" UUID,
    "form_id" UUID,
    "form_document_type" "form_document_type",
    "notes" TEXT,
    "incident_type_id" UUID NOT NULL,
    "incident_sub_type_id" UUID,
    "description" TEXT,
    "parties" TEXT,
    "address" TEXT,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drop_off_log" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "source" "record_source" NOT NULL,
    "monitor_id" UUID NOT NULL,
    "device_id" UUID,
    "assignment_id" UUID,
    "setup_version" INTEGER,
    "created_by_id" UUID,
    "created_reason_id" UUID,
    "made_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latitude" DECIMAL(38,8),
    "longitude" DECIMAL(38,8),
    "answers" JSONB NOT NULL,
    "form_definition_id" UUID,
    "form_id" UUID,
    "form_document_type" "form_document_type",
    "notes" TEXT,
    "site_id" UUID NOT NULL,
    "resident_name" TEXT,
    "origin_address" TEXT,

    CONSTRAINT "drop_off_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roe_project_id_roe_number_key" ON "roe"("project_id", "roe_number");

-- CreateIndex
CREATE UNIQUE INDEX "roe_project_id_id_key" ON "roe"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roe_scope_item_roe_id_form_debris_type_id_key" ON "roe_scope_item"("roe_id", "form_debris_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "roe_scope_item_roe_id_payable_type_id_key" ON "roe_scope_item"("roe_id", "payable_type_id");

-- CreateIndex
CREATE INDEX "survey_project_id_roe_number_idx" ON "survey"("project_id", "roe_number");

-- CreateIndex
CREATE UNIQUE INDEX "survey_project_id_id_key" ON "survey"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_project_id_id_key" ON "incident"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "drop_off_log_project_id_id_key" ON "drop_off_log"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_definition_form_id_id_key" ON "form_definition"("form_id", "id");

-- AddForeignKey
ALTER TABLE "roe" ADD CONSTRAINT "roe_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe" ADD CONSTRAINT "roe_project_id_form_id_form_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "form_document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe" ADD CONSTRAINT "roe_form_id_form_definition_id_fkey" FOREIGN KEY ("form_id", "form_definition_id") REFERENCES "form_definition"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe" ADD CONSTRAINT "roe_made_by_id_fkey" FOREIGN KEY ("made_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe" ADD CONSTRAINT "roe_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe" ADD CONSTRAINT "roe_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_project_id_roe_id_fkey" FOREIGN KEY ("project_id", "roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_project_id_form_id_form_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "form_document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_form_id_form_debris_type_id_fkey" FOREIGN KEY ("form_id", "form_debris_type_id") REFERENCES "form_debris_type"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_payable_type_id_fkey" FOREIGN KEY ("payable_type_id") REFERENCES "payable_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "roe_scope_item" ADD CONSTRAINT "roe_scope_item_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_roe_id_fkey" FOREIGN KEY ("project_id", "roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_roe_id_fkey" FOREIGN KEY ("project_id", "roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_survey_id_fkey" FOREIGN KEY ("project_id", "survey_id") REFERENCES "survey"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_incident_id_fkey" FOREIGN KEY ("project_id", "incident_id") REFERENCES "incident"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_project_id_drop_off_log_id_fkey" FOREIGN KEY ("project_id", "drop_off_log_id") REFERENCES "drop_off_log"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_created_reason_id_fkey" FOREIGN KEY ("created_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_project_id_form_id_form_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "form_document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_form_id_form_definition_id_fkey" FOREIGN KEY ("form_id", "form_definition_id") REFERENCES "form_definition"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_work_type_id_fkey" FOREIGN KEY ("work_type_id") REFERENCES "survey_work_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "survey" ADD CONSTRAINT "survey_project_id_roe_id_fkey" FOREIGN KEY ("project_id", "roe_id") REFERENCES "roe"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_created_reason_id_fkey" FOREIGN KEY ("created_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_project_id_form_id_form_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "form_document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_form_id_form_definition_id_fkey" FOREIGN KEY ("form_id", "form_definition_id") REFERENCES "form_definition"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_incident_type_id_fkey" FOREIGN KEY ("incident_type_id") REFERENCES "incident_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident" ADD CONSTRAINT "incident_incident_sub_type_id_fkey" FOREIGN KEY ("incident_sub_type_id") REFERENCES "incident_sub_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_created_reason_id_fkey" FOREIGN KEY ("created_reason_id") REFERENCES "reason"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_project_id_form_id_form_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "form_document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_form_id_form_definition_id_fkey" FOREIGN KEY ("form_id", "form_definition_id") REFERENCES "form_definition"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "drop_off_log" ADD CONSTRAINT "drop_off_log_project_id_site_id_fkey" FOREIGN KEY ("project_id", "site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

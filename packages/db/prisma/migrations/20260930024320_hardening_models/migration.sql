-- CreateEnum
CREATE TYPE "audit_operation" AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "audit_source" AS ENUM ('DEVICE', 'BACK_OFFICE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "audit_domain" AS ENUM ('SECURITY', 'BILLING', 'OPERATIONS', 'RECORDS');

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('ADMIN', 'MANAGER_ANALYST', 'MONITOR', 'READ_ONLY_VIEWER');

-- CreateEnum
CREATE TYPE "workflow" AS ENUM ('LOAD', 'HAUL_OUT', 'UNIT_RATE');

-- CreateEnum
CREATE TYPE "field_event_kind" AS ENUM ('COLLECTION', 'DISPOSAL', 'HAUL_OUT_COLLECTION', 'HAUL_OUT_DISPOSAL', 'UNIT_RATE');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('PENDING', 'COMPLETED', 'MANUAL_REVIEW', 'VOID');

-- CreateTable
CREATE TABLE "audit_record" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "table_name" TEXT NOT NULL,
    "record_id" TEXT NOT NULL,
    "operation" "audit_operation" NOT NULL,
    "prior_value" JSONB,
    "new_value" JSONB,
    "changed_fields" TEXT[],
    "actor_id" UUID,
    "device_id" UUID,
    "source" "audit_source" NOT NULL,
    "reason" TEXT,
    "request_id" TEXT,
    "domain" "audit_domain" NOT NULL,

    CONSTRAINT "audit_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "time_zone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "monitor_number" TEXT,
    "contractor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "public_key" TEXT NOT NULL,
    "enrolled_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "out_of_service_at" TIMESTAMPTZ(3),

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completed_load" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "collection_event_id" UUID NOT NULL,
    "disposal_event_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "completed_load_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "completed_load_id" UUID NOT NULL,
    "slot" INTEGER NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "prime_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lock" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "completed_load_id" UUID NOT NULL,
    "locked_by_id" UUID NOT NULL,
    "locked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_lock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_event" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "workflow" "workflow" NOT NULL,
    "kind" "field_event_kind" NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "split_suffix" TEXT NOT NULL DEFAULT '',
    "monitor_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_latitude" DECIMAL(38,8),
    "end_longitude" DECIMAL(38,8),
    "load_call" INTEGER,
    "status" "ticket_status" NOT NULL DEFAULT 'PENDING',
    "reconciled_at" TIMESTAMPTZ(3),

    CONSTRAINT "field_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_record_table_name_record_id_idx" ON "audit_record"("table_name", "record_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_monitor_number_key" ON "user"("monitor_number");

-- CreateIndex
CREATE UNIQUE INDEX "completed_load_collection_event_id_key" ON "completed_load"("collection_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "completed_load_disposal_event_id_key" ON "completed_load"("disposal_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "completed_load_project_id_ticket_number_key" ON "completed_load"("project_id", "ticket_number");

-- CreateIndex
CREATE INDEX "transaction_completed_load_id_idx" ON "transaction"("completed_load_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lock_completed_load_id_key" ON "invoice_lock"("completed_load_id");

-- CreateIndex
CREATE UNIQUE INDEX "field_event_project_id_workflow_ticket_number_split_suffix__key" ON "field_event"("project_id", "workflow", "ticket_number", "split_suffix", "kind");

-- AddForeignKey
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_record" ADD CONSTRAINT "audit_record_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_load" ADD CONSTRAINT "completed_load_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_load" ADD CONSTRAINT "completed_load_collection_event_id_fkey" FOREIGN KEY ("collection_event_id") REFERENCES "field_event"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "completed_load" ADD CONSTRAINT "completed_load_disposal_event_id_fkey" FOREIGN KEY ("disposal_event_id") REFERENCES "field_event"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_completed_load_id_fkey" FOREIGN KEY ("completed_load_id") REFERENCES "completed_load"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_prime_id_fkey" FOREIGN KEY ("prime_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_completed_load_id_fkey" FOREIGN KEY ("completed_load_id") REFERENCES "completed_load"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_event" ADD CONSTRAINT "field_event_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

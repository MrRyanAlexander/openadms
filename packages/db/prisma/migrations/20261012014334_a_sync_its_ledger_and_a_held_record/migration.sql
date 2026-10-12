-- CreateEnum
CREATE TYPE "sync_answer" AS ENUM ('SAVED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "not_saved_reason" AS ENUM ('NOT_A_RECORD', 'NAMES_NO_RECORD', 'ASSIGNMENT_NOT_SAVED', 'CERTIFICATION_REFUSED');

-- CreateTable
CREATE TABLE "sync" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "device_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_clock_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "clock_difference_seconds" BIGINT NOT NULL,
    "setup_version_sent" INTEGER,

    CONSTRAINT "sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synced_record" (
    "record_id" UUID NOT NULL,
    "record_kind" TEXT NOT NULL,
    "sync_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "answer" "sync_answer" NOT NULL,

    CONSTRAINT "synced_record_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "held_record" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "device_id" UUID NOT NULL,
    "sync_id" UUID NOT NULL,
    "sent_id" UUID,
    "project_id" UUID,
    "sent_monitor_id" UUID,
    "payload" JSONB NOT NULL,
    "sent_sha256" TEXT NOT NULL,
    "reason" "not_saved_reason" NOT NULL,
    "message" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_by_id" UUID,
    "resolved_at" TIMESTAMPTZ(3),
    "resolution" TEXT,

    CONSTRAINT "held_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_id_device_id_key" ON "sync"("id", "device_id");

-- CreateIndex
CREATE UNIQUE INDEX "held_record_device_id_sent_sha256_key" ON "held_record"("device_id", "sent_sha256");

-- AddForeignKey
ALTER TABLE "sync" ADD CONSTRAINT "sync_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "synced_record" ADD CONSTRAINT "synced_record_sync_id_device_id_fkey" FOREIGN KEY ("sync_id", "device_id") REFERENCES "sync"("id", "device_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_sync_id_device_id_fkey" FOREIGN KEY ("sync_id", "device_id") REFERENCES "sync"("id", "device_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "held_record" ADD CONSTRAINT "held_record_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

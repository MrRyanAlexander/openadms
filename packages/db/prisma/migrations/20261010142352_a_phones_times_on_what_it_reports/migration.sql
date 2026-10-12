-- AlterTable
ALTER TABLE "assignment" ADD COLUMN     "device_utc_offset_minutes" INTEGER,
ADD COLUMN     "made_at" TIMESTAMPTZ(3),
ADD COLUMN     "received_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "security_event" ADD COLUMN     "device_utc_offset_minutes" INTEGER;

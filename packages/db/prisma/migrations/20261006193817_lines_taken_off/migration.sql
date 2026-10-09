-- AlterTable
ALTER TABLE "carried_ticket" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "field_event_item" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

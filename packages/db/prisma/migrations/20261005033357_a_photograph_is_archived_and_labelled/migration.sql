-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ADD COLUMN     "label" TEXT;

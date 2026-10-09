-- AlterTable
ALTER TABLE "map_version" ALTER COLUMN "loaded_at" SET DEFAULT transaction_timestamp();

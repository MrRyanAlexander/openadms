-- AlterEnum
ALTER TYPE "site_area_source" ADD VALUE 'ESRI_LAYER';

-- AlterTable
ALTER TABLE "assignment" ADD COLUMN     "withdrawal_note" TEXT;

-- AlterTable
ALTER TABLE "map_version" ADD COLUMN     "zones_file_key" TEXT,
ADD COLUMN     "zones_source_name" TEXT;

-- AlterTable
ALTER TABLE "site_area_version" ADD COLUMN     "source_name" TEXT,
ADD COLUMN     "uploaded_file_key" TEXT;

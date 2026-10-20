-- CreateEnum
CREATE TYPE "photo_stage" AS ENUM ('PRE_WORK', 'MEASUREMENT', 'POST_WORK');

-- AlterTable
ALTER TABLE "kind_of_work" ADD COLUMN     "photos_by_stage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "photo" ADD COLUMN     "stage" "photo_stage";

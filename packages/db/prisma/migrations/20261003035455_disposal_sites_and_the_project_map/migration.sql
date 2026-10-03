/*
  Warnings:

  - A unique constraint covering the columns `[id,key]` on the table `site_type` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `activation_date` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `charges_tipping_fee` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `haul_outs_leave_here` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ineligible_site` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `latitude` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `longitude` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `site_type_id` to the `disposal_site` table without a default value. This is not possible if the table is not empty.
  - Added the required column `takes_loads` to the `disposal_site` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "site_area_source" AS ENUM ('DRAWN', 'UPLOAD');

-- CreateEnum
CREATE TYPE "map_source" AS ENUM ('UPLOAD', 'ESRI_LAYER', 'DRAWN');

-- AlterTable
ALTER TABLE "disposal_site" ADD COLUMN     "activation_date" DATE NOT NULL,
ADD COLUMN     "charges_tipping_fee" BOOLEAN NOT NULL,
ADD COLUMN     "close_date" DATE,
ADD COLUMN     "haul_outs_leave_here" BOOLEAN NOT NULL,
ADD COLUMN     "ineligible_site" BOOLEAN NOT NULL,
ADD COLUMN     "latitude" DECIMAL(38,8) NOT NULL,
ADD COLUMN     "longitude" DECIMAL(38,8) NOT NULL,
ADD COLUMN     "permit_number" TEXT,
ADD COLUMN     "short_code" TEXT,
ADD COLUMN     "site_type_id" UUID NOT NULL,
ADD COLUMN     "site_type_key" TEXT,
ADD COLUMN     "takes_loads" BOOLEAN NOT NULL;

-- CreateTable
CREATE TABLE "disposal_site_label" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "site_id" UUID NOT NULL,
    "site_label_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "disposal_site_label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposal_site_tipping_fee" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "pay_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "disposal_site_tipping_fee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_area_version" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "site_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "geometry" JSONB NOT NULL,
    "west_longitude" DECIMAL(38,8) NOT NULL,
    "south_latitude" DECIMAL(38,8) NOT NULL,
    "east_longitude" DECIMAL(38,8) NOT NULL,
    "north_latitude" DECIMAL(38,8) NOT NULL,
    "source" "site_area_source" NOT NULL,
    "created_by_id" UUID NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_area_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_version" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "map_source" NOT NULL,
    "source_name" TEXT,
    "zone_name_field" TEXT,
    "boundary" JSONB NOT NULL,
    "west_longitude" DECIMAL(38,8) NOT NULL,
    "south_latitude" DECIMAL(38,8) NOT NULL,
    "east_longitude" DECIMAL(38,8) NOT NULL,
    "north_latitude" DECIMAL(38,8) NOT NULL,
    "uploaded_file_key" TEXT,
    "loaded_by_id" UUID NOT NULL,
    "loaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zone" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "map_version_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "west_longitude" DECIMAL(38,8) NOT NULL,
    "south_latitude" DECIMAL(38,8) NOT NULL,
    "east_longitude" DECIMAL(38,8) NOT NULL,
    "north_latitude" DECIMAL(38,8) NOT NULL,

    CONSTRAINT "zone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "disposal_site_label_site_id_site_label_id_key" ON "disposal_site_label"("site_id", "site_label_id");

-- CreateIndex
CREATE UNIQUE INDEX "disposal_site_tipping_fee_site_id_pay_item_id_key" ON "disposal_site_tipping_fee"("site_id", "pay_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_area_version_site_id_version_key" ON "site_area_version"("site_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "map_version_project_id_version_key" ON "map_version"("project_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "zone_map_version_id_name_key" ON "zone"("map_version_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "site_type_id_key_key" ON "site_type"("id", "key");

-- AddForeignKey
ALTER TABLE "disposal_site" ADD CONSTRAINT "disposal_site_site_type_id_fkey" FOREIGN KEY ("site_type_id") REFERENCES "site_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "disposal_site" ADD CONSTRAINT "disposal_site_site_type_id_site_type_key_fkey" FOREIGN KEY ("site_type_id", "site_type_key") REFERENCES "site_type"("id", "key") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "disposal_site_label" ADD CONSTRAINT "disposal_site_label_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "disposal_site"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "disposal_site_label" ADD CONSTRAINT "disposal_site_label_site_label_id_fkey" FOREIGN KEY ("site_label_id") REFERENCES "site_label"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "disposal_site_tipping_fee" ADD CONSTRAINT "disposal_site_tipping_fee_project_id_site_id_fkey" FOREIGN KEY ("project_id", "site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "disposal_site_tipping_fee" ADD CONSTRAINT "disposal_site_tipping_fee_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "disposal_site"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "site_area_version" ADD CONSTRAINT "site_area_version_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "map_version" ADD CONSTRAINT "map_version_loaded_by_id_fkey" FOREIGN KEY ("loaded_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "zone" ADD CONSTRAINT "zone_map_version_id_fkey" FOREIGN KEY ("map_version_id") REFERENCES "map_version"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

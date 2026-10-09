/*
  Warnings:

  - A unique constraint covering the columns `[project_id,contractor_id,prime_id]` on the table `project_contractor` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "box_shape" AS ENUM ('RECTANGLE', 'TRIANGLE', 'TWO_LENGTH_HOIST', 'ROUND_BOTTOM', 'RADIUS_CORNER');

-- CreateEnum
CREATE TYPE "box_sign" AS ENUM ('ADD', 'SUBTRACT');

-- AlterTable
ALTER TABLE "map_version" ALTER COLUMN "loaded_at" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "certification" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "cert_number" TEXT NOT NULL,
    "kind" "certification_kind" NOT NULL,
    "prime_id" UUID NOT NULL,
    "first_tier_sub_id" UUID,
    "second_tier_sub_id" UUID,
    "vehicle_type_id" UUID,
    "vehicle_type_other" TEXT,
    "crew_type_id" UUID,
    "capacity_cy" INTEGER,
    "driver_name" TEXT,
    "driver_phone" TEXT,
    "driver_licence_number" TEXT,
    "driver_licence_state" TEXT,
    "driver_licence_expiry" DATE,
    "tag_number" TEXT,
    "tag_state" TEXT,
    "tag_expiry" DATE,
    "certified_at" TIMESTAMPTZ(3) NOT NULL,
    "device_utc_offset_minutes" INTEGER NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "certified_by_id" UUID NOT NULL,
    "device_id" UUID,
    "assignment_id" UUID,
    "client_representative_name" TEXT,
    "contractor_representative_name" TEXT,
    "signatures_on_file" BOOLEAN NOT NULL,
    "replaces_id" UUID,
    "replaced_reason" TEXT,
    "copied_from_id" UUID,
    "revoked_from" DATE,
    "revoked_reason" TEXT,
    "revoked_by_id" UUID,
    "notes" TEXT,

    CONSTRAINT "certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_helper" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "certification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "certification_helper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_box" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "certification_id" UUID NOT NULL,
    "kind" "certification_kind" NOT NULL,
    "position" INTEGER NOT NULL,
    "feature_id" UUID,
    "feature_other" TEXT,
    "shape" "box_shape" NOT NULL,
    "sign" "box_sign" NOT NULL,
    "length" INTEGER,
    "second_length" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "diameter" INTEGER,
    "radius" INTEGER,
    "run" INTEGER,
    "corners" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "certification_box_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certification_project_id_cert_number_key" ON "certification"("project_id", "cert_number");

-- CreateIndex
CREATE UNIQUE INDEX "certification_project_id_id_key" ON "certification"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "certification_project_id_replaces_id_key" ON "certification"("project_id", "replaces_id");

-- CreateIndex
CREATE UNIQUE INDEX "certification_id_kind_key" ON "certification"("id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "certification_helper_certification_id_user_id_key" ON "certification_helper"("certification_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "certification_box_certification_id_position_key" ON "certification_box"("certification_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "project_contractor_project_id_contractor_id_prime_id_key" ON "project_contractor"("project_id", "contractor_id", "prime_id");

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_prime_id_fkey" FOREIGN KEY ("prime_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_project_id_prime_id_fkey" FOREIGN KEY ("project_id", "prime_id") REFERENCES "project_contractor"("project_id", "as_prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_first_tier_sub_id_fkey" FOREIGN KEY ("first_tier_sub_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_second_tier_sub_id_fkey" FOREIGN KEY ("second_tier_sub_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_project_id_first_tier_sub_id_prime_id_fkey" FOREIGN KEY ("project_id", "first_tier_sub_id", "prime_id") REFERENCES "project_contractor"("project_id", "contractor_id", "prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_project_id_second_tier_sub_id_prime_id_fkey" FOREIGN KEY ("project_id", "second_tier_sub_id", "prime_id") REFERENCES "project_contractor"("project_id", "contractor_id", "prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_vehicle_type_id_fkey" FOREIGN KEY ("vehicle_type_id") REFERENCES "vehicle_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_crew_type_id_fkey" FOREIGN KEY ("crew_type_id") REFERENCES "crew_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_certified_by_id_fkey" FOREIGN KEY ("certified_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "device"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_project_id_replaces_id_fkey" FOREIGN KEY ("project_id", "replaces_id") REFERENCES "certification"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_copied_from_id_fkey" FOREIGN KEY ("copied_from_id") REFERENCES "certification"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification" ADD CONSTRAINT "certification_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification_helper" ADD CONSTRAINT "certification_helper_certification_id_fkey" FOREIGN KEY ("certification_id") REFERENCES "certification"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification_helper" ADD CONSTRAINT "certification_helper_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_certification_id_kind_fkey" FOREIGN KEY ("certification_id", "kind") REFERENCES "certification"("id", "kind") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "vehicle_feature"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

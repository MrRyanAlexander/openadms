/*
  Warnings:

  - Added the required column `kind` to the `contractor` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "contractor_kind" AS ENUM ('HAULER', 'MONITORING', 'CREW', 'OTHER');

-- CreateEnum
CREATE TYPE "contractor_position" AS ENUM ('PRIME', 'SUB_TIER_1', 'SUB_TIER_2');

-- AlterTable
ALTER TABLE "contractor" ADD COLUMN     "kind" "contractor_kind" NOT NULL,
ADD COLUMN     "merged_into_id" UUID;

-- CreateTable
CREATE TABLE "project_contractor" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "contractor_id" UUID NOT NULL,
    "position" "contractor_position" NOT NULL,
    "prime_id" UUID,
    "as_prime_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "project_contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prime_id" UUID NOT NULL,
    "signed_copy_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_contractor_project_id_contractor_id_key" ON "project_contractor"("project_id", "contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_contractor_project_id_as_prime_id_key" ON "project_contractor"("project_id", "as_prime_id");

-- CreateIndex
CREATE INDEX "contract_project_id_idx" ON "contract"("project_id");

-- AddForeignKey
ALTER TABLE "contractor" ADD CONSTRAINT "contractor_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_contractor" ADD CONSTRAINT "project_contractor_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_contractor" ADD CONSTRAINT "project_contractor_contractor_id_fkey" FOREIGN KEY ("contractor_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "project_contractor" ADD CONSTRAINT "project_contractor_project_id_prime_id_fkey" FOREIGN KEY ("project_id", "prime_id") REFERENCES "project_contractor"("project_id", "as_prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_prime_id_fkey" FOREIGN KEY ("prime_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contract" ADD CONSTRAINT "contract_project_id_prime_id_fkey" FOREIGN KEY ("project_id", "prime_id") REFERENCES "project_contractor"("project_id", "as_prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

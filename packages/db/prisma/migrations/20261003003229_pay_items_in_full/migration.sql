/*
  Warnings:

  - A unique constraint covering the columns `[project_id,id,kind_of_work_id]` on the table `pay_item` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `kind_of_work_id` to the `assignment_pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `count_is_always_one` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `decimals_allowed` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `gps_required` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `measurement_required` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `monitor_may_mark_ineligible` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `payable_type_id` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `photos_required` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity_from_carried_tickets` to the `pay_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `pay_item` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "billing_unit" AS ENUM ('CY', 'TN', 'EA', 'LB', 'HR', 'CREW_DAY', 'TBN');

-- CreateEnum
CREATE TYPE "crew_time_conversion" AS ENUM ('PER_HOUR', 'PER_DAY_EXACT', 'PER_DAY_STEPS');

-- DropForeignKey
ALTER TABLE "assignment_pay_item" DROP CONSTRAINT "assignment_pay_item_project_id_pay_item_id_fkey";

-- AlterTable
ALTER TABLE "assignment_pay_item" ADD COLUMN     "kind_of_work_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "pay_item" ADD COLUMN     "band_from" DECIMAL(8,1),
ADD COLUMN     "band_to" DECIMAL(8,1),
ADD COLUMN     "count_is_always_one" BOOLEAN NOT NULL,
ADD COLUMN     "crew_day_hours" DECIMAL(4,2),
ADD COLUMN     "crew_time_conversion" "crew_time_conversion",
ADD COLUMN     "decimals_allowed" BOOLEAN NOT NULL,
ADD COLUMN     "gps_required" BOOLEAN NOT NULL,
ADD COLUMN     "kind_of_work_id" UUID,
ADD COLUMN     "measurement_required" BOOLEAN NOT NULL,
ADD COLUMN     "monitor_may_mark_ineligible" BOOLEAN NOT NULL,
ADD COLUMN     "payable_type_id" UUID NOT NULL,
ADD COLUMN     "photos_required" BOOLEAN NOT NULL,
ADD COLUMN     "quantity_from_carried_tickets" BOOLEAN NOT NULL,
ADD COLUMN     "unit" "billing_unit" NOT NULL;

-- CreateTable
CREATE TABLE "pay_item_crew_day_step" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "pay_item_id" UUID NOT NULL,
    "from_hours" DECIMAL(4,2) NOT NULL,
    "to_hours" DECIMAL(4,2) NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_item_crew_day_step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_item_rate" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "pay_item_id" UUID NOT NULL,
    "prime_id" UUID NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_item_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_item_crew_day_step_pay_item_id_from_hours_key" ON "pay_item_crew_day_step"("pay_item_id", "from_hours");

-- CreateIndex
CREATE UNIQUE INDEX "pay_item_rate_pay_item_id_prime_id_key" ON "pay_item_rate"("pay_item_id", "prime_id");

-- CreateIndex
CREATE UNIQUE INDEX "pay_item_project_id_id_kind_of_work_id_key" ON "pay_item"("project_id", "id", "kind_of_work_id");

-- AddForeignKey
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_payable_type_id_fkey" FOREIGN KEY ("payable_type_id") REFERENCES "payable_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_kind_of_work_id_fkey" FOREIGN KEY ("kind_of_work_id") REFERENCES "kind_of_work"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pay_item_crew_day_step" ADD CONSTRAINT "pay_item_crew_day_step_pay_item_id_fkey" FOREIGN KEY ("pay_item_id") REFERENCES "pay_item"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pay_item_rate" ADD CONSTRAINT "pay_item_rate_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pay_item_rate" ADD CONSTRAINT "pay_item_rate_prime_id_fkey" FOREIGN KEY ("prime_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pay_item_rate" ADD CONSTRAINT "pay_item_rate_project_id_prime_id_fkey" FOREIGN KEY ("project_id", "prime_id") REFERENCES "project_contractor"("project_id", "as_prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_pay_item" ADD CONSTRAINT "assignment_pay_item_project_id_pay_item_id_kind_of_work_id_fkey" FOREIGN KEY ("project_id", "pay_item_id", "kind_of_work_id") REFERENCES "pay_item"("project_id", "id", "kind_of_work_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

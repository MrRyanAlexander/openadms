/*
  Warnings:

  - A unique constraint covering the columns `[project_id,completed_haul_out_id,id]` on the table `completed_haul_out_collection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[project_id,completed_load_id,id]` on the table `completed_load_collection` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[completed_haul_out_id]` on the table `invoice_lock` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[field_event_id]` on the table `invoice_lock` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[completed_load_collection_id,slot]` on the table `transaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[completed_haul_out_collection_id,slot]` on the table `transaction` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[field_event_id,slot]` on the table `transaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `contract_id` to the `transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pay_item_id` to the `transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `project_id` to the `transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rule_id` to the `transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit` to the `transaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_completed_load_id_fkey";

-- AlterTable
ALTER TABLE "invoice_lock" ADD COLUMN     "completed_haul_out_id" UUID,
ADD COLUMN     "field_event_id" UUID,
ALTER COLUMN "completed_load_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "transaction" ADD COLUMN     "completed_haul_out_collection_id" UUID,
ADD COLUMN     "completed_haul_out_id" UUID,
ADD COLUMN     "completed_load_collection_id" UUID,
ADD COLUMN     "contract_id" UUID NOT NULL,
ADD COLUMN     "field_event_id" UUID,
ADD COLUMN     "operating_sub_id" UUID,
ADD COLUMN     "pay_item_id" UUID NOT NULL,
ADD COLUMN     "project_id" UUID NOT NULL,
ADD COLUMN     "reconciliation_run_id" UUID,
ADD COLUMN     "rule_id" UUID NOT NULL,
ADD COLUMN     "unit" "billing_unit" NOT NULL,
ALTER COLUMN "completed_load_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "completed_haul_out_collection_project_id_completed_haul_out_key" ON "completed_haul_out_collection"("project_id", "completed_haul_out_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "completed_load_collection_project_id_completed_load_id_id_key" ON "completed_load_collection"("project_id", "completed_load_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lock_completed_haul_out_id_key" ON "invoice_lock"("completed_haul_out_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lock_field_event_id_key" ON "invoice_lock"("field_event_id");

-- CreateIndex
CREATE INDEX "transaction_project_id_idx" ON "transaction"("project_id");

-- CreateIndex
CREATE INDEX "transaction_completed_haul_out_id_idx" ON "transaction"("completed_haul_out_id");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_completed_load_collection_id_slot_key" ON "transaction"("completed_load_collection_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_completed_haul_out_collection_id_slot_key" ON "transaction"("completed_haul_out_collection_id", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_field_event_id_slot_key" ON "transaction"("field_event_id", "slot");

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_completed_load_id_fkey" FOREIGN KEY ("project_id", "completed_load_id") REFERENCES "completed_load"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_completed_load_id_completed_load_co_fkey" FOREIGN KEY ("project_id", "completed_load_id", "completed_load_collection_id") REFERENCES "completed_load_collection"("project_id", "completed_load_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_completed_haul_out_id_fkey" FOREIGN KEY ("project_id", "completed_haul_out_id") REFERENCES "completed_haul_out"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_completed_haul_out_id_completed_hau_fkey" FOREIGN KEY ("project_id", "completed_haul_out_id", "completed_haul_out_collection_id") REFERENCES "completed_haul_out_collection"("project_id", "completed_haul_out_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_field_event_id_fkey" FOREIGN KEY ("project_id", "field_event_id") REFERENCES "field_event"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_rule_id_project_id_fkey" FOREIGN KEY ("rule_id", "project_id") REFERENCES "rule"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_contract_id_fkey" FOREIGN KEY ("project_id", "contract_id") REFERENCES "contract"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_prime_id_fkey" FOREIGN KEY ("project_id", "prime_id") REFERENCES "project_contractor"("project_id", "as_prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_operating_sub_id_fkey" FOREIGN KEY ("operating_sub_id") REFERENCES "contractor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_operating_sub_id_prime_id_fkey" FOREIGN KEY ("project_id", "operating_sub_id", "prime_id") REFERENCES "project_contractor"("project_id", "contractor_id", "prime_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_project_id_reconciliation_run_id_fkey" FOREIGN KEY ("project_id", "reconciliation_run_id") REFERENCES "reconciliation_run"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_completed_haul_out_id_fkey" FOREIGN KEY ("completed_haul_out_id") REFERENCES "completed_haul_out"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_lock" ADD CONSTRAINT "invoice_lock_field_event_id_fkey" FOREIGN KEY ("field_event_id") REFERENCES "field_event"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

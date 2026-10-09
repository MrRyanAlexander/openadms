/*
  Warnings:

  - You are about to drop the column `name` on the `pay_item` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[project_id,code]` on the table `pay_item` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `description` to the `pay_item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pay_item" DROP COLUMN "name",
ADD COLUMN     "description" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "pay_item_project_id_code_key" ON "pay_item"("project_id", "code");

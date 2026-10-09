/*
  Warnings:

  - You are about to drop the column `copied_from_id` on the `certification` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "certification" DROP CONSTRAINT "certification_copied_from_id_fkey";

-- AlterTable
ALTER TABLE "certification" DROP COLUMN "copied_from_id";

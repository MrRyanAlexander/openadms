/*
  Warnings:

  - You are about to drop the column `enabled` on the `form` table. All the data in the column will be lost.

*/
-- AlterEnum
ALTER TYPE "flag_code" ADD VALUE 'SUB_NAME_ALIKE';

-- AlterEnum
ALTER TYPE "not_saved_reason" ADD VALUE 'PROJECT_CLOSED';

-- AlterTable
ALTER TABLE "form" DROP COLUMN "enabled";

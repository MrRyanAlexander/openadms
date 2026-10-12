/*
  Warnings:

  - The primary key for the `synced_record` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `record_id` on the `synced_record` table. All the data in the column will be lost.
  - Added the required column `id` to the `synced_record` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "synced_record" DROP CONSTRAINT "synced_record_pkey",
DROP COLUMN "record_id",
ADD COLUMN     "id" UUID NOT NULL,
ADD CONSTRAINT "synced_record_pkey" PRIMARY KEY ("id");

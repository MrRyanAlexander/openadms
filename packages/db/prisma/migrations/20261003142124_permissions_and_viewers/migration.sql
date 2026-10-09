-- CreateEnum
CREATE TYPE "viewer_kind" AS ENUM ('CLIENT', 'CONTRACTOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "permission" AS ENUM ('CORRECT', 'RENUMBER', 'VOID', 'ACCEPT_FLAG', 'QC', 'LOCK_INVOICED', 'UNLOCK_INVOICED', 'APPROVE_HOURS', 'SETUP', 'DISPATCH');

-- AlterTable
ALTER TABLE "device" ADD COLUMN     "key_revoked_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "viewer_kind" "viewer_kind";

-- CreateTable
CREATE TABLE "user_permission" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "permission" "permission" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_viewer_project" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "user_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "user_viewer_project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_user_id_permission_key" ON "user_permission"("user_id", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "user_viewer_project_user_id_project_id_key" ON "user_viewer_project"("user_id", "project_id");

-- AddForeignKey
ALTER TABLE "user_permission" ADD CONSTRAINT "user_permission_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_viewer_project" ADD CONSTRAINT "user_viewer_project_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "user_viewer_project" ADD CONSTRAINT "user_viewer_project_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

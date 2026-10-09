-- AlterTable
ALTER TABLE "user_credential" ADD COLUMN     "failed_sign_ins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "password_change_required" BOOLEAN NOT NULL DEFAULT false;

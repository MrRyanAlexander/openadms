-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "security_event_kind" ADD VALUE 'MASTER_PASSCODE_FAILED';
ALTER TYPE "security_event_kind" ADD VALUE 'MASTER_PASSCODE_LOCKOUT';

-- AlterEnum
ALTER TYPE "user_role" ADD VALUE 'MASTER_PASSCODE';

-- CreateTable
CREATE TABLE "master_passcode_tries" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "version" INTEGER NOT NULL,
    "failed_tries" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_passcode_tries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_passcode_tries_version_key" ON "master_passcode_tries"("version");

-- AddForeignKey
ALTER TABLE "master_passcode_tries" ADD CONSTRAINT "master_passcode_tries_version_fkey" FOREIGN KEY ("version") REFERENCES "master_passcode"("version") ON DELETE RESTRICT ON UPDATE RESTRICT;

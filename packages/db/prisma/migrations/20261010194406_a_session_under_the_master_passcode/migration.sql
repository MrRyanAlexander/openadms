-- CreateEnum
CREATE TYPE "master_passcode_session" AS ENUM ('AS_MONITOR', 'TEMPORARY');

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "master_passcode_session" "master_passcode_session";

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "flag_code" ADD VALUE 'DETAIL_MISSING';
ALTER TYPE "flag_code" ADD VALUE 'TYPED_NUMBER_NO_REASON';
ALTER TYPE "flag_code" ADD VALUE 'WRONG_KIND_OF_BADGE';
ALTER TYPE "flag_code" ADD VALUE 'GPS_UNREADABLE';
ALTER TYPE "flag_code" ADD VALUE 'NOT_A_TICKET_NUMBER';
ALTER TYPE "flag_code" ADD VALUE 'ENDED_BEFORE_STARTED';
ALTER TYPE "flag_code" ADD VALUE 'SPLIT_NOT_ALLOWED';
ALTER TYPE "flag_code" ADD VALUE 'OUTSIDE_CONTROL_RANGES';
ALTER TYPE "flag_code" ADD VALUE 'ASSIGNMENT_ON_ANOTHER_PROJECT';

-- AlterEnum
ALTER TYPE "number_series" ADD VALUE 'ROE';

-- DropIndex
DROP INDEX "number_block_project_id_series_first_number_key";

-- CreateTable
CREATE TABLE "project_number_series" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "series" "number_series" NOT NULL,
    "first_number" INTEGER NOT NULL,
    "next_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_number_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_range" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "series" "number_series" NOT NULL,
    "first_number" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "control_range_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_number_series_project_id_series_key" ON "project_number_series"("project_id", "series");

-- CreateIndex
CREATE INDEX "control_range_project_id_series_idx" ON "control_range"("project_id", "series");

-- CreateIndex
CREATE INDEX "number_block_project_id_series_first_number_idx" ON "number_block"("project_id", "series", "first_number");

-- AddForeignKey
ALTER TABLE "project_number_series" ADD CONSTRAINT "project_number_series_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "control_range" ADD CONSTRAINT "control_range_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "number_block" ADD CONSTRAINT "number_block_project_id_series_fkey" FOREIGN KEY ("project_id", "series") REFERENCES "project_number_series"("project_id", "series") ON DELETE RESTRICT ON UPDATE RESTRICT;

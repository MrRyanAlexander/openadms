/*
  Warnings:

  - A unique constraint covering the columns `[project_id,id]` on the table `assignment` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "pay_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "pay_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_pay_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "assignment_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "pay_item_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "assignment_pay_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_item_project_id_id_key" ON "pay_item"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_pay_item_assignment_id_pay_item_id_key" ON "assignment_pay_item"("assignment_id", "pay_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_project_id_id_key" ON "assignment"("project_id", "id");

-- AddForeignKey
ALTER TABLE "pay_item" ADD CONSTRAINT "pay_item_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_pay_item" ADD CONSTRAINT "assignment_pay_item_project_id_assignment_id_fkey" FOREIGN KEY ("project_id", "assignment_id") REFERENCES "assignment"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignment_pay_item" ADD CONSTRAINT "assignment_pay_item_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

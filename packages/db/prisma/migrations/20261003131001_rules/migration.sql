/*
  Warnings:

  - A unique constraint covering the columns `[project_id,id]` on the table `contract` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[project_id,id]` on the table `field_tag` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[project_id,id,document_type]` on the table `form` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[form_id,id]` on the table `form_debris_type` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "rule_criterion_key" AS ENUM ('TICKET_DATE', 'CONTRACTOR', 'DEBRIS_TYPE', 'FIELD_TAG', 'WEIGHT', 'VOLUME', 'COLLECTION_ADDRESS', 'ZONE', 'DISPOSAL_SITE', 'FROM_SITE', 'DISPOSAL_SITE_TYPE', 'MILEAGE', 'PAY_ITEM', 'UNIT_COUNT', 'MEASUREMENT', 'ITEM');

-- CreateEnum
CREATE TYPE "rule_operator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'IS_ONE_OF', 'IS_NOT_ONE_OF', 'BETWEEN', 'AT_LEAST', 'AT_MOST', 'MORE_THAN', 'LESS_THAN', 'ON', 'NOT_ON', 'ON_OR_BEFORE', 'ON_OR_AFTER', 'CONTAINS', 'STARTS_WITH', 'IS_EMPTY', 'IS_NOT_EMPTY');

-- CreateEnum
CREATE TYPE "rule_action_kind" AS ENUM ('ADD_TRANSACTION', 'REMOVE_TRANSACTION', 'VOID_TICKET');

-- CreateEnum
CREATE TYPE "quantity_from" AS ENUM ('ALL_ITEMS', 'CHOSEN_ITEMS');

-- CreateTable
CREATE TABLE "rule" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "document_type" "form_document_type" NOT NULL,
    "name" TEXT NOT NULL,
    "contract_id" UUID,
    "active" BOOLEAN NOT NULL,
    "from_pay_item_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_criterion" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "rule_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "criterion" "rule_criterion_key" NOT NULL,
    "operator" "rule_operator" NOT NULL,
    "number_from" DECIMAL(14,4),
    "number_to" DECIMAL(14,4),
    "date_from" DATE,
    "date_to" DATE,
    "text" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "rule_criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_criterion_pick" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "criterion_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "form_id" UUID NOT NULL,
    "criterion" "rule_criterion_key" NOT NULL,
    "contractor_id" UUID,
    "form_debris_type_id" UUID,
    "field_tag_id" UUID,
    "disposal_site_id" UUID,
    "site_type_id" UUID,
    "pay_item_id" UUID,
    "item_name_id" UUID,
    "zone_name" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "rule_criterion_pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_action" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "rule_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "kind" "rule_action_kind" NOT NULL,
    "slot" INTEGER,
    "pay_item_id" UUID,
    "quantity_from" "quantity_from",
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "rule_action_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_action_item" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "action_id" UUID NOT NULL,
    "item_name_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "rule_action_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rule_project_id_form_id_idx" ON "rule"("project_id", "form_id");

-- CreateIndex
CREATE UNIQUE INDEX "rule_id_project_id_form_id_key" ON "rule"("id", "project_id", "form_id");

-- CreateIndex
CREATE UNIQUE INDEX "rule_id_project_id_key" ON "rule"("id", "project_id");

-- CreateIndex
CREATE UNIQUE INDEX "rule_criterion_rule_id_position_key" ON "rule_criterion"("rule_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "rule_criterion_id_project_id_form_id_criterion_key" ON "rule_criterion"("id", "project_id", "form_id", "criterion");

-- CreateIndex
CREATE INDEX "rule_criterion_pick_criterion_id_idx" ON "rule_criterion_pick"("criterion_id");

-- CreateIndex
CREATE INDEX "rule_action_rule_id_idx" ON "rule_action"("rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "rule_action_item_action_id_item_name_id_key" ON "rule_action_item"("action_id", "item_name_id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_project_id_id_key" ON "contract"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "field_tag_project_id_id_key" ON "field_tag"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "form_project_id_id_document_type_key" ON "form"("project_id", "id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "form_debris_type_form_id_id_key" ON "form_debris_type"("form_id", "id");

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_project_id_form_id_document_type_fkey" FOREIGN KEY ("project_id", "form_id", "document_type") REFERENCES "form"("project_id", "id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_project_id_contract_id_fkey" FOREIGN KEY ("project_id", "contract_id") REFERENCES "contract"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule" ADD CONSTRAINT "rule_project_id_from_pay_item_id_fkey" FOREIGN KEY ("project_id", "from_pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion" ADD CONSTRAINT "rule_criterion_rule_id_project_id_form_id_fkey" FOREIGN KEY ("rule_id", "project_id", "form_id") REFERENCES "rule"("id", "project_id", "form_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_criterion_id_project_id_form_id_criter_fkey" FOREIGN KEY ("criterion_id", "project_id", "form_id", "criterion") REFERENCES "rule_criterion"("id", "project_id", "form_id", "criterion") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_project_id_contractor_id_fkey" FOREIGN KEY ("project_id", "contractor_id") REFERENCES "project_contractor"("project_id", "contractor_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_form_id_form_debris_type_id_fkey" FOREIGN KEY ("form_id", "form_debris_type_id") REFERENCES "form_debris_type"("form_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_project_id_field_tag_id_fkey" FOREIGN KEY ("project_id", "field_tag_id") REFERENCES "field_tag"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_project_id_disposal_site_id_fkey" FOREIGN KEY ("project_id", "disposal_site_id") REFERENCES "disposal_site"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_site_type_id_fkey" FOREIGN KEY ("site_type_id") REFERENCES "site_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_item_name_id_fkey" FOREIGN KEY ("item_name_id") REFERENCES "item_name"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_action" ADD CONSTRAINT "rule_action_rule_id_project_id_fkey" FOREIGN KEY ("rule_id", "project_id") REFERENCES "rule"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_action" ADD CONSTRAINT "rule_action_project_id_pay_item_id_fkey" FOREIGN KEY ("project_id", "pay_item_id") REFERENCES "pay_item"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_action_item" ADD CONSTRAINT "rule_action_item_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "rule_action"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "rule_action_item" ADD CONSTRAINT "rule_action_item_item_name_id_fkey" FOREIGN KEY ("item_name_id") REFERENCES "item_name"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

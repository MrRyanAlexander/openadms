-- CreateEnum
CREATE TYPE "count_shape" AS ENUM ('NUMBER', 'ITEM_COUNTS', 'ITEM_HOURS');

-- CreateEnum
CREATE TYPE "certification_kind" AS ENUM ('CONTAINER', 'CREW');

-- CreateEnum
CREATE TYPE "reason_use" AS ENUM ('VOID', 'TYPED_NUMBER', 'ACCEPT_FLAG', 'BACK_OFFICE_RECORD');

-- CreateTable
CREATE TABLE "program_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "requires_roe" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "program_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_reference_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "declaration_reference_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debris_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "debris_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reduction_method" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "reduction_method_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payable_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "payable_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kind_of_work" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "count_shape" "count_shape" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "kind_of_work_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_name" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind_of_work_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "item_name_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "certifies" "certification_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_feature" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "vehicle_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "crew_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "site_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_label" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "site_label_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "incident_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_sub_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "incident_type_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "incident_sub_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reason" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "uses" "reason_use"[] DEFAULT ARRAY[]::"reason_use"[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "reason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "survey_work_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "survey_work_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clock_activity" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "clock_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_tag" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "key" TEXT,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "project_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "field_tag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "program_type_key_key" ON "program_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_reference_type_key_key" ON "declaration_reference_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "debris_type_key_key" ON "debris_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "reduction_method_key_key" ON "reduction_method"("key");

-- CreateIndex
CREATE UNIQUE INDEX "payable_type_key_key" ON "payable_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "kind_of_work_key_key" ON "kind_of_work"("key");

-- CreateIndex
CREATE UNIQUE INDEX "item_name_key_key" ON "item_name"("key");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_type_key_key" ON "vehicle_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_feature_key_key" ON "vehicle_feature"("key");

-- CreateIndex
CREATE UNIQUE INDEX "crew_type_key_key" ON "crew_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "site_type_key_key" ON "site_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "site_label_key_key" ON "site_label"("key");

-- CreateIndex
CREATE UNIQUE INDEX "incident_type_key_key" ON "incident_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "incident_sub_type_key_key" ON "incident_sub_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "reason_key_key" ON "reason"("key");

-- CreateIndex
CREATE UNIQUE INDEX "survey_work_type_key_key" ON "survey_work_type"("key");

-- CreateIndex
CREATE UNIQUE INDEX "clock_activity_key_key" ON "clock_activity"("key");

-- CreateIndex
CREATE UNIQUE INDEX "field_tag_key_key" ON "field_tag"("key");

-- AddForeignKey
ALTER TABLE "item_name" ADD CONSTRAINT "item_name_kind_of_work_id_fkey" FOREIGN KEY ("kind_of_work_id") REFERENCES "kind_of_work"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "incident_sub_type" ADD CONSTRAINT "incident_sub_type_incident_type_id_fkey" FOREIGN KEY ("incident_type_id") REFERENCES "incident_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "field_tag" ADD CONSTRAINT "field_tag_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

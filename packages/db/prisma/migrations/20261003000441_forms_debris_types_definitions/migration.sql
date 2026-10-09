-- CreateEnum
CREATE TYPE "form_document_type" AS ENUM ('LOAD', 'HAUL_OUT', 'UNIT_RATE', 'CERTIFICATION', 'ROE', 'SURVEY', 'INCIDENT', 'DROP_OFF_LOG');

-- AlterTable
ALTER TABLE "assignment" ADD COLUMN     "form_document_types" "form_document_type"[] DEFAULT ARRAY[]::"form_document_type"[];

-- CreateTable
CREATE TABLE "form" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document_type" "form_document_type" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "gps_required" BOOLEAN,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_debris_type" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "form_id" UUID NOT NULL,
    "document_type" "form_document_type" NOT NULL,
    "debris_type_id" UUID NOT NULL,
    "reduced" BOOLEAN NOT NULL,
    "reduction_method_id" UUID,
    "hidden_on_phones" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "form_debris_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_definition" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "form_id" UUID NOT NULL,
    "document_type" "form_document_type" NOT NULL,
    "version" INTEGER NOT NULL,
    "fields" JSONB NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_definition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_project_id_document_type_key" ON "form"("project_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "form_id_document_type_key" ON "form"("id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "form_debris_type_form_id_debris_type_id_key" ON "form_debris_type"("form_id", "debris_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "form_definition_form_id_version_key" ON "form_definition"("form_id", "version");

-- AddForeignKey
ALTER TABLE "form" ADD CONSTRAINT "form_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "form_debris_type" ADD CONSTRAINT "form_debris_type_form_id_document_type_fkey" FOREIGN KEY ("form_id", "document_type") REFERENCES "form"("id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "form_debris_type" ADD CONSTRAINT "form_debris_type_debris_type_id_fkey" FOREIGN KEY ("debris_type_id") REFERENCES "debris_type"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "form_debris_type" ADD CONSTRAINT "form_debris_type_reduction_method_id_fkey" FOREIGN KEY ("reduction_method_id") REFERENCES "reduction_method"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "form_definition" ADD CONSTRAINT "form_definition_form_id_document_type_fkey" FOREIGN KEY ("form_id", "document_type") REFERENCES "form"("id", "document_type") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "form_definition" ADD CONSTRAINT "form_definition_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

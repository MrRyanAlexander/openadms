-- CreateTable
CREATE TABLE "ticket_unvoid" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "workflow" "workflow" NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "note" TEXT,
    "unvoided_by_id" UUID NOT NULL,
    "unvoided_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ticket_unvoid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_unvoid_project_id_workflow_ticket_number_idx" ON "ticket_unvoid"("project_id", "workflow", "ticket_number");

-- AddForeignKey
ALTER TABLE "ticket_unvoid" ADD CONSTRAINT "ticket_unvoid_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ticket_unvoid" ADD CONSTRAINT "ticket_unvoid_unvoided_by_id_fkey" FOREIGN KEY ("unvoided_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

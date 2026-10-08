-- CreateTable
CREATE TABLE "reconciliation_job" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "trigger" "reconciliation_trigger" NOT NULL,
    "requested_by_id" UUID,
    "queued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "finished_at" TIMESTAMPTZ(3),
    "reconciliation_run_id" UUID,
    "last_error" TEXT,
    "set_aside_at" TIMESTAMPTZ(3),

    CONSTRAINT "reconciliation_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_job_ticket" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "project_id" UUID NOT NULL,
    "reconciliation_job_id" UUID NOT NULL,
    "workflow" "workflow" NOT NULL,
    "ticket_number" TEXT NOT NULL,

    CONSTRAINT "reconciliation_job_ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_job_project_id_finished_at_set_aside_at_idx" ON "reconciliation_job"("project_id", "finished_at", "set_aside_at");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_job_project_id_id_key" ON "reconciliation_job"("project_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_job_ticket_reconciliation_job_id_workflow_ti_key" ON "reconciliation_job_ticket"("reconciliation_job_id", "workflow", "ticket_number");

-- AddForeignKey
ALTER TABLE "reconciliation_job" ADD CONSTRAINT "reconciliation_job_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_job" ADD CONSTRAINT "reconciliation_job_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_job" ADD CONSTRAINT "reconciliation_job_project_id_reconciliation_run_id_fkey" FOREIGN KEY ("project_id", "reconciliation_run_id") REFERENCES "reconciliation_run"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_job_ticket" ADD CONSTRAINT "reconciliation_job_ticket_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reconciliation_job_ticket" ADD CONSTRAINT "reconciliation_job_ticket_project_id_reconciliation_job_id_fkey" FOREIGN KEY ("project_id", "reconciliation_job_id") REFERENCES "reconciliation_job"("project_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

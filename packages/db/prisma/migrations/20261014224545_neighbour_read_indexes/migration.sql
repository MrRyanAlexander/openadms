-- CreateIndex
CREATE INDEX "field_event_project_id_cert_number_idx" ON "field_event"("project_id", "cert_number");

-- CreateIndex
CREATE INDEX "field_event_project_id_scale_receipt_id_idx" ON "field_event"("project_id", "scale_receipt_id");

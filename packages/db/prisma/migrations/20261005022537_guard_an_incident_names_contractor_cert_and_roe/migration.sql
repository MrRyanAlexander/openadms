-- Guard: an incident's optional contractor, cert number and ROE number, and the incident form's
-- setting of which of them a project's monitors are offered (spec/DATA-MODEL.md §3 "Forms",
-- §4.3; spec/acceptance/04-field-capture.md section H, AC-04-86, AC-04-94…96; ARCHITECTURE §5;
-- ADR-052, 113, 271, 292, 315, 328 (3), 334; BACKLOG C67 (c); REQ-107). Written by hand into
-- Prisma's --create-only stub; never edited once applied.
--
-- The columns, the enum and the three foreign keys are the migration before this one: the
-- contractor is one placed on the incident's own project, the certification and the ROE are its
-- own project's. Here: the tables' guards again, the checks Prisma can't declare, and what a
-- viewer sees. Nothing below refuses an incident for naming something its project doesn't offer
-- (ADR-052): what is offered is what the phone shows, and the back office may name any of the
-- three on any incident.

-- 1. An incident gained captured columns, and evidence is granted column by column: rerun
-- (ADR-271). A form is configuration, granted and audited as a whole table, so its new column
-- is already covered (tried without: nothing changes).
SELECT guard_table('incident', 'EVIDENCE', 'RECORDS');

-- 2. What an incident offers is a setting of the incident form alone, which states it, as "GPS
-- required" is the ROE form's: a list, empty when the project offers none of the three, and
-- never holding a gap.
ALTER TABLE "form" ADD CONSTRAINT "form_incident_offers_check" CHECK ((
  ("document_type" = 'INCIDENT') = ("incident_offers" IS NOT NULL)
  AND ("incident_offers" IS NULL OR array_position("incident_offers", NULL) IS NULL)
) IS TRUE);

-- 3. A cert number and an ROE number are kept as scanned, picked or typed: a blank isn't one.
-- The certification or the ROE a number found is there only with its number; a number that
-- found none is taken (the worker's to flag, never a refusal here).
ALTER TABLE "incident" ADD CONSTRAINT "incident_cert_number_check" CHECK ((
  ("cert_number" IS NULL OR btrim("cert_number") <> '')
  AND ("certification_id" IS NULL OR "cert_number" IS NOT NULL)
) IS TRUE);
ALTER TABLE "incident" ADD CONSTRAINT "incident_roe_number_check" CHECK ((
  ("roe_number" IS NULL OR btrim("roe_number") <> '')
  AND ("roe_id" IS NULL OR "roe_number" IS NOT NULL)
) IS TRUE);

-- 4. What a client user or an auditor sees (ADR-169, 315; C59): every column of their projects'
-- forms and incidents, the new ones included (each view is replaced in place: the columns were
-- added at its end). A contractor user sees no incident (BACKLOG 1.7.1, C18).
SELECT guard_viewer('form', 'PROJECT');
SELECT guard_viewer('incident', 'PROJECT');

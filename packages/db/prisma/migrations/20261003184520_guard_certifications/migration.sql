-- Guard: certifications, their measured boxes and their helpers (spec/DATA-MODEL.md §3
-- "Certifications", §8; spec/acceptance/03-certification.md; adms-certifications §3A.2…§3A.6;
-- ARCHITECTURE §5; ADR-009, 015, 045, 076, 079, 080, 082, 087, 108, 152, 271, 294, 305, 315, 318,
-- 321; REQ-106, 106a, 106b, 106e, 106f). Written by hand into Prisma's --create-only stub; never
-- edited once applied.
--
-- The models are two migrations before this one. Here: each new table's guards, the checks Prisma
-- can't declare, and what a viewer sees. That a certification's prime is one of its own project's
-- primes, that each sub is placed on that project under that prime, that "replaces" names a
-- certification of the same project, and that only a container holds a box, are the foreign keys of
-- the models' migration, not triggers here. The capacity itself is packages/domain's Capacity,
-- worked out by the service that saves the certification: the database works out nothing.

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited with its prior value. A container's capacity
-- is what every load on it bills by, so a certification and its measured boxes are the billing
-- reviewer's to read, as a pay item's rate is; who helped measure is operations (ADR-321).
SELECT guard_table('certification', 'CONFIGURATION', 'BILLING');
SELECT guard_table('certification_box', 'CONFIGURATION', 'BILLING');
SELECT guard_table('certification_helper', 'CONFIGURATION', 'OPERATIONS');

-- 2. The cert number is what is written on the placard and scanned off the badge: never blank. No
-- length or shape is enforced (ADR-045); it is unique on its project by the models' key.
ALTER TABLE "certification" ADD CONSTRAINT "certification_cert_number_check" CHECK (
  btrim("cert_number") <> ''
);

-- 3. A container is measured and a crew never is (invariants 8, 10): a container has a capacity,
-- whole cubic yards, nought or more; a crew has none, not nought. A crew type is picked on a crew
-- only. Every branch answers true or false, never null, which a check would let through.
ALTER TABLE "certification" ADD CONSTRAINT "certification_kind_check" CHECK ((
  CASE "kind"
    WHEN 'CONTAINER' THEN "capacity_cy" IS NOT NULL AND "capacity_cy" >= 0 AND "crew_type_id" IS NULL
    WHEN 'CREW' THEN "capacity_cy" IS NULL
    ELSE false
  END
) IS TRUE);

-- 4. What was certified is picked from the firm's list, or typed where nothing on the list fits:
-- never both (ADR-070).
ALTER TABLE "certification" ADD CONSTRAINT "certification_vehicle_type_check" CHECK ((
  num_nonnulls("vehicle_type_id", "vehicle_type_other") <= 1
  AND ("vehicle_type_other" IS NULL OR btrim("vehicle_type_other") <> '')
) IS TRUE);

-- 5. At most two tiers of sub under the prime (ADR-108): a second-tier sub only under a first-tier
-- one, and never the same contractor twice.
ALTER TABLE "certification" ADD CONSTRAINT "certification_subs_check" CHECK ((
  ("second_tier_sub_id" IS NULL OR "first_tier_sub_id" IS NOT NULL)
  AND ("second_tier_sub_id" IS NULL OR "second_tier_sub_id" <> "first_tier_sub_id")
) IS TRUE);

-- 6. A modified truck's new certification names the one it replaces and says why: both or neither,
-- and never itself (ADR-082). A copy never names itself as its original (ADR-152).
ALTER TABLE "certification" ADD CONSTRAINT "certification_replaces_check" CHECK ((
  ("replaces_id" IS NULL) = ("replaced_reason" IS NULL)
  AND ("replaced_reason" IS NULL OR btrim("replaced_reason") <> '')
  AND ("replaces_id" IS NULL OR "replaces_id" <> "id")
) IS TRUE);
ALTER TABLE "certification" ADD CONSTRAINT "certification_copied_from_check" CHECK (
  "copied_from_id" IS NULL OR "copied_from_id" <> "id"
);

-- 7. Revoked from a day, with a reason, by a person: all three or none (ADR-079).
ALTER TABLE "certification" ADD CONSTRAINT "certification_revoked_check" CHECK ((
  num_nonnulls("revoked_from", "revoked_reason", "revoked_by_id") IN (0, 3)
  AND ("revoked_reason" IS NULL OR btrim("revoked_reason") <> '')
) IS TRUE);

-- 8. The system actor is not a person: it certifies nothing, revokes nothing and helps nobody
-- (ADR-276).
ALTER TABLE "certification" ADD CONSTRAINT "certification_system_actor_check" CHECK (
  "certified_by_id" <> '00000000-0000-7000-8000-000000000001'
  AND "revoked_by_id" IS DISTINCT FROM '00000000-0000-7000-8000-000000000001'
);
ALTER TABLE "certification_helper" ADD CONSTRAINT "certification_helper_system_actor_check" CHECK (
  "user_id" <> '00000000-0000-7000-8000-000000000001'
);

-- 9. A measured box is a container's. The box repeats its certification's kind, which its foreign
-- key holds to the certification's own, so a crew can hold no box and a measured certification
-- can't be made a crew (ADR-308's idiom).
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_kind_check" CHECK (
  "kind" = 'CONTAINER'
);

-- 10. Position 0 is the primary box, the main interior: a rectangle that adds, with no feature, and
-- never taken off. Every box after it is labelled with a feature, picked or typed, never both
-- (adms-certifications §3A.3; ADR-076).
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_position_check" CHECK (
  "position" >= 0
);
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_primary_check" CHECK ((
  "position" <> 0
  OR ("shape" = 'RECTANGLE' AND "sign" = 'ADD' AND "archived_at" IS NULL)
) IS TRUE);
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_feature_check" CHECK ((
  num_nonnulls("feature_id", "feature_other") = CASE WHEN "position" = 0 THEN 0 ELSE 1 END
  AND ("feature_other" IS NULL OR btrim("feature_other") <> '')
) IS TRUE);

-- 11. A radius corner is always subtracted (ADR-087).
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_radius_corner_check" CHECK (
  "shape" <> 'RADIUS_CORNER' OR "sign" = 'SUBTRACT'
);

-- 12. Each shape holds its own measurements, each a whole number of inches of 1 or more, and no
-- other (the columns are integers, so a fraction of an inch is never taken): a rectangle and a
-- triangle their length, width and height; a two-length hoist both lengths, width and height; a
-- round bottom its diameter and length; a radius corner its radius, its run and how many corners.
ALTER TABLE "certification_box" ADD CONSTRAINT "certification_box_measurements_check" CHECK ((
  CASE
    WHEN "shape" IN ('RECTANGLE', 'TRIANGLE')
      THEN "length" >= 1 AND "width" >= 1 AND "height" >= 1
        AND num_nonnulls("second_length", "diameter", "radius", "run", "corners") = 0
    WHEN "shape" = 'TWO_LENGTH_HOIST'
      THEN "length" >= 1 AND "second_length" >= 1 AND "width" >= 1 AND "height" >= 1
        AND num_nonnulls("diameter", "radius", "run", "corners") = 0
    WHEN "shape" = 'ROUND_BOTTOM'
      THEN "diameter" >= 1 AND "length" >= 1
        AND num_nonnulls("second_length", "width", "height", "radius", "run", "corners") = 0
    WHEN "shape" = 'RADIUS_CORNER'
      THEN "radius" >= 1 AND "run" >= 1 AND "corners" >= 1
        AND num_nonnulls("length", "second_length", "width", "height", "diameter") = 0
    ELSE false
  END
) IS TRUE);

-- 13. A container has its primary box. A check on one row can't see another table, so this is
-- asked once the piece of work that wrote the certification ends (a deferred constraint trigger):
-- the certification and its boxes are written together. Asked again if a certification is made a
-- container, or a box is moved off position 0 or to another certification. A box is never deleted
-- (guard 1) and the primary is never archived (guard 10).
CREATE FUNCTION certification_has_primary_box() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  asked uuid;
BEGIN
  IF TG_TABLE_NAME = 'certification' THEN
    asked := NEW."id";
  ELSE
    asked := OLD."certification_id";
  END IF;
  IF EXISTS (
    SELECT 1 FROM "certification"
    WHERE "certification"."id" = asked AND "certification"."kind" = 'CONTAINER'
      AND NOT EXISTS (
        SELECT 1 FROM "certification_box"
        WHERE "certification_box"."certification_id" = asked AND "certification_box"."position" = 0
      )
  ) THEN
    RAISE EXCEPTION 'Open ADMS keeps a container''s primary box with its certification: a container is measured'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "certification_has_primary_box"
  AFTER INSERT OR UPDATE OF "kind" ON "certification"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION certification_has_primary_box();
CREATE CONSTRAINT TRIGGER "certification_box_keeps_primary"
  AFTER UPDATE OF "certification_id", "position" ON "certification_box"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION certification_has_primary_box();

-- 14. What a client user or an auditor sees (ADR-169, 315; C59): their projects' certifications,
-- with their boxes and helpers, without the driver's phone or licence number. A contractor user
-- sees none yet: its own tickets' certifications come with a transaction's prime and operating
-- sub (BACKLOG 1.7.1, C18).
SELECT guard_viewer('certification', 'PROJECT',
  hidden => ARRAY['driver_phone', 'driver_licence_number']);
SELECT guard_viewer('certification_box', 'PART_OF', 'certification', 'certification_id');
SELECT guard_viewer('certification_helper', 'PART_OF', 'certification', 'certification_id');

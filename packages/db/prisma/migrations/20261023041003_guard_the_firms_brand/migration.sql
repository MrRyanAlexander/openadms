-- Guard: what the firm calls its ADMS (the user, 2026-10-22; packages/domain's BrandName). Written
-- by hand into Prisma's --create-only stub; never edited once applied.
--
-- The column is the migration before this one. Now the name is plain text the way the domain reads
-- it: kept trimmed, one to forty characters, and no control character in it. The seed and the API
-- trim it first; the database refuses any other write that doesn't.
ALTER TABLE "firm_settings" ADD CONSTRAINT "firm_settings_brand_name_check" CHECK (
  "brand_name" = btrim("brand_name")
  AND char_length("brand_name") BETWEEN 1 AND 40
  AND "brand_name" !~ '[[:cntrl:]]'
);

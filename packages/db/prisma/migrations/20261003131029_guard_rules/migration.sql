-- Guard: rules, their criteria and picked values, their actions and chosen items
-- (spec/DATA-MODEL.md §3 "Rules"; spec/RULES.md §2, §4, §4a, §5, §7; ARCHITECTURE §5; ADR-109,
-- 118, 125, 128, 135, 141, 229, 239, 271, 301, 313; REQ-125a, 131c). Written by hand into Prisma's
-- --create-only stub; never edited once applied.
--
-- The models are the migration before this one. Here: each new table's guards, and the checks
-- Prisma can't declare. That a rule sits on one of its own project's forms and names one of its
-- own project's contracts, and that a picked value is the rule's own project's (a contractor on
-- the project, a debris type of the rule's form, a field tag, a site, a pay item), are the foreign
-- keys of the models' migration, not triggers here. What makes a rule valid, the overlap warning
-- and the refusal of an exact copy are setup's (packages/domain), not the database's: a rule that
-- isn't valid is saved and never runs (spec/RULES.md §7).

-- 1. The new configuration tables, one line each (ADR-271): the API writes them, the worker reads
-- them, nothing is deleted, every change is audited with its prior value (spec/RULES.md §8). A
-- rule decides what a ticket bills, so its changes are the billing reviewer's to read, as a pay
-- item's are (ADR-286). No read-only viewer sees any of them: none has a viewer view or a grant to
-- adms_readonly, so none needs row-level security (as ADR-281…311 decided for the other setup
-- tables; what a viewer sees of a project's setup comes with BACKLOG 1.1.10).
SELECT guard_table('rule', 'CONFIGURATION', 'BILLING');
SELECT guard_table('rule_criterion', 'CONFIGURATION', 'BILLING');
SELECT guard_table('rule_criterion_pick', 'CONFIGURATION', 'BILLING');
SELECT guard_table('rule_action', 'CONFIGURATION', 'BILLING');
SELECT guard_table('rule_action_item', 'CONFIGURATION', 'BILLING');

-- 2. A rule belongs to a form for one ticket type: load, haul-out or unit rate (ADR-018, 211). It
-- repeats its form's document type, which its foreign key holds to the form's own (ADR-308).
ALTER TABLE "rule" ADD CONSTRAINT "rule_document_type_check" CHECK (
  "document_type" IN ('LOAD', 'HAUL_OUT', 'UNIT_RATE')
);

-- 3. A criterion's place among its rule's lines counts from 1.
ALTER TABLE "rule_criterion" ADD CONSTRAINT "rule_criterion_position_check" CHECK ("position" >= 1);

-- 4. Each criterion takes only the operators of its kind of value (spec/RULES.md §4a; ADR-125):
-- a pick from a list; a number; a date; text; and IS EMPTY, IS NOT EMPTY on any. An item's count
-- is a number, compared for the one item picked (spec/RULES.md §4, "Item"; ADR-128, 313). Every
-- branch answers true or false, never null, which a check would let through (ADR-311 (9)).
ALTER TABLE "rule_criterion" ADD CONSTRAINT "rule_criterion_operator_check" CHECK ((
  "operator" IN ('IS_EMPTY', 'IS_NOT_EMPTY')
  OR CASE
    WHEN "criterion" IN ('CONTRACTOR', 'DEBRIS_TYPE', 'FIELD_TAG', 'ZONE', 'DISPOSAL_SITE',
                         'FROM_SITE', 'DISPOSAL_SITE_TYPE', 'PAY_ITEM')
      THEN "operator" IN ('EQUALS', 'NOT_EQUALS', 'IS_ONE_OF', 'IS_NOT_ONE_OF')
    WHEN "criterion" IN ('WEIGHT', 'VOLUME', 'MILEAGE', 'UNIT_COUNT', 'MEASUREMENT', 'ITEM')
      THEN "operator" IN ('EQUALS', 'NOT_EQUALS', 'BETWEEN', 'AT_LEAST', 'AT_MOST', 'MORE_THAN',
                          'LESS_THAN')
    WHEN "criterion" = 'TICKET_DATE'
      THEN "operator" IN ('ON', 'NOT_ON', 'BETWEEN', 'ON_OR_BEFORE', 'ON_OR_AFTER')
    WHEN "criterion" = 'COLLECTION_ADDRESS'
      THEN "operator" IN ('EQUALS', 'NOT_EQUALS', 'CONTAINS', 'STARTS_WITH')
    ELSE false
  END
) IS TRUE);

-- 5. A typed value sits in the columns of its kind, and in no other (ADR-135): a number, a date
-- or text; the "to" only on BETWEEN, which runs from its lower end to its higher and holds both
-- (ADR-125). IS EMPTY and IS NOT EMPTY take no value; a picked value is a row of
-- rule_criterion_pick, never a column here.
ALTER TABLE "rule_criterion" ADD CONSTRAINT "rule_criterion_value_check" CHECK ((
  CASE
    WHEN "operator" IN ('IS_EMPTY', 'IS_NOT_EMPTY')
      THEN num_nonnulls("number_from", "number_to", "date_from", "date_to", "text") = 0
    WHEN "criterion" IN ('WEIGHT', 'VOLUME', 'MILEAGE', 'UNIT_COUNT', 'MEASUREMENT', 'ITEM')
      THEN "number_from" IS NOT NULL
        AND ("operator" = 'BETWEEN') = ("number_to" IS NOT NULL)
        AND ("number_to" IS NULL OR "number_from" <= "number_to")
        AND num_nonnulls("date_from", "date_to", "text") = 0
    WHEN "criterion" = 'TICKET_DATE'
      THEN "date_from" IS NOT NULL
        AND ("operator" = 'BETWEEN') = ("date_to" IS NOT NULL)
        AND ("date_to" IS NULL OR "date_from" <= "date_to")
        AND num_nonnulls("number_from", "number_to", "text") = 0
    WHEN "criterion" = 'COLLECTION_ADDRESS'
      THEN "text" IS NOT NULL AND "text" <> ''
        AND num_nonnulls("number_from", "number_to", "date_from", "date_to") = 0
    ELSE num_nonnulls("number_from", "number_to", "date_from", "date_to", "text") = 0
  END
) IS TRUE);

-- 6. A picked value fills exactly the one column its criterion picks from (spec/RULES.md §4): a
-- Disposal site and a From site both pick a site. The pick repeats its line's criterion, which its
-- foreign key holds to the line's own, so a line's criterion can't change under its picks. A
-- criterion whose value is typed has no pick. A zone's name is never blank.
ALTER TABLE "rule_criterion_pick" ADD CONSTRAINT "rule_criterion_pick_value_check" CHECK ((
  ("contractor_id" IS NOT NULL) = ("criterion" = 'CONTRACTOR')
  AND ("form_debris_type_id" IS NOT NULL) = ("criterion" = 'DEBRIS_TYPE')
  AND ("field_tag_id" IS NOT NULL) = ("criterion" = 'FIELD_TAG')
  AND ("disposal_site_id" IS NOT NULL) = ("criterion" IN ('DISPOSAL_SITE', 'FROM_SITE'))
  AND ("site_type_id" IS NOT NULL) = ("criterion" = 'DISPOSAL_SITE_TYPE')
  AND ("pay_item_id" IS NOT NULL) = ("criterion" = 'PAY_ITEM')
  AND ("item_name_id" IS NOT NULL) = ("criterion" = 'ITEM')
  AND ("zone_name" IS NOT NULL) = ("criterion" = 'ZONE')
  AND ("zone_name" IS NULL OR "zone_name" <> '')
  AND num_nonnulls("contractor_id", "form_debris_type_id", "field_tag_id", "disposal_site_id",
                   "site_type_id", "pay_item_id", "item_name_id", "zone_name") = 1
) IS TRUE);

-- 7. An action holds only what its kind takes (spec/RULES.md §5; ADR-118, 128): Add transaction a
-- # and a pay item, and says which items its quantity is from; Remove transaction a #; Void ticket
-- nothing. A # is a slot on the ticket, from 1. A missing # or pay item is saved: the rule is then
-- not valid and never runs (spec/RULES.md §7).
ALTER TABLE "rule_action" ADD CONSTRAINT "rule_action_slot_check" CHECK ((
  ("slot" IS NULL OR "slot" >= 1)
  AND ("kind" <> 'VOID_TICKET' OR "slot" IS NULL)
) IS TRUE);
ALTER TABLE "rule_action" ADD CONSTRAINT "rule_action_pay_item_check" CHECK ((
  "kind" = 'ADD_TRANSACTION' OR "pay_item_id" IS NULL
) IS TRUE);
ALTER TABLE "rule_action" ADD CONSTRAINT "rule_action_quantity_from_check" CHECK ((
  ("kind" = 'ADD_TRANSACTION') = ("quantity_from" IS NOT NULL)
) IS TRUE);

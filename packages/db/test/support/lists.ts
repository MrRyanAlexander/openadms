// The firm's eighteen lists, by table (spec/DATA-MODEL.md §2.3; ADR-302), for the tests that hold
// every one of them to the same grants, guards and behaviour.
export const listTables = [
  'program_type',
  'declaration_reference_type',
  'debris_type',
  'reduction_method',
  'payable_type',
  'kind_of_work',
  'item_name',
  'vehicle_type',
  'vehicle_feature',
  'crew_type',
  'site_type',
  'site_label',
  'incident_type',
  'incident_sub_type',
  'reason',
  'survey_work_type',
  'clock_activity',
  'field_tag',
] as const;

export type ListTable = (typeof listTables)[number];

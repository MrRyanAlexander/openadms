// Every column that names a user, but the audit record's actor (ADR-438, 439, 440): none may
// name the master passcode's actor or the device key's, which are no person. The guard
// migrations wrote one check of each kind for each from the catalog; a later table that names a
// user adds its own two, and joins this list.
export const columnsNamingAUser: readonly (readonly [table: string, column: string])[] = [
  ['assignment', 'made_by_id'],
  ['assignment', 'person_id'],
  ['certification', 'certified_by_id'],
  ['certification', 'revoked_by_id'],
  ['certification_helper', 'user_id'],
  ['drop_off_log', 'created_by_id'],
  ['drop_off_log', 'monitor_id'],
  ['field_event', 'created_by_id'],
  ['field_event', 'monitor_id'],
  ['flag_acceptance', 'accepted_by_id'],
  ['form_definition', 'created_by_id'],
  ['incident', 'created_by_id'],
  ['incident', 'monitor_id'],
  ['invoice_batch', 'created_by_id'],
  ['invoice_lock', 'locked_by_id'],
  ['invoice_lock', 'unlocked_by_id'],
  ['map_version', 'loaded_by_id'],
  ['qc_mark', 'set_by_id'],
  ['quarantined_record', 'monitor_id'],
  ['quarantined_record', 'resolved_by_id'],
  ['reconciliation_job', 'requested_by_id'],
  ['reconciliation_run', 'requested_by_id'],
  ['roe', 'made_by_id'],
  ['scale_receipt', 'entered_by_id'],
  ['security_event', 'user_id'],
  ['session', 'user_id'],
  ['site_area_version', 'created_by_id'],
  ['survey', 'created_by_id'],
  ['survey', 'monitor_id'],
  ['ticket_unvoid', 'unvoided_by_id'],
  ['ticket_void', 'lifted_by_id'],
  ['ticket_void', 'voided_by_id'],
  ['user_credential', 'user_id'],
  ['user_permission', 'user_id'],
  ['user_viewer_project', 'user_id'],
];

export const notMasterPasscodeChecks = columnsNamingAUser.map(([table, column]) => ({
  name: `${table}_${column}_not_master_passcode_check`,
  definition: `CHECK ((${column} IS DISTINCT FROM '00000000-0000-7000-8000-000000000002'::uuid))`,
}));

export const notDeviceKeyChecks = columnsNamingAUser.map(([table, column]) => ({
  name: `${table}_${column}_not_device_key_check`,
  definition: `CHECK ((${column} IS DISTINCT FROM '00000000-0000-7000-8000-000000000003'::uuid))`,
}));

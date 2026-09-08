-- =============================================================================
-- Open ADMS :: Seed 002 :: The ticket type catalog
-- Each type declares its own lifecycle and its own form. The field app and the
-- back office render entirely from these two JSON documents, which is what
-- makes a new ticket type an INSERT rather than a release.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LOAD TICKET :: two monitors, two locations, one barcode between them
-- ---------------------------------------------------------------------------
INSERT INTO ticket_types (
    code, label, kind, description, is_system, requires_equipment,
    requires_barcode, requires_photo, supports_waypoints, billable,
    icon, color, sort_order, stage_schema, field_schema
) VALUES (
'LOAD', 'Load Ticket', 'load',
'Debris collected at a right-of-way or right-of-entry location and hauled to a debris management site. Opened by the loading monitor, closed by the disposal monitor.',
false, true, true, true, true, true, 'truck', '#2563eb', 10,
$stage$[
  {"code":"collection","label":"Collection","sequence":1,"actor_role":"monitor",
   "required":true,"completes_ticket":false,
   "instructions":"Scan the truck placard, confirm the certified capacity, then watch the load.",
   "captures":["equipment","barcode","gps","origin_address","debris_type","monitor"]},
  {"code":"transit","label":"In Transit","sequence":2,"actor_role":"monitor",
   "required":false,"completes_ticket":false,
   "instructions":"Add a waypoint whenever the truck changes route or stops.",
   "captures":["waypoints"]},
  {"code":"disposal","label":"Disposal","sequence":3,"actor_role":"monitor",
   "required":true,"completes_ticket":true,
   "instructions":"Scan the same barcode at the site, call the load, photograph the bed.",
   "captures":["site","debris_type","load_call","photo","scale","monitor","gps"]}
]$stage$::jsonb,
$field$[
  {"key":"equipment_id","label":"Truck","type":"select","source":"project_equipment","required":true,"stage":"collection"},
  {"key":"barcode","label":"Placard / Barcode","type":"barcode","required":true,"stage":"collection"},
  {"key":"driver_name","label":"Driver","type":"text","required":false,"stage":"collection"},
  {"key":"certified_capacity_cy","label":"Certified Capacity","type":"number","unit":"CY","required":true,"stage":"collection","help":"Prefilled from the truck record. Change only with a re-certification on file."},
  {"key":"origin_house_number","label":"House #","type":"text","required":false,"stage":"collection"},
  {"key":"origin_street","label":"Street / Load Origin","type":"text","required":true,"stage":"collection"},
  {"key":"zone_id","label":"Zone","type":"select","source":"project_zones","required":false,"stage":"collection"},
  {"key":"origin_gps","label":"Load Origin GPS","type":"gps","required":true,"stage":"collection"},
  {"key":"debris_type","label":"Debris Type","type":"select","source":"debris_types","required":true,"stage":"collection"},
  {"key":"origin_at","label":"Loading Time","type":"datetime","required":true,"stage":"collection"},
  {"key":"destination_site_id","label":"Disposal Site","type":"select","source":"project_sites","filter":{"site_kind":["DMS","TDSRS"]},"required":true,"stage":"disposal"},
  {"key":"load_call_pct","label":"Load Call","type":"percent","required":true,"stage":"disposal","min":0,"max":100,"help":"Percentage of certified capacity actually filled."},
  {"key":"disposal_photo","label":"Load Photo","type":"photo","required":true,"stage":"disposal"},
  {"key":"scale_ticket_number","label":"Scale Ticket #","type":"text","required":false,"stage":"disposal"},
  {"key":"net_weight_lbs","label":"Net Weight","type":"number","unit":"lbs","required":false,"stage":"disposal"},
  {"key":"destination_at","label":"Disposal Time","type":"datetime","required":true,"stage":"disposal"},
  {"key":"special_class","label":"Special Class","type":"text","required":false,"stage":"disposal"},
  {"key":"notes","label":"Ticket Notes","type":"textarea","required":false,"stage":"disposal"}
]$field$::jsonb
) ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description,
    stage_schema = EXCLUDED.stage_schema, field_schema = EXCLUDED.field_schema,
    icon = EXCLUDED.icon, color = EXCLUDED.color;

-- ---------------------------------------------------------------------------
-- HAUL OUT TICKET :: DMS to final disposal site
-- ---------------------------------------------------------------------------
INSERT INTO ticket_types (
    code, label, kind, description, is_system, requires_equipment,
    requires_barcode, requires_photo, supports_waypoints, billable,
    icon, color, sort_order, stage_schema, field_schema
) VALUES (
'HAULOUT', 'Haul Out Ticket', 'haul_out',
'Reduced or staged debris leaving a debris management site for a final disposal site. Opened at the DMS, closed at the FDS.',
false, true, true, true, true, true, 'route', '#7c3aed', 20,
$stage$[
  {"code":"haul_out_start","label":"Haul Out","sequence":1,"actor_role":"monitor",
   "required":true,"completes_ticket":false,
   "instructions":"Scan the placard at the DMS, call the load, photograph the bed, record the collection site.",
   "captures":["equipment","barcode","origin_site","debris_type","load_call","photo","monitor","gps"]},
  {"code":"haul_out_complete","label":"Final Disposal","sequence":2,"actor_role":"monitor",
   "required":true,"completes_ticket":true,
   "instructions":"Scan the same barcode at the final disposal site and photograph the load.",
   "captures":["site","photo","scale","monitor","gps"]}
]$stage$::jsonb,
$field$[
  {"key":"equipment_id","label":"Truck","type":"select","source":"project_equipment","required":true,"stage":"haul_out_start"},
  {"key":"barcode","label":"Placard / Barcode","type":"barcode","required":true,"stage":"haul_out_start"},
  {"key":"driver_name","label":"Driver","type":"text","required":false,"stage":"haul_out_start"},
  {"key":"certified_capacity_cy","label":"Certified Capacity","type":"number","unit":"CY","required":true,"stage":"haul_out_start"},
  {"key":"origin_site_id","label":"DMS Collection Site","type":"select","source":"project_sites","filter":{"site_kind":["DMS","TDSRS"]},"required":true,"stage":"haul_out_start"},
  {"key":"debris_type","label":"Debris Type","type":"select","source":"debris_types","required":true,"stage":"haul_out_start"},
  {"key":"load_call_pct","label":"Load Call","type":"percent","required":true,"stage":"haul_out_start","min":0,"max":100},
  {"key":"origin_photo","label":"Load Photo at DMS","type":"photo","required":true,"stage":"haul_out_start"},
  {"key":"origin_at","label":"Haul Out Time","type":"datetime","required":true,"stage":"haul_out_start"},
  {"key":"destination_site_id","label":"Final Disposal Site","type":"select","source":"project_sites","filter":{"site_kind":["FDS","RECYCLING","TRANSFER"]},"required":true,"stage":"haul_out_complete"},
  {"key":"destination_photo","label":"Photo at FDS","type":"photo","required":true,"stage":"haul_out_complete"},
  {"key":"scale_ticket_number","label":"Scale Ticket #","type":"text","required":false,"stage":"haul_out_complete"},
  {"key":"net_weight_lbs","label":"Net Weight","type":"number","unit":"lbs","required":false,"stage":"haul_out_complete"},
  {"key":"haul_distance_miles","label":"Haul Distance","type":"number","unit":"miles","required":false,"stage":"haul_out_complete"},
  {"key":"destination_at","label":"Arrival Time","type":"datetime","required":true,"stage":"haul_out_complete"},
  {"key":"notes","label":"Ticket Notes","type":"textarea","required":false,"stage":"haul_out_complete"}
]$field$::jsonb
) ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description,
    stage_schema = EXCLUDED.stage_schema, field_schema = EXCLUDED.field_schema,
    icon = EXCLUDED.icon, color = EXCLUDED.color;

-- ---------------------------------------------------------------------------
-- UNIT RATE / LHS TICKET :: one monitor, one stage, printed on the spot
-- ---------------------------------------------------------------------------
INSERT INTO ticket_types (
    code, label, kind, description, is_system, requires_equipment,
    requires_barcode, requires_photo, supports_waypoints, billable,
    icon, color, sort_order, stage_schema, field_schema
) VALUES (
'UNIT', 'Unit Rate Ticket', 'unit_rate',
'Leaner, hanger, stump and other per-unit work performed by a crew. Single stage, printed for the crew at completion.',
false, false, false, true, false, true, 'ruler', '#0891b2', 30,
$stage$[
  {"code":"work","label":"Unit Work","sequence":1,"actor_role":"monitor",
   "required":true,"completes_ticket":true,
   "instructions":"Select the crew, document the work, capture the location, then print the crew copy.",
   "captures":["crew","photo","gps","quantity","monitor"]}
]$stage$::jsonb,
$field$[
  {"key":"unit_work_type","label":"Unit Work Type","type":"select","options":["Leaner","Hanger","Stump Removal","Stump Grinding","Hazardous Tree","Fence Removal","Hazardous Limb"],"required":true,"stage":"work"},
  {"key":"crew_id","label":"Crew","type":"select","source":"project_equipment","filter":{"equipment_type":["crew"]},"required":true,"stage":"work"},
  {"key":"debris_type","label":"Debris Type","type":"select","source":"debris_types","required":true,"stage":"work"},
  {"key":"quantity","label":"Quantity","type":"number","required":true,"stage":"work","min":0},
  {"key":"stump_diameter_inches","label":"Stump Diameter","type":"number","unit":"inches","required":false,"stage":"work"},
  {"key":"labor_hours","label":"Labor Hours","type":"number","unit":"hours","required":false,"stage":"work"},
  {"key":"equipment_hours","label":"Equipment Hours","type":"number","unit":"hours","required":false,"stage":"work"},
  {"key":"origin_street","label":"Location","type":"text","required":true,"stage":"work"},
  {"key":"origin_gps","label":"GPS","type":"gps","required":true,"stage":"work"},
  {"key":"zone_id","label":"Zone","type":"select","source":"project_zones","required":false,"stage":"work"},
  {"key":"before_photo","label":"Before Photo","type":"photo","required":true,"stage":"work"},
  {"key":"after_photo","label":"After Photo","type":"photo","required":true,"stage":"work"},
  {"key":"notes","label":"Notes","type":"textarea","required":false,"stage":"work"}
]$field$::jsonb
) ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description,
    stage_schema = EXCLUDED.stage_schema, field_schema = EXCLUDED.field_schema,
    icon = EXCLUDED.icon, color = EXCLUDED.color;

-- ---------------------------------------------------------------------------
-- INCIDENT REPORT :: not billable, still fully audited
-- ---------------------------------------------------------------------------
INSERT INTO ticket_types (
    code, label, kind, description, is_system, requires_equipment,
    requires_barcode, requires_photo, supports_waypoints, billable,
    icon, color, sort_order, stage_schema, field_schema
) VALUES (
'INCIDENT', 'Incident Report', 'incident',
'Safety, property, environmental, or compliance event observed in the field. Non-billable, tracked to closure.',
false, false, false, false, false, false, 'alert-triangle', '#dc2626', 40,
$stage$[
  {"code":"report","label":"Report","sequence":1,"actor_role":"monitor",
   "required":true,"completes_ticket":true,
   "instructions":"Capture what happened, where, how severe, and whether it is ongoing.",
   "captures":["gps","photo","monitor"]}
]$stage$::jsonb,
$field$[
  {"key":"incident_category_id","label":"Category","type":"select","source":"incident_categories","required":true,"stage":"report"},
  {"key":"incident_subcategory_id","label":"Sub-category","type":"select","source":"incident_subcategories","required":false,"stage":"report"},
  {"key":"severity","label":"Severity","type":"select","options":["info","low","medium","high","critical"],"required":true,"stage":"report"},
  {"key":"is_ongoing","label":"Ongoing Issue","type":"boolean","required":true,"stage":"report"},
  {"key":"origin_street","label":"Location","type":"text","required":true,"stage":"report"},
  {"key":"origin_gps","label":"GPS","type":"gps","required":true,"stage":"report"},
  {"key":"contractor_id","label":"Contractor Involved","type":"select","source":"project_contractors","required":false,"stage":"report"},
  {"key":"equipment_id","label":"Equipment Involved","type":"select","source":"project_equipment","required":false,"stage":"report"},
  {"key":"incident_photo","label":"Photos","type":"photo","multiple":true,"required":false,"stage":"report"},
  {"key":"notes","label":"Description","type":"textarea","required":true,"stage":"report"}
]$field$::jsonb
) ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description,
    stage_schema = EXCLUDED.stage_schema, field_schema = EXCLUDED.field_schema,
    icon = EXCLUDED.icon, color = EXCLUDED.color;

-- ---------------------------------------------------------------------------
-- Additional non-system types, shipped to prove the catalog extends without
-- code. Enable any of these on a project the same way as the four above.
-- ---------------------------------------------------------------------------
INSERT INTO ticket_types (
    code, label, kind, description, is_system, requires_equipment,
    requires_barcode, requires_photo, supports_waypoints, billable,
    icon, color, sort_order, stage_schema, field_schema
) VALUES
('ROE', 'Right of Entry', 'custom',
 'Signed property owner authorization allowing crews onto private property.',
 false, false, false, true, false, false, 'file-signature', '#059669', 50,
 $stage$[{"code":"intake","label":"Intake","sequence":1,"actor_role":"monitor","required":true,"completes_ticket":true,"captures":["gps","photo","signature","monitor"]}]$stage$::jsonb,
 $field$[
  {"key":"owner_name","label":"Property Owner","type":"text","required":true,"stage":"intake"},
  {"key":"owner_phone","label":"Phone","type":"text","required":false,"stage":"intake"},
  {"key":"parcel_id","label":"Parcel ID","type":"text","required":false,"stage":"intake"},
  {"key":"origin_street","label":"Property Address","type":"text","required":true,"stage":"intake"},
  {"key":"origin_gps","label":"GPS","type":"gps","required":true,"stage":"intake"},
  {"key":"signature","label":"Owner Signature","type":"signature","required":true,"stage":"intake"},
  {"key":"roe_photo","label":"Signed Form","type":"photo","required":true,"stage":"intake"},
  {"key":"notes","label":"Notes","type":"textarea","required":false,"stage":"intake"}
 ]$field$::jsonb),
('TM', 'Time and Material', 'unit_rate',
 'Force-account or time-and-material work billed by labor and equipment hours.',
 false, true, false, false, false, true, 'clock', '#ea580c', 60,
 $stage$[{"code":"work","label":"Work Period","sequence":1,"actor_role":"monitor","required":true,"completes_ticket":true,"captures":["crew","gps","monitor"]}]$stage$::jsonb,
 $field$[
  {"key":"crew_id","label":"Crew","type":"select","source":"project_equipment","required":true,"stage":"work"},
  {"key":"labor_hours","label":"Labor Hours","type":"number","unit":"hours","required":true,"stage":"work","min":0},
  {"key":"equipment_hours","label":"Equipment Hours","type":"number","unit":"hours","required":false,"stage":"work","min":0},
  {"key":"crew_size","label":"Crew Size","type":"number","required":false,"stage":"work"},
  {"key":"origin_street","label":"Work Location","type":"text","required":true,"stage":"work"},
  {"key":"origin_gps","label":"GPS","type":"gps","required":true,"stage":"work"},
  {"key":"notes","label":"Work Description","type":"textarea","required":true,"stage":"work"}
 ]$field$::jsonb),
('SURVEY', 'Damage Survey', 'custom',
 'Pre-work assessment of a segment, zone, or property.',
 false, false, false, true, true, false, 'clipboard-list', '#0d9488', 70,
 $stage$[{"code":"survey","label":"Survey","sequence":1,"actor_role":"monitor","required":true,"completes_ticket":true,"captures":["gps","photo","waypoints","monitor"]}]$stage$::jsonb,
 $field$[
  {"key":"segment_name","label":"Segment","type":"text","required":true,"stage":"survey"},
  {"key":"estimated_cy","label":"Estimated Volume","type":"number","unit":"CY","required":false,"stage":"survey"},
  {"key":"debris_type","label":"Predominant Debris","type":"select","source":"debris_types","required":false,"stage":"survey"},
  {"key":"passable","label":"Road Passable","type":"boolean","required":true,"stage":"survey"},
  {"key":"origin_gps","label":"Start GPS","type":"gps","required":true,"stage":"survey"},
  {"key":"survey_photo","label":"Photos","type":"photo","multiple":true,"required":false,"stage":"survey"},
  {"key":"notes","label":"Observations","type":"textarea","required":false,"stage":"survey"}
 ]$field$::jsonb)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description,
    stage_schema = EXCLUDED.stage_schema, field_schema = EXCLUDED.field_schema,
    icon = EXCLUDED.icon, color = EXCLUDED.color;

-- ---------------------------------------------------------------------------
-- HIDDEN SYSTEM TYPES :: the two pending objects. Never billable, never
-- addable to a project. The trigger on project_ticket_types enforces this.
-- ---------------------------------------------------------------------------
INSERT INTO ticket_types (
    code, label, kind, description, is_system, billable,
    icon, color, sort_order, stage_schema, field_schema
) VALUES
('PENDING_COLLECTION', 'Pending Collection Ticket', 'pending',
 'Transient handoff object created when a loading monitor issues a barcode to a driver. Claimed at the disposal site, then discarded.',
 true, false, 'hourglass', '#f59e0b', 900,
 $stage$[]$stage$::jsonb,
 $field$[
  {"key":"ticket_number","label":"Ticket Number","type":"text"},
  {"key":"truck_number","label":"Truck Number","type":"text"},
  {"key":"project","label":"Project","type":"text"},
  {"key":"time","label":"Time","type":"datetime"},
  {"key":"address","label":"Address","type":"text"},
  {"key":"gps","label":"GPS","type":"gps"},
  {"key":"monitor","label":"Monitor Name and ID","type":"text"},
  {"key":"debris_type","label":"Debris Type","type":"text"},
  {"key":"notes","label":"Ticket Notes","type":"textarea"}
 ]$field$::jsonb),
('PENDING_DISPOSAL', 'Pending Disposal Ticket', 'pending',
 'Transient handoff object carrying the disposal-side values before the ticket is closed.',
 true, false, 'hourglass', '#f59e0b', 910,
 $stage$[]$stage$::jsonb,
 $field$[
  {"key":"ticket_number","label":"Ticket Number","type":"text"},
  {"key":"truck_number","label":"Truck Number","type":"text"},
  {"key":"project","label":"Project","type":"text"},
  {"key":"time","label":"Time","type":"datetime"},
  {"key":"address","label":"Address","type":"text"},
  {"key":"gps","label":"GPS","type":"gps"},
  {"key":"monitor","label":"Monitor Name and ID","type":"text"},
  {"key":"debris_type","label":"Debris Type","type":"text"},
  {"key":"load_call_pct","label":"Load Call Percentage","type":"percent"},
  {"key":"scale_weight","label":"Scale Weight","type":"number"},
  {"key":"scale_ticket_number","label":"Scale Ticket Number","type":"text"},
  {"key":"notes","label":"Ticket Notes","type":"textarea"}
 ]$field$::jsonb)
ON CONFLICT (code) DO UPDATE SET
    label = EXCLUDED.label, description = EXCLUDED.description,
    stage_schema = EXCLUDED.stage_schema, field_schema = EXCLUDED.field_schema;

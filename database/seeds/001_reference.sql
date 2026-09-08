-- =============================================================================
-- Open ADMS :: Seed 001 :: Reference data
-- Idempotent. Safe to re-run after every migration.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roles (cumulative by rank)
-- ---------------------------------------------------------------------------
INSERT INTO roles (code, label, rank, description) VALUES
    ('monitor', 'Monitor',  10, 'Field user. Creates and reviews their own tickets.'),
    ('manager', 'Manager',  20, 'Adds clients, contracts, workers, and project ticket types.'),
    ('analyst', 'Analyst',  30, 'Maintains rules, service codes, rates, and disposal sites.'),
    ('admin',   'Admin',    40, 'Full control of the instance.')
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, rank = EXCLUDED.rank,
        description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- Permissions. min_rank encodes inheritance; no grant table to maintain.
-- ---------------------------------------------------------------------------
INSERT INTO permissions (code, label, domain, min_rank, description) VALUES
    ('ticket.create',        'Create tickets',            'tickets', 10, NULL),
    ('ticket.read.own',      'Read own tickets',          'tickets', 10, NULL),
    ('ticket.advance',       'Advance ticket stages',     'tickets', 10, NULL),
    ('incident.create',      'File incident reports',     'tickets', 10, NULL),
    ('ticket.read.project',  'Read all project tickets',  'tickets', 20, NULL),
    ('ticket.update',        'Edit tickets',              'tickets', 20, NULL),
    ('ticket.void',          'Void tickets',              'tickets', 30, NULL),
    ('client.manage',        'Manage clients',            'org',     20, NULL),
    ('contractor.manage',    'Manage contractors',        'org',     20, NULL),
    ('contract.manage',      'Manage contracts',          'org',     20, NULL),
    ('equipment.manage',     'Manage trucks and equipment','org',    20, NULL),
    ('worker.manage',        'Manage workers',            'org',     20, NULL),
    ('project.create',       'Create projects',           'project', 20, NULL),
    ('project.assign',       'Assign workers to projects','project', 20, NULL),
    ('project.ticket_types', 'Enable ticket types',       'project', 20, NULL),
    ('project.update',       'Edit project settings',     'project', 30, NULL),
    ('site.manage',          'Manage disposal sites',     'billing', 30, NULL),
    ('service_code.manage',  'Manage service codes',      'billing', 30, NULL),
    ('rate.manage',          'Manage rates',              'billing', 30, NULL),
    ('rule.manage',          'Manage rules',              'billing', 30, NULL),
    ('transaction.read',     'Read transactions',         'billing', 30, NULL),
    ('transaction.process',  'Run the rules engine',      'billing', 30, NULL),
    ('transaction.reverse',  'Reverse transactions',      'billing', 40, NULL),
    ('invoice.manage',       'Create and edit invoices',  'billing', 30, NULL),
    ('invoice.approve',      'Approve invoices',          'billing', 40, NULL),
    ('audit.read',           'Read audit history',        'audit',   20, NULL),
    ('report.run',           'Run reports and exports',   'audit',   20, NULL),
    ('query.build',          'Use the query builder',     'audit',   30, NULL),
    ('ticket_type.manage',   'Define ticket types',       'admin',   40, NULL),
    ('user.manage',          'Manage users and roles',    'admin',   40, NULL),
    ('instance.manage',      'Manage instance settings',  'admin',   40, NULL),
    ('peer.manage',          'Manage peer instances',     'admin',   40, NULL),
    ('sharing.manage',       'Change visibility flags',   'admin',   30, NULL)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, domain = EXCLUDED.domain,
        min_rank = EXCLUDED.min_rank;

-- ---------------------------------------------------------------------------
-- Ticket statuses
-- ---------------------------------------------------------------------------
INSERT INTO ticket_statuses (code, label, is_terminal, is_billable, color, sort_order) VALUES
    ('draft',             'Draft',             false, false, '#94a3b8', 10),
    ('open',              'Open',              false, false, '#3b82f6', 20),
    ('in_transit',        'In Transit',        false, false, '#6366f1', 30),
    ('pending_disposal',  'Pending Disposal',  false, false, '#f59e0b', 40),
    ('pending_haul_out',  'Pending Haul Out',  false, false, '#f59e0b', 45),
    ('completed',         'Completed',         true,  true,  '#10b981', 50),
    ('rejected',          'Rejected',          true,  false, '#ef4444', 60),
    ('voided',            'Voided',            true,  false, '#6b7280', 70)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, color = EXCLUDED.color,
        is_terminal = EXCLUDED.is_terminal, is_billable = EXCLUDED.is_billable;

-- ---------------------------------------------------------------------------
-- Debris types
-- ---------------------------------------------------------------------------
INSERT INTO debris_types (code, label, category, fema_category, default_density_lbs_cy, sort_order) VALUES
    ('VEG',      'Vegetative / Woody',            'vegetative',              'A', 500, 10),
    ('CD',       'Construction & Demolition',     'construction_demolition', 'A', 750, 20),
    ('MIXED',    'Mixed Debris',                  'other',                   'A', 600, 30),
    ('HHW',      'Household Hazardous Waste',     'hazardous',               'B', 400, 40),
    ('WHITE',    'White Goods / Appliances',      'white_goods',             'A', 200, 50),
    ('EWASTE',   'Electronic Waste',              'electronic',              'A', 300, 60),
    ('SOIL',     'Soil, Mud and Sand',            'soil_mud_sand',           'A', 2200, 70),
    ('VEHICLE',  'Vehicles and Vessels',          'vehicle_vessel',          'B', NULL, 80),
    ('PUTRES',   'Putrescent Debris',             'putrescent',              'A', 800, 90),
    ('STUMP',    'Stumps',                        'vegetative',              'A', 550, 100),
    ('HANGER',   'Hangers',                       'vegetative',              'A', NULL, 110),
    ('LEANER',   'Leaners',                       'vegetative',              'A', NULL, 120),
    ('SAND',     'Beach Sand Screening',          'soil_mud_sand',           'A', 2600, 130)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, category = EXCLUDED.category,
        fema_category = EXCLUDED.fema_category,
        default_density_lbs_cy = EXCLUDED.default_density_lbs_cy;

-- ---------------------------------------------------------------------------
-- Unit types. quantity_source is the ticket_metrics column the engine reads.
-- ---------------------------------------------------------------------------
INSERT INTO unit_types (code, label, abbreviation, quantity_source, precision_digits, description, sort_order) VALUES
    ('per_cubic_yard',  'Per Cubic Yard',       'CY',    'billable_cubic_yards', 2,
     'Certified capacity multiplied by the monitor load call.', 10),
    ('per_ton',         'Per Ton',              'TON',   'net_tons', 3,
     'Net scale weight divided by 2000.', 20),
    ('per_mile',        'Per Mile',             'MI',    'haul_miles', 2,
     'Odometer value, else the recorded waypoint path, else straight line.', 30),
    ('per_labor_hour',  'Per Labor Hour',       'LHR',   'labor_hours', 2, NULL, 40),
    ('per_equip_hour',  'Per Equipment Hour',   'EHR',   'equipment_hours', 2, NULL, 50),
    ('per_unit',        'Per Unit',             'UNIT',  'unit_count', 2, NULL, 60),
    ('per_each',        'Per Each',             'EA',    'each', 0,
     'Always one. Used for flat per-ticket work such as an ROE or a stump.', 70),
    ('per_diameter_in', 'Per Diameter Inch',    'DIA',   'stump_diameter_inches', 1,
     'Stump diameter recorded on the ticket.', 80),
    ('per_linear_foot', 'Per Linear Foot',      'LF',    'linear_feet', 2, NULL, 90),
    ('flat_fee',        'Flat Fee',             'FLAT',  'flat', 0, NULL, 100)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, abbreviation = EXCLUDED.abbreviation,
        quantity_source = EXCLUDED.quantity_source,
        description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- Rule operators
-- ---------------------------------------------------------------------------
INSERT INTO rule_operators (code, label, symbol, arity, data_types, sort_order) VALUES
    ('eq',          'equals',            '=',   'binary', ARRAY['uuid','text','number','boolean','date','timestamp'], 10),
    ('ne',          'does not equal',    '!=',  'binary', ARRAY['uuid','text','number','boolean','date','timestamp'], 20),
    ('gt',          'greater than',      '>',   'binary', ARRAY['number','date','timestamp'], 30),
    ('gte',         'at least',          '>=',  'binary', ARRAY['number','date','timestamp'], 40),
    ('lt',          'less than',         '<',   'binary', ARRAY['number','date','timestamp'], 50),
    ('lte',         'at most',           '<=',  'binary', ARRAY['number','date','timestamp'], 60),
    ('in',          'is one of',         'in',  'set',    ARRAY['uuid','text','number'], 70),
    ('not_in',      'is not one of',     'not in','set',  ARRAY['uuid','text','number'], 80),
    ('between',     'between',           '..',  'range',  ARRAY['number'], 90),
    ('contains',    'contains',          '~',   'binary', ARRAY['text'], 100),
    ('starts_with', 'starts with',       '^',   'binary', ARRAY['text'], 110),
    ('is_null',     'is empty',          'null','unary',  ARRAY['uuid','text','number','boolean','date','timestamp'], 120),
    ('is_not_null', 'is not empty',      '!null','unary', ARRAY['uuid','text','number','boolean','date','timestamp'], 130)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, symbol = EXCLUDED.symbol,
        arity = EXCLUDED.arity, data_types = EXCLUDED.data_types;

-- ---------------------------------------------------------------------------
-- Rule operands. options_source tells the rule builder which project-scoped
-- list to fetch for the value picker.
-- ---------------------------------------------------------------------------
INSERT INTO rule_operands (code, label, data_type, source_path, options_source, applies_to_kinds, unit_hint, description, sort_order) VALUES
    ('contractor',        'Contractor',           'uuid',   'contractor_id',        'project_contractors', '{}', NULL, 'Contractors linked to this project.', 10),
    ('debris_type',       'Debris Type',          'text',   'debris_type',          'debris_types',        '{}', NULL, NULL, 20),
    ('debris_category',   'Debris Category',      'text',   'debris_category',      'debris_categories',   '{}', NULL, NULL, 30),
    ('zone',              'Zone',                 'text',   'zone_code',            'project_zones',       '{}', NULL, NULL, 40),
    ('destination_site',  'Destination Site',     'uuid',   'destination_site_id',  'project_sites',       '{}', NULL, NULL, 50),
    ('origin_site',       'Origin Site',          'uuid',   'origin_site_id',       'project_sites',       '{}', NULL, NULL, 55),
    ('site_kind',         'Destination Site Kind','text',   'destination_site_kind','site_kinds',          '{}', NULL, 'DMS, FDS, TDSRS.', 60),
    ('equipment_type',    'Equipment Type',       'text',   'equipment_type',       'equipment_types',     '{}', NULL, NULL, 70),
    ('truck',             'Truck',                'uuid',   'equipment_id',         'project_equipment',   '{}', NULL, NULL, 80),
    ('ticket_status',     'Ticket Status',        'text',   'status',               'ticket_statuses',     '{}', NULL, NULL, 90),
    ('special_class',     'Special Class',        'text',   'special_class',        NULL,                  '{}', NULL, NULL, 100),
    ('severity',          'Severity',             'text',   'severity',             'severities',          '{incident}', NULL, NULL, 110),
    ('distance',          'Haul Distance',        'number', 'haul_miles',           NULL,                  '{}', 'miles', 'Odometer, waypoint path, or straight-line fallback.', 120),
    ('cubic_yards',       'Billable Cubic Yards', 'number', 'billable_cubic_yards', NULL,                  '{}', 'CY', NULL, 130),
    ('tons',              'Net Tons',             'number', 'net_tons',             NULL,                  '{}', 'tons', NULL, 140),
    ('load_call',         'Load Call',            'number', 'load_call_pct',        NULL,                  '{load,haul_out}', '%', NULL, 150),
    ('labor_hours',       'Labor Hours',          'number', 'labor_hours',          NULL,                  '{unit_rate}', 'hours', NULL, 160),
    ('equipment_hours',   'Equipment Hours',      'number', 'equipment_hours',      NULL,                  '{unit_rate}', 'hours', NULL, 170),
    ('unit_count',        'Unit Count',           'number', 'unit_count',           NULL,                  '{unit_rate}', NULL, NULL, 180),
    ('stump_diameter',    'Stump Diameter',       'number', 'stump_diameter_inches',NULL,                  '{unit_rate}', 'inches', NULL, 185),
    ('cycle_minutes',     'Cycle Time',           'number', 'cycle_minutes',        NULL,                  '{}', 'minutes', NULL, 190),
    ('photo_count',       'Photo Count',          'number', 'photo_count',          NULL,                  '{}', NULL, 'Useful for documentation-completeness gates.', 200),
    ('waypoint_count',    'Waypoint Count',       'number', 'waypoint_count',       NULL,                  '{load}', NULL, NULL, 205),
    ('service_date',      'Service Date',         'date',   'service_date',         NULL,                  '{}', NULL, NULL, 210),
    ('scale_ticket',      'Scale Ticket Number',  'text',   'scale_ticket_number',  NULL,                  '{}', NULL, NULL, 220),
    ('created_by',        'Created By',           'uuid',   'created_by',           'project_workers',     '{}', NULL, NULL, 230),
    ('source',            'Entry Source',         'text',   'source',               'ticket_sources',      '{}', NULL, NULL, 240)
ON CONFLICT (code) DO UPDATE
    SET label = EXCLUDED.label, data_type = EXCLUDED.data_type,
        source_path = EXCLUDED.source_path,
        options_source = EXCLUDED.options_source,
        applies_to_kinds = EXCLUDED.applies_to_kinds,
        unit_hint = EXCLUDED.unit_hint, description = EXCLUDED.description;

-- ---------------------------------------------------------------------------
-- Incident taxonomy
-- ---------------------------------------------------------------------------
INSERT INTO incident_categories (code, label, default_severity, sort_order) VALUES
    ('safety',        'Safety',            'high',   10),
    ('property',      'Property Damage',   'medium', 20),
    ('equipment',     'Equipment',         'medium', 30),
    ('environmental', 'Environmental',     'high',   40),
    ('public',        'Public Interaction','medium', 50),
    ('compliance',    'Compliance',        'high',   60)
ON CONFLICT (code) DO NOTHING;

INSERT INTO incident_categories (code, label, parent_id, default_severity, sort_order)
SELECT v.code, v.label, p.id, v.sev, v.ord
  FROM (VALUES
    ('safety.injury',        'Personal Injury',        'safety',        'critical', 11),
    ('safety.near_miss',     'Near Miss',              'safety',        'medium',   12),
    ('safety.traffic',       'Traffic Incident',       'safety',        'high',     13),
    ('property.private',     'Private Property',       'property',      'medium',   21),
    ('property.public',      'Public Infrastructure',  'property',      'high',     22),
    ('property.utility',     'Utility Strike',         'property',      'critical', 23),
    ('equipment.breakdown',  'Equipment Breakdown',    'equipment',     'low',      31),
    ('equipment.unsafe',     'Unsafe Equipment',       'equipment',     'high',     32),
    ('environmental.spill',  'Fluid or Fuel Spill',    'environmental', 'critical', 41),
    ('environmental.hhw',    'Hazardous Material Found','environmental','high',     42),
    ('public.complaint',     'Resident Complaint',     'public',        'low',      51),
    ('public.media',         'Media Inquiry',          'public',        'medium',   52),
    ('compliance.ineligible','Ineligible Debris',      'compliance',    'high',     61),
    ('compliance.documentation','Documentation Gap',   'compliance',    'medium',   62)
  ) AS v(code, label, parent_code, sev, ord)
  JOIN incident_categories p ON p.code = v.parent_code
ON CONFLICT (code) DO NOTHING;

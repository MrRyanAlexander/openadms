-- =============================================================================
-- Open ADMS :: Seed 003 :: Full demo project
-- A complete, worked disaster: client, contractors, contract, sites, zones,
-- ticket types, service codes, rates, rules, staff, and several weeks of field
-- tickets carried all the way through to locked transactions and an invoice.
--
-- Safe to re-run: it exits early if the demo project already exists.
-- =============================================================================

DO $demo$
DECLARE
    v_instance_key text;
    v_admin uuid; v_manager uuid; v_analyst uuid;
    v_mon1 uuid; v_mon2 uuid; v_mon3 uuid; v_mon4 uuid;
    v_client uuid; v_prime uuid; v_sub uuid; v_monitor_firm uuid;
    v_contract uuid; v_contract_sub uuid; v_disaster uuid; v_project uuid;
    v_dms1 uuid; v_dms2 uuid; v_fds uuid;
    v_zone1 uuid; v_zone2 uuid; v_zone3 uuid;
    v_tt_load uuid; v_tt_haul uuid; v_tt_unit uuid; v_tt_incident uuid;
    v_sc_veg uuid; v_sc_cd uuid; v_sc_haul uuid; v_sc_stump uuid; v_sc_haz uuid;
    v_rule uuid;
    v_truck uuid; v_ticket uuid;
    v_trucks uuid[];
    v_monitors uuid[];
    v_debris text[];
    v_zones uuid[];
    i integer;
    v_day date;
    v_cap numeric;
    v_call numeric;
    v_lat numeric; v_lon numeric;
    v_invoice uuid;
    v_line integer := 0;
    -- The demo is anchored relative to today so it stays current whenever it
    -- is seeded, rather than aging into an empty dashboard.
    v_base date := current_date - 30;
BEGIN
    IF EXISTS (SELECT 1 FROM projects WHERE project_code = 'STL-2026-ROW') THEN
        RAISE NOTICE 'Demo project already present; skipping.';
        RETURN;
    END IF;

    -- Field tickets are inserted directly here rather than through the API.
    SET LOCAL adms.enforce_gate = 'on';
    SET LOCAL adms.actor_name = 'seed';
    SET LOCAL adms.actor_role = 'admin';
    SET LOCAL adms.source = 'import';

    -- -----------------------------------------------------------------------
    -- Instance identity
    -- -----------------------------------------------------------------------
    SELECT instance_key INTO v_instance_key FROM instance LIMIT 1;
    IF v_instance_key IS NULL THEN
        v_instance_key := encode(gen_random_bytes(32), 'hex');
        INSERT INTO instance (instance_key, display_name, organization)
        VALUES (v_instance_key, 'Open ADMS Demo Instance', 'OpenRecover');
    END IF;

    -- -----------------------------------------------------------------------
    -- Staff. Demo password for every account: openadms
    -- -----------------------------------------------------------------------
    INSERT INTO users (username, email, full_name, monitor_id, global_role, password_hash)
    VALUES
      ('admin',    'admin@openadms.local',   'Dana Whitfield',  'ADM-001', 'admin',   crypt('openadms', gen_salt('bf', 10))),
      ('manager',  'manager@openadms.local', 'Luis Ortega',     'MGR-014', 'manager', crypt('openadms', gen_salt('bf', 10))),
      ('analyst',  'analyst@openadms.local', 'Priya Raman',     'ANL-007', 'analyst', crypt('openadms', gen_salt('bf', 10))),
      ('jmiller',  'jmiller@openadms.local', 'Jordan Miller',   'MON-118', 'monitor', crypt('openadms', gen_salt('bf', 10))),
      ('tnguyen',  'tnguyen@openadms.local', 'Thu Nguyen',      'MON-119', 'monitor', crypt('openadms', gen_salt('bf', 10))),
      ('rcarter',  'rcarter@openadms.local', 'Ray Carter',      'MON-120', 'monitor', crypt('openadms', gen_salt('bf', 10))),
      ('sboyd',    'sboyd@openadms.local',   'Sam Boyd',        'MON-121', 'monitor', crypt('openadms', gen_salt('bf', 10)));

    SELECT id INTO v_admin   FROM users WHERE username = 'admin';
    SELECT id INTO v_manager FROM users WHERE username = 'manager';
    SELECT id INTO v_analyst FROM users WHERE username = 'analyst';
    SELECT id INTO v_mon1    FROM users WHERE username = 'jmiller';
    SELECT id INTO v_mon2    FROM users WHERE username = 'tnguyen';
    SELECT id INTO v_mon3    FROM users WHERE username = 'rcarter';
    SELECT id INTO v_mon4    FROM users WHERE username = 'sboyd';

    PERFORM set_config('adms.actor_id', v_admin::text, true);

    -- -----------------------------------------------------------------------
    -- Client and contractors
    -- -----------------------------------------------------------------------
    INSERT INTO clients (name, code, client_type, fema_applicant_id,
                         primary_contact, contact_email, contact_phone,
                         address_line1, city, state_code, postal_code)
    VALUES ('St. Louis County, Missouri', 'STLCO', 'local_government', '189-00000-00',
            'Angela Brooks', 'abrooks@stlouiscountymo.gov', '(314) 555-0142',
            '41 South Central Avenue', 'Clayton', 'MO', '63105')
    RETURNING id INTO v_client;

    INSERT INTO contractors (name, code, contractor_type, primary_contact,
                             contact_email, city, state_code)
    VALUES ('Gateway Environmental Services', 'GES', 'debris_removal',
            'Mark Delgado', 'mdelgado@gatewayenv.example', 'Earth City', 'MO')
    RETURNING id INTO v_prime;

    INSERT INTO contractors (name, code, contractor_type, primary_contact, city, state_code)
    VALUES ('Meramec Hauling LLC', 'MER', 'hauling', 'Tina Brandt', 'Fenton', 'MO')
    RETURNING id INTO v_sub;

    INSERT INTO contractors (name, code, contractor_type, primary_contact, city, state_code)
    VALUES ('Confluence Monitoring Group', 'CMG', 'monitoring', 'Dana Whitfield', 'Florissant', 'MO')
    RETURNING id INTO v_monitor_firm;

    -- -----------------------------------------------------------------------
    -- Disaster and contracts
    -- -----------------------------------------------------------------------
    INSERT INTO disasters (declaration_code, name, incident_type, declared_on,
                           incident_start, incident_end, state_code)
    VALUES ('DR-4808-MO', 'Missouri Severe Storms, Tornadoes and Flooding',
            'Severe Storm', (v_base - 8), (v_base - 14),
            (v_base - 10), 'MO')
    RETURNING id INTO v_disaster;

    INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                           contract_type, status, executed_on, effective_from,
                           effective_to, not_to_exceed)
    VALUES ('STL-DEB-2026-001', 'Countywide Disaster Debris Removal',
            v_client, v_prime, 'unit_price', 'active', (v_base - 6),
            (v_base - 6), (v_base + 330), 18500000.00)
    RETURNING id INTO v_contract;

    INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                           contract_type, status, executed_on, effective_from,
                           effective_to, not_to_exceed)
    VALUES ('STL-DEB-2026-002', 'Supplemental Haul Out and Final Disposal',
            v_client, v_sub, 'unit_price', 'active', (v_base - 4),
            (v_base - 4), (v_base + 330), 4200000.00)
    RETURNING id INTO v_contract_sub;

    -- -----------------------------------------------------------------------
    -- Disposal sites
    -- -----------------------------------------------------------------------
    INSERT INTO disposal_sites (name, site_code, site_kind, operator_id, address_line1,
                                city, state_code, postal_code, latitude, longitude,
                                permit_number, permit_expires_on, has_scale,
                                accepted_debris, capacity_cy)
    VALUES ('Florissant DMS', 'DMS-01', 'DMS', v_prime, '3025 Patterson Road',
            'Florissant', 'MO', '63031', 38.789200, -90.322400,
            'MO-SW-2026-118', (v_base + 380), true,
            ARRAY['VEG','CD','MIXED','STUMP'], 420000)
    RETURNING id INTO v_dms1;

    INSERT INTO disposal_sites (name, site_code, site_kind, operator_id, address_line1,
                                city, state_code, postal_code, latitude, longitude,
                                permit_number, permit_expires_on, has_scale,
                                accepted_debris, capacity_cy)
    VALUES ('Hazelwood DMS', 'DMS-02', 'DMS', v_prime, '640 Howdershell Road',
            'Hazelwood', 'MO', '63042', 38.771500, -90.371800,
            'MO-SW-2026-119', (v_base + 380), false,
            ARRAY['VEG','CD','MIXED','WHITE'], 260000)
    RETURNING id INTO v_dms2;

    INSERT INTO disposal_sites (name, site_code, site_kind, operator_id, address_line1,
                                city, state_code, postal_code, latitude, longitude,
                                permit_number, permit_expires_on, has_scale,
                                accepted_debris)
    VALUES ('Champ Landfill', 'FDS-01', 'FDS', v_sub, '13570 Missouri Bottom Road',
            'Maryland Heights', 'MO', '63043', 38.746900, -90.446100,
            'MO-LF-118-0042', (v_base + 1200), true,
            ARRAY['VEG','CD','MIXED','SOIL'])
    RETURNING id INTO v_fds;

    -- -----------------------------------------------------------------------
    -- Project
    -- -----------------------------------------------------------------------
    INSERT INTO projects (name, project_code, client_id, disaster_id,
                          primary_contract_id, status, program, description,
                          starts_on, timezone, ticket_prefix,
                          owner_instance_key, visibility_flag, created_by)
    VALUES ('St. Louis County ROW Collection', 'STL-2026-ROW', v_client, v_disaster,
            v_contract, 'active', 'ROW Collection',
            'Right-of-way vegetative and C&D collection across north county '
            'following the spring tornado outbreak.',
            v_base, 'America/Chicago', 'STL',
            v_instance_key, 'private', v_admin)
    RETURNING id INTO v_project;

    INSERT INTO project_contractors (project_id, contractor_id, role_on_project) VALUES
        (v_project, v_prime, 'prime'),
        (v_project, v_sub, 'subcontractor'),
        (v_project, v_monitor_firm, 'monitoring_firm');

    INSERT INTO project_contracts (project_id, contract_id, is_primary) VALUES
        (v_project, v_contract, true),
        (v_project, v_contract_sub, false);

    INSERT INTO project_sites (project_id, site_id, opened_on) VALUES
        (v_project, v_dms1, v_base),
        (v_project, v_dms2, (v_base + 2)),
        (v_project, v_fds,  v_base);

    INSERT INTO project_zones (project_id, zone_code, name) VALUES
        (v_project, '001', 'Florissant North'),
        (v_project, '002', 'Hazelwood / Berkeley'),
        (v_project, '003', 'Ferguson / Dellwood');
    SELECT id INTO v_zone1 FROM project_zones WHERE project_id = v_project AND zone_code = '001';
    SELECT id INTO v_zone2 FROM project_zones WHERE project_id = v_project AND zone_code = '002';
    SELECT id INTO v_zone3 FROM project_zones WHERE project_id = v_project AND zone_code = '003';
    v_zones := ARRAY[v_zone1, v_zone2, v_zone3];

    -- -----------------------------------------------------------------------
    -- Ticket types enabled on the project
    -- -----------------------------------------------------------------------
    SELECT id INTO v_tt_load     FROM ticket_types WHERE code = 'LOAD';
    SELECT id INTO v_tt_haul     FROM ticket_types WHERE code = 'HAULOUT';
    SELECT id INTO v_tt_unit     FROM ticket_types WHERE code = 'UNIT';
    SELECT id INTO v_tt_incident FROM ticket_types WHERE code = 'INCIDENT';

    INSERT INTO project_ticket_types (project_id, ticket_type_id) VALUES
        (v_project, v_tt_load), (v_project, v_tt_haul),
        (v_project, v_tt_unit), (v_project, v_tt_incident);

    -- -----------------------------------------------------------------------
    -- Workers on the project
    -- -----------------------------------------------------------------------
    INSERT INTO project_assignments (project_id, user_id, project_role, contractor_id,
                                     can_create_tickets, can_review_tickets) VALUES
        (v_project, v_admin,   'admin',   v_monitor_firm, true,  true),
        (v_project, v_manager, 'manager', v_monitor_firm, true,  true),
        (v_project, v_analyst, 'analyst', v_monitor_firm, false, true),
        (v_project, v_mon1,    'monitor', v_monitor_firm, true,  false),
        (v_project, v_mon2,    'monitor', v_monitor_firm, true,  false),
        (v_project, v_mon3,    'monitor', v_monitor_firm, true,  false),
        (v_project, v_mon4,    'monitor', v_monitor_firm, true,  false);
    v_monitors := ARRAY[v_mon1, v_mon2, v_mon3, v_mon4];

    -- -----------------------------------------------------------------------
    -- Trucks
    -- -----------------------------------------------------------------------
    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make, model,
                           model_year, capacity_cy, tare_weight_lbs, certified_on,
                           placard_code, barcode)
    SELECT 'GES-' || lpad(n::text, 3, '0'), v_prime, 'truck', 'Mack', 'Granite',
           2019 + (n % 5), (30 + (n * 7) % 70)::numeric, 22000 + (n * 130),
           (v_base - 2), 'P-' || lpad(n::text, 4, '0'),
           'GES' || lpad(n::text, 3, '0') || 'BC'
      FROM generate_series(1, 14) n;

    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make, model,
                           model_year, capacity_cy, tare_weight_lbs, certified_on,
                           placard_code, barcode)
    SELECT 'MER-' || lpad(n::text, 3, '0'), v_sub, 'truck', 'Peterbilt', '567',
           2020 + (n % 4), (60 + (n * 9) % 50)::numeric, 26000 + (n * 90),
           (v_base - 2), 'M-' || lpad(n::text, 4, '0'),
           'MER' || lpad(n::text, 3, '0') || 'BC'
      FROM generate_series(1, 6) n;

    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make, certified_on)
    VALUES ('CREW-A', v_prime, 'crew', 'Bucket + Chipper', (v_base - 2)),
           ('CREW-B', v_prime, 'crew', 'Grapple + Grinder', (v_base - 2));

    SELECT array_agg(id ORDER BY unit_number) INTO v_trucks
      FROM equipment WHERE contractor_id = v_prime AND equipment_type = 'truck';

    -- -----------------------------------------------------------------------
    -- Service codes and rates
    -- -----------------------------------------------------------------------
    INSERT INTO service_codes (project_id, code, name, contractor_id, fema_category, description)
    VALUES (v_project, 'ROW-VEG', 'ROW Vegetative Collection', v_prime, 'A',
            'Curbside vegetative debris collected in the right of way and hauled to a DMS.')
    RETURNING id INTO v_sc_veg;

    INSERT INTO service_codes (project_id, code, name, contractor_id, fema_category, description)
    VALUES (v_project, 'ROW-CD', 'ROW Construction and Demolition', v_prime, 'A',
            'Curbside C&D debris collected in the right of way and hauled to a DMS.')
    RETURNING id INTO v_sc_cd;

    INSERT INTO service_codes (project_id, code, name, contractor_id, fema_category, description)
    VALUES (v_project, 'HAUL-FDS', 'Haul Out to Final Disposal', v_sub, 'A',
            'Reduced debris hauled from a DMS to the final disposal site.')
    RETURNING id INTO v_sc_haul;

    INSERT INTO service_codes (project_id, code, name, contractor_id, fema_category, description)
    VALUES (v_project, 'STUMP', 'Hazardous Stump Removal', v_prime, 'B',
            'Per diameter inch removal of hazardous stumps 24 inches and over.')
    RETURNING id INTO v_sc_stump;

    INSERT INTO service_codes (project_id, code, name, contractor_id, fema_category, description)
    VALUES (v_project, 'HHW', 'Household Hazardous Waste Handling', v_prime, 'B',
            'Segregation, packaging and disposal of household hazardous waste.')
    RETURNING id INTO v_sc_haz;

    INSERT INTO rates (service_code_id, amount, unit_type, effective_from, notes) VALUES
        (v_sc_veg,   9.4500,  'per_cubic_yard',  v_base, 'Base contract rate'),
        (v_sc_cd,   11.2500,  'per_cubic_yard',  v_base, 'Base contract rate'),
        (v_sc_haul,  4.7500,  'per_cubic_yard',  v_base, 'Haul out to Champ Landfill'),
        (v_sc_stump, 6.5000,  'per_diameter_in', v_base, '24 inch minimum'),
        (v_sc_haz, 285.0000,  'per_each',        v_base, 'Flat per HHW load');

    -- -----------------------------------------------------------------------
    -- Rules. Each says: when these conditions hold, bill this service code
    -- under this contract.
    -- -----------------------------------------------------------------------
    INSERT INTO rules (project_id, ticket_type_id, name, description, service_code_id,
                       contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'ROW Vegetative Load',
            'Vegetative debris collected by the prime and delivered to a DMS.',
            v_sc_veg, v_contract, 'all', 10, v_analyst)
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code, value, value_label) VALUES
        (v_rule, 1, 'contractor',   'eq', to_jsonb(v_prime::text), 'Gateway Environmental Services'),
        (v_rule, 2, 'debris_type',  'in', '["VEG","STUMP","HANGER","LEANER"]'::jsonb, 'Vegetative debris'),
        (v_rule, 3, 'site_kind',    'in', '["DMS","TDSRS"]'::jsonb, 'Debris management site'),
        (v_rule, 4, 'cubic_yards',  'gt', '0'::jsonb, 'greater than 0 CY');

    INSERT INTO rules (project_id, ticket_type_id, name, description, service_code_id,
                       contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'ROW C&D Load',
            'Construction and demolition debris collected by the prime.',
            v_sc_cd, v_contract, 'all', 20, v_analyst)
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code, value, value_label) VALUES
        (v_rule, 1, 'contractor',  'eq', to_jsonb(v_prime::text), 'Gateway Environmental Services'),
        (v_rule, 2, 'debris_type', 'in', '["CD","MIXED"]'::jsonb, 'C&D or mixed'),
        (v_rule, 3, 'cubic_yards', 'gt', '0'::jsonb, 'greater than 0 CY');

    INSERT INTO rules (project_id, ticket_type_id, name, description, service_code_id,
                       contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'ROW HHW Volume',
            'Volume rate for the portion of a load that is household hazardous '
            'waste. Billed alongside the flat handling fee below.',
            v_sc_cd, v_contract, 'all', 25, v_analyst)
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code, value, value_label) VALUES
        (v_rule, 1, 'debris_type', 'eq', '"HHW"'::jsonb, 'Household Hazardous Waste'),
        (v_rule, 2, 'cubic_yards', 'gt', '0'::jsonb, 'greater than 0 CY');

    INSERT INTO rules (project_id, ticket_type_id, name, description, service_code_id,
                       contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'HHW Segregation Surcharge',
            'Flat handling fee applied on top of the volume rate whenever a load '
            'contains household hazardous waste.',
            v_sc_haz, v_contract, 'all', 30, v_analyst)
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code, value, value_label) VALUES
        (v_rule, 1, 'debris_type', 'eq', '"HHW"'::jsonb, 'Household Hazardous Waste');

    INSERT INTO rules (project_id, ticket_type_id, name, description, service_code_id,
                       contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_haul, 'Haul Out to Champ Landfill',
            'Subcontractor haul out from a DMS to the final disposal site, '
            'more than five miles.',
            v_sc_haul, v_contract_sub, 'all', 10, v_analyst)
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code, value, value_label) VALUES
        (v_rule, 1, 'site_kind', 'eq', '"FDS"'::jsonb, 'Final disposal site'),
        (v_rule, 2, 'distance',  'gt', '5'::jsonb, 'more than 5 miles');

    INSERT INTO rules (project_id, ticket_type_id, name, description, service_code_id,
                       contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_unit, 'Hazardous Stump 24in and Over',
            'Per diameter inch removal for stumps of 24 inches or more.',
            v_sc_stump, v_contract, 'all', 10, v_analyst)
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code, value, value_label) VALUES
        (v_rule, 1, 'stump_diameter', 'gte', '24'::jsonb, 'at least 24 inches');

    -- =======================================================================
    -- Field work
    -- =======================================================================
    v_debris := ARRAY['VEG','VEG','VEG','CD','VEG','MIXED','CD','VEG','HHW','VEG'];

    -- ---- Load tickets -----------------------------------------------------
    FOR i IN 1..64 LOOP
        v_day  := v_base + ((i - 1) * 26 / 64);
        v_truck := v_trucks[1 + (i % array_length(v_trucks, 1))];
        SELECT capacity_cy INTO v_cap FROM equipment WHERE id = v_truck;
        v_call := 40 + ((i * 13) % 61);
        v_lat  := 38.780000 + ((i % 17) * 0.00420);
        v_lon  := -90.340000 - ((i % 23) * 0.00380);

        PERFORM set_config('adms.actor_id',
                           v_monitors[1 + (i % 4)]::text, true);

        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, equipment_id,
            contract_id, zone_id, driver_name, barcode, debris_type,
            origin_house_number, origin_street, origin_city, origin_state,
            origin_latitude, origin_longitude, origin_at,
            destination_site_id, destination_latitude, destination_longitude,
            destination_at, load_call_pct, certified_capacity_cy,
            scale_ticket_number, gross_weight_lbs, tare_weight_lbs,
            created_by, completed_by, completed_at, source, data
        )
        SELECT
            v_project, v_tt_load, 'completed', v_prime, v_truck,
            v_contract, v_zones[1 + (i % 3)],
            'Driver ' || (100 + i), e.barcode,
            v_debris[1 + (i % 10)],
            (1000 + i * 7)::text,
            (ARRAY['Paddock Drive','Shackelford Road','Lindbergh Boulevard',
                   'Chambers Road','Dunn Road','Washington Street',
                   'Florissant Road','Howdershell Road'])[1 + (i % 8)],
            'Florissant', 'MO',
            v_lat, v_lon,
            (v_day + TIME '07:30') + (i % 6) * INTERVAL '48 minutes',
            CASE WHEN i % 3 = 0 THEN v_dms2 ELSE v_dms1 END,
            CASE WHEN i % 3 = 0 THEN 38.771500 ELSE 38.789200 END,
            CASE WHEN i % 3 = 0 THEN -90.371800 ELSE -90.322400 END,
            (v_day + TIME '08:20') + (i % 6) * INTERVAL '48 minutes',
            v_call, e.capacity_cy,
            CASE WHEN i % 4 = 0 THEN 'SC-' || (52000 + i)::text END,
            CASE WHEN i % 4 = 0 THEN 41000 + (i * 190) END,
            e.tare_weight_lbs,
            v_monitors[1 + (i % 4)], v_monitors[1 + ((i + 1) % 4)],
            (v_day + TIME '08:20') + (i % 6) * INTERVAL '48 minutes',
            'field_app',
            jsonb_build_object('load_call_source', 'visual',
                               'weather', (ARRAY['clear','overcast','light rain'])[1 + (i % 3)])
          FROM equipment e WHERE e.id = v_truck
        RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status, monitor_id,
                                   monitor_name, monitor_code, latitude, longitude,
                                   address, debris_type, occurred_at)
        SELECT v_ticket, 'collection', 1, 'complete', u.id, u.full_name, u.monitor_id,
               v_lat, v_lon, t.origin_street, t.debris_type, t.origin_at
          FROM tickets t JOIN users u ON u.id = t.created_by WHERE t.id = v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status, monitor_id,
                                   monitor_name, monitor_code, site_id, load_call_pct,
                                   scale_ticket_number, weight_lbs, occurred_at)
        SELECT v_ticket, 'disposal', 3, 'complete', u.id, u.full_name, u.monitor_id,
               t.destination_site_id, t.load_call_pct, t.scale_ticket_number,
               t.gross_weight_lbs, t.destination_at
          FROM tickets t JOIN users u ON u.id = t.completed_by WHERE t.id = v_ticket;

        INSERT INTO ticket_waypoints (ticket_id, sequence, latitude, longitude, recorded_at)
        SELECT v_ticket, w,
               v_lat + (w * 0.0031),
               v_lon - (w * 0.0027),
               (v_day + TIME '07:45') + (w * INTERVAL '6 minutes')
          FROM generate_series(1, 4) w;

        INSERT INTO ticket_media (ticket_id, stage_code, media_kind, description,
                                  storage_url, is_primary, captured_at, uploaded_by)
        VALUES (v_ticket, 'disposal', 'photo', 'Load call photo',
                '/media/demo/load-' || i || '.jpg', true,
                (v_day + TIME '08:22'), v_monitors[1 + ((i + 1) % 4)]);
    END LOOP;

    -- ---- Haul out tickets -------------------------------------------------
    FOR i IN 1..18 LOOP
        v_day := (v_base + 3) + ((i - 1) * 21 / 18);
        SELECT id, capacity_cy INTO v_truck, v_cap
          FROM equipment WHERE contractor_id = v_sub AND equipment_type = 'truck'
         ORDER BY unit_number OFFSET (i % 6) LIMIT 1;
        v_call := 75 + ((i * 7) % 26);

        PERFORM set_config('adms.actor_id', v_monitors[1 + (i % 4)]::text, true);

        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, equipment_id,
            contract_id, driver_name, debris_type, origin_site_id,
            origin_latitude, origin_longitude, origin_at,
            destination_site_id, destination_latitude, destination_longitude,
            destination_at, load_call_pct, certified_capacity_cy,
            created_by, completed_by, completed_at, source
        ) VALUES (
            v_project, v_tt_haul, 'completed', v_sub, v_truck,
            v_contract_sub, 'Hauler ' || (200 + i),
            CASE WHEN i % 3 = 0 THEN 'CD' ELSE 'VEG' END,
            v_dms1, 38.789200, -90.322400,
            (v_day + TIME '09:15') + (i % 3) * INTERVAL '95 minutes',
            v_fds, 38.746900, -90.446100,
            (v_day + TIME '10:05') + (i % 3) * INTERVAL '95 minutes',
            v_call, v_cap,
            v_monitors[1 + (i % 4)], v_monitors[1 + ((i + 2) % 4)],
            (v_day + TIME '10:05') + (i % 3) * INTERVAL '95 minutes',
            'field_app'
        ) RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status, monitor_id,
                                   site_id, load_call_pct, occurred_at)
        VALUES (v_ticket, 'haul_out_start', 1, 'complete', v_monitors[1 + (i % 4)],
                v_dms1, v_call, (v_day + TIME '09:15')),
               (v_ticket, 'haul_out_complete', 2, 'complete', v_monitors[1 + ((i + 2) % 4)],
                v_fds, NULL, (v_day + TIME '10:05'));

        INSERT INTO ticket_media (ticket_id, stage_code, media_kind, description,
                                  storage_url, is_primary, captured_at)
        VALUES (v_ticket, 'haul_out_start', 'photo', 'Bed photo at DMS',
                '/media/demo/haul-' || i || '.jpg', true, (v_day + TIME '09:18'));
    END LOOP;

    -- ---- Unit rate tickets ------------------------------------------------
    FOR i IN 1..12 LOOP
        v_day := (v_base + 6) + ((i - 1) * 20 / 12);
        PERFORM set_config('adms.actor_id', v_monitors[1 + (i % 4)]::text, true);

        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, contract_id,
            crew_id, zone_id, debris_type, quantity, quantity_unit,
            origin_street, origin_city, origin_state,
            origin_latitude, origin_longitude, origin_at,
            created_by, completed_by, completed_at, source, data, notes
        ) VALUES (
            v_project, v_tt_unit, 'completed', v_prime, v_contract,
            (SELECT id FROM equipment WHERE unit_number = 'CREW-A'),
            v_zones[1 + (i % 3)], 'STUMP', 1, 'per_each',
            (ARRAY['Elm Grove Lane','Cottage Avenue','Saint Ferdinand Street',
                   'New Halls Ferry Road'])[1 + (i % 4)],
            'Florissant', 'MO',
            38.792000 + (i * 0.0021), -90.331000 - (i * 0.0019),
            (v_day + TIME '10:00') + (i % 3) * INTERVAL '75 minutes',
            v_monitors[1 + (i % 4)], v_monitors[1 + (i % 4)],
            (v_day + TIME '11:10') + (i % 3) * INTERVAL '75 minutes',
            'field_app',
            jsonb_build_object(
                'unit_work_type', 'Stump Removal',
                'stump_diameter_inches', 18 + (i * 4)),
            'Hazardous stump removed from the right of way.'
        ) RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, occurred_at)
        VALUES (v_ticket, 'work', 1, 'complete', v_monitors[1 + (i % 4)],
                (v_day + TIME '10:05'));

        INSERT INTO ticket_media (ticket_id, stage_code, media_kind, description,
                                  storage_url, is_primary, captured_at)
        VALUES (v_ticket, 'work', 'photo', 'Before',
                '/media/demo/stump-' || i || '-before.jpg', true, (v_day + TIME '10:02'));
        INSERT INTO ticket_media (ticket_id, stage_code, media_kind, description,
                                  storage_url, captured_at)
        VALUES (v_ticket, 'work', 'photo', 'After',
                '/media/demo/stump-' || i || '-after.jpg', (v_day + TIME '11:08'));
    END LOOP;

    -- ---- Incident reports -------------------------------------------------
    FOR i IN 1..6 LOOP
        v_day := (v_base + 2) + (i * 4);
        PERFORM set_config('adms.actor_id', v_monitors[1 + (i % 4)]::text, true);

        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id,
            incident_category_id, severity, is_ongoing, zone_id,
            origin_street, origin_city, origin_state,
            origin_latitude, origin_longitude, origin_at,
            created_by, completed_by, completed_at, source, notes
        ) VALUES (
            v_project, v_tt_incident, 'completed', v_prime,
            (SELECT id FROM incident_categories
              ORDER BY code OFFSET (i % 14) LIMIT 1),
            (ARRAY['low','medium','high','critical','medium','low'])[i],
            (i % 3 = 0), v_zones[1 + (i % 3)],
            (ARRAY['Patterson Road','Airport Road','Chambers Road'])[1 + (i % 3)],
            'Florissant', 'MO',
            38.786000 + (i * 0.0034), -90.327000 - (i * 0.0029),
            (v_day + TIME '13:20'),
            v_monitors[1 + (i % 4)], v_monitors[1 + (i % 4)], (v_day + TIME '13:45'),
            'field_app',
            (ARRAY[
              'Grapple truck clipped a mailbox at the curb line. Owner notified, photos taken.',
              'Low hanging utility line over the collection route. Segment paused pending utility response.',
              'Resident placed paint cans and pool chemicals in the ROW pile. Segregated for HHW handling.',
              'Loader hydraulic line failure. Unit removed from service, no spill to soil.',
              'Near miss between a passing vehicle and a monitor in the ROW. Cones repositioned.',
              'Ineligible commercial debris staged at the curb. Documented and left in place.'
            ])[i]
        ) RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, occurred_at)
        VALUES (v_ticket, 'report', 1, 'complete', v_monitors[1 + (i % 4)],
                (v_day + TIME '13:20'));
    END LOOP;

    -- ---- A few tickets still moving through the field ---------------------
    PERFORM set_config('adms.actor_id', v_mon1::text, true);
    FOR i IN 1..5 LOOP
        v_truck := v_trucks[1 + (i % array_length(v_trucks, 1))];
        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, equipment_id,
            contract_id, zone_id, driver_name, debris_type,
            origin_street, origin_city, origin_state,
            origin_latitude, origin_longitude, origin_at,
            certified_capacity_cy, created_by, source
        )
        SELECT v_project, v_tt_load, 'pending_disposal', v_prime, v_truck,
               v_contract, v_zone1, 'Driver ' || (300 + i), 'VEG',
               'Saint Catherine Street', 'Florissant', 'MO',
               38.790000 + (i * 0.002), -90.325000 - (i * 0.002),
               now() - (i * INTERVAL '35 minutes'),
               e.capacity_cy, v_mon1, 'field_app'
          FROM equipment e WHERE e.id = v_truck
        RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, occurred_at)
        VALUES (v_ticket, 'collection', 1, 'complete', v_mon1,
                now() - (i * INTERVAL '35 minutes'));

        INSERT INTO pending_handoffs (ticket_id, project_id, handoff_kind, barcode,
                                      issued_by, payload)
        SELECT v_ticket, v_project, 'pending_disposal', t.barcode_out, v_mon1,
               jsonb_build_object('ticket_number', t.ticket_number,
                                  'debris_type', t.debris_type,
                                  'capacity_cy', t.certified_capacity_cy)
          FROM (SELECT ticket_number, debris_type, certified_capacity_cy,
                       'HANDOFF-' || substr(md5(random()::text), 1, 10) AS barcode_out
                  FROM tickets WHERE id = v_ticket) t;
    END LOOP;

    -- ---- One voided ticket, so the void path is represented ---------------
    SELECT id INTO v_ticket FROM tickets
     WHERE project_id = v_project AND status = 'completed'
     ORDER BY created_at LIMIT 1;
    UPDATE tickets
       SET is_void = true, void_reason = 'Duplicate scan at the DMS gate',
           voided_by = v_manager
     WHERE id = v_ticket;

    -- =======================================================================
    -- Run the rules engine over every completed ticket
    -- =======================================================================
    PERFORM set_config('adms.actor_id', v_admin::text, true);
    FOR v_ticket IN
        SELECT id FROM tickets
         WHERE project_id = v_project AND status = 'completed' AND NOT is_void
         ORDER BY created_at
    LOOP
        PERFORM adms_process_ticket(v_ticket, v_admin);
    END LOOP;

    -- =======================================================================
    -- Draft invoice for the prime's first billing period
    -- =======================================================================
    INSERT INTO invoices (invoice_number, project_id, contractor_id, contract_id,
                          status, period_start, period_end, notes, created_by)
    VALUES (adms_next_number('invoice:' || v_project::text, 'INV-'),
            v_project, v_prime, v_contract, 'draft',
            v_base, (v_base + 6),
            'First weekly billing period, ROW collection.', v_manager)
    RETURNING id INTO v_invoice;

    FOR v_ticket IN
        SELECT tx.id FROM transactions tx
          JOIN tickets t ON t.id = tx.ticket_id
         WHERE tx.project_id = v_project
           AND tx.contractor_id = v_prime
           AND NOT tx.is_reversal
           AND t.completed_at::date BETWEEN v_base AND (v_base + 6)
         ORDER BY tx.computed_at
    LOOP
        v_line := v_line + 1;
        INSERT INTO invoice_lines (invoice_id, transaction_id, line_number, amount)
        SELECT v_invoice, v_ticket, v_line, amount FROM transactions WHERE id = v_ticket;
    END LOOP;

    RAISE NOTICE 'Demo project seeded: % tickets, % transactions, invoice with % lines',
        (SELECT count(*) FROM tickets WHERE project_id = v_project),
        (SELECT count(*) FROM transactions WHERE project_id = v_project),
        v_line;
END
$demo$;

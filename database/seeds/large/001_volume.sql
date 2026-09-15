-- =============================================================================
-- Open ADMS :: optional volume seed
--
-- Two questions the worked demo cannot answer on its own:
--
--   "Work a project with a hundred thousand tickets: list, filter, sort, export."
--   "Work twenty projects at once, from a screen that sits above all of them."
--
-- So this file does two things. It builds as many complete demo projects as you
-- ask for, each with its own client, contractors, contract and line items,
-- disposal sites, zones, scope, crew, trucks, certifications, service codes,
-- rates and rules, and then it spreads a ticket total across them and prices
-- every ticket through the rules engine.
--
-- It is deliberately NOT part of setup.sh. `npm run setup` builds the same
-- database it has always built. This file is reached through
-- `npm run db:seed:large` or the volume question the installer asks, and it
-- says what it is about to do before it does it.
--
-- Controlled by the caller:
--     psql -v tickets=250000 -v projects=10 -f seeds/large/001_volume.sql
--
--   tickets   the TOTAL number of tickets, 1 to 1,000,000, split across the
--             projects being filled rather than multiplied by them
--   projects  how many NEW demo projects to build first, 0 to 50. With 0, the
--             tickets go to the demo projects already in the database.
--
-- Naming. Every project built here follows the convention seed 003 sets:
--
--     DEMO Project 07 - Ice Storm Nightjar        code DEMO-07-NIGHTJAR
--     DEMO Client 07 - Nightjar County            DEMO Prime 07 - ...
--     invented streets in Nightjar City, XX       contacts at demo.invalid
--
-- None of it is real, none of it can be mistaken for real, and the storm word
-- runs through every record on the project so you can tell at a glance which
-- project a row belongs to.
--
-- Safe to re-run. Each run continues the numbering from the highest DEMO
-- project already present and says what it added.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

\if :{?tickets}
\else
  \set tickets 25000
\endif
\if :{?projects}
\else
  \set projects 0
\endif

-- =============================================================================
-- The project builder.
--
-- One complete, ready-for-the-field project per call. Everything it writes is
-- derived from the sequence number and the storm word, so two calls never
-- collide and a reader can see which project any row came from.
-- =============================================================================
CREATE OR REPLACE FUNCTION adms_demo_build_project(p_seq integer)
RETURNS uuid
LANGUAGE plpgsql
AS $build$
DECLARE
    -- Storm words, not real storms. Past the end of the list the name becomes
    -- STORM<n>, which is uglier and still unmistakably a demo.
    c_storms  text[] := ARRAY[
        'VESPER','HALCYON','KESTREL','OBSIDIAN','THORNWIND','CINDERGALE',
        'NIGHTJAR','IRONSKY','WINDROW','ANVIL','RAVENHAIL','SALTWIND',
        'UMBRA','ZEPHYRA','BOREAS','SQUALLINE','HAILSTONE','TEMPESTRY',
        'DRIFTWOOD','GALEWOOD','MISTRAL','TORRENT','VORTEX','EMBERFALL',
        'STORMGLASS','LEEWARD','RAINSHADOW','SUNDOWNER','WHITECAP','BLUSTER',
        'CROSSWIND','DOWNBURST','EASTERLY','FLOODMARK','GUSTLINE','HEADWIND',
        'ICEFALL','JETSTREAM','KATABATIC','LANDFALL','MONSOON','NOREASTER',
        'OUTFLOW','PRESSURE','QUICKSILVER','RIPTIDE','STORMFRONT','TWISTER',
        'UPDRAFT','WINDWARD'];
    c_events  text[] := ARRAY[
        'Hurricane','Tropical Storm','Severe Storm','Tornado Outbreak',
        'Ice Storm','Derecho','Flood Event','Winter Storm'];
    c_places  text[] := ARRAY['City','Falls','Heights','Ridge','Landing'];

    v_storm    text;   -- VESPER
    v_word     text;   -- Vesper
    v_event    text;   -- Ice Storm
    v_nn       text;   -- 07
    v_prefix   text;   -- D07
    v_code     text;   -- DEMO-07-VESPER
    v_city     text;
    v_lat      numeric;
    v_lon      numeric;
    v_base     date := current_date - 30;
    v_pw       text;

    v_instance_key text;
    v_admin uuid; v_analyst uuid; v_manager uuid;
    v_mon uuid[]; v_mon1 uuid;
    v_client uuid; v_prime uuid; v_sub uuid; v_monitor_firm uuid;
    v_disaster uuid; v_contract uuid; v_contract_sub uuid;
    v_dms1 uuid; v_dms2 uuid; v_fds uuid;
    v_project uuid;
    v_zone uuid[];
    v_tt_load uuid; v_tt_haul uuid; v_tt_unit uuid; v_tt_incident uuid;
    v_sc_veg uuid; v_sc_cd uuid; v_sc_haul uuid; v_sc_stump uuid; v_sc_haz uuid;
    v_li_veg uuid; v_li_cd uuid; v_li_stump uuid; v_li_haul uuid;
    v_rule uuid;
    i integer;
BEGIN
    v_storm  := CASE WHEN p_seq <= array_length(c_storms, 1)
                     THEN c_storms[p_seq] ELSE 'STORM' || p_seq END;
    v_word   := initcap(v_storm);
    v_event  := c_events[1 + (p_seq % array_length(c_events, 1))];
    v_nn     := lpad(p_seq::text, 2, '0');
    v_prefix := 'D' || v_nn;
    v_code   := 'DEMO-' || v_nn || '-' || v_storm;
    v_city   := v_word || ' ' || c_places[1 + (p_seq % array_length(c_places, 1))];

    -- Spread across a plausible grid so twenty projects are not stacked on one
    -- point when somebody opens a map.
    v_lat := 35.0 + (((p_seq - 1) / 5) % 4) * 2.5 + ((p_seq % 5) * 0.2);
    v_lon := -95.0 + ((p_seq - 1) % 5) * 2.5;

    IF EXISTS (SELECT 1 FROM projects WHERE lower(project_code) = lower(v_code)) THEN
        RAISE NOTICE '  % already exists, skipping', v_code;
        RETURN (SELECT id FROM projects WHERE lower(project_code) = lower(v_code));
    END IF;

    SELECT instance_key INTO v_instance_key FROM instance LIMIT 1;
    SELECT id INTO v_admin   FROM users WHERE username = 'admin';
    SELECT id INTO v_analyst FROM users WHERE username = 'analyst';
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'No admin user. Run ./setup.sh --with-demo first.'
            USING ERRCODE = 'no_data_found';
    END IF;

    PERFORM set_config('adms.actor_id', v_admin::text, false);

    -- ---------------------------------------------------------------- staff
    -- One bcrypt round, reused. Every demo account shares the password, so
    -- hashing it five times per project only makes the seed slower.
    v_pw := crypt('openadms', gen_salt('bf', 10));

    INSERT INTO users (username, email, first_name, last_name, employee_id,
                       employer_name, monitor_id, global_role, password_hash)
    VALUES (lower(v_storm) || 'mgr', lower(v_storm) || 'mgr@demo.invalid',
            v_word, 'Manager', 'DMN-' || v_nn || '-01',
            'DEMO Monitoring ' || v_nn || ' - ' || v_word || ' Monitoring Group',
            'MGR-' || v_nn, 'manager', v_pw)
    RETURNING id INTO v_manager;

    INSERT INTO users (username, email, first_name, last_name, employee_id,
                       employer_name, monitor_id, global_role, password_hash)
    SELECT lower(v_storm) || n, lower(v_storm) || n || '@demo.invalid',
           v_word, 'Monitor ' || n, 'DMN-' || v_nn || '-1' || n,
           'DEMO Monitoring ' || v_nn || ' - ' || v_word || ' Monitoring Group',
           'MON-' || v_nn || n, 'monitor', v_pw
      FROM generate_series(1, 4) n;

    SELECT array_agg(id ORDER BY username) INTO v_mon
      FROM users WHERE username LIKE lower(v_storm) || '_'
                   AND global_role = 'monitor';
    v_mon1 := v_mon[1];

    -- ------------------------------------------------- client and contractors
    INSERT INTO clients (name, code, client_type, fema_applicant_id,
                         primary_contact, contact_email, contact_phone,
                         address_line1, city, state_code, postal_code)
    VALUES ('DEMO Client ' || v_nn || ' - ' || v_word || ' County',
            'DCL' || v_nn, 'local_government',
            '000-' || lpad(p_seq::text, 5, '0') || '-00',
            'Avery Client', 'client' || v_nn || '@demo.invalid',
            '(555) 0' || v_nn || '-0001',
            '1 Demo Civic Plaza', v_city, 'XX', lpad(p_seq::text, 5, '0'))
    RETURNING id INTO v_client;

    INSERT INTO contractors (name, code, contractor_type, primary_contact,
                             contact_email, city, state_code)
    VALUES ('DEMO Prime ' || v_nn || ' - ' || v_word || ' Hauling Group',
            'DPR' || v_nn, 'hauler', 'Parker Prime',
            'prime' || v_nn || '@demo.invalid', v_city, 'XX')
    RETURNING id INTO v_prime;

    INSERT INTO contractors (name, code, contractor_type, primary_contact,
                             contact_email, city, state_code)
    VALUES ('DEMO Sub ' || v_nn || ' - ' || v_word || ' Transfer LLC',
            'DSB' || v_nn, 'hauler', 'Taylor Sub',
            'sub' || v_nn || '@demo.invalid', v_city, 'XX')
    RETURNING id INTO v_sub;

    INSERT INTO contractors (name, code, contractor_type, primary_contact,
                             contact_email, city, state_code)
    VALUES ('DEMO Monitoring ' || v_nn || ' - ' || v_word || ' Monitoring Group',
            'DMN' || v_nn, 'monitoring', 'Demo Admin',
            'monitoring' || v_nn || '@demo.invalid', v_city, 'XX')
    RETURNING id INTO v_monitor_firm;

    INSERT INTO contacts (entity_type, entity_id, first_name, last_name, title,
                          email, phone, contact_role, is_primary) VALUES
        ('clients', v_client, 'Avery', 'Client', 'Debris Program Manager',
         'client' || v_nn || '@demo.invalid', '(555) 0' || v_nn || '-0001', 'primary', true),
        ('clients', v_client, 'Morgan', 'Payable', 'Accounts Payable Supervisor',
         'ap' || v_nn || '@demo.invalid', '(555) 0' || v_nn || '-0002', 'finance', false),
        ('contractors', v_prime, 'Parker', 'Prime', 'Operations Director',
         'prime' || v_nn || '@demo.invalid', NULL, 'primary', true),
        ('contractors', v_sub, 'Taylor', 'Sub', 'Owner',
         'sub' || v_nn || '@demo.invalid', NULL, 'primary', true);

    -- ------------------------------------------------ disaster and contracts
    INSERT INTO disasters (declaration_code, name, incident_type, declared_on,
                           incident_start, incident_end, state_code)
    VALUES ('DEMO-DR-' || lpad(p_seq::text, 3, '0'),
            'DEMO ' || v_event || ' ' || v_word, v_event,
            (v_base - 8), (v_base - 14), (v_base - 10), 'XX')
    RETURNING id INTO v_disaster;

    INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                           contract_type, status, executed_on, effective_from,
                           effective_to, not_to_exceed, document_url)
    VALUES ('DEMO-' || v_nn || '-C001',
            'DEMO Countywide Disaster Debris Removal - ' || v_word,
            v_client, v_prime, 'unit_price', 'active', (v_base - 6),
            (v_base - 6), (v_base + 330), 18500000.00,
            'https://demo.invalid/contracts/DEMO-' || v_nn || '-C001.pdf')
    RETURNING id INTO v_contract;

    INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                           contract_type, status, executed_on, effective_from,
                           effective_to, not_to_exceed, document_url)
    VALUES ('DEMO-' || v_nn || '-C002',
            'DEMO Supplemental Haul Out and Final Disposal - ' || v_word,
            v_client, v_sub, 'unit_price', 'active', (v_base - 4),
            (v_base - 4), (v_base + 330), 4200000.00,
            'https://demo.invalid/contracts/DEMO-' || v_nn || '-C002.pdf')
    RETURNING id INTO v_contract_sub;

    -- -------------------------------------------------------- disposal sites
    INSERT INTO disposal_sites (name, site_code, site_kind, operator_id,
                                address_line1, city, state_code, postal_code,
                                latitude, longitude, permit_number,
                                permit_expires_on, has_scale, accepted_debris,
                                capacity_cy)
    VALUES ('DEMO ' || v_word || ' North DMS', v_prefix || '-DMS-1', 'DMS',
            v_prime, '100 Windrow Drive', v_city, 'XX',
            lpad(p_seq::text, 5, '0'), v_lat + 0.010, v_lon - 0.010,
            'DEMO-SW-' || v_nn || '01', (v_base + 380), true,
            ARRAY['VEG','CD','MIXED','STUMP'], 420000)
    RETURNING id INTO v_dms1;

    INSERT INTO disposal_sites (name, site_code, site_kind, operator_id,
                                address_line1, city, state_code, postal_code,
                                latitude, longitude, permit_number,
                                permit_expires_on, has_scale, accepted_debris,
                                capacity_cy)
    VALUES ('DEMO ' || v_word || ' South DMS', v_prefix || '-DMS-2', 'DMS',
            v_prime, '200 Leeward Lane', v_city, 'XX',
            lpad(p_seq::text, 5, '0'), v_lat - 0.020, v_lon - 0.030,
            'DEMO-SW-' || v_nn || '02', (v_base + 380), false,
            ARRAY['VEG','CD','MIXED','WHITE'], 260000)
    RETURNING id INTO v_dms2;

    INSERT INTO disposal_sites (name, site_code, site_kind, operator_id,
                                address_line1, city, state_code, postal_code,
                                latitude, longitude, permit_number,
                                permit_expires_on, has_scale, accepted_debris)
    VALUES ('DEMO ' || v_word || ' Regional Landfill', v_prefix || '-FDS-1',
            'FDS', v_sub, '300 Rainshadow Road', v_city, 'XX',
            lpad(p_seq::text, 5, '0'), v_lat - 0.045, v_lon - 0.090,
            'DEMO-LF-' || v_nn || '01', (v_base + 1200), true,
            ARRAY['VEG','CD','MIXED','SOIL'])
    RETURNING id INTO v_fds;

    -- --------------------------------------------------------------- project
    INSERT INTO projects (name, project_code, client_id, disaster_id,
                          primary_contract_id, status, program_code, program,
                          description, starts_on, ends_on, timezone,
                          ticket_prefix, owner_instance_key, visibility_flag,
                          created_by)
    VALUES ('DEMO Project ' || v_nn || ' - ' || v_event || ' ' || v_word,
            v_code, v_client, v_disaster, v_contract, 'active',
            'row_collection', 'ROW Collection',
            'DEMO data. Right of way collection for ' || v_event || ' ' ||
            v_word || ', which is not a real storm in a county that does not exist.',
            v_base, v_base + 120, 'America/Chicago', v_prefix,
            v_instance_key, 'private', v_admin)
    RETURNING id INTO v_project;

    INSERT INTO project_contractors (project_id, contractor_id, role_on_project,
                                     parent_contractor_id) VALUES
        (v_project, v_prime,        'prime',           NULL),
        (v_project, v_monitor_firm, 'monitoring_firm', NULL),
        (v_project, v_sub,          'sub_tier_1',      v_prime);

    INSERT INTO project_contracts (project_id, contract_id, is_primary) VALUES
        (v_project, v_contract, true),
        (v_project, v_contract_sub, false);

    INSERT INTO project_sites (project_id, site_id, opened_on) VALUES
        (v_project, v_dms1, v_base),
        (v_project, v_dms2, (v_base + 2)),
        (v_project, v_fds,  v_base);

    -- ------------------------------------------------------------- documents
    INSERT INTO documents (entity_type, entity_id, kind_code, title, url,
                           provider, effective_from, verification_status,
                           verified_by, verified_at, created_by)
    VALUES ('contracts', v_contract, 'contract',
            'DEMO-' || v_nn || '-C001 executed contract',
            'https://demo.invalid/contracts/DEMO-' || v_nn || '-C001.pdf',
            'sharepoint', (v_base - 6), 'verified', v_admin, (v_base - 5), v_admin),
           ('contracts', v_contract_sub, 'contract',
            'DEMO-' || v_nn || '-C002 executed contract',
            'https://demo.invalid/contracts/DEMO-' || v_nn || '-C002.pdf',
            'sharepoint', (v_base - 4), 'verified', v_admin, (v_base - 3), v_admin);

    -- One permit verified, one still pending with the client, one not required.
    -- The same three states the worked demo carries, because the alert feed is
    -- only worth looking at when something on it is unresolved.
    INSERT INTO documents (entity_type, entity_id, project_id, kind_code, title,
                           url, provider, effective_from, expires_on,
                           verification_status, verified_by, verified_at, created_by)
    VALUES ('disposal_sites', v_dms1, v_project, 'permit',
            'DEMO ' || v_word || ' North DMS operating permit',
            'https://demo.invalid/permits/DEMO-SW-' || v_nn || '01.pdf',
            'sharepoint', (v_base - 3), (v_base + 380), 'verified',
            v_admin, (v_base - 2), v_admin);

    UPDATE project_sites ps
       SET permit_status = 'verified',
           permit_document_id = d.id,
           permit_verified_by = v_admin,
           permit_verified_on = (v_base - 2)
      FROM documents d
     WHERE d.entity_type = 'disposal_sites' AND d.entity_id = v_dms1
       AND d.project_id = v_project
       AND ps.project_id = v_project AND ps.site_id = v_dms1;

    UPDATE project_sites
       SET permit_status = 'pending', permit_requested_from = 'client',
           permit_requested_on = (v_base + 1),
           permit_notes = 'Requested from the demo client. Operations continue.'
     WHERE project_id = v_project AND site_id = v_dms2;

    UPDATE project_sites
       SET permit_status = 'not_required',
           permit_notes = 'Permitted landfill operating under its own licence.'
     WHERE project_id = v_project AND site_id = v_fds;

    -- ---------------------------------------------------- contract line items
    INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                     description, unit_type_code, unit_price,
                                     debris_type_code, service_category,
                                     effective_from, source_page, status,
                                     reviewed_by, reviewed_at)
    VALUES (v_contract, 1, '1.01',
            'Collection and hauling of vegetative debris from the public right of way',
            'per_cubic_yard', 9.4500, 'VEG', 'collection', (v_base - 6), 4,
            'accepted', v_admin, (v_base - 5))
    RETURNING id INTO v_li_veg;

    INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                     description, unit_type_code, unit_price,
                                     debris_type_code, service_category,
                                     effective_from, source_page, status,
                                     reviewed_by, reviewed_at)
    VALUES (v_contract, 2, '1.02',
            'Collection and hauling of construction and demolition debris',
            'per_cubic_yard', 11.2000, 'CD', 'collection', (v_base - 6), 4,
            'accepted', v_admin, (v_base - 5))
    RETURNING id INTO v_li_cd;

    INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                     description, unit_type_code, unit_price,
                                     debris_type_code, service_category,
                                     effective_from, source_page, status,
                                     reviewed_by, reviewed_at)
    VALUES (v_contract, 3, '2.01',
            'Stump removal and disposal, 24 inch diameter and above',
            'per_unit', 185.0000, 'STUMP', 'tree_work', (v_base - 6), 5,
            'accepted', v_admin, (v_base - 5))
    RETURNING id INTO v_li_stump;

    INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                     description, unit_type_code, unit_price,
                                     debris_type_code, service_category,
                                     effective_from, source_page, status)
    VALUES (v_contract, 4, '2.02',
            'Hanger removal from the public right of way, per hanger',
            'per_unit', 78.0000, 'HANGER', 'tree_work', (v_base - 6), 5, 'draft'),
           (v_contract, 5, '3.01',
            'Standby time for idle equipment at the direction of the client',
            'per_equip_hour', 95.0000, NULL, 'standby', (v_base - 6), 6, 'rejected');

    INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                     description, unit_type_code, unit_price,
                                     debris_type_code, service_category,
                                     effective_from, source_page, status,
                                     reviewed_by, reviewed_at)
    VALUES (v_contract_sub, 1, '1.01',
            'Haul out from a debris management site to final disposal',
            'per_cubic_yard', 6.7500, 'MIXED', 'haul_out', (v_base - 4), 3,
            'accepted', v_admin, (v_base - 3))
    RETURNING id INTO v_li_haul;

    -- ------------------------------------------------------ scope and estimates
    INSERT INTO project_scopes (project_id, debris_type_code, is_enabled,
                                confirmed_by, confirmed_on, notes) VALUES
        (v_project, 'VEG',    true,  v_admin, (v_base - 2), 'Curbside vegetative, county wide.'),
        (v_project, 'CD',     true,  v_admin, (v_base - 2), 'Structural debris from the damage track.'),
        (v_project, 'WHITE',  true,  v_admin, (v_base - 2), 'White goods, refrigerant recovery by the prime.'),
        (v_project, 'HANGER', true,  v_admin, (v_base - 2), 'Tree crews authorised on the ROW.'),
        (v_project, 'LEANER', true,  v_admin, (v_base - 2), 'Tree crews authorised on the ROW.'),
        (v_project, 'STUMP',  false, v_admin, (v_base - 2), 'Not authorised. Client is still deciding.');

    INSERT INTO project_estimates (project_id, debris_type_code, estimated_quantity,
                                   unit_type_code, source, confidence, as_of_date,
                                   notes, created_by) VALUES
        (v_project, 'VEG', 380000 + (p_seq * 7000), 'per_cubic_yard', 'client',
         'client_provided', (v_base - 2), 'Client estimate at kickoff.', v_admin),
        (v_project, 'CD', 80000 + (p_seq * 2500), 'per_cubic_yard', 'field_survey',
         'surveyed', (v_base + 9), 'Revised after the week two survey.', v_admin),
        (v_project, 'WHITE', 900 + (p_seq * 40), 'per_unit', 'client', 'rough',
         (v_base - 2), 'Appliance count, rough.', v_admin);

    -- ----------------------------------------------------------------- zones
    INSERT INTO project_zones (project_id, zone_code, name) VALUES
        (v_project, '001', v_word || ' North'),
        (v_project, '002', v_word || ' Central'),
        (v_project, '003', v_word || ' South');
    SELECT array_agg(id ORDER BY zone_code) INTO v_zone
      FROM project_zones WHERE project_id = v_project;

    -- ---------------------------------------------------------- ticket types
    SELECT id INTO v_tt_load     FROM ticket_types WHERE code = 'LOAD';
    SELECT id INTO v_tt_haul     FROM ticket_types WHERE code = 'HAULOUT';
    SELECT id INTO v_tt_unit     FROM ticket_types WHERE code = 'UNIT';
    SELECT id INTO v_tt_incident FROM ticket_types WHERE code = 'INCIDENT';

    INSERT INTO project_ticket_types (project_id, ticket_type_id) VALUES
        (v_project, v_tt_load), (v_project, v_tt_haul),
        (v_project, v_tt_unit), (v_project, v_tt_incident);

    -- ----------------------------------------------------------- assignments
    -- The instance admin and analyst are on every demo project on purpose:
    -- signing in as admin and finding twenty projects is the whole point of
    -- building twenty.
    INSERT INTO project_assignments (project_id, user_id, project_role,
                                     contractor_id, can_create_tickets,
                                     can_review_tickets) VALUES
        (v_project, v_admin,   'admin',   v_monitor_firm, true,  true),
        (v_project, v_manager, 'manager', v_monitor_firm, true,  true);
    IF v_analyst IS NOT NULL THEN
        INSERT INTO project_assignments (project_id, user_id, project_role,
                                         contractor_id, can_create_tickets,
                                         can_review_tickets)
        VALUES (v_project, v_analyst, 'analyst', v_monitor_firm, false, true);
    END IF;
    INSERT INTO project_assignments (project_id, user_id, project_role,
                                     contractor_id, can_create_tickets,
                                     can_review_tickets)
    SELECT v_project, u, 'monitor', v_monitor_firm, true, false
      FROM unnest(v_mon) u;

    -- ---------------------------------------------------------------- trucks
    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make,
                           model, model_year, capacity_cy, tare_weight_lbs,
                           certified_on, placard_code, barcode)
    SELECT v_prefix || '-T' || lpad(n::text, 3, '0'), v_prime, 'truck',
           'DemoTruck', 'Model A', 2019 + (n % 5),
           (30 + (n * 7) % 70)::numeric, 22000 + (n * 130), (v_base - 2),
           'P-' || v_nn || lpad(n::text, 3, '0'),
           v_prefix || 'T' || lpad(n::text, 3, '0') || 'BC'
      FROM generate_series(1, 14) n;

    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make,
                           model, model_year, capacity_cy, tare_weight_lbs,
                           certified_on, placard_code, barcode)
    SELECT v_prefix || '-S' || lpad(n::text, 3, '0'), v_sub, 'truck',
           'DemoTruck', 'Model B', 2020 + (n % 4),
           (60 + (n * 9) % 50)::numeric, 26000 + (n * 90), (v_base - 2),
           'S-' || v_nn || lpad(n::text, 3, '0'),
           v_prefix || 'S' || lpad(n::text, 3, '0') || 'BC'
      FROM generate_series(1, 6) n;

    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make,
                           certified_on)
    VALUES (v_prefix || '-CREW-A', v_prime, 'crew', 'Bucket + Chipper', (v_base - 2)),
           (v_prefix || '-CREW-B', v_prime, 'crew', 'Grapple + Grinder', (v_base - 2));

    INSERT INTO project_equipment_certifications (
        project_id, equipment_id, certification_number, certified_capacity_cy,
        tare_weight_lbs, method, measured_on, applies_from, expires_on,
        measured_by, measured_by_name, created_by)
    SELECT v_project, e.id, e.placard_code, e.capacity_cy, e.tare_weight_lbs,
           'physical', v_base - 2, v_base - 2, v_base + 300,
           v_manager, v_word || ' Manager', v_manager
      FROM equipment e
     WHERE e.contractor_id IN (v_prime, v_sub) AND e.capacity_cy IS NOT NULL;

    -- ------------------------------------------------- service codes and rates
    INSERT INTO service_codes (project_id, code, name, contractor_id,
                               fema_category, description, contract_id,
                               contract_line_item_id)
    VALUES (v_project, 'ROW-VEG', 'ROW Vegetative Collection', v_prime, 'A',
            'Curbside vegetative debris hauled to a DMS.', v_contract, v_li_veg)
    RETURNING id INTO v_sc_veg;

    INSERT INTO service_codes (project_id, code, name, contractor_id,
                               fema_category, description, contract_id,
                               contract_line_item_id)
    VALUES (v_project, 'ROW-CD', 'ROW Construction and Demolition', v_prime, 'A',
            'Curbside C&D debris hauled to a DMS.', v_contract, v_li_cd)
    RETURNING id INTO v_sc_cd;

    INSERT INTO service_codes (project_id, code, name, contractor_id,
                               fema_category, description, contract_id,
                               contract_line_item_id)
    VALUES (v_project, 'HAUL-FDS', 'Haul Out to Final Disposal', v_sub, 'A',
            'Reduced debris hauled from a DMS to final disposal.',
            v_contract_sub, v_li_haul)
    RETURNING id INTO v_sc_haul;

    INSERT INTO service_codes (project_id, code, name, contractor_id,
                               fema_category, description, contract_id,
                               contract_line_item_id)
    VALUES (v_project, 'STUMP', 'Hazardous Stump Removal', v_prime, 'B',
            'Banded removal of hazardous stumps.', v_contract, v_li_stump)
    RETURNING id INTO v_sc_stump;

    INSERT INTO service_codes (project_id, code, name, contractor_id,
                               fema_category, description, contract_id)
    VALUES (v_project, 'HHW', 'Household Hazardous Waste Handling', v_prime, 'B',
            'Segregation, packaging and disposal of household hazardous waste.',
            v_contract)
    RETURNING id INTO v_sc_haz;

    UPDATE contract_line_items SET accepted_service_code_id = v_sc_veg   WHERE id = v_li_veg;
    UPDATE contract_line_items SET accepted_service_code_id = v_sc_cd    WHERE id = v_li_cd;
    UPDATE contract_line_items SET accepted_service_code_id = v_sc_stump WHERE id = v_li_stump;
    UPDATE contract_line_items SET accepted_service_code_id = v_sc_haul  WHERE id = v_li_haul;

    INSERT INTO contract_line_item_decisions
        (project_id, contract_line_item_id, status, service_code_id,
         reviewed_by, reviewed_at)
    VALUES (v_project, v_li_veg,   'accepted', v_sc_veg,   v_admin, (v_base - 5)),
           (v_project, v_li_cd,    'accepted', v_sc_cd,    v_admin, (v_base - 5)),
           (v_project, v_li_stump, 'accepted', v_sc_stump, v_admin, (v_base - 5)),
           (v_project, v_li_haul,  'accepted', v_sc_haul,  v_admin, (v_base - 3));

    INSERT INTO contract_line_item_decisions
        (project_id, contract_line_item_id, status, reviewed_by, reviewed_at, notes)
    SELECT v_project, li.id, 'rejected', v_admin, (v_base - 5),
           'Not billable on this declaration.'
      FROM contract_line_items li
     WHERE li.contract_id = v_contract AND li.status = 'rejected';

    UPDATE service_codes SET quantity_mode = 'tiered' WHERE id = v_sc_stump;

    INSERT INTO rates (service_code_id, amount, unit_type, effective_from,
                       tier_source, notes) VALUES
        (v_sc_veg,   9.4500, 'per_cubic_yard', v_base, NULL, 'Base contract rate'),
        (v_sc_cd,   11.2500, 'per_cubic_yard', v_base, NULL, 'Base contract rate'),
        (v_sc_haul,  4.7500, 'per_cubic_yard', v_base, NULL, 'Haul out to final disposal'),
        (v_sc_stump, 0.0000, 'per_unit',       v_base, 'stump_diameter_inches',
         'Banded by diameter. The bands carry the price.'),
        (v_sc_haz, 285.0000, 'per_each',       v_base, NULL, 'Flat per HHW load');

    INSERT INTO rate_tiers (rate_id, label, from_value, to_value, amount, sort_order)
    SELECT r.id, t.label, t.from_value, t.to_value, t.amount, t.sort_order
      FROM rates r,
           (VALUES ('6 to 12 inches',      6,  12,   45.0000, 10),
                   ('12 to 24 inches',    12,  24,  120.0000, 20),
                   ('24 to 36 inches',    24,  36,  260.0000, 30),
                   ('36 inches and over', 36, NULL, 400.0000, 40))
             AS t(label, from_value, to_value, amount, sort_order)
     WHERE r.service_code_id = v_sc_stump;

    -- ----------------------------------------------------------------- rules
    INSERT INTO rules (project_id, ticket_type_id, name, description,
                       service_code_id, contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'ROW Vegetative Load',
            'Vegetative debris collected by the prime and delivered to a DMS.',
            v_sc_veg, v_contract, 'all', 10, COALESCE(v_analyst, v_admin))
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code,
                                 value, value_label) VALUES
        (v_rule, 1, 'contractor',  'eq', to_jsonb(v_prime::text),
         'DEMO Prime ' || v_nn || ' - ' || v_word || ' Hauling Group'),
        (v_rule, 2, 'debris_type', 'in', '["VEG","STUMP","HANGER","LEANER"]'::jsonb,
         'Vegetative debris'),
        (v_rule, 3, 'site_kind',   'in', '["DMS","TDSRS"]'::jsonb, 'Debris management site'),
        (v_rule, 4, 'cubic_yards', 'gt', '0'::jsonb, 'greater than 0 CY');

    INSERT INTO rules (project_id, ticket_type_id, name, description,
                       service_code_id, contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'ROW C&D Load',
            'Construction and demolition debris collected by the prime.',
            v_sc_cd, v_contract, 'all', 20, COALESCE(v_analyst, v_admin))
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code,
                                 value, value_label) VALUES
        (v_rule, 1, 'contractor',  'eq', to_jsonb(v_prime::text),
         'DEMO Prime ' || v_nn || ' - ' || v_word || ' Hauling Group'),
        (v_rule, 2, 'debris_type', 'in', '["CD","MIXED"]'::jsonb, 'C&D or mixed'),
        (v_rule, 3, 'cubic_yards', 'gt', '0'::jsonb, 'greater than 0 CY');

    INSERT INTO rules (project_id, ticket_type_id, name, description,
                       service_code_id, contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'ROW HHW Volume',
            'Volume rate for the household hazardous waste portion of a load.',
            v_sc_cd, v_contract, 'all', 25, COALESCE(v_analyst, v_admin))
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code,
                                 value, value_label) VALUES
        (v_rule, 1, 'debris_type', 'eq', '"HHW"'::jsonb, 'Household Hazardous Waste'),
        (v_rule, 2, 'cubic_yards', 'gt', '0'::jsonb, 'greater than 0 CY');

    INSERT INTO rules (project_id, ticket_type_id, name, description,
                       service_code_id, contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_load, 'HHW Segregation Surcharge',
            'Flat handling fee whenever a load contains household hazardous waste.',
            v_sc_haz, v_contract, 'all', 30, COALESCE(v_analyst, v_admin))
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code,
                                 value, value_label) VALUES
        (v_rule, 1, 'debris_type', 'eq', '"HHW"'::jsonb, 'Household Hazardous Waste');

    INSERT INTO rules (project_id, ticket_type_id, name, description,
                       service_code_id, contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_haul, 'Haul Out to Final Disposal',
            'Subcontractor haul out from a DMS to the final disposal site.',
            v_sc_haul, v_contract_sub, 'all', 10, COALESCE(v_analyst, v_admin))
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code,
                                 value, value_label) VALUES
        (v_rule, 1, 'site_kind', 'eq', '"FDS"'::jsonb, 'Final disposal site'),
        (v_rule, 2, 'distance',  'gt', '5'::jsonb, 'more than 5 miles');

    INSERT INTO rules (project_id, ticket_type_id, name, description,
                       service_code_id, contract_id, match_mode, priority, created_by)
    VALUES (v_project, v_tt_unit, 'Hazardous Stump 24in and Over',
            'Banded removal for stumps of 24 inches or more.',
            v_sc_stump, v_contract, 'all', 10, COALESCE(v_analyst, v_admin))
    RETURNING id INTO v_rule;
    INSERT INTO rule_statements (rule_id, sequence, operand_code, operator_code,
                                 value, value_label) VALUES
        (v_rule, 1, 'stump_diameter', 'gte', '24'::jsonb, 'at least 24 inches');

    RETURN v_project;
END
$build$;

-- =============================================================================
-- The ticket writer.
--
-- A procedure rather than a function because it commits as it goes. A million
-- tickets in one transaction is a million rows of WAL held open, no visible
-- progress, and everything lost if the connection drops at 90 percent. Batched
-- and committed, a run that dies leaves what it already wrote.
-- =============================================================================
CREATE OR REPLACE PROCEDURE adms_demo_fill_tickets(
    p_project uuid, p_target integer, p_batch integer DEFAULT 2000)
LANGUAGE plpgsql
AS $fill$
DECLARE
    c_streets text[] := ARRAY[
        'Anvil Ridge Road','Cinder Hollow Lane','Windrow Drive','Gale Point Road',
        'Squall Street','Driftwood Avenue','Thunder Gap Road','Hailstone Court',
        'Leeward Lane','Stormwatch Boulevard','Rainshadow Road','Tempest Trail'];

    v_code      text;
    v_city      text;
    v_admin     uuid;
    v_base      date;
    v_tt_load   uuid;
    v_prime     uuid;
    v_contract  uuid;
    v_trucks    uuid[];
    v_monitors  uuid[];
    v_zones     uuid[];
    v_sites     uuid[];
    v_debris    text[];
    v_done      integer := 0;
    v_priced    integer := 0;
    v_ids       uuid[];
    v_id        uuid;
    v_cursor    uuid;
    v_started   timestamptz := clock_timestamp();
    v_elapsed   numeric;
BEGIN
    SELECT p.project_code, p.starts_on, COALESCE(c.city, 'Demo City')
      INTO v_code, v_base, v_city
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.id = p_project;

    SELECT id INTO v_admin FROM users WHERE username = 'admin';

    SELECT tt.id INTO v_tt_load
      FROM ticket_types tt
      JOIN project_ticket_types ptt ON ptt.ticket_type_id = tt.id
     WHERE ptt.project_id = p_project AND ptt.is_active AND tt.code = 'LOAD'
     LIMIT 1;

    SELECT pc.contractor_id INTO v_prime
      FROM project_contractors pc
     WHERE pc.project_id = p_project AND pc.role_on_project = 'prime' LIMIT 1;

    SELECT contract_id INTO v_contract
      FROM project_contracts WHERE project_id = p_project AND is_primary LIMIT 1;

    -- Everything below is drawn from what the project already has, so a ticket
    -- generated here resolves a certification and matches a rule exactly as one
    -- created in the field would.
    SELECT array_agg(pec.equipment_id) INTO v_trucks
      FROM project_equipment_certifications pec
      JOIN equipment e ON e.id = pec.equipment_id
     WHERE pec.project_id = p_project AND pec.status = 'active'
       AND e.contractor_id = v_prime;

    SELECT array_agg(pa.user_id) INTO v_monitors
      FROM project_assignments pa
     WHERE pa.project_id = p_project AND pa.is_active AND pa.can_create_tickets;

    SELECT array_agg(id) INTO v_zones
      FROM project_zones WHERE project_id = p_project AND is_active;

    SELECT array_agg(ps.site_id) INTO v_sites
      FROM project_sites ps
      JOIN disposal_sites ds ON ds.id = ps.site_id
     WHERE ps.project_id = p_project AND ps.is_active AND ds.is_active
       AND ds.site_kind IN ('DMS', 'TDSRS');

    -- Weighted the way the project actually runs rather than one slot per
    -- enabled stream. An even split would put a third of the volume on white
    -- goods, which no rule prices on a load ticket, and the money screens would
    -- then be exercised against a project that does not look like this one.
    v_debris := ARRAY['VEG','VEG','VEG','CD','VEG','MIXED','CD','VEG','HHW','VEG'];

    IF v_trucks IS NULL OR v_monitors IS NULL OR v_sites IS NULL
       OR v_tt_load IS NULL THEN
        RAISE EXCEPTION
            'Project % is missing something this seed builds on: trucks %, '
            'monitors %, sites %, load ticket type %',
            v_code, v_trucks IS NOT NULL, v_monitors IS NOT NULL,
            v_sites IS NOT NULL, v_tt_load IS NOT NULL
            USING ERRCODE = 'check_violation';
    END IF;

    -- Session settings, not SET LOCAL: this procedure commits, and a LOCAL
    -- setting would not survive the first one.
    PERFORM set_config('adms.enforce_gate', 'on', false);
    PERFORM set_config('adms.actor_name', 'volume seed', false);
    PERFORM set_config('adms.actor_role', 'admin', false);
    PERFORM set_config('adms.source', 'import', false);
    PERFORM set_config('adms.actor_id', v_admin::text, false);

    RAISE NOTICE '  % : writing % ticket(s)', v_code, p_target;

    -- Tickets are written set-based, a batch per statement. The per-row triggers
    -- still run, which is the point: ticket numbering, the readiness gate and
    -- the audit trail are all exercised at volume rather than bypassed.
    WHILE v_done < p_target LOOP
        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, equipment_id,
            contract_id, zone_id, driver_name, barcode, debris_type,
            origin_house_number, origin_street, origin_city, origin_state,
            origin_latitude, origin_longitude, origin_at,
            destination_site_id, destination_latitude, destination_longitude,
            destination_at, load_call_pct, certified_capacity_cy,
            created_by, completed_by, completed_at, source, data
        )
        SELECT
            p_project, v_tt_load, 'completed', v_prime, e.id, v_contract,
            CASE WHEN v_zones IS NULL THEN NULL
                 ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
            'Driver ' || (100 + (n % 240)),
            e.barcode,
            v_debris[1 + (n % array_length(v_debris, 1))],
            (1000 + (n % 900) * 7)::text,
            c_streets[1 + (n % array_length(c_streets, 1))],
            v_city, 'XX',
            ds.latitude + 0.05 + ((n % 97) * 0.00041),
            ds.longitude - 0.05 - ((n % 89) * 0.00037),
            stamp,
            ds.id, ds.latitude, ds.longitude,
            stamp + INTERVAL '47 minutes',
            -- A spread of load calls, including the full calls the review
            -- detector is meant to find at this volume.
            (ARRAY[40, 50, 60, 70, 75, 80, 90, 100])[1 + (n % 8)],
            pec.certified_capacity_cy,
            m.user_id, m.user_id,
            stamp + INTERVAL '47 minutes',
            'field_app',
            jsonb_build_object('load_call_source', 'visual', 'generated', true)
        FROM generate_series(v_done + 1, LEAST(v_done + p_batch, p_target)) AS n
        CROSS JOIN LATERAL (
            SELECT (v_base + ((n % 120)))::timestamp
                   + TIME '07:30' + ((n % 11) * INTERVAL '43 minutes') AS stamp
        ) t
        CROSS JOIN LATERAL (
            SELECT eq.id, eq.barcode
              FROM equipment eq
             WHERE eq.id = v_trucks[1 + (n % array_length(v_trucks, 1))]
        ) e
        CROSS JOIN LATERAL (
            SELECT s.id, s.latitude, s.longitude
              FROM disposal_sites s
             WHERE s.id = v_sites[1 + (n % array_length(v_sites, 1))]
        ) ds
        CROSS JOIN LATERAL (
            SELECT pec2.certified_capacity_cy
              FROM project_equipment_certifications pec2
             WHERE pec2.project_id = p_project AND pec2.equipment_id = e.id
               AND pec2.status = 'active'
        ) pec
        CROSS JOIN LATERAL (
            SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id
        ) m;

        v_done := LEAST(v_done + p_batch, p_target);
        COMMIT;

        IF v_done % 20000 = 0 OR v_done = p_target THEN
            RAISE NOTICE '    % of % written (%s elapsed)', v_done, p_target,
                round(EXTRACT(epoch FROM clock_timestamp() - v_started));
        END IF;
    END LOOP;

    -- Pricing. One engine pass per ticket, because that is what the engine does
    -- and a shortcut here would leave the money screens showing numbers no rule
    -- produced. Batched into arrays rather than a cursor loop, so the commit
    -- between batches is legal and the work already done is kept.
    --
    -- Paged by id, not by "what is still unpriced". Pricing does not always end
    -- at 'processed': a ticket the rules do not match finishes as 'no_match'
    -- and one the rules exclude as 'excluded', both of them correct outcomes.
    -- Asking again for everything that is not 'processed' would hand back the
    -- same rows on the next pass, forever. Walking ids once terminates whatever
    -- the engine decides.
    v_cursor := '00000000-0000-0000-0000-000000000000'::uuid;
    LOOP
        SELECT array_agg(id ORDER BY id) INTO v_ids FROM (
            SELECT id FROM tickets
             WHERE project_id = p_project AND status = 'completed'
               AND NOT is_void AND processing_state <> 'processed'
               AND id > v_cursor
             ORDER BY id
             LIMIT p_batch) s;
        EXIT WHEN v_ids IS NULL;
        v_cursor := v_ids[array_length(v_ids, 1)];

        FOREACH v_id IN ARRAY v_ids LOOP
            PERFORM adms_process_ticket(v_id, v_admin);
            v_priced := v_priced + 1;
        END LOOP;
        COMMIT;

        IF v_priced % 20000 < p_batch THEN
            RAISE NOTICE '    % ticket(s) priced (%s elapsed)', v_priced,
                round(EXTRACT(epoch FROM clock_timestamp() - v_started));
        END IF;
    END LOOP;

    v_elapsed := round(EXTRACT(epoch FROM clock_timestamp() - v_started));
    RAISE NOTICE '  % : % written, % priced, %s',
        v_code, v_done, v_priced, v_elapsed;
END
$fill$;

-- =============================================================================
-- The rest of a project's working day.
--
-- Haul outs, unit rate work, incidents, a draft invoice and a morning's worth
-- of review flags. Small fixed counts: the volume above is what makes the lists
-- long, and this is what stops every generated project from being nothing but
-- load tickets.
-- =============================================================================
CREATE OR REPLACE PROCEDURE adms_demo_finish_project(p_project uuid)
LANGUAGE plpgsql
AS $finish$
DECLARE
    v_admin uuid; v_manager uuid; v_manager_name text;
    v_base date;
    v_prime uuid; v_sub uuid;
    v_contract uuid; v_contract_sub uuid;
    v_dms uuid; v_fds uuid;
    v_zones uuid[]; v_monitors uuid[];
    v_tt_haul uuid; v_tt_unit uuid; v_tt_incident uuid;
    v_crew uuid; v_truck uuid; v_cap numeric; v_call numeric;
    v_ticket uuid; v_invoice uuid; v_line integer := 0;
    v_day date; i integer;
BEGIN
    SELECT starts_on INTO v_base FROM projects WHERE id = p_project;
    SELECT id INTO v_admin FROM users WHERE username = 'admin';

    SELECT pa.user_id, u.full_name INTO v_manager, v_manager_name
      FROM project_assignments pa JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id = p_project AND pa.project_role = 'manager' LIMIT 1;

    SELECT contractor_id INTO v_prime FROM project_contractors
     WHERE project_id = p_project AND role_on_project = 'prime' LIMIT 1;
    SELECT contractor_id INTO v_sub FROM project_contractors
     WHERE project_id = p_project AND role_on_project = 'sub_tier_1' LIMIT 1;

    SELECT contract_id INTO v_contract FROM project_contracts
     WHERE project_id = p_project AND is_primary LIMIT 1;
    SELECT contract_id INTO v_contract_sub FROM project_contracts
     WHERE project_id = p_project AND NOT is_primary LIMIT 1;

    SELECT ps.site_id INTO v_dms FROM project_sites ps
      JOIN disposal_sites d ON d.id = ps.site_id
     WHERE ps.project_id = p_project AND d.site_kind = 'DMS'
     ORDER BY d.site_code LIMIT 1;
    SELECT ps.site_id INTO v_fds FROM project_sites ps
      JOIN disposal_sites d ON d.id = ps.site_id
     WHERE ps.project_id = p_project AND d.site_kind = 'FDS' LIMIT 1;

    SELECT array_agg(id ORDER BY zone_code) INTO v_zones
      FROM project_zones WHERE project_id = p_project;
    SELECT array_agg(pa.user_id) INTO v_monitors
      FROM project_assignments pa
     WHERE pa.project_id = p_project AND pa.project_role = 'monitor';

    SELECT id INTO v_tt_haul     FROM ticket_types WHERE code = 'HAULOUT';
    SELECT id INTO v_tt_unit     FROM ticket_types WHERE code = 'UNIT';
    SELECT id INTO v_tt_incident FROM ticket_types WHERE code = 'INCIDENT';

    SELECT id INTO v_crew FROM equipment
     WHERE contractor_id = v_prime AND equipment_type = 'crew'
     ORDER BY unit_number LIMIT 1;

    PERFORM set_config('adms.enforce_gate', 'on', false);
    PERFORM set_config('adms.actor_name', 'volume seed', false);
    PERFORM set_config('adms.actor_role', 'admin', false);
    PERFORM set_config('adms.source', 'import', false);
    PERFORM set_config('adms.actor_id', v_admin::text, false);

    -- ------------------------------------------------------------ haul outs
    FOR i IN 1..24 LOOP
        v_day := (v_base + 3) + ((i - 1) * 21 / 24);
        SELECT e.id, pec.certified_capacity_cy INTO v_truck, v_cap
          FROM equipment e
          JOIN project_equipment_certifications pec
            ON pec.equipment_id = e.id AND pec.project_id = p_project
           AND pec.status = 'active'
         WHERE e.contractor_id = v_sub AND e.equipment_type = 'truck'
         ORDER BY e.unit_number OFFSET (i % 6) LIMIT 1;
        CONTINUE WHEN v_truck IS NULL;
        v_call := 75 + ((i * 7) % 26);

        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, equipment_id,
            contract_id, driver_name, debris_type, origin_site_id,
            origin_at, destination_site_id, destination_at,
            load_call_pct, certified_capacity_cy,
            created_by, completed_by, completed_at, source
        ) VALUES (
            p_project, v_tt_haul, 'completed', v_sub, v_truck, v_contract_sub,
            'Hauler ' || (200 + i),
            CASE WHEN i % 3 = 0 THEN 'CD' ELSE 'VEG' END,
            v_dms, (v_day + TIME '09:15') + (i % 3) * INTERVAL '95 minutes',
            v_fds, (v_day + TIME '10:05') + (i % 3) * INTERVAL '95 minutes',
            v_call, v_cap,
            v_monitors[1 + (i % array_length(v_monitors, 1))],
            v_monitors[1 + ((i + 2) % array_length(v_monitors, 1))],
            (v_day + TIME '10:05') + (i % 3) * INTERVAL '95 minutes',
            'field_app'
        ) RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, site_id, load_call_pct, occurred_at)
        VALUES (v_ticket, 'haul_out_start', 1, 'complete',
                v_monitors[1 + (i % array_length(v_monitors, 1))], v_dms, v_call,
                (v_day + TIME '09:15')),
               (v_ticket, 'haul_out_complete', 2, 'complete',
                v_monitors[1 + ((i + 2) % array_length(v_monitors, 1))], v_fds,
                NULL, (v_day + TIME '10:05'));

        INSERT INTO ticket_media (ticket_id, stage_code, slot, media_kind,
                                  description, storage_url, is_primary, captured_at)
        VALUES (v_ticket, 'haul_out_start', 'origin_photo', 'photo',
                'Bed photo at the DMS', '/media/demo/haul.svg', true,
                (v_day + TIME '09:18'));
    END LOOP;

    -- ------------------------------------------------------ unit rate work
    FOR i IN 1..12 LOOP
        v_day := (v_base + 6) + ((i - 1) * 20 / 12);
        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, contract_id,
            crew_id, zone_id, debris_type, quantity, quantity_unit,
            origin_street, origin_city, origin_state, origin_at,
            created_by, completed_by, completed_at, source, data, notes
        ) VALUES (
            p_project, v_tt_unit, 'completed', v_prime, v_contract, v_crew,
            v_zones[1 + (i % array_length(v_zones, 1))], 'STUMP', 1, 'per_each',
            (ARRAY['Leeward Lane','Stormwatch Boulevard','Rainshadow Road',
                   'Tempest Trail'])[1 + (i % 4)],
            (SELECT COALESCE(c.city, 'Demo City') FROM projects p
               LEFT JOIN clients c ON c.id = p.client_id WHERE p.id = p_project),
            'XX',
            (v_day + TIME '10:00') + (i % 3) * INTERVAL '75 minutes',
            v_monitors[1 + (i % array_length(v_monitors, 1))],
            v_monitors[1 + (i % array_length(v_monitors, 1))],
            (v_day + TIME '11:10') + (i % 3) * INTERVAL '75 minutes',
            'field_app',
            jsonb_build_object('unit_work_type', 'Stump Removal',
                               'stump_diameter_inches', 18 + (i * 4)),
            'Hazardous stump removed from the right of way.'
        ) RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, occurred_at)
        VALUES (v_ticket, 'work', 1, 'complete',
                v_monitors[1 + (i % array_length(v_monitors, 1))],
                (v_day + TIME '10:05'));

        INSERT INTO ticket_media (ticket_id, stage_code, slot, media_kind,
                                  description, storage_url, is_primary, captured_at)
        VALUES (v_ticket, 'work', 'before_photo', 'photo', 'Before',
                '/media/demo/stump-before.svg', true, (v_day + TIME '10:02'));
    END LOOP;

    -- -------------------------------------------------------- incidents
    FOR i IN 1..6 LOOP
        v_day := (v_base + 2) + (i * 4);
        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id,
            incident_category_id, severity, is_ongoing, zone_id,
            origin_street, origin_state, origin_at,
            created_by, completed_by, completed_at, source, notes
        ) VALUES (
            p_project, v_tt_incident, 'completed', v_prime,
            (SELECT id FROM incident_categories ORDER BY code OFFSET (i % 14) LIMIT 1),
            (ARRAY['low','medium','high','critical','medium','low'])[i],
            (i % 3 = 0), v_zones[1 + (i % array_length(v_zones, 1))],
            (ARRAY['Windrow Drive','Gale Point Road','Squall Street'])[1 + (i % 3)],
            'XX', (v_day + TIME '13:20'),
            v_monitors[1 + (i % array_length(v_monitors, 1))],
            v_monitors[1 + (i % array_length(v_monitors, 1))],
            (v_day + TIME '13:45'), 'field_app',
            (ARRAY[
              'Grapple truck clipped a mailbox at the curb line. Owner notified.',
              'Low hanging utility line over the route. Segment paused.',
              'Paint cans in the ROW pile. Segregated for HHW handling.',
              'Loader hydraulic line failure. Unit removed from service.',
              'Near miss with a passing vehicle. Cones repositioned.',
              'Ineligible commercial debris at the curb. Documented, left in place.'
            ])[i]
        ) RETURNING id INTO v_ticket;

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, occurred_at)
        VALUES (v_ticket, 'report', 1, 'complete',
                v_monitors[1 + (i % array_length(v_monitors, 1))],
                (v_day + TIME '13:20'));
    END LOOP;

    -- One void, so the void path is represented on every project.
    SELECT id INTO v_ticket FROM tickets
     WHERE project_id = p_project AND status = 'completed' AND NOT is_void
     ORDER BY created_at LIMIT 1;
    IF v_ticket IS NOT NULL THEN
        UPDATE tickets SET is_void = true,
               void_reason = 'Duplicate scan at the DMS gate',
               voided_by = COALESCE(v_manager, v_admin)
         WHERE id = v_ticket;
    END IF;

    -- Price whatever the tail above added.
    FOR v_ticket IN
        SELECT id FROM tickets
         WHERE project_id = p_project AND status = 'completed' AND NOT is_void
           AND processing_state <> 'processed'
         ORDER BY created_at
    LOOP
        PERFORM adms_process_ticket(v_ticket, v_admin);
    END LOOP;

    -- ------------------------------------------------------- draft invoice
    INSERT INTO invoices (invoice_number, project_id, contractor_id, contract_id,
                          status, period_start, period_end, notes, created_by)
    VALUES (adms_next_number('invoice', 'INV-'),
            p_project, v_prime, v_contract, 'draft', v_base, (v_base + 6),
            'First weekly billing period, ROW collection.',
            COALESCE(v_manager, v_admin))
    RETURNING id INTO v_invoice;

    FOR v_ticket IN
        SELECT tx.id FROM transactions tx
          JOIN tickets t ON t.id = tx.ticket_id
         WHERE tx.project_id = p_project AND tx.contractor_id = v_prime
           AND NOT tx.is_reversal AND tx.superseded_at IS NULL
           AND t.completed_at::date BETWEEN v_base AND (v_base + 2)
         ORDER BY tx.computed_at
         LIMIT 250
    LOOP
        v_line := v_line + 1;
        INSERT INTO invoice_lines (invoice_id, transaction_id, line_number, amount)
        SELECT v_invoice, v_ticket, v_line, amount FROM transactions WHERE id = v_ticket;
    END LOOP;

    -- --------------------------------------------------- a morning's review
    -- A sample, not the whole project. Running the detector over a hundred
    -- thousand tickets would take longer than writing them and would not make
    -- the review queue any more instructive than two hundred does.
    PERFORM adms_flag_ticket(id)
       FROM (SELECT id FROM tickets
              WHERE project_id = p_project AND deleted_at IS NULL AND NOT is_void
              ORDER BY created_at LIMIT 200) s;

    INSERT INTO project_review_policy (project_id, overdue_days, repeat_count,
                                       repeat_window_days, escalate_to_user)
    VALUES (p_project, 3, 3, 7, COALESCE(v_manager, v_admin))
    ON CONFLICT (project_id) DO NOTHING;

    FOR v_ticket IN
        SELECT q.subject_id FROM review_queue q
         WHERE q.project_id = p_project AND q.subject_kind = 'ticket'
           AND q.open_flags = 0
         ORDER BY q.occurred_at LIMIT 20
    LOOP
        PERFORM adms_review_item('ticket', v_ticket, p_project,
                                 COALESCE(v_manager, v_admin),
                                 COALESCE(v_manager_name, 'Demo Manager'));
        UPDATE review_items
           SET state = 'approved', reviewed_by = COALESCE(v_manager, v_admin),
               reviewed_by_name = COALESCE(v_manager_name, 'Demo Manager'),
               reviewed_at = now()
         WHERE subject_kind = 'ticket' AND subject_id = v_ticket;
    END LOOP;
END
$finish$;

-- =============================================================================
-- The driver.
-- =============================================================================
CREATE OR REPLACE PROCEDURE adms_demo_volume(p_tickets integer, p_projects integer)
LANGUAGE plpgsql
AS $volume$
DECLARE
    c_max_tickets  constant integer := 1000000;
    c_max_projects constant integer := 50;

    v_next      integer;
    v_new       uuid[] := '{}';
    v_targets   uuid[];
    v_weights   integer[] := '{}';
    v_total_w   integer := 0;
    v_share     integer;
    v_assigned  integer := 0;
    v_project   uuid;
    v_started   timestamptz := clock_timestamp();
    v_before    bigint;
    i           integer;
BEGIN
    IF p_tickets < 1 OR p_tickets > c_max_tickets THEN
        RAISE EXCEPTION 'Ask for between 1 and % tickets, not %',
            c_max_tickets, p_tickets USING ERRCODE = 'check_violation';
    END IF;
    IF p_projects < 0 OR p_projects > c_max_projects THEN
        RAISE EXCEPTION 'Ask for between 0 and % projects, not %',
            c_max_projects, p_projects USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO v_before FROM tickets;

    -- ------------------------------------------------------- build projects
    IF p_projects > 0 THEN
        -- Continue the numbering rather than restarting it, so a second run
        -- adds DEMO-11 upward instead of colliding with DEMO-02.
        SELECT COALESCE(max(NULLIF(regexp_replace(project_code, '^DEMO-(\d+)-.*$', '\1'),
                                   project_code)::integer), 1) + 1
          INTO v_next
          FROM projects WHERE project_code ~ '^DEMO-\d+-';

        RAISE NOTICE 'Building % demo project(s), starting at %.',
            p_projects, lpad(v_next::text, 2, '0');

        FOR i IN 0..(p_projects - 1) LOOP
            v_project := adms_demo_build_project(v_next + i);
            v_new := v_new || v_project;
            COMMIT;
        END LOOP;
        v_targets := v_new;
    ELSE
        -- No new projects asked for, so the tickets go where the demo data
        -- already is.
        SELECT array_agg(id ORDER BY project_code) INTO v_targets
          FROM projects
         WHERE project_code ~ '^DEMO-\d+-' AND deleted_at IS NULL;

        IF v_targets IS NULL THEN
            RAISE EXCEPTION
                'There are no demo projects to fill. Run ./setup.sh --with-demo '
                'first, or ask for projects to be built here.'
                USING ERRCODE = 'no_data_found';
        END IF;
    END IF;

    -- --------------------------------------------------- split the total up
    -- Deterministic weights between 70 and 130, so the projects are not all
    -- exactly the same size and a sort by ticket count means something.
    FOR i IN 1..array_length(v_targets, 1) LOOP
        v_weights := v_weights || (70 + ((i * 37) % 61));
        v_total_w := v_total_w + v_weights[i];
    END LOOP;

    FOR i IN 1..array_length(v_targets, 1) LOOP
        IF i = array_length(v_targets, 1) THEN
            v_share := p_tickets - v_assigned;          -- the remainder
        ELSE
            v_share := GREATEST(1, (p_tickets::numeric * v_weights[i]
                                    / v_total_w)::integer);
            v_share := LEAST(v_share, p_tickets - v_assigned
                                      - (array_length(v_targets, 1) - i));
        END IF;
        EXIT WHEN v_share < 1;
        v_assigned := v_assigned + v_share;

        CALL adms_demo_fill_tickets(v_targets[i], v_share);
        IF v_targets[i] = ANY(v_new) THEN
            CALL adms_demo_finish_project(v_targets[i]);
            COMMIT;
        END IF;
    END LOOP;

    ANALYZE tickets;
    ANALYZE transactions;
    ANALYZE audit_events;

    RAISE NOTICE 'Done. % ticket(s) added across % project(s) in %s.',
        (SELECT count(*) FROM tickets) - v_before,
        array_length(v_targets, 1),
        round(EXTRACT(epoch FROM clock_timestamp() - v_started));
END
$volume$;

CALL adms_demo_volume(:tickets, :projects);

-- The helpers were only ever for this run. Leaving them behind would mean a
-- database seeded with volume no longer matches one built by setup.sh alone.
DROP PROCEDURE IF EXISTS adms_demo_volume(integer, integer);
DROP PROCEDURE IF EXISTS adms_demo_finish_project(uuid);
DROP PROCEDURE IF EXISTS adms_demo_fill_tickets(uuid, integer, integer);
DROP FUNCTION  IF EXISTS adms_demo_build_project(integer);

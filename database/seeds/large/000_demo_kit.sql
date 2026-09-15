-- =============================================================================
-- Open ADMS :: demo kit
--
-- The routines both optional seeds are built from. Loaded first by
-- seed-large.sh and seed-showcase.sh, dropped afterwards by 099_cleanup.sql, so
-- a database that has been seeded still matches one built by setup.sh alone.
--
--   adms_demo_build_project(seq, profile)  one complete project, ready for field
--   adms_demo_write_tickets(project, type, count, ...)  tickets of one type
--   adms_demo_fill_tickets(project, total, batch, mix)  a mix of ticket types
--   adms_demo_price_project(project, batch)             the rules engine pass
--   adms_demo_finish_project(project, profile)          invoice and review work
--
-- The profile is a jsonb bag, every key optional. Left empty it builds the same
-- right-of-way collection project the bulk seed has always built. Filled in, it
-- builds a wildfire PPDR project for a tribal nation, or a waterway project for
-- a state agency, without a second copy of this file existing anywhere.
--
--   storm            VANTAGE           the word every name on the project uses
--   event_kind       Hurricane         Flood, Wildfire, Ice Storm, River Flood
--   event_code       DEMO-DR-101       reuses the disaster when it exists
--   event_name       DEMO Hurricane Vantage
--   place            Coastal           tells two projects on one event apart
--   program          row_collection    any programs.code
--   client_kind      local_government  state_agency, tribal_nation, ...
--   client_label     Vantage County
--   client_of        DEMO-03-VANTAGE   share that project's client instead
--   streams          ["VEG","CD"]      what the client authorised
--   extra_types      ["SURVEY","ROE"]  non-billable types to enable as well
--   status           active            setup, paused, closeout, closed
--   starts_offset    -30               days from today
--   ends_offset      90
--   zones            3
--   trucks           14                prime fleet
--   sub_trucks       6                 haul out fleet
--   monitors         4
--   dms              2                 debris management sites
--   fds              1                 final disposal sites
--   haul_unit        per_cubic_yard    or per_ton, where the site has a scale
--   tm               false             time and material codes and rules
--   rate_change      false             a mid-period rate revision
--   share_contract   DEMO-03-VANTAGE   bill under that project's contract
--   timezone         America/Chicago
--   lat, lon         38.78, -90.34
-- =============================================================================

-- ---------------------------------------------------------------------------
-- One complete, ready-for-the-field project.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_demo_build_project(
    p_seq integer, p_profile jsonb DEFAULT '{}'::jsonb)
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

    v_storm    text;
    v_word     text;
    v_event    text;
    v_place    text;
    v_nn       text;
    v_prefix   text;
    v_code     text;
    v_city     text;
    v_program  text;
    v_prog_lbl text;
    v_status   text;
    v_lat      numeric;
    v_lon      numeric;
    v_base     date;
    v_ends     date;
    v_pw       text;
    v_streams  text[];
    v_types    text[];
    v_extra    text[];
    v_haul_u   text;

    v_instance_key text;
    v_admin uuid; v_analyst uuid; v_manager uuid;
    v_mon uuid[];
    v_client uuid; v_prime uuid; v_sub uuid; v_monitor_firm uuid;
    v_disaster uuid; v_contract uuid; v_contract_sub uuid;
    v_shared uuid;
    v_dms uuid[] := '{}'; v_fds uuid[] := '{}'; v_site uuid;
    v_project uuid;
    v_zone_n integer;
    v_tt uuid;
    v_rule uuid; v_sc uuid; v_li uuid; v_rate uuid;
    v_line integer := 0;
    v_offer record;
    v_stmt jsonb;
    v_n integer;
    i integer;
BEGIN
    v_storm  := upper(COALESCE(p_profile ->> 'storm',
                     CASE WHEN p_seq <= array_length(c_storms, 1)
                          THEN c_storms[p_seq] ELSE 'STORM' || p_seq END));
    v_word   := initcap(v_storm);
    v_event  := COALESCE(p_profile ->> 'event_kind',
                         c_events[1 + (p_seq % array_length(c_events, 1))]);
    v_place  := COALESCE(p_profile ->> 'place', '');
    v_nn     := lpad(p_seq::text, 2, '0');
    v_prefix := 'D' || v_nn;
    v_code   := 'DEMO-' || v_nn || '-' || v_storm;
    v_city   := COALESCE(p_profile ->> 'city',
                         v_word || ' ' || c_places[1 + (p_seq % array_length(c_places, 1))]);
    v_program  := COALESCE(p_profile ->> 'program', 'row_collection');
    v_status   := COALESCE(p_profile ->> 'status', 'active');
    v_haul_u   := COALESCE(p_profile ->> 'haul_unit', 'per_cubic_yard');
    v_base     := current_date + COALESCE((p_profile ->> 'starts_offset')::integer, -30);
    v_ends     := current_date + COALESCE((p_profile ->> 'ends_offset')::integer, 90);

    SELECT label INTO v_prog_lbl FROM programs WHERE code = v_program;
    v_prog_lbl := COALESCE(v_prog_lbl, 'ROW Collection');

    -- Streams the client authorised. Everything downstream, service codes,
    -- rates, rules and the debris mix on the tickets, is derived from this.
    -- ARRAY(SELECT ...) over a missing key returns an empty array, not NULL, so
    -- COALESCE would never see the default. Ask whether the key is there.
    v_streams := CASE WHEN p_profile ? 'streams'
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile -> 'streams'))
                      ELSE ARRAY['VEG','CD','MIXED','WHITE','HHW',
                                 'HANGER','LEANER'] END;
    v_extra   := CASE WHEN p_profile ? 'extra_types'
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_profile -> 'extra_types'))
                      ELSE ARRAY[]::text[] END;

    IF array_length(v_streams, 1) IS NULL THEN
        RAISE EXCEPTION 'Project % was asked for with no debris streams, so there '
                        'is nothing for it to collect.', v_code
            USING ERRCODE = 'check_violation';
    END IF;

    -- Spread across a plausible grid so twenty projects are not stacked on one
    -- point when somebody opens a map.
    v_lat := COALESCE((p_profile ->> 'lat')::numeric,
                      35.0 + (((p_seq - 1) / 5) % 4) * 2.5 + ((p_seq % 5) * 0.2));
    v_lon := COALESCE((p_profile ->> 'lon')::numeric,
                      -95.0 + ((p_seq - 1) % 5) * 2.5);

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
    VALUES (lower(v_storm) || v_nn || 'mgr', lower(v_storm) || v_nn || 'mgr@demo.invalid',
            v_word, 'Manager ' || v_nn, 'DMN-' || v_nn || '-01',
            'DEMO Monitoring ' || v_nn || ' - ' || v_word || ' Monitoring Group',
            'MGR-' || v_nn, 'manager', v_pw)
    RETURNING id INTO v_manager;

    INSERT INTO users (username, email, first_name, last_name, employee_id,
                       employer_name, monitor_id, global_role, password_hash)
    SELECT lower(v_storm) || v_nn || n, lower(v_storm) || v_nn || n || '@demo.invalid',
           v_word, 'Monitor ' || v_nn || '-' || n, 'DMN-' || v_nn || '-1' || n,
           'DEMO Monitoring ' || v_nn || ' - ' || v_word || ' Monitoring Group',
           'MON-' || v_nn || '-' || n, 'monitor', v_pw
      FROM generate_series(1, GREATEST(1, COALESCE((p_profile ->> 'monitors')::integer, 4))) n;

    SELECT array_agg(id ORDER BY username) INTO v_mon
      FROM users
     WHERE username LIKE lower(v_storm) || v_nn || '%' AND global_role = 'monitor';

    -- ------------------------------------------------- client and contractors
    IF p_profile ? 'client_of' THEN
        SELECT client_id INTO v_client FROM projects
         WHERE lower(project_code) = lower(p_profile ->> 'client_of');
    END IF;

    IF v_client IS NULL THEN
        INSERT INTO clients (name, code, client_type, fema_applicant_id,
                             primary_contact, contact_email, contact_phone,
                             address_line1, city, state_code, postal_code)
        VALUES ('DEMO Client ' || v_nn || ' - ' ||
                COALESCE(p_profile ->> 'client_label', v_word || ' County'),
                'DCL' || v_nn,
                COALESCE(p_profile ->> 'client_kind', 'local_government'),
                '000-' || lpad(p_seq::text, 5, '0') || '-00',
                'Avery Client', 'client' || v_nn || '@demo.invalid',
                '(555) 0' || v_nn || '-0001',
                '1 Demo Civic Plaza', v_city, 'XX', lpad(p_seq::text, 5, '0'))
        RETURNING id INTO v_client;

        INSERT INTO contacts (entity_type, entity_id, first_name, last_name, title,
                              email, phone, contact_role, is_primary) VALUES
            ('clients', v_client, 'Avery', 'Client', 'Debris Program Manager',
             'client' || v_nn || '@demo.invalid', '(555) 0' || v_nn || '-0001',
             'primary', true),
            ('clients', v_client, 'Morgan', 'Payable', 'Accounts Payable Supervisor',
             'ap' || v_nn || '@demo.invalid', '(555) 0' || v_nn || '-0002',
             'finance', false);
    END IF;

    -- A project billing under another project's contract works for that
    -- contract's contractor, so it does not get a prime of its own. Looked up
    -- here, before the contractors are created, rather than leaving an orphan
    -- company behind that nobody is assigned to.
    IF p_profile ? 'share_contract' THEN
        SELECT pc.contract_id INTO v_shared
          FROM project_contracts pc
          JOIN projects pj ON pj.id = pc.project_id
         WHERE lower(pj.project_code) = lower(p_profile ->> 'share_contract')
           AND pc.is_primary;
    END IF;

    IF v_shared IS NOT NULL THEN
        SELECT contractor_id INTO v_prime FROM contracts WHERE id = v_shared;
    ELSE
        INSERT INTO contractors (name, code, contractor_type, primary_contact,
                                 contact_email, city, state_code)
        VALUES ('DEMO Prime ' || v_nn || ' - ' || v_word || ' ' ||
                COALESCE(p_profile ->> 'prime_label', 'Hauling Group'),
                'DPR' || v_nn, 'hauler', 'Parker Prime',
                'prime' || v_nn || '@demo.invalid', v_city, 'XX')
        RETURNING id INTO v_prime;
    END IF;

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
                          email, phone, contact_role, is_primary)
    SELECT 'contractors', v_prime, 'Parker', 'Prime', 'Operations Director',
           'prime' || v_nn || '@demo.invalid', NULL, 'primary', true
     WHERE v_shared IS NULL;

    INSERT INTO contacts (entity_type, entity_id, first_name, last_name, title,
                          email, phone, contact_role, is_primary) VALUES
        ('contractors', v_sub, 'Taylor', 'Sub', 'Owner',
         'sub' || v_nn || '@demo.invalid', NULL, 'primary', true);

    -- ------------------------------------------------ disaster and contracts
    IF p_profile ? 'event_code' THEN
        SELECT id INTO v_disaster FROM disasters
         WHERE lower(declaration_code) = lower(p_profile ->> 'event_code');
    END IF;

    IF v_disaster IS NULL THEN
        INSERT INTO disasters (declaration_code, name, incident_type, declared_on,
                               incident_start, incident_end, state_code)
        VALUES (COALESCE(p_profile ->> 'event_code',
                         'DEMO-DR-' || lpad(p_seq::text, 3, '0')),
                COALESCE(p_profile ->> 'event_name',
                         'DEMO ' || v_event || ' ' || v_word),
                v_event, (v_base - 8), (v_base - 14), (v_base - 10), 'XX')
        RETURNING id INTO v_disaster;
    END IF;

    -- The same contract, decided again on a new declaration. Its line items are
    -- not re-created; the decisions on them are, per project, which is the whole
    -- point of contract_line_item_decisions.
    IF v_shared IS NOT NULL THEN
        v_contract := v_shared;
    ELSE
        INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                               contract_type, status, executed_on, effective_from,
                               effective_to, not_to_exceed, document_url)
        VALUES ('DEMO-' || v_nn || '-C001',
                'DEMO ' || v_prog_lbl || ' - ' || v_word ||
                CASE WHEN v_place = '' THEN '' ELSE ' ' || v_place END,
                v_client, v_prime, 'unit_price', 'active', (v_base - 6),
                (v_base - 6), (v_ends + 210),
                (4000000 + (p_seq * 1350000))::numeric,
                'https://demo.invalid/contracts/DEMO-' || v_nn || '-C001.pdf')
        RETURNING id INTO v_contract;
    END IF;

    INSERT INTO contracts (contract_number, title, client_id, contractor_id,
                           contract_type, status, executed_on, effective_from,
                           effective_to, not_to_exceed, document_url)
    VALUES ('DEMO-' || v_nn || '-C002',
            'DEMO Haul Out and Final Disposal - ' || v_word,
            v_client, v_sub, 'unit_price', 'active', (v_base - 4),
            (v_base - 4), (v_ends + 210), (1200000 + (p_seq * 220000))::numeric,
            'https://demo.invalid/contracts/DEMO-' || v_nn || '-C002.pdf')
    RETURNING id INTO v_contract_sub;

    -- -------------------------------------------------------- disposal sites
    FOR i IN 1..GREATEST(1, COALESCE((p_profile ->> 'dms')::integer, 2)) LOOP
        INSERT INTO disposal_sites (name, site_code, site_kind, operator_id,
                                    address_line1, city, state_code, postal_code,
                                    latitude, longitude, permit_number,
                                    permit_expires_on, has_scale, accepted_debris,
                                    capacity_cy)
        VALUES ('DEMO ' || v_word || ' ' || v_nn || ' ' ||
                (ARRAY['North','South','East','West'])[i] || ' DMS',
                v_prefix || '-DMS-' || i, 'DMS', v_prime,
                (100 * i) || ' Windrow Drive', v_city, 'XX',
                lpad(p_seq::text, 5, '0'),
                v_lat + (0.01 * i), v_lon - (0.01 * i),
                'DEMO-SW-' || v_nn || lpad(i::text, 2, '0'),
                (v_base + 380), (i = 1), v_streams, 420000 - (i * 60000))
        RETURNING id INTO v_site;
        v_dms := v_dms || v_site;
    END LOOP;

    FOR i IN 1..GREATEST(0, COALESCE((p_profile ->> 'fds')::integer, 1)) LOOP
        INSERT INTO disposal_sites (name, site_code, site_kind, operator_id,
                                    address_line1, city, state_code, postal_code,
                                    latitude, longitude, permit_number,
                                    permit_expires_on, has_scale, accepted_debris)
        VALUES ('DEMO ' || v_word || ' ' || v_nn || ' Regional Landfill ' || i,
                v_prefix || '-FDS-' || i, 'FDS', v_sub,
                (300 * i) || ' Rainshadow Road', v_city, 'XX',
                lpad(p_seq::text, 5, '0'),
                v_lat - (0.045 * i), v_lon - (0.09 * i),
                'DEMO-LF-' || v_nn || lpad(i::text, 2, '0'),
                (v_base + 1200), true, v_streams)
        RETURNING id INTO v_site;
        v_fds := v_fds || v_site;
    END LOOP;

    -- --------------------------------------------------------------- project
    INSERT INTO projects (name, project_code, client_id, disaster_id,
                          primary_contract_id, status, program_code, program,
                          description, starts_on, ends_on, timezone,
                          ticket_prefix, owner_instance_key, visibility_flag,
                          created_by)
    VALUES ('DEMO Project ' || v_nn || ' - ' || v_event || ' ' || v_word ||
            CASE WHEN v_place = '' THEN '' ELSE ' (' || v_place || ')' END,
            v_code, v_client, v_disaster, v_contract,
            CASE WHEN v_status IN ('closeout', 'closed') THEN 'active' ELSE v_status END,
            v_program, v_prog_lbl,
            'DEMO data. ' || v_prog_lbl || ' for ' || v_event || ' ' || v_word ||
            ', an event that did not happen in a county that does not exist.',
            v_base, v_ends,
            COALESCE(p_profile ->> 'timezone', 'America/Chicago'), v_prefix,
            v_instance_key, COALESCE(p_profile ->> 'visibility', 'private'), v_admin)
    RETURNING id INTO v_project;

    INSERT INTO project_contractors (project_id, contractor_id, role_on_project,
                                     parent_contractor_id) VALUES
        (v_project, v_prime,        'prime',           NULL),
        (v_project, v_monitor_firm, 'monitoring_firm', NULL),
        (v_project, v_sub,          'sub_tier_1',      v_prime);

    INSERT INTO project_contracts (project_id, contract_id, is_primary) VALUES
        (v_project, v_contract, true),
        (v_project, v_contract_sub, false);

    INSERT INTO project_sites (project_id, site_id, opened_on)
    SELECT v_project, s, v_base FROM unnest(v_dms || v_fds) s;

    -- ------------------------------------------------------------- documents
    INSERT INTO documents (entity_type, entity_id, kind_code, title, url,
                           provider, effective_from, verification_status,
                           verified_by, verified_at, created_by)
    SELECT 'contracts', k.id, 'contract', k.contract_number || ' executed contract',
           k.document_url, 'sharepoint', (v_base - 6), 'verified', v_admin,
           (v_base - 5), v_admin
      FROM contracts k
     WHERE k.id IN (v_contract, v_contract_sub)
       AND NOT EXISTS (SELECT 1 FROM documents d
                        WHERE d.entity_type = 'contracts' AND d.entity_id = k.id);

    -- One permit verified, one pending with the client, the landfill not
    -- required. The alert feed is only worth looking at when something on it is
    -- unresolved, so every project carries one that is.
    INSERT INTO documents (entity_type, entity_id, project_id, kind_code, title,
                           url, provider, effective_from, expires_on,
                           verification_status, verified_by, verified_at, created_by)
    VALUES ('disposal_sites', v_dms[1], v_project, 'permit',
            'DEMO ' || v_word || ' ' || v_nn || ' DMS operating permit',
            'https://demo.invalid/permits/DEMO-SW-' || v_nn || '01.pdf',
            'sharepoint', (v_base - 3), (v_base + 380), 'verified',
            v_admin, (v_base - 2), v_admin);

    UPDATE project_sites ps
       SET permit_status = 'verified', permit_document_id = d.id,
           permit_verified_by = v_admin, permit_verified_on = (v_base - 2)
      FROM documents d
     WHERE d.entity_type = 'disposal_sites' AND d.entity_id = v_dms[1]
       AND d.project_id = v_project
       AND ps.project_id = v_project AND ps.site_id = v_dms[1];

    UPDATE project_sites ps
       SET permit_status = 'pending', permit_requested_from = 'client',
           permit_requested_on = (v_base + 1),
           permit_notes = 'Requested from the demo client. Operations continue.'
     WHERE ps.project_id = v_project AND ps.site_id = ANY(v_dms[2:])
       AND ps.permit_status IS DISTINCT FROM 'verified';

    UPDATE project_sites ps
       SET permit_status = 'not_required',
           permit_notes = 'Permitted landfill operating under its own licence.'
     WHERE ps.project_id = v_project AND ps.site_id = ANY(v_fds);

    -- ------------------------------------------------------ scope and estimates
    INSERT INTO project_scopes (project_id, debris_type_code, is_enabled,
                                confirmed_by, confirmed_on, notes)
    SELECT v_project, dt.code, dt.code = ANY(v_streams), v_admin, (v_base - 2),
           CASE WHEN dt.code = ANY(v_streams)
                THEN 'Confirmed in scope by the client.'
                ELSE 'Not authorised on this project.' END
      FROM debris_types dt
     WHERE dt.is_active
       AND (dt.code = ANY(v_streams)
            OR dt.code IN ('VEG','CD','MIXED','WHITE','HHW','STUMP','HANGER','LEANER'));

    INSERT INTO project_estimates (project_id, debris_type_code, estimated_quantity,
                                   unit_type_code, source, confidence, as_of_date,
                                   notes, created_by)
    SELECT v_project, dt.code,
           CASE WHEN dt.estimate_unit_type_code = 'per_cubic_yard'
                THEN 40000 + ((p_seq * 7919) % 380000)
                ELSE 200 + ((p_seq * 613) % 3000) END,
           dt.estimate_unit_type_code, 'client', 'client_provided', (v_base - 2),
           'Client estimate at kickoff.', v_admin
      FROM debris_types dt WHERE dt.code = ANY(v_streams);

    -- ----------------------------------------------------------------- zones
    v_zone_n := GREATEST(1, COALESCE((p_profile ->> 'zones')::integer, 3));
    INSERT INTO project_zones (project_id, zone_code, name)
    SELECT v_project, lpad(n::text, 3, '0'),
           v_word || ' ' || (ARRAY['North','Central','South','East','West',
                                   'Riverfront','Uplands','Harbour'])[1 + ((n - 1) % 8)]
      FROM generate_series(1, v_zone_n) n;

    -- ----------------------------------------------------------- assignments
    -- The instance admin and analyst are on every demo project on purpose:
    -- signing in as admin and finding one project is not a demonstration of a
    -- portfolio.
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
      FROM generate_series(1, GREATEST(1, COALESCE((p_profile ->> 'trucks')::integer, 14))) n;

    INSERT INTO equipment (unit_number, contractor_id, equipment_type, make,
                           model, model_year, capacity_cy, tare_weight_lbs,
                           certified_on, placard_code, barcode)
    SELECT v_prefix || '-S' || lpad(n::text, 3, '0'), v_sub, 'truck',
           'DemoTruck', 'Model B', 2020 + (n % 4),
           (60 + (n * 9) % 50)::numeric, 26000 + (n * 90), (v_base - 2),
           'S-' || v_nn || lpad(n::text, 3, '0'),
           v_prefix || 'S' || lpad(n::text, 3, '0') || 'BC'
      FROM generate_series(1, GREATEST(1, COALESCE((p_profile ->> 'sub_trucks')::integer, 6))) n;

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
           v_manager, v_word || ' Manager ' || v_nn, v_manager
      FROM equipment e
     WHERE e.contractor_id IN (v_prime, v_sub) AND e.capacity_cy IS NOT NULL;

    -- ------------------------------------- the offer sheet: codes and rules
    -- One pass builds a contract line item, a service code, a rate and a rule
    -- for everything this project is allowed to bill, and nothing for anything
    -- it is not. A project whose client never authorised white goods has no
    -- white goods code, no white goods rate and no white goods rule, which is
    -- how a real project setup ends up too.
    FOR v_offer IN
        SELECT * FROM (VALUES
          -- key, code, name, ticket type, unit, price, quantity_mode,
          -- category, wanted, statements
          ('veg', 'ROW-VEG', 'Vegetative Collection', 'LOAD', 'per_cubic_yard',
           9.45, 'measured', 'collection', 'VEG' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'in', '["VEG","PUTRES"]', 'Vegetative debris'),
             jsonb_build_array('site_kind', 'in', '["DMS","TDSRS"]', 'Debris management site'),
             jsonb_build_array('cubic_yards', 'gt', '0', 'greater than 0 CY'))),

          ('cd', 'ROW-CD', 'Construction and Demolition', 'LOAD', 'per_cubic_yard',
           11.25, 'measured', 'collection',
           'CD' = ANY(v_streams) OR 'MIXED' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'in', '["CD","MIXED","SOIL","SAND"]', 'C&D, mixed, soil or sand'),
             jsonb_build_array('cubic_yards', 'gt', '0', 'greater than 0 CY'))),

          ('white', 'WHITE-GOODS', 'White Goods per Unit', 'LOAD', 'per_unit',
           42.00, 'measured', 'collection', 'WHITE' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"WHITE"', 'White goods'))),

          ('ewaste', 'EWASTE', 'Electronic Waste per Unit', 'LOAD', 'per_unit',
           28.00, 'measured', 'collection', 'EWASTE' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"EWASTE"', 'Electronic waste'))),

          ('hhw', 'HHW', 'Household Hazardous Waste Handling', 'LOAD', 'per_each',
           285.00, 'flat', 'hazardous', 'HHW' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"HHW"', 'Household hazardous waste'))),

          ('vehicle', 'VEHICLE', 'Vehicle and Vessel Recovery', 'LOAD', 'per_unit',
           675.00, 'measured', 'recovery', 'VEHICLE' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"VEHICLE"', 'Vehicles and vessels'))),

          ('haul', 'HAUL-FDS', 'Haul Out to Final Disposal', 'HAULOUT', v_haul_u,
           CASE WHEN v_haul_u = 'per_ton' THEN 18.50 ELSE 4.75 END,
           'measured', 'haul_out', array_length(v_fds, 1) > 0,
           jsonb_build_array(
             jsonb_build_array('site_kind', 'eq', '"FDS"', 'Final disposal site'))),

          ('stump', 'STUMP', 'Hazardous Stump Removal', 'UNIT', 'per_unit',
           0.00, 'tiered', 'tree_work', 'STUMP' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"STUMP"', 'Stumps'),
             jsonb_build_array('stump_diameter', 'gte', '24', 'at least 24 inches'))),

          ('hanger', 'HANGER', 'Hanger Removal', 'UNIT', 'per_unit',
           78.00, 'flat', 'tree_work', 'HANGER' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"HANGER"', 'Hangers'))),

          ('leaner', 'LEANER', 'Leaning Tree Removal', 'UNIT', 'per_unit',
           142.00, 'flat', 'tree_work', 'LEANER' = ANY(v_streams),
           jsonb_build_array(
             jsonb_build_array('debris_type', 'eq', '"LEANER"', 'Leaners'))),

          ('tmlabor', 'TM-LABOR', 'Force Account Labor', 'TM', 'per_labor_hour',
           46.50, 'measured', 'time_and_material',
           COALESCE((p_profile ->> 'tm')::boolean, false),
           jsonb_build_array(
             jsonb_build_array('labor_hours', 'gt', '0', 'labour hours recorded'))),

          ('tmequip', 'TM-EQUIP', 'Force Account Equipment', 'TM', 'per_equip_hour',
           95.00, 'measured', 'time_and_material',
           COALESCE((p_profile ->> 'tm')::boolean, false),
           jsonb_build_array(
             jsonb_build_array('equipment_hours', 'gt', '0', 'equipment hours recorded')))
        ) AS o(key, code, name, ticket_type, unit, price, qty_mode, category,
               wanted, statements)
        WHERE o.wanted
    LOOP
        v_line := v_line + 1;
        v_li := NULL;

        -- A shared contract already carries its line items. This project does
        -- not write them again; it decides them again, below, which is the
        -- difference the decisions table exists to hold.
        IF v_shared IS NOT NULL AND v_offer.key <> 'haul' THEN
            SELECT id INTO v_li FROM contract_line_items
             WHERE contract_id = v_contract
               AND description = 'DEMO line item: ' || v_offer.name
               AND deleted_at IS NULL
             LIMIT 1;
        END IF;

        -- The line item first, because that is the order a real project goes
        -- in: the contract says it, somebody accepts it, and only then does a
        -- code exist to bill it with.
        IF v_li IS NULL THEN
        INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                         description, unit_type_code, unit_price,
                                         debris_type_code, service_category,
                                         effective_from, source_page, status,
                                         reviewed_by, reviewed_at)
        VALUES (CASE WHEN v_offer.key = 'haul' THEN v_contract_sub ELSE v_contract END,
                CASE WHEN v_offer.key = 'haul' THEN 1
                     ELSE (SELECT COALESCE(max(line_number), 0) + 1
                             FROM contract_line_items
                            WHERE contract_id = v_contract AND deleted_at IS NULL) END,
                CASE WHEN v_offer.key = 'haul' THEN '1.01'
                     ELSE v_line || '.01' END,
                'DEMO line item: ' || v_offer.name,
                v_offer.unit, v_offer.price,
                CASE v_offer.key WHEN 'veg' THEN 'VEG' WHEN 'cd' THEN 'CD'
                                 WHEN 'white' THEN 'WHITE' WHEN 'hhw' THEN 'HHW'
                                 WHEN 'ewaste' THEN 'EWASTE'
                                 WHEN 'vehicle' THEN 'VEHICLE'
                                 WHEN 'stump' THEN 'STUMP'
                                 WHEN 'hanger' THEN 'HANGER'
                                 WHEN 'leaner' THEN 'LEANER'
                                 WHEN 'haul' THEN 'MIXED' END,
                v_offer.category, (v_base - 6), 3 + (v_line % 5),
                'accepted', v_admin, (v_base - 5))
        RETURNING id INTO v_li;
        END IF;

        INSERT INTO service_codes (project_id, code, name, contractor_id,
                                   fema_category, description, contract_id,
                                   contract_line_item_id, quantity_mode)
        VALUES (v_project, v_offer.code, v_offer.name,
                CASE WHEN v_offer.key = 'haul' THEN v_sub ELSE v_prime END,
                CASE WHEN v_offer.category IN ('tree_work', 'hazardous') THEN 'B' ELSE 'A' END,
                'DEMO service code for ' || v_offer.name || '.',
                CASE WHEN v_offer.key = 'haul' THEN v_contract_sub ELSE v_contract END,
                v_li, v_offer.qty_mode)
        RETURNING id INTO v_sc;

        UPDATE contract_line_items SET accepted_service_code_id = v_sc
         WHERE id = v_li AND accepted_service_code_id IS NULL;

        INSERT INTO contract_line_item_decisions
            (project_id, contract_line_item_id, status, service_code_id,
             reviewed_by, reviewed_at)
        VALUES (v_project, v_li, 'accepted', v_sc, v_admin, (v_base - 5));

        INSERT INTO rates (service_code_id, amount, unit_type, effective_from,
                           tier_source, notes)
        VALUES (v_sc, v_offer.price, v_offer.unit, v_base,
                CASE WHEN v_offer.qty_mode = 'tiered' THEN 'stump_diameter_inches' END,
                CASE WHEN v_offer.qty_mode = 'tiered'
                     THEN 'Banded by diameter. The bands carry the price.'
                     ELSE 'Base contract rate' END)
        RETURNING id INTO v_rate;

        IF v_offer.qty_mode = 'tiered' THEN
            INSERT INTO rate_tiers (rate_id, label, from_value, to_value, amount, sort_order)
            SELECT v_rate, t.label, t.from_value, t.to_value, t.amount, t.sort_order
              FROM (VALUES ('6 to 12 inches',      6,  12,   45.0000, 10),
                           ('12 to 24 inches',    12,  24,  120.0000, 20),
                           ('24 to 36 inches',    24,  36,  260.0000, 30),
                           ('36 inches and over', 36, NULL, 400.0000, 40))
                     AS t(label, from_value, to_value, amount, sort_order);
        END IF;

        -- A mid-period revision on the volume codes, where a real change order
        -- lands. Both rows survive; the rate in force on the service date is
        -- what priced the ticket.
        IF COALESCE((p_profile ->> 'rate_change')::boolean, false)
           AND v_offer.key IN ('veg', 'cd') THEN
            INSERT INTO rates (service_code_id, amount, unit_type, effective_from,
                               notes)
            VALUES (v_sc, round((v_offer.price * 1.08)::numeric, 4), v_offer.unit,
                    v_base + 45, 'Change order 001, fuel adjustment.');
        END IF;

        SELECT id INTO v_tt FROM ticket_types WHERE code = v_offer.ticket_type;

        INSERT INTO project_ticket_types (project_id, ticket_type_id)
        VALUES (v_project, v_tt)
        ON CONFLICT DO NOTHING;

        INSERT INTO rules (project_id, ticket_type_id, name, description,
                           service_code_id, contract_id, match_mode, priority,
                           created_by)
        VALUES (v_project, v_tt, v_offer.name,
                'DEMO rule: bill ' || v_offer.code || ' when the ticket matches.',
                v_sc,
                CASE WHEN v_offer.key = 'haul' THEN v_contract_sub ELSE v_contract END,
                'all', v_line * 10, COALESCE(v_analyst, v_admin))
        RETURNING id INTO v_rule;

        v_n := 0;
        FOR v_stmt IN SELECT * FROM jsonb_array_elements(v_offer.statements) LOOP
            v_n := v_n + 1;
            INSERT INTO rule_statements (rule_id, sequence, operand_code,
                                         operator_code, value, value_label)
            VALUES (v_rule, v_n, v_stmt ->> 0, v_stmt ->> 1,
                    (v_stmt ->> 2)::jsonb, v_stmt ->> 3);
        END LOOP;
    END LOOP;

    -- A line item the client put on the contract and this project will not pay
    -- for. Rejected here; the next declaration on the same contract decides it
    -- again from scratch.
    SELECT id INTO v_li FROM contract_line_items
     WHERE contract_id = v_contract
       AND description = 'DEMO line item: standby time for idle equipment'
       AND deleted_at IS NULL
     LIMIT 1;

    IF v_li IS NULL THEN
        INSERT INTO contract_line_items (contract_id, line_number, item_code,
                                         description, unit_type_code, unit_price,
                                         service_category, effective_from,
                                         source_page, status)
        VALUES (v_contract,
                (SELECT COALESCE(max(line_number), 0) + 1
                   FROM contract_line_items
                  WHERE contract_id = v_contract AND deleted_at IS NULL),
                '9.01', 'DEMO line item: standby time for idle equipment',
                'per_equip_hour', 95.0000, 'standby', (v_base - 6), 9, 'rejected')
        RETURNING id INTO v_li;
    END IF;

    INSERT INTO contract_line_item_decisions
        (project_id, contract_line_item_id, status, reviewed_by, reviewed_at, notes)
    VALUES (v_project, v_li, 'rejected', v_admin, (v_base - 5),
            'Not billable on this declaration.');

    -- Non-billable types carry no rule and need none, so they are enabled last
    -- and separately: INCIDENT everywhere, plus whatever the profile asked for.
    FOR i IN 1..array_length(ARRAY['INCIDENT'] || v_extra, 1) LOOP
        SELECT id INTO v_tt FROM ticket_types
         WHERE code = (ARRAY['INCIDENT'] || v_extra)[i] AND NOT is_system;
        IF v_tt IS NOT NULL THEN
            INSERT INTO project_ticket_types (project_id, ticket_type_id)
            VALUES (v_project, v_tt) ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;

    RETURN v_project;
END
$build$;

-- ---------------------------------------------------------------------------
-- Tickets of one type.
--
-- A procedure rather than a function because it commits as it goes. A million
-- tickets in one transaction is a million rows of WAL held open, no visible
-- progress, and everything lost if the connection drops at 90 percent. Batched
-- and committed, a run that dies leaves what it already wrote.
--
-- p_rich adds the stage rows and a photograph to every ticket. Worth it on a
-- ten thousand ticket showcase, where the ticket detail screen is the point;
-- not worth tripling the row count on a bulk run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE adms_demo_write_tickets(
    p_project uuid, p_type text, p_count integer,
    p_batch integer DEFAULT 2000, p_rich boolean DEFAULT false)
LANGUAGE plpgsql
AS $write$
DECLARE
    c_streets text[] := ARRAY[
        'Anvil Ridge Road','Cinder Hollow Lane','Windrow Drive','Gale Point Road',
        'Squall Street','Driftwood Avenue','Thunder Gap Road','Hailstone Court',
        'Leeward Lane','Stormwatch Boulevard','Rainshadow Road','Tempest Trail'];

    v_code      text;
    v_city      text;
    v_admin     uuid;
    v_base      date;
    v_tt        uuid;
    v_prime     uuid;
    v_sub       uuid;
    v_contract  uuid;
    v_contract_sub uuid;
    v_trucks    uuid[];
    v_subtrucks uuid[];
    v_crews     uuid[];
    v_monitors  uuid[];
    v_zones     uuid[];
    v_dms       uuid[];
    v_fds       uuid[];
    v_scale     boolean;
    v_vol       text[];      -- volume streams enabled here
    v_unit      text[];      -- per unit streams enabled here
    v_tree      text[];      -- unit rate tree streams enabled here
    v_debris    text[];      -- the weighted load ticket mix
    v_done      integer := 0;
    v_from      integer;
    v_to        integer;
BEGIN
    IF p_count < 1 THEN RETURN; END IF;

    SELECT p.project_code, p.starts_on, COALESCE(c.city, 'Demo City')
      INTO v_code, v_base, v_city
      FROM projects p LEFT JOIN clients c ON c.id = p.client_id
     WHERE p.id = p_project;

    SELECT id INTO v_admin FROM users WHERE username = 'admin';

    SELECT tt.id INTO v_tt
      FROM ticket_types tt
      JOIN project_ticket_types ptt ON ptt.ticket_type_id = tt.id
     WHERE ptt.project_id = p_project AND ptt.is_active AND tt.code = p_type
     LIMIT 1;
    IF v_tt IS NULL THEN RETURN; END IF;   -- type not enabled here, nothing to do

    SELECT contractor_id INTO v_prime FROM project_contractors
     WHERE project_id = p_project AND role_on_project = 'prime' LIMIT 1;
    SELECT contractor_id INTO v_sub FROM project_contractors
     WHERE project_id = p_project AND role_on_project = 'sub_tier_1' LIMIT 1;

    SELECT contract_id INTO v_contract FROM project_contracts
     WHERE project_id = p_project AND is_primary LIMIT 1;
    SELECT contract_id INTO v_contract_sub FROM project_contracts
     WHERE project_id = p_project AND NOT is_primary LIMIT 1;

    SELECT array_agg(pec.equipment_id) INTO v_trucks
      FROM project_equipment_certifications pec
      JOIN equipment e ON e.id = pec.equipment_id
     WHERE pec.project_id = p_project AND pec.status = 'active'
       AND e.contractor_id = v_prime;

    SELECT array_agg(pec.equipment_id) INTO v_subtrucks
      FROM project_equipment_certifications pec
      JOIN equipment e ON e.id = pec.equipment_id
     WHERE pec.project_id = p_project AND pec.status = 'active'
       AND e.contractor_id = v_sub;

    SELECT array_agg(e.id ORDER BY e.unit_number) INTO v_crews
      FROM equipment e WHERE e.contractor_id = v_prime AND e.equipment_type = 'crew';

    SELECT array_agg(pa.user_id) INTO v_monitors
      FROM project_assignments pa
     WHERE pa.project_id = p_project AND pa.is_active AND pa.can_create_tickets;

    SELECT array_agg(id ORDER BY zone_code) INTO v_zones
      FROM project_zones WHERE project_id = p_project AND is_active;

    SELECT array_agg(ps.site_id ORDER BY ds.site_code), bool_or(ds.has_scale)
      INTO v_dms, v_scale
      FROM project_sites ps JOIN disposal_sites ds ON ds.id = ps.site_id
     WHERE ps.project_id = p_project AND ps.is_active
       AND ds.site_kind IN ('DMS','TDSRS');

    SELECT array_agg(ps.site_id ORDER BY ds.site_code) INTO v_fds
      FROM project_sites ps JOIN disposal_sites ds ON ds.id = ps.site_id
     WHERE ps.project_id = p_project AND ps.is_active AND ds.site_kind = 'FDS';

    SELECT array_agg(ps.debris_type_code) FILTER (
             WHERE ps.debris_type_code IN ('VEG','CD','MIXED','SOIL','SAND','PUTRES')),
           array_agg(ps.debris_type_code) FILTER (
             WHERE ps.debris_type_code IN ('WHITE','HHW','EWASTE','VEHICLE')),
           array_agg(ps.debris_type_code) FILTER (
             WHERE ps.debris_type_code IN ('STUMP','HANGER','LEANER'))
      INTO v_vol, v_unit, v_tree
      FROM project_scopes ps
     WHERE ps.project_id = p_project AND ps.is_enabled;

    -- Weighted the way a project actually runs rather than one slot per enabled
    -- stream. An even split would put a fifth of the volume on white goods,
    -- which is a handful of appliances on a real programme, and the money
    -- screens would then be exercised against a project nobody has ever seen.
    v_debris := '{}';
    IF v_vol IS NOT NULL THEN
        FOR v_from IN 1..array_length(v_vol, 1) LOOP
            v_debris := v_debris || ARRAY[v_vol[v_from], v_vol[v_from], v_vol[v_from]];
        END LOOP;
    END IF;
    IF v_unit IS NOT NULL THEN
        v_debris := v_debris || v_unit;
    END IF;
    IF v_debris = '{}' THEN v_debris := ARRAY['MIXED']; END IF;

    -- A missing array turns every CROSS JOIN LATERAL below into zero rows, which
    -- would write nothing at all and say nothing about it. Fail loudly instead.
    IF v_monitors IS NULL THEN
        RAISE EXCEPTION 'Project % has nobody who can create tickets.', v_code
            USING ERRCODE = 'check_violation';
    END IF;
    IF p_type IN ('LOAD', 'HAULOUT') AND (v_trucks IS NULL OR v_dms IS NULL) THEN
        RAISE EXCEPTION 'Project % has no % to write % tickets with.', v_code,
            CASE WHEN v_trucks IS NULL THEN 'certified trucks' ELSE 'debris sites' END,
            p_type USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('adms.enforce_gate', 'on', false);
    PERFORM set_config('adms.actor_name', 'demo seed', false);
    PERFORM set_config('adms.actor_role', 'admin', false);
    PERFORM set_config('adms.source', 'import', false);
    PERFORM set_config('adms.actor_id', v_admin::text, false);

    WHILE v_done < p_count LOOP
        v_from := v_done + 1;
        v_to   := LEAST(v_done + p_batch, p_count);

        IF p_type = 'LOAD' THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id, equipment_id,
                contract_id, zone_id, driver_name, barcode, debris_type,
                origin_house_number, origin_street, origin_city, origin_state,
                origin_latitude, origin_longitude, origin_at,
                destination_site_id, destination_latitude, destination_longitude,
                destination_at, load_call_pct, certified_capacity_cy,
                scale_ticket_number, gross_weight_lbs, tare_weight_lbs,
                quantity, quantity_unit,
                created_by, completed_by, completed_at, source, data)
            SELECT
                p_project, v_tt, 'completed', v_prime, e.id, v_contract,
                CASE WHEN v_zones IS NULL THEN NULL
                     ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
                'Driver ' || (100 + (n % 240)), e.barcode, d.code,
                (1000 + (n % 900) * 7)::text,
                c_streets[1 + (n % array_length(c_streets, 1))], v_city, 'XX',
                ds.latitude + 0.05 + ((n % 97) * 0.00041),
                ds.longitude - 0.05 - ((n % 89) * 0.00037),
                t.stamp, ds.id, ds.latitude, ds.longitude,
                t.stamp + INTERVAL '47 minutes',
                -- A spread of load calls, including the full calls the review
                -- detector is meant to find. Per unit streams have no load
                -- call at all: a refrigerator is one refrigerator.
                CASE WHEN d.is_volume
                     THEN (ARRAY[40,50,60,70,75,80,90,100])[1 + (n % 8)] END,
                CASE WHEN d.is_volume THEN pec.certified_capacity_cy END,
                CASE WHEN v_scale AND d.is_volume AND n % 4 = 0
                     THEN 'SC-' || (52000 + n)::text END,
                CASE WHEN v_scale AND d.is_volume AND n % 4 = 0
                     THEN 41000 + (n % 180) * 190 END,
                CASE WHEN v_scale AND d.is_volume AND n % 4 = 0
                     THEN pec.tare_weight_lbs END,
                CASE WHEN d.is_volume THEN NULL ELSE 1 + (n % 3) END,
                CASE WHEN d.is_volume THEN NULL ELSE 'per_unit' END,
                m.user_id, m.user_id, t.stamp + INTERVAL '47 minutes', 'field_app',
                jsonb_build_object('load_call_source', 'visual', 'generated', true)
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base + ((n % 120)))::timestamp
                       + TIME '07:30' + ((n % 11) * INTERVAL '43 minutes') AS stamp) t
            CROSS JOIN LATERAL (
                SELECT v_debris[1 + (n % array_length(v_debris, 1))] AS code,
                       v_debris[1 + (n % array_length(v_debris, 1))]
                         NOT IN ('WHITE','HHW','EWASTE','VEHICLE') AS is_volume) d
            CROSS JOIN LATERAL (
                SELECT eq.id, eq.barcode FROM equipment eq
                 WHERE eq.id = v_trucks[1 + (n % array_length(v_trucks, 1))]) e
            CROSS JOIN LATERAL (
                SELECT s.id, s.latitude, s.longitude FROM disposal_sites s
                 WHERE s.id = v_dms[1 + (n % array_length(v_dms, 1))]) ds
            CROSS JOIN LATERAL (
                SELECT pec2.certified_capacity_cy, pec2.tare_weight_lbs
                  FROM project_equipment_certifications pec2
                 WHERE pec2.project_id = p_project AND pec2.equipment_id = e.id
                   AND pec2.status = 'active') pec
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;

        ELSIF p_type = 'HAULOUT' AND v_fds IS NOT NULL AND v_subtrucks IS NOT NULL THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id, equipment_id,
                contract_id, driver_name, barcode, debris_type,
                origin_site_id, origin_latitude, origin_longitude, origin_at,
                destination_site_id, destination_latitude, destination_longitude,
                destination_at, load_call_pct, certified_capacity_cy,
                scale_ticket_number, gross_weight_lbs, tare_weight_lbs,
                created_by, completed_by, completed_at, source, data)
            SELECT
                p_project, v_tt, 'completed', v_sub, e.id, v_contract_sub,
                'Hauler ' || (200 + (n % 60)), e.barcode,
                (ARRAY['VEG','CD','MIXED'])[1 + (n % 3)],
                o.id, o.latitude, o.longitude, t.stamp,
                f.id, f.latitude, f.longitude, t.stamp + INTERVAL '52 minutes',
                (ARRAY[75,80,85,90,95,100])[1 + (n % 6)],
                pec.certified_capacity_cy,
                'SC-' || (74000 + n)::text,
                48000 + (n % 220) * 170, pec.tare_weight_lbs,
                m.user_id, m.user_id, t.stamp + INTERVAL '52 minutes', 'field_app',
                jsonb_build_object('generated', true)
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base + 3 + ((n % 110)))::timestamp
                       + TIME '09:15' + ((n % 7) * INTERVAL '65 minutes') AS stamp) t
            CROSS JOIN LATERAL (
                SELECT eq.id, eq.barcode FROM equipment eq
                 WHERE eq.id = v_subtrucks[1 + (n % array_length(v_subtrucks, 1))]) e
            CROSS JOIN LATERAL (
                SELECT s.id, s.latitude, s.longitude FROM disposal_sites s
                 WHERE s.id = v_dms[1 + (n % array_length(v_dms, 1))]) o
            CROSS JOIN LATERAL (
                SELECT s.id, s.latitude, s.longitude FROM disposal_sites s
                 WHERE s.id = v_fds[1 + (n % array_length(v_fds, 1))]) f
            CROSS JOIN LATERAL (
                SELECT pec2.certified_capacity_cy, pec2.tare_weight_lbs
                  FROM project_equipment_certifications pec2
                 WHERE pec2.project_id = p_project AND pec2.equipment_id = e.id
                   AND pec2.status = 'active') pec
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;

        ELSIF p_type = 'UNIT' AND v_tree IS NOT NULL THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id, contract_id,
                crew_id, zone_id, debris_type, quantity, quantity_unit,
                origin_street, origin_city, origin_state,
                origin_latitude, origin_longitude, origin_at,
                created_by, completed_by, completed_at, source, data, notes)
            SELECT
                p_project, v_tt, 'completed', v_prime, v_contract,
                CASE WHEN v_crews IS NULL THEN NULL
                     ELSE v_crews[1 + (n % array_length(v_crews, 1))] END,
                CASE WHEN v_zones IS NULL THEN NULL
                     ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
                w.code, 1, 'per_each',
                c_streets[1 + (n % array_length(c_streets, 1))], v_city, 'XX',
                35.0 + ((n % 97) * 0.00041), -95.0 - ((n % 89) * 0.00037),
                t.stamp, m.user_id, m.user_id, t.stamp + INTERVAL '70 minutes',
                'field_app',
                jsonb_build_object(
                    'unit_work_type', initcap(lower(w.code)) || ' Removal',
                    'stump_diameter_inches',
                    CASE WHEN w.code = 'STUMP' THEN 6 + (n % 38) END,
                    'generated', true),
                'DEMO unit rate work on the right of way.'
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base + 6 + ((n % 100)))::timestamp
                       + TIME '10:00' + ((n % 5) * INTERVAL '75 minutes') AS stamp) t
            CROSS JOIN LATERAL (
                SELECT v_tree[1 + (n % array_length(v_tree, 1))] AS code) w
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;

        ELSIF p_type = 'TM' THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id, contract_id,
                crew_id, zone_id, labor_hours, equipment_hours,
                origin_street, origin_city, origin_state,
                origin_latitude, origin_longitude, origin_at,
                created_by, completed_by, completed_at, source, data, notes)
            SELECT
                p_project, v_tt, 'completed', v_prime, v_contract,
                CASE WHEN v_crews IS NULL THEN NULL
                     ELSE v_crews[1 + (n % array_length(v_crews, 1))] END,
                CASE WHEN v_zones IS NULL THEN NULL
                     ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
                4 + (n % 9), 3 + (n % 7),
                c_streets[1 + (n % array_length(c_streets, 1))], v_city, 'XX',
                35.0 + ((n % 97) * 0.00041), -95.0 - ((n % 89) * 0.00037),
                t.stamp, m.user_id, m.user_id, t.stamp + INTERVAL '8 hours',
                'field_app',
                jsonb_build_object('crew_size', 3 + (n % 4), 'generated', true),
                'DEMO force account work: road clearance ahead of the collection pass.'
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base + ((n % 40)))::timestamp + TIME '06:30' AS stamp) t
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;

        ELSIF p_type = 'INCIDENT' THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id,
                incident_category_id, severity, is_ongoing, zone_id,
                origin_street, origin_city, origin_state,
                origin_latitude, origin_longitude, origin_at,
                created_by, completed_by, completed_at, source, notes, data)
            SELECT
                p_project, v_tt, 'completed', v_prime, ic.id,
                (ARRAY['low','medium','high','critical','medium','low'])[1 + (n % 6)],
                (n % 7 = 0),
                CASE WHEN v_zones IS NULL THEN NULL
                     ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
                c_streets[1 + (n % array_length(c_streets, 1))], v_city, 'XX',
                35.0 + ((n % 97) * 0.00041), -95.0 - ((n % 89) * 0.00037),
                t.stamp, m.user_id, m.user_id, t.stamp + INTERVAL '25 minutes',
                'field_app',
                (ARRAY[
                  'Grapple truck clipped a mailbox at the curb line. Owner notified.',
                  'Low hanging utility line over the route. Segment paused.',
                  'Paint cans in the ROW pile. Segregated for HHW handling.',
                  'Loader hydraulic line failure. Unit removed from service.',
                  'Near miss with a passing vehicle. Cones repositioned.',
                  'Ineligible commercial debris at the curb. Documented, left in place.',
                  'Resident asked when the second pass reaches this street.'
                ])[1 + (n % 7)],
                jsonb_build_object('generated', true)
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base + 2 + ((n % 100)))::timestamp + TIME '13:20' AS stamp) t
            CROSS JOIN LATERAL (
                SELECT id FROM incident_categories
                 ORDER BY code OFFSET (n % 14) LIMIT 1) ic
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;

        ELSIF p_type = 'SURVEY' THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id, zone_id,
                debris_type, origin_street, origin_city, origin_state,
                origin_latitude, origin_longitude, origin_at,
                created_by, completed_by, completed_at, source, data, notes)
            SELECT
                p_project, v_tt, 'completed', v_prime,
                CASE WHEN v_zones IS NULL THEN NULL
                     ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
                v_debris[1 + (n % array_length(v_debris, 1))],
                c_streets[1 + (n % array_length(c_streets, 1))], v_city, 'XX',
                35.0 + ((n % 97) * 0.00041), -95.0 - ((n % 89) * 0.00037),
                t.stamp, m.user_id, m.user_id, t.stamp + INTERVAL '40 minutes',
                'field_app',
                jsonb_build_object(
                    'segment_name', 'Segment ' || lpad(n::text, 4, '0'),
                    'estimated_cy', 200 + (n % 1800),
                    'passable', (n % 5 <> 0), 'generated', true),
                'DEMO pre-work survey of the segment.'
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base - 4 + ((n % 20)))::timestamp + TIME '08:00' AS stamp) t
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;

        ELSIF p_type = 'ROE' THEN
            INSERT INTO tickets (
                project_id, ticket_type_id, status, contractor_id, zone_id,
                origin_house_number, origin_street, origin_city, origin_state,
                origin_latitude, origin_longitude, origin_at,
                created_by, completed_by, completed_at, source, data, notes)
            SELECT
                p_project, v_tt, 'completed', v_prime,
                CASE WHEN v_zones IS NULL THEN NULL
                     ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
                (2000 + (n % 700) * 3)::text,
                c_streets[1 + (n % array_length(c_streets, 1))], v_city, 'XX',
                35.0 + ((n % 97) * 0.00041), -95.0 - ((n % 89) * 0.00037),
                t.stamp, m.user_id, m.user_id, t.stamp + INTERVAL '20 minutes',
                'field_app',
                jsonb_build_object(
                    'owner_name', 'Demo Owner ' || lpad(n::text, 4, '0'),
                    'owner_phone', '(555) 02' || lpad((n % 100)::text, 2, '0') || '-0100',
                    'parcel_id', 'PCL-' || lpad(n::text, 6, '0'),
                    'signature', 'on file', 'generated', true),
                'DEMO right of entry signed by the property owner.'
            FROM generate_series(v_from, v_to) AS n
            CROSS JOIN LATERAL (
                SELECT (v_base - 6 + ((n % 25)))::timestamp + TIME '11:00' AS stamp) t
            CROSS JOIN LATERAL (
                SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id) m;
        ELSE
            RETURN;   -- nothing this procedure knows how to write
        END IF;

        v_done := v_to;
        COMMIT;
    END LOOP;

    -- The evidence, for the showcase only. Stages are what the ticket detail
    -- screen draws, and the missing photograph is what the review detector is
    -- looking for, so a slice of these deliberately has none.
    IF p_rich THEN
        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, monitor_name, monitor_code,
                                   latitude, longitude, address, debris_type,
                                   site_id, load_call_pct, occurred_at)
        SELECT t.id,
               CASE tt.code WHEN 'LOAD' THEN 'collection'
                            WHEN 'HAULOUT' THEN 'haul_out_start'
                            WHEN 'UNIT' THEN 'work'
                            WHEN 'TM' THEN 'work'
                            WHEN 'INCIDENT' THEN 'report'
                            WHEN 'SURVEY' THEN 'survey'
                            ELSE 'intake' END,
               1, 'complete', u.id, u.full_name, u.monitor_id,
               t.origin_latitude, t.origin_longitude, t.origin_street,
               t.debris_type, t.origin_site_id, t.load_call_pct, t.origin_at
          FROM tickets t
          JOIN ticket_types tt ON tt.id = t.ticket_type_id
          LEFT JOIN users u ON u.id = t.created_by
         WHERE t.project_id = p_project AND t.ticket_type_id = v_tt
           AND NOT EXISTS (SELECT 1 FROM ticket_stages s WHERE s.ticket_id = t.id);

        INSERT INTO ticket_stages (ticket_id, stage_code, sequence, status,
                                   monitor_id, monitor_name, monitor_code,
                                   site_id, load_call_pct, scale_ticket_number,
                                   weight_lbs, occurred_at)
        SELECT t.id,
               CASE tt.code WHEN 'LOAD' THEN 'disposal' ELSE 'haul_out_complete' END,
               3, 'complete', u.id, u.full_name, u.monitor_id,
               t.destination_site_id, t.load_call_pct, t.scale_ticket_number,
               t.gross_weight_lbs, t.destination_at
          FROM tickets t
          JOIN ticket_types tt ON tt.id = t.ticket_type_id
          LEFT JOIN users u ON u.id = t.completed_by
         WHERE t.project_id = p_project AND t.ticket_type_id = v_tt
           AND tt.code IN ('LOAD','HAULOUT') AND t.destination_site_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM ticket_stages s
                            WHERE s.ticket_id = t.id AND s.sequence = 3);

        -- Four in five get their photograph. The fifth is the finding.
        INSERT INTO ticket_media (ticket_id, stage_code, slot, media_kind,
                                  description, storage_url, is_primary,
                                  captured_at, uploaded_by)
        SELECT t.id,
               CASE tt.code WHEN 'LOAD' THEN 'disposal'
                            WHEN 'HAULOUT' THEN 'haul_out_start'
                            ELSE 'work' END,
               CASE tt.code WHEN 'LOAD' THEN 'disposal_photo'
                            WHEN 'HAULOUT' THEN 'origin_photo'
                            ELSE 'before_photo' END,
               'photo', 'Load call photo', '/media/demo/load.svg', true,
               COALESCE(t.destination_at, t.completed_at), t.completed_by
          FROM tickets t
          JOIN ticket_types tt ON tt.id = t.ticket_type_id
         WHERE t.project_id = p_project AND t.ticket_type_id = v_tt
           AND tt.code IN ('LOAD','HAULOUT','UNIT')
           AND (('x' || substr(md5(t.id::text), 1, 8))::bit(32)::bigint % 5) <> 0
           AND NOT EXISTS (SELECT 1 FROM ticket_media md WHERE md.ticket_id = t.id);
        COMMIT;
    END IF;
END
$write$;

-- ---------------------------------------------------------------------------
-- A mix of ticket types, from one total.
--
-- The mix is a jsonb object of ticket type code to share. Left out entirely it
-- is all load tickets, which is what the bulk seed wants. Shares that do not
-- add to one are normalised; types the project has not enabled are skipped and
-- their share goes back to the load tickets.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE adms_demo_fill_tickets(
    p_project uuid, p_target integer, p_batch integer DEFAULT 2000,
    p_mix jsonb DEFAULT NULL, p_rich boolean DEFAULT false)
LANGUAGE plpgsql
AS $fill$
DECLARE
    v_code    text;
    v_mix     jsonb := COALESCE(p_mix, '{"LOAD": 1}'::jsonb);
    v_total   numeric := 0;
    v_type    text;
    v_share   numeric;
    v_count   integer;
    v_written integer := 0;
    v_started timestamptz := clock_timestamp();
    v_enabled text[];
BEGIN
    SELECT project_code INTO v_code FROM projects WHERE id = p_project;

    SELECT array_agg(tt.code) INTO v_enabled
      FROM project_ticket_types ptt JOIN ticket_types tt ON tt.id = ptt.ticket_type_id
     WHERE ptt.project_id = p_project AND ptt.is_active;

    FOR v_type, v_share IN SELECT key, value::text::numeric FROM jsonb_each(v_mix) LOOP
        IF v_type = ANY(v_enabled) THEN v_total := v_total + v_share; END IF;
    END LOOP;
    IF v_total = 0 THEN
        v_mix := '{"LOAD": 1}'::jsonb; v_total := 1;
    END IF;

    RAISE NOTICE '  % : writing % ticket(s)', v_code, p_target;

    -- Everything but the load tickets first, so the load tickets can absorb the
    -- rounding and the total comes out exactly as asked.
    FOR v_type, v_share IN
        SELECT key, value::text::numeric FROM jsonb_each(v_mix)
         WHERE key <> 'LOAD' ORDER BY key
    LOOP
        CONTINUE WHEN NOT (v_type = ANY(v_enabled));
        v_count := floor(p_target * v_share / v_total)::integer;
        CONTINUE WHEN v_count < 1;
        CALL adms_demo_write_tickets(p_project, v_type, v_count, p_batch, p_rich);
        v_written := v_written + v_count;
    END LOOP;

    IF p_target - v_written > 0 THEN
        CALL adms_demo_write_tickets(p_project, 'LOAD', p_target - v_written,
                                     p_batch, p_rich);
    END IF;

    RAISE NOTICE '    % written (%s elapsed)', p_target,
        round(EXTRACT(epoch FROM clock_timestamp() - v_started));
END
$fill$;

-- ---------------------------------------------------------------------------
-- The rules engine pass.
--
-- Paged by id, not by "what is still unpriced". Pricing does not always end at
-- 'processed': a ticket the rules do not match finishes as 'no_match' and one
-- the rules exclude as 'excluded', both of them correct outcomes. Asking again
-- for everything that is not 'processed' would hand back the same rows on the
-- next pass, forever. Walking ids once terminates whatever the engine decides.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE adms_demo_price_project(
    p_project uuid, p_batch integer DEFAULT 2000)
LANGUAGE plpgsql
AS $price$
DECLARE
    v_admin   uuid;
    v_code    text;
    v_ids     uuid[];
    v_id      uuid;
    v_cursor  uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_priced  integer := 0;
    v_started timestamptz := clock_timestamp();
BEGIN
    SELECT id INTO v_admin FROM users WHERE username = 'admin';
    SELECT project_code INTO v_code FROM projects WHERE id = p_project;
    PERFORM set_config('adms.actor_id', v_admin::text, false);

    LOOP
        SELECT array_agg(id ORDER BY id) INTO v_ids FROM (
            SELECT id FROM tickets
             WHERE project_id = p_project AND status = 'completed'
               AND NOT is_void AND processing_state <> 'processed'
               AND id > v_cursor
             ORDER BY id LIMIT p_batch) s;
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

    RAISE NOTICE '  % : % priced (%s)', v_code, v_priced,
        round(EXTRACT(epoch FROM clock_timestamp() - v_started));
END
$price$;

-- ---------------------------------------------------------------------------
-- The rest of a project's working life: a void, an invoice, and a morning of
-- review work. Everything here is small and fixed, because the ticket volume is
-- what makes the lists long and this is what stops a project from being a
-- spreadsheet of identical rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE adms_demo_finish_project(
    p_project uuid, p_profile jsonb DEFAULT '{}'::jsonb)
LANGUAGE plpgsql
AS $finish$
DECLARE
    v_admin uuid; v_manager uuid; v_manager_name text; v_monitor uuid;
    v_base date; v_prime uuid; v_contract uuid;
    v_ticket uuid; v_invoice uuid; v_line integer := 0;
    v_flags integer := COALESCE((p_profile ->> 'flag_sample')::integer, 200);
    v_n integer := 0;
BEGIN
    SELECT starts_on INTO v_base FROM projects WHERE id = p_project;
    SELECT id INTO v_admin FROM users WHERE username = 'admin';

    SELECT pa.user_id, u.full_name INTO v_manager, v_manager_name
      FROM project_assignments pa JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id = p_project AND pa.project_role = 'manager' LIMIT 1;

    SELECT pa.user_id INTO v_monitor
      FROM project_assignments pa
     WHERE pa.project_id = p_project AND pa.project_role = 'monitor' LIMIT 1;

    SELECT contractor_id INTO v_prime FROM project_contractors
     WHERE project_id = p_project AND role_on_project = 'prime' LIMIT 1;
    SELECT contract_id INTO v_contract FROM project_contracts
     WHERE project_id = p_project AND is_primary LIMIT 1;

    PERFORM set_config('adms.actor_id', COALESCE(v_manager, v_admin)::text, false);

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

    -- ------------------------------------------------------- draft invoice
    INSERT INTO invoices (invoice_number, project_id, contractor_id, contract_id,
                          status, period_start, period_end, notes, created_by)
    VALUES (adms_next_number('invoice', 'INV-'), p_project, v_prime, v_contract,
            'draft', v_base, (v_base + 6),
            'First weekly billing period.', COALESCE(v_manager, v_admin))
    RETURNING id INTO v_invoice;

    FOR v_ticket IN
        SELECT tx.id FROM transactions tx
          JOIN tickets t ON t.id = tx.ticket_id
         WHERE tx.project_id = p_project AND tx.contractor_id = v_prime
           AND NOT tx.is_reversal AND tx.superseded_at IS NULL
           AND t.completed_at::date BETWEEN v_base AND (v_base + 6)
         ORDER BY tx.computed_at LIMIT 250
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
              ORDER BY created_at LIMIT v_flags) s;

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

    -- The ones with a finding on them, flagged back to the monitor, and the
    -- fourth one escalated: that is the pattern the review screens exist for.
    FOR v_ticket IN
        SELECT f.subject_id FROM review_flags f
         WHERE f.project_id = p_project AND f.subject_kind = 'ticket'
           AND f.cleared_at IS NULL
         ORDER BY f.raised_at LIMIT 6
    LOOP
        v_n := v_n + 1;
        PERFORM adms_review_item('ticket', v_ticket, p_project,
                                 COALESCE(v_manager, v_admin),
                                 COALESCE(v_manager_name, 'Demo Manager'));
        UPDATE review_items
           SET state = 'flagged',
               notes = 'Sent back to the monitor to correct.',
               reviewed_by = COALESCE(v_manager, v_admin),
               reviewed_by_name = COALESCE(v_manager_name, 'Demo Manager'),
               reviewed_at = now() - (v_n || ' days')::interval
         WHERE subject_kind = 'ticket' AND subject_id = v_ticket;

        IF v_n = 4 THEN
            UPDATE review_items
               SET escalation_level = 'supervisor', escalated_at = now(),
                   escalated_by = COALESCE(v_manager, v_admin),
                   escalation_reason =
                     'Fourth finding from the same monitor this week. This needs '
                     'a conversation, not another correction.'
             WHERE subject_kind = 'ticket' AND subject_id = v_ticket;

            IF v_monitor IS NOT NULL THEN
                INSERT INTO review_alerts (review_item_id, project_id, to_user_id,
                                           subject, body, severity, sent_by,
                                           sent_by_name)
                SELECT id, p_project, v_monitor,
                       'Four tickets sent back this week',
                       'Four of your tickets this week came back with findings. '
                       'Re-shoot what you can and come and find me about the rest.',
                       'serious', COALESCE(v_manager, v_admin),
                       COALESCE(v_manager_name, 'Demo Manager')
                  FROM review_items
                 WHERE subject_kind = 'ticket' AND subject_id = v_ticket;
            END IF;
        END IF;
    END LOOP;
END
$finish$;

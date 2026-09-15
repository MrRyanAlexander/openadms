-- =============================================================================
-- Open ADMS :: showcase seed
--
-- Twenty projects, six declarations, ten thousand tickets. Built to run on a
-- free Postgres rather than a paid one, and built to be varied rather than big:
-- the point of this seed is that no two projects on it look the same.
--
--     two hurricanes            eleven projects between them
--     a flood                   three projects
--     a wildfire                three projects
--     an ice storm              two projects
--     a state river flood       one waterway project, the state as client
--
-- and inside those, six of the seven programs, five kinds of client, seven
-- ticket types, per cubic yard and per ton and per unit and per hour and banded
-- pricing, projects in setup, active, paused, closeout and closed, permits
-- verified and pending and expired, a contract shared by two projects with the
-- line items decided separately on each, a mid-period rate change, an approved
-- invoice that locks its tickets, a corrected certification that reprices what
-- it touched, and loads still out in the field.
--
-- Requires 000_demo_kit.sql, which seed-showcase.sh loads first.
--
-- Controlled by the caller:
--     psql -v tickets=10000 -v seed=0.42 -f seeds/large/002_showcase.sql
--
--   tickets  the TOTAL across all twenty projects, 500 to 10,000. Split with
--            random weights, so the projects come out anywhere from a few dozen
--            tickets to well over a thousand.
--   seed     the random seed, so a run is repeatable. Change it and the same
--            twenty projects come out with a different spread of work on them.
--
-- Every name in here is invented. No storm called Vantage ever made landfall,
-- there is no Millrace County, and the state code is XX throughout.
--
-- Safe to re-run: the numbering continues from the highest DEMO project already
-- present, so a second run adds another twenty rather than colliding.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

\if :{?tickets}
\else
  \set tickets 10000
\endif
\if :{?seed}
\else
  \set seed 0.42
\endif

CREATE OR REPLACE PROCEDURE adms_demo_showcase(
    p_tickets integer, p_seed double precision DEFAULT 0.42)
LANGUAGE plpgsql
AS $showcase$
DECLARE
    c_max_tickets constant integer := 10000;
    c_min_tickets constant integer := 500;

    -- ---------------------------------------------------------------- the plan
    -- One row per project. Order matters: client_of and share_contract point
    -- backwards by position, and are resolved to project codes as the run goes.
    --
    -- size     a weight, before the random jitter below
    -- mix      the ticket types this project's work is made of
    c_plan constant jsonb := $plan$[
      {"storm":"VANTAGE","event_kind":"Hurricane","event_code":"DEMO-DR-101",
       "event_name":"DEMO Hurricane Vantage","place":"Coastal County",
       "program":"row_collection","client_label":"Vantage Coastal County",
       "streams":["VEG","CD","MIXED","WHITE","HHW","HANGER","LEANER","STUMP"],
       "zones":5,"trucks":18,"sub_trucks":8,"monitors":6,"dms":2,"fds":1,
       "rate_change":true,"starts_offset":-60,"ends_offset":60,
       "lat":30.4,"lon":-88.9,"size":9,
       "mix":{"LOAD":74,"HAULOUT":13,"UNIT":8,"INCIDENT":5}},

      {"storm":"VANTAGE","event_kind":"Hurricane","event_code":"DEMO-DR-101",
       "place":"Harbour City","program":"row_collection","client_kind":"local_government",
       "client_label":"City of Vantage Harbour",
       "streams":["VEG","CD","MIXED","HHW","EWASTE"],
       "zones":4,"trucks":12,"sub_trucks":6,"monitors":5,"dms":1,"fds":1,
       "haul_unit":"per_ton","starts_offset":-58,"ends_offset":45,
       "lat":30.2,"lon":-88.6,"size":7,
       "mix":{"LOAD":70,"HAULOUT":18,"INCIDENT":6,"SURVEY":6},
       "extra_types":["SURVEY"]},

      {"storm":"VANTAGE","event_kind":"Hurricane","event_code":"DEMO-DR-101",
       "place":"Barrier Islands","program":"row_collection",
       "client_kind":"tribal_nation","client_label":"Vantage Island Nation",
       "streams":["VEG","CD","SAND"],
       "zones":2,"trucks":6,"sub_trucks":3,"monitors":3,"dms":1,"fds":1,
       "status":"setup","starts_offset":-6,"ends_offset":120,
       "lat":30.0,"lon":-88.3,"size":0,
       "mix":{"LOAD":100}},

      {"storm":"VANTAGE","event_kind":"Hurricane","event_code":"DEMO-DR-101",
       "place":"Coastal PPDR","program":"private_property_debris_removal",
       "client_of_ix":1,"share_contract_ix":1,
       "streams":["CD","MIXED","HHW","WHITE","STUMP"],
       "zones":3,"trucks":10,"sub_trucks":4,"monitors":4,"dms":1,"fds":1,
       "extra_types":["ROE","SURVEY"],"starts_offset":-40,"ends_offset":80,
       "lat":30.5,"lon":-89.1,"size":6,
       "mix":{"LOAD":58,"ROE":22,"SURVEY":8,"UNIT":6,"INCIDENT":6}},

      {"storm":"VANTAGE","event_kind":"Hurricane","event_code":"DEMO-DR-101",
       "place":"Tree Crews","program":"unit_rate_tree","client_of_ix":1,
       "streams":["STUMP","HANGER","LEANER","VEG"],
       "zones":3,"trucks":4,"sub_trucks":2,"monitors":4,"dms":1,"fds":0,
       "starts_offset":-35,"ends_offset":70,
       "lat":30.6,"lon":-88.8,"size":5,
       "mix":{"UNIT":82,"LOAD":12,"INCIDENT":6}},

      {"storm":"VANTAGE","event_kind":"Hurricane","event_code":"DEMO-DR-101",
       "place":"Regional Disposal","program":"disposal_only",
       "client_kind":"state_agency","client_label":"State of Vantage DOT",
       "streams":["VEG","CD","MIXED"],
       "zones":2,"trucks":6,"sub_trucks":12,"monitors":3,"dms":2,"fds":2,
       "haul_unit":"per_ton","starts_offset":-50,"ends_offset":100,
       "lat":30.8,"lon":-89.4,"size":6,
       "mix":{"HAULOUT":88,"INCIDENT":12}},

      {"storm":"BELLWETHER","event_kind":"Hurricane","event_code":"DEMO-DR-102",
       "event_name":"DEMO Hurricane Bellwether","place":"Bayou Parish",
       "program":"row_collection","client_label":"Bellwether Bayou Parish",
       "streams":["VEG","CD","MIXED","WHITE","HHW","HANGER","LEANER"],
       "zones":6,"trucks":16,"sub_trucks":7,"monitors":6,"dms":2,"fds":1,
       "status":"closeout","starts_offset":-150,"ends_offset":-12,
       "lat":29.9,"lon":-91.2,"size":8,
       "mix":{"LOAD":72,"HAULOUT":14,"UNIT":8,"INCIDENT":6}},

      {"storm":"BELLWETHER","event_kind":"Hurricane","event_code":"DEMO-DR-102",
       "place":"Levee District","program":"row_collection",
       "client_kind":"special_district","client_label":"Bellwether Levee District",
       "streams":["VEG","CD","SOIL","MIXED"],
       "zones":3,"trucks":9,"sub_trucks":4,"monitors":4,"dms":1,"fds":1,
       "starts_offset":-120,"ends_offset":30,
       "lat":29.7,"lon":-91.5,"size":5,
       "mix":{"LOAD":78,"HAULOUT":12,"INCIDENT":10}},

      {"storm":"BELLWETHER","event_kind":"Hurricane","event_code":"DEMO-DR-102",
       "place":"Parish PPDR","program":"private_property_debris_removal",
       "client_of_ix":7,"streams":["CD","MIXED","HHW","STUMP","HANGER"],
       "zones":3,"trucks":8,"sub_trucks":3,"monitors":4,"dms":1,"fds":1,
       "extra_types":["ROE"],"starts_offset":-100,"ends_offset":40,
       "lat":30.1,"lon":-91.0,"size":4,
       "mix":{"LOAD":60,"ROE":25,"INCIDENT":8,"UNIT":7}},

      {"storm":"BELLWETHER","event_kind":"Hurricane","event_code":"DEMO-DR-102",
       "place":"Structural Demolition","program":"demolition","client_of_ix":7,
       "streams":["CD","MIXED","HHW"],
       "zones":2,"trucks":7,"sub_trucks":4,"monitors":3,"dms":1,"fds":1,
       "tm":true,"extra_types":["SURVEY"],"starts_offset":-90,"ends_offset":90,
       "lat":30.0,"lon":-91.4,"size":4,
       "mix":{"LOAD":58,"TM":18,"SURVEY":12,"INCIDENT":12}},

      {"storm":"BELLWETHER","event_kind":"Hurricane","event_code":"DEMO-DR-102",
       "place":"Hazard Trees","program":"unit_rate_tree",
       "client_kind":"local_government","client_label":"Bellwether Uplands County",
       "streams":["STUMP","HANGER","LEANER"],
       "zones":2,"trucks":3,"sub_trucks":2,"monitors":3,"dms":1,"fds":0,
       "status":"closed","starts_offset":-180,"ends_offset":-40,
       "lat":30.3,"lon":-91.7,"size":3,
       "mix":{"UNIT":90,"INCIDENT":10}},

      {"storm":"MILLRACE","event_kind":"Flood Event","event_code":"DEMO-DR-103",
       "event_name":"DEMO Flood Event Millrace","place":"Riverside County",
       "program":"row_collection","client_label":"Millrace Riverside County",
       "streams":["VEG","CD","MIXED","SOIL","WHITE","HHW","HANGER","LEANER"],
       "zones":4,"trucks":14,"sub_trucks":6,"monitors":5,"dms":2,"fds":1,
       "rate_change":true,"starts_offset":-45,"ends_offset":55,
       "lat":38.6,"lon":-90.2,"size":7,
       "mix":{"LOAD":73,"HAULOUT":13,"UNIT":6,"INCIDENT":8}},

      {"storm":"MILLRACE","event_kind":"Flood Event","event_code":"DEMO-DR-103",
       "place":"Millrace City","program":"row_collection",
       "client_label":"City of Millrace",
       "streams":["CD","MIXED","SOIL","HHW","EWASTE","WHITE"],
       "zones":3,"trucks":10,"sub_trucks":5,"monitors":4,"dms":1,"fds":1,
       "status":"paused","starts_offset":-40,"ends_offset":8,
       "lat":38.4,"lon":-90.5,"size":5,
       "mix":{"LOAD":76,"HAULOUT":10,"INCIDENT":14}},

      {"storm":"MILLRACE","event_kind":"Flood Event","event_code":"DEMO-DR-103",
       "place":"Flood Demolition","program":"demolition","client_of_ix":12,
       "streams":["CD","MIXED","HHW","SOIL"],
       "zones":2,"trucks":6,"sub_trucks":3,"monitors":3,"dms":1,"fds":1,
       "tm":true,"extra_types":["SURVEY"],"starts_offset":-30,"ends_offset":120,
       "lat":38.8,"lon":-90.0,"size":4,
       "mix":{"LOAD":55,"TM":20,"SURVEY":10,"INCIDENT":15}},

      {"storm":"ASHFALL","event_kind":"Wildfire","event_code":"DEMO-DR-104",
       "event_name":"DEMO Wildfire Ashfall","place":"Ashfall County",
       "program":"row_collection","client_label":"Ashfall County",
       "streams":["CD","MIXED","SOIL","HHW","WHITE","VEHICLE"],
       "zones":4,"trucks":12,"sub_trucks":6,"monitors":5,"dms":2,"fds":1,
       "starts_offset":-55,"ends_offset":65,
       "lat":39.5,"lon":-121.6,"size":7,
       "mix":{"LOAD":74,"HAULOUT":12,"INCIDENT":8,"SURVEY":6},
       "extra_types":["SURVEY"]},

      {"storm":"ASHFALL","event_kind":"Wildfire","event_code":"DEMO-DR-104",
       "place":"Ash and Foundation PPDR",
       "program":"private_property_debris_removal","client_of_ix":15,
       "streams":["CD","MIXED","SOIL","HHW","VEHICLE"],
       "zones":3,"trucks":9,"sub_trucks":4,"monitors":4,"dms":1,"fds":1,
       "tm":true,"extra_types":["ROE","SURVEY"],
       "starts_offset":-50,"ends_offset":95,
       "lat":39.7,"lon":-121.4,"size":6,
       "mix":{"LOAD":52,"ROE":20,"TM":12,"SURVEY":8,"INCIDENT":8}},

      {"storm":"ASHFALL","event_kind":"Wildfire","event_code":"DEMO-DR-104",
       "place":"Hazard Trees","program":"unit_rate_tree","client_of_ix":15,
       "streams":["STUMP","HANGER","LEANER","VEG"],
       "zones":3,"trucks":5,"sub_trucks":2,"monitors":4,"dms":1,"fds":0,
       "starts_offset":-45,"ends_offset":110,
       "lat":39.3,"lon":-121.8,"size":5,
       "mix":{"UNIT":80,"LOAD":12,"INCIDENT":8}},

      {"storm":"GLASSWING","event_kind":"Ice Storm","event_code":"DEMO-DR-105",
       "event_name":"DEMO Ice Storm Glasswing","place":"Glasswing County",
       "program":"row_collection","client_label":"Glasswing County",
       "streams":["VEG","CD","MIXED","HANGER","LEANER","STUMP"],
       "zones":4,"trucks":11,"sub_trucks":5,"monitors":5,"dms":2,"fds":1,
       "status":"closeout","starts_offset":-140,"ends_offset":-20,
       "timezone":"America/New_York",
       "lat":42.6,"lon":-76.5,"size":6,
       "mix":{"LOAD":75,"HAULOUT":12,"UNIT":8,"INCIDENT":5}},

      {"storm":"GLASSWING","event_kind":"Ice Storm","event_code":"DEMO-DR-105",
       "place":"Tree Crews","program":"unit_rate_tree","client_of_ix":18,
       "streams":["HANGER","LEANER","STUMP","VEG"],
       "zones":3,"trucks":4,"sub_trucks":2,"monitors":4,"dms":1,"fds":0,
       "timezone":"America/New_York","starts_offset":-130,"ends_offset":20,
       "lat":42.8,"lon":-76.2,"size":5,
       "mix":{"UNIT":85,"LOAD":9,"INCIDENT":6}},

      {"storm":"MARROWBROOK","event_kind":"River Flood","event_code":"DEMO-DR-106",
       "event_name":"DEMO River Flood Marrowbrook","place":"State Waterway",
       "program":"waterway_marine","client_kind":"state_agency",
       "client_label":"State of Marrowbrook Department of Environment",
       "prime_label":"Marine Recovery Group",
       "streams":["VEG","CD","VEHICLE","SOIL","MIXED"],
       "zones":6,"trucks":10,"sub_trucks":5,"monitors":5,"dms":2,"fds":1,
       "extra_types":["SURVEY"],"starts_offset":-70,"ends_offset":150,
       "timezone":"America/Chicago","lat":44.9,"lon":-93.1,"size":7,
       "mix":{"LOAD":52,"HAULOUT":24,"SURVEY":14,"INCIDENT":10}}
    ]$plan$::jsonb;

    v_n_plan    integer := jsonb_array_length(c_plan);
    v_next      integer;
    v_entry     jsonb;
    v_profile   jsonb;
    v_ids       uuid[] := '{}';
    v_codes     text[] := '{}';
    v_mixes     jsonb[] := '{}';
    v_wants     text[] := '{}';   -- the status each project should end at
    v_weights   numeric[] := '{}';
    v_total_w   numeric := 0;
    v_counts    integer[] := '{}';
    v_assigned  integer := 0;
    v_share     integer;
    v_project   uuid;
    v_ticket    uuid;
    v_invoice   uuid;
    v_equip     uuid;
    v_cert      uuid;
    v_admin     uuid;
    v_manager   uuid;
    v_mon       uuid;
    v_started   timestamptz := clock_timestamp();
    v_before    bigint;
    v_biggest   integer := 1;
    i           integer;
    j           integer;
BEGIN
    IF p_tickets < c_min_tickets OR p_tickets > c_max_tickets THEN
        RAISE EXCEPTION
            'The showcase runs between % and % tickets, not %. For more than '
            'that, the volume seed is the one you want.',
            c_min_tickets, c_max_tickets, p_tickets
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM setseed(p_seed);
    SELECT count(*) INTO v_before FROM tickets;
    SELECT id INTO v_admin FROM users WHERE username = 'admin';

    SELECT COALESCE(max(NULLIF(regexp_replace(project_code, '^DEMO-(\d+)-.*$', '\1'),
                               project_code)::integer), 1) + 1
      INTO v_next
      FROM projects WHERE project_code ~ '^DEMO-\d+-';

    RAISE NOTICE 'Building % demo project(s) across % declaration(s), starting at %.',
        v_n_plan,
        (SELECT count(DISTINCT e ->> 'event_code')
           FROM jsonb_array_elements(c_plan) e),
        lpad(v_next::text, 2, '0');

    -- ------------------------------------------------------------- the build
    FOR i IN 1..v_n_plan LOOP
        v_entry := c_plan -> (i - 1);
        v_profile := v_entry - 'size' - 'mix' - 'client_of_ix' - 'share_contract_ix';

        -- Backwards references resolve to codes now that those projects exist.
        IF v_entry ? 'client_of_ix' THEN
            v_profile := v_profile || jsonb_build_object(
                'client_of', v_codes[(v_entry ->> 'client_of_ix')::integer]);
        END IF;
        IF v_entry ? 'share_contract_ix' THEN
            v_profile := v_profile || jsonb_build_object(
                'share_contract', v_codes[(v_entry ->> 'share_contract_ix')::integer]);
        END IF;

        v_project := adms_demo_build_project(v_next + i - 1, v_profile);
        v_ids   := v_ids || v_project;
        v_codes := v_codes || (SELECT project_code FROM projects WHERE id = v_project);
        v_mixes := v_mixes || COALESCE(v_entry -> 'mix', '{"LOAD":1}'::jsonb);
        v_wants := v_wants || COALESCE(v_entry ->> 'status', 'active');

        -- Size, jittered. Two projects with the same size hint still come out
        -- different, which is the point: a projects list where every row holds
        -- the same number of tickets teaches nobody anything.
        v_weights := v_weights ||
            (COALESCE((v_entry ->> 'size')::numeric, 5) * (0.45 + random() * 1.3));
        COMMIT;
    END LOOP;

    FOR i IN 1..v_n_plan LOOP
        v_total_w := v_total_w + v_weights[i];
        IF v_weights[i] > v_weights[v_biggest] THEN v_biggest := i; END IF;
    END LOOP;

    FOR i IN 1..v_n_plan LOOP
        v_share := floor(p_tickets * v_weights[i] / v_total_w)::integer;
        IF v_weights[i] = 0 THEN v_share := 0; END IF;
        v_counts := v_counts || v_share;
        v_assigned := v_assigned + v_share;
    END LOOP;
    -- The rounding remainder goes to the largest project rather than nowhere.
    v_counts[v_biggest] := v_counts[v_biggest] + (p_tickets - v_assigned);

    -- -------------------------------------------------------------- the work
    FOR i IN 1..v_n_plan LOOP
        CONTINUE WHEN v_counts[i] < 1;
        CALL adms_demo_fill_tickets(v_ids[i], v_counts[i], 1000, v_mixes[i], true);
        CALL adms_demo_price_project(v_ids[i]);
        CALL adms_demo_finish_project(v_ids[i],
             jsonb_build_object('flag_sample', LEAST(150, v_counts[i])));
        COMMIT;
    END LOOP;

    -- ------------------------------------------------------- what happens next
    -- Everything below is one project's worth of state that a fresh seed cannot
    -- produce by generating tickets: work still in the field, money already
    -- approved, a correction that reprices what it touched, a permit that ran
    -- out. Each is put somewhere specific so a walkthrough can find it.

    -- 1. Loads still out. The field app's pending handoff, mid-shift.
    FOR i IN 1..LEAST(3, v_n_plan) LOOP
        j := 1 + ((i * 5) % v_n_plan);
        CONTINUE WHEN v_counts[j] < 20;
        SELECT pa.user_id INTO v_mon FROM project_assignments pa
         WHERE pa.project_id = v_ids[j] AND pa.project_role = 'monitor' LIMIT 1;
        CONTINUE WHEN v_mon IS NULL;

        PERFORM set_config('adms.actor_id', v_mon::text, false);
        INSERT INTO tickets (
            project_id, ticket_type_id, status, contractor_id, equipment_id,
            contract_id, zone_id, driver_name, debris_type,
            origin_street, origin_city, origin_state,
            origin_latitude, origin_longitude, origin_at,
            certified_capacity_cy, created_by, source, data)
        SELECT v_ids[j], tt.id, 'pending_disposal', pc.contractor_id, e.id,
               k.contract_id, z.id, 'Driver ' || (300 + n), s.debris_type_code,
               'Driftwood Avenue', COALESCE(c.city, 'Demo City'), 'XX',
               38.79 + (n * 0.002), -90.32 - (n * 0.002),
               now() - (n * INTERVAL '35 minutes'),
               cert.certified_capacity_cy, v_mon, 'field_app',
               jsonb_build_object('generated', true)
          FROM generate_series(1, 4) n
          JOIN ticket_types tt ON tt.code = 'LOAD'
          JOIN project_contractors pc
            ON pc.project_id = v_ids[j] AND pc.role_on_project = 'prime'
          JOIN project_contracts k ON k.project_id = v_ids[j] AND k.is_primary
          JOIN projects p ON p.id = v_ids[j]
          LEFT JOIN clients c ON c.id = p.client_id
          JOIN LATERAL (SELECT id FROM project_zones
                         WHERE project_id = v_ids[j] ORDER BY zone_code LIMIT 1) z ON true
          JOIN LATERAL (SELECT ps.debris_type_code FROM project_scopes ps
                         WHERE ps.project_id = v_ids[j] AND ps.is_enabled
                           AND ps.debris_type_code IN ('VEG','CD','MIXED','SOIL')
                         LIMIT 1) s ON true
          JOIN LATERAL (
                SELECT pec.equipment_id AS id, pec.certified_capacity_cy
                  FROM project_equipment_certifications pec
                  JOIN equipment eq ON eq.id = pec.equipment_id
                 WHERE pec.project_id = v_ids[j] AND pec.status = 'active'
                   AND eq.contractor_id = pc.contractor_id
                 ORDER BY eq.unit_number OFFSET (n % 3) LIMIT 1) e ON true
          JOIN LATERAL (
                SELECT certified_capacity_cy FROM project_equipment_certifications
                 WHERE project_id = v_ids[j] AND equipment_id = e.id
                   AND status = 'active') cert ON true;

        INSERT INTO pending_handoffs (ticket_id, project_id, handoff_kind, barcode,
                                      issued_by, payload)
        SELECT t.id, v_ids[j], 'pending_disposal',
               'HANDOFF-' || substr(md5(t.id::text), 1, 10), v_mon,
               jsonb_build_object('ticket_number', t.ticket_number,
                                  'debris_type', t.debris_type,
                                  'capacity_cy', t.certified_capacity_cy)
          FROM tickets t
         WHERE t.project_id = v_ids[j] AND t.status = 'pending_disposal'
           AND NOT EXISTS (SELECT 1 FROM pending_handoffs h WHERE h.ticket_id = t.id);
    END LOOP;
    COMMIT;

    -- 2. An approved invoice. Its transactions are locked from here on, which
    -- is what makes the reprocess guard demonstrable on project 7's closeout.
    PERFORM set_config('adms.actor_id', v_admin::text, false);
    SELECT i2.id INTO v_invoice
      FROM invoices i2
     WHERE i2.project_id = v_ids[7] AND i2.status = 'draft'
     ORDER BY i2.created_at LIMIT 1;
    IF v_invoice IS NOT NULL THEN
        UPDATE invoices
           SET status = 'approved', submitted_at = now() - INTERVAL '6 days',
               approved_at = now() - INTERVAL '4 days', approved_by = v_admin,
               notes = 'Approved for payment. Locked: the tickets on it cannot '
                       'be repriced without reversing this first.'
         WHERE id = v_invoice;
    END IF;

    -- 3. A second invoice, submitted and waiting, so the money screens have
    -- both states side by side.
    SELECT pa.user_id INTO v_manager FROM project_assignments pa
     WHERE pa.project_id = v_ids[1] AND pa.project_role = 'manager' LIMIT 1;
    INSERT INTO invoices (invoice_number, project_id, contractor_id, contract_id,
                          status, period_start, period_end, submitted_at, notes,
                          created_by)
    SELECT adms_next_number('invoice', 'INV-'), v_ids[1], pc.contractor_id,
           k.contract_id, 'submitted', p.starts_on + 7, p.starts_on + 13,
           now() - INTERVAL '2 days',
           'Second billing period. With the client for review.',
           COALESCE(v_manager, v_admin)
      FROM projects p
      JOIN project_contractors pc
        ON pc.project_id = p.id AND pc.role_on_project = 'prime'
      JOIN project_contracts k ON k.project_id = p.id AND k.is_primary
     WHERE p.id = v_ids[1]
    RETURNING id INTO v_invoice;

    INSERT INTO invoice_lines (invoice_id, transaction_id, line_number, amount)
    SELECT v_invoice, tx.id, row_number() OVER (ORDER BY tx.computed_at), tx.amount
      FROM transactions tx
      JOIN tickets t ON t.id = tx.ticket_id
     WHERE tx.project_id = v_ids[1] AND NOT tx.is_reversal
       AND tx.superseded_at IS NULL
       AND t.completed_at::date BETWEEN (SELECT starts_on + 7 FROM projects WHERE id = v_ids[1])
                                    AND (SELECT starts_on + 13 FROM projects WHERE id = v_ids[1])
       AND NOT EXISTS (SELECT 1 FROM invoice_lines il WHERE il.transaction_id = tx.id)
     LIMIT 120;
    COMMIT;

    -- 4. A truck that was measured wrong. Correcting the certification queues
    -- every ticket it priced, and repricing one of them writes the reversal and
    -- the replacement side by side in the ledger.
    SELECT pec.id, pec.equipment_id INTO v_cert, v_equip
      FROM project_equipment_certifications pec
      JOIN tickets t ON t.certification_id = pec.id
     WHERE pec.project_id = v_ids[12] AND pec.status = 'active'
     GROUP BY pec.id, pec.equipment_id
    HAVING count(*) > 3
     ORDER BY count(*) DESC
     LIMIT 1;

    IF v_cert IS NOT NULL THEN
        -- A certification in force is never edited. The correction is a new row
        -- that supersedes it and inherits its applies_from, so it reaches back
        -- over the tickets the old number priced.
        INSERT INTO project_equipment_certifications (
            project_id, equipment_id, certified_capacity_cy, tare_weight_lbs,
            method, measured_on, supersedes_id, notes, created_by)
        SELECT project_id, equipment_id, round(certified_capacity_cy * 0.85, 2),
               tare_weight_lbs, 'correction', current_date, id,
               'Re-measured after the tailgate extension was removed.', v_admin
          FROM project_equipment_certifications WHERE id = v_cert
        RETURNING id INTO v_cert;

        PERFORM adms_queue_reprocess('certification', v_cert,
                                     'Certified capacity corrected on re-measure');

        SELECT t.id INTO v_ticket FROM tickets t
         WHERE t.project_id = v_ids[12] AND t.needs_reprocess AND NOT t.is_void
           AND t.processing_state = 'processed'
           AND NOT EXISTS (SELECT 1 FROM adms_ticket_invoice_lock(t.id))
         ORDER BY t.id LIMIT 1;

        IF v_ticket IS NOT NULL THEN
            PERFORM adms_reprocess_ticket(v_ticket,
                'Certified capacity corrected on re-measure', v_admin);
        END IF;
    END IF;
    COMMIT;

    -- 5. A permit that ran out on an operating site, which the permit watch is
    -- there to shout about, and one still pending after three weeks.
    -- A permit does not expire by changing its status: the status stays
    -- verified and the document it points at runs out. That is what the watch
    -- view calls expired, and it is the case the alert feed has to catch.
    UPDATE documents d
       SET expires_on = current_date - 9,
           title = d.title || ' (renewal pending)'
      FROM project_sites ps
     WHERE ps.project_id = v_ids[13] AND ps.permit_document_id = d.id;

    UPDATE project_sites
       SET permit_notes = 'Permit ran out nine days ago. Renewal is with the '
                          'state. The site is still taking loads.'
     WHERE project_id = v_ids[13] AND permit_status = 'verified';

    UPDATE project_sites
       SET permit_requested_on = current_date - 21
     WHERE project_id = v_ids[8] AND permit_status = 'pending';

    -- 6. The statuses the plan asked for. Set last because a project that is
    -- closed, paused or still in setup cannot take field tickets, and these all
    -- had work done on them first.
    FOR i IN 1..v_n_plan LOOP
        IF v_wants[i] <> 'active' THEN
            UPDATE projects SET status = v_wants[i] WHERE id = v_ids[i];
        END IF;
    END LOOP;

    -- 7. The project still in setup: codes written, nothing priced yet, and no
    -- rule on the load ticket. That is what a project looks like on day three,
    -- it is why the readiness panel exists, and it is why this one has no
    -- tickets on it. The gate would have refused them.
    DELETE FROM rates r
     USING service_codes sc
     WHERE sc.id = r.service_code_id AND sc.project_id = v_ids[3];

    DELETE FROM rule_statements rs
     USING rules ru
     WHERE ru.id = rs.rule_id AND ru.project_id = v_ids[3]
       AND ru.ticket_type_id = (SELECT id FROM ticket_types WHERE code = 'LOAD');

    DELETE FROM rules
     WHERE project_id = v_ids[3]
       AND ticket_type_id = (SELECT id FROM ticket_types WHERE code = 'LOAD');
    COMMIT;

    ANALYZE tickets;
    ANALYZE transactions;
    ANALYZE audit_events;

    RAISE NOTICE 'Done. % ticket(s) across % project(s) in %s.',
        (SELECT count(*) FROM tickets) - v_before, v_n_plan,
        round(EXTRACT(epoch FROM clock_timestamp() - v_started));
END
$showcase$;

CALL adms_demo_showcase(:tickets, :seed);

DROP PROCEDURE IF EXISTS adms_demo_showcase(integer, double precision);

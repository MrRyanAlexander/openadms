-- =============================================================================
-- Open ADMS :: optional volume seed
--
-- M6 asked a question the demo seed cannot answer: "Work a project with tens of
-- thousands of tickets: list, filter, sort, then export." A hundred tickets
-- will make any list look fast.
--
-- This is deliberately NOT part of setup.sh. `npm run setup` builds the same
-- database it has always built, which is what the Railway and Netlify path
-- depends on. This file is reached only through `npm run db:seed:large`, and it
-- says what it is about to do before it does it.
--
-- It adds tickets to the existing demo project rather than inventing a second
-- one, because the whole point is to exercise the screens against a project
-- that is already configured: its contractors, trucks, certifications, rules,
-- rates and service codes all apply, so the tickets price for real.
--
-- Volume is controlled by the caller:
--     psql -v tickets=25000 -f seeds/large/001_volume.sql
-- The wrapper script passes its argument through. Run without it and the
-- default below applies.
--
-- Safe to re-run. Each run adds another batch and says how many are there now.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off
\if :{?tickets}
\else
  \set tickets 25000
\endif

SELECT set_config('adms.large_tickets', :'tickets', false);

DO $volume$
DECLARE
    v_target    integer := COALESCE(
        NULLIF(current_setting('adms.large_tickets', true), '')::integer, 25000);
    v_project   uuid;
    v_admin     uuid;
    v_tt_load   uuid;
    v_prime     uuid;
    v_contract  uuid;
    v_trucks    uuid[];
    v_monitors  uuid[];
    v_zones     uuid[];
    v_sites     uuid[];
    v_debris    text[];
    v_streets   text[];
    v_base      date;
    v_before    integer;
    v_batch     integer := 2000;
    v_done      integer := 0;
    v_priced    integer := 0;
    v_started   timestamptz := clock_timestamp();
    v_ticket    uuid;
BEGIN
    SELECT id, starts_on INTO v_project, v_base
      FROM projects WHERE project_code = 'STL-2026-ROW';

    IF v_project IS NULL THEN
        RAISE EXCEPTION
            'The volume seed builds on the demo project, and STL-2026-ROW is not '
            'here. Run ./setup.sh --with-demo first.'
            USING ERRCODE = 'no_data_found';
    END IF;

    IF v_target < 1 OR v_target > 250000 THEN
        RAISE EXCEPTION 'Ask for between 1 and 250000 tickets, not %', v_target
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT id INTO v_admin FROM users WHERE username = 'admin';
    SELECT count(*) INTO v_before FROM tickets WHERE project_id = v_project;

    SELECT tt.id INTO v_tt_load
      FROM ticket_types tt
      JOIN project_ticket_types ptt ON ptt.ticket_type_id = tt.id
     WHERE ptt.project_id = v_project AND ptt.is_active AND tt.code = 'LOAD'
     LIMIT 1;

    SELECT pc.contractor_id INTO v_prime
      FROM project_contractors pc
     WHERE pc.project_id = v_project AND pc.role_on_project = 'prime' LIMIT 1;

    SELECT contract_id INTO v_contract
      FROM project_contracts WHERE project_id = v_project AND is_primary LIMIT 1;

    -- Everything below is drawn from what the project already has, so a ticket
    -- generated here resolves a certification and matches a rule exactly as one
    -- created in the field would.
    SELECT array_agg(pec.equipment_id) INTO v_trucks
      FROM project_equipment_certifications pec
     WHERE pec.project_id = v_project AND pec.status = 'active';

    SELECT array_agg(pa.user_id) INTO v_monitors
      FROM project_assignments pa
     WHERE pa.project_id = v_project AND pa.is_active AND pa.can_create_tickets;

    SELECT array_agg(id) INTO v_zones
      FROM project_zones WHERE project_id = v_project AND is_active;

    SELECT array_agg(ps.site_id) INTO v_sites
      FROM project_sites ps
      JOIN disposal_sites ds ON ds.id = ps.site_id
     WHERE ps.project_id = v_project AND ps.is_active AND ds.is_active;

    -- Weighted by the mix the project already runs, rather than one slot per
    -- enabled stream. An even split would put a third of the volume on white
    -- goods, which no rule prices on a load ticket, and the money screens would
    -- then be exercised against a project that does not look like this one.
    SELECT array_agg(code ORDER BY code, slot) INTO v_debris
      FROM (
          SELECT t.debris_type AS code,
                 generate_series(1, GREATEST(1, LEAST(8, count(*) / 4))::int) AS slot
            FROM tickets t
           WHERE t.project_id = v_project
             AND NOT COALESCE((t.data ->> 'generated')::boolean, false)
             AND t.debris_type IS NOT NULL
           GROUP BY t.debris_type
      ) weighted;

    -- A project with no history yet falls back to what it has authorised.
    IF v_debris IS NULL THEN
        SELECT array_agg(ps.debris_type_code) INTO v_debris
          FROM project_scopes ps
          JOIN debris_types dt ON dt.code = ps.debris_type_code
         WHERE ps.project_id = v_project AND ps.is_enabled AND dt.is_active
           AND dt.ticket_type_codes @> ARRAY['LOAD'];
    END IF;

    IF v_trucks IS NULL OR v_monitors IS NULL OR v_sites IS NULL
       OR v_debris IS NULL OR v_tt_load IS NULL THEN
        RAISE EXCEPTION
            'The demo project is missing something this seed builds on: trucks %, '
            'monitors %, sites %, streams %, load ticket type %',
            v_trucks IS NOT NULL, v_monitors IS NOT NULL, v_sites IS NOT NULL,
            v_debris IS NOT NULL, v_tt_load IS NOT NULL
            USING ERRCODE = 'check_violation';
    END IF;

    v_streets := ARRAY['Paddock Drive', 'Shackelford Road', 'Lindbergh Boulevard',
                       'Chambers Road', 'Dunn Road', 'Washington Street',
                       'Florissant Road', 'Howdershell Road', 'New Halls Ferry Road',
                       'Patterson Road', 'Coburg Lands Drive', 'Elm Grove Lane'];

    RAISE NOTICE 'Generating % ticket(s) on % (% already there).',
        v_target, 'STL-2026-ROW', v_before;

    -- Tickets are written set-based, a batch per statement. The per-row triggers
    -- still run, which is the point: ticket numbering, the readiness gate and
    -- the audit trail are all exercised at volume rather than bypassed.
    SET LOCAL adms.enforce_gate = 'on';
    SET LOCAL adms.actor_name = 'volume seed';
    SET LOCAL adms.actor_role = 'admin';
    SET LOCAL adms.source = 'import';
    PERFORM set_config('adms.actor_id', v_admin::text, true);

    WHILE v_done < v_target LOOP
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
            v_project, v_tt_load, 'completed', v_prime, e.id,
            v_contract,
            CASE WHEN v_zones IS NULL THEN NULL
                 ELSE v_zones[1 + (n % array_length(v_zones, 1))] END,
            'Driver ' || (100 + (n % 240)),
            e.barcode,
            v_debris[1 + (n % array_length(v_debris, 1))],
            (1000 + (n % 900) * 7)::text,
            v_streets[1 + (n % array_length(v_streets, 1))],
            'Florissant', 'MO',
            38.780000 + ((n % 97) * 0.00041),
            -90.340000 - ((n % 89) * 0.00037),
            stamp,
            v_sites[1 + (n % array_length(v_sites, 1))],
            38.789200, -90.322400,
            stamp + INTERVAL '47 minutes',
            -- A spread of load calls, including the full calls the review
            -- detector is meant to find at this volume.
            (ARRAY[40, 50, 60, 70, 75, 80, 90, 100])[1 + (n % 8)],
            pec.certified_capacity_cy,
            m.user_id, m.user_id,
            stamp + INTERVAL '47 minutes',
            'field_app',
            jsonb_build_object('load_call_source', 'visual', 'generated', true)
        FROM generate_series(v_done + 1, LEAST(v_done + v_batch, v_target)) AS n
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
            SELECT pec2.certified_capacity_cy
              FROM project_equipment_certifications pec2
             WHERE pec2.project_id = v_project AND pec2.equipment_id = e.id
               AND pec2.status = 'active'
        ) pec
        CROSS JOIN LATERAL (
            SELECT v_monitors[1 + (n % array_length(v_monitors, 1))] AS user_id
        ) m;

        v_done := LEAST(v_done + v_batch, v_target);
        RAISE NOTICE '  % of % ticket(s) written (%s elapsed)',
            v_done, v_target,
            round(EXTRACT(epoch FROM clock_timestamp() - v_started));
    END LOOP;

    -- Pricing. One engine pass per ticket, because that is what the engine does
    -- and a shortcut here would leave the money screens showing numbers no rule
    -- produced.
    RAISE NOTICE 'Pricing the new tickets through the rules engine.';
    FOR v_ticket IN
        SELECT id FROM tickets
         WHERE project_id = v_project
           AND status = 'completed' AND NOT is_void
           AND processing_state <> 'processed'
         ORDER BY created_at
    LOOP
        PERFORM adms_process_ticket(v_ticket, v_admin);
        v_priced := v_priced + 1;
        IF v_priced % 2000 = 0 THEN
            RAISE NOTICE '  % ticket(s) priced (%s elapsed)', v_priced,
                round(EXTRACT(epoch FROM clock_timestamp() - v_started));
        END IF;
    END LOOP;

    RAISE NOTICE 'Done. % ticket(s) added, % priced, % on the project now, %s total.',
        v_target, v_priced,
        (SELECT count(*) FROM tickets WHERE project_id = v_project),
        round(EXTRACT(epoch FROM clock_timestamp() - v_started));
END
$volume$;

ANALYZE tickets;
ANALYZE transactions;
ANALYZE audit_events;

-- =============================================================================
-- Open ADMS :: optional volume seed
--
-- The question the worked demo cannot answer: "Work a project with a hundred
-- thousand tickets: list, filter, sort, then export." A hundred tickets will
-- make any list look fast.
--
-- This builds as many complete demo projects as you ask for and spreads a
-- ticket total across them, pricing every one through the rules engine. The
-- projects themselves are built by 000_demo_kit.sql, which has to be loaded
-- first; seed-large.sh does that for you.
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
-- Every project it builds is a DEMO project with an invented storm name, in an
-- invented county, in state XX. Nothing it writes can be mistaken for real data.
--
-- For a smaller and far more varied database, 002_showcase.sql builds twenty
-- projects across five events inside ten thousand tickets. That one is the
-- better demonstration; this one is the better stress test.
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
        CALL adms_demo_price_project(v_targets[i]);
        IF v_targets[i] = ANY(v_new) THEN
            -- The working tail: haul outs, unit rate work and incidents on top
            -- of the load tickets, then the invoice and the review sample.
            CALL adms_demo_fill_tickets(
                v_targets[i], 42, 2000,
                '{"HAULOUT": 24, "UNIT": 12, "INCIDENT": 6}'::jsonb);
            CALL adms_demo_price_project(v_targets[i]);
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

DROP PROCEDURE IF EXISTS adms_demo_volume(integer, integer);

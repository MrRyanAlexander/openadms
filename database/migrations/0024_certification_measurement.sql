-- ===========================================================================
-- 0024  Certification measurement
--
-- The requirement, in one line:
--
--   "Do not just record the answer. Record the measurements that produced the
--    answer."
--
-- Until now a certification was a single number a human typed. Capacity times
-- the monitor's load call is the billable volume on every load ticket, so the
-- entire defence of a load rests on that figure, and nothing in the system
-- could say where it came from. If someone asks how we determined a trailer is
-- 30 CY, the answer has to be the sections, the dimensions, the formula and the
-- arithmetic, not somebody's memory.
--
-- Why the geometry is not optional. A high side end dump with a rounded bottom,
-- interior 288 by 96 inches, 60 inches of straight side on a 14 inch bottom
-- curve, holds 1,921,267 cubic inches, which is 41.18 CY. Measured as a box
-- floor to rail it comes out at 43.85 CY. That is 2.67 CY on every load that
-- trailer hauls, about 6.5 percent, and at 1,500 loads called at 80 percent it
-- is roughly 3,200 CY that were never in the trailer. Same class of error as
-- the tare read as 3 instead of 1 that put 40 CY on a trailer for five days.
--
-- Four tables. Two are catalogs, because the point is a controlled set of
-- correct formulas rather than a CAD system:
--
--   container_types      what is being measured, and what is expected of it
--   measurement_shapes   the calculation methods, with their dimensions
--   certification_measurements  one worksheet per certification
--   certification_sections      the shapes that make it up
--
-- Base plus additions minus deductions equals the total. The components are
-- kept so a reviewer can see how the number was produced, and the total is
-- computed by trigger so it can never drift from its parts.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- The calculation methods.
--
-- Adding a shape is a row plus a branch in adms_shape_volume. Everything here
-- is in inches, because that is what comes off a tape measure and because the
-- field app has to hand the monitor a cubic inch figure to write on the paper
-- form.
-- ---------------------------------------------------------------------------
CREATE TABLE measurement_shapes (
    code             text PRIMARY KEY,
    label            text NOT NULL,
    description      text NOT NULL,
    -- Ordered list of {key, label, help, required}. The field app and the back
    -- office both build their form from this, so a new shape needs no client
    -- release.
    dimension_schema jsonb NOT NULL DEFAULT '[]'::jsonb,
    formula_note     text NOT NULL,
    diagram_key      text,
    is_active        boolean NOT NULL DEFAULT true,
    sort_order       integer NOT NULL DEFAULT 0,
    CONSTRAINT shape_schema_is_array CHECK (jsonb_typeof(dimension_schema) = 'array')
);

COMMENT ON TABLE measurement_shapes IS
    'The controlled set of shapes a container can be measured as. Deliberately '
    'not a geometry editor: these are the forms debris equipment actually '
    'takes, each with one correct formula.';

INSERT INTO measurement_shapes (code, label, description, dimension_schema, formula_note, diagram_key, sort_order) VALUES
('rectangular', 'Rectangular box',
 'Four vertical walls and a flat floor. Most rolloff boxes and most trailer bodies.',
 '[{"key":"length","label":"Interior length","help":"Front wall to the inside of the tailgate","required":true},
   {"key":"width","label":"Interior width","help":"Inside of one side wall to the other","required":true},
   {"key":"height","label":"Interior height","help":"Floor to the top rail","required":true}]'::jsonb,
 'Length times width times height.', 'box', 10),

('tapered_sides', 'Sloped sides',
 'Side walls that lean out, so the opening is wider than the floor. Common on grapple bodies with a flared top.',
 '[{"key":"length","label":"Interior length","help":"Front wall to tailgate","required":true},
   {"key":"width_bottom","label":"Width at the floor","help":"Inside wall to wall at the floor","required":true},
   {"key":"width_top","label":"Width at the top rail","help":"Inside wall to wall at the opening","required":true},
   {"key":"height","label":"Height of this section","help":"Floor to top rail for the sloped part only","required":true}]'::jsonb,
 'Length times height times the average of the two widths.', 'taper-side', 20),

('tapered_end', 'Sloped end wall',
 'A headboard or tailgate that rakes, so the floor is shorter or longer than the opening.',
 '[{"key":"width","label":"Interior width","required":true},
   {"key":"length_bottom","label":"Length at the floor","required":true},
   {"key":"length_top","label":"Length at the top rail","required":true},
   {"key":"height","label":"Height of this section","required":true}]'::jsonb,
 'Width times height times the average of the two lengths.', 'taper-end', 30),

('prismatoid', 'All four walls sloped',
 'Both the sides and the ends lean. Measured at the floor and at the opening.',
 '[{"key":"length_bottom","label":"Length at the floor","required":true},
   {"key":"width_bottom","label":"Width at the floor","required":true},
   {"key":"length_top","label":"Length at the top rail","required":true},
   {"key":"width_top","label":"Width at the top rail","required":true},
   {"key":"height","label":"Interior height","required":true}]'::jsonb,
 'Prismatoid rule: height over six, times the floor area plus four times the mid area plus the top area.',
 'prismatoid', 40),

('round_bottom', 'Vertical sides on a curved floor',
 'The highside or round bottom trailer. The floor is a section of a circle, so length times width times height overstates it.',
 '[{"key":"length","label":"Interior length","help":"Front wall to tailgate","required":true},
   {"key":"width","label":"Interior width","help":"At the widest point, where the straight sides begin","required":true},
   {"key":"straight_height","label":"Straight side height","help":"From where the curve ends up to the top rail","required":true},
   {"key":"curve_depth","label":"Depth of the curve","help":"From the bottom of the curve up to where the straight sides begin","required":true}]'::jsonb,
 'Length times the straight rectangle plus the circular segment the curved floor cuts.',
 'round-bottom', 50),

('half_cylinder', 'Half round trough',
 'A body whose whole cross section is a half circle, with no straight side above it.',
 '[{"key":"length","label":"Interior length","required":true},
   {"key":"diameter","label":"Interior diameter","help":"Across the top, rail to rail","required":true}]'::jsonb,
 'Length times pi times diameter squared over eight.', 'half-cylinder', 60),

('cylinder', 'Round container',
 'An upright round container, such as a tank or a drum used for a special class stream.',
 '[{"key":"diameter","label":"Interior diameter","required":true},
   {"key":"height","label":"Interior height","required":true}]'::jsonb,
 'Pi times the radius squared times the height.', 'cylinder', 70),

('triangular_prism', 'Wedge',
 'A section that tapers to nothing, such as the void under a sloped headboard.',
 '[{"key":"length","label":"Length","required":true},
   {"key":"width","label":"Width","required":true},
   {"key":"height","label":"Height at the tall end","required":true}]'::jsonb,
 'Length times width times height, halved.', 'wedge', 80),

('manual_volume', 'Computed off the system',
 'A volume worked out another way and entered directly. Always raises a review flag, because nothing here can check it.',
 '[{"key":"cubic_inches","label":"Cubic inches","help":"The figure you calculated, and say how in the note","required":true}]'::jsonb,
 'As entered. Nothing is recomputed.', NULL, 90);

-- ---------------------------------------------------------------------------
-- What is being measured.
--
-- Type carries the expectations: which photographs the certification needs,
-- what capacity is plausible for this kind of equipment, and a starting
-- worksheet so a monitor in the field is not building one from nothing.
-- ---------------------------------------------------------------------------
CREATE TABLE container_types (
    code                 text PRIMARY KEY,
    label                text NOT NULL,
    category             text NOT NULL,
    typical_use          text NOT NULL,
    description          text,
    -- A worksheet template. Same shape as certification_sections rows.
    default_sections     jsonb NOT NULL DEFAULT '[]'::jsonb,
    required_photo_slots text[] NOT NULL DEFAULT ARRAY['front', 'side', 'interior', 'placard'],
    -- The plausible band for this kind of equipment. A measurement outside it
    -- is not refused, it is flagged, because unusual equipment is real.
    typical_min_cy       numeric(8, 2),
    typical_max_cy       numeric(8, 2),
    diagram_key          text,
    is_system            boolean NOT NULL DEFAULT true,
    is_active            boolean NOT NULL DEFAULT true,
    sort_order           integer NOT NULL DEFAULT 0,
    CONSTRAINT container_category_valid CHECK (category IN (
        'truck_body', 'trailer', 'container', 'other')),
    CONSTRAINT container_sections_is_array CHECK (
        jsonb_typeof(default_sections) = 'array'),
    CONSTRAINT container_band_ordered CHECK (
        typical_min_cy IS NULL OR typical_max_cy IS NULL
        OR typical_min_cy <= typical_max_cy)
);

COMMENT ON TABLE container_types IS
    'What kind of container is being measured and what is expected of it. The '
    'requirement was explicit that the workflow has to know the type, the '
    'intended use and the shape before anybody starts measuring.';

INSERT INTO container_types (code, label, category, typical_use, description,
        default_sections, required_photo_slots, typical_min_cy, typical_max_cy,
        diagram_key, sort_order) VALUES
('rolloff_box', 'Rolloff box', 'container',
 'Dropped at a collection site and hauled on a rolloff truck',
 'Rectangular, open at the top, four interior walls and a floor. The door counts as part of the enclosed measurement when it closes fully.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 10, 50, 'box', 10),

('rolloff_trailer', 'Rolloff trailer', 'trailer',
 'Rolloff box carried on a trailer chassis',
 'Measured as the box, not the chassis.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 20, 60, 'box', 20),

('grapple_body', 'Grapple truck body', 'truck_body',
 'Self loading knuckleboom working the collection side',
 'Usually a rectangular lower body with the side walls flared out above it, and often a raked headboard. Two sections, sometimes three.',
 '[{"label":"Lower body","shape_code":"rectangular","role":"base"},
   {"label":"Top flare","shape_code":"tapered_sides","role":"addition"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 25, 60, 'grapple', 30),

('high_side_end_dump', 'High side end dump trailer', 'trailer',
 'Hauling to the debris management site and out to final disposal',
 'Flat floor, straight walls. Measure the interior, not the outside of the sheet.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 30, 60, 'box', 40),

('round_bottom_end_dump', 'Round bottom end dump trailer', 'trailer',
 'Hauling to the debris management site and out to final disposal',
 'Straight sides on a curved floor, also called a highside. Length times width times height overstates this shape and has to be refused.',
 '[{"label":"Main body","shape_code":"round_bottom","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 30, 60, 'round-bottom', 50),

('live_floor_trailer', 'Aluminum live floor trailer', 'trailer',
 'Haul out from the debris management site, usually on the reduction stream',
 'Walking floor, long and square in section. High capacity, so a measurement error here is expensive.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 80, 140, 'box', 60),

('tandem_dump_truck', 'Tandem dump truck body', 'truck_body',
 'Collection and short hauls',
 'Straight dump body on a tandem chassis.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 8, 25, 'box', 70),

('pup_trailer', 'Pup trailer', 'trailer',
 'Pulled behind a dump truck as a second box',
 'Measured separately from the truck it runs behind. Two certifications, never one.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 12, 40, 'box', 80),

('custom_dump_trailer', 'Custom dump trailer', 'trailer',
 'Small contractor equipment on residential collection',
 'Often fold down sides, removable extensions and intrusions the standard shapes do not cover. Expect several sections and deductions.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 5, 30, 'custom', 90),

('hooklift_box', 'Hooklift box', 'container',
 'Swapped on and off a hooklift chassis',
 'Rectangular, sometimes with a sloped front.',
 '[{"label":"Main body","shape_code":"rectangular","role":"base"}]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], 10, 40, 'box', 100),

('other_container', 'Other', 'other',
 'Anything the catalog does not cover',
 'Build it from sections. If the shape genuinely is not here, say so in the notes so the catalog can grow.',
 '[]'::jsonb,
 ARRAY['front', 'side', 'interior', 'placard', 'measurement'], NULL, NULL, NULL, 200);

-- ---------------------------------------------------------------------------
-- One worksheet per certification.
--
-- This is the digital copy of the paper form the monitor fills out standing at
-- the trailer, which is why paper_form_number is here: the two have to be able
-- to find each other during an audit.
-- ---------------------------------------------------------------------------
CREATE TABLE certification_measurements (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    certification_id      uuid NOT NULL UNIQUE
                          REFERENCES project_equipment_certifications (id)
                          ON DELETE CASCADE,
    container_type_code   text NOT NULL REFERENCES container_types (code)
                          ON UPDATE CASCADE,
    intended_use          text,
    measurement_method    text NOT NULL DEFAULT 'tape',

    measured_by           uuid REFERENCES users (id) ON DELETE SET NULL,
    measured_by_name      text,
    measured_on           date NOT NULL DEFAULT current_date,

    -- Two questions that change the number and that people answer differently
    -- unless they are asked outright.
    interior_only         boolean NOT NULL DEFAULT true,
    door_included         boolean NOT NULL DEFAULT true,

    paper_form_number     text,
    rounding_rule         text NOT NULL DEFAULT 'exact',

    -- Written by the engine. Never typed, never updated by hand.
    base_cubic_inches     numeric(16, 3) NOT NULL DEFAULT 0,
    addition_cubic_inches numeric(16, 3) NOT NULL DEFAULT 0,
    deduction_cubic_inches numeric(16, 3) NOT NULL DEFAULT 0,
    total_cubic_inches    numeric(16, 3) NOT NULL DEFAULT 0,
    total_cubic_feet      numeric(14, 4) NOT NULL DEFAULT 0,
    total_cubic_yards     numeric(12, 4) NOT NULL DEFAULT 0,
    section_count         integer NOT NULL DEFAULT 0,

    device_notes          text,
    created_by            uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT measurement_method_valid CHECK (measurement_method IN (
        'tape', 'laser', 'manufacturer_drawing', 'other')),
    CONSTRAINT measurement_rounding_valid CHECK (rounding_rule IN (
        'exact', 'nearest_tenth', 'nearest_half', 'nearest_whole', 'down_whole'))
);

CREATE INDEX certification_measurements_type_idx
    ON certification_measurements (container_type_code);

SELECT adms_attach_touch('certification_measurements');
SELECT adms_attach_audit('certification_measurements');

COMMENT ON TABLE certification_measurements IS
    'The measurement worksheet behind one certification. Its totals are derived '
    'from the sections, so the certified capacity is reproducible rather than '
    'asserted.';
COMMENT ON COLUMN certification_measurements.door_included IS
    'Whether the tailgate or door is inside the measured volume. It is when the '
    'door closes fully, which is the usual case and the default, but a body '
    'measured to the rail with the gate open is a different number.';
COMMENT ON COLUMN certification_measurements.rounding_rule IS
    'How the certified capacity is taken from the exact volume. Money depends '
    'on this, so it is recorded rather than assumed.';

-- ---------------------------------------------------------------------------
-- The shapes that make up the worksheet.
--
-- "The measurement model cannot assume there will always be one shape." A
-- grapple body is a box plus a flare. A custom trailer is a box minus two wheel
-- well intrusions plus a pair of side extensions. Each row is one measured
-- shape with its own dimensions and its own arithmetic.
-- ---------------------------------------------------------------------------
CREATE TABLE certification_sections (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    measurement_id        uuid NOT NULL REFERENCES certification_measurements (id)
                          ON DELETE CASCADE,
    sequence              integer NOT NULL,
    label                 text NOT NULL,
    shape_code            text NOT NULL REFERENCES measurement_shapes (code)
                          ON UPDATE CASCADE,
    role                  text NOT NULL DEFAULT 'base',
    -- Two wheel wells are one row with a quantity, not two rows somebody has to
    -- keep in step.
    quantity              integer NOT NULL DEFAULT 1,
    dimensions            jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Both written by trigger: one of them, and then all of them.
    unit_cubic_inches     numeric(16, 3) NOT NULL DEFAULT 0,
    computed_cubic_inches numeric(16, 3) NOT NULL DEFAULT 0,

    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),

    UNIQUE (measurement_id, sequence),
    CONSTRAINT section_role_valid CHECK (role IN ('base', 'addition', 'deduction')),
    CONSTRAINT section_quantity_sane CHECK (quantity BETWEEN 1 AND 99),
    CONSTRAINT section_has_a_label CHECK (COALESCE(btrim(label), '') <> ''),
    CONSTRAINT section_dimensions_is_object CHECK (
        jsonb_typeof(dimensions) = 'object')
);

CREATE INDEX certification_sections_measurement_idx
    ON certification_sections (measurement_id, sequence);

SELECT adms_attach_touch('certification_sections');

COMMENT ON TABLE certification_sections IS
    'One measured shape. Base plus additions minus deductions is the volume, '
    'and keeping the parts is what lets a reviewer see how the total was '
    'reached instead of taking it on trust.';

-- ---------------------------------------------------------------------------
-- Read one dimension off a section, in inches.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_dim(p_dims jsonb, p_key text,
                                    p_required boolean DEFAULT true)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v numeric;
BEGIN
    BEGIN
        v := NULLIF(btrim(p_dims ->> p_key), '')::numeric;
    EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'The % measurement is not a number', p_key
            USING ERRCODE = 'check_violation';
    END;

    IF v IS NULL THEN
        IF p_required THEN
            RAISE EXCEPTION 'This shape needs a % measurement', p_key
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN 0;
    END IF;

    IF v < 0 THEN
        RAISE EXCEPTION 'A % of % is not a measurement', p_key, v
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN v;
END;
$$;

-- ---------------------------------------------------------------------------
-- The volume of one shape, in cubic inches.
--
-- Every formula in the system lives here exactly once. The field app, the back
-- office, the reprice path and the tests all end up in this function, which is
-- the only way the number on the monitor's screen and the number on the
-- certification can be guaranteed to agree.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_shape_volume(p_shape text, p_dims jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_l  numeric; v_w  numeric; v_h  numeric;
    v_lt numeric; v_wt numeric; v_lb numeric; v_wb numeric;
    v_d  numeric; v_s  numeric; v_r  numeric;
    v_theta double precision;
    v_segment numeric;
BEGIN
    CASE p_shape

    WHEN 'rectangular' THEN
        RETURN adms_dim(p_dims, 'length')
             * adms_dim(p_dims, 'width')
             * adms_dim(p_dims, 'height');

    WHEN 'tapered_sides' THEN
        RETURN adms_dim(p_dims, 'length')
             * adms_dim(p_dims, 'height')
             * (adms_dim(p_dims, 'width_top')
                + adms_dim(p_dims, 'width_bottom')) / 2.0;

    WHEN 'tapered_end' THEN
        RETURN adms_dim(p_dims, 'width')
             * adms_dim(p_dims, 'height')
             * (adms_dim(p_dims, 'length_top')
                + adms_dim(p_dims, 'length_bottom')) / 2.0;

    WHEN 'prismatoid' THEN
        v_lb := adms_dim(p_dims, 'length_bottom');
        v_wb := adms_dim(p_dims, 'width_bottom');
        v_lt := adms_dim(p_dims, 'length_top');
        v_wt := adms_dim(p_dims, 'width_top');
        v_h  := adms_dim(p_dims, 'height');
        -- Prismatoid rule. The mid section of a straight taper is the average
        -- of the two ends, which is why it can be derived rather than measured.
        RETURN v_h / 6.0 * (
                 v_lb * v_wb
               + 4.0 * ((v_lb + v_lt) / 2.0) * ((v_wb + v_wt) / 2.0)
               + v_lt * v_wt);

    WHEN 'round_bottom' THEN
        v_l := adms_dim(p_dims, 'length');
        v_w := adms_dim(p_dims, 'width');
        v_h := adms_dim(p_dims, 'straight_height');
        -- Required, not optional. Leaving the curve out would silently turn a
        -- round bottom trailer back into a box, which is the 2.67 CY per load
        -- error this shape exists to prevent. A genuinely flat floor is
        -- entered as a zero and handled below.
        v_s := adms_dim(p_dims, 'curve_depth');

        IF v_s = 0 THEN
            -- A flat floor is a box, and saying so beats refusing the shape.
            RETURN v_l * v_w * v_h;
        END IF;

        IF v_s > v_w / 2.0 THEN
            RAISE EXCEPTION
                'A curve deeper than half the interior width is not a circular '
                'floor. Measure the width at the widest point, where the '
                'straight sides begin.'
                USING ERRCODE = 'check_violation';
        END IF;

        -- Circular segment from its chord and its depth. Exact, because this
        -- number prices every load the trailer hauls.
        v_r := (v_w * v_w) / (8.0 * v_s) + v_s / 2.0;
        v_theta := 2.0 * asin(LEAST(1.0, (v_w / (2.0 * v_r))::double precision));
        v_segment := ((v_r * v_r) / 2.0)
                   * (v_theta - sin(v_theta))::numeric;
        RETURN v_l * (v_w * v_h + v_segment);

    WHEN 'half_cylinder' THEN
        v_d := adms_dim(p_dims, 'diameter');
        RETURN adms_dim(p_dims, 'length') * pi()::numeric * v_d * v_d / 8.0;

    WHEN 'cylinder' THEN
        v_d := adms_dim(p_dims, 'diameter');
        RETURN pi()::numeric * (v_d / 2.0) * (v_d / 2.0)
             * adms_dim(p_dims, 'height');

    WHEN 'triangular_prism' THEN
        RETURN adms_dim(p_dims, 'length')
             * adms_dim(p_dims, 'width')
             * adms_dim(p_dims, 'height') / 2.0;

    WHEN 'manual_volume' THEN
        RETURN adms_dim(p_dims, 'cubic_inches');

    ELSE
        RAISE EXCEPTION 'There is no measurement shape called %', p_shape
            USING ERRCODE = 'check_violation';
    END CASE;
END;
$$;

COMMENT ON FUNCTION adms_shape_volume IS
    'Cubic inches for one shape. The single source of the arithmetic, so the '
    'figure a monitor reads on the device is the figure the certification '
    'carries.';

-- ---------------------------------------------------------------------------
-- How the exact volume becomes the certified capacity.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_round_capacity(p_cy numeric, p_rule text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_rule
        WHEN 'nearest_tenth'  THEN round(p_cy, 1)
        WHEN 'nearest_half'   THEN round(p_cy * 2) / 2
        WHEN 'nearest_whole'  THEN round(p_cy, 0)
        WHEN 'down_whole'     THEN floor(p_cy)
        ELSE round(p_cy, 2)
    END;
$$;

-- ---------------------------------------------------------------------------
-- Base plus additions minus deductions, and what that makes the capacity.
--
-- Called by trigger whenever a section changes, so the total can never drift
-- from its parts. That is the difference between a worksheet and a form with
-- more fields on it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_certification_volume(p_measurement uuid)
RETURNS certification_measurements
LANGUAGE plpgsql
AS $$
DECLARE
    m         certification_measurements%ROWTYPE;
    v_base    numeric := 0;
    v_add     numeric := 0;
    v_ded     numeric := 0;
    v_total   numeric;
    v_n       integer;
    v_status  text;
    v_cy      numeric;
BEGIN
    SELECT COALESCE(sum(computed_cubic_inches) FILTER (WHERE role = 'base'), 0),
           COALESCE(sum(computed_cubic_inches) FILTER (WHERE role = 'addition'), 0),
           COALESCE(sum(computed_cubic_inches) FILTER (WHERE role = 'deduction'), 0),
           count(*)
      INTO v_base, v_add, v_ded, v_n
      FROM certification_sections
     WHERE measurement_id = p_measurement;

    v_total := v_base + v_add - v_ded;

    IF v_total < 0 THEN
        RAISE EXCEPTION
            'The deductions on this worksheet remove more than the container '
            'holds. Check the deducted sections before going further.'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE certification_measurements
       SET base_cubic_inches      = round(v_base, 3),
           addition_cubic_inches  = round(v_add, 3),
           deduction_cubic_inches = round(v_ded, 3),
           total_cubic_inches     = round(v_total, 3),
           total_cubic_feet       = round(v_total / 1728.0, 4),
           total_cubic_yards      = round(v_total / 46656.0, 4),
           section_count          = v_n
     WHERE id = p_measurement
    RETURNING * INTO m;

    IF m.id IS NULL THEN
        RAISE EXCEPTION 'There is no measurement worksheet with id %', p_measurement
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    SELECT status INTO v_status
      FROM project_equipment_certifications WHERE id = m.certification_id;

    -- Capacity is derived, so it is written here rather than typed. Only while
    -- the certification is a draft: once it is in force it is superseded,
    -- never edited, which is the rule the whole chain rests on.
    IF v_status = 'draft' THEN
        v_cy := adms_round_capacity(m.total_cubic_yards, m.rounding_rule);
        UPDATE project_equipment_certifications
           SET certified_capacity_cy = NULLIF(v_cy, 0)
         WHERE id = m.certification_id;
    END IF;

    RETURN m;
END;
$$;

COMMENT ON FUNCTION adms_certification_volume IS
    'Recomputes a worksheet from its sections and writes the derived capacity '
    'onto the draft certification. The only path by which a certified capacity '
    'is ever set.';

-- ---------------------------------------------------------------------------
-- One section, computed as it is written.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_section_compute()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_active boolean;
BEGIN
    SELECT is_active INTO v_active
      FROM measurement_shapes WHERE code = NEW.shape_code;

    IF NOT COALESCE(v_active, true) THEN
        RAISE EXCEPTION 'The % shape is no longer offered', NEW.shape_code
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.unit_cubic_inches := round(
        adms_shape_volume(NEW.shape_code, NEW.dimensions), 3);

    IF NEW.unit_cubic_inches <= 0 THEN
        RAISE EXCEPTION
            'Those dimensions come out at no volume, so nothing was measured here.'
            USING ERRCODE = 'check_violation';
    END IF;

    NEW.computed_cubic_inches := NEW.unit_cubic_inches * NEW.quantity;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certification_sections_compute
    BEFORE INSERT OR UPDATE ON certification_sections
    FOR EACH ROW EXECUTE FUNCTION adms_section_compute();

-- ---------------------------------------------------------------------------
-- A worksheet is only open while the certification is a draft.
--
-- Once it has been submitted or approved the measurements are evidence, and
-- evidence that can be edited afterwards is not evidence. Correcting one means
-- a new certification that supersedes this one, the same as any other change to
-- a capacity.
--
-- Insert and update only. A delete has to stay possible so that deleting a
-- project still cascades.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_section_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_status text;
BEGIN
    SELECT c.status INTO v_status
      FROM certification_measurements m
      JOIN project_equipment_certifications c ON c.id = m.certification_id
     WHERE m.id = NEW.measurement_id;

    IF v_status IS NOT NULL AND v_status <> 'draft' THEN
        RAISE EXCEPTION
            'This certification is %, so its measurements are closed. Record a '
            'correction if the number was wrong.', v_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certification_sections_guard
    BEFORE INSERT OR UPDATE ON certification_sections
    FOR EACH ROW EXECUTE FUNCTION adms_section_guard();

CREATE OR REPLACE FUNCTION adms_section_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_measurement uuid;
BEGIN
    v_measurement := CASE WHEN TG_OP = 'DELETE'
                          THEN OLD.measurement_id ELSE NEW.measurement_id END;

    -- A cascade can take the worksheet out from under the section.
    IF EXISTS (SELECT 1 FROM certification_measurements WHERE id = v_measurement) THEN
        PERFORM adms_certification_volume(v_measurement);
    END IF;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_certification_sections_total
    AFTER INSERT OR UPDATE OR DELETE ON certification_sections
    FOR EACH ROW EXECUTE FUNCTION adms_section_total();

-- Changing how the exact volume is rounded changes the capacity, so it
-- recomputes rather than leaving the two disagreeing.
CREATE OR REPLACE FUNCTION adms_measurement_after_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.rounding_rule IS DISTINCT FROM OLD.rounding_rule THEN
        PERFORM adms_certification_volume(NEW.id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_certification_measurements_rounding
    AFTER UPDATE ON certification_measurements
    FOR EACH ROW EXECUTE FUNCTION adms_measurement_after_update();

-- ---------------------------------------------------------------------------
-- A measured certification has to agree with its own measurements.
--
-- Checked at the moment it goes into force, which is the moment it starts
-- pricing loads. Without this the worksheet could say one thing and the
-- capacity another, which is exactly the state this migration exists to end.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION adms_certification_matches_measurement()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    m certification_measurements%ROWTYPE;
    v_expected numeric;
BEGIN
    IF NEW.status <> 'active' OR OLD.status NOT IN ('draft', 'submitted') THEN
        RETURN NEW;
    END IF;

    SELECT * INTO m FROM certification_measurements
     WHERE certification_id = NEW.id;

    IF m.id IS NULL THEN
        RETURN NEW;
    END IF;

    v_expected := adms_round_capacity(m.total_cubic_yards, m.rounding_rule);

    IF NEW.certified_capacity_cy IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION
            'This certification says % CY and its measurements come to % CY. '
            'The capacity is derived from the worksheet, so one of the two has '
            'been changed by hand.', NEW.certified_capacity_cy, v_expected
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_certification_matches_measurement
    BEFORE UPDATE ON project_equipment_certifications
    FOR EACH ROW EXECUTE FUNCTION adms_certification_matches_measurement();

-- ---------------------------------------------------------------------------
-- The worksheet as a reviewer reads it: the equipment, the type, every section
-- with its own arithmetic, and the total in all three units.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW certification_measurement_detail AS
SELECT
    m.*,
    ct.label                  AS container_label,
    ct.category               AS container_category,
    ct.typical_use            AS container_typical_use,
    ct.description            AS container_description,
    ct.required_photo_slots,
    ct.typical_min_cy,
    ct.typical_max_cy,
    ct.diagram_key            AS container_diagram_key,
    c.project_id,
    c.equipment_id,
    c.status                  AS certification_status,
    c.certified_capacity_cy,
    c.certification_number,
    c.method,
    c.applies_from,
    c.expires_on,
    adms_round_capacity(m.total_cubic_yards, m.rounding_rule) AS derived_capacity_cy,
    e.unit_number,
    e.equipment_type,
    e.placard_code,
    ctr.name                  AS contractor_name,
    COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', s.id,
                   'sequence', s.sequence,
                   'label', s.label,
                   'shape_code', s.shape_code,
                   'shape_label', sh.label,
                   'formula_note', sh.formula_note,
                   'diagram_key', sh.diagram_key,
                   'role', s.role,
                   'quantity', s.quantity,
                   'dimensions', s.dimensions,
                   'unit_cubic_inches', s.unit_cubic_inches,
                   'computed_cubic_inches', s.computed_cubic_inches,
                   'cubic_yards', round(s.computed_cubic_inches / 46656.0, 4),
                   'notes', s.notes)
               ORDER BY s.sequence)
          FROM certification_sections s
          JOIN measurement_shapes sh ON sh.code = s.shape_code
         WHERE s.measurement_id = m.id), '[]'::jsonb) AS sections
FROM certification_measurements m
JOIN container_types ct ON ct.code = m.container_type_code
JOIN project_equipment_certifications c ON c.id = m.certification_id
JOIN equipment e ON e.id = c.equipment_id
LEFT JOIN contractors ctr ON ctr.id = e.contractor_id;

COMMENT ON VIEW certification_measurement_detail IS
    'One read that answers how a capacity was determined: what was measured, '
    'what shape, what dimensions, how many sections, what was added, what was '
    'deducted, which formula, and what it came to.';

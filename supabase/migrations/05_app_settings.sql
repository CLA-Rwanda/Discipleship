-- ============================================================
-- Migration 05: App Settings, Split Names, Dynamic Slots
-- Run in Supabase SQL editor after 04_class_slots.sql
-- ============================================================

-- ── 1. Trigram extension for fuzzy name matching ─────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 2. App settings table ────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO app_settings (key, value) VALUES
  ('total_sessions',           '21'),
  ('attendance_threshold_pct', '75'),
  ('max_members_per_class',    '15'),
  ('max_classes',              '16')
ON CONFLICT (key) DO NOTHING;

-- RLS: anyone can read; only authenticated admins can write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_app_settings" ON app_settings
  FOR SELECT USING (true);

CREATE POLICY "admin_write_app_settings" ON app_settings
  FOR ALL USING (auth.role() = 'authenticated');

-- ── 3. Remove hardcoded slot constraints ─────────────────────
ALTER TABLE classes   DROP CONSTRAINT IF EXISTS classes_slot_check;
ALTER TABLE members   DROP CONSTRAINT IF EXISTS members_preferred_slot_check;
ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_service_slot_check;

-- ── 4. Drop 12pm classes ─────────────────────────────────────
-- Unlink members assigned to 12pm classes first
UPDATE members SET class_id = NULL
WHERE class_id IN (SELECT id FROM classes WHERE slot = '12pm');

-- Delete 12pm attendance records
DELETE FROM attendance WHERE service_slot = '12pm';

-- Delete 12pm classes
DELETE FROM classes WHERE slot = '12pm';

-- ── 5. Split full_name into first_name + last_name ───────────
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- Populate from existing full_name (split on first space)
UPDATE members
SET
  first_name = SPLIT_PART(full_name, ' ', 1),
  last_name  = CASE
    WHEN POSITION(' ' IN TRIM(full_name)) > 0
    THEN TRIM(SUBSTRING(full_name FROM POSITION(' ' IN TRIM(full_name)) + 1))
    ELSE TRIM(full_name)
  END
WHERE full_name IS NOT NULL AND first_name IS NULL;

-- Set defaults for any edge cases
UPDATE members SET first_name = 'Unknown' WHERE first_name IS NULL OR first_name = '';
UPDATE members SET last_name  = 'Unknown' WHERE last_name  IS NULL OR last_name  = '';

-- Now enforce NOT NULL
ALTER TABLE members
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name  SET NOT NULL;

-- Drop the old column
ALTER TABLE members DROP COLUMN IF EXISTS full_name;

-- ── 6. Update assign_member_to_class RPC ─────────────────────
CREATE OR REPLACE FUNCTION assign_member_to_class(
  p_first_name TEXT,
  p_last_name  TEXT,
  p_phone      TEXT,
  p_email      TEXT DEFAULT NULL,
  p_preferred_slot TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id          UUID;
  v_class_name        TEXT;
  v_facilitator_name  TEXT;
  v_member_id         UUID;
  v_slot              TEXT := p_preferred_slot;
  v_alt_slots         JSONB := '[]'::JSONB;
  v_alt_slot          TEXT;
  v_alt_remaining     INT;
  v_alt_total         INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('assign_member_' || p_phone));

  SELECT c.id, c.name, COALESCE(f.full_name, NULL)
  INTO v_class_id, v_class_name, v_facilitator_name
  FROM classes c
  LEFT JOIN facilitators f ON f.id = c.facilitator_id
  WHERE c.slot = v_slot
    AND c.is_active = true
    AND (SELECT COUNT(*) FROM members m WHERE m.class_id = c.id) < c.capacity_max
  ORDER BY c.name ASC
  LIMIT 1
  FOR UPDATE OF c;

  IF v_class_id IS NOT NULL THEN
    INSERT INTO members (first_name, last_name, phone, email, preferred_slot, class_id)
    VALUES (p_first_name, p_last_name, p_phone, p_email, v_slot, v_class_id)
    RETURNING id INTO v_member_id;

    RETURN jsonb_build_object(
      'status',           'assigned',
      'member_id',        v_member_id,
      'class_name',       v_class_name,
      'slot',             v_slot,
      'facilitator_name', v_facilitator_name
    );
  END IF;

  -- Preferred slot full — find alternatives
  FOR v_alt_slot IN (
    SELECT DISTINCT slot FROM classes
    WHERE is_active = true AND slot <> v_slot
    ORDER BY slot
  ) LOOP
    SELECT
      SUM(c.capacity_max),
      SUM(c.capacity_max) - COUNT(m.id)
    INTO v_alt_total, v_alt_remaining
    FROM classes c
    LEFT JOIN members m ON m.class_id = c.id
    WHERE c.slot = v_alt_slot AND c.is_active = true;

    IF v_alt_remaining > 0 THEN
      v_alt_slots := v_alt_slots || jsonb_build_object(
        'slot',      v_alt_slot,
        'remaining', v_alt_remaining,
        'total',     v_alt_total
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_alt_slots) > 0 THEN
    RETURN jsonb_build_object(
      'status',             'slot_full',
      'preferred_slot',     v_slot,
      'alternative_slots',  v_alt_slots
    );
  END IF;

  RETURN jsonb_build_object('status', 'all_full');
END;
$$;

-- ── 7. Name matching RPC for attendance ──────────────────────
CREATE OR REPLACE FUNCTION match_attendance_name(
  p_first_name TEXT,
  p_last_name  TEXT,
  p_class_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_full      TEXT := p_first_name || ' ' || p_last_name;
  v_reversed  TEXT := p_last_name  || ' ' || p_first_name;
  v_exact_id  UUID;
  v_rev_name  TEXT;
  v_fuz_name  TEXT;
  v_fuz_sim   FLOAT;
BEGIN
  -- 1. Exact case-insensitive match
  SELECT id INTO v_exact_id
  FROM members
  WHERE class_id = p_class_id
    AND lower(first_name || ' ' || last_name) = lower(v_full)
  LIMIT 1;

  IF v_exact_id IS NOT NULL THEN
    RETURN jsonb_build_object('match_type', 'exact', 'member_id', v_exact_id::text);
  END IF;

  -- 2. Name-order reversal check
  SELECT first_name || ' ' || last_name INTO v_rev_name
  FROM members
  WHERE class_id = p_class_id
    AND lower(first_name || ' ' || last_name) = lower(v_reversed)
  LIMIT 1;

  IF v_rev_name IS NOT NULL THEN
    RETURN jsonb_build_object('match_type', 'reversed', 'suggestion', v_rev_name);
  END IF;

  -- 3. Fuzzy match via pg_trgm (threshold 0.5)
  SELECT first_name || ' ' || last_name,
         similarity(first_name || ' ' || last_name, v_full)
  INTO v_fuz_name, v_fuz_sim
  FROM members
  WHERE class_id = p_class_id
  ORDER BY similarity(first_name || ' ' || last_name, v_full) DESC
  LIMIT 1;

  IF v_fuz_sim >= 0.5 THEN
    RETURN jsonb_build_object(
      'match_type',  'fuzzy',
      'suggestion',  v_fuz_name,
      'similarity',  v_fuz_sim
    );
  END IF;

  RETURN jsonb_build_object('match_type', 'none');
END;
$$;

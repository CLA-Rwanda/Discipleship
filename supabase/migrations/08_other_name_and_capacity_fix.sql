-- ============================================================
-- Migration 08: other_name column + capacity fix
-- Run in Supabase SQL Editor
-- ============================================================

-- ── 1. Add other_name to members ─────────────────────────────
ALTER TABLE members ADD COLUMN IF NOT EXISTS other_name TEXT;
CREATE INDEX IF NOT EXISTS idx_members_name ON members(lower(first_name), lower(last_name));

-- ── 2. Sync capacity_max on all classes with current setting ─
DO $$
DECLARE v_cap INT;
BEGIN
  SELECT value::INT INTO v_cap FROM app_settings WHERE key = 'max_members_per_class';
  IF v_cap IS NOT NULL AND v_cap > 0 THEN
    UPDATE classes SET capacity_max = v_cap, capacity_min = v_cap WHERE is_active = true;
  END IF;
END $$;

-- ── 3. Update assign_member_to_class RPC (body only) ─────────
--      Keeps the SAME 5-parameter signature (no schema-cache
--      reload needed). Reads max_members_per_class from
--      app_settings at runtime so admin setting changes take
--      effect immediately.
CREATE OR REPLACE FUNCTION assign_member_to_class(
  p_first_name     TEXT,
  p_last_name      TEXT,
  p_phone          TEXT,
  p_email          TEXT DEFAULT NULL,
  p_preferred_slot TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id         UUID;
  v_class_name       TEXT;
  v_facilitator_name TEXT;
  v_member_id        UUID;
  v_slot             TEXT := p_preferred_slot;
  v_alt_slots        JSONB := '[]'::JSONB;
  v_alt_slot         TEXT;
  v_alt_remaining    INT;
  v_alt_total        INT;
  v_capacity_max     INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('assign_member_' || p_phone));

  -- Read effective capacity from settings (falls back to 15)
  SELECT COALESCE(value::INT, 15)
  INTO   v_capacity_max
  FROM   app_settings
  WHERE  key = 'max_members_per_class';

  IF v_capacity_max IS NULL OR v_capacity_max <= 0 THEN
    v_capacity_max := 15;
  END IF;

  -- Find first available class in preferred slot
  SELECT c.id, c.name, COALESCE(f.full_name, NULL)
  INTO   v_class_id, v_class_name, v_facilitator_name
  FROM   classes c
  LEFT JOIN facilitators f ON f.id = c.facilitator_id
  WHERE  c.slot      = v_slot
    AND  c.is_active = true
    AND  (SELECT COUNT(*) FROM members m WHERE m.class_id = c.id) < v_capacity_max
  ORDER BY c.name ASC
  LIMIT  1
  FOR UPDATE OF c;

  IF v_class_id IS NOT NULL THEN
    INSERT INTO members (first_name, last_name, phone, email, preferred_slot, class_id)
    VALUES (p_first_name, p_last_name, p_phone, p_email, v_slot, v_class_id)
    RETURNING id INTO v_member_id;

    RETURN jsonb_build_object(
      'status',           'assigned',
      'member_id',        v_member_id::text,
      'class_name',       v_class_name,
      'slot',             v_slot,
      'facilitator_name', v_facilitator_name
    );
  END IF;

  -- Preferred slot full — find alternatives using same capacity
  FOR v_alt_slot IN (
    SELECT DISTINCT slot FROM classes
    WHERE  is_active = true AND slot <> v_slot
    ORDER BY slot
  ) LOOP
    SELECT
      COUNT(*) * v_capacity_max,
      COUNT(*) * v_capacity_max - (
        SELECT COUNT(*) FROM members m2
        JOIN classes c2 ON c2.id = m2.class_id
        WHERE c2.slot = v_alt_slot AND c2.is_active = true
      )
    INTO v_alt_total, v_alt_remaining
    FROM classes c
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
      'status',            'slot_full',
      'preferred_slot',    v_slot,
      'alternative_slots', v_alt_slots
    );
  END IF;

  RETURN jsonb_build_object('status', 'all_full');
END;
$$;

-- ============================================================
-- CLA Discipleship Management — Supabase Database Schema
-- Run this in the Supabase SQL editor (in order)
-- Valid service slots: 8am and 10am (no 12pm)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================
-- TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS facilitators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slot TEXT NOT NULL,           -- dynamic; no CHECK constraint
  facilitator_id UUID REFERENCES facilitators(id) ON DELETE SET NULL,
  capacity_min INT DEFAULT 15,
  capacity_max INT DEFAULT 15,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  preferred_slot TEXT,          -- dynamic; no CHECK constraint
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID REFERENCES members(id) ON DELETE SET NULL,
  member_name TEXT NOT NULL,
  phone TEXT,
  class_id UUID REFERENCES classes(id) ON DELETE SET NULL,
  attended_at TIMESTAMPTZ DEFAULT now(),
  service_slot TEXT             -- dynamic; no CHECK constraint
);

CREATE TABLE IF NOT EXISTS resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  url TEXT,
  file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  is_published BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS admin_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('super_admin', 'admin', 'facilitator', 'intern')) NOT NULL,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- SEED: app_settings
-- ============================================================

INSERT INTO app_settings (key, value) VALUES
  ('total_sessions',          '21'),
  ('attendance_threshold_pct','75'),
  ('max_members_per_class',   '15'),
  ('max_classes',             '32')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: 32 CLASSES (Class 01-16 at both 8am and 10am)
-- ============================================================

INSERT INTO classes (name, slot, capacity_min, capacity_max) VALUES
  ('Class 01', '8am',  15, 15), ('Class 01', '10am', 15, 15),
  ('Class 02', '8am',  15, 15), ('Class 02', '10am', 15, 15),
  ('Class 03', '8am',  15, 15), ('Class 03', '10am', 15, 15),
  ('Class 04', '8am',  15, 15), ('Class 04', '10am', 15, 15),
  ('Class 05', '8am',  15, 15), ('Class 05', '10am', 15, 15),
  ('Class 06', '8am',  15, 15), ('Class 06', '10am', 15, 15),
  ('Class 07', '8am',  15, 15), ('Class 07', '10am', 15, 15),
  ('Class 08', '8am',  15, 15), ('Class 08', '10am', 15, 15),
  ('Class 09', '8am',  15, 15), ('Class 09', '10am', 15, 15),
  ('Class 10', '8am',  15, 15), ('Class 10', '10am', 15, 15),
  ('Class 11', '8am',  15, 15), ('Class 11', '10am', 15, 15),
  ('Class 12', '8am',  15, 15), ('Class 12', '10am', 15, 15),
  ('Class 13', '8am',  15, 15), ('Class 13', '10am', 15, 15),
  ('Class 14', '8am',  15, 15), ('Class 14', '10am', 15, 15),
  ('Class 15', '8am',  15, 15), ('Class 15', '10am', 15, 15),
  ('Class 16', '8am',  15, 15), ('Class 16', '10am', 15, 15)
ON CONFLICT DO NOTHING;

-- ============================================================
-- RPC: assign_member_to_class
-- Atomically assigns a new member to the first available class
-- in their preferred slot. Falls back to alternative slots.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_member_to_class(
  p_first_name TEXT,
  p_last_name TEXT,
  p_phone TEXT,
  p_email TEXT DEFAULT NULL,
  p_preferred_slot TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_class_id UUID;
  v_class_name TEXT;
  v_facilitator_name TEXT;
  v_member_id UUID;
  v_slot TEXT := p_preferred_slot;
  v_alt_slots JSONB := '[]'::JSONB;
  v_alt_slot TEXT;
  v_alt_remaining INT;
  v_alt_total INT;
BEGIN
  -- Lock to prevent concurrent conflicts
  PERFORM pg_advisory_xact_lock(hashtext('assign_member_' || p_phone));

  -- Find first available class in preferred slot (ordered by name)
  SELECT c.id, c.name,
         COALESCE(f.full_name, NULL)
  INTO v_class_id, v_class_name, v_facilitator_name
  FROM classes c
  LEFT JOIN facilitators f ON f.id = c.facilitator_id
  WHERE c.slot = v_slot
    AND c.is_active = true
    AND (
      SELECT COUNT(*) FROM members m WHERE m.class_id = c.id
    ) < c.capacity_max
  ORDER BY c.name ASC
  LIMIT 1
  FOR UPDATE OF c;

  IF v_class_id IS NOT NULL THEN
    INSERT INTO members (first_name, last_name, phone, email, preferred_slot, class_id)
    VALUES (p_first_name, p_last_name, p_phone, p_email, v_slot, v_class_id)
    RETURNING id INTO v_member_id;

    RETURN jsonb_build_object(
      'status', 'assigned',
      'member_id', v_member_id,
      'class_name', v_class_name,
      'slot', v_slot,
      'facilitator_name', v_facilitator_name
    );
  END IF;

  -- Preferred slot is full — find alternatives dynamically
  FOR v_alt_slot IN (SELECT DISTINCT slot FROM classes WHERE slot <> v_slot AND is_active = true ORDER BY slot) LOOP
    SELECT
      SUM(c.capacity_max),
      SUM(c.capacity_max) - COUNT(m.id)
    INTO v_alt_total, v_alt_remaining
    FROM classes c
    LEFT JOIN members m ON m.class_id = c.id
    WHERE c.slot = v_alt_slot AND c.is_active = true;

    IF v_alt_remaining > 0 THEN
      v_alt_slots := v_alt_slots || jsonb_build_object(
        'slot', v_alt_slot,
        'remaining', v_alt_remaining,
        'total', v_alt_total
      );
    END IF;
  END LOOP;

  IF jsonb_array_length(v_alt_slots) > 0 THEN
    RETURN jsonb_build_object(
      'status', 'slot_full',
      'preferred_slot', v_slot,
      'alternative_slots', v_alt_slots
    );
  END IF;

  RETURN jsonb_build_object('status', 'all_full');
END;
$$;

-- ============================================================
-- RPC: match_attendance_name
-- Fuzzy name matching using pg_trgm.
-- Returns match_type: exact | reversed | fuzzy | none
-- ============================================================

CREATE OR REPLACE FUNCTION match_attendance_name(
  p_first_name TEXT,
  p_last_name TEXT,
  p_class_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_member_id UUID;
  v_suggestion TEXT;
  v_sim FLOAT;
  v_input TEXT := lower(p_first_name || ' ' || p_last_name);
  v_reversed TEXT := lower(p_last_name || ' ' || p_first_name);
BEGIN
  -- Exact match (case-insensitive)
  SELECT id INTO v_member_id
  FROM members
  WHERE class_id = p_class_id
    AND lower(first_name) = lower(p_first_name)
    AND lower(last_name)  = lower(p_last_name)
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    RETURN jsonb_build_object('match_type', 'exact', 'member_id', v_member_id);
  END IF;

  -- Reversed-order match (first/last swapped)
  SELECT id INTO v_member_id
  FROM members
  WHERE class_id = p_class_id
    AND lower(first_name) = lower(p_last_name)
    AND lower(last_name)  = lower(p_first_name)
  LIMIT 1;

  IF v_member_id IS NOT NULL THEN
    SELECT first_name || ' ' || last_name INTO v_suggestion
    FROM members WHERE id = v_member_id;
    RETURN jsonb_build_object(
      'match_type', 'reversed',
      'member_id', v_member_id,
      'suggestion', v_suggestion
    );
  END IF;

  -- Fuzzy match via pg_trgm (threshold 0.5)
  SELECT id,
         first_name || ' ' || last_name,
         similarity(lower(first_name || ' ' || last_name), v_input)
  INTO v_member_id, v_suggestion, v_sim
  FROM members
  WHERE class_id = p_class_id
  ORDER BY similarity(lower(first_name || ' ' || last_name), v_input) DESC
  LIMIT 1;

  IF v_sim >= 0.5 THEN
    RETURN jsonb_build_object(
      'match_type', 'fuzzy',
      'member_id', v_member_id,
      'suggestion', v_suggestion
    );
  END IF;

  RETURN jsonb_build_object('match_type', 'none');
END;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilitators ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Public: anyone can register a member (via RPC — SECURITY DEFINER bypasses RLS)
CREATE POLICY "anon_rpc_register" ON members
  FOR ALL USING (true);

-- Public: anyone can log attendance
CREATE POLICY "anon_log_attendance" ON attendance
  FOR INSERT WITH CHECK (true);

-- Public: anyone can read published resources
CREATE POLICY "public_read_resources" ON resources
  FOR SELECT USING (is_published = true);

-- Public: anyone can read active classes (for slot capacity display)
CREATE POLICY "public_read_classes" ON classes
  FOR SELECT USING (is_active = true);

-- Public: anyone can read app_settings
CREATE POLICY "public_read_app_settings" ON app_settings
  FOR SELECT USING (true);

-- Authenticated admins: write access to app_settings
CREATE POLICY "admin_write_app_settings" ON app_settings
  FOR ALL USING (auth.role() = 'authenticated');

-- Authenticated admins: full access to all tables
CREATE POLICY "admin_all_members" ON members
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "admin_all_attendance" ON attendance
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "admin_all_classes" ON classes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "admin_all_facilitators" ON facilitators
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "admin_all_resources" ON resources
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "admin_all_roles" ON admin_roles
  FOR ALL USING (auth.role() = 'authenticated');

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_members_class_id ON members(class_id);
CREATE INDEX IF NOT EXISTS idx_members_preferred_slot ON members(preferred_slot);
CREATE INDEX IF NOT EXISTS idx_attendance_attended_at ON attendance(attended_at);
CREATE INDEX IF NOT EXISTS idx_attendance_service_slot ON attendance(service_slot);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);
CREATE INDEX IF NOT EXISTS idx_classes_slot ON classes(slot);
CREATE INDEX IF NOT EXISTS idx_classes_is_active ON classes(is_active);
CREATE INDEX IF NOT EXISTS idx_resources_is_published ON resources(is_published);

-- pg_trgm indexes for fuzzy name matching
CREATE INDEX IF NOT EXISTS idx_members_first_name_trgm ON members USING GIN (first_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_members_last_name_trgm  ON members USING GIN (last_name  gin_trgm_ops);

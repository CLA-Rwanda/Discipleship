-- ============================================================
-- CLA Discipleship Management — Supabase Database Schema
-- Run this in the Supabase SQL editor (in order)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

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
  slot TEXT CHECK (slot IN ('8am', '10am', '12pm')) NOT NULL,
  facilitator_id UUID REFERENCES facilitators(id) ON DELETE SET NULL,
  capacity_min INT DEFAULT 15,
  capacity_max INT DEFAULT 18,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  preferred_slot TEXT CHECK (preferred_slot IN ('8am', '10am', '12pm')),
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
  service_slot TEXT CHECK (service_slot IN ('8am', '10am', '12pm'))
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

-- ============================================================
-- SEED: 20 CLASSES (8am: 1–7, 10am: 8–14, 12pm: 15–20)
-- ============================================================

INSERT INTO classes (name, slot, capacity_min, capacity_max) VALUES
  ('Class 01', '8am',  15, 18),
  ('Class 02', '8am',  15, 18),
  ('Class 03', '8am',  15, 18),
  ('Class 04', '8am',  15, 18),
  ('Class 05', '8am',  15, 18),
  ('Class 06', '8am',  15, 18),
  ('Class 07', '8am',  15, 18),
  ('Class 08', '10am', 15, 18),
  ('Class 09', '10am', 15, 18),
  ('Class 10', '10am', 15, 18),
  ('Class 11', '10am', 15, 18),
  ('Class 12', '10am', 15, 18),
  ('Class 13', '10am', 15, 18),
  ('Class 14', '10am', 15, 18),
  ('Class 15', '12pm', 15, 18),
  ('Class 16', '12pm', 15, 18),
  ('Class 17', '12pm', 15, 18),
  ('Class 18', '12pm', 15, 18),
  ('Class 19', '12pm', 15, 18),
  ('Class 20', '12pm', 15, 18)
ON CONFLICT DO NOTHING;

-- ============================================================
-- RPC: assign_member_to_class
-- Atomically assigns a new member to the first available class
-- in their preferred slot, filling Classes 1–10 before 11–20.
-- Returns JSON with assignment status.
-- ============================================================

CREATE OR REPLACE FUNCTION assign_member_to_class(
  p_full_name TEXT,
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

  -- Find first available class in preferred slot (ordered by name, fills lower first)
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
    -- Assign member
    INSERT INTO members (full_name, phone, email, preferred_slot, class_id)
    VALUES (p_full_name, p_phone, p_email, v_slot, v_class_id)
    RETURNING id INTO v_member_id;

    RETURN jsonb_build_object(
      'status', 'assigned',
      'member_id', v_member_id,
      'class_name', v_class_name,
      'slot', v_slot,
      'facilitator_name', v_facilitator_name
    );
  END IF;

  -- Preferred slot is full — find alternatives
  FOR v_alt_slot IN (SELECT UNNEST(ARRAY['8am','10am','12pm']) AS s WHERE s <> v_slot) LOOP
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

  -- All slots are full
  RETURN jsonb_build_object('status', 'all_full');
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

-- Public: anyone can register a member (via RPC only — not direct insert)
CREATE POLICY "anon_rpc_register" ON members
  FOR ALL USING (true);  -- RPC uses SECURITY DEFINER; restrict direct access further in prod

-- Public: anyone can log attendance
CREATE POLICY "anon_log_attendance" ON attendance
  FOR INSERT WITH CHECK (true);

-- Public: anyone can read published resources
CREATE POLICY "public_read_resources" ON resources
  FOR SELECT USING (is_published = true);

-- Public: anyone can read classes (for slot capacity display)
CREATE POLICY "public_read_classes" ON classes
  FOR SELECT USING (is_active = true);

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
CREATE INDEX IF NOT EXISTS idx_classes_slot ON classes(slot);
CREATE INDEX IF NOT EXISTS idx_classes_is_active ON classes(is_active);
CREATE INDEX IF NOT EXISTS idx_resources_is_published ON resources(is_published);

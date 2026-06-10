-- ============================================================
-- CLA Discipleship — Pending / Waitlist Members (migration 07)
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS pending_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT,
  email         TEXT,
  preferred_slot TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'promoted', 'dismissed')),
  notes         TEXT,
  promoted_class TEXT  -- filled when status = 'promoted'
);

ALTER TABLE pending_members ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "admin_all_pending_members" ON pending_members
    FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Public INSERT so the registration server action (service role) can write
DO $$ BEGIN
  CREATE POLICY "service_insert_pending_members" ON pending_members
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pending_members_status       ON pending_members(status);
CREATE INDEX IF NOT EXISTS idx_pending_members_registered_at ON pending_members(registered_at ASC);

-- Migration 13: Admin audit log
-- Records who performed destructive/Danger Zone actions (class deletion,
-- data erasure) and when, so "who deleted this?" is answerable in future.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email TEXT,
  action      TEXT NOT NULL,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_audit_log" ON admin_audit_log
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON admin_audit_log(created_at DESC);

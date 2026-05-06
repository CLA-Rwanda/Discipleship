-- ============================================================
-- Migration 03: Facilitator Reports
-- Run in Supabase SQL editor after 02_access_triggers.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  facilitator_id UUID REFERENCES facilitators(id) ON DELETE SET NULL,
  facilitator_name TEXT NOT NULL,
  facilitator_email TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  class_names TEXT[],
  attendance_count INT DEFAULT 0,
  report_html TEXT,      -- exact HTML snapshot of the email sent
  metadata JSONB DEFAULT '{}'
);

-- RLS: only the authenticated super admin can read report history.
-- Any authenticated admin can insert (send a report).
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin_read_reports" ON reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "admin_insert_reports" ON reports
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Index for history queries
CREATE INDEX IF NOT EXISTS idx_reports_sent_at ON reports(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_facilitator_id ON reports(facilitator_id);

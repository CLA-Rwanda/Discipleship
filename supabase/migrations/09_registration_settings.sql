-- ============================================================
-- Migration 09: Registration open toggle + class start date
-- Run in Supabase SQL Editor
-- ============================================================

INSERT INTO app_settings (key, value) VALUES
  ('registration_open', 'true'),
  ('class_start_date',  '')
ON CONFLICT (key) DO NOTHING;

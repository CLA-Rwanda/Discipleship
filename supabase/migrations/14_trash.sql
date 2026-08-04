-- Migration 14: Recycle bin
-- Deleting a member, facilitator, class, or attendance record (including the
-- Danger Zone "erase all data" action) now snapshots the row here before the
-- real delete happens. Entries are restorable for 15 days, after which
-- getTrash() opportunistically purges anything past its expiry.

CREATE TABLE IF NOT EXISTS trash (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID NOT NULL,
  table_name  TEXT NOT NULL,   -- 'members' | 'facilitators' | 'classes' | 'attendance'
  record_id   UUID NOT NULL,
  data        JSONB NOT NULL,  -- full row snapshot, re-inserted verbatim on restore
  related     JSONB,           -- ids of other rows that were unlinked (not deleted) so restore can re-link them
  deleted_by  TEXT,
  action      TEXT NOT NULL,
  deleted_at  TIMESTAMPTZ DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  restored_at TIMESTAMPTZ
);

ALTER TABLE trash ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_trash" ON trash
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_trash_batch_id ON trash(batch_id);
CREATE INDEX IF NOT EXISTS idx_trash_expires_at ON trash(expires_at);
CREATE INDEX IF NOT EXISTS idx_trash_restored_at ON trash(restored_at);

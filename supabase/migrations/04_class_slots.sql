-- Migration 04: Ensure all 20 classes exist across all 3 time slots
-- Each class (1–20) must have a row for 8am, 10am, and 12pm.
-- Idempotent — safe to run even if some rows already exist.

-- Add a unique constraint so (name, slot) can never be duplicated
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'classes_name_slot_unique'
  ) THEN
    ALTER TABLE classes ADD CONSTRAINT classes_name_slot_unique UNIQUE (name, slot);
  END IF;
END;
$$;

-- Insert the 60 combinations that are missing
INSERT INTO classes (name, slot, is_active, capacity_min, capacity_max)
SELECT 'Class ' || n::text, slot, true, 15, 18
FROM
  generate_series(1, 20) AS n,
  unnest(ARRAY['8am', '10am', '12pm']::text[]) AS slot
ON CONFLICT (name, slot) DO NOTHING;

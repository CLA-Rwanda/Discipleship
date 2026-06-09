-- ============================================================
-- CLA Discipleship App — Seed Data (migration 06)
-- 16 classes total: Class 01–08 at 8am, Class 09–16 at 10am
-- 19 real facilitators from CSV attendance data
--   • 3 facilitators with 2 classes (one per slot)
--   • 10 facilitators with 1 class
--   • 6 facilitators in reserve (not yet assigned)
-- 192 members (12 per class) — balanced across all 16 classes
-- No attendance records (fresh start)
-- ============================================================

-- Schema migration: members table (full_name → first_name + last_name)
ALTER TABLE members ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_name  TEXT;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'full_name'
  ) THEN
    ALTER TABLE members DROP COLUMN full_name;
  END IF;
END $$;

-- Clear existing data
TRUNCATE TABLE attendance, members;
UPDATE classes SET facilitator_id = NULL WHERE facilitator_id IS NOT NULL;
DELETE FROM facilitators;
DELETE FROM classes;

-- Ensure app_settings table exists (idempotent)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "public_read_app_settings" ON app_settings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "admin_write_app_settings" ON app_settings FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Upsert settings
INSERT INTO app_settings (key, value) VALUES
  ('total_sessions',           '21'),
  ('attendance_threshold_pct', '75'),
  ('max_members_per_class',    '15'),
  ('max_classes',              '16'),
  ('time_lock_enabled',        'false')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- ─── time_locks table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_locks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL DEFAULT 'Sunday Service',
  day_of_week SMALLINT NOT NULL DEFAULT 0 CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL DEFAULT '08:00',
  end_time    TIME NOT NULL DEFAULT '12:00',
  timezone    TEXT NOT NULL DEFAULT 'Africa/Kigali',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE time_locks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "admin_all_time_locks" ON time_locks FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "public_read_time_locks" ON time_locks FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_time_locks_active ON time_locks(is_active);

-- ─── 16 classes: Class 01–08 at 8am, Class 09–16 at 10am ────
INSERT INTO classes (name, slot, capacity_min, capacity_max) VALUES
  ('Class 01', '8am',  12, 15),
  ('Class 02', '8am',  12, 15),
  ('Class 03', '8am',  12, 15),
  ('Class 04', '8am',  12, 15),
  ('Class 05', '8am',  12, 15),
  ('Class 06', '8am',  12, 15),
  ('Class 07', '8am',  12, 15),
  ('Class 08', '8am',  12, 15),
  ('Class 09', '10am', 12, 15),
  ('Class 10', '10am', 12, 15),
  ('Class 11', '10am', 12, 15),
  ('Class 12', '10am', 12, 15),
  ('Class 13', '10am', 12, 15),
  ('Class 14', '10am', 12, 15),
  ('Class 15', '10am', 12, 15),
  ('Class 16', '10am', 12, 15);

-- ─── 19 facilitators (real names from CSV) ───────────────────
-- Facilitator → class assignment:
--   Peter Miiro        → Class 01 (8am) + Class 09 (10am)  [2 classes]
--   Fred Kateera       → Class 02 (8am) + Class 10 (10am)  [2 classes]
--   Justine Kirabo     → Class 03 (8am) + Class 11 (10am)  [2 classes]
--   Thomas Nkurikiye   → Class 04 (8am)
--   Timothy Kaseke     → Class 05 (8am)
--   Safari Vincent     → Class 06 (8am)
--   Arthur Mugisha     → Class 07 (8am)
--   Amos Tuyisenge     → Class 08 (8am)
--   Isabelle Uwera     → Class 12 (10am)
--   Waringa Kibe       → Class 13 (10am)
--   Edwick Mutuyimana  → Class 14 (10am)
--   Romeo Irakoze      → Class 15 (10am)
--   Fina Gisubizo      → Class 16 (10am)
--   Grace Umutesi, Patrick Mugabo, Fash Maniraguha,
--   Madeleine Uwase, Nicholas Hitimana, Prince Habimana → reserve

INSERT INTO facilitators (id, full_name, phone, email) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Peter Miiro',       '+250788200001', 'peter.miiro@cla.rw'),
  ('a1000000-0000-0000-0000-000000000002', 'Fred Kateera',      '+250788200002', 'fred.kateera@cla.rw'),
  ('a1000000-0000-0000-0000-000000000003', 'Justine Kirabo',    '+250788200003', 'justine.kirabo@cla.rw'),
  ('a1000000-0000-0000-0000-000000000004', 'Thomas Nkurikiye',  '+250788200004', 'thomas.nkurikiye@cla.rw'),
  ('a1000000-0000-0000-0000-000000000005', 'Timothy Kaseke',    '+250788200005', 'timothy.kaseke@cla.rw'),
  ('a1000000-0000-0000-0000-000000000006', 'Safari Vincent',    '+250788200006', 'safari.vincent@cla.rw'),
  ('a1000000-0000-0000-0000-000000000007', 'Arthur Mugisha',    '+250788200007', 'arthur.mugisha@cla.rw'),
  ('a1000000-0000-0000-0000-000000000008', 'Amos Tuyisenge',    '+250788200008', 'amos.tuyisenge@cla.rw'),
  ('a1000000-0000-0000-0000-000000000009', 'Isabelle Uwera',    '+250788200009', 'isabelle.uwera@cla.rw'),
  ('a1000000-0000-0000-0000-000000000010', 'Waringa Kibe',      '+250788200010', 'waringa.kibe@cla.rw'),
  ('a1000000-0000-0000-0000-000000000011', 'Edwick Mutuyimana', '+250788200011', 'edwick.mutuyimana@cla.rw'),
  ('a1000000-0000-0000-0000-000000000012', 'Romeo Irakoze',     '+250788200012', 'romeo.irakoze@cla.rw'),
  ('a1000000-0000-0000-0000-000000000013', 'Fina Gisubizo',     '+250788200013', 'fina.gisubizo@cla.rw'),
  ('a1000000-0000-0000-0000-000000000014', 'Grace Umutesi',     '+250788200014', 'grace.umutesi@cla.rw'),
  ('a1000000-0000-0000-0000-000000000015', 'Patrick Mugabo',    '+250788200015', 'patrick.mugabo@cla.rw'),
  ('a1000000-0000-0000-0000-000000000016', 'Fash Maniraguha',   '+250788200016', 'fash.maniraguha@cla.rw'),
  ('a1000000-0000-0000-0000-000000000017', 'Madeleine Uwase',   '+250788200017', 'madeleine.uwase@cla.rw'),
  ('a1000000-0000-0000-0000-000000000018', 'Nicholas Hitimana', '+250788200018', 'nicholas.hitimana@cla.rw'),
  ('a1000000-0000-0000-0000-000000000019', 'Prince Habimana',   '+250788200019', 'prince.habimana@cla.rw');

-- ─── Assign facilitators to classes ──────────────────────────
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000001' WHERE name IN ('Class 01', 'Class 09');
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000002' WHERE name IN ('Class 02', 'Class 10');
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000003' WHERE name IN ('Class 03', 'Class 11');
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000004' WHERE name = 'Class 04';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000005' WHERE name = 'Class 05';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000006' WHERE name = 'Class 06';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000007' WHERE name = 'Class 07';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000008' WHERE name = 'Class 08';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000009' WHERE name = 'Class 12';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000010' WHERE name = 'Class 13';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000011' WHERE name = 'Class 14';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000012' WHERE name = 'Class 15';
UPDATE classes SET facilitator_id = 'a1000000-0000-0000-0000-000000000013' WHERE name = 'Class 16';

-- ─── 192 members — 12 per class ──────────────────────────────

-- Class 01 (8am) — Peter Miiro
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Arnaud',    'Dushimumuremyi', '+250780100101', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:00:00+00'),
  ('Alexia',    'Ingabire',       '+250780100102', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:05:00+00'),
  ('Aubin',     'Irakiza',        '+250780100103', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:10:00+00'),
  ('Bienvenu',  'Muvunyi',        '+250780100104', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:15:00+00'),
  ('Bonita',    'Mucyo',          '+250780100105', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:20:00+00'),
  ('Brenda',    'Mundekere',      '+250780100106', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:25:00+00'),
  ('Brian',     'Ebiyau',         '+250780100107', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:30:00+00'),
  ('Carine',    'Ndahiro',        '+250780100108', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:35:00+00'),
  ('Catherine', 'Kuria',          '+250780100109', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:40:00+00'),
  ('Chantal',   'Uwimana',        '+250780100110', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:45:00+00'),
  ('Christelle','Uwase',          '+250780100111', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:50:00+00'),
  ('Cindy',     'Kayihura',       '+250780100112', '8am', (SELECT id FROM classes WHERE name='Class 01'), '2026-01-12 08:55:00+00');

-- Class 02 (8am) — Fred Kateera
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Claudia',   'Iradukunda',     '+250780100201', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:00:00+00'),
  ('Daniella',  'Ingabire',       '+250780100202', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:05:00+00'),
  ('Dawson',    'Rubanzacumu',    '+250780100203', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:10:00+00'),
  ('Deborah',   'Giramata',       '+250780100204', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:15:00+00'),
  ('Derrick',   'Kayitare',       '+250780100205', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:20:00+00'),
  ('Diana',     'Mutoni',         '+250780100206', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:25:00+00'),
  ('Diane',     'Mukamazimpaka',  '+250780100207', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:30:00+00'),
  ('Dorian',    'Kajyambere',     '+250780100208', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:35:00+00'),
  ('Dushime',   'Pacifique',      '+250780100209', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:40:00+00'),
  ('Eden',      'Izabayo',        '+250780100210', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:45:00+00'),
  ('Elena',     'Shenge',         '+250780100211', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:50:00+00'),
  ('Emmanuel',  'Nshuti',         '+250780100212', '8am', (SELECT id FROM classes WHERE name='Class 02'), '2026-01-12 08:55:00+00');

-- Class 03 (8am) — Justine Kirabo
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Ephrem',    'Nziza',          '+250780100301', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:00:00+00'),
  ('Erica',     'Gateka',         '+250780100302', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:05:00+00'),
  ('Felix',     'Ouma',           '+250780100303', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:10:00+00'),
  ('Germaine',  'Mukansoro',      '+250780100304', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:15:00+00'),
  ('Gloria',    'Abizera',        '+250780100305', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:20:00+00'),
  ('Habinshuti','Innocent',       '+250780100306', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:25:00+00'),
  ('Halimah',   'Nakiyemba',      '+250780100307', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:30:00+00'),
  ('Jack',      'Ndahiro',        '+250780100308', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:35:00+00'),
  ('Jacqueline','Mukarukundo',    '+250780100309', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:40:00+00'),
  ('Jane',      'Karigirwa',      '+250780100310', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:45:00+00'),
  ('Jade',      'Tuzinde',        '+250780100311', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:50:00+00'),
  ('Jemimah',   'Umuhoza',        '+250780100312', '8am', (SELECT id FROM classes WHERE name='Class 03'), '2026-01-12 08:55:00+00');

-- Class 04 (8am) — Thomas Nkurikiye
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Julie',     'Ishimwe',        '+250780100401', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:00:00+00'),
  ('Kevine',    'Rwema',          '+250780100402', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:05:00+00'),
  ('Lancelot',  'Nshuti',         '+250780100403', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:10:00+00'),
  ('Linda',     'Ikirezi',        '+250780100404', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:15:00+00'),
  ('Marcel',    'Ntwali',         '+250780100405', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:20:00+00'),
  ('Martine',   'Umubyeyi',       '+250780100406', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:25:00+00'),
  ('Melissa',   'Rubakisibo',     '+250780100407', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:30:00+00'),
  ('Nadia',     'Umutoni',        '+250780100408', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:35:00+00'),
  ('Noella',    'Uwera',          '+250780100409', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:40:00+00'),
  ('Olivier',   'Rukundo',        '+250780100410', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:45:00+00'),
  ('Ornella',   'Imena',          '+250780100411', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:50:00+00'),
  ('Pacifique', 'Ndayisenga',     '+250780100412', '8am', (SELECT id FROM classes WHERE name='Class 04'), '2026-01-12 08:55:00+00');

-- Class 05 (8am) — Timothy Kaseke
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Patrick',   'Niyitanga',      '+250780100501', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:00:00+00'),
  ('Peace',     'Ishimwe',        '+250780100502', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:05:00+00'),
  ('Perry',     'Udahemuka',      '+250780100503', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:10:00+00'),
  ('Philip',    'Amoko',          '+250780100504', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:15:00+00'),
  ('Prince',    'Nizigama',       '+250780100505', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:20:00+00'),
  ('Racheal',   'Umuhoza',        '+250780100506', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:25:00+00'),
  ('Raissa',    'Teta',           '+250780100507', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:30:00+00'),
  ('Rebecca',   'Agiraneza',      '+250780100508', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:35:00+00'),
  ('Ronald',    'Asiimwe',        '+250780100509', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:40:00+00'),
  ('Ruth',      'Uwase',          '+250780100510', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:45:00+00'),
  ('Samantha',  'Kirabo',         '+250780100511', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:50:00+00'),
  ('Sandra',    'Umuhoza',        '+250780100512', '8am', (SELECT id FROM classes WHERE name='Class 05'), '2026-01-12 08:55:00+00');

-- Class 06 (8am) — Safari Vincent
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Sandrine',  'Ingabire',       '+250780100601', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:00:00+00'),
  ('Seraphine', 'Mukaremera',     '+250780100602', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:05:00+00'),
  ('Sharon',    'Uwantege',       '+250780100603', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:10:00+00'),
  ('Sonia',     'Karanganwa',     '+250780100604', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:15:00+00'),
  ('Stacey',    'Isaro',          '+250780100605', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:20:00+00'),
  ('Thalissa',  'Aradukunda',     '+250780100606', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:25:00+00'),
  ('Thierry',   'Gashema',        '+250780100607', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:30:00+00'),
  ('Tona',      'Kayihura',       '+250780100608', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:35:00+00'),
  ('Vanessa',   'Irakoze',        '+250780100609', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:40:00+00'),
  ('Vanina',    'Naho',           '+250780100610', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:45:00+00'),
  ('Victor',    'Kimani',         '+250780100611', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:50:00+00'),
  ('Virginia',  'Mwangi',         '+250780100612', '8am', (SELECT id FROM classes WHERE name='Class 06'), '2026-01-12 08:55:00+00');

-- Class 07 (8am) — Arthur Mugisha
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Winrose',   'Simiyu',         '+250780100701', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:00:00+00'),
  ('Yakin',     'Niyidushoboza',  '+250780100702', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:05:00+00'),
  ('Zainab',    'Saidi',          '+250780100703', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:10:00+00'),
  ('Adeline',   'Mpinganzima',    '+250780100704', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:15:00+00'),
  ('Adolphe',   'Loua',           '+250780100705', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:20:00+00'),
  ('Agatha',    'Mwikali',        '+250780100706', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:25:00+00'),
  ('Aime',      'Mutuyimana',     '+250780100707', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:30:00+00'),
  ('Akarabo',   'Brenna',         '+250780100708', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:35:00+00'),
  ('Alexis',    'Ntwali',         '+250780100709', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:40:00+00'),
  ('Aline',     'Umwali',         '+250780100710', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:45:00+00'),
  ('Allen',     'Bitega',         '+250780100711', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:50:00+00'),
  ('Amina',     'Valentine',      '+250780100712', '8am', (SELECT id FROM classes WHERE name='Class 07'), '2026-01-12 08:55:00+00');

-- Class 08 (8am) — Amos Tuyisenge
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Andrew',    'Muhwezi',        '+250780100801', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:00:00+00'),
  ('Angel',     'Agaba',          '+250780100802', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:05:00+00'),
  ('Anita',     'Mutesi',         '+250780100803', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:10:00+00'),
  ('Anna',      'Akayesu',        '+250780100804', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:15:00+00'),
  ('Asmait',    'Tesfagebriel',   '+250780100805', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:20:00+00'),
  ('Azabe',     'Shimwa',         '+250780100806', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:25:00+00'),
  ('Babra',     'Umubyeyi',       '+250780100807', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:30:00+00'),
  ('Benedict',  'Ayobi',          '+250780100808', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:35:00+00'),
  ('Beni',      'Ntwari',         '+250780100809', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:40:00+00'),
  ('Benito',    'Isingizwe',      '+250780100810', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:45:00+00'),
  ('Benjamin',  'Kwenda',         '+250780100811', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:50:00+00'),
  ('Betel',     'Tesfay',         '+250780100812', '8am', (SELECT id FROM classes WHERE name='Class 08'), '2026-01-12 08:55:00+00');

-- Class 09 (10am) — Peter Miiro
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Blaise',    'Ntawukururyayo', '+250780100901', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:00:00+00'),
  ('Byiringiro','Emmy',           '+250780100902', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:05:00+00'),
  ('Cindy',     'Umurerwa',       '+250780100903', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:10:00+00'),
  ('Colombe',   'Ikirezi',        '+250780100904', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:15:00+00'),
  ('Damilare',  'Emmanuel',       '+250780100905', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:20:00+00'),
  ('Daniel',    'Mutsinzi',       '+250780100906', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:25:00+00'),
  ('Daphne',    'Muziga',         '+250780100907', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:30:00+00'),
  ('David',     'Bizimana',       '+250780100908', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:35:00+00'),
  ('Delice',    'Shimwa',         '+250780100909', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:40:00+00'),
  ('Derrick',   'Muhire',         '+250780100910', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:45:00+00'),
  ('Diana',     'Naeku',          '+250780100911', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:50:00+00'),
  ('Divine',    'Ifechukwude',    '+250780100912', '10am', (SELECT id FROM classes WHERE name='Class 09'), '2026-01-12 10:55:00+00');

-- Class 10 (10am) — Fred Kateera
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Doreen',    'Ishimwe',        '+250780101001', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:00:00+00'),
  ('Eduardo',   'Sindano',        '+250780101002', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:05:00+00'),
  ('Elijah',    'Aremu',          '+250780101003', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:10:00+00'),
  ('Esther',    'Uwase',          '+250780101004', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:15:00+00'),
  ('Fritz',     'Uwamungu',       '+250780101005', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:20:00+00'),
  ('Gisele',    'Uwineza',        '+250780101006', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:25:00+00'),
  ('Jacky',     'Uwimbabazi',     '+250780101007', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:30:00+00'),
  ('Joyce',     'Mugisha',        '+250780101008', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:35:00+00'),
  ('Judith',    'Igbo',           '+250780101009', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:40:00+00'),
  ('Kessia',    'Teta',           '+250780101010', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:45:00+00'),
  ('Kizito',    'Nyuytiymbiy',    '+250780101011', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:50:00+00'),
  ('Laetitia',  'Noumi',          '+250780101012', '10am', (SELECT id FROM classes WHERE name='Class 10'), '2026-01-12 10:55:00+00');

-- Class 11 (10am) — Justine Kirabo
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Marian',    'Umutoni',        '+250780101101', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:00:00+00'),
  ('Melissa',   'Gasamagera',     '+250780101102', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:05:00+00'),
  ('Mpano',     'Yvonne',         '+250780101103', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:10:00+00'),
  ('Mugisha',   'Tresor',         '+250780101104', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:15:00+00'),
  ('Nathan',    'Kamtchoum',      '+250780101105', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:20:00+00'),
  ('Neza',      'Melissa',        '+250780101106', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:25:00+00'),
  ('Obedine',   'Fobuzie',        '+250780101107', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:30:00+00'),
  ('Omale',     'Emmanuel',       '+250780101108', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:35:00+00'),
  ('Oyindamola','Owolabi',        '+250780101109', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:40:00+00'),
  ('Paola',     'Cyuzuzo',        '+250780101110', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:45:00+00'),
  ('Patrick',   'Shyaka',         '+250780101111', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:50:00+00'),
  ('Peace',     'Bureshyo',       '+250780101112', '10am', (SELECT id FROM classes WHERE name='Class 11'), '2026-01-12 10:55:00+00');

-- Class 12 (10am) — Isabelle Uwera
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Peninah',   'Wambua',         '+250780101201', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:00:00+00'),
  ('Philomena', 'Musyoka',        '+250780101202', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:05:00+00'),
  ('Praistine', 'Johnson',        '+250780101203', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:10:00+00'),
  ('Raison',    'Madjilem',       '+250780101204', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:15:00+00'),
  ('Redempta',  'Ingabire',       '+250780101205', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:20:00+00'),
  ('Rwalinda',  'Christa',        '+250780101206', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:25:00+00'),
  ('Sandrah',   'Turatsinze',     '+250780101207', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:30:00+00'),
  ('Sharifa',   'Beza',           '+250780101208', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:35:00+00'),
  ('Shemaryase','Talent',         '+250780101209', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:40:00+00'),
  ('Sugira',    'Digne',          '+250780101210', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:45:00+00'),
  ('Sylvie',    'Niyitanga',      '+250780101211', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:50:00+00'),
  ('Thamar',    'Ruhumuriza',     '+250780101212', '10am', (SELECT id FROM classes WHERE name='Class 12'), '2026-01-12 10:55:00+00');

-- Class 13 (10am) — Waringa Kibe
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Tresor',    'Kamali',         '+250780101301', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:00:00+00'),
  ('Umwali',    'Ntaganzwa',      '+250780101302', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:05:00+00'),
  ('Umwiza',    'Penciah',        '+250780101303', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:10:00+00'),
  ('Uwera',     'Hindu',          '+250780101304', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:15:00+00'),
  ('Alice',     'Umuhire',        '+250780101305', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:20:00+00'),
  ('Uwizeye',   'Grace',          '+250780101306', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:25:00+00'),
  ('Clarisse',  'Uwera',          '+250780101307', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:30:00+00'),
  ('Gracious',  'Batamuriza',     '+250780101308', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:35:00+00'),
  ('Henriette', 'Kayabo',         '+250780101309', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:40:00+00'),
  ('Imana',     'Glorieuse',      '+250780101310', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:45:00+00'),
  ('Ishimwe',   'Doreen',         '+250780101311', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:50:00+00'),
  ('Juliah',    'Agasaro',        '+250780101312', '10am', (SELECT id FROM classes WHERE name='Class 13'), '2026-01-12 10:55:00+00');

-- Class 14 (10am) — Edwick Mutuyimana
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Kaneza',    'Bertilde',       '+250780101401', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:00:00+00'),
  ('Kayitesi',  'Solange',        '+250780101402', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:05:00+00'),
  ('Lilian',    'Nakibirango',    '+250780101403', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:10:00+00'),
  ('Loise',     'Wairimu',        '+250780101404', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:15:00+00'),
  ('Marie',     'Niyonzima',      '+250780101405', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:20:00+00'),
  ('Marthe',    'Mukamugema',     '+250780101406', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:25:00+00'),
  ('Mbulula',   'Ruth',           '+250780101407', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:30:00+00'),
  ('Mirembe',   'Joy',            '+250780101408', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:35:00+00'),
  ('Mugabo',    'Patrick',        '+250780101409', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:40:00+00'),
  ('Mugisha',   'Aline',          '+250780101410', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:45:00+00'),
  ('Mukamugema','Marthe',         '+250780101411', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:50:00+00'),
  ('Mukaremera','Seraphine',      '+250780101412', '10am', (SELECT id FROM classes WHERE name='Class 14'), '2026-01-12 10:55:00+00');

-- Class 15 (10am) — Romeo Irakoze
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Mulindwa',  'David',          '+250780101501', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:00:00+00'),
  ('Murenzi',   'Tito',           '+250780101502', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:05:00+00'),
  ('Murisa',    'Yvette',         '+250780101503', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:10:00+00'),
  ('Nambaje',   'Eric',           '+250780101504', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:15:00+00'),
  ('Nayituriki','Sandrine',       '+250780101505', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:20:00+00'),
  ('Ndayishinye','Espoir',        '+250780101506', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:25:00+00'),
  ('Ndikumana', 'Josiane',        '+250780101507', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:30:00+00'),
  ('Ngabo',     'Justin',         '+250780101508', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:35:00+00'),
  ('Ngenzi',    'Alvine',         '+250780101509', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:40:00+00'),
  ('Nibigira',  'Leonce',         '+250780101510', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:45:00+00'),
  ('Nimbona',   'Pascale',        '+250780101511', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:50:00+00'),
  ('Niyibizi',  'Solange',        '+250780101512', '10am', (SELECT id FROM classes WHERE name='Class 15'), '2026-01-12 10:55:00+00');

-- Class 16 (10am) — Fina Gisubizo
INSERT INTO members (first_name, last_name, phone, preferred_slot, class_id, registered_at) VALUES
  ('Niyomugabo','Cynthia',        '+250780101601', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:00:00+00'),
  ('Nkurunziza','Blaise',         '+250780101602', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:05:00+00'),
  ('Ntaganzwa', 'Liliane',        '+250780101603', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:10:00+00'),
  ('Ntawukururyayo','Marie',      '+250780101604', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:15:00+00'),
  ('Ntwali',    'Marcel',         '+250780101605', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:20:00+00'),
  ('Ntwari',    'Eric',           '+250780101606', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:25:00+00'),
  ('Nzeyimana', 'Pauline',        '+250780101607', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:30:00+00'),
  ('Rukundo',   'Olivier',        '+250780101608', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:35:00+00'),
  ('Rutaganda', 'Kevin',          '+250780101609', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:40:00+00'),
  ('Sangano',   'David',          '+250780101610', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:45:00+00'),
  ('Songa',     'Saver',          '+250780101611', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:50:00+00'),
  ('Teta',      'Raissa',         '+250780101612', '10am', (SELECT id FROM classes WHERE name='Class 16'), '2026-01-12 10:55:00+00');

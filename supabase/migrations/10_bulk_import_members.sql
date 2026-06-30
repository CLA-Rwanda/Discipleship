-- Migration 10: Bulk import members from Google Form registration responses
-- 40 unique registrants (1 duplicate removed: Eppie Munyana Nkusi = same phone as Eppie Munyana)
-- Slot source: explicit in name field, column 4, or alternating distribution for unspecified

DO $$
BEGIN
  -- ── Alternating random distribution ─────────────────────────────────────────
  PERFORM assign_member_to_class('Mugisha',    'Erica',       '0794371556',    '', '8am');
  PERFORM assign_member_to_class('Teta',       'Rukabu',      '0798655426',    '', '10am');
  PERFORM assign_member_to_class('Naome',      'Joyeuse',     '0798287672',    '', '8am');
  PERFORM assign_member_to_class('Bendou',     'Sœur',        '0795027607',    '', '10am');
  PERFORM assign_member_to_class('Ritah',      'Isimbi',      '0798976277',    '', '8am');
  PERFORM assign_member_to_class('Ntaganda',   'Herve',       '0784762040',    '', '10am');
  PERFORM assign_member_to_class('Urusaro',    'Princesse',   '0782979477',    '', '8am');
  PERFORM assign_member_to_class('Eppie',      'Munyana',     '0794993569',    '', '10am');
  PERFORM assign_member_to_class('Mugabo',     'Ronald',      '0788398855',    '', '8am');
  PERFORM assign_member_to_class('Tchepe',     'Yeo',         '0794245458',    '', '10am');
  PERFORM assign_member_to_class('Gihozo',     'Kessy',       '0790203701',    '', '8am');
  PERFORM assign_member_to_class('Umwali',     'Fanny',       '0792012966',    '', '10am');
  PERFORM assign_member_to_class('Evelyne',    'Mutesi',      '0798437504',    '', '8am');
  PERFORM assign_member_to_class('Nishimwe',   'Sylvie',      '+250783446467', '', '10am');
  PERFORM assign_member_to_class('Cyubahiro',  'Fortune',     '0792024411',    '', '8am');
  PERFORM assign_member_to_class('Uwineza',    'Allen',       '0787908562',    '', '10am');
  PERFORM assign_member_to_class('Ahereza',    'Sarahpraise', '250794234587',  '', '8am');
  PERFORM assign_member_to_class('Agasaro',    'Rebecca',     '0789393278',    '', '10am');
  PERFORM assign_member_to_class('Nyaki',      'Benedicta',   '0785060833',    '', '8am');
  PERFORM assign_member_to_class('Lionel',     'Murenzi',     '0786443763',    '', '10am');
  PERFORM assign_member_to_class('Agahozo',    'Ninette',     '788400625',     '', '8am');
  PERFORM assign_member_to_class('James',      'Namani',      '0787770227',    '', '10am');
  PERFORM assign_member_to_class('Amos',       '',            '+250784544883', '', '8am');
  PERFORM assign_member_to_class('Bonfils',    'Rukundo',     '0792893010',    '', '10am');
  PERFORM assign_member_to_class('Alinda',     'Mackline',    '0780230074',    '', '8am');
  PERFORM assign_member_to_class('Mary',       'Ntabala',     '0780320328',    '', '10am');
  PERFORM assign_member_to_class('Sylvia',     'Mccarter',    '0784670329',    '', '8am');
  PERFORM assign_member_to_class('Impundu',    'Mireille',    '0788256855',    '', '10am');
  PERFORM assign_member_to_class('Richard',    'Anshemeza',   '0782051575',    '', '8am');
  PERFORM assign_member_to_class('Akaliza',    'Sandrah',     '0785936608',    '', '10am');
  PERFORM assign_member_to_class('Ntaganzwa',  'Gael',        '0786819646',    '', '8am');
  PERFORM assign_member_to_class('Joan',       'Mbabazi',     '0784711096',    '', '10am');
  PERFORM assign_member_to_class('Gatwaza',    'Rene',        '0788659461',    '', '8am');

  -- ── Explicit slot preferences ────────────────────────────────────────────────
  PERFORM assign_member_to_class('Nancy',      'Rubango',     '0788669150',    '', '10am'); -- column 4: 10:00
  PERFORM assign_member_to_class('Nadege',     '',            '0787312068',    '', '10am'); -- name: "Nadege 10 am"
  PERFORM assign_member_to_class('Olga',       '',            '0788520902',    '', '10am'); -- name: "Olga 10am"
  PERFORM assign_member_to_class('Lillian',    '',            '0785208904',    '', '10am'); -- name: "Lillian 10am"
  PERFORM assign_member_to_class('Kevin',      '',            '0785283492',    '', '8am');  -- name: "Kevin 8am"
  PERFORM assign_member_to_class('Pretty',     '',            '0780949062',    '', '10am'); -- name: "Pretty 10am"
  PERFORM assign_member_to_class('Cynthia',    '',            '0782390318',    '', '10am'); -- name: "Cynthia 10am"
END $$;

-- ── Set other_name (middle names) for members who have them ──────────────────
UPDATE members SET other_name = 'Jill'             WHERE phone = '0798655426';  -- Teta Jill Rukabu
UPDATE members SET other_name = 'Janna Vitalina'   WHERE phone = '0795027607';  -- Bendou Janna Vitalina Sœur
UPDATE members SET other_name = 'Cyuzuzo'          WHERE phone = '0798976277';  -- Ritah Cyuzuzo Isimbi
UPDATE members SET other_name = 'Ange'             WHERE phone = '0782979477';  -- Urusaro Ange Princesse
UPDATE members SET other_name = 'Berenice'         WHERE phone = '0794245458';  -- Tchepe Berenice Yeo
UPDATE members SET other_name = 'Sandra'           WHERE phone = '0790203701';  -- Gihozo Sandra Kessy
UPDATE members SET other_name = 'Gasana'           WHERE phone = '+250783446467'; -- Nishimwe Gasana Sylvie
UPDATE members SET other_name = 'Rwabukumba Yvan'  WHERE phone = '0792024411';  -- Cyubahiro Rwabukumba Yvan Fortune
UPDATE members SET other_name = 'Pearl'            WHERE phone = '0789393278';  -- Agasaro Pearl Rebecca
UPDATE members SET other_name = 'Gasore'           WHERE phone = '0792893010';  -- Bonfils Gasore Rukundo
UPDATE members SET other_name = 'D.'               WHERE phone = '0784670329';  -- Sylvia D. McCarter
UPDATE members SET other_name = 'Bagire'           WHERE phone = '0785936608';  -- Akaliza Bagire Sandrah
UPDATE members SET other_name = 'Gisa'             WHERE phone = '0786819646';  -- Ntaganzwa Gisa Gael
UPDATE members SET other_name = 'Paul'             WHERE phone = '0788659461';  -- Gatwaza Paul Rene

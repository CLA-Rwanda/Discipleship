-- Migration 12: Renumber 10am classes to continue after 8am classes
-- Before: both 8am and 10am slots reused "Class 01".."Class 08" independently.
-- After:  8am keeps "Class 01".."Class 08"; 10am becomes "Class 09".."Class 16",
--         so class names are globally unique and numbering reads as one
--         continuous sequence split by slot. IDs are untouched, so all
--         member/attendance/facilitator relationships are preserved.
-- Safe to re-run: only touches rows still named "Class 01".."Class 08" at 10am.

UPDATE classes
SET name = 'Class ' || LPAD((SUBSTRING(name FROM '\d+')::INT + 8)::TEXT, 2, '0')
WHERE slot = '10am'
  AND name ~ '^Class 0[1-8]$';

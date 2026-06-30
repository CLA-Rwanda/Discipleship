-- Migration 11: Fix capitalization errors introduced in migration 10
-- Two last_name values were lowercased incorrectly by the name parser

UPDATE members SET last_name = 'SarahPraise' WHERE phone = '250794234587';  -- Ahereza SarahPraise
UPDATE members SET last_name = 'McCarter'    WHERE phone = '0784670329';    -- Sylvia D. McCarter

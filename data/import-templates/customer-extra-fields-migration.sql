-- Adds email, notes and wallet columns to the customers table so the CRM can
-- store full contact info and the running balance. Safe to run multiple times.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS email text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes text DEFAULT '';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS wallet numeric DEFAULT 0;

NOTIFY pgrst, 'reload schema';

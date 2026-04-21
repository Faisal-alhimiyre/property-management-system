-- Backfill newly added contract columns from existing data.
-- Safe to run multiple times. Run AFTER contracts_link_tenant_columns_2026.sql.
--
-- IMPORTANT — what this script can and cannot do:
--
-- • If contracts.terms still exists, run the older JSON-driven backfill before dropping it.
-- • This current variant is compatible with schemas where contracts.terms was already dropped.
--   In that case it only normalizes existing column data and infers yearly_rent from monthly_rent.
--
-- • Rows where terms IS NULL, empty, plain text, or JSON without those keys will NOT get
--   broker / payment_cycle / etc. from this script — there is nothing to copy.
--
-- • The assign-tenant API writes structured fields to dedicated columns directly; it does
--   NOT mirror the full lease into contracts.terms. So many historical rows never had
--   broker/payment data in terms, and the backfill cannot invent it.
--
-- • yearly_rent can still be inferred from monthly_rent (legacy) or monthlyRent in JSON
--   — see CASE below.

BEGIN;

-- Ensure required columns exist (so this file can run standalone).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS broker_name TEXT,
  ADD COLUMN IF NOT EXISTS broker_commercial_register TEXT,
  ADD COLUMN IF NOT EXISTS broker_phone TEXT,
  ADD COLUMN IF NOT EXISTS electricity_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS water_included BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gas_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS ac_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS yearly_rent NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS payment_cycle TEXT,
  ADD COLUMN IF NOT EXISTS installments_count INTEGER,
  ADD COLUMN IF NOT EXISTS insurance_paid TEXT,
  ADD COLUMN IF NOT EXISTS meter_number TEXT,
  ADD COLUMN IF NOT EXISTS lease_notes TEXT,
  ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC(14, 2);
  -- monthly_rent above: legacy column only; read once for backfill then drop via contracts_drop_monthly_rent_2026.sql

UPDATE public.contracts c
SET
  broker_name = NULLIF(c.broker_name, ''),
  broker_commercial_register = NULLIF(c.broker_commercial_register, ''),
  broker_phone = NULLIF(c.broker_phone, ''),
  electricity_included = COALESCE(c.electricity_included, FALSE),
  water_included = COALESCE(c.water_included, FALSE),
  gas_type = COALESCE(NULLIF(c.gas_type, ''), 'none'),
  ac_type = COALESCE(NULLIF(c.ac_type, ''), 'none'),
  yearly_rent = COALESCE(
    c.yearly_rent,
    CASE
      WHEN c.monthly_rent IS NOT NULL THEN c.monthly_rent * 12
      ELSE NULL
    END
  ),
  payment_cycle = NULLIF(c.payment_cycle, ''),
  insurance_paid = NULLIF(c.insurance_paid, ''),
  meter_number = NULLIF(c.meter_number, ''),
  lease_notes = NULLIF(c.lease_notes, '');

COMMIT;

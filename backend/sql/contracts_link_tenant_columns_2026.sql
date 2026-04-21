-- Link-tenant form fields as first-class columns on public.contracts.
-- Run once in Supabase SQL Editor (safe to re-run).

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
  ADD COLUMN IF NOT EXISTS lease_notes TEXT;

COMMENT ON COLUMN public.contracts.broker_name IS 'Real estate broker / agent name (link-tenant form).';
COMMENT ON COLUMN public.contracts.yearly_rent IS 'Annual SAR for this lease (canonical; monthly display = yearly/12).';
COMMENT ON COLUMN public.contracts.lease_notes IS 'Freeform notes from link-tenant (distinct from legacy terms column if used).';

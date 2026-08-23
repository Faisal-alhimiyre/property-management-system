-- Finance: security deposit ledger + cost funding source + numeric insurance_paid
-- Safe to re-run. Run in Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- 1) costs: funding source + deposit-covered amount
-- ---------------------------------------------------------------------------
ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS funding_source TEXT NOT NULL DEFAULT 'owner';

ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS deposit_covered_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'costs_funding_source_check'
  ) THEN
    ALTER TABLE public.costs
      ADD CONSTRAINT costs_funding_source_check
      CHECK (funding_source IN ('owner', 'security_deposit'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'costs_deposit_covered_amount_check'
  ) THEN
    ALTER TABLE public.costs
      ADD CONSTRAINT costs_deposit_covered_amount_check
      CHECK (deposit_covered_amount >= 0 AND deposit_covered_amount <= amount);
  END IF;
END $$;

COMMENT ON COLUMN public.costs.funding_source IS
  'Economic payer intent: owner | security_deposit. deposit_covered_amount is authoritative only after a matching deduction ledger row exists.';
COMMENT ON COLUMN public.costs.deposit_covered_amount IS
  'Portion of amount funded by tenant security deposit (may be partial). Must match a deduction transaction.';

-- ---------------------------------------------------------------------------
-- 2) security_deposit_transactions ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.security_deposit_transactions (
  id BIGSERIAL PRIMARY KEY,
  contract_id BIGINT NOT NULL REFERENCES public.contracts (id) ON DELETE CASCADE,
  apartment_id BIGINT NOT NULL REFERENCES public.apartments (id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('received', 'deduction', 'replenishment', 'refund', 'adjustment')),
  amount NUMERIC(14, 2) NOT NULL,
  cost_id INTEGER REFERENCES public.costs (id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT security_deposit_transactions_amount_check CHECK (
    (type = 'adjustment') OR (amount > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_sdt_contract_id
  ON public.security_deposit_transactions (contract_id);
CREATE INDEX IF NOT EXISTS idx_sdt_apartment_id
  ON public.security_deposit_transactions (apartment_id);
CREATE INDEX IF NOT EXISTS idx_sdt_cost_id
  ON public.security_deposit_transactions (cost_id);
CREATE INDEX IF NOT EXISTS idx_sdt_type
  ON public.security_deposit_transactions (type);

COMMENT ON TABLE public.security_deposit_transactions IS
  'Ledger for tenant security deposits. Remaining = +received +replenishment +adjustment -deduction -refund (adjustment may be signed).';

-- ---------------------------------------------------------------------------
-- 3) contracts.insurance_paid TEXT → NUMERIC (preserve convertible values)
-- ---------------------------------------------------------------------------
-- Normalize blank / non-numeric text to NULL before cast.
UPDATE public.contracts
SET insurance_paid = NULL
WHERE insurance_paid IS NOT NULL
  AND btrim(insurance_paid::text) = '';

UPDATE public.contracts
SET insurance_paid = NULL
WHERE insurance_paid IS NOT NULL
  AND btrim(insurance_paid::text) !~ '^[0-9]+([.][0-9]+)?$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contracts'
      AND column_name = 'insurance_paid'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE public.contracts
      ALTER COLUMN insurance_paid TYPE NUMERIC(14, 2)
      USING NULLIF(btrim(insurance_paid::text), '')::NUMERIC(14, 2);
  END IF;
END $$;

COMMENT ON COLUMN public.contracts.insurance_paid IS
  'Original agreed/received security deposit amount (NUMERIC). Do not mutate for deductions — use security_deposit_transactions.';

-- ---------------------------------------------------------------------------
-- 4) Seed one "received" ledger row from insurance_paid when missing
-- ---------------------------------------------------------------------------
INSERT INTO public.security_deposit_transactions (
  contract_id, apartment_id, type, amount, notes
)
SELECT
  c.id,
  c.apartment_id,
  'received',
  c.insurance_paid,
  'Seeded from contracts.insurance_paid'
FROM public.contracts c
WHERE c.insurance_paid IS NOT NULL
  AND c.insurance_paid > 0
  AND c.apartment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.security_deposit_transactions t
    WHERE t.contract_id = c.id
      AND t.type = 'received'
  );

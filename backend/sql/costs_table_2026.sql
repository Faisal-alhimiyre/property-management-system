-- Costs (building / apartment expenses) — aligns with local `walajna_costs` shape in apartment-costs.js:
--   type → cost_type, expenseDate → expense_date, createdAt → created_at
-- Run in Supabase SQL Editor (public schema).

CREATE TABLE IF NOT EXISTS public.costs (
  id SERIAL PRIMARY KEY,
  apartment_id INTEGER NOT NULL REFERENCES public.apartments (id) ON DELETE CASCADE,
  contract_id INTEGER REFERENCES public.contracts (id) ON DELETE SET NULL,
  -- Same values as UI: maintenance, repair, discount, adjustment, service, replacement, cleaning, other
  cost_type TEXT NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('approved', 'pending', 'cancelled')),
  expense_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_costs_apartment_id ON public.costs (apartment_id);
CREATE INDEX IF NOT EXISTS idx_costs_contract_id ON public.costs (contract_id);
CREATE INDEX IF NOT EXISTS idx_costs_expense_date ON public.costs (expense_date DESC);

COMMENT ON TABLE public.costs IS 'Per-apartment expenses (finance / costs page); optional link to contract.';

-- Optional: enable RLS later and scope by apartment owner, e.g.:
-- ALTER TABLE public.costs ENABLE ROW LEVEL SECURITY;

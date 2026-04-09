-- Launch-ready payment schedule (replaces browser localStorage for installments).
-- Run in Supabase SQL editor after review.

CREATE TABLE IF NOT EXISTS public.payment_installments (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES public.contracts (id) ON DELETE CASCADE,
  apartment_id INTEGER REFERENCES public.apartments (id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES public.tenants (id) ON DELETE SET NULL,
  installment_index INTEGER NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITHOUT TIME ZONE,
  payment_method VARCHAR(50),
  notes TEXT,
  original_amount NUMERIC(10, 2),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  CONSTRAINT payment_installments_contract_index_uniq UNIQUE (contract_id, installment_index)
);

CREATE INDEX IF NOT EXISTS payment_installments_apartment_id_idx
  ON public.payment_installments (apartment_id);

CREATE INDEX IF NOT EXISTS payment_installments_contract_id_idx
  ON public.payment_installments (contract_id);

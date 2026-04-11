-- Schema alignment migration for current app code paths.
-- Safe to run multiple times in Supabase SQL editor.

BEGIN;

-- 1) Buildings table (used by /api/buildings and owner pages)
CREATE TABLE IF NOT EXISTS public.buildings (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  code TEXT,
  total_floors INTEGER,
  apartments_count INTEGER,
  apartments_per_floor INTEGER,
  apartment_defaults JSONB,
  payment_defaults JSONB,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS buildings_owner_id_idx ON public.buildings(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS buildings_code_unique_idx ON public.buildings(code) WHERE code IS NOT NULL;

-- 2) Apartments columns expected by backend/frontend
ALTER TABLE public.apartments
  ADD COLUMN IF NOT EXISTS building_id INTEGER REFERENCES public.buildings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apartment_number TEXT,
  ADD COLUMN IF NOT EXISTS floor_number INTEGER,
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS bathrooms INTEGER,
  ADD COLUMN IF NOT EXISTS living_rooms INTEGER,
  ADD COLUMN IF NOT EXISTS tenant_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tenant_national_id TEXT,
  ADD COLUMN IF NOT EXISTS tenant_info JSONB,
  ADD COLUMN IF NOT EXISTS current_contract_id INTEGER,
  ADD COLUMN IF NOT EXISTS lease_status VARCHAR(50) DEFAULT 'vacant',
  ADD COLUMN IF NOT EXISTS maintenance_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'apartments_current_contract_id_fkey'
  ) THEN
    ALTER TABLE public.apartments
      ADD CONSTRAINT apartments_current_contract_id_fkey
      FOREIGN KEY (current_contract_id)
      REFERENCES public.contracts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'apartments_maintenance_id_fkey'
  ) THEN
    ALTER TABLE public.apartments
      ADD CONSTRAINT apartments_maintenance_id_fkey
      FOREIGN KEY (maintenance_id)
      REFERENCES public.maintenance_requests(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS apartments_owner_id_idx ON public.apartments(owner_id);
CREATE INDEX IF NOT EXISTS apartments_building_id_idx ON public.apartments(building_id);
CREATE INDEX IF NOT EXISTS apartments_tenant_user_id_idx ON public.apartments(tenant_user_id);
CREATE INDEX IF NOT EXISTS apartments_tenant_national_id_idx ON public.apartments(tenant_national_id);
CREATE INDEX IF NOT EXISTS apartments_current_contract_id_idx ON public.apartments(current_contract_id);
CREATE INDEX IF NOT EXISTS apartments_maintenance_id_idx ON public.apartments(maintenance_id)
  WHERE maintenance_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS apartments_building_unit_unique_idx
  ON public.apartments(building_id, apartment_number)
  WHERE building_id IS NOT NULL AND apartment_number IS NOT NULL;

-- 3) Helpful indexes for tenant/contract/payment lookups
CREATE INDEX IF NOT EXISTS tenants_user_id_idx ON public.tenants(user_id);
CREATE INDEX IF NOT EXISTS tenants_apartment_id_idx ON public.tenants(apartment_id);
CREATE INDEX IF NOT EXISTS contracts_apartment_id_idx ON public.contracts(apartment_id);
CREATE INDEX IF NOT EXISTS contracts_tenant_id_idx ON public.contracts(tenant_id);
CREATE INDEX IF NOT EXISTS payments_tenant_id_idx ON public.payments(tenant_id);

COMMIT;


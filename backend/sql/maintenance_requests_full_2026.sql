-- Full tenant↔owner request fields on maintenance_requests (all types: صيانة، شكوى، …).
BEGIN;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(32) DEFAULT 'maintenance';

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS contract_id INTEGER REFERENCES public.contracts(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS owner_reply TEXT;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS tenant_reply_seen_at TIMESTAMPTZ;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS owner_seen BOOLEAN DEFAULT FALSE;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS owner_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS maintenance_requests_apartment_contract_idx
  ON public.maintenance_requests(apartment_id, contract_id);

COMMIT;

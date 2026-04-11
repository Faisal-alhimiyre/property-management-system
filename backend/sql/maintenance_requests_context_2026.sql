-- Optional context columns for maintenance_requests (who filed, which building).
-- Run in Supabase after pulling backend that writes these fields.

BEGIN;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS building_id INTEGER REFERENCES public.buildings(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_requests
  ADD COLUMN IF NOT EXISTS submitted_by_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_requests_building_id_idx
  ON public.maintenance_requests(building_id)
  WHERE building_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS maintenance_requests_tenant_id_idx
  ON public.maintenance_requests(tenant_id);

COMMIT;

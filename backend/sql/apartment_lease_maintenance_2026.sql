-- Align apartments.lease_status with app logic (vacant | occupied | overdue) and
-- replace duplicate Arabic `status` with maintenance_id -> maintenance_requests(id).
-- Run in Supabase SQL editor after backend code that reads maintenance_id is deployed.

BEGIN;

-- Remove trigger that forced lease_status to only occupied/vacant (breaks overdue).
DROP TRIGGER IF EXISTS trg_sync_apartment_status_fields ON public.apartments;
DROP FUNCTION IF EXISTS public.sync_apartment_status_fields();

ALTER TABLE public.apartments
  ADD COLUMN IF NOT EXISTS maintenance_id INTEGER;

-- FK to open-ticket table (nullable: no open request => NULL)
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

CREATE INDEX IF NOT EXISTS apartments_maintenance_id_idx
  ON public.apartments(maintenance_id)
  WHERE maintenance_id IS NOT NULL;

-- Drop legacy duplicate of lease display (مؤجرة / فارغة); colors use maintenance_id + lease_status.
ALTER TABLE public.apartments DROP COLUMN IF EXISTS status;

COMMIT;

-- Optional: label contract lifecycle (active / renewed / terminated).
-- Renewal history does NOT require this column — history is already:
--   • multiple rows in public.contracts for the same apartment_id
--   • apartments.current_contract_id = the live lease
--   • payment_installments.contract_id keeps each schedule on its lease
--
-- Run in Supabase SQL Editor only if you want an explicit status label.
-- Safe to re-run.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

COMMENT ON COLUMN public.contracts.status IS
  'Lease lifecycle label: active | renewed | terminated. Active lease is still apartments.current_contract_id.';

-- Backfill: any contract that is the apartment current lease → active.
UPDATE public.contracts c
SET status = 'active'
WHERE c.status IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.apartments a
    WHERE a.current_contract_id = c.id
  );

-- Older leases that are no longer current → renewed/terminated heuristic (ended in the past → terminated).
UPDATE public.contracts c
SET status = CASE
  WHEN c.end_date IS NOT NULL AND c.end_date < CURRENT_DATE THEN 'terminated'
  ELSE 'renewed'
END
WHERE (c.status IS NULL OR c.status = 'active')
  AND NOT EXISTS (
    SELECT 1
    FROM public.apartments a
    WHERE a.current_contract_id = c.id
  );

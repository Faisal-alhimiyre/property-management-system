-- Ensure vacating timestamp is stored on apartment_history rows.
-- Run in Supabase SQL editor if changed_at is null on existing rows.

ALTER TABLE public.apartment_history
  ALTER COLUMN changed_at SET DEFAULT NOW();

-- Backfill missing vacate timestamps from embedded vacatedAt when present.
UPDATE public.apartment_history
SET changed_at = (old_data->>'vacatedAt')::timestamptz
WHERE changed_at IS NULL
  AND old_data ? 'vacatedAt'
  AND NULLIF(old_data->>'vacatedAt', '') IS NOT NULL;

-- Remaining nulls: set to NOW() so the history UI can show a date
-- (approximate for legacy rows that never stored a vacate timestamp).
UPDATE public.apartment_history
SET changed_at = NOW()
WHERE changed_at IS NULL;

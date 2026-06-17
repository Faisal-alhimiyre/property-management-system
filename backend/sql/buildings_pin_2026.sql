-- Pin buildings per owner account (syncs across devices).
-- Run in Supabase SQL editor (safe to run more than once).

BEGIN;

ALTER TABLE public.buildings
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

COMMENT ON COLUMN public.buildings.is_pinned IS 'Owner pinned this building to the top of their home list';
COMMENT ON COLUMN public.buildings.pinned_at IS 'When the building was pinned (NULL if not pinned)';

CREATE INDEX IF NOT EXISTS buildings_owner_pinned_idx
  ON public.buildings(owner_id, is_pinned DESC, pinned_at DESC NULLS LAST);

COMMIT;

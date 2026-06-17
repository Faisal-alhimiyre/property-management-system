-- Optional final cleanup: remove deprecated apartments.rent snapshot column.
-- Run only after all application code paths are migrated to contracts.yearly_rent.

ALTER TABLE public.apartments
  DROP COLUMN IF EXISTS rent;

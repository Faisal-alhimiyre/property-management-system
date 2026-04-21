-- Optional final cleanup: remove deprecated contracts.terms legacy blob.
-- Run only after link-tenant columns are populated/backfilled and validated.
-- Recommended order:
-- 1) contracts_link_tenant_columns_2026.sql
-- 2) contracts_link_tenant_backfill_2026.sql
-- 3) contracts_drop_monthly_rent_2026.sql (optional)
-- 4) contracts_drop_terms_2026.sql

ALTER TABLE public.contracts
  DROP COLUMN IF EXISTS terms;

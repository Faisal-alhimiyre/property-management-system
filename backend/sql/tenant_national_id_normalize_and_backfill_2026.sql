-- Normalize Saudi national / iqama IDs (digits only, last 10) and backfill tenant links.
-- Run once in Supabase SQL editor after deploying the API changes that use the same rules.
-- Safe to re-run: updates only NULL tenant_user_id / tenants.user_id where a single user matches.

BEGIN;

-- Same logic as backend normalize_saudi_national_id(): 10 digits, strip non-digits, take last 10 if longer.
CREATE OR REPLACE FUNCTION public.walajna_normalize_national_id(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(raw, ''), '\D', '', 'g')) >= 10
    THEN right(regexp_replace(COALESCE(raw, ''), '\D', '', 'g'), 10)
    ELSE NULL
  END;
$$;

-- Optional: store national id on tenant profile rows (for audits / future queries)
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS national_id text;

CREATE INDEX IF NOT EXISTS tenants_national_id_idx
  ON public.tenants (national_id)
  WHERE national_id IS NOT NULL;

-- 1) Normalize existing users.national_id
UPDATE public.users u
SET national_id = public.walajna_normalize_national_id(u.national_id)
WHERE u.national_id IS NOT NULL
  AND public.walajna_normalize_national_id(u.national_id) IS NOT NULL
  AND u.national_id IS DISTINCT FROM public.walajna_normalize_national_id(u.national_id);

-- 2) Normalize existing apartments.tenant_national_id
UPDATE public.apartments a
SET tenant_national_id = public.walajna_normalize_national_id(a.tenant_national_id)
WHERE a.tenant_national_id IS NOT NULL
  AND public.walajna_normalize_national_id(a.tenant_national_id) IS NOT NULL
  AND a.tenant_national_id IS DISTINCT FROM public.walajna_normalize_national_id(a.tenant_national_id);

-- 3) Copy normalized id onto tenant rows (same as apartment, for consistency)
UPDATE public.tenants t
SET national_id = public.walajna_normalize_national_id(a.tenant_national_id)
FROM public.apartments a
WHERE a.id = t.apartment_id
  AND a.tenant_national_id IS NOT NULL
  AND public.walajna_normalize_national_id(a.tenant_national_id) IS NOT NULL
  AND (t.national_id IS DISTINCT FROM public.walajna_normalize_national_id(a.tenant_national_id));

-- 4) Backfill apartments.tenant_user_id where national id matches a user and slot is still empty.
--    No role filter: registration often stores role as owner while the same person is the tenant on the unit.
UPDATE public.apartments a
SET tenant_user_id = u.id
FROM public.users u
WHERE a.tenant_user_id IS NULL
  AND a.tenant_national_id IS NOT NULL
  AND u.national_id IS NOT NULL
  AND public.walajna_normalize_national_id(a.tenant_national_id) = public.walajna_normalize_national_id(u.national_id);

-- 5) Backfill tenants.user_id from apartment link
UPDATE public.tenants t
SET user_id = a.tenant_user_id
FROM public.apartments a
WHERE t.apartment_id = a.id
  AND t.user_id IS NULL
  AND a.tenant_user_id IS NOT NULL;

-- 6) Any tenant row still NULL but contract points to tenant_id — sync from apartment if possible
UPDATE public.tenants t
SET user_id = a.tenant_user_id
FROM public.contracts c
JOIN public.apartments a ON a.id = c.apartment_id
WHERE c.tenant_id = t.id
  AND t.user_id IS NULL
  AND a.tenant_user_id IS NOT NULL;

-- 7) Direct link: tenants.national_id -> users.national_id (when apartment row was never synced)
UPDATE public.tenants t
SET user_id = u.id
FROM public.users u
WHERE t.user_id IS NULL
  AND t.national_id IS NOT NULL
  AND u.national_id IS NOT NULL
  AND public.walajna_normalize_national_id(t.national_id) = public.walajna_normalize_national_id(u.national_id);

-- 8) Sync apartment.tenant_user_id from tenant row when still empty
UPDATE public.apartments a
SET tenant_user_id = t.user_id
FROM public.tenants t
WHERE t.apartment_id = a.id
  AND t.user_id IS NOT NULL
  AND a.tenant_user_id IS NULL;

COMMIT;

-- After running: verify with
-- SELECT id, email, national_id, role FROM users WHERE national_id IS NOT NULL LIMIT 20;
-- SELECT id, apartment_id, tenant_national_id, tenant_user_id FROM apartments WHERE tenant_national_id IS NOT NULL LIMIT 20;
-- SELECT id, apartment_id, user_id, national_id FROM tenants LIMIT 20;

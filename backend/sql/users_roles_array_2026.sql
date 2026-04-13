-- Add users.roles (text[]) and users.active_role; backfill from legacy role.
-- Run in Supabase SQL editor once.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS roles text[];

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_role text;

UPDATE public.users
SET roles = ARRAY[role]::text[]
WHERE roles IS NULL
  AND role IS NOT NULL
  AND trim(role) <> '';

UPDATE public.users
SET roles = ARRAY['owner']::text[]
WHERE roles IS NULL;

UPDATE public.users
SET active_role = role
WHERE active_role IS NULL
  AND role IS NOT NULL;

UPDATE public.users
SET active_role = 'owner'
WHERE active_role IS NULL;

COMMIT;

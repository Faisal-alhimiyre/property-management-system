-- Optional: fix Supabase Storage RLS for the `documents` bucket.
-- App uploads use paths like: apartment-{id}/{timestamp}_{filename}.pdf
-- The API also falls back to inline data URLs when Storage upload is blocked.
-- Prefer also setting SUPABASE_SERVICE_ROLE_KEY (legacy JWT) in backend/.env.
--
-- Run in Supabase SQL Editor. Safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "documents_public_read" ON storage.objects;
CREATE POLICY "documents_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_service_insert" ON storage.objects;
CREATE POLICY "documents_service_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_service_update" ON storage.objects;
CREATE POLICY "documents_service_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'documents')
  WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_service_delete" ON storage.objects;
CREATE POLICY "documents_service_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'documents');

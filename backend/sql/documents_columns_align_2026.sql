-- Align public.documents with the API (safe to re-run).
-- Your logs showed inserts retrying without: contract_id, doc_type,
-- generated_automatically, mime_type — meaning those columns are missing.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS contract_id BIGINT REFERENCES public.contracts (id) ON DELETE SET NULL;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS doc_type TEXT;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS generated_automatically BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_documents_apartment_id ON public.documents (apartment_id);
CREATE INDEX IF NOT EXISTS idx_documents_contract_id ON public.documents (contract_id);

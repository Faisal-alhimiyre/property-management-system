-- Documents: inline data URLs or external URLs in `url` (TEXT).
-- If an older `public.documents` used UUID columns, drop it first, then run this:
--   DROP TABLE IF EXISTS public.documents CASCADE;

CREATE TABLE IF NOT EXISTS public.documents (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  apartment_id BIGINT NOT NULL REFERENCES public.apartments (id) ON DELETE CASCADE,
  contract_id BIGINT REFERENCES public.contracts (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  mime_type TEXT,
  doc_type TEXT,
  url TEXT NOT NULL,
  generated_automatically BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_apartment_id ON public.documents (apartment_id);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents (user_id);

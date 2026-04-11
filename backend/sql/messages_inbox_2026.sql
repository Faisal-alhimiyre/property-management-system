-- OPTIONAL / LEGACY: direct user-to-user `messages` table.
--
-- Product decision: communication is **only** through `maintenance_requests` (requests +
-- owner_reply). The Messages **page** reads `/api/maintenance` only — this table is **not**
-- required. You may **drop** `public.messages` in Supabase if you created it and do not need it.
--
-- If you keep the table for experiments, the ALTERs below fix older schemas (e.g. missing `created_at`).

CREATE TABLE IF NOT EXISTS public.messages (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  receiver_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'request',
  subject TEXT,
  body TEXT NOT NULL DEFAULT '',
  building_name TEXT,
  building_number TEXT,
  apartment_number TEXT,
  status TEXT NOT NULL DEFAULT 'unread',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_status_check CHECK (status IN ('read', 'unread'))
);

-- Align pre-existing `messages` tables (any column missing from an older schema):
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id BIGINT REFERENCES public.users (id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS receiver_id BIGINT REFERENCES public.users (id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'request';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS body TEXT DEFAULT '';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS building_name TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS building_number TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS apartment_number TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'unread';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- If an old table used `content` instead of `body`, run once (only if column `content` exists):
-- UPDATE public.messages SET body = COALESCE(body, content::text) WHERE body IS NULL OR body = '';

CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id ON public.messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages (created_at DESC);

COMMENT ON TABLE public.messages IS 'In-app inbox (not maintenance_requests).';

-- Password reset tokens/codes for real API-based forgot-password flow.
-- Run in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id bigserial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash varchar(64) NOT NULL,
  reset_token_hash varchar(64),
  channel varchar(16) NOT NULL DEFAULT 'email',
  destination varchar(255),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp without time zone NOT NULL,
  verified_at timestamp without time zone,
  used_at timestamp without time zone
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
  ON public.password_reset_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_code
  ON public.password_reset_tokens (code_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_reset_token
  ON public.password_reset_tokens (reset_token_hash);

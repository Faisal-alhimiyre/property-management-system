import os
import warnings
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "your_supabase_url_here").strip()

# Prefer service role for server-side (bypasses RLS). Never expose it to the browser.
# Legacy keys are JWTs (eyJ...). New dashboard "secret" keys (sb_secret_...) are not
# accepted by PostgREST via supabase-py yet and cause "Unregistered API key" / login 500s.
_service = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
_anon = (os.getenv("SUPABASE_KEY") or "your_supabase_anon_key_here").strip()

if _service.startswith("eyJ"):
    SUPABASE_KEY = _service
elif _anon.startswith("eyJ"):
    if _service:
        warnings.warn(
            "SUPABASE_SERVICE_ROLE_KEY is not a JWT (eyJ...); using SUPABASE_KEY (anon JWT) instead. "
            "In Supabase → Project Settings → API, copy the legacy service_role secret (JWT).",
            RuntimeWarning,
            stacklevel=1,
        )
    SUPABASE_KEY = _anon
else:
    SUPABASE_KEY = _service or _anon

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

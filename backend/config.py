import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "your_supabase_url_here")
# Server-side API should use the service role key (bypasses RLS). Never expose it to the browser.
_service = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
SUPABASE_KEY = _service or os.getenv("SUPABASE_KEY", "your_supabase_anon_key_here")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
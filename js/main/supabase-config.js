/**
 * Supabase config for Edge Functions (anon key only — never GEMINI_API_KEY).
 * Override order: window.__WALAJNA_* → localStorage walajna_supabase_* → defaults below.
 */
(function (global) {
  const DEFAULT_SUPABASE_URL = "https://sxlgdbvrddlkyvabczxo.supabase.co";
  const DEFAULT_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bGdkYnZyZGRsa3l2YWJjenhvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODc3MzksImV4cCI6MjA5MzQ2MzczOX0.f4z3Yy5U-YZQg16b9qjN41rqHF6da0W9Vtwr6vaxGSE";

  function resolveSupabaseUrl() {
    const explicit = String(global.__WALAJNA_SUPABASE_URL || "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");

    const fromStorage = String(
      localStorage.getItem("walajna_supabase_url") || "",
    ).trim();
    if (fromStorage) return fromStorage.replace(/\/+$/, "");

    return DEFAULT_SUPABASE_URL;
  }

  function resolveSupabaseAnonKey() {
    const explicit = String(global.__WALAJNA_SUPABASE_ANON_KEY || "").trim();
    if (explicit) return explicit;

    const fromStorage = String(
      localStorage.getItem("walajna_supabase_anon_key") || "",
    ).trim();
    if (fromStorage) return fromStorage;

    return DEFAULT_SUPABASE_ANON_KEY;
  }

  function isConfigured() {
    return !!(resolveSupabaseUrl() && resolveSupabaseAnonKey());
  }

  async function invokeWalajnaChatbot(message) {
    const baseUrl = resolveSupabaseUrl();
    const anonKey = resolveSupabaseAnonKey();

    if (!baseUrl || !anonKey) {
      throw new Error("SUPABASE_NOT_CONFIGURED");
    }

    const endpoint = `${baseUrl}/functions/v1/walajna-chatbot`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
      },
      body: JSON.stringify({ message }),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON body */
    }

    if (!res.ok) {
      const err = new Error(data?.error || `HTTP_${res.status}`);
      err.status = res.status;
      throw err;
    }

    const reply = typeof data?.reply === "string" ? data.reply.trim() : "";
    if (!reply) {
      throw new Error("EMPTY_REPLY");
    }

    return reply;
  }

  global.WalajnaSupabase = {
    get url() {
      return resolveSupabaseUrl();
    },
    get anonKey() {
      return resolveSupabaseAnonKey();
    },
    isConfigured,
    invokeWalajnaChatbot,
  };
})(window);

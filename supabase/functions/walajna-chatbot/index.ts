/// <reference path="../deno.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set");
    return jsonResponse({ error: "Chat service is not configured" }, 500);
  }

  let body: { message?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const message = body.message;
  if (typeof message !== "string" || !message.trim()) {
    return jsonResponse({ error: "message is required" }, 400);
  }

  const geminiRes = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: message.trim() }],
        },
      ],
      systemInstruction: {
        parts: [
          {
            text:
              "You are Walajna support assistant for a property management app (buildings, apartments, tenants, payments, maintenance). Be concise and helpful. Reply in the same language the user writes in (Arabic, English, or Urdu).",
          },
        ],
      },
    }),
  });

  if (!geminiRes.ok) {
    const errText = await geminiRes.text();
    console.error("Gemini API error:", geminiRes.status, errText);
    return jsonResponse({ error: "Failed to generate reply" }, 502);
  }

  const data = await geminiRes.json();
  const reply =
    data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? "")
      .join("")
      .trim() || "";

  if (!reply) {
    return jsonResponse({ error: "Empty reply from model" }, 502);
  }

  return jsonResponse({ reply });
});

import { createFileRoute } from "@tanstack/react-router";

// melotts (the first Workers AI model tried here) returned a consistent
// "Internal server error" (code 3043) on every attempt, not request-shape related -
// see commit history. Switched to aura-1 (Deepgram, via Workers AI), which also
// restores real voice selection: melotts only took a language code, so the voice
// picker had been inert since the Pollinations/StreamElements->Workers AI migration.

const MAX_CHARS = 1900;
const TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 2;

const VALID_VOICES = new Set(["alloy", "nova", "onyx", "shimmer", "fable", "echo", "sage"]);

// aura-1 speakers: angus, asteria, arcas, orion, orpheus, athena, luna, zeus,
// perseus, helios, hera, stella
const VOICE_MAP: Record<string, string> = {
  alloy: "angus",
  nova: "asteria",
  onyx: "zeus",
  shimmer: "luna",
  fable: "orpheus",
  echo: "orion",
  sage: "athena",
};

// Not a secret — appears in every dash.cloudflare.com URL. Hardcoded because this
// deployment has repeatedly lost dashboard-set *plaintext* variables across builds.
const FALLBACK_ACCOUNT_ID = "7464a281d8a2386bf981286c184573e0";

function accountId(): string {
  return process.env["CF_ACCOUNT_ID"] || process.env["R2_ACCOUNT_ID"] || FALLBACK_ACCOUNT_ID;
}

async function callAura(text: string, speaker: string): Promise<Response> {
  const token = process.env["CF_AI_TOKEN"];
  if (!token) throw new Error("Missing CF_AI_TOKEN for Workers AI.");

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId()}/ai/run/@cf/deepgram/aura-1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker, encoding: "mp3" }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export const Route = createFileRoute("/api/narrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { text?: string; voice?: string };
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ error: "Missing text." }, { status: 400 });
        const voiceId = VALID_VOICES.has(body.voice ?? "") ? body.voice! : "alloy";
        const speaker = VOICE_MAP[voiceId] ?? "angus";

        let lastError = { status: 502, detail: "Narration failed." };

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const upstream = await callAura(text.slice(0, MAX_CHARS), speaker);
            const contentType = upstream.headers.get("content-type") ?? "";

            // Case 1: raw audio bytes straight through (the shape aura-1's own
            // binding example implies via returnRawResponse).
            if (upstream.ok && contentType.startsWith("audio/")) {
              return new Response(upstream.body, {
                headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
              });
            }

            const raw = await upstream.text();

            // Case 2: JSON-wrapped, base64-encoded — the shape flux-1-schnell uses.
            if (upstream.ok) {
              try {
                const payload = JSON.parse(raw) as {
                  result?: { audio?: string } | string;
                  success?: boolean;
                };
                const audioB64 = typeof payload.result === "string" ? payload.result : payload.result?.audio;
                if (payload.success !== false && audioB64) {
                  return new Response(base64ToArrayBuffer(audioB64), {
                    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
                  });
                }
              } catch {
                // Not JSON either - fall through to the error path below.
              }
            }

            lastError = { status: upstream.status, detail: raw.slice(0, 300) };
          } catch (err) {
            lastError = {
              status: 504,
              detail: err instanceof Error ? err.message : "Narration request timed out.",
            };
          }
        }

        return Response.json({ error: "Narration failed", detail: lastError.detail }, { status: 502 });
      },
    },
  },
});

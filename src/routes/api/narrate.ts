import { createFileRoute } from "@tanstack/react-router";

const VALID_VOICES = new Set(["alloy", "nova", "onyx", "shimmer", "fable", "echo", "sage"]);

// StreamElements' free TTS proxy (Amazon Polly voices, no API key required).
const VOICE_MAP: Record<string, string> = {
  alloy: "Matthew",
  nova: "Joanna",
  onyx: "Russell",
  shimmer: "Emma",
  fable: "Amy",
  echo: "Brian",
  sage: "Kimberly",
};

const MAX_CHARS = 550;
const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 2;

async function fetchNarration(voice: string, text: string): Promise<Response> {
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/narrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { text?: string; voice?: string };
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ error: "Missing text." }, { status: 400 });
        const voiceId = VALID_VOICES.has(body.voice ?? "") ? body.voice! : "alloy";
        const voice = VOICE_MAP[voiceId] ?? "Matthew";
        const clipped = text.slice(0, MAX_CHARS);

        let lastError: { status: number; detail: string } | null = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const upstream = await fetchNarration(voice, clipped);

            if (!upstream.ok || !upstream.body) {
              lastError = {
                status: upstream.status,
                detail: (await upstream.text().catch(() => "")).slice(0, 300),
              };
              continue;
            }

            return new Response(upstream.body, {
              headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
            });
          } catch (err) {
            lastError = {
              status: 504,
              detail: err instanceof Error ? err.message : "Narration request timed out.",
            };
          }
        }

        return Response.json(
          { error: `Narration failed (${lastError?.status ?? 502})`, detail: lastError?.detail ?? "" },
          { status: 502 },
        );
      },
    },
  },
});

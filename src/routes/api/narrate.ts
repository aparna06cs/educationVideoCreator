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

export const Route = createFileRoute("/api/narrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { text?: string; voice?: string };
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ error: "Missing text." }, { status: 400 });
        const voiceId = VALID_VOICES.has(body.voice ?? "") ? body.voice! : "alloy";
        const voice = VOICE_MAP[voiceId] ?? "Matthew";

        const url = `https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text.slice(0, MAX_CHARS))}`;

        const upstream = await fetch(url);

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return Response.json(
            { error: `Narration failed (${upstream.status})`, detail: detail.slice(0, 300) },
            { status: 502 },
          );
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
        });
      },
    },
  },
});

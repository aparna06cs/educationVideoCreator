import { createFileRoute } from "@tanstack/react-router";
import { runWorkersAi, base64ToBytes } from "@/lib/workers-ai";

const MAX_CHARS = 800;

export const Route = createFileRoute("/api/narrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { text?: string; voice?: string };
        const text = (body.text ?? "").trim();
        if (!text) return Response.json({ error: "Missing text." }, { status: 400 });

        // NOTE: melotts exposes only a `lang` parameter — it has no voice selection.
        // The `voice` field is still accepted so the client contract is unchanged,
        // but it currently has no effect on the output.
        try {
          const result = await runWorkersAi<{ audio?: string }>("@cf/myshell-ai/melotts", {
            prompt: text.slice(0, MAX_CHARS),
            lang: "en",
          });

          if (!result.audio) return Response.json({ error: "No audio returned." }, { status: 502 });

          const bytes = base64ToBytes(result.audio);
          const audioBuffer = bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ) as ArrayBuffer;
          return new Response(audioBuffer, {
            headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
          });
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Narration failed.";
          return Response.json({ error: "Narration failed", detail: detail.slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});

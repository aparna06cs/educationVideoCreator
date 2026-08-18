import { createFileRoute } from "@tanstack/react-router";
import { runWorkersAi } from "@/lib/workers-ai";

// flux-1-schnell caps prompt length at 2048 characters.
const MAX_PROMPT_CHARS = 2000;

export const Route = createFileRoute("/api/illustrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: string; style?: string };
        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return Response.json({ error: "Missing prompt." }, { status: 400 });

        const style = (body.style ?? "clean editorial illustration, warm paper palette, soft light").trim();
        const fullPrompt =
          `Educational illustration for a video lesson. Style: ${style}. Subject: ${prompt}. ` +
          `Wide 16:9 composition, no text, no words, no letters, no numbers, no watermarks, no borders.`;

        try {
          const result = await runWorkersAi<{ image?: string }>("@cf/black-forest-labs/flux-1-schnell", {
            prompt: fullPrompt.slice(0, MAX_PROMPT_CHARS),
            seed: Math.floor(Math.random() * 1_000_000),
          });

          if (!result.image) return Response.json({ error: "No image returned." }, { status: 502 });

          // flux-1-schnell returns base64 JPEG, usable directly as a data URI.
          return Response.json({ image: `data:image/jpeg;base64,${result.image}` });
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Illustration failed.";
          return Response.json({ error: "Illustration failed", detail: detail.slice(0, 300) }, { status: 502 });
        }
      },
    },
  },
});

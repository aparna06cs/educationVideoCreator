import { createFileRoute } from "@tanstack/react-router";

const TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 2;

async function fetchIllustration(fullPrompt: string): Promise<Response> {
  const seed = Math.floor(Math.random() * 1_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1024&height=576&seed=${seed}&nologo=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export const Route = createFileRoute("/api/illustrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: string; style?: string };
        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return Response.json({ error: "Missing prompt." }, { status: 400 });

        const style = (body.style ?? "clean editorial illustration, warm paper palette, soft light").trim();
        const fullPrompt = `Educational illustration for a video lesson. Style: ${style}. Subject: ${prompt}. Wide 16:9 composition, no text, no words, no letters, no numbers, no watermarks, no borders.`;

        let lastError: { status: number; detail: string } | null = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const upstream = await fetchIllustration(fullPrompt);

            if (!upstream.ok) {
              lastError = {
                status: upstream.status,
                detail: (await upstream.text().catch(() => "")).slice(0, 300),
              };
              continue;
            }

            const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
            const bytes = new Uint8Array(await upstream.arrayBuffer());
            if (bytes.byteLength === 0) {
              lastError = { status: 502, detail: "Empty image response." };
              continue;
            }

            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
            const image = `data:${contentType};base64,${btoa(binary)}`;
            return Response.json({ image });
          } catch (err) {
            lastError = {
              status: 504,
              detail: err instanceof Error ? err.message : "Illustration request timed out.",
            };
          }
        }

        return Response.json(
          { error: `Illustration failed (${lastError?.status ?? 502})`, detail: lastError?.detail ?? "" },
          { status: 502 },
        );
      },
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/illustrate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as { prompt?: string; style?: string };
        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return Response.json({ error: "Missing prompt." }, { status: 400 });

        const style = (body.style ?? "clean editorial illustration, warm paper palette, soft light").trim();
        const fullPrompt = `Educational illustration for a video lesson. Style: ${style}. Subject: ${prompt}. Wide 16:9 composition, no text, no words, no letters, no numbers, no watermarks, no borders.`;

        const seed = Math.floor(Math.random() * 1_000_000);
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=1024&height=576&seed=${seed}&nologo=true`;

        const upstream = await fetch(url);

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          return Response.json(
            { error: `Illustration failed (${upstream.status})`, detail: detail.slice(0, 300) },
            { status: 502 },
          );
        }

        const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
        const bytes = new Uint8Array(await upstream.arrayBuffer());
        if (bytes.byteLength === 0) return Response.json({ error: "No image returned." }, { status: 502 });

        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        const image = `data:${contentType};base64,${btoa(binary)}`;
        return Response.json({ image });
      },
    },
  },
});

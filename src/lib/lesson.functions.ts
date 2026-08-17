import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  sourceKind: z.enum(["file", "text", "topic"]),
  sourceLabel: z.string(),
  content: z.string().min(1),
  length: z.enum(["short", "standard", "deep"]),
  audience: z.enum(["school", "college", "professional"]),
});

const sceneCounts: Record<string, number> = { short: 5, standard: 8, deep: 12 };

const audienceNotes: Record<string, string> = {
  school:
    "Learners aged 12-16. Use plain language, concrete everyday analogies, and avoid jargon unless you define it in the same sentence.",
  college:
    "Undergraduate students. Use precise terminology, keep definitions tight, and connect ideas causally.",
  professional:
    "Working professionals with background knowledge. Be dense and specific, skip basics, emphasise implications and edge cases.",
};

const lessonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    artDirection: { type: "string" },
    takeaways: { type: "array", items: { type: "string" } },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          narration: { type: "string" },
          caption: { type: "string" },
          illustration: { type: "string" },
        },
        required: ["title", "narration", "caption", "illustration"],
      },
    },
  },
  required: ["title", "subtitle", "artDirection", "takeaways", "scenes"],
};

type GatewayScene = {
  title?: string;
  narration?: string;
  caption?: string;
  illustration?: string;
};

type GatewayLesson = {
  title?: string;
  subtitle?: string;
  artDirection?: string;
  takeaways?: unknown;
  scenes?: GatewayScene[];
};

// Groq's free plan caps openai/gpt-oss-120b at 8,000 tokens/minute — input + output
// combined, shared across every call to this model in the account. scriptLesson,
// classifyContent and segmentTopics all run within the same build, often the same
// minute, so each one's budget (content slice + maxTokens) must be sized so the sum
// of any two back-to-back calls stays comfortably under 8K, not just each in isolation.
async function groqComplete(apiKey: string, prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [
        {
          role: "system",
          content:
            "You are a lesson director. Always respond with a single valid JSON object and nothing else — no markdown fences, no commentary.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("The AI service is busy right now. Please try again in a moment.");
    throw new Error(`Lesson scripting failed (${res.status}). ${detail.slice(0, 300)}`);
  }

  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return payload.choices?.[0]?.message?.content ?? "";
}

export const scriptLesson = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const sceneCount = sceneCounts[data.length] ?? 8;
    const sourceBlock =
      data.sourceKind === "topic"
        ? `The educator gave only a topic: "${data.content}". Build the lesson from well-established knowledge about it.`
        : `Source material (from "${data.sourceLabel}"):\n"""\n${data.content.slice(0, 5000)}\n"""`;

    const prompt = `You are a lesson director turning study material into a narrated video lesson.

${sourceBlock}

Audience: ${audienceNotes[data.audience]}

Produce exactly ${sceneCount} scenes that teach the material in a clear arc: hook, core ideas in logical order, then a closing recap.

Rules for each scene:
- narration: 30 to 55 words of spoken script. Natural spoken English, no bullet points, no stage directions, no markdown, no scene numbers.
- caption: at most 8 words, the on-screen headline for that scene.
- title: at most 5 words, used in the scene list.
- illustration: a vivid visual description of a single educational illustration for the scene. Describe subject, composition and mood only. Never ask for text, words, labels, letters or numbers in the image.

Also produce:
- title: the lesson title, at most 8 words.
- subtitle: one sentence describing what the learner will understand.
- artDirection: one sentence describing a single consistent illustration style for the whole lesson (medium, palette, lighting) so every scene looks like the same series.
- takeaways: 3 to 5 short key takeaways, each at most 15 words.

Stay strictly faithful to the source material. Do not invent facts that contradict it.

Respond with a single JSON object matching exactly this schema (no extra keys, no markdown fences):
${JSON.stringify(lessonSchema)}`;

    const raw = await groqComplete(apiKey, prompt, 2600);

    let parsed: GatewayLesson;
    try {
      parsed = JSON.parse(raw) as GatewayLesson;
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("The AI returned an unreadable lesson script. Please try again.");
      parsed = JSON.parse(match[0]) as GatewayLesson;
    }

    const scenes = (parsed.scenes ?? [])
      .filter((scene) => typeof scene?.narration === "string" && scene.narration.trim().length > 0)
      .slice(0, sceneCount)
      .map((scene, index) => ({
        title: (scene.title ?? `Scene ${index + 1}`).trim().slice(0, 60),
        narration: scene.narration!.trim(),
        caption: (scene.caption ?? scene.title ?? "").trim().slice(0, 90),
        illustration: (scene.illustration ?? scene.title ?? "educational illustration").trim(),
      }));

    if (scenes.length === 0) throw new Error("The AI couldn't build a lesson from that source. Try richer material.");

    const takeaways = Array.isArray(parsed.takeaways)
      ? parsed.takeaways.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [];

    return {
      title: (parsed.title ?? "Your lesson").trim(),
      subtitle: (parsed.subtitle ?? "").trim(),
      artDirection: (parsed.artDirection ?? "clean editorial illustration, warm paper palette, soft light").trim(),
      takeaways,
      scenes,
    };
  });

const ClassifyInputSchema = z.object({
  sourceKind: z.enum(["file", "text", "topic"]),
  content: z.string().min(1),
});

export const classifyContent = createServerFn({ method: "POST" })
  .validator((input: unknown) => ClassifyInputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) return { isEducational: true, reason: "" };

    const sample = data.sourceKind === "topic" ? `Topic given: "${data.content}"` : `Material:\n"""\n${data.content.slice(0, 1200)}\n"""`;

    const prompt = `Decide whether the following is educational / study material suitable for a learning video lesson — for example textbook excerpts, lecture notes, course material, explanatory or reference articles, or a well-defined academic/technical/professional topic.

Reject only if the material is clearly NOT educational: pure marketing or advertising copy, fiction or entertainment with no instructional intent, personal correspondence, legal or financial documents with no teaching purpose, spam, or a request for harmful/inappropriate content. When in doubt, treat it as educational — this check exists to filter obvious misuse, not to gatekeep legitimate study material.

${sample}

Respond with a single JSON object: { "isEducational": boolean, "reason": string }
"reason" is only needed when isEducational is false — one short sentence, at most 20 words, explaining why. Leave it empty otherwise.`;

    try {
      const raw = await groqComplete(apiKey, prompt, 80);
      const parsed = JSON.parse(raw) as { isEducational?: boolean; reason?: string };
      return {
        isEducational: parsed.isEducational !== false,
        reason: (parsed.reason ?? "").trim() || "This doesn't look like educational material. Try a different source.",
      };
    } catch {
      // Fail open: an AI hiccup on the gate shouldn't block a legitimate lesson build.
      return { isEducational: true, reason: "" };
    }
  });

const SegmentInputSchema = z.object({
  content: z.string().min(1),
  label: z.string(),
});

export const segmentTopics = createServerFn({ method: "POST" })
  .validator((input: unknown) => SegmentInputSchema.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const prompt = `You are splitting a long document into distinct topic sections, each substantial enough to become its own short video lesson on its own.

Document (from "${data.label}"):
"""
${data.content.slice(0, 6000)}
"""

Split it into 2 to 6 topic sections based on natural subject-matter boundaries in the material — do not force an arbitrary number, and do not split a document that is really one continuous topic. Each section must:
- Cover one coherent topic or theme from the document
- Include enough of the original material (quoted or closely paraphrased, not just a one-line summary) to write a full lesson script from
- Appear in the same order as the source document

Also produce an overall series title summarising the whole document, at most 8 words.

Respond with a single JSON object:
{ "seriesTitle": string, "topics": [ { "title": string, "content": string } ] }
"title" is at most 6 words per topic.`;

    const raw = await groqComplete(apiKey, prompt, 3000);

    let parsed: { seriesTitle?: string; topics?: { title?: string; content?: string }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Could not split this document into topics. Try again, or a different document.");
      parsed = JSON.parse(match[0]);
    }

    const topics = (parsed.topics ?? [])
      .filter((topic): topic is { title: string; content: string } => typeof topic?.content === "string" && topic.content.trim().length > 40)
      .slice(0, 8)
      .map((topic, index) => ({
        title: (topic.title ?? `Part ${index + 1}`).trim().slice(0, 60),
        content: topic.content.trim(),
      }));

    return {
      seriesTitle: (parsed.seriesTitle ?? data.label).trim().slice(0, 80),
      topics,
    };
  });

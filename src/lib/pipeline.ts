import { lessonStore } from "./lesson-store";
import { classifyContent, scriptLesson, segmentTopics } from "./lesson.functions";
import { SPLIT_PAGE_THRESHOLD } from "./extract-text";
import type { Lesson, LessonOptions, LessonSource, Scene, SeriesInfo } from "./lesson-types";

async function mapWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]!);
    }
  });
  await Promise.all(runners);
}

async function audioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    const done = (value: number) => resolve(Number.isFinite(value) && value > 0 ? value : 6);
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(6);
    audio.src = url;
  });
}

async function buildOneLesson(source: LessonSource, options: LessonOptions, series: SeriesInfo | null): Promise<Lesson> {
  const partLabel = series ? `part ${series.partIndex + 1} of ${series.totalParts}` : null;

  lessonStore.set({
    stage: "scripting",
    message: partLabel
      ? `Writing ${partLabel}: ${series!.partTitle}…`
      : "Reading the material and writing the lesson script…",
    imagesDone: 0,
    audioDone: 0,
  });

  const script = await scriptLesson({
    data: {
      sourceKind: source.kind,
      sourceLabel: source.label,
      content: source.content,
      length: options.length,
      audience: options.audience,
    },
  });

  const scenes: Scene[] = script.scenes.map((scene, index) => ({
    ...scene,
    id: `scene-${index + 1}`,
    artDirection: script.artDirection,
    imageUrl: null,
    imageStatus: "pending",
    audioUrl: null,
    audioStatus: "pending",
    duration: 6,
  }));

  const lesson: Lesson = {
    title: script.title,
    subtitle: script.subtitle,
    takeaways: script.takeaways,
    scenes,
    options,
    source,
    series,
  };

  lessonStore.set({
    lesson,
    stage: "producing",
    message: partLabel ? `Illustrating and narrating ${partLabel}…` : "Illustrating scenes and recording narration…",
  });

  // Pollinations is free and unauthenticated — bursts of concurrent requests from
  // Cloudflare's shared egress IPs appear to get rate-limited even though a single
  // isolated request succeeds reliably. Serialize illustration calls to avoid that.
  const illustrate = mapWithConcurrency(scenes, 1, async (scene) => {
    try {
      const res = await fetch("/api/illustrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: scene.illustration, style: script.artDirection }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { image?: string };
      if (!data.image) throw new Error("no image");
      lessonStore.updateScene(scene.id, { imageUrl: data.image, imageStatus: "ready" });
    } catch {
      lessonStore.updateScene(scene.id, { imageStatus: "failed" });
    } finally {
      lessonStore.set({ imagesDone: lessonStore.get().imagesDone + 1 });
    }
  });

  // Same rate-limiting risk as illustration above — StreamElements is also free
  // and unauthenticated. Serialize these too.
  const narrate = mapWithConcurrency(scenes, 1, async (scene) => {
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: scene.narration, voice: options.voice }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const duration = await audioDuration(url);
      lessonStore.updateScene(scene.id, { audioUrl: url, audioStatus: "ready", duration });
    } catch {
      lessonStore.updateScene(scene.id, {
        audioStatus: "failed",
        duration: Math.max(5, Math.round(scene.narration.split(/\s+/).length / 2.6)),
      });
    } finally {
      lessonStore.set({ audioDone: lessonStore.get().audioDone + 1 });
    }
  });

  await Promise.all([illustrate, narrate]);

  return lesson;
}

export async function buildLesson(source: LessonSource, options: LessonOptions) {
  lessonStore.reset();
  lessonStore.set({ stage: "scripting", message: "Checking your material…" });

  try {
    const classification = await classifyContent({ data: { sourceKind: source.kind, content: source.content } });
    if (!classification.isEducational) {
      lessonStore.set({ stage: "error", error: classification.reason });
      return;
    }

    const shouldSplit = source.kind === "file" && (source.pageCount ?? 0) > SPLIT_PAGE_THRESHOLD;

    if (!shouldSplit) {
      lessonStore.set({ totalParts: 1 });
      const lesson = await buildOneLesson(source, options, null);
      lessonStore.set({ lesson, lessons: [lesson], stage: "ready", message: "Your lesson is ready." });
      return;
    }

    lessonStore.set({ message: "Splitting your material into topics…" });
    const { topics, seriesTitle } = await segmentTopics({ data: { content: source.content, label: source.label } });

    if (topics.length < 2) {
      // The document didn't actually split into distinct topics — fall back to a single lesson.
      lessonStore.set({ totalParts: 1 });
      const lesson = await buildOneLesson(source, options, null);
      lessonStore.set({ lesson, lessons: [lesson], stage: "ready", message: "Your lesson is ready." });
      return;
    }

    const seriesId = crypto.randomUUID();
    lessonStore.set({ totalParts: topics.length, seriesTitle });

    const lessons: Lesson[] = [];
    for (let i = 0; i < topics.length; i++) {
      const topic = topics[i]!;
      const series: SeriesInfo = {
        seriesId,
        partIndex: i,
        totalParts: topics.length,
        partTitle: topic.title,
        seriesTitle,
      };
      const topicSource: LessonSource = { ...source, label: topic.title, content: topic.content };
      const lesson = await buildOneLesson(topicSource, options, series);
      lessons.push(lesson);
      lessonStore.set({ lessons: [...lessons] });
    }

    lessonStore.set({ stage: "ready", message: "Your lessons are ready." });
  } catch (error) {
    lessonStore.set({
      stage: "error",
      error: error instanceof Error ? error.message : "Something went wrong while building the lesson.",
    });
  }
}

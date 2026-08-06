import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useBuildState } from "@/lib/lesson-store";
import { WatchPlayer } from "@/components/watch-player";
import { saveLesson } from "@/lib/lessons.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watch")({
  head: () => ({
    meta: [
      { title: "Your video lesson — LessonReel" },
      {
        name: "description",
        content: "Play your generated lesson: illustrated scenes, voice narration, captions and score.",
      },
      { property: "og:title", content: "Your video lesson — LessonReel" },
      { property: "og:description", content: "An AI-assembled narrated lesson built from your material." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WatchPage,
});

async function blobUrlToBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function WatchPage() {
  const state = useBuildState();
  const navigate = useNavigate();
  const saveFn = useServerFn(saveLesson);
  const [partIndex, setPartIndex] = useState(0);

  const lessons = state.lessons.length ? state.lessons : state.lesson ? [state.lesson] : [];
  const activeLesson = lessons[partIndex] ?? lessons[0] ?? null;

  useEffect(() => {
    if (state.stage === "idle" || lessons.length === 0) navigate({ to: "/" });
  }, [state.stage, lessons.length, navigate]);

  async function handleSave() {
    if (!activeLesson) return;
    const lesson = { ...activeLesson };
    const scenes = await Promise.all(
      lesson.scenes.map(async (scene) => ({
        ...scene,
        audioUrl: scene.audioUrl ? await blobUrlToBase64(scene.audioUrl) : null,
      })),
    );
    return saveFn({ data: { lesson: { ...lesson, scenes } } });
  }

  if (!activeLesson) return null;

  return (
    <>
      {lessons.length > 1 && (
        <div className="border-b border-border bg-card/60">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 py-3 sm:px-6">
            {lessons.map((partLesson, i) => (
              <button
                key={i}
                onClick={() => setPartIndex(i)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  i === partIndex
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/50",
                )}
              >
                Part {i + 1}: {partLesson.series?.partTitle ?? partLesson.title}
              </button>
            ))}
          </div>
        </div>
      )}
      <WatchPlayer key={partIndex} lesson={activeLesson} showSave={true} onSave={handleSave} />
    </>
  );
}

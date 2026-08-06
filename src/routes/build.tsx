import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AlertCircle, Check, ImageIcon, Loader2, Mic, PenLine } from "lucide-react";
import { useBuildState } from "@/lib/lesson-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/build")({
  head: () => ({
    meta: [
      { title: "Building your lesson — LessonReel" },
      {
        name: "description",
        content:
          "Watch LessonReel script your material, illustrate each scene and record narration in real time.",
      },
      { property: "og:title", content: "Building your lesson — LessonReel" },
      {
        property: "og:description",
        content: "Scripting, illustration and narration progress for your video lesson.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BuildPage,
});

function BuildPage() {
  const state = useBuildState();
  const navigate = useNavigate();
  const scenes = state.lesson?.scenes ?? [];
  const total = scenes.length;

  useEffect(() => {
    if (state.stage === "idle") navigate({ to: "/" });
    if (state.stage === "ready") {
      const timeout = setTimeout(() => navigate({ to: "/watch" }), 700);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [state.stage, navigate]);

  const steps = [
    {
      icon: PenLine,
      label: "Writing the lesson script",
      done: state.stage === "producing" || state.stage === "ready",
      active: state.stage === "scripting",
      detail: total ? `${total} scenes planned` : "Reading your material",
    },
    {
      icon: ImageIcon,
      label: "Illustrating scenes",
      done: total > 0 && state.imagesDone >= total,
      active: state.stage === "producing" && state.imagesDone < total,
      detail: total ? `${Math.min(state.imagesDone, total)} of ${total}` : "Waiting",
    },
    {
      icon: Mic,
      label: "Recording narration",
      done: total > 0 && state.audioDone >= total,
      active: state.stage === "producing" && state.audioDone < total,
      detail: total ? `${Math.min(state.audioDone, total)} of ${total}` : "Waiting",
    },
  ];

  const progress = total ? Math.round(((state.imagesDone + state.audioDone) / (total * 2)) * 100) : 4;

  return (
    <main className="paper-grain min-h-screen">
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        {state.totalParts > 1 && (
          <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">
            {state.seriesTitle ?? "Series"} — Part {state.lessons.length + (state.stage === "ready" ? 0 : 1)} of{" "}
            {state.totalParts}
          </p>
        )}
        <h1 className="font-display text-4xl sm:text-5xl">
          {state.lesson?.title ?? "Building your lesson"}
        </h1>
        <p className="mt-3 text-muted-foreground">{state.error ?? state.message}</p>

        {state.stage === "error" ? (
          <div className="mt-8 rounded-2xl border border-destructive/30 bg-destructive/10 p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">We couldn't finish this lesson</p>
                <p className="mt-1 text-sm text-foreground/80">{state.error}</p>
                <button
                  onClick={() => navigate({ to: "/" })}
                  className="mt-4 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  Start over
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(progress, 4)}%` }}
              />
            </div>

            <ol className="mt-8 grid gap-3">
              {steps.map((step) => (
                <li
                  key={step.label}
                  className={cn(
                    "flex items-center gap-4 rounded-xl border px-5 py-4",
                    step.active ? "border-primary/60 bg-accent/40" : "border-border bg-card/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full",
                      step.done
                        ? "bg-primary text-primary-foreground"
                        : step.active
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {step.done ? (
                      <Check className="size-4" />
                    ) : step.active ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <step.icon className="size-4" />
                    )}
                  </span>
                  <span className="flex-1 font-medium">{step.label}</span>
                  <span className="text-sm text-muted-foreground">{step.detail}</span>
                </li>
              ))}
            </ol>

            {scenes.length > 0 && (
              <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {scenes.map((scene, index) => (
                  <figure key={scene.id} className="animate-rise overflow-hidden rounded-xl border border-border bg-card">
                    <div className="relative aspect-video bg-secondary">
                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={`Illustration for ${scene.title}`}
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          {scene.imageStatus === "failed" ? (
                            <ImageIcon className="size-5 text-muted-foreground" />
                          ) : (
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>
                    <figcaption className="px-3 py-2.5">
                      <p className="text-xs text-muted-foreground">Scene {index + 1}</p>
                      <p className="truncate text-sm font-medium">{scene.title}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

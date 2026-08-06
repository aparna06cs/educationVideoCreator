import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions } from "@tanstack/react-query";
import { getSharedLesson } from "@/lib/lessons.functions";
import { WatchPlayer } from "@/components/watch-player";
import { NotFound } from "@/components/not-found";
import { cn } from "@/lib/utils";
import type { SeriesPart } from "@/lib/lesson-types";

export const Route = createFileRoute("/s/$shareId")({
  head: () => ({
    meta: [
      { title: "Shared lesson — LessonReel" },
      { name: "description", content: "A narrated video lesson created with LessonReel." },
      { property: "og:title", content: "Shared lesson — LessonReel" },
      { property: "og:description", content: "A narrated video lesson created with LessonReel." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      queryOptions({
        queryKey: ["shared-lesson", params.shareId],
        queryFn: () => getSharedLesson({ data: { shareId: params.shareId } }),
      }),
    ),
  component: SharePage,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFound,
});

function ErrorComponent({ error }: { error: Error }) {
  return (
    <main className="paper-grain flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="font-display text-2xl">Could not load this lesson</h1>
        <p className="mt-2 text-muted-foreground">{error.message}</p>
      </div>
    </main>
  );
}

function SharePage() {
  const data = Route.useLoaderData();

  return (
    <>
      {data.seriesParts.length > 1 && (
        <div className="border-b border-border bg-card/60">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-2 px-4 py-3 sm:px-6">
            {data.seriesParts.map((part: SeriesPart) => (
              <Link
                key={part.id}
                to="/s/$shareId"
                params={{ shareId: part.shareId }}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  part.shareId === data.publicShareId
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/50",
                )}
              >
                Part {part.partIndex + 1}: {part.partTitle}
              </Link>
            ))}
          </div>
        </div>
      )}
      <WatchPlayer lesson={data} showSave={false} />
    </>
  );
}

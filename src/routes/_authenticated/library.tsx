import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Loader2, Trash2, Layers } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { listMyLessons, deleteLesson } from "@/lib/lessons.functions";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Your library — LessonReel" },
      { name: "description", content: "View and manage your saved video lessons on LessonReel." },
      { property: "og:title", content: "Your library — LessonReel" },
      { property: "og:description", content: "View and manage your saved video lessons on LessonReel." },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LibraryPage,
});

const lessonsQueryOptions = {
  queryKey: ["my-lessons"],
  queryFn: () => listMyLessons(),
};

type LibraryLesson = Awaited<ReturnType<typeof listMyLessons>>[number];
type LibraryCard = { key: string; primary: LibraryLesson; parts: LibraryLesson[] };

function groupIntoCards(lessons: LibraryLesson[]): LibraryCard[] {
  const bySeries = new Map<string, LibraryLesson[]>();
  for (const lesson of lessons) {
    if (!lesson.seriesId) continue;
    const group = bySeries.get(lesson.seriesId) ?? [];
    group.push(lesson);
    bySeries.set(lesson.seriesId, group);
  }
  for (const group of bySeries.values()) group.sort((a, b) => (a.partIndex ?? 0) - (b.partIndex ?? 0));

  const seen = new Set<string>();
  const cards: LibraryCard[] = [];
  for (const lesson of lessons) {
    if (lesson.seriesId) {
      if (seen.has(lesson.seriesId)) continue;
      seen.add(lesson.seriesId);
      const parts = bySeries.get(lesson.seriesId)!;
      cards.push({ key: lesson.seriesId, primary: parts[0]!, parts });
    } else {
      cards.push({ key: lesson.id, primary: lesson, parts: [lesson] });
    }
  }
  return cards;
}

function LibraryPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const { data: lessons = [], isLoading } = useQuery(lessonsQueryOptions);
  const [deleting, setDeleting] = useState<string | null>(null);
  const deleteFn = useServerFn(deleteLesson);

  const cards = groupIntoCards(lessons);

  async function remove(card: LibraryCard) {
    const confirmMessage =
      card.parts.length > 1
        ? `Delete all ${card.parts.length} parts of this series? This cannot be undone.`
        : "Delete this lesson? This cannot be undone.";
    if (!confirm(confirmMessage)) return;
    setDeleting(card.key);
    try {
      await Promise.all(card.parts.map((part) => deleteFn({ data: { lessonId: part.id } })));
      await queryClient.invalidateQueries({ queryKey: ["my-lessons"] });
    } finally {
      setDeleting(null);
    }
  }

  return (
    <main className="paper-grain min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg">
            <Film className="size-5 text-primary" />
            LessonReel
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <button
              onClick={() => signOut()}
              className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-3xl">Your library</h1>
            <p className="mt-1 text-muted-foreground">Lessons you have saved and shared.</p>
          </div>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            New lesson
          </Link>
        </div>

        {isLoading ? (
          <div className="mt-10 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading your lessons…
          </div>
        ) : cards.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">No saved lessons yet.</p>
            <Link to="/" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
              Create your first lesson
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const isSeries = card.parts.length > 1;
              const title = isSeries ? card.primary.seriesTitle || card.primary.title : card.primary.title;
              return (
                <div
                  key={card.key}
                  className="group relative rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-sm"
                >
                  <Link to={`/s/${card.primary.publicShareId}`} className="block">
                    <div className="flex items-center gap-2">
                      {isSeries && <Layers className="size-4 text-primary" />}
                      <h2 className="font-display text-xl">{title}</h2>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{card.primary.subtitle}</p>
                    <p className="mt-3 text-xs text-muted-foreground">
                      {new Date(card.primary.createdAt).toLocaleDateString()}
                      {isSeries ? ` · ${card.parts.length} parts` : ""}
                      {card.primary.isPublic ? " · Public link" : " · Private"}
                    </p>
                  </Link>
                  <div className="mt-4 flex items-center gap-2">
                    <Link
                      to={`/s/${card.primary.publicShareId}`}
                      className="flex-1 rounded-full bg-secondary px-3 py-1.5 text-center text-sm font-medium transition-colors hover:bg-secondary/80"
                    >
                      Open
                    </Link>
                    <button
                      onClick={() => remove(card)}
                      disabled={deleting === card.key}
                      className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      {deleting === card.key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

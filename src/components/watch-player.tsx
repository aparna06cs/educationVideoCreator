import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  ScrollText,
  Bookmark,
  Loader2,
  Check,
  Share2,
  Film,
  Download,
  FileText,
} from "lucide-react";
import type { Lesson, SavedLesson, Scene } from "@/lib/lesson-types";
import { MusicEngine } from "@/lib/music";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { exportLessonVideo, type ExportProgress } from "@/lib/video-export";
import { saveLessonVideo } from "@/lib/lessons.functions";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function normalizeLesson(lesson: Lesson | SavedLesson): Lesson {
  if ("ownerId" in lesson) {
    return {
      title: lesson.title,
      subtitle: lesson.subtitle,
      takeaways: lesson.takeaways,
      scenes: lesson.scenes.map((s) => ({
        id: s.id,
        title: s.title,
        narration: s.narration,
        caption: s.caption,
        illustration: s.illustration,
        artDirection: s.artDirection ?? "",
        imageUrl: s.imageUrl,
        imageStatus: s.imageStatus,
        audioUrl: s.audioUrl,
        audioStatus: s.audioStatus,
        duration: s.duration,
      })),
      options: lesson.options,
      source: lesson.source,
    };
  }
  return lesson;
}

export function WatchPlayer({
  lesson,
  showSave,
  onSave,
}: {
  lesson: Lesson | SavedLesson;
  showSave: boolean;
  onSave?: () => Promise<{ id: string } | void>;
}) {
  const normalized = normalizeLesson(lesson);
  const savedSource = "ownerId" in lesson ? lesson : null;
  const navigate = useNavigate();
  const { user } = useAuth();
  const saveVideoFn = useServerFn(saveLessonVideo);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copyOk, setCopyOk] = useState(false);

  const [savedLessonId, setSavedLessonId] = useState<string | null>(savedSource?.id ?? null);
  const [savedVideoUrl] = useState<string | null>(savedSource?.videoUrl ?? null);
  const [sourceFileUrl] = useState<string | null>(savedSource?.source.fileUrl ?? null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedBlob, setExportedBlob] = useState<Blob | null>(null);
  const [exportedUrl, setExportedUrl] = useState<string | null>(null);
  const [savingVideo, setSavingVideo] = useState(false);
  const [videoSaved, setVideoSaved] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicRef = useRef<MusicEngine | null>(null);
  const fallbackTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const scenes = useMemo(() => normalized.scenes, [normalized.scenes]);
  const scene = scenes[index];
  const totalDuration = useMemo(() => scenes.reduce((sum, item) => sum + item.duration, 0), [scenes]);

  const clearFallback = useCallback(() => {
    if (fallbackTimer.current) clearInterval(fallbackTimer.current);
    fallbackTimer.current = null;
  }, []);

  const goTo = useCallback((next: number) => {
    setElapsed(0);
    setFinished(false);
    setIndex(next);
  }, []);

  const advance = useCallback(() => {
    setIndex((current) => {
      if (current + 1 >= scenes.length) {
        setPlaying(false);
        setFinished(true);
        return current;
      }
      setElapsed(0);
      return current + 1;
    });
  }, [scenes.length]);

  useEffect(() => {
    clearFallback();
    audioRef.current?.pause();
    audioRef.current = null;
    if (!scene || !playing) return;

    musicRef.current?.setDuck(true);

    if (scene.audioUrl) {
      const audio = new Audio(scene.audioUrl);
      audio.muted = muted;
      audioRef.current = audio;
      const onTime = () => setElapsed(audio.currentTime);
      audio.addEventListener("timeupdate", onTime);
      audio.addEventListener("ended", advance);
      void audio.play().catch(() => setPlaying(false));
      return () => {
        audio.removeEventListener("timeupdate", onTime);
        audio.removeEventListener("ended", advance);
        audio.pause();
      };
    }

    const started = Date.now();
    fallbackTimer.current = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      setElapsed(seconds);
      if (seconds >= scene.duration) advance();
    }, 200);
    return clearFallback;
  }, [scene, playing, muted, advance, clearFallback]);

  useEffect(() => {
    if (normalized.options.music === "none") return;
    if (playing && !musicRef.current) {
      const engine = new MusicEngine(normalized.options.music);
      musicRef.current = engine;
      void engine.start();
      engine.setDuck(true);
    }
    musicRef.current?.setMuted(muted);
  }, [playing, muted, normalized.options.music]);

  useEffect(() => {
    return () => {
      void musicRef.current?.stop();
      musicRef.current = null;
      clearFallback();
    };
  }, [clearFallback]);

  useEffect(() => {
    if (finished) musicRef.current?.setDuck(false);
  }, [finished]);

  useEffect(() => {
    return () => {
      if (exportedUrl) URL.revokeObjectURL(exportedUrl);
    };
  }, [exportedUrl]);

  if (!scene) return null;

  const elapsedBefore = scenes.slice(0, index).reduce((sum, item) => sum + item.duration, 0);
  const overall = totalDuration
    ? Math.min(100, ((elapsedBefore + Math.min(elapsed, scene.duration)) / totalDuration) * 100)
    : 0;

  function togglePlay() {
    if (finished) {
      goTo(0);
      setPlaying(true);
      return;
    }
    setPlaying((current) => !current);
  }

  function restart() {
    goTo(0);
    setPlaying(true);
  }

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    try {
      const result = await onSave();
      setSaved(true);
      if (result && "id" in result) setSavedLessonId(result.id);
    } finally {
      setSaving(false);
    }
  }

  async function handleExportVideo() {
    setExportError(null);
    setExporting(true);
    setExportProgress(null);
    try {
      const blob = await exportLessonVideo(normalized, (progress) => setExportProgress(progress));
      setExportedBlob(blob);
      setExportedUrl(URL.createObjectURL(blob));
      setVideoSaved(false);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Video export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveVideo() {
    if (!exportedBlob || !savedLessonId) return;
    setSavingVideo(true);
    try {
      const videoBase64 = await blobToBase64(exportedBlob);
      await saveVideoFn({ data: { lessonId: savedLessonId, videoBase64 } });
      setVideoSaved(true);
    } catch {
      setExportError("Couldn't save the video to your library. You can still download it below.");
    } finally {
      setSavingVideo(false);
    }
  }

  function share() {
    const url = window.location.href;
    void navigator.clipboard.writeText(url).then(() => {
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    });
  }

  return (
    <main className="paper-grain min-h-screen">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="font-display text-lg">
            LessonReel
          </Link>
          <div className="flex items-center gap-2">
            {showSave && user && (
              <Link
                to="/library"
                className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Library
              </Link>
            )}
            {showSave && !user && (
              <Link
                to="/auth"
                className="rounded-full border border-border px-4 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                Sign in to save
              </Link>
            )}
            {showSave && user && (
              <button
                onClick={handleSave}
                disabled={saving || saved}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  saved
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "bg-primary text-primary-foreground hover:bg-primary/90",
                )}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : saved ? <Check className="size-4" /> : <Bookmark className="size-4" />}
                {saved ? "Saved" : "Save to library"}
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl">{normalized.title}</h1>
            {normalized.subtitle && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{normalized.subtitle}</p>}
          </div>
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="relative aspect-video w-full overflow-hidden">
            {scene.imageUrl ? (
              <img
                key={scene.id}
                src={scene.imageUrl}
                alt={`Illustration for ${scene.title}`}
                className={cn("size-full object-cover", playing && "animate-drift")}
              />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-2 bg-secondary text-muted-foreground">
                <ImageOff className="size-6" />
                <span className="text-sm">Illustration unavailable</span>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-6 pt-24 pb-8">
              <p className="font-display text-2xl leading-tight text-balance text-white sm:text-4xl">
                {scene.caption || scene.title}
              </p>
            </div>

            {!playing && !finished && (
              <button
                onClick={togglePlay}
                aria-label="Play lesson"
                className="absolute inset-0 flex items-center justify-center bg-black/30 transition-colors hover:bg-black/40"
              >
                <span className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Play className="ml-1 size-8" />
                </span>
              </button>
            )}

            {finished && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80 px-6 text-center">
                <p className="font-display text-3xl text-white">Lesson complete</p>
                <ul className="max-w-lg space-y-1.5 text-sm text-white/75">
                  {normalized.takeaways.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
                <button
                  onClick={restart}
                  className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
                >
                  <RotateCcw className="size-4" /> Watch again
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-border px-4 py-4">
            <div className="flex gap-1">
              {scenes.map((item, itemIndex) => {
                const fill =
                  itemIndex < index ? 100 : itemIndex > index ? 0 : Math.min(100, (elapsed / item.duration) * 100);
                return (
                  <button
                    key={item.id}
                    onClick={() => goTo(itemIndex)}
                    aria-label={`Jump to scene ${itemIndex + 1}`}
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary"
                  >
                    <span
                      className="block h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                      style={{ width: `${fill}%` }}
                    />
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => goTo(Math.max(0, index - 1))}
                className="rounded-full p-2 text-muted-foreground hover:bg-accent"
                aria-label="Previous scene"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                onClick={togglePlay}
                className="flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
              </button>
              <button
                onClick={() => goTo(Math.min(scenes.length - 1, index + 1))}
                className="rounded-full p-2 text-muted-foreground hover:bg-accent"
                aria-label="Next scene"
              >
                <ChevronRight className="size-5" />
              </button>
              <span className="ml-2 text-sm text-muted-foreground">
                Scene {index + 1} of {scenes.length} · {scene.title}
              </span>
              <div className="ml-auto flex items-center gap-3">
                <div className="hidden h-1 w-32 overflow-hidden rounded-full bg-secondary sm:block">
                  <span className="block h-full bg-primary" style={{ width: `${overall}%` }} />
                </div>
                <button
                  onClick={() => setMuted((current) => !current)}
                  className="rounded-full p-2 text-muted-foreground hover:bg-accent"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
                </button>
                <button
                  onClick={() => setShowTranscript((s) => !s)}
                  className={cn(
                    "rounded-full p-2 transition-colors",
                    showTranscript ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                  )}
                  aria-label="Toggle transcript"
                >
                  <ScrollText className="size-5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 flex gap-3 overflow-x-auto pb-2">
          {scenes.map((item, itemIndex) => (
            <button
              key={item.id}
              onClick={() => goTo(itemIndex)}
              className={cn(
                "w-44 shrink-0 overflow-hidden rounded-xl border text-left transition-colors",
                itemIndex === index ? "border-primary" : "border-border hover:border-primary/50",
              )}
            >
              <div className="aspect-video bg-secondary">
                {item.imageUrl && <img src={item.imageUrl} alt="" className="size-full object-cover" loading="lazy" />}
              </div>
              <div className="px-3 py-2">
                <p className="text-[11px] text-muted-foreground">Scene {itemIndex + 1}</p>
                <p className="truncate text-sm">{item.title}</p>
              </div>
            </button>
          ))}
        </section>

        {showTranscript && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-5">
            <h3 className="font-display text-lg">Full transcript</h3>
            <div className="mt-4 space-y-4">
              {scenes.map((item) => (
                <div key={item.id}>
                  <p className="text-xs tracking-widest text-muted-foreground uppercase">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed">{item.narration}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={() => navigate({ to: "/" })}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Create another lesson
          </button>
          <button
            onClick={() => {
              goTo(0);
              setPlaying(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            <RotateCcw className="size-4" />
            Restart
          </button>
          <button
            onClick={share}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
          >
            {copyOk ? <Check className="size-4 text-green-600" /> : <Share2 className="size-4" />}
            {copyOk ? "Link copied" : "Copy link"}
          </button>
          {sourceFileUrl && (
            <a
              href={sourceFileUrl}
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent"
            >
              <FileText className="size-4" />
              Original file
            </a>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-card/60 p-5">
          <div className="flex items-center gap-2">
            <Film className="size-4 text-primary" />
            <h3 className="font-display text-base">Video export</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Render this lesson to a real .webm video you can download. Narration is included; background music
            isn't captured yet.
          </p>

          {exportError && <p className="mt-3 text-sm text-destructive">{exportError}</p>}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {savedVideoUrl && !exportedUrl && (
              <a
                href={savedVideoUrl}
                download
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <Download className="size-4" />
                Download saved video
              </a>
            )}

            <button
              onClick={handleExportVideo}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
            >
              {exporting ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4" />}
              {exporting
                ? `Rendering scene ${(exportProgress?.sceneIndex ?? 0) + 1} of ${exportProgress?.total ?? scenes.length}…`
                : savedVideoUrl || exportedUrl
                  ? "Re-export video"
                  : "Export video"}
            </button>

            {exportedUrl && (
              <a
                href={exportedUrl}
                download={`${normalized.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "lesson"}.webm`}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                <Download className="size-4" />
                Download video
              </a>
            )}

            {exportedUrl && showSave && user && savedLessonId && (
              <button
                onClick={handleSaveVideo}
                disabled={savingVideo || videoSaved}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  videoSaved
                    ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                    : "border border-border hover:bg-accent",
                )}
              >
                {savingVideo ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : videoSaved ? (
                  <Check className="size-4" />
                ) : (
                  <Bookmark className="size-4" />
                )}
                {videoSaved ? "Saved to library" : "Save video to library"}
              </button>
            )}
          </div>

          {exportedUrl && showSave && user && !savedLessonId && (
            <p className="mt-3 text-xs text-muted-foreground">
              Save this lesson to your library first if you want the video stored there too — the download above
              works either way.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

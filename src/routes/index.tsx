import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { FileText, Loader2, Sparkles, Type, Upload, Volume2, User, Library } from "lucide-react";
import {
  extractFileText,
  isSupportedFile,
  readFileAsDataUrl,
  MIN_PDF_PAGES,
  SPLIT_PAGE_THRESHOLD,
} from "@/lib/extract-text";
import { buildLesson } from "@/lib/pipeline";
import {
  AUDIENCES,
  DEFAULT_OPTIONS,
  LENGTHS,
  MOODS,
  VOICES,
  type LessonOptions,
  type SourceKind,
} from "@/lib/lesson-types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LessonReel — Turn study material into narrated video lessons" },
      {
        name: "description",
        content:
          "Upload a PDF, DOCX or PPTX, paste your notes, or name a topic. LessonReel scripts, illustrates and narrates a scene-by-scene video lesson you can watch instantly.",
      },
      { property: "og:title", content: "LessonReel — Narrated video lessons from your study material" },
      {
        property: "og:description",
        content:
          "AI illustrations, voice narration and background music, assembled scene by scene from your own material.",
      },
      { name: "twitter:title", content: "LessonReel" },
      {
        name: "twitter:description",
        content: "Turn PDFs, notes or a topic into a narrated video lesson in minutes.",
      },
    ],
  }),
  component: Home,
});

const TABS: { id: SourceKind; label: string; icon: typeof Upload }[] = [
  { id: "file", label: "Upload file", icon: Upload },
  { id: "text", label: "Paste text", icon: Type },
  { id: "topic", label: "Topic", icon: Sparkles },
];

function Home() {
  const navigate = useNavigate();
  const { user, signOut, isLoading } = useAuth();
  const [tab, setTab] = useState<SourceKind>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [options, setOptions] = useState<LessonOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewAudio = useRef<HTMLAudioElement | null>(null);

  const set = <K extends keyof LessonOptions>(key: K, value: LessonOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));

  async function previewVoice() {
    if (previewing) return;
    setPreviewing(true);
    try {
      const res = await fetch("/api/narrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Here's how I'll narrate your lesson — clear, steady and easy to follow.",
          voice: options.voice,
        }),
      });
      if (!res.ok) throw new Error("preview failed");
      const url = URL.createObjectURL(await res.blob());
      previewAudio.current?.pause();
      const audio = new Audio(url);
      previewAudio.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      setError("Couldn't play a voice preview just now.");
    } finally {
      setPreviewing(false);
    }
  }

  async function start() {
    setError(null);
    try {
      setBusy(true);
      let content = "";
      let label = "";
      let fileBytes: string | null = null;
      let fileName: string | null = null;
      let fileType: string | null = null;
      let pageCount: number | null = null;
      const MAX_STORED_FILE_BYTES = 20 * 1024 * 1024;
      if (tab === "file") {
        if (!file) throw new Error("Choose a PDF, DOCX, PPTX or text file first.");
        label = file.name;
        const extracted = await extractFileText(file);
        content = extracted.text;
        pageCount = extracted.pageCount;
        if (file.size <= MAX_STORED_FILE_BYTES) {
          fileBytes = await readFileAsDataUrl(file);
          fileName = file.name;
          fileType = file.type || "application/octet-stream";
        }
      } else if (tab === "text") {
        if (text.trim().length < 80) throw new Error("Paste at least a couple of paragraphs to work from.");
        label = "Pasted notes";
        content = text.trim();
      } else {
        if (topic.trim().length < 3) throw new Error("Give the topic a name first.");
        label = topic.trim();
        content = topic.trim();
      }
      void buildLesson({ kind: tab, label, content, fileBytes, fileName, fileType, pageCount }, options);
      navigate({ to: "/build" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="paper-grain min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg">
            <FileText className="size-5 text-primary" />
            LessonReel
          </Link>
          <div className="flex items-center gap-3">
            {!isLoading && user ? (
              <>
                <Link
                  to="/library"
                  className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent sm:inline-flex"
                >
                  <Library className="size-4" />
                  Library
                </Link>
                <span className="hidden text-sm text-muted-foreground sm:inline">{user.email}</span>
                <button
                  onClick={() => signOut()}
                  className="rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <User className="size-4" />
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 pb-24 pt-14 sm:pt-20">
        <header className="animate-rise max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            <FileText className="size-3.5" /> LessonReel
          </span>
          <h1 className="font-display mt-6 text-5xl leading-[1.05] text-balance sm:text-6xl">
            Turn study material into a narrated video lesson.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Drop in a PDF, a slide deck, your notes — or just a topic. We write the script, illustrate
            every scene, record the narration and score it, then play it back as a lesson.
          </p>
        </header>

        <section className="animate-rise mt-12 rounded-2xl border border-border bg-card p-2 shadow-[0_1px_0_theme(colors.border),0_24px_60px_-40px_rgba(0,0,0,0.4)]">
          <div className="flex gap-1 rounded-xl bg-secondary/60 p-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  tab === id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="p-4 sm:p-6">
            {tab === "file" && (
              <div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dropped = event.dataTransfer.files?.[0];
                    if (dropped && isSupportedFile(dropped)) setFile(dropped);
                    else if (dropped) setError("That file type isn't supported.");
                  }}
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-background/60 px-6 py-14 text-center transition-colors hover:border-primary/60 hover:bg-accent/30"
                >
                  <Upload className="size-6 text-primary" />
                  <span className="text-base font-medium">
                    {file ? file.name : "Drop a file here, or click to choose"}
                  </span>
                  <span className="text-sm text-muted-foreground">PDF, DOCX, PPTX, TXT or Markdown</span>
                </button>
                <p className="mt-3 text-xs text-muted-foreground">
                  PDFs need at least {MIN_PDF_PAGES} pages. Longer PDFs (over {SPLIT_PAGE_THRESHOLD} pages) are
                  automatically split into a series of shorter, topic-by-topic lessons. We also check that
                  uploaded material is educational before building.
                </p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx,.pptx,.txt,.md"
                  className="hidden"
                  onChange={(event) => {
                    const chosen = event.target.files?.[0];
                    if (chosen) setFile(chosen);
                  }}
                />
              </div>
            )}

            {tab === "text" && (
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={10}
                placeholder="Paste your chapter, notes or article here…"
                className="w-full resize-y rounded-xl border border-border bg-background/60 p-4 text-base leading-relaxed outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/25"
              />
            )}

            {tab === "topic" && (
              <div>
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="e.g. How enzymes lower activation energy"
                  className="w-full rounded-xl border border-border bg-background/60 px-4 py-4 text-base outline-none focus:border-primary/60 focus:ring-2 focus:ring-ring/25"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  No source material needed — we'll build the lesson from established knowledge.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="mt-8 grid gap-6 sm:grid-cols-2">
          <OptionGroup label="Lesson length">
            <div className="grid gap-2">
              {LENGTHS.map((item) => (
                <Choice
                  key={item.id}
                  active={options.length === item.id}
                  title={item.label}
                  note={item.note}
                  onClick={() => set("length", item.id)}
                />
              ))}
            </div>
          </OptionGroup>

          <OptionGroup label="Audience">
            <div className="grid gap-2">
              {AUDIENCES.map((item) => (
                <Choice
                  key={item.id}
                  active={options.audience === item.id}
                  title={item.label}
                  note={item.note}
                  onClick={() => set("audience", item.id)}
                />
              ))}
            </div>
          </OptionGroup>

          <OptionGroup label="Narrator voice">
            <div className="flex flex-wrap gap-2">
              {VOICES.map((voice) => (
                <button
                  key={voice.id}
                  type="button"
                  onClick={() => set("voice", voice.id)}
                  title={voice.note}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    options.voice === voice.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  {voice.name}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={previewVoice}
              disabled={previewing}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline disabled:opacity-60"
            >
              {previewing ? <Loader2 className="size-4 animate-spin" /> : <Volume2 className="size-4" />}
              Preview voice
            </button>
          </OptionGroup>

          <OptionGroup label="Background music">
            <div className="flex flex-wrap gap-2">
              {MOODS.map((mood) => (
                <button
                  key={mood.id}
                  type="button"
                  onClick={() => set("music", mood.id)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                    options.music === mood.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card hover:border-primary/50",
                  )}
                >
                  {mood.label}
                </button>
              ))}
            </div>
          </OptionGroup>
        </section>

        {error && (
          <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-7 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-70"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Sparkles className="size-5" />}
            Create lesson
          </button>
          <p className="text-sm text-muted-foreground">
            {user ? "Your lesson will be ready to save after you watch it." : "Sign in to save lessons to your library."}
          </p>
        </div>
      </div>
    </main>
  );
}

function OptionGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <h2 className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">{label}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Choice({
  active,
  title,
  note,
  onClick,
}: {
  active: boolean;
  title: string;
  note: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-baseline justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        active ? "border-primary bg-accent/50" : "border-border bg-background/50 hover:border-primary/40",
      )}
    >
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </button>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  FileText,
  Loader2,
  Sparkles,
  Type,
  Upload,
  Volume2,
  User,
  Library,
  PenLine,
  ImageIcon,
  Mic,
  Play,
  Film,
  Share2,
  Layers,
  Music2,
  ArrowRight,
  ShieldCheck,
  Wand2,
} from "lucide-react";
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

const STEPS = [
  {
    icon: PenLine,
    title: "1. Write the script",
    body: "Drop in a PDF, notes or just a topic. AI drafts a scene-by-scene lesson script faithful to your material.",
  },
  {
    icon: ImageIcon,
    title: "2. Illustrate every scene",
    body: "Each scene gets its own AI illustration in a single consistent style, so the whole lesson looks like one series.",
  },
  {
    icon: Mic,
    title: "3. Record the narration",
    body: "A natural-sounding narrator voice reads every scene, timed exactly to what's on screen.",
  },
  {
    icon: Play,
    title: "4. Watch, save or export",
    body: "Play it back instantly, save it to your library and share a link — or export a real downloadable video file.",
  },
] as const;

const FEATURES = [
  {
    icon: Wand2,
    title: "AI script writing",
    body: "Turns dense material into a clear scene arc — hook, core ideas, recap — tuned to school, college or professional audiences.",
  },
  {
    icon: ImageIcon,
    title: "Consistent illustrations",
    body: "One art direction is generated per lesson and reused across every scene, so nothing looks like a random image grab-bag.",
  },
  {
    icon: Music2,
    title: "Generative score",
    body: "A background score is composed live for every lesson and ducks automatically under the narration.",
  },
  {
    icon: Layers,
    title: "Long PDFs, split by topic",
    body: `PDFs over ${SPLIT_PAGE_THRESHOLD} pages are automatically broken into a series of shorter, topic-by-topic lessons.`,
  },
  {
    icon: Film,
    title: "Real video export",
    body: "Beyond the in-browser player, export an actual downloadable video file of the finished lesson.",
  },
  {
    icon: Share2,
    title: "Save and share",
    body: "Sign in to keep lessons in your library and share any of them with a single public link.",
  },
] as const;

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

  function scrollToCompose() {
    document.getElementById("compose")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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

      {/* ───────── Hero / banner ───────── */}
      <section className="paper-grain overflow-hidden border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
          <div className="animate-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <Sparkles className="size-3.5 text-primary" /> AI-narrated video lessons
            </span>
            <h1 className="font-display mt-6 text-5xl leading-[1.03] text-balance sm:text-6xl lg:text-[3.7rem]">
              Turn study material into a narrated video lesson.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Drop in a PDF, a slide deck, your notes — or just a topic. We write the script, illustrate
              every scene, record the narration and score it, then play it back like a video.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={scrollToCompose}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3.5 text-base font-semibold text-primary-foreground transition-transform hover:scale-[1.02]"
              >
                <Sparkles className="size-5" />
                Start creating — free
              </button>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-5 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-accent"
              >
                See how it works
                <ArrowRight className="size-4" />
              </a>
            </div>

            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-primary" /> No credit card
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Film className="size-4 text-primary" /> Real exportable video
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Share2 className="size-4 text-primary" /> Share with one link
              </span>
            </div>
          </div>

          <div className="animate-rise relative mx-auto w-full max-w-md" style={{ animationDelay: "120ms" }}>
            <HeroSceneStack />
          </div>
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how-it-works" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl sm:text-4xl">From source material to finished lesson</h2>
            <p className="mt-3 text-muted-foreground">Four automated steps, no editing required.</p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <div key={step.title} className="rounded-2xl border border-border bg-card p-6">
                <span className="inline-flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <step.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-xl">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Features ───────── */}
      <section className="border-b border-border bg-card/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl sm:text-4xl">Everything is generated, nothing is manual</h2>
            <p className="mt-3 text-muted-foreground">
              Script, art, voice and score are produced together so the whole lesson feels like one piece of work.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-2xl border border-border bg-card p-6">
                <feature.icon className="size-5 text-primary" />
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Composer ───────── */}
      <section id="compose" className="scroll-mt-8">
        <div className="mx-auto w-full max-w-5xl px-6 pt-20 pb-24">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl sm:text-4xl">Build your lesson</h2>
            <p className="mt-3 text-muted-foreground">Choose a source, tune the options below, and create.</p>
          </div>

          <section className="animate-rise mt-8 rounded-2xl border border-border bg-card p-2 shadow-[0_1px_0_theme(colors.border),0_24px_60px_-40px_rgba(0,0,0,0.4)]">
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
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <span className="inline-flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            LessonReel
          </span>
          <span>Study material in, narrated video lesson out.</span>
        </div>
      </footer>
    </main>
  );
}

function HeroSceneStack() {
  const cards = [
    {
      rotate: "-rotate-6",
      translate: "translate-x-3 -translate-y-2",
      z: "z-10",
      from: "from-chart-3/70",
      to: "to-chart-3/30",
      title: "Cell structure",
      caption: "Scene 2 of 8",
    },
    {
      rotate: "rotate-3",
      translate: "-translate-x-2 translate-y-1",
      z: "z-20",
      from: "from-chart-2/70",
      to: "to-chart-2/30",
      title: "Photosynthesis",
      caption: "Scene 5 of 8",
    },
  ] as const;

  return (
    <div className="relative aspect-square w-full">
      {cards.map((card) => (
        <div
          key={card.title}
          className={cn(
            "absolute inset-8 overflow-hidden rounded-2xl border border-border shadow-xl transition-transform",
            "bg-gradient-to-br",
            card.from,
            card.to,
            card.rotate,
            card.translate,
            card.z,
          )}
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pt-10 pb-4">
            <p className="text-xs text-white/70">{card.caption}</p>
            <p className="font-display text-lg text-white">{card.title}</p>
          </div>
        </div>
      ))}

      <div className="absolute inset-0 z-30 flex rotate-1 items-end p-4">
        <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="relative aspect-video bg-gradient-to-br from-primary/80 to-accent">
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10 pb-4">
              <p className="text-xs text-white/70">Scene 7 of 8</p>
              <p className="font-display text-xl text-white">Newton's third law</p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-primary/95 text-primary-foreground shadow-lg">
                <Play className="ml-0.5 size-6" />
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 border-t border-border px-4 py-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className={cn("h-1.5 flex-1 rounded-full", i < 5 ? "bg-primary" : "bg-secondary")}
              />
            ))}
          </div>
        </div>
      </div>

      <span className="absolute -top-2 -right-2 z-40 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg">
        <Mic className="size-3.5 text-primary" /> Narrated
      </span>
      <span className="absolute -bottom-2 -left-2 z-40 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-lg">
        <Music2 className="size-3.5 text-primary" /> Scored
      </span>
    </div>
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

export type LessonLength = "short" | "standard" | "deep";
export type Audience = "school" | "college" | "professional";
export type MusicMood = "calm" | "focus" | "upbeat" | "none";

export type LessonOptions = {
  length: LessonLength;
  audience: Audience;
  voice: string;
  music: MusicMood;
};

export type SourceKind = "file" | "text" | "topic";

export type LessonSource = {
  kind: SourceKind;
  label: string;
  content: string;
  /** Original uploaded file, as a data: URL — only present client-side, in memory, before save. */
  fileBytes?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  /** R2 object key for the original file — set server-side once saved, stripped of fileBytes. */
  filePath?: string | null;
  /** Signed download URL for the original file — resolved on read, never persisted. */
  fileUrl?: string | null;
  /** PDF page count, from pdf.js — null for non-PDF sources. Drives the min-pages gate and topic-split threshold. */
  pageCount?: number | null;
};

export type TopicSegment = {
  title: string;
  content: string;
};

export type SeriesInfo = {
  seriesId: string;
  partIndex: number;
  totalParts: number;
  partTitle: string;
  seriesTitle: string;
};

export type SeriesPart = {
  id: string;
  shareId: string;
  partIndex: number;
  totalParts: number;
  partTitle: string;
};

export type ScriptedScene = {
  title: string;
  narration: string;
  caption: string;
  illustration: string;
};

export type LessonScript = {
  title: string;
  subtitle: string;
  artDirection: string;
  takeaways: string[];
  scenes: ScriptedScene[];
};

export type SceneAssetStatus = "pending" | "ready" | "failed";

export type Scene = ScriptedScene & {
  id: string;
  artDirection: string;
  imageUrl: string | null;
  imageStatus: SceneAssetStatus;
  audioUrl: string | null;
  audioStatus: SceneAssetStatus;
  duration: number;
};

export type BuildStage = "idle" | "reading" | "scripting" | "producing" | "ready" | "error";

export type Lesson = {
  title: string;
  subtitle: string;
  takeaways: string[];
  scenes: Scene[];
  options: LessonOptions;
  source: LessonSource;
  /** Present when this lesson is one part of a topic-split series built from one long PDF. */
  series?: SeriesInfo | null;
};

export type VideoStatus = "none" | "pending" | "ready" | "failed";

export type SavedLesson = {
  id: string;
  ownerId: string;
  title: string;
  subtitle: string;
  takeaways: string[];
  source: LessonSource;
  options: LessonOptions;
  publicShareId: string;
  isPublic: boolean;
  createdAt: string;
  scenes: SavedScene[];
  videoUrl: string | null;
  videoStatus: VideoStatus;
  series: SeriesInfo | null;
  /** Sibling parts of the same series, sorted by partIndex — empty when this lesson isn't split. */
  seriesParts: SeriesPart[];
};

export type SavedScene = {
  id: string;
  sceneIndex: number;
  title: string;
  narration: string;
  caption: string;
  illustration: string;
  artDirection: string | null;
  duration: number;
  imageUrl: string | null;
  audioUrl: string | null;
  imageStatus: SceneAssetStatus;
  audioStatus: SceneAssetStatus;
};

export const VOICES = [
  { id: "alloy", name: "Alloy", note: "Balanced and neutral" },
  { id: "nova", name: "Nova", note: "Bright and encouraging" },
  { id: "onyx", name: "Onyx", note: "Deep and steady" },
  { id: "shimmer", name: "Shimmer", note: "Warm and gentle" },
  { id: "fable", name: "Fable", note: "Storytelling cadence" },
] as const;

export const LENGTHS: { id: LessonLength; label: string; note: string; scenes: number }[] = [
  { id: "short", label: "Short", note: "~1 min · 5 scenes", scenes: 5 },
  { id: "standard", label: "Standard", note: "~2 min · 8 scenes", scenes: 8 },
  { id: "deep", label: "Deep dive", note: "~3 min · 12 scenes", scenes: 12 },
];

export const AUDIENCES: { id: Audience; label: string; note: string }[] = [
  { id: "school", label: "School", note: "Plain language, concrete examples" },
  { id: "college", label: "College", note: "Precise terms, some depth" },
  { id: "professional", label: "Professional", note: "Dense, assumes background" },
];

export const MOODS: { id: MusicMood; label: string }[] = [
  { id: "calm", label: "Calm" },
  { id: "focus", label: "Focus" },
  { id: "upbeat", label: "Upbeat" },
  { id: "none", label: "No music" },
];

export const DEFAULT_OPTIONS: LessonOptions = {
  length: "standard",
  audience: "college",
  voice: "alloy",
  music: "calm",
};

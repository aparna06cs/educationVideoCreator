import type { Lesson, LessonOptions, LessonSource, SavedLesson, SceneAssetStatus, SeriesPart } from "./lesson-types";

export function base64ToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function dataUrlContentType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "application/octet-stream";
}

export function generateShareId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function savedLessonFromRows(
  lesson: {
    id: string;
    owner_id: string;
    title: string;
    subtitle: string | null;
    takeaways: unknown;
    source: unknown;
    options: unknown;
    public_share_id: string;
    is_public: boolean | null;
    created_at: string | null;
    video_path?: string | null;
    video_status?: string | null;
    series_id?: string | null;
    part_index?: number | null;
    total_parts?: number | null;
    series_title?: string | null;
  },
  scenes: {
    id: string;
    scene_index: number;
    title: string;
    narration: string;
    caption: string;
    illustration: string;
    art_direction: string | null;
    duration: number;
    image_path: string | null;
    audio_path: string | null;
    image_status: string | null;
    audio_status: string | null;
  }[],
  imageUrls: (string | null)[],
  audioUrls: (string | null)[],
  fileUrl?: string | null,
  videoUrl?: string | null,
  seriesParts?: SeriesPart[],
) {
  const source = lesson.source as LessonSource;
  const series =
    lesson.series_id != null
      ? {
          seriesId: lesson.series_id,
          partIndex: lesson.part_index ?? 0,
          totalParts: lesson.total_parts ?? 1,
          partTitle: lesson.title,
          seriesTitle: lesson.series_title ?? lesson.title,
        }
      : null;
  return {
    id: lesson.id,
    ownerId: lesson.owner_id,
    title: lesson.title,
    subtitle: lesson.subtitle ?? "",
    takeaways: Array.isArray(lesson.takeaways) ? (lesson.takeaways as string[]) : [],
    source: fileUrl ? { ...source, fileUrl } : source,
    options: lesson.options as LessonOptions,
    publicShareId: lesson.public_share_id,
    isPublic: lesson.is_public ?? true,
    createdAt: lesson.created_at ?? new Date().toISOString(),
    videoUrl: videoUrl ?? null,
    videoStatus: (lesson.video_status ?? "none") as SavedLesson["videoStatus"],
    series,
    seriesParts: seriesParts ?? [],
    scenes: scenes.map((s, i) => ({
      id: s.id,
      sceneIndex: s.scene_index,
      title: s.title,
      narration: s.narration,
      caption: s.caption,
      illustration: s.illustration,
      artDirection: s.art_direction,
      duration: s.duration,
      imageUrl: imageUrls[i] ?? null,
      audioUrl: audioUrls[i] ?? null,
      imageStatus: (s.image_status ?? "pending") as SceneAssetStatus,
      audioStatus: (s.audio_status ?? "pending") as SceneAssetStatus,
    })),
  };
}

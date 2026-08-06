import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { savedLessonFromRows } from "./lessons.utils";

const IMAGES_BUCKET = "lesson-images";
const AUDIO_BUCKET = "lesson-audio";

export function createServerSupabase(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function getSignedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function loadSignedLesson(
  supabase: ReturnType<typeof createClient<Database>>,
  lessonId: string,
): Promise<ReturnType<typeof savedLessonFromRows>> {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .single();
  if (lessonError || !lesson) throw lessonError ?? new Error("Lesson not found");

  const { data: scenes, error: scenesError } = await supabase
    .from("scenes")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("scene_index", { ascending: true });
  if (scenesError) throw scenesError;

  const imageUrls = await Promise.all(
    (scenes ?? []).map((s) => (s.image_path ? getSignedUrl(IMAGES_BUCKET, s.image_path) : null)),
  );
  const audioUrls = await Promise.all(
    (scenes ?? []).map((s) => (s.audio_path ? getSignedUrl(AUDIO_BUCKET, s.audio_path) : null)),
  );

  const source = lesson.source as { filePath?: string | null } | null;
  const [fileUrl, videoUrl] = await Promise.all([
    source?.filePath ? getR2Url(source.filePath).catch(() => null) : Promise.resolve(null),
    lesson.video_path ? getR2Url(lesson.video_path).catch(() => null) : Promise.resolve(null),
  ]);

  let seriesParts: { id: string; shareId: string; partIndex: number; totalParts: number; partTitle: string }[] = [];
  if (lesson.series_id) {
    const { data: siblings } = await supabase
      .from("lessons")
      .select("id, public_share_id, part_index, total_parts, title")
      .eq("series_id", lesson.series_id)
      .eq("is_public", true)
      .order("part_index", { ascending: true });
    seriesParts = (siblings ?? []).map((row) => ({
      id: row.id,
      shareId: row.public_share_id,
      partIndex: row.part_index ?? 0,
      totalParts: row.total_parts ?? 1,
      partTitle: row.title,
    }));
  }

  return savedLessonFromRows(lesson, scenes ?? [], imageUrls, audioUrls, fileUrl, videoUrl, seriesParts);
}

async function getR2Url(key: string): Promise<string> {
  const { getR2SignedUrl } = await import("./r2");
  return getR2SignedUrl(key);
}

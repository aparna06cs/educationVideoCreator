import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { base64ToBytes, dataUrlContentType, generateShareId, savedLessonFromRows } from "./lessons.utils";
import type { Lesson, LessonSource, SavedLesson } from "./lesson-types";

const IMAGES_BUCKET = "lesson-images";
const AUDIO_BUCKET = "lesson-audio";

const EXTS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
};

export const saveLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lesson: Lesson }) => input)
  .handler(async ({ data, context }) => {
    const { lesson } = data;
    const supabase = context.supabase;
    const shareId = generateShareId();
    const lessonId = crypto.randomUUID();

    let source: LessonSource = { ...lesson.source };
    if (source.kind === "file" && source.fileBytes && source.fileName) {
      try {
        const { uploadToR2 } = await import("./r2");
        const bytes = base64ToBytes(source.fileBytes);
        const contentType = source.fileType || dataUrlContentType(source.fileBytes);
        const key = `sources/${lessonId}/${source.fileName}`;
        await uploadToR2(key, bytes, contentType);
        source = { kind: source.kind, label: source.label, content: source.content, filePath: key, fileName: source.fileName, fileType: contentType };
      } catch (err) {
        console.error("Source file upload failed", err);
        source = { kind: source.kind, label: source.label, content: source.content };
      }
    } else {
      source = { kind: source.kind, label: source.label, content: source.content };
    }

    const { data: inserted, error: lessonError } = await supabase
      .from("lessons")
      .insert({
        id: lessonId,
        owner_id: context.userId,
        title: lesson.title,
        subtitle: lesson.subtitle,
        takeaways: lesson.takeaways,
        source,
        options: lesson.options,
        public_share_id: shareId,
        is_public: true,
        series_id: lesson.series?.seriesId ?? null,
        part_index: lesson.series?.partIndex ?? null,
        total_parts: lesson.series?.totalParts ?? null,
        series_title: lesson.series?.seriesTitle ?? null,
      })
      .select("id")
      .single();

    if (lessonError || !inserted) throw lessonError ?? new Error("Could not save lesson");

    const sceneInserts = lesson.scenes.map((scene, index) => ({
      lesson_id: lessonId,
      scene_index: index,
      title: scene.title,
      narration: scene.narration,
      caption: scene.caption,
      illustration: scene.illustration,
      art_direction: scene.artDirection ?? null,
      duration: scene.duration,
      image_path: null as string | null,
      audio_path: null as string | null,
      image_status: scene.imageStatus,
      audio_status: scene.audioStatus,
    }));

    for (let i = 0; i < lesson.scenes.length; i++) {
      const scene = lesson.scenes[i]!;
      const sceneId = scene.id;
      const row = sceneInserts[i]!;

      if (scene.imageUrl) {
        try {
          const bytes = base64ToBytes(scene.imageUrl);
          const contentType = dataUrlContentType(scene.imageUrl);
          const ext = EXTS[contentType] ?? "png";
          const path = `${lessonId}/${sceneId}.${ext}`;
          const { error } = await supabase.storage.from(IMAGES_BUCKET).upload(path, bytes, {
            contentType,
            upsert: true,
          });
          if (!error) row.image_path = path;
        } catch (err) {
          console.error("Image upload failed", err);
        }
      }

      if (scene.audioUrl) {
        try {
          const bytes = base64ToBytes(scene.audioUrl);
          const contentType = dataUrlContentType(scene.audioUrl);
          const ext = EXTS[contentType] ?? "mp3";
          const path = `${lessonId}/${sceneId}.${ext}`;
          const { error } = await supabase.storage.from(AUDIO_BUCKET).upload(path, bytes, {
            contentType,
            upsert: true,
          });
          if (!error) row.audio_path = path;
        } catch (err) {
          console.error("Audio upload failed", err);
        }
      }
    }

    const { error: scenesError } = await supabase.from("scenes").insert(sceneInserts);
    if (scenesError) throw scenesError;

    return {
      id: lessonId,
      shareId,
      shareUrl: `/s/${shareId}`,
    };
  });

export const saveLessonVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lessonId: string; videoBase64: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("id")
      .eq("id", data.lessonId)
      .eq("owner_id", context.userId)
      .single();
    if (lessonError || !lesson) throw lessonError ?? new Error("Lesson not found");

    const { uploadToR2 } = await import("./r2");
    const bytes = base64ToBytes(data.videoBase64);
    const contentType = dataUrlContentType(data.videoBase64);
    const key = `videos/${data.lessonId}/lesson.webm`;

    try {
      await uploadToR2(key, bytes, contentType || "video/webm");
    } catch (err) {
      await supabase.from("lessons").update({ video_status: "failed" }).eq("id", data.lessonId);
      throw err;
    }

    const { error } = await supabase
      .from("lessons")
      .update({ video_path: key, video_status: "ready" })
      .eq("id", data.lessonId);
    if (error) throw error;

    return { ok: true };
  });

export const listMyLessons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("lessons")
      .select("id, title, subtitle, public_share_id, is_public, created_at, series_id, part_index, total_parts, series_title")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      subtitle: lesson.subtitle ?? "",
      publicShareId: lesson.public_share_id,
      isPublic: lesson.is_public ?? true,
      createdAt: lesson.created_at ?? new Date().toISOString(),
      seriesId: lesson.series_id,
      partIndex: lesson.part_index,
      totalParts: lesson.total_parts,
      seriesTitle: lesson.series_title,
    }));
  });

export const deleteLesson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lessonId: string }) => input)
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const { data: scenes, error: scenesError } = await supabase
      .from("scenes")
      .select("id, image_path, audio_path")
      .eq("lesson_id", data.lessonId);
    if (scenesError) throw scenesError;

    const { data: lessonRow } = await supabase
      .from("lessons")
      .select("source, video_path")
      .eq("id", data.lessonId)
      .single();

    const imagePaths = (scenes ?? []).map((s) => s.image_path).filter(Boolean) as string[];
    const audioPaths = (scenes ?? []).map((s) => s.audio_path).filter(Boolean) as string[];

    if (imagePaths.length) await supabase.storage.from(IMAGES_BUCKET).remove(imagePaths);
    if (audioPaths.length) await supabase.storage.from(AUDIO_BUCKET).remove(audioPaths);

    const r2Keys: string[] = [];
    const source = lessonRow?.source as { filePath?: string | null } | null;
    if (source?.filePath) r2Keys.push(source.filePath);
    if (lessonRow?.video_path) r2Keys.push(lessonRow.video_path);
    if (r2Keys.length) {
      const { deleteFromR2 } = await import("./r2");
      await deleteFromR2(r2Keys).catch(() => {});
    }

    const { error } = await supabase.from("lessons").delete().eq("id", data.lessonId).eq("owner_id", context.userId);
    if (error) throw error;

    return { ok: true };
  });

export const getMyLesson = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { lessonId: string }) => input)
  .handler(async ({ data, context }) => {
    const { loadSignedLesson } = await import("./lessons.server");
    return loadSignedLesson(context.supabase, data.lessonId);
  });

export const getSharedLesson = createServerFn({ method: "GET" })
  .validator((input: { shareId: string }) => input)
  .handler(async ({ data }) => {
    const { createServerSupabase, loadSignedLesson } = await import("./lessons.server");
    const supabase = createServerSupabase(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
    );
    const { data: lesson, error } = await supabase
      .from("lessons")
      .select("id")
      .eq("public_share_id", data.shareId)
      .eq("is_public", true)
      .single();
    if (error || !lesson) throw error ?? new Error("Lesson not found");
    return loadSignedLesson(supabase, lesson.id);
  });

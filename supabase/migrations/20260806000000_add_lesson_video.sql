-- Exported video files live in Cloudflare R2 (not Supabase Storage) since they're
-- large and R2 has zero egress fees. This column just tracks the R2 object key.
ALTER TABLE public.lessons
  ADD COLUMN video_path text,
  ADD COLUMN video_status text DEFAULT 'none';

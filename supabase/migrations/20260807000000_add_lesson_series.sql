-- Long PDFs (over the split threshold) get broken into a topic-wise series of
-- lessons. Each part is still its own row in `lessons` (own share id, own scenes) —
-- these columns just group them and record their order.
ALTER TABLE public.lessons
  ADD COLUMN series_id uuid,
  ADD COLUMN part_index integer,
  ADD COLUMN total_parts integer,
  ADD COLUMN series_title text;

CREATE INDEX idx_lessons_series_id ON public.lessons(series_id);

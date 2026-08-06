CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  subtitle text,
  takeaways jsonb DEFAULT '[]'::jsonb,
  source jsonb NOT NULL,
  options jsonb NOT NULL,
  public_share_id text UNIQUE NOT NULL,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lessons TO authenticated;
GRANT ALL ON public.lessons TO service_role;
GRANT SELECT ON public.lessons TO anon;

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage their lessons"
  ON public.lessons FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Public lessons are viewable by anyone"
  ON public.lessons FOR SELECT
  TO anon
  USING (is_public = true);

CREATE INDEX idx_lessons_public_share_id ON public.lessons(public_share_id);

CREATE TABLE public.scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid REFERENCES public.lessons(id) ON DELETE CASCADE NOT NULL,
  scene_index integer NOT NULL,
  title text NOT NULL,
  narration text NOT NULL,
  caption text NOT NULL,
  illustration text NOT NULL,
  art_direction text,
  duration numeric NOT NULL,
  image_path text,
  audio_path text,
  image_status text DEFAULT 'pending',
  audio_status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scenes TO authenticated;
GRANT ALL ON public.scenes TO service_role;
GRANT SELECT ON public.scenes TO anon;

ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage scenes of their lessons"
  ON public.scenes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = scenes.lesson_id
        AND lessons.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = scenes.lesson_id
        AND lessons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Public scenes are viewable by anyone"
  ON public.scenes FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id = scenes.lesson_id
        AND lessons.is_public = true
    )
  );

CREATE INDEX idx_scenes_lesson_id ON public.scenes(lesson_id);

CREATE POLICY "Authenticated users can write lesson images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-images'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can write lesson audio"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lesson-audio'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can delete lesson images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'lesson-images'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can delete lesson audio"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'lesson-audio'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Public lesson images are readable"
  ON storage.objects FOR SELECT
  TO anon
  USING (
    bucket_id = 'lesson-images'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.is_public = true
    )
  );

CREATE POLICY "Public lesson audio is readable"
  ON storage.objects FOR SELECT
  TO anon
  USING (
    bucket_id = 'lesson-audio'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.is_public = true
    )
  );

CREATE POLICY "Authenticated users can read lesson images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lesson-images'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.owner_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can read lesson audio"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lesson-audio'
    AND EXISTS (
      SELECT 1 FROM public.lessons
      WHERE lessons.id::text = (storage.foldername(name))[1]
        AND lessons.owner_id = auth.uid()
    )
  );
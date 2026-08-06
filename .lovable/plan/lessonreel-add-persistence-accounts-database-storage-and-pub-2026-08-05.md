# LessonReel — Add persistence: accounts, database, storage and public sharing

## Goal
Move LessonReel from a single-session, in-memory app to a multi-session app where signed-in users can save generated lessons, return to them later, and share them publicly via a link.

## Requirements from the user
- **User accounts** are required so each person owns their lessons.
- **Save everything**: source content, script metadata, scene images, narration audio.
- **Public by link**: anyone with the link can view a saved lesson.

## Current state to change
LessonReel currently has no persistence, no auth, and no Lovable Cloud. The lesson lives only in a browser-side `useSyncExternalStore` and is lost on refresh. The `/api/illustrate` and `/api/narrate` routes stream assets directly to the browser; the `/watch` route relies on object URLs that are revoked on reset.

## Proposed implementation

### 1. Enable Lovable Cloud
Enable Lovable Cloud so the project gets Supabase (PostgreSQL, Auth, Storage). This is required for user accounts, the database, and file storage. This replaces the "no persistence" constraint from the original design.

### 2. Authentication
Use Lovable Cloud Auth with the default set: email/password + Google sign-in. Required routes:
- `/auth` — sign-up / sign-in toggle.
- `/reset-password` — required page for password reset flows.
- Protected authenticated routes under `src/routes/_authenticated/`, using the integration-managed `src/routes/_authenticated/route.tsx`.
- Update `src/routes/__root.tsx` to subscribe to `onAuthStateChange` and show session-aware header affordances (account menu / sign out).

### 3. Database schema
New tables in the `public` schema, with GRANT statements and RLS policies in the same migration.

#### `profiles`
- `id uuid primary key references auth.users(id) on delete cascade`
- `username text`, `display_name text`, `avatar_url text`
- Auto-created via a database trigger on `auth.users` insert.
- RLS: users read/update their own row.

#### `lessons`
- `id uuid primary key default gen_random_uuid()`
- `owner_id uuid references auth.users(id) on delete cascade`
- `title text`, `subtitle text`, `takeaways jsonb`
- `source jsonb` — `{ kind, label, content }`
- `options jsonb` — `{ length, audience, voice, music }`
- `public_share_id text unique` — URL-safe slug for public sharing
- `is_public boolean default true` (since the user chose public-by-link)
- `created_at`, `updated_at` timestamps
- RLS:
  - `authenticated` owners can SELECT/INSERT/UPDATE/DELETE their own rows.
  - `anon` can SELECT rows where `is_public = true`.

#### `scenes`
- `id uuid primary key default gen_random_uuid()`
- `lesson_id uuid references lessons(id) on delete cascade`
- `scene_index integer` for ordering
- `title text`, `narration text`, `caption text`, `illustration text`, `art_direction text`, `duration numeric`
- `image_path text` — storage path for the generated image
- `audio_path text` — storage path for the generated narration audio
- `image_status`, `audio_status` from the pipeline
- RLS:
  - `authenticated` users can manage scenes belonging to their lessons.
  - `anon` can SELECT scenes belonging to public lessons.

### 4. Storage buckets
Create two buckets via the storage tool:
- `lesson-images` — public read for public lessons, write only by the owner.
- `lesson-audio` — public read for public lessons, write only by the owner.

Each saved scene uploads its data URL image and audio blob to the appropriate bucket, using the lesson id as a prefix (e.g. `lesson-images/<lesson_id>/<scene_id>.png`).

### 5. Server functions
Add `src/lib/lessons.functions.ts` for app-internal CRUD:
- `saveLesson(input)` — saves lesson + scenes + uploads images/audio to storage. Returns `lessonId` and `publicShareUrl`.
- `listMyLessons()` — returns all lessons owned by the signed-in user, with scene counts and first thumbnail.
- `getMyLesson({ lessonId })` — returns a full lesson with signed public URLs for images/audio.
- `getPublicLesson({ shareId })` — returns a public lesson and scenes for anonymous viewers.
- `deleteLesson({ lessonId })` — deletes the lesson, scenes, and storage files.
- `updateLessonVisibility({ lessonId, isPublic })` — toggles public sharing.

All authenticated functions use `.middleware([requireSupabaseAuth])` and RLS. Public read uses the server publishable client with a narrow `TO anon` SELECT policy.

### 6. UI changes
- `/auth` route with email/password + Google sign-in and a "check your email" confirmation state.
- `/reset-password` route for password reset.
- `/library` (under `_authenticated/`) — grid of saved lessons with options to open, share, delete.
- Update `/watch` to add a "Save to Library" button when the user is signed in; after saving, show a share link.
- Update `/` composer to add a "Library" link for signed-in users.
- Keep the existing public `/watch` behavior for unsaved, in-session lessons, but allow loading a saved lesson by id or share id.

### 7. Migration and data flow
Write a single SQL migration that creates the tables, grants, RLS policies, and the auto-profile trigger. The migration must also create the storage buckets via the storage tool (not SQL), then add RLS policies on `storage.objects` for the two buckets.

After saving, the pipeline flow becomes:
1. Build lesson as today (in-memory store, browser blobs).
2. On "Save", the browser reads the blobs and sends them to `saveLesson()`.
3. Server uploads images/audio to Supabase Storage, inserts the lesson and scenes, and returns the public share URL.
4. On replay, the app loads the lesson from the server and streams images/audio from Supabase Storage.

### 8. Cost and security notes
- **Credits**: Lovable Cloud storage and auth use the workspace credit pool. Audio and image storage are the main cost drivers for this feature.
- **Security**: `LOVABLE_API_KEY` and Supabase service keys remain server-only. No storage secrets reach the browser; it uses public bucket URLs or signed URLs from server functions.
- **Privacy**: Public-by-link means anyone with the `shareId` can view the lesson. `is_public` is true by default per the user's choice; add a toggle so users can unpublish later.

## Out of scope for this plan
- Converting saved lessons to downloadable MP4 files.
- In-place editing of saved lessons or per-scene regeneration.
- Collaborative workspaces or multi-user ownership.

## Files to create or modify
- `.lovable/plan.md` (this plan)
- Enable Lovable Cloud
- Migration: create `lessons`, `scenes`, `profiles`, policies, trigger
- Storage buckets: `lesson-images`, `lesson-audio`
- `src/lib/lessons.functions.ts` — CRUD server functions
- `src/routes/auth.tsx` — sign-in / sign-up
- `src/routes/reset-password.tsx` — password reset
- `src/routes/_authenticated/library.tsx` — saved lesson list
- `src/routes/_authenticated/route.tsx` — managed auth layout
- `src/routes/watch.tsx` — load saved/public lessons, save button
- `src/routes/index.tsx` — add auth-aware header links
- `src/routes/__root.tsx` — auth state listener and header updates
- `src/lib/lesson-types.ts` — add shareable identifiers if needed
- `src/router.tsx` — add auth context if not already present

## Verification steps
1. Typecheck passes (`tsgo`).
2. A signed-in user can build a lesson and click "Save to Library".
3. The saved lesson appears in `/library` with a thumbnail.
4. The public share link opens the lesson for a non-signed-in viewer.
5. Deleting a lesson removes its scenes and storage files.
6. RLS test: a user cannot read another user's private lesson.

# LessonReel — Technical Design Document

Version 2.0 · Last updated 2026-08-06 · Supersedes v1.0

**What changed since v1.0:** v1.0 described a stateless, no-backend, no-export tool. The app had
already grown Supabase-backed auth, a saved-lesson library, and public sharing before this revision;
v1.0 simply never documented it. This revision (a) documents that persistence layer for the first
time, and (b) records this session's changes: all three AI calls moved off the paid Lovable AI
Gateway onto free providers, original source files and exported videos now persist to Cloudflare R2,
and a genuine downloadable video file is now produced client-side. The "no file export, no
persistence" framing in v1.0 no longer describes this app.

---

## 1. Overview and scope

LessonReel turns study material into a narrated, illustrated video lesson that plays inside the
browser — and, as of this revision, can also be exported as a real `.webm` file and saved to a
personal library.

A user drops in a PDF, DOCX, PPTX, TXT/MD file, pastes raw text, or just types a topic. The app
writes a scene-by-scene lesson script, generates one AI illustration per scene, records AI voice
narration per scene, synthesises a background score, and assembles all of it into a timeline that
plays like a video. Signed-in users can save the lesson (script, images, audio, and optionally the
original source file and an exported video) to a library and share it via a public link.

### Product constraints that shaped the design

| Decision | Choice | Reason |
|---|---|---|
| Playback | In-app timeline player, not a video file, for the core watch experience | The app runs on a serverless edge runtime (Cloudflare-workerd class). There is no ffmpeg, no native binaries, no long-running server process, so server-side video muxing is not possible. |
| Export | Client-side `MediaRecorder`, on demand, not automatic | Real-time capture (roughly one second of wall-clock recording per second of lesson) is too slow to sit in the critical build path. It's an explicit, optional user action instead. |
| AI providers | Groq (text), Pollinations.ai (images), StreamElements (TTS) — all free-tier / keyless | Replaces the original paid Lovable AI Gateway routing so the app can run without burning workspace credits per generation. |
| Persistence split | Supabase for auth + relational data + small assets (images/audio); Cloudflare R2 for large blobs (source files, exported videos) | Supabase's free storage tier (1GB, capped egress) is fine for per-scene PNGs/MP3s but the wrong fit for multi-MB PDFs and tens-of-MB videos. R2 has a 10GB free tier and **zero egress fees**, which matters specifically for video, which gets re-downloaded on every view. |
| Document parsing | Client-side | Large binary files never touch the edge runtime, which has tight request-size and CPU limits and no native PDF stack. |

### What "video" means here, precisely

Two different things now both answer to "video," and they matter for different reasons:

1. **The watch-page timeline** (unchanged from v1.0): no video file exists. A lesson is a sequence
   of scenes; each scene is one still illustration with a CSS Ken Burns drift, one caption, and one
   narration audio track. The player advances scene N → N+1 when scene N's audio fires `ended`, so
   picture and voice can never drift apart.
2. **The exported `.webm`** (new): an actual downloadable video file, rendered entirely in the
   browser by drawing each scene to a `<canvas>` and piping narration audio into the same
   `MediaStream` that `MediaRecorder` captures. This is a real, if lower-fidelity, artifact — it
   does not carry background music in this revision (see §6.4).

---

## 2. Stack

**Framework and build**
- TanStack Start v1 (full-stack React, file-based routing, server functions + server routes)
- Vite 8, TypeScript 5.8, React 19
- Tailwind CSS v4, shadcn/ui primitives (Radix)
- Deployed to an edge worker runtime

**Client-side document parsing** — unchanged from v1.0: `pdfjs-dist`, `mammoth` (browser build),
`jszip` (PPTX slide XML).

**AI providers (all free-tier, no paid gateway)**

| Capability | Provider | Model / endpoint | Key required |
|---|---|---|---|
| Scripting | Groq | `llama-3.3-70b-versatile`, `/openai/v1/chat/completions`, `response_format: json_object` | `GROQ_API_KEY` (free) |
| Illustration | Pollinations.ai | `image.pollinations.ai/prompt/{prompt}` | none |
| Narration | StreamElements | `api.streamelements.com/kappa/v2/speech` (Amazon Polly voices proxied) | none |

**Persistence**
- **Supabase** — Postgres (`lessons`, `scenes`, `profiles` tables with RLS), auth (`@lovable.dev/cloud-auth-js` + Supabase session), and two storage buckets (`lesson-images`, `lesson-audio`) for per-scene assets.
- **Cloudflare R2** — object storage for original uploaded source files (`sources/{lessonId}/{fileName}`) and exported lesson videos (`videos/{lessonId}/lesson.webm`). Accessed via `aws4fetch` (R2's S3-compatible API, signed requests, no Node crypto dependency — works on any edge runtime).

**Audio / video**
- Web Audio API — generative background score (`MusicEngine`, unchanged from v1.0) and, new in this revision, the audio graph that feeds narration into the video-export `MediaRecorder`.
- `HTMLAudioElement` + `blob:`/data: URLs — narration playback and duration measurement.
- `canvas.captureStream()` + `MediaRecorder` — new in this revision, drives video export.

**Validation**: `zod` on server function input. **Auth**: Supabase session, Bearer JWT validated server-side per request (`requireSupabaseAuth` middleware).

---

## 3. Architecture map

### Routes

| Path | File | Role |
|---|---|---|
| `/` | `routes/index.tsx` | Composer: source tabs (upload / paste / topic) + options. Captures the raw uploaded file (as a data URL) alongside its extracted text so it can be persisted later. |
| `/build` | `routes/build.tsx` | Live progress: stage messages, per-asset counters, scene thumbnails filling in. |
| `/watch` | `routes/watch.tsx` | Player for a freshly-built, in-memory lesson. Offers "Save to library" (signed in) and video export. |
| `/s/$shareId` | `routes/s.$shareId.tsx` | Public, unauthenticated view of a saved lesson via its share link. Same `WatchPlayer`, read-only chrome. |
| `/library` | `routes/_authenticated/library.tsx` | Signed-in user's saved lessons: list, open, delete. |
| `/auth`, `/reset-password` | — | Supabase-backed sign-in/sign-up/reset. |
| `/api/illustrate` | `routes/api/illustrate.ts` | Server route. Proxies Pollinations.ai image generation. |
| `/api/narrate` | `routes/api/narrate.ts` | Server route. Proxies StreamElements TTS, streams MP3 back. |

### Modules

| File | Role |
|---|---|
| `lib/lesson-types.ts` | Data model + option catalogues. `LessonSource` now carries optional `fileBytes`/`fileName`/`fileType` (client-side, pre-save) and `filePath`/`fileUrl` (server-resolved). `SavedLesson` adds `videoUrl`/`videoStatus`. |
| `lib/lesson-store.ts` | In-memory build-session store (`useSyncExternalStore`), unchanged. |
| `lib/extract-text.ts` | Client-side text extraction, plus new `readFileAsDataUrl()` for capturing the raw file. |
| `lib/lesson.functions.ts` | `scriptLesson` server function — now calls Groq instead of the Lovable Gateway. |
| `lib/pipeline.ts` | Orchestrator: script → fan out illustration + narration concurrently → ready. Unchanged in shape. |
| `lib/music.ts` | `MusicEngine`, generative Web Audio score. Unchanged. |
| `lib/r2.ts` | **New.** Cloudflare R2 client: `uploadToR2`, `deleteFromR2`, `getR2SignedUrl`. Server-only. |
| `lib/video-export.ts` | **New.** Client-side canvas + `MediaRecorder` compositor: `exportLessonVideo(lesson, onProgress) → Blob`. |
| `lib/lessons.functions.ts` | Server functions: `saveLesson`, `saveLessonVideo` (new), `listMyLessons`, `deleteLesson`, `getMyLesson`, `getSharedLesson`. |
| `lib/lessons.server.ts` | `loadSignedLesson` — resolves Supabase Storage + R2 signed URLs for a saved lesson's images/audio/source-file/video. |
| `lib/lessons.utils.ts` | Row ↔ domain-type mapping (`savedLessonFromRows`), base64/data-URL helpers, share-ID generation. |
| `integrations/supabase/*` | Client, server (service-role) client, auth middleware, generated `Database` types. |

### Data flow — generation (build path)

```text
 BROWSER                                  EDGE SERVER                    FREE PROVIDERS
 ───────                                  ───────────                    ──────────────
 file / text / topic
      │
      │ extract-text.ts (pdfjs / mammoth / jszip)
      │ + readFileAsDataUrl() if a file was uploaded
      ▼
 LessonSource ──► pipeline.buildLesson()
                       │
                       │ scriptLesson()      ┌────────────────┐
                       ├────────────────────►│ createServerFn │──► Groq chat/completions
                       │                     │ (json_object)  │    llama-3.3-70b-versatile
                       │◄────────────────────│                │◄── LessonScript JSON
                       │                     └────────────────┘
                       │
                       │  fan out, 3 workers each, 6 concurrent requests max
                       │
                       ├─ POST /api/illustrate ─►──────────────► image.pollinations.ai
                       │◄── { image: data:image/…;base64,… }
                       │
                       └─ POST /api/narrate ────►──────────────► api.streamelements.com
                          ◄── audio/mpeg stream
                                  │
                                  ▼
                          Blob → objectURL → measure real duration
                                  │
                                  ▼
                        lessonStore ──► /watch player timeline + MusicEngine
```

### Data flow — save path (new)

```text
 /watch "Save to library"                 SUPABASE                        R2
 ─────────────────────────                ────────                        ──
 saveLesson({ lesson })
      │
      │ generate lessonId up front (crypto.randomUUID)
      │
      ├─ source.kind === "file" && fileBytes? ──────────────────────────► PUT sources/{lessonId}/{fileName}
      │                                                                    (strip fileBytes before DB insert)
      │
      ├─ INSERT lessons (id, owner_id, source, options, …) ──► Postgres
      │
      └─ per scene: image/audio bytes ──► Supabase Storage
                     (lesson-images / lesson-audio buckets)
                     INSERT scenes ─────► Postgres

 WatchPlayer "Export video"                                                R2
 ──────────────────────────                                                ──
 exportLessonVideo() → Blob (client-side canvas + MediaRecorder)
      │
      ├─ always: local download (no server round-trip)
      │
      └─ if saved lesson + signed in:
         saveLessonVideo({ lessonId, videoBase64 })
              │
              └─ PUT videos/{lessonId}/lesson.webm ─────────────────────► R2
                 UPDATE lessons SET video_path, video_status='ready' ──► Postgres
```

### Data flow — read path (library / share)

`getMyLesson` / `getSharedLesson` → `loadSignedLesson()`:
1. Select the lesson + its scenes from Postgres.
2. Resolve each scene's `image_path`/`audio_path` to a signed Supabase Storage URL.
3. If `source.filePath` is set, resolve a signed R2 URL → exposed as `source.fileUrl` (never persisted, computed on every read).
4. If `video_path` is set, resolve a signed R2 URL → exposed as `videoUrl`.

---

## 4. The generation pipeline

Sections 4.1 (text extraction), 4.5 (concurrency/progress), and 4.6 (background score) are
unchanged from v1.0 — see that version's detail if needed. What changed:

### 4.2 Scripting — now Groq, not the Lovable Gateway

`lib/lesson.functions.ts`, still a `createServerFn({ method: "POST" })` with a zod validator, same
scene-count-by-length and audience-tone-contract logic as before. The transport changed:

```ts
const raw = await groqComplete(apiKey, prompt);
// POST https://api.groq.com/openai/v1/chat/completions
// model: "llama-3.3-70b-versatile"
// response_format: { type: "json_object" }
```

Groq's `json_object` mode guarantees valid JSON but — unlike the old strict `json_schema` mode —
does not enforce a specific shape. The prompt now embeds the full target schema as literal JSON
text so the model has something concrete to match; the existing defensive parsing (regex
fence-strip fallback, per-field trimming/clamping, dropping scenes with empty narration) is what
actually protects against shape drift, and matters more now than it did under strict mode.

This call is no longer streamed (Groq's non-streaming completions return well inside platform
request-duration limits for this prompt size, unlike the multi-minute reasoning generations the
original streaming design was built to survive).

### 4.3 Illustration — now Pollinations.ai

`POST /api/illustrate` composes the same three-layer prompt (style + subject + "no text" negative
constraints) as v1.0, then fetches directly from `image.pollinations.ai/prompt/{encoded}` with a
random seed, converts the returned bytes to a `data:` URL, and returns `{ image }` — the exact same
response contract as before, so nothing downstream (pipeline, store, player) had to change.

No API key. No `429`/`402` distinction to make (Pollinations doesn't have the same rate-limit/
billing signal shape as the old gateway) — failures collapse to a generic 502, handled by the
existing per-scene degradation in `pipeline.ts`.

### 4.4 Narration — now StreamElements

`POST /api/narrate` maps the app's existing voice IDs (`alloy`, `nova`, `onyx`, `shimmer`, `fable`,
`echo`, `sage`) onto StreamElements' proxied Amazon Polly voices (`Matthew`, `Joanna`, `Russell`,
`Emma`, `Amy`, `Brian`, `Kimberly`), then streams the MP3 straight through — same
`audio/mpeg`/`no-store` response as before.

Text is capped at 550 characters (down from 3000) — StreamElements' proxy has a materially shorter
limit than the old gateway. This is not expected to bite in practice: the scripting prompt already
constrains narration to 30–55 words (~250 characters), well under the new cap.

---

## 5. The player: unchanged core, new export panel

`components/watch-player.tsx` (shared by `/watch` and `/s/$shareId`). The timeline/advancement/
visuals logic (§5 in v1.0) is unchanged. New in this revision:

- **"Original file" download** — shown when the saved lesson has a resolved `source.fileUrl`.
- **Video export panel** — always visible (works for anyone viewing, no auth needed, since it's
  pure client-side rendering):
  - **Export video** — runs `exportLessonVideo()`, shows "Rendering scene N of M…" during the
    real-time capture.
  - **Download video** — always available once export finishes; a plain `blob:` URL download, no
    server round-trip, no storage cost.
  - **Save video to library** — shown only when signed in *and* the lesson has a real database ID
    (either opened from the library, or just saved in this session). Uploads the exported blob to
    R2 via `saveLessonVideo`.
  - **Download saved video** — if the lesson already has a persisted video (`videoUrl` resolved
    from R2), offered directly without re-exporting.

---

## 6. Video export subsystem (new)

`lib/video-export.ts`. The core problem: produce a real video file with **zero server compute**
(the edge runtime still has no ffmpeg), using only what the browser already gives you.

### 6.1 Mechanism

1. A `1280×720` off-screen `<canvas>` is the video source. `canvas.captureStream(30)` yields a
   live `MediaStreamTrack` that reflects whatever is drawn to the canvas at up to 30fps.
2. A single `AudioContext` + `MediaStreamAudioDestinationNode` is the audio source. `MediaRecorder`
   is constructed once, up front, on a `MediaStream` combining the canvas's video track and the
   destination node's audio track — this has to happen before any scene starts rendering, since
   `MediaRecorder` records for the duration it's running, not per-draw-call.
3. For each scene, in order: draw the illustration with a slow zoom (`drawCover` + a 0→8% scale
   ramp over the scene's duration, replicating the CSS Ken Burns drift from the live player) and
   the caption gradient/text overlay (`drawCaption`, with manual word-wrapping since canvas text
   has no built-in reflow). In parallel, a fresh `<audio>` element plays the scene's narration,
   routed into the shared `MediaStreamAudioDestinationNode` via `createMediaElementSource` (and
   also into `audioCtx.destination`, so the user hears the export happening live). The renderer
   awaits the audio's `ended` event (with a hard timeout safety net at `duration + 1.5s` in case an
   event never fires) before moving to the next scene.
4. After the last scene, `MediaRecorder.stop()` is called and its accumulated `Blob` chunks are
   concatenated into the final video `Blob` (`video/webm`, `vp9,opus` where supported, degrading
   through `vp8,opus` to bare `webm`).

### 6.2 Why real-time capture, not something faster

`MediaRecorder` records what actually plays through the `MediaStream` over wall-clock time — there
is no way to render frames faster than real time and have the audio track stay in sync without a
proper offline audio/video encoding pipeline (`OfflineAudioContext` doesn't help here because the
video side still needs `requestAnimationFrame`-paced canvas updates to feed `captureStream`). This
is the reason export is an explicit, on-demand action rather than something baked into the
automatic build pipeline: an 8-scene, ~2-minute lesson takes ~2 minutes to export.

### 6.3 Canvas tainting — the sharp edge

Drawing a cross-origin image onto a canvas without a proper CORS response "taints" the canvas,
which can silently blank out `captureStream()`'s output. This is a non-issue for a freshly-built,
not-yet-saved lesson (`imageUrl` is a `data:` URL — no origin at all). It's a real, if currently
unverified, risk for exporting a **saved** lesson, where `imageUrl` is a signed Supabase Storage
URL: export sets `img.crossOrigin = "anonymous"` and Supabase Storage sends permissive CORS headers
by default, but a bucket with customised CORS policy could break export silently. See §9.

### 6.4 Known limitation: no background music in the export

`MusicEngine` creates and owns its own private `AudioContext`, wired directly to
`ctx.destination` (speakers). Mixing it into the export would mean giving `MusicEngine` an
optional external context/destination to render into instead — not done in this revision, to keep
the change contained. Exported videos currently carry narration only.

---

## 7. Persistence architecture (documented for the first time in this revision)

### 7.1 Why two storage systems

| | Supabase | Cloudflare R2 |
|---|---|---|
| Holds | Auth, `lessons`/`scenes`/`profiles` rows, per-scene images (~100s of KB) and audio (~10s of KB) | Original source files (up to 20MB), exported videos (10s of MB) |
| Free tier | 500MB DB, 1GB storage, 2GB egress/month | 10GB storage, **zero egress fees** |
| Why here | Already the auth/DB system; small-asset volume fits comfortably | Egress-free matters specifically for video, which gets re-downloaded on every playback/share view — Supabase's egress cap would be the first thing to break under any real usage of the video feature |

### 7.2 Schema

`supabase/migrations/` (chronological):
- `lessons` (id, owner_id, title, subtitle, takeaways, **source** jsonb, options jsonb, public_share_id, is_public, timestamps), `scenes` (per-scene row with `image_path`/`audio_path` pointing into Supabase Storage), `profiles`, RLS policies for owner-write / public-read-when-`is_public`. *(pre-existing)*
- **New this revision**: `video_path text`, `video_status text default 'none'` on `lessons`. No new RLS needed — the existing "owners can manage their lessons" `FOR ALL` policy already covers the `UPDATE` that sets these.

The original source file's R2 key lives **inside the existing `source` jsonb column**
(`source.filePath`) rather than a new column — it's semantically part of "what the lesson was built
from," and this avoided a second migration + a second RLS surface for what is one extra string.

### 7.3 Save flow specifics

`saveLesson` generates the lesson's UUID *before* inserting (`crypto.randomUUID()`), rather than
letting Postgres generate it and reading it back — this is what lets the source-file R2 upload
(which needs the lesson ID as part of its object key) happen in the same pass as the row insert,
with no follow-up `UPDATE`. If the R2 upload fails, it's caught and logged; the lesson still saves
successfully without the source file (matches the existing per-scene image/audio upload
failure-tolerance pattern).

`fileBytes` (the raw file as a data URL, potentially several MB) is stripped out of `source` before
it's written to Postgres — only `filePath`/`fileName`/`fileType` persist. Sending a multi-MB base64
blob through `jsonb` would be both wasteful and slow to query; R2 is where the bytes actually live.

### 7.4 Delete flow

`deleteLesson` now also collects `source.filePath` and `video_path` (if set) and calls
`deleteFromR2()` for both, alongside the existing Supabase Storage cleanup for scene images/audio —
so deleting a lesson doesn't leave orphaned R2 objects.

---

## 8. Security and boundaries

- **All provider calls are server-only.** `GROQ_API_KEY` is read inside `scriptLesson`'s handler,
  never at module scope, never `VITE_`-prefixed. Pollinations and StreamElements need no key at all.
  R2 credentials (`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) are read only inside `lib/r2.ts`,
  which is imported exclusively from other server-only modules (`lessons.functions.ts`,
  `lessons.server.ts`) via dynamic `import()` — never from a route file or `*.functions.ts` that
  ships to the client bundle.
- **Auth** — Supabase session, Bearer JWT validated server-side per request via
  `requireSupabaseAuth` (checks JWT shape, calls `supabase.auth.getClaims`). Every mutating server
  function (`saveLesson`, `saveLessonVideo`, `deleteLesson`, `listMyLessons`, `getMyLesson`) is
  gated behind it; ownership is additionally enforced in the query (`eq("owner_id", userId)`).
- **Public share pages are intentionally read-only and unauthenticated** — `getSharedLesson` looks
  up by `public_share_id` + `is_public = true`, with no user context at all. All saved lessons are
  currently public-by-default (`saveLesson` always sets `is_public: true` — there is no UI to make
  one private yet).
- **Signed URLs, not public buckets.** Every asset URL a client ever sees — Supabase Storage or
  R2 — is a time-limited signed URL generated on read (`getSignedUrl` / `getR2SignedUrl`), not a
  permanently public one.
- **Input validation** — zod on server function input; character caps at every AI boundary (45,000
  chars into the scripting prompt, 550 into narration, 20MB cap on which files get their raw bytes
  stored at all).
- **Memory hygiene** — unchanged from v1.0 (object URLs revoked, `AudioContext`s closed, listeners
  cleaned up in effect teardowns), extended to the new export flow's `AudioContext` and blob URL.

---

## 9. Constraints, failure modes, next steps

### Known constraints

| Constraint | Detail |
|---|---|
| Free providers have no SLA | Pollinations and StreamElements are unofficial/keyless free services. If either starts rate-limiting or changes shape, that generation step fails — per-scene degradation (§4.5, unchanged) contains the blast radius to one scene, but there's no automatic fallback to a second provider. |
| Video export has no music | See §6.4. |
| Video export is real-time | An N-minute lesson takes ~N minutes to export; there is no faster path on this runtime. |
| Canvas tainting risk on saved-lesson export | See §6.3 — currently relies on Supabase Storage's default CORS behavior, unverified against a customised bucket policy. |
| Edge runtime | Still no ffmpeg, no native binaries, no long-running jobs — unchanged from v1.0, and still why parsing is client-side and export is client-side too. |
| Scanned PDFs | Unchanged from v1.0 — text-layer extraction only, no OCR. |
| All saved lessons are public | No private-lesson toggle exists in the UI yet, despite `is_public` existing in the schema. |

### Immediate next steps (to actually run this)

1. **Provision credentials.** Get a free `GROQ_API_KEY` at console.groq.com; create an R2 bucket +
   API token in the Cloudflare dashboard (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`). Fill in `.env` from `.env.example`.
2. **Apply the new migration** (`supabase/migrations/20260806000000_add_lesson_video.sql`) to the
   Supabase project — `saveLessonVideo` will fail without the `video_path`/`video_status` columns.
3. **Build with a compatible Node version.** This session's environment (Node 20.12.2) is below the
   toolchain's requirement (`^20.19` / `>=22.12`) and its production build fails at the
   `rolldown`-native-binary stage as a result — unrelated to any of these code changes (`tsc
   --noEmit` passes clean), but it means the build hasn't actually been exercised end-to-end.
   Rerun `npm install && npm run build` on Node ≥20.19 before trusting the bundle.
4. **Smoke-test the golden path in a browser**: upload a PDF → build a lesson → confirm scripting
   (Groq), illustrations (Pollinations), and narration (StreamElements) all actually return usable
   output — none of this session's provider swaps have been exercised against live traffic yet,
   only typechecked. Then: save to library, confirm the original PDF is downloadable, export a
   video, confirm playback and A/V sync, save the video, delete the lesson and confirm both
   Supabase Storage and R2 objects are gone.
5. **Verify export on a *saved* lesson specifically** (not just a freshly-built one) — this is the
   canvas-tainting-risk path (§6.3, §9) and is meaningfully different code path from exporting
   in-memory `data:`-URL images.

### Candidate future work

- **Mix background music into the export** (§6.4) — give `MusicEngine` an optional external
  `AudioContext`/destination.
- **Private lessons** — wire the existing `is_public` column to a UI toggle.
- **Provider fallback chain** — e.g. try a second free image/TTS provider before marking a scene
  failed, given the no-SLA nature of the current ones.
- **OCR fallback** for scanned PDFs (unchanged idea from v1.0).
- **Per-scene regeneration** — re-roll a single illustration/narration line without a full rebuild
  (unchanged idea from v1.0).
- **Faster/offline export path** if a future runtime target supports `WebCodecs` server-side.

---

## Appendix — file index (this revision's additions marked ★)

```text
src/
  lib/
    lesson-types.ts        data model + option catalogues (★ extended: file/video fields)
    lesson-store.ts        in-memory build-session store
    extract-text.ts        client-side text extraction (★ + readFileAsDataUrl)
    lesson.functions.ts    scriptLesson server function (★ now Groq)
    pipeline.ts            orchestration + concurrency + progress
    music.ts               MusicEngine, generative Web Audio score
    r2.ts                  ★ new — Cloudflare R2 client (aws4fetch)
    video-export.ts        ★ new — canvas + MediaRecorder video compositor
    lessons.functions.ts   save/list/delete/get server functions (★ + saveLessonVideo)
    lessons.server.ts      loadSignedLesson (★ + R2 signed-URL resolution)
    lessons.utils.ts       row↔domain mapping, base64 helpers
  integrations/
    supabase/               client, server client, auth middleware, generated types
    lovable/                OAuth wrapper
  routes/
    index.tsx               composer (★ captures raw file bytes)
    build.tsx                progress
    watch.tsx                player for freshly-built lessons (★ returns saved id)
    s.$shareId.tsx           public share view
    _authenticated/library.tsx  saved lessons list
    auth.tsx, reset-password.tsx
    api/illustrate.ts       ★ now Pollinations.ai
    api/narrate.ts          ★ now StreamElements
  components/
    watch-player.tsx        shared player (★ + export/save-video panel, source-file link)
supabase/
  migrations/                schema history (★ + 20260806000000_add_lesson_video.sql)
```

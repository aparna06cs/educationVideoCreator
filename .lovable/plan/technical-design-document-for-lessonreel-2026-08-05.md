# Technical design document for LessonReel

Add a written technical design document to the project at `docs/TECHNICAL_DESIGN.md`, describing exactly what the app is made of and how a "video" lesson is produced. No app behaviour changes.

## What the document will cover

**1. Overview and scope**
What LessonReel does, the single-session (no database, no accounts) model, and the deliberate choice of an in-app player instead of an exported MP4 file, with the reason (the serverless edge runtime has no ffmpeg/native binaries).

**2. Stack**
TanStack Start v1 on Vite 7, React 19, Tailwind v4 with a warm-paper design system, TypeScript, deployed to an edge worker runtime. Client-side parsing libraries: `pdfjs-dist`, `mammoth`, `jszip`. Zod for input validation. No backend database.

**3. Architecture map**
Route-by-route and module-by-module table:
- `/` composer, `/build` progress, `/watch` player
- `src/lib/lesson-types.ts` (data model), `lesson-store.ts` (in-memory store via `useSyncExternalStore`), `extract-text.ts`, `pipeline.ts` (orchestrator), `music.ts` (Web Audio score)
- `src/lib/lesson.functions.ts` (server function), `src/routes/api/illustrate.ts` and `api/narrate.ts` (server routes)
Plus an ASCII data-flow diagram from source file to playing lesson.

**4. The generation pipeline, step by step**
- Text extraction in the browser (per-format logic, 60k char cap, why it stays client-side)
- Scripting: one call to the AI Gateway Responses API with `openai/gpt-5.6-sol`, streamed SSE, strict `json_schema` structured output; the prompt contract (scene count by lesson length, audience tone rules, narration word budget, caption/title limits, art-direction line), plus parsing and fallback handling
- Illustration: `google/gemini-3-pro-image` through `/api/illustrate`, shared art-direction prefix for visual consistency, base64 data URLs, per-scene failure fallback
- Narration: `openai/gpt-4o-mini-tts` through `/api/narrate`, MP3 stream piped to the browser, blob URL, real decoded audio duration used as that scene's on-screen time
- Concurrency model: images and narration run as two pools of 3 workers, progress counters pushed into the store
- Music: generative Web Audio pads/arpeggio per mood, ducked under narration, no audio files

**5. Why it plays like a video without being a video file**
The player is a timeline: each scene = one still with a Ken Burns drift + caption + its narration track; advancement is driven by the audio element's real duration, cross-fades between scenes, segmented progress bar, scene strip for seeking.

**6. Data model**
`Lesson`, `Scene`, `LessonOptions`, `BuildStage` with field-level notes, and the state lifecycle `idle → scripting → producing → ready | error`.

**7. Security and boundaries**
`LOVABLE_API_KEY` server-only, why server routes proxy the AI calls, input validation, no persistence, blob URL cleanup on reset.

**8. Constraints, failure modes and future work**
Per-scene degradation, rate limit (429) and credit (402) handling, edge runtime limits, and candidate extensions: browser-side MP4 export via WebCodecs, saved lesson library, multi-language narration.

## Technical notes

Single new markdown file, `docs/TECHNICAL_DESIGN.md`, with code snippets pulled from the real source (request bodies, schema, pipeline loop) so it stays accurate. Nothing in `src/` is touched.

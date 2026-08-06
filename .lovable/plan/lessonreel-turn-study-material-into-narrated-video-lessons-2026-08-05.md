# LessonReel — turn study material into narrated video lessons

A single-session web app: drop in a PDF, a document, pasted text, or just a topic, and get back a scene-by-scene narrated lesson that plays in an in-app video player with AI illustrations, voice narration, captions, and background music.

## User flow

```text
1. Source      PDF / DOCX / PPTX upload, pasted text, or a topic prompt
2. Options     lesson length, audience level, voice, music mood
3. Building    live progress: outline -> scenes -> illustrations -> narration
4. Watch       full-screen player: illustration + captions + voice + music
5. Review      scene strip to jump around, replay, or restart with new source
```

Nothing is stored — the lesson lives in the browser session. A "Start over" action clears it.

## Screens

**1. Home / composer (`/`)**
Hero with a single input surface that switches between three tabs: Upload file, Paste text, Topic prompt. Below it a compact options row — lesson length (short / standard / deep dive), audience (school / college / professional), narrator voice with preview, music mood (calm, focus, upbeat, none). One primary "Create lesson" button.

**2. Build progress (`/build`)**
Staged progress view showing each pipeline step as it completes, with scene thumbnails filling in as illustrations arrive. Errors on a single scene are shown inline and the lesson continues with a fallback visual.

**3. Player (`/watch`)**
Full-bleed player: current illustration with a slow Ken Burns drift, synced caption line, progress bar segmented by scene, play/pause, skip scene, mute, replay. Under it a horizontal scene strip with title + thumbnail for jumping. A collapsible transcript panel and a "key takeaways" summary card at the end.

## How the lesson gets built

1. **Extract text** — parsing runs in the browser so large files never hit the server: `pdfjs-dist` for PDF, `mammoth` for DOCX, `jszip` + XML text nodes for PPTX. Topic prompt skips this step.
2. **Script the lesson** — one AI call returns a structured outline: lesson title, 6–12 scenes, each with a title, narration script (~25–45 words), an on-screen caption, and an illustration prompt. Long source text is chunked and condensed first.
3. **Illustrate** — one image per scene, generated in parallel batches with a consistent art-direction prefix so every scene looks like the same lesson, not a random gallery.
4. **Narrate** — per-scene text-to-speech; audio is decoded in the browser and its real duration sets that scene's on-screen time, so narration and visuals never drift.
5. **Score** — background music is synthesized in-browser with Web Audio (layered pads/arpeggio per mood) and ducked under narration. No music files to license or download, and it loops for any lesson length.

## Design direction

Editorial and calm rather than edtech-generic: warm paper-toned light surface, deep ink text, one saturated accent for progress and actions, generous whitespace, a serif display face for lesson titles paired with a clean grotesque for UI. The player goes near-black so illustrations carry the frame. Motion is restrained — cross-fades between scenes, a soft drift on stills, progress that eases rather than snaps. Dark mode included.

## Technical notes

- TanStack Start. Lesson state is held in an in-memory store shared across the three routes; no database, no auth, no Lovable Cloud.
- Scripting uses a server function calling Lovable AI Gateway with a strict structured-output schema (streamed server-side so long documents don't time out).
- Illustrations use a server route that proxies the streaming image endpoint so partial previews appear while generating.
- Narration uses a server route that passes the text-to-speech SSE stream straight through; long narration is chunked at sentence boundaries.
- `LOVABLE_API_KEY` stays server-side only.
- Client-side parsing keeps PDF/DOCX/PPTX handling off the edge runtime, which has no native binaries.
- Per-route head metadata (title, description, og/twitter) for home, build, and watch.

## Not included

- No downloadable MP4 export (server-side video rendering isn't available on this runtime). Can be revisited later as a browser-side export.
- No saved lesson library or accounts.

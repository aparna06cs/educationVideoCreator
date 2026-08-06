# EduVideo Creator

I want to create an Web App - converts educational content (PDFs or plain text) into narrated learning videos — complete with AI-generated illustrations, voice narration, background music, and scene-by-scene assembly. for educators and students who want to turn study material into engaging video lessons.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/294c9313-3307-4333-a0b0-1b630761fecf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Running without Lovable Cloud (free tier)

This fork no longer depends on the Lovable AI Gateway. Copy `.env.example` to `.env` and fill in:

- **Supabase** — auth, the `lessons`/`scenes` tables, and small image/audio storage. Free tier.
- **`GROQ_API_KEY`** — powers lesson scripting. Free key at [console.groq.com](https://console.groq.com).
- **Cloudflare R2** (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) — stores original
  uploaded source files and exported lesson videos. Free tier (10GB, zero egress fees). Create a bucket and an
  API token under **R2 > Manage API Tokens** in the Cloudflare dashboard.
- Illustration (Pollinations.ai) and narration (StreamElements) need no keys.

Apply the SQL files in `supabase/migrations/` to your Supabase project (via the SQL editor or `supabase db push`)
before running the app — the latest one adds the `video_path`/`video_status` columns used by video export.

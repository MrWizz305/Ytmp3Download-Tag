# YouTube → MP3

A personal, self-hosted tool: paste a YouTube link, edit the title/album/artist/cover
art, get back a tagged MP3. No ads, no accounts, no analytics — built for one user.

## Architecture

Two pieces, deployed separately:

- **`/` (this Next.js app)** — the UI. Deployed to Vercel. It never touches yt-dlp or
  ffmpeg directly; its two API routes (`/api/info`, `/api/convert`) are thin
  authenticated proxies to the backend.
- **`/backend`** — a small Express service in Docker, deployed to Fly.io. It runs
  `yt-dlp` (audio extraction) and `ffmpeg` (MP3 encoding + ID3 tagging) as child
  processes.

A decorative extra: the bottom of the page shows album art from your real Last.fm
top artists, bouncing around. `/api/top-artists` (server-side, keeps the Last.fm key
private) fetches your top artists, then the browser looks up cover art per artist via
the iTunes Search API (no key needed). Entirely optional — leave `LASTFM_API_KEY` /
`LASTFM_USERNAME` unset and it just doesn't render.

**Why not run yt-dlp/ffmpeg directly inside a Vercel function?** It's tempting since
Vercel's function size limit is 250MB unzipped, which technically fits `yt-dlp` +
a static `ffmpeg` binary. In practice this is a bad fit for the platform: Vercel's
function filesystem is read-only outside `/tmp`, so the binaries need bit-twiddling
just to become executable; the function has to stay open for the entire download +
transcode, which is an awkward shape for a serverless invocation; and `yt-dlp` needs
frequent updates as YouTube changes break it, which is clunky to manage inside a
redeploy-to-update bundle. A small always-on Docker container sidesteps all of this
and gives full control over the environment.

**A YouTube-specific catch, independent of architecture:** YouTube now rate-limits
and challenges requests from datacenter IPs (Vercel, Fly, Railway — all of them) with
a "Sign in to confirm you're not a bot" style check. It's flaky rather than a hard
ban, so the backend automatically retries and falls back to a different client
strategy (see `backend/src/ytdlp.ts`), but reliability improves a lot if you add your
own browser cookies — see [backend/README.md](backend/README.md).

## Setup

### 1. Backend (Fly.io)

See [backend/README.md](backend/README.md) for full instructions. Short version:

```bash
cd backend
fly launch --no-deploy   # creates/adjusts fly.toml, don't let it deploy yet
fly secrets set API_SECRET=$(openssl rand -hex 32)
fly deploy
```

Note the backend's URL (`https://<app-name>.fly.dev`) and the `API_SECRET` you set.

### 2. Frontend (Vercel)

```bash
npm install
vercel
```

In the Vercel project's Environment Variables, set:

| Variable              | Value                                      |
| --------------------- | ------------------------------------------- |
| `BACKEND_URL`          | `https://<app-name>.fly.dev`               |
| `BACKEND_API_SECRET`   | the same secret you set on the backend      |

Redeploy after setting env vars.

### Local development

```bash
# terminal 1
cd backend
cp .env.example .env   # fill in API_SECRET at minimum
npm install
npm run dev             # requires yt-dlp and ffmpeg on your PATH

# terminal 2
cp .env.example .env.local   # BACKEND_URL=http://localhost:8081, matching secret
npm install
npm run dev
```

Open http://localhost:3000.

## Keeping yt-dlp updated

YouTube changes its site periodically and breaks extractors. The Docker image
installs the latest `yt-dlp` release at build time, but Docker layer caching means a
plain `fly deploy` won't necessarily re-fetch it. When something starts failing,
force a fresh install:

```bash
cd backend
fly deploy --build-arg CACHEBUST=$(date +%s)
```

## Project layout

```
app/                Next.js UI + API routes (proxy to backend)
components/          Converter.tsx — the whole interactive flow
lib/                shared types + YouTube URL validation
backend/            Express + yt-dlp + ffmpeg, deployed separately to Fly.io
```

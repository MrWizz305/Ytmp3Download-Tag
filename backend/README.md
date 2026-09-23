# Backend: yt-dlp + ffmpeg extraction service

An Express service that does the actual work: fetches video metadata, downloads the
best audio stream with `yt-dlp`, transcodes it to MP3 with `ffmpeg`, embeds ID3 tags
and cover art, and streams the result back. Deployed as a Docker container to
Fly.io so it isn't constrained by serverless execution limits.

It is not meant to be exposed to the public internet without the API key check —
every route (except `/health`) requires an `x-api-key` header matching `API_SECRET`.
The Next.js app is the only intended caller, via its server-side API routes (the key
never reaches the browser).

## Deploy to Fly.io

Install [flyctl](https://fly.io/docs/flyctl/install/) and sign in:

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

From this directory:

```bash
fly launch --no-deploy
```

This detects the Dockerfile and asks for an app name (must be globally unique) and a
region — it'll update `fly.toml` for you. Say no to adding a database/Redis, you
don't need one.

Set the required secret, then deploy:

```bash
fly secrets set API_SECRET=$(openssl rand -hex 32)
fly deploy
```

Grab the app's URL:

```bash
fly status
# https://<app-name>.fly.dev
```

Put that URL and the `API_SECRET` value into the frontend's Vercel environment
variables (`BACKEND_URL` and `BACKEND_API_SECRET`).

Verify it's up:

```bash
curl https://<app-name>.fly.dev/health
# {"ok":true}
```

## Adding cookies (recommended)

YouTube increasingly challenges requests from datacenter IPs — including Fly's —
with a "Sign in to confirm you're not a bot" check. The backend automatically
retries and falls back to a lower-quality client when this happens, but supplying
cookies from your own logged-in browser session avoids the problem almost entirely
and unlocks full-quality audio streams.

1. Log into YouTube in your regular browser.
2. Export cookies in Netscape format using a browser extension such as
   ["Get cookies.txt LOCALLY"](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)
   (Chrome) — export for `youtube.com` to a file, e.g. `cookies.txt`.
3. Base64-encode it and set it as a Fly secret:

   ```bash
   base64 -i cookies.txt | fly secrets set YTDLP_COOKIES_B64=-
   ```

   (On Linux, `base64 -w0 cookies.txt` avoids line wraps; pipe it the same way.)

4. Redeploy isn't required for secrets — Fly restarts the machine automatically.

Cookies expire; if extraction reliability drops again after a while, re-export and
re-set the secret.

## Environment variables

See `.env.example`. In short:

- `API_SECRET` (required) — shared secret the frontend must send.
- `YTDLP_COOKIES_B64` (optional) — base64 Netscape cookies.txt, see above.
- `MAX_DURATION_SECONDS` (optional, default 1800) — reject videos longer than this.
- `PORT` (optional, default 8080).

## Updating yt-dlp

YouTube breaks extraction periodically; `yt-dlp` ships fixes frequently. The
Dockerfile installs the latest version at build time, but a plain `fly deploy` can
reuse a cached layer and skip re-fetching it. Force a fresh install with:

```bash
fly deploy --build-arg CACHEBUST=$(date +%s)
```

Do this whenever conversions start failing with extraction errors and it isn't
obviously your own network/cookies.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

Requires `yt-dlp` and `ffmpeg` on your `PATH`:

```bash
pip install -U yt-dlp
brew install ffmpeg   # macOS; apt-get install ffmpeg on Linux
```

## API

All routes except `/health` require `x-api-key: <API_SECRET>`.

- `GET /health` → `{ ok: true }`
- `POST /info` — body `{ url }` → `{ id, title, uploader, thumbnail, duration }`
- `POST /convert` — `multipart/form-data`:
  - `url` (required)
  - `title` (required)
  - `album`, `albumArtist` (optional)
  - `coverMode` — `"thumbnail"` or `"upload"`
  - `thumbnailUrl` — required if `coverMode=thumbnail`
  - `cover` — image file, required if `coverMode=upload`

  Returns the finished MP3 as `audio/mpeg` with a `Content-Disposition` filename, or
  a JSON `{ error }` body with an appropriate status code on failure.

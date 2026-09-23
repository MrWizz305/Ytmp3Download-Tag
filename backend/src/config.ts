import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PORT = Number(process.env.PORT ?? 8080);
export const API_SECRET = process.env.API_SECRET ?? "";
export const MAX_DURATION_SECONDS = Number(process.env.MAX_DURATION_SECONDS ?? 1800);
export const MAX_COVER_UPLOAD_BYTES = 15 * 1024 * 1024;

// Decode a base64-encoded cookies.txt (Netscape format) into a real file once at
// startup, so yt-dlp can use it to look like a logged-in browser session and avoid
// YouTube's bot checks. See backend/README.md for how to export/set this.
function resolveCookiesPath(): string | undefined {
  const encoded = process.env.YTDLP_COOKIES_B64;
  if (!encoded) return undefined;

  const cookiesPath = path.join(os.tmpdir(), "yt-dlp-cookies.txt");
  fs.writeFileSync(cookiesPath, Buffer.from(encoded, "base64"));
  return cookiesPath;
}

export const COOKIES_PATH = resolveCookiesPath();

import express, { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import multer from "multer";
import { MAX_COVER_UPLOAD_BYTES, MAX_DURATION_SECONDS, PORT } from "./config";
import { requireApiKey } from "./auth";
import { AppError } from "./errors";
import { downloadBestAudio, downloadBestVideo, getVideoInfo } from "./ytdlp";
import { probeMedia, remuxVideoToMp4, transcodeToMp3 } from "./ffmpeg";
import { writeId3Tags } from "./tagger";
import { isValidYoutubeUrl } from "./youtube";

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_UPLOAD_BYTES },
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/info", requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body ?? {};
    if (typeof url !== "string" || !isValidYoutubeUrl(url)) {
      throw new AppError(400, "That doesn't look like a valid YouTube URL.");
    }

    const info = await getVideoInfo(url);
    res.json(info);
  } catch (err) {
    next(err);
  }
});

function parseTrimSeconds(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function contentDispositionFor(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function resolveCover(
  coverMode: unknown,
  thumbnailUrl: unknown,
  file: Express.Multer.File | undefined,
): Promise<{ buffer: Buffer; mime: string } | undefined> {
  if (coverMode === "upload") {
    if (!file) throw new AppError(400, "No cover image was uploaded.");
    return { buffer: file.buffer, mime: file.mimetype || "image/jpeg" };
  }

  if (coverMode === "thumbnail") {
    if (typeof thumbnailUrl !== "string" || !thumbnailUrl) {
      throw new AppError(400, "Missing thumbnail URL.");
    }
    const res = await fetch(thumbnailUrl);
    if (!res.ok) throw new AppError(502, "Couldn't download the video thumbnail.");
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { buffer, mime };
  }

  return undefined;
}

app.post(
  "/convert",
  requireApiKey,
  upload.single("cover"),
  async (req: Request, res: Response, next: NextFunction) => {
    const {
      url,
      title,
      album,
      albumArtist,
      coverMode,
      thumbnailUrl,
      duration,
      startTime,
      endTime,
      format,
    } = req.body ?? {};
    const outputFormat = format === "mp4" ? "mp4" : "mp3";

    let workDir: string | undefined;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp || !workDir) return;
      cleanedUp = true;
      fs.rm(workDir, { recursive: true, force: true }, () => {});
    };

    try {
      if (typeof url !== "string" || !isValidYoutubeUrl(url)) {
        throw new AppError(400, "That doesn't look like a valid YouTube URL.");
      }
      if (typeof title !== "string" || !title.trim()) {
        throw new AppError(400, "A track title is required.");
      }

      // The frontend already fetched this via /info; trust it here rather than
      // re-invoking yt-dlp (with its own bot-check retries) a second time just
      // for a soft resource cap. Skip the check if it's missing or malformed -
      // it's a courtesy guard against accidentally converting a multi-hour
      // video, not a security boundary.
      const durationSeconds = Number(duration);
      if (Number.isFinite(durationSeconds) && durationSeconds > MAX_DURATION_SECONDS) {
        throw new AppError(
          400,
          `This video is longer than the ${Math.round(MAX_DURATION_SECONDS / 60)}-minute limit configured on this backend.`,
        );
      }

      const startSeconds = parseTrimSeconds(startTime);
      let endSeconds = parseTrimSeconds(endTime);
      if (endSeconds !== undefined && Number.isFinite(durationSeconds) && durationSeconds > 0) {
        endSeconds = Math.min(endSeconds, durationSeconds);
      }
      if (
        startSeconds !== undefined &&
        endSeconds !== undefined &&
        startSeconds >= endSeconds
      ) {
        throw new AppError(400, "Start time must be before end time.");
      }

      workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ytmp3-"));

      let outputPath: string;
      let contentType: string;

      if (outputFormat === "mp4") {
        const inputPath = await downloadBestVideo(url, workDir);
        outputPath = path.join(workDir, "output.mp4");
        await remuxVideoToMp4(inputPath, outputPath, title.trim(), { startSeconds, endSeconds });
        contentType = "video/mp4";
      } else {
        const cover = await resolveCover(coverMode, thumbnailUrl, req.file);
        const inputPath = await downloadBestAudio(url, workDir);
        outputPath = path.join(workDir, "audio.mp3");
        await transcodeToMp3(inputPath, outputPath, { startSeconds, endSeconds });
        await writeId3Tags(outputPath, {
          title: title.trim(),
          album: typeof album === "string" ? album.trim() : undefined,
          albumArtist: typeof albumArtist === "string" ? albumArtist.trim() : undefined,
          cover,
        });
        contentType = "audio/mpeg";
      }

      const stat = await fs.promises.stat(outputPath);
      const stats = await probeMedia(outputPath);

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", stat.size);
      res.setHeader(
        "Content-Disposition",
        contentDispositionFor(`${title.trim()}.${outputFormat}`),
      );
      if (stats) {
        res.setHeader("X-Stat-Duration", String(stats.durationSeconds));
        res.setHeader("X-Stat-Bitrate", String(stats.bitrateKbps));
        res.setHeader("X-Stat-Quality", stats.quality);
        res.setHeader(
          "Access-Control-Expose-Headers",
          "X-Stat-Duration, X-Stat-Bitrate, X-Stat-Quality",
        );
      }

      const stream = fs.createReadStream(outputPath);
      stream.pipe(res);
      res.on("close", cleanup);
      stream.on("error", (err) => {
        cleanup();
        next(err);
      });
    } catch (err) {
      cleanup();
      next(err);
    }
  },
);

// Central error handler. Kept as the last middleware per Express convention.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) return;

  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: `Upload error: ${err.message}` });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`youtube-mp3-backend listening on :${PORT}`);
});

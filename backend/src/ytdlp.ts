import fs from "node:fs/promises";
import path from "node:path";
import { COOKIES_PATH } from "./config";
import { run, type ExecResult } from "./exec";
import { AppError, mapYtDlpError } from "./errors";

export interface VideoInfo {
  id: string;
  title: string;
  uploader: string;
  thumbnail: string;
  duration: number;
}

function cookieArgs(): string[] {
  return COOKIES_PATH ? ["--cookies", COOKIES_PATH] : [];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs yt-dlp with the given args. YouTube's bot/JS-challenge check blocks the
 * default web client unpredictably on datacenter IPs without cookies -
 * research and testing both show it's flaky per-request, not a hard ban, so a
 * bare retry against it often just succeeds. If it keeps failing, fall back to
 * the Android client, which is exempt from that challenge but only exposes
 * lower-quality muxed formats (a quality-for-reliability tradeoff, tried last).
 * A genuinely bad URL (private/deleted video) fails identically every time, so
 * this only adds latency on real transient blocks.
 */
async function runYtDlpWithFallback(
  args: string[],
  url: string,
  timeoutMs: number,
): Promise<ExecResult> {
  let last: ExecResult | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await sleep(1500);
    last = await run("yt-dlp", [...args, ...cookieArgs(), url], { timeoutMs });
    if (last.code === 0) return last;
  }

  last = await run(
    "yt-dlp",
    [...args, "--extractor-args", "youtube:player_client=android", ...cookieArgs(), url],
    { timeoutMs },
  );

  return last;
}

interface RawYtDlpInfo {
  id: string;
  title: string;
  uploader?: string;
  channel?: string;
  thumbnail?: string;
  thumbnails?: { url: string; width?: number }[];
  duration?: number;
}

export async function getVideoInfo(url: string): Promise<VideoInfo> {
  const { stdout, stderr, code } = await runYtDlpWithFallback(
    ["--dump-single-json", "--no-warnings", "--no-playlist", "--skip-download"],
    url,
    60_000,
  );

  if (code !== 0) {
    throw mapYtDlpError(stderr);
  }

  let data: RawYtDlpInfo;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new AppError(502, "Couldn't read video details from yt-dlp.");
  }

  let thumbnail = data.thumbnail ?? "";
  if (data.thumbnails?.length) {
    const best = [...data.thumbnails].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    if (best?.url) thumbnail = best.url;
  }

  return {
    id: data.id,
    title: data.title,
    uploader: data.uploader ?? data.channel ?? "",
    thumbnail,
    duration: data.duration ?? 0,
  };
}

/**
 * Downloads the best available audio-only stream into workDir as
 * "audio.<ext>" and returns the resulting file path.
 */
export async function downloadBestAudio(url: string, workDir: string): Promise<string> {
  const outputTemplate = path.join(workDir, "audio.%(ext)s");

  const { stderr, code } = await runYtDlpWithFallback(
    ["-f", "bestaudio/best", "--no-playlist", "--no-warnings", "-o", outputTemplate],
    url,
    240_000,
  );

  if (code !== 0) {
    throw mapYtDlpError(stderr);
  }

  const files = await fs.readdir(workDir);
  const downloaded = files.find((f) => f.startsWith("audio."));
  if (!downloaded) {
    throw new AppError(502, "yt-dlp finished but produced no audio file.");
  }

  return path.join(workDir, downloaded);
}

/**
 * Downloads the best available video+audio into workDir as "video.<ext>" and
 * returns the resulting file path. Prefers separate best video/audio streams
 * merged into mp4 (needs ffmpeg, which the backend already has); falls back
 * to a single progressive stream when that's all a client (e.g. the Android
 * fallback) exposes.
 */
export async function downloadBestVideo(url: string, workDir: string): Promise<string> {
  const outputTemplate = path.join(workDir, "video.%(ext)s");

  const { stderr, code } = await runYtDlpWithFallback(
    [
      "-f",
      "bestvideo+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "--no-warnings",
      "-o",
      outputTemplate,
    ],
    url,
    240_000,
  );

  if (code !== 0) {
    throw mapYtDlpError(stderr);
  }

  const files = await fs.readdir(workDir);
  const downloaded = files.find((f) => f.startsWith("video."));
  if (!downloaded) {
    throw new AppError(502, "yt-dlp finished but produced no video file.");
  }

  return path.join(workDir, downloaded);
}

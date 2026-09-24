const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isValidYoutubeUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return false;
  }

  if (!YOUTUBE_HOSTS.has(url.hostname)) return false;

  if (url.hostname === "youtu.be") {
    return url.pathname.length > 1;
  }

  if (url.pathname === "/watch") {
    return url.searchParams.has("v");
  }

  return url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/");
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * Parses "ss", "mm:ss", or "hh:mm:ss" into total seconds. Returns null for
 * empty input (meaning "not set") and undefined for unparseable input, so
 * callers can tell "blank" apart from "invalid".
 */
export function parseTimeToSeconds(input: string): number | null | undefined {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) return undefined;

  const parts = trimmed.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return undefined;
  if (parts.slice(1).some((p) => p >= 60)) return undefined;

  let seconds = 0;
  for (const part of parts) {
    seconds = seconds * 60 + part;
  }
  return seconds;
}

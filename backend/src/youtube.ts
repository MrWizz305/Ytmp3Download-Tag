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

export class AppError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * yt-dlp's stderr text is the only signal we get for *why* extraction failed.
 * These patterns are matched against real-world yt-dlp error strings to turn
 * them into messages a non-technical UI can show directly.
 */
export function mapYtDlpError(stderr: string): AppError {
  const text = stderr.toLowerCase();

  if (text.includes("private video")) {
    return new AppError(403, "This video is private.");
  }
  if (text.includes("sign in to confirm") || text.includes("not a bot")) {
    return new AppError(
      429,
      "YouTube is blocking this request as automated traffic. Add browser cookies on the backend (see README) or try again shortly.",
    );
  }
  if (text.includes("age") && (text.includes("restrict") || text.includes("confirm"))) {
    return new AppError(
      403,
      "This video is age-restricted. Add cookies from a signed-in account on the backend to access it.",
    );
  }
  if (text.includes("video unavailable") || text.includes("this video is not available")) {
    return new AppError(404, "This video is unavailable or has been removed.");
  }
  if (text.includes("unsupported url") || text.includes("is not a valid url")) {
    return new AppError(400, "That doesn't look like a supported YouTube URL.");
  }
  if (text.includes("premieres in") || text.includes("live event will begin")) {
    return new AppError(400, "This video hasn't started yet.");
  }
  if (text.includes("members-only") || text.includes("join this channel")) {
    return new AppError(403, "This video is members-only content.");
  }

  return new AppError(502, "Couldn't extract audio from this video.");
}

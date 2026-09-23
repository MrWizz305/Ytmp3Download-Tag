import { AppError } from "./errors";
import { run } from "./exec";

export async function transcodeToMp3(inputPath: string, outputPath: string): Promise<void> {
  const { stderr, code } = await run(
    "ffmpeg",
    ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-b:a", "320k", outputPath],
    { timeoutMs: 240_000 },
  );

  if (code !== 0) {
    throw new AppError(502, `ffmpeg failed to convert the audio: ${stderr.slice(-500)}`);
  }
}

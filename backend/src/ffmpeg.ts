import { AppError } from "./errors";
import { run } from "./exec";

export interface TrimRange {
  startSeconds?: number;
  endSeconds?: number;
}

export async function transcodeToMp3(
  inputPath: string,
  outputPath: string,
  trim?: TrimRange,
): Promise<void> {
  const args = ["-y", "-i", inputPath, "-vn"];

  // -ss/-to placed after -i so both are accurate (decoded) seeks measured
  // against the original file's timeline, matching what the user typed.
  if (trim?.startSeconds !== undefined) args.push("-ss", String(trim.startSeconds));
  if (trim?.endSeconds !== undefined) args.push("-to", String(trim.endSeconds));

  args.push("-acodec", "libmp3lame", "-b:a", "320k", outputPath);

  const { stderr, code } = await run("ffmpeg", args, { timeoutMs: 240_000 });

  if (code !== 0) {
    throw new AppError(502, `ffmpeg failed to convert the audio: ${stderr.slice(-500)}`);
  }
}

/**
 * Trims/remuxes the downloaded video into a clean mp4 without re-encoding
 * (stream copy - fast and lossless on this box's limited CPU). The tradeoff:
 * a trim with -c copy can only cut on a keyframe boundary, so the actual clip
 * may start up to a couple seconds before the requested time. Re-encoding for
 * frame-exact cuts would be far slower on a shared-cpu-1x machine and isn't
 * worth it for a personal tool.
 */
export async function remuxVideoToMp4(
  inputPath: string,
  outputPath: string,
  title: string,
  trim?: TrimRange,
): Promise<void> {
  const args = ["-y"];

  // Input-seeking (-ss before -i) so the trim is fast (demuxer-level seek)
  // rather than decoding from the start of the file.
  if (trim?.startSeconds !== undefined) args.push("-ss", String(trim.startSeconds));
  args.push("-i", inputPath);
  if (trim?.startSeconds !== undefined && trim?.endSeconds !== undefined) {
    args.push("-t", String(Math.max(trim.endSeconds - trim.startSeconds, 0)));
  } else if (trim?.endSeconds !== undefined) {
    args.push("-t", String(trim.endSeconds));
  }

  args.push("-c", "copy", "-metadata", `title=${title}`, "-movflags", "+faststart", outputPath);

  const { stderr, code } = await run("ffmpeg", args, { timeoutMs: 240_000 });

  if (code !== 0) {
    throw new AppError(502, `ffmpeg failed to prepare the video: ${stderr.slice(-500)}`);
  }
}

export interface MediaStats {
  durationSeconds: number;
  bitrateKbps: number;
  quality: string;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_rate?: string;
  channels?: number;
  disposition?: { attached_pic?: number };
}

interface FfprobeOutput {
  format?: { duration?: string; bit_rate?: string };
  streams?: FfprobeStream[];
}

export async function probeMedia(filePath: string): Promise<MediaStats | null> {
  const { stdout, code } = await run(
    "ffprobe",
    ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
    { timeoutMs: 30_000 },
  );

  if (code !== 0) return null;

  try {
    const data: FfprobeOutput = JSON.parse(stdout);
    const durationSeconds = Number(data.format?.duration) || 0;
    const bitrateKbps = Math.round((Number(data.format?.bit_rate) || 0) / 1000);

    // Exclude attached-pic streams (embedded ID3 cover art shows up as its
    // own "video" stream in ffprobe) so an MP3's quality doesn't get
    // reported as the cover image's pixel dimensions.
    const videoStream = data.streams?.find(
      (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
    );
    const audioStream = data.streams?.find((s) => s.codec_type === "audio");

    let quality = "";
    if (videoStream?.width && videoStream?.height) {
      quality = `${videoStream.width}x${videoStream.height}`;
    } else if (audioStream?.sample_rate) {
      const khz = (Number(audioStream.sample_rate) / 1000).toFixed(1).replace(/\.0$/, "");
      const channels = audioStream.channels === 1 ? "Mono" : "Stereo";
      quality = `${khz}kHz ${channels}`;
    }

    return { durationSeconds, bitrateKbps, quality };
  } catch {
    return null;
  }
}

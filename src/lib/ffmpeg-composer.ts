import { execFile, spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = promisify(execFile);

export type ComposeVideoOptions = {
  scriptId: string;
  avatarVideoUrl: string;
  imgHookUrl: string;
  imgBodyUrl: string;
  imgCtaUrl: string;
  musicTrack: string;
  hookText: string;
  bodyText: string;
  ctaText: string;
};

type SubtitleOptions = {
  hookText: string;
  bodyText: string;
  ctaText: string;
  t1: number;
  t2: number;
  totalDuration: number;
  outputPath: string;
};

const DEFAULT_FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800";

export class FFmpegComposer {
  static async composeVideo(options: ComposeVideoOptions): Promise<string> {
    const ffmpegBin = resolveFfmpegBin();
    const outputDir = path.join(process.cwd(), "public", "videos");
    const outputPath = path.join(outputDir, `${options.scriptId}.mp4`);
    const outputUrl = `/videos/${options.scriptId}.mp4`;

    await fs.mkdir(outputDir, { recursive: true });

    if (await fileExists(outputPath)) {
      console.log(`[FFmpegComposer] Reusing existing video ${outputUrl}`);
      return outputUrl;
    }

    const tempDir = path.join(process.cwd(), ".tmp", "video-renders", options.scriptId);
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const avatarPath = path.join(tempDir, "avatar.mp4");
      const hookImagePath = path.join(tempDir, "hook.jpg");
      const bodyImagePath = path.join(tempDir, "body.jpg");
      const ctaImagePath = path.join(tempDir, "cta.jpg");
      const musicPath = path.join(tempDir, "music.mp3");
      const subtitlesPath = path.join(tempDir, "subs.ass");

      await resolveMedia(options.avatarVideoUrl, avatarPath);
      await resolveImage(options.imgHookUrl, hookImagePath);
      await resolveImage(options.imgBodyUrl, bodyImagePath);
      await resolveImage(options.imgCtaUrl, ctaImagePath);

      const hasMusic = Boolean(options.musicTrack && options.musicTrack !== "default");
      if (hasMusic) {
        await resolveMedia(options.musicTrack, musicPath);
      }

      const duration = await getMediaDuration(ffmpegBin, avatarPath);
      const { t1, t2 } = calculateSectionTimings({
        hookText: options.hookText,
        bodyText: options.bodyText,
        ctaText: options.ctaText,
        duration,
      });

      await FFmpegComposer.generateSubtitlesAssFile({
        hookText: options.hookText,
        bodyText: options.bodyText,
        ctaText: options.ctaText,
        t1,
        t2,
        totalDuration: duration,
        outputPath: subtitlesPath,
      });

      const filterGraph = buildFilterGraph({ t1, t2, hasMusic });
      const ffmpegArgs = [
        "-y",
        "-loop",
        "1",
        "-t",
        duration.toFixed(3),
        "-i",
        "hook.jpg",
        "-loop",
        "1",
        "-t",
        duration.toFixed(3),
        "-i",
        "body.jpg",
        "-loop",
        "1",
        "-t",
        duration.toFixed(3),
        "-i",
        "cta.jpg",
        "-i",
        "avatar.mp4",
        ...(hasMusic ? ["-stream_loop", "-1", "-i", "music.mp3"] : []),
        "-filter_complex",
        filterGraph,
        "-map",
        "[v]",
        "-map",
        "[a]",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-shortest",
        outputPath,
      ];

      await runFfmpeg(ffmpegBin, ffmpegArgs, tempDir);
      return outputUrl;
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  public static async resolveImage(imgUrlOrPath: string, destPath: string): Promise<void> {
    await resolveImage(imgUrlOrPath, destPath);
  }

  public static async generateSubtitlesAssFile(options: SubtitleOptions): Promise<void> {
    const content = `[Script Info]
Title: Los 5 Apostoles subtitles
ScriptType: v4.00+
PlayResX: 720
PlayResY: 1280

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,26,&H00FFFFFF,&H0000FFFF,&H00000000,&H60000000,-1,0,0,0,100,100,0,0,3,1,1,2,40,40,90,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${formatAssTime(0)},${formatAssTime(options.t1)},Default,,0,0,0,,${escapeAssText(options.hookText)}
Dialogue: 0,${formatAssTime(options.t1)},${formatAssTime(options.t2)},Default,,0,0,0,,${escapeAssText(options.bodyText)}
Dialogue: 0,${formatAssTime(options.t2)},${formatAssTime(options.totalDuration)},Default,,0,0,0,,${escapeAssText(options.ctaText)}
`;

    await fs.writeFile(options.outputPath, content, "utf8");
  }
}

function buildFilterGraph({ t1, t2, hasMusic }: { t1: number; t2: number; hasMusic: boolean }): string {
  const safeT1 = Number.isFinite(t1) ? Math.max(0.1, t1) : 3;
  const safeT2 = Number.isFinite(t2) ? Math.max(safeT1 + 0.1, t2) : 12;
  const parts = [
    "[0:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,setsar=1[img1]",
    "[1:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,setsar=1[img2]",
    "[2:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720,setsar=1[img3]",
    `[img1][img2]overlay=enable='gte(t,${safeT1.toFixed(3)})'[img12]`,
    `[img12][img3]overlay=enable='gte(t,${safeT2.toFixed(3)})'[slideshow]`,
    "[3:v]scale=720:560:force_original_aspect_ratio=increase,crop=720:560,setsar=1[avatar]",
    "[slideshow][avatar]vstack=inputs=2[stacked]",
    "[stacked]subtitles=subs.ass[v]",
  ];

  if (hasMusic) {
    parts.push("[3:a]volume=1.0[voice_audio]");
    parts.push("[4:a]volume=0.12[bg_audio]");
    parts.push("[voice_audio][bg_audio]amix=inputs=2:duration=first:dropout_transition=0[a]");
  } else {
    parts.push("[3:a]volume=1.0[a]");
  }

  return parts.join(";");
}

function calculateSectionTimings(options: {
  hookText: string;
  bodyText: string;
  ctaText: string;
  duration: number;
}): { t1: number; t2: number } {
  const hookWords = countWords(options.hookText);
  const bodyWords = countWords(options.bodyText);
  const ctaWords = countWords(options.ctaText);
  const totalWords = hookWords + bodyWords + ctaWords;
  const duration = Math.max(3, options.duration || 15);
  const t1 = (hookWords / totalWords) * duration;
  const t2 = t1 + (bodyWords / totalWords) * duration;
  return { t1, t2 };
}

function countWords(text: string): number {
  return Math.max(1, text.trim().split(/\s+/).filter(Boolean).length);
}

function resolveFfmpegBin(): string {
  const explicit = process.env.FFMPEG_BIN?.trim();
  if (explicit) return explicit;
  if (!ffmpegStatic) {
    throw new Error("ffmpeg-static did not provide a binary for this platform.");
  }
  return ffmpegStatic;
}

async function resolveImage(input: string, destPath: string): Promise<void> {
  try {
    await resolveMedia(input || DEFAULT_FALLBACK_IMAGE, destPath);
  } catch (error) {
    if ((input || "") === DEFAULT_FALLBACK_IMAGE) throw error;
    await resolveMedia(DEFAULT_FALLBACK_IMAGE, destPath);
  }
}

async function resolveMedia(input: string, destPath: string): Promise<void> {
  const value = input.trim();
  if (!value) throw new Error(`Empty media input for ${destPath}`);

  if (value.startsWith("http://") || value.startsWith("https://")) {
    await downloadFile(value, destPath);
    return;
  }

  const localPath = resolveLocalPath(value);
  if (!localPath) {
    throw new Error(`Unsupported media input: ${value}`);
  }

  await fs.copyFile(localPath, destPath);
}

function resolveLocalPath(value: string): string | null {
  if (value.startsWith("/")) {
    return path.join(process.cwd(), "public", value);
  }

  const maybeAbsolute = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
  return maybeAbsolute;
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; pcmidi-video-renderer/1.0)" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  } finally {
    clearTimeout(timeout);
  }
}

async function getMediaDuration(ffmpegBin: string, mediaPath: string): Promise<number> {
  try {
    await execFileAsync(ffmpegBin, ["-i", mediaPath]);
  } catch (error: any) {
    const stderr = String(error?.stderr || "");
    const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (match) {
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      const seconds = Number(match[3]);
      const hundredths = Number(match[4]);
      return hours * 3600 + minutes * 60 + seconds + hundredths / 100;
    }
  }
  return 15;
}

async function runFfmpeg(ffmpegBin: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegBin, args, { cwd, windowsHide: true });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function formatAssTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds % 1) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

function escapeAssText(text: string): string {
  return text
    .replace(/\r?\n/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "\\\\")
    .trim();
}

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import ffmpegStatic from "ffmpeg-static";

export type LocalAvatarRenderOptions = {
  scriptId: string;
  text: string;
  voiceId: string;
  avatarSource?: string | null;
  outputPath?: string;
  mode?: "wav2lip" | "loop";
  fallbackMode?: "loop";
};

export type LocalAvatarRenderResult = {
  outputPath: string;
  outputUrl: string;
  mode: "wav2lip" | "loop";
  fallbackUsed: boolean;
  logs: string;
};

type AttemptResult = {
  logs: string;
};

export class LocalAvatarRenderer {
  static async render(options: LocalAvatarRenderOptions): Promise<LocalAvatarRenderResult> {
    const mode = normalizeMode(options.mode || process.env.LOCAL_AVATAR_MODE || "wav2lip");
    const fallbackMode = normalizeFallbackMode(options.fallbackMode || process.env.LOCAL_AVATAR_FALLBACK_MODE || "loop");
    const outputPath =
      options.outputPath ||
      path.join(resolveOutputDir(), `${options.scriptId}_avatar.mp4`);
    const outputUrl = toPublicVideoUrl(outputPath);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });

    try {
      const attempt = await runRenderer({
        ...options,
        mode,
        outputPath,
      });
      return {
        outputPath,
        outputUrl,
        mode,
        fallbackUsed: false,
        logs: attempt.logs,
      };
    } catch (error: any) {
      const firstError = error?.message || String(error);
      if (mode === fallbackMode) {
        throw new Error(firstError);
      }

      console.warn(`[LocalAvatarRenderer] ${mode} failed, retrying with ${fallbackMode}: ${firstError}`);
      const fallback = await runRenderer({
        ...options,
        mode: fallbackMode,
        outputPath,
      });

      return {
        outputPath,
        outputUrl,
        mode: fallbackMode,
        fallbackUsed: true,
        logs: `${firstError}\n\n--- fallback logs ---\n${fallback.logs}`,
      };
    }
  }
}

async function runRenderer(options: Required<Pick<LocalAvatarRenderOptions, "scriptId" | "text" | "voiceId">> & {
  avatarSource?: string | null;
  outputPath: string;
  mode: "wav2lip" | "loop";
}): Promise<AttemptResult> {
  const pythonBin = process.env.PYTHON_BIN?.trim() || "python";
  const scriptPath = path.join(process.cwd(), "agents", "render-avatar-local.py");
  const ffmpegBin = process.env.FFMPEG_BIN?.trim() || ffmpegStatic || "ffmpeg";

  const args = [
    scriptPath,
    "--text",
    options.text,
    "--voice",
    options.voiceId,
    "--avatar",
    options.avatarSource || "",
    "--mode",
    options.mode,
    "--output",
    options.outputPath,
    "--ffmpeg-path",
    ffmpegBin,
  ];

  const wav2lipScript = process.env.WAV2LIP_INFERENCE_SCRIPT?.trim();
  if (wav2lipScript) {
    args.push("--wav2lip-script", wav2lipScript);
  }

  const wav2lipModel = process.env.WAV2LIP_MODEL_PATH?.trim();
  if (wav2lipModel) {
    args.push("--wav2lip-model", wav2lipModel);
  }

  return await new Promise<AttemptResult>((resolve, reject) => {
    const child = spawn(pythonBin, args, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FFMPEG_BIN: ffmpegBin,
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const logs = `${stdout}\n${stderr}`.trim();
      if (code === 0) {
        resolve({ logs });
        return;
      }
      reject(new Error(`local avatar renderer exited with code ${code}: ${logs.slice(-4000)}`));
    });
  });
}

function normalizeMode(value: string): "wav2lip" | "loop" {
  return value === "loop" ? "loop" : "wav2lip";
}

function normalizeFallbackMode(value: string): "loop" {
  return "loop";
}

function resolveOutputDir(): string {
  const configured = process.env.LOCAL_VIDEO_OUTPUT_DIR?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  }
  return path.join(process.cwd(), "public", "videos");
}

function toPublicVideoUrl(outputPath: string): string {
  const publicDir = path.join(process.cwd(), "public");
  const relative = path.relative(publicDir, outputPath).replace(/\\/g, "/");
  if (!relative.startsWith("..")) {
    return `/${relative}`;
  }
  return outputPath;
}

import argparse
import asyncio
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}

DEFAULT_AVATARS = {
    "male": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=800",
    "female": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=800",
}


def log(message: str) -> None:
    print(f"[local-avatar] {message}", flush=True)


def fail(message: str, code: int = 1) -> None:
    print(f"[local-avatar:error] {message}", file=sys.stderr, flush=True)
    raise SystemExit(code)


def run_command(args: list[str], cwd: str | None = None) -> None:
    log("running: " + " ".join(args))
    completed = subprocess.run(args, cwd=cwd, text=True)
    if completed.returncode != 0:
        fail(f"command failed with exit code {completed.returncode}: {args[0]}")


async def generate_voice_over(text: str, voice_id: str, output_audio_path: Path) -> None:
    try:
        import edge_tts
    except ImportError:
        fail("edge-tts is not installed. Install it with: pip install edge-tts")

    communicate = edge_tts.Communicate(text, voice_id)
    await communicate.save(str(output_audio_path))


def get_duration_with_ffmpeg(ffmpeg_path: str, media_path: Path) -> float:
    completed = subprocess.run(
        [ffmpeg_path, "-i", str(media_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+)\.(\d+)", completed.stderr)
    if not match:
        return 15.0

    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = int(match.group(3))
    hundredths = int(match.group(4)[:2])
    return hours * 3600 + minutes * 60 + seconds + hundredths / 100


def download_file(url: str, dest_path: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=45) as response:
        dest_path.write_bytes(response.read())


def public_url_to_path(value: str) -> Path | None:
    if value.startswith("/"):
        return Path.cwd() / "public" / value.lstrip("/")
    return None


def resolve_avatar_source(avatar: str, voice_id: str, temp_dir: Path) -> Path:
    source = avatar.strip()
    if source.startswith("/"):
        local_public = public_url_to_path(source)
        if local_public and local_public.exists():
            return local_public

    if source and source.startswith(("http://", "https://")):
        suffix = Path(source.split("?", 1)[0]).suffix.lower()
        dest = temp_dir / f"avatar_remote{suffix if suffix in VIDEO_EXTENSIONS | IMAGE_EXTENSIONS else '.jpg'}"
        log(f"downloading avatar source: {source}")
        download_file(source, dest)
        return dest

    if source:
        local = Path(source)
        if not local.is_absolute():
            local = Path.cwd() / local
        if local.exists():
            return local

    voice_lower = voice_id.lower()
    gender = "female" if any(token in voice_lower for token in ("elena", "dalia", "elvira", "sofia")) else "male"
    dest = temp_dir / "avatar_fallback.jpg"
    log(f"using fallback {gender} avatar image")
    download_file(DEFAULT_AVATARS[gender], dest)
    return dest


def render_loop_mode(ffmpeg_path: str, avatar_source: Path, audio_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = avatar_source.suffix.lower()

    if suffix in VIDEO_EXTENSIONS:
        args = [
            ffmpeg_path,
            "-y",
            "-stream_loop",
            "-1",
            "-i",
            str(avatar_source),
            "-i",
            str(audio_path),
            "-shortest",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            "scale=720:560:force_original_aspect_ratio=increase,crop=720:560,setsar=1",
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
            str(output_path),
        ]
    else:
        duration = get_duration_with_ffmpeg(ffmpeg_path, audio_path)
        args = [
            ffmpeg_path,
            "-y",
            "-loop",
            "1",
            "-i",
            str(avatar_source),
            "-i",
            str(audio_path),
            "-t",
            f"{duration:.2f}",
            "-shortest",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-vf",
            "scale=720:560:force_original_aspect_ratio=increase,crop=720:560,setsar=1",
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
            str(output_path),
        ]

    run_command(args)


def render_wav2lip_mode(args: argparse.Namespace, avatar_source: Path, audio_path: Path, output_path: Path) -> None:
    inference_script = args.wav2lip_script or os.environ.get("WAV2LIP_INFERENCE_SCRIPT", "")
    model_path = args.wav2lip_model or os.environ.get("WAV2LIP_MODEL_PATH", "")

    if not inference_script:
        default_script = Path.cwd() / "models" / "wav2lip" / "inference.py"
        if default_script.exists():
            inference_script = str(default_script)

    if not model_path:
        default_model = Path.cwd() / "models" / "wav2lip" / "wav2lip_gan.pth"
        if default_model.exists():
            model_path = str(default_model)

    if not inference_script or not Path(inference_script).exists():
        fail("Wav2Lip inference script not found. Set WAV2LIP_INFERENCE_SCRIPT or place models/wav2lip/inference.py.")

    if not model_path or not Path(model_path).exists():
        fail("Wav2Lip model not found. Set WAV2LIP_MODEL_PATH or place models/wav2lip/wav2lip_gan.pth.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    python_bin = args.python_bin or sys.executable
    wav2lip_args = [
        python_bin,
        str(Path(inference_script)),
        "--checkpoint_path",
        str(Path(model_path)),
        "--face",
        str(avatar_source),
        "--audio",
        str(audio_path),
        "--outfile",
        str(output_path),
    ]

    if args.wav2lip_static and avatar_source.suffix.lower() in IMAGE_EXTENSIONS:
        wav2lip_args.append("--static")

    run_command(wav2lip_args)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Local commercial avatar renderer with Edge TTS, Wav2Lip and FFmpeg.")
    parser.add_argument("--text", required=True, help="Script text to synthesize.")
    parser.add_argument("--voice", default="es-AR-TomasNeural", help="Edge TTS voice ID.")
    parser.add_argument("--avatar", default="", help="Avatar template image/video path, public URL path, or remote URL.")
    parser.add_argument("--template", default="", help="Alias for --avatar.")
    parser.add_argument("--mode", choices=["wav2lip", "loop"], default=os.environ.get("LOCAL_AVATAR_MODE", "wav2lip"))
    parser.add_argument("--output", required=True, help="Output MP4 path.")
    parser.add_argument("--ffmpeg-path", default=os.environ.get("FFMPEG_BIN", "ffmpeg"))
    parser.add_argument("--python-bin", default=sys.executable)
    parser.add_argument("--wav2lip-script", default=os.environ.get("WAV2LIP_INFERENCE_SCRIPT", ""))
    parser.add_argument("--wav2lip-model", default=os.environ.get("WAV2LIP_MODEL_PATH", ""))
    parser.add_argument("--wav2lip-static", action="store_true", help="Pass --static to Wav2Lip for image inputs.")
    parser.add_argument("--keep-temp", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_path = Path(args.output)
    avatar_value = args.avatar or args.template

    ffmpeg_bin = args.ffmpeg_path
    if not shutil.which(ffmpeg_bin) and not Path(ffmpeg_bin).exists():
        fail(f"FFmpeg binary not found: {ffmpeg_bin}")

    temp_parent = Path.cwd() / ".tmp" / "local-avatar-renders"
    temp_parent.mkdir(parents=True, exist_ok=True)
    temp_dir_path = Path(tempfile.mkdtemp(prefix="render-", dir=temp_parent))

    try:
        audio_path = temp_dir_path / "voice.mp3"
        log(f"generating voice with {args.voice}")
        asyncio.run(generate_voice_over(args.text, args.voice, audio_path))

        if not audio_path.exists() or audio_path.stat().st_size == 0:
            fail("voice generation produced an empty audio file")

        avatar_source = resolve_avatar_source(avatar_value, args.voice, temp_dir_path)
        log(f"render mode: {args.mode}")

        if args.mode == "wav2lip":
            render_wav2lip_mode(args, avatar_source, audio_path, output_path)
        else:
            render_loop_mode(ffmpeg_bin, avatar_source, audio_path, output_path)

        if not output_path.exists() or output_path.stat().st_size == 0:
            fail("renderer produced an empty output file")

        log(f"done: {output_path}")
    finally:
        if not args.keep_temp:
            shutil.rmtree(temp_dir_path, ignore_errors=True)


if __name__ == "__main__":
    main()

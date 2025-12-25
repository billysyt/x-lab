from __future__ import annotations

import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional, List, Dict, Any

from native_config import get_models_dir, get_bundle_dir

logger = logging.getLogger(__name__)


def _platform_exe_name(base: str) -> str:
    if os.name == "nt" and not base.endswith(".exe"):
        return f"{base}.exe"
    return base


def resolve_whisper_engine() -> Optional[Path]:
    env_path = os.environ.get("XCAPTION_WHISPER_ENGINE") or os.environ.get("XSUB_WHISPER_ENGINE")
    candidates: List[Path] = []
    if env_path:
        candidates.append(Path(env_path))

    models_dir = get_models_dir()
    candidates.append(models_dir / "whisper" / _platform_exe_name("engine"))
    candidates.append(models_dir / "whisper" / _platform_exe_name("whisper"))

    bundle_dir = get_bundle_dir()
    candidates.append(bundle_dir / "whisper" / _platform_exe_name("engine"))
    candidates.append(bundle_dir / "whisper" / _platform_exe_name("whisper"))
    candidates.append(bundle_dir / "Resources" / "whisper" / _platform_exe_name("engine"))
    candidates.append(bundle_dir / "whisper" / "video.mjs")
    candidates.append(bundle_dir / "Resources" / "whisper" / "video.mjs")

    for candidate in candidates:
        if candidate and candidate.exists() and candidate.is_file():
            return candidate
    return None


def resolve_whisper_model(model_path: Optional[str] = None) -> Optional[Path]:
    if model_path:
        candidate = Path(model_path)
        if candidate.exists() and candidate.is_file():
            return candidate
        if not candidate.is_absolute():
            local_candidate = get_models_dir() / "whisper" / candidate
            if local_candidate.exists() and local_candidate.is_file():
                return local_candidate

    default_model = get_models_dir() / "whisper" / "model.bin"
    if default_model.exists() and default_model.is_file():
        return default_model

    bundle_candidate = get_bundle_dir() / "whisper" / "model.bin"
    if bundle_candidate.exists() and bundle_candidate.is_file():
        return bundle_candidate

    return None


def _parse_srt_timestamp(value: str) -> Optional[float]:
    try:
        parts = value.replace(",", ":").split(":")
        if len(parts) != 4:
            return None
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(parts[2])
        millis = int(parts[3])
        return hours * 3600 + minutes * 60 + seconds + (millis / 1000.0)
    except Exception:
        return None


def _parse_time_string(value: str) -> Optional[float]:
    raw = (value or "").strip()
    if not raw:
        return None
    cleaned = raw.replace(",", ".")
    if ":" in cleaned:
        parts = cleaned.split(":")
        try:
            nums = [float(part) for part in parts]
        except Exception:
            return None
        if len(nums) == 3:
            hours, minutes, seconds = nums
        elif len(nums) == 2:
            hours = 0.0
            minutes, seconds = nums
        elif len(nums) == 1:
            hours = 0.0
            minutes = 0.0
            seconds = nums[0]
        else:
            return None
        return (hours * 3600.0) + (minutes * 60.0) + seconds
    try:
        return float(cleaned)
    except Exception:
        return None


def _coerce_time(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        parsed = _parse_time_string(value)
        return float(parsed) if parsed is not None else 0.0
    return 0.0


def _parse_srt_segments(srt_text: str) -> List[Dict[str, Any]]:
    segments: List[Dict[str, Any]] = []
    blocks = [block.strip() for block in srt_text.strip().split("\n\n") if block.strip()]
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if len(lines) < 2:
            continue
        time_line = lines[1] if "-->" in lines[1] else lines[0]
        if "-->" not in time_line:
            continue
        time_parts = [part.strip() for part in time_line.split("-->")]
        if len(time_parts) != 2:
            continue
        start = _parse_srt_timestamp(time_parts[0])
        end = _parse_srt_timestamp(time_parts[1])
        if start is None or end is None:
            continue
        text_lines = lines[2:] if "-->" in lines[1] else lines[1:]
        text = " ".join(text_lines).strip()
        segments.append({"start": float(start), "end": float(end), "text": text})
    return segments


def transcribe_whisper_cpp(
    audio_path: Path | str,
    *,
    model_path: Optional[str] = None,
    language: Optional[str] = None,
    output_dir: Optional[Path] = None,
    progress_callback=None,
) -> Dict[str, Any]:
    engine = resolve_whisper_engine()
    if not engine:
        raise RuntimeError(
            "Whisper engine not found. Place a whisper.cpp binary at data/models/whisper/engine, "
            "or add whisper/video.mjs with its native addon, or set XCAPTION_WHISPER_ENGINE to the path."
        )

    model_file = resolve_whisper_model(model_path)
    if not model_file:
        raise RuntimeError(
            "Whisper model not found. Place model.bin in data/models/whisper/ or pass a model path."
        )

    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    if output_dir is None:
        output_dir = Path.cwd()
    output_dir.mkdir(parents=True, exist_ok=True)

    output_prefix = output_dir / "whisper"
    json_path = output_prefix.with_suffix(".json")
    srt_path = output_prefix.with_suffix(".srt")
    txt_path = output_prefix.with_suffix(".txt")

    if progress_callback:
        progress_callback(15, "Starting Whisper transcription")

    if engine.suffix.lower() == ".mjs":
        json_marker = "__XCAPTION_JSON__"
        legacy_marker = "__XSUB_JSON__"
        node_script = f"""
import {{ pathToFileURL }} from 'url';
const moduleUrl = pathToFileURL({json.dumps(str(engine))}).href;
const {{ transcribeAudio }} = await import(moduleUrl);
const result = await transcribeAudio({json.dumps(str(audio_path))}, {{
  model: {json.dumps(str(model_file))},
  language: {json.dumps(language or 'auto')}
}});
console.log('{json_marker}' + JSON.stringify(result));
""".strip()
        cmd = ["node", "--input-type=module", "-e", node_script]
        logger.info("Running whisper node runner: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            details = stderr or stdout or "Unknown error"
            raise RuntimeError(f"Whisper node runner failed: {details}")

        parsed = None
        for line in (result.stdout or "").splitlines()[::-1]:
            if json_marker in line or legacy_marker in line:
                marker = json_marker if json_marker in line else legacy_marker
                payload = line.split(marker, 1)[-1].strip()
                try:
                    parsed = json.loads(payload)
                    break
                except Exception:
                    continue
        if parsed is None:
            raise RuntimeError("Whisper node runner returned no JSON output")

        if isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except Exception:
                pass

        segments: List[Dict[str, Any]] = []
        detected_language = None
        if isinstance(parsed, dict):
            detected_language = parsed.get("language")
            raw_segments = parsed.get("segments") or parsed.get("result") or parsed.get("transcription") or []
            if isinstance(raw_segments, list):
                for seg in raw_segments:
                    if isinstance(seg, (list, tuple)) and len(seg) >= 3:
                        segments.append({
                            "start": _coerce_time(seg[0]),
                            "end": _coerce_time(seg[1]),
                            "text": str(seg[2]).strip(),
                        })
                    elif isinstance(seg, dict):
                        start = seg.get("start", seg.get("from", 0.0))
                        end = seg.get("end", seg.get("to", 0.0))
                        text = seg.get("text") or seg.get("text_segment") or seg.get("content") or ""
                        segments.append({
                            "start": _coerce_time(start),
                            "end": _coerce_time(end),
                            "text": str(text).strip(),
                        })
        elif isinstance(parsed, list):
            for seg in parsed:
                if isinstance(seg, (list, tuple)) and len(seg) >= 3:
                    segments.append({
                        "start": _coerce_time(seg[0]),
                        "end": _coerce_time(seg[1]),
                        "text": str(seg[2]).strip(),
                    })

        if not segments and srt_path.exists():
            try:
                srt_text = srt_path.read_text(encoding="utf-8", errors="ignore")
                segments = _parse_srt_segments(srt_text)
            except Exception:
                pass

        transcript_text = " ".join([seg["text"] for seg in segments]).strip()
        duration = None
        if segments:
            duration = max(seg.get("end", 0.0) for seg in segments)

        if txt_path.exists() and not transcript_text:
            try:
                transcript_text = txt_path.read_text(encoding="utf-8", errors="ignore").strip()
            except Exception:
                pass

        if progress_callback:
            progress_callback(90, "Finalizing Whisper transcript")

        return {
            "segments": segments,
            "text": transcript_text,
            "language": detected_language or language or "auto",
            "duration": duration,
        }

    cmd = [
        str(engine),
        "-m",
        str(model_file),
        "-f",
        str(audio_path),
        "-of",
        str(output_prefix),
        "-osrt",
        "-otxt",
        "-oj",
    ]
    if language and language not in {"auto", ""}:
        cmd.extend(["-l", language])

    logger.info("Running whisper.cpp: %s", " ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 and "-oj" in cmd:
        fallback_cmd = [arg for arg in cmd if arg != "-oj"]
        result = subprocess.run(fallback_cmd, capture_output=True, text=True)

    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        details = stderr or stdout or "Unknown error"
        raise RuntimeError(f"Whisper engine failed: {details}")

    segments: List[Dict[str, Any]] = []
    detected_language = None

    if json_path.exists():
        try:
            with json_path.open("r", encoding="utf-8") as f:
                payload = json.load(f)
            detected_language = payload.get("language")
            raw_segments = payload.get("segments") or []
            for seg in raw_segments:
                segments.append({
                    "start": _coerce_time(seg.get("start", 0.0)),
                    "end": _coerce_time(seg.get("end", 0.0)),
                    "text": str(seg.get("text", "")).strip(),
                })
        except Exception as exc:
            logger.warning("Failed to parse whisper JSON output: %s", exc)

    if not segments and srt_path.exists():
        try:
            srt_text = srt_path.read_text(encoding="utf-8", errors="ignore")
            segments = _parse_srt_segments(srt_text)
        except Exception as exc:
            logger.warning("Failed to parse whisper SRT output: %s", exc)

    if progress_callback:
        progress_callback(90, "Finalizing Whisper transcript")

    transcript_text = " ".join([seg["text"] for seg in segments]).strip()
    duration = None
    if segments:
        duration = max(seg.get("end", 0.0) for seg in segments)

    if txt_path.exists() and not transcript_text:
        try:
            transcript_text = txt_path.read_text(encoding="utf-8", errors="ignore").strip()
        except Exception:
            pass

    return {
        "segments": segments,
        "text": transcript_text,
        "language": detected_language or language or "auto",
        "duration": duration,
    }


def whisper_available() -> bool:
    return resolve_whisper_model() is not None

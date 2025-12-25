#!/usr/bin/env python3
"""
Native job handlers - lightweight, offline transcription pipeline for X-Caption.
Uses native_job_queue instead of Redis/RQ.
"""
from __future__ import annotations

import contextlib
import json
import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
import traceback
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, Optional, Tuple

import soundfile as sf

from whisper_cpp_runtime import transcribe_whisper_cpp, resolve_whisper_model

from native_config import get_models_dir, get_transcriptions_dir, get_uploads_dir, setup_environment
from native_ffmpeg import get_ffmpeg_path, get_audio_duration
import native_history

setup_environment()

logger = logging.getLogger(__name__)

_VIDEO_EXTENSIONS = {".mp4", ".m4v", ".mov", ".mkv", ".avi", ".flv", ".mpg", ".mpeg", ".webm"}
_ALWAYS_TRANSCODE_AUDIO = {".m4a", ".aac", ".opus", ".weba"}

_NOISE_SUPPRESSION_ENV = "XCAPTION_NOISE_SUPPRESSION"
_NOISE_SUPPRESSION_LEGACY_ENV = "XSUB_NOISE_SUPPRESSION"
_RNNOISE_MODEL_ENV = "XCAPTION_RNNOISE_MODEL"
_RNNOISE_MODEL_LEGACY_ENV = "XSUB_RNNOISE_MODEL"
_RNNOISE_MIX_ENV = "XCAPTION_RNNOISE_MIX"
_RNNOISE_MIX_LEGACY_ENV = "XSUB_RNNOISE_MIX"


def _env_with_legacy(name: str, legacy: str) -> Optional[str]:
    return os.environ.get(name) or os.environ.get(legacy)


def _can_decode_with_soundfile(path: Path) -> bool:
    try:
        with sf.SoundFile(str(path)) as sound_file:
            return sound_file.frames > 0 and sound_file.channels > 0
    except Exception:
        return False


def _noise_suppression_backend(value: Optional[str] = None) -> str:
    raw_value = value if value is not None else (_env_with_legacy(_NOISE_SUPPRESSION_ENV, _NOISE_SUPPRESSION_LEGACY_ENV) or "none")
    normalized = (raw_value or "").strip().lower()

    if normalized in {"0", "false", "no", "off", "none", "disable", "disabled", ""}:
        return "none"
    if normalized in {"1", "true", "yes", "on"}:
        return "rnnoise"
    if normalized in {"rnnoise", "arnndn"}:
        return "rnnoise"
    if normalized == "afftdn":
        return "afftdn"
    if normalized == "anlmdn":
        return "anlmdn"

    logger.warning(
        "Unknown %s=%r; defaulting to 'rnnoise'",
        _NOISE_SUPPRESSION_ENV,
        raw_value,
    )
    return "rnnoise"


def _normalized_audio_filename(job_id: str) -> str:
    return f"{job_id}_normalized.wav"


def _ffmpeg_escape_filter_path(path: Path) -> str:
    """Escape a filesystem path so it can be embedded in an FFmpeg filter argument."""
    value = str(path).replace("\\", "/")
    # FFmpeg uses ':' to separate filter options; Windows absolute paths must escape ':'.
    return value.replace(":", "\\\\:")


def _parse_env_float(name: str, default: float, *, legacy: Optional[str] = None) -> float:
    raw_value = os.environ.get(name)
    if (raw_value is None or raw_value == "") and legacy:
        raw_value = os.environ.get(legacy)
    if raw_value is None or raw_value == "":
        return default
    try:
        return float(raw_value)
    except (TypeError, ValueError):
        return default


def _rnnoise_model_path() -> Optional[Path]:
    model_name = (_env_with_legacy(_RNNOISE_MODEL_ENV, _RNNOISE_MODEL_LEGACY_ENV) or "std.rnnn").strip()
    if not model_name:
        model_name = "std.rnnn"

    candidate = Path(model_name)
    if candidate.is_absolute():
        path = candidate
    else:
        path = get_models_dir() / "rnnoise" / model_name

    if not path.exists():
        logger.warning(
            "RNNoise model not found at %s (env %s=%r); arnndn will be skipped",
            path,
            _RNNOISE_MODEL_ENV,
            model_name,
        )
        return None
    return path


def _build_noise_suppression_filter(backend: str) -> Optional[str]:
    backend = (backend or "").strip().lower()
    if backend in {"", "none"}:
        return None

    if backend == "rnnoise":
        model_path = _rnnoise_model_path()
        if model_path is None:
            return None

        mix = _parse_env_float(_RNNOISE_MIX_ENV, 1.0, legacy=_RNNOISE_MIX_LEGACY_ENV)
        if mix < -1.0:
            mix = -1.0
        elif mix > 1.0:
            mix = 1.0

        return f"arnndn=m={_ffmpeg_escape_filter_path(model_path)}:mix={mix}"

    if backend == "afftdn":
        return "afftdn=tn=1:tr=1"

    if backend == "anlmdn":
        return "anlmdn"

    return None


@contextlib.contextmanager
def _noise_suppressed_audio(
    source_path: Path,
    *,
    job_id: str,
    backend: Optional[str] = None,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> Iterable[Path]:
    resolved_backend = _noise_suppression_backend(backend)
    if resolved_backend in {"", "none"}:
        yield source_path
        return

    noise_filter = _build_noise_suppression_filter(resolved_backend)
    if not noise_filter:
        yield source_path
        return

    temp_dir = Path(tempfile.mkdtemp(prefix=f"xsub_denoise_{job_id}_"))
    output_path = temp_dir / f"{job_id}_denoised.wav"

    ffmpeg_path = get_ffmpeg_path()
    base_cmd = [
        ffmpeg_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
    ]

    def _run(filter_str: Optional[str]):
        cmd = base_cmd.copy()
        if filter_str:
            cmd += ["-af", filter_str]
        cmd += [
            "-acodec",
            "pcm_s16le",
            "-ac",
            "1",
            "-ar",
            "16000",
            str(output_path),
        ]
        return subprocess.run(cmd, capture_output=True, text=True)

    if progress_callback:
        progress_callback("Applying noise suppression...", 0)

    try:
        process = _run(noise_filter)
        if process.returncode != 0:
            error_output = (process.stderr or process.stdout or "").strip()
            if resolved_backend == "rnnoise":
                logger.warning("RNNoise failed for %s: %s", source_path, error_output)
                process = _run(_build_noise_suppression_filter("afftdn"))
            if process.returncode != 0:
                error_output = (process.stderr or process.stdout or "").strip()
                logger.warning(
                    "Noise suppression (%s) failed for %s: %s; continuing without denoise",
                    resolved_backend,
                    source_path,
                    error_output,
                )
                yield source_path
                return

        if not output_path.exists():
            logger.warning("Noise suppression output missing for %s; continuing without denoise", source_path)
            yield source_path
            return

        yield output_path
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def _prepare_audio_for_processing(
    job_id: str,
    file_path: str,
    progress_callback: Optional[Callable[[str, int], None]] = None,
) -> Tuple[Path, bool]:
    source_path = Path(file_path).resolve()
    suffix = source_path.suffix.lower()

    needs_conversion = False
    if suffix in _VIDEO_EXTENSIONS or suffix in _ALWAYS_TRANSCODE_AUDIO:
        needs_conversion = True
    elif not _can_decode_with_soundfile(source_path):
        needs_conversion = True

    if not needs_conversion:
        return source_path, False

    uploads_dir = get_uploads_dir()
    normalized_path = uploads_dir / _normalized_audio_filename(job_id)

    try:
        if normalized_path.exists():
            source_mtime = source_path.stat().st_mtime
            normalized_mtime = normalized_path.stat().st_mtime
            if normalized_mtime >= source_mtime:
                return normalized_path, True
    except OSError:
        pass

    if progress_callback:
        progress_callback("Converting media to supported format...", 7)

    ffmpeg_path = get_ffmpeg_path()
    normalized_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        ffmpeg_path,
        "-y",
        "-i",
        str(source_path),
        "-vn",
        "-acodec",
        "pcm_s16le",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(normalized_path),
    ]
    process = subprocess.run(cmd, capture_output=True, text=True)

    if process.returncode != 0:
        error_output = (process.stderr or process.stdout or "").strip()
        logger.error("FFmpeg preprocessing failed for %s: %s", source_path, error_output)
        raise RuntimeError(
            f"FFmpeg failed to preprocess {source_path.name}. "
            "Ensure FFmpeg is installed and the media file is not corrupted."
        )

    if progress_callback:
        progress_callback("Audio converted successfully.", 9)

    return normalized_path, True


def update_job_progress(job_id: str, progress: int, message: str, extra_data: Optional[Dict[str, Any]] = None):
    """Update job progress for real-time monitoring."""
    try:
        from native_job_queue import get_queue

        for queue_name in ["high", "default", "low"]:
            try:
                queue = get_queue(queue_name)
                queue.update_job_meta(job_id, {
                    "progress": progress,
                    "message": message,
                    **(extra_data or {}),
                })
                logger.info("Job %s: %s%% - %s", job_id, progress, message)
                return
            except Exception:
                continue

    except Exception as e:
        logger.error("Failed to update job progress: %s", e)


def _format_timestamp(seconds: float) -> str:
    total = max(0, int(round(seconds)))
    minutes, secs = divmod(total, 60)
    return f"{minutes}:{secs:02d}"


def process_transcription_job(
    job_id: str,
    file_path: str,
    model_path: str = "whisper",
    language: str = "auto",
    device: Optional[str] = None,
    compute_type: Optional[str] = None,
    vad_filter: bool = True,
    batch_size: int = 8,
    output_dir: Optional[str] = None,
    send_completion: bool = True,
    prepared_audio_path: Optional[str] = None,
    inference_audio_path: Optional[str] = None,
    audio_was_transcoded: Optional[bool] = None,
    original_audio_path: Optional[str] = None,
    cleanup_paths: Optional[list] = None,
    media_path: Optional[str] = None,
    media_kind: Optional[str] = None,
) -> Dict[str, Any]:
    """Process audio transcription job using the selected backend."""
    prepared_audio_path_obj: Optional[Path] = None
    was_transcoded = False
    try:
        start_time = time.time()
        update_job_progress(job_id, 0, "Starting transcription...", {"stage": "transcription"})

        output_dir_path = Path(tempfile.mkdtemp())

        update_job_progress(job_id, 5, "Preparing Whisper.cpp pipeline...", {"stage": "transcription"})

        if prepared_audio_path:
            prepared_audio_path_obj = Path(prepared_audio_path)
            was_transcoded = bool(audio_was_transcoded)
        else:
            update_job_progress(job_id, 6, "Verifying audio format...", {"stage": "transcription"})

            def preprocessing_update(message: str, approx_progress: int) -> None:
                update_job_progress(job_id, approx_progress, message, {"stage": "transcription"})

            prepared_audio_path_obj, was_transcoded = _prepare_audio_for_processing(
                job_id,
                file_path,
                preprocessing_update,
            )

        inference_path_obj = prepared_audio_path_obj
        if inference_audio_path:
            candidate = Path(inference_audio_path)
            if candidate.exists():
                inference_path_obj = candidate

        model_label = "Whisper.cpp"
        model_candidate = resolve_whisper_model(model_path)
        if model_candidate:
            model_label = f"Whisper.cpp ({model_candidate.name})"

        def whisper_progress(percent: int, message: str) -> None:
            capped = max(0, min(int(percent), 95))
            update_job_progress(job_id, capped, message, {"stage": "transcription"})

        update_job_progress(job_id, 10, "Running Whisper transcription...", {"stage": "transcription"})
        transcription = transcribe_whisper_cpp(
            Path(inference_path_obj),
            model_path=model_path,
            language=language,
            output_dir=output_dir_path,
            progress_callback=whisper_progress,
        )
        device_label = "cpu"

        raw_segments = transcription.get("segments") or []
        media_duration: Optional[float] = None
        try:
            media_duration = get_audio_duration(str(inference_path_obj))
            if not media_duration or media_duration <= 0:
                media_duration = None
        except Exception:
            media_duration = None
        segments = [
            {
                "id": idx,
                "start": float(segment.get("start", 0.0)),
                "end": float(segment.get("end", 0.0)),
                "text": str(segment.get("text", "")).strip(),
                "words": segment.get("words", []),
            }
            for idx, segment in enumerate(raw_segments)
        ]
        full_text = transcription.get("text", "").strip()
        detected_language = transcription.get("language") or (language or "auto")
        duration = transcription.get("duration")
        effective_duration: Optional[float] = None
        if isinstance(duration, (int, float)):
            effective_duration = float(duration)
        if media_duration is not None:
            effective_duration = media_duration

        if not segments and full_text:
            segments = [
                {
                    "id": 0,
                    "start": 0.0,
                    "end": round(float(effective_duration) if effective_duration else 0.0, 2),
                    "text": full_text,
                    "words": [],
                }
            ]
        elif not segments and not full_text:
            update_job_progress(job_id, 100, "No transcription generated", {"stage": "transcription"})
            result = {
                "job_id": job_id,
                "status": "completed",
                "file_path": file_path,
                "segments": [],
                "text": "",
                "language": detected_language or "auto",
                "transcription_time": round(time.time() - start_time, 2),
                "model": model_label,
                "device": device_label,
                "audio_was_transcoded": was_transcoded,
                "normalized_audio_path": str(prepared_audio_path_obj),
                "segment_count": 0,
            }
            if original_audio_path:
                result["original_audio_path"] = str(original_audio_path)
            return result

        transcription_time = time.time() - start_time
        result = {
            "job_id": job_id,
            "status": "completed",
            "file_path": media_path or file_path,
            "segments": segments,
            "text": full_text,
            "language": detected_language or "auto",
            "transcription_time": round(transcription_time, 2),
            "model": model_label,
            "device": device_label,
            "segment_count": len(segments),
        }
        if effective_duration is not None:
            try:
                result["audio_duration"] = round(float(effective_duration), 2)
            except Exception:
                pass

        try:
            native_history.upsert_job_record({
                "job_id": job_id,
                "filename": Path(media_path or file_path).name,
                "media_path": media_path or file_path,
                "media_kind": media_kind,
                "status": "completed",
                "language": detected_language or "auto",
                "device": device_label,
                "summary": full_text[:500],
                "transcript_json": result,
                "transcript_text": full_text,
                "segment_count": len(segments),
                "duration": result.get("audio_duration"),
            })
        except Exception as history_error:
            logger.warning("Failed to store job record %s: %s", job_id, history_error)

        if send_completion:
            update_job_progress(job_id, 100, "Transcription completed successfully", {
                "result": result,
                "stage": "completed",
            })
            time.sleep(0.1)
        else:
            update_job_progress(job_id, 100, "Transcription completed", {
                "result": result,
                "stage": "transcription_complete",
            })

        return result
    except Exception as e:
        logger.error("Transcription job %s failed: %s", job_id, e)
        logger.error(traceback.format_exc())
        update_job_progress(job_id, -1, f"Transcription failed: {str(e)}", {
            "stage": "transcription",
            "error": str(e),
        })
        raise
    finally:
        with contextlib.suppress(Exception):
            shutil.rmtree(output_dir_path, ignore_errors=True)
        if cleanup_paths:
            for path in cleanup_paths:
                with contextlib.suppress(Exception):
                    target = Path(path)
                    if target.is_dir():
                        shutil.rmtree(target, ignore_errors=True)
                    else:
                        target.unlink()
        try:
            if was_transcoded and prepared_audio_path_obj:
                uploads_dir = get_uploads_dir().resolve()
                prepared_path = Path(prepared_audio_path_obj).resolve()
                if uploads_dir in prepared_path.parents:
                    prepared_path.unlink(missing_ok=True)
        except Exception:
            pass


def process_full_pipeline_job(
    job_id: str,
    file_path: str,
    model_path: str = "whisper",
    language: str = "auto",
    device: Optional[str] = None,
    compute_type: Optional[str] = None,
    vad_filter: bool = True,
    noise_suppression: Optional[str] = None,
    output_dir: Optional[str] = None,
    original_filename: Optional[str] = None,
    uploaded_audio_path: Optional[str] = None,
    uploaded_audio_size: Optional[int] = None,
    prepared_audio_path: Optional[str] = None,
    audio_was_transcoded: Optional[bool] = None,
    original_audio_path: Optional[str] = None,
    cleanup_paths: Optional[list] = None,
    media_path: Optional[str] = None,
    media_kind: Optional[str] = None,
) -> Dict[str, Any]:
    """Process transcription pipeline with optional noise suppression."""
    reference_name = original_filename or (original_audio_path and Path(original_audio_path).name) or Path(file_path).name
    try:
        processing_source = Path(prepared_audio_path or file_path)

        def noise_update(message: str, approx_progress: int) -> None:
            update_job_progress(job_id, approx_progress, message, {"stage": "preprocessing"})

        with _noise_suppressed_audio(
            processing_source,
            job_id=job_id,
            backend=noise_suppression,
            progress_callback=noise_update,
        ) as processing_audio:
            transcription_result = process_transcription_job(
                job_id=job_id,
                file_path=file_path,
                model_path=model_path,
                language=language,
                device=device,
                compute_type=compute_type,
                vad_filter=vad_filter,
                batch_size=8,
                send_completion=False,
                prepared_audio_path=prepared_audio_path,
                inference_audio_path=str(processing_audio),
                audio_was_transcoded=audio_was_transcoded,
                original_audio_path=original_audio_path or file_path,
                cleanup_paths=cleanup_paths,
                media_path=media_path or file_path,
                media_kind=media_kind,
            )

        audio_info: Dict[str, Any] = {"name": reference_name}
        playback_path = str(media_path or file_path)
        audio_info["path"] = playback_path

        reference_for_size = prepared_audio_path or uploaded_audio_path
        if uploaded_audio_size is not None and reference_for_size and playback_path == str(reference_for_size):
            audio_info["size"] = uploaded_audio_size
        else:
            with contextlib.suppress(OSError):
                audio_info["size"] = Path(playback_path).stat().st_size

        if original_audio_path:
            audio_info["original_path"] = str(original_audio_path)

        transcription_result["total_processing_time"] = round(
            transcription_result["transcription_time"], 2
        )

        completion_data = {
            "result": transcription_result,
            "stage": "pipeline",
            "audio_file": audio_info,
        }

        update_job_progress(job_id, 100, "All processing completed", completion_data)

        try:
            native_history.mark_completed(
                job_id=job_id,
                original_filename=reference_name,
                message="All processing completed",
                result=transcription_result,
                output_dir=None,
                audio_file=audio_info,
                language=transcription_result.get("language"),
                device=transcription_result.get("device"),
            )
        except Exception as history_error:
            logger.warning("Failed to persist history for job %s: %s", job_id, history_error)

        return transcription_result

    except Exception as e:
        logger.error("Full pipeline job %s failed: %s", job_id, e)
        logger.error(traceback.format_exc())
        try:
            native_history.mark_failed(
                job_id=job_id,
                original_filename=reference_name,
                message=str(e),
            )
        except Exception as history_error:
            logger.warning("Failed to record failed job %s in history: %s", job_id, history_error)
        raise

"""Utilities for offline SenseVoice ONNX transcription."""

from __future__ import annotations

import os
import logging
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from audio_runtime import (
    SAMPLES_PER_MILLISECOND,
    ProgressCallback,
    TenVadSegmenter,
    _load_audio,
    select_tenvad_segmenter,
)

from sensevoice.onnx.sense_voice_ort_session import SenseVoiceInferenceSession
from sensevoice.utils.fsmn_vad import FSMNVad
from sensevoice.utils.frontend import WavFrontend

LOGGER = logging.getLogger(__name__)
TOKEN_PATTERN = re.compile(r"<\|[^|]*\|>")

# Canonical language IDs used by SenseVoice ONNX embedding table
LANGUAGE_CODE_TO_ID: Dict[str, int] = {
    "auto": 0,
    "zh": 3,
    "en": 4,
    "yue": 7,
    "ja": 11,
    "ko": 12,
    "nospeech": 13,
}

# Optional convenience aliases accepted by the transcriber API
LANGUAGE_ALIASES: Dict[str, str] = {
    "english": "en",
    "eng": "en",
    "mandarin": "zh",
    "zh-cn": "zh",
    "zh-tw": "zh",
    "cantonese": "yue",
    "粤语": "yue",
    "japanese": "ja",
    "ja-jp": "ja",
    "korean": "ko",
    "ko-kr": "ko",
    "silence": "nospeech",
}



class FsmnVadSegmenter:
    """FSMN-VAD wrapper that outputs speech segments in milliseconds."""

    def __init__(self, config_dir: Path) -> None:
        self._vad = FSMNVad(str(config_dir))

    def segments_offline(self, waveform: np.ndarray) -> Sequence[Sequence[float]]:
        reset_fn = getattr(self._vad, "all_reset_detection", None)
        if reset_fn is None:
            inner_vad = getattr(self._vad, "vad", None)
            reset_fn = getattr(inner_vad, "all_reset_detection", None)
        if callable(reset_fn):
            reset_fn()
        return self._vad.segments_offline(waveform)


def _canonical_language(language: Optional[str]) -> str:
    if not language:
        return "auto"
    language_key = language.strip().lower()
    return LANGUAGE_ALIASES.get(language_key, language_key)


def _language_to_id(language: Optional[str]) -> int:
    canonical = _canonical_language(language)
    return LANGUAGE_CODE_TO_ID.get(canonical, LANGUAGE_CODE_TO_ID["auto"])


def _resolve_output_language(requested: Optional[str]) -> str:
    canonical = _canonical_language(requested)
    if canonical in LANGUAGE_CODE_TO_ID:
        return canonical
    return "auto"


def _parse_device_identifier(device: Optional[str]) -> Tuple[str, int]:
    if not device:
        return "cpu", -1

    normalized = device.strip().lower()
    if normalized in {"cpu", "auto"}:
        return "cpu", -1

    if normalized.startswith("cuda") or normalized.startswith("gpu"):
        parts = normalized.split(":", 1)
        if len(parts) == 2 and parts[1].isdigit():
            return "cuda", int(parts[1])
        return "cuda", 0

    if normalized.isdigit():
        return "cuda", int(normalized)

    return "cpu", -1


@dataclass(frozen=True)
class SenseVoiceSegment:
    """Represents a decoded speech segment."""

    start: float
    end: float
    text: str

    def to_dict(self, segment_id: int) -> Dict[str, object]:
        return {
            "id": segment_id,
            "start": round(self.start, 2),
            "end": round(self.end, 2),
            "text": self.text.strip(),
            "words": [],
        }


class SenseVoiceOnnxTranscriber:
    """High-level wrapper around the SenseVoice ONNX runtime components."""

    def __init__(
        self,
        model_dir: Path,
        device: Optional[str] = None,
        num_threads: Optional[int] = None,
        use_int8: bool = False,
    ) -> None:
        self.model_dir = Path(model_dir).resolve()
        if not self.model_dir.exists():
            raise FileNotFoundError(
                f"SenseVoice ONNX model directory not found: {self.model_dir}"
            )

        device_label, device_id = _parse_device_identifier(device)
        self._device_label = device_label if device_label != "cpu" else "cpu"
        self._device_id = device_id
        self._num_threads = max(1, num_threads or max(1, (os_cpu_count() // 2) or 1))
        self._use_int8 = bool(use_int8)

        encoder_filename = (
            "sense-voice-encoder-int8.onnx" if self._use_int8 else "sense-voice-encoder.onnx"
        )
        encoder_path = self.model_dir / encoder_filename
        if not encoder_path.exists():
            raise FileNotFoundError(
                f"Missing SenseVoice encoder model: {encoder_path}"
            )

        embedding_path = self.model_dir / "embedding.npy"
        if not embedding_path.exists():
            raise FileNotFoundError(
                f"Missing SenseVoice embedding file: {embedding_path}"
            )

        tokenizer_model = self.model_dir / "chn_jpn_yue_eng_ko_spectok.bpe.model"
        if not tokenizer_model.exists():
            raise FileNotFoundError(
                f"Missing SenseVoice tokenizer model: {tokenizer_model}"
            )

        mvn_path = self.model_dir / "am.mvn"
        if not mvn_path.exists():
            raise FileNotFoundError(f"Missing SenseVoice CMVN file: {mvn_path}")

        self._vad_label = "ten-vad"
        vad_backend = (
            os.environ.get("XCAPTION_VAD_BACKEND")
            or os.environ.get("XSUB_VAD_BACKEND", "ten-vad")
        ).strip().lower()
        if vad_backend in {"fsmn", "fsmn-vad", "fsmn_vad"}:
            vad_config_dir = self.model_dir
            vad_model = vad_config_dir / "fsmnvad-offline.onnx"
            if not vad_model.exists():
                raise FileNotFoundError(
                    f"Missing SenseVoice VAD model: {vad_model}"
                )
            self._vad_label = "fsmn-vad"
            self._vad_segmenter = FsmnVadSegmenter(vad_config_dir)
        else:
            try:
                self._vad_segmenter = TenVadSegmenter.from_env()
            except Exception as exc:
                LOGGER.warning("TEN-VAD unavailable (%s); falling back to FSMN-VAD", exc)
                vad_config_dir = self.model_dir
                vad_model = vad_config_dir / "fsmnvad-offline.onnx"
                if not vad_model.exists():
                    raise FileNotFoundError(
                        f"Missing SenseVoice VAD model: {vad_model}"
                    ) from exc
                self._vad_label = "fsmn-vad"
                self._vad_segmenter = FsmnVadSegmenter(vad_config_dir)
            else:
                self._vad_label = "ten-vad"

        LOGGER.info(
            "Initializing SenseVoice ONNX (device=%s, threads=%s, int8=%s)",
            self._device_label if self._device_id >= 0 else "cpu",
            self._num_threads,
            self._use_int8,
        )

        self._frontend = WavFrontend(str(mvn_path))
        self._session = SenseVoiceInferenceSession(
            str(embedding_path),
            str(encoder_path),
            str(tokenizer_model),
            device_id=self._device_id,
            intra_op_num_threads=self._num_threads,
        )

        self._decode_lock = threading.Lock()

    @property
    def device_label(self) -> str:
        return self._device_label if self._device_id >= 0 else "cpu"

    def transcribe(
        self,
        audio_path: Path | str,
        *,
        language: Optional[str] = None,
        use_itn: bool = True,
        enable_vad: bool = True,
        progress_callback: Optional[ProgressCallback] = None,
    ) -> Dict[str, object]:
        path = Path(audio_path)
        if not path.exists():
            raise FileNotFoundError(f"Audio file not found: {path}")

        _notify(progress_callback, 5, "Loading audio")
        waveform, sr = _load_audio(path)
        duration = float(waveform.shape[0]) / float(sr) if sr else 0.0

        if waveform.size == 0:
            _notify(progress_callback, 95, "Audio is empty")
            return {
                "segments": [],
                "text": "",
                "language": _resolve_output_language(language),
                "duration": duration,
            }

        language_id = _language_to_id(language)

        if enable_vad:
            try:
                segmenter = self._vad_segmenter
                long_audio_mode = False
                if self._vad_label == "ten-vad":
                    segmenter, long_audio_mode = select_tenvad_segmenter(
                        duration, default_segmenter=self._vad_segmenter
                    )
                if self._vad_label == "ten-vad":
                    stage = "Running TEN-VAD segmentation"
                else:
                    stage = "Running FSMN-VAD segmentation"
                if long_audio_mode:
                    stage = f"{stage} (long-audio mode)"
                _notify(progress_callback, 15, stage)
                if self._vad_label == "ten-vad":
                    segments_ms = segmenter.segments_offline(
                        waveform,
                        duration_ms=duration * 1000.0,
                    )
                else:
                    segments_ms = self._vad_segmenter.segments_offline(waveform)
            except Exception as exc:  # pragma: no cover - defensive guard
                LOGGER.warning("VAD segmentation failed: %s", exc)
                segments_ms = []
        else:
            segments_ms = []

        if not segments_ms:
            segments_ms = [(0.0, duration * 1000.0)]

        total_segments = len(segments_ms)
        _notify(progress_callback, 20, f"Detected {total_segments} speech segments")

        segments: List[SenseVoiceSegment] = []
        text_parts: List[str] = []

        for index, raw_segment in enumerate(segments_ms):
            if len(raw_segment) < 2:
                continue

            start_ms = max(0.0, float(raw_segment[0]))
            end_ms = max(start_ms, float(raw_segment[1]))
            if end_ms <= start_ms:
                continue

            start_sample = int(round(start_ms * SAMPLES_PER_MILLISECOND))
            end_sample = int(round(end_ms * SAMPLES_PER_MILLISECOND))
            end_sample = min(end_sample, waveform.shape[0])
            segment_wave = waveform[start_sample:end_sample]

            if segment_wave.size == 0:
                continue

            segment_features = self._frontend.get_features(segment_wave)
            if segment_features.size == 0:
                continue

            with self._decode_lock:
                hypothesis = self._session(
                    segment_features[None, ...],
                    language=language_id,
                    use_itn=use_itn,
                )

            decoded_text = TOKEN_PATTERN.sub("", str(hypothesis)).strip()
            if decoded_text:
                text_parts.append(decoded_text)

            segments.append(
                SenseVoiceSegment(
                    start=start_ms / 1000.0,
                    end=end_ms / 1000.0,
                    text=decoded_text,
                )
            )

            progress = 20 + int(((index + 1) / total_segments) * 70)
            _notify(
                progress_callback,
                min(progress, 92),
                f"Decoding segment {index + 1}/{total_segments}",
            )

        if not segments:
            _notify(progress_callback, 95, "No speech detected")
            return {
                "segments": [],
                "text": "",
                "language": _resolve_output_language(language),
                "duration": duration,
            }

        transcript_text = " ".join(text_parts).strip()
        _notify(progress_callback, 95, "Finalizing transcript")

        return {
            "segments": [segment.to_dict(idx) for idx, segment in enumerate(segments)],
            "text": transcript_text,
            "language": _resolve_output_language(language),
            "duration": duration,
        }

def _notify(callback: Optional[ProgressCallback], percent: int, message: str) -> None:
    if callback is None:
        return
    try:
        callback(max(0, min(int(percent), 99)), message)
    except Exception:  # pragma: no cover - progress reporting should not break transcription
        LOGGER.debug("Progress callback raised an exception", exc_info=True)


def os_cpu_count() -> int:
    try:
        import os

        return os.cpu_count() or 1
    except Exception:  # pragma: no cover - extremely defensive
        return 1

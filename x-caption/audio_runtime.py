"""Shared audio utilities and TEN-VAD segmentation for X-Caption."""
from __future__ import annotations

import os
import logging
from typing import Callable, Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf

try:
    import librosa  # type: ignore
except ImportError:  # pragma: no cover - librosa is optional
    librosa = None  # type: ignore

try:
    from ten_vad import TenVad  # type: ignore
except Exception:  # pragma: no cover - ten-vad is optional
    TenVad = None  # type: ignore

def rich_transcription_postprocess(text: str) -> str:
    """Postprocess transcription text (kept lightweight for offline builds)."""
    return text

LOGGER = logging.getLogger(__name__)

DEFAULT_SAMPLE_RATE = 16000
SAMPLES_PER_MILLISECOND = DEFAULT_SAMPLE_RATE / 1000.0

ProgressCallback = Callable[[int, str], None]


def _env_int(name: str, default: int) -> int:
    value = _env_value(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    value = _env_value(name)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = _env_value(name)
    if value is None or value == "":
        return default
    value = value.strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return default


TENVAD_DEFAULTS: Dict[str, float] = {
    "HOP_SIZE": 256,
    "THRESHOLD": 0.5,
    "MIN_SPEECH_MS": 250,
    "MIN_SILENCE_MS": 150,
    "PAD_MS": 30,
    "MAX_SEGMENT_MS": 30000,
}


def _env_value(name: str) -> Optional[str]:
    value = os.environ.get(name)
    if value is None and name.startswith("XSUB_"):
        value = os.environ.get(f"XCAPTION_{name[len('XSUB_'):]}")
    elif value is None and name.startswith("XCAPTION_"):
        value = os.environ.get(f"XSUB_{name[len('XCAPTION_'):]}")
    return value

LONG_AUDIO_TENVAD_DEFAULTS: Dict[str, float] = {
    "HOP_SIZE": 512,
    "THRESHOLD": 0.55,
    "MIN_SPEECH_MS": 400,
    "MIN_SILENCE_MS": 500,
    "PAD_MS": 60,
    "MAX_SEGMENT_MS": 60000,
}

LONG_AUDIO_MIN_SECONDS_DEFAULT = 600.0


class TenVadSegmenter:
    """TEN-VAD wrapper that outputs speech segments in milliseconds."""

    def __init__(
        self,
        *,
        sample_rate: int = DEFAULT_SAMPLE_RATE,
        hop_size: int = 256,
        threshold: float = 0.5,
        min_speech_ms: int = 250,
        min_silence_ms: int = 150,
        pad_ms: int = 30,
        max_segment_ms: int = 30000,
    ) -> None:
        if TenVad is None:  # pragma: no cover
            raise ImportError(
                "TEN-VAD backend requested but 'ten-vad' is not installed. "
                "Install it with: pip install ten-vad"
            )

        if sample_rate <= 0:
            raise ValueError("sample_rate must be positive")
        if hop_size <= 0:
            raise ValueError("hop_size must be positive")

        self._sample_rate = int(sample_rate)
        self._hop_size = int(hop_size)
        self._threshold = float(threshold)
        self._min_speech_ms = max(0, int(min_speech_ms))
        self._min_silence_ms = max(0, int(min_silence_ms))
        self._pad_ms = max(0, int(pad_ms))
        self._max_segment_ms = max(0, int(max_segment_ms)) if max_segment_ms else 0

        self._frame_ms = (self._hop_size / float(self._sample_rate)) * 1000.0

    @classmethod
    def from_env(
        cls,
        *,
        defaults: Optional[Dict[str, float]] = None,
        prefix: str = "XCAPTION_TENVAD_",
    ) -> "TenVadSegmenter":
        merged = dict(TENVAD_DEFAULTS)
        if defaults:
            merged.update(defaults)
        return cls(
            hop_size=_env_int(f"{prefix}HOP_SIZE", int(merged["HOP_SIZE"])),
            threshold=_env_float(f"{prefix}THRESHOLD", float(merged["THRESHOLD"])),
            min_speech_ms=_env_int(f"{prefix}MIN_SPEECH_MS", int(merged["MIN_SPEECH_MS"])),
            min_silence_ms=_env_int(f"{prefix}MIN_SILENCE_MS", int(merged["MIN_SILENCE_MS"])),
            pad_ms=_env_int(f"{prefix}PAD_MS", int(merged["PAD_MS"])),
            max_segment_ms=_env_int(f"{prefix}MAX_SEGMENT_MS", int(merged["MAX_SEGMENT_MS"])),
        )

    def segments_offline(self, waveform: np.ndarray, *, duration_ms: Optional[float] = None) -> List[Tuple[float, float]]:
        if waveform.size == 0:
            return []

        if duration_ms is None:
            duration_ms = (waveform.shape[0] / float(self._sample_rate)) * 1000.0

        clamped = np.clip(waveform.astype(np.float32, copy=False), -1.0, 1.0)
        audio_int16 = (clamped * 32767.0).astype(np.int16, copy=False)

        hop = self._hop_size
        frame_count = int(np.ceil(audio_int16.shape[0] / hop))
        if frame_count <= 0:
            return []

        padded_len = frame_count * hop
        if padded_len != audio_int16.shape[0]:
            audio_int16 = np.pad(audio_int16, (0, padded_len - audio_int16.shape[0]), mode="constant")

        vad = TenVad(hop_size=hop, threshold=self._threshold)

        speech_mask = np.zeros(frame_count, dtype=np.bool_)
        for frame_idx in range(frame_count):
            start = frame_idx * hop
            frame = audio_int16[start : start + hop]
            probability, _flags = vad.process(frame)
            speech_mask[frame_idx] = probability >= self._threshold

        raw_segments: List[List[float]] = []
        start_frame: Optional[int] = None
        for frame_idx, is_speech in enumerate(speech_mask.tolist()):
            if is_speech and start_frame is None:
                start_frame = frame_idx
                continue
            if not is_speech and start_frame is not None:
                raw_segments.append([start_frame * self._frame_ms, frame_idx * self._frame_ms])
                start_frame = None
        if start_frame is not None:
            raw_segments.append([start_frame * self._frame_ms, frame_count * self._frame_ms])

        if not raw_segments:
            return []

        merged: List[List[float]] = []
        for start_ms, end_ms in raw_segments:
            if not merged:
                merged.append([start_ms, end_ms])
                continue

            gap = start_ms - merged[-1][1]
            if gap <= float(self._min_silence_ms):
                merged[-1][1] = end_ms
            else:
                merged.append([start_ms, end_ms])

        padded: List[List[float]] = []
        for start_ms, end_ms in merged:
            start_ms = max(0.0, start_ms - float(self._pad_ms))
            end_ms = min(float(duration_ms), end_ms + float(self._pad_ms))
            if padded and start_ms <= padded[-1][1]:
                padded[-1][1] = max(padded[-1][1], end_ms)
                continue
            padded.append([start_ms, end_ms])

        filtered = [
            (start_ms, end_ms)
            for start_ms, end_ms in padded
            if (end_ms - start_ms) >= float(self._min_speech_ms)
        ]

        if not filtered:
            return []

        max_len = float(self._max_segment_ms) if self._max_segment_ms else 0.0
        if max_len <= 0.0:
            return filtered

        chunked: List[Tuple[float, float]] = []
        for start_ms, end_ms in filtered:
            if (end_ms - start_ms) <= max_len:
                chunked.append((start_ms, end_ms))
                continue

            cursor = start_ms
            while cursor < end_ms:
                next_end = min(cursor + max_len, end_ms)
                chunked.append((cursor, next_end))
                cursor = next_end

        return chunked


def _load_audio(path: Path) -> Tuple[np.ndarray, int]:
    audio, sr = sf.read(str(path), always_2d=False)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)
    if sr != DEFAULT_SAMPLE_RATE:
        if librosa is None:
            raise RuntimeError(
                "X-Caption requires 16 kHz audio. Install 'librosa' to enable resampling."
            )
        audio = librosa.resample(audio.astype(np.float32), orig_sr=sr, target_sr=DEFAULT_SAMPLE_RATE)
        sr = DEFAULT_SAMPLE_RATE
    return audio.astype(np.float32), sr


def _should_use_long_audio(duration_sec: float) -> bool:
    mode = _env_value("XCAPTION_LONG_AUDIO_MODE")
    if mode is not None and mode.strip() != "":
        mode_norm = mode.strip().lower()
        if mode_norm in {"1", "true", "yes", "on"}:
            return True
        if mode_norm in {"0", "false", "no", "off"}:
            return False
        # "auto" or unknown -> fall through to threshold logic.

    threshold = _env_float("XCAPTION_LONG_AUDIO_MIN_SECONDS", LONG_AUDIO_MIN_SECONDS_DEFAULT)
    if threshold <= 0:
        return False
    return duration_sec >= threshold


def select_tenvad_segmenter(
    duration_sec: float,
    *,
    default_segmenter: Optional[TenVadSegmenter] = None,
) -> Tuple[TenVadSegmenter, bool]:
    if _should_use_long_audio(duration_sec):
        return (
            TenVadSegmenter.from_env(
                defaults=LONG_AUDIO_TENVAD_DEFAULTS,
                prefix="XCAPTION_LONG_AUDIO_TENVAD_",
            ),
            True,
        )
    if default_segmenter is not None:
        return default_segmenter, False
    return TenVadSegmenter.from_env(), False

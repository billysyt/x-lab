#!/usr/bin/env python3
"""Whisper model obfuscation helpers (split/assemble)."""
from __future__ import annotations

import base64
import hashlib
import os
import re
import tempfile
import threading
from pathlib import Path

try:
    from native_whisper_model_tail import (
        TAIL_B64,
        TAIL_SIZE,
        MODEL_SIZE,
        MODEL_SHA256,
        CHUNK_PREFIX,
        CHUNK_EXT,
        CHUNK_COUNT,
        CHUNK_PAD,
        CHUNK_NAMES,
        CHUNK_DIR,
    )
except Exception:  # pragma: no cover - optional module
    TAIL_B64 = None
    TAIL_SIZE = None
    MODEL_SIZE = None
    MODEL_SHA256 = None
    CHUNK_PREFIX = None
    CHUNK_EXT = None
    CHUNK_COUNT = None
    CHUNK_PAD = None
    CHUNK_NAMES = None
    CHUNK_DIR = None


_ASSEMBLY_LOCK = threading.Lock()
_ASSEMBLED_PATH: Path | None = None


def _tail_bytes() -> bytes | None:
    if not TAIL_B64:
        return None
    try:
        padded = TAIL_B64 + "=" * (-len(TAIL_B64) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except Exception:
        return None


def _hashed_chunk_names() -> list[str]:
    if not (CHUNK_COUNT and CHUNK_EXT):
        return []
    seed = (MODEL_SHA256 or "model.bin").encode("utf-8")
    names = []
    for idx in range(1, CHUNK_COUNT + 1):
        digest = hashlib.sha256(seed + idx.to_bytes(4, "big")).hexdigest()[:16]
        names.append(f".{digest}{CHUNK_EXT}")
    return names


def _expected_chunk_paths(model_dir: Path) -> list[Path]:
    if CHUNK_NAMES:
        return [model_dir / name for name in CHUNK_NAMES]
    hashed = _hashed_chunk_names()
    if hashed:
        return [model_dir / name for name in hashed]
    if not (CHUNK_PREFIX and CHUNK_EXT and CHUNK_COUNT and CHUNK_PAD):
        return []
    return [model_dir / f"{CHUNK_PREFIX}{index:0{CHUNK_PAD}d}{CHUNK_EXT}" for index in range(1, CHUNK_COUNT + 1)]


def _chunk_root(models_root: Path) -> Path:
    chunk_dir = (CHUNK_DIR or "").strip()
    base = Path(models_root).resolve()
    if chunk_dir:
        return (base / chunk_dir).resolve(strict=False)
    return base


def _discover_chunk_paths(model_dir: Path) -> list[Path]:
    if not (CHUNK_PREFIX and CHUNK_EXT):
        return []
    pattern = re.compile(rf"^{re.escape(CHUNK_PREFIX)}(\\d+){re.escape(CHUNK_EXT)}$")
    entries = []
    for path in model_dir.iterdir():
        if not path.is_file():
            continue
        match = pattern.match(path.name)
        if not match:
            continue
        try:
            idx = int(match.group(1))
        except Exception:
            continue
        entries.append((idx, path))
    return [path for _, path in sorted(entries, key=lambda item: item[0])]


def list_model_chunks(models_root: Path) -> list[Path]:
    model_dir = _chunk_root(models_root)
    expected = _expected_chunk_paths(model_dir)
    if expected and all(path.exists() for path in expected):
        return expected
    return _discover_chunk_paths(model_dir)


def obfuscated_model_ready(models_root: Path) -> bool:
    if not _tail_bytes():
        return False
    model_dir = _chunk_root(models_root)
    chunks = list_model_chunks(models_root)
    if not chunks:
        return False
    if CHUNK_COUNT and len(chunks) != CHUNK_COUNT:
        return False
    if any(not path.exists() for path in chunks):
        return False
    if MODEL_SIZE:
        total = sum(path.stat().st_size for path in chunks) + int(TAIL_SIZE or 0)
        if total != MODEL_SIZE:
            return False
    return True


def _assembly_cache_path() -> Path:
    token_source = f"{MODEL_SHA256 or ''}:{MODEL_SIZE or ''}:{CHUNK_PREFIX or ''}".encode("utf-8")
    token = hashlib.sha256(token_source).hexdigest()[:16]
    return Path(tempfile.gettempdir()) / f".{token}.dll"


def assemble_obfuscated_model(models_root: Path) -> Path:
    if not obfuscated_model_ready(models_root):
        raise RuntimeError("Obfuscated Whisper model is incomplete.")
    tail = _tail_bytes()
    if tail is None:
        raise RuntimeError("Obfuscated Whisper model tail is missing.")

    global _ASSEMBLED_PATH
    with _ASSEMBLY_LOCK:
        if _ASSEMBLED_PATH and _ASSEMBLED_PATH.exists():
            if MODEL_SIZE and _ASSEMBLED_PATH.stat().st_size == MODEL_SIZE:
                return _ASSEMBLED_PATH
        target = _assembly_cache_path()
        if target.exists() and MODEL_SIZE and target.stat().st_size == MODEL_SIZE:
            _ASSEMBLED_PATH = target
            return target

        tmp_path = target.with_suffix(".part")
        if tmp_path.exists():
            tmp_path.unlink(missing_ok=True)

        with tmp_path.open("wb") as handle:
            for chunk_path in list_model_chunks(models_root):
                with chunk_path.open("rb") as chunk:
                    while True:
                        data = chunk.read(1024 * 1024)
                        if not data:
                            break
                        handle.write(data)
            handle.write(tail)

        tmp_path.replace(target)
        _ASSEMBLED_PATH = target
        return target


def _tail_matches_model(model_path: Path) -> bool:
    tail = _tail_bytes()
    if tail is None:
        return False
    try:
        size = model_path.stat().st_size
        if MODEL_SIZE and size != MODEL_SIZE:
            return False
        with model_path.open("rb") as handle:
            handle.seek(size - len(tail))
            return handle.read(len(tail)) == tail
    except Exception:
        return False


def maybe_obfuscate_model(model_path: Path, *, delete_original: bool = True, models_root: Path | None = None) -> bool:
    if not (TAIL_B64 and CHUNK_PREFIX and CHUNK_EXT and CHUNK_PAD):
        return False
    try:
        if MODEL_SIZE and model_path.stat().st_size != MODEL_SIZE:
            return False
    except Exception:
        return False
    if not _tail_matches_model(model_path):
        return False

    if models_root is None:
        models_root = model_path.parent.parent
    model_dir = _chunk_root(models_root)
    model_dir.mkdir(parents=True, exist_ok=True)
    chunks = _expected_chunk_paths(model_dir)
    if chunks and all(path.exists() for path in chunks):
        if delete_original and model_path.exists():
            model_path.unlink(missing_ok=True)
        return True

    # Split model into chunks (keep last tail bytes embedded in code).
    tail = _tail_bytes()
    if tail is None:
        return False
    tail_size = len(tail)
    total_size = model_path.stat().st_size
    body_size = total_size - tail_size

    # Generate deterministic pseudo-random chunk sizes.
    seed_bytes = model_path.name.encode("utf-8")
    rng = hashlib.sha256(seed_bytes).digest()
    rng_offset = 0

    def next_rand(min_size: int, max_size: int) -> int:
        nonlocal rng, rng_offset
        if rng_offset + 8 > len(rng):
            rng = hashlib.sha256(rng).digest()
            rng_offset = 0
        value = int.from_bytes(rng[rng_offset : rng_offset + 8], "big")
        rng_offset += 8
        span = max_size - min_size + 1
        return min_size + (value % span)

    min_chunk = 100 * 1024 * 1024
    max_chunk = 150 * 1024 * 1024

    with model_path.open("rb") as handle:
        remaining = body_size
        index = 1
        while remaining > 0:
            if remaining <= max_chunk:
                chunk_size = remaining
            else:
                chunk_size = next_rand(min_chunk, max_chunk)
                if remaining - chunk_size < min_chunk:
                    chunk_size = remaining
            if CHUNK_NAMES and index <= len(CHUNK_NAMES):
                chunk_path = model_dir / CHUNK_NAMES[index - 1]
            else:
                chunk_path = model_dir / f"{CHUNK_PREFIX}{index:0{CHUNK_PAD}d}{CHUNK_EXT}"
            with chunk_path.open("wb") as out:
                to_write = chunk_size
                while to_write > 0:
                    data = handle.read(min(1024 * 1024, to_write))
                    if not data:
                        break
                    out.write(data)
                    to_write -= len(data)
            remaining -= chunk_size
            index += 1

    if delete_original:
        model_path.unlink(missing_ok=True)

    return True

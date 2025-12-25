#!/usr/bin/env python3
"""Job history helpers backed by the SQLite queue database."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from native_config import get_data_dir
from native_job_queue import get_queue

logger = logging.getLogger(__name__)

LEGACY_HISTORY_FILE = get_data_dir() / "history.json"


def _cleanup_legacy_history() -> None:
    try:
        if LEGACY_HISTORY_FILE.exists():
            LEGACY_HISTORY_FILE.unlink()
    except Exception as exc:
        logger.debug("Failed to remove legacy history file: %s", exc)


FINISHED_STATES = {"finished", "completed"}
FAILED_STATES = {"failed", "errored"}
CANCELLED_STATES = {"canceled", "cancelled"}


def _db_path() -> Path:
    data_dir = get_data_dir()
    return data_dir / "jobs.db"


def _connect() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(str(path))


def _ts_to_iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


def load_history(limit: int = 200) -> List[Dict[str, Any]]:
    """Return recent finished or failed jobs stored in the queue database."""
    _cleanup_legacy_history()
    query = """
        SELECT job_id, status, meta, result, created_at, ended_at
        FROM jobs
        WHERE status IN ('finished', 'failed', 'canceled', 'cancelled')
        ORDER BY COALESCE(ended_at, created_at) DESC
        LIMIT ?
    """
    entries: List[Dict[str, Any]] = []

    try:
        with _connect() as conn:
            for row in conn.execute(query, (limit,)):
                job_id, status, meta_json, result_json, created_at, ended_at = row
                meta = json.loads(meta_json) if meta_json else {}
                result = json.loads(result_json) if result_json else {}

                normalized_status = status.lower()
                progress = meta.get("progress")
                if progress is None:
                    if normalized_status in FINISHED_STATES:
                        progress = 100
                    elif normalized_status in FAILED_STATES:
                        progress = -1
                    elif normalized_status in CANCELLED_STATES:
                        progress = -1
                    else:
                        progress = 0

                entry: Dict[str, Any] = {
                    "job_id": job_id,
                    "status": status,
                    "message": meta.get("message") or meta.get("last_message") or "",
                    "created_at": _ts_to_iso(created_at),
                    "completed_at": _ts_to_iso(ended_at),
                    "language": result.get("language") or meta.get("language"),
                    "device": result.get("device") or meta.get("device"),
                    "audio_duration": result.get("audio_duration"),
                    "output_file": meta.get("output_file"),
                    "text_file": meta.get("text_file"),
                    "formatted_text_file": meta.get("formatted_text_file"),
                    "audio_file": meta.get("audio_file"),
                    "summary": meta.get("summary") or (result.get("text") or "")[:500],
                    "progress": progress,
                }

                original_filename = meta.get("original_filename")
                if not original_filename:
                    audio_info = meta.get("audio_file") or {}
                    original_filename = audio_info.get("name")
                if not original_filename:
                    file_path = (result.get("file_path") or meta.get("file_path") or "")
                    original_filename = Path(file_path).name if file_path else job_id
                entry["original_filename"] = original_filename

                if result:
                    entry["result_preview"] = {
                        "segment_count": len(result.get("segments") or []),
                        "text": result.get("text"),
                        "language": result.get("language"),
                    }

                entries.append(entry)
    except Exception as exc:
        logger.error("Failed to load job history: %s", exc)

    return entries


def mark_completed(
    *,
    job_id: str,
    original_filename: str,
    message: str,
    result: Dict[str, Any],
    output_dir: Path,
    audio_file: Optional[Dict[str, Any]] = None,
    language: Optional[str] = None,
    device: Optional[str] = None,
) -> None:
    queue = get_queue('default')
    meta_update = {
        "message": message,
        "progress": 100,
        "original_filename": original_filename,
        "language": language or result.get("language"),
        "device": device or result.get("device"),
        "output_dir": str(output_dir),
        "output_file": str(Path(output_dir) / f"{job_id}.json"),
        "text_file": str(Path(output_dir) / f"{job_id}.txt"),
        "formatted_text_file": str(Path(output_dir) / f"{job_id}_formatted.txt"),
        "summary": (result.get("text") or "")[:500],
        "audio_file": audio_file,
        "uploaded_audio_path": (audio_file.get("path") if isinstance(audio_file, dict) else None),
        "file_path": result.get("file_path"),
    }
    queue.update_job_meta(job_id, meta_update)


def mark_failed(*, job_id: str, original_filename: str, message: str) -> None:
    queue = get_queue('default')
    meta_update = {
        "message": message,
        "progress": -1,
        "original_filename": original_filename,
    }
    queue.update_job_meta(job_id, meta_update)


def remove_entry(job_id: str) -> None:
    queue = get_queue('default')
    queue.remove_job(job_id)


def get_entry(job_id: str) -> Optional[Dict[str, Any]]:
    with _connect() as conn:
        row = conn.execute(
            "SELECT job_id, status, meta, result, created_at, ended_at FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        if not row:
            return None
        job_id, status, meta_json, result_json, created_at, ended_at = row
        meta = json.loads(meta_json) if meta_json else {}
        result = json.loads(result_json) if result_json else {}

        normalized_status = status.lower()
        progress = meta.get("progress")
        if progress is None:
            if normalized_status in FINISHED_STATES:
                progress = 100
            elif normalized_status in FAILED_STATES or normalized_status in CANCELLED_STATES:
                progress = -1
            else:
                progress = 0

        entry = {
            "job_id": job_id,
            "status": status,
            "message": meta.get("message") or "",
            "created_at": _ts_to_iso(created_at),
            "completed_at": _ts_to_iso(ended_at),
            "original_filename": meta.get("original_filename") or Path(result.get("file_path", job_id)).name,
            "audio_file": meta.get("audio_file"),
            "output_file": meta.get("output_file"),
            "text_file": meta.get("text_file"),
            "formatted_text_file": meta.get("formatted_text_file"),
            "summary": meta.get("summary") or (result.get("text") or "")[:500],
            "progress": progress,
        }
        return entry

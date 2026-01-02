#!/usr/bin/env python3
"""Offline export quota tracking with tamper detection."""
import base64
import ctypes
import hashlib
import hmac
import json
import os
import platform
import time
import threading
import zlib
from pathlib import Path

from native_config import get_data_dir

MAX_FREE_EXPORTS = 15
LIMIT_REPLACEMENT_MESSAGE = "您的免費使用額度已達上限。升級 Premium 後，即可享有無限次使用，暢享更多功能！"

# Obfuscated filenames inside the app data directory
_LEGACY_FILENAMES = (
    ".xcap_cache_1.dll",
    ".xcap_cache_2.dll",
    ".xcap_ux.dat",
    ".xcap_ux.bak",
)

# Static secret mixed into the signing key (deterministic but not user-editable).
_SECRET_SEED = b"x-caption-export-quota:v1:5f0f6e1b4b2a"
_USAGE_LOCK = threading.Lock()


def _machine_hash(machine_id: str) -> str:
    return hashlib.sha256(machine_id.encode("utf-8")).hexdigest()


def _derive_key(machine_id: str) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", _SECRET_SEED, machine_id.encode("utf-8"), 120_000, dklen=32)


def _sign_payload(payload: dict, key: bytes) -> str:
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hmac.new(key, blob, hashlib.sha256).hexdigest()


def _decode_blob(raw_bytes: bytes) -> dict | None:
    if not raw_bytes:
        return None
    decoded_bytes = None
    try:
        decoded_bytes = zlib.decompress(raw_bytes)
    except Exception:
        decoded_bytes = raw_bytes
    try:
        parsed = json.loads(decoded_bytes.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass
    # Legacy base64 text fallback
    try:
        raw_text = raw_bytes.decode("utf-8").strip()
    except Exception:
        return None
    if raw_text.startswith("{"):
        try:
            parsed = json.loads(raw_text)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None
    try:
        padded = raw_text + "=" * (-len(raw_text) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
        inflated = zlib.decompress(decoded)
        parsed = json.loads(inflated.decode("utf-8"))
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _encode_blob(blob: dict) -> bytes:
    raw = json.dumps(blob, separators=(",", ":")).encode("utf-8")
    return zlib.compress(raw, level=9)


def _read_payload(path: Path, key: bytes) -> tuple[dict | None, bool]:
    if not path.exists():
        return None, False
    try:
        raw_bytes = path.read_bytes()
    except Exception:
        return None, True
    raw = _decode_blob(raw_bytes)
    if raw is None:
        return None, True
    payload = raw.get("payload")
    signature = raw.get("sig")
    if not isinstance(payload, dict) or not isinstance(signature, str):
        return None, True
    expected = _sign_payload(payload, key)
    if not hmac.compare_digest(signature, expected):
        return None, True
    return payload, False


def _write_payload(path: Path, payload: dict, key: bytes) -> None:
    signature = _sign_payload(payload, key)
    blob = {
        "payload": payload,
        "sig": signature,
    }
    path.write_bytes(_encode_blob(blob))
    _mark_hidden(path)


def _mark_hidden(path: Path) -> None:
    if os.name != "nt":
        return
    try:
        FILE_ATTRIBUTE_HIDDEN = 0x02
        ctypes.windll.kernel32.SetFileAttributesW(str(path), FILE_ATTRIBUTE_HIDDEN)
    except Exception:
        pass


def _hashed_filename(machine_id: str, tag: str, length: int = 16) -> str:
    digest = hashlib.sha256(_SECRET_SEED + machine_id.encode("utf-8") + tag.encode("utf-8")).hexdigest()
    return f".{digest[:length]}.dll"


def _usage_paths(machine_id: str) -> tuple[Path, Path]:
    data_dir = get_data_dir()
    return (
        data_dir / _hashed_filename(machine_id, "primary", length=16),
        data_dir / _hashed_filename(machine_id, "backup", length=16),
    )


def _legacy_paths(machine_id: str) -> tuple[Path, ...]:
    data_dir = get_data_dir()
    legacy = [data_dir / name for name in _LEGACY_FILENAMES]
    legacy.append(data_dir / _hashed_filename(machine_id, "primary", length=64))
    legacy.append(data_dir / _hashed_filename(machine_id, "backup", length=64))
    return tuple(legacy)


# ============================================================================
# OS-Level Persistent Storage (survives app reinstall, no admin needed)
# ============================================================================

def _get_system_storage_paths(machine_id: str) -> list[Path]:
    """Get persistent storage paths OUTSIDE app directory (survives reinstall)."""
    paths = []
    hashed_name = _hashed_filename(machine_id, "sys", length=24)

    system = platform.system()

    if system == "Windows":
        # User-level paths (no admin needed)
        appdata = os.environ.get("APPDATA")
        localappdata = os.environ.get("LOCALAPPDATA")
        userprofile = os.environ.get("USERPROFILE")

        if appdata:
            paths.append(Path(appdata) / "Microsoft" / "Windows" / "INetCache" / hashed_name)
        if localappdata:
            paths.append(Path(localappdata) / "Microsoft" / "Windows" / "Caches" / hashed_name)
        if userprofile:
            paths.append(Path(userprofile) / ".config" / hashed_name)

    elif system == "Darwin":  # macOS
        home = Path.home()
        paths.append(home / "Library" / "Application Support" / ".systemcache" / hashed_name)
        paths.append(home / "Library" / "Preferences" / ".cache" / hashed_name)
        paths.append(home / ".config" / hashed_name)

    else:  # Linux and others
        home = Path.home()
        paths.append(home / ".config" / ".systemcache" / hashed_name)
        paths.append(home / ".local" / "share" / ".cache" / hashed_name)
        paths.append(home / ".cache" / ".sysdata" / hashed_name)

    return paths


def _get_install_marker_paths(machine_id: str) -> list[Path]:
    """Get install marker paths (proves app was used before)."""
    paths = []
    marker_name = _hashed_filename(machine_id, "marker", length=28)

    system = platform.system()

    if system == "Windows":
        appdata = os.environ.get("APPDATA")
        localappdata = os.environ.get("LOCALAPPDATA")

        if appdata:
            paths.append(Path(appdata) / "Microsoft" / "Internet Explorer" / "DOMStore" / marker_name)
        if localappdata:
            paths.append(Path(localappdata) / "Microsoft" / "Event Viewer" / marker_name)

    elif system == "Darwin":
        home = Path.home()
        paths.append(home / "Library" / "Caches" / ".metadata" / marker_name)
        paths.append(home / "Library" / "Logs" / ".systemlog" / marker_name)

    else:  # Linux
        home = Path.home()
        paths.append(home / ".cache" / ".metadata" / marker_name)
        paths.append(home / ".local" / "share" / ".logs" / marker_name)

    return paths


def _save_to_registry_windows(machine_id: str, payload: dict, key: bytes) -> bool:
    """Save to Windows Registry (HKEY_CURRENT_USER, no admin needed)."""
    if platform.system() != "Windows":
        return False

    try:
        import winreg
    except ImportError:
        return False

    value_name = _hashed_filename(machine_id, "reg", length=20)
    blob = _encode_blob({"payload": payload, "sig": _sign_payload(payload, key)})
    encoded = base64.b64encode(blob).decode("ascii")

    # Multiple registry locations (harder to find all of them)
    reg_paths = [
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo"),
        (winreg.HKEY_CURRENT_USER, r"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\BagMRU"),
    ]

    success = False
    for hkey, subkey in reg_paths:
        try:
            reg_key = winreg.CreateKey(hkey, subkey)
            winreg.SetValueEx(reg_key, value_name, 0, winreg.REG_SZ, encoded)
            winreg.CloseKey(reg_key)
            success = True
        except Exception:
            pass

    return success


def _load_from_registry_windows(machine_id: str, key: bytes) -> dict | None:
    """Load from Windows Registry."""
    if platform.system() != "Windows":
        return None

    try:
        import winreg
    except ImportError:
        return None

    value_name = _hashed_filename(machine_id, "reg", length=20)
    machine_hash = _machine_hash(machine_id)

    reg_paths = [
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo"),
        (winreg.HKEY_CURRENT_USER, r"Software\Classes\Local Settings\Software\Microsoft\Windows\Shell\BagMRU"),
    ]

    for hkey, subkey in reg_paths:
        try:
            reg_key = winreg.OpenKey(hkey, subkey)
            encoded, _ = winreg.QueryValueEx(reg_key, value_name)
            winreg.CloseKey(reg_key)

            blob = base64.b64decode(encoded)
            raw = _decode_blob(blob)
            if not raw:
                continue

            payload = raw.get("payload")
            signature = raw.get("sig")
            if not isinstance(payload, dict) or not isinstance(signature, str):
                continue

            expected = _sign_payload(payload, key)
            if not hmac.compare_digest(signature, expected):
                continue

            if payload.get("machine_hash") != machine_hash:
                continue

            return payload
        except Exception:
            pass

    return None


def _save_install_markers(machine_id: str, key: bytes) -> None:
    """Create install markers to prove app was used before."""
    marker_payload = {
        "v": 1,
        "machine_hash": _machine_hash(machine_id),
        "installed_at": int(time.time()),
    }

    for path in _get_install_marker_paths(machine_id):
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _write_payload(path, marker_payload, key)
        except Exception:
            pass


def _check_install_markers(machine_id: str) -> bool:
    """Check if app was installed/used before."""
    return any(p.exists() for p in _get_install_marker_paths(machine_id))


def load_export_usage(machine_id: str) -> dict:
    key = _derive_key(machine_id)
    machine_hash = _machine_hash(machine_id)
    primary, backup = _usage_paths(machine_id)
    legacy_paths = _legacy_paths(machine_id)
    system_paths = _get_system_storage_paths(machine_id)

    tampered = False
    counts = []
    primary_backup_exists = False
    system_storage_exists = False

    # Check file-based storage (primary, backup, legacy)
    for path in (primary, backup, *legacy_paths):
        payload, invalid = _read_payload(path, key)
        if invalid:
            tampered = True
            continue
        if not payload:
            continue
        if payload.get("machine_hash") != machine_hash:
            continue
        count = payload.get("count")
        if isinstance(count, int) and count >= 0:
            counts.append(count)
            primary_backup_exists = True

    # Check system-level storage separately
    for path in system_paths:
        payload, invalid = _read_payload(path, key)
        if invalid:
            tampered = True
            continue
        if not payload:
            continue
        if payload.get("machine_hash") != machine_hash:
            continue
        count = payload.get("count")
        if isinstance(count, int) and count >= 0:
            counts.append(count)
            system_storage_exists = True

    # Check Windows Registry (separate storage)
    registry_payload = _load_from_registry_windows(machine_id, key)
    if registry_payload:
        count = registry_payload.get("count")
        if isinstance(count, int) and count >= 0:
            counts.append(count)
            system_storage_exists = True

    # Check if app was previously installed
    has_been_installed = _check_install_markers(machine_id)

    # TAMPER DETECTION: If system storage/markers exist but primary files don't,
    # user likely deleted main files to reset count
    if not primary_backup_exists and (system_storage_exists or has_been_installed):
        return {
            "count": max(counts + [MAX_FREE_EXPORTS + 1]),
            "tampered": True,
        }

    # If files are missing/tampered but app was installed before, assume tampering
    if not counts and has_been_installed:
        return {
            "count": MAX_FREE_EXPORTS + 1,
            "tampered": True,
        }

    if tampered:
        return {
            "count": max(counts + [MAX_FREE_EXPORTS + 1]),
            "tampered": True,
        }

    if counts:
        return {
            "count": max(counts),
            "tampered": False,
        }

    return {
        "count": 0,
        "tampered": False,
    }


def save_export_usage(machine_id: str, count: int) -> None:
    key = _derive_key(machine_id)
    machine_hash = _machine_hash(machine_id)
    payload = {
        "v": 1,
        "machine_hash": machine_hash,
        "count": int(max(0, count)),
        "updated_at": int(time.time()),
    }
    primary, backup = _usage_paths(machine_id)
    system_paths = _get_system_storage_paths(machine_id)

    # Write to primary and backup
    _write_payload(primary, payload, key)
    try:
        _write_payload(backup, payload, key)
    except Exception:
        pass

    # Write to all system-level storage paths (best-effort)
    for path in system_paths:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            _write_payload(path, payload, key)
        except Exception:
            pass

    # Write to Windows Registry (best-effort)
    try:
        _save_to_registry_windows(machine_id, payload, key)
    except Exception:
        pass

    # Create/update install markers (proves app was used)
    try:
        _save_install_markers(machine_id, key)
    except Exception:
        pass

    # Remove legacy files after successful write (best-effort).
    for legacy in _legacy_paths(machine_id):
        try:
            if legacy.exists():
                legacy.unlink()
        except Exception:
            pass


def increment_export_usage(machine_id: str) -> dict:
    with _USAGE_LOCK:
        state = load_export_usage(machine_id)
        count = state.get("count", 0)
        if state.get("tampered"):
            count = max(count, MAX_FREE_EXPORTS + 1)
        else:
            count = int(count) + 1

        save_export_usage(machine_id, count)
        remaining = max(0, MAX_FREE_EXPORTS - count)
        return {
            "count": count,
            "remaining": remaining,
            "limited": count > MAX_FREE_EXPORTS,
            "tampered": bool(state.get("tampered")),
        }

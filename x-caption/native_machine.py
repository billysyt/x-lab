#!/usr/bin/env python3
"""Machine identity helpers shared by native components."""
import hashlib
import platform
import subprocess
import sys
import uuid
from pathlib import Path


def _read_text_first(paths):
    for path in paths:
        try:
            value = Path(path).read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if value:
            return value
    return None


def _read_machine_id_windows():
    try:
        import winreg  # type: ignore
    except Exception:
        return None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\\Microsoft\\Cryptography") as key:
            value, _ = winreg.QueryValueEx(key, "MachineGuid")
            return str(value).strip() if value else None
    except Exception:
        return None


def _read_machine_id_macos():
    try:
        output = subprocess.check_output(
            ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    for line in output.splitlines():
        if "IOPlatformUUID" in line:
            parts = line.split("=", 1)
            if len(parts) == 2:
                value = parts[1].strip().strip('"')
                return value or None
    return None


def _read_machine_id_linux():
    return _read_text_first(["/etc/machine-id", "/var/lib/dbus/machine-id"])


def get_stable_machine_id() -> str:
    raw_id = None
    if sys.platform == "win32":
        raw_id = _read_machine_id_windows()
    elif sys.platform == "darwin":
        raw_id = _read_machine_id_macos()
    else:
        raw_id = _read_machine_id_linux()

    if not raw_id:
        try:
            node = uuid.getnode()
            raw_id = f"{node:012x}"
        except Exception:
            raw_id = None

    if not raw_id:
        raw_id = platform.node() or "unknown"

    digest = hashlib.sha256(str(raw_id).encode("utf-8")).hexdigest()
    return digest

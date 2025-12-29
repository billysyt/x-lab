#!/usr/bin/env python3
"""Premium license verification and storage."""
import base64
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from native_config import get_data_dir

logger = logging.getLogger(__name__)

try:
    from cryptography.hazmat.primitives.asymmetric import ed25519
except Exception:
    ed25519 = None

LICENSE_PREFIX = "XC1-"
MESSAGE_PREFIX = "XCAPTION:PREMIUM:V1:"
LICENSE_FILENAME = "premium_license.json"
PUBLIC_KEY_ENV = "XCAPTION_PREMIUM_PUBLIC_KEY"

# Public key (base64url, raw 32 bytes)
PUBLIC_KEY_B64 = "In7Xi2thl2xYW9Rpw0PHPgV9ZfXpqELKpydEVN0sTX0"


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _normalize_license_key(value: str) -> str | None:
    token = (value or "").strip().replace(" ", "")
    if token.upper().startswith(LICENSE_PREFIX):
        token = token[len(LICENSE_PREFIX):]
    return token or None


def _message(machine_id: str) -> bytes:
    return f"{MESSAGE_PREFIX}{machine_id.strip()}".encode("utf-8")


def _get_public_key_b64() -> str | None:
    env_value = os.environ.get(PUBLIC_KEY_ENV, "").strip()
    if env_value:
        return env_value
    return PUBLIC_KEY_B64.strip() if PUBLIC_KEY_B64 else None


def _load_public_key():
    if ed25519 is None:
        return None
    key_b64 = _get_public_key_b64()
    if not key_b64:
        return None
    try:
        raw = _b64url_decode(key_b64)
        return ed25519.Ed25519PublicKey.from_public_bytes(raw)
    except Exception as exc:
        logger.warning("Invalid premium public key: %s", exc)
        return None


def _license_path() -> Path:
    return get_data_dir() / LICENSE_FILENAME


def load_license() -> dict | None:
    path = _license_path()
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("Failed to read premium license: %s", exc)
        return None
    return payload if isinstance(payload, dict) else None


def save_license(license_key: str, machine_id: str) -> Path:
    payload = {
        "version": 1,
        "machine_id": machine_id,
        "license_key": license_key.strip(),
        "saved_at": datetime.now(timezone.utc).isoformat(),
    }
    path = _license_path()
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def verify_license_key(machine_id: str, license_key: str) -> tuple[bool, str | None]:
    if ed25519 is None:
        return False, "crypto_unavailable"
    public_key = _load_public_key()
    if public_key is None:
        return False, "public_key_missing"
    token = _normalize_license_key(license_key)
    if not token:
        return False, "invalid_key_format"
    try:
        signature = _b64url_decode(token)
    except Exception:
        return False, "invalid_key_format"
    try:
        public_key.verify(signature, _message(machine_id))
    except Exception:
        return False, "invalid_signature"
    return True, None


def check_premium_status(machine_id: str) -> tuple[bool, str | None]:
    payload = load_license()
    if not payload:
        return False, "license_missing"
    stored_machine = payload.get("machine_id")
    if stored_machine and stored_machine != machine_id:
        return False, "machine_mismatch"
    license_key = payload.get("license_key")
    if not isinstance(license_key, str) or not license_key.strip():
        return False, "license_missing"
    return verify_license_key(machine_id, license_key)


def activate_premium_key(machine_id: str, license_key: str) -> dict:
    ok, reason = verify_license_key(machine_id, license_key)
    if not ok:
        return {"success": False, "error": reason}
    save_license(license_key, machine_id)
    return {"success": True, "premium": True}

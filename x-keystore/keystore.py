#!/usr/bin/env python3
"""X-Keystore: generate and verify X-Caption premium keys."""
import argparse
import base64
import sys
from pathlib import Path

try:
    from cryptography.hazmat.primitives.asymmetric import ed25519
    from cryptography.hazmat.primitives import serialization
except Exception as exc:  # pragma: no cover
    raise SystemExit(
        "cryptography is required. Install with: pip install cryptography"
    ) from exc

LICENSE_PREFIX = "XC1-"
MESSAGE_PREFIX = "XCAPTION:PREMIUM:V1:"
DEFAULT_PRIVATE_KEY = Path(__file__).resolve().parent / "keys" / "private_key.pem"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def _normalize_license_key(value: str) -> str:
    token = (value or "").strip().replace(" ", "")
    if token.upper().startswith(LICENSE_PREFIX):
        token = token[len(LICENSE_PREFIX):]
    if not token:
        raise ValueError("empty license key")
    return token


def _message(machine_id: str) -> bytes:
    return f"{MESSAGE_PREFIX}{machine_id.strip()}".encode("utf-8")


def generate_keypair(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    private_key = ed25519.Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_raw = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )

    private_path = output_dir / "private_key.pem"
    public_path = output_dir / "public_key.pem"
    private_path.write_bytes(private_pem)
    public_path.write_bytes(public_pem)

    print(f"Private key saved to: {private_path}")
    print(f"Public key saved to: {public_path}")
    print(f"Public key (base64url): {_b64url_encode(public_raw)}")


def load_private_key(path: Path) -> ed25519.Ed25519PrivateKey:
    data = path.read_bytes()
    key = serialization.load_pem_private_key(data, password=None)
    if not isinstance(key, ed25519.Ed25519PrivateKey):
        raise ValueError("private key is not Ed25519")
    return key


def load_public_key(path: Path) -> ed25519.Ed25519PublicKey:
    data = path.read_bytes()
    key = serialization.load_pem_public_key(data)
    if not isinstance(key, ed25519.Ed25519PublicKey):
        raise ValueError("public key is not Ed25519")
    return key


def sign_machine_id(private_key_path: Path, machine_id: str) -> str:
    private_key = load_private_key(private_key_path)
    signature = private_key.sign(_message(machine_id))
    return f"{LICENSE_PREFIX}{_b64url_encode(signature)}"


def verify_license(public_key_path: Path, machine_id: str, license_key: str) -> bool:
    public_key = load_public_key(public_key_path)
    signature = _b64url_decode(_normalize_license_key(license_key))
    public_key.verify(signature, _message(machine_id))
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="X-Keystore for X-Caption premium keys")
    subparsers = parser.add_subparsers(dest="command", required=True)

    gen_parser = subparsers.add_parser("gen-keys", help="Generate a new Ed25519 keypair")
    gen_parser.add_argument("--out", default="keys", help="Output directory")

    sign_parser = subparsers.add_parser("sign", help="Sign a machine ID")
    sign_parser.add_argument("--private-key", required=True, help="Path to private_key.pem")
    sign_parser.add_argument("--machine-id", required=True, help="Machine ID from X-Caption")

    issue_parser = subparsers.add_parser("issue", help="Issue a license key using the default private key")
    issue_parser.add_argument("--machine-id", required=True, help="Machine ID from X-Caption")
    issue_parser.add_argument(
        "--private-key",
        default=str(DEFAULT_PRIVATE_KEY),
        help="Path to private_key.pem (default: x-keystore/keys/private_key.pem)",
    )

    verify_parser = subparsers.add_parser("verify", help="Verify a license key")
    verify_parser.add_argument("--public-key", required=True, help="Path to public_key.pem")
    verify_parser.add_argument("--machine-id", required=True, help="Machine ID from X-Caption")
    verify_parser.add_argument("--license-key", required=True, help="License key to verify")

    args = parser.parse_args()

    if args.command == "gen-keys":
        generate_keypair(Path(args.out))
        return 0

    if args.command == "sign":
        key = sign_machine_id(Path(args.private_key), args.machine_id)
        print(key)
        return 0

    if args.command == "issue":
        key = sign_machine_id(Path(args.private_key), args.machine_id)
        print(key)
        return 0

    if args.command == "verify":
        try:
            verify_license(Path(args.public_key), args.machine_id, args.license_key)
        except Exception as exc:
            print(f"Invalid: {exc}", file=sys.stderr)
            return 2
        print("Valid")
        return 0

    parser.error("Unknown command")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

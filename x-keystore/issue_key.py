#!/usr/bin/env python3
"""Issue a premium key from a machine code using the default private key."""
import sys
from pathlib import Path

from keystore import DEFAULT_PRIVATE_KEY, sign_machine_id


def main() -> int:
    if len(sys.argv) < 2 or not sys.argv[1].strip():
        print("Usage: python issue_key.py <machine_id>", file=sys.stderr)
        return 2
    machine_id = sys.argv[1].strip()
    private_key_path = DEFAULT_PRIVATE_KEY
    if not private_key_path.exists():
        print("Missing private key. Generate with: python keystore.py gen-keys --out keys", file=sys.stderr)
        return 2
    key = sign_machine_id(Path(private_key_path), machine_id)
    print(key)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

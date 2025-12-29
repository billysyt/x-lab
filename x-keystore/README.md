# X-Keystore

Generate and verify X-Caption premium keys.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python keystore.py gen-keys --out keys
python keystore.py issue --machine-id <MACHINE_ID>
```

The `issue` (or `sign`) command prints a license key you can paste into X-Caption.

## Short command

```bash
python issue_key.py <MACHINE_ID>
```

## Verify

```bash
python keystore.py verify --public-key keys/public_key.pem --machine-id <MACHINE_ID> --license-key <KEY>
```

## Public key for the app

Copy the base64url public key printed by `gen-keys` into the X-Caption premium verifier
(`x-caption/native_premium.py`). You can also set the `XCAPTION_PREMIUM_PUBLIC_KEY` environment
variable to override the embedded value.

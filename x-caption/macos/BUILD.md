# Building X-Caption for macOS (Apple Silicon)

This guide explains how to build a signed and notarized macOS DMG package that won't trigger security warnings.

## Prerequisites

### 1. Development Tools
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Python dependencies
pip install pyinstaller
```

### 2. Apple Developer Account Requirements

To avoid "Move to Trash" security warnings, you need:

1. **Apple Developer Account** (paid, $99/year)
   - Sign up at: https://developer.apple.com

2. **Developer ID Application Certificate**
   - Log into https://developer.apple.com/account
   - Go to Certificates, Identifiers & Profiles
   - Create a **"Developer ID Application"** certificate
   - Download and install it in your Keychain

3. **App-Specific Password** for notarization
   - Go to https://appleid.apple.com
   - Sign in with your Apple ID
   - Go to "App-Specific Passwords"
   - Generate a new password (save it securely)

4. **Team ID**
   - Find it at: https://developer.apple.com/account
   - Look under "Membership Details"

## Setup

### 1. Find Your Certificate Name

```bash
# List all signing identities in your Keychain
security find-identity -v -p codesigning
```

Look for a line like:
```
1) ABCD1234EFGH5678 "Developer ID Application: Your Name (TEAM_ID)"
```

Copy the entire name in quotes: `Developer ID Application: Your Name (TEAM_ID)`

### 2. Set Environment Variables

Create a file `.env.macos` in the project root:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your@email.com"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOUR_TEAM_ID"
```

Then load it:
```bash
source .env.macos
```

## Building

### Option 1: Full Build with Signing and Notarization (Recommended)

This creates a production-ready DMG with NO security warnings:

```bash
python scripts/build_macos.py --sign --notarize
```

This will:
1. Build the React UI
2. Build the .app bundle with PyInstaller
3. Code sign the app with hardened runtime
4. Create a DMG file
5. Sign the DMG
6. Submit to Apple for notarization (takes 5-15 minutes)
7. Staple the notarization ticket to the DMG

**Output:** `dist/X-Caption-macOS-arm64.dmg` (fully signed and notarized)

### Option 2: Sign Only (No Notarization)

If you want to test signing without waiting for notarization:

```bash
python scripts/build_macos.py --sign-only
```

**Note:** Will still show warnings without notarization.

### Option 3: Unsigned Build (Testing Only)

For quick testing without signing:

```bash
python scripts/build_macos.py --no-sign
```

**Warning:** This will show "Move to Trash" security warnings.

## Verification

After building, verify the signature:

```bash
# Verify app bundle
codesign --verify --verbose=4 dist/X-Caption.app
spctl --assess --verbose=4 --type execute dist/X-Caption.app

# Verify DMG
codesign --verify --verbose=4 dist/X-Caption-macOS-arm64.dmg
spctl --assess --type open --context context:primary-signature --verbose=4 dist/X-Caption-macOS-arm64.dmg

# Verify notarization stapling
xcrun stapler validate dist/X-Caption-macOS-arm64.dmg
```

## Distribution

The final DMG file `dist/X-Caption-macOS-arm64.dmg` can be:
- ✅ Distributed to users
- ✅ Downloaded from the internet
- ✅ Opened without security warnings
- ✅ Installed by dragging to Applications

## Troubleshooting

### "Signature Invalid" Error

```bash
# Clean previous builds
rm -rf dist/ build/

# Rebuild
python scripts/build_macos.py --sign --notarize
```

### "Unable to Find Signing Identity"

```bash
# List all certificates
security find-identity -v -p codesigning

# Make sure you have "Developer ID Application" certificate
# If not, create one at https://developer.apple.com/account
```

### Notarization Failed

```bash
# Check notarization log
xcrun notarytool log <submission-id> \
  --apple-id "your@email.com" \
  --password "xxxx-xxxx-xxxx-xxxx" \
  --team-id "TEAM_ID"
```

Common issues:
- Missing entitlements
- Unsigned libraries inside the app
- Invalid hardened runtime settings

### "Developer Cannot Be Verified" Warning

This means the app is signed but NOT notarized. Run with `--notarize`:

```bash
python scripts/build_macos.py --sign --notarize
```

## Architecture Notes

### Apple Silicon (M1/M2/M3)

The build script automatically builds for the current architecture. On Apple Silicon Macs, it builds `arm64` binaries.

### Universal Binary (Intel + Apple Silicon)

To create a universal binary:

1. Build on Intel Mac → `X-Caption-macOS-x86_64.dmg`
2. Build on Apple Silicon → `X-Caption-macOS-arm64.dmg`
3. Use `lipo` to combine binaries (advanced)

For most users, **arm64 only** is recommended (M1/M2/M3 Macs).

## Security Features

The build includes:

✅ **Hardened Runtime** - Required for notarization
✅ **Code Signing** - Verifies code integrity
✅ **Notarization** - Apple verifies no malware
✅ **Timestamp** - Ensures signature validity even after certificate expiration
✅ **Entitlements** - Declares required permissions

Users will see:
- ✅ No security warnings
- ✅ Green checkmark in System Settings
- ✅ App can be opened immediately

## Cost

- Apple Developer Program: **$99/year**
- Code signing certificate: **Included** in Developer Program
- Notarization: **Free** (included with Developer Program)

## Files Created

```
dist/
├── X-Caption.app                    # Signed app bundle
├── X-Caption-macOS-arm64.dmg       # Signed & notarized DMG
└── x-caption/                       # PyInstaller output (intermediate)

macos/
└── entitlements.plist              # Hardened runtime entitlements
```

## Next Steps

After successful build:

1. Test the DMG on a clean Mac (not your build machine)
2. Verify no security warnings appear
3. Distribute the DMG to users
4. Users drag app to Applications folder
5. App runs without warnings

## Support

For issues:
- Check the build log output
- Verify all environment variables are set
- Ensure certificates are valid and not expired
- Test on a clean macOS installation

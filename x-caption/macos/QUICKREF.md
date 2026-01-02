# Quick Reference: macOS Build Commands

## First-Time Setup

```bash
# Run setup script
./macos/setup.sh
```

## Building

### Option 1: Unsigned (Testing Only) - NO security check needed
```bash
python scripts/build_macos.py --no-sign
```
**Result:** DMG with security warnings (for development only)

### Option 2: Signed Only (No Notarization)
```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
python scripts/build_macos.py --sign-only
```
**Result:** Signed DMG, but still shows warnings (not notarized)

### Option 3: Signed + Notarized (Production Ready)
```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your@email.com"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOUR_TEAM_ID"

python scripts/build_macos.py --sign --notarize
```
**Result:** Fully signed and notarized DMG - NO security warnings!

## Getting Apple Developer Credentials

### 1. Apple Developer ID Certificate

1. Join Apple Developer Program: https://developer.apple.com (9/year)
2. Go to: https://developer.apple.com/account
3. Navigate to: Certificates, Identifiers & Profiles
4. Create: **Developer ID Application** certificate
5. Download and install it (double-click to add to Keychain)

Find your certificate name:
```bash
security find-identity -v -p codesigning
```

### 2. App-Specific Password

1. Go to: https://appleid.apple.com
2. Sign in with your Apple ID
3. Go to: Security → App-Specific Passwords
4. Generate password
5. Save it (you can't see it again!)

### 3. Team ID

1. Go to: https://developer.apple.com/account
2. Look under: Membership Details
3. Copy your Team ID (10 characters)

## Verification Commands

```bash
# Verify app signature
codesign --verify --verbose=4 dist/X-Caption.app
spctl --assess --verbose=4 --type execute dist/X-Caption.app

# Verify DMG signature
codesign --verify --verbose=4 dist/X-Caption-macOS-arm64.dmg

# Verify notarization
xcrun stapler validate dist/X-Caption-macOS-arm64.dmg
```

## Environment Variables Template

Save this to `.env.macos`:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (ABC1234DEF)"
export APPLE_ID="your@email.com"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="ABC1234DEF"
```

Load it:
```bash
source .env.macos
```

## Common Issues

### "Unable to find signing identity"
- Make sure certificate is installed in Keychain
- Check the exact name with: `security find-identity -v -p codesigning`

### "Notarization failed"
- Check Apple ID and password are correct
- Make sure you're using an app-specific password (not your regular Apple ID password)
- Verify Team ID is correct

### "This app is damaged" error
- The app needs to be notarized
- Run with `--notarize` flag
- Wait for notarization to complete (5-15 minutes)

## Output Files

```
dist/
├── X-Caption.app                  # macOS app bundle
└── X-Caption-macOS-arm64.dmg     # Distributable DMG
```

## Quick Test Build

```bash
# Clean build
rm -rf dist/ build/

# Build unsigned (fastest)
python scripts/build_macos.py --no-sign

# Test the app
open dist/X-Caption.app
```

## Distribution Checklist

- [ ] Build with `--sign --notarize`
- [ ] Wait for notarization to complete
- [ ] Test DMG on a different Mac
- [ ] Verify no security warnings
- [ ] Upload to website or distribution platform

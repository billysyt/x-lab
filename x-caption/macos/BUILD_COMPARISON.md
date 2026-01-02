# Building macOS App - With vs Without Apple Developer Account

## Build Process Overview

```
1. Build React UI
   ↓
2. Run PyInstaller (creates .app bundle)
   ↓
3. [Optional] Code Sign
   ↓
4. Create DMG
   ↓
5. [Optional] Sign DMG
   ↓
6. [Optional] Notarize with Apple
```

## Option A: WITHOUT Apple Developer Account (FREE)

### Command:
```bash
python scripts/build_macos.py --no-sign
```

### What happens:
1. ✅ Builds React UI
2. ✅ Runs PyInstaller → creates `X-Caption.app`
3. ⏭️  Skips code signing
4. ✅ Creates DMG with app inside
5. ⏭️  Skips DMG signing
6. ⏭️  Skips notarization

### Result:
- **Output:** `dist/X-Caption-macOS-arm64.dmg` (unsigned)
- **Cost:** FREE
- **Works?** YES, app is fully functional
- **Security warning?** YES - users will see:
  ```
  "X-Caption" can't be opened because Apple cannot check it for malicious software.

  [Move to Trash]  [Cancel]
  ```

### How users can open it:
**Method 1: Right-click**
1. Right-click `X-Caption.app`
2. Click "Open"
3. Click "Open" in the dialog

**Method 2: System Settings**
1. Try to open app (gets blocked)
2. Go to System Settings → Privacy & Security
3. Find "X-Caption was blocked" message
4. Click "Open Anyway"

**Method 3: Terminal (advanced)**
```bash
# Remove quarantine attribute
xattr -d com.apple.quarantine /Applications/X-Caption.app
```

### Good for:
- ✅ Personal use
- ✅ Internal team distribution
- ✅ Development/testing
- ✅ Open source projects
- ❌ Public distribution (users will be scared by warnings)

---

## Option B: WITH Apple Developer Account ($99/year)

### Requirements:
- Apple Developer Program membership ($99/year)
- Developer ID Application certificate
- App-specific password
- Team ID

### Command:
```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM)"
export APPLE_ID="your@email.com"
export APPLE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOUR_TEAM_ID"

python scripts/build_macos.py --sign --notarize
```

### What happens:
1. ✅ Builds React UI
2. ✅ Runs PyInstaller → creates `X-Caption.app`
3. ✅ **Code signs** the app with your certificate
4. ✅ Creates DMG
5. ✅ **Signs** the DMG
6. ✅ **Notarizes** with Apple (5-15 minutes)

### Result:
- **Output:** `dist/X-Caption-macOS-arm64.dmg` (signed & notarized)
- **Cost:** $99/year
- **Works?** YES
- **Security warning?** NO - opens immediately with no warnings

### Users experience:
- Double-click DMG → Opens
- Drag app to Applications → Done
- Double-click app → Opens immediately
- No warnings, no extra steps

### Good for:
- ✅ Public distribution
- ✅ App Store
- ✅ Professional/commercial apps
- ✅ Maximum user trust

---

## Quick Comparison

| Feature | No Signing (Free) | Signed + Notarized ($99/yr) |
|---------|-------------------|------------------------------|
| App works? | ✅ Yes | ✅ Yes |
| Cost | FREE | $99/year |
| Build time | ~5 min | ~20 min (notarization) |
| Security warning? | ❌ Yes | ✅ No |
| Users can open easily? | ⚠️ Extra steps needed | ✅ Yes |
| Public distribution? | ❌ Not recommended | ✅ Recommended |
| PyInstaller used? | ✅ Yes | ✅ Yes |
| DMG created? | ✅ Yes | ✅ Yes |

---

## Detailed Build Steps (What Actually Happens)

### Step 1: Build React UI
```bash
# Runs automatically
cd ui
npm run build
# Output: static/ui/ folder
```

### Step 2: PyInstaller Creates .app Bundle
```bash
# Runs automatically
pyinstaller xsub_native.spec --clean --noconfirm
# Output: dist/X-Caption.app
```

The .app bundle contains:
```
X-Caption.app/
├── Contents/
│   ├── MacOS/
│   │   └── x-caption           # Your Python app (executable)
│   ├── Resources/
│   │   ├── icon.icns
│   │   ├── static/             # React UI
│   │   ├── templates/
│   │   ├── whisper/            # Your models
│   │   └── ...
│   ├── Frameworks/             # Python libraries, dependencies
│   └── Info.plist              # App metadata
```

### Step 3: Code Signing (Optional)
```bash
# Only with Apple Developer account
codesign --sign "Developer ID Application: ..." \
         --entitlements macos/entitlements.plist \
         --options runtime \
         --deep \
         X-Caption.app
```

### Step 4: Create DMG
```bash
# Runs automatically (with or without signing)
hdiutil create \
  -volname "X-Caption" \
  -srcfolder dist/X-Caption.app \
  -format UDZO \
  dist/X-Caption-macOS-arm64.dmg
```

DMG contains:
```
X-Caption-macOS-arm64.dmg
├── X-Caption.app          # Your app
└── Applications (link)    # Shortcut to /Applications folder
```

Users drag X-Caption.app → Applications to install.

### Step 5-6: Sign & Notarize DMG (Optional)
```bash
# Only with Apple Developer account
codesign --sign "Developer ID Application: ..." dist/X-Caption-macOS-arm64.dmg
xcrun notarytool submit dist/X-Caption-macOS-arm64.dmg --wait
xcrun stapler staple dist/X-Caption-macOS-arm64.dmg
```

---

## Testing Your Build

### Test Unsigned Build:
```bash
# Build
python scripts/build_macos.py --no-sign

# Test the app directly
open dist/X-Caption.app

# Or test the DMG
open dist/X-Caption-macOS-arm64.dmg
```

### What you'll see (unsigned):
1. Double-click app → Security warning
2. Right-click → Open → Works!

---

## Recommendation

### For Development/Personal Use:
```bash
# Use unsigned build - it's FREE and works fine
python scripts/build_macos.py --no-sign
```

### For Public Distribution:
```bash
# Get Apple Developer account first
# Then use signed + notarized build
python scripts/build_macos.py --sign --notarize
```

---

## Summary

**Your Questions:**
1. **Can you build without Apple Developer account?**
   - ✅ YES! Use `--no-sign` flag
   - App works perfectly, just has security warnings

2. **Is PyInstaller being used?**
   - ✅ YES! It's called in `build_app_bundle()` function
   - PyInstaller creates the .app bundle
   - Then we package that .app into a DMG

**The script does:**
```
Build UI → Run PyInstaller → Create DMG → (Optional) Sign & Notarize
```

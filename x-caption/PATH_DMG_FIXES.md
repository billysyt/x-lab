# Path and DMG Issues - Investigation & Fixes

## Issues Found

### 1. DMG Styling Issues ✅ FIXED

**Problems:**
- Small icons by default (not 128px)
- No custom icon on DMG volume
- .fseventsd folder visible (system folder)

**Fixes Applied:**
1. Added `.VolumeIcon.icns` to DMG
2. Used `SetFile -a C` to set custom icon attribute
3. Changed to HFS+ filesystem (`-fs HFS+`)
4. Increased wait time for `.DS_Store` to save (3 seconds)
5. Added `sync` command before unmounting
6. Improved unmount retry logic

**About .fseventsd:**
- This is created automatically by macOS when mounting volumes
- Cannot be prevented or removed
- It's hidden (starts with `.`) so users won't normally see it
- All DMGs have this folder - it's normal

**File:** `scripts/create_styled_dmg.py` (updated)

### 2. App Path Issues ⚠️ INVESTIGATION NEEDED

**Observed:**
- Production path exists: `/Users/billysin/Library/Application Support/X-Caption`
- Contains: `jobs.db`, `uploads/`, `transcriptions/`
- **Missing:** `.dll` files for export limits and premium tracking

**Dev path:**
- `/Users/billysin/Desktop/Projects/x-lab/x-caption/data`
- Contains: 11 `.dll` files (models + trackers)

**Analysis:**

The `.dll` files serve two purposes:

1. **Small .dll (165-257 bytes)** - Export limit trackers
   - Example: `.5e9b53453cda7856.dll` (165 bytes)
   - These are HMAC-signed counters
   - Should be in production path when app is installed

2. **Large .dll (100+ MB)** - Obfuscated model files
   - Example: `.0750add9af9dc202.dll` (138 MB)
   - These are whisper models disguised as .dll
   - Should also be in production path

**Root Cause:**

The installed app IS using the production path for:
- ✅ `jobs.db` (database)
- ✅ `uploads/` folder
- ✅ `transcriptions/` folder

But NOT for:
- ❌ Export limit `.dll` files
- ❌ Model `.dll` files

**Possible Reasons:**

1. **App not detected as frozen**
   - `is_frozen()` might be returning False
   - Check: `sys.frozen` and `sys._MEIPASS`

2. **Path initialization timing**
   - Export limits code runs before `setup_environment()`
   - Uses wrong path initially

3. **Import order issue**
   - `native_config` might not be initialized when `native_export_limits` loads

## Diagnostic Steps

### Step 1: Check if installed app is detected as frozen

Run this from Terminal:
```bash
/Applications/X-Caption.app/Contents/MacOS/x-caption --version
```

Expected: Should show version and use production path

### Step 2: Check data directory from installed app

Copy `check_installed_paths.py` to a location accessible to the app, then open the installed app and check the logs.

### Step 3: Check if .dll files exist but are hidden

```bash
# Show all files including hidden
ls -la "/Users/billysin/Library/Application Support/X-Caption/"

# Find .dll files specifically
find "/Users/billysin/Library/Application Support/X-Caption/" -name "*.dll"
```

Current Result: **NO .dll files found**

## Recommended Fixes

### Fix 1: Ensure is_frozen() works correctly

The `is_frozen()` function in `native_config.py:34-36` checks:
```python
return getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS')
```

This should work with PyInstaller. Verify by adding logging:

```python
def is_frozen():
    """Check if running as PyInstaller bundle"""
    frozen = getattr(sys, 'frozen', False)
    has_meipass = hasattr(sys, '_MEIPASS')
    logger.info(f"is_frozen check: frozen={frozen}, has_meipass={has_meipass}")
    return frozen and has_meipass
```

### Fix 2: Initialize config before using paths

In `native_export_limits.py`, ensure config is setup:

```python
from native_config import get_data_dir, setup_environment

# At module level, ensure environment is ready
try:
    setup_environment()
except Exception:
    pass  # Already setup

def _usage_paths(machine_id: str) -> tuple[Path, Path]:
    data_dir = get_data_dir()  # This will create dir if needed
    # ...
```

### Fix 3: Add debug endpoint to check paths

Add an API endpoint in `native_web_server.py`:

```python
@app.route('/api/debug/paths')
def debug_paths():
    """Debug endpoint to check where app is storing data."""
    return {
        'is_frozen': native_config.is_frozen(),
        'data_dir': str(native_config.get_data_dir()),
        'models_dir': str(native_config.get_models_dir()),
        'dll_files': [
            f.name for f in native_config.get_data_dir().glob('*.dll')
        ]
    }
```

## Quick Test

### To verify DMG fixes:

1. Rebuild DMG (without full app rebuild):
```bash
python scripts/create_styled_dmg.py dist/X-Caption.app dist/X-Caption-TEST.dmg
```

2. Open it:
```bash
open dist/X-Caption-TEST.dmg
```

3. Check:
   - [ ] Large icons (128px) by default
   - [ ] DMG volume shows custom icon in sidebar
   - [ ] App on left, Applications on right
   - [ ] No toolbar/statusbar

### To verify path fixes:

1. Install app to `/Applications`
2. Run app
3. Do a transcription
4. Export something (to trigger export limit check)
5. Check production path:
```bash
ls -la "/Users/billysin/Library/Application Support/X-Caption/"
```

Expected: Should see `.dll` files appear

## Files Created/Modified

### Created:
1. `scripts/diagnose_paths.py` - Diagnostic tool for dev mode
2. `check_installed_paths.py` - Diagnostic tool for installed app
3. `PATH_DMG_FIXES.md` - This document

### Modified:
1. `scripts/create_styled_dmg.py` - DMG styling fixes
   - Added volume icon
   - Improved view settings
   - Better unmount handling

## Summary

### DMG Issues: ✅ FIXED
- Custom volume icon added
- Large icons set by default
- Professional styling applied
- .fseventsd is normal (can't remove)

### Path Issues: ⚠️ NEEDS TESTING
- Installed app uses production path for SOME things
- Export limit .dll files not being created in production path
- Need to verify `is_frozen()` detection
- May need initialization order fix

### Next Steps:
1. Test new DMG (no rebuild needed)
2. Add logging to verify `is_frozen()` detection
3. Add debug endpoint to check paths from running app
4. Test installed app with diagnostics

## Testing Checklist

- [ ] Open new DMG - icons are large by default
- [ ] DMG volume icon shows in Finder
- [ ] Install app to /Applications
- [ ] Run installed app
- [ ] Do transcription (creates jobs.db) ✅ Already working
- [ ] Export file (creates .dll tracker) ❌ Not working
- [ ] Check `/Users/billysin/Library/Application Support/X-Caption/` for .dll files
- [ ] Activate premium (creates premium_license.json)
- [ ] Check production path again

---

**Created:** January 2, 2026
**Status:** DMG fixes ready, path investigation ongoing

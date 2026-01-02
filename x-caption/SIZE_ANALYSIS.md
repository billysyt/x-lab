# App Bundle Size Analysis & Optimization

## Current Build Size (Before Optimization)

**Total:** 681 MB

### Size Breakdown:
```
542M  Resources/
124M  Frameworks/
 15M  MacOS/
132K  _CodeSignature/
```

## Major Size Contributors

### 1. Resources Folder (542 MB)

| Item | Size | % of Resources | Notes |
|------|------|----------------|-------|
| **sample/** | **527 MB** | **97%** | ❌ **REMOVE - Sample videos not needed** |
| whisper/ | 7.6 MB | 1.4% | ✅ Keep - Required models |
| static/ | 2.9 MB | 0.5% | ✅ Keep - UI files |
| icon.icns | 1.3 MB | 0.2% | ⚠️ Optimize - New icon only 1.1 MB |
| base_library.zip | 1.3 MB | 0.2% | ✅ Keep - Python stdlib |
| opencc | 1.1 MB | 0.2% | ✅ Keep - Chinese conversion |
| merge | 728 KB | 0.1% | ✅ Keep - Required |

**Sample folder breakdown:**
- `arho.mp4`: 500 MB (!!!)
- `arho_test_60s.mp4`: 26 MB
- `warm-up.mp3`: 937 KB

### 2. Frameworks Folder (124 MB)

| Library | Size | Purpose | Optimization |
|---------|------|---------|--------------|
| libavcodec.61.dylib | 9.8 MB | Video codec | ✅ Keep - Essential |
| cryptography/_rust.abi3.so | 9.7 MB | Encryption | ✅ Keep - Required for premium |
| curl_cffi | 7.5 MB | HTTP client | ⚠️ Check if needed |
| numpy | 6.3 MB | Numeric library | ⚠️ Check usage |
| Python runtime | 4.9 MB | Python 3.13 | ✅ Keep |
| libx265.215.dylib | 4.7 MB | Video codec | ✅ Keep |
| libcrypto.3.dylib | 4.5 MB | OpenSSL | ✅ Keep |
| libaom.3.dylib | 3.7 MB | AV1 codec | ⚠️ May be removable |
| whisper/engine | 3.3 MB | Whisper lib | ✅ Keep |
| libSvtAv1Enc.3.dylib | 3.0 MB | AV1 encoder | ⚠️ May be removable |
| libavfilter.10.dylib | 3.0 MB | Video filters | ✅ Keep |
| _soundfile_data | 2.9 MB | Audio I/O | ✅ Keep |
| libtesseract.5.dylib | 2.7 MB | OCR | ⚠️ Check if used |
| librav1e.0.7.dylib | 2.7 MB | AV1 encoder | ⚠️ May be removable |

### 3. Other Issues

**Duplicate x-caption folder:**
- PyInstaller creates both `dist/x-caption/` (681 MB) and `dist/X-Caption.app/` (681 MB)
- The folder is redundant - only .app is needed
- **Solution:** Clean up after build or use onefile mode

## Optimization Plan

### Immediate Wins (Low Effort, High Impact)

1. **Remove sample folder** ✅
   - **Saves:** 527 MB (77% reduction!)
   - **Impact:** 681 MB → 154 MB
   - **Risk:** None - sample videos not needed in production

2. **Clean up x-caption folder** ✅
   - **Saves:** 681 MB disk space (not in final DMG)
   - **Impact:** Cleaner dist/ folder
   - **Risk:** None

3. **Use optimized icon** ✅
   - **Saves:** ~200 KB
   - **Impact:** Better quality + smaller
   - **Risk:** None

**Total immediate savings:** ~527 MB (77% reduction)
**New size:** ~154 MB

### Medium Priority (Requires Testing)

4. **Check numpy usage**
   - Current: 6.3 MB
   - If not used, can exclude
   - Check: Do any libs actually use numpy?

5. **Review video codecs**
   - Multiple AV1 codecs (libaom, libSvtAv1Enc, librav1e): ~9.4 MB
   - Check: Which codecs are actually used?
   - May be able to exclude some

6. **Check curl_cffi usage**
   - Current: 7.5 MB
   - Alternative: Use urllib/requests (lighter)

7. **Tesseract OCR**
   - Current: 2.7 MB
   - Check: Is OCR functionality used?

### Advanced Optimizations (Requires Code Changes)

8. **Lazy-load heavy libraries**
   - Only import when actually used
   - Reduces startup time

9. **Strip debug symbols**
   - Use `strip` command on dylibs
   - Can save 10-20% on binaries

10. **Compress Python bytecode**
    - Use `upx=True` in spec (not recommended for macOS signing)

11. **Exclude unused Python stdlib modules**
    - PyInstaller includes many unused modules
    - Can create custom excludes list

## Size Comparison

| Version | Size | Savings | Notes |
|---------|------|---------|-------|
| Current | 681 MB | - | With sample folder |
| Optimized (no sample) | **~154 MB** | **-527 MB (-77%)** | ✅ Implemented |
| Further optimized | ~130 MB | -551 MB (-81%) | After codec review |
| Highly optimized | ~100 MB | -581 MB (-85%) | Aggressive exclusions |

## DMG Size Impact

Current DMG: 598 MB (87% compression ratio)

After removing sample folder:
- Uncompressed: ~154 MB
- Compressed (DMG): **~134 MB** (87% ratio)
- **Savings: 464 MB (77% reduction)**

## Implementation

### Changes Made:

1. **xsub_native.spec**
   ```python
   # Removed sample folder
   # _add_if_exists(datas, "sample", "sample")
   ```

2. **Created new icon**
   ```bash
   python scripts/create_icon.py
   # Output: icon.icns (1.1 MB, all sizes)
   ```

3. **Build script cleanup** (TODO)
   - Add post-build cleanup of x-caption folder

### Rebuild Command:
```bash
rm -rf dist/ build/
python scripts/build_macos.py --no-sign
```

## Recommendations

### For Production:
✅ Remove sample folder (527 MB saved)
✅ Use new optimized icon (200 KB saved)
⚠️ Test without numpy if unused
⚠️ Test without tesseract if unused

### For Distribution:
- Final DMG: ~134 MB (vs current 598 MB)
- Much faster download
- Better user experience

### Priority Actions:
1. ✅ Remove sample - **DO THIS NOW**
2. ✅ New icon - **DONE**
3. ⚠️ Audit Python dependencies
4. ⚠️ Review codec usage

## Testing Checklist

After optimization, verify:
- [ ] App launches correctly
- [ ] All UI functionality works
- [ ] Video/audio processing works
- [ ] Whisper transcription works
- [ ] Premium activation works
- [ ] Export functionality works

If anything breaks, add back only what's needed.

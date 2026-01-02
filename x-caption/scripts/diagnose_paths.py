#!/usr/bin/env python3
"""
Diagnostic script to check where the installed app is storing data.

Run this to verify the app is using the correct paths.
"""

import sys
import os
from pathlib import Path

# Add the project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

def check_app_paths():
    """Check where the app is storing data."""
    print("=" * 70)
    print("X-Caption Path Diagnostic")
    print("=" * 70)

    # Import after adding to path
    import native_config

    print(f"\n1. Running Mode:")
    print(f"   is_frozen: {native_config.is_frozen()}")
    print(f"   sys.frozen: {getattr(sys, 'frozen', False)}")
    print(f"   has _MEIPASS: {hasattr(sys, '_MEIPASS')}")
    if hasattr(sys, '_MEIPASS'):
        print(f"   _MEIPASS: {sys._MEIPASS}")
    print(f"   sys.executable: {sys.executable}")
    print(f"   __file__: {__file__}")

    print(f"\n2. Detected Paths:")
    config = native_config.get_config()
    for key, value in config.items():
        exists = ""
        if key.endswith('_dir'):
            path_obj = Path(value)
            exists = " ✅" if path_obj.exists() else " ❌"
        print(f"   {key:20s}: {value}{exists}")

    print(f"\n3. Expected Production Path (macOS):")
    expected = Path.home() / "Library" / "Application Support" / "X-Caption"
    print(f"   {expected}")
    print(f"   Exists: {expected.exists()}")
    if expected.exists():
        print(f"   Contents:")
        for item in expected.iterdir():
            size = ""
            if item.is_file():
                size_bytes = item.stat().st_size
                if size_bytes > 1024*1024:
                    size = f" ({size_bytes / (1024*1024):.1f} MB)"
                elif size_bytes > 1024:
                    size = f" ({size_bytes / 1024:.1f} KB)"
                else:
                    size = f" ({size_bytes} bytes)"
            print(f"     - {item.name}{size}")

    print(f"\n4. Data Directory (get_data_dir()):")
    data_dir = native_config.get_data_dir()
    print(f"   {data_dir}")
    print(f"   Exists: {data_dir.exists()}")
    if data_dir.exists():
        print(f"   Contents:")
        for item in data_dir.iterdir():
            size = ""
            if item.is_file():
                size_bytes = item.stat().st_size
                if size_bytes > 1024*1024:
                    size = f" ({size_bytes / (1024*1024):.1f} MB)"
                elif size_bytes > 1024:
                    size = f" ({size_bytes / 1024:.1f} KB)"
                else:
                    size = f" ({size_bytes} bytes)"
            print(f"     - {item.name}{size}")

    print(f"\n5. Checking for .dll files (export limit tracking):")
    if data_dir.exists():
        dll_files = list(data_dir.glob("*.dll"))
        if dll_files:
            print(f"   Found {len(dll_files)} .dll files:")
            for dll in dll_files:
                size_bytes = dll.stat().st_size
                print(f"     - {dll.name} ({size_bytes} bytes)")
        else:
            print(f"   ❌ No .dll files found in {data_dir}")
            print(f"   This means export limits are not being tracked!")

    print(f"\n6. Checking development directory:")
    dev_data = Path(__file__).parent.parent / "data"
    print(f"   {dev_data}")
    print(f"   Exists: {dev_data.exists()}")
    if dev_data.exists():
        dll_files = list(dev_data.glob("*.dll"))
        if dll_files:
            print(f"   ⚠️  Found {len(dll_files)} .dll files in DEV directory:")
            for dll in dll_files:
                print(f"     - {dll.name}")
            print(f"   WARNING: App might be using dev directory instead of production!")

    print(f"\n7. Environment Variables:")
    for var in ['XCAPTION_DATA_DIR', 'XCAPTION_BUNDLE_DIR', 'XCAPTION_MODELS_DIR']:
        val = os.environ.get(var, '(not set)')
        print(f"   {var}: {val}")

    print("\n" + "=" * 70)
    print("Diagnosis Complete")
    print("=" * 70)

    # Provide recommendation
    print("\nRECOMMENDATION:")
    if native_config.is_frozen():
        if data_dir == expected:
            print("✅ App is correctly using production path")
        else:
            print("⚠️  App is frozen but not using expected production path")
    else:
        print("⚠️  App is running in DEVELOPMENT mode")
        print("   This means it's using the source code directory, not the installed app")
        print("   To test the installed app, run this from the installed .app bundle")


if __name__ == "__main__":
    check_app_paths()

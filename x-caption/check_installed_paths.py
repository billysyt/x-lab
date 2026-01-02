#!/usr/bin/env python3
"""
Simple path check - run this FROM the installed app.

Usage:
  /Applications/X-Caption.app/Contents/MacOS/x-caption -c "exec(open('/path/to/check_installed_paths.py').read())"
"""

import sys
import os
from pathlib import Path

print("\n" + "=" * 70)
print("INSTALLED APP PATH CHECK")
print("=" * 70)

print(f"\n1. Python Executable:")
print(f"   {sys.executable}")

print(f"\n2. sys.frozen:")
print(f"   {getattr(sys, 'frozen', False)}")

print(f"\n3. sys._MEIPASS:")
if hasattr(sys, '_MEIPASS'):
    print(f"   {sys._MEIPASS}")
else:
    print(f"   NOT SET")

print(f"\n4. __file__ (if available):")
print(f"   {__file__ if '__file__' in dir() else 'NOT AVAILABLE'}")

# Try to import and check
try:
    sys.path.insert(0, os.path.dirname(sys.executable))
    if hasattr(sys, '_MEIPASS'):
        sys.path.insert(0, sys._MEIPASS)

    import native_config

    print(f"\n5. native_config.is_frozen():")
    print(f"   {native_config.is_frozen()}")

    print(f"\n6. native_config.get_data_dir():")
    data_dir = native_config.get_data_dir()
    print(f"   {data_dir}")
    print(f"   Exists: {data_dir.exists()}")

    if data_dir.exists():
        dll_files = list(data_dir.glob("*.dll"))
        print(f"\n7. .dll files in data_dir:")
        print(f"   Count: {len(dll_files)}")
        for dll in dll_files[:10]:  # Show first 10
            size = dll.stat().st_size
            if size < 1024:
                size_str = f"{size} B"
            elif size < 1024*1024:
                size_str = f"{size/1024:.1f} KB"
            else:
                size_str = f"{size/(1024*1024):.1f} MB"
            print(f"     - {dll.name} ({size_str})")

    print(f"\n8. Expected Production Path:")
    expected = Path.home() / "Library" / "Application Support" / "X-Caption"
    print(f"   {expected}")
    print(f"   Exists: {expected.exists()}")
    print(f"   Matches data_dir: {expected == data_dir}")

except Exception as e:
    print(f"\nERROR importing native_config: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 70 + "\n")

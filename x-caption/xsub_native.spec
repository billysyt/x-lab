# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller specification for building the Windows desktop release.

This spec gathers the web UI, helper binaries, and the Whisper engine assets.

Usage (from project root on Windows):
    pyinstaller xsub_native.spec --clean --noconfirm
"""

import os
from pathlib import Path
from PyInstaller.building.datastruct import TOC
import sys

block_cipher = None

PROJECT_ROOT = Path.cwd()


def _add_if_exists(entries, source, target=None):
    source_path = PROJECT_ROOT / source
    if source_path.exists():
        entries.append((str(source_path), target or source.replace("\\", "/")))


# Static resources that must ship with the executable.
datas = []
_add_if_exists(datas, "templates", "templates")
_add_if_exists(datas, "static", "static")
_add_if_exists(datas, "data/sample", "data/sample")
_add_if_exists(datas, "sample", "sample")
_add_if_exists(datas, "ffmpeg", "ffmpeg")
_add_if_exists(datas, "whisper", "whisper")

icon_path = None
if sys.platform == "win32":
    candidate = PROJECT_ROOT / "icon.ico"
    if candidate.exists():
        icon_path = str(candidate)
        datas.append((icon_path, "."))
elif sys.platform == "darwin":
    candidate = PROJECT_ROOT / "icon.icns"
    if candidate.exists():
        icon_path = str(candidate)
        datas.append((icon_path, "."))

# Optional binaries (only populated on Windows if ffmpeg executables exist).
binaries = []
if sys.platform == "win32":
    ffmpeg_exe = PROJECT_ROOT / "ffmpeg" / "ffmpeg.exe"
    ffprobe_exe = PROJECT_ROOT / "ffmpeg" / "ffprobe.exe"
    if ffmpeg_exe.exists():
        binaries.append((str(ffmpeg_exe), "ffmpeg"))
    if ffprobe_exe.exists():
        binaries.append((str(ffprobe_exe), "ffmpeg"))

if sys.platform == "win32":
    system_dir = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    for dll_name in ("msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll"):
        dll_path = system_dir / dll_name
        if dll_path.exists():
            binaries.append((str(dll_path), f"msvc_runtime/{dll_name}"))

# Hidden imports that PyInstaller cannot detect automatically.
hiddenimports = [
    "engineio.async_drivers.threading",
    "numpy",
    "scipy",
    "soundfile",
]

a = Analysis(
    ["xsub_launcher.py"],
    pathex=[str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tests",
        "pytest",
        "tensorflow",
        "torch",
        "torchvision",
        "pytorch_lightning",
        "lightning",
        "lightning_fabric",
        "lightning_utilities",
        "matplotlib.tests",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

if sys.platform == "win32":
    system_dir = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32"
    replacement_entries = []
    target_names = ("MSVCP140.dll", "MSVCP140_1.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll")
    remove_targets = {f"PyQt5{os.sep}Qt5{os.sep}bin{os.sep}{name}" for name in target_names}
    remove_targets.update({f"PyQt5/Qt5/bin/{name}" for name in target_names})
    filtered = [entry for entry in a.binaries if entry[0] not in remove_targets]

    for dll_name in ("MSVCP140.dll", "MSVCP140_1.dll", "VCRUNTIME140.dll", "VCRUNTIME140_1.dll"):
        dll_path = system_dir / dll_name.lower()
        if not dll_path.exists():
            dll_path = system_dir / dll_name
        if dll_path.exists():
            replacement_entries.append((f"PyQt5/Qt5/bin/{dll_name}", str(dll_path), "BINARY"))
    a.binaries = TOC(filtered + replacement_entries)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe_name = "X-Caption" if sys.platform == "win32" else "x-caption"

exe = EXE(
    pyz,
    a.scripts,
    [],
    [],
    [],
    [],
    name=exe_name,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path,
    exclude_binaries=True,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name=exe_name,
)

"""
Runtime hook for SenseVoice ONNX to ensure proper initialization in PyInstaller builds
"""
import os
import sys
from pathlib import Path


def _prepend_sys_path(path: Path):
    path_str = str(path)
    if path.exists() and path_str not in sys.path:
        sys.path.insert(0, path_str)


def _ensure_dll_visibility(path: Path):
    if not path.exists():
        return

    path_str = str(path)
    if hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(path_str)
        except FileNotFoundError:
            pass

    os.environ["PATH"] = path_str + os.pathsep + os.environ.get("PATH", "")


def _add_sensevoice_paths():
    """Ensure SenseVoice ONNX and its dependencies are importable in PyInstaller builds."""
    if not getattr(sys, "frozen", False):
        return

    bundle_dir = Path(sys._MEIPASS)

    module_paths = [
        bundle_dir,
        bundle_dir / "sensevoice",
        bundle_dir / "sensevoice_onnx",
        bundle_dir / "onnxruntime",
        bundle_dir / "onnxruntime" / "capi",
    ]

    for module_path in module_paths:
        _prepend_sys_path(module_path)

    dll_paths = [
        bundle_dir / "onnxruntime" / "capi",
        bundle_dir / "onnxruntime.libs",
    ]

    for dll_path in dll_paths:
        _ensure_dll_visibility(dll_path)


_add_sensevoice_paths()

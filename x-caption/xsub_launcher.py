#!/usr/bin/env python3
"""
X-Caption Native Launcher
Single executable - no Docker, no Redis, no external dependencies.

This is the main entry point for the bundled application.
It serves the React UI and uses HTTP polling to emulate WebSocket-style updates.
"""
import os
import sys
import hashlib
import logging
import threading
import time
import urllib.error
import urllib.request
import webbrowser
import ctypes
import tempfile
import warnings
import base64
import mimetypes
import platform
import subprocess
import uuid
from pathlib import Path

from native_premium import activate_premium_key, get_premium_details

IS_WINDOWS = sys.platform == "win32"


def _read_text_first(paths):
    for path in paths:
        try:
            value = Path(path).read_text(encoding="utf-8").strip()
        except Exception:
            continue
        if value:
            return value
    return None


def _read_machine_id_windows():
    try:
        import winreg  # type: ignore
    except Exception:
        return None
    try:
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\\Microsoft\\Cryptography") as key:
            value, _ = winreg.QueryValueEx(key, "MachineGuid")
            return str(value).strip() if value else None
    except Exception:
        return None


def _read_machine_id_macos():
    try:
        output = subprocess.check_output(
            ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    for line in output.splitlines():
        if "IOPlatformUUID" in line:
            parts = line.split("=", 1)
            if len(parts) == 2:
                value = parts[1].strip().strip('"')
                return value or None
    return None


def _read_machine_id_linux():
    return _read_text_first(["/etc/machine-id", "/var/lib/dbus/machine-id"])


def _get_stable_machine_id():
    raw_id = None
    if sys.platform == "win32":
        raw_id = _read_machine_id_windows()
    elif sys.platform == "darwin":
        raw_id = _read_machine_id_macos()
    else:
        raw_id = _read_machine_id_linux()

    if not raw_id:
        try:
            node = uuid.getnode()
            raw_id = f"{node:012x}"
        except Exception:
            raw_id = None

    if not raw_id:
        raw_id = platform.node() or "unknown"

    digest = hashlib.sha256(str(raw_id).encode("utf-8")).hexdigest()
    return digest

# Fix Windows console encoding issues
if IS_WINDOWS:
    try:
        os.system("chcp 65001 >nul")
    except Exception:
        pass


def _preload_system_msvc_runtime():
    if not IS_WINDOWS:
        return

    system_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    system32 = system_root / "System32"
    for dll_name in ("msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll"):
        dll_path = system32 / dll_name
        if dll_path.exists():
            try:
                ctypes.WinDLL(str(dll_path))
            except OSError:
                pass


_preload_system_msvc_runtime()

CEF_AVAILABLE = False
QT_WEBENGINE_AVAILABLE = False
if sys.platform == "darwin":
    os.environ["PYWEBVIEW_GUI"] = "cocoa"
    try:
        import cefpython3  # type: ignore

        warnings.simplefilter("ignore", ResourceWarning)
        CEF_AVAILABLE = True
    except ImportError:
        CEF_AVAILABLE = False

    if not CEF_AVAILABLE:
        try:
            import PyQt6  # type: ignore  # noqa: F401
            from PyQt6 import QtWidgets  # type: ignore  # noqa: F401
            from PyQt6.QtWebEngineWidgets import QWebEngineView  # type: ignore  # noqa: F401

            QT_WEBENGINE_AVAILABLE = True
        except ImportError:
            QT_WEBENGINE_AVAILABLE = False
else:
    CEF_AVAILABLE = False
    QT_WEBENGINE_AVAILABLE = False


def warm_up_models():
    """Signal readiness without pre-loading large models."""
    from native_config import MODEL_WARMUP_EVENT

    print("\n" + "=" * 70)
    print("[MODELS] WARM-UP THREAD STARTED")
    print("=" * 70)
    print("[MODELS] Whisper models load on demand.")
    print("[MODELS] ✓ Setting MODEL_WARMUP_EVENT...")
    MODEL_WARMUP_EVENT.set()
    print("[MODELS] WARM-UP THREAD COMPLETED")
    print("=" * 70 + "\n")


_SINGLE_INSTANCE_HANDLE = None
_SINGLE_INSTANCE_FILE = None


def _ensure_single_instance():
    """
    Ensure only one X-Caption instance is running.
    Returns normally if ownership was acquired; raises RuntimeError otherwise.
    """
    global _SINGLE_INSTANCE_HANDLE, _SINGLE_INSTANCE_FILE

    if IS_WINDOWS:
        mutex_name = "Global\\X-CaptionSingleInstance"
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.CreateMutexW(None, False, mutex_name)
        if not handle:
            raise RuntimeError("Failed to create single-instance mutex.")

        ERROR_ALREADY_EXISTS = 183
        last_error = kernel32.GetLastError()
        if last_error == ERROR_ALREADY_EXISTS:
            kernel32.CloseHandle(handle)
            raise RuntimeError("Another X-Caption instance is already running.")

        _SINGLE_INSTANCE_HANDLE = handle
    else:
        import fcntl  # type: ignore

        lock_path = Path(tempfile.gettempdir()) / "x-caption_single_instance.lock"
        file_handle = open(lock_path, "w")
        try:
            fcntl.flock(file_handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            file_handle.close()
            raise RuntimeError("Another X-Caption instance is already running.")

        _SINGLE_INSTANCE_FILE = file_handle
# Set up logging
def _configure_logging():
    """Configure logging to console only."""

    formatter = logging.Formatter(
        "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)

    # Avoid duplicate handlers if already configured
    if getattr(root_logger, "_xcaption_configured", False):
        return

    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    # Console handler (stdout)
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)

    root_logger.addHandler(console_handler)
    root_logger._xcaption_configured = True

_configure_logging()

logger = logging.getLogger("x-caption")

_configure_logging()


def print_banner():
    """Print startup banner."""
    lines = [
        "=" * 70,
        "X-Caption - Native Edition",
        "=" * 70,
        "    Professional Audio Transcription",
        "    No Docker | No Redis | No External Dependencies",
        "=" * 70,
        "",
    ]
    for line in lines:
        print(line)


def _force_exit(code: int = 0):
    """Force terminate the process (used when GUI loop doesn't exit cleanly)."""
    try:
        sys.stdout.flush()
        sys.stderr.flush()
    except Exception:
        pass
    os._exit(code)


def get_resource_path(relative_path: str) -> Path:
    """
    Resolve resources when running from source or a frozen PyInstaller bundle.
    """
    base_path = getattr(sys, "_MEIPASS", None)
    if base_path:
        return Path(base_path) / relative_path
    return Path(__file__).resolve().parent / relative_path


def check_and_setup_environment() -> bool:
    """Check and set up environment."""
    from native_config import get_config, setup_environment
    from native_ffmpeg import setup_ffmpeg_environment, test_ffmpeg

    print("Setting up environment...")
    setup_environment()

    # Display configuration
    config = get_config()
    print(f"Data directory: {config['data_dir']}")
    print(f"Models directory: {config['models_dir']}")

    # Set up FFmpeg
    print("Configuring FFmpeg...")
    ffmpeg_ok = setup_ffmpeg_environment()

    if not ffmpeg_ok:
        print("WARNING: FFmpeg not found!")
        print("   Transcription may not work without FFmpeg.")
        print()
        print("   Please install FFmpeg:")
        if IS_WINDOWS:
            print("     - Download from: https://ffmpeg.org/download.html")
            print("     - Or install with: choco install ffmpeg")
        elif sys.platform == "darwin":
            print("     - Install with: brew install ffmpeg")
        else:
            print("     - Install with: sudo apt install ffmpeg")
        print()

        # Ask user if they want to continue
        interactive = sys.stdin is not None and sys.stdin.isatty()
        if interactive:
            try:
                response = input("   Continue anyway? (y/n): ")
                if response.lower() != "y":
                    print("Exiting...")
                    sys.exit(1)
            except Exception:
                print("   Continuing without FFmpeg... (input unavailable)")
        else:
            print("   Continuing without FFmpeg... (non-interactive mode)")
    else:
        if test_ffmpeg():
            print("FFmpeg is ready")

    print()
    return True


def patch_job_handlers():
    """Patch job handlers to emit WebSocket-style updates."""
    from native_web_server import publish_job_update
    import native_job_handlers

    original_update = native_job_handlers.update_job_progress

    def new_update_job_progress(
        job_id: str,
        progress: int,
        message: str,
        extra_data: dict | None = None,
    ):
        # Call original update
        original_update(job_id, progress, message, extra_data)

        # Also emit WebSocket-style update
        publish_job_update(
            job_id,
            "progress",
            {
                "job_id": job_id,
                "progress": progress,
                "message": message,
                "timestamp": time.time(),
                **(extra_data or {}),
            },
        )

    native_job_handlers.update_job_progress = new_update_job_progress
    logger.info("Job handlers patched for WebSocket emulation")


def start_worker_threads():
    """Start background worker threads."""
    from native_job_queue import start_worker

    print("[WORKER] Starting worker threads...")

    # Start 2 worker threads for processing jobs
    worker = start_worker(num_threads=2)

    print("[OK] Workers started")
    print()

    return worker


def start_web_server(port: int = 11440):
    """Start the web server in a background thread."""
    from native_web_server import create_app, start_server

    print(f"[WEB] Starting web server on port {port}...")
    ui_mode = "React UI"
    if os.environ.get("XCAPTION_UI_DEV_URL") or os.environ.get("XSUB_UI_DEV_URL"):
        ui_mode = "React UI via Vite dev server"
    print(f"[UI] {ui_mode} with WebSocket emulation (HTTP polling)")

    # Patch job handlers for real-time updates
    patch_job_handlers()

    # Create Flask app
    app = create_app()

    # Start server in background thread
    server_thread = threading.Thread(
        target=start_server,
        args=(app, port, "127.0.0.1"),
        daemon=True,
    )
    server_thread.start()

    # Wait for server to start
    time.sleep(0.5)

    print("[OK] Web server started")
    print()

    return server_thread


def open_browser(port: int = 11440, width: int = 1480, height: int = 900) -> str:
    """Open native window with embedded Chromium, falling back to system browser."""
    from native_config import VERSION

    host = "127.0.0.1"
    url = f"http://{host}:{port}"
    dev_url = os.environ.get("XCAPTION_UI_DEV_URL") or os.environ.get("XSUB_UI_DEV_URL")
    if dev_url:
        url = dev_url.strip()
    icon_filename = "icon.ico" if IS_WINDOWS else "icon.icns"
    icon_path = get_resource_path(icon_filename)

    print(f"[UI] Opening embedded window: {url}")
    if sys.platform == "darwin":
        if CEF_AVAILABLE:
            print("[INFO] Using CEF backend for embedded Chromium window.")
        elif QT_WEBENGINE_AVAILABLE:
            print("[INFO] Using PyQt6 WebEngine backend for embedded Chromium window.")
        else:
            note = "Install 'cefpython3' (Python 3.10/3.11) or 'PyQt6'+'PyQt6-WebEngine' to enable Chromium embedding on macOS."
            print(f"[INFO] No Chromium backend detected. {note}")

    placeholder_html = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>X-Caption Loading</title>
  <style>
    :root { color-scheme: dark; }
    body {
      background: #10131a;
      color: #f5f7fb;
      font-family: "Segoe UI", "Helvetica Neue", sans-serif;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      text-align: center;
    }
    .spinner {
      width: 56px;
      height: 56px;
      border: 6px solid rgba(255, 255, 255, 0.12);
      border-top-color: #4dabf7;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="spinner"></div>
</body>
</html>
"""


    try:
        import webview  # type: ignore

        class EmbeddedBridge:
            """Expose native helpers to the web UI when running inside pywebview."""

            def __init__(self, webview_module):
                self._webview = webview_module
                self._window = None
                self._machine_id = None

            def attach(self, window):
                self._window = window

            def get_machine_id(self):
                if self._machine_id is None:
                    self._machine_id = _get_stable_machine_id()
                return {"success": True, "id": self._machine_id}

            def getMachineId(self):
                """Alias for camelCase access from JavaScript."""
                return self.get_machine_id()

            def get_premium_status(self):
                machine_id = self.get_machine_id().get("id")
                if not machine_id:
                    return {"success": False, "premium": False, "error": "machine_id_missing"}
                details = get_premium_details(machine_id)
                return {
                    "success": True,
                    "premium": details.get("premium", False),
                    "reason": details.get("reason"),
                    "license": details.get("license"),
                    "machine_id": machine_id,
                }

            def getPremiumStatus(self):
                """Alias for camelCase access from JavaScript."""
                return self.get_premium_status()

            def set_premium_key(self, license_key: str):
                machine_id = self.get_machine_id().get("id")
                if not machine_id:
                    return {"success": False, "error": "machine_id_missing"}
                result = activate_premium_key(machine_id, license_key)
                if result.get("success"):
                    result["machine_id"] = machine_id
                return result

            def setPremiumKey(self, license_key: str):
                """Alias for camelCase access from JavaScript."""
                return self.set_premium_key(license_key)

            def save_transcript(self, filename: str, content: str):
                """
                Save transcript content through a native save dialog.
                Returns a dict so the front-end can differentiate success/cancel/error.
                """
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}

                safe_name = (filename or "transcript.txt").strip() or "transcript.txt"
                try:
                    dialog_result = self._window.create_file_dialog(
                        self._webview.SAVE_DIALOG,
                        save_filename=safe_name,
                        file_types=("Text files (*.txt)", "All files (*.*)"),
                    )
                except TypeError:
                    # Older runtimes may not accept file_types
                    dialog_result = self._window.create_file_dialog(
                        self._webview.SAVE_DIALOG,
                        save_filename=safe_name,
                    )

                if not dialog_result:
                    return {"success": False, "cancelled": True}

                if isinstance(dialog_result, (list, tuple)):
                    target_path = dialog_result[0]
                else:
                    target_path = dialog_result

                if not target_path:
                    return {"success": False, "error": "invalid_path"}

                try:
                    Path(target_path).write_text(str(content), encoding="utf-8")
                except Exception as exc:  # pragma: no cover - defensive
                    logger.error("Failed to write transcript: %s", exc)
                    return {"success": False, "error": str(exc)}

                logger.info("Transcript saved via native dialog: %s", target_path)
                return {"success": True, "path": str(target_path)}

            def saveTranscript(self, filename: str, content: str):
                """Alias for camelCase access from JavaScript."""
                return self.save_transcript(filename, content)

            def _read_file_payload(self, target_path: str):
                try:
                    path = Path(target_path).expanduser()
                except Exception:
                    return {"success": False, "error": "invalid_path"}

                if not path.exists() or not path.is_file():
                    return {"success": False, "error": "file_not_found"}

                try:
                    data = path.read_bytes()
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}

                mime_type, _ = mimetypes.guess_type(str(path))
                return {
                    "success": True,
                    "file": {
                        "name": path.name,
                        "data": base64.b64encode(data).decode("ascii"),
                        "mime": mime_type or "application/octet-stream",
                        "size": path.stat().st_size,
                    },
                }

            def open_media_dialog(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}

                media_extensions = {
                    "mp4",
                    "m4v",
                    "mov",
                    "mkv",
                    "avi",
                    "webm",
                    "flv",
                    "mpg",
                    "mpeg",
                    "mp3",
                    "wav",
                    "flac",
                    "m4a",
                    "aac",
                    "ogg",
                    "opus",
                }
                media_pattern = ";".join(f"*.{ext}" for ext in sorted(media_extensions))
                file_types = ((f"Media files ({media_pattern})", media_pattern),)
                try:
                    dialog_result = self._window.create_file_dialog(
                        self._webview.OPEN_DIALOG,
                        allow_multiple=False,
                        file_types=file_types,
                    )
                except TypeError:
                    dialog_result = self._window.create_file_dialog(
                        self._webview.OPEN_DIALOG,
                        allow_multiple=False,
                    )

                if not dialog_result:
                    return {"success": False, "cancelled": True}

                if isinstance(dialog_result, (list, tuple)):
                    target_path = dialog_result[0]
                else:
                    target_path = dialog_result

                if not target_path:
                    return {"success": False, "error": "invalid_path"}

                suffix = Path(str(target_path)).suffix.lower().lstrip(".")
                if suffix not in media_extensions:
                    return {"success": False, "error": "unsupported_file"}

                try:
                    file_size = Path(str(target_path)).stat().st_size
                except Exception:
                    file_size = None

                mime_type, _ = mimetypes.guess_type(str(target_path))
                return {
                    "success": True,
                    "file": {
                        "name": Path(str(target_path)).name,
                        "path": str(target_path),
                        "mime": mime_type or "application/octet-stream",
                        "size": file_size,
                    },
                    "mode": "path",
                }

            def openMediaDialog(self):
                """Alias for camelCase access from JavaScript."""
                return self.open_media_dialog()

            def read_file(self, target_path: str):
                """Read a file by path (used for large local files)."""
                return self._read_file_payload(target_path)

            def readFile(self, target_path: str):
                """Alias for camelCase access from JavaScript."""
                return self.read_file(target_path)

            def open_srt_dialog(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}

                file_types = (("SubRip files (*.srt)", "*.srt"),)
                try:
                    dialog_result = self._window.create_file_dialog(
                        self._webview.OPEN_DIALOG,
                        allow_multiple=False,
                        file_types=file_types,
                    )
                except TypeError:
                    dialog_result = self._window.create_file_dialog(
                        self._webview.OPEN_DIALOG,
                        allow_multiple=False,
                    )

                if not dialog_result:
                    return {"success": False, "cancelled": True}

                if isinstance(dialog_result, (list, tuple)):
                    target_path = dialog_result[0]
                else:
                    target_path = dialog_result

                if not target_path:
                    return {"success": False, "error": "invalid_path"}

                if not str(target_path).lower().endswith(".srt"):
                    return {"success": False, "error": "unsupported_file"}

                return self._read_file_payload(target_path)

            def openSrtDialog(self):
                """Alias for camelCase access from JavaScript."""
                return self.open_srt_dialog()

            def window_minimize(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "minimize"):
                        self._window.minimize()
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_close(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._webview, "destroy_window"):
                        self._webview.destroy_window(self._window)
                        threading.Timer(0.2, _force_exit).start()
                        return {"success": True}
                    if hasattr(self._window, "destroy"):
                        self._window.destroy()
                        threading.Timer(0.2, _force_exit).start()
                        return {"success": True}
                    if hasattr(self._window, "close"):
                        self._window.close()
                        threading.Timer(0.2, _force_exit).start()
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_toggle_maximize(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    is_maximized = None
                    if hasattr(self._window, "is_maximized"):
                        checker = getattr(self._window, "is_maximized")
                        if callable(checker):
                            is_maximized = checker()
                        elif isinstance(checker, bool):
                            is_maximized = checker
                    if is_maximized and hasattr(self._window, "restore"):
                        self._window.restore()
                        return {"success": True}
                    if hasattr(self._window, "maximize"):
                        self._window.maximize()
                        return {"success": True}
                    if hasattr(self._window, "toggle_fullscreen"):
                        self._window.toggle_fullscreen()
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_zoom(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if sys.platform == "darwin":
                        ns_window = None
                        for attr in ("_window", "window", "ns_window", "_ns_window"):
                            candidate = getattr(self._window, attr, None)
                            if candidate is not None and hasattr(candidate, "zoom_"):
                                ns_window = candidate
                                break
                        if ns_window is not None:
                            ns_window.zoom_(None)
                            return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return self.window_toggle_maximize()

            def window_toggle_fullscreen(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "toggle_fullscreen"):
                        self._window.toggle_fullscreen()
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_restore(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "restore"):
                        self._window.restore()
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_get_size(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "get_size"):
                        width, height = self._window.get_size()
                        return {"success": True, "width": width, "height": height}
                    if hasattr(self._window, "width") and hasattr(self._window, "height"):
                        return {
                            "success": True,
                            "width": getattr(self._window, "width"),
                            "height": getattr(self._window, "height"),
                        }
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_set_size(self, width: float, height: float):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "resize"):
                        self._window.resize(int(width), int(height))
                        return {"success": True}
                    if hasattr(self._window, "set_size"):
                        self._window.set_size(int(width), int(height))
                        return {"success": True}
                    if hasattr(self._window, "resize_to"):
                        self._window.resize_to(int(width), int(height))
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_get_position(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "get_position"):
                        x, y = self._window.get_position()
                        return {"success": True, "x": x, "y": y}
                    if hasattr(self._window, "x") and hasattr(self._window, "y"):
                        return {"success": True, "x": self._window.x, "y": self._window.y}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_move(self, x: float, y: float):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "move"):
                        self._window.move(int(x), int(y))
                        return {"success": True}
                    if hasattr(self._window, "set_position"):
                        self._window.set_position(int(x), int(y))
                        return {"success": True}
                    if hasattr(self._window, "set_location"):
                        self._window.set_location(int(x), int(y))
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}


            def window_get_on_top(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "on_top"):
                        return {"success": True, "onTop": bool(getattr(self._window, "on_top"))}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_set_on_top(self, value: bool):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if hasattr(self._window, "on_top"):
                        setattr(self._window, "on_top", bool(value))
                        return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}
                return {"success": False, "error": "unsupported"}

            def window_start_drag(self):
                if not self._window:
                    return {"success": False, "error": "window_not_ready"}
                try:
                    if sys.platform != "darwin":
                        return {"success": False, "error": "unsupported"}
                    native_window = getattr(self._window, "native", None)
                    if not native_window or not hasattr(native_window, "performWindowDragWithEvent_"):
                        return {"success": False, "error": "unsupported"}
                    try:
                        from AppKit import NSApp
                    except Exception as exc:
                        return {"success": False, "error": str(exc)}
                    event = NSApp.currentEvent()
                    if not event:
                        return {"success": False, "error": "no_event"}
                    native_window.performWindowDragWithEvent_(event)
                    return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}

            def open_external(self, url: str):
                if not url:
                    return {"success": False, "error": "invalid_url"}
                try:
                    import webbrowser

                    webbrowser.open(url)
                    return {"success": True}
                except Exception as exc:  # pragma: no cover - defensive
                    return {"success": False, "error": str(exc)}

        bridge = EmbeddedBridge(webview)

        try:
            webview.settings["DRAG_REGION_SELECTOR"] = ".pywebview-drag-region"
            if "DRAG_REGION_DIRECT_TARGET_ONLY" in webview.settings:
                webview.settings["DRAG_REGION_DIRECT_TARGET_ONLY"] = False
            if "ALLOW_FULLSCREEN" in webview.settings:
                webview.settings["ALLOW_FULLSCREEN"] = True
        except Exception:
            pass

        window_kwargs = {
            "title": f"X-Caption {VERSION}",
            "html": placeholder_html,
            "width": width,
            "height": height,
            "min_size": (360, 640),
            "resizable": True,
            "easy_drag": False,
            "frameless": IS_WINDOWS or sys.platform == "darwin",
            "js_api": bridge,
        }

        window = webview.create_window(**window_kwargs)
        if sys.platform == "darwin":
            try:
                from AppKit import (
                    NSWindowStyleMaskBorderless,
                    NSWindowStyleMaskClosable,
                    NSWindowStyleMaskMiniaturizable,
                    NSWindowStyleMaskResizable,
                )
                try:
                    from AppKit import NSWindowTitleHidden
                except Exception:
                    NSWindowTitleHidden = 1
            except Exception:
                pass
            else:
                try:
                    native_window = getattr(window, "native", None)
                    if native_window and hasattr(native_window, "setStyleMask_"):
                        mask = (
                            NSWindowStyleMaskBorderless
                            | NSWindowStyleMaskResizable
                            | NSWindowStyleMaskMiniaturizable
                            | NSWindowStyleMaskClosable
                        )
                        native_window.setStyleMask_(mask)
                        if hasattr(native_window, "setTitleVisibility_"):
                            native_window.setTitleVisibility_(NSWindowTitleHidden)
                        if hasattr(native_window, "setTitlebarAppearsTransparent_"):
                            native_window.setTitlebarAppearsTransparent_(True)
                    if native_window and hasattr(native_window, "setMovableByWindowBackground_"):
                        native_window.setMovableByWindowBackground_(False)
                except Exception:
                    pass

        bridge.attach(window)

        if icon_path.exists() and hasattr(window, "icon"):
            try:
                window.icon = str(icon_path)
            except Exception:
                pass

        def poll_and_load():
            wait_for_server(port)
            if dev_url:
                wait_for_url(dev_url)
            print("[WEB] Backend is ready. Loading interface...")
            window.load_url(url)

        threading.Thread(target=poll_and_load, daemon=True).start()

        backend_candidates: list[str | None] = []
        if IS_WINDOWS:
            backend_candidates.extend(["edgechromium", "mshtml"])
        elif sys.platform == "darwin":
            backend_candidates.append("cocoa")
        elif sys.platform.startswith("linux"):
            backend_candidates.extend(["edgechromium", "cef", "qt", "gtk"])

        if sys.platform != "darwin":
            backend_candidates.append(None)  # auto-detect fallback

        def on_webview_ready():
            try:
                if sys.platform == "darwin":
                    try:
                        native_window = getattr(window, "native", None)
                        if native_window:
                            native_window.setMovableByWindowBackground_(False)
                    except Exception:
                        pass
                if IS_WINDOWS and hasattr(window, "maximize"):
                    window.maximize()
            except Exception:
                logger.debug("Failed to maximize window", exc_info=True)

        start_kwargs = {"debug": False, "func": on_webview_ready}

        for backend in backend_candidates:
            try:
                if backend:
                    logger.info("Attempting pywebview backend '%s'", backend)
                    webview.start(gui=backend, **start_kwargs)
                else:
                    logger.info("Attempting pywebview with auto-detected backend")
                    webview.start(**start_kwargs)
                return "native"
            except (ValueError, RuntimeError) as backend_error:
                if backend is None:
                    raise
                if backend == "cef":
                    logger.warning(
                        "CEF backend unavailable (%s). Install 'cefpython3' and ensure it supports your Python version to use embedded Chromium.",
                        backend_error,
                    )
                logger.warning(
                    "pywebview backend '%s' unavailable (%s). Trying next option...",
                    backend,
                    backend_error,
                )
        raise RuntimeError("No pywebview backend succeeded")

    except ImportError as exc:
        logger.warning("pywebview not available: %s", exc)

    except Exception as exc:
        logger.error("Failed to open embedded window: %s", exc, exc_info=True)
    ready = wait_for_server(port)
    if not ready:
        print("[WEB] Backend is still starting; the page may take a while to load.")
    webbrowser.open(url, new=2)
    print(f"[INFO] Browser opened at {url}")
    return "fallback"


def wait_for_server(port: int = 11440, timeout: float = 10.0) -> bool:
    """Wait for the HTTP server health endpoint to become available."""
    health_url = f"http://127.0.0.1:{port}/health"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    start = time.time()
    printed = False

    while time.time() - start < timeout:
        try:
            request = urllib.request.Request(health_url)
            with opener.open(request, timeout=2) as response:
                if response.status == 200:
                    if printed:
                        print("[WEB] Server is ready.")
                    return True
        except urllib.error.URLError:
            pass
        except Exception as exc:
            logger.debug("Health check attempt failed: %s", exc)
        if not printed and time.time() - start > 1.5:
            print("[WEB] Still starting up... heavy libraries are loading, please wait.")
            printed = True
        time.sleep(0.2)

    print("[WEB] Server is taking longer than expected but will continue starting in the background.")
    print(f"      You can periodically refresh {health_url} to check availability.")
    return False


def wait_for_url(url: str, timeout: float = 30.0) -> bool:
    """Wait for an arbitrary HTTP URL to respond with 2xx/3xx."""
    target = (url or "").strip()
    if not target:
        return False

    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    start = time.time()
    printed = False

    while time.time() - start < timeout:
        try:
            request = urllib.request.Request(target)
            with opener.open(request, timeout=2) as response:
                if 200 <= response.status < 400:
                    if printed:
                        print(f"[UI] Dev server is ready: {target}")
                    return True
        except urllib.error.URLError:
            pass
        except Exception as exc:
            logger.debug("Dev UI check attempt failed: %s", exc)
        if not printed and time.time() - start > 1.5:
            print(f"[UI] Waiting for dev UI server... ({target})")
            printed = True
        time.sleep(0.5)

    print("[UI] Dev UI server is taking longer than expected.")
    print(f"     You can open it manually: {target}")
    return False


def show_running_info(port: int = 11440):
    """Show information about the running application."""
    dev_url = os.environ.get("XCAPTION_UI_DEV_URL") or os.environ.get("XSUB_UI_DEV_URL")
    lines = [
        "=" * 70,
        "[OK]  X-Caption is now running!",
        "=" * 70,
        "",
        f"Web Interface:  {dev_url}" if dev_url else f"Web Interface:  http://localhost:{port}",
        f"Backend API:    http://localhost:{port}" if dev_url else f"Health Check:   http://localhost:{port}/health",
        "",
        "Features:",
        "   - Upload audio/video files for transcription",
        "   - Support for multiple languages (Chinese, English, Japanese, Korean)",
        "   - Whisper.cpp offline transcription",
        "   - On-demand model download with progress",
        "   - Real-time progress updates",
        "   - Download transcription results",
        "",
        "Supported formats:",
        "   MP3, WAV, M4A, FLAC, OGG, MP4, AVI, MOV",
        "",
        "WebSocket Mode: HTTP polling (no external dependencies)",
        "",
        "Press Ctrl+C in this window to stop the application.",
        "",
    ]
    for line in lines:
        print(line)


def main():
    """Main application entry point."""
    try:
        _ensure_single_instance()
    except RuntimeError as instance_error:
        logger.warning(str(instance_error))
        if IS_WINDOWS:
            try:
                ctypes.windll.user32.MessageBoxW(None, str(instance_error), "X-Caption", 0x00000040)
            except Exception:
                pass
        else:
            print(str(instance_error))
        return

    try:
        print_banner()
        check_and_setup_environment()
        warmup_thread = threading.Thread(target=warm_up_models, name="ModelWarmup", daemon=True)
        warmup_thread.start()
        start_worker_threads()

        port = int(os.environ.get("PORT", 11440))
        start_web_server(port)
        show_running_info(port)

        launch_mode = open_browser(port)

        if launch_mode == "native":
            print()
            print("=" * 70)
            print("X-Caption window closed.")
            print("=" * 70)
            print("Thank you for using X-Caption!")
            print()
            _force_exit(0)

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            print()
            print("=" * 70)
            print("Shutting down...")
            print("=" * 70)
            print()
            print("Thank you for using X-Caption!")
            print()

    except Exception as exc:
        import traceback

        logger.error("Application error: %s", exc, exc_info=True)
        print()
        print("=" * 70)
        print("Application Error - X-Caption has crashed")
        print("=" * 70)
        print(f"Error: {exc}")
        print(f"Error Type: {type(exc).__name__}")
        print()
        print(traceback.format_exc())
        print()

        # Provide helpful suggestions based on common errors
        error_str = str(exc).upper()
        if "CUDA" in error_str or "GPU" in error_str:
            print("Hint: This appears to be a CUDA/GPU error.")
            print("   Try setting device='cpu' in transcription settings.")
        elif "MODEL" in error_str or "WHISPER" in error_str:
            print("Hint: Whisper model issue detected.")
            print("   Run 'python model_manager.py --download' to download the model,")
            print("   or use the in-app downloader from the AI Generate Caption button.")
        elif "MEMORY" in error_str:
            print("Hint: Memory error detected.")
            print("   Try with a smaller audio file or restart your computer.")
        elif "DLL" in error_str:
            print("Hint: DLL loading error detected.")
            print("   This may be due to missing system dependencies.")
        else:
            print("Hint: For troubleshooting:")
            print("   1. Check crash_report.json for detailed stack traces")
            print("   2. Confirm Whisper model exists in data/models/whisper/model.bin")
            print("   3. Run 'python xsub_launcher.py --help' for diagnostics")

        print()
        if IS_WINDOWS:
            try:
                input("Press Enter to exit...")
            except Exception:
                pass

        sys.exit(1)


if __name__ == "__main__":
    main()

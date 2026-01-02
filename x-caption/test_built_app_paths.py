#!/usr/bin/env python3
"""
Test the built app's path detection by running it as a subprocess.
"""
import subprocess
import sys
from pathlib import Path

# Path to built app
app_path = Path(__file__).parent / "dist" / "X-Caption.app"
executable = app_path / "Contents" / "MacOS" / "x-caption"

if not executable.exists():
    print(f"ERROR: App not found at {executable}")
    sys.exit(1)

print("=" * 70)
print("TESTING BUILT APP PATH DETECTION")
print("=" * 70)
print(f"Executable: {executable}")
print()

# Create a test script that will be run by the app
test_script = '''
import sys
from pathlib import Path

print("\\n=== FROZEN STATE DETECTION ===")
print(f"sys.frozen: {getattr(sys, 'frozen', False)}")
print(f"sys._MEIPASS exists: {hasattr(sys, '_MEIPASS')}")
if hasattr(sys, '_MEIPASS'):
    print(f"sys._MEIPASS: {sys._MEIPASS}")
print(f"sys.executable: {sys.executable}")
print(f"'.app/Contents/MacOS' in path: {'.app/Contents/MacOS' in str(sys.executable)}")

# Import and check native_config
try:
    from native_config import is_frozen, get_bundle_dir, get_data_dir

    print("\\n=== NATIVE_CONFIG RESULTS ===")
    print(f"is_frozen(): {is_frozen()}")
    print(f"get_bundle_dir(): {get_bundle_dir()}")
    print(f"get_data_dir(): {get_data_dir()}")

    # Check expected paths
    expected_prod = Path.home() / "Library" / "Application Support" / "X-Caption"
    actual_data = get_data_dir()

    print("\\n=== PATH VERIFICATION ===")
    print(f"Expected production path: {expected_prod}")
    print(f"Actual data_dir: {actual_data}")
    print(f"Matches expected: {expected_prod == actual_data}")

    # Check if data dir was created
    print(f"Data dir exists: {actual_data.exists()}")

except Exception as e:
    print(f"\\nERROR: {e}")
    import traceback
    traceback.print_exc()
'''

# Run the test script via the app
try:
    result = subprocess.run(
        [str(executable), "-c", test_script],
        capture_output=True,
        text=True,
        timeout=10
    )

    print(result.stdout)
    if result.stderr:
        print("STDERR:")
        print(result.stderr)

    print("=" * 70)
    print(f"Exit code: {result.returncode}")
    print("=" * 70)

except subprocess.TimeoutExpired:
    print("ERROR: Test timed out")
except Exception as e:
    print(f"ERROR: {e}")

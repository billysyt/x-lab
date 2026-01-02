#!/usr/bin/env python3
"""Test script to verify export limit tamper detection."""
import shutil
from pathlib import Path
from native_export_limits import (
    load_export_usage,
    save_export_usage,
    increment_export_usage,
    _usage_paths,
    _get_system_storage_paths,
    _get_install_marker_paths,
    MAX_FREE_EXPORTS,
)
from native_config import get_data_dir

# Test machine ID
TEST_MACHINE_ID = "test-machine-12345"


def print_section(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}\n")


def show_storage_locations():
    """Display all storage locations."""
    print("Storage locations:")
    print(f"  Data directory: {get_data_dir()}")

    primary, backup = _usage_paths(TEST_MACHINE_ID)
    print(f"\n  Primary: {primary}")
    print(f"  Backup: {backup}")

    system_paths = _get_system_storage_paths(TEST_MACHINE_ID)
    print(f"\n  System storage paths:")
    for i, path in enumerate(system_paths, 1):
        print(f"    {i}. {path}")

    marker_paths = _get_install_marker_paths(TEST_MACHINE_ID)
    print(f"\n  Install marker paths:")
    for i, path in enumerate(marker_paths, 1):
        print(f"    {i}. {path}")


def clean_all_test_files():
    """Remove all test files."""
    primary, backup = _usage_paths(TEST_MACHINE_ID)
    system_paths = _get_system_storage_paths(TEST_MACHINE_ID)
    marker_paths = _get_install_marker_paths(TEST_MACHINE_ID)

    for path in [primary, backup, *system_paths, *marker_paths]:
        try:
            if path.exists():
                path.unlink()
                print(f"  ✓ Deleted: {path.name}")
        except Exception as e:
            print(f"  ✗ Failed to delete {path.name}: {e}")


def test_normal_usage():
    """Test 1: Normal usage scenario."""
    print_section("TEST 1: Normal Usage (First Time)")

    # Clean start
    clean_all_test_files()

    # First load should be 0
    usage = load_export_usage(TEST_MACHINE_ID)
    print(f"Initial count: {usage['count']}, tampered: {usage['tampered']}")
    assert usage['count'] == 0, "Initial count should be 0"
    assert not usage['tampered'], "Should not be tampered initially"

    # Increment 3 times
    for i in range(3):
        result = increment_export_usage(TEST_MACHINE_ID)
        print(f"Export #{i+1}: count={result['count']}, remaining={result['remaining']}, limited={result['limited']}")

    # Verify count is 3
    usage = load_export_usage(TEST_MACHINE_ID)
    assert usage['count'] == 3, "Count should be 3"
    print(f"\n✓ Test passed: Count is {usage['count']}")


def test_file_deletion():
    """Test 2: User deletes data files to reset count."""
    print_section("TEST 2: Tamper Detection (Delete Data Files)")

    # Ensure we have data
    save_export_usage(TEST_MACHINE_ID, 10)
    print("Saved count: 10")

    # Verify it's saved
    usage = load_export_usage(TEST_MACHINE_ID)
    print(f"Loaded count: {usage['count']}, tampered: {usage['tampered']}")

    # User tries to delete ONLY the main data files
    primary, backup = _usage_paths(TEST_MACHINE_ID)
    print(f"\n🔨 User deletes primary and backup files...")
    if primary.exists():
        primary.unlink()
        print(f"  ✓ Deleted: {primary.name}")
    if backup.exists():
        backup.unlink()
        print(f"  ✓ Deleted: {backup.name}")

    # Load again - should detect tampering
    usage = load_export_usage(TEST_MACHINE_ID)
    print(f"\nAfter deletion:")
    print(f"  Count: {usage['count']}")
    print(f"  Tampered: {usage['tampered']}")
    print(f"  Limited: {usage['count'] > MAX_FREE_EXPORTS}")

    if usage['count'] > MAX_FREE_EXPORTS:
        print(f"\n✓ Test passed: User is blocked (count={usage['count']} > {MAX_FREE_EXPORTS})")
    else:
        print(f"\n✗ Test FAILED: User can still use app (count={usage['count']})")


def test_complete_wipe():
    """Test 3: User deletes ALL files including system storage."""
    print_section("TEST 3: Complete Wipe Attack")

    # Ensure we have data
    save_export_usage(TEST_MACHINE_ID, 8)
    print("Saved count: 8")

    # Verify storage exists
    primary, backup = _usage_paths(TEST_MACHINE_ID)
    system_paths = _get_system_storage_paths(TEST_MACHINE_ID)
    marker_paths = _get_install_marker_paths(TEST_MACHINE_ID)

    print("\nFiles before wipe:")
    all_paths = [primary, backup, *system_paths, *marker_paths]
    for path in all_paths:
        if path.exists():
            print(f"  ✓ {path.name}")

    # User tries to delete EVERYTHING
    print(f"\n🔨 User deletes ALL files (including system storage)...")
    clean_all_test_files()

    # Load again - should still detect because install markers existed
    usage = load_export_usage(TEST_MACHINE_ID)
    print(f"\nAfter complete wipe:")
    print(f"  Count: {usage['count']}")
    print(f"  Tampered: {usage['tampered']}")
    print(f"  Limited: {usage['count'] > MAX_FREE_EXPORTS}")

    # Note: If ALL files are deleted including markers, this becomes a "reinstall"
    # In that case, it's reasonable to allow reset
    if usage['count'] == 0:
        print(f"\n⚠️  Complete wipe successful (simulates reinstall on new machine)")
        print(f"  This is expected behavior - user deleted all traces")


def test_reinstall_scenario():
    """Test 4: Simulate app reinstall (but system files remain)."""
    print_section("TEST 4: App Reinstall (System Files Survive)")

    # Setup: Save some usage
    save_export_usage(TEST_MACHINE_ID, 12)
    print("Saved count: 12")

    # Verify system storage exists
    system_paths = _get_system_storage_paths(TEST_MACHINE_ID)
    marker_paths = _get_install_marker_paths(TEST_MACHINE_ID)

    # Simulate uninstall: delete app data directory files only
    print(f"\n🔨 Simulating uninstall (delete app data files only)...")
    primary, backup = _usage_paths(TEST_MACHINE_ID)
    if primary.exists():
        primary.unlink()
        print(f"  ✓ Deleted: {primary.name}")
    if backup.exists():
        backup.unlink()
        print(f"  ✓ Deleted: {backup.name}")

    print(f"\nSystem files still exist:")
    for path in [*system_paths, *marker_paths]:
        if path.exists():
            print(f"  ✓ {path.name}")

    # Simulate reinstall: load usage
    usage = load_export_usage(TEST_MACHINE_ID)
    print(f"\nAfter 'reinstall':")
    print(f"  Count: {usage['count']}")
    print(f"  Tampered: {usage['tampered']}")

    if usage['count'] >= 12:
        print(f"\n✓ Test passed: Count preserved after reinstall (count={usage['count']})")
    else:
        print(f"\n✗ Test FAILED: Count lost (count={usage['count']} < 12)")


def main():
    print_section("Export Limit Tamper Detection Test Suite")

    show_storage_locations()

    # Run tests
    test_normal_usage()
    test_file_deletion()
    test_complete_wipe()
    test_reinstall_scenario()

    print_section("All Tests Complete")
    print("Note: The security works by:")
    print("  1. Storing count in MULTIPLE locations (data dir + system paths + registry)")
    print("  2. Creating install markers that prove app was used before")
    print("  3. If main files deleted but markers exist → TAMPERED (blocked)")
    print("  4. Takes highest count from all locations")
    print("\n⚠️  To reset, user would need to find and delete ALL hidden files")
    print("  across multiple system directories - very difficult!")

    # Cleanup
    print(f"\n🧹 Cleaning up test files...")
    clean_all_test_files()


if __name__ == "__main__":
    main()

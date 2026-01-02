import { useEffect } from "react";

/**
 * Hook to enable window resize for frameless windows on Windows
 * The actual setup now happens automatically on the Python side during window initialization
 * This hook is kept for future extensions if needed
 */
export function useWindowResize() {
  // No-op: Resize is now handled automatically during window creation
  return;
}

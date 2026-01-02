import { useCallback, useEffect, useMemo } from "react";
import { buildUpdateModalInfo, type UpdateModalInfo } from "../../../lib/update";
import { compareVersions } from "../../../lib/format";
import { useAppDispatch, useAppSelector } from "../../../hooks";
import { setUpdateModal as setUpdateModalAction } from "../../layout/uiSlice";

export function useUpdateCheck(appVersion: string | null) {
  const dispatch = useAppDispatch();
  const updateModal = useAppSelector((state) => state.app.updateModal);
  const setUpdateModal = useCallback(
    (value: UpdateModalInfo | null) => {
      dispatch(setUpdateModalAction(value));
    },
    [dispatch]
  );

  useEffect(() => {
    const updateUrl = (import.meta as any)?.env?.VITE_UPDATE_CHECK_URL;
    if (!updateUrl || typeof updateUrl !== "string") {
      console.log("[UpdateCheck] VITE_UPDATE_CHECK_URL not configured, skipping update check");
      return;
    }
    const envVersion =
      typeof (import.meta as any)?.env?.VITE_APP_VERSION === "string"
        ? (import.meta as any).env.VITE_APP_VERSION
        : null;
    const fallbackVersion = appVersion || (envVersion ? String(envVersion).trim() : null);
    const updateProject =
      (import.meta as any)?.env?.VITE_UPDATE_PROJECT ??
      (import.meta as any)?.env?.VITE_UPDATE_PROJECT_NAME ??
      "x-caption";

    console.log("[UpdateCheck] Initializing:", {
      updateUrl,
      project: updateProject,
      version: fallbackVersion
    });

    let cancelled = false;
    const loadCachedUpdate = async () => {
      try {
        console.log("[UpdateCheck] Loading cached update...");
        const response = await fetch(`/api/update/cache?project=${encodeURIComponent(updateProject)}`, {
          cache: "no-store"
        });
        if (!response.ok) {
          console.log("[UpdateCheck] Cache not found or error:", response.status);
          return;
        }
        const cached = await response.json();
        if (cancelled || !cached) return;
        const cachedPayload = cached?.payload ?? null;
        console.log("[UpdateCheck] Cached update loaded:", cachedPayload ? "yes" : "no");
        const info = buildUpdateModalInfo(cachedPayload, fallbackVersion, updateProject);
        if (info) {
          console.log("[UpdateCheck] Update modal set:", info);
          setUpdateModal(info);
        }
      } catch (error) {
        console.error("[UpdateCheck] Error loading cache:", error);
      }
    };
    const storeCachedUpdate = async (payload: any) => {
      try {
        console.log("[UpdateCheck] Storing update cache...");
        await fetch("/api/update/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: updateProject, payload })
        });
        console.log("[UpdateCheck] Update cache stored successfully");
      } catch (error) {
        console.error("[UpdateCheck] Error storing cache:", error);
      }
    };
    const fetchLatestUpdate = async () => {
      try {
        const url = new URL(updateUrl, window.location.origin);
        if (updateProject) {
          url.searchParams.set("project", updateProject);
        }
        if (fallbackVersion) {
          url.searchParams.set("current", fallbackVersion);
        }

        // Use backend proxy to avoid CORS issues
        const proxyUrl = `/api/update/fetch?url=${encodeURIComponent(url.toString())}`;
        console.log("[UpdateCheck] Fetching latest update via proxy:", proxyUrl);

        const response = await fetch(proxyUrl, { cache: "no-store" });
        if (!response.ok) {
          console.log("[UpdateCheck] Fetch failed:", response.status, response.statusText);
          return;
        }
        const payload = await response.json();
        console.log("[UpdateCheck] Latest update fetched:", payload);
        if (cancelled || !payload) return;
        await storeCachedUpdate(payload);
        if (cancelled) return;
        await loadCachedUpdate();
      } catch (error) {
        console.error("[UpdateCheck] Error fetching update:", error);
      }
    };
    void loadCachedUpdate();
    void fetchLatestUpdate();
    return () => {
      cancelled = true;
    };
  }, [appVersion, setUpdateModal]);

  const { updateAvailable, updateForceRequired, updateLatestVersion, updateCurrentVersion } = useMemo(() => {
    const updateLatest = updateModal?.latestVersion ?? null;
    const updateCurrent = updateModal?.currentVersion ?? appVersion ?? null;
    const available = updateModal
      ? updateModal.updateAvailable ??
        (updateLatest && updateCurrent ? compareVersions(updateLatest, updateCurrent) > 0 : false)
      : false;
    return {
      updateAvailable: available,
      updateForceRequired: updateModal ? Boolean(updateModal.forceUpdate) : false,
      updateLatestVersion: updateLatest,
      updateCurrentVersion: updateCurrent
    };
  }, [appVersion, updateModal]);

  return {
    updateModal,
    setUpdateModal,
    updateAvailable,
    updateForceRequired,
    updateLatestVersion,
    updateCurrentVersion
  };
}

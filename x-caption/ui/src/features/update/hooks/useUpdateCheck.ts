import { useCallback, useEffect, useMemo } from "react";
import { buildUpdateModalInfo, type UpdateModalInfo } from "../../../app/lib/update";
import { compareVersions } from "../../../app/lib/format";
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import { setUpdateModal as setUpdateModalAction } from "../../ui/uiSlice";

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
    if (!updateUrl || typeof updateUrl !== "string") return;
    const envVersion =
      typeof (import.meta as any)?.env?.VITE_APP_VERSION === "string"
        ? (import.meta as any).env.VITE_APP_VERSION
        : null;
    const fallbackVersion = appVersion || (envVersion ? String(envVersion).trim() : null);
    const updateProject =
      (import.meta as any)?.env?.VITE_UPDATE_PROJECT ??
      (import.meta as any)?.env?.VITE_UPDATE_PROJECT_NAME ??
      "x-caption";
    let cancelled = false;
    const loadCachedUpdate = async () => {
      try {
        const response = await fetch(`/api/update/cache?project=${encodeURIComponent(updateProject)}`, {
          cache: "no-store"
        });
        if (!response.ok) return;
        const cached = await response.json();
        if (cancelled || !cached) return;
        const cachedPayload = cached?.payload ?? null;
        const info = buildUpdateModalInfo(cachedPayload, fallbackVersion, updateProject);
        if (info) {
          setUpdateModal(info);
        }
      } catch {
        // Ignore cache errors.
      }
    };
    const storeCachedUpdate = async (payload: any) => {
      try {
        await fetch("/api/update/cache", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project: updateProject, payload })
        });
      } catch {
        // Ignore cache write errors.
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
        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (cancelled || !payload) return;
        await storeCachedUpdate(payload);
        if (cancelled) return;
        await loadCachedUpdate();
      } catch {
        // Offline or blocked: skip update check silently.
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

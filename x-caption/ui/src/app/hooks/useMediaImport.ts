import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { UploadTabHandle } from "../../features/upload/components/UploadTab";
import { apiGetYoutubeImport, apiStartYoutubeImport } from "../../shared/api/sttApi";
import { useAppDispatch, useAppSelector } from "../hooks";
import { patchMediaImport } from "../../features/mediaImport/mediaImportSlice";

export function useMediaImport(params: {
  isCompact: boolean;
  uploadRef: RefObject<UploadTabHandle>;
  onOpenLocalPicker: () => void;
  onOpenLeftDrawer: () => void;
}) {
  const { isCompact, uploadRef, onOpenLocalPicker, onOpenLeftDrawer } = params;

  const dispatch = useAppDispatch();
  const modals = useAppSelector((state) => state.mediaImport.modals);
  const youtube = useAppSelector((state) => state.mediaImport.youtube);
  const youtubeProgressTimerRef = useRef<number | null>(null);

  const setShowOpenModal = useCallback(
    (value: boolean) => {
      dispatch(patchMediaImport({ modals: { open: value } }));
    },
    [dispatch]
  );

  const setShowYoutubeModal = useCallback(
    (value: boolean) => {
      dispatch(patchMediaImport({ modals: { youtube: value } }));
    },
    [dispatch]
  );

  const setShowImportModal = useCallback(
    (value: boolean) => {
      dispatch(patchMediaImport({ modals: { import: value } }));
    },
    [dispatch]
  );

  const setYoutubeUrl = useCallback(
    (value: string) => {
      dispatch(patchMediaImport({ youtube: { url: value } }));
    },
    [dispatch]
  );

  const setYoutubeError = useCallback(
    (value: string | null) => {
      dispatch(patchMediaImport({ youtube: { error: value } }));
    },
    [dispatch]
  );

  const handleOpenModal = useCallback(() => {
    dispatch(
      patchMediaImport({
        modals: { open: true, youtube: false },
        youtube: {
          importing: false,
          error: null,
          progress: null,
          importId: null,
          title: null,
          status: null
        }
      })
    );
  }, [dispatch]);

  const handleOpenLocalFromModal = useCallback(() => {
    setShowOpenModal(false);
    onOpenLocalPicker();
  }, [onOpenLocalPicker]);

  const handleOpenYoutubeModal = useCallback(() => {
    dispatch(
      patchMediaImport({
        modals: { open: false, youtube: true },
        youtube: { error: null }
      })
    );
  }, [dispatch]);

  const handleImportYoutube = useCallback(async () => {
    const url = youtube.url.trim();
    if (!url) {
      setYoutubeError("Paste a YouTube link to continue.");
      return;
    }
    dispatch(
      patchMediaImport({
        modals: { youtube: true },
        youtube: {
          error: null,
          importing: true,
          title: null,
          status: null
        }
      })
    );
    try {
      const startPayload = await apiStartYoutubeImport(url);
      const downloadId = startPayload?.download_id;
      if (!downloadId) {
        throw new Error("Failed to start YouTube import.");
      }
      dispatch(
        patchMediaImport({
          youtube: {
            progress: typeof startPayload.progress === "number" ? Math.round(startPayload.progress) : null,
            status: startPayload.status ?? null,
            importId: downloadId
          }
        })
      );
      if (startPayload.status === "completed") {
        const file = startPayload?.file;
        if (!file?.path || !file?.name) {
          throw new Error("Download failed. Please try again.");
        }
        const addLocalPathItem = uploadRef.current?.addLocalPathItem;
        if (!addLocalPathItem) {
          throw new Error("Upload panel is not ready yet.");
        }
        if (isCompact) {
          onOpenLeftDrawer();
        }
        const displayName = startPayload?.source?.title?.trim() || undefined;
        addLocalPathItem({
          path: file.path,
          name: file.name,
          size: typeof file.size === "number" ? file.size : null,
          mime: file.mime ?? null,
          displayName,
          durationSec: typeof startPayload?.duration_sec === "number" ? startPayload.duration_sec : null,
          previewUrl: startPayload?.stream_url ?? null,
          streamUrl: startPayload?.stream_url ?? null,
          externalSource: {
            type: "youtube",
            url: startPayload?.source?.url ?? url,
            streamUrl: startPayload?.stream_url ?? null,
            title: startPayload?.source?.title ?? null,
            id: startPayload?.source?.id ?? null,
            thumbnailUrl: startPayload?.thumbnail_url ?? null
          },
          transcriptionKind: "audio"
        });
        dispatch(
          patchMediaImport({
            modals: { youtube: false },
            youtube: {
              url: "",
              importing: false,
              progress: null,
              importId: null,
              title: null,
              status: null
            }
          })
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dispatch(
        patchMediaImport({
          modals: { youtube: true },
          youtube: {
            error: message || "Failed to load YouTube media.",
            importing: false,
            importId: null,
            progress: null,
            title: null,
            status: null
          }
        })
      );
    } finally {
      // Polling effect handles the in-progress state.
    }
  }, [dispatch, isCompact, onOpenLeftDrawer, setYoutubeError, uploadRef, youtube.url]);

  useEffect(() => {
    if (!modals.import) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowImportModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modals.import, setShowImportModal]);

  useEffect(() => {
    if (!youtube.importing || !youtube.importId) return undefined;
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const status = await apiGetYoutubeImport(youtube.importId);
        if (cancelled) return;
        dispatch(
          patchMediaImport({
            youtube: {
              progress: typeof status.progress === "number" ? Math.round(status.progress) : null,
              status: status.status ?? null,
              title: status?.source?.title ?? youtube.title
            }
          })
        );
        if (status.status === "completed") {
          const file = status.file;
          if (!file?.path || !file?.name) {
            throw new Error("Download failed. Please try again.");
          }
          const addLocalPathItem = uploadRef.current?.addLocalPathItem;
          if (!addLocalPathItem) {
            throw new Error("Upload panel is not ready yet.");
          }
          if (isCompact) {
            onOpenLeftDrawer();
          }
          const displayName = status?.source?.title?.trim() || undefined;
          addLocalPathItem({
            path: file.path,
            name: file.name,
            size: typeof file.size === "number" ? file.size : null,
            mime: file.mime ?? null,
            displayName,
            durationSec: typeof status?.duration_sec === "number" ? status.duration_sec : null,
            previewUrl: status?.stream_url ?? null,
            streamUrl: status?.stream_url ?? null,
            externalSource: {
              type: "youtube",
              url: status?.source?.url ?? youtube.url.trim(),
              streamUrl: status?.stream_url ?? null,
              title: status?.source?.title ?? null,
              id: status?.source?.id ?? null,
              thumbnailUrl: status?.thumbnail_url ?? null
            },
            transcriptionKind: "audio"
          });
          dispatch(
            patchMediaImport({
              modals: { youtube: false },
              youtube: {
                url: "",
                importing: false,
                progress: null,
                importId: null,
                title: null,
                status: null
              }
            })
          );
        } else if (status.status === "failed") {
          throw new Error(status.error || "Failed to load YouTube media.");
        }
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        dispatch(
          patchMediaImport({
            modals: { youtube: true },
            youtube: {
              error: message || "Failed to load YouTube media.",
              importing: false,
              importId: null,
              progress: null,
              title: null,
              status: null
            }
          })
        );
      } finally {
        inFlight = false;
      }
    };

    poll();
    youtubeProgressTimerRef.current = window.setInterval(poll, 300);
    return () => {
      cancelled = true;
      if (youtubeProgressTimerRef.current) {
        window.clearInterval(youtubeProgressTimerRef.current);
        youtubeProgressTimerRef.current = null;
      }
    };
  }, [
    dispatch,
    isCompact,
    onOpenLeftDrawer,
    uploadRef,
    youtube.importId,
    youtube.importing,
    youtube.title,
    youtube.url
  ]);

  const isYoutubeIndeterminate =
    youtube.status === "processing" || youtube.status === "queued" || youtube.progress === null;
  const youtubeProgressValue =
    typeof youtube.progress === "number"
      ? Math.max(
          0,
          Math.min(youtube.status && youtube.status !== "completed" ? 99 : 100, youtube.progress)
        )
      : 0;

  return {
    modals: {
      showOpenModal: modals.open,
      setShowOpenModal,
      showYoutubeModal: modals.youtube,
      setShowYoutubeModal,
      showImportModal: modals.import,
      setShowImportModal
    },
    youtube: {
      url: youtube.url,
      setUrl: setYoutubeUrl,
      importing: youtube.importing,
      error: youtube.error,
      setError: setYoutubeError,
      progress: youtube.progress,
      importId: youtube.importId,
      importTitle: youtube.title,
      importStatus: youtube.status,
      isIndeterminate: isYoutubeIndeterminate,
      progressValue: youtubeProgressValue
    },
    actions: {
      openModal: handleOpenModal,
      openLocalFromModal: handleOpenLocalFromModal,
      openYoutubeModal: handleOpenYoutubeModal,
      importYoutube: handleImportYoutube
    }
  };
}

export type MediaImportResult = ReturnType<typeof useMediaImport>;

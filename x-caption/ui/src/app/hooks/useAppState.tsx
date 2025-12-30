import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { setChineseStyle, setLanguage } from "../../features/settings/settingsSlice";
import { setExportLanguage } from "../../features/transcript/transcriptSlice";
import {
  setIsLeftDrawerOpen as setIsLeftDrawerOpenAction,
  setIsPlayerModalOpen as setIsPlayerModalOpenAction,
  setIsPlayerModalVisible as setIsPlayerModalVisibleAction,
  setIsTranscriptEdit as setIsTranscriptEditAction,
  setShowExportModal as setShowExportModalAction
} from "../../features/ui/uiSlice";
import { useAppDispatch, useAppSelector } from "../hooks";
import {
  addJob,
  addSegment,
  removeSegment,
  selectJob,
  setJobSegments,
  updateJobUiState,
  updateJobDisplayName,
  updateSegmentText,
  updateSegmentTiming
} from "../../features/jobs/jobsSlice";
import type { UploadTabHandle, MediaItem } from "../../features/upload/components/UploadTab";
import type { ToastType } from "../../shared/components/ToastHost";
import { cn } from "../../shared/lib/cn";
import { sanitizeProgressValue, stripFileExtension } from "../../shared/lib/utils";
import { fileFromBase64 } from "../../shared/lib/file";
import { formatBytes } from "../lib/format";
import { parseSrt } from "../lib/srt";
import { safeOpenCcConverter } from "../lib/opencc";
import { deriveJobSegments, findSegmentAtTime, isBlankAudioText } from "../lib/transcript";
import {
  BASE_PX_PER_SEC,
  DEFAULT_TIMELINE_ZOOM,
  MIN_CLIP_DURATION_SEC,
  TIMELINE_LEFT_PADDING_PX,
  TIMELINE_RIGHT_PADDING_PX,
  clamp,
  normalizeClips
} from "../lib/timeline";
import { CaptionSetupPanel } from "../components/CaptionSetupPanel";
import { CaptionPanelBody } from "../components/CaptionPanelBody";
import { PlayerPanel } from "../components/PlayerPanel";
import { MediaSidebar } from "../components/MediaSidebar";
import {
  apiEditSegment,
  apiGetJobRecord,
  apiResolveYoutubeStream,
  apiUpsertJobRecord,
  apiUpdateSegmentTiming,
  apiAddSegment,
  apiDeleteSegment
} from "../../shared/api/sttApi";
import type { Job, TranscriptSegment } from "../../shared/types";
import { callApiMethod } from "../lib/pywebview";
import { useAppBootstrap } from "./useAppBootstrap";
import { useJobPolling } from "./useJobPolling";
import { useOnlineStatus } from "./useOnlineStatus";
import { useWindowState } from "./useWindowState";
import { useUpdateCheck } from "./useUpdateCheck";
import { usePremiumState } from "./usePremiumState";
import { useMediaImport } from "./useMediaImport";
import { useModelDownload } from "./useModelDownload";
import { useExportHandlers } from "./useExportHandlers";

export function useAppState() {
  const settings = useAppSelector((s) => s.settings);
  const exportLanguage = useAppSelector((s) => s.transcript.exportLanguage);
  const appVersion = useAppSelector((s) => s.app.version);
  const showExportModal = useAppSelector((s) => s.app.showExportModal);
  const isPlayerModalOpen = useAppSelector((s) => s.app.isPlayerModalOpen);
  const isPlayerModalVisible = useAppSelector((s) => s.app.isPlayerModalVisible);
  const isLeftDrawerOpen = useAppSelector((s) => s.app.isLeftDrawerOpen);
  const isTranscriptEdit = useAppSelector((s) => s.app.isTranscriptEdit);
  const dispatch = useAppDispatch();

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<UploadTabHandle>(null);
  const srtInputRef = useRef<HTMLInputElement | null>(null);

  const jobsById = useAppSelector((s) => s.jobs.jobsById);
  const jobOrder = useAppSelector((s) => s.jobs.order);
  const isTranscribing = useMemo(
    () =>
      jobOrder.some((id) => {
        const status = jobsById[id]?.status;
        return status === "queued" || status === "processing";
      }),
    [jobOrder, jobsById]
  );
  const selectedJobId = useAppSelector((s) => s.jobs.selectedJobId);
  const selectedJob = useMemo(() => (selectedJobId ? jobsById[selectedJobId] : null), [jobsById, selectedJobId]);
  useAppBootstrap(dispatch);
  useJobPolling(dispatch, jobOrder, jobsById);

  const windowState = useWindowState();
  const {
    isWindows,
    isMac,
    showCustomWindowControls,
    useCustomDrag,
    dragRegionClass,
    isAltPressed,
    isWindowFocused,
    isPinned,
    setWindowOnTop,
    handleTogglePinned,
    handleWindowAction,
    getHeaderDragProps,
    isHeaderMenuOpen,
    setIsHeaderMenuOpen,
    headerMenuRef,
    headerMenuButtonRef
  } = windowState;


  const [alertModal, setAlertModal] = useState<{
    title: string;
    message: string;
    tone: ToastType;
  } | null>(null);
  const notify = useCallback((message: string, type: ToastType = "info") => {
    const title =
      type === "error" ? "Something went wrong" : type === "success" ? "Done" : "Notice";
    setAlertModal({ title, message, tone: type });
  }, []);
  const setShowExportModal = useCallback(
    (value: boolean) => {
      dispatch(setShowExportModalAction(value));
    },
    [dispatch]
  );
  const isOnline = useOnlineStatus();
  const updateState = useUpdateCheck(appVersion);
  const premiumState = usePremiumState({ notify, isOnline });
  const {
    showPremiumModal,
    setShowPremiumModal,
    showPremiumStatusModal,
    setShowPremiumStatusModal,
    isPremium,
    premiumStatusLoading,
    premiumDetails,
    premiumWebviewStatus,
    premiumWebviewError,
    machineId,
    machineIdLoading,
    machineIdCopied,
    premiumKey,
    setPremiumKey,
    premiumKeySubmitting,
    premiumIframeKey,
    premiumWebviewRef,
    handleOpenPremiumModal,
    handlePremiumWebviewLoad,
    handlePremiumWebviewError,
    handlePremiumRetry,
    handleCopyMachineId,
    handleConfirmPremiumKey
  } = premiumState;
  const {
    updateModal,
    setUpdateModal,
    updateAvailable,
    updateForceRequired,
    updateLatestVersion,
    updateCurrentVersion
  } = updateState;
  const setIsPlayerModalOpen = useCallback(
    (value: boolean) => {
      dispatch(setIsPlayerModalOpenAction(value));
    },
    [dispatch]
  );
  const setIsPlayerModalVisible = useCallback(
    (value: boolean) => {
      dispatch(setIsPlayerModalVisibleAction(value));
    },
    [dispatch]
  );

  const [playback, setPlayback] = useState({
    currentTime: 0,
    duration: 0,
    isPlaying: false
  });
  const [playbackRate, setPlaybackRate] = useState(1);
  const playbackRef = useRef(playback);
  const [previewPoster, setPreviewPoster] = useState<string | null>(null);
  const [activeVideoSlot, setActiveVideoSlot] = useState<0 | 1>(0);
  const previewPosterRef = useRef<string | null>(null);
  const previewPosterModeRef = useRef<"paused" | null>(null);
  const [subtitleScale, setSubtitleScale] = useState(1.4);
  const [subtitleBaseFontSize, setSubtitleBaseFontSize] = useState(14);
  const [subtitleEditor, setSubtitleEditor] = useState<{ segmentId: number; text: string } | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState("");
  const [subtitlePosition, setSubtitlePosition] = useState({ x: 0.5, y: 0.85 });
  const [subtitleMaxWidth, setSubtitleMaxWidth] = useState(520);
  const [subtitleBoxSize, setSubtitleBoxSize] = useState({ width: 0, height: 0 });
  const [subtitleEditSize, setSubtitleEditSize] = useState<{ width: number; height: number } | null>(null);
  const [subtitleUserSized, setSubtitleUserSized] = useState(false);
  const subtitleUserSizedRef = useRef(false);
  const subtitleEditProgrammaticSizeRef = useRef<{ width: number; height: number } | null>(null);
  const subtitlePositionRef = useRef(subtitlePosition);
  const subtitleDragRafRef = useRef<number | null>(null);
  const pendingSubtitlePosRef = useRef<{ x: number; y: number } | null>(null);
  const subtitleBoxRef = useRef<HTMLDivElement | null>(null);
  const subtitleMeasureRef = useRef<HTMLSpanElement | null>(null);
  const subtitleUiSaveRef = useRef<number | null>(null);
  const subtitleUiLoadRef = useRef<string | null>(null);
  const subtitleEditOpenSizeRef = useRef<{ width: number; height: number } | null>(null);
  const subtitleEditAutosaveRef = useRef<number | null>(null);
  const subtitleEditLastSavedRef = useRef<{ segmentId: number; text: string } | null>(null);
  const captionTimingAutosaveRef = useRef<number | null>(null);
  const captionTimingAutosavePayloadRef = useRef<{
    jobId: string;
    segmentId: number;
    start: number;
    end: number;
  } | null>(null);
  const subtitleDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    container: DOMRect;
    box: DOMRect;
    allowEdit: boolean;
  } | null>(null);

  const setIsTranscriptEdit = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      const next = typeof value === "function" ? value(isTranscriptEdit) : value;
      dispatch(setIsTranscriptEditAction(next));
    },
    [dispatch, isTranscriptEdit]
  );

  useEffect(() => {
    subtitleUserSizedRef.current = subtitleUserSized;
  }, [subtitleUserSized]);

  useEffect(() => {
    subtitlePositionRef.current = subtitlePosition;
  }, [subtitlePosition]);

  useEffect(() => {
    return () => {
      if (subtitleDragRafRef.current !== null) {
        window.cancelAnimationFrame(subtitleDragRafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    previewPosterRef.current = previewPoster;
    if (!previewPoster) {
      previewPosterModeRef.current = null;
    }
  }, [previewPoster]);

  useEffect(() => {
    if (!isPlayerModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPlayerModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlayerModalOpen, setIsPlayerModalOpen]);

  useEffect(() => {
    if (isPlayerModalOpen) {
      setIsPlayerModalVisible(true);
    }
  }, [isPlayerModalOpen, setIsPlayerModalVisible]);

  const { modelDownload, ensureWhisperModelReady, clearModelDownload, handleRetryModelDownload, modelDownloadActive, modelDownloadTitle } =
    useModelDownload(notify);
  const [secondCaptionEnabled, setSecondCaptionEnabled] = useState(false);
  const [secondCaptionLanguage, setSecondCaptionLanguage] = useState<"yue" | "zh" | "en">("yue");
  const [localMedia, setLocalMedia] = useState<MediaItem[]>([]);
  const [timelineZoom, setTimelineZoom] = useState(DEFAULT_TIMELINE_ZOOM);
  const [isCompact, setIsCompact] = useState(false);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const setIsLeftDrawerOpen = useCallback(
    (value: boolean) => {
      dispatch(setIsLeftDrawerOpenAction(value));
    },
    [dispatch]
  );
  const [compactTab, setCompactTab] = useState<"player" | "captions">("player");
  const handleOpenFiles = useCallback(() => {
    if (isCompact) {
      setIsLeftDrawerOpen(true);
    }
    uploadRef.current?.openFilePicker?.();
  }, [isCompact, setIsLeftDrawerOpen]);
  const mediaImport = useMediaImport({
    isCompact,
    uploadRef,
    onOpenLocalPicker: handleOpenFiles,
    onOpenLeftDrawer: () => setIsLeftDrawerOpen(true)
  });
  const { modals: mediaImportModals } = mediaImport;
  const { setShowImportModal } = mediaImportModals;
  const [timelineClips, setTimelineClips] = useState<
    Array<{
      id: string;
      media: MediaItem;
      startSec: number;
      baseDurationSec: number;
      durationSec: number;
      trimStartSec: number;
      trimEndSec: number;
    }>
  >([]);
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isDisplayNameEditing, setIsDisplayNameEditing] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingPlayTargetRef = useRef<string | null>(null);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubStateRef = useRef<{ pointerId: number; rect?: DOMRect } | null>(null);
  const playerScrubRef = useRef<{ wasPlaying: boolean } | null>(null);
  const scrubRafRef = useRef<number | null>(null);
  const pendingScrubRef = useRef<number | null>(null);
  const lastScrubValueRef = useRef<number | null>(null);
  const mediaRafActiveRef = useRef(false);
  const pendingPlayRafRef = useRef<number | null>(null);
  const pendingSwapRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const isGapPlaybackRef = useRef(false);
  const youtubeResolveAttemptRef = useRef<Record<string, number>>({});
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const timelineScrollIdleRef = useRef<number | null>(null);
  const timelineUserScrollingRef = useRef(false);
  const getPreviewKind = useCallback(
    (media?: MediaItem | null) => {
      if (!media) return null;
      if (media.externalSource?.type === "youtube" && (media.streamError || !isOnline)) {
        return media.kind;
      }
      return media.streamUrl ? "video" : media.kind;
    },
    [isOnline]
  );
  const applyMediaUpdate = useCallback(
    (next: MediaItem) => {
      setActiveMedia(next);
      setTimelineClips((prev) =>
        prev.map((clip) => (clip.media.id === next.id ? { ...clip, media: next } : clip))
      );
      if (next.source === "local") {
        setLocalMedia((prev) => prev.map((item) => (item.id === next.id ? next : item)));
      }
    },
    [setLocalMedia, setTimelineClips]
  );
  const resolveYoutubeStreamForMedia = useCallback(
    async (media: MediaItem) => {
      if (!media || media.externalSource?.type !== "youtube") return;
      const url = media.externalSource.url ?? null;
      if (!url) {
        const failed: MediaItem = {
          ...media,
          streamUrl: null,
          isResolvingStream: false,
          streamError: "Missing YouTube URL for this item."
        };
        applyMediaUpdate(failed);
        return;
      }
      const now = Date.now();
      const lastAttempt = youtubeResolveAttemptRef.current[media.id] ?? 0;
      if (now - lastAttempt < 4000) return;
      youtubeResolveAttemptRef.current[media.id] = now;

      const fallbackPreviewUrl = media.localPath
        ? `/media?path=${encodeURIComponent(media.localPath)}`
        : media.previewUrl ?? null;

      const pending: MediaItem = {
        ...media,
        previewUrl: fallbackPreviewUrl,
        streamUrl: null,
        isResolvingStream: true,
        streamError: null
      };
      applyMediaUpdate(pending);

      try {
        const payload = await apiResolveYoutubeStream(url);
        const streamUrl = typeof payload.stream_url === "string" ? payload.stream_url : null;
        if (!streamUrl) {
          throw new Error("Failed to resolve YouTube stream.");
        }
        const nextSource = {
          type: "youtube" as const,
          url,
          streamUrl,
          title: payload.source?.title ?? media.externalSource?.title ?? null,
          id: payload.source?.id ?? media.externalSource?.id ?? null,
          thumbnailUrl:
            typeof payload.thumbnail_url === "string"
              ? payload.thumbnail_url
              : media.externalSource?.thumbnailUrl ?? null
        };
        const resolved: MediaItem = {
          ...media,
          previewUrl: streamUrl,
          streamUrl,
          externalSource: nextSource,
          isResolvingStream: false,
          streamError: null
        };
        applyMediaUpdate(resolved);
        if (resolved.source === "job" && resolved.jobId) {
          const job = jobsById[resolved.jobId];
          const existingUiState =
            job?.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
          const nextUiState = {
            ...existingUiState,
            mediaSource: nextSource,
            mediaSourceError: null
          };
          dispatch(updateJobUiState({ jobId: resolved.jobId, uiState: nextUiState }));
          void apiUpsertJobRecord({ job_id: resolved.jobId, ui_state: nextUiState }).catch(() => undefined);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const nextSource = {
          type: "youtube" as const,
          url,
          streamUrl: null,
          title: media.externalSource?.title ?? null,
          id: media.externalSource?.id ?? null,
          thumbnailUrl: media.externalSource?.thumbnailUrl ?? null
        };
        const failed: MediaItem = {
          ...media,
          previewUrl: fallbackPreviewUrl,
          streamUrl: null,
          externalSource: nextSource,
          isResolvingStream: false,
          streamError: message || "Unable to reach YouTube right now. Please try again later."
        };
        applyMediaUpdate(failed);
        if (failed.source === "job" && failed.jobId) {
          const job = jobsById[failed.jobId];
          const existingUiState =
            job?.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
          const nextUiState = {
            ...existingUiState,
            mediaSource: nextSource,
            mediaSourceError: failed.streamError
          };
          dispatch(updateJobUiState({ jobId: failed.jobId, uiState: nextUiState }));
          void apiUpsertJobRecord({ job_id: failed.jobId, ui_state: nextUiState }).catch(() => undefined);
        }
      }
    },
    [applyMediaUpdate, dispatch, jobsById]
  );
  const captionDragRef = useRef<{
    pointerId: number;
    jobId: string;
    segmentId: number;
    start: number;
    end: number;
    startX: number;
    mode: "move" | "start" | "end";
  } | null>(null);
  const [captionHover, setCaptionHover] = useState<{
    start: number;
    end: number;
    gapStart: number;
    gapEnd: number;
  } | null>(null);
  const [forcedCaptionId, setForcedCaptionId] = useState<number | null>(null);
  const [captionMenu, setCaptionMenu] = useState<{
    x: number;
    y: number;
    segment: TranscriptSegment;
  } | null>(null);
  const [captionMenuGapHighlight, setCaptionMenuGapHighlight] = useState(false);
  const [gapMenu, setGapMenu] = useState<{
    x: number;
    y: number;
    gapStart: number;
    gapEnd: number;
  } | null>(null);
  const [gapMenuHighlight, setGapMenuHighlight] = useState(false);
  const [gapAdjustModal, setGapAdjustModal] = useState<{
    segment: TranscriptSegment;
    mode: "insert" | "remove";
    ms: string;
    maxRemoveMs: number;
    hasGap: boolean;
  } | null>(null);
  const gapMenuOpenRef = useRef(false);
  const selectedJobUiStateRef = useRef<Record<string, any>>({});
  const activeJob = useMemo(() => {
    if (selectedJob) return selectedJob;
    if (activeMedia?.source === "job" && activeMedia.jobId) {
      return jobsById[activeMedia.jobId] ?? null;
    }
    return null;
  }, [activeMedia?.jobId, activeMedia?.source, jobsById, selectedJob]);
  const isActiveJobProcessing = Boolean(
    activeJob && (activeJob.status === "queued" || activeJob.status === "processing")
  );
  const isAnotherJobProcessing = isTranscribing && !isActiveJobProcessing;
  const activeJobProgress = useMemo(() => {
    const value = sanitizeProgressValue(activeJob?.progress);
    return value !== null ? Math.round(value) : null;
  }, [activeJob?.progress]);
  const showActiveJobOverlay =
    Boolean(activeJob) && (activeJob?.status === "queued" || activeJob?.status === "processing");
  const activeJobStatusMessage = useMemo(() => {
    if (!activeJob) return "Generating captions...";
    if (activeJob.status === "queued") return "Job queued, preparing to start...";
    return activeJob.message || "Generating captions...";
  }, [activeJob]);
  const activeJobLabel = useMemo(() => {
    if (!activeJob) return "Generating captions";
    return (activeJob.displayName ?? activeJob.filename) || "Generating captions";
  }, [activeJob]);
  const activeMediaDisplayName = useMemo(() => {
    if (!activeMedia) return "";
    if (activeMedia.source === "job" && activeMedia.jobId) {
      const job = jobsById[activeMedia.jobId];
      return job?.displayName ?? job?.filename ?? activeMedia.displayName ?? activeMedia.name ?? "";
    }
    return activeMedia.displayName ?? activeMedia.name ?? "";
  }, [activeMedia, jobsById]);
  const activePreviewKind = getPreviewKind(activeMedia);
  const captionMenuPosition = useMemo(() => {
    if (!captionMenu || typeof window === "undefined") return null;
    const width = 180;
    const height = 140;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    return {
      left: Math.min(captionMenu.x, maxLeft),
      top: Math.min(captionMenu.y, maxTop)
    };
  }, [captionMenu]);
  const gapMenuPosition = useMemo(() => {
    if (!gapMenu || typeof window === "undefined") return null;
    const width = 180;
    const height = 44;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    return {
      left: Math.min(gapMenu.x, maxLeft),
      top: Math.min(gapMenu.y, maxTop)
    };
  }, [gapMenu]);

  const closeGapMenu = useCallback(() => {
    gapMenuOpenRef.current = false;
    setGapMenu(null);
    setGapMenuHighlight(false);
  }, []);

  const closeCaptionMenu = useCallback(() => {
    setCaptionMenu(null);
    setCaptionMenuGapHighlight(false);
  }, []);

  const handleOpenGapAdjust = useCallback(
    (segment: TranscriptSegment, maxRemoveMs: number, hasGap: boolean) => {
      setGapAdjustModal({
        segment,
        mode: "insert",
        ms: "1000",
        maxRemoveMs,
        hasGap
      });
    },
    []
  );

  const handleCloseGapMenu = useCallback(() => {
    closeGapMenu();
    setCaptionHover(null);
  }, [closeGapMenu]);

  useEffect(() => {
    if (!captionMenu) {
      setCaptionMenuGapHighlight(false);
    }
  }, [captionMenu]);

  useEffect(() => {
    if (!isHeaderCompact) {
      setIsHeaderMenuOpen(false);
    }
  }, [isHeaderCompact]);

  useEffect(() => {
    if (selectedJob?.uiState && typeof selectedJob.uiState === "object") {
      selectedJobUiStateRef.current = selectedJob.uiState as Record<string, any>;
      return;
    }
    selectedJobUiStateRef.current = {};
  }, [selectedJob?.id, selectedJob?.uiState]);

  useEffect(() => {
    setForcedCaptionId(null);
  }, [activeJob?.id]);

  useEffect(() => {
    setIsDisplayNameEditing(false);
  }, [activeMedia?.id]);

  useEffect(() => {
    if (!activeMedia) {
      setIsDisplayNameEditing(false);
      setDisplayNameDraft("");
      return;
    }
    if (!isDisplayNameEditing) {
      setDisplayNameDraft(activeMediaDisplayName || activeMedia.displayName || activeMedia.name || "");
    }
  }, [activeMedia?.id, activeMediaDisplayName, isDisplayNameEditing]);

  // media import polling handled by hook.

  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const update = () => {
      const width = (el.clientWidth || 0) - TIMELINE_LEFT_PADDING_PX - TIMELINE_RIGHT_PADDING_PX;
      setTimelineViewportWidth(Math.max(0, width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => {
      const compact = window.innerWidth < 1100;
      const headerCompact = window.innerWidth < 500;
      setIsCompact(compact);
      setIsHeaderCompact(headerCompact);
      if (!compact) {
        setIsLeftDrawerOpen(false);
        setCompactTab("player");
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // app bootstrap, update checks, and job polling are handled by hooks.

  const segments =
    activeJob?.result?.segments ||
    activeJob?.partialResult?.segments ||
    activeJob?.streamingSegments ||
    [];
  const showCaptionSetup = segments.length === 0;
  const sortedSegments = useMemo(
    () =>
      [...segments]
        .map((seg) => ({
          ...seg,
          start: Number(seg.start) || 0,
          end: Number(seg.end) || 0
        }))
        .sort((a, b) => a.start - b.start),
    [segments]
  );
  const displaySegments = useMemo(
    () =>
      segments.filter((segment: any) => {
        const rawText = String(segment?.originalText ?? segment?.text ?? "");
        return !isBlankAudioText(rawText);
      }),
    [segments]
  );
  const sortedDisplaySegments = useMemo(
    () =>
      [...displaySegments]
        .map((seg) => ({
          ...seg,
          start: Number.isFinite(Number(seg.start)) ? Number(seg.start) : 0,
          end: Number.isFinite(Number(seg.end)) ? Number(seg.end) : 0
        }))
        .sort((a, b) => a.start - b.start),
    [displaySegments]
  );
  const displaySegmentById = useMemo(() => {
    const map = new Map<number, TranscriptSegment>();
    sortedDisplaySegments.forEach((segment) => {
      map.set(Number(segment.id), segment);
    });
    return map;
  }, [sortedDisplaySegments]);
  const exportSegments = useMemo(
    () =>
      deriveJobSegments(activeJob ?? undefined).filter((segment) => {
        const rawText = String(segment?.originalText ?? segment?.text ?? "");
        return !isBlankAudioText(rawText);
      }),
    [activeJob]
  );
  const openCcConverter = useMemo(() => safeOpenCcConverter(exportLanguage), [exportLanguage]);
  const exportHandlers = useExportHandlers({
    exportLanguage,
    exportSegments,
    openCcConverter,
    notify,
    filename: selectedJob?.filename
  });
  const { isExporting, saveTextFile, handleExportTranscript, handleExportSrt } = exportHandlers;
  const activeSubtitleSegment = useMemo(() => {
    if (!sortedDisplaySegments.length) return null;
    if (forcedCaptionId !== null) {
      return displaySegmentById.get(Number(forcedCaptionId)) ?? null;
    }
    return findSegmentAtTime(sortedDisplaySegments, playback.currentTime);
  }, [displaySegmentById, forcedCaptionId, playback.currentTime, sortedDisplaySegments]);
  const currentSubtitleMatch = useMemo(() => {
    if (!activeSubtitleSegment) return null;
    const rawText = activeSubtitleSegment.originalText ?? activeSubtitleSegment.text ?? "";
    let text = rawText;
    if (openCcConverter) {
      try {
        text = openCcConverter(rawText);
      } catch {
        text = rawText;
      }
    }
    return { segment: activeSubtitleSegment, text: text.trim() };
  }, [activeSubtitleSegment, openCcConverter]);
  const activeTimelineSegmentId = activeSubtitleSegment ? Number(activeSubtitleSegment.id) : null;
  const currentSubtitle = currentSubtitleMatch?.text ?? "";

  const subtitleFontSize = Math.max(10, subtitleBaseFontSize * subtitleScale);
  const subtitleTextStyle = useMemo(
    () => ({
      fontSize: `${subtitleFontSize}px`,
      lineHeight: "1.2",
      textShadow:
        "0 0 3px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.9), 2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000"
    }),
    [subtitleFontSize]
  );
  const subtitleDisplaySize = useMemo(() => {
    if (subtitleEditor || subtitleUserSized) {
      return subtitleEditSize ?? subtitleBoxSize;
    }
    return subtitleBoxSize;
  }, [subtitleBoxSize, subtitleEditSize, subtitleEditor, subtitleUserSized]);

  useEffect(() => {
    if (forcedCaptionId === null) return;
    const forced = displaySegmentById.get(Number(forcedCaptionId)) ?? null;
    if (!forced) {
      setForcedCaptionId(null);
      return;
    }
    const start = Number(forced.start ?? 0);
    const end = Number(forced.end ?? 0);
    if (playback.currentTime >= start && playback.currentTime < end) {
      setForcedCaptionId(null);
      return;
    }
    const timer = window.setTimeout(() => {
      setForcedCaptionId((current) => (current === forcedCaptionId ? null : current));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [displaySegmentById, forcedCaptionId, playback.currentTime]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const container = previewContainerRef.current;
    if (!container) return;
    const updateFromRect = (rect: DOMRect) => {
      if (!rect.width) return;
      setSubtitleMaxWidth(Math.max(200, rect.width * 0.8));
      const nextFontSize = clamp(rect.width * 0.022, 12, 28);
      setSubtitleBaseFontSize(nextFontSize);
    };
    const updateMaxWidth = () => {
      const rect = container.getBoundingClientRect();
      if (rect) {
        updateFromRect(rect);
      }
    };
    updateMaxWidth();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry?.contentRect) {
          updateFromRect(entry.contentRect);
        } else {
          updateMaxWidth();
        }
      });
      observer.observe(container);
    }
    window.addEventListener("resize", updateMaxWidth);
    return () => {
      window.removeEventListener("resize", updateMaxWidth);
      observer?.disconnect();
    };
  }, [compactTab, isCompact, isPlayerModalOpen]);

  useLayoutEffect(() => {
    if (subtitleEditor && subtitleEditSize) return;
    const measureEl = subtitleMeasureRef.current;
    if (!measureEl) return;
    const text = (subtitleEditor ? subtitleDraft : currentSubtitle) || " ";
    measureEl.textContent = text;
    const rect = measureEl.getBoundingClientRect();
    const paddingX = 12;
    const paddingY = 4;
    const width = Math.min(subtitleMaxWidth, rect.width + paddingX * 2);
    const height = rect.height + paddingY * 2;
    setSubtitleBoxSize({ width, height });
  }, [currentSubtitle, subtitleDraft, subtitleEditor, subtitleEditSize, subtitleMaxWidth, subtitleFontSize]);

  const scheduleSubtitleUiSave = useCallback(() => {
    if (!selectedJobId) return;
    if (subtitleUiSaveRef.current) {
      window.clearTimeout(subtitleUiSaveRef.current);
    }
    const resolvedSize = subtitleEditSize ?? subtitleBoxSize;
    const shouldSaveSize =
      subtitleUserSizedRef.current && resolvedSize.width > 0 && resolvedSize.height > 0;
    const existingUiState = selectedJobUiStateRef.current;
    const nextSubtitleState: {
      position: typeof subtitlePosition;
      scale: number;
      size?: { width: number; height: number };
      userSized?: boolean;
    } = {
      position: subtitlePosition,
      scale: subtitleScale
    };
    if (shouldSaveSize) {
      nextSubtitleState.size = resolvedSize;
      nextSubtitleState.userSized = true;
    }
    const nextUiState = {
      ...existingUiState,
      subtitle: nextSubtitleState
    };
    dispatch(updateJobUiState({ jobId: selectedJobId, uiState: nextUiState }));
    subtitleUiSaveRef.current = window.setTimeout(() => {
      void apiUpsertJobRecord({ job_id: selectedJobId, ui_state: nextUiState }).catch(() => undefined);
    }, 400);
  }, [dispatch, selectedJobId, subtitleBoxSize, subtitleEditSize, subtitlePosition, subtitleScale]);

  useEffect(() => {
    if (!subtitleEditor) return;
    const el = subtitleBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = subtitleBoxRef.current?.getBoundingClientRect();
      if (!box) return;
      const nextSize = { width: box.width, height: box.height };
      const lastProgrammatic = subtitleEditProgrammaticSizeRef.current;
      const isProgrammatic =
        lastProgrammatic &&
        Math.abs(lastProgrammatic.width - nextSize.width) < 0.5 &&
        Math.abs(lastProgrammatic.height - nextSize.height) < 0.5;
      if (!isProgrammatic && !subtitleUserSizedRef.current) {
        subtitleUserSizedRef.current = true;
        setSubtitleUserSized(true);
      }
      subtitleEditProgrammaticSizeRef.current = nextSize;
      setSubtitleEditSize(nextSize);
      scheduleSubtitleUiSave();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scheduleSubtitleUiSave, subtitleEditor]);

  useEffect(() => {
    if (!subtitleEditor) {
      if (subtitleEditAutosaveRef.current) {
        window.clearTimeout(subtitleEditAutosaveRef.current);
        subtitleEditAutosaveRef.current = null;
      }
      subtitleEditLastSavedRef.current = null;
      return;
    }
    subtitleEditLastSavedRef.current = {
      segmentId: subtitleEditor.segmentId,
      text: subtitleEditor.text
    };
  }, [subtitleEditor]);

  useEffect(() => {
    if (!subtitleEditor) return;
    const jobId =
      selectedJobId ?? (activeMedia?.source === "job" && activeMedia.jobId ? activeMedia.jobId : null);
    if (!jobId) return;
    if (subtitleEditAutosaveRef.current) {
      window.clearTimeout(subtitleEditAutosaveRef.current);
    }
    const nextValue = subtitleDraft;
    const segmentId = subtitleEditor.segmentId;
    subtitleEditAutosaveRef.current = window.setTimeout(() => {
      const newText = nextValue.trim();
      if (!newText) return;
      const lastSaved = subtitleEditLastSavedRef.current;
      if (lastSaved && lastSaved.segmentId === segmentId && newText === lastSaved.text.trim()) {
        return;
      }
      void apiEditSegment({ jobId, segmentId, newText })
        .then(() => {
          dispatch(updateSegmentText({ jobId, segmentId, newText }));
          subtitleEditLastSavedRef.current = { segmentId, text: newText };
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          notify(`Failed to save changes: ${message}`, "error");
        });
    }, 650);
    return () => {
      if (subtitleEditAutosaveRef.current) {
        window.clearTimeout(subtitleEditAutosaveRef.current);
      }
    };
  }, [activeMedia?.jobId, activeMedia?.source, dispatch, notify, selectedJobId, subtitleDraft, subtitleEditor]);

  useEffect(() => {
    const container = previewContainerRef.current?.getBoundingClientRect();
    const box = subtitleBoxRef.current?.getBoundingClientRect();
    if (!container || !box) return;
    const halfW = box.width / 2;
    const halfH = box.height / 2;
    const minX = halfW / container.width;
    const minY = halfH / container.height;
    const nextX = clamp(subtitlePosition.x, minX, 1 - minX);
    const nextY = clamp(subtitlePosition.y, minY, 1 - minY);
    if (nextX !== subtitlePosition.x || nextY !== subtitlePosition.y) {
      setSubtitlePosition({ x: nextX, y: nextY });
    }
  }, [subtitleDisplaySize.height, subtitleDisplaySize.width, subtitlePosition.x, subtitlePosition.y]);

  useEffect(() => {
    if (!selectedJobId) return;
    scheduleSubtitleUiSave();
  }, [scheduleSubtitleUiSave, selectedJobId, subtitleScale]);

  useEffect(() => {
    if (!selectedJobId) return;
    if (subtitleUiLoadRef.current === selectedJobId) return;
    subtitleUiLoadRef.current = selectedJobId;
    void apiGetJobRecord(selectedJobId)
      .then((res) => {
        const record = res?.record;
        if (record?.display_name) {
          dispatch(updateJobDisplayName({ jobId: selectedJobId, displayName: String(record.display_name) }));
        }
        const uiState = record?.ui_state?.subtitle;
        if (!uiState) {
          setSubtitlePosition({ x: 0.5, y: 0.85 });
          subtitleEditProgrammaticSizeRef.current = null;
          setSubtitleEditSize(null);
          setSubtitleUserSized(false);
          subtitleUserSizedRef.current = false;
          setSubtitleScale(1.4);
          return;
        }
        const userSized = Boolean(uiState.userSized);
        let nextUserSized = userSized;
        let nextSize: { width: number; height: number } | null = null;
        if (uiState.position) {
          setSubtitlePosition({
            x: Number(uiState.position.x) || 0.5,
            y: Number(uiState.position.y) || 0.85
          });
        }
        if (userSized && uiState.size) {
          const width = Number(uiState.size.width) || 0;
          const height = Number(uiState.size.height) || 0;
          if (width && height) {
            nextSize = { width, height };
          }
        }
        if (nextUserSized && !nextSize) {
          nextUserSized = false;
        }
        if (!subtitleEditor) {
          subtitleEditProgrammaticSizeRef.current = nextSize;
          setSubtitleEditSize(nextSize);
        }
        setSubtitleUserSized(nextUserSized);
        subtitleUserSizedRef.current = nextUserSized;
        if (uiState.scale) {
          const nextScale = Number(uiState.scale);
          if (Number.isFinite(nextScale)) {
            setSubtitleScale(clamp(nextScale, 0.8, 2.4));
          }
        }
      })
      .catch(() => undefined);
  }, [selectedJobId, subtitleBoxSize.height, subtitleBoxSize.width, subtitleEditor]);

  useEffect(() => {
    if (!subtitleEditor) return;
    const requested = subtitleEditOpenSizeRef.current;
    if (!requested) return;
    subtitleEditOpenSizeRef.current = null;
    const raf = window.requestAnimationFrame(() => {
      subtitleEditProgrammaticSizeRef.current = requested;
      setSubtitleEditSize(requested);
    });
    return () => window.cancelAnimationFrame(raf);
  }, [subtitleEditor]);

  useEffect(() => {
    if (subtitleEditor) return;
    if (subtitleUserSizedRef.current) return;
    if (subtitleEditSize !== null) {
      subtitleEditProgrammaticSizeRef.current = null;
      setSubtitleEditSize(null);
    }
  }, [subtitleEditSize, subtitleEditor, subtitleUserSized]);

  useEffect(() => {
    return () => {
      if (captionTimingAutosaveRef.current) {
        window.clearTimeout(captionTimingAutosaveRef.current);
        captionTimingAutosaveRef.current = null;
      }
    };
  }, []);

  // export handlers provided by hook.

  // media import handlers provided by hook.

  const handleRequestFilePicker = useCallback(
    (open: () => void) => {
      if (!isPinned) {
        open();
        return;
      }
      void setWindowOnTop(false);
      const restorePin = () => {
        window.removeEventListener("focus", restorePin);
        void setWindowOnTop(true);
      };
      window.addEventListener("focus", restorePin, { once: true });
      open();
    },
    [isPinned, setWindowOnTop]
  );

  const orderedClips = useMemo(
    () => [...timelineClips].sort((a, b) => a.startSec - b.startSec),
    [timelineClips]
  );

  const clipTimeline = useMemo(
    () =>
      orderedClips.map((clip) => {
        const rawBase =
          Number.isFinite(clip.baseDurationSec) && clip.baseDurationSec > 0 ? clip.baseDurationSec : clip.durationSec;
        const safeBase = Math.max(MIN_CLIP_DURATION_SEC, Number(rawBase) || MIN_CLIP_DURATION_SEC);
        const trimStart = clamp(clip.trimStartSec, 0, Math.max(0, safeBase - MIN_CLIP_DURATION_SEC));
        const maxDuration = Math.max(MIN_CLIP_DURATION_SEC, safeBase - trimStart);
        const durationSec = clamp(clip.durationSec, MIN_CLIP_DURATION_SEC, maxDuration);
        const trimEnd = trimStart + durationSec;
        const startSec = Math.max(0, clip.startSec);
        return {
          ...clip,
          startSec,
          durationSec,
          trimStartSec: trimStart,
          trimEndSec: trimEnd,
          baseDurationSec: safeBase
        };
      }),
    [orderedClips]
  );
  const timelineDuration = clipTimeline.reduce((max, clip) => Math.max(max, clip.startSec + clip.durationSec), 0);
  const clipById = useMemo(() => {
    const map = new Map<string, (typeof clipTimeline)[number]>();
    clipTimeline.forEach((clip) => map.set(clip.id, clip));
    return map;
  }, [clipTimeline]);
  const modelProgressText =
    modelDownload.totalBytes && modelDownload.downloadedBytes
      ? `${formatBytes(modelDownload.downloadedBytes)} / ${formatBytes(modelDownload.totalBytes)}`
      : modelDownload.downloadedBytes
        ? `${formatBytes(modelDownload.downloadedBytes)} downloaded`
        : null;
  const nextClip = useMemo(() => {
    if (!activeClipId) return null;
    const index = clipTimeline.findIndex((clip) => clip.id === activeClipId);
    if (index < 0 || index >= clipTimeline.length - 1) return null;
    return clipTimeline[index + 1];
  }, [activeClipId, clipTimeline]);
  const timelineRanges = useMemo(() => {
    const ranges: Array<
      | { type: "clip"; startSec: number; durationSec: number; clipId: string }
      | { type: "gap"; startSec: number; durationSec: number }
    > = [];
    let cursor = 0;
    clipTimeline.forEach((clip) => {
      if (clip.startSec > cursor + 0.01) {
        ranges.push({ type: "gap", startSec: cursor, durationSec: clip.startSec - cursor });
      }
      ranges.push({
        type: "clip",
        startSec: clip.startSec,
        durationSec: clip.durationSec,
        clipId: clip.id
      });
      cursor = clip.startSec + clip.durationSec;
    });
    return ranges;
  }, [clipTimeline]);

  const applyPlaybackRate = useCallback(
    (mediaEl: HTMLMediaElement | null, rate: number = playbackRate) => {
      if (!mediaEl) return;
      try {
        mediaEl.playbackRate = rate;
      } catch {
        // Ignore.
      }
      const el = mediaEl as HTMLMediaElement & {
        preservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      if ("preservesPitch" in el) {
        el.preservesPitch = rate <= 2;
      }
      if ("webkitPreservesPitch" in el) {
        el.webkitPreservesPitch = rate <= 2;
      }
    },
    [playbackRate]
  );

  const safePlay = useCallback((mediaEl: HTMLMediaElement | null) => {
    if (!mediaEl) return Promise.resolve(false);
    let threw = false;
    const attempt = () => {
      try {
        return mediaEl.play();
      } catch {
        threw = true;
        return undefined;
      }
    };
    const initial = attempt();
    if (initial && typeof (initial as Promise<void>).then === "function") {
      return (initial as Promise<void>)
        .then(() => true)
        .catch(() => {
          try {
            mediaEl.load();
          } catch {
            // Ignore.
          }
          const retry = attempt();
          if (retry && typeof (retry as Promise<void>).then === "function") {
            return (retry as Promise<void>).then(() => true).catch(() => false);
          }
          return false;
        });
    }
    if (threw) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      if (typeof window === "undefined") {
        resolve(!mediaEl.paused);
        return;
      }
      window.requestAnimationFrame(() => resolve(!mediaEl.paused));
    });
  }, []);

  const schedulePendingPlay = useCallback(
    (mediaEl: HTMLMediaElement | null) => {
      if (!mediaEl) return;
      if (pendingPlayRafRef.current !== null) return;
      const step = () => {
        pendingPlayRafRef.current = null;
        if (!pendingPlayRef.current) return;
        if (pendingPlayTargetRef.current && pendingPlayTargetRef.current !== activeMedia?.id) {
          pendingPlayRef.current = false;
          pendingPlayTargetRef.current = null;
          return;
        }
        if (mediaEl.readyState < 2) {
          if (typeof window !== "undefined") {
            pendingPlayRafRef.current = window.requestAnimationFrame(step);
          }
          return;
        }
        void safePlay(mediaEl).then((ok) => {
          pendingPlayRef.current = !ok;
          if (!ok && typeof window !== "undefined") {
            pendingPlayRafRef.current = window.requestAnimationFrame(step);
          }
        });
      };
      if (typeof window === "undefined") {
        step();
        return;
      }
      pendingPlayRafRef.current = window.requestAnimationFrame(step);
    },
    [activeMedia?.id, safePlay]
  );

  useEffect(() => {
    if (pendingPlayTargetRef.current && pendingPlayTargetRef.current !== activeMedia?.id) {
      pendingPlayRef.current = false;
      pendingPlayTargetRef.current = null;
      if (pendingPlayRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(pendingPlayRafRef.current);
        pendingPlayRafRef.current = null;
      }
    }
  }, [activeMedia?.id]);

  useEffect(() => {
    return () => {
      if (pendingPlayRafRef.current !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(pendingPlayRafRef.current);
        pendingPlayRafRef.current = null;
      }
    };
  }, []);

  const capturePreviewPoster = useCallback((mediaEl: HTMLMediaElement | null) => {
    if (!mediaEl) return;
    const videoEl = mediaEl as HTMLVideoElement;
    if (typeof videoEl.videoWidth !== "number" || typeof videoEl.videoHeight !== "number") return;
    if (videoEl.readyState < 2 || videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl) {
        previewPosterModeRef.current = "paused";
        setPreviewPoster(dataUrl);
      }
    } catch {
      // Ignore capture failures (cross-origin or canvas errors).
    }
  }, []);

  const getActiveVideoEl = useCallback(() => {
    return activeVideoSlot === 0 ? videoRefA.current : videoRefB.current;
  }, [activeVideoSlot]);

  const getInactiveVideoEl = useCallback(() => {
    return activeVideoSlot === 0 ? videoRefB.current : videoRefA.current;
  }, [activeVideoSlot]);

  const getActiveMediaEl = useCallback(() => {
    return activePreviewKind === "video" ? getActiveVideoEl() : audioRef.current;
  }, [activePreviewKind, getActiveVideoEl]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      const next = prev < 1.25 ? 1.5 : prev < 1.75 ? 2 : 1;
      applyPlaybackRate(getActiveMediaEl(), next);
      if (activePreviewKind === "video") {
        applyPlaybackRate(getInactiveVideoEl(), next);
      }
      return next;
    });
  }, [activePreviewKind, applyPlaybackRate, getActiveMediaEl, getInactiveVideoEl]);

  const handleToggleChineseVariant = useCallback(() => {
    dispatch(setExportLanguage(exportLanguage === "traditional" ? "simplified" : "traditional"));
  }, [dispatch, exportLanguage]);

  const handleSubtitleScaleDecrease = useCallback(() => {
    setSubtitleScale((value) => Math.max(0.8, Number((value - 0.15).toFixed(2))));
  }, []);

  const handleSubtitleScaleIncrease = useCallback(() => {
    setSubtitleScale((value) => Math.min(2.4, Number((value + 0.15).toFixed(2))));
  }, []);

  const handleSrtSelected = useCallback(
    async (file: File) => {
      try {
        if (!file.name.toLowerCase().endsWith(".srt")) {
          notify("Please select a .srt file.", "error");
          return;
        }
        const raw = await file.text();
        const parsed = parseSrt(raw);
        if (!parsed.length) {
          notify("No captions found in the SRT file.", "error");
          return;
        }
        let jobId = selectedJob?.id ?? null;
        if (!jobId) {
          jobId = `srt-${Date.now()}`;
          const filename = activeMedia?.name || file.name;
          const audioFile = activeMedia?.file
            ? {
                name: activeMedia.file.name,
                size: activeMedia.file.size,
                path: null
              }
            : { name: filename, size: null, path: null };
          const newJob: Job = {
            id: jobId,
            filename,
            displayName: stripFileExtension(filename) || filename,
            status: "completed",
            message: "Captions loaded",
            progress: 100,
            startTime: Date.now(),
            completedAt: Date.now(),
            audioFile,
            result: null,
            partialResult: null,
            error: null,
            currentStage: null
          };
          dispatch(addJob(newJob));
        }
        dispatch(setJobSegments({ jobId, segments: parsed }));
        dispatch(selectJob(jobId));
        const mergedText = parsed.map((segment) => segment.text || "").join(" ").trim();
        void apiUpsertJobRecord({
          job_id: jobId,
          filename,
          display_name: stripFileExtension(filename) || filename,
          media_path: (activeMedia as any)?.localPath ?? null,
          media_kind: activeMedia?.kind ?? null,
          status: "completed",
          transcript_json: {
            job_id: jobId,
            segments: parsed,
            text: mergedText
          },
          transcript_text: mergedText,
          segment_count: parsed.length
        }).catch(() => undefined);
        notify("SRT loaded into captions.", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(message || "Failed to load SRT.", "error");
      }
    },
    [activeMedia?.file, activeMedia?.name, dispatch, notify, selectedJob?.id]
  );

  const handleLoadSrt = useCallback(() => {
    if (!activeMedia) {
      notify("Please select a job to continue", "info");
      return;
    }
    handleRequestFilePicker(() => {
      const api = (window as any)?.pywebview?.api;
      const openNative = api?.openSrtDialog || api?.open_srt_dialog;
      if (typeof openNative === "function") {
        void openNative
          .call(api)
          .then((result: any) => {
            if (!result || result.cancelled) return;
            if (!result.success || !result.file?.data) {
              const message =
                result?.error === "unsupported_file"
                  ? "Please select a .srt file."
                  : result?.error || "Failed to open SRT file.";
              notify(message, "error");
              return;
            }
            const file = fileFromBase64(result.file.data, result.file.name || "captions.srt", result.file.mime);
            void handleSrtSelected(file);
          })
          .catch((error: any) => {
            const message = error instanceof Error ? error.message : String(error);
            notify(message || "Failed to open SRT file.", "error");
          });
        return;
      }
      if (srtInputRef.current) {
        srtInputRef.current.accept = ".srt,application/x-subrip,text/plain";
        srtInputRef.current.click();
      }
    });
  }, [activeMedia, handleRequestFilePicker, handleSrtSelected, notify]);

  const handleClearCaptions = useCallback(() => {
    if (!activeJob?.id) {
      notify("No captions to clear.", "info");
      return;
    }
    dispatch(setJobSegments({ jobId: activeJob.id, segments: [] }));
    void apiUpsertJobRecord({
      job_id: activeJob.id,
      filename: activeJob.filename,
      display_name: activeJob.displayName ?? activeJob.filename,
      media_path: (activeMedia as any)?.localPath ?? activeJob.audioFile?.path ?? null,
      media_kind: activeMedia?.kind ?? null,
      status: "imported",
      transcript_json: { job_id: activeJob.id, segments: [], text: "" },
      transcript_text: "",
      segment_count: 0
    }).catch(() => undefined);

  }, [
    activeJob?.audioFile?.path,
    activeJob?.displayName,
    activeJob?.filename,
    activeJob?.id,
    activeMedia,
    dispatch,
    notify
  ]);

  const handleGenerateCaptions = useCallback(async () => {
    if (!timelineClips.length) {
      setShowImportModal(true);
      return;
    }
    const ready = await ensureWhisperModelReady();
    if (!ready) return;
    uploadRef.current?.submitTranscription?.();
  }, [ensureWhisperModelReady, setShowImportModal, timelineClips.length]);

  const openExternalUrl = useCallback(
    (url: string) => {
      if (!url) return;
      const win = typeof window !== "undefined" ? (window as any) : null;
      const api = win?.pywebview?.api;
      const result = callApiMethod(api, ["open_external", "openExternal"], url);
      if (result) return;
      try {
        window.open(url, "_blank", "noopener");
      } catch {
        // Ignore.
      }
    },
    []
  );

  // premium status and window controls handled by hooks.

  const transcriptMediaRef =
    activePreviewKind === "video"
      ? (activeVideoSlot === 0
        ? (videoRefA as RefObject<HTMLMediaElement>)
        : (videoRefB as RefObject<HTMLMediaElement>))
      : (audioRef as RefObject<HTMLMediaElement>);

  const advanceFromClip = useCallback(
    (clipEntry: (typeof clipTimeline)[number] | null, endTime: number) => {
      if (!clipEntry) {
        setPlayback((prev) => ({ ...prev, isPlaying: false }));
        return;
      }
      const nextClip = clipTimeline.find(
        (clip) => clip.startSec >= endTime - 0.01 && clip.startSec <= endTime + 0.05
      );
      if (nextClip) {
        const nextEntry = clipById.get(nextClip.id);
        if (nextEntry) {
          if (pendingSwapRef.current === nextEntry.id) {
            return;
          }
          const switchToNext = () => {
            setPreviewPoster(null);
            isGapPlaybackRef.current = false;
            setActiveClipId(nextEntry.id);
            setActiveMedia(nextEntry.media);
            pendingSeekRef.current = nextEntry.trimStartSec;
            pendingPlayRef.current = true;
            pendingSwapRef.current = null;
            setPlayback((prev) => ({ ...prev, isPlaying: true }));
          };
          const sameMedia = clipEntry.media.id === nextEntry.media.id;
          const canSwapVideo =
            !sameMedia &&
            getPreviewKind(nextEntry.media) === "video" &&
            Boolean(getInactiveVideoEl());
          if (canSwapVideo) {
            const nextVideo = getInactiveVideoEl();
            if (nextVideo && nextEntry.media.previewUrl && nextVideo.src === nextEntry.media.previewUrl) {
              pendingSwapRef.current = nextEntry.id;
              applyPlaybackRate(nextVideo);
              const desiredTime = Math.max(0, nextEntry.trimStartSec);
              if (!Number.isFinite(nextVideo.currentTime) || Math.abs(nextVideo.currentTime - desiredTime) > 0.05) {
                try {
                  nextVideo.currentTime = desiredTime;
                } catch {
                  // Ignore.
                }
              }
              nextVideo.muted = true;
              const swap = () => {
                nextVideo.muted = false;
                const currentVideo = getActiveVideoEl();
                if (currentVideo) {
                  currentVideo.muted = true;
                  try {
                    currentVideo.pause();
                  } catch {
                    // Ignore.
                  }
                }
                setPreviewPoster(null);
                setActiveVideoSlot((prev) => (prev === 0 ? 1 : 0));
                setActiveClipId(nextEntry.id);
                setActiveMedia(nextEntry.media);
                pendingSeekRef.current = null;
                pendingPlayRef.current = false;
                pendingSwapRef.current = null;
                setPlayback((prev) => ({ ...prev, isPlaying: true }));
              };
              const playAndSwap = () => {
                void safePlay(nextVideo);
                const anyVideo = nextVideo as HTMLVideoElement & {
                  requestVideoFrameCallback?: (cb: () => void) => void;
                };
                if (typeof anyVideo.requestVideoFrameCallback === "function") {
                  anyVideo.requestVideoFrameCallback(() => swap());
                } else {
                  // Fallback: swap on first canplay tick.
                  window.setTimeout(swap, 0);
                }
              };
              if (nextVideo.readyState >= 2) {
                playAndSwap();
                return;
              }
              const fallbackId = window.setTimeout(() => {
                nextVideo.removeEventListener("loadeddata", onReady);
                switchToNext();
              }, 300);
              const onReady = () => {
                nextVideo.removeEventListener("loadeddata", onReady);
                window.clearTimeout(fallbackId);
                playAndSwap();
              };
              nextVideo.addEventListener("loadeddata", onReady);
              return;
            }
            pendingSwapRef.current = null;
          }
          setPreviewPoster(null);
          const mediaEl = getActiveMediaEl();
          if (sameMedia && mediaEl) {
            const currentTime = Number.isFinite(mediaEl.currentTime) ? mediaEl.currentTime : 0;
            if (currentTime >= nextEntry.trimStartSec - 0.03) {
              setActiveClipId(nextEntry.id);
              if (activeMedia?.id !== nextEntry.media.id) {
                setActiveMedia(nextEntry.media);
              }
              pendingSeekRef.current = null;
              pendingPlayRef.current = false;
              pendingSwapRef.current = null;
              setPlayback((prev) => ({ ...prev, isPlaying: true }));
              return;
            }
          }
          switchToNext();
          return;
        }
      }
      isGapPlaybackRef.current = true;
      const mediaEl = getActiveMediaEl();
      if (mediaEl && !mediaEl.paused) {
        try {
          mediaEl.pause();
        } catch {
          // Ignore.
        }
      }
      setActiveClipId(null);
      setActiveMedia(null);
      pendingSeekRef.current = null;
      pendingPlayRef.current = false;
      setPlayback((prev) => ({ ...prev, isPlaying: true }));
    },
    [
      activeMedia?.id,
      activePreviewKind,
      applyPlaybackRate,
      clipById,
      clipTimeline,
      getPreviewKind,
      getActiveMediaEl,
      getActiveVideoEl,
      getInactiveVideoEl,
      safePlay
    ]
  );

  useEffect(() => {
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) {
      setPlayback({ currentTime: 0, duration: 0, isPlaying: false });
      return;
    }

    const clearPosterIfReady = () => {
      if (previewPosterModeRef.current === "paused") return;
      if (!previewPosterRef.current || !activeClipId) return;
      const clipEntry = clipById.get(activeClipId);
      if (!clipEntry) return;
      const mediaTime = Number.isFinite(mediaEl.currentTime) ? mediaEl.currentTime : 0;
      if (mediaEl.readyState >= 2 && mediaTime >= clipEntry.trimStartSec + 0.02) {
        setPreviewPoster(null);
      }
    };

    const onLoaded = () => {
      if (!activeMedia) {
        return;
      }
      applyPlaybackRate(mediaEl);
      const mediaDuration = Number.isFinite(mediaEl.duration) ? mediaEl.duration : 0;
      if (mediaDuration > 0) {
        setPlayback((prev) => ({ ...prev, duration: mediaDuration }));
      }
      if (pendingSeekRef.current !== null) {
        try {
          mediaEl.currentTime = pendingSeekRef.current;
        } catch {
          // Ignore.
        }
        pendingSeekRef.current = null;
      }
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        void safePlay(mediaEl).then((ok) => {
          if (!ok) {
            pendingPlayRef.current = true;
            schedulePendingPlay(mediaEl);
          }
        });
      }
      clearPosterIfReady();
    };
    const onTime = () => {
      if (mediaRafActiveRef.current) {
        clearPosterIfReady();
        return;
      }
      const mediaTime = Number.isFinite(mediaEl.currentTime) ? mediaEl.currentTime : 0;
      if (!clipTimeline.length) {
        setPlayback((prev) => ({ ...prev, currentTime: mediaTime }));
        return;
      }
      if (!activeClipId) {
        return;
      }
      const clipEntry = clipTimeline.find((clip) => clip.id === activeClipId);
      if (!clipEntry) return;
      clearPosterIfReady();
      if (mediaTime >= clipEntry.trimEndSec - 0.02) {
        const endTime = clipEntry.startSec + clipEntry.durationSec;
        setPlayback((prev) => ({ ...prev, currentTime: endTime }));
        advanceFromClip(clipEntry, endTime);
        return;
      }
      const localTime = Math.max(0, mediaTime - clipEntry.trimStartSec);
      setPlayback((prev) => ({ ...prev, currentTime: clipEntry.startSec + localTime }));
    };
    const onPlay = () => {
      if (previewPosterModeRef.current === "paused") {
        setPreviewPoster(null);
      }
      setPlayback((prev) => ({ ...prev, isPlaying: true }));
    };
    const onPause = () => {
      if (isGapPlaybackRef.current) return;
      setPlayback((prev) => ({ ...prev, isPlaying: false }));
      if (
        activePreviewKind === "video" &&
        !playerScrubRef.current &&
        !scrubStateRef.current
      ) {
        capturePreviewPoster(mediaEl);
      }
    };
    const onEnded = () => {
      if (!clipTimeline.length || !activeClipId) {
        if (isGapPlaybackRef.current) {
          return;
        }
        setPlayback((prev) => ({ ...prev, isPlaying: false }));
        return;
      }
      const current = clipById.get(activeClipId);
      const endTime = current ? current.startSec + current.durationSec : playbackRef.current.currentTime;
      advanceFromClip(current ?? null, endTime);
    };

    mediaEl.addEventListener("loadedmetadata", onLoaded);
    mediaEl.addEventListener("loadeddata", clearPosterIfReady);
    mediaEl.addEventListener("seeked", clearPosterIfReady);
    mediaEl.addEventListener("timeupdate", onTime);
    mediaEl.addEventListener("play", onPlay);
    mediaEl.addEventListener("pause", onPause);
    mediaEl.addEventListener("ended", onEnded);
    return () => {
      mediaEl.removeEventListener("loadedmetadata", onLoaded);
      mediaEl.removeEventListener("loadeddata", clearPosterIfReady);
      mediaEl.removeEventListener("seeked", clearPosterIfReady);
      mediaEl.removeEventListener("timeupdate", onTime);
      mediaEl.removeEventListener("play", onPlay);
      mediaEl.removeEventListener("pause", onPause);
      mediaEl.removeEventListener("ended", onEnded);
    };
  }, [
    activeClipId,
    activePreviewKind,
    advanceFromClip,
    clipById,
    clipTimeline,
    getActiveMediaEl,
    applyPlaybackRate,
    safePlay,
    capturePreviewPoster,
    schedulePendingPlay
  ]);

  useEffect(() => {
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    applyPlaybackRate(mediaEl);
  }, [getActiveMediaEl, applyPlaybackRate, activeMedia?.id, activePreviewKind]);

  useEffect(() => {
    if (!playback.isPlaying) return;
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    if (!activeClipId) return;
    const clipEntry = clipById.get(activeClipId);
    if (!clipEntry) return;
    mediaRafActiveRef.current = true;
    let rafId: number | null = null;
    let lastUiUpdate = 0;
    const step = (now: number) => {
      if (!playbackRef.current.isPlaying) {
        mediaRafActiveRef.current = false;
        return;
      }
      const currentClip = clipById.get(activeClipId);
      if (!currentClip) {
        mediaRafActiveRef.current = false;
        return;
      }
      const mediaTime = Number.isFinite(mediaEl.currentTime) ? mediaEl.currentTime : 0;
      if (mediaTime >= currentClip.trimEndSec - 0.005) {
        const endTime = currentClip.startSec + currentClip.durationSec;
        setPlayback((prev) => ({ ...prev, currentTime: endTime }));
        mediaRafActiveRef.current = false;
        advanceFromClip(currentClip, endTime);
        return;
      }
      if (now - lastUiUpdate >= 33) {
        lastUiUpdate = now;
        const localTime = Math.max(0, mediaTime - currentClip.trimStartSec);
        setPlayback((prev) => ({ ...prev, currentTime: currentClip.startSec + localTime }));
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => {
      mediaRafActiveRef.current = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [activeClipId, advanceFromClip, clipById, getActiveMediaEl, playback.isPlaying]);

  useEffect(() => {
    if (!activeMedia) {
      setActivePreviewUrl(null);
      return;
    }
    const toFileUrl = (path: string) => `/media?path=${encodeURIComponent(path)}`;
    const preferLocalYoutube =
      activeMedia.externalSource?.type === "youtube" && (activeMedia.streamError || !isOnline);
    if (activeMedia.previewUrl && !preferLocalYoutube) {
      setActivePreviewUrl(null);
      return;
    }
    if (activeMedia.externalSource?.type === "youtube") {
      if (activeMedia.localPath) {
        setActivePreviewUrl(toFileUrl(activeMedia.localPath));
        return;
      }
      if (activeMedia.source === "job" && activeMedia.jobId) {
        setActivePreviewUrl(`/audio/${activeMedia.jobId}?v=${Date.now()}`);
        return;
      }
    }
    if (activeMedia.source === "job" && activeMedia.jobId) {
      setActivePreviewUrl(`/audio/${activeMedia.jobId}?v=${Date.now()}`);
      return;
    }
    if (activeMedia.localPath) {
      setActivePreviewUrl(toFileUrl(activeMedia.localPath));
      return;
    }
    if (activeMedia.file) {
      const url = activeMedia.previewUrl ?? URL.createObjectURL(activeMedia.file);
      setActivePreviewUrl(url);
      if (!activeMedia.previewUrl) {
        return () => URL.revokeObjectURL(url);
      }
      return;
    }
    setActivePreviewUrl(null);
  }, [activeMedia, isOnline]);

  const localPreviewUrl = activeMedia?.localPath
    ? `/media?path=${encodeURIComponent(activeMedia.localPath)}`
    : null;
  const resolvedPreviewUrl =
    activeMedia?.externalSource?.type === "youtube" && (activeMedia.streamError || !isOnline)
      ? localPreviewUrl ?? activePreviewUrl ?? activeMedia?.previewUrl ?? null
      : activeMedia?.previewUrl ?? activePreviewUrl;
  useEffect(() => {
    if (!pendingPlayRef.current) return;
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    schedulePendingPlay(mediaEl);
  }, [getActiveMediaEl, activeMedia?.id, activePreviewKind, resolvedPreviewUrl, schedulePendingPlay]);

  useEffect(() => {
    if (!activeMedia) return;
    if (activeMedia.externalSource?.type !== "youtube") return;
    if (!isOnline) return;
    if (activeMedia.isResolvingStream) return;
    const existingStream = activeMedia.streamUrl ?? activeMedia.externalSource?.streamUrl ?? null;
    if (existingStream && !activeMedia.streamError) return;
    void resolveYoutubeStreamForMedia(activeMedia);
  }, [
    activeMedia,
    activeMedia?.externalSource?.streamUrl,
    activeMedia?.externalSource?.type,
    activeMedia?.id,
    activeMedia?.isResolvingStream,
    activeMedia?.streamError,
    activeMedia?.streamUrl,
    isOnline,
    resolveYoutubeStreamForMedia
  ]);
  useEffect(() => {
    if (!activeMedia) {
      setPreviewLoading(false);
      setPreviewError(null);
      return;
    }
    if (activeMedia.isResolvingStream) {
      setPreviewLoading(true);
    }
  }, [activeMedia?.id, activeMedia?.isResolvingStream]);

  useEffect(() => {
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    const handleStart = () => {
      setPreviewLoading(true);
      setPreviewError(null);
    };
    const handleReady = () => {
      setPreviewLoading(false);
      setPreviewError(null);
      if (pendingPlayRef.current) {
        schedulePendingPlay(mediaEl);
      }
    };
    const handleError = () => {
      setPreviewLoading(false);
      setPreviewError("Preview failed to load.");
      if (activeMedia?.externalSource?.type === "youtube" && !activeMedia.streamError) {
        const nextMedia = { ...activeMedia, streamError: "YouTube preview failed to load." };
        setActiveMedia(nextMedia);
        setTimelineClips((prev) =>
          prev.map((clip) => (clip.media.id === nextMedia.id ? { ...clip, media: nextMedia } : clip))
        );
        if (nextMedia.source === "local") {
          setLocalMedia((prev) => prev.map((item) => (item.id === nextMedia.id ? nextMedia : item)));
        }
      }
    };
    mediaEl.addEventListener("loadstart", handleStart);
    mediaEl.addEventListener("loadeddata", handleReady);
    mediaEl.addEventListener("canplay", handleReady);
    mediaEl.addEventListener("error", handleError);
    return () => {
      mediaEl.removeEventListener("loadstart", handleStart);
      mediaEl.removeEventListener("loadeddata", handleReady);
      mediaEl.removeEventListener("canplay", handleReady);
      mediaEl.removeEventListener("error", handleError);
    };
  }, [
    activeMedia,
    activePreviewKind,
    getActiveMediaEl,
    resolvedPreviewUrl,
    schedulePendingPlay,
    setLocalMedia,
    setTimelineClips
  ]);

  const activeVideoSrc = resolvedPreviewUrl && activePreviewKind === "video" ? resolvedPreviewUrl : null;
  const audioPreviewSrc = activePreviewKind === "audio" ? resolvedPreviewUrl : null;
  const showPreviewSpinner = previewLoading || Boolean(activeMedia?.isResolvingStream);
  const youtubeUnavailableReason =
    activeMedia?.externalSource?.type === "youtube" && !activeMedia?.isResolvingStream
      ? !isOnline
        ? "You're offline. Connect to the internet to load the YouTube preview."
        : activeMedia.streamError || null
      : null;
  const showYoutubeUnavailable = Boolean(youtubeUnavailableReason);
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;
    try {
      audioEl.pause();
    } catch {
      // Ignore.
    }
    try {
      audioEl.currentTime = 0;
    } catch {
      // Ignore.
    }
    try {
      audioEl.load();
    } catch {
      // Ignore.
    }
  }, [audioPreviewSrc]);
  useEffect(() => {
    if (!activeVideoSrc) return;
    const videoEl = getActiveVideoEl();
    if (!videoEl) return;
    setPreviewPoster(null);
    previewPosterModeRef.current = null;
    const handleLoaded = () => {
      if (playbackRef.current.isPlaying) return;
      try {
        videoEl.currentTime = 0;
      } catch {
        // Ignore.
      }
      capturePreviewPoster(videoEl);
    };
    videoEl.addEventListener("loadeddata", handleLoaded);
    try {
      videoEl.load();
    } catch {
      // Ignore.
    }
    return () => {
      videoEl.removeEventListener("loadeddata", handleLoaded);
    };
  }, [activeVideoSrc, capturePreviewPoster, getActiveVideoEl]);
  const shouldShowPreviewPoster = Boolean(previewPoster);
  const nextVideoTarget = useMemo(() => {
    if (!nextClip) return null;
    if (getPreviewKind(nextClip.media) !== "video") return null;
    if (activeMedia?.id === nextClip.media.id) return null;
    return {
      url: nextClip.media.previewUrl ?? null,
      trimStartSec: nextClip.trimStartSec
    };
  }, [activeMedia?.id, getPreviewKind, nextClip]);

  useEffect(() => {
    if (!nextVideoTarget?.url) return;
    const nextEl = getInactiveVideoEl();
    if (!nextEl) return;
    nextEl.preload = "auto";
    nextEl.muted = true;
    nextEl.playsInline = true;
    const onLoaded = () => {
      try {
        const desired = Math.max(0, nextVideoTarget.trimStartSec);
        if (!Number.isFinite(nextEl.currentTime) || Math.abs(nextEl.currentTime - desired) > 0.05) {
          nextEl.currentTime = desired;
        }
      } catch {
        // Ignore.
      }
    };
    nextEl.addEventListener("loadedmetadata", onLoaded);
    nextEl.load();
    return () => {
      nextEl.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [getInactiveVideoEl, nextVideoTarget?.trimStartSec, nextVideoTarget?.url]);

  useEffect(() => {
    const target = pendingSeekRef.current;
    if (target === null) return;
    if (activeMedia?.isResolvingStream) return;
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    if (mediaEl.readyState >= 1) {
      try {
        mediaEl.currentTime = target;
        pendingSeekRef.current = null;
      } catch {
        // Ignore.
      }
      if (pendingPlayRef.current) {
        pendingPlayRef.current = false;
        if (mediaEl.paused) {
          void safePlay(mediaEl).then((ok) => {
            if (!ok) {
              pendingPlayRef.current = true;
              schedulePendingPlay(mediaEl);
            }
          });
        }
      }
    }
  }, [activeClipId, activeMedia, getActiveMediaEl, safePlay, schedulePendingPlay]);

  useEffect(() => {
    if (activeClipId && !clipById.has(activeClipId)) {
      const next = clipTimeline[0];
      if (next) {
        setActiveClipId(next.id);
        setActiveMedia(next.media);
      } else {
        setActiveClipId(null);
        setActiveMedia(null);
      }
    }
  }, [activeClipId, clipById, clipTimeline]);

  useEffect(() => {
    if (clipTimeline.length) return;
    if (activeMedia || activeClipId) {
      setActiveClipId(null);
      setActiveMedia(null);
    }
    setPlayback((prev) => ({ ...prev, currentTime: 0, isPlaying: false }));
  }, [activeClipId, activeMedia, clipTimeline.length]);

  useEffect(() => {
    if (!activeMedia || activeClipId) return;
    const stillInTimeline = clipTimeline.some((clip) => clip.media.id === activeMedia.id);
    if (stillInTimeline) return;
    setActiveMedia(null);
  }, [activeClipId, activeMedia, clipTimeline]);

  useEffect(() => {
    if (!clipTimeline.length) return;
    const range = timelineRanges.find(
      (r) => playback.currentTime >= r.startSec && playback.currentTime < r.startSec + r.durationSec
    );
    if (!range || range.type === "gap") {
      if (activeMedia || activeClipId) {
        isGapPlaybackRef.current = true;
        setActiveClipId(null);
        setActiveMedia(null);
      }
      return;
    }
    if (activeClipId === range.clipId && activeMedia) return;
    const target = clipById.get(range.clipId);
    if (!target) return;
    const offset = Math.max(0, playback.currentTime - target.startSec);
    const newTime = Math.min(target.trimEndSec, target.trimStartSec + offset);
    const mediaEl = getActiveMediaEl();
    const sameMedia = activeMedia?.id === target.media.id;
    if (sameMedia && mediaEl) {
      const currentTime = Number.isFinite(mediaEl.currentTime) ? mediaEl.currentTime : 0;
      if (Math.abs(currentTime - newTime) <= 0.05) {
        isGapPlaybackRef.current = false;
        setActiveClipId(target.id);
        pendingSeekRef.current = null;
        pendingPlayRef.current = false;
        return;
      }
    }
    isGapPlaybackRef.current = false;
    setActiveClipId(target.id);
    setActiveMedia(target.media);
    pendingSeekRef.current = newTime;
    pendingPlayRef.current = playback.isPlaying;
  }, [activeClipId, activeMedia, clipById, clipTimeline.length, playback.currentTime, playback.isPlaying, timelineRanges]);

  useEffect(() => {
    if (!localMedia.length) return;
    const mediaById = new Map(localMedia.map((item) => [item.id, item]));
    setTimelineClips((prev) => {
      let changed = false;
      const next = prev.map((clip) => {
        const updated = mediaById.get(clip.media.id);
        if (!updated || !Number.isFinite(updated.durationSec) || !updated.durationSec) {
          return clip;
        }
        const base = Math.max(MIN_CLIP_DURATION_SEC, updated.durationSec);
        if (Math.abs(base - clip.baseDurationSec) < 0.05 && updated.thumbnailUrl === clip.media.thumbnailUrl) {
          return clip;
        }
        const wasUntrimmed =
          clip.trimStartSec <= 0.01 && Math.abs(clip.durationSec - clip.baseDurationSec) < 0.05;
        const trimStartSec = wasUntrimmed
          ? 0
          : clamp(clip.trimStartSec, 0, Math.max(0, base - MIN_CLIP_DURATION_SEC));
        const maxDur = Math.max(MIN_CLIP_DURATION_SEC, base - trimStartSec);
        const durationSec = wasUntrimmed
          ? maxDur
          : clamp(clip.durationSec, MIN_CLIP_DURATION_SEC, maxDur);
        const trimEndSec = trimStartSec + durationSec;
        changed = true;
        return {
          ...clip,
          media: updated,
          baseDurationSec: base,
          trimStartSec,
          durationSec,
          trimEndSec
        };
      });
      return changed ? normalizeClips(next) : prev;
    });
  }, [localMedia]);

  useEffect(() => {
    if (!activeMedia || activeMedia.source !== "job") return;
    if (!Number.isFinite(playback.duration) || playback.duration <= 0) return;
    const base = Math.max(MIN_CLIP_DURATION_SEC, playback.duration);
    setTimelineClips((prev) => {
      let changed = false;
      const next = prev.map((clip) => {
        if (clip.media.id !== activeMedia.id) return clip;
        if (Math.abs(base - clip.baseDurationSec) < 0.05) return clip;
        const wasUntrimmed =
          clip.trimStartSec <= 0.01 && Math.abs(clip.durationSec - clip.baseDurationSec) < 0.05;
        const trimStartSec = wasUntrimmed
          ? 0
          : clamp(clip.trimStartSec, 0, Math.max(0, base - MIN_CLIP_DURATION_SEC));
        const maxDur = Math.max(MIN_CLIP_DURATION_SEC, base - trimStartSec);
        const durationSec = wasUntrimmed
          ? maxDur
          : clamp(clip.durationSec, MIN_CLIP_DURATION_SEC, maxDur);
        const trimEndSec = trimStartSec + durationSec;
        changed = true;
        return {
          ...clip,
          baseDurationSec: base,
          trimStartSec,
          durationSec,
          trimEndSec
        };
      });
      return changed ? normalizeClips(next) : prev;
    });
  }, [activeMedia, playback.duration]);

  useEffect(() => {
    if (activePreviewKind === "video" && audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // Ignore.
      }
    }
    if (activePreviewKind === "audio") {
      [videoRefA.current, videoRefB.current].forEach((video) => {
        if (!video) return;
        try {
          video.pause();
        } catch {
          // Ignore.
        }
      });
    }
  }, [activeMedia?.id, activePreviewKind]);

  useEffect(() => {
    if (!clipTimeline.length) return;
    if (!Number.isFinite(timelineDuration)) return;
    if (playback.currentTime <= timelineDuration) return;
    const mediaEl = getActiveMediaEl();
    if (mediaEl && !mediaEl.paused) {
      try {
        mediaEl.pause();
      } catch {
        // Ignore.
      }
    }
    setPlayback((prev) => ({ ...prev, currentTime: timelineDuration, isPlaying: false }));
  }, [clipTimeline.length, timelineDuration, playback.currentTime, getActiveMediaEl]);

  useEffect(() => {
    if (!activeMedia) return;
    if (activeMedia.source === "job" && activeMedia.jobId && !jobsById[activeMedia.jobId]) {
      pendingSeekRef.current = null;
      pendingPlayRef.current = false;
      setActiveClipId(null);
      setActiveMedia(null);
      setActivePreviewUrl(null);
      setPlayback((prev) => ({ ...prev, currentTime: 0, duration: 0, isPlaying: false }));
    }
  }, [activeMedia, jobsById]);

  useEffect(() => {
    if (!timelineClips.length) return;
    setTimelineClips((prev) => {
      const next = prev.filter((clip) => {
        if (clip.media.source !== "job") return true;
        if (!clip.media.jobId) return false;
        return Boolean(jobsById[clip.media.jobId]);
      });
      if (next.length === prev.length) return prev;
      return next;
    });
  }, [jobsById, timelineClips.length]);

  useEffect(() => {
    if (!activeMedia || activeMedia.source !== "job" || !activeMedia.jobId) return;
    if (selectedJobId === activeMedia.jobId) return;
    dispatch(selectJob(activeMedia.jobId));
  }, [activeMedia, dispatch, selectedJobId]);

  useEffect(() => {
    if (!clipTimeline.length) return;
    if (activeMedia) return;
    if (!playback.isPlaying) return;
    if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) return;
    let frameId: number | null = null;
    let lastTime = performance.now();
    const step = (now: number) => {
      const delta = Math.max(0, (now - lastTime) / 1000);
      lastTime = now;
      setPlayback((prev) => {
        if (!prev.isPlaying) return prev;
        const nextTime = Math.min(timelineDuration, prev.currentTime + delta);
        if (nextTime >= timelineDuration) {
          return { ...prev, currentTime: timelineDuration, isPlaying: false };
        }
        return { ...prev, currentTime: nextTime };
      });
      frameId = requestAnimationFrame(step);
    };
    frameId = requestAnimationFrame(step);
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
    };
  }, [activeMedia, clipTimeline.length, playback.isPlaying, timelineDuration]);

  const fallbackDuration =
    Number.isFinite(activeMedia?.durationSec) && activeMedia?.durationSec ? activeMedia.durationSec : 0;
  const duration = clipTimeline.length ? timelineDuration : (playback.duration || fallbackDuration || 0);
  const hasPreviewSource =
    Boolean(resolvedPreviewUrl) || clipTimeline.length > 0 || Boolean(activeMedia?.isResolvingStream);
  const previewDisabled = !hasPreviewSource;
  const activeMediaEl = getActiveMediaEl();
  const isMediaPlaying = activeMediaEl ? !activeMediaEl.paused : playback.isPlaying;
  const handleOpenSubtitleEditor = useCallback(() => {
    if (!currentSubtitleMatch || !currentSubtitleMatch.segment) return;
    const mediaEl = getActiveMediaEl();
    if (mediaEl && !mediaEl.paused) {
      try {
        mediaEl.pause();
      } catch {
        // Ignore.
      }
    }
    const baseText = currentSubtitleMatch.segment.originalText ?? currentSubtitleMatch.segment.text ?? "";
    const measureEl = subtitleMeasureRef.current;
    if (measureEl) {
      measureEl.textContent = baseText || " ";
      const rect = measureEl.getBoundingClientRect();
      const paddingX = 12;
      const paddingY = 4;
      const width = Math.min(subtitleMaxWidth, rect.width + paddingX * 2 + 5);
      const height = rect.height + paddingY * 2;
      const nextSize = { width, height };
      subtitleEditOpenSizeRef.current = nextSize;
      subtitleEditProgrammaticSizeRef.current = nextSize;
      setSubtitleEditSize(nextSize);
    } else {
      const boxRect = subtitleBoxRef.current?.getBoundingClientRect();
      if (boxRect) {
        const width = Math.min(subtitleMaxWidth, boxRect.width + 5);
        const height = boxRect.height;
        const nextSize = { width, height };
        subtitleEditOpenSizeRef.current = nextSize;
        subtitleEditProgrammaticSizeRef.current = nextSize;
        setSubtitleEditSize(nextSize);
      }
    }
    setSubtitleDraft(baseText);
    setSubtitleEditor({ segmentId: currentSubtitleMatch.segment.id, text: baseText });
  }, [currentSubtitleMatch, getActiveMediaEl, subtitleMaxWidth]);

  const handleSaveSubtitleEdit = useCallback(async () => {
    const jobId =
      selectedJobId ?? (activeMedia?.source === "job" && activeMedia.jobId ? activeMedia.jobId : null);
    if (!subtitleEditor || !jobId) {
      setSubtitleEditor(null);
      return;
    }
    const newText = subtitleDraft.trim();
    const lastSaved = subtitleEditLastSavedRef.current?.text ?? subtitleEditor.text;
    if (!newText || newText === lastSaved.trim()) {
      setSubtitleEditor(null);
      return;
    }
    try {
      await apiEditSegment({ jobId, segmentId: subtitleEditor.segmentId, newText });
      dispatch(updateSegmentText({ jobId, segmentId: subtitleEditor.segmentId, newText }));
      subtitleEditLastSavedRef.current = { segmentId: subtitleEditor.segmentId, text: newText };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(`Failed to save changes: ${message}`, "error");
    } finally {
      setSubtitleEditor(null);
    }
  }, [activeMedia?.jobId, activeMedia?.source, dispatch, notify, selectedJobId, subtitleDraft, subtitleEditor]);

  const applySubtitlePosition = useCallback((pos: { x: number; y: number }) => {
    const el = subtitleBoxRef.current;
    if (!el) return;
    el.style.left = `${pos.x * 100}%`;
    el.style.top = `${pos.y * 100}%`;
  }, []);

  const handleSubtitlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!currentSubtitle && !subtitleEditor) return;
      if (event.button !== 0) return;
      if (event.target !== event.currentTarget) return;
      const container = previewContainerRef.current?.getBoundingClientRect();
      const box = subtitleBoxRef.current?.getBoundingClientRect();
      if (!container || !box) return;
      if (subtitleEditor) {
        const nearResizeHandle = box.right - event.clientX < 14 && box.bottom - event.clientY < 14;
        if (nearResizeHandle) return;
      }
      subtitleDragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: subtitlePositionRef.current.x,
        originY: subtitlePositionRef.current.y,
        moved: false,
        container,
        box,
        allowEdit: !subtitleEditor
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [currentSubtitle, subtitleEditor]
  );

  const handleSubtitlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = subtitleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      drag.moved = true;
    }
    const nextX = drag.originX + dx / drag.container.width;
    const nextY = drag.originY + dy / drag.container.height;
    const halfW = drag.box.width / 2 / drag.container.width;
    const halfH = drag.box.height / 2 / drag.container.height;
    const clampedX = clamp(nextX, halfW, 1 - halfW);
    const clampedY = clamp(nextY, halfH, 1 - halfH);
    pendingSubtitlePosRef.current = { x: clampedX, y: clampedY };
    if (subtitleDragRafRef.current !== null) return;
    subtitleDragRafRef.current = window.requestAnimationFrame(() => {
      subtitleDragRafRef.current = null;
      const next = pendingSubtitlePosRef.current;
      if (!next) return;
      subtitlePositionRef.current = next;
      applySubtitlePosition(next);
      setSubtitlePosition((prev) => {
        if (Math.abs(prev.x - next.x) < 0.001 && Math.abs(prev.y - next.y) < 0.001) {
          return prev;
        }
        return next;
      });
    });
  }, [applySubtitlePosition]);

  const handleSubtitlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = subtitleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    subtitleDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore.
    }
    if (subtitleDragRafRef.current !== null) {
      window.cancelAnimationFrame(subtitleDragRafRef.current);
      subtitleDragRafRef.current = null;
    }
    const next = pendingSubtitlePosRef.current;
    pendingSubtitlePosRef.current = null;
    if (next) {
      subtitlePositionRef.current = next;
      applySubtitlePosition(next);
      setSubtitlePosition(next);
    }
    if (drag.moved) {
      scheduleSubtitleUiSave();
    }
    if (drag.allowEdit && !drag.moved) {
      handleOpenSubtitleEditor();
    }
  }, [applySubtitlePosition, handleOpenSubtitleEditor, scheduleSubtitleUiSave]);


  const togglePlayback = () => {
    if (!clipTimeline.length && !activeMedia) {
      return;
    }
    if (activeMedia?.externalSource?.type === "youtube" && (activeMedia.streamError || !resolvedPreviewUrl)) {
      pendingPlayRef.current = true;
      pendingPlayTargetRef.current = activeMedia?.id ?? null;
      setPlayback((prev) => ({ ...prev, isPlaying: true }));
      void resolveYoutubeStreamForMedia(activeMedia);
      return;
    }
    if (clipTimeline.length) {
      const range = timelineRanges.find(
        (r) => playback.currentTime >= r.startSec && playback.currentTime < r.startSec + r.durationSec
      );
      if (!range || range.type === "gap") {
        const mediaEl = getActiveMediaEl();
        if (mediaEl && !mediaEl.paused) {
          try {
            mediaEl.pause();
          } catch {
            // Ignore.
          }
        }
        isGapPlaybackRef.current = true;
        if (activeMedia || activeClipId) {
          setActiveClipId(null);
          setActiveMedia(null);
        }
        pendingSeekRef.current = null;
        setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
        return;
      }
      const target = clipById.get(range.clipId);
      if (target && activeClipId !== target.id) {
        isGapPlaybackRef.current = false;
        if (playback.isPlaying) {
          const mediaEl = getActiveMediaEl();
          if (mediaEl && !mediaEl.paused) {
            try {
              mediaEl.pause();
            } catch {
              // Ignore.
            }
          }
        }
        setActiveClipId(target.id);
        setActiveMedia(target.media);
        const offset = Math.max(0, playback.currentTime - target.startSec);
        pendingSeekRef.current = Math.min(target.trimEndSec, target.trimStartSec + offset);
        pendingPlayRef.current = !playback.isPlaying;
        setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
        return;
      }
    }
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) {
      pendingPlayRef.current = !playback.isPlaying;
      pendingPlayTargetRef.current = activeMedia?.id ?? null;
      setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      return;
    }
    const activeClip = activeClipId ? clipById.get(activeClipId) : null;
    if (activeClip) {
      const offset = Math.max(0, playback.currentTime - activeClip.startSec);
      const desiredTime = clamp(
        activeClip.trimStartSec + offset,
        activeClip.trimStartSec,
        activeClip.trimEndSec
      );
      if (!Number.isFinite(mediaEl.currentTime) || Math.abs(mediaEl.currentTime - desiredTime) > 0.05) {
        try {
          mediaEl.currentTime = desiredTime;
          pendingSeekRef.current = null;
        } catch {
          // Ignore.
        }
      }
    }
    if (mediaEl.paused) {
      pendingPlayRef.current = true;
      pendingPlayTargetRef.current = activeMedia?.id ?? null;
      setPlayback((prev) => ({ ...prev, isPlaying: true }));
      void safePlay(mediaEl)
        .then((ok) => {
          pendingPlayRef.current = !ok;
          if (!ok) {
            schedulePendingPlay(mediaEl);
          }
          setPlayback((prev) => ({ ...prev, isPlaying: ok }));
        })
        .catch(() => {
          pendingPlayRef.current = true;
          schedulePendingPlay(mediaEl);
          setPlayback((prev) => ({ ...prev, isPlaying: false }));
        });
    } else {
      mediaEl.pause();
      pendingPlayRef.current = false;
      setPlayback((prev) => ({ ...prev, isPlaying: false }));
    }
  };

  const handlePreviewClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea, select, [data-no-toggle]")) return;
    togglePlayback();
  };

  const applyScrub = useCallback((value: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const currentPlayback = playbackRef.current;
    const scrubState = playerScrubRef.current;
    const wasPlaying = scrubState?.wasPlaying ?? currentPlayback.isPlaying;
    const shouldResume = scrubState ? false : wasPlaying;
    if (clipTimeline.length) {
      const range = timelineRanges.find(
        (r) => value >= r.startSec && value < r.startSec + r.durationSec
      );
      if (!range || range.type === "gap") {
        const mediaEl = getActiveMediaEl();
        if (mediaEl && !mediaEl.paused) {
          try {
            mediaEl.pause();
          } catch {
            // Ignore.
          }
        }
        isGapPlaybackRef.current = true;
        if (activeClipId !== null) {
          setActiveClipId(null);
        }
        if (activeMedia !== null) {
          setActiveMedia(null);
        }
        pendingSeekRef.current = null;
        pendingPlayRef.current = shouldResume;
        setPlayback((prev) => {
          if (Math.abs(prev.currentTime - value) < 0.002 && prev.isPlaying === shouldResume) {
            return prev;
          }
          return { ...prev, currentTime: value, isPlaying: shouldResume };
        });
        return;
      }
      const target = clipById.get(range.clipId);
      if (!target) return;
      const offset = Math.max(0, value - target.startSec);
      const newTime = Math.min(target.trimEndSec, target.trimStartSec + offset);
      if (activeClipId !== target.id) {
        isGapPlaybackRef.current = false;
        pendingSeekRef.current = newTime;
        pendingPlayRef.current = shouldResume;
        setActiveClipId(target.id);
        setActiveMedia(target.media);
      } else {
        const mediaEl = getActiveMediaEl();
        if (mediaEl) {
          try {
            mediaEl.currentTime = newTime;
            pendingSeekRef.current = null;
            if (shouldResume && mediaEl.paused) {
              void safePlay(mediaEl);
            }
          } catch {
            // Ignore.
          }
          pendingPlayRef.current = shouldResume;
        } else {
          pendingSeekRef.current = newTime;
          pendingPlayRef.current = shouldResume;
        }
      }
      setPlayback((prev) => {
        if (Math.abs(prev.currentTime - value) < 0.002) {
          return prev;
        }
        return { ...prev, currentTime: value, isPlaying: prev.isPlaying };
      });
      return;
    }

    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    mediaEl.currentTime = value;
    setPlayback((prev) => {
      if (Math.abs(prev.currentTime - value) < 0.002) {
        return prev;
      }
      return { ...prev, currentTime: value, isPlaying: prev.isPlaying };
    });
  }, [
    activeMedia,
    activeClipId,
    clipTimeline.length,
    clipById,
    duration,
    getActiveMediaEl,
    safePlay,
    timelineRanges
  ]);

  const scheduleScrub = useCallback(
    (value: number) => {
      if (!Number.isFinite(value)) return;
      pendingScrubRef.current = value;
      if (scrubRafRef.current !== null) return;
      scrubRafRef.current = window.requestAnimationFrame(() => {
        scrubRafRef.current = null;
        const nextValue = pendingScrubRef.current;
        pendingScrubRef.current = null;
        if (nextValue === null) return;
        const lastValue = lastScrubValueRef.current;
        if (lastValue !== null && Math.abs(nextValue - lastValue) < 0.0025) {
          return;
        }
        lastScrubValueRef.current = nextValue;
        applyScrub(nextValue);
      });
    },
    [applyScrub]
  );

  useEffect(() => {
    return () => {
      if (scrubRafRef.current !== null) {
        window.cancelAnimationFrame(scrubRafRef.current);
      }
    };
  }, []);

  const startPlayerScrub = () => {
    const wasPlaying = playback.isPlaying;
    playerScrubRef.current = { wasPlaying };
    if (wasPlaying) {
      const mediaEl = getActiveMediaEl();
      if (mediaEl) {
        try {
          mediaEl.pause();
        } catch {
          // Ignore.
        }
      }
      setPlayback((prev) => ({ ...prev, isPlaying: false }));
    }
  };

  const endPlayerScrub = () => {
    const state = playerScrubRef.current;
    if (!state) return;
    playerScrubRef.current = null;
    if (state.wasPlaying) {
      const mediaEl = getActiveMediaEl();
      if (mediaEl && mediaEl.readyState >= 1) {
        try {
          void safePlay(mediaEl);
          pendingPlayRef.current = true;
        } catch {
          // Ignore.
        }
      } else {
        pendingPlayRef.current = false;
      }
      setPlayback((prev) => ({ ...prev, isPlaying: true }));
    }
  };

  const tickCount = 7;
  const minZoom = 0.5;
  const maxZoom = 3;
  const minCaptionDuration = 0.05;
  const minVisibleDurationSec = 10;
  const maxVisibleDurationSec = 600;
  const midVisibleDurationSec = 60;
  const zoomT = clamp((timelineZoom - minZoom) / Math.max(0.001, maxZoom - minZoom), 0, 1);
  const visibleDuration =
    zoomT <= 0.5
      ? maxVisibleDurationSec *
        Math.pow(midVisibleDurationSec / maxVisibleDurationSec, zoomT / 0.5)
      : midVisibleDurationSec *
        Math.pow(minVisibleDurationSec / midVisibleDurationSec, (zoomT - 0.5) / 0.5);
  const segmentSec = visibleDuration / (tickCount - 1);
  const pxPerSec = timelineViewportWidth > 0
    ? timelineViewportWidth / Math.max(visibleDuration, MIN_CLIP_DURATION_SEC)
    : BASE_PX_PER_SEC * timelineZoom;
  const timelineWidth = Math.max(timelineViewportWidth, duration * pxPerSec);
  const timelineScrollWidth = timelineWidth;
  const playheadLeftPx = duration > 0 ? Math.min(timelineWidth, playback.currentTime * pxPerSec) : 0;
  const playheadPct = duration > 0 ? Math.min(100, (playback.currentTime / duration) * 100) : 0;
  const rulerDuration = duration > 0 ? duration : visibleDuration;
  const ticks = useMemo(() => {
    const baseTickCount =
      rulerDuration > 0 && segmentSec > 0 ? Math.floor(rulerDuration / segmentSec) + 1 : 0;
    const nextTicks = baseTickCount
      ? Array.from({ length: baseTickCount }, (_, idx) => idx * segmentSec)
      : [];
    if (rulerDuration > 0 && nextTicks.length && nextTicks[nextTicks.length - 1] < rulerDuration) {
      nextTicks.push(rulerDuration);
    }
    return nextTicks;
  }, [rulerDuration, segmentSec]);
  const captionMenuGapAfter = useMemo(() => {
    if (!captionMenu) return null;
    const segId = Number(captionMenu.segment.id);
    const idx = sortedDisplaySegments.findIndex((seg) => Number(seg.id) === segId);
    if (idx < 0) return null;
    const current = sortedDisplaySegments[idx];
    const next = sortedDisplaySegments[idx + 1] ?? null;
    if (!next) {
      return { hasNext: false, hasGap: false };
    }
    const gapStart = Number(current.end) || 0;
    const gapEnd = Number(next.start) || 0;
    const gap = gapEnd - gapStart;
    return { hasNext: true, hasGap: gap > minCaptionDuration, gapStart, gapEnd };
  }, [captionMenu, minCaptionDuration, sortedDisplaySegments]);
  const segmentPx = segmentSec * pxPerSec;
  const faintGridStyle = useMemo(() => ({
    backgroundImage: "linear-gradient(to right, rgba(15,23,42,0.3) 1px, transparent 1px)",
    backgroundSize: `${segmentPx}px 100%`
  }), [segmentPx]);

  const seekFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, rectOverride?: DOMRect) => {
      if (duration <= 0) return;
      const rect = rectOverride ?? event.currentTarget.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const time = clamp(x / Math.max(pxPerSec, 0.001), 0, duration);
      scheduleScrub(time);
    },
    [duration, pxPerSec, scheduleScrub]
  );

  useEffect(() => {
    const scroller = timelineScrollRef.current;
    if (!scroller) return;
    if (timelineUserScrollingRef.current) return;
    if (scrubStateRef.current || playerScrubRef.current) return;
    if (!Number.isFinite(playback.currentTime)) return;
    const viewport = scroller.clientWidth || 0;
    if (!viewport) return;
    const margin = Math.max(24, viewport * 0.2);
    const leftBound = scroller.scrollLeft + margin;
    const rightBound = scroller.scrollLeft + viewport - margin;
    if (playheadLeftPx < leftBound || playheadLeftPx > rightBound) {
      const nextLeft = clamp(playheadLeftPx - viewport * 0.4, 0, Math.max(0, timelineWidth - viewport));
      scroller.scrollLeft = nextLeft;
      setTimelineScrollLeft(nextLeft);
    }
  }, [playback.currentTime, playheadLeftPx, timelineWidth]);

  const computeCaptionTiming = useCallback(
    (drag: NonNullable<typeof captionDragRef.current>, deltaSec: number) => {
      let start = drag.start;
      let end = drag.end;
      const currentIndex = sortedDisplaySegments.findIndex((seg) => seg.id === drag.segmentId);
      const prevSeg = currentIndex > 0 ? sortedDisplaySegments[currentIndex - 1] : null;
      const nextSeg =
        currentIndex >= 0 && currentIndex < sortedDisplaySegments.length - 1
          ? sortedDisplaySegments[currentIndex + 1]
          : null;
      const prevEnd = prevSeg ? prevSeg.end : 0;
      const nextStart = nextSeg ? nextSeg.start : (duration > 0 ? duration : Number.POSITIVE_INFINITY);
      const span = Math.max(minCaptionDuration, drag.end - drag.start);
      if (drag.mode === "move") {
        start = drag.start + deltaSec;
        end = start + span;
        if (duration > 0) {
          if (start < 0) {
            start = 0;
            end = start + span;
          }
          if (end > duration) {
            end = duration;
            start = end - span;
          }
        }
        if (Number.isFinite(prevEnd)) {
          start = Math.max(start, prevEnd);
          end = start + span;
        }
        if (Number.isFinite(nextStart)) {
          if (end > nextStart) {
            end = nextStart;
            start = end - span;
          }
        }
      } else if (drag.mode === "start") {
        start = drag.start + deltaSec;
        start = Math.min(start, drag.end - minCaptionDuration);
        start = Math.max(start, prevEnd);
        start = Math.max(0, start);
      } else {
        end = drag.end + deltaSec;
        end = Math.max(end, drag.start + minCaptionDuration);
        end = Math.min(end, nextStart);
        if (duration > 0) {
          end = Math.min(end, duration);
        }
      }
      return { start, end };
    },
    [duration, minCaptionDuration, sortedDisplaySegments]
  );

  const handleCaptionPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, segment: TranscriptSegment) => {
      if (event.button !== 0) return;
      if (!activeJob?.id && !activeMedia) return;
      event.stopPropagation();
      const target = event.target as HTMLElement;
      const handle = target.closest("[data-handle]") as HTMLElement | null;
      const handleType = handle?.dataset.handle;
      const mode: "move" | "start" | "end" =
        handleType === "start" ? "start" : handleType === "end" ? "end" : "move";
      captionDragRef.current = {
        pointerId: event.pointerId,
        jobId: activeJob.id,
        segmentId: segment.id,
        start: Number(segment.start) || 0,
        end: Number(segment.end) || 0,
        startX: event.clientX,
        mode
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      const startSec = Number(segment.start) || 0;
      const endSec = Number(segment.end) || 0;
      const span = Math.max(0, endSec - startSec);
      let focusTime = startSec;
      if (span > 0) {
        const pad = Math.min(0.02, span * 0.1);
        const candidate = startSec + Math.max(0.001, pad);
        focusTime = candidate < endSec ? candidate : startSec + span * 0.5;
      }
      scheduleScrub(focusTime);
      setPlayback((prev) => ({ ...prev, currentTime: focusTime }));
      setForcedCaptionId(Number(segment.id));
      if (playback.isPlaying) {
        const mediaEl = getActiveMediaEl();
        if (mediaEl && mediaEl.paused) {
          void safePlay(mediaEl);
        }
      }
    },
    [activeJob?.id, getActiveMediaEl, playback.isPlaying, safePlay, scheduleScrub]
  );

  const handleCaptionPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = captionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.stopPropagation();
      const dx = event.clientX - drag.startX;
      const deltaSec = dx / Math.max(pxPerSec, 0.001);
      const next = computeCaptionTiming(drag, deltaSec);
      dispatch(updateSegmentTiming({ jobId: drag.jobId, segmentId: drag.segmentId, start: next.start, end: next.end }));
      captionTimingAutosavePayloadRef.current = {
        jobId: drag.jobId,
        segmentId: drag.segmentId,
        start: next.start,
        end: next.end
      };
      if (!captionTimingAutosaveRef.current) {
        captionTimingAutosaveRef.current = window.setTimeout(() => {
          const payload = captionTimingAutosavePayloadRef.current;
          captionTimingAutosaveRef.current = null;
          if (!payload) return;
          void apiUpdateSegmentTiming(payload).catch(() => undefined);
        }, 500);
      }
    },
    [computeCaptionTiming, dispatch, pxPerSec]
  );

  const handleCaptionPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = captionDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      captionDragRef.current = null;
      event.stopPropagation();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore.
      }
      if (captionTimingAutosaveRef.current) {
        window.clearTimeout(captionTimingAutosaveRef.current);
        captionTimingAutosaveRef.current = null;
      }
      const dx = event.clientX - drag.startX;
      const deltaSec = dx / Math.max(pxPerSec, 0.001);
      const next = computeCaptionTiming(drag, deltaSec);
      dispatch(updateSegmentTiming({ jobId: drag.jobId, segmentId: drag.segmentId, start: next.start, end: next.end }));
      void apiUpdateSegmentTiming({
        jobId: drag.jobId,
        segmentId: drag.segmentId,
        start: next.start,
        end: next.end
      }).catch(() => undefined);
    },
    [computeCaptionTiming, dispatch, pxPerSec]
  );

  const ensureCaptionJobId = useCallback(() => {
    if (activeJob?.id) return activeJob.id;
    if (!activeMedia) {
      notify("Please select a media file to add captions.", "info");
      return null;
    }
    const jobId = `manual-${activeMedia.id}`;
    const existing = jobsById[jobId];
    if (existing) {
      dispatch(selectJob(jobId));
      return jobId;
    }
    const filename = activeMedia.name || "media";
    const displayName = stripFileExtension(filename) || filename;
    const audioFile = activeMedia.file
      ? {
          name: activeMedia.file.name,
          size: activeMedia.file.size,
          path: null
        }
      : { name: filename, size: null, path: activeMedia.localPath ?? null };
    const newJob: Job = {
      id: jobId,
      filename,
      displayName,
      status: "imported",
      message: "",
      progress: 0,
      startTime: Date.now(),
      audioFile,
      result: null,
      partialResult: null,
      error: null,
      currentStage: null
    };
    dispatch(addJob(newJob));
    void apiUpsertJobRecord({
      job_id: jobId,
      filename,
      display_name: displayName,
      media_path: (activeMedia as any)?.localPath ?? null,
      media_kind: activeMedia?.kind ?? null,
      status: "imported",
      transcript_json: { job_id: jobId, segments: [], text: "" },
      transcript_text: "",
      segment_count: 0
    }).catch(() => undefined);
    return jobId;
  }, [activeJob?.id, activeMedia, dispatch, jobsById, notify]);

  const handleAddCaption = useCallback(
    (start: number, end: number) => {
      const jobId = ensureCaptionJobId();
      if (!jobId) return;
      const maxId = sortedSegments.reduce((max, seg) => Math.max(max, Number(seg.id) || 0), 0);
      const nextId = maxId + 1;
      const text = "New Caption";
      const segment: TranscriptSegment = {
        id: nextId,
        start,
        end,
        text,
        originalText: text
      };
      dispatch(addSegment({ jobId, segment }));
      void apiAddSegment({ jobId, segmentId: nextId, start, end, text }).catch(() => undefined);
    },
    [dispatch, ensureCaptionJobId, sortedSegments]
  );

  const applyTimelineShift = useCallback(
    (thresholdSec: number, deltaSec: number) => {
      if (!activeJob?.id) return;
      if (!Number.isFinite(deltaSec) || Math.abs(deltaSec) < 0.0001) return;
      const jobId = activeJob.id;
      const updates: Array<{ segmentId: number; start: number; end: number }> = [];
      const nextSegments = sortedSegments.map((seg) => {
        const start = Number(seg.start) || 0;
        const end = Number(seg.end) || 0;
        if (start < thresholdSec - 0.0001) return seg;
        const nextStart = start + deltaSec;
        const nextEnd = end + deltaSec;
        updates.push({ segmentId: Number(seg.id), start: nextStart, end: nextEnd });
        return { ...seg, start: nextStart, end: nextEnd };
      });
      if (!updates.length) return;
      dispatch(setJobSegments({ jobId, segments: nextSegments }));
      updates.forEach((payload) => {
        void apiUpdateSegmentTiming({ jobId, ...payload }).catch(() => undefined);
      });
      const mergedText = nextSegments
        .map((seg) => String(seg.originalText ?? seg.text ?? "").trim())
        .filter((text) => !isBlankAudioText(text))
        .join(" ")
        .trim();
      void apiUpsertJobRecord({
        job_id: jobId,
        transcript_json: { job_id: jobId, segments: nextSegments, text: mergedText },
        transcript_text: mergedText,
        segment_count: nextSegments.length
      }).catch(() => undefined);
    },
    [activeJob?.id, dispatch, sortedSegments]
  );

  const handleRemoveGap = useCallback(
    (gapStart: number, gapEnd: number) => {
      const delta = gapEnd - gapStart;
      if (!Number.isFinite(delta) || delta <= minCaptionDuration) return;
      applyTimelineShift(gapEnd, -delta);
    },
    [applyTimelineShift, minCaptionDuration]
  );

  const handleAdjustGapAfter = useCallback(
    (segment: TranscriptSegment, mode: "insert" | "remove", msValue: number, maxRemoveMs: number) => {
      const segId = Number(segment.id);
      const idx = sortedDisplaySegments.findIndex((seg) => Number(seg.id) === segId);
      if (idx < 0) return;
      const current = sortedDisplaySegments[idx];
      const next = sortedDisplaySegments[idx + 1];
      if (!next) return;
      const gapStart = Number(current.end) || 0;
      const gapEnd = Number(next.start) || 0;
      if (mode === "remove") {
        const maxMs = Math.max(0, maxRemoveMs);
        const ms = Math.min(Math.max(0, msValue), maxMs);
        if (ms <= 0) return;
        applyTimelineShift(gapEnd, -(ms / 1000));
        return;
      }
      const ms = Math.max(0, msValue);
      if (ms <= 0) return;
      applyTimelineShift(gapStart, ms / 1000);
    },
    [applyTimelineShift, sortedDisplaySegments]
  );

  const handleDeleteCaption = useCallback(
    (segment: TranscriptSegment) => {
      if (!activeJob?.id) return;
      const jobId = activeJob.id;
      dispatch(removeSegment({ jobId, segmentId: Number(segment.id) }));
      void apiDeleteSegment({ jobId, segmentId: Number(segment.id) }).catch(() => undefined);
    },
    [activeJob?.id, dispatch]
  );

  const handleSplitCaption = useCallback(
    (segment: TranscriptSegment | null) => {
      if (!segment || !activeJob?.id) return;
      const jobId = activeJob.id;
      const start = Number(segment.start) || 0;
      const end = Number(segment.end) || 0;
      if (end - start <= minCaptionDuration * 2) {
        notify("Caption is too short to split.", "info");
        return;
      }
      let cutAt = playback.currentTime;
      if (cutAt <= start + minCaptionDuration || cutAt >= end - minCaptionDuration) {
        cutAt = (start + end) / 2;
      }
      cutAt = clamp(cutAt, start + minCaptionDuration, end - minCaptionDuration);
      const maxId = sortedSegments.reduce((max, seg) => Math.max(max, Number(seg.id) || 0), 0);
      const nextId = maxId + 1;
      const rawText = String(segment.originalText ?? segment.text ?? "");
      const nextSegment: TranscriptSegment = {
        id: nextId,
        start: cutAt,
        end,
        text: rawText,
        originalText: rawText
      };
      dispatch(updateSegmentTiming({ jobId, segmentId: Number(segment.id), start, end: cutAt }));
      dispatch(addSegment({ jobId, segment: nextSegment }));
      void apiUpdateSegmentTiming({
        jobId,
        segmentId: Number(segment.id),
        start,
        end: cutAt
      }).catch(() => undefined);
      void apiAddSegment({ jobId, segmentId: nextId, start: cutAt, end, text: rawText }).catch(() => undefined);
    },
    [activeJob?.id, dispatch, minCaptionDuration, notify, playback.currentTime, sortedSegments]
  );

  const handleCaptionHoverMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (captionDragRef.current) return;
      if (scrubStateRef.current || playerScrubRef.current) return;
      if (duration <= 0) return;
      if (!activeJob?.id) return;
      const track = timelineTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const time = clamp(x / Math.max(pxPerSec, 0.001), 0, duration);
      for (const seg of sortedDisplaySegments) {
        if (time >= seg.start && time <= seg.end) {
          setCaptionHover(null);
          return;
        }
      }
      if (captionHover) {
        const hoverLeft = Math.max(0, captionHover.start * pxPerSec);
        const hoverWidth = Math.max(2, (captionHover.end - captionHover.start) * pxPerSec);
        const inset = 3;
        if (x < hoverLeft + inset || x > hoverLeft + hoverWidth - inset) {
          return;
        }
      }
      let gapStart = 0;
      let gapEnd = duration;
      for (const seg of sortedDisplaySegments) {
        if (time < seg.start) {
          gapEnd = seg.start;
          break;
        }
        gapStart = Math.max(gapStart, seg.end);
      }
      if (gapEnd - gapStart <= minCaptionDuration) {
        setCaptionHover(null);
        return;
      }
      const desired = Math.min(5, gapEnd - gapStart);
      const start = clamp(time - desired * 0.5, gapStart, gapEnd - desired);
      const end = start + desired;
      setCaptionHover({ start, end, gapStart, gapEnd });
    },
    [activeJob?.id, activeMedia, captionHover, duration, minCaptionDuration, pxPerSec, sortedDisplaySegments]
  );

  const handleGapContextMenu = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!captionHover) return;
      const track = timelineTrackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const left = Math.max(0, captionHover.start * pxPerSec);
      const width = Math.max(2, (captionHover.end - captionHover.start) * pxPerSec);
      if (x < left || x > left + width) return;
      event.preventDefault();
      event.stopPropagation();
      setCaptionMenu(null);
      gapMenuOpenRef.current = true;
      setGapMenu({
        x: event.clientX,
        y: event.clientY,
        gapStart: captionHover.gapStart,
        gapEnd: captionHover.gapEnd
      });
      setCaptionHover(captionHover);
    },
    [captionHover, pxPerSec]
  );

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-clip-id]")) return;
    scrubStateRef.current = {
      pointerId: event.pointerId,
      rect: event.currentTarget.getBoundingClientRect()
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    startPlayerScrub();
    seekFromPointer(event, scrubStateRef.current.rect);
  };

  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const scrub = scrubStateRef.current;
    if (!scrub) return;
    seekFromPointer(event, scrub.rect);
  };

  const onTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubStateRef.current) return;
    scrubStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    endPlayerScrub();
  };

  const toggleFullscreen = () => {
    if (isPlayerModalOpen) {
      setIsPlayerModalOpen(false);
      return;
    }
    setIsPlayerModalVisible(true);
    window.requestAnimationFrame(() => setIsPlayerModalOpen(true));
  };

  const handleClearSelection = useCallback(() => {
    dispatch(selectJob(null));
    setActiveMedia(null);
    setActiveClipId(null);
    setTimelineClips([]);
    setActivePreviewUrl(null);
    setPreviewPoster(null);
    setForcedCaptionId(null);
    pendingSeekRef.current = null;
    pendingPlayRef.current = false;
    setPlayback({ currentTime: 0, duration: 0, isPlaying: false });
  }, [dispatch]);

  const commitDisplayName = useCallback(async () => {
    if (!activeMedia) return;
    const trimmed = displayNameDraft.trim();
    const nextName = trimmed || activeMediaDisplayName || activeMedia.name || "";
    setIsDisplayNameEditing(false);
    setDisplayNameDraft(nextName);

    if (!nextName || nextName === activeMediaDisplayName) {
      return;
    }

    setActiveMedia((prev) =>
      prev && prev.id === activeMedia.id ? { ...prev, displayName: nextName } : prev
    );
    setTimelineClips((prev) =>
      prev.map((clip) =>
        clip.media.id === activeMedia.id ? { ...clip, media: { ...clip.media, displayName: nextName } } : clip
      )
    );

    if (activeMedia.source === "local") {
      setLocalMedia((prev) =>
        prev.map((item) => (item.id === activeMedia.id ? { ...item, displayName: nextName } : item))
      );
      if (activeMedia.jobId && activeMedia.localPath) {
        try {
          await apiUpsertJobRecord({
            job_id: activeMedia.jobId,
            filename: activeMedia.name,
            display_name: nextName,
            media_path: activeMedia.localPath,
            media_kind: activeMedia.kind,
            status: "imported"
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          notify(`Failed to save display name: ${message}`, "error");
        }
      }
      return;
    }

    if (activeMedia.source === "job" && activeMedia.jobId) {
      dispatch(updateJobDisplayName({ jobId: activeMedia.jobId, displayName: nextName }));
      try {
        const filename = jobsById[activeMedia.jobId]?.filename ?? activeMedia.name ?? null;
        await apiUpsertJobRecord({ job_id: activeMedia.jobId, filename, display_name: nextName });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(`Failed to save display name: ${message}`, "error");
      }
    }
  }, [
    activeMedia,
    activeMediaDisplayName,
    displayNameDraft,
    dispatch,
    jobsById,
    notify,
    setLocalMedia,
    setTimelineClips
  ]);

  const cancelDisplayNameEdit = useCallback(() => {
    setIsDisplayNameEditing(false);
    setDisplayNameDraft(activeMediaDisplayName || activeMedia?.displayName || activeMedia?.name || "");
  }, [activeMedia?.displayName, activeMedia?.name, activeMediaDisplayName]);

  const handleAddToTimeline = useCallback(
    (items: MediaItem[]) => {
      if (!items.length) return;
      const supportedItems = items.filter((item) => item.kind !== "caption");
      if (!supportedItems.length) {
        notify("Caption files cannot be added to the timeline yet.", "info");
        return;
      }
      if (supportedItems.length !== items.length) {
        notify("Skipped caption files. Only audio/video clips can be added to the timeline.", "info");
      }
      const item = supportedItems[0];

      if (activeMedia && activeMedia.id === item.id && activeMedia.isResolvingStream && !item.isResolvingStream) {
        if (pendingPlayRef.current || playbackRef.current.isPlaying) {
          pendingPlayRef.current = true;
          pendingPlayTargetRef.current = item.id;
        }
        setActiveMedia(item);
        setTimelineClips((prev) =>
          prev.map((clip) => (clip.media.id === item.id ? { ...clip, media: item } : clip))
        );
        return;
      }

      const base = Number.isFinite(item.durationSec) && item.durationSec ? item.durationSec : 60;
      const clipId = `${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setTimelineClips(
        normalizeClips([
          {
            id: clipId,
            media: item,
            startSec: 0,
            baseDurationSec: base,
            durationSec: base,
            trimStartSec: 0,
            trimEndSec: base
          }
        ])
      );
      setActiveMedia(item);
      setActiveClipId(clipId);
      pendingSeekRef.current = 0;
      pendingPlayRef.current = false;
      setPlayback((prev) => ({ ...prev, currentTime: 0, isPlaying: false }));
      if (item.source === "job" && item.jobId) {
        dispatch(selectJob(item.jobId));
      } else {
        dispatch(selectJob(null));
      }
    },
    [activeMedia, dispatch, notify]
  );

  const handleTimelineScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    setTimelineScrollLeft(event.currentTarget.scrollLeft);
    timelineUserScrollingRef.current = true;
    if (timelineScrollIdleRef.current) {
      window.clearTimeout(timelineScrollIdleRef.current);
    }
    timelineScrollIdleRef.current = window.setTimeout(() => {
      timelineUserScrollingRef.current = false;
    }, 1200);
  }, []);

  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, timelineWidth - el.clientWidth);
    if (el.scrollLeft > maxScroll) {
      el.scrollLeft = maxScroll;
      setTimelineScrollLeft(maxScroll);
    }
  }, [timelineWidth, timelineViewportWidth]);

  const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll <= 0) return;
      const next = clamp(el.scrollLeft + event.deltaY, 0, maxScroll);
      el.scrollLeft = next;
      setTimelineScrollLeft(next);
    }
  }, []);

  const timelineSegments = useMemo(
    () =>
      sortedDisplaySegments.map((segment) => {
        const start = Number.isFinite(Number(segment.start)) ? Number(segment.start) : 0;
        const end = Number.isFinite(Number(segment.end)) ? Number(segment.end) : 0;
        const rawText = segment.originalText ?? segment.text ?? "";
        let text = rawText;
        if (openCcConverter) {
          try {
            text = openCcConverter(rawText);
          } catch {
            text = rawText;
          }
        }
        return {
          segment,
          start,
          end,
          left: Math.max(0, start * pxPerSec),
          width: Math.max(2, (end - start) * pxPerSec),
          text
        };
      }),
    [openCcConverter, pxPerSec, sortedDisplaySegments]
  );

  const timelineSegmentEls = useMemo(
    () =>
      timelineSegments.map((item) => {
        const isActive = activeTimelineSegmentId !== null && Number(item.segment.id) === activeTimelineSegmentId;
        return (
          <div
            key={`timeline-${item.segment.id}`}
            className={cn(
              "absolute top-0 flex h-full cursor-grab items-center rounded-lg px-2 text-[10px] transition active:cursor-grabbing",
              isActive ? "bg-[#dbeafe] text-[#0b0b0b]" : "bg-[#151515] text-slate-200"
            )}
            style={{ left: `${item.left}px`, width: `${item.width}px` }}
            onPointerDown={(event) => handleCaptionPointerDown(event, item.segment)}
            onPointerMove={handleCaptionPointerMove}
            onPointerUp={handleCaptionPointerUp}
            onPointerCancel={handleCaptionPointerUp}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              closeGapMenu();
              setCaptionMenuGapHighlight(false);
              setCaptionMenu({
                x: event.clientX,
                y: event.clientY,
                segment: item.segment
              });
            }}
          >
            <span className="block truncate leading-6">{item.text}</span>
            <span
              data-handle="start"
              className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize"
            />
            <span
              data-handle="end"
              className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize"
            />
          </div>
        );
      }),
    [
      activeTimelineSegmentId,
      handleCaptionPointerDown,
      handleCaptionPointerMove,
      handleCaptionPointerUp,
      setCaptionMenu,
      closeGapMenu,
      setCaptionMenuGapHighlight,
      timelineSegments
    ]
  );

  const layoutClass = isCompact
    ? "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]"
    : "grid min-h-0 overflow-hidden grid-cols-[minmax(160px,240px)_minmax(0,1fr)_minmax(240px,340px)] 2xl:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(280px,380px)] grid-rows-[minmax(0,1fr)_auto]";

  const captionControlsDisabled = isTranscribing;
  const isCantoneseLanguage = settings.language === "yue" || settings.language === "auto";
  const isSecondCaptionActive = secondCaptionEnabled;
  const generateCaptionLabel = isActiveJobProcessing
    ? "Processing..."
    : isAnotherJobProcessing
      ? "Another job processing..."
      : modelDownload.status === "downloading"
        ? "Downloading model..."
        : "AI Generate Caption";
  const isGenerateDisabled =
    modelDownload.status === "checking" || modelDownload.status === "downloading" || isTranscribing;
  const handleToggleSecondCaption = useCallback(() => {
    if (captionControlsDisabled) return;
    setSecondCaptionEnabled((prev) => {
      const next = !prev;
      if (next) {
        setSecondCaptionLanguage("yue");
      }
      return next;
    });
  }, [captionControlsDisabled]);
  const captionSetupPanel = (
    <CaptionSetupPanel
      settings={settings}
      captionControlsDisabled={captionControlsDisabled}
      isCantoneseLanguage={isCantoneseLanguage}
      isSecondCaptionActive={isSecondCaptionActive}
      secondCaptionLanguage={secondCaptionLanguage}
      onLanguageChange={(value) => dispatch(setLanguage(value))}
      onChineseStyleChange={(value) => dispatch(setChineseStyle(value))}
      onToggleSecondCaption={handleToggleSecondCaption}
      onSecondCaptionLanguageChange={setSecondCaptionLanguage}
      generateCaptionLabel={generateCaptionLabel}
      onGenerateCaptions={handleGenerateCaptions}
      isGenerateDisabled={isGenerateDisabled}
    />
  );

  const compactCaptionsPanel = (
    <CaptionPanelBody
      captionSetupPanel={captionSetupPanel}
      showCaptionSetup={showCaptionSetup}
      transcriptMediaRef={transcriptMediaRef}
      notify={notify}
      editEnabled={isTranscriptEdit}
      suppressEmptyState={showCaptionSetup}
      containerClassName="min-h-0 h-[calc(100vh-320px)] max-h-[calc(100vh-320px)] w-full overflow-hidden"
    />
  );

  const captionSidebarContent = (
    <CaptionPanelBody
      captionSetupPanel={captionSetupPanel}
      showCaptionSetup={showCaptionSetup}
      transcriptMediaRef={transcriptMediaRef}
      notify={notify}
      editEnabled={isTranscriptEdit}
      suppressEmptyState={showCaptionSetup}
      containerClassName="min-h-0 h-[calc(100vh-340px)] max-h-[calc(100vh-340px)] overflow-hidden"
    />
  );

  const captionSidebarModalContent = (
    <CaptionPanelBody
      captionSetupPanel={captionSetupPanel}
      showCaptionSetup={showCaptionSetup}
      transcriptMediaRef={transcriptMediaRef}
      notify={notify}
      editEnabled={isTranscriptEdit}
      suppressEmptyState={showCaptionSetup}
      containerClassName="flex h-full min-h-0 flex-col"
    />
  );

  const playerPanelProps = {
    isCompact,
    compactTab,
    compactCaptionsPanel,
    previewContainerRef,
    handlePreviewClick,
    activeMedia,
    isDisplayNameEditing,
    displayNameDraft,
    setDisplayNameDraft,
    setIsDisplayNameEditing,
    activeMediaDisplayName,
    commitDisplayName,
    cancelDisplayNameEdit,
    showYoutubeUnavailable,
    youtubeUnavailableReason,
    activeVideoSrc,
    activeVideoSlot,
    nextVideoTarget,
    videoRefA,
    videoRefB,
    previewPoster,
    previewPosterModeRef,
    setPreviewPoster,
    shouldShowPreviewPoster,
    activePreviewKind,
    resolvedPreviewUrl,
    showActiveJobOverlay,
    activeJobLabel,
    activeJobProgress,
    showPreviewSpinner,
    subtitleEditor,
    currentSubtitle,
    subtitleBoxRef,
    subtitlePosition,
    subtitleDisplaySize,
    subtitleMaxWidth,
    handleSubtitlePointerDown,
    handleSubtitlePointerMove,
    handleSubtitlePointerUp,
    subtitleTextStyle,
    subtitleDraft,
    setSubtitleDraft,
    handleSaveSubtitleEdit,
    setSubtitleEditor,
    subtitleMeasureRef,
    subtitleFontSize,
    togglePlayback,
    previewDisabled,
    isMediaPlaying,
    cyclePlaybackRate,
    playbackRate,
    playback,
    playheadPct,
    duration,
    scheduleScrub,
    startPlayerScrub,
    endPlayerScrub,
    toggleFullscreen
  };

  const playerPanel = <PlayerPanel isModal={false} {...playerPanelProps} />;
  const playerModalPanel = <PlayerPanel isModal {...playerPanelProps} />;

  const leftPanelContent = (
    <MediaSidebar
      isCompact={isCompact}
      dragRegionClass={dragRegionClass}
      onClose={() => setIsLeftDrawerOpen(false)}
      uploadRef={uploadRef}
      notify={notify}
      localMedia={localMedia}
      onLocalMediaChange={setLocalMedia}
      onAddToTimeline={handleAddToTimeline}
      onClearSelection={handleClearSelection}
      onRequestFilePicker={handleRequestFilePicker}
      secondCaptionEnabled={secondCaptionEnabled}
      secondCaptionLanguage={secondCaptionLanguage}
    />
  );

  // youtube progress flags provided by hook.
  // update state provided by hook.

  return {
    settings,
    exportLanguage,
    appVersion,
    audioRef,
    videoRefA,
    videoRefB,
    previewContainerRef,
    uploadRef,
    srtInputRef,
    jobsById,
    jobOrder,
    isTranscribing,
    selectedJobId,
    selectedJob,
    isWindows,
    isMac,
    showCustomWindowControls,
    useCustomDrag,
    dragRegionClass,
    isAltPressed,
    isWindowFocused,
    alertModal,
    setAlertModal,
    notify,
    showExportModal,
    setShowExportModal,
    isExporting,
    showPremiumModal,
    setShowPremiumModal,
    showPremiumStatusModal,
    setShowPremiumStatusModal,
    isPremium,
    premiumStatusLoading,
    premiumDetails,
    premiumWebviewStatus,
    premiumWebviewError,
    machineId,
    machineIdLoading,
    machineIdCopied,
    premiumKey,
    setPremiumKey,
    premiumKeySubmitting,
    premiumIframeKey,
    isOnline,
    updateModal,
    setUpdateModal,
    updateAvailable,
    updateForceRequired,
    updateLatestVersion,
    updateCurrentVersion,
    mediaImport,
    isPinned,
    isHeaderMenuOpen,
    setIsHeaderMenuOpen,
    isPlayerModalOpen,
    setIsPlayerModalOpen,
    isPlayerModalVisible,
    setIsPlayerModalVisible,
    headerMenuRef,
    headerMenuButtonRef,
    premiumWebviewRef,
    playback,
    playbackRate,
    playbackRef,
    previewPoster,
    setPreviewPoster,
    activeVideoSlot,
    previewPosterRef,
    previewPosterModeRef,
    subtitleScale,
    subtitleBaseFontSize,
    subtitleEditor,
    setSubtitleEditor,
    subtitleDraft,
    setSubtitleDraft,
    subtitlePosition,
    setSubtitlePosition,
    subtitleMaxWidth,
    subtitleBoxSize,
    subtitleEditSize,
    subtitleUserSized,
    subtitleUserSizedRef,
    subtitleEditProgrammaticSizeRef,
    subtitlePositionRef,
    subtitleDragRafRef,
    pendingSubtitlePosRef,
    subtitleBoxRef,
    subtitleMeasureRef,
    subtitleUiSaveRef,
    subtitleUiLoadRef,
    subtitleEditOpenSizeRef,
    subtitleEditAutosaveRef,
    subtitleEditLastSavedRef,
    captionTimingAutosaveRef,
    captionTimingAutosavePayloadRef,
    subtitleDragRef,
    isTranscriptEdit,
    setIsTranscriptEdit,
    modelDownload,
    secondCaptionEnabled,
    setSecondCaptionEnabled,
    secondCaptionLanguage,
    setSecondCaptionLanguage,
    localMedia,
    setLocalMedia,
    timelineZoom,
    setTimelineZoom,
    isCompact,
    setIsCompact,
    isHeaderCompact,
    setIsHeaderCompact,
    isLeftDrawerOpen,
    setIsLeftDrawerOpen,
    compactTab,
    setCompactTab,
    timelineClips,
    setTimelineClips,
    activeMedia,
    setActiveMedia,
    previewLoading,
    setPreviewLoading,
    previewError,
    setPreviewError,
    isDisplayNameEditing,
    setIsDisplayNameEditing,
    displayNameDraft,
    setDisplayNameDraft,
    activePreviewUrl,
    setActivePreviewUrl,
    activeClipId,
    setActiveClipId,
    pendingPlayRef,
    pendingPlayTargetRef,
    pendingSeekRef,
    scrubStateRef,
    playerScrubRef,
    scrubRafRef,
    pendingScrubRef,
    lastScrubValueRef,
    mediaRafActiveRef,
    pendingPlayRafRef,
    pendingSwapRef,
    timelineScrollRef,
    timelineTrackRef,
    isGapPlaybackRef,
    youtubeResolveAttemptRef,
    timelineScrollLeft,
    setTimelineScrollLeft,
    timelineViewportWidth,
    setTimelineViewportWidth,
    timelineScrollIdleRef,
    timelineUserScrollingRef,
    captionDragRef,
    captionHover,
    setCaptionHover,
    forcedCaptionId,
    setForcedCaptionId,
    captionMenu,
    setCaptionMenu,
    captionMenuGapHighlight,
    setCaptionMenuGapHighlight,
    gapMenu,
    setGapMenu,
    gapMenuHighlight,
    setGapMenuHighlight,
    gapAdjustModal,
    setGapAdjustModal,
    gapMenuOpenRef,
    selectedJobUiStateRef,
    activeJob,
    isActiveJobProcessing,
    isAnotherJobProcessing,
    activeJobProgress,
    showActiveJobOverlay,
    activeJobStatusMessage,
    activeJobLabel,
    activeMediaDisplayName,
    activePreviewKind,
    captionMenuPosition,
    gapMenuPosition,
    closeGapMenu,
    closeCaptionMenu,
    handleOpenGapAdjust,
    handleCloseGapMenu,
    segments,
    showCaptionSetup,
    sortedSegments,
    displaySegments,
    sortedDisplaySegments,
    displaySegmentById,
    exportSegments,
    openCcConverter,
    activeSubtitleSegment,
    currentSubtitleMatch,
    activeTimelineSegmentId,
    currentSubtitle,
    subtitleFontSize,
    subtitleTextStyle,
    subtitleDisplaySize,
    scheduleSubtitleUiSave,
    saveTextFile,
    handleExportTranscript,
    handleExportSrt,
    handleOpenFiles,
    setWindowOnTop,
    handleTogglePinned,
    handleRequestFilePicker,
    orderedClips,
    clipTimeline,
    timelineDuration,
    clipById,
    modelDownloadActive,
    modelDownloadTitle,
    modelProgressText,
    nextClip,
    timelineRanges,
    applyPlaybackRate,
    safePlay,
    schedulePendingPlay,
    capturePreviewPoster,
    getActiveVideoEl,
    getInactiveVideoEl,
    getActiveMediaEl,
    cyclePlaybackRate,
    handleToggleChineseVariant,
    handleSubtitleScaleDecrease,
    handleSubtitleScaleIncrease,
    handleSrtSelected,
    handleLoadSrt,
    handleClearCaptions,
    ensureWhisperModelReady,
    clearModelDownload,
    handleRetryModelDownload,
    handleGenerateCaptions,
    openExternalUrl,
    handleOpenPremiumModal,
    handlePremiumWebviewLoad,
    handlePremiumWebviewError,
    handlePremiumRetry,
    handleCopyMachineId,
    handleConfirmPremiumKey,
    handleWindowAction,
    getHeaderDragProps,
    transcriptMediaRef,
    advanceFromClip,
    localPreviewUrl,
    resolvedPreviewUrl,
    activeVideoSrc,
    audioPreviewSrc,
    showPreviewSpinner,
    youtubeUnavailableReason,
    showYoutubeUnavailable,
    shouldShowPreviewPoster,
    nextVideoTarget,
    handleOpenSubtitleEditor,
    handleSaveSubtitleEdit,
    applySubtitlePosition,
    handleSubtitlePointerDown,
    handleSubtitlePointerMove,
    handleSubtitlePointerUp,
    togglePlayback,
    handlePreviewClick,
    applyScrub,
    scheduleScrub,
    startPlayerScrub,
    endPlayerScrub,
    tickCount,
    minZoom,
    maxZoom,
    minCaptionDuration,
    minVisibleDurationSec,
    maxVisibleDurationSec,
    midVisibleDurationSec,
    zoomT,
    visibleDuration,
    segmentSec,
    pxPerSec,
    timelineWidth,
    timelineScrollWidth,
    playheadLeftPx,
    playheadPct,
    rulerDuration,
    ticks,
    captionMenuGapAfter,
    segmentPx,
    faintGridStyle,
    seekFromPointer,
    computeCaptionTiming,
    handleCaptionPointerDown,
    handleCaptionPointerMove,
    handleCaptionPointerUp,
    ensureCaptionJobId,
    handleAddCaption,
    applyTimelineShift,
    handleRemoveGap,
    handleAdjustGapAfter,
    handleDeleteCaption,
    handleSplitCaption,
    handleCaptionHoverMove,
    handleGapContextMenu,
    onTrackPointerDown,
    onTrackPointerMove,
    onTrackPointerUp,
    toggleFullscreen,
    handleClearSelection,
    commitDisplayName,
    cancelDisplayNameEdit,
    handleAddToTimeline,
    handleTimelineScroll,
    handleTimelineWheel,
    timelineSegments,
    timelineSegmentEls,
    layoutClass,
    captionControlsDisabled,
    isCantoneseLanguage,
    isSecondCaptionActive,
    generateCaptionLabel,
    isGenerateDisabled,
    handleToggleSecondCaption,
    captionSetupPanel,
    compactCaptionsPanel,
    captionSidebarContent,
    captionSidebarModalContent,
    playerPanelProps,
    playerPanel,
    playerModalPanel,
    leftPanelContent
  };
}

export type AppState = ReturnType<typeof useAppState>;

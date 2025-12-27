import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { setVersion } from "../features/ui/uiSlice";
import { setChineseStyle, setLanguage } from "../features/settings/settingsSlice";
import { setExportLanguage } from "../features/transcript/transcriptSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import {
  addJob,
  addSegment,
  bootstrapJobs,
  pollJobUpdates,
  removeSegment,
  selectJob,
  setJobSegments,
  updateJobUiState,
  updateJobDisplayName,
  updateSegmentText,
  updateSegmentTiming
} from "../features/jobs/jobsSlice";
import { UploadTab, type UploadTabHandle, type MediaItem } from "../features/upload/components/UploadTab";
import { TranscriptPanel } from "../features/transcript/components/TranscriptPanel";
import type { ToastType } from "../shared/components/ToastHost";
import { AppIcon } from "../shared/components/AppIcon";
import { Select } from "../shared/components/Select";
import { cn } from "../shared/lib/cn";
import { sanitizeProgressValue, stripFileExtension } from "../shared/lib/utils";
import { fileFromBase64 } from "../shared/lib/file";
import {
  apiConvertChinese,
  apiEditSegment,
  apiGetJobRecord,
  apiImportYoutube,
  apiGetWhisperModelDownload,
  apiGetWhisperModelStatus,
  apiStartWhisperModelDownload,
  apiUpsertJobRecord,
  apiUpdateSegmentTiming,
  apiAddSegment,
  apiDeleteSegment
} from "../shared/api/sttApi";
import type { ExportLanguage, Job, TranscriptSegment, WhisperModelDownload, WhisperModelStatus } from "../shared/types";

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function isBlankAudioText(value: string) {
  const cleaned = value.trim().toUpperCase();
  return !cleaned || cleaned === "[BLANK_AUDIO]";
}

function formatBytes(value?: number | null) {
  if (!value || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let size = value;
  while (size >= 1024 && idx < units.length - 1) {
    size /= 1024;
    idx += 1;
  }
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function parseSrtTimestamp(raw: string) {
  const match = raw.trim().match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, "0"));
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

function formatSrtTimestamp(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const secs = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms
    .toString()
    .padStart(3, "0")}`;
}

function parseSrt(text: string): TranscriptSegment[] {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const segments: TranscriptSegment[] = [];
  let id = 1;
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    let timeLineIndex = lines.findIndex((line) => line.includes("-->"));
    if (timeLineIndex < 0) continue;
    if (timeLineIndex === 0 && /^\d+$/.test(lines[0])) {
      timeLineIndex = 1;
    }
    const timeLine = lines[timeLineIndex] ?? "";
    const [startRaw, endRaw] = timeLine.split("-->").map((part) => part.trim());
    if (!startRaw || !endRaw) continue;
    const start = parseSrtTimestamp(startRaw);
    const end = parseSrtTimestamp(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const textLines = lines.slice(timeLineIndex + 1);
    const captionText = textLines.join("\n").trim();
    segments.push({
      id,
      start,
      end,
      text: captionText,
      originalText: captionText
    });
    id += 1;
  }
  return segments;
}

function safeOpenCcConverter(target: ExportLanguage): ((input: string) => string) | null {
  const win = typeof window !== "undefined" ? (window as any) : null;
  const OpenCC = win?.OpenCC;
  if (!OpenCC || typeof OpenCC.Converter !== "function") return null;
  try {
    if (target === "traditional") {
      return OpenCC.Converter({ from: "cn", to: "tw" });
    }
    return OpenCC.Converter({ from: "tw", to: "cn" });
  } catch {
    return null;
  }
}

type ModelDownloadState = {
  status: "idle" | "checking" | "downloading" | "error";
  progress: number | null;
  message: string;
  detail?: string | null;
  expectedPath?: string | null;
  downloadUrl?: string | null;
  downloadId?: string | null;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

function deriveJobSegments(job: Job | null): TranscriptSegment[] {
  if (!job) return [];
  if (job.streamingSegments && job.streamingSegments.length > 0) return job.streamingSegments;
  if (job.result && job.result.segments) return job.result.segments;
  if (job.partialResult && job.partialResult.segments) return job.partialResult.segments;
  return [];
}

function baseFilename(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  const stripped = raw ? raw.replace(/\.[^/.]+$/, "") : "transcript";
  const safe = stripped.replace(/[\\/:*?"<>|]+/g, "_").trim();
  return safe || "transcript";
}

function findSegmentAtTime<T extends { start: number; end: number }>(segments: T[], time: number): T | null {
  if (!segments.length || !Number.isFinite(time)) return null;
  let lo = 0;
  let hi = segments.length - 1;
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].start <= time) {
      idx = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (idx < 0) return null;
  const segment = segments[idx];
  if (time >= segment.start && time < segment.end) return segment;
  return null;
}

const BASE_PX_PER_SEC = 20;
const MIN_CLIP_DURATION_SEC = 0.5;
const DEFAULT_TIMELINE_ZOOM = 1.75;
const TIMELINE_LEFT_PADDING_PX = 0;
const TIMELINE_RIGHT_PADDING_PX = 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const normalizeClips = <T extends { startSec: number; durationSec: number }>(clips: T[]) => {
  const withIndex = clips.map((clip, index) => ({ clip, index }));
  withIndex.sort((a, b) => a.clip.startSec - b.clip.startSec || a.index - b.index);
  return withIndex.map(({ clip }) => ({
    ...clip,
    durationSec: Math.max(MIN_CLIP_DURATION_SEC, clip.durationSec)
  }));
};

export function App() {
  const settings = useAppSelector((s) => s.settings);
  const exportLanguage = useAppSelector((s) => s.transcript.exportLanguage);
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

  const isWindows =
    typeof window !== "undefined"
      ? /Win/i.test(window.navigator.platform || "") || /Windows/i.test(window.navigator.userAgent || "")
      : false;
  const isMac =
    typeof window !== "undefined"
      ? /Mac/i.test(window.navigator.platform || "") || /Macintosh/i.test(window.navigator.userAgent || "")
      : false;
  const showCustomWindowControls = isWindows || isMac;
  const [useCustomDrag, setUseCustomDrag] = useState(false);

  // Custom drag for macOS to avoid app-region issues on rotated/hiDPI monitors.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isMac) return;
    let teardown: (() => void) | null = null;
    let enabled = false;

    const enableCustomDrag = () => {
      if (enabled) return;
      const win = window as any;
      const api = win?.pywebview?.api;
      if (!api) return;
      const getPosition = api.window_get_position || api.windowGetPosition || api.window_getPosition;
      const moveWindow = api.window_move || api.windowMove || api.window_moveWindow;
      if (typeof getPosition !== "function" || typeof moveWindow !== "function") return;

      enabled = true;
      setUseCustomDrag(true);
      document.documentElement.classList.add("pywebview-custom-drag");

      let dragState: {
        pointerId: number;
        startX: number;
        startY: number;
        winX: number;
        winY: number;
        ready: boolean;
        dragging: boolean;
        captureEl: Element | null;
      } | null = null;

      let rafId = 0;
      let pendingX = 0;
      let pendingY = 0;
      const DRAG_THRESHOLD_PX = 3;

      const scheduleMove = (x: number, y: number) => {
        pendingX = x;
        pendingY = y;
        if (rafId) return;
        rafId = window.requestAnimationFrame(() => {
          rafId = 0;
          moveWindow(pendingX, pendingY);
        });
      };

      const endDrag = (event: PointerEvent) => {
        if (!dragState || dragState.pointerId !== event.pointerId) return;
        if (dragState.captureEl && "releasePointerCapture" in dragState.captureEl) {
          try {
            dragState.captureEl.releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        }
        dragState = null;
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const region = target.closest(".stt-drag-region");
        if (!region) return;
        if (target.closest(".pywebview-no-drag")) return;
        if (target.closest("button, a, input, select, textarea, [role='button']")) return;

        dragState = {
          pointerId: event.pointerId,
          startX: event.screenX,
          startY: event.screenY,
          winX: window.screenX || 0,
          winY: window.screenY || 0,
          ready: false,
          dragging: false,
          captureEl: region
        };

        Promise.resolve(getPosition())
          .then((result: any) => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            if (!result || result.success === false) {
              endDrag(event);
              return;
            }
            dragState.winX = Number(result.x) || 0;
            dragState.winY = Number(result.y) || 0;
            dragState.ready = true;
          })
          .catch(() => {
            endDrag(event);
          });
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!dragState || dragState.pointerId !== event.pointerId || !dragState.ready) return;
        const dx = event.screenX - dragState.startX;
        const dy = event.screenY - dragState.startY;
        if (!dragState.dragging) {
          if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
          dragState.dragging = true;
          if (dragState.captureEl && "setPointerCapture" in dragState.captureEl) {
            try {
              dragState.captureEl.setPointerCapture(event.pointerId);
            } catch {
              // ignore
            }
          }
        }
        const nextX = Math.round(dragState.winX + dx);
        const nextY = Math.round(dragState.winY + dy);
        scheduleMove(nextX, nextY);
        event.preventDefault();
      };

      document.addEventListener("pointerdown", onPointerDown, true);
      document.addEventListener("pointermove", onPointerMove, true);
      document.addEventListener("pointerup", endDrag, true);
      document.addEventListener("pointercancel", endDrag, true);

      teardown = () => {
        setUseCustomDrag(false);
        document.documentElement.classList.remove("pywebview-custom-drag");
        document.removeEventListener("pointerdown", onPointerDown, true);
        document.removeEventListener("pointermove", onPointerMove, true);
        document.removeEventListener("pointerup", endDrag, true);
        document.removeEventListener("pointercancel", endDrag, true);
        if (rafId) {
          window.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      };
    };

    const onReady = () => enableCustomDrag();
    enableCustomDrag();
    window.addEventListener("pywebviewready", onReady as EventListener);
    return () => {
      window.removeEventListener("pywebviewready", onReady as EventListener);
      if (teardown) {
        teardown();
        teardown = null;
      }
    };
  }, [isMac]);



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
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeImporting, setYoutubeImporting] = useState(false);
  const [youtubeError, setYoutubeError] = useState<string | null>(null);
  const [youtubeProgress, setYoutubeProgress] = useState<number | null>(null);
  const youtubeProgressTimerRef = useRef<number | null>(null);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isPlayerModalOpen, setIsPlayerModalOpen] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const headerMenuButtonRef = useRef<HTMLButtonElement | null>(null);

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
  const windowZoomStateRef = useRef<{
    active: boolean;
    width?: number;
    height?: number;
    x?: number;
    y?: number;
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

  const [isTranscriptEdit, setIsTranscriptEdit] = useState(false);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setIsAltPressed(true);
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setIsAltPressed(false);
      }
    };
    const handleBlur = () => setIsAltPressed(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  useEffect(() => {
    if (!isPlayerModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsPlayerModalOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlayerModalOpen]);

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    const getter = api?.window_get_on_top || api?.windowGetOnTop || api?.window_getOnTop;
    if (typeof getter !== "function") return;
    Promise.resolve(getter())
      .then((result: any) => {
        if (!result || result.success === false) return;
        setIsPinned(Boolean(result.onTop));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!isHeaderMenuOpen) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (headerMenuRef.current?.contains(target)) return;
      if (headerMenuButtonRef.current?.contains(target)) return;
      setIsHeaderMenuOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [isHeaderMenuOpen]);

  const [showImportModal, setShowImportModal] = useState(false);
  const [modelDownload, setModelDownload] = useState<ModelDownloadState>({
    status: "idle",
    progress: null,
    message: "",
    downloadedBytes: null,
    totalBytes: null
  });
  const [secondCaptionEnabled, setSecondCaptionEnabled] = useState(false);
  const [secondCaptionLanguage, setSecondCaptionLanguage] = useState<"yue" | "zh" | "en">("en");
  const [localMedia, setLocalMedia] = useState<MediaItem[]>([]);
  const [timelineZoom, setTimelineZoom] = useState(DEFAULT_TIMELINE_ZOOM);
  const [isCompact, setIsCompact] = useState(false);
  const [isHeaderCompact, setIsHeaderCompact] = useState(false);
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [compactTab, setCompactTab] = useState<"player" | "captions">("player");
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
  const [isDisplayNameEditing, setIsDisplayNameEditing] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubStateRef = useRef<{ pointerId: number; rect?: DOMRect } | null>(null);
  const playerScrubRef = useRef<{ wasPlaying: boolean } | null>(null);
  const scrubRafRef = useRef<number | null>(null);
  const pendingScrubRef = useRef<number | null>(null);
  const lastScrubValueRef = useRef<number | null>(null);
  const mediaRafActiveRef = useRef(false);
  const pendingSwapRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const isGapPlaybackRef = useRef(false);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const timelineScrollIdleRef = useRef<number | null>(null);
  const timelineUserScrollingRef = useRef(false);
  const dragRegionClass = useCustomDrag ? "stt-drag-region" : "pywebview-drag-region";
  const getPreviewKind = useCallback((media?: MediaItem | null) => {
    if (!media) return null;
    return media.streamUrl ? "video" : media.kind;
  }, []);
  const captionDragRef = useRef<{
    pointerId: number;
    jobId: string;
    segmentId: number;
    start: number;
    end: number;
    startX: number;
    mode: "move" | "start" | "end";
  } | null>(null);
  const [captionHover, setCaptionHover] = useState<{ start: number; end: number } | null>(null);
  const [forcedCaptionId, setForcedCaptionId] = useState<number | null>(null);
  const [captionMenu, setCaptionMenu] = useState<{
    x: number;
    y: number;
    segment: TranscriptSegment;
  } | null>(null);
  const selectedJobUiStateRef = useRef<Record<string, any>>({});
  const activeJob = useMemo(() => {
    if (selectedJob) return selectedJob;
    if (activeMedia?.source === "job" && activeMedia.jobId) {
      return jobsById[activeMedia.jobId] ?? null;
    }
    return null;
  }, [activeMedia?.jobId, activeMedia?.source, jobsById, selectedJob]);
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
    const width = 160;
    const height = 44;
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);
    return {
      left: Math.min(captionMenu.x, maxLeft),
      top: Math.min(captionMenu.y, maxTop)
    };
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

  useEffect(() => {
    if (!showImportModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowImportModal(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showImportModal]);

  useEffect(() => {
    if (!showOpenModal) return;
    if (!youtubeImporting) {
      setYoutubeProgress(null);
    }
    if (youtubeProgressTimerRef.current) {
      window.clearInterval(youtubeProgressTimerRef.current);
      youtubeProgressTimerRef.current = null;
    }
  }, [showOpenModal, youtubeImporting]);

  useEffect(() => {
    if (showOpenModal || youtubeImporting) return;
    if (youtubeProgressTimerRef.current) {
      window.clearInterval(youtubeProgressTimerRef.current);
      youtubeProgressTimerRef.current = null;
    }
  }, [showOpenModal, youtubeImporting]);

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

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const version = typeof win?.__APP_VERSION__ === "string" ? win.__APP_VERSION__ : null;
    if (version) {
      dispatch(setVersion(version));
    }
    dispatch(bootstrapJobs()).catch(() => undefined);
  }, [dispatch]);

  useEffect(() => {
    const inFlight = new Set<string>();
    const interval = window.setInterval(() => {
      const activeIds = jobOrder.filter((id) => {
        const status = jobsById[id]?.status;
        return status === "queued" || status === "processing";
      });
      activeIds.forEach((jobId) => {
        if (inFlight.has(jobId)) return;
        inFlight.add(jobId);
        dispatch(pollJobUpdates({ jobId }))
          .unwrap()
          .catch(() => undefined)
          .finally(() => inFlight.delete(jobId));
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [dispatch, jobOrder, jobsById]);

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

  const waitlistUrl =
    typeof window !== "undefined" && typeof (window as any).__WAITLIST_URL__ === "string"
      ? String((window as any).__WAITLIST_URL__)
      : "";
  const saveTextFile = useCallback(async (filename: string, content: string) => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;

    if (api && (typeof api.saveTranscript === "function" || typeof api.save_transcript === "function")) {
      const saveFn = (api.saveTranscript || api.save_transcript).bind(api);
      try {
        return await saveFn(filename, content);
      } catch {
        // fall through to browser download
      }
    }

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { success: true };
  }, []);
  const handleExportTranscript = useCallback(async () => {
    if (!exportSegments.length) {
      notify("No transcript to export.", "info");
      return;
    }

    const rawText = exportSegments
      .map((segment) => String(segment.originalText ?? segment.text ?? "").trim())
      .filter(Boolean)
      .join("\n");

    if (!rawText) {
      notify("No transcript to export.", "info");
      return;
    }

    const fallback = { text: rawText, suffix: "_original" };
    let converted = fallback;

    setIsExporting(true);
    try {
      try {
        if (exportLanguage === "traditional") {
          const convertedText = openCcConverter ? openCcConverter(rawText) : await apiConvertChinese({
            text: rawText,
            target: "traditional"
          });
          converted = { text: convertedText, suffix: "_繁體中文" };
        } else if (exportLanguage === "simplified") {
          const convertedText = openCcConverter ? openCcConverter(rawText) : await apiConvertChinese({
            text: rawText,
            target: "simplified"
          });
          converted = { text: convertedText, suffix: "_简体中文" };
        }
      } catch {
        converted = fallback;
      }

      const filename = `${baseFilename(selectedJob?.filename)}_transcript${converted.suffix}.txt`;
      const response = await saveTextFile(filename, converted.text);
      if (response && response.success) {
        notify("Transcript exported successfully.", "success");
        return;
      }
      if (response && response.cancelled) {
        notify("Export cancelled.", "info");
        return;
      }
      notify("Transcript exported successfully.", "success");
    } finally {
      setIsExporting(false);
    }
  }, [exportLanguage, exportSegments, notify, openCcConverter, saveTextFile, selectedJob?.filename]);

  const handleExportSrt = useCallback(async () => {
    if (!exportSegments.length) {
      notify("No captions to export.", "info");
      return;
    }
    const content = exportSegments
      .map((segment, index) => {
        const rawText = String(segment.originalText ?? segment.text ?? "").trim();
        if (!rawText) return null;
        let text = rawText;
        if (openCcConverter) {
          try {
            text = openCcConverter(rawText);
          } catch {
            text = rawText;
          }
        }
        const start = formatSrtTimestamp(Number(segment.start ?? 0));
        const end = formatSrtTimestamp(Number(segment.end ?? 0));
        return `${index + 1}\n${start} --> ${end}\n${text}\n`;
      })
      .filter(Boolean)
      .join("\n");

    if (!content.trim()) {
      notify("No captions to export.", "info");
      return;
    }

    setIsExporting(true);
    try {
      const filename = `${baseFilename(selectedJob?.filename)}_captions.srt`;
      const response = await saveTextFile(filename, content);
      if (response && response.success) {
        notify("Captions exported successfully.", "success");
        return;
      }
      if (response && response.cancelled) {
        notify("Export cancelled.", "info");
        return;
      }
      notify("Captions exported successfully.", "success");
    } finally {
      setIsExporting(false);
    }
  }, [exportSegments, notify, openCcConverter, saveTextFile, selectedJob?.filename]);

  const handleJoinWaitlist = useCallback(() => {
    const url = waitlistUrl.trim();
    if (!url) {
      notify("Waitlist link not configured.", "info");
      return;
    }
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (api && typeof api.open_external === "function") {
      api.open_external(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [notify, waitlistUrl]);

  const handleOpenFiles = useCallback(() => {
    if (isCompact) {
      setIsLeftDrawerOpen(true);
    }
    uploadRef.current?.openFilePicker?.();
  }, [isCompact]);

  const handleOpenModal = useCallback(() => {
    setYoutubeError(null);
    setYoutubeProgress(null);
    setShowOpenModal(true);
  }, []);

  const handleOpenLocalFromModal = useCallback(() => {
    setShowOpenModal(false);
    handleOpenFiles();
  }, [handleOpenFiles]);

  const handleImportYoutube = useCallback(async () => {
    const url = youtubeUrl.trim();
    if (!url) {
      setYoutubeError("Paste a YouTube link to continue.");
      return;
    }
    setYoutubeError(null);
    setShowOpenModal(false);
    setYoutubeImporting(true);
    setYoutubeProgress(5);
    if (youtubeProgressTimerRef.current) {
      window.clearInterval(youtubeProgressTimerRef.current);
    }
    youtubeProgressTimerRef.current = window.setInterval(() => {
      setYoutubeProgress((prev) => {
        if (prev === null) return prev;
        if (prev >= 90) return prev;
        const next = prev + Math.random() * 8 + 3;
        return Math.min(90, Math.round(next));
      });
    }, 700);
    try {
      const payload = await apiImportYoutube(url);
      const file = payload?.file;
      if (!file?.path || !file?.name) {
        throw new Error("Download failed. Please try again.");
      }
      const addLocalPathItem = uploadRef.current?.addLocalPathItem;
      if (!addLocalPathItem) {
        throw new Error("Upload panel is not ready yet.");
      }
      if (isCompact) {
        setIsLeftDrawerOpen(true);
      }
      const displayName = payload?.source?.title?.trim() || undefined;
      addLocalPathItem({
        path: file.path,
        name: file.name,
        size: typeof file.size === "number" ? file.size : null,
        mime: file.mime ?? null,
        displayName,
        durationSec: typeof payload?.duration_sec === "number" ? payload.duration_sec : null,
        previewUrl: payload?.stream_url ?? null,
        streamUrl: payload?.stream_url ?? null,
        externalSource: {
          type: "youtube",
          url: payload?.source?.url ?? url,
          streamUrl: payload?.stream_url ?? null,
          title: payload?.source?.title ?? null,
          id: payload?.source?.id ?? null
        },
        transcriptionKind: "audio"
      });
      setYoutubeProgress(100);
      setShowOpenModal(false);
      setYoutubeUrl("");
      notify("YouTube media loaded.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setYoutubeError(message || "Failed to load YouTube media.");
      notify(message || "Failed to load YouTube media.", "error");
      setShowOpenModal(true);
    } finally {
      setYoutubeImporting(false);
      if (youtubeProgressTimerRef.current) {
        window.clearInterval(youtubeProgressTimerRef.current);
        youtubeProgressTimerRef.current = null;
      }
      setYoutubeProgress(null);
    }
  }, [isCompact, notify, youtubeUrl]);

  const setWindowOnTop = useCallback((next: boolean) => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    const setter = api?.window_set_on_top || api?.windowSetOnTop || api?.window_setOnTop;
    if (typeof setter === "function") {
      return Promise.resolve(setter(next))
        .then((result: any) => {
          if (result && result.success === false) return;
          setIsPinned(next);
        })
        .catch(() => setIsPinned(next));
    }
    setIsPinned(next);
    return Promise.resolve();
  }, []);

  const handleTogglePinned = useCallback(() => {
    const next = !isPinned;
    void setWindowOnTop(next);
  }, [isPinned, setWindowOnTop]);

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
  const modelDownloadActive = modelDownload.status !== "idle";
  const modelDownloadTitle =
    modelDownload.status === "checking"
      ? "Checking Whisper model"
      : modelDownload.status === "downloading"
        ? "Downloading Whisper model"
        : "Whisper model download failed";
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
    const attempt = () => {
      try {
        return mediaEl.play();
      } catch {
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
    return Promise.resolve(true);
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

  const ensureWhisperModelReady = useCallback(async () => {
    if (modelDownload.status === "checking" || modelDownload.status === "downloading") {
      return false;
    }

    let statusPayload: WhisperModelStatus | null = null;
    let expectedPath: string | null = null;
    let downloadUrl: string | null = null;
    try {
      setModelDownload({
        status: "checking",
        progress: null,
        message: "Checking Whisper model...",
        downloadedBytes: null,
        totalBytes: null
      });

      statusPayload = await apiGetWhisperModelStatus();
      if (statusPayload.ready) {
        setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
        return true;
      }

      const startPayload = await apiStartWhisperModelDownload();
      if (startPayload.status === "ready") {
        setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
        return true;
      }
      const downloadId = startPayload.download_id;
      if (!downloadId) {
        throw new Error("Failed to start Whisper model download.");
      }
      expectedPath = startPayload.expected_path ?? statusPayload.expected_path ?? null;
      downloadUrl = startPayload.download_url ?? statusPayload.download_url ?? null;

      const initialProgress =
        typeof startPayload.progress === "number" ? Math.round(startPayload.progress) : null;

      setModelDownload({
        status: "downloading",
        progress: initialProgress,
        message: startPayload.message ?? "Downloading Whisper model...",
        expectedPath,
        downloadUrl,
        downloadId,
        downloadedBytes: startPayload.downloaded_bytes ?? null,
        totalBytes: startPayload.total_bytes ?? null
      });

      let current: WhisperModelDownload = startPayload;
      while (current.status !== "completed") {
        if (current.status === "failed") {
          throw new Error(current.error || "Whisper model download failed.");
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        current = await apiGetWhisperModelDownload(downloadId);
        const nextProgress = typeof current.progress === "number" ? Math.round(current.progress) : null;
        setModelDownload((prev) => ({
          status: "downloading",
          progress: nextProgress,
          message: current.message ?? prev.message,
          expectedPath: current.expected_path ?? prev.expectedPath ?? null,
          downloadUrl: current.download_url ?? prev.downloadUrl ?? null,
          downloadId,
          downloadedBytes: current.downloaded_bytes ?? prev.downloadedBytes ?? null,
          totalBytes: current.total_bytes ?? prev.totalBytes ?? null
        }));
      }

      setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setModelDownload((prev) => ({
        status: "error",
        progress: prev.progress ?? null,
        message: "Whisper model download failed.",
        detail: message,
        expectedPath: prev.expectedPath ?? expectedPath ?? null,
        downloadUrl: prev.downloadUrl ?? downloadUrl ?? null,
        downloadId: prev.downloadId ?? null,
        downloadedBytes: prev.downloadedBytes ?? null,
        totalBytes: prev.totalBytes ?? null
      }));
      notify("Whisper model download failed. Please download it manually.", "error");
      return false;
    }
  }, [modelDownload.status, notify]);

  const clearModelDownload = useCallback(() => {
    setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
  }, []);

  const handleRetryModelDownload = useCallback(() => {
    void ensureWhisperModelReady();
  }, [ensureWhisperModelReady]);

  const handleGenerateCaptions = useCallback(async () => {
    if (!timelineClips.length) {
      setShowImportModal(true);
      return;
    }
    const ready = await ensureWhisperModelReady();
    if (!ready) return;
    uploadRef.current?.submitTranscription?.();
  }, [ensureWhisperModelReady, timelineClips.length]);

  const canExportCaptions = exportSegments.length > 0;

  const callApiMethod = useCallback((api: any, names: string[], ...args: any[]) => {
    for (const name of names) {
      const fn = api?.[name];
      if (typeof fn === "function") {
        return fn.call(api, ...args);
      }
    }
    return null;
  }, []);

  const handleWindowZoomToggle = useCallback(async () => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (!api) return;
    const zoomNames = ["window_zoom", "windowZoom"];
    const zoomResult = await Promise.resolve(callApiMethod(api, zoomNames));
    if (zoomResult && zoomResult.success !== false) {
      return;
    }
    const getSizeNames = ["window_get_size", "windowGetSize", "window_getSize"];
    const setSizeNames = ["window_set_size", "windowSetSize", "window_setSize"];
    const getPosNames = ["window_get_position", "windowGetPosition", "window_getPosition"];
    const moveNames = ["window_move", "windowMove", "window_moveWindow"];
    const restoreNames = ["window_restore", "windowRestore", "window_restoreWindow"];
    const toggleMaxNames = ["window_toggle_maximize", "windowToggleMaximize", "window_zoom", "windowZoom"];

    const parseSize = (res: any) => {
      if (!res || res.success === false) return null;
      const width = Number(res.width ?? res.w ?? res.size?.width);
      const height = Number(res.height ?? res.h ?? res.size?.height);
      if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
      return { width, height };
    };

    const parsePos = (res: any) => {
      if (!res || res.success === false) return null;
      const x = Number(res.x);
      const y = Number(res.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x, y };
    };

    const current = windowZoomStateRef.current;
    if (!current || !current.active) {
      const [sizeRes, posRes] = await Promise.all([
        Promise.resolve(callApiMethod(api, getSizeNames)),
        Promise.resolve(callApiMethod(api, getPosNames))
      ]);
      const size = parseSize(sizeRes);
      const pos = parsePos(posRes);
      windowZoomStateRef.current = {
        active: true,
        width: size?.width,
        height: size?.height,
        x: pos?.x,
        y: pos?.y
      };
      await Promise.resolve(callApiMethod(api, toggleMaxNames));
      return;
    }

    windowZoomStateRef.current = { ...current, active: false };
    const restoreResult = await Promise.resolve(callApiMethod(api, restoreNames));
    const restoreOk = Boolean(restoreResult && restoreResult.success !== false);
    if (!restoreOk) {
      await Promise.resolve(callApiMethod(api, toggleMaxNames));
      if (typeof current.width === "number" && typeof current.height === "number") {
        await Promise.resolve(callApiMethod(api, setSizeNames, current.width, current.height));
      }
      if (typeof current.x === "number" && typeof current.y === "number") {
        await Promise.resolve(callApiMethod(api, moveNames, current.x, current.y));
      }
    }
  }, [callApiMethod]);

  const handleWindowAction = useCallback((action: "close" | "minimize" | "zoom" | "fullscreen") => {
    if (action === "zoom") {
      void handleWindowZoomToggle();
      return;
    }
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (!api) return;
    const map: Record<typeof action, string[]> = {
      close: ["window_close", "windowClose", "closeWindow"],
      minimize: ["window_minimize", "windowMinimize", "minimizeWindow"],
      fullscreen: ["window_toggle_fullscreen", "windowToggleFullscreen", "toggleFullscreen"]
    };
    for (const method of map[action]) {
      if (typeof api[method] === "function") {
        void api[method]();
        break;
      }
    }
  }, [handleWindowZoomToggle]);

  const handleHeaderDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".pywebview-no-drag")) return;
      if (target.closest("button, a, input, select, textarea, [role='button']")) return;
      handleWindowAction("zoom");
    },
    [handleWindowAction]
  );

  const getHeaderDragProps = useCallback(
    (baseClass: string) => ({
      className: cn(dragRegionClass, baseClass),
      onDoubleClick: handleHeaderDoubleClick
    }),
    [dragRegionClass, handleHeaderDoubleClick]
  );



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
        void safePlay(mediaEl);
        pendingPlayRef.current = false;
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
    capturePreviewPoster
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
    if (activeMedia.previewUrl) {
      setActivePreviewUrl(null);
      return;
    }
    if (activeMedia.source === "job" && activeMedia.jobId) {
      setActivePreviewUrl(`/audio/${activeMedia.jobId}?v=${Date.now()}`);
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
  }, [activeMedia]);

  const resolvedPreviewUrl = activeMedia?.previewUrl ?? activePreviewUrl;
  const activeVideoSrc = resolvedPreviewUrl && activePreviewKind === "video" ? resolvedPreviewUrl : null;
  const audioPreviewSrc = activePreviewKind === "audio" ? resolvedPreviewUrl : null;
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
          void safePlay(mediaEl);
        }
      }
    }
  }, [activeClipId, activeMedia, getActiveMediaEl, safePlay]);

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

  const duration = clipTimeline.length ? timelineDuration : (playback.duration || 0);
  const previewDisabled = !Number.isFinite(duration) || duration <= 0;
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
      void safePlay(mediaEl)
        .then((ok) => {
          setPlayback((prev) => ({ ...prev, isPlaying: ok }));
        })
        .catch(() => {
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
      if (!activeJob?.id) return;
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

  const handleAddCaption = useCallback(
    (start: number, end: number) => {
      if (!activeJob?.id) return;
      const jobId = activeJob.id;
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
    [activeJob?.id, dispatch, sortedSegments]
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
      const start = clamp(time, gapStart, gapEnd - desired);
      const end = start + desired;
      setCaptionHover({ start, end });
    },
    [activeJob?.id, duration, minCaptionDuration, pxPerSec, sortedDisplaySegments]
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
    setIsPlayerModalOpen((prev) => !prev);
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
    [dispatch, notify]
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
      timelineSegments
    ]
  );

  const layoutClass = isCompact
    ? "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]"
    : "grid min-h-0 overflow-hidden grid-cols-[minmax(160px,240px)_minmax(0,1fr)_minmax(240px,340px)] 2xl:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(280px,380px)] grid-rows-[minmax(0,1fr)_auto]";

  const captionSetupPanel = (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-slate-400" htmlFor="languageSelect">
          Language
        </label>
        <Select
          className="stt-select-dark"
          id="language"
          buttonId="languageSelect"
          value={String(settings.language)}
          options={[
            { value: "auto", label: "Auto Detect" },
            { value: "yue", label: "Cantonese" },
            { value: "zh", label: "Mandarin" },
            { value: "en", label: "English" }
          ]}
          onChange={(value) => dispatch(setLanguage(value as any))}
        />
      </div>
      <div className="space-y-2">
        <label className="text-[11px] font-semibold text-slate-400" htmlFor="chineseStyleSelect">
          Chinese Output Style
        </label>
        <Select
          className="stt-select-dark"
          id="chineseStyle"
          buttonId="chineseStyleSelect"
          value={String(settings.chineseStyle)}
          options={[
            { value: "spoken", label: "Spoken (Cantonese)" },
            { value: "written", label: "Written" }
          ]}
          onChange={(value) => dispatch(setChineseStyle(value as any))}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-400" htmlFor="secondCaptionLanguageSelect">
            Second Caption
          </label>
          <button
            className={cn(
              "inline-flex items-center gap-2 text-[10px] font-medium transition",
              secondCaptionEnabled ? "text-slate-200" : "text-slate-500"
            )}
            onClick={() => setSecondCaptionEnabled((prev) => !prev)}
            type="button"
          >
            <span
              className={cn(
                "relative inline-flex h-4 w-7 items-center rounded-full border transition",
                secondCaptionEnabled ? "border-slate-500 bg-[#1b1b22]" : "border-slate-700 bg-[#151515]"
              )}
            >
              <span
                className={cn(
                  "absolute h-3 w-3 rounded-full bg-white transition",
                  secondCaptionEnabled ? "translate-x-3" : "translate-x-1"
                )}
              />
            </span>
          </button>
        </div>
        <Select
          className={cn("stt-select-dark", !secondCaptionEnabled && "opacity-60")}
          id="secondCaptionLanguage"
          buttonId="secondCaptionLanguageSelect"
          value={secondCaptionLanguage}
          options={[
            { value: "yue", label: "Cantonese" },
            { value: "zh", label: "Mandarin" },
            { value: "en", label: "English" }
          ]}
          onChange={(value) => setSecondCaptionLanguage(value as "yue" | "zh" | "en")}
          disabled={!secondCaptionEnabled}
        />
      </div>
      <div className="pt-2">
        <button
          className={cn(
            "inline-flex w-full items-center justify-center rounded-md bg-[#1b1b22] px-3 py-2.5 text-[11.5px] font-semibold text-slate-200 transition hover:bg-[#26262f]",
            modelDownload.status === "checking" ||
              modelDownload.status === "downloading" ||
              isTranscribing
              ? "cursor-not-allowed opacity-60 hover:bg-[#1b1b22]"
              : ""
          )}
          onClick={handleGenerateCaptions}
          disabled={
            modelDownload.status === "checking" ||
            modelDownload.status === "downloading" ||
            isTranscribing
          }
          type="button"
        >
          {isTranscribing
            ? "Processing..."
            : modelDownload.status === "downloading"
              ? "Downloading model..."
              : "AI Generate Caption"}
        </button>
      </div>
    </div>
  );

  const renderPlayerPanel = (isModal: boolean) => {
    const showCompactCaptions = !isModal && isCompact && compactTab === "captions";
    return (
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col items-center justify-center gap-2",
          isModal ? "p-4" : "p-2"
        )}
      >
        {showCompactCaptions ? (
          <div className="flex min-h-0 w-full flex-1">
            <div className="min-h-0 h-[calc(100vh-320px)] max-h-[calc(100vh-320px)] w-full overflow-hidden">
              <div className="flex h-full min-h-0 flex-col gap-3">
                {showCaptionSetup ? captionSetupPanel : null}
                <div className="min-h-0 flex-1">
                  <TranscriptPanel
                    mediaRef={transcriptMediaRef}
                    notify={notify}
                    editEnabled={isTranscriptEdit}
                    suppressEmptyState={showCaptionSetup}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
              ref={previewContainerRef}
            >
              <div
                className="relative h-full w-full overflow-hidden rounded-xl bg-black"
                onClick={handlePreviewClick}
              >
                {activeMedia ? (
                  <div
                    className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2"
                    data-no-toggle
                  >
                    {isDisplayNameEditing ? (
                      <input
                        className="w-[min(70vw,420px)] rounded-md border border-white/15 bg-black/70 px-3 py-1 text-center text-[12px] font-medium text-white outline-none focus:border-primary/70"
                        value={displayNameDraft}
                        placeholder={activeMediaDisplayName || activeMedia.displayName || activeMedia.name || "Display name"}
                        onChange={(e) => setDisplayNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void commitDisplayName();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelDisplayNameEdit();
                          }
                        }}
                        onBlur={() => void commitDisplayName()}
                        autoFocus
                        aria-label="Edit display name"
                      />
                    ) : (
                      <button
                        type="button"
                        className="inline-flex max-w-[min(70vw,420px)] items-center rounded-md border border-white/10 bg-black/60 px-3 py-1 text-[12px] font-medium text-white/90 shadow hover:border-white/25"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsDisplayNameEditing(true);
                        }}
                        title="Click to rename"
                      >
                        <span className="truncate">{activeMediaDisplayName}</span>
                      </button>
                    )}
                  </div>
                ) : null}
                {activeVideoSrc ? (
                  <>
                    <video
                      src={activeVideoSlot === 0 ? activeVideoSrc : nextVideoTarget?.url ?? undefined}
                      ref={videoRefA}
                      playsInline
                      preload="auto"
                      muted={activeVideoSlot !== 0}
                      poster={activeVideoSlot === 0 ? previewPoster ?? undefined : undefined}
                      onLoadedData={() => {
                        if (previewPosterModeRef.current !== "paused") {
                          setPreviewPoster(null);
                        }
                      }}
                      className={cn(
                        "absolute inset-0 h-full w-full object-contain transition-opacity",
                        activeVideoSlot === 0 ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <video
                      src={activeVideoSlot === 1 ? activeVideoSrc : nextVideoTarget?.url ?? undefined}
                      ref={videoRefB}
                      playsInline
                      preload="auto"
                      muted={activeVideoSlot !== 1}
                      poster={activeVideoSlot === 1 ? previewPoster ?? undefined : undefined}
                      onLoadedData={() => {
                        if (previewPosterModeRef.current !== "paused") {
                          setPreviewPoster(null);
                        }
                      }}
                      className={cn(
                        "absolute inset-0 h-full w-full object-contain transition-opacity",
                        activeVideoSlot === 1 ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {shouldShowPreviewPoster ? (
                      <img
                        src={previewPoster}
                        alt=""
                        className="pointer-events-none absolute inset-0 h-full w-full object-contain"
                      />
                    ) : null}
                  </>
                ) : activePreviewKind === "audio" && resolvedPreviewUrl ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-xs text-slate-500">
                    <AppIcon name="volume" className="text-2xl" />
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Audio Preview</span>
                  </div>
                ) : activeMedia ? (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-slate-500">
                    <AppIcon name={activePreviewKind === "audio" ? "volume" : "video"} className="text-2xl" />
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      {activePreviewKind === "audio" ? "Audio Preview" : "Preview"}
                    </span>
                    {activeMedia.source === "job" && activeMedia.kind === "video" ? (
                      <span className="text-[10px] text-slate-500">Video preview not available yet</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="h-full w-full bg-black" />
                )}
                {showActiveJobOverlay ? (
                  <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-4">
                    <div className="w-full max-w-[360px] rounded-2xl border border-white/10 bg-black/65 p-6 text-center shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-md">
                      <div className="mx-auto flex items-center justify-center">
                        <div className="processing-spinner" aria-hidden>
                          <span className="processing-bar processing-bar-1" />
                          <span className="processing-bar processing-bar-2" />
                          <span className="processing-bar processing-bar-3" />
                          <span className="processing-bar processing-bar-4" />
                        </div>
                      </div>
                      <div className="mt-4 text-sm font-semibold text-slate-100">{activeJobLabel}</div>
                      <div className="mt-4">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
                          <div
                            className={cn(
                              "h-full rounded-full bg-white transition-[width] duration-200",
                              activeJobProgress === null && "animate-pulse"
                            )}
                            style={{
                              width: `${Math.max(4, Math.min(100, activeJobProgress ?? 18))}%`
                            }}
                          />
                        </div>
                        <div className="mt-2 text-[11px] font-semibold text-white/90">
                          {activeJobProgress !== null ? `${activeJobProgress}%` : "Preparing..."}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {subtitleEditor || currentSubtitle ? (
                  <div
                    ref={subtitleBoxRef}
                    className={cn(
                      "absolute z-10 rounded-md px-3 py-1",
                      subtitleEditor
                        ? "cursor-move border border-white/35 resize overflow-hidden"
                        : "cursor-move"
                    )}
                    data-no-toggle
                    style={{
                      left: `${subtitlePosition.x * 100}%`,
                      top: `${subtitlePosition.y * 100}%`,
                      transform: "translate(-50%, -50%)",
                      width: subtitleDisplaySize.width ? `${subtitleDisplaySize.width}px` : undefined,
                      height: subtitleDisplaySize.height ? `${subtitleDisplaySize.height}px` : undefined,
                      maxWidth: `${subtitleMaxWidth}px`,
                      minWidth: "140px",
                      minHeight: "36px"
                    }}
                    onPointerDown={handleSubtitlePointerDown}
                    onPointerMove={handleSubtitlePointerMove}
                    onPointerUp={handleSubtitlePointerUp}
                    onPointerCancel={handleSubtitlePointerUp}
                  >
                    {subtitleEditor ? (
                      <textarea
                        className="h-full w-full resize-none bg-transparent text-center text-[13px] font-medium text-white outline-none cursor-text"
                        style={subtitleTextStyle}
                        value={subtitleDraft}
                        onChange={(e) => setSubtitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setSubtitleEditor(null);
                          } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            e.preventDefault();
                            void handleSaveSubtitleEdit();
                          }
                        }}
                        onBlur={() => void handleSaveSubtitleEdit()}
                        autoFocus
                        aria-label="Edit subtitle"
                      />
                    ) : (
                      <div
                        className="whitespace-normal break-words text-[13px] font-medium text-white pointer-events-none text-center"
                        style={subtitleTextStyle}
                      >
                        {currentSubtitle}
                      </div>
                    )}
                  </div>
                ) : null}
                <span
                  ref={subtitleMeasureRef}
                  className="pointer-events-none absolute -z-10 opacity-0 whitespace-normal break-words"
                  style={{
                    fontSize: `${subtitleFontSize}px`,
                    fontWeight: 500,
                    lineHeight: "1.2",
                    maxWidth: `${subtitleMaxWidth}px`
                  }}
                />
              </div>
            </div>
            <div className="flex w-full shrink-0 items-center gap-3 px-2 py-1">
              <button
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md text-slate-200 transition",
                  previewDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/10"
                )}
                onClick={togglePlayback}
                disabled={previewDisabled}
                type="button"
              >
                <AppIcon name={isMediaPlaying ? "pause" : "play"} className="text-[12px]" />
              </button>
              <button
                className={cn(
                  "flex h-8 w-12 items-center justify-center rounded-md px-2 text-[11px] font-semibold tabular-nums text-slate-200 transition",
                  previewDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-white/10"
                )}
                onClick={cyclePlaybackRate}
                disabled={previewDisabled}
                type="button"
                aria-label="Playback speed"
                title="Playback speed"
              >
                {`${playbackRate}X`}
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[11px] text-slate-400 tabular-nums">{formatTime(playback.currentTime)}</span>
                <div className="relative flex-1">
                  <div className="h-1 rounded-full bg-[#2a2a30]">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${playheadPct}%` }} />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, duration)}
                    value={Math.min(playback.currentTime, duration || 0)}
                    onChange={(event) => scheduleScrub(Number(event.target.value))}
                    onPointerDown={startPlayerScrub}
                    onPointerUp={endPlayerScrub}
                    onPointerCancel={endPlayerScrub}
                    onPointerLeave={endPlayerScrub}
                    className="absolute inset-0 h-4 w-full cursor-pointer opacity-0"
                    disabled={previewDisabled}
                  />
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums">{formatTime(duration)}</span>
              </div>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-200 transition hover:bg-white/10"
                onClick={toggleFullscreen}
                type="button"
                aria-label="Fullscreen"
              >
                <AppIcon name="expand" className="text-[12px]" />
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const leftPanelContent = (
    <>
      <div className={cn(dragRegionClass, "flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200")}>
        <span>Media</span>
        {isCompact ? (
          <button
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/20 bg-[#151515] text-[10px] text-slate-300 hover:border-slate-600"
            onClick={() => setIsLeftDrawerOpen(false)}
            type="button"
            aria-label="Close"
            title="Close"
          >
            <AppIcon name="chevronLeft" />
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-3 stt-scrollbar",
          !isCompact && "h-[calc(100vh-340px)] max-h-[calc(100vh-340px)]"
        )}
      >
        <div className="h-full">
          <UploadTab
            ref={uploadRef}
            notify={notify}
            localMedia={localMedia}
            onLocalMediaChange={setLocalMedia}
            onAddToTimeline={handleAddToTimeline}
            onClearSelection={handleClearSelection}
            onRequestFilePicker={handleRequestFilePicker}
          />
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="flex h-full w-full flex-col bg-[#0b0b0b] text-slate-100">
        <div
          {...getHeaderDragProps(
            "relative grid h-10 select-none grid-cols-[1fr_auto_1fr] items-center bg-[#0b0b0b] px-3 text-xs text-slate-300"
          )}
        >
          <div className="flex min-w-0 items-center gap-2">
            {isMac ? (
              <div className="group mr-3 flex items-center gap-2">
                <button
                  className="pywebview-no-drag relative flex h-3 w-3 cursor-default items-center justify-center rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition group-hover:brightness-95"
                  onClick={() => handleWindowAction("close")}
                  type="button"
                  aria-label="Close"
                >
                  <svg
                    viewBox="0 0 8 8"
                    className="h-2 w-2 stroke-black/60 opacity-0 transition group-hover:opacity-80"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  >
                    <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" />
                    <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
                  </svg>
                </button>
                <button
                  className="pywebview-no-drag relative flex h-3 w-3 cursor-default items-center justify-center rounded-full bg-[#febc2e] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition group-hover:brightness-95"
                  onClick={() => handleWindowAction("minimize")}
                  type="button"
                  aria-label="Minimize"
                >
                  <svg
                    viewBox="0 0 8 8"
                    className="h-2 w-2 stroke-black/60 opacity-0 transition group-hover:opacity-80"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  >
                    <line x1="1.5" y1="4" x2="6.5" y2="4" />
                  </svg>
                </button>
                <button
                  className="pywebview-no-drag relative flex h-3 w-3 cursor-default items-center justify-center rounded-full bg-[#28c840] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition group-hover:brightness-95"
                  onClick={() => handleWindowAction(isAltPressed ? "zoom" : "fullscreen")}
                  type="button"
                  aria-label="Zoom"
                >
                  {isAltPressed ? (
                    <svg
                      viewBox="0 0 8 8"
                      className="h-2 w-2 stroke-black/70 opacity-0 transition group-hover:opacity-90"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    >
                      <line x1="1.5" y1="4" x2="6.5" y2="4" />
                      <line x1="4" y1="1.5" x2="4" y2="6.5" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 8 8"
                      className="h-2 w-2 rotate-180 stroke-black/70 opacity-0 transition group-hover:opacity-90"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    >
                      <path d="M4.6 1.5 H6.5 V3.4" />
                      <path d="M3.4 6.5 H1.5 V4.6" />
                    </svg>
                  )}
                </button>
              </div>
            ) : null}
            {!isHeaderCompact ? (
              <button
                className="pywebview-no-drag inline-flex h-7 items-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
                onClick={handleOpenModal}
                type="button"
                aria-label="Open"
                title="Open"
              >
                <AppIcon name="folderOpen" className="text-[11px]" />
                Open
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="text-[11px] font-semibold text-slate-200">X-Caption</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            {isHeaderCompact ? (
              <button
                ref={headerMenuButtonRef}
                className="pywebview-no-drag inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-700 bg-[#151515] px-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsHeaderMenuOpen((prev) => !prev);
                }}
                type="button"
                aria-label="Menu"
                title="Menu"
              >
                <AppIcon name="bars" className="text-[11px]" />
                Menu
              </button>
            ) : (
              <>
                <button
                  className="pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] text-slate-200/80 transition hover:bg-white/5 hover:text-white"
                  onClick={handleTogglePinned}
                  type="button"
                  aria-label={isPinned ? "Unpin window" : "Pin window"}
                  title={isPinned ? "Unpin window" : "Pin window"}
                >
                  <AppIcon
                    name={isPinned ? "pin" : "pinOff"}
                    className={cn("text-[11px]", !isPinned && "rotate-45 opacity-70")}
                  />
                </button>
                <button
                  className={cn(
                    "pywebview-no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition",
                    isExporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#26262f]"
                  )}
                  onClick={() => setShowExportModal(true)}
                  disabled={isExporting}
                  type="button"
                >
                  <AppIcon name="download" className="text-[10px]" />
                  Export
                </button>
                <button
                  className="pywebview-no-drag inline-flex h-7 items-center justify-center rounded-md bg-gradient-to-r from-[#2563eb] via-[#4338ca] to-[#6d28d9] px-2 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(76,29,149,0.35)] transition hover:brightness-110"
                  onClick={handleJoinWaitlist}
                  type="button"
                >
                  Join the Waitlist
                </button>
                {showCustomWindowControls && !isMac ? (
                  <div className="ml-2 flex items-center gap-1 pl-2">
                    <button
                      className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-[#151515] text-[10px] text-slate-200 hover:border-slate-500"
                      onClick={() => handleWindowAction("minimize")}
                      type="button"
                      aria-label="Minimize"
                      title="Minimize"
                    >
                      <AppIcon name="windowMinimize" className="text-[10px]" />
                    </button>
                    <button
                      className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-[#151515] text-[10px] text-slate-200 hover:border-slate-500"
                      onClick={() => handleWindowAction("zoom")}
                      type="button"
                      aria-label="Zoom"
                      title="Zoom"
                    >
                      <AppIcon name="windowMaximize" className="text-[9px]" />
                    </button>
                    <button
                      className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-[#151515] text-[10px] text-slate-200 hover:border-slate-500"
                      onClick={() => handleWindowAction("close")}
                      type="button"
                      aria-label="Close"
                      title="Close"
                    >
                      <AppIcon name="times" className="text-[10px]" />
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
          {isHeaderCompact && isHeaderMenuOpen ? (
            <div
              ref={headerMenuRef}
              className="pywebview-no-drag absolute right-3 top-10 z-[130] min-w-[190px] overflow-hidden rounded-lg border border-slate-800/40 bg-[#151515] text-[11px] text-slate-200 shadow-xl"
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                onClick={() => {
                  setIsHeaderMenuOpen(false);
                  handleOpenModal();
                }}
                type="button"
              >
                <AppIcon name="folderOpen" />
                Open
              </button>
              <button
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left",
                  isExporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#1b1b22]"
                )}
                onClick={() => {
                  if (isExporting) return;
                  setIsHeaderMenuOpen(false);
                  setShowExportModal(true);
                }}
                disabled={isExporting}
                type="button"
              >
                <AppIcon name="download" />
                Export
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                onClick={() => {
                  setIsHeaderMenuOpen(false);
                  handleJoinWaitlist();
                }}
                type="button"
              >
                <AppIcon name="users" />
                Join the Waitlist
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                onClick={() => {
                  setIsHeaderMenuOpen(false);
                  handleTogglePinned();
                }}
                type="button"
              >
                <AppIcon name={isPinned ? "pin" : "pinOff"} className={cn(!isPinned && "rotate-45 opacity-70")} />
                {isPinned ? "Unpin Window" : "Pin Window"}
              </button>
              {showCustomWindowControls && !isMac ? (
                <>
                  <div className="h-px bg-slate-800/60" />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      handleWindowAction("minimize");
                    }}
                    type="button"
                  >
                    <AppIcon name="windowMinimize" />
                    Minimize
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      handleWindowAction("zoom");
                    }}
                    type="button"
                  >
                    <AppIcon name="windowMaximize" />
                    Zoom
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                    onClick={() => {
                      setIsHeaderMenuOpen(false);
                      handleWindowAction("close");
                    }}
                    type="button"
                  >
                    <AppIcon name="times" />
                    Close
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className={cn(layoutClass, "flex-1")}>
          {/* Left */}
          {!isCompact ? (
            <aside className="row-start-1 row-end-2 flex min-h-0 flex-col bg-[#0b0b0b]">
              {leftPanelContent}
            </aside>
          ) : null}

          {/* Middle */}
          <section className="row-start-1 row-end-2 flex min-h-0 flex-col bg-[#0b0b0b]">
            <div className={cn(dragRegionClass, "flex shrink-0 items-center justify-between px-4 py-2 text-xs text-slate-400")}>
              <div className="flex items-center gap-2">
                {isCompact ? (
                  <button
                    className="pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/20 bg-[#151515] text-[10px] text-slate-300 hover:border-slate-600"
                    onClick={() => setIsLeftDrawerOpen(true)}
                    type="button"
                    aria-label="Menu"
                    title="Menu"
                  >
                    <AppIcon name="bars" />
                  </button>
                ) : null}
              </div>
              {isCompact ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      className={cn(
                        "pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/20 text-[10px]",
                        compactTab === "player" ? "bg-primary text-white" : "bg-[#151515] text-slate-300 hover:border-slate-600"
                      )}
                      onClick={() => setCompactTab("player")}
                      type="button"
                      aria-label="Video"
                      title="Video"
                    >
                      <AppIcon name="video" />
                    </button>
                    <button
                      className={cn(
                        "pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/20 text-[10px]",
                        compactTab === "captions" ? "bg-primary text-white" : "bg-[#151515] text-slate-300 hover:border-slate-600"
                      )}
                      onClick={() => setCompactTab("captions")}
                      type="button"
                      aria-label="Captions"
                      title="Captions"
                    >
                      <AppIcon name="captions" />
                    </button>
                  </div>
                  {compactTab === "captions" && segments.length > 0 ? (
                    <button
                      className={cn(
                        "pywebview-no-drag inline-flex items-center gap-2 text-[10px] font-medium transition",
                        isTranscriptEdit ? "text-slate-200" : "text-slate-500"
                      )}
                      onClick={() => setIsTranscriptEdit((prev) => !prev)}
                      type="button"
                    >
                      <AppIcon name="edit" className="text-[11px]" />
                      Edit
                      <span
                        className={cn(
                          "relative inline-flex h-4 w-7 items-center rounded-full border transition",
                          isTranscriptEdit ? "border-slate-500 bg-[#1b1b22]" : "border-slate-700 bg-[#151515]"
                        )}
                      >
                        <span
                          className={cn(
                            "absolute h-3 w-3 rounded-full bg-white transition",
                            isTranscriptEdit ? "translate-x-3" : "translate-x-1"
                          )}
                        />
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
            {isPlayerModalOpen ? null : renderPlayerPanel(false)}
          </section>

          {/* Right */}
          {!isCompact ? (
            <aside className="row-start-1 row-end-2 flex min-h-0 flex-col overflow-hidden bg-[#0b0b0b]">
              <div className={cn(dragRegionClass, "flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200")}>
                <span>Caption</span>
                {segments.length > 0 ? (
                  <button
                    className={cn(
                      "pywebview-no-drag inline-flex items-center gap-2 text-[10px] font-medium transition",
                      isTranscriptEdit ? "text-slate-200" : "text-slate-500"
                    )}
                    onClick={() => setIsTranscriptEdit((prev) => !prev)}
                    type="button"
                  >
                    <AppIcon name="edit" className="text-[11px]" />
                    Edit
                    <span
                      className={cn(
                        "relative inline-flex h-4 w-7 items-center rounded-full border transition",
                        isTranscriptEdit ? "border-slate-500 bg-[#1b1b22]" : "border-slate-700 bg-[#151515]"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute h-3 w-3 rounded-full bg-white transition",
                          isTranscriptEdit ? "translate-x-3" : "translate-x-1"
                        )}
                      />
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 px-3 py-3">
                <div className="min-h-0 h-[calc(100vh-340px)] max-h-[calc(100vh-340px)] overflow-hidden">
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    {showCaptionSetup ? captionSetupPanel : null}
                    <div className="min-h-0 flex-1">
                      <TranscriptPanel
                        mediaRef={transcriptMediaRef}
                        notify={notify}
                        editEnabled={isTranscriptEdit}
                        suppressEmptyState={showCaptionSetup}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          ) : null}

          {/* Bottom */}
          <section
            className={cn(
              "col-span-1 row-start-2 row-end-3 flex flex-col bg-[#0b0b0b]",
              isCompact ? "col-span-1" : "col-span-3"
            )}
          >
            <div className="flex items-center justify-between px-4 py-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                {segments.length > 0 ? (
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
                    onClick={handleClearCaptions}
                    type="button"
                    aria-label="Clear captions"
                    title="Clear captions"
                  >
                    <AppIcon name="trashAlt" className="text-[10px]" />
                    Clear captions
                  </button>
                ) : (
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
                    onClick={handleLoadSrt}
                    type="button"
                    aria-label="Load Caption File"
                    title="Load Caption File"
                  >
                    <AppIcon name="fileImport" className="text-[10px]" />
                    Load Caption File
                  </button>
                )}
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[14px] font-bold text-slate-200 transition hover:bg-white/10"
                  onClick={handleToggleChineseVariant}
                  type="button"
                  aria-label="Chinese variant"
                  title="Chinese variant"
                >
                  {exportLanguage === "traditional" ? "繁" : "簡"}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-bold text-slate-200 transition hover:bg-white/10"
                    onClick={() => setSubtitleScale((v) => Math.max(0.8, Number((v - 0.15).toFixed(2))))}
                    type="button"
                    aria-label="Decrease subtitle size"
                    title="Decrease subtitle size"
                  >
                    T-
                  </button>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-bold text-slate-200 transition hover:bg-white/10"
                    onClick={() => setSubtitleScale((v) => Math.min(2.4, Number((v + 0.15).toFixed(2))))}
                    type="button"
                    aria-label="Increase subtitle size"
                    title="Increase subtitle size"
                  >
                    T+
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Zoom</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={timelineZoom}
                  onChange={(event) => setTimelineZoom(Number(event.target.value))}
                  className="h-1 w-28"
                />
              </div>
            </div>

            <div className="flex overflow-hidden">
              <div className="flex w-full min-h-0 gap-2 pl-2">
                <div className="flex w-8 flex-shrink-0 flex-col text-[11px] text-slate-400">
                  <div className="flex h-10 items-center justify-center text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    ▦
                  </div>
                  <div className="mt-2 flex h-10 items-center justify-center">
                    <AppIcon name="captions" className="text-[12px] text-slate-200" />
                  </div>
                </div>
                <div
                  className="flex min-h-0 flex-1 overflow-x-scroll overflow-y-hidden stt-scrollbar"
                  ref={timelineScrollRef}
                  onScroll={handleTimelineScroll}
                  style={{
                    scrollbarGutter: "stable both-edges",
                    paddingRight: `${TIMELINE_RIGHT_PADDING_PX}px`
                  }}
                  onWheel={handleTimelineWheel}
                >
                  <div
                    className="min-w-full pb-3"
                    style={{ width: `${timelineScrollWidth}px` }}
                  >
                    <div className="relative">
                      <div
                        className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-primary"
                        style={{ left: `${playheadLeftPx}px` }}
                      >
                        <div className="absolute left-1/2 top-1 h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[6px] border-transparent border-t-primary" />
                      </div>
                      <div
                        className="relative z-10 h-10 bg-[#0b0b0b] text-[10px] text-slate-500"
                        style={{ width: `${timelineWidth}px` }}
                        onPointerDown={onTrackPointerDown}
                        onPointerMove={onTrackPointerMove}
                        onPointerUp={onTrackPointerUp}
                      >
                        {ticks.map((tick, idx) => {
                          const left = Math.max(0, tick * pxPerSec);
                          const isFirst = idx === 0;
                          const isLast = idx === ticks.length - 1;
                          const translateClass = isFirst
                            ? "translate-x-0"
                            : isLast
                              ? "-translate-x-full"
                              : "-translate-x-1/2";
                          return (
                            <span
                              key={`tick-${idx}`}
                              className={cn("absolute top-1 cursor-ew-resize", translateClass)}
                              style={{ left: `${left}px` }}
                            >
                              {formatTime(Math.max(0, tick))}
                            </span>
                          );
                        })}
                      </div>
                      <div className="relative mt-2 space-y-1 pb-1" style={{ width: `${timelineWidth}px` }}>
                        <div
                          className="absolute -top-3 left-0 right-0 h-5 cursor-ew-resize"
                          onPointerDown={onTrackPointerDown}
                          onPointerMove={onTrackPointerMove}
                          onPointerUp={onTrackPointerUp}
                        />

                        <div
                          className="relative h-10 overflow-hidden rounded-md bg-transparent"
                          style={{ width: `${timelineWidth}px` }}
                          ref={timelineTrackRef}
                          onPointerDown={onTrackPointerDown}
                          onPointerMove={onTrackPointerMove}
                          onPointerUp={onTrackPointerUp}
                          onMouseMove={handleCaptionHoverMove}
                          onMouseLeave={() => setCaptionHover(null)}
                        >
                          {timelineSegmentEls}
                          {captionHover ? (
                            <div
                              className="pointer-events-none absolute top-0 flex h-full items-center justify-center rounded-lg border border-dashed border-slate-500/40 bg-white/5 text-[10px] text-slate-200"
                              style={{
                                left: `${Math.max(0, captionHover.start * pxPerSec)}px`,
                                width: `${Math.max(2, (captionHover.end - captionHover.start) * pxPerSec)}px`
                              }}
                            >
                              <button
                                className="pointer-events-auto text-[12px] font-semibold text-white/90"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleAddCaption(captionHover.start, captionHover.end);
                                  setCaptionHover(null);
                                }}
                                type="button"
                              >
                                +
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                </div>
              </div>
            </div>
          </div>
          </section>
        </div>
      </div>

      {isCompact ? (
        <>
          <div
            className={cn(
              "fixed inset-0 z-[110] bg-black/60 transition-opacity",
              isLeftDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            onClick={() => setIsLeftDrawerOpen(false)}
          />
          <div
            className={cn(
              "fixed left-0 top-0 z-[111] flex h-full w-[280px] flex-col bg-[#0b0b0b] shadow-2xl transition-transform",
              isLeftDrawerOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            {leftPanelContent}
          </div>
        </>
      ) : null}

      {isPlayerModalOpen ? (
        <div className="fixed inset-0 z-[140] flex flex-col bg-[#0b0b0b]">
          <div {...getHeaderDragProps("flex items-center justify-between border-b border-slate-800/60 px-4 py-3")}>
            <div className="text-xs font-semibold text-slate-200">Player Focus</div>
            <button
              className="pywebview-no-drag inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-700 bg-[#151515] px-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
              onClick={() => setIsPlayerModalOpen(false)}
              type="button"
            >
              <AppIcon name="times" className="text-[10px]" />
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex min-h-0 flex-1">{renderPlayerPanel(true)}</div>
            <aside className="flex min-h-0 w-full flex-col border-t border-slate-800/60 bg-[#0b0b0b] lg:w-[380px] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200">
                <span>Caption</span>
                {segments.length > 0 ? (
                  <button
                    className={cn(
                      "pywebview-no-drag inline-flex items-center gap-2 text-[10px] font-medium transition",
                      isTranscriptEdit ? "text-slate-200" : "text-slate-500"
                    )}
                    onClick={() => setIsTranscriptEdit((prev) => !prev)}
                    type="button"
                  >
                    <AppIcon name="edit" className="text-[11px]" />
                    Edit
                    <span
                      className={cn(
                        "relative inline-flex h-4 w-7 items-center rounded-full border transition",
                        isTranscriptEdit ? "border-slate-500 bg-[#1b1b22]" : "border-slate-700 bg-[#151515]"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute h-3 w-3 rounded-full bg-white transition",
                          isTranscriptEdit ? "translate-x-3" : "translate-x-1"
                        )}
                      />
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 px-3 py-3">
                <div className="flex h-full min-h-0 flex-col gap-3">
                  {showCaptionSetup ? captionSetupPanel : null}
                  <div className="min-h-0 flex-1">
                    <TranscriptPanel
                      mediaRef={transcriptMediaRef}
                      notify={notify}
                      editEnabled={isTranscriptEdit}
                      suppressEmptyState={showCaptionSetup}
                    />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      ) : null}

      {captionMenu && captionMenuPosition ? (
        <div
          className="fixed inset-0 z-[125]"
          onClick={() => setCaptionMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setCaptionMenu(null);
          }}
        >
          <div
            className="absolute w-40 overflow-hidden rounded-lg border border-slate-700/60 bg-[#121212] shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
            style={{ left: `${captionMenuPosition.left}px`, top: `${captionMenuPosition.top}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
              onClick={() => {
                handleDeleteCaption(captionMenu.segment);
                setCaptionMenu(null);
              }}
              type="button"
            >
              Delete caption
            </button>
          </div>
        </div>
      ) : null}

      {alertModal ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setAlertModal(null)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon
                    name={
                      alertModal.tone === "success"
                        ? "checkCircle"
                        : alertModal.tone === "error"
                          ? "exclamationTriangle"
                          : "exclamationCircle"
                    }
                    className="text-[16px]"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{alertModal.title}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{alertModal.message}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md border border-slate-700 bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                  onClick={() => setAlertModal(null)}
                  type="button"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showOpenModal ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Open</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Import a local file or load YouTube media for transcription.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    youtubeImporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#151515]"
                  )}
                  onClick={handleOpenLocalFromModal}
                  type="button"
                  disabled={youtubeImporting}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111827] text-[#60a5fa]">
                      <AppIcon name="folderOpen" className="text-[14px]" />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">Import video / audio</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Choose a local media file to add to the timeline.
                      </p>
                    </div>
                  </div>
                </button>
                <div className={cn("group w-full rounded-xl px-4 py-3 transition", youtubeImporting ? "" : "hover:bg-[#151515]")}>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111827] text-[#ef4444]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="6" width="18" height="12" rx="3" />
                        <path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold text-slate-100">From YouTube</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        We load YouTube media to generate captions.
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={(event) => {
                        setYoutubeUrl(event.target.value);
                        if (youtubeError) {
                          setYoutubeError(null);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          if (!youtubeImporting) {
                            void handleImportYoutube();
                          }
                        }
                      }}
                      placeholder="Paste a YouTube link"
                      className={cn(
                        "w-full flex-1 rounded-md border border-slate-700 bg-[#0b0b0b] px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#3b82f6]/60",
                        youtubeImporting && "cursor-not-allowed opacity-60"
                      )}
                      disabled={youtubeImporting}
                    />
                    <button
                      className="rounded-md bg-white px-3 py-2 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95 disabled:opacity-60"
                      onClick={() => void handleImportYoutube()}
                      type="button"
                      disabled={youtubeImporting || !youtubeUrl.trim()}
                    >
                      {youtubeImporting ? "Importing..." : "Import"}
                    </button>
                  </div>
                  {youtubeError ? (
                    <p className="mt-2 text-[11px] text-rose-400">{youtubeError}</p>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setShowOpenModal(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {youtubeImporting ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#ef4444]">
                  <AppIcon name="youtube" className="text-[16px]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Loading YouTube media</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Preparing your YouTube media. Please wait...
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-slate-700/70 bg-[#0b0b0b] px-3 py-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-4 w-4 items-center justify-center">
                    <svg
                      className="h-4 w-4 animate-spin text-slate-300"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  </span>
                  Loading YouTube media...
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1b1b22]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#ef4444] via-[#f97316] to-[#facc15] transition-all"
                    style={{ width: `${Math.max(4, Math.min(100, youtubeProgress ?? 12))}%` }}
                  />
                </div>
                <div className="mt-2 text-right text-[10px] font-semibold text-slate-300">
                  {youtubeProgress !== null ? `${youtubeProgress}%` : "Loading..."}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showExportModal ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Export</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Choose a format to export your captions.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    canExportCaptions ? "hover:bg-[#151515]" : "cursor-not-allowed opacity-50"
                  )}
                  onClick={() => {
                    if (!canExportCaptions) return;
                    setShowExportModal(false);
                    void handleExportSrt();
                  }}
                  disabled={!canExportCaptions}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111827] text-[#60a5fa]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="3" y="4.5" width="18" height="11" rx="2" />
                        <path d="M7 9.5h10" />
                        <path d="M7 12.5h6" />
                        <path d="M8 18.5h8" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">Standard SRT</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Best for video editors and media players.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    canExportCaptions ? "hover:bg-[#151515]" : "cursor-not-allowed opacity-50"
                  )}
                  onClick={() => {
                    if (!canExportCaptions) return;
                    setShowExportModal(false);
                    void handleExportTranscript();
                  }}
                  disabled={!canExportCaptions}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#111827] text-[#f59e0b]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 3.5h7l4 4v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z" />
                        <path d="M14 3.5v4h4" />
                        <path d="M9 12.5h6" />
                        <path d="M9 15.5h6" />
                        <path d="M9 18.5h4" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">Plain Text</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        A clean transcript without timestamps.
                      </p>
                    </div>
                  </div>
                </button>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setShowExportModal(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modelDownloadActive ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon
                    name={modelDownload.status === "error" ? "exclamationTriangle" : "download"}
                    className="text-[16px]"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100">{modelDownloadTitle}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{modelDownload.message}</p>
                </div>
              </div>

              {modelDownload.status !== "error" ? (
                <div className="mt-4 space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#1f2937]">
                    {modelDownload.progress !== null ? (
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(2, Math.min(100, modelDownload.progress))}%` }}
                      />
                    ) : (
                      <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{modelDownload.progress !== null ? `${modelDownload.progress}%` : "Preparing..."}</span>
                    <span>{modelProgressText ?? ""}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2 text-[11px] text-slate-400">
                  {modelDownload.detail ? <p>{modelDownload.detail}</p> : null}
                  {modelDownload.downloadUrl ? (
                    <p>
                      Download URL:
                      <span className="ml-1 break-all text-slate-200">{modelDownload.downloadUrl}</span>
                    </p>
                  ) : null}
                  {modelDownload.expectedPath ? (
                    <p>
                      Save the model to:
                      <span className="ml-1 break-all text-slate-200">{modelDownload.expectedPath}</span>
                    </p>
                  ) : null}
                </div>
              )}

              {modelDownload.status === "error" ? (
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    className="rounded-md border border-slate-700 bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                    onClick={clearModelDownload}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                    onClick={handleRetryModelDownload}
                    type="button"
                  >
                    Retry Download
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon name="exclamationTriangle" className="text-[16px]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Open media to generate captions</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Open a video or audio file first, then run AI captions.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setShowImportModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                  onClick={() => {
                    setShowImportModal(false);
                    handleOpenModal();
                  }}
                  type="button"
                >
                  Open Media
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={srtInputRef}
        type="file"
        accept=".srt,application/x-subrip,text/plain"
        className="hidden"
        onChange={() => {
          const file = srtInputRef.current?.files?.[0];
          if (file) {
            void handleSrtSelected(file);
          }
          if (srtInputRef.current) {
            srtInputRef.current.value = "";
          }
        }}
      />
      <audio ref={audioRef} preload="auto" src={audioPreviewSrc || undefined} className="sr-only" />

    </>
  );
}

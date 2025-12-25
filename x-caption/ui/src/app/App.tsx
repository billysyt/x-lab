import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { setActiveTab, setVersion } from "../features/ui/uiSlice";
import { setChineseStyle, setLanguage } from "../features/settings/settingsSlice";
import { setExportLanguage } from "../features/transcript/transcriptSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import { addJob, bootstrapJobs, pollJobUpdates, selectJob, setJobSegments, updateSegmentText } from "../features/jobs/jobsSlice";
import { UploadTab, type UploadTabHandle, type MediaItem } from "../features/upload/components/UploadTab";
import { TranscriptPanel } from "../features/transcript/components/TranscriptPanel";
import type { ToastType } from "../shared/components/ToastHost";
import { AppIcon } from "../shared/components/AppIcon";
import { Select } from "../shared/components/Select";
import { cn } from "../shared/lib/cn";
import { fileFromBase64 } from "../shared/lib/file";
import {
  apiConvertChinese,
  apiEditSegment,
  apiGetJobRecord,
  apiGetWhisperModelDownload,
  apiGetWhisperModelStatus,
  apiStartWhisperModelDownload,
  apiUpsertJobRecord
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
  const activeTab = useAppSelector((s) => s.app.activeTab);
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
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
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
  const [subtitleScale, setSubtitleScale] = useState(1);
  const [subtitleEditor, setSubtitleEditor] = useState<{ segmentId: number; text: string } | null>(null);
  const [subtitleDraft, setSubtitleDraft] = useState("");
  const [subtitlePosition, setSubtitlePosition] = useState({ x: 0.5, y: 0.85 });
  const [subtitleMaxWidth, setSubtitleMaxWidth] = useState(520);
  const [subtitleBoxSize, setSubtitleBoxSize] = useState({ width: 0, height: 0 });
  const [subtitleEditSize, setSubtitleEditSize] = useState<{ width: number; height: number } | null>(null);
  const subtitleBoxRef = useRef<HTMLDivElement | null>(null);
  const subtitleMeasureRef = useRef<HTMLSpanElement | null>(null);
  const subtitleUiSaveRef = useRef<number | null>(null);
  const subtitleUiLoadRef = useRef<string | null>(null);
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
    playbackRef.current = playback;
  }, [playback]);

  useEffect(() => {
    previewPosterRef.current = previewPoster;
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
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubStateRef = useRef<{ pointerId: number } | null>(null);
  const playerScrubRef = useRef<{ wasPlaying: boolean } | null>(null);
  const mediaRafActiveRef = useRef(false);
  const pendingSwapRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const isGapPlaybackRef = useRef(false);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);
  const dragRegionClass = useCustomDrag ? "stt-drag-region" : "pywebview-drag-region";

  useEffect(() => {
    if (!isHeaderCompact) {
      setIsHeaderMenuOpen(false);
    }
  }, [isHeaderCompact]);

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
        return status !== "completed" && status !== "failed" && status !== "cancelled";
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
    selectedJob?.result?.segments ||
    selectedJob?.partialResult?.segments ||
    selectedJob?.streamingSegments ||
    [];
  const displaySegments = useMemo(
    () =>
      segments.filter((segment: any) => {
        const rawText = String(segment?.originalText ?? segment?.text ?? "");
        return !isBlankAudioText(rawText);
      }),
    [segments]
  );
  const exportSegments = useMemo(
    () =>
      deriveJobSegments(selectedJob).filter((segment) => {
        const rawText = String(segment?.originalText ?? segment?.text ?? "");
        return !isBlankAudioText(rawText);
      }),
    [selectedJob]
  );
  const openCcConverter = useMemo(() => safeOpenCcConverter(exportLanguage), [exportLanguage]);
  const currentSubtitleMatch = useMemo(() => {
    if (!displaySegments.length) return null;
    const time = playback.currentTime;
    const match = displaySegments.find((segment: any) => {
      const start = Number(segment.start ?? 0);
      const end = Number(segment.end ?? 0);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      return time >= start && time <= end;
    });
    if (!match) return null;
    const rawText = match.originalText ?? match.text ?? "";
    let text = rawText;
    if (openCcConverter) {
      try {
        text = openCcConverter(rawText);
      } catch {
        text = rawText;
      }
    }
    return { segment: match, text: text.trim() };
  }, [displaySegments, openCcConverter, playback.currentTime]);
  const currentSubtitle = currentSubtitleMatch?.text ?? "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const updateMaxWidth = () => {
      const rect = previewContainerRef.current?.getBoundingClientRect();
      if (rect) {
        setSubtitleMaxWidth(Math.max(200, rect.width * 0.9));
      }
    };
    updateMaxWidth();
    window.addEventListener("resize", updateMaxWidth);
    return () => window.removeEventListener("resize", updateMaxWidth);
  }, []);

  useEffect(() => {
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
  }, [currentSubtitle, subtitleDraft, subtitleEditor, subtitleEditSize, subtitleMaxWidth, subtitleScale]);

  const scheduleSubtitleUiSave = useCallback(() => {
    if (!selectedJobId) return;
    if (subtitleUiSaveRef.current) {
      window.clearTimeout(subtitleUiSaveRef.current);
    }
    const size = subtitleEditSize ?? subtitleBoxSize;
    const payload = {
      job_id: selectedJobId,
      ui_state: {
        subtitle: {
          position: subtitlePosition,
          size,
          scale: subtitleScale
        }
      }
    };
    subtitleUiSaveRef.current = window.setTimeout(() => {
      void apiUpsertJobRecord(payload).catch(() => undefined);
    }, 400);
  }, [selectedJobId, subtitleBoxSize, subtitleEditSize, subtitlePosition, subtitleScale]);

  useEffect(() => {
    if (!subtitleEditor) return;
    const el = subtitleBoxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const rect = entry?.contentRect;
      if (!rect) return;
      setSubtitleEditSize({ width: rect.width, height: rect.height });
      scheduleSubtitleUiSave();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [scheduleSubtitleUiSave, subtitleEditor]);

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
  }, [subtitleBoxSize.width, subtitleBoxSize.height, subtitlePosition.x, subtitlePosition.y]);

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
        const uiState = record?.ui_state?.subtitle;
        if (!uiState) {
          setSubtitlePosition({ x: 0.5, y: 0.85 });
          setSubtitleEditSize(null);
          setSubtitleScale(1);
          return;
        }
        if (uiState.position) {
          setSubtitlePosition({
            x: Number(uiState.position.x) || 0.5,
            y: Number(uiState.position.y) || 0.85
          });
        }
        if (uiState.size) {
          const width = Number(uiState.size.width) || subtitleBoxSize.width;
          const height = Number(uiState.size.height) || subtitleBoxSize.height;
          if (width && height) {
            setSubtitleEditSize({ width, height });
          }
        }
        if (uiState.scale) {
          const nextScale = Number(uiState.scale);
          if (Number.isFinite(nextScale)) {
            setSubtitleScale(clamp(nextScale, 0.6, 2));
          }
        }
      })
      .catch(() => undefined);
  }, [selectedJobId, subtitleBoxSize.height, subtitleBoxSize.width]);

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

  const handleExportVideo = useCallback(async () => {
    if (!activeMedia || activeMedia.kind !== "video" || !activeMedia.file) {
      notify("No local video available to export.", "info");
      return;
    }
    setIsExporting(true);
    try {
      const file = activeMedia.file;
      const url = URL.createObjectURL(file);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.name || `${baseFilename(selectedJob?.filename)}.mp4`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      notify("Video export started.", "success");
    } finally {
      setIsExporting(false);
    }
  }, [activeMedia, notify, selectedJob?.filename]);

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
    dispatch(setActiveTab("media"));
    if (isCompact) {
      setIsLeftDrawerOpen(true);
    }
    uploadRef.current?.openFilePicker?.();
  }, [dispatch, isCompact]);

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

  const getActiveVideoEl = useCallback(() => {
    return activeVideoSlot === 0 ? videoRefA.current : videoRefB.current;
  }, [activeVideoSlot]);

  const getInactiveVideoEl = useCallback(() => {
    return activeVideoSlot === 0 ? videoRefB.current : videoRefA.current;
  }, [activeVideoSlot]);

  const getActiveMediaEl = useCallback(() => {
    return activeMedia?.kind === "video" ? getActiveVideoEl() : audioRef.current;
  }, [activeMedia, getActiveVideoEl]);

  const cyclePlaybackRate = useCallback(() => {
    setPlaybackRate((prev) => {
      const next = prev < 1.25 ? 1.5 : prev < 1.75 ? 2 : 1;
      applyPlaybackRate(getActiveMediaEl(), next);
      if (activeMedia?.kind === "video") {
        applyPlaybackRate(getInactiveVideoEl(), next);
      }
      return next;
    });
  }, [activeMedia?.kind, applyPlaybackRate, getActiveMediaEl, getInactiveVideoEl]);

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
        dispatch(setActiveTab("captions"));
        const mergedText = parsed.map((segment) => segment.text || "").join(" ").trim();
        void apiUpsertJobRecord({
          job_id: jobId,
          filename,
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
      notify("Open a media file first.", "info");
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
  const canExportVideo = Boolean(activeMedia?.kind === "video" && activeMedia.file);

  const handleWindowAction = useCallback((action: "close" | "minimize" | "zoom" | "fullscreen") => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    if (!api) return;
    const map: Record<typeof action, string[]> = {
      close: ["window_close", "windowClose", "closeWindow"],
      minimize: ["window_minimize", "windowMinimize", "minimizeWindow"],
      zoom: ["window_toggle_maximize", "windowToggleMaximize", "window_zoom", "windowZoom"],
      fullscreen: ["window_toggle_fullscreen", "windowToggleFullscreen", "toggleFullscreen"]
    };
    for (const method of map[action]) {
      if (typeof api[method] === "function") {
        void api[method]();
        break;
      }
    }
  }, []);



  const transcriptMediaRef =
    activeMedia?.kind === "video"
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
            nextEntry.media.kind === "video" &&
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
      activeMedia?.kind,
      applyPlaybackRate,
      clipById,
      clipTimeline,
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
    const onPlay = () => setPlayback((prev) => ({ ...prev, isPlaying: true }));
    const onPause = () => {
      if (isGapPlaybackRef.current) return;
      setPlayback((prev) => ({ ...prev, isPlaying: false }));
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
  }, [activeClipId, advanceFromClip, clipById, clipTimeline, getActiveMediaEl, applyPlaybackRate, safePlay]);

  useEffect(() => {
    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    applyPlaybackRate(mediaEl);
  }, [getActiveMediaEl, applyPlaybackRate, activeMedia?.id, activeMedia?.kind]);

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
  const activeVideoSrc = resolvedPreviewUrl && activeMedia?.kind === "video" ? resolvedPreviewUrl : null;
  const audioPreviewSrc = activeMedia?.kind === "audio" ? resolvedPreviewUrl : null;
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
    if (nextClip.media.kind !== "video") return null;
    if (activeMedia?.id === nextClip.media.id) return null;
    return {
      url: nextClip.media.previewUrl ?? null,
      trimStartSec: nextClip.trimStartSec
    };
  }, [activeMedia?.id, nextClip]);

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
    if (activeMedia?.kind === "video" && audioRef.current) {
      try {
        audioRef.current.pause();
      } catch {
        // Ignore.
      }
    }
    if (activeMedia?.kind === "audio") {
      [videoRefA.current, videoRefB.current].forEach((video) => {
        if (!video) return;
        try {
          video.pause();
        } catch {
          // Ignore.
        }
      });
    }
  }, [activeMedia?.id, activeMedia?.kind]);

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
    const boxRect = subtitleBoxRef.current?.getBoundingClientRect();
    if (boxRect) {
      const isSingleLine = !baseText.includes("\n");
      let width = boxRect.width;
      if (isSingleLine) {
        const available = Math.max(0, subtitleMaxWidth - width);
        width = width + Math.min(80, available);
      }
      setSubtitleEditSize({ width, height: boxRect.height });
    }
    setSubtitleDraft(baseText);
    setSubtitleEditor({ segmentId: currentSubtitleMatch.segment.id, text: baseText });
  }, [currentSubtitleMatch, getActiveMediaEl, subtitleMaxWidth]);

  const handleSaveSubtitleEdit = useCallback(async () => {
    if (!subtitleEditor || !selectedJobId) {
      setSubtitleEditor(null);
      return;
    }
    const newText = subtitleDraft.trim();
    if (!newText || newText === subtitleEditor.text.trim()) {
      setSubtitleEditor(null);
      return;
    }
    try {
      await apiEditSegment({ jobId: selectedJobId, segmentId: subtitleEditor.segmentId, newText });
      dispatch(updateSegmentText({ jobId: selectedJobId, segmentId: subtitleEditor.segmentId, newText }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(`Failed to save changes: ${message}`, "error");
    } finally {
      setSubtitleEditor(null);
    }
  }, [dispatch, notify, selectedJobId, subtitleDraft, subtitleEditor]);

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
        originX: subtitlePosition.x,
        originY: subtitlePosition.y,
        moved: false,
        container,
        box,
        allowEdit: !subtitleEditor
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [currentSubtitle, subtitleEditor, subtitlePosition.x, subtitlePosition.y]
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
    setSubtitlePosition({ x: clampedX, y: clampedY });
  }, []);

  const handleSubtitlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = subtitleDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    subtitleDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Ignore.
    }
    if (drag.moved) {
      scheduleSubtitleUiSave();
    }
    if (drag.allowEdit && !drag.moved) {
      handleOpenSubtitleEditor();
    }
  }, [handleOpenSubtitleEditor, scheduleSubtitleUiSave]);


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

  const handleScrub = (value: number) => {
    if (!Number.isFinite(duration) || duration <= 0) return;
    const scrubState = playerScrubRef.current;
    const wasPlaying = scrubState?.wasPlaying ?? playback.isPlaying;
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
        setActiveClipId(null);
        setActiveMedia(null);
        pendingSeekRef.current = null;
        pendingPlayRef.current = shouldResume;
        setPlayback((prev) => ({ ...prev, currentTime: value, isPlaying: shouldResume }));
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
      setPlayback((prev) => ({ ...prev, currentTime: value, isPlaying: prev.isPlaying }));
      return;
    }

    const mediaEl = getActiveMediaEl();
    if (!mediaEl) return;
    mediaEl.currentTime = value;
  };

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
  const minSegmentSec = 10;
  const maxSegmentSec = 600;
  const zoomT = clamp((timelineZoom - minZoom) / Math.max(0.001, maxZoom - minZoom), 0, 1);
  const segmentSec = maxSegmentSec - zoomT * (maxSegmentSec - minSegmentSec);
  const visibleDuration = segmentSec * (tickCount - 1);
  const pxPerSec = timelineViewportWidth > 0
    ? timelineViewportWidth / Math.max(visibleDuration, MIN_CLIP_DURATION_SEC)
    : BASE_PX_PER_SEC * timelineZoom;
  const timelineWidth = Math.max(timelineViewportWidth, duration * pxPerSec);
  const timelineScrollWidth = timelineWidth;
  const playheadLeftPx = duration > 0 ? Math.min(timelineWidth, playback.currentTime * pxPerSec) : 0;
  const playheadPct = duration > 0 ? Math.min(100, (playback.currentTime / duration) * 100) : 0;
  const viewStartSec = timelineScrollLeft / Math.max(pxPerSec, 0.001);
  const firstTickSec = Math.floor(viewStartSec / segmentSec) * segmentSec;
  const ticks = Array.from({ length: tickCount }, (_, idx) => firstTickSec + idx * segmentSec);
  const segmentPx = segmentSec * pxPerSec;
  const faintGridStyle = {
    backgroundImage: "linear-gradient(to right, rgba(15,23,42,0.3) 1px, transparent 1px)",
    backgroundSize: `${segmentPx}px 100%`
  };

  const seekFromPointer = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const track = timelineTrackRef.current;
      const scrollEl = timelineScrollRef.current;
      if (!track || !scrollEl || duration <= 0) return;
      const rect = track.getBoundingClientRect();
      const x = Math.max(0, event.clientX - rect.left);
      const time = clamp((scrollEl.scrollLeft + x) / Math.max(pxPerSec, 0.001), 0, duration);
      handleScrub(time);
    },
    [duration, handleScrub, pxPerSec]
  );

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-clip-id]")) return;
    scrubStateRef.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    startPlayerScrub();
    seekFromPointer(event);
  };

  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubStateRef.current) return;
    seekFromPointer(event);
  };

  const onTrackPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubStateRef.current) return;
    scrubStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    endPlayerScrub();
  };

  const toggleFullscreen = () => {
    const doc = document as Document & { exitFullscreen?: () => Promise<void> };
    if (document.fullscreenElement) {
      void doc.exitFullscreen?.();
      return;
    }
    const videoEl = activeMedia?.kind === "video" ? getActiveVideoEl() : null;
    const target = videoEl ?? previewContainerRef.current;
    if (!target || !target.requestFullscreen) return;
    try {
      void target.requestFullscreen();
    } catch {
      // Ignore.
    }
  };

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
  }, []);

  useEffect(() => {
    const el = timelineScrollRef.current;
    if (!el) return;
    const maxScroll = Math.max(0, timelineWidth - el.clientWidth);
    if (el.scrollLeft > maxScroll) {
      el.scrollLeft = maxScroll;
    }
  }, [timelineWidth, timelineViewportWidth]);

  const handleTimelineWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
      if (maxScroll <= 0) return;
      const next = clamp(el.scrollLeft + event.deltaY, 0, maxScroll);
      el.scrollLeft = next;
    }
  }, []);

  const layoutClass = isCompact
    ? "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]"
    : "grid min-h-0 overflow-hidden grid-cols-[minmax(160px,240px)_minmax(0,1fr)_minmax(240px,340px)] 2xl:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(280px,380px)] grid-rows-[minmax(0,1fr)_auto]";

  const leftPanelContent = (
    <>
    <div className={cn(dragRegionClass, "flex items-center gap-2 px-4 py-3")}>
        {([
          { id: "media", label: "Media" },
          { id: "captions", label: "Captions" }
        ] as const).map((tab) => (
          <button
            key={tab.id}
            className={cn(
              "pywebview-no-drag rounded-md px-3 py-1 text-xs font-semibold",
              activeTab === tab.id
                ? "bg-slate-700/40 text-white"
                : "text-slate-400 hover:bg-slate-800/60"
            )}
            onClick={() => dispatch(setActiveTab(tab.id))}
            type="button"
          >
            {tab.label}
          </button>
        ))}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 stt-scrollbar">
        <div className={cn(activeTab === "media" ? "block" : "hidden")}>
          <UploadTab
            ref={uploadRef}
            notify={notify}
            localMedia={localMedia}
            onLocalMediaChange={setLocalMedia}
            onAddToTimeline={handleAddToTimeline}
            onRequestFilePicker={handleRequestFilePicker}
          />
        </div>
        <div className={cn(activeTab === "captions" ? "block" : "hidden")}>
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
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
              <div>
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
            </div>
            <div className="pt-2">
              <button
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-md bg-gradient-to-r from-[#2563eb] via-[#4338ca] to-[#6d28d9] px-3 py-2 text-[12px] font-semibold text-white shadow-[0_10px_24px_rgba(76,29,149,0.35)] transition hover:-translate-y-[1px] hover:brightness-110",
                  modelDownload.status === "checking" ||
                    modelDownload.status === "downloading" ||
                    isTranscribing
                    ? "cursor-not-allowed opacity-70 hover:translate-y-0 hover:brightness-100"
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
                {isTranscribing ? "Processing..." : "AI Generate Caption"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      <div className="flex h-full w-full flex-col bg-[#0b0b0b] text-slate-100">
        <div
          className={cn(
            dragRegionClass,
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
                className="pywebview-no-drag inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-700 bg-[#151515] px-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                onClick={handleOpenFiles}
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
                    "pywebview-no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#151515] px-2 text-[11px] font-semibold text-slate-200 transition",
                    isExporting ? "cursor-not-allowed opacity-50" : "hover:border-slate-500"
                  )}
                  onClick={() => setShowExportModal(true)}
                  disabled={isExporting}
                  type="button"
                >
                  <AppIcon name="download" className="text-[10px]" />
                  Export
                </button>
                <button
                  className="pywebview-no-drag inline-flex h-7 items-center justify-center rounded-md bg-gradient-to-r from-[#2563eb] via-[#4338ca] to-[#6d28d9] px-2 text-[11px] font-semibold text-white shadow-[0_10px_24px_rgba(76,29,149,0.35)] transition hover:-translate-y-[1px] hover:brightness-110"
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
                  handleOpenFiles();
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
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-2">
              {isCompact && compactTab === "captions" ? (
                <div className="flex min-h-0 w-full flex-1">
                  <div className="min-h-0 h-[calc(100vh-320px)] max-h-[calc(100vh-320px)] w-full overflow-hidden">
                    <TranscriptPanel mediaRef={transcriptMediaRef} notify={notify} editEnabled={isTranscriptEdit} />
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
                    ref={previewContainerRef}
                  >
                    <div className="relative h-full w-full overflow-hidden rounded-xl bg-black">
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
                              setPreviewPoster(null);
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
                              setPreviewPoster(null);
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
                      ) : activeMedia?.kind === "audio" && resolvedPreviewUrl ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-xs text-slate-500">
                          <AppIcon name="volume" className="text-2xl" />
                          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Audio Preview</span>
                        </div>
                      ) : activeMedia ? (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-slate-500">
                          <AppIcon name={activeMedia.kind === "audio" ? "volume" : "video"} className="text-2xl" />
                          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            {activeMedia.kind === "audio" ? "Audio Preview" : "Preview"}
                          </span>
                          {activeMedia.source === "job" && activeMedia.kind === "video" ? (
                            <span className="text-[10px] text-slate-500">Video preview not available yet</span>
                          ) : null}
                        </div>
                      ) : (
                        <div className="h-full w-full bg-black" />
                      )}
                      {subtitleEditor || currentSubtitle ? (
                        <div
                          ref={subtitleBoxRef}
                          className={cn(
                            "absolute z-10 rounded-md bg-black/70 px-3 py-1 shadow",
                            subtitleEditor
                              ? "cursor-move border border-white/35 resize overflow-hidden"
                              : "cursor-move"
                          )}
                          style={{
                            left: `${subtitlePosition.x * 100}%`,
                            top: `${subtitlePosition.y * 100}%`,
                            transform: "translate(-50%, -50%)",
                            width: (subtitleEditSize ?? subtitleBoxSize).width
                              ? `${(subtitleEditSize ?? subtitleBoxSize).width}px`
                              : undefined,
                            height: (subtitleEditSize ?? subtitleBoxSize).height
                              ? `${(subtitleEditSize ?? subtitleBoxSize).height}px`
                              : undefined,
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
                              style={{ fontSize: `${13 * subtitleScale}px`, lineHeight: "1.2" }}
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
                              className="whitespace-pre-wrap break-words text-[13px] font-medium text-white pointer-events-none"
                              style={{ fontSize: `${13 * subtitleScale}px` }}
                            >
                              {currentSubtitle}
                            </div>
                          )}
                        </div>
                      ) : null}
                      <span
                        ref={subtitleMeasureRef}
                        className="pointer-events-none absolute -z-10 opacity-0 whitespace-pre-wrap break-words"
                        style={{
                          fontSize: `${13 * subtitleScale}px`,
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
                          onChange={(event) => handleScrub(Number(event.target.value))}
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
          </section>

          {/* Right */}
          {!isCompact ? (
            <aside className="row-start-1 row-end-2 flex min-h-0 flex-col overflow-hidden bg-[#0b0b0b]">
              <div className={cn(dragRegionClass, "flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200")}>
                <span>Transcription</span>
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
              </div>
              <div className="min-h-0 flex-1 px-3 py-3">
                <div className="min-h-0 h-[calc(100vh-340px)] max-h-[calc(100vh-340px)] overflow-hidden">
                  <TranscriptPanel mediaRef={transcriptMediaRef} notify={notify} editEnabled={isTranscriptEdit} />
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
                <button
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-700/70 bg-[#151515] px-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                  onClick={handleLoadSrt}
                  type="button"
                  aria-label="Load SRT"
                  title="Load SRT"
                >
                  <AppIcon name="fileImport" className="text-[10px]" />
                  Load SRT
                </button>
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
                    onClick={() => setSubtitleScale((v) => Math.max(0.8, Number((v - 0.1).toFixed(2))))}
                    type="button"
                    aria-label="Decrease subtitle size"
                    title="Decrease subtitle size"
                  >
                    T-
                  </button>
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[12px] font-bold text-slate-200 transition hover:bg-white/10"
                    onClick={() => setSubtitleScale((v) => Math.min(1.6, Number((v + 0.1).toFixed(2))))}
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
                        className="sticky left-0 z-10 flex h-10 items-center justify-between bg-[#0b0b0b] text-[10px] text-slate-500"
                        style={{ width: `${Math.max(1, timelineViewportWidth)}px` }}
                        onPointerDown={onTrackPointerDown}
                        onPointerMove={onTrackPointerMove}
                        onPointerUp={onTrackPointerUp}
                      >
                        {ticks.map((tick, idx) => (
                          <span key={idx} className="cursor-ew-resize">
                            {formatTime(Math.max(0, tick))}
                          </span>
                        ))}
                      </div>
                      <div className="relative mt-2 space-y-1 pb-1" style={{ width: `${timelineWidth}px` }}>
                        <div
                          className="absolute -top-3 left-0 right-0 h-5 cursor-ew-resize"
                          onPointerDown={onTrackPointerDown}
                          onPointerMove={onTrackPointerMove}
                          onPointerUp={onTrackPointerUp}
                        />

                        <div
                          className="relative h-10 overflow-hidden rounded-md border border-slate-800/20 bg-[#151515]"
                          style={{ width: `${timelineWidth}px` }}
                          ref={timelineTrackRef}
                          onPointerDown={onTrackPointerDown}
                          onPointerMove={onTrackPointerMove}
                          onPointerUp={onTrackPointerUp}
                        >
                          <div className="absolute inset-0 bg-[#222228]" style={faintGridStyle} />
                          {displaySegments.map((segment: any) => {
                            const start = Number(segment.start ?? 0);
                            const end = Number(segment.end ?? 0);
                            const width = Math.max(2, (end - start) * pxPerSec);
                            const left = Math.max(0, start * pxPerSec);
                            const rawText = segment.originalText ?? segment.text ?? "";
                            let text = rawText;
                            if (openCcConverter) {
                              try {
                                text = openCcConverter(rawText);
                              } catch {
                                text = rawText;
                              }
                            }
                            return (
                              <div
                                key={`timeline-${segment.id}`}
                                className="absolute top-1 h-6 cursor-grab rounded-md bg-[#151515] px-2 text-[10px] text-slate-200 transition active:cursor-grabbing"
                                style={{ left: `${left}px`, width: `${width}px` }}
                              >
                                <span className="block truncate leading-6">{text}</span>
                              </div>
                            );
                          })}
                          {null}
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
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon name="download" className="text-[16px]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Export</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Choose a format to export.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <button
                  className={cn(
                    "w-full rounded-md border border-slate-700 bg-[#151515] px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition",
                    canExportCaptions ? "hover:border-slate-500" : "cursor-not-allowed opacity-50"
                  )}
                  onClick={() => {
                    if (!canExportCaptions) return;
                    setShowExportModal(false);
                    void handleExportSrt();
                  }}
                  disabled={!canExportCaptions}
                  type="button"
                >
                  Export SRT
                </button>
                <button
                  className={cn(
                    "w-full rounded-md border border-slate-700 bg-[#151515] px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition",
                    canExportCaptions ? "hover:border-slate-500" : "cursor-not-allowed opacity-50"
                  )}
                  onClick={() => {
                    if (!canExportCaptions) return;
                    setShowExportModal(false);
                    void handleExportTranscript();
                  }}
                  disabled={!canExportCaptions}
                  type="button"
                >
                  Export Text
                </button>
                <button
                  className={cn(
                    "w-full rounded-md border border-slate-700 bg-[#151515] px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition",
                    canExportVideo ? "hover:border-slate-500" : "cursor-not-allowed opacity-50"
                  )}
                  onClick={() => {
                    if (!canExportVideo) return;
                    setShowExportModal(false);
                    void handleExportVideo();
                  }}
                  disabled={!canExportVideo}
                  type="button"
                >
                  Export Video
                </button>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md border border-slate-700 bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
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
                  className="rounded-md border border-slate-700 bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                  onClick={() => setShowImportModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                  onClick={() => {
                    setShowImportModal(false);
                    handleOpenFiles();
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

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { setActiveTab, setVersion } from "../features/ui/uiSlice";
import { setChineseStyle, setLanguage } from "../features/settings/settingsSlice";
import { setExportLanguage } from "../features/transcript/transcriptSlice";
import { useAppDispatch, useAppSelector } from "./hooks";
import { bootstrapJobs, pollJobUpdates, selectJob } from "../features/jobs/jobsSlice";
import { UploadTab, type UploadTabHandle, type MediaItem } from "../features/upload/components/UploadTab";
import { TranscriptPanel } from "../features/transcript/components/TranscriptPanel";
import { ToastHost, type Toast, type ToastType } from "../shared/components/ToastHost";
import { AppIcon } from "../shared/components/AppIcon";
import { Select } from "../shared/components/Select";
import { cn } from "../shared/lib/cn";
import { apiConvertChinese } from "../shared/api/sttApi";
import type { ExportLanguage, Job, TranscriptSegment } from "../shared/types";

function formatTime(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<UploadTabHandle>(null);

  const jobsById = useAppSelector((s) => s.jobs.jobsById);
  const jobOrder = useAppSelector((s) => s.jobs.order);
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



  const [toasts, setToasts] = useState<Toast[]>([]);
  const notify = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, type, createdAt: Date.now() }]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);
  const [isExporting, setIsExporting] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);

  const [playback, setPlayback] = useState({
    currentTime: 0,
    duration: 0,
    isPlaying: false
  });
  const playbackRef = useRef(playback);
  const [previewPoster, setPreviewPoster] = useState<string | null>(null);
  const previewPosterRef = useRef<string | null>(null);

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

  const [hasSelection, setHasSelection] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [localMedia, setLocalMedia] = useState<MediaItem[]>([]);
  const [timelineZoom, setTimelineZoom] = useState(DEFAULT_TIMELINE_ZOOM);
  const [isCompact, setIsCompact] = useState(false);
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
  const [isTimelineDragOver, setIsTimelineDragOver] = useState(false);
  const dragPayloadRef = useRef<MediaItem[] | null>(null);
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const pendingPlayRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const scrubStateRef = useRef<{ pointerId: number } | null>(null);
  const playerScrubRef = useRef<{ wasPlaying: boolean } | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackRef = useRef<HTMLDivElement | null>(null);
  const isGapPlaybackRef = useRef(false);
  const timelineDragRef = useRef<{
    clipId: string;
    type: "move" | "resize-left" | "resize-right";
    startX: number;
    startSec: number;
    durationSec: number;
    trimStartSec: number;
    trimEndSec: number;
    baseDurationSec: number;
    pxPerSec: number;
    prevEndSec: number;
    nextStartSec: number;
  } | null>(null);
  const lastAddedClipRef = useRef<string | null>(null);
  const [timelineMenu, setTimelineMenu] = useState<{
    x: number;
    y: number;
    clipId: string;
  } | null>(null);
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(0);

  useEffect(() => {
    if (!timelineMenu) return;
    const close = () => setTimelineMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [timelineMenu]);

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
      setIsCompact(compact);
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

  const getActiveMediaEl = useCallback(() => {
    return activeMedia?.kind === "video" && activeMedia.source === "local" ? videoRef.current : audioRef.current;
  }, [activeMedia]);
  const transcriptMediaRef =
    activeMedia?.kind === "video" && activeMedia.source === "local"
      ? (videoRef as RefObject<HTMLMediaElement>)
      : (audioRef as RefObject<HTMLMediaElement>);

  const segments =
    selectedJob?.result?.segments ||
    selectedJob?.partialResult?.segments ||
    selectedJob?.streamingSegments ||
    [];
  const currentSubtitle = useMemo(() => {
    if (!segments.length) return "";
    const time = playback.currentTime;
    const match = segments.find((segment: any) => {
      const start = Number(segment.start ?? 0);
      const end = Number(segment.end ?? 0);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
      return time >= start && time <= end;
    });
    if (!match) return "";
    const text = match.originalText ?? match.text ?? "";
    const start = Number(match.start ?? 0);
    const end = Number(match.end ?? 0);
    const range = `[${formatTime(start)}-${formatTime(end)}]`;
    return `${range} ${text}`.trim();
  }, [playback.currentTime, segments]);

  const exportSegments = useMemo(() => deriveJobSegments(selectedJob), [selectedJob]);
  const openCcConverter = useMemo(() => safeOpenCcConverter(exportLanguage), [exportLanguage]);
  const waitlistUrl =
    typeof window !== "undefined" && typeof (window as any).__WAITLIST_URL__ === "string"
      ? String((window as any).__WAITLIST_URL__)
      : "";
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
      const win = typeof window !== "undefined" ? (window as any) : null;
      const api = win?.pywebview?.api;

      if (api && (typeof api.saveTranscript === "function" || typeof api.save_transcript === "function")) {
        const saveFn = (api.saveTranscript || api.save_transcript).bind(api);
        try {
          const response = await saveFn(filename, converted.text);
          if (response && response.success) {
            notify("Transcript exported successfully.", "success");
            return;
          }
          if (response && response.cancelled) {
            notify("Export cancelled.", "info");
            return;
          }
        } catch {
          // fall through to browser download
        }
      }

      const blob = new Blob([converted.text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      notify("Transcript exported successfully.", "success");
    } finally {
      setIsExporting(false);
    }
  }, [exportLanguage, exportSegments, notify, openCcConverter, selectedJob?.filename]);

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
        const clipEntry = clipById.get(nextClip.id);
        if (clipEntry) {
          if (activeMedia?.kind === "video" && videoRef.current) {
            try {
              const video = videoRef.current;
              const width = video.videoWidth;
              const height = video.videoHeight;
              if (width > 0 && height > 0) {
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(video, 0, 0, width, height);
                  setPreviewPoster(canvas.toDataURL("image/jpeg", 0.7));
                }
              }
            } catch {
              // Ignore.
            }
          }
          isGapPlaybackRef.current = false;
          setActiveClipId(clipEntry.id);
          setActiveMedia(clipEntry.media);
          pendingSeekRef.current = clipEntry.trimStartSec;
          pendingPlayRef.current = true;
          setPlayback((prev) => ({ ...prev, isPlaying: true }));
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
    [activeMedia?.kind, clipById, clipTimeline, getActiveMediaEl]
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
        void mediaEl.play();
        pendingPlayRef.current = false;
      }
      clearPosterIfReady();
    };
    const onTime = () => {
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
  }, [activeClipId, advanceFromClip, clipById, clipTimeline, getActiveMediaEl]);

  useEffect(() => {
    if (!activeMedia) {
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
    }
  }, [activeClipId, activeMedia, getActiveMediaEl]);

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
    if (activeMedia?.kind === "audio" && videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        // Ignore.
      }
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
  const hasTimelineMedia = timelineClips.length > 0;

  const togglePlayback = () => {
    if (!clipTimeline.length && !activeMedia) {
      return;
    }
    if (clipTimeline.length && !activeClipId) {
      const range = timelineRanges.find(
        (r) => playback.currentTime >= r.startSec && playback.currentTime < r.startSec + r.durationSec
      );
      if (range && range.type === "clip") {
        const target = clipById.get(range.clipId);
        if (target) {
          isGapPlaybackRef.current = false;
          setActiveClipId(target.id);
          setActiveMedia(target.media);
          const offset = Math.max(0, playback.currentTime - target.startSec);
          pendingSeekRef.current = Math.min(target.trimEndSec, target.trimStartSec + offset);
          pendingPlayRef.current = true;
          return;
        }
      }
      isGapPlaybackRef.current = true;
      setPlayback((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
      return;
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
      void mediaEl
        .play()
        .then(() => {
          setPlayback((prev) => ({ ...prev, isPlaying: true }));
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
              void mediaEl.play();
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
          void mediaEl.play();
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
  const baseSegmentSec = 300;
  const segmentSec = baseSegmentSec / Math.max(0.5, timelineZoom);
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
  const gridStyle = {
    backgroundImage: "linear-gradient(to right, rgba(15,23,42,0.45) 1px, transparent 1px)",
    backgroundSize: `${segmentPx}px 100%`
  };
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
    if (timelineDragRef.current) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-clip-id]")) return;
    scrubStateRef.current = { pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
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
  };

  const toggleFullscreen = () => {
    const el = previewContainerRef.current;
    if (!el) return;
    const doc = document as Document & { exitFullscreen?: () => Promise<void> };
    if (document.fullscreenElement) {
      void doc.exitFullscreen?.();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen();
    }
  };

  const splitClipAtPlayhead = useCallback(
    (clipId: string) => {
      const clipEntry = clipById.get(clipId);
      if (!clipEntry) return;
      const splitTime = playback.currentTime;
      const offset = splitTime - clipEntry.startSec;
      if (offset <= 0.5 || offset >= clipEntry.durationSec - 0.5) {
        return;
      }
      const leftId = `${clipId}-a-${Date.now()}`;
      const rightId = `${clipId}-b-${Date.now()}`;
      setTimelineClips((prev) =>
        normalizeClips(
          prev.flatMap((clip) => {
          if (clip.id !== clipId) return [clip];
          const dur1 = offset;
          const dur2 = clip.durationSec - offset;
          const trimStart1 = clip.trimStartSec;
          const trimEnd1 = trimStart1 + dur1;
          const trimStart2 = trimEnd1;
          const trimEnd2 = clip.trimEndSec;
          const left = {
            ...clip,
            id: leftId,
            startSec: clip.startSec,
            durationSec: dur1,
            trimStartSec: trimStart1,
            trimEndSec: trimEnd1
          };
          const right = {
            ...clip,
            id: rightId,
            startSec: clip.startSec + dur1,
            durationSec: dur2,
            trimStartSec: trimStart2,
            trimEndSec: trimEnd2
          };
          return [left, right];
        })
        )
      );
      setActiveClipId(leftId);
      setActiveMedia(clipEntry.media);
    },
    [clipById, playback.currentTime]
  );

  const deleteClip = useCallback((clipId: string) => {
    setTimelineClips((prev) => normalizeClips(prev.filter((clip) => clip.id !== clipId)));
    if (activeClipId === clipId) {
      setActiveClipId(null);
      setActiveMedia(null);
      setPlayback((prev) => ({ ...prev, isPlaying: false }));
    }
  }, [activeClipId]);

  const startClipDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    clipId: string,
    type: "move" | "resize-left" | "resize-right"
  ) => {
    const track = timelineTrackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const clip = timelineClips.find((c) => c.id === clipId);
    if (!clip) return;
    const ordered = [...timelineClips].sort((a, b) => a.startSec - b.startSec);
    const index = ordered.findIndex((c) => c.id === clipId);
    const prevClip = index > 0 ? ordered[index - 1] : null;
    const nextClip = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;
    const pxPerSec = duration > 0 ? rect.width / duration : BASE_PX_PER_SEC * timelineZoom;
    timelineDragRef.current = {
      clipId,
      type,
      startX: event.clientX,
      startSec: clip.startSec,
      durationSec: clip.durationSec,
      trimStartSec: clip.trimStartSec,
      trimEndSec: clip.trimEndSec,
      baseDurationSec: clip.baseDurationSec,
      pxPerSec,
      prevEndSec: prevClip ? prevClip.startSec + prevClip.durationSec : 0,
      nextStartSec: nextClip ? nextClip.startSec : Number.POSITIVE_INFINITY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onClipPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = timelineDragRef.current;
    if (!state) return;
    const dx = event.clientX - state.startX;
    const deltaSec = state.pxPerSec > 0 ? dx / state.pxPerSec : 0;

    setTimelineClips((prev) =>
      prev.map((clip) => {
        if (clip.id !== state.clipId) return clip;
        if (state.type === "move") {
          const rawStart = Math.max(0, state.startSec + deltaSec);
          const startSec = clamp(rawStart, state.prevEndSec, state.nextStartSec - state.durationSec);
          return { ...clip, startSec };
        }
        if (state.type === "resize-left") {
          const minDelta = -Math.min(state.trimStartSec, state.startSec);
          const maxDelta = state.durationSec - MIN_CLIP_DURATION_SEC;
          const clampedDelta = clamp(deltaSec, minDelta, maxDelta);
          const rawStart = state.startSec + clampedDelta;
          const startSec = clamp(rawStart, state.prevEndSec, state.startSec + state.durationSec - MIN_CLIP_DURATION_SEC);
          const appliedDelta = startSec - state.startSec;
          const trimStartSec = state.trimStartSec + appliedDelta;
          const durationSec = state.durationSec - appliedDelta;
          return { ...clip, startSec, durationSec, trimStartSec, trimEndSec: trimStartSec + durationSec };
        }
        const minDelta = -(state.durationSec - MIN_CLIP_DURATION_SEC);
        const maxDelta = Math.max(
          0,
          Math.min(state.baseDurationSec - state.trimEndSec, state.nextStartSec - state.startSec - state.durationSec)
        );
        const clampedDelta = clamp(deltaSec, minDelta, maxDelta);
        const durationSec = state.durationSec + clampedDelta;
        const trimEndSec = state.trimEndSec + clampedDelta;
        return { ...clip, durationSec, trimEndSec };
      })
    );
  };

  const onClipPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (timelineDragRef.current) {
      timelineDragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setTimelineClips((prev) => normalizeClips(prev));
    }
  };

  const handleAddToTimeline = useCallback(
    (items: MediaItem[]) => {
      if (!items.length) return;
      setTimelineClips((prev) => {
        const endOfTimeline = prev.reduce((max, clip) => Math.max(max, clip.startSec + clip.durationSec), 0);
        let cursor = endOfTimeline;
        const newClips = items.map((item) => {
          const base = Number.isFinite(item.durationSec) && item.durationSec ? item.durationSec : 60;
          const clip = {
            id: `${item.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            media: item,
            startSec: cursor,
            baseDurationSec: base,
            durationSec: base,
            trimStartSec: 0,
            trimEndSec: base
          };
          cursor += base;
          return clip;
        });
        lastAddedClipRef.current = newClips[newClips.length - 1]?.id ?? null;
        return normalizeClips([...prev, ...newClips]);
      });
      const last = items[items.length - 1];
      setActiveMedia(last);
      if (lastAddedClipRef.current) {
        setActiveClipId(lastAddedClipRef.current);
      }
      if (last.source === "job" && last.jobId) {
        dispatch(selectJob(last.jobId));
      }
    },
    [dispatch]
  );

  const handleTimelineDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsTimelineDragOver(false);
      const payload = dragPayloadRef.current;
      if (payload && payload.length) {
        handleAddToTimeline(payload);
      }
      dragPayloadRef.current = null;
    },
    [handleAddToTimeline]
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
    ? "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_240px]"
    : "grid min-h-0 overflow-hidden grid-cols-[minmax(160px,240px)_minmax(0,1fr)_minmax(240px,340px)] 2xl:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(280px,380px)] grid-rows-[minmax(0,1fr)_240px]";

  const leftPanelContent = (
    <>
    <div className="pywebview-drag-region flex items-center gap-2 px-4 py-3">
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
            audioRef={audioRef}
            notify={notify}
            localMedia={localMedia}
            onLocalMediaChange={setLocalMedia}
            onSelectionChange={(hasFile, filename) => {
              setHasSelection(hasFile);
              setSelectedName(filename ?? null);
            }}
            onAddToTimeline={handleAddToTimeline}
            onDragPayloadChange={(payload) => {
              dragPayloadRef.current = payload;
            }}
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
              <div>
                <label className="text-[11px] font-semibold text-slate-400" htmlFor="chineseScriptSelect">
                  Chinese Encode
                </label>
                <Select
                  className="stt-select-dark"
                  id="chineseScript"
                  buttonId="chineseScriptSelect"
                  value={String(exportLanguage)}
                  options={[
                    { value: "traditional", label: "Traditional" },
                    { value: "simplified", label: "Simplified" }
                  ]}
                  onChange={(value) => dispatch(setExportLanguage(value as any))}
                />
              </div>
            </div>
            <div className="pt-2">
              <button
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-md border border-slate-700 bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition",
                  hasSelection ? "hover:border-slate-500" : "cursor-not-allowed opacity-50"
                )}
                disabled={!hasSelection}
                onClick={() => uploadRef.current?.submitTranscription()}
                type="button"
              >
                AI Generate Caption
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
        <div className="pywebview-drag-region flex h-10 select-none items-center justify-between bg-[#0b0b0b] px-3 text-xs text-slate-300">
          <div className="flex min-w-0 flex-1 items-center gap-2">
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
            <span className="text-[11px] font-semibold text-slate-200">XSub</span>
            {selectedName ? <span className="truncate text-[11px] text-slate-500">{selectedName}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              className={cn(
                "pywebview-no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-slate-700 bg-[#151515] px-2 text-[11px] font-semibold text-slate-200 transition",
                exportSegments.length && !isExporting
                  ? "hover:border-slate-500"
                  : "cursor-not-allowed opacity-50"
              )}
              onClick={handleExportTranscript}
              disabled={!exportSegments.length || isExporting}
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
          </div>
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
            <div className="pywebview-drag-region flex shrink-0 items-center justify-between px-4 py-2 text-xs text-slate-400">
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
                  <TranscriptPanel mediaRef={transcriptMediaRef} notify={notify} />
                </div>
              ) : (
                <>
                  <div
                    className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
                    ref={previewContainerRef}
                  >
                    <div className="relative h-full w-full overflow-hidden bg-black">
                      {activeMedia?.kind === "video" && resolvedPreviewUrl && activeMedia.source === "local" ? (
                        <>
                          <video
                            src={resolvedPreviewUrl}
                            ref={videoRef}
                            playsInline
                            preload="auto"
                            poster={previewPoster ?? undefined}
                            className="absolute inset-0 h-full w-full object-contain"
                          />
                          {previewPoster ? (
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
                      {currentSubtitle ? (
                        <div className="pointer-events-none absolute bottom-6 left-1/2 w-[92%] -translate-x-1/2 text-center">
                          <span className="inline-block rounded-md bg-black/70 px-3 py-1 text-[13px] font-medium text-white shadow">
                            {currentSubtitle}
                          </span>
                        </div>
                      ) : null}
                      {nextClip?.media?.previewUrl && nextClip.media.kind === "video" && nextClip.media.source === "local" ? (
                        <video
                          src={nextClip.media.previewUrl}
                          preload="auto"
                          className="hidden"
                          aria-hidden
                        />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex w-full shrink-0 items-center gap-3 px-2 py-1">
                    <button
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-black/50 text-slate-200 transition",
                        previewDisabled ? "cursor-not-allowed opacity-50" : "hover:border-slate-500"
                      )}
                      onClick={togglePlayback}
                      disabled={previewDisabled}
                      type="button"
                    >
                      <AppIcon name={playback.isPlaying ? "pause" : "play"} className="text-[12px]" />
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
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-black/50 text-slate-200 transition hover:border-slate-500"
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
            <aside className="row-start-1 row-end-2 flex min-h-0 flex-col bg-[#0b0b0b]">
              <div className="pywebview-drag-region flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200">
                <span>Transcription</span>
                <span className="text-[10px] font-medium text-slate-500">Live sync</span>
              </div>
              <div className="min-h-0 flex-1 px-3 py-3">
                <TranscriptPanel mediaRef={transcriptMediaRef} notify={notify} />
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
            <div className="flex items-center justify-end px-4 py-2 text-xs text-slate-400">
              <div className="flex items-center gap-2">
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

            <div className="flex min-h-0 flex-1 overflow-hidden">
              <div className="flex w-full min-h-0 gap-2 pl-2">
                <div className="flex w-8 flex-shrink-0 flex-col text-[11px] text-slate-400">
                  <div className="flex h-10 items-center justify-center text-[10px] uppercase tracking-[0.2em] text-slate-500">
                    ▦
                  </div>
                  <div className="mt-2 flex flex-col space-y-2">
                    <div className="flex h-12 items-center justify-center">
                      <AppIcon name="video" className="text-[12px] text-slate-200" />
                    </div>
                    <div className="flex h-10 items-center justify-center">
                      <AppIcon name="volume" className="text-[12px] text-slate-200" />
                    </div>
                    <div className="flex h-10 items-center justify-center">
                      <AppIcon name="captions" className="text-[12px] text-slate-200" />
                    </div>
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
                    className={cn(
                      "min-w-full pb-4 transition",
                      isTimelineDragOver && "bg-[rgba(37,99,235,0.05)]"
                    )}
                    style={{ width: `${timelineScrollWidth}px` }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                      setIsTimelineDragOver(true);
                    }}
                    onDragLeave={() => setIsTimelineDragOver(false)}
                    onDrop={handleTimelineDrop}
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
                          className="relative h-12 overflow-hidden rounded-md border border-slate-800/20 bg-[#151515]"
                          style={{ width: `${timelineWidth}px` }}
                          ref={timelineTrackRef}
                          onPointerDown={onTrackPointerDown}
                          onPointerMove={onTrackPointerMove}
                          onPointerUp={onTrackPointerUp}
                        >
                          <div className="absolute inset-0 bg-[#2a2a2f]" style={gridStyle} />
                          {hasTimelineMedia ? (
                            timelineClips.map((clip) => (
                              <div
                                key={clip.id}
                                data-clip-id={clip.id}
                                className={cn(
                                  "absolute top-1/2 h-8 -translate-y-1/2 cursor-grab rounded-md border border-primary/60 px-2 text-[11px] font-semibold text-white shadow transition active:cursor-grabbing hover:border-primary",
                                  clip.media.kind === "video" && clip.media.thumbnailUrl
                                    ? "bg-black/40"
                                    : "bg-primary/30"
                                )}
                                style={{
                                  left: `${clip.startSec * pxPerSec}px`,
                                  width: `${Math.max(8, clip.durationSec * pxPerSec)}px`,
                                  backgroundImage:
                                    clip.media.kind === "video" && clip.media.thumbnailUrl
                                      ? `url(${clip.media.thumbnailUrl})`
                                      : undefined,
                                  backgroundSize:
                                    clip.media.kind === "video" && clip.media.thumbnailUrl
                                      ? `${Math.max(8, clip.baseDurationSec * pxPerSec)}px 100%`
                                      : undefined,
                                  backgroundRepeat:
                                    clip.media.kind === "video" && clip.media.thumbnailUrl ? "no-repeat" : undefined,
                                  backgroundPosition:
                                    clip.media.kind === "video" && clip.media.thumbnailUrl
                                      ? `${-Math.max(0, clip.trimStartSec) * pxPerSec}px center`
                                      : undefined
                                }}
                                title={clip.media.name}
                                onPointerDown={(event) => startClipDrag(event, clip.id, "move")}
                                onPointerMove={onClipPointerMove}
                                onPointerUp={onClipPointerUp}
                                onClick={() => {
                                  const sameMedia = activeMedia?.id === clip.media.id;
                                  const mediaEl = sameMedia ? getActiveMediaEl() : null;
                                  setActiveMedia(clip.media);
                                  setActiveClipId(clip.id);
                                  isGapPlaybackRef.current = false;
                                  setPlayback((prev) => ({ ...prev, currentTime: clip.startSec, isPlaying: false }));
                                  if (mediaEl) {
                                    try {
                                      mediaEl.currentTime = clip.trimStartSec;
                                    } catch {
                                      // Ignore.
                                    }
                                  } else {
                                    pendingSeekRef.current = clip.trimStartSec;
                                  }
                                  if (clip.media.source === "job" && clip.media.jobId) {
                                    dispatch(selectJob(clip.media.jobId));
                                  }
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  setTimelineMenu({ x: event.clientX, y: event.clientY, clipId: clip.id });
                                }}
                              >
                                <div
                                  className="absolute left-0 top-0 h-full w-1 cursor-ew-resize bg-white/30"
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    startClipDrag(event, clip.id, "resize-left");
                                  }}
                                  onPointerMove={onClipPointerMove}
                                  onPointerUp={onClipPointerUp}
                                />
                                <div
                                  className="absolute right-0 top-0 h-full w-1 cursor-ew-resize bg-white/30"
                                  onPointerDown={(event) => {
                                    event.stopPropagation();
                                    startClipDrag(event, clip.id, "resize-right");
                                  }}
                                  onPointerMove={onClipPointerMove}
                                  onPointerUp={onClipPointerUp}
                                />
                                {clip.media.kind !== "video" || !clip.media.thumbnailUrl ? (
                                  <div className="flex h-full items-center gap-1 text-[10px] font-semibold text-white/80">
                                    <AppIcon
                                      name={clip.media.kind === "audio" ? "volume" : "video"}
                                      className="text-[10px]"
                                    />
                                    <span className="uppercase tracking-[0.2em]">
                                      {clip.media.kind === "audio" ? "Audio" : "Media"}
                                    </span>
                                  </div>
                                ) : null}
                              </div>
                            ))
                          ) : null}
                        </div>

                        <div
                          className="relative h-10 overflow-hidden rounded-md border border-slate-800/20 bg-[#151515]"
                          style={{ width: `${timelineWidth}px` }}
                        >
                          <div className="absolute inset-0 bg-[#222228]" style={faintGridStyle} />
                          {hasTimelineMedia ? (
                            <div className="absolute inset-1 rounded bg-gradient-to-r from-[#1f2937] via-[#2f3b4b] to-[#1f2937] opacity-90" />
                          ) : null}
                        </div>

                        <div
                          className="relative h-10 overflow-hidden rounded-md border border-slate-800/20 bg-[#151515]"
                          style={{ width: `${timelineWidth}px` }}
                        >
                          <div className="absolute inset-0 bg-[#222228]" style={faintGridStyle} />
                          {segments.map((segment: any) => {
                            const start = Number(segment.start ?? 0);
                            const end = Number(segment.end ?? 0);
                            const width = Math.max(2, (end - start) * pxPerSec);
                            const left = Math.max(0, start * pxPerSec);
                            const text = segment.originalText ?? segment.text ?? "";
                            return (
                              <div
                                key={`timeline-${segment.id}`}
                                className="absolute top-1 h-6 cursor-grab rounded-md bg-[#3b82f6] px-2 text-[10px] text-white shadow transition active:cursor-grabbing"
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

      {timelineMenu ? (
        <div
          className="fixed z-[120] min-w-[160px] overflow-hidden rounded-lg border border-slate-800/20 bg-[#151515] text-[11px] text-slate-200 shadow-xl"
          style={{ left: timelineMenu.x, top: timelineMenu.y }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
            onClick={() => {
              splitClipAtPlayhead(timelineMenu.clipId);
              setTimelineMenu(null);
            }}
            type="button"
          >
            <AppIcon name="cut" />
            Split at playhead
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
            onClick={() => {
              deleteClip(timelineMenu.clipId);
              setTimelineMenu(null);
            }}
            type="button"
          >
            <AppIcon name="trashAlt" />
            Delete
          </button>
        </div>
      ) : null}

      <ToastHost toasts={toasts} onDismiss={dismissToast} autoHideMs={2000} />
    </>
  );
}

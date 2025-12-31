import {
  memo,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ForwardedRef,
  type MutableRefObject,
  type SetStateAction
} from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppDispatch, useAppSelector } from "../../../hooks";
import { removeJob, setJobOrder, startTranscription, updateJobDisplayName, updateJobUiState } from "../../jobs/jobsSlice";
import type { ToastType } from "../../../components/common/ToastHost";
import { apiRemoveJob, apiUpsertJobRecord } from "../../../api/jobsApi";
import { apiResolveYoutubeStream } from "../../../api/youtubeApi";
import { AppIcon } from "../../../components/common/AppIcon";
import { cn } from "../../../lib/cn";
import { stripFileExtension } from "../../../lib/utils";

export type UploadTabHandle = {
  submitTranscription: () => Promise<void>;
  hasSelection: () => boolean;
  openFilePicker: () => void;
  addLocalPathItem: (args: {
    path: string;
    name: string;
    size?: number | null;
    mime?: string | null;
    displayName?: string | null;
    durationSec?: number | null;
    previewUrl?: string | null;
    streamUrl?: string | null;
    externalSource?: MediaSourceInfo | null;
    transcriptionKind?: "audio" | "video";
  }) => void;
};

export type MediaSourceInfo = {
  type: "youtube";
  url?: string | null;
  streamUrl?: string | null;
  title?: string | null;
  id?: string | null;
  thumbnailUrl?: string | null;
};

export type MediaItem = {
  id: string;
  name: string;
  displayName?: string;
  kind: "video" | "audio" | "caption" | "other";
  source: "job" | "local";
  transcriptionKind?: "video" | "audio";
  jobId?: string;
  file?: File;
  localPath?: string | null;
  previewUrl?: string | null;
  streamUrl?: string | null;
  externalSource?: MediaSourceInfo | null;
  isResolvingStream?: boolean;
  thumbnailUrl?: string | null;
  thumbnailSource?: "saved" | "captured" | "none";
  createdAt?: number;
  durationSec?: number | null;
  invalid?: boolean;
  streamError?: string | null;
};

type UploadTabProps = {
  notify: (message: string, type?: ToastType) => void;
  onSelectionChange?: (hasFile: boolean, filename?: string | null, file?: File | null) => void;
  onAddToTimeline?: (items: MediaItem[]) => void;
  onClearSelection?: () => void;
  localMedia?: MediaItem[];
  onLocalMediaChange?: Dispatch<SetStateAction<MediaItem[]>>;
  onRequestFilePicker?: (open: () => void) => void;
  secondCaptionEnabled?: boolean;
  secondCaptionLanguage?: "yue" | "zh" | "en";
};

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "mkv", "avi", "webm", "flv", "mpg", "mpeg"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus"]);
const CAPTION_EXTENSIONS = new Set(["srt"]);
const MEDIA_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);
const ACCEPTED_MEDIA_TYPES = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS].map((ext) => `.${ext}`).join(",");

function getKind(filename?: string | null) {
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (CAPTION_EXTENSIONS.has(ext)) return "caption";
  return "other";
}

function hashStableId(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function buildImportedJobId(path: string, size?: number | null) {
  return `media-${hashStableId(`${path}::${size ?? ""}`)}`;
}

function isYoutubeStreamExpired(streamUrl?: string | null) {
  if (!streamUrl) return false;
  try {
    const url = new URL(streamUrl);
    const expireParam = url.searchParams.get("expire");
    if (!expireParam) return false;
    const expireSec = Number(expireParam);
    if (!Number.isFinite(expireSec)) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return expireSec <= nowSec + 30;
  } catch {
    return false;
  }
}

type SortableMediaRowProps = {
  item: MediaItem;
  updatedAt: number | null;
  isSelected: boolean;
  isProcessingJob: boolean;
  canReorder: boolean;
  viewMode: "list-view" | "list";
  getPreviewKind: (item: MediaItem) => string;
  onActivate: (item: MediaItem) => void;
  onContextMenu: (e: React.MouseEvent, item: MediaItem) => void;
  formatTimestamp: (ts: number) => string;
};

const SortableMediaRow = memo(function SortableMediaRow({
  item,
  updatedAt,
  isSelected,
  isProcessingJob,
  canReorder,
  viewMode,
  getPreviewKind,
  onActivate,
  onContextMenu,
  formatTimestamp
}: SortableMediaRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canReorder
  });
  const pointerStartRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  const isListMode = viewMode === "list";
  const isYoutube = item.externalSource?.type === "youtube";
  const previewKind = getPreviewKind(item);
  const fallbackIcon = isYoutube ? "youtube" : previewKind === "video" ? "video" : "volume";
  const displayThumbnail = item.thumbnailUrl ?? item.externalSource?.thumbnailUrl ?? null;
  const displayName = item.displayName ?? item.name;

  const handleActivate = useCallback(() => {
    onActivate(item);
  }, [onActivate, item]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenu(e, item);
  }, [onContextMenu, item]);

  return (
    <div ref={setNodeRef} style={style}>
      <button
        data-media-row
        className={cn(
          "relative w-full text-left transition focus:outline-none focus-visible:outline-none pywebview-no-drag",
          isListMode
            ? "rounded-md bg-transparent px-2 py-1.5 hover:bg-[rgba(255,255,255,0.04)]"
            : "rounded-lg bg-transparent px-3 py-2 hover:bg-[rgba(255,255,255,0.04)]",
          canReorder && "cursor-grab active:cursor-grabbing",
          isDragging && "shadow-[0_12px_24px_rgba(0,0,0,0.35)]",
          isSelected && (isListMode ? "ring-1 ring-primary/40" : "ring-1 ring-primary/40 bg-[#1b1b22]"),
          item.invalid && "ring-1 ring-rose-500/40"
        )}
        {...attributes}
        {...listeners}
        onPointerDownCapture={(event) => {
          if (event.button !== 0) return;
          pointerStartRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        }}
        onPointerUpCapture={(event) => {
          const start = pointerStartRef.current;
          if (!start || start.id !== event.pointerId) return;
          pointerStartRef.current = null;
          if (event.button !== 0) return;
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          if (dx * dx + dy * dy > 36) return;
          if (isDragging) return;
          handleActivate();
        }}
        onPointerCancel={() => {
          pointerStartRef.current = null;
        }}
        onClick={(event) => {
          if (isDragging) return;
          handleActivate();
        }}
        onContextMenu={handleContextMenu}
        type="button"
      >
        {isListMode ? (
          <div className="flex w-full items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md bg-[#0f0f10]",
                isYoutube ? "text-[#ef4444]" : "text-slate-200"
              )}
            >
              <AppIcon name={fallbackIcon} className="text-[13px]" />
            </div>
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-100",
                item.invalid && "text-rose-300"
              )}
            >
              {displayName}
            </span>
          </div>
        ) : (
          <div className="flex w-full items-center gap-3">
            {displayThumbnail && (previewKind === "video" || isYoutube) ? (
              <div className="relative h-10 w-16 overflow-hidden rounded-md bg-[#0f0f10]">
                <img src={displayThumbnail} alt="" className="h-full w-full object-cover" />
                {isYoutube ? (
                  <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-black/60">
                    <AppIcon name="youtube" className="text-[9px] text-[#ff0000]" />
                  </span>
                ) : null}
              </div>
            ) : (
              <div
                className={cn(
                  "flex h-10 w-16 items-center justify-center rounded-md bg-[#0f0f10]",
                  isYoutube ? "text-[#ef4444]" : "text-slate-300"
                )}
              >
                <AppIcon name={fallbackIcon} className="text-[14px]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <span
                className="block text-[12px] font-semibold leading-snug text-slate-100"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden"
                }}
              >
                {displayName}
              </span>
              {updatedAt || item.invalid ? (
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500" style={{ whiteSpace: "nowrap" }}>
                  {updatedAt ? <span className="truncate">{formatTimestamp(updatedAt)}</span> : null}
                  {item.invalid ? (
                    <span className="inline-flex items-center gap-1 text-rose-400">
                      <AppIcon name="exclamationTriangle" className="text-[10px]" />
                      Invalid file
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
        {isProcessingJob ? (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/35 backdrop-blur-[1px]">
            <div className="processing-spinner" aria-hidden>
              <span className="processing-bar processing-bar-1" />
              <span className="processing-bar processing-bar-2" />
              <span className="processing-bar processing-bar-3" />
              <span className="processing-bar processing-bar-4" />
            </div>
          </div>
        ) : null}
      </button>
    </div>
  );
});

export const UploadTab = memo(forwardRef(function UploadTab(
  props: UploadTabProps,
  ref: ForwardedRef<UploadTabHandle>
) {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  const exportLanguage = useAppSelector((s) => s.transcript.exportLanguage);
  const jobsById = useAppSelector((s) => s.jobs.jobsById);
  const jobOrder = useAppSelector((s) => s.jobs.order);
  const selectedJobId = useAppSelector((s) => s.jobs.selectedJobId);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewMode, setViewMode] = useState<"list-view" | "list">("list-view");
  const [filterMode, setFilterMode] = useState<"all" | "video" | "audio">("all");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const [localMediaState, setLocalMediaState] = useState<MediaItem[]>([]);
  const localMedia = props.localMedia ?? localMediaState;
  const setLocalMedia = props.onLocalMediaChange ?? setLocalMediaState;
  const [jobPreviewMeta, setJobPreviewMeta] = useState<
    Record<string, { thumbnailUrl?: string | null; durationSec?: number | null }>
  >({});
  const jobThumbInFlight = useRef<Set<string>>(new Set());
  const youtubeThumbInFlight = useRef<Set<string>>(new Set());
  const thumbSaveInFlight = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: MediaItem;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mediaOrder, setMediaOrder] = useState<string[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const selectedJobIdRef = useRef<string | null>(selectedJobId ?? null);
  const resolveTokenRef = useRef(0);
  const getPreviewKind = useCallback((item: MediaItem) => (item.streamUrl ? "video" : item.kind), []);

  const scheduleIdle = useCallback((task: () => void) => {
    if (typeof window === "undefined") {
      task();
      return;
    }
    const win = window as any;
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(() => task());
    } else {
      window.setTimeout(task, 0);
    }
  }, []);

  const areIdsEqual = useCallback((left: string[], right: string[]) => {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) return false;
    }
    return true;
  }, []);

  const isDataUrl = useCallback((value?: string | null) => {
    if (!value) return false;
    return value.startsWith("data:image/");
  }, []);

  const resolveYoutubeThumbnailUrl = useCallback((item: MediaItem) => {
    const explicit = item.externalSource?.thumbnailUrl ?? null;
    if (explicit) return explicit;
    return null;
  }, []);

  const captureImageThumbnailFromUrl = useCallback(async (url: string) => {
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) {
        return null;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = objectUrl;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Image load failed"));
        });
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        if (!width || !height) {
          return null;
        }
        const targetHeight = 40;
        const targetWidth = 64;
        const canvas = document.createElement("canvas");
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          return null;
        }
        const scale = Math.max(targetWidth / width, targetHeight / height);
        const drawWidth = width * scale;
        const drawHeight = height * scale;
        const dx = (targetWidth - drawWidth) / 2;
        const dy = (targetHeight - drawHeight) / 2;
        ctx.drawImage(img, 0, 0, width, height, dx, dy, drawWidth, drawHeight);
        return canvas.toDataURL("image/jpeg", 0.6);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      return null;
    }
  }, []);

  const persistThumbnail = useCallback(
    (jobId: string, thumbnail: string | null | undefined) => {
      if (!jobId || !thumbnail) return;
      if (thumbSaveInFlight.current.has(jobId)) return;
      const job = jobsById[jobId];
      const existingUiState =
        job?.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
      if (existingUiState?.thumbnail?.data === thumbnail) return;
      const nextUiState = {
        ...existingUiState,
        thumbnail: {
          data: thumbnail,
          updatedAt: Date.now()
        }
      };
      dispatch(updateJobUiState({ jobId, uiState: nextUiState }));
      thumbSaveInFlight.current.add(jobId);
      void apiUpsertJobRecord({
        job_id: jobId,
        ui_state: nextUiState
      })
        .catch(() => undefined)
        .finally(() => {
          thumbSaveInFlight.current.delete(jobId);
        });
    },
    [dispatch, jobsById]
  );

  const resolveYoutubeStream = useCallback(
    async (item: MediaItem): Promise<MediaItem | null> => {
      if (item.externalSource?.type !== "youtube") {
        return item;
      }
      const url = item.externalSource.url ?? null;
      if (!url) {
        props.notify("Missing YouTube URL for this item.", "error");
        return null;
      }
      const markStreamError = (message: string) => {
        const nextSource: MediaSourceInfo = {
          type: "youtube",
          url,
          streamUrl: null,
          title: item.externalSource?.title ?? null,
          id: item.externalSource?.id ?? null,
          thumbnailUrl: item.externalSource?.thumbnailUrl ?? null
        };
        const failedItem: MediaItem = {
          ...item,
          previewUrl: item.previewUrl ?? null,
          streamUrl: null,
          externalSource: nextSource,
          isResolvingStream: false,
          streamError: message
        };
        if (item.source === "local") {
          setLocalMedia((prev) => prev.map((entry) => (entry.id === item.id ? failedItem : entry)));
        }
        if (item.jobId) {
          const job = jobsById[item.jobId];
          const existingUiState =
            job?.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
          const nextUiState = {
            ...existingUiState,
            mediaSource: nextSource,
            mediaSourceError: message
          };
          if (job) {
            dispatch(updateJobUiState({ jobId: item.jobId, uiState: nextUiState }));
          }
          void apiUpsertJobRecord({ job_id: item.jobId, ui_state: nextUiState }).catch(() => undefined);
        }
        return failedItem;
      };
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return markStreamError("You're offline. Connect to the internet to load the YouTube preview.");
      }
      try {
        const payload = await apiResolveYoutubeStream(url);
        const streamUrl = typeof payload.stream_url === "string" ? payload.stream_url : null;
        const thumbnailUrl = typeof payload.thumbnail_url === "string" ? payload.thumbnail_url : null;
        if (!streamUrl) {
          throw new Error("Failed to resolve YouTube stream.");
        }
        const nextSource: MediaSourceInfo = {
          type: "youtube",
          url,
          streamUrl,
          title: payload.source?.title ?? item.externalSource.title ?? null,
          id: payload.source?.id ?? item.externalSource.id ?? null,
          thumbnailUrl: thumbnailUrl ?? item.externalSource.thumbnailUrl ?? null
        };
        const updatedItem: MediaItem = {
          ...item,
          previewUrl: streamUrl,
          streamUrl,
          externalSource: nextSource,
          isResolvingStream: false,
          streamError: null
        };
        if (item.source === "local") {
          setLocalMedia((prev) => prev.map((entry) => (entry.id === item.id ? updatedItem : entry)));
        }
        if (item.jobId) {
          const job = jobsById[item.jobId];
          const existingUiState =
            job?.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
          const nextUiState = {
            ...existingUiState,
            mediaSource: nextSource,
            mediaSourceError: null
          };
          if (job) {
            dispatch(updateJobUiState({ jobId: item.jobId, uiState: nextUiState }));
          }
          void apiUpsertJobRecord({ job_id: item.jobId, ui_state: nextUiState }).catch(() => undefined);
        }
        return updatedItem;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        props.notify(message || "Failed to resolve YouTube stream.", "error");
        return markStreamError("Unable to reach YouTube right now. Please try again later.");
      }
    },
    [dispatch, jobsById, props.notify, setLocalMedia]
  );

  const persistMediaOrder = useCallback(
    (order: string[]) => {
      order.forEach((id, index) => {
        const job = jobsById[id];
        if (!job) return;
        const existingUiState =
          job.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
        if (existingUiState.media_order_index === index) return;
        const nextUiState = { ...existingUiState, media_order_index: index };
        dispatch(updateJobUiState({ jobId: id, uiState: nextUiState }));
        void apiUpsertJobRecord({ job_id: id, ui_state: nextUiState }).catch(() => undefined);
      });
    },
    [dispatch, jobsById]
  );

  const formatTimestamp = useCallback((value?: number | null) => {
    if (!value || !Number.isFinite(value)) return "";
    return new Date(value).toLocaleString();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (viewMenuRef.current && !viewMenuRef.current.contains(target)) {
        setViewMenuOpen(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setFilterMenuOpen(false);
      }
      if (contextMenu) {
        if (contextMenuRef.current && contextMenuRef.current.contains(target)) {
          return;
        }
        setContextMenu(null);
      }
    }

    if (viewMenuOpen || filterMenuOpen || contextMenu) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu, filterMenuOpen, viewMenuOpen]);

  const toFileUrl = useCallback((path: string) => {
    if (!path) return "";
    return `/media?path=${encodeURIComponent(path)}`;
  }, []);

  const requestFilePicker = useCallback(() => {
    const open = () => {
      const api = (window as any)?.pywebview?.api;
      const openNative = api?.openMediaDialog || api?.open_media_dialog;
      if (typeof openNative === "function") {
        void openNative
          .call(api)
          .then((result: any) => {
            if (!result || result.cancelled) return;
            if (!result.success) {
              const message =
                result?.error === "unsupported_file"
                  ? "Unsupported file type. Please choose an audio or video file."
                  : result?.error || "Failed to open media file.";
              props.notify(message, "error");
              return;
            }
            if (result.file?.path) {
              const filePath = String(result.file.path);
              const fileName = result.file.name || filePath.split(/[\\/]/).pop() || "media";
              addLocalPathItem({
                path: filePath,
                name: fileName,
                size: typeof result.file.size === "number" ? result.file.size : null,
                mime: result.file.mime || null
              });
            }
          })
          .catch((error: any) => {
            const message = error instanceof Error ? error.message : String(error);
            props.notify(message || "Failed to open media file.", "error");
          });
        return;
      }
      if (fileInputRef.current) {
        fileInputRef.current.accept = ACCEPTED_MEDIA_TYPES;
        fileInputRef.current.click();
      }
    };
    if (props.onRequestFilePicker) {
      props.onRequestFilePicker(open);
      return;
    }
    open();
  }, [addLocalFiles, addLocalPathItem, props.notify, props.onRequestFilePicker]);

  useImperativeHandle(ref, () => ({
    submitTranscription,
    hasSelection: () => Boolean(selectedFile || selectedId),
    openFilePicker: requestFilePicker,
    addLocalPathItem
  }));

  useEffect(() => {
    props.onSelectionChange?.(Boolean(selectedFile), selectedFile?.name ?? null, selectedFile ?? null);
  }, [selectedFile, props.onSelectionChange]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    selectedJobIdRef.current = selectedJobId ?? null;
  }, [selectedJobId]);


  function clearSelectedFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedFile(null);
  }

  function buildLocalItem(file: File): MediaItem {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const id = `local-${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    return {
      id,
      name: file.name,
      displayName: stripFileExtension(file.name) || file.name,
      kind: getKind(file.name),
      source: "local",
      file,
      localPath: null,
      previewUrl,
      thumbnailUrl: null,
      createdAt: Date.now(),
      durationSec: null
    };
  }

  function buildLocalPathItem(args: {
    path: string;
    name: string;
    size?: number | null;
    mime?: string | null;
    displayName?: string | null;
    durationSec?: number | null;
    previewUrl?: string | null;
    streamUrl?: string | null;
    externalSource?: MediaSourceInfo | null;
    transcriptionKind?: "audio" | "video";
  }): MediaItem {
    const id = `local-path-${args.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = args.previewUrl ?? args.streamUrl ?? toFileUrl(args.path);
    const externalThumb = args.externalSource?.thumbnailUrl ?? null;
    const jobId = buildImportedJobId(args.path, args.size);
    return {
      id,
      name: args.name,
      displayName: args.displayName ?? (stripFileExtension(args.name) || args.name),
      kind: getKind(args.name),
      source: "local",
      transcriptionKind: args.transcriptionKind,
      jobId,
      file: undefined,
      localPath: args.path,
      previewUrl,
      streamUrl: args.streamUrl ?? args.previewUrl ?? null,
      externalSource: args.externalSource ?? null,
      thumbnailUrl: externalThumb,
      createdAt: Date.now(),
      durationSec: typeof args.durationSec === "number" ? args.durationSec : null
    };
  }

  async function captureVideoThumbnail(file: File) {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const waitFor = (event: string) =>
      new Promise<void>((resolve, reject) => {
        const onEvent = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("video load failed"));
        };
        const cleanup = () => {
          video.removeEventListener(event, onEvent);
          video.removeEventListener("error", onError);
        };
        video.addEventListener(event, onEvent, { once: true });
        video.addEventListener("error", onError, { once: true });
      });

    try {
      await waitFor("loadeddata");
    } catch {
      try {
        await waitFor("loadedmetadata");
      } catch {
        URL.revokeObjectURL(url);
        return { duration: 0, thumbnail: null as string | null };
      }
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    if (!duration || !width || !height) {
      URL.revokeObjectURL(url);
      return { duration, thumbnail: null as string | null };
    }

    const targetHeight = 40;
    const targetWidth = 64;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(url);
      return { duration, thumbnail: null as string | null };
    }

    const seekTo = (time: number) =>
      new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        try {
          video.currentTime = time;
        } catch {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        }
      });

    const midpoint = Math.max(0, Math.min(duration / 2, Math.max(0, duration - 0.1)));
    await seekTo(midpoint);
    const scale = Math.max(targetWidth / width, targetHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const dx = (targetWidth - drawWidth) / 2;
    const dy = (targetHeight - drawHeight) / 2;
    ctx.drawImage(video, 0, 0, width, height, dx, dy, drawWidth, drawHeight);

    const thumbnail = canvas.toDataURL("image/jpeg", 0.6);
    URL.revokeObjectURL(url);
    return { duration, thumbnail };
  }

  async function captureVideoThumbnailFromUrl(url: string) {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const waitFor = (event: string) =>
      new Promise<void>((resolve, reject) => {
        const onEvent = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error("video load failed"));
        };
        const cleanup = () => {
          video.removeEventListener(event, onEvent);
          video.removeEventListener("error", onError);
        };
        video.addEventListener(event, onEvent, { once: true });
        video.addEventListener("error", onError, { once: true });
      });

    try {
      await waitFor("loadeddata");
    } catch {
      try {
        await waitFor("loadedmetadata");
      } catch {
        return { duration: 0, thumbnail: null as string | null };
      }
    }

    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    if (!duration || !width || !height) {
      return { duration, thumbnail: null as string | null };
    }

    const targetHeight = 40;
    const targetWidth = 64;
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return { duration, thumbnail: null as string | null };
    }

    const seekTo = (time: number) =>
      new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked, { once: true });
        try {
          video.currentTime = time;
        } catch {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        }
      });

    const midpoint = Math.max(0, Math.min(duration / 2, Math.max(0, duration - 0.1)));
    await seekTo(midpoint);
    const scale = Math.max(targetWidth / width, targetHeight / height);
    const drawWidth = width * scale;
    const drawHeight = height * scale;
    const dx = (targetWidth - drawWidth) / 2;
    const dy = (targetHeight - drawHeight) / 2;
    ctx.drawImage(video, 0, 0, width, height, dx, dy, drawWidth, drawHeight);

    const thumbnail = canvas.toDataURL("image/jpeg", 0.6);
    return { duration, thumbnail };
  }

  async function captureAudioDurationFromUrl(url: string) {
    return new Promise<number>((resolve) => {
      const el = document.createElement("audio");
      el.preload = "metadata";
      el.src = url;
      el.onloadedmetadata = () => {
        const dur = Number.isFinite(el.duration) ? el.duration : 0;
        resolve(dur);
      };
      el.onerror = () => resolve(0);
    });
  }

  function addLocalFiles(files: File[]) {
    if (!files.length) return;
    const supported = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      return MEDIA_EXTENSIONS.has(ext);
    });
    const rejected = files.filter((file) => !supported.includes(file));
    if (rejected.length) {
      props.notify(
        `Skipped ${rejected.length} unsupported file${rejected.length > 1 ? "s" : ""}. Supported: video and audio files.`,
        "error"
      );
    }
    if (!supported.length) return;

    const preferred = supported.find((file) => getKind(file.name) !== "caption") ?? supported[0];
    const picked = preferred ? [preferred] : [];
    if (supported.length > 1) {
      props.notify("Only one media file can be processed at a time. Using the first selection.", "info");
    }
    if (!picked.length) return;

    const items = picked.map(buildLocalItem);
    setLocalMedia((prev) => [...items, ...prev]);
    setSelectedId(items[0]?.id ?? null);
    props.onAddToTimeline?.(items);
    const playable = picked.find((file) => getKind(file.name) !== "caption") ?? null;
    if (playable) {
      setSelectedFile(playable);
    } else {
      clearSelectedFile();
    }

    items.forEach((item) => {
      if (!item.file) return;
      if (item.kind === "caption") return;
      scheduleIdle(() => {
        void (async () => {
          const meta =
            item.kind === "video"
              ? await captureVideoThumbnail(item.file as File)
              : await new Promise<{ duration: number; thumbnail: string | null }>((resolve) => {
                  const url = URL.createObjectURL(item.file as File);
                  const el = document.createElement("audio");
                  el.preload = "metadata";
                  el.src = url;
                  el.onloadedmetadata = () => {
                    const dur = Number.isFinite(el.duration) ? el.duration : 0;
                    URL.revokeObjectURL(url);
                    resolve({ duration: dur, thumbnail: null });
                  };
                  el.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve({ duration: 0, thumbnail: null });
                  };
                });
          setLocalMedia((prev) =>
            prev.map((m) =>
              m.id === item.id
                ? { ...m, durationSec: meta.duration || m.durationSec, thumbnailUrl: meta.thumbnail ?? m.thumbnailUrl }
                : m
            )
          );
        })();
      });
    });
  }

  function addLocalPathItem(args: {
    path: string;
    name: string;
    size?: number | null;
    mime?: string | null;
    displayName?: string | null;
    durationSec?: number | null;
    previewUrl?: string | null;
    streamUrl?: string | null;
    externalSource?: MediaSourceInfo | null;
    transcriptionKind?: "audio" | "video";
  }) {
    const item = buildLocalPathItem(args);
    setLocalMedia((prev) => [item, ...prev]);
    setSelectedId(item.id);
    props.onAddToTimeline?.([item]);
    clearSelectedFile();
    if (item.jobId && item.localPath) {
      const displayName = item.displayName ?? (stripFileExtension(args.name) || args.name);
      const uiState =
        args.externalSource?.type === "youtube"
          ? {
              mediaSource: {
                type: "youtube",
                url: args.externalSource.url ?? null,
                streamUrl: args.externalSource.streamUrl ?? null,
                title: args.externalSource.title ?? null,
                id: args.externalSource.id ?? null,
                thumbnailUrl: args.externalSource.thumbnailUrl ?? null
              }
            }
          : undefined;
      void apiUpsertJobRecord({
        job_id: item.jobId,
        filename: args.name,
        display_name: displayName,
        media_path: item.localPath,
        media_kind: item.kind,
        status: "imported",
        ui_state: uiState
      }).catch(() => undefined);
    }
    if (item.kind === "video" && item.previewUrl) {
      scheduleIdle(() => {
        void (async () => {
          const meta = await captureVideoThumbnailFromUrl(item.previewUrl as string);
          setLocalMedia((prev) =>
            prev.map((m) =>
              m.id === item.id
                ? { ...m, durationSec: meta.duration || m.durationSec, thumbnailUrl: meta.thumbnail ?? m.thumbnailUrl }
                : m
            )
          );
          if (item.jobId) {
            persistThumbnail(item.jobId, meta.thumbnail);
          }
        })();
      });
    }
    if (item.kind === "audio" && item.previewUrl && item.durationSec == null) {
      scheduleIdle(() => {
        void (async () => {
          const duration = await captureAudioDurationFromUrl(item.previewUrl as string);
          if (!duration) return;
          setLocalMedia((prev) =>
            prev.map((m) => (m.id === item.id ? { ...m, durationSec: duration || m.durationSec } : m))
          );
        })();
      });
    }
  }

  function removeLocalItem(item: MediaItem) {
    if (item.previewUrl && item.file) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setLocalMedia((prev) => prev.filter((m) => m.id !== item.id));
    setSelectedId((prev) => (prev === item.id ? null : prev));
    if (selectedFile && item.file === selectedFile) {
      clearSelectedFile();
    }
    if (item.jobId) {
      void apiRemoveJob(item.jobId).catch(() => undefined);
    }
  }

  const jobItems = useMemo(
    () => jobOrder.map((id) => buildJobItem(id)).filter(Boolean) as MediaItem[],
    [jobOrder, localMedia, jobsById, jobPreviewMeta]
  );

  const mediaItemMap = useMemo(() => {
    const map = new Map<string, MediaItem>();
    localMedia.forEach((item) => map.set(item.id, item));
    jobItems.forEach((item) => map.set(item.id, item));
    return map;
  }, [jobItems, localMedia]);

  const createdAtById = useMemo(() => {
    const map = new Map<string, number>();
    mediaItemMap.forEach((item, id) => {
      map.set(id, typeof item.createdAt === "number" ? item.createdAt : 0);
    });
    return map;
  }, [mediaItemMap]);

  const mediaItems = useMemo(() => {
    if (mediaItemMap.size === 0) return [];
    if (!mediaOrder.length) {
      return [...mediaItemMap.values()].sort(
        (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
      );
    }
    const orderSet = new Set(mediaOrder);
    const ordered = mediaOrder
      .map((id) => mediaItemMap.get(id))
      .filter(Boolean) as MediaItem[];
    const missing = [...mediaItemMap.values()].filter((item) => !orderSet.has(item.id));
    if (missing.length) {
      missing.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      return [...missing, ...ordered];
    }
    return ordered;
  }, [mediaItemMap, mediaOrder]);

  useEffect(() => {
    if (mediaItemMap.size === 0) {
      if (mediaOrder.length) {
        setMediaOrder([]);
      }
      return;
    }
    if (!mediaOrder.length) {
      const localIds = [...localMedia]
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
        .map((item) => item.id);
      const jobIds = jobOrder.filter((id) => mediaItemMap.has(id));
      const known = new Set([...localIds, ...jobIds]);
      const remaining = [...mediaItemMap.keys()].filter((id) => !known.has(id));
      remaining.sort((a, b) => (createdAtById.get(b) ?? 0) - (createdAtById.get(a) ?? 0));
      const next = [...localIds, ...jobIds, ...remaining];
      if (!areIdsEqual(next, mediaOrder)) {
        setMediaOrder(next);
      }
      return;
    }
    const localIdsInOrder = mediaOrder.filter((id) => !jobsById[id] && mediaItemMap.has(id));
    const jobIdsInOrder = mediaOrder.filter((id) => jobsById[id]);
    if (!areIdsEqual(jobIdsInOrder, jobOrder)) {
      const jobIds = jobOrder.filter((id) => mediaItemMap.has(id));
      const known = new Set([...localIdsInOrder, ...jobIds]);
      const remaining = [...mediaItemMap.keys()].filter((id) => !known.has(id));
      remaining.sort((a, b) => (createdAtById.get(b) ?? 0) - (createdAtById.get(a) ?? 0));
      const next = [...localIdsInOrder, ...jobIds, ...remaining];
      if (!areIdsEqual(next, mediaOrder)) {
        setMediaOrder(next);
      }
      return;
    }
    const orderSet = new Set(mediaOrder);
    const missing: string[] = [];
    mediaItemMap.forEach((_item, id) => {
      if (!orderSet.has(id)) {
        missing.push(id);
      }
    });
    const kept = mediaOrder.filter((id) => mediaItemMap.has(id));
    if (!mediaOrder.length || missing.length || kept.length !== mediaOrder.length) {
      missing.sort((a, b) => (createdAtById.get(b) ?? 0) - (createdAtById.get(a) ?? 0));
      const next = [...missing, ...kept];
      if (!areIdsEqual(next, mediaOrder)) {
        setMediaOrder(next);
      }
    }
  }, [areIdsEqual, createdAtById, jobOrder, jobsById, localMedia, mediaItemMap, mediaOrder]);

  // Media order is the display source of truth. Job order updates happen on drag.

  const filteredMediaItems = useMemo(() => {
    let items = [...mediaItems];
    if (filterMode !== "all") {
      items = items.filter((item) => getPreviewKind(item) === filterMode);
    }
    return items;
  }, [filterMode, getPreviewKind, mediaItems]);

  const hasMediaItems = Boolean(filteredMediaItems.length);
  const canReorder = filterMode === "all";
  const sortableIds = useMemo(() => filteredMediaItems.map((item) => item.id), [filteredMediaItems]);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 }
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!canReorder) return;
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;
      const fromIndex = mediaOrder.indexOf(activeId);
      const toIndex = mediaOrder.indexOf(overId);
      if (fromIndex < 0 || toIndex < 0) return;
      const nextOrder = arrayMove(mediaOrder, fromIndex, toIndex);
      setMediaOrder(nextOrder);
      const nextJobOrder = nextOrder.filter((id) => Boolean(jobsById[id]));
      if (!areIdsEqual(nextJobOrder, jobOrder)) {
        dispatch(setJobOrder(nextJobOrder));
      }
      const localMap = new Map(localMedia.map((item) => [item.id, item]));
      const nextLocal = nextOrder
        .filter((id) => localMap.has(id))
        .map((id) => localMap.get(id) as MediaItem);
      const currentLocalIds = localMedia.map((item) => item.id);
      const nextLocalIds = nextLocal.map((item) => item.id);
      if (!areIdsEqual(currentLocalIds, nextLocalIds)) {
        setLocalMedia(nextLocal);
      }
      persistMediaOrder(nextOrder);
    },
    [
      areIdsEqual,
      canReorder,
      dispatch,
      jobOrder,
      jobsById,
      localMedia,
      mediaOrder,
      persistMediaOrder,
      setLocalMedia
    ]
  );

  const handleMediaItemActivate = useCallback((item: MediaItem) => {
    if (item.invalid) {
      const shouldRemove = window.confirm("This media file has changed or is missing. Remove this job?");
      if (shouldRemove) {
        if (item.source === "local") {
          removeLocalItem(item);
        } else if (item.jobId) {
          void handleRemoveJob(null, item.jobId);
        }
      }
      return;
    }
    const isYoutube = item.externalSource?.type === "youtube";
    if (isYoutube) {
      const existingStreamUrl = item.streamUrl ?? item.externalSource?.streamUrl ?? null;
      const streamExpired = existingStreamUrl ? isYoutubeStreamExpired(existingStreamUrl) : false;
      const shouldUseExistingStream = Boolean(existingStreamUrl) && !streamExpired && !item.streamError;
      if (shouldUseExistingStream) {
        const stableSource = item.externalSource
          ? { ...item.externalSource, streamUrl: existingStreamUrl }
          : item.externalSource;
        const stableItem: MediaItem = {
          ...item,
          previewUrl: item.previewUrl ?? existingStreamUrl,
          streamUrl: existingStreamUrl,
          externalSource: stableSource,
          isResolvingStream: false
        };
        setSelectedId(stableItem.id);
        selectedIdRef.current = stableItem.id;
        props.onAddToTimeline?.([stableItem]);
        return;
      }
      const fallbackPreviewUrl = item.localPath ? toFileUrl(item.localPath) : item.previewUrl ?? null;
      const pendingSource = item.externalSource
        ? { ...item.externalSource, streamUrl: null }
        : item.externalSource;
      const pendingItem: MediaItem = {
        ...item,
        previewUrl: fallbackPreviewUrl,
        streamUrl: null,
        externalSource: pendingSource,
        isResolvingStream: true,
        streamError: null
      };
      setSelectedId(pendingItem.id);
      selectedIdRef.current = pendingItem.id;
      props.onAddToTimeline?.([pendingItem]);
      const resolveToken = ++resolveTokenRef.current;
      const requestedId = pendingItem.id;
      const requestedJobId = item.source === "job" ? item.jobId ?? null : null;
      const resolveTarget: MediaItem = {
        ...item,
        previewUrl: fallbackPreviewUrl ?? null
      };
      void resolveYoutubeStream(resolveTarget).then((refreshed) => {
        if (!refreshed) return;
        if (resolveTokenRef.current !== resolveToken) return;
        if (selectedIdRef.current !== requestedId) return;
        if (requestedJobId && selectedJobIdRef.current !== requestedJobId) return;
        props.onAddToTimeline?.([refreshed]);
      });
      return;
    }
    setSelectedId(item.id);
    selectedIdRef.current = item.id;
    props.onAddToTimeline?.([item]);
  }, [handleRemoveJob, props.onAddToTimeline, removeLocalItem, resolveYoutubeStream, toFileUrl]);

  const handleMediaItemContextMenu = useCallback((e: React.MouseEvent, item: MediaItem) => {
    setSelectedId(item.id);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  }, []);

  useEffect(() => {
    if (selectedId && !mediaItems.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [mediaItems, selectedId]);

  useEffect(() => {
    const videoJobs = mediaItems.filter(
      (item) =>
        item.source === "job" &&
        item.kind === "video" &&
        item.previewUrl &&
        item.externalSource?.type !== "youtube"
    );
    videoJobs.forEach((item) => {
      if (item.thumbnailUrl || jobPreviewMeta[item.id] || jobThumbInFlight.current.has(item.id)) {
        return;
      }
      jobThumbInFlight.current.add(item.id);
      scheduleIdle(() => {
        void (async () => {
          try {
            const meta = await captureVideoThumbnailFromUrl(item.previewUrl as string);
            setJobPreviewMeta((prev) => ({
              ...prev,
              [item.id]: {
                thumbnailUrl: meta.thumbnail ?? null,
                durationSec: meta.duration || null
              }
            }));
            persistThumbnail(item.id, meta.thumbnail);
          } finally {
            jobThumbInFlight.current.delete(item.id);
          }
        })();
      });
    });
  }, [jobPreviewMeta, mediaItems, persistThumbnail, scheduleIdle]);

  useEffect(() => {
    const youtubeItems = mediaItems.filter((item) => item.externalSource?.type === "youtube");
    youtubeItems.forEach((item) => {
      const cachedThumb = item.thumbnailUrl || jobPreviewMeta[item.id]?.thumbnailUrl;
      if (cachedThumb && isDataUrl(cachedThumb)) {
        return;
      }
      if (youtubeThumbInFlight.current.has(item.id)) {
        return;
      }
      const thumbnailUrl = resolveYoutubeThumbnailUrl(item);
      if (!thumbnailUrl) return;
      youtubeThumbInFlight.current.add(item.id);
      scheduleIdle(() => {
        void (async () => {
          try {
            const thumbnail = await captureImageThumbnailFromUrl(thumbnailUrl);
            if (!thumbnail) return;
            if (item.source === "local") {
              setLocalMedia((prev) =>
                prev.map((m) => (m.id === item.id ? { ...m, thumbnailUrl: thumbnail } : m))
              );
            } else {
              setJobPreviewMeta((prev) => ({
                ...prev,
                [item.id]: {
                  ...prev[item.id],
                  thumbnailUrl: thumbnail ?? null
                }
              }));
            }
            if (item.jobId) {
              persistThumbnail(item.jobId, thumbnail);
            }
          } finally {
            youtubeThumbInFlight.current.delete(item.id);
          }
        })();
      });
    });
  }, [
    captureImageThumbnailFromUrl,
    jobPreviewMeta,
    mediaItems,
    persistThumbnail,
    resolveYoutubeThumbnailUrl,
    scheduleIdle,
    setLocalMedia
  ]);

  async function handleRemoveJob(e: React.MouseEvent | null, id: string) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      await dispatch(removeJob({ jobId: id, skipConfirm: true, silent: true })).unwrap();
      setSelectedId((prev) => (prev === id ? null : prev));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      props.notify(`Failed to remove media: ${message}`, "error");
    }
  }

  function buildJobItem(id: string): MediaItem | null {
    const job = jobsById[id];
    if (!job) return null;
    const jobDuration =
      (job.result as any)?.audio_duration ||
      (job.result as any)?.duration ||
      (job.partialResult as any)?.audio_duration ||
      (job.partialResult as any)?.duration ||
      null;
    const kind = getKind(job.filename);
    if (kind === "caption") return null;
    const localMatch = localMedia.find((item) => item.name === job.filename && item.kind === "video");
    const meta = jobPreviewMeta[id];
    const mediaPath = job.audioFile?.path || job.result?.file_path || null;
    const rawSource =
      job.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>).mediaSource : null;
    const sourceError =
      job.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>).mediaSourceError : null;
    const externalSource =
      rawSource && typeof rawSource === "object" && rawSource.type === "youtube"
        ? {
            type: "youtube" as const,
            url: typeof rawSource.url === "string" ? rawSource.url : null,
            streamUrl: typeof rawSource.streamUrl === "string" ? rawSource.streamUrl : null,
            title: typeof rawSource.title === "string" ? rawSource.title : null,
            id: typeof rawSource.id === "string" ? rawSource.id : null,
            thumbnailUrl: typeof rawSource.thumbnailUrl === "string" ? rawSource.thumbnailUrl : null
          }
        : null;
    const streamUrl = externalSource?.streamUrl || null;
    const previewUrl = streamUrl ?? (mediaPath ? toFileUrl(mediaPath) : null);
    const persistedThumbnail =
      job.uiState && typeof job.uiState === "object" && typeof (job.uiState as any)?.thumbnail?.data === "string"
        ? (job.uiState as any).thumbnail.data
        : null;
    const hasCapturedThumb = Boolean(localMatch?.thumbnailUrl || meta?.thumbnailUrl);
    const hasRemoteThumb = Boolean(externalSource?.thumbnailUrl);
    const thumbnailSource = persistedThumbnail
      ? "saved"
      : hasCapturedThumb || hasRemoteThumb
        ? "captured"
        : "none";
    return {
      id,
      name: job.filename || id,
      displayName: job.displayName ?? job.filename ?? id,
      kind,
      source: "job",
      jobId: id,
      localPath: mediaPath,
      previewUrl,
      streamUrl,
      externalSource,
      createdAt: job.startTime || Date.now(),
      durationSec:
        typeof jobDuration === "number" ? jobDuration : meta?.durationSec ?? localMatch?.durationSec ?? null,
      thumbnailUrl:
        localMatch?.thumbnailUrl ??
        meta?.thumbnailUrl ??
        persistedThumbnail ??
        externalSource?.thumbnailUrl ??
        null,
      thumbnailSource,
      invalid: Boolean(job.mediaInvalid),
      streamError: typeof sourceError === "string" ? sourceError : null
    };
  }

  async function submitTranscription() {
    const selectedItem = selectedId ? mediaItems.find((item) => item.id === selectedId) : null;
    const selectedJob =
      selectedItem?.source === "job" && selectedItem.jobId ? jobsById[selectedItem.jobId] : null;
    const reuseJobId = selectedJob?.status === "imported" ? selectedJob.id : null;
    const importedJobId =
      !reuseJobId && selectedItem?.source === "job" && selectedItem.jobId && jobsById[selectedItem.jobId]?.status === "imported"
        ? selectedItem.jobId
        : null;
    const filePath = selectedItem?.localPath ?? null;
    const filename = selectedItem?.name || selectedFile?.name;
    if (!filename) {
      props.notify("Please select a file first", "info");
      return;
    }
    if (!filePath) {
      props.notify("Please use Open to select a local media file.", "error");
      return;
    }

    try {
      const displayName = selectedItem?.displayName ?? (stripFileExtension(filename) || filename);
      const transcriptionKind =
        selectedItem?.transcriptionKind ??
        (selectedItem?.kind === "audio" || selectedItem?.kind === "video" ? selectedItem.kind : undefined);
      const secondCaptionEnabled = Boolean(props.secondCaptionEnabled);
      const secondCaptionLanguage = secondCaptionEnabled ? props.secondCaptionLanguage ?? "en" : undefined;
      const chineseStyle = secondCaptionEnabled ? undefined : settings.chineseStyle;
      const { job } = await dispatch(
        startTranscription({
          jobId: reuseJobId,
          file: undefined,
          filePath,
          filename,
          displayName,
          mediaKind: transcriptionKind,
          language: settings.language,
          model: settings.model,
          noiseSuppression: settings.noiseSuppression,
          chineseStyle,
          chineseScript: exportLanguage,
          secondCaptionEnabled,
          secondCaptionLanguage
        })
      ).unwrap();

      if (selectedItem?.source === "local") {
        const index = mediaOrder.indexOf(selectedItem.id);
        if (index >= 0) {
          const nextOrder = [...mediaOrder];
          nextOrder[index] = job.id;
          setMediaOrder(nextOrder);
          const nextJobOrder = nextOrder.filter((id) => id === job.id || Boolean(jobsById[id]));
          dispatch(setJobOrder(nextJobOrder));
          persistMediaOrder(nextOrder);
        }
      }

      if (displayName) {
        dispatch(updateJobDisplayName({ jobId: job.id, displayName }));
        void apiUpsertJobRecord({ job_id: job.id, filename, display_name: displayName }).catch(() => undefined);
      }
      if (selectedItem?.externalSource?.type === "youtube") {
        const existingUiState =
          job.uiState && typeof job.uiState === "object" ? (job.uiState as Record<string, any>) : {};
        const nextUiState = {
          ...existingUiState,
          mediaSource: {
            type: "youtube",
            url: selectedItem.externalSource.url ?? null,
            streamUrl: selectedItem.externalSource.streamUrl ?? null,
            title: selectedItem.externalSource.title ?? null,
            id: selectedItem.externalSource.id ?? null,
            thumbnailUrl: selectedItem.externalSource.thumbnailUrl ?? null
          }
        };
        dispatch(updateJobUiState({ jobId: job.id, uiState: nextUiState }));
        void apiUpsertJobRecord({ job_id: job.id, ui_state: nextUiState }).catch(() => undefined);
      }

      if (selectedItem?.source === "local") {
        removeLocalItem(selectedItem);
      }
      if (importedJobId) {
        void dispatch(removeJob({ jobId: importedJobId, skipConfirm: true, silent: true }))
          .unwrap()
          .catch(() => undefined);
      }
      setSelectedId(job.id);
      clearSelectedFile();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      props.notify(`Upload failed: ${message}`, "error");
    }
  }

  return (
    <>
      <div
        className="flex h-full min-h-0 flex-col space-y-3"
        onPointerDownCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("[data-media-row]")) return;
          if (target.closest("[data-media-toolbar]")) return;
          if (target.closest("[data-media-menu]")) return;
          setSelectedId(null);
          setContextMenu(null);
          props.onClearSelection?.();
        }}
      >
        <div className="flex items-center justify-between gap-2" data-media-toolbar>
          <span className="text-[11px] font-semibold text-slate-400">
            {filteredMediaItems.length} Job{filteredMediaItems.length === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-2">
            <div className="relative" ref={viewMenuRef}>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#1b1b22] text-[10px] text-slate-200 transition hover:bg-[#26262f]"
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterMenuOpen(false);
                  setViewMenuOpen((prev) => !prev);
                }}
                type="button"
                aria-label="View"
                title="View"
              >
                <AppIcon name="sort" />
              </button>
              {viewMenuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-32 overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-lg" data-media-menu>
                  {[
                    { id: "list-view", label: "List View" },
                    { id: "list", label: "List" }
                  ].map((option) => (
                    <button
                      key={option.id}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#1b1b22]",
                        viewMode === option.id && "bg-[#1b1b22] text-white"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewMode(option.id as "list-view" | "list");
                        setViewMenuOpen(false);
                      }}
                      type="button"
                    >
                      {option.label}
                      {viewMode === option.id ? <AppIcon name="check" className="text-[10px]" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="relative" ref={filterMenuRef}>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#1b1b22] text-[10px] text-slate-200 transition hover:bg-[#26262f]"
                onClick={(e) => {
                  e.stopPropagation();
                  setViewMenuOpen(false);
                  setFilterMenuOpen((prev) => !prev);
                }}
                type="button"
                aria-label="Filter media"
                title="Filter"
              >
                <AppIcon name="filter" />
              </button>
              {filterMenuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-lg" data-media-menu>
                  {[
                    { id: "all", label: "All" },
                    { id: "video", label: "Video" },
                    { id: "audio", label: "Audio" }
                  ].map((option) => (
                    <button
                      key={option.id}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#1b1b22]",
                        filterMode === option.id && "bg-[#1b1b22] text-white"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFilterMode(option.id as "all" | "video" | "audio");
                        setFilterMenuOpen(false);
                      }}
                      type="button"
                    >
                      {option.label}
                      {filterMode === option.id ? <AppIcon name="check" className="text-[10px]" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex-1 rounded-xl p-1"
          )}
          onDragOver={(e) => {
            const types = Array.from(e.dataTransfer?.types ?? []);
            if (!types.includes("Files")) return;
            e.preventDefault();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            const types = Array.from(e.dataTransfer?.types ?? []);
            if (!types.includes("Files")) return;
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) addLocalFiles(files);
          }}
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
              <div className={cn(viewMode === "list" ? "space-y-px" : "space-y-2")}>
                {filteredMediaItems.map((item) => {
                  const job = item.source === "job" && item.jobId ? jobsById[item.jobId] : null;
                  const updatedAt = job?.completedAt ?? job?.startTime ?? item.createdAt ?? null;
                  const isSelected = selectedId === item.id;
                  const isProcessingJob = job?.status === "processing" || job?.status === "queued";
                  return (
                    <SortableMediaRow
                      key={item.id}
                      item={item}
                      updatedAt={updatedAt}
                      isSelected={isSelected}
                      isProcessingJob={isProcessingJob}
                      canReorder={canReorder}
                      viewMode={viewMode}
                      getPreviewKind={getPreviewKind}
                      onActivate={handleMediaItemActivate}
                      onContextMenu={handleMediaItemContextMenu}
                      formatTimestamp={formatTimestamp}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {!hasMediaItems ? (
            <div className="py-6 text-center text-[11px] text-slate-500">
              No media yet. Use Open in the header to add a file.
            </div>
          ) : null}
        </div>

        {contextMenu ? (
          <div
            ref={contextMenuRef}
            className="fixed z-[100] min-w-[160px] overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-xl"
            data-media-menu
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
              onClick={(e) => {
                e.preventDefault();
                const target = contextMenu.item;
                setContextMenu(null);
                const toRemove = [target];
                toRemove.forEach((item) => {
                  if (item.source === "local") {
                    removeLocalItem(item);
                  } else if (item.jobId) {
                    void handleRemoveJob(e, item.jobId);
                  }
                });
              }}
              type="button"
            >
              <AppIcon name="trashAlt" />
              Remove
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_MEDIA_TYPES}
          className="hidden"
          onChange={() => {
            const files = Array.from(fileInputRef.current?.files ?? []);
            if (files.length) {
              addLocalFiles(files);
            }
          }}
        />

      </div>
    </>
  );
}));

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ForwardedRef,
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
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import { removeJob, setJobOrder, startTranscription, updateJobDisplayName, updateJobUiState } from "../../jobs/jobsSlice";
import type { ToastType } from "../../../shared/components/ToastHost";
import { apiRemoveJob, apiUpsertJobRecord } from "../../../shared/api/sttApi";
import { AppIcon } from "../../../shared/components/AppIcon";
import { cn } from "../../../shared/lib/cn";
import { stripFileExtension } from "../../../shared/lib/utils";

export type UploadTabHandle = {
  submitTranscription: () => Promise<void>;
  hasSelection: () => boolean;
  openFilePicker: () => void;
};

export type MediaItem = {
  id: string;
  name: string;
  displayName?: string;
  kind: "video" | "audio" | "caption" | "other";
  source: "job" | "local";
  jobId?: string;
  file?: File;
  localPath?: string | null;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  thumbnailSource?: "saved" | "captured" | "none";
  createdAt?: number;
  durationSec?: number | null;
  invalid?: boolean;
};

type UploadTabProps = {
  notify: (message: string, type?: ToastType) => void;
  onSelectionChange?: (hasFile: boolean, filename?: string | null, file?: File | null) => void;
  onAddToTimeline?: (items: MediaItem[]) => void;
  onClearSelection?: () => void;
  localMedia?: MediaItem[];
  onLocalMediaChange?: Dispatch<SetStateAction<MediaItem[]>>;
  onRequestFilePicker?: (open: () => void) => void;
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

export const UploadTab = forwardRef(function UploadTab(
  props: UploadTabProps,
  ref: ForwardedRef<UploadTabHandle>
) {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  const exportLanguage = useAppSelector((s) => s.transcript.exportLanguage);
  const jobsById = useAppSelector((s) => s.jobs.jobsById);
  const jobOrder = useAppSelector((s) => s.jobs.order);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [filterMode, setFilterMode] = useState<"all" | "video" | "audio">("all");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const [localMediaState, setLocalMediaState] = useState<MediaItem[]>([]);
  const localMedia = props.localMedia ?? localMediaState;
  const setLocalMedia = props.onLocalMediaChange ?? setLocalMediaState;
  const [jobPreviewMeta, setJobPreviewMeta] = useState<
    Record<string, { thumbnailUrl?: string | null; durationSec?: number | null }>
  >({});
  const jobThumbInFlight = useRef<Set<string>>(new Set());
  const thumbSaveInFlight = useRef<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: MediaItem;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const formatTimestamp = useCallback((value?: number | null) => {
    if (!value || !Number.isFinite(value)) return "";
    return new Date(value).toLocaleString();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (sortMenuRef.current && !sortMenuRef.current.contains(target)) {
        setSortMenuOpen(false);
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

    if (sortMenuOpen || filterMenuOpen || contextMenu) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu, filterMenuOpen, sortMenuOpen]);

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
    openFilePicker: requestFilePicker
  }));

  useEffect(() => {
    props.onSelectionChange?.(Boolean(selectedFile), selectedFile?.name ?? null, selectedFile ?? null);
  }, [selectedFile, props.onSelectionChange]);


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

  function buildLocalPathItem(args: { path: string; name: string; size?: number | null; mime?: string | null }): MediaItem {
    const id = `local-path-${args.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = toFileUrl(args.path);
    const jobId = buildImportedJobId(args.path, args.size);
    return {
      id,
      name: args.name,
      displayName: stripFileExtension(args.name) || args.name,
      kind: getKind(args.name),
      source: "local",
      jobId,
      file: undefined,
      localPath: args.path,
      previewUrl,
      thumbnailUrl: null,
      createdAt: Date.now(),
      durationSec: null
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

  function addLocalPathItem(args: { path: string; name: string; size?: number | null; mime?: string | null }) {
    const item = buildLocalPathItem(args);
    setLocalMedia((prev) => [item, ...prev]);
    setSelectedId(item.id);
    props.onAddToTimeline?.([item]);
    clearSelectedFile();
    if (item.jobId && item.localPath) {
      const displayName = item.displayName ?? (stripFileExtension(args.name) || args.name);
      void apiUpsertJobRecord({
        job_id: item.jobId,
        filename: args.name,
        display_name: displayName,
        media_path: item.localPath,
        media_kind: item.kind,
        status: "imported"
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

  const mediaItems = useMemo(() => {
    const jobItems = jobOrder
      .map((id) => buildJobItem(id))
      .filter(Boolean) as MediaItem[];
    return [...localMedia, ...jobItems];
  }, [jobOrder, localMedia, jobsById, jobPreviewMeta]);

  const filteredMediaItems = useMemo(() => {
    let items = [...mediaItems];
    if (filterMode !== "all") {
      items = items.filter((item) => item.kind === filterMode);
    }
    if (sortMode === "name") {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }
    return items;
  }, [filterMode, mediaItems, sortMode]);

  const hasMediaItems = Boolean(filteredMediaItems.length);
  const canReorder = sortMode === "recent" && filterMode === "all";
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

      const activeItem = filteredMediaItems.find((item) => item.id === activeId);
      const overItem = filteredMediaItems.find((item) => item.id === overId);
      if (!activeItem || !overItem) return;
      if (activeItem.source !== overItem.source) return;

      if (activeItem.source === "job") {
        const fromIndex = jobOrder.indexOf(activeId);
        const toIndex = jobOrder.indexOf(overId);
        if (fromIndex < 0 || toIndex < 0) return;
        dispatch(setJobOrder(arrayMove(jobOrder, fromIndex, toIndex)));
        return;
      }

      if (activeItem.source === "local") {
        const fromIndex = localMedia.findIndex((item) => item.id === activeId);
        const toIndex = localMedia.findIndex((item) => item.id === overId);
        if (fromIndex < 0 || toIndex < 0) return;
        setLocalMedia(arrayMove(localMedia, fromIndex, toIndex));
      }
    },
    [canReorder, dispatch, filteredMediaItems, jobOrder, localMedia, setLocalMedia]
  );

  const SortableMediaRow = ({
    item,
    updatedAt,
    isSelected,
    isProcessingJob
  }: {
    item: MediaItem;
    updatedAt: number | null;
    isSelected: boolean;
    isProcessingJob: boolean;
  }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.id,
      disabled: !canReorder
    });
    const style = {
      transform: CSS.Transform.toString(transform),
      transition
    };

    return (
      <div ref={setNodeRef} style={style}>
        <button
          data-media-row
          className={cn(
            "relative w-full rounded-lg border border-slate-800/70 bg-[#141417] px-3 py-2 text-left transition hover:border-slate-600 focus:outline-none focus-visible:outline-none",
            canReorder && "cursor-grab active:cursor-grabbing",
            isDragging && "shadow-[0_12px_24px_rgba(0,0,0,0.35)]",
            isSelected && "border-primary/70 ring-1 ring-primary/30",
            item.invalid && "border-rose-500/50"
          )}
          {...attributes}
          {...listeners}
          onClick={(event) => {
            if (item.invalid) {
              event.preventDefault();
              event.stopPropagation();
              const shouldRemove = window.confirm(
                "This media file has changed or is missing. Remove this job?"
              );
              if (shouldRemove) {
                if (item.source === "local") {
                  removeLocalItem(item);
                } else if (item.jobId) {
                  void handleRemoveJob(null, item.jobId);
                }
              }
              return;
            }
            setSelectedId(item.id);
            props.onAddToTimeline?.([item]);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setSelectedId(item.id);
            setContextMenu({
              x: e.clientX,
              y: e.clientY,
              item
            });
          }}
          type="button"
        >
          <div className={cn("flex w-full items-center gap-3", isProcessingJob && "blur-[1.5px]")}>
            {item.kind === "video" && item.thumbnailUrl ? (
              <div className="h-10 w-16 overflow-hidden rounded-md bg-[#0f0f10]">
                <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-10 w-16 items-center justify-center rounded-md bg-[#0f0f10] text-slate-300">
                <AppIcon name={item.kind === "video" ? "video" : "volume"} className="text-[14px]" />
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
                {item.displayName ?? item.name}
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
          {isProcessingJob ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
              <AppIcon name="spinner" spin className="text-[16px] text-slate-100" />
            </div>
          ) : null}
        </button>
      </div>
    );
  };

  useEffect(() => {
    if (selectedId && !mediaItems.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [mediaItems, selectedId]);

  useEffect(() => {
    const videoJobs = mediaItems.filter(
      (item) => item.source === "job" && item.kind === "video" && item.previewUrl
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
    const previewUrl = mediaPath ? toFileUrl(mediaPath) : null;
    const persistedThumbnail =
      job.uiState && typeof job.uiState === "object" && typeof (job.uiState as any)?.thumbnail?.data === "string"
        ? (job.uiState as any).thumbnail.data
        : null;
    const thumbnailSource = persistedThumbnail
      ? "saved"
      : localMatch?.thumbnailUrl || meta?.thumbnailUrl
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
      createdAt: job.startTime || Date.now(),
      durationSec:
        typeof jobDuration === "number" ? jobDuration : meta?.durationSec ?? localMatch?.durationSec ?? null,
      thumbnailUrl: localMatch?.thumbnailUrl ?? meta?.thumbnailUrl ?? persistedThumbnail ?? null,
      thumbnailSource,
      invalid: Boolean(job.mediaInvalid)
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
      const { job } = await dispatch(
        startTranscription({
          jobId: reuseJobId,
          file: undefined,
          filePath,
          filename,
          displayName,
          mediaKind: (selectedItem?.kind === "audio" || selectedItem?.kind === "video") ? selectedItem.kind : undefined,
          language: settings.language,
          model: settings.model,
          noiseSuppression: settings.noiseSuppression,
          chineseStyle: settings.chineseStyle,
          chineseScript: exportLanguage
        })
      ).unwrap();

      if (displayName) {
        dispatch(updateJobDisplayName({ jobId: job.id, displayName }));
        void apiUpsertJobRecord({ job_id: job.id, filename, display_name: displayName }).catch(() => undefined);
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
            <div className="relative" ref={sortMenuRef}>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#1b1b22] text-[10px] text-slate-200 transition hover:bg-[#26262f]"
                onClick={(e) => {
                  e.stopPropagation();
                  setFilterMenuOpen(false);
                  setSortMenuOpen((prev) => !prev);
                }}
                type="button"
                aria-label="Sort media"
                title="Sort"
              >
                <AppIcon name="sort" />
              </button>
              {sortMenuOpen ? (
                <div className="absolute right-0 z-50 mt-2 w-32 overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-lg" data-media-menu>
                  {[
                    { id: "recent", label: "Recent" },
                    { id: "name", label: "Name" }
                  ].map((option) => (
                    <button
                      key={option.id}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#1b1b22]",
                        sortMode === option.id && "bg-[#1b1b22] text-white"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSortMode(option.id as "recent" | "name");
                        setSortMenuOpen(false);
                      }}
                      type="button"
                    >
                      {option.label}
                      {sortMode === option.id ? <AppIcon name="check" className="text-[10px]" /> : null}
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
                  setSortMenuOpen(false);
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
              <div className="space-y-2">
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
});

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { apiPreprocessAudio } from "../../../shared/api/sttApi";
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import { removeJob, startTranscription } from "../../jobs/jobsSlice";
import { setActiveTab } from "../../ui/uiSlice";
import type { AudioFileInfo, PreprocessResponse } from "../../../shared/types";
import type { ToastType } from "../../../shared/components/ToastHost";
import { AppIcon } from "../../../shared/components/AppIcon";
import { cn } from "../../../shared/lib/cn";

export type UploadTabHandle = {
  submitTranscription: () => Promise<void>;
  hasSelection: () => boolean;
  openFilePicker: () => void;
};

export type MediaItem = {
  id: string;
  name: string;
  kind: "video" | "audio" | "other";
  source: "job" | "local";
  jobId?: string;
  file?: File;
  previewUrl?: string | null;
  thumbnailUrl?: string | null;
  createdAt?: number;
  durationSec?: number | null;
};

type AudioTarget =
  | { kind: "job" | "preprocess"; id: string; audioFile: AudioFileInfo }
  | { kind: "none" };

const VIDEO_EXTENSIONS = new Set(["mp4", "m4v", "mov", "mkv", "avi", "webm", "flv", "mpg", "mpeg"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "m4a", "aac", "ogg", "opus"]);

function getKind(filename?: string | null) {
  const ext = filename?.split(".").pop()?.toLowerCase() ?? "";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  return "other";
}

export const UploadTab = forwardRef<UploadTabHandle, {
  audioRef: React.RefObject<HTMLAudioElement>;
  notify: (message: string, type?: ToastType) => void;
  onSelectionChange?: (hasFile: boolean, filename?: string | null, file?: File | null) => void;
  onAddToTimeline?: (items: MediaItem[]) => void;
  onDragPayloadChange?: (items: MediaItem[] | null) => void;
  localMedia?: MediaItem[];
  onLocalMediaChange?: Dispatch<SetStateAction<MediaItem[]>>;
}>(function UploadTab(props, ref) {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((s) => s.settings);
  const exportLanguage = useAppSelector((s) => s.transcript.exportLanguage);
  const selectedJobId = useAppSelector((s) => s.jobs.selectedJobId);
  const selectedJob = useAppSelector((s) => (selectedJobId ? s.jobs.jobsById[selectedJobId] : null));
  const jobsById = useAppSelector((s) => s.jobs.jobsById);
  const jobOrder = useAppSelector((s) => s.jobs.order);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const preprocessRequestIdRef = useRef(0);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preprocess, setPreprocess] = useState<PreprocessResponse | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [audioTarget, setAudioTarget] = useState<AudioTarget>({ kind: "none" });
  const [audioVersion, setAudioVersion] = useState(0);
  const lastSelectedJobIdRef = useRef<string | null>(null);
  const [sortMode, setSortMode] = useState<"recent" | "name">("recent");
  const [filterMode, setFilterMode] = useState<"all" | "video" | "audio">("all");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  const [localMediaState, setLocalMediaState] = useState<MediaItem[]>([]);
  const localMedia = props.localMedia ?? localMediaState;
  const setLocalMedia = props.onLocalMediaChange ?? setLocalMediaState;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    item: MediaItem;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

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
        setContextMenu(null);
      }
    }

    if (sortMenuOpen || filterMenuOpen || contextMenu) {
      window.addEventListener("click", handleClickOutside);
      return () => window.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu, filterMenuOpen, sortMenuOpen]);

  const audioUrl = useMemo(() => {
    if (audioTarget.kind === "none") return "";
    const cacheBuster = audioVersion ? `?v=${audioVersion}` : "";
    return `/audio/${audioTarget.id}${cacheBuster}`;
  }, [audioTarget, audioVersion]);

  useImperativeHandle(ref, () => ({
    submitTranscription,
    hasSelection: () => Boolean(selectedFile),
    openFilePicker: () => {
      fileInputRef.current?.click();
    }
  }));

  useEffect(() => {
    props.onSelectionChange?.(Boolean(selectedFile), selectedFile?.name ?? null, selectedFile ?? null);
  }, [selectedFile, props.onSelectionChange]);

  useEffect(() => {
    if (!selectedJob || !selectedJobId) {
      return;
    }

    const selectionChanged = lastSelectedJobIdRef.current !== selectedJobId;
    lastSelectedJobIdRef.current = selectedJobId;

    if (!selectionChanged && audioTarget.kind === "preprocess") {
      return;
    }

    const audioFile: AudioFileInfo = selectedJob.audioFile ?? {
      name: selectedJob.filename || selectedJobId,
      size: null,
      path: null,
      originalPath: null
    };
    setAudioTarget({ kind: "job", id: selectedJobId, audioFile });
  }, [selectedJobId, selectedJob, audioTarget.kind]);

  useEffect(() => {
    if (audioTarget.kind !== "job") return;
    if (audioTarget.id in jobsById) return;
    setAudioTarget({ kind: "none" });
  }, [audioTarget, jobsById]);

  useEffect(() => {
    const audioEl = props.audioRef.current;
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
  }, [audioUrl, props.audioRef]);

  useEffect(() => {
    if (!selectedJob || selectedJob.status !== "completed") return;
    if (audioTarget.kind !== "job" || audioTarget.id !== selectedJob.id) return;
    setAudioVersion((v) => v + 1);
  }, [audioTarget.kind, audioTarget.id, selectedJob?.status, selectedJob?.id]);

  const preprocessSelectedFile = useCallback(async (file: File) => {
    const requestId = preprocessRequestIdRef.current + 1;
    preprocessRequestIdRef.current = requestId;
    try {
      const preprocessInfo = await apiPreprocessAudio(file);
      if (preprocessRequestIdRef.current !== requestId) return;
      setPreprocess(preprocessInfo);

      const audioFile: AudioFileInfo = {
        name: preprocessInfo.audio_file?.name || file.name,
        size:
          typeof preprocessInfo.audio_file?.size === "number" ? preprocessInfo.audio_file?.size : file.size,
        path: preprocessInfo.audio_file?.path ?? null,
        wasTranscoded: Boolean(preprocessInfo.audio_file?.was_transcoded)
      };
      setAudioTarget({ kind: "preprocess", id: preprocessInfo.preprocess_id, audioFile });
      setAudioVersion((v) => v + 1);
    } catch (error) {
      if (preprocessRequestIdRef.current !== requestId) return;
      const message = error instanceof Error ? error.message : String(error);
      props.notify(message || "Failed to prepare audio for playback.", "error");
      setPreprocess(null);
    }
  }, [props.notify]);

  useEffect(() => {
    if (!selectedFile) return;
    void preprocessSelectedFile(selectedFile);
  }, [preprocessSelectedFile, selectedFile]);

  function clearSelectedFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setSelectedFile(null);
    setPreprocess(null);
    if (audioTarget.kind === "preprocess") {
      setAudioTarget({ kind: "none" });
      setAudioVersion((v) => v + 1);
    }
  }

  function buildLocalItem(file: File): MediaItem {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const id = `local-${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`;
    const previewUrl = URL.createObjectURL(file);
    return {
      id,
      name: file.name,
      kind: getKind(file.name),
      source: "local",
      file,
      previewUrl,
      thumbnailUrl: null,
      createdAt: Date.now(),
      durationSec: null
    };
  }

  async function captureVideoSprite(file: File) {
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

    const frameCount = 6;
    const targetHeight = 36;
    const aspect = width / height;
    let frameWidth = Math.max(40, Math.round(targetHeight * aspect));
    frameWidth = Math.min(frameWidth, 120);
    const canvas = document.createElement("canvas");
    canvas.width = frameWidth * frameCount;
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

    for (let i = 0; i < frameCount; i += 1) {
      const t = Math.min(duration - 0.1, (duration * (i + 0.5)) / frameCount);
      if (t < 0) continue;
      await seekTo(t);
      ctx.drawImage(video, 0, 0, width, height, i * frameWidth, 0, frameWidth, targetHeight);
    }

    const thumbnail = canvas.toDataURL("image/jpeg", 0.6);
    URL.revokeObjectURL(url);
    return { duration, thumbnail };
  }

  function addLocalFiles(files: File[]) {
    if (!files.length) return;
    const items = files.map(buildLocalItem);
    setLocalMedia((prev) => [...prev, ...items]);
    const lastFile = files[files.length - 1];
    setSelectedFile(lastFile);
    setPreprocess(null);

    items.forEach(async (item) => {
      if (!item.file) return;
      const meta =
        item.kind === "video"
          ? await captureVideoSprite(item.file as File)
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
    });
  }

  function removeLocalItem(item: MediaItem) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
    setLocalMedia((prev) => prev.filter((m) => m.id !== item.id));
    setSelectedIds((prev) => prev.filter((id) => id !== item.id));
    if (selectedFile && item.file === selectedFile) {
      clearSelectedFile();
    }
  }

  function getSelectionOrder(id: string) {
    const index = selectedIds.indexOf(id);
    return index >= 0 ? index + 1 : null;
  }

  function toggleSelection(item: MediaItem, index: number, event: React.MouseEvent) {
    const isMeta = event.metaKey || event.ctrlKey;
    const isShift = event.shiftKey;
    if (isShift && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      const rangeIds = filteredMediaItems.slice(start, end + 1).map((i) => i.id);
      setSelectedIds(Array.from(new Set([...selectedIds, ...rangeIds])));
      return;
    }

    if (isMeta) {
      setSelectedIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
    } else {
      setSelectedIds([item.id]);
    }
    lastSelectedIndexRef.current = index;
  }

  const mediaItems = useMemo(() => {
    const jobItems = jobOrder
      .map((id) => buildJobItem(id))
      .filter(Boolean) as MediaItem[];
    return [...localMedia, ...jobItems];
  }, [jobOrder, localMedia, jobsById]);

  const filteredMediaItems = useMemo(() => {
    let items = [...mediaItems];
    if (filterMode !== "all") {
      items = items.filter((item) => item.kind === filterMode);
    }
    if (sortMode === "name") {
      items.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return items;
  }, [filterMode, mediaItems, sortMode]);

  const selectedItems = filteredMediaItems.filter((item) => selectedIds.includes(item.id));
  const orderedSelectedItems = useMemo(
    () => selectedIds.map((id) => mediaItems.find((item) => item.id === id)).filter(Boolean) as MediaItem[],
    [mediaItems, selectedIds]
  );

  function setCustomDragImage(event: React.DragEvent<HTMLDivElement>, label: string) {
    const ghost = document.createElement("div");
    ghost.style.position = "absolute";
    ghost.style.top = "-1000px";
    ghost.style.left = "-1000px";
    ghost.style.padding = "6px 10px";
    ghost.style.borderRadius = "999px";
    ghost.style.background = "rgba(15, 23, 42, 0.92)";
    ghost.style.color = "#e2e8f0";
    ghost.style.fontSize = "12px";
    ghost.style.fontWeight = "600";
    ghost.style.border = "1px solid rgba(148, 163, 184, 0.35)";
    ghost.style.boxShadow = "0 6px 18px rgba(0,0,0,0.3)";
    ghost.innerText = label;
    document.body.appendChild(ghost);
    event.dataTransfer.setDragImage(ghost, 10, 10);
    window.setTimeout(() => {
      document.body.removeChild(ghost);
    }, 0);
  }

  const hasMediaItems = Boolean(filteredMediaItems.length);

  useEffect(() => {
    setSelectedIds((prev) => prev.filter((id) => mediaItems.some((item) => item.id === id)));
  }, [mediaItems]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!gridRef.current) return;
      if (event.key.toLowerCase() === "a" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSelectedIds(filteredMediaItems.map((item) => item.id));
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredMediaItems]);

  async function handleRemoveJob(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await dispatch(removeJob({ jobId: id, skipConfirm: true, silent: true })).unwrap();
      props.notify("Media removed.", "success");
      setSelectedIds((prev) => prev.filter((itemId) => itemId !== id));
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
    return {
      id,
      name: job.filename || id,
      kind: getKind(job.filename),
      source: "job",
      jobId: id,
      createdAt: job.startTime || Date.now(),
      durationSec: typeof jobDuration === "number" ? jobDuration : null
    };
  }

  async function submitTranscription() {
    if (!selectedFile) {
      props.notify("Please select a file first", "info");
      return;
    }

    try {
      await dispatch(
        startTranscription({
          file: selectedFile,
          language: settings.language,
          model: settings.model,
          noiseSuppression: settings.noiseSuppression,
          preprocessId: preprocess?.preprocess_id ?? null,
          chineseStyle: settings.chineseStyle,
          chineseScript: exportLanguage
        })
      ).unwrap();

      setPreprocess(null);
      dispatch(setActiveTab("captions"));
      props.notify("Job submitted successfully", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      props.notify(`Upload failed: ${message}`, "error");
    }
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button
            className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-slate-800/70 bg-[#151515] px-2 text-[10px] font-semibold text-slate-300 hover:border-slate-600"
            onClick={() => fileInputRef.current?.click()}
            type="button"
            title="Import"
            aria-label="Import"
          >
            <AppIcon name="upload" />
            <span className="hidden sm:inline">Import</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="relative" ref={sortMenuRef}>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/70 bg-[#151515] text-[10px] text-slate-300 hover:border-slate-600"
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
                <div className="absolute right-0 z-50 mt-2 w-32 overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-lg">
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
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/70 bg-[#151515] text-[10px] text-slate-300 hover:border-slate-600"
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
                <div className="absolute right-0 z-50 mt-2 w-36 overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-lg">
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
            "rounded-xl p-1",
            isDragOver && "ring-1 ring-primary/70"
          )}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("[data-media-card]")) return;
            setSelectedIds([]);
            lastSelectedIndexRef.current = null;
            setContextMenu(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) addLocalFiles(files);
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" ref={gridRef}>
            {filteredMediaItems.map((item, index) => {
              const order = getSelectionOrder(item.id);
              const isSelected = order !== null;
              return (
                <div
                  key={item.id}
                  data-media-card
                  className={cn(
                    "group relative rounded-lg border border-slate-800/70 bg-[#18181c] p-2 text-left transition hover:border-slate-600",
                    isSelected && "border-primary/80 ring-1 ring-primary/40"
                  )}
                draggable
                onDragStart={(e) => {
                  const dragItems = selectedIds.includes(item.id) ? orderedSelectedItems : [item];
                  if (!selectedIds.includes(item.id)) {
                    setSelectedIds([item.id]);
                  }
                  e.dataTransfer.setData("application/x-media-id", dragItems.map((i) => i.id).join(","));
                  setCustomDragImage(e, dragItems.length > 1 ? `${dragItems.length} items` : item.name);
                  props.onDragPayloadChange?.(dragItems);
                }}
                  onDragEnd={() => props.onDragPayloadChange?.(null)}
                  onClick={(e) => toggleSelection(item, index, e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      item
                    });
                  }}
                >
                {isSelected ? (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white shadow">
                      {order}
                    </div>
                  </div>
                ) : null}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition group-hover:opacity-100">
                  <button
                    className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-700/70 bg-black/70 px-3 py-1 text-[11px] font-semibold text-slate-200 backdrop-blur"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const itemsToAdd = orderedSelectedItems.length ? orderedSelectedItems : [item];
                      props.onAddToTimeline?.(itemsToAdd);
                    }}
                    type="button"
                  >
                    <AppIcon name="plus" />
                    Add to track
                  </button>
                </div>
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border border-slate-700/60 bg-gradient-to-br from-[#1f2937] via-[#111827] to-[#0f172a]">
                  {item.kind === "video" && item.previewUrl ? (
                    <video
                      src={item.previewUrl}
                      muted
                      playsInline
                      preload="auto"
                      onLoadedMetadata={(event) => {
                        const video = event.currentTarget;
                        const half = Number.isFinite(video.duration) ? Math.max(0, video.duration / 2) : 0;
                        try {
                          window.setTimeout(() => {
                            video.currentTime = Math.min(half, Math.max(0, video.duration - 0.1));
                          }, 50);
                        } catch {
                          // Ignore.
                        }
                      }}
                      onSeeked={(event) => {
                        const video = event.currentTarget;
                        try {
                          video.pause();
                        } catch {
                          // Ignore.
                        }
                      }}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[11px] text-slate-300">
                      <AppIcon name={item.kind === "video" ? "video" : "volume"} className="text-lg" />
                      <span className="uppercase tracking-[0.2em] text-slate-400">
                        {item.kind === "video" ? "Video" : item.kind === "audio" ? "Audio" : "Media"}
                      </span>
                      <span className="rounded-full border border-slate-700/60 px-2 py-0.5 text-[9px] text-slate-500">
                        {(item.name.split(".").pop() || "").toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2 truncate text-[11px] text-slate-200">{item.name}</div>
              </div>
              );
            })}
          </div>
          {!hasMediaItems ? (
            <div className="py-6 text-center text-[11px] text-slate-500">
              No media yet. Click Import to add files.
            </div>
          ) : null}
          <div className="sticky bottom-0 mt-3 flex items-center bg-[#0f0f10] py-2">
            <button
              className={cn(
                "inline-flex w-full items-center justify-center rounded-md bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition",
                orderedSelectedItems.length
                  ? "hover:border-slate-500"
                  : "cursor-not-allowed opacity-50"
              )}
              disabled={!orderedSelectedItems.length}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (!orderedSelectedItems.length) return;
                props.onAddToTimeline?.(orderedSelectedItems);
              }}
              type="button"
            >
              Add Selected {orderedSelectedItems.length} item(s)
            </button>
          </div>
        </div>

        {contextMenu ? (
          <div
            className="fixed z-[100] min-w-[160px] overflow-hidden rounded-lg border border-slate-800/70 bg-[#151515] text-[11px] text-slate-200 shadow-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
              onClick={(e) => {
                e.preventDefault();
                const target = contextMenu.item;
                setContextMenu(null);
                const toRemove = selectedIds.includes(target.id)
                  ? selectedItems
                  : [target];
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
          multiple
          accept=".mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.mp4,.m4v,.mov,.mkv,.avi,.webm,.flv,.mpg,.mpeg"
          className="hidden"
          onChange={() => {
            const files = Array.from(fileInputRef.current?.files ?? []);
            if (files.length) {
              addLocalFiles(files);
            }
          }}
        />

        <audio ref={props.audioRef} preload="metadata" src={audioUrl || undefined} className="sr-only" />
      </div>
    </>
  );
});

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { apiConvertChinese, apiEditSegment } from "../../../shared/api/sttApi";
import { fetchJobDetails, selectJobById, updateSegmentText } from "../../jobs/jobsSlice";
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import type { ExportLanguage, Job, TranscriptSegment } from "../../../shared/types";
import { jobNeedsServerResult, sanitizeProgressValue } from "../../../shared/lib/utils";
import type { ToastType } from "../../../shared/components/ToastHost";
import { AppIcon, type AppIconName } from "../../../shared/components/AppIcon";
import { cn } from "../../../shared/lib/cn";


function formatTimestamp(start: number, end: number): string {
  const startMin = Math.floor(Math.round(start) / 60);
  const startSec = Math.round(start) % 60;
  const endMin = Math.floor(Math.round(end) / 60);
  const endSec = Math.round(end) % 60;
  return `${startMin}:${startSec.toString().padStart(2, "0")} - ${endMin}:${endSec.toString().padStart(2, "0")}`;
}

function deriveStatusView(job: Job) {
  let statusIcon: { name: AppIconName; spin?: boolean } = { name: "clock" };
  let statusMessage = "Processing audio file...";

  if (job.status === "queued") {
    statusIcon = { name: "hourglassStart" };
    statusMessage = "Job queued, waiting to start...";
  } else if (job.status === "processing") {
    statusIcon = { name: "cog", spin: true };
    statusMessage = job.message || "Processing audio file...";
  } else if (job.status === "failed") {
    statusIcon = { name: "exclamationTriangle" };
    statusMessage = `Job failed: ${job.error || "Unknown error"}`;
  } else if (job.status === "cancelled") {
    statusIcon = { name: "ban" };
    statusMessage = "Job was cancelled before completion.";
  } else if (job.status === "completed") {
    statusIcon = { name: "checkCircle" };
    statusMessage = "Job completed, loading transcript...";
  }

  return { statusIcon, statusMessage };
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

function convertTextForDisplay(args: { text: string; converter: ((input: string) => string) | null }): string {
  if (!args.text) return "";
  if (args.converter) {
    try {
      return args.converter(args.text);
    } catch {
      return args.text;
    }
  }
  return args.text;
}

function TranscriptSegments(props: {
  segments: TranscriptSegment[];
  isStreaming: boolean;
  exportLanguage: ExportLanguage;
  timestampOffsetSeconds: number;
  mediaRef: RefObject<HTMLMediaElement>;
  notify: (message: string, type?: ToastType) => void;
  jobIdForEdits: string | null;
  onSavedEdit: (segmentId: number, newText: string) => void;
  isUserScrolling: boolean;
  onUserScroll: () => void;
}) {
  const [openCcReloadToken, setOpenCcReloadToken] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as any;
    if (win.OpenCC && typeof win.OpenCC.Converter === "function") return;

    const src = "/static/vendor/opencc/opencc.full.min.js";
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      const check = window.setInterval(() => {
        const ready = (window as any)?.OpenCC && typeof (window as any).OpenCC.Converter === "function";
        if (ready) {
          window.clearInterval(check);
          setOpenCcReloadToken((v) => v + 1);
        }
      }, 150);
      return () => window.clearInterval(check);
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => setOpenCcReloadToken((v) => v + 1);
    document.head.appendChild(script);
  }, []);

  const openCcConverter = useMemo(
    () => safeOpenCcConverter(props.exportLanguage),
    [props.exportLanguage, openCcReloadToken]
  );

  const [apiConvertedById, setApiConvertedById] = useState<Record<number, { source: string; converted: string }>>({});

  // Reset API conversion cache when switching target language.
  useEffect(() => {
    setApiConvertedById({});
  }, [props.exportLanguage]);

  // Fallback conversion (if OpenCC JS isn't available).
  useEffect(() => {
    if (openCcConverter) return;
    if (!props.segments || props.segments.length === 0) return;

    let cancelled = false;
    const pending = props.segments
      .map((segment) => {
        const source = segment.originalText ?? segment.text ?? "";
        if (!source) return null;
        const existing = apiConvertedById[segment.id];
        if (existing && existing.source === source) return null;
        return { id: segment.id, source };
      })
      .filter(Boolean) as Array<{ id: number; source: string }>;

    if (pending.length === 0) return;

    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const pendingById: Record<number, string> = {};
          pending.forEach((p) => {
            pendingById[p.id] = p.source;
          });
          const joined = pending.map((p) => `<<<SEG:${p.id}>>>\n${p.source}`).join("\n\n");
          const converted = await apiConvertChinese({ text: joined, target: props.exportLanguage });

          const parts = converted.split(/<<<SEG:(\d+)>>>\n/g);
          const next: Record<number, { source: string; converted: string }> = {};
          for (let i = 1; i < parts.length; i += 2) {
            const id = Number(parts[i]);
            if (!Number.isFinite(id)) continue;
            let text = parts[i + 1] ?? "";
            if (text.endsWith("\n\n")) text = text.slice(0, -2);
            const source = pendingById[id];
            if (source !== undefined) {
              next[id] = { source, converted: text };
            }
          }

          if (cancelled) return;
          setApiConvertedById((prev) => ({ ...prev, ...next }));
        } catch {
          // Ignore; fall back to raw text.
        }
      })();
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [apiConvertedById, openCcConverter, props.exportLanguage, props.segments]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [playingSegmentId, setPlayingSegmentId] = useState<number | null>(null);

  // Track current playing segment.
  useEffect(() => {
    const mediaEl = props.mediaRef.current;
    if (!mediaEl) return;

    const onTimeUpdate = () => {
      const currentTime = mediaEl.currentTime;

      let next: number | null = null;
      for (const segment of props.segments) {
        const segmentStart = Number(segment.start);
        const segmentEnd = Number(segment.end);
        if (!Number.isFinite(segmentStart) || !Number.isFinite(segmentEnd)) {
          continue;
        }
        const adjustedStart = segmentStart + props.timestampOffsetSeconds;
        const adjustedEnd = segmentEnd + props.timestampOffsetSeconds;
        if (currentTime >= adjustedStart && currentTime <= adjustedEnd) {
          next = segment.id;
          break;
        }
      }
      setPlayingSegmentId(next);
    };

    mediaEl.addEventListener("timeupdate", onTimeUpdate);
    return () => mediaEl.removeEventListener("timeupdate", onTimeUpdate);
  }, [props.mediaRef, props.segments, props.timestampOffsetSeconds]);

  useEffect(() => {
    const mediaEl = props.mediaRef.current;
    if (!mediaEl) return;

    setIsAudioPlaying(!mediaEl.paused);

    const onPlay = () => setIsAudioPlaying(true);
    const onPause = () => setIsAudioPlaying(false);
    const onEnded = () => setIsAudioPlaying(false);

    mediaEl.addEventListener("play", onPlay);
    mediaEl.addEventListener("pause", onPause);
    mediaEl.addEventListener("ended", onEnded);
    return () => {
      mediaEl.removeEventListener("play", onPlay);
      mediaEl.removeEventListener("pause", onPause);
      mediaEl.removeEventListener("ended", onEnded);
    };
  }, [props.mediaRef]);

  // Auto-scroll highlighted segment (unless user is actively scrolling).
  useEffect(() => {
    if (!playingSegmentId) return;
    if (props.isUserScrolling) return;
    if (!isAudioPlaying) return;
    const container = containerRef.current;
    const element = segmentRefs.current[playingSegmentId];
    if (!container || !element) return;

    const containerRect = container.getBoundingClientRect();
    const segmentRect = element.getBoundingClientRect();
    if (segmentRect.top < containerRect.top || segmentRect.bottom > containerRect.bottom) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isAudioPlaying, playingSegmentId, props.isUserScrolling]);

  function seekToSegment(startTime: number) {
    const mediaEl = props.mediaRef.current;
    if (!mediaEl) return;
    const numericStart = Number(startTime);
    if (!Number.isFinite(numericStart)) {
      return;
    }
    const adjustedTime = numericStart + props.timestampOffsetSeconds;
    mediaEl.currentTime = Math.max(0, adjustedTime);
    if (mediaEl.paused) {
      void mediaEl.play();
    }
  }

  const transcriptContainerClass = cn("min-h-0 flex-1 overflow-y-auto px-2 py-1", "stt-scrollbar");

  return (
    <div
      className={transcriptContainerClass}
      id="transcriptContent"
      ref={containerRef}
      onScroll={props.onUserScroll}
    >
      {props.segments.map((segment) => {
        const baseText = segment.originalText ?? segment.text ?? "";
        const displayText = openCcConverter
          ? convertTextForDisplay({ text: baseText, converter: openCcConverter })
          : apiConvertedById[segment.id]?.source === baseText
            ? apiConvertedById[segment.id].converted
            : baseText;

        const timeStr = formatTimestamp(segment.start, segment.end);

        const isCurrentPlaying = playingSegmentId === segment.id;
        const segmentClass = cn(
          "group relative flex cursor-pointer items-start border-b border-slate-800/70 px-2 py-2 transition",
          "hover:bg-[#151515]",
          props.isStreaming && !isCurrentPlaying && "border-l-[3px] border-warning pl-2 -ml-2",
          isCurrentPlaying && "bg-[#1b1b22] border-l-2 border-primary"
        );

        return (
          <TranscriptSegmentRow
            key={segment.id}
            segment={segment}
            segmentClass={segmentClass}
            isCurrentPlaying={isCurrentPlaying}
            timeStr={timeStr}
            displayText={displayText}
            onSeek={() => seekToSegment(segment.start)}
            mediaRef={props.mediaRef}
            notify={props.notify}
            jobIdForEdits={props.jobIdForEdits}
            onSavedEdit={props.onSavedEdit}
            rowRef={(el) => {
              segmentRefs.current[segment.id] = el;
            }}
          />
        );
      })}
    </div>
  );
}

const TranscriptSegmentRow = (function () {
  type Props = {
    segment: TranscriptSegment;
    segmentClass: string;
    isCurrentPlaying: boolean;
    timeStr: string;
    displayText: string;
    onSeek: () => void;
    mediaRef: RefObject<HTMLMediaElement>;
    notify: (message: string, type?: ToastType) => void;
    jobIdForEdits: string | null;
    onSavedEdit: (segmentId: number, newText: string) => void;
    rowRef?: React.Ref<HTMLDivElement>;
  };

  return function TranscriptSegmentRowImpl(props: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(props.segment.originalText ?? props.segment.text);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
      if (!isEditing) {
        setDraft(props.segment.originalText ?? props.segment.text);
      }
    }, [props.segment.originalText, props.segment.text, isEditing]);

    async function saveEdit() {
      const jobId = props.jobIdForEdits;
      if (!jobId) {
        props.notify("No active job found", "error");
        return;
      }
      const newText = draft.trim();
      if (!newText) {
        props.notify("Segment text cannot be empty", "info");
        return;
      }

      setIsSaving(true);
      try {
        await apiEditSegment({ jobId, segmentId: props.segment.id, newText });
        props.onSavedEdit(props.segment.id, newText);
        setIsEditing(false);
        props.notify("Segment updated", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        props.notify(`Failed to save changes: ${message}`, "error");
      } finally {
        setIsSaving(false);
      }
    }

    function cancelEdit() {
      setDraft(props.segment.originalText ?? props.segment.text);
      setIsEditing(false);
    }

    function startEdit(e: React.MouseEvent) {
      e.stopPropagation();
      const mediaEl = props.mediaRef.current;
      if (mediaEl && !mediaEl.paused) {
        mediaEl.pause();
      }
      setIsEditing(true);
    }

    return (
      <div
        className={cn(
          props.segmentClass,
          isEditing && "cursor-default bg-[rgba(var(--primary-rgb),0.06)] border border-primary"
        )}
        data-start={props.segment.start}
        data-end={props.segment.end}
        data-segment-id={props.segment.id}
        onClick={(e) => {
          if (isEditing) return;
          if ((e.target as HTMLElement).closest("[data-segment-action]")) return;
          props.onSeek();
        }}
        ref={props.rowRef}
      >
        <div className="w-24 flex-shrink-0 whitespace-nowrap pt-[1px] text-xs font-medium tabular-nums text-text-secondary">
          [{props.timeStr}]
        </div>

        <div className="min-w-0 flex-1">
          {isEditing ? (
            <textarea
              data-segment-action
              className={cn(
                "w-full min-h-[4.25rem] max-h-[15rem] resize-y rounded-md border border-border bg-white px-2 py-1.5 text-[13px] leading-[1.45] text-text-primary shadow-sm",
                "focus:border-primary focus:outline-none focus:ring-2 focus:ring-[rgba(var(--primary-rgb),0.18)]"
              )}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void saveEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              autoFocus
            />
          ) : (
            <div
              className={cn(
                "whitespace-pre-wrap break-words text-[13px] leading-[1.45] text-text-primary",
                props.isCurrentPlaying && "font-semibold"
              )}
            >
              {props.displayText}
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="ml-2 flex flex-shrink-0 items-start gap-1 pt-[1px]" data-segment-action>
            <button
              data-segment-action
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-white text-success shadow-sm transition",
                "hover:border-success hover:bg-[rgba(16,185,129,0.10)] hover:text-success active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(16,185,129,0.25)]",
                "disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-white disabled:hover:scale-100"
              )}
              title="Save (Ctrl+Enter)"
              onClick={(e) => {
                e.stopPropagation();
                void saveEdit();
              }}
              disabled={isSaving}
              type="button"
            >
              <AppIcon name={isSaving ? "spinner" : "check"} spin={isSaving} className="text-[13px]" />
            </button>
            <button
              data-segment-action
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-white text-error shadow-sm transition",
                "hover:border-error hover:bg-[rgba(239,68,68,0.10)] hover:text-error active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(239,68,68,0.25)]",
                "disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-white disabled:hover:scale-100"
              )}
              title="Cancel (Esc)"
              onClick={(e) => {
                e.stopPropagation();
                cancelEdit();
              }}
              disabled={isSaving}
              type="button"
            >
              <AppIcon name="times" className="text-[13px]" />
            </button>
          </div>
        ) : null}

        {!isEditing ? (
          <button
            data-segment-action
            className={cn(
              "absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-white text-text-secondary shadow-sm opacity-0 invisible transition",
              "group-hover:opacity-100 group-hover:visible hover:border-primary hover:bg-[rgba(var(--primary-rgb),0.06)] hover:text-text-primary active:scale-95",
              "focus-visible:opacity-100 focus-visible:visible focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--primary-rgb),0.18)]"
            )}
            title="Edit segment"
            onClick={startEdit}
            type="button"
          >
            <AppIcon name="edit" className="text-[12px]" />
          </button>
        ) : null}
      </div>
    );
  };
})();

export function TranscriptPanel(props: {
  mediaRef: RefObject<HTMLMediaElement>;
  notify: (message: string, type?: ToastType) => void;
}) {
  const dispatch = useAppDispatch();
  const selectedJobId = useAppSelector((s) => s.jobs.selectedJobId);
  const job = useAppSelector((s) => selectJobById(s, selectedJobId));
  const exportLanguage = useAppSelector((s) => s.transcript.exportLanguage);
  const timestampOffsetSeconds = useAppSelector((s) => s.transcript.timestampOffsetSeconds);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);

  // Fetch server result for completed history entries that only include previews.
  useEffect(() => {
    if (!job || !selectedJobId) return;
    if (!jobNeedsServerResult(job)) return;
    dispatch(fetchJobDetails({ jobId: selectedJobId }))
      .unwrap()
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        props.notify(`Unable to load transcript for this job: ${message}`, "error");
      });
  }, [dispatch, job, props.notify, selectedJobId]);

  const statusView = job ? deriveStatusView(job) : null;

  const transcript = useMemo(() => {
    if (!job) return null;

    if (job.streamingSegments && job.streamingSegments.length > 0) {
      return { segments: job.streamingSegments, isStreaming: true, jobIdForEdits: null };
    }

    if (job.partialResult && job.partialResult.segments) {
      return { segments: job.partialResult.segments, isStreaming: false, jobIdForEdits: null };
    }

    if (job.result && job.result.segments) {
      return { segments: job.result.segments, isStreaming: false, jobIdForEdits: job.result.job_id || job.id };
    }

    return null;
  }, [job]);

  function onUserScroll() {
    setIsUserScrolling(true);
    if (scrollTimeoutRef.current) {
      window.clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = window.setTimeout(() => setIsUserScrolling(false), 3000);
  }

  const transcriptContainerClass = cn("min-h-0 flex-1 overflow-y-auto px-2 py-1", "stt-scrollbar");
  const emptyStateClass = "flex h-full items-center justify-center text-sm text-text-secondary";

  return (
    <div className="flex min-h-0 flex-1 flex-col" id="contentLayout">
      {!job ? (
        <div className={transcriptContainerClass} id="transcriptContent">
          <div className={emptyStateClass}>No transcript yet</div>
        </div>
      ) : job.status === "completed" && jobNeedsServerResult(job) ? (
        <div className={transcriptContainerClass} id="transcriptContent">
          <div className={emptyStateClass}>Loading transcript…</div>
        </div>
      ) : transcript && transcript.segments && transcript.segments.length > 0 ? (
        <TranscriptSegments
          segments={transcript.segments}
          isStreaming={transcript.isStreaming}
          exportLanguage={exportLanguage}
          timestampOffsetSeconds={timestampOffsetSeconds}
          mediaRef={props.mediaRef}
          notify={props.notify}
          jobIdForEdits={transcript.jobIdForEdits}
          onSavedEdit={(segmentId, newText) => {
            if (!selectedJobId) return;
            dispatch(updateSegmentText({ jobId: selectedJobId, segmentId, newText }));
          }}
          isUserScrolling={isUserScrolling}
          onUserScroll={onUserScroll}
        />
      ) : job.result && Array.isArray(job.result.segments) && job.result.segments.length === 0 ? (
        <div className={transcriptContainerClass} id="transcriptContent">
          <div className={emptyStateClass}>No speech detected</div>
        </div>
      ) : statusView ? (
        <div className={transcriptContainerClass} id="transcriptContent">
          <div className={emptyStateClass}>
            <div className="text-center">
              <AppIcon
                name={statusView.statusIcon.name}
                spin={Boolean(statusView.statusIcon.spin)}
                className="mb-2 text-2xl opacity-60"
              />
              <p className="text-sm font-semibold text-text-primary">{job.filename || "Processing job"}</p>
              <p className="mt-1 text-xs text-text-secondary">{statusView.statusMessage}</p>
              {job.status !== "completed"
                ? (() => {
                    const progressValue = sanitizeProgressValue(job.progress);
                    const progressPercent = progressValue !== null ? Math.round(progressValue) : null;
                    return progressPercent !== null ? (
                      <>
                        <div className="mt-3 w-full max-w-[240px] overflow-hidden rounded bg-border">
                          <div className="h-1.5 bg-primary" style={{ width: `${progressPercent}%` }}></div>
                        </div>
                        <p className="mt-1 text-xs text-text-secondary">{progressPercent}% complete</p>
                      </>
                    ) : null;
                  })()
                : null}
            </div>
          </div>
        </div>
      ) : (
        <div className={transcriptContainerClass} id="transcriptContent">
          <div className={emptyStateClass}>No transcript yet</div>
        </div>
      )}
    </div>
  );
}

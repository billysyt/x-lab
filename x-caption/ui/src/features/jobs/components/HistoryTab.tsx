import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../../../app/hooks";
import { removeJob, selectJobsState, selectJob } from "../jobsSlice";
import { formatElapsedTime, getJobProgressValue } from "../../../shared/lib/utils";
import type { ToastType } from "../../../shared/components/ToastHost";
import { AppIcon } from "../../../shared/components/AppIcon";
import { cn } from "../../../shared/lib/cn";

export function HistoryTab(props: { notify: (message: string, type?: ToastType) => void }) {
  const dispatch = useAppDispatch();
  const jobsState = useAppSelector(selectJobsState);
  const jobsById = jobsState.jobsById;
  const jobIds = jobsState.order;
  const selectedJobId = jobsState.selectedJobId;

  const jobs = useMemo(() => jobIds.map((id) => jobsById[id]).filter(Boolean), [jobIds, jobsById]);

  async function handleRemove(jobId: string, silent?: boolean) {
    try {
      const result = await dispatch(removeJob({ jobId, skipConfirm: false, silent: Boolean(silent) })).unwrap();
      if (!silent) props.notify(result.message, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "cancelled") {
        return;
      }
      if (!silent) props.notify(`Failed to remove job: ${message}`, "error");
    }
  }

  async function clearCompletedJobs() {
    const removable = new Set(["completed", "failed", "cancelled"]);
    const targets = jobIds.filter((id) => removable.has(jobsById[id]?.status));
    if (targets.length === 0) {
      props.notify("No completed or cancelled jobs to remove", "info");
      return;
    }

    let removedCount = 0;
    for (const jobId of targets) {
      try {
        await dispatch(removeJob({ jobId, skipConfirm: true, silent: true })).unwrap();
        removedCount += 1;
      } catch {
        // Ignore per-job failures; we'll report final count.
      }
    }

    if (removedCount > 0) {
      props.notify(`Removed ${removedCount} job${removedCount === 1 ? "" : "s"}`, "success");
    } else {
      props.notify("No jobs were removed", "info");
    }
  }

  async function clearOldJobs() {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const targets = jobIds.filter((id) => (jobsById[id]?.startTime ?? 0) < cutoff);
    if (targets.length === 0) {
      props.notify("No aged jobs to remove", "info");
      return;
    }

    let removedCount = 0;
    for (const jobId of targets) {
      try {
        await dispatch(removeJob({ jobId, skipConfirm: true, silent: true })).unwrap();
        removedCount += 1;
      } catch {
        // Ignore.
      }
    }

    if (removedCount > 0) {
      props.notify(
        `Removed ${removedCount} job${removedCount === 1 ? "" : "s"} older than 7 days`,
        "success"
      );
    } else {
      props.notify("No jobs were removed", "info");
    }
  }

  function onSelect(jobId: string) {
    const job = jobsById[jobId];
    dispatch(selectJob(jobId));
  }

  return (
    <div className="flex h-full min-h-0 flex-col" id="jobStatus">
      <div className="mb-2 flex items-center justify-end">
        <div className="flex items-center gap-2 text-xs">
          <button onClick={clearCompletedJobs} className="text-text-secondary transition hover:text-text-primary" type="button">
            Clear Completed
          </button>
          <span className="text-border">|</span>
          <button onClick={clearOldJobs} className="text-text-secondary transition hover:text-text-primary" type="button">
            Clear Old (7d+)
          </button>
        </div>
      </div>

      <div className="stt-scrollbar -mx-4 min-h-0 flex-1 overflow-y-auto" id="jobsContainer">
        {jobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 py-12 text-center text-text-secondary">
            <AppIcon name="inbox" className="mb-4 text-5xl opacity-30" />
            <div className="mb-2 text-base font-semibold text-text-primary">No Active Jobs</div>
            <div className="text-sm leading-6">
              Start transcribing by uploading
              <br />
              an audio file from the Upload tab
            </div>
          </div>
        ) : (
          jobs.map((job) => {
            const timeStr = formatElapsedTime(job.startTime);
            const stageProgress = getJobProgressValue(job);
            const progressWidth = Math.max(
              0,
              Math.min(100, stageProgress !== null ? stageProgress : job.status === "completed" ? 100 : 0)
            );
            const isSelected = selectedJobId === job.id;
            const subtitle = job.error ? `Error: ${job.error}` : job.message || "Processing...";
            const showProgressBar = job.status === "processing" || job.status === "queued";

            const statusLabel = (() => {
              switch (job.status) {
                case "queued":
                  return "Queued";
                case "processing":
                  return "Processing";
                case "completed":
                  return "Done";
                case "failed":
                  return "Failed";
                case "cancelled":
                  return "Cancelled";
                default:
                  return job.status;
              }
            })();

            const statusDotClass = cn(
              "h-1.5 w-1.5 rounded-full",
              job.status === "completed"
                ? "bg-success"
                : job.status === "failed"
                  ? "bg-error"
                  : job.status === "cancelled"
                    ? "bg-warning"
                    : job.status === "processing"
                      ? "bg-primary"
                      : "bg-text-secondary"
            );

            const statusBadge = cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold",
              job.status === "completed"
                ? "text-success"
                : job.status === "failed"
                  ? "text-error"
                  : job.status === "cancelled"
                    ? "text-warning"
                    : job.status === "processing"
                      ? "text-primary"
                      : "text-text-secondary"
            );

            return (
              <div
                key={job.id}
                className={cn(
                  "group relative w-full cursor-pointer border-t border-border px-4 py-2 transition-colors",
                  isSelected ? "bg-[rgba(var(--primary-rgb),0.05)]" : "bg-white hover:bg-secondary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--primary-rgb),0.18)] focus-visible:ring-inset"
                )}
                id={`job-${job.id}`}
                data-job-id={job.id}
                onClick={() => onSelect(job.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(job.id);
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary" title={job.filename}>
                    {job.filename}
                  </div>

                  <span className={statusBadge} title={statusLabel}>
                    <span className={statusDotClass} aria-hidden="true"></span>
                    {statusLabel}
                  </span>
                </div>

                <button
                  className={cn(
                    "absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-text-secondary opacity-0 transition-opacity",
                    "group-hover:opacity-100 hover:bg-border hover:text-text-primary active:bg-border",
                    "focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--primary-rgb),0.18)]"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleRemove(job.id);
                  }}
                  title="Remove Job"
                  aria-label="Remove Job"
                  type="button"
                >
                  <AppIcon name="trashAlt" className="text-[12px]" />
                </button>

                <div className="mt-0.5 flex items-center gap-2 text-[11px] leading-4">
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      job.error ? "font-semibold text-error" : "text-text-secondary"
                    )}
                    title={subtitle}
                  >
                    {subtitle}
                  </span>
                  {timeStr ? <span className="flex-shrink-0 text-text-secondary">{timeStr}</span> : null}
                </div>

                {showProgressBar ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-border">
                    <div
                      className={cn(
                        "h-full",
                        job.status === "failed"
                          ? "bg-error"
                          : job.status === "cancelled"
                            ? "bg-warning"
                            : "bg-primary"
                      )}
                      style={{ width: `${progressWidth}%` }}
                    ></div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

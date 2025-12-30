import { useEffect, useMemo, useRef } from "react";
import type { Job } from "../../../types";
import type { MediaItem } from "../../upload/components/UploadTab";
import { sanitizeProgressValue } from "../../../lib/utils";

type ActiveJobParams = {
  selectedJob: Job | null;
  activeMedia: MediaItem | null;
  jobsById: Record<string, Job>;
  isTranscribing: boolean;
};

export function useActiveJobState(params: ActiveJobParams) {
  const { selectedJob, activeMedia, jobsById, isTranscribing } = params;

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

  useEffect(() => {
    if (selectedJob?.uiState && typeof selectedJob.uiState === "object") {
      selectedJobUiStateRef.current = selectedJob.uiState as Record<string, any>;
      return;
    }
    selectedJobUiStateRef.current = {};
  }, [selectedJob?.id, selectedJob?.uiState]);

  return {
    selectedJobUiStateRef,
    activeJob,
    isActiveJobProcessing,
    isAnotherJobProcessing,
    activeJobProgress,
    showActiveJobOverlay,
    activeJobStatusMessage,
    activeJobLabel
  };
}

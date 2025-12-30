import { useEffect } from "react";
import { pollJobUpdates } from "../../features/jobs/jobsSlice";
import type { AppDispatch } from "../store";
import type { Job } from "../../shared/types";

export function useJobPolling(
  dispatch: AppDispatch,
  jobOrder: string[],
  jobsById: Record<string, Job>
) {
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
}

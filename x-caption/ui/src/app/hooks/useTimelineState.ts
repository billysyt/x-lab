import type { TimelinePanelProps } from "../../features/timeline/components/TimelinePanel";

export function useTimelineState(timelinePanelProps: TimelinePanelProps) {
  return { timelinePanelProps };
}

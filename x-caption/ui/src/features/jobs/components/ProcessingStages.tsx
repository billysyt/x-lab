import type { Job } from "../../../shared/types";
import { AppIcon } from "../../../shared/components/AppIcon";
import { cn } from "../../../shared/lib/cn";

type StageStatus = "waiting" | "active" | "completed";

function stageIcon(status: StageStatus) {
  if (status === "active") {
    return <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>;
  }
  if (status === "completed") {
    return <AppIcon name="check" className="text-success" />;
  }
  return <AppIcon name="exchangeAlt" className="text-text-secondary" />;
}

function deriveStageState(job: Job | null) {
  const empty = {
    segmentation: { status: "waiting" as const, time: "" },
    transcription: { status: "waiting" as const, time: "" }
  };
  if (!job) return empty;

  if (job.status === "failed" || job.status === "cancelled") {
    return empty;
  }

  const stage = job.currentStage ?? "";
  const result = job.result ?? null;
  const partial = job.partialResult ?? null;

  const transcriptionTime =
    result?.transcription_time !== undefined
      ? `${result.transcription_time}s`
      : partial?.transcription_time !== undefined
        ? `${partial.transcription_time}s`
        : "";

  if (job.status === "completed" && result) {
    return {
      segmentation: { status: "completed" as const, time: "" },
      transcription: { status: "completed" as const, time: transcriptionTime }
    };
  }

  if (stage === "segmentation") {
    return {
      segmentation: { status: "active" as const, time: "" },
      transcription: { status: "waiting" as const, time: "" }
    };
  }

  if (stage === "transcription") {
    return {
      segmentation: { status: "completed" as const, time: "" },
      transcription: { status: "active" as const, time: "" }
    };
  }

  if (stage === "pipeline") {
    return {
      segmentation: { status: "completed" as const, time: "" },
      transcription: { status: "completed" as const, time: transcriptionTime }
    };
  }

  if (job.status === "processing" || job.status === "queued") {
    return {
      segmentation: { status: "active" as const, time: "" },
      transcription: { status: "waiting" as const, time: "" }
    };
  }

  return empty;
}

export function ProcessingStages(props: { job: Job | null }) {
  const state = deriveStageState(props.job);

  function stageIconWrapClass(status: StageStatus) {
    if (status === "completed") return "bg-[rgba(16,185,129,0.14)] text-success";
    if (status === "active") return "bg-[rgba(var(--primary-rgb),0.14)] text-primary";
    return "bg-secondary text-text-secondary";
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-4">
      <div className="text-xs font-semibold text-text-secondary">
        Powered by <span className="text-primary">SenseVoice ONNX</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-6">
        <div className="inline-flex items-center gap-2" id="segmentationStage">
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
              stageIconWrapClass(state.segmentation.status)
            )}
          >
            {stageIcon(state.segmentation.status)}
          </div>
          <span className="whitespace-nowrap text-xs font-semibold text-text-primary">TEN-VAD Segmentation</span>
        </div>

        <div className="inline-flex items-center gap-2" id="transcriptionStage">
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full text-[12px]",
              stageIconWrapClass(state.transcription.status)
            )}
          >
            {stageIcon(state.transcription.status)}
          </div>
          <span className="whitespace-nowrap text-xs font-semibold text-text-primary">Transcription</span>
          <span className="text-[11px] font-semibold tabular-nums text-text-secondary" id="transcriptionTime">
            {state.transcription.time}
          </span>
        </div>
      </div>
    </div>
  );
}

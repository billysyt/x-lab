import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  apiGetHistory,
  apiGetJob,
  apiPollJob,
  apiRemoveJob,
  apiTranscribeAudio
} from "../../shared/api/sttApi";
import type { Job, PollUpdate, TranscriptResult, TranscriptSegment } from "../../shared/types";
import { convertHistoryEntry, deriveFilenameFromResult, normalizeJobStatus, sanitizeProgressValue } from "../../shared/lib/utils";
import type { RootState } from "../../app/store";

type JobsState = {
  jobsById: Record<string, Job>;
  order: string[];
  selectedJobId: string | null;
  loading: boolean;
  lastRestoreError: string | null;
};

const initialState: JobsState = {
  jobsById: {},
  order: [],
  selectedJobId: null,
  loading: false,
  lastRestoreError: null
};

function sortOrder(jobsById: Record<string, Job>): string[] {
  return Object.keys(jobsById).sort((a, b) => (jobsById[b]?.startTime ?? 0) - (jobsById[a]?.startTime ?? 0));
}

export const bootstrapJobs = createAsyncThunk<
  { jobsById: Record<string, Job>; order: string[] },
  void,
  { state: RootState }
>("jobs/bootstrap", async () => {
  try {
    const history = await apiGetHistory();
    const entries = Array.isArray(history.jobs) ? history.jobs : [];
    const jobs = entries.map(convertHistoryEntry).filter(Boolean) as Job[];
    const jobsById: Record<string, Job> = {};
    jobs.forEach((job) => {
      jobsById[job.id] = job;
    });
    return { jobsById, order: sortOrder(jobsById) };
  } catch {
    return { jobsById: {}, order: [] };
  }
});

export const fetchJobDetails = createAsyncThunk<
  { jobId: string; result?: TranscriptResult; meta?: Record<string, unknown>; status?: string; error?: string },
  { jobId: string },
  { state: RootState }
>("jobs/fetchJobDetails", async ({ jobId }) => {
  const jobData = await apiGetJob(jobId);
  return {
    jobId,
    result: jobData.result,
    meta: (jobData.meta ?? {}) as Record<string, unknown>,
    status: jobData.status,
    error: jobData.error
  };
});

export const pollJobUpdates = createAsyncThunk<
  { jobId: string; updates: PollUpdate[] },
  { jobId: string },
  { state: RootState }
>("jobs/poll", async ({ jobId }) => {
  const payload = await apiPollJob(jobId);
  const updates = Array.isArray(payload.updates) ? payload.updates : [];
  return { jobId, updates };
});

export const removeJob = createAsyncThunk<
  { jobId: string; message: string },
  { jobId: string; skipConfirm?: boolean; silent?: boolean },
  { state: RootState }
>("jobs/remove", async ({ jobId, skipConfirm, silent }) => {
  if (!skipConfirm) {
    const confirmed = confirm("Remove this job and delete all related files?");
    if (!confirmed) {
      throw new Error("cancelled");
    }
  }
  const response = await apiRemoveJob(jobId);
  if (!response.success) {
    throw new Error(response.error || response.message || "Failed to remove job");
  }
  if (Array.isArray(response.warnings) && response.warnings.length > 0) {
    console.warn("Job removal warnings:", response.warnings);
  }
  if (!silent) {
    // Notification handled in UI.
  }
  return { jobId, message: response.message || "Job removed" };
});

export const startTranscription = createAsyncThunk<
  { job: Job },
  {
    file?: File;
    filePath?: string | null;
    filename: string;
    mediaKind?: "audio" | "video";
    language: string;
    model: string;
    noiseSuppression: boolean;
    chineseStyle?: "spoken" | "written";
    chineseScript?: "traditional" | "simplified";
  },
  { state: RootState }
>(
  "jobs/startTranscription",
  async ({ file, filePath, filename, mediaKind, language, model, noiseSuppression, chineseStyle, chineseScript }) => {
    const result = await apiTranscribeAudio({
      file,
      filePath,
      filename,
      mediaKind,
      model,
      language,
      noiseSuppression,
      chineseStyle,
      chineseScript
    });

    const audioFile = result.audio_file
      ? {
          name: result.audio_file.name || filename,
          size: typeof result.audio_file.size === "number" ? result.audio_file.size : null,
          path: result.audio_file.path ?? null,
          wasTranscoded: Boolean(result.audio_file.was_transcoded)
        }
      : {
          name: filename,
          size: null,
          path: null,
          wasTranscoded: false
        };

    const job: Job = {
      id: result.job_id,
      filename,
      status: "queued",
      progress: 0,
      startTime: Date.now(),
      message: result.message || "Job submitted successfully",
      audioFile,
      result: null,
      partialResult: null,
      error: null,
      currentStage: null
    };

    return { job };
  }
);

type ApplyUpdatePayload = { jobId: string; data: unknown };

function mergeUpdatePayload(data: unknown): Record<string, any> {
  if (!data || typeof data !== "object") return {};
  const raw = data as any;
  const nested = raw.data && typeof raw.data === "object" ? raw.data : null;
  return nested ? { ...raw, ...nested } : raw;
}

function applyCompletion(job: Job, result: TranscriptResult) {
  job.status = "completed";
  job.progress = 100;
  job.result = result;
  job.partialResult = null;
  job.message = "Transcription completed!";
  job.completedAt = Date.now();

  const playbackPath = result.normalized_audio_path || job.audioFile?.path || null;
  if (playbackPath) {
    job.audioFile = job.audioFile ?? { name: job.filename, size: null, path: null };
    job.audioFile.path = playbackPath;
    if (!job.audioFile.name) {
      const parts = playbackPath.split(/[\\/]/);
      job.audioFile.name = parts[parts.length - 1] || "audio.wav";
    }
  }
}

function applyStreamingSegment(job: Job, segment: any, totalSegments?: unknown) {
  if (!job.streamingSegments) {
    job.streamingSegments = [];
  }

  if (!["completed", "failed", "cancelled"].includes(job.status)) {
    job.status = "processing";
  }

  const existingIndex = job.streamingSegments.findIndex((s) => s.id === segment.id);
  if (existingIndex >= 0) {
    const previous = job.streamingSegments[existingIndex];
    const originalText = previous?.originalText !== undefined ? previous.originalText : previous?.text || "";
    segment.originalText = segment.text !== undefined ? segment.text : originalText;
    job.streamingSegments[existingIndex] = segment;
  } else {
    segment.originalText = segment.text || "";
    job.streamingSegments.push(segment);
  }

  const numericTotal = Number(totalSegments);
  if (Number.isFinite(numericTotal) && numericTotal > 0) {
    job.expectedSegments = numericTotal;
  }

  if (job.expectedSegments) {
    job.progress = Math.min(45, Math.floor((job.streamingSegments.length / job.expectedSegments) * 45));
  }
}

const slice = createSlice({
  name: "jobs",
  initialState,
  reducers: {
    addJob(state, action: PayloadAction<Job>) {
      state.jobsById[action.payload.id] = action.payload;
      state.order = sortOrder(state.jobsById);
      state.selectedJobId = action.payload.id;
    },
    selectJob(state, action: PayloadAction<string | null>) {
      state.selectedJobId = action.payload;
    },
    clearAllJobs(state) {
      state.jobsById = {};
      state.order = [];
      state.selectedJobId = null;
    },
    applyJobUpdate(state, action: PayloadAction<ApplyUpdatePayload>) {
      const { jobId, data } = action.payload;
      const merged = mergeUpdatePayload(data);

      if (!state.jobsById[jobId]) {
        state.jobsById[jobId] = {
          id: jobId,
          filename: "Unknown file",
          status: "queued",
          progress: 0,
          startTime: Date.now() - 15 * 60 * 1000,
          message: "Restoring job from update",
          audioFile: null,
          result: null,
          partialResult: null,
          error: null,
          currentStage: null
        };
      }

      const job = state.jobsById[jobId];

      const normalizedStatus = merged.status ? normalizeJobStatus(merged.status) : undefined;

      if (merged.message) {
        job.message = String(merged.message);
      }

      const incomingAudioMeta = merged.audio_file || (merged.meta && merged.meta.audio_file);
      if (incomingAudioMeta) {
        job.audioFile = {
          name: incomingAudioMeta.name || job.filename || job.id,
          size: typeof incomingAudioMeta.size === "number" ? incomingAudioMeta.size : null,
          path: incomingAudioMeta.path || null
        };
      }

      if (normalizedStatus) {
        job.status = normalizedStatus;
      }

      if (merged.progress !== undefined) {
        const numericProgress = Number(merged.progress);
        if (!Number.isNaN(numericProgress)) {
          const clampedProgress = Math.max(0, Math.min(100, numericProgress));
          job.progress = clampedProgress;
          if (clampedProgress > 0 && !["completed", "failed", "cancelled"].includes(job.status)) {
            job.status = "processing";
          }
        }
      } else if (!normalizedStatus && merged.message && !["completed", "failed", "cancelled"].includes(job.status)) {
        job.status = "processing";
      }

      if (merged.stage) {
        job.currentStage = String(merged.stage);
      }

      if (merged.original_filename && typeof merged.original_filename === "string") {
        job.filename = merged.original_filename;
      }

      if (merged.segment || merged.type === "streaming_segment") {
        applyStreamingSegment(job, merged.segment, merged.total_segments);
      }

      if (merged.partial_result) {
        applyCompletion(job, merged.partial_result as TranscriptResult);
      }

      if (merged.result) {
        applyCompletion(job, merged.result as TranscriptResult);
        if (!job.filename) {
          job.filename = deriveFilenameFromResult(job.result, job.id);
        }
      }

      if (normalizedStatus === "completed" && !job.result) {
        job.status = "completed";
        job.progress = 100;
        job.message = job.message || "Job completed successfully";
      }

      if (merged.error) {
        job.status = "failed";
        job.error = String(merged.error);
      }

      job.lastSyncedAt = Date.now();
      state.order = sortOrder(state.jobsById);
    },
    updateSegmentText(state, action: PayloadAction<{ jobId: string; segmentId: number; newText: string }>) {
      const job = state.jobsById[action.payload.jobId];
      if (!job) return;

      const segmentId = action.payload.segmentId;
      const apply = (result: TranscriptResult | null | undefined) => {
        const segments = result?.segments;
        if (!segments || !Array.isArray(segments)) return;
        const index = segments.findIndex((s) => s.id === segmentId);
        if (index < 0) return;
        segments[index] = {
          ...segments[index],
          text: action.payload.newText,
          originalText: action.payload.newText
        };
      };
      apply(job.result);
      apply(job.partialResult);
    },
    updateSegmentTiming(
      state,
      action: PayloadAction<{ jobId: string; segmentId: number; start: number; end: number }>
    ) {
      const job = state.jobsById[action.payload.jobId];
      if (!job) return;
      const segmentId = action.payload.segmentId;
      const apply = (result: TranscriptResult | null | undefined) => {
        const segments = result?.segments;
        if (!segments || !Array.isArray(segments)) return;
        const index = segments.findIndex((s) => s.id === segmentId);
        if (index < 0) return;
        segments[index] = {
          ...segments[index],
          start: action.payload.start,
          end: action.payload.end
        };
      };
      apply(job.result);
      apply(job.partialResult);
      if (job.streamingSegments && Array.isArray(job.streamingSegments)) {
        const index = job.streamingSegments.findIndex((s) => s.id === segmentId);
        if (index >= 0) {
          job.streamingSegments[index] = {
            ...job.streamingSegments[index],
            start: action.payload.start,
            end: action.payload.end
          };
        }
      }
    },
    setJobSegments(state, action: PayloadAction<{ jobId: string; segments: TranscriptSegment[] }>) {
      const job = state.jobsById[action.payload.jobId];
      if (!job) return;
      job.status = "completed";
      job.progress = 100;
      job.message = job.message || "Captions loaded";
      job.completedAt = Date.now();
      job.result = {
        ...(job.result ?? {}),
        segments: action.payload.segments
      };
      job.partialResult = null;
      job.streamingSegments = action.payload.segments;
      job.lastSyncedAt = Date.now();
      state.order = sortOrder(state.jobsById);
    }
  },
  extraReducers(builder) {
    builder
      .addCase(bootstrapJobs.pending, (state) => {
        state.loading = true;
        state.lastRestoreError = null;
      })
      .addCase(bootstrapJobs.fulfilled, (state, action) => {
        state.loading = false;
        state.jobsById = action.payload.jobsById;
        state.order = action.payload.order;
      })
      .addCase(bootstrapJobs.rejected, (state, action) => {
        state.loading = false;
        state.lastRestoreError = action.error.message || "Failed to restore jobs";
      })
      .addCase(fetchJobDetails.fulfilled, (state, action) => {
        const job = state.jobsById[action.payload.jobId];
        if (!job) {
          return;
        }

        const normalizedStatus = action.payload.status ? normalizeJobStatus(action.payload.status) : job.status;
        job.status = normalizedStatus;

        const meta = action.payload.meta ?? {};
        const message = meta.message;
        if (typeof message === "string" && message) {
          job.message = message;
        }

        if (meta.progress !== undefined) {
          job.progress = sanitizeProgressValue(meta.progress);
        }

        if (meta.stage !== undefined) {
          job.currentStage = String(meta.stage);
        }

        if (meta.original_filename && typeof meta.original_filename === "string") {
          job.filename = meta.original_filename;
        }

        const audioFileMeta = meta.audio_file as any;
        if (audioFileMeta) {
          job.audioFile = {
            name: audioFileMeta.name || job.filename || job.id,
            size: typeof audioFileMeta.size === "number" ? audioFileMeta.size : null,
            path: audioFileMeta.path || null
          };
        }

        if (action.payload.result) {
          job.result = action.payload.result;
          job.partialResult = null;
          job.error = null;
          if (!job.filename) {
            job.filename = deriveFilenameFromResult(job.result, job.id);
          }
        }

        if (normalizedStatus === "failed") {
          job.error = action.payload.error || (meta.error as string) || job.error;
        }

        job.lastSyncedAt = Date.now();
      })
      .addCase(pollJobUpdates.fulfilled, (state, action) => {
        const job = state.jobsById[action.payload.jobId];
        if (!job) {
          return;
        }
        action.payload.updates.forEach((update) => {
          if (update.event === "job_update") {
            slice.caseReducers.applyJobUpdate(state, {
              type: "jobs/applyJobUpdate",
              payload: { jobId: action.payload.jobId, data: update.data }
            });
          }
        });
      })
      .addCase(removeJob.fulfilled, (state, action) => {
        delete state.jobsById[action.payload.jobId];
        if (state.selectedJobId === action.payload.jobId) {
          state.selectedJobId = null;
        }
        state.order = sortOrder(state.jobsById);
      })
      .addCase(startTranscription.fulfilled, (state, action) => {
        state.jobsById[action.payload.job.id] = action.payload.job;
        state.order = sortOrder(state.jobsById);
        state.selectedJobId = action.payload.job.id;
      });
  }
});

export const {
  addJob,
  applyJobUpdate,
  clearAllJobs,
  selectJob,
  setJobSegments,
  updateSegmentText,
  updateSegmentTiming
} = slice.actions;
export const jobsReducer = slice.reducer;

export const selectJobsState = (state: RootState) => state.jobs;
export const selectJobById = (state: RootState, jobId: string | null) =>
  jobId ? state.jobs.jobsById[jobId] ?? null : null;

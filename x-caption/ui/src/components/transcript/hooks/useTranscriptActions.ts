import { useCallback } from "react";
import type { RefObject } from "react";
import { addJob, selectJob, setJobSegments } from "../../jobs/jobsSlice";
import type { AppDispatch } from "../../../store";
import type { Job } from "../../../types";
import type { MediaItem, UploadTabHandle } from "../../upload/components/UploadTab";
import { fileFromBase64 } from "../../../lib/file";
import { parseSrt } from "../../../lib/srt";
import { stripFileExtension } from "../../../lib/utils";
import { apiUpsertJobRecord } from "../../../api/sttApi";

type TranscriptActionsParams = {
  dispatch: AppDispatch;
  notify: (message: string, type?: "info" | "success" | "error") => void;
  activeJob: Job | null;
  activeMedia: MediaItem | null;
  selectedJob: Job | null;
  srtInputRef: RefObject<HTMLInputElement | null>;
  uploadRef: RefObject<UploadTabHandle>;
  handleRequestFilePicker: (open: () => void) => void;
  ensureWhisperModelReady: () => Promise<boolean>;
  setShowImportModal: (value: boolean) => void;
  timelineClipCount: number;
};

export function useTranscriptActions(params: TranscriptActionsParams) {
  const {
    dispatch,
    notify,
    activeJob,
    activeMedia,
    selectedJob,
    srtInputRef,
    uploadRef,
    handleRequestFilePicker,
    ensureWhisperModelReady,
    setShowImportModal,
    timelineClipCount
  } = params;

  const handleSrtSelected = useCallback(
    async (file: File) => {
      try {
        if (!file.name.toLowerCase().endsWith(".srt")) {
          notify("Please select a .srt file.", "error");
          return;
        }
        const raw = await file.text();
        const parsed = parseSrt(raw);
        if (!parsed.length) {
          notify("No captions found in the SRT file.", "error");
          return;
        }
        let jobId = selectedJob?.id ?? null;
        if (!jobId) {
          jobId = `srt-${Date.now()}`;
          const filename = activeMedia?.name || file.name;
          const audioFile = activeMedia?.file
            ? {
                name: activeMedia.file.name,
                size: activeMedia.file.size,
                path: null
              }
            : { name: filename, size: null, path: null };
          const newJob: Job = {
            id: jobId,
            filename,
            displayName: stripFileExtension(filename) || filename,
            status: "completed",
            message: "Captions loaded",
            progress: 100,
            startTime: Date.now(),
            completedAt: Date.now(),
            audioFile,
            result: null,
            partialResult: null,
            error: null,
            currentStage: null
          };
          dispatch(addJob(newJob));
        }
        dispatch(setJobSegments({ jobId, segments: parsed }));
        dispatch(selectJob(jobId));
        const filename = activeMedia?.name || file.name;
        const mergedText = parsed.map((segment) => segment.text || "").join(" ").trim();
        void apiUpsertJobRecord({
          job_id: jobId,
          filename,
          display_name: stripFileExtension(filename) || filename,
          media_path: (activeMedia as any)?.localPath ?? null,
          media_kind: activeMedia?.kind ?? null,
          status: "completed",
          transcript_json: {
            job_id: jobId,
            segments: parsed,
            text: mergedText
          },
          transcript_text: mergedText,
          segment_count: parsed.length
        }).catch(() => undefined);
        notify("SRT loaded into captions.", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notify(message || "Failed to load SRT.", "error");
      }
    },
    [activeMedia, dispatch, notify, selectedJob?.id]
  );

  const handleLoadSrt = useCallback(() => {
    if (!activeMedia) {
      notify("Please select a job to continue", "info");
      return;
    }
    handleRequestFilePicker(() => {
      const api = (window as any)?.pywebview?.api;
      const openNative = api?.openSrtDialog || api?.open_srt_dialog;
      if (typeof openNative === "function") {
        void openNative
          .call(api)
          .then((result: any) => {
            if (!result || result.cancelled) return;
            if (!result.success || !result.file?.data) {
              const message =
                result?.error === "unsupported_file"
                  ? "Please select a .srt file."
                  : result?.error || "Failed to open SRT file.";
              notify(message, "error");
              return;
            }
            const file = fileFromBase64(result.file.data, result.file.name || "captions.srt", result.file.mime);
            void handleSrtSelected(file);
          })
          .catch((error: any) => {
            const message = error instanceof Error ? error.message : String(error);
            notify(message || "Failed to open SRT file.", "error");
          });
        return;
      }
      if (srtInputRef.current) {
        srtInputRef.current.accept = ".srt,application/x-subrip,text/plain";
        srtInputRef.current.click();
      }
    });
  }, [activeMedia, handleRequestFilePicker, handleSrtSelected, notify, srtInputRef]);

  const handleClearCaptions = useCallback(() => {
    if (!activeJob?.id) {
      notify("No captions to clear.", "info");
      return;
    }
    dispatch(setJobSegments({ jobId: activeJob.id, segments: [] }));
    void apiUpsertJobRecord({
      job_id: activeJob.id,
      filename: activeJob.filename,
      display_name: activeJob.displayName ?? activeJob.filename,
      media_path: (activeMedia as any)?.localPath ?? activeJob.audioFile?.path ?? null,
      media_kind: activeMedia?.kind ?? null,
      status: "imported",
      transcript_json: { job_id: activeJob.id, segments: [], text: "" },
      transcript_text: "",
      segment_count: 0
    }).catch(() => undefined);
  }, [
    activeJob?.audioFile?.path,
    activeJob?.displayName,
    activeJob?.filename,
    activeJob?.id,
    activeMedia,
    dispatch,
    notify
  ]);

  const handleGenerateCaptions = useCallback(async () => {
    if (!timelineClipCount) {
      setShowImportModal(true);
      return;
    }
    const ready = await ensureWhisperModelReady();
    if (!ready) return;
    uploadRef.current?.submitTranscription?.();
  }, [ensureWhisperModelReady, setShowImportModal, timelineClipCount, uploadRef]);

  return {
    handleSrtSelected,
    handleLoadSrt,
    handleClearCaptions,
    handleGenerateCaptions
  };
}

import { useCallback, useState } from "react";
import type { WhisperModelDownload, WhisperModelStatus } from "../../../shared/types";
import {
  apiGetWhisperModelDownload,
  apiGetWhisperModelStatus,
  apiStartWhisperModelDownload
} from "../../../shared/api/sttApi";

export type ModelDownloadState = {
  status: "idle" | "checking" | "downloading" | "error";
  progress: number | null;
  message: string;
  detail?: string | null;
  expectedPath?: string | null;
  downloadUrl?: string | null;
  downloadId?: string | null;
  downloadedBytes?: number | null;
  totalBytes?: number | null;
};

export function useModelDownload(notify: (message: string, type?: "info" | "success" | "error") => void) {
  const [modelDownload, setModelDownload] = useState<ModelDownloadState>({
    status: "idle",
    progress: null,
    message: "",
    downloadedBytes: null,
    totalBytes: null
  });

  const ensureWhisperModelReady = useCallback(async () => {
    if (modelDownload.status === "checking" || modelDownload.status === "downloading") {
      return false;
    }

    let statusPayload: WhisperModelStatus | null = null;
    let expectedPath: string | null = null;
    let downloadUrl: string | null = null;
    try {
      setModelDownload({
        status: "checking",
        progress: null,
        message: "Checking Whisper model...",
        downloadedBytes: null,
        totalBytes: null
      });

      statusPayload = await apiGetWhisperModelStatus();
      if (statusPayload.ready) {
        setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
        return true;
      }

      const startPayload = await apiStartWhisperModelDownload();
      if (startPayload.status === "ready") {
        setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
        return true;
      }
      const downloadId = startPayload.download_id;
      if (!downloadId) {
        throw new Error("Failed to start Whisper model download.");
      }
      expectedPath = startPayload.expected_path ?? statusPayload.expected_path ?? null;
      downloadUrl = startPayload.download_url ?? statusPayload.download_url ?? null;

      const initialProgress =
        typeof startPayload.progress === "number" ? Math.round(startPayload.progress) : null;

      setModelDownload({
        status: "downloading",
        progress: initialProgress,
        message: startPayload.message ?? "Downloading Whisper model...",
        expectedPath,
        downloadUrl,
        downloadId,
        downloadedBytes: startPayload.downloaded_bytes ?? null,
        totalBytes: startPayload.total_bytes ?? null
      });

      let current: WhisperModelDownload = startPayload;
      while (current.status !== "completed") {
        if (current.status === "failed") {
          throw new Error(current.error || "Whisper model download failed.");
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        current = await apiGetWhisperModelDownload(downloadId);
        const nextProgress = typeof current.progress === "number" ? Math.round(current.progress) : null;
        setModelDownload((prev) => ({
          status: "downloading",
          progress: nextProgress,
          message: current.message ?? prev.message,
          expectedPath: current.expected_path ?? prev.expectedPath ?? null,
          downloadUrl: current.download_url ?? prev.downloadUrl ?? null,
          downloadId,
          downloadedBytes: current.downloaded_bytes ?? prev.downloadedBytes ?? null,
          totalBytes: current.total_bytes ?? prev.totalBytes ?? null
        }));
      }

      setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setModelDownload((prev) => ({
        status: "error",
        progress: prev.progress ?? null,
        message: "Whisper model download failed.",
        detail: message,
        expectedPath: prev.expectedPath ?? expectedPath ?? null,
        downloadUrl: prev.downloadUrl ?? downloadUrl ?? null,
        downloadId: prev.downloadId ?? null,
        downloadedBytes: prev.downloadedBytes ?? null,
        totalBytes: prev.totalBytes ?? null
      }));
      notify("Whisper model download failed. Please download it manually.", "error");
      return false;
    }
  }, [modelDownload.status, notify]);

  const clearModelDownload = useCallback(() => {
    setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
  }, []);

  const handleRetryModelDownload = useCallback(() => {
    void ensureWhisperModelReady();
  }, [ensureWhisperModelReady]);

  const modelDownloadActive = modelDownload.status !== "idle";
  const modelDownloadTitle =
    modelDownload.status === "checking"
      ? "Checking Whisper model"
      : modelDownload.status === "downloading"
        ? "Downloading Whisper model"
        : "Whisper model download failed";

  return {
    modelDownload,
    setModelDownload,
    ensureWhisperModelReady,
    clearModelDownload,
    handleRetryModelDownload,
    modelDownloadActive,
    modelDownloadTitle
  };
}

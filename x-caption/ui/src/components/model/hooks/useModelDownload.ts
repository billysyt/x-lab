import { useCallback, useState } from "react";
import type { WhisperPackageDownload, WhisperPackageStatus } from "../../../types";
import {
  apiGetWhisperPackageStatus,
  apiStartWhisperPackageDownload,
  apiGetWhisperPackageDownload
} from "../../../api/modelApi";

export type ModelDownloadState = {
  kind?: "whisper" | "package";
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

  const ensureWhisperPackageReady = useCallback(async () => {
    if (modelDownload.status === "checking" || modelDownload.status === "downloading") {
      return false;
    }

    let statusPayload: WhisperPackageStatus | null = null;
    let expectedPath: string | null = null;
    let downloadUrl: string | null = null;
    try {
      setModelDownload({
        kind: "package",
        status: "checking",
        progress: null,
        message: "Checking model package...",
        downloadedBytes: null,
        totalBytes: null
      });

      statusPayload = await apiGetWhisperPackageStatus();
      if (statusPayload.ready) {
        setModelDownload({
          status: "idle",
          progress: null,
          message: "",
          downloadedBytes: null,
          totalBytes: null
        });
        return true;
      }

      const startPayload = await apiStartWhisperPackageDownload();
      if (startPayload.status === "ready") {
        setModelDownload({
          status: "idle",
          progress: null,
          message: "",
          downloadedBytes: null,
          totalBytes: null
        });
        return true;
      }
      const downloadId = startPayload.download_id;
      if (!downloadId) {
        throw new Error("Failed to start model package download.");
      }
      expectedPath = startPayload.expected_path ?? statusPayload.expected_path ?? null;
      downloadUrl = startPayload.download_url ?? statusPayload.download_url ?? null;

      const initialProgress =
        typeof startPayload.progress === "number" ? Math.round(startPayload.progress) : null;

      setModelDownload({
        kind: "package",
        status: "downloading",
        progress: initialProgress,
        message: startPayload.message ?? "Downloading model package...",
        expectedPath,
        downloadUrl,
        downloadId,
        downloadedBytes: startPayload.downloaded_bytes ?? null,
        totalBytes: startPayload.total_bytes ?? null
      });

      let current: WhisperPackageDownload = startPayload;
      while (current.status !== "completed") {
        if (current.status === "failed") {
          throw new Error(current.error || "Package download failed.");
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        current = await apiGetWhisperPackageDownload(downloadId);
        const nextProgress = typeof current.progress === "number" ? Math.round(current.progress) : null;
        setModelDownload((prev) => ({
          kind: prev.kind ?? "package",
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
        kind: prev.kind ?? "package",
        status: "error",
        progress: prev.progress ?? null,
        message: "Package download failed.",
        detail: message,
        expectedPath: prev.expectedPath ?? expectedPath ?? null,
        downloadUrl: prev.downloadUrl ?? downloadUrl ?? null,
        downloadId: prev.downloadId ?? null,
        downloadedBytes: prev.downloadedBytes ?? null,
        totalBytes: prev.totalBytes ?? null
      }));
      notify("Package download failed. Please retry.", "error");
      return false;
    }
  }, [modelDownload.status, notify]);

  const ensureWhisperModelReady = useCallback(async () => {
    return ensureWhisperPackageReady();
  }, [ensureWhisperPackageReady]);

  const clearModelDownload = useCallback(() => {
    setModelDownload({ status: "idle", progress: null, message: "", downloadedBytes: null, totalBytes: null });
  }, []);

  const handleRetryModelDownload = useCallback(() => {
    if (modelDownload.kind === "package") {
      void ensureWhisperPackageReady();
    } else {
      void ensureWhisperModelReady();
    }
  }, [ensureWhisperModelReady, ensureWhisperPackageReady, modelDownload.kind]);

  const modelDownloadActive = modelDownload.status !== "idle";
  const label = "package";
  const modelDownloadTitle =
    modelDownload.status === "checking"
      ? `Checking ${label}`
      : modelDownload.status === "downloading"
        ? `Downloading ${label}`
        : `${label} download failed`;

  return {
    modelDownload,
    setModelDownload,
    ensureWhisperModelReady,
    ensureWhisperPackageReady,
    clearModelDownload,
    handleRetryModelDownload,
    modelDownloadActive,
    modelDownloadTitle
  };
}

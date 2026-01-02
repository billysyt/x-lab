import { useCallback, useState } from "react";
import type { ExportLanguage, TranscriptSegment } from "../../../types";
import { apiExportSrt, apiExportTranscript } from "../../../api/exportApi";
import { baseFilename } from "../../../lib/format";
import type { ExportSegmentPayload } from "../../../types";

export function useExportHandlers(params: {
  exportLanguage: ExportLanguage;
  exportSegments: TranscriptSegment[];
  notify: (message: string, type?: "info" | "success" | "error") => void;
  filename: string | null | undefined;
  onExportComplete?: () => void;
  displayName?: string | null;
}) {
  const { exportLanguage, exportSegments, notify, filename, onExportComplete, displayName } = params;
  const [isExporting, setIsExporting] = useState(false);

  const saveTextFile = useCallback(async (fileName: string, content: string) => {
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;

    if (api && (typeof api.saveTranscript === "function" || typeof api.save_transcript === "function")) {
      const saveFn = (api.saveTranscript || api.save_transcript).bind(api);
      try {
        return await saveFn(fileName, content);
      } catch {
        // fall through to browser download
      }
    }

    // Use appropriate MIME type based on file extension to preserve extension on Windows
    const mimeType = fileName.endsWith('.srt') ? 'application/x-subrip;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    return { success: true };
  }, []);

  const buildPayload = useCallback(
    (): ExportSegmentPayload[] =>
      exportSegments.map((segment) => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text ?? null,
        originalText: segment.originalText ?? null
      })),
    [exportSegments]
  );

  const handleExportTranscript = useCallback(async () => {
    if (!exportSegments.length) {
      notify("Please select a job with caption to continue.", "info");
      return;
    }

    setIsExporting(true);
    try {
      const payload = await apiExportTranscript({
        segments: buildPayload(),
        exportLanguage
      });
      if (!payload || payload.success === false) {
        notify(payload?.error || "Export failed.", "error");
        return;
      }

      const content = payload.content || "";
      if (!content.trim()) {
        notify("Please select a job with caption to continue.", "info");
        return;
      }

      const baseName = baseFilename(displayName || filename || "transcript");
      const fileName = `${baseName}.txt`;
      const response = await saveTextFile(fileName, content);
      if (response && response.success) {
        onExportComplete?.();
        return;
      }
      if (response && response.cancelled) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(message || "Export failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [buildPayload, exportLanguage, exportSegments.length, displayName, filename, notify, onExportComplete, saveTextFile]);

  const handleExportSrt = useCallback(async () => {
    if (!exportSegments.length) {
      notify("Please select a job with caption to continue.", "info");
      return;
    }

    setIsExporting(true);
    try {
      const payload = await apiExportSrt({
        segments: buildPayload(),
        exportLanguage
      });
      if (!payload || payload.success === false) {
        notify(payload?.error || "Export failed.", "error");
        return;
      }

      const content = payload.content || "";
      if (!content.trim()) {
        notify("Please select a job with caption to continue.", "info");
        return;
      }

      const baseName = baseFilename(displayName || filename || "captions");
      const fileName = `${baseName}.srt`;
      const response = await saveTextFile(fileName, content);
      if (response && response.success) {
        onExportComplete?.();
        return;
      }
      if (response && response.cancelled) {
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notify(message || "Export failed.", "error");
    } finally {
      setIsExporting(false);
    }
  }, [buildPayload, exportLanguage, exportSegments.length, displayName, filename, notify, onExportComplete, saveTextFile]);

  return {
    isExporting,
    saveTextFile,
    handleExportTranscript,
    handleExportSrt
  };
}

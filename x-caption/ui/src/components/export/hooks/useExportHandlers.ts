import { useCallback, useState } from "react";
import type { ExportLanguage, TranscriptSegment } from "../../../types";
import { apiConvertChinese } from "../../../api/exportApi";
import { baseFilename } from "../../../lib/format";
import { formatSrtTimestamp } from "../../../lib/srt";

export function useExportHandlers(params: {
  exportLanguage: ExportLanguage;
  exportSegments: TranscriptSegment[];
  openCcConverter: ((value: string) => string) | null;
  notify: (message: string, type?: "info" | "success" | "error") => void;
  filename: string | null | undefined;
}) {
  const { exportLanguage, exportSegments, openCcConverter, notify, filename } = params;
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

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
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

  const handleExportTranscript = useCallback(async () => {
    if (!exportSegments.length) {
      notify("Please select a job with caption to continue.", "info");
      return;
    }

    const rawText = exportSegments
      .map((segment) => String(segment.originalText ?? segment.text ?? "").trim())
      .filter(Boolean)
      .join("\n");

    if (!rawText) {
      notify("Please select a job with caption to continue.", "info");
      return;
    }

    const fallback = { text: rawText, suffix: "_original" };
    let converted = fallback;

    setIsExporting(true);
    try {
      try {
        if (exportLanguage === "traditional") {
          const convertedText = openCcConverter
            ? openCcConverter(rawText)
            : await apiConvertChinese({
                text: rawText,
                target: "traditional"
              });
          converted = { text: convertedText, suffix: "_繁體中文" };
        } else if (exportLanguage === "simplified") {
          const convertedText = openCcConverter
            ? openCcConverter(rawText)
            : await apiConvertChinese({
                text: rawText,
                target: "simplified"
              });
          converted = { text: convertedText, suffix: "_简体中文" };
        }
      } catch {
        converted = fallback;
      }

      const fileName = `${baseFilename(filename)}_transcript${converted.suffix}.txt`;
      const response = await saveTextFile(fileName, converted.text);
      if (response && response.success) {
        return;
      }
      if (response && response.cancelled) {
        return;
      }
    } finally {
      setIsExporting(false);
    }
  }, [exportLanguage, exportSegments, notify, openCcConverter, saveTextFile, filename]);

  const handleExportSrt = useCallback(async () => {
    if (!exportSegments.length) {
      notify("Please select a job with caption to continue.", "info");
      return;
    }
    const content = exportSegments
      .map((segment, index) => {
        const rawText = String(segment.originalText ?? segment.text ?? "").trim();
        if (!rawText) return null;
        let text = rawText;
        if (openCcConverter) {
          try {
            text = openCcConverter(rawText);
          } catch {
            text = rawText;
          }
        }
        const start = formatSrtTimestamp(Number(segment.start ?? 0));
        const end = formatSrtTimestamp(Number(segment.end ?? 0));
        return `${index + 1}\n${start} --> ${end}\n${text}\n`;
      })
      .filter(Boolean)
      .join("\n");

    if (!content.trim()) {
      notify("Please select a job with caption to continue.", "info");
      return;
    }

    setIsExporting(true);
    try {
      const fileName = `${baseFilename(filename)}_captions.srt`;
      const response = await saveTextFile(fileName, content);
      if (response && response.success) {
        return;
      }
      if (response && response.cancelled) {
        return;
      }
    } finally {
      setIsExporting(false);
    }
  }, [exportSegments, notify, openCcConverter, saveTextFile, filename]);

  return {
    isExporting,
    saveTextFile,
    handleExportTranscript,
    handleExportSrt
  };
}

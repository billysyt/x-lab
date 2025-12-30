import { useCallback, useState, type RefObject } from "react";
import type { SettingsState } from "../../settings/settingsSlice";
import { formatBytes } from "../../../lib/format";
import { callApiMethod } from "../../../lib/pywebview";
import type { UploadTabHandle } from "../../upload/components/UploadTab";

type EditorUiParams = {
  isCompact: boolean;
  isPinned: boolean;
  uploadRef: RefObject<UploadTabHandle>;
  setWindowOnTop: (value: boolean) => void | Promise<void>;
  isPlayerModalOpen: boolean;
  setIsPlayerModalOpen: (value: boolean) => void;
  setIsPlayerModalVisible: (value: boolean) => void;
  setIsLeftDrawerOpen: (value: boolean) => void;
  settings: SettingsState;
  isTranscribing: boolean;
  modelDownload: { status?: string; totalBytes?: number; downloadedBytes?: number };
  isActiveJobProcessing: boolean;
  isAnotherJobProcessing: boolean;
};

export function useEditorUiState(params: EditorUiParams) {
  const {
    isCompact,
    isPinned,
    uploadRef,
    setWindowOnTop,
    isPlayerModalOpen,
    setIsPlayerModalOpen,
    setIsPlayerModalVisible,
    setIsLeftDrawerOpen,
    settings,
    isTranscribing,
    modelDownload,
    isActiveJobProcessing,
    isAnotherJobProcessing
  } = params;

  const [secondCaptionEnabled, setSecondCaptionEnabled] = useState(false);
  const [secondCaptionLanguage, setSecondCaptionLanguage] = useState<"yue" | "zh" | "en">("yue");

  const handleOpenFiles = useCallback(() => {
    if (isCompact) {
      setIsLeftDrawerOpen(true);
    }
    uploadRef.current?.openFilePicker?.();
  }, [isCompact, setIsLeftDrawerOpen, uploadRef]);

  const handleRequestFilePicker = useCallback(
    (open: () => void) => {
      if (!isPinned) {
        open();
        return;
      }
      void setWindowOnTop(false);
      const restorePin = () => {
        window.removeEventListener("focus", restorePin);
        void setWindowOnTop(true);
      };
      window.addEventListener("focus", restorePin, { once: true });
      open();
    },
    [isPinned, setWindowOnTop]
  );

  const toggleFullscreen = () => {
    if (isPlayerModalOpen) {
      setIsPlayerModalOpen(false);
      return;
    }
    setIsPlayerModalVisible(true);
    window.requestAnimationFrame(() => setIsPlayerModalOpen(true));
  };

  const modelProgressText =
    modelDownload.totalBytes && modelDownload.downloadedBytes
      ? `${formatBytes(modelDownload.downloadedBytes)} / ${formatBytes(modelDownload.totalBytes)}`
      : modelDownload.downloadedBytes
        ? `${formatBytes(modelDownload.downloadedBytes)} downloaded`
        : null;

  const openExternalUrl = useCallback((url: string) => {
    if (!url) return;
    const win = typeof window !== "undefined" ? (window as any) : null;
    const api = win?.pywebview?.api;
    const result = callApiMethod(api, ["open_external", "openExternal"], url);
    if (result) return;
    try {
      window.open(url, "_blank", "noopener");
    } catch {
      // Ignore.
    }
  }, []);

  const layoutClass = isCompact
    ? "grid min-h-0 overflow-hidden grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto]"
    : "grid min-h-0 overflow-hidden grid-cols-[minmax(160px,240px)_minmax(0,1fr)_minmax(240px,340px)] 2xl:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_minmax(280px,380px)] grid-rows-[minmax(0,1fr)_auto]";

  const captionControlsDisabled = isTranscribing;
  const isCantoneseLanguage = settings.language === "yue" || settings.language === "auto";
  const isSecondCaptionActive = secondCaptionEnabled;
  const generateCaptionLabel = isActiveJobProcessing
    ? "Processing..."
    : isAnotherJobProcessing
      ? "Another job processing..."
      : modelDownload.status === "downloading"
        ? "Downloading model..."
        : "AI Generate Caption";
  const isGenerateDisabled =
    modelDownload.status === "checking" || modelDownload.status === "downloading" || isTranscribing;

  const handleToggleSecondCaption = useCallback(() => {
    if (captionControlsDisabled) return;
    setSecondCaptionEnabled((prev) => {
      const next = !prev;
      if (next) {
        setSecondCaptionLanguage("yue");
      }
      return next;
    });
  }, [captionControlsDisabled]);

  return {
    handleOpenFiles,
    handleRequestFilePicker,
    toggleFullscreen,
    modelProgressText,
    openExternalUrl,
    layoutClass,
    captionControlsDisabled,
    isCantoneseLanguage,
    isSecondCaptionActive,
    secondCaptionEnabled,
    secondCaptionLanguage,
    setSecondCaptionLanguage,
    generateCaptionLabel,
    isGenerateDisabled,
    handleToggleSecondCaption
  };
}

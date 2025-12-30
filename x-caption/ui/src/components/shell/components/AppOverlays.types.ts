import type { MouseEvent, ReactNode, RefObject } from "react";
import type { ToastType } from "../../common/ToastHost";
import type { TranscriptSegment } from "../../../types";

export type CaptionMenuState = {
  x: number;
  y: number;
  segment: TranscriptSegment;
};

export type GapMenuState = {
  x: number;
  y: number;
  gapStart: number;
  gapEnd: number;
};

export type GapAdjustModalState = {
  segment: TranscriptSegment;
  mode: "insert" | "remove";
  ms: string;
  maxRemoveMs: number;
  hasGap: boolean;
};

export type PremiumDetails = {
  machineId: string | null;
  activatedAt: string | null;
} | null;

export type AlertOverlayProps = {
  notify: (message: string, type?: ToastType) => void;
  alertModal: { title: string; message: string; tone: ToastType } | null;
  setAlertModal: (value: { title: string; message: string; tone: ToastType } | null) => void;
};

export type MediaImportOverlayProps = {
  modals: {
    showOpenModal: boolean;
    setShowOpenModal: (value: boolean) => void;
    showYoutubeModal: boolean;
    setShowYoutubeModal: (value: boolean) => void;
    showImportModal: boolean;
    setShowImportModal: (value: boolean) => void;
  };
  youtube: {
    importing: boolean;
    importTitle: string | null;
    url: string;
    setUrl: (value: string) => void;
    error: string | null;
    setError: (value: string | null) => void;
    isIndeterminate: boolean;
    progressValue: number;
  };
  actions: {
    openLocalFromModal: () => void;
    openYoutubeModal: () => void;
    importYoutube: () => void;
    openModal: () => void;
  };
};

export type PremiumOverlayProps = {
  showPremiumModal: boolean;
  setShowPremiumModal: (value: boolean) => void;
  premiumWebviewStatus: "idle" | "loading" | "ready" | "error";
  premiumIframeKey: number;
  premiumWebviewRef: RefObject<HTMLIFrameElement>;
  onPremiumWebviewLoad: () => void;
  onPremiumWebviewError: () => void;
  premiumWebviewError: string | null;
  onPremiumRetry: () => void;
  machineIdLoading: boolean;
  machineId: string | null;
  machineIdCopied: boolean;
  onCopyMachineId: () => void;
  premiumKey: string;
  setPremiumKey: (value: string) => void;
  onConfirmPremiumKey: () => void;
  premiumKeySubmitting: boolean;
  isPremium: boolean;
  showPremiumStatusModal: boolean;
  setShowPremiumStatusModal: (value: boolean) => void;
  premiumDetails: PremiumDetails;
};

export type UpdateOverlayProps = {
  updateModal: {
    downloadUrl: string | null;
    publishedAt: string | null;
  } | null;
  updateForceRequired: boolean;
  updateAvailable: boolean;
  updateCurrentVersion: string | null;
  updateLatestVersion: string | null;
  onOpenExternalUrl: (url: string) => void;
  onWindowAction: (action: "close" | "minimize" | "zoom" | "fullscreen") => void;
  clearUpdateModal: () => void;
};

export type ExportOverlayProps = {
  showExportModal: boolean;
  setShowExportModal: (value: boolean) => void;
  isExporting: boolean;
  onExportSrt: () => void;
  onExportTranscript: () => void;
};

export type ModelDownloadOverlayProps = {
  modelDownloadActive: boolean;
  modelDownload: {
    status: "idle" | "checking" | "downloading" | "error";
    progress: number | null;
    message: string;
    detail?: string | null;
    expectedPath?: string | null;
    downloadUrl?: string | null;
  };
  modelDownloadTitle: string;
  modelProgressText: string | null;
  onClearModelDownload: () => void;
  onRetryModelDownload: () => void;
};

export type AppOverlaysProps = {
  isCompact: boolean;
  isLeftDrawerOpen: boolean;
  onCloseLeftDrawer: () => void;
  leftPanelContent: ReactNode;
  isPlayerModalVisible: boolean;
  isPlayerModalOpen: boolean;
  onClosePlayerModal: () => void;
  onPlayerModalTransitionEnd: () => void;
  getHeaderDragProps: (baseClass: string) => {
    className: string;
    onDoubleClick: (event: MouseEvent<HTMLElement>) => void;
  };
  playerPanel: ReactNode;
  captionSidebarContent: ReactNode;
  segmentsLength: number;
  isTranscriptEdit: boolean;
  onToggleTranscriptEdit: () => void;
  captionMenu: CaptionMenuState | null;
  captionMenuPosition: { left: number; top: number } | null;
  captionMenuGapAfter: {
    hasNext: boolean;
    hasGap: boolean;
    gapStart: number;
    gapEnd: number;
  } | null;
  captionMenuGapHighlight: boolean;
  setCaptionMenuGapHighlight: (value: boolean) => void;
  onSplitCaption: (segment: TranscriptSegment) => void;
  onDeleteCaption: (segment: TranscriptSegment) => void;
  onOpenGapAdjust: (segment: TranscriptSegment, maxRemoveMs: number, hasGap: boolean) => void;
  onCloseCaptionMenu: () => void;
  gapMenu: GapMenuState | null;
  gapMenuPosition: { left: number; top: number } | null;
  gapMenuHighlight: boolean;
  setGapMenuHighlight: (value: boolean) => void;
  onRemoveGap: (gapStart: number, gapEnd: number) => void;
  onCloseGapMenu: () => void;
  gapAdjustModal: GapAdjustModalState | null;
  setGapAdjustModal: (value: GapAdjustModalState | null) => void;
  onAdjustGapAfter: (segment: TranscriptSegment, mode: "insert" | "remove", ms: number, maxRemoveMs: number) => void;
  alerts: AlertOverlayProps;
  mediaImport: MediaImportOverlayProps;
  premium: PremiumOverlayProps;
  updates: UpdateOverlayProps;
  exporting: ExportOverlayProps;
  modelDownload: ModelDownloadOverlayProps;
};

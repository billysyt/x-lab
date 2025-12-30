import type { MouseEvent, ReactNode, RefObject } from "react";
import { AppIcon } from "../../../components/common/AppIcon";
import { cn } from "../../../lib/cn";
import { formatTimestamp } from "../../../lib/format";
import type { ToastType } from "../../../components/common/ToastHost";
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

export function AppOverlays({
  isCompact,
  isLeftDrawerOpen,
  onCloseLeftDrawer,
  leftPanelContent,
  isPlayerModalVisible,
  isPlayerModalOpen,
  onClosePlayerModal,
  onPlayerModalTransitionEnd,
  getHeaderDragProps,
  playerPanel,
  captionSidebarContent,
  segmentsLength,
  isTranscriptEdit,
  onToggleTranscriptEdit,
  captionMenu,
  captionMenuPosition,
  captionMenuGapAfter,
  captionMenuGapHighlight,
  setCaptionMenuGapHighlight,
  onSplitCaption,
  onDeleteCaption,
  onOpenGapAdjust,
  onCloseCaptionMenu,
  gapMenu,
  gapMenuPosition,
  gapMenuHighlight,
  setGapMenuHighlight,
  onRemoveGap,
  onCloseGapMenu,
  gapAdjustModal,
  setGapAdjustModal,
  onAdjustGapAfter,
  alerts,
  mediaImport,
  premium,
  updates,
  exporting,
  modelDownload
}: AppOverlaysProps) {
  const { notify, alertModal, setAlertModal } = alerts;
  const {
    modals: {
      showOpenModal,
      setShowOpenModal,
      showYoutubeModal,
      setShowYoutubeModal,
      showImportModal,
      setShowImportModal
    },
    youtube: {
      importing: youtubeImporting,
      importTitle: youtubeImportTitle,
      url: youtubeUrl,
      setUrl: setYoutubeUrl,
      error: youtubeError,
      setError: setYoutubeError,
      isIndeterminate: isYoutubeIndeterminate,
      progressValue: youtubeProgressValue
    },
    actions: {
      openLocalFromModal: handleOpenLocalFromModal,
      openYoutubeModal: handleOpenYoutubeModal,
      importYoutube: handleImportYoutube,
      openModal: handleOpenModal
    }
  } = mediaImport;
  const {
    showPremiumModal,
    setShowPremiumModal,
    premiumWebviewStatus,
    premiumIframeKey,
    premiumWebviewRef,
    onPremiumWebviewLoad,
    onPremiumWebviewError,
    premiumWebviewError,
    onPremiumRetry,
    machineIdLoading,
    machineId,
    machineIdCopied,
    onCopyMachineId,
    premiumKey,
    setPremiumKey,
    onConfirmPremiumKey,
    premiumKeySubmitting,
    isPremium,
    showPremiumStatusModal,
    setShowPremiumStatusModal,
    premiumDetails
  } = premium;
  const {
    updateModal,
    updateForceRequired,
    updateAvailable,
    updateCurrentVersion,
    updateLatestVersion,
    onOpenExternalUrl,
    onWindowAction,
    clearUpdateModal
  } = updates;
  const { showExportModal, setShowExportModal, isExporting, onExportSrt, onExportTranscript } = exporting;
  const {
    modelDownloadActive,
    modelDownload: modelDownloadState,
    modelDownloadTitle,
    modelProgressText,
    onClearModelDownload,
    onRetryModelDownload
  } = modelDownload;
  return (
    <>
      {isCompact ? (
        <>
          <div
            className={cn(
              "fixed inset-0 z-[110] bg-black/60 transition-opacity",
              isLeftDrawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
            )}
            onClick={onCloseLeftDrawer}
          />
          <div
            className={cn(
              "fixed left-0 top-0 z-[111] flex h-full w-[280px] flex-col bg-[#0b0b0b] shadow-2xl transition-transform",
              isLeftDrawerOpen ? "translate-x-0" : "-translate-x-full"
            )}
          >
            {leftPanelContent}
          </div>
        </>
      ) : null}

      {isPlayerModalVisible ? (
        <div
          className={cn(
            "fixed inset-0 z-[140] flex flex-col bg-[#0b0b0b] transform-gpu transition-[opacity,transform] duration-200 ease-out",
            isPlayerModalOpen ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-[0.98]"
          )}
          onTransitionEnd={(event) => {
            if (event.currentTarget !== event.target) return;
            if (!isPlayerModalOpen) {
              onPlayerModalTransitionEnd();
            }
          }}
          aria-hidden={!isPlayerModalOpen}
        >
          <div {...getHeaderDragProps("flex items-center justify-between border-b border-slate-800/60 px-4 py-3") }>
            <div className="text-xs font-semibold text-slate-200">Player Focus</div>
            <button
              className="pywebview-no-drag inline-flex h-7 items-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
              onClick={onClosePlayerModal}
              type="button"
            >
              <AppIcon name="times" className="text-[10px]" />
              Close
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div className="flex min-h-0 flex-1">{playerPanel}</div>
            <aside className="flex min-h-0 w-full flex-col border-t border-slate-800/60 bg-[#0b0b0b] lg:w-[380px] lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200">
                <span>Caption Setting</span>
                {segmentsLength > 0 ? (
                  <button
                    className={cn(
                      "pywebview-no-drag inline-flex items-center gap-2 text-[10px] font-medium transition",
                      isTranscriptEdit ? "text-slate-200" : "text-slate-500"
                    )}
                    onClick={onToggleTranscriptEdit}
                    type="button"
                  >
                    <AppIcon name="edit" className="text-[11px]" />
                    Edit
                    <span
                      className={cn(
                        "relative inline-flex h-4 w-7 items-center rounded-full border transition",
                        isTranscriptEdit ? "border-slate-500 bg-[#1b1b22]" : "border-slate-700 bg-[#151515]"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute h-3 w-3 rounded-full bg-white transition",
                          isTranscriptEdit ? "translate-x-3" : "translate-x-1"
                        )}
                      />
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="min-h-0 flex-1 px-3 py-3">{captionSidebarContent}</div>
            </aside>
          </div>
        </div>
      ) : null}

      {captionMenu && captionMenuPosition ? (
        <div
          className="fixed inset-0 z-[125]"
          onClick={onCloseCaptionMenu}
          onContextMenu={(event) => {
            event.preventDefault();
            onCloseCaptionMenu();
          }}
        >
          <div
            className="absolute w-[180px] overflow-hidden rounded-lg border border-slate-700/60 bg-[#121212] shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
            style={{ left: `${captionMenuPosition.left}px`, top: `${captionMenuPosition.top}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
              onClick={() => {
                onSplitCaption(captionMenu.segment);
                onCloseCaptionMenu();
              }}
              type="button"
            >
              Split caption
            </button>
            <button
              className={cn(
                "w-full px-3 py-2 text-left text-[11px] font-semibold transition",
                captionMenuGapAfter?.hasNext
                  ? "text-slate-200 hover:bg-[#1b1b22]"
                  : "cursor-not-allowed text-slate-500"
              )}
              onClick={() => {
                if (!captionMenuGapAfter?.hasNext) return;
                const hasGap = Boolean(captionMenuGapAfter?.hasGap);
                const maxRemoveMs = Math.max(
                  0,
                  Math.round(((captionMenuGapAfter?.gapEnd ?? 0) - (captionMenuGapAfter?.gapStart ?? 0)) * 1000)
                );
                onOpenGapAdjust(captionMenu.segment, maxRemoveMs, hasGap);
                onCloseCaptionMenu();
              }}
              onMouseEnter={() => {
                if (captionMenuGapAfter?.hasGap) {
                  setCaptionMenuGapHighlight(true);
                }
              }}
              onMouseLeave={() => setCaptionMenuGapHighlight(false)}
              type="button"
              disabled={!captionMenuGapAfter?.hasNext}
            >
              Insert/Remove Gap After…
            </button>
            <button
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
              onClick={() => {
                onDeleteCaption(captionMenu.segment);
                onCloseCaptionMenu();
              }}
              type="button"
            >
              Delete caption
            </button>
          </div>
        </div>
      ) : null}

      {gapMenu && gapMenuPosition ? (
        <div
          className="fixed inset-0 z-[125]"
          onClick={() => {
            onCloseGapMenu();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onCloseGapMenu();
          }}
        >
          <div
            className="absolute w-max overflow-hidden rounded-lg border border-slate-700/60 bg-[#121212] shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
            style={{ left: `${gapMenuPosition.left}px`, top: `${gapMenuPosition.top}px` }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
              onClick={() => {
                onRemoveGap(gapMenu.gapStart, gapMenu.gapEnd);
                onCloseGapMenu();
              }}
              onMouseEnter={() => setGapMenuHighlight(true)}
              onMouseLeave={() => setGapMenuHighlight(false)}
              type="button"
            >
              Remove Gap
            </button>
          </div>
        </div>
      ) : null}

      {gapAdjustModal ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setGapAdjustModal(null)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Adjust Gap After</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Insert or remove time after this caption (milliseconds).
                </p>
              </div>
              <div className="mt-4">
                <div className="relative flex items-center rounded-full bg-[#151515] p-1 text-[11px] font-semibold">
                  <span
                    className={cn(
                      "absolute inset-y-1 w-1/2 rounded-full bg-white transition-transform duration-200",
                      gapAdjustModal.mode === "insert" ? "translate-x-0" : "translate-x-full"
                    )}
                  />
                  <button
                    className={cn(
                      "relative z-10 inline-flex flex-1 items-center justify-center rounded-full px-3 py-1.5 transition",
                      gapAdjustModal.mode === "insert" ? "text-[#0b0b0b]" : "text-slate-200"
                    )}
                    onClick={() => {
                      if (gapAdjustModal.mode === "insert") return;
                      const nextMs = gapAdjustModal.ms.trim() ? gapAdjustModal.ms : "1000";
                      setGapAdjustModal({ ...gapAdjustModal, mode: "insert", ms: nextMs });
                    }}
                    type="button"
                  >
                    Insert
                  </button>
                  <button
                    className={cn(
                      "relative z-10 inline-flex flex-1 items-center justify-center rounded-full px-3 py-1.5 transition",
                      gapAdjustModal.hasGap
                        ? gapAdjustModal.mode === "remove"
                          ? "text-[#0b0b0b]"
                          : "text-slate-200"
                        : "cursor-not-allowed text-slate-500"
                    )}
                    onClick={() => {
                      if (!gapAdjustModal.hasGap) return;
                      const currentMs = gapAdjustModal.ms.trim();
                      const numeric = currentMs ? Number(currentMs) : Number.NaN;
                      const clamped =
                        Number.isFinite(numeric) && gapAdjustModal.maxRemoveMs > 0
                          ? Math.min(Math.max(0, numeric), gapAdjustModal.maxRemoveMs)
                          : gapAdjustModal.maxRemoveMs;
                      setGapAdjustModal({
                        ...gapAdjustModal,
                        mode: "remove",
                        ms: String(clamped)
                      });
                    }}
                    type="button"
                    disabled={!gapAdjustModal.hasGap}
                  >
                    Remove
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={100}
                  max={gapAdjustModal.mode === "remove" ? gapAdjustModal.maxRemoveMs : undefined}
                  value={gapAdjustModal.ms}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === "") {
                      setGapAdjustModal({ ...gapAdjustModal, ms: "" });
                      return;
                    }
                    if (gapAdjustModal.mode === "remove") {
                      const numeric = Number(nextValue);
                      if (Number.isFinite(numeric) && gapAdjustModal.maxRemoveMs > 0) {
                        const clamped = Math.min(Math.max(0, numeric), gapAdjustModal.maxRemoveMs);
                        setGapAdjustModal({ ...gapAdjustModal, ms: String(clamped) });
                        return;
                      }
                    }
                    setGapAdjustModal({ ...gapAdjustModal, ms: nextValue });
                  }}
                  className="w-full flex-1 rounded-md bg-[#0b0b0b] px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#3b82f6]/60"
                  autoFocus
                />
                <span className="text-[11px] text-slate-500">ms</span>
              </div>
              {gapAdjustModal.mode === "remove" && gapAdjustModal.hasGap ? (
                <p className="mt-2 text-[10px] text-slate-500">
                  Max removable: {gapAdjustModal.maxRemoveMs} ms
                </p>
              ) : null}
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setGapAdjustModal(null)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                  onClick={() => {
                    const valueMs = gapAdjustModal.ms.trim() ? Number(gapAdjustModal.ms) : 0;
                    if (!Number.isFinite(valueMs) || valueMs <= 0) {
                      notify("Please enter a valid gap in milliseconds.", "error");
                      return;
                    }
                    if (gapAdjustModal.mode === "remove" && valueMs > gapAdjustModal.maxRemoveMs) {
                      notify("Remove gap exceeds the available gap.", "error");
                      return;
                    }
                    onAdjustGapAfter(
                      gapAdjustModal.segment,
                      gapAdjustModal.mode,
                      valueMs,
                      gapAdjustModal.maxRemoveMs
                    );
                    setGapAdjustModal(null);
                  }}
                  type="button"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {alertModal ? (
        <div
          className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setAlertModal(null)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon
                    name={
                      alertModal.tone === "success"
                        ? "checkCircle"
                        : alertModal.tone === "error"
                          ? "exclamationTriangle"
                          : "exclamationCircle"
                    }
                    className="text-[16px]"
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">{alertModal.title}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{alertModal.message}</p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="inline-flex h-7 items-center justify-center rounded-md bg-[#1b1b22] px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
                  onClick={() => setAlertModal(null)}
                  type="button"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showOpenModal ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Open</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Import a local file or load YouTube media.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    youtubeImporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#151515]"
                  )}
                  onClick={handleOpenLocalFromModal}
                  type="button"
                  disabled={youtubeImporting}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center text-white">
                      <AppIcon name="video" className="text-[16px]" />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">Import video / audio</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Choose a local media file to continue.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    youtubeImporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#151515]"
                  )}
                  onClick={handleOpenYoutubeModal}
                  type="button"
                  disabled={youtubeImporting}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center text-[#ff0000]">
                      <AppIcon name="youtube" className="text-[18px]" />
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-semibold text-slate-100">From YouTube</div>
                      <p className="mt-1 text-[11px] text-slate-400">Load from Youtube media.</p>
                    </div>
                  </div>
                </button>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setShowOpenModal(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showYoutubeModal || youtubeImporting ? (
        <div
          className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!youtubeImporting) {
              setShowYoutubeModal(false);
            }
          }}
        >
          <div
            className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <AppIcon name="youtube" className="text-[22px] text-[#ff0000]" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-100 truncate">
                    {youtubeImportTitle ? youtubeImportTitle : "Load YouTube media"}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Paste a YouTube link to import media.
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(event) => {
                      setYoutubeUrl(event.target.value);
                      if (youtubeError) {
                        setYoutubeError(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (!youtubeImporting) {
                          handleImportYoutube();
                        }
                      }
                    }}
                    placeholder="Paste a YouTube link"
                    className={cn(
                      "w-full flex-1 rounded-xl bg-[#0b0b0b] px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#3b82f6]/60",
                      youtubeImporting && "cursor-not-allowed opacity-60"
                    )}
                    disabled={youtubeImporting}
                  />
                  {youtubeImporting ? (
                    <div className="flex h-8 w-8 items-center justify-center">
                      <AppIcon name="spinner" className="text-[14px] text-slate-200" spin />
                    </div>
                  ) : (
                    <button
                      className="rounded-md bg-white px-3 py-2 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95 disabled:opacity-60"
                      onClick={handleImportYoutube}
                      type="button"
                      disabled={!youtubeUrl.trim()}
                    >
                      Import
                    </button>
                  )}
                </div>
                {youtubeError ? <p className="text-[11px] text-rose-400">{youtubeError}</p> : null}
                {youtubeImporting ? (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1b1b22]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        isYoutubeIndeterminate ? "youtube-progress-active" : "bg-white"
                      )}
                      style={{
                        width: `${Math.max(0, Math.min(100, youtubeProgressValue))}%`
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showPremiumModal ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPremiumModal(false)}
        >
          <div
            className="w-full max-w-[720px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-[70vh] w-full flex-col">
              <div className="relative flex-1">
                {premiumWebviewStatus !== "error" ? (
                  <iframe
                    key={premiumIframeKey}
                    ref={premiumWebviewRef}
                    title="Premium Webview"
                    src={`/premium/webview?url=${encodeURIComponent(
                      (import.meta as any)?.env?.VITE_PREMIUM_PAGE_URL || "https://www.google.com"
                    )}`}
                    className="h-full w-full border-0 bg-black"
                    onLoad={onPremiumWebviewLoad}
                    onError={onPremiumWebviewError}
                  />
                ) : null}
                {premiumWebviewStatus === "loading" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0f0f10] text-slate-200">
                    <AppIcon name="spinner" className="text-[18px] text-white/80" spin />
                    <div className="text-[12px] font-semibold">Loading content…</div>
                    <div className="text-[10px] text-slate-400">Fetching the latest Premium page</div>
                  </div>
                ) : null}
                {premiumWebviewStatus === "error" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0f0f10] px-8 text-center text-slate-200">
                    <div className="flex h-20 w-20 items-center justify-center">
                      <svg
                        viewBox="0 0 120 120"
                        className="h-14 w-14 text-slate-200/80"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 62c0-18 16-32 35-32 9 0 18 4 24 10 3-1 6-2 9-2 11 0 20 9 20 20 0 12-9 22-21 22H42c-12 0-22-10-22-22z" />
                        <path d="M38 82l44-36" />
                        <path d="M46 90l-8 8" />
                        <path d="M74 90l8 8" />
                      </svg>
                    </div>
                    <div className="text-[15px] font-semibold text-slate-100">Unable to load</div>
                    <div className="max-w-[360px] text-[12px] text-slate-400">
                      {premiumWebviewError ?? "Please check your connection and try again."}
                    </div>
                    <button
                      type="button"
                      onClick={onPremiumRetry}
                      className="inline-flex h-8 items-center justify-center rounded-full px-3 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white"
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="px-4 py-4">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                  <span className="text-slate-400">Your machine code</span>
                  <span className="break-all font-mono">{machineIdLoading ? "Loading..." : machineId ?? "Unknown"}</span>
                  <button
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-md text-[9px] text-slate-300 transition hover:bg-white/10 hover:text-white",
                      machineIdCopied && "text-emerald-300"
                    )}
                    onClick={onCopyMachineId}
                    type="button"
                    disabled={!machineId || machineIdLoading}
                    aria-label={machineIdCopied ? "Copied" : "Copy machine code"}
                    title={machineIdCopied ? "Copied" : "Copy"}
                  >
                    <AppIcon name={machineIdCopied ? "check" : "copy"} className="text-[9px]" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={premiumKey}
                    onChange={(event) => setPremiumKey(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onConfirmPremiumKey();
                      }
                    }}
                    placeholder="Enter your key"
                    className="w-full flex-1 rounded-full border-0 bg-[#151515] px-4 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#3b82f6]/60"
                    disabled={isPremium || premiumKeySubmitting}
                  />
                  <button
                    className="rounded-full bg-white px-4 py-2 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95 disabled:opacity-60"
                    type="button"
                    onClick={onConfirmPremiumKey}
                    disabled={!premiumKey.trim() || isPremium || premiumKeySubmitting}
                  >
                    {premiumKeySubmitting ? "Verifying..." : isPremium ? "Activated" : "Confirm"}
                  </button>
                </div>
                {isPremium ? (
                  <p className="mt-2 text-[11px] font-semibold text-emerald-300">
                    Premium is active on this machine.
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showPremiumStatusModal ? (
        <div
          className="fixed inset-0 z-[131] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowPremiumStatusModal(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-emerald-500/20 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200">
                  <AppIcon name="user" className="text-[14px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-100">Premium Member</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    This machine is activated for Premium.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-[11px] text-slate-300">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Machine code</span>
                  <span className="max-w-[230px] break-all text-right font-mono text-slate-200">
                    {premiumDetails?.machineId ?? machineId ?? "Unknown"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Activated</span>
                  <span className="text-slate-200">{formatTimestamp(premiumDetails?.activatedAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Expires</span>
                  <span className="text-emerald-300">Lifetime</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button
                  className="inline-flex h-8 items-center justify-center rounded-full border border-emerald-500/30 px-3 text-[11px] font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-60"
                  onClick={onCopyMachineId}
                  type="button"
                  disabled={!machineId || machineIdLoading}
                >
                  Copy machine code
                </button>
                <button
                  className="inline-flex h-8 items-center justify-center rounded-full bg-white px-4 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                  onClick={() => setShowPremiumStatusModal(false)}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {updateModal ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center text-white">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 16.5a4.5 4.5 0 0 0-2-8.5h-0.6A7 7 0 1 0 5 16.2" />
                    <path d="M12 12v7" />
                    <path d="m8.5 15.5 3.5 3.5 3.5-3.5" />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    {updateForceRequired ? "Update required" : "Update available"}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">Latest version is available.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 text-[11px] text-slate-300">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Current version</span>
                  <span>{updateCurrentVersion ?? "Unknown"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Latest version</span>
                  <span>{updateLatestVersion ?? "Unknown"}</span>
                </div>
                {updateModal.publishedAt ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Published</span>
                    <span>{updateModal.publishedAt}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => {
                    if (updateForceRequired) {
                      onWindowAction("close");
                      return;
                    }
                    clearUpdateModal();
                  }}
                  type="button"
                >
                  {updateForceRequired ? "Exit" : "Later"}
                </button>
                {updateAvailable ? (
                  <button
                    className={cn(
                      "rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95",
                      !updateModal.downloadUrl && "cursor-not-allowed opacity-60"
                    )}
                    onClick={() => {
                      if (updateModal.downloadUrl) {
                        onOpenExternalUrl(updateModal.downloadUrl);
                        onWindowAction("close");
                      }
                    }}
                    type="button"
                    disabled={!updateModal.downloadUrl}
                  >
                    {updateForceRequired ? "Update now" : "Update"}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showExportModal ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Export</div>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Choose a format to export your captions.
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    isExporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#151515]"
                  )}
                  onClick={() => {
                    if (isExporting) return;
                    setShowExportModal(false);
                    onExportSrt();
                  }}
                  disabled={isExporting}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center text-white">
                      <AppIcon name="captions" className="text-[18px]" />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">Standard SRT</div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Best for video editors and media players.
                      </p>
                    </div>
                  </div>
                </button>
                <button
                  className={cn(
                    "group w-full rounded-xl px-4 py-3 text-left transition",
                    isExporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#151515]"
                  )}
                  onClick={() => {
                    if (isExporting) return;
                    setShowExportModal(false);
                    onExportTranscript();
                  }}
                  disabled={isExporting}
                  type="button"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center text-white">
                      <AppIcon name="edit" className="text-[17px]" />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-slate-100">Plain Text</div>
                      <p className="mt-1 text-[11px] text-slate-400">A clean transcript without timestamps.</p>
                    </div>
                  </div>
                </button>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setShowExportModal(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {modelDownloadActive ? (
        <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon
                    name={modelDownloadState.status === "error" ? "exclamationTriangle" : "download"}
                    className="text-[16px]"
                  />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-slate-100">{modelDownloadTitle}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {modelDownloadState.message}
                  </p>
                </div>
              </div>

              {modelDownloadState.status !== "error" ? (
                <div className="mt-4 space-y-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#1f2937]">
                    {modelDownloadState.progress !== null ? (
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.max(2, Math.min(100, modelDownloadState.progress))}%` }}
                      />
                    ) : (
                      <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>
                      {modelDownloadState.progress !== null
                        ? `${modelDownloadState.progress}%`
                        : "Preparing..."}
                    </span>
                    <span>{modelProgressText ?? ""}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-4 space-y-2 text-[11px] text-slate-400">
                  {modelDownloadState.detail ? <p>{modelDownloadState.detail}</p> : null}
                  {modelDownloadState.downloadUrl ? (
                    <p>
                      Download URL:
                      <span className="ml-1 break-all text-slate-200">{modelDownloadState.downloadUrl}</span>
                    </p>
                  ) : null}
                  {modelDownloadState.expectedPath ? (
                    <p>
                      Save the model to:
                      <span className="ml-1 break-all text-slate-200">{modelDownloadState.expectedPath}</span>
                    </p>
                  ) : null}
                </div>
              )}

              {modelDownloadState.status === "error" ? (
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    className="rounded-md border border-slate-700 bg-[#151515] px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500"
                    onClick={onClearModelDownload}
                    type="button"
                  >
                    Close
                  </button>
                  <button
                    className="rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                    onClick={onRetryModelDownload}
                    type="button"
                  >
                    Retry Download
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {showImportModal ? (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
                  <AppIcon name="exclamationTriangle" className="text-[16px]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-100">Open media to generate captions</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    Open a video or audio file first, then run AI captions.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  className="rounded-md bg-transparent px-3 py-1.5 text-[11px] font-semibold text-slate-200 transition hover:bg-[#1b1b22]"
                  onClick={() => setShowImportModal(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="rounded-md bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95"
                  onClick={() => {
                    setShowImportModal(false);
                    handleOpenModal();
                  }}
                  type="button"
                >
                  Open Media
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

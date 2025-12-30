import type { AppState } from "../hooks/useAppState";
import { HeaderBar } from "../components/HeaderBar";
import { TimelinePanel } from "../components/TimelinePanel";
import { AppOverlays } from "../components/AppOverlays";
import { AppIcon } from "../../shared/components/AppIcon";
import { cn } from "../../shared/lib/cn";

export function AppShell(props: AppState) {
  const {
    isMac,
    isWindowFocused,
    isAltPressed,
    isHeaderCompact,
    isHeaderMenuOpen,
    showCustomWindowControls,
    isPinned,
    isExporting,
    isPremium,
    premiumStatusLoading,
    headerMenuRef,
    headerMenuButtonRef,
    getHeaderDragProps,
    handleTogglePinned,
    handleOpenPremiumModal,
    handleWindowAction,
    setIsHeaderMenuOpen,
    layoutClass,
    isCompact,
    dragRegionClass,
    setIsLeftDrawerOpen,
    compactTab,
    setCompactTab,
    segments,
    isTranscriptEdit,
    setIsTranscriptEdit,
    playerPanel,
    leftPanelContent,
    captionSidebarContent,
    timelineZoom,
    setTimelineZoom,
    timelineScrollRef,
    handleTimelineScroll,
    handleTimelineWheel,
    timelineScrollWidth,
    timelineWidth,
    playheadLeftPx,
    ticks,
    pxPerSec,
    onTrackPointerDown,
    onTrackPointerMove,
    onTrackPointerUp,
    timelineSegmentEls,
    gapMenu,
    gapMenuHighlight,
    captionMenuGapAfter,
    captionMenuGapHighlight,
    captionHover,
    gapMenuOpenRef,
    handleCaptionHoverMove,
    setCaptionHover,
    handleAddCaption,
    handleGapContextMenu,
    exportLanguage,
    handleClearCaptions,
    handleLoadSrt,
    handleToggleChineseVariant,
    handleSubtitleScaleDecrease,
    handleSubtitleScaleIncrease,
    handleSplitCaption,
    activeSubtitleSegment,
    isLeftDrawerOpen,
    isPlayerModalVisible,
    isPlayerModalOpen,
    setIsPlayerModalOpen,
    setIsPlayerModalVisible,
    playerModalPanel,
    captionSidebarModalContent,
    captionMenu,
    captionMenuPosition,
    setCaptionMenuGapHighlight,
    handleDeleteCaption,
    handleOpenGapAdjust,
    closeCaptionMenu,
    gapMenuPosition,
    setGapMenuHighlight,
    handleRemoveGap,
    handleCloseGapMenu,
    gapAdjustModal,
    setGapAdjustModal,
    handleAdjustGapAfter,
    notify,
    alertModal,
    setAlertModal,
    mediaImport,
    showPremiumModal,
    setShowPremiumModal,
    premiumWebviewStatus,
    premiumIframeKey,
    premiumWebviewRef,
    handlePremiumWebviewLoad,
    handlePremiumWebviewError,
    premiumWebviewError,
    handlePremiumRetry,
    machineIdLoading,
    machineId,
    machineIdCopied,
    handleCopyMachineId,
    premiumKey,
    setPremiumKey,
    handleConfirmPremiumKey,
    premiumKeySubmitting,
    showPremiumStatusModal,
    setShowPremiumStatusModal,
    premiumDetails,
    updateModal,
    updateForceRequired,
    updateAvailable,
    updateCurrentVersion,
    updateLatestVersion,
    openExternalUrl,
    setUpdateModal,
    showExportModal,
    setShowExportModal,
    handleExportSrt,
    handleExportTranscript,
    modelDownloadActive,
    modelDownload,
    modelDownloadTitle,
    modelProgressText,
    clearModelDownload,
    handleRetryModelDownload,
    srtInputRef,
    handleSrtSelected,
    audioRef,
    audioPreviewSrc
  } = props;

  const overlays = {
    isCompact,
    isLeftDrawerOpen,
    onCloseLeftDrawer: () => setIsLeftDrawerOpen(false),
    leftPanelContent,
    isPlayerModalVisible,
    isPlayerModalOpen,
    onClosePlayerModal: () => setIsPlayerModalOpen(false),
    onPlayerModalTransitionEnd: () => setIsPlayerModalVisible(false),
    getHeaderDragProps,
    playerPanel: playerModalPanel,
    captionSidebarContent: captionSidebarModalContent,
    segmentsLength: segments.length,
    isTranscriptEdit,
    onToggleTranscriptEdit: () => setIsTranscriptEdit((prev) => !prev),
    captionMenu,
    captionMenuPosition,
    captionMenuGapAfter,
    captionMenuGapHighlight,
    setCaptionMenuGapHighlight,
    onSplitCaption: handleSplitCaption,
    onDeleteCaption: handleDeleteCaption,
    onOpenGapAdjust: handleOpenGapAdjust,
    onCloseCaptionMenu: closeCaptionMenu,
    gapMenu,
    gapMenuPosition,
    gapMenuHighlight,
    setGapMenuHighlight,
    onRemoveGap: handleRemoveGap,
    onCloseGapMenu: handleCloseGapMenu,
    gapAdjustModal,
    setGapAdjustModal,
    onAdjustGapAfter: handleAdjustGapAfter,
    alerts: {
      notify,
      alertModal,
      setAlertModal
    },
    mediaImport,
    premium: {
      showPremiumModal,
      setShowPremiumModal,
      premiumWebviewStatus,
      premiumIframeKey,
      premiumWebviewRef,
      onPremiumWebviewLoad: handlePremiumWebviewLoad,
      onPremiumWebviewError: handlePremiumWebviewError,
      premiumWebviewError,
      onPremiumRetry: handlePremiumRetry,
      machineIdLoading,
      machineId,
      machineIdCopied,
      onCopyMachineId: handleCopyMachineId,
      premiumKey,
      setPremiumKey,
      onConfirmPremiumKey: handleConfirmPremiumKey,
      premiumKeySubmitting,
      isPremium,
      showPremiumStatusModal,
      setShowPremiumStatusModal,
      premiumDetails
    },
    updates: {
      updateModal,
      updateForceRequired,
      updateAvailable,
      updateCurrentVersion,
      updateLatestVersion,
      onOpenExternalUrl: openExternalUrl,
      onWindowAction: handleWindowAction,
      clearUpdateModal: () => setUpdateModal(null)
    },
    exporting: {
      showExportModal,
      setShowExportModal,
      isExporting,
      onExportSrt: handleExportSrt,
      onExportTranscript: handleExportTranscript
    },
    modelDownload: {
      modelDownloadActive,
      modelDownload,
      modelDownloadTitle,
      modelProgressText,
      onClearModelDownload: clearModelDownload,
      onRetryModelDownload: handleRetryModelDownload
    }
  };

  return (
    <>
      <div className="flex h-full w-full flex-col bg-[#0b0b0b] text-slate-100">
        <HeaderBar
          isMac={isMac}
          isWindowFocused={isWindowFocused}
          isAltPressed={isAltPressed}
          isHeaderCompact={isHeaderCompact}
          isHeaderMenuOpen={isHeaderMenuOpen}
          showCustomWindowControls={showCustomWindowControls}
          isPinned={isPinned}
          isExporting={isExporting}
          isPremium={isPremium}
          premiumStatusLoading={premiumStatusLoading}
          headerMenuRef={headerMenuRef}
          headerMenuButtonRef={headerMenuButtonRef}
          getHeaderDragProps={getHeaderDragProps}
          onOpenModal={mediaImport.actions.openModal}
          onTogglePinned={handleTogglePinned}
          onOpenExport={() => setShowExportModal(true)}
          onOpenPremium={handleOpenPremiumModal}
          onWindowAction={handleWindowAction}
          onToggleHeaderMenu={() => setIsHeaderMenuOpen((prev) => !prev)}
          onCloseHeaderMenu={() => setIsHeaderMenuOpen(false)}
        />
        <div className={cn(layoutClass, "flex-1")}>
          {!isCompact ? (
            <aside className="row-start-1 row-end-2 flex min-h-0 flex-col bg-[#0b0b0b]">
              {leftPanelContent}
            </aside>
          ) : null}

          <section className="row-start-1 row-end-2 flex min-h-0 flex-col bg-[#0b0b0b]">
            <div
              className={cn(
                dragRegionClass,
                "flex shrink-0 items-center justify-between px-4 py-2 text-xs text-slate-400"
              )}
            >
              <div className="flex items-center gap-2">
                {isCompact ? (
                  <button
                    className="pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#1b1b22] text-[10px] text-slate-200 transition hover:bg-[#26262f]"
                    onClick={() => setIsLeftDrawerOpen(true)}
                    type="button"
                    aria-label="Menu"
                    title="Menu"
                  >
                    <AppIcon name="bars" />
                  </button>
                ) : null}
              </div>
              {isCompact ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      className={cn(
                        "pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-[10px] transition",
                        compactTab === "player"
                          ? "bg-primary text-white"
                          : "bg-[#1b1b22] text-slate-300 hover:bg-[#26262f]"
                      )}
                      onClick={() => setCompactTab("player")}
                      type="button"
                      aria-label="Video"
                      title="Video"
                    >
                      <AppIcon name="video" />
                    </button>
                    <button
                      className={cn(
                        "pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-[10px] transition",
                        compactTab === "captions"
                          ? "bg-primary text-white"
                          : "bg-[#1b1b22] text-slate-300 hover:bg-[#26262f]"
                      )}
                      onClick={() => setCompactTab("captions")}
                      type="button"
                      aria-label="Captions"
                      title="Captions"
                    >
                      <AppIcon name="captions" />
                    </button>
                  </div>
                  {compactTab === "captions" && segments.length > 0 ? (
                    <button
                      className={cn(
                        "pywebview-no-drag inline-flex items-center gap-2 text-[10px] font-medium transition",
                        isTranscriptEdit ? "text-slate-200" : "text-slate-500"
                      )}
                      onClick={() => setIsTranscriptEdit((prev) => !prev)}
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
              ) : null}
            </div>
            {isPlayerModalVisible ? null : playerPanel}
          </section>

          {!isCompact ? (
            <aside className="row-start-1 row-end-2 flex min-h-0 flex-col overflow-hidden bg-[#0b0b0b]">
              <div
                className={cn(
                  dragRegionClass,
                  "flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200"
                )}
              >
                <span>Caption Setting</span>
                {segments.length > 0 ? (
                  <button
                    className={cn(
                      "pywebview-no-drag inline-flex items-center gap-2 text-[10px] font-medium transition",
                      isTranscriptEdit ? "text-slate-200" : "text-slate-500"
                    )}
                    onClick={() => setIsTranscriptEdit((prev) => !prev)}
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
          ) : null}

          <TimelinePanel
            isCompact={isCompact}
            segmentsLength={segments.length}
            exportLanguage={exportLanguage}
            onClearCaptions={handleClearCaptions}
            onLoadSrt={handleLoadSrt}
            onToggleChineseVariant={handleToggleChineseVariant}
            onSubtitleScaleDecrease={handleSubtitleScaleDecrease}
            onSubtitleScaleIncrease={handleSubtitleScaleIncrease}
            onSplitCaption={handleSplitCaption}
            activeSubtitleSegment={activeSubtitleSegment}
            timelineZoom={timelineZoom}
            onTimelineZoomChange={setTimelineZoom}
            timelineScrollRef={timelineScrollRef}
            onTimelineScroll={handleTimelineScroll}
            onTimelineWheel={handleTimelineWheel}
            timelineScrollWidth={timelineScrollWidth}
            timelineWidth={timelineWidth}
            playheadLeftPx={playheadLeftPx}
            ticks={ticks}
            pxPerSec={pxPerSec}
            onTrackPointerDown={onTrackPointerDown}
            onTrackPointerMove={onTrackPointerMove}
            onTrackPointerUp={onTrackPointerUp}
            timelineSegmentEls={timelineSegmentEls}
            gapMenu={gapMenu}
            gapMenuHighlight={gapMenuHighlight}
            captionMenuGapAfter={captionMenuGapAfter}
            captionMenuGapHighlight={captionMenuGapHighlight}
            captionHover={captionHover}
            gapMenuOpenRef={gapMenuOpenRef}
            onCaptionHoverMove={handleCaptionHoverMove}
            onClearCaptionHover={() => setCaptionHover(null)}
            onAddCaption={handleAddCaption}
            onGapContextMenu={handleGapContextMenu}
          />
        </div>
      </div>

      <AppOverlays {...overlays} />

      <input
        ref={srtInputRef}
        type="file"
        accept=".srt,application/x-subrip,text/plain"
        className="hidden"
        onChange={() => {
          const file = srtInputRef.current?.files?.[0];
          if (file) {
            void handleSrtSelected(file);
          }
          if (srtInputRef.current) {
            srtInputRef.current.value = "";
          }
        }}
      />
      <audio ref={audioRef} preload="auto" src={audioPreviewSrc || undefined} className="sr-only" />
    </>
  );
}

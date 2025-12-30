import type { AppOverlaysProps } from "./AppOverlays.types";
import { DrawerOverlay } from "./DrawerOverlay";
import { PlayerModalOverlay } from "../../player/components/PlayerModalOverlay";
import { CaptionMenuOverlay } from "../../timeline/components/CaptionMenuOverlay";
import { GapMenuOverlay } from "../../timeline/components/GapMenuOverlay";
import { GapAdjustModalOverlay } from "../../timeline/components/GapAdjustModalOverlay";
import { AlertModalOverlay } from "../../common/AlertModalOverlay";
import { OpenMediaModal } from "../../mediaImport/components/OpenMediaModal";
import { YoutubeImportModal } from "../../mediaImport/components/YoutubeImportModal";
import { PremiumModalOverlay } from "../../premium/components/PremiumModalOverlay";
import { PremiumStatusModalOverlay } from "../../premium/components/PremiumStatusModalOverlay";
import { UpdateModalOverlay } from "../../update/components/UpdateModalOverlay";
import { ExportModalOverlay } from "../../export/components/ExportModalOverlay";
import { ModelDownloadModalOverlay } from "../../model/components/ModelDownloadModalOverlay";
import { ImportPromptModal } from "../../mediaImport/components/ImportPromptModal";

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
    modals: { showOpenModal, setShowOpenModal, showYoutubeModal, setShowYoutubeModal, showImportModal, setShowImportModal },
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
      <DrawerOverlay
        isCompact={isCompact}
        isLeftDrawerOpen={isLeftDrawerOpen}
        onCloseLeftDrawer={onCloseLeftDrawer}
        leftPanelContent={leftPanelContent}
      />

      <PlayerModalOverlay
        isPlayerModalVisible={isPlayerModalVisible}
        isPlayerModalOpen={isPlayerModalOpen}
        onClosePlayerModal={onClosePlayerModal}
        onPlayerModalTransitionEnd={onPlayerModalTransitionEnd}
        getHeaderDragProps={getHeaderDragProps}
        playerPanel={playerPanel}
        captionSidebarContent={captionSidebarContent}
        segmentsLength={segmentsLength}
        isTranscriptEdit={isTranscriptEdit}
        onToggleTranscriptEdit={onToggleTranscriptEdit}
      />

      <CaptionMenuOverlay
        captionMenu={captionMenu}
        captionMenuPosition={captionMenuPosition}
        captionMenuGapAfter={captionMenuGapAfter}
        captionMenuGapHighlight={captionMenuGapHighlight}
        setCaptionMenuGapHighlight={setCaptionMenuGapHighlight}
        onSplitCaption={onSplitCaption}
        onDeleteCaption={onDeleteCaption}
        onOpenGapAdjust={onOpenGapAdjust}
        onCloseCaptionMenu={onCloseCaptionMenu}
      />

      <GapMenuOverlay
        gapMenu={gapMenu}
        gapMenuPosition={gapMenuPosition}
        setGapMenuHighlight={setGapMenuHighlight}
        onRemoveGap={onRemoveGap}
        onCloseGapMenu={onCloseGapMenu}
      />

      <GapAdjustModalOverlay
        gapAdjustModal={gapAdjustModal}
        setGapAdjustModal={setGapAdjustModal}
        notify={notify}
        onAdjustGapAfter={onAdjustGapAfter}
      />

      <AlertModalOverlay alertModal={alertModal} setAlertModal={setAlertModal} />

      <OpenMediaModal
        showOpenModal={showOpenModal}
        youtubeImporting={youtubeImporting}
        onOpenLocalFromModal={handleOpenLocalFromModal}
        onOpenYoutubeModal={handleOpenYoutubeModal}
        setShowOpenModal={setShowOpenModal}
      />

      <YoutubeImportModal
        isOpen={showYoutubeModal || youtubeImporting}
        youtubeImporting={youtubeImporting}
        youtubeImportTitle={youtubeImportTitle}
        youtubeUrl={youtubeUrl}
        setYoutubeUrl={setYoutubeUrl}
        youtubeError={youtubeError}
        setYoutubeError={setYoutubeError}
        isYoutubeIndeterminate={isYoutubeIndeterminate}
        youtubeProgressValue={youtubeProgressValue}
        onImportYoutube={handleImportYoutube}
        setShowYoutubeModal={setShowYoutubeModal}
      />

      <PremiumModalOverlay
        showPremiumModal={showPremiumModal}
        setShowPremiumModal={setShowPremiumModal}
        premiumWebviewStatus={premiumWebviewStatus}
        premiumIframeKey={premiumIframeKey}
        premiumWebviewRef={premiumWebviewRef}
        onPremiumWebviewLoad={onPremiumWebviewLoad}
        onPremiumWebviewError={onPremiumWebviewError}
        premiumWebviewError={premiumWebviewError}
        onPremiumRetry={onPremiumRetry}
        machineIdLoading={machineIdLoading}
        machineId={machineId}
        machineIdCopied={machineIdCopied}
        onCopyMachineId={onCopyMachineId}
        premiumKey={premiumKey}
        setPremiumKey={setPremiumKey}
        onConfirmPremiumKey={onConfirmPremiumKey}
        premiumKeySubmitting={premiumKeySubmitting}
        isPremium={isPremium}
      />

      <PremiumStatusModalOverlay
        showPremiumStatusModal={showPremiumStatusModal}
        setShowPremiumStatusModal={setShowPremiumStatusModal}
        premiumDetails={premiumDetails}
        machineIdLoading={machineIdLoading}
        machineId={machineId}
        onCopyMachineId={onCopyMachineId}
      />

      <UpdateModalOverlay
        updateModal={updateModal}
        updateForceRequired={updateForceRequired}
        updateAvailable={updateAvailable}
        updateCurrentVersion={updateCurrentVersion}
        updateLatestVersion={updateLatestVersion}
        onOpenExternalUrl={onOpenExternalUrl}
        onWindowAction={onWindowAction}
        clearUpdateModal={clearUpdateModal}
      />

      <ExportModalOverlay
        showExportModal={showExportModal}
        setShowExportModal={setShowExportModal}
        isExporting={isExporting}
        onExportSrt={onExportSrt}
        onExportTranscript={onExportTranscript}
      />

      <ModelDownloadModalOverlay
        modelDownloadActive={modelDownloadActive}
        modelDownload={modelDownloadState}
        modelDownloadTitle={modelDownloadTitle}
        modelProgressText={modelProgressText}
        onClearModelDownload={onClearModelDownload}
        onRetryModelDownload={onRetryModelDownload}
      />

      <ImportPromptModal
        showImportModal={showImportModal}
        setShowImportModal={setShowImportModal}
        onOpenModal={handleOpenModal}
      />
    </>
  );
}


export type {
  AppOverlaysProps,
  CaptionMenuState,
  GapMenuState,
  GapAdjustModalState,
  PremiumDetails,
  AlertOverlayProps,
  MediaImportOverlayProps,
  PremiumOverlayProps,
  UpdateOverlayProps,
  ExportOverlayProps,
  ModelDownloadOverlayProps
} from "./AppOverlays.types";

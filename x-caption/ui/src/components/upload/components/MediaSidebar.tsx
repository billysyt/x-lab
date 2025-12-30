import type { RefObject } from "react";
import { UploadTab, type UploadTabHandle, type MediaItem } from "./UploadTab";
import type { ToastType } from "../../../components/common/ToastHost";
import { AppIcon } from "../../../components/common/AppIcon";
import { cn } from "../../../lib/cn";

export type MediaSidebarProps = {
  isCompact: boolean;
  dragRegionClass: string;
  onClose: () => void;
  uploadRef: RefObject<UploadTabHandle>;
  notify: (message: string, type?: ToastType) => void;
  localMedia: MediaItem[];
  onLocalMediaChange: (media: MediaItem[]) => void;
  onAddToTimeline: (items: MediaItem[]) => void;
  onClearSelection: () => void;
  onRequestFilePicker: (open: () => void) => void;
  secondCaptionEnabled: boolean;
  secondCaptionLanguage: "yue" | "zh" | "en";
};

export function MediaSidebar({
  isCompact,
  dragRegionClass,
  onClose,
  uploadRef,
  notify,
  localMedia,
  onLocalMediaChange,
  onAddToTimeline,
  onClearSelection,
  onRequestFilePicker,
  secondCaptionEnabled,
  secondCaptionLanguage
}: MediaSidebarProps) {
  return (
    <>
      <div className={cn(dragRegionClass, "flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-200")}>
        <span>Media</span>
        {isCompact ? (
          <button
            className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-800/20 bg-[#151515] text-[10px] text-slate-300 hover:border-slate-600"
            onClick={onClose}
            type="button"
            aria-label="Close"
            title="Close"
          >
            <AppIcon name="chevronLeft" />
          </button>
        ) : null}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-4 py-3 stt-scrollbar",
          !isCompact && "h-[calc(100vh-340px)] max-h-[calc(100vh-340px)]"
        )}
      >
        <div className="h-full">
          <UploadTab
            ref={uploadRef}
            notify={notify}
            localMedia={localMedia}
            onLocalMediaChange={onLocalMediaChange}
            onAddToTimeline={onAddToTimeline}
            onClearSelection={onClearSelection}
            onRequestFilePicker={onRequestFilePicker}
            secondCaptionEnabled={secondCaptionEnabled}
            secondCaptionLanguage={secondCaptionLanguage}
          />
        </div>
      </div>
    </>
  );
}

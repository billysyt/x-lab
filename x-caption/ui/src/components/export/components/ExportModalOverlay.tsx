import { AppIcon } from "../../common/AppIcon";
import { cn } from "../../../lib/cn";
import type { ExportOverlayProps } from "../../layout/AppOverlays.types";

type ExportModalOverlayProps = ExportOverlayProps;

export function ExportModalOverlay({
  showExportModal,
  setShowExportModal,
  isExporting,
  onExportSrt,
  onExportTranscript
}: ExportModalOverlayProps) {
  if (!showExportModal) return null;
  return (
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
  );
}

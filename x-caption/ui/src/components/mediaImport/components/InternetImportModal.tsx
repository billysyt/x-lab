import { AppIcon } from "../../common/AppIcon";
import { cn } from "../../../lib/cn";

type InternetImportModalProps = {
  isOpen: boolean;
  internetImporting: boolean;
  internetImportTitle: string | null;
  internetUrl: string;
  setInternetUrl: (value: string) => void;
  internetError: string | null;
  setInternetError: (value: string | null) => void;
  isInternetIndeterminate: boolean;
  internetProgressValue: number;
  onImportInternet: () => void;
  setShowInternetModal: (value: boolean) => void;
};

export function InternetImportModal({
  isOpen,
  internetImporting,
  internetImportTitle,
  internetUrl,
  setInternetUrl,
  internetError,
  setInternetError,
  isInternetIndeterminate,
  internetProgressValue,
  onImportInternet,
  setShowInternetModal
}: InternetImportModalProps) {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => {
        if (!internetImporting) {
          setShowInternetModal(false);
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
            <AppIcon name="globe" className="text-[22px] text-[#60a5fa]" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-slate-100 truncate">
                {internetImportTitle ? internetImportTitle : "Load from Internet"}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Paste a video URL to auto-detect and import media.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={internetUrl}
                onChange={(event) => {
                  setInternetUrl(event.target.value);
                  if (internetError) {
                    setInternetError(null);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (!internetImporting) {
                      onImportInternet();
                    }
                  }
                }}
                placeholder="Paste a video URL"
                className={cn(
                  "w-full flex-1 rounded-xl bg-[#0b0b0b] px-3 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#3b82f6]/60",
                  internetImporting && "cursor-not-allowed opacity-60"
                )}
                disabled={internetImporting}
              />
              {internetImporting ? (
                <div className="flex h-8 w-8 items-center justify-center">
                  <AppIcon name="spinner" className="text-[14px] text-slate-200" spin />
                </div>
              ) : (
                <button
                  className="rounded-md bg-white px-3 py-2 text-[11px] font-semibold text-[#0b0b0b] transition hover:brightness-95 disabled:opacity-60"
                  onClick={onImportInternet}
                  type="button"
                  disabled={!internetUrl.trim()}
                >
                  Import
                </button>
              )}
            </div>
            {internetError ? <p className="text-[11px] text-rose-400">{internetError}</p> : null}
            {internetImporting ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1b1b22]">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isInternetIndeterminate ? "animate-pulse bg-gradient-to-r from-blue-500 to-blue-400" : "bg-white"
                  )}
                  style={{
                    width: isInternetIndeterminate ? "100%" : `${Math.max(0, Math.min(100, internetProgressValue))}%`
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

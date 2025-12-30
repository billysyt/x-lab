import { AppIcon } from "../../common/AppIcon";
import type { ModelDownloadOverlayProps } from "../../layout/AppOverlays.types";

type ModelDownloadModalOverlayProps = ModelDownloadOverlayProps;

export function ModelDownloadModalOverlay({
  modelDownloadActive,
  modelDownload,
  modelDownloadTitle,
  modelProgressText,
  onClearModelDownload,
  onRetryModelDownload
}: ModelDownloadModalOverlayProps) {
  if (!modelDownloadActive) return null;
  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/40 bg-[#0f0f10] shadow-[0_24px_60px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#111827] text-[#60a5fa]">
              <AppIcon name={modelDownload.status === "error" ? "exclamationTriangle" : "download"} className="text-[16px]" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-slate-100">{modelDownloadTitle}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{modelDownload.message}</p>
            </div>
          </div>

          {modelDownload.status !== "error" ? (
            <div className="mt-4 space-y-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#1f2937]">
                {modelDownload.progress !== null ? (
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max(2, Math.min(100, modelDownload.progress))}%` }}
                  />
                ) : (
                  <div className="h-full w-full animate-pulse rounded-full bg-primary/60" />
                )}
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>{modelDownload.progress !== null ? `${modelDownload.progress}%` : "Preparing..."}</span>
                <span>{modelProgressText ?? ""}</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-2 text-[11px] text-slate-400">
              {modelDownload.detail ? <p>{modelDownload.detail}</p> : null}
              {modelDownload.downloadUrl ? (
                <p>
                  Download URL:
                  <span className="ml-1 break-all text-slate-200">{modelDownload.downloadUrl}</span>
                </p>
              ) : null}
              {modelDownload.expectedPath ? (
                <p>
                  Save the model to:
                  <span className="ml-1 break-all text-slate-200">{modelDownload.expectedPath}</span>
                </p>
              ) : null}
            </div>
          )}

          {modelDownload.status === "error" ? (
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
  );
}

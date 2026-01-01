import { AppIcon } from "../../common/AppIcon";
import { cn } from "../../../lib/cn";
import type { PremiumOverlayProps } from "../../layout/AppOverlays.types";

type PremiumModalOverlayProps = Pick<
  PremiumOverlayProps,
  | "showPremiumModal"
  | "setShowPremiumModal"
  | "premiumWebviewStatus"
  | "premiumIframeKey"
  | "premiumWebviewRef"
  | "onPremiumWebviewLoad"
  | "onPremiumWebviewError"
  | "premiumWebviewError"
  | "onPremiumRetry"
  | "machineIdLoading"
  | "machineId"
  | "machineIdCopied"
  | "onCopyMachineId"
  | "premiumKey"
  | "setPremiumKey"
  | "onConfirmPremiumKey"
  | "premiumKeySubmitting"
  | "isPremium"
>;

export function PremiumModalOverlay({
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
  isPremium
}: PremiumModalOverlayProps) {
  if (!showPremiumModal) return null;
  return (
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
                  (import.meta as any)?.env?.VITE_PREMIUM_PAGE_URL
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
  );
}

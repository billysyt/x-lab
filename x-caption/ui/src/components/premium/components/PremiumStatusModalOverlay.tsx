import { AppIcon } from "../../common/AppIcon";
import { formatTimestamp } from "../../../lib/format";
import type { PremiumOverlayProps } from "../../shell/components/AppOverlays.types";

type PremiumStatusModalOverlayProps = Pick<
  PremiumOverlayProps,
  | "showPremiumStatusModal"
  | "setShowPremiumStatusModal"
  | "premiumDetails"
  | "machineIdLoading"
  | "machineId"
  | "onCopyMachineId"
>;

export function PremiumStatusModalOverlay({
  showPremiumStatusModal,
  setShowPremiumStatusModal,
  premiumDetails,
  machineIdLoading,
  machineId,
  onCopyMachineId
}: PremiumStatusModalOverlayProps) {
  if (!showPremiumStatusModal) return null;
  return (
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
  );
}

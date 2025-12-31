import { AppIcon } from "../../common/AppIcon";
import { formatTimestamp } from "../../../lib/format";
import type { PremiumOverlayProps } from "../../layout/AppOverlays.types";

type PremiumStatusModalOverlayProps = Pick<
  PremiumOverlayProps,
  | "showPremiumStatusModal"
  | "setShowPremiumStatusModal"
  | "premiumDetails"
>;

export function PremiumStatusModalOverlay({
  showPremiumStatusModal,
  setShowPremiumStatusModal,
  premiumDetails
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
            <div className="flex h-10 w-10 items-center justify-center">
              <AppIcon name="userSimple" className="text-[18px] text-white" />
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
              <span className="text-slate-500">Activated</span>
              <span className="text-slate-200">{formatTimestamp(premiumDetails?.activatedAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Expires</span>
              <span className="text-emerald-300">Lifetime</span>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end">
            <button
              className="inline-flex h-7 items-center justify-center rounded-md bg-[#1b1b22] px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
              onClick={() => setShowPremiumStatusModal(false)}
              type="button"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

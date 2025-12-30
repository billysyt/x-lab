import type { MouseEvent, RefObject } from "react";
import { AppIcon } from "../../../components/common/AppIcon";
import { cn } from "../../../lib/cn";

export type HeaderBarProps = {
  isMac: boolean;
  isWindowFocused: boolean;
  isAltPressed: boolean;
  isHeaderCompact: boolean;
  isHeaderMenuOpen: boolean;
  showCustomWindowControls: boolean;
  isPinned: boolean;
  isExporting: boolean;
  isPremium: boolean;
  premiumStatusLoading: boolean;
  headerMenuRef: RefObject<HTMLDivElement>;
  headerMenuButtonRef: RefObject<HTMLButtonElement>;
  getHeaderDragProps: (baseClass: string) => {
    className: string;
    onDoubleClick: (event: MouseEvent<HTMLElement>) => void;
  };
  onOpenModal: () => void;
  onTogglePinned: () => void;
  onOpenExport: () => void;
  onOpenPremium: () => void;
  onWindowAction: (action: "close" | "minimize" | "zoom" | "fullscreen") => void;
  onToggleHeaderMenu: () => void;
  onCloseHeaderMenu: () => void;
};

export function HeaderBar({
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
  onOpenModal,
  onTogglePinned,
  onOpenExport,
  onOpenPremium,
  onWindowAction,
  onToggleHeaderMenu,
  onCloseHeaderMenu
}: HeaderBarProps) {
  return (
    <div
      {...getHeaderDragProps(
        "relative grid h-10 select-none grid-cols-[1fr_auto_1fr] items-center bg-[#0b0b0b] px-3 text-xs text-slate-300"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isMac ? (
          <div className="group ml-1 mr-3 flex items-center gap-2">
            <button
              className={cn(
                "pywebview-no-drag relative flex h-3 w-3 cursor-default items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition",
                isWindowFocused ? "bg-[#ff5f57] group-hover:brightness-95" : "bg-[#525252]"
              )}
              onClick={() => onWindowAction("close")}
              type="button"
              aria-label="Close"
            >
              <svg
                viewBox="0 0 8 8"
                className={cn(
                  "h-2 w-2 stroke-black/60 transition",
                  isWindowFocused ? "opacity-0 group-hover:opacity-80" : "opacity-0"
                )}
                strokeWidth="1.2"
                strokeLinecap="round"
              >
                <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" />
                <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
              </svg>
            </button>
            <button
              className={cn(
                "pywebview-no-drag relative flex h-3 w-3 cursor-default items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition",
                isWindowFocused ? "bg-[#febc2e] group-hover:brightness-95" : "bg-[#525252]"
              )}
              onClick={() => onWindowAction("minimize")}
              type="button"
              aria-label="Minimize"
            >
              <svg
                viewBox="0 0 8 8"
                className={cn(
                  "h-2 w-2 stroke-black/60 transition",
                  isWindowFocused ? "opacity-0 group-hover:opacity-80" : "opacity-0"
                )}
                strokeWidth="1.2"
                strokeLinecap="round"
              >
                <line x1="1.5" y1="4" x2="6.5" y2="4" />
              </svg>
            </button>
            <button
              className={cn(
                "pywebview-no-drag relative flex h-3 w-3 cursor-default items-center justify-center rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)] transition",
                isWindowFocused ? "bg-[#28c840] group-hover:brightness-95" : "bg-[#525252]"
              )}
              onClick={() => onWindowAction(isAltPressed ? "zoom" : "fullscreen")}
              type="button"
              aria-label="Zoom"
            >
              {isAltPressed ? (
                <svg
                  viewBox="0 0 8 8"
                  className={cn(
                    "h-2 w-2 stroke-black/70 transition",
                    isWindowFocused ? "opacity-0 group-hover:opacity-90" : "opacity-0"
                  )}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <line x1="1.5" y1="4" x2="6.5" y2="4" />
                  <line x1="4" y1="1.5" x2="4" y2="6.5" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 8 8"
                  className={cn(
                    "h-2 w-2 rotate-90 stroke-black/70 transition",
                    isWindowFocused ? "opacity-0 group-hover:opacity-90" : "opacity-0"
                  )}
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <path d="M4.7 2.1 H6.3 V3.3" />
                  <path d="M3.3 5.9 H1.7 V4.7" />
                </svg>
              )}
            </button>
          </div>
        ) : null}
        {!isHeaderCompact ? (
          <button
            className="pywebview-no-drag inline-flex h-7 items-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition hover:bg-[#26262f]"
            onClick={onOpenModal}
            type="button"
            aria-label="Open"
            title="Open"
          >
            <AppIcon name="folderOpen" className="text-[11px]" />
            Open
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="text-[11px] font-semibold text-slate-200">X-Caption</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        {isHeaderCompact ? (
          <button
            ref={headerMenuButtonRef}
            className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md bg-[#1b1b22] text-[10px] text-slate-200 transition hover:bg-[#26262f]"
            onClick={(event) => {
              event.stopPropagation();
              onToggleHeaderMenu();
            }}
            type="button"
            aria-label="Menu"
            title="Menu"
          >
            <AppIcon name="bars" className="text-[11px]" />
          </button>
        ) : (
          <>
            <button
              className="pywebview-no-drag inline-flex h-7 w-7 items-center justify-center rounded-md text-[11px] text-slate-200/80 transition hover:bg-white/5 hover:text-white"
              onClick={onTogglePinned}
              type="button"
              aria-label={isPinned ? "Unpin window" : "Pin window"}
              title={isPinned ? "Unpin window" : "Pin window"}
            >
              <AppIcon
                name={isPinned ? "pin" : "pinOff"}
                className={cn("text-[11px]", !isPinned && "rotate-45 opacity-70")}
              />
            </button>
            <button
              className={cn(
                "pywebview-no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-[#1b1b22] px-2 text-[11px] font-semibold text-slate-200 transition",
                isExporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#26262f]"
              )}
              onClick={onOpenExport}
              disabled={isExporting}
              type="button"
            >
              <AppIcon name="download" className="text-[10px]" />
              Export
            </button>
            <button
              className={cn(
                "pywebview-no-drag inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition",
                isPremium
                  ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/25"
                  : "bg-gradient-to-r from-[#2563eb] via-[#4338ca] to-[#6d28d9] text-white shadow-[0_10px_24px_rgba(76,29,149,0.35)] hover:brightness-110",
                premiumStatusLoading && "opacity-60"
              )}
              onClick={onOpenPremium}
              type="button"
              disabled={premiumStatusLoading}
            >
              <AppIcon name={isPremium ? "user" : "aiStar"} className="text-[11px]" />
              {isPremium ? "Premium Member" : "Get Premium"}
            </button>
            {showCustomWindowControls && !isMac ? (
              <div className="ml-2 flex items-center gap-1 pl-2">
                <button
                  className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-[#151515] text-[10px] text-slate-200 hover:border-slate-500"
                  onClick={() => onWindowAction("minimize")}
                  type="button"
                  aria-label="Minimize"
                  title="Minimize"
                >
                  <AppIcon name="windowMinimize" className="text-[10px]" />
                </button>
                <button
                  className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-[#151515] text-[10px] text-slate-200 hover:border-slate-500"
                  onClick={() => onWindowAction("zoom")}
                  type="button"
                  aria-label="Zoom"
                  title="Zoom"
                >
                  <AppIcon name="windowMaximize" className="text-[9px]" />
                </button>
                <button
                  className="pywebview-no-drag inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-700 bg-[#151515] text-[10px] text-slate-200 hover:border-slate-500"
                  onClick={() => onWindowAction("close")}
                  type="button"
                  aria-label="Close"
                  title="Close"
                >
                  <AppIcon name="times" className="text-[10px]" />
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
      {isHeaderCompact && isHeaderMenuOpen ? (
        <div
          ref={headerMenuRef}
          className="pywebview-no-drag absolute right-3 top-10 z-[130] min-w-[190px] overflow-hidden rounded-lg border border-slate-800/40 bg-[#151515] text-[11px] text-slate-200 shadow-xl"
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
            onClick={() => {
              onCloseHeaderMenu();
              onOpenModal();
            }}
            type="button"
          >
            <AppIcon name="folderOpen" />
            Open
          </button>
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left",
              isExporting ? "cursor-not-allowed opacity-50" : "hover:bg-[#1b1b22]"
            )}
            onClick={() => {
              if (isExporting) return;
              onCloseHeaderMenu();
              onOpenExport();
            }}
            disabled={isExporting}
            type="button"
          >
            <AppIcon name="download" />
            Export
          </button>
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left",
              premiumStatusLoading ? "cursor-not-allowed opacity-60" : "hover:bg-[#1b1b22]"
            )}
            onClick={() => {
              if (premiumStatusLoading) return;
              onCloseHeaderMenu();
              onOpenPremium();
            }}
            type="button"
            disabled={premiumStatusLoading}
          >
            <AppIcon name={isPremium ? "user" : "aiStar"} />
            {isPremium ? "Premium Member" : "Get Premium"}
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
            onClick={() => {
              onCloseHeaderMenu();
              onTogglePinned();
            }}
            type="button"
          >
            <AppIcon name={isPinned ? "pin" : "pinOff"} className={cn(!isPinned && "rotate-45 opacity-70")} />
            {isPinned ? "Unpin Window" : "Pin Window"}
          </button>
          {showCustomWindowControls && !isMac ? (
            <>
              <div className="h-px bg-slate-800/60" />
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                onClick={() => {
                  onCloseHeaderMenu();
                  onWindowAction("minimize");
                }}
                type="button"
              >
                <AppIcon name="windowMinimize" />
                Minimize
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                onClick={() => {
                  onCloseHeaderMenu();
                  onWindowAction("zoom");
                }}
                type="button"
              >
                <AppIcon name="windowMaximize" />
                Zoom
              </button>
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[#1b1b22]"
                onClick={() => {
                  onCloseHeaderMenu();
                  onWindowAction("close");
                }}
                type="button"
              >
                <AppIcon name="times" />
                Close
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

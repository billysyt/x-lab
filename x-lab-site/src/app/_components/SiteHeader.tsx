import Link from "next/link";
import Image from "next/image";

export default function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-x-line bg-x-bg/80 backdrop-blur">
      <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-6 py-4">
        <div className="flex flex-col gap-1">
          <Link className="flex items-center gap-3 text-lg font-semibold" href="/">
            <span className="relative h-8 w-8">
              <Image src="/x-lab-mark.svg" alt="X-Lab" fill className="object-contain" />
            </span>
            <span className="font-semibold tracking-tight">X-Lab</span>
          </Link>
          <span className="text-[0.6rem] uppercase tracking-[0.35em] text-x-soft">
            On-prem AI suite
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-4 text-xs text-x-muted md:gap-5 md:text-sm">
          <Link className="md:hidden" href="/#products">
            Products
          </Link>
          <div className="group relative hidden md:block">
            <button className="flex items-center gap-2 text-sm font-medium text-x-muted transition hover:text-x-text">
              Products
              <span className="text-xs">▾</span>
            </button>
            <div className="absolute left-0 top-8 hidden w-[420px] grid-cols-2 gap-3 rounded-2xl border border-x-line bg-x-surface p-3 shadow-deep group-hover:grid">
              <Link
                className="flex items-start gap-3 rounded-xl border border-transparent bg-x-surface-2 p-3 transition hover:border-x-text/30"
                href="/#products"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-x-text">
                  XC
                </span>
                <span className="text-sm">
                  <strong className="block text-x-text">X-Caption</strong>
                  <span className="text-xs text-x-soft">
                    Cantonese captions + SRT export.
                  </span>
                </span>
              </Link>
              <Link
                className="flex items-start gap-3 rounded-xl border border-transparent bg-x-surface-2 p-3 transition hover:border-x-text/30"
                href="/#products"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-x-text">
                  XM
                </span>
                <span className="text-sm">
                  <strong className="block text-x-text">X-Minutes</strong>
                  <span className="text-xs text-x-soft">
                    Meeting minutes + AI summaries.
                  </span>
                </span>
              </Link>
              <Link
                className="flex items-start gap-3 rounded-xl border border-transparent bg-x-surface-2 p-3 transition hover:border-x-text/30"
                href="/#products"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-x-text">
                  XK
                </span>
                <span className="text-sm">
                  <strong className="block text-x-text">X-Code</strong>
                  <span className="text-xs text-x-soft">
                    Low-cost Claude Code or Codex access.
                  </span>
                </span>
              </Link>
              <div className="rounded-xl border border-dashed border-x-line p-3 text-xs text-x-soft">
                On-prem by default. Free core tools.
              </div>
            </div>
          </div>
          <Link className="transition hover:text-x-text" href="/#onprem">
            On-prem
          </Link>
          <Link className="transition hover:text-x-text" href="/#pricing">
            Pricing
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <Link className="btn-ghost" href="/#pricing">
            Sign in
          </Link>
          <Link className="btn-primary" href="/#products">
            Download
          </Link>
        </div>
      </div>
    </header>
  );
}

import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-x-line bg-x-bg">
      <div className="mx-auto grid w-[min(1120px,92vw)] gap-8 py-12 md:grid-cols-[1.6fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-x-text text-x-bg">
              X
            </span>
            <span>X-Lab</span>
          </div>
          <p className="mt-4 text-sm text-x-muted">
            Local-first AI for captions, meetings, and secure on-prem workflows.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-x-muted">
          <span className="text-sm font-semibold text-x-text">Products</span>
          <Link href="/#products">X-Caption</Link>
          <Link href="/#products">X-Minutes</Link>
          <Link href="/#products">X-Code</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm text-x-muted">
          <span className="text-sm font-semibold text-x-text">Company</span>
          <Link href="/#why">Why X-Lab</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/#cta">Contact</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm text-x-muted">
          <span className="text-sm font-semibold text-x-text">Deployment</span>
          <Link href="/#onprem">On-prem</Link>
          <Link href="/pricing#enterprise">Enterprise</Link>
          <Link href="/#cta">Security review</Link>
        </div>
      </div>
      <div className="mx-auto flex w-[min(1120px,92vw)] flex-wrap items-center justify-between gap-3 border-t border-x-line py-6 text-xs text-x-soft">
        <span>Copyright 2025 X-Lab. All rights reserved.</span>
        <span>On-prem and privacy-first.</span>
      </div>
    </footer>
  );
}

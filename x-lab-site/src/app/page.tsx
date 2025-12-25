import Link from "next/link";
import Image from "next/image";
import HeroVisual from "./_components/HeroVisual";
import NeuralNet from "./_components/NeuralNet";
import Waveform from "./_components/Waveform";

const ProductRow = ({
  icon,
  title,
  desc,
  children,
}: {
  icon: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) => (
  <div className="flex flex-col gap-6 border-t border-x-line py-10 md:flex-row md:items-center md:justify-between">
    <div className="flex items-start gap-5">
      <div className="relative h-12 w-12 shrink-0">
        <Image src={icon} alt={title} fill className="object-contain" />
      </div>
      <div>
        <h3 className="text-xl font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-x-muted">{desc}</p>
      </div>
    </div>
    {children}
  </div>
);

const SignalRow = () => (
  <div className="flex items-center gap-3 text-xs text-x-soft">
    <span className="h-1 w-1 rounded-full bg-x-accent" />
    <span className="h-1 w-1 rounded-full bg-x-accent/70" />
    <span className="h-1 w-1 rounded-full bg-x-accent/40" />
    <span className="uppercase tracking-[0.3em]">AI Signal</span>
  </div>
);

export default function Home() {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 grid-overlay opacity-20" />
        <div className="absolute -top-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(122,168,255,0.35),transparent_60%)] blur-3xl" />
        <div className="absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(116,240,218,0.32),transparent_60%)] blur-3xl" />
        <div className="absolute left-20 top-24 h-2 w-2 animate-[twinkle_4s_ease-in-out_infinite] rounded-full bg-white/70" />
        <div className="absolute right-40 top-64 h-1.5 w-1.5 animate-[twinkle_5s_ease-in-out_infinite] rounded-full bg-white/70" />
      </div>

      <section className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-14 pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <SignalRow />
            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              Space‑grade privacy for AI workflows.
            </h1>
            <p className="text-base text-x-muted md:text-lg">
              Captions. Meeting minutes. Code access. All on‑prem.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-primary" href="/#products">
                Download free
              </Link>
              <Link className="btn-ghost" href="/#pricing">
                View pricing
              </Link>
            </div>
            <Waveform />
          </div>

          <HeroVisual />
        </div>
      </section>

      <section id="products" className="mx-auto mt-20 w-[min(1120px,92vw)]">
        <div className="space-y-3">
          <div className="section-label">Products</div>
          <h2 className="text-3xl font-semibold tracking-tight">Designed for local AI teams.</h2>
        </div>
        <div className="mt-6">
          <ProductRow
            icon="/x-caption-icon.svg"
            title="X-Caption"
            desc="Cantonese captions with 繁體 output, speaker-aware transcripts, and SRT export."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Image src="/badge-macos.svg" alt="Download on macOS" width={180} height={56} />
              <Image src="/badge-windows.svg" alt="Download on Windows" width={180} height={56} />
            </div>
          </ProductRow>

          <ProductRow
            icon="/x-minutes-icon.svg"
            title="X-Minutes"
            desc="Meeting minutes with speaker ID, clean transcripts, and AI summaries."
          >
            <div className="flex flex-wrap items-center gap-3">
              <Image src="/badge-macos.svg" alt="Download on macOS" width={180} height={56} />
              <Image src="/badge-windows.svg" alt="Download on Windows" width={180} height={56} />
            </div>
          </ProductRow>

          <ProductRow
            icon="/x-code-icon.svg"
            title="X-Code"
            desc="Low-cost Claude Code or Codex access with team controls and audit-ready usage."
          >
            <div className="flex flex-wrap items-center gap-3 text-sm text-x-soft">
              <span className="rounded-2xl border border-x-line bg-x-surface px-4 py-3">
                Claude Code
              </span>
              <span className="rounded-2xl border border-x-line bg-x-surface px-4 py-3">
                Codex
              </span>
            </div>
          </ProductRow>
        </div>
      </section>

      <section id="pricing" className="mx-auto mt-20 w-[min(1120px,92vw)]">
        <div className="space-y-4 border-t border-x-line pt-10">
          <div className="section-label">Pricing</div>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold">Free</h3>
              <p className="text-sm text-x-muted">
                X-Caption + X-Minutes. Unlimited exports. On‑prem.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-x-soft">
                <span className="rounded-full border border-x-line px-3 py-1">
                  繁體 caption
                </span>
                <span className="rounded-full border border-x-line px-3 py-1">
                  Speaker tags
                </span>
                <span className="rounded-full border border-x-line px-3 py-1">
                  Offline
                </span>
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-semibold">Premium</h3>
              <p className="text-sm text-x-muted">
                X-Code access, team controls, and enterprise deployment support.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-x-soft">
                <span className="rounded-full border border-x-line px-3 py-1">
                  Claude Code
                </span>
                <span className="rounded-full border border-x-line px-3 py-1">
                  Codex
                </span>
                <span className="rounded-full border border-x-line px-3 py-1">
                  RBAC + audit
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto mt-20 w-[min(1120px,92vw)]">
        <div className="space-y-4 border-t border-x-line pt-10">
          <div className="section-label">Pricing</div>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-[28px] border border-x-line bg-x-surface p-8">
              <h3 className="text-2xl font-semibold">Free</h3>
              <p className="mt-2 text-sm text-x-muted">
                X-Caption + X-Minutes, forever free.
              </p>
              <div className="mt-6 space-y-2 text-sm text-x-muted">
                <p>+ Unlimited caption & transcript exports</p>
                <p>+ Cantonese accuracy + 繁體 caption support</p>
                <p>+ Speaker or writing format outputs</p>
                <p>+ Local storage and offline mode</p>
              </div>
              <div className="mt-6">
                <Link className="btn-primary" href="/#products">
                  Download free
                </Link>
              </div>
            </div>
            <div className="rounded-[28px] border border-x-line bg-x-surface-2 p-8 shadow-deep">
              <h3 className="text-2xl font-semibold">Premium</h3>
              <p className="mt-2 text-sm text-x-muted">
                X-Code access, team controls, and enterprise deployment support.
              </p>
              <div className="mt-6 space-y-2 text-sm text-x-muted">
                <p>+ Claude Code + Codex options</p>
                <p>+ Usage budgets and team controls</p>
                <p>+ RBAC, audit logs, and SSO</p>
                <p>+ Dedicated onboarding</p>
              </div>
              <div className="mt-6">
                <Link className="btn-primary" href="/#cta">
                  Contact sales
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="cta" className="mx-auto mt-20 w-[min(1120px,92vw)]">
        <div className="relative overflow-hidden rounded-[32px] border border-x-line bg-x-surface p-8">
          <NeuralNet />
          <div className="relative z-10 flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <div className="section-label">Contact</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Talk to X‑Lab about on‑prem AI.
              </h2>
              <p className="mt-3 text-sm text-x-muted">
                Security review, deployment planning, and premium access.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link className="btn-primary" href="mailto:hello@x-lab.ai">
                Contact us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

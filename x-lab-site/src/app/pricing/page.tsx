import Link from "next/link";

export default function PricingPage() {
  return (
    <div className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-16 py-12">
      <section className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
        <div className="space-y-4">
          <div className="section-label">Pricing</div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            Simple pricing for secure AI.
          </h1>
          <p className="text-base text-x-muted md:text-lg">
            Keep X-Caption and X-Minutes free forever. Upgrade to Premium for
            X-Code access and enterprise deployment support.
          </p>
        </div>
        <div className="rounded-2xl border border-x-line bg-x-surface px-6 py-4 text-sm text-x-soft">
          Always included
          <strong className="mt-2 block text-base text-x-text">
            On-prem deployment + privacy controls
          </strong>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div id="free" className="rounded-3xl border border-x-line bg-x-surface p-6">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Free</h2>
            <p className="text-2xl font-semibold">$0</p>
            <p className="text-sm text-x-muted">X-Caption + X-Minutes, forever free.</p>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-x-muted">
            <li>+ Unlimited caption & transcript exports</li>
            <li>+ Cantonese accuracy + 繁體 caption support</li>
            <li>+ Speaker or writing format outputs</li>
            <li>+ Local storage and offline mode</li>
          </ul>
          <Link className="btn-primary mt-6 w-full" href="/#products">
            Download the suite
          </Link>
        </div>

        <div id="premium" className="rounded-3xl border border-x-line bg-x-surface-2 p-6 shadow-deep">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">Premium</h2>
            <p className="text-2xl font-semibold">Let's talk</p>
            <p className="text-sm text-x-muted">
              X-Code access, team controls, and enterprise deployment support.
            </p>
          </div>
          <ul className="mt-6 space-y-2 text-sm text-x-muted">
            <li>+ Claude Code + Codex options</li>
            <li>+ Usage budgets and team controls</li>
            <li>+ RBAC, audit logs, and SSO</li>
            <li>+ Dedicated onboarding</li>
          </ul>
          <Link className="btn-primary mt-6 w-full" href="/#cta">
            Contact sales
          </Link>
        </div>
      </section>
    </div>
  );
}

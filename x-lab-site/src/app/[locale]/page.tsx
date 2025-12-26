import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import HeroVisual from "../_components/HeroVisual";
import NeuralNet from "../_components/NeuralNet";
import Waveform from "../_components/Waveform";

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

const SignalRow = ({ label }: { label: string }) => (
  <div className="flex items-center gap-3 text-xs text-x-soft">
    <span className="h-1 w-1 rounded-full bg-x-accent" />
    <span className="h-1 w-1 rounded-full bg-x-accent/70" />
    <span className="h-1 w-1 rounded-full bg-x-accent/40" />
    <span className="uppercase tracking-[0.3em]">{label}</span>
  </div>
);

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  const withLocale = (path: string) => `/${locale}${path}`;
  const freeFeatures = t.raw("pricing.freeFeatures") as string[];
  const premiumFeatures = t.raw("pricing.premiumFeatures") as string[];
  const enterpriseFeatures = t.raw("pricing.enterpriseFeatures") as string[];

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
            <SignalRow label={t("signal")} />
            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="text-base text-x-muted md:text-lg">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-primary" href={withLocale("/#products")}>
                {t("hero.primary")}
              </Link>
              <Link className="btn-ghost" href={withLocale("/#pricing")}>
                {t("hero.secondary")}
              </Link>
            </div>
            <Waveform />
          </div>

          <HeroVisual />
        </div>
      </section>

      <section id="products" className="mx-auto mt-20 w-[min(1120px,92vw)]">
        <div className="space-y-3">
          <div className="section-label">{t("products.label")}</div>
          <h2 className="text-3xl font-semibold tracking-tight">{t("products.title")}</h2>
        </div>
        <div className="mt-6">
          <ProductRow
            icon="/x-caption-icon.svg"
            title="X-Caption"
            desc={t("products.captionDesc")}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Image src="/badge-macos.svg" alt="Download on macOS" width={150} height={46} />
              <Image src="/badge-windows.svg" alt="Download on Windows" width={150} height={46} />
            </div>
          </ProductRow>

          <ProductRow
            icon="/x-minutes-icon.svg"
            title="X-Minutes"
            desc={t("products.minutesDesc")}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Image src="/badge-macos.svg" alt="Download on macOS" width={150} height={46} />
              <Image src="/badge-windows.svg" alt="Download on Windows" width={150} height={46} />
            </div>
          </ProductRow>

          <ProductRow
            icon="/x-code-icon.svg"
            title="X-Code"
            desc={t("products.codeDesc")}
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
          <div className="section-label">{t("pricing.label")}</div>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-[26px] border border-x-line bg-x-surface p-7">
              <div className="text-xs uppercase tracking-[0.3em] text-x-soft">
                {t("pricing.freeTag")}
              </div>
              <h3 className="mt-3 text-2xl font-semibold">{t("pricing.freeTitle")}</h3>
              <p className="mt-2 text-sm text-x-muted">{t("pricing.freeDesc")}</p>
              <div className="mt-6 space-y-2 text-sm text-x-muted">
                {freeFeatures.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>

            <div className="relative rounded-[30px] border border-x-accent/40 bg-x-surface-2 p-8 shadow-deep lg:-translate-y-3">
              <div className="absolute right-6 top-6 rounded-full border border-x-accent/40 px-3 py-1 text-[0.65rem] uppercase tracking-[0.25em] text-x-accent">
                {t("pricing.premiumTag")}
              </div>
              <h3 className="text-3xl font-semibold">{t("pricing.premiumPrice")}</h3>
              <p className="mt-2 text-sm text-x-muted">{t("pricing.premiumDesc")}</p>
              <div className="mt-5 space-y-2 text-sm text-x-muted">
                {premiumFeatures.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-x-line bg-x-surface p-7">
              <div className="text-xs uppercase tracking-[0.3em] text-x-soft">
                {t("pricing.enterpriseTag")}
              </div>
              <h3 className="mt-3 text-2xl font-semibold">{t("pricing.enterpriseTitle")}</h3>
              <p className="mt-2 text-sm text-x-muted">{t("pricing.enterpriseDesc")}</p>
              <div className="mt-6 space-y-2 text-sm text-x-muted">
                {enterpriseFeatures.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
              <div className="mt-6">
                <Link className="btn-primary" href={withLocale("/#cta")}>
                  {t("pricing.enterpriseCta")}
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
              <div className="section-label">{t("contact.label")}</div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                {t("contact.title")}
              </h2>
              <p className="mt-3 text-sm text-x-muted">{t("contact.desc")}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Link className="btn-primary" href="mailto:hello@x-lab.ai">
                {t("contact.cta")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

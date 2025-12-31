import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import HeroVisual from "../_components/HeroVisual";
import NeuralNet from "../_components/NeuralNet";
import Waveform from "../_components/Waveform";
import MobileComparisonTable from "../_components/MobileComparisonTable";

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
  <div className="flex flex-col gap-4 border-t border-x-line py-6 sm:gap-6 sm:py-8 md:flex-row md:items-center md:justify-between md:py-10">
    <div className="flex items-start gap-4 sm:gap-5">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-x-line bg-x-surface p-1.5 shadow-md sm:h-14 sm:w-14 sm:rounded-2xl sm:p-2">
        <Image src={icon} alt={title} fill className="rounded-lg object-contain" />
      </div>
      <div>
        <h3 className="text-lg font-semibold sm:text-xl">{title}</h3>
        <p className="mt-1.5 text-xs text-x-muted sm:mt-2 sm:text-sm">{desc}</p>
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
  const comparisonColumns = t.raw("comparison.columns") as {
    xlab: string;
    cantosub: string;
    subanana: string;
  };
  const comparisonRows = t.raw("comparison.rows") as Array<{
    label: string;
    type: "boolean" | "text";
    xlab: boolean | string;
    cantosub: boolean | string;
    subanana: boolean | string;
  }>;
  const renderMark = (value: boolean) => (
    <span
      className={[
        "text-base font-semibold",
        value ? "text-emerald-300" : "text-rose-300",
      ].join(" ")}
      aria-label={value ? "Yes" : "No"}
    >
      {value ? "✓" : "X"}
    </span>
  );
  const comparisonTemplate = "29.4118% 23.5294% 23.5294% 23.5294%";
  const highlightColumn =
    "bg-gradient-to-b from-x-accent/[0.12] via-x-accent/[0.06] to-x-accent/[0.12] border border-x-accent/20";

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 grid-overlay opacity-20" />
        <div className="absolute -top-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(122,168,255,0.35),transparent_60%)] blur-3xl" />
        <div className="absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(116,240,218,0.32),transparent_60%)] blur-3xl" />
        <div className="absolute left-20 top-24 h-2 w-2 animate-[twinkle_4s_ease-in-out_infinite] rounded-full bg-white/70" />
        <div className="absolute right-40 top-64 h-1.5 w-1.5 animate-[twinkle_5s_ease-in-out_infinite] rounded-full bg-white/70" />
      </div>

      <section className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-10 pt-8 md:gap-14 md:pt-16">
        <div className="grid items-center gap-8 md:gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5 md:space-y-6">
            <SignalRow label={t("signal")} />
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
              {t("hero.title")}
            </h1>
            <p className="text-sm text-x-muted sm:text-base md:text-lg">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn-primary" href={withLocale("/#products")}>
                {t("hero.primary")}
              </Link>
              <Link className="btn-ghost" href={withLocale("/#comparison")}>
                {t("hero.compare")}
              </Link>
            </div>
            <Waveform />
          </div>

          <div className="hidden lg:block">
            <HeroVisual />
          </div>
        </div>
      </section>

      <section id="products" className="mx-auto mt-12 w-[min(1120px,92vw)] md:mt-20">
        <div className="space-y-3">
          <div className="section-label">{t("products.label")}</div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("products.title")}</h2>
        </div>
        <div className="mt-6">
          <ProductRow
            icon="/x-caption-logo.png"
            title="X-Caption"
            desc={t("products.captionDesc")}
          >
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <Image src="/badge-macos.svg" alt="Download on macOS" width={130} height={40} className="h-10 w-auto sm:h-[46px]" />
              <div className="relative">
                <span className="absolute -right-1 -top-2 z-10 rounded-full bg-x-accent px-1.5 py-0.5 text-[10px] font-semibold text-x-bg">
                  {t("products.comingSoon")}
                </span>
                <div className="pointer-events-none opacity-40 grayscale">
                  <Image src="/badge-windows.svg" alt="Download on Windows" width={130} height={40} className="h-10 w-auto sm:h-[46px]" />
                </div>
              </div>
            </div>
          </ProductRow>

          <ProductRow
            icon="/x-minutes-icon.png"
            title="X-Minutes"
            desc={t("products.minutesDesc")}
          >
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="relative">
                <span className="absolute -right-1 -top-2 z-10 rounded-full bg-x-accent px-1.5 py-0.5 text-[10px] font-semibold text-x-bg">
                  {t("products.comingSoon")}
                </span>
                <div className="pointer-events-none opacity-40 grayscale">
                  <Image src="/badge-macos.svg" alt="Download on macOS" width={130} height={40} className="h-10 w-auto sm:h-[46px]" />
                </div>
              </div>
              <div className="relative">
                <span className="absolute -right-1 -top-2 z-10 rounded-full bg-x-accent px-1.5 py-0.5 text-[10px] font-semibold text-x-bg">
                  {t("products.comingSoon")}
                </span>
                <div className="pointer-events-none opacity-40 grayscale">
                  <Image src="/badge-windows.svg" alt="Download on Windows" width={130} height={40} className="h-10 w-auto sm:h-[46px]" />
                </div>
              </div>
            </div>
          </ProductRow>
        </div>
      </section>

      <section id="comparison" className="mx-auto mt-12 w-[min(1120px,92vw)] md:mt-20">
        <div className="space-y-3 border-t border-x-line pt-8 md:pt-10">
          <div className="section-label">{t("comparison.label")}</div>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">{t("comparison.title")}</h2>
          <p className="text-sm text-x-muted md:text-base">{t("comparison.desc")}</p>
        </div>

        {/* Mobile/Tablet View - Tab-based comparison */}
        <div className="lg:hidden">
          <MobileComparisonTable columns={comparisonColumns} rows={comparisonRows} />
        </div>

        {/* Desktop View - Full table */}
        <div className="relative mt-8 hidden py-4 lg:block">
          <div
            className={`pointer-events-none absolute rounded-xl ${highlightColumn} transform-gpu will-change-transform motion-safe:animate-[xlabPulse_4s_ease-in-out_infinite]`}
            style={{
              left: "calc(29.4118% - 8px)",
              width: "calc(23.5294% + 16px)",
              top: "0",
              bottom: "0",
            }}
          />

          <div
            className="grid items-center px-2 text-xs uppercase tracking-[0.3em] text-x-soft"
            style={{ gridTemplateColumns: comparisonTemplate }}
            >
              <div className="px-3 py-3" />
              <div className="px-3 py-3 text-x-text">
                <span className="text-xs font-semibold">{comparisonColumns.xlab}</span>
              </div>
              <div className="px-3 py-3 pl-6">
                <div className="flex items-center gap-2">
                  <Image src="/brands/cantosub.png" alt="CantoSub" width={18} height={18} />
                  <span>{comparisonColumns.cantosub}</span>
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <Image src="/brands/subanana.png" alt="Subanana" width={18} height={18} />
                  <span>{comparisonColumns.subanana}</span>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              {comparisonRows.map((row) => (
                <div
                  key={row.label}
                  className="grid items-center px-2 text-sm text-x-text"
                  style={{ gridTemplateColumns: comparisonTemplate }}
                >
                  <div className="px-3 py-2 font-semibold">{row.label}</div>
                  <div className="px-3 py-2 font-semibold">
                    {row.type === "boolean" ? (
                      renderMark(row.xlab as boolean)
                    ) : (
                      <span>{row.xlab as string}</span>
                    )}
                  </div>
                  <div className="px-3 py-2 pl-6">
                    {row.type === "boolean"
                      ? renderMark(row.cantosub as boolean)
                      : (row.cantosub as string)}
                  </div>
                  <div className="px-3 py-2">
                    {row.type === "boolean"
                      ? renderMark(row.subanana as boolean)
                      : (row.subanana as string)}
                  </div>
                </div>
              ))}
            </div>
          </div>
      </section>

      <section id="cta" className="mx-auto mt-6 w-[min(1120px,92vw)] pb-4 md:mt-20 md:pb-0">
        <div className="relative overflow-hidden rounded-2xl border border-x-line bg-x-surface p-5 sm:rounded-[28px] sm:p-6 md:rounded-[32px] md:p-8">
          <NeuralNet />
          <div className="relative z-10 flex flex-col items-start justify-between gap-5 sm:gap-6 md:flex-row md:items-center">
            <div>
              <div className="section-label">{t("contact.label")}</div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight sm:mt-3 sm:text-2xl md:text-3xl">
                {t("contact.title")}
              </h2>
              <p className="mt-2 text-xs text-x-muted sm:mt-3 sm:text-sm">{t("contact.desc")}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Link className="btn-primary" href={withLocale("/contact")}>
                {t("contact.cta")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

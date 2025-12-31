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
    "bg-gradient-to-b from-x-accent/22 via-x-accent/12 to-x-accent/22 shadow-[0_0_30px_rgba(122,168,255,0.22)]";

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
              <Link className="btn-ghost" href={withLocale("/pricing")}>
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

      <section id="comparison" className="mx-auto mt-20 w-[min(1120px,92vw)]">
        <div className="space-y-3 border-t border-x-line pt-10">
          <div className="section-label">{t("comparison.label")}</div>
          <h2 className="text-3xl font-semibold tracking-tight">{t("comparison.title")}</h2>
          <p className="text-sm text-x-muted md:text-base">{t("comparison.desc")}</p>
        </div>
        <div className="mt-8 overflow-x-auto">
          <div className="relative min-w-[900px]">
            <div
              className={`pointer-events-none absolute inset-y-0 rounded-2xl ${highlightColumn}`}
              style={{
                left: "29.4118%",
                width: "23.5294%",
              }}
            />

            <div
              className="grid items-center px-2 text-xs uppercase tracking-[0.3em] text-x-soft"
              style={{ gridTemplateColumns: comparisonTemplate }}
            >
              <div className="px-3 py-3" />
              <div className="px-3 py-3 text-x-text">
                <div className="flex items-center gap-2">
                  <Image src="/x-lab-mark.svg" alt="X-Lab" width={18} height={18} />
                  <span className="text-xs font-semibold">{comparisonColumns.xlab}</span>
                </div>
              </div>
              <div className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <Image src="/brands/cantosub.png" alt="CantoSub AI" width={18} height={18} />
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
                  <div className="px-3 py-2">
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

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import NeuralNet from "../../_components/NeuralNet";
import MobilePricingCard from "../../_components/MobilePricingCard";

export default async function PricingPage({
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
      <section className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-10 pt-16">
        <div className="space-y-4">
          <div className="section-label">{t("pricing.label")}</div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {t("pricingPage.title")}
          </h1>
          <p className="text-base text-x-muted md:text-lg">{t("footer.description")}</p>
        </div>
      </section>

      <section id="pricing" className="mx-auto mt-10 w-[min(1120px,92vw)]">
        {/* Mobile/Tablet View - Combined Card with Toggle */}
        <div className="lg:hidden">
          <MobilePricingCard
            freeFeatures={freeFeatures}
            premiumFeatures={premiumFeatures}
            translations={{
              freeTag: t("pricing.freeTag"),
              freeTitle: t("pricing.freeTitle"),
              freeDesc: t("pricing.freeDesc"),
              freeCta: t("pricing.freeCta"),
              premiumTag: t("pricing.premiumTag"),
              premiumBadge: t("pricing.premiumBadge"),
              premiumPrice: t("pricing.premiumPrice"),
              premiumPriceUnit: t("pricing.premiumPriceUnit"),
              premiumDesc: t("pricing.premiumDesc"),
              premiumCta: t("pricing.premiumCta"),
            }}
            premiumPath={withLocale("/premium")}
          />

          {/* Enterprise Card for Mobile */}
          <div className="mt-6 flex flex-col rounded-[26px] border border-x-line bg-x-surface p-7">
            <div className="text-xs uppercase tracking-[0.3em] text-x-soft">
              {t("pricing.enterpriseTag")}
            </div>
            <h3 className="mt-3 text-2xl font-semibold">{t("pricing.enterpriseTitle")}</h3>
            <p className="mt-2 text-sm text-x-muted">{t("pricing.enterpriseDesc")}</p>
            <div className="mt-6 flex-1 space-y-3 text-sm text-x-muted">
              {enterpriseFeatures.map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href={withLocale("/contact")}
                className="block w-full rounded-full border border-x-line bg-x-surface-2 px-6 py-3 text-center text-sm font-medium text-x-soft opacity-60 transition hover:opacity-100 hover:border-x-accent/50 hover:text-x-text"
              >
                {t("pricing.enterpriseCta")}
              </Link>
            </div>
          </div>
        </div>

        {/* Desktop View - Full 3 Cards */}
        <div className="hidden gap-6 lg:grid lg:grid-cols-3">
          {/* Free Plan */}
          <div className="flex flex-col rounded-[26px] border border-x-line bg-x-surface p-7">
            <div className="text-xs uppercase tracking-[0.3em] text-x-soft">
              {t("pricing.freeTag")}
            </div>
            <h3 className="mt-3 text-2xl font-semibold">{t("pricing.freeTitle")}</h3>
            <p className="mt-2 text-sm text-x-muted">{t("pricing.freeDesc")}</p>
            <div className="mt-6 flex-1 space-y-3 text-sm text-x-muted">
              {freeFeatures.map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
            <div className="mt-6">
              <button
                disabled
                className="w-full rounded-full border border-x-line bg-x-surface-2 px-6 py-3 text-sm font-medium text-x-soft opacity-60 cursor-not-allowed"
              >
                {t("pricing.freeCta")}
              </button>
            </div>
          </div>

          {/* Premium Plan */}
          <div className="relative flex flex-col rounded-[30px] border border-x-accent/40 bg-x-surface-2 p-8 shadow-deep lg:-translate-y-3">
            <div className="absolute right-6 top-6 rounded-full border border-x-accent/40 px-3 py-1 text-[0.65rem] uppercase tracking-[0.25em] text-x-accent">
              {t("pricing.premiumBadge")}
            </div>
            <div className="text-xs uppercase tracking-[0.3em] text-x-soft">
              {t("pricing.premiumTag")}
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <h3 className="text-3xl font-semibold">{t("pricing.premiumPrice")}</h3>
              <span className="text-sm text-x-soft">{t("pricing.premiumPriceUnit")}</span>
            </div>
            <p className="mt-2 text-sm text-x-muted">{t("pricing.premiumDesc")}</p>
            <div className="mt-5 flex-1 space-y-3 text-sm text-x-muted">
              {premiumFeatures.map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href={withLocale("/premium")}
                className="btn-primary block w-full text-center"
              >
                {t("pricing.premiumCta")}
              </Link>
            </div>
          </div>

          {/* Enterprise Plan */}
          <div className="flex flex-col rounded-[26px] border border-x-line bg-x-surface p-7">
            <div className="text-xs uppercase tracking-[0.3em] text-x-soft">
              {t("pricing.enterpriseTag")}
            </div>
            <h3 className="mt-3 text-2xl font-semibold">{t("pricing.enterpriseTitle")}</h3>
            <p className="mt-2 text-sm text-x-muted">{t("pricing.enterpriseDesc")}</p>
            <div className="mt-6 flex-1 space-y-3 text-sm text-x-muted">
              {enterpriseFeatures.map((item) => (
                <p key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 text-emerald-400">✓</span>
                  <span>{item}</span>
                </p>
              ))}
            </div>
            <div className="mt-6">
              <Link
                href={withLocale("/contact")}
                className="block w-full rounded-full border border-x-line bg-x-surface-2 px-6 py-3 text-center text-sm font-medium text-x-soft opacity-60 transition hover:opacity-100 hover:border-x-accent/50 hover:text-x-text"
              >
                {t("pricing.enterpriseCta")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA - Desktop Only */}
      <section id="cta" className="mx-auto mt-20 hidden w-[min(1120px,92vw)] lg:block">
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

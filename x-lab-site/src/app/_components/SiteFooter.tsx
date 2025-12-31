"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations();
  const locale = useLocale();
  const withLocale = (path: string) => `/${locale}${path}`;

  return (
    <footer className="border-t border-x-line bg-x-bg">
      <div className="mx-auto w-[min(1120px,92vw)] py-6 md:py-12">
        {/* Desktop/Tablet: All in one row */}
        <div className="hidden md:grid md:grid-cols-[1.6fr_repeat(3,1fr)] md:gap-8">
          <div>
            <Link href={withLocale("/")} className="text-lg font-bold tracking-tight md:text-xl">
              <span className="bg-gradient-to-r from-x-accent to-x-accent-2 bg-clip-text text-transparent">
                X-Lab
              </span>
              <span className="text-x-soft">.HK</span>
            </Link>
            <p className="mt-4 text-sm text-x-muted">{t("footer.description")}</p>
          </div>
          <div className="flex flex-col gap-2 text-sm text-x-muted">
            <span className="text-sm font-semibold text-x-text">{t("footer.products")}</span>
            <Link href={withLocale("/#products")} className="transition hover:text-x-text">X-Caption</Link>
            <Link href={withLocale("/#products")} className="transition hover:text-x-text">X-Minutes</Link>
          </div>
          <div className="flex flex-col gap-2 text-sm text-x-muted">
            <span className="text-sm font-semibold text-x-text">{t("footer.quickLinks")}</span>
            <Link href={withLocale("/#comparison")} className="transition hover:text-x-text">{t("footer.why")}</Link>
            <Link href={withLocale("/pricing")} className="transition hover:text-x-text">{t("footer.pricing")}</Link>
            <Link href={withLocale("/contact")} className="transition hover:text-x-text">{t("footer.contact")}</Link>
          </div>
          <div className="flex flex-col gap-2 text-sm text-x-muted">
            <span className="text-sm font-semibold text-x-text">{t("footer.policies")}</span>
            <Link href={withLocale("/faq")} className="transition hover:text-x-text">{t("nav.faq")}</Link>
            <Link href={withLocale("/terms")} className="transition hover:text-x-text">{t("footer.terms")}</Link>
            <Link href={withLocale("/privacy")} className="transition hover:text-x-text">{t("footer.privacyPolicy")}</Link>
          </div>
        </div>

        {/* Mobile: Logo on top, then 3 columns */}
        <div className="md:hidden">
          <div className="mb-4">
            <Link href={withLocale("/")} className="text-lg font-bold tracking-tight">
              <span className="bg-gradient-to-r from-x-accent to-x-accent-2 bg-clip-text text-transparent">
                X-Lab
              </span>
              <span className="text-x-soft">.HK</span>
            </Link>
            <p className="mt-3 text-sm text-x-muted">{t("footer.description")}</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-2 text-x-muted">
              <span className="text-xs font-semibold text-x-text">{t("footer.products")}</span>
              <Link href={withLocale("/#products")} className="text-xs transition hover:text-x-text">X-Caption</Link>
              <Link href={withLocale("/#products")} className="text-xs transition hover:text-x-text">X-Minutes</Link>
            </div>
            <div className="flex flex-col gap-2 text-x-muted">
              <span className="text-xs font-semibold text-x-text">{t("footer.quickLinks")}</span>
              <Link href={withLocale("/#comparison")} className="text-xs transition hover:text-x-text">{t("footer.why")}</Link>
              <Link href={withLocale("/pricing")} className="text-xs transition hover:text-x-text">{t("footer.pricing")}</Link>
              <Link href={withLocale("/contact")} className="text-xs transition hover:text-x-text">{t("footer.contact")}</Link>
            </div>
            <div className="flex flex-col gap-2 text-x-muted">
              <span className="text-xs font-semibold text-x-text">{t("footer.policies")}</span>
              <Link href={withLocale("/faq")} className="text-xs transition hover:text-x-text">{t("nav.faq")}</Link>
              <Link href={withLocale("/terms")} className="text-xs transition hover:text-x-text">{t("footer.terms")}</Link>
              <Link href={withLocale("/privacy")} className="text-xs transition hover:text-x-text">{t("footer.privacyPolicy")}</Link>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-[min(1120px,92vw)] flex-wrap items-center justify-between gap-3 border-t border-x-line py-4 text-xs text-x-soft md:py-6">
        <span>{t("footer.copyright")}</span>
        <span>{t("footer.offlinePrivacy")}</span>
      </div>
    </footer>
  );
}

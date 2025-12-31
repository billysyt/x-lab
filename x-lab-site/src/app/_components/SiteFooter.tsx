"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations();
  const locale = useLocale();
  const withLocale = (path: string) => `/${locale}${path}`;

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
          <p className="mt-4 text-sm text-x-muted">{t("footer.tagline")}</p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-x-muted">
          <span className="text-sm font-semibold text-x-text">{t("footer.products")}</span>
          <Link href={withLocale("/#products")}>X-Caption</Link>
          <Link href={withLocale("/#products")}>X-Minutes</Link>
          <Link href={withLocale("/#products")}>X-Code</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm text-x-muted">
          <span className="text-sm font-semibold text-x-text">{t("footer.company")}</span>
          <Link href={withLocale("/#products")}>{t("footer.why")}</Link>
          <Link href={withLocale("/pricing")}>{t("footer.pricing")}</Link>
          <Link href={withLocale("/contact")}>{t("footer.contact")}</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm text-x-muted">
          <span className="text-sm font-semibold text-x-text">{t("footer.deployment")}</span>
          <Link href={withLocale("/#products")}>{t("footer.onPrem")}</Link>
          <Link href={withLocale("/pricing")}>{t("footer.enterprise")}</Link>
          <Link href={withLocale("/contact")}>{t("footer.security")}</Link>
        </div>
      </div>
      <div className="mx-auto flex w-[min(1120px,92vw)] flex-wrap items-center justify-between gap-3 border-t border-x-line py-6 text-xs text-x-soft">
        <span>{t("footer.copyright")}</span>
        <span>{t("footer.privacy")}</span>
      </div>
    </footer>
  );
}

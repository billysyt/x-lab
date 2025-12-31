"use client";

import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

const PRODUCT_MENU = [
  {
    key: "caption",
    label: "X-Caption",
    icon: "/x-caption-icon.svg",
    descKey: "menu.captionDesc",
  },
  {
    key: "minutes",
    label: "X-Minutes",
    icon: "/x-minutes-icon.svg",
    descKey: "menu.minutesDesc",
  },
  {
    key: "code",
    label: "X-Code",
    icon: "/x-code-icon.svg",
    descKey: "menu.codeDesc",
  },
];

export default function SiteHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const pathParts = pathname.split("/");
  const restPath = pathParts.length > 2 ? `/${pathParts.slice(2).join("/")}` : "";

  const withLocale = (path: string) => `/${locale}${path}`;
  const switchLocale = (target: string) => `/${target}${restPath || ""}`;

  return (
    <header className="sticky top-0 z-30 border-b border-x-line bg-x-bg/80 backdrop-blur">
      <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-6 py-4">
        <div className="flex flex-col gap-1">
          <Link className="flex items-center gap-3 text-lg font-semibold" href={withLocale("/")}
          >
            <span className="relative h-8 w-8">
              <Image src="/x-lab-mark.svg" alt="X-Lab" fill className="object-contain" />
            </span>
            <span className="font-semibold tracking-tight">X-Lab</span>
          </Link>
          <span className="text-[0.6rem] uppercase tracking-[0.35em] text-x-soft">
            {t("nav.suite")}
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-4 text-xs text-x-muted md:gap-5 md:text-sm">
          <Link className="md:hidden" href={withLocale("/#products")}>
            {t("nav.products")}
          </Link>
          <div className="group relative hidden md:block">
            <button className="flex items-center gap-2 text-sm font-medium text-x-muted transition hover:text-x-text">
              {t("nav.products")}
              <span className="text-xs">▾</span>
            </button>
            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[460px] translate-y-1 rounded-2xl border border-x-line bg-x-surface p-4 opacity-0 shadow-deep transition group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
              <div className="absolute left-0 -top-3 h-3 w-full" />
              <div className="grid gap-3 md:grid-cols-2">
                {PRODUCT_MENU.map((item) => (
                  <Link
                    key={item.key}
                    className="flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-x-surface-2/50 border-b border-x-line/60 last:border-b-0"
                    href={withLocale("/#products")}
                  >
                    <span className="relative h-9 w-9 shrink-0 rounded-lg bg-white/5 p-1">
                      <Image src={item.icon} alt={item.label} fill className="object-contain" />
                    </span>
                    <span>
                      <strong className="block text-x-text">{item.label}</strong>
                      <span className="text-xs text-x-soft">{t(item.descKey)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <Link className="transition hover:text-x-text" href={withLocale("/pricing")}>
            {t("nav.pricing")}
          </Link>
          <Link className="transition hover:text-x-text" href={withLocale("/contact")}>
            {t("nav.contact")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <button className="btn-ghost flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-x-line text-[0.7rem]">
                🌐
              </span>
              {locale === "zh-Hant" ? t("nav.localeZh") : t("nav.localeEn")}
            </button>
            <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-40 translate-y-1 rounded-xl border border-x-line bg-x-surface p-2 text-sm opacity-0 shadow-deep transition group-hover:translate-y-0 group-hover:opacity-100 group-hover:pointer-events-auto">
              <div className="absolute left-0 -top-3 h-3 w-full" />
              <Link
                className="block w-full rounded-lg px-3 py-2 text-left text-x-text hover:bg-x-surface-2"
                href={switchLocale("zh-Hant")}
              >
                {t("nav.localeZh")}
              </Link>
              <Link
                className="block w-full rounded-lg px-3 py-2 text-left text-x-soft hover:bg-x-surface-2"
                href={switchLocale("en")}
              >
                {t("nav.localeEn")}
              </Link>
            </div>
          </div>
          <Link className="btn-primary" href={withLocale("/#products")}>
            {t("nav.download")}
          </Link>
        </div>
      </div>
    </header>
  );
}

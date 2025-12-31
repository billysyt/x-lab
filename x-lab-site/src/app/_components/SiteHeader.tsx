"use client";

import { useState } from "react";
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
];

export default function SiteHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const pathParts = pathname.split("/");
  const restPath = pathParts.length > 2 ? `/${pathParts.slice(2).join("/")}` : "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const withLocale = (path: string) => `/${locale}${path}`;
  const switchLocale = (target: string) => `/${target}${restPath || ""}`;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-30 border-b border-x-line bg-x-bg/80 backdrop-blur">
      <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-4 py-3 md:gap-6 md:py-4">
        {/* Logo */}
        <div className="flex flex-col gap-0.5 md:gap-1">
          <Link
            className="flex items-center gap-2 text-base font-semibold md:gap-3 md:text-lg"
            href={withLocale("/")}
          >
            <span className="relative h-7 w-7 md:h-8 md:w-8">
              <Image src="/x-lab-mark.svg" alt="X-Lab" fill className="object-contain" />
            </span>
            <span className="font-semibold tracking-tight">X-Lab</span>
          </Link>
          <span className="hidden text-[0.6rem] uppercase tracking-[0.35em] text-x-soft sm:block">
            {t("nav.suite")}
          </span>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-5 text-sm text-x-muted lg:flex">
          <div className="group relative">
            <button className="flex items-center gap-2 font-medium text-x-muted transition hover:text-x-text">
              {t("nav.products")}
              <span className="text-xs">▾</span>
            </button>
            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[320px] translate-y-1 rounded-2xl border border-x-line bg-x-surface p-4 opacity-0 shadow-deep transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="absolute -top-3 left-0 h-3 w-full" />
              <div className="grid gap-2">
                {PRODUCT_MENU.map((item) => (
                  <Link
                    key={item.key}
                    className="flex items-start gap-3 rounded-lg border-b border-x-line/60 px-2 py-2 transition last:border-b-0 hover:bg-x-surface-2/50"
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

        {/* Desktop Actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <div className="group relative">
            <button className="btn-ghost flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-x-line text-[0.7rem]">
                🌐
              </span>
              {locale === "zh-Hant" ? t("nav.localeZh") : t("nav.localeEn")}
            </button>
            <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-40 translate-y-1 rounded-xl border border-x-line bg-x-surface p-2 text-sm opacity-0 shadow-deep transition group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
              <div className="absolute -top-3 left-0 h-3 w-full" />
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

        {/* Mobile Actions */}
        <div className="flex items-center gap-2 lg:hidden">
          <Link
            className="btn-primary px-3 py-2 text-xs sm:px-4 sm:text-sm"
            href={withLocale("/#products")}
          >
            {t("nav.download")}
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-x-line text-x-text transition hover:bg-x-surface"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="border-t border-x-line bg-x-bg lg:hidden">
          <div className="mx-auto w-[min(1120px,92vw)] py-4">
            <nav className="flex flex-col gap-1">
              {/* Products Section */}
              <div className="mb-2">
                <span className="px-3 text-xs font-medium uppercase tracking-wider text-x-soft">
                  {t("nav.products")}
                </span>
                <div className="mt-2 space-y-1">
                  {PRODUCT_MENU.map((item) => (
                    <Link
                      key={item.key}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-x-surface"
                      href={withLocale("/#products")}
                      onClick={closeMobileMenu}
                    >
                      <span className="relative h-8 w-8 shrink-0">
                        <Image src={item.icon} alt={item.label} fill className="object-contain" />
                      </span>
                      <span>
                        <strong className="block text-sm text-x-text">{item.label}</strong>
                        <span className="text-xs text-x-soft">{t(item.descKey)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="my-2 border-t border-x-line" />

              {/* Other Links */}
              <Link
                className="rounded-xl px-3 py-3 text-sm text-x-text transition hover:bg-x-surface"
                href={withLocale("/pricing")}
                onClick={closeMobileMenu}
              >
                {t("nav.pricing")}
              </Link>
              <Link
                className="rounded-xl px-3 py-3 text-sm text-x-text transition hover:bg-x-surface"
                href={withLocale("/contact")}
                onClick={closeMobileMenu}
              >
                {t("nav.contact")}
              </Link>

              <div className="my-2 border-t border-x-line" />

              {/* Language Switcher */}
              <div className="px-3 py-2">
                <span className="text-xs font-medium uppercase tracking-wider text-x-soft">
                  Language
                </span>
                <div className="mt-2 flex gap-2">
                  <Link
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-center text-sm transition ${
                      locale === "zh-Hant"
                        ? "border-x-accent bg-x-accent/10 text-x-accent"
                        : "border-x-line text-x-muted hover:border-x-text/60"
                    }`}
                    href={switchLocale("zh-Hant")}
                    onClick={closeMobileMenu}
                  >
                    {t("nav.localeZh")}
                  </Link>
                  <Link
                    className={`flex-1 rounded-xl border px-4 py-2.5 text-center text-sm transition ${
                      locale === "en"
                        ? "border-x-accent bg-x-accent/10 text-x-accent"
                        : "border-x-line text-x-muted hover:border-x-text/60"
                    }`}
                    href={switchLocale("en")}
                    onClick={closeMobileMenu}
                  >
                    {t("nav.localeEn")}
                  </Link>
                </div>
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}

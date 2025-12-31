"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";

const PRODUCT_MENU = [
  {
    key: "caption",
    label: "X-Caption",
    icon: "/x-caption-logo.png",
    descKey: "menu.captionDesc",
  },
  {
    key: "minutes",
    label: "X-Minutes",
    icon: "/x-minutes-icon.png",
    descKey: "menu.minutesDesc",
  },
];

export default function SiteHeader() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const pathParts = pathname.split("/");
  const restPath = pathParts.length > 2 ? `/${pathParts.slice(2).join("/")}` : "";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedLocale, setSelectedLocale] = useState<"zh-Hant" | "en">(locale as "zh-Hant" | "en");

  const withLocale = (path: string) => `/${locale}${path}`;
  const switchLocale = (target: string) => `/${target}${restPath || ""}`;

  // Prevent body scroll when menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const handleLocaleChange = (newLocale: "zh-Hant" | "en") => {
    setSelectedLocale(newLocale);
    // Wait for animation to complete, then navigate and close
    setTimeout(() => {
      router.push(switchLocale(newLocale));
      closeMobileMenu();
    }, 300);
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-x-line bg-x-bg/80 backdrop-blur">
        <div className="mx-auto flex w-[min(1120px,92vw)] items-center justify-between gap-4 py-3 md:gap-6 md:py-4">
          {/* Logo */}
          <div className="flex flex-col gap-0.5 md:gap-1">
            <Link
              className="text-lg font-bold tracking-tight md:text-xl"
              href={withLocale("/")}
            >
              <span className="bg-gradient-to-r from-x-accent to-x-accent-2 bg-clip-text text-transparent">
                X-Lab
              </span>
              <span className="text-x-soft">.HK</span>
            </Link>
            <span className="hidden text-[0.55rem] uppercase tracking-[0.3em] text-x-soft sm:block">
              {t("nav.suite")}
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-5 text-sm text-x-muted lg:flex">
            <div className="group relative">
              <button className="flex items-center gap-2 font-medium text-x-muted transition hover:text-x-text">
                {t("nav.products")}
                <span className="text-xs transition-transform group-hover:rotate-180">▾</span>
              </button>
              <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[320px] translate-y-2 rounded-2xl border border-x-line bg-x-surface p-4 opacity-0 shadow-deep transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <div className="absolute -top-3 left-0 h-3 w-full" />
                <div className="grid gap-2">
                  {PRODUCT_MENU.map((item) => (
                    <Link
                      key={item.key}
                      className="flex items-start gap-3 rounded-lg border-b border-x-line/60 px-2 py-2 transition last:border-b-0 hover:bg-x-surface-2/50"
                      href={withLocale("/#products")}
                    >
                      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-x-line bg-x-surface-2 p-1 shadow-sm">
                        <Image src={item.icon} alt={item.label} fill className="rounded-lg object-contain" />
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
              <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-40 translate-y-2 rounded-xl border border-x-line bg-x-surface p-2 text-sm opacity-0 shadow-deep transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
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
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-x-line text-x-text transition hover:bg-x-surface"
              aria-label="Toggle menu"
            >
              <span
                className={`absolute h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${
                  mobileMenuOpen ? "rotate-45" : "-translate-y-1.5"
                }`}
              />
              <span
                className={`absolute h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${
                  mobileMenuOpen ? "opacity-0 scale-0" : "opacity-100 scale-100"
                }`}
              />
              <span
                className={`absolute h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${
                  mobileMenuOpen ? "-rotate-45" : "translate-y-1.5"
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 z-20 bg-x-bg/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMobileMenu}
      />

      {/* Mobile Menu Panel */}
      <div
        className={`fixed right-0 top-0 z-20 h-full w-[min(320px,85vw)] transform bg-x-bg shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Menu Header */}
          <div className="flex items-center justify-between border-b border-x-line px-5 py-4">
            <span className="text-sm font-medium text-x-soft">Menu</span>
            <button
              onClick={closeMobileMenu}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-x-soft transition hover:bg-x-surface hover:text-x-text"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Menu Content */}
          <div className="flex-1 overflow-y-auto px-4 py-5">
            {/* Products Section */}
            <div className="mb-6">
              <span className="px-2 text-[0.65rem] font-semibold uppercase tracking-widest text-x-soft">
                {t("nav.products")}
              </span>
              <div className="mt-3 space-y-1">
                {PRODUCT_MENU.map((item, index) => (
                  <Link
                    key={item.key}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                    href={withLocale("/#products")}
                    onClick={closeMobileMenu}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-x-line bg-x-surface-2 p-1 shadow-sm">
                      <Image src={item.icon} alt={item.label} fill className="rounded-lg object-contain" />
                    </span>
                    <span>
                      <strong className="block text-sm text-x-text">{item.label}</strong>
                      <span className="text-xs text-x-soft">{t(item.descKey)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Navigation Links */}
            <div className="mb-6 space-y-1">
              <Link
                className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-x-text transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                href={withLocale("/pricing")}
                onClick={closeMobileMenu}
              >
                {t("nav.pricing")}
              </Link>
              <Link
                className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-x-text transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                href={withLocale("/contact")}
                onClick={closeMobileMenu}
              >
                {t("nav.contact")}
              </Link>
            </div>

            {/* Language Slider */}
            <div className="rounded-2xl bg-x-surface p-4">
              <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-x-soft">
                Language
              </span>
              <div className="relative mt-3">
                {/* Slider Background */}
                <div className="flex rounded-xl bg-x-bg p-1">
                  {/* Sliding Indicator */}
                  <div
                    className="absolute top-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-lg bg-gradient-to-r from-x-accent/20 to-x-accent-2/20 border border-x-accent/30 transition-all duration-300 ease-out"
                    style={{
                      left: selectedLocale === "zh-Hant" ? "4px" : "calc(50%)",
                    }}
                  />
                  <button
                    className={`relative z-10 flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors duration-300 ${
                      selectedLocale === "zh-Hant" ? "text-x-accent" : "text-x-soft"
                    }`}
                    onClick={() => handleLocaleChange("zh-Hant")}
                  >
                    繁體中文
                  </button>
                  <button
                    className={`relative z-10 flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors duration-300 ${
                      selectedLocale === "en" ? "text-x-accent" : "text-x-soft"
                    }`}
                    onClick={() => handleLocaleChange("en")}
                  >
                    English
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Menu Footer */}
          <div className="border-t border-x-line px-5 py-4">
            <Link
              className="btn-primary flex w-full justify-center"
              href={withLocale("/#products")}
              onClick={closeMobileMenu}
            >
              {t("nav.download")}
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

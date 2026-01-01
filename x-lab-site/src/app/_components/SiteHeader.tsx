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
    descKey: "products.captionDesc",
  },
  {
    key: "minutes",
    label: "X-Minutes",
    icon: "/x-minutes-icon.png",
    descKey: "products.minutesDesc",
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
  const [scrolled, setScrolled] = useState(false);

  const withLocale = (path: string) => `/${locale}${path}`;
  const switchLocale = (target: string) => `/${target}${restPath || ""}`;

  const otherLocale = locale === "zh-Hant" ? "en" : "zh-Hant";

  // Detect scroll for header background
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  const handleLocaleSwitch = () => {
    router.push(switchLocale(otherLocale));
  };

  return (
    <>
      <header className={`sticky top-0 z-30 border-b transition-all duration-300 ${scrolled ? "border-x-line bg-x-bg/80 backdrop-blur" : "border-transparent"}`}>
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
              <button className="flex items-center gap-1.5 font-medium text-x-muted transition hover:text-x-text">
                {t("nav.products")}
                <svg className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 w-[380px] translate-y-2 rounded-2xl border border-x-line bg-x-surface p-3 opacity-0 shadow-deep transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
                <div className="absolute -top-3 left-0 h-3 w-full" />
                <div className="space-y-1">
                  {PRODUCT_MENU.map((item) => (
                    <Link
                      key={item.key}
                      className="flex items-start gap-3 rounded-xl p-3 transition hover:bg-x-surface-2/50"
                      href={withLocale("/#products")}
                    >
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-x-line bg-x-surface-2 p-1.5 shadow-sm">
                        <Image src={item.icon} alt={item.label} fill className="rounded-lg object-contain" />
                      </span>
                      <span className="flex-1 pt-0.5">
                        <strong className="block text-sm text-x-text">{item.label}</strong>
                        <span className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-x-soft">{t(item.descKey)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link className="transition hover:text-x-text" href={withLocale("/pricing")}>
              {t("nav.pricing")}
            </Link>
            <Link className="transition hover:text-x-text" href={withLocale("/faq")}>
              {t("nav.faq")}
            </Link>
            <Link className="transition hover:text-x-text" href={withLocale("/contact")}>
              {t("nav.contact")}
            </Link>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden items-center gap-2 lg:flex">
            {/* Language Dropdown */}
            <div className="group relative">
              <button
                className="flex h-9 items-center gap-1.5 rounded-full border border-x-line bg-x-surface px-3 text-xs font-medium text-x-muted transition hover:border-x-accent/50 hover:text-x-text"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
                <span>{locale === "zh-Hant" ? "繁中" : "EN"}</span>
                <svg className="h-3 w-3 transition-transform duration-200 group-hover:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {/* Invisible bridge to prevent gap issue */}
              <div className="absolute right-0 top-full h-3 w-full" />
              {/* Dropdown Menu */}
              <div className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-20 w-[180px] translate-y-2 rounded-2xl border border-x-line bg-x-surface p-2 opacity-0 shadow-deep transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100">
                <button
                  onClick={() => router.push(switchLocale("zh-Hant"))}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-x-muted transition-colors hover:bg-x-surface-2 hover:text-x-text"
                >
                  <span className="text-base">🇭🇰</span>
                  <span className="flex-1 text-left">繁體中文</span>
                  {locale === "zh-Hant" && (
                    <svg className="h-4 w-4 text-x-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => router.push(switchLocale("en"))}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-x-muted transition-colors hover:bg-x-surface-2 hover:text-x-text"
                >
                  <span className="text-base">🇺🇸</span>
                  <span className="flex-1 text-left">English</span>
                  {locale === "en" && (
                    <svg className="h-4 w-4 text-x-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
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
        className={`fixed inset-0 z-40 bg-x-bg/60 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          mobileMenuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeMobileMenu}
      />

      {/* Mobile Menu Panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[min(320px,85vw)] transform bg-x-bg shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
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
            <div className="mb-5">
              <span className="px-2 text-[0.65rem] font-semibold uppercase tracking-widest text-x-soft">
                {t("nav.products")}
              </span>
              <div className="mt-3 space-y-1">
                {PRODUCT_MENU.map((item) => (
                  <Link
                    key={item.key}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                    href={withLocale("/#products")}
                    onClick={closeMobileMenu}
                  >
                    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-x-line bg-x-surface-2 p-1 shadow-sm">
                      <Image src={item.icon} alt={item.label} fill className="rounded-lg object-contain" />
                    </span>
                    <span className="flex-1">
                      <strong className="block text-sm text-x-text">{item.label}</strong>
                      <span className="line-clamp-1 text-xs text-x-soft">{t(item.descKey)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Navigation Links */}
            <div className="space-y-1">
              <Link
                className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-x-text transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                href={withLocale("/pricing")}
                onClick={closeMobileMenu}
              >
                {t("nav.pricing")}
              </Link>
              <Link
                className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-x-text transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                href={withLocale("/faq")}
                onClick={closeMobileMenu}
              >
                {t("nav.faq")}
              </Link>
              <Link
                className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-x-text transition-all duration-200 hover:bg-x-surface active:scale-[0.98]"
                href={withLocale("/contact")}
                onClick={closeMobileMenu}
              >
                {t("nav.contact")}
              </Link>
            </div>

            {/* Language Switcher */}
            <div className="mt-5 border-t border-x-line pt-5">
              <span className="px-2 text-[0.65rem] font-semibold uppercase tracking-widest text-x-soft">
                {t("nav.localeZh") === "繁體中文" ? "語言" : "Language"}
              </span>
              <div className="mt-3 px-2">
                <div className="relative flex rounded-xl border border-x-line bg-x-surface p-1">
                  {/* Sliding background */}
                  <div
                    className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-x-accent/15 border border-x-accent/30 transition-all duration-300 ease-out ${
                      locale === "zh-Hant" ? "left-1" : "left-[calc(50%+2px)]"
                    }`}
                  />
                  <button
                    onClick={() => {
                      // Wait for slider animation to complete before navigating
                      setTimeout(() => {
                        router.push(switchLocale("zh-Hant"));
                        closeMobileMenu();
                      }, 300);
                    }}
                    className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors duration-200 ${
                      locale === "zh-Hant" ? "text-x-accent" : "text-x-muted"
                    }`}
                  >
                    <span>🇭🇰</span>
                    <span>繁中</span>
                  </button>
                  <button
                    onClick={() => {
                      // Wait for slider animation to complete before navigating
                      setTimeout(() => {
                        router.push(switchLocale("en"));
                        closeMobileMenu();
                      }, 300);
                    }}
                    className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium transition-colors duration-200 ${
                      locale === "en" ? "text-x-accent" : "text-x-muted"
                    }`}
                  >
                    <span>🇺🇸</span>
                    <span>EN</span>
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

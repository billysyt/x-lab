"use client";

import { useTranslations } from "next-intl";

type Section = {
  title: string;
  content: string;
};

export default function PrivacyPage() {
  const t = useTranslations();
  const sections = t.raw("privacyPage.sections") as Section[];

  return (
    <div className="relative">
      {/* Background elements */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute inset-0 grid-overlay opacity-20" />
        <div className="absolute -top-48 right-[-120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(122,168,255,0.25),transparent_60%)] blur-3xl" />
        <div className="absolute -left-40 top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(116,240,218,0.22),transparent_60%)] blur-3xl" />
      </div>

      <section className="mx-auto w-[min(800px,92vw)] pt-8 md:pt-16">
        {/* Header */}
        <div className="text-center">
          <div className="section-label">{t("privacyPage.label")}</div>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("privacyPage.title")}
          </h1>
          <p className="mt-4 text-sm text-x-muted sm:text-base md:text-lg">
            {t("privacyPage.desc")}
          </p>
          <p className="mt-2 text-xs text-x-soft">
            {t("privacyPage.lastUpdated")}
          </p>
        </div>

        {/* Content Sections */}
        <div className="mt-10 space-y-6 md:mt-14">
          {sections.map((section, index) => (
            <div
              key={index}
              className="rounded-2xl border border-x-line bg-x-surface p-5 sm:p-6"
            >
              <h2 className="text-base font-semibold text-x-text sm:text-lg">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-x-muted sm:text-base">
                {section.content}
              </p>
            </div>
          ))}
        </div>

        {/* Contact CTA */}
        <div className="mt-12 rounded-2xl border border-x-line bg-x-surface p-6 text-center md:mt-16 md:p-8">
          <h2 className="text-lg font-semibold text-x-text sm:text-xl">
            {t("contact.title")}
          </h2>
          <p className="mt-2 text-sm text-x-muted">
            {t("contact.desc")}
          </p>
          <a
            href={`/${t("nav.localeZh") === "繁體中文" ? "zh-Hant" : "en"}/contact`}
            className="btn-primary mt-5 inline-flex"
          >
            {t("contact.cta")}
          </a>
        </div>
      </section>
    </div>
  );
}

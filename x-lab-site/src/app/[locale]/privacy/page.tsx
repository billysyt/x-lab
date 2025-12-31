"use client";

import { useLocale, useTranslations } from "next-intl";
import ContactCTA from "../../_components/ContactCTA";

type Section = {
  title: string;
  content: string;
};

export default function PrivacyPage() {
  const t = useTranslations();
  const locale = useLocale();
  const sections = t.raw("privacyPage.sections") as Section[];
  const withLocale = (path: string) => `/${locale}${path}`;

  return (
    <div className="relative">
      <section className="mx-auto w-[min(800px,92vw)] pt-8 md:pt-16">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("privacyPage.title")}
          </h1>
          <p className="mt-4 text-sm text-x-muted sm:text-base">
            {t("privacyPage.lastUpdated")}
          </p>
        </div>

        {/* Content Sections - Long form */}
        <div className="mt-8 space-y-8 md:mt-12 md:space-y-10">
          {sections.map((section, index) => (
            <div key={index}>
              <h2 className="text-lg font-semibold text-x-text sm:text-xl">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-x-muted sm:text-base sm:leading-loose">
                {section.content}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact CTA */}
      <section className="mx-auto my-6 w-[min(800px,92vw)] md:my-16">
        <ContactCTA
          label={t("contact.label")}
          title={t("contact.title")}
          desc={t("contact.desc")}
          cta={t("contact.cta")}
          contactPath={withLocale("/contact")}
        />
      </section>
    </div>
  );
}

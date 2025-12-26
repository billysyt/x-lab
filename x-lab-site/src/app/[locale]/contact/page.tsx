import { getTranslations } from "next-intl/server";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage" });
  const contactRows = [
    {
      key: "email",
      label: t("emailLabel"),
      title: t("emailTitle"),
      desc: t("emailDesc"),
      href: "mailto:hello@x-lab.ai",
    },
    {
      key: "language",
      label: t("languageLabel"),
      title: t("languageTitle"),
      desc: t("languageDesc"),
    },
    {
      key: "office",
      label: t("officeLabel"),
      title: t("officeTitle"),
      desc: t("officeDesc"),
    },
    {
      key: "hours",
      label: t("hoursLabel"),
      title: t("hoursTitle"),
      desc: t("hoursDesc"),
    },
    {
      key: "security",
      label: t("securityLabel"),
      title: t("securityTitle"),
      desc: t("securityDesc"),
    },
  ];

  return (
    <div className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-14 py-12">
      <section className="space-y-4">
        <div className="section-label">{t("label")}</div>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          {t("title")}
        </h1>
        <p className="text-base text-x-muted md:text-lg">{t("desc")}</p>
      </section>

      <section className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="section-label">{t("detailsLabel")}</div>
          <h2 className="mt-3 text-2xl font-semibold">{t("detailsTitle")}</h2>
          <p className="mt-3 text-sm text-x-muted">{t("detailsDesc")}</p>
          <div className="mt-6 border-t border-x-line">
            {contactRows.map((row) => (
              <div key={row.key} className="flex flex-col gap-2 border-b border-x-line/60 py-5">
                <div className="text-xs uppercase tracking-[0.3em] text-x-soft">{row.label}</div>
                {row.href ? (
                  <a
                    className="text-lg font-semibold text-x-text transition hover:text-x-accent"
                    href={row.href}
                  >
                    {row.title}
                  </a>
                ) : (
                  <div className="text-lg font-semibold text-x-text">{row.title}</div>
                )}
                <div className="text-sm text-x-muted">{row.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-label">{t("mapTag")}</div>
          <h2 className="mt-3 text-2xl font-semibold">{t("mapTitle")}</h2>
          <p className="mt-3 text-sm text-x-muted">{t("mapDesc")}</p>
          <div className="mt-6 h-[420px] w-full overflow-hidden border-y border-x-line">
            <iframe
              title={t("mapTitle")}
              src="https://www.google.com/maps?q=Central%20District%20Hong%20Kong&output=embed"
              className="h-full w-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
          <div className="mt-3 text-xs uppercase tracking-[0.35em] text-x-soft">{t("mapCity")}</div>
          <div className="mt-2 text-sm text-x-muted">{t("mapDistrict")}</div>
        </div>
      </section>
    </div>
  );
}

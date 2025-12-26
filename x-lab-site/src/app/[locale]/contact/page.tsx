import { getTranslations } from "next-intl/server";

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contactPage" });

  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 grid-overlay opacity-20" />
        <div className="absolute -top-52 right-[-200px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(122,168,255,0.35),transparent_60%)] blur-3xl" />
        <div className="absolute -left-32 top-32 h-[440px] w-[440px] rounded-full bg-[radial-gradient(circle,rgba(116,240,218,0.28),transparent_60%)] blur-3xl" />
        <img
          src="/space-hero.svg"
          alt=""
          className="absolute -right-24 top-20 w-[420px] opacity-35 animate-[drift_18s_ease-in-out_infinite]"
        />
        <img
          src="/contact-orbit.svg"
          alt=""
          className="absolute -left-24 -top-20 w-[380px] opacity-60 animate-[orbit_28s_linear_infinite]"
        />
        <div className="absolute left-24 top-24 h-2 w-2 animate-[twinkle_4s_ease-in-out_infinite] rounded-full bg-white/70" />
        <div className="absolute right-32 top-48 h-1.5 w-1.5 animate-[twinkle_6s_ease-in-out_infinite] rounded-full bg-white/70" />
        <div className="absolute left-1/2 top-32 h-24 w-[2px] bg-gradient-to-b from-transparent via-x-accent/60 to-transparent animate-[scan_7s_ease-in-out_infinite]" />
      </div>

      <div className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-12 py-14">
        <section className="space-y-4">
          <div className="section-label">{t("label")}</div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {t("title")}
          </h1>
          <p className="text-base text-x-muted md:text-lg">{t("desc")}</p>
        </section>

        <section className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="section-label">{t("formLabel")}</div>
            <h2 className="mt-3 text-2xl font-semibold">{t("formTitle")}</h2>
            <p className="mt-2 text-sm text-x-muted">{t("formDesc")}</p>
            <form
              className="mt-6 space-y-6 border-t border-x-line/60 pt-6"
              action="mailto:hello@x-lab.ai"
              method="post"
              encType="text/plain"
            >
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
                  {t("fieldName")}
                </label>
                <input
                  className="w-full border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
                  name="name"
                  placeholder={t("fieldNamePlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
                  {t("fieldEmail")}
                </label>
                <input
                  className="w-full border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
                  name="email"
                  type="email"
                  placeholder={t("fieldEmailPlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.3em] text-x-soft">
                  {t("fieldMessage")}
                </label>
                <textarea
                  className="min-h-[140px] w-full resize-none border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
                  name="message"
                  placeholder={t("fieldMessagePlaceholder")}
                  required
                />
              </div>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button className="btn-primary" type="submit">
                  {t("submit")}
                </button>
                <span className="text-xs text-x-soft">{t("formNote")}</span>
              </div>
            </form>
          </div>

          <div>
            <div className="section-label">{t("contactLabel")}</div>
            <h2 className="mt-3 text-2xl font-semibold">{t("contactTitle")}</h2>
            <p className="mt-2 text-sm text-x-muted">{t("contactDesc")}</p>
            <div className="mt-6 border-t border-x-line/60 pt-6">
              <div className="text-xs uppercase tracking-[0.3em] text-x-soft">{t("emailLabel")}</div>
              <a
                className="mt-3 block text-lg font-semibold text-x-text transition hover:text-x-accent"
                href="mailto:hello@x-lab.ai"
              >
                {t("emailTitle")}
              </a>
              <p className="mt-2 text-sm text-x-muted">{t("emailDesc")}</p>
            </div>
            <div className="mt-8 border-t border-x-line/60 pt-6">
              <div className="text-xs uppercase tracking-[0.3em] text-x-soft">{t("wechatLabel")}</div>
              <div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <img
                  src="/wechat-group-qr.svg"
                  alt={t("wechatAlt")}
                  className="h-40 w-40 border border-x-line/60 bg-x-surface/40 p-3 shadow-glow-sm"
                />
                <div>
                  <div className="text-base font-semibold">{t("wechatTitle")}</div>
                  <p className="mt-2 text-sm text-x-muted">{t("wechatDesc")}</p>
                </div>
              </div>
            </div>
            <div className="mt-8 border-t border-x-line/60 pt-6">
              <div className="text-xs uppercase tracking-[0.3em] text-x-soft">{t("languageLabel")}</div>
              <div className="mt-3 text-lg font-semibold text-x-text">{t("languageTitle")}</div>
              <p className="mt-2 text-sm text-x-muted">{t("languageDesc")}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

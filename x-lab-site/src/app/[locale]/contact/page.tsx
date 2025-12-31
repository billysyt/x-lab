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
      {/* Page-specific decorations */}
      <div className="pointer-events-none absolute inset-0 -z-10">
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
        <div className="absolute left-1/2 top-32 h-24 w-[2px] bg-gradient-to-b from-transparent via-x-accent/60 to-transparent animate-[scan_7s_ease-in-out_infinite]" />
      </div>

      <div className="mx-auto flex w-[min(1120px,92vw)] flex-col gap-12 py-14">
        <section className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {t("title")}
          </h1>
          <p className="text-base text-x-muted md:text-lg">{t("desc")}</p>
        </section>

        <section className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <form
              className="space-y-6"
              action="mailto:hello@x-lab.hk"
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
                  className="min-h-[80px] w-full resize-none border-b border-x-line/60 bg-transparent pb-3 text-base text-x-text transition focus:border-x-accent focus:outline-none"
                  name="message"
                  placeholder={t("fieldMessagePlaceholder")}
                  rows={2}
                  required
                />
              </div>
              <div className="pt-2">
                <button className="btn-primary" type="submit">
                  {t("submit")}
                </button>
              </div>
            </form>
          </div>

          <div>
            {/* Mobile & Tablet: Email and WeChat in same row, Desktop: stacked */}
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-1 lg:gap-0">
              <div>
                <div className="text-xs uppercase tracking-[0.3em] text-x-soft">{t("emailLabel")}</div>
                <a
                  className="mt-3 block text-base font-semibold text-x-text transition hover:text-x-accent lg:text-lg"
                  href="mailto:hello@x-lab.hk"
                >
                  {t("emailTitle")}
                </a>
              </div>
              <div className="lg:mt-8 lg:border-t lg:border-x-line/60 lg:pt-6">
                <div className="text-xs uppercase tracking-[0.3em] text-x-soft">{t("wechatLabel")}</div>
                <div className="mt-3 lg:mt-4">
                  <img
                    src="/wechat-group-qr.svg"
                    alt={t("wechatAlt")}
                    className="h-28 w-28 border border-x-line/60 bg-x-surface/40 p-2 shadow-glow-sm lg:h-40 lg:w-40 lg:p-3"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

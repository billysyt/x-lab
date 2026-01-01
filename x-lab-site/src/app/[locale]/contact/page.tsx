import { getTranslations } from "next-intl/server";
import ContactForm from "./ContactForm";

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
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -right-40 top-0 h-[600px] w-[600px] bg-gradient-radial from-x-accent/5 via-transparent to-transparent blur-3xl" />
        <div className="absolute -left-40 top-20 h-[500px] w-[500px] bg-gradient-radial from-x-accent/8 via-x-accent/3 to-transparent blur-3xl animate-pulse-slow" />
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
            <ContactForm />
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
                  <div className="inline-flex h-32 w-32 items-center justify-center rounded-2xl bg-white p-3 shadow-[0_18px_35px_rgba(0,0,0,0.35)] lg:h-44 lg:w-44 lg:p-4">
                    <img
                      src="/wechat-qrcode.png"
                      alt={t("wechatAlt")}
                      className="h-full w-full object-contain"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

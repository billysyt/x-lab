"use client";

import { useTranslations, useLocale } from "next-intl";
import Image from "next/image";
import ContactCTA from "../../_components/ContactCTA";

export default function PremiumPage() {
  const t = useTranslations();
  const locale = useLocale();
  const withLocale = (path: string) => `/${locale}${path}`;

  const handlePaymentClick = () => {
    alert(locale === "zh-Hant"
      ? "請聯絡我們取得最新戶口資訊"
      : "Please contact us for the latest account information"
    );
  };

  return (
    <div className="relative">
      <div className="mx-auto w-[min(900px,92vw)] py-8 md:py-16">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-x-accent/30 bg-x-accent/10 px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-x-accent">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Premium
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("premiumPage.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-x-muted sm:text-base">
            {t("premiumPage.subtitle")}
          </p>
        </div>

        {/* Stepper */}
        <div className="mt-12 md:mt-16">
          {/* Step 1 */}
          <div className="relative">
            {/* Connector line - starts below the number box */}
            <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-gradient-to-b from-x-accent/50 to-x-line md:left-8 md:top-20" />

            <div className="relative flex gap-4 pb-12 md:gap-6 md:pb-16">
              {/* Step number */}
              <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-x-accent/50 bg-x-bg text-lg font-bold text-x-accent shadow-glow-sm md:h-16 md:w-16 md:text-xl">
                1
              </div>

              {/* Step content */}
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-semibold text-x-text md:text-xl">
                  {t("premiumPage.step1.title")}
                </h3>
                <p className="mt-1 text-sm text-x-muted">
                  {t("premiumPage.step1.desc")}
                </p>
                <div className="mt-4 rounded-2xl border border-x-line bg-x-surface p-4 md:p-6">
                  <div className="space-y-4">
                    <p className="text-sm text-x-muted">{t("premiumPage.step1.instruction")}</p>
                    {/* Step 1 Screenshot */}
                    <div className="relative w-full overflow-hidden rounded-xl shadow-lg">
                      <Image
                        src="/premium/step1.png"
                        alt="Machine code location"
                        width={720}
                        height={574}
                        quality={100}
                        className="w-full h-auto"
                      />
                    </div>
                    {/* Contact buttons */}
                    <div className="flex flex-wrap gap-3">
                      <a
                        href="https://wa.me/85268023586?text=%E6%88%91%E9%9C%80%E8%A6%81%E5%8D%87%E7%B4%9AX-Lab%20Premium"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-x-line bg-x-surface px-4 py-2.5 text-sm font-medium text-x-text transition hover:border-x-accent/50 hover:bg-x-surface-2"
                      >
                        <svg className="h-5 w-5 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        6802 3586
                      </a>
                      <a
                        href="#"
                        onClick={(e) => e.preventDefault()}
                        className="inline-flex items-center gap-2 rounded-xl border border-x-line bg-x-surface px-4 py-2.5 text-sm font-medium text-x-text transition hover:border-x-accent/50 hover:bg-x-surface-2"
                      >
                        <svg className="h-5 w-5 text-[#07C160]" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.032zm-2.953 3.12c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z"/>
                        </svg>
                        ixtcarder
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative">
            {/* Connector line */}
            <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-gradient-to-b from-x-accent/50 to-x-line md:left-8 md:top-20" />

            <div className="relative flex gap-4 pb-12 md:gap-6 md:pb-16">
              {/* Step number */}
              <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-x-accent/50 bg-x-bg text-lg font-bold text-x-accent shadow-glow-sm md:h-16 md:w-16 md:text-xl">
                2
              </div>

              {/* Step content */}
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-semibold text-x-text md:text-xl">
                  {t("premiumPage.step2.title")}
                </h3>
                <p className="mt-1 text-sm text-x-muted">
                  {t("premiumPage.step2.desc")}
                </p>
                <div className="mt-4 rounded-2xl border border-x-line bg-x-surface p-4 md:p-6">
                  <div className="space-y-4">
                    {/* Price display */}
                    <div className="rounded-xl border border-x-accent/30 bg-x-accent/5 p-4">
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-x-accent">HK$155</span>
                        <span className="text-sm text-x-muted">($19 USD)</span>
                      </div>
                      <p className="mt-1 text-xs text-x-soft">{t("premiumPage.step2.priceNote")}</p>
                    </div>
                    {/* Payment methods */}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <button
                        onClick={handlePaymentClick}
                        className="group flex cursor-pointer flex-col items-center rounded-xl border border-x-line bg-x-surface p-4 text-center transition hover:border-x-accent/50 hover:bg-x-surface-2"
                      >
                        <div className="flex flex-1 items-center justify-center">
                          {/* FPS Icon - Faster Payment System HK */}
                          <Image
                            src="/payment/fps.png"
                            alt="FPS Payment"
                            width={120}
                            height={60}
                            className="h-12 w-auto object-contain"
                          />
                        </div>
                        <p className="mt-5 text-sm font-medium text-x-text">{t("premiumPage.step2.fps")}</p>
                      </button>
                      <button
                        onClick={handlePaymentClick}
                        className="group flex cursor-pointer flex-col items-center rounded-xl border border-x-line bg-x-surface p-4 text-center transition hover:border-x-accent/50 hover:bg-x-surface-2"
                      >
                        <div className="flex flex-1 items-center justify-center">
                          {/* PayMe Icon - HSBC PayMe */}
                          <Image
                            src="/payment/payme.png"
                            alt="PayMe Payment"
                            width={200}
                            height={150}
                            className="h-30 w-auto object-contain"
                          />
                        </div>
                        <p className="mt-5 text-sm font-medium text-x-text">{t("premiumPage.step2.payme")}</p>
                      </button>
                      <button
                        onClick={handlePaymentClick}
                        className="group flex cursor-pointer flex-col items-center rounded-xl border border-x-line bg-x-surface p-4 text-center transition hover:border-x-accent/50 hover:bg-x-surface-2"
                      >
                        <div className="flex flex-1 items-center justify-center">
                          {/* Alipay HK Icon */}
                          <Image
                            src="/payment/alipay.png"
                            alt="Alipay Payment"
                            width={80}
                            height={60}
                            className="h-12 w-auto object-contain"
                          />
                        </div>
                        <p className="mt-5 text-sm font-medium text-x-text">{t("premiumPage.step2.alipay")}</p>
                      </button>
                    </div>
                    <p className="text-xs text-x-muted">{t("premiumPage.step2.paymentNote")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative">
            <div className="relative flex gap-4 pb-12 md:gap-6 md:pb-16">
              {/* Step number */}
              <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-x-accent/50 bg-x-bg text-lg font-bold text-x-accent shadow-glow-sm md:h-16 md:w-16 md:text-xl">
                3
              </div>

              {/* Step content */}
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-semibold text-x-text md:text-xl">
                  {t("premiumPage.step3.title")}
                </h3>
                <p className="mt-1 text-sm text-x-muted">
                  {t("premiumPage.step3.desc")}
                </p>
                <div className="mt-4 rounded-2xl border border-x-line bg-x-surface p-4 md:p-6">
                  <div className="space-y-4">
                    <p className="text-sm text-x-muted">{t("premiumPage.step3.instruction")}</p>
                    {/* Step 3 Screenshot */}
                    <div className="relative w-full overflow-hidden rounded-xl shadow-lg">
                      <Image
                        src="/premium/step3.png"
                        alt="Activation location"
                        width={719}
                        height={573}
                        quality={100}
                        className="w-full h-auto"
                      />
                    </div>
                    <div className="rounded-xl border border-x-line bg-x-surface-2 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-x-accent/10">
                          <svg className="h-4 w-4 text-x-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-x-text">{t("premiumPage.step3.tipTitle")}</p>
                          <p className="mt-1 text-xs text-x-muted">{t("premiumPage.step3.tipDesc")}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact CTA */}
        <ContactCTA
          label={t("contact.label")}
          title={t("contact.title")}
          desc={t("contact.desc")}
          cta={t("contact.cta")}
          contactPath={withLocale("/contact")}
        />
      </div>
    </div>
  );
}
